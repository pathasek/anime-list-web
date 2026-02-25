import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'

function AnimeList() {
    const navigate = useNavigate()
    const [animeList, setAnimeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'end_date', direction: 'desc' })
    const [typeFilter, setTypeFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState(() => {
        return localStorage.getItem('statusFilter') || 'AIRING!'
    })
    const [seriesFilter, setSeriesFilter] = useState(null)


    useEffect(() => {
        loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
            .then(data => {
                const indexedData = data.map((item, idx) => ({ ...item, originalIndex: idx + 1 }))
                setAnimeList(indexedData)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load anime list:', err)
                setLoading(false)
            })
    }, [])

    // Get unique statuses for filter
    const statuses = useMemo(() => {
        // Enforce specific order: Pending -> Airing -> Finished
        return ['all', 'PENDING', 'AIRING!', 'FINISHED']
    }, [])

    // Sync status filter to localStorage
    useEffect(() => {
        localStorage.setItem('statusFilter', statusFilter)
    }, [statusFilter])

    // Get unique types for filter
    const types = useMemo(() => {
        const t = new Set()
        animeList.forEach(a => a.type && t.add(a.type))
        return ['all', ...Array.from(t)]
    }, [animeList])

    // Filter and sort
    const filteredList = useMemo(() => {
        let result = [...animeList]

        // Series filter (takes precedence or works alongside status)
        if (seriesFilter) {
            result = result.filter(a => extractSeriesBaseName(a.name) === seriesFilter)
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(a =>
                a.name?.toLowerCase().includes(term) ||
                a.studio?.toLowerCase().includes(term) ||
                a.genres?.toLowerCase().includes(term) ||
                a.themes?.toLowerCase().includes(term)
            )
        }

        // Type filter
        if (typeFilter !== 'all') {
            result = result.filter(a => a.type === typeFilter)
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(a => a.status === statusFilter)
        }

        // Sort
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = sortConfig.key === 'index' ? a.originalIndex : a[sortConfig.key]
                let bVal = sortConfig.key === 'index' ? b.originalIndex : b[sortConfig.key]

                // Handle null values
                if (aVal == null) return 1
                if (bVal == null) return -1

                // Handle dates
                if (sortConfig.key.includes('date')) {
                    aVal = new Date(aVal).getTime() || 0
                    bVal = new Date(bVal).getTime() || 0
                }

                // Handle numbers
                if (sortConfig.key === 'rating' || sortConfig.key === 'episodes' || sortConfig.key === 'index') {
                    aVal = parseFloat(aVal) || 0
                    bVal = parseFloat(bVal) || 0
                }

                if (typeof aVal === 'string') {
                    return sortConfig.direction === 'asc'
                        ? aVal.localeCompare(bVal)
                        : bVal.localeCompare(aVal)
                }

                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
            })
        }

        return result
    }, [animeList, searchTerm, typeFilter, statusFilter, sortConfig])

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return ''
        return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
    }

    const getRatingClass = (rating) => {
        const r = parseFloat(rating)
        if (r >= 9) return 'excellent'
        if (r >= 7.5) return 'good'
        if (r >= 6) return 'average'
        return 'below'
    }

    const getTypeBadgeClass = (type) => {
        const t = type?.toLowerCase() || ''
        if (t.includes('movie')) return 'movie'
        if (t.includes('ova')) return 'ova'
        if (t.includes('ona')) return 'ona'
        if (t.includes('special')) return 'special'
        return 'tv'
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        const d = new Date(dateStr)
        return d.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'numeric', day: 'numeric' })
    }

    // Check if anime is part of a series (not standalone)
    const isPartOfSeries = (name) => {
        if (!name) return false
        // Match patterns like S01, S02, Season 1, Part 1, Part 2, etc.
        return /,\s*S\d+|Season\s*\d+|Part\s*\d+|:\s*S\d+/i.test(name)
    }

    // Extract base name of a series for filtering
    const extractSeriesBaseName = (name) => {
        if (!name) return ''
        // Extract everything before the first comma, colon, "Season", or "Part"
        return name.split(/,\s*S\d+|Season\s*\d+|Part\s*\d+|:\s*S\d+/i)[0].trim()
    }

    const toggleSeriesFilter = (name) => {
        const baseName = extractSeriesBaseName(name)
        if (seriesFilter === baseName) {
            setSeriesFilter(null)
        } else {
            setSeriesFilter(baseName)
        }
    }

    // Get MAL URL - use direct URL or fallback to search
    const getMALUrl = (anime) => {
        if (anime.mal_url) return anime.mal_url
        // Fallback to search if no direct URL
        const cleanName = anime.name?.replace(/,\s*S\d+.*$/i, '').replace(/\s*Season\s*\d+.*$/i, '')
        return cleanName ? `https://myanimelist.net/anime.php?q=${encodeURIComponent(cleanName)}&cat=anime` : null
    }



    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ margin: 0 }}>
                    Anime List
                    <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                        ({filteredList.length} z {animeList.length})
                    </span>
                </h2>
            </div>

            {/* Search and Filters */}
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Hledat anime, studio, žánr..."
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
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="select"
                        style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    >
                        <option value="all">Všechny statusy</option>
                        <option value="PENDING">Pending</option>
                        <option value="AIRING!">Airing</option>
                        <option value="FINISHED">Finished</option>
                    </select>
                    {types.map(t => (
                        <button
                            key={t}
                            className={`filter-btn ${typeFilter === t ? 'active' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t === 'all' ? 'Vše' : t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('index')} className={sortConfig.key === 'index' ? 'sorted' : ''}>
                                #{getSortIndicator('index')}
                            </th>
                            <th style={{ width: '90px' }}>Náhled</th>
                            <th onClick={() => handleSort('name')} className={sortConfig.key === 'name' ? 'sorted' : ''}>
                                Název{getSortIndicator('name')}
                            </th>
                            <th onClick={() => handleSort('type')} className={sortConfig.key === 'type' ? 'sorted' : ''}>
                                Typ{getSortIndicator('type')}
                            </th>
                            <th onClick={() => handleSort('studio')} className={sortConfig.key === 'studio' ? 'sorted' : ''}>
                                Studio{getSortIndicator('studio')}
                            </th>
                            <th onClick={() => handleSort('genres')} className={sortConfig.key === 'genres' ? 'sorted' : ''}>
                                Žánry{getSortIndicator('genres')}
                            </th>
                            <th onClick={() => handleSort('episodes')} className={sortConfig.key === 'episodes' ? 'sorted' : ''}>
                                Ep.{getSortIndicator('episodes')}
                            </th>
                            <th onClick={() => handleSort('rating')} className={sortConfig.key === 'rating' ? 'sorted' : ''}>
                                Hodnocení <span title="Pro detaily rozklikněte hodnocení v rámečku" style={{ cursor: 'help', fontSize: '0.8rem', opacity: 0.8 }}>ℹ️</span>{getSortIndicator('rating')}
                            </th>
                            <th onClick={() => handleSort('end_date')} className={sortConfig.key === 'end_date' ? 'sorted' : ''}>
                                Dosledováno{getSortIndicator('end_date')}
                            </th>
                            <th onClick={() => handleSort('status')} className={sortConfig.key === 'status' ? 'sorted' : ''}>
                                Status{getSortIndicator('status')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map((anime, idx) => (
                            <tr key={idx}>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                    {idx + 1}.
                                </td>
                                <td style={{ padding: '4px' }}>
                                    {anime.thumbnail ? (
                                        <img
                                            src={anime.thumbnail}
                                            alt={anime.name}
                                            style={{
                                                width: '80px',
                                                height: '45px',
                                                objectFit: 'cover',
                                                borderRadius: '4px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                                cursor: 'zoom-in'
                                            }}
                                            loading="lazy"
                                            onMouseEnter={(e) => {
                                                const rect = e.target.getBoundingClientRect();
                                                const viewportW = window.innerWidth;
                                                const viewportH = window.innerHeight;
                                                const isBottom = rect.top > viewportH * 0.5;
                                                const isRight = rect.left > viewportW * 0.5;
                                                const originY = isBottom ? 'bottom' : 'top';
                                                const originX = isRight ? 'right' : 'left';
                                                e.target.style.transformOrigin = `${originY} ${originX}`;
                                                e.target.style.transform = 'scale(4)';
                                                e.target.style.zIndex = '1000';
                                                e.target.style.position = 'relative';
                                                e.target.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8)';
                                                e.target.style.borderRadius = '2px';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.target.style.transform = 'scale(1)';
                                                e.target.style.zIndex = '1';
                                                e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
                                                e.target.style.borderRadius = '4px';
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '80px',
                                            height: '45px',
                                            backgroundColor: 'var(--bg-secondary)',
                                            borderRadius: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.7rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            ?
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '320px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <a
                                                href={getMALUrl(anime)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{
                                                    fontWeight: '500',
                                                    color: 'var(--text-primary)',
                                                    textDecoration: 'none',
                                                }}
                                                title={anime.mal_url ? "Otevřít na MyAnimeList" : "Hledat na MyAnimeList"}
                                            >
                                                {anime.name}
                                            </a>
                                            {isPartOfSeries(anime.name) && (
                                                <span
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        toggleSeriesFilter(anime.name)
                                                    }}
                                                    style={{
                                                        fontSize: '0.65rem',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        background: seriesFilter === extractSeriesBaseName(anime.name) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                        color: 'white',
                                                        whiteSpace: 'nowrap',
                                                        cursor: 'pointer',
                                                        border: `1px solid ${seriesFilter === extractSeriesBaseName(anime.name) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                                        boxShadow: seriesFilter === extractSeriesBaseName(anime.name) ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none'
                                                    }}
                                                    title={seriesFilter === extractSeriesBaseName(anime.name) ? "Zrušit filtr série" : "Filtrovat tuhle sérii"}
                                                >
                                                    Série
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`type-badge ${getTypeBadgeClass(anime.type)}`}>
                                        {anime.type || '-'}
                                    </span>
                                </td>
                                <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '150px' }}>
                                    {anime.studio?.substring(0, 30) || '-'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                                    {anime.genres || '-'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {anime.episodes || '-'}
                                </td>
                                <td>
                                    {anime.rating ? (
                                        <span
                                            className={`rating-badge ${getRatingClass(anime.rating)}`}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => navigate(`/anime/${encodeURIComponent(anime.name)}`)}
                                            title="Zobrazit detailní hodnocení"
                                        >
                                            {parseFloat(anime.rating).toFixed(1)}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    {formatDate(anime.end_date)}
                                </td>
                                <td>
                                    <span className={`status-badge ${(anime.status || 'FINISHED').toLowerCase().replace('!', '')}`}>
                                        {anime.status || 'FINISHED'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default AnimeList
