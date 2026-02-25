// Chart settings utility functions and default values

// Available color palettes
export const colorPalettes = {
    default: ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#f97316', '#14b8a6'],
    rainbow: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6'],
    ocean: ['#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#0284c7', '#0369a1', '#0891b2', '#0d9488', '#059669', '#047857'],
    sunset: ['#f97316', '#fb923c', '#fbbf24', '#f59e0b', '#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#c026d3', '#a21caf'],
    forest: ['#22c55e', '#16a34a', '#15803d', '#166534', '#14532d', '#84cc16', '#65a30d', '#4d7c0f', '#3f6212', '#365314'],
    mono: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#ffffff'],
}

// Size options for charts
export const chartSizes = {
    small: { gridColumn: 'span 1', height: '200px' },
    medium: { gridColumn: 'span 1', height: '280px' },
    large: { gridColumn: 'span 1', height: '400px' },
    wide: { gridColumn: 'span 2', height: '280px' },
    extraWide: { gridColumn: 'span 2', height: '400px' },
}

// Legend position options
export const legendPositions = {
    top: { position: 'top' },
    bottom: { position: 'bottom' },
    left: { position: 'left' },
    right: { position: 'right' },
    hidden: { display: false },
}

// Default chart settings
export const getDefaultChartSettings = (chartId) => ({
    id: chartId,
    size: 'medium',
    palette: 'default',
    legendPosition: 'right',
    showGrid: true,
    showValues: false,
    customTitle: '',
    axisMin: null,
    axisMax: null,
})

// Storage key for chart settings
const STORAGE_KEY = 'anime_dashboard_chart_settings'

// Load all chart settings from localStorage
export const loadChartSettings = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        return stored ? JSON.parse(stored) : {}
    } catch (e) {
        console.error('Failed to load chart settings:', e)
        return {}
    }
}

// Save chart settings to localStorage
export const saveChartSettings = (chartId, settings) => {
    try {
        const allSettings = loadChartSettings()
        allSettings[chartId] = { ...getDefaultChartSettings(chartId), ...settings }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allSettings))
    } catch (e) {
        console.error('Failed to save chart settings:', e)
    }
}

// Get settings for a specific chart
export const getChartSettings = (chartId) => {
    const allSettings = loadChartSettings()
    return allSettings[chartId] || getDefaultChartSettings(chartId)
}

// Apply color palette to chart data
export const applyPalette = (chartData, paletteName) => {
    const palette = colorPalettes[paletteName] || colorPalettes.default
    const newData = { ...chartData }

    if (newData.datasets) {
        newData.datasets = newData.datasets.map(dataset => ({
            ...dataset,
            backgroundColor: Array.isArray(dataset.backgroundColor)
                ? palette.slice(0, dataset.data.length)
                : palette[0],
            borderColor: dataset.borderColor
                ? (Array.isArray(dataset.borderColor) ? palette.slice(0, dataset.data.length) : palette[0])
                : undefined
        }))
    }

    return newData
}

// Build chart options from settings
export const buildChartOptions = (baseOptions, settings) => {
    const legendConfig = legendPositions[settings.legendPosition] || legendPositions.right

    return {
        ...baseOptions,
        plugins: {
            ...baseOptions.plugins,
            legend: legendConfig,
            datalabels: settings.showValues ? {
                display: true,
                color: '#fff',
                font: { weight: 'bold' }
            } : { display: false }
        },
        scales: settings.showGrid !== false ? {
            ...baseOptions.scales,
            x: {
                ...baseOptions.scales?.x,
                grid: {
                    display: settings.showGrid,
                    color: 'rgba(255,255,255,0.1)'
                },
                min: settings.axisMin ?? baseOptions.scales?.x?.min,
                max: settings.axisMax ?? baseOptions.scales?.x?.max,
            },
            y: {
                ...baseOptions.scales?.y,
                grid: {
                    display: settings.showGrid,
                    color: 'rgba(255,255,255,0.1)'
                },
                min: settings.axisMin ?? baseOptions.scales?.y?.min,
                max: settings.axisMax ?? baseOptions.scales?.y?.max,
            }
        } : baseOptions.scales
    }
}

// Reset all chart settings
export const resetAllChartSettings = () => {
    localStorage.removeItem(STORAGE_KEY)
}
