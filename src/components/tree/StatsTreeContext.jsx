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
                // Fetch massive JSON payloads in parallel
                const [
                    animeListRes,
                    historyLogRes,
                    favoritesRes,
                    favoritesOstRes,
                    statsRes
                ] = await Promise.all([
                    fetch('data/anime_list.json'),
                    fetch('data/history_log.json'),
                    fetch('data/favorites.json'),
                    fetch('data/favorites_ost.json'),
                    fetch('data/stats.json')
                ]);

                const animeList = await animeListRes.json();
                const historyLog = await historyLogRes.json();
                const favorites = await favoritesRes.json();
                const favoritesOst = await favoritesOstRes.json();
                const stats = await statsRes.json();

                // Pass everything to the mathematical engine
                const computedNodes = calculateTreeState({
                    animeList, historyLog, favorites, favoritesOst, stats
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
