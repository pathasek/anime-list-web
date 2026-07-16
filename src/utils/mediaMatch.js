// Párování OP/ED/OST médií k anime.
// OP/ED (+ příp. OST) videa jsou na Google Drive (op_ed_videos.json).
// OST je typicky YouTube (favorites_ost.json -> pieces).

// Sjednocený klíč pro párování názvů — MUSÍ odpovídat normalize_key v build_gdrive_op_ed.py
export function normalizeAnimeKey(s) {
    return (s || '')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '') // odstraň diakritiku (bez vkládání mezer)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

// Tolerantní shoda názvů písní — GDrive soubor a AnimeThemes mívají jinou
// romanizaci/zápis (interpunkce, pořadí slov, dlouhé samohlásky). Shoda =
// přesná/substring normalizovaných klíčů, nebo překryv slov: ≥60 % tokenů
// kratšího názvu (a aspoň 2 sdílené) se vyskytuje v druhém.
export function songsLooselyMatch(songA, songB) {
    const a = normalizeAnimeKey(songA)
    const b = normalizeAnimeKey(songB)
    if (!a || !b) return false
    if (a === b || a.includes(b) || b.includes(a)) return true
    const tokensOf = (k) => k.split(' ').filter(w => w.length > 1)
    const aTokens = tokensOf(a)
    const bTokens = tokensOf(b)
    if (!aTokens.length || !bTokens.length) return false
    const bSet = new Set(bTokens)
    const shared = aTokens.filter(w => bSet.has(w)).length
    const minLen = Math.min(aTokens.length, bTokens.length)
    return shared >= 2 && shared / minLen >= 0.6
}

// Odstraní koncový příznak řady/části z normalizovaného klíče
// ("... s01", "... season 2", "... part 1") → holý název série.
function stripSeasonPart(key) {
    return (key || '')
        .replace(/\s+(?:s(?:eason)?\s*\d+(?:\s+part\s*\d+)?|part\s*\d+)$/i, '')
        .trim()
}

function seasonOf(key) {
    const m = (key || '').match(/s(?:eason)?\s*(\d+)/i)
    return m ? parseInt(m[1], 10) : 1 // bez uvedení = řada 1
}

function partOf(key) {
    const m = (key || '').match(/part\s*(\d+)/i)
    return m ? parseInt(m[1], 10) : null
}

// Robustní shoda dvou normalizovaných klíčů anime — toleruje rozdíly v zápisu
// řady/části (např. soubor "bocchi the rock s01" vs list "bocchi the rock").
// Používá se JEDINÉ místo pro párování napříč aplikací (detail i seznam OP/ED),
// aby se každá písnička namapovala spolehlivě a stejně.
export function animeKeysMatch(fileKey, animeKey) {
    if (!fileKey || !animeKey) return false
    if (fileKey === animeKey) return true

    const fileBase = stripSeasonPart(fileKey)
    const animeBase = stripSeasonPart(animeKey)
    if (fileBase !== animeBase) return false

    // Stejný základní název — porovnáme řadu (default 1) a část.
    if (seasonOf(fileKey) !== seasonOf(animeKey)) return false

    const filePart = partOf(fileKey)
    const animePart = partOf(animeKey)
    // Soubor bez části pasuje na cokoli; soubor s částí jen na stejnou část
    // (nebo na anime bez uvedené části — celá řada).
    if (filePart !== null && animePart !== null && filePart !== animePart) return false

    return true
}

// Najde nejlepší OP/ED video z Drive knihovny pro daný řádek/anime.
// Zkouší (v tomto pořadí): přesný klíč anime → robustní shodu klíče anime →
// robustní shodu podle názvu série. Mezi kandidáty preferuje shodu songu.
export function findOpEdVideo(opEdVideos, { animeName, animeSeries, type, song } = {}) {
    const t = (type || '').trim().toUpperCase()
    if (t !== 'OP' && t !== 'ED') return null
    const animeKey = normalizeAnimeKey(animeName)
    const seriesKey = animeSeries ? normalizeAnimeKey(animeSeries) : null
    if (!animeKey && !seriesKey) return null

    const songKey = normalizeAnimeKey(song)
    const songMatches = (v) => {
        const vs = normalizeAnimeKey(v.song)
        return vs && songKey && (vs === songKey || vs.includes(songKey) || songKey.includes(vs))
    }

    const ofType = (opEdVideos || []).filter(v => (v.type || '').toUpperCase() === t)

    // 1) Striktní shoda klíče (respektuje řadu/část)
    const candidates = ofType.filter(v =>
        (animeKey && animeKeysMatch(v.match_key, animeKey)) ||
        (seriesKey && animeKeysMatch(v.match_key, seriesKey))
    )
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) {
        // Víc kandidátů (např. v1/v2) — preferuj shodu podle názvu písničky.
        return (songKey && candidates.find(songMatches)) || candidates[0]
    }

    // 2) Fallback: shoda podle základního názvu série + názvu písničky.
    //    Řeší případy, kdy list používá generický název bez řady, ale píseň
    //    ji jednoznačně určuje (jinak by rozdíl v zápisu řady zabránil shodě).
    if (songKey) {
        const base = stripSeasonPart(animeKey)
        const seriesBase = seriesKey ? stripSeasonPart(seriesKey) : null
        const loose = ofType.filter(v => {
            const vb = stripSeasonPart(v.match_key)
            return (vb === base || (seriesBase && vb === seriesBase)) && songMatches(v)
        })
        if (loose.length > 0) return loose[0]
    }

    return null
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?/\s]+)/

