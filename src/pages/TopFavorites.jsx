import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './TopFavorites.css';

const TopFavorites = () => {
    const [data, setData] = useState({ top10_anime: [], hm_anime: [], top10_chars: [] });
    const [animeMap, setAnimeMap] = useState({});
    const [rawAnimeList, setRawAnimeList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [favoritesRes, animeListRes] = await Promise.all([
                    fetch(`data/top_favorites.json?v=${Date.now()}`),
                    fetch(`data/anime_list.json?v=${Date.now()}`)
                ]);

                if (!favoritesRes.ok || !animeListRes.ok) throw new Error('Failed to fetch data');

                const favData = await favoritesRes.json();
                const animeListData = await animeListRes.json();

                // Map anime list data by name for easy lookup of poster image
                const map = {};
                animeListData.forEach(anime => {
                    map[anime.name.toLowerCase()] = anime;
                });

                setData(favData);
                setAnimeMap(map);
                setRawAnimeList(animeListData);
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
                                finalImage = finalImage || `${mappedAnime.thumbnail}`;
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
                                fhDisplay = Number.isInteger(avg) ? avg.toString() : avg.toFixed(1);
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
                                    <img src={`${finalImage}?v=${Date.now()}`} alt={name} className="favorite-image" loading="lazy" />
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
                                                <span className="hover-char-anime" style={{ fontWeight: '600', color: 'var(--accent-primary)', fontSize: '1rem' }}>
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

    return (
        <div className="top-favorites-page fade-in">
            <div className="favorites-content">
                {renderSection('TOP 10 Anime', data.top10_anime, true)}
                {renderSection('Honourable Mentions', data.hm_anime, true, true)}
                {renderSection('TOP 10 Characters', data.top10_chars, false)}
            </div>
        </div>
    );
};

export default TopFavorites;
