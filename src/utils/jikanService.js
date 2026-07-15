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
// Store names
const STORE_EPISODE_LISTS = 'episode_lists'
const STORE_EPISODE_DETAILS = 'episode_details'
const STORE_DOWNLOAD_PROGRESS = 'download_progress'
const STORE_CHARACTERS = 'characters'

// Cancellation flag
let _downloadCancelled = false
let _downloadRunning = false
let _downloadPaused = false

export function pauseBackgroundDownload() {
    _downloadPaused = true
    console.log('[Jikan] Background download paused')
}

export function resumeBackgroundDownload() {
    _downloadPaused = false
    console.log('[Jikan] Background download resumed')
}

export function isBackgroundDownloadPaused() {
    return _downloadPaused
}

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
export async function fetchWithRetry(url, retries = RETRY_MAX, priority = 'low') {
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

async function checkIsExcelRunning() {
    try {
        const response = await fetch('/api/excel-running')
        if (response.ok) {
            const data = await response.json()
            return !!data.excelRunning
        }
    } catch {
        // Fallback when endpoint is not available
    }
    return false
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
            episodeCount: a.episodes || 0,
            releaseDate: a.release_date || null
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

        // Check if Excel is running or page requested pause
        let isExcelRunning = await checkIsExcelRunning()
        if (_downloadPaused || isExcelRunning) {
            const pauseReason = _downloadPaused ? 'Page (Recommendations) active' : 'Excel running'
            console.log(`[Jikan] Pausing background download (${pauseReason}).`)
            while ((_downloadPaused || isExcelRunning) && !_downloadCancelled) {
                if (onProgress) {
                    onProgress({
                        animeName: downloadQueue[i].name,
                        animeIdx: i,
                        totalAnime,
                        epIdx: 0,
                        totalEps: 0,
                        state: _downloadPaused ? 'paused_page' : 'paused_excel'
                    })
                }
                await delay(2000)
                isExcelRunning = await checkIsExcelRunning()
            }
            if (_downloadCancelled) break
            console.log('[Jikan] Resuming background download.')
        }

        const anime = downloadQueue[i]
        const ageMs = animeAgeMs(anime.releaseDate)

        // --- Step 1: Fetch episode list (u anime < 1 rok se kontroluje měsíčně) ---
        let cachedList = await getCachedEpisodeList(anime.malId)
        let episodes = cachedList?.episodes || null
        const listNeedsRefresh = shouldRefreshRecord(cachedList, ageMs, EP_FRESH_ANIME_MS)

        if (!episodes || listNeedsRefresh) {
            const apiEpisodes = await fetchEpisodeListFromAPI(anime.malId, 'low')
            await delay(API_DELAY_MS)

            if (apiEpisodes && apiEpisodes.length > 0) {
                const mapped = apiEpisodes.map(ep => ({
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

                const signature = contentSignature(mapped.map(e => [e.mal_id, e.title, e.filler, e.recap]))
                const unchanged = !!(cachedList && cachedList.signature === signature)
                episodes = mapped

                await dbPut(STORE_EPISODE_LISTS, {
                    malId: anime.malId,
                    animeName: anime.name,
                    episodes,
                    signature,
                    unchangedStreak: unchanged ? (cachedList.unchangedStreak || 0) + 1 : 0,
                    fetchedAt: cachedList?.fetchedAt || Date.now(),
                    lastRefreshedAt: Date.now()
                })

                console.log(`[Jikan] ${i + 1}/${totalAnime} "${anime.name}" — ${episodes.length} episodes listed${unchanged ? ' (beze změny)' : ''}`)
            } else if (!episodes) {
                console.log(`[Jikan] ${i + 1}/${totalAnime} "${anime.name}" — no episodes found, skipping`)
                continue
            }
        }

        // Report progress at the end of each anime list fetch
        if (onProgress && episodes) {
            onProgress({
                animeName: anime.name,
                animeIdx: i,
                totalAnime,
                epIdx: episodes.length,
                totalEps: episodes.length,
                state: 'running'
            })
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
// BACKGROUND SYNCHRONIZATION
// ============================================

/**
 * Kompletní synchronizace na pozadí: stahuje epizody (seznamy + popisy).
 */
export async function runBackgroundSync(animeList, onProgress) {
    await startBackgroundDownload(animeList, onProgress)
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
