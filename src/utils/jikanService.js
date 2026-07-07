/**
 * Jikan API Service with IndexedDB Caching & Background Downloader
 * 
 * Fetches episode data (titles, synopsis, filler/recap flags, MAL scores)
 * from the Jikan API v4 and caches everything in IndexedDB.
 * 
 * Background downloader runs continuously until all episodes are fetched,
 * with smart refresh policy:
 * - Episodes aired < 3 months ago: refresh weekly
 * - Episodes aired >= 3 months ago: cached permanently
 */

// ============================================
// CONSTANTS
// ============================================
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4'
const API_DELAY_MS = 350           // ~2.8 req/s (under 3 req/s limit)
const RETRY_MAX = 3
const RETRY_BASE_MS = 1000         // Exponential backoff base
const DB_NAME = 'jikan_cache'
const DB_VERSION = 2               // v2: added STORE_CHARACTERS
const FRESH_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000  // 3 months in ms
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000   // 7 days in ms
// Store names
const STORE_EPISODE_LISTS = 'episode_lists'
const STORE_EPISODE_DETAILS = 'episode_details'
const STORE_DOWNLOAD_PROGRESS = 'download_progress'
const STORE_CHARACTERS = 'characters'

// Cancellation flag
let _downloadCancelled = false
let _downloadRunning = false

// ============================================
// INDEXEDDB SETUP
// ============================================

let _dbInstance = null

/**
 * Open (or create) the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    if (_dbInstance) return Promise.resolve(_dbInstance)

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            const db = event.target.result
            if (!db.objectStoreNames.contains(STORE_EPISODE_LISTS)) {
                db.createObjectStore(STORE_EPISODE_LISTS, { keyPath: 'malId' })
            }
            if (!db.objectStoreNames.contains(STORE_EPISODE_DETAILS)) {
                db.createObjectStore(STORE_EPISODE_DETAILS, { keyPath: 'key' })
            }
            if (!db.objectStoreNames.contains(STORE_DOWNLOAD_PROGRESS)) {
                db.createObjectStore(STORE_DOWNLOAD_PROGRESS, { keyPath: 'id' })
            }
            if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
                db.createObjectStore(STORE_CHARACTERS, { keyPath: 'malId' })
            }
        }

        request.onsuccess = (event) => {
            _dbInstance = event.target.result
            resolve(_dbInstance)
        }

        request.onerror = (event) => {
            console.error('[Jikan] IndexedDB open error:', event.target.error)
            reject(event.target.error)
        }
    })
}

// ============================================
// INDEXEDDB CRUD HELPERS
// ============================================

/**
 * Get a value from an IndexedDB store
 * @param {string} storeName
 * @param {string|number} key
 * @returns {Promise<any|null>}
 */
async function dbGet(storeName, key) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const request = store.get(key)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
    })
}

/**
 * Put a value into an IndexedDB store
 * @param {string} storeName
 * @param {object} value - Must contain the keyPath field
 * @returns {Promise<void>}
 */
async function dbPut(storeName, value) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        const request = store.put(value)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Extract MAL ID from a MAL URL
 * @param {string} malUrl - e.g. "https://myanimelist.net/anime/40748/Jujutsu_Kaisen"
 * @returns {number|null}
 */
export function extractMalId(malUrl) {
    if (!malUrl) return null
    const match = malUrl.match(/\/anime\/(\d+)/)
    return match ? parseInt(match[1], 10) : null
}

