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
    // ─── TITAN V2: HABIT DOMAIN ───
    else if (nodeDef.id === 'habit_turtle') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.start_date && a.end_date && String(a.status).toUpperCase() === 'FINISHED') {
                    const start = new Date(a.start_date);
                    const end = new Date(a.end_date);
                    const diffTime = Math.abs(end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays >= 180) { // More than 6 months
                        addAnime(a, 1); // 1 point per anime
                    }
                }
            });
        }
    }
    else if (nodeDef.id === 'habit_sleep_deficit') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.start_date && a.end_date && String(a.status).toUpperCase() === 'FINISHED') {
                    const eps = parseInt(a.episodes) || 0;
                    if (eps >= 12) {
                        const start = new Date(a.start_date);
                        const end = new Date(a.end_date);
                        const diffTime = Math.abs(end - start);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays <= 2) { // 12+ eps in 48 hours or less
                            addAnime(a, 1); // 1 point per anime
                        }
                    }
                }
            });
        }
    }

    return { xp, contributors };
}
