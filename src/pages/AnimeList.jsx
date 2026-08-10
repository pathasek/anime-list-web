import { useState, useEffect, useMemo, useRef, useTransition, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation, Outlet, useParams } from 'react-router-dom'
import { loadData, getCachedData, STORAGE_KEYS } from '../utils/dataStore'
import { animePath } from '../utils/animeSlug'

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

    // Pravý klik cykluje pozpátku (0 → vyloučit → zahrnout → 0), stejně jako návrh
    const handleCycleBack = (option, e) => {
        e.preventDefault()
        e.stopPropagation()
        const current = currentFilters[option] || 0
        let next = 0
        if (current === 0) next = -1
        else if (current === -1) next = 1
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
                className={`al-filter-btn ${activeCount > 0 ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{label}</span>
                {activeCount > 0 && <span className="al-filter-badge">{activeCount}</span>}
                <span className="al-filter-caret">▼</span>
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
                                    onContextMenu={(e) => handleCycleBack(opt, e)}
                                    title={descriptions && descriptions[opt] ? descriptions[opt] : 'Klik = zahrnout · další klik = vyloučit · pravý klik zpět'}
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

// Barvy žánrů přesně podle návrhu: [podklad, text]. Bez rámečku.
const GENRE_STYLE = {
    Action: ['rgba(244,115,111,.13)', '#f4938f'],
    Adventure: ['rgba(238,154,70,.13)', '#e0a75c'],
    Comedy: ['rgba(251,191,36,.12)', '#e6bf5a'],
    Drama: ['rgba(168,93,240,.13)', '#bf9cef'],
    Fantasy: ['rgba(99,102,241,.14)', '#9096f0'],
    Romance: ['rgba(236,72,153,.13)', '#e488b4'],
    'Sci-Fi': ['rgba(34,193,195,.13)', '#5fc2c4'],
    Suspense: ['rgba(160,206,78,.12)', '#a6c66a'],
    Horror: ['rgba(190,60,60,.14)', '#e07878'],
    Mystery: ['rgba(129,140,248,.13)', '#a5abf5'],
    Sports: ['rgba(52,211,153,.12)', '#5fd0a0'],
    Supernatural: ['rgba(217,70,239,.12)', '#d18cf0'],
    'Slice of Life': ['rgba(250,204,21,.1)', '#dcc35f'],
    'Avant Garde': ['rgba(148,163,184,.12)', '#9aa5b4']
}
const genreStyle = (g) => GENRE_STYLE[g] || ['#23232c', '#8f8478']

// Barvy typů anime přesně podle návrhu: [podklad, text]
const TYPE_STYLE = {
    TV: ['rgba(99,102,241,.18)', '#8f9bf7'],
    Movie: ['rgba(168,93,240,.18)', '#c39bf5'],
    ONA: ['rgba(160,206,78,.16)', '#a0ce4e'],
    OVA: ['rgba(238,154,70,.16)', '#e0a75c'],
    Special: ['rgba(236,72,153,.14)', '#e488b4'],
    'TV Special': ['rgba(236,72,153,.14)', '#e488b4'],
    Music: ['rgba(34,193,195,.16)', '#5fc2c4'],
    Donghua: ['rgba(244,115,111,.16)', '#f4938f']
}
const typeStyle = (t) => TYPE_STYLE[t] || ['rgba(120,113,140,.18)', '#8a8290']

// Ikonky do karet (převzaté z návrhu): studio, počet epizod, dosledování
const IconStudio = () => (
    <svg className="al-card-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13.5V6l4.2 2.4V6L10.4 8.4V2.5h3.6v11" /><path d="M1.2 13.5h13.6" />
    </svg>
)
const IconEp = () => (
    <svg className="al-card-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="3.5" width="13" height="9.5" rx="1.5" /><path d="M5 3.5V13M11 3.5V13" />
    </svg>
)
const IconWatched = () => (
    <svg className="al-card-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.8" y="3" width="12.4" height="11.2" rx="2" /><path d="M1.8 6.4h12.4M5 1.6v2.6M11 1.6v2.6" /><path d="M5.6 10.4l1.7 1.7 3.2-3.4" />
    </svg>
)

// Barva hodnocení jako CSS proměnná tématu (modul-level, aby ji šlo použít
// i v useMemo pro souhrnnou kartu průměru bez temporal dead zone).
const ratingColorVar = (rating) => {
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

// Volby řazení pro dropdown (režim Karty) — zrcadlí klikací hlavičky tabulky
const SORT_OPTIONS = [
    { key: 'default', label: 'Řadit dle: Výchozí' },
    { key: 'name', label: 'Řadit dle: Názvu' },
    { key: 'type', label: 'Řadit dle: Typu' },
    { key: 'studio', label: 'Řadit dle: Studia' },
    { key: 'genres', label: 'Řadit dle: Žánrů' },
    { key: 'episodes', label: 'Řadit dle: Počtu ep.' },
    { key: 'rating', label: 'Řadit dle: Hodnocení' },
    { key: 'end_date', label: 'Řadit dle: Dosledování' },
    { key: 'status', label: 'Řadit dle: Statusu' }
]

// Plovoucí velký náhled jako samostatná komponenta s imperativním API (show/hide
// přes ref). Klíčové pro výkon: najetí myší NEPŘEKRESLÍ celou tabulku (50–150
// řádků), jen tenhle malý náhled. Kreslí se přes canvas z už načteného řádkového
// obrázku (drawImage) → instantní, bez čekání na síť/dekódování; pak se z plného
// rozlišení překreslí kvůli ostrosti.
const HoverPreview = forwardRef(function HoverPreview(_, ref) {
    const [state, setState] = useState(null)
    const canvasRef = useRef(null)

    useImperativeHandle(ref, () => ({
        show(imgEl, src, name, rect) {
            if (!src) return
            const margin = 16
            const pw = Math.min(760, window.innerWidth - 2 * margin)
            const ph = Math.round(pw * 428 / 760)
            const totalH = ph + 34
            let left
            if (rect.right + margin + pw <= window.innerWidth) left = rect.right + margin
            else if (rect.left - margin - pw >= 0) left = rect.left - margin - pw
            else left = Math.max(margin, (window.innerWidth - pw) / 2)
            let top = rect.top + rect.height / 2 - totalH / 2
            top = Math.max(margin, Math.min(top, window.innerHeight - totalH - margin))
            setState({ left, top, width: pw, height: ph, name, img: imgEl, src })
        },
        hide() { setState(s => (s ? null : s)) }
    }), [])

    useEffect(() => {
        if (!state) return
        const canvas = canvasRef.current
        if (!canvas) return
        const w = state.width, h = state.height
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        const draw = (imgEl) => {
            if (!imgEl || !imgEl.complete || !imgEl.naturalWidth) return false
            const cw = canvas.width, ch = canvas.height
            const ir = imgEl.naturalWidth / imgEl.naturalHeight
            const cr = cw / ch
            let dw = cw, dh = ch, dx = 0, dy = 0
            if (ir > cr) { dh = cw / ir; dy = (ch - dh) / 2 } else { dw = ch * ir; dx = (cw - dw) / 2 }
            try { ctx.clearRect(0, 0, cw, ch); ctx.drawImage(imgEl, dx, dy, dw, dh); return true } catch { return false }
        }
        // Kreslí se PŘÍMO z už načteného řádkového obrázku — drawImage použije jeho
        // plné rozlišení (naturalWidth ~1600), takže je to instantní I ostré, bez
        // jakéhokoli nového stahování (to bylo příčinou 7s prodlevy).
        if (!draw(state.img) && state.img) {
            // řádkový obrázek se teprve načítá → překresli, až dorazí (BEZ nového requestu)
            const onload = () => { if (canvasRef.current === canvas) draw(state.img) }
            state.img.addEventListener('load', onload, { once: true })
            return () => state.img.removeEventListener('load', onload)
        }
    }, [state])

    if (!state) return null
    return createPortal(
        <div className="al-preview" style={{ left: `${state.left}px`, top: `${state.top}px`, width: `${state.width + 16}px` }}>
            <canvas ref={canvasRef} className="al-preview-img" style={{ width: `${state.width}px`, height: `${state.height}px` }} />
            <div className="al-preview-name">{state.name}</div>
        </div>,
        document.body
    )
})

function AnimeList() {
    const navigate = useNavigate()
    const location = useLocation()
    // Try to initialize from memory/localStorage cache synchronously for instant back-navigation.
    // The raw cached array is remembered so the async revalidation below can tell
    // whether the server has newer data (loadData returns a different reference).
    // Cache načteme jednou (ne zvlášť v každém inicializátoru) a ref jí rovnou
    // inicializujeme — žádný zápis do ref.current během renderu (react-hooks/refs).
    const initialCache = getCachedData(STORAGE_KEYS.ANIME_LIST)
    const initialCacheRef = useRef(initialCache)
    const [animeList, setAnimeList] = useState(() =>
        initialCache
            ? initialCache.map((item, idx) => ({ ...item, originalIndex: idx + 1 }))
            : []
    )
    const [loading, setLoading] = useState(!initialCache)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortConfig, setSortConfig] = useState({ key: 'default', direction: 'asc' })
    // Přepínač zobrazení Tabulka / Karty (nový, z redesignu) — volba se pamatuje
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('animeListView') || 'table')
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
            } catch { /* starší/poškozený formát localStorage → defaulty */ }
        }
        return { ...defaultFilters }
    })
    const [seriesFilter, setSeriesFilter] = useState(null)
    const [expandedImage, setExpandedImage] = useState(null)
    const previewRef = useRef(null) // imperativní API plovoucího náhledu (mimo re-render tabulky)
    const { name: isDetailOpen } = useParams()
    const [showScrollTop, setShowScrollTop] = useState(false)
    const [displayCount, setDisplayCount] = useState(() => {
        const saved = sessionStorage.getItem('animeListDisplayCount')
        return saved ? parseInt(saved, 10) : 50
    })
    const sentinelRef = useRef(null)
    const isInitialMountRestored = useRef(false)
    // Rušení filtru série vykreslí naráz hodně řádků — přes transition, ať UI nezamrzne
    const [isPending, startTransition] = useTransition()
    const pendingScrollRestore = useRef(false)

    // Přepínač zobrazení: uložit volbu a schovat plovoucí náhled
    useEffect(() => {
        localStorage.setItem('animeListView', viewMode)
        previewRef.current?.hide()
    }, [viewMode])

    // Scroll listener to update scroll position dynamically
    useEffect(() => {
        let raf = null
        let pendingY = 0
        const handleScroll = () => {
            const currentY = window.scrollY || document.documentElement.scrollTop;
            setShowScrollTop(currentY > 1000);
            // Plovoucí náhled je ukotvený k pozici řádku — při scrollu ho schovej
            previewRef.current?.hide();

            // Only update saved scroll after initial restoration has completed
            if (!isInitialMountRestored.current) return;

            // sessionStorage.setItem je synchronní — throttle přes rAF, ať rychlý
            // scroll dlouhého seznamu nezapisuje na každý scroll event (jank).
            pendingY = currentY
            if (raf) return
            raf = requestAnimationFrame(() => {
                raf = null
                if (pendingY > 0) {
                    sessionStorage.setItem('animeListScroll', String(pendingY));
                } else if (pendingY === 0 && document.documentElement.scrollHeight > window.innerHeight) {
                    sessionStorage.setItem('animeListScroll', '0');
                }
            })
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            if (raf) cancelAnimationFrame(raf);
        };
    }, []);

    // Save displayCount dynamically when it changes
    useEffect(() => {
        if (isInitialMountRestored.current) {
            sessionStorage.setItem('animeListDisplayCount', String(displayCount))
        }
    }, [displayCount])

    // Cleanup session storage when leaving the anime page route
    useEffect(() => {
        return () => {
            const nextPath = window.location.hash;
            if (!nextPath.includes('/anime')) {
                sessionStorage.removeItem('animeListScroll')
                sessionStorage.removeItem('animeListDisplayCount')
            }
        }
    }, [])

    useEffect(() => {
        // Check URL for series parameter
        const searchParams = new URLSearchParams(location.search)
        const seriesQ = searchParams.get('series')
        if (seriesQ) {
            setSeriesFilter(seriesQ)
            setFilters({ status: {}, type: {}, genre: {}, theme: {}, tag: {}, release_year: {}, rewatch: {}, studio: {}, ep_count: {}, ep_duration: {}, dub: {} })
        }

        // If data was already loaded from cache in useState, restore scroll immediately,
        // but still revalidate against the server version in the background —
        // the synchronous cache read may predate the async version check.
        if (animeList.length > 0) {
            requestAnimationFrame(() => {
                const savedScroll = sessionStorage.getItem('animeListScroll')
                if (savedScroll) {
                    window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
                }
                isInitialMountRestored.current = true
            })

            loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
                .then(data => {
                    // Same reference = cache still valid, nothing to update
                    if (data !== initialCacheRef.current) {
                        setAnimeList(data.map((item, idx) => ({ ...item, originalIndex: idx + 1 })))
                    }
                })
                .catch(() => { /* keep showing cached data */ })
            return
        }

        // Fetch from server (first visit or after cache clear)
        loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json')
            .then(data => {
                const indexedData = data.map((item, idx) => ({ ...item, originalIndex: idx + 1 }))
                setAnimeList(indexedData)
                setLoading(false)

                // Scroll restoration after data loads
                requestAnimationFrame(() => {
                    const savedScroll = sessionStorage.getItem('animeListScroll')
                    if (savedScroll) {
                        window.scrollTo({ top: parseInt(savedScroll, 10), behavior: 'instant' })
                    }
                    isInitialMountRestored.current = true
                })
            })
            .catch(err => {
                console.error('Failed to load anime list:', err)
                setLoading(false)
                isInitialMountRestored.current = true
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
        if (!isInitialMountRestored.current && sessionStorage.getItem('animeListScroll')) {
            return
        }
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

    // Souhrn statusů pro karty v hlavičce (z redesignu) — reflektuje aktivní filtr
    const statusSummary = useMemo(() => {
        const counts = { 'PENDING': 0, 'AIRING!': 0, 'FINISHED': 0 }
        const rated = []
        filteredList.forEach(a => {
            const s = a.status || 'FINISHED'
            if (counts[s] !== undefined) counts[s]++
            const rv = Number(a.rating)
            if (!isNaN(rv) && rv > 0) rated.push(rv)
        })
        const avg = rated.length ? rated.reduce((x, y) => x + y, 0) / rated.length : null
        // Pořadí i průměrné hodnocení podle návrhu: Dokončeno → Airing → Pending → ø
        return [
            { key: 'FINISHED', label: 'Dokončeno', value: String(counts['FINISHED']), color: 'var(--accent-cyan)' },
            { key: 'AIRING!', label: 'Airing', value: String(counts['AIRING!']), color: 'var(--accent-emerald)' },
            { key: 'PENDING', label: 'Pending', value: String(counts['PENDING']), color: 'var(--accent-amber)' },
            { key: 'avg', label: 'ø Hodnocení', value: avg != null ? avg.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–', color: avg != null ? ratingColorVar(avg) : 'var(--accent-primary)' }
        ]
    }, [filteredList])

    const anyFilterActive = Object.values(filters).some(cat => Object.values(cat).some(v => v !== 0)) || !!searchTerm || !!seriesFilter

    // Infinite scroll observer setup
    useEffect(() => {
        if (!sentinelRef.current) return

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setDisplayCount(prev => Math.min(prev + 50, filteredList.length))
            }
        }, { rootMargin: '1000px' })

        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [filteredList.length])

    // Uloženo při dočasném zúžení na jednu sérii (toggleSeriesFilter) — deklarováno
    // před efekty/handlery, které je čtou (react-hooks/immutability).
    const [savedScrollPos, setSavedScrollPos] = useState(0)
    const [savedDisplayCount, setSavedDisplayCount] = useState(null)

    // Reset displayCount when search term, sorting, or series filter changes
    useEffect(() => {
        if (savedDisplayCount !== null) {
            return
        }
        if (!isInitialMountRestored.current && sessionStorage.getItem('animeListScroll')) {
            return
        }
        setDisplayCount(50)
    }, [searchTerm, sortConfig, seriesFilter])

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
        if (sortConfig.key !== key) return ' ↕'
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

    // Split genres string ("Action;Adventure") into a trimmed array
    const genreList = (anime) => (anime.genres || '').split(';').map(g => g.trim()).filter(Boolean)

    // Rating label helper ("8/10" / "X/10")
    const ratingText = (anime) => {
        if (anime.rating && !isNaN(Number(anime.rating))) {
            const v = Number(anime.rating)
            return `${v % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}/10`
        }
        return 'X/10'
    }

    const goToDetail = (anime) => {
        sessionStorage.setItem('animeListScroll', window.scrollY)
        sessionStorage.setItem('animeListDisplayCount', displayCount)
        navigate(animePath(anime.name))
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

    const toggleSeriesFilter = (anime) => {
        const baseName = extractSeriesBaseName(anime)
        if (seriesFilter === baseName) {
            clearSeriesFilter()
        } else {
            // Save current scroll position and displayCount before filtering shrinks the page
            setSavedScrollPos(window.scrollY)
            setSavedDisplayCount(displayCount)

            setSeriesFilter(baseName)
            // Reset other filters to show the FULL series as requested
            clearAllFilters()
        }
    }

    // Zrušení filtru série — přes transition, ať vykreslení mnoha řádků nezamrzne
    // UI. Scroll se obnoví, až transition dorendruje (efekt níže na isPending).
    const clearSeriesFilter = () => {
        pendingScrollRestore.current = true
        startTransition(() => {
            if (savedDisplayCount !== null) setDisplayCount(savedDisplayCount)
            setSeriesFilter(null)
        })
    }

    // Obnova scrollu po dokončení transition (řádky už jsou vykreslené)
    useEffect(() => {
        if (!isPending && pendingScrollRestore.current) {
            pendingScrollRestore.current = false
            requestAnimationFrame(() => {
                window.scrollTo({ top: savedScrollPos, behavior: 'instant' })
                setSavedScrollPos(0)
                setSavedDisplayCount(null)
            })
        }
    }, [isPending])

    // Get MAL URL - use direct URL or fallback to search
    const getMALUrl = (anime) => {
        if (anime.mal_url) return anime.mal_url
        // Fallback to search if no direct URL
        const cleanName = anime.name?.replace(/,\s*S\d+.*$/i, '').replace(/\s*Season\s*\d+.*$/i, '')
        return cleanName ? `https://myanimelist.net/anime.php?q=${encodeURIComponent(cleanName)}&cat=anime` : null
    }

    const subtitle = (() => {
        if (loading) return 'Načítám data…'
        const shownN = Math.min(displayCount, filteredList.length)
        return `Zobrazeno ${shownN} z ${filteredList.length} (celkem ${animeList.length}) · ${anyFilterActive ? 'aktivní filtr' : 'žádný aktivní filtr'}`
    })()

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="al-root" style={{ position: 'relative' }}>
            <div className="fade-in">
                {/* Header: nadpis + počet + podtitulek + souhrn statusů */}
                <div className="al-header">
                    <div className="al-header-left">
                        <div className="al-title-row">
                            <h2 className="al-title">Anime List</h2>
                            <span className="al-count-pill">{filteredList.length}</span>
                        </div>
                        <div className="al-subtitle">{subtitle}</div>
                    </div>
                    <div className="al-status-cards">
                        {statusSummary.map(s => (
                            <div key={s.key} className="al-status-card" style={{ borderLeftColor: s.color }}>
                                <span className="al-status-card-value" style={{ color: s.color }}>{s.value}</span>
                                <span className="al-status-card-label">{s.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Search + přepínač zobrazení */}
                <div className="al-toolbar-top">
                    <div className="al-search">
                        <span className="al-search-icon">🔍</span>
                        <input
                            type="text"
                            className="al-search-input"
                            placeholder="Hledat anime, studio, žánr..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="al-search-clear" onClick={() => setSearchTerm('')} title="Vymazat hledání">×</button>
                        )}
                    </div>
                    <div className="al-view-toggle">
                        <button
                            className={`al-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                            title="Kompaktní tabulka se všemi sloupci"
                        >☰ Tabulka</button>
                        <button
                            className={`al-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Mřížka náhledů 16:9 s jednotnou výškou karet"
                        >▦ Karty</button>
                    </div>
                </div>

                {/* Řazení (jen v režimu Karty) + filtry */}
                <div className="al-filters">
                    {viewMode === 'grid' && (
                        <>
                            <select
                                className="al-sort-select"
                                value={sortConfig.key}
                                onChange={(e) => {
                                    const key = e.target.value
                                    setSortConfig(prev => ({ key, direction: key === 'default' ? 'asc' : prev.direction }))
                                }}
                                title="Řadit podle"
                            >
                                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                            <button
                                className="al-sort-dir"
                                onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                                disabled={sortConfig.key === 'default'}
                                title="Přepnout směr řazení"
                            >
                                {sortConfig.direction === 'asc' ? '↑ Vzestupně' : '↓ Sestupně'}
                            </button>
                        </>
                    )}
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
                        <button className="al-clear-all" onClick={clearAllFilters}>
                            ✕ Zrušit filtry
                        </button>
                    )}
                </div>

                {/* Banner aktivního filtru série */}
                {seriesFilter && (
                    <div className="al-series-banner">
                        <span className="al-series-banner-label">Zúženo na sérii</span>
                        <span className="al-series-banner-name">{seriesFilter}</span>
                        <button className="al-series-banner-clear" onClick={clearSeriesFilter}>Zrušit filtr série</button>
                    </div>
                )}

                {/* ── Zobrazení: Tabulka ── */}
                {viewMode === 'table' && (
                    <>
                        <div className="table-container al-table hide-mobile">
                            <table>
                                {/* Šířky = obsah z návrhu + 14px mezery (7px/stranu); Název = zbytek (1fr) */}
                                <colgroup>
                                    <col style={{ width: '71px' }} />{/* # (46 + okraj 18 + 7) */}
                                    <col style={{ width: '106px' }} />{/* Náhled (92 + 14) */}
                                    <col />{/* Název — auto = zbytek (jako 1fr) */}
                                    <col style={{ width: '80px' }} />{/* Typ (66 + 14) */}
                                    <col style={{ width: '172px' }} />{/* Studio (158 + 14) */}
                                    <col style={{ width: '222px' }} />{/* Žánry (208 + 14) */}
                                    <col style={{ width: '72px' }} />{/* Ep. (58 + 14) */}
                                    <col style={{ width: '124px' }} />{/* Hodnocení (96 + 14 + info ikona) */}
                                    <col style={{ width: '122px' }} />{/* Dosledováno (108 + 14) */}
                                    <col style={{ width: '137px' }} />{/* Status (112 + 7 + okraj 18) */}
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th onClick={() => handleSort('index')} className={sortConfig.key === 'index' ? 'sorted' : ''}>
                                            #{getSortIndicator('index')}
                                        </th>
                                        <th style={{ width: '92px' }}>Náhled</th>
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
                                        <th onClick={() => handleSort('episodes')} className={sortConfig.key === 'episodes' ? 'sorted' : ''} style={{ textAlign: 'right' }}>
                                            Ep.{getSortIndicator('episodes')}
                                        </th>
                                        <th onClick={() => handleSort('rating')} className={sortConfig.key === 'rating' ? 'sorted' : ''} style={{ textAlign: 'center' }}>
                                            Hodnocení
                                            <span
                                                className="al-info-icon"
                                                title="Kliknutím na hodnocení v řádku zobrazíte detailní rozbor"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                                                    <circle cx="8" cy="8" r="6.6" />
                                                    <path d="M8 7.4v3.4" strokeLinecap="round" />
                                                    <circle cx="8" cy="4.9" r="0.5" fill="currentColor" stroke="none" />
                                                </svg>
                                            </span>
                                            {getSortIndicator('rating')}
                                        </th>
                                        <th onClick={() => handleSort('end_date')} className={sortConfig.key === 'end_date' ? 'sorted' : ''} style={{ textAlign: 'right' }}>
                                            Dosledováno{getSortIndicator('end_date')}
                                        </th>
                                        <th onClick={() => handleSort('status')} className={sortConfig.key === 'status' ? 'sorted' : ''} style={{ textAlign: 'right' }}>
                                            Status{getSortIndicator('status')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredList.slice(0, displayCount).map((anime, idx) => (
                                        <tr key={idx}>
                                            <td style={{ color: '#4f4b55', fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                {idx + 1}.
                                            </td>
                                            <td>
                                                {anime.thumbnail ? (
                                                    <div
                                                        className="al-thumb"
                                                        onMouseEnter={(e) => previewRef.current?.show(e.currentTarget.querySelector('img'), anime.thumbnail.replace(/#/g, '%23'), anime.name, e.currentTarget.getBoundingClientRect())}
                                                        onMouseLeave={() => previewRef.current?.hide()}
                                                    >
                                                        <img
                                                            src={anime.thumbnail.replace(/#/g, '%23')}
                                                            alt={anime.name}
                                                            loading="lazy"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="al-thumb al-thumb-empty">?</div>
                                                )}
                                            </td>
                                            <td>
                                                <div className="al-name-cell">
                                                    <a
                                                        href={getMALUrl(anime)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="anime-link"
                                                        style={{ fontWeight: '600' }}
                                                        title={anime.mal_url ? "Otevřít na MyAnimeList" : "Hledat na MyAnimeList"}
                                                    >
                                                        {anime.name.replace(/ (\d+)$/, ' $1')}
                                                    </a>
                                                    {isPartOfSeries(anime) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                toggleSeriesFilter(anime)
                                                            }}
                                                            className={`al-series-badge ${seriesFilter === extractSeriesBaseName(anime) ? 'active' : ''}`}
                                                            title={seriesFilter === extractSeriesBaseName(anime) ? "Zrušit filtr série" : "Filtrovat tuhle sérii"}
                                                        >
                                                            Série
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="al-type-badge" style={{ background: typeStyle(anime.type)[0], color: typeStyle(anime.type)[1] }}>
                                                    {anime.type || '-'}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '160px' }}>
                                                <span className="al-cell-clamp2" title={anime.studio || ''}>{anime.studio?.substring(0, 40) || '-'}</span>
                                            </td>
                                            <td style={{ maxWidth: '220px' }}>
                                                {genreList(anime).length > 0 ? (
                                                    <div className="al-genre-chips al-genre-chips-row" title={genreList(anime).join(', ')}>
                                                        {genreList(anime).map((g, i) => (
                                                            <span key={i} className="al-genre-chip" style={{ background: genreStyle(g)[0], color: genreStyle(g)[1] }}>{g}</span>
                                                        ))}
                                                    </div>
                                                ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                                {anime.episodes || '–'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span
                                                    className={`al-rating ${getRatingClass(anime.rating)}`}
                                                    onClick={() => goToDetail(anime)}
                                                    title="Zobrazit detailní hodnocení"
                                                >
                                                    {ratingText(anime)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontSize: '0.78rem', color: (anime.end_date && anime.end_date !== 'X') ? '#9d94a8' : '#4f4b55', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                                {formatDate(anime.end_date)}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={`al-status-pill ${(anime.status || 'FINISHED').toLowerCase().replace('!', '')}`}>
                                                    <span className="al-status-dot" />
                                                    {anime.status || 'FINISHED'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {filteredList.length === 0 && (
                                <div className="al-empty">Žádné anime neodpovídá filtrům.</div>
                            )}
                        </div>

                        {/* Mobilní karty (jako dosud) */}
                        <div className="mobile-card-list hide-desktop">
                            {filteredList.slice(0, displayCount).map((anime, idx) => (
                                <div key={idx} className="mobile-card">
                                    <div className="mobile-card-header">
                                        <div style={{ display: 'flex', gap: 'var(--spacing-md)', width: '100%', alignItems: 'center' }}>
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
                                                            className="anime-link"
                                                        >
                                                            {anime.name}
                                                        </a>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span className={`type-badge ${getTypeBadgeClass(anime.type)}`} style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                                                        {anime.type || '-'}
                                                    </span>
                                                    <span className={`al-status-pill ${(anime.status || 'FINISHED').toLowerCase().replace('!', '')}`} style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                                                        <span className="al-status-dot" />
                                                        {anime.status || 'FINISHED'}
                                                    </span>
                                                    {isPartOfSeries(anime) && (
                                                        <button
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSeriesFilter(anime) }}
                                                            className={`al-series-badge ${seriesFilter === extractSeriesBaseName(anime) ? 'active' : ''}`}
                                                        >Série</button>
                                                    )}
                                                </div>
                                            </div>

                                            <div
                                                style={{ textAlign: 'right', minWidth: '50px', marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '2px' }}
                                                onClick={() => goToDetail(anime)}
                                            >
                                                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: anime.rating && !isNaN(Number(anime.rating)) ? getRatingColor(anime.rating) : 'var(--text-muted)' }}>
                                                    {anime.rating && !isNaN(Number(anime.rating)) ? (Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 2 })) : 'X'}
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/10</span>
                                            </div>
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
                    </>
                )}

                {/* ── Zobrazení: Karty (mřížka 16:9) ── */}
                {viewMode === 'grid' && (
                    filteredList.length === 0 ? (
                        <div className="al-empty">Žádné anime neodpovídá filtrům.</div>
                    ) : (
                        <div className="al-grid">
                            {filteredList.slice(0, displayCount).map((anime, idx) => (
                                <div key={idx} className="al-card">
                                    <div
                                        className="al-card-poster"
                                        onClick={() => goToDetail(anime)}
                                    >
                                        {anime.thumbnail ? (
                                            <img src={anime.thumbnail.replace(/#/g, '%23')} alt={anime.name} loading="lazy" />
                                        ) : (
                                            <span className="al-card-noposter">?</span>
                                        )}
                                    </div>
                                    <div className="al-card-body">
                                        <div className="al-card-top">
                                            <span className="al-type-badge al-type-badge-card" style={{ background: typeStyle(anime.type)[0], color: typeStyle(anime.type)[1] }}>{anime.type || '-'}</span>
                                            <a
                                                href={getMALUrl(anime)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="al-card-name anime-link"
                                                title={anime.name}
                                            >
                                                {anime.name}
                                            </a>
                                            <span
                                                className={`al-rating ${getRatingClass(anime.rating)}`}
                                                onClick={() => goToDetail(anime)}
                                                title="Zobrazit detailní hodnocení"
                                            >
                                                {ratingText(anime)}
                                            </span>
                                        </div>

                                        <div className="al-card-mid">
                                            <div className="al-genre-chips">
                                                {genreList(anime).map((g, i) => (
                                                    <span key={i} className="al-genre-chip" style={{ background: genreStyle(g)[0], color: genreStyle(g)[1] }}>{g}</span>
                                                ))}
                                            </div>
                                            {anime.studio && (
                                                <span className="al-card-studio" title={`Studio: ${anime.studio}`}>
                                                    <IconStudio />
                                                    <span className="al-card-studio-txt">{anime.studio.split(';')[0].trim()}</span>
                                                </span>
                                            )}
                                        </div>

                                        <div className="al-card-foot">
                                            <span className={`al-status-pill ${(anime.status || 'FINISHED').toLowerCase().replace('!', '')}`}>
                                                <span className="al-status-dot" />
                                                {anime.status || 'FINISHED'}
                                            </span>
                                            <span className="al-card-ep" title="Počet epizod">
                                                <IconEp />
                                                {anime.episodes ? `${anime.episodes} EP` : '– EP'}
                                            </span>
                                            <span
                                                className="al-card-watched"
                                                style={anime.end_date && anime.end_date !== 'X' ? undefined : { color: 'var(--text-muted)' }}
                                                title={anime.end_date && anime.end_date !== 'X' ? `Dosledováno (poslední díl): ${formatDate(anime.end_date)}` : 'Zatím nedokoukáno'}
                                            >
                                                <IconWatched />
                                                {formatDate(anime.end_date)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}

                {/* Infinite Scroll Sentinel and Show All button (obě zobrazení) */}
                {displayCount < filteredList.length && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: 'var(--spacing-lg)', marginBottom: 'var(--spacing-md)' }}>
                        <div ref={sentinelRef} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Načítání dalších záznamů...
                        </div>
                        <button
                            className="al-load-more"
                            onClick={() => setDisplayCount(filteredList.length)}
                        >
                            ZOBRAZIT VŠE (Ctrl+F vyhledávání)
                        </button>
                    </div>
                )}

                {/* Full-screen Image Modal (mobil) */}
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

            </div>

            {/* Plovoucí velký náhled — vlastní komponenta s imperativním API,
                aby najetí myší nepřekreslovalo celou tabulku */}
            <HoverPreview ref={previewRef} />

            {/* Detail overlay */}
            {isDetailOpen && (
                <div className="anime-detail-overlay">
                    <Outlet />
                </div>
            )}

            {showScrollTop && !isDetailOpen && createPortal(
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
                        bottom: 'var(--fab-bottom)', /* na mobilu nad spodní lištou, ať nesedí na „Ostatní" */
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
                        zIndex: 9999,
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

export default AnimeList