/**
 * Promise-based delay for rate limiting
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// ---- Globální rate-limiter s prioritní frontou ------------------------------
// Všechny requesty na Jikan (downloader epizod, downloader postav i načítání
// na hover) procházejí jednou prioritní frontou s minimálním rozestupem
// API_DELAY_MS. Požadavky vyvolané interakcí uživatele (hover, detail stránky)
// mají prioritu 'high' a předbíhají downloader běžící na pozadí ('low').
let _lastRequestAt = 0
const _requestQueue = []
let _queueProcessing = false

function processQueue() {
    if (_queueProcessing) return
    if (_requestQueue.length === 0) return

    _queueProcessing = true

    // Seřadit frontu: priorita 'high' jde dopředu
    _requestQueue.sort((a, b) => {
        const pA = a.priority === 'high' ? 1 : 0
        const pB = b.priority === 'high' ? 1 : 0
        return pB - pA
    })

    const item = _requestQueue.shift()
    const now = Date.now()
    const timeSinceLast = now - _lastRequestAt
    const wait = Math.max(0, API_DELAY_MS - timeSinceLast)

    setTimeout(() => {
        _lastRequestAt = Date.now()
        item.resolve()
        _queueProcessing = false
        processQueue()
    }, wait)
}

function acquireRequestSlot(priority = 'low') {
    return new Promise((resolve) => {
        _requestQueue.push({ priority, resolve })
        processQueue()
    })
}

/**
 * Fetch with retry and exponential backoff (prochází globálním rate-limiterem)
 * @param {string} url
 * @param {number} retries
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, retries = RETRY_MAX, priority = 'low') {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            await acquireRequestSlot(priority)
            const response = await fetch(url)

            // Rate limited — wait and retry
            if (response.status === 429) {
                const waitMs = RETRY_BASE_MS * Math.pow(2, attempt)
                console.warn(`[Jikan] Rate limited (429). Waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`)
                await delay(waitMs)
                continue
            }

            // Not found — don't retry
            if (response.status === 404) {
                return null
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            return await response.json()
        } catch (error) {
            if (attempt === retries) {
                console.error(`[Jikan] Failed after ${retries + 1} attempts:`, url, error.message)
                return null
            }
            const waitMs = RETRY_BASE_MS * Math.pow(2, attempt)
            console.warn(`[Jikan] Attempt ${attempt + 1} failed. Retrying in ${waitMs}ms...`)
            await delay(waitMs)
        }
    }
    return null
}

// ============================================
// JIKAN API FETCH FUNCTIONS
// ============================================

/**
 * Fetch episode list from Jikan (paginated)
 * Endpoint: GET /anime/{id}/episodes?page=N
 * Returns: array of { mal_id, title, title_japanese, aired, score, filler, recap, url, forum_url }
 * 
 * @param {number} malId
 * @returns {Promise<object[]|null>}
 */
async function fetchEpisodeListFromAPI(malId, priority = 'low') {
    const allEpisodes = []
    let page = 1
    let hasNextPage = true

    while (hasNextPage) {
        const data = await fetchWithRetry(`${JIKAN_BASE_URL}/anime/${malId}/episodes?page=${page}`, RETRY_MAX, priority)

        if (!data || !data.data) {
            if (page === 1) return null // No data at all
            break
        }

        allEpisodes.push(...data.data)

        hasNextPage = data.pagination?.has_next_page || false
        page++

        if (hasNextPage) {
            await delay(API_DELAY_MS)
        }
    }

    return allEpisodes
}

/**
 * Fetch single episode detail from Jikan
 * Endpoint: GET /anime/{id}/episodes/{ep}
 * Returns: { synopsis, title, title_japanese, duration, aired, filler, recap }
 * 
 * @param {number} malId
 * @param {number} epNum
 * @returns {Promise<object|null>}
 */
async function fetchEpisodeDetailFromAPI(malId, epNum, priority = 'low') {
    const data = await fetchWithRetry(`${JIKAN_BASE_URL}/anime/${malId}/episodes/${epNum}`, RETRY_MAX, priority)

    if (!data || !data.data) return null

    return data.data
}

// ============================================
// CACHED READ FUNCTIONS (for UI)
// ============================================

/**
 * Get cached episode list from IndexedDB
 * @param {number} malId
 * @returns {Promise<object|null>} - { malId, episodes: [...], fetchedAt }
 */
export async function getCachedEpisodeList(malId) {
    try {
        return await dbGet(STORE_EPISODE_LISTS, malId)
    } catch (e) {
        console.warn('[Jikan] Failed to read episode list from cache:', e)
        return null
    }
}

/**
 * Get episode list from cache, or fetch from Jikan API if missing/stale
 * @param {number} malId
 * @returns {Promise<object[]|null>}
 */
