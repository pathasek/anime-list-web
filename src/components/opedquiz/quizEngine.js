// Herní logika minihry „Hádej OP/ED“ — čisté funkce bez Reactu.
// Záměrně izolovaná featura: konzumuje jen data z op_ed_videos.json
// a anime_list.json, s aplikací sdílí pouze kanonický matcher názvů
// (utils/mediaMatch). Žádné další vazby na stránky/komponenty.
import { normalizeAnimeKey, animeKeysMatch, songsLooselyMatch } from '../../utils/mediaMatch'

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

// Normalizace názvu písně pro párování AnimeThemes ↔ GDrive knihovna
const songKeyOf = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Postaví hratelný pool skladeb z katalogu AnimeThemes (Plán 9, Ú1).
 *
 * `mode`:
 *   'all'       — celý katalog: všechny OP/ED všech anime v listu.
 *   'favorites' — moje oblíbené znělky. Sem patří jak znělky stažené v GDrive
 *                 knihovně (op_ed_videos.json), tak znělky, které mám jen
 *                 OHODNOCENÉ v tabulce (favorites.json) a nemám je stažené —
 *                 ty se přehrají z AnimeThemes (audio-only stopa). Přehrávání:
 *                 primárně AnimeThemes, u nespárovaných stažených přímé GDrive
 *                 URL. Ohodnocenou znělku bez AnimeThemes stopy (a bez stažení)
 *                 nelze přehrát → do poolu se nezařadí.
 *
 * Metadata (přesný název, série, tagy pro podobnostní distraktory) se berou
 * z anime listu — u AnimeThemes přes MAL id, u GDrive/tabulky přes fuzzy matcher.
 */
export function buildPool({ themes, videos, favorites, animeList, mode = 'all' }) {
    const byMalId = new Map()
    const metas = []
    for (const a of animeList || []) {
        const m = /\/anime\/(\d+)/.exec(a.mal_url || '')
        if (m) byMalId.set(Number(m[1]), a)
        metas.push({ a, key: normalizeAnimeKey(a.name) })
    }
    const findMetaByName = (matchKey) => {
        const hit = metas.find(m => animeKeysMatch(matchKey, m.key))
        return hit ? hit.a : null
    }

    // Znělky z AnimeThemes → základ poolu
    const seen = new Set()
    const pool = []
    for (const t of themes || []) {
        const type = (t.type || '').toUpperCase()
        if (type !== 'OP' && type !== 'ED') continue
        const url = t.audio_url || t.video_url
        if (!url) continue

        const meta = byMalId.get(t.mal_id)
        const animeName = meta?.name || t.anime_name
        if (!animeName) continue

        const dedup = `${t.mal_id}|${type}|${songKeyOf(t.song || t.label)}`
        if (seen.has(dedup)) continue
        seen.add(dedup)

        pool.push({
            id: dedup,
            url,
            malId: t.mal_id,
            label: t.label || null,                     // 'OP1', 'ED2-BD'…
            type,                                       // 'OP' | 'ED'
            song: (t.song || '').trim() || null,
            artist: (t.artist || '').trim() || null,
            animeName,
            series: meta?.series || t.series || null,
            base: normalizeAnimeKey(meta?.series || animeName),
            tags: tagSetOf(meta),
        })
    }

    if (mode !== 'favorites') return pool

    // Režim „Oblíbené": ponech jen znělky, které mám v GDrive knihovně,
    // ale přehrávej je z AnimeThemes (audio-only stopa).
    const byAnimeType = new Map()
    for (const t of pool) {
        const k = `${normalizeAnimeKey(t.animeName)}|${t.type}`
        if (!byAnimeType.has(k)) byAnimeType.set(k, [])
        byAnimeType.get(k).push(t)
    }
    const seqOf = (label) => {
        const m = /(\d+)/.exec(label || '')
        return m ? Number(m[1]) : null
    }

    const favPool = []
    const used = new Set()
    for (const v of videos || []) {
        const type = (v.type || '').toUpperCase()
        if (type !== 'OP' && type !== 'ED') continue
        if (!v.url) continue
        const meta = findMetaByName(v.match_key)
        const animeName = meta?.name || v.anime_display
        if (!animeName) continue

        const cands = byAnimeType.get(`${normalizeAnimeKey(animeName)}|${type}`) || []
        const songKey = songKeyOf(v.song)

        // 1) shoda podle názvu písně
        let hit = songKey ? cands.find(c => songKeyOf(c.song) === songKey) : null

        // 2) záloha podle pořadí znělky — tentýž song má v obou zdrojích často
        //    jiný název (GDrive „My War" vs AnimeThemes „Boku no Sensou").
        //    Pořadí bereme z GDrive pole `ver`; když chybí a anime má jen
        //    jednu znělku daného typu, je jednoznačná.
        if (!hit) {
            const seq = v.ver ? Number(v.ver) : (cands.length === 1 ? seqOf(cands[0].label) : null)
            if (seq !== null && !Number.isNaN(seq)) hit = cands.find(c => seqOf(c.label) === seq)
        }

        if (hit) {
            if (used.has(hit.id)) continue      // dvě GDrive verze téže znělky
            used.add(hit.id)
            favPool.push(hit)
            continue
        }

        // 3) AnimeThemes znělku nezná → přímé GDrive URL, ať se neztratí
        const key = `${normalizeAnimeKey(animeName)}|${type}|${songKey}`
        if (used.has(key)) continue
        used.add(key)
        favPool.push({
            id: `gd|${key}`,
            url: v.url,
            malId: null,
            label: null,
            type,
            song: (v.song || '').trim() || null,
            artist: (v.artist || '').trim() || null,
            animeName,
            series: meta?.series || null,
            base: v.match_key_base || v.match_key,
            tags: tagSetOf(meta),
        })
    }

    // Rozšíření: znělky OHODNOCENÉ v tabulce (favorites.json), které NEMÁM
    // stažené na GDrive. Přehrají se z AnimeThemes (audio-only stopa) — bez ní
    // je přehrát nelze, takže se přeskočí. Stažené (i ohodnocené) už přidal
    // cyklus výše, `used` zabrání duplicitám.
    for (const f of favorites || []) {
        const type = (f.type || '').toUpperCase()
        if (type !== 'OP' && type !== 'ED') continue
        const meta = findMetaByName(normalizeAnimeKey(f.anime_name))
        const animeName = meta?.name || f.anime_name
        if (!animeName) continue

        const cands = byAnimeType.get(`${normalizeAnimeKey(animeName)}|${type}`) || []
        if (!cands.length) continue                  // žádná AnimeThemes stopa → nelze přehrát

        // Shoda podle názvu písně (tolerantní), jinak jen když má anime jedinou
        // znělku daného typu (pak je jednoznačná).
        let hit = f.song ? cands.find(c => songsLooselyMatch(c.song, f.song)) : null
        if (!hit && cands.length === 1) hit = cands[0]
        if (!hit) continue

        if (used.has(hit.id)) continue               // už přidané (stažené) — nezdvojovat
        used.add(hit.id)
        favPool.push(hit)
    }

    return favPool
}

