import { useState, useEffect, useMemo } from 'react'
import ChartSettingsModal from '../components/ChartSettingsModal'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Title,
    Tooltip,
    Legend
} from 'chart.js'
import { Pie, Bar, Radar } from 'react-chartjs-2'

ChartJS.register(
    CategoryScale, LinearScale, BarElement, ArcElement,
    RadialLinearScale, PointElement, LineElement, Filler,
    Title, Tooltip, Legend
)

function Favorites() {
    const [favorites, setFavorites] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [typeFilter, setTypeFilter] = useState('all')
    const [ratingFilter, setRatingFilter] = useState('all')
    const [sortColumn, setSortColumn] = useState(null)
    const [sortDirection, setSortDirection] = useState('desc')
    const [activeChartSettings, setActiveChartSettings] = useState(null)
    const [showAllRatings, setShowAllRatings] = useState(false)
    const [expandedCardIdx, setExpandedCardIdx] = useState(null)

    // Czech number formatting: dot → comma
    const toCS = (val) => String(val).replace('.', ',')

    const openChartSettings = (e, id, title) => {
        const r = e.currentTarget.getBoundingClientRect()
        setActiveChartSettings({
            id,
            title,
            anchorPosition: {
                top: r.bottom + window.scrollY,
                left: r.left + window.scrollX
            }
        })
    }

    useEffect(() => {
        fetch('data/favorites.json')
            .then(r => r.json())
            .then(data => {
                setFavorites(data)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load favorites:', err)
                setLoading(false)
            })
    }, [])

    // Statistics
    const stats = useMemo(() => {
        if (!favorites.length) return null

        const types = { OP: 0, ED: 0, OST: 0, Other: 0 }
        const authors = {}
        const anime = {}
        const animeByFinal = {} // For Top Series by final rating
        let withRating = 0

        // Rating category sums
        let lyricsSum = 0, lyricsCount = 0
        let emotionSum = 0, emotionCount = 0
        let melodySum = 0, melodyCount = 0
        let videoSum = 0, videoCount = 0
        let voiceSum = 0, voiceCount = 0
        let avgSum = 0, avgCount = 0
        let finalSum = 0, finalCount = 0

        favorites.forEach(f => {
            // Type distribution
            const type = f.type?.toUpperCase() || 'Other'
            if (types[type] !== undefined) types[type]++
            else types['Other']++

            // Author stats
            if (f.author) {
                const authorName = f.author.split(';')[0].trim()
                authors[authorName] = (authors[authorName] || 0) + 1
            }

            // Anime stats
            if (f.anime_name) {
                const animeName = f.anime_name.split(',')[0].trim()
                anime[animeName] = (anime[animeName] || 0) + 1

                // Track final rating for Top Series
                if (f.rating_final && !isNaN(parseFloat(f.rating_final))) {
                    if (!animeByFinal[animeName]) animeByFinal[animeName] = { sum: 0, count: 0 }
                    animeByFinal[animeName].sum += parseFloat(f.rating_final)
                    animeByFinal[animeName].count++
                }
            }

            // Count items with final rating ("S hodnocením")
            if (f.rating_final && !isNaN(parseFloat(f.rating_final))) {
                withRating++
                finalSum += parseFloat(f.rating_final)
                finalCount++
            }
            if (f.rating_lyrics && !isNaN(parseFloat(f.rating_lyrics))) {
                lyricsSum += parseFloat(f.rating_lyrics)
                lyricsCount++
            }
            if (f.rating_emotion && !isNaN(parseFloat(f.rating_emotion))) {
                emotionSum += parseFloat(f.rating_emotion)
                emotionCount++
            }
            if (f.rating_melody && !isNaN(parseFloat(f.rating_melody))) {
                melodySum += parseFloat(f.rating_melody)
                melodyCount++
            }
            if (f.rating_video && !isNaN(parseFloat(f.rating_video))) {
                videoSum += parseFloat(f.rating_video)
                videoCount++
            }
            if (f.rating_voice && !isNaN(parseFloat(f.rating_voice))) {
                voiceSum += parseFloat(f.rating_voice)
                voiceCount++
            }
            if (f.rating_avg && !isNaN(parseFloat(f.rating_avg))) {
                avgSum += parseFloat(f.rating_avg)
                avgCount++
            }
        })

        // Top authors
        const topAuthors = Object.entries(authors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        // Top anime
        const topAnime = Object.entries(anime)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        // Top 6 series by average final rating
        const topSeriesByFinal = Object.entries(animeByFinal)
            .filter(([, data]) => data.count >= 2)
            .map(([name, data]) => ({ name, avgFinal: data.sum / data.count }))
            .sort((a, b) => b.avgFinal - a.avgFinal)
            .slice(0, 6)

        // Average ratings by category
        const avgRatings = {
            lyrics: lyricsCount > 0 ? toCS((lyricsSum / lyricsCount).toFixed(2)) : null,
            emotion: emotionCount > 0 ? toCS((emotionSum / emotionCount).toFixed(2)) : null,
            melody: melodyCount > 0 ? toCS((melodySum / melodyCount).toFixed(2)) : null,
            video: videoCount > 0 ? toCS((videoSum / videoCount).toFixed(2)) : null,
            voice: voiceCount > 0 ? toCS((voiceSum / voiceCount).toFixed(2)) : null,
            avg: avgCount > 0 ? toCS((avgSum / avgCount).toFixed(2)) : null,
            final: finalCount > 0 ? toCS((finalSum / finalCount).toFixed(2)) : null
        }

        // OST items
        const ostItems = favorites.filter(f => f.type?.toUpperCase() === 'OST')

        return { types, topAuthors, topAnime, withRating, total: favorites.length, avgRatings, ostItems, topSeriesByFinal }
    }, [favorites])

    // Filter and Sort
    const filteredFavorites = useMemo(() => {
        let result = [...favorites]

        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(f =>
                f.anime_name?.toLowerCase().includes(term) ||
                f.song?.toLowerCase().includes(term) ||
                f.author?.toLowerCase().includes(term)
            )
        }

        if (typeFilter !== 'all') {
            result = result.filter(f => f.type?.toUpperCase() === typeFilter)
        }

        if (ratingFilter !== 'all') {
            result = result.filter(f => {
                const rating = parseFloat(f.rating_final)
                if (ratingFilter === '9+') return !isNaN(rating) && rating >= 9
                if (ratingFilter === '8+') return !isNaN(rating) && rating >= 8
                if (ratingFilter === '7+') return !isNaN(rating) && rating >= 7
                if (ratingFilter === 'rated') return !isNaN(rating)
                if (ratingFilter === 'frisson') return f.has_frisson === true

                return true
            })
        }

        // Sorting
        if (sortColumn) {
            result.sort((a, b) => {
                let aVal, bVal
                if (sortColumn === 'anime_name' || sortColumn === 'song' || sortColumn === 'author') {
                    aVal = (a[sortColumn] || '').toLowerCase()
                    bVal = (b[sortColumn] || '').toLowerCase()
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
                } else if (sortColumn === 'has_frisson') {
                    aVal = a[sortColumn] ? 1 : 0
                    bVal = b[sortColumn] ? 1 : 0
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
                } else {
                    aVal = parseFloat(a[sortColumn]) || 0
                    bVal = parseFloat(b[sortColumn]) || 0
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
                }
            })
        }

        return result
    }, [favorites, searchTerm, typeFilter, ratingFilter, sortColumn, sortDirection])

    // Sort handler
    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(column)
            setSortDirection('desc')
        }
    }

    const getSortIcon = (column) => {
        if (sortColumn !== column) return '↕'
        return sortDirection === 'asc' ? '↑' : '↓'
    }

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    // Chart colors
    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#f59e0b']

    // Type chart
    const typeChartData = {
        labels: Object.keys(stats?.types || {}),
        datasets: [{
            data: Object.values(stats?.types || {}),
            backgroundColor: colors,
            borderWidth: 0
        }]
    }

    // Top authors chart
    const authorsChartData = {
        labels: stats?.topAuthors.map(a => a[0].substring(0, 20)) || [],
        datasets: [{
            label: 'Počet',
            data: stats?.topAuthors.map(a => a[1]) || [],
            backgroundColor: '#8b5cf6',
            borderRadius: 4
        }]
    }

    // Top Series by Final Rating Chart
    const topSeriesFinalData = {
        labels: stats?.topSeriesByFinal.map(s => s.name.substring(0, 20)) || [],
        datasets: [{
            label: 'Prům. finální hodnocení',
            data: stats?.topSeriesByFinal.map(s => s.avgFinal) || [],
            backgroundColor: '#10b981',
            borderRadius: 4
        }]
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    }

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, padding: 8 } }
        }
    }

    return (
        <div className="fade-in">
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>
                Favorite OP / ED / OST
                <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                    ({filteredFavorites.length} z {favorites.length})
                </span>
                <a
                    href="https://savsmb-my.sharepoint.com/:f:/g/personal/xmacoun1_is_savs_cz/En5erGeU8O9FlI1bH5JBfaYBrzmbHlnXUmmGMi4jlG-O3g?e=YvHidw"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        marginLeft: '20px',
                        fontSize: '0.875rem',
                        color: 'var(--accent-pink)',
                        textDecoration: 'underline',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        background: 'rgba(236, 72, 153, 0.1)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'var(--transition-fast)'
                    }}
                    title="Klikněte pro otevření složky s videoklipy na SharePointu"
                >
                    🎵 Videoklipy OP/ED
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>→ kliknout</span>
                </a>
            </h2>

            {/* 1. Average Ratings Section (Moved to top) */}
            {stats?.avgRatings?.final && (
                <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--accent-primary)', fontSize: '1.25rem' }}>
                        📊 Průměrná hodnocení kategorií
                    </h3>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                        <div className="stat-card">
                            <div className="stat-value">{stats.avgRatings.avg}</div>
                            <div className="stat-label">Průměrné</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.avgRatings.final}</div>
                            <div className="stat-label">Finální</div>
                        </div>
                        {stats.avgRatings.emotion && (
                            <div className={`stat-card pink ${!showAllRatings ? 'hide-mobile' : ''}`}>
                                <div className="stat-value">{stats.avgRatings.emotion}</div>
                                <div className="stat-label">Emoce</div>
                            </div>
                        )}
                        {stats.avgRatings.lyrics && (
                            <div className={`stat-card ${!showAllRatings ? 'hide-mobile' : ''}`}>
                                <div className="stat-value">{stats.avgRatings.lyrics}</div>
                                <div className="stat-label">Text</div>
                            </div>
                        )}
                        {stats.avgRatings.melody && (
                            <div className={`stat-card cyan ${!showAllRatings ? 'hide-mobile' : ''}`}>
                                <div className="stat-value">{stats.avgRatings.melody}</div>
                                <div className="stat-label">Melodie</div>
                            </div>
                        )}
                        {stats.avgRatings.video && (
                            <div className={`stat-card amber ${!showAllRatings ? 'hide-mobile' : ''}`}>
                                <div className="stat-value">{stats.avgRatings.video}</div>
                                <div className="stat-label">Videoklip</div>
                            </div>
                        )}
                        {stats.avgRatings.voice && (
                            <div className={`stat-card emerald ${!showAllRatings ? 'hide-mobile' : ''}`}>
                                <div className="stat-value">{stats.avgRatings.voice}</div>
                                <div className="stat-label">Hlas</div>
                            </div>
                        )}
                    </div>
                    {/* Toggle button for extra ratings */}
                    <button
                        className="filter-btn hide-desktop"
                        style={{ marginTop: 'var(--spacing-md)', width: '100%', justifyContent: 'center' }}
                        onClick={() => setShowAllRatings(!showAllRatings)}
                    >
                        {showAllRatings ? 'MÉNĚ HODNOCENÍ ▲' : 'VÍCE HODNOCENÍ ▼'}
                    </button>
                </div>
            )}

            {/* 2. Stats Grid (Counts) */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats?.total || 0}</div>
                    <div className="stat-label">Celkem songů</div>
                </div>
                <div className="stat-card pink">
                    <div className="stat-value">{stats?.types.OP || 0}</div>
                    <div className="stat-label">Openings</div>
                </div>
                <div className="stat-card cyan">
                    <div className="stat-value">{stats?.types.ED || 0}</div>
                    <div className="stat-label">Endings</div>
                </div>
                <div className="stat-card amber">
                    <div className="stat-value">{stats?.withRating || 0}</div>
                    <div className="stat-label">S hodnocením</div>
                </div>
            </div>

            {/* 3. Charts */}
            <div className="charts-grid">
                <div className="chart-container">
                    <div className="chart-header">
                        <div className="chart-title">Rozdělení typů</div>
                        <button className="chart-settings-btn" onClick={(e) => openChartSettings(e, 'fav_types', 'Rozdělení typů')} title="Nastavení">⚙️</button>
                    </div>
                    <div style={{ height: '250px' }}>
                        <Pie data={typeChartData} options={pieOptions} />
                    </div>
                </div>
                <div className="chart-container">
                    <div className="chart-header">
                        <div className="chart-title">Top 10 autorů</div>
                        <button className="chart-settings-btn" onClick={(e) => openChartSettings(e, 'fav_authors', 'Top 10 autorů')} title="Nastavení">⚙️</button>
                    </div>
                    <div style={{ height: '250px' }}>
                        <Bar data={authorsChartData} options={{ ...chartOptions, indexAxis: 'y' }} />
                    </div>
                </div>
                <div className="chart-container">
                    <div className="chart-header">
                        <div className="chart-title">Top Série (dle fin. hodnocení)</div>
                        <button className="chart-settings-btn" onClick={(e) => openChartSettings(e, 'fav_series_final', 'Top Série (dle fin. hodnocení)')} title="Nastavení">⚙️</button>
                    </div>
                    <div style={{ height: '250px' }}>
                        <Bar data={topSeriesFinalData} options={{
                            ...chartOptions, scales: {
                                y: {
                                    beginAtZero: false,
                                    min: 8
                                }
                            }
                        }} />
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Hledat anime, song, autora..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', paddingRight: '2rem' }}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            style={{
                                position: 'absolute',
                                right: '12px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '1.2rem',
                                padding: '0 4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            title="Vymazat hledání"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div className="filter-group">
                    {['all', 'OP', 'ED', 'OST'].map(t => (
                        <button
                            key={t}
                            className={`filter-btn ${typeFilter === t ? 'active' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t === 'all' ? 'Vše' : t}
                        </button>
                    ))}
                    <select
                        value={ratingFilter}
                        onChange={(e) => setRatingFilter(e.target.value)}
                        className="filter-btn"
                        style={{ outline: 'none' }}
                    >
                        <option value="all">Všechna hodnocení</option>
                        <option value="9+">9+ (Excelentní)</option>
                        <option value="8+">8+ (Velmi dobré)</option>
                        <option value="7+">7+ (Dobré)</option>
                        <option value="rated">Ohodnocené</option>
                        <option value="frisson">Má Frisson</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="table-container hide-mobile">
                <table style={{ fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('index')}># {getSortIcon('index')}</th>
                            <th onClick={() => handleSort('anime_name')}>Anime {getSortIcon('anime_name')}</th>
                            <th onClick={() => handleSort('type')}>Typ {getSortIcon('type')}</th>
                            <th onClick={() => handleSort('song')}>Song {getSortIcon('song')}</th>
                            <th onClick={() => handleSort('author')}>Autor {getSortIcon('author')}</th>
                            <th title="Hodnocení textu" onClick={() => handleSort('rating_lyrics')}>Text {getSortIcon('rating_lyrics')}</th>
                            <th title="Emoce" onClick={() => handleSort('rating_emotion')}>Emoce {getSortIcon('rating_emotion')}</th>
                            <th title="Melodie" onClick={() => handleSort('rating_melody')}>Melodie {getSortIcon('rating_melody')}</th>
                            <th title="Videoklip" onClick={() => handleSort('rating_video')}>Video {getSortIcon('rating_video')}</th>
                            <th title="Kvalita hlasu" onClick={() => handleSort('rating_voice')}>Hlas {getSortIcon('rating_voice')}</th>
                            <th title="Frisson" onClick={() => handleSort('has_frisson')} style={{ cursor: 'pointer' }}>⚡ {getSortIcon('has_frisson')}</th>
                            <th title="Průměrné hodnocení" onClick={() => handleSort('rating_avg')}>Prům. {getSortIcon('rating_avg')}</th>
                            <th onClick={() => handleSort('rating_final')}>Finální {getSortIcon('rating_final')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredFavorites.map((fav, idx) => (
                            <tr key={idx}>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {idx + 1}
                                </td>
                                <td>
                                    <div style={{ fontWeight: '500', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fav.anime_name}>
                                        {fav.anime_name}
                                    </div>
                                </td>
                                <td>
                                    <span className={`type-badge ${fav.type === 'OP' ? 'tv' : fav.type === 'ED' ? 'movie' : 'special'}`}>
                                        {fav.type}
                                    </span>
                                </td>
                                <td style={{ color: 'var(--accent-primary)', fontWeight: '500', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fav.song}>
                                    {fav.song}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fav.author}>
                                    {fav.author || '-'}
                                </td>
                                {/* Sub-ratings */}
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_lyrics && !isNaN(parseFloat(fav.rating_lyrics)) ? toCS(parseFloat(fav.rating_lyrics)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_emotion && !isNaN(parseFloat(fav.rating_emotion)) ? toCS(parseFloat(fav.rating_emotion)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_melody && !isNaN(parseFloat(fav.rating_melody)) ? toCS(parseFloat(fav.rating_melody)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_video && !isNaN(parseFloat(fav.rating_video)) ? toCS(parseFloat(fav.rating_video)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_voice && !isNaN(parseFloat(fav.rating_voice)) ? toCS(parseFloat(fav.rating_voice)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--accent-amber)' }}>
                                    {fav.has_frisson ? '⚡' : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {fav.rating_avg && !isNaN(parseFloat(fav.rating_avg)) ? toCS(parseFloat(parseFloat(fav.rating_avg).toFixed(1))) : ''}
                                </td>
                                <td>
                                    {fav.rating_final && !isNaN(parseFloat(fav.rating_final)) ? (
                                        <span className={`rating-badge ${parseFloat(fav.rating_final) >= 9 ? 'excellent' : 'good'}`}>
                                            {toCS(parseFloat(parseFloat(fav.rating_final).toFixed(1)))}
                                        </span>
                                    ) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards for Favorites */}
            <div className="mobile-card-list hide-desktop">
                {filteredFavorites.map((fav, idx) => (
                    <div key={idx} className="mobile-card">
                        <div className="mobile-card-header">
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)', flex: 1, alignItems: 'flex-start' }}>
                                <div style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    #{idx + 1}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                    <div className="mobile-card-title">
                                        <span style={{ color: 'var(--accent-primary)' }}>{fav.song}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                        {fav.anime_name}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span className={`type-badge ${fav.type === 'OP' ? 'tv' : fav.type === 'ED' ? 'movie' : 'special'}`} style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                                        {fav.type}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mobile-card-grid">
                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                <span>Autor:</span>
                                <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{fav.author || '-'}</span>
                            </div>

                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                                <span>Hodnocení (Průměr / Finální):</span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {fav.has_frisson && <span title="Frisson" style={{ color: 'var(--accent-amber)' }}>⚡</span>}
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        {fav.rating_avg && !isNaN(parseFloat(fav.rating_avg)) ? toCS(parseFloat(parseFloat(fav.rating_avg).toFixed(1))) : '-'}
                                    </span>
                                    <span>/</span>
                                    {fav.rating_final && !isNaN(parseFloat(fav.rating_final)) ? (
                                        <span className={`rating-badge ${parseFloat(fav.rating_final) >= 9 ? 'excellent' : 'good'}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: 'auto' }}>
                                            {toCS(parseFloat(parseFloat(fav.rating_final).toFixed(1)))}
                                        </span>
                                    ) : '-'}
                                </div>
                            </div>

                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                                <button
                                    onClick={() => setExpandedCardIdx(expandedCardIdx === idx ? null : idx)}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {expandedCardIdx === idx ? 'Skrýt detaily ▲' : 'Detailní hodnocení ▼'}
                                </button>
                            </div>

                            {expandedCardIdx === idx && (
                                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', padding: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Text:</span><span>{fav.rating_lyrics && !isNaN(parseFloat(fav.rating_lyrics)) ? toCS(parseFloat(fav.rating_lyrics)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Emoce:</span><span>{fav.rating_emotion && !isNaN(parseFloat(fav.rating_emotion)) ? toCS(parseFloat(fav.rating_emotion)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Melodie:</span><span>{fav.rating_melody && !isNaN(parseFloat(fav.rating_melody)) ? toCS(parseFloat(fav.rating_melody)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Videoklip:</span><span>{fav.rating_video && !isNaN(parseFloat(fav.rating_video)) ? toCS(parseFloat(fav.rating_video)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Hlas:</span><span>{fav.rating_voice && !isNaN(parseFloat(fav.rating_voice)) ? toCS(parseFloat(fav.rating_voice)) : '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* OST Section */}
            {stats?.ostItems?.length > 0 && (
                <div style={{ marginTop: 'var(--spacing-2xl)' }}>
                    <h3 style={{
                        marginBottom: 'var(--spacing-lg)',
                        color: 'var(--accent-amber)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        🎼 Favorite OST
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            ({stats.ostItems.length} skladeb)
                        </span>
                    </h3>
                    <div className="table-container hide-mobile">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Anime</th>
                                    <th>Song</th>
                                    <th>Autor</th>
                                    <th>Hodnocení</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.ostItems.map((ost, idx) => (
                                    <tr key={idx}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {idx + 1}
                                        </td>
                                        <td style={{ fontWeight: '500', maxWidth: '250px' }}>
                                            {ost.anime_name}
                                        </td>
                                        <td style={{ color: 'var(--accent-amber)', fontWeight: '500' }}>
                                            {ost.song}
                                        </td>
                                        <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {ost.author || '-'}
                                        </td>
                                        <td>
                                            {ost.rating_final && !isNaN(parseFloat(ost.rating_final)) ? (
                                                <span className={`rating-badge ${parseFloat(ost.rating_final) >= 9 ? 'excellent' : 'good'}`}>
                                                    {toCS(parseFloat(parseFloat(ost.rating_final).toFixed(1)))}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards for OST */}
                    <div className="mobile-card-list hide-desktop">
                        {stats.ostItems.map((ost, idx) => (
                            <div key={idx} className="mobile-card">
                                <div className="mobile-card-header">
                                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', flex: 1, alignItems: 'flex-start' }}>
                                        <div style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            #{idx + 1}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div className="mobile-card-title">
                                                <span style={{ color: 'var(--accent-amber)' }}>{ost.song}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                                {ost.anime_name}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mobile-card-grid">
                                    <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                        <span>Autor:</span>
                                        <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{ost.author || '-'}</span>
                                    </div>
                                    <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                        <span>Hodnocení:</span>
                                        {ost.rating_final && !isNaN(parseFloat(ost.rating_final)) ? (
                                            <span className={`rating-badge ${parseFloat(ost.rating_final) >= 9 ? 'excellent' : 'good'}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: 'auto' }}>
                                                {toCS(parseFloat(parseFloat(ost.rating_final).toFixed(1)))}
                                            </span>
                                        ) : '-'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Chart Settings Popover */}
            <ChartSettingsModal
                isOpen={!!activeChartSettings}
                onClose={() => setActiveChartSettings(null)}
                chartId={activeChartSettings?.id}
                chartTitle={activeChartSettings?.title}
                anchorPosition={activeChartSettings?.anchorPosition}
            />
        </div>
    )
}

export default Favorites
