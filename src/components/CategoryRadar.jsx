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
import { iconFor } from './categoryIcons'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

// ============================================================
// Samostatný pavoučí graf kategorií ve stylu detailu anime
// (radiální gradient, glow, HTML overlay popisky s ikonami).
// Navíc podporuje druhý (overlay) dataset — např. vybranou část
// série vykreslenou novou barvou přes průměr série.
// CategoryRatingsPanel v detailu anime zůstává beze změny.
// ============================================================

const fmtRating = (r) => (r === null || r === undefined || isNaN(r))
    ? '–'
    : Number(r).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function CategoryRadar({
    entries,                                   // [[kategorie, hodnota]] — primární dataset (průměr)
    primaryLabel = 'Průměr',
    primaryColor = { r: 236, g: 72, b: 153 },  // růžová (série)
    overlayEntries = null,                     // [[kategorie, hodnota|null]] zarovnané na stejné kategorie
    overlayLabel = null,
    overlayColor = { r: 99, g: 102, b: 241 },  // indigo (vybraná část)
    height = 460
}) {
    const { theme } = useTheme()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const c = useMemo(() => getThemeChartColors(), [theme])

    const rgba = useCallback((col, a) => `rgba(${col.r}, ${col.g}, ${col.b}, ${a})`, [])
    const hasOverlay = !!(overlayEntries && overlayEntries.some(([, v]) => v !== null && v !== undefined))

    const chartRef = useRef(null)
    const wrapRef = useRef(null)
    const [labelPos, setLabelPos] = useState([])

    const makeGradientBg = useCallback((col) => (context) => {
        const chart = context.chart
        const scale = chart.scales?.r
        if (!chart.chartArea || !scale) return rgba(col, 0.25)
        const gradient = chart.ctx.createRadialGradient(
            scale.xCenter, scale.yCenter, 0,
            scale.xCenter, scale.yCenter, Math.max(scale.drawingArea, 1)
        )
        gradient.addColorStop(0, rgba(col, 0.05))
        gradient.addColorStop(0.75, rgba(col, 0.26))
        gradient.addColorStop(1, rgba(col, 0.48))
        return gradient
    }, [rgba])

    const chartData = useMemo(() => {
        const datasets = []
        // Chart.js kreslí dataset s indexem 0 NAVRCHU → overlay musí být první
        if (hasOverlay) {
            datasets.push({
                label: overlayLabel || 'Vybraná část',
                data: overlayEntries.map(([, v]) => v),
                backgroundColor: makeGradientBg(overlayColor),
                borderColor: rgba(overlayColor, 1),
                borderWidth: 2.2,
                pointBackgroundColor: c.pointBorder,
                pointBorderColor: rgba(overlayColor, 1),
                pointBorderWidth: 1.5,
                pointRadius: 3.5,
                pointHoverRadius: 5
            })
        }
        datasets.push({
            label: primaryLabel,
            data: entries.map(([, v]) => v),
            backgroundColor: makeGradientBg(primaryColor),
            borderColor: rgba(primaryColor, hasOverlay ? 0.55 : 1),
            borderWidth: 2,
            ...(hasOverlay ? { borderDash: [5, 4] } : {}),
            pointBackgroundColor: hasOverlay ? rgba(primaryColor, 0.5) : c.pointBorder,
            pointBorderColor: rgba(primaryColor, hasOverlay ? 0.6 : 1),
            pointBorderWidth: 1.5,
            pointRadius: hasOverlay ? 2.5 : 3.5,
            pointHoverRadius: 5
        })
        return { labels: entries.map(([cat]) => cat), datasets }
    }, [entries, overlayEntries, hasOverlay, primaryLabel, overlayLabel, primaryColor, overlayColor, makeGradientBg, rgba, c])

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

    const { radarMin, radarMax } = useMemo(() => {
        const values = [
            ...entries.map(([, v]) => v),
            ...(overlayEntries ? overlayEntries.map(([, v]) => v) : [])
        ].filter(v => v !== null && v !== undefined && !isNaN(v))
        const minVal = values.length > 0 ? Math.min(...values) : 0
        const maxVal = values.length > 0 ? Math.max(...values) : 10
        return { radarMin: Math.max(0, Math.floor(minVal - 1)), radarMax: maxVal }
    }, [entries, overlayEntries])

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: isMobile ? 35 : 45 },
        scales: {
            r: {
                min: radarMin,
                max: radarMax,
                ticks: {
                    stepSize: 1,
                    color: c.textMuted,
                    showLabelBackdrop: false,
                    font: { size: isMobile ? 9 : 11 },
                    angle: 18,
                    textStrokeColor: '#111019',
                    textStrokeWidth: 3,
                    callback: (value) => value === 0 ? '' : value.toLocaleString('cs-CZ')
                },
                grid: { circular: true, color: c.grid },
                angleLines: { color: c.grid, borderDash: [3, 5] },
                pointLabels: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.dataset.label}: ${fmtRating(ctx.parsed.r)}`
                }
            }
        }
    }), [c, isMobile, radarMin, radarMax])

    // Glow za tvarem radaru + překreslení čísel škály nad body (stejně jako v detailu)
    const chartPlugins = useMemo(() => [{
        id: 'categoryRadarStandaloneGlow',
        beforeDatasetsDraw(chart) {
            chart.ctx.save()
            chart.ctx.shadowColor = rgba(hasOverlay ? overlayColor : primaryColor, 0.5)
            chart.ctx.shadowBlur = 20
        },
        afterDatasetsDraw(chart) {
            chart.ctx.restore()
        }
    }, {
        id: 'categoryRadarStandaloneTicksOnTop',
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
    }], [rgba, hasOverlay, primaryColor, overlayColor])

    // HTML overlay popisky umístěné podle radiální škály (ikony + hodnoty)
    const computePositions = useCallback(() => {
        const chart = chartRef.current
        const scale = chart?.scales?.r
        if (!scale || typeof scale.getPointPosition !== 'function') return
        const count = chart.data.labels.length
        const next = []
        for (let i = 0; i < count; i++) {
            const pos = scale.getPointPosition(i, scale.drawingArea + 34)
            const edgePos = scale.getPointPosition(i, scale.drawingArea)
            const dx = pos.x - scale.xCenter
            const dy = pos.y - scale.yCenter
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            next.push({
                x: pos.x, y: pos.y,
                edgeX: edgePos.x, edgeY: edgePos.y,
                ux: dx / len, uy: dy / len
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
    }, [computePositions, entries, overlayEntries, theme])

    if (!entries || entries.length === 0) return null

    return (
        <div className="category-radar-standalone" style={{ height: `${height}px` }}>
            <div className="radar-overlay-wrap" style={{ transform: 'none' }} ref={wrapRef}>
                {entries.map(([cat, rating], i) => {
                    const p = labelPos[i]
                    if (!p) return null

                    const isLeft = p.ux < -0.25
                    const isRight = p.ux > 0.25
                    const alignment = isRight ? 'flex-start' : (isLeft ? 'flex-end' : 'center')
                    const txtAlign = isRight ? 'left' : (isLeft ? 'right' : 'center')

                    const nudgeX = p.ux * 25
                    const nudgeY = p.uy * 22
                    const tx = isRight ? '0%' : (isLeft ? '-100%' : '-50%')
                    const ty = p.uy < -0.5 ? '-100%' : (p.uy > 0.5 ? '0%' : '-50%')
                    const angleRad = Math.atan2(p.uy, p.ux)

                    const overlayVal = hasOverlay ? overlayEntries[i]?.[1] : null
                    const hasOverlayVal = overlayVal !== null && overlayVal !== undefined && !isNaN(overlayVal)

                    return (
                        <div key={cat}>
                            <div className="radar-edge-dot" style={{ left: `${p.edgeX}px`, top: `${p.edgeY}px` }} />
                            <div
                                className="radar-connector-line"
                                style={{
                                    left: `${p.edgeX}px`, top: `${p.edgeY}px`,
                                    width: '20px', transform: `rotate(${angleRad}rad)`
                                }}
                            />
                            <div className="radar-overlay-label" style={{ left: `${p.x}px`, top: `${p.y}px` }}>
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
                                    {hasOverlayVal ? (
                                        <>
                                            <span className="radar-label-value" style={{ color: rgba(overlayColor, 1) }}>
                                                {fmtRating(overlayVal)}
                                            </span>
                                            <span className="radar-label-value-sub" style={{ color: rgba(primaryColor, 0.85) }}>
                                                Ø {fmtRating(rating)}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="radar-label-value" style={hasOverlay ? { color: rgba(primaryColor, 1) } : undefined}>
                                            {fmtRating(rating)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
                <Radar ref={chartRef} data={chartData} options={chartOptions} plugins={chartPlugins} />
            </div>
        </div>
    )
}

export default CategoryRadar
