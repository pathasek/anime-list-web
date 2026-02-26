import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'

// Czech declension: 1 epizoda, 2-4 epizody, 5+ epizod
const pluralEpizoda = (n) => {
    if (n === 1) return '1 epizoda'
    if (n >= 2 && n <= 4) return `${n} epizody`
    return `${n} epizod`
}

function HistoryLog() {
    const [historyLog, setHistoryLog] = useState([])
    const [animeList, setAnimeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [yearFilter, setYearFilter] = useState('all')

    useEffect(() => {
        Promise.all([
            loadData(STORAGE_KEYS.HISTORY_LOG, 'data/history_log.json'),
            loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
        ]).then(([history, anime]) => {
            setHistoryLog(history)
            setAnimeList(anime)
            setLoading(false)
        }).catch(err => {
            console.error('Failed to load data:', err)
            setLoading(false)
        })
    }, [])



    // Get unique years for filter
    const years = useMemo(() => {
        const y = new Set()
        historyLog.forEach(h => {
            if (h.date) {
                const year = new Date(h.date).getFullYear()
                if (!isNaN(year)) y.add(year)
            }
        })
        return ['all', ...Array.from(y).sort((a, b) => b - a)]
    }, [historyLog])

    const watchStreak = useMemo(() => {
        if (!historyLog.length) return { current: 0, longest: 0, currentStart: null, currentEnd: null, longestStart: null, longestEnd: null }

        const dailyMinutes = {}
        historyLog.forEach(h => {
            if (!h.date) return
            const dateStr = h.date.split('T')[0]
            let mins = 0
            if (h.time && h.time.includes('min')) {
                mins = parseInt(h.time.split(' ')[0], 10)
            }
            if (!isNaN(mins) && mins > 0) {
                dailyMinutes[dateStr] = (dailyMinutes[dateStr] || 0) + mins
            }
        })

        const sortedDates = Object.keys(dailyMinutes).sort()
        if (sortedDates.length === 0) return { current: 0, longest: 0, currentStart: null, currentEnd: null, longestStart: null, longestEnd: null }

        const minDate = new Date(sortedDates[0])
        const maxDataDate = new Date(sortedDates[sortedDates.length - 1])
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const effectiveEndDate = maxDataDate > today ? maxDataDate : today

        // 1. Longest streak (historical)
        let currentStreak = 0, longestStreak = 0
        let inStreak = false
        let tempStart = null, maxStart = null, maxEnd = null

        for (let d = new Date(minDate); d <= effectiveEndDate; d.setDate(d.getDate() + 1)) {
            const dStr = d.toISOString().split('T')[0]
            const mins = dailyMinutes[dStr] || 0

            if (mins >= 20) {
                if (!inStreak) {
                    inStreak = true
                    tempStart = new Date(d)
                    currentStreak = 1
                } else {
                    currentStreak++
                }
                if (currentStreak > longestStreak) {
                    longestStreak = currentStreak
                    maxStart = new Date(tempStart)
                    maxEnd = new Date(d)
                }
            } else {
                inStreak = false
                currentStreak = 0
            }
        }

        // 2. Current streak (from today/yesterday backwards)
        let actStreak = 0, actStart = null, actEnd = null
        const effStr = effectiveEndDate.toISOString().split('T')[0]
        const prevDate = new Date(effectiveEndDate)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevStr = prevDate.toISOString().split('T')[0]

        let lastDate = null
        if ((dailyMinutes[effStr] || 0) >= 20) {
            lastDate = new Date(effectiveEndDate)
        } else if ((dailyMinutes[prevStr] || 0) >= 20) {
            lastDate = new Date(prevDate)
        }

        if (lastDate) {
            actEnd = new Date(lastDate)
            let d = new Date(lastDate)
            while (d >= minDate) {
                const dStr = d.toISOString().split('T')[0]
                if ((dailyMinutes[dStr] || 0) >= 20) {
                    actStreak++
                    actStart = new Date(d)
                    d.setDate(d.getDate() - 1)
                } else {
                    break
                }
            }
        }

        return {
            current: actStreak,
            longest: longestStreak,
            currentStart: actStart,
            currentEnd: actEnd,
            longestStart: maxStart,
            longestEnd: maxEnd
        }
    }, [historyLog])

    // Group by date and filter
    const groupedHistory = useMemo(() => {
        let result = [...historyLog]

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(h => h.name?.toLowerCase().includes(term))
        }

        // Year filter
        if (yearFilter !== 'all') {
            result = result.filter(h => {
                if (!h.date) return false
                return new Date(h.date).getFullYear() === parseInt(yearFilter)
            })
        }

        // Group by date
        const groups = {}
        let currentDate = null

        result.forEach(item => {
            const dateKey = item.date || currentDate
            if (item.date) currentDate = item.date

            if (!groups[dateKey]) {
                groups[dateKey] = {
                    date: dateKey,
                    entries: [],
                    totalEpisodes: 0,
                    totalTime: 0
                }
            }

            groups[dateKey].entries.push(item)

            // Parse episodes count
            const epMatch = item.episodes?.match(/\d+/)
            if (epMatch) {
                groups[dateKey].totalEpisodes += parseInt(epMatch[0])
            }

            // Parse time
            const timeMatch = item.time?.match(/(\d+)\s*min/)
            if (timeMatch) {
                groups[dateKey].totalTime += parseInt(timeMatch[1])
            }
        })

        // Convert to array and sort by date descending
        return Object.values(groups).sort((a, b) => {
            const dateA = new Date(a.date || 0).getTime()
            const dateB = new Date(b.date || 0).getTime()
            return dateB - dateA
        })
    }, [historyLog, searchTerm, yearFilter])

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Neznámé datum'
        const d = new Date(dateStr)
        return d.toLocaleDateString('cs-CZ', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const formatTime = (minutes) => {
        if (!minutes) return '0 min'
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        if (hours > 0) {
            return `${hours}h ${mins}min`
        }
        return `${mins} min`
    }

    // Calculate total stats
    const totalStats = useMemo(() => {
        let episodes = 0
        let time = 0

        groupedHistory.forEach(group => {
            episodes += group.totalEpisodes
            time += group.totalTime
        })

        return { episodes, time }
    }, [groupedHistory])

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ margin: 0 }}>
                    History Log
                    <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                        ({pluralEpizoda(totalStats.episodes)}, {formatTime(totalStats.time)})
                    </span>
                </h2>

                <div style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: '0',
                    background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    overflow: 'hidden'
                }}>
                    {/* Current Streak */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: 'var(--spacing-sm) var(--spacing-lg)',
                        background: watchStreak.current > 0
                            ? (watchStreak.current >= watchStreak.longest
                                ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))'
                                : 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))')
                            : 'transparent',
                        position: 'relative',
                        minWidth: '140px'
                    }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                            🔥 Aktuální Streak
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{
                                fontSize: '2rem', fontWeight: '800',
                                color: watchStreak.current >= watchStreak.longest ? 'var(--accent-emerald)' : 'var(--accent-amber)'
                            }}>
                                {watchStreak.current}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {watchStreak.current === 1 ? 'den' : watchStreak.current >= 2 && watchStreak.current <= 4 ? 'dny' : 'dní'}
                            </span>
                        </div>
                        {watchStreak.currentStart && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {watchStreak.currentStart.toLocaleDateString('cs-CZ')} – {watchStreak.currentEnd.toLocaleDateString('cs-CZ')}
                            </span>
                        )}
                        {/* Progress bar: current vs longest */}
                        {watchStreak.longest > 0 && (
                            <div style={{
                                width: '100%', height: '3px', background: 'rgba(255,255,255,0.1)',
                                borderRadius: '2px', marginTop: '6px', overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${Math.min(100, (watchStreak.current / watchStreak.longest) * 100)}%`,
                                    height: '100%',
                                    background: watchStreak.current >= watchStreak.longest
                                        ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                                    borderRadius: '2px',
                                    transition: 'width 0.5s ease'
                                }} />
                            </div>
                        )}
                    </div>
                    <div style={{ width: '1px', background: 'var(--border-color)' }} />
                    {/* Longest Streak */}
                    <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: 'var(--spacing-sm) var(--spacing-lg)',
                        minWidth: '140px'
                    }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                            🏆 Nejdelší Streak
                        </span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                {watchStreak.longest}
                            </span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                {watchStreak.longest === 1 ? 'den' : watchStreak.longest >= 2 && watchStreak.longest <= 4 ? 'dny' : 'dní'}
                            </span>
                        </div>
                        {watchStreak.longestStart && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {watchStreak.longestStart.toLocaleDateString('cs-CZ')} – {watchStreak.longestEnd.toLocaleDateString('cs-CZ')}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Hledat anime..."
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
                    {years.map(y => (
                        <button
                            key={y}
                            className={`filter-btn ${yearFilter === y ? 'active' : ''}`}
                            onClick={() => setYearFilter(y)}
                        >
                            {y === 'all' ? 'Vše' : y}
                        </button>
                    ))}
                </div>
            </div>

            {/* History Groups */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                {groupedHistory.map((group, idx) => (
                    <div key={idx} className="card">
                        <div className="card-header">
                            <div className="card-title">
                                <span style={{
                                    display: 'inline-block',
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: 'var(--accent-primary)',
                                    marginRight: '8px'
                                }}></span>
                                {formatDate(group.date)}
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--accent-cyan)' }}>
                                    {pluralEpizoda(group.totalEpisodes)}
                                </span>
                                <span style={{ color: 'var(--accent-amber)' }}>
                                    {formatTime(group.totalTime)}
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {group.entries.map((entry, entryIdx) => (
                                <div
                                    key={entryIdx}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-sm)',
                                        borderLeft: '3px solid var(--accent-secondary)'
                                    }}
                                >
                                    <div style={{ fontWeight: '500' }}>
                                        <Link
                                            to={`/anime/${encodeURIComponent(entry.name)}`}
                                            style={{ color: 'inherit', textDecoration: 'none' }}
                                            onMouseEnter={e => e.target.style.color = 'var(--accent-primary)'}
                                            onMouseLeave={e => e.target.style.color = 'inherit'}
                                        >
                                            {entry.name}
                                        </Link>
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        gap: 'var(--spacing-lg)',
                                        fontSize: '0.875rem',
                                        color: 'var(--text-secondary)'
                                    }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            background: 'rgba(99, 102, 241, 0.2)',
                                            borderRadius: '4px',
                                            color: 'var(--accent-primary)'
                                        }}>
                                            {entry.episodes}
                                        </span>
                                        <span>{entry.time}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {groupedHistory.length === 0 && (
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--spacing-2xl)',
                        color: 'var(--text-muted)'
                    }}>
                        Žádné záznamy k zobrazení
                    </div>
                )}
            </div>
        </div>
    )
}

export default HistoryLog
