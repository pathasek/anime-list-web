// Herní logika minihry „Hádej OP/ED“ — čisté funkce bez Reactu.
// Záměrně izolovaná featura: konzumuje jen data z op_ed_videos.json
// a anime_list.json, s aplikací sdílí pouze kanonický matcher názvů
// (utils/mediaMatch). Žádné další vazby na stránky/komponenty.
import { normalizeAnimeKey, animeKeysMatch } from '../../utils/mediaMatch'

export const POINTS = { anime: 10, type: 2, artist: 4, song: 4 }

// "Action; Supernatural" nebo "Curses:95:popis;Demons:93:popis" → ['action', ...]
function splitNames(s) {
    if (!s) return []
    return String(s)
        .split(';')
        .map(x => x.split(':')[0].trim().toLowerCase())
        .filter(Boolean)
}

function tagSetOf(anime) {
    if (!anime) return new Set()
    return new Set([
        ...splitNames(anime.genres),
        ...splitNames(anime.themes),
        ...splitNames(anime.tags),
    ])
}

// Jaccardova podobnost dvou množin tagů (0–1)
function similarity(a, b) {
    if (!a.size || !b.size) return 0
    let inter = 0
    for (const t of a) if (b.has(t)) inter++
    return inter / (a.size + b.size - inter)
}

export function shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

const sample = (arr, n) => shuffle(arr).slice(0, n)

/**
 * Postaví hratelný pool skladeb z GDrive knihovny OP/ED.
 * Deduplikuje verze (v1/v2 téže znělky) a obohatí o metadata z anime listu
 * (přesný název, série, tagy pro podobnostní distraktory).
 */
export function buildPool(videos, animeList) {
    const metas = (animeList || []).map(a => ({ a, key: normalizeAnimeKey(a.name) }))
    const findMeta = (matchKey) => {
        const hit = metas.find(m => animeKeysMatch(matchKey, m.key))
        return hit ? hit.a : null
    }

    const seen = new Set()
    const pool = []
    for (const v of videos || []) {
        const type = (v.type || '').toUpperCase()
        if (type !== 'OP' && type !== 'ED') continue
        if (!v.url) continue
        const dedup = `${v.match_key}|${type}|${normalizeAnimeKey(v.song)}`
        if (seen.has(dedup)) continue
        seen.add(dedup)

        const meta = findMeta(v.match_key)
        pool.push({
            id: dedup,
            url: v.url,
            fileId: v.file_id || null,
            type,                                        // 'OP' | 'ED'
            song: (v.song || '').trim() || null,
            artist: (v.artist || '').trim() || null,
            animeName: meta?.name || v.anime_display,    // preferuj přesný název z listu
            series: meta?.series || null,
            base: v.match_key_base || v.match_key,
            tags: tagSetOf(meta),
        })
    }
    return pool
}

/**
 * Vygeneruje celou hru: `roundCount` kol + pár náhradních kol pro případ,
 * že se některá skladba nepodaří přehrát (GDrive výpadek apod.).
 */
export function generateGame(pool, animeList, roundCount, spareCount = 5) {
    // Unikátní anime z poolu — distraktory hlavní otázky jsou jen anime,
    // která v knihovně OP/ED reálně existují (věrohodné a těžší možnosti).
    const uniqueAnime = []
    const seenNames = new Set()
    for (const t of pool) {
        if (seenNames.has(t.animeName)) continue
        seenNames.add(t.animeName)
        uniqueAnime.push({ name: t.animeName, base: t.base, series: t.series, tags: t.tags })
    }

    const artists = [...new Set(pool.map(t => t.artist).filter(Boolean))]
    const songsByType = {
        OP: [...new Set(pool.filter(t => t.type === 'OP' && t.song).map(t => t.song))],
        ED: [...new Set(pool.filter(t => t.type === 'ED' && t.song).map(t => t.song))],
    }

    // Díly sérií z anime listu (pro „sériová kola“: Z jaké části série je to?)
    const partsBySeries = {}
    for (const a of animeList || []) {
        if (!a.series) continue
        if (!partsBySeries[a.series]) partsBySeries[a.series] = []
        partsBySeries[a.series].push(a.name)
    }

    const ctx = { uniqueAnime, artists, songsByType, partsBySeries }
    const tracks = shuffle(pool).slice(0, roundCount + spareCount)
    const rounds = tracks.map(t => makeRound(t, ctx))
    return { rounds: rounds.slice(0, roundCount), spares: rounds.slice(roundCount) }
}

function makeRound(track, ctx) {
    // Sériové kolo: anime má v listu ≥3 díly série → ~40% šance, že se hádá
    // konkrétní část série (výrazně těžší, přesně dle zadání).
    const parts = track.series ? (ctx.partsBySeries[track.series] || []) : []
    const otherParts = parts.filter(n => n !== track.animeName)
    const isSeries = otherParts.length >= 2 && Math.random() < 0.4

    let question, animeOptions
    if (isSeries) {
        question = `Série „${track.series}“ — ze které části je tato znělka?`
        animeOptions = shuffle([track.animeName, ...sample(otherParts, 3)])
    } else {
        question = 'Z jakého anime je tato znělka?'
        // Distraktory: nejpodobnější anime podle tagů (mimo stejnou sérii,
        // aby nevznikla dvojznačnost — na tu jsou sériová kola).
        const candidates = ctx.uniqueAnime.filter(a =>
            a.name !== track.animeName &&
            a.base !== track.base &&
            (!track.series || a.series !== track.series)
        )
        const ranked = candidates
            .map(a => ({ a, s: similarity(track.tags, a.tags) + Math.random() * 0.06 }))
            .sort((x, y) => y.s - x.s)
        const top = ranked.slice(0, 10).map(x => x.a.name)
        animeOptions = shuffle([track.animeName, ...sample(top, 3)])
    }

    const artistOptions = track.artist
        ? shuffle([track.artist, ...sample(ctx.artists.filter(x => x !== track.artist), 3)])
        : null

    const songPool = (ctx.songsByType[track.type] || []).filter(s => s !== track.song)
    const songOptions = track.song
        ? shuffle([track.song, ...sample(songPool, 3)])
        : null

    const maxPoints = POINTS.anime + POINTS.type
        + (artistOptions ? POINTS.artist : 0)
        + (songOptions ? POINTS.song : 0)

    return { track, isSeries, question, animeOptions, artistOptions, songOptions, maxPoints }
}
