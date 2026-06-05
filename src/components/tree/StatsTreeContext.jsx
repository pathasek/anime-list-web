import React, { createContext, useContext, useState, useEffect } from 'react';
import { calculateTreeState } from '../../utils/xpEngines';

const StatsTreeContext = createContext();

export function useStatsTree() {
    return useContext(StatsTreeContext);
}

export function StatsTreeProvider({ children }) {
    const [treeState, setTreeState] = useState({ nodes: [], isLoading: true, error: null });

    useEffect(() => {
        let isMounted = true;

        async function loadDataAndCompute() {
            try {
                // Fetch all JSON payloads in parallel
                const [
                    animeListRes,
                    historyLogRes,
                    favoritesRes,
                    favoritesOstRes,
                    statsRes,
                    topFavoritesRes,
                    notesRes,
                    planToWatchRes,
                    categoryRatingsRes,
                    episodeRatingsRes
                ] = await Promise.all([
                    fetch('data/anime_list.json?v=' + Date.now()),
                    fetch('data/history_log.json?v=' + Date.now()),
                    fetch('data/favorites.json?v=' + Date.now()),
                    fetch('data/favorites_ost.json?v=' + Date.now()),
                    fetch('data/stats.json?v=' + Date.now()),
                    fetch('data/top_favorites.json?v=' + Date.now()),
                    fetch('data/notes.json?v=' + Date.now()),
                    fetch('data/plan_to_watch.json?v=' + Date.now()),
                    fetch('data/category_ratings.json?v=' + Date.now()),
                    fetch('data/episode_ratings.json?v=' + Date.now())
                ]);

                const animeList = await animeListRes.json();
                const historyLog = await historyLogRes.json();
                const favorites = await favoritesRes.json();
                const favoritesOst = await favoritesOstRes.json();
                const stats = await statsRes.json();
                const topFavorites = await topFavoritesRes.json();
                const notes = await notesRes.json();
                const planToWatch = await planToWatchRes.json();
                const categoryRatings = await categoryRatingsRes.json();
                const episodeRatings = await episodeRatingsRes.json();

                // Pass everything to the mathematical engine
                const computedNodes = calculateTreeState({
                    animeList, historyLog, favorites, favoritesOst, stats,
                    topFavorites, notes, planToWatch, categoryRatings, episodeRatings
                });

                if (isMounted) {
                    setTreeState({ nodes: computedNodes, isLoading: false, error: null });
                }
            } catch (err) {
                console.error("Failed to load tree data:", err);
                if (isMounted) {
                    setTreeState({ nodes: [], isLoading: false, error: err.message });
                }
            }
        }

        loadDataAndCompute();

        return () => { isMounted = false; };
    }, []);

    return (
        <StatsTreeContext.Provider value={treeState}>
            {children}
        </StatsTreeContext.Provider>
    );
}

