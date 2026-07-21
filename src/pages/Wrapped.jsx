import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { loadData, STORAGE_KEYS } from '../utils/dataStore';
import { calculateWrappedData } from '../utils/wrappedCalculations';
import { extractMalId, getAnimeInfo } from '../utils/jikanService';
import './Wrapped.css';



// Jikan Poster component loading images asynchronously
function JikanPoster({ malUrl, size = 'small' }) {
    const [imageUrl, setImageUrl] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!malUrl) { setLoading(false); return; }
        const malId = extractMalId(malUrl);
        if (!malId) { setLoading(false); return; }
        
        let cancelled = false;
        getAnimeInfo(malId).then(info => {
            if (!cancelled && info) {
                setImageUrl(size === 'large' ? (info.largeImageUrl || info.imageUrl) : info.imageUrl);
            }
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [malUrl, size]);

    const dims = size === 'large' ? { width: '130px', height: '185px' } : { width: '80px', height: '113px' };

    return (
        <div className="jikan-poster-container" style={dims}>
            {imageUrl ? (
                <img src={imageUrl} alt="" className="jikan-poster-img" loading="lazy" />
            ) : loading ? (
                <span className="jikan-poster-placeholder">…</span>
            ) : (
                <span className="jikan-poster-placeholder">🎬</span>
            )}
        </div>
    );
}

const MAL_SCORE_LABELS = {
    10: 'Masterpiece',
    9: 'Great',
    8: 'Very Good',
    7: 'Good',
    6: 'Fine',
    5: 'Average',
    4: 'Bad',
    3: 'Very Bad',
    2: 'Horrible',
    1: 'Appalling'
};

const HEATMAP_COLOR_LEVEL_1 = 2;
const HEATMAP_COLOR_LEVEL_2 = 6;
const HEATMAP_COLOR_LEVEL_3 = 13;
const HEATMAP_COLOR_LEVEL_4 = 19;

const getHeatmapColor = (eps) => {
    if (eps === 0) return 'var(--bg-secondary)';
    if (eps <= HEATMAP_COLOR_LEVEL_1) return '#0e4429';
    if (eps <= HEATMAP_COLOR_LEVEL_2) return '#006d32';
    if (eps <= HEATMAP_COLOR_LEVEL_3) return '#26a641';
    if (eps <= HEATMAP_COLOR_LEVEL_4) return '#39d353';
    return '#39d353';
};

