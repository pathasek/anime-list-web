// Čištění názvů skladeb v OST přehrávači.
//
// Názvy chodí z noembed.com, což jsou syrové titulky YouTube videí, a ty bývají
// zanesené prefixy, které se v seznamu opakují u každé skladby:
//
//   「Cross Ange」【CD1】#5 届かぬ祈り Unreachable   →  届かぬ祈り Unreachable
//   BERSERK (1997) Original Soundtrack - Behelit  →  Behelit
//
// Čistí se ve dvou krocích:
//   1. Vzory  — závorky s názvem díla, označení disku, pořadové číslo, slova
//               typu „Original Soundtrack".
//   2. Společný prefix — cokoliv, čím po kroku 1 začínají VŠECHNY skladby
//               playlistu, se usekne. Tím se vyřeší i playlisty, na které
//               žádný vzor nesedí.
//
// Pojistka: když by čištění nechalo prázdno nebo pahýl, vrací se původní název.

const MIN_KEPT = 2          // kratší výsledek než tohle je podezřelý
const MIN_COMMON_PREFIX = 4 // kratší společný prefix nemá cenu řešit

// Závorkové bloky na ZAČÁTKU názvu: 「…」【…】［…］《…》 a hranaté závorky.
// Ty uvnitř názvu se nechávají být, tam obvykle nesou význam.
const LEADING_BRACKETS = /^\s*(?:[「【［〔《〈][^」】］〕》〉]*[」】］〕》〉]|\[[^\]]*\])\s*/

// Pořadové číslo skladby: „#5", „05.", „5 -", „Track 12"
const LEADING_NUMBER = /^\s*(?:#\s*\d+|track\s*\d+|\d{1,3})\s*[.\-–—:)]*\s*/i

// Označení disku, které zůstane po odstranění závorek: „CD1", „Disc 2"
const LEADING_DISC = /^\s*(?:cd|disc|disk)\s*\d+\s*[.\-–—:)]*\s*/i

// Popis vydání, kterým bývá název uvozený
const SOUNDTRACK_LABEL = /^\s*(.*?)\s*(?:original\s+soundtrack|original\s+score|soundtrack|ost)\s*(?:vol\.?\s*\d+)?\s*[-–—:|]\s*/i

// Rok v závorce hned na začátku: „(1997) "
const LEADING_YEAR = /^\s*\((?:19|20)\d{2}\)\s*[-–—:]?\s*/

/** Jeden název: odstraní opakující se ozdoby ze začátku. */
export function stripTitleDecorations(title) {
    if (!title) return title
    let out = String(title)

    // Vzory se pouštějí dokola, protože se řetězí:
    // „「Cross Ange」【CD1】#5 …" potřebuje tři průchody.
    for (let i = 0; i < 6; i++) {
        const before = out
        out = out.replace(LEADING_BRACKETS, '')
        out = out.replace(LEADING_YEAR, '')
        out = out.replace(LEADING_DISC, '')
        out = out.replace(SOUNDTRACK_LABEL, '')
        out = out.replace(LEADING_NUMBER, '')
        if (out === before) break
    }

    out = out.trim()
    return out.length >= MIN_KEPT ? out : String(title).trim()
}

/** Nejdelší společný prefix, useknutý na rozumné hranici slova. */
export function commonPrefixOf(titles) {
    const list = (titles || []).filter(t => typeof t === 'string' && t.length)
    if (list.length < 2) return ''

    let prefix = list[0]
    for (const t of list.slice(1)) {
        let i = 0
        while (i < prefix.length && i < t.length && prefix[i] === t[i]) i++
        prefix = prefix.slice(0, i)
        if (prefix.length < MIN_COMMON_PREFIX) return ''
    }

    // Useknout na poslední hranici, ať se neukousne půlka slova
    const boundary = Math.max(
        prefix.lastIndexOf(' - '), prefix.lastIndexOf(' – '), prefix.lastIndexOf(' — '),
        prefix.lastIndexOf(': '), prefix.lastIndexOf(' | '),
        prefix.lastIndexOf('】'), prefix.lastIndexOf('」'), prefix.lastIndexOf(']'),
        prefix.lastIndexOf(' ')
    )
    if (boundary <= 0) return ''
    prefix = prefix.slice(0, boundary + 1)

    return prefix.length >= MIN_COMMON_PREFIX ? prefix : ''
}

/**
 * Vyčistí celý playlist najednou.
 * @param {string[]} titles syrové titulky
 * @returns {string[]} vyčištěné názvy (stejná délka i pořadí)
 */
export function cleanTrackTitles(titles) {
    const raw = titles || []
    const step1 = raw.map(t => stripTitleDecorations(t))

    const prefix = commonPrefixOf(step1)
    if (!prefix) return step1

    return step1.map((t, i) => {
        if (!t.startsWith(prefix)) return t
        // Po useknutí prefixu může zbýt ještě pořadové číslo
        const cut = t.slice(prefix.length).replace(LEADING_NUMBER, '').trim()
        return cut.length >= MIN_KEPT ? cut : step1[i]
    })
}
