export const calculateFavoritesXP = (nodeDef, currentLevel, { topFavorites }) => {
    let xp = 0;
    const contributors = [];

    if (!topFavorites) return { xp, contributors };

    if (nodeDef.id === 'fav_pantheon') {
        // Collect Top 10 Anime
        if (topFavorites.top10_anime && Array.isArray(topFavorites.top10_anime)) {
            topFavorites.top10_anime.forEach(anime => {
                const gained = 2000;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            });
        }
        
        // Collect Honorable Mentions
        if (topFavorites.hm_anime && Array.isArray(topFavorites.hm_anime)) {
            topFavorites.hm_anime.forEach(anime => {
                const gained = 1000;
                xp += gained;
                contributors.push({ id: anime.name, name: anime.name, xp: gained });
            });
        }
    }
    else if (nodeDef.id === 'fav_characters') {
        if (topFavorites.top10_chars && Array.isArray(topFavorites.top10_chars)) {
            topFavorites.top10_chars.forEach(char => {
                const animeName = char.anime_name || char.name;
                const gained = 1500;
                xp += gained;
                contributors.push({ 
                    id: `${char.name}-${animeName}`, 
                    name: `${char.name} (${animeName})`, 
                    xp: gained 
                });
            });
        }
    }
    else if (nodeDef.id === 'fav_devoted') {
        const charCounts = new Map();
        if (topFavorites.top10_chars && Array.isArray(topFavorites.top10_chars)) {
            topFavorites.top10_chars.forEach(char => {
                if (char.anime_name) {
                    charCounts.set(char.anime_name, (charCounts.get(char.anime_name) || 0) + 1);
                }
            });
            charCounts.forEach((count, animeName) => {
                const gained = count * 2000;
                xp += gained;
                contributors.push({ id: animeName, name: animeName, xp: gained });
            });
        }
    }

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);

    return { xp, contributors: contributors.slice(0, 50) };
};
