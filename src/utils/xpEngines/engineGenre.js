/**
 * Computes XP for Genre and Theme specific nodes based on anime_list genres and themes.
 */
export function calculateGenreXP(nodeDef, data) {
    let xp = 0;

    // Helper to count episodes watched for a specific tag
    const getTagXP = (targetTag, isTheme = false) => {
        let epsWatchTime = 0;
        if (data.animeList) {
            data.animeList.forEach(anime => {
                const tagsField = isTheme ? anime.themes : anime.genres;
                if (tagsField && String(tagsField).toLowerCase().includes(targetTag.toLowerCase())) {
                    // add 100 XP per episode
                    const eps = parseInt(anime.episodes) || (!isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    epsWatchTime += (eps * 100);
                    if (String(anime.status).toUpperCase() === 'FINISHED') epsWatchTime += 500; // completion bonus
                }
            });
        }
        return epsWatchTime;
    };

    // ─── 3A: ACTION PATH ───
    if (nodeDef.id === 'genre_action') xp = getTagXP('Action');
    else if (nodeDef.id === 'genre_shounen') xp = getTagXP('Shounen', true) + getTagXP('Super Power', true);
    else if (nodeDef.id === 'genre_isekai') xp = getTagXP('Isekai', true);
    else if (nodeDef.id === 'genre_mecha') xp = getTagXP('Mecha', true) + getTagXP('Sci-Fi');

    // ─── 3B: ROMANCE & DRAMA ───
    else if (nodeDef.id === 'genre_romance') xp = getTagXP('Romance');
    else if (nodeDef.id === 'genre_drama') xp = getTagXP('Drama');
    else if (nodeDef.id === 'genre_sol') xp = getTagXP('Slice of Life');

    // ─── 3C: THRILLER ───
    else if (nodeDef.id === 'genre_mystery') xp = getTagXP('Mystery');
    else if (nodeDef.id === 'genre_psychological') xp = getTagXP('Psychological', true);

    // ─── 3D: SPORTS ───
    else if (nodeDef.id === 'genre_sports') xp = getTagXP('Sports');

    // Generic fallback for the root explorer
    else if (nodeDef.id === 'genre_explorer') {
        const uniqueGenres = new Set();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.genres) a.genres.split(',').forEach(g => uniqueGenres.add(g.trim()));
            });
        }
        xp = uniqueGenres.size * 500; // 500 XP per unique genre found
    }

    return xp;
}
