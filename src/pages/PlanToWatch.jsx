import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import './PlanToWatch.css'

// Popisky sloupců pro podtitulek („řazeno podle …")
const SORT_LABELS = { name: 'Název', type: 'Typ', episodes: 'Ep.' }

function PlanToWatch() {
    const [planList, setPlanList] = useState([])
    const [showScrollTop, setShowScrollTop] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            const currentY = window.scrollY || document.documentElement.scrollTop;
            setShowScrollTop(currentY > 1000);
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
    const [statusFilter, setStatusFilter] = useState('all')

    useEffect(() => {
        fetch('data/plan_to_watch.json?v=' + Date.now())
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
        let totalMinutes = 0
        let airingCount = 0
        let releasedCount = 0
        let upcomingCount = 0
        const types = {}

        planList.forEach(item => {
            const eps = parseInt(item.episodes)
            if (!isNaN(eps) && eps > 0) totalEpisodes += eps

            // Use real total_time from export (in minutes), fallback to 24 min/ep
            if (item.total_time && !isNaN(item.total_time)) {
                totalMinutes += item.total_time
            } else if (!isNaN(eps) && eps > 0) {
                totalMinutes += eps * 24
            }

            if (item.notes === 'AIRING!') airingCount++
            else if (item.notes === 'Vydáno') releasedCount++
            else if (item.notes === 'Nadcházející') upcomingCount++

            const type = item.type || 'Unknown'
            types[type] = (types[type] || 0) + 1
        })

        // Convert minutes to days
        const estimatedDays = Math.round(totalMinutes / 60 / 24 * 10) / 10

        return {
            total: planList.length,
            totalEpisodes,
            estimatedDays,
            airingCount,
            releasedCount,
            upcomingCount,
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
        } else if (statusFilter === 'upcoming') {
            result = result.filter(item => item.notes === 'Nadcházející')
        }

        // Sort
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key]
                let bVal = b[sortConfig.key]

                if (aVal == null) return 1
                if (bVal == null) return -1

                // Numeric for episodes
                if (sortConfig.key === 'episodes') {
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

    // Standardizované typové štítky (stejné jako v seznamu anime) — neměnit
    const getTypeBadgeClass = (type) => {
        const t = type?.toLowerCase() || ''
        if (t.includes('movie')) return 'movie'
        if (t.includes('ova')) return 'ova'
        if (t.includes('ona')) return 'ona'
        if (t.includes('multiple')) return 'special'
        return 'tv'
    }

    // Pill statusu (design: tečka + text, barvy podle stavu)
    const StatusPill = ({ notes }) => {
        const cls = notes === 'AIRING!' ? 'airing' : notes === 'Nadcházející' ? 'upcoming' : 'released'
        const label = notes === 'AIRING!' ? 'Airing' : notes === 'Nadcházející' ? 'Nadcházející' : 'Vydáno'
        return (
            <span className={`ptw-status-pill ${cls}`}>
                <span className="ptw-status-dot" />{label}
            </span>
        )
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
                        className="ptw-source-toggle"
                        onClick={() => { setExpanded(!expanded) }}
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

    const filterDefs = [
        { id: 'all', label: 'Vše', dot: null, count: stats?.total || 0 },
        { id: 'airing', label: 'Airing', dot: 'var(--accent-red)', count: stats?.airingCount || 0 },
        { id: 'released', label: 'Vydáno', dot: 'var(--accent-emerald)', count: stats?.releasedCount || 0 },
        { id: 'upcoming', label: 'Nadcházející', dot: 'var(--accent-cyan)', count: stats?.upcomingCount || 0 },
    ]

    return (
        <div className="fade-in">
            <div className="ptw-header">
                <div className="ptw-header-text">
                    <div className="ptw-header-title-row">
                        <h2>Plan to Watch</h2>
                        <span className="ptw-count-pill">{filteredList.length}</span>
                    </div>
                    <div className="ptw-subtitle">
                        {filteredList.length.toLocaleString('cs-CZ')} z {planList.length.toLocaleString('cs-CZ')} položek
                        {sortConfig.key ? ` · řazeno podle „${SORT_LABELS[sortConfig.key] || sortConfig.key}"` : ''}
                    </div>
                </div>
            </div>

            {/* Stat karty (design: levý barevný proužek, hodnota + jednotka + poznámka) */}
            <div className="ptw-stats">
                <div className="ptw-stat-card" style={{ '--stat-color': 'var(--accent-primary)' }}>
                    <span className="ptw-stat-label">Anime k zhlédnutí</span>
                    <span className="ptw-stat-value-row">
                        <span className="ptw-stat-value">{stats?.total || 0}</span>
                    </span>
                    <span className="ptw-stat-note">Po odfiltrování placeholderů</span>
                </div>
                <div className="ptw-stat-card" style={{ '--stat-color': 'var(--accent-secondary)' }}>
                    <span className="ptw-stat-label">Celkem epizod</span>
                    <span className="ptw-stat-value-row">
                        <span className="ptw-stat-value">{(stats?.totalEpisodes || 0).toLocaleString('cs-CZ')}</span>
                        <span className="ptw-stat-unit">ep</span>
                    </span>
                    <span className="ptw-stat-note">Součet napříč listem</span>
                </div>
                <div className="ptw-stat-card" style={{ '--stat-color': 'var(--accent-cyan)' }}>
                    <span className="ptw-stat-label">Odhadovaný čas</span>
                    <span className="ptw-stat-value-row">
                        <span className="ptw-stat-value">{(stats?.estimatedDays || 0).toLocaleString('cs-CZ')}</span>
                        <span className="ptw-stat-unit">dní</span>
                    </span>
                    <span className="ptw-stat-note">Ze skutečného total_time</span>
                </div>
                <div className="ptw-stat-card" style={{ '--stat-color': 'var(--accent-emerald)' }}>
                    <span className="ptw-stat-label">Právě vysílá</span>
                    <span className="ptw-stat-value-row">
                        <span className="ptw-stat-value">{stats?.airingCount || 0}</span>
                    </span>
                    <span className="ptw-stat-note">Sledovat weekly</span>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="ptw-search-row">
                <div className="ptw-search-box">
                    <span className="ptw-search-icon" aria-hidden="true">🔍</span>
                    <input
                        type="text"
                        className="search-input ptw-search-input"
                        placeholder="Hledat anime nebo důvod..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            className="ptw-clear-btn"
                            onClick={() => setSearchTerm('')}
                            title="Vymazat hledání"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div className="ptw-filter-group">
                    {filterDefs.map(f => (
                        <button
                            key={f.id}
                            className={`ptw-filter-btn ${statusFilter === f.id ? 'active' : ''}`}
                            onClick={() => setStatusFilter(f.id)}
                        >
                            {f.dot && <span className="ptw-filter-dot" style={{ background: f.dot }} />}
                            {f.label}
                            <em>{f.count}</em>
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="ptw-table-wrap hide-mobile">
                <table className="ptw-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('name')} className={sortConfig.key === 'name' ? 'sorted' : ''}>
                                Název{getSortIndicator('name')}
                            </th>
                            <th onClick={() => handleSort('type')} className={sortConfig.key === 'type' ? 'sorted' : ''}>
                                Typ{getSortIndicator('type')}
                            </th>
                            <th onClick={() => handleSort('episodes')} className={`ptw-th-center ${sortConfig.key === 'episodes' ? 'sorted' : ''}`}>
                                Ep.{getSortIndicator('episodes')}
                            </th>

                            <th>Důvod / Zdroj</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredList.map((item, idx) => (
                            <tr key={idx}>
                                <td>
                                    <div className="ptw-name-cell">
                                        <span className="ptw-row-index">{idx + 1}</span>
                                        <span className="ptw-name">{item.name}</span>
                                    </div>
                                </td>
                                <td>
                                    <span className={`type-badge ${getTypeBadgeClass(item.type)}`}>
                                        {item.type || '-'}
                                    </span>
                                </td>
                                <td className="ptw-td-eps">
                                    {item.episodes && !isNaN(parseInt(item.episodes)) ? parseInt(item.episodes) : '-'}
                                </td>

                                <td className="ptw-td-source">
                                    <ExpandableSource text={item.source} />
                                </td>
                                <td>
                                    <StatusPill notes={item.notes} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="mobile-card-list hide-desktop">
                {filteredList.map((item, idx) => (
                    <div key={idx} className="mobile-card">
                        <div className="mobile-card-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-md)' }}>
                                <div className="mobile-card-title" style={{ flex: 1, paddingRight: '8px' }}>
                                    {item.name}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                                    <span className={`type-badge ${getTypeBadgeClass(item.type)}`} style={{ padding: '2px 8px', fontSize: '0.65rem' }}>
                                        {item.type || '-'}
                                    </span>
                                    <StatusPill notes={item.notes} />
                                </div>
                            </div>
                        </div>

                        <div className="mobile-card-grid">
                            <div className="mobile-card-row">
                                <span>Pořadí v listu:</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    #{idx + 1}
                                </span>
                            </div>
                            <div className="mobile-card-row">
                                <span>Epizody:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                                    {item.episodes && !isNaN(parseInt(item.episodes)) ? parseInt(item.episodes) : '-'}
                                </span>
                            </div>
                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Zdroj / Důvod:</span>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <ExpandableSource text={item.source} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showScrollTop && createPortal(
                <button
                    onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        const mainContent = document.querySelector('.main-content');
                        if (mainContent) {
                            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    }}
                    style={{
                        position: 'fixed',
                        bottom: '30px', /* Posunuto dolů pro lepší ergonomii na telefonu/desktopu */
                        right: '30px',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '50px',
                        height: '50px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 9999, // Extremely high z-index to be over everything
                        fontSize: '1.5rem',
                        animation: 'fadeIn 0.3s ease-out'
                    }}
                    title="Zpět nahoru"
                >
                    ↑
                </button>,
                document.body
            )}
        </div>
    )
}

export default PlanToWatch