export async function getOrFetchEpisodeList(malId) {
    if (!malId) return null
    const cached = await getCachedEpisodeList(malId)
    
    // Invalidate cache if older than 24 hours (86400000 ms)
    const CACHE_TTL = 24 * 60 * 60 * 1000;
    const isExpired = cached && cached.fetchedAt && (Date.now() - cached.fetchedAt > CACHE_TTL);

    if (cached && cached.episodes && cached.episodes.length > 0 && !isExpired) {
        return cached.episodes
    }
    
    // Fetch from Jikan API
    const apiEpisodes = await fetchEpisodeListFromAPI(malId)
    if (apiEpisodes && apiEpisodes.length > 0) {
        const episodes = apiEpisodes.map(ep => ({
            mal_id: ep.mal_id,
            title: ep.title || ep.title_japanese || `Episode ${ep.mal_id}`,
            title_japanese: ep.title_japanese || null,
            aired: ep.aired || null,
            score: ep.score || null,
            filler: ep.filler || false,
            recap: ep.recap || false,
            url: ep.url || null,
            forum_url: ep.forum_url || null
        }))
        
        await dbPut(STORE_EPISODE_LISTS, {
            malId,
            episodes,
            fetchedAt: Date.now()
        })
        return episodes
    }
    return null
}

/**
 * Get cached episode synopsis/detail from IndexedDB
 * @param {number} malId
 * @param {number} epNum
 * @returns {Promise<object|null>} - { key, malId, epNum, title, synopsis, duration, aired, ... }
 */
export async function getCachedEpisodeSynopsis(malId, epNum) {
    try {
        const key = `${malId}_${epNum}`
        return await dbGet(STORE_EPISODE_DETAILS, key)
    } catch (e) {
        console.warn('[Jikan] Failed to read episode detail from cache:', e)
        return null
    }
}

/**
 * Get the current download progress
 * @returns {Promise<object|null>}
 */
export async function getDownloadProgress() {
    try {
        return await dbGet(STORE_DOWNLOAD_PROGRESS, 'status')
    } catch {
        return null
    }
}

// ============================================
// REFRESH POLICY
// ============================================

/**
 * Determine if an episode detail should be refreshed
 * @param {object|null} cachedDetail - existing cached data (or null if not cached)
 * @param {string|null} airedDate - ISO date string of when episode aired
 * @returns {boolean}
 */
function shouldRefreshEpisode(cachedDetail, airedDate) {
    // Never cached → must fetch
    if (!cachedDetail) return true

    // No aired date info → don't refresh if we have data
    if (!airedDate) return false

    const now = Date.now()
    const aired = new Date(airedDate).getTime()
    const age = now - aired

    // Episode aired less than 3 months ago → check weekly refresh
    if (age < FRESH_THRESHOLD_MS) {
        const lastRefresh = cachedDetail.lastRefreshedAt || cachedDetail.fetchedAt || 0
        const timeSinceRefresh = now - lastRefresh
        return timeSinceRefresh > REFRESH_INTERVAL_MS
    }

    // Episode aired 3+ months ago → never refresh
    return false
}

// ============================================
// BACKGROUND DOWNLOADER
// ============================================

/**
 * Save download progress to IndexedDB
 */
async function saveDownloadProgress(progress) {
    try {
        await dbPut(STORE_DOWNLOAD_PROGRESS, { id: 'status', ...progress })
    } catch (e) {
        // Non-critical, just log
        console.warn('[Jikan] Failed to save progress:', e)
    }
}

/**
 * Start the background download process
 * Downloads ALL episode data for all anime in the list.
 * Can be resumed after page refresh.
 * 
 * @param {object[]} animeList - Array of anime objects with mal_url field
 * @param {function} [onProgress] - Optional callback: ({ animeName, animeIdx, totalAnime, epIdx, totalEps, state }) => void
 * @returns {Promise<void>}
 */
