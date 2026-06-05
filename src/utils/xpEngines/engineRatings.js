export const calculateRatingsXP = (nodeDef, currentLevel, { categoryRatings, episodeRatings }) => {
    let xp = 0;
    const contributors = [];

    if (!categoryRatings || !episodeRatings || categoryRatings.length === 0 || episodeRatings.length === 0) return { xp, contributors };

    // --- Category Ratings Nodes ---
    if (nodeDef.id === 'rating_category') {
        categoryRatings.forEach(anime => {
            const cats = anime.categories || {};
            // Count how many categories are filled (not null)
            const filledCategories = Object.keys(cats).filter(key => cats[key] != null).length;

            if (filledCategories >= 8) {
                const gained = 500;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_animace') {
        categoryRatings.forEach(anime => {
            const cats = anime.categories || {};
            if (cats['Animace'] != null && parseFloat(cats['Animace']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_ost_perf') {
        categoryRatings.forEach(anime => {
            const cats = anime.categories || {};
            if (cats['OST'] != null && parseFloat(cats['OST']) === 10.0) {
                const gained = 1500;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_enjoyment') {
        categoryRatings.forEach(anime => {
            const cats = anime.categories || {};
            if (cats['Enjoyment'] != null && parseFloat(cats['Enjoyment']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'rating_waifu') {
        categoryRatings.forEach(anime => {
            const cats = anime.categories || {};
            if (cats['Waifu'] != null && parseFloat(cats['Waifu']) >= 9.0) {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            }
        });
    }

    // --- Episodic Ratings Nodes ---
    else if (nodeDef.id === 'rating_episodic') {
        // Build map from grouped format: [{name, episodes: [{episode, rating}]}]
        const animeMap = new Map();
        episodeRatings.forEach(anime => {
            const animeName = anime.name;
            if (!animeName) return;
            if (!animeMap.has(animeName)) {
                animeMap.set(animeName, []);
            }
            (anime.episodes || []).forEach(ep => {
                if (ep.rating != null && ep.rating !== "") {
                    animeMap.get(animeName).push(parseFloat(ep.rating));
                }
            });
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
        // Build map from grouped format
        const animeMap = new Map();
        episodeRatings.forEach(anime => {
            const animeName = anime.name;
            if (!animeName) return;
            if (!animeMap.has(animeName)) {
                animeMap.set(animeName, []);
            }
            (anime.episodes || []).forEach(ep => {
                if (ep.rating != null && ep.rating !== "") {
                    animeMap.get(animeName).push(parseFloat(ep.rating));
                }
            });
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

