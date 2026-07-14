import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Radar } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip
} from 'chart.js'
import { useTheme } from './ThemeProvider'
import { getThemeChartColors } from '../utils/chartTheme'
import { getMediaForAnime, youtubeSearchUrl, normalizeAnimeKey } from '../utils/mediaMatch'
import { fetchAnimeThemes } from '../utils/animeThemesService'
import { VideoModal, FloatingOstPlayer, ScrollableText } from './CategoryMediaPlayers'
import { iconFor } from './categoryIcons'
import { formatCategoryMarkdown } from '../utils/formatCategoryMarkdown'
import { RatingInfoButton, CategoryGuideModal } from './RatingGuideModals'
import { useOstPlayer } from './OstPlayerProvider'
import { useModalScrollLock } from '../utils/useModalScrollLock'
import { useModalTables } from '../utils/useModalTables'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

// Kategorie, u kterých nabízíme přehrání videoklipu / OST
const MEDIA_CATS = { OP: true, ED: true, OST: true }

// Module-level cache — data se načtou jen jednou na relaci
let cachedOpEdVideos = null
let cachedOstPieces = null
let cachedOstWhole = null

const PlayIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
    </svg>
)


const fmtWeight = (w) => w.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })
const fmtRating = (r) => r.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Reads the current --accent-primary CSS variable as {r, g, b}
function readAccentRgb() {
    let rgb = { r: 99, g: 102, b: 241 }
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
        const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
        if (m) {
            let hex = m[1]
            if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
            rgb = {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
            }
        }
    } catch { /* keep fallback */ }
    return rgb
}

