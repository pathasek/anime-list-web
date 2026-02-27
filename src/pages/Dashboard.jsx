import { useState, useEffect, useMemo, Fragment } from 'react'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js'
import { Bar, Pie, Doughnut, Line } from 'react-chartjs-2'

import ChartContainer from '../components/ChartContainer'
import ChartSettingsModal from '../components/ChartSettingsModal'
import { getChartSettings, colorPalettes, applyPalette, buildChartOptions } from '../utils/chartSettings'

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
)

// Chart.js default options for dark theme
ChartJS.defaults.color = '#94a3b8'
ChartJS.defaults.borderColor = '#2a2a3a'

function Dashboard() {
    // Czech number formatting: dot → comma
    const toCS = (val) => String(val).replace('.', ',')

    const [animeList, setAnimeList] = useState([])
    const [historyLog, setHistoryLog] = useState([])
    const [loading, setLoading] = useState(true)
    const [timeFilter, setTimeFilter] = useState('all')
    const [customRange, setCustomRange] = useState({ start: '', end: '' })
    const [chartOrder, setChartOrder] = useState(() => {
        const savedOrder = localStorage.getItem('dashboardChartOrder')
        if (savedOrder) return JSON.parse(savedOrder)
        return ['types', 'studios', 'seasons', 'genres', 'themes', 'rating', 'monthly2025', 'releaseYears', 'status', 'dubbing', 'avgRatingType', 'studiosByRating', 'genresByRating', 'themesByRating', 'dailyWatching', 'monthlyWatching']
    })

    const [activeChartSettings, setActiveChartSettings] = useState(null)
    const [draggedChart, setDraggedChart] = useState(null)

    const handleDragStart = (e, id) => {
        setDraggedChart(id)
        e.dataTransfer.effectAllowed = 'move'
        // Add a class for visual feedback
        e.currentTarget.classList.add('dragging')
    }

    const handleDragOver = (e, id) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = (e, targetId) => {
        e.preventDefault()
        if (!draggedChart || draggedChart === targetId) return

        const newOrder = [...chartOrder]
        const draggedIdx = newOrder.indexOf(draggedChart)
        const targetIdx = newOrder.indexOf(targetId)

        newOrder.splice(draggedIdx, 1)
        newOrder.splice(targetIdx, 0, draggedChart)

        setChartOrder(newOrder)
        localStorage.setItem('dashboardChartOrder', JSON.stringify(newOrder))
        setDraggedChart(null)

        // Remove dragging class
        const draggables = document.querySelectorAll('.chart-container')
        draggables.forEach(d => d.classList.remove('dragging'))
    }

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging')
    }
    const [settingsRefresh, setSettingsRefresh] = useState(0)
    const [statsData, setStatsData] = useState(null) // Stats from stats.json (with comments)
    const [expandedNote, setExpandedNote] = useState(null)

    const toggleNote = (id, text) => {
        if (expandedNote && expandedNote.id === id) {
            setExpandedNote(null)
        } else {
            setExpandedNote({ id, text })
        }
    }

    const openChartSettings = (e, id, title) => {
        const r = e.currentTarget.getBoundingClientRect()
        setActiveChartSettings({ id, title, anchorPosition: { top: r.bottom + window.scrollY, left: r.left + window.scrollX } })
    }

    useEffect(() => {
        Promise.all([
            fetch('data/anime_list.json').then(r => r.json()),
            fetch('data/history_log.json').then(r => r.json()),
            fetch('data/stats.json').then(r => r.json()).catch(() => null)
        ])
            .then(([anime, history, statsJson]) => {
                setAnimeList(anime)
                setHistoryLog(history)
                if (statsJson) setStatsData(statsJson)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load data:', err)
                setLoading(false)
            })
    }, [])



    // Calculate statistics
    const stats = useMemo(() => {
        if (!animeList.length) return null

        // --- Filter Logic ---
        function getYear(dateStr) {
            if (!dateStr) return null
            const d = new Date(dateStr)
            return d.getFullYear()
        }

        const isInTimeRange = (dateStr) => {
            if (!dateStr) return false
            const d = new Date(dateStr)
            const year = d.getFullYear()

            if (timeFilter === 'all') return true
            // Dynamic year filter
            const yearNum = parseInt(timeFilter)
            if (!isNaN(yearNum)) return year === yearNum
            if (timeFilter === 'custom') {
                if (!customRange.start && !customRange.end) return true
                const start = customRange.start ? new Date(customRange.start) : new Date('2000-01-01')
                const end = customRange.end ? new Date(customRange.end) : new Date()
                end.setHours(23, 59, 59, 999)
                return d >= start && d <= end
            }
            return true
        }

        // Detect all years from data
        const detectedYears = new Set()
        animeList.forEach(a => {
            const y = getYear(a.start_date)
            if (y && y >= 2000) detectedYears.add(y)
        })
        const sortedYearsAll = [...detectedYears].sort((a, b) => a - b)
        const latestYear = sortedYearsAll.length > 0 ? sortedYearsAll[sortedYearsAll.length - 1] : new Date().getFullYear()

        // Apply filters
        const filteredAnimeList = animeList.filter(a => isInTimeRange(a.start_date || a.release_date))
        const filteredHistoryLog = historyLog.filter(h => isInTimeRange(h.date))

        const list = filteredAnimeList
        const log = filteredHistoryLog

        // Helper: compute detailed stats for a subset of anime
        const computeYearStats = (subset) => {
            let totalEps = 0, totalMins = 0, rewatchCount = 0
            const typeBreakdown = {}
            subset.forEach(a => {
                const eps = parseInt(a.episodes) || 0
                const rc = parseInt(a.rewatch_count) || 0
                const dur = parseFloat(a.episode_duration) || 24

                // Use pre-calculated totalTime from JSON if available, otherwise fallback
                const time = parseFloat(a.total_time) || (eps * dur * (1 + rc))

                totalEps += eps * (1 + rc)
                totalMins += time
                rewatchCount += rc

                const t = a.type || 'Jiný'
                typeBreakdown[t] = (typeBreakdown[t] || 0) + 1
            })
            const avgEpDur = totalEps > 0 ? totalMins / totalEps : 0
            return { count: subset.length, totalEps, totalMins, rewatchCount, avgEpDur, typeBreakdown }
        }

        // Per-year detailed stats
        const yearStats = {}
        sortedYearsAll.forEach(y => {
            const yearAnime = animeList.filter(a => getYear(a.start_date) === y)
            yearStats[y] = computeYearStats(yearAnime)
        })

        // Overall (all time) stats — computed from ALL anime, not filtered
        const allTimeStats = computeYearStats(animeList)

        // Filtered stats (for display when filter is active)
        const filteredStats = computeYearStats(list)

        // Per-year stats (kept for backward compat with charts)
        const animeByYear = {}
        const episodesByYear = {}
        sortedYearsAll.forEach(y => {
            animeByYear[y] = yearStats[y].count
            episodesByYear[y] = yearStats[y].totalEps
        })

        // Calculate total episodes (including rewatches)
        const totalEpisodesSum = list.reduce((sum, a) => {
            const eps = parseInt(a.episodes) || 0
            const rc = parseInt(a.rewatch_count) || 0
            return sum + (eps * (1 + rc))
        }, 0)

        // Calculate total time (in hours, including rewatches)
        const totalTimeSum = list.reduce((sum, a) => {
            const eps = parseInt(a.episodes) || 0
            const rc = parseInt(a.rewatch_count) || 0
            const dur = parseFloat(a.episode_duration) || 24
            const time = parseFloat(a.total_time) || (eps * dur * (1 + rc))
            return sum + (time / 60)
        }, 0)

        // Average rating
        const ratings = list.filter(a => a.rating && !isNaN(parseFloat(a.rating)))
        const avgRating = ratings.length
            ? ratings.reduce((sum, a) => sum + parseFloat(a.rating), 0) / ratings.length
            : 0

        // Type distribution
        const types = {}
        list.forEach(a => {
            const type = a.type || 'Unknown'
            types[type] = (types[type] || 0) + 1
        })

        // Genre distribution
        const genres = {}
        list.forEach(a => {
            if (a.genres) {
                a.genres.split(';').forEach(g => {
                    const genre = g.trim()
                    if (genre) genres[genre] = (genres[genre] || 0) + 1
                })
            }
        })

        // Studio distribution
        const studios = {}
        list.forEach(a => {
            if (a.studio) {
                a.studio.split(';').forEach(s => {
                    const studio = s.trim()
                    if (studio && studio.length < 50) { // Filter out formula strings
                        studios[studio] = (studios[studio] || 0) + 1
                    }
                })
            }
        })

        // Rating distribution
        const ratingDist = { '10': 0, '9': 0, '8': 0, '7': 0, '6': 0, '5-': 0 }
        list.forEach(a => {
            const r = parseFloat(a.rating)
            if (!isNaN(r)) {
                if (r >= 9.5) ratingDist['10']++
                else if (r >= 8.5) ratingDist['9']++
                else if (r >= 7.5) ratingDist['8']++
                else if (r >= 6.5) ratingDist['7']++
                else if (r >= 5.5) ratingDist['6']++
                else ratingDist['5-']++
            }
        })

        // Monthly watching logic (latest year)
        const monthlyLatestYear = {}
        log.forEach(h => {
            if (h.date) {
                const d = new Date(h.date)
                if (d.getFullYear() === latestYear) {
                    const month = d.getMonth()
                    // Extract episode count from "(Nx) EP X-Y" or "(Nx)" pattern
                    const match = h.episodes?.match(/\((\d+)x\)/)
                    const eps = match ? parseInt(match[1]) : (parseInt(h.episodes?.replace(/[^\d]/g, '')) || 0)
                    monthlyLatestYear[month] = (monthlyLatestYear[month] || 0) + eps
                }
            }
        })

        // Themes distribution
        const themes = {}
        list.forEach(a => {
            if (a.themes) {
                a.themes.split(';').forEach(t => {
                    const theme = t.trim()
                    if (theme && theme !== 'X') themes[theme] = (themes[theme] || 0) + 1
                })
            }
        })

        // Season distribution (from release_date)
        const seasons = { 'Winter': 0, 'Spring': 0, 'Summer': 0, 'Fall': 0 }
        list.forEach(a => {
            if (a.release_date) {
                const d = new Date(a.release_date)
                const month = d.getMonth()
                if (month >= 0 && month <= 2) seasons['Winter']++
                else if (month >= 3 && month <= 5) seasons['Spring']++
                else if (month >= 6 && month <= 8) seasons['Summer']++
                else seasons['Fall']++
            }
        })

        // Release year distribution (anime age)
        const releaseYears = {}
        list.forEach(a => {
            if (a.release_date) {
                const year = new Date(a.release_date).getFullYear()
                if (!isNaN(year) && year > 1980 && year <= 2025) {
                    releaseYears[year] = (releaseYears[year] || 0) + 1
                }
            }
        })

        // Status distribution (grouped like Excel)
        const statuses = {}
        list.forEach(a => {
            let status = a.status || 'Neznámý'
            // Group all "Existuje..." variants into one category
            if (status.startsWith('Existuje')) {
                status = 'Existuje pokračování...'
            }
            statuses[status] = (statuses[status] || 0) + 1
        })

        // Dubbing distribution
        const dubs = {}
        list.forEach(a => {
            if (a.dub) {
                a.dub.split(';').forEach(d => {
                    const dub = d.trim()
                    if (dub) dubs[dub] = (dubs[dub] || 0) + 1
                })
            } else {
                dubs['Neznámý'] = (dubs['Neznámý'] || 0) + 1
            }
        })

        // Average rating by type
        const typeRatings = {}
        const typeCounts = {}
        list.forEach(a => {
            if (a.type && a.rating) {
                const r = parseFloat(a.rating)
                if (!isNaN(r)) {
                    typeRatings[a.type] = (typeRatings[a.type] || 0) + r
                    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1
                }
            }
        })
        const avgRatingByType = {}
        Object.keys(typeRatings).forEach(type => {
            avgRatingByType[type] = parseFloat((typeRatings[type] / typeCounts[type]).toFixed(2))
        })

        // Top 10 Studios by Average Rating (min 2 anime)
        const studioRatings = {}
        const studioCounts = {}
        list.forEach(a => {
            if (a.studio && a.rating) {
                const r = parseFloat(a.rating)
                if (!isNaN(r)) {
                    studioRatings[a.studio] = (studioRatings[a.studio] || 0) + r
                    studioCounts[a.studio] = (studioCounts[a.studio] || 0) + 1
                }
            }
        })
        const studiosByRating = Object.entries(studioRatings)
            .filter(([studio]) => studioCounts[studio] >= 2)
            .map(([studio, sum]) => ({
                name: studio,
                avg: parseFloat((sum / studioCounts[studio]).toFixed(2)),
                count: studioCounts[studio]
            }))
            .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
            .slice(0, 10)

        // Top 10 Genres by Average Rating (min 3 anime)
        const genreRatings = {}
        const genreCounts = {}
        list.forEach(a => {
            if (a.genres && a.rating) {
                const r = parseFloat(a.rating)
                if (!isNaN(r)) {
                    a.genres.split(';').forEach(g => {
                        const genre = g.trim()
                        if (genre) {
                            genreRatings[genre] = (genreRatings[genre] || 0) + r
                            genreCounts[genre] = (genreCounts[genre] || 0) + 1
                        }
                    })
                }
            }
        })
        const genresByRating = Object.entries(genreRatings)
            .filter(([genre]) => genreCounts[genre] >= 3)
            .map(([genre, sum]) => ({
                name: genre,
                avg: parseFloat((sum / genreCounts[genre]).toFixed(2)),
                count: genreCounts[genre]
            }))
            .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
            .slice(0, 10)

        // Top 10 Themes by Average Rating (min 3 anime)
        const themeRatings = {}
        const themeCounts = {}
        list.forEach(a => {
            if (a.themes && a.themes !== 'X' && a.rating) {
                const r = parseFloat(a.rating)
                if (!isNaN(r)) {
                    a.themes.split(';').forEach(t => {
                        const theme = t.trim()
                        if (theme && theme !== 'X') {
                            themeRatings[theme] = (themeRatings[theme] || 0) + r
                            themeCounts[theme] = (themeCounts[theme] || 0) + 1
                        }
                    })
                }
            }
        })
        const themesByRating = Object.entries(themeRatings)
            .filter(([theme]) => themeCounts[theme] >= 3)
            .map(([theme, sum]) => ({
                name: theme,
                avg: parseFloat((sum / themeCounts[theme]).toFixed(2)),
                count: themeCounts[theme]
            }))
            .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg))
            .slice(0, 10)

        // Daily watching (filtered range)
        const dailyWatching = {}
        let now = new Date()
        // Logic for filtered view: if time filter is active, daily watching should reflect that range
        // If 'all' or '2025' etc, we might want to restrict keys

        // Actually, just aggregate log
        log.forEach(h => {
            if (h.date) {
                const d = new Date(h.date)
                // Parse time logic
                let mins = 0
                if (h.time) {
                    const timeStr = String(h.time)
                    if (timeStr.includes(':')) {
                        const [hours, minutes] = timeStr.split(':').map(Number)
                        mins = (hours || 0) * 60 + (minutes || 0)
                    } else {
                        mins = parseFloat(timeStr) || 0
                    }
                }
                const key = d.toISOString().split('T')[0]
                dailyWatching[key] = (dailyWatching[key] || 0) + mins
            }
        })

        // Monthly watching totals (filtered)
        const monthlyWatching = {}
        log.forEach(h => {
            if (h.date) {
                const d = new Date(h.date)
                let mins = 0
                if (h.time) {
                    const timeStr = String(h.time)
                    if (timeStr.includes(':')) {
                        const [hours, minutes] = timeStr.split(':').map(Number)
                        mins = (hours || 0) * 60 + (minutes || 0)
                    } else {
                        mins = parseFloat(timeStr) || 0
                    }
                }
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                monthlyWatching[monthKey] = (monthlyWatching[monthKey] || 0) + mins
            }
        })

        return {
            totalAnime: list.length,
            animeByYear,
            episodesByYear,
            latestYear,
            sortedYears: sortedYearsAll,
            totalEpisodes: totalEpisodesSum,
            totalTime: Math.round(totalTimeSum),
            avgRating: parseFloat(avgRating.toFixed(2)),
            types,
            genres,
            studios,
            ratingDist,
            monthlyLatestYear,
            themes,
            seasons,
            releaseYears,
            statuses,
            dubs,
            avgRatingByType,
            studiosByRating,
            genresByRating,
            themesByRating,
            dailyWatching,
            monthlyWatching,
            yearStats,
            allTimeStats,
            filteredStats
        }
    }, [animeList, historyLog, timeFilter, customRange])

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání dat...</div>
    }

    if (!stats) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Žádná data k zobrazení</div>
    }

    // Chart colors
    const colors = {
        primary: '#6366f1',
        secondary: '#8b5cf6',
        pink: '#ec4899',
        cyan: '#06b6d4',
        emerald: '#10b981',
        amber: '#f59e0b',
        red: '#ef4444',
    }

    // Helper to get colors based on chart settings
    const getColorsForChart = (chartId, defaultPalette) => {
        const settings = getChartSettings(chartId)
        return colorPalettes[settings.palette] || defaultPalette
    }

    const palette = [colors.primary, colors.secondary, colors.pink, colors.cyan, colors.emerald, colors.amber, colors.red, '#a855f7', '#f97316', '#14b8a6']

    // Type chart data
    const typeChartData = {
        labels: Object.keys(stats.types),
        datasets: [{
            data: Object.values(stats.types),
            backgroundColor: palette.slice(0, Object.keys(stats.types).length),
            borderWidth: 0
        }]
    }

    // Top 10 genres
    const topGenres = Object.entries(stats.genres)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

    const genreChartData = {
        labels: topGenres.map(g => g[0]),
        datasets: [{
            label: 'Počet',
            data: topGenres.map(g => g[1]),
            backgroundColor: colors.primary,
            borderRadius: 4
        }]
    }

    // Top 10 studios
    const topStudios = Object.entries(stats.studios)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

    const studioChartData = {
        labels: topStudios.map(s => s[0]),
        datasets: [{
            data: topStudios.map(s => s[1]),
            backgroundColor: palette.slice(0, topStudios.length),
            borderWidth: 0
        }]
    }

    // Rating distribution chart
    const ratingChartData = {
        labels: Object.keys(stats.ratingDist),
        datasets: [{
            label: 'Počet anime',
            data: Object.values(stats.ratingDist),
            backgroundColor: [colors.emerald, colors.cyan, colors.primary, colors.amber, colors.pink, colors.red],
            borderRadius: 4
        }]
    }

    // Monthly episodes (latest year)
    const monthNames = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']

    // Determine current year and month for boundary check
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth()

    const monthlyData = {
        labels: monthNames,
        datasets: [{
            label: `Epizody v roce ${stats.latestYear}`,
            data: monthNames.map((_, i) => {
                if (parseInt(stats.latestYear) === currentYear && i > currentMonth) {
                    return null
                }
                return stats.monthlyLatestYear[i] || 0
            }),
            borderColor: colors.primary,
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointBackgroundColor: colors.primary
        }]
    }

    // Seasons chart data
    const seasonColors = { 'Winter': '#60a5fa', 'Spring': '#34d399', 'Summer': '#fbbf24', 'Fall': '#f97316' }
    const seasonsChartData = {
        labels: Object.keys(stats.seasons),
        datasets: [{
            data: Object.values(stats.seasons),
            backgroundColor: Object.keys(stats.seasons).map(s => seasonColors[s]),
            borderWidth: 0
        }]
    }

    // Top themes chart
    const topThemes = Object.entries(stats.themes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

    const themesChartData = {
        labels: topThemes.map(t => t[0]),
        datasets: [{
            label: 'Počet',
            data: topThemes.map(t => t[1]),
            backgroundColor: colors.secondary,
            borderRadius: 4
        }]
    }

    // Release years chart (anime age)
    const sortedYears = Object.keys(stats.releaseYears).sort((a, b) => parseInt(a) - parseInt(b))
    const releaseYearsData = {
        labels: sortedYears,
        datasets: [{
            label: 'Počet anime',
            data: sortedYears.map(y => stats.releaseYears[y]),
            borderColor: colors.pink,
            backgroundColor: 'rgba(236, 72, 153, 0.2)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: colors.pink
        }]
    }

    // Status distribution chart
    const statusChartData = {
        labels: Object.keys(stats.statuses),
        datasets: [{
            data: Object.values(stats.statuses),
            backgroundColor: ['#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'],
            borderWidth: 0
        }]
    }

    // Dubbing distribution chart
    const dubChartData = {
        labels: Object.keys(stats.dubs),
        datasets: [{
            label: 'Počet anime',
            data: Object.values(stats.dubs),
            backgroundColor: [colors.primary, colors.secondary, colors.emerald, colors.amber],
            borderRadius: 4
        }]
    }

    // Average rating by type chart
    const sortedTypeRatings = Object.entries(stats.avgRatingByType)
        .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
    const avgRatingByTypeData = {
        labels: sortedTypeRatings.map(t => t[0]),
        datasets: [{
            label: 'Průměrné hodnocení',
            data: sortedTypeRatings.map(t => parseFloat(t[1])),
            backgroundColor: palette.slice(0, sortedTypeRatings.length),
            borderRadius: 4
        }]
    }

    // Top 10 Studios by Rating chart
    const studiosByRatingData = {
        labels: stats.studiosByRating.map(s => s.name.length > 15 ? s.name.substring(0, 15) + '...' : s.name),
        datasets: [{
            label: 'Průměrné hodnocení',
            data: stats.studiosByRating.map(s => parseFloat(s.avg)),
            backgroundColor: stats.studiosByRating.map((_, i) => palette[i % palette.length]),
            borderRadius: 4
        }]
    }

    // Top 10 Genres by Rating chart
    const genresByRatingData = {
        labels: stats.genresByRating.map(g => g.name),
        datasets: [{
            label: 'Průměrné hodnocení',
            data: stats.genresByRating.map(g => parseFloat(g.avg)),
            backgroundColor: stats.genresByRating.map((_, i) => palette[i % palette.length]),
            borderRadius: 4
        }]
    }

    // Top 10 Themes by Rating chart
    const themesByRatingData = {
        labels: stats.themesByRating.map(t => t.name),
        datasets: [{
            label: 'Průměrné hodnocení',
            data: stats.themesByRating.map(t => parseFloat(t.avg)),
            backgroundColor: stats.themesByRating.map((_, i) => palette[i % palette.length]),
            borderRadius: 4
        }]
    }

    // Daily watching chart (last 365 days)
    const dailyDates = Object.keys(stats.dailyWatching).sort()
    const dailyWatchingData = {
        labels: dailyDates.map(d => {
            const date = new Date(d)
            return `${date.getDate()}.${date.getMonth() + 1}.`
        }),
        datasets: [{
            label: 'Minuty sledování',
            data: dailyDates.map(d => stats.dailyWatching[d]),
            borderColor: colors.cyan,
            backgroundColor: 'rgba(6, 182, 212, 0.2)',
            fill: true,
            tension: 0.3,
            pointRadius: 1,
            pointBackgroundColor: colors.cyan
        }]
    }

    // Monthly watching chart (all time)
    const monthlyDates = Object.keys(stats.monthlyWatching).sort()
    const monthlyWatchingData = {
        labels: monthlyDates.map(m => {
            const [year, month] = m.split('-')
            return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`
        }),
        datasets: [{
            label: 'Minuty sledování',
            data: monthlyDates.map(m => Math.round(stats.monthlyWatching[m])),
            backgroundColor: colors.secondary,
            borderRadius: 4
        }]
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        }
    }

    const horizontalBarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                min: 0,
                max: 10,
                grid: { color: 'rgba(255,255,255,0.1)' }
            }
        }
    }

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: { boxWidth: 12, padding: 8 }
            }
        }
    }



    const ChartWrapper = ({ id, defaultTitle, defaultGridColumn = 'span 1', children }) => {
        const settings = getChartSettings(id)
        const customTitle = settings.customTitle || defaultTitle

        const handleMouseUp = (e) => {
            const el = e.currentTarget
            if (el.offsetWidth !== settings.customWidth || el.offsetHeight !== settings.customHeight) {
                saveChartSettings(id, { ...settings, customWidth: el.offsetWidth, customHeight: el.offsetHeight })
                setSettingsRefresh(prev => prev + 1)
            }
        }

        return (
            <div
                className={`chart-container ${draggedChart === id ? 'dragging' : ''}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, id)}
                onDragOver={(e) => handleDragOver(e, id)}
                onDrop={(e) => handleDrop(e, id)}
                onDragEnd={handleDragEnd}
                style={{
                    gridColumn: defaultGridColumn,
                    width: settings.customWidth ? `${settings.customWidth}px` : 'auto',
                    height: settings.customHeight ? `${settings.customHeight}px` : 'auto',
                    cursor: 'grab'
                }}
                onMouseUp={handleMouseUp}
            >
                <div className="chart-header">
                    <div className="chart-title" style={{ cursor: 'grab' }}>{customTitle}</div>
                    <button className="chart-settings-btn" onClick={(e) => openChartSettings(e, id, defaultTitle)} title="Nastavení">⚙️</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    {children}
                </div>
            </div>
        )
    }

    return (

        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
                <h2 style={{ margin: 0 }}>Dashboard</h2>
                <a
                    href="https://notebooklm.google.com/notebook/54e7fa34-caef-4aeb-a895-ea57e56845ea"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: 'var(--accent-primary)', textDecoration: 'none', fontSize: '0.85rem',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.25)'; e.currentTarget.style.borderColor = 'var(--accent-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)' }}
                >
                    🤖 NotebookLM Chatbot
                </a>
            </div>

            {/* Time Filter */}
            <div className="time-filter">
                <label title="Časové období aktualizuje grafy">📅 Časový filtr (pro grafy):</label>
                <select
                    value={timeFilter}
                    onChange={e => setTimeFilter(e.target.value)}
                    className="select"
                >
                    <option value="all">Vše</option>
                    {stats.sortedYears.map(y => (
                        <option key={y} value={String(y)}>{y}</option>
                    ))}
                    <option value="custom">Vlastní rozsah</option>
                </select>
                {timeFilter === 'custom' && (
                    <>
                        <input
                            type="date"
                            value={customRange.start}
                            onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                        />
                        <span>—</span>
                        <input
                            type="date"
                            value={customRange.end}
                            onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                        />
                    </>
                )}
            </div>

            {/* Stats Table — Excel-style */}
            {(() => {
                const formatMins = (mins) => {
                    const h = Math.floor(mins / 60)
                    const m = Math.round(mins % 60)
                    return `${h}:${String(m).padStart(2, '0')}`
                }
                const formatDays = (mins) => {
                    const totalH = mins / 60
                    const days = Math.floor(totalH / 24)
                    const hours = Math.round(totalH % 24)
                    return `${days} dní ${hours} hodin`
                }
                // Determine which year columns to show
                const yearCols = stats.sortedYears.slice(-3) // last 3 years
                const all = stats.allTimeStats
                const filtered = stats.filteredStats
                const ys = stats.yearStats
                const getYear = (dateStr) => { if (!dateStr) return null; return new Date(dateStr).getFullYear() }
                // Determine values from statsData (stats.json) if available
                const getFromStatsData = (label, yearIdx) => {
                    if (!statsData || !statsData.dashboard_table) return null
                    const row = statsData.dashboard_table.find(r => r[0].toLowerCase().includes(label.toLowerCase()))
                    if (!row) return null
                    // yearIdx: -1 for total, 0 for first year in yearCols, etc.
                    if (yearIdx === -1) return row[1]

                    // Match year value to column index in stats.json
                    const year = yearCols[yearIdx]
                    const headerRow = statsData.dashboard_table[0]
                    const colIdx = headerRow.findIndex(h => h.includes(String(year)))
                    return colIdx !== -1 ? row[colIdx] : null
                }

                const getComment = (key, year) => {
                    if (!statsData || !statsData.comments || !statsData.comments[key]) return null
                    return year === 'total' ? statsData.comments[key].total : statsData.comments[key][year]
                }

                const rows = [
                    {
                        label: 'Čas sledování (hh:mm)',
                        all: getFromStatsData('Čas sledování (hh:mm)', -1) || formatMins(all.totalMins),
                        years: yearCols.map((y, idx) => getFromStatsData('Čas sledování (hh:mm)', idx) || formatMins(ys[y]?.totalMins || 0)),
                        commentAll: getComment('total_time', 'total'),
                        commentYears: yearCols.map(y => getComment('total_time', String(y)))
                    },
                    {
                        label: 'Čas sledování (dny)',
                        all: getFromStatsData('dny', -1) || formatDays(all.totalMins),
                        years: yearCols.map((y, idx) => getFromStatsData('dny', idx) || formatDays(ys[y]?.totalMins || 0))
                    },
                    {
                        label: 'Počet zhlédnutých epizod',
                        all: getFromStatsData('epizod', -1) || all.totalEps.toLocaleString('cs-CZ'),
                        years: yearCols.map((y, idx) => getFromStatsData('epizod', idx) || (ys[y]?.totalEps || 0).toLocaleString('cs-CZ')),
                        commentAll: getComment('total_episodes', 'total'),
                        commentYears: yearCols.map(y => getComment('total_episodes', String(y)))
                    },
                    {
                        label: 'Prům. délka epizody (min)',
                        all: toCS(getFromStatsData('Průměrná délka', -1)?.replace(',', '.') || all.avgEpDur.toFixed(1)),
                        years: yearCols.map((y, idx) => toCS(getFromStatsData('Průměrná délka', idx)?.replace(',', '.') || (ys[y]?.avgEpDur || 0).toFixed(1)))
                    },
                    {
                        label: 'Počet Rewatchů',
                        all: getFromStatsData('Počet Rewatchů', -1) || all.rewatchCount,
                        years: yearCols.map((y, idx) => getFromStatsData('Počet Rewatchů', idx) || ys[y]?.rewatchCount || 0),
                        commentAll: getComment('rewatch_count', 'total'),
                        commentYears: yearCols.map(y => getComment('rewatch_count', String(y)))
                    },
                    {
                        label: 'Celkový počet Anime',
                        all: getFromStatsData('Celkový počet', -1) || all.count,
                        years: yearCols.map((y, idx) => getFromStatsData('Celkový počet', idx) || ys[y]?.count || 0)
                    },
                    {
                        label: 'Průměrné hodnocení', all: toCS(stats.avgRating), years: yearCols.map(y => {
                            const yAnime = animeList.filter(a => getYear(a.start_date) === y).filter(a => a.rating && !isNaN(parseFloat(a.rating)))
                            return yAnime.length ? toCS((yAnime.reduce((s, a) => s + parseFloat(a.rating), 0) / yAnime.length).toFixed(2)) : '-'
                        })
                    }
                ]
                // Removed type breakdown rows as requested

                return (
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)', overflowX: 'auto' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>📊 Sledovaní Anime — Data projekt</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)' }}>Sledovaná data</th>
                                    <th style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '4px 4px 0 0' }}>Za celou dobu</th>
                                    {yearCols.map(y => (
                                        <th key={y} style={{ textAlign: 'center', padding: '8px 12px', background: 'rgba(16,185,129,0.08)' }}>Za rok {y}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => (
                                    <Fragment key={i}>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', opacity: row.isType ? 0.85 : 1 }}>
                                            <td style={{ padding: '8px 12px', fontWeight: row.isType ? 400 : 500, paddingLeft: row.isType ? '24px' : '12px', color: row.isType ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{row.label}</td>
                                            <td
                                                style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: 'rgba(99,102,241,0.05)' }}
                                            >
                                                {row.all}
                                                {row.commentAll && (
                                                    <span
                                                        style={{ marginLeft: '6px', cursor: 'pointer', color: expandedNote?.id === `${i}-all` ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                        onClick={() => toggleNote(`${i}-all`, row.commentAll)}
                                                        title="Zobrazit poznámku"
                                                    >
                                                        ⓘ
                                                    </span>
                                                )}
                                            </td>
                                            {row.years.map((v, j) => (
                                                <td
                                                    key={j}
                                                    style={{ textAlign: 'center', padding: '8px 12px' }}
                                                >
                                                    {v}
                                                    {row.commentYears?.[j] && (
                                                        <span
                                                            style={{ marginLeft: '6px', cursor: 'pointer', color: expandedNote?.id === `${i}-${j}` ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                            onClick={() => toggleNote(`${i}-${j}`, row.commentYears[j])}
                                                            title="Zobrazit poznámku"
                                                        >
                                                            ⓘ
                                                        </span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                        {/* Expanded Note Row */}
                                        {expandedNote && expandedNote.id.startsWith(`${i}-`) && (
                                            <tr style={{ backgroundColor: 'rgba(99,102,241,0.03)' }}>
                                                <td colSpan={2 + yearCols.length} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'left' }}>
                                                        {expandedNote.text}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            })()}


            {/* Dynamic Charts Grid */}
            <div className="charts-grid">
                {chartOrder.map(id => {
                    if (id === 'types') return (
                        <ChartWrapper key={id} id="types" defaultTitle="Rozdělení typů">
                            <Doughnut data={applyPalette(typeChartData, getChartSettings('types').palette)} options={buildChartOptions(pieOptions, { ...getChartSettings('types'), showGrid: false })} />
                        </ChartWrapper>
                    )
                    if (id === 'studios') return (
                        <ChartWrapper key={id} id="studios" defaultTitle="Top 10 Studií">
                            <Pie data={applyPalette(studioChartData, getChartSettings('studios').palette)} options={buildChartOptions(pieOptions, { ...getChartSettings('studios'), showGrid: false })} />
                        </ChartWrapper>
                    )
                    if (id === 'seasons') return (
                        <ChartWrapper key={id} id="seasons" defaultTitle="Rozdělení podle sezón">
                            <Doughnut data={applyPalette(seasonsChartData, getChartSettings('seasons').palette)} options={buildChartOptions(pieOptions, { ...getChartSettings('seasons'), showGrid: false })} />
                        </ChartWrapper>
                    )
                    if (id === 'genres') return (
                        <ChartWrapper key={id} id="genres" defaultTitle="Top 10 Žánrů">
                            <Bar data={applyPalette(genreChartData, getChartSettings('genres').palette)} options={buildChartOptions({ ...chartOptions, indexAxis: 'y' }, getChartSettings('genres'))} />
                        </ChartWrapper>
                    )
                    if (id === 'themes') return (
                        <ChartWrapper key={id} id="themes" defaultTitle="Top 10 Témat">
                            <Bar data={applyPalette(themesChartData, getChartSettings('themes').palette)} options={buildChartOptions({ ...chartOptions, indexAxis: 'y' }, getChartSettings('themes'))} />
                        </ChartWrapper>
                    )
                    if (id === 'rating') return (
                        <ChartWrapper key={id} id="rating" defaultTitle="Rozdělení hodnocení">
                            <Bar data={applyPalette(ratingChartData, getChartSettings('rating').palette)} options={buildChartOptions(chartOptions, getChartSettings('rating'))} />
                        </ChartWrapper>
                    )
                    if (id === 'monthly2025') return (
                        <ChartWrapper key={id} id="monthly2025" defaultTitle={`Sledování v roce ${stats.latestYear} (epizody/měsíc)`} defaultGridColumn="span 2">
                            <Line data={applyPalette(monthlyData, getChartSettings('monthly2025').palette)} options={buildChartOptions(chartOptions, getChartSettings('monthly2025'))} />
                        </ChartWrapper>
                    )
                    if (id === 'releaseYears') return (
                        <ChartWrapper key={id} id="releaseYears" defaultTitle="Stáří anime (podle data vydání)" defaultGridColumn="span 2">
                            <Line data={applyPalette(releaseYearsData, getChartSettings('releaseYears').palette)} options={buildChartOptions(chartOptions, getChartSettings('releaseYears'))} />
                        </ChartWrapper>
                    )
                    if (id === 'status') return (
                        <ChartWrapper key={id} id="status" defaultTitle="Rozdělení statusů">
                            <Doughnut data={applyPalette(statusChartData, getChartSettings('status').palette)} options={buildChartOptions(pieOptions, { ...getChartSettings('status'), showGrid: false })} />
                        </ChartWrapper>
                    )
                    if (id === 'dubbing') return (
                        <ChartWrapper key={id} id="dubbing" defaultTitle="Rozdělení dabingů">
                            <Bar data={applyPalette(dubChartData, getChartSettings('dubbing').palette)} options={buildChartOptions(chartOptions, getChartSettings('dubbing'))} />
                        </ChartWrapper>
                    )
                    if (id === 'avgRatingType') return (
                        <ChartWrapper key={id} id="avgRatingType" defaultTitle="Průměrné hodnocení dle typu">
                            <Bar data={applyPalette(avgRatingByTypeData, getChartSettings('avgRatingType').palette)} options={buildChartOptions(chartOptions, getChartSettings('avgRatingType'))} />
                        </ChartWrapper>
                    )
                    if (id === 'studiosByRating' && stats.studiosByRating.length > 0) return (
                        <ChartWrapper key={id} id="studiosByRating" defaultTitle="Top 10 studií podle hodnocení">
                            <Bar data={applyPalette(studiosByRatingData, getChartSettings('studiosByRating').palette)} options={buildChartOptions(horizontalBarOptions, getChartSettings('studiosByRating'))} />
                        </ChartWrapper>
                    )
                    if (id === 'genresByRating' && stats.genresByRating.length > 0) return (
                        <ChartWrapper key={id} id="genresByRating" defaultTitle="Top 10 žánrů podle hodnocení">
                            <Bar data={applyPalette(genresByRatingData, getChartSettings('genresByRating').palette)} options={buildChartOptions(horizontalBarOptions, getChartSettings('genresByRating'))} />
                        </ChartWrapper>
                    )
                    if (id === 'themesByRating' && stats.themesByRating.length > 0) return (
                        <ChartWrapper key={id} id="themesByRating" defaultTitle="Top 10 témat podle hodnocení">
                            <Bar data={applyPalette(themesByRatingData, getChartSettings('themesByRating').palette)} options={buildChartOptions(horizontalBarOptions, getChartSettings('themesByRating'))} />
                        </ChartWrapper>
                    )
                    if (id === 'dailyWatching' && dailyDates.length > 0) return (
                        <ChartWrapper key={id} id="dailyWatching" defaultTitle="Denní sledování (posledních 365 dní)" defaultGridColumn="span 2">
                            <Line data={applyPalette(dailyWatchingData, getChartSettings('dailyWatching').palette)} options={buildChartOptions(chartOptions, getChartSettings('dailyWatching'))} />
                        </ChartWrapper>
                    )
                    if (id === 'monthlyWatching' && monthlyDates.length > 0) return (
                        <ChartWrapper key={id} id="monthlyWatching" defaultTitle="Měsíční sledování (v minutách)" defaultGridColumn="span 2">
                            <Bar data={applyPalette(monthlyWatchingData, getChartSettings('monthlyWatching').palette)} options={buildChartOptions(chartOptions, getChartSettings('monthlyWatching'))} />
                        </ChartWrapper>
                    )
                    return null
                })}
            </div>

            {/* Chart Settings Modal */}
            {activeChartSettings && (
                <ChartSettingsModal
                    isOpen={true}
                    onClose={() => setActiveChartSettings(null)}
                    chartId={activeChartSettings.id}
                    chartTitle={activeChartSettings.title}
                    onSettingsChange={() => setSettingsRefresh(prev => prev + 1)}
                    anchorPosition={activeChartSettings.anchorPosition}
                />
            )}
        </div>
    )
}

export default Dashboard
