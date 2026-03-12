/**
 * Computes XP for Studio loyalty and franchise branches.
 */
export function calculateStudioXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const getStudioXP = (studioNameMatch) => {
        let watchTime = 0;
        let localContribs = [];
        if (data.animeList) {
            data.animeList.forEach(anime => {
                if (anime.studio != null && String(anime.studio).toLowerCase().includes(studioNameMatch.toLowerCase())) {
                    const eps = parseInt(anime.episodes) || (anime.total_time != null && !isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    let gained = eps * 100;
                    if (anime.status != null && String(anime.status).toUpperCase() === 'FINISHED') gained += 500;

                    watchTime += gained;
                    localContribs.push({ id: anime.anime_id, name: anime.name, xp: gained });
                }
            });
        }
        return { xp: watchTime, list: localContribs };
    };

    const addStudio = (name) => {
        const res = getStudioXP(name);
        xp += res.xp;
        contributors.push(...res.list);
    };

    if (nodeDef.id === 'studio_connoisseur') {
        const studios = new Set();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.studio != null) {
                    studios.add(String(a.studio).split(',')[0].trim());
                }
            });
        }
        xp = studios.size * 500; // 500 XP per unique studio
    }
    else if (nodeDef.id === 'studio_kyoani') addStudio('Kyoto Animation');
    else if (nodeDef.id === 'studio_mappa') addStudio('MAPPA');
    else if (nodeDef.id === 'studio_ufotable') addStudio('ufotable');
    else if (nodeDef.id === 'studio_madhouse') addStudio('Madhouse');
    else if (nodeDef.id === 'studio_bones') addStudio('Bones');
    else if (nodeDef.id === 'studio_trigger') { addStudio('Trigger'); addStudio('Gainax'); }
    else if (nodeDef.id === 'studio_shaft') addStudio('Shaft');
    else if (nodeDef.id === 'studio_a1') { addStudio('A-1 Pictures'); addStudio('CloverWorks'); }
    else if (nodeDef.id === 'studio_wit') addStudio('WIT Studio');

    // ─── NEW SERIES & FRANCHISE CHAIN ───
    else if (nodeDef.id === 'misc_series_master') {
        const seriesMap = new Map(); // series_title => count
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.series && String(a.series).trim() !== '') {
                    const ser = String(a.series).trim();
                    seriesMap.set(ser, (seriesMap.get(ser) || 0) + 1);
                }
            });
        }
        seriesMap.forEach((count, seriesName) => {
            if (count >= 3) { // 3+ entries in the same series
                const gained = count * 1000;
                xp += gained;
                contributors.push({ id: seriesName, name: `${seriesName} Universe`, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'misc_franchise') {
        const seriesMap = new Map();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.series && String(a.series).trim() !== '') {
                    const ser = String(a.series).trim();
                    seriesMap.set(ser, (seriesMap.get(ser) || 0) + 1);
                }
            });
        }
        seriesMap.forEach((count, seriesName) => {
            if (count >= 8) { // 8+ entries in massive franchise (e.g., Fate, Monogatari)
                const gained = count * 2000;
                xp += gained;
                contributors.push({ id: seriesName, name: `${seriesName} Franchise`, xp: gained });
            }
        });
    }

    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}
