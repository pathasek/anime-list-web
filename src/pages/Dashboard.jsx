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
import { Chart, Bar, Pie, Doughnut, Line } from 'react-chartjs-2'

import ChartContainer from '../components/ChartContainer'
import { buildChartOptions } from '../utils/chartSettings'
import { excelPalettes, excelImageBackgroundPlugin, decadeFloatingLabelsPlugin } from '../utils/excelStyles'
import AnimeGenreChordChart from '../components/charts/AnimeGenreChordChart'
import { calculateExcelChartsData } from '../utils/excelChartCalculations'
import ChartDataLabels from 'chartjs-plugin-datalabels'

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
    Legend,
    excelImageBackgroundPlugin,
    decadeFloatingLabelsPlugin
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
        const defaultOrder = [
            'GrafTypuPop', 'GrafTypuKombi', 'GrafTypuDist', 
            'GrafStudiiPop', 'GrafStudiiBest', 
            'GrafAnimeSezony', 'GrafAnimeVeku', 'GrafPrumerVeku', 
            'AnimeHodnoceniVCaseGraf', 
            'GrafPrubehHodnoceni', 'GrafHodnoceniVsEpizody',
            'GrafTematPop', 'GrafTematBest', 
            'GrafZanru', 'GrafZanruBest', 'GrafHodnoceniDist', 'GrafStatusu', 
            'GrafSledDenne', 'GrafSledMesicne', 'AnimeGenreChordChart'
        ]
        const savedOrder = localStorage.getItem('dashboardChartOrder_v2')
        if (savedOrder) {
            const parsed = JSON.parse(savedOrder)
            defaultOrder.forEach(id => {
                if (!parsed.includes(id)) {
                    parsed.push(id)
                }
            })
            return parsed
        }
        return defaultOrder
    })


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
        localStorage.setItem('dashboardChartOrder_v2', JSON.stringify(newOrder))
        setDraggedChart(null)

        // Remove dragging class
        const draggables = document.querySelectorAll('.chart-container')
        draggables.forEach(d => d.classList.remove('dragging'))
    }

    const handleDragEnd = (e) => {
        e.currentTarget.classList.remove('dragging')
    }

    const [statsData, setStatsData] = useState(null) // Stats from stats.json (with comments)
    const [expandedNote, setExpandedNote] = useState(null)
    const [showAllCharts, setShowAllCharts] = useState(false)

    const toggleNote = (rowIndex, colId, text, isRewatch) => {
        if (isRewatch) {
            const id = `${rowIndex}-${colId}`
            if (expandedNote && expandedNote.id === id) {
                setExpandedNote(null)
            } else {
                setExpandedNote({ id, text, rowIndex, isRewatch: true })
            }
        } else {
            const id = `row-${rowIndex}`
            if (expandedNote && expandedNote.id === id) {
                setExpandedNote(null)
            } else {
                setExpandedNote({ id, rowIndex, isRewatch: false })
            }
        }
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

        const excelData = calculateExcelChartsData(list, log);

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
            filteredStats,
            excelData // Added specific 14 charts data
        }
    }, [animeList, historyLog, timeFilter, customRange])

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání dat...</div>
    }

    if (!stats) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Žádná data k zobrazení</div>
    }

    // ==========================================
    // EXCEL EXACT CHART CONFIGURATIONS
    // ==========================================
    const excelData = stats.excelData;
    
    // 1. GrafTypuPop (Pie)
    const typesPieData = {
        labels: excelData.typesPie.map(t => t.label),
        datasets: [{
            data: excelData.typesPie.map(t => t.count),
            backgroundColor: excelPalettes.typesPie,
            borderWidth: 1,
            borderColor: '#000'
        }]
    };
    
    // 2. GrafTypuKombi (Bar + Line)
    const typesKombiData = {
        labels: excelData.typesKombi.map(t => t.label),
        datasets: [
            {
                type: 'line',
                label: 'Průměrné hodnocení',
                data: excelData.typesKombi.map(t => parseFloat(t.rating.toFixed(2))),
                borderColor: excelPalettes.kombiLine,
                backgroundColor: excelPalettes.kombiLine,
                yAxisID: 'y1',
                tension: 0.2,
                pointRadius: 6,
                pointBackgroundColor: excelPalettes.kombiLine,
                datalabels: {
                    display: true,
                    color: '#C8A632',
                    font: { weight: 'bold', size: 12 },
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    formatter: (val) => val != null ? val.toFixed(2).replace('.', ',') : ''
                }
            },
            {
                type: 'bar',
                label: 'Čas sledování (h)',
                data: excelData.typesKombi.map(t => t.hours),
                backgroundColor: excelPalettes.kombiBar,
                yAxisID: 'y',
                datalabels: {
                    display: true,
                    color: '#fff',
                    font: { weight: 'bold', size: 10 },
                    anchor: 'center',
                    align: 'center',
                    formatter: (val) => {
                        const h = val.toFixed(1).replace('.', ',');
                        const days = (val / 24).toFixed(1).replace('.', ',');
                        return `${h} h\n(${days} dní)`;
                    }
                }
            }
        ]
    };
    
    // 3. GrafTypuDist (Stacked Bar)
    const activeTypes = Object.keys(excelData.typesDistScoreMatrix[Math.max(...Object.keys(excelData.typesDistScoreMatrix))] || {});
    const distScoreLabels = [1,2,3,4,5,6,7,8,9,10];
    const typesDistData = {
        labels: activeTypes,
        datasets: distScoreLabels.map(score => ({
            label: `Skóre ${score}`,
            data: activeTypes.map(type => (excelData.typesDistScoreMatrix[score] && excelData.typesDistScoreMatrix[score][type]) || 0),
            backgroundColor: excelPalettes.scoreGradient[score] || '#94a3b8'
        }))
    };
    
    // 4. GrafStudiiPop (Pie)
    const studiosPieData = {
        labels: Object.keys(excelData.studiosPie),
        datasets: [{
            data: Object.values(excelData.studiosPie),
            backgroundColor: Object.keys(excelData.studiosPie).map((_,i) => excelPalettes.kellysMaxContrast[i % 15]), 
            borderColor: '#000',
            borderWidth: 1
        }]
    };
    
    // 4b. GrafHodnoceniDist (Pie)
    const ratingPieData = {
        labels: ['10', '9', '8', '7', '6', '5 a méně'],
        datasets: [{
            data: [stats.ratingDist['10'], stats.ratingDist['9'], stats.ratingDist['8'], stats.ratingDist['7'], stats.ratingDist['6'], stats.ratingDist['5-']],
            backgroundColor: excelPalettes.ratingPie,
            borderColor: '#000',
            borderWidth: 1
        }]
    };
    
    // 4c. GrafStatusu (Pie)
    const statusPieLabels = Object.keys(stats.statuses).sort((a,b) => stats.statuses[b] - stats.statuses[a]);
    const statusPieData = {
        labels: statusPieLabels,
        datasets: [{
            data: statusPieLabels.map(l => stats.statuses[l]),
            backgroundColor: statusPieLabels.map((_, i) => excelPalettes.statusPie[i % excelPalettes.statusPie.length]),
            borderColor: '#000',
            borderWidth: 1
        }]
    };

    // 4d. GrafSledDenne (Line)
    const latestYearDailyKeys = Object.keys(stats.dailyWatching)
        .filter(k => k.startsWith(String(stats.latestYear)))
        .sort((a,b) => new Date(a) - new Date(b));
    const dailyWatchingData = {
        labels: latestYearDailyKeys,
        datasets: [{
            label: `Sledování (minuty)`,
            data: latestYearDailyKeys.map(k => stats.dailyWatching[k]),
            borderColor: '#5B9BD5',
            backgroundColor: 'rgba(91, 155, 213, 0.2)',
            fill: true,
            tension: 0.1,
            pointRadius: 0
        }]
    };
    
    // 4e. GrafSledMesicne (Bar)
    const latestYearMonthlyKeys = Object.keys(stats.monthlyWatching)
        .filter(k => k.startsWith(String(stats.latestYear)))
        .sort((a,b) => new Date(a) - new Date(b));
    const monthlyWatchingData = {
        labels: latestYearMonthlyKeys.map(k => new Date(k + '-01').toLocaleString('cs-CZ', { month: 'short' })),
        datasets: [{
            label: `Sledování (hodiny)`,
            data: latestYearMonthlyKeys.map(k => Math.round(stats.monthlyWatching[k] / 60)),
            backgroundColor: '#ED7D31'
        }]
    };
    
    // 5. GrafStudiiBest (Bar)
    const studiosBestData = {
        labels: excelData.studiosBest.map(s => s.name),
        datasets: [{
            data: excelData.studiosBest.map(s => s.avg),
            backgroundColor: excelPalettes.studiosBar
        }]
    };
    
    // 6. GrafAnimeSezony (Bar)
    const seasonsData = {
        labels: Object.keys(excelData.seasons),
        datasets: [{
            data: Object.values(excelData.seasons),
            backgroundColor: Object.keys(excelData.seasons).map(s => excelPalettes.seasons[s])
        }]
    };
    
    // 7. GrafAnimeVeku (Bar)
    const ageVekuData = {
        labels: Object.keys(excelData.ageGroups),
        datasets: [{
            data: Object.keys(excelData.ageGroups).map(k => excelData.ageGroups[k].count),
            backgroundColor: excelPalettes.ageBar
        }]
    };
    
    // 8. GrafPrumerVeku (Bar)
    const avgAgeData = {
        labels: Object.keys(excelData.ageAvg),
        datasets: [{
            data: Object.values(excelData.ageAvg),
            backgroundColor: excelPalettes.avgAgeBar
        }]
    };
    
    // 9. AnimeHodnoceniVCaseGraf (Combo)
    const hoverTimeComboData = {
        labels: excelData.comboRatingByYear.map(c => c.year),
        datasets: [
            {
                type: 'line',
                label: 'Počet anime',
                data: excelData.comboRatingByYear.map(c => c.count),
                borderColor: excelPalettes.timelineCount,
                borderDash: [5, 5],
                yAxisID: 'y1',
                tension: 0.3
            },
            {
                type: 'scatter',
                label: 'Dekádový průměr',
                data: excelData.comboRatingByYear.map(c => c.decadeAvg ? c.decadeAvg : null),
                backgroundColor: excelPalettes.timelineDecade,
                borderColor: excelPalettes.timelineDecade,
                pointRadius: 6,
                yAxisID: 'y'
            },
            {
                type: 'line',
                label: 'Roční průměr',
                data: excelData.comboRatingByYear.map(c => c.annualAvg),
                borderColor: excelPalettes.timelineLine,
                yAxisID: 'y',
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 0
            }
        ]
    };
    
    // 10. GrafTematPop (Pie)
    const tematPopData = {
        labels: excelData.topThemes.map(t => t.label),
        datasets: [{
            data: excelData.topThemes.map(t => t.count),
             backgroundColor: excelPalettes.kellysMaxContrast
        }]
    };
    
    // 11. GrafTematBest (Bar)
    const tematBestData = {
        labels: excelData.themesBest.map(t => t.name),
        datasets: [{
            data: excelData.themesBest.map(t => t.avg),
            backgroundColor: excelPalettes.themesBar
        }]
    };
    
    // 12. GrafZanru (Pie)
    const zanruData = {
        labels: excelData.topGenres.slice(0, 15).map(g => g.label),
        datasets: [{
            data: excelData.topGenres.slice(0, 15).map(g => g.count),
            backgroundColor: excelPalettes.kellysMaxContrast,
            borderColor: '#000',
            borderWidth: 1
        }]
    };
    
    // 13. GrafZanruBest (Bar)
    const zanruBestData = {
        labels: excelData.genresBest.map(g => g.name),
        datasets: [{
            data: excelData.genresBest.map(g => g.avg),
            backgroundColor: excelPalettes.genresBestBar
        }]
    };

    // 14. GrafPrubehHodnoceni
    const ratingTimelineData = {
        labels: excelData.ratingTimeline.map(t => t.x),
        datasets: [
            {
                type: 'line',
                label: 'Klouzavý průměr (10)',
                yAxisID: 'y',
                data: excelData.ratingTimeline.map(t => t.movingAvg),
                borderColor: '#ED7D31',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4
            },
            {
                type: 'scatter',
                label: 'Hodnocení',
                yAxisID: 'y',
                data: excelData.ratingTimeline.map(t => ({x: t.x, y: t.rating})),
                backgroundColor: 'rgba(91, 155, 213, 0.5)',
                pointRadius: 3
            }
        ]
    };

    // 15. GrafHodnoceniVsEpizody
    const epBucketsData = {
        labels: excelData.ratingByEpisodes.map(b => b.label),
        datasets: [{
            label: 'Průměrné hodnocení',
            data: excelData.ratingByEpisodes.map(b => b.avg),
            backgroundColor: '#A5A5A5'
        }]
    };

    // Shared options
    const baseOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } } };
    const barOptionsExcel = { ...baseOptions };
    const horizontalBarOptionsExcel = { ...baseOptions, indexAxis: 'y' };
    const stackedBarOptions = { ...barOptionsExcel, scales: { x: { stacked: true }, y: { stacked: true } } };
    
    const doubleAxisOptions = {
        ...baseOptions,
        plugins: { legend: { display: false }, datalabels: { display: false } },
        scales: {
            y: { type: 'linear', position: 'left', min: 0 },
            y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false } }
        }
    };
    const doubleAxisRatingOptions = {
        ...baseOptions,
        plugins: { legend: { display: false }, datalabels: { display: false }, decadeFloatingLabels: { enabled: true } },
        scales: {
            x: { type: 'category', position: 'bottom' },
            y: { type: 'linear', position: 'left', id: 'y-rating', min: 0, max: 10 },
            y1: { type: 'linear', position: 'right', min: 0, grid: { drawOnChartArea: false } }
        }
    };

    // Helper pro zaokrouhlování min hodnot na násobek 0.25 (mínus čtvrtina pod nejmenší hodnotou pro osy)
    const floorTo025 = (val) => Math.floor((val - 0.25) * 4) / 4;

    // Helper functions for options
    const getOptions = (base, chartId, bgImage = null, overrides = {}) => {
        const opt = buildChartOptions(base, { legendPosition: 'hidden' });
        opt.plugins = opt.plugins || {};
        opt.plugins.legend = { display: false };
        opt.plugins.datalabels = opt.plugins.datalabels || { display: false };
        if (bgImage) {
            opt.plugins.excelImageBackground = { imagePath: bgImage };
        }
        
        if (overrides.scales) {
            opt.scales = {
                ...opt.scales,
                x: { ...opt.scales?.x, ...overrides.scales.x },
                y: { ...opt.scales?.y, ...overrides.scales.y }
            };
        }
        return opt;
    };

    // Striktně čisté options pro Koláčové grafy, aby se renderovaly jako v Excelu (text přímo v grafu)
    const getPieOptions = () => ({
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: 40
        },
        plugins: {
            legend: { display: false },
            excelImageBackground: { color: '#B3B3B3' },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.raw;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = ((value / total) * 100).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                        return `${label}: ${value} (${pct}%)`;
                    }
                }
            },
            datalabels: {
                color: '#000',
                display: (context) => {
                    const value = context.dataset.data[context.dataIndex];
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    return (value / total) > 0.03;
                },
                formatter: (value, context) => {
                    const label = context.chart.data.labels[context.dataIndex];
                    if (value === 0) return null;
                    return `${label}:\n${value}`;
                },
                font: { weight: 'bold', size: 12, family: 'sans-serif' },
                textAlign: 'center',
                anchor: 'center',
                align: 'center'
            }
        }
    });



    const ChartWrapper = ({ id, defaultTitle, defaultGridColumn = 'span 1', children }) => {
        const index = chartOrder.indexOf(id)
        const isHiddenMobile = !showAllCharts && index > 0

        return (
            <div
                className={`chart-container ${draggedChart === id ? 'dragging' : ''} ${isHiddenMobile ? 'hide-mobile' : ''}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, id)}
                onDragOver={(e) => handleDragOver(e, id)}
                onDrop={(e) => handleDrop(e, id)}
                onDragEnd={handleDragEnd}
                style={{
                    gridColumn: defaultGridColumn,
                    cursor: 'grab'
                }}
            >
                <div className="chart-header">
                    <div className="chart-title" style={{ cursor: 'grab' }}>{defaultTitle}</div>
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
                    <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>📊 Sledovaní Anime — Data projekt</h3>

                        {/* DESKTOP TABLE */}
                        <div className="hide-mobile" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-light)' }}>
                                        <th style={{ width: '20%', textAlign: 'left', padding: '8px 12px', color: 'var(--text-secondary)' }}>Sledovaná data</th>
                                        <th style={{ width: '20%', textAlign: 'center', padding: '8px 12px', background: 'rgba(99,102,241,0.1)', borderRadius: '4px 4px 0 0' }}>Za celou dobu</th>
                                        {yearCols.map(y => (
                                            <th key={y} style={{ width: '20%', textAlign: 'center', padding: '8px 12px', background: 'rgba(16,185,129,0.08)' }}>Za rok {y}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => {
                                        const isRewatch = row.label === 'Počet Rewatchů'
                                        const isRowExpanded = expandedNote && !expandedNote.isRewatch && expandedNote.rowIndex === i

                                        return (
                                            <Fragment key={i}>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>{row.label}</td>
                                                    <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: 'rgba(99,102,241,0.05)' }}>
                                                        {row.all}
                                                        {row.commentAll && (
                                                            <span
                                                                style={{ marginLeft: '6px', cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-all` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                onClick={() => toggleNote(i, 'all', row.commentAll, isRewatch)}
                                                                title="Zobrazit poznámku"
                                                            >
                                                                ⓘ
                                                            </span>
                                                        )}
                                                    </td>
                                                    {row.years.map((v, j) => (
                                                        <td key={j} style={{ textAlign: 'center', padding: '8px 12px' }}>
                                                            {v}
                                                            {row.commentYears?.[j] && (
                                                                <span
                                                                    style={{ marginLeft: '6px', cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-${j}` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                    onClick={() => toggleNote(i, j, row.commentYears[j], isRewatch)}
                                                                    title="Zobrazit poznámku"
                                                                >
                                                                    ⓘ
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>

                                                {/* Expanded Note Row (Rewatch uses colSpan, others use matching columns) */}
                                                {expandedNote && expandedNote.rowIndex === i && (
                                                    <tr style={{ backgroundColor: 'rgba(99,102,241,0.03)' }}>
                                                        {expandedNote.isRewatch ? (
                                                            <td colSpan={2 + yearCols.length} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                                                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, textAlign: 'left' }}>
                                                                    {expandedNote.text}
                                                                </div>
                                                            </td>
                                                        ) : (
                                                            <>
                                                                <td style={{ borderBottom: '1px solid var(--border-color)' }}></td>
                                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', textAlign: 'center' }}>
                                                                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                                        {row.commentAll}
                                                                    </div>
                                                                </td>
                                                                {row.years.map((_, j) => (
                                                                    <td key={j} style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', textAlign: 'center' }}>
                                                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                                                            {row.commentYears?.[j]}
                                                                        </div>
                                                                    </td>
                                                                ))}
                                                            </>
                                                        )}
                                                    </tr>
                                                )}
                                            </Fragment>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* MOBILE CARDS */}
                        <div className="hide-desktop" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {rows.map((row, i) => {
                                const isRewatch = row.label === 'Počet Rewatchů'
                                const isRowExpanded = expandedNote && !expandedNote.isRewatch && expandedNote.rowIndex === i

                                return (
                                    <div key={i} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                        <div style={{ background: 'rgba(99,102,241,0.1)', padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                                            {row.label}
                                        </div>

                                        <div style={{ padding: '0 12px' }}>
                                            {/* Total Row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Za celou dobu <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(Celkem)</span></span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: '600', color: 'var(--accent-primary)' }}>{row.all}</span>
                                                    {row.commentAll && (
                                                        <span
                                                            style={{ cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-all` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                            onClick={() => toggleNote(i, 'all', row.commentAll, isRewatch)}
                                                        >
                                                            ⓘ
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {(expandedNote?.id === `${i}-all` || isRowExpanded) && row.commentAll && (
                                                <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                    {row.commentAll}
                                                </div>
                                            )}

                                            {/* Yearly Rows */}
                                            {row.years.map((yVal, j) => (
                                                <Fragment key={j}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: j < row.years.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{yearCols[j]}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontWeight: '500' }}>{yVal}</span>
                                                            {row.commentYears?.[j] && (
                                                                <span
                                                                    style={{ cursor: 'pointer', color: (isRewatch ? expandedNote?.id === `${i}-${j}` : isRowExpanded) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                                                    onClick={() => toggleNote(i, j, row.commentYears[j], isRewatch)}
                                                                >
                                                                    ⓘ
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {(expandedNote?.id === `${i}-${j}` || isRowExpanded) && row.commentYears?.[j] && (
                                                        <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: j < row.years.length - 1 ? '8px' : '0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                            {row.commentYears[j]}
                                                        </div>
                                                    )}
                                                </Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            })()}


            {/* Dynamic Charts Grid */}
            <div className="charts-grid">
                {chartOrder.map(id => {
                    if (id === 'GrafTypuPop') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Rozdělení podle Typu">
                            <Pie data={typesPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafTypuKombi') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Kombinovaný graf Typů (Hodiny vs Hodnocení)" defaultGridColumn="span 2">
                            <Bar data={typesKombiData} options={getOptions(doubleAxisOptions, id, './assets/excel_charts_media/image41.jpg')} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafTypuDist') {
                        const allScoresDesc = [...distScoreLabels].reverse();
                        const scoresWithData = allScoresDesc.filter(s => 
                            activeTypes.some(type => excelData.typesDistScoreMatrix[s] && excelData.typesDistScoreMatrix[s][type])
                        );
                        // Make sure we show at least 10 down to 5
                        const displayScores = [...new Set([...allScoresDesc.filter(s => s >= 5), ...scoresWithData])].sort((a,b)=>b-a);
                        
                        return (
                        <ChartWrapper key={id} id={id} defaultTitle="Rozdělení Typů (Distributivní Skóre)" defaultGridColumn="span 2">
                            <div style={{ display: 'flex', flexDirection: 'column', height: '700px' }}>
                                <div style={{ flex: 1, minHeight: 0 }}>
                                    <Bar data={{...typesDistData, datasets: typesDistData.datasets.map(ds => ({...ds, datalabels: { display: false }}))}} 
                                         options={getOptions({
                                             ...stackedBarOptions, 
                                             plugins: { ...stackedBarOptions.plugins, legend: { display: false } },
                                             scales: { 
                                                ...stackedBarOptions.scales, 
                                                x: { ...stackedBarOptions.scales.x, ticks: { display: false }, grid: { display: false } },
                                                y: { ...stackedBarOptions.scales.y, max: 250 }
                                             }
                                         }, id, './assets/excel_charts_media/image47.jpg')} />
                                </div>
                                <div style={{ overflowX: 'auto', marginTop: '-1px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ border: '1px solid var(--border-color)', width: '50px' }}></th>
                                                {activeTypes.map(t => <th key={t} style={{ border: '1px solid var(--border-color)', padding: '6px', fontSize: '0.8rem' }}>{t}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayScores.map(score => {
                                                const dataset = typesDistData.datasets.find(ds => ds.label === `Skóre ${score}`);
                                                return (
                                                <tr key={score}>
                                                    <td style={{ border: '1px solid var(--border-color)', padding: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ width: '12px', height: '12px', background: dataset?.backgroundColor, display: 'inline-block', borderRadius: '2px' }}></span>
                                                        {score}
                                                    </td>
                                                    {activeTypes.map(type => (
                                                        <td key={type} style={{ border: '1px solid var(--border-color)' }}>
                                                            {(excelData.typesDistScoreMatrix[score] && excelData.typesDistScoreMatrix[score][type]) || 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            )})}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </ChartWrapper>
                    )}
                    if (id === 'GrafStudiiPop') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Graf Studií (Populace)">
                            <Pie data={studiosPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafStudiiBest') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Nejlepší Studia (TOP 10)">
                            <Bar data={studiosBestData} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image4.jpg', {
                                scales: { x: { min: floorTo025(Math.min(...excelData.studiosBest.map(s => s.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </ChartWrapper>
                    )
                    
                    // Merged season/age block
                    if (id === 'GrafAnimeSezony') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Statistiky Sezón a Věku Anime" defaultGridColumn="span 1">
                            {/* Force height so the 3 charts can be stacked comfortably inside */}
                            <div style={{ display: 'flex', flexDirection: 'column', height: '600px', gap: 'var(--spacing-md)' }}>
                                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                    <h4 style={{ position: 'absolute', top: 5, left: 10, zIndex: 10, fontSize: '0.9rem', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px' }}>Počet Anime podle sezóny</h4>
                                    <Bar data={{
                                        labels: seasonsData.labels,
                                        datasets: [{ ...seasonsData.datasets[0], datalabels: { display: true, formatter: (val) => val, color: '#000', anchor: 'center', align: 'center', font: { weight: 'bold' } } }]
                                    }} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image6.jpg', { scales: { x: { display: false } } })} />
                                </div>
                                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                    <h4 style={{ position: 'absolute', top: 5, left: 10, zIndex: 10, fontSize: '0.9rem', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px' }}>Počet Anime podle stáří věkových skupin</h4>
                                    <Bar data={{
                                        labels: ageVekuData.labels,
                                        datasets: [{ ...ageVekuData.datasets[0], datalabels: { display: true, formatter: (val) => `${val}`, color: '#000', anchor: 'center', align: 'center' } }]
                                    }} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image5.jpg', { scales: { x: { display: false } } })} />
                                </div>
                                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                    <h4 style={{ position: 'absolute', top: 5, left: 10, zIndex: 10, fontSize: '0.9rem', background: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '4px' }}>Průměrné hodnocení věkových skupin</h4>
                                    <Bar data={{
                                        labels: avgAgeData.labels,
                                        datasets: [{ ...avgAgeData.datasets[0], datalabels: { display: true, formatter: (val) => `${parseFloat(val).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, color: '#000', anchor: 'center', align: 'center' } }]
                                    }} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image45.jpg', {
                                        scales: { x: { min: floorTo025(Math.min(...Object.values(excelData.ageAvg).filter(v => v > 0))), ticks: { stepSize: 0.25 }, display: false } }
                                    })} />
                                </div>
                            </div>
                        </ChartWrapper>
                    )

                    if (id === 'AnimeHodnoceniVCaseGraf') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Hodnocení v čase & Vývoj kvality" defaultGridColumn="span 2">
                            <Line data={hoverTimeComboData} options={getOptions(doubleAxisRatingOptions, id, './assets/excel_charts_media/image35.jpg')} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafTematPop') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Graf Témat (Populace)">
                            <Pie data={tematPopData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafTematBest') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Nejlepší Témata (TOP 10)">
                            <Bar data={tematBestData} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image7.jpg', {
                                scales: { x: { min: floorTo025(Math.min(...excelData.themesBest.map(h => h.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafZanru') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Graf Žánrů (Populace)">
                            <Pie data={zanruData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafHodnoceniDist') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Rozdělení hodnocení (Populace)">
                            <Pie data={ratingPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafStatusu') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Rozdělení statusů (Populace)">
                            <Pie data={statusPieData} options={getPieOptions()} plugins={[ChartDataLabels]} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafPrubehHodnoceni') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Průběh hodnocení v čase" defaultGridColumn="span 2">
                            <Chart type="line" data={ratingTimelineData} options={buildChartOptions(baseOptions, { 
                                legendPosition: 'hidden',
                                scales: { x: { display: false }, y: { min: 0, max: 10 } },
                                plugins: { tooltip: { callbacks: { label: (ctx) => `${excelData.ratingTimeline[ctx.dataIndex].title}: ${ctx.raw.y || ctx.raw}` } } }
                            })} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafHodnoceniVsEpizody') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Hodnocení vs počet epizod">
                            <Bar data={epBucketsData} options={buildChartOptions({ ...barOptionsExcel }, { legendPosition: 'hidden', scales: { y: { min: 6 } } })} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafSledDenne') return (
                        <ChartWrapper key={id} id={id} defaultTitle={`Sledování Anime v roce ${stats.latestYear} (minuty denně)`} defaultGridColumn="span 2">
                            <Line data={dailyWatchingData} options={buildChartOptions(baseOptions, { legendPosition: 'hidden' })} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafSledMesicne') return (
                        <ChartWrapper key={id} id={id} defaultTitle={`Sledování Anime v roce ${stats.latestYear} (hodiny měsíčně)`}>
                            <Bar data={monthlyWatchingData} options={buildChartOptions(baseOptions, { legendPosition: 'hidden' })} />
                        </ChartWrapper>
                    )
                    if (id === 'GrafZanruBest') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Nejlepší Žánry (TOP 10)">
                            <Bar data={zanruBestData} options={getOptions(horizontalBarOptionsExcel, id, './assets/excel_charts_media/image8.jpg', {
                                scales: { x: { min: floorTo025(Math.min(...excelData.genresBest.map(h => h.avg))), ticks: { stepSize: 0.25 } } }
                            })} />
                        </ChartWrapper>
                    )
                    if (id === 'AnimeGenreChordChart') return (
                        <ChartWrapper key={id} id={id} defaultTitle="Chord Diagram Žánrových Vazeb" defaultGridColumn="span 2">
                            <div style={{ width: '100%', height: '600px', display: 'flex', justifyContent: 'center' }}>
                                <AnimeGenreChordChart data={animeList} />
                            </div>
                        </ChartWrapper>
                    )
                    return null
                })}
            </div>

            {chartOrder.length > 1 && (
                <button
                    className="filter-btn hide-desktop"
                    onClick={() => setShowAllCharts(!showAllCharts)}
                    style={{ width: '100%', marginTop: 'var(--spacing-md)', justifyContent: 'center', padding: '12px' }}
                >
                    {showAllCharts ? 'SKRÝT DALŠÍ GRAFY ▲' : 'ZOBRAZIT DALŠÍ GRAFY ▼'}
                </button>
            )}
        </div>
    )
}

export default Dashboard