export async function startBackgroundDownload(animeList, onProgress) {
    if (_downloadRunning) {
        console.log('[Jikan] Download already running, skipping.')
        return
    }

    _downloadRunning = true
    _downloadCancelled = false

    try {
        await openDB()
    } catch (e) {
        console.error('[Jikan] Cannot open IndexedDB, aborting download:', e)
        _downloadRunning = false
        return
    }

    // Filter anime that have mal_url
    const downloadQueue = animeList
        .filter(a => a.mal_url)
        .map(a => ({
            name: a.name,
            malId: extractMalId(a.mal_url),
            episodeCount: a.episodes || 0
        }))
        .filter(a => a.malId !== null && a.episodeCount > 0)

    const totalAnime = downloadQueue.length

    // Load saved progress to resume
    const savedProgress = await getDownloadProgress()
    let startAnimeIdx = 0

    if (savedProgress && savedProgress.state === 'running' && savedProgress.lastMalId) {
        const resumeIdx = downloadQueue.findIndex(a => a.malId === savedProgress.lastMalId)
        if (resumeIdx >= 0) {
            startAnimeIdx = resumeIdx
            console.log(`[Jikan] Resuming from anime ${startAnimeIdx + 1}/${totalAnime}: ${downloadQueue[resumeIdx].name}`)
        }
    }

    console.log(`[Jikan] Background download starting. ${totalAnime} anime to process (starting from #${startAnimeIdx + 1}).`)

    for (let i = startAnimeIdx; i < totalAnime; i++) {
        if (_downloadCancelled) {
            console.log('[Jikan] Download cancelled.')
            await saveDownloadProgress({ state: 'paused', lastMalId: downloadQueue[i].malId, animeIdx: i, totalAnime })
            break
        }

        const anime = downloadQueue[i]

        // --- Step 1: Fetch episode list ---
        let cachedList = await getCachedEpisodeList(anime.malId)
        let episodes = cachedList?.episodes || null

        if (!episodes) {
            const apiEpisodes = await fetchEpisodeListFromAPI(anime.malId, 'low')
            await delay(API_DELAY_MS)

            if (apiEpisodes && apiEpisodes.length > 0) {
                episodes = apiEpisodes.map(ep => ({
                    mal_id: ep.mal_id,
                    title: ep.title || ep.title_japanese || `Episode ${ep.mal_id}`,
                    title_japanese: ep.title_japanese || null,
                    aired: ep.aired || null,
                    score: ep.score || null,
                    filler: ep.filler || false,
                    recap: ep.recap || false,
                    url: ep.url || null,
                    forum_url: ep.forum_url || null
                }))

                await dbPut(STORE_EPISODE_LISTS, {
                    malId: anime.malId,
                    animeName: anime.name,
                    episodes,
                    fetchedAt: Date.now()
                })

                console.log(`[Jikan] ${i + 1}/${totalAnime} "${anime.name}" — ${episodes.length} episodes listed`)
            } else {
                console.log(`[Jikan] ${i + 1}/${totalAnime} "${anime.name}" — no episodes found, skipping`)
                continue
            }
        }

        // --- Step 2: Fetch synopsis for each episode ---
        for (let j = 0; j < episodes.length; j++) {
            if (_downloadCancelled) break

            const ep = episodes[j]
            const epNum = ep.mal_id
            const cacheKey = `${anime.malId}_${epNum}`

            // Check if we need to fetch/refresh
            const cachedDetail = await dbGet(STORE_EPISODE_DETAILS, cacheKey)
            const needsFetch = shouldRefreshEpisode(cachedDetail, ep.aired)

            if (!needsFetch) continue

            const detail = await fetchEpisodeDetailFromAPI(anime.malId, epNum, 'low')
            await delay(API_DELAY_MS)

            if (detail) {
                await dbPut(STORE_EPISODE_DETAILS, {
                    key: cacheKey,
                    malId: anime.malId,
                    epNum,
                    title: detail.title || detail.title_japanese || `Episode ${epNum}`,
                    title_japanese: detail.title_japanese || null,
                    synopsis: detail.synopsis || null,
                    duration: detail.duration || null,
                    aired: detail.aired || ep.aired || null,
                    filler: detail.filler || false,
                    recap: detail.recap || false,
                    fetchedAt: Date.now(),
                    lastRefreshedAt: Date.now()
                })
            }

            // Report progress
            if (onProgress) {
                onProgress({
                    animeName: anime.name,
                    animeIdx: i,
                    totalAnime,
                    epIdx: j + 1,
                    totalEps: episodes.length,
                    state: 'running'
                })
            }
        }

        // Save progress after each anime
        await saveDownloadProgress({
            state: 'running',
            lastMalId: anime.malId,
            animeIdx: i,
            totalAnime,
            timestamp: Date.now()
        })
    }

    if (!_downloadCancelled) {
        await saveDownloadProgress({ state: 'complete', totalAnime, timestamp: Date.now() })
        console.log(`[Jikan] Background download complete. ${totalAnime} anime processed.`)
    }

    _downloadRunning = false

    if (onProgress) {
        onProgress({
            animeName: null,
            animeIdx: totalAnime,
            totalAnime,
            epIdx: 0,
            totalEps: 0,
            state: _downloadCancelled ? 'paused' : 'complete'
        })
    }
}

/**
 * Stop the background downloader gracefully
 */
