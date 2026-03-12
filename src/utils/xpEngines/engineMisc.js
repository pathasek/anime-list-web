/**
 * Computes XP for Miscellaneous Domains: Dub/Sub, Completionist Chains, and Ultimate Omegas.
 */

export function calculateMiscXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const addAnime = (a, gained) => {
        xp += gained;
        contributors.push({ id: a.anime_id, name: a.name, xp: gained });
    };

    const animeList = data.animeList || [];

    // ─── DUB / SUB (DOMAIN 8) ───
    if (nodeDef.id === 'lang_sub' || nodeDef.id === 'misc_sub_purist') {
        animeList.forEach(a => {
            const dubStr = a.dub != null ? String(a.dub).toLowerCase() : '';
            if (dubStr === 'ne' || dubStr === 'sub') addAnime(a, 1000);
        });
    } else if (nodeDef.id === 'lang_dub' || nodeDef.id === 'misc_dub_enjoyer') {
        animeList.forEach(a => {
            const dubStr = a.dub != null ? String(a.dub).toLowerCase() : '';
            if (dubStr === 'ano') addAnime(a, 1000);
        });
    }
    else if (nodeDef.id === 'misc_bilingual') {
        // Collect dub users and sub users, give bonus if both are well represented
        let subCount = 0;
        let dubCount = 0;
        animeList.forEach(a => {
            const dubStr = a.dub != null ? String(a.dub).toLowerCase() : '';
            if (dubStr === 'ne' || dubStr === 'sub') subCount++;
            else if (dubStr === 'ano') dubCount++;
        });
        
        // At least 15 in both categories
        if (subCount >= 15 && dubCount >= 15) {
            animeList.forEach(a => {
                const eps = parseInt(a.episodes) || 12;
                addAnime(a, eps * 50); // Small bonus across the board for bilinguals
            });
        }
    }

    // ─── COMPLETIONIST CHAIN ───
    else if (nodeDef.id === 'misc_completionist') {
        animeList.forEach(a => {
            if (a.status != null && String(a.status).toUpperCase() === 'FINISHED') addAnime(a, 500);
        });
    }
    else if (nodeDef.id === 'misc_dropped') {
        animeList.forEach(a => {
            if (a.status != null && String(a.status).toUpperCase() === 'DROPPED') addAnime(a, 2000);
        });
    }
    else if (nodeDef.id === 'misc_onhold') {
        animeList.forEach(a => {
            if (a.status != null && String(a.status).toUpperCase() === 'ON HOLD') addAnime(a, 1500);
        });
    }
    else if (['misc_hundred_club', 'misc_two_hundred', 'misc_three_hundred'].includes(nodeDef.id)) {
        let finishedCount = 0;
        animeList.forEach(a => {
            if (a.status != null && String(a.status).toUpperCase() === 'FINISHED') finishedCount++;
        });

        if (nodeDef.id === 'misc_hundred_club' && finishedCount >= 100) {
            animeList.forEach(a => { if (String(a.status).toUpperCase() === 'FINISHED') addAnime(a, 500); });
        }
        else if (nodeDef.id === 'misc_two_hundred' && finishedCount >= 200) {
            animeList.forEach(a => { if (String(a.status).toUpperCase() === 'FINISHED') addAnime(a, 600); });
        }
        else if (nodeDef.id === 'misc_three_hundred' && finishedCount >= 300) {
            animeList.forEach(a => { if (String(a.status).toUpperCase() === 'FINISHED') addAnime(a, 700); });
        }
    }

    // ─── REWATCH (DOMAIN 9) ───
    else if (nodeDef.id === 'rewatch_lane') {
        animeList.forEach(a => {
            const rw = parseInt(a.rewatch_count) || 0;
            if (rw > 0) addAnime(a, rw * 1500);
        });
    } else if (nodeDef.id === 'rewatch_endless') {
        animeList.forEach(a => {
            const rw = parseInt(a.rewatch_count) || 0;
            if (rw >= 5) addAnime(a, rw * 5000);
            else if (rw > 0) addAnime(a, rw * 1000);
        });
    }

    // ─── STATUS & TITAN V2 OMEGAS ───
    else if (nodeDef.id === 'status_airing') {
        animeList.forEach(a => {
            if (a.status != null && String(a.status).toUpperCase() === 'AIRING!') addAnime(a, 5000);
        });
    }
    // New Zenith logic requires simply calculating raw bulk XP, as dependencies unlock it
    else if (nodeDef.id === 'omega_zenith' || nodeDef.id === 'omega_absolute') {
        // Ultimate nodes that just dump massive XP directly based on total watched series
        animeList.forEach(a => addAnime(a, 500));
    }
    // Old Omegas kept for compatibility
    else if (nodeDef.id === 'omega_shounen') {
        animeList.forEach(a => {
            const tags = a.tags != null ? String(a.tags).toLowerCase() : '';
            const e = parseInt(a.episodes) || 0;
            if (tags.includes('shounen') && e >= 100) addAnime(a, 10000);
        });
    }
    else if (nodeDef.id === 'omega_corporate_slave') {
        animeList.forEach(a => {
            const tags = a.tags != null ? String(a.tags).toLowerCase() : '';
            if (tags.includes('seinen') && (tags.includes('iyashikei') || tags.includes('slice of life'))) addAnime(a, 5000);
        });
    }
    else if (nodeDef.id === 'omega_elitist') {
        animeList.forEach(a => {
            const typeStr = a.type != null ? String(a.type).toUpperCase() : '';
            const rating = parseFloat(a.rating) || 0;
            const dubStr = a.dub != null ? String(a.dub).toLowerCase() : '';
            if ((typeStr === 'MOVIE' || typeStr === 'OVA') && rating >= 8 && dubStr === 'ne') addAnime(a, 10000);
        });
    }
    else if (nodeDef.id === 'omega_analyst') {
        animeList.forEach(a => {
            // Massive analyzer - raw bonus
            if (a.rating != null && parseFloat(a.rating) >= 9) addAnime(a, 2000);
        });
    }

    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}
