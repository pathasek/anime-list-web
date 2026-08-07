// Per-anime načítání DOCX rozborů (category_texts/<klíč>.json + index).
// Nahrazuje stahování 40MB monolitu category_texts.json: web si vezme jen
// rozbor otevřeného anime a k tomu lehký index pro průřezové funkce
// (badge „má rozbor", počty epizod s rozborem apod.).
//
// Klíč souboru se NEODVOZUJE z názvu — čte se z indexu (pole `file`), takže
// JS nemusí zrcadlit normalizaci názvů z export_docx_categories.py.
import { getDataVersion } from './dataStore'

let indexPromise = null            // Promise<{ [name]: IndexEntry }>
const entryCache = new Map()       // name -> Promise<entry|null>

/**
 * Index rozborů: { "<přesný název anime>": { file, categories, episodes, story } }
 *   file       klíč souboru v data/category_texts/ (bez přípony)
 *   categories kategorie s neprázdným textem (bez episodes/story)
 *   episodes   klíče epizodních rozborů (stringy, vč. relativních aliasů)
 *   story      má rozbor děje (tlačítko „Děj" u filmů/speciálů)
 * @returns {Promise<Object>}
 */
export function loadCategoryTextsIndex() {
    if (!indexPromise) {
        indexPromise = (async () => {
            try {
                // Verze dat místo Date.now(): HTTP cache soubor podrží mezi
                // návštěvami a stáhne se znovu jen po změně dat.
                const version = await getDataVersion()
                const response = await fetch('data/category_texts_index.json?v=' + version)
                if (!response.ok) return {}
                return await response.json()
            } catch {
                return {}
            }
        })()
    }
    return indexPromise
}

/**
 * Plný rozbor jednoho anime: { Animace: "…", …, episodes: {…}, story: {…} }.
 * Vrací null, když anime rozbor nemá (nebo fetch selže). Výsledek se drží
 * v paměti per název, takže se každý soubor stahuje nejvýš jednou za session.
 * @param {string} animeName přesný název anime (klíč indexu)
 * @returns {Promise<Object|null>}
 */
export function loadCategoryTextsFor(animeName) {
    if (!animeName) return Promise.resolve(null)
    if (!entryCache.has(animeName)) {
        entryCache.set(animeName, (async () => {
            try {
                const index = await loadCategoryTextsIndex()
                const meta = index?.[animeName]
                if (!meta?.file) return null
                const version = await getDataVersion()
                const response = await fetch(`data/category_texts/${meta.file}.json?v=${version}`)
                if (!response.ok) return null
                return await response.json()
            } catch {
                return null
            }
        })())
    }
    return entryCache.get(animeName)
}