export function stopBackgroundDownload() {
    _downloadCancelled = true
}

/**
 * Check if the downloader is currently running
 * @returns {boolean}
 */
export function isDownloadRunning() {
    return _downloadRunning
}

/**
 * Bulk import a static pre-downloaded cache object into IndexedDB
 * @param {object} staticCache - { episode_lists: {...}, episode_details: {...} }
 * @returns {Promise<void>}
 */
export async function importJikanStaticCache(staticCache) {
    try {
        const db = await openDB()
        
        // 1. Bulk import episode lists
        if (staticCache.episode_lists) {
            const tx = db.transaction(STORE_EPISODE_LISTS, 'readwrite')
            const store = tx.objectStore(STORE_EPISODE_LISTS)
            for (const [malId, data] of Object.entries(staticCache.episode_lists)) {
                const malIdNum = parseInt(malId, 10)
                store.put({ malId: malIdNum, ...data })
            }
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve()
                tx.onerror = () => reject(tx.error)
            })
        }
        
        // 2. Bulk import episode details
        if (staticCache.episode_details) {
            const tx = db.transaction(STORE_EPISODE_DETAILS, 'readwrite')
            const store = tx.objectStore(STORE_EPISODE_DETAILS)
            for (const [key, data] of Object.entries(staticCache.episode_details)) {
                store.put({ key, ...data })
            }
            await new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve()
                tx.onerror = () => reject(tx.error)
            })
        }
        
        console.log('[Jikan] Static cache bulk imported successfully!')
    } catch (e) {
        console.error('[Jikan] Failed to bulk import static cache:', e)
    }
}

let metadataCachePromise = null;

function getMetadataCache() {
    if (!metadataCachePromise) {
        metadataCachePromise = fetch('data/anime_metadata.json')
            .then(res => res.json())
            .catch(() => ({}));
    }
    return metadataCachePromise;
}

/**
 * Fetch main anime details (like thumbnail URL) from Jikan.
 * Caches results in localStorage to avoid hitting API rate limits.
 * @param {number} malId
 * @returns {Promise<object|null>}
 */
