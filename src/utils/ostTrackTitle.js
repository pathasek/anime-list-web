// Čištění názvů skladeb v OST přehrávači.
//
// Názvy chodí z noembed.com, což jsou syrové titulky YouTube videí. Nahrávající
// si do nich skoro vždy přidá stále stejnou slupku, buď na začátek, nebo na
// konec:
//
//   BERSERK (1997) Original Soundtrack - Behelit          -> Behelit
//   ReZero kara Hajimeru Isekai Seikatsu Ost   06  Fool   -> Fool
//   ətˈæk 0N tάɪtn - Attack on Titan OST - Hiroyuki Sawano -> ətˈæk 0N tάɪtn
//   Girl's pastime — SPY x FAMILY [OST]                   -> Girl's pastime
//
// Postup:
//   1. Ozdoby jednotlivého názvu: 「…」【…】 na začátku, rok v závorce, číslo disku.
//   2. Opakující se slupka: napříč celým playlistem se hledá začátek nebo konec,
//      který sdílí aspoň tři skladby, a ten se usekne. Kolo se opakuje, dokud
//      je co odebírat, protože slupky bývají navrstvené
//      („Lord Of Mysteries EP 7 OST - … - Epic Orchestra Cover").
//   3. Úklid okrajů: zbylé oddělovače, obal typu „-Název-", uvozovky kolem celku.
//
// Proč to nestačí řešit seznamem vzorů: playlisty jsou každý jiný a pevný vzor
// buď nesedne (Re:Zero má za slovem Ost rovnou číslo, ne pomlčku), nebo sedne
// moc (dřívější vzor na „OST -" ukusoval u Attack on Titan celý název skladby
// a nechával jen jméno skladatele).
//
// Pojistky: nikdy se neodebírá tolik, aby zbyl pahýl, a nikdy se neodebere
// slupka, po které by ze dvou různých skladeb byl stejný název.

const MIN_KEPT = 2        // kratší výsledek než tohle je podezřelý
const MIN_AFFIX = 4       // kratší slupka nemá cenu řešit
const MIN_HITS = 3        // slupka musí být aspoň u tří skladeb
const MAX_AFFIX_WORDS = 14
const MAX_ROUNDS = 12

