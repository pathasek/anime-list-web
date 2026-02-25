import { useState, useEffect } from 'react'
import ChartSettingsModal from './ChartSettingsModal'
import {
    getChartSettings,
    chartSizes,
    colorPalettes,
    applyPalette,
    buildChartOptions
} from '../utils/chartSettings'

function ChartContainer({
    id,
    title,
    children,
    chartData,
    chartOptions,
    onDataChange,
    onOptionsChange,
    defaultWide = false
}) {
    const [showSettings, setShowSettings] = useState(false)
    const [settings, setSettings] = useState(getChartSettings(id))

    useEffect(() => {
        // Apply settings on mount and when settings change
        if (onDataChange && chartData) {
            const newData = applyPalette(chartData, settings.palette)
            onDataChange(newData)
        }
        if (onOptionsChange && chartOptions) {
            const newOptions = buildChartOptions(chartOptions, settings)
            onOptionsChange(newOptions)
        }
    }, [settings])

    const handleSettingsChange = (newSettings) => {
        setSettings(newSettings)
    }

    const sizeConfig = chartSizes[settings.size] || chartSizes.medium
    const displayTitle = settings.customTitle || title

    // Override span for wide charts if marked as default wide
    const gridColumn = defaultWide && settings.size === 'medium'
        ? 'span 2'
        : sizeConfig.gridColumn

    return (
        <div
            className="chart-container"
            style={{
                gridColumn,
                minHeight: sizeConfig.height
            }}
        >
            <div className="chart-header">
                <div className="chart-title">{displayTitle}</div>
                <button
                    className="chart-settings-btn"
                    onClick={() => setShowSettings(true)}
                    title="Nastavení grafu"
                >
                    ⚙️
                </button>
            </div>
            <div style={{ height: sizeConfig.height }}>
                {children}
            </div>

            <ChartSettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                chartId={id}
                chartTitle={title}
                onSettingsChange={handleSettingsChange}
            />
        </div>
    )
}

export default ChartContainer
