/**
 * Computes XP for Chronos (Time/Quantity) nodes.
 */
export function calculateChronosXP(nodeDef, totalWatchHours, data) {
    let xp = 0;
    let contributors = [];

    const addAnime = (a, gained) => {
        xp += gained;
        contributors.push({ id: a.anime_id, name: a.name, xp: gained });
    };

    if (nodeDef.id === 'chronos_novice') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                const totalDays = parseFloat(a.total_time);
                if (!isNaN(totalDays)) {
                    addAnime(a, Math.floor(totalDays * 24 * 10)); // 1 hour = 10 XP
                }
            });
        }
    }
    else if (nodeDef.id === 'chronos_binge') {
        let maxEpsInDay = 0;
        const dateMap = {};

        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date) {
                    const dateStr = entry.date.split('T')[0];
                    dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
                }
            });
            maxEpsInDay = Math.max(0, ...Object.values(dateMap));
        }
        xp = maxEpsInDay * 100;
        // Skip specific contributors for Binge since it's date-based, not anime-based
    }
    else if (nodeDef.id === 'chronos_completionist') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (String(a.status).toUpperCase() === 'FINISHED') {
                    addAnime(a, 100);
                }
            });
        }
    }

    return { xp, contributors };
}
