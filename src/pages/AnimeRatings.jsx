import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
    Chart as ChartJS,
    registerables
} from 'chart.js'
import { Radar, Bar, Chart } from 'react-chartjs-2'
import regression from 'regression'
import {
    extractMalId,
    getCachedEpisodeList,
    getCachedEpisodeSynopsis
} from '../utils/jikanService'
import './AnimeRatings.css'

ChartJS.register(...registerables)

const categoryWeights = {
    "Animace": 2.0, "CGI": 1.8, "MC": 3.0, "Vedlejší postavy": 2.5, "Waifu": 1.5,
    "Plot": 4.0, "Pacing": 1.5, "Story Conclusion": 1.5, "Originalita": 2.5,
    "Emoce": 3.5, "Enjoyment": 4.0, "OP": 1.0, "ED": 0.5, "OST": 2.0
}

// Robust clean season labels helper to prevent overlaps in long series (like Monogatari)
const cleanSeasonLabel = (name, seriesName) => {
    let cleaned = name;
    
    // 1. Strip series name prefix
    if (seriesName) {
        const escapedSeries = seriesName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`^${escapedSeries}(?::\\s*|,\\s*|\\s+|-+\\s*)`, 'i');
        cleaned = cleaned.replace(regex, '');
    }
    
    // 2. Specialized abbreviation for Monogatari series (Bake, Nise, Neko, Hana, etc.)
    if (seriesName && seriesName.toLowerCase().includes('monogatari')) {
        cleaned = cleaned
            .replace(/Bakemonogatari/i, 'Bake')
            .replace(/Nisemonogatari/i, 'Nise')
            .replace(/Nekomonogatari/i, 'Neko')
            .replace(/Hanamonogatari/i, 'Hana')
            .replace(/Tsukimonogatari/i, 'Tsuki')
            .replace(/Owarimonogatari/i, 'Owari')
            .replace(/Koyomimonogatari/i, 'Koyomi')
            .replace(/Zoku Owarimonogatari/i, 'Zoku Owari')
            .replace(/Series:\s*/i, '')
            .replace(/Off & Monster Season/i, 'Off & Monster');
    } else {
        cleaned = cleaned.replace(/monogatari/gi, 'mono.');
    }
    
    // 3. General cleaning of long suffixes
    cleaned = cleaned
        .replace(/:\s*Kimetsu no Yaiba\s*-?/i, '')
        .replace(/Second Season/i, 'S2')
        .replace(/First Season/i, 'S1')
        .replace(/Third Season/i, 'S3')
        .replace(/Season\s*(\d+)/i, 'S$1')
        .replace(/Part\s*(\d+)/i, 'P$1');
        
    // 4. Standardize identical name to "S1"
    if (seriesName && cleaned.trim().toLowerCase() === seriesName.trim().toLowerCase()) {
        cleaned = "S1";
    }
    
    return cleaned;
};

// Robust duration formatting for episodes/movies (handles seconds as numbers and text like "1 hr 3 min")
const formatDuration = (durationVal) => {
    if (!durationVal) return '';
    if (typeof durationVal === 'number') {
        return `${Math.round(durationVal / 60)} min`;
    }
    const str = String(durationVal).trim();
    if (/^\d+$/.test(str)) {
        return `${Math.round(Number(str) / 60)} min`;
    }
    return str; // Returns pre-formatted strings like "1 hr 3 min" directly
};