export function extractYoutubeId(url) {
    if (!url) return null
    const m = url.match(YT_RE)
    return m ? m[1] : null
}

export function extractYoutubePlaylistId(url) {
    if (!url) return null
    const m = url.match(/[?&]list=([^&]+)/)
    return m ? m[1] : null
}

// Vyhledávací URL na YouTube (fallback, když klip není na Drive)
export function youtubeSearchUrl(animeName, type) {
    const q = `${animeName} ${type}`.trim()
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}

// Vrátí { OP: [...], ED: [...], OST: [...] } pro dané anime.
// Každá položka: { kind: 'video'|'youtube'|'youtube-playlist'|'external', type, song, artist, label, url, ytId, file_id, ytPlaylistId, isBestPiece }
export function getMediaForAnime(animeName, opEdVideos, ostPieces, ostWhole, animeSeries) {
    const key = normalizeAnimeKey(animeName)
    const result = { OP: [], ED: [], OST: [] }
    if (!key) return result

    // OP/ED/OST videa z Google Drive — robustní shoda podle klíče anime.
    // (Detail zná přesný název včetně řady, takže se páruje jen na tuto část —
    //  žádné series-wide párování, aby S02 netahala klipy z S01.)
    for (const v of opEdVideos || []) {
        if (!animeKeysMatch(v.match_key, key)) continue;

        const type = (v.type || '').toUpperCase()
        if (!result[type]) continue
        result[type].push({
            kind: 'video',
            type,
            song: v.song || null,
            artist: v.artist || null,
            label: v.ver ? `${type} ${v.ver}` : type,
            url: v.url,
            ytId: null,
            file_id: v.file_id || null,
        })
    }

    // Zjistit, zda existuje celkový playlist pro toto anime (podle série nebo názvu)
    const seriesKey = animeSeries ? normalizeAnimeKey(animeSeries) : null
    const wholeEntry = (ostWhole || []).find(w => {
        const wKey = normalizeAnimeKey(w.anime_name)
        return wKey && (wKey === seriesKey || wKey === key)
    })
    const hasWhole = !!wholeEntry

    // OST z YouTube (favorites_ost.json -> pieces)
    for (const p of ostPieces || []) {
        if (normalizeAnimeKey(p.anime_name) !== key) continue
        const ytId = extractYoutubeId(p.ost_url)
        if (!ytId) continue
        // nepřidávej duplicitně, pokud už existuje stejné YT id
        if (result.OST.some(o => o.ytId === ytId)) continue
        result.OST.push({
            kind: 'youtube',
            type: 'OST',
            song: p.ost_name || null,
            artist: null,
            label: 'OST',
            url: p.ost_url,
            ytId,
            isBestPiece: hasWhole,
        })
    }

    // Pokud existuje celkový playlist, přidat jeho odkazy jako další stopy
    if (wholeEntry) {
        if (wholeEntry.yt_url) {
            const playlistId = extractYoutubePlaylistId(wholeEntry.yt_url)
            if (playlistId) {
                result.OST.push({
                    kind: 'youtube-playlist',
                    type: 'OST',
                    song: `${wholeEntry.anime_name} (YouTube)`,
                    artist: null,
                    label: 'Celý playlist',
                    url: wholeEntry.yt_url,
                    ytPlaylistId: playlistId,
                })
            }
        }
        if (wholeEntry.spotify_url) {
            result.OST.push({
                kind: 'external',
                type: 'OST',
                song: `${wholeEntry.anime_name} (Spotify)`,
                artist: null,
                label: 'Celý playlist',
                url: wholeEntry.spotify_url,
            })
        }
    }

    return result
}

export function hasAnyMedia(media) {
    return !!media && (media.OP.length + media.ED.length + media.OST.length) > 0
}
