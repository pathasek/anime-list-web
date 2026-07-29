// Počet skladeb v YouTube playlistech „OST As a Whole".
//
// YouTube ho neposkytne dopředu — zná ho až přehrávač, když playlist načte.
// Proto se zapisuje při každém spuštění playlistu a drží se v localStorage,
// takže karty ho ukazují i před tím, než uživatel něco pustí. Počet se skoro
// nemění, takže žádné pravidelné obnovování není potřeba: přepíše se sám, až
// se ten playlist zase pustí.
//
// Doplňuje ytmusic_ost.json, který zná jen část alb.

const LS_KEY = 'ost_playlist_counts_v1'
export const OST_COUNTS_EVENT = 'ost-playlist-counts-changed'

let cache = null

function load() {
    if (cache) return cache
    try {
        cache = JSON.parse(localStorage.getItem(LS_KEY)) || {}
    } catch {
        cache = {}   // poškozený záznam se prostě naplní znovu
    }
    return cache
}

/** Všechny známé počty: { [playlistId]: { count, at } } */
export function getPlaylistCounts() {
    return { ...load() }
}

/** Počet skladeb daného playlistu, nebo null když se ještě nikdy nepustil */
export function getPlaylistCount(playlistId) {
    if (!playlistId) return null
    const rec = load()[playlistId]
    return rec && typeof rec.count === 'number' ? rec.count : null
}

/**
 * Uloží počet zjištěný přehrávačem. Zapisuje se jen při skutečné změně, ať se
 * zbytečně nesahá na localStorage ani neprobublává událost do UI.
 */
export function savePlaylistCount(playlistId, count) {
    if (!playlistId || typeof count !== 'number' || count <= 0) return
    const store = load()
    if (store[playlistId]?.count === count) return
    store[playlistId] = { count, at: Date.now() }
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(store))
    } catch { /* quota */ }
    try {
        window.dispatchEvent(new CustomEvent(OST_COUNTS_EVENT, { detail: { playlistId, count } }))
    } catch { /* SSR */ }
}
