import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { Link, useNavigationType } from 'react-router-dom'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js'
import { Chart, Bar, Pie, Doughnut, Line } from 'react-chartjs-2'

import DashboardGroup from '../components/DashboardGroup'
import InfoIcon from '../components/InfoIcon'
import { buildChartOptions } from '../utils/chartSettings'
import { excelPalettes, excelImageBackgroundPlugin, decadeFloatingLabelsPlugin, premiumTooltipConfig, createHorizontalGradient } from '../utils/excelStyles'
import AnimeGenreChordChart from '../components/charts/AnimeGenreChordChart'
import SpiralWordCloud from '../components/charts/SpiralWordCloud'
import { calculateExcelChartsData } from '../utils/excelChartCalculations'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import { extractMalId, getAnimeInfo, getOrFetchEpisodeList, getCachedEpisodeList, getNextBroadcastDate, isExcelRunning } from '../utils/jikanService'

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    excelImageBackgroundPlugin,
    decadeFloatingLabelsPlugin
)

// Chart.js default options for dark theme
// Canvas neumí CSS var() — musí být konkrétní barvy (ThemeProvider je při změně
// tématu přepíše na světlou/tmavou variantu)
ChartJS.defaults.color = '#94a3b8'
ChartJS.defaults.borderColor = 'rgba(255, 255, 255, 0.08)'
ChartJS.defaults.font.family = "'Outfit', 'Inter', system-ui, -apple-system, sans-serif"
ChartJS.defaults.font.size = 11

// Premium defaults — rounded bars, better tooltips, disabled animations for performance
ChartJS.defaults.elements.bar.borderRadius = 6
ChartJS.defaults.elements.bar.borderSkipped = false
ChartJS.defaults.animation = false
Object.assign(ChartJS.defaults.plugins.tooltip, premiumTooltipConfig)

// ==========================================
// AUTO-SCROLL pás rewatchů (task 15)
// Po otevření detailu „Počet rewatchů“ se pás po prodlevě začne sám pomalu
// posouvat doprava. Interakce uživatele (hover, kolečko, tažení/touch) posun
// pozastaví; po chvíli bez interakce se zase rozjede. Na konci pásu zastaví.
// ==========================================
function RewatchAutoScroll({ className, children }) {
    const ref = useRef(null)

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const START_DELAY = 600    // ms před prvním rozjezdem — krátké, ale oko stihne zaostřit
        const RESUME_DELAY = 1200  // ms klidu po interakci, než se zase rozjede
        const SPEED = 0.55         // px/frame (~33 px/s @60 Hz) — pomalé „vitrínové“ tempo

        let raf = null
        let hovering = false
        let holdUntil = performance.now() + START_DELAY

        const holdFor = (ms) => { holdUntil = Math.max(holdUntil, performance.now() + ms) }

        const step = () => {
            if (!hovering && performance.now() >= holdUntil) {
                if (el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
                    el.scrollLeft += SPEED
                }
            }
            raf = requestAnimationFrame(step)
        }

        const onEnter = () => { hovering = true }
        const onLeave = () => { hovering = false; holdFor(600) }
        const onUserScroll = () => holdFor(RESUME_DELAY)

        el.addEventListener('pointerenter', onEnter)
        el.addEventListener('pointerleave', onLeave)
        el.addEventListener('wheel', onUserScroll, { passive: true })
        el.addEventListener('touchstart', onUserScroll, { passive: true })
        el.addEventListener('pointerdown', onUserScroll)
        raf = requestAnimationFrame(step)

        return () => {
            cancelAnimationFrame(raf)
            el.removeEventListener('pointerenter', onEnter)
            el.removeEventListener('pointerleave', onLeave)
            el.removeEventListener('wheel', onUserScroll)
            el.removeEventListener('touchstart', onUserScroll)
            el.removeEventListener('pointerdown', onUserScroll)
        }
    }, [])

    return <div ref={ref} className={className}>{children}</div>
}

// ==========================================
// GROUPS CONFIG (fixed order)
// ==========================================
const GROUPS_CONFIG = [
    { id: 'status', title: 'Status', icon: '📋', fullWidth: true, customPreview: true },
    { id: 'lists', title: 'Poslední & Binge & Nejdelší', icon: '🏆', fullWidth: true, customPreview: true },
    { id: 'tags', title: 'AniList Tagy', icon: '🏷️', fullWidth: true, customPreview: true },
    { id: 'ratings', title: 'Hodnocení', icon: '⭐', customPreview: true },
    { id: 'types', title: 'Typy', icon: '📊', customPreview: true },
    { id: 'studios', title: 'Studia', icon: '🏢', customPreview: true },
    { id: 'seasons', title: 'Sezóny & Stáří', icon: '🌸', customPreview: true },
    { id: 'themes', title: 'Témata', icon: '🎭', customPreview: true },
    { id: 'genres', title: 'Žánry', icon: '🎬', customPreview: true },
    { id: 'dub', title: 'Dabing', icon: '🎙️', alwaysExpanded: true },
]

// ==========================================
// JIKAN POSTER HELPER (async image loading)
// ==========================================
function JikanPoster({ malUrl, size = 'small' }) {
    // malId je odvozený z props — loading se inicializuje/resetuje podle něj
    // při renderu, takže efekt nemusí volat setState synchronně
    // (react-hooks/set-state-in-effect).
    const malId = malUrl ? extractMalId(malUrl) : null
    const [imageUrl, setImageUrl] = useState(null)
    const [loading, setLoading] = useState(!!malId)
    const [prevMalId, setPrevMalId] = useState(malId)
    if (prevMalId !== malId) {
        setPrevMalId(malId)
        setImageUrl(null)
        setLoading(!!malId)
    }

    useEffect(() => {
        if (!malId) return

        let cancelled = false
        getAnimeInfo(malId).then(info => {
            if (!cancelled && info) {
                setImageUrl(size === 'large' ? (info.largeImageUrl || info.imageUrl) : info.imageUrl)
            }
            if (!cancelled) setLoading(false)
        })
        return () => { cancelled = true }
    }, [malId, size])

    const dims = size === 'large' ? { width: '45px', height: '64px' } : { width: '20px', height: '28px' }

    return (
        <div className="jikan-poster-container" style={dims}>
            {imageUrl ? (
                <img src={imageUrl} alt="" className="jikan-poster-img" loading="lazy" />
            ) : loading ? (
                <span className="jikan-poster-placeholder">…</span>
            ) : (
                <span className="jikan-poster-placeholder">🎬</span>
            )}
        </div>
    )
}

// ==========================================
// ==========================================
// AIRING EPISODE STATS (async episode data)
// ==========================================

// Poslední známá podoba statistik „Právě sledované" v localStorage — po
// refreshi stránky se ukáže hned a na pozadí se jen tiše obnoví, žádné
// mazání a „Načítám…" napříč celou sekcí.
const AIRING_STATS_TTL = 15 * 60 * 1000
const airingStatsKey = (malId) => `jikan_airing_stats_${malId}`

function loadAiringStats(malId) {
    try {
        const raw = localStorage.getItem(airingStatsKey(malId))
        if (raw) return JSON.parse(raw)
    } catch { /* poškozený záznam — načte se z API */ }
    return null
}

function saveAiringStats(malId, stats) {
    try { localStorage.setItem(airingStatsKey(malId), JSON.stringify({ stats, at: Date.now() })) } catch { /* quota */ }
}

function AiringEpisodeStats({ malUrl, animeName, historyLog = [], episodeRatings = [] }) {
    // Stejný vzor jako JikanPoster: loading odvozený z malId při renderu,
    // efekt nevolá setState synchronně (react-hooks/set-state-in-effect).
    const malId = malUrl ? extractMalId(malUrl) : null
    const [stats, setStats] = useState(() => (malId && loadAiringStats(malId)?.stats) || null)
    const [loading, setLoading] = useState(() => !!malId && !loadAiringStats(malId)?.stats)
    const [prevMalId, setPrevMalId] = useState(malId)
    if (prevMalId !== malId) {
        setPrevMalId(malId)
        const cached = malId ? loadAiringStats(malId)?.stats : null
        setStats(cached || null)
        setLoading(!!malId && !cached)
    }

    useEffect(() => {
        if (!malId) return

        // Čerstvá cache → nefetchovat; starší je už vykreslená a jen se
        // na pozadí tiše přepíše novými daty
        const cached = loadAiringStats(malId)
        if (cached && Date.now() - cached.at < AIRING_STATS_TTL) return

        // Po odchodu z Dashboardu smí dotaz doběhnout a uložit se do cache —
        // ale JEN když neběží Excel; při běžícím Excelu se zruší (viz cleanup)
        const controller = new AbortController()
        const signal = controller.signal
        getOrFetchEpisodeList(malId, 'high', signal).then(episodes => {
            if (signal.aborted) return;

            // 1. Gather release date details from Jikan API
            const now = new Date()
            let aired = []
            let upcoming = []
            if (episodes && episodes.length > 0) {
                aired = episodes.filter(ep => ep.aired && new Date(ep.aired) <= now)
                upcoming = episodes.filter(ep => ep.aired && new Date(ep.aired) > now)
                    .sort((a, b) => new Date(a.aired) - new Date(b.aired))
            }
            const lastEp = aired.length > 0 ? aired[aired.length - 1] : null
            const nextEp = upcoming.length > 0 ? upcoming[0] : null

            // 2. Gather user's OWN ratings from episodeRatings
            // episodeRatings is like [{ name: "Jujutsu Kaisen, S01", episodes: [{episode: "EP 1", rating: 8.75}, ...] }]
            const animeRatingsObj = episodeRatings.find(r => r.name && r.name.toLowerCase() === animeName.toLowerCase())
            let userRatings = []
            if (animeRatingsObj && animeRatingsObj.episodes) {
                userRatings = animeRatingsObj.episodes
                    .map(e => parseFloat(e.rating))
                    .filter(r => !isNaN(r) && r > 0)
            }

            const avgScore = userRatings.length > 0
                ? (userRatings.reduce((sum, r) => sum + r, 0) / userRatings.length)
                : null
            const lastScore = userRatings.length > 0
                ? userRatings[userRatings.length - 1]
                : null

            const formatLocal = (dateObj) => {
                return dateObj.toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
            }

            let localBroadcast = null
            let exactNextDate = null
            let formattedNext = nextEp?.aired ? new Date(nextEp.aired).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) : null
            let formattedLast = lastEp?.aired ? new Date(lastEp.aired).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' }) : null

            // Overwrite with accurate broadcast info from API instead of Jikan episode midnight dates
            getAnimeInfo(malId, 'high', signal).then(info => {
                if (signal.aborted) return;
                if (info && info.broadcast) {
                    exactNextDate = getNextBroadcastDate(info.broadcast)
                    if (exactNextDate) {
                        const weekday = exactNextDate.toLocaleDateString('cs-CZ', { weekday: 'long' })
                        const timeStr = exactNextDate.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
                        localBroadcast = `Pravidelně: ${weekday} ${timeStr}`
                        
                        // We can also use exactNextDate for nextEpDate!
                        formattedNext = formatLocal(exactNextDate)
                        
                        // If exactNextDate is next week, last week's exact date is 7 days ago!
                        const lastExactDate = new Date(exactNextDate.getTime() - 7 * 24 * 60 * 60 * 1000)
                        formattedLast = formatLocal(lastExactDate)
                    }
                }

                const statsObj = {
                    avgScore,
                    lastScore,
                    lastEpDate: formattedLast,
                    nextEpDate: formattedNext,
                    totalEps: episodes ? episodes.length : 0,
                    airedCount: aired.length,
                    broadcast: localBroadcast
                }
                saveAiringStats(malId, statsObj)
                setStats(statsObj)
                setLoading(false)
            }).catch(() => {
                if (!signal.aborted) {
                    const statsObj = {
                        avgScore,
                        lastScore,
                        lastEpDate: formattedLast,
                        nextEpDate: formattedNext,
                        totalEps: episodes ? episodes.length : 0,
                        airedCount: aired.length,
                        broadcast: null
                    }
                    saveAiringStats(malId, statsObj)
                    setStats(statsObj)
                    setLoading(false)
                }
            })
        }).catch(() => { if (!signal.aborted) setLoading(false) })

        return () => {
            // Odchod z tabu: abort JEN když běží Excel — jinak nechat doběhnout
            isExcelRunning()
                .then(running => { if (running) controller.abort() })
                .catch(() => { /* endpoint nedostupný ⇒ Excel neběží */ })
        }
    }, [malId, animeName, historyLog])

    if (loading) return <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', opacity: 0.5 }}>Načítám…</span>
    if (!stats) return null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                {stats.avgScore !== null && (
                    <span title="Tvůj průměr hodnocení sledovaných dílů">
                        ⭐ Ø {stats.avgScore.toFixed(2).replace('.', ',')}
                    </span>
                )}
                {stats.lastScore !== null && (
                    <span title="Tvůj poslední hodnocený díl">
                        📊 Last: {stats.lastScore.toFixed(1).replace('.', ',')}
                    </span>
                )}
                {stats.lastEpDate && (
                    <span title="Datum poslední epizody (Jikan)">
                        📅 {stats.lastEpDate}
                    </span>
                )}
                {stats.nextEpDate && (
                    <span title="Datum příští epizody (Jikan)" style={{ color: '#34d399' }}>
                        ⏭️ {stats.nextEpDate}
                    </span>
                )}
                {stats.broadcast && (
                    <span title="Pravidelný čas vysílání (Jikan)" style={{ color: '#818cf8' }}>
                        📡 {stats.broadcast}
                    </span>
                )}
            </div>
        </div>
    )
}

// ==========================================
// AIRING CALENDAR — mini dynamický kalendář vysílání pro maximalizované
// okno Status. Události na dnech:
//   aired  = odvysíláno a zhlédnuto (Jikan episode list, IndexedDB cache)
//   unseen = odvysíláno, ale ještě nezhlédnuto (podle watchedEps z listu)
//   next   = nejbližší budoucí díl
//   plan   = potvrzený rozvrh z AniList airingSchedule (přesné číslo + čas)
//   proj   = odhad z pravidelného vysílacího času (jen bez AniList rozvrhu)
// ==========================================
const CAL_WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const calDayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

// Cache událostí: module-level + localStorage, takže poslední známá podoba
// kalendáře přežije i refresh stránky. Po startu se vykreslí okamžitě a data
// se pak obnovují POSTUPNĚ anime po anime — nic se nemaže, chipy se tiše
// přepisují, jak přicházejí čerstvá data.
const CAL_CACHE_TTL = 10 * 60 * 1000
const CAL_LS_KEY = 'dashboard-cal-events-v2'
let _airingCalCache = null // { key, at, animeEvents: { [name]: ev[] } }

function loadCalCache() {
    if (_airingCalCache) return _airingCalCache
    try {
        const raw = localStorage.getItem(CAL_LS_KEY)
        if (raw) _airingCalCache = JSON.parse(raw)
    } catch { /* poškozený záznam — začne se od nuly */ }
    return _airingCalCache
}

function saveCalCache(cache) {
    _airingCalCache = cache
    try { localStorage.setItem(CAL_LS_KEY, JSON.stringify(cache)) } catch { /* quota */ }
}

