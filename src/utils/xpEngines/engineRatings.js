export const calculateRatingsXP = (nodeDef, currentLevel, { categoryRatings, episodeRatings }) => {
    let xp = 0;
    const contributors = [];

    if (!categoryRatings || !episodeRatings || categoryRatings.length === 0 || episodeRatings.length === 0) return { xp, contributors };

    // --- Category Ratings Nodes ---
    if (nodeDef.id === 'rating_category') {
        categoryRatings.forEach(anime => {
            // Count how many categories are filled (not null)
            const filledCategories = Object.keys(anime).filter(key => 
                key !== 'id' && key !== 'anime_name' && anime[key] != null
            ).length;

            if (filledCategories >= 8) {
                const gained = 500;
                xp += gained;
                contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_animace') {
        categoryRatings.forEach(anime => {
            if (anime['Animace'] != null && parseFloat(anime['Animace']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_ost_perf') {
        categoryRatings.forEach(anime => {
            if (anime['OST'] != null && parseFloat(anime['OST']) === 10.0) {
                const gained = 1500;
                xp += gained;
                contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_enjoyment') {
        categoryRatings.forEach(anime => {
            if (anime['Enjoyment'] != null && parseFloat(anime['Enjoyment']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_waifu') {
        categoryRatings.forEach(anime => {
            if (anime['Waifu'] != null && parseFloat(anime['Waifu']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
            }
        });
    }

    // --- Episodic Ratings Nodes ---
    else if (nodeDef.id === 'rating_episodic') {
        // Group by anime
        const animeMap = new Map();
        episodeRatings.forEach(ep => {
            if (!animeMap.has(ep.anime_name)) {
                animeMap.set(ep.anime_name, []);
            }
            if (ep.score != null && ep.score !== "") {
                animeMap.get(ep.anime_name).push(parseFloat(ep.score));
            }
        });

        animeMap.forEach((scores, animeName) => {
            if (scores.length >= 5) { // At least 5 rated episodes
                const gained = 500;
                xp += gained;
                contributors.push({ id: animeName, name: animeName, xp: gained });
            }
        });
    }
    else if (['rating_variance', 'rating_rollercoaster', 'rating_peak', 'rating_perfectionist', 'rating_consistency'].includes(nodeDef.id)) {
        // Group by anime
        const animeMap = new Map();
        episodeRatings.forEach(ep => {
            if (!animeMap.has(ep.anime_name)) {
                animeMap.set(ep.anime_name, []);
            }
            if (ep.score != null && ep.score !== "") {
                animeMap.get(ep.anime_name).push(parseFloat(ep.score));
            }
        });

        animeMap.forEach((scores, animeName) => {
            if (scores.length >= 3) {
                const max = Math.max(...scores);
                const min = Math.min(...scores);
                const variance = max - min;

                if (nodeDef.id === 'rating_variance' && variance >= 3.0) {
                    const gained = 1000;
                    xp += gained;
                    contributors.push({ id: animeName, name: animeName, xp: gained });
                }
                else if (nodeDef.id === 'rating_rollercoaster' && variance >= 5.0) {
                    const gained = 2000;
                    xp += gained;
                    contributors.push({ id: animeName, name: animeName, xp: gained });
                }
                else if (nodeDef.id === 'rating_peak') {
                    const tens = scores.filter(s => s === 10.0).length;
                    if (tens > 0) {
                        const gained = tens * 500;
                        xp += gained;
                        contributors.push({ id: animeName, name: animeName, xp: gained });
                    }
                }
                else if (nodeDef.id === 'rating_perfectionist') {
                    const tens = scores.filter(s => s === 10.0).length;
                    if (tens >= 5) {
                        const gained = 2000;
                        xp += gained;
                        contributors.push({ id: animeName, name: animeName, xp: gained });
                    }
                }
                else if (nodeDef.id === 'rating_consistency' && scores.length >= 10 && variance <= 1.0) {
                    const gained = 1500;
                    xp += gained;
                    contributors.push({ id: animeName, name: animeName, xp: gained });
                }
            }
        });
    }

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);

    return { xp, contributors: contributors.slice(0, 50) };
};
