import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import DashboardGroup from '../components/DashboardGroup'

// Minihra „Hádej OP/ED“ — izolovaná featura, načítá se lazy až při spuštění
const OpEdQuizGame = lazy(() => import('../components/opedquiz/OpEdQuizGame'))
import { VideoModal } from '../components/CategoryMediaPlayers'
import { useOstPlayer } from '../components/OstPlayerProvider'
import { normalizeAnimeKey, extractYoutubeId, extractYoutubePlaylistId, findOpEdVideo, animeKeysMatch, songsLooselyMatch, translateArtist } from '../utils/mediaMatch'
import { getDominantColor } from '../utils/dominantColor'
import { getPlaylistCounts, OST_COUNTS_EVENT } from '../utils/ostPlaylistCounts'
import { getAnilistArtists, ANILIST_ARTISTS_EVENT } from '../utils/anilistStaffCache'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Title,
    Tooltip,
    Legend
} from 'chart.js'
import { Pie, Bar, Radar, Line } from 'react-chartjs-2'
import './Favorites.css'
import { animePath } from '../utils/animeSlug'

ChartJS.register(
    CategoryScale, LinearScale, BarElement, ArcElement,
    RadialLinearScale, PointElement, LineElement, Filler,
    Title, Tooltip, Legend
)

// Simplified options for collapsed mini-charts (like on Dashboard)
const miniChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { display: false },
        excelImageBackground: false
    },
    scales: {
        x: { display: false },
        y: { display: false }
    },
    elements: {
        point: { radius: 0 },
        bar: { borderWidth: 0 },
        arc: { borderWidth: 1 }
    }
}

const miniPieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { display: false },
        excelImageBackground: false
    },
    layout: { padding: 4 }
}

// ── Karta „OST Only (As a Whole)" ───────────────────────────────────────────
// Pozadí karty přebírá dominantní barvu z obalu playlistu (vzhled jako na
// Spotify). Barva se počítá z lokálního obrázku přes canvas; když se nepodaří
// (chybějící obal), karta zůstane na výchozím pozadí.
// Pomocná funkce pro převod délky (např. "2 hours, 33 minutes" -> "2:33:00")
const parseDurationToHMS = (durationStr) => {
    if (!durationStr) return null
    const hMatch = durationStr.match(/(\d+)\s*hour/)
    const mMatch = durationStr.match(/(\d+)\s*minute/)
    const sMatch = durationStr.match(/(\d+)\s*second/)
    
    const h = hMatch ? parseInt(hMatch[1], 10) : 0
    const m = mMatch ? parseInt(mMatch[1], 10) : 0
    const s = sMatch ? parseInt(sMatch[1], 10) : 0
    
    // Vždy h:mm:ss, i když je hodin nula. Dřív se vracelo „51:00" pro 51 minut,
    // což se vedle „3:14:00" četlo jako 51 hodin.
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Sekundy z playlistu na týž tvar h:mm:ss
const formatSeconds = (total) => {
    if (!total || total <= 0) return null
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = Math.floor(total % 60)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Kolik autorů se vejde na kartu, zbytek jde do tooltipu
const MAX_CARD_ARTISTS = 3

// Cesta k předgenerované zmenšenině obalu (tools/build_cover_thumbs.py).
// Obal se kreslí do čtverce 104 px, ale originály mají až 2160 px a prohlížeč
// je zmenšuje metodou, která rozbíjí tenkou linku anime kresby. Zmenšeniny jsou
// hotové filtrem LANCZOS, takže prohlížeč nezmenšuje nic. Když zmenšenina
// chybí, komponenta se sama vrátí k originálu.
const coverThumbPath = (src) => {
    if (!src || !src.startsWith('images/spotify/')) return null
    const file = src.slice('images/spotify/'.length)
    return `images/spotify/thumbs/${file.replace(/\.(jpe?g|png|webp)$/i, '')}.jpg`
}

// Autoři ze VŠECH alb série, ne jen z jednoho. U delších sérií se skladatelé
// střídají a karta má ukázat všechny: Berserk z roku 1997 složil Susumu
// Hirasawa, verzi z roku 2016 Shiro Sagisu. Dřív se vypsal jen ten z vybraného
// alba a druhý zmizel.
const collectArtists = (albums, animeKey) => {
    const seen = new Set()
    const names = []
    for (const a of albums) {
        if (!a?.artists || a.artists === 'Various Artists') continue
        for (const raw of translateArtist(a.artists).split(',')) {
            const name = raw.trim()
            if (!name) continue
            // Katalog někdy místo autora vrátí název alba nebo kanálu
            // („NEON GENESIS EVANGELION (OST)"). Poznáme to podle toho, že se
            // to kryje s názvem anime, případně to rovnou hlásí soundtrack.
            const bare = normalizeAnimeKey(name)
            if (!bare) continue
            if (animeKey && (bare === animeKey || bare.includes(animeKey) || animeKey.includes(bare))) continue
            if (/\b(ost|soundtrack|original score)\b/i.test(name)) continue
            // Klíč z abecedně seřazených částí jména: „Shiro SAGISU" a
            // „Sagisu Shiro" je tentýž člověk s prohozeným pořadím, stejně jako
            // „Hiroyuki Sawano" a „Hiroyuki SAWANO" jen jinak psaný.
            const dedupeKey = bare.split(' ').sort().join(' ')
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            names.push(name)
        }
    }
    return names
}

// Automatické rolování seznamu best pieces při najetí myší na kartu.
// Chipy mají pevnou výšku (tři řádky), takže u karet s víc skladbami je zbytek
// schovaný. Po chvilce hoveru se seznam sám pomalu sroluje dolů, na konci
// počká a vrátí se nahoru. Odjetí myší posun okamžitě zruší.
const AUTOSCROLL_DELAY = 600    // ms, ať projetí myší přes mřížku nerozjede všechny karty
const AUTOSCROLL_SPEED = 18     // px za sekundu
const AUTOSCROLL_END_PAUSE = 900

function useBestAutoScroll() {
    const ref = useRef(null)
    const timerRef = useRef(null)
    const rafRef = useRef(null)
    // Přetéká seznam chipů? Podle toho se zapíná `overscroll-behavior: contain`.
    // U karty, která se vejde celá, by contain spolklo kolečko myši a stránka
    // by se pod kurzorem nehnula.
    const [scrollable, setScrollable] = useState(false)

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const check = () => setScrollable(el.scrollHeight - el.clientHeight > 1)
        check()
        // Chipy se dopočítávají a karta mění šířku podle okna, proto sledujeme
        // i změny velikosti, ne jen první vykreslení.
        const ro = new ResizeObserver(check)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const stop = useCallback(() => {
        clearTimeout(timerRef.current)
        cancelAnimationFrame(rafRef.current)
        timerRef.current = null
        rafRef.current = null
        const el = ref.current
        if (el) el.scrollTop = 0
    }, [])

    const start = useCallback(() => {
        const el = ref.current
        if (!el) return
        // Kdo má v systému vypnuté animace, dostane jen normální rolovací seznam
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
        const maxScroll = el.scrollHeight - el.clientHeight
        if (maxScroll <= 1) return   // vejde se celý, není co rolovat

        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            let last = null
            let pausedUntil = 0
            let dir = 1
            const step = (now) => {
                const node = ref.current
                if (!node) return
                if (last === null) last = now
                const dt = (now - last) / 1000
                last = now
                if (now >= pausedUntil) {
                    node.scrollTop += dir * AUTOSCROLL_SPEED * dt
                    if (dir > 0 && node.scrollTop >= maxScroll - 0.5) {
                        node.scrollTop = maxScroll
                        pausedUntil = now + AUTOSCROLL_END_PAUSE
                        dir = -1
                    } else if (dir < 0 && node.scrollTop <= 0.5) {
                        node.scrollTop = 0
                        pausedUntil = now + AUTOSCROLL_END_PAUSE
                        dir = 1
                    }
                }
                rafRef.current = requestAnimationFrame(step)
            }
            rafRef.current = requestAnimationFrame(step)
        }, AUTOSCROLL_DELAY)
    }, [])

    useEffect(() => () => {
        clearTimeout(timerRef.current)
        cancelAnimationFrame(rafRef.current)
    }, [])

    // Vrací se pole, ne objekt: díky tomu si komponenta hodnoty rovnou
    // rozbalí do proměnných a nesahá na `.ref` během renderu.
    return [ref, start, stop, scrollable]
}

