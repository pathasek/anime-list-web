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
import { getMediaForAnime, youtubeSearchUrl } from '../utils/mediaMatch'
import { VideoModal, FloatingOstPlayer, ScrollableText } from './CategoryMediaPlayers'
import { extractMalId } from '../utils/jikanService'
import { iconFor } from './categoryIcons'
import { RatingInfoButton, CategoryGuideModal } from './RatingGuideModals'

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
const fmtRating = (r) => r.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

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

function CategoryRatingsPanel({ categoryRatings, categoryWeights, avgRating, animeName, animeSeries, malUrl, review, categoryReviews, compactRadar = false }) {
    const { theme } = useTheme()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const c = useMemo(() => getThemeChartColors(), [theme])
    const accent = useAccentColor(theme)

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

    const media = useMemo(
        () => getMediaForAnime(animeName, opEdVideos || [], ostPieces || [], ostWhole || [], animeSeries),
        [animeName, opEdVideos, ostPieces, ostWhole, animeSeries]
    )

    const playTrack = useCallback((t) => {
        if (!t) return
        if (t.kind === 'video') setVideoModal(t)
        else if (t.kind === 'youtube' || t.kind === 'youtube-playlist') setFloatingOst(t)
        else if (t.kind === 'external') window.open(t.url, '_blank', 'noopener')
    }, [])

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

    if (!categoryRatings || entries.length === 0) return null

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
                    {entries.map(([cat, rating]) => {
                        const isMedia = !!MEDIA_CATS[cat]
                        const tracks = isMedia ? media[cat] : null
                        const hasTracks = tracks && tracks.length > 0
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

                        const handleCardClickInner = (e) => {
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
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        className="media-track-row"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            playTrack(t)
                                                        }}
                                                        title="Přehrát"
                                                    >
                                                        <span className="media-track-badge">{t.label}</span>
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
    useEffect(() => {
        if (!activeReview) return
        const html = document.documentElement
        const overlay = document.querySelector('.anime-detail-overlay')
        const prevHtml = html.style.overflow
        const prevOverlay = overlay ? overlay.style.overflow : null
        html.style.overflow = 'hidden'
        if (overlay) overlay.style.overflow = 'hidden'
        return () => {
            html.style.overflow = prevHtml
            if (overlay) overlay.style.overflow = prevOverlay
        }
    }, [activeReview])

    // Chytrý fallback pro tabulky: normálně se buňky zalamují a tabulka se vejde
    // do šířky (bez horizontálního scrollu). Ale když má tabulka tolik sloupců,
    // že by na sloupec zbylo míň než ~110 px (zbytečně úzké/vysoké řádky),
    // radši povolíme horizontální scroll (třída .scroll-x).
    const bodyRef = useRef(null)
    useEffect(() => {
        if (!activeReview) return
        const body = bodyRef.current
        if (!body) return
        const MIN_COL = 110
        const apply = () => {
            body.querySelectorAll('.category-detail-table-wrapper').forEach(wrap => {
                const cols = wrap.querySelectorAll('thead th').length || 1
                const tooCramped = cols * MIN_COL > wrap.clientWidth
                wrap.classList.toggle('scroll-x', tooCramped)
            })
        }
        apply()
        window.addEventListener('resize', apply)
        return () => window.removeEventListener('resize', apply)
    }, [activeReview])

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

// Jednoduchý JSX parser na formátování Markdown textu (tučné, kurzíva, seznamy, tabulky)
export function formatCategoryMarkdown(text) {
    if (!text) return null

    const lines = text.split('\n')
    const elements = []
    let inTable = false
    let tableRows = []
    let listType = null // 'ul' | 'ol' | null
    let listItems = []

    const flushList = (key) => {
        if (!listType) return
        const Tag = listType
        elements.push(
            <Tag key={key} className={`category-detail-${listType}`}>
                {listItems.map((item, idx) => (
                    <li key={idx}>{parseInlineFormatting(item)}</li>
                ))}
            </Tag>
        )
        listItems = []
        listType = null
    }

    const flushTable = (key) => {
        if (tableRows.length === 0) return
        const headers = tableRows[0]
        const dataRows = tableRows.slice(1)
        elements.push(
            <div className="category-detail-table-wrapper" key={key}>
                <table className="category-detail-table">
                    <thead>
                        <tr>
                            {headers.map((cell, cIdx) => (
                                <th key={cIdx}>{parseInlineFormatting(cell)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {dataRows.map((row, idx) => (
                            <tr key={idx}>
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx}>{parseInlineFormatting(cell)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
        tableRows = []
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        if (trimmed === '[TABULKA_START]') {
            flushList(`list-before-table-${i}`)
            inTable = true
            continue
        }
        if (trimmed === '[TABULKA_KONEC]') {
            flushTable(`table-${i}`)
            inTable = false
            continue
        }
        if (inTable) {
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                const cells = trimmed
                    .slice(1, -1)
                    .split('|')
                    .map(c => c.trim())
                tableRows.push(cells)
            }
            continue
        }

        const bulletMatch = line.match(/^(\s*)-\s+(.*)$/)
        const decimalMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/)

        if (bulletMatch) {
            if (listType !== 'ul') {
                flushList(`list-before-ul-${i}`)
                listType = 'ul'
            }
            listItems.push(bulletMatch[2])
            continue
        } else if (decimalMatch) {
            if (listType !== 'ol') {
                flushList(`list-before-ol-${i}`)
                listType = 'ol'
            }
            listItems.push(decimalMatch[3])
            continue
        } else {
            flushList(`list-before-para-${i}`)
        }

        if (trimmed) {
            elements.push(
                <p key={`p-${i}`} className="category-detail-p">
                    {parseInlineFormatting(trimmed)}
                </p>
            )
        }
    }

    flushList('list-final')
    flushTable('table-final')

    return elements
}

function parseInlineFormatting(text) {
    if (!text) return ''

    const tripleRegex = /\*\*\*([^*]+)\*\*\*/g
    const doubleRegex = /\*\*([^*]+)\*\*/g
    const singleRegex = /\*([^*]+)\*/g

    let tokens = [{ type: 'plain', text: text }]

    const runRegex = (regex, type) => {
        let nextTokens = []
        for (const t of tokens) {
            if (t.type !== 'plain') {
                nextTokens.push(t)
                continue
            }
            const parts = t.text.split(regex)
            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 1) {
                    nextTokens.push({ type: type, text: parts[i] })
                } else if (parts[i]) {
                    nextTokens.push({ type: 'plain', text: parts[i] })
                }
            }
        }
        tokens = nextTokens
    }

    runRegex(tripleRegex, 'bold-italic')
    runRegex(doubleRegex, 'bold')
    runRegex(singleRegex, 'italic')

    return tokens.map((tok, idx) => {
        if (tok.type === 'bold-italic') {
            return <strong key={idx}><em>{tok.text}</em></strong>
        }
        if (tok.type === 'bold') {
            return <strong key={idx}>{tok.text}</strong>
        }
        if (tok.type === 'italic') {
            return <em key={idx}>{tok.text}</em>
        }
        return tok.text
    })
}

export default CategoryRatingsPanel
