// „Cesta Anime“ — web verze Excel modulu LIST_Watch_Overview (Plán 9, Ú3).
// Minimalizovaný pás měsíců pod tabulkou „Data projekt“; maximalizace otevře
// timeline měsíčních karet (velikost jako maximalizovaná sekce Status).
// Izolovaná featura: data si dotahuje sama (top_favorites, category_ratings),
// animeList/historyLog/episodeRatings dostává z Dashboardu, výpočty dělá
// utils/journeyCalculations.js.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { buildJourney, monthLabelShort, fmtHours } from '../utils/journeyCalculations'
import AnimeJourneyMonthModal from './AnimeJourneyMonthModal'
import { extractMalId, getAnimeInfo } from '../utils/jikanService'
import { animePath } from '../utils/animeSlug'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'
import './animeJourney.css'

// Cache pro postery v paměti (zkrátí re-rendery)
const posterMemoryCache = {}

// Cesta k předgenerované zmenšenině obálky pro minimalizovaný pás
// (tools/build_journey_thumbs.py). Dlaždice ~80 px kreslí obálku ~1000 px;
// prohlížeč ji zmenšuje >10x rychlou metodou a kresba působí měkce. Zmenšenina
// (176 px, LANCZOS) je ostrá. Fallback na originál řeší onError, kdyby chyběla.
const journeyThumb = (src) => {
    const PREFIX = 'images/anime/'
    if (!src || !src.startsWith(PREFIX)) return null
    const file = src.slice(PREFIX.length)
    if (file.includes('/')) return null
    return `${PREFIX}journey_thumbs/${file.replace(/\.(jpe?g|png|webp)$/i, '')}.jpg`
}

// Minimalizovaný pás: dlaždice 82×46 px (16:9) s diagonálním střihem 7 px.
// MINI_SLOT je rozteč, při které do sebe střihy sousedních dlaždic přesně
// zapadnou, takže pás tvoří souvislý „filmový pruh" bez mezer.
const TILE_W = 82
const TILE_SKEW = 7
const MINI_SLOT = TILE_W - TILE_SKEW

// Postery předstažené do repozitáře skriptem tools/download_journey_posters.py.
// Dřív se tahaly za běhu z Jikanu, což na cizím počítači s prázdnou cache
// znamenalo stovky dotazů přes rate limit. Index říká, pro která malId soubor
// existuje, ať prohlížeč nestřílí 404 na to, co stažené není.
let posteryIndexPromise = null
let posteryIndex = null

function nactiPosteryIndex() {
    if (!posteryIndexPromise) {
        posteryIndexPromise = fetch('data/posters_index.json')
            .then(res => (res.ok ? res.json() : []))
            .catch(() => [])
            .then(seznam => {
                posteryIndex = new Set((seznam || []).map(String))
                return posteryIndex
            })
    }
    return posteryIndexPromise
}

function lokalniPoster(malId) {
    return posteryIndex && posteryIndex.has(String(malId))
        ? `images/posters/${malId}.jpg`
        : null
}

const pluralDilo = (n) => (n === 1 ? '1 dílo' : n >= 2 && n <= 4 ? `${n} díla` : `${n} děl`)

async function fetchAniListCover(malId) {
    if (!malId) return null
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                query: `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { large medium } } }`,
                variables: { idMal: Number(malId) }
            })
        })
        if (!res.ok) return null
        const data = await res.json()
        return data?.data?.Media?.coverImage?.large || data?.data?.Media?.coverImage?.medium || null
    } catch {
        return null
    }
}

