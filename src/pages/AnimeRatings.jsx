import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useImperativeHandle, forwardRef, Fragment, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import {
    Chart as ChartJS,
    registerables
} from 'chart.js'
import { Bar, Chart } from 'react-chartjs-2'
import regression from 'regression'
import {
    extractMalId,
    getCachedEpisodeList
} from '../utils/jikanService'
import './AnimeRatings.css'
import { customSeasonOrders } from '../utils/customSeasonOrders'
import { useCustomImages, getPageBackground } from '../utils/customImages'
import { formatReview } from '../utils/formatReview'
import { getThemeChartColors } from '../utils/chartTheme'
import { useTheme } from '../components/ThemeProvider'
import { RatingInfoButton, CategoryGuideModal, EpisodeGuideModal, FinalGuideModal } from '../components/RatingGuideModals'
import CategoryRatingsPanel from '../components/CategoryRatingsPanel'
import { formatCategoryMarkdown } from '../utils/formatCategoryMarkdown'
import CategoryRadar from '../components/CategoryRadar'
import InfoIcon from '../components/InfoIcon'
import { useModalScrollLock } from '../utils/useModalScrollLock'
import { useModalTables } from '../utils/useModalTables'
import { useRatingGuide } from '../utils/ratingGuide'

// Cache pro AI rozbory kategorií/epizod (category_texts.json — víc MB, načíst jen jednou)
let cachedCategoryTexts = null
async function loadCategoryTexts() {
    if (cachedCategoryTexts) return cachedCategoryTexts
    try {
        const response = await fetch('data/category_texts.json?v=' + Date.now())
        if (!response.ok) return {}
        cachedCategoryTexts = await response.json()
        return cachedCategoryTexts
    } catch {
        return {}
    }
}

// B4-6: Jikan tituly epizod u specials/ONA často začínají redundantním prefixem
// s názvem anime („Lord of Mysteries Special: City of Silver") — v úzkém seznamu
// se pak ořízne právě na generický název. Prefix před dvojtečkou odstraníme jen
// tehdy, když odpovídá názvu série nebo anime (konzervativně, aby se nesahalo na
// stylové prefixy typu „Sentence: …", které nejsou názvem anime).
const normTitleKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
function cleanJikanEpTitle(title, animeName, seriesName) {
    const t = String(title || '').trim()
    const nA = normTitleKey(animeName)
    const nS = normTitleKey(seriesName)
    // Titul je celý jen názvem anime/série → generický, ať zafunguje fallback
    const nT = normTitleKey(t)
    if (!nT || nT === nA || (nS && nT === nS)) return ''
    const ci = t.indexOf(':')
    if (ci > 2) {
        const pre = normTitleKey(t.slice(0, ci))
        if ((nS && pre.startsWith(nS)) || (nA && pre.startsWith(nA))) {
            const rest = t.slice(ci + 1).trim()
            if (rest) return rest
        }
    }
    return t
}

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

// Fallback řetěz pro zobrazený titul epizody: Jikan (očištěný) → DOCX rozbor
// (bez „Epizoda N:" prefixu a „(Premiéra …)" dovětku) → „Epizoda N".
function episodeDisplayTitle(ep, seriesName, categoryReviews) {
    const cleaned = cleanJikanEpTitle(ep.title, ep.animeName, seriesName)
    if (cleaned) return cleaned
    const docxEp = getDocxEpisode(categoryReviews?.[ep.animeName], ep.mal_id)
    const docx = docxEp?.title
    if (docx) {
        const stripped = docx
            .replace(/^Epizoda\s*\d+\s*:\s*/i, '')
            .replace(/\s*\(Premiéra[^)]*\)\s*$/i, '')
            .trim()
        if (stripped) return stripped
    }
    return `Epizoda ${ep.mal_id}`
}

// B4-1: odložený mount těžkých sekcí pod foldem (žebříčky, průzkum, heatmapa…).
// Přepnutí z rozcestníku tak nejdřív vykreslí a namaluje horní část pohledu
// a zbytek se namountuje až po prvním paintu (idle) — lag klesne z ~1 s na
// dobu mountu samotné row-1. Placeholder drží přibližnou výšku, aby nescákal
// scrollbar.
function Deferred({ children, placeholderHeight = 600 }) {
    const [show, setShow] = useState(false)
    useEffect(() => {
        // Záměrně bez requestAnimationFrame — v zakrytých/pozadních kartách
        // Chrome rAF nefiruje a sekce by se nikdy nenamountovaly. Idle callback
        // s timeoutem + timer pojistka fungují vždy.
        let done = false
        const fire = () => { if (!done) { done = true; setShow(true) } }
        const idleId = ('requestIdleCallback' in window)
            ? requestIdleCallback(fire, { timeout: 400 })
            : null
        const timerId = setTimeout(fire, 250)
        return () => {
            done = true
            if (idleId !== null) cancelIdleCallback(idleId)
            clearTimeout(timerId)
        }
    }, [])
    if (!show) return <div style={{ minHeight: placeholderHeight }} aria-hidden="true" />
    return children
}

// Modální okno pro AI rozbor epizody — stejné jako v detailu anime.
// Řízené imperativně (ref.open(ep)) a s vlastním stavem, takže klik na bod grafu
// NEvyvolá re-render celé (těžké) stránky → žádný lag při otevírání/zavírání.
const EpisodeModalHost = forwardRef(function EpisodeModalHost(_props, ref) {
    const [active, setActive] = useState(null)
    useImperativeHandle(ref, () => ({ open: (ep) => setActive(ep) }), [])
    useModalScrollLock(!!active)
    // Tabulky z rozboru: scroll-x fallback, push-off a rohy sticky hlavičky
    const bodyRef = useRef(null)
    useModalTables(bodyRef, !!active)
    if (!active) return null

    const { title, text, rating } = active
    const close = () => setActive(null)
    const handleOverlayClick = (e) => { if (e.target === e.currentTarget) close() }
    const fmtR = (r) => (r === null || r === undefined) ? 'N/A' : r.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

    return createPortal(
        <div className="category-detail-modal-overlay" onClick={handleOverlayClick}>
            <div className="category-detail-modal">
                <div className="category-detail-modal-header">
                    <div className="category-detail-modal-title">
                        <span className="category-card-icon">📝</span>
                        <span>{title}</span>
                        {rating !== undefined && rating !== null && (
                            <span className="category-detail-modal-score">{fmtR(rating)}/10</span>
                        )}
                    </div>
                    <button type="button" className="category-detail-modal-close" onClick={close} aria-label="Zavřít">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="category-detail-modal-body" ref={bodyRef}>
                    <div className="category-detail-text-column">
                        {formatCategoryMarkdown(text)}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
})

ChartJS.register(...registerables)

// Batch 3 task 2: SVG ikonky pro metagrid hlavičky série — stejný jazyk jako
// InfoIcon (stroke currentColor, dědí barvu z labelu), ať hlavička není jen text.
const SERIES_META_ICON_PATHS = {
    avgEp: <><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></>,
    wa: <><path d="M12 3l8.5 6.2-3.2 9.8h-10.6l-3.2-9.8z" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
    parts: <><polygon points="12 2 22 8.5 12 15 2 8.5" /><polyline points="2 14 12 20.5 22 14" /></>,
    episodes: <><rect x="3" y="5" width="18" height="14" rx="2" /><polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none" /></>,
    time: <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
    release: <><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" /></>,
    watched: <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>,
    rewatch: <><polyline points="1.5 5 1.5 10 6.5 10" /><path d="M3 15a9 9 0 1 0 .8-7.2L1.5 10" /></>,
    studio: <><path d="M4 21V7l6-4v18" /><path d="M10 9l10 3v9" /><line x1="2" y1="21" x2="22" y2="21" /><line x1="7" y1="9" x2="7" y2="9.01" /><line x1="7" y1="13" x2="7" y2="13.01" /><line x1="7" y1="17" x2="7" y2="17.01" /></>,
}

function SeriesMetaIcon({ kind }) {
    const paths = SERIES_META_ICON_PATHS[kind]
    if (!paths) return null
    return (
        <svg className="series-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {paths}
        </svg>
    )
}

// Task 1: skupiny kategorií pro panel „Vliv kategorií na finální hodnocení“.
// Souvislé bloky v kanonickém pořadí (Animace první, OST poslední).
const R2_GROUPS = [
    { name: 'Vizuál', icon: '🎬', color: '6, 182, 212', cats: ['Animace', 'CGI'] },
    { name: 'Postavy', icon: '👥', color: '168, 85, 247', cats: ['MC', 'Vedlejší postavy', 'Waifu'] },
    { name: 'Příběh', icon: '📖', color: '245, 158, 11', cats: ['Plot', 'Pacing', 'Story Conclusion', 'Originalita', 'Emoce'] },
    { name: 'Zážitek', icon: '⭐', color: '34, 197, 94', cats: ['Enjoyment'] },
    { name: 'Hudba', icon: '🎵', color: '236, 72, 153', cats: ['OP', 'ED', 'OST'] },
]

// Task 2: detailnější popis mého hodnocení jednotlivých kategorií.
// Fallback texty — primárně se „Pojetí" načítá z data/rating_guide.json
// (WORD dokument „Hodnocení - Průvodce (WEB).docx" na ploše).
const CATEGORY_PHILOSOPHY_MOCK = {
    'Animace': 'Plynulost pohybu, konzistence modelů, sakuga momenty a celková vizuální řemeslnost. Zajímá mě, jak animace slouží vyprávění — ne jen kolik snímků má souboj.',
    'CGI': 'Jak se 3D prvky snáší s 2D estetikou. Dobré CGI si nevšimnu, špatné mě vytrhne ze scény. Hodnotím integraci, ne samotnou existenci.',
    'MC': 'Hloubka, motivace a vývoj hlavní postavy. Musí činit rozhodnutí, která dávají smysl v rámci jejího charakteru — a nést jejich následky.',
    'Vedlejší postavy': 'Mají vlastní cíle, nebo jen orbitují kolem MC? Silný vedlejší ansámbl dokáže vytáhnout i průměrný příběh.',
    'Waifu': 'Subjektivní kategorie — charisma, chemie s ostatními a zapamatovatelnost oblíbených postav.',
    'Plot': 'Struktura, logika a soudržnost příběhu. Odpouštím pomalé rozjezdy, neodpouštím díry a deus ex machina.',
    'Pacing': 'Tempo vyprávění — kdy zrychlit, kdy nechat scénu dýchat. Filler a zbytečné rekapitulace srážejí dolů.',
    'Story Conclusion': 'Jak série zakončí, co rozehrála. Otevřený konec může být záměr, nedotažený konec je chyba.',
    'Originalita': 'Nový nápad, nebo alespoň svěží uchopení žánrových klišé. Poctivé řemeslo bez originality může být pořád skvělé — ale tady se hodnotí ta jiskra navíc.',
    'Emoce': 'Dokázalo mě to rozesmát, dojmout, nebo mi zrychlit tep? Emocionální zásah je pro mě jeden z nejsilnějších ukazatelů kvality.',
    'Enjoyment': 'Čistá radost ze sledování — jak moc jsem se těšil na další díl, bez ohledu na objektivní kvality.',
    'OP': 'Openingová znělka — hudba, střih, vizuál a jak dobře nastavuje tón série.',
    'ED': 'Endingová znělka — často podceňovaná; dobrý ED umí dovyprávět epizodu a nechat ji doznít.',
    'OST': 'Soundtrack v epizodách — jak hudba podpírá scény a jestli obstojí i samostatně mimo obraz.',
}

// A self-contained debounced search input component to prevent parent re-renders while typing.
const DebouncedSearchInput = ({ placeholder, onSearch, initialValue = '' }) => {
    const [val, setVal] = useState(initialValue);
    const [focused, setFocused] = useState(false);

    // Synchronize inner value if initialValue changes externally and input is not active
    const [prevInitial, setPrevInitial] = useState(initialValue);
    if (prevInitial !== initialValue) {
        setPrevInitial(initialValue);
        if (!focused) {
            setVal(initialValue);
        }
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            onSearch(val);
        }, 350);
        return () => clearTimeout(timer);
    }, [val, onSearch]);

    return (
        <input
            type="text"
            className="anime-selector-search"
            placeholder={placeholder}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        />
    );
};

const categoryWeights = {
    "Animace": 2.0, "CGI": 1.8, "MC": 3.0, "Vedlejší postavy": 2.5, "Waifu": 1.5,
    "Plot": 4.0, "Pacing": 1.5, "Story Conclusion": 1.5, "Originalita": 2.5,
    "Emoce": 3.5, "Enjoyment": 4.0, "OP": 1.0, "ED": 0.5, "OST": 2.0
}

// Robust clean season labels helper to prevent overlaps in long series (like Monogatari)
const cleanSeasonLabel = (name, seriesName) => {
    let cleaned = name;

    // 1. Strip series name prefix
    if (seriesName) {
        const escapedSeries = seriesName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`^${escapedSeries}(?::\\s*|,\\s*|\\s+|-+\\s*)`, 'i');
        cleaned = cleaned.replace(regex, '');
    }

    // 2. Specialized abbreviation for Monogatari series (Bake, Nise, Neko, Hana, etc.)
    if (seriesName && seriesName.toLowerCase().includes('monogatari')) {
        cleaned = cleaned
            .replace(/Bakemonogatari/i, 'Bake')
            .replace(/Nisemonogatari/i, 'Nise')
            .replace(/Nekomonogatari/i, 'Neko')
            .replace(/Hanamonogatari/i, 'Hana')
            .replace(/Tsukimonogatari/i, 'Tsuki')
            .replace(/Owarimonogatari/i, 'Owari')
            .replace(/Koyomimonogatari/i, 'Koyomi')
            .replace(/Zoku Owarimonogatari/i, 'Zoku Owari')
            .replace(/Series:\s*/i, '')
            .replace(/Off & Monster Season/i, 'Off & Monster');
    } else {
        cleaned = cleaned.replace(/monogatari/gi, 'mono.');
    }

    // 3. General cleaning of long suffixes
    cleaned = cleaned
        .replace(/:\s*Kimetsu no Yaiba\s*-?/i, '')
        .replace(/Second Season/i, 'S2')
        .replace(/First Season/i, 'S1')
        .replace(/Third Season/i, 'S3')
        .replace(/Season\s*(\d+)/i, 'S$1')
        .replace(/Part\s*(\d+)/i, 'P$1');

    // 4. Standardize identical name to "S1"
    if (seriesName && cleaned.trim().toLowerCase() === seriesName.trim().toLowerCase()) {
        cleaned = "S1";
    }

    return cleaned;
};

// Robust duration formatting for episodes/movies (handles seconds as numbers and text like "1 hr 3 min")
const formatDuration = (durationVal) => {
    if (!durationVal) return '';
    if (typeof durationVal === 'number') {
        return `${Math.round(durationVal / 60)} min`;
    }
    const str = String(durationVal).trim();
    if (/^\d+$/.test(str)) {
        return `${Math.round(Number(str) / 60)} min`;
    }
    return str; // Returns pre-formatted strings like "1 hr 3 min" directly
};

// ============================================================================
// RE:ZERO WITCH FACTOR HEPTAGRAM CONFIG & RENDERING
// ============================================================================
const heptagramVertices = [
    { id: 1, name: 'Typhon', label: '1', x: 100.0, y: 168.0, tagDx: -10, tagDy: 10, witch: 'pride' },
    { id: 2, name: 'Minerva', label: '2', x: 46.8, y: 142.4, tagDx: -12, tagDy: 7, witch: 'wrath' },
    { id: 3, name: 'Daphne', label: '3', x: 33.7, y: 84.9, tagDx: -13, tagDy: -5, witch: 'gluttony' },
    { id: 4, name: 'Echidna', label: '4', x: 70.5, y: 38.7, tagDx: -11, tagDy: -10, witch: 'greed' },
    { id: 5, name: 'Carmilla', label: '5', x: 129.5, y: 38.7, tagDx: 11, tagDy: -10, witch: 'lust' },
    { id: 6, name: 'Sekhmet', label: '6', x: 166.3, y: 84.9, tagDx: 13, tagDy: -5, witch: 'sloth' },
    { id: 7, name: 'Satella', label: '7', x: 153.2, y: 142.4, tagDx: 12, tagDy: 7, witch: 'envy' }
];

const renderBaseSkull = (opacity = 0.85) => (
    <g opacity={opacity} className="base-skull">
        {/* Skull dome & cheekbone contour */}
        <path
            d="M -5,-5 C -5,-10 5,-10 5,-5 C 5,-2 4.2,0 3.2,1.8 L 2.8,4.5 C 2.8,5.2 2.0,5.8 1.2,5.8 L -1.2,5.8 C -2.0,5.8 -2.8,5.2 -2.8,4.5 L -3.2,1.8 C -4.2,0 -5,-2 -5,-5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
        />
        {/* Eye sockets */}
        <ellipse cx="-1.8" cy="-4.5" rx="1.2" ry="1.5" fill="currentColor" />
        <ellipse cx="1.8" cy="-4.5" rx="1.2" ry="1.5" fill="currentColor" />
        {/* Nose cavity */}
        <path d="M 0,-2.2 L -0.6,-1 L 0.6,-1 Z" fill="currentColor" />
        {/* Teeth/Jaw lines */}
        <line x1="-1.2" y1="1.8" x2="1.2" y2="1.8" stroke="currentColor" strokeWidth="0.8" />
        <line x1="-1.2" y1="1.8" x2="-1.2" y2="4.5" stroke="currentColor" strokeWidth="0.8" />
        <line x1="0" y1="1.8" x2="0" y2="4.5" stroke="currentColor" strokeWidth="0.8" />
        <line x1="1.2" y1="1.8" x2="1.2" y2="4.5" stroke="currentColor" strokeWidth="0.8" />
    </g>
);

const renderWitchDetails = (witch) => {
    switch (witch) {
        case 'pride': // Typhon (Bottom, 1) - sunburst radiating lines
            return (
                <g className="witch-pride" stroke="currentColor" strokeWidth="0.6" opacity="0.8">
                    {/* Radiating lines in bottom half of circle */}
                    <line x1="-3" y1="5" x2="-7" y2="12" />
                    <line x1="3" y1="5" x2="7" y2="12" />
                    <line x1="-1.5" y1="5.5" x2="-3.5" y2="12" />
                    <line x1="1.5" y1="5.5" x2="3.5" y2="12" />
                    <line x1="0" y1="5.8" x2="0" y2="12.5" strokeWidth="0.8" />
                    <line x1="-4.5" y1="4.5" x2="-10" y2="10" />
                    <line x1="4.5" y1="4.5" x2="10" y2="10" />
                    <line x1="-6" y1="3" x2="-12" y2="6.5" />
                    <line x1="6" y1="3" x2="12" y2="6.5" />
                </g>
            );
        case 'wrath': // Minerva (Bottom-Left, 2) - collar points below chin
            return (
                <g className="witch-wrath" stroke="currentColor" fill="none">
                    {/* Collar/Frills under chin */}
                    <path d="M -3.5,5.5 L -5.5,9.5 L -2,7.5 L 0,10.5 L 2,7.5 L 5.5,9.5 L 3.5,5.5 Z" strokeWidth="0.85" fill="var(--bg-tertiary)" />
                    {/* Angry furrowed brow */}
                    <path d="M -3.2,-6.8 L -0.5,-5.5 M 3.2,-6.8 L 0.5,-5.5" strokeWidth="1.1" />
                </g>
            );
        case 'gluttony': // Daphne (Upper-Left, 3) - bunny/beast ears and long wavy tongue
            return (
                <g className="witch-gluttony" stroke="currentColor" fill="none">
                    {/* Beast ears on top of head */}
                    <path d="M -4,-9 L -8,-14 L -2.5,-8.5" strokeWidth="0.9" fill="var(--bg-tertiary)" />
                    <path d="M 4,-9 L 8,-14 L 2.5,-8.5" strokeWidth="0.9" fill="var(--bg-tertiary)" />
                    {/* Long tongue sticking out from teeth */}
                    <path d="M 0,2.5 C -1,5 -5,7 -2.5,12 C -2,13 -0.5,13 -1,11" strokeWidth="0.95" />
                </g>
            );
        case 'greed': // Echidna (Top-Left, 4) - spiral eyes and cheek whiskers
            return (
                <g className="witch-greed" stroke="currentColor" fill="none">
                    {/* Concentric spiral eyes */}
                    <circle cx="-1.8" cy="-4.5" r="1.5" strokeWidth="0.55" />
                    <circle cx="-1.8" cy="-4.5" r="0.75" strokeWidth="0.45" />
                    <circle cx="1.8" cy="-4.5" r="1.5" strokeWidth="0.55" />
                    <circle cx="1.8" cy="-4.5" r="0.75" strokeWidth="0.45" />
                    {/* Cheek whiskers/radiating lines */}
                    <line x1="-4" y1="-3" x2="-8.5" y2="-4.2" strokeWidth="0.75" />
                    <line x1="-4.2" y1="-1.5" x2="-9" y2="-2" strokeWidth="0.75" />
                    <line x1="-3.8" y1="0.2" x2="-8.2" y2="0.6" strokeWidth="0.75" />
                    <line x1="4" y1="-3" x2="8.5" y2="-4.2" strokeWidth="0.75" />
                    <line x1="4.2" y1="-1.5" x2="9" y2="-2" strokeWidth="0.75" />
                    <line x1="3.8" y1="0.2" x2="8.2" y2="0.6" strokeWidth="0.75" />
                </g>
            );
        case 'lust': // Carmilla (Top-Right, 5) - Bone and grapes/berries
            return (
                <g className="witch-lust" stroke="currentColor" fill="none">
                    {/* Bone on the upper-left of skull */}
                    <line x1="-9" y1="-9" x2="-4" y2="-4" strokeWidth="1.2" />
                    <circle cx="-9" cy="-9" r="1.1" fill="currentColor" />
                    <circle cx="-10" cy="-7.8" r="1.1" fill="currentColor" />
                    {/* Grapes/berries bunch on the upper-right of skull */}
                    <g fill="currentColor" opacity="0.85" stroke="none">
                        <circle cx="5" cy="-8.5" r="1.1" />
                        <circle cx="7" cy="-7.5" r="1.1" />
                        <circle cx="6" cy="-9.5" r="1.1" />
                        <circle cx="8" cy="-9.5" r="1.1" />
                        <circle cx="7" cy="-11.2" r="1.1" />
                        <circle cx="5.2" cy="-10.5" r="1.0" />
                    </g>
                </g>
            );
        case 'sloth': // Sekhmet (Upper-Right, 6) - Hair strands framing face
            return (
                <g className="witch-sloth" stroke="currentColor" fill="none">
                    {/* Hair strands on left and right */}
                    <path d="M -5,-8 C -7,-3 -7,2 -5,6 C -3.8,1 -4,-3 -3,-5" strokeWidth="0.8" fill="var(--bg-tertiary)" />
                    <path d="M 5,-8 C 7,-3 7,2 5,6 C 3.8,1 4,-3 3,-5" strokeWidth="0.8" fill="var(--bg-tertiary)" />
                </g>
            );
        case 'envy': // Satella (Bottom-Right, 7) - Hood shroud framing entire skull
            return (
                <g className="witch-envy" stroke="currentColor" fill="none">
                    {/* Shroud contour */}
                    <path d="M -6.5,-4 C -6.5,-11 6.5,-11 6.5,-4 C 6.5,2 4.8,7.5 0,7.5 C -4.8,7.5 -6.5,2 -6.5,-4 Z" strokeWidth="0.85" fill="none" />
                    {/* Inner shroud fold line */}
                    <path d="M -5.5,-5 C -5.5,-10 5.5,-10 5.5,-5" strokeWidth="0.5" strokeDasharray="1.5 1.5" />
                </g>
            );
        default:
            return null;
    }
};

