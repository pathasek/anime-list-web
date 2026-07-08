import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { loadData, STORAGE_KEYS } from '../utils/dataStore'
import {
    Chart as ChartJS,
    RadialLinearScale,
    PointElement,
    LineElement,
    Filler,
    Tooltip,
    CategoryScale,
    LinearScale,
    BarElement
} from 'chart.js'
import { Bar, Chart } from 'react-chartjs-2'
import regression from 'regression'
import { formatReview } from '../utils/formatReview'
import { getThemeChartColors } from '../utils/chartTheme'
import { useTheme } from '../components/ThemeProvider'
import CategoryRatingsPanel, { formatCategoryMarkdown } from '../components/CategoryRatingsPanel'
import { RatingInfoButton, EpisodeGuideModal, FinalGuideModal } from '../components/RatingGuideModals'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, CategoryScale, LinearScale, BarElement)

// Module-level cache for static read-only files
let cachedEpRatings = null
let cachedNotes = null
let cachedCategoryTexts = null

function AnimeDetail() {
    const { theme } = useTheme();
    const c = useMemo(() => getThemeChartColors(), [theme]);
    const { name } = useParams()
    const navigate = useNavigate()
    const [anime, setAnime] = useState(null)
    const [categoryRatings, setCategoryRatings] = useState(null)
    const [episodeRatings, setEpisodeRatings] = useState(null)
    const [categoryReviews, setCategoryReviews] = useState(null)
    const [activeEpisode, setActiveEpisode] = useState(null) // { episodeNumber, title, text, rating, synopsis }
    const [note, setNote] = useState(null)
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [titleWrapped, setTitleWrapped] = useState(false)
    const [epGuideOpen, setEpGuideOpen] = useState(false)   // Průvodce hodnocením epizod
    const [fhGuideOpen, setFhGuideOpen] = useState(false)   // Průvodce finálním hodnocením
    const titleRef = useRef(null)

    // Detect if title wraps (for responsive badge layout)
    useLayoutEffect(() => {
        const el = titleRef.current;
        if (!el) return;
        const check = () => {
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || (1.75 * 16 * 1.3);
            if (el.scrollHeight > lineHeight * 1.2) {
                setTitleWrapped(true);
            }
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    }, [anime]);

    // Map anime type to CSS badge class (matches AnimeList logic)
    const getTypeBadgeClass = (type) => {
        const t = type?.toLowerCase() || '';
        if (t.includes('movie')) return 'movie';
        if (t.includes('ova')) return 'ova';
        if (t.includes('ona')) return 'ona';
        if (t.includes('special')) return 'special';
        return 'tv';
    };

    useEffect(() => {
        const decodedName = decodeURIComponent(name)
        setLoading(true)

        // Helper to load static files with cache
        const loadStaticFiles = async () => {
            const promises = []
            if (cachedEpRatings) {
                promises.push(Promise.resolve(cachedEpRatings))
            } else {
                promises.push(
                    fetch('data/episode_ratings.json?v=' + Date.now())
                        .then(r => r.json())
                        .then(data => {
                            cachedEpRatings = data
                            return data
                        })
                )
            }

            if (cachedNotes) {
                promises.push(Promise.resolve(cachedNotes))
            } else {
                promises.push(
                    fetch('data/notes.json?v=' + Date.now())
                        .then(r => r.json())
                        .then(data => {
                            cachedNotes = data
                            return data
                        })
                )
            }

            if (cachedCategoryTexts) {
                promises.push(Promise.resolve(cachedCategoryTexts))
            } else {
                promises.push(
                    fetch('data/category_texts.json?v=' + Date.now())
                        .then(r => r.json())
                        .then(data => {
                            cachedCategoryTexts = data
                            return data
                        })
                        .catch(() => ({}))
                )
            }

            return Promise.all(promises)
        }

        Promise.all([
            loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json'),
            loadData(STORAGE_KEYS.CATEGORY_RATINGS, 'data/category_ratings.json'),
            loadData(STORAGE_KEYS.HISTORY_LOG, 'data/history_log.json'),
            loadStaticFiles()
        ]).then(([animeList, ratings, historyLog, [epRatings, notes, categoryTexts]]) => {
            // Find anime by name
            const found = animeList.find(a => a.name === decodedName)
            setAnime(found)

            // Find category ratings
            const foundRatings = ratings.find(r => r.name === decodedName)
            setCategoryRatings(foundRatings?.categories || null)

            // Find category reviews
            setCategoryReviews(categoryTexts || {})

            // Find episode ratings
            const foundEpRatings = epRatings.find(r => r.name === decodedName)
            setEpisodeRatings(foundEpRatings?.episodes || null)

            // Find note/review
            const foundNote = notes.find(n => n.name === decodedName)
            setNote(foundNote?.note || null)

            // Find watching history (exact match)
            const animeHistory = historyLog.filter(h =>
                h.name && h.name.trim() === decodedName.trim()
            )
            setHistory(animeHistory)

            setLoading(false)
        }).catch(err => {
            console.error('Failed to load anime details:', err)
            setLoading(false)
        })
    }, [name])

    const categoryWeights = useMemo(() => ({
        "Animace": 2.0, "CGI": 1.8, "MC": 3.0, "Vedlejší postavy": 2.5, "Waifu": 1.5,
        "Plot": 4.0, "Pacing": 1.5, "Story Conclusion": 1.5, "Originalita": 2.5,
        "Emoce": 3.5, "Enjoyment": 4.0, "OP": 1.0, "ED": 0.5, "OST": 2.0
    }), [])



    // Episode ratings bar chart
    const episodeChartData = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return null

        const dataPoints = episodeRatings.map((ep, i) => [i + 1, ep.rating])
        let trendData = []
        if (dataPoints.length > 1) {
            const n = dataPoints.length
            const scaledDataPoints = dataPoints.map((p, idx) => {
                const scaledX = n > 1 ? -1 + 2 * idx / (n - 1) : 0
                return [scaledX, p[1]]
            })
            const result = regression.polynomial(scaledDataPoints, { order: 6, precision: 10 })
            trendData = dataPoints.map((p, idx) => {
                const scaledX = n > 1 ? -1 + 2 * idx / (n - 1) : 0
                return result.predict(scaledX)[1]
            })
        }

        const getPointColor = (rating) => {
            const r = parseFloat(rating);
            const level = r >= 10 ? '10' : r >= 9 ? '9' : r >= 8 ? '8' : r >= 7 ? '7' : r >= 6 ? '6' : r >= 5 ? '5' : r >= 4 ? '4' : r >= 3 ? '3' : r >= 2 ? '2' : '1';
            return getComputedStyle(document.documentElement).getPropertyValue(`--rating-${level}`).trim() || '#f8696b';
        }

        const datasets = []
        if (trendData.length > 0) {
            datasets.push({
                type: 'line',
                label: 'Polyn. (Celkem)',
                data: trendData,
                borderColor: c.textMuted,
                borderWidth: 2.8,
                pointRadius: 0,
                fill: false,
                tension: 0.45
            })
        }

        datasets.push({
            type: 'line',
            label: 'Hodnocení epizody',
            data: episodeRatings.map(ep => ep.rating),
            borderColor: c.textFaint,
            borderWidth: 1.5,
            tension: 0.15,
            pointBackgroundColor: episodeRatings.map(ep => getPointColor(ep.rating)),
            pointBorderColor: c.pointBorder,
            pointBorderWidth: 1,
            pointRadius: 5.5,
            pointHoverRadius: 7.5,
            showLine: true,
            clip: false
        })

        return {
            labels: episodeRatings.map(ep => ep.episode),
            datasets
        }
    }, [episodeRatings, c])

    const { epChartMin, epChartMax } = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return { epChartMin: 4.75, epChartMax: 10.0 }
        const valid = episodeRatings.map(e => e.rating).filter(r => r !== null && !isNaN(r))
        if (valid.length === 0) return { epChartMin: 4.75, epChartMax: 10.0 }
        const minVal = Math.min(...valid)
        const maxVal = Math.max(...valid)
        
        let dynMin = Math.floor(minVal * 2) / 2 - 0.5
        let dynMax = Math.ceil(maxVal * 2) / 2 + 0.5
        
        dynMax = Math.min(10.0, dynMax)
        if (dynMin < 0) dynMin = 0
        
        if (dynMax - dynMin < 1.0) {
            if (dynMax === 10.0) {
                dynMin = Math.max(0, dynMax - 1.0)
            } else {
                dynMax = dynMin + 1.0
            }
        }
        return { epChartMin: dynMin, epChartMax: dynMax }
    }, [episodeRatings])



    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
            if (elements && elements.length > 0 && episodeRatings && categoryReviews && anime) {
                const index = elements[0].index;
                const epNum = index + 1;
                const docxEp = categoryReviews[anime.name]?.episodes?.[epNum];
                if (docxEp) {
                    setActiveEpisode({
                        episodeNumber: epNum,
                        title: docxEp.title,
                        text: docxEp.text,
                        rating: episodeRatings[index]?.rating
                    });
                }
            }
        },
        onHover: (event, chartElement) => {
            if (event && event.native && event.native.target) {
                if (chartElement.length && categoryReviews && anime) {
                    const idx = chartElement[0].index;
                    const hasDocx = !!categoryReviews[anime.name]?.episodes?.[idx + 1];
                    event.native.target.style.cursor = hasDocx ? 'pointer' : 'default';
                } else {
                    event.native.target.style.cursor = 'default';
                }
            }
        },
        layout: {
            padding: {
                top: 8
            }
        },
        scales: {
            y: {
                beginAtZero: false,
                min: epChartMin,
                max: epChartMax,
                ticks: {
                    color: c.textMuted,
                    stepSize: 0.5,
                    callback: (value) => {
                        if (value > 10) return ''
                        return value.toFixed(1).replace('.', ',')
                    }
                },
                grid: { 
                    color: (context) => {
                        if (context.tick && context.tick.value > 10) return 'transparent';
                        return c.grid;
                    }
                }
            },
            x: {
                ticks: { color: c.textMuted },
                grid: { display: false }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    title: (context) => {
                        if (context && context[0] && categoryReviews && anime) {
                            const idx = context[0].dataIndex;
                            const docxEp = categoryReviews[anime.name]?.episodes?.[idx + 1];
                            return docxEp ? `📝 ${docxEp.title}` : `Epizoda ${idx + 1}`;
                        }
                        return '';
                    },
                    label: (context) => {
                        return `Hodnocení: ${context.raw.toFixed(1).replace('.', ',')}/10`;
                    }
                }
            }
        }
    }

    // Calculate average rating from categories using weights
    const avgCategoryRating = useMemo(() => {
        if (!categoryRatings) return null
        let sumProd = 0
        let sumWeight = 0
        Object.entries(categoryRatings).forEach(([cat, rating]) => {
            const w = categoryWeights[cat] || 1
            sumProd += rating * w
            sumWeight += w
        })
        return sumWeight > 0 ? (sumProd / sumWeight).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : 'N/A'
    }, [categoryRatings, categoryWeights])

    // Calculate average episode rating
    const avgEpisodeRating = useMemo(() => {
        if (!episodeRatings || episodeRatings.length === 0) return null
        const sum = episodeRatings.reduce((a, ep) => a + ep.rating, 0)
        return (sum / episodeRatings.length).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })
    }, [episodeRatings])

    // Calculate rewatch strings for the tooltip dynamically from history
    const rewatchTooltipStr = useMemo(() => {
        if (!anime || !anime.rewatch_count) return '';

        // Group history by rewatch number
        const rewatchGroups = {};
        history.forEach(h => {
            if (h.rewatch) {
                if (!rewatchGroups[h.rewatch]) rewatchGroups[h.rewatch] = [];
                if (h.date) rewatchGroups[h.rewatch].push(new Date(h.date).getTime());
            }
        });

        const lines = [];
        Object.keys(rewatchGroups).sort((a, b) => Number(a) - Number(b)).forEach(rewatchNum => {
            const timestamps = rewatchGroups[rewatchNum];
            if (timestamps.length > 0) {
                const minDate = new Date(Math.min(...timestamps));
                const maxDate = new Date(Math.max(...timestamps));

                const minD = String(minDate.getDate()).padStart(2, '0');
                const minM = String(minDate.getMonth() + 1).padStart(2, '0');
                const minY = minDate.getFullYear();

                const maxD = String(maxDate.getDate()).padStart(2, '0');
                const maxM = String(maxDate.getMonth() + 1).padStart(2, '0');
                const maxY = maxDate.getFullYear();

                let dateStr = '';
                if (minDate.getTime() === maxDate.getTime()) {
                    dateStr = `${minD}.${minM}.${minY}`;
                } else if (minM === maxM && minY === maxY) {
                    dateStr = `${minD}. - ${maxD}.${maxM}.${maxY}`;
                } else if (minY === maxY) {
                    dateStr = `${minD}.${minM}. - ${maxD}.${maxM}.${maxY}`;
                } else {
                    dateStr = `${minD}.${minM}.${minY} - ${maxD}.${maxM}.${maxY}`;
                }

                lines.push(`${rewatchNum}. Rewatch; ${dateStr}`);
            }
        });

        if (lines.length > 0) return lines.join('\n');

        if (anime.rewatches && anime.rewatches.length > 0) return anime.rewatches.map(r => r.replace(/;\s.*?\((.*?)\)$/, '; $1')).join('\n');
        if (anime.end_date) return `${anime.rewatch_count}. Rewatch; ${new Date(anime.end_date).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\s/g, '')}`;

        return '';
    }, [anime, history]);

    if (loading) {
        return <div className="fade-in"><h2>Načítám...</h2></div>
    }

    if (!anime) {
        return (
            <div className="fade-in">
                <h2>Anime nenalezeno</h2>
                <p>Anime "{decodeURIComponent(name)}" nebylo nalezeno.</p>
                <button className="btn btn-primary" onClick={() => navigate('/anime')}>
                    Zpět na seznam
                </button>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <button
                className="btn btn-primary"
                onClick={() => navigate(-1)}
                style={{
                    marginBottom: 'var(--spacing-lg)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    fontWeight: 'bold',
                    border: 'none',
                    padding: '0.6rem 1.2rem',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer'
                }}
            >
                ← Zpět
            </button>

            <div className="card" style={{ marginBottom: 'var(--spacing-xl)', overflow: 'hidden', padding: window.innerWidth < 768 ? '0' : 'var(--spacing-md)' }}>
                {/* Hero Section: Thumbnail + Info */}
                <div className="hero-section" style={{ padding: window.innerWidth < 768 ? 'var(--spacing-md)' : '0' }}>
                    {/* Left: Thumbnail */}
                    {anime.thumbnail && (
                        <div className="hero-image-container">
                            <img
                                src={anime.thumbnail.replace(/#/g, '%23')}
                                alt={anime.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                        </div>
                    )}

                    {/* Right: Info */}
                    <div style={{ flex: '1 1 300px', minWidth: 0, width: '100%' }}>
                        {/* Title Row — podmíněné: krátký = flex, dlouhý = title full-width + badge row s button vpravo */}
                        {titleWrapped ? (
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <h2 ref={titleRef} style={{ margin: 0, fontSize: '1.75rem', display: 'inline' }}>{anime.name}</h2>
                                <span style={{ display: 'inline-block', width: 'var(--spacing-md)' }} />
                                <span className={`type-badge ${getTypeBadgeClass(anime.type)}`} style={{ fontSize: '0.8rem', verticalAlign: 'middle' }}>
                                    {anime.type}
                                </span>
                                {' '}
                                {anime.status && (
                                    <span className={`status-badge ${anime.status.toLowerCase().replace('!', '')}`} style={{ marginLeft: 'var(--spacing-md)' }}>
                                        {anime.status}
                                    </span>
                                )}
                                {anime.mal_url && (
                                    <a href={anime.mal_url} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle', marginLeft: 'var(--spacing-md)' }}>
                                        🔗 MAL
                                    </a>
                                )}
                                <button
                                    className="recommend-btn"
                                    style={{
                                        display: 'inline-flex', marginTop: 'var(--spacing-sm)', float: 'right', clear: 'both',
                                        alignItems: 'center', gap: '0.6rem', 
                                        padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 'bold',
                                        background: 'linear-gradient(135deg, var(--accent-primary), #4f46e5)',
                                        color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                                        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                                        cursor: 'pointer', transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.6)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.4)'; }}
                                    onClick={() => navigate('/recommendations', { state: { presetAnime: anime } })}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                    Najít doporučení
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-md)' }}>
                                <h2 ref={titleRef} style={{ margin: 0, fontSize: '1.75rem' }}>{anime.name}</h2>
                                <span className={`type-badge ${getTypeBadgeClass(anime.type)}`} style={{ fontSize: '0.8rem' }}>
                                    {anime.type}
                                </span>
                                {anime.status && (
                                    <span className={`status-badge ${anime.status.toLowerCase().replace('!', '')}`}>
                                        {anime.status}
                                    </span>
                                )}
                                {anime.mal_url && (
                                    <a href={anime.mal_url} target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        🔗 MAL
                                    </a>
                                )}
                                <button
                                    className="recommend-btn"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.6rem', 
                                        padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 'bold',
                                        background: 'linear-gradient(135deg, var(--accent-primary), #4f46e5)',
                                        color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                                        boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                                        cursor: 'pointer', transition: 'all 0.2s ease',
                                        marginLeft: 'auto',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.6)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.4)'; }}
                                    onClick={() => navigate('/recommendations', { state: { presetAnime: anime } })}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
                                    Najít doporučení
                                </button>
                            </div>
                        )}

                        {/* Rating + Key Info Row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xl)', marginBottom: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                            {/* Big Rating Circle */}
                            {anime.rating && !isNaN(Number(anime.rating)) && (() => {
                                const rv = (r) => r >= 10 ? 'var(--rating-10)' : r >= 9 ? 'var(--rating-9)' : r >= 8 ? 'var(--rating-8)' : r >= 7 ? 'var(--rating-7)' : r >= 6 ? 'var(--rating-6)' : r >= 5 ? 'var(--rating-5)' : r >= 4 ? 'var(--rating-4)' : r >= 3 ? 'var(--rating-3)' : r >= 2 ? 'var(--rating-2)' : 'var(--rating-1)';
                                const ratingVar = rv(Number(anime.rating));
                                return (
                                <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                                    <div style={{
                                        width: '72px', height: '72px',
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        flexDirection: 'column',
                                        border: `3px solid ${ratingVar}`,
                                        background: `color-mix(in srgb, ${ratingVar} 12%, transparent)`
                                    }}>
                                        <span style={{
                                            fontSize: '1.5rem', fontWeight: '800', lineHeight: 1,
                                            color: ratingVar
                                        }}>
                                            {Number(anime.rating) % 1 === 0 ? parseInt(anime.rating) : parseFloat(anime.rating).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})}
                                        </span>
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', lineHeight: 1 }}>/10</span>
                                    </div>
                                    {/* "?" v prázdném rohu vedle kruhu — absolutní pozice, layout se nemění.
                                        Odsazené dál od kruhu, ať mezi ikonami zůstane viditelná mezera. */}
                                    <RatingInfoButton
                                        label="Co znamená finální hodnocení"
                                        style={{ position: 'absolute', top: '-7px', right: '-16px' }}
                                        onClick={() => setFhGuideOpen(true)}
                                    />
                                </div>
                                );
                            })()}

                            <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 'var(--spacing-md) var(--spacing-xl)',
                                flex: 1
                            }}>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Studio</span>
                                    <div style={{ fontWeight: '500' }}>{anime.studio || 'N/A'}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Epizody</span>
                                    <div style={{ fontWeight: '500' }}>{anime.episodes || 'N/A'}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Délka epizody</span>
                                    <div style={{ fontWeight: '500' }}>{anime.episode_duration ? `${Math.round(anime.episode_duration)} min` : 'N/A'}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Datum vydání</span>
                                    <div style={{ fontWeight: '500' }}>{anime.release_date ? new Date(anime.release_date).toLocaleDateString('cs-CZ') : 'N/A'}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sledováno</span>
                                    <div style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>
                                        {(() => {
                                            const start = anime.start_date && !isNaN(new Date(anime.start_date).getTime()) ? new Date(anime.start_date).toLocaleDateString('cs-CZ') : '?';
                                            const end = anime.end_date && !isNaN(new Date(anime.end_date).getTime()) ? new Date(anime.end_date).toLocaleDateString('cs-CZ') : '?';

                                            if (start === '?' && end === '?') return '?';
                                            if (start === end) return start;
                                            if (end === '?') return start;
                                            return `${start} – ${end}`;
                                        })()}
                                    </div>
                                </div>
                                {anime.rewatch_count > 0 && (
                                    <div>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rewatch</span>
                                        <div
                                            style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}
                                            title={rewatchTooltipStr}
                                        >
                                            {anime.rewatch_count}x
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '16px',
                                                height: '16px',
                                                borderRadius: '50%',
                                                background: 'var(--accent-primary)',
                                                color: 'white',
                                                fontSize: '0.65rem',
                                                cursor: 'help'
                                            }}>?</span>
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dabing</span>
                                    <div style={{ fontWeight: '500' }}>{anime.dub || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        {/* TAGS ROW — Žánry + Témata nahoře, AniList Tagy dole */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', background: 'var(--bg-secondary)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                            {/* Žánry + Témata na jednom řádku */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                                {anime.genres && (
                                    <>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>Žánry</span>
                                        {anime.genres.split(';').map((g, i) => (
                                            <span key={`g-${i}`} style={{
                                                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                                fontSize: '0.75rem', fontWeight: '500',
                                                background: 'rgba(6,182,212,0.15)', color: 'var(--accent-cyan)',
                                                border: '1px solid rgba(6,182,212,0.3)'
                                            }}>{g.trim()}</span>
                                        ))}
                                    </>
                                )}
                                {anime.themes && anime.themes !== 'X' && (
                                    <>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '8px', marginRight: '4px' }}>Témata</span>
                                        {anime.themes.split(';').map((t, i) => (
                                            <span key={`t-${i}`} style={{
                                                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                                fontSize: '0.75rem', fontWeight: '500',
                                                background: 'rgba(139,92,246,0.15)', color: 'var(--accent-secondary)',
                                                border: '1px solid rgba(139,92,246,0.3)'
                                            }}>{t.trim()}</span>
                                        ))}
                                    </>
                                )}
                            </div>

                            {/* AniList Tagy pod žánry+tématy */}
                            {anime.tags && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>AniList Tagy</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {anime.tags.split(';').map((t, i) => {
                                            const parts = t.split(':');
                                            if (parts.length < 2) return null;
                                            const name = parts[0];
                                            const rank = parseInt(parts[1]) || 0;
                                            const desc = parts[2] || '';
                                            let bg = 'rgba(255, 255, 255, 0.05)', color = 'var(--text-secondary)', border = 'var(--border-color)';
                                            if (rank >= 80) { bg = 'rgba(255, 215, 0, 0.15)'; color = '#ffd700'; border = 'rgba(255, 215, 0, 0.4)'; }
                                            else if (rank >= 60) { bg = 'rgba(0, 255, 255, 0.1)'; color = '#00ffff'; border = 'rgba(0, 255, 255, 0.3)'; }
                                            
                                            return (
                                                <span key={`a-${i}`} title={desc} style={{
                                                    padding: '2px 8px', borderRadius: '4px',
                                                    fontSize: '0.7rem', fontWeight: rank >= 80 ? 'bold' : 'normal',
                                                    cursor: desc ? 'help' : 'default',
                                                    background: bg, color: color,
                                                    border: `1px solid ${border}`,
                                                    boxShadow: rank >= 80 ? '0 0 8px rgba(255, 215, 0, 0.2)' : 'none'
                                                }}>
                                                    {name} {rank}%
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Narrative Review / Note */}
            {note && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📝 Recenze / Poznámky</h3>
                    <p style={{ fontFamily: "'Open Sans', var(--font-family)", lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{formatReview(note.replace(/_x000D_/g, ''), decodeURIComponent(name))}</p>
                </div>
            )}

            {/* Category Ratings Radar Chart */}
            <CategoryRatingsPanel
                categoryRatings={categoryRatings}
                categoryWeights={categoryWeights}
                avgRating={avgCategoryRating}
                animeName={anime.name}
                animeSeries={anime.series}
                malUrl={anime.mal_url}
                review={note}
                categoryReviews={categoryReviews}
            />

            {/* Episode Ratings */}
            {episodeRatings && episodeChartData && !['movie', 'film', 'music'].includes((anime.type || '').toLowerCase()) && (
                <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <div className="chart-header-flex" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                            <h3 style={{ margin: 0 }}>
                                Hodnocení epizod
                                <span style={{ marginLeft: 'var(--spacing-md)', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                                    (Průměr: <span style={{ fontWeight: 'bold' }}>{avgEpisodeRating}</span>)
                                </span>
                                <RatingInfoButton
                                    label="Jak hodnotím epizody"
                                    style={{ marginLeft: '10px' }}
                                    onClick={() => setEpGuideOpen(true)}
                                />
                            </h3>

                            {/* Custom Legend */}
                            <div className="chart-legend-container">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(29, 161, 242)' }}></span>
                                    <span>Absolute Cinema</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(24, 106, 59)' }}></span>
                                    <span>Awesome</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(40, 180, 99)' }}></span>
                                    <span>Great</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(244, 208, 63)' }}></span>
                                    <span>Good</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(243, 156, 18)' }}></span>
                                    <span>Regular</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'rgb(99, 57, 116)' }}></span>
                                    <span>Bad</span>
                                </div>
                            </div>
                        </div>
                        {categoryReviews && anime && categoryReviews[anime.name]?.episodes && (
                            <p className="category-ratings-info-text" style={{ margin: '4px 0 0 0' }}>
                                Faktické rozbory epizod byly vygenerovány AI z webových zdrojů a mohou obsahovat chyby. Kliknutím na bod (tečku) konkrétní epizody v grafu zobrazíte její detailní rozbor.
                            </p>
                        )}
                    </div>

                    <div style={{ height: '350px' }}>
                        <Chart type="line" data={episodeChartData} options={barOptions} key={c.isLight ? 'ep-l' : 'ep-d'} />
                    </div>
                </div>
            )}

            {/* Watching History */}
            {history.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Historie sledování</h3>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Datum</th>
                                <th>Epizody</th>
                                <th>Čas</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((h, i) => (
                                <tr key={i}>
                                    <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {h.date ? new Date(h.date).toLocaleDateString('cs-CZ') : 'N/A'}
                                        {h.rewatch && (
                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85em' }}>
                                                {h.rewatch}. Rewatch
                                            </span>
                                        )}
                                    </td>
                                    <td>{h.episodes}</td>
                                    <td>{h.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Průvodce hodnocením epizod a finálním hodnocením */}
            <EpisodeGuideModal open={epGuideOpen} onClose={() => setEpGuideOpen(false)} />
            <FinalGuideModal open={fhGuideOpen} onClose={() => setFhGuideOpen(false)} />
            <EpisodeDetailModal activeEpisode={activeEpisode} onClose={() => setActiveEpisode(null)} />
        </div>
    )
}

function EpisodeDetailModal({ activeEpisode, onClose }) {
    if (!activeEpisode) return null

    const { episodeNumber, title, text, rating } = activeEpisode

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    const fmtRating = (r) => {
        if (r === null || r === undefined) return 'N/A'
        return r.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
    }

    return (
        <div className="category-detail-modal-overlay" onClick={handleOverlayClick}>
            <div className="category-detail-modal">
                <div className="category-detail-modal-header">
                    <div className="category-detail-modal-title">
                        <span className="category-card-icon">📝</span>
                        <span>{title}</span>
                        {rating !== undefined && rating !== null && (
                            <span className="category-detail-modal-score">{fmtRating(rating)}/10</span>
                        )}
                    </div>
                    <button type="button" className="category-detail-modal-close" onClick={onClose} aria-label="Zavřít">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="category-detail-modal-body">
                    <div className="category-detail-text-column">
                        {formatCategoryMarkdown(text)}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default AnimeDetail

