import React, { useState, useEffect } from 'react';
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
                    fetch(`${process.env.PUBLIC_URL}/data/top_favorites.json`),
                    fetch(`${process.env.PUBLIC_URL}/data/anime_list.json`)
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
                        let finalImage = item.image_file ? `${process.env.PUBLIC_URL}/${item.image_file}` : null;

                        // If it's an anime, try to grab its poster from the main anime_list map instead, 
                        // as Top10 Anime don't have direct embedded image extractions right now (they are grouped shape backgrounds)
                        // Or if they do, we will use it natively.
                        if (isAnimeLists) {
                            // To keep things simple visually, sometimes posters from anime list look great for anime items
                            const mappedAnime = animeMap[name.toLowerCase()];
                            if (mappedAnime && mappedAnime.image_file) {
                                finalImage = finalImage || `${process.env.PUBLIC_URL}/${mappedAnime.image_file}`;
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