async function resolvePoster(malId, fallbackThumbnail) {
    if (!malId) return fallbackThumbnail || null
    if (posterMemoryCache[malId]) return posterMemoryCache[malId]

    // 1. Předstažený poster z repozitáře. Je okamžitý a funguje i na cizím
    // počítači, kde prohlížeč nemá nic v paměti a Jikan by nestíhal.
    await nactiPosteryIndex()
    const lokalni = lokalniPoster(malId)
    if (lokalni) {
        posterMemoryCache[malId] = lokalni
        return lokalni
    }

    try {
        const cached = localStorage.getItem('journey_poster_' + malId)
        if (cached) {
            posterMemoryCache[malId] = cached
            return cached
        }
    } catch { /* quota / SSR */ }

    // 2. Jikan (čte okamžitě ze statického anime_metadata.json / API)
    try {
        const info = await getAnimeInfo(malId)
        const jikanImg = info?.imageUrl || info?.largeImageUrl
        if (jikanImg) {
            posterMemoryCache[malId] = jikanImg
            try { localStorage.setItem('journey_poster_' + malId, jikanImg) } catch { /* noop */ }
            return jikanImg
        }
    } catch { /* proceed to AniList */ }

    // 3. Záloha: AniList GraphQL
    const anilistImg = await fetchAniListCover(malId)
    if (anilistImg) {
        posterMemoryCache[malId] = anilistImg
        try { localStorage.setItem('journey_poster_' + malId, anilistImg) } catch { /* noop */ }
        return anilistImg
    }

    // 4. Poslední záloha: vlastní náhledovka. Do localStorage se ZÁMĚRNĚ
    // neukládá. Dřív se ukládala, takže když Jikan i AniList jednou selhaly
    // (na cizím počítači běžné), zapsala se náhledovka natrvalo a poster se
    // už nikdy nedotáhl, ani když API zase začalo odpovídat. V paměti stránky
    // zůstat může, aby se dotaz neopakoval při každém překreslení.
    const fallback = fallbackThumbnail || null
    if (fallback) posterMemoryCache[malId] = fallback
    return fallback
}

function StripPoster({ anime }) {
    const malId = useMemo(() => extractMalId(anime?.mal_url), [anime?.mal_url])
    const [src, setSrc] = useState(() => {
        if (malId && posterMemoryCache[malId]) return posterMemoryCache[malId]
        if (malId) {
            // Když je index posterů už načtený, vezmi lokální soubor rovnou,
            // ať se pás nekreslí nejdřív náhledovkami a pak nepřeblikne.
            const lokalni = lokalniPoster(malId)
            if (lokalni) {
                posterMemoryCache[malId] = lokalni
                return lokalni
            }
            try {
                const cached = localStorage.getItem('journey_poster_' + malId)
                if (cached) {
                    posterMemoryCache[malId] = cached
                    return cached
                }
            } catch { /* noop */ }
        }
        return anime?.thumbnail || null
    })

    useEffect(() => {
        // Bez malId zůstává počáteční hodnota z useState (thumbnail) — nic neřešíme.
        if (!malId) return
        let cancelled = false
        resolvePoster(malId, anime?.thumbnail).then(url => {
            if (!cancelled && url) setSrc(url)
        })
        return () => { cancelled = true }
    }, [malId, anime?.thumbnail])

    if (!src) return <span className="aj-strip-ph">🎬</span>
    return <img src={src} alt="" loading="lazy" />
}

// Kompasová růžice — elegantní ikona "cesty" / "putování"
export function RoadIcon({ size = 22 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Outer ring */}
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            {/* Compass needle N-S */}
            <path d="M12 2.5 L13.5 10 L12 11.5 L10.5 10 Z" fill="currentColor" opacity="0.85" />
            <path d="M12 21.5 L13.5 14 L12 12.5 L10.5 14 Z" fill="currentColor" opacity="0.35" />
            {/* Compass needle E-W */}
            <path d="M21.5 12 L14 10.5 L12.5 12 L14 13.5 Z" fill="currentColor" opacity="0.35" />
            <path d="M2.5 12 L10 13.5 L11.5 12 L10 10.5 Z" fill="currentColor" opacity="0.55" />
            {/* Center dot */}
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
    )
}

