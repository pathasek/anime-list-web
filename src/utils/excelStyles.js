// utils/excelStyles.js

// ── Gradient helpers for Chart.js scriptable options ──
export const createVerticalGradient = (color1, color2) => (context) => {
    const chart = context.chart
    const { ctx, chartArea } = chart
    if (!chartArea) return color1
    const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top)
    g.addColorStop(0, color1)
    g.addColorStop(1, color2)
    return g
}

export const createHorizontalGradient = (color1, color2) => (context) => {
    const chart = context.chart
    const { ctx, chartArea } = chart
    if (!chartArea) return color1
    const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
    g.addColorStop(0, color1)
    g.addColorStop(1, color2)
    return g
}

// ── Premium tooltip config ──
export const premiumTooltipConfig = {
    backgroundColor: 'rgba(12, 12, 20, 0.94)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    titleColor: '#f1f5f9',
    bodyColor: '#94a3b8',
    cornerRadius: 8,
    padding: 12,
    boxPadding: 4,
    usePointStyle: true,
    titleFont: { weight: '600', size: 13 },
    bodyFont: { size: 12 }
}

// 1. Palettes — modernized from Excel XML
export const excelPalettes = {
    // GrafZanru, AnimeGenreChordChart
    kellysMaxContrast: [
        '#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#ef4444',
        '#0ea5e9', '#f43f5e', '#14b8a6', '#f97316', '#a855f7', '#4f46e5', '#22c55e', '#eab308'
    ],
    // GrafTypuPop
    typesPie: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b', '#10b981', '#ef4444'],
    // GrafHodnoceniDist
    ratingPie: ['#10b981', '#84cc16', '#a3e635', '#fef08a', '#f97316', '#ef4444'],
    // GrafStatusu
    statusPie: ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b'],
    // GrafAnimeSezony
    seasons: {
        'Winter': '#38bdf8', // Sky
        'Spring': '#f472b6', // Pink
        'Summer': '#4ade80', // Green
        'Fall': '#fb923c'    // Orange
    },
    // GrafTypuDist
    scoreGradient: {
        1: '#ef4444',
        2: '#f87171',
        3: '#f97316',
        4: '#fb923c',
        5: '#facc15',
        6: '#a3e635',
        7: '#4ade80',
        8: '#22c55e',
        9: '#10b981',
        10: '#059669'
    },
    // GrafAnimeVeku
    ageBar: '#8b5cf6',
    // GrafTypuKombi
    kombiBar: '#6366f1',
    kombiLine: '#f59e0b',
    // GrafStudiiBest
    studiosBar: '#3b82f6',
    // GrafTematBest
    themesBar: '#ec4899',
    // GrafZanruBest
    genresBestBar: '#f59e0b',   
    // AnimeHodnoceniVCaseGraf
    timelineLine: '#ef4444',
    timelineDecade: '#f59e0b',
    timelineCount: '#3b82f6',
    // GrafPrumerVeku
    avgAgeBar: '#10b981'
};

// 2. Chart.js Custom Plugins
export const excelImageBackgroundPlugin = {
    id: 'excelImageBackground',
    beforeDraw: (chart, args, options) => {
        if (options.imagePath) {
            const ctx = chart.ctx;
            const { top, left, width, height } = chart.chartArea;
            
            // Draw background behind entire canvas, not just chartArea, if specified
            const drawFull = options.fullCanvas;
            const drawX = drawFull ? 0 : left;
            const drawY = drawFull ? 0 : top;
            const drawW = drawFull ? chart.width : width;
            const drawH = drawFull ? chart.height : height;

            // Load logic cache
            if (!chart.__bgImage) {
                const img = new Image();
                img.src = options.imagePath;
                img.onload = () => chart.draw();
                chart.__bgImage = img;
            } else if (chart.__bgImage.complete && chart.__bgImage.naturalWidth > 0) {
                ctx.save();
                // Draw stretched to fit
                ctx.drawImage(chart.__bgImage, drawX, drawY, drawW, drawH);
                ctx.restore();
            }
        } else if (options.color) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = options.color;
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    }
};

export const decadeFloatingLabelsPlugin = {
    id: 'decadeFloatingLabels',
    afterDatasetsDraw: (chart, args, options) => {
        // Only draw on AnimeHodnoceniVCaseGraf
        if (!options.enabled) return;
        
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = 'bold 16px "Aptos Narrow", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // This is a rough estimation of drawing '1990s', '2000s' floating in the background based on x-axis
        const xScale = chart.scales.x;
        const yScale = chart.scales['y-rating']; // primary Y used for positioning height
        
        if (!xScale || !yScale) {
            ctx.restore();
            return;
        }

        const decades = [
            { label: '1980s', year: 1985 },
            { label: '1990s', year: 1995 },
            { label: '2000s', year: 2005 },
            { label: '2010s', year: 2015 },
            { label: '2020s', year: 2025 }
        ];

        // Draw the text at the bottom half of the graph
        const yPos = yScale.getPixelForValue(yScale.min + (yScale.max - yScale.min) * 0.15);

        decades.forEach(d => {
            // Find if year exists in data labels
            const index = chart.data.labels.indexOf(String(d.year));
            if (index !== -1) {
                const xPos = xScale.getPixelForValue(index);
                ctx.fillText(d.label, xPos, yPos);
            } else if (xScale.type === 'linear') {
                 // if X axis is linear/time rather than categorical
                 if (d.year >= xScale.min && d.year <= xScale.max) {
                     const xPos = xScale.getPixelForValue(d.year);
                     ctx.fillText(d.label, xPos, yPos);
                 }
            }
        });
        
        ctx.restore();
    }
};
