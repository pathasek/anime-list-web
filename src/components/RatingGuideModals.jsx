import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { iconFor } from './categoryIcons'

// ---- Animační hook: plynulý morphing mezi "pózami" hodnot ------------------
// Drží holdMs, pak morphMs plynule interpoluje na další pózu (ease-in-out).
// Stav žije uvnitř malých SVG komponent, takže se nepřekresluje celý modal.
function useMorphingValues(poses, holdMs = 1800, morphMs = 1000) {
    const [values, setValues] = useState(poses[0])
    useEffect(() => {
        let raf = 0
        let timer = 0
        let from = poses[0]
        let toIdx = 1 % poses.length
        let start = null
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
        const step = (ts) => {
            if (start === null) start = ts
            const t = Math.min(1, (ts - start) / morphMs)
            const e = ease(t)
            const to = poses[toIdx]
            setValues(from.map((v, i) => v + (to[i] - v) * e))
            if (t < 1) {
                raf = requestAnimationFrame(step)
            } else {
                from = to
                toIdx = (toIdx + 1) % poses.length
                start = null
                timer = setTimeout(() => { raf = requestAnimationFrame(step) }, holdMs)
            }
        }
        timer = setTimeout(() => { raf = requestAnimationFrame(step) }, holdMs)
        return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
    }, [poses, holdMs, morphMs])
    return values
}

// ============================================================
// Průvodce hodnocením — malá "?" tlačítka + modální okna
// popisující práh a styl hodnocení (kategorie / epizody / FH).
// Texty jsou zatím mock — snadno se přepíšou v konstantách níže.
// ============================================================

// ---- Malé kulaté "?" tlačítko --------------------------------------------
export function RatingInfoButton({ onClick, label, className = '', style }) {
    return (
        <button
            type="button"
            className={`rating-info-btn ${className}`}
            style={style}
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
        </button>
    )
}

// ---- Společná SVG škála 5–10 ----------------------------------------------
const SCALE_STEPS = [
    { v: 5, label: 'Meh' },
    { v: 6, label: 'Decent' },
    { v: 7, label: 'Good' },
    { v: 8, label: 'Great' },
    { v: 9, label: 'Amazing' },
    { v: 10, label: 'Masterpiece' }
]

function ScaleBarSVG() {
    const W = 660, H = 84, pad = 10
    const segW = (W - pad * 2) / SCALE_STEPS.length
    return (
        <svg className="guide-scale-svg" viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label="Škála hodnocení od 5 do 10">
            {SCALE_STEPS.map((s, i) => {
                const x = pad + i * segW
                const cx = x + segW / 2
                return (
                    <g key={s.v}>
                        <text x={cx} y={16} textAnchor="middle" className="guide-scale-num"
                            fill={`var(--rating-${s.v})`}>{s.v}</text>
                        <rect x={x + 3} y={24} width={segW - 6} height={13} rx={6.5}
                            fill={`var(--rating-${s.v})`} opacity="0.9" />
                        <rect x={x + 3} y={24} width={segW - 6} height={13} rx={6.5}
                            fill="none" stroke="rgba(255,255,255,0.15)" />
                        <text x={cx} y={56} textAnchor="middle" className="guide-scale-label">{s.label}</text>
                    </g>
                )
            })}
            <text x={pad} y={76} className="guide-scale-edge">← slabší</text>
            <text x={W - pad} y={76} textAnchor="end" className="guide-scale-edge">silnější →</text>
        </svg>
    )
}

// ---- Animovaná sparkline pro epizody ---------------------------------------
// 5 "příběhů" sezóny (známky 5–10, barva bodu = tier):
//  1. solidní řada — normální dobré anime
//  2. slabé anime s jednou výjimečnou epizodou (ten jeden skvost)
//  3. krásná gradace až k 10... a závěr totálně selže
//  4. katastrofální start → redemption arc až k masterpiece finále
//  5. silné anime, kterému uprostřed spadne jeden propadák (filler)
const SPARK_POSES = [
    [7, 7.25, 7.5, 7.25, 7.75, 7.5, 8, 8.25],
    [5.5, 5.75, 5.5, 6, 9.75, 5.75, 5.5, 6],
    [6.5, 7, 7.5, 8.25, 8.75, 9.5, 10, 5.5],
    [5.5, 5.75, 6.25, 7, 8, 8.75, 9.5, 10],
    [8.75, 9, 8.75, 9.25, 5.5, 9, 9.5, 10]
]

