import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * SpiralWordCloud — DOM-rendered word cloud with elliptical Archimedean spiral.
 * Uses canvas for text measurement, renders as positioned <span> elements.
 * The spiral stretches horizontally (2:1 ratio) to fill wide containers
 * and auto-crops to actual content bounds to eliminate dead space.
 */
function SpiralWordCloud({ tags, tagDescriptions = {}, onTagClick, selectedTags, excludedTags }) {
    const containerRef = useRef(null)
    const [placedWords, setPlacedWords] = useState([])
    const [cloudHeight, setCloudHeight] = useState(320)

    // Observe container width
    const [containerWidth, setContainerWidth] = useState(0)
    useEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver(entries => {
            setContainerWidth(entries[0].contentRect.width)
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    // Spiral placement algorithm
    useEffect(() => {
        if (!tags?.length || containerWidth < 100) return

        const width = containerWidth
        // Use a wide, short layout area for placement calculation
        const layoutH = Math.max(340, Math.min(500, width * 0.35))
        const cx = width / 2
        const cy = layoutH / 2

        // Off-screen canvas for text measurement
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        const maxScore = tags[0].score
        const minScore = tags[Math.min(tags.length - 1, 99)].score
        // Wider font range for dramatic size differences
        const minFont = 9
        const maxFont = 54

        // Prepare words — use power curve for more dramatic sizing
        const words = tags.slice(0, 100).map(tag => {
            const linearRatio = (tag.score - minScore) / (maxScore - minScore || 1)
            // Power curve makes big words bigger, small words smaller
            const ratio = Math.pow(linearRatio, 0.7)
            const fontSize = Math.round(minFont + ratio * (maxFont - minFont))
            ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
            const tw = ctx.measureText(tag.label).width + 8  // tighter padding
            const th = fontSize * 1.25 + 4
            return { label: tag.label, score: tag.score, fontSize, w: tw, h: th, ratio, x: 0, y: 0, placed: false }
        })

        // Finer grid for tighter packing
        const gs = 6
        const cols = Math.ceil(width / gs)
        const rows = Math.ceil(layoutH / gs)
        const grid = new Uint8Array(cols * rows)

        const markGrid = (x, y, w, h) => {
            const c0 = Math.max(0, (x / gs) | 0)
            const c1 = Math.min(cols - 1, ((x + w) / gs) | 0)
            const r0 = Math.max(0, (y / gs) | 0)
            const r1 = Math.min(rows - 1, ((y + h) / gs) | 0)
            for (let r = r0; r <= r1; r++)
                for (let c = c0; c <= c1; c++)
                    grid[r * cols + c] = 1
        }

        const hitTest = (x, y, w, h) => {
            const c0 = Math.max(0, (x / gs) | 0)
            const c1 = Math.min(cols - 1, ((x + w) / gs) | 0)
            const r0 = Math.max(0, (y / gs) | 0)
            const r1 = Math.min(rows - 1, ((y + h) / gs) | 0)
            for (let r = r0; r <= r1; r++)
                for (let c = c0; c <= c1; c++)
                    if (grid[r * cols + c]) return true
            return false
        }

        const placed = []
        const spiralStep = 0.25   // smaller steps = tighter packing
        const rGrowth = 1.4       // slower growth = denser core
        // Elliptical stretch: 2x horizontal, 1x vertical
        const xStretch = 2.2
        const yStretch = 1.0

        words.forEach((word, idx) => {
            let angle = idx * 0.618 // golden angle offset for variety
            for (let i = 0; i < 5000; i++) {
                const r = rGrowth * angle / (2 * Math.PI)
                const x = cx + r * xStretch * Math.cos(angle) - word.w / 2
                const y = cy + r * yStretch * Math.sin(angle) - word.h / 2

                if (x >= 0 && y >= 0 && x + word.w <= width && y + word.h <= layoutH) {
                    if (!hitTest(x, y, word.w, word.h)) {
                        word.x = x
                        word.y = y
                        word.placed = true
                        markGrid(x, y, word.w, word.h)
                        placed.push({ ...word })
                        break
                    }
                }
                angle += spiralStep
            }
        })

        // Auto-crop: find actual bounding box of placed words, add padding
        if (placed.length > 0) {
            let minY = Infinity, maxY = -Infinity
            placed.forEach(w => {
                minY = Math.min(minY, w.y)
                maxY = Math.max(maxY, w.y + w.h)
            })
            const pad = 12
            const cropTop = Math.max(0, minY - pad)
            const actualHeight = maxY - cropTop + pad

            // Shift all words up by cropTop
            placed.forEach(w => { w.y -= cropTop })

            setCloudHeight(Math.ceil(actualHeight))
        }

        setPlacedWords(placed)
    }, [tags, containerWidth])

    const getColor = useCallback((ratio) => {
        const hue = 210 + ratio * 150
        const sat = 55 + ratio * 35
        const light = 48 + (1 - ratio) * 22
        return `hsl(${hue}, ${sat}%, ${light}%)`
    }, [])

    return (
        <div ref={containerRef} className="spiral-word-cloud" style={{ height: `${cloudHeight}px` }}>
            {placedWords.map(word => {
                const isSel = selectedTags?.has(word.label)
                const isExcl = excludedTags?.has(word.label)
                return (
                    <span
                        key={word.label}
                        className={`wc-spiral-tag${isSel ? ' selected' : ''}${isExcl ? ' excluded' : ''}`}
                        style={{
                            position: 'absolute',
                            left: `${word.x}px`,
                            top: `${word.y}px`,
                            fontSize: `${word.fontSize}px`,
                            color: isSel ? 'var(--accent-primary)' : isExcl ? 'var(--accent-red)' : getColor(word.ratio),
                            opacity: isExcl ? 0.25 : word.ratio * 0.3 + 0.7,
                        }}
                        title={tagDescriptions[word.label] || ''}
                        onClick={() => onTagClick?.(word.label)}
                    >
                        {word.label}
                    </span>
                )
            })}
        </div>
    )
}

export default SpiralWordCloud
