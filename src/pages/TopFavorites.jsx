import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './TopFavorites.css';

const TopFavorites = () => {
    const [data, setData] = useState({ top10_anime: [], hm_anime: [], top10_chars: [] });
    const [animeMap, setAnimeMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [favoritesRes, animeListRes] = await Promise.all([
                    fetch('data/top_favorites.json'),
                    fetch('data/anime_list.json')
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

                        // If it's an anime, try to grab its poster from the main anime_list map instead, 
                        // as Top10 Anime don't have direct embedded image extractions right now (they are grouped shape backgrounds)
                        // Or if they do, we will use it natively.
                        let mappedAnime = null;
                        if (isAnimeLists) {
                            mappedAnime = animeMap[name.toLowerCase()];
                            if (mappedAnime && mappedAnime.thumbnail) {
                                finalImage = finalImage || `${mappedAnime.thumbnail}`;
                            }
                        }

                        return (
                            <div className="favorite-card hover-glow" key={item.shape_name}>
                                <div className="rank-badge">
                                    {isHM ? 'HM' : `#${index + 1}`}
                                </div>
                                {finalImage ? (
                                    <img src={finalImage} alt={name} className="favorite-image" loading="lazy" />
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
                                                <Link to={`/anime?search=${encodeURIComponent(mappedAnime ? (mappedAnime.series || mappedAnime.name) : name)}`} className="hover-btn detail-btn" title="View in Anime List">
                                                    Detail
                                                </Link>
                                            </div>
                                            <div className="hover-actions-bottom">
                                                {mappedAnime && mappedAnime.rating ? (
                                                    <span className="hover-fh">FH {mappedAnime.rating}/10</span>
                                                ) : null}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="hover-char-top">
                                                <span className="hover-char-name">{name}</span>
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
            <div className="page-header mt-8 mb-6">
                <h1>Top Favorites</h1>
                <p className="subtitle">Mých oblíbených TOP 10 Anime a Postav</p>
            </div>

            <div className="favorites-content">
                {renderSection('TOP 10 Anime', data.top10_anime, true)}
                {renderSection('Honourable Mentions', data.hm_anime, true, true)}
                {renderSection('TOP 10 Characters', data.top10_chars, false)}
            </div>
        </div>
    );
};

export default TopFavorites;