const EPS = 0.005 // tolerance, ať barva přeskočí přesně na hranici tieru
const tierColor = (r) =>
    r >= 10 - EPS ? 'rgb(29, 161, 242)'
        : r >= 9 - EPS ? 'rgb(24, 106, 59)'
            : r >= 8 - EPS ? 'rgb(40, 180, 99)'
                : r >= 7 - EPS ? 'rgb(244, 208, 63)'
                    : r >= 6 - EPS ? 'rgb(243, 156, 18)'
                        : 'rgb(99, 57, 116)'

function EpisodeSparkSVG() {
    const vals = useMorphingValues(SPARK_POSES, 1700, 1000)
    // známka 5–10 → y souřadnice (10 nahoře, 5 dole)
    const pts = vals.map((r, i) => [10 + i * 42, 6 + ((10 - r) / 5) * 32, tierColor(r)])
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    return (
        <svg className="guide-spark-svg" viewBox="0 0 314 44" aria-hidden="true">
            <path d={path} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.6" />
            {pts.map((p, i) => (
                <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r="4"
                    fill={p[2]} stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
            ))}
        </svg>
    )
}

// ---- Animovaný mini pavoukový graf pro kategorie ----------------------------
const RADAR_POSES = [
    [0.85, 0.6, 0.75, 0.5, 0.9, 0.7],
    [0.55, 0.95, 0.5, 0.85, 0.6, 0.9],
    [0.95, 0.9, 0.85, 0.9, 0.95, 0.85],
    [0.5, 0.45, 0.7, 0.4, 0.55, 0.6],
    [0.7, 0.8, 0.45, 0.95, 0.75, 0.5]
]

function RadarMiniSVG() {
    const vals = useMorphingValues(RADAR_POSES, 1600, 1100)
    const C = 55, R = 44, n = vals.length
    const pt = (v, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
        return [(C + Math.cos(a) * R * v).toFixed(1), (C + Math.sin(a) * R * v).toFixed(1)]
    }
    const poly = vals.map((v, i) => pt(v, i).join(',')).join(' ')
    return (
        <svg className="guide-radar-svg" viewBox="0 0 110 110" aria-hidden="true">
            {[1 / 3, 2 / 3, 1].map(f => (
                <polygon key={f}
                    points={Array.from({ length: n }, (_, i) => pt(f, i).join(',')).join(' ')}
                    fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            ))}
            {Array.from({ length: n }, (_, i) => {
                const [x, y] = pt(1, i)
                return <line key={i} x1={C} y1={C} x2={x} y2={y}
                    stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />
            })}
            <polygon points={poly} fill="var(--accent-primary)" fillOpacity="0.3"
                stroke="var(--accent-primary)" strokeWidth="1.6" strokeLinejoin="round" />
            {vals.map((v, i) => {
                const [x, y] = pt(v, i)
                return <circle key={i} cx={x} cy={y} r="2.4" fill="#fff"
                    stroke="var(--accent-primary)" strokeWidth="1.4" />
            })}
        </svg>
    )
}

