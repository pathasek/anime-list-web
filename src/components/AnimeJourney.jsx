// „Cesta Anime“ — web verze Excel modulu LIST_Watch_Overview (Plán 9, Ú3).
// Minimalizovaný pás měsíců pod tabulkou „Data projekt“; maximalizace otevře
// timeline měsíčních karet (velikost jako maximalizovaná sekce Status).
// Izolovaná featura: data si dotahuje sama (top_favorites, category_ratings),
// animeList/historyLog/episodeRatings dostává z Dashboardu, výpočty dělá
// utils/journeyCalculations.js.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { buildJourney, monthLabelShort, fmtHours } from '../utils/journeyCalculations'
import { extractMalId, getAnimeInfo } from '../utils/jikanService'
import './animeJourney.css'

// Cache pro postery v paměti (zkrátí re-rendery)
const posterMemoryCache = {}

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

    try {
        const cached = localStorage.getItem('journey_poster_' + malId)
        if (cached) {
            posterMemoryCache[malId] = cached
            return cached
        }
    } catch { /* quota / SSR */ }

    // 1. Priorita: Jikan (čte okamžitě ze statického anime_metadata.json / API)
    try {
        const info = await getAnimeInfo(malId)
        const jikanImg = info?.imageUrl || info?.largeImageUrl
        if (jikanImg) {
            posterMemoryCache[malId] = jikanImg
            try { localStorage.setItem('journey_poster_' + malId, jikanImg) } catch { /* noop */ }
            return jikanImg
        }
    } catch { /* proceed to AniList */ }

    // 2. Záloha: AniList GraphQL
    const anilistImg = await fetchAniListCover(malId)
    if (anilistImg) {
        posterMemoryCache[malId] = anilistImg
        try { localStorage.setItem('journey_poster_' + malId, anilistImg) } catch { /* noop */ }
        return anilistImg
    }

    // 3. Poslední záloha: Vlastní screenshot
    const fallback = fallbackThumbnail || null
    if (fallback) {
        posterMemoryCache[malId] = fallback
        try { localStorage.setItem('journey_poster_' + malId, fallback) } catch { /* noop */ }
    }
    return fallback
}

function StripPoster({ anime }) {
    const malId = useMemo(() => extractMalId(anime?.mal_url), [anime?.mal_url])
    const [src, setSrc] = useState(() => {
        if (malId && posterMemoryCache[malId]) return posterMemoryCache[malId]
        if (malId) {
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
        let cancelled = false
        if (!malId) {
            setSrc(anime?.thumbnail || null)
            return
        }
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

function MonthCard({ m }) {
    const reason = m.best ? REASON_META[m.best.reason] || REASON_META.standard : null
    return (
        <div className="aj-month-card" data-month={m.key}>
            <div className="aj-month-head">
                <span className="aj-month-name">{m.label}</span>
                <span className="aj-month-plus">+{m.plusCount}</span>
                <span className="aj-month-total">celkem {m.runningTotal}</span>
            </div>

            {m.best && (
                <Link to={`/anime/${encodeURIComponent(m.best.memberNames[0])}`} className="aj-best">
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
                {m.longest && (
                    <div className="aj-fact">
                        <span className="aj-fact-label">Nejdelší</span>
                        <span className="aj-fact-value" title={m.longest.name}>
                            {m.longest.name} <b>({m.longest.hoursText})</b>
                        </span>
                    </div>
                )}
                {m.watchedMins > 0 && (
                    <div className="aj-fact">
                        <span className="aj-fact-label">Nakoukáno</span>
                        <span className="aj-fact-value" title="Skutečně zhlédnutý čas v měsíci (z History logu) — počítá i rozkoukaná anime">
                            <b>{fmtHours(m.watchedMins)}</b>
                        </span>
                    </div>
                )}
            </div>

            <div className="aj-chip-rows">
                <ChipRow label="Typy" items={m.types} />
                <ChipRow label="Žánry" items={m.genres} />
                <ChipRow label="Témata" items={m.themes} />
                <ChipRow label="Tagy" items={m.tags} />
            </div>

            <div className="aj-strip" title="Anime dokončená v měsíci (seřazeno dle hodnocení)">
                {m.items.map(a => (
                    <Link key={a.name} to={`/anime/${encodeURIComponent(a.name)}`}
                        className="aj-strip-item" title={`${a.name}${a.rating ? ` — ${a.rating}/10` : ''}`}>
                        <StripPoster anime={a} />
                    </Link>
                ))}
            </div>
        </div>
    )
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
        Promise.all([
            fetch('data/top_favorites.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            fetch('data/category_ratings.json?v=' + Date.now()).then(r => r.json()).catch(() => []),
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

    const scrollBy = useCallback((dir) => {
        const el = maxRef.current
        if (!el) return
        // Scroll by the visible width of the container (≈ 5 cards)
        el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
    }, [])

    if (!visible) return null

    if (!maximized) {
        // ── Minimalizovaný pás ────────────────────────────────────────────
        // Jeden kompaktní řádek ve výšce původního řádku filtru. Kolečka
        // plují po diagonále a na obou koncích mizí do stínu (mask gradient);
        // v jeden moment je vidět jen pár měsíců. Track je zdvojený, aby
        // smyčka navazovala; hover pauzuje, klik otevře daný měsíc.
        const loop = [...visible, ...visible]
        return (
            <div className="card aj-card aj-mini-card">
                <div className="aj-mini-row">
                    <h3 className="aj-title aj-title-sm"><RoadIcon size={18} /> Cesta Anime</h3>
                    <div className="aj-mini-band">
                        <div className="aj-mini-track" style={{ animationDuration: `${Math.max(24, visible.length * 2.4)}s` }}>
                            {loop.map((m, i) => (
                                <button
                                    key={`${m.key}-${i}`}
                                    type="button"
                                    className="aj-orb"
                                    style={{ '--step': i % 4 }}
                                    onClick={() => openAt(m.key)}
                                    title={`${m.label}: +${m.plusCount} anime (celkem ${m.runningTotal})${m.best ? ` · Nejlepší: ${m.best.name} (${m.best.ratingText})` : ''}`}
                                >
                                    <span className="aj-orb-img">
                                        {m.best?.thumbnail
                                            ? <img src={m.best.thumbnail} alt="" loading="lazy" />
                                            : <span className="aj-orb-ph">🎬</span>}
                                    </span>
                                    <span className="aj-orb-text">
                                        {monthLabelShort(m.key)} <b>+{m.plusCount}</b>
                                    </span>
                                </button>
                            ))}
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
                                <MonthCard m={m} />
                            </span>
                        )
                    })}
            </div>
        </div>
    )
}
