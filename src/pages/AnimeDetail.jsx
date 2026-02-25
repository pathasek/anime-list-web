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

    // Radar chart data
    const radarData = useMemo(() => {
        if (!categoryRatings) return null

        const categories = Object.keys(categoryRatings)
        const values = Object.values(categoryRatings)

        return {
            labels: categories,
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
    }, [categoryRatings])

    // Episode ratings bar chart
    const episodeChartData = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return null

        return {
            labels: episodeRatings.map(ep => ep.episode),
            datasets: [{
                label: 'Hodnocení epizody',
                data: episodeRatings.map(ep => ep.rating),
                backgroundColor: episodeRatings.map(ep => {
                    const r = ep.rating
                    if (r >= 9) return 'rgba(16, 185, 129, 0.7)'
                    if (r >= 7.5) return 'rgba(99, 102, 241, 0.7)'
                    if (r >= 6) return 'rgba(245, 158, 11, 0.7)'
                    return 'rgba(239, 68, 68, 0.7)'
                }),
                borderRadius: 4
            }]
        }
    }, [episodeRatings])

    const radarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            r: {
                beginAtZero: true,
                min: 0,
                max: 10,
                ticks: {
                    stepSize: 2,
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
                beginAtZero: true,
                min: 0,
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

    // Calculate average rating from categories
    const avgCategoryRating = useMemo(() => {
        if (!categoryRatings) return null
        const values = Object.values(categoryRatings)
        return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
    }, [categoryRatings])

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

                    <div style={{ height: '400px', maxWidth: '600px', margin: '0 auto' }}>
                        <Radar data={radarData} options={radarOptions} />
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: 'var(--spacing-sm)',
                        marginTop: 'var(--spacing-lg)'
                    }}>
                        {Object.entries(categoryRatings).map(([cat, rating]) => (
                            <div key={cat} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: 'var(--spacing-xs) var(--spacing-sm)',
                                background: 'var(--color-bg-elevated)',
                                borderRadius: 'var(--radius-sm)'
                            }}>
                                <span>{cat}</span>
                                <span className={`badge rating-${Math.floor(rating)}`}>{rating}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Episode Ratings */}
            {episodeRatings && episodeChartData && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>
                        Hodnocení epizod
                        <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                            (Průměr: <span className="badge badge-primary">{avgEpisodeRating}</span>)
                        </span>
                    </h3>

                    <div style={{ height: '300px' }}>
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
                            {history.slice(0, 10).map((h, i) => (
                                <tr key={i}>
                                    <td>{h.date ? new Date(h.date).toLocaleDateString('cs-CZ') : 'N/A'}</td>
                                    <td>{h.episodes}</td>
                                    <td>{h.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {history.length > 10 && (
                        <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--color-text-muted)' }}>
                            ...a dalších {history.length - 10} záznamů
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

export default AnimeDetail

