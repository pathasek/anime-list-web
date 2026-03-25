import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'

// Heatmap configuration inspired by VBA
const HEATMAP_COLOR_LEVEL_1 = 2
const HEATMAP_COLOR_LEVEL_2 = 6
const HEATMAP_COLOR_LEVEL_3 = 13
const HEATMAP_COLOR_LEVEL_4 = 19
// Colors adjusted slightly to fit the dark theme natively better, but based on the VBA green scale
const getHeatmapColor = (eps) => {
    if (eps === 0) return 'var(--color-bg-elevated)'; // Empty cell color
    if (eps <= HEATMAP_COLOR_LEVEL_1) return '#0e4429';
    if (eps <= HEATMAP_COLOR_LEVEL_2) return '#006d32';
    if (eps <= HEATMAP_COLOR_LEVEL_3) return '#26a641';
    if (eps <= HEATMAP_COLOR_LEVEL_4) return '#39d353';
    return '#52ff73'; // > Level 4
}

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

    // UI enhancements
    const [highlightedDate, setHighlightedDate] = useState(null)
    const [showScrollTop, setShowScrollTop] = useState(false)

    useEffect(() => {
        const handleScroll = (e) => {
            // Určení aktuální pozice z jakéhokoliv možného scrollujícího elementu
            const target = e.target;
            let currentY = window.scrollY;
            
            if (target && target.scrollTop !== undefined) {
                currentY = target.scrollTop;
            } else if (document.documentElement && document.documentElement.scrollTop) {
                currentY = document.documentElement.scrollTop;
            }

            if (currentY > 1000) {
                setShowScrollTop(true)
            } else {
                setShowScrollTop(false)
            }
        }

        // UseCapture = true zajistí, že chytíme scroll z jakéhokoliv elementu
        window.addEventListener('scroll', handleScroll, true)
        return () => {
            window.removeEventListener('scroll', handleScroll, true)
        }
    }, [])

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
            // Použijeme lokální datum místo UTC parsování, pokud nezadáme čas
            const startStr = dateRange.start ? new Date(dateRange.start + 'T00:00:00') : null;
            const endStr = dateRange.end ? new Date(dateRange.end + 'T23:59:59.999') : null;

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
        const rawKeys = [] // Stores original date/month key for filtering later

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
                rawKeys.push(m) // YYYY-MM
            })
        } else {
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const pad = (n) => n.toString().padStart(2, '0')
                const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
                labels.push(`${d.getDate()}.${d.getMonth() + 1}.`)
                data.push(dailyEps[dStr] || 0)
                rawKeys.push(dStr) // YYYY-MM-DD
            }
        }

        return {
            labels,
            rawKeys,
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

    // Generate heatmap data (last 52 weeks = 364 days)
    const heatmapData = useMemo(() => {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 364);

        // Adjust to nearest previous Monday
        const dayOfWeek = startDate.getDay(); // 0 is Sun, 1 is Mon...
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - diff);

        // Calculate daily totals from full log
        const dailyTotals = {};
        historyLog.forEach(h => {
            if (!h.date) return;
            const dStr = h.date.split('T')[0];
            const epMatch = h.episodes?.match(/\d+/);
            const eps = epMatch ? parseInt(epMatch[0]) : 0;
            dailyTotals[dStr] = (dailyTotals[dStr] || 0) + eps;
        });

        // Generate grid
        const columns = [];
        let currDate = new Date(startDate);

        while (currDate <= endDate) {
            const col = [];
            for (let d = 0; d < 7; d++) {
                if (currDate > endDate) break;

                const pad = (n) => n.toString().padStart(2, '0')
                const dStr = `${currDate.getFullYear()}-${pad(currDate.getMonth() + 1)}-${pad(currDate.getDate())}`

                col.push({
                    date: new Date(currDate),
                    dateStr: dStr,
                    eps: dailyTotals[dStr] || 0
                });
                currDate.setDate(currDate.getDate() + 1);
            }
            if (col.length > 0) {
                columns.push(col);
            }
        }
        return columns;
    }, [historyLog]);

    const chartRef = useRef(null)

    const handleChartClick = (event) => {
        if (!chartRef.current || !chartData) return
        
        const elements = chartRef.current.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true)
        if (elements.length > 0) {
            const index = elements[0].index
            const rawKey = chartData.rawKeys[index]
            
            if (rawKey.length === 7) {
                // It's a month (YYYY-MM)
                const [y, m] = rawKey.split('-')
                // Start of month
                const start = `${y}-${m}-01`
                // End of month
                const endStr = new Date(y, parseInt(m, 10), 0)
                const pad = (n) => n.toString().padStart(2, '0')
                const end = `${endStr.getFullYear()}-${pad(endStr.getMonth() + 1)}-${pad(endStr.getDate())}`
                
                setDateRange({ start, end })
            } else {
                // It's a day (YYYY-MM-DD)
                setDateRange({ start: rawKey, end: rawKey })
            }
        }
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        onClick: handleChartClick,
        onHover: (event, chartElement) => {
            event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
        },
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

    const scrollToDate = (dateStr) => {
        const group = groupedHistory.find(g => g.date && g.date.startsWith(dateStr));
        if (group) {
            const el = document.getElementById(`date-${group.date}`);
            if (el) {
                // Instant teleport - clear header offset
                const mainContent = document.querySelector('.main-content');
                if (mainContent && mainContent.scrollHeight > mainContent.clientHeight) {
                    // Pokud scrolluje .main-content
                    const y = el.offsetTop - 80;
                    mainContent.scrollTo({ top: y, behavior: 'instant' });
                } else {
                    // Pokud scrolluje okno/html
                    const y = el.getBoundingClientRect().top + window.scrollY - 80;
                    window.scrollTo({ top: y, behavior: 'instant' });
                }

                setHighlightedDate(group.date);
                setTimeout(() => {
                    setHighlightedDate(null);
                }, 3000);
            }
        }
    }

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in">
            {/* Header and Streaks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-lg)' }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)', lineHeight: '1' }}>
                        History Log
                        <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 'normal', opacity: 0.8 }}>
                            ({pluralEpizoda(totalStats.episodes)}, {formatTime(totalStats.time)})
                        </span>
                    </h2>

                    <div className="history-streaks-container" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        background: 'var(--color-bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        padding: 'var(--spacing-sm) var(--spacing-lg)'
                    }}>
                        {/* Current Streak */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span title="Aktuální Streak" style={{ fontSize: '1.2rem' }}>🔥</span>
                            <span style={{
                                fontWeight: '800',
                                color: watchStreak.current >= watchStreak.longest ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                                fontSize: '1.1rem'
                            }}>
                                {watchStreak.current}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {watchStreak.current === 1 ? 'den' : watchStreak.current >= 2 && watchStreak.current <= 4 ? 'dny' : 'dní'}
                            </span>
                            {watchStreak.currentStart && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    ({watchStreak.currentStart.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })} - {watchStreak.currentEnd.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })})
                                </span>
                            )}
                        </div>

                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

                        {/* Longest Streak */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span title="Nejdelší Streak" style={{ fontSize: '1.2rem' }}>🏆</span>
                            <span style={{
                                fontWeight: '800',
                                color: 'var(--text-primary)',
                                fontSize: '1.1rem'
                            }}>
                                {watchStreak.longest}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                {watchStreak.longest === 1 ? 'den' : watchStreak.longest >= 2 && watchStreak.longest <= 4 ? 'dny' : 'dní'}
                            </span>
                            {watchStreak.longestStart && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    ({watchStreak.longestStart.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })} - {watchStreak.longestEnd.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })})
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)', alignItems: 'stretch' }}>
                    {chartData ? (
                        <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--spacing-md)',
                            border: '1px solid var(--border-color)',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: '220px'
                        }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
                                GRAF ZHLÉDNUTÝCH EPIZOD {dateRange.start || dateRange.end || yearFilter !== 'all' ? '(FILTROVÁNO)' : ''}
                            </div>
                            <div style={{ flex: 1, position: 'relative', minHeight: '180px' }}>
                                <Bar ref={chartRef} options={chartOptions} data={chartData} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>GRAF ZHLÉDNUTÝCH EPIZOD</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '180px', color: 'var(--text-muted)' }}>Méně dat pro zobrazení</div>
                        </div>
                    )}

                    {/* Heatmap Section */}
                    <div style={{
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--spacing-md)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: '220px',
                        overflow: 'hidden' // Prevent full container scroll if possible
                    }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '500' }}>
                            HEATMAPA AKTIVITY ZA POSLEDNÍ ROK
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowX: 'auto', paddingBottom: '4px', paddingTop: '8px' }}>
                            {/* Months Header */}
                            <div style={{ display: 'flex', paddingLeft: '24px', marginBottom: '4px', gap: '3px', height: '16px' }}>
                                {heatmapData.map((col, cIdx) => {
                                    const currentMonth = col[0].date.getMonth();
                                    const prevMonth = cIdx > 0 ? heatmapData[cIdx - 1][0].date.getMonth() : -1;
                                    // Only show month name if it's the first column of that month
                                    const showMonth = cIdx === 0 || currentMonth !== prevMonth;

                                    return (
                                        <div key={`m-${cIdx}`} style={{ width: '10px', height: '16px', flexShrink: 0, position: 'relative' }}>
                                            {showMonth && (
                                                <span style={{ position: 'absolute', bottom: 0, left: 0, fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', zIndex: 1 }}>
                                                    {col[0].date.toLocaleDateString('cs-CZ', { month: 'short' })}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex' }}>
                                {/* Days Sidebar */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginRight: '8px', marginTop: '2px' }}>
                                    {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day, idx) => (
                                        <div key={day} style={{ height: '10px', fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', width: '16px', lineHeight: 1 }}>
                                            {[0, 2, 4].includes(idx) ? day : ''}
                                        </div>
                                    ))}
                                </div>

                                {/* Heatmap Grid */}
                                <div style={{ display: 'flex', gap: '3px' }}>
                                    {heatmapData.map((col, cIdx) => (
                                        <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                                            {col.map((cell, rIdx) => (
                                                <div
                                                    key={rIdx}
                                                    title={`${cell.date.toLocaleDateString('cs-CZ')}: ${cell.eps} epizod`}
                                                    style={{
                                                        width: '10px',
                                                        height: '10px',
                                                        backgroundColor: getHeatmapColor(cell.eps),
                                                        borderRadius: '2px',
                                                        transition: 'opacity 0.2s, transform 0.1s',
                                                        cursor: cell.eps > 0 ? 'pointer' : 'default'
                                                    }}
                                                    onClick={() => cell.eps > 0 && scrollToDate(cell.dateStr)}
                                                    onMouseEnter={e => {
                                                        e.target.style.opacity = '0.7';
                                                        if (cell.eps > 0) e.target.style.transform = 'scale(1.2)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.target.style.opacity = '1';
                                                        e.target.style.transform = 'scale(1)';
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Detailed Legend matching VBA */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', alignSelf: 'flex-start', marginTop: '12px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(0) }} />
                                0 epizod
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(HEATMAP_COLOR_LEVEL_1) }} />
                                1 až {HEATMAP_COLOR_LEVEL_1} epizody
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(HEATMAP_COLOR_LEVEL_2) }} />
                                {HEATMAP_COLOR_LEVEL_1 + 1} až {HEATMAP_COLOR_LEVEL_2} epizod
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(HEATMAP_COLOR_LEVEL_3) }} />
                                {HEATMAP_COLOR_LEVEL_2 + 1} až {HEATMAP_COLOR_LEVEL_3} epizod
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(HEATMAP_COLOR_LEVEL_4) }} />
                                {HEATMAP_COLOR_LEVEL_3 + 1} až {HEATMAP_COLOR_LEVEL_4} epizod
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: getHeatmapColor(HEATMAP_COLOR_LEVEL_4 + 1) }} />
                                Více než {HEATMAP_COLOR_LEVEL_4}
                            </div>
                        </div>
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
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {!dateRange.start && (
                                <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>Od...</span>
                            )}
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="select"
                                style={{ padding: '0.4rem 0.8rem', paddingLeft: dateRange.start ? '0.8rem' : '2.5rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: dateRange.start ? 'var(--text-primary)' : 'transparent', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                                title="Od data"
                            />
                        </div>
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {!dateRange.end && (
                                <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '0.85rem', pointerEvents: 'none' }}>Do...</span>
                            )}
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="select"
                                style={{ padding: '0.4rem 0.8rem', paddingLeft: dateRange.end ? '0.8rem' : '2.5rem', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: dateRange.end ? 'var(--text-primary)' : 'transparent', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                                title="Do data"
                            />
                        </div>
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
                    <div
                        key={idx}
                        className={`card ${highlightedDate === group.date ? 'highlight-pulse' : ''}`}
                        id={`date-${group.date}`}
                    >
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
                                        {entry.rewatch && (
                                            <span style={{
                                                marginLeft: '8px',
                                                fontSize: '0.85rem',
                                                fontStyle: 'italic',
                                                color: 'rgba(255, 255, 255, 0.5)',
                                                fontWeight: 'normal'
                                            }}>
                                                ({entry.rewatch}. Rewatch)
                                            </span>
                                        )}
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

export default HistoryLog
