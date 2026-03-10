/**
 * Computes XP for Miscellaneous Domains: Dub/Sub, Rewatch, Backlogger, Scribe, Content Length and Ultimate Omegas.
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

    // ─── TITAN V2: OMEGA CROSSOVERS (ULTIMATE) ───
    else if (nodeDef.id === 'omega_degenerate_lord') {
        animeList.forEach(a => {
            const tags = String(a.tags).toLowerCase();
            const e = parseInt(a.episodes) || 0;
            if (tags.includes('isekai') && tags.includes('ecchi') && e >= 12) {
                addAnime(a, 5000);
            }
        });
    }
    else if (nodeDef.id === 'omega_corporate_slave') {
        animeList.forEach(a => {
            const tags = String(a.tags).toLowerCase();
            if (tags.includes('seinen') && tags.includes('iyashikei')) {
                addAnime(a, 5000);
            }
        });
    }
    else if (nodeDef.id === 'omega_schizophrenia') {
        animeList.forEach(a => {
            const tags = String(a.tags).toLowerCase();
            if (tags.includes('gore') || tags.includes('psychological') || tags.includes('idol') || tags.includes('music')) {
                // If it's a mix of cute and dark...
                if ((tags.includes('gore') || tags.includes('psychological')) && (tags.includes('idol') || tags.includes('music') || tags.includes('cute girls doing cute things') || tags.includes('comedy'))) {
                    addAnime(a, 15000);
                }
            }
        });
    }
    else if (nodeDef.id === 'omega_shounen') {
        animeList.forEach(a => {
            const tags = String(a.tags).toLowerCase();
            const e = parseInt(a.episodes) || 0;
            if (tags.includes('shounen') && e >= 100) {
                addAnime(a, 10000);
            }
        });
    }
    else if (nodeDef.id === 'omega_feels') {
        animeList.forEach(a => {
            const tags = String(a.tags).toLowerCase();
            const genres = String(a.genres).toLowerCase();
            const studio = String(a.studio).toLowerCase();
            if ((genres.includes('drama') || tags.includes('drama')) && studio.includes('kyoto animation')) {
                addAnime(a, 10000);
            }
        });
    }
    else if (nodeDef.id === 'omega_elitist') {
        animeList.forEach(a => {
            const type = String(a.type).toUpperCase();
            const rating = parseFloat(a.rating) || 0;
            if ((type === 'MOVIE' || type === 'OVA') && rating >= 8 && String(a.dub).toLowerCase() === 'ne') {
                addAnime(a, 10000);
            }
        });
    }

    return { xp, contributors };
}
