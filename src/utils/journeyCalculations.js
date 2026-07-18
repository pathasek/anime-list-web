// „Cesta Anime“ — čisté výpočty bez Reactu (Plán 9, Ú3).
// Web port VBA modulu LIST_Watch_Overview V22: měsíční boxy s výběrem
// Nejlepšího anime podle hierarchie TOP10 → HM → běžná logika, plus nové
// vrstvy navíc: detailní hodnocení (kategorie/epizody) jako tiebreaker a
// „Nakoukáno“ z history logu (řeší rozkoukaná/weekly anime).

// Remíza celkových průměrů, při které rozhoduje detailní hodnocení
export const DETAIL_TIE_THRESHOLD = 0.2
// Díl série o tolik bodů nad druhým nejvyšším vyhrává sám (VBA konstanta)
export const OUTLIER_RATING_THRESHOLD = 2

const MONTHS_CS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
    'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
export const MONTHS_CS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn',
    'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']

export function monthLabel(key) {
    const [y, m] = key.split('-').map(Number)
    return `${MONTHS_CS[m - 1]} ${y}`
}
export function monthLabelShort(key) {
    const [y, m] = key.split('-').map(Number)
    return `${MONTHS_CS_SHORT[m - 1]} ${String(y).slice(2)}`
}

const monthKeyOf = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d)) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const lc = (s) => (s || '').trim().toLowerCase()
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n }

// "Action; Supernatural" nebo "Curses:95:popis;Demons:93" → názvy v původním casingu
function splitList(s) {
    if (!s) return []
    return String(s).split(';').map(x => x.split(':')[0].trim()).filter(x => x && x.toLowerCase() !== 'x')
}

// Top N položek s počty; exclude = Set lowercase názvů (kolize žánry/témata → tagy)
function topItems(values, limit, exclude) {
    const counts = new Map() // lc → { name, n }
    for (const v of values) {
        const key = lc(v)
        if (!key || (exclude && exclude.has(key))) continue
        const e = counts.get(key)
        if (e) e.n++
        else counts.set(key, { name: v, n: 1 })
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit)
}

// „x,y h“ z minut (VBA formát: 1 desetinné místo, celé bez ,0)
export function fmtHours(mins) {
    const h = mins / 60
    const r = Math.round(h * 10) / 10
    return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')) + ' h'
}
const fmtRating = (r) => (Number.isInteger(r) ? String(r) : (Math.round(r * 10) / 10).toFixed(1).replace('.', ','))

// ── Detailní hodnocení (vrstva navíc oproti VBA) ────────────────────────────
// Průměr kategorií anime; null když detail chybí (anime před srpnem 2025)
function catAvgOf(name, categoryByName) {
    const cats = categoryByName.get(lc(name))
    if (!cats) return null
    const vals = Object.values(cats).filter(v => typeof v === 'number')
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
}
function epMaxOf(name, episodesByName) {
    const eps = episodesByName.get(lc(name))
    if (!eps || !eps.length) return null
    return Math.max(...eps.map(e => num(e.rating)).filter(v => v !== null))
}
// Detail entity (série = průměr členů; vyžaduje detail u VŠECH členů — jinak null,
// aby se nesrovnávalo číslo proti „nic“). Žádný datum-cutoff: rozhoduje jen data.
function detailOf(members, categoryByName, episodesByName) {
    const catAvgs = members.map(m => catAvgOf(m.name, categoryByName))
    if (catAvgs.some(v => v === null)) return null
    const epMaxes = members.map(m => epMaxOf(m.name, episodesByName)).filter(v => v !== null)
    return {
        catAvg: catAvgs.reduce((s, v) => s + v, 0) / catAvgs.length,
        epMax: epMaxes.length ? Math.max(...epMaxes) : null,
    }
}

/**
 * Hlavní výpočet: měsíce s kompletními statistikami.
 * @returns [{ key, label, plusCount, runningTotal, best, longest, watchedMins,
 *             types, genres, themes, tags, items }]
 * best = { name, rating, ratingText, isSeries, reason: 'top10'|'hm'|'detail'|'standard',
 *          thumbnail, memberNames }
 */