// Follows every theme. The accent lives in a CSS variable that ThemeProvider
// updates from an effect (after render), so reading it during render would be
// one theme behind. We read it in a requestAnimationFrame instead, which runs
// after the ThemeProvider effect has applied the new data-theme attribute.
function useAccentColor(theme) {
    const [rgb, setRgb] = useState(readAccentRgb)
    useEffect(() => {
        const raf = requestAnimationFrame(() => setRgb(readAccentRgb()))
        return () => cancelAnimationFrame(raf)
    }, [theme])
    return useCallback((a) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`, [rgb])
}

function CategoryRatingsPanel({ categoryRatings, categoryWeights, avgRating, animeName, animeSeries, categoryReviews, compactRadar = false, malId = null }) {
    const { theme } = useTheme()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const c = useMemo(() => getThemeChartColors(), [theme])
    const accent = useAccentColor(theme)
    const ostPlayer = useOstPlayer()

    // OP/ED/OST média pro toto anime
    const [opEdVideos, setOpEdVideos] = useState(cachedOpEdVideos)
    const [ostPieces, setOstPieces] = useState(cachedOstPieces)
    const [ostWhole, setOstWhole] = useState(cachedOstWhole)
    const [activeReview, setActiveReview] = useState(null) // { category, text, rating }
    
    const [videoModal, setVideoModal] = useState(null)   // OP/ED video (Drive) v překryvném okně
    const [floatingOst, setFloatingOst] = useState(null) // OST (YouTube) v plovoucím přehrávači
    const [guideOpen, setGuideOpen] = useState(false)    // Průvodce hodnocením kategorií

    useEffect(() => {
        if (cachedOpEdVideos === null) {
            fetch('data/op_ed_videos.json?v=' + Date.now())
                .then(r => (r.ok ? r.json() : null))
                .then(d => { cachedOpEdVideos = (d && d.videos) || []; setOpEdVideos(cachedOpEdVideos) })
                .catch(() => { cachedOpEdVideos = []; setOpEdVideos([]) })
        }
        if (cachedOstPieces === null) {
            fetch('data/favorites_ost.json?v=' + Date.now())
                .then(r => (r.ok ? r.json() : null))
                .then(d => { 
                    cachedOstPieces = (d && d.pieces) || []; 
                    cachedOstWhole = (d && d.whole) || [];
                    setOstPieces(cachedOstPieces)
                    setOstWhole(cachedOstWhole)
                })
                .catch(() => { 
                    cachedOstPieces = []; 
                    cachedOstWhole = [];
                    setOstPieces([])
                    setOstWhole([])
                })
        }
    }, [])

    // Plán 6b: ostatní OP/ED z AnimeThemes.moe (jen v detailu anime — malId
    // posílá pouze AnimeDetail; Favorites a ostatní stránky beze změny)
    const [atThemes, setAtThemes] = useState([])
    useEffect(() => {
        setAtThemes([])
        if (!malId) return
        const controller = new AbortController()
        fetchAnimeThemes(malId, controller.signal)
            .then(t => setAtThemes(t || []))
            .catch(() => { })
        return () => controller.abort()
    }, [malId])

    const media = useMemo(() => {
        const base = getMediaForAnime(animeName, opEdVideos || [], ostPieces || [], ostWhole || [], animeSeries)
        if (!atThemes.length) return base

        // Píseň už pokrytá GDrive verzí (vybranou) se nepřidává znovu — AnimeThemes
        // doplňuje jen „všechny ostatní" znělky. GDrive zůstává vždy první/hlavní.
        const covered = new Set(
            [...base.OP, ...base.ED]
                .map(t => normalizeAnimeKey(t.song))
                .filter(Boolean)
        )
        const songCovered = (song) => {
            const key = normalizeAnimeKey(song)
            if (!key) return false
            for (const c of covered) {
                if (c === key || c.includes(key) || key.includes(c)) return true
            }
            return false
        }

        const merged = { ...base, OP: [...base.OP], ED: [...base.ED] }
        for (const t of atThemes) {
            if (!merged[t.type]) continue
            if (songCovered(t.song)) continue
            merged[t.type].push({
                kind: 'video',
                type: t.type,
                song: t.song,
                artist: t.artist,
                label: t.version > 1 ? `${t.label} v${t.version}` : t.label,
                url: t.url,
                ytId: null,
                file_id: null,
                isExtra: true, // vizuální odlišení od vybraných GDrive klipů
            })
        }
        return merged
    }, [animeName, opEdVideos, ostPieces, ostWhole, animeSeries, atThemes])

    const playTrack = useCallback((t) => {
        if (!t) return
        if (t.kind === 'video') setVideoModal(t)
        else if (t.kind === 'youtube' || t.kind === 'youtube-playlist') {
            if (ostPlayer && typeof ostPlayer.closePlayer === 'function') {
                ostPlayer.closePlayer()
            }
            setFloatingOst(t)
        }
        else if (t.kind === 'external') window.open(t.url, '_blank', 'noopener')
    }, [ostPlayer])

    const searchYoutube = useCallback((type) => {
        window.open(youtubeSearchUrl(animeName, type), '_blank', 'noopener')
    }, [animeName])

    const handleCardClick = useCallback((cat, tracks) => {
        if (!tracks || tracks.length === 0) {
            searchYoutube(cat)
        } else {
            playTrack(tracks[0])
        }
    }, [searchYoutube, playTrack])

    const chartRef = useRef(null)
    const wrapRef = useRef(null)
    const [labelPos, setLabelPos] = useState([])

    const entries = useMemo(
        () => Object.entries(categoryRatings || {}),
        [categoryRatings]
    )

    // Pořadí karet v gridu (2 sloupce, řádky zleva): ..., Enjoyment | OST, OP | ED
    // — OP je nalevo od ED, OST vedle Enjoymentu. Radar zachovává kanonické pořadí.
    const CARD_ORDER = ['Animace', 'CGI', 'MC', 'Vedlejší postavy', 'Waifu', 'Plot',
        'Pacing', 'Story Conclusion', 'Originalita', 'Emoce', 'Enjoyment', 'OST', 'OP', 'ED']
    const displayEntries = useMemo(() => {
        const idx = (c) => { const i = CARD_ORDER.indexOf(c); return i === -1 ? CARD_ORDER.length : i }
        return [...entries].sort((a, b) => idx(a[0]) - idx(b[0]))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries])

    const chartData = useMemo(() => ({
        labels: entries.map(([cat]) => cat),
        datasets: [{
            label: 'Hodnocení',
            data: entries.map(([, rating]) => rating),
            backgroundColor: (context) => {
                const chart = context.chart
                const scale = chart.scales?.r
                if (!chart.chartArea || !scale) return accent(0.25)
                const gradient = chart.ctx.createRadialGradient(
                    scale.xCenter, scale.yCenter, 0,
                    scale.xCenter, scale.yCenter, Math.max(scale.drawingArea, 1)
                )
                gradient.addColorStop(0, accent(0.06))
                gradient.addColorStop(0.75, accent(0.28))
                gradient.addColorStop(1, accent(0.5))
                return gradient
            },
            borderColor: accent(1),
            borderWidth: 2,
            pointBackgroundColor: c.pointBorder,
            pointBorderColor: accent(1),
            pointBorderWidth: 1.5,
            pointRadius: 3.5,
            pointHoverRadius: 5
        }]
    }), [entries, accent, c])

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

    const radarMin = useMemo(() => {
        const values = entries.map(([, r]) => r)
        const minVal = values.length > 0 ? Math.min(...values) : 0
        return Math.max(0, Math.floor(minVal - 1))
    }, [entries])

    const radarMax = useMemo(() => {
        const values = entries.map(([, r]) => r)
        return values.length > 0 ? Math.max(...values) : 10
    }, [entries])

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            // Balanced padding for larger radar with space for labels.
            // compactRadar (stránka Anime hodnocení) přidá extra padding →
            // menší poloměr, aby popisky nezasahovaly do karet kategorií.
            padding: isMobile ? 35 : (compactRadar ? 78 : 45)
        },
        scales: {
            r: {
                min: radarMin,
                max: radarMax,
                ticks: {
                    stepSize: 1,
                    color: c.textMuted,
                    showLabelBackdrop: false,
                    font: { size: isMobile ? 9 : 11 },
                    angle: 18, // Rotate scale numbers by 18 degrees to avoid overlap with the vertical edge dot
                    textStrokeColor: '#111019', // High contrast stroke matching panel background
                    textStrokeWidth: 3,
                    callback: (value) => value === 0 ? '' : value.toLocaleString('cs-CZ')
                },
                grid: {
                    circular: true,
                    color: c.grid
                },
                angleLines: {
                    color: c.grid,
                    borderDash: [3, 5]
                },
                pointLabels: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${fmtRating(ctx.parsed.r)}`
                }
            }
        }
    }), [c, isMobile, radarMin, radarMax, compactRadar])

    // Soft glow behind the radar shape + redraw of the scale numbers on top.
    const chartPlugins = useMemo(() => [{
        id: 'categoryRadarGlow',
        beforeDatasetsDraw(chart) {
            chart.ctx.save()
            chart.ctx.shadowColor = accent(0.55)
            chart.ctx.shadowBlur = 22
        },
        afterDatasetsDraw(chart) {
            chart.ctx.restore()
        }
    }, {
        // Chart.js draws the radial scale numbers before the dataset, so the
        // opaque vertex dots paint over them (e.g. "10" at the top vanishes).
        // Re-run the scale's own drawLabels() after the datasets so the numbers
        // always sit above the white dots. Reusing drawLabels() keeps their
        // position/styling identical — the only change is the z-order. Runs
        // after the glow plugin's ctx.restore(), and clears any shadow so the
        // redrawn text has no glow.
        id: 'categoryRadarTicksOnTop',
        afterDatasetsDraw(chart) {
            const scale = chart.scales?.r
            if (!scale || typeof scale.drawLabels !== 'function') return
            const ctx = chart.ctx
            ctx.save()
            ctx.shadowColor = 'transparent'
            ctx.shadowBlur = 0
            scale.drawLabels()
            ctx.restore()
        }
    }], [accent])

    // Overlay labels are plain HTML positioned via the radial scale,
    // because Chart.js point labels can't render icons or per-line colors.
    // We push labels further out (drawingArea + offset) so they sit well outside the polygon.
    const computePositions = useCallback(() => {
        const chart = chartRef.current
        const scale = chart?.scales?.r
        if (!scale || typeof scale.getPointPosition !== 'function') return
        const count = chart.data.labels.length
        const next = []
        for (let i = 0; i < count; i++) {
            // Anchor point for the label text & icon
            const pos = scale.getPointPosition(i, scale.drawingArea + 34)
            // Point exactly on the outer scale boundary (max value)
            const edgePos = scale.getPointPosition(i, scale.drawingArea)
            const dx = pos.x - scale.xCenter
            const dy = pos.y - scale.yCenter
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            next.push({
                x: pos.x,
                y: pos.y,
                edgeX: edgePos.x,
                edgeY: edgePos.y,
                ux: dx / len,
                uy: dy / len
            })
        }
        setLabelPos(prev => {
            const same = prev.length === next.length &&
                prev.every((p, i) =>
                    Math.abs(p.x - next[i].x) < 0.5 &&
                    Math.abs(p.y - next[i].y) < 0.5 &&
                    Math.abs(p.edgeX - next[i].edgeX) < 0.5 &&
                    Math.abs(p.edgeY - next[i].edgeY) < 0.5
                )
            return same ? prev : next
        })
    }, [])

    useEffect(() => {
        const raf = requestAnimationFrame(computePositions)
        const el = wrapRef.current
        let ro
        if (el && typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => requestAnimationFrame(computePositions))
            ro.observe(el)
        }
        return () => {
            cancelAnimationFrame(raf)
            if (ro) ro.disconnect()
        }
    }, [computePositions, entries, theme])

    const reviews = categoryReviews?.[animeName]
    const hasCategoryRatings = categoryRatings && entries.length > 0

    if (!hasCategoryRatings) {
        if (!reviews) return null

        // Czech category list in word files
        const reviewedCategories = Object.keys(reviews)
            .filter(key => key !== 'episodes' && key !== 'story' && typeof reviews[key] === 'string' && reviews[key].trim().length > 0)
        
        const storyReview = reviews.story
        const episodeNumbers = Object.keys(reviews.episodes || {})
            .sort((a, b) => parseInt(a) - parseInt(b))

        const hasAnyContent = reviewedCategories.length > 0 || !!storyReview || episodeNumbers.length > 0

        if (!hasAnyContent) return null

        const openStoryReview = () => {
            setActiveReview({
                category: 'Rozbor děje',
                text: storyReview.text,
                rating: null,
                icon: '📖'
            })
        }

        return (
            <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                <div className="category-ratings-header" style={{ marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📖 Textové rozbory a analýza
                    </h3>
                    <p className="category-ratings-subtitle">
                        Podrobné textové analýzy děje, vybraných aspektů a epizod z docx rozborů vygenerované pomocí AI z webových zdrojů (mohou obsahovat chyby).
                    </p>
                </div>

                {/* Kompaktní sloupec — NEpoužívá .ratings-flex-container (ta má flex-wrap:wrap
                    pro horizontální radar layout; v kombinaci s column tvořila obří prázdné místo). */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Category Reviews Grid */}
                    {reviewedCategories.length > 0 && (
                        <div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Hodnocené aspekty
                            </h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {reviewedCategories.map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        className="custom-review-chip"
                                        onClick={() => setActiveReview({ category: cat, text: reviews[cat], rating: null })}
                                    >
                                        <span aria-hidden="true">{iconFor(cat)}</span>
                                        <strong>{cat}</strong>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Story Review Hero — pod kategoriemi */}
                    {storyReview?.text && (
                        <button type="button" className="story-review-hero-card" onClick={openStoryReview}>
                            <div className="hero-card-icon" aria-hidden="true">📖</div>
                            <div className="hero-card-content">
                                <h4>Celkový rozbor děje</h4>
                                <p>Kliknutím zobrazíte detailní analýzu struktury děje (expozice, konfrontace, rozuzlení).</p>
                            </div>
                            <span className="hero-card-action-btn">Zobrazit</span>
                        </button>
                    )}

                    {/* Episode Reviews */}
                    {episodeNumbers.length > 0 && (
                        <div>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Rozbory epizod
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
                                {episodeNumbers.map(epNum => {
                                    // episodes[epNum] je objekt { title, text } (starší data mohou
                                    // být holý string). Modal potřebuje STRING do formatCategoryMarkdown
                                    // — předání objektu dřív shazovalo celou stránku (text.split).
                                    const ep = reviews.episodes[epNum]
                                    const epText = (ep && typeof ep === 'object') ? ep.text : ep
                                    const epTitle = (ep && typeof ep === 'object' && ep.title) ? ep.title : `Epizoda ${epNum}`
                                    return (
                                        <button
                                            key={epNum}
                                            type="button"
                                            className="episode-review-btn-chip"
                                            title={epTitle}
                                            onClick={() => setActiveReview({
                                                category: epTitle,
                                                text: epText,
                                                rating: null,
                                                icon: '📝'
                                            })}
                                        >
                                            Epizoda {epNum}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Media Players if available */}
                    {['OP', 'ED', 'OST'].some(cat => media[cat] && media[cat].length > 0) && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '2px' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Doprovodná hudba a znělky
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                                {['OP', 'ED', 'OST'].map(cat => {
                                    const tracks = media[cat] || []
                                    if (tracks.length === 0) return null
                                    return tracks.map((track, i) => (
                                        <button
                                            key={`${cat}-${i}`}
                                            type="button"
                                            className={`media-track-btn-flat${track.isExtra ? ' is-extra' : ''}`}
                                            onClick={() => playTrack(track)}
                                        >
                                            <span aria-hidden="true">▶</span>
                                            <div style={{ flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                <strong style={{ fontSize: '0.85rem' }}>{track.song || track.label}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                                    ({track.isExtra ? track.label : cat})
                                                </span>
                                                {track.isExtra && (
                                                    <span className="media-track-extra-tag">AnimeThemes</span>
                                                )}
                                                {track.artist && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden' }}>{track.artist}</div>}
                                            </div>
                                        </button>
                                    ))
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* OP/ED videoklip v překryvném okně */}
                <VideoModal media={videoModal} onClose={() => setVideoModal(null)} />

                {/* OST v plovoucím YouTube přehrávači */}
                <FloatingOstPlayer
                    key={floatingOst ? (floatingOst.url || floatingOst.ytPlaylistId || 'ost-active') : 'ost-inactive'}
                    ost={floatingOst}
                    playlist={media.OST}
                    onPlayTrack={playTrack}
                    onClose={() => setFloatingOst(null)}
                />

                {/* Detailní rozbor konkrétní kategorie */}
                <CategoryDetailModal 
                    activeReview={activeReview} 
                    onClose={() => setActiveReview(null)} 
                />
            </div>
        )
    }

    return (
        <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
            <div className="category-ratings-header">
                <h3 style={{ margin: 0 }}>
                    Hodnocení podle kategorií
                    <span className="category-ratings-wa">(WA: {avgRating})</span>
                    <RatingInfoButton
                        label="Jak hodnotím kategorie"
                        style={{ marginLeft: '10px' }}
                        onClick={() => setGuideOpen(true)}
                    />
                </h3>
                <p className="category-ratings-subtitle">
                    Průměrné hodnocení zohledňuje váhy jednotlivých kategorií.
                </p>
                <p className="category-ratings-info-text">
                    Faktické rozbory (detaily kategorií 📝) byly vygenerovány AI z webových zdrojů a mohou obsahovat chyby. Pro OP/ED naleznete popisy v kategorii OST.
                </p>
            </div>

            <div className="ratings-flex-container">
                {/* Category cards on the left */}
                <div className="category-cards-grid">
                    {displayEntries.map(([cat, rating]) => {
                        const isMedia = !!MEDIA_CATS[cat]
                        const tracks = isMedia ? media[cat] : null
                        const hasTracks = tracks && tracks.length > 0
                        // ⭐ u vybraných (GDrive) klipů má smysl jen, když jsou v seznamu i „ostatní" z AnimeThemes
                        const hasExtraTracks = hasTracks && tracks.some(t => t.isExtra)
                        const reviewText = categoryReviews && categoryReviews[animeName] && categoryReviews[animeName][cat]
                        const hasReview = !!reviewText
                        // Rozbor děje (u filmů/speciálů bez epizodních rozborů) — druhá akce na kartě Plot
                        const storyReview = cat === 'Plot' ? categoryReviews?.[animeName]?.story : null

                        const openStoryReview = () => {
                            setActiveReview({
                                category: 'Rozbor děje',
                                text: storyReview.text,
                                rating: null,
                                icon: '📖'
                            })
                        }

                        const handleCardClickInner = () => {
                            if (isMedia) {
                                handleCardClick(cat, tracks)
                            } else if (hasReview) {
                                setActiveReview({ category: cat, text: reviewText, rating: rating })
                            } else if (storyReview) {
                                openStoryReview()
                            }
                        }

                        return (
                            <div
                                key={cat}
                                className={`category-rating-card${isMedia ? ' has-media' : ''}${(hasReview || storyReview) ? ' has-review' : ''}`}
                                onClick={handleCardClickInner}
                                role={(isMedia || hasReview || storyReview) ? 'button' : undefined}
                                tabIndex={(isMedia || hasReview || storyReview) ? 0 : undefined}
                                onKeyDown={(isMedia || hasReview || storyReview) ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleCardClickInner(e)
                                    }
                                } : undefined}
                            >
                                <div className="category-card-left">
                                    <span className="category-card-icon-wrapper">
                                        <span className="category-card-icon">{iconFor(cat)}</span>
                                        {hasReview && (
                                            <span
                                                className="category-card-review-icon"
                                                title="Zobrazit detailní rozbor"
                                                onClick={isMedia ? (e) => {
                                                    e.stopPropagation()
                                                    setActiveReview({ category: cat, text: reviewText, rating: rating })
                                                } : undefined}
                                            >
                                                📝
                                            </span>
                                        )}
                                    </span>
                                    <span className="category-card-name" title={cat}>{cat}</span>
                                    {/* Rozbor děje — až ZA slovem Plot (task 10a) */}
                                    {storyReview && (
                                        <>
                                            <span
                                                className="category-card-review-icon category-card-review-icon-story"
                                                title="Zobrazit rozbor děje"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    openStoryReview()
                                                }}
                                            >
                                                📖
                                            </span>
                                            <span className="category-card-story-label" aria-hidden="true">Děj</span>
                                        </>
                                    )}
                                    {isMedia && (
                                        <span className={`category-card-play-hint${hasTracks ? ' has-local' : ' is-search'}`} aria-hidden="true">
                                            {hasTracks ? (
                                                <>PLAY <PlayIcon /></>
                                            ) : (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                    <polyline points="15 3 21 3 21 9" />
                                                    <line x1="10" y1="14" x2="21" y2="3" />
                                                </svg>
                                            )}
                                        </span>
                                    )}
                                </div>
                                <div className="category-card-right">
                                    <span className="category-card-weight">váha: {fmtWeight(categoryWeights[cat] || 1)}</span>
                                    <span className="category-card-value">{fmtRating(rating)}</span>
                                </div>

                                {isMedia && (
                                    <div className="media-popover" role="menu" onClick={(e) => e.stopPropagation()}>
                                        {hasTracks ? (
                                            <div className="media-popover-inner">
                                                {tracks.map((t, i) => (
                                                    <div key={i} style={{ display: 'contents' }}>
                                                        {/* Oddělovač před prvním klipem z AnimeThemes (Plán 6b) */}
                                                        {t.isExtra && (i === 0 || !tracks[i - 1].isExtra) && (
                                                            <div className="media-popover-divider">Ostatní verze · AnimeThemes.moe</div>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className={`media-track-row${t.isExtra ? ' is-extra' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                playTrack(t)
                                                            }}
                                                            title={t.isExtra ? 'Přehrát (AnimeThemes.moe)' : 'Přehrát (vybraný klip)'}
                                                        >
                                                            <span className={`media-track-badge${t.isExtra ? ' alt' : ''}`}>
                                                                {!t.isExtra && t.kind === 'video' && hasExtraTracks && '⭐ '}{t.label}
                                                            </span>
                                                            <span className="media-track-meta">
                                                                <span className="media-track-song">
                                                                    <ScrollableText text={t.song || cat}>
                                                                        {t.song || cat}
                                                                        {t.isBestPiece && (
                                                                            <span className="best-piece-popover-tag"> (Best Pieces)</span>
                                                                        )}
                                                                    </ScrollableText>
                                                                </span>
                                                                {t.artist && <span className="media-track-artist">{t.artist}</span>}
                                                            </span>
                                                            <span className="media-play-btn"><PlayIcon /></span>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="media-popover-inner">
                                                <div className="media-popover-empty">Klip zatím není v knihovně.</div>
                                                <button
                                                    type="button"
                                                    className="media-track-row ghost"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        searchYoutube(cat)
                                                    }}
                                                >
                                                    <span className="media-track-meta">
                                                        <span className="media-track-song">Hledat {cat} na YouTube</span>
                                                    </span>
                                                    <span className="media-play-btn"><PlayIcon /></span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {/* Radar chart with overlay labels on the right */}
                <div className={`radar-chart-container${compactRadar ? ' radar-compact' : ''}`}>
                    <div className="radar-overlay-wrap" ref={wrapRef}>
                        {entries.map(([cat, rating], i) => {
                            const p = labelPos[i]
                            if (!p) return null

                            // Determine text alignment based on which side of the chart the label is on
                            const isLeft = p.ux < -0.25
                            const isRight = p.ux > 0.25
                            const alignment = isRight ? 'flex-start' : (isLeft ? 'flex-end' : 'center')
                            const txtAlign = isRight ? 'left' : (isLeft ? 'right' : 'center')

                            // Compute the transform to center the label group on the anchor point.
                            // The extra radial offset (vs. 21/18) pushes the text ~1mm further from the icon.
                            const nudgeX = p.ux * 25
                            const nudgeY = p.uy * 22
                            const tx = isRight ? '0%' : (isLeft ? '-100%' : '-50%')
                            const ty = p.uy < -0.5 ? '-100%' : (p.uy > 0.5 ? '0%' : '-50%')

                            // Calculate line rotation angle in radians
                            const angleRad = Math.atan2(p.uy, p.ux)

                            return (
                                <div key={cat}>
                                    {/* Small dot exactly at the outer boundary of the scale */}
                                    <div
                                        className="radar-edge-dot"
                                        style={{
                                            left: `${p.edgeX}px`,
                                            top: `${p.edgeY}px`
                                        }}
                                    />
                                    {/* Connecting dashed line from the scale edge to the icon */}
                                    <div
                                        className="radar-connector-line"
                                        style={{
                                            left: `${p.edgeX}px`,
                                            top: `${p.edgeY}px`,
                                            width: '20px', // Span the distance to the label anchor
                                            transform: `rotate(${angleRad}rad)`
                                        }}
                                    />
                                    {/* The label badge and text box */}
                                    <div
                                        className="radar-overlay-label"
                                        style={{
                                            left: `${p.x}px`,
                                            top: `${p.y}px`
                                        }}
                                    >
                                        <div className="radar-label-icon-circle">{iconFor(cat)}</div>
                                        <div
                                            className="radar-label-text-box"
                                            style={{
                                                transform: `translate(calc(${tx} + ${nudgeX}px), calc(${ty} + ${nudgeY}px))`,
                                                alignItems: alignment,
                                                textAlign: txtAlign
                                            }}
                                        >
                                            <span className="radar-label-name">{cat}</span>
                                            <span className="radar-label-value">{fmtRating(rating)}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        {/* Radar canvas rendered last to ensure browser layers it on top */}
                        <Radar ref={chartRef} data={chartData} options={chartOptions} plugins={chartPlugins} />
                    </div>
                </div>
            </div>

            {/* Průvodce hodnocením kategorií */}
            <CategoryGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} weights={categoryWeights} />

            {/* OP/ED videoklip v překryvném okně */}
            <VideoModal media={videoModal} onClose={() => setVideoModal(null)} />

            {/* OST v plovoucím YouTube přehrávači (zůstane, dokud se neopustí detail) */}
            <FloatingOstPlayer
                key={floatingOst ? (floatingOst.url || floatingOst.ytPlaylistId || 'ost-active') : 'ost-inactive'}
                ost={floatingOst}
                playlist={media.OST}
                onPlayTrack={playTrack}
                onClose={() => setFloatingOst(null)}
            />

            {/* Detailní rozbor konkrétní kategorie */}
            <CategoryDetailModal 
                activeReview={activeReview} 
                onClose={() => setActiveReview(null)} 
            />
        </div>
    )
}

// Modální okno pro detailní textový rozbor kategorie z DOCX
function CategoryDetailModal({ activeReview, onClose }) {
    // Zamkne scroll pozadí (okno i detailový overlay), dokud je modal otevřený
    useModalScrollLock(!!activeReview)

    // Tabulky z rozboru: scroll-x fallback, push-off sticky hlavičky a
    // zaoblení/hranatění rohů při chycení hlavičky — sdílený hook.
    const bodyRef = useRef(null)
    useModalTables(bodyRef, !!activeReview)

    if (!activeReview) return null

    const { category, text, rating, icon } = activeReview

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    return createPortal(
        <div className="category-detail-modal-overlay" onClick={handleOverlayClick}>
            <div className="category-detail-modal">
                <div className="category-detail-modal-header">
                    <div className="category-detail-modal-title">
                        <span className="category-card-icon">{icon || iconFor(category)}</span>
                        <span>{category}</span>
                        {rating !== null && rating !== undefined && (
                            <span className="category-detail-modal-score">{fmtRating(rating)}/10</span>
                        )}
                    </div>
                    <button type="button" className="category-detail-modal-close" onClick={onClose} aria-label="Zavřít">
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
}

export default CategoryRatingsPanel
