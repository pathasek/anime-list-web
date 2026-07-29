import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import DashboardGroup from '../components/DashboardGroup'

// Minihra „Hádej OP/ED“ — izolovaná featura, načítá se lazy až při spuštění
const OpEdQuizGame = lazy(() => import('../components/opedquiz/OpEdQuizGame'))
import { VideoModal } from '../components/CategoryMediaPlayers'
import { useOstPlayer } from '../components/OstPlayerProvider'
import { normalizeAnimeKey, extractYoutubeId, extractYoutubePlaylistId, findOpEdVideo, animeKeysMatch, songsLooselyMatch } from '../utils/mediaMatch'
import { getDominantColor } from '../utils/dominantColor'
import { getPlaylistCounts, OST_COUNTS_EVENT } from '../utils/ostPlaylistCounts'
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
// Kolik best skladeb se vejde do volného místa vpravo dole na kartě.
const BEST_PIECES_PER_CARD = 4

function OstWholeCard({ card, onPlayPlaylist, onPlayBest }) {
    const [tint, setTint] = useState(null)

    useEffect(() => {
        if (!card.image) return
        let cancelled = false
        getDominantColor(card.image).then(c => { if (!cancelled) setTint(c) })
        return () => { cancelled = true }
    }, [card.image])

    const rgb = tint ? `${tint.r}, ${tint.g}, ${tint.b}` : null
    const style = rgb
        ? {
            background: `linear-gradient(160deg, rgba(${rgb}, 0.42) 0%, rgba(${rgb}, 0.16) 42%, var(--bg-tertiary) 88%)`,
            borderColor: `rgba(${rgb}, 0.45)`,
            '--fav-card-tint': rgb,
        }
        : undefined

    const meta = [
        card.parts > 1 ? `${card.parts} díly` : null,
        card.episodes > 0 ? `${card.episodes} EP` : null,
        card.hours > 0 ? `${card.hours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h` : null,
    ].filter(Boolean)

    return (
        <div className={`fav-whole-card${card.rank <= 3 ? ` rank-${card.rank}` : ''}`} style={style}>
            <div className="fav-whole-cover" onClick={onPlayPlaylist}
                title={card.groupIdx >= 0 ? `Přehrát playlist: ${card.anime_name}` : card.anime_name}>
                {card.image
                    ? <img src={card.image} alt="" loading="lazy" />
                    : <div className="fav-whole-cover-ph">♪</div>}
                {card.groupIdx >= 0 && (
                    <button type="button" className="fav-whole-play" title={`Přehrát playlist: ${card.anime_name}`}
                        onClick={(e) => { e.stopPropagation(); onPlayPlaylist() }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                )}
            </div>

            <div className="fav-whole-body">
                <div className="fav-whole-titlerow">
                    <span className="fav-whole-rank" title={`${card.rank}. místo v mém žebříčku OST`}>
                        {card.rank}
                    </span>
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

                {(card.genres.length > 0 || card.themes.length > 0) && (
                    <div className="fav-whole-tags">
                        {card.genres.map(g => <span key={g} className="fav-whole-tag genre">{g}</span>)}
                        {card.themes.map(t => <span key={t} className="fav-whole-tag theme">{t}</span>)}
                    </div>
                )}

                <div className="fav-whole-meta">
                    {meta.join(' · ')}
                    {card.trackCount ? (
                        <span
                            className="fav-whole-tracks"
                            title={card.trackCountSource === 'playlist'
                                ? 'Zjištěno přímo z playlistu při posledním přehrání'
                                : 'Podle YouTube Music alba (playlist se ještě nepřehrával)'}
                        >
                            ♪ {card.trackCount} skladeb
                        </span>
                    ) : null}
                </div>

                {/* Spodek karty: odkazy vlevo dole, best skladby vyplňují volné
                    místo vpravo a skládají se na sebe. Když je skladba jen jedna,
                    stojí svisle na středu volného místa, ne úplně v rohu. */}
                <div className="fav-whole-bottom">
                    <div className="fav-whole-links">
                        {card.spotify_url && <a href={card.spotify_url} target="_blank" rel="noreferrer" className="ext-link ext-link--spotify">Spotify</a>}
                        {card.yt_url && <a href={card.yt_url} target="_blank" rel="noreferrer" className="ext-link ext-link--yt">YouTube</a>}
                    </div>

                    {card.best.length > 0 && (
                        <div className="fav-whole-best">
                            <span className="fav-whole-best-label">Best</span>
                            {card.best.map((p, i) => (
                                <button
                                    key={p.ost_name || i}
                                    type="button"
                                    className="fav-whole-best-chip"
                                    onClick={() => onPlayBest(p)}
                                    title={`Přehrát „${p.ost_name}" jako první, playlist pak pokračuje`}
                                >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                    {p.ost_name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
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
    const [wholeSearch, setWholeSearch] = useState('')     // hledání v kartách As a Whole
    // Počty skladeb zjištěné přehrávačem při spuštění playlistu (localStorage).
    // Aktualizují se hned, jak přehrávač playlist načte — bez reloadu stránky.
    const [playlistCounts, setPlaylistCounts] = useState(() => getPlaylistCounts())
    useEffect(() => {
        const onChange = () => setPlaylistCounts(getPlaylistCounts())
        window.addEventListener(OST_COUNTS_EVENT, onChange)
        return () => window.removeEventListener(OST_COUNTS_EVENT, onChange)
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
            fetch('data/ytmusic_ost.json?v=' + Date.now()).then(r => r.json()).catch(() => null)
        ])
            .then(([favData, ostData, spotData, opEdData, animeListData, atData, ymData]) => {
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
                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load favorites:', err)
                setLoading(false)
            })
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
    // Plochý seznam všech "The Best" skladeb (pieces)
    const piecesTracks = useMemo(() => {
        if (!ostTables?.pieces) return []
        return ostTables.pieces
            .map(p => {
                const ytId = extractYoutubeId(p.ost_url)
                if (!ytId) return null
                // Dohledání watch_date z anime_list pro řazení
                const pieceKey = normalizeAnimeKey(p.anime_name)
                const match = animeListRef.current.find(a => {
                    const aKey = normalizeAnimeKey(a.name)
                    return animeKeysMatch(aKey, pieceKey) || animeKeysMatch(pieceKey, aKey)
                })
                const watchDate = match ? (match.end_date || match.start_date || null) : null
                return { anime: p.anime_name, song: p.ost_name, ytId, watch_date: watchDate }
            })
            .filter(Boolean)
    }, [ostTables])

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
            // Členové série: shoda na pole `series`, na přesný název, nebo na
            // název začínající názvem playlistu (sezóny „…, S02" apod.)
            const members = list.filter(a => {
                const nk = normalizeAnimeKey(a.name)
                return normalizeAnimeKey(a.series) === key || nk === key || nk.startsWith(key + ' ')
            })
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
                .slice(0, BEST_PIECES_PER_CARD)

            const album = (ytmusicAlbums || []).find(a => normalizeAnimeKey(a.anime_name) === key)
            // Přednost má počet zjištěný přímo z playlistu (je to ten, který
            // opravdu poslouchám); YT Music album je záloha, když se playlist
            // ještě nikdy nepustil.
            const playlistId = extractYoutubePlaylistId(w.yt_url)
            const liveCount = playlistId ? playlistCounts[playlistId]?.count ?? null : null

            let image = null
            if (spotifyImages) {
                const mk = Object.keys(spotifyImages).find(k => {
                    const ck = normalizeAnimeKey(k)
                    return ck && (key.includes(ck) || ck.includes(key))
                })
                if (mk) image = spotifyImages[mk]
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
                trackCount: liveCount ?? album?.track_count ?? null,
                trackCountSource: liveCount ? 'playlist' : (album?.track_count ? 'ytmusic' : null),
                albumDuration: album?.duration || null,
                best,
            }
        })
    // `favorites` je v závislostech schválně: animeListRef se plní ve stejném
    // efektu jako favorites, takže jeho změna signalizuje, že už jsou data k dispozici.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortedWhole, wholeGroups, ostTables, spotifyImages, ytmusicAlbums, playlistCounts, favorites])

    const visibleWholeCards = useMemo(() => {
        const q = wholeSearch.trim().toLowerCase()
        if (!q) return wholeCards
        return wholeCards.filter(c =>
            c.anime_name.toLowerCase().includes(q)
            || c.genres.some(g => g.toLowerCase().includes(q))
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                <h2 style={{ margin: 0 }}>
                    Favourite OP/ED/OST
                </h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={() => setQuizOpen(true)}
                    style={{
                        background: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                        color: 'white',
                        padding: '10px 20px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                        transition: 'all 0.2s'
                    }}
                    title="Minihra: pustí se jen hudba OP/ED a hádáš anime"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.25)';
                    }}
                >
                    🎮 Hádej OP/ED
                </button>
                <button
                    type="button"
                    onClick={playRandomOpEd}
                    style={{
                        background: 'linear-gradient(135deg, #095aba 0%, #1e40af 100%)',
                        color: 'white',
                        padding: '10px 20px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(9, 90, 186, 0.2)',
                        transition: 'all 0.2s'
                    }}
                    title="Přehraje náhodný OP/ED z tabulky (Gdrive klip, nebo znělka z AnimeThemes)"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(9, 90, 186, 0.35)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(9, 90, 186, 0.2)';
                    }}
                >
                    🎲 Náhodný OP/ED
                </button>
                </div>
            </div>

            {/* Minihra Hádej OP/ED — renderuje se portálem, lazy-loaded */}
            {quizOpen && (
                <Suspense fallback={null}>
                    <OpEdQuizGame onClose={() => setQuizOpen(false)} />
                </Suspense>
            )}

            {/* 2. Stats Grid (Counts) */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{stats?.total || 0}</div>
                    <div className="stat-label">Celkem songů</div>
                </div>
                <div className="stat-card pink">
                    <div className="stat-value">{stats?.types?.OP || 0}</div>
                    <div className="stat-label">Openings</div>
                </div>
                <div className="stat-card cyan">
                    <div className="stat-value">{stats?.types?.ED || 0}</div>
                    <div className="stat-label">Endings</div>
                </div>
                <div className="stat-card amber">
                    <div className="stat-value">{stats?.withRating || 0}</div>
                    <div className="stat-label">S hodnocením</div>
                </div>
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

            {/* Search and Filters */}
            <div className="search-bar">
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Hledat anime, song, autora..."
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
                    {['all', 'OP', 'ED', 'OST'].map(t => (
                        <button
                            key={t}
                            className={`filter-btn ${typeFilter === t ? 'active' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t === 'all' ? 'Vše' : t}
                        </button>
                    ))}
                    <select
                        value={ratingFilter}
                        onChange={(e) => setRatingFilter(e.target.value)}
                        className="filter-btn"
                        style={{ outline: 'none' }}
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
                        className="filter-btn"
                        style={{ outline: 'none' }}
                    >
                        <option value="all">Všechny jazyky</option>
                        <option value="JAP">Pouze JAP</option>
                        <option value="ENG">Pouze ENG</option>
                        <option value="LAT">Latina (LAT)</option>
                        <option value="GER">Němčina (GER)</option>
                        <option value="MIX">Kombinace (%)</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="table-container hide-mobile">
                <table style={{ fontSize: '0.85rem' }}>
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
                                    {hasVideo && (
                                        <span className={`fav-play-hint${isAt ? ' is-at' : ''}`} aria-hidden="true">
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                        </span>
                                    )}
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
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--spacing-lg)' }}>
                    <button
                        className="filter-btn"
                        onClick={() => setIsTableExpanded(!isTableExpanded)}
                        style={{ padding: '8px 24px', fontWeight: 'bold' }}
                    >
                        {isTableExpanded ? 'SBALIT TABULKU OP/ED ▲' : 'ROZBALIT TABULKU OP/ED ▼'}
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

                    {/* „As a Whole" má celou šířku (žebříček teče doprava a dolů),
                        pod ním dvě užší sekce vedle sebe. */}
                    <div className="fav-ost-layout">
                        {/* Table 1 (Formerly 3): OST As a Whole - Tile Layout */}
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
                                    placeholder="Hledat anime, žánr, skladbu..."
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

                        {/* Table 2 + 3: obě tečou po sloupcích doprava a scrollují
                            vodorovně — svisle jich přes 200 zabíralo přes celou
                            obrazovku výšky. */}
                        <div className="fav-ost-row">
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
                                </h4>
                                <div className="fav-ost-flow fav-ost-flow--pieces">
                                    {ostTables.pieces.map((p, i) => {
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
                                        Videoklipy ↗
                                    </a>
                                </h4>
                                <div className="fav-ost-flow fav-ost-flow--scenes">
                                    {ostTables.scenes.map((s, i) => (
                                        <div className="fav-ost-flow-item" key={i}>
                                            <span className="fav-ost-flow-ep">{s.episode}</span>
                                            <span className="fav-ost-flow-main" title={`${s.anime_name} — ${s.scene}`}>
                                                <span className="fav-ost-flow-song">{s.scene}</span>
                                                <span className="fav-ost-flow-sub">{s.anime_name}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
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
