import { useState, useEffect, useRef } from 'react'
import {
    colorPalettes,
    chartSizes,
    getChartSettings,
    saveChartSettings
} from '../utils/chartSettings'

function ChartSettingsModal({ isOpen, onClose, chartId, chartTitle, onSettingsChange, anchorPosition }) {
    const [settings, setSettings] = useState(getChartSettings(chartId))
    const popoverRef = useRef(null)

    useEffect(() => {
        if (isOpen) {
            setSettings(getChartSettings(chartId))
        }
    }, [isOpen, chartId])

    // Reposition popover to stay within viewport
    useEffect(() => {
        if (isOpen && popoverRef.current && anchorPosition) {
            const el = popoverRef.current
            const rect = el.getBoundingClientRect()
            const vw = window.innerWidth
            const vh = window.innerHeight
            const scrollY = window.scrollY

            let top = anchorPosition.top + 8
            let left = anchorPosition.left - 200

            // Keep within viewport horizontally
            if (left + rect.width > vw - 16) left = vw - rect.width - 16
            if (left < 16) left = 16
            // Keep within viewport vertically (check if it would go below visible area)
            if (top - scrollY + rect.height > vh - 16) top = anchorPosition.top - rect.height - 10

            el.style.top = `${top}px`
            el.style.left = `${left}px`
        }
    }, [isOpen, anchorPosition])

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return
        const handleClick = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                onClose()
            }
        }
        // Delay to avoid immediate close from the same click
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClick)
        }, 50)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClick)
        }
    }, [isOpen, onClose])

    const handleChange = (key, value) => {
        const newSettings = { ...settings, [key]: value }
        setSettings(newSettings)
    }

    const handleSave = () => {
        saveChartSettings(chartId, settings)
        onSettingsChange?.(settings)
        onClose()
    }

    const handleReset = () => {
        const defaultSettings = {
            id: chartId,
            size: 'medium',
            palette: 'default',
            legendPosition: 'right',
            showGrid: true,
            showValues: false,
            customTitle: '',
            axisMin: null,
            axisMax: null,
        }
        setSettings(defaultSettings)
    }

    if (!isOpen) return null

    return (
        <div
            ref={popoverRef}
            className="chart-settings-popover"
            style={{
                position: 'absolute',
                top: anchorPosition ? anchorPosition.top + 8 : '50%',
                left: anchorPosition ? anchorPosition.left - 200 : '50%',
                zIndex: 2000
            }}
        >
            <div className="popover-header">
                <h4>⚙️ Nastavení grafu</h4>
                <button className="popover-close" onClick={onClose}>×</button>
            </div>

            <div className="popover-body">
                {/* Custom Title */}
                <div className="settings-group">
                    <label>Vlastní nadpis</label>
                    <input
                        type="text"
                        placeholder={chartTitle}
                        value={settings.customTitle || ''}
                        onChange={e => handleChange('customTitle', e.target.value)}
                        className="input"
                    />
                </div>



                {/* Color Palette */}
                <div className="settings-group">
                    <label>Barevná paleta</label>
                    <div className="palette-options">
                        {Object.entries(colorPalettes).map(([name, colors]) => (
                            <button
                                key={name}
                                className={`palette-btn ${settings.palette === name ? 'active' : ''}`}
                                onClick={() => handleChange('palette', name)}
                                title={name}
                            >
                                <div className="palette-preview">
                                    {colors.slice(0, 5).map((color, i) => (
                                        <span
                                            key={i}
                                            style={{ backgroundColor: color }}
                                        />
                                    ))}
                                </div>
                                <span className="palette-name">{name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Legend Position */}
                <div className="settings-group">
                    <label>Pozice legendy</label>
                    <select
                        value={settings.legendPosition}
                        onChange={e => handleChange('legendPosition', e.target.value)}
                        className="select"
                    >
                        <option value="top">Nahoře</option>
                        <option value="bottom">Dole</option>
                        <option value="left">Vlevo</option>
                        <option value="right">Vpravo</option>
                        <option value="hidden">Skrytá</option>
                    </select>
                </div>

                {/* Toggle Options */}
                <div className="settings-group settings-toggles">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={settings.showGrid}
                            onChange={e => handleChange('showGrid', e.target.checked)}
                        />
                        <span>Zobrazit mřížku</span>
                    </label>
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={settings.showValues}
                            onChange={e => handleChange('showValues', e.target.checked)}
                        />
                        <span>Zobrazit hodnoty na grafu</span>
                    </label>
                </div>

                {/* Axis Settings */}
                <div className="settings-group">
                    <label>Rozsah os</label>
                    <div className="axis-inputs">
                        <div>
                            <span>Min:</span>
                            <input
                                type="number"
                                placeholder="Auto"
                                value={settings.axisMin ?? ''}
                                onChange={e => handleChange('axisMin', e.target.value ? Number(e.target.value) : null)}
                                className="input input-small"
                            />
                        </div>
                        <div>
                            <span>Max:</span>
                            <input
                                type="number"
                                placeholder="Auto"
                                value={settings.axisMax ?? ''}
                                onChange={e => handleChange('axisMax', e.target.value ? Number(e.target.value) : null)}
                                className="input input-small"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="popover-footer">
                <button className="btn btn-secondary" onClick={handleReset} style={{ fontSize: '0.8rem' }}>
                    🔄 Reset
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.8rem' }}>
                        Zrušit
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: '0.8rem' }}>
                        💾 Uložit
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ChartSettingsModal