/**
 * Vygeneruje celou hru: `roundCount` kol + pár náhradních kol pro případ,
 * že se některá skladba nepodaří přehrát (GDrive výpadek apod.).
 *
 * Batch 3 task 5c: `roundCount = Infinity` → nekonečný režim. Kola tvoří
 * VŠECHNY unikátní skladby knihovny (stále bez opakování anime/písničky);
 * hra běží, dokud ji hráč sám neukončí nebo nevyčerpá celou knihovnu.
 */
export function generateGame(pool, animeList, roundCount, spareCount = 5) {
    const endless = !Number.isFinite(roundCount)
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

    // Výběr skladeb bez duplicit: žádné anime ani písnička se v jedné hře
    // nesmí objevit dvakrát (platí i pro náhradní kola, která můžou
    // nahradit nepřehratelné skladby).
    const usedAnime = new Set()
    const usedSongs = new Set()
    const picked = []
    const rest = []
    const target = endless ? Infinity : roundCount + spareCount
    for (const t of shuffle(pool)) {
        if (picked.length >= target) break
        const songKey = t.song ? t.song.toLowerCase() : null
        if (usedAnime.has(t.animeName) || (songKey && usedSongs.has(songKey))) {
            rest.push(t)
            continue
        }
        usedAnime.add(t.animeName)
        if (songKey) usedSongs.add(songKey)
        picked.push(t)
    }
    // Fallback pro malý pool: radši opakované anime než kratší hra.
    // (V nekonečném režimu se nedoplňuje — hra prostě skončí s knihovnou.)
    if (!endless) {
        while (picked.length < roundCount + spareCount && rest.length) picked.push(rest.shift())
    }

    const ctx = {
        uniqueAnime, artists, songsByType, partsBySeries,
        // Strop sériových kol na hru — bez něj jich padalo příliš mnoho.
        // V nekonečném režimu se strop odvíjí od reálného počtu kol.
        seriesRoundsLeft: Math.max(1, Math.floor((endless ? picked.length : roundCount) * 0.2)),
    }

    const rounds = picked.map(t => makeRound(t, ctx))
    if (endless) return { rounds, spares: [], endless: true }
    return { rounds: rounds.slice(0, roundCount), spares: rounds.slice(roundCount), endless: false }
}

function makeRound(track, ctx) {
    // Sériové kolo: anime má v listu ≥3 díly série → malá šance, že se hádá
    // konkrétní část série. Omezeno pravděpodobností (15 %) i stropem na
    // celou hru (ctx.seriesRoundsLeft) — bývalo jich příliš mnoho.
    const parts = track.series ? (ctx.partsBySeries[track.series] || []) : []
    const otherParts = parts.filter(n => n !== track.animeName)
    const isSeries = otherParts.length >= 2 && ctx.seriesRoundsLeft > 0 && Math.random() < 0.15
    if (isSeries) ctx.seriesRoundsLeft--

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
