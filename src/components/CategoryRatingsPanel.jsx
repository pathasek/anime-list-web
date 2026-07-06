import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
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

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

const svg = (children) => (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
    </svg>
)

const CATEGORY_ICONS = {
    'Animace': svg(<><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>),
    'CGI': svg(<><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>),
    'MC': svg(<><path d="M4 18 2 7l5.5 4L12 4l4.5 7L22 7l-2 11z" /><path d="M4 21h16" /></>),
    'Vedlejší postavy': svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
    'Waifu': svg(<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />),
    'Plot': svg(<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>),
    'Pacing': svg(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />),
    'Story Conclusion': svg(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>),
    'Originalita': svg(<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" /></>),
    'Emoce': svg(<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor" />),
    'Enjoyment': svg(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />),
    'OP': svg(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
    'ED': svg(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
    'OST': svg(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" /><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>)
}

const DEFAULT_ICON = svg(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />)

const iconFor = (cat) => CATEGORY_ICONS[cat] || DEFAULT_ICON

const fmtWeight = (w) => w.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })
const fmtRating = (r) => r.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

// Reads --accent-primary so the chart follows every theme
function useAccentColor(theme, categoryRatings) {
    return useMemo(() => {
        let r = 99, g = 102, b = 241
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
            const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
            if (m) {
                let hex = m[1]
                if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('')
                r = parseInt(hex.slice(0, 2), 16)
                g = parseInt(hex.slice(2, 4), 16)
                b = parseInt(hex.slice(4, 6), 16)
            }
        } catch { /* keep fallback */ }
        return (a) => `rgba(${r}, ${g}, ${b}, ${a})`
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme, categoryRatings])
}

function CategoryRatingsPanel({ categoryRatings, categoryWeights, avgRating }) {
    const { theme } = useTheme()
    const c = useMemo(() => getThemeChartColors(), [theme])
    const accent = useAccentColor(theme, categoryRatings)

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
            // Balanced padding for larger radar with space for labels
            padding: isMobile ? 35 : 45
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
    }), [c, isMobile])

    // Soft glow behind the radar shape
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
                </h3>
                <p className="category-ratings-subtitle">
                    Průměrné hodnocení zohledňuje váhy jednotlivých kategorií.
                </p>
            </div>

            <div className="ratings-flex-container">
                {/* Category cards on the left */}
                <div className="category-cards-grid">
                    {entries.map(([cat, rating]) => (
                        <div key={cat} className="category-rating-card">
                            <div className="category-card-left">
                                <span className="category-card-icon">{iconFor(cat)}</span>
                                <span className="category-card-name" title={cat}>{cat}</span>
                            </div>
                            <div className="category-card-right">
                                <span className="category-card-weight">váha: {fmtWeight(categoryWeights[cat] || 1)}</span>
                                <span className="category-card-value">{fmtRating(rating)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Radar chart with overlay labels on the right */}
                <div className="radar-chart-container">
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
                            const nudgeX = p.ux * 21
                            const nudgeY = p.uy * 18
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
                                            <span className="radar-label-weight">(váha: {fmtWeight(categoryWeights[cat] || 1)})</span>
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
        </div>
    )
}

export default CategoryRatingsPanel