export function buildJourney({ animeList, historyLog, top10Names = [], hmNames = [],
    categoryRatings = [], episodeRatings = [] }) {

    const categoryByName = new Map(categoryRatings.map(c => [lc(c.name), c.categories]))
    const episodesByName = new Map(episodeRatings.map(e => [lc(e.name), e.episodes]))

    // ── Sběr: měsíční koše + první výskyt sérií (VŽDY celá historie) ──
    const monthly = new Map()          // key → [anime]
    const firstAppearance = new Map()  // lc(série) → nejstarší end_date timestamp
    for (const a of animeList || []) {
        const key = monthKeyOf(a.end_date)
        if (!key) continue
        if (a.series) {
            const sk = lc(a.series)
            const t = new Date(a.end_date).getTime()
            if (!firstAppearance.has(sk) || t < firstAppearance.get(sk)) firstAppearance.set(sk, t)
        }
        if (!monthly.has(key)) monthly.set(key, [])
        monthly.get(key).push(a)
    }

    // Nakoukané minuty po měsících z history logu ("143 min (2,4 hod)")
    const watchedByMonth = new Map()
    for (const h of historyLog || []) {
        const key = monthKeyOf(h.date)
        if (!key) continue
        const m = /(\d+)\s*min/.exec(h.time || '')
        if (m) watchedByMonth.set(key, (watchedByMonth.get(key) || 0) + parseInt(m[1], 10))
    }

    const sortedKeys = [...monthly.keys()].sort()
    const top10Lc = top10Names.map(lc).filter(Boolean)
    const hmSet = new Set(hmNames.map(lc).filter(Boolean))
    const winners = new Set() // „paměť vítězů“ TOP10/HM — série vyhrává jen jednou

    const durOf = (a) => {
        const eps = num(a.episodes), d = num(a.episode_duration)
        return eps !== null && d !== null ? eps * d : 0
    }
    const firstAppearanceMonth = (seriesLc) =>
        firstAppearance.has(seriesLc) ? monthKeyOf(new Date(firstAppearance.get(seriesLc)).toISOString()) : ''

    let runningTotal = 0
    const out = []

    for (const key of sortedKeys) {
        const monthAll = monthly.get(key)
        runningTotal += monthAll.length

        // ── PRIORITA 1: TOP 10 (první výskyt série + paměť vítězů) ──
        let forcedName = '', reason = null
        for (const t of top10Lc) {
            if (winners.has(t)) continue
            if (!monthAll.some(a => lc(a.series) === t)) continue
            const fam = firstAppearanceMonth(t)
            if (fam === key || fam === '') { forcedName = t; reason = 'top10'; break }
        }

        // ── PRIORITA 2: HM ──
        let collection = monthAll
        if (!forcedName && hmSet.size) {
            const hmHits = monthAll.filter(a => {
                const sk = lc(a.series)
                if (sk && hmSet.has(sk)) {
                    const fam = firstAppearanceMonth(sk)
                    return fam === key || fam === ''
                }
                return !sk && hmSet.has(lc(a.name)) // standalone — bez kontroly prvního výskytu
            })
            if (hmHits.length === 1) {
                forcedName = lc(hmHits[0].series || hmHits[0].name)
                reason = 'hm'
            } else if (hmHits.length > 1) {
                collection = hmHits // běžná logika jen nad HM podmnožinou
                reason = 'hm'
            }
        }

        // ── PRIORITA 3: běžná logika (nad `collection`) ──
        // Seskupení sérií; série s 1 dílem v měsíci = standalone (VBA pravidlo)
        const bySeries = new Map()
        const standalones = []
        for (const a of collection) {
            const sk = lc(a.series)
            if (sk) {
                if (!bySeries.has(sk)) bySeries.set(sk, [])
                bySeries.get(sk).push(a)
            } else standalones.push(a)
        }
        for (const [sk, members] of [...bySeries]) {
            if (members.length === 1) { standalones.push(members[0]); bySeries.delete(sk) }
        }

        let bestStandalone = null
        for (const a of standalones) {
            const r = num(a.rating)
            if (r !== null && (!bestStandalone || r > bestStandalone.rating)) bestStandalone = { anime: a, rating: r }
        }

        const seriesStats = [...bySeries.entries()].map(([sk, members]) => {
            const ratings = members.map(m => num(m.rating)).filter(v => v !== null)
            return {
                sk, members,
                displayName: members[0].series,
                avg: ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null,
                ratings: ratings.sort((a, b) => b - a),
            }
        }).filter(s => s.avg !== null)

        // Nejlepší série + NOVÁ VRSTVA: detail tiebreaker při remíze ≤ 0,2
        let detailDecided = false
        let bestSeries = null
        if (seriesStats.length) {
            const maxAvg = Math.max(...seriesStats.map(s => s.avg))
            const cands = seriesStats.filter(s => maxAvg - s.avg <= DETAIL_TIE_THRESHOLD)
            bestSeries = cands.reduce((a, b) => (b.avg > a.avg ? b : a))
            if (cands.length > 1) {
                const details = cands.map(c => ({ c, d: detailOf(c.members, categoryByName, episodesByName) }))
                if (details.every(x => x.d)) { // jen když detail mají VŠICHNI kandidáti
                    details.sort((x, y) => (y.d.catAvg - x.d.catAvg) || ((y.d.epMax || 0) - (x.d.epMax || 0)))
                    if (lc(details[0].c.sk) !== lc(bestSeries.sk)) detailDecided = true
                    bestSeries = details[0].c
                }
            }
        }

        // Max hodnocení měsíce + winner-by-count (VBA: série s nejvíce díly na maximu)
        let maxMonthRating = bestStandalone ? bestStandalone.rating : -1
        for (const s of seriesStats) maxMonthRating = Math.max(maxMonthRating, s.ratings[0])
        let winnerByCount = null
        if (maxMonthRating > -1) {
            let maxCount = bestStandalone && bestStandalone.rating === maxMonthRating ? 1 : 0
            for (const s of seriesStats) {
                const c = s.ratings.filter(r => r === maxMonthRating).length
                if (c > maxCount || (c === maxCount && maxCount > 1 && winnerByCount && s.avg > winnerByCount.avg)) {
                    if (c > maxCount) maxCount = c
                    winnerByCount = s
                }
            }
            if (maxCount <= 1) winnerByCount = null
        }

        // Outlier: díl nejlepší série o ≥2 body nad druhým nejvyšším
        let outlier = null
        if (bestSeries && bestSeries.ratings.length >= 2
            && bestSeries.ratings[0] - bestSeries.ratings[1] >= OUTLIER_RATING_THRESHOLD) {
            const part = bestSeries.members.find(m => num(m.rating) === bestSeries.ratings[0])
            if (part) outlier = { anime: part, rating: bestSeries.ratings[0] }
        }

        // Série jako vítěz: ≥2 díly hodnocené ≥ nejlepší standalone
        const showSeriesAsBest = bestSeries
            && bestSeries.ratings.filter(r => r >= (bestStandalone ? bestStandalone.rating : -1)).length >= 2

        // Finální rozhodnutí (pořadí dle VBA)
        let best = null
        const seriesBest = (s, why) => ({
            name: s.displayName, rating: s.avg, isSeries: true, reason: why,
            memberNames: s.members.map(m => m.name),
            thumbnail: s.members[0].thumbnail || null,
        })
        if (winnerByCount) best = seriesBest(winnerByCount, detailDecided && lc(winnerByCount.sk) === lc(bestSeries?.sk) ? 'detail' : 'standard')
        else if (outlier && (!bestStandalone || outlier.rating > bestStandalone.rating))
            best = { name: outlier.anime.name, rating: outlier.rating, isSeries: false, reason: 'standard', memberNames: [outlier.anime.name], thumbnail: outlier.anime.thumbnail || null }
        else if (showSeriesAsBest) best = seriesBest(bestSeries, detailDecided ? 'detail' : 'standard')
        else if (bestStandalone)
            best = { name: bestStandalone.anime.name, rating: bestStandalone.rating, isSeries: false, reason: 'standard', memberNames: [bestStandalone.anime.name], thumbnail: bestStandalone.anime.thumbnail || null }

        // Přepsání vítěze prioritou TOP10 / jediného HM
        if (forcedName) {
            const members = monthAll.filter(a => lc(a.series) === forcedName || lc(a.name) === forcedName)
            const ratings = members.map(m => num(m.rating)).filter(v => v !== null)
            best = {
                name: members[0]?.series || members[0]?.name || forcedName,
                rating: ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null,
                isSeries: members.length > 1 || !!members[0]?.series,
                reason, memberNames: members.map(m => m.name),
                thumbnail: members[0]?.thumbnail || null,
            }
        }
        if (best) {
            best.ratingText = best.rating !== null ? `${fmtRating(best.rating)}/10` : 'N/A'
            // Paměť vítězů: TOP10/HM série už nemůže vyhrát znovu
            if (best.reason === 'top10' || best.reason === 'hm') winners.add(lc(best.name))
        }

        // ── Nejdelší anime (VŽDY z celého měsíce, ne HM podmnožiny — VBA oprava) ──
        const durBySeries = new Map()
        let longest = null
        for (const a of monthAll) {
            const d = durOf(a)
            const sk = lc(a.series)
            if (sk) durBySeries.set(sk, { name: a.series, mins: (durBySeries.get(sk)?.mins || 0) + d })
            else if (!longest || d > longest.mins) longest = { name: a.name, mins: d }
        }
        for (const s of durBySeries.values()) if (!longest || s.mins > longest.mins) longest = s

        // ── Top typy/žánry/témata/tagy (celý měsíc; tagy s exkluzí vítězů) ──
        const types = topItems(monthAll.map(a => a.type).filter(Boolean), 3)
        const genres = topItems(monthAll.flatMap(a => splitList(a.genres)), 3)
        const themes = topItems(monthAll.flatMap(a => splitList(a.themes)), 3)
        const exclude = new Set([...genres, ...themes].map(x => lc(x.name)))
        const tags = topItems(monthAll.flatMap(a => splitList(a.tags)), 6, exclude)

        out.push({
            key, label: monthLabel(key),
            plusCount: monthAll.length, runningTotal,
            best,
            longest: longest ? { ...longest, hoursText: fmtHours(longest.mins) } : null,
            watchedMins: watchedByMonth.get(key) || 0,
            types, genres, themes, tags,
            items: [...monthAll].sort((a, b) => {
                const da = a.end_date ? new Date(a.end_date).getTime() : 0
                const db = b.end_date ? new Date(b.end_date).getTime() : 0
                if (da !== db) return da - db
                const idxA = parseInt(a.index, 10) || 0
                const idxB = parseInt(b.index, 10) || 0
                return idxA - idxB
            }),
        })
    }
    return out
}
