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
        '#E6194B', '#46F0F0', '#F58230', '#3CB44B', '#FFFAC8', '#D2F53C', '#008080',
        '#AA6E28', '#0082C8', '#FABED4', '#F032E6', '#911EB4', '#A3A7FF', '#FFE119', '#9393D1'
    ],
    // GrafTypuPop
    typesPie: ['#4D93D9', '#7030A0', '#F1A983', '#FFFF00', '#A6A6A6', '#FFC000', '#C00000'],
    // GrafHodnoceniDist
    ratingPie: ['#63BE7B', '#B1D580', '#C9E082', '#FFEB84', '#FCBF7B', '#F8696B'],
    // GrafStatusu
    statusPie: ['#798DE7', '#9393D1', '#911EB4', '#FCBF7B', '#A6A6A6'],
    // GrafAnimeSezony
    seasons: {
        'Winter': '#A6C9EC',
        'Spring': '#FFB6C1',
        'Summer': '#77DD77',
        'Fall': '#BE5014'
    },
    // GrafTypuDist
    scoreGradient: {
        1: '#F8696B',
        2: '#FA826F',
        3: '#FA9473',
        4: '#FCAB77',
        5: '#FCBF7B',
        6: '#FFD57F',
        7: '#FFEB84',
        8: '#C9E082',
        9: '#B1D580',
        10: '#63BE7B'
    },
    // GrafAnimeVeku
    ageBar: '#BC9948',
    // GrafTypuKombi
    kombiBar: '#433F7A',
    kombiLine: '#BC9948',
    // GrafStudiiBest
    studiosBar: '#13275C',
    // GrafTematBest
    themesBar: '#BF6A88',
    // GrafZanruBest
    genresBestBar: '#F2D25B',   
    // AnimeHodnoceniVCaseGraf
    timelineLine: '#C00000',
    timelineDecade: '#FFC000',
    timelineCount: '#1550D8',
    // GrafPrumerVeku
    avgAgeBar: '#5B9BD5'
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
