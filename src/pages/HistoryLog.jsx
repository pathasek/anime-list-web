import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'
import { useModalScrollLock } from '../utils/useModalScrollLock'
import { useTheme } from '../components/ThemeProvider'
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

const pluralDen = (n) => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní')

// ============================================================
// Plán 6 Ú5: Modal s historií streaků
// ============================================================
const fmtDateShort = (d) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: '2-digit' })

// Barva streaku podle délky (kratší = tlumená, delší = výraznější)
const streakColor = (days) => {
    if (days >= 14) return '#fbbf24'                 // zlatá — výjimečné
    if (days >= 7) return 'var(--accent-emerald)'    // týden a víc
    if (days >= 3) return 'var(--accent-amber)'
    return '#64748b'                                  // 1–2 dny
}

function StreakHistoryModal({ streaks, onClose }) {
    useModalScrollLock(true)

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    const stats = useMemo(() => {
        if (!streaks.length) return null
        const totalDays = streaks.reduce((s, x) => s + x.days, 0)
        const longest = streaks.reduce((a, b) => (b.days > a.days ? b : a))
        const totalMinutes = streaks.reduce((s, x) => s + x.totalMinutes, 0)
        return {
            count: streaks.length,
            totalDays,
            avgDays: totalDays / streaks.length,
            longestDays: longest.days,
            totalHours: totalMinutes / 60,
        }
    }, [streaks])

    // Timeline: řádek per rok, streaky jako pruhy na časové ose roku
    const yearRows = useMemo(() => {
        const rows = {}
        streaks.forEach((s, idx) => {
            for (let y = s.start.getFullYear(); y <= s.end.getFullYear(); y++) {
                const yearStart = new Date(y, 0, 1)
                const yearEnd = new Date(y, 11, 31)
                const daysInYear = Math.round((new Date(y + 1, 0, 1) - yearStart) / 86400000)
                const segStart = s.start > yearStart ? s.start : yearStart
                const segEnd = s.end < yearEnd ? s.end : yearEnd
                const startDay = Math.round((segStart - yearStart) / 86400000)
                const segDays = Math.round((segEnd - segStart) / 86400000) + 1
                if (!rows[y]) rows[y] = []
                rows[y].push({
                    streakIdx: idx,
                    left: (startDay / daysInYear) * 100,
                    width: Math.max((segDays / daysInYear) * 100, 0.45),
                    streak: s,
                })
            }
        })
        return Object.entries(rows)
            .map(([year, bars]) => ({ year: parseInt(year, 10), bars }))
            .sort((a, b) => b.year - a.year)
    }, [streaks])

    const topStreaks = useMemo(() =>
        [...streaks].sort((a, b) => b.days - a.days || b.end - a.end).slice(0, 10),
        [streaks])

    const maxDays = stats ? stats.longestDays : 1

    const statCard = (icon, value, label, color) => (
        <div style={{
            flex: '1 1 110px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)', padding: '10px 12px', textAlign: 'center'
        }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: color || 'var(--text-primary)' }}>{icon} {value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        </div>
    )

    const fmtHours = (h) => `${h.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} h`

    return createPortal(
        <div
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
            style={{
                position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.72)',
                backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '16px', animation: 'fadeIn 0.18s ease'
            }}
        >
            <div className="streak-history-modal" style={{
                width: 'min(780px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-lg)', boxShadow: '0 24px 70px rgba(0,0,0,0.6)',
                padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)'
            }}>
                {/* Hlavička */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔥 Historie streaků
                        {stats && <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>({stats.count} streaků)</span>}
                    </h3>
                    <button className="media-icon-btn" title="Zavřít (Esc)" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {!stats ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Zatím žádné streaky.</div>
                ) : (
                    <>
                        {/* Souhrn */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {statCard('📈', stats.count, 'Streaků celkem')}
                            {statCard('🏆', `${stats.longestDays} ${pluralDen(stats.longestDays)}`, 'Nejdelší', '#fbbf24')}
                            {statCard('⌀', `${stats.avgDays.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dne`, 'Průměrná délka')}
                            {statCard('📅', stats.totalDays, 'Streak dní celkem', 'var(--accent-emerald)')}
                            {statCard('⏱️', fmtHours(stats.totalHours), 'Hodin ve streacích', 'var(--accent-amber)')}
                        </div>

                        {/* Timeline po letech */}
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                                ČASOVÁ OSA STREAKŮ
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {yearRows.map(({ year, bars }) => (
                                    <div key={year} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ width: '38px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textAlign: 'right', flexShrink: 0 }}>{year}</span>
                                        <div style={{
                                            position: 'relative', flex: 1, height: '20px',
                                            background: 'var(--bg-tertiary)', borderRadius: '5px', overflow: 'hidden'
                                        }}>
                                            {/* měsíční dělítka */}
                                            {Array.from({ length: 11 }, (_, i) => (
                                                <span key={i} style={{
                                                    position: 'absolute', left: `${((i + 1) / 12) * 100}%`, top: 0, bottom: 0,
                                                    width: '1px', background: 'rgba(255,255,255,0.06)'
                                                }} />
                                            ))}
                                            {bars.map((b, i) => (
                                                <span
                                                    key={i}
                                                    title={`${fmtDateShort(b.streak.start)} – ${fmtDateShort(b.streak.end)} · ${b.streak.days} ${pluralDen(b.streak.days)} · ${Math.round(b.streak.totalMinutes / 60)} h · ${pluralEpizoda(b.streak.totalEpisodes)}${b.streak.ongoing ? ' · 🔥 probíhá' : ''}`}
                                                    style={{
                                                        position: 'absolute', left: `${b.left}%`, width: `${b.width}%`,
                                                        top: '3px', bottom: '3px', borderRadius: '3px',
                                                        background: streakColor(b.streak.days),
                                                        opacity: 0.45 + 0.55 * Math.min(b.streak.days / maxDays, 1),
                                                        cursor: 'help',
                                                        boxShadow: b.streak.days === maxDays ? '0 0 6px rgba(251,191,36,0.7)' : 'none'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '0.68rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: '#64748b', marginRight: '4px', verticalAlign: '-1px' }} />1–2 dny</span>
                                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent-amber)', marginRight: '4px', verticalAlign: '-1px' }} />3–6 dní</span>
                                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: 'var(--accent-emerald)', marginRight: '4px', verticalAlign: '-1px' }} />7–13 dní</span>
                                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: '#fbbf24', marginRight: '4px', verticalAlign: '-1px' }} />14+ dní</span>
                            </div>
                        </div>

                        {/* TOP streaky */}
                        <div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px' }}>
                                TOP {topStreaks.length} STREAKŮ
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {topStreaks.map((s, i) => (
                                    <div key={`${s.start.getTime()}`} style={{
                                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)', padding: '10px 14px',
                                        borderLeft: `3px solid ${streakColor(s.days)}`
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', width: '22px' }}>
                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                                            </span>
                                            <span style={{ fontWeight: 800, color: streakColor(s.days), fontSize: '1rem' }}>
                                                {s.days} {pluralDen(s.days)}
                                            </span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {fmtDateShort(s.start)} – {fmtDateShort(s.end)}
                                            </span>
                                            {s.ongoing && <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>🔥 Probíhá</span>}
                                            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {Math.round(s.totalMinutes / 60)} h · {pluralEpizoda(s.totalEpisodes)} · {s.animeCount} anime
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', paddingLeft: '32px' }}>
                                            {s.topSeries && (
                                                <span>Nejvíc sledováno: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.topSeries[0]}</span> ({Math.round(s.topSeries[1] / 60)} h)</span>
                                            )}
                                            {!s.ongoing && (
                                                <span style={{ display: 'block', marginTop: '2px' }}>
                                                    Ukončen — poslední den: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.lastDayAnime.join(', ') || '—'}</span>
                                                    {s.gapAfter !== null && s.gapAfter > 0 && <span>, poté {s.gapAfter} {pluralDen(s.gapAfter)} pauza</span>}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    )
}

function HistoryLog() {
    const { theme } = useTheme()
    const [historyLog, setHistoryLog] = useState([])
    const [animeList, setAnimeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('history_log_search_term') || '')
    const [yearFilter, setYearFilter] = useState(() => sessionStorage.getItem('history_log_year_filter') || 'all')
    const [sortBy, setSortBy] = useState(() => sessionStorage.getItem('history_log_sort_by') || 'date') // 'date', 'animeCount', 'episodes', 'time'
    const [dateRange, setDateRange] = useState(() => {
        try {
            const saved = sessionStorage.getItem('history_log_date_range');
            return saved ? JSON.parse(saved) : { start: '', end: '' };
        } catch {
            return { start: '', end: '' };
        }
    })

    // UI enhancements
    const [highlightedDate, setHighlightedDate] = useState(null)
    const [showScrollTop, setShowScrollTop] = useState(false)
    const [showStreakHistory, setShowStreakHistory] = useState(false)
    const [visibleCount, setVisibleCount] = useState(() => {
        const saved = sessionStorage.getItem('history_log_visible_count');
        return saved ? parseInt(saved, 10) : 40;
    })
    const sentinelRef = useRef(null)

    // Save states to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('history_log_search_term', searchTerm)
    }, [searchTerm])

    useEffect(() => {
        sessionStorage.setItem('history_log_year_filter', yearFilter)
    }, [yearFilter])

    useEffect(() => {
        sessionStorage.setItem('history_log_sort_by', sortBy)
    }, [sortBy])

    useEffect(() => {
        sessionStorage.setItem('history_log_date_range', JSON.stringify(dateRange))
    }, [dateRange])

    useEffect(() => {
        sessionStorage.setItem('history_log_visible_count', visibleCount)
    }, [visibleCount])

    useEffect(() => {
        const handleScroll = (e) => {
            // Ignorujeme scroll při navigaci, abychom nepřepsali uloženou pozici
            if (sessionStorage.getItem('history_log_navigating') === 'true') return;

            const target = e.target;
            let currentY = window.scrollY;
            
            if (target && target.scrollTop !== undefined && target !== document) {
                currentY = target.scrollTop;
            } else if (document.documentElement && document.documentElement.scrollTop) {
                currentY = document.documentElement.scrollTop;
            }

            // Průběžně ukládáme scroll pozici, pokud je větší než 0
            if (currentY > 0) {
                sessionStorage.setItem('history_log_scroll_y', currentY);
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

    // Detekce kliknutí na navigační prvky pro zablokování scroll eventů při odchodu ze stránky
    useEffect(() => {
        const handleGlobalClick = (e) => {
            const link = e.target.closest('a') || e.target.closest('button');
            if (link) {
                sessionStorage.setItem('history_log_navigating', 'true');
            }
        };
        window.addEventListener('click', handleGlobalClick, true);
        return () => {
            window.removeEventListener('click', handleGlobalClick, true);
        };
    }, []);

    const [isRestoringScroll, setIsRestoringScroll] = useState(() => {
        const y = sessionStorage.getItem('history_log_scroll_y');
        return y && parseInt(y, 10) > 0;
    });

    useEffect(() => {
        sessionStorage.setItem('history_log_navigating', 'false');
        loadData(STORAGE_KEYS.HISTORY_LOG, 'data/history_log.json')
            .then(data => {
                setHistoryLog(data)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load data:', err)
                setLoading(false)
            })
        // Mapa anime → série pro „Nejvíc sledováno" v historii streaků
        loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
            .then(list => setAnimeList(list || []))
            .catch(() => setAnimeList([]))
    }, [])

    // Obnovení pozice scrollu po načtení dat
    useEffect(() => {
        if (!loading && historyLog.length > 0) {
            const savedScrollY = sessionStorage.getItem('history_log_scroll_y');
            if (savedScrollY && parseInt(savedScrollY, 10) > 0) {
                const y = parseInt(savedScrollY, 10);
                
                const restoreScroll = () => {
                    window.scrollTo({ top: y, behavior: 'instant' });
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.scrollTo({ top: y, behavior: 'instant' });
                    }
                };

                // Schováme scrollovací artefakty a postupně nastavíme scroll
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        restoreScroll();
                        setTimeout(() => {
                            restoreScroll();
                            setTimeout(() => {
                                restoreScroll();
                                setIsRestoringScroll(false);
                            }, 300);
                        }, 100);
                    });
                });
            } else {
                setIsRestoringScroll(false);
            }
        }
    }, [loading, historyLog])
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
        if (!historyLog.length) return { current: 0, longest: 0, currentStart: null, currentEnd: null, longestStart: null, longestEnd: null, streaks: [] }

        // Mapa název anime → název série (fallback = samotný název)
        const seriesByName = {}
        animeList.forEach(a => { if (a.name) seriesByName[a.name] = a.series || a.name })

        const dailyMinutes = {}
        // Plán 6 Ú5: detaily dne pro historii streaků (anime + epizody per den)
        const dailyInfo = {}
        historyLog.forEach(h => {
            if (!h.date) return
            const dateStr = h.date.split('T')[0]
            let mins = 0
            if (h.time && h.time.includes('min')) {
                mins = parseInt(h.time.split(' ')[0], 10)
            }
            if (!isNaN(mins) && mins > 0) {
                dailyMinutes[dateStr] = (dailyMinutes[dateStr] || 0) + mins
                if (!dailyInfo[dateStr]) dailyInfo[dateStr] = { episodes: 0, animeMinutes: {} }
                const epMatch = h.episodes?.match(/\((\d+)x\)/)
                if (epMatch) dailyInfo[dateStr].episodes += parseInt(epMatch[1], 10)
                if (h.name) {
                    dailyInfo[dateStr].animeMinutes[h.name] = (dailyInfo[dateStr].animeMinutes[h.name] || 0) + mins
                }
            }
        })

        const sortedDates = Object.keys(dailyMinutes).sort()
        if (sortedDates.length === 0) return { current: 0, longest: 0, currentStart: null, currentEnd: null, longestStart: null, longestEnd: null, streaks: [] }

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

        // 1. Longest streak (historical) + Plán 6 Ú5: kompletní seznam streaků s detaily
        let currentStreak = 0, longestStreak = 0
        let inStreak = false
        let tempStart = null, maxStart = null, maxEnd = null
        const streaks = []
        let curDetail = null

        for (let d = new Date(minDate); d <= effectiveEndDate; d.setDate(d.getDate() + 1)) {
            const dStr = getLocalISOString(d)
            const mins = dailyMinutes[dStr] || 0

            if (mins >= 20) {
                if (!inStreak) {
                    inStreak = true
                    tempStart = new Date(d)
                    currentStreak = 1
                    curDetail = { start: new Date(d), end: new Date(d), days: 1, totalMinutes: 0, totalEpisodes: 0, animeMinutes: {}, lastDayAnime: [] }
                } else {
                    currentStreak++
                    curDetail.days++
                    curDetail.end = new Date(d)
                }

                curDetail.totalMinutes += mins
                const info = dailyInfo[dStr]
                if (info) {
                    curDetail.totalEpisodes += info.episodes
                    Object.entries(info.animeMinutes).forEach(([name, m]) => {
                        curDetail.animeMinutes[name] = (curDetail.animeMinutes[name] || 0) + m
                    })
                    curDetail.lastDayAnime = Object.keys(info.animeMinutes)
                }

                if (currentStreak > longestStreak) {
                    longestStreak = currentStreak
                    maxStart = new Date(tempStart)
                    maxEnd = new Date(d)
                }
            } else {
                inStreak = false
                currentStreak = 0
                if (curDetail) {
                    streaks.push(curDetail)
                    curDetail = null
                }
            }
        }
        if (curDetail) streaks.push(curDetail)

        // Post-processing streaků: topAnime, počet anime, pauza po streaku, probíhající
        const DAY_MS = 24 * 60 * 60 * 1000
        streaks.forEach((s, i) => {
            const entries = Object.entries(s.animeMinutes)
            s.animeCount = entries.length
            // Nejvíc sledovaná SÉRIE v období streaku (agregace minut přes série)
            const seriesMinutes = {}
            entries.forEach(([name, m]) => {
                const ser = seriesByName[name] || name
                seriesMinutes[ser] = (seriesMinutes[ser] || 0) + m
            })
            const serEntries = Object.entries(seriesMinutes)
            s.topSeries = serEntries.length ? serEntries.reduce((a, b) => (b[1] > a[1] ? b : a)) : null // [série, minuty]
            if (i < streaks.length - 1) {
                s.gapAfter = Math.max(0, Math.round((streaks[i + 1].start - s.end) / DAY_MS) - 1)
                s.ongoing = false
            } else {
                const sinceEnd = Math.round((effectiveEndDate - s.end) / DAY_MS)
                s.ongoing = sinceEnd <= 1
                s.gapAfter = s.ongoing ? null : Math.max(0, sinceEnd - 1)
            }
            delete s.animeMinutes
        })

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
            longestEnd: maxEnd,
            streaks
        }
    }, [historyLog, animeList])

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

        // Barva sloupců podle aktuálního tématu (canvas neumí CSS proměnné → resolve).
        // theme je v deps, aby se přebarvilo při přepnutí tématu.
        const barColor = (typeof document !== 'undefined'
            ? getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
            : '') || 'rgba(99, 102, 241, 0.8)'

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
                    backgroundColor: barColor,
                    borderRadius: 4,
                }
            ]
        }
    }, [filteredHistory, theme])

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

    // Staty přímo z heatmapData (stejné roční okno = jeden zdroj pravdy).
    // Záměrně NEduplikují graf (⌀ EP/den, aktivní dny) ani streaky (🔥/🏆/🕐):
    // ukazují extrémy a týdenní rytmus, které jinde nejsou.
    const heatmapStats = useMemo(() => {
        const cells = heatmapData.flat();
        if (!cells.length) return null;

        // Nejaktivnější den
        let peak = cells[0];
        for (const c of cells) if (c.eps > peak.eps) peak = c;

        // Rozložení podle dne v týdnu (Po..Ne)
        const WD = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
        const wdTot = [0, 0, 0, 0, 0, 0, 0];
        const wdCnt = [0, 0, 0, 0, 0, 0, 0];
        for (const c of cells) {
            const i = (c.date.getDay() + 6) % 7; // Po=0 … Ne=6
            wdTot[i] += c.eps;
            wdCnt[i] += 1;
        }
        let bestWd = 0;
        for (let i = 1; i < 7; i++) if (wdTot[i] > wdTot[bestWd]) bestWd = i;
        const wdMax = Math.max(...wdTot, 1);

        return {
            peak: peak.eps > 0 ? peak : null,
            bestWd: WD[bestWd],
            bestWdAvg: wdCnt[bestWd] ? wdTot[bestWd] / wdCnt[bestWd] : 0,
            wdDist: wdTot.map((t, i) => ({ name: WD[i], v: t, h: t / wdMax })),
        };
    }, [heatmapData]);

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
            const dateA = a.date || ''
            const dateB = b.date || ''
            return dateB.localeCompare(dateA)
        })

        return arr;
    }, [filteredHistory, sortBy])

    const prevFilters = useRef({ searchTerm, yearFilter, dateRange, sortBy })

    // Reset pagination ONLY when filter/search/sort parameters ACTUALLY change
    useEffect(() => {
        const prev = prevFilters.current
        if (
            prev.searchTerm !== searchTerm ||
            prev.yearFilter !== yearFilter ||
            prev.sortBy !== sortBy ||
            JSON.stringify(prev.dateRange) !== JSON.stringify(dateRange)
        ) {
            setVisibleCount(40)
            sessionStorage.setItem('history_log_scroll_y', '0')
            prevFilters.current = { searchTerm, yearFilter, dateRange, sortBy }
        }
    }, [searchTerm, yearFilter, dateRange, sortBy])

    // Infinite scroll observer setup
    useEffect(() => {
        // Zabráníme inicializaci observeru, dokud se data nenačtou,
        // jinak by se prázdný seznam zapsal do visibleCount a omezil ho na 40.
        if (!sentinelRef.current || loading || groupedHistory.length === 0) return

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => Math.min(prev + 40, groupedHistory.length))
            }
        }, { rootMargin: '200px' })

        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [groupedHistory.length, loading])

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

        // Calculate daily averages
        const uniqueDays = new Set()
        groupedHistory.forEach(group => {
            if (group.date) uniqueDays.add(group.date.split('T')[0])
        })
        const days = uniqueDays.size || 1
        const epsPerDay = episodes / days
        const minsPerDay = time / days

        // Total calendar days in range (first → last)
        let totalDaysInRange = days
        if (uniqueDays.size >= 2) {
            const sorted = Array.from(uniqueDays).sort()
            const first = new Date(sorted[0])
            const last = new Date(sorted[sorted.length - 1])
            totalDaysInRange = Math.round((last - first) / (1000 * 60 * 60 * 24)) + 1
        }

        // Nejaktivnější měsíc (v aktuálně filtrovaném rozsahu) — pro staty grafu
        const monthly = {}
        groupedHistory.forEach(group => {
            if (!group.date) return
            const mk = group.date.substring(0, 7)
            monthly[mk] = (monthly[mk] || 0) + group.totalEpisodes
        })
        let bestMonth = null
        for (const [k, v] of Object.entries(monthly)) if (!bestMonth || v > bestMonth.v) bestMonth = { k, v }
        const bestMonthObj = bestMonth
            ? { label: new Date(`${bestMonth.k}-01T12:00:00`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' }), eps: bestMonth.v }
            : null

        return { episodes, time, days, totalDaysInRange, epsPerDay, minsPerDay, bestMonth: bestMonthObj }
    }, [groupedHistory])

    const scrollToDate = (dateStr) => {
        const groupIndex = groupedHistory.findIndex(g => g.date && g.date.startsWith(dateStr));
        if (groupIndex === -1) return;

        const group = groupedHistory[groupIndex];

        // Pokud položka ještě není vykreslená, rozšíříme viditelný limit
        if (groupIndex >= visibleCount) {
            setVisibleCount(groupIndex + 10);
        }

        // Počkáme malou chvíli (50ms) na to, až React překreslí nové elementy do DOMu
        setTimeout(() => {
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
        }, 50);
    }

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in" style={{ opacity: isRestoringScroll ? 0 : 1, transition: 'opacity 0.2s' }}>
            {/* Header and Streaks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-lg)' }}>
                    <h2 style={{ margin: 0 }}>
                        History Log
                        <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
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

                        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />

                        {/* Plán 6 Ú5: tlačítko historie streaků */}
                        <button
                            className="media-icon-btn"
                            title="Historie streaků"
                            onClick={() => setShowStreakHistory(true)}
                            style={{ width: '30px', height: '30px', fontSize: '0.95rem' }}
                        >
                            🕐
                        </button>
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
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                                    GRAF ZHLÉDNUTÝCH EPIZOD {dateRange.start || dateRange.end || yearFilter !== 'all' ? '(FILTROVÁNO)' : ''}
                                </div>
                                {/* Daily Averages - top right */}
                                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', cursor: 'help' }}
                                        title={`Celkem epizod (${totalStats.episodes}) / Počet aktivních dnů (${totalStats.days}) = ${totalStats.epsPerDay.toFixed(2).replace('.', ',')}`}
                                    >
                                        <span style={{ color: 'var(--text-muted)' }}>⌀ EP/den:</span>
                                        <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                                            {Math.floor(totalStats.epsPerDay)}
                                        </span>
                                    </div>
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', cursor: 'help' }}
                                        title={`Celkový čas (${formatTime(totalStats.time)}) / Počet aktivních dnů (${totalStats.days}) = ${totalStats.minsPerDay.toFixed(2).replace('.', ',')} min`}
                                    >
                                        <span style={{ color: 'var(--text-muted)' }}>⌀ Čas/den:</span>
                                        <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>
                                            {formatTime(Math.round(totalStats.minsPerDay))}
                                        </span>
                                    </div>
                                    {totalStats.bestMonth && (
                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', cursor: 'help' }}
                                            title={`Měsíc s nejvíce zhlédnutými epizodami v tomto rozsahu (${totalStats.bestMonth.eps} EP)`}
                                        >
                                            <span style={{ color: 'var(--text-muted)' }}>Nej. měsíc:</span>
                                            <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{totalStats.bestMonth.label}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{totalStats.bestMonth.eps} EP</span>
                                        </div>
                                    )}
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', cursor: 'help' }}
                                        title={`Sledováno v ${totalStats.days} dnech z celkových ${totalStats.totalDaysInRange} kalendářních dnů v tomto období.`}
                                    >
                                        <span style={{ color: 'var(--text-muted)' }}>Aktivních dnů:</span>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalStats.days}/{totalStats.totalDaysInRange}</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ flex: 1, position: 'relative', minHeight: '180px' }}>
                                <Bar ref={chartRef} key={theme?.name || theme?.id || (theme?.isLight ? 'light' : 'dark')} options={chartOptions} data={chartData} />
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px 16px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                                HEATMAPA AKTIVITY ZA POSLEDNÍ ROK
                            </div>
                            {heatmapStats && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                                    {heatmapStats.peak && (
                                        <div
                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}
                                            title={`Nejvíc epizod za jeden den — ${heatmapStats.peak.date.toLocaleDateString('cs-CZ')} (klik = skok na den)`}
                                            onClick={() => scrollToDate(heatmapStats.peak.dateStr)}
                                        >
                                            <span style={{ color: 'var(--text-muted)' }}>Nej. den:</span>
                                            <span style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>{heatmapStats.peak.eps} EP</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{heatmapStats.peak.date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Ve který den v týdnu koukáš nejvíc (průměr epizod na daný den)">
                                        <span style={{ color: 'var(--text-muted)' }}>Nej. v týdnu:</span>
                                        <span style={{ fontWeight: 700, color: 'var(--accent-amber)' }}>{heatmapStats.bestWd}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>⌀ {Math.round(heatmapStats.bestWdAvg)}</span>
                                    </div>
                                    <div style={{ width: '1px', height: '16px', background: 'var(--border-color)' }} />
                                    <div
                                        style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '18px' }}
                                        title={`Rozložení epizod podle dne v týdnu:\n${heatmapStats.wdDist.map(d => `${d.name}: ${d.v} EP`).join('\n')}`}
                                    >
                                        {heatmapStats.wdDist.map(d => (
                                            <div
                                                key={d.name}
                                                style={{
                                                    width: '5px',
                                                    height: `${Math.max(2, Math.round(d.h * 18))}px`,
                                                    background: 'var(--accent-primary)',
                                                    opacity: 0.35 + 0.65 * d.h,
                                                    borderRadius: '1px'
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
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
                {groupedHistory.slice(0, visibleCount).map((group, idx) => (
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
                                {(() => {
                                    // Počet UNIKÁTNÍCH anime zhlédnutých daný den (ne počet řádků)
                                    const animeCount = new Set(group.entries.map(e => e.name).filter(Boolean)).size
                                    return (
                                        <span style={{ color: 'var(--accent-secondary)' }}>
                                            {animeCount} Anime
                                        </span>
                                    )
                                })()}
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
                                                color: 'var(--text-muted)',
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

                {visibleCount < groupedHistory.length && (
                    <div ref={sentinelRef} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Načítání dalších záznamů...
                    </div>
                )}

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

            {/* Plán 6 Ú5: modal historie streaků */}
            {showStreakHistory && (
                <StreakHistoryModal
                    streaks={watchStreak.streaks || []}
                    onClose={() => setShowStreakHistory(false)}
                />
            )}
        </div>
    )
}

export default HistoryLog
