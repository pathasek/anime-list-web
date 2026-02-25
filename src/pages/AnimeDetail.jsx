import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    CategoryScale,
    LinearScale,
    BarElement
} from 'chart.js'
import { Radar, Bar } from 'react-chartjs-2'
import regression from 'regression'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, CategoryScale, LinearScale, BarElement)

function AnimeDetail() {
    const { name } = useParams()
    const navigate = useNavigate()
    const [anime, setAnime] = useState(null)
    const [categoryRatings, setCategoryRatings] = useState(null)
    const [episodeRatings, setEpisodeRatings] = useState(null)
    const [note, setNote] = useState(null)
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const decodedName = decodeURIComponent(name)

        Promise.all([
            fetch('data/anime_list.json').then(r => r.json()),
            fetch('data/category_ratings.json').then(r => r.json()),
            fetch('data/history_log.json').then(r => r.json()),
            fetch('data/episode_ratings.json').then(r => r.json()),
            fetch('data/notes.json').then(r => r.json())
        ]).then(([animeList, ratings, historyLog, epRatings, notes]) => {
            // Find anime by name
            const found = animeList.find(a => a.name === decodedName)
            setAnime(found)

            // Find category ratings
            const foundRatings = ratings.find(r => r.name === decodedName)
            setCategoryRatings(foundRatings?.categories || null)

            // Find episode ratings
            const foundEpRatings = epRatings.find(r => r.name === decodedName)
            setEpisodeRatings(foundEpRatings?.episodes || null)

            // Find note/review
            const foundNote = notes.find(n => n.name === decodedName)
            setNote(foundNote?.note || null)

            // Find watching history
            const animeHistory = historyLog.filter(h =>
                h.name && h.name.toLowerCase().includes(decodedName.toLowerCase().split(',')[0])
            )
            setHistory(animeHistory)

            setLoading(false)
        })
    }, [name])

    const categoryWeights = useMemo(() => ({
        "Animace": 2.0, "CGI": 1.8, "MC": 3.0, "Vedlejší postavy": 2.5, "Waifu": 1.5,
        "Plot": 4.0, "Pacing": 1.5, "Story Conclusion": 1.5, "Originalita": 2.5,
        "Emoce": 3.5, "Enjoyment": 4.0, "OP": 1.0, "ED": 0.5, "OST": 2.0
    }), [])

    // Radar chart data
    const radarData = useMemo(() => {
        if (!categoryRatings) return null

        const categories = Object.keys(categoryRatings)
        const labels = categories.map(c => {
            const w = categoryWeights[c] || 1
            return `${c} (v. ${w})`
        })
        const values = Object.values(categoryRatings)

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
                pointRadius: 4
            }]
        }
    }, [categoryRatings, categoryWeights])

    // Episode ratings bar chart
    const episodeChartData = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return null

        const dataPoints = episodeRatings.map((ep, i) => [i + 1, ep.rating])
        let trendData = []
        if (dataPoints.length > 1) {
            const result = regression.polynomial(dataPoints, { order: 6, precision: 10 })
            trendData = dataPoints.map(p => result.predict(p[0])[1])
        }

        return {
            labels: episodeRatings.map(ep => ep.episode),
            datasets: [
                {
                    type: 'line',
                    label: 'Polyn. (Celkem)',
                    data: trendData,
                    borderColor: 'rgb(255, 0, 0)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                },
                {
                    type: 'bar',
                    label: 'Hodnocení epizody',
                    data: episodeRatings.map(ep => ep.rating),
                    backgroundColor: episodeRatings.map(ep => {
                        const r = ep.rating
                        if (r >= 9.75 && r <= 10) return 'rgb(29, 161, 242)' // Absolute Cinema
                        if (r >= 9 && r <= 9.5) return 'rgb(24, 106, 59)' // Awesome
                        if (r >= 8 && r <= 8.75) return 'rgb(40, 180, 99)' // Great
                        if (r >= 7 && r <= 7.75) return 'rgb(244, 208, 63)' // Good
                        if (r >= 6 && r <= 6.75) return 'rgb(243, 156, 18)' // Regular
                        if (r >= 5 && r <= 5.75) return 'rgb(99, 57, 116)' // Bad
                        return 'rgba(239, 68, 68, 0.7)'
                    }),
                    borderRadius: 4
                }
            ]
        }
    }, [episodeRatings])

    const radarMin = useMemo(() => {
        if (!categoryRatings) return 0
        const values = Object.values(categoryRatings)
        return values.length > 0 ? Math.min(...values) : 0
    }, [categoryRatings])

    const radarMax = useMemo(() => {
        if (!categoryRatings) return 10
        const values = Object.values(categoryRatings)
        return values.length > 0 ? Math.max(...values) : 10
    }, [categoryRatings])

    const radarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            r: {
                beginAtZero: false,
                min: radarMin,
                max: radarMax,
                ticks: {
                    stepSize: 1,
                    color: 'rgba(255,255,255,0.6)'
                },
                grid: {
                    color: 'rgba(255,255,255,0.1)'
                },
                angleLines: {
                    color: 'rgba(255,255,255,0.1)'
                },
                pointLabels: {
                    color: 'rgba(255,255,255,0.8)',
                    font: { size: 11 }
                }
            }
        },
        plugins: {
            legend: { display: false }
        }
    }

    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: false,
                min: 4.75,
                max: 10,
                ticks: { color: 'rgba(255,255,255,0.6)' },
                grid: { color: 'rgba(255,255,255,0.1)' }
            },
            x: {
                ticks: { color: 'rgba(255,255,255,0.6)' },
                grid: { display: false }
            }
        },
        plugins: {
            legend: { display: false }
        }
    }

    // Calculate average rating from categories using weights
    const avgCategoryRating = useMemo(() => {
        if (!categoryRatings) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(categoryRatings).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight).toFixed(2) : 'N/A'
    }, [categoryRatings, categoryWeights])

    // Calculate average episode rating
    const avgEpisodeRating = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return null
        const sum = episodeRatings.reduce((a, ep) => a + ep.rating, 0)
        return (sum / episodeRatings.length).toFixed(2)
    }, [episodeRatings])

    if (loading) {
        return <div className="fade-in"><h2>Načítám...</h2></div>
    }

    if (!anime) {
        return (
            <div className="fade-in">
                <h2>Anime nenalezeno</h2>
                <p>Anime "{decodeURIComponent(name)}" nebylo nalezeno.</p>
                <button className="btn btn-primary" onClick={() => navigate('/anime')}>
                    Zpět na seznam
                </button>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <button
                className="btn btn-secondary"
                onClick={() => navigate(-1)}
                style={{ marginBottom: 'var(--spacing-lg)' }}
            >
                ← Zpět
            </button>

            <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ marginBottom: 'var(--spacing-md)', color: 'var(--color-primary)' }}>
                    {anime.name}
                    {anime.mal_url && (
                        <a
                            href={anime.mal_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginLeft: '12px', fontSize: '0.8rem' }}
                        >
                            🔗 MAL
                        </a>
                    )}
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
                    <div>
                        <strong>Typ:</strong>{' '}
                        <span className={`badge badge-${(anime.type || '').toLowerCase().replace(' ', '-')}`}>
                            {anime.type}
                        </span>
                    </div>
                    <div><strong>Studio:</strong> {anime.studio || 'N/A'}</div>
                    <div><strong>Epizody:</strong> {anime.episodes || 'N/A'}</div>
                    <div><strong>Délka epizody:</strong> {anime.episode_duration ? `${Math.round(anime.episode_duration)} min` : 'N/A'}</div>
                    <div>
                        <strong>Hodnocení:</strong>{' '}
                        <span className={`badge rating-${Math.floor(anime.rating || 0)}`}>
                            {anime.rating}/10
                        </span>
                    </div>
                    <div><strong>Datum vydání:</strong> {anime.release_date ? new Date(anime.release_date).toLocaleDateString('cs-CZ') : 'N/A'}</div>
                    <div><strong>Sledováno:</strong> {anime.start_date ? new Date(anime.start_date).toLocaleDateString('cs-CZ') : 'N/A'} - {anime.end_date ? new Date(anime.end_date).toLocaleDateString('cs-CZ') : 'N/A'}</div>
                    <div><strong>Dabing:</strong> {anime.dub || 'N/A'}</div>
                    {anime.status && (
                        <div>
                            <strong>Status:</strong>{' '}
                            <span className={`status-badge ${anime.status.toLowerCase().replace('!', '')}`}>
                                {anime.status}
                            </span>
                        </div>
                    )}
                </div>

                {anime.genres && (
                    <div style={{ marginTop: 'var(--spacing-md)' }}>
                        <strong>Žánry:</strong>{' '}
                        {anime.genres.split(';').map((g, i) => (
                            <span key={i} className="badge badge-cyan" style={{ marginRight: '4px', marginBottom: '4px' }}>
                                {g.trim()}
                            </span>
                        ))}
                    </div>
                )}

                {anime.themes && anime.themes !== 'X' && (
                    <div style={{ marginTop: 'var(--spacing-sm)' }}>
                        <strong>Témata:</strong>{' '}
                        {anime.themes.split(';').map((t, i) => (
                            <span key={i} className="badge badge-secondary" style={{ marginRight: '4px', marginBottom: '4px' }}>
                                {t.trim()}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Narrative Review / Note */}
            {note && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📝 Recenze / Poznámky</h3>
                    <p style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{note.replace(/_x000D_/g, '')}</p>
                </div>
            )}

            {/* Category Ratings Radar Chart */}
            {categoryRatings && radarData && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>
                        Hodnocení podle kategorií
                        <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            (Průměr: <span className="badge badge-primary">{avgCategoryRating}</span>)
                        </span>
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xl)', flexWrap: 'wrap-reverse' }}>
                        <div style={{ flex: '1', minWidth: '250px' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                gap: 'var(--spacing-sm)'
                            }}>
                                {Object.entries(categoryRatings).map(([cat, rating]) => (
                                    <div key={cat} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        padding: 'var(--spacing-xs) var(--spacing-sm)',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border-color)'
                                    }}>
                                        <span style={{ fontSize: '0.9rem' }}>{cat}</span>
                                        <span className={`badge rating-${Math.floor(rating)}`} style={{ fontWeight: 'bold' }}>{rating}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ height: '500px', flex: '1.5', minWidth: '400px' }}>
                            <Radar data={radarData} options={radarOptions} />
                        </div>
                    </div>
                </div>
            )}

            {/* Episode Ratings */}
            {episodeRatings && episodeChartData && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
                        <h3 style={{ margin: 0 }}>
                            Hodnocení epizod
                            <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                (Průměr: <span className="badge badge-primary">{avgEpisodeRating}</span>)
                            </span>
                        </h3>

                        {/* Custom Legend */}
                        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '500px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(29, 161, 242)' }}></span>
                                <span>Absolute Cinema</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(24, 106, 59)' }}></span>
                                <span>Awesome</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(40, 180, 99)' }}></span>
                                <span>Great</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(244, 208, 63)' }}></span>
                                <span>Good</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(243, 156, 18)' }}></span>
                                <span>Regular</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(99, 57, 116)' }}></span>
                                <span>Bad</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '350px' }}>
                        <Bar data={episodeChartData} options={barOptions} />
                    </div>
                </div>
            )}

            {/* Watching History */}
            {history.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Historie sledování</h3>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Epizody</th>
                                <th>Čas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h, i) => (
                                <tr key={i}>
                                    <td>{h.date ? new Date(h.date).toLocaleDateString('cs-CZ') : 'N/A'}</td>
                                    <td>{h.episodes}</td>
                                    <td>{h.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

export default AnimeDetail