// Závorkové bloky na ZAČÁTKU názvu: 「…」【…】［…］《…》 a hranaté závorky.
// Ty uvnitř názvu se nechávají být, tam obvykle nesou význam.
const LEADING_BRACKETS = /^\s*(?:[「【［〔《〈][^」】］〕》〉]*[」】］〕》〉]|\[[^\]]*\])\s*/
// Označení disku, které zůstane po odstranění závorek: „CD1", „Disc 2"
const LEADING_DISC = /^\s*(?:cd|disc|disk)\s*\d+\s*[.\-–—:)]*\s*/i
// Rok v závorce hned na začátku: „(1997) "
const LEADING_YEAR = /^\s*\((?:19|20)\d{2}\)\s*[-–—:]?\s*/
// Pořadové číslo skladby. Samotná číslice se bere jen tehdy, když za ní stojí
// oddělovač nebo mezera, aby „0N tάɪtn" neprošlo jako číslo stopy.
const TRACK_NUMBER = /^[\s.:)\-–—]*(?:#\s*\d{1,3}|track\s*\d{1,3}|\d{1,3}(?=[\s.:)\-–—]))[\s.:)\-–—]*/i

const EDGE_LEAD = /^[\s\-–—:|~,.]+/
// Na konci usekáváme jen oddělovač oddělený mezerou („Název - "), aby přežila
// japonská podoba podtitulu typu „Hack -Short Vision-".
const EDGE_TAIL = /(?:\s+[-–—:|,]+|[\s:|,]+)$/
const WRAP_DASH = /^[-–—](?!\s)([\s\S]*?)(?<!\s)[-–—]$/
const OST_WORD = /(?:^|[\s[(:|~-])(?:ost|soundtrack|original\s+score)(?:$|[\s\])(:|~-])/i
const SEP_END = ['-', '–', '—', '|', ':']
// Slupka na konci musí začínat oddělovačem. Bez toho by se ze skutečného názvu
// „Beyond the Journey's End" (Frieren) ukously poslední dvě slova jen proto, že
// se stejná dvojice opakuje i v názvu anime. Kulatá závorka tu schválně není,
// aby playlist plný „(Instrumental)" nepřišel o rozlišení verzí.
const TAIL_START = ['-', '–', '—', '|', '[', '~', ':', '#']
const QUOTE_PAIRS = [['"', '"'], ['“', '”'], ['„', '“'], ['『', '』'], ['「', '」'], ['«', '»']]
// Slova, která o shodě s názvem anime nic neříkají.
const STOPWORDS = new Set(['the', 'of', 'and', 'in', 'a', 'no', 'to', 'wo', 'ga', 'wa', 'de', 'season', 'ost'])

/** Významová slova názvu, malými písmeny a bez interpunkce. */
function significantWords(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[^0-9a-z぀-ヿ一-鿿 ]+/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

/** Úklid okrajů: zbylé oddělovače, obal „-Název-", uvozovky kolem celku. */
function tidy(input) {
    let s = String(input || '').replace(/\s{2,}/g, ' ').trim()
    for (let i = 0; i < 3; i++) {
        const before = s
        // Obal „-Název-" řešíme dřív než okraje, jinak by zůstala viset
        // jen závěrečná pomlčka.
        const wrap = WRAP_DASH.exec(s.trim())
        if (wrap && wrap[1].trim().length >= MIN_KEPT) s = wrap[1].trim()
        s = s.replace(EDGE_LEAD, '').replace(EDGE_TAIL, '').trim()
        for (const [open, close] of QUOTE_PAIRS) {
            const inner = s.slice(1, -1)
            if (s.length > 2 && s.startsWith(open) && s.endsWith(close)
                && !inner.includes(open) && !inner.includes(close)) {
                s = inner.trim()
                break
            }
        }
        if (s === before) break
    }
    return s
}

/** Jeden název: odstraní ozdoby, které nesouvisí se zbytkem playlistu. */
export function stripTitleDecorations(title) {
    if (!title) return title
    let out = String(title)
    // Vzory se pouštějí dokola, protože se řetězí: „「Cross Ange」【CD1】…".
    for (let i = 0; i < 6; i++) {
        const before = out
        out = out.replace(LEADING_BRACKETS, '').replace(LEADING_YEAR, '').replace(LEADING_DISC, '')
        if (out === before) break
    }
    return out.trim()
}

/** Všechny začátky (nebo konce) na hranici slov a jejich četnost. */
function affixCounts(titles, tail) {
    const counts = new Map()
    for (const t of titles) {
        const w = t.split(/\s+/)
        const max = Math.min(w.length, MAX_AFFIX_WORDS)
        for (let k = 1; k <= max; k++) {
            const key = tail ? w.slice(w.length - k).join(' ') : w.slice(0, k).join(' ')
            counts.set(key, (counts.get(key) || 0) + 1)
        }
    }
    return counts
}

/**
 * Je slupka „dotažená na konec"? Prodloužení o jedno slovo už musí mít méně
 * výskytů, jinak jsme uřízli uprostřed slupky. Tohle drží pohromadě celé
 * čištění: bez toho by se u Demon Slayer usekávalo „(HQ) Demon Slayer - The"
 * i s prvním slovem názvu.
 */
function isMaximal(affix, count, counts, tail) {
    const words = affix.split(/\s+/).length
    for (const [key, value] of counts) {
        if (value !== count || key.length <= affix.length) continue
        if (key.split(/\s+/).length !== words + 1) continue
        if (tail ? key.endsWith(' ' + affix) : key.startsWith(affix + ' ')) return false
    }
    return true
}

/** Vypadá to na slupku od nahrávajícího, ne na část názvu skladby? */
function isBoilerplate(affix, count, total, animeWords, tail, followedByNumber, followedBySep) {
    if (count < MIN_HITS || affix.length < MIN_AFFIX) return false
    if (tail) {
        // Koncová slupka musí být oddělená, jinak by šlo o poslední slova názvu.
        if (!TAIL_START.includes(affix[0])) return false
    } else if (!SEP_END.includes(affix[affix.length - 1]) && !followedByNumber
               && !followedBySep && count < total * 0.25) {
        // Začátek bez oddělovače bereme jen tehdy, když se opakuje u čtvrtiny
        // playlistu (typicky „Madoka Magica " před každým názvem).
        return false
    }
    // Obsahuje aspoň dvě významová slova z názvu anime.
    const words = new Set(significantWords(affix))
    let shared = 0
    for (const w of animeWords) if (words.has(w)) shared++
    if (shared >= 2) return true
    // Mluví o vydání („OST", „Original Soundtrack").
    if (OST_WORD.test(affix)) return true
    // Za začátkem stojí u všech skladeb pořadové číslo.
    if (!tail && followedByNumber) return true
    // Nadpoloviční většina skladeb a končí (začíná) oddělovačem. Tím se chytí
    // i slupka, která název anime vůbec neobsahuje, třeba „- Hiroyuki Sawano".
    if (count >= total * 0.5) {
        const edge = tail ? affix[0] : affix[affix.length - 1]
        if (SEP_END.includes(edge)) return true
    }
    return false
}

function countDuplicates(list) {
    return list.length - new Set(list).size
}

/**
 * Vyčistí celý playlist najednou.
 * @param {string[]} titles syrové titulky
 * @param {string} [animeName] název anime, pomáhá poznat slupku
 * @returns {string[]} vyčištěné názvy (stejná délka i pořadí)
 */
export function cleanTrackTitles(titles, animeName = '') {
    const raw = titles || []
    let work = raw.map(t => (t ? stripTitleDecorations(t) : ''))
    const total = work.filter(Boolean).length
    if (total < 2) return work.map((t, i) => tidy(t) || String(raw[i] || '').trim())

    const animeWords = new Set(significantWords(animeName))
    const blocked = new Set()

    for (let round = 0; round < MAX_ROUNDS; round++) {
        let changed = false
        for (const tail of [false, true]) {
            const live = work.filter(Boolean)
            const counts = affixCounts(live, tail)

            let best = null
            for (const [affix, count] of counts) {
                if (count < MIN_HITS || affix.length < MIN_AFFIX) continue
                if (blocked.has(tail + ' ' + affix)) continue
                if (!isMaximal(affix, count, counts, tail)) continue

                let followedByNumber = false
                let followedBySep = false
                if (!tail) {
                    const rests = live.filter(t => t !== affix && t.startsWith(affix))
                                      .map(t => t.slice(affix.length).trimStart())
                    followedByNumber = rests.length > 0 && rests.every(r => TRACK_NUMBER.test(r))
                    followedBySep = rests.length > 0 && rests.every(r => SEP_END.includes(r[0]))
                }
                if (!isBoilerplate(affix, count, total, animeWords, tail, followedByNumber, followedBySep)) continue
                // Nejdřív nejčastější slupka, teprve při shodě ta delší.
                if (!best || count > best.count || (count === best.count && affix.length > best.affix.length)) {
                    best = { affix, count }
                }
            }
            if (!best) continue

            const { affix } = best
            const hits = []
            work.forEach((t, i) => {
                if (t && t !== affix && (tail ? t.endsWith(affix) : t.startsWith(affix))) hits.push(i)
            })
            let rests = hits.map(i => (tail ? work[i].slice(0, -affix.length) : work[i].slice(affix.length)))
            // Pořadové číslo usekáváme jen když jím začíná většina zbytků.
            // Dvakrát kvůli tvaru „Disc 1 - 21. Název".
            if (!tail) {
                for (let pass = 0; pass < 2; pass++) {
                    const numbered = rests.filter(r => TRACK_NUMBER.test(r)).length
                    if (numbered < rests.length * 0.5) break
                    rests = rests.map(r => r.replace(TRACK_NUMBER, ''))
                }
            }
            rests = rests.map(tidy)

            const trial = work.slice()
            hits.forEach((i, k) => { if (rests[k].length >= MIN_KEPT) trial[i] = rests[k] })

            // Pojistka proti slepování: když by useknutí udělalo z různých
            // skladeb stejný název (jiný film, stejné číslo stopy), necháme
            // slupku být. Jinak by v seznamu bylo pětkrát „M06".
            if (countDuplicates(trial) - countDuplicates(work) > Math.max(1, hits.length * 0.2)) {
                blocked.add(tail + ' ' + affix)
                continue
            }
            if (trial.some((t, i) => t !== work[i])) {
                work = trial
                changed = true
            }
        }
        if (!changed) break
    }

    // Zbylé pořadové číslo na začátku, když jím začíná většina playlistu.
    const numbered = work.filter(t => t && TRACK_NUMBER.test(t)).length
    if (numbered >= total * 0.5) work = work.map(t => (t ? t.replace(TRACK_NUMBER, '') : t))

    return work.map((t, i) => {
        const cleaned = tidy(t)
        return cleaned.length >= MIN_KEPT ? cleaned : String(raw[i] || '').trim()
    })
}
