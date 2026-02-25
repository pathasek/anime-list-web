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
        const animeFH = {} // For Top Series by FH
        let withRating = 0

        // Rating category sums
        let lyricsSum = 0, lyricsCount = 0
        let musicSum = 0, musicCount = 0
        let visualsSum = 0, visualsCount = 0
        let frissonSum = 0, frissonCount = 0
        let fhSum = 0, fhCount = 0
        let avgSum = 0, avgCount = 0
        let totalSum = 0, totalCount = 0

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

                // Track FH for Top Series
                if (f.rating_fh && !isNaN(parseFloat(f.rating_fh))) {
                    if (!animeFH[animeName]) animeFH[animeName] = { sum: 0, count: 0 }
                    animeFH[animeName].sum += parseFloat(f.rating_fh)
                    animeFH[animeName].count++
                }
            }

            // Rating stats
            if (f.rating_total && !isNaN(parseFloat(f.rating_total))) {
                withRating++
                totalSum += parseFloat(f.rating_total)
                totalCount++
            }
            if (f.rating_lyrics && !isNaN(parseFloat(f.rating_lyrics))) {
                lyricsSum += parseFloat(f.rating_lyrics)
                lyricsCount++
            }
            if (f.rating_music && !isNaN(parseFloat(f.rating_music))) {
                musicSum += parseFloat(f.rating_music)
                musicCount++
            }
            if (f.rating_visuals && !isNaN(parseFloat(f.rating_visuals))) {
                visualsSum += parseFloat(f.rating_visuals)
                visualsCount++
            }
            if (f.rating_frisson && !isNaN(parseFloat(f.rating_frisson))) {
                frissonSum += parseFloat(f.rating_frisson)
                frissonCount++
            }
            if (f.rating_fh && !isNaN(parseFloat(f.rating_fh))) {
                fhSum += parseFloat(f.rating_fh)
                fhCount++
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

        // Top 6 series by average FH
        const topSeriesByFH = Object.entries(animeFH)
            .map(([name, data]) => ({ name, avgFH: data.sum / data.count }))
            .sort((a, b) => b.avgFH - a.avgFH)
            .slice(0, 6)

        // Average ratings by category
        const avgRatings = {
            lyrics: lyricsCount > 0 ? toCS((lyricsSum / lyricsCount).toFixed(2)) : null,
            music: musicCount > 0 ? toCS((musicSum / musicCount).toFixed(2)) : null,
            visuals: visualsCount > 0 ? toCS((visualsSum / visualsCount).toFixed(2)) : null,
            frisson: frissonCount > 0 ? toCS((frissonSum / frissonCount).toFixed(2)) : null,
            fh: fhCount > 0 ? toCS((fhSum / fhCount).toFixed(2)) : null,
            avg: avgCount > 0 ? toCS((avgSum / avgCount).toFixed(2)) : null,
            total: totalCount > 0 ? toCS((totalSum / totalCount).toFixed(2)) : null
        }

        // OST items
        const ostItems = favorites.filter(f => f.type?.toUpperCase() === 'OST')

        return { types, topAuthors, topAnime, withRating, total: favorites.length, avgRatings, ostItems, topSeriesByFH }
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
                const rating = parseFloat(f.rating_total)
                if (isNaN(rating)) return false
                if (ratingFilter === '9+') return rating >= 9
                if (ratingFilter === '8+') return rating >= 8
                if (ratingFilter === '7+') return rating >= 7
                if (ratingFilter === 'rated') return !isNaN(rating)

                // New rating filters
                if (ratingFilter === 'frisson') return f.rating_frisson && parseFloat(f.rating_frisson) > 0
                if (ratingFilter === 'fh') return f.rating_fh && parseFloat(f.rating_fh) > 0

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

    // Top Series by FH Chart
    const topSeriesFHData = {
        labels: stats?.topSeriesByFH.map(s => s.name.substring(0, 20)) || [],
        datasets: [{
            label: 'Průměrné FH',
            data: stats?.topSeriesByFH.map(s => s.avgFH) || [],
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
            {stats?.avgRatings?.total && (
                <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--accent-primary)', fontSize: '1.25rem' }}>
                        📊 Průměrná hodnocení kategorií
                    </h3>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                        <div className="stat-card">
                            <div className="stat-value">{stats.avgRatings.avg}</div>
                            <div className="stat-label">AVG</div>
                        </div>
                        {stats.avgRatings.lyrics && (
                            <div className="stat-card">
                                <div className="stat-value">{stats.avgRatings.lyrics}</div>
                                <div className="stat-label">Text / Lyrics</div>
                            </div>
                        )}
                        {stats.avgRatings.music && (
                            <div className="stat-card pink">
                                <div className="stat-value">{stats.avgRatings.music}</div>
                                <div className="stat-label">Hudba / Music</div>
                            </div>
                        )}
                        {stats.avgRatings.visuals && (
                            <div className="stat-card cyan">
                                <div className="stat-value">{stats.avgRatings.visuals}</div>
                                <div className="stat-label">Vizuál / Visuals</div>
                            </div>
                        )}
                        {stats.avgRatings.frisson && (
                            <div className="stat-card amber">
                                <div className="stat-value">{stats.avgRatings.frisson}</div>
                                <div className="stat-label">Frisson</div>
                            </div>
                        )}
                        {stats.avgRatings.fh && (
                            <div className="stat-card emerald">
                                <div className="stat-value">{stats.avgRatings.fh}</div>
                                <div className="stat-label">FH</div>
                            </div>
                        )}
                        <div className="stat-card">
                            <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{stats.avgRatings.total}</div>
                            <div className="stat-label">Celkové / Total</div>
                        </div>
                    </div>
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
                        <div className="chart-title">Top Séries (dle FH)</div>
                        <button className="chart-settings-btn" onClick={(e) => openChartSettings(e, 'fav_series_fh', 'Top Séries (dle FH)')} title="Nastavení">⚙️</button>
                    </div>
                    <div style={{ height: '250px' }}>
                        <Bar data={topSeriesFHData} options={{
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
                        <option value="fh">Má FH</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                <table style={{ fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('index')}># {getSortIcon('index')}</th>
                            <th onClick={() => handleSort('anime_name')}>Anime {getSortIcon('anime_name')}</th>
                            <th onClick={() => handleSort('type')}>Typ {getSortIcon('type')}</th>
                            <th onClick={() => handleSort('song')}>Song {getSortIcon('song')}</th>
                            <th onClick={() => handleSort('author')}>Autor {getSortIcon('author')}</th>
                            <th title="Lyrics" onClick={() => handleSort('rating_lyrics')}>Text {getSortIcon('rating_lyrics')}</th>
                            <th title="Music" onClick={() => handleSort('rating_music')}>Hudba {getSortIcon('rating_music')}</th>
                            <th title="Visuals" onClick={() => handleSort('rating_visuals')}>Vizuál {getSortIcon('rating_visuals')}</th>
                            <th title="Frisson">⚡</th>
                            <th title="Future House">FH</th>
                            <th title="Average">AVG</th>
                            <th onClick={() => handleSort('rating_total')}>Total {getSortIcon('rating_total')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredFavorites.map((fav, idx) => (
                            <tr key={idx}>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {fav.index}
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
                                {/* Extra Ratings */}
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_lyrics}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_music}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_visuals}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--accent-amber)' }}>
                                    {fav.rating_frisson && parseFloat(fav.rating_frisson) > 0 ? fav.rating_frisson : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--accent-emerald)' }}>
                                    {fav.rating_fh && parseFloat(fav.rating_fh) > 0 ? fav.rating_fh : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {fav.rating_avg}
                                </td>

                                <td>
                                    {fav.rating_total && !isNaN(parseFloat(fav.rating_total)) ? (
                                        <span className={`rating-badge ${parseFloat(fav.rating_total) >= 9 ? 'excellent' : 'good'}`}>
                                            {toCS(parseFloat(fav.rating_total).toFixed(1))}
                                        </span>
                                    ) : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
                    <div className="table-container">
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
                                            {ost.rating_total && !isNaN(parseFloat(ost.rating_total)) ? (
                                                <span className={`rating-badge ${parseFloat(ost.rating_total) >= 9 ? 'excellent' : 'good'}`}>
                                                    {toCS(parseFloat(ost.rating_total).toFixed(1))}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
