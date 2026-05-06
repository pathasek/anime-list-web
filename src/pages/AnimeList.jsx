import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'

const FilterDropdown = ({ label, options, currentFilters, onFilterChange, type, alignRight, descriptions }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [localSearch, setLocalSearch] = useState('')

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest(`.dropdown-${type}`)) {
                setIsOpen(false)
            }
        }
        if (isOpen) document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [isOpen, type])

    const filteredOptions = options.filter(o => o.toLowerCase().includes(localSearch.toLowerCase()))

    // Count active filters (included or excluded)
    const activeCount = Object.values(currentFilters || {}).filter(v => v !== 0).length

    const handleCycle = (option, e) => {
        e.stopPropagation()
        const current = currentFilters[option] || 0
        let next = 0
        if (current === 0) next = 1
        else if (current === 1) next = -1
        else next = 0
        onFilterChange(type, option, next)
    }

    const clearThisFilter = (e) => {
        e.stopPropagation()
        onFilterChange(type, null, 'clear')
        setIsOpen(false)
    }

    return (
        <div className={`filter-dropdown-container dropdown-${type}`}>
            <button
                className={`filter-btn ${activeCount > 0 ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                style={{ display: 'flex', alignItems: 'center' }}
            >
                {label} {activeCount > 0 && <span className="filter-badge-count">{activeCount}</span>}
                <span style={{ marginLeft: '6px', fontSize: '0.7rem' }}>▼</span>
            </button>
            {isOpen && (
                <div className={`filter-dropdown-menu ${alignRight ? 'right-aligned' : ''}`}>
                    <div style={{ padding: 'var(--spacing-xs)', position: 'sticky', top: 0, background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', zIndex: 10, borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
                        <input
                            type="text"
                            placeholder="Hledat..."
                            value={localSearch}
                            onChange={e => setLocalSearch(e.target.value)}
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px',
                                padding: '6px 8px', color: 'var(--text-primary)', fontSize: '0.8rem'
                            }}
                            onClick={e => e.stopPropagation()}
                        />
                    </div>

                    <div style={{ padding: 'var(--spacing-xs)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                            const status = currentFilters[opt] || 0
                            const statusClass = status === 1 ? 'included' : status === -1 ? 'excluded' : ''
                            return (
                                <div
                                    key={opt}
                                    className={`filter-dropdown-item ${statusClass}`}
                                    onClick={(e) => handleCycle(opt, e)}
                                    title={descriptions && descriptions[opt] ? descriptions[opt] : undefined}
                                >
                                    <span>{opt}</span>
                                    {status === 1 && <span style={{ fontSize: '0.8rem' }}>+</span>}
                                    {status === -1 && <span style={{ fontSize: '0.8rem' }}>−</span>}
                                </div>
                            )
                        }) : <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>Nenalezeno</div>}
                    </div>

                    {activeCount > 0 && (
                        <div style={{ padding: 'var(--spacing-xs)', position: 'sticky', bottom: 0, background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-color)', zIndex: 10, borderRadius: '0 0 var(--radius-md) var(--radius-md)' }}>
                            <button className="clear-filter-btn" onClick={clearThisFilter}>
                                Vymazat výběr
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function AnimeList() {
    const navigate = useNavigate()
    const location = useLocation()
    const [animeList, setAnimeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'default', direction: 'asc' })
    const defaultFilters = {
        status: { 'AIRING!': 1 },
        type: {},
        genre: {},
        theme: {},
        tag: {},
        release_year: {},
        rewatch: {},
        studio: {},
        ep_count: {},
        ep_duration: {},
        dub: {}
    }
    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('animeFiltersObj')
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                // Merge with defaults to ensure all keys exist (prevents crash from older localStorage versions)
                return { ...defaultFilters, ...parsed }
            } catch (e) { }
        }
        return { ...defaultFilters }
    })
    const [seriesFilter, setSeriesFilter] = useState(null)
    const [expandedImage, setExpandedImage] = useState(null)
    const [showScrollTop, setShowScrollTop] = useState(false)
    const [displayCount, setDisplayCount] = useState(50)

    useEffect(() => {
        const handleScroll = (e) => {
            const currentY = window.scrollY || document.documentElement.scrollTop;
            setShowScrollTop(currentY > 1000);
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);

    useEffect(() => {
        loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
            .then(data => {
                const indexedData = data.map((item, idx) => ({ ...item, originalIndex: idx + 1 }))
                setAnimeList(indexedData)
                setLoading(false)

                // Check URL for series parameter directly toggle the series filter
                const searchParams = new URLSearchParams(location.search)
                const seriesQ = searchParams.get('series')
                if (seriesQ) {
                    setSeriesFilter(seriesQ)
                    setFilters({ status: {}, type: {}, genre: {}, theme: {}, tag: {}, release_year: {}, rewatch: {}, studio: {}, ep_count: {}, ep_duration: {}, dub: {} })
                }

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

    // Extract unique properties for filters
    const filterOptions = useMemo(() => {
        const types = new Set()
        const genres = new Set()
        const themes = new Set()
        const tags = new Set()
        const tagDescriptions = {}
        const studiosSet = new Set()
        const dubsSet = new Set()
        const releaseYears = new Set()

        animeList.forEach(a => {
            if (a.type) types.add(a.type)
            if (a.genres) {
                a.genres.split(';').forEach(g => {
                    const clean = g.trim()
                    if (clean) genres.add(clean)
                })
            }
            if (a.themes) {
                a.themes.split(';').forEach(t => {
                    const clean = t.trim()
                    if (clean && clean !== 'X') themes.add(clean)
                })
            }
            if (a.tags) {
                a.tags.split(';').forEach(t => {
                    const parts = t.split(':')
                    const clean = parts[0].trim()
                    if (clean) {
                        tags.add(clean)
                        if (parts.length > 1) {
                            tagDescriptions[clean] = parts.slice(1).join(':').trim()
                        }
                    }
                })
            }
            if (a.studio) {
                a.studio.split(';').forEach(s => {
                    const clean = s.trim()
                    if (clean) studiosSet.add(clean)
                })
            }
            if (a.dub) {
                a.dub.split(';').forEach(d => {
                    const clean = d.trim()
                    if (clean) dubsSet.add(clean)
                })
            }
            if (a.release_date) {
                const y = new Date(a.release_date).getFullYear()
                if (y > 1950 && y <= new Date().getFullYear() + 1) releaseYears.add(String(y))
            }
        })

        // Predefined buckets
        const rewatchBuckets = ['0', '1', '2', '3+']
        const epCountBuckets = ['1', '2-13', '14-26', '27-52', '53+']
        const epDurationBuckets = ['<10 min', '10-24 min', '24-30 min', '>30 min']

        return {
            types: Array.from(types).sort(),
            genres: Array.from(genres).sort(),
            themes: Array.from(themes).sort(),
            tags: Array.from(tags).sort(),
            tagDescriptions,
            statuses: ['PENDING', 'AIRING!', 'FINISHED'],
            studios: Array.from(studiosSet).sort(),
            dubs: Array.from(dubsSet).sort(),
            releaseYears: Array.from(releaseYears).sort((a, b) => parseInt(b) - parseInt(a)),
            rewatchBuckets,
            epCountBuckets,
            epDurationBuckets
        }
    }, [animeList])

    useEffect(() => {
        localStorage.setItem('animeFiltersObj', JSON.stringify(filters))
        setDisplayCount(50)
    }, [filters])

    const handleFilterChange = (category, option, nextState) => {
        setFilters(prev => {
            const newCat = { ...prev[category] }
            if (nextState === 'clear') {
                return { ...prev, [category]: {} }
            }
            if (nextState === 0) {
                delete newCat[option]
            } else {
                newCat[option] = nextState
            }
            return { ...prev, [category]: newCat }
        })
    }

    const clearAllFilters = () => {
        setFilters({ status: {}, type: {}, genre: {}, theme: {}, tag: {}, release_year: {}, rewatch: {}, studio: {}, ep_count: {}, ep_duration: {}, dub: {} })
        setSearchTerm('')
    }

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

        // Advanced Filtering
        const checkArrayFilter = (itemArray, filterMap) => {
            const included = Object.entries(filterMap).filter(([_, v]) => v === 1).map(([k]) => k)
            const excluded = Object.entries(filterMap).filter(([_, v]) => v === -1).map(([k]) => k)

            // If it matches ANY excluded word, IMMEDIATELY fail
            if (excluded.some(ex => itemArray.includes(ex))) return false

            // AND logic: it must contain ALL included words
            if (included.length > 0) {
                if (!included.every(inc => itemArray.includes(inc))) return false
            }
            return true
        }

        const checkSingleFilter = (itemVal, filterMap) => {
            const included = Object.entries(filterMap).filter(([_, v]) => v === 1).map(([k]) => k)
            const excluded = Object.entries(filterMap).filter(([_, v]) => v === -1).map(([k]) => k)

            // Fail if excluded
            if (excluded.includes(itemVal)) return false

            // OR logic for single fields: must match ONE of the included
            if (included.length > 0) {
                if (!included.includes(itemVal)) return false
            }
            return true
        }

        result = result.filter(a => {
            // Apply Status (OR logic)
            if (!checkSingleFilter(a.status || 'FINISHED', filters.status)) return false
            // Apply Type (OR logic)
            if (!checkSingleFilter(a.type, filters.type)) return false

            // Apply Genres (AND logic)
            const gArray = (a.genres || '').split(';').map(x => x.trim()).filter(Boolean)
            if (!checkArrayFilter(gArray, filters.genre)) return false

            // Apply Themes (AND logic)
            const tArray = (a.themes || '').split(';').map(x => x.trim()).filter(Boolean)
            if (!checkArrayFilter(tArray, filters.theme)) return false

            // Apply Tags (AND logic)
            const tagArray = (a.tags || '').split(';').map(x => x.split(':')[0].trim()).filter(Boolean)
            if (!checkArrayFilter(tagArray, filters.tag)) return false

            // Apply Release Year (OR logic)
            if (Object.keys(filters.release_year).some(k => filters.release_year[k] !== 0)) {
                const year = a.release_date ? String(new Date(a.release_date).getFullYear()) : ''
                if (!checkSingleFilter(year, filters.release_year)) return false
            }

            // Apply Rewatch Count (OR logic, buckets)
            if (Object.keys(filters.rewatch).some(k => filters.rewatch[k] !== 0)) {
                const rc = parseInt(a.rewatch_count) || 0
                let bucket = String(rc)
                if (rc >= 3) bucket = '3+'
                if (!checkSingleFilter(bucket, filters.rewatch)) return false
            }

            // Apply Studio (multi-value OR logic)
            if (Object.keys(filters.studio).some(k => filters.studio[k] !== 0)) {
                const studioArray = (a.studio || '').split(';').map(x => x.trim()).filter(Boolean)
                const included = Object.entries(filters.studio).filter(([_, v]) => v === 1).map(([k]) => k)
                const excluded = Object.entries(filters.studio).filter(([_, v]) => v === -1).map(([k]) => k)
                if (excluded.some(ex => studioArray.includes(ex))) return false
                if (included.length > 0 && !included.some(inc => studioArray.includes(inc))) return false
            }

            // Apply Episode Count (OR logic, buckets)
            if (Object.keys(filters.ep_count).some(k => filters.ep_count[k] !== 0)) {
                const eps = parseInt(String(a.episodes).replace(/[^\d]/g, '')) || 0
                let bucket = '53+'
                if (eps === 1) bucket = '1'
                else if (eps >= 2 && eps <= 13) bucket = '2-13'
                else if (eps >= 14 && eps <= 26) bucket = '14-26'
                else if (eps >= 27 && eps <= 52) bucket = '27-52'
                if (!checkSingleFilter(bucket, filters.ep_count)) return false
            }

            // Apply Episode Duration (OR logic, buckets)
            if (Object.keys(filters.ep_duration).some(k => filters.ep_duration[k] !== 0)) {
                const dur = parseFloat(a.episode_duration) || 0
                let bucket = '>30 min'
                if (dur < 10) bucket = '<10 min'
                else if (dur <= 24) bucket = '10-24 min'
                else if (dur <= 30) bucket = '24-30 min'
                if (!checkSingleFilter(bucket, filters.ep_duration)) return false
            }

            // Apply Dub Language (multi-value OR logic)
            if (Object.keys(filters.dub).some(k => filters.dub[k] !== 0)) {
                const dubArray = (a.dub || '').split(';').map(x => x.trim()).filter(Boolean)
                const included = Object.entries(filters.dub).filter(([_, v]) => v === 1).map(([k]) => k)
                const excluded = Object.entries(filters.dub).filter(([_, v]) => v === -1).map(([k]) => k)
                if (excluded.some(ex => dubArray.includes(ex))) return false
                if (included.length > 0 && !included.some(inc => dubArray.includes(inc))) return false
            }

            return true
        })

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
    }, [animeList, searchTerm, filters, sortConfig, seriesFilter])

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
        if (!rating || rating === 'X' || isNaN(rating)) return '';
        const r = Math.floor(parseFloat(rating));
        if (r >= 10) return 'rating-10';
        if (r >= 9) return 'rating-9';
        if (r >= 8) return 'rating-8';
        if (r >= 7) return 'rating-7';
        if (r >= 6) return 'rating-6';
        if (r >= 5) return 'rating-5';
        if (r === 4) return 'rating-4';
        if (r === 3) return 'rating-3';
        if (r === 2) return 'rating-2';
        if (r === 1) return 'rating-1';
        return 'rating-1';
    }

    const getRatingColor = (rating) => {
        const r = parseFloat(rating)
        if (r >= 10) return 'var(--rating-10)'
        if (r >= 9) return 'var(--rating-9)'
        if (r >= 8) return 'var(--rating-8)'
        if (r >= 7) return 'var(--rating-7)'
        if (r >= 6) return 'var(--rating-6)'
        if (r >= 5) return 'var(--rating-5)'
        if (r >= 4) return 'var(--rating-4)'
        if (r >= 3) return 'var(--rating-3)'
        if (r >= 2) return 'var(--rating-2)'
        return 'var(--rating-1)'
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
            clearAllFilters()
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
                <div className="filter-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <FilterDropdown label="Status" options={filterOptions.statuses} currentFilters={filters.status} onFilterChange={handleFilterChange} type="status" />
                    <FilterDropdown label="Typ" options={filterOptions.types} currentFilters={filters.type} onFilterChange={handleFilterChange} type="type" />
                    <FilterDropdown label="Žánry" options={filterOptions.genres} currentFilters={filters.genre} onFilterChange={handleFilterChange} type="genre" />
                    <FilterDropdown label="Témata" options={filterOptions.themes} currentFilters={filters.theme} onFilterChange={handleFilterChange} type="theme" />
                    <FilterDropdown label="Tagy" options={filterOptions.tags} currentFilters={filters.tag} onFilterChange={handleFilterChange} type="tag" descriptions={filterOptions.tagDescriptions} />
                    <FilterDropdown label="Rok" options={filterOptions.releaseYears} currentFilters={filters.release_year} onFilterChange={handleFilterChange} type="release_year" />
                    <FilterDropdown label="Rewatch" options={filterOptions.rewatchBuckets} currentFilters={filters.rewatch} onFilterChange={handleFilterChange} type="rewatch" />
                    <FilterDropdown label="Studio" options={filterOptions.studios} currentFilters={filters.studio} onFilterChange={handleFilterChange} type="studio" />
                    <FilterDropdown label="Počet ep." options={filterOptions.epCountBuckets} currentFilters={filters.ep_count} onFilterChange={handleFilterChange} type="ep_count" />
                    <FilterDropdown label="Délka ep." options={filterOptions.epDurationBuckets} currentFilters={filters.ep_duration} onFilterChange={handleFilterChange} type="ep_duration" />
                    <FilterDropdown label="Dabing" options={filterOptions.dubs} currentFilters={filters.dub} onFilterChange={handleFilterChange} type="dub" alignRight={true} />

                    {Object.values(filters).some(cat => Object.values(cat).some(v => v !== 0)) && (
                        <button className="clear-filter-btn" style={{ width: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '6px 12px', marginTop: 0 }} onClick={clearAllFilters}>
                            Zrušit filtry
                        </button>
                    )}
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
                        {filteredList.slice(0, displayCount).map((anime, idx) => (
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
                                                src={anime.thumbnail.replace(/#/g, '%23')}
                                                alt={anime.name}
                                                style={{
                                                    width: '80px',
                                                    height: '45px',
                                                    minWidth: '80px',
                                                    minHeight: '45px',
                                                    objectFit: 'contain',
                                                    backgroundColor: 'rgba(0,0,0,0.3)',
                                                    borderRadius: '4px',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                                    transition: 'transform 0.35s ease, box-shadow 0.35s ease',
                                                    cursor: 'zoom-in',
                                                    pointerEvents: 'none',
                                                    position: 'relative',
                                                    display: 'block'
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
                                        <div style={{ lineHeight: '1.4' }}>
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
                                                {anime.name.replace(/ (\d+)$/, '\u00A0$1')}
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
                                                        marginLeft: '8px',
                                                        display: 'inline-block',
                                                        verticalAlign: 'middle',
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
                                            {Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})}/10
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
                {filteredList.slice(0, displayCount).map((anime, idx) => (
                    <div key={idx} className="mobile-card">
                        <div className="mobile-card-header">
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)', width: '100%', alignItems: 'center' }}>
                                {/* Image on the left */}
                                <div style={{ minWidth: '80px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); anime.thumbnail && setExpandedImage(anime.thumbnail.replace(/#/g, '%23')); }}>
                                    {anime.thumbnail ? (
                                        <img
                                            src={anime.thumbnail.replace(/#/g, '%23')}
                                            alt={anime.name}
                                            style={{
                                                width: '80px', height: '45px', objectFit: 'cover', backgroundColor: 'rgba(0,0,0,0.1)',
                                                borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                            }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div style={{
                                            width: '80px', height: '45px', backgroundColor: 'var(--bg-tertiary)',
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
                                        <div className="mobile-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', minWidth: 0, paddingRight: '10px' }}>
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
                                        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: getRatingColor(anime.rating) }}>
                                            {Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})}
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

            {/* Show More / Show All button */}
            {displayCount < filteredList.length && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
                    <button
                        className="filter-btn"
                        onClick={() => setDisplayCount(prev => prev + 50)}
                        style={{ padding: '8px 24px', fontWeight: 'bold' }}
                    >
                        ZOBRAZIT DALŠÍCH 50 ▼ ({Math.min(displayCount, filteredList.length)}/{filteredList.length})
                    </button>
                    <button
                        className="filter-btn"
                        onClick={() => setDisplayCount(filteredList.length)}
                        style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                    >
                        VŠE
                    </button>
                </div>
            )}

            {/* Full-screen Image Modal */}
            {expandedImage && createPortal(
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
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            objectFit: 'contain',
                            borderRadius: '8px',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                            display: 'block'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setExpandedImage(null);
                        }}
                    />
                </div>,
                document.body
            )}

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
        </div >
    )
}

export default AnimeList
