import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'

function AnimeList() {
    const navigate = useNavigate()
    const [animeList, setAnimeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'default', direction: 'asc' })
    const [typeFilter, setTypeFilter] = useState('all')
    const [statusFilter, setStatusFilter] = useState(() => {
        return localStorage.getItem('statusFilter') || 'AIRING!'
    })
    const [seriesFilter, setSeriesFilter] = useState(null)
    const [expandedImage, setExpandedImage] = useState(null)

    useEffect(() => {
        loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
            .then(data => {
                const indexedData = data.map((item, idx) => ({ ...item, originalIndex: idx + 1 }))
                setAnimeList(indexedData)
                setLoading(false)

                // Skok na uloženou pozici (Scroll restoration)
                setTimeout(() => {
                    const savedScroll = sessionStorage.getItem('animeListScroll')
                    if (savedScroll) {
                        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
                        sessionStorage.removeItem('animeListScroll')
                    }
                }, 50)
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
            result = result.filter(a => extractSeriesBaseName(a) === seriesFilter)
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
                // Default multi-level sort: Status → end_date desc → name asc
                if (sortConfig.key === 'default') {
                    const statusOrder = { 'PENDING': 1, 'AIRING!': 2, 'FINISHED': 3 }
                    const aStatus = statusOrder[a.status] || 99
                    const bStatus = statusOrder[b.status] || 99
                    if (aStatus !== bStatus) return aStatus - bStatus

                    // Within same status, sort by end_date desc
                    const aDate = new Date(a.end_date || '1900-01-01').getTime()
                    const bDate = new Date(b.end_date || '1900-01-01').getTime()
                    if (aDate !== bDate) return bDate - aDate

                    // Then by name asc
                    return (a.name || '').localeCompare(b.name || '')
                }

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

                // Handle custom status sort order
                if (sortConfig.key === 'status') {
                    const order = { 'PENDING': 1, 'AIRING!': 2, 'FINISHED': 3 }
                    aVal = order[aVal] || 99
                    bVal = order[bVal] || 99
                    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
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
    }, [animeList, searchTerm, typeFilter, statusFilter, sortConfig, seriesFilter])

    const handleSort = (key) => {
        if (key === sortConfig.key && sortConfig.key !== 'default') {
            setSortConfig(prev => ({
                key,
                direction: prev.direction === 'asc' ? 'desc' : 'asc'
            }))
        } else {
            setSortConfig({ key, direction: key === 'default' ? 'asc' : 'desc' })
        }
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
        if (!dateStr || dateStr === 'X') return '-'
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return '-'
        return d.toLocaleDateString('cs-CZ', { year: 'numeric', month: 'numeric', day: 'numeric' })
    }

    // Check if anime is part of a series using exported series field
    function isPartOfSeries(anime) {
        if (!anime) return false
        return !!anime.series
    }

    // Extract base name of a series for filtering — use series field directly
    function extractSeriesBaseName(anime) {
        if (!anime) return ''
        return anime.series || anime.name || ''
    }

    const [savedScrollPos, setSavedScrollPos] = useState(0)

    const toggleSeriesFilter = (anime) => {
        const baseName = extractSeriesBaseName(anime)
        if (seriesFilter === baseName) {
            setSeriesFilter(null)

            // Wait for React to re-render the full list, then restore scroll position
            setTimeout(() => {
                window.scrollTo({ top: savedScrollPos, behavior: 'instant' })
            }, 10)
        } else {
            // Save current scroll position before filtering shrinks the page
            setSavedScrollPos(window.scrollY)

            setSeriesFilter(baseName)
            // Reset other filters to show the FULL series as requested
            setStatusFilter('all')
            setTypeFilter('all')
            setSearchTerm('')
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
            <div className="table-container hide-mobile">
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
                                        <div
                                            style={{
                                                width: '80px',
                                                height: '45px',
                                                position: 'relative',
                                                overflow: 'visible'
                                            }}
                                            onMouseEnter={(e) => {
                                                const td = e.currentTarget.closest('td');
                                                if (td) {
                                                    td.style.position = 'relative';
                                                    td.style.zIndex = '1000';
                                                }
                                                const img = e.currentTarget.querySelector('img');
                                                if (!img) return;
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const viewportW = window.innerWidth;
                                                const viewportH = window.innerHeight;
                                                const isBottom = rect.top > viewportH * 0.5;
                                                const isRight = rect.left > viewportW * 0.5;
                                                const originY = isBottom ? 'bottom' : 'top';
                                                const originX = isRight ? 'right' : 'left';
                                                img.style.transformOrigin = `${originY} ${originX}`;
                                                img.style.transform = 'scale(6)';
                                                img.style.zIndex = '1000';
                                                img.style.boxShadow = '0 8px 24px rgba(0,0,0,0.8)';
                                                img.style.borderRadius = '2px';
                                            }}
                                            onMouseLeave={(e) => {
                                                const td = e.currentTarget.closest('td');
                                                if (td) {
                                                    td.style.position = '';
                                                    td.style.zIndex = '';
                                                }
                                                const img = e.currentTarget.querySelector('img');
                                                if (!img) return;
                                                img.style.transform = 'scale(1)';
                                                img.style.zIndex = '500';
                                                img.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
                                                img.style.borderRadius = '4px';
                                                setTimeout(() => { img.style.zIndex = '1'; }, 350);
                                            }}
                                        >
                                            <img
                                                src={anime.thumbnail}
                                                alt={anime.name}
                                                style={{
                                                    width: '80px',
                                                    height: '45px',
                                                    objectFit: 'cover',
                                                    backgroundColor: 'rgba(0,0,0,0.1)',
                                                    borderRadius: '4px',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                    transition: 'transform 0.35s ease, box-shadow 0.35s ease',
                                                    cursor: 'zoom-in',
                                                    pointerEvents: 'none',
                                                    position: 'relative'
                                                }}
                                                loading="lazy"
                                            />
                                        </div>
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
                                            {isPartOfSeries(anime) && (
                                                <span
                                                    onClick={(e) => {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        toggleSeriesFilter(anime)
                                                    }}
                                                    className={`series-badge ${seriesFilter === extractSeriesBaseName(anime) ? 'active' : ''}`}
                                                    style={{
                                                        fontSize: '0.65rem',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        background: seriesFilter === extractSeriesBaseName(anime) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                        color: 'white',
                                                        whiteSpace: 'nowrap',
                                                        cursor: 'pointer',
                                                        border: `1px solid ${seriesFilter === extractSeriesBaseName(anime) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                                        boxShadow: seriesFilter === extractSeriesBaseName(anime) ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none'
                                                    }}
                                                    title={seriesFilter === extractSeriesBaseName(anime) ? "Zrušit filtr série" : "Filtrovat tuhle sérii"}
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
                                    {anime.rating && !isNaN(Number(anime.rating)) ? (
                                        <span
                                            className={`rating-badge ${getRatingClass(anime.rating)}`}
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => {
                                                sessionStorage.setItem('animeListScroll', window.scrollY)
                                                navigate(`/anime/${encodeURIComponent(anime.name)}`)
                                            }}
                                            title="Zobrazit detailní hodnocení"
                                        >
                                            {Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toFixed(1)}/10
                                        </span>
                                    ) : (
                                        <span
                                            className="rating-badge"
                                            style={{ cursor: 'pointer', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                                            onClick={() => {
                                                sessionStorage.setItem('animeListScroll', window.scrollY)
                                                navigate(`/anime/${encodeURIComponent(anime.name)}`)
                                            }}
                                            title="Zobrazit detailní hodnocení"
                                        >
                                            X/10
                                        </span>
                                    )}
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

            {/* Mobile Cards */}
            <div className="mobile-card-list hide-desktop">
                {filteredList.map((anime, idx) => (
                    <div key={idx} className="mobile-card">
                        <div className="mobile-card-header">
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)', width: '100%', alignItems: 'center' }}>
                                {/* Image on the left */}
                                <div style={{ minWidth: '64px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); anime.thumbnail && setExpandedImage(anime.thumbnail); }}>
                                    {anime.thumbnail ? (
                                        <img
                                            src={anime.thumbnail}
                                            alt={anime.name}
                                            style={{
                                                width: '64px', height: '80px', objectFit: 'contain', backgroundColor: 'rgba(0,0,0,0.1)',
                                                borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                            }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div style={{
                                            width: '64px', height: '80px', backgroundColor: 'var(--bg-tertiary)',
                                            borderRadius: '4px', display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', fontSize: '1rem', color: 'var(--text-muted)'
                                        }}>?</div>
                                    )}
                                </div>

                                {/* Content container */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold', flexShrink: 0 }}>
                                            #{idx + 1}
                                        </div>
                                        <div className="mobile-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                            <a
                                                href={getMALUrl(anime)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                                            >
                                                {anime.name}
                                            </a>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className={`type-badge ${getTypeBadgeClass(anime.type)}`} style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                                            {anime.type || '-'}
                                        </span>
                                        <span className={`status-badge ${(anime.status || 'FINISHED').toLowerCase().replace('!', '')}`} style={{ padding: '2px 6px', fontSize: '0.65rem', minWidth: 'auto' }}>
                                            {anime.status || 'FINISHED'}
                                        </span>
                                        {isPartOfSeries(anime) && (
                                            <span
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSeriesFilter(anime) }}
                                                style={{
                                                    fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px',
                                                    background: seriesFilter === extractSeriesBaseName(anime) ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                    color: 'white', cursor: 'pointer',
                                                    border: `1px solid ${seriesFilter === extractSeriesBaseName(anime) ? 'var(--accent-primary)' : 'var(--border-color)'}`
                                                }}
                                            >Série</span>
                                        )}
                                    </div>
                                </div>

                                {/* Big Rating on the right */}
                                {anime.rating && !isNaN(Number(anime.rating)) ? (
                                    <div
                                        style={{ textAlign: 'right', minWidth: '50px', marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '2px' }}
                                        onClick={() => {
                                            sessionStorage.setItem('animeListScroll', window.scrollY)
                                            navigate(`/anime/${encodeURIComponent(anime.name)}`)
                                        }}
                                    >
                                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                                            {Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toFixed(1)}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/10</span>
                                    </div>
                                ) : (
                                    <div
                                        style={{ textAlign: 'right', minWidth: '50px', marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '2px' }}
                                        onClick={() => {
                                            sessionStorage.setItem('animeListScroll', window.scrollY)
                                            navigate(`/anime/${encodeURIComponent(anime.name)}`)
                                        }}
                                    >
                                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                                            X
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/10</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mobile-card-grid">
                            <div className="mobile-card-row">
                                <span>Epizody:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{anime.episodes || '-'}</span>
                            </div>
                            <div className="mobile-card-row">
                                <span>Zhlédnuto:</span>
                                <span style={{ color: 'var(--text-primary)' }}>{formatDate(anime.end_date)}</span>
                            </div>
                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                <span>Studio:</span>
                                <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{anime.studio?.substring(0, 30) || '-'}</span>
                            </div>
                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                <span>Žánry:</span>
                                <span style={{ color: 'var(--text-primary)', textAlign: 'right' }}>{anime.genres || '-'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Full-screen Image Modal */}
            {expandedImage && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: 999999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '16px'
                    }}
                    onClick={() => setExpandedImage(null)}
                >
                    <img
                        src={expandedImage}
                        alt="Zvětšený náhled"
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                            display: 'block'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div >
    )
}

export default AnimeList
