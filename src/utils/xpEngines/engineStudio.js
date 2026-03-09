/**
 * Computes XP for Studio loyalty branches.
 */
export function calculateStudioXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    const getStudioXP = (studioNameMatch) => {
        let watchTime = 0;
        let localContribs = [];
        if (data.animeList) {
            data.animeList.forEach(anime => {
                if (anime.studio && String(anime.studio).toLowerCase().includes(studioNameMatch.toLowerCase())) {
                    const eps = parseInt(anime.episodes) || (!isNaN(anime.total_time) ? Math.max(1, Math.floor(anime.total_time / 24)) : 12);
                    let gained = eps * 100;
                    if (String(anime.status).toUpperCase() === 'FINISHED') gained += 500;

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
                if (a.studio) {
                    studios.add(String(a.studio).split(',')[0].trim());
                    // Rough approximation, give 500 relative to everything for explorer
                }
            });
        }
        xp = studios.size * 500;
        // No obvious specific anime contributors for unique count
    }
    else if (nodeDef.id === 'studio_kyoani') addStudio('Kyoto Animation');
    else if (nodeDef.id === 'studio_mappa') addStudio('MAPPA');
    else if (nodeDef.id === 'studio_ufotable') addStudio('ufotable');
    else if (nodeDef.id === 'studio_madhouse') addStudio('Madhouse');
    else if (nodeDef.id === 'studio_bones') addStudio('Bones');
    else if (nodeDef.id === 'studio_trigger') { addStudio('Trigger'); addStudio('Gainax'); }
    else if (nodeDef.id === 'studio_shaft') addStudio('Shaft');
    else if (nodeDef.id === 'studio_a1') { addStudio('A-1 Pictures'); addStudio('CloverWorks'); }

    return { xp, contributors };
}
