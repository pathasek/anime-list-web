/**
 * Computes XP for Genre and Theme specific nodes based on anime_list genres and themes.
 */
export function calculateGenreXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    // Helper to count episodes watched for a specific tag
    const getTagXP = (targetTag, isTheme = false) => {
        let epsWatchTime = 0;
        let localContribs = [];
        if (data.animeList) {
            data.animeList.forEach(anime => {
                const tagsField = isTheme ? anime.tags : anime.genres; // Use tags instead of themes for Titan V2
                if (tagsField && String(tagsField).toLowerCase().includes(targetTag.toLowerCase())) {
                    // add 100 XP per episode
                    const eps = parseInt(anime.episodes) || (!isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    let gained = eps * 100;
                    if (String(anime.status).toUpperCase() === 'FINISHED') gained += 500; // completion bonus

                    epsWatchTime += gained;
                    localContribs.push({ id: anime.anime_id, name: anime.name, xp: gained });
                }
            });
        }
        return { xp: epsWatchTime, list: localContribs };
    };

    const addTag = (targetTag, isTheme = false) => {
        const res = getTagXP(targetTag, isTheme);
        xp += res.xp;
        contributors.push(...res.list);
    };

    // ─── 3A: ACTION PATH ───
    if (nodeDef.id === 'genre_action') addTag('Action');
    else if (nodeDef.id === 'genre_shounen') { addTag('Shounen', true); addTag('Super Power', true); }
    else if (nodeDef.id === 'genre_shounen_master') { addTag('Shounen', true); addTag('Super Power', true); }
    else if (nodeDef.id === 'genre_isekai') addTag('Isekai', true);
    else if (nodeDef.id === 'genre_mecha') { addTag('Mecha', true); addTag('Sci-Fi'); }

    // ─── 3B: ROMANCE & DRAMA ───
    else if (nodeDef.id === 'genre_romance') addTag('Romance');
    else if (nodeDef.id === 'genre_drama') addTag('Drama');
    else if (nodeDef.id === 'genre_sol') addTag('Slice of Life');

    // ─── 3C: THRILLER ───
    else if (nodeDef.id === 'genre_mystery') addTag('Mystery');
    else if (nodeDef.id === 'genre_psychological') addTag('Psychological', true);

    // ─── 3D: SPORTS ───
    else if (nodeDef.id === 'genre_sports') addTag('Sports');

    // ─── TITAN V2: DEMOGRAPHICS ───
    else if (nodeDef.id === 'demo_shounen') addTag('Shounen', true);
    else if (nodeDef.id === 'demo_seinen') addTag('Seinen', true);
    else if (nodeDef.id === 'demo_shoujo') addTag('Shoujo', true);

    // ─── TITAN V2: TROPES ───
    else if (nodeDef.id === 'trope_iyashikei') { addTag('Iyashikei', true); addTag('Cute Girls Doing Cute Things', true); addTag('Rural', true); }
    else if (nodeDef.id === 'trope_edgelord') { addTag('Gore', true); addTag('Psychological', true); addTag('Dark Fantasy', true); addTag('Death Game', true); }
    else if (nodeDef.id === 'trope_idol') { addTag('Idol', true); addTag('Music', true); }

    // Generic fallback for the root explorer
    else if (nodeDef.id === 'genre_explorer') {
        const uniqueGenres = new Set();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.genres) {
                    a.genres.split(';').forEach(g => { // changed comma to semicolon
                        uniqueGenres.add(g.trim());
                    });
                }
            });
        }
        xp = uniqueGenres.size * 500; // 500 XP per unique genre found
    }

    return { xp, contributors };
}