const REASON_META = {
    top10: { icon: '🏆', label: 'Vítěz podle TOP 10 (první výskyt série)' },
    hm: { icon: '🎖️', label: 'Vítěz podle Honourable Mentions' },
    detail: { icon: '📊', label: 'Rozhodlo detailní hodnocení (kategorie/epizody)' },
    standard: { icon: '⭐', label: 'Nejlépe hodnocené anime měsíce' },
}

function ChipRow({ label, items, suffix = 'x' }) {
    if (!items?.length) return null
    return (
        <div className="aj-chip-row">
            <span className="aj-chip-label">{label}</span>
            <span className="aj-chips">
                {items.map(it => (
                    <span key={it.name} className="aj-chip">{it.name} <b>({it.n}{suffix})</b></span>
                ))}
            </span>
        </div>
    )
}

function MonthCard({ m, onOpenDetail }) {
    const reason = m.best ? REASON_META[m.best.reason] || REASON_META.standard : null
    return (
        <div className="aj-month-card" data-month={m.key}>
            <div className="aj-month-head">
                {/* Klik na název měsíce otevře podrobný rozpad v modalu.
                    Zbytek karty zůstává beze změny. */}
                <button
                    type="button"
                    className="aj-month-name aj-month-name-btn"
                    onClick={() => onOpenDetail(m.key)}
                    title={`Zobrazit detail měsíce: ${m.label}`}
                >
                    {m.label}
                </button>
                <span className="aj-month-plus">+{m.plusCount}</span>
                {m.rewatchStats?.count > 0 && (
                    <span
                        title={`Rewatch (${pluralDilo(m.rewatchStats.count)}): ${m.rewatchStats.eps} EP / ${m.rewatchStats.hoursText}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '2px', cursor: 'help', fontSize: '0.82rem' }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
                            <polyline points="1 4 1 10 7 10"></polyline>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                        </svg>
                        <b style={{ color: 'var(--accent-amber)' }}>{m.rewatchStats.count}</b>
                    </span>
                )}
                <span className="aj-month-total">celkem {m.runningTotal}</span>
            </div>

            {m.best && (
                <Link to={animePath(m.best.memberNames[0])} className="aj-best">
                    {m.best.thumbnail
                        ? <img src={m.best.thumbnail} alt="" loading="lazy" />
                        : <div className="aj-best-ph">🎬</div>}
                    <div className="aj-best-overlay">
                        <span className="aj-best-label">Nejlepší Anime</span>
                        <span className="aj-best-name">{m.best.name}</span>
                        <span className="aj-best-meta">
                            <b>{m.best.ratingText}</b>
                            <span className={`aj-badge ${m.best.isSeries ? 'series' : 'standalone'}`}>
                                {m.best.isSeries ? 'SÉRIE' : 'STANDALONE'}
                            </span>
                            <span className="aj-reason" title={reason.label}>{reason.icon}</span>
                        </span>
                    </div>
                </Link>
            )}

            <div className="aj-facts">
                {m.longest && (() => {
                    const meta = `${m.longest.hoursText}${m.longest.eps > 0 ? ` / ${m.longest.eps} EP` : ''}`
                    // Série vede na filtr v Anime Listu (stejně jako „Nejdelší série“
                    // na Dashboardu), samostatné anime rovnou do detailu — filtr série
                    // by u něj neměl co filtrovat.
                    const target = m.longest.isSeries
                        ? `/anime?series=${encodeURIComponent(m.longest.name)}`
                        : animePath(m.longest.firstName || m.longest.name)
                    return (
                        <div className="aj-fact">
                            <span
                                className="aj-fact-label"
                                title="Nejvíc odkoukaného času v měsíci podle History logu (bez rewatche). U série se sčítají všechny její díly a filmy zhlédnuté v tomto měsíci."
                            >Nejdelší</span>
                            <span className="aj-fact-value" title={`${m.longest.name} (${meta})`}>
                                <Link
                                    to={target}
                                    className="anime-link"
                                    title={m.longest.isSeries
                                        ? `Zobrazit celou sérii v Anime Listu: ${m.longest.name}`
                                        : `Otevřít detail: ${m.longest.name}`}
                                >
                                    {m.longest.name}
                                </Link>{' '}
                                <b>({meta})</b>
                            </span>
                        </div>
                    )
                })()}
                {m.watchedMins > 0 && (
                    <div className="aj-fact">
                        <span className="aj-fact-label">Nakoukáno celkem</span>
                        <span className="aj-fact-value" title="Skutečně zhlédnutý čas a počet epizod v měsíci (z History logu), včetně rozkoukaných anime">
                            <b>{fmtHours(m.watchedMins)}{m.watchedEps > 0 ? ` / ${m.watchedEps} EP` : ''}</b>
                        </span>
                    </div>
                )}
            </div>

            <div
                className="aj-chip-rows"
                title="Z anime, která jsi v měsíci koukal (z History logu, bez rewatche), ne jen z dokončených"
            >
                <ChipRow label="Typy" items={m.types} />
                <ChipRow label="Žánry" items={m.genres} />
                <ChipRow label="Témata" items={m.themes} />
                <ChipRow label="Tagy" items={m.tags} />
            </div>

            <div className="aj-strip" title="Anime dokončená v měsíci (seřazeno dle hodnocení)">
                {m.items.map(a => (
                    <Link key={a.name} to={animePath(a.name)}
                        className="aj-strip-item" title={`${a.name}${a.rating ? ` (${a.rating}/10)` : ''}`}>
                        <StripPoster anime={a} />
                    </Link>
                ))}
            </div>
        </div>
    )
}

// Idle drift běží na KOMPOZITORU přes CSS animaci (aj-drift-x) — plynulý i po
// přepnutí okna. Animace jede na VNITŘNÍ vrstvě s obsahem (.aj-mini-drag):
// vrstvu s aktivní kompozitorovou animací Chrome rasterizuje celou dopředu,
// takže první tah po načtení neodhaluje nerasterizované dlaždice (to seklo).
// Tažení animaci NIKDY neseekuje po snímcích (synchronizace s hlavním vláknem
// sekala): pauzu drží CSS třída .dragging a posun kreslí VNĚJŠÍ .aj-mini-track
// vlastním transformem. Až po puštění se JEDNÍM seekem přepíše pozice do
// animace a track se vynuluje — obojí v témže snímku, takže nic neposkočí.
function useMiniDrift(copyWidth, months, maximized) {
    const bandRef = useRef(null)
    const trackRef = useRef(null)
    const dragRef = useRef(null)
    const state = useRef({ dragging: false, moved: false, startX: 0, o0: 0, dx: 0, anim: null, raf: 0 })

    useEffect(() => {
        // maximized je v deps schválně: po maximalizaci a minimalizaci se pás
        // remountuje na nové DOM uzly, effect musí zase nastavit animaci i listenery.
        const band = bandRef.current
        const track = trackRef.current
        const drag = dragRef.current
        if (!band || !track || !drag || !copyWidth || maximized) return
        // Reset po remountu: klik na dlaždici maximalizuje pás dřív, než přijde
        // pointerup, takže by tu zůstal „duch" tažení (dragging=true), který by
        // blokoval kliky a hýbal pásem při pouhém hoveru.
        state.current = { dragging: false, moved: false, startX: 0, o0: 0, dx: 0, anim: null, raf: 0, wraf: 0, wheelDelta: 0 }
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        const duration = Math.max(24, months * 2.4)
        const durMs = duration * 1000

        drag.style.setProperty('--aj-copy-width', String(copyWidth))
        if (!reduce) {
            drag.style.animationName = 'aj-drift-x'
            drag.style.animationDuration = duration + 's'
        }

        const getAnim = () => drag.getAnimations().find(a => a.animationName === 'aj-drift-x') || null
        const mod = (v) => ((v % copyWidth) + copyWidth) % copyWidth

        const down = (e) => {
            const s = state.current
            s.dragging = true; s.moved = false; s.startX = e.clientX
            // Pointer capture ZÁMĚRNĚ až při skutečném tažení (v `move`), jinak by
            // spolkl prostý klik na kolečko a nešla by otevřít maximalizovaná Cesta.
        }
        const move = (e) => {
            const s = state.current
            if (!s.dragging) return
            if (!(e.buttons & 1)) { up(); return }   // pointerup propadl (mimo okno apod.)
            const dx = e.clientX - s.startX
            if (!s.moved && Math.abs(dx) <= 5) return   // pod prahem je to pořád klik, ne tah
            if (!s.moved) {
                s.moved = true
                // Animace se chytí JEDNOU; .dragging ji pauzne přes CSS
                // (API pause()/play() by trvale přebilo hover-pauzu).
                s.anim = getAnim()
                const ct = s.anim && typeof s.anim.currentTime === 'number' ? s.anim.currentTime : 0
                s.o0 = ((ct % durMs) / durMs) * copyWidth   // px posun v okamžiku chycení
                band.classList.add('dragging')
                try { band.setPointerCapture(e.pointerId) } catch { /* noop */ }
            }
            if (!s.anim) return             // reduced motion: bez driftu se netahá
            // Jen zápis transformu vnější vrstvy (track), škrcený na jeden za
            // snímek. Posun o celou kopii je díky zdvojenému obsahu vizuálně
            // neutrální, takže se dx nemusí nijak ořezávat.
            s.dx = dx
            if (!s.raf) {
                s.raf = requestAnimationFrame(() => {
                    s.raf = 0
                    if (!state.current.moved || !trackRef.current) return
                    const net = mod(s.o0 - s.dx)
                    trackRef.current.style.transform = `translate3d(${(s.o0 - net).toFixed(1)}px,0,0)`
                })
            }
        }
        const up = () => {
            const s = state.current
            if (!s.dragging) return
            s.dragging = false
            if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0 }
            if (s.moved && s.anim) {
                // Jediný seek za celé tažení + vynulování tracku v témže snímku
                const net = mod(s.o0 - s.dx)
                try { s.anim.currentTime = (net / copyWidth) * durMs } catch { /* noop */ }
                if (trackRef.current) trackRef.current.style.transform = ''
            }
            s.anim = null
            band.classList.remove('dragging')
        }
        // Tah nesmí propadnout jako klik na měsíc
        const click = (e) => { if (state.current.moved) { e.preventDefault(); e.stopPropagation() } }
        // Vodorovné kolečko (touchpad) posouvá pás: jeden seek za snímek.
        // Při hoveru drží pauzu CSS, takže seek jen přesune zastavený pás.
        let wheelAnim = null
        const wheel = (e) => {
            const dxw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0
            if (!dxw) return
            e.preventDefault()
            const s = state.current
            if (s.dragging) return
            if (!wheelAnim) wheelAnim = getAnim()
            if (!wheelAnim) return
            s.wheelDelta = (s.wheelDelta || 0) + dxw
            if (!s.wraf) {
                s.wraf = requestAnimationFrame(() => {
                    s.wraf = 0
                    const a = wheelAnim
                    if (!a) return
                    const ct = typeof a.currentTime === 'number' ? a.currentTime : 0
                    let t = ct + (s.wheelDelta / copyWidth) * durMs
                    s.wheelDelta = 0
                    t = ((t % durMs) + durMs) % durMs
                    try { a.currentTime = t } catch { /* noop */ }
                })
            }
        }

        band.addEventListener('pointerdown', down)
        band.addEventListener('pointermove', move)
        band.addEventListener('pointerup', up)
        band.addEventListener('pointercancel', up)
        band.addEventListener('click', click, true)
        band.addEventListener('wheel', wheel, { passive: false })
        return () => {
            const s = state.current
            if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0 }
            if (s.wraf) { cancelAnimationFrame(s.wraf); s.wraf = 0 }
            band.removeEventListener('pointerdown', down)
            band.removeEventListener('pointermove', move)
            band.removeEventListener('pointerup', up)
            band.removeEventListener('pointercancel', up)
            band.removeEventListener('click', click, true)
            band.removeEventListener('wheel', wheel)
        }
    }, [copyWidth, months, maximized])

    return { bandRef, trackRef, dragRef }
}

export default function AnimeJourney({ animeList, historyLog, episodeRatings, range }) {
    const [extras, setExtras] = useState(null) // { top10Names, hmNames, categoryRatings }
    // Maximalizovaný stav přežívá navigaci detail→zpět díky sessionStorage
    const [maximized, setMaximized] = useState(() => {
        try { return sessionStorage.getItem('aj-maximized') === '1' } catch { return false }
    })
    const toggleMax = useCallback((val) => {
        setMaximized(val)
        try { sessionStorage.setItem('aj-maximized', val ? '1' : '0') } catch { /* quota */ }
    }, [])
    const maxRef = useRef(null)
    // Měsíc, na který se má timeline po maximalizaci nascrollovat (klik na kolečko)
    const pendingKey = useRef(null)

    useEffect(() => {
        let cancelled = false
        // Bez cache-busteru `?v=Date.now()`: ten se při každém F5 stahoval znovu a
        // předdekódování náhledovek pásu se tak spouštělo až během prvního tahu
        // (prvních ~1,5 s drhlo). Takto jdou data z cache s revalidací (ETag),
        // po nasazení jsou zas čerstvá, a warm-up proběhne už při načtení stránky.
        Promise.all([
            fetch('data/top_favorites.json').then(r => r.json()).catch(() => null),
            // Sdílená cache (dataStore) — na Dashboardu ho už načetl preloadAllData,
            // takže se category_ratings.json nestahuje a neparsuje podruhé.
            loadData(STORAGE_KEYS.CATEGORY_RATINGS, 'data/category_ratings.json').catch(() => []),
        ]).then(([topFav, catR]) => {
            if (cancelled) return
            setExtras({
                top10Names: (topFav?.top10_anime || []).map(t => t?.data?.NAME).filter(Boolean),
                hmNames: (topFav?.hm_anime || []).map(t => t?.data?.NAME).filter(Boolean),
                categoryRatings: Array.isArray(catR) ? catR : [],
            })
        })
        return () => { cancelled = true }
    }, [])

    const journey = useMemo(() => {
        if (!animeList?.length || !extras) return null
        return buildJourney({
            animeList, historyLog,
            top10Names: extras.top10Names, hmNames: extras.hmNames,
            categoryRatings: extras.categoryRatings, episodeRatings,
        })
    }, [animeList, historyLog, episodeRatings, extras])

    // Globální časový filtr Dashboardu: ořízne ZOBRAZENÉ měsíce,
    // running total ale zůstává z celé historie (jako VBA runningTotal).
    const visible = useMemo(() => {
        if (!journey) return null
        if (!range || (!range.start && !range.end)) return journey
        return journey.filter(m => {
            const [y, mo] = m.key.split('-').map(Number)
            const mStart = new Date(y, mo - 1, 1)
            const mEnd = new Date(y, mo, 0, 23, 59, 59)
            return (!range.start || mEnd >= range.start) && (!range.end || mStart <= range.end)
        })
    }, [journey, range])

    // Po maximalizaci: skoč na měsíc, na který se kliklo, obnov uloženou pozici, nebo skoč na konec
    useEffect(() => {
        if (!maximized) return
        const el = maxRef.current
        if (!el) return
        if (pendingKey.current) {
            const target = el.querySelector(`[data-month="${pendingKey.current}"]`)
            pendingKey.current = null
            if (target) {
                target.scrollIntoView({ inline: 'center', block: 'nearest' })
                return
            }
        }
        // Obnovit uloženou pozici (návrat z detailu), jinak na konec
        try {
            const saved = sessionStorage.getItem('aj-scroll')
            if (saved != null) {
                el.scrollLeft = Number(saved)
                sessionStorage.removeItem('aj-scroll')
                return
            }
        } catch { /* noop */ }
        el.scrollLeft = el.scrollWidth
    }, [visible, maximized])

    // Průběžně ukládat scroll pozici, aby „Zpět" z detailu vrátil přesný pohled
    useEffect(() => {
        if (!maximized) return
        const el = maxRef.current
        if (!el) return
        const save = () => {
            try { sessionStorage.setItem('aj-scroll', String(el.scrollLeft)) } catch { /* noop */ }
        }
        el.addEventListener('scroll', save, { passive: true })
        return () => el.removeEventListener('scroll', save)
    }, [maximized])

    const openAt = useCallback((key) => {
        pendingKey.current = key
        toggleMax(true)
    }, [toggleMax])

    // Detail měsíce (modal). Drží se klíč měsíce, ne index, aby se výběr
    // nerozbil, když časový filtr Dashboardu změní seznam viditelných měsíců.
    const [detailKey, setDetailKey] = useState(null)
    const detailIdx = visible ? visible.findIndex(m => m.key === detailKey) : -1
    const detailMonth = detailIdx >= 0 ? visible[detailIdx] : null
    const goDetail = useCallback((delta) => {
        setDetailKey(prev => {
            const list = visible || []
            const i = list.findIndex(m => m.key === prev)
            const next = i + delta
            return (next >= 0 && next < list.length) ? list[next].key : prev
        })
    }, [visible])

    const scrollBy = useCallback((dir) => {
        const el = maxRef.current
        if (!el) return
        // Scroll by the visible width of the container (≈ 5 cards)
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
    }, [])

    // Dlaždice sedí všechny na jedné lince (žádný svislý posun) — prostorovost
    // dělá jen diagonální střih. Track je zdvojený kvůli nekonečné smyčce.
    const mini = useMemo(() => {
        const n = visible?.length || 0
        if (!n) return null
        const copyWidth = n * MINI_SLOT
        // Poslední dlaždice přesahuje rozteč o diagonální střih
        const totalWidth = copyWidth * 2 + TILE_SKEW
        const tiles = []
        for (let i = 0; i < n * 2; i++) {
            const m = visible[i % n]
            tiles.push({ m, x: i * MINI_SLOT, i })
        }
        return { copyWidth, totalWidth, tiles, n }
    }, [visible])

    const { bandRef, trackRef, dragRef } = useMiniDrift(mini?.copyWidth || 0, mini?.n || 0, maximized)

    // Předdekódování náhledovek pásu. Bez něj se JPEG stahoval a dekódoval až
    // ve chvíli, kdy dlaždici poprvé odhalil tah, a první ~sekunda tažení
    // jednorázově drhla (další tahy už byly plynulé díky dekódovací cache).
    useEffect(() => {
        if (!mini) return
        const seen = new Set()
        mini.tiles.forEach(({ m }) => {
            const src = journeyThumb(m.best?.thumbnail) || m.best?.thumbnail
            if (!src || seen.has(src)) return
            seen.add(src)
            const im = new Image()
            im.src = src
            if (im.decode) im.decode().catch(() => { /* dekódování počká na paint */ })
        })
    }, [mini])

    if (!visible) return null

    if (!maximized) {
        // ── Minimalizovaný pás ────────────────────────────────────────────
        // Kolečka jezdí po sinusové cestě (vlna je funkce x, ne indexu, takže
        // šev zdvojené smyčky nepřeskočí). Drift řídí rAF, pás lze táhnout.
        if (!mini) return null
        return (
            <div className="card aj-card aj-mini-card">
                <div className="aj-mini-row">
                    <h3 className="aj-title aj-title-sm"><RoadIcon size={18} /> Cesta Anime</h3>
                    <span className="aj-mini-summary" title="Souhrn celé cesty">
                        {mini.n} měsíců&nbsp;·&nbsp;<b>{visible.at(-1)?.runningTotal || 0}</b> anime
                    </span>
                    <div className="aj-mini-band" ref={bandRef}>
                        <div className="aj-mini-track" ref={trackRef} style={{ width: mini.totalWidth }}>
                            <div className="aj-mini-drag" ref={dragRef}>
                                {mini.tiles.map(({ m, x, i }) => (
                                    <button
                                        key={`${m.key}-${i}`}
                                        type="button"
                                        className="aj-tile"
                                        style={{ '--x': x }}
                                        onClick={() => openAt(m.key)}
                                        title={`${m.label}: +${m.plusCount} anime (celkem ${m.runningTotal})${m.best ? ` · Nejlepší: ${m.best.name} (${m.best.ratingText})` : ''}`}
                                    >
                                        <span className="aj-tile-inner">
                                            <span className="aj-tile-media">
                                                {m.best?.thumbnail
                                                    ? <img
                                                        src={journeyThumb(m.best.thumbnail) || m.best.thumbnail}
                                                        alt=""
                                                        draggable={false}
                                                        onError={(e) => {
                                                            // Zmenšenina chybí → originál
                                                            if (e.currentTarget.dataset.fb) return
                                                            e.currentTarget.dataset.fb = '1'
                                                            e.currentTarget.src = m.best.thumbnail
                                                        }}
                                                    />
                                                    : <span className="aj-tile-ph">🎬</span>}
                                                <span className="aj-tile-scrim" />
                                                <span className="aj-tile-text">
                                                    <span className="aj-tile-label">{monthLabelShort(m.key)}</span>
                                                    <b>+{m.plusCount}</b>
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button type="button" className="aj-max-btn" onClick={() => toggleMax(true)}>⤢</button>
                </div>
            </div>
        )
    }

    return (
        <div className="card aj-card maximized">
            <div className="aj-header">
                <h3 className="aj-title"><RoadIcon /> Cesta Anime</h3>
                <span className="aj-subtitle">{visible.length} měsíců · {visible.at(-1)?.runningTotal || 0} anime</span>
                <div className="aj-header-actions">
                    <button type="button" className="aj-nav-btn" onClick={() => scrollBy(-1)} aria-label="Posunout doleva">‹</button>
                    <button type="button" className="aj-nav-btn" onClick={() => scrollBy(1)} aria-label="Posunout doprava">›</button>
                    <button type="button" className="aj-max-btn" onClick={() => toggleMax(false)}>▾ Minimalizovat</button>
                </div>
            </div>

            {/* ── Maximalizovaná timeline karet ── */}
            <div className="aj-timeline" ref={maxRef}>
                    {visible.map((m, i) => {
                        const [y] = m.key.split('-')
                        const prevY = i > 0 ? visible[i - 1].key.split('-')[0] : null
                        return (
                            <span key={m.key} style={{ display: 'contents' }}>
                                {prevY !== null && prevY !== y && <div className="aj-year-divider"><span>{y}</span></div>}
                                <MonthCard m={m} onOpenDetail={setDetailKey} />
                            </span>
                        )
                    })}
            </div>

            {detailMonth && (
                <AnimeJourneyMonthModal
                    month={detailMonth}
                    onClose={() => setDetailKey(null)}
                    onPrev={() => goDetail(-1)}
                    onNext={() => goDetail(1)}
                    hasPrev={detailIdx > 0}
                    hasNext={detailIdx >= 0 && detailIdx < visible.length - 1}
                />
            )}
        </div>
    )
}
