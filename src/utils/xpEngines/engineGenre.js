/**
 * Computes XP for Genre and Theme specific nodes based on anime_list genres and tags.
 */
export function calculateGenreXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    // Helper to count episodes watched for a specific genre or tag
    // Returns { xp: Number, list: Array }
    const getTagXP = (targetTag, isTag = false) => {
        let epsWatchTime = 0;
        let localContribs = [];
        if (data.animeList) {
            data.animeList.forEach(anime => {
                const tagsField = isTag ? anime.tags : anime.genres;
                if (tagsField != null && String(tagsField).toLowerCase().includes(targetTag.toLowerCase())) {
                    // add 100 XP per episode
                    const eps = parseInt(anime.episodes) || (anime.total_time != null && !isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    let gained = eps * 100;
                    if (anime.status != null && String(anime.status).toUpperCase() === 'FINISHED') gained += 500; // completion bonus

                    epsWatchTime += gained;
                    localContribs.push({ id: anime.anime_id, name: anime.name, xp: gained });
                }
            });
        }
        return { xp: epsWatchTime, list: localContribs };
    };

    const addTag = (targetTag, isTag = false) => {
        const res = getTagXP(targetTag, isTag);
        xp += res.xp;
        contributors.push(...res.list);
    };

    // ─── ROOT EXPLORER ───
    if (nodeDef.id === 'genre_explorer') {
        const uniqueGenres = new Set();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.genres != null) {
                    String(a.genres).split(';').forEach(g => {
                        const trimmed = g.trim();
                        if (trimmed) uniqueGenres.add(trimmed);
                    });
                }
            });
        }
        xp = uniqueGenres.size * 500; // 500 XP per unique genre found
    }

    // ─── NEW GENRE BRANCH ───
    else if (nodeDef.id === 'genre_action') addTag('Action');
    else if (nodeDef.id === 'genre_horror') Object.values([getTagXP('Horror'), getTagXP('Thriller')]).forEach(r => { xp += r.xp; contributors.push(...r.list); });
    else if (nodeDef.id === 'genre_romance') addTag('Romance');
    else if (nodeDef.id === 'genre_drama') addTag('Drama');
    else if (nodeDef.id === 'genre_mystery') addTag('Mystery');
    else if (nodeDef.id === 'genre_sports') addTag('Sports');
    else if (nodeDef.id === 'genre_scifi') addTag('Sci-Fi');
    else if (nodeDef.id === 'genre_comedy') addTag('Comedy');
    else if (nodeDef.id === 'genre_fantasy') addTag('Fantasy');

    // ─── TROPES & DEEP NICHE (Tags/Themes) ───
    else if (nodeDef.id === 'trope_gore') addTag('Gore', true);
    else if (nodeDef.id === 'trope_psychological') addTag('Psychological', true);
    else if (nodeDef.id === 'trope_darkfantasy') { addTag('Dark Fantasy', true); addTag('Dark', true); }
    else if (nodeDef.id === 'trope_op_mc') { addTag('Overpowered MC', true); addTag('Strong Lead', true); }
    else if (nodeDef.id === 'trope_timeloop') { addTag('Time Loop', true); addTag('Time Manipulation', true); addTag('Time Travel', true); }
    else if (nodeDef.id === 'trope_school') { addTag('School', true); addTag('School Life', true); }
    else if (nodeDef.id === 'trope_music') { addTag('Music', true); addTag('Performing Arts', true); }
    else if (nodeDef.id === 'trope_parody') { addTag('Parody', true); addTag('Gag Humor', true); }
    else if (nodeDef.id === 'trope_magic') { addTag('Magic', true); addTag('Magical Girl', true); }
    else if (nodeDef.id === 'trope_dystopia') { addTag('Dystopia', true); addTag('Post-Apocalyptic', true); }
    else if (nodeDef.id === 'trope_survival') { addTag('Survival', true); addTag('Death Game', true); }
    else if (nodeDef.id === 'trope_found_family') { addTag('Found Family', true); addTag('Childcare', true); }
    else if (nodeDef.id === 'genre_isekai') addTag('Isekai', true);
    else if (nodeDef.id === 'genre_mecha') addTag('Mecha', true);
    else if (nodeDef.id === 'genre_slice') addTag('Slice of Life');
    else if (nodeDef.id === 'genre_psycho') addTag('Psychological', true);
    else if (nodeDef.id === 'genre_tragedy') addTag('Tragedy', true);
    else if (nodeDef.id === 'trope_iyashikei') addTag('Iyashikei', true);

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);

    // Remove duplicates based on ID
    const uniqueContributors = Array.from(new Map(contributors.map(item => [item.id, item])).values());

    return { xp, contributors: uniqueContributors.slice(0, 50) };
}
