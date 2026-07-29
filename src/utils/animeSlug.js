// Čitelné adresy detailu anime.
//
// Dřív se do cesty dával rovnou název anime, takže URL vypadala takhle:
//   #/anime/Wistoria%3A%20Wand%20and%20Sword%2C%20S01
// Dvojtečka, čárka i mezery se musí v cestě percent-enkódovat, jinak by
// rozbily parsování. Slug ten problém odstraní u zdroje:
//   #/anime/wistoria-wand-and-sword-s01
//
// DŮLEŽITÉ: slug se používá VÝHRADNĚ v adresách. Všechno ostatní (párování
// hodnocení, rozborů, historie, médií) dál jede na přesný název anime — ten
// zůstává jediným identifikátorem dat.
//
// Ověřeno na anime_list.json: 488 anime → 488 unikátních slugů, žádná kolize.

/** Dekódování, které nespadne na poškozeném %-zápisu v adrese */
export function safeDecode(param) {
    try {
        return decodeURIComponent(param || '')
    } catch {
        return param || ''
    }
}

/** „Wistoria: Wand and Sword, S01" → „wistoria-wand-and-sword-s01" */
export function slugifyAnime(name) {
    return (name || '')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')   // diakritika pryč (Bâan → Baan)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/** Cesta do detailu anime pro <Link to=...> */
export function animePath(name) {
    const slug = slugifyAnime(name)
    // Teoretická pojistka: kdyby název neobsahoval jediný alfanumerický znak,
    // radši se vrátí ke starému zápisu, než aby odkaz vedl na /anime/
    return slug ? `/anime/${slug}` : `/anime/${encodeURIComponent(name)}`
}

// Mapa slug → název se staví jednou na daný seznam anime (WeakMap na referenci
// pole). Nový titul přidaný do Excelu se do adres promítne sám: slug se počítá
// z názvu za běhu, nikde se neukládá a není co udržovat.
const slugMapCache = new WeakMap()

function getSlugMap(animeList) {
    const cached = slugMapCache.get(animeList)
    if (cached) return cached

    const map = new Map()
    const collisions = []
    for (const a of animeList) {
        const slug = slugifyAnime(a.name)
        if (!slug) continue
        if (map.has(slug)) collisions.push([slug, map.get(slug), a.name])
        else map.set(slug, a.name)
    }

    // Dva různé názvy se stejným slugem by sdílely jednu adresu a druhý by se
    // přes slug nedal otevřít. Aktuálně 488 anime → 488 unikátních slugů, ale
    // ať to nezůstane tiché, kdyby někdy přibyl kolidující název.
    if (collisions.length && import.meta.env?.DEV) {
        console.warn('[animeSlug] Kolize slugů — tato anime sdílejí jednu adresu:', collisions)
    }

    slugMapCache.set(animeList, map)
    return map
}

/**
 * Z parametru adresy zjistí skutečný název anime.
 *
 * Zvládne obě podoby, takže starší odkazy (a záložky) fungují dál:
 *   1. slug            → „wistoria-wand-and-sword-s01"
 *   2. původní název   → „Wistoria%3A%20Wand%20and%20Sword%2C%20S01"
 *
 * @returns {string|null} přesný název z listu, nebo null když nic nesedí
 */
export function resolveAnimeName(param, animeList) {
    if (!param || !animeList?.length) return null

    const decoded = safeDecode(param)

    // Starý tvar adresy: přesná shoda názvu
    const exact = animeList.find(a => a.name === decoded)
    if (exact) return exact.name

    // Nový tvar: shoda slugu
    return getSlugMap(animeList).get(slugifyAnime(decoded)) || null
}
