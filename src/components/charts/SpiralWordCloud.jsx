import { useRef, useEffect, useState, useCallback } from 'react'
import cloud from 'd3-cloud'

/**
 * SpiralWordCloud — Real word cloud using d3-cloud layout engine.
 * Fits itself to parent container width and height automatically.
 */
function SpiralWordCloud({ tags, tagDescriptions = {}, onTagClick, selectedTags, excludedTags }) {
    const containerRef = useRef(null)
    const [placedWords, setPlacedWords] = useState([])
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

    // Observe container width and height
    useEffect(() => {
        if (!containerRef.current) return
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect
            if (width > 50 && height > 50) {
                setDimensions({ width, height })
            }
        })
        ro.observe(containerRef.current)
        return () => ro.disconnect()
    }, [])

    // d3-cloud layout calculation
    useEffect(() => {
        if (!tags?.length || dimensions.width < 50 || dimensions.height < 50) return

        const width = dimensions.width
        const height = dimensions.height

        const maxScore = tags[0].score
        const minScore = tags[Math.min(tags.length - 1, 159)].score
        const minFont = 9
        const maxFont = 90

        const words = tags.slice(0, 160).map(tag => {
            const linearRatio = (tag.score - minScore) / (maxScore - minScore || 1)
            const ratio = Math.pow(linearRatio, 1.1)
            
            // Group into 8 discrete typographic/visual levels
            const levels = 8
            const steppedRatio = Math.round(ratio * levels) / levels
            const fontSize = Math.round(minFont + steppedRatio * (maxFont - minFont))
            
            return {
                text: tag.label,
                size: fontSize,
                score: tag.score,
                ratio: steppedRatio,
            }
        })

        const layout = cloud()
            .size([width, height])
            .words(words)
            .padding(8)
            .rotate(0)
            .font('Inter, system-ui, sans-serif')
            .fontWeight(600)
            .fontSize(d => d.size)
            .spiral('archimedean')
            .on('end', output => {
                setPlacedWords(output)
            })

        layout.start()
    }, [tags, dimensions.width, dimensions.height])

    const getColor = useCallback((ratio) => {
        if (ratio >= 1.0) return 'var(--accent-red)'
        if (ratio >= 0.875) return 'var(--accent-primary)'
        if (ratio >= 0.75) return 'var(--accent-secondary)'
        if (ratio >= 0.625) return 'var(--accent-pink)'
        if (ratio >= 0.5) return 'var(--accent-cyan)'
        if (ratio >= 0.375) return 'var(--accent-emerald)'
        if (ratio >= 0.25) return 'var(--accent-amber)'
        if (ratio >= 0.125) return 'var(--text-secondary)'
        return 'var(--text-muted)'
    }, [])

    return (
        <div ref={containerRef} className="spiral-word-cloud" style={{ height: '100%', minHeight: '300px' }}>
            {dimensions.width > 0 && dimensions.height > 0 && (
                <svg width={dimensions.width} height={dimensions.height} className="wc-svg">
                    <g transform={`translate(${dimensions.width / 2}, ${dimensions.height / 2})`}>
                        {placedWords.map(word => {
                            const isSel = selectedTags?.has(word.text)
                            const isExcl = excludedTags?.has(word.text)
                            return (
                                <text
                                    key={word.text}
                                    className={`wc-spiral-tag${isSel ? ' selected' : ''}${isExcl ? ' excluded' : ''}`}
                                    textAnchor="middle"
                                    transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`}
                                    style={{
                                        fontSize: `${word.size}px`,
                                        fontFamily: 'Inter, system-ui, sans-serif',
                                        fontWeight: 600,
                                        fill: isSel ? 'var(--accent-primary)' : isExcl ? 'var(--accent-red)' : getColor(word.ratio),
                                        opacity: isExcl ? 0.25 : word.ratio * 0.3 + 0.7,
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                    onClick={() => onTagClick?.(word.text)}
                                >
                                    <title>{tagDescriptions[word.text] || ''}</title>
                                    {word.text}
                                </text>
                            )
                        })}
                    </g>
                </svg>
            )}
        </div>
    )
}

export default SpiralWordCloud
