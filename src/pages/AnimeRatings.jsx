import { useState, useEffect, useMemo } from 'react'
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    CategoryScale,
    LinearScale,
    BarElement,
    ScatterController,
    BubbleController
} from 'chart.js'
import { Radar, Bar, Chart } from 'react-chartjs-2'
import regression from 'regression'
import './AnimeRatings.css'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, CategoryScale, LinearScale, BarElement, ScatterController, BubbleController)

const categoryWeights = {
    "Animace": 2.0, "CGI": 1.8, "MC": 3.0, "Vedlejší postavy": 2.5, "Waifu": 1.5,
    "Plot": 4.0, "Pacing": 1.5, "Story Conclusion": 1.5, "Originalita": 2.5,
    "Emoce": 3.5, "Enjoyment": 4.0, "OP": 1.0, "ED": 0.5, "OST": 2.0
}

function AnimeRatings() {
    // ---- DATA STATES ----
    const [animeList, setAnimeList] = useState([])
    const [categoryRatings, setCategoryRatings] = useState([])
    const [episodeRatings, setEpisodeRatings] = useState([])
    const [notes, setNotes] = useState([])
    const [loading, setLoading] = useState(true)

    // ---- UI STATES: ROW 1 ----
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedAnimeTitle, setSelectedAnimeTitle] = useState(null)

    // ---- UI STATES: ROW 2 ----
    const [slicerTyp, setSlicerTyp] = useState('Kategorie')
    const [slicerPolozka, setSlicerPolozka] = useState('Vedlejší postavy')
    const [slicerHodnoceni, setSlicerHodnoceni] = useState('Všechna')

    // ---- UI STATES: ROW 3 ----
    const [lbTyp, setLbTyp] = useState('Epizody')
    const [lbSort, setLbSort] = useState('Nejlepší')
    const [lbCount, setLbCount] = useState(30)

    // Load data
    useEffect(() => {
        Promise.all([
            fetch('data/anime_list.json').then(r => r.json()),
            fetch('data/category_ratings.json').then(r => r.json()),
            fetch('data/episode_ratings.json').then(r => r.json()),
            fetch('data/notes.json').then(r => r.json())
        ]).then(([al, cr, er, nt]) => {
            // Sort anime list by reading primarily those that have category ratings
            const animeWithRatings = new Set(cr.map(c => c.name))
            const filteredAl = al.filter(a => animeWithRatings.has(a.name)).sort((a,b) => {
                const ra = Number(a.rating) || 0;
                const rb = Number(b.rating) || 0;
                return rb - ra; // Sort by FH descending
            })
            setAnimeList(filteredAl)
            setCategoryRatings(cr)
            setEpisodeRatings(er)
            setNotes(nt)

            if (filteredAl.length > 0) {
                setSelectedAnimeTitle(filteredAl[0].name)
            }
            setLoading(false)
        }).catch(err => {
            console.error("Failed to load data for Anime Ratings:", err)
            setLoading(false)
        })
    }, [])

    // ============================================
    // ROW 1 DATA MEMOIZATION
    // ============================================
    const row1AnimeList = useMemo(() => {
        if (!searchQuery) return animeList
        const lowerSearch = searchQuery.toLowerCase()
        return animeList.filter(a => a.name.toLowerCase().includes(lowerSearch))
    }, [animeList, searchQuery])

    const selectedAnimeObj = useMemo(() => {
        return animeList.find(a => a.name === selectedAnimeTitle) || null
    }, [animeList, selectedAnimeTitle])

    const selectedAnimeCategories = useMemo(() => {
        const found = categoryRatings.find(cr => cr.name === selectedAnimeTitle)
        return found ? found.categories : null
    }, [categoryRatings, selectedAnimeTitle])

    const selectedAnimeEpisodes = useMemo(() => {
        const found = episodeRatings.find(er => er.name === selectedAnimeTitle)
        return found ? found.episodes : null
    }, [episodeRatings, selectedAnimeTitle])

    const selectedAnimeNote = useMemo(() => {
        const found = notes.find(n => n.name === selectedAnimeTitle)
        return found ? found.note : null
    }, [notes, selectedAnimeTitle])

    const avgCategoryRating = useMemo(() => {
        if (!selectedAnimeCategories) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(selectedAnimeCategories).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : 'N/A'
    }, [selectedAnimeCategories])

    // Radar Chart Data & Options
    const radarData = useMemo(() => {
        if (!selectedAnimeCategories) return null
        const categoriesUrls = Object.keys(selectedAnimeCategories)
        const labels = categoriesUrls.map(c => `${c}|(v. ${categoryWeights[c] || 1})`)
        const values = Object.values(selectedAnimeCategories)
        return {
            labels: labels,
            datasets: [{
                label: 'Hodnocení',
                data: values,
                backgroundColor: 'rgba(99, 102, 241, 0.3)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                pointBorderColor: '#fff',
            }]
        }
    }, [selectedAnimeCategories])

    const radarMin = useMemo(() => {
        if (!selectedAnimeCategories) return 0
        const values = Object.values(selectedAnimeCategories)
        const minVal = values.length > 0 ? Math.min(...values) : 0
        return Math.max(0, Math.floor(minVal - 1))
    }, [selectedAnimeCategories])

    const radarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            r: {
                beginAtZero: false,
                min: radarMin,
                max: 10,
                ticks: { stepSize: 1, color: 'rgba(255,255,255,0.85)', backdropColor: 'rgba(0,0,0,0.5)', font: { size: 10 } },
                grid: { color: 'rgba(255,255,255,0.15)' },
                angleLines: { color: 'rgba(255,255,255,0.15)' },
                pointLabels: {
                    color: 'rgba(255,255,255,0.9)', font: { size: 11 },
                    callback: (label) => label.includes('|') ? label.split('|') : label
                }
            }
        },
        plugins: { legend: { display: false } }
    }

    // Episode Bar Chart Data
    const episodeChartData = useMemo(() => {
        if (!selectedAnimeEpisodes || selectedAnimeEpisodes.length === 0) return null
        const dataPoints = selectedAnimeEpisodes.map((ep, i) => [i + 1, ep.rating])
        let trendData = []
        if (dataPoints.length > 1) {
            const result = regression.polynomial(dataPoints, { order: 6, precision: 10 })
            trendData = dataPoints.map(p => result.predict(p[0])[1])
        }
        return {
            labels: selectedAnimeEpisodes.map(ep => ep.episode),
            datasets: [
                { type: 'line', label: 'Polyn. (Celkem)', data: trendData, borderColor: 'rgb(255, 0, 0)', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4 },
                {
                    type: 'bar', label: 'Hodnocení epizody', data: selectedAnimeEpisodes.map(ep => ep.rating),
                    backgroundColor: selectedAnimeEpisodes.map(ep => {
                        const r = ep.rating
                        if (r >= 9.75) return 'rgb(29, 161, 242)'
                        if (r >= 9) return 'rgb(24, 106, 59)'
                        if (r >= 8) return 'rgb(40, 180, 99)'
                        if (r >= 7) return 'rgb(244, 208, 63)'
                        if (r >= 6) return 'rgb(243, 156, 18)'
                        if (r >= 5) return 'rgb(99, 57, 116)'
                        return 'rgba(239, 68, 68, 0.7)'
                    }),
                    borderRadius: 4
                }
            ]
        }
    }, [selectedAnimeEpisodes])

    const episodeBarOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: { min: 4.75, max: 10, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    // ============================================
    // ROW 2 DATA MEMOIZATION
    // ============================================
    const polozkyOptions = useMemo(() => {
        if (slicerTyp === 'Kategorie') return Object.keys(categoryWeights)
        if (slicerTyp === 'Epizoda') {
            const eps = new Set()
            episodeRatings.forEach(a => a.episodes.forEach(e => eps.add(e.episode)))
            return Array.from(eps).sort((a,b) => (parseInt(a.replace('EP ', ''))||0) - (parseInt(b.replace('EP ', ''))||0))
        }
        return []
    }, [slicerTyp, episodeRatings])

    useEffect(() => {
        if (slicerTyp === 'Kategorie') setSlicerPolozka('Vedlejší postavy')
        else if (slicerTyp === 'Epizoda') setSlicerPolozka('EP 1')
        setSlicerHodnoceni('Všechna')
    }, [slicerTyp])

    const hodnoceniOptions = useMemo(() => {
        const ratings = new Set()
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                if (a.categories && a.categories[slicerPolozka] !== undefined) ratings.add(a.categories[slicerPolozka])
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) ratings.add(ep.rating)
            })
        }
        return ['Všechna', ...Array.from(ratings).sort((a,b) => b - a)]
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka])

    const row2FilteredAnime = useMemo(() => {
        const results = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                const r = a.categories ? a.categories[slicerPolozka] : undefined
                if (r !== undefined) {
                    if (slicerHodnoceni === 'Všechna' || r === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: r })
                }
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) {
                    if (slicerHodnoceni === 'Všechna' || ep.rating === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: ep.rating })
                }
            })
        }
        return results.sort((a,b) => b.hodnoceni - a.hodnoceni)
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka, slicerHodnoceni])

    const correlationChartData = useMemo(() => {
        const dataPoints = []
        const scatterData = []
        let minX = 10, maxX = 0, minY = 10, maxY = 0

        row2FilteredAnime.forEach(item => {
            const animeObj = animeList.find(a => a.name === item.name)
            if (animeObj && animeObj.rating && !isNaN(Number(animeObj.rating))) {
                const fh = Number(animeObj.rating)
                const val = item.hodnoceni
                dataPoints.push([fh, val])
                scatterData.push({ x: fh, y: val, label: item.name })
                
                if (fh < minX) minX = fh
                if (fh > maxX) maxX = fh
                if (val < minY) minY = val
                if (val > maxY) maxY = val
            }
        })

        if (dataPoints.length === 0) return null

        const result = regression.linear(dataPoints, { precision: 4 })
        const r2 = result.r2
        const lineData = [ { x: minX, y: result.predict(minX)[1] }, { x: maxX, y: result.predict(maxX)[1] } ]

        return {
            data: {
                datasets: [
                    { type: 'line', label: `Regrese (R² = ${r2.toLocaleString('cs-CZ')})`, data: lineData, borderColor: 'rgba(255, 0, 0, 0.8)', borderWidth: 2, fill: false, pointRadius: 0 },
                    { type: 'scatter', label: 'Anime', data: scatterData, backgroundColor: 'rgba(239, 68, 68, 0.8)', pointRadius: 4, pointHoverRadius: 6 }
                ]
            },
            r2,
            minX: Math.max(0, Math.floor(minX - 1)),
            minY: Math.max(0, Math.floor(minY - 1))
        }
    }, [row2FilteredAnime, animeList])

    const correlationChartOptions = useMemo(() => {
        if (!correlationChartData) return {}
        return {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'FH', color: 'rgba(255,255,255,0.6)' }, min: correlationChartData.minX, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { title: { display: true, text: `Hodnocení ${slicerPolozka}`, color: 'rgba(255,255,255,0.6)' }, min: correlationChartData.minY, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label}: (${ctx.raw.x}, ${ctx.raw.y})` } }
            }
        }
    }, [correlationChartData, slicerPolozka])

    const histogramData = useMemo(() => {
        const counts = {}
        for (let i = 5.0; i <= 10.0; i += 0.5) counts[i.toFixed(1)] = 0

        const sourceList = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => { const r = a.categories ? a.categories[slicerPolozka] : undefined; if (r !== undefined) sourceList.push(r) })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => { const ep = a.episodes.find(e => e.episode === slicerPolozka); if (ep) sourceList.push(ep.rating) })
        }

        sourceList.forEach(r => {
            let bin = 5.0
            if (r >= 10) bin = 10.0
            else if (r >= 9.5) bin = 9.5
            else if (r >= 9.0) bin = 9.0
            else if (r >= 8.5) bin = 8.5
            else if (r >= 8.0) bin = 8.0
            else if (r >= 7.5) bin = 7.5
            else if (r >= 7.0) bin = 7.0
            else if (r >= 6.5) bin = 6.5
            else if (r >= 6.0) bin = 6.0
            else if (r >= 5.5) bin = 5.5
            counts[bin.toFixed(1)]++
        })

        const labels = Object.keys(counts).sort((a,b) => Number(a) - Number(b)).map(l => l.replace('.', ','))
        const data = labels.map(l => counts[l.replace(',', '.')])

        return {
            labels,
            datasets: [{
                label: 'Počet anime',
                data,
                backgroundColor: labels.map(l => {
                    const r = Number(l.replace(',', '.'))
                    if (r >= 9.5) return 'rgb(29, 161, 242)'
                    if (r >= 8.5) return 'rgb(24, 106, 59)'
                    if (r >= 7.5) return 'rgb(40, 180, 99)'
                    if (r >= 6.5) return 'rgb(244, 208, 63)'
                    if (r >= 5.5) return 'rgb(243, 156, 18)'
                    return 'rgba(239, 68, 68, 0.7)'
                }),
                borderRadius: 2
            }]
        }
    }, [slicerTyp, slicerPolozka, categoryRatings, episodeRatings])

    const histogramOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: { ticks: { beginAtZero: true, color: 'rgba(255,255,255,0.6)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { title: { display: true, text: 'Hodnocení (Intervaly po 0,5)', color: 'rgba(255,255,255,0.6)' }, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    // ============================================
    // ROW 3 DATA MEMOIZATION
    // ============================================
    const hypeChartData = useMemo(() => {
        const xCats = ["Animace", "CGI", "OP", "ED", "OST"]
        const yCats = ["Plot", "Pacing", "Story Conclusion", "Emoce", "Originalita"]
        const scatterData = []

        categoryRatings.forEach(a => {
            if (!a.categories) return
            
            let xSum = 0, xCount = 0
            xCats.forEach(c => { if (a.categories[c] !== undefined) { xSum += a.categories[c]; xCount++; } })
            
            let ySum = 0, yCount = 0
            yCats.forEach(c => { if (a.categories[c] !== undefined) { ySum += a.categories[c]; yCount++; } })

            const enjoyment = a.categories["Enjoyment"]

            if (xCount > 0 && yCount > 0 && enjoyment !== undefined) {
                const xVal = xSum / xCount
                const yVal = ySum / yCount
                let color = 'rgba(239, 68, 68, 0.8)' // Oranžová/Červená < 7.5
                
                const animeObj = animeList.find(al => al.name === a.name)
                if (animeObj && animeObj.rating) {
                    const fh = Number(animeObj.rating)
                    if (fh >= 9.5) color = 'rgba(29, 161, 242, 0.8)' // Modrá
                    else if (fh >= 8.5) color = 'rgba(40, 180, 99, 0.8)' // Zelená
                    else if (fh >= 7.5) color = 'rgba(244, 208, 63, 0.8)' // Žlutá
                }

                scatterData.push({
                    x: xVal, y: yVal,
                    r: Math.max(3, (enjoyment - 4) * 2), // Bubble scale
                    label: a.name, color, enjoyment
                })
            }
        })

        return {
            datasets: [{
                label: 'Anime',
                data: scatterData,
                backgroundColor: scatterData.map(d => d.color),
                borderColor: 'rgba(255,255,255,0.2)',
                borderWidth: 1
            }]
        }
    }, [categoryRatings, animeList])

    const hypeChartOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Technická kvalita (Animace + CGI + OP + ED + OST)', color: 'rgba(255,255,255,0.6)' }, min: 5.5, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { title: { display: true, text: 'Hloubka (Plot + Pacing + Story + Emoce + Originalita)', color: 'rgba(255,255,255,0.6)' }, min: 5.5, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
        },
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label} (Enjoyment: ${ctx.raw.enjoyment})` } }
        }
    }

    const leaderboardChartData = useMemo(() => {
        let items = []
        if (lbTyp === 'Epizody') {
            episodeRatings.forEach(a => {
                if (a.episodes && a.episodes.length > 0) {
                    const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                    items.push({ name: a.name, val: sum / a.episodes.length })
                }
            })
        } else {
            categoryRatings.forEach(a => {
                if (a.categories) {
                    const keys = Object.keys(a.categories)
                    if (keys.length > 0) {
                        const sum = keys.reduce((acc, k) => acc + a.categories[k], 0)
                        items.push({ name: a.name, val: sum / keys.length })
                    }
                }
            })
        }

        if (lbSort === 'Nejlepší') items.sort((a,b) => b.val - a.val)
        else items.sort((a,b) => a.val - b.val)

        items = items.slice(0, lbCount)

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: `AVG (${lbTyp})`,
                data: items.map(i => i.val),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings, categoryRatings, lbTyp, lbSort, lbCount])

    const leaderboardOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
            x: { min: lbSort === 'Nejlepší' ? 6 : undefined, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    const unstableChartData = useMemo(() => {
        let items = []
        episodeRatings.forEach(a => {
            if (a.episodes && a.episodes.length > 1) {
                const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                const avg = sum / a.episodes.length
                const absDevSum = a.episodes.reduce((acc, ep) => acc + Math.abs(ep.rating - avg), 0)
                items.push({ name: a.name, val: absDevSum / a.episodes.length })
            }
        })

        items.sort((a,b) => b.val - a.val).slice(0, 30) // Top 30

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: 'Odchylka EPs',
                data: items.map(i => i.val),
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings])

    const unstableOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Průměrná odchylka', color: 'rgba(255,255,255,0.6)' }, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    if (loading) return <div className="fade-in" style={{ padding: 'var(--spacing-lg)' }}><h2>Načítám parametry a hodnocení...</h2></div>

    return (
        <div className="ratings-page fade-in">
            <h1 style={{ marginBottom: 'var(--spacing-md)' }}>Anime Hodnocení a Analýza</h1>

            {/* ROW 1: Sériové Dashboardy */}
            <div className="ratings-row row-1">
                {/* 1. Selektor (Left) */}
                <div className="ratings-panel left-panel">
                    <h3 className="ratings-panel-title">Vyberte Anime</h3>
                    <input
                        type="text"
                        className="anime-selector-search"
                        placeholder="Hledat..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <div className="anime-selector-list">
                        {row1AnimeList.map(a => (
                            <div
                                key={a.name}
                                className={`anime-selector-item ${selectedAnimeTitle === a.name ? 'active' : ''}`}
                                onClick={() => setSelectedAnimeTitle(a.name)}
                            >
                                <div className="selector-item-content">
                                    <span className="selector-item-name">{a.name}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.type}</span>
                                </div>
                                <div className="selector-item-rating">{a.rating || '?'}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Radar Chart (Center) */}
                <div className="ratings-panel center-panel">
                    <h3 className="ratings-panel-title" style={{ fontSize: '1rem' }}>
                        {selectedAnimeTitle}
                        <div style={{ display:'flex', gap:'8px', fontSize:'0.85rem' }}>
                            <span className="badge badge-primary">WA: {avgCategoryRating}</span>
                            <span className="badge" style={{ background:'var(--bg-tertiary)'}}>FH: {selectedAnimeObj?.rating || '?'}</span>
                        </div>
                    </h3>
                    <div style={{ flex: 1, position: 'relative' }}>
                        {radarData ? <Radar data={radarData} options={radarOptions} /> : <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '50px' }}>Žádná data pro radar</div>}
                    </div>
                </div>

                {/* 3. Epizody & Narative (Right) */}
                <div className="right-panel">
                    <div className="ratings-panel right-panel-top">
                        <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Hodnocení Epizod</h3>
                        <div style={{ flex: 1, position: 'relative' }}>
                            {episodeChartData ? <Bar data={episodeChartData} options={episodeBarOptions} /> : <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>Žádná data pro epizody</div>}
                        </div>
                    </div>
                    <div className="ratings-panel right-panel-bottom">
                        <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Recenze / Summary</h3>
                        <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', paddingRight: '8px', color: 'var(--text-secondary)' }}>
                            {selectedAnimeNote ? selectedAnimeNote.replace(/_x000D_/g, '') : 'Žádná poznámka k dispozici.'}
                        </div>
                    </div>
                </div>
            </div>

            {/* ROW 2: Kategorie & Korelace */}
            <div className="ratings-row row-2">
                <div className="ratings-panel left-panel">
                    <h3 className="ratings-panel-title">Filtry a seznam</h3>
                    <div className="slicer-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Typ</label>
                        <select className="slicer-select" value={slicerTyp} onChange={e => setSlicerTyp(e.target.value)}>
                            <option value="Kategorie">Kategorie</option>
                            <option value="Epizoda">Epizoda</option>
                        </select>
                    </div>
                    <div className="slicer-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Položka</label>
                        <select className="slicer-select" value={slicerPolozka} onChange={e => setSlicerPolozka(e.target.value)}>
                            {polozkyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="slicer-group">
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hodnocení</label>
                        <select className="slicer-select" value={slicerHodnoceni} onChange={e => setSlicerHodnoceni(e.target.value)}>
                            {hodnoceniOptions.map(h => <option key={h} value={h}>{h === 'Všechna' ? h : Number(h).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</option>)}
                        </select>
                    </div>
                    <div className="anime-selector-list" style={{ marginTop: 'var(--spacing-sm)' }}>
                        {row2FilteredAnime.map(a => (
                            <div key={a.name} className="anime-selector-item" onClick={() => setSelectedAnimeTitle(a.name)}>
                                <span className="selector-item-name">{a.name}</span>
                                <span className="selector-item-rating">{Number(a.hodnoceni).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                        ))}
                        {row2FilteredAnime.length === 0 && <div style={{ color:'var(--text-muted)', padding:'8px' }}>Žádná data</div>}
                    </div>
                </div>

                <div className="ratings-panel center-panel">
                    <h3 className="ratings-panel-title">Korelace: {slicerPolozka} vs FH {correlationChartData?.r2 ? `(R² = ${correlationChartData.r2.toLocaleString('cs-CZ')})` : ''}</h3>
                    <div style={{ flex: 1, position: 'relative' }}>
                        {correlationChartData ? <Chart type='scatter' data={correlationChartData.data} options={correlationChartOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Mälo dat pro korelaci</div>}
                    </div>
                </div>

                <div className="ratings-panel right-panel">
                    <h3 className="ratings-panel-title">Rozložení hodnocení: {slicerPolozka}</h3>
                    <div style={{ flex: 1, position: 'relative' }}>
                        {histogramData ? <Bar data={histogramData} options={histogramOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Žádná data</div>}
                    </div>
                </div>
            </div>

            {/* ROW 3: Globální žebříčky */}
            <div className="ratings-row row-3" style={{ marginBottom: 'var(--spacing-xl)' }}>
                <div className="ratings-panel left-panel">
                    <h3 className="ratings-panel-title">Hodnocení Anime podle AVG (Top {lbCount})</h3>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <select className="slicer-select" style={{flex:1}} value={lbTyp} onChange={e => setLbTyp(e.target.value)}>
                            <option value="Epizody">Epizody</option>
                            <option value="Kategorie">Kategorie</option>
                        </select>
                        <select className="slicer-select" style={{flex:1}} value={lbSort} onChange={e => setLbSort(e.target.value)}>
                            <option value="Nejlepší">Nejlepší</option>
                            <option value="Nejhorší">Nejhorší</option>
                        </select>
                        <select className="slicer-select" style={{flex:0.5}} value={lbCount} onChange={e => setLbCount(Number(e.target.value))}>
                            <option value="10">10</option>
                            <option value="30">30</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                        </select>
                    </div>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Bar data={leaderboardChartData} options={leaderboardOptions} />
                    </div>
                </div>

                <div className="ratings-panel center-panel">
                    <h3 className="ratings-panel-title">Kvalita (technika) vs. Hloubka (narativ)</h3>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Chart type='bubble' data={hypeChartData} options={hypeChartOptions} />
                    </div>
                </div>

                <div className="ratings-panel right-panel">
                    <h3 className="ratings-panel-title">Anime s nestabilním ohodnocením EP (Top 30)</h3>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Bar data={unstableChartData} options={unstableOptions} />
                    </div>
                </div>
            </div>
            
        </div>
    )
}

export default AnimeRatings