export default function Wrapped() {
    // Data states
    const [animeList, setAnimeList] = useState([]);
    const [historyLog, setHistoryLog] = useState([]);
    const [statsJson, setStatsJson] = useState(null);
    const [jikanCache, setJikanCache] = useState(null);
    const [metadataCache, setMetadataCache] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Interactive states
    const [selectedYear, setSelectedYear] = useState('2025'); // default to 2025 as the main year
    // Výchozí je klasický přehled — stories se spouští až tlačítkem (task 16)
    const [viewMode, setViewMode] = useState('classic'); // 'stories' or 'classic'
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);


    const progressInterval = useRef(null);
    const lastTickTime = useRef(0);
    const SLIDE_DURATION = 5500; // 5.5 seconds per slide

    // Load data from files on mount
    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [al, hl, st] = await Promise.all([
                    loadData(STORAGE_KEYS.ANIME_LIST, 'data/anime_list.json'),
                    loadData(STORAGE_KEYS.HISTORY_LOG, 'data/history_log.json'),
                    fetch('data/stats.json').then(res => res.json()).catch(() => null)
                ]);
                
                // Fetch static cache to obtain community scores
                const [cache, metadataCache] = await Promise.all([
                    fetch('data/jikan_cache.json').then(res => res.ok ? res.json() : null).catch(() => null),
                    fetch('data/anime_metadata.json').then(res => res.ok ? res.json() : null).catch(() => null)
                ]);

                setAnimeList(al);
                setHistoryLog(hl);
                setStatsJson(st);
                setJikanCache(cache);
                setMetadataCache(metadataCache);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load data for Wrapped:', err);
                setError(err.message);
                setLoading(false);
            }
        };
        fetchAllData();
    }, []);

    // Calculate dynamic wrapped stats
    const data = useMemo(() => {
        if (!animeList.length || !historyLog.length) return null;
        return calculateWrappedData(animeList, historyLog, statsJson, jikanCache, selectedYear, metadataCache);
    }, [animeList, historyLog, statsJson, jikanCache, selectedYear, metadataCache]);

    // Available years in database
    const availableYears = useMemo(() => {
        if (!historyLog.length) return ['2025'];
        const yearsSet = new Set(['2025', '2026', '2024']);
        historyLog.forEach(h => {
            if (h.date) {
                const y = h.date.split('-')[0];
                if (y && y.length === 4 && parseInt(y) > 2000) {
                    yearsSet.add(y);
                }
            }
        });
        return Array.from(yearsSet).sort((a, b) => b - a);
    }, [historyLog]);

    const TOTAL_SLIDES = 20;

    // Handle slide change resets
    const handleNextSlide = () => {
        setProgress(0);
        setCurrentSlide(prev => Math.min(prev + 1, TOTAL_SLIDES - 1));
    };

    const handlePrevSlide = () => {
        setProgress(0);
        setCurrentSlide(prev => Math.max(prev - 1, 0));
    };

    // Autoplay logic
    useEffect(() => {
        if (!isPlaying || viewMode !== 'stories' || currentSlide === 0) {
            clearInterval(progressInterval.current);
            return;
        }

        lastTickTime.current = Date.now();
        progressInterval.current = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(progressInterval.current);
                    if (currentSlide < TOTAL_SLIDES - 1) {
                        setCurrentSlide(c => c + 1);
                        return 0;
                    } else {
                        setIsPlaying(false);
                        return 100;
                    }
                }
                return prev + 1.8; // progress speed
            });
        }, 100);

        return () => clearInterval(progressInterval.current);
    }, [isPlaying, viewMode, currentSlide]);

    // Pause autoplay on mouse hold
    const handleMouseDown = () => setIsPlaying(false);
    const handleMouseUp = () => {
        if (currentSlide > 0 && currentSlide < TOTAL_SLIDES - 1) {
            setIsPlaying(true);
        }
    };

    // Reset slide to 0 when changing years or view modes
    const handleYearChange = (e) => {
        setSelectedYear(e.target.value);
        setCurrentSlide(0);
        setProgress(0);
        setIsPlaying(false);
    };

    const handleToggleView = () => {
        setViewMode(v => v === 'stories' ? 'classic' : 'stories');
        setCurrentSlide(0);
        setProgress(0);
        setIsPlaying(false);
    };

    const handleStart = () => {
        setCurrentSlide(1);
        setProgress(0);
        setIsPlaying(true);
    };

    // ----------------------------------------------------
    // SLIDE CONTENT DEFINITIONS
    // ----------------------------------------------------
    const slideBgs = [
        'bg-slide-intro',      // 0: Intro
        'bg-slide-time',       // 1: Total Time Watched
        'bg-slide-stats',      // 2: Completed vs Rewatched
        'bg-slide-time',       // 3: Peak Month
        'bg-slide-stats',      // 4: Active Day of Week
        'bg-slide-time',       // 5: Unique Days Grid
        'bg-slide-genres',     // 6: Ratings Distribution
        'bg-slide-intro',      // 7: Hot Take / Under-Hyped
        'bg-slide-genres',     // 8: Genre Bias (Top Affinity)
        'bg-slide-genres',     // 9: Genre Deviant (Bottom)
        'bg-slide-franchise',  // 10: Franchise Spotlight
        'bg-slide-franchise',  // 11: Top 5 Franchises
        'bg-slide-binge',      // 12: Binge Spotlight
        'bg-slide-binge',      // 13: Top 5 Binges
        'bg-slide-seasons',    // 14: Seasonal Warrior
        'bg-slide-seasons',    // 15: Winter breakdown
        'bg-slide-seasons',    // 16: Spring breakdown
        'bg-slide-seasons',    // 17: Summer breakdown
        'bg-slide-seasons',    // 18: Fall breakdown
        'bg-slide-recap'       // 19: Recap Summary Card
    ];

    // Maximum value helper for custom charts
    const maxScoreDistCount = data ? Math.max(...Object.values(data.scoreDistribution), 1) : 1;
    const maxGenreCount = data ? Math.max(...data.topGenres.map(g => g.count), 1) : 1;
    const maxDeviantCount = data ? Math.max(...data.bottomGenres.map(g => g.count), 1) : 1;

    if (loading) {
        return (
            <div className="wrapped-container" style={{ justifyContent: 'center', height: '80vh' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>Načítání statistik... ⏱️</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="wrapped-container" style={{ justifyContent: 'center', height: '80vh' }}>
                <div style={{ color: '#ef4444', fontSize: '1.2rem' }}>Chyba při načítání dat: {error}</div>
            </div>
        );
    }

    return (
        <div className="wrapped-container">
            {/* Header controls */}
            <div className="wrapped-header">
                <div className="wrapped-header-title">
                    Anime Wrapped {selectedYear === 'all' ? 'All-Time' : selectedYear}
                </div>
                <div className="wrapped-controls">
                    <select className="wrapped-select-year" value={selectedYear} onChange={handleYearChange}>
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                        <option value="all">Všechny roky</option>
                    </select>
                    <button className="btn-toggle-view" onClick={handleToggleView}>
                        {viewMode === 'stories' ? '🎛️ Klasický Přehled' : '📱 Přehrát Stories'}
                    </button>
                </div>
            </div>

            {/* ==================================================== */}
            {/* STORIES MODE VIEW (CELOOBRAZOVKOVÝ OVERLAY PRO VŠECHNY SLIDY) */}
            {/* ==================================================== */}
            {viewMode === 'stories' && (
                <div className="stories-modal-overlay">
                    <button className="stories-close-btn" onClick={() => { setViewMode('classic'); setIsPlaying(false); }}>✕ Klasický Přehled</button>
                    <div 
                        className="stories-wrapper stories-container-9-16"
                        onMouseDown={handleMouseDown}
                        onMouseUp={handleMouseUp}
                        onTouchStart={handleMouseDown}
                        onTouchEnd={handleMouseUp}
                    >
                        {/* Morphing Background */}
                        <div className={`stories-bg ${slideBgs[currentSlide]}`} />

                        {/* Progress bars at top (Instagram Stories style) - pouze pro přehrávané slidy */}
                        {currentSlide > 0 && (
                            <div className="stories-indicators">
                                {Array.from({ length: TOTAL_SLIDES }).map((_, idx) => (
                                    <div key={idx} className="indicator-bar">
                                        <div 
                                            className={`indicator-progress ${idx < currentSlide ? 'completed' : ''}`}
                                            style={{ 
                                                width: idx === currentSlide ? `${progress}%` : undefined 
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Invisible Navigation Click Triggers - pouze pro přehrávané slidy */}
                        {currentSlide > 0 && (
                            <div className="story-nav-triggers">
                                <div className="story-trigger-left" onClick={handlePrevSlide} />
                                <div className="story-trigger-right" onClick={handleNextSlide} />
                            </div>
                        )}

                        {/* ---------------- SLIDE CONTAINER ---------------- */}

                        {/* Slide 1: Welcome Intro (Slide 0) */}
                        {currentSlide === 0 && (
                            <div className="story-slide">
                                <div className="intro-crown">👑</div>
                                <h1 className="intro-year">{selectedYear === 'all' ? 'All-Time' : selectedYear}</h1>
                                <h2 className="animate-title">Tvůj Anime Wrapped</h2>
                                <h3 className="animate-title animate-delay-1">Objev svoji sledovací cestu!</h3>
                                <p className="animate-fade-up animate-delay-2" style={{ maxWidth: '300px', marginBottom: '2rem' }}>
                                    Sečteno a podtrženo z tvých reálných dat.
                                </p>
                                <button className="btn-start-wrapped animate-fade-up animate-delay-3" onClick={handleStart}>
                                    Odstartovat 🚀
                                </button>
                            </div>
                        )}



                    {/* Slide 2: Watch Time */}
                    {currentSlide === 1 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Časová investice</h2>
                            <h3 className="animate-title animate-delay-1">Sledováním jsi strávil...</h3>
                            <div className="stats-highlight-val animate-fade-up animate-delay-2">
                                {data.totalTimeFormatted.replace(':', 'h ') + 'm'}
                            </div>
                            <div className="stats-sub-text animate-fade-up animate-delay-2">
                                {data.durationText}
                            </div>
                            <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.5rem', fontSize: '1.1rem' }}>
                                Průměrně jsi sledoval <strong>{data.minsPerDay} minut</strong> denně! ⏱️
                            </p>
                        </div>
                    )}

                    {/* Slide 3: Completed vs Rewatched */}
                    {currentSlide === 2 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Maratony a Návraty</h2>
                            <h3 className="animate-title animate-delay-1">Tvá bilance děl a rewatchů</h3>
                            
                            <div className="wrapped-cards-container animate-fade-up animate-delay-2">
                                <div className="wrapped-anime-card">
                                    <div className="wrapped-card-rank">🎬</div>
                                    <div className="wrapped-card-info">
                                        <div className="wrapped-card-title">Celkem dokončeno</div>
                                        <div className="wrapped-card-meta">{data.completedCount} Anime sérií/filmů</div>
                                    </div>
                                    <div className="stats-sub-text">{data.originalEpCount} ep</div>
                                </div>

                                <div className="wrapped-anime-card">
                                    <div className="wrapped-card-rank">🔄</div>
                                    <div className="wrapped-card-info">
                                        <div className="wrapped-card-title">Nostalgické rewatche</div>
                                        <div className="wrapped-card-meta">Znovu zhlédnuto {data.rewatchedCount} děl</div>
                                    </div>
                                    <div className="stats-sub-text">{data.rewatchEpCount} ep</div>
                                </div>
                            </div>
                            <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>
                                Celkem zhlédnuto {data.totalEpCount} epizod s průměrem {data.avgEpDuration.toString().replace('.', ',')} min na epizodu.
                            </p>
                        </div>
                    )}

                    {/* Slide 4: Peak Month */}
                    {currentSlide === 3 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Vrchol sezóny</h2>
                            <h3 className="animate-title animate-delay-1">Měsíc s největší aktivitou</h3>
                            <div className="intro-crown animate-fade-up animate-delay-1">📅</div>
                            <div className="stats-highlight-val animate-fade-up animate-delay-2">
                                V {data.peakMonthLocative}
                            </div>
                            <div className="stats-sub-text animate-fade-up animate-delay-2">
                                Zhlédnuto {data.peakMonthEpCount} epizod!
                            </div>
                            <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.5rem', maxWidth: '300px' }}>
                                V tomto měsíci ti běžely obrazovky na plné obrátky.
                            </p>
                        </div>
                    )}

                    {/* Slide 5: Favorite Day of Week */}
                    {currentSlide === 4 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Tvoje rituály</h2>
                            <h3 className="animate-title animate-delay-1">Nejaktivnější den v týdnu</h3>
                            <div className="intro-crown animate-fade-up animate-delay-1">⚡</div>
                            <div className="stats-highlight-val animate-fade-up animate-delay-2">
                                {data.activeDayName}
                            </div>
                            <div className="stats-sub-text animate-fade-up animate-delay-2">
                                tvoří {data.activeDayRatio}% tvého sledování
                            </div>
                            <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.5rem', maxWidth: '300px' }}>
                                Ideální den uvařit čaj a pustit další díl!
                            </p>
                        </div>
                    )}

                    {/* Slide 6: Unique Days Watched Grid */}
                    {currentSlide === 5 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Každodenní společník</h2>
                            <h3 className="animate-title animate-delay-1">Dny, kdy jsi zapnul anime</h3>
                            <div className="stats-highlight-val animate-fade-up animate-delay-2" style={{ fontSize: '2.5rem' }}>
                                {data.uniqueDaysCount} dní
                            </div>
                            <div className="stats-sub-text animate-fade-up animate-delay-2">
                                to je {data.uniqueDaysRatio}% celého roku
                            </div>
                            
                            {/* Calendar Grid wrapper */}
                            {data.calendarGrid && data.calendarGrid.length > 0 ? (
                                <div className="calendar-grid-wrapper animate-fade-up animate-delay-3">
                                    {Array.from({ length: 12 }).map((_, mIdx) => {
                                        const monthDays = data.calendarGrid.filter(d => new Date(d.date).getMonth() === mIdx);
                                        return (
                                            <div key={mIdx} className="calendar-month-col">
                                                {monthDays.map((d, dIdx) => (
                                                    <div 
                                                        key={dIdx} 
                                                        className={`calendar-day-dot ${d.active ? 'active' : ''}`}
                                                        title={d.date}
                                                    />
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ fontSize: '3rem', margin: '2rem 0' }}>📅✨</div>
                            )}
                            <p className="animate-fade-up animate-delay-3" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>
                                Mřížka znázorňuje dny sledování od ledna do prosince.
                            </p>
                        </div>
                    )}

                    {/* Slide 7: Score Distribution & Average */}
                    {currentSlide === 6 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Udělené známky</h2>
                            <h3 className="animate-title animate-delay-1">Tvoje průměrné hodnocení: <strong>★ {data.avgScore.toString().replace('.', ',')}</strong></h3>
                            
                            <div className="custom-bar-chart animate-fade-up animate-delay-2">
                                {Object.entries(data.scoreDistribution).reverse().map(([score, count]) => {
                                    const pct = (count / maxScoreDistCount) * 100;
                                    return (
                                        <div key={score} className="chart-bar-row">
                                            <span className="chart-bar-label" style={{ minWidth: '150px' }}>{score} - {MAL_SCORE_LABELS[score]}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #c084fc, #fb7185)' }} />
                                            </div>
                                            <span className="chart-bar-value">{count}x</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Slide 8: Hot Takes / Over-rated / Under-rated */}
                    {currentSlide === 7 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Kontroverzní názory</h2>
                            <h3 className="animate-title animate-delay-1">Kde se lišíš od globálního průměru</h3>
                            
                            {data.hotTakes && data.hotTakes.length > 0 ? (
                                <div className="wrapped-cards-container animate-fade-up animate-delay-2">
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', textAlign: 'left', marginBottom: '0.2rem' }}>Tvoje největší odchylka (Hot Take):</div>
                                    {data.hotTakes.slice(0, 2).map((take, idx) => (
                                        <div key={idx} className="wrapped-anime-card">
                                            <JikanPoster malUrl={take.malUrl} />
                                            <div className="wrapped-card-info">
                                                <div className="wrapped-card-title">{take.name}</div>
                                                <div className="wrapped-card-meta">
                                                    Tvůj verdikt: <strong>{take.userScore}</strong> vs. MAL průměr: <strong>{take.communityScore}</strong>
                                                </div>
                                            </div>
                                            <span className={`badge-deviation ${take.diff >= 0 ? 'positive' : ''}`}>
                                                {take.diff >= 0 ? `+${take.diff.toString().replace('.', ',')}` : take.diff.toString().replace('.', ',')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ margin: '3rem 0', fontSize: '1.1rem' }}>
                                    Shoduješ se s davem! Žádné velké výstřelky v hodnocení. 🤝
                                </div>
                            )}
                        </div>
                    )}

                    {/* Slide 9: Genre Bias (Top Affinity) */}
                    {currentSlide === 8 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Žánrová slabost</h2>
                            <h3 className="animate-title animate-delay-1">Které žánry jsi sledoval více než obvykle</h3>
                            
                            <div className="custom-bar-chart animate-fade-up animate-delay-2">
                                {data.topGenres.map((g, idx) => {
                                    const pct = (g.count / maxGenreCount) * 100;
                                    return (
                                        <div key={idx} className="chart-bar-row">
                                            <span className="chart-bar-label">{g.genre}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f472b6, #fb7185)' }} />
                                            </div>
                                            <span className="chart-bar-value">+{g.ratio}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Slide 10: Genre Deviant (Bottom) */}
                    {currentSlide === 9 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Ustranění z cesty</h2>
                            <h3 className="animate-title animate-delay-1">Žánry, kterým ses spíše vyhýbal</h3>
                            
                            <div className="custom-bar-chart animate-fade-up animate-delay-2">
                                {data.bottomGenres.map((g, idx) => {
                                    const pct = (g.count / maxDeviantCount) * 100;
                                    return (
                                        <div key={idx} className="chart-bar-row">
                                            <span className="chart-bar-label">{g.genre}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6b7280, #9ca3af)' }} />
                                            </div>
                                            <span className="chart-bar-value">{g.deviation < 0 ? '' : '+'}{(g.deviation * 100).toFixed(0)}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Slide 11: Franchise Spotlight */}
                    {currentSlide === 10 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Absolutní favorit</h2>
                            <h3 className="animate-title animate-delay-1">Franšíza, která dostala nejvíce času</h3>
                            {data.topFranchise ? (
                                <>
                                    <div className="animate-fade-up animate-delay-1" style={{ margin: '1rem 0' }}>
                                        <JikanPoster malUrl={data.topFranchise.malUrl} size="large" />
                                    </div>
                                    <div className="stats-highlight-val animate-fade-up animate-delay-2" style={{ fontSize: '2.2rem', margin: '0.5rem 0' }}>
                                        {data.topFranchise.name}
                                    </div>
                                    <div className="stats-sub-text animate-fade-up animate-delay-2">
                                        Stráveno {data.topFranchise.hours} hodin ({data.topFranchise.episodes} epizod)
                                    </div>
                                    <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.25rem' }}>
                                        Tenhle svět tě pohltil na celých <strong>{data.topFranchise.days} dne</strong>! 🌌
                                    </p>
                                </>
                            ) : (
                                <div style={{ fontSize: '3rem', margin: '2rem 0' }}>📺✨</div>
                            )}
                        </div>
                    )}

                    {/* Slide 12: Top 5 Franchises */}
                    {currentSlide === 11 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Nejdelší výpravy</h2>
                            <h3 className="animate-title animate-delay-1">Top 5 franšíz podle času</h3>
                            
                            <div className="wrapped-cards-container animate-fade-up animate-delay-2">
                                {data.topFranchisesList.map((fran, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <div className="wrapped-card-rank">#{idx + 1}</div>
                                        <JikanPoster malUrl={fran.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{fran.name}</div>
                                            <div className="wrapped-card-meta">{fran.episodes} epizod</div>
                                        </div>
                                        <div className="stats-sub-text" style={{ fontSize: '1rem' }}>{fran.hours} h</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Slide 13: Binge Spotlight */}
                    {currentSlide === 12 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Rychlostní maraton</h2>
                            <h3 className="animate-title animate-delay-1">Nejrychleji zhlédnutá série</h3>
                            {data.quickestBinge ? (
                                <>
                                    <div className="animate-fade-up animate-delay-1" style={{ margin: '1rem 0' }}>
                                        <JikanPoster malUrl={data.quickestBinge.malUrl} size="large" />
                                    </div>
                                    <div className="stats-highlight-val animate-fade-up animate-delay-2" style={{ fontSize: '2.2rem', margin: '0.5rem 0' }}>
                                        {data.quickestBinge.name}
                                    </div>
                                    <div className="stats-sub-text animate-fade-up animate-delay-2">
                                        Sfouknuto za {data.quickestBinge.days} {data.quickestBinge.days === 1 ? 'den' : (data.quickestBinge.days < 5 ? 'dny' : 'dní')}!
                                    </div>
                                    <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.25rem' }}>
                                        Průměrně jsi sledoval <strong>{data.quickestBinge.hoursPerDay} hodin denně</strong>! 🔥
                                    </p>
                                </>
                            ) : (
                                <div style={{ fontSize: '3rem', margin: '2rem 0' }}>🚀💨</div>
                            )}
                        </div>
                    )}

                    {/* Slide 14: Top 5 Binges */}
                    {currentSlide === 13 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Nemohl ses odtrhnout</h2>
                            <h3 className="animate-title animate-delay-1">Top 5 nejrychleji zhlédnutých</h3>
                            
                            <div className="wrapped-cards-container animate-fade-up animate-delay-2">
                                {data.topBingesList.map((binge, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <div className="wrapped-card-rank">#{idx + 1}</div>
                                        <JikanPoster malUrl={binge.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{binge.name}</div>
                                            <div className="wrapped-card-meta">
                                                Za {binge.days} {binge.days === 1 ? 'den' : (binge.days < 5 ? 'dny' : 'dní')} ({binge.episodes} ep)
                                            </div>
                                        </div>
                                        <div className="stats-sub-text" style={{ fontSize: '0.85rem', color: '#f43f5e', whiteSpace: 'nowrap' }}>
                                            {binge.hoursPerDay} h/den
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Slide 15: Recency Bias & Seasonal Warrior */}
                    {currentSlide === 14 && (
                        <div className="story-slide">
                            <h2 className="animate-title">Sezónní Válečník</h2>
                            <h3 className="animate-title animate-delay-1">Sledování novinek v reálném čase</h3>
                            
                            <div className="wrapped-cards-container animate-fade-up animate-delay-2">
                                <div className="wrapped-anime-card">
                                    <div className="wrapped-card-rank">🆕</div>
                                    <div className="wrapped-card-info">
                                        <div className="wrapped-card-title">Recency Bias</div>
                                        <div className="wrapped-card-meta">Podíl novinek vydaných v roce {selectedYear}</div>
                                    </div>
                                    <div className="stats-sub-text">{data.recencyBiasRatio}%</div>
                                </div>

                                <div className="wrapped-anime-card">
                                    <div className="wrapped-card-rank">🛡️</div>
                                    <div className="wrapped-card-info">
                                        <div className="wrapped-card-title">Seasonal Warrior</div>
                                        <div className="wrapped-card-meta">Z novinek sledováno hned při vydání</div>
                                    </div>
                                    <div className="stats-sub-text">{data.seasonalWarriorRatio}%</div>
                                </div>
                            </div>
                            <p className="animate-fade-up animate-delay-3" style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
                                Skutečný Seasonal Warrior sleduje epizody do 4 týdnů od premiéry a dokončí je do 2 týdnů od finále! ⚔️
                            </p>
                        </div>
                    )}

                    {/* Slides 16-19: Seasonal breakdowns */}
                    {currentSlide >= 15 && currentSlide <= 18 && (() => {
                        const seasonKeys = ['Winter', 'Spring', 'Summer', 'Fall'];
                        const sKey = seasonKeys[currentSlide - 15];
                        const season = data.seasons[sKey];
                        
                        return (
                            <div className="story-slide">
                                <h2 className="animate-title">{season.name} {selectedYear}</h2>
                                <h3 className="animate-title animate-delay-1">
                                    Zhlédnuto {season.total} děl s průměrem ★ {season.avgScore.toString().replace('.', ',')}
                                </h3>
                                
                                <div style={{ alignSelf: 'flex-start', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.5rem' }}>Oblíbené tituly období:</div>
                                {season.topAnime && season.topAnime.length > 0 ? (
                                    <div className="horizontal-scroll-posters animate-fade-up animate-delay-2">
                                        {season.topAnime.map((item, idx) => (
                                            <div key={idx} className="scroll-poster-item">
                                                <JikanPoster malUrl={item.mal_url} />
                                                <div className="scroll-poster-title">{item.name}</div>
                                                <div className="scroll-poster-rating">★ {item.rating}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ margin: '3rem 0' }}>Žádná dokončená anime v této sezóně. 🌸</div>
                                )}
                                
                                {season.isFavorite && (
                                    <div className="badge-deviation positive animate-fade-up animate-delay-3" style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '20px', fontSize: '0.85rem' }}>
                                        🌟 Tvá nejoblíbenější sezóna roku!
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Slide 20: Recap Share Card */}
                    {currentSlide === 19 && (
                        <div className="story-slide" style={{ padding: '2rem 1.5rem' }}>
                            <h2 className="animate-title" style={{ marginBottom: '1rem' }}>Tvůj {selectedYear} v kostce</h2>
                            
                            <div id="recap-share-card" className="recap-card animate-fade-up animate-delay-1">
                                <div className="recap-header">
                                    <div className="recap-logo">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                        </svg>
                                        <span>Anime List</span>
                                    </div>
                                    <span className="recap-year">WRAPPED {selectedYear}</span>
                                </div>

                                <div className="recap-grid">
                                    <div className="recap-stat-box">
                                        <span className="recap-stat-label">Čas sledování</span>
                                        <span className="recap-stat-value">{data.totalTimeFormatted.replace(':', 'h ') + 'm'}</span>
                                    </div>
                                    <div className="recap-stat-box">
                                        <span className="recap-stat-label">Dokončená Anime</span>
                                        <span className="recap-stat-value">{data.completedCount} děl ({data.totalEpCount} ep)</span>
                                    </div>
                                    <div className="recap-stat-box">
                                        <span className="recap-stat-label">Průměrné skóre</span>
                                        <span className="recap-stat-value">★ {data.avgScore.toString().replace('.', ',')}</span>
                                    </div>
                                    <div className="recap-stat-box">
                                        <span className="recap-stat-label">Nejdelší série</span>
                                        <span className="recap-stat-value" style={{ fontSize: '0.85rem', fontWeight: 700, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {data.topFranchise ? data.topFranchise.name : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'left', marginTop: '0.2rem' }}>
                                    <span className="recap-stat-label">Tvoje Top 10 Anime:</span>
                                    <div className="recap-posters-row">
                                        {data.topAnime.slice(0, 10).map((item, idx) => (
                                            <div key={idx} className="recap-poster-wrapper" title={`${item.name} (★ ${item.rating})`}>
                                                <JikanPoster malUrl={item.mal_url} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}>
                                <button className="btn-start-wrapped" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }} onClick={() => {
                                    const text = `📊 Můj Anime List Wrapped ${selectedYear}:\n` +
                                        `⏱️ Čas sledování: ${data.totalTimeFormatted.replace(':', 'h ') + 'm'} (${data.durationText})\n` +
                                        `🏆 Dokončená anime: ${data.completedCount} děl (${data.totalEpCount} ep)\n` +
                                        `⭐ Průměrné hodnocení: ★ ${data.avgScore.toString().replace('.', ',')}\n` +
                                        `👑 Moje Top 3 Anime: ${data.topAnime.slice(0, 3).map(a => a.name).join(', ')}`;
                                    navigator.clipboard.writeText(text);
                                    alert('Statistiky byly zkopírovány do schránky!');
                                }}>
                                    📋 Kopírovat text
                                </button>
                                <button className="btn-start-wrapped animate-delay-2" style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }} onClick={() => setCurrentSlide(0)}>
                                    Přehrát znovu 🔄
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* ==================================================== */}
            {/* CLASSIC DASHBOARD VIEW */}
            {/* ==================================================== */}
            {viewMode === 'classic' && (
                <div className="classic-view-container animate-fade-up">
                    {/* General stats grid */}
                    <div className="classic-grid-dashboard">
                        <div className="classic-card">
                            <h3>⏱️ Čas sledování</h3>
                            <div className="stats-highlight-val" style={{ fontSize: '2.5rem', margin: '0.5rem 0' }}>
                                {data.totalTimeFormatted.replace(':', 'h ') + 'm'}
                            </div>
                            <p>{data.durationText}</p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Průměrně {data.minsPerDay} minut denně.
                            </p>
                        </div>

                        <div className="classic-card">
                            <h3>🏆 Dokončená díla</h3>
                            <div className="stats-highlight-val" style={{ fontSize: '2.5rem', margin: '0.5rem 0' }}>
                                {data.completedCount} Anime
                            </div>
                            <p>Zhlédnuto celkem {data.totalEpCount} epizod.</p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Z toho {data.rewatchedCount} rewatchů ({data.rewatchEpCount} ep).
                            </p>
                        </div>

                        <div className="classic-card">
                            <h3>⭐ Průměrné hodnocení</h3>
                            <div className="stats-highlight-val" style={{ fontSize: '2.5rem', margin: '0.5rem 0' }}>
                                ★ {data.avgScore.toString().replace('.', ',')}
                            </div>
                            <p>Hodnoceno celkem {data.completedCount} děl.</p>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Oblíbené období: {data.favoriteSeason}.
                            </p>
                        </div>
                    </div>

                    <div className="classic-grid-2col">
                        {/* Score distribution */}
                        <div className="classic-card">
                            <h3>📊 Distribuce hodnocení</h3>
                            <div className="custom-bar-chart" style={{ marginTop: '0.5rem' }}>
                                {Object.entries(data.scoreDistribution).reverse().map(([score, count]) => {
                                    const maxCount = Math.max(...Object.values(data.scoreDistribution), 1);
                                    const pct = (count / maxCount) * 100;
                                    return (
                                        <div key={score} className="chart-bar-row">
                                            <span className="chart-bar-label" style={{ minWidth: '150px' }}>{score} - {MAL_SCORE_LABELS[score]}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'var(--gradient-primary)' }} />
                                            </div>
                                            <span className="chart-bar-value">{count}x</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Calendar activity info */}
                        <div className="classic-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
                                {/* Left side: Activity Text */}
                                <div style={{ flex: '1 1 250px' }}>
                                    <h3 style={{ marginBottom: '1rem' }}>📅 Aktivita sledování</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <p>Celkem aktivních dní: <strong>{data.uniqueDaysCount} z {selectedYear === 'all' ? '365' : (parseInt(selectedYear) % 4 === 0 ? 366 : 365)} ({data.uniqueDaysRatio}%)</strong></p>
                                        <p>Nejaktivnější den: <strong>{data.activeDayName}</strong> ({data.activeDayRatio}% epizod)</p>
                                        <p>Nejaktivnější měsíc: <strong>{data.peakMonthName}</strong> ({data.peakMonthEpCount} epizod)</p>
                                    </div>
                                </div>

                                {/* Right side: Seasonal Warrior & Recency Bias */}
                                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '1.5rem', justifyContent: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <h3 style={{ fontSize: '1rem', margin: 0 }}>🎯 Recency Bias</h3>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Procento anime vydaných v tomto roce.</p>
                                        <div className="chart-bar-wrapper" style={{ height: '14px', background: 'var(--bg-primary)', borderRadius: '10px', marginTop: '0.2rem' }}>
                                            <div className="chart-bar-fill" style={{ width: `${data.recencyBiasRatio}%`, height: '100%', borderRadius: '10px', background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
                                        </div>
                                        <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.9rem', color: '#10b981', marginTop: '-0.2rem' }}>{data.recencyBiasRatio}%</div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <h3 style={{ fontSize: '1rem', margin: 0 }}>⚔️ Seasonal Warrior</h3>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Procento anime sledovaných průběžně jak vycházela.</p>
                                        <div className="chart-bar-wrapper" style={{ height: '14px', background: 'var(--bg-primary)', borderRadius: '10px', marginTop: '0.2rem' }}>
                                            <div className="chart-bar-fill" style={{ width: `${data.seasonalWarriorRatio}%`, height: '100%', borderRadius: '10px', background: 'linear-gradient(90deg, #818cf8, #c084fc)' }} />
                                        </div>
                                        <div style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '0.9rem', color: '#a78bfa', marginTop: '-0.2rem' }}>{data.seasonalWarriorRatio}%</div>
                                    </div>
                                </div>
                            </div>

                            {data.heatmapColumns && data.heatmapColumns.length > 0 && (
                                <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column' }}>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Kalendář aktivity</h4>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', overflowX: 'auto', paddingBottom: '6px', width: '100%' }}>
                                        {/* Months Header */}
                                        <div style={{ display: 'flex', paddingLeft: '24px', marginBottom: '4px', gap: '3px', height: '16px' }}>
                                            {data.heatmapColumns.map((col, cIdx) => {
                                                const currentMonth = col[0].date.getMonth();
                                                const prevMonth = cIdx > 0 ? data.heatmapColumns[cIdx - 1][0].date.getMonth() : -1;
                                                const showMonth = cIdx > 0 && currentMonth !== prevMonth;

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
                                                {data.heatmapColumns.map((col, cIdx) => (
                                                    <div key={cIdx} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                                                        {col.map((cell, rIdx) => (
                                                            <div
                                                                key={rIdx}
                                                                title={`${new Date(cell.dateStr).toLocaleDateString('cs-CZ')}: ${cell.eps} epizod`}
                                                                style={{
                                                                    width: '10px',
                                                                    height: '10px',
                                                                    backgroundColor: getHeatmapColor(cell.eps),
                                                                    borderRadius: '2px',
                                                                    transition: 'opacity 0.2s, transform 0.1s',
                                                                    opacity: cell.isOtherYear ? 0 : 1,
                                                                    pointerEvents: cell.isOtherYear ? 'none' : 'auto'
                                                                }}
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

                                    {/* Heatmap Legend */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
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
                            )}
                        </div>
                    </div>

                    {/* Top Franchises & Quickest Binges */}
                    <div className="classic-grid-3col">
                        <div className="classic-card">
                            <h3>🏢 Top 5 franšíz (podle času)</h3>
                            <div className="wrapped-cards-container" style={{ marginTop: '0.5rem' }}>
                                {data.topFranchisesList.map((fran, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <div className="wrapped-card-rank">#{idx + 1}</div>
                                        <JikanPoster malUrl={fran.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{fran.name}</div>
                                            <div className="wrapped-card-meta">{fran.episodes} epizod</div>
                                        </div>
                                        <div className="stats-sub-text" style={{ fontSize: '1rem' }}>{fran.hours} h</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="classic-card">
                            <h3>⭐ Top 5 franšíz (podle hodnocení)</h3>
                            <div className="wrapped-cards-container" style={{ marginTop: '0.5rem' }}>
                                {data.topFranchisesScoreList && data.topFranchisesScoreList.map((fran, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <div className="wrapped-card-rank">#{idx + 1}</div>
                                        <JikanPoster malUrl={fran.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{fran.name}</div>
                                            <div className="wrapped-card-meta">{fran.scoreCount} ohodnocených</div>
                                        </div>
                                        <div className="stats-sub-text" style={{ fontSize: '1rem', color: '#fbbf24' }}>★ {fran.avgScore.toString().replace('.', ',')}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="classic-card">
                            <h3>🔥 Top 5 rychlostních binge maratonů</h3>
                            <div className="wrapped-cards-container" style={{ marginTop: '0.5rem' }}>
                                {data.topBingesList.map((binge, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <div className="wrapped-card-rank">#{idx + 1}</div>
                                        <JikanPoster malUrl={binge.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{binge.name}</div>
                                            <div className="wrapped-card-meta">
                                                Za {binge.days} {binge.days === 1 ? 'den' : (binge.days < 5 ? 'dny' : 'dní')} ({binge.episodes} ep)
                                            </div>
                                        </div>
                                        <div className="stats-sub-text" style={{ fontSize: '0.85rem', color: '#f43f5e', whiteSpace: 'nowrap' }}>
                                            {binge.hoursPerDay} h/den
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Genre Bias & Deviants */}
                    <div className="classic-grid-2col">
                        <div className="classic-card">
                            <h3>🎬 Žánrové preference (Top Affinity)</h3>
                            <div className="custom-bar-chart" style={{ marginTop: '0.5rem' }}>
                                {data.topGenres.map((g, idx) => {
                                    const pct = (g.count / maxGenreCount) * 100;
                                    return (
                                        <div key={idx} className="chart-bar-row">
                                            <span className="chart-bar-label" style={{ minWidth: '120px' }}>{g.genre}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f472b6, #fb7185)' }} />
                                            </div>
                                            <span className="chart-bar-value">+{g.ratio}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="classic-card">
                            <h3>🎬 Nejméně sledované žánry (Deviants)</h3>
                            <div className="custom-bar-chart" style={{ marginTop: '0.5rem' }}>
                                {data.bottomGenres.map((g, idx) => {
                                    const pct = (g.count / maxDeviantCount) * 100;
                                    return (
                                        <div key={idx} className="chart-bar-row">
                                            <span className="chart-bar-label" style={{ minWidth: '120px' }}>{g.genre}</span>
                                            <div className="chart-bar-wrapper">
                                                <div className="chart-bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6b7280, #9ca3af)' }} />
                                            </div>
                                            <span className="chart-bar-value">{g.deviation < 0 ? '' : '+'}{(g.deviation * 100).toFixed(0)}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Seasonal Breakdowns with horizontally scrolling posters */}
                    <div className="classic-card">
                        <h3>🌸 Sledování podle ročních období</h3>
                        <div className="classic-grid-2col" style={{ gap: '1.5rem', marginTop: '1rem' }}>
                            {Object.entries(data.seasons).map(([key, season]) => (
                                <div key={key} style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <strong style={{ fontSize: '1.1rem', color: 'var(--accent-primary)' }}>
                                            {key === 'Winter' ? '❄️ Zima' : (key === 'Spring' ? '🌸 Jaro' : (key === 'Summer' ? '☀️ Léto' : '🍁 Podzim'))}
                                        </strong>
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                            {season.total} děl (průměr: ★ {season.avgScore.toString().replace('.', ',')})
                                        </span>
                                    </div>
                                    
                                    {season.items && season.items.length > 0 ? (
                                        <div className="horizontal-scroll-posters" style={{ paddingBottom: '0.5rem' }}>
                                            {season.topAnime.map((item, idx) => (
                                                <div key={idx} className="scroll-poster-item">
                                                    <JikanPoster malUrl={item.mal_url} />
                                                    <div className="scroll-poster-title" style={{ fontSize: '0.7rem' }}>{item.name}</div>
                                                    <div className="scroll-poster-rating" style={{ fontSize: '0.65rem' }}>★ {item.rating}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                                            Žádná dokončená anime.
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Hot Takes / Over-Hyped */}
                    <div className="classic-card">
                        <h3>🤝 Názorové odchylky vůči MyAnimeList</h3>
                        {data.hotTakes && data.hotTakes.length > 0 ? (
                            <div className="wrapped-cards-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
                                {data.hotTakes.map((take, idx) => (
                                    <div key={idx} className="wrapped-anime-card">
                                        <JikanPoster malUrl={take.malUrl} />
                                        <div className="wrapped-card-info">
                                            <div className="wrapped-card-title">{take.name}</div>
                                            <div className="wrapped-card-meta">
                                                Tvůj: <strong>{take.userScore}</strong> vs. MAL: <strong>{take.communityScore.toString().replace('.', ',')}</strong>
                                            </div>
                                        </div>
                                        <span className={`badge-deviation ${take.diff >= 0 ? 'positive' : ''}`} style={{ alignSelf: 'center' }}>
                                            {take.diff >= 0 ? `+${take.diff.toString().replace('.', ',')}` : take.diff.toString().replace('.', ',')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p>Shoduješ se s celosvětovou komunitou!</p>
                        )}
                    </div>

                    {/* Top 10 High Rated list */}
                    <div className="classic-card">
                        <h3>🏆 Nejlépe ohodnocená anime roku {selectedYear === 'all' ? '' : selectedYear}</h3>
                        <div className="poster-grid-large" style={{ marginTop: '0.5rem' }}>
                            {data.topAnime.map((item, idx) => (
                                <div key={idx} className="poster-card-item">
                                    <JikanPoster malUrl={item.mal_url} size="large" />
                                    <div className="poster-card-title" title={item.name}>{item.name}</div>
                                    <div className="poster-card-score">★ {item.rating}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