export async function getAnimeInfo(malId, priority = 'high') {
    if (!malId) return null;

    // Check pre-fetched global static cache first
    const staticCache = await getMetadataCache();
    if (staticCache && staticCache[malId]) {
        return staticCache[malId];
    }

    const cacheKey = `jikan_anime_info_${malId}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
        try {
            const parsed = JSON.parse(cached)
            // If cache doesn't have fetchedAt, or if it's older than 7 days, consider it expired
            const CACHE_TTL_7DAYS = 7 * 24 * 60 * 60 * 1000
            if (parsed.fetchedAt && (Date.now() - parsed.fetchedAt < CACHE_TTL_7DAYS)) {
                if (parsed.broadcast !== undefined) {
                    return parsed
                }
            }
        } catch {
            // ignore parsing errors and fetch again
        }
    }

    try {
        const url = `${JIKAN_BASE_URL}/anime/${malId}`
        const res = await fetchWithRetry(url, RETRY_MAX, priority)
        if (res && res.data) {
            const info = {
                imageUrl: res.data.images?.jpg?.image_url || null,
                largeImageUrl: res.data.images?.jpg?.large_image_url || null,
                score: res.data.score || null,
                title: res.data.title || null,
                broadcast: res.data.broadcast || null,
                fetchedAt: Date.now()
            }
            localStorage.setItem(cacheKey, JSON.stringify(info))
            return info
        }
    } catch (e) {
        console.error(`[Jikan] Failed to fetch info for malId ${malId}:`, e)
        return null
    }
}

// ============================================
// CHARACTERS (MC / Vedlejší postavy / Waifu)
// ============================================

// Odhad pohlaví z anglického MAL popisu (poměr ženských vs. mužských zájmen)
function guessGenderFromAbout(about) {
    if (!about) return null
    const f = (about.match(/\b(she|her|hers|herself)\b/gi) || []).length
    const m = (about.match(/\b(he|him|his|himself)\b/gi) || []).length
    if (f === 0 && m === 0) return null
    return f > m ? 'female' : 'male'
}

// Zkrátí popis na rozumnou délku pro malou kartu (celé věty, max ~limit znaků)
function trimAbout(about, limit = 320) {
    if (!about) return null
    // MAL popisy mívají na konci zdrojovou poznámku "(Source: ...)" — odřízneme
    let clean = about.replace(/\s+/g, ' ').replace(/\(Source:.*?\)\s*$/i, '').trim()
    if (!clean) return null
    if (clean.length <= limit) return clean
    const cut = clean.slice(0, limit)
    const lastSentence = cut.lastIndexOf('. ')
    return (lastSentence > 80 ? cut.slice(0, lastSentence + 1) : cut.trimEnd() + '…')
}

/**
 * Jádro: stáhne obsazení jednoho anime z Jikanu a obohatí zobrazované
 * postavy o popis + odhad pohlaví. Prochází globálním rate-limiterem.
 * @param {number} malId
 * @returns {Promise<{main: object[], supporting: object[]}|null>}
 */
async function fetchCharactersFromAPI(malId, priority = 'low') {
    const res = await fetchWithRetry(`${JIKAN_BASE_URL}/anime/${malId}/characters`, RETRY_MAX, priority)
    if (!res || !res.data) return null

    const all = res.data
        .map(c => ({
            malId: c.character?.mal_id || null,
            url: c.character?.url || null,
            image: c.character?.images?.jpg?.image_url || null,
            name: c.character?.name || '',
            role: c.role || 'Supporting',
            favorites: c.favorites || 0
        }))
        .filter(c => c.malId)
        .sort((a, b) => b.favorites - a.favorites)

    const main = all.filter(c => c.role === 'Main').slice(0, 6)
    const supporting = all.filter(c => c.role !== 'Main').slice(0, 10)

    // Popis + pohlaví jen pro zobrazované postavy (rozestup řeší rate-limiter)
    for (const c of [...main, ...supporting]) {
        const d = await fetchWithRetry(`${JIKAN_BASE_URL}/characters/${c.malId}`, RETRY_MAX, priority)
        if (d && d.data) {
            c.about = trimAbout(d.data.about)
            c.gender = guessGenderFromAbout(d.data.about)
        }
    }
    return { main, supporting }
}

/**
 * Přečte obsazení z IndexedDB (pokud je uložené a čerstvé).
 * @param {number} malId
 * @returns {Promise<object|null>}
 */
export async function getCachedCharacters(malId) {
    if (!malId) return null
    try {
        const rec = await dbGet(STORE_CHARACTERS, malId)
        if (rec) return rec
    } catch { /* číst dál nemá smysl */ }
    return null
}

// In-flight promise deduplikace, ať hover na víc karet nespustí fetch dvakrát
const _charactersPromises = {}

/**
 * Get characters for an anime: main + top supporting, enriched with
 * about-text and a gender guess (for the Waifu category).
 * Prefers the IndexedDB cache filled by the background downloader.
 * @param {number} malId
 * @returns {Promise<{main: object[], supporting: object[]}|null>}
 */
export function getAnimeCharacters(malId, priority = 'high') {
    if (!malId) return Promise.resolve(null)
    if (_charactersPromises[malId]) return _charactersPromises[malId]

    const p = (async () => {
        const cached = await getCachedCharacters(malId)
        if (cached && (cached.main?.length || cached.supporting?.length)) return cached

        const fresh = await fetchCharactersFromAPI(malId, priority)
        if (!fresh) return null

        const result = { malId, main: fresh.main, supporting: fresh.supporting, fetchedAt: Date.now() }
        try { await dbPut(STORE_CHARACTERS, result) } catch { /* poběží bez cache */ }
        return result
    })()

    _charactersPromises[malId] = p
    p.finally(() => { delete _charactersPromises[malId] })
    return p
}

// ============================================
// BACKGROUND CHARACTER DOWNLOADER
// ============================================

let _charDownloadRunning = false
let _charDownloadCancelled = false

/**
 * Průběžně stáhne postavy pro VŠECHNA anime v seznamu a uloží do IndexedDB.
 * Obnovitelné po refreshi (přeskakuje již stažená), sdílí globální rate-limiter
 * s downloaderem epizod, takže se API nikdy nepřetíží.
 * @param {object[]} animeList
 * @param {function} [onProgress]
 */
export async function startCharacterBackgroundDownload(animeList, onProgress) {
    if (_charDownloadRunning) return
    _charDownloadRunning = true
    _charDownloadCancelled = false

    try {
        await openDB()
    } catch (e) {
        console.error('[Jikan] Nelze otevřít IndexedDB, ruším stahování postav:', e)
        _charDownloadRunning = false
        return
    }

    const queue = animeList
        .map(a => ({ name: a.name, malId: extractMalId(a.mal_url) }))
        .filter(a => a.malId !== null)

    // Deduplikace podle malId (série mají stejné mal_url u víc řádků výjimečně)
    const seen = new Set()
    const uniqueQueue = queue.filter(a => (seen.has(a.malId) ? false : seen.add(a.malId)))
    const total = uniqueQueue.length

    console.log(`[Jikan] Stahování postav: ${total} anime ke zpracování.`)

    for (let i = 0; i < total; i++) {
        if (_charDownloadCancelled) break
        const a = uniqueQueue[i]

        const cached = await getCachedCharacters(a.malId)
        if (cached && (cached.main?.length || cached.supporting?.length)) {
            if (onProgress) onProgress({ animeName: a.name, idx: i + 1, total, state: 'cached' })
            continue
        }

        try {
            const fresh = await fetchCharactersFromAPI(a.malId, 'low')
            if (fresh && (fresh.main.length || fresh.supporting.length)) {
                await dbPut(STORE_CHARACTERS, {
                    malId: a.malId,
                    animeName: a.name,
                    main: fresh.main,
                    supporting: fresh.supporting,
                    fetchedAt: Date.now()
                })
                console.log(`[Jikan] Postavy ${i + 1}/${total} "${a.name}" — ${fresh.main.length} hl. + ${fresh.supporting.length} ved.`)
            }
        } catch (e) {
            console.warn(`[Jikan] Postavy "${a.name}" selhaly:`, e)
        }

        if (onProgress) onProgress({ animeName: a.name, idx: i + 1, total, state: 'running' })
    }

    _charDownloadRunning = false
    if (onProgress) onProgress({ animeName: null, idx: total, total, state: _charDownloadCancelled ? 'paused' : 'complete' })
    if (!_charDownloadCancelled) console.log('[Jikan] Stahování postav dokončeno.')
}

/** Zastaví downloader postav */
export function stopCharacterBackgroundDownload() {
    _charDownloadCancelled = true
}

/**
 * Calculates the exact next local broadcast Date based on Jikan broadcast info (JST).
 * @param {object} broadcast - Jikan broadcast object (e.g. { day: "Sundays", time: "23:30", timezone: "Asia/Tokyo" })
 * @returns {Date|null}
 */
export function getNextBroadcastDate(broadcast) {
    if (!broadcast || !broadcast.day || !broadcast.time || broadcast.timezone !== 'Asia/Tokyo') {
        return null;
    }
    
    const daysMap = { 
        "Sundays": 0, "Mondays": 1, "Tuesdays": 2, "Wednesdays": 3, 
        "Thursdays": 4, "Fridays": 5, "Saturdays": 6,
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, 
        "Thursday": 4, "Friday": 5, "Saturday": 6 
    };
    
    const targetDay = daysMap[broadcast.day];
    if (targetDay === undefined) return null;
    
    const [h, m] = broadcast.time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    
    const now = new Date();
    // Tokyo offset is UTC+9
    const tokyoOffsetMs = 9 * 60 * 60 * 1000;
    
    const currentUtcTime = now.getTime();
    const currentTokyoTime = currentUtcTime + tokyoOffsetMs;
    const currentTokyoDate = new Date(currentTokyoTime);
    
    const currentTokyoDay = currentTokyoDate.getUTCDay(); // 0-6
    
    let dayDiff = targetDay - currentTokyoDay;
    
    const currentTokyoHour = currentTokyoDate.getUTCHours();
    const currentTokyoMin = currentTokyoDate.getUTCMinutes();
    const passedToday = (currentTokyoHour > h) || (currentTokyoHour === h && currentTokyoMin >= m);
    
    if (dayDiff < 0 || (dayDiff === 0 && passedToday)) {
        dayDiff += 7;
    }
    
    // next broadcast in Tokyo
    const nextTokyoDate = new Date(currentTokyoDate);
    nextTokyoDate.setUTCDate(currentTokyoDate.getUTCDate() + dayDiff);
    nextTokyoDate.setUTCHours(h, m, 0, 0);
    
    // Convert back to absolute UTC by subtracting Tokyo offset
    const nextUtcTime = nextTokyoDate.getTime() - tokyoOffsetMs;
    
    return new Date(nextUtcTime); // Standard local JS Date object
}