function AnimeRatings() {
    // ---- CHART THEME COLORS ----
    const { theme } = useTheme();
    const c = useMemo(() => getThemeChartColors(), [theme]); // forces re-render on theme change

    // ---- DATA STATES ----
    const [animeList, setAnimeList] = useState([])
    const [categoryRatings, setCategoryRatings] = useState([])
    const [episodeRatings, setEpisodeRatings] = useState([])
    const [notes, setNotes] = useState([])
    const [imdbCache, setImdbCache] = useState({})
    const [categoryReviews, setCategoryReviews] = useState(null)   // AI rozbory kategorií/epizod
    const episodeModalRef = useRef(null)                           // imperativní ovládání rozboru epizody
    const [loading, setLoading] = useState(true)

    // ---- CUSTOM IMAGES ----
    const customImages = useCustomImages()

    // Texty „Moje pojetí kategorie" z WORD dokumentu (rating_guide.json);
    // fallback = CATEGORY_PHILOSOPHY_MOCK s poznámkou o pracovním textu
    const ratingGuide = useRatingGuide()
    const philosophyTextFor = useCallback((cat) => {
        const fromDoc = ratingGuide?.categories?.items?.[cat]?.philosophy
        if (fromDoc) return fromDoc
        return `${CATEGORY_PHILOSOPHY_MOCK[cat] || 'Popis se připravuje.'}\n\n*(Zatím pracovní text — detailní popis doplním.)*`
    }, [ratingGuide])

    const location = useLocation()

    // ---- UI STATES: ROUTING & MODES ----
    const [viewMode, setViewModeRaw] = useState(() => {
        return location.state?.fromViewMode || 'split'
    })
    // Přepnutí pohledu je těžký render (grafy + stovky položek) — transition
    // ho nechá doběhnout na pozadí místo zamrznutí UI po kliknutí (task 5);
    // viewPending dává okamžitou vizuální odezvu na klik.
    const [viewPending, startViewTransition] = useTransition()
    const setViewMode = useCallback((mode) => {
        startViewTransition(() => setViewModeRaw(mode))
    }, [startViewTransition])

    // ---- UI STATES: SERIES VIEW ----
    const [selectedSeries, setSelectedSeries] = useState(() => {
        return location.state?.selectedSeries || null
    })
    const [selectedSeriesSeason, setSelectedSeriesSeason] = useState(null)
    const [seriesTab, setSeriesTab] = useState('timeline') // 'timeline' | 'details'
    const [selectedTimelineEp, setSelectedTimelineEp] = useState(null)
    const [compareSeason, setCompareSeason] = useState(null) // část série porovnávaná v radaru (null = jen průměr)
    const [searchQuerySeries, setSearchQuerySeries] = useState('')
    const [showTrendLine, setShowTrendLine] = useState(true)
    const [ratingSource, setRatingSource] = useState('moje') // 'moje' | 'mal' | 'imdb'
    const [franchiseJikanCache, setFranchiseJikanCache] = useState({})

    const [jikanEpisodes, setJikanEpisodes] = useState(null)  // episode list from Jikan for current anime
    const [jikanSynopsis, setJikanSynopsis] = useState(null)  // synopsis detail for selected episode
    const [jikanLoading, setJikanLoading] = useState(false)
    const selectedTimelineEpRef = useRef(null)
    selectedTimelineEpRef.current = selectedTimelineEp

    // Série: levý selektor „Vyberte Sérii“ výškově dorovnat pravému sloupci
    // (hero hlavička má dynamickou výšku, takže čistě CSS to kvůli vnitřnímu
    // scrollovacímu seznamu spolehlivě nejde). Spodní hrany se pak zarovnají se
    // „Spojitým vývojem hodnocení epizod“.
    // Pozn.: samotný efekt je přesunut za deklaraci selectedSeriesObj (viz níže),
    // aby šel bezpečně přidat do deps.
    const seriesLeftPanelRef = useRef(null)
    const seriesRightPanelRef = useRef(null)

    // Task 7: můj rozbor k vybrané epizodě ve spojitém grafu (z docx rozborů,
    // stejný zdroj jako graf v detailu anime). U filmů/speciálů bez čísla
    // epizody jde o rozbor děje (story).
    const timelineDocxReview = useMemo(() => {
        if (!categoryReviews || !selectedTimelineEp) return null
        const entry = categoryReviews[selectedTimelineEp.animeName]
        if (!entry) return null
        const m = String(selectedTimelineEp.epName || '').match(/EP\s*(\d+)/i)
        if (m) return getDocxEpisode(entry, parseInt(m[1], 10)) || null
        // story title je jen nadpis sekce („1. Shrnutí děje“) — jako titul
        // panelu se nehodí, proto isStory
        return entry.story ? { ...entry.story, isStory: true } : null
    }, [categoryReviews, selectedTimelineEp])

    // ---- UI STATES: ROW 1 (INDIVIDUAL) ----
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedAnimeTitle, setSelectedAnimeTitle] = useState(null)

    // ---- UI STATES: ROW 2 ----
    const [slicerTyp, setSlicerTyp] = useState('Kategorie')
    const [slicerPolozka, setSlicerPolozka] = useState('Vedlejší postavy')
    const [slicerHodnoceni, setSlicerHodnoceni] = useState('Všechna')
    const [dashListQuery, setDashListQuery] = useState('')      // hledání v seznamu filtrů

    // ---- UI STATES: ROW 3 ----
    const [lbTyp, setLbTyp] = useState('Epizody')
    const [lbSort, setLbSort] = useState('Nejlepší')
    const [lbCount, setLbCount] = useState(30)
    const [instabCount, setInstabCount] = useState(30)          // Top N nestabilních anime

    // ---- UI STATES: ROW 4 (CATEGORY TABLE) ----
    const [tableSearchQuery, setTableSearchQuery] = useState('')
    const [tableSortColumn, setTableSortColumn] = useState('FH')
    const [tableSortDirection, setTableSortDirection] = useState('desc')

    // ---- UI STATES: Průvodce hodnocením ("?" modály jako v detailu anime) ----
    const [catGuideOpen, setCatGuideOpen] = useState(false)
    const [epGuideOpen, setEpGuideOpen] = useState(false)
    const [fhGuideOpen, setFhGuideOpen] = useState(false)

    // Barva podle hodnoty hodnocení (stejná škála jako v detailu anime)
    const ratingVar = (r) => r >= 10 ? 'var(--rating-10)' : r >= 9 ? 'var(--rating-9)' : r >= 8 ? 'var(--rating-8)' : r >= 7 ? 'var(--rating-7)' : r >= 6 ? 'var(--rating-6)' : r >= 5 ? 'var(--rating-5)' : r >= 4 ? 'var(--rating-4)' : r >= 3 ? 'var(--rating-3)' : r >= 2 ? 'var(--rating-2)' : 'var(--rating-1)'

    // FH/průměry bez zbytečných koncových nul: 10 → "10", 9,5 → "9,5", 9,67 → "9,67"
    const fmtFH = (v) => Number(Number(v).toFixed(2)).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })


    // ============================================
    // SERIES DATA MEMOIZATION & GROUPING
    // ============================================
    const seriesGroups = useMemo(() => {
        const groups = {}
        animeList.forEach(anime => {
            const sName = anime.series || anime.name
            if (!groups[sName]) groups[sName] = []
            groups[sName].push(anime)
        })

        // Sort seasons/parts within each series based on watch date, status, and name
        Object.keys(groups).forEach(sName => {
            const customOrder = customSeasonOrders[sName]
            if (customOrder) {
                groups[sName].sort((a, b) => {
                    const idxA = customOrder.indexOf(a.name)
                    const idxB = customOrder.indexOf(b.name)
                    if (idxA !== -1 && idxB !== -1) {
                        return idxA - idxB
                    }
                    if (idxA !== -1) return -1
                    if (idxB !== -1) return 1

                    // Fallback to start_date sorting
                    const parseDate = (dStr) => {
                        if (!dStr || dStr === 'X') return new Date(0)
                        return new Date(dStr)
                    }
                    return parseDate(a.start_date) - parseDate(b.start_date)
                })
            } else {
                groups[sName].sort((a, b) => {
                    // 1. Sort by start_date (watch date)
                    const parseDate = (dStr) => {
                        if (!dStr || dStr === 'X') return new Date(0)
                        return new Date(dStr)
                    }
                    const dateA = parseDate(a.start_date)
                    const dateB = parseDate(b.start_date)
                    if (dateA.getTime() !== dateB.getTime()) {
                        return dateA - dateB
                    }

                    // 2. If watch dates are identical, use status as a tie-breaker:
                    // "Pokračování zhlédnuto" (Rank 1) comes before "Neexistuje" (Rank 4)
                    const getStatusRank = (status) => {
                        if (!status) return 5
                        const s = status.toLowerCase()
                        if (s.includes("zhlédnuto") || s.includes("zhlednuto")) return 1
                        if (s.includes("čekám") || s.includes("cekam") || s.includes("airing") || s.includes("existuje")) return 2
                        if (s.includes("nepravděpodobné") || s.includes("nepravdepodobne")) return 3
                        if (s.includes("neexistuje")) return 4
                        return 5
                    }
                    const rankA = getStatusRank(a.status)
                    const rankB = getStatusRank(b.status)
                    if (rankA !== rankB) {
                        return rankA - rankB
                    }

                    // 3. Otherwise, use natural comparison of the names
                    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                })
            }
        })

        return groups
    }, [animeList])

    const seriesList = useMemo(() => {
        return Object.entries(seriesGroups).map(([name, items]) => {
            const ratings = items.map(a => Number(a.rating)).filter(r => !isNaN(r) && r > 0)
            const avgRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length) : 0

            const thumbItem = items.find(a => a.thumbnail)
            const thumbnail = thumbItem ? thumbItem.thumbnail : null

            const studios = Array.from(new Set(items.map(a => a.studio).filter(Boolean)))
            const totalEps = items.reduce((sum, a) => sum + (Number(a.episodes) || 0), 0)

            return {
                name,
                items,
                avgRating,
                thumbnail,
                studios,
                totalEps
            }
        })
            .filter(s => s.items.length > 1) // Pouze franšízy s více než 1 částí/sezónou
            .sort((a, b) => b.avgRating - a.avgRating) // Sort by overall average rating descending
    }, [seriesGroups])

    const filteredSeriesList = useMemo(() => {
        if (!searchQuerySeries) return seriesList
        const lower = searchQuerySeries.toLowerCase()
        return seriesList.filter(s => s.name.toLowerCase().includes(lower))
    }, [seriesList, searchQuerySeries])

    const selectedSeriesObj = useMemo(() => {
        return seriesList.find(s => s.name === selectedSeries) || null
    }, [seriesList, selectedSeries])

    // Height-sync efekt: useLayoutEffect běží synchronně po DOM mutaci (před
    // browser paintem), takže měření right.offsetHeight je přesnější než
    // v useEffect. selectedSeriesObj v deps zajiští přeměření při změně série
    // (hero hlavička, záložky, timeline graf mění výšku pravého sloupce).
    useLayoutEffect(() => {
        const left = seriesLeftPanelRef.current
        const right = seriesRightPanelRef.current
        if (!left || !right) return
        const sync = () => { left.style.height = right.offsetHeight + 'px' }
        sync()

        // Při návratu z detailu (/anime/:name → /ratings) se komponenta mountuje
        // s předvybranou sérií. Hero poster a Chart.js canvas mají asynchronní
        // layout — přeměřujeme na několika rAF ticích, po načtení obrázků a
        // přes ResizeObserver pro pozdější změny (přepnutí zdroje, resize okna).
        const rafs = []
        let tickCount = 0
        const tick = () => {
            sync()
            if (++tickCount < 3) rafs.push(requestAnimationFrame(tick))
        }
        rafs.push(requestAnimationFrame(tick))
        const timeoutId = setTimeout(sync, 500)

        const imgs = right.querySelectorAll('img')
        imgs.forEach((img) => { if (!img.complete) img.addEventListener('load', sync) })

        const ro = new ResizeObserver(sync)
        ro.observe(right)
        return () => {
            ro.disconnect()
            rafs.forEach((id) => cancelAnimationFrame(id))
            clearTimeout(timeoutId)
            imgs.forEach((img) => img.removeEventListener('load', sync))
        }
    }, [viewMode, seriesTab, selectedSeries, selectedSeriesObj])

    const seasonColorMap = useMemo(() => {
        if (!selectedSeriesObj) return {}
        const map = {}
        selectedSeriesObj.items.forEach((item, idx) => {
            const cleanLabel = cleanSeasonLabel(item.name, selectedSeries)
            map[cleanLabel] = idx
        })
        return map
    }, [selectedSeriesObj, selectedSeries])

    const seasonStyles = [
        { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.4)', text: 'rgb(165, 180, 252)' },      // Indigo
        { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)', text: 'rgb(110, 231, 183)' },     // Emerald
        { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)', text: 'rgb(253, 230, 138)' },     // Amber
        { bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.4)', text: 'rgb(94, 234, 212)' },      // Teal
        { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.4)', text: 'rgb(196, 181, 253)' },     // Violet
        { bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.4)', text: 'rgb(244, 143, 177)' },       // Rose
        { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', text: 'rgb(147, 197, 253)' },     // Blue
        { bg: 'rgba(217, 70, 239, 0.12)', border: 'rgba(217, 70, 239, 0.4)', text: 'rgb(240, 171, 252)' }      // Fuchsia
    ]

    // Load data
    useEffect(() => {
        let isMounted = true
        Promise.all([
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/category_ratings.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/episode_ratings.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/notes.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/imdb_cache.json?v=' + Date.now()).then(r => r.json()).catch(() => ({}))
        ]).then(([al, cr, er, nt, ic]) => {
            if (!isMounted) return

            // Sort anime list by reading primarily those that have category ratings
            const animeWithRatings = new Set(cr.map(c => c.name))
            const filteredAl = al.filter(a => animeWithRatings.has(a.name)).sort((a, b) => {
                const ra = Number(a.rating) || 0;
                const rb = Number(b.rating) || 0;
                return rb - ra; // Sort by FH descending
            })
            setAnimeList(filteredAl)
            setCategoryRatings(cr)
            setEpisodeRatings(er)
            setNotes(nt)
            setImdbCache(ic)

            if (filteredAl.length > 0) {
                setSelectedAnimeTitle(filteredAl[0].name)
            }
            setLoading(false)

            // AI rozbory epizod (dotáhnou se na pozadí, graf je použije jakmile dorazí)
            loadCategoryTexts().then(ct => { if (isMounted) setCategoryReviews(ct || {}) })
        }).catch(err => {
            console.error("Failed to load data for Anime Ratings:", err)
            if (isMounted) {
                setLoading(false)
            }
        })

        return () => {
            isMounted = false
        }
    }, [])

    // ============================================
    // JIKAN: Preload Jikan episode lists for all seasons in selected series franchise
    // ============================================
    useEffect(() => {
        if (!selectedSeriesObj || viewMode !== 'series') {
            setFranchiseJikanCache({})
            return
        }

        let isMounted = true
        const loadAll = async () => {
            const cacheObj = {}
            for (const item of selectedSeriesObj.items) {
                if (item.mal_url) {
                    const malId = extractMalId(item.mal_url)
                    if (malId) {
                        try {
                            const cached = await getCachedEpisodeList(malId)
                            if (cached && cached.episodes) {
                                cacheObj[String(malId)] = cached.episodes
                            }
                        } catch (e) {
                            console.warn("[Jikan] Preload failed for MAL ID:", malId, e)
                        }
                    }
                }
            }
            if (isMounted) {
                setFranchiseJikanCache(cacheObj)
            }
        }

        loadAll()
        return () => {
            isMounted = false
        }
    }, [selectedSeriesObj, viewMode])

    // ============================================
    // JIKAN: Load episode list when anime selection changes
    // ============================================
    useEffect(() => {
        if (!selectedSeries || viewMode !== 'series' || !selectedSeriesObj) {
            setJikanEpisodes(null)
            return
        }

        let cancelled = false
        setJikanLoading(true)

        const loadAllSeriesEpisodes = async () => {
            try {
                const results = []
                for (const item of selectedSeriesObj.items) {
                    if (!item.mal_url) continue
                    const malId = extractMalId(item.mal_url)
                    if (!malId) continue

                    const cached = await getCachedEpisodeList(malId)
                    if (cached && cached.episodes && cached.episodes.length > 0) {
                        const mappedEps = cached.episodes.map(ep => ({
                            ...ep,
                            animeName: item.name,
                            cleanSeasonName: cleanSeasonLabel(item.name, selectedSeries)
                        }))
                        results.push({
                            animeName: item.name,
                            episodes: mappedEps
                        })
                    } else {
                        // Fallback: generate synthetic episodes so it shows up immediately in the right list panel!
                        const isMovie = item.type === "Movie" || Number(item.episodes) === 1;
                        const syntheticEps = []
                        const totalEps = Number(item.episodes) || 1

                        for (let epNum = 1; epNum <= totalEps; epNum++) {
                            syntheticEps.push({
                                mal_id: epNum,
                                title: isMovie ? "Film" : `Epizoda ${epNum}`,
                                title_japanese: null,
                                aired: item.release_date || null,
                                score: Number(item.rating) || null,
                                filler: false,
                                recap: false,
                                animeName: item.name,
                                cleanSeasonName: cleanSeasonLabel(item.name, selectedSeries)
                            })
                        }
                        results.push({
                            animeName: item.name,
                            episodes: syntheticEps
                        })
                    }
                }

                if (cancelled) return

                const mergedEpisodes = []
                selectedSeriesObj.items.forEach(item => {
                    const found = results.find(r => r.animeName === item.name)
                    if (found) {
                        mergedEpisodes.push(...found.episodes)
                    }
                })

                setJikanEpisodes(mergedEpisodes.length > 0 ? mergedEpisodes : null)
                setJikanLoading(false)
            } catch (err) {
                console.error("Failed to load series episodes:", err)
                if (!cancelled) {
                    setJikanEpisodes(null)
                    setJikanLoading(false)
                }
            }
        }

        loadAllSeriesEpisodes()

        return () => { cancelled = true }
    }, [selectedSeries, selectedSeriesObj, viewMode])

    // ============================================
    // JIKAN: Load synopsis when episode is selected
    // ============================================
    useEffect(() => {
        if (!selectedTimelineEp || viewMode !== 'series') {
            setJikanSynopsis(null)
            return
        }

        const anime = animeList.find(a => a.name === selectedTimelineEp.animeName)
        if (!anime || !anime.mal_url) {
            setJikanSynopsis(null)
            return
        }

        const malId = extractMalId(anime.mal_url)
        if (!malId) {
            setJikanSynopsis(null)
            return
        }

        // Extract episode number from epName (e.g. "EP 3" -> 3, "Film" -> 1)
        const epName = selectedTimelineEp.epName
        let epNum = 1
        const epMatch = epName.match(/EP\s*(\d+)/i)
        if (epMatch) {
            epNum = parseInt(epMatch[1], 10)
        }
        let cancelled = false

        getCachedEpisodeList(malId).then(cachedList => {
            if (cancelled) return
            const epData = cachedList?.episodes?.find(e => e.mal_id === epNum)
            setJikanSynopsis(epData || null)
        }).catch(() => {
            if (!cancelled) setJikanSynopsis(null)
        })

        return () => { cancelled = true }
    }, [selectedTimelineEp, viewMode, animeList])


    // Automatically set default series and season when entering series mode
    useEffect(() => {
        if (viewMode === 'series' && seriesList.length > 0) {
            if (!selectedSeries) {
                setSelectedSeries(seriesList[0].name)
            }
        }
    }, [viewMode, seriesList, selectedSeries])

    useEffect(() => {
        if (selectedSeriesObj && selectedSeriesObj.items && selectedSeriesObj.items.length > 0) {
            // Find first part in the series that has ratings to set as default season
            const activeSeason = selectedSeriesObj.items.find(a => categoryRatings.some(c => c.name === a.name))
            if (activeSeason) {
                setSelectedSeriesSeason(activeSeason.name)
                setSelectedAnimeTitle(activeSeason.name)
            } else {
                const firstItemName = selectedSeriesObj.items[0]?.name || null
                setSelectedSeriesSeason(firstItemName)
                setSelectedAnimeTitle(firstItemName)
            }
            setSelectedTimelineEp(null)
            setCompareSeason(null)
        }
    }, [selectedSeries, selectedSeriesObj, categoryRatings])

    // Series Categories Averaged
    const selectedSeriesCategories = useMemo(() => {
        if (!selectedSeriesObj) return null
        const items = selectedSeriesObj.items
        const avgCats = {}
        const counts = {}

        items.forEach(anime => {
            const found = categoryRatings.find(cr => cr.name === anime.name)
            if (found && found.categories) {
                Object.entries(found.categories).forEach(([cat, val]) => {
                    avgCats[cat] = (avgCats[cat] || 0) + val
                    counts[cat] = (counts[cat] || 0) + 1
                });
            }
        })

        const result = {}
        Object.keys(avgCats).forEach(cat => {
            result[cat] = avgCats[cat] / counts[cat]
        })
        return Object.keys(result).length > 0 ? result : null
    }, [selectedSeriesObj, categoryRatings])

    // Rozšířené info o sérii pro hlavičku (částí, čas, období sledování, žánry…)
    const seriesHeaderStats = useMemo(() => {
        if (!selectedSeriesObj) return null
        const items = selectedSeriesObj.items

        // Typy částí (3× TV, Movie…)
        const typeCounts = {}
        items.forEach(a => { const t = a.type || 'TV'; typeCounts[t] = (typeCounts[t] || 0) + 1 })
        const typeSummary = Object.entries(typeCounts).map(([t, n]) => (n > 1 ? `${n}× ${t}` : t)).join(', ')

        // Celkový čas sledování
        let totalMin = 0
        items.forEach(a => { totalMin += (Number(a.episodes) || 0) * (Number(a.episode_duration) || 0) })
        const totalTime = totalMin > 0
            ? (totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${Math.round(totalMin % 60)} min` : `${Math.round(totalMin)} min`)
            : null

        // Období sledování (první start – poslední konec)
        const starts = items.map(a => a.start_date).filter(d => d && !isNaN(new Date(d).getTime())).map(d => new Date(d).getTime())
        const ends = items.map(a => a.end_date).filter(d => d && !isNaN(new Date(d).getTime())).map(d => new Date(d).getTime())
        const watchedRange = (starts.length || ends.length)
            ? `${starts.length ? new Date(Math.min(...starts)).toLocaleDateString('cs-CZ') : '?'} – ${ends.length ? new Date(Math.max(...ends)).toLocaleDateString('cs-CZ') : '?'}`
            : null

        // Roky vydání
        const relYears = items.map(a => a.release_date).filter(d => d && !isNaN(new Date(d).getTime())).map(d => new Date(d).getFullYear())
        const yearsRange = relYears.length
            ? (Math.min(...relYears) === Math.max(...relYears) ? String(relYears[0]) : `${Math.min(...relYears)}–${Math.max(...relYears)}`)
            : null

        // Žánry napříč sérií (podle četnosti)
        const genreCounts = {}
        items.forEach(a => (a.genres || '').split(';').forEach(g => {
            const t = g.trim()
            if (t) genreCounts[t] = (genreCounts[t] || 0) + 1
        }))
        const genres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, 8)

        // Rewatch celkem
        const rewatchTotal = items.reduce((s, a) => s + (Number(a.rewatch_count) || 0), 0)

        // Průměr všech ohodnocených epizod série
        const epVals = []
        items.forEach(a => {
            const er = episodeRatings.find(e => e.name === a.name)
            if (er?.episodes) er.episodes.forEach(ep => { if (ep.rating > 0) epVals.push(ep.rating) })
        })
        const avgEp = epVals.length ? epVals.reduce((s, r) => s + r, 0) / epVals.length : null

        // Vážený průměr kategorií (WA) série
        let wa = null
        if (selectedSeriesCategories) {
            let sumProd = 0, sumWeight = 0
            Object.entries(selectedSeriesCategories).forEach(([cat, r]) => {
                const w = categoryWeights[cat] || 1
                sumProd += r * w
                sumWeight += w
            })
            wa = sumWeight > 0 ? sumProd / sumWeight : null
        }

        return { typeSummary, totalTime, watchedRange, yearsRange, genres, rewatchTotal, avgEp, wa, epCount: epVals.length }
    }, [selectedSeriesObj, episodeRatings, selectedSeriesCategories])

    // Kategorie porovnávané části série, zarovnané na kategorie průměru
    // (pořadí musí sedět, aby overlay v radaru odpovídal správným osám)
    const compareSeasonEntries = useMemo(() => {
        if (!compareSeason || !selectedSeriesCategories) return null
        const found = categoryRatings.find(cr => cr.name === compareSeason)
        if (!found?.categories) return null
        return Object.keys(selectedSeriesCategories).map(cat => [cat, found.categories[cat] ?? null])
    }, [compareSeason, selectedSeriesCategories, categoryRatings])

    // Části série, které mají hodnocení kategorií (chipy nad radarem)
    const ratedSeriesParts = useMemo(() => {
        if (!selectedSeriesObj) return []
        return selectedSeriesObj.items.filter(a => categoryRatings.some(cr => cr.name === a.name && cr.categories))
    }, [selectedSeriesObj, categoryRatings])

    // Task 8c: pevná škála radaru série — počítá se z průměru + VŠECH dílů,
    // takže se při přepínání porovnávaného dílu nemění min/max a průměrný
    // polygon „netancuje“.
    const seriesRadarScale = useMemo(() => {
        if (!selectedSeriesCategories) return null
        const vals = Object.values(selectedSeriesCategories).filter(v => v !== null && v !== undefined && !isNaN(v))
        ratedSeriesParts.forEach(a => {
            const found = categoryRatings.find(cr => cr.name === a.name)
            if (!found?.categories) return
            Object.keys(selectedSeriesCategories).forEach(cat => {
                const v = found.categories[cat]
                if (v !== null && v !== undefined && !isNaN(v)) vals.push(v)
            })
        })
        if (!vals.length) return null
        return { min: Math.max(0, Math.floor(Math.min(...vals) - 1)), max: Math.max(...vals) }
    }, [selectedSeriesCategories, ratedSeriesParts, categoryRatings])

    // Task 8b: klik na ikonku kategorie v radaru série → modal s rozborem.
    // Vybraný díl → rovnou jeho rozbor; Ø průměr série → výběr dílu.
    const [radarPartChooser, setRadarPartChooser] = useState(null) // { cat, parts: [names] } | null

    const openRadarCategoryReview = useCallback((animeName, cat) => {
        const text = categoryReviews?.[animeName]?.[cat]
        if (!text) return false
        const rating = categoryRatings.find(cr => cr.name === animeName)?.categories?.[cat]
        episodeModalRef.current?.open({
            title: `${cleanSeasonLabel(animeName, selectedSeries)} — ${cat}`,
            text,
            rating: (rating === undefined) ? null : rating
        })
        return true
    }, [categoryReviews, categoryRatings, selectedSeries])

    // Plán 6 Ú7: klik na buňku kategorie v kompletní tabulce → stejný modal s rozborem
    // jako v detailu anime (plný název, bez ořezávání série)
    const openTableCategoryReview = useCallback((animeName, cat, rating) => {
        const text = categoryReviews?.[animeName]?.[cat]
        if (!text) return
        episodeModalRef.current?.open({
            title: `${animeName} — ${cat}`,
            text,
            rating: (rating === undefined || rating === null) ? null : rating
        })
    }, [categoryReviews])

    const handleRadarCategoryClick = useCallback((cat) => {
        if (compareSeason) {
            openRadarCategoryReview(compareSeason, cat)
            return
        }
        const withText = ratedSeriesParts.filter(a => categoryReviews?.[a.name]?.[cat])
        if (withText.length === 1) {
            openRadarCategoryReview(withText[0].name, cat)
        } else if (withText.length > 1) {
            setRadarPartChooser({ cat, parts: withText.map(a => a.name) })
        }
    }, [compareSeason, ratedSeriesParts, categoryReviews, openRadarCategoryReview])

    // Helper to calculate weighted category average (AVG CAT)
    const getAvgCat = (animeName) => {
        const found = categoryRatings.find(cr => cr.name === animeName)
        if (!found || !found.categories) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(found.categories).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight) : null
    }

    // Continuous Series Timeline Data
    const seriesTimelineData = useMemo(() => {
        if (!selectedSeries || viewMode !== 'series') return null
        const seriesItems = seriesGroups[selectedSeries] || []
        const allEpisodes = []
        const seasonBoundaries = []
        let currentIndex = 0

        seriesItems.forEach(anime => {
            const isMovieOrSingleEpisode =
                anime.type === "Movie" ||
                Number(anime.episodes) === 1 ||
                anime.name === "The Disappearance of Haruhi Suzumiya" ||
                anime.name.toLowerCase().includes("heaven's feel") ||
                anime.name.toLowerCase().includes("movie") ||
                anime.name.toLowerCase().includes("film");

            let epsToUse = []

            if (isMovieOrSingleEpisode) {
                const avgCat = getAvgCat(anime.name)
                epsToUse = [{
                    episode: "Film",
                    rating: avgCat !== null ? avgCat : (Number(anime.rating) || 0)
                }]
            } else {
                const erObj = episodeRatings.find(er => er.name === anime.name)
                const hasEpisodes = erObj && erObj.episodes && erObj.episodes.length > 0
                if (hasEpisodes) {
                    // Recap alignment: detect if user skipped recap episodes
                    let mappedEps = null;
                    if (anime.mal_url) {
                        const malId = extractMalId(anime.mal_url);
                        const jikanEpsList = franchiseJikanCache[String(malId)];
                        if (jikanEpsList && jikanEpsList.length > 0) {
                            const nonRecapEps = jikanEpsList.filter(e => !e.recap);
                            if (erObj.episodes.length === nonRecapEps.length && erObj.episodes.length < jikanEpsList.length) {
                                // User's episode count matches non-recap count — align by skipping recaps
                                mappedEps = nonRecapEps.map((jEp, idx) => {
                                    const userEp = erObj.episodes[idx];
                                    return {
                                        episode: `EP ${jEp.mal_id}`,
                                        rating: userEp ? userEp.rating : null
                                    };
                                });
                            }
                        }
                    }

                    if (mappedEps) {
                        epsToUse = mappedEps;
                    } else {
                        epsToUse = erObj.episodes.map(ep => ({
                            episode: ep.episode,
                            rating: ep.rating
                        }))
                    }
                } else {
                    const avgCat = getAvgCat(anime.name)
                    if (avgCat !== null) {
                        epsToUse = [{
                            episode: "Film",
                            rating: avgCat
                        }]
                    } else if (anime.rating && !isNaN(Number(anime.rating))) {
                        epsToUse = [{
                            episode: "Film",
                            rating: Number(anime.rating)
                        }]
                    }
                }
            }

            if (epsToUse.length > 0) {
                const seasonStart = currentIndex
                epsToUse.forEach(ep => {
                    allEpisodes.push({
                        index: currentIndex + 1, // 1-based index
                        rating: ep.rating,
                        epName: ep.episode,
                        animeName: anime.name,
                        seasonName: cleanSeasonLabel(anime.name, selectedSeries)
                    })
                    currentIndex++
                })
                const seasonEnd = currentIndex
                seasonBoundaries.push({
                    start: seasonStart,
                    end: seasonEnd,
                    label: cleanSeasonLabel(anime.name, selectedSeries)
                })
            }
        })

        return { episodes: allEpisodes, boundaries: seasonBoundaries }
    }, [selectedSeries, episodeRatings, categoryRatings, seriesGroups, viewMode])

    // Previous & Next episode navigation inside series timeline
    const { hasPrevEp, hasNextEp, handlePrevEp, handleNextEp } = useMemo(() => {
        if (!selectedTimelineEp || !seriesTimelineData || !seriesTimelineData.episodes) {
            return { hasPrevEp: false, hasNextEp: false, handlePrevEp: () => { }, handleNextEp: () => { } }
        }
        const episodes = seriesTimelineData.episodes
        const currentIndex = episodes.findIndex(ep => ep.index === selectedTimelineEp.index)

        return {
            hasPrevEp: currentIndex > 0,
            hasNextEp: currentIndex >= 0 && currentIndex < episodes.length - 1,
            handlePrevEp: () => {
                if (currentIndex > 0) {
                    setSelectedTimelineEp(episodes[currentIndex - 1])
                }
            },
            handleNextEp: () => {
                if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
                    setSelectedTimelineEp(episodes[currentIndex + 1])
                }
            }
        }
    }, [selectedTimelineEp, seriesTimelineData])

    const getPointColor = (rating) => {
        if (rating >= 9.75) return 'rgb(29, 161, 242)' // Cinema (light blue)
        if (rating >= 9.0) return 'rgb(24, 106, 59)'   // Awesome (dark green)
        if (rating >= 8.0) return 'rgb(40, 180, 99)'   // Great (green)
        if (rating >= 7.0) return 'rgb(244, 208, 63)'  // Good (yellow)
        if (rating >= 6.0) return 'rgb(243, 156, 18)'  // Regular (orange)
        if (rating >= 5.0) return 'rgb(99, 57, 116)'   // Bad (purple)
        return 'rgb(239, 68, 68)'                      // Garbage (red)
    }

    const getPointTextColor = (rating) => {
        if (rating >= 9.0 && rating < 9.75) return '#fff' // Dark green -> white
        if (rating >= 5.0 && rating < 6.0) return '#fff'  // Purple -> white
        if (rating < 5.0) return '#fff'                   // Red -> white
        return '#000'                                     // Light blue, green, yellow, orange -> black
    }

    const timelineChartData = useMemo(() => {
        if (!seriesTimelineData || seriesTimelineData.episodes.length === 0) return null
        const { episodes } = seriesTimelineData

        const getActiveRating = (ep) => {
            if (ratingSource === 'moje') {
                return ep.rating
            }
            if (ratingSource === 'imdb') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const imdbAnime = imdbCache[String(malId)]
                        if (imdbAnime && imdbAnime.episodes) {
                            const score = imdbAnime.episodes[ep.epName] || imdbAnime.episodes["Film"] || imdbAnime.episodes["OVA"] || imdbAnime.episodes["Speciál"] || imdbAnime.episodes["EP 1"]
                            if (score) return score
                        }
                    }
                }
                return null
            }
            if (ratingSource === 'mal') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const malEps = franchiseJikanCache[String(malId)]
                        if (malEps) {
                            const epMatch = ep.epName.match(/EP\s*(\d+)/i)
                            const epNum = epMatch ? parseInt(epMatch[1], 10) : (ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1 ? 1 : null)
                            const malEp = epNum ? malEps.find(e => e.mal_id === epNum) : null
                            if (malEp && malEp.score) {
                                const isMovieOrOVA = ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1
                                return isMovieOrOVA ? malEp.score / 2 : malEp.score
                            }
                        }
                    }
                }
                return null
            }
            return null
        }

        const activePoints = episodes.map(ep => {
            const yVal = getActiveRating(ep)
            return { x: ep.index, y: yVal }
        })

        const pointColors = activePoints.map(pt => {
            if (pt.y === null) return 'rgba(255, 255, 255, 0.2)'
            const colorRating = ratingSource === 'mal' ? pt.y * 2 : pt.y
            return getPointColor(colorRating)
        })

        let trendData = []
        if (episodes.length > 1) {
            const validPoints = activePoints.filter(pt => pt.y !== null)
            if (validPoints.length > 1) {
                const dataPoints = activePoints.map(pt => [pt.x, pt.y])
                const windowSize = Math.max(5, Math.min(13, (Math.round(dataPoints.length / 7.5) | 1)))
                const half = Math.floor(windowSize / 2)

                trendData = dataPoints.map((dp, idx) => {
                    if (dp[1] === null) return null
                    let sum = 0
                    let count = 0
                    for (let i = -half; i <= half; i++) {
                        const checkIdx = idx + i
                        if (checkIdx >= 0 && checkIdx < dataPoints.length && dataPoints[checkIdx][1] !== null) {
                            const weight = 1 - Math.abs(i) / (half + 1)
                            sum += dataPoints[checkIdx][1] * weight
                            count += weight
                        }
                    }
                    return count > 0 ? (sum / count) : null
                })
            }
        }

        const datasets = []

        if (showTrendLine && trendData.length > 0) {
            datasets.push({
                type: 'line',
                label: 'Trend',
                data: episodes.map((ep, i) => ({ x: ep.index, y: trendData[i] })),
                borderColor: c.textMuted,
                borderWidth: 2.8,
                pointRadius: 0,
                fill: false,
                tension: 0.45,
                showLine: true
            })
        }

        const sourceLabels = {
            'moje': 'Moje hodnocení',
            'mal': 'MAL hodnocení',
            'imdb': 'IMDb hodnocení'
        }
        const activeLabel = sourceLabels[ratingSource] || 'Hodnocení'

        let lineColor = c.textFaint
        if (ratingSource === 'imdb') lineColor = 'rgba(245, 197, 24, 0.25)'
        else if (ratingSource === 'mal') lineColor = 'rgba(46, 81, 162, 0.3)'

        datasets.push({
            type: 'line',
            label: activeLabel,
            data: activePoints,
            borderColor: lineColor,
            borderWidth: 1.5,
            tension: 0.15,
            pointBackgroundColor: pointColors,
            pointBorderColor: c.pointBorder,
            pointBorderWidth: 1,
            pointRadius: 5.5,
            pointHoverRadius: 7.5,
            showLine: true,
            clip: false
        })

        return {
            labels: episodes.map(ep => `${ep.seasonName} ${ep.epName}`),
            datasets
        }
    }, [seriesTimelineData, showTrendLine, ratingSource, franchiseJikanCache, selectedTimelineEp, imdbCache, animeList, c])

    // Custom Plugin for Season Boundaries and Labels on Chart.js
    const seasonBoundariesPlugin = useMemo(() => {
        return {
            id: 'seasonBoundaries',
            beforeDraw: (chart) => {
                const { ctx, chartArea, scales } = chart
                if (!ctx || !chartArea || !scales || !scales.x) return
                const { top, bottom } = chartArea
                const { x } = scales
                const boundaries = chart.options.plugins.seasonBoundaries?.boundaries || []

                ctx.save()
                boundaries.forEach((b, i) => {
                    const startX = x.getPixelForValue(b.start + 0.5)
                    const endX = x.getPixelForValue(b.end + 0.5)

                    // Draw alternating background band
                    if (i % 2 === 0) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)'
                    } else {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
                    }
                    ctx.fillRect(startX, top, endX - startX, bottom - top)
                })
                ctx.restore()
            },
            afterDraw: (chart) => {
                const { ctx, chartArea, scales } = chart
                if (!ctx || !chartArea || !scales || !scales.x || !scales.y) return
                const { top, bottom } = chartArea
                const { x } = scales
                const boundaries = chart.options.plugins.seasonBoundaries?.boundaries || []

                ctx.save()
                boundaries.forEach((b, i) => {
                    // Draw boundary line
                    if (i < boundaries.length - 1) {
                        const lineX = x.getPixelForValue(b.end + 0.5)
                        ctx.strokeStyle = c.textFaint
                        ctx.lineWidth = 1
                        ctx.setLineDash([5, 5])
                        ctx.beginPath()
                        ctx.moveTo(lineX, top)
                        ctx.lineTo(lineX, bottom)
                        ctx.stroke()
                    }

                    // Draw label S1, S2 near the bottom right above x axis
                    const startX = x.getPixelForValue(b.start + 0.5)
                    const endX = x.getPixelForValue(b.end + 0.5)
                    const centerX = (startX + endX) / 2
                    const columnWidth = endX - startX

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
                    ctx.font = 'bold 10px var(--font-sans, sans-serif)'
                    ctx.textAlign = 'center'

                    if (columnWidth > 12) {
                        const textWidth = ctx.measureText(b.label).width
                        if (textWidth > columnWidth - 4) {
                            const ratio = (columnWidth - 4) / textWidth
                            const chars = Math.floor(ratio * b.label.length)
                            const truncated = chars > 3
                                ? b.label.substring(0, chars - 2) + '..'
                                : b.label.substring(0, 1) + '.'
                            ctx.fillText(truncated, centerX, bottom - 12)
                        } else {
                            ctx.fillText(b.label, centerX, bottom - 12)
                        }
                    }
                })
                ctx.restore()

                // Draw red vertical arrow pointing from above at the selected episode point
                const activeEp = selectedTimelineEpRef.current
                if (activeEp) {
                    const xVal = parseInt(activeEp.index, 10)
                    const ratingDataset = chart.data.datasets.find(ds => ds.label !== 'Trend')
                    let yVal = null
                    if (ratingDataset && ratingDataset.data) {
                        const pt = ratingDataset.data.find(d => d.x === xVal)
                        if (pt && pt.y !== null && pt.y !== undefined) {
                            yVal = pt.y
                        }
                    }

                    if (yVal !== null && !isNaN(xVal) && xVal >= scales.x.min && xVal <= scales.x.max) {
                        const xPixel = scales.x.getPixelForValue(xVal)
                        const yPixel = scales.y.getPixelForValue(yVal)

                        const arrowTipY = yPixel - 6
                        const arrowheadBaseY = yPixel - 14
                        const arrowShaftStartY = Math.max(top + 2, yPixel - 32)

                        ctx.save()
                        ctx.strokeStyle = 'rgb(239, 68, 68)'
                        ctx.fillStyle = 'rgb(239, 68, 68)'
                        ctx.lineWidth = 2.5

                        // Draw arrowhead (pointing down)
                        ctx.beginPath()
                        ctx.moveTo(xPixel - 5, arrowheadBaseY)
                        ctx.lineTo(xPixel + 5, arrowheadBaseY)
                        ctx.lineTo(xPixel, arrowTipY)
                        ctx.closePath()
                        ctx.fill()

                        // Draw arrow shaft if there is enough space
                        if (arrowShaftStartY < arrowheadBaseY) {
                            ctx.beginPath()
                            ctx.moveTo(xPixel, arrowShaftStartY)
                            ctx.lineTo(xPixel, arrowheadBaseY)
                            ctx.stroke()
                        }

                        ctx.restore()
                    }
                }
            }
        }
    }, [])

    // B4-2: dynamický rozsah osy Y + průměr aktivního zdroje — stejná logika
    // jako epChartMin/epChartMax v detailu anime (graf „Hodnocení epizod").
    const yAxisRange = useMemo(() => {
        const cap = ratingSource === 'mal' ? 5.0 : 10.0
        const fallback = { min: ratingSource === 'mal' ? 2.0 : 4.75, max: cap, avg: null }
        if (!seriesTimelineData || seriesTimelineData.episodes.length === 0) {
            return fallback
        }

        const getActiveRating = (ep) => {
            if (ratingSource === 'moje') {
                return ep.rating
            }
            if (ratingSource === 'imdb') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const imdbAnime = imdbCache[String(malId)]
                        if (imdbAnime && imdbAnime.episodes) {
                            const score = imdbAnime.episodes[ep.epName] || imdbAnime.episodes["Film"] || imdbAnime.episodes["OVA"] || imdbAnime.episodes["Speciál"] || imdbAnime.episodes["EP 1"]
                            if (score) return score
                        }
                    }
                }
                return null
            }
            if (ratingSource === 'mal') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const malEps = franchiseJikanCache[String(malId)]
                        if (malEps) {
                            const epMatch = ep.epName.match(/EP\s*(\d+)/i)
                            const epNum = epMatch ? parseInt(epMatch[1], 10) : (ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1 ? 1 : null)
                            const malEp = epNum ? malEps.find(e => e.mal_id === epNum) : null
                            if (malEp && malEp.score) {
                                const isMovieOrOVA = ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1
                                return isMovieOrOVA ? malEp.score / 2 : malEp.score
                            }
                        }
                    }
                }
                return null
            }
            return null
        }

        const ratings = seriesTimelineData.episodes
            .map(ep => getActiveRating(ep))
            .filter(r => r !== null && !isNaN(r) && r > 0)

        if (ratings.length === 0) {
            return fallback
        }
        const minVal = Math.min(...ratings)
        const maxVal = Math.max(...ratings)
        let dynMin = Math.max(0, Math.floor(minVal * 2) / 2 - 0.5)
        let dynMax = Math.min(cap, Math.ceil(maxVal * 2) / 2 + 0.5)
        if (dynMax - dynMin < 1.0) {
            if (dynMax === cap) {
                dynMin = Math.max(0, dynMax - 1.0)
            } else {
                dynMax = dynMin + 1.0
            }
        }
        const avg = ratings.reduce((a, r) => a + r, 0) / ratings.length
        return { min: dynMin, max: dynMax, avg }
    }, [seriesTimelineData, ratingSource, animeList, imdbCache, franchiseJikanCache])

    // B4-2: má vybraná série aspoň jeden DOCX rozbor epizod? (řídí info text pod titulkem)
    const seriesHasDocxReviews = useMemo(() => {
        if (!selectedSeriesObj || !categoryReviews) return false
        return selectedSeriesObj.items.some(item => {
            const eps = categoryReviews[item.name]?.episodes
            return eps && Object.keys(eps).length > 0
        })
    }, [selectedSeriesObj, categoryReviews])

    const timelineOptions = useMemo(() => {
        if (!seriesTimelineData) return {}
        return {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            onClick: (event, elements, chart) => {
                const activeElements = chart.getElementsAtEventForMode(
                    event.native,
                    'nearest',
                    { intersect: false },
                    true
                )
                if (activeElements && activeElements.length > 0) {
                    const element = activeElements[0]
                    const ep = seriesTimelineData?.episodes?.[element.index]
                    if (ep) {
                        setSelectedTimelineEp(ep)
                    }
                }
            },
            // B4-2: pointer nad body — každý bod otevírá detail epizody v panelu
            onHover: (event, chartElement) => {
                if (event && event.native && event.native.target) {
                    event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default'
                }
            },
            layout: {
                padding: { top: 8 }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0.5,
                    max: seriesTimelineData.episodes.length + 0.5,
                    ticks: {
                        stepSize: 1,
                        color: c.textMuted,
                        font: { size: 9 },
                        callback: (value) => {
                            const ep = seriesTimelineData.episodes.find(e => e.index === value)
                            if (!ep) return ''
                            const total = seriesTimelineData.episodes.length
                            if (total > 50 && value % 5 !== 0) return ''
                            if (total > 100 && value % 10 !== 0) return ''
                            return ep.epName
                        }
                    },
                    grid: { display: false }
                },
                y: {
                    min: yAxisRange.min,
                    max: yAxisRange.max,
                    ticks: {
                        color: c.textMuted,
                        font: { size: 10 },
                        stepSize: ratingSource === 'mal' ? 0.25 : 0.5,
                        callback: (value) => {
                            if (ratingSource === 'mal' && value > 5) return ''
                            if (ratingSource !== 'mal' && value > 10) return ''
                            return ratingSource === 'mal'
                                ? value.toFixed(2).replace('.', ',')
                                : value.toFixed(1).replace('.', ',')
                        }
                    },
                    grid: {
                        display: true,
                        color: c.grid,
                        borderDash: [5, 5]
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        // Název epizody z DOCX rozborů — stejný zdroj jako graf v detailu anime
                        title: (items) => {
                            const item = items && items[0]
                            if (!item || item.dataset.label === 'Trend') return ''
                            const ep = seriesTimelineData.episodes[item.dataIndex]
                            if (!ep) return ''
                            const m = String(ep.epName || '').match(/EP\s*(\d+)/i)
                            const docxEp = m ? getDocxEpisode(categoryReviews?.[ep.animeName], parseInt(m[1], 10)) : null
                            return docxEp?.title ? `📝 ${docxEp.title}` : ''
                        },
                        label: (ctx) => {
                            const datasetLabel = ctx.dataset.label
                            if (datasetLabel === 'Trend') return 'Trend'
                            const ep = seriesTimelineData.episodes[ctx.dataIndex]
                            if (!ep) return ''
                            const score = ctx.raw && ctx.raw.y !== undefined ? ctx.raw.y : null
                            if (score === null) return `${ep.animeName} - ${ep.epName}: N/A`

                            if (ratingSource === 'moje') {
                                const formattedScore = typeof score === 'number'
                                    ? (ep.epName === 'Film' ? score.toFixed(2).replace('.', ',') : (Number.isInteger(score) ? score : score.toFixed(2).replace('.', ',')))
                                    : score;
                                return `${ep.animeName} - ${ep.epName} (Moje): ${formattedScore}`
                            } else if (ratingSource === 'mal') {
                                return `${ep.animeName} - ${ep.epName} (MAL): ${score.toFixed(2).replace('.', ',')}`
                            } else {
                                return `${ep.animeName} - ${ep.epName} (IMDb): ${score.toFixed(2).replace('.', ',')}`
                            }
                        }
                    }
                },
                seasonBoundaries: {
                    boundaries: seriesTimelineData.boundaries
                }
            }
        }
    }, [seriesTimelineData, showTrendLine, yAxisRange, selectedTimelineEp, ratingSource, categoryReviews, c])

    // ============================================
    // ROW 1 DATA MEMOIZATION (INDIVIDUAL)
    // ============================================
    const row1AnimeList = useMemo(() => {
        if (!searchQuery) return animeList
        const lowerSearch = searchQuery.toLowerCase()
        return animeList.filter(a => a.name.toLowerCase().includes(lowerSearch))
    }, [animeList, searchQuery])

    const selectedAnimeObj = useMemo(() => {
        return animeList.find(a => a.name === selectedAnimeTitle) || null
    }, [animeList, selectedAnimeTitle])

    const selectedAnimeCategories = useMemo(() => {
        const found = categoryRatings.find(cr => cr.name === selectedAnimeTitle)
        return found ? found.categories : null
    }, [categoryRatings, selectedAnimeTitle])

    const selectedAnimeEpisodes = useMemo(() => {
        const found = episodeRatings.find(er => er.name === selectedAnimeTitle)
        return found ? found.episodes : null
    }, [episodeRatings, selectedAnimeTitle])

    // Průměr hodnocení epizod (do titulku grafu, jako v detailu)
    const avgEpisodeRating = useMemo(() => {
        if (!selectedAnimeEpisodes || selectedAnimeEpisodes.length === 0) return null
        const valid = selectedAnimeEpisodes
            .map(ep => typeof ep.rating === 'number' ? ep.rating : parseFloat(ep.rating))
            .filter(r => isFinite(r))
        if (valid.length === 0) return null
        return (valid.reduce((a, r) => a + r, 0) / valid.length).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })
    }, [selectedAnimeEpisodes])

    // Má vybrané anime AI rozbory epizod? (řídí zobrazení poznámky a klikací body)
    const selectedEpisodeReviews = categoryReviews?.[selectedAnimeTitle]?.episodes || null

    const selectedAnimeNote = useMemo(() => {
        const found = notes.find(n => n.name === selectedAnimeTitle)
        return found ? found.note : null
    }, [notes, selectedAnimeTitle])

    const avgCategoryRating = useMemo(() => {
        if (!selectedAnimeCategories) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(selectedAnimeCategories).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : 'N/A'
    }, [selectedAnimeCategories])

    // Episode Bar Chart Data (Individual)
    const episodeChartData = useMemo(() => {
        if (!selectedAnimeEpisodes || selectedAnimeEpisodes.length === 0) return null
        const dataPoints = selectedAnimeEpisodes.map((ep, i) => [i + 1, ep.rating])
        let trendData = []
        if (dataPoints.length > 1) {
            const n = dataPoints.length
            const scaledDataPoints = dataPoints.map((p, idx) => {
                const scaledX = n > 1 ? -1 + 2 * idx / (n - 1) : 0
                return [scaledX, p[1]]
            })
            const result = regression.polynomial(scaledDataPoints, { order: 6, precision: 10 })
            trendData = dataPoints.map((p, idx) => {
                const scaledX = n > 1 ? -1 + 2 * idx / (n - 1) : 0
                return result.predict(scaledX)[1]
            })
        }
        const datasets = []
        if (showTrendLine && trendData.length > 0) {
            datasets.push({
                type: 'line',
                label: 'Polyn. (Celkem)',
                data: trendData,
                borderColor: c.textMuted,
                borderWidth: 2.8,
                pointRadius: 0,
                fill: false,
                tension: 0.45
            })
        }

        datasets.push({
            type: 'line',
            label: 'Hodnocení epizody',
            data: selectedAnimeEpisodes.map(ep => ep.rating),
            borderColor: c.textFaint,
            borderWidth: 1.5,
            tension: 0.15,
            pointBackgroundColor: selectedAnimeEpisodes.map(ep => getPointColor(ep.rating)),
            pointBorderColor: c.pointBorder,
            pointBorderWidth: 1,
            pointRadius: 5.5,
            pointHoverRadius: 7.5,
            showLine: true,
            clip: false
        })

        return {
            labels: selectedAnimeEpisodes.map(ep => ep.episode),
            datasets
        }
    }, [selectedAnimeEpisodes, showTrendLine, c])

    const { epChartMin, epChartMax } = useMemo(() => {
        if (!selectedAnimeEpisodes || selectedAnimeEpisodes.length === 0) return { epChartMin: 4.75, epChartMax: 10.0 }
        const valid = selectedAnimeEpisodes.map(e => e.rating).filter(r => r !== null && !isNaN(r))
        if (valid.length === 0) return { epChartMin: 4.75, epChartMax: 10.0 }
        const minVal = Math.min(...valid)
        const maxVal = Math.max(...valid)

        let dynMin = Math.floor(minVal * 2) / 2 - 0.5
        let dynMax = Math.ceil(maxVal * 2) / 2 + 0.5

        dynMax = Math.min(10.0, dynMax)
        if (dynMin < 0) dynMin = 0

        if (dynMax - dynMin < 1.0) {
            if (dynMax === 10.0) {
                dynMin = Math.max(0, dynMax - 1.0)
            } else {
                dynMax = dynMin + 1.0
            }
        }
        return { epChartMin: dynMin, epChartMax: dynMax }
    }, [selectedAnimeEpisodes])

    const episodeBarOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, animation: false,
        // Klik na bod epizody otevře její AI rozbor (imperativně — bez re-renderu stránky)
        onClick: (event, elements) => {
            if (elements && elements.length > 0 && selectedAnimeEpisodes && selectedEpisodeReviews) {
                const index = elements[0].index
                const epNum = index + 1
                const docxEp = selectedEpisodeReviews[epNum]
                if (docxEp) {
                    episodeModalRef.current?.open({
                        episodeNumber: epNum,
                        title: docxEp.title,
                        text: docxEp.text,
                        rating: selectedAnimeEpisodes[index]?.rating
                    })
                }
            }
        },
        onHover: (event, chartElement) => {
            if (event && event.native && event.native.target) {
                if (chartElement.length && selectedEpisodeReviews) {
                    const idx = chartElement[0].index
                    event.native.target.style.cursor = selectedEpisodeReviews[idx + 1] ? 'pointer' : 'default'
                } else {
                    event.native.target.style.cursor = 'default'
                }
            }
        },
        layout: {
            padding: {
                top: 8
            }
        },
        scales: {
            y: {
                min: epChartMin,
                max: epChartMax,
                ticks: {
                    color: c.textMuted,
                    font: { size: 10 },
                    stepSize: 0.5,
                    callback: (value) => {
                        if (value > 10) return ''
                        return value.toFixed(1).replace('.', ',')
                    }
                },
                grid: {
                    color: (context) => {
                        if (context.tick && context.tick.value > 10) return 'transparent';
                        return c.grid;
                    }
                }
            },
            x: { ticks: { color: c.textMuted, font: { size: 10 } }, grid: { display: false } }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (context) => {
                        if (context && context[0] && selectedEpisodeReviews) {
                            const idx = context[0].dataIndex
                            const docxEp = selectedEpisodeReviews[idx + 1]
                            return docxEp ? `📝 ${docxEp.title}` : `Epizoda ${idx + 1}`
                        }
                        return ''
                    },
                    label: (context) => {
                        const v = typeof context.raw === 'number' ? context.raw : parseFloat(context.raw)
                        if (!isFinite(v)) return ''
                        return `Hodnocení: ${parseFloat(v.toFixed(2)).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}/10`
                    }
                }
            }
        }
    }), [epChartMin, epChartMax, c, selectedEpisodeReviews, selectedAnimeEpisodes])

    // ============================================
    // ROW 2 DATA MEMOIZATION
    // ============================================
    const polozkyOptions = useMemo(() => {
        if (slicerTyp === 'Kategorie') return Object.keys(categoryWeights)
        if (slicerTyp === 'Epizoda') {
            const eps = new Set()
            episodeRatings.forEach(a => a.episodes.forEach(e => eps.add(e.episode)))
            return Array.from(eps).sort((a, b) => (parseInt(a.replace('EP ', '')) || 0) - (parseInt(b.replace('EP ', '')) || 0))
        }
        return []
    }, [slicerTyp, episodeRatings])

    useEffect(() => {
        if (slicerTyp === 'Kategorie') setSlicerPolozka('Vedlejší postavy')
        else if (slicerTyp === 'Epizoda') setSlicerPolozka('EP 1')
        setSlicerHodnoceni('Všechna')
    }, [slicerTyp])

    const hodnoceniOptions = useMemo(() => {
        const ratings = new Set()
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                if (a.categories && a.categories[slicerPolozka] !== undefined) ratings.add(a.categories[slicerPolozka])
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) ratings.add(ep.rating)
            })
        }
        return ['Všechna', ...Array.from(ratings).sort((a, b) => b - a)]
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka])

    const row2FilteredAnime = useMemo(() => {
        const results = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                const r = a.categories ? a.categories[slicerPolozka] : undefined
                if (r !== undefined) {
                    if (slicerHodnoceni === 'Všechna' || r === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: r })
                }
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) {
                    if (slicerHodnoceni === 'Všechna' || ep.rating === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: ep.rating })
                }
            })
        }
        return results.sort((a, b) => b.hodnoceni - a.hodnoceni)
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka, slicerHodnoceni])

    // Klik na sloupec/bod grafu otevře detail daného anime v pohledu Jednotlivě
    const openAnimeFromChart = useCallback((name) => {
        if (!name) return
        setViewMode('individual')
        setSelectedAnimeTitle(name)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        const mc = document.querySelector('.main-content')
        if (mc) mc.scrollTo({ top: 0, behavior: 'smooth' })
    }, [])

    const barChartClickHandlers = useMemo(() => ({
        onClick: (evt, elements, chart) => {
            const el = elements?.[0]
            if (!el) return
            openAnimeFromChart(chart.data.labels?.[el.index])
        },
        onHover: (evt, elements) => {
            if (evt?.native?.target) evt.native.target.style.cursor = elements?.length ? 'pointer' : 'default'
        }
    }), [openAnimeFromChart])

    const correlationChartData = useMemo(() => {
        const dataPoints = []
        const scatterData = []
        let minX = 10, maxX = 0, minY = 10, maxY = 0

        row2FilteredAnime.forEach(item => {
            const animeObj = animeList.find(a => a.name === item.name)
            if (animeObj && animeObj.rating && !isNaN(Number(animeObj.rating))) {
                const fh = Number(animeObj.rating)
                const val = item.hodnoceni
                dataPoints.push([fh, val])
                scatterData.push({ x: fh, y: val, label: item.name })

                if (fh < minX) minX = fh
                if (fh > maxX) maxX = fh
                if (val < minY) minY = val
                if (val > maxY) maxY = val
            }
        })

        if (dataPoints.length === 0) return null

        const result = regression.linear(dataPoints, { precision: 4 })
        const r2 = result.r2
        const lineData = [{ x: minX, y: result.predict(minX)[1] }, { x: maxX, y: result.predict(maxX)[1] }]

        return {
            data: {
                datasets: [
                    { type: 'line', label: `Regrese (R² = ${r2.toLocaleString('cs-CZ')})`, data: lineData, borderColor: 'rgba(255, 0, 0, 0.8)', borderWidth: 2, fill: false, pointRadius: 0 },
                    { type: 'scatter', label: 'Anime', data: scatterData, backgroundColor: 'rgba(239, 68, 68, 0.8)', pointRadius: 4, pointHoverRadius: 6 }
                ]
            },
            r2,
            minX: 5,
            minY: 5
        }
    }, [row2FilteredAnime, animeList])

    const correlationChartOptions = useMemo(() => {
        if (!correlationChartData) return {}
        return {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                x: { title: { display: true, text: 'FH', color: c.textMuted }, min: correlationChartData.minX, max: 10, ticks: { color: c.textMuted }, grid: { color: c.grid } },
                y: { title: { display: true, text: `Hodnocení ${slicerPolozka}`, color: c.textMuted }, min: correlationChartData.minY, max: 10, ticks: { color: c.textMuted }, grid: { color: c.grid } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const name = ctx.raw.label;
                            const isMovie = name.toLowerCase().includes('movie') || name.toLowerCase().includes('film');
                            const formatVal = (val) => {
                                if (typeof val !== 'number') return val;
                                if (isMovie) return val.toFixed(2).replace('.', ',');
                                return Number.isInteger(val) ? val : val.toFixed(2).replace('.', ',');
                            };
                            const xVal = formatVal(ctx.raw.x);
                            const yVal = formatVal(ctx.raw.y);
                            return `${name}: (FH: ${xVal}, ${slicerPolozka}: ${yVal})`;
                        }
                    }
                }
            }
        }
    }, [correlationChartData, slicerPolozka, c])

    const histogramData = useMemo(() => {
        const step = 0.5
        const fmtBin = (v) => v.toFixed(1)

        const counts = {}
        for (let i = 5.0; i <= 10.0 + 1e-9; i += step) counts[fmtBin(i)] = 0

        const sourceList = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => { const r = a.categories ? a.categories[slicerPolozka] : undefined; if (r !== undefined) sourceList.push(r) })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => { const ep = a.episodes.find(e => e.episode === slicerPolozka); if (ep) sourceList.push(ep.rating) })
        }

        sourceList.forEach(r => {
            const clamped = Math.min(10, Math.max(5, r))
            const bin = Math.min(10, Math.floor((clamped - 5) / step + 1e-9) * step + 5)
            counts[fmtBin(bin)]++
        })

        const labels = Object.keys(counts).sort((a, b) => Number(a) - Number(b)).map(l => l.replace('.', ','))
        const data = labels.map(l => counts[l.replace(',', '.')])

        return {
            labels,
            datasets: [{
                label: 'Počet anime',
                data,
                backgroundColor: labels.map(l => {
                    const r = Number(l.replace(',', '.'))
                    if (r >= 9.5) return 'rgb(29, 161, 242)'
                    if (r >= 8.5) return 'rgb(24, 106, 59)'
                    if (r >= 7.5) return 'rgb(40, 180, 99)'
                    if (r >= 6.5) return 'rgb(244, 208, 63)'
                    if (r >= 5.5) return 'rgb(243, 156, 18)'
                    return 'rgba(239, 68, 68, 0.7)'
                }),
                borderRadius: 2
            }]
        }
    }, [slicerTyp, slicerPolozka, categoryRatings, episodeRatings])

    const histogramOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, animation: false,
        scales: {
            y: { ticks: { beginAtZero: true, color: c.textMuted, stepSize: 1 }, grid: { color: c.grid } },
            x: { title: { display: true, text: 'Hodnocení (Intervaly po 0,5)', color: c.textMuted }, ticks: { color: c.textMuted }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }), [c])

    // R² každé kategorie vs. finální hodnocení (lineární regrese napříč anime).
    // Ukazuje, jak silně jednotlivé kategorie souvisí s celkovým hodnocením.
    const categoryR2List = useMemo(() => {
        const cats = ['Animace', 'CGI', 'MC', 'Vedlejší postavy', 'Waifu', 'Plot', 'Pacing', 'Story Conclusion', 'Originalita', 'Emoce', 'Enjoyment', 'OP', 'ED', 'OST']
        const fhByName = {}
        animeList.forEach(a => { const fh = Number(a.rating); if (!isNaN(fh) && fh > 0) fhByName[a.name] = fh })
        return cats.map(cat => {
            const pts = []
            categoryRatings.forEach(a => {
                const v = a.categories ? a.categories[cat] : undefined
                const fh = fhByName[a.name]
                if (v !== undefined && v !== null && fh !== undefined) pts.push([fh, v])
            })
            let r2 = null
            if (pts.length >= 3) {
                try {
                    const val = regression.linear(pts, { precision: 4 }).r2
                    r2 = (typeof val === 'number' && isFinite(val)) ? Math.max(0, Math.min(1, val)) : null
                } catch { r2 = null }
            }
            return { cat, r2, n: pts.length }
        })
        // Task 1: kanonické pořadí kategorií (Animace první, OST poslední) —
        // NEřadit podle R², pořadí drží skupiny níže.
    }, [categoryRatings, animeList])

    // Barva a slovní síla podle R² (0–1)
    const r2Style = useCallback((r2) => {
        if (r2 === null) return { color: 'var(--text-muted)', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', label: '—' }
        if (r2 >= 0.5) return { color: 'rgb(52, 211, 153)', bg: 'rgba(24,106,59,0.22)', border: 'rgb(52,211,153,0.4)', label: 'silná' }
        if (r2 >= 0.3) return { color: 'rgb(40, 180, 99)', bg: 'rgba(40,180,99,0.16)', border: 'rgba(40,180,99,0.35)', label: 'střední' }
        if (r2 >= 0.15) return { color: 'rgb(244, 208, 63)', bg: 'rgba(244,208,63,0.14)', border: 'rgba(244,208,63,0.35)', label: 'slabší' }
        return { color: 'rgb(243, 156, 18)', bg: 'rgba(243,156,18,0.12)', border: 'rgba(243,156,18,0.3)', label: 'slabá' }
    }, [])

    // ============================================
    // ROW 3 DATA MEMOIZATION
    // ============================================
    const hypeChartData = useMemo(() => {
        const xCats = ["Animace", "CGI", "OP", "ED", "OST"]
        const yCats = ["Plot", "Pacing", "Story Conclusion", "Emoce", "Originalita"]
        const scatterData = []

        categoryRatings.forEach(a => {
            if (!a.categories) return

            let xSum = 0, xCount = 0
            xCats.forEach(c => { if (a.categories[c] !== undefined) { xSum += a.categories[c]; xCount++; } })

            let ySum = 0, yCount = 0
            yCats.forEach(c => { if (a.categories[c] !== undefined) { ySum += a.categories[c]; yCount++; } })

            const enjoyment = a.categories["Enjoyment"]

            if (xCount > 0 && yCount > 0 && enjoyment !== undefined) {
                const xVal = xSum / xCount
                const yVal = ySum / yCount
                let color = 'rgba(239, 68, 68, 0.8)'

                const animeObj = animeList.find(al => al.name === a.name)
                if (animeObj && animeObj.rating) {
                    const fh = Number(animeObj.rating)
                    if (fh >= 9.5) color = 'rgba(29, 161, 242, 0.8)'
                    else if (fh >= 8.5) color = 'rgba(40, 180, 99, 0.8)'
                    else if (fh >= 7.5) color = 'rgba(244, 208, 63, 0.8)'
                }

                scatterData.push({
                    x: xVal, y: yVal,
                    r: Math.max(3, (enjoyment - 4) * 2), // Bubble scale
                    label: a.name, color, enjoyment
                })
            }
        })

        return {
            datasets: [{
                label: 'Anime',
                data: scatterData,
                backgroundColor: scatterData.map(d => d.color),
                borderColor: c.grid,
                borderWidth: 1,
                // Nechat vykreslit celé bubliny i těsně u hran (bod na 10/10 se
                // pak nepřeřízne). Spolu s layout.padding níže mají kam přesáhnout.
                clip: false
            }]
        }
    }, [categoryRatings, animeList, c])

    const hypeChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, animation: false,
        // Fyzický prostor kolem plochy grafu, aby bubliny na krajích (např. 10/10)
        // byly celé vidět. Max poloměr bubliny je 12 px.
        layout: { padding: { top: 16, right: 16, bottom: 10, left: 10 } },
        scales: {
            x: { title: { display: true, text: 'Technická kvalita (Animace + CGI + OP + ED + OST)', color: c.textMuted }, min: 5.5, max: 10, ticks: { color: c.textMuted }, grid: { color: c.grid } },
            y: { title: { display: true, text: 'Hloubka (Plot + Pacing + Story + Emoce + Originalita)', color: c.textMuted }, min: 5.5, max: 10, ticks: { color: c.textMuted }, grid: { color: c.grid } }
        },
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label} (Enjoyment: ${ctx.raw.enjoyment})` } }
        }
    }), [c])

    const leaderboardChartData = useMemo(() => {
        let items = []
        if (lbTyp === 'Epizody') {
            episodeRatings.forEach(a => {
                if (a.episodes && a.episodes.length > 0) {
                    const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                    items.push({ name: a.name, val: sum / a.episodes.length })
                }
            })
        } else {
            categoryRatings.forEach(a => {
                if (a.categories) {
                    const keys = Object.keys(a.categories)
                    if (keys.length > 0) {
                        const sum = keys.reduce((acc, k) => acc + a.categories[k], 0)
                        items.push({ name: a.name, val: sum / keys.length })
                    }
                }
            })
        }

        if (lbSort === 'Nejlepší') items.sort((a, b) => b.val - a.val)
        else items.sort((a, b) => a.val - b.val)

        items = items.slice(0, lbCount)

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: `AVG (${lbTyp})`,
                data: items.map(i => i.val),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings, categoryRatings, lbTyp, lbSort, lbCount])

    const lbMinMax = useMemo(() => {
        const values = leaderboardChartData?.datasets?.[0]?.data || [];
        if (values.length === 0) return { min: 0, max: 10 };
        const minRaw = Math.min(...values);
        const maxRaw = Math.max(...values);

        // Přidáme malou rezervu (0.15) na obou koncích a zaokrouhlíme
        const calculatedMin = Math.max(0, Math.floor((minRaw - 0.15) * 10) / 10);
        const calculatedMax = Math.min(10, Math.ceil((maxRaw + 0.15) * 10) / 10);

        return { min: calculatedMin, max: calculatedMax };
    }, [leaderboardChartData]);

    const leaderboardOptions = useMemo(() => ({
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        ...barChartClickHandlers,
        scales: {
            x: { min: lbMinMax.min, max: lbMinMax.max, ticks: { color: c.textMuted }, grid: { color: c.grid } },
            y: { ticks: { color: c.text, font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }), [lbMinMax, c, barChartClickHandlers])

    const unstableChartData = useMemo(() => {
        let items = []
        episodeRatings.forEach(a => {
            if (a.episodes && a.episodes.length > 1) {
                const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                const avg = sum / a.episodes.length
                const absDevSum = a.episodes.reduce((acc, ep) => acc + Math.abs(ep.rating - avg), 0)
                items.push({ name: a.name, val: absDevSum / a.episodes.length })
            }
        })

        // slice vrací nové pole — výsledek je nutné přiřadit, jinak se zobrazí všechna anime
        items = items.sort((a, b) => b.val - a.val).slice(0, instabCount)

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: 'Odchylka EPs',
                data: items.map(i => i.val),
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings, instabCount])

    const unstableOptions = useMemo(() => ({
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: false,
        ...barChartClickHandlers,
        scales: {
            x: { title: { display: true, text: 'Průměrná odchylka', color: c.textMuted }, ticks: { color: c.textMuted }, grid: { color: c.grid } },
            y: { ticks: { color: c.text, font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }), [c, barChartClickHandlers])

    // ============================================
    // ROW 4 DATA MEMOIZATION (CATEGORY TABLE)
    // ============================================
    const allCategoryColumns = ['Animace', 'CGI', 'MC', 'Vedlejší postavy', 'Waifu', 'Plot', 'Pacing', 'Story Conclusion', 'Originalita', 'Emoce', 'Enjoyment', 'OP', 'ED', 'OST']
    const categoryColumnAbbreviations = {
        'Animace': 'Anim.',
        'Vedlejší postavy': 'Ved. p.',
        'Story Conclusion': 'S.Conc.',
        'Originalita': 'Orig.',
        'Enjoyment': 'Enjoy.'
    }

    const tableData = useMemo(() => {
        // Merge animeList with categoryRatings
        const merged = animeList.map(anime => {
            const cr = categoryRatings.find(c => c.name === anime.name)
            const categories = cr ? cr.categories : null

            // Calculate WA (weighted average)
            let wa = null
            if (categories) {
                let sumProd = 0
                let sumWeight = 0
                Object.entries(categories).forEach(([cat, rating]) => {
                    const w = categoryWeights[cat] || 1
                    sumProd += rating * w
                    sumWeight += w
                })
                wa = sumWeight > 0 ? (sumProd / sumWeight) : null
            }

            return {
                name: anime.name,
                fh: Number(anime.rating) || null,
                wa,
                categories: categories || {}
            }
        }).filter(item => Object.keys(item.categories).length > 0) // Only anime with category ratings

        // Search filter
        let filtered = merged
        if (tableSearchQuery) {
            const lower = tableSearchQuery.toLowerCase()
            filtered = merged.filter(item => item.name.toLowerCase().includes(lower))
        }

        // Sort
        if (tableSortColumn) {
            filtered = [...filtered].sort((a, b) => {
                let valA, valB
                if (tableSortColumn === 'Anime') {
                    valA = a.name.toLowerCase()
                    valB = b.name.toLowerCase()
                    const cmp = valA.localeCompare(valB, 'cs')
                    return tableSortDirection === 'asc' ? cmp : -cmp
                } else if (tableSortColumn === 'FH') {
                    valA = a.fh
                    valB = b.fh
                } else if (tableSortColumn === 'WA') {
                    valA = a.wa
                    valB = b.wa
                } else {
                    valA = a.categories[tableSortColumn] ?? null
                    valB = b.categories[tableSortColumn] ?? null
                }
                if (valA === null && valB === null) return 0
                if (valA === null) return 1
                if (valB === null) return -1
                return tableSortDirection === 'asc' ? valA - valB : valB - valA
            })
        }

        // Summary stats
        const fhValues = filtered.map(i => i.fh).filter(v => v !== null)
        const avgFh = fhValues.length > 0 ? (fhValues.reduce((s, v) => s + v, 0) / fhValues.length) : 0

        const catAverages = {}
        allCategoryColumns.forEach(cat => {
            const vals = filtered.map(i => i.categories[cat]).filter(v => v !== undefined && v !== null)
            catAverages[cat] = vals.length > 0 ? (vals.reduce((s, v) => s + v, 0) / vals.length) : null
        })

        let bestCat = null, worstCat = null, bestVal = -Infinity, worstVal = Infinity
        Object.entries(catAverages).forEach(([cat, avg]) => {
            if (avg !== null) {
                if (avg > bestVal) { bestVal = avg; bestCat = cat }
                if (avg < worstVal) { worstVal = avg; worstCat = cat }
            }
        })

        return { items: filtered, avgFh, bestCat, bestVal, worstCat, worstVal, total: filtered.length, catAverages }
    }, [animeList, categoryRatings, tableSearchQuery, tableSortColumn, tableSortDirection])

    const handleTableSort = useCallback((column) => {
        if (tableSortColumn === column) {
            // Toggle direction
            setTableSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setTableSortColumn(column)
            setTableSortDirection(column === 'Anime' ? 'asc' : 'desc')
        }
    }, [tableSortColumn])

    const getHeatmapStyle = useCallback((value) => {
        if (value === null || value === undefined) return {}
        let bgColor, textColor
        if (value >= 9.75) { bgColor = 'rgba(29, 161, 242, 0.22)'; textColor = 'rgb(29, 161, 242)' }
        else if (value >= 9.0) { bgColor = 'rgba(24, 106, 59, 0.28)'; textColor = 'rgb(52, 211, 153)' }
        else if (value >= 8.0) { bgColor = 'rgba(40, 180, 99, 0.22)'; textColor = 'rgb(40, 180, 99)' }
        else if (value >= 7.0) { bgColor = 'rgba(244, 208, 63, 0.18)'; textColor = 'rgb(244, 208, 63)' }
        else if (value >= 6.0) { bgColor = 'rgba(243, 156, 18, 0.2)'; textColor = 'rgb(243, 156, 18)' }
        else if (value >= 5.0) { bgColor = 'rgba(99, 57, 116, 0.25)'; textColor = 'rgb(167, 139, 250)' }
        else { bgColor = 'rgba(239, 68, 68, 0.22)'; textColor = 'rgb(239, 68, 68)' }
        return { backgroundColor: bgColor, color: textColor }
    }, [])

    // Verze pro sticky sumarizační řádek: heatmap barva je poloprůhledná,
    // takže by přes ni prosvítal poslední řádek tabulky — podložíme ji
    // neprůhledným pozadím panelu.
    const getFooterHeatmapStyle = useCallback((value) => {
        const s = getHeatmapStyle(value)
        if (!s.backgroundColor) return s
        return {
            color: s.color,
            background: `linear-gradient(${s.backgroundColor}, ${s.backgroundColor}), var(--bg-secondary)`
        }
    }, [getHeatmapStyle])

    if (loading) return <div className="fade-in" style={{ padding: 'var(--spacing-lg)' }}><h2>Načítám parametry a hodnocení...</h2></div>

    // ============================================
    // VIEW 1: DIAGONAL SPLIT SCREEN (LANDING)
    // ============================================
    return (
        <div className="ratings-page fade-in">
            {viewMode === 'split' ? (
                <div className={`ratings-choice-container fade-in${viewPending ? ' choice-loading' : ''}`}>
                    {/* Glowing Diagonal Divider */}
                    <div className="choice-divider"></div>

                    {/* LEFT HALF: JEDNOTLIVĚ (INDIVIDUAL ANIME) */}
                    <div className="choice-pane choice-individual" onClick={() => setViewMode('individual')}>
                        {/* Custom Background Character Art */}
                        {(() => {
                            const bg = getPageBackground(customImages, 'ratings_split_left')
                            return bg ? (
                                <div
                                    className="custom-bg-image"
                                    style={{
                                        backgroundImage: `url(${bg.src})`,
                                        backgroundPosition: bg.position || 'center bottom',
                                        backgroundSize: bg.size || 'contain',
                                        opacity: bg.opacity || 0.12
                                    }}
                                />
                            ) : null
                        })()}

                        {/* Rotating Magic Summoning Circle */}
                        {/* Satella's Heptagram (Witch of Envy / Witch Cult) - Glowing and Prominent */}
                        <svg className="magic-circle" width="420" height="420" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                            {/* Outer rings matching the right side heptagram */}
                            <circle cx="100" cy="100" r="92" strokeWidth="0.8" strokeDasharray="3 2" />
                            <circle cx="100" cy="100" r="88" strokeWidth="0.4" />

                            {/* Heptagram star connecting lines (point at top 100,25) */}
                            <polygon
                                points="100,25 173.1,116.7 67.5,167.6 41.2,53.2 158.8,53.2 132.5,167.6 26.9,116.7"
                                strokeWidth="0.8" opacity="0.85"
                            />

                            {/* Heptagon outline connecting adjacent vertices */}
                            <polygon
                                points="100,25 158.8,53.2 173.1,116.7 132.5,167.6 67.5,167.6 26.9,116.7 41.2,53.2"
                                strokeWidth="0.9" opacity="0.9"
                            />

                            {/* Inner concentric circular rings */}
                            <circle cx="100" cy="100" r="45" strokeWidth="0.8" />
                            <circle cx="100" cy="100" r="28" strokeWidth="0.4" strokeDasharray="3 2" />
                            <circle cx="100" cy="100" r="14" strokeWidth="0.6" />

                            {/* Central vertical line extending from top vertex to center hook */}
                            <line x1="100" y1="25" x2="100" y2="88" strokeWidth="1.0" opacity="0.85" />

                            {/* Central Witch of Envy crescent hook symbol */}
                            <path
                                d="M 100,85 C 102,90 106,94 106,100 C 106,112 94,120 82,110 C 74,102 76,92 84,86 C 88,83 94,86 92,92 C 88,96 82,96 82,102 C 82,108 92,112 98,106 C 101,102 100,96 98,90 Z"
                                fill="currentColor"
                                stroke="none"
                            />
                        </svg>

                        <div className="choice-card">
                            <div className="choice-icon-wrapper">📋</div>
                            <h2 className="choice-title">HODNOCENÍ JEDNOTLIVĚ</h2>
                            <div className="choice-subtitle">EPISODES • RADARS • CORRELATIONS</div>
                            <p className="choice-desc">Tradiční detailní pohled na každé anime samostatně s komplexními parametry, radarem a recenzemi.</p>
                            <button className="choice-btn">Vstoupit do tabulek →</button>
                        </div>
                    </div>

                    {/* RIGHT HALF: SÉRIE (SERIES LEVEL VIEW) */}
                    <div className="choice-pane choice-series" onClick={() => setViewMode('series')}>
                        {/* Custom Background Character Art */}
                        {(() => {
                            const bg = getPageBackground(customImages, 'ratings_split_right')
                            return bg ? (
                                <div
                                    className="custom-bg-image"
                                    style={{
                                        backgroundImage: `url(${bg.src})`,
                                        backgroundPosition: bg.position || 'center bottom',
                                        backgroundSize: bg.size || 'contain',
                                        opacity: bg.opacity || 0.12
                                    }}
                                />
                            ) : null
                        })()}

                        {/* Re:Zero Witch Factor Heptagram with Skulls - Glowing and Prominent */}
                        <svg className="cyber-grid" width="420" height="420" viewBox="0 0 200 200" fill="none" stroke="currentColor">
                            {/* Outer ring */}
                            <circle cx="100" cy="100" r="92" strokeWidth="0.8" strokeDasharray="3 2" />
                            <circle cx="100" cy="100" r="88" strokeWidth="0.4" />

                            {/* Heptagram star connecting lines (solid, prominent) */}
                            <polygon
                                points="100,168 33.7,84.9 129.5,38.7 153.2,142.4 46.8,142.4 70.5,38.7 166.3,84.9"
                                strokeWidth="0.8" opacity="0.85"
                            />

                            {/* Heptagon outline connecting adjacent circles */}
                            <polygon
                                points="100,168 46.8,142.4 33.7,84.9 70.5,38.7 129.5,38.7 166.3,84.9 153.2,142.4"
                                strokeWidth="0.9" opacity="0.9"
                            />

                            {/* Inner decorative circle */}
                            <circle cx="100" cy="100" r="28" strokeWidth="0.8" />
                            <circle cx="100" cy="100" r="25" strokeWidth="0.4" strokeDasharray="4 2" />
                            <circle cx="100" cy="100" r="12" strokeWidth="0.8" />
                            <polygon points="100,91 108,105 92,105" strokeWidth="0.6" />
                            <polygon points="100,109 108,95 92,95" strokeWidth="0.6" />

                            {/* Connecting lines from center to each skull */}
                            {heptagramVertices.map(v => (
                                <line
                                    key={`line-${v.id}`}
                                    x1="100"
                                    y1="100"
                                    x2={v.x}
                                    y2={v.y}
                                    strokeWidth="0.4"
                                    strokeDasharray="2 3"
                                    opacity="0.65"
                                />
                            ))}

                            {/* Render each Witch circle & skull */}
                            {heptagramVertices.map(v => (
                                <g key={`vertex-${v.id}`} className={`witch-node node-${v.witch}`}>
                                    {/* Outer circle for vertex */}
                                    <circle cx={v.x} cy={v.y} r="13" strokeWidth="1.2" fill="var(--bg-tertiary)" />
                                    <circle cx={v.x} cy={v.y} r="11" strokeWidth="0.5" strokeDasharray="2 1" />

                                    {/* Upright Skull with specific witch characteristics */}
                                    <g transform={`translate(${v.x}, ${v.y})`}>
                                        {renderBaseSkull(0.95)}
                                        {renderWitchDetails(v.witch)}
                                    </g>

                                    {/* Number tag bubble */}
                                    <circle
                                        cx={v.x + v.tagDx}
                                        cy={v.y + v.tagDy}
                                        r="4.2"
                                        strokeWidth="0.75"
                                        fill="var(--bg-primary)"
                                    />
                                    <text
                                        x={v.x + v.tagDx}
                                        y={v.y + v.tagDy + 1.3}
                                        fontSize="3.8"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        fill="currentColor"
                                        stroke="none"
                                    >
                                        {v.label}
                                    </text>
                                </g>
                            ))}
                        </svg>

                        <div className="choice-card">
                            <div className="choice-icon-wrapper">📚</div>
                            <h2 className="choice-title">HODNOCENÍ SÉRIÍ</h2>
                            <div className="choice-subtitle">TIMELINES • SEASONS • WEIGHTED AVERAGES</div>
                            <p className="choice-desc">Pokročilé vizuální zobrazení seskupených sezón s průměrnými radary a spojenou časovou osou epizod.</p>
                            <button className="choice-btn">Vstoupit do sérií →</button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Navigation action tabs */}
                    <div className="ratings-header-container">
                        <h1 style={{ margin: 0 }}>Anime hodnocení a analýza</h1>
                        <div className="ratings-header-actions">
                            <button className="btn-nav" onClick={() => setViewMode('split')}>🧩 Rozcestník</button>
                            <button className={`btn-nav ${viewMode === 'series' ? 'active' : ''}`} onClick={() => setViewMode('series')}>📚 Série</button>
                            <button className={`btn-nav ${viewMode === 'individual' ? 'active' : ''}`} onClick={() => setViewMode('individual')}>📋 Jednotlivě</button>
                        </div>
                    </div>

                    {/* ============================================
                VIEW 2: SERIES RATINGS VIEW
                ============================================ */}
                    {viewMode === 'series' && (
                        <div className="ratings-row row-1 series-row-1 fade-in">
                            {/* 1. Selector sérií (Left) */}
                            <div className="ratings-panel left-panel" ref={seriesLeftPanelRef}>
                                <h3 className="ratings-panel-title">Vyberte Sérii</h3>
                                <DebouncedSearchInput
                                    placeholder="Hledat sérii..."
                                    onSearch={setSearchQuerySeries}
                                    initialValue={searchQuerySeries}
                                />
                                <div className="anime-selector-list">
                                    {(() => {
                                        // B4-1: mountnout jen viditelný začátek seznamu sérií,
                                        // zbytek po prvním paintu (stejně jako u Jednotlivě)
                                        const renderItem = (s) => (
                                            <div
                                                key={s.name}
                                                className={`anime-selector-item ${selectedSeries === s.name ? 'active' : ''}`}
                                                onClick={() => setSelectedSeries(s.name)}
                                            >
                                                <div className="selector-item-content">
                                                    <span className="selector-item-name">{s.name}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        {s.items.length} {s.items.length === 1 ? 'část' : (s.items.length < 5 ? 'části' : 'částí')}
                                                    </span>
                                                </div>
                                                <div className="selector-item-rating" style={{ color: 'var(--accent-pink)' }}>
                                                    {s.avgRating > 0 ? fmtFH(s.avgRating) : '?'}
                                                </div>
                                            </div>
                                        )
                                        const HEAD = 60
                                        if (filteredSeriesList.length <= HEAD) return filteredSeriesList.map(renderItem)
                                        return (
                                            <>
                                                {filteredSeriesList.slice(0, HEAD).map(renderItem)}
                                                <Deferred placeholderHeight={(filteredSeriesList.length - HEAD) * 52}>
                                                    {filteredSeriesList.slice(HEAD).map(renderItem)}
                                                </Deferred>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* 2. Series Detail Center & Right Panel */}
                            <div className="right-panel" ref={seriesRightPanelRef}>
                                {/* A. Hlavička Série — hero banner s backdropem, velkým posterem a boxy */}
                                {selectedSeriesObj && (
                                    <div className="series-header-card series-header-hero">
                                        {selectedSeriesObj.thumbnail && (
                                            <div
                                                className="series-header-backdrop"
                                                style={{ backgroundImage: `url("${selectedSeriesObj.thumbnail.replace(/#/g, '%23')}")` }}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {selectedSeriesObj.thumbnail ? (
                                            <div className="series-header-poster-frame series-header-poster-frame-lg">
                                                <img
                                                    src={selectedSeriesObj.thumbnail}
                                                    alt={selectedSeriesObj.name}
                                                    onError={(e) => { e.target.src = 'placeholder.jpg'; e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="series-header-poster series-header-poster-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', fontSize: '1.5rem' }}>🎬</div>
                                        )}

                                        <div className="series-header-info">
                                            <div className="series-header-title-row">
                                                <h2 className="series-header-title">{selectedSeriesObj.name}</h2>
                                                {seriesHeaderStats?.genres?.length > 0 && (
                                                    <div className="series-genre-chips" style={{ marginTop: 0 }}>
                                                        {seriesHeaderStats.genres.map(g => (
                                                            <span key={g} className="series-genre-chip">{g}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* FH kruh + meta grid v jednom řádku (kopíruje detail anime) */}
                                            <div className="series-hero-meta-row">
                                                {/* FH kruh (průměr částí) s "?" průvodcem */}
                                                {selectedSeriesObj.avgRating > 0 && (() => {
                                                    const rColor = ratingVar(selectedSeriesObj.avgRating)
                                                    return (
                                                        <div className="series-header-fh" style={{ position: 'relative' }}>
                                                            <div className="series-fh-circle" style={{
                                                                borderColor: rColor,
                                                                background: `color-mix(in srgb, ${rColor} 12%, transparent)`
                                                            }}>
                                                                <span className="series-fh-value" style={{ color: rColor }}>
                                                                    {fmtFH(selectedSeriesObj.avgRating)}
                                                                </span>
                                                                <span className="series-fh-outof">/10 AVG</span>
                                                            </div>
                                                            <RatingInfoButton
                                                                label="Co znamená finální hodnocení"
                                                                style={{ position: 'absolute', top: '-7px', right: '-16px' }}
                                                                onClick={() => setFhGuideOpen(true)}
                                                            />
                                                        </div>
                                                    )
                                                })()}

                                                {/* Plochý metagrid místo boxů — stejný styl jako hlavička detailu.
                                                    Batch 3 task 2: + SVG ikonky a hover zvýraznění položek */}
                                                <div className="series-header-metagrid series-header-metagrid-lg">
                                                    {seriesHeaderStats?.avgEp && (
                                                        <div className="series-meta-item" title="Průměr všech ohodnocených epizod série">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="avgEp" />Průměr epizod</span>
                                                            <span className="series-meta-value" style={{ color: ratingVar(seriesHeaderStats.avgEp) }}>{fmtFH(seriesHeaderStats.avgEp)}</span>
                                                        </div>
                                                    )}
                                                    {seriesHeaderStats?.wa && (
                                                        <div className="series-meta-item" title="Vážený průměr hodnocení kategorií napříč sérií">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="wa" />WA kategorií</span>
                                                            <span className="series-meta-value" style={{ color: ratingVar(seriesHeaderStats.wa) }}>{fmtFH(seriesHeaderStats.wa)}</span>
                                                        </div>
                                                    )}
                                                    <div className="series-meta-item" title="Počet částí série (sezóny, filmy, speciály)">
                                                        <span className="series-meta-label"><SeriesMetaIcon kind="parts" />Částí</span>
                                                        <span className="series-meta-value">{selectedSeriesObj.items.length}{seriesHeaderStats?.typeSummary ? ` (${seriesHeaderStats.typeSummary})` : ''}</span>
                                                    </div>
                                                    <div className="series-meta-item" title="Celkový počet epizod všech částí">
                                                        <span className="series-meta-label"><SeriesMetaIcon kind="episodes" />Epizod</span>
                                                        <span className="series-meta-value">{selectedSeriesObj.totalEps}</span>
                                                    </div>
                                                    {seriesHeaderStats?.totalTime && (
                                                        <div className="series-meta-item" title="Součet délky všech epizod série">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="time" />Celkový čas</span>
                                                            <span className="series-meta-value">{seriesHeaderStats.totalTime}</span>
                                                        </div>
                                                    )}
                                                    {seriesHeaderStats?.yearsRange && (
                                                        <div className="series-meta-item" title="Roky vydání první a poslední části">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="release" />Vydání</span>
                                                            <span className="series-meta-value">{seriesHeaderStats.yearsRange}</span>
                                                        </div>
                                                    )}
                                                    {seriesHeaderStats?.watchedRange && (
                                                        <div className="series-meta-item" title="Období, kdy jsem sérii sledoval">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="watched" />Sledováno</span>
                                                            <span className="series-meta-value">{seriesHeaderStats.watchedRange}</span>
                                                        </div>
                                                    )}
                                                    {seriesHeaderStats?.rewatchTotal > 0 && (
                                                        <div className="series-meta-item" title="Kolikrát jsem části série viděl znovu">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="rewatch" />Rewatch</span>
                                                            <span className="series-meta-value">{seriesHeaderStats.rewatchTotal}×</span>
                                                        </div>
                                                    )}
                                                    {selectedSeriesObj.studios.length > 0 && (
                                                        <div className="series-meta-item" title="Studia, která sérii animovala">
                                                            <span className="series-meta-label"><SeriesMetaIcon kind="studio" />Studio</span>
                                                            <span className="series-meta-value">{selectedSeriesObj.studios.join(', ')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Batch 3 task 2: interaktivní pás částí série — vyplní prázdné
                                                místo hlavičky; chip = část + její hodnocení, klik → detail */}
                                            {selectedSeriesObj.items.length > 0 && (
                                                <div className="series-header-parts">
                                                    {selectedSeriesObj.items.map((it, idx) => {
                                                        const st = seasonStyles[idx % seasonStyles.length]
                                                        const r = Number(it.rating)
                                                        return (
                                                            <Link
                                                                key={it.name}
                                                                to={`/anime/${encodeURIComponent(it.name)}`}
                                                                state={{
                                                                    fromSeries: selectedSeriesObj.name,
                                                                    fromViewMode: viewMode
                                                                }}
                                                                className="series-header-part-chip"
                                                                style={{ background: st.bg, borderColor: st.border, color: st.text }}
                                                                title={`Otevřít detail: ${it.name}`}
                                                            >
                                                                <span className="series-part-chip-name">{cleanSeasonLabel(it.name, selectedSeriesObj.name) || it.name}</span>
                                                                {r > 0 && (
                                                                    <span className="series-part-chip-rating" style={{ color: ratingVar(r) }}>{fmtFH(r)}</span>
                                                                )}
                                                            </Link>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* B. Přepínač zobrazení sérií */}
                                <div className="series-tabs-container">
                                    <button
                                        className={`series-tab-btn ${seriesTab === 'timeline' ? 'active' : ''}`}
                                        onClick={() => setSeriesTab('timeline')}
                                    >
                                        📈 Spojená osa epizod (Timeline)
                                    </button>
                                    <button
                                        className={`series-tab-btn ${seriesTab === 'details' ? 'active' : ''}`}
                                        onClick={() => setSeriesTab('details')}
                                    >
                                        📂 Detaily sezón & Radar
                                    </button>
                                </div>

                                {/* C. Vizualizační plocha — jednotná výška pro obě záložky */}
                                <div className="ratings-row series-viz-row">
                                    {seriesTab === 'timeline' ? (
                                        <>
                                            <div className="ratings-panel viz-main-panel">
                                                {/* B4-2: hlavička sjednocená s grafem „Hodnocení epizod" v detailu
                                                    anime — průměr v titulku (bíle jako v detailu), AI info text a
                                                    barevná legenda úrovní (pod grafem, ve volném místě).
                                                    Specifika série (filtr zdroje, trendová čára) zůstávají. */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                                                        <h3 className="ratings-panel-title" style={{ margin: 0 }}>
                                                            Spojitý vývoj hodnocení epizod
                                                            {yAxisRange.avg !== null && (
                                                                <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 'normal', textTransform: 'none' }}>
                                                                    (Průměr: <span style={{ fontWeight: 'bold' }}>{yAxisRange.avg.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}</span>)
                                                                </span>
                                                            )}
                                                            <RatingInfoButton
                                                                label="Jak hodnotím epizody"
                                                                style={{ marginLeft: '8px' }}
                                                                onClick={() => setEpGuideOpen(true)}
                                                            />
                                                        </h3>
                                                        <div className="chart-toggles-container" style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Zdroj:</span>
                                                                <select
                                                                    value={ratingSource}
                                                                    onChange={(e) => setRatingSource(e.target.value)}
                                                                    className="slicer-select"
                                                                    style={{
                                                                        background: 'var(--bg-tertiary)',
                                                                        border: '1px solid var(--border-color)',
                                                                        color: 'var(--text-primary)',
                                                                        borderRadius: 'var(--radius-md)',
                                                                        padding: '4px 8px',
                                                                        fontSize: '0.8rem',
                                                                        cursor: 'pointer',
                                                                        outline: 'none',
                                                                        width: 'auto'
                                                                    }}
                                                                >
                                                                    <option value="moje">Moje hodnocení</option>
                                                                    <option value="mal">MAL hodnocení</option>
                                                                    <option value="imdb">IMDb hodnocení</option>
                                                                </select>
                                                            </div>
                                                            <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                                                <input type="checkbox" checked={showTrendLine} onChange={(e) => setShowTrendLine(e.target.checked)} style={{ accentColor: 'var(--accent-pink)', cursor: 'pointer' }} />
                                                                Trendová čára
                                                            </label>
                                                        </div>
                                                    </div>
                                                    {seriesHasDocxReviews && (
                                                        <p className="category-ratings-info-text" style={{ margin: 0 }}>
                                                            Faktické rozbory epizod byly vygenerovány AI z webových zdrojů a mohou obsahovat chyby. Kliknutím na bod (tečku) konkrétní epizody v grafu zobrazíte její detailní rozbor.
                                                        </p>
                                                    )}
                                                </div>
                                                <div style={{ flex: 1, position: 'relative' }}>
                                                    {timelineChartData ? (
                                                        <Chart
                                                            type="line"
                                                            data={timelineChartData}
                                                            options={timelineOptions}
                                                            plugins={[seasonBoundariesPlugin]}
                                                        />
                                                    ) : (
                                                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '70px' }}>
                                                            Série nemá ohodnocené epizody pro zobrazení timeline
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Barevná legenda úrovní — pod grafem ve volném místě (B4-2) */}
                                                {timelineChartData && (
                                                    <div className="chart-legend-container" style={{ justifyContent: 'flex-end', marginTop: '-8px', maxWidth: '100%' }}>
                                                        {[
                                                            ['rgb(29, 161, 242)', 'Absolute Cinema'],
                                                            ['rgb(24, 106, 59)', 'Awesome'],
                                                            ['rgb(40, 180, 99)', 'Great'],
                                                            ['rgb(244, 208, 63)', 'Good'],
                                                            ['rgb(243, 156, 18)', 'Regular'],
                                                            ['rgb(99, 57, 116)', 'Bad'],
                                                        ].map(([col, lbl]) => (
                                                            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: col }}></span>
                                                                <span>{lbl}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Epizodní panel vpravo — Jikan episode list / detail */}
                                            <div className="ratings-panel episode-panel">
                                                {selectedTimelineEp ? (
                                                    /* ===== STAV B: Epizoda vybrána — detail + synopsis ===== */
                                                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                                        <div className="episode-detail-header">
                                                            <button className="episode-back-btn" onClick={() => setSelectedTimelineEp(null)}>
                                                                ← Seznam
                                                            </button>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                                                {selectedTimelineEp.epName}
                                                            </span>
                                                        </div>
                                                        <div className="episode-detail-title">
                                                            {(timelineDocxReview && !timelineDocxReview.isStory && timelineDocxReview.title)
                                                                || (selectedTimelineEp.epName === "Film"
                                                                    ? `Film ${selectedTimelineEp.animeName}`
                                                                    : (jikanSynopsis?.title || selectedTimelineEp.epName))}
                                                        </div>
                                                        {selectedTimelineEp.epName !== "Film" && (
                                                            <div className="episode-season-label">
                                                                Sezóna: <span style={{ color: 'var(--accent-pink)' }}>{selectedTimelineEp.animeName}</span>
                                                            </div>
                                                        )}
                                                        <div className="episode-detail-meta">
                                                            <span className="meta-badge" style={{ background: getPointColor(selectedTimelineEp.rating), color: getPointTextColor(selectedTimelineEp.rating) }}>
                                                                EP: {selectedTimelineEp.epName === 'Film' ? selectedTimelineEp.rating.toFixed(2).replace('.', ',') : (Number.isInteger(selectedTimelineEp.rating) ? selectedTimelineEp.rating : selectedTimelineEp.rating.toFixed(2).replace('.', ','))}
                                                            </span>
                                                            {(() => {
                                                                // Find MAL score from jikanEpisodes list
                                                                const epName = selectedTimelineEp.epName
                                                                const epMatch = epName.match(/EP\s*(\d+)/i)
                                                                const epNum = epMatch ? parseInt(epMatch[1], 10) : null
                                                                const malEp = epNum && jikanEpisodes ? jikanEpisodes.find(e => e.mal_id === epNum) : null
                                                                if (malEp && malEp.score) {
                                                                    return <span className="meta-badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>MAL: {malEp.score.toFixed(2).replace('.', ',')}</span>
                                                                }
                                                                return null
                                                            })()}
                                                            {(() => {
                                                                // Find IMDb score from imdbCache
                                                                const anime = animeList.find(a => a.name === selectedTimelineEp.animeName)
                                                                if (!anime || !anime.mal_url) return null
                                                                const malId = extractMalId(anime.mal_url)
                                                                const imdbAnime = imdbCache[String(malId)]
                                                                if (imdbAnime && imdbAnime.episodes) {
                                                                    const score = imdbAnime.episodes[selectedTimelineEp.epName]
                                                                    if (score) {
                                                                        return (
                                                                            <span className="meta-badge" style={{ background: '#f5c518', color: '#000000', fontWeight: 'bold' }}>
                                                                                IMDb: {score.toFixed(2).replace('.', ',')}
                                                                            </span>
                                                                        )
                                                                    }
                                                                }
                                                                return null
                                                            })()}
                                                            {jikanSynopsis?.filler && <span className="ep-badge filler">Filler</span>}
                                                            {jikanSynopsis?.recap && <span className="ep-badge recap">Recap</span>}
                                                        </div>
                                                        {(() => {
                                                            const anime = animeList.find(a => a.name === selectedTimelineEp.animeName);
                                                            const airedDate = jikanSynopsis?.aired;
                                                            const durationText = jikanSynopsis?.duration
                                                                ? formatDuration(jikanSynopsis.duration)
                                                                : (anime?.episode_duration ? `${Math.round(anime.episode_duration)} min` : '');

                                                            if (airedDate || durationText) {
                                                                return (
                                                                    <div className="episode-aired-date">
                                                                        {airedDate && `Aired: ${new Date(airedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                                                                        {airedDate && durationText ? ' · ' : ''}
                                                                        {durationText}
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                        {/* Task 7: místo MAL/Jikan synopse můj rozbor epizody (u filmů děj) */}
                                                        <div className="episode-synopsis-container">
                                                            {timelineDocxReview?.text ? (
                                                                <div className="episode-review-docx">
                                                                    {formatCategoryMarkdown(timelineDocxReview.text)}
                                                                </div>
                                                            ) : (
                                                                <p className="episode-synopsis-placeholder">
                                                                    {selectedTimelineEp.epName === 'Film'
                                                                        ? 'Rozbor děje zatím není k dispozici.'
                                                                        : 'Rozbor epizody zatím není k dispozici.'}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div style={{ marginTop: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontStyle: 'italic', margin: 0 }}>
                                                                Chronologicky {selectedTimelineEp.index}. v pořadí série.
                                                            </p>
                                                            <div className="episode-nav-buttons">
                                                                <button
                                                                    className="ep-nav-btn"
                                                                    onClick={handlePrevEp}
                                                                    disabled={!hasPrevEp}
                                                                    title="Předchozí epizoda"
                                                                >
                                                                    ←
                                                                </button>
                                                                <button
                                                                    className="ep-nav-btn"
                                                                    onClick={handleNextEp}
                                                                    disabled={!hasNextEp}
                                                                    title="Další epizoda"
                                                                >
                                                                    →
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* ===== STAV A: Žádná epizoda nevybrána — seznam ===== */
                                                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                                        <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem' }}>
                                                            {selectedSeriesSeason ? `Epizody` : 'Detail epizod'}
                                                        </h3>
                                                        {jikanLoading ? (
                                                            <div className="episode-panel-loading">
                                                                <div className="loading-spinner"></div>
                                                                Načítání epizod...
                                                            </div>
                                                        ) : jikanEpisodes && jikanEpisodes.length > 0 ? (
                                                            <div className="episode-list-panel">
                                                                {jikanEpisodes.map((ep, epIdx) => {
                                                                    const epTitle = episodeDisplayTitle(ep, selectedSeries, categoryReviews)
                                                                    return (
                                                                    <div
                                                                        key={`${ep.animeName}_${ep.mal_id}_${epIdx}`}
                                                                        className="episode-list-item"
                                                                        onClick={() => {
                                                                            // Find the exact matching chronological episode in our seriesTimelineData
                                                                            const isMovie = ep.cleanSeasonName.toLowerCase().includes('film') || ep.cleanSeasonName.toLowerCase().includes('movie') || ep.cleanSeasonName.toLowerCase().includes('0');
                                                                            const tEp = seriesTimelineData?.episodes?.find(t =>
                                                                                t.animeName === ep.animeName &&
                                                                                (t.epName === `EP ${ep.mal_id}` || (t.epName === 'Film' && ep.mal_id === 1))
                                                                            )
                                                                            if (tEp) {
                                                                                setSelectedTimelineEp(tEp)
                                                                            } else {
                                                                                // Fallback if not found in timeline data
                                                                                const animeName = ep.animeName
                                                                                const erObj = episodeRatings.find(er => er.name === animeName)
                                                                                const ourEp = erObj?.episodes?.find(e => {
                                                                                    const m = e.episode.match(/EP\s*(\d+)/i)
                                                                                    return m && parseInt(m[1], 10) === ep.mal_id
                                                                                })
                                                                                const targetRating = ourEp ? ourEp.rating : (Number(animeList.find(a => a.name === animeName)?.rating) || 0)
                                                                                setSelectedTimelineEp({
                                                                                    index: ep.mal_id,
                                                                                    rating: targetRating,
                                                                                    epName: ep.mal_id === 1 && (isMovie || animeList.find(a => a.name === animeName)?.type === 'Movie') ? 'Film' : `EP ${ep.mal_id}`,
                                                                                    animeName: animeName,
                                                                                    seasonName: ep.cleanSeasonName
                                                                                })
                                                                            }
                                                                        }}
                                                                        title={`${ep.cleanSeasonName} - EP ${ep.mal_id}: ${epTitle}`}
                                                                    >
                                                                        {selectedSeriesObj && selectedSeriesObj.items.length > 1 && (() => {
                                                                            const colorIdx = seasonColorMap[ep.cleanSeasonName] ?? 0;
                                                                            const styleObj = seasonStyles[colorIdx % seasonStyles.length];
                                                                            return (
                                                                                <span
                                                                                    className="ep-season-badge"
                                                                                    style={{
                                                                                        background: styleObj.bg,
                                                                                        borderColor: styleObj.border,
                                                                                        color: styleObj.text
                                                                                    }}
                                                                                >
                                                                                    {ep.cleanSeasonName}
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                        <span className="ep-number">EP {ep.mal_id}</span>
                                                                        <span className="ep-title">{epTitle}</span>
                                                                        {ep.filler && <span className="ep-badge filler">Fill</span>}
                                                                        {ep.recap && <span className="ep-badge recap">Rec</span>}
                                                                        {ep.score && <span className="ep-score">★ {ep.score.toFixed(1)}</span>}
                                                                    </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        ) : seriesTimelineData?.episodes?.length > 0 ? (
                                                            <div className="episode-synopsis-placeholder">
                                                                Data epizod se stahují na pozadí...<br />
                                                                Kliknutím na bod v grafu zobrazíte detail.
                                                            </div>
                                                        ) : (
                                                            <div className="episode-synopsis-placeholder">
                                                                Žádná data k dispozici.
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {/* Radar kategorií ve stylu detailu anime + porovnání vybrané části */}
                                            <div className="ratings-panel viz-main-panel">
                                                <h3 className="ratings-panel-title" style={{ marginBottom: '4px' }}>
                                                    Kategorie série
                                                    <RatingInfoButton
                                                        label="Jak hodnotím kategorie"
                                                        style={{ marginLeft: '8px' }}
                                                        onClick={() => setCatGuideOpen(true)}
                                                    />
                                                </h3>
                                                <p className="series-radar-explain">
                                                    Agregovaný průměr = průměr hodnocení každé kategorie napříč všemi
                                                    ohodnocenými částmi série (každá část má stejnou váhu). Vyber část
                                                    níže a porovnáš ji novou barvou přímo přes průměr série.
                                                </p>
                                                <div className="series-radar-chips">
                                                    <button
                                                        type="button"
                                                        className={`series-radar-chip avg${!compareSeason ? ' active' : ''}`}
                                                        onClick={() => setCompareSeason(null)}
                                                    >
                                                        Ø Průměr série
                                                    </button>
                                                    {ratedSeriesParts.map(a => (
                                                        <button
                                                            key={a.name}
                                                            type="button"
                                                            className={`series-radar-chip compare${compareSeason === a.name ? ' active' : ''}`}
                                                            title={a.name}
                                                            onClick={() => setCompareSeason(compareSeason === a.name ? null : a.name)}
                                                        >
                                                            {cleanSeasonLabel(a.name, selectedSeries)}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                                    {selectedSeriesCategories ? (
                                                        <CategoryRadar
                                                            entries={Object.entries(selectedSeriesCategories)}
                                                            primaryLabel="Průměr série"
                                                            overlayEntries={compareSeasonEntries}
                                                            overlayLabel={compareSeason ? cleanSeasonLabel(compareSeason, selectedSeries) : null}
                                                            height={null}
                                                            scaleMin={seriesRadarScale?.min ?? null}
                                                            scaleMax={seriesRadarScale?.max ?? null}
                                                            onCategoryClick={handleRadarCategoryClick}
                                                        />
                                                    ) : (
                                                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
                                                            Žádná data pro radar
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Pravý sloupec: mřížka epizod + recenze pod ní */}
                                            <div className="viz-side-col">
                                            <div className="ratings-panel viz-grid-panel">
                                                <h3 className="ratings-panel-title">Mřížka epizod (Episode Grid)</h3>
                                                <div className="seasons-grids-list">
                                                    {selectedSeriesObj?.items.map(anime => {
                                                        const isMovieOrSingleEpisode =
                                                            anime.type === "Movie" ||
                                                            Number(anime.episodes) === 1 ||
                                                            anime.name === "The Disappearance of Haruhi Suzumiya" ||
                                                            anime.name.toLowerCase().includes("heaven's feel") ||
                                                            anime.name.toLowerCase().includes("movie") ||
                                                            anime.name.toLowerCase().includes("film");

                                                        let epsToUse = []
                                                        if (isMovieOrSingleEpisode) {
                                                            const avgCat = getAvgCat(anime.name)
                                                            epsToUse = [{
                                                                episode: "Film",
                                                                rating: avgCat !== null ? avgCat : (Number(anime.rating) || 0)
                                                            }]
                                                        } else {
                                                            const erObj = episodeRatings.find(er => er.name === anime.name)
                                                            if (erObj && erObj.episodes && erObj.episodes.length > 0) {
                                                                epsToUse = erObj.episodes
                                                            } else {
                                                                const avgCat = getAvgCat(anime.name)
                                                                if (avgCat !== null) {
                                                                    epsToUse = [{
                                                                        episode: "Film",
                                                                        rating: avgCat
                                                                    }]
                                                                }
                                                            }
                                                        }

                                                        if (epsToUse.length === 0) return null

                                                        // Calculate average rating for this season
                                                        const seasonRatings = epsToUse.map(e => e.rating).filter(r => !isNaN(r) && r > 0)
                                                        const seasonAvg = seasonRatings.length > 0 ? (seasonRatings.reduce((sum, r) => sum + r, 0) / seasonRatings.length) : 0

                                                        const cleanSeasonName = anime.name.replace(selectedSeriesObj.name + ', ', '').replace(selectedSeriesObj.name + ' ', '')
                                                        const isSelected = selectedAnimeTitle === anime.name

                                                        return (
                                                            <div
                                                                key={anime.name}
                                                                className={`season-grid-section ${isSelected ? 'active' : ''}`}
                                                                style={{
                                                                    borderLeft: isSelected ? '3px solid var(--accent-pink)' : '3px solid transparent',
                                                                    paddingLeft: '8px',
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                <h4
                                                                    className="season-grid-title"
                                                                    style={{
                                                                        cursor: 'pointer',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                                    }}
                                                                    onClick={() => {
                                                                        setSelectedSeriesSeason(anime.name)
                                                                        setSelectedAnimeTitle(anime.name)
                                                                        setCompareSeason(anime.name) // promítne část i do radaru
                                                                    }}
                                                                >
                                                                    <span>{cleanSeasonName}</span>
                                                                    <span className="season-grid-avg">
                                                                        (průměr {seasonAvg > 0 ? fmtFH(seasonAvg) : 'N/A'})
                                                                    </span>
                                                                </h4>
                                                                <div className="episode-grid-container" style={{ marginTop: '8px' }}>
                                                                    {epsToUse.map(ep => (
                                                                        <div
                                                                            key={ep.episode}
                                                                            className="episode-grid-card"
                                                                            style={{ backgroundColor: getPointColor(ep.rating) }}
                                                                            onClick={() => {
                                                                                setSelectedSeriesSeason(anime.name)
                                                                                setSelectedAnimeTitle(anime.name)
                                                                                // Detail epizody žije v záložce Timeline — přepneme,
                                                                                // ať kliknutí není naprázdno
                                                                                const tEp = seriesTimelineData?.episodes?.find(t =>
                                                                                    t.animeName === anime.name && t.epName === ep.episode
                                                                                )
                                                                                setSelectedTimelineEp(tEp || {
                                                                                    index: ep.episode === "Film" ? 1 : ep.episode.replace('EP ', ''),
                                                                                    rating: ep.rating,
                                                                                    epName: ep.episode,
                                                                                    animeName: anime.name
                                                                                })
                                                                                setSeriesTab('timeline')
                                                                            }}
                                                                            title={`${anime.name} - ${ep.episode}: ${ep.episode === 'Film' ? ep.rating.toFixed(2).replace('.', ',') : (Number.isInteger(ep.rating) ? ep.rating : ep.rating.toFixed(2).replace('.', ','))}`}
                                                                        >
                                                                            <span className="ep-card-num">{ep.episode.replace('EP ', 'E')}</span>
                                                                            <span className="ep-card-val">{parseFloat(ep.rating.toFixed(2)).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                            {/* Recenze vybrané části pod mřížkou */}
                                            <div className="ratings-panel viz-review-panel">
                                                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    {selectedAnimeTitle ? `📝 Recenze: ${selectedAnimeTitle}` : '📝 Recenze série'}
                                                </h4>
                                                <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.78rem', lineHeight: '1.4', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', padding: '6px', borderRadius: 'var(--radius-md)' }}>
                                                    {selectedAnimeNote ? formatReview(selectedAnimeNote.replace(/_x000D_/g, ''), selectedAnimeTitle) : 'Vyberte část série pro zobrazení recenze.'}
                                                </div>
                                            </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ============================================
                VIEW 3: INDIVIDUAL RATINGS VIEW
                — kategorie + radar převzaté 1:1 z detailu anime
                ============================================ */}
                    {viewMode === 'individual' && (
                        <div className="ratings-row row-1 fade-in" style={{ alignItems: 'flex-start' }}>
                            {/* 1. Selektor (Left) — sticky chování řeší CSS (.row-1 .left-panel) */}
                            <div className="ratings-panel left-panel">
                                <h3 className="ratings-panel-title">Vyberte Anime</h3>
                                <DebouncedSearchInput
                                    placeholder="Hledat..."
                                    onSearch={setSearchQuery}
                                    initialValue={searchQuery}
                                />
                                <div className="anime-selector-list">
                                    {(() => {
                                        // B4-1: při přepnutí z rozcestníku mountnout jen viditelný
                                        // začátek dlouhého seznamu, zbytek po prvním paintu
                                        const renderItem = (a) => (
                                            <div
                                                key={a.name}
                                                className={`anime-selector-item ${selectedAnimeTitle === a.name ? 'active' : ''}`}
                                                onClick={() => setSelectedAnimeTitle(a.name)}
                                            >
                                                <div className="selector-item-content">
                                                    <span className="selector-item-name">{a.name}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.type}</span>
                                                </div>
                                                <div className="selector-item-rating">{a.rating || '?'}</div>
                                            </div>
                                        )
                                        const HEAD = 60
                                        if (row1AnimeList.length <= HEAD) return row1AnimeList.map(renderItem)
                                        return (
                                            <>
                                                {row1AnimeList.slice(0, HEAD).map(renderItem)}
                                                <Deferred placeholderHeight={(row1AnimeList.length - HEAD) * 52}>
                                                    {row1AnimeList.slice(HEAD).map(renderItem)}
                                                </Deferred>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* 2. Pravý sloupec: hlavička + kategorie/radar z detailu + epizody + recenze */}
                            <div className="right-panel">
                                {/* Hlavička anime — mimikuje hero z detailu (badge, meta, žánry, témata, AniList tagy) */}
                                {selectedAnimeObj && (
                                    <div className="series-header-card series-header-hero individual-hero">
                                        {selectedAnimeObj.thumbnail && (
                                            <div
                                                className="series-header-backdrop"
                                                style={{ backgroundImage: `url("${selectedAnimeObj.thumbnail.replace(/#/g, '%23')}")` }}
                                                aria-hidden="true"
                                            />
                                        )}
                                        {selectedAnimeObj.thumbnail ? (
                                            <div className="series-header-poster-frame series-header-poster-frame-xl">
                                                <img
                                                    src={selectedAnimeObj.thumbnail.replace(/#/g, '%23')}
                                                    alt={selectedAnimeObj.name}
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                        ) : (
                                            <div className="series-header-poster series-header-poster-xl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', fontSize: '1.5rem' }}>🎬</div>
                                        )}

                                        <div className="series-header-info">
                                            {/* Titulek + badge + MAL odkaz (jako v detailu) */}
                                            <div className="series-header-title-row">
                                                <h2 className="series-header-title">{selectedAnimeObj.name}</h2>
                                                {/* Task 12: TYP+STATUS+MAL atomicky — lámou se jen jako celek */}
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
                                                    <span className={`type-badge ${(() => {
                                                        const t = (selectedAnimeObj.type || '').toLowerCase()
                                                        if (t.includes('movie')) return 'movie'
                                                        if (t.includes('ova')) return 'ova'
                                                        if (t.includes('ona')) return 'ona'
                                                        if (t.includes('special')) return 'special'
                                                        return 'tv'
                                                    })()}`} style={{ fontSize: '0.75rem' }}>
                                                        {selectedAnimeObj.type}
                                                    </span>
                                                    {selectedAnimeObj.status && (
                                                        <span className={`status-badge ${selectedAnimeObj.status.toLowerCase().replace('!', '')}`}>
                                                            {selectedAnimeObj.status}
                                                        </span>
                                                    )}
                                                    {selectedAnimeObj.mal_url && (
                                                        <a href={selectedAnimeObj.mal_url} target="_blank" rel="noopener noreferrer"
                                                            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            🔗 MAL
                                                        </a>
                                                    )}
                                                </span>
                                            </div>

                                            {/* FH kruh + meta grid v jednom řádku (jako v detailu) */}
                                            <div className="individual-hero-meta-row">
                                            {(() => {
                                                const fh = Number(selectedAnimeObj.rating)
                                                if (isNaN(fh) || fh <= 0) return null
                                                const rColor = ratingVar(fh)
                                                return (
                                                    <div className="series-header-fh" style={{ position: 'relative' }}>
                                                        <div className="series-fh-circle" style={{
                                                            borderColor: rColor,
                                                            background: `color-mix(in srgb, ${rColor} 12%, transparent)`
                                                        }}>
                                                            <span className="series-fh-value" style={{ color: rColor }}>
                                                                {fmtFH(fh)}
                                                            </span>
                                                            <span className="series-fh-outof">/10</span>
                                                        </div>
                                                        <RatingInfoButton
                                                            label="Co znamená finální hodnocení"
                                                            style={{ position: 'absolute', top: '-7px', right: '-16px' }}
                                                            onClick={() => setFhGuideOpen(true)}
                                                        />
                                                    </div>
                                                )
                                            })()}
                                            <div className="series-header-metagrid">
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">Studio</span>
                                                    <span className="series-meta-value">{selectedAnimeObj.studio || 'N/A'}</span>
                                                </div>
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">Epizody</span>
                                                    <span className="series-meta-value">{selectedAnimeObj.episodes || 'N/A'}</span>
                                                </div>
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">{selectedAnimeObj.type === 'Movie' ? 'Délka filmu' : 'Délka epizody'}</span>
                                                    <span className="series-meta-value">{selectedAnimeObj.episode_duration ? `${Math.round(selectedAnimeObj.episode_duration)} min` : 'N/A'}</span>
                                                </div>
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">Datum vydání</span>
                                                    <span className="series-meta-value">{selectedAnimeObj.release_date ? new Date(selectedAnimeObj.release_date).toLocaleDateString('cs-CZ') : 'N/A'}</span>
                                                </div>
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">Sledováno</span>
                                                    <span className="series-meta-value">
                                                        {(() => {
                                                            const start = selectedAnimeObj.start_date && !isNaN(new Date(selectedAnimeObj.start_date).getTime()) ? new Date(selectedAnimeObj.start_date).toLocaleDateString('cs-CZ') : '?'
                                                            const end = selectedAnimeObj.end_date && !isNaN(new Date(selectedAnimeObj.end_date).getTime()) ? new Date(selectedAnimeObj.end_date).toLocaleDateString('cs-CZ') : '?'
                                                            if (start === '?' && end === '?') return '?'
                                                            if (start === end || end === '?') return start
                                                            return `${start} – ${end}`
                                                        })()}
                                                    </span>
                                                </div>
                                                {selectedAnimeObj.rewatch_count > 0 && (
                                                    <div className="series-meta-item">
                                                        <span className="series-meta-label">Rewatch</span>
                                                        <span className="series-meta-value">{selectedAnimeObj.rewatch_count}×</span>
                                                    </div>
                                                )}
                                                <div className="series-meta-item">
                                                    <span className="series-meta-label">Dabing</span>
                                                    <span className="series-meta-value">{selectedAnimeObj.dub || 'N/A'}</span>
                                                </div>
                                                {selectedAnimeObj.series && (
                                                    <div className="series-meta-item">
                                                        <span className="series-meta-label">Série</span>
                                                        <span className="series-meta-value">{selectedAnimeObj.series}</span>
                                                    </div>
                                                )}
                                            </div>
                                            </div>

                                            {/* Žánry + Témata + AniList tagy (jako v detailu) */}
                                            <div className="individual-tags-box">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                    {selectedAnimeObj.genres && (
                                                        <>
                                                            <span className="series-meta-label" style={{ marginRight: '2px' }}>Žánry</span>
                                                            {selectedAnimeObj.genres.split(';').map((g, i) => (
                                                                <span key={`g-${i}`} className="series-genre-chip">{g.trim()}</span>
                                                            ))}
                                                        </>
                                                    )}
                                                    {selectedAnimeObj.themes && selectedAnimeObj.themes !== 'X' && (
                                                        <>
                                                            <span className="series-meta-label" style={{ marginLeft: '6px', marginRight: '2px' }}>Témata</span>
                                                            {selectedAnimeObj.themes.split(';').map((t, i) => (
                                                                <span key={`t-${i}`} className="series-genre-chip theme">{t.trim()}</span>
                                                            ))}
                                                        </>
                                                    )}
                                                </div>
                                                {selectedAnimeObj.tags && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                                                        <span className="series-meta-label" style={{ width: '100%' }}>AniList Tagy</span>
                                                        {selectedAnimeObj.tags.split(';').map((t, i) => {
                                                            const parts = t.split(':')
                                                            if (parts.length < 2) return null
                                                            const tagName = parts[0]
                                                            const rank = parseInt(parts[1]) || 0
                                                            const desc = parts[2] || ''
                                                            let bg = 'rgba(255, 255, 255, 0.05)', color = 'var(--text-secondary)', border = 'var(--border-color)'
                                                            if (rank >= 80) { bg = 'rgba(255, 215, 0, 0.15)'; color = '#ffd700'; border = 'rgba(255, 215, 0, 0.4)' }
                                                            else if (rank >= 60) { bg = 'rgba(0, 255, 255, 0.1)'; color = '#00ffff'; border = 'rgba(0, 255, 255, 0.3)' }
                                                            return (
                                                                <span key={`a-${i}`} title={desc} style={{
                                                                    padding: '1px 7px', borderRadius: '4px',
                                                                    fontSize: '0.68rem', fontWeight: rank >= 80 ? 'bold' : 'normal',
                                                                    cursor: desc ? 'help' : 'default',
                                                                    background: bg, color: color,
                                                                    border: `1px solid ${border}`
                                                                }}>
                                                                    {tagName} {rank}%
                                                                </span>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Recenze hned pod hlavičkou — jako v detailu anime */}
                                {selectedAnimeNote && (
                                    <div className="ratings-panel individual-review-card">
                                        <h3 className="ratings-panel-title" style={{ marginBottom: '10px' }}>📝 Recenze / Poznámky</h3>
                                        <p className="individual-review-text">
                                            {formatReview(selectedAnimeNote.replace(/_x000D_/g, ''), selectedAnimeTitle)}
                                        </p>
                                    </div>
                                )}

                                {/* Kategorie + pavoučí graf — stejná komponenta jako v detailu anime
                                    (hover popovery s postavami z MAL/AniList, přehrávání OP/ED/OST, "?") */}
                                <CategoryRatingsPanel
                                    categoryRatings={selectedAnimeCategories}
                                    categoryWeights={categoryWeights}
                                    avgRating={avgCategoryRating}
                                    animeName={selectedAnimeTitle}
                                    animeSeries={selectedAnimeObj?.series}
                                    malUrl={selectedAnimeObj?.mal_url}
                                    review={selectedAnimeNote}
                                    categoryReviews={categoryReviews}
                                    compactRadar
                                    malId={extractMalId(selectedAnimeObj?.mal_url)}
                                />

                                {/* Hodnocení epizod přes celou šířku — hlavička, legenda, AI poznámka
                                    a klikací body pro rozbor epizod, stejně jako v detailu anime */}
                                {episodeChartData && (
                                    <div className="ratings-panel episode-chart-panel">
                                        <div className="chart-header-flex" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                                                <h3 style={{ margin: 0 }}>
                                                    Hodnocení epizod
                                                    {avgEpisodeRating && (
                                                        <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                                            (Průměr: <span style={{ fontWeight: 'bold' }}>{avgEpisodeRating}</span>)
                                                        </span>
                                                    )}
                                                    <RatingInfoButton
                                                        label="Jak hodnotím epizody"
                                                        style={{ marginLeft: '10px' }}
                                                        onClick={() => setEpGuideOpen(true)}
                                                    />
                                                </h3>
                                                <div className="chart-legend-container">
                                                    {[
                                                        ['rgb(29, 161, 242)', 'Absolute Cinema'],
                                                        ['rgb(24, 106, 59)', 'Awesome'],
                                                        ['rgb(40, 180, 99)', 'Great'],
                                                        ['rgb(244, 208, 63)', 'Good'],
                                                        ['rgb(243, 156, 18)', 'Regular'],
                                                        ['rgb(99, 57, 116)', 'Bad'],
                                                    ].map(([col, lbl]) => (
                                                        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: col }}></span>
                                                            <span>{lbl}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            {selectedEpisodeReviews && (
                                                <p className="category-ratings-info-text" style={{ margin: '4px 0 0 0' }}>
                                                    Faktické rozbory epizod byly vygenerovány AI z webových zdrojů a mohou obsahovat chyby. Kliknutím na bod (tečku) konkrétní epizody v grafu zobrazíte její detailní rozbor.
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                            <Chart type="line" data={episodeChartData} options={episodeBarOptions} key={c.isLight ? 'ep-l' : 'ep-d'} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ============================================
                GLOBAL SECTIONS (ROW 2 & ROW 3) - SHOWN IN BOTH VIEWS (Varianta A)
                ============================================ */}
                    {viewMode !== 'split' && (
                        <Deferred>
                        <Fragment key={c.isLight ? 'light' : 'dark'}>
                            {/* ═══ SEKCE: Žebříčky (AVG + nestabilní EP) ═══ */}
                            <h2 className="ratings-section-heading">🏆 Žebříčky knihovny</h2>
                            <div className="ratings-row leaderboard-row fade-in">
                                <div className="ratings-panel leaderboard-panel">
                                    <h3 className="ratings-panel-title">Hodnocení Anime podle AVG (Top {lbCount})</h3>
                                    <div className="panel-controls-row">
                                        <select className="slicer-select" style={{ flex: 1 }} value={lbTyp} onChange={e => setLbTyp(e.target.value)}>
                                            <option value="Epizody">Epizody</option>
                                            <option value="Kategorie">Kategorie</option>
                                        </select>
                                        <select className="slicer-select" style={{ flex: 1 }} value={lbSort} onChange={e => setLbSort(e.target.value)}>
                                            <option value="Nejlepší">Nejlepší</option>
                                            <option value="Nejhorší">Nejhorší</option>
                                        </select>
                                        <select className="slicer-select" style={{ flex: 0.6 }} value={[10, 30, 50, 100].includes(lbCount) ? lbCount : 'custom'} onChange={e => { if (e.target.value !== 'custom') setLbCount(Number(e.target.value)) }}>
                                            <option value="10">10</option>
                                            <option value="30">30</option>
                                            <option value="50">50</option>
                                            <option value="100">100</option>
                                            <option value="custom" disabled>Vlastní…</option>
                                        </select>
                                        <input
                                            type="number"
                                            className="slicer-select"
                                            style={{ flex: 0.5, minWidth: 0 }}
                                            min={1}
                                            max={999}
                                            value={lbCount}
                                            title="Vlastní počet"
                                            onChange={e => { const v = Math.max(1, Math.min(999, Number(e.target.value) || 1)); setLbCount(v) }}
                                        />
                                    </div>
                                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                        <Bar data={leaderboardChartData} options={leaderboardOptions} />
                                    </div>
                                    <p className="panel-hint">Kliknutím na sloupec otevřeš detail anime.</p>
                                </div>

                                <div className="ratings-panel instability-panel">
                                    <h3 className="ratings-panel-title">Anime s nestabilním ohodnocením EP (Top {instabCount})</h3>
                                    <div className="panel-controls-row">
                                        <select className="slicer-select" style={{ flex: 0.5 }} value={instabCount} onChange={e => setInstabCount(Number(e.target.value))}>
                                            <option value="10">Top 10</option>
                                            <option value="30">Top 30</option>
                                            <option value="50">Top 50</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                        <Bar data={unstableChartData} options={unstableOptions} />
                                    </div>
                                    <p className="panel-hint">Průměrná odchylka hodnocení epizod od průměru anime.</p>
                                </div>
                            </div>

                            {/* ═══ SEKCE: Průzkum kategorie (filtry + rozložení + korelace) ═══ */}
                            <h2 className="ratings-section-heading">🔍 Průzkum hodnocení: {slicerPolozka}</h2>

                            {/* R² přehled — jak silně každá kategorie souvisí s finálním hodnocením */}
                            <div className="r2-overview fade-in">
                                <div className="r2-overview-head">
                                    <div className="r2-overview-titles">
                                        <span className="r2-overview-title">Vliv kategorií na finální hodnocení</span>
                                        <span className="r2-overview-sub">
                                            R<sup>2</sup> = jak dobře daná kategorie předpovídá finální hodnocení (0 = žádný vztah, 1 = dokonalý).
                                            Vyšší hodnota → kategorie víc „táhne" celkové hodnocení. Klikni pro detail v grafech níže.
                                        </span>
                                    </div>
                                    <div className="r2-legend">
                                        {[['silná', 'rgb(52, 211, 153)'], ['střední', 'rgb(40, 180, 99)'], ['slabší', 'rgb(244, 208, 63)'], ['slabá', 'rgb(243, 156, 18)']].map(([lbl, col]) => (
                                            <span key={lbl} className="r2-legend-item"><span className="r2-legend-dot" style={{ background: col }} />{lbl}</span>
                                        ))}
                                    </div>
                                </div>
                                {/* Task 1: kategorie seskupené podle příslušnosti (viditelné nadpisy
                                    + barevné ohraničení skupin), kanonické pořadí Animace → OST */}
                                <div className="r2-groups">
                                    {R2_GROUPS.map(group => (
                                        <div
                                            key={group.name}
                                            className="r2-group"
                                            style={{
                                                borderColor: `rgba(${group.color}, 0.35)`,
                                                background: `linear-gradient(180deg, rgba(${group.color}, 0.06), transparent 60%)`
                                            }}
                                        >
                                            <span className="r2-group-title" style={{ color: `rgb(${group.color})` }}>
                                                <span aria-hidden="true">{group.icon}</span> {group.name}
                                            </span>
                                            <div className="r2-group-chips">
                                                {group.cats.map(cat => {
                                                    const item = categoryR2List.find(x => x.cat === cat)
                                                    const r2 = item ? item.r2 : null
                                                    const s = r2Style(r2)
                                                    const isActive = slicerPolozka === cat
                                                    const pct = r2 !== null ? Math.round(r2 * 100) : 0
                                                    return (
                                                        <button
                                                            key={cat}
                                                            type="button"
                                                            className={`r2-chip${isActive ? ' active' : ''}`}
                                                            style={{ borderColor: s.border, background: s.bg }}
                                                            title={r2 !== null ? `R² = ${r2.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${s.label} korelace)` : 'Málo dat'}
                                                            onClick={() => { setSlicerTyp('Kategorie'); setSlicerPolozka(cat) }}
                                                        >
                                                            <span className="r2-chip-cat">
                                                                {categoryColumnAbbreviations[cat] || cat}
                                                                {/* Task 2: malé tlačítko → detail mého pojetí kategorie */}
                                                                <span
                                                                    className="r2-chip-info"
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    title={`Jak vidím kategorii ${cat}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        episodeModalRef.current?.open({
                                                                            title: `Moje pojetí: ${cat}`,
                                                                            text: philosophyTextFor(cat),
                                                                            rating: null
                                                                        })
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault()
                                                                            e.stopPropagation()
                                                                            episodeModalRef.current?.open({
                                                                                title: `Moje pojetí: ${cat}`,
                                                                                text: philosophyTextFor(cat),
                                                                                rating: null
                                                                            })
                                                                        }
                                                                    }}
                                                                ><InfoIcon /></span>
                                                            </span>
                                                            <span className="r2-chip-val" style={{ color: s.color }}>
                                                                {r2 !== null ? r2.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                            </span>
                                                            <span className="r2-chip-bar"><span className="r2-chip-bar-fill" style={{ width: `${pct}%`, background: s.color }} /></span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="ratings-row explore-row fade-in">
                                <div className="ratings-panel filter-panel">
                                    <h3 className="ratings-panel-title">Filtry a seznam</h3>
                                    <div className="slicer-group">
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Typ</label>
                                        <select className="slicer-select" value={slicerTyp} onChange={e => setSlicerTyp(e.target.value)}>
                                            <option value="Kategorie">Kategorie</option>
                                            <option value="Epizoda">Epizoda</option>
                                        </select>
                                    </div>
                                    <div className="slicer-row">
                                        <div className="slicer-group">
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Položka</label>
                                            <select className="slicer-select" value={slicerPolozka} onChange={e => setSlicerPolozka(e.target.value)}>
                                                {polozkyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                        <div className="slicer-group">
                                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hodnocení</label>
                                            <select className="slicer-select" value={slicerHodnoceni} onChange={e => setSlicerHodnoceni(e.target.value)}>
                                                {hodnoceniOptions.map(h => <option key={h} value={h}>{h === 'Všechna' ? h : Number(h).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <DebouncedSearchInput
                                        placeholder="Hledat v seznamu..."
                                        onSearch={setDashListQuery}
                                        initialValue={dashListQuery}
                                    />
                                    <div className="anime-selector-list">
                                        {(() => {
                                            const visible = dashListQuery
                                                ? row2FilteredAnime.filter(a => a.name.toLowerCase().includes(dashListQuery.toLowerCase()))
                                                : row2FilteredAnime
                                            return (
                                                <>
                                                    {visible.map(a => (
                                                        <div key={a.name} className="anime-selector-item" onClick={() => openAnimeFromChart(a.name)}>
                                                            <span className="selector-item-name">{a.name}</span>
                                                            <span className="selector-item-rating">{Number(a.hodnoceni).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    ))}
                                                    {visible.length === 0 && <div style={{ color: 'var(--text-muted)', padding: '8px' }}>Žádná data</div>}
                                                </>
                                            )
                                        })()}
                                    </div>
                                </div>

                                <div className="ratings-panel distribution-panel">
                                    <h3 className="ratings-panel-title">Rozložení hodnocení: {slicerPolozka}</h3>
                                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                        {histogramData ? <Bar data={histogramData} options={histogramOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Žádná data</div>}
                                    </div>
                                </div>

                                <div className="ratings-panel correlation-panel">
                                    <h3 className="ratings-panel-title">Korelace: {slicerPolozka} vs FH {correlationChartData?.r2 ? `(R² = ${correlationChartData.r2.toLocaleString('cs-CZ')})` : ''}</h3>
                                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                        {correlationChartData ? <Chart type='scatter' data={correlationChartData.data} options={correlationChartOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Málo dat pro korelaci</div>}
                                    </div>
                                </div>
                            </div>

                            {/* ═══ SEKCE: Kvalita vs. Hloubka (celá šířka) ═══ */}
                            <h2 className="ratings-section-heading">🧭 Kvalita (technika) vs. Hloubka (narativ)</h2>
                            <div className="ratings-row quality-row fade-in">
                                <div className="ratings-panel quality-depth-panel">
                                    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                                        <Chart type='bubble' data={hypeChartData} options={hypeChartOptions} />
                                    </div>
                                    <p className="panel-hint">Velikost bubliny = Enjoyment · barva = FH.</p>
                                </div>
                            </div>

                            {/* ROW 4: Kompletní tabulka kategorií */}
                            <h2 className="ratings-section-heading">📊 Kompletní tabulka hodnocení</h2>
                            <div className="ratings-row row-4 fade-in" style={{ marginBottom: 'var(--spacing-xl)' }}>
                                <div className="ratings-panel" style={{ flex: 1 }}>
                                    <h3 className="ratings-panel-title">
                                        <span>
                                            Heatmapa kategorií — kliknutím na řádek otevřeš detail
                                            <RatingInfoButton
                                                label="Jak hodnotím kategorie"
                                                style={{ marginLeft: '8px' }}
                                                onClick={() => setCatGuideOpen(true)}
                                            />
                                        </span>
                                        <input
                                            type="text"
                                            className="table-search-input"
                                            placeholder="Hledat anime..."
                                            value={tableSearchQuery}
                                            onChange={(e) => setTableSearchQuery(e.target.value)}
                                        />
                                    </h3>
                                    <div className="ratings-category-table-wrapper">
                                        <table className="ratings-category-table">
                                            <thead>
                                                <tr>
                                                    <th
                                                        className={`th-sortable th-anime ${tableSortColumn === 'Anime' ? 'th-active' : ''}`}
                                                        onClick={() => handleTableSort('Anime')}
                                                    >
                                                        Anime {tableSortColumn === 'Anime' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                                                    </th>
                                                    <th
                                                        className={`th-sortable th-numeric ${tableSortColumn === 'FH' ? 'th-active' : ''}`}
                                                        onClick={() => handleTableSort('FH')}
                                                        title="Finální hodnocení (v. = kliknutí na ? vysvětlí škálu)"
                                                    >
                                                        FH {tableSortColumn === 'FH' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                                                        <RatingInfoButton
                                                            label="Co znamená finální hodnocení"
                                                            style={{ marginLeft: '4px', verticalAlign: 'middle' }}
                                                            onClick={(e) => { e.stopPropagation(); setFhGuideOpen(true) }}
                                                        />
                                                    </th>
                                                    <th
                                                        className={`th-sortable th-numeric ${tableSortColumn === 'WA' ? 'th-active' : ''}`}
                                                        onClick={() => handleTableSort('WA')}
                                                        title="Weighted Average (vážený průměr kategorií)"
                                                    >
                                                        WA {tableSortColumn === 'WA' ? (tableSortDirection === 'asc' ? '▲' : '▼') : ''}
                                                    </th>
                                                    {allCategoryColumns.map(cat => (
                                                        <th
                                                            key={cat}
                                                            className={`th-sortable th-numeric ${tableSortColumn === cat ? 'th-active' : ''}`}
                                                            onClick={() => handleTableSort(cat)}
                                                            title={`${cat} (v. ${categoryWeights[cat] || 1})`}
                                                        >
                                                            {categoryColumnAbbreviations[cat] || cat}
                                                            {tableSortColumn === cat ? (tableSortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tableData.items.map((item, idx) => (
                                                    <tr
                                                        key={item.name}
                                                        className="table-row-hover"
                                                        onClick={() => {
                                                            setViewMode('individual')
                                                            setSelectedAnimeTitle(item.name)
                                                        }}
                                                    >
                                                        <td className="td-anime">
                                                            <span className="td-rank">{idx + 1}.</span>
                                                            <span
                                                                className="td-name td-name-link"
                                                                role="link"
                                                                tabIndex={0}
                                                                title={`Načíst anime výše: ${item.name}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    openAnimeFromChart(item.name)
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.stopPropagation()
                                                                        openAnimeFromChart(item.name)
                                                                    }
                                                                }}
                                                            >
                                                                {item.name}
                                                            </span>
                                                        </td>
                                                        <td className="td-numeric td-fh" style={getHeatmapStyle(item.fh)}>
                                                            {item.fh !== null ? item.fh.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—'}
                                                        </td>
                                                        <td className="td-numeric td-wa" style={getHeatmapStyle(item.wa)}>
                                                            {item.wa !== null ? item.wa.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                        </td>
                                                        {allCategoryColumns.map(cat => {
                                                            const val = item.categories[cat]
                                                            const hasReview = !!categoryReviews?.[item.name]?.[cat]
                                                            return (
                                                                <td
                                                                    key={cat}
                                                                    className={`td-numeric heatmap-cell${hasReview ? ' heatmap-cell-review' : ''}`}
                                                                    style={getHeatmapStyle(val)}
                                                                    title={hasReview ? `Zobrazit rozbor: ${cat}` : undefined}
                                                                    onClick={hasReview ? (e) => {
                                                                        e.stopPropagation()
                                                                        openTableCategoryReview(item.name, cat, (val === undefined) ? null : val)
                                                                    } : undefined}
                                                                >
                                                                    {val !== undefined && val !== null
                                                                        ? val.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                                                                        : '—'}
                                                                </td>
                                                            )
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="table-footer-row">
                                                    {/* Bez .td-anime — jeho display:flex rozbíjí position:sticky na table-cell */}
                                                    <td className="td-footer-label">Průměr ({tableData.total} anime)</td>
                                                    <td className="td-numeric td-fh" style={getFooterHeatmapStyle(tableData.avgFh)}>
                                                        {tableData.avgFh.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="td-numeric td-wa">
                                                        —
                                                    </td>
                                                    {allCategoryColumns.map(cat => {
                                                        const avg = tableData.catAverages[cat]
                                                        return (
                                                            <td key={cat} className="td-numeric heatmap-cell" style={getFooterHeatmapStyle(avg)}>
                                                                {avg !== null ? avg.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <div className="table-footer-stats">
                                        <span>Zobrazeno: <strong>{tableData.total}</strong> anime</span>
                                        <span>Průměr FH: <strong>{tableData.avgFh.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                                        {tableData.bestCat && <span>Nejvyšší kat.: <strong>{tableData.bestCat}</strong> ({tableData.bestVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>}
                                        {tableData.worstCat && <span>Nejnižší kat.: <strong>{tableData.worstCat}</strong> ({tableData.worstVal.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>}
                                    </div>
                                </div>
                            </div>
                        </Fragment>
                        </Deferred>
                    )}
                </>
            )}

            {/* Průvodce hodnocením — stejné modály jako v detailu anime */}
            <CategoryGuideModal open={catGuideOpen} onClose={() => setCatGuideOpen(false)} weights={categoryWeights} />
            <EpisodeGuideModal open={epGuideOpen} onClose={() => setEpGuideOpen(false)} />
            <FinalGuideModal open={fhGuideOpen} onClose={() => setFhGuideOpen(false)} />

            {/* AI rozbor epizody (klik na bod grafu Hodnocení epizod) — imperativní host */}
            <EpisodeModalHost ref={episodeModalRef} />

            {/* Task 8b: výběr dílu pro rozbor kategorie (radar série, Ø průměr) */}
            {radarPartChooser && createPortal(
                <div
                    className="category-detail-modal-overlay"
                    onClick={(e) => { if (e.target === e.currentTarget) setRadarPartChooser(null) }}
                >
                    <div className="category-detail-modal radar-part-chooser">
                        <div className="category-detail-modal-header">
                            <div className="category-detail-modal-title">
                                <span className="category-card-icon">📝</span>
                                <span>{radarPartChooser.cat} — vyber díl</span>
                            </div>
                            <button type="button" className="category-detail-modal-close" onClick={() => setRadarPartChooser(null)} aria-label="Zavřít">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="category-detail-modal-body">
                            <p className="series-radar-explain" style={{ margin: 0 }}>
                                Je zobrazen Ø průměr série — z jakého dílu chceš rozbor kategorie
                                „{radarPartChooser.cat}“?
                            </p>
                            <div className="radar-part-chooser-list">
                                {radarPartChooser.parts.map(name => (
                                    <button
                                        key={name}
                                        type="button"
                                        className="series-radar-chip compare"
                                        title={name}
                                        onClick={() => {
                                            setRadarPartChooser(null)
                                            openRadarCategoryReview(name, radarPartChooser.cat)
                                        }}
                                    >
                                        {cleanSeasonLabel(name, selectedSeries)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}

export default AnimeRatings
