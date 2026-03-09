/**
 * Computes XP for Miscellaneous Domains: Dub/Sub, Rewatch, Backlogger, Scribe, Content Length
 */

export function calculateMiscXP(nodeDef, data) {
    let xp = 0;

    // ─── DUB / SUB (DOMAIN 8) ───
    if (nodeDef.id.startsWith('lang_')) {
        let dubCount = 0;
        let subCount = 0;
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (String(a.dub).toLowerCase() === 'ano') dubCount++;
                else if (String(a.dub).toLowerCase() === 'ne' || String(a.dub).toLowerCase() === 'sub') subCount++;
            });
        }

        if (nodeDef.id === 'lang_sub') xp = subCount * 1000;
        else if (nodeDef.id === 'lang_dub') xp = dubCount * 1000;
        else if (nodeDef.id === 'lang_bilingual') xp = Math.min(dubCount, subCount) * 2000;
    }

    // ─── REWATCH (DOMAIN 9) ───
    else if (nodeDef.id.startsWith('rewatch_')) {
        let maxRewatchSingle = 0; // Endless Eight mechanic
        let totalRewatches = 0;

        if (data.animeList) {
            data.animeList.forEach(a => {
                const rw = parseInt(a.rewatch_count) || 0;
                totalRewatches += rw;
                if (rw > maxRewatchSingle) maxRewatchSingle = rw;
            });
        }

        if (nodeDef.id === 'rewatch_lane') xp = totalRewatches * 1000; // Comfort zone
        else if (nodeDef.id === 'rewatch_endless') {
            // Endless Eight triggers strongly if maxRewatchSingle >= 5
            xp = maxRewatchSingle * 5000;
        }
    }

    // ─── EPISODE LENGTH (DOMAIN 12) ───
    else if (nodeDef.id.startsWith('len_')) {
        let shortCount = 0; // Movies/Specials
        let longCount = 0; // 50+ eps

        if (data.animeList) {
            data.animeList.forEach(a => {
                const e = parseInt(a.episodes) || 0;
                if (String(a.type).toUpperCase() === 'MOVIE' || (e > 0 && e <= 3)) shortCount++;
                if (e >= 50) longCount++;
            });
        }

        if (nodeDef.id === 'len_sprinter') xp = shortCount * 1500;
        else if (nodeDef.id === 'len_marathon') xp = longCount * 2500;
    }

    // ─── AIRING VS FINISHED (DOMAIN 8) ───
    else if (nodeDef.id.startsWith('status_')) {
        let airingCount = 0;
        if (data.animeList) {
            airingCount = data.animeList.filter(a => String(a.status).toUpperCase() === 'AIRING!').length;
        }
        if (nodeDef.id === 'status_airing') xp = airingCount * 5000; // Seasonal scrub
    }

    return xp;
}