function OstWholeCard({ card, onPlayPlaylist, onPlayBest }) {
    const [tint, setTint] = useState(null)
    const [bestListRef, startBestScroll, stopBestScroll, bestScrollable] = useBestAutoScroll()

    useEffect(() => {
        if (!card.image) return
        let cancelled = false
        getDominantColor(card.image).then(c => { if (!cancelled) setTint(c) })
        return () => { cancelled = true }
    }, [card.image])

    const rgb = tint ? `${tint.r}, ${tint.g}, ${tint.b}` : null
    const style = rgb
        ? {
            background: `linear-gradient(160deg, rgba(${rgb}, 0.28) 0%, rgba(${rgb}, 0.12) 42%, var(--bg-tertiary) 90%)`,
            borderColor: `rgba(${rgb}, 0.35)`,
            '--fav-card-tint': rgb,
        }
        : undefined

    // Už přichází hotové jako h:mm:ss (viz wholeCards)
    const formattedDuration = card.albumDuration

    // Určení barvy odznaku pořadí
    const getRankBadgeClass = (rank) => {
        if (rank === 1) return 'rank-badge-gold'
        if (rank === 2) return 'rank-badge-silver'
        if (rank === 3) return 'rank-badge-bronze'
        return 'rank-badge-default'
    }

    return (
        <div
            className="fav-whole-card"
            style={style}
            onMouseEnter={startBestScroll}
            onMouseLeave={stopBestScroll}
        >
            {/* Horní sekce: obal a textové info */}
            <div className="fav-whole-main-row">
                <div className="fav-whole-left-col">
                    <div className="fav-whole-cover" onClick={onPlayPlaylist}
                        title={card.groupIdx >= 0 ? `Přehrát playlist: ${card.anime_name}` : card.anime_name}>
                        
                        {/* Odznak pořadí (Rank) překrývající levý horní roh */}
                        <div className={`fav-whole-rank-badge ${getRankBadgeClass(card.rank)}`}>
                            {card.rank}
                        </div>

                        {card.image
                            ? <img
                                src={coverThumbPath(card.image) || card.image}
                                alt=""
                                loading="lazy"
                                onError={(e) => {
                                    // Zmenšenina ještě není vygenerovaná → originál
                                    if (e.currentTarget.dataset.fallback) return
                                    e.currentTarget.dataset.fallback = '1'
                                    e.currentTarget.src = card.image
                                }}
                            />
                            : <div className="fav-whole-cover-ph">♪</div>}
                        
                        {card.groupIdx >= 0 && (
                            <button 
                                type="button" 
                                className="fav-whole-cover-play" 
                                title={`Přehrát playlist: ${card.anime_name}`}
                                onClick={(e) => { e.stopPropagation(); onPlayPlaylist() }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </button>
                        )}
                    </div>
                    {card.best.length > 0 && (
                        <span className="fav-whole-best-label">Best Pieces</span>
                    )}
                </div>

                <div className="fav-whole-body">
                    <div className="fav-whole-titlerow">
                        {card.linkTo ? (
                            <Link
                                to={card.linkTo}
                                className="fav-whole-name anime-link"
                                title={card.parts > 1
                                    ? `Zobrazit celou sérii v Anime Listu: ${card.anime_name}`
                                    : `Otevřít detail: ${card.anime_name}`}
                            >
                                {card.anime_name}
                            </Link>
                        ) : (
                            <span className="fav-whole-name" title={card.anime_name}>{card.anime_name}</span>
                        )}
                        {card.rating !== null && (
                            <span className="fav-whole-rating" title="Můj průměr hodnocení série">
                                ★ {card.rating.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}
                            </span>
                        )}
                    </div>

                    {/* Autoři a rok vydání */}
                    {(card.artists || card.year) && (
                        <div className="fav-whole-artists-row">
                            {card.artists && (
                                <span className="fav-whole-artists" title={card.artistsFull || undefined}>
                                    {card.artists}
                                </span>
                            )}
                            {card.year && <span className="fav-whole-year">{card.year}</span>}
                        </div>
                    )}

                    {/* Hudební typy OST (z rozborů) — nahradily žánry anime */}
                    {card.ostTypes.length > 0 && (
                        <div className="fav-whole-tags">
                            {card.ostTypes.map(g => <span key={g} className="fav-whole-tag genre">{g}</span>)}
                        </div>
                    )}

                    {/* Počet skladeb a celková délka alba (hh:mm:ss) */}
                    {card.trackCount && (
                        <div className="fav-whole-tracks-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
                                </svg>
                                <span title={card.durationApprox
                                    ? 'Délka je přibližná: část videí v playlistu už na YouTube není dostupná, takže se do součtu nezapočítala.'
                                    : undefined}>
                                    {card.trackCount} skladeb
                                    {formattedDuration ? ` · ${formattedDuration}` : ''}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Střední sekce: Seznam všech nejlepších skladeb (BEST) přes celou šířku pod obalem */}
            {card.best.length > 0 && (
                <div className={`fav-whole-best-section${bestScrollable ? ' is-scrollable' : ''}`} ref={bestListRef}>
                    {card.best.map((p, i) => (
                        <button
                            key={p.ost_name || i}
                            type="button"
                            className="fav-whole-best-chip-new"
                            onClick={() => onPlayBest(p)}
                            title={`Přehrát „${p.ost_name}“ jako první, playlist pak pokračuje`}
                        >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M8 5v14l11-7z" /></svg>
                            <span className="best-chip-text">{p.ost_name}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Spodní panel s externími odkazy (Spotify a YouTube) */}
            <div className="fav-whole-footer">
                {card.spotify_url && (
                    <a href={card.spotify_url} target="_blank" rel="noreferrer" className="ext-link-new spotify">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" width="12" height="12">
                            <path fill="#1ed760" d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z"/>
                            <path d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.2 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z"/>
                        </svg>
                        <span>Spotify</span>
                    </a>
                )}
                {card.yt_url && (
                    <a href={card.yt_url} target="_blank" rel="noreferrer" className="ext-link-new youtube">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28.57 20" width="16" height="11">
                            <g>
                                <path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z" fill="#FF0000"></path>
                                <path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="white"></path>
                            </g>
                        </svg>
                        <span>YouTube</span>
                    </a>
                )}
            </div>
        </div>
    )
}


function Favorites() {
    const [favorites, setFavorites] = useState([])
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
    const [expandedGroups, setExpandedGroups] = useState(new Set([]))
    const toggleGroup = (id) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }
    // Stav tabulky OP/ED se drží v sessionStorage, aby „Zpět" z detailu anime
    // vrátil uživatele na stejné místo (stejné filtry, řazení i rozbalení)
    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('fav_search_term') || '')
    const [typeFilter, setTypeFilter] = useState(() => sessionStorage.getItem('fav_type_filter') || 'all')
    const [ratingFilter, setRatingFilter] = useState(() => sessionStorage.getItem('fav_rating_filter') || 'all')
    const [languageFilter, setLanguageFilter] = useState(() => sessionStorage.getItem('fav_language_filter') || 'all')
    const [sortColumn, setSortColumn] = useState(() => sessionStorage.getItem('fav_sort_column') || null)
    const [sortDirection, setSortDirection] = useState(() => sessionStorage.getItem('fav_sort_direction') || 'desc')
    const [expandedCardIdx, setExpandedCardIdx] = useState(null)
    const [isTableExpanded, setIsTableExpanded] = useState(() => {
        // Rozbalení tabulky si pamatujeme pouze při návratu z detailu anime (existuje-li v paměti favorites_scroll_y)
        return Boolean(sessionStorage.getItem('favorites_scroll_y') && sessionStorage.getItem('fav_table_expanded') === '1')
    })
    const [ostTables, setOstTables] = useState(null)
    const [spotifyImages, setSpotifyImages] = useState({})
    const [opEdVideos, setOpEdVideos] = useState([])       // Gdrive videa OP/ED (stejná knihovna jako v detailu)
    const [animeThemes, setAnimeThemes] = useState([])     // záložní znělky z AnimeThemes (statický katalog)
    const [ytmusicAlbums, setYtmusicAlbums] = useState([]) // YT Music alba — počet skladeb u karet As a Whole
    const [playlistDurations, setPlaylistDurations] = useState({}) // počet + délka přímo z YT playlistů
    const [ostTypesMap, setOstTypesMap] = useState({})     // hudební typy OST z rozborů (tools/build_ost_types.py)
    const [wholeSearch, setWholeSearch] = useState('')     // hledání v kartách As a Whole
    // Řazení sekce „OST Only (The Best)": 'none' = pořadí z Excelu.
    // Drží se mezi návštěvami, stejně jako shuffle v přehrávači.
    const [piecesSort, setPiecesSort] = useState(() => {
        try { return localStorage.getItem('fav_pieces_sort') || 'none' } catch { return 'none' }
    })
    useEffect(() => {
        try { localStorage.setItem('fav_pieces_sort', piecesSort) } catch { /* quota */ }
    }, [piecesSort])
    const togglePiecesSort = useCallback(() => {
        setPiecesSort(prev => (prev === 'none' ? 'newest' : prev === 'newest' ? 'oldest' : 'none'))
    }, [])
    // Počty skladeb zjištěné přehrávačem při spuštění playlistu (localStorage).
    // Aktualizují se hned, jak přehrávač playlist načte — bez reloadu stránky.
    const [playlistCounts, setPlaylistCounts] = useState(() => getPlaylistCounts())
    useEffect(() => {
        const onChange = () => setPlaylistCounts(getPlaylistCounts())
        window.addEventListener(OST_COUNTS_EVENT, onChange)
        return () => window.removeEventListener(OST_COUNTS_EVENT, onChange)
    }, [])
    const [anilistVersion, setAnilistVersion] = useState(0)
    useEffect(() => {
        const onChange = () => setAnilistVersion(v => v + 1)
        window.addEventListener(ANILIST_ARTISTS_EVENT, onChange)
        return () => window.removeEventListener(ANILIST_ARTISTS_EVENT, onChange)
    }, [])
    const [videoModal, setVideoModal] = useState(null)     // přehrávané OP/ED video v modálu
    const [quizOpen, setQuizOpen] = useState(false)         // minihra „Hádej OP/ED“
    const { openPlayer } = useOstPlayer()                  // globální OST přehrávač (přežívá navigaci)
    const animeListRef = useRef([])                         // pro dohledání watch_date u OST pieces

    // Czech number formatting: dot → comma
    const toCS = (val) => String(val).replace('.', ',')

    // Persist stavu tabulky (viz inicializace výše)
    useEffect(() => {
        sessionStorage.setItem('fav_search_term', searchTerm)
        sessionStorage.setItem('fav_type_filter', typeFilter)
        sessionStorage.setItem('fav_rating_filter', ratingFilter)
        sessionStorage.setItem('fav_language_filter', languageFilter)
        sessionStorage.setItem('fav_sort_column', sortColumn || '')
        sessionStorage.setItem('fav_sort_direction', sortDirection)
    }, [searchTerm, typeFilter, ratingFilter, languageFilter, sortColumn, sortDirection])

    // Před odchodem na detail anime si zapamatovat pozici scrollu a stav rozbalení…
    const saveScrollForReturn = () => {
        const mc = document.querySelector('.main-content')
        const y = Math.max(window.scrollY || 0, mc ? mc.scrollTop : 0)
        sessionStorage.setItem('favorites_scroll_y', String(Math.round(y)))
        sessionStorage.setItem('fav_table_expanded', isTableExpanded ? '1' : '0')
    }

    // …a po návratu („Zpět" v prohlížeči) ji obnovit, jakmile jsou data vykreslená.
    // Několik pokusů kvůli postupnému načítání obrázků/grafů (posun layoutu).
    useEffect(() => {
        if (loading) return
        const saved = parseInt(sessionStorage.getItem('favorites_scroll_y') || '0', 10)
        if (!saved) return
        sessionStorage.removeItem('favorites_scroll_y')
        const restore = () => {
            window.scrollTo({ top: saved, behavior: 'instant' })
            const mc = document.querySelector('.main-content')
            if (mc) mc.scrollTo({ top: saved, behavior: 'instant' })
        }
        requestAnimationFrame(restore)
        const t1 = setTimeout(restore, 120)
        const t2 = setTimeout(restore, 450)
        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [loading])

    useEffect(() => {
        Promise.all([
            fetch('data/favorites.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/favorites_ost.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            fetch('data/spotify_images.json?v=' + Date.now()).then(r => r.json()).catch(() => ({})),
            fetch('data/op_ed_videos.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()).catch(() => []),
            // Katalog AnimeThemes: záloha pro OP/ED, které nemám na Google Drive
            fetch('data/animethemes_op_ed.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            // YT Music katalog: počet skladeb a délka alba pro karty As a Whole
            fetch('data/ytmusic_ost.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            // Počet skladeb a délka spočítané přímo z mých YouTube playlistů
            // (tools/build_ytmusic_durations.py). Oba údaje z jednoho zdroje.
            fetch('data/ost_playlist_durations.json?v=' + Date.now()).then(r => r.json()).catch(() => null),
            // Hudební typy OST odvozené z rozborů (tools/build_ost_types.py)
            fetch('data/ost_types.json?v=' + Date.now()).then(r => r.json()).catch(() => ({}))
        ])
            .then(([favData, ostData, spotData, opEdData, animeListData, atData, ymData, durData, typesData]) => {
                animeListRef.current = animeListData || []
                const decorated = (favData || []).map(fav => {
                    const favKey = normalizeAnimeKey(fav.anime_name)
                    const match = (animeListData || []).find(a => {
                        const aKey = normalizeAnimeKey(a.name)
                        return animeKeysMatch(aKey, favKey) || animeKeysMatch(favKey, aKey)
                    })
                    const watchDate = match ? (match.end_date || match.start_date || null) : null
                    // MAL id pro fallback přehrávače na AnimeThemes.moe
                    const malMatch = (match?.mal_url || '').match(/myanimelist\.net\/anime\/(\d+)/)
                    return {
                        ...fav,
                        watch_date: watchDate,
                        mal_id: malMatch ? parseInt(malMatch[1], 10) : null
                    }
                })
                setFavorites(decorated)
                if (ostData) setOstTables(ostData)
                if (spotData) setSpotifyImages(spotData)
                if (opEdData && opEdData.videos) setOpEdVideos(opEdData.videos)
                if (atData && atData.themes) setAnimeThemes(atData.themes)
                if (ymData && ymData.albums) setYtmusicAlbums(ymData.albums)
                if (durData && durData.playlists) setPlaylistDurations(durData.playlists)
                if (typesData) setOstTypesMap(typesData)
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load favorites:', err)
                setLoading(false)
            })
    }, [])

    // Vyčištění SharePoint odkazu pro přímé otevření videa v prohlížeči
    const getCleanSceneUrl = useCallback((url) => {
        if (!url) return null
        if (url.startsWith('http://') || url.startsWith('https://')) return url
        
        // Zkusí najít SharePoint cestu
        const match = url.match(/(?::?[vw]:)?\/g\/personal\/(.+)$/)
        if (match) {
            return 'https://savsmb-my.sharepoint.com/:v:/g/personal/' + match[1]
        }
        
        // Fallback pro /personal/
        const personalIdx = url.indexOf('/personal/')
        if (personalIdx !== -1) {
            return 'https://savsmb-my.sharepoint.com' + url.substring(personalIdx)
        }
        return url
    }, [])

    // ---- Párování řádků OP/ED tabulky na Gdrive videa ----
    // Používá sdílený robustní matcher (findOpEdVideo) — stejný jako v detailu.
    // Toleruje rozdíly v zápisu řady/části (např. soubor "Bocchi The Rock!, S01"
    // vs. řádek "Bocchi The Rock!"), takže se namapuje každá písnička.
    const findVideoFor = useCallback((fav) => {
        return findOpEdVideo(opEdVideos, {
            animeName: fav.anime_name,
            animeSeries: fav.series,
            type: fav.type,
            song: fav.song,
        })
    }, [opEdVideos])

    // Záloha pro řádky bez Gdrive videa: tatáž znělka z katalogu AnimeThemes.
    // Páruje se přes MAL id + typ (OP/ED) + tolerantní shodu názvu písně
    // (romanizace se mezi mým zápisem a katalogem často liší). Když je v katalogu
    // pro daný typ jen jediná znělka, bere se i bez shody názvu.
    const findAnimeThemeFor = useCallback((fav) => {
        const type = (fav.type || '').trim().toUpperCase()
        if (!fav.mal_id || (type !== 'OP' && type !== 'ED')) return null
        const ofType = animeThemes.filter(t => t.mal_id === fav.mal_id && t.type === type && (t.video_url || t.audio_url))
        if (!ofType.length) return null
        return ofType.find(t => songsLooselyMatch(t.song, fav.song))
            || (ofType.length === 1 ? ofType[0] : null)
    }, [animeThemes])

    // Co je u řádku přehratelné: Gdrive má vždy přednost (moje vybrané verze),
    // AnimeThemes naskočí jen tam, kde Gdrive video nemám.
    const findPlayableFor = useCallback((fav) => {
        const v = findVideoFor(fav)
        if (v) return { source: 'gdrive', video: v }
        const t = findAnimeThemeFor(fav)
        return t ? { source: 'animethemes', theme: t } : null
    }, [findVideoFor, findAnimeThemeFor])

    const playOpEdVideo = useCallback((fav) => {
        const p = findPlayableFor(fav)
        if (!p) return
        if (p.source === 'gdrive') {
            const v = p.video
            const type = (v.type || '').toUpperCase()
            setVideoModal({
                kind: 'video',
                type,
                song: v.song || fav.song || null,
                artist: v.artist || fav.author || null,
                label: v.ver ? `${type} ${v.ver}` : type,
                url: v.url,
                file_id: v.file_id || null,
                anime_display: fav.anime_name || v.anime_display,
                malId: fav.mal_id || null // fallback přehrávače na AnimeThemes.moe
            })
            return
        }
        const t = p.theme
        setVideoModal({
            kind: 'video',
            type: t.type,
            song: t.song || fav.song || null,
            artist: t.artist || fav.author || null,
            label: t.label || t.type,
            url: t.video_url || t.audio_url,
            file_id: null,
            // isExtra = není to moje vybraná Gdrive verze; přehrávač to napíše
            // do podtitulku a nepokouší se o Gdrive fallbacky
            isExtra: true,
            anime_display: fav.anime_name,
            malId: fav.mal_id || null
        })
    }, [findPlayableFor])

    // Náhodné přehrání OP/ED z tabulky (jen řádky se spárovaným videoklipem).
    // Používá se pro tlačítko nahoře i pro re-roll uvnitř modalu.
    const playRandomOpEd = useCallback(() => {
        // Losuje se ze VŠECH oblíbených OP/ED, které jde přehrát — tedy i z těch,
        // co nemám na Gdrive a hrají se z AnimeThemes.
        const candidates = favorites.filter(f => {
            const t = (f.type || '').toUpperCase()
            return (t === 'OP' || t === 'ED') && !!findPlayableFor(f)
        })
        if (!candidates.length) return
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        playOpEdVideo(pick)
    }, [favorites, findPlayableFor, playOpEdVideo])

    // ---- Data pro OST přehrávač ----
    // Skladby „The Best" i s datem zhlédnutí anime (kvůli řazení).
    const piecesDecorated = useMemo(() => {
        if (!ostTables?.pieces) return []
        return ostTables.pieces.map(p => {
            const pieceKey = normalizeAnimeKey(p.anime_name)
            const match = animeListRef.current.find(a => {
                const aKey = normalizeAnimeKey(a.name)
                return animeKeysMatch(aKey, pieceKey) || animeKeysMatch(pieceKey, aKey)
            })
            return {
                ...p,
                ytId: extractYoutubeId(p.ost_url),
                watch_date: match ? (match.end_date || match.start_date || null) : null,
            }
        })
    }, [ostTables, favorites])

    // Zobrazené pořadí sekce „OST Only (The Best)". Výchozí je pořadí z Excelu,
    // přepínač umí ještě podle data zhlédnutí, stejně jako OST přehrávač.
    const piecesSorted = useMemo(() => {
        if (piecesSort === 'none') return piecesDecorated
        const withIdx = piecesDecorated.map((p, i) => ({ ...p, _origIndex: i }))
        withIdx.sort((a, b) => {
            const da = a.watch_date || '0000-00-00'
            const db = b.watch_date || '0000-00-00'
            const cmp = piecesSort === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
            // Stejné datum → zachovat původní pořadí z Excelu, ať to neposkakuje
            return cmp || (a._origIndex - b._origIndex)
        })
        return withIdx
    }, [piecesDecorated, piecesSort])

    // Přehrávač dostává skladby v TOMTÉŽ pořadí, v jakém je vidíš v seznamu,
    // aby „Přehrát vše" hrálo odshora dolů podle zvoleného řazení.
    const piecesTracks = useMemo(() => piecesSorted
        .filter(p => p.ytId)
        .map(p => ({ anime: p.anime_name, song: p.ost_name, ytId: p.ytId, watch_date: p.watch_date })),
    [piecesSorted])

    // Playlisty "As a Whole" seřazené stejně jako dlaždice, seskupené podle anime
    const sortedWhole = useMemo(() => {
        if (!ostTables?.whole) return []
        const parseOrder = (orderStr) => {
            if (orderStr === null || orderStr === undefined) return 9999
            const num = parseInt(String(orderStr).replace(/[^\d]/g, ''), 10)
            return isNaN(num) ? 9999 : num
        }
        return [...ostTables.whole].sort((a, b) => {
            const orderA = parseOrder(a.order)
            const orderB = parseOrder(b.order)
            if (orderA !== orderB) return orderA - orderB
            return a.anime_name.localeCompare(b.anime_name)
        })
    }, [ostTables])

    const wholeGroups = useMemo(() => {
        return sortedWhole
            .map(w => {
                const playlistId = extractYoutubePlaylistId(w.yt_url)
                if (!playlistId) return null
                return { name: w.anime_name, playlistId, spotifyUrl: w.spotify_url || null }
            })
            .filter(Boolean)
    }, [sortedWhole])

    // ── Karty „OST Only (As a Whole)" ───────────────────────────────────────
    // Ke každému playlistu se dopočítá kontext série z anime_list.json
    // (hodnocení, žánry/témata, počet dílů a délka), best pieces z `pieces`
    // a počet skladeb z YT Music katalogu, když ho pro dané album zná.
    const wholeCards = useMemo(() => {
        const list = animeListRef.current || []
        const splitTags = (s) => String(s || '').split(';').map(x => x.split(':')[0].trim()).filter(x => x && x.toLowerCase() !== 'x')
        const topOf = (values, limit) => {
            const counts = new Map()
            for (const v of values) {
                const k = v.toLowerCase()
                const e = counts.get(k)
                if (e) e.n++; else counts.set(k, { name: v, n: 1 })
            }
            return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit).map(x => x.name)
        }

        return sortedWhole.map((w, i) => {
            const key = normalizeAnimeKey(w.anime_name)
            // Členové série. Primárně se věří poli `series` z Excelu a přesnému
            // názvu. Shoda na začátek názvu je jen ZÁLOHA pro playlisty, u nichž
            // v Excelu žádná série vyplněná není (např. „The Unwanted Undead
            // Adventurer" existuje jen jako „…, S01").
            //
            // Dřív se záloha uplatňovala vždy, takže do série spadlo i anime,
            // které jen náhodou začíná stejným slovem: karta „Berserk" počítala
            // i „Berserk of Gluttony, S01" a ukazovala průměr 6,8 místo 7,0.
            // Kontaminovaly se tím i žánry, počet dílů a délka.
            const strictMembers = list.filter(a =>
                normalizeAnimeKey(a.series) === key || normalizeAnimeKey(a.name) === key)
            const members = strictMembers.length
                ? strictMembers
                : list.filter(a => normalizeAnimeKey(a.name).startsWith(key + ' '))
            const ratings = members.map(a => parseFloat(a.rating)).filter(v => !isNaN(v))
            const episodes = members.reduce((s, a) => s + (parseInt(a.episodes) || 0), 0)
            const minutes = members.reduce((s, a) => s + (parseInt(a.episodes) || 0) * (parseFloat(a.episode_duration) || 0), 0)

            // Best pieces se párují přes CELOU sérii, ne jen na přesný název:
            // playlisty jsou pojmenované sérií („Attack on Titan"), kdežto
            // skladby po sezónách („Attack on Titan, S01"), takže při shodě
            // jen na přesný název zůstalo 20 z 30 karet bez jediné skladby.
            const memberKeys = new Set(members.map(a => normalizeAnimeKey(a.name)))
            const best = (ostTables?.pieces || [])
                .filter(p => {
                    const pk = normalizeAnimeKey(p.anime_name)
                    return pk === key || memberKeys.has(pk) || pk.startsWith(key + ' ')
                })

            // Přednost má počet zjištěný přímo z playlistu (je to ten, který
            // opravdu poslouchám); YT Music album je záloha, když se playlist
            // ještě nikdy nepustil.
            const playlistId = extractYoutubePlaylistId(w.yt_url)
            const liveCount = playlistId ? playlistCounts[playlistId]?.count ?? null : null
            // Data ze skriptu tools/build_ytmusic_durations.py: počet skladeb
            // a jejich délka, obojí z téhož playlistu.
            //
            // Část playlistů YouTube nevydá celé: v hlavičce počítá i videa,
            // která mezitím zmizela (smazaná, privátní), ale ve výpisu je
            // nevrátí. Součet délek pak pokrývá jen dostupnou část, proto se
            // u těch karet ukazuje s vlnovkou („~4:11:11").
            const durRec = playlistId ? playlistDurations[playlistId] : null
            const playlistStats = durRec?.tracks ? durRec : null
            const durationApprox = !!(playlistStats?.listed && playlistStats.listed !== playlistStats.tracks)

            // Najdi nejlepší YT Music album pro tuhle sérii.
            //
            // Volná shoda přes podřetězec našla u „Attack on Titan" devět
            // kandidátů a vybrala prostě prvního s reálným autorem, což byl
            // „Attack on Titan OAD" — soundtrack k OVA o 16 skladbách. Karta pak
            // hlásila „129 skladeb · 1:17:00", kde ta délka patřila k šestnácti
            // stopám. Stejně dopadl Spy x Family (film Code: White) a
            // Evangelion (Rebuild 1.0 místo seriálu).
            //
            // Kandidáti se proto berou primárně z členů série (přesná shoda
            // názvu) a vybírá se ten, jehož počet skladeb je nejblíž skutečnému
            // playlistu. Když playlist ještě nikdy neběžel, rozhoduje reálný
            // autor a pak větší album.
            const albumsFromMembers = (ytmusicAlbums || [])
                .filter(a => memberKeys.has(normalizeAnimeKey(a.anime_name)))
            const albumsLoose = (ytmusicAlbums || []).filter(a => {
                const ak = normalizeAnimeKey(a.anime_name)
                return ak && (ak === key || ak.includes(key) || key.includes(ak))
            })
            const matchingAlbums = albumsFromMembers.length ? albumsFromMembers : albumsLoose

            const hasRealArtist = (a) => (a.artists && a.artists !== 'Various Artists') ? 1 : 0
            const albumYear = (a) => {
                const y = parseInt(a.year, 10)
                return isNaN(y) ? 9999 : y
            }
            const album = (() => {
                if (!matchingAlbums.length) return null
                const exact = matchingAlbums.find(a => normalizeAnimeKey(a.anime_name) === key)
                if (exact) return exact
                const ranked = [...matchingAlbums].sort((a, b) => {
                    // 1) Když víme, kolik skladeb playlist doopravdy má, vyhrává
                    //    album, které se tomu počtu nejvíc blíží. Počet i délka
                    //    pak patří k sobě.
                    if (liveCount) {
                        const da = Math.abs((a.track_count || 0) - liveCount)
                        const db = Math.abs((b.track_count || 0) - liveCount)
                        if (da !== db) return da - db
                    }
                    // 2) Album s reálným autorem před „Various Artists"
                    if (hasRealArtist(b) !== hasRealArtist(a)) return hasRealArtist(b) - hasRealArtist(a)
                    // 3) Nejstarší album série. Playlist bývá postavený na
                    //    původním díle, ne na pozdějším remaku: u Berserku je to
                    //    OST z roku 1997 (Susumu Hirasawa), ne verze z 2016
                    //    (Shiro Sagisu). Řadit podle počtu skladeb by tady
                    //    vybralo špatného autora.
                    if (albumYear(a) !== albumYear(b)) return albumYear(a) - albumYear(b)
                    return (b.track_count || 0) - (a.track_count || 0)
                })
                return ranked[0]
            })()
            const allArtists = collectArtists([album, ...matchingAlbums], key)

            let image = null
            if (spotifyImages) {
                const mk = Object.keys(spotifyImages).find(k => {
                    const ck = normalizeAnimeKey(k)
                    return ck && (key.includes(ck) || ck.includes(key))
                })
                if (mk) image = spotifyImages[mk]
            }

            // Roky se berou VÝHRADNĚ z anime, ne z vydání soundtracku.
            //
            // Dřív se do rozsahu počítal i rok alba, jenže to je datum vydání
            // desky, ne díla: remaster nebo reedice ho posunula o roky dopředu.
            // Cyberpunk: Edgerunners je jednosezónovka z roku 2022, ale karta
            // kvůli reedici hlásila „2022 - 2023"; Girls' Last Tour z roku 2017
            // dokonce „2017 - 2024" a Steins;Gate začínal 2010 podle OST ke hře,
            // i když anime je z roku 2011. Dohromady u 6 z 30 karet.
            const allYears = new Set()
            members.forEach(m => {
                if (m.release_date) {
                    const y = new Date(m.release_date).getFullYear()
                    if (!isNaN(y)) allYears.add(y)
                }
            })
            const sortedYears = Array.from(allYears).sort((a, b) => a - b)
            let yearDisplay = null
            if (sortedYears.length === 1) {
                yearDisplay = String(sortedYears[0])
            } else if (sortedYears.length > 1) {
                yearDisplay = `${sortedYears[0]} - ${sortedYears[sortedYears.length - 1]}`
            }

            return {
                ...w,
                rank: i + 1,
                image,
                groupIdx: wholeGroups.findIndex(g => g.name === w.anime_name),
                rating: ratings.length ? ratings.reduce((s, v) => s + v, 0) / ratings.length : null,
                parts: members.length,
                // Kam vede název na kartě: víc dílů → filtr série v Anime Listu
                // (stejně jako „Nejdelší série" na Dashboardu), jediné anime →
                // rovnou jeho detail. Když se nespáruje nic, název odkaz nemá.
                linkTo: (() => {
                    const seriesName = members.find(a => a.series)?.series
                    if (members.length > 1 && seriesName) return `/anime?series=${encodeURIComponent(seriesName)}`
                    return members.length ? animePath(members[0].name) : null
                })(),
                episodes,
                hours: minutes / 60,
                genres: topOf(members.flatMap(a => splitTags(a.genres)), 3),
                themes: topOf(members.flatMap(a => splitTags(a.themes)), 2),
                // Hudební typy OST z rozborů (build_ost_types.py) — na kartě
                // NAHRAZUJÍ žánry anime; žánry zůstávají v datech kvůli hledání.
                ostTypes: topOf(members.flatMap(a => ostTypesMap[a.name] || []), 3),
                // Počet skladeb a délka. Pořadí zdrojů:
                //   1. ost_playlist_durations.json — obojí spočítané z TÉHOŽ
                //      playlistu, takže k sobě zaručeně patří.
                //   2. živý počet z přehrávače (localStorage) — jen počet.
                //   3. YT Music album — záloha, když playlist nikdy neběžel.
                //
                // Dřív se počet bral z playlistu a délka z alba, což u sérií
                // nikdy nesedělo: „129 skladeb · 1:17:00", kde ta délka patřila
                // k šestnáctiskladbovému albu jedné sezóny.
                // Počet skladeb: kolik jich playlist doopravdy má (včetně těch,
                // co už nejdou přehrát) — je to totéž číslo, které hlásí
                // přehrávač.
                trackCount: playlistStats
                    ? (playlistStats.listed || playlistStats.tracks)
                    : (liveCount ?? album?.track_count ?? null),
                trackCountSource: playlistStats ? 'playlist'
                    : (liveCount ? 'playlist' : (album?.track_count ? 'ytmusic' : null)),
                durationApprox,
                // Hotový text h:mm:ss, nebo null když délku spolehlivě neznáme.
                albumDuration: (() => {
                    if (playlistStats?.seconds) {
                        return (durationApprox ? '~' : '') + formatSeconds(playlistStats.seconds)
                    }
                    if (!album?.duration) return null
                    // Bez přesných dat ukážeme délku alba jen tehdy, když počet
                    // skladeb zhruba sedí. Jinak radši nic než špatný údaj.
                    if (liveCount && Math.abs(liveCount - (album.track_count || 0)) > 1) return null
                    return parseDurationToHMS(album.duration)
                })(),
                artists: allArtists.length
                    ? allArtists.slice(0, MAX_CARD_ARTISTS).join(', ')
                    : (getAnilistArtists(w.anime_name) || null),
                // Plný seznam do tooltipu, když se na kartu nevejdou všichni
                artistsFull: allArtists.length > MAX_CARD_ARTISTS ? allArtists.join(', ') : null,
                year: yearDisplay,
                // Chipy abecedně podle názvu skladby, při shodě podle anime
                // (u víc sezón se tím pořadí nerozhazuje). Dřív se řadilo podle
                // DÉLKY názvu, což vypadalo hezky, ale pořadí z Excelu to
                // zahodilo a nedalo se v tom nic najít.
                best: [...best].sort((a, b) =>
                    (a.ost_name || '').localeCompare(b.ost_name || '', 'cs')
                    || (a.anime_name || '').localeCompare(b.anime_name || '', 'cs')),
            }
        })
    }, [sortedWhole, wholeGroups, ostTables, spotifyImages, ytmusicAlbums, playlistCounts, playlistDurations, favorites, anilistVersion, ostTypesMap])

    const visibleWholeCards = useMemo(() => {
        const q = wholeSearch.trim().toLowerCase()
        if (!q) return wholeCards
        return wholeCards.filter(c =>
            c.anime_name.toLowerCase().includes(q)
            || (c.artists && c.artists.toLowerCase().includes(q))
            || c.genres.some(g => g.toLowerCase().includes(q))
            || c.ostTypes.some(t => t.toLowerCase().includes(q))
            || c.themes.some(t => t.toLowerCase().includes(q))
            || c.best.some(b => (b.ost_name || '').toLowerCase().includes(q))
        )
    }, [wholeCards, wholeSearch])

    const openOstPlayer = useCallback((mode, index = 0) => {
        openPlayer({ mode, index, tracks: piecesTracks, groups: wholeGroups })
    }, [openPlayer, piecesTracks, wholeGroups])

    // Klik na „best" skladbu u karty: spustí se playlist skladeb, ale vybraná
    // jde první a hned za ní druhá best téhož anime. Zbytek knihovny pokračuje
    // za nimi, takže se dá poslouchat dál.
    // („whole" je YouTube playlist, jehož pořadí ovlivnit nejde — proto se pro
    // tohle použije režim `pieces`, kde skladby skládám sám.)
    const playBestPieceFirst = useCallback((card, piece) => {
        const idOf = (p) => extractYoutubeId(p.ost_url)
        const wanted = idOf(piece)
        if (!wanted) return
        const bestIds = card.best.map(idOf).filter(Boolean)
        const head = [wanted, ...bestIds.filter(id => id !== wanted)]
        const ordered = [
            ...head.map(id => piecesTracks.find(t => t.ytId === id)).filter(Boolean),
            ...piecesTracks.filter(t => !head.includes(t.ytId)),
        ]
        if (!ordered.length) return
        openPlayer({ mode: 'pieces', index: 0, tracks: ordered, groups: wholeGroups })
    }, [openPlayer, piecesTracks, wholeGroups])

    // Statistics
    const stats = useMemo(() => {
        if (!favorites.length) return null

        const types = { OP: 0, ED: 0, OST: 0, Other: 0 }
        const authors = {}
        const anime = {}
        const animeByFinal = {} // For Top Series by final rating
        let withRating = 0

        // Rating category sums
        let lyricsSum = 0, lyricsCount = 0
        let emotionSum = 0, emotionCount = 0
        let melodySum = 0, melodyCount = 0
        let videoSum = 0, videoCount = 0
        let voiceSum = 0, voiceCount = 0
        let avgSum = 0, avgCount = 0
        let finalSum = 0, finalCount = 0

        favorites.forEach(f => {
            // Type distribution
            const type = f.type?.toUpperCase() || 'Other'
            if (types[type] !== undefined) types[type]++
            else types['Other']++

            // Author stats
            if (f.author) {
                const authorName = f.author.split(';')[0].trim()
                authors[authorName] = (authors[authorName] || 0) + 1
            }

            // Anime stats
            if (f.anime_name) {
                const animeName = f.anime_name.split(',')[0].trim()
                anime[animeName] = (anime[animeName] || 0) + 1

                // Track final rating for Top Series
                if (f.rating_final && !isNaN(parseFloat(f.rating_final))) {
                    if (!animeByFinal[animeName]) animeByFinal[animeName] = { sum: 0, count: 0 }
                    animeByFinal[animeName].sum += parseFloat(f.rating_final)
                    animeByFinal[animeName].count++
                }
            }

            // Count items with final rating ("S hodnocením")
            if (f.rating_final && !isNaN(parseFloat(f.rating_final))) {
                withRating++
                finalSum += parseFloat(f.rating_final)
                finalCount++
            }
            if (f.rating_lyrics && !isNaN(parseFloat(f.rating_lyrics))) {
                lyricsSum += parseFloat(f.rating_lyrics)
                lyricsCount++
            }
            if (f.rating_emotion && !isNaN(parseFloat(f.rating_emotion))) {
                emotionSum += parseFloat(f.rating_emotion)
                emotionCount++
            }
            if (f.rating_melody && !isNaN(parseFloat(f.rating_melody))) {
                melodySum += parseFloat(f.rating_melody)
                melodyCount++
            }
            if (f.rating_video && !isNaN(parseFloat(f.rating_video))) {
                videoSum += parseFloat(f.rating_video)
                videoCount++
            }
            if (f.rating_voice && !isNaN(parseFloat(f.rating_voice))) {
                voiceSum += parseFloat(f.rating_voice)
                voiceCount++
            }
            if (f.rating_avg && !isNaN(parseFloat(f.rating_avg))) {
                avgSum += parseFloat(f.rating_avg)
                avgCount++
            }
        })

        // Top authors
        const topAuthors = Object.entries(authors)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        // Top anime
        const topAnime = Object.entries(anime)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)

        // Top 6 series by average final rating
        const topSeriesByFinal = Object.entries(animeByFinal)
            .filter(([, data]) => data.count >= 2)
            .map(([name, data]) => ({ name, avgFinal: data.sum / data.count }))
            .sort((a, b) => b.avgFinal - a.avgFinal)
            .slice(0, 6)

        // Average ratings by category
        const avgRatings = {
            lyrics: lyricsCount > 0 ? toCS((lyricsSum / lyricsCount).toFixed(2)) : null,
            emotion: emotionCount > 0 ? toCS((emotionSum / emotionCount).toFixed(2)) : null,
            melody: melodyCount > 0 ? toCS((melodySum / melodyCount).toFixed(2)) : null,
            video: videoCount > 0 ? toCS((videoSum / videoCount).toFixed(2)) : null,
            voice: voiceCount > 0 ? toCS((voiceSum / voiceCount).toFixed(2)) : null,
            avg: avgCount > 0 ? toCS((avgSum / avgCount).toFixed(2)) : null,
            final: finalCount > 0 ? toCS((finalSum / finalCount).toFixed(2)) : null
        }

        // OST items
        const ostItems = favorites.filter(f => f.type?.toUpperCase() === 'OST')

        // Remove OST and Other from types for the chart
        const chartTypes = { ...types }
        delete chartTypes['OST']
        delete chartTypes['Other']

        // ──── NEW OP/ED CHARTS DATA (from VBA Graphs_FAV_OP_ED) ────

        // 1. Rating Breakdown: count per rating bucket 1-10, split OP/ED/Total
        const ratingBreakdown = { labels: [], op: [], ed: [], total: [] }
        const cntTotal = {}, cntOP = {}, cntED = {}
        favorites.forEach(f => {
            const rf = parseFloat(f.rating_final)
            const tp = (f.type || '').toUpperCase()
            if (!isNaN(rf) && rf >= 1 && rf <= 10 && (tp === 'OP' || tp === 'ED')) {
                const bucket = Math.floor(rf)
                cntTotal[bucket] = (cntTotal[bucket] || 0) + 1
                if (tp === 'OP') cntOP[bucket] = (cntOP[bucket] || 0) + 1
                if (tp === 'ED') cntED[bucket] = (cntED[bucket] || 0) + 1
            }
        })
        for (let i = 1; i <= 10; i++) {
            if (cntTotal[i]) {
                ratingBreakdown.labels.push(String(i))
                ratingBreakdown.op.push(cntOP[i] || 0)
                ratingBreakdown.ed.push(cntED[i] || 0)
                ratingBreakdown.total.push(cntTotal[i] || 0)
            }
        }

        // 2. Radar (5 categories raw averages for radar)
        const radarAvgs = {
            lyrics: lyricsCount > 0 ? lyricsSum / lyricsCount : 0,
            emotion: emotionCount > 0 ? emotionSum / emotionCount : 0,
            melody: melodyCount > 0 ? melodySum / melodyCount : 0,
            video: videoCount > 0 ? videoSum / videoCount : 0,
            voice: voiceCount > 0 ? voiceSum / voiceCount : 0
        }

        // 3. Frisson influence
        let frissonYesSum = 0, frissonYesCnt = 0, frissonNoSum = 0, frissonNoCnt = 0
        favorites.forEach(f => {
            const rf = parseFloat(f.rating_final)
            const tp = (f.type || '').toUpperCase()
            if (!isNaN(rf) && (tp === 'OP' || tp === 'ED')) {
                if (f.has_frisson) { frissonYesSum += rf; frissonYesCnt++ }
                else { frissonNoSum += rf; frissonNoCnt++ }
            }
        })
        const frissonData = {
            labels: [], counts: [], avgs: [],
        }
        if (frissonYesCnt > 0) {
            frissonData.labels.push('ANO')
            frissonData.counts.push(frissonYesCnt)
            frissonData.avgs.push(parseFloat((frissonYesSum / frissonYesCnt).toFixed(2)))
        }
        if (frissonNoCnt > 0) {
            frissonData.labels.push('NE')
            frissonData.counts.push(frissonNoCnt)
            frissonData.avgs.push(parseFloat((frissonNoSum / frissonNoCnt).toFixed(2)))
        }

        // 4. Language analysis (count + weighted avg)
        const langCounts = {}, langSumW = {}, langSumRateW = {}
        favorites.forEach(f => {
            const lang = (f.language || '').trim()
            const rf = parseFloat(f.rating_final)
            const tp = (f.type || '').toUpperCase()
            if (lang && !isNaN(rf) && (tp === 'OP' || tp === 'ED')) {
                if (!lang.includes('%')) {
                    // Simple language
                    langCounts[lang] = (langCounts[lang] || 0) + 1
                    langSumW[lang] = (langSumW[lang] || 0) + 1
                    langSumRateW[lang] = (langSumRateW[lang] || 0) + rf
                } else {
                    // Mixed language with weights e.g. "JAP(70%) ENG(30%)"
                    const matches = lang.matchAll(/(\w+)\((\d+)%\)/g)
                    for (const m of matches) {
                        const k = m[1]
                        const w = parseInt(m[2]) / 100
                        if (w > 0) {
                            langCounts[k] = (langCounts[k] || 0) + 1
                            langSumW[k] = (langSumW[k] || 0) + w
                            langSumRateW[k] = (langSumRateW[k] || 0) + (rf * w)
                        }
                    }
                }
            }
        })
        const langAnalysis = Object.entries(langCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([lang, count]) => ({
                lang,
                count,
                avgRating: langSumW[lang] > 0 ? parseFloat((langSumRateW[lang] / langSumW[lang]).toFixed(2)) : 0
            }))

        // 5. OP vs ED average comparison
        let opSum = 0, opCnt = 0, edSum = 0, edCnt = 0
        favorites.forEach(f => {
            const rf = parseFloat(f.rating_final)
            const tp = (f.type || '').toUpperCase()
            if (!isNaN(rf)) {
                if (tp === 'OP') { opSum += rf; opCnt++ }
                if (tp === 'ED') { edSum += rf; edCnt++ }
            }
        })
        const opVsEd = {
            opAvg: opCnt > 0 ? parseFloat((opSum / opCnt).toFixed(2)) : 0,
            edAvg: edCnt > 0 ? parseFloat((edSum / edCnt).toFixed(2)) : 0,
            opCount: opCnt,
            edCount: edCnt
        }

        // 6. Sing-Along distribution
        const singAlongBuckets = { '0-2': 0, '3-4': 0, '5-6': 0, '7-8': 0, '9-10': 0 }
        favorites.forEach(f => {
            const sa = parseFloat(f.sing_along)
            const tp = (f.type || '').toUpperCase()
            if (!isNaN(sa) && sa >= 0 && (tp === 'OP' || tp === 'ED')) {
                if (sa <= 2) singAlongBuckets['0-2']++
                else if (sa <= 4) singAlongBuckets['3-4']++
                else if (sa <= 6) singAlongBuckets['5-6']++
                else if (sa <= 8) singAlongBuckets['7-8']++
                else singAlongBuckets['9-10']++
            }
        })

        return {
            types: chartTypes, topAuthors, topAnime, withRating, total: favorites.length,
            avgRatings, ostItems, topSeriesByFinal,
            ratingBreakdown, radarAvgs, frissonData, langAnalysis, opVsEd, singAlongBuckets
        }
    }, [favorites])

    // Dynamic axis calculations for premium visual spacing
    const axisScales = useMemo(() => {
        if (!stats) return null

        // 1. Top Series Rating Axis
        const seriesRatings = stats.topSeriesByFinal.map(s => s.avgFinal) || []
        const seriesMin = seriesRatings.length ? Math.min(...seriesRatings) : 8
        const seriesMax = seriesRatings.length ? Math.max(...seriesRatings) : 10
        const seriesAxisMin = Math.max(0, Math.floor((seriesMin - 0.15) * 10) / 10)
        const seriesAxisMax = Math.min(10, Math.ceil((seriesMax + 0.15) * 10) / 10)

        // 2. Top Authors Count Axis (Horizontal bar chart)
        const authorCounts = stats.topAuthors.map(a => a[1]) || []
        const authorMin = authorCounts.length ? Math.min(...authorCounts) : 0
        const authorMax = authorCounts.length ? Math.max(...authorCounts) : 10
        const authorAxisMin = Math.max(0, authorMin - 1)
        const authorAxisMax = authorMax + 1

        // 3. Radar category ratings
        const radarValues = stats.radarAvgs ? [stats.radarAvgs.lyrics, stats.radarAvgs.emotion, stats.radarAvgs.melody, stats.radarAvgs.video, stats.radarAvgs.voice] : []
        const radarMin = radarValues.length ? Math.min(...radarValues) : 0
        const radarMax = radarValues.length ? Math.max(...radarValues) : 10
        const radarAxisMin = Math.max(0, Math.floor((radarMin - 0.4) * 2) / 2)
        const radarAxisMax = Math.min(10, Math.ceil((radarMax + 0.4) * 2) / 2)

        // 4. Frisson average ratings
        const frissonRatings = stats.frissonData?.avgs || []
        const frissonMin = frissonRatings.length ? Math.min(...frissonRatings) : 8
        const frissonMax = frissonRatings.length ? Math.max(...frissonRatings) : 10
        const frissonAxisMin = Math.max(0, Math.floor((frissonMin - 0.3) * 10) / 10)
        const frissonAxisMax = Math.min(10, Math.ceil((frissonMax + 0.3) * 10) / 10)

        // 5. Language weighted average ratings
        const langRatings = stats.langAnalysis?.map(l => l.avgRating) || []
        const langMin = langRatings.length ? Math.min(...langRatings) : 8
        const langMax = langRatings.length ? Math.max(...langRatings) : 10
        const langAxisMin = Math.max(0, Math.floor((langMin - 0.3) * 10) / 10)
        const langAxisMax = Math.min(10, Math.ceil((langMax + 0.3) * 10) / 10)

        // 6. OP vs ED averages
        const opVsEdRatings = stats.opVsEd ? [stats.opVsEd.opAvg, stats.opVsEd.edAvg] : []
        const opVsEdMin = opVsEdRatings.length ? Math.min(...opVsEdRatings) : 8
        const opVsEdMax = opVsEdRatings.length ? Math.max(...opVsEdRatings) : 10
        const opVsEdAxisMin = Math.max(0, Math.floor((opVsEdMin - 0.15) * 100) / 100)
        const opVsEdAxisMax = Math.min(10, Math.ceil((opVsEdMax + 0.15) * 100) / 100)

        return {
            seriesAxisMin, seriesAxisMax,
            authorAxisMin, authorAxisMax,
            radarAxisMin, radarAxisMax,
            frissonAxisMin, frissonAxisMax,
            langAxisMin, langAxisMax,
            opVsEdAxisMin, opVsEdAxisMax
        }
    }, [stats])

    // Filter and Sort
    const filteredFavorites = useMemo(() => {
        let result = [...favorites]

        if (searchTerm) {
            const term = searchTerm.toLowerCase()
            result = result.filter(f =>
                f.anime_name?.toLowerCase().includes(term) ||
                f.song?.toLowerCase().includes(term) ||
                f.author?.toLowerCase().includes(term)
            )
        }

        if (typeFilter !== 'all') {
            result = result.filter(f => f.type?.toUpperCase() === typeFilter)
        }

        if (ratingFilter !== 'all') {
            result = result.filter(f => {
                const rating = parseFloat(f.rating_final)
                if (ratingFilter === '9+') return !isNaN(rating) && rating >= 9
                if (ratingFilter === '8+') return !isNaN(rating) && rating >= 8
                if (ratingFilter === '7+') return !isNaN(rating) && rating >= 7
                if (ratingFilter === 'rated') return !isNaN(rating)
                if (ratingFilter === 'frisson') return f.has_frisson === true

                return true
            })
        }

        if (languageFilter !== 'all') {
            result = result.filter(f => {
                const lang = (f.language || '').trim().toUpperCase()
                if (languageFilter === 'JAP') return lang === 'JAP'
                if (languageFilter === 'ENG') return lang === 'ENG'
                if (languageFilter === 'LAT') return lang.includes('LAT')
                if (languageFilter === 'GER') return lang.includes('GER')
                if (languageFilter === 'MIX') return lang.includes('%')
                return true
            })
        }

        // Sorting
        if (sortColumn) {
            result.sort((a, b) => {
                let aVal, bVal
                if (sortColumn === 'anime_name' || sortColumn === 'song' || sortColumn === 'author' || sortColumn === 'language') {
                    aVal = (a[sortColumn] || '').toLowerCase()
                    bVal = (b[sortColumn] || '').toLowerCase()
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
                } else if (sortColumn === 'has_frisson') {
                    aVal = a[sortColumn] ? 1 : 0
                    bVal = b[sortColumn] ? 1 : 0
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
                } else {
                    aVal = parseFloat(a[sortColumn]) || 0
                    bVal = parseFloat(b[sortColumn]) || 0
                    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
                }
            })
        } else {
            // Default sort: watch_date desc, then original index asc
            result.sort((a, b) => {
                const aTime = a.watch_date ? Date.parse(a.watch_date) : 0
                const bTime = b.watch_date ? Date.parse(b.watch_date) : 0
                if (bTime !== aTime) {
                    return bTime - aTime // newest watched first
                }
                const aIdx = parseFloat(a.index) || 9999
                const bIdx = parseFloat(b.index) || 9999
                return aIdx - bIdx
            })
        }

        return result
    }, [favorites, searchTerm, typeFilter, ratingFilter, languageFilter, sortColumn, sortDirection])

    // Sort handler
    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
        } else {
            setSortColumn(column)
            setSortDirection('desc')
        }
    }

    const getSortIcon = (column) => {
        if (sortColumn !== column) return '↕'
        return sortDirection === 'asc' ? '↑' : '↓'
    }

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    // Chart colors
    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#f59e0b']

    // Type chart
    const typeChartData = {
        labels: Object.keys(stats?.types || {}),
        datasets: [{
            data: Object.values(stats?.types || {}),
            backgroundColor: colors,
            borderWidth: 0
        }]
    }

    // Top authors chart
    const authorsChartData = {
        labels: stats?.topAuthors?.map(a => a[0].substring(0, 20)) || [],
        datasets: [{
            label: 'Počet',
            data: stats?.topAuthors?.map(a => a[1]) || [],
            backgroundColor: '#8b5cf6',
            borderRadius: 4
        }]
    }

    // Top Series by Final Rating Chart
    const topSeriesFinalData = {
        labels: stats?.topSeriesByFinal?.map(s => s.name.substring(0, 20)) || [],
        datasets: [{
            label: 'Prům. finální hodnocení',
            data: stats?.topSeriesByFinal?.map(s => s.avgFinal) || [],
            backgroundColor: '#10b981',
            borderRadius: 4
        }]
    }

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right', labels: { boxWidth: 12, padding: 8 } }
        }
    }

    const authorsChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: {
                min: axisScales?.authorAxisMin ?? 0,
                max: axisScales?.authorAxisMax ?? 10,
                ticks: { precision: 0 }
            }
        }
    }

    const topSeriesChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: {
                beginAtZero: false,
                min: axisScales?.seriesAxisMin ?? 8,
                max: axisScales?.seriesAxisMax ?? 10
            }
        }
    }

    return (
        <div className="fade-in">
            <div className="favp-header">
                <div className="favp-header-text">
                    <h2>Favourite OP/ED/OST</h2>
                    <div className="favp-subtitle">Openings, endings a soundtracky</div>
                </div>
                <div className="favp-header-actions">
                    <button
                        type="button"
                        className="favp-quiz-btn"
                        onClick={() => setQuizOpen(true)}
                        title="Minihra: pustí se jen hudba OP/ED a hádáš anime"
                    >
                        <span aria-hidden="true">🎮</span>Hádej OP/ED
                    </button>
                    <button
                        type="button"
                        className="favp-random-btn"
                        onClick={playRandomOpEd}
                        title="Přehraje náhodný OP/ED z tabulky (Gdrive klip, nebo znělka z AnimeThemes)"
                    >
                        <span aria-hidden="true">🎲</span>Náhodný OP/ED
                    </button>
                </div>
            </div>

            {/* Minihra Hádej OP/ED — renderuje se portálem, lazy-loaded */}
            {quizOpen && (
                <Suspense fallback={null}>
                    <OpEdQuizGame onClose={() => setQuizOpen(false)} />
                </Suspense>
            )}

            {/* 2. Stat karty (design 1a: levý proužek + podíl z celku) */}
            <div className="favp-stats">
                {[
                    { label: 'Celkem songů', value: stats?.total || 0, color: 'var(--accent-primary)', base: null },
                    { label: 'Openings', value: stats?.types?.OP || 0, color: '#f472b6', base: stats?.total },
                    { label: 'Endings', value: stats?.types?.ED || 0, color: 'var(--accent-cyan)', base: stats?.total },
                    { label: 'S hodnocením', value: stats?.withRating || 0, color: '#f59e0b', base: stats?.total },
                ].map(s => {
                    const share = s.base ? Math.round((s.value / s.base) * 100) : null
                    return (
                        <div key={s.label} className="favp-stat-card" style={{ '--stat-color': s.color }}>
                            <span className="favp-stat-label">{s.label}</span>
                            <span className="favp-stat-value">{s.value.toLocaleString('cs-CZ')}</span>
                            <span className="favp-stat-share-row">
                                <span className="favp-stat-track">
                                    <span className="favp-stat-fill" style={{ width: `${share ?? 0}%` }} />
                                </span>
                                <span className="favp-stat-share">{share !== null ? `${share} % z celku` : 'základ pro podíly'}</span>
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* 3. Collapsible Charts Section */}
            <div className="dashboard-groups-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
                {/* GROUP 1: Základní statistiky */}
                <DashboardGroup
                    id="fav_basic"
                    title="Základní statistiky OP/ED/OST"
                    icon="📊"
                    fullWidth
                    isExpanded={expandedGroups.has('fav_basic')}
                    onToggle={() => toggleGroup('fav_basic')}
                    previewContent={
                        <>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    <Pie data={typeChartData} options={miniPieOptions} />
                                </div>
                                <div className="mini-chart-label">Rozdělení typů</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    <Bar data={authorsChartData} options={{ ...miniChartOptions, indexAxis: 'y' }} />
                                </div>
                                <div className="mini-chart-label">Top 10 autorů</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    <Bar data={topSeriesFinalData} options={{
                                        ...miniChartOptions,
                                        scales: { y: { min: 8 } }
                                    }} />
                                </div>
                                <div className="mini-chart-label">Top Série</div>
                            </div>
                        </>
                    }
                >
                    {/* Average Ratings Section inside basic stats */}
                    {stats?.avgRatings?.final && (
                        <div style={{ width: '100%', marginBottom: 'var(--spacing-md)' }}>
                            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 'var(--spacing-sm)', marginBottom: 0 }}>
                                <div className="stat-card" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                    <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.avg}</div>
                                    <div className="stat-label" style={{ fontSize: '0.65rem' }}>Průměrné</div>
                                </div>
                                <div className="stat-card" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                    <div className="stat-value" style={{ fontSize: '1.25rem', color: 'var(--accent-primary)' }}>{stats.avgRatings.final}</div>
                                    <div className="stat-label" style={{ fontSize: '0.65rem' }}>Finální</div>
                                </div>
                                {stats.avgRatings.emotion && (
                                    <div className="stat-card pink" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.emotion}</div>
                                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>Emoce</div>
                                    </div>
                                )}
                                {stats.avgRatings.lyrics && (
                                    <div className="stat-card" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.lyrics}</div>
                                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>Text</div>
                                    </div>
                                )}
                                {stats.avgRatings.melody && (
                                    <div className="stat-card cyan" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.melody}</div>
                                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>Melodie</div>
                                    </div>
                                )}
                                {stats.avgRatings.video && (
                                    <div className="stat-card amber" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.video}</div>
                                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>Videoklip</div>
                                    </div>
                                )}
                                {stats.avgRatings.voice && (
                                    <div className="stat-card emerald" style={{ padding: 'var(--spacing-sm) var(--spacing-xs)', textAlign: 'center' }}>
                                        <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats.avgRatings.voice}</div>
                                        <div className="stat-label" style={{ fontSize: '0.65rem' }}>Hlas</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="full-chart-wrapper standard">
                        <div className="chart-header">
                            <div className="chart-title">Rozdělení typů</div>
                        </div>
                        <div className="chart-body" style={{ height: '220px' }}>
                            <Pie data={typeChartData} options={pieOptions} />
                        </div>
                    </div>

                    <div className="full-chart-wrapper standard">
                        <div className="chart-header">
                            <div className="chart-title">Top 10 autorů</div>
                        </div>
                        <div className="chart-body" style={{ height: '220px' }}>
                            <Bar data={authorsChartData} options={{ ...authorsChartOptions, indexAxis: 'y' }} />
                        </div>
                    </div>

                    <div className="full-chart-wrapper standard">
                        <div className="chart-header">
                            <div className="chart-title">Top Série (dle fin. hodnocení)</div>
                        </div>
                        <div className="chart-body" style={{ height: '220px' }}>
                            <Bar data={topSeriesFinalData} options={topSeriesChartOptions} />
                        </div>
                    </div>
                </DashboardGroup>

                {/* GROUP 2: Hudební analytika */}
                <DashboardGroup
                    id="fav_analytics"
                    title="Analytika OP/ED"
                    icon="🎵"
                    fullWidth
                    isExpanded={expandedGroups.has('fav_analytics')}
                    onToggle={() => toggleGroup('fav_analytics')}
                    previewContent={
                        <>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.ratingBreakdown?.labels?.length > 0 ? (
                                        <Bar data={{
                                            labels: stats.ratingBreakdown.labels,
                                            datasets: [
                                                { data: stats.ratingBreakdown.op, backgroundColor: 'rgba(99, 102, 241, 0.85)', borderRadius: 2 },
                                                { data: stats.ratingBreakdown.ed, backgroundColor: 'rgba(236, 72, 153, 0.85)', borderRadius: 2 }
                                            ]
                                        }} options={miniChartOptions} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">Rozložení hodnocení</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.radarAvgs ? (
                                        <Radar data={{
                                            labels: ['', '', '', '', ''],
                                            datasets: [{
                                                data: [stats.radarAvgs.lyrics, stats.radarAvgs.emotion, stats.radarAvgs.melody, stats.radarAvgs.video, stats.radarAvgs.voice],
                                                backgroundColor: 'rgba(99, 102, 241, 0.25)',
                                                borderColor: 'rgba(99, 102, 241, 0.8)',
                                                borderWidth: 1,
                                                pointRadius: 0
                                            }]
                                        }} options={{
                                            ...miniChartOptions,
                                            scales: { r: { min: 0, max: 10, ticks: { display: false }, grid: { display: false } } }
                                        }} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">Kategorie</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.frissonData?.labels?.length > 0 ? (
                                        <Bar data={{
                                            labels: stats.frissonData.labels,
                                            datasets: [{ data: stats.frissonData.counts, backgroundColor: 'rgba(99, 102, 241, 0.8)', borderRadius: 2 }]
                                        }} options={miniChartOptions} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">Vliv Frisson</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.langAnalysis?.length > 0 ? (
                                        <Bar data={{
                                            labels: stats.langAnalysis.map(l => l.lang),
                                            datasets: [{ data: stats.langAnalysis.map(l => l.count), backgroundColor: 'rgba(6, 182, 212, 0.8)', borderRadius: 2 }]
                                        }} options={miniChartOptions} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">Jazyky</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.opVsEd ? (
                                        <Bar data={{
                                            labels: ['', ''],
                                            datasets: [{ data: [stats.opVsEd.opAvg, stats.opVsEd.edAvg], backgroundColor: ['rgba(99, 102, 241, 0.85)', 'rgba(236, 72, 153, 0.85)'], borderRadius: 4 }]
                                        }} options={miniChartOptions} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">OP vs ED</div>
                            </div>
                            <div className="mini-chart-wrapper">
                                <div className="mini-chart-container">
                                    {stats?.singAlongBuckets && Object.values(stats.singAlongBuckets).some(v => v > 0) ? (
                                        <Bar data={{
                                            labels: Object.keys(stats.singAlongBuckets),
                                            datasets: [{ data: Object.values(stats.singAlongBuckets), backgroundColor: 'rgba(34, 197, 94, 0.7)', borderRadius: 2 }]
                                        }} options={miniChartOptions} />
                                    ) : <div style={{ fontSize: '0.6rem', textAlign: 'center' }}>N/A</div>}
                                </div>
                                <div className="mini-chart-label">Sing-Along</div>
                            </div>
                        </>
                    }
                >
                    {/* Rating Breakdown OP vs ED */}
                    {stats?.ratingBreakdown?.labels?.length > 0 && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Rozložení hodnocení (OP vs ED)</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Bar data={{
                                    labels: stats.ratingBreakdown.labels,
                                    datasets: [
                                        { label: 'OP', data: stats.ratingBreakdown.op, backgroundColor: 'rgba(99, 102, 241, 0.85)', borderRadius: 3 },
                                        { label: 'ED', data: stats.ratingBreakdown.ed, backgroundColor: 'rgba(236, 72, 153, 0.85)', borderRadius: 3 }
                                    ]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 12 } },
                                        tooltip: { backgroundColor: 'rgba(18,18,26,0.9)', titleColor: '#f1f5f9', bodyColor: '#f1f5f9', borderColor: '#3a3a4a', borderWidth: 1 }
                                    },
                                    scales: {
                                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', precision: 0 }, title: { display: true, text: 'Počet', color: '#94a3b8' } },
                                        x: { grid: { display: false }, ticks: { color: '#94a3b8' }, title: { display: true, text: 'Hodnocení', color: '#94a3b8' } }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Radar Categories */}
                    {stats?.radarAvgs && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Průměrné hodnocení kategorií</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Radar data={{
                                    labels: [
                                        `Text: ${stats.radarAvgs.lyrics.toFixed(1).replace('.', ',')}/10`,
                                        `Emoce: ${stats.radarAvgs.emotion.toFixed(1).replace('.', ',')}/10`,
                                        `Melodie: ${stats.radarAvgs.melody.toFixed(1).replace('.', ',')}/10`,
                                        `Video: ${stats.radarAvgs.video.toFixed(1).replace('.', ',')}/10`,
                                        `Hlas: ${stats.radarAvgs.voice.toFixed(1).replace('.', ',')}/10`
                                    ],
                                    datasets: [{
                                        label: 'Průměr',
                                        data: [stats.radarAvgs.lyrics, stats.radarAvgs.emotion, stats.radarAvgs.melody, stats.radarAvgs.video, stats.radarAvgs.voice],
                                        backgroundColor: 'rgba(99, 102, 241, 0.25)',
                                        borderColor: 'rgba(99, 102, 241, 0.8)',
                                        borderWidth: 2,
                                        pointBackgroundColor: '#6366f1',
                                        pointRadius: 4
                                    }]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: { legend: { display: false } },
                                    scales: {
                                        r: {
                                            min: axisScales?.radarAxisMin ?? 0,
                                            max: axisScales?.radarAxisMax ?? 10,
                                            ticks: { color: '#64748b', backdropColor: 'transparent' },
                                            grid: { color: 'rgba(255,255,255,0.08)' },
                                            pointLabels: { color: '#e2e8f0', font: { size: 10 } },
                                            angleLines: { color: 'rgba(255,255,255,0.08)' }
                                        }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Frisson Influence */}
                    {stats?.frissonData?.labels?.length > 0 && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Vliv Frisson Feeling</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Bar data={{
                                    labels: stats.frissonData.labels,
                                    datasets: [
                                        {
                                            label: 'Počet',
                                            data: stats.frissonData.counts,
                                            backgroundColor: 'rgba(99, 102, 241, 0.8)',
                                            borderRadius: 4,
                                            yAxisID: 'y',
                                            order: 2
                                        },
                                        {
                                            label: 'Průměr FH',
                                            data: stats.frissonData.avgs,
                                            type: 'line',
                                            borderColor: '#f59e0b',
                                            backgroundColor: '#f59e0b',
                                            pointRadius: 5,
                                            pointHoverRadius: 7,
                                            borderWidth: 2,
                                            yAxisID: 'y1',
                                            order: 1
                                        }
                                    ]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 12 } },
                                        tooltip: { backgroundColor: 'rgba(18,18,26,0.9)', titleColor: '#f1f5f9', bodyColor: '#f1f5f9' }
                                    },
                                    scales: {
                                        y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', precision: 0 }, title: { display: true, text: 'Počet', color: '#94a3b8' } },
                                        y1: { min: axisScales?.frissonAxisMin ?? 1, max: axisScales?.frissonAxisMax ?? 10, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#f59e0b' }, title: { display: true, text: 'Průměr', color: '#f59e0b' } },
                                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Language Analysis */}
                    {stats?.langAnalysis?.length > 0 && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Analýza jazyků (Vážený průměr)</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Bar data={{
                                    labels: stats.langAnalysis.map(l => l.lang),
                                    datasets: [
                                        {
                                            label: 'Počet',
                                            data: stats.langAnalysis.map(l => l.count),
                                            backgroundColor: 'rgba(6, 182, 212, 0.8)',
                                            borderRadius: 4,
                                            yAxisID: 'y',
                                            order: 2
                                        },
                                        {
                                            label: 'Prům. hodnocení',
                                            data: stats.langAnalysis.map(l => l.avgRating),
                                            type: 'line',
                                            borderColor: '#ec4899',
                                            backgroundColor: '#ec4899',
                                            pointRadius: 4,
                                            borderWidth: 2,
                                            yAxisID: 'y1',
                                            order: 1
                                        }
                                    ]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 12 } },
                                        tooltip: { backgroundColor: 'rgba(18,18,26,0.9)', titleColor: '#f1f5f9', bodyColor: '#f1f5f9' }
                                    },
                                    scales: {
                                        y: { beginAtZero: true, position: 'left', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', precision: 0 }, title: { display: true, text: 'Počet', color: '#94a3b8' } },
                                        y1: { min: axisScales?.langAxisMin ?? 1, max: axisScales?.langAxisMax ?? 10, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#ec4899' }, title: { display: true, text: 'Prům. hodnocení', color: '#ec4899' } },
                                        x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* OP vs ED Average */}
                    {stats?.opVsEd && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Průměr OP vs ED</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Bar data={{
                                    labels: [`OP (${stats.opVsEd.opCount})`, `ED (${stats.opVsEd.edCount})`],
                                    datasets: [{
                                        label: 'Průměrné FH',
                                        data: [stats.opVsEd.opAvg, stats.opVsEd.edAvg],
                                        backgroundColor: ['rgba(99, 102, 241, 0.85)', 'rgba(236, 72, 153, 0.85)'],
                                        borderRadius: 6
                                    }]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            backgroundColor: 'rgba(18,18,26,0.9)', titleColor: '#f1f5f9', bodyColor: '#f1f5f9',
                                            callbacks: { label: (ctx) => `Průměr: ${ctx.parsed.y.toFixed(2).replace('.', ',')}` }
                                        }
                                    },
                                    scales: {
                                        y: { min: axisScales?.opVsEdAxisMin ?? 0, max: axisScales?.opVsEdAxisMax ?? 10, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                                        x: { grid: { display: false }, ticks: { color: '#e2e8f0', font: { size: 12, weight: 'bold' } } }
                                    }
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Sing-Along Distribution */}
                    {stats?.singAlongBuckets && Object.values(stats.singAlongBuckets).some(v => v > 0) && (
                        <div className="full-chart-wrapper standard">
                            <div className="chart-header">
                                <div className="chart-title">Sing-Along faktor (Distribuce)</div>
                            </div>
                            <div className="chart-body" style={{ height: '220px' }}>
                                <Bar data={{
                                    labels: Object.keys(stats.singAlongBuckets),
                                    datasets: [{
                                        label: 'Počet songů',
                                        data: Object.values(stats.singAlongBuckets),
                                        backgroundColor: [
                                            'rgba(239, 68, 68, 0.7)',
                                            'rgba(249, 115, 22, 0.7)',
                                            'rgba(234, 179, 8, 0.7)',
                                            'rgba(34, 197, 94, 0.7)',
                                            'rgba(16, 185, 129, 0.7)'
                                        ],
                                        borderRadius: 4
                                    }]
                                }} options={{
                                    responsive: true, maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: { backgroundColor: 'rgba(18,18,26,0.9)', titleColor: '#f1f5f9', bodyColor: '#f1f5f9' }
                                    },
                                    scales: {
                                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', precision: 0 }, title: { display: true, text: 'Počet', color: '#94a3b8' } },
                                        x: { grid: { display: false }, ticks: { color: '#94a3b8' }, title: { display: true, text: 'Sing-Along skóre', color: '#94a3b8' } }
                                    }
                                }} />
                            </div>
                        </div>
                    )}
                </DashboardGroup>
            </div>

            {/* Search and Filters (design 1a: ikona v poli, segmentový typ filtr) */}
            <div className="favp-search-row">
                <div className="favp-search-box">
                    <span className="favp-search-icon" aria-hidden="true">🔍</span>
                    <input
                        type="text"
                        className="search-input favp-search-input"
                        placeholder="Hledat anime, song, autora..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            className="favp-clear-btn"
                            onClick={() => setSearchTerm('')}
                            title="Vymazat hledání"
                        >
                            ×
                        </button>
                    )}
                </div>
                <div className="favp-type-seg">
                    {['all', 'OP', 'ED', 'OST'].map(t => (
                        <button
                            key={t}
                            className={`favp-seg-btn ${typeFilter === t ? 'active' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t === 'all' ? 'Vše' : t}
                        </button>
                    ))}
                </div>
                <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value)}
                    className="favp-select"
                >
                    <option value="all">Všechna hodnocení</option>
                    <option value="9+">9+ (Excelentní)</option>
                    <option value="8+">8+ (Velmi dobré)</option>
                    <option value="7+">7+ (Dobré)</option>
                    <option value="rated">Ohodnocené</option>
                    <option value="frisson">Má Frisson</option>
                </select>
                <select
                    value={languageFilter}
                    onChange={(e) => setLanguageFilter(e.target.value)}
                    className="favp-select"
                >
                    <option value="all">Všechny jazyky</option>
                    <option value="JAP">Pouze JAP</option>
                    <option value="ENG">Pouze ENG</option>
                    <option value="LAT">Latina (LAT)</option>
                    <option value="GER">Němčina (GER)</option>
                    <option value="MIX">Kombinace (%)</option>
                </select>
            </div>

            {/* Table */}
            <div className="table-container favp-table-wrap hide-mobile">
                <table className="favp-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('index')}># {getSortIcon('index')}</th>
                            <th onClick={() => handleSort('anime_name')}>Anime {getSortIcon('anime_name')}</th>
                            <th onClick={() => handleSort('type')}>Typ {getSortIcon('type')}</th>
                            <th onClick={() => handleSort('song')}>Song {getSortIcon('song')}</th>
                            <th onClick={() => handleSort('author')}>Autor {getSortIcon('author')}</th>
                            <th onClick={() => handleSort('language')}>Jazyk {getSortIcon('language')}</th>
                            <th title="Hodnocení textu" onClick={() => handleSort('rating_lyrics')}>Text {getSortIcon('rating_lyrics')}</th>
                            <th title="Emoce" onClick={() => handleSort('rating_emotion')}>Emoce {getSortIcon('rating_emotion')}</th>
                            <th title="Melodie" onClick={() => handleSort('rating_melody')}>Melodie {getSortIcon('rating_melody')}</th>
                            <th title="Videoklip" onClick={() => handleSort('rating_video')}>Video {getSortIcon('rating_video')}</th>
                            <th title="Kvalita hlasu" onClick={() => handleSort('rating_voice')}>Hlas {getSortIcon('rating_voice')}</th>
                            <th title="Frisson" onClick={() => handleSort('has_frisson')} style={{ cursor: 'pointer' }}>⚡ {getSortIcon('has_frisson')}</th>
                            <th title="Průměrné hodnocení" onClick={() => handleSort('rating_avg')}>Prům. {getSortIcon('rating_avg')}</th>
                            <th onClick={() => handleSort('rating_final')}>Finální {getSortIcon('rating_final')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(isTableExpanded ? filteredFavorites : filteredFavorites.slice(0, 8)).map((fav, idx) => {
                            const playable = findPlayableFor(fav)
                            const hasVideo = !!playable
                            const isAt = playable?.source === 'animethemes'
                            return (
                            <tr
                                key={idx}
                                className={hasVideo ? `fav-row-playable${isAt ? ' fav-row-at' : ''}` : ''}
                                onClick={hasVideo ? () => playOpEdVideo(fav) : undefined}
                                title={hasVideo
                                    ? (isAt ? 'Kliknutím přehrajete znělku z AnimeThemes (nemám vlastní videoklip)' : 'Kliknutím přehrajete videoklip (Gdrive)')
                                    : undefined}
                            >
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {idx + 1}
                                </td>
                                <td>
                                    <div style={{ fontWeight: '500', maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <Link
                                            to={animePath(fav.anime_name)}
                                            title={`Otevřít detail anime: ${fav.anime_name}`}
                                            onClick={(e) => { e.stopPropagation(); saveScrollForReturn() }}
                                            className="anime-link"
                                        >
                                            {fav.anime_name}
                                        </Link>
                                    </div>
                                </td>
                                <td>
                                    <span className={`type-badge ${(fav.type || '').trim() === 'OP' ? 'tv' : (fav.type || '').trim() === 'ED' ? 'movie' : 'special'}`}>
                                        {fav.type}
                                    </span>
                                </td>
                                <td style={{ color: 'var(--accent-primary)', fontWeight: '500', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fav.song}>
                                    {/* Design 1a: stavová ikonka zdroje přehrání — plná = Gdrive
                                        klip, obrys = znělka z AnimeThemes, tečka = nepřehratelné */}
                                    <span
                                        className={`favp-play-dot ${hasVideo ? (isAt ? 'at' : 'gdrive') : 'none'}`}
                                        title={hasVideo
                                            ? (isAt ? 'Nemám stažené, přehraje se znělka z AnimeThemes' : 'Můj stažený klip (Google Drive)')
                                            : 'Klip zatím není k dispozici'}
                                        aria-hidden="true"
                                    >
                                        {hasVideo ? (
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        ) : '·'}
                                    </span>
                                    {fav.song}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fav.author}>
                                    {fav.author || '-'}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.language || '-'}
                                </td>
                                {/* Sub-ratings */}
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_lyrics && !isNaN(parseFloat(fav.rating_lyrics)) ? toCS(parseFloat(fav.rating_lyrics)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_emotion && !isNaN(parseFloat(fav.rating_emotion)) ? toCS(parseFloat(fav.rating_emotion)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_melody && !isNaN(parseFloat(fav.rating_melody)) ? toCS(parseFloat(fav.rating_melody)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_video && !isNaN(parseFloat(fav.rating_video)) ? toCS(parseFloat(fav.rating_video)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {fav.rating_voice && !isNaN(parseFloat(fav.rating_voice)) ? toCS(parseFloat(fav.rating_voice)) : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--accent-amber)' }}>
                                    {fav.has_frisson ? '⚡' : ''}
                                </td>
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {fav.rating_avg && !isNaN(parseFloat(fav.rating_avg)) ? toCS(parseFloat(parseFloat(fav.rating_avg).toFixed(2))) : ''}
                                </td>
                                <td>
                                    {fav.rating_final && !isNaN(parseFloat(fav.rating_final)) ? (
                                        <span className={`rating-badge rating-${Math.floor(parseFloat(fav.rating_final))}`}>
                                            {toCS(parseFloat(parseFloat(fav.rating_final).toFixed(2)))}
                                        </span>
                                    ) : '-'}
                                </td>
                            </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards for Favorites */}
            <div className="mobile-card-list hide-desktop">
                {(isTableExpanded ? filteredFavorites : filteredFavorites.slice(0, 8)).map((fav, idx) => {
                    const playable = findPlayableFor(fav)
                    const hasVideo = !!playable
                    const isAt = playable?.source === 'animethemes'
                    return (
                    <div key={idx} className="mobile-card">
                        <div className="mobile-card-header">
                            <div style={{ display: 'flex', gap: 'var(--spacing-md)', flex: 1, alignItems: 'flex-start' }}>
                                <div style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    #{idx + 1}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                    <div className="mobile-card-title">
                                        <span style={{ color: 'var(--accent-primary)' }}>{fav.song}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '500' }}>
                                        <Link
                                            to={animePath(fav.anime_name)}
                                            title={`Otevřít detail anime: ${fav.anime_name}`}
                                            onClick={(e) => { e.stopPropagation(); saveScrollForReturn() }}
                                            className="anime-link"
                                        >
                                            {fav.anime_name}
                                        </Link>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                    <span className={`type-badge ${(fav.type || '').trim() === 'OP' ? 'tv' : (fav.type || '').trim() === 'ED' ? 'movie' : 'special'}`} style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                                        {fav.type}
                                    </span>
                                    {hasVideo && (
                                        <button
                                            type="button"
                                            className={`fav-table-play-btn${isAt ? ' is-at' : ''}`}
                                            onClick={() => playOpEdVideo(fav)}
                                            title={isAt ? 'Přehrát znělku z AnimeThemes (nemám vlastní videoklip)' : 'Přehrát videoklip (Gdrive)'}
                                        >
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mobile-card-grid">
                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                <span>Autor:</span>
                                <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{fav.author || '-'}</span>
                            </div>

                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                <span>Jazyk:</span>
                                <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{fav.language || '-'}</span>
                            </div>

                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                                <span>Hodnocení (Průměr / Finální):</span>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {fav.has_frisson && <span title="Frisson" style={{ color: 'var(--accent-amber)' }}>⚡</span>}
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        {fav.rating_avg && !isNaN(parseFloat(fav.rating_avg)) ? toCS(parseFloat(parseFloat(fav.rating_avg).toFixed(2))) : '-'}
                                    </span>
                                    <span>/</span>
                                    {fav.rating_final && !isNaN(parseFloat(fav.rating_final)) ? (
                                        <span className={`rating-badge rating-${Math.floor(parseFloat(fav.rating_final))}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: 'auto' }}>
                                            {toCS(parseFloat(parseFloat(fav.rating_final).toFixed(2)))}
                                        </span>
                                    ) : '-'}
                                </div>
                            </div>

                            <div className="mobile-card-row" style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                                <button
                                    onClick={() => setExpandedCardIdx(expandedCardIdx === idx ? null : idx)}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-sm)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {expandedCardIdx === idx ? 'Skrýt detaily ▲' : 'Detailní hodnocení ▼'}
                                </button>
                            </div>

                            {expandedCardIdx === idx && (
                                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', padding: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Text:</span><span>{fav.rating_lyrics && !isNaN(parseFloat(fav.rating_lyrics)) ? toCS(parseFloat(fav.rating_lyrics)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Emoce:</span><span>{fav.rating_emotion && !isNaN(parseFloat(fav.rating_emotion)) ? toCS(parseFloat(fav.rating_emotion)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Melodie:</span><span>{fav.rating_melody && !isNaN(parseFloat(fav.rating_melody)) ? toCS(parseFloat(fav.rating_melody)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Videoklip:</span><span>{fav.rating_video && !isNaN(parseFloat(fav.rating_video)) ? toCS(parseFloat(fav.rating_video)) : '-'}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        <span>Hlas:</span><span>{fav.rating_voice && !isNaN(parseFloat(fav.rating_voice)) ? toCS(parseFloat(fav.rating_voice)) : '-'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    )
                })}
            </div>

            {filteredFavorites.length > 8 && (
                <div className="favp-table-toggle-row">
                    <button
                        className="favp-table-toggle"
                        onClick={() => setIsTableExpanded(!isTableExpanded)}
                    >
                        {isTableExpanded ? 'Sbalit tabulku OP/ED ▲' : 'Rozbalit tabulku OP/ED ▼'}
                    </button>
                </div>
            )}

            {/* OST Section */}
            {stats?.ostItems?.length > 0 && (
                <div style={{ marginTop: 'var(--spacing-2xl)' }}>
                    <h3 className="section-heading">
                        🎼 Favorite OST
                        <span className="section-heading-note">{stats.ostItems.length} skladeb</span>
                    </h3>
                    <div className="table-container hide-mobile">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Anime</th>
                                    <th>Song</th>
                                    <th>Autor</th>
                                    <th>Hodnocení</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.ostItems.map((ost, idx) => (
                                    <tr key={idx}>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {idx + 1}
                                        </td>
                                        <td style={{ fontWeight: '500', maxWidth: '250px' }}>
                                            {ost.anime_name}
                                        </td>
                                        <td style={{ color: 'var(--accent-amber)', fontWeight: '500' }}>
                                            {ost.song}
                                        </td>
                                        <td style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                            {ost.author || '-'}
                                        </td>
                                        <td>
                                            {ost.rating_final && !isNaN(parseFloat(ost.rating_final)) ? (
                                                <span className={`rating-badge rating-${Math.floor(parseFloat(ost.rating_final))}`}>
                                                    {toCS(parseFloat(parseFloat(ost.rating_final).toFixed(2)))}
                                                </span>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards for OST */}
                    <div className="mobile-card-list hide-desktop">
                        {stats.ostItems.map((ost, idx) => (
                            <div key={idx} className="mobile-card">
                                <div className="mobile-card-header">
                                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', flex: 1, alignItems: 'flex-start' }}>
                                        <div style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                            #{idx + 1}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                            <div className="mobile-card-title">
                                                <span style={{ color: 'var(--accent-amber)' }}>{ost.song}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                                {ost.anime_name}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mobile-card-grid">
                                    <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                        <span>Autor:</span>
                                        <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>{ost.author || '-'}</span>
                                    </div>
                                    <div className="mobile-card-row" style={{ gridColumn: '1 / -1' }}>
                                        <span>Hodnocení:</span>
                                        {ost.rating_final && !isNaN(parseFloat(ost.rating_final)) ? (
                                            <span className={`rating-badge rating-${Math.floor(parseFloat(ost.rating_final))}`} style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: 'auto' }}>
                                                {toCS(parseFloat(parseFloat(ost.rating_final).toFixed(2)))}
                                            </span>
                                        ) : '-'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* NEW 3 OST Tables */}
            {ostTables && (
                <div style={{ marginTop: 'var(--spacing-2xl)' }}>
                    <h3 className="section-heading">🎼 Anime Favourite OST</h3>

                    {/* Všechny tři sekce jsou plné šířky pod sebou v rozvržení flexboxu (fav-ost-layout) */}
                    <div className="fav-ost-layout">
                        {/* Table 1: OST Only (The Best) - Nyní nahoře, plná šířka */}
                        <div className="themed-outline fav-ost-panel">
                            <h4 className="section-heading">
                                🎵 OST Only (The Best)
                                <span className="section-heading-note">{ostTables.pieces.length} skladeb</span>
                                {piecesTracks.length > 0 && (
                                    <button
                                        type="button"
                                        className="fav-play-all-btn section-heading-action"
                                        onClick={() => openOstPlayer('pieces', 0)}
                                        title={`Otevřít přehrávač se všemi ${piecesTracks.length} skladbami`}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        Přehrát vše ({piecesTracks.length})
                                    </button>
                                )}
                                {/* Řazení podle data zhlédnutí, stejný přepínač jako v OST
                                    přehrávači. Mění i pořadí, ve kterém „Přehrát vše" hraje. */}
                                <button
                                    type="button"
                                    className={`fav-play-all-btn section-heading-action${piecesSort !== 'none' ? ' active' : ''}`}
                                    onClick={togglePiecesSort}
                                    title={piecesSort === 'newest'
                                        ? 'Seřazeno od nedávno zhlédnutých anime. Kliknutím přepneš na nejstarší.'
                                        : piecesSort === 'oldest'
                                            ? 'Seřazeno od nejdéle zhlédnutých anime. Kliknutím se vrátíš na moje pořadí.'
                                            : 'Moje pořadí. Kliknutím seřadíš podle data zhlédnutí.'}
                                >
                                    {piecesSort === 'newest' ? '🔽 Nedávné'
                                        : piecesSort === 'oldest' ? '🔼 Nejstarší'
                                            : '🔄 Moje pořadí'}
                                </button>
                            </h4>
                            <div className="fav-ost-flow fav-ost-flow--pieces">
                                {piecesSorted.map((p, i) => {
                                    const trackIdx = piecesTracks.findIndex(t => t.anime === p.anime_name && t.song === p.ost_name)
                                    return (
                                        <div className="fav-ost-flow-item" key={i}>
                                            <span className="fav-ost-flow-num">{i + 1}</span>
                                            {trackIdx >= 0 ? (
                                                <button
                                                    type="button"
                                                    className="fav-table-play-btn"
                                                    onClick={() => openOstPlayer('pieces', trackIdx)}
                                                    title="Přehrát tuto skladbu v přehrávači"
                                                >
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                                </button>
                                            ) : <span className="fav-ost-flow-noplay" />}
                                            <span className="fav-ost-flow-main" title={`${p.anime_name} — ${p.ost_name}`}>
                                                {p.ost_url
                                                    ? <a href={p.ost_url} target="_blank" rel="noreferrer" className="fav-ost-flow-song">{p.ost_name}</a>
                                                    : <span className="fav-ost-flow-song">{p.ost_name}</span>}
                                                {p.anime_url
                                                    ? <a href={p.anime_url} target="_blank" rel="noreferrer" className="fav-ost-flow-sub">{p.anime_name}</a>
                                                    : <span className="fav-ost-flow-sub">{p.anime_name}</span>}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Table 2: OST As a Whole - Tile Layout - Uprostřed, plná šířka */}
                        <div className="themed-outline fav-ost-panel">
                            <h4 className="section-heading">
                                🎧 OST Only (As a Whole)
                                {wholeGroups.length > 0 && (
                                    <button
                                        type="button"
                                        className="fav-play-all-btn section-heading-action"
                                        onClick={() => openOstPlayer('whole', 0)}
                                        title="Otevřít přehrávač se všemi playlisty seskupenými podle anime"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        Přehrát vše
                                    </button>
                                )}
                            </h4>
                            <div className="fav-whole-head">
                                <span className="fav-whole-hint">
                                    Seřazeno podle mého žebříčku, #1 je nejlepší OST jako celek
                                </span>
                                <input
                                    type="text"
                                    className="table-search-input fav-whole-search"
                                    placeholder="Hledat anime, autora, žánr, skladbu..."
                                    value={wholeSearch}
                                    onChange={(e) => setWholeSearch(e.target.value)}
                                />
                            </div>
                            <div className="fav-whole-grid">
                                {visibleWholeCards.map(card => (
                                    <OstWholeCard
                                        key={card.anime_name}
                                        card={card}
                                        onPlayPlaylist={() => { if (card.groupIdx >= 0) openOstPlayer('whole', card.groupIdx) }}
                                        onPlayBest={(piece) => playBestPieceFirst(card, piece)}
                                    />
                                ))}
                                {visibleWholeCards.length === 0 && (
                                    <div className="fav-whole-empty">Hledání „{wholeSearch}“ nic nenašlo.</div>
                                )}
                            </div>
                        </div>

                        {/* Table 3: OST + Scenes - Nyní dole, plná šířka */}
                        <div className="themed-outline fav-ost-panel">
                            <h4 className="section-heading">
                                🎬 OST + Scenes
                                <span className="section-heading-note">{ostTables.scenes.length} scén</span>
                                <a
                                    href="https://savsmb-my.sharepoint.com/:f:/g/personal/xmacoun1_is_savs_cz/IgB4lwcmUIhES67LCrn6UIYHAYtMD7DNKKhq256IvGNUpEs?e=f9QraG"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="link-plain fav-scenes-link section-heading-action"
                                >
                                    Složka videoklipů ↗
                                </a>
                            </h4>
                            <div className="fav-ost-flow fav-scene-flow">
                                {ostTables.scenes.map((s, i) => {
                                    const cleanUrl = getCleanSceneUrl(s.scene_url)
                                    const title = s.scene ? s.scene.replace(/^"(.*)"$/, '$1') : ''
                                    
                                    return (
                                        <div className="fav-ost-flow-item" key={i}>
                                            <span className="fav-scene-flow-ep" title="Epizoda / čas ve videu">
                                                {s.episode}
                                            </span>
                                            {cleanUrl ? (
                                                <a
                                                    href={cleanUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="fav-table-play-btn fav-scene-play-btn"
                                                    title={`Přehrát video: ${title}`}
                                                >
                                                    {/* Clapperboard SVG ikona */}
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                                                    </svg>
                                                </a>
                                            ) : (
                                                <span className="fav-ost-flow-noplay" />
                                            )}
                                            <span className="fav-ost-flow-main" title={`${s.anime_name} — ${title}`}>
                                                {cleanUrl ? (
                                                    <a href={cleanUrl} target="_blank" rel="noreferrer" className="fav-ost-flow-song">{title}</a>
                                                ) : (
                                                    <span className="fav-ost-flow-song">{title}</span>
                                                )}
                                                <span className="fav-ost-flow-sub">{s.anime_name}</span>
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}



            {/* OP/ED videoklip (Gdrive) v překryvném okně — stejné jako v detailu anime.
                onNext umožní re-roll na další náhodný OP/ED přímo z modalu. */}
            <VideoModal media={videoModal} onClose={() => setVideoModal(null)} onNext={playRandomOpEd} />

            {/* Plovoucí OST přehrávač je globální (OstPlayerProvider) — přežívá odchod ze stránky */}

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

export default Favorites
