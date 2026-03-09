/**
 * Computes XP for Studio loyalty branches.
 */
export function calculateStudioXP(nodeDef, data) {
    let xp = 0;

    const getStudioXP = (studioNameMatch) => {
        let watchTime = 0;
        if (data.animeList) {
            data.animeList.forEach(anime => {
                if (anime.studio && String(anime.studio).toLowerCase().includes(studioNameMatch.toLowerCase())) {
                    const eps = parseInt(anime.episodes) || (!isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    watchTime += (eps * 100);
                    if (String(anime.status).toUpperCase() === 'FINISHED') watchTime += 500;
                }
            });
        }
        return watchTime;
    };

    if (nodeDef.id === 'studio_connoisseur') {
        const studios = new Set();
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.studio) studios.add(String(a.studio).split(',')[0].trim());
            });
        }
        xp = studios.size * 500;
    }
    else if (nodeDef.id === 'studio_kyoani') xp = getStudioXP('Kyoto Animation');
    else if (nodeDef.id === 'studio_mappa') xp = getStudioXP('MAPPA');
    else if (nodeDef.id === 'studio_ufotable') xp = getStudioXP('ufotable');
    else if (nodeDef.id === 'studio_madhouse') xp = getStudioXP('Madhouse');
    else if (nodeDef.id === 'studio_bones') xp = getStudioXP('Bones');
    else if (nodeDef.id === 'studio_trigger') xp = getStudioXP('Trigger') + getStudioXP('Gainax');
    else if (nodeDef.id === 'studio_shaft') xp = getStudioXP('Shaft');
    else if (nodeDef.id === 'studio_a1') xp = getStudioXP('A-1 Pictures') + getStudioXP('CloverWorks');

    return xp;
}
