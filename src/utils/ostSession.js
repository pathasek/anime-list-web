// Přežití OST přehrávače přes refresh stránky (F5).
//
// Přehrávač dřív žil jen v paměti provideru, takže ho refresh zahodil. Tady se
// drží dvě věci:
//
//   1. Nastavení (shuffle, řazení) — přežívá napořád, je to preference.
//   2. Rozehraná session (co hraje, kde a v jakém čase) — přežívá 12 hodin,
//      pak už nemá cenu navazovat na něco, co jsem poslouchal včera.
//
// Skladby a playlisty se ukládají s sebou, aby šel přehrávač obnovit i když po
// refreshi skončím na jiné stránce než ve Favourite OP/ED/OST (data pro něj
// staví ta stránka a jinde nejsou k dispozici).

const PREFS_KEY = 'ost_prefs_v1'
const SESSION_KEY = 'ost_session_v1'
const MAX_AGE = 12 * 60 * 60 * 1000

// ── Nastavení ───────────────────────────────────────────────────────────────

export function loadOstPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY))
        return {
            isShuffle: !!raw?.isShuffle,
            sortOrder: ['none', 'newest', 'oldest'].includes(raw?.sortOrder) ? raw.sortOrder : 'none',
        }
    } catch {
        return { isShuffle: false, sortOrder: 'none' }
    }
}

export function saveOstPrefs(prefs) {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
            isShuffle: !!prefs.isShuffle,
            sortOrder: prefs.sortOrder || 'none',
        }))
    } catch { /* quota */ }
}

// ── Rozehraná session ───────────────────────────────────────────────────────

/**
 * @returns {null | { mode, index, tracks, groups, trackIdx, groupIdx, playlistPos, seconds }}
 */
export function loadOstSession() {
    try {
        const raw = JSON.parse(localStorage.getItem(SESSION_KEY))
        if (!raw || !raw.mode) return null
        if (!raw.at || Date.now() - raw.at > MAX_AGE) {
            clearOstSession()
            return null
        }
        // Bez skladeb nebo playlistů není co obnovovat
        if (raw.mode === 'pieces' && !raw.tracks?.length) return null
        if (raw.mode === 'whole' && !raw.groups?.length) return null
        return raw
    } catch {
        return null
    }
}

export function saveOstSession(session) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, at: Date.now() }))
    } catch { /* quota — session prostě nepřežije, přehrávání to neovlivní */ }
}

/** Průběžný zápis pozice, aniž by se přepisoval celý seznam skladeb. */
export function saveOstProgress(patch) {
    try {
        const raw = JSON.parse(localStorage.getItem(SESSION_KEY))
        if (!raw || !raw.mode) return
        localStorage.setItem(SESSION_KEY, JSON.stringify({ ...raw, ...patch, at: Date.now() }))
    } catch { /* quota */ }
}

export function clearOstSession() {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* SSR */ }
}
