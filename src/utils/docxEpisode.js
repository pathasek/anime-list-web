// Vyhledání DOCX rozboru epizody podle čísla. Čistá utilita sdílená mezi
// AnimeRatings (interně) a AnimeDetail. Dřív žila v AnimeRatings.jsx, ale export
// non-komponenty z page souboru rozbíjel react-refresh — přesunuto do utils.
export function getDocxEpisode(entry, epNum) {
    if (!entry || !entry.episodes || epNum === null || epNum === undefined) return null
    const key = String(epNum)
    if (entry.episodes[key]) return entry.episodes[key]

    // Fallback pro rozdělené sezóny: DOCX má nadpisy s absolutním číslováním
    // (EP 38–49), web se ptá na relativní číslo v rámci části (EP 1–12).
    // Pozičně mapovat smíme JEN když klíče tvoří souvislou řadu posunutou
    // od 1 — u řídkých klíčů (chybějící rozbory, souhrnné nadpisy „EP 6-13")
    // by poziční mapování vrátilo rozbor CIZÍ epizody, což je horší než
    // poctivé „rozbor není k dispozici".
    const sortedKeys = Object.keys(entry.episodes)
        .map(k => ({ raw: k, num: parseInt(k, 10) }))
        .filter(k => !isNaN(k.num))
        .sort((a, b) => a.num - b.num)

    if (sortedKeys.length === 0) return null
    const offset = sortedKeys[0].num
    if (offset <= 1) return null
    const contiguous = sortedKeys.every((k, i) => k.num === offset + i)
    if (!contiguous) return null

    const n = parseInt(epNum, 10)
    if (!isNaN(n) && n > 0 && n <= sortedKeys.length) {
        return entry.episodes[sortedKeys[n - 1].raw] || null
    }
    return null
}
