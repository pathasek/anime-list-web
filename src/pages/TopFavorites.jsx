import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './TopFavorites.css';

// Cesta k předgenerované zmenšenině posteru (tools/build_top_favorites_thumbs.py).
// Poster se kreslí do pole 222 x 334 px, ale většina souborů má 1000 px šířky
// a prohlížeč je zmenšuje metodou, která rozbíjí tenkou linku anime kresby
// (kostičkovaný dojem u Witch Hat Atelier, Madoka Magica, DanMachi). Zmenšeniny
// jsou hotové filtrem LANCZOS, takže prohlížeč nezmenšuje nic.
// Postery, které už jsou malé (Spice and Wolf má 425 px), zmenšeninu nemají
// a komponenta se u nich sama vrátí k originálu. Postav se to netýká.
const posterThumbPath = (src) => {
    const PREFIX = 'images/top_favorites/';
    if (!src || !src.startsWith(PREFIX)) return null;
    const file = src.slice(PREFIX.length);
    if (file.includes('/')) return null;
    return `${PREFIX}thumbs/${file.replace(/\.(jpe?g|png|webp)$/i, '')}.jpg`;
};

// Sekce stránky pro horní přepínač (pořadí = pořadí tlačítek)
const TF_SECTIONS = [
    { id: 'top10', label: 'TOP 10' },
    { id: 'hm', label: 'HM' },
    { id: 'chars', label: 'Postavy' },
];

