import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

// Czech declension: 1 epizoda, 2-4 epizody, 5+ epizod
const pluralEpizoda = (n) => {
    if (n === 1) return '1 epizoda'
    if (n >= 2 && n <= 4) return `${n} epizody`
    return `${n} epizod`
}

function HistoryLog() {
    const [historyLog, setHistoryLog] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [yearFilter, setYearFilter] = useState('all')
    const [sortBy, setSortBy] = useState('date') // 'date', 'animeCount', 'episodes', 'time'
    const [dateRange, setDateRange] = useState({ start: '', end: '' })

    useEffect(() => {
        loadData(STORAGE_KEYS.HISTORY_LOG, 'data/history_log.json')
            .then(data => {
                setHistoryLog(data)
                setLoading(false)
            })
            .catch(err => {
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

        const parseISOLocal = (s) => {
            const [y, m, d] = s.split('-');
            return new Date(y, parseInt(m, 10) - 1, d);
        }

        const minDate = parseISOLocal(sortedDates[0]);
        const maxDataDate = parseISOLocal(sortedDates[sortedDates.length - 1]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const effectiveEndDate = maxDataDate > today ? maxDataDate : today;

        // Helper to format date strictly as local YYYY-MM-DD to avoid UTC shift
        const getLocalISOString = (d) => {
            const pad = (n) => n.toString().padStart(2, '0')
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        }

        // 1. Longest streak (historical)
        let currentStreak = 0, longestStreak = 0
        let inStreak = false
        let tempStart = null, maxStart = null, maxEnd = null

        for (let d = new Date(minDate); d <= effectiveEndDate; d.setDate(d.getDate() + 1)) {
            const dStr = getLocalISOString(d)
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

        // Handle case where the longest streak is still ongoing at the end of the data
        if (inStreak && currentStreak > longestStreak) {
            longestStreak = currentStreak
            maxStart = new Date(tempStart)
            maxEnd = new Date(effectiveEndDate)
        }

        // 2. Current streak (from today/yesterday backwards)
        let actStreak = 0, actStart = null, actEnd = null
        const effStr = getLocalISOString(effectiveEndDate)
        const prevDate = new Date(effectiveEndDate)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevStr = getLocalISOString(prevDate)

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
                const dStr = getLocalISOString(d)
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

    const filteredHistory = useMemo(() => {
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

        // Date Range filter
        if (dateRange.start || dateRange.end) {
            const startStr = dateRange.start ? new Date(dateRange.start) : null;
            const endStr = dateRange.end ? new Date(dateRange.end) : null;

            // normalize end date to end of day
            if (endStr) {
                endStr.setHours(23, 59, 59, 999);
            }

            result = result.filter(h => {
                if (!h.date) return false;
                const d = new Date(h.date);
                if (startStr && d < startStr) return false;
                if (endStr && d > endStr) return false;
                return true;
            })
        }
        return result
    }, [historyLog, searchTerm, yearFilter, dateRange])

    const chartData = useMemo(() => {
        if (!filteredHistory.length) return null

        const dailyEps = {}
        let minDate = null
        let maxDate = null

        filteredHistory.forEach(item => {
            if (!item.date) return
            const dStr = item.date.split('T')[0]
            const epMatch = item.episodes?.match(/\d+/)
            const eps = epMatch ? parseInt(epMatch[0]) : 0

            dailyEps[dStr] = (dailyEps[dStr] || 0) + eps
            if (!minDate || dStr < minDate) minDate = dStr
            if (!maxDate || dStr > maxDate) maxDate = dStr
        })

        if (!minDate) return null

        const labels = []
        const data = []

        const start = new Date(minDate)
        const end = new Date(maxDate)

        const diffDays = (end - start) / (1000 * 60 * 60 * 24)
        if (diffDays > 90) {
            const monthlyEps = {}
            filteredHistory.forEach(item => {
                if (!item.date) return
                const monthStr = item.date.substring(0, 7)
                const epMatch = item.episodes?.match(/\d+/)
                const eps = epMatch ? parseInt(epMatch[0]) : 0
                monthlyEps[monthStr] = (monthlyEps[monthStr] || 0) + eps
            })
            const sortedMonths = Object.keys(monthlyEps).sort()
            sortedMonths.forEach(m => {
                const [y, mo] = m.split('-')
                labels.push(`${mo}/${y.slice(-2)}`)
                data.push(monthlyEps[m])
            })
        } else {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const pad = (n) => n.toString().padStart(2, '0')
                const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                labels.push(`${d.getDate()}.${d.getMonth() + 1}.`)
                data.push(dailyEps[dStr] || 0)
            }
        }

        return {
            labels,
            datasets: [
                {
                    label: 'Zhlédnuté epizody',
                    data,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderRadius: 4,
                }
            ]
        }
    }, [filteredHistory])

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: false,
            },
            tooltip: {
                backgroundColor: 'rgba(18, 18, 26, 0.9)',
                titleColor: '#f1f5f9',
                bodyColor: '#f1f5f9',
                borderColor: '#3a3a4a',
                borderWidth: 1,
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#64748b', precision: 0 }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#64748b', maxRotation: 45, minRotation: 0 }
            }
        }
    }

    // Group by date and filter
    const groupedHistory = useMemo(() => {
        let result = filteredHistory

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

        // Convert to array and sort
        const arr = Object.values(groups)

        arr.sort((a, b) => {
            if (sortBy === 'episodes') {
                if (b.totalEpisodes !== a.totalEpisodes) return b.totalEpisodes - a.totalEpisodes;
            }
            if (sortBy === 'time') {
                if (b.totalTime !== a.totalTime) return b.totalTime - a.totalTime;
            }
            if (sortBy === 'animeCount') {
                if (b.entries.length !== a.entries.length) return b.entries.length - a.entries.length;
            }

            // default or tiebreaker: date desc
            const dateA = new Date(a.date || 0).getTime()
            const dateB = new Date(b.date || 0).getTime()
            return dateB - dateA
        })

        return arr;
    }, [filteredHistory, sortBy])

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
            {/* Header and Streaks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                    History Log
                    <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>
                        ({pluralEpizoda(totalStats.episodes)}, {formatTime(totalStats.time)})
                    </span>
                </h2>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', alignItems: 'stretch' }}>
                    <div className="history-streaks-container" style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: '0',
                        background: 'var(--color-bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        overflow: 'hidden',
                        alignSelf: 'flex-start', // Prevent stretching full width
                        flexWrap: 'nowrap', // Ensure they stay side-by-side on mobile
                        maxWidth: '100%', // Prevent overflow
                        overflowX: 'auto' // Allow scrolling if extremely small
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
                            minWidth: '130px',
                            flex: 1 // Allow flexible width
                        }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', textAlign: 'center' }}>
                                🔥 Aktuální Streak
                            </span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{
                                    fontSize: '1.8rem', fontWeight: '800', // Slightly smaller for mobile safety
                                    color: watchStreak.current >= watchStreak.longest ? 'var(--accent-emerald)' : 'var(--accent-amber)'
                                }}>
                                    {watchStreak.current}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {watchStreak.current === 1 ? 'den' : watchStreak.current >= 2 && watchStreak.current <= 4 ? 'dny' : 'dní'}
                                </span>
                            </div>
                            {watchStreak.currentStart && (
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center' }}>
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
                        <div style={{ width: '1px', background: 'var(--border-color)', flexShrink: 0 }} />
                        {/* Longest Streak */}
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            padding: 'var(--spacing-sm) var(--spacing-lg)',
                            minWidth: '130px',
                            flex: 1 // Allow flexible width
                        }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', textAlign: 'center' }}>
                                🏆 Nejdelší Streak
                            </span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    {watchStreak.longest}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {watchStreak.longest === 1 ? 'den' : watchStreak.longest >= 2 && watchStreak.longest <= 4 ? 'dny' : 'dní'}
                                </span>
                            </div>
                            {watchStreak.longestStart && (
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '2px', textAlign: 'center' }}>
                                    {watchStreak.longestStart.toLocaleDateString('cs-CZ')} – {watchStreak.longestEnd.toLocaleDateString('cs-CZ')}
                                </span>
                            )}
                        </div>
                    </div>

                    {chartData && (
                        <div style={{
                            flex: '1 1 300px',
                            minWidth: '300px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--spacing-md)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '160px'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
                                GRAF ZHLÉDNUTÝCH EPIZOD {dateRange.start || dateRange.end || yearFilter !== 'all' ? '(FILTROVÁNO)' : ''}
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Bar options={chartOptions} data={chartData} />
                            </div>
                        </div>
                    )}
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
                <div className="filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="select"
                        style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    >
                        <option value="date">Řadit dle: Data</option>
                        <option value="animeCount">Řadit dle: Počtu Anime</option>
                        <option value="episodes">Řadit dle: Epizod</option>
                        <option value="time">Řadit dle: Času</option>
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="select"
                            style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                            title="Od data"
                        />
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="select"
                            style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                            title="Do data"
                        />
                    </div>

                    {(dateRange.start || dateRange.end) && (
                        <button
                            onClick={() => setDateRange({ start: '', end: '' })}
                            className="filter-btn"
                            style={{ padding: '0.4rem 0.8rem' }}
                        >
                            Vymazat datum
                        </button>
                    )}

                    {years.map(y => (
                        <button
                            key={y}
                            className={`filter-btn ${yearFilter === y ? 'active' : ''}`}
                            onClick={() => setYearFilter(y)}
                        >
                            {y === 'all' ? 'Všechny roky' : y}
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
                                        flexDirection: 'column', // Stack vertically on all screens to ensure space
                                        justifyContent: 'center',
                                        alignItems: 'flex-start',
                                        gap: '6px',
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: 'var(--radius-sm)',
                                        borderLeft: '3px solid var(--accent-secondary)'
                                    }}
                                >
                                    <div style={{ fontWeight: '500', width: '100%', wordBreak: 'break-word', lineHeight: '1.4' }}>
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
                                        fontSize: '0.85rem',
                                        color: 'var(--text-secondary)',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            background: 'rgba(99, 102, 241, 0.2)',
                                            borderRadius: '4px',
                                            color: 'var(--accent-primary)',
                                            fontWeight: '600'
                                        }}>
                                            {entry.episodes}
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            ⏱️ {entry.time}
                                        </span>
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
