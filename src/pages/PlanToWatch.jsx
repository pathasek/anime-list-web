import { useState, useEffect, useMemo } from 'react'

function PlanToWatch() {
    const [planList, setPlanList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'priority', direction: 'asc' })
    const [statusFilter, setStatusFilter] = useState('all')

    useEffect(() => {
        fetch('data/plan_to_watch.json')
            .then(r => r.json())
            .then(data => {
                // Filter out invalid entries (placeholders like InterestStacks)
                const validData = data.filter(item =>
                    item.name &&
                    !item.name.includes('InterestStacks') &&
                    !item.name.includes('Short Completed Anime') &&
                    !item.name.includes('Cosmic Horror') &&
                    !item.name.includes('Anime, co vypadají')
                )
                setPlanList(validData)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load plan to watch:', err)
                setLoading(false)
            })
    }, [])

    // Stats
    const stats = useMemo(() => {
        if (!planList.length) return null

        let totalEpisodes = 0
        let airingCount = 0
        let releasedCount = 0
        const types = {}

        planList.forEach(item => {
            const eps = parseInt(item.episodes)
            if (!isNaN(eps) && eps > 0) totalEpisodes += eps

            if (item.notes === 'AIRING!') airingCount++
            else if (item.notes === 'Vydáno') releasedCount++

            const type = item.type || 'Unknown'
            types[type] = (types[type] || 0) + 1
        })

        // Estimated time (assuming 24 min per episode)
        const estimatedHours = Math.round(totalEpisodes * 24 / 60)

        return {
            total: planList.length,
            totalEpisodes,
            estimatedHours,
            airingCount,
            releasedCount,
            types
        }
    }, [planList])

    // Filter and sort
    const filteredList = useMemo(() => {
        let result = [...planList]

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(item =>
                item.name?.toLowerCase().includes(term) ||
                item.source?.toLowerCase().includes(term)
            )
        }

        // Status filter
        if (statusFilter === 'airing') {
            result = result.filter(item => item.notes === 'AIRING!')
        } else if (statusFilter === 'released') {
            result = result.filter(item => item.notes === 'Vydáno')
        }

        // Sort
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]

                if (aVal == null) return 1
                if (bVal == null) return -1

                // Numeric for priority and episodes
                if (sortConfig.key === 'priority' || sortConfig.key === 'episodes') {
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
    }, [planList, searchTerm, statusFilter, sortConfig])

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

    const getTypeBadgeClass = (type) => {
        const t = type?.toLowerCase() || ''
        if (t.includes('movie')) return 'movie'
        if (t.includes('ova')) return 'ova'
        if (t.includes('ona')) return 'ona'
        if (t.includes('multiple')) return 'special'
        return 'tv'
    }

    const ExpandableSource = ({ text }) => {
        const [expanded, setExpanded] = useState(false);
        if (!text) return '-';

        const linkify = (t) => {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            return t.split(urlRegex).map((part, i) => {
                if (part.match(urlRegex)) {
                    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>{part.length > 50 ? part.substring(0, 50) + '...' : part}</a>
                }
                return part;
            });
        };

        const isLong = text.length > 100;
        const displayText = expanded ? text : (isLong ? text.substring(0, 100) + '...' : text);

        return (
            <div>
                {linkify(displayText)}
                {isLong && (
                    <button
                        onClick={() => { setExpanded(!expanded) }}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: '4px', fontSize: '0.75rem', textDecoration: 'underline' }}
                    >
                        {expanded ? 'Méně' : 'Více'}
                    </button>
                )}
            </div>
        );
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in">
            <h2 style={{ marginBottom: 'var(--spacing-xl)' }}>
                Plan to Watch
                <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                    ({filteredList.length} z {planList.length})
                </span>
            </h2>

            {/* Stats Grid */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats?.total || 0}</div>
                    <div className="stat-label">Anime k zhlédnutí</div>
                </div>
                <div className="stat-card pink">
                    <div className="stat-value">{stats?.totalEpisodes?.toLocaleString() || 0}</div>
                    <div className="stat-label">Celkem epizod</div>
                </div>
                <div className="stat-card cyan">
                    <div className="stat-value">{Math.floor((stats?.estimatedHours || 0) / 24)} dní</div>
                    <div className="stat-label">Odhadovaný čas</div>
                </div>
                <div className="stat-card emerald">
                    <div className="stat-value">{stats?.airingCount || 0}</div>
                    <div className="stat-label">Právě vysílá</div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Hledat anime nebo důvod..."
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
                    <button
                        className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('all')}
                    >
                        Vše
                    </button>
                    <button
                        className={`filter-btn ${statusFilter === 'airing' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('airing')}
                    >
                        🔴 Airing
                    </button>
                    <button
                        className={`filter-btn ${statusFilter === 'released' ? 'active' : ''}`}
                        onClick={() => setStatusFilter('released')}
                    >
                        Vydáno
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                <table>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('name')} className={sortConfig.key === 'name' ? 'sorted' : ''}>
                                Název{getSortIndicator('name')}
                            </th>
                            <th onClick={() => handleSort('type')} className={sortConfig.key === 'type' ? 'sorted' : ''}>
                                Typ{getSortIndicator('type')}
                            </th>
                            <th onClick={() => handleSort('episodes')} className={sortConfig.key === 'episodes' ? 'sorted' : ''}>
                                Ep.{getSortIndicator('episodes')}
                            </th>
                            <th onClick={() => handleSort('priority')} className={sortConfig.key === 'priority' ? 'sorted' : ''}>
                                Priorita{getSortIndicator('priority')}
                            </th>
                            <th>Důvod / Zdroj</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map((item, idx) => (
                            <tr key={idx}>
                                <td>
                                    <div style={{ fontWeight: '500', maxWidth: '300px' }}>
                                        {item.name}
                                    </div>
                                </td>
                                <td>
                                    <span className={`type-badge ${getTypeBadgeClass(item.type)}`}>
                                        {item.type || '-'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {item.episodes && !isNaN(parseInt(item.episodes)) ? parseInt(item.episodes) : '-'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    {item.priority && !isNaN(parseFloat(item.priority)) ? (
                                        <span style={{
                                            padding: '2px 8px',
                                            background: parseFloat(item.priority) > 1000 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                                            color: parseFloat(item.priority) > 1000 ? 'var(--accent-red)' : 'var(--accent-primary)',
                                            borderRadius: '4px',
                                            fontSize: '0.875rem'
                                        }}>
                                            {Math.round(parseFloat(item.priority))}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '350px' }}>
                                    <ExpandableSource text={item.source} />
                                </td>
                                <td>
                                    {item.notes === 'AIRING!' ? (
                                        <span style={{
                                            padding: '4px 8px',
                                            background: 'rgba(239, 68, 68, 0.2)',
                                            color: 'var(--accent-red)',
                                            borderRadius: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600'
                                        }}>
                                            🔴 AIRING
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--accent-emerald)', fontSize: '0.875rem' }}>
                                            ✓ Vydáno
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default PlanToWatch