const TopFavorites = () => {
    const [data, setData] = useState({ top10_anime: [], hm_anime: [], top10_chars: [] });
    const [animeMap, setAnimeMap] = useState({});
    const [rawAnimeList, setRawAnimeList] = useState([]);
    const [imageHash, setImageHash] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Zvolená sekce přežívá odchod na detail v sessionStorage, takže „Zpět"
    // vrátí stránku přesně jak byla (stejný vzor jako skupiny na Dashboardu).
    const [section, setSection] = useState(() => {
        try {
            const saved = sessionStorage.getItem('tf-section');
            if (TF_SECTIONS.some(s => s.id === saved)) return saved;
        } catch { /* poškozený záznam — použije se default */ }
        return 'top10';
    });
    const switchSection = (id) => {
        setSection(id);
        try { sessionStorage.setItem('tf-section', id); } catch { /* quota */ }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [favoritesRes, animeListRes, hashRes] = await Promise.all([
                    fetch(`data/top_favorites.json?v=${Date.now()}`),
                    fetch(`data/anime_list.json?v=${Date.now()}`),
                    fetch('data/top_favorites_hash.txt').then(r => r.ok ? r.text() : '').catch(() => '')
                ]);

                if (!favoritesRes.ok || !animeListRes.ok) throw new Error('Failed to fetch data');

                const favData = await favoritesRes.json();
                const animeListData = await animeListRes.json();
                const imgHash = hashRes.trim();

                // Map anime list data by name for easy lookup of poster image
                const map = {};
                animeListData.forEach(anime => {
                    map[anime.name.toLowerCase()] = anime;
                });

                setData(favData);
                setAnimeMap(map);
                setRawAnimeList(animeListData);
                setImageHash(imgHash);
                setLoading(false);
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) return <div className="loading">Loading Top Favorites...</div>;
    if (error) return <div className="error">Error: {error}</div>;

    const renderSection = (title, items, isAnimeLists, isHM = false) => {
        if (!items || items.length === 0) return null;

        return (
            <div className={`favorites-section ${isHM ? 'hm-section' : ''}`}>
                <div className="section-header">
                    <div className="section-title">
                        <span className="star-icon">★</span>
                        <h2>{title}</h2>
                        <span className="star-icon">★</span>
                    </div>
                    <div className="header-line"></div>
                </div>

                <div className="favorites-grid">
                    {items.map((item, index) => {
                        const name = item.data.NAME || item.data.ANIME_NAME;
                        let finalImage = item.image_file ? `${item.image_file}` : null;

                        let mappedAnime = null;
                        let seriesItems = [];

                        if (isAnimeLists) {
                            mappedAnime = animeMap[name.toLowerCase()];

                            if (!mappedAnime) {
                                seriesItems = rawAnimeList.filter(a => (a.series && a.series.toLowerCase() === name.toLowerCase()));
                                if (seriesItems.length > 0) {
                                    mappedAnime = seriesItems[0];
                                }
                            } else {
                                if (mappedAnime.series) {
                                    seriesItems = rawAnimeList.filter(a => a.series === mappedAnime.series);
                                } else {
                                    seriesItems = [mappedAnime];
                                }
                            }

                            if (mappedAnime && mappedAnime.thumbnail) {
                                finalImage = finalImage || `${mappedAnime.thumbnail.replace(/#/g, '%23')}`;
                            }
                        }

                        let fhDisplay = null;
                        let ratedItemsCount = 0;
                        if (isAnimeLists && seriesItems.length > 0) {
                            const ratedItems = seriesItems.filter(a => a.rating && a.rating !== 'X');
                            ratedItemsCount = ratedItems.length;
                            if (ratedItems.length > 0) {
                                const sum = ratedItems.reduce((acc, curr) => acc + parseFloat(curr.rating), 0);
                                const avg = sum / ratedItems.length;
                                fhDisplay = Number.isInteger(avg) ? avg.toString() : parseFloat(avg.toFixed(2));
                            }
                        } else if (isAnimeLists && mappedAnime && mappedAnime.rating) {
                            fhDisplay = mappedAnime.rating !== 'X' ? mappedAnime.rating : null;
                            ratedItemsCount = fhDisplay ? 1 : 0;
                        }

                        let detailLink = null;
                        if (isAnimeLists) {
                            if (mappedAnime) {
                                const queryTerm = mappedAnime.series || mappedAnime.name;
                                detailLink = `/anime?series=${encodeURIComponent(queryTerm)}`;
                            }
                        }

                        return (
                            <div className={`favorite-card hover-glow ${!isAnimeLists ? 'char-card' : 'anime-card'}`} key={item.shape_name}>
                                <div className="rank-badge">
                                    {isHM ? 'HM' : `#${index + 1}`}
                                </div>
                                {finalImage ? (
                                    (() => {
                                        // Zmenšenina jen u posterů anime, postavy zůstávají beze změny
                                        const zdroj = (isAnimeLists && posterThumbPath(finalImage)) || finalImage;
                                        const verze = (s) => (imageHash ? `${s}?v=${imageHash}` : s);
                                        return (
                                            <img
                                                src={verze(zdroj)}
                                                alt={name}
                                                className="favorite-image"
                                                loading="lazy"
                                                onError={(e) => {
                                                    // Zmenšenina ještě není vygenerovaná → originál
                                                    if (e.currentTarget.dataset.fallback) return;
                                                    e.currentTarget.dataset.fallback = '1';
                                                    e.currentTarget.src = verze(finalImage);
                                                }}
                                            />
                                        );
                                    })()
                                ) : (
                                    <div className="favorite-image-placeholder">No Image</div>
                                )}

                                <div className="favorite-hover-overlay">
                                    {isAnimeLists ? (
                                        <>
                                            <div className="hover-actions-top">
                                                {mappedAnime && mappedAnime.mal_url && (
                                                    <a href={mappedAnime.mal_url} target="_blank" rel="noopener noreferrer" className="hover-btn mal-btn" title="View on MyAnimeList">
                                                        MAL
                                                    </a>
                                                )}
                                                {detailLink && (
                                                    <Link to={detailLink} className="hover-btn detail-btn" title="View List">
                                                        List
                                                    </Link>
                                                )}
                                            </div>
                                            <div className="hover-actions-bottom">
                                                {fhDisplay ? (
                                                    <span className="hover-fh">FH {fhDisplay.toString().replace('.', ',')}/10 {ratedItemsCount > 1 ? '(AVG)' : ''}</span>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="hover-char-top" style={{ marginBottom: 'var(--spacing-md)' }}>
                                                <span className="hover-char-anime" style={{ fontWeight: '600', color: 'white', fontSize: '1rem' }}>
                                                    {item.data.ANIME_NAME || 'Unknown Anime'}
                                                </span>
                                            </div>
                                            <a href={`https://myanimelist.net/character/${item.data.CHAR_ID}`} target="_blank" rel="noopener noreferrer" className="hover-char-link hover-btn">
                                                MyAnimeList
                                            </a>
                                        </>
                                    )}
                                </div>

                                <div className="favorite-info">
                                    <h3 className="favorite-name">{name}</h3>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const hasData = (data.top10_anime && data.top10_anime.length > 0) ||
                    (data.hm_anime && data.hm_anime.length > 0) ||
                    (data.top10_chars && data.top10_chars.length > 0);

    return (
        <div className="top-favorites-page fade-in">
            <div className="favorites-content">
                {hasData ? (
                    <>
                        <div className="tf-switcher" role="tablist" aria-label="Sekce Top Favorites">
                            {TF_SECTIONS.map(s => (
                                <button
                                    key={s.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={section === s.id}
                                    className={`tf-switch-btn ${section === s.id ? 'active' : ''}`}
                                    onClick={() => switchSection(s.id)}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        {section === 'top10' && renderSection('TOP 10 Anime', data.top10_anime, true)}
                        {section === 'hm' && renderSection('Honourable Mentions', data.hm_anime, true, true)}
                        {section === 'chars' && renderSection('TOP 10 Characters', data.top10_chars, false)}
                    </>
                ) : (
                    <div className="no-favorites" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🏆</span>
                        <h2>Žádné oblíbené položky nebyla načteny</h2>
                        <p>Zkontrolujte prosím soubor <code>data/top_favorites.json</code> v projektu.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TopFavorites;
