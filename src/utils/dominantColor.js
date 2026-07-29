// Dominantní barva obrázku pro gradient za kartou (vzhled à la Spotify).
// Obrázky playlistů leží v public/images/spotify, tedy na stejné doméně —
// canvas se proto nezašpiní (tainted) a jde z něj číst.
//
// Postup: obrázek se zmenší na 12×12, projdou se pixely a průměruje se s vahou
// podle sytosti. Šedé, skoro bílé a skoro černé pixely se přeskakují — jinak by
// tmavé pozadí obalu přebilo tu barvu, která je na něm zajímavá.

const cache = new Map()      // src → Promise<{r,g,b} | null>
const SIZE = 12

function analyze(img) {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, SIZE, SIZE)

    let data
    try {
        data = ctx.getImageData(0, 0, SIZE, SIZE).data
    } catch {
        return null   // tainted canvas (obrázek z cizí domény bez CORS)
    }

    let sr = 0, sg = 0, sb = 0, weight = 0
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
        if (a < 128) continue
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const lum = (max + min) / 2
        if (lum < 24 || lum > 235) continue        // skoro černá / skoro bílá
        const sat = max === 0 ? 0 : (max - min) / max
        if (sat < 0.12) continue                    // šedivé pixely nenesou barvu
        const w = sat * sat                         // sytější pixely váží víc
        sr += r * w; sg += g * w; sb += b * w; weight += w
    }
    if (weight === 0) return null

    let r = Math.round(sr / weight)
    let g = Math.round(sg / weight)
    let b = Math.round(sb / weight)

    // Velmi tmavý výsledek by v gradientu splynul s pozadím → rozsvítit
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (lum < 70) {
        const k = 70 / Math.max(lum, 1)
        r = Math.min(255, Math.round(r * k))
        g = Math.min(255, Math.round(g * k))
        b = Math.min(255, Math.round(b * k))
    }
    return { r, g, b }
}

/**
 * @param {string} src cesta k obrázku (stejná doména)
 * @returns {Promise<{r:number,g:number,b:number}|null>} null = nepodařilo se
 */
export function getDominantColor(src) {
    if (!src) return Promise.resolve(null)
    if (cache.has(src)) return cache.get(src)

    const p = new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(analyze(img))
        img.onerror = () => resolve(null)
        img.src = src
    })
    cache.set(src, p)
    return p
}
