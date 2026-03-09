/**
 * Computes XP for Miscellaneous Domains: Dub/Sub, Rewatch, Backlogger, Scribe, Content Length
 */

export function calculateMiscXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    const addAnime = (a, gained) => {
        xp += gained;
        contributors.push({ id: a.anime_id, name: a.name, xp: gained });
    };

    const animeList = data.animeList || [];

    // ─── DUB / SUB (DOMAIN 8) ───
    if (nodeDef.id === 'lang_sub') {
        animeList.forEach(a => {
            if (String(a.dub).toLowerCase() === 'ne' || String(a.dub).toLowerCase() === 'sub') addAnime(a, 1000);
        });
    } else if (nodeDef.id === 'lang_dub') {
        animeList.forEach(a => {
            if (String(a.dub).toLowerCase() === 'ano') addAnime(a, 1000);
        });
    }

    // ─── REWATCH (DOMAIN 9) ───
    else if (nodeDef.id === 'rewatch_lane') {
        animeList.forEach(a => {
            const rw = parseInt(a.rewatch_count) || 0;
            if (rw > 0) addAnime(a, rw * 1000);
        });
    } else if (nodeDef.id === 'rewatch_endless') {
        animeList.forEach(a => {
            const rw = parseInt(a.rewatch_count) || 0;
            if (rw >= 5) addAnime(a, rw * 5000);
            else if (rw > 0) addAnime(a, rw * 1000); // give partial credit so something shows up
        });
    }

    // ─── EPISODE LENGTH (DOMAIN 12) ───
    else if (nodeDef.id === 'len_sprinter') {
        animeList.forEach(a => {
            const e = parseInt(a.episodes) || 0;
            if (String(a.type).toUpperCase() === 'MOVIE' || (e > 0 && e <= 3)) addAnime(a, 1500);
        });
    } else if (nodeDef.id === 'len_marathon') {
        animeList.forEach(a => {
            const e = parseInt(a.episodes) || 0;
            if (e >= 50) addAnime(a, 2500);
        });
    }

    // ─── AIRING VS FINISHED (DOMAIN 8) ───
    else if (nodeDef.id === 'status_airing') {
        animeList.forEach(a => {
            if (String(a.status).toUpperCase() === 'AIRING!') addAnime(a, 5000);
        });
    }

    return { xp, contributors };
}