function AnimeRatings() {
    // ---- DATA STATES ----
    const [animeList, setAnimeList] = useState([])
    const [categoryRatings, setCategoryRatings] = useState([])
    const [episodeRatings, setEpisodeRatings] = useState([])
    const [notes, setNotes] = useState([])
    const [imdbCache, setImdbCache] = useState({})
    const [loading, setLoading] = useState(true)

    // ---- UI STATES: ROUTING & MODES ----
    const [viewMode, setViewMode] = useState('split') // 'split' | 'series' | 'individual'
    
    // ---- UI STATES: SERIES VIEW ----
    const [selectedSeries, setSelectedSeries] = useState(null)
    const [selectedSeriesSeason, setSelectedSeriesSeason] = useState(null)
    const [seriesTab, setSeriesTab] = useState('timeline') // 'timeline' | 'details'
    const [selectedTimelineEp, setSelectedTimelineEp] = useState(null)
    const [searchQuerySeries, setSearchQuerySeries] = useState('')
    const [showTrendLine, setShowTrendLine] = useState(true)
    const [ratingSource, setRatingSource] = useState('moje') // 'moje' | 'mal' | 'imdb'
    const [franchiseJikanCache, setFranchiseJikanCache] = useState({})

    const [jikanEpisodes, setJikanEpisodes] = useState(null)  // episode list from Jikan for current anime
    const [jikanSynopsis, setJikanSynopsis] = useState(null)  // synopsis detail for selected episode
    const [jikanLoading, setJikanLoading] = useState(false)
    const selectedTimelineEpRef = useRef(null)
    selectedTimelineEpRef.current = selectedTimelineEp

    // ---- UI STATES: ROW 1 (INDIVIDUAL) ----
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedAnimeTitle, setSelectedAnimeTitle] = useState(null)

    // ---- UI STATES: ROW 2 ----
    const [slicerTyp, setSlicerTyp] = useState('Kategorie')
    const [slicerPolozka, setSlicerPolozka] = useState('Vedlejší postavy')
    const [slicerHodnoceni, setSlicerHodnoceni] = useState('Všechna')

    // ---- UI STATES: ROW 3 ----
    const [lbTyp, setLbTyp] = useState('Epizody')
    const [lbSort, setLbSort] = useState('Nejlepší')
    const [lbCount, setLbCount] = useState(30)


    // ============================================
    // SERIES DATA MEMOIZATION & GROUPING
    // ============================================
    const seriesGroups = useMemo(() => {
        const groups = {}
        animeList.forEach(anime => {
            const sName = anime.series || anime.name
            if (!groups[sName]) groups[sName] = []
            groups[sName].push(anime)
        })

        // Sort seasons/parts within each series based on watch date, status, and name
        Object.keys(groups).forEach(sName => {
            groups[sName].sort((a, b) => {
                // 1. Sort by start_date (watch date)
                const parseDate = (dStr) => {
                    if (!dStr || dStr === 'X') return new Date(0)
                    return new Date(dStr)
                }
                const dateA = parseDate(a.start_date)
                const dateB = parseDate(b.start_date)
                if (dateA.getTime() !== dateB.getTime()) {
                    return dateA - dateB
                }

                // 2. If watch dates are identical, use status as a tie-breaker:
                // "Pokračování zhlédnuto" (Rank 1) comes before "Neexistuje" (Rank 4)
                const getStatusRank = (status) => {
                    if (!status) return 5
                    const s = status.toLowerCase()
                    if (s.includes("zhlédnuto") || s.includes("zhlednuto")) return 1
                    if (s.includes("čekám") || s.includes("cekam") || s.includes("airing") || s.includes("existuje")) return 2
                    if (s.includes("nepravděpodobné") || s.includes("nepravdepodobne")) return 3
                    if (s.includes("neexistuje")) return 4
                    return 5
                }
                const rankA = getStatusRank(a.status)
                const rankB = getStatusRank(b.status)
                if (rankA !== rankB) {
                    return rankA - rankB
                }

                // 3. Otherwise, use natural comparison of the names
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
            })
        })

        return groups
    }, [animeList])

    const seriesList = useMemo(() => {
        return Object.entries(seriesGroups).map(([name, items]) => {
            const ratings = items.map(a => Number(a.rating)).filter(r => !isNaN(r) && r > 0)
            const avgRating = ratings.length > 0 ? (ratings.reduce((sum, r) => sum + r, 0) / ratings.length) : 0
            
            const thumbItem = items.find(a => a.thumbnail)
            const thumbnail = thumbItem ? thumbItem.thumbnail : null
            
            const studios = Array.from(new Set(items.map(a => a.studio).filter(Boolean)))
            const totalEps = items.reduce((sum, a) => sum + (Number(a.episodes) || 0), 0)

            return {
                name,
                items,
                avgRating,
                thumbnail,
                studios,
                totalEps
            }
        })
        .filter(s => s.items.length > 1) // Pouze franšízy s více než 1 částí/sezónou
        .sort((a, b) => b.avgRating - a.avgRating) // Sort by overall average rating descending
    }, [seriesGroups])

    const filteredSeriesList = useMemo(() => {
        if (!searchQuerySeries) return seriesList
        const lower = searchQuerySeries.toLowerCase()
        return seriesList.filter(s => s.name.toLowerCase().includes(lower))
    }, [seriesList, searchQuerySeries])

    const selectedSeriesObj = useMemo(() => {
        return seriesList.find(s => s.name === selectedSeries) || null
    }, [seriesList, selectedSeries])

    const seasonColorMap = useMemo(() => {
        if (!selectedSeriesObj) return {}
        const map = {}
        selectedSeriesObj.items.forEach((item, idx) => {
            const cleanLabel = cleanSeasonLabel(item.name, selectedSeries)
            map[cleanLabel] = idx
        })
        return map
    }, [selectedSeriesObj, selectedSeries])

    const seasonStyles = [
        { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.4)', text: 'rgb(165, 180, 252)' },      // Indigo
        { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)', text: 'rgb(110, 231, 183)' },     // Emerald
        { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)', text: 'rgb(253, 230, 138)' },     // Amber
        { bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.4)', text: 'rgb(94, 234, 212)' },      // Teal
        { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.4)', text: 'rgb(196, 181, 253)' },     // Violet
        { bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.4)', text: 'rgb(244, 143, 177)' },       // Rose
        { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)', text: 'rgb(147, 197, 253)' },     // Blue
        { bg: 'rgba(217, 70, 239, 0.12)', border: 'rgba(217, 70, 239, 0.4)', text: 'rgb(240, 171, 252)' }      // Fuchsia
    ]

    // Load data
    useEffect(() => {
        let isMounted = true
        Promise.all([
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/category_ratings.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/episode_ratings.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/notes.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/imdb_cache.json?v=' + Date.now()).then(r => r.json()).catch(() => ({}))
        ]).then(([al, cr, er, nt, ic]) => {
            if (!isMounted) return

            // Sort anime list by reading primarily those that have category ratings
            const animeWithRatings = new Set(cr.map(c => c.name))
            const filteredAl = al.filter(a => animeWithRatings.has(a.name)).sort((a,b) => {
                const ra = Number(a.rating) || 0;
                const rb = Number(b.rating) || 0;
                return rb - ra; // Sort by FH descending
            })
            setAnimeList(filteredAl)
            setCategoryRatings(cr)
            setEpisodeRatings(er)
            setNotes(nt)
            setImdbCache(ic)

            if (filteredAl.length > 0) {
                setSelectedAnimeTitle(filteredAl[0].name)
            }
            setLoading(false)
        }).catch(err => {
            console.error("Failed to load data for Anime Ratings:", err)
            if (isMounted) {
                setLoading(false)
            }
        })

        return () => {
            isMounted = false
        }
    }, [])

    // ============================================
    // JIKAN: Preload Jikan episode lists for all seasons in selected series franchise
    // ============================================
    useEffect(() => {
        if (!selectedSeriesObj || viewMode !== 'series') {
            setFranchiseJikanCache({})
            return
        }

        let isMounted = true
        const loadAll = async () => {
            const cacheObj = {}
            for (const item of selectedSeriesObj.items) {
                if (item.mal_url) {
                    const malId = extractMalId(item.mal_url)
                    if (malId) {
                        try {
                            const cached = await getCachedEpisodeList(malId)
                            if (cached && cached.episodes) {
                                cacheObj[String(malId)] = cached.episodes
                            }
                        } catch (e) {
                            console.warn("[Jikan] Preload failed for MAL ID:", malId, e)
                        }
                    }
                }
            }
            if (isMounted) {
                setFranchiseJikanCache(cacheObj)
            }
        }

        loadAll()
        return () => {
            isMounted = false
        }
    }, [selectedSeriesObj, viewMode])

    // ============================================
    // JIKAN: Load episode list when anime selection changes
    // ============================================
    useEffect(() => {
        if (!selectedSeries || viewMode !== 'series' || !selectedSeriesObj) {
            setJikanEpisodes(null)
            return
        }

        let cancelled = false
        setJikanLoading(true)

        const loadAllSeriesEpisodes = async () => {
            try {
                const results = []
                for (const item of selectedSeriesObj.items) {
                    if (!item.mal_url) continue
                    const malId = extractMalId(item.mal_url)
                    if (!malId) continue
                    
                    const cached = await getCachedEpisodeList(malId)
                    if (cached && cached.episodes && cached.episodes.length > 0) {
                        const mappedEps = cached.episodes.map(ep => ({
                            ...ep,
                            animeName: item.name,
                            cleanSeasonName: cleanSeasonLabel(item.name, selectedSeries)
                        }))
                        results.push({
                            animeName: item.name,
                            episodes: mappedEps
                        })
                    } else {
                        // Fallback: generate synthetic episodes so it shows up immediately in the right list panel!
                        const isMovie = item.type === "Movie" || Number(item.episodes) === 1;
                        const syntheticEps = []
                        const totalEps = Number(item.episodes) || 1
                        
                        for (let epNum = 1; epNum <= totalEps; epNum++) {
                            syntheticEps.push({
                                mal_id: epNum,
                                title: isMovie ? "Film" : `Epizoda ${epNum}`,
                                title_japanese: null,
                                aired: item.release_date || null,
                                score: Number(item.rating) || null,
                                filler: false,
                                recap: false,
                                animeName: item.name,
                                cleanSeasonName: cleanSeasonLabel(item.name, selectedSeries)
                            })
                        }
                        results.push({
                            animeName: item.name,
                            episodes: syntheticEps
                        })
                    }
                }

                if (cancelled) return

                const mergedEpisodes = []
                selectedSeriesObj.items.forEach(item => {
                    const found = results.find(r => r.animeName === item.name)
                    if (found) {
                        mergedEpisodes.push(...found.episodes)
                    }
                })

                setJikanEpisodes(mergedEpisodes.length > 0 ? mergedEpisodes : null)
                setJikanLoading(false)
            } catch (err) {
                console.error("Failed to load series episodes:", err)
                if (!cancelled) {
                    setJikanEpisodes(null)
                    setJikanLoading(false)
                }
            }
        }

        loadAllSeriesEpisodes()

        return () => { cancelled = true }
    }, [selectedSeries, selectedSeriesObj, viewMode])

    // ============================================
    // JIKAN: Load synopsis when episode is selected
    // ============================================
    useEffect(() => {
        if (!selectedTimelineEp || viewMode !== 'series') {
            setJikanSynopsis(null)
            return
        }

        const anime = animeList.find(a => a.name === selectedTimelineEp.animeName)
        if (!anime || !anime.mal_url) {
            setJikanSynopsis(null)
            return
        }

        const malId = extractMalId(anime.mal_url)
        if (!malId) {
            setJikanSynopsis(null)
            return
        }

        // Extract episode number from epName (e.g. "EP 3" -> 3, "Film" -> 1)
        const epName = selectedTimelineEp.epName
        let epNum = 1
        const epMatch = epName.match(/EP\s*(\d+)/i)
        if (epMatch) {
            epNum = parseInt(epMatch[1], 10)
        }

        let cancelled = false

        getCachedEpisodeSynopsis(malId, epNum).then(cached => {
            if (cancelled) return
            setJikanSynopsis(cached || null)
        }).catch(() => {
            if (!cancelled) setJikanSynopsis(null)
        })

        return () => { cancelled = true }
    }, [selectedTimelineEp, viewMode, animeList])


    // Automatically set default series and season when entering series mode
    useEffect(() => {
        if (viewMode === 'series' && seriesList.length > 0) {
            if (!selectedSeries) {
                setSelectedSeries(seriesList[0].name)
            }
        }
    }, [viewMode, seriesList, selectedSeries])

    useEffect(() => {
        if (selectedSeriesObj && selectedSeriesObj.items && selectedSeriesObj.items.length > 0) {
            // Find first part in the series that has ratings to set as default season
            const activeSeason = selectedSeriesObj.items.find(a => categoryRatings.some(c => c.name === a.name))
            if (activeSeason) {
                setSelectedSeriesSeason(activeSeason.name)
                setSelectedAnimeTitle(activeSeason.name)
            } else {
                const firstItemName = selectedSeriesObj.items[0]?.name || null
                setSelectedSeriesSeason(firstItemName)
                setSelectedAnimeTitle(firstItemName)
            }
            setSelectedTimelineEp(null)
        }
    }, [selectedSeries, selectedSeriesObj, categoryRatings])

    // Series Categories Averaged
    const selectedSeriesCategories = useMemo(() => {
        if (!selectedSeriesObj) return null
        const items = selectedSeriesObj.items
        const avgCats = {}
        const counts = {}
        
        items.forEach(anime => {
            const found = categoryRatings.find(cr => cr.name === anime.name)
            if (found && found.categories) {
                Object.entries(found.categories).forEach(([cat, val]) => {
                    avgCats[cat] = (avgCats[cat] || 0) + val
                    counts[cat] = (counts[cat] || 0) + 1
                });
            }
        })
        
        const result = {}
        Object.keys(avgCats).forEach(cat => {
            result[cat] = avgCats[cat] / counts[cat]
        })
        return Object.keys(result).length > 0 ? result : null
    }, [selectedSeriesObj, categoryRatings])

    const seriesRadarData = useMemo(() => {
        if (!selectedSeriesCategories) return null
        const labels = Object.keys(selectedSeriesCategories).map(c => `${c}|(v. ${categoryWeights[c] || 1})`)
        const values = Object.values(selectedSeriesCategories)
        return {
            labels,
            datasets: [{
                label: 'Průměr série',
                data: values,
                backgroundColor: 'rgba(236, 72, 153, 0.3)', // Pinkish accent for series radar
                borderColor: 'rgba(236, 72, 153, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(236, 72, 153, 1)',
                pointBorderColor: '#fff',
            }]
        }
    }, [selectedSeriesCategories])

    // Helper to calculate weighted category average (AVG CAT)
    const getAvgCat = (animeName) => {
        const found = categoryRatings.find(cr => cr.name === animeName)
        if (!found || !found.categories) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(found.categories).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight) : null
    }

    // Continuous Series Timeline Data
    const seriesTimelineData = useMemo(() => {
        if (!selectedSeries || viewMode !== 'series') return null
        const seriesItems = seriesGroups[selectedSeries] || []
        const allEpisodes = []
        const seasonBoundaries = []
        let currentIndex = 0

        seriesItems.forEach(anime => {
            const isMovieOrSingleEpisode = 
                anime.type === "Movie" || 
                Number(anime.episodes) === 1 || 
                anime.name === "The Disappearance of Haruhi Suzumiya" ||
                anime.name.toLowerCase().includes("heaven's feel") || 
                anime.name.toLowerCase().includes("movie") ||
                anime.name.toLowerCase().includes("film");

            let epsToUse = []
            
            if (isMovieOrSingleEpisode) {
                const avgCat = getAvgCat(anime.name)
                epsToUse = [{
                    episode: "Film",
                    rating: avgCat !== null ? avgCat : (Number(anime.rating) || 0)
                }]
            } else {
                const erObj = episodeRatings.find(er => er.name === anime.name)
                const hasEpisodes = erObj && erObj.episodes && erObj.episodes.length > 0
                if (hasEpisodes) {
                    // Recap alignment: detect if user skipped recap episodes
                    let mappedEps = null;
                    if (anime.mal_url) {
                        const malId = extractMalId(anime.mal_url);
                        const jikanEpsList = franchiseJikanCache[String(malId)];
                        if (jikanEpsList && jikanEpsList.length > 0) {
                            const nonRecapEps = jikanEpsList.filter(e => !e.recap);
                            if (erObj.episodes.length === nonRecapEps.length && erObj.episodes.length < jikanEpsList.length) {
                                // User's episode count matches non-recap count — align by skipping recaps
                                mappedEps = nonRecapEps.map((jEp, idx) => {
                                    const userEp = erObj.episodes[idx];
                                    return {
                                        episode: `EP ${jEp.mal_id}`,
                                        rating: userEp ? userEp.rating : null
                                    };
                                });
                            }
                        }
                    }

                    if (mappedEps) {
                        epsToUse = mappedEps;
                    } else {
                        epsToUse = erObj.episodes.map(ep => ({
                            episode: ep.episode,
                            rating: ep.rating
                        }))
                    }
                } else {
                    const avgCat = getAvgCat(anime.name)
                    if (avgCat !== null) {
                        epsToUse = [{
                            episode: "Film",
                            rating: avgCat
                        }]
                    } else if (anime.rating && !isNaN(Number(anime.rating))) {
                        epsToUse = [{
                            episode: "Film",
                            rating: Number(anime.rating)
                        }]
                    }
                }
            }

            if (epsToUse.length > 0) {
                const seasonStart = currentIndex
                epsToUse.forEach(ep => {
                    allEpisodes.push({
                        index: currentIndex + 1, // 1-based index
                        rating: ep.rating,
                        epName: ep.episode,
                        animeName: anime.name,
                        seasonName: cleanSeasonLabel(anime.name, selectedSeries)
                    })
                    currentIndex++
                })
                const seasonEnd = currentIndex
                seasonBoundaries.push({
                    start: seasonStart,
                    end: seasonEnd,
                    label: cleanSeasonLabel(anime.name, selectedSeries)
                })
            }
        })

        return { episodes: allEpisodes, boundaries: seasonBoundaries }
    }, [selectedSeries, episodeRatings, categoryRatings, seriesGroups, viewMode])

    // Previous & Next episode navigation inside series timeline
    const { hasPrevEp, hasNextEp, handlePrevEp, handleNextEp } = useMemo(() => {
        if (!selectedTimelineEp || !seriesTimelineData || !seriesTimelineData.episodes) {
            return { hasPrevEp: false, hasNextEp: false, handlePrevEp: () => {}, handleNextEp: () => {} }
        }
        const episodes = seriesTimelineData.episodes
        const currentIndex = episodes.findIndex(ep => ep.index === selectedTimelineEp.index)
        
        return {
            hasPrevEp: currentIndex > 0,
            hasNextEp: currentIndex >= 0 && currentIndex < episodes.length - 1,
            handlePrevEp: () => {
                if (currentIndex > 0) {
                    setSelectedTimelineEp(episodes[currentIndex - 1])
                }
            },
            handleNextEp: () => {
                if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
                    setSelectedTimelineEp(episodes[currentIndex + 1])
                }
            }
        }
    }, [selectedTimelineEp, seriesTimelineData])

    const getPointColor = (rating) => {
        if (rating >= 9.75) return 'rgb(29, 161, 242)' // Cinema (light blue)
        if (rating >= 9.0) return 'rgb(24, 106, 59)'   // Awesome (dark green)
        if (rating >= 8.0) return 'rgb(40, 180, 99)'   // Great (green)
        if (rating >= 7.0) return 'rgb(244, 208, 63)'  // Good (yellow)
        if (rating >= 6.0) return 'rgb(243, 156, 18)'  // Regular (orange)
        if (rating >= 5.0) return 'rgb(99, 57, 116)'   // Bad (purple)
        return 'rgb(239, 68, 68)'                      // Garbage (red)
    }

    const getPointTextColor = (rating) => {
        if (rating >= 9.0 && rating < 9.75) return '#fff' // Dark green -> white
        if (rating >= 5.0 && rating < 6.0) return '#fff'  // Purple -> white
        if (rating < 5.0) return '#fff'                   // Red -> white
        return '#000'                                     // Light blue, green, yellow, orange -> black
    }

    const timelineChartData = useMemo(() => {
        if (!seriesTimelineData || seriesTimelineData.episodes.length === 0) return null
        const { episodes } = seriesTimelineData

        const getActiveRating = (ep) => {
            if (ratingSource === 'moje') {
                return ep.rating
            }
            if (ratingSource === 'imdb') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const imdbAnime = imdbCache[String(malId)]
                        if (imdbAnime && imdbAnime.episodes) {
                            const score = imdbAnime.episodes[ep.epName] || imdbAnime.episodes["Film"] || imdbAnime.episodes["OVA"] || imdbAnime.episodes["Speciál"] || imdbAnime.episodes["EP 1"]
                            if (score) return score
                        }
                    }
                }
                return null
            }
            if (ratingSource === 'mal') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const malEps = franchiseJikanCache[String(malId)]
                        if (malEps) {
                            const epMatch = ep.epName.match(/EP\s*(\d+)/i)
                            const epNum = epMatch ? parseInt(epMatch[1], 10) : (ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1 ? 1 : null)
                            const malEp = epNum ? malEps.find(e => e.mal_id === epNum) : null
                            if (malEp && malEp.score) {
                                const isMovieOrOVA = ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1
                                return isMovieOrOVA ? malEp.score / 2 : malEp.score
                            }
                        }
                    }
                }
                return null
            }
            return null
        }

        const activePoints = episodes.map(ep => {
            const yVal = getActiveRating(ep)
            return { x: ep.index, y: yVal }
        })

        const pointColors = activePoints.map(pt => {
            if (pt.y === null) return 'rgba(255, 255, 255, 0.2)'
            const colorRating = ratingSource === 'mal' ? pt.y * 2 : pt.y
            return getPointColor(colorRating)
        })

        let trendData = []
        if (episodes.length > 1) {
            const validPoints = activePoints.filter(pt => pt.y !== null)
            if (validPoints.length > 1) {
                const dataPoints = activePoints.map(pt => [pt.x, pt.y])
                const windowSize = Math.max(5, Math.min(13, (Math.round(dataPoints.length / 7.5) | 1)))
                const half = Math.floor(windowSize / 2)
                
                trendData = dataPoints.map((dp, idx) => {
                    if (dp[1] === null) return null
                    let sum = 0
                    let count = 0
                    for (let i = -half; i <= half; i++) {
                        const checkIdx = idx + i
                        if (checkIdx >= 0 && checkIdx < dataPoints.length && dataPoints[checkIdx][1] !== null) {
                            const weight = 1 - Math.abs(i) / (half + 1)
                            sum += dataPoints[checkIdx][1] * weight
                            count += weight
                        }
                    }
                    return count > 0 ? (sum / count) : null
                })
            }
        }

        const datasets = []

        if (showTrendLine && trendData.length > 0) {
            datasets.push({
                type: 'line',
                label: 'Trend',
                data: episodes.map((ep, i) => ({ x: ep.index, y: trendData[i] })),
                borderColor: 'rgba(255, 255, 255, 0.55)',
                borderWidth: 2.8,
                pointRadius: 0,
                fill: false,
                tension: 0.45,
                showLine: true
            })
        }

        const sourceLabels = {
            'moje': 'Moje hodnocení',
            'mal': 'MAL hodnocení',
            'imdb': 'IMDb hodnocení'
        }
        const activeLabel = sourceLabels[ratingSource] || 'Hodnocení'

        let lineColor = 'rgba(255, 255, 255, 0.15)'
        if (ratingSource === 'imdb') lineColor = 'rgba(245, 197, 24, 0.25)'
        else if (ratingSource === 'mal') lineColor = 'rgba(46, 81, 162, 0.3)'

        datasets.push({
            type: 'line',
            label: activeLabel,
            data: activePoints,
            borderColor: lineColor,
            borderWidth: 1.5,
            tension: 0.15,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            pointRadius: 5.5,
            pointHoverRadius: 7.5,
            showLine: true
        })

        return {
            labels: episodes.map(ep => `${ep.seasonName} ${ep.epName}`),
            datasets
        }
    }, [seriesTimelineData, showTrendLine, ratingSource, franchiseJikanCache, selectedTimelineEp, imdbCache, animeList])

    // Custom Plugin for Season Boundaries and Labels on Chart.js
    const seasonBoundariesPlugin = useMemo(() => {
        return {
            id: 'seasonBoundaries',
            beforeDraw: (chart) => {
                const { ctx, chartArea, scales } = chart
                if (!ctx || !chartArea || !scales || !scales.x) return
                const { top, bottom } = chartArea
                const { x } = scales
                const boundaries = chart.options.plugins.seasonBoundaries?.boundaries || []
                
                ctx.save()
                boundaries.forEach((b, i) => {
                    const startX = x.getPixelForValue(b.start + 0.5)
                    const endX = x.getPixelForValue(b.end + 0.5)
                    
                    // Draw alternating background band
                    if (i % 2 === 0) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.015)'
                    } else {
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
                    }
                    ctx.fillRect(startX, top, endX - startX, bottom - top)
                })
                ctx.restore()
            },
            afterDraw: (chart) => {
                const { ctx, chartArea, scales } = chart
                if (!ctx || !chartArea || !scales || !scales.x || !scales.y) return
                const { top, bottom } = chartArea
                const { x } = scales
                const boundaries = chart.options.plugins.seasonBoundaries?.boundaries || []
                
                ctx.save()
                boundaries.forEach((b, i) => {
                    // Draw boundary line
                    if (i < boundaries.length - 1) {
                        const lineX = x.getPixelForValue(b.end + 0.5)
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
                        ctx.lineWidth = 1
                        ctx.setLineDash([5, 5])
                        ctx.beginPath()
                        ctx.moveTo(lineX, top)
                        ctx.lineTo(lineX, bottom)
                        ctx.stroke()
                    }

                    // Draw label S1, S2 near the bottom right above x axis
                    const startX = x.getPixelForValue(b.start + 0.5)
                    const endX = x.getPixelForValue(b.end + 0.5)
                    const centerX = (startX + endX) / 2
                    const columnWidth = endX - startX

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
                    ctx.font = 'bold 10px var(--font-sans, sans-serif)'
                    ctx.textAlign = 'center'

                    if (columnWidth > 12) {
                        const textWidth = ctx.measureText(b.label).width
                        if (textWidth > columnWidth - 4) {
                            const ratio = (columnWidth - 4) / textWidth
                            const chars = Math.floor(ratio * b.label.length)
                            const truncated = chars > 3 
                                ? b.label.substring(0, chars - 2) + '..' 
                                : b.label.substring(0, 1) + '.'
                            ctx.fillText(truncated, centerX, bottom - 12)
                        } else {
                            ctx.fillText(b.label, centerX, bottom - 12)
                        }
                    }
                })
                ctx.restore()

                // Draw red vertical arrow pointing from above at the selected episode point
                const activeEp = selectedTimelineEpRef.current
                if (activeEp) {
                    const xVal = parseInt(activeEp.index, 10)
                    const ratingDataset = chart.data.datasets.find(ds => ds.label !== 'Trend')
                    let yVal = null
                    if (ratingDataset && ratingDataset.data) {
                        const pt = ratingDataset.data.find(d => d.x === xVal)
                        if (pt && pt.y !== null && pt.y !== undefined) {
                            yVal = pt.y
                        }
                    }

                    if (yVal !== null && !isNaN(xVal) && xVal >= scales.x.min && xVal <= scales.x.max) {
                        const xPixel = scales.x.getPixelForValue(xVal)
                        const yPixel = scales.y.getPixelForValue(yVal)

                        const arrowTipY = yPixel - 6
                        const arrowheadBaseY = yPixel - 14
                        const arrowShaftStartY = Math.max(top + 2, yPixel - 32)

                        ctx.save()
                        ctx.strokeStyle = 'rgb(239, 68, 68)'
                        ctx.fillStyle = 'rgb(239, 68, 68)'
                        ctx.lineWidth = 2.5

                        // Draw arrowhead (pointing down)
                        ctx.beginPath()
                        ctx.moveTo(xPixel - 5, arrowheadBaseY)
                        ctx.lineTo(xPixel + 5, arrowheadBaseY)
                        ctx.lineTo(xPixel, arrowTipY)
                        ctx.closePath()
                        ctx.fill()

                        // Draw arrow shaft if there is enough space
                        if (arrowShaftStartY < arrowheadBaseY) {
                            ctx.beginPath()
                            ctx.moveTo(xPixel, arrowShaftStartY)
                            ctx.lineTo(xPixel, arrowheadBaseY)
                            ctx.stroke()
                        }

                        ctx.restore()
                    }
                }
            }
        }
    }, [])

    const yAxisMin = useMemo(() => {
        if (!seriesTimelineData || seriesTimelineData.episodes.length === 0) {
            return ratingSource === 'mal' ? 2.0 : 4.75
        }
        
        const getActiveRating = (ep) => {
            if (ratingSource === 'moje') {
                return ep.rating
            }
            if (ratingSource === 'imdb') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const imdbAnime = imdbCache[String(malId)]
                        if (imdbAnime && imdbAnime.episodes) {
                            const score = imdbAnime.episodes[ep.epName] || imdbAnime.episodes["Film"] || imdbAnime.episodes["OVA"] || imdbAnime.episodes["Speciál"] || imdbAnime.episodes["EP 1"]
                            if (score) return score
                        }
                    }
                }
                return null
            }
            if (ratingSource === 'mal') {
                const anime = animeList.find(a => a.name === ep.animeName)
                if (anime && anime.mal_url) {
                    const malId = extractMalId(anime.mal_url)
                    if (malId) {
                        const malEps = franchiseJikanCache[String(malId)]
                        if (malEps) {
                            const epMatch = ep.epName.match(/EP\s*(\d+)/i)
                            const epNum = epMatch ? parseInt(epMatch[1], 10) : (ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1 ? 1 : null)
                            const malEp = epNum ? malEps.find(e => e.mal_id === epNum) : null
                            if (malEp && malEp.score) {
                                const isMovieOrOVA = ep.epName === 'Film' || ep.epName === 'OVA' || malEps.length === 1
                                return isMovieOrOVA ? malEp.score / 2 : malEp.score
                            }
                        }
                    }
                }
                return null
            }
            return null
        }

        const ratings = seriesTimelineData.episodes
            .map(ep => getActiveRating(ep))
            .filter(r => r !== null && !isNaN(r) && r > 0)

        if (ratings.length === 0) {
            return ratingSource === 'mal' ? 2.0 : 4.75
        }
        const minVal = Math.min(...ratings)
        const floorMin = Math.max(0, Math.floor(minVal - 1.0))
        return floorMin
    }, [seriesTimelineData, ratingSource, animeList, imdbCache, franchiseJikanCache])

    const timelineOptions = useMemo(() => {
        if (!seriesTimelineData) return {}
        return {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements, chart) => {
                const activeElements = chart.getElementsAtEventForMode(
                    event.native,
                    'nearest',
                    { intersect: false },
                    true
                )
                if (activeElements && activeElements.length > 0) {
                    const element = activeElements[0]
                    const ep = seriesTimelineData?.episodes?.[element.index]
                    if (ep) {
                        setSelectedTimelineEp(ep)
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0.5,
                    max: seriesTimelineData.episodes.length + 0.5,
                    ticks: {
                        stepSize: 1,
                        color: 'rgba(255,255,255,0.6)',
                        font: { size: 9 },
                        callback: (value) => {
                            const ep = seriesTimelineData.episodes.find(e => e.index === value)
                            if (!ep) return ''
                            const total = seriesTimelineData.episodes.length
                            if (total > 50 && value % 5 !== 0) return ''
                            if (total > 100 && value % 10 !== 0) return ''
                            return ep.epName
                        }
                    },
                    grid: { display: false }
                },
                y: {
                    min: yAxisMin,
                    max: ratingSource === 'mal' ? 5.25 : 10.25,
                    ticks: {
                        color: 'rgba(255,255,255,0.6)',
                        font: { size: 10 },
                        stepSize: ratingSource === 'mal' ? 0.25 : 0.5,
                        callback: (value) => {
                            if (ratingSource === 'mal' && value > 5) return ''
                            if (ratingSource !== 'mal' && value > 10) return ''
                            return ratingSource === 'mal'
                                ? value.toFixed(2).replace('.', ',')
                                : value.toFixed(1).replace('.', ',')
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(255,255,255,0.04)',
                        borderDash: [5, 5]
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const datasetLabel = ctx.dataset.label
                            if (datasetLabel === 'Trend') return 'Trend'
                            const ep = seriesTimelineData.episodes[ctx.dataIndex]
                            if (!ep) return ''
                            const score = ctx.raw && ctx.raw.y !== undefined ? ctx.raw.y : null
                            if (score === null) return `${ep.animeName} - ${ep.epName}: N/A`
                            
                            if (ratingSource === 'moje') {
                                return `${ep.animeName} - ${ep.epName} (Moje): ${score}`
                            } else if (ratingSource === 'mal') {
                                return `${ep.animeName} - ${ep.epName} (MAL): ${score.toFixed(2)}`
                            } else {
                                return `${ep.animeName} - ${ep.epName} (IMDb): ${score.toFixed(2)}`
                            }
                        }
                    }
                },
                seasonBoundaries: {
                    boundaries: seriesTimelineData.boundaries
                }
            }
        }
    }, [seriesTimelineData, showTrendLine, yAxisMin, selectedTimelineEp, ratingSource])

    // ============================================
    // ROW 1 DATA MEMOIZATION (INDIVIDUAL)
    // ============================================
    const row1AnimeList = useMemo(() => {
        if (!searchQuery) return animeList
        const lowerSearch = searchQuery.toLowerCase()
        return animeList.filter(a => a.name.toLowerCase().includes(lowerSearch))
    }, [animeList, searchQuery])

    const selectedAnimeObj = useMemo(() => {
        return animeList.find(a => a.name === selectedAnimeTitle) || null
    }, [animeList, selectedAnimeTitle])

    const selectedAnimeCategories = useMemo(() => {
        const found = categoryRatings.find(cr => cr.name === selectedAnimeTitle)
        return found ? found.categories : null
    }, [categoryRatings, selectedAnimeTitle])

    const selectedAnimeEpisodes = useMemo(() => {
        const found = episodeRatings.find(er => er.name === selectedAnimeTitle)
        return found ? found.episodes : null
    }, [episodeRatings, selectedAnimeTitle])

    const selectedAnimeNote = useMemo(() => {
        const found = notes.find(n => n.name === selectedAnimeTitle)
        return found ? found.note : null
    }, [notes, selectedAnimeTitle])

    const avgCategoryRating = useMemo(() => {
        if (!selectedAnimeCategories) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(selectedAnimeCategories).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : 'N/A'
    }, [selectedAnimeCategories])

    // Radar Chart Data & Options (Individual)
    const radarData = useMemo(() => {
        if (!selectedAnimeCategories) return null
        const categoriesUrls = Object.keys(selectedAnimeCategories)
        const labels = categoriesUrls.map(c => `${c}|(v. ${categoryWeights[c] || 1})`)
        const values = Object.values(selectedAnimeCategories)
        return {
            labels: labels,
            datasets: [{
                label: 'Hodnocení',
                data: values,
                backgroundColor: 'rgba(99, 102, 241, 0.3)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                pointBorderColor: '#fff',
            }]
        }
    }, [selectedAnimeCategories])

    const radarMin = useMemo(() => {
        if (!selectedAnimeCategories) return 0
        const values = Object.values(selectedAnimeCategories)
        const minVal = values.length > 0 ? Math.min(...values) : 0
        return Math.max(0, Math.floor(minVal - 1))
    }, [selectedAnimeCategories])

    const radarOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            r: {
                beginAtZero: false,
                min: radarMin,
                max: 10,
                ticks: { stepSize: 1, color: 'rgba(255,255,255,0.85)', backdropColor: 'rgba(0,0,0,0.5)', font: { size: 10 } },
                grid: { color: 'rgba(255,255,255,0.15)' },
                angleLines: { color: 'rgba(255,255,255,0.15)' },
                pointLabels: {
                    color: 'rgba(255,255,255,0.9)', font: { size: 11 },
                    callback: (label) => label.includes('|') ? label.split('|') : label
                }
            }
        },
        plugins: { legend: { display: false } }
    }

    // Episode Bar Chart Data (Individual)
    const episodeChartData = useMemo(() => {
        if (!selectedAnimeEpisodes || selectedAnimeEpisodes.length === 0) return null
        const dataPoints = selectedAnimeEpisodes.map((ep, i) => [i + 1, ep.rating])
        let trendData = []
        if (dataPoints.length > 1) {
            const result = regression.polynomial(dataPoints, { order: 6, precision: 10 })
            trendData = dataPoints.map(p => result.predict(p[0])[1])
        }
        return {
            labels: selectedAnimeEpisodes.map(ep => ep.episode),
            datasets: [
                { type: 'line', label: 'Polyn. (Celkem)', data: trendData, borderColor: 'rgb(255, 0, 0)', borderWidth: 2, pointRadius: 0, fill: false, tension: 0.4 },
                {
                    type: 'bar', label: 'Hodnocení epizody', data: selectedAnimeEpisodes.map(ep => ep.rating),
                    backgroundColor: selectedAnimeEpisodes.map(ep => getPointColor(ep.rating)),
                    borderRadius: 4
                }
            ]
        }
    }, [selectedAnimeEpisodes])

    const episodeBarOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: { min: 4.75, max: 10, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    // ============================================
    // ROW 2 DATA MEMOIZATION
    // ============================================
    const polozkyOptions = useMemo(() => {
        if (slicerTyp === 'Kategorie') return Object.keys(categoryWeights)
        if (slicerTyp === 'Epizoda') {
            const eps = new Set()
            episodeRatings.forEach(a => a.episodes.forEach(e => eps.add(e.episode)))
            return Array.from(eps).sort((a,b) => (parseInt(a.replace('EP ', ''))||0) - (parseInt(b.replace('EP ', ''))||0))
        }
        return []
    }, [slicerTyp, episodeRatings])

    useEffect(() => {
        if (slicerTyp === 'Kategorie') setSlicerPolozka('Vedlejší postavy')
        else if (slicerTyp === 'Epizoda') setSlicerPolozka('EP 1')
        setSlicerHodnoceni('Všechna')
    }, [slicerTyp])

    const hodnoceniOptions = useMemo(() => {
        const ratings = new Set()
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                if (a.categories && a.categories[slicerPolozka] !== undefined) ratings.add(a.categories[slicerPolozka])
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) ratings.add(ep.rating)
            })
        }
        return ['Všechna', ...Array.from(ratings).sort((a,b) => b - a)]
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka])

    const row2FilteredAnime = useMemo(() => {
        const results = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => {
                const r = a.categories ? a.categories[slicerPolozka] : undefined
                if (r !== undefined) {
                    if (slicerHodnoceni === 'Všechna' || r === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: r })
                }
            })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => {
                const ep = a.episodes.find(e => e.episode === slicerPolozka)
                if (ep) {
                    if (slicerHodnoceni === 'Všechna' || ep.rating === Number(slicerHodnoceni)) results.push({ name: a.name, hodnoceni: ep.rating })
                }
            })
        }
        return results.sort((a,b) => b.hodnoceni - a.hodnoceni)
    }, [categoryRatings, episodeRatings, slicerTyp, slicerPolozka, slicerHodnoceni])

    const correlationChartData = useMemo(() => {
        const dataPoints = []
        const scatterData = []
        let minX = 10, maxX = 0, minY = 10, maxY = 0

        row2FilteredAnime.forEach(item => {
            const animeObj = animeList.find(a => a.name === item.name)
            if (animeObj && animeObj.rating && !isNaN(Number(animeObj.rating))) {
                const fh = Number(animeObj.rating)
                const val = item.hodnoceni
                dataPoints.push([fh, val])
                scatterData.push({ x: fh, y: val, label: item.name })
                
                if (fh < minX) minX = fh
                if (fh > maxX) maxX = fh
                if (val < minY) minY = val
                if (val > maxY) maxY = val
            }
        })

        if (dataPoints.length === 0) return null

        const result = regression.linear(dataPoints, { precision: 4 })
        const r2 = result.r2
        const lineData = [ { x: minX, y: result.predict(minX)[1] }, { x: maxX, y: result.predict(maxX)[1] } ]

        return {
            data: {
                datasets: [
                    { type: 'line', label: `Regrese (R² = ${r2.toLocaleString('cs-CZ')})`, data: lineData, borderColor: 'rgba(255, 0, 0, 0.8)', borderWidth: 2, fill: false, pointRadius: 0 },
                    { type: 'scatter', label: 'Anime', data: scatterData, backgroundColor: 'rgba(239, 68, 68, 0.8)', pointRadius: 4, pointHoverRadius: 6 }
                ]
            },
            r2,
            minX: 5,
            minY: 5
        }
    }, [row2FilteredAnime, animeList])

    const correlationChartOptions = useMemo(() => {
        if (!correlationChartData) return {}
        return {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: 'FH', color: 'rgba(255,255,255,0.6)' }, min: correlationChartData.minX, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { title: { display: true, text: `Hodnocení ${slicerPolozka}`, color: 'rgba(255,255,255,0.6)' }, min: correlationChartData.minY, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label}: (${ctx.raw.x}, ${ctx.raw.y})` } }
            }
        }
    }, [correlationChartData, slicerPolozka])

    const histogramData = useMemo(() => {
        const counts = {}
        for (let i = 5.0; i <= 10.0; i += 0.5) counts[i.toFixed(1)] = 0

        const sourceList = []
        if (slicerTyp === 'Kategorie') {
            categoryRatings.forEach(a => { const r = a.categories ? a.categories[slicerPolozka] : undefined; if (r !== undefined) sourceList.push(r) })
        } else if (slicerTyp === 'Epizoda') {
            episodeRatings.forEach(a => { const ep = a.episodes.find(e => e.episode === slicerPolozka); if (ep) sourceList.push(ep.rating) })
        }

        sourceList.forEach(r => {
            let bin = 5.0
            if (r >= 10) bin = 10.0
            else if (r >= 9.5) bin = 9.5
            else if (r >= 9.0) bin = 9.0
            else if (r >= 8.5) bin = 8.5
            else if (r >= 8.0) bin = 8.0
            else if (r >= 7.5) bin = 7.5
            else if (r >= 7.0) bin = 7.0
            else if (r >= 6.5) bin = 6.5
            else if (r >= 6.0) bin = 6.0
            else if (r >= 5.5) bin = 5.5
            counts[bin.toFixed(1)]++
        })

        const labels = Object.keys(counts).sort((a,b) => Number(a) - Number(b)).map(l => l.replace('.', ','))
        const data = labels.map(l => counts[l.replace(',', '.')])

        return {
            labels,
            datasets: [{
                label: 'Počet anime',
                data,
                backgroundColor: labels.map(l => {
                    const r = Number(l.replace(',', '.'))
                    if (r >= 9.5) return 'rgb(29, 161, 242)'
                    if (r >= 8.5) return 'rgb(24, 106, 59)'
                    if (r >= 7.5) return 'rgb(40, 180, 99)'
                    if (r >= 6.5) return 'rgb(244, 208, 63)'
                    if (r >= 5.5) return 'rgb(243, 156, 18)'
                    return 'rgba(239, 68, 68, 0.7)'
                }),
                borderRadius: 2
            }]
        }
    }, [slicerTyp, slicerPolozka, categoryRatings, episodeRatings])

    const histogramOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            y: { ticks: { beginAtZero: true, color: 'rgba(255,255,255,0.6)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { title: { display: true, text: 'Hodnocení (Intervaly po 0,5)', color: 'rgba(255,255,255,0.6)' }, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    // ============================================
    // ROW 3 DATA MEMOIZATION
    // ============================================
    const hypeChartData = useMemo(() => {
        const xCats = ["Animace", "CGI", "OP", "ED", "OST"]
        const yCats = ["Plot", "Pacing", "Story Conclusion", "Emoce", "Originalita"]
        const scatterData = []

        categoryRatings.forEach(a => {
            if (!a.categories) return
            
            let xSum = 0, xCount = 0
            xCats.forEach(c => { if (a.categories[c] !== undefined) { xSum += a.categories[c]; xCount++; } })
            
            let ySum = 0, yCount = 0
            yCats.forEach(c => { if (a.categories[c] !== undefined) { ySum += a.categories[c]; yCount++; } })

            const enjoyment = a.categories["Enjoyment"]

            if (xCount > 0 && yCount > 0 && enjoyment !== undefined) {
                const xVal = xSum / xCount
                const yVal = ySum / yCount
                let color = 'rgba(239, 68, 68, 0.8)'
                
                const animeObj = animeList.find(al => al.name === a.name)
                if (animeObj && animeObj.rating) {
                    const fh = Number(animeObj.rating)
                    if (fh >= 9.5) color = 'rgba(29, 161, 242, 0.8)'
                    else if (fh >= 8.5) color = 'rgba(40, 180, 99, 0.8)'
                    else if (fh >= 7.5) color = 'rgba(244, 208, 63, 0.8)'
                }

                scatterData.push({
                    x: xVal, y: yVal,
                    r: Math.max(3, (enjoyment - 4) * 2), // Bubble scale
                    label: a.name, color, enjoyment
                })
            }
        })

        return {
            datasets: [{
                label: 'Anime',
                data: scatterData,
                backgroundColor: scatterData.map(d => d.color),
                borderColor: 'rgba(255,255,255,0.2)',
                borderWidth: 1
            }]
        }
    }, [categoryRatings, animeList])

    const hypeChartOptions = {
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Technická kvalita (Animace + CGI + OP + ED + OST)', color: 'rgba(255,255,255,0.6)' }, min: 5.5, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { title: { display: true, text: 'Hloubka (Plot + Pacing + Story + Emoce + Originalita)', color: 'rgba(255,255,255,0.6)' }, min: 5.5, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
        },
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.raw.label} (Enjoyment: ${ctx.raw.enjoyment})` } }
        }
    }

    const leaderboardChartData = useMemo(() => {
        let items = []
        if (lbTyp === 'Epizody') {
            episodeRatings.forEach(a => {
                if (a.episodes && a.episodes.length > 0) {
                    const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                    items.push({ name: a.name, val: sum / a.episodes.length })
                }
            })
        } else {
            categoryRatings.forEach(a => {
                if (a.categories) {
                    const keys = Object.keys(a.categories)
                    if (keys.length > 0) {
                        const sum = keys.reduce((acc, k) => acc + a.categories[k], 0)
                        items.push({ name: a.name, val: sum / keys.length })
                    }
                }
            })
        }

        if (lbSort === 'Nejlepší') items.sort((a,b) => b.val - a.val)
        else items.sort((a,b) => a.val - b.val)

        items = items.slice(0, lbCount)

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: `AVG (${lbTyp})`,
                data: items.map(i => i.val),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings, categoryRatings, lbTyp, lbSort, lbCount])

    const leaderboardOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
            x: { min: lbSort === 'Nejlepší' ? 6 : undefined, max: 10, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    const unstableChartData = useMemo(() => {
        let items = []
        episodeRatings.forEach(a => {
            if (a.episodes && a.episodes.length > 1) {
                const sum = a.episodes.reduce((acc, ep) => acc + ep.rating, 0)
                const avg = sum / a.episodes.length
                const absDevSum = a.episodes.reduce((acc, ep) => acc + Math.abs(ep.rating - avg), 0)
                items.push({ name: a.name, val: absDevSum / a.episodes.length })
            }
        })

        items.sort((a,b) => b.val - a.val).slice(0, 30) // Top 30

        return {
            labels: items.map(i => i.name),
            datasets: [{
                label: 'Odchylka EPs',
                data: items.map(i => i.val),
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderRadius: 4
            }]
        }
    }, [episodeRatings])

    const unstableOptions = {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: 'Průměrná odchylka', color: 'rgba(255,255,255,0.6)' }, ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 10 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
    }

    if (loading) return <div className="fade-in" style={{ padding: 'var(--spacing-lg)' }}><h2>Načítám parametry a hodnocení...</h2></div>

    // ============================================
    // VIEW 1: DIAGONAL SPLIT SCREEN (LANDING)
    // ============================================
    return (
        <div className="ratings-page fade-in">
            {viewMode === 'split' ? (
                <div className="ratings-choice-container fade-in">
                    {/* Glowing Diagonal Divider */}
                    <div className="choice-divider"></div>
                    
                    {/* LEFT HALF: JEDNOTLIVĚ (INDIVIDUAL ANIME) */}
                    <div className="choice-pane choice-individual" onClick={() => setViewMode('individual')}>
                        {/* Rotating Magic Summoning Circle */}
                        <svg className="magic-circle" width="360" height="360" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                            <circle cx="50" cy="50" r="46" strokeWidth="0.5" strokeDasharray="2 2" />
                            <circle cx="50" cy="50" r="42" strokeWidth="0.8" />
                            <circle cx="50" cy="50" r="38" strokeWidth="0.4" strokeDasharray="6 3" />
                            <polygon points="50,15 80,68 20,68" strokeWidth="0.6" />
                            <polygon points="50,85 80,32 20,32" strokeWidth="0.6" />
                            <circle cx="50" cy="50" r="18" strokeWidth="0.8" />
                            <circle cx="50" cy="50" r="14" strokeWidth="0.4" strokeDasharray="1 1" />
                        </svg>

                        {/* Floating Background Icons */}
                        <div className="float-bg float-bg-1">
                            <svg width="45" height="45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                        </div>
                        <div className="float-bg float-bg-2">
                            <svg width="35" height="35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.243.588 1.81l-3.974 2.89a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.89a1 1 0 00-1.176 0l-3.976 2.89c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 9.42c-.771-.567-.372-1.81.588-1.81h4.908a1 1 0 00.95-.69l1.519-4.674z" />
                            </svg>
                        </div>
                        
                        <div className="choice-card">
                            <div className="choice-icon-wrapper">📋</div>
                            <h2 className="choice-title">HODNOCENÍ JEDNOTLIVĚ</h2>
                            <div className="choice-subtitle">EPISODES • RADARS • CORRELATIONS</div>
                            <p className="choice-desc">Tradiční detailní pohled na každé anime samostatně s komplexními parametry, radarem a recenzemi.</p>
                            <button className="choice-btn">Vstoupit do tabulek →</button>
                        </div>
                    </div>

                    {/* RIGHT HALF: SÉRIE (SERIES LEVEL VIEW) */}
                    <div className="choice-pane choice-series" onClick={() => setViewMode('series')}>
                        {/* Rotating Cyber Hexagon Tech Circle */}
                        <svg className="cyber-grid" width="360" height="360" viewBox="0 0 100 100" fill="none" stroke="currentColor">
                            <circle cx="50" cy="50" r="46" strokeWidth="0.5" strokeDasharray="4 4" />
                            <circle cx="50" cy="50" r="40" strokeWidth="0.8" />
                            <polygon points="50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30" strokeWidth="0.4" strokeDasharray="2 2" />
                            <polygon points="50,18 77.7,34 77.7,66 50,82 22.3,66 22.3,34" strokeWidth="0.6" />
                            <circle cx="50" cy="50" r="12" strokeWidth="0.8" />
                            <line x1="50" y1="10" x2="50" y2="90" strokeWidth="0.3" strokeDasharray="3 3" />
                            <line x1="15.4" y1="30" x2="84.6" y2="70" strokeWidth="0.3" strokeDasharray="3 3" />
                            <line x1="15.4" y1="70" x2="84.6" y2="30" strokeWidth="0.3" strokeDasharray="3 3" />
                        </svg>

                        {/* Floating Background Icons */}
                        <div className="float-bg float-bg-3">
                            <svg width="45" height="45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                            </svg>
                        </div>
                        <div className="float-bg float-bg-4">
                            <svg width="35" height="35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                            </svg>
                        </div>

                        <div className="choice-card">
                            <div className="choice-icon-wrapper">📚</div>
                            <h2 className="choice-title">HODNOCENÍ SÉRIÍ</h2>
                            <div className="choice-subtitle">TIMELINES • SEASONS • WEIGHTED AVERAGES</div>
                            <p className="choice-desc">Pokročilé vizuální zobrazení seskupených sezón s průměrnými radary a spojenou časovou osou epizod.</p>
                            <button className="choice-btn">Vstoupit do sérií →</button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Navigation action tabs */}
                    <div className="ratings-header-container">
                        <h1 style={{ margin: 0 }}>Anime Hodnocení a Analýza</h1>
                        <div className="ratings-header-actions">
                            <button className="btn-nav" onClick={() => setViewMode('split')}>🧩 Rozcestník</button>
                            <button className={`btn-nav ${viewMode === 'series' ? 'active' : ''}`} onClick={() => setViewMode('series')}>📚 Série</button>
                            <button className={`btn-nav ${viewMode === 'individual' ? 'active' : ''}`} onClick={() => setViewMode('individual')}>📋 Jednotlivě</button>
                        </div>
                    </div>

            {/* ============================================
                VIEW 2: SERIES RATINGS VIEW
                ============================================ */}
            {viewMode === 'series' && (
                <div className="ratings-row row-1 fade-in">
                    {/* 1. Selector sérií (Left) */}
                    <div className="ratings-panel left-panel">
                        <h3 className="ratings-panel-title">Vyberte Sérii</h3>
                        <input
                            type="text"
                            className="anime-selector-search"
                            placeholder="Hledat sérii..."
                            value={searchQuerySeries}
                            onChange={(e) => setSearchQuerySeries(e.target.value)}
                        />
                        <div className="anime-selector-list">
                            {filteredSeriesList.map(s => (
                                <div
                                    key={s.name}
                                    className={`anime-selector-item ${selectedSeries === s.name ? 'active' : ''}`}
                                    onClick={() => setSelectedSeries(s.name)}
                                >
                                    <div className="selector-item-content">
                                        <span className="selector-item-name">{s.name}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                            {s.items.length} {s.items.length === 1 ? 'část' : (s.items.length < 5 ? 'části' : 'částí')}
                                        </span>
                                    </div>
                                    <div className="selector-item-rating" style={{ color: 'var(--accent-pink)' }}>
                                        {s.avgRating > 0 ? s.avgRating.toFixed(2) : '?'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. Series Detail Center & Right Panel */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grid)', minWidth: 0 }}>
                        {/* A. Hlavička Série */}
                        {selectedSeriesObj && (
                            <div className="series-header-card">
                                {selectedSeriesObj.thumbnail ? (
                                    <img
                                        src={selectedSeriesObj.thumbnail}
                                        alt={selectedSeriesObj.name}
                                        className="series-header-poster"
                                        onError={(e) => { e.target.src = 'placeholder.jpg'; e.target.style.display = 'none'; }}
                                    />
                                ) : (
                                    <div className="series-header-poster" style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-secondary)', fontSize:'1.5rem' }}>🎬</div>
                                )}
                                <div className="series-header-info">
                                    <h2 className="series-header-title">{selectedSeriesObj.name}</h2>
                                    <div className="series-header-meta">
                                        <span className="badge badge-primary" style={{ background: 'var(--accent-pink)' }}>
                                            Vážený průměr FH: {selectedSeriesObj.avgRating > 0 ? selectedSeriesObj.avgRating.toFixed(2) : 'N/A'}
                                        </span>
                                        <span className="badge" style={{ background: 'var(--bg-secondary)' }}>
                                            Epizod celkem: {selectedSeriesObj.totalEps}
                                        </span>
                                        {selectedSeriesObj.studios.length > 0 && (
                                            <span className="badge" style={{ background: 'var(--bg-secondary)' }}>
                                                Studio: {selectedSeriesObj.studios.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* B. Přepínač zobrazení sérií */}
                        <div className="series-tabs-container">
                            <button
                                className={`series-tab-btn ${seriesTab === 'timeline' ? 'active' : ''}`}
                                onClick={() => setSeriesTab('timeline')}
                            >
                                📈 Spojená osa epizod (Timeline)
                            </button>
                            <button
                                className={`series-tab-btn ${seriesTab === 'details' ? 'active' : ''}`}
                                onClick={() => setSeriesTab('details')}
                            >
                                📂 Detaily sezón & Radar
                            </button>
                        </div>

                        {/* C. Vizualizační plocha */}
                        <div className="ratings-row" style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
                            {seriesTab === 'timeline' ? (
                                <>
                                    <div className="ratings-panel" style={{ flex: 1, height: '500px', minWidth: 0 }}>
                                        <h3 className="ratings-panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Spojitý vývoj hodnocení epizod</span>
                                            <div className="chart-toggles-container" style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Zdroj:</span>
                                                    <select
                                                        value={ratingSource}
                                                        onChange={(e) => setRatingSource(e.target.value)}
                                                        className="slicer-select"
                                                        style={{
                                                            background: 'var(--bg-tertiary)',
                                                            border: '1px solid var(--border-color)',
                                                            color: 'var(--text-primary)',
                                                            borderRadius: 'var(--radius-md)',
                                                            padding: '4px 8px',
                                                            fontSize: '0.8rem',
                                                            cursor: 'pointer',
                                                            outline: 'none',
                                                            width: 'auto'
                                                        }}
                                                    >
                                                        <option value="moje">Moje hodnocení</option>
                                                        <option value="mal">MAL hodnocení</option>
                                                        <option value="imdb">IMDb hodnocení</option>
                                                    </select>
                                                </div>
                                                <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={showTrendLine} onChange={(e) => setShowTrendLine(e.target.checked)} style={{ accentColor: 'var(--accent-pink)', cursor: 'pointer' }} />
                                                    Trendová čára
                                                </label>
                                            </div>
                                        </h3>
                                        <div style={{ flex: 1, position: 'relative' }}>
                                            {timelineChartData ? (
                                                <Chart
                                                    type="line"
                                                    data={timelineChartData}
                                                    options={timelineOptions}
                                                    plugins={[seasonBoundariesPlugin]}
                                                />
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '70px' }}>
                                                    Série nemá ohodnocené epizody pro zobrazení timeline
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Epizodní panel vpravo — Jikan episode list / detail */}
                                    <div className="ratings-panel episode-panel">
                                        {selectedTimelineEp ? (
                                            /* ===== STAV B: Epizoda vybrána — detail + synopsis ===== */
                                            <div className="fade-in" style={{ display:'flex', flexDirection:'column', flex: 1, minHeight: 0 }}>
                                                <div className="episode-detail-header">
                                                    <button className="episode-back-btn" onClick={() => setSelectedTimelineEp(null)}>
                                                        ← Seznam
                                                    </button>
                                                    <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-muted)' }}>
                                                        {selectedTimelineEp.epName}
                                                    </span>
                                                </div>
                                                <div className="episode-detail-title">
                                                    {selectedTimelineEp.epName === "Film" 
                                                        ? `Film ${selectedTimelineEp.animeName}` 
                                                        : (jikanSynopsis?.title || selectedTimelineEp.epName)}
                                                </div>
                                                {selectedTimelineEp.epName !== "Film" && (
                                                    <div className="episode-season-label">
                                                        Sezóna: <span style={{ color:'var(--accent-pink)' }}>{selectedTimelineEp.animeName}</span>
                                                    </div>
                                                )}
                                                <div className="episode-detail-meta">
                                                    <span className="meta-badge" style={{ background: getPointColor(selectedTimelineEp.rating), color: getPointTextColor(selectedTimelineEp.rating) }}>
                                                        EP: {selectedTimelineEp.rating.toFixed(2)}
                                                    </span>
                                                    {(() => {
                                                        // Find MAL score from jikanEpisodes list
                                                        const epName = selectedTimelineEp.epName
                                                        const epMatch = epName.match(/EP\s*(\d+)/i)
                                                        const epNum = epMatch ? parseInt(epMatch[1], 10) : null
                                                        const malEp = epNum && jikanEpisodes ? jikanEpisodes.find(e => e.mal_id === epNum) : null
                                                        if (malEp && malEp.score) {
                                                            return <span className="meta-badge" style={{ background:'var(--bg-tertiary)', color:'var(--text-secondary)' }}>MAL: {malEp.score.toFixed(2)}</span>
                                                        }
                                                        return null
                                                    })()}
                                                    {(() => {
                                                        // Find IMDb score from imdbCache
                                                        const anime = animeList.find(a => a.name === selectedTimelineEp.animeName)
                                                        if (!anime || !anime.mal_url) return null
                                                        const malId = extractMalId(anime.mal_url)
                                                        const imdbAnime = imdbCache[String(malId)]
                                                        if (imdbAnime && imdbAnime.episodes) {
                                                            const score = imdbAnime.episodes[selectedTimelineEp.epName]
                                                            if (score) {
                                                                return (
                                                                    <span className="meta-badge" style={{ background: '#f5c518', color: '#000000', fontWeight: 'bold' }}>
                                                                        IMDb: {score.toFixed(2)}
                                                                    </span>
                                                                )
                                                            }
                                                        }
                                                        return null
                                                    })()}
                                                    {jikanSynopsis?.filler && <span className="ep-badge filler">Filler</span>}
                                                    {jikanSynopsis?.recap && <span className="ep-badge recap">Recap</span>}
                                                </div>
                                                {(() => {
                                                    const anime = animeList.find(a => a.name === selectedTimelineEp.animeName);
                                                    const airedDate = jikanSynopsis?.aired;
                                                    const durationText = jikanSynopsis?.duration 
                                                        ? formatDuration(jikanSynopsis.duration) 
                                                        : (anime?.episode_duration ? `${Math.round(anime.episode_duration)} min` : '');
                                                    
                                                    if (airedDate || durationText) {
                                                        return (
                                                            <div className="episode-aired-date">
                                                                {airedDate && `Aired: ${new Date(airedDate).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                                                                {airedDate && durationText ? ' · ' : ''}
                                                                {durationText}
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                <div className="episode-synopsis-container">
                                                    {jikanSynopsis?.synopsis ? (
                                                        <p className="episode-synopsis-text">{jikanSynopsis.synopsis}</p>
                                                    ) : (
                                                        <p className="episode-synopsis-placeholder">
                                                            {jikanSynopsis === null ? 'Synopsis se stahuje na pozadí...' : 'Synopsis není k dispozici.'}
                                                        </p>
                                                    )}
                                                </div>
                                                <div style={{ marginTop:'6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <p style={{ color:'var(--text-muted)', fontSize:'0.72rem', fontStyle:'italic', margin: 0 }}>
                                                        Chronologicky {selectedTimelineEp.index}. v pořadí série.
                                                    </p>
                                                    <div className="episode-nav-buttons">
                                                        <button 
                                                            className="ep-nav-btn" 
                                                            onClick={handlePrevEp}
                                                            disabled={!hasPrevEp}
                                                            title="Předchozí epizoda"
                                                        >
                                                            ←
                                                        </button>
                                                        <button 
                                                            className="ep-nav-btn" 
                                                            onClick={handleNextEp}
                                                            disabled={!hasNextEp}
                                                            title="Další epizoda"
                                                        >
                                                            →
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* ===== STAV A: Žádná epizoda nevybrána — seznam ===== */
                                            <div style={{ display:'flex', flexDirection:'column', flex: 1, minHeight: 0 }}>
                                                <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem' }}>
                                                    {selectedSeriesSeason ? `Epizody` : 'Detail epizod'}
                                                </h3>
                                                {jikanLoading ? (
                                                    <div className="episode-panel-loading">
                                                        <div className="loading-spinner"></div>
                                                        Načítání epizod...
                                                    </div>
                                                ) : jikanEpisodes && jikanEpisodes.length > 0 ? (
                                                    <div className="episode-list-panel">
                                                        {jikanEpisodes.map((ep, epIdx) => (
                                                            <div
                                                                key={`${ep.animeName}_${ep.mal_id}_${epIdx}`}
                                                                className="episode-list-item"
                                                                onClick={() => {
                                                                    // Find the exact matching chronological episode in our seriesTimelineData
                                                                    const isMovie = ep.cleanSeasonName.toLowerCase().includes('film') || ep.cleanSeasonName.toLowerCase().includes('movie') || ep.cleanSeasonName.toLowerCase().includes('0');
                                                                    const tEp = seriesTimelineData?.episodes?.find(t => 
                                                                        t.animeName === ep.animeName && 
                                                                        (t.epName === `EP ${ep.mal_id}` || (t.epName === 'Film' && ep.mal_id === 1))
                                                                    )
                                                                    if (tEp) {
                                                                        setSelectedTimelineEp(tEp)
                                                                    } else {
                                                                        // Fallback if not found in timeline data
                                                                        const animeName = ep.animeName
                                                                        const erObj = episodeRatings.find(er => er.name === animeName)
                                                                        const ourEp = erObj?.episodes?.find(e => {
                                                                            const m = e.episode.match(/EP\s*(\d+)/i)
                                                                            return m && parseInt(m[1], 10) === ep.mal_id
                                                                        })
                                                                        const targetRating = ourEp ? ourEp.rating : (Number(animeList.find(a => a.name === animeName)?.rating) || 0)
                                                                        setSelectedTimelineEp({
                                                                            index: ep.mal_id,
                                                                            rating: targetRating,
                                                                            epName: ep.mal_id === 1 && (isMovie || animeList.find(a => a.name === animeName)?.type === 'Movie') ? 'Film' : `EP ${ep.mal_id}`,
                                                                            animeName: animeName,
                                                                            seasonName: ep.cleanSeasonName
                                                                        })
                                                                    }
                                                                }}
                                                                title={`${ep.cleanSeasonName} - EP ${ep.mal_id}: ${ep.title}`}
                                                            >
                                                                 {selectedSeriesObj && selectedSeriesObj.items.length > 1 && (() => {
                                                                     const colorIdx = seasonColorMap[ep.cleanSeasonName] ?? 0;
                                                                     const styleObj = seasonStyles[colorIdx % seasonStyles.length];
                                                                     return (
                                                                         <span 
                                                                             className="ep-season-badge"
                                                                             style={{
                                                                                 background: styleObj.bg,
                                                                                 borderColor: styleObj.border,
                                                                                 color: styleObj.text
                                                                             }}
                                                                         >
                                                                             {ep.cleanSeasonName}
                                                                         </span>
                                                                     );
                                                                 })()}
                                                                <span className="ep-number">EP {ep.mal_id}</span>
                                                                <span className="ep-title">{ep.title}</span>
                                                                {ep.filler && <span className="ep-badge filler">Fill</span>}
                                                                {ep.recap && <span className="ep-badge recap">Rec</span>}
                                                                {ep.score && <span className="ep-score">★ {ep.score.toFixed(1)}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : seriesTimelineData?.episodes?.length > 0 ? (
                                                    <div className="episode-synopsis-placeholder">
                                                        Data epizod se stahují na pozadí...<br/>
                                                        Kliknutím na bod v grafu zobrazíte detail.
                                                    </div>
                                                ) : (
                                                    <div className="episode-synopsis-placeholder">
                                                        Žádná data k dispozici.
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Průměrný Radar Chart & Notes vprostřed */}
                                    <div className="ratings-panel" style={{ flex: '0 0 380px', height: '500px', display: 'flex', flexDirection: 'column' }}>
                                        <h3 className="ratings-panel-title" style={{ marginBottom: '8px' }}>Agregovaný průměr kategorií</h3>
                                        <div style={{ height: '240px', position: 'relative', marginBottom: '8px' }}>
                                            {seriesRadarData ? (
                                                <Radar data={seriesRadarData} options={radarOptions} />
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
                                                    Žádná data pro radar
                                                </div>
                                            )}
                                        </div>
                                        <div className="series-notes-container" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                {selectedAnimeTitle ? `Recenze: ${selectedAnimeTitle}` : 'Recenze série'}
                                            </h4>
                                            <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.78rem', lineHeight: '1.4', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', padding: '6px', borderRadius: 'var(--radius-md)' }}>
                                                {selectedAnimeNote ? selectedAnimeNote.replace(/_x000D_/g, '') : 'Vyberte epizodu nebo část pro zobrazení poznámky.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Seznam všech sezón a čtverečky epizod */}
                                    <div className="ratings-panel" style={{ flex: 1, height: '500px', overflowY: 'auto' }}>
                                        <h3 className="ratings-panel-title">Mřížka epizod (Episode Grid)</h3>
                                        <div className="seasons-grids-list">
                                            {selectedSeriesObj?.items.map(anime => {
                                                const isMovieOrSingleEpisode = 
                                                    anime.type === "Movie" || 
                                                    Number(anime.episodes) === 1 || 
                                                    anime.name === "The Disappearance of Haruhi Suzumiya" ||
                                                    anime.name.toLowerCase().includes("heaven's feel") || 
                                                    anime.name.toLowerCase().includes("movie") ||
                                                    anime.name.toLowerCase().includes("film");

                                                let epsToUse = []
                                                if (isMovieOrSingleEpisode) {
                                                    const avgCat = getAvgCat(anime.name)
                                                    epsToUse = [{
                                                        episode: "Film",
                                                        rating: avgCat !== null ? avgCat : (Number(anime.rating) || 0)
                                                    }]
                                                } else {
                                                    const erObj = episodeRatings.find(er => er.name === anime.name)
                                                    if (erObj && erObj.episodes && erObj.episodes.length > 0) {
                                                        epsToUse = erObj.episodes
                                                    } else {
                                                        const avgCat = getAvgCat(anime.name)
                                                        if (avgCat !== null) {
                                                            epsToUse = [{
                                                                episode: "Film",
                                                                rating: avgCat
                                                            }]
                                                        }
                                                    }
                                                }

                                                if (epsToUse.length === 0) return null
                                                
                                                // Calculate average rating for this season
                                                const seasonRatings = epsToUse.map(e => e.rating).filter(r => !isNaN(r) && r > 0)
                                                const seasonAvg = seasonRatings.length > 0 ? (seasonRatings.reduce((sum, r) => sum + r, 0) / seasonRatings.length) : 0
                                                
                                                const cleanSeasonName = anime.name.replace(selectedSeriesObj.name + ', ', '').replace(selectedSeriesObj.name + ' ', '')
                                                const isSelected = selectedAnimeTitle === anime.name
                                                
                                                return (
                                                    <div 
                                                        key={anime.name} 
                                                        className={`season-grid-section ${isSelected ? 'active' : ''}`}
                                                        style={{
                                                            borderLeft: isSelected ? '3px solid var(--accent-pink)' : '3px solid transparent',
                                                            paddingLeft: '8px',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                    >
                                                        <h4 
                                                            className="season-grid-title" 
                                                            style={{ 
                                                                cursor: 'pointer', 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                gap: '8px',
                                                                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                                                            }}
                                                            onClick={() => {
                                                                setSelectedSeriesSeason(anime.name)
                                                                setSelectedAnimeTitle(anime.name)
                                                            }}
                                                        >
                                                            <span>{cleanSeasonName}</span>
                                                            <span className="season-grid-avg">
                                                                (průměr {seasonAvg > 0 ? seasonAvg.toFixed(2) : 'N/A'})
                                                            </span>
                                                        </h4>
                                                        <div className="episode-grid-container" style={{ marginTop: '8px' }}>
                                                            {epsToUse.map(ep => (
                                                                <div 
                                                                    key={ep.episode} 
                                                                    className="episode-grid-card" 
                                                                    style={{ backgroundColor: getPointColor(ep.rating) }}
                                                                    onClick={() => {
                                                                        setSelectedSeriesSeason(anime.name)
                                                                        setSelectedAnimeTitle(anime.name)
                                                                        setSelectedTimelineEp({
                                                                            index: ep.episode === "Film" ? 1 : ep.episode.replace('EP ', ''),
                                                                            rating: ep.rating,
                                                                            epName: ep.episode,
                                                                            animeName: anime.name
                                                                        })
                                                                    }}
                                                                    title={`${anime.name} - ${ep.episode}: ${ep.rating}`}
                                                                >
                                                                    <span className="ep-card-num">{ep.episode.replace('EP ', 'E')}</span>
                                                                    <span className="ep-card-val">{ep.rating.toFixed(1)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================
                VIEW 3: INDIVIDUAL RATINGS VIEW (ORIGINAL LAYOUT)
                ============================================ */}
            {viewMode === 'individual' && (
                <>
                    {/* ROW 1: Sériové Dashboardy */}
                    <div className="ratings-row row-1 fade-in">
                        {/* 1. Selektor (Left) */}
                        <div className="ratings-panel left-panel">
                            <h3 className="ratings-panel-title">Vyberte Anime</h3>
                            <input
                                type="text"
                                className="anime-selector-search"
                                placeholder="Hledat..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <div className="anime-selector-list">
                                {row1AnimeList.map(a => (
                                    <div
                                        key={a.name}
                                        className={`anime-selector-item ${selectedAnimeTitle === a.name ? 'active' : ''}`}
                                        onClick={() => setSelectedAnimeTitle(a.name)}
                                    >
                                        <div className="selector-item-content">
                                            <span className="selector-item-name">{a.name}</span>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.type}</span>
                                        </div>
                                        <div className="selector-item-rating">{a.rating || '?'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Radar Chart (Center) */}
                        <div className="ratings-panel center-panel">
                            <h3 className="ratings-panel-title" style={{ fontSize: '1rem' }}>
                                {selectedAnimeTitle}
                                <div style={{ display:'flex', gap:'8px', fontSize:'0.85rem' }}>
                                    <span className="badge badge-primary">WA: {avgCategoryRating}</span>
                                    <span className="badge" style={{ background:'var(--bg-tertiary)'}}>FH: {selectedAnimeObj?.rating || '?'}</span>
                                </div>
                            </h3>
                            <div style={{ flex: 1, position: 'relative' }}>
                                {radarData ? <Radar data={radarData} options={radarOptions} /> : <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '50px' }}>Žádná data pro radar</div>}
                            </div>
                        </div>

                        {/* 3. Epizody & Narative (Right) */}
                        <div className="right-panel">
                            <div className="ratings-panel right-panel-top">
                                <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Hodnocení Epizod</h3>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    {episodeChartData ? <Bar data={episodeChartData} options={episodeBarOptions} /> : <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>Žádná data pro epizody</div>}
                                </div>
                            </div>
                            <div className="ratings-panel right-panel-bottom">
                                <h3 className="ratings-panel-title" style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Recenze / Summary</h3>
                                <div style={{ flex: 1, overflowY: 'auto', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', paddingRight: '8px', color: 'var(--text-secondary)' }}>
                                    {selectedAnimeNote ? selectedAnimeNote.replace(/_x000D_/g, '') : 'Žádná poznámka k dispozici.'}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ============================================
                GLOBAL SECTIONS (ROW 2 & ROW 3) - SHOWN IN BOTH VIEWS (Varianta A)
                ============================================ */}
            {viewMode !== 'split' && (
                <>
                    {/* ROW 2: Kategorie & Korelace */}
                    <div className="ratings-row row-2 fade-in">
                        <div className="ratings-panel left-panel">
                            <h3 className="ratings-panel-title">Filtry a seznam</h3>
                            <div className="slicer-group">
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Typ</label>
                                <select className="slicer-select" value={slicerTyp} onChange={e => setSlicerTyp(e.target.value)}>
                                    <option value="Kategorie">Kategorie</option>
                                    <option value="Epizoda">Epizoda</option>
                                </select>
                            </div>
                            <div className="slicer-group">
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Položka</label>
                                <select className="slicer-select" value={slicerPolozka} onChange={e => setSlicerPolozka(e.target.value)}>
                                    {polozkyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="slicer-group">
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hodnocení</label>
                                <select className="slicer-select" value={slicerHodnoceni} onChange={e => setSlicerHodnoceni(e.target.value)}>
                                    {hodnoceniOptions.map(h => <option key={h} value={h}>{h === 'Všechna' ? h : Number(h).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</option>)}
                                </select>
                            </div>
                            <div className="anime-selector-list" style={{ marginTop: 'var(--spacing-sm)' }}>
                                {row2FilteredAnime.map(a => (
                                    <div key={a.name} className="anime-selector-item" onClick={() => {
                                        setViewMode('individual') // fallback to individual detail on click
                                        setSelectedAnimeTitle(a.name)
                                    }}>
                                        <span className="selector-item-name">{a.name}</span>
                                        <span className="selector-item-rating">{Number(a.hodnoceni).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                    </div>
                                ))}
                                {row2FilteredAnime.length === 0 && <div style={{ color:'var(--text-muted)', padding:'8px' }}>Žádná data</div>}
                            </div>
                        </div>

                        <div className="ratings-panel center-panel">
                            <h3 className="ratings-panel-title">Korelace: {slicerPolozka} vs FH {correlationChartData?.r2 ? `(R² = ${correlationChartData.r2.toLocaleString('cs-CZ')})` : ''}</h3>
                            <div style={{ flex: 1, position: 'relative' }}>
                                {correlationChartData ? <Chart type='scatter' data={correlationChartData.data} options={correlationChartOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Málo dat pro korelaci</div>}
                            </div>
                        </div>

                        <div className="ratings-panel right-panel">
                            <h3 className="ratings-panel-title">Rozložení hodnocení: {slicerPolozka}</h3>
                            <div style={{ flex: 1, position: 'relative' }}>
                                {histogramData ? <Bar data={histogramData} options={histogramOptions} /> : <div style={{ color: 'var(--text-muted)' }}>Žádná data</div>}
                            </div>
                        </div>
                    </div>

                    {/* ROW 3: Globální žebříčky */}
                    <div className="ratings-row row-3 fade-in" style={{ marginBottom: 'var(--spacing-xl)' }}>
                        <div className="ratings-panel left-panel">
                            <h3 className="ratings-panel-title">Hodnocení Anime podle AVG (Top {lbCount})</h3>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <select className="slicer-select" style={{flex:1}} value={lbTyp} onChange={e => setLbTyp(e.target.value)}>
                                    <option value="Epizody">Epizody</option>
                                    <option value="Kategorie">Kategorie</option>
                                </select>
                                <select className="slicer-select" style={{flex:1}} value={lbSort} onChange={e => setLbSort(e.target.value)}>
                                    <option value="Nejlepší">Nejlepší</option>
                                    <option value="Nejhorší">Nejhorší</option>
                                </select>
                                <select className="slicer-select" style={{flex:0.5}} value={lbCount} onChange={e => setLbCount(Number(e.target.value))}>
                                    <option value="10">10</option>
                                    <option value="30">30</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Bar data={leaderboardChartData} options={leaderboardOptions} />
                            </div>
                        </div>

                        <div className="ratings-panel center-panel">
                            <h3 className="ratings-panel-title">Kvalita (technika) vs. Hloubka (narativ)</h3>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Chart type='bubble' data={hypeChartData} options={hypeChartOptions} />
                            </div>
                        </div>

                        <div className="ratings-panel right-panel">
                            <h3 className="ratings-panel-title">Anime s nestabilním ohodnocením EP (Top 30)</h3>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <Bar data={unstableChartData} options={unstableOptions} />
                            </div>
                        </div>
                    </div>
                </>
            )}
            </>
            )}
        </div>
    )
}

export default AnimeRatings