// Přesný rozvrh epizod z AniList — airingSchedule má reálná čísla dílů
// a unix časy vysílání. Ptáme se na ODVYSÍLANÉ i budoucí díly: Jikan
// /episodes má u probíhajících sérií zpoždění i u odvysílaných (proto dřív
// v kalendáři chyběly díly z posledních dnů). Jeden batch GraphQL dotaz pro
// všechna anime; AniList kuriozita (viz plán 7): pokud jediné idMal na
// AniListu neexistuje, celý batch vrátí 404 + data:null → rozpad na
// jednotlivé dotazy.
async function fetchAnilistSchedules(malIds, signal = null) {
    if (!malIds.length) return {}
    const mediaQuery = (id, alias) =>
        `${alias}: Media(idMal: ${id}, type: ANIME) { idMal episodes ` +
        `airedSchedule: airingSchedule(notYetAired: false, perPage: 50) { pageInfo { hasNextPage } nodes { episode airingAt } } ` +
        `upcomingSchedule: airingSchedule(notYetAired: true, perPage: 16) { nodes { episode airingAt } } }`
    const runQuery = async (body) => {
        const resp = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query: `query { ${body} }` }),
            signal
        })
        const json = await resp.json().catch(() => null)
        return json?.data || null
    }
    const out = {}
    const collect = (data) => {
        for (const k of Object.keys(data || {})) {
            const m = data[k]
            if (m?.idMal) out[m.idMal] = m
        }
    }
    try {
        const data = await runQuery(malIds.map((id, i) => mediaQuery(id, `m${i}`)).join(' '))
        if (data) {
            collect(data)
            return out
        }
        for (const id of malIds) {
            collect(await runQuery(mediaQuery(id, 'm0')).catch(() => null))
        }
    } catch {
        // AniList nedostupný — kalendář se obejde broadcast projekcí
    }
    return out
}

// Sestaví události jednoho anime. Zdroje v pořadí přesnosti:
// 1) AniList airingSchedule (odvysílané i budoucí — přesná čísla dílů a časy;
//    aired část se ignoruje jen u >50dílných long-runnerů, kde 1. stránka
//    obsahuje nejstarší díly),
// 2) Jikan episode list (doplní díly, které AniList rozvrh nezná),
// 3) projekce z pravidelného vysílání (jen když neexistuje žádný budoucí
//    rozvrh; čísluje od max(známý, zhlédnutý) + 1).
function buildAnimeEvents(a, episodes, info, schedule, nowTs) {
    const watched = parseInt(a.watchedEps) || 0
    const fmtTime = (d) => d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
    const fmtDate = (d) => d.toLocaleDateString('cs-CZ')

    // číslo dílu → { ts, exact }; AniList má přednost (přesné časy)
    const epMap = new Map()
    const airedSched = schedule?.airedSchedule
    if (airedSched?.nodes?.length && !airedSched.pageInfo?.hasNextPage) {
        airedSched.nodes.forEach(n => {
            if (n?.airingAt) epMap.set(n.episode, { ts: n.airingAt * 1000, exact: true })
        })
    }
    ;(schedule?.upcomingSchedule?.nodes || []).forEach(n => {
        if (n?.airingAt) epMap.set(n.episode, { ts: n.airingAt * 1000, exact: true })
    })
    ;(episodes || []).forEach((ep, idx) => {
        const epNum = ep.mal_id || idx + 1
        if (epMap.has(epNum) || !ep.aired) return
        const t = new Date(ep.aired).getTime()
        if (!isNaN(t)) epMap.set(epNum, { ts: t, exact: false })
    })

    const events = []
    const usedDays = new Set()
    const upcoming = []
    let maxEp = 0
    for (const [epNum, rec] of [...epMap.entries()].sort((x, y) => x[1].ts - y[1].ts)) {
        maxEp = Math.max(maxEp, epNum)
        const d = new Date(rec.ts)
        usedDays.add(calDayKey(d))
        if (rec.ts > nowTs) {
            upcoming.push({ epNum, rec, d })
        } else {
            const kind = epNum <= watched ? 'aired' : 'unseen'
            events.push({
                day: calDayKey(d), ts: rec.ts, name: a.name, malUrl: a.mal_url, ep: epNum, kind,
                title: `${a.name} — EP ${epNum} • ${fmtDate(d)}${rec.exact ? ` ${fmtTime(d)}` : ''}`
                    + (kind === 'unseen' ? ' • odvysíláno, nezhlédnuto' : '')
            })
        }
    }
    upcoming.forEach((u, i) => {
        events.push({
            day: calDayKey(u.d), ts: u.rec.ts, name: a.name, malUrl: a.mal_url, ep: u.epNum,
            kind: i === 0 ? 'next' : 'plan',
            title: `${a.name} — EP ${u.epNum} • ${fmtDate(u.d)}${u.rec.exact ? ` ${fmtTime(u.d)}` : ''}`
        })
    })

    const nextBroadcast = info?.broadcast ? getNextBroadcastDate(info.broadcast) : null
    if (upcoming.length === 0 && nextBroadcast) {
        const base = Math.max(maxEp, watched)
        let projected = 0
        for (let i = 0; i < 10; i++) {
            const d = new Date(nextBroadcast.getTime() + i * 7 * 24 * 60 * 60 * 1000)
            if (usedDays.has(calDayKey(d))) continue
            projected++
            const epNum = base + projected
            events.push({
                day: calDayKey(d), ts: d.getTime(), name: a.name, malUrl: a.mal_url, ep: epNum,
                kind: projected === 1 ? 'next' : 'proj',
                title: `${a.name} — EP ${epNum}${projected === 1 ? '' : ' (odhad)'} • ${fmtDate(d)} ${fmtTime(d)}`
            })
        }
    }
    return events
}

