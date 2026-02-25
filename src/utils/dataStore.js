/**
 * Data Store with Local Storage Persistence
 * Manages anime data with sync between server and local storage
 */

const STORAGE_KEYS = {
    ANIME_LIST: 'anime_list_data',
    HISTORY_LOG: 'history_log_data',
    FAVORITES: 'favorites_data',
    PLAN_TO_WATCH: 'plan_to_watch_data',
    CATEGORY_RATINGS: 'category_ratings_data',
    USER_EDITS: 'user_edits'
}

// Track version check
let versionChecked = false

async function checkServerVersion() {
    try {
        const response = await fetch('/data/metadata.json?v=' + Date.now())
        if (!response.ok) return

        const meta = await response.json()
        const serverTime = meta.lastUpdated
        const localTime = parseInt(localStorage.getItem('data_last_updated') || '0')

        if (serverTime > localTime) {
            console.log('New data version detected. refresh local data.')
            // Clear cached data keys
            [
                STORAGE_KEYS.ANIME_LIST,
                STORAGE_KEYS.HISTORY_LOG,
                STORAGE_KEYS.FAVORITES,
                STORAGE_KEYS.PLAN_TO_WATCH,
                STORAGE_KEYS.CATEGORY_RATINGS
            ].forEach(k => localStorage.removeItem(k))

            localStorage.setItem('data_last_updated', serverTime)
        }
    } catch (e) {
        console.warn('Failed to check data version:', e)
    }
}

/**
 * Load data from local storage or fetch from server
 * @param {string} key - Storage key
 * @param {string} jsonPath - Path to JSON file
 * @returns {Promise<any[]>}
 */
export async function loadData(key, jsonPath) {
    // Check version once per session
    if (!versionChecked) {
        await checkServerVersion()
        versionChecked = true
    }

    // Check if we have local edits
    const stored = localStorage.getItem(key)
    if (stored) {
        try {
            return JSON.parse(stored)
        } catch (e) {
            console.warn(`Failed to parse stored data for ${key}:`, e)
        }
    }

    // Fetch from server
    // Add cache busting
    const response = await fetch(`${jsonPath}?v=${Date.now()}`)
    const data = await response.json()

    // Store in local storage
    localStorage.setItem(key, JSON.stringify(data))

    return data
}

/**
 * Save data to local storage
 * @param {string} key - Storage key
 * @param {any[]} data - Data to save
 */
export function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data))
}

/**
 * Add a new anime entry
 * @param {Object} anime - Anime data
 * @returns {Promise<Object>} - Added anime with generated index
 */
export async function addAnime(anime) {
    const list = await loadData(STORAGE_KEYS.ANIME_LIST, '/data/anime_list.json')

    // Generate new index
    const maxIndex = list.reduce((max, a) => {
        const idx = parseInt(a.index) || 0
        return idx > max ? idx : max
    }, 0)

    const newAnime = {
        ...anime,
        index: `${maxIndex + 1}.`,
        start_date: new Date().toISOString(),
        end_date: null,
        rewatch_count: 0
    }

    list.unshift(newAnime) // Add to beginning
    saveData(STORAGE_KEYS.ANIME_LIST, list)

    // Track edit
    trackEdit('add', 'anime', newAnime.name)

    return newAnime
}

/**
 * Update an existing anime entry
 * @param {string} name - Anime name (identifier)
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} - Updated anime or null if not found
 */
export async function updateAnime(name, updates) {
    const list = await loadData(STORAGE_KEYS.ANIME_LIST, '/data/anime_list.json')

    const index = list.findIndex(a => a.name === name)
    if (index === -1) return null

    list[index] = { ...list[index], ...updates }
    saveData(STORAGE_KEYS.ANIME_LIST, list)

    trackEdit('update', 'anime', name)

    return list[index]
}

/**
 * Delete an anime entry
 * @param {string} name - Anime name
 * @returns {Promise<boolean>}
 */