// ---- Společná schránka modálu ----------------------------------------------
function GuideShell({ open, onClose, icon, title, subtitle, children, wide = false }) {
    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        // Stránku scrolluje <html> (má overflow-x: hidden, takže overflow na
        // <body> se nepropaguje na viewport) — zamknout musíme oba elementy.
        const prevBodyOverflow = document.body.style.overflow
        const prevHtmlOverflow = document.documentElement.style.overflow
        const prevHtmlPaddingRight = document.documentElement.style.paddingRight
        // Zmizení scrollbaru by rozšířilo obsah a po zavření zase smrsklo —
        // kompenzujeme jeho šířku paddingem, ať se layout ani nehne.
        const scrollbarW = window.innerWidth - document.documentElement.clientWidth
        document.body.style.overflow = 'hidden'
        document.documentElement.style.overflow = 'hidden'
        if (scrollbarW > 0) {
            document.documentElement.style.paddingRight = `${scrollbarW}px`
        }
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevBodyOverflow
            document.documentElement.style.overflow = prevHtmlOverflow
            document.documentElement.style.paddingRight = prevHtmlPaddingRight
        }
    }, [open, onClose])

    if (!open) return null

    return createPortal(
        <div className="guide-backdrop" onClick={onClose}>
            <div
                className={`guide-modal${wide ? ' guide-modal-wide' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <button type="button" className="guide-close" onClick={onClose} aria-label="Zavřít">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                        strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
                <div className="guide-header">
                    <span className="guide-header-icon">{icon}</span>
                    <div className="guide-header-titles">
                        <h3>{title}</h3>
                        <p>{subtitle}</p>
                    </div>
                </div>
                <div className="guide-body">{children}</div>
            </div>
        </div>,
        document.body
    )
}

// ============================================================
// 1) PRŮVODCE KATEGORIEMI  (mock texty)
// ============================================================
// th = mock prahy [≤ 6, 7–8, 9–10]
const CATEGORY_GUIDE = [
    { cat: 'Animace', text: 'Plynulost pohybu, sakuga momenty a konzistence kreseb napříč epizodami. Statické záběry snesu, pokud kompenzují atmosférou.', tags: ['plynulost', 'sakuga', 'konzistence'], th: ['kostrbatá', 'čistá práce', 'sakuga svátek'] },
    { cat: 'CGI', text: 'Jak dobře 3D prvky zapadají do 2D scén — stínování, framerate a jestli CGI neruší imerzi. Dobré CGI si člověk skoro nevšimne.', tags: ['integrace', 'stínování'], th: ['ruší imerzi', 'splývá s 2D', 'k nerozeznání'] },
    { cat: 'MC', text: 'Motivace, vývoj a charisma hlavní postavy. Chci hrdinovi fandit, chápat jeho rozhodnutí a vidět, jak ho příběh mění.', tags: ['vývoj', 'motivace', 'charisma'], th: ['nevýrazný', 'fandím mu', 'nezapomenutelný'] },
    { cat: 'Vedlejší postavy', text: 'Hloubka vedlejšího obsazení — vlastní motivace, chemie s MC a jestli si zaslouží čas na obrazovce, který dostávají.', tags: ['hloubka', 'chemie'], th: ['jen kulisy', 'žijí si svým', 'kradou scény'] },
    { cat: 'Waifu', text: 'Výrazné ženské postavy: design, osobnost a zapamatovatelnost. Postava, na kterou si vzpomenu i měsíce po dokoukání.', tags: ['design', 'osobnost'], th: ['zapomenutelná', 'výrazná', 'ikonická'] },
    { cat: 'Plot', text: 'Logika světa, konzistence pravidel a síla zápletky. Trestám díry v příběhu a laciné deus ex machina zvraty.', tags: ['konzistence', 'zvraty'], th: ['děravý', 'drží pohromadě', 'promyšlený'] },
    { cat: 'Pacing', text: 'Tempo vyprávění — rozložení vrcholů, hluchá místa a jestli mě anime nutí pustit další díl. Filler stahuje dolů.', tags: ['tempo', 'gradace'], th: ['vleče se', 'plyne', 'nepustí mě'] },
    { cat: 'Story Conclusion', text: 'Uzavření dějových linek a síla závěru. Dobrý konec dokáže zvednout celé anime, useknutý „read the manga“ ho potopí.', tags: ['závěr', 'uzavření linek'], th: ['useknutý', 'důstojný', 'perfektní tečka'] },
    { cat: 'Originalita', text: 'Nové nápady, tvůrčí odvaha a práce s klišé. Ocením i chytré přetočení známých tropů, ne jen absolutní novinky.', tags: ['nápady', 'odvaha'], th: ['klišé', 'svěží prvky', 'unikát'] },
    { cat: 'Emoce', text: 'Kolik ve mně anime skutečně vyvolalo — gradace, katarze, husí kůže. Hodnotím upřímnost emocí, ne lacinou manipulaci.', tags: ['katarze', 'gradace'], th: ['chladné', 'zasáhnou', 'husí kůže'] },
    { cat: 'Enjoyment', text: 'Čistá zábava bez filtru: jak moc jsem se těšil na další epizodu a jak často jsem u toho zapomínal na čas.', tags: ['zábava', 'binge faktor'], th: ['přemáhám se', 'baví mě', 'binge'] },
    { cat: 'OP', text: 'Openingová znělka — song, vizuál a jak dobře naladí na epizodu. Bonus, když se OP vyvíjí s příběhem.', tags: ['song', 'vizuál'], th: ['přeskakuji', 'nechám hrát', 'na repeat'] },
    { cat: 'ED', text: 'Ending — nálada po epizodě a jestli funguje jako tečka. Skvělý ED po těžké epizodě umí zvednout celý dojem.', tags: ['nálada', 'tečka'], th: ['přeskakuji', 'nechám dohrát', 'na repeat'] },
    { cat: 'OST', text: 'Soundtrack ve scénách: zapamatovatelné motivy, načasování a jestli hudba nese emoce klíčových momentů.', tags: ['motivy', 'načasování'], th: ['neslyším ji', 'podpírá scény', 'poslouchám i mimo'] }
]

const CAT_TH_ZONES = [
    { range: '≤ 6', color: 'var(--rating-5)' },
    { range: '7–8', color: 'var(--rating-7)' },
    { range: '9–10', color: 'var(--rating-9)' }
]

export function CategoryGuideModal({ open, onClose, weights }) {
    return (
        <GuideShell
            open={open}
            onClose={onClose}
            wide
            icon={iconFor('Enjoyment')}
            title="Jak hodnotím kategorie"
            subtitle="Můj práh a styl hodnocení pro každou kategorii. Váhy se liší podle anime — vyšší váha znamená větší vliv na výsledné WA."
        >
            <div className="guide-cat-hero">
                <div className="guide-cat-hero-scale">
                    <ScaleBarSVG />
                    <p className="guide-intro">
                        Každou kategorii hodnotím na škále 1–10 s krokem 0,5. Vážený průměr (WA) pak
                        kombinuje všechny kategorie podle vah — kategorie, na kterých mi u daného anime
                        záleží víc, mají větší slovo. {/* mock text */}
                    </p>
                </div>
                <RadarMiniSVG />
            </div>
            <div className="guide-cat-grid">
                {CATEGORY_GUIDE.map(({ cat, text, tags, th }) => (
                    <div key={cat} className="guide-cat-card">
                        <div className="guide-cat-head">
                            <span className="guide-cat-icon">{iconFor(cat)}</span>
                            <span className="guide-cat-name">{cat}</span>
                            {weights && weights[cat] != null && (
                                <span className="guide-cat-weight">
                                    váha: {Number(weights[cat]).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}
                                </span>
                            )}
                        </div>
                        <p className="guide-cat-text">{text}</p>
                        <div className="guide-cat-thresholds">
                            {CAT_TH_ZONES.map((z, i) => (
                                <span key={z.range} className="guide-cat-th" style={{ '--th-color': z.color }}>
                                    <b>{z.range}</b> {th[i]}
                                </span>
                            ))}
                        </div>
                        <div className="guide-cat-tags">
                            {tags.map(t => <span key={t} className="guide-cat-tag">{t}</span>)}
                        </div>
                    </div>
                ))}
            </div>
        </GuideShell>
    )
}

// ============================================================
// 2) PRŮVODCE HODNOCENÍM EPIZOD  (mock texty)
// ============================================================
const EPISODE_TIERS = [
    { name: 'Absolute Cinema', range: '10', color: 'rgb(29, 161, 242)', text: 'Epizoda, u které jsem zapomněl dýchat. Perfektní režie, animace i emoce — moment, kvůli kterému se anime sleduje.' },
    { name: 'Awesome', range: '9 – 9,75', color: 'rgb(24, 106, 59)', text: 'Výjimečná epizoda s vrcholem, zvratem nebo payoff momentem, který dlouho rezonuje. Jen kousek od dokonalosti.' },
    { name: 'Great', range: '8 – 8,75', color: 'rgb(40, 180, 99)', text: 'Silná epizoda, která výrazně posouvá příběh nebo postavy. Žádná hluchá pasáž, chci hned pustit další díl.' },
    { name: 'Good', range: '7 – 7,75', color: 'rgb(244, 208, 63)', text: 'Solidní standard dobrého anime. Funguje, baví, ale nemá moment, který by přesáhl rámec epizody.' },
    { name: 'Regular', range: '6 – 6,75', color: 'rgb(243, 156, 18)', text: 'Průměrná, spíš přechodová epizoda — setup, oddech nebo pomalejší tempo. Nezklame, ale ani nenadchne.' },
    { name: 'Bad', range: '< 6', color: 'rgb(99, 57, 116)', text: 'Epizoda, která mě vyloženě nebavila — filler, nelogičnosti nebo rozbité tempo. Naštěstí vzácnost.' }
]

export function EpisodeGuideModal({ open, onClose }) {
    return (
        <GuideShell
            open={open}
            onClose={onClose}
            icon={(
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 17 9 11 13 15 21 7" />
                    <polyline points="15 7 21 7 21 13" />
                </svg>
            )}
            title="Jak hodnotím epizody"
            subtitle="Každá epizoda dostává známku s krokem 0,25 hned po zhlédnutí — barva bodu v grafu odpovídá tieru."
        >
            <EpisodeSparkSVG />
            <p className="guide-intro">
                Hodnotím čerstvý dojem: co epizoda udělala s příběhem, postavami a se mnou.
                Krok 0,25 mi dovoluje jemně odlišit epizody uvnitř stejného tieru. {/* mock text */}
            </p>
            <div className="guide-tier-list">
                {EPISODE_TIERS.map(t => (
                    <div key={t.name} className="guide-tier-row" style={{ '--tier-color': t.color }}>
                        <span className="guide-tier-dot" />
                        <div className="guide-tier-meta">
                            <div className="guide-tier-top">
                                <span className="guide-tier-name">{t.name}</span>
                                <span className="guide-tier-range">{t.range}</span>
                            </div>
                            <p className="guide-tier-text">{t.text}</p>
                        </div>
                    </div>
                ))}
            </div>
        </GuideShell>
    )
}

// ============================================================
// 3) PRŮVODCE FINÁLNÍM HODNOCENÍM (FH 5–10)  (mock texty)
// ============================================================
const FINAL_LEVELS = [
    { v: 10, name: 'Masterpiece', text: 'Absolutní špička a osobní top. Anime, které mě zasáhlo ve všech kategoriích a přemýšlím o něm ještě dlouho po dokoukání.' },
    { v: 9, name: 'Amazing', text: 'Výjimečný zážitek s drobnými kazy. Doporučuji každému bez váhání a vracím se k němu ve vzpomínkách.' },
    { v: 8, name: 'Great', text: 'Skvělé anime, které výrazně převyšuje průměr. Pár slabších míst, ale celek si pamatuji a rád doporučím.' },
    { v: 7, name: 'Good', text: 'Dobré anime, u kterého jsem se bavil, ale k příběhu jsem úplně nepřilnul. Solidní volba, ne srdcovka.' },
    { v: 6, name: 'Decent', text: 'Slušný průměr — něco funguje, něco skřípe. Dokoukal jsem bez lítosti, ale podruhé už se vracet nebudu.' },
    { v: 5, name: 'Meh', text: 'Podprůměr. Anime s promarněným potenciálem nebo problémy, které převážily světlé momenty. Dokoukáno spíš ze setrvačnosti.' }
]

// Živá ukázka: 9 scénářů, jak vzniká FH — všechny vycházejí z reálných dat
// z mého seznamu, jen bez konkrétních názvů. Průměr (bar) a FH (kruh) jsou
// schválně oddělené věci: krok { fh: N } překlopí FH silou klíčových
// kategorií, i když se průměr nehne.
const FH_SCENARIOS = [
    // 1. Z dat: anime s WA 8,9 — MC, Emoce, Enjoyment i Story Conclusion
    //    10/10 přebijí průměr a FH skočí na 10, bar se ani nehne
    { from: 7.4, label: 'klíčové kategorie zvednou FH až na 10', steps: [
        { to: 8.9, ms: 3000 },
        { event: { cat: 'Emoce', score: 10, weight: 3.5, dir: 'up' }, hold: 1100 },
        { event: { cat: 'Enjoyment', score: 10, weight: 4, dir: 'up' }, hold: 1100 },
        { fh: 10, hold: 2300 }
    ] },
    // 2. Enjoyment carry — zábava s nejvyšší váhou vytáhne průměr přes hranici
    { from: 6.4, label: 'carry jedné kategorie', steps: [
        { to: 7.35, ms: 2700 },
        { event: { cat: 'Enjoyment', score: 10, weight: 4, dir: 'up' }, hold: 1100 },
        { to: 8.2, ms: 1200 },
        { hold: 1700 }
    ] },
    // 3. Zrada v závěru — Story Conclusion potopí jinak skvělé anime
    { from: 7.0, label: 'zkažený závěr', steps: [
        { to: 8.4, ms: 2800 },
        { event: { cat: 'Story Conclusion', score: 5, weight: 1.5, dir: 'down' }, hold: 1100 },
        { to: 7.3, ms: 1200 },
        { hold: 1700 }
    ] },
    // 4. Plot s váhou 4 podrazí anime, které už sahalo po devítce
    { from: 7.5, label: 'slabý plot s vysokou váhou', steps: [
        { to: 9.2, ms: 2800 },
        { event: { cat: 'Plot', score: 6, weight: 4, dir: 'down' }, hold: 1100 },
        { to: 8.35, ms: 1200 },
        { hold: 1700 }
    ] },
    // 5. Klidný průběh bez zvratů — průměr prostě doroste na FH 7
    { from: 6.1, label: 'klidný průběh', steps: [
        { to: 7.4, ms: 3800 },
        { hold: 1900 }
    ] },
    // 6. Důležitá kategorie neudrží těsnou šestku
    { from: 5.1, label: 'těsná šestka neudržena', steps: [
        { to: 5.9, ms: 2600 },
        { event: { cat: 'MC', score: 5, weight: 3, dir: 'down' }, hold: 1100 },
        { to: 5.25, ms: 1100 },
        { hold: 1700 }
    ] },
    // 7. Z dat: anime s WA 6,87 — Emoce jen 5,5 a Enjoyment 6 s vysokými
    //    váhami stáhnou FH pod zaokrouhlený průměr na 6/10
    { from: 6.1, label: 'důležité kategorie srazí FH pod průměr', steps: [
        { to: 6.87, ms: 2800 },
        { event: { cat: 'Emoce', score: 5.5, weight: 3.5, dir: 'down' }, hold: 1100 },
        { event: { cat: 'Enjoyment', score: 6, weight: 4, dir: 'down' }, hold: 1100 },
        { fh: 6, hold: 2300 }
    ] },
    // 8. Z dat: anime s WA 8,11, ale Originalita 10/10 a vedlejší postavy
    //    9,5/10 zvednou FH na 9/10
    { from: 7.0, label: 'silné kategorie zvednou FH o stupeň', steps: [
        { to: 8.11, ms: 2800 },
        { event: { cat: 'Originalita', score: 10, weight: 2.5, dir: 'up' }, hold: 1100 },
        { event: { cat: 'Vedlejší postavy', score: 9.5, weight: 2.5, dir: 'up' }, hold: 1100 },
        { fh: 9, hold: 2300 }
    ] },
    // 9. Přetahovaná — OST průměr boostne, zkažený závěr ho zase srazí
    { from: 7.3, label: 'přetahovaná kategorií', steps: [
        { to: 8.2, ms: 2400 },
        { event: { cat: 'OST', score: 10, weight: 2, dir: 'up' }, hold: 1100 },
        { to: 8.6, ms: 1000 },
        { event: { cat: 'Story Conclusion', score: 6, weight: 1.5, dir: 'down' }, hold: 1100 },
        { to: 7.4, ms: 1100 },
        { hold: 1700 }
    ] }
]

function FhDemo() {
    const [wa, setWa] = useState(FH_SCENARIOS[0].from)
    const [events, setEvents] = useState([])         // chipy kategorií (kumulují se)
    const [fhOverride, setFhOverride] = useState(null) // FH překlopené kategoriemi
    const [label, setLabel] = useState(FH_SCENARIOS[0].label)

    useEffect(() => {
        let raf = 0
        let timer = 0
        let cancelled = false
        let scIdx = 0
        let current = FH_SCENARIOS[0].from // hodnota přežívá mezi scénáři → žádný skok
        const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

        const tween = (to, ms, done) => {
            const from = current
            let start = null
            const frame = (ts) => {
                if (cancelled) return
                if (start === null) start = ts
                const t = Math.min(1, (ts - start) / ms)
                current = from + (to - from) * ease(t)
                setWa(current)
                if (t < 1) raf = requestAnimationFrame(frame)
                else done()
            }
            raf = requestAnimationFrame(frame)
        }

        const runScenario = () => {
            if (cancelled) return
            const sc = FH_SCENARIOS[scIdx]
            setLabel(sc.label)
            let i = 0

            const nextStep = () => {
                if (cancelled) return
                if (i >= sc.steps.length) {
                    // fade-out chipů, zrušení overridu a přechod na další scénář
                    setEvents(evs => evs.map(e => ({ ...e, leaving: true })))
                    timer = setTimeout(() => {
                        setEvents([])
                        setFhOverride(null)
                        scIdx = (scIdx + 1) % FH_SCENARIOS.length
                        runScenario()
                    }, 500)
                    return
                }
                const st = sc.steps[i++]
                if (st.event) {
                    setEvents(evs => [...evs, st.event]) // fade-in dalšího chipu
                    timer = setTimeout(nextStep, st.hold)
                } else if (st.fh != null) {
                    setFhOverride(st.fh) // kategorie překlopí FH, průměr se nehne
                    timer = setTimeout(nextStep, st.hold)
                } else if (st.to != null) {
                    tween(st.to, st.ms, nextStep)
                } else {
                    timer = setTimeout(nextStep, st.hold)
                }
            }

            // Plynulý nájezd z konce předchozího scénáře na start nového
            if (Math.abs(current - sc.from) > 0.01) {
                tween(sc.from, 1600, nextStep)
            } else {
                nextStep()
            }
        }

        setWa(current)
        runScenario()
        return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(timer) }
    }, [])

    const fh = fhOverride ?? Math.min(10, Math.max(5, Math.round(wa)))
    const color = `var(--rating-${fh})`
    return (
        <div className="guide-fh-demo">
            <div className="guide-fh-demo-meta">
                <div className="guide-fh-demo-label-row">
                    <span className="guide-fh-demo-label">Průměr kategorií / epizod (WA)</span>
                    {label && <span key={label} className="guide-fh-demo-scenario">{label}</span>}
                </div>
                <div className="guide-fh-demo-row">
                    <div className="guide-fh-demo-bar">
                        <div className="guide-fh-demo-fill"
                            style={{ width: `${((wa - 5) / 5) * 100}%`, background: color }} />
                    </div>
                    <span className="guide-fh-demo-value" style={{ color }}>
                        {wa.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="guide-fh-demo-event-slot">
                    {events.map((ev, i) => (
                        <span key={`${ev.cat}-${i}`}
                            className={`guide-fh-demo-event ${ev.dir}${ev.leaving ? ' leaving' : ''}`}>
                            <span className="guide-fh-demo-event-icon">{iconFor(ev.cat)}</span>
                            {ev.cat}
                            <b style={{ color: `var(--rating-${Math.floor(ev.score)})` }}>
                                {ev.score.toLocaleString('cs-CZ')}/10
                            </b>
                            <span className="guide-fh-demo-event-weight">váha: {ev.weight.toLocaleString('cs-CZ')}</span>
                            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
                                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                {ev.dir === 'up'
                                    ? <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>
                                    : <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>}
                            </svg>
                        </span>
                    ))}
                </div>
            </div>
            <svg className="guide-fh-demo-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
            </svg>
            <div className="guide-fh-demo-circle"
                style={{ borderColor: color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                <span key={fh} className="guide-fh-demo-num" style={{ color }}>
                    {fh}<small>/10</small>
                </span>
            </div>
        </div>
    )
}

export function FinalGuideModal({ open, onClose }) {
    return (
        <GuideShell
            open={open}
            onClose={onClose}
            icon={(
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                </svg>
            )}
            title="Finální hodnocení (FH)"
            subtitle="Celkové skóre anime na šesti úrovních od 5 do 10 — víc než matematika je to celkový pocit."
        >
            <ScaleBarSVG />
            <p className="guide-intro">
                FH vychází z váženého průměru kategorií (WA), ale poslední slovo má vždy celkový dojem.
                Anime s WA 7,6 tak může skončit na 7 i na 8 podle toho, co ve mně zůstalo po závěrečné
                epizodě. Velkou roli přitom hrají kategorie s vysokou váhou. Když jich několik trefí
                10/10, dokážou vytáhnout FH na 10/10 i u anime s průměrem epizod 8,9 a WA 9,3.
                Funguje to ale i opačně: pokud právě ty důležité kategorie dostanou jen 5/10,
                spadne anime s průměrem 5,9 rovnou na FH 5/10.
            </p>
            <FhDemo />
            <div className="guide-fh-list">
                {FINAL_LEVELS.map(l => (
                    <div key={l.v} className="guide-fh-row" style={{ '--fh-color': `var(--rating-${l.v})` }}>
                        <span className="guide-fh-circle">
                            {l.v}
                            <span className="guide-fh-outof">/10</span>
                        </span>
                        <div className="guide-fh-meta">
                            <span className="guide-fh-name">{l.name}</span>
                            <p className="guide-fh-text">{l.text}</p>
                        </div>
                    </div>
                ))}
            </div>
        </GuideShell>
    )
}