function AiringCalendar({ airingAnime }) {
    const today = new Date()
    const [viewYM, setViewYM] = useState({ y: today.getFullYear(), m: today.getMonth() })
    // Klíč je seřazený, protože pořadí seznamu se mění asynchronně
    // (airingSortKeys) a nesmí zneplatnit cache.
    const cacheKey = airingAnime.map(a => `${a.name}:${a.watchedEps || 0}`).sort().join('|')
    // Poslední známá podoba se ukáže OKAMŽITĚ (i po refreshi stránky, i když
    // je „stará") — refresh ji pak anime po anime tiše přepíše.
    const [animeEvents, setAnimeEvents] = useState(() => loadCalCache()?.animeEvents || null)

    // airingAnime přes ref: načítací efekt závisí jen na cacheKey, aby ho
    // asynchronní přerovnání seznamu (stejný obsah, jiné pořadí)
    // nerestartovalo v půlce. Ref se aktualizuje v efektu deklarovaném PŘED
    // načítacím efektem — ve stejném commitu proběhne dřív.
    const airingRef = useRef(airingAnime)
    useEffect(() => {
        airingRef.current = airingAnime
    }, [airingAnime])

    useEffect(() => {
        // Plná priorita platí, dokud je uživatel v Dashboardu s rozbaleným
        // Statusem. Po odchodu smí rozdělaná aktualizace DOBĚHNOUT na pozadí
        // a uložit se do cache (příští návštěva je hned čerstvá) — ale JEN
        // když neběží Excel; při běžícím Excelu se zruší (abort projde až
        // do rate-limit fronty), aby měl Excel update klid.
        const controller = new AbortController()
        const signal = controller.signal
        const cached = loadCalCache()
        if (cached && cached.key === cacheKey && Date.now() - cached.at < CAL_CACHE_TTL) return

        const load = async () => {
            const list = airingRef.current
            const nowTs = Date.now()
            const malIds = list.map(a => extractMalId(a.mal_url)).filter(Boolean)
            const schedules = await fetchAnilistSchedules(malIds, signal).catch(() => ({}))
            if (signal.aborted) return

            // Začíná se od poslední známé podoby — jen se vyhodí anime,
            // která už nejsou ve sledovaných; zbytek zůstává viditelný,
            // dokud ho nepřepíšou čerstvá data.
            const next = { ...(loadCalCache()?.animeEvents || {}) }
            const names = new Set(list.map(a => a.name))
            for (const k of Object.keys(next)) {
                if (!names.has(k)) delete next[k]
            }

            // FÁZE 1 — bez sítě: AniList rozvrh (1 dotaz výše) + episode
            // listy z IndexedDB + info z localStorage/statické cache.
            // Celý kalendář se vykreslí hned; síť přijde až ve fázi 2.
            const EP_LIST_TTL = 24 * 60 * 60 * 1000
            const staleQueue = []
            for (const a of list) {
                const malId = extractMalId(a.mal_url)
                if (!malId) continue
                const [cachedList, info] = await Promise.all([
                    getCachedEpisodeList(malId).catch(() => null),
                    getAnimeInfo(malId, 'high', signal).catch(() => null)
                ])
                if (signal.aborted) return
                next[a.name] = buildAnimeEvents(a, cachedList?.episodes || null, info, schedules[malId], nowTs)
                if (!cachedList?.fetchedAt || nowTs - cachedList.fetchedAt > EP_LIST_TTL) {
                    staleQueue.push({ a, malId, info })
                }
            }
            setAnimeEvents({ ...next })

            // FÁZE 2 — sekvenční síťové doplnění jen zastaralých seznamů;
            // každé dokončené anime hned tiše přepíše své chipy (nic nebliká,
            // nic se nemaže). Priorita 'high' předbíhá downloader i při
            // zavřeném Excelu; downloader sám při otevřeném Excelu stojí.
            // Po odchodu z Dashboardu (bez abortu) smyčka dojede na pozadí —
            // setAnimeEvents je pak neškodné no-op, ale cache se uloží.
            for (const { a, malId, info } of staleQueue) {
                const episodes = await getOrFetchEpisodeList(malId, 'high', signal).catch(() => null)
                if (signal.aborted) return
                next[a.name] = buildAnimeEvents(a, episodes, info, schedules[malId], nowTs)
                setAnimeEvents({ ...next })
            }
            saveCalCache({ key: cacheKey, at: Date.now(), animeEvents: next })
        }

        load()
        return () => {
            // Odchod z tabu: abort JEN když běží Excel — jinak nechat doběhnout
            isExcelRunning()
                .then(running => { if (running) controller.abort() })
                .catch(() => { /* endpoint nedostupný ⇒ Excel neběží */ })
        }
    }, [cacheKey])

    // Sloučení per-anime událostí na dny; v rámci dne mají přednost důležité
    // druhy (nezhlédnuté a další díl), pak chronologicky
    const eventsByDay = useMemo(() => {
        const PRIORITY = { unseen: 0, next: 1, plan: 2, proj: 3, aired: 4 }
        const byDay = {}
        for (const evs of Object.values(animeEvents || {})) {
            for (const ev of evs) {
                if (!byDay[ev.day]) byDay[ev.day] = []
                byDay[ev.day].push(ev)
            }
        }
        for (const day of Object.keys(byDay)) {
            byDay[day].sort((x, y) => (PRIORITY[x.kind] - PRIORITY[y.kind]) || (x.ts - y.ts))
        }
        return byDay
    }, [animeEvents])

    const { y, m } = viewYM
    const first = new Date(y, m, 1)
    const startOffset = (first.getDay() + 6) % 7 // pondělí = první sloupec
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const weeks = Math.ceil((startOffset + daysInMonth) / 7)
    const todayKey = calDayKey(today)
    const monthLabel = first.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
    const isCurrentMonth = y === today.getFullYear() && m === today.getMonth()

    const shiftMonth = (delta) => setViewYM(({ y, m }) => {
        const d = new Date(y, m + delta, 1)
        return { y: d.getFullYear(), m: d.getMonth() }
    })

    const MAX_CHIPS = 2

    return (
        <div className="full-chart-wrapper text-list airing-cal-card">
            <div className="chart-title airing-cal-titlebar">
                <span>🗓️ Kalendář vysílání</span>
                <span className="airing-cal-nav">
                    <button type="button" onClick={() => shiftMonth(-1)} aria-label="Předchozí měsíc">‹</button>
                    <button
                        type="button"
                        className="airing-cal-month"
                        onClick={() => setViewYM({ y: today.getFullYear(), m: today.getMonth() })}
                        title={isCurrentMonth ? 'Aktuální měsíc' : 'Zpět na aktuální měsíc'}
                    >
                        {monthLabel}
                    </button>
                    <button type="button" onClick={() => shiftMonth(1)} aria-label="Další měsíc">›</button>
                </span>
            </div>

            <div className="airing-cal-weekdays">
                {CAL_WEEKDAYS.map(wd => <span key={wd} className="airing-cal-weekday">{wd}</span>)}
            </div>

            <div className="airing-cal-grid" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
                {Array.from({ length: weeks * 7 }, (_, idx) => {
                    const dayNum = idx - startOffset + 1
                    const inMonth = dayNum >= 1 && dayNum <= daysInMonth
                    const date = new Date(y, m, dayNum)
                    const key = calDayKey(date)
                    const evs = (inMonth && eventsByDay[key]) || []
                    const isToday = inMonth && key === todayKey
                    const extra = evs.slice(MAX_CHIPS)
                    return (
                        <div key={idx} className={`airing-cal-cell${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}`}>
                            {inMonth && <span className="airing-cal-daynum">{dayNum}</span>}
                            {evs.slice(0, MAX_CHIPS).map((ev, j) => (
                                <Link
                                    key={j}
                                    to={`/anime/${encodeURIComponent(ev.name)}`}
                                    className={`airing-cal-chip ${ev.kind}`}
                                    title={ev.title}
                                >
                                    <JikanPoster malUrl={ev.malUrl} />
                                    <span className="airing-cal-chip-ep">EP {ev.ep}</span>
                                </Link>
                            ))}
                            {extra.length > 0 && (
                                <span className="airing-cal-more" title={extra.map(e => e.title).join('\n')}>
                                    +{extra.length}
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="airing-cal-legend">
                {animeEvents === null && <span className="airing-cal-loading">Načítám vysílací data…</span>}
                <span><i className="airing-cal-dot aired" />Zhlédnuto</span>
                <span><i className="airing-cal-dot unseen" />Odvysíláno · nezhlédnuto</span>
                <span><i className="airing-cal-dot next" />Další díl</span>
                <span><i className="airing-cal-dot plan" />Naplánováno</span>
                <span><i className="airing-cal-dot proj" />Odhad</span>
            </div>
        </div>
    )
}

function Dashboard() {
    // Czech number formatting: dot → comma
    const toCS = (val) => String(val).replace('.', ',')

    const [animeList, setAnimeList] = useState([])
    const [historyLog, setHistoryLog] = useState([])
    const [loading, setLoading] = useState(true)
    const [timeFilter, setTimeFilter] = useState('all')
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    
    // Airing Anime sorting state
    const [airingSortKeys, setAiringSortKeys] = useState({})

    // Tags multi-select state
    const [selectedTags, setSelectedTags] = useState(new Set())
    const [excludedTags, setExcludedTags] = useState(new Set())
    const [tagSearchQuery, setTagSearchQuery] = useState('')
    const [tagFilterMode, setTagFilterMode] = useState('or')

    // Group expansion state — dub starts expanded.
    // Rozbalené skupiny přežívají odchod na detail v sessionStorage, takže
    // „Zpět" z detailu vrátí Dashboard přesně jak byl (např. otevřený kalendář).
    const [expandedGroups, setExpandedGroups] = useState(() => {
        try {
            const saved = sessionStorage.getItem('dashboard-expanded-groups')
            if (saved) return new Set(JSON.parse(saved))
        } catch { /* poškozený záznam — použije se default */ }
        return new Set(['dub'])
    })
    const toggleGroup = (id) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            try { sessionStorage.setItem('dashboard-expanded-groups', JSON.stringify([...next])) } catch { /* quota */ }
            return next
        })
    }

    // Návrat „do minulosti": při odchodu z Dashboardu se uloží scroll pozice
    // a při POP navigaci (tlačítko zpět) se po vykreslení obnoví. Dopředná
    // navigace (klik v menu) začíná nahoře jako dřív.
    const navigationType = useNavigationType()
    // Při POP (zpět) se NEJDŘÍV musí obnovit uložená pozice a teprve pak smí
    // listener ukládat: prohlížeč totiž při přechodu scroll ořízne na 0
    // (stránka je zprvu krátká) a ten scroll event by uloženou pozici přepsal
    // nulou dřív, než se stihne použít.
    const scrollRestorePending = useRef(navigationType === 'POP')
    useEffect(() => {
        // Průběžné ukládání (throttle přes rAF) — při unmountu už je scroll
        // prohlížečem oříznutý na 0, takže jednorázové uložení v cleanupu
        // by vždy zapsalo 0.
        let raf = null
        const onScroll = () => {
            if (raf || scrollRestorePending.current) return
            raf = requestAnimationFrame(() => {
                raf = null
                if (!scrollRestorePending.current) {
                    try { sessionStorage.setItem('dashboard-scroll', String(document.documentElement.scrollTop || 0)) } catch { /* quota */ }
                }
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            if (raf) cancelAnimationFrame(raf)
        }
    }, [])
    useEffect(() => {
        if (loading) return
        const saved = parseInt(sessionStorage.getItem('dashboard-scroll') || '0', 10)
        if (navigationType !== 'POP' || !saved) {
            scrollRestorePending.current = false
            return
        }
        // Výška stránky roste postupně (skupiny, grafy, obrázky) — zkouší se
        // každých 100 ms až ~2,5 s, dokud stránka nedoroste k cílové pozici.
        // Manuální scroll uživatele (kolečko/dotyk) obnovu okamžitě ukončí.
        const el = document.documentElement
        const finish = () => {
            clearInterval(iv)
            scrollRestorePending.current = false
        }
        const tryRestore = () => {
            el.scrollTo({ top: saved, behavior: 'instant' })
            return el.scrollHeight - el.clientHeight >= saved || Math.abs(el.scrollTop - saved) < 2
        }
        let attempts = 0
        const iv = setInterval(() => {
            attempts++
            if (tryRestore() || attempts >= 25) finish()
        }, 100)
        if (tryRestore()) finish()
        window.addEventListener('wheel', finish, { once: true, passive: true })
        window.addEventListener('touchstart', finish, { once: true, passive: true })
        return () => {
            finish()
            window.removeEventListener('wheel', finish)
            window.removeEventListener('touchstart', finish)
        }
    }, [loading, navigationType])

    const [statsData, setStatsData] = useState(null) // Stats from stats.json (with comments)
    const [episodeRatings, setEpisodeRatings] = useState([])
    const [expandedNote, setExpandedNote] = useState(null)

    const toggleNote = (rowIndex, colId, text, isRewatch) => {
        if (isRewatch) {
            const id = `${rowIndex}-${colId}`
            if (expandedNote && expandedNote.id === id) {
                setExpandedNote(null)
            } else {
                setExpandedNote({ id, text, rowIndex, isRewatch: true })
            }
        } else {
            const id = `row-${rowIndex}`
            if (expandedNote && expandedNote.id === id) {
                setExpandedNote(null)
            } else {
                setExpandedNote({ id, rowIndex, isRewatch: false })
            }
        }
    }



    useEffect(() => {
        Promise.all([
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/history_log.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/stats.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            fetch('data/episode_ratings.json?v=' + Date.now()).then(r => r.json()).catch(() => [])
        ])
            .then(([anime, history, statsJson, epRatings]) => {
                setAnimeList(anime)
                setHistoryLog(history)
                if (statsJson) setStatsData(statsJson)
                if (epRatings) setEpisodeRatings(epRatings)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load data:', err)
                setLoading(false)
            })
    }, [])



    // Calculate statistics
    const stats = useMemo(() => {
        if (!animeList.length) return null

        // --- Filter Logic ---
        function getYear(dateStr) {
            if (!dateStr) return null
            const d = new Date(dateStr)
            return d.getFullYear()
        }

        const isInTimeRange = (dateStr) => {
            if (timeFilter === 'all') return true
            if (!dateStr) return false
            const d = new Date(dateStr)
            const year = d.getFullYear()
            // Dynamic year filter
            const yearNum = parseInt(timeFilter)
            if (!isNaN(yearNum)) return year === yearNum
            if (timeFilter === 'custom') {
                if (!customRange.start && !customRange.end) return true
                const start = customRange.start ? new Date(customRange.start) : new Date('2000-01-01')
                const end = customRange.end ? new Date(customRange.end) : new Date()
                end.setHours(23, 59, 59, 999)
                return d >= start && d <= end
            }
            return true
        }

        // Detect all years from data
        const detectedYears = new Set()
        animeList.forEach(a => {
            const y = getYear(a.start_date)
            if (y && y >= 2000) detectedYears.add(y)
        })
        const sortedYearsAll = [...detectedYears].sort((a, b) => a - b)
        const latestYear = sortedYearsAll.length > 0 ? sortedYearsAll[sortedYearsAll.length - 1] : new Date().getFullYear()

        // Apply filters
        const filteredAnimeList = animeList.filter(a => isInTimeRange(a.start_date || a.release_date))
        const filteredHistoryLog = historyLog.filter(h => isInTimeRange(h.date))

        const list = filteredAnimeList
        const log = filteredHistoryLog

        // Helper: compute detailed stats for a subset of anime
        const computeYearStats = (subset) => {
            let totalEps = 0, totalMins = 0, rewatchCount = 0
            const typeBreakdown = {}
            subset.forEach(a => {
                const eps = parseInt(a.episodes) || 0
                const rc = parseInt(a.rewatch_count) || 0
                const dur = parseFloat(a.episode_duration) || 24

                // Use pre-calculated totalTime from JSON if available, otherwise fallback
                const time = parseFloat(a.total_time) || (eps * dur * (1 + rc))

                totalEps += eps * (1 + rc)
                totalMins += time
                rewatchCount += rc

                const t = a.type || 'Jiný'
                typeBreakdown[t] = (typeBreakdown[t] || 0) + 1
            })
            const avgEpDur = totalEps > 0 ? totalMins / totalEps : 0
            return { count: subset.length, totalEps, totalMins, rewatchCount, avgEpDur, typeBreakdown }
        }

        // Per-year detailed stats
        const yearStats = {}
        sortedYearsAll.forEach(y => {
            const yearAnime = animeList.filter(a => getYear(a.start_date) === y)
            yearStats[y] = computeYearStats(yearAnime)
        })

        // Overall (all time) stats — computed from ALL anime, not filtered
        const allTimeStats = computeYearStats(animeList)

        // Filtered stats (for display when filter is active)
        const filteredStats = computeYearStats(list)

        // Per-year stats (kept for backward compat with charts)
        const animeByYear = {}
        const episodesByYear = {}
        sortedYearsAll.forEach(y => {
            animeByYear[y] = yearStats[y].count
            episodesByYear[y] = yearStats[y].totalEps
        })

        // Calculate total episodes (including rewatches)
        const totalEpisodesSum = list.reduce((sum, a) => {
            const eps = parseInt(a.episodes) || 0
            const rc = parseInt(a.rewatch_count) || 0
            return sum + (eps * (1 + rc))
        }, 0)

        // Calculate total time (in hours, including rewatches)
        const totalTimeSum = list.reduce((sum, a) => {
            const eps = parseInt(a.episodes) || 0
            const rc = parseInt(a.rewatch_count) || 0
            const dur = parseFloat(a.episode_duration) || 24
            const time = parseFloat(a.total_time) || (eps * dur * (1 + rc))
            return sum + (time / 60)
        }, 0)

        // Average rating
        const ratings = list.filter(a => a.rating && !isNaN(parseFloat(a.rating)))
        const avgRating = ratings.length
            ? ratings.reduce((sum, a) => sum + parseFloat(a.rating), 0) / ratings.length
            : 0

        // Type distribution
        const types = {}
        list.forEach(a => {
            const type = a.type || 'Unknown'
            types[type] = (types[type] || 0) + 1
        })

        // Genre distribution
        const genres = {}
        list.forEach(a => {
            if (a.genres) {
                a.genres.split(';').forEach(g => {
                    const genre = g.trim()
                    if (genre) genres[genre] = (genres[genre] || 0) + 1
                })
            }
        })

        // Studio distribution
        const studios = {}
        list.forEach(a => {
            if (a.studio) {
                a.studio.split(';').forEach(s => {
                    const studio = s.trim()
                    if (studio && studio.length < 50) { // Filter out formula strings
                        studios[studio] = (studios[studio] || 0) + 1
                    }
                })
            }
        })

        // Rating distribution
        const ratingDist = { '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4-': 0 }
        list.forEach(a => {
            const r = parseFloat(a.rating)
            if (!isNaN(r)) {
                if (r >= 9.5) ratingDist['10']++
                else if (r >= 8.5) ratingDist['9']++
                else if (r >= 7.5) ratingDist['8']++
                else if (r >= 6.5) ratingDist['7']++
                else if (r >= 5.5) ratingDist['6']++
                else if (r >= 4.5) ratingDist['5']++
                else ratingDist['4-']++
            }
        })

        // Themes distribution
        const themes = {}
        list.forEach(a => {
            if (a.themes) {
                a.themes.split(';').forEach(t => {
                    const theme = t.trim()
                    if (theme && theme !== 'X') themes[theme] = (themes[theme] || 0) + 1
                })
            }
        })

        // Season distribution (from release_date)
        const seasons = { 'Winter': 0, 'Spring': 0, 'Summer': 0, 'Fall': 0 }
        list.forEach(a => {
            if (a.release_date) {
                const d = new Date(a.release_date)
                const month = d.getMonth()
                if (month >= 0 && month <= 2) seasons['Winter']++
                else if (month >= 3 && month <= 5) seasons['Spring']++
                else if (month >= 6 && month <= 8) seasons['Summer']++
                else seasons['Fall']++
            }
        })

        // Status distribution (grouped like Excel)
        const statuses = {}
        list.forEach(a => {
            let status = a.status || 'Neznámý'
            // Group all "Existuje..." variants into one category
            if (status.startsWith('Existuje')) {
                status = 'Existuje pokračování...'
            }
            statuses[status] = (statuses[status] || 0) + 1
        })

        // Dubbing distribution
        const dubs = {}
        list.forEach(a => {
            if (a.dub) {
                a.dub.split(';').forEach(d => {
                    const dub = d.trim()
                    if (dub) dubs[dub] = (dubs[dub] || 0) + 1
                })
            } else {
                dubs['Neznámý'] = (dubs['Neznámý'] || 0) + 1
            }
        })

        // Average rating by type
        const typeRatings = {}
        const typeCounts = {}
        list.forEach(a => {
            if (a.type && a.rating) {
                const r = parseFloat(a.rating)
                if (!isNaN(r)) {
                    typeRatings[a.type] = (typeRatings[a.type] || 0) + r
                    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
                }
            }
        })
        const avgRatingByType = {}
        Object.keys(typeRatings).forEach(type => {
            avgRatingByType[type] = parseFloat((typeRatings[type] / typeCounts[type]).toFixed(2))
        })

        const excelData = calculateExcelChartsData(list, log);

        return {
            totalAnime: list.length,
            animeByYear,
            episodesByYear,
            latestYear,
            sortedYears: sortedYearsAll,
            totalEpisodes: totalEpisodesSum,
            totalTime: Math.round(totalTimeSum),
            avgRating: parseFloat(avgRating.toFixed(2)),
            types,
            genres,
            studios,
            ratingDist,
            themes,
            seasons,
            statuses,
            dubs,
            avgRatingByType,
            yearStats,
            allTimeStats,
            filteredStats,
            excelData
        }
    }, [animeList, historyLog, timeFilter, customRange])

    // ==========================================
    // AIRING ANIME ASYNC SORTING
    // ==========================================
    useEffect(() => {
        if (!stats?.excelData?.airingAnime) return;
        
        let cancelled = false;
        const fetchSortKeys = async () => {
            const keys = {};
            for (const a of stats.excelData.airingAnime) {
                const malId = extractMalId(a.mal_url);
                if (!malId) continue;
                
                try {
                    // Fetch anime info which has the actual broadcast string
                    const info = await getAnimeInfo(malId);
                    if (cancelled) return;
                    
                    if (info && info.broadcast) {
                        const nextBroadcast = getNextBroadcastDate(info.broadcast);
                        if (nextBroadcast) {
                            const d = nextBroadcast;
                            const dayVal = d.getDay() || 7; // 1-7
                            const todayVal = new Date().getDay() || 7;
                            let dayDiff = dayVal - todayVal;
                            if (dayDiff < 0) dayDiff += 7;
                            
                            const h = d.getHours();
                            const m = d.getMinutes();
                            keys[malId] = (dayDiff * 10000) + (h * 100) + m;
                        }
                    }
                } catch (err) {
                    console.error("[Sort] Failed to fetch episodes for sort key", err);
                }
            }
            if (!cancelled) {
                setAiringSortKeys(prev => {
                    let changed = false;
                    for (const k in keys) {
                        if (prev[k] !== keys[k]) changed = true;
                    }
                    return changed ? { ...prev, ...keys } : prev;
                });
            }
        };
        fetchSortKeys();
        return () => { cancelled = true; };
    }, [stats?.excelData?.airingAnime]);

    const sortedAiringAnime = useMemo(() => {
        if (!stats?.excelData?.airingAnime) return [];
        return [...stats.excelData.airingAnime].sort((a, b) => {
            const keyA = airingSortKeys[extractMalId(a.mal_url)] ?? 9999999;
            const keyB = airingSortKeys[extractMalId(b.mal_url)] ?? 9999999;
            
            // If keys are same or neither has a key yet, maintain fallback sort (by start_date)
            if (keyA === keyB) {
                 const dA = a.startDate ? new Date(a.startDate).getTime() : 0;
                 const dB = b.startDate ? new Date(b.startDate).getTime() : 0;
                 return dB - dA;
            }
            return keyA - keyB;
        });
    }, [stats?.excelData?.airingAnime, airingSortKeys]);

    // ==========================================
    // EXCEL EXACT CHART CONFIGURATIONS
    // ==========================================
    const chartConfigs = useMemo(() => {
        if (!stats) return null;
        const excelData = stats.excelData;
        
        // 1. GrafTypuPop (Pie)
        const typesPieData = {
            labels: excelData.typesPie.map(t => t.label),
            datasets: [{
                data: excelData.typesPie.map(t => t.count),
                backgroundColor: excelPalettes.typesPie,
                borderWidth: 2,
                borderColor: 'rgba(10, 10, 15, 0.7)'
            }]
        };
        
        // 2. GrafTypuKombi (Bar + Line)
        const typesKombiData = {
            labels: excelData.typesKombi.map(t => t.label),
            datasets: [
                {
                    type: 'line',
                    label: 'Průměrné hodnocení',
                    data: excelData.typesKombi.map(t => parseFloat(t.rating.toFixed(2))),
                    borderColor: excelPalettes.kombiLine,
                    backgroundColor: excelPalettes.kombiLine,
                    yAxisID: 'y1',
                    tension: 0.2,
                    pointRadius: 6,
                    pointBackgroundColor: excelPalettes.kombiLine,
                    datalabels: {
                        display: true,
                        color: '#C8A632',
                        font: { weight: 'bold', size: 12 },
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        formatter: (val) => val != null ? val.toFixed(2).replace('.', ',') : ''
                    }
                },
                {
                    type: 'bar',
                    label: 'Čas sledování (h)',
                    data: excelData.typesKombi.map(t => t.hours),
                    backgroundColor: excelPalettes.kombiBar,
                    yAxisID: 'y',
                    datalabels: {
                        display: true,
                        color: '#fff',
                        font: { weight: 'bold', size: 10 },
                        anchor: 'center',
                        align: 'center',
                        formatter: (val) => {
                            const h = val.toFixed(1).replace('.', ',');
                            const days = (val / 24).toFixed(1).replace('.', ',');
                            return `${h} h\n(${days} dní)`;
                        }
                    }
                }
            ]
        };
        
        // 3. GrafTypuDist (Stacked Bar)
        const activeTypes = Object.keys(excelData.typesDistScoreMatrix[Math.max(...Object.keys(excelData.typesDistScoreMatrix))] || {});
        const distScoreLabels = [1,2,3,4,5,6,7,8,9,10];
        const typesDistData = {
            labels: activeTypes,
            datasets: distScoreLabels.map(score => ({
                label: `Skóre ${score}`,
                data: activeTypes.map(type => (excelData.typesDistScoreMatrix[score] && excelData.typesDistScoreMatrix[score][type]) || 0),
                backgroundColor: excelPalettes.scoreGradient[score] || '#94a3b8'
            }))
        };
        
        // 4. GrafStudiiPop (Pie)
        const studiosPieData = {
            labels: Object.keys(excelData.studiosPie),
            datasets: [{
                data: Object.values(excelData.studiosPie),
                backgroundColor: Object.keys(excelData.studiosPie).map((_,i) => excelPalettes.kellysMaxContrast[i % 15]), 
                borderColor: 'rgba(10, 10, 15, 0.7)',
                borderWidth: 2
            }]
        };
        
        // 5. GrafStudiiBest (Bar)
        const studiosBestData = {
            labels: excelData.studiosBest.map(s => s.name),
            datasets: [{
                data: excelData.studiosBest.map(s => s.avg),
                backgroundColor: excelPalettes.studiosBar
            }]
        };
        
        // 6. GrafAnimeSezony (Bar)
        const seasonsData = {
            labels: Object.keys(excelData.seasons),
            datasets: [{
                data: Object.values(excelData.seasons),
                backgroundColor: Object.keys(excelData.seasons).map(s => excelPalettes.seasons[s])
            }]
        };
        
        // 7. GrafAnimeVeku (Bar)
        const ageVekuData = {
            labels: Object.keys(excelData.ageGroups),
            datasets: [{
                data: Object.keys(excelData.ageGroups).map(k => excelData.ageGroups[k].count),
                backgroundColor: excelPalettes.ageBar
            }]
        };
        
        // 8. GrafPrumerVeku (Bar)
        const avgAgeData = {
            labels: Object.keys(excelData.ageAvg),
            datasets: [{
                data: Object.values(excelData.ageAvg),
                backgroundColor: excelPalettes.avgAgeBar
            }]
        };
        
        // 9. GrafTematPop (Pie)
        const tematPopData = {
            labels: excelData.topThemes.map(t => t.label),
            datasets: [{
                data: excelData.topThemes.map(t => t.count),
                 backgroundColor: excelPalettes.kellysMaxContrast
            }]
        };
        
        // 10. GrafTematBest (Bar)
        const tematBestData = {
            labels: excelData.themesBest.map(t => t.name),
            datasets: [{
                data: excelData.themesBest.map(t => t.avg),
                backgroundColor: excelPalettes.themesBar
            }]
        };
        
        // 11. GrafZanru (Pie)
        const zanruData = {
            labels: excelData.topGenres.slice(0, 15).map(g => g.label),
            datasets: [{
                data: excelData.topGenres.slice(0, 15).map(g => g.count),
                backgroundColor: excelPalettes.kellysMaxContrast,
                borderColor: 'rgba(10, 10, 15, 0.7)',
                borderWidth: 2
            }]
        };
        
        // 12. GrafZanruBest (Bar)
        const zanruBestData = {
            labels: excelData.genresBest.map(g => g.name),
            datasets: [{
                data: excelData.genresBest.map(g => g.avg),
                backgroundColor: excelPalettes.genresBestBar
            }]
        };

        // 13. GrafHodnoceniDist (Pie)
        const ratingPieData = {
            labels: ['10', '9', '8', '7', '6', '5 a méně'],
            datasets: [{
                data: [stats.ratingDist['10'], stats.ratingDist['9'], stats.ratingDist['8'], stats.ratingDist['7'], stats.ratingDist['6'], stats.ratingDist['5-']],
                backgroundColor: excelPalettes.ratingPie,
                borderColor: 'rgba(10, 10, 15, 0.7)',
                borderWidth: 2
            }]
        };

        // 14. GrafPrubehHodnoceni
        const ratingTimelineData = {
            labels: excelData.ratingTimeline.map(t => t.x),
            datasets: [
                {
                    type: 'line',
                    label: 'Klouzavý průměr (10)',
                    yAxisID: 'y',
                    data: excelData.ratingTimeline.map(t => t.movingAvg),
                    borderColor: '#ED7D31',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    type: 'scatter',
                    label: 'Hodnocení',
                    yAxisID: 'y',
                    data: excelData.ratingTimeline.map(t => ({x: t.x, y: t.rating})),
                    backgroundColor: 'rgba(91, 155, 213, 0.5)',
                    pointRadius: 3
                }
            ]
        };

        // 15. GrafHodnoceniVsEpizody (Dual-axis: bar=count, line=avg rating — Excel style)
        const epBucketsData = {
            labels: excelData.ratingByEpisodes.map(b => b.label),
            datasets: [
                {
                    type: 'bar',
                    label: 'Počet titulů',
                    data: excelData.ratingByEpisodes.map(b => b.count),
                    backgroundColor: [
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)',
                        'rgba(179, 161, 106, 0.85)'
                    ],
                    yAxisID: 'y',
                    order: 2,
                    datalabels: {
                        display: true,
                        color: '#fff',
                        font: { weight: 'bold', size: 10, family: 'Inter, sans-serif' },
                        anchor: 'center',
                        align: 'center',
                        formatter: (val, ctx) => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((val / total) * 100).toFixed(1).replace('.', ',');
                            return `# ${val}\n(${pct} %)`;
                        }
                    }
                },
                {
                    type: 'line',
                    label: 'Průměrné skóre',
                    data: excelData.ratingByEpisodes.map(b => b.avg),
                    borderColor: '#ED7D31',
                    backgroundColor: 'rgba(237, 125, 49, 0.3)',
                    borderWidth: 3,
                    pointRadius: 6,
                    pointBackgroundColor: '#ED7D31',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    yAxisID: 'y1',
                    tension: 0.3,
                    order: 1,
                    datalabels: {
                        display: true,
                        color: '#ED7D31',
                        font: { weight: 'bold', size: 12, family: 'Inter, sans-serif' },
                        anchor: 'end',
                        align: 'top',
                        offset: 6,
                        formatter: (val) => val != null ? val.toFixed(1).replace('.', ',') : ''
                    }
                }
            ]
        };

        // 16. AnimeHodnoceniVCaseGraf (Combo)
        const hoverTimeComboData = {
            labels: excelData.comboRatingByYear.map(c => c.year),
            datasets: [
                {
                    type: 'line',
                    label: 'Počet anime',
                    data: excelData.comboRatingByYear.map(c => c.count),
                    borderColor: excelPalettes.timelineCount,
                    borderDash: [5, 5],
                    yAxisID: 'y1',
                    tension: 0.3
                },
                {
                    type: 'scatter',
                    label: 'Dekádový průměr',
                    data: excelData.comboRatingByYear.map(c => c.decadeAvg ? c.decadeAvg : null),
                    backgroundColor: excelPalettes.timelineDecade,
                    borderColor: excelPalettes.timelineDecade,
                    pointRadius: 6,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Roční průměr',
                    data: excelData.comboRatingByYear.map(c => c.annualAvg),
                    borderColor: excelPalettes.timelineLine,
                    yAxisID: 'y',
                    borderWidth: 3,
                    tension: 0.4,
                    pointRadius: 0
                }
            ]
        };

        // 17. GrafStatusu (Pie)
        const statusPieLabels = Object.keys(stats.statuses).sort((a,b) => stats.statuses[b] - stats.statuses[a]);
        const statusPieData = {
            labels: statusPieLabels,
            datasets: [{
                data: statusPieLabels.map(l => stats.statuses[l]),
                backgroundColor: statusPieLabels.map((_, i) => excelPalettes.statusPie[i % excelPalettes.statusPie.length]),
                borderColor: 'rgba(10, 10, 15, 0.7)',
                borderWidth: 2
            }]
        };

        // 18. Dub charts data
        const dubCountData = {
            labels: excelData.dubCount.map(d => d.label),
            datasets: [{
                data: excelData.dubCount.map(d => d.count),
                backgroundColor: createHorizontalGradient('rgba(91, 155, 213, 0.5)', 'rgba(91, 155, 213, 0.9)')
            }]
        };

        const dubAvgRatingData = {
            labels: excelData.dubAvgRating.map(d => d.label),
            datasets: [{
                data: excelData.dubAvgRating.map(d => d.avg),
                backgroundColor: createHorizontalGradient('rgba(237, 125, 49, 0.5)', 'rgba(237, 125, 49, 0.9)')
            }]
        };

        const dubTotalTimeData = {
            labels: excelData.dubTotalTime.map(d => d.label),
            datasets: [{
                data: excelData.dubTotalTime.map(d => d.hours),
                backgroundColor: createHorizontalGradient('rgba(112, 173, 71, 0.5)', 'rgba(112, 173, 71, 0.9)')
            }]
        };

        // 19. AniList Tags (Bar)
        const tagsData = {
            labels: excelData.anilistTags.map(t => t.label),
            datasets: [{
                data: excelData.anilistTags.map(t => t.score),
                backgroundColor: createHorizontalGradient('rgba(152, 9, 53, 0.4)', 'rgba(152, 9, 53, 0.9)')
            }]
        };

        return {
            typesPieData, typesKombiData, typesDistData, studiosPieData, studiosBestData,
            seasonsData, ageVekuData, avgAgeData, tematPopData, tematBestData,
            zanruData, zanruBestData, ratingPieData, ratingTimelineData, epBucketsData,
            hoverTimeComboData, statusPieData, dubCountData, dubAvgRatingData, dubTotalTimeData,
            tagsData, activeTypes, distScoreLabels
        };
    }, [stats]);

    // Early returns AFTER all hooks (Rules of Hooks compliance)
    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání dat...</div>
    }

    if (!stats || !chartConfigs) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Žádná data k zobrazení</div>
    }

    const {
        typesPieData, typesKombiData, typesDistData, studiosPieData, studiosBestData,
        seasonsData, ageVekuData, avgAgeData, tematPopData, tematBestData,
        zanruData, zanruBestData, ratingPieData, epBucketsData,
        hoverTimeComboData, dubCountData, dubAvgRatingData, dubTotalTimeData,
        tagsData, activeTypes, distScoreLabels
    } = chartConfigs;

    const excelData = stats.excelData;

    // Shared options
    const baseOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } } };
    const barOptionsExcel = { ...baseOptions };
    const horizontalBarOptionsExcel = { ...baseOptions, indexAxis: 'y' };
    const stackedBarOptions = { ...barOptionsExcel, scales: { x: { stacked: true }, y: { stacked: true } } };
    
    const doubleAxisOptions = {
        ...baseOptions,
        plugins: { legend: { display: false }, datalabels: { display: false } },
        scales: {
            y: { type: 'linear', position: 'left', min: 0 },
            y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false } }
        }
    };
    const doubleAxisRatingOptions = {
        ...baseOptions,
        plugins: { legend: { display: false }, datalabels: { display: false }, decadeFloatingLabels: { enabled: true } },
        scales: {
            x: { type: 'category', position: 'bottom' },
            y: { type: 'linear', position: 'left', id: 'y-rating', min: 0, max: 10 },
            y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false } }
        }
    };

    // Helper pro zaokrouhlování min hodnot na násobek 0.25
    const floorTo025 = (val) => Math.floor((val - 0.25) * 4) / 4;

    // Helper functions for options
    const getOptions = (base, chartId, bgImage = null, overrides = {}) => {
        const opt = buildChartOptions(base, { legendPosition: 'hidden' });
        opt.plugins = opt.plugins || {};
        opt.plugins.legend = { display: false };
        opt.plugins.datalabels = opt.plugins.datalabels || { display: false };
        if (bgImage) {
            opt.plugins.excelImageBackground = { imagePath: bgImage };
        }
        
        opt.scales = opt.scales || {};
        if (opt.scales.x) {
            opt.scales.x.grid = {
                ...opt.scales.x.grid,
                color: 'rgba(255, 255, 255, 0.04)',
                drawBorder: false,
            };
            opt.scales.x.ticks = {
                ...opt.scales.x.ticks,
                color: 'var(--text-muted, #64748b)',
            };
        }
        if (opt.scales.y) {
            opt.scales.y.grid = {
                ...opt.scales.y.grid,
                color: 'rgba(255, 255, 255, 0.04)',
                drawBorder: false,
            };
            opt.scales.y.ticks = {
                ...opt.scales.y.ticks,
                color: 'var(--text-muted, #64748b)',
            };
        }

        if (overrides.scales) {
            // Klíč y1 přidat jen když opravdu existuje — y1: undefined způsobí
            // Chart.js chybu "Invalid scale configuration for scale: y1"
            const mergedY1 = overrides.scales.y1
                ? { ...opt.scales?.y1, ...overrides.scales.y1 }
                : opt.scales?.y1
            opt.scales = {
                ...opt.scales,
                x: { ...opt.scales?.x, ...overrides.scales.x },
                y: { ...opt.scales?.y, ...overrides.scales.y },
                ...(mergedY1 ? { y1: mergedY1 } : {})
            };
        }
        return opt;
    };

    // Pie chart options (labels inside slices — premium dark bg)
    const getPieOptions = () => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 40 },
        plugins: {
            legend: { display: false },
            excelImageBackground: false,
            tooltip: {
                ...premiumTooltipConfig,
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = ((value / total) * 100).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                        return `${label}: ${value} (${pct}%)`;
                    }
                }
            },
            datalabels: {
                color: '#fff',
                display: (context) => {
                    const value = context.dataset.data[context.dataIndex];
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    return (value / total) > 0.03;
                },
                formatter: (value, context) => {
                    const label = context.chart.data.labels[context.dataIndex];
                    if (value === 0) return null;
                    return `${label}:\n${value}`;
                },
                font: { weight: 'bold', size: 11, family: 'Inter, sans-serif' },
                textAlign: 'center',
                anchor: 'center',
                align: 'center',
                textStrokeColor: 'rgba(0, 0, 0, 0.6)',
                textStrokeWidth: 2
            }
        }
    });

    // ==========================================
    // HELPER: Render a full chart in a wrapper
    // ==========================================
    const FullChart = ({ title, className = 'standard', children }) => (
        <div className={`full-chart-wrapper ${className}`}>
            <div className="chart-title">{title}</div>
            <div className="chart-body">
                {children}
            </div>
        </div>
    )

    // ==========================================
    // HELPER: Render a mini chart preview
    // ==========================================
    const MiniChart = ({ label, children }) => (
        <div className="mini-chart-wrapper">
            <div className="mini-chart-container">
                {children}
            </div>
            {label && <div className="mini-chart-label">{label}</div>}
        </div>
    )

    // ==========================================
    // GROUP RENDERERS — Preview (mini) + Expanded (full)
    // ==========================================

    const renderGroupContent = (groupId) => {
        switch (groupId) {
            // ─── TYPES ───
            case 'types': {
                const allScoresDesc = [...distScoreLabels].reverse();
                const scoresWithData = allScoresDesc.filter(s => 
                    activeTypes.some(type => excelData.typesDistScoreMatrix[s] && excelData.typesDistScoreMatrix[s][type])
                );
                const displayScores = [...new Set([...allScoresDesc.filter(s => s >= 5), ...scoresWithData])].sort((a,b)=>b-a);

                return (
                    <>
                        <FullChart title="Rozdělení podle Typu">
                            <Pie data={typesPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Kombinovaný graf Typů (Hodiny vs Hodnocení)" className="wide">
                            <Bar data={typesKombiData} options={getOptions(doubleAxisOptions, 'GrafTypuKombi', null)} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Rozdělení Typů (Distributivní Skóre)" className="wide">
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                <div style={{ flex: 1, minHeight: 0 }}>
                                    <Bar data={{...typesDistData, datasets: typesDistData.datasets.map(ds => ({...ds, datalabels: { display: false }}))}} 
                                         options={getOptions({
                                             ...stackedBarOptions, 
                                             plugins: { ...stackedBarOptions.plugins, legend: { display: false } },
                                             scales: { 
                                                ...stackedBarOptions.scales, 
                                                x: { ...stackedBarOptions.scales.x, ticks: { display: false }, grid: { display: false } },
                                                y: { ...stackedBarOptions.scales.y, max: 250 }
                                             }
                                         }, 'GrafTypuDist', null)} />
                                </div>
                                <div style={{ overflowX: 'auto', marginTop: '-1px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ border: '1px solid var(--border-color)', width: '50px' }}></th>
                                                {activeTypes.map(t => <th key={t} style={{ border: '1px solid var(--border-color)', padding: '6px', fontSize: '0.8rem' }}>{t}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayScores.map(score => {
                                                const dataset = typesDistData.datasets.find(ds => ds.label === `Skóre ${score}`);
                                                return (
                                                <tr key={score}>
                                                    <td style={{ border: '1px solid var(--border-color)', padding: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ width: '12px', height: '12px', background: dataset?.backgroundColor, display: 'inline-block', borderRadius: '2px' }}></span>
                                                        {score}
                                                    </td>
                                                    {activeTypes.map(type => (
                                                        <td key={type} style={{ border: '1px solid var(--border-color)' }}>
                                                            {(excelData.typesDistScoreMatrix[score] && excelData.typesDistScoreMatrix[score][type]) || 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )})}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </FullChart>
                    </>
                )
            }

            // ─── STUDIOS ───
            case 'studios':
                return (
                    <>
                        <FullChart title="Graf Studií (Populace)">
                            <Pie data={studiosPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Nejlepší Studia (TOP 10)">
                            <Bar data={studiosBestData} options={getOptions(horizontalBarOptionsExcel, 'GrafStudiiBest', null, {
                                scales: { x: { min: floorTo025(Math.min(...excelData.studiosBest.map(s => s.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </FullChart>
                    </>
                )

            // ─── SEASONS & AGE ───
            case 'seasons':
                return (
                    <div className="stacked-charts-column">
                        <FullChart title="Počet Anime podle sezóny" className="short-stacked">
                            <Bar data={{
                                labels: seasonsData.labels,
                                datasets: [{ ...seasonsData.datasets[0], datalabels: { display: true, formatter: (val) => val, color: '#000', anchor: 'center', align: 'center', font: { weight: 'bold' } } }]
                            }} options={getOptions(horizontalBarOptionsExcel, 'GrafAnimeSezony', null, { scales: { x: { display: false } } })} />
                        </FullChart>
                        <FullChart title="Počet Anime podle stáří věkových skupin" className="short-stacked">
                            <Bar data={{
                                labels: ageVekuData.labels,
                                datasets: [{ ...ageVekuData.datasets[0], datalabels: { display: true, formatter: (val) => `${val}`, color: '#000', anchor: 'center', align: 'center' } }]
                            }} options={getOptions(horizontalBarOptionsExcel, 'GrafAnimeVeku', null, { scales: { x: { display: false } } })} />
                        </FullChart>
                        <FullChart title="Průměrné hodnocení věkových skupin" className="short-stacked">
                            <Bar data={{
                                labels: avgAgeData.labels,
                                datasets: [{ ...avgAgeData.datasets[0], datalabels: { display: true, formatter: (val) => `${parseFloat(val).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, color: '#000', anchor: 'center', align: 'center' } }]
                            }} options={getOptions(horizontalBarOptionsExcel, 'GrafPrumerVeku', null, {
                                scales: { x: { min: floorTo025(Math.min(...Object.values(excelData.ageAvg).filter(v => v > 0))), ticks: { stepSize: 0.25 }, display: false } }
                            })} />
                        </FullChart>
                    </div>
                )

            // ─── THEMES ───
            case 'themes':
                return (
                    <>
                        <FullChart title="Graf Témat (Populace)">
                            <Pie data={tematPopData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Nejlepší Témata (TOP 10)">
                            <Bar data={tematBestData} options={getOptions(horizontalBarOptionsExcel, 'GrafTematBest', null, {
                                scales: { x: { min: floorTo025(Math.min(...excelData.themesBest.map(h => h.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </FullChart>
                    </>
                )

            // ─── GENRES ───
            case 'genres':
                return (
                    <>
                        <FullChart title="Graf Žánrů (Populace)">
                            <Pie data={zanruData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Nejlepší Žánry (TOP 10)">
                            <Bar data={zanruBestData} options={getOptions(horizontalBarOptionsExcel, 'GrafZanruBest', null, {
                                scales: { x: { min: floorTo025(Math.min(...excelData.genresBest.map(h => h.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </FullChart>
                        <FullChart title="Chord Diagram Žánrových Vazeb" className="square">
                            <AnimeGenreChordChart data={animeList} />
                        </FullChart>
                    </>
                )

            // ─── ANILIST TAGS ───
            case 'tags': {
                const allTags = excelData.allTags || [];
                const filteredTagsList = tagSearchQuery
                    ? allTags.filter(t => t.label.toLowerCase().includes(tagSearchQuery.toLowerCase()))
                    : allTags;

                // Multi-select anime computation
                const tagAnimeMap = {};
                allTags.forEach(tag => { tagAnimeMap[tag.label] = tag.animeList; });

                let combinedAnime = [];
                if (selectedTags.size > 0) {
                    if (tagFilterMode === 'or') {
                        const seen = new Map();
                        selectedTags.forEach(tn => {
                            (tagAnimeMap[tn] || []).forEach(a => {
                                if (!seen.has(a.name)) seen.set(a.name, { ...a, tags: [tn] });
                                else seen.get(a.name).tags.push(tn);
                            });
                        });
                        combinedAnime = [...seen.values()].sort((a, b) => b.rank - a.rank);
                    } else {
                        const tagSets = [...selectedTags].map(tn => new Set((tagAnimeMap[tn] || []).map(a => a.name)));
                        if (tagSets.length > 0) {
                            const first = tagAnimeMap[[...selectedTags][0]] || [];
                            combinedAnime = first.filter(a => tagSets.every(s => s.has(a.name))).sort((a, b) => b.rank - a.rank);
                        }
                    }
                    if (excludedTags.size > 0) {
                        const excl = new Set();
                        excludedTags.forEach(tn => { (tagAnimeMap[tn] || []).forEach(a => excl.add(a.name)); });
                        combinedAnime = combinedAnime.filter(a => !excl.has(a.name));
                    }
                }

                const tagScores = excelData.anilistTags.map(t => t.score);
                const tagMinX = tagScores.length > 0 ? Math.floor((Math.min(...tagScores) - 0.25) * 4) / 4 : 0;

                // Plán 6 Ú6: vážené hodnocení vybrané kombinace tagů (stejný vzorec jako
                // Top 20 — Σ(hodnocení × rank/100) / Σ(rank/100) přes anime z aktuálního výběru)
                let selWeighted = null, selRatedCount = 0
                if (selectedTags.size > 0 && combinedAnime.length > 0) {
                    const included = new Set(combinedAnime.map(a => a.name))
                    let sumW = 0, sumWR = 0
                    const rated = new Set()
                    selectedTags.forEach(tn => {
                        (tagAnimeMap[tn] || []).forEach(a => {
                            if (!included.has(a.name) || a.rating == null) return
                            const w = a.rank / 100
                            sumW += w
                            sumWR += a.rating * w
                            rated.add(a.name)
                        })
                    })
                    selRatedCount = rated.size
                    if (sumW > 0) selWeighted = sumWR / sumW
                }

                // Plán 6 Ú6: per-bar barvy grafu podle hodnoty (bordó → zlatá) + zvýraznění
                // vybraných tagů; zaoblené pruhy a hodnoty na konci pruhu
                const tagBarScale = (f) => {
                    const c1 = [152, 9, 53], c2 = [251, 191, 36]
                    const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * f))
                    return `rgba(${c[0]},${c[1]},${c[2]},0.88)`
                }
                // Popisek osy Y ve stejné barvě jako jeho pruh, jen zesvětlený
                // (přimíchání bílé), aby zůstal čitelný na tmavém pozadí
                const tagTickScale = (f) => {
                    const c1 = [152, 9, 53], c2 = [251, 191, 36]
                    const c = c1.map((v, i) => {
                        const base = v + (c2[i] - v) * f
                        return Math.round(base + (255 - base) * 0.4)
                    })
                    return `rgb(${c[0]},${c[1]},${c[2]})`
                }
                const tagMnScore = tagScores.length ? Math.min(...tagScores) : 0
                const tagMxScore = tagScores.length ? Math.max(...tagScores) : 1
                const tagTickColors = excelData.anilistTags.map(t =>
                    tagTickScale(tagMxScore > tagMnScore ? (t.score - tagMnScore) / (tagMxScore - tagMnScore) : 1))
                const styledTagsData = {
                    labels: tagsData.labels,
                    datasets: [{
                        data: tagsData.datasets[0].data,
                        backgroundColor: excelData.anilistTags.map(t =>
                            tagBarScale(tagMxScore > tagMnScore ? (t.score - tagMnScore) / (tagMxScore - tagMnScore) : 1)),
                        borderColor: excelData.anilistTags.map(t =>
                            selectedTags.has(t.label) ? '#e2e8f0' : 'transparent'),
                        borderWidth: 1.5,
                        borderRadius: 5,
                        borderSkipped: false,
                    }]
                }
                const tagChartOptions = getOptions(horizontalBarOptionsExcel, 'GrafVazeneTagy', null, {
                    scales: {
                        x: {
                            min: tagMinX, max: 10,
                            title: { display: true, text: 'Vážený průměr hodnocení', color: '#94a3b8', font: { size: 11 } },
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(255,255,255,0.06)' }
                        },
                        y: {
                            ticks: {
                                color: (ctx) => tagTickColors[ctx.index] || '#e2e8f0',
                                font: { size: 11, weight: 600 }
                            },
                            grid: { display: false }
                        }
                    }
                })
                tagChartOptions.plugins.datalabels = {
                    display: true,
                    color: '#fff',
                    anchor: 'end',
                    align: 'start',
                    offset: 6,
                    font: { weight: 'bold', size: 10, family: 'Inter, sans-serif' },
                    formatter: (v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                }

                const handleTagClick = (label, e) => {
                    if (e && (e.ctrlKey || e.metaKey)) {
                        setExcludedTags(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });
                        setSelectedTags(prev => { const n = new Set(prev); n.delete(label); return n; });
                    } else {
                        setSelectedTags(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });
                        setExcludedTags(prev => { const n = new Set(prev); n.delete(label); return n; });
                    }
                };

                tagChartOptions.onClick = (e, elements) => {
                    if (elements && elements.length > 0) {
                        const index = elements[0].index
                        const label = tagsData?.labels?.[index]
                        if (label) {
                            handleTagClick(label, e.native || e)
                        }
                    }
                }
                tagChartOptions.onHover = (e, elements) => {
                    if (e && e.native && e.native.target) {
                        e.native.target.style.cursor = elements.length ? 'pointer' : 'default'
                    }
                }

                const handleWcClick = (label) => {
                    setSelectedTags(prev => { const n = new Set(prev); n.has(label) ? n.delete(label) : n.add(label); return n; });
                    setExcludedTags(prev => { const n = new Set(prev); n.delete(label); return n; });
                };

                return (
                    <>
                        <div className="tags-panels">
                            {/* Left: Tag Selector */}
                            <div className="tag-selector-panel">
                                <div className="tag-search-wrapper" style={{ position: 'relative' }}>
                                    <span className="tag-search-icon">🔍</span>
                                    <input type="text" className="tag-search-input" placeholder="Hledat tagy…" value={tagSearchQuery} onChange={e => setTagSearchQuery(e.target.value)} />
                                    {tagSearchQuery && (
                                        <button className="tag-search-clear" onClick={() => setTagSearchQuery('')} title="Zrušit vyhledávání">
                                            ✕
                                        </button>
                                    )}
                                </div>
                                {(selectedTags.size > 0 || excludedTags.size > 0) && (
                                    <div className="tag-filter-controls">
                                        <button className={`tag-filter-btn${tagFilterMode === 'or' ? ' active' : ''}`} onClick={() => setTagFilterMode('or')}>OR</button>
                                        <button className={`tag-filter-btn${tagFilterMode === 'and' ? ' active' : ''}`} onClick={() => setTagFilterMode('and')}>AND</button>
                                        <button className="tag-filter-reset" onClick={() => { setSelectedTags(new Set()); setExcludedTags(new Set()); }}>✕ Reset</button>
                                    </div>
                                )}
                                <div style={{ padding: '6px 10px', fontWeight: 600, fontSize: '0.72rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>🏷️ Tagy ({filteredTagsList.length})</span>
                                    {selectedTags.size > 0 && <span style={{ color: 'var(--accent-primary)', fontSize: '0.62rem' }}>{selectedTags.size} vybráno</span>}
                                </div>
                                <div className="tag-selector-scroll">
                                    {filteredTagsList.map((tag, i) => (
                                        <div key={i} className={`tag-selector-item${selectedTags.has(tag.label) ? ' selected' : ''}${excludedTags.has(tag.label) ? ' excluded' : ''}`}
                                            onClick={(e) => handleTagClick(tag.label, e)} title={`${tag.description || tag.label}\nKlik = vybrat | Ctrl+klik = vyloučit`}>
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.label}</span>
                                            <span className="tag-count-badge">{tag.animeList.length}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Center: Anime list */}
                            <div className="tag-anime-panel">
                                {selectedTags.size > 0 ? (
                                    <>
                                        <div className="tag-anime-header">
                                            <h4>{[...selectedTags].join(tagFilterMode === 'and' ? ' ∩ ' : ' ∪ ')}</h4>
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                                {selWeighted !== null && (
                                                    <span
                                                        className="tag-anime-count"
                                                        style={{ color: '#fbbf24', cursor: 'help' }}
                                                        title={`Vážené hodnocení vybraných tagů — Σ(moje hodnocení × rank/100) / Σ(rank/100) přes ${selRatedCount} hodnocených anime z výběru`}
                                                    >
                                                        ⚖️ {selWeighted.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{selRatedCount < 2 ? ' (málo dat)' : ''}
                                                    </span>
                                                )}
                                                <span className="tag-anime-count">{combinedAnime.length} anime</span>
                                            </div>
                                        </div>
                                        {excludedTags.size > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: 'var(--accent-red)', marginBottom: '8px', opacity: 0.8 }}>✕ Vyloučeno: {[...excludedTags].join(', ')}</div>
                                        )}
                                        <ul className="text-list-items">
                                            {combinedAnime.map((a, i) => (
                                                <li key={i}>
                                                    <span className="text-list-rank">{i + 1}.</span>
                                                    <span className="text-list-name">{a.name}</span>
                                                    <span className="text-list-value">Rank: {a.rank}%</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.85rem', flexDirection: 'column', gap: '8px' }}>
                                        <span style={{ fontSize: '2rem' }}>🏷️</span>
                                        <span>← Klikni na tagy v seznamu</span>
                                        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Ctrl+klik = vyloučit</span>
                                    </div>
                                )}
                            </div>

                            {/* Right: Bar chart */}
                            <div className="full-chart-wrapper dark-gradient" style={{ maxWidth: 'none', aspectRatio: 'unset', height: '500px' }}>
                                <div className="chart-title">Top 20 tagů (Vážené hodnocení)</div>
                                <div className="chart-body">
                                    <Bar data={styledTagsData} options={tagChartOptions} />
                                </div>
                            </div>
                        </div>

                        {/* Bottom: Spiral Word Cloud */}
                        {excelData.tagCloud && excelData.tagCloud.length > 0 && (
                            <div className="full-chart-wrapper wide" style={{ maxWidth: 'none', aspectRatio: 'unset', height: '500px' }}>
                                <div className="chart-title">☁️ Word Cloud — AniList Tagy (relevance)</div>
                                <div className="chart-body">
                                    <SpiralWordCloud tags={excelData.tagCloud} tagDescriptions={excelData.tagDescriptions} onTagClick={handleWcClick} selectedTags={selectedTags} excludedTags={excludedTags} />
                                </div>
                            </div>
                        )}
                    </>
                )
            }

            // ─── RATINGS ───
            case 'ratings': {
                // Rating Timeline with gradient background bands (Excel style)
                const ratingTimelineBandsPlugin = {
                    id: 'ratingGradientBands',
                    beforeDraw(chart) {
                        const { ctx, chartArea: { left, right } } = chart;
                        const yScale = chart.scales.y;
                        if (!yScale) return;
                        const bands = [
                            { from: 10, to: 9, color: 'rgba(34, 197, 94, 0.25)' },
                            { from: 9, to: 8, color: 'rgba(163, 230, 53, 0.18)' },
                            { from: 8, to: 7, color: 'rgba(250, 204, 21, 0.15)' },
                            { from: 7, to: 6, color: 'rgba(251, 146, 60, 0.15)' },
                            { from: 6, to: 5, color: 'rgba(239, 68, 68, 0.12)' },
                            { from: 5, to: 0, color: 'rgba(239, 68, 68, 0.22)' },
                        ];
                        bands.forEach(b => {
                            const y1 = yScale.getPixelForValue(b.from);
                            const y2 = yScale.getPixelForValue(b.to);
                            ctx.fillStyle = b.color;
                            ctx.fillRect(left, Math.min(y1, y2), right - left, Math.abs(y2 - y1));
                        });
                    }
                };

                const ratingTimelineFullData = {
                    labels: excelData.ratingTimeline.map(t => t.x),
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Hodnocení',
                            data: excelData.ratingTimeline.map(t => t.rating),
                            backgroundColor: 'rgba(30, 30, 40, 0.85)',
                            borderWidth: 0,
                            barPercentage: 1.0,
                            categoryPercentage: 1.0,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Klouzavý průměr',
                            data: excelData.ratingTimeline.map(t => t.movingAvg),
                            borderColor: '#3b82f6',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            pointRadius: 0,
                            tension: 0.3,
                            order: 1
                        }
                    ]
                };

                const ratingTimelineFullOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false },
                        tooltip: {
                            ...premiumTooltipConfig,
                            callbacks: {
                                title: (ctx) => {
                                    const item = excelData.ratingTimeline[ctx[0].dataIndex];
                                    return item ? item.title : '';
                                },
                                label: (ctx) => `${ctx.dataset.label}: ${typeof ctx.raw === 'object' ? ctx.raw.y : ctx.raw}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            ticks: {
                                color: 'rgba(255,255,255,0.5)',
                                font: { size: 8 },
                                maxRotation: 90,
                                autoSkip: true,
                                maxTicksLimit: 25
                            },
                            grid: { display: false }
                        },
                        y: {
                            min: 4,
                            max: 10,
                            ticks: { color: 'rgba(255,255,255,0.6)', stepSize: 1 },
                            grid: { color: 'rgba(255,255,255,0.06)' }
                        }
                    }
                };

                // Rating vs Episodes — dual axis options
                const epBucketsOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: true },
                        tooltip: {
                            ...premiumTooltipConfig,
                            callbacks: {
                                label: (ctx) => {
                                    if (ctx.datasetIndex === 0) return `Počet: ${ctx.raw}`;
                                    return `Průměrné skóre: ${ctx.raw?.toFixed(1).replace('.', ',')}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#e2e8f0' },
                            title: { display: true, text: 'Počet epizod', color: '#e2e8f0' }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            min: 0,
                            title: { display: true, text: 'Počet titulů', color: '#94a3b8' },
                            ticks: { color: '#94a3b8' },
                            grid: { color: 'rgba(255,255,255,0.05)' }
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            min: 0,
                            max: 10,
                            title: { display: true, text: 'Průměrné skóre', color: '#ED7D31' },
                            ticks: { color: '#ED7D31', stepSize: 1 },
                            grid: { drawOnChartArea: false }
                        }
                    }
                };

                return (
                    <>
                        <FullChart title="Rozdělení hodnocení (Populace)">
                            <Pie data={ratingPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Průběh hodnocení v čase" className="wide">
                            <Chart type="bar" data={ratingTimelineFullData} options={ratingTimelineFullOptions} plugins={[ratingTimelineBandsPlugin]} />
                        </FullChart>
                        <FullChart title="Hodnocení vs počet epizod">
                            <Chart type="bar" data={epBucketsData} options={epBucketsOptions} plugins={[ChartDataLabels]} />
                        </FullChart>
                        <FullChart title="Hodnocení v čase & Vývoj kvality" className="wide">
                            <Line data={hoverTimeComboData} options={getOptions(doubleAxisRatingOptions, 'AnimeHodnoceniVCaseGraf', null)} />
                        </FullChart>
                    </>
                )
            }

            // ─── DUB (always expanded) ───
            case 'dub':
                return (
                    <div className="dub-charts-row">
                        <div className="dub-chart-card">
                            <div className="dub-chart-title">Počet Anime</div>
                            <div className="dub-chart-body">
                                <Bar data={dubCountData} options={getOptions(horizontalBarOptionsExcel, 'GrafDabingu')} />
                            </div>
                        </div>
                        <div className="dub-chart-card">
                            <div className="dub-chart-title">Průměrné hodnocení</div>
                            <div className="dub-chart-body">
                                <Bar data={dubAvgRatingData} options={getOptions(horizontalBarOptionsExcel, 'GrafDabingAvg', null, {
                                    scales: { x: { min: excelData.dubAvgRating.length ? floorTo025(Math.min(...excelData.dubAvgRating.map(d => d.avg))) : 0 } }
                                })} />
                            </div>
                        </div>
                        <div className="dub-chart-card">
                            <div className="dub-chart-title">Celkový čas (hodiny)</div>
                            <div className="dub-chart-body">
                                <Bar data={dubTotalTimeData} options={getOptions(horizontalBarOptionsExcel, 'GrafCasDabing')} />
                            </div>
                        </div>
                    </div>
                )

            // ─── STATUS ───
            case 'status':
                return (
                    <>
                        {/* Left: mini dynamický kalendář vysílání */}
                        {sortedAiringAnime && sortedAiringAnime.length > 0 && (
                            <AiringCalendar airingAnime={sortedAiringAnime} />
                        )}

                        {/* Middle: Airing Anime with stats */}
                        {sortedAiringAnime && sortedAiringAnime.length > 0 && (
                            <div className="full-chart-wrapper text-list">
                                <div className="chart-title">📺 Právě sledované ({sortedAiringAnime.length})</div>
                                <div className="chart-body text-list-scroll">
                                    <ul className="text-list-items" style={{ gap: '4px' }}>
                                        {sortedAiringAnime.map((a, i) => (
                                            <li key={i} style={{ gap: '8px', padding: '6px 4px' }}>
                                                <JikanPoster malUrl={a.mal_url} size="large" />
                                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Link to={`/anime/${encodeURIComponent(a.name)}`} className="anime-link" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                            {a.name}
                                                        </Link>
                                                        {a.mal_url && (
                                                            <a href={a.mal_url} target="_blank" rel="noreferrer" title="Otevřít na MyAnimeList" style={{ color: '#3b82f6', fontSize: '0.7rem', textDecoration: 'none', background: 'rgba(59, 130, 246, 0.1)', padding: '1px 4px', borderRadius: '4px' }}>
                                                                MAL ↗
                                                            </a>
                                                        )}
                                                    </div>
                                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                        EP {a.watchedEps}
                                                        {a.startDate && ` • od ${new Date(a.startDate).toLocaleDateString('cs-CZ')}`}
                                                    </span>
                                                    <AiringEpisodeStats malUrl={a.mal_url} animeName={a.name} historyLog={historyLog} episodeRatings={episodeRatings} />
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Right column: Pending */}
                        {excelData.pendingAnime && excelData.pendingAnime.length > 0 && (
                            <div className="full-chart-wrapper text-list">
                                <div className="chart-title">⏳ Pending ({excelData.pendingAnime.length})</div>
                                <div className="chart-body text-list-scroll">
                                    <ul className="text-list-items">
                                        {excelData.pendingAnime.map((a, i) => (
                                            <li key={i} style={{ gap: '8px' }}>
                                                <JikanPoster malUrl={a.mal_url} />
                                                <span className="text-list-rank">{i + 1}.</span>
                                                <span className="text-list-name marquee-container">
                                                    <Link to={`/anime/${encodeURIComponent(a.name)}`} className="marquee-link">
                                                        <span className="marquee-text">{a.name}</span>
                                                    </Link>
                                                </span>
                                                {a.episodes > 0 && <span className="text-list-value">{a.episodes} ep</span>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </>
                )

            // ─── LATEST / BINGE / LONGEST ───
            case 'lists':
                return (
                    <>
                        <div className="full-chart-wrapper text-list">
                            <div className="chart-title">🕐 Poslední zhlédnuté</div>
                            <div className="chart-body text-list-scroll">
                                <ul className="text-list-items">
                                    {excelData.latestWatched.map((a, i) => (
                                        <li key={i}>
                                            <span className="text-list-rank">{i + 1}.</span>
                                            <Link to={`/anime/${encodeURIComponent(a.name)}`} className="text-list-name anime-link">{a.name}</Link>
                                            <span className="text-list-value">
                                                {a.startDate && new Date(a.startDate).toLocaleDateString('cs-CZ')}
                                                {a.startDate && a.endDate && ' → '}
                                                {a.endDate && new Date(a.endDate).toLocaleDateString('cs-CZ')}
                                                {a.totalTime > 0 && ` • ${toCS((a.totalTime / 60).toFixed(1))}h`}
                                                {a.rating && ` • ⭐ ${toCS(a.rating)}`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="full-chart-wrapper text-list">
                            <div className="chart-title">🔥 Nejrychlejší Binge</div>
                            <div className="chart-body text-list-scroll">
                                <ul className="text-list-items">
                                    {excelData.fastestBinge.map((a, i) => (
                                        <li key={i}>
                                            <span className="text-list-rank">{i + 1}.</span>
                                            <Link to={`/anime/${encodeURIComponent(a.name)}`} className="text-list-name anime-link">{a.name}</Link>
                                            <span className="text-list-value">{a.minPerDay} min/den • {a.days}d • {a.totalHours}h</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div className="full-chart-wrapper text-list">
                            <div className="chart-title">⏱️ Nejdelší série</div>
                            <div className="chart-body text-list-scroll">
                                <ul className="text-list-items">
                                    {excelData.longestSeries.map((s, i) => (
                                        <li key={i}>
                                            <span className="text-list-rank">{i + 1}.</span>
                                            <Link to={`/anime?series=${encodeURIComponent(s.name)}`} className="text-list-name anime-link">{s.name}</Link>
                                            <span className="text-list-value">
                                                {toCS(s.hours)}h ({toCS(s.days)}d) • {s.totalEps} ep • {s.parts} {s.parts === 1 ? 'díl' : s.parts <= 4 ? 'díly' : 'dílů'}
                                                {s.avgRating && ` • ⭐ ${toCS(s.avgRating)}`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </>
                )

            default:
                return null
        }
    }

    const renderGroupPreview = (groupId) => {
        // Helper for progress bar
        const getBarFill = (val, max) => ({ width: `${Math.min(100, (val / max) * 100)}%` });

        switch (groupId) {
            case 'types': {
                const all = Object.entries(stats.types).sort((a,b) => b[1] - a[1]);
                const data = all.slice(0, 5);
                const max = data[0]?.[1] || 1;
                return (
                    <div className="preview-premium-grid">
                        {data.map(([type, count], i) => (
                            <div key={i} className="preview-data-item">
                                <div className="preview-item-info">
                                    <span className="name">{type}</span>
                                    <span className="meta">{count} anime</span>
                                </div>
                                <div className="preview-item-bar-bg">
                                    <div className="preview-item-bar-fill bar-types" style={getBarFill(count, max)} />
                                </div>
                            </div>
                        ))}
                        {all.length > 5 && (
                            <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: 0 }}>
                                a dalších {all.length - 5}…
                            </div>
                        )}
                    </div>
                )
            }
            case 'studios': {
                const allStudios = Object.entries(excelData.studiosPie).sort((a,b) => b[1] - a[1]);
                const data = allStudios.slice(0, 5);
                const max = data[0]?.[1] || 1;
                return (
                    <div className="preview-premium-grid">
                        {data.map(([name, count], i) => (
                            <div key={i} className="preview-data-item">
                                <div className="preview-item-info">
                                    <span className="name">{name}</span>
                                    <span className="meta">{count} anime</span>
                                </div>
                                <div className="preview-item-bar-bg">
                                    <div className="preview-item-bar-fill bar-studios" style={getBarFill(count, max)} />
                                </div>
                            </div>
                        ))}
                        {allStudios.length > 5 && (
                            <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: 0 }}>
                                a dalších {allStudios.length - 5}…
                            </div>
                        )}
                    </div>
                )
            }
            case 'seasons':
                return (
                    <div className="preview-premium-grid row">
                        <div className="preview-data-column">
                            {Object.entries(excelData.seasons).sort((a,b) => b[1] - a[1]).map(([season, count], i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank" style={{color: `var(--season-${season.toLowerCase()})`}}>•</span>
                                    <span className="name">{season}</span>
                                    <span className="meta">{count}</span>
                                </div>
                            ))}
                        </div>
                        <div className="preview-data-column">
                            {Object.entries(excelData.ageGroups).slice(0, 5).map(([group, d], i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank">{i+1}.</span>
                                    <span className="name">{group}</span>
                                    <span className="meta">{d.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            case 'themes': {
                const data = excelData.topThemes.slice(0, 5);
                const max = data[0]?.count || 1;
                return (
                    <div className="preview-premium-grid">
                        {data.map((t, i) => (
                            <div key={i} className="preview-data-item">
                                <div className="preview-item-info">
                                    <span className="name">{t.label}</span>
                                    <span className="meta">{t.count} anime</span>
                                </div>
                                <div className="preview-item-bar-bg">
                                    <div className="preview-item-bar-fill bar-themes" style={getBarFill(t.count, max)} />
                                </div>
                            </div>
                        ))}
                        {excelData.topThemes.length > 5 && (
                            <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: 0 }}>
                                a dalších {excelData.topThemes.length - 5}…
                            </div>
                        )}
                    </div>
                )
            }
            case 'genres': {
                const data = excelData.topGenres.slice(0, 5);
                const max = data[0]?.count || 1;
                return (
                    <div className="preview-premium-grid">
                        {data.map((g, i) => (
                            <div key={i} className="preview-data-item">
                                <div className="preview-item-info">
                                    <span className="name">{g.label}</span>
                                    <span className="meta">{g.count} anime</span>
                                </div>
                                <div className="preview-item-bar-bg">
                                    <div className="preview-item-bar-fill bar-genres" style={getBarFill(g.count, max)} />
                                </div>
                            </div>
                        ))}
                        {excelData.topGenres.length > 5 && (
                            <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: 0 }}>
                                a dalších {excelData.topGenres.length - 5}…
                            </div>
                        )}
                    </div>
                )
            }
            case 'tags': {
                const sortedTags = [...excelData.allTags].sort((a, b) => b.animeList.length - a.animeList.length);
                const topTags = sortedTags.slice(0, 5);
                const tagMax = topTags[0]?.animeList.length || 1;
                return (
                    <div className="preview-premium-grid">
                        {topTags.map((tag, i) => (
                            <div key={i} className="preview-data-item">
                                <div className="preview-item-info">
                                    <span className="name">{tag.label}</span>
                                    <span className="meta">{tag.animeList.length} anime</span>
                                </div>
                                <div className="preview-item-bar-bg">
                                    <div className="preview-item-bar-fill bar-types" style={getBarFill(tag.animeList.length, tagMax)} />
                                </div>
                            </div>
                        ))}
                        <div className="preview-tags-cloud-lite" style={{ marginTop: '2px' }}>
                            {sortedTags.slice(5, 22).map((tag, i) => (
                                <span key={i} className="preview-tag-badge">
                                    {tag.label} <small>({tag.animeList.length})</small>
                                </span>
                            ))}
                        </div>
                        <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: 0 }}>
                            z celkem {excelData.allTags.length} tagů…
                        </div>
                    </div>
                )
            }
            case 'ratings': {
                const ratingEntries = [10, 9, 8, 7, 6, 5].map(r => ({ label: r, count: stats.ratingDist[r] || 0 }));
                const max = Math.max(...ratingEntries.map(e => e.count)) || 1;
                
                // Calculate Standard Deviation
                const avg = stats.avgRating || 0;
                let sumOfSquares = 0;
                let totalRatings = 0;
                if (stats.ratingDist) {
                    for (const [rStr, count] of Object.entries(stats.ratingDist)) {
                        const r = parseFloat(rStr);
                        if (!isNaN(r)) {
                            sumOfSquares += count * Math.pow(r - avg, 2);
                            totalRatings += count;
                        }
                    }
                }
                const variance = totalRatings > 0 ? sumOfSquares / totalRatings : 0;
                const stdDev = Math.sqrt(variance).toFixed(2);

                const timelineData = excelData.ratingTimeline || [];
                
                // Dynamicky vypočítat zoom osy Y podle všech dat (šedých i průměru) aby nedošlo k ořezu
                const minVal = timelineData.length ? Math.min(...timelineData.map(d => Math.min(d.rating, d.movingAvg))) : 1;
                const maxVal = timelineData.length ? Math.max(...timelineData.map(d => Math.max(d.rating, d.movingAvg))) : 10;
                
                // Přidáme malý padding (0.2), aby se graf úplně nedotýkal hran, ale stále vyplňoval maximum místa
                const yMin = Math.max(1, minVal - 0.2);
                const yMax = Math.min(10, maxVal + 0.2);

                const timelineChartData = {
                    labels: timelineData.map(d => d.date || d.x),
                    datasets: [
                        {
                            label: 'Hodnocení',
                            data: timelineData.map(d => d.rating),
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            fill: false,
                            tension: 0,
                            order: 2
                        },
                        {
                            label: 'Klouzavý průměr',
                            data: timelineData.map(d => d.movingAvg),
                            borderColor: 'rgba(167, 139, 250, 0.8)',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            pointBackgroundColor: '#a78bfa',
                            fill: false,
                            tension: 0.4,
                            order: 1
                        }
                    ]
                };
                
                const timelineChartOptions = {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 10, bottom: 20, left: 5, right: 5 }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...premiumTooltipConfig,
                            callbacks: {
                                title: (ctx) => {
                                    const item = timelineData[ctx[0].dataIndex];
                                    return item ? `${item.title} (${item.date})` : '';
                                },
                                label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}`
                            }
                        },
                        datalabels: { display: false }
                    },
                    scales: {
                        x: { 
                            display: true, 
                            grid: { display: false, drawBorder: false, tickLength: 0 },
                            ticks: { 
                                autoSkip: false,
                                color: 'rgba(255, 255, 255, 0.4)', 
                                font: { size: 9 }, 
                                padding: 0,
                                maxRotation: 0,
                                callback: function(val, index) {
                                    const total = timelineData.length;
                                    if (total <= 5) return this.getLabelForValue(val);
                                    if (index === 0) return this.getLabelForValue(val);
                                    if (index === total - 1) return this.getLabelForValue(val);
                                    const step = Math.floor(total / 4);
                                    if (index % step === 0 && index !== 0 && index < total - step/2) {
                                        return this.getLabelForValue(val);
                                    }
                                    return null;
                                }
                            }
                        },
                        y: { 
                            display: false,
                            min: yMin,
                            max: yMax
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    }
                };

                return (
                    <div className="preview-premium-grid" style={{ height: '100%' }}>
                        {ratingEntries.map((e, i) => (
                            <div key={i} className="preview-rating-row">
                                <span className="preview-rating-label">{e.label}</span>
                                <div className="preview-rating-bar-container">
                                    <div className="preview-rating-bar-fill" style={getBarFill(e.count, max)} />
                                </div>
                                <span className="preview-rating-count">{e.count} anime</span>
                            </div>
                        ))}
                        <div className="preview-more-indicator" style={{ border: 'none', textAlign: 'left', padding: '0 4px', display: 'flex', justifyContent: 'space-between', marginTop: 4, zIndex: 2, position: 'relative' }}>
                            <span>Průměr: <strong style={{color: 'var(--accent-amber)'}}>{toCS(stats.avgRating)}</strong></span>
                            <span>Odchylka (σ): <strong style={{color: 'var(--text-muted)'}}>{toCS(stdDev)}</strong></span>
                        </div>
                        <div style={{ flex: 1, minHeight: '100px', position: 'relative', marginTop: '6px' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                                <Line data={timelineChartData} options={timelineChartOptions} />
                            </div>
                        </div>
                    </div>
                )
            }
            case 'status': {
                // Status-relevant stats
                return (
                    <div className="preview-status-grid">
                        <div className="preview-list-column">
                            <div className="preview-status-airing-title">
                                📺 Právě sledované ({sortedAiringAnime.length})
                            </div>
                            {sortedAiringAnime.slice(0, 5).map((a, i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank" style={{ color: '#34d399' }}>{i + 1}.</span>
                                    <span className="name">{a.name}</span>
                                    <span className="meta" style={{ color: '#34d399', fontWeight: 600 }}>EP {a.watchedEps}</span>
                                </div>
                            ))}
                            {sortedAiringAnime.length > 5 && <div className="preview-more-indicator">a dalších {sortedAiringAnime.length - 5}…</div>}
                        </div>
                        <div className="preview-list-column">
                            <div className="preview-status-pending-title">
                                ⏳ Plánované ({excelData.pendingAnime?.length || 0})
                            </div>
                            {(excelData.pendingAnime || []).slice(0, 5).map((a, i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank" style={{ color: '#a78bfa' }}>{i + 1}.</span>
                                    <span className="name">{a.name}</span>
                                </div>
                            ))}
                            {(excelData.pendingAnime || []).length > 5 && <div className="preview-more-indicator">a dalších {excelData.pendingAnime.length - 5}…</div>}
                        </div>
                    </div>
                )
            }
            case 'lists':
                return (
                    <div className="preview-lists-grid">
                        <div className="preview-list-column">
                            <div className="preview-list-column-title latest">🕐 Poslední</div>
                            {excelData.latestWatched.slice(0, 5).map((a, i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank">{i + 1}.</span>
                                    <span className="name">{a.name}</span>
                                    {a.rating && <span className="meta">⭐{toCS(a.rating)}</span>}
                                </div>
                            ))}
                            {excelData.latestWatched.length > 5 && <div className="preview-more-indicator">a dalších {excelData.latestWatched.length - 5}…</div>}
                        </div>
                        <div className="preview-list-column">
                            <div className="preview-list-column-title binge">🔥 Binge</div>
                            {excelData.fastestBinge.slice(0, 5).map((a, i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank">{i + 1}.</span>
                                    <span className="name">{a.name}</span>
                                    <span className="meta">{a.days}d</span>
                                </div>
                            ))}
                            {excelData.fastestBinge.length > 5 && <div className="preview-more-indicator">a dalších {excelData.fastestBinge.length - 5}…</div>}
                        </div>
                        <div className="preview-list-column">
                            <div className="preview-list-column-title longest">⏱️ Nejdelší</div>
                            {excelData.longestSeries.slice(0, 5).map((s, i) => (
                                <div key={i} className="preview-list-item">
                                    <span className="rank">{i + 1}.</span>
                                    <span className="name">{s.name}</span>
                                    <span className="meta">{toCS(s.hours)}h</span>
                                </div>
                            ))}
                            {excelData.longestSeries.length > 5 && <div className="preview-more-indicator">a dalších {excelData.longestSeries.length - 5}…</div>}
                        </div>
                    </div>
                )
            default:
                return null
        }
    }

    const parseRewatchDate = (dateStr, animeName) => {
        const May2019 = new Date('2019-05-01').getTime();
        const Jan2025 = new Date('2025-01-01').getTime();

        const getFirstWatchTime = () => {
            const anime = animeList.find(a => a.name.toLowerCase() === animeName.toLowerCase());
            if (anime) {
                const dateVal = anime.end_date || anime.start_date || anime.release_date;
                if (dateVal && dateVal !== 'X') {
                    const d = new Date(dateVal);
                    if (!isNaN(d.getTime())) return d.getTime();
                }
            }
            return 0;
        };

        if (!dateStr || dateStr.includes('netuším')) {
            const firstWatchTime = getFirstWatchTime();
            if (firstWatchTime > 0) {
                if (firstWatchTime < May2019) {
                    return new Date('2019-04-30').getTime();
                }
                if (firstWatchTime >= Jan2025) {
                    return firstWatchTime + (15 * 24 * 60 * 60 * 1000);
                }
                return firstWatchTime + (24 * 60 * 60 * 1000);
            }
            return new Date('2019-04-30').getTime();
        }

        const rangeParts = dateStr.split('-');
        let cleanDateStr = rangeParts[rangeParts.length - 1].trim();
        const dotsParts = cleanDateStr.split('.');
        if (dotsParts.length === 3) {
            const d = parseInt(dotsParts[0].trim(), 10);
            const m = parseInt(dotsParts[1].trim(), 10) - 1;
            const y = parseInt(dotsParts[2].trim(), 10);
            if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                return new Date(y, m, d).getTime();
            }
        }
        return 0;
    };

    const renderRewatchTimeline = (rawText, selectedYear = 'all') => {
        if (!rawText) return null;
        
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const parsedItems = [];
        
        lines.forEach((line, idx) => {
            const match = line.match(/^(\d+)\.\s*Rewatch;\s*(.+?)\s*\(([^)]+)\)$/);
            if (match) {
                const rewatchNum = parseInt(match[1], 10);
                const animeName = match[2].trim();
                const dateStr = match[3].trim();
                
                const animeEntry = animeList.find(a => a.name.toLowerCase() === animeName.toLowerCase());
                const thumbnail = animeEntry?.thumbnail || null;
                const series = animeEntry?.series || null;
                const dateVal = parseRewatchDate(dateStr, animeName);
                
                parsedItems.push({
                    originalIndex: idx,
                    rewatchNum,
                    name: animeName,
                    dateStr,
                    dateVal,
                    series,
                    thumbnail,
                    animeEntry
                });
            } else {
                const animeEntry = animeList.find(a => a.name.toLowerCase() === line.toLowerCase());
                parsedItems.push({
                    originalIndex: idx,
                    rewatchNum: 1,
                    name: line,
                    dateStr: 'netuším přesně',
                    dateVal: parseRewatchDate('netuším přesně', line),
                    series: animeEntry?.series || null,
                    thumbnail: animeEntry?.thumbnail || null,
                    animeEntry
                });
            }
        });
        
        parsedItems.sort((a, b) => (a.dateVal - b.dateVal) || (a.originalIndex - b.originalIndex));
        
        const filteredItems = parsedItems.filter(item => {
            if (selectedYear === 'all') return true;
            const yearStr = String(selectedYear);
            if (item.dateStr && item.dateStr.includes(yearStr)) return true;
            if (item.dateVal) {
                const itemYear = new Date(item.dateVal).getFullYear();
                if (String(itemYear) === yearStr) return true;
            }
            return false;
        });
        
        const groups = [];
        let currentSeries = null;
        let currentGroup = [];
        
        filteredItems.forEach((item) => {
            if (item.series) {
                if (item.series === currentSeries) {
                    currentGroup.push(item);
                } else {
                    if (currentGroup.length > 0) {
                        groups.push({
                            isSeries: currentGroup.length > 1,
                            seriesName: currentSeries,
                            items: currentGroup
                        });
                    }
                    currentSeries = item.series;
                    currentGroup = [item];
                }
            } else {
                if (currentGroup.length > 0) {
                    groups.push({
                        isSeries: currentGroup.length > 1,
                        seriesName: currentSeries,
                        items: currentGroup
                    });
                }
                currentSeries = null;
                currentGroup = [];
                groups.push({
                    isSeries: false,
                    items: [item]
                });
            }
        });
        
        if (currentGroup.length > 0) {
            groups.push({
                isSeries: currentGroup.length > 1,
                seriesName: currentSeries,
                items: currentGroup
            });
        }
        
        const renderCard = (item, key) => {
            const rewatchBadgeClass = item.rewatchNum === 1 
                ? 'rewatch-1' 
                : item.rewatchNum === 2 
                    ? 'rewatch-2' 
                    : 'rewatch-3plus';
                    
            return (
                <div key={key} className="rewatch-card">
                    <div className="rewatch-card-thumb-wrapper">
                        <span className={`rewatch-card-badge ${rewatchBadgeClass}`}>
                            {item.rewatchNum}. rewatch
                        </span>
                        {item.thumbnail ? (
                            <img 
                                src={item.thumbnail.replace(/#/g, '%23')} 
                                alt={item.name} 
                                className="rewatch-card-thumb" 
                                loading="lazy"
                            />
                        ) : (
                            <div className="rewatch-card-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Bez obrázku
                            </div>
                        )}
                        <div className="rewatch-card-hover-actions">
                            {item.animeEntry?.mal_url && (
                                <a 
                                    href={item.animeEntry.mal_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="rewatch-action-btn mal"
                                    title="Otevřít na MyAnimeList"
                                >
                                    MAL
                                </a>
                            )}
                            <Link 
                                to={`/anime/${encodeURIComponent(item.name)}`} 
                                className="rewatch-action-btn detail"
                                title="Zobrazit detail v aplikaci"
                            >
                                Detail
                            </Link>
                        </div>
                    </div>
                    <div className="rewatch-card-title" title={item.name}>
                        {item.name}
                    </div>
                    <div className="rewatch-card-date" title={item.dateStr}>
                        <span>📅</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.dateStr}
                        </span>
                    </div>
                </div>
            );
        };
        
        return (
            <RewatchAutoScroll className="rewatch-timeline-container">
                {groups.map((group, groupIdx) => {
                    if (group.isSeries) {
                        return (
                            <div key={groupIdx} className="rewatch-series-box">
                                <div className="rewatch-series-header">
                                    <span className="rewatch-series-icon">🎬</span>
                                    <span className="rewatch-series-title">{group.seriesName}</span>
                                </div>
                                <div className="rewatch-series-items">
                                    {group.items.map((item, idx) => renderCard(item, `${groupIdx}-${idx}`))}
                                </div>
                            </div>
                        );
                    } else {
                        return group.items.map((item, idx) => renderCard(item, `${groupIdx}-${idx}`));
                    }
                })}
            </RewatchAutoScroll>
        );
    };

    return (

        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ margin: 0 }}>Dashboard</h2>
                <a
                    href="https://notebooklm.google.com/notebook/54e7fa34-caef-4aeb-a895-ea57e56845ea"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="echidna-notebook-container"
                >
                    <div className="echidna-chat-bubble">
                        Zdravím. Jsem Echidna, Čarodějka Chamtivosti. Mám tu čest spravovat Patrikův osobní archiv. Nalezneš tu vše od detailních statistik až po jeho komplexní hodnocení a faktické rozbory jednotlivých děl. Zkrátka ucelený záznam jeho cesty světem anime. Máš stejnou žízeň po poznání jako my? Ptej se, ráda tě tu provedu.
                    </div>
                    <img 
                        src="images/echidna.jpg" 
                        alt="Echidna" 
                        className="echidna-avatar"
                    />
                    <div className="notebook-btn">
                        🤖 NotebookLM Chatbot
                    </div>
                </a>
            </div>

            {/* Time Filter */}
            <div className="time-filter">
                <label title="Časové období aktualizuje grafy">📅 Časový filtr (pro grafy):</label>
                <select
                    value={timeFilter}
                    onChange={e => setTimeFilter(e.target.value)}
                    className="select"
                >
                    <option value="all">Vše</option>
                    {stats.sortedYears.map(y => (
                        <option key={y} value={String(y)}>{y}</option>
                    ))}
                    <option value="custom">Vlastní rozsah</option>
                </select>
                {timeFilter === 'custom' && (
                    <>
                        <input
                            type="date"
                            value={customRange.start}
                            onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                        <span>—</span>
                        <input
                            type="date"
                            value={customRange.end}
                            onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                    </>
                )}
            </div>

            {/* Stats Table — Excel-style */}
            {(() => {
                const formatMins = (mins) => {
                    const h = Math.floor(mins / 60)
                    const m = Math.round(mins % 60)
                    return `${h}:${String(m).padStart(2, '0')}`
                }
                const formatDays = (mins) => {
                    const totalH = mins / 60
                    const days = Math.floor(totalH / 24)
                    const hours = Math.round(totalH % 24)
                    return `${days} dní ${hours} hodin`
                }
                const yearCols = stats.sortedYears.slice(-3)
                const all = stats.allTimeStats
                const ys = stats.yearStats
                const getYear = (dateStr) => { if (!dateStr) return null; return new Date(dateStr).getFullYear() }
                const getFromStatsData = (label, yearIdx) => {
                    if (!statsData || !statsData.dashboard_table) return null
                    const row = statsData.dashboard_table.find(r => r[0].toLowerCase().includes(label.toLowerCase()))
                    if (!row) return null
                    if (yearIdx === -1) return row[1]
                    const year = yearCols[yearIdx]
                    const headerRow = statsData.dashboard_table[0]
                    const colIdx = headerRow.findIndex(h => h.includes(String(year)))
                    return colIdx !== -1 ? row[colIdx] : null
                }

                const getComment = (key, year) => {
                    if (!statsData || !statsData.comments || !statsData.comments[key]) return null
                    return year === 'total' ? statsData.comments[key].total : statsData.comments[key][year]
                }

                const rows = [
                    {
                        label: 'Čas sledování (hh:mm)',
                        all: getFromStatsData('Čas sledování (hh:mm)', -1) || formatMins(all.totalMins),
                        years: yearCols.map((y, idx) => getFromStatsData('Čas sledování (hh:mm)', idx) || formatMins(ys[y]?.totalMins || 0)),
                        commentAll: getComment('total_time', 'total'),
                        commentYears: yearCols.map(y => getComment('total_time', String(y)))
                    },
                    {
                        label: 'Čas sledování (dny)',
                        all: getFromStatsData('dny', -1) || formatDays(all.totalMins),
                        years: yearCols.map((y, idx) => getFromStatsData('dny', idx) || formatDays(ys[y]?.totalMins || 0))
                    },
                    {
                        label: 'Počet zhlédnutých epizod',
                        all: getFromStatsData('epizod', -1) || all.totalEps.toLocaleString('cs-CZ'),
                        years: yearCols.map((y, idx) => getFromStatsData('epizod', idx) || (ys[y]?.totalEps || 0).toLocaleString('cs-CZ')),
                        commentAll: getComment('total_episodes', 'total'),
                        commentYears: yearCols.map(y => getComment('total_episodes', String(y)))
                    },
                    {
                        label: 'Prům. délka (min)',
                        all: toCS(getFromStatsData('Průměrná délka', -1)?.replace(',', '.') || all.avgEpDur.toFixed(1)),
                        years: yearCols.map((y, idx) => toCS(getFromStatsData('Průměrná délka', idx)?.replace(',', '.') || (ys[y]?.avgEpDur || 0).toFixed(1)))
                    },
                    {
                        label: 'Počet Rewatchů',
                        all: getFromStatsData('Počet Rewatchů', -1) || all.rewatchCount,
                        years: yearCols.map((y, idx) => getFromStatsData('Počet Rewatchů', idx) || ys[y]?.rewatchCount || 0),
                        commentAll: getComment('rewatch_count', 'total'),
                        commentYears: yearCols.map(y => getComment('rewatch_count', String(y)))
                    },
                    {
                        label: 'Celkový počet Anime',
                        all: getFromStatsData('Celkový počet', -1) || all.count,
                        years: yearCols.map((y, idx) => getFromStatsData('Celkový počet', idx) || ys[y]?.count || 0)
                    },
                    {
                        label: 'Průměrné hodnocení', all: toCS(stats.avgRating), years: yearCols.map(y => {
                            const yAnime = animeList.filter(a => getYear(a.start_date) === y).filter(a => a.rating && !isNaN(parseFloat(a.rating)))
                            return yAnime.length ? toCS((yAnime.reduce((s, a) => s + parseFloat(a.rating), 0) / yAnime.length).toFixed(2)) : '-'
                        })
                    }
                ]

                return (
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>📊 Sledovaní Anime — Data projekt</h3>

                        {/* DESKTOP TABLE */}
                        <div className="hide-mobile" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                                        <th style={{ width: '20%', textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)' }}>Sledovaná data</th>
                                        <th style={{ width: '20%', textAlign: 'center', padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '4px 4px 0 0' }}>Za celou dobu</th>
                                        {yearCols.map(y => (
                                            <th key={y} style={{ width: '20%', textAlign: 'center', padding: '8px 12px', background: 'rgba(16,185,129,0.08)' }}>Za rok {y}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => {
                                        const isRewatch = row.label === 'Počet Rewatchů'
                                        const isRowExpanded = expandedNote && !expandedNote.isRewatch && expandedNote.rowIndex === i

                                        return (
                                            <Fragment key={i}>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.label}</td>
                                                    <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: 'rgba(99,102,241,0.05)' }}>
                                                        {row.all}
                                                        {row.commentAll && (
                                                            <span
                                                                style={{ marginLeft: '6px', cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-all` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                onClick={() => toggleNote(i, 'all', row.commentAll, isRewatch)}
                                                                title="Zobrazit poznámku"
                                                            >
                                                                <InfoIcon />
                                                            </span>
                                                        )}
                                                    </td>
                                                    {row.years.map((v, j) => (
                                                        <td key={j} style={{ textAlign: 'center', padding: '8px 12px' }}>
                                                            {v}
                                                            {row.commentYears?.[j] && (
                                                                <span
                                                                    style={{ marginLeft: '6px', cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-${j}` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                    onClick={() => toggleNote(i, j, row.commentYears[j], isRewatch)}
                                                                    title="Zobrazit poznámku"
                                                                >
                                                                    <InfoIcon />
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>

                                                {/* Expanded Note Row */}
                                                {expandedNote && expandedNote.rowIndex === i && (
                                                    <tr style={{ backgroundColor: 'rgba(99,102,241,0.03)' }}>
                                                        {expandedNote.isRewatch ? (
                                                            <td colSpan={2 + yearCols.length} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                                                {(() => {
                                                                    const colId = expandedNote.id.split('-')[1];
                                                                    const selectedYear = colId === 'all' ? 'all' : yearCols[parseInt(colId, 10)];
                                                                    return renderRewatchTimeline(expandedNote.text, selectedYear);
                                                                })()}
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td style={{ borderBottom: '1px solid var(--border-color)' }}></td>
                                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', textAlign: 'center' }}>
                                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                                        {row.commentAll}
                                                                    </div>
                                                                </td>
                                                                {row.years.map((_, j) => (
                                                                    <td key={j} style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', textAlign: 'center' }}>
                                                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                                            {row.commentYears?.[j]}
                                                                        </div>
                                                                    </td>
                                                                ))}
                                                            </>
                                                        )}
                                                    </tr>
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* MOBILE CARDS */}
                        <div className="hide-desktop" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {rows.map((row, i) => {
                                const isRewatch = row.label === 'Počet Rewatchů'
                                const isRowExpanded = expandedNote && !expandedNote.isRewatch && expandedNote.rowIndex === i

                                return (
                                    <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                        <div style={{ background: 'rgba(99,102,241,0.1)', padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                                            {row.label}
                                        </div>

                                        <div style={{ padding: '0 12px' }}>
                                            {/* Total Row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Za celou dobu <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Celkem)</span></span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{row.all}</span>
                                                    {row.commentAll && (
                                                        <span
                                                            style={{ cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-all` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                            onClick={() => toggleNote(i, 'all', row.commentAll, isRewatch)}
                                                        >
                                                            <InfoIcon />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {(expandedNote?.id === `${i}-all` || isRowExpanded) && row.commentAll && (
                                                isRewatch ? renderRewatchTimeline(row.commentAll, 'all') : (
                                                    <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                        {row.commentAll}
                                                    </div>
                                                )
                                            )}

                                            {/* Yearly Rows */}
                                            {row.years.map((yVal, j) => (
                                                <Fragment key={j}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: j < row.years.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{yearCols[j]}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontWeight: '500' }}>{yVal}</span>
                                                            {row.commentYears?.[j] && (
                                                                <span
                                                                    style={{ cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-${j}` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                    onClick={() => toggleNote(i, j, row.commentYears[j], isRewatch)}
                                                                >
                                                                    <InfoIcon />
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {(expandedNote?.id === `${i}-${j}` || isRowExpanded) && row.commentYears?.[j] && (
                                                        isRewatch ? renderRewatchTimeline(row.commentYears[j], yearCols[j]) : (
                                                            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: j < row.years.length - 1 ? '8px' : '0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                                {row.commentYears[j]}
                                                            </div>
                                                        )
                                                    )}
                                                </Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}


            {/* ═══════════════════════════════════════════ */}
            {/* DASHBOARD GROUPS GRID                      */}
            {/* ═══════════════════════════════════════════ */}
            <div className="dashboard-groups-grid">
                {GROUPS_CONFIG.map(group => {
                    let headerExtra = null
                    if (group.id === 'status' && stats) {
                        const statusEntries = stats.statuses || {}
                        const finishedCount = statusEntries['FINISHED'] || 0
                        headerExtra = (
                            <div className="status-header-badges" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span className="status-badge finished" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    {finishedCount}/{stats.totalAnime} Finished
                                </span>
                            </div>
                        )
                    }

                    return (
                        <DashboardGroup
                            key={group.id}
                            id={group.id}
                            title={group.title}
                            icon={group.icon}
                            isExpanded={expandedGroups.has(group.id)}
                            onToggle={() => toggleGroup(group.id)}
                            alwaysExpanded={group.alwaysExpanded || false}
                            fullWidth={group.fullWidth || false}
                            customPreview={group.customPreview || false}
                            previewContent={renderGroupPreview(group.id)}
                            headerExtra={headerExtra}
                        >
                            {renderGroupContent(group.id)}
                        </DashboardGroup>
                    )
                })}
            </div>
        </div>
    )
}

export default Dashboard