export async function deleteAnime(name) {
    const list = await loadData(STORAGE_KEYS.ANIME_LIST, '/data/anime_list.json')

    const index = list.findIndex(a => a.name === name)
    if (index === -1) return false

    list.splice(index, 1)
    saveData(STORAGE_KEYS.ANIME_LIST, list)

    trackEdit('delete', 'anime', name)

    return true
}

/**
 * Add a history log entry
 * @param {Object} entry - History entry { name, episodes, time, date }
 * @returns {Promise<Object>}
 */
export async function addHistoryEntry(entry) {
    const history = await loadData(STORAGE_KEYS.HISTORY_LOG, '/data/history_log.json')

    const newEntry = {
        ...entry,
        date: entry.date || new Date().toISOString()
    }

    // Insert at beginning (most recent first)
    history.unshift(newEntry)
    saveData(STORAGE_KEYS.HISTORY_LOG, history)

    trackEdit('add', 'history', entry.name)

    return newEntry
}

/**
 * Update category ratings for an anime
 * @param {string} name - Anime name
 * @param {Object} categories - Category ratings object
 * @returns {Promise<Object>}
 */
export async function updateCategoryRatings(name, categories) {
    const ratings = await loadData(STORAGE_KEYS.CATEGORY_RATINGS, '/data/category_ratings.json')

    const index = ratings.findIndex(r => r.name === name)

    if (index !== -1) {
        ratings[index].categories = { ...ratings[index].categories, ...categories }
    } else {
        ratings.push({ name, categories })
    }

    saveData(STORAGE_KEYS.CATEGORY_RATINGS, ratings)
    trackEdit('update', 'ratings', name)

    return ratings.find(r => r.name === name)
}

/**
 * Track user edits
 * @param {string} action - add, update, delete
 * @param {string} type - anime, history, ratings
 * @param {string} target - Target name
 */
function trackEdit(action, type, target) {
    const edits = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_EDITS) || '[]')

    edits.push({
        action,
        type,
        target,
        timestamp: new Date().toISOString()
    })

    // Keep only last 100 edits
    if (edits.length > 100) {
        edits.splice(0, edits.length - 100)
    }

    localStorage.setItem(STORAGE_KEYS.USER_EDITS, JSON.stringify(edits))
}

/**
 * Export all user data as JSON
 * @returns {Object}
 */
export function exportAllData() {
    return {
        animeList: JSON.parse(localStorage.getItem(STORAGE_KEYS.ANIME_LIST) || '[]'),
        historyLog: JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY_LOG) || '[]'),
        favorites: JSON.parse(localStorage.getItem(STORAGE_KEYS.FAVORITES) || '[]'),
        planToWatch: JSON.parse(localStorage.getItem(STORAGE_KEYS.PLAN_TO_WATCH) || '[]'),
        categoryRatings: JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORY_RATINGS) || '[]'),
        edits: JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_EDITS) || '[]'),
        exportDate: new Date().toISOString()
    }
}

/**
 * Import data from JSON export
 * @param {Object} data - Exported data object
 */
export function importData(data) {
    if (data.animeList) saveData(STORAGE_KEYS.ANIME_LIST, data.animeList)
    if (data.historyLog) saveData(STORAGE_KEYS.HISTORY_LOG, data.historyLog)
    if (data.favorites) saveData(STORAGE_KEYS.FAVORITES, data.favorites)
    if (data.planToWatch) saveData(STORAGE_KEYS.PLAN_TO_WATCH, data.planToWatch)
    if (data.categoryRatings) saveData(STORAGE_KEYS.CATEGORY_RATINGS, data.categoryRatings)

    trackEdit('import', 'all', 'bulk import')
}

/**
 * Reset all local data and reload from server
 */
export async function resetToServerData() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key)
    })

    // This will trigger fresh fetch from server on next load
    return true
}

export { STORAGE_KEYS }
