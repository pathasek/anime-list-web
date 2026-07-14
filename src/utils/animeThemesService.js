// AnimeThemes.moe API — katalog OP/ED videí pro všechna anime (Plán 6b).
// Dotaz podle MAL id vrátí všechny znělky včetně přímých WebM odkazů.
// Používá se JEN v detailu anime jako doplněk ke Google Drive knihovně
// (GDrive = moje vybrané/oblíbené verze, AnimeThemes = všechny ostatní).

const API_BASE = 'https://api.animethemes.moe'

// Module-level cache per MAL id (na relaci)
const themesCache = new Map()

// Skóre videa — vybíráme „nejlepší verzi": creditless BD 1080 bez textů a překryvů
function videoScore(v) {
    let score = v.resolution || 0
    if (v.nc) score += 4000                    // creditless
    if (v.overlap === 'None') score += 2000    // bez překryvu epizody
    if (v.source === 'BD') score += 500
    if (v.lyrics) score -= 300                 // verze s titulky textu až jako záloha
    return score
}

// Vrátí [{ type: 'OP'|'ED', label: 'OP1', song, artist, url, version }] — jedno
// nejlepší video na znělku. Chyby → prázdné pole (detail se bez toho obejde).
export async function fetchAnimeThemes(malId, signal) {
    if (!malId) return []
    if (themesCache.has(malId)) return themesCache.get(malId)

    const url = `${API_BASE}/anime`
        + `?filter[has]=resources&filter[site]=MyAnimeList&filter[external_id]=${malId}`
        + `&include=animethemes.animethemeentries.videos,animethemes.song.artists`

    try {
        const resp = await fetch(url, { signal })
        if (!resp.ok) return []
        const json = await resp.json()
        const anime = json?.anime?.[0]
        if (!anime?.animethemes?.length) {
            themesCache.set(malId, [])
            return []
        }

        const themes = []
        for (const theme of anime.animethemes) {
            const type = (theme.type || '').toUpperCase()
            if (type !== 'OP' && type !== 'ED') continue

            // Nejlepší video napříč všemi entry verzemi znělky
            let best = null
            let bestEntryVersion = null
            for (const entry of theme.animethemeentries || []) {
                for (const v of entry.videos || []) {
                    if (!v.link) continue
                    if (!best || videoScore(v) > videoScore(best)) {
                        best = v
                        bestEntryVersion = entry.version || 1
                    }
                }
            }
            if (!best) continue

            const artists = (theme.song?.artists || []).map(a => a.name).filter(Boolean)
            themes.push({
                type,
                label: theme.slug || `${type}${theme.sequence || ''}`,
                song: theme.song?.title || null,
                artist: artists.length ? artists.join(', ') : null,
                url: best.link,
                version: bestEntryVersion,
            })
        }

        themesCache.set(malId, themes)
        return themes
    } catch (err) {
        if (err?.name === 'AbortError') throw err
        console.warn('AnimeThemes API error:', err)
        return []
    }
}
