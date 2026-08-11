// ============================================================
// Sdílená logika grafu „Hodnocení epizod" (redesign)
// Používá detail anime (AnimeDetail.jsx) i split view na stránce
// Hodnocení (AnimeRatings.jsx), aby obě místa vypadala stejně.
// Hlavička karty je v komponentě components/EpisodeChartHeader.jsx.
//
// Obsah:
//   EPISODE_TIERS          stupně hodnocení (legenda, tooltip i průvodce „?")
//   episodeAvgLinePlugin   vodorovná čárkovaná čára průměru
//   episodeCrosshairPlugin svislá čárkovaná čára u aktivní epizody
//   episodeHaloPlugin      světelná aura kolem aktivního a krajních bodů
//   trendAreaGradient      jemný přechod pod křivkou trendu
//   makeEpisodeTooltip     externí HTML tooltip ve stylu redesignu
// ============================================================

// ---- Pomocné čtení barev z tématu ----------------------------------------
function themeColor(name, fallback) {
    if (typeof window === 'undefined') return fallback
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return v || fallback
}

// Texty = fallback, primárně z data/rating_guide.json (WORD na ploše).
// `limit` = dolní práh stupně, sdílí ho legenda i tooltip grafu.
export const EPISODE_TIERS = [
    { name: 'Absolute Cinema', range: '10', limit: 10, colorVar: '--rating-10', fallbackColor: '#63be7b', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Epizoda, u které jsem zapomněl dýchat. Perfektní režie, animace i emoce — moment, kvůli kterému se anime sleduje.' },
    { name: 'Awesome', range: '9 – 9,75', limit: 9, colorVar: '--rating-9', fallbackColor: '#b1d580', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Výjimečná epizoda s vrcholem, zvratem nebo payoff momentem, který dlouho rezonuje. Jen kousek od dokonalosti.' },
    { name: 'Great', range: '8 – 8,75', limit: 8, colorVar: '--rating-8', fallbackColor: '#ffeb84', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Silná epizoda, která výrazně posouvá příběh nebo postavy. Žádná hluchá pasáž, chci hned pustit další díl.' },
    { name: 'Good', range: '7 – 7,75', limit: 7, colorVar: '--rating-7', fallbackColor: '#fcbf7b', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Solidní standard dobrého anime. Funguje, baví, ale nemá moment, který by přesáhl rámec epizody.' },
    { name: 'Regular', range: '6 – 6,75', limit: 6, colorVar: '--rating-6', fallbackColor: '#fa9473', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Průměrná, spíš přechodová epizoda — setup, oddech nebo pomalejší tempo. Nezklame, ale ani nenadchne.' },
    { name: 'Bad', range: '< 6', limit: 0, colorVar: '--rating-5', fallbackColor: '#f8696b', get color() { return themeColor(this.colorVar, this.fallbackColor) }, text: 'Epizoda, která mě vyloženě nebavila — filler, nelogičnosti nebo rozbité tempo. Naštěstí vzácnost.' }
]

// Stupeň hodnocení podle číselné hodnoty (10 / 9+ / 8+ / 7+ / 6+ / zbytek)
export function episodeTier(value) {
    const v = typeof value === 'number' ? value : parseFloat(value)
    if (!isFinite(v)) return null
    // Pokud je hodnocení z externích zdrojů (Jikan/IMDb) a je >= 9.75, považujeme ho za Absolute Cinema
    const adjustedValue = v >= 9.75 ? 10 : v
    return EPISODE_TIERS.find(t => adjustedValue >= t.limit) || EPISODE_TIERS[EPISODE_TIERS.length - 1]
}

// Canvas 2D nezná color-mix(), takže barvu z tématu (hex nebo rgb) převedeme
// na rgba() ručně.
function withAlpha(color, alpha) {
    const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (hex) {
        let h = hex[1]
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
        const n = parseInt(h, 16)
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
    }
    const rgb = color.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
    if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
    return color
}

// ---- Plugin: čára průměru -------------------------------------------------
// Hodnotu předej v options.plugins.episodeAvgLine = { value: <číslo> }
export const episodeAvgLinePlugin = {
    id: 'episodeAvgLine',
    afterDatasetsDraw(chart, args, opts) {
        const value = opts && opts.value
        if (typeof value !== 'number' || !isFinite(value)) return
        const y = chart.scales.y
        const area = chart.chartArea
        if (!y || !area) return
        const py = y.getPixelForValue(value)
        if (py < area.top || py > area.bottom) return

        const ctx = chart.ctx
        ctx.save()
        ctx.setLineDash([6, 6])
        ctx.lineWidth = 1
        ctx.strokeStyle = withAlpha(themeColor('--accent-primary', '#6366f1'), 0.5)
        ctx.beginPath()
        ctx.moveTo(area.left, py)
        ctx.lineTo(area.right, py)
        ctx.stroke()
        ctx.restore()
    }
}

// ---- Plugin: svislá čára u aktivní epizody --------------------------------
export const episodeCrosshairPlugin = {
    id: 'episodeCrosshair',
    afterDatasetsDraw(chart) {
        const active = chart.tooltip && chart.tooltip.getActiveElements
            ? chart.tooltip.getActiveElements()
            : []
        if (!active.length) return
        const area = chart.chartArea
        if (!area) return

        const ctx = chart.ctx
        ctx.save()
        ctx.setLineDash([3, 4])
        ctx.lineWidth = 1
        ctx.strokeStyle = withAlpha(themeColor('--text-primary', '#f1f5f9'), 0.22)
        ctx.beginPath()
        ctx.moveTo(active[0].element.x, area.top)
        ctx.lineTo(active[0].element.x, area.bottom)
        ctx.stroke()
        ctx.restore()
    }
}

// ---- Plugin: aura kolem bodů ---------------------------------------------
// Zvýrazní aktivní bod a nejlepší/nejhorší epizodu, stejně jako v návrhu.
export const episodeHaloPlugin = {
    id: 'episodeHalo',
    beforeDatasetsDraw(chart) {
        const last = chart.data.datasets.length - 1
        const meta = chart.getDatasetMeta(last)
        if (!meta || meta.hidden || !meta.data || !meta.data.length) return

        const raw = chart.data.datasets[last].data
            .map(v => typeof v === 'number' ? v : parseFloat(v))
        const values = raw.filter(v => isFinite(v))
        if (!values.length) return
        const max = Math.max(...values)
        const min = Math.min(...values)

        const activeIdx = chart.tooltip && chart.tooltip.getActiveElements
            ? (chart.tooltip.getActiveElements()[0]?.index ?? -1)
            : -1
        const dense = meta.data.length > 40

        const ctx = chart.ctx
        meta.data.forEach((point, i) => {
            const isActive = i === activeIdx
            const isExtreme = raw[i] === max || raw[i] === min
            if (!isActive && !isExtreme) return
            const r = isActive ? (dense ? 11 : 15) : (dense ? 7 : 10)
            ctx.save()
            ctx.globalAlpha = 0.16
            ctx.fillStyle = point.options.backgroundColor
            ctx.beginPath()
            ctx.arc(point.x, point.y, r, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
        })
    }
}

// ---- Přechod pod křivkou trendu ------------------------------------------
// Použij jako backgroundColor datasetu trendu. Chart.js funkci volá se
// scriptable kontextem, takže gradient vzniká až když je známá výška plátna.
export function trendAreaGradient(context) {
    const { chart } = context
    const { ctx, chartArea } = chart
    if (!chartArea) return 'transparent'
    const accent = themeColor('--accent-primary', '#6366f1')
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
    g.addColorStop(0, withAlpha(accent, 0.16))
    g.addColorStop(1, withAlpha(accent, 0))
    return g
}

// ---- Externí HTML tooltip -------------------------------------------------
// getTitle(index) vrací název epizody, nebo null když rozbor neexistuje.
export function makeEpisodeTooltip(getTitle) {
    return (context) => {
        const { chart, tooltip } = context
        const parent = chart.canvas.parentNode
        if (!parent) return

        let el = parent.querySelector('.ep-chart-tip')
        if (el) {
            const oldFoot = el.querySelector('.ep-chart-tip-foot') || el.querySelector('.ep-chart-tip-footer')
            if (oldFoot) oldFoot.remove()
        } else {
            el = document.createElement('div')
            el.className = 'ep-chart-tip'
            el.innerHTML =
                '<div class="ep-chart-tip-head">' +
                '<span class="ep-chart-tip-icon">📝</span>' +
                '<span class="ep-chart-tip-name"></span>' +
                '</div>' +
                '<div class="ep-chart-tip-body">' +
                '<span class="ep-chart-tip-value"></span>' +
                '<span class="ep-chart-tip-unit">/ 10 ·</span>' +
                '<span class="ep-chart-tip-tier"></span>' +
                '</div>'
            parent.appendChild(el)
        }

        if (tooltip.opacity === 0) {
            el.style.opacity = 0
            return
        }

        // Bod epizody je poslední dataset (nad ním leží jen křivka trendu)
        const point = tooltip.dataPoints && tooltip.dataPoints[tooltip.dataPoints.length - 1]
        const value = point
            ? (typeof point.raw === 'number' ? point.raw : parseFloat(point.raw))
            : NaN
        if (!isFinite(value)) {
            el.style.opacity = 0
            return
        }

        const tier = episodeTier(value)
        const title = getTitle ? getTitle(point.dataIndex) : null

        // Kotva tooltipu musí být POZICE TÉČKY epizody (poslední dataset), ne
        // tooltip.caretX/caretY — Chart.js míří caretem na první dataset
        // (křivku trendu), takže by tooltip „plaval" podle rozdílu mezi
        // hodnocením epizody a trendem a nebyl by stejně vysoko nad každou
        // tečkou. element.x/.y drží pozici bodu na plátně.
        const dotX = (point && point.element && typeof point.element.x === 'number') ? point.element.x : tooltip.caretX
        const dotY = (point && point.element && typeof point.element.y === 'number') ? point.element.y : tooltip.caretY

        el.querySelector('.ep-chart-tip-icon').style.display = title ? '' : 'none'
        // textContent, ať se název epizody z dat nikdy neinterpretuje jako HTML
        const label = title || `Epizoda ${point.dataIndex + 1}`
        el.querySelector('.ep-chart-tip-name').textContent = label

        const valueEl = el.querySelector('.ep-chart-tip-value')
        valueEl.textContent = parseFloat(value.toFixed(2))
            .toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        valueEl.style.color = point.element?.options?.backgroundColor || 'inherit'

        const tierEl = el.querySelector('.ep-chart-tip-tier')
        tierEl.textContent = tier ? tier.name : ''
        tierEl.style.color = tier ? tier.color : 'inherit'

        el.style.opacity = 1

        // Automatická poloha poblíž hranic grafu: tooltip je VŽDY nad tečkou
        // dané epizody s fixní mezerou 16 px (nikdy se neotáčí pod bod).
        // Vodorovně je centrovaný na tečku; když se vlevo/vpravo nevejde,
        // posune se dynamicky dovnitř, aby nepřetékal přes okraj kontejneru.
        const tipW = el.offsetWidth
        const PAD = 8

        // left/top = roh tooltipu PŘED transformací; CSS translate(-50%, -100%)
        // posune vizuál o polovinu šířky doleva a o celou výšku nahoru.
        // Vodorovně: anchor = dotX, po translate(-50%) je vizuální střed
        // tooltipu přesně na tečce (vizuální left = dotX - tipW/2).
        let anchorX = dotX

        // Vizuální rozsah [PAD, šířka - tipW - PAD]; anchor se po translate(-50%)
        // posune o tipW/2 doleva, proto je omezení anchoru posunuté o tipW/2.
        const minX = PAD + tipW / 2
        const maxX = Math.max(minX, parent.clientWidth - tipW / 2 - PAD)
        anchorX = Math.min(Math.max(anchorX, minX), maxX)

        // Svisle: fixní mezera 16 px nad tečkou (spodní hrana tooltipu).
        const anchorY = dotY - 16

        el.style.transform = 'translate(-50%, -100%)'
        el.style.left = anchorX + 'px'
        el.style.top = anchorY + 'px'
    }
}

// Vyrovnávací offscreen canvas pro vykreslení 📝 jako značky v grafu
let cachedReviewIconCanvas = null
export function getReviewIconCanvas() {
    if (typeof window === 'undefined') return null
    if (cachedReviewIconCanvas) return cachedReviewIconCanvas
    const canvas = document.createElement('canvas')
    canvas.width = 18
    canvas.height = 18
    const ctx = canvas.getContext('2d')
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('📝', 9, 9)
    cachedReviewIconCanvas = canvas
    return canvas
}
