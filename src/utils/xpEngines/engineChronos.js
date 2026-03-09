/**
 * Computes XP for Chronos (Time/Quantity) nodes.
 */
export function calculateChronosXP(nodeDef, totalWatchHours, data) {
    let xp = 0;

    if (nodeDef.id === 'chronos_novice') {
        // Simple 1 hour = 10 XP scaling for total time
        // E.g. 100 hrs = 1000 XP (Level 1 threshold)
        xp = totalWatchHours * 10;
    }
    else if (nodeDef.id === 'chronos_binge') {
        // Calculate the highest density of episodes in a single day from history_log
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

        // Suppose 1 ep in a single day = 100 XP
        // Weekend Warrior needs 5 eps = 500 XP
        xp = maxEpsInDay * 100;
    }
    else if (nodeDef.id === 'chronos_completionist') {
        // Count finished anime
        let finishedCount = 0;
        if (data.animeList) {
            finishedCount = data.animeList.filter(a => String(a.status).toUpperCase() === 'FINISHED').length;
        }
        // 1 finished = 100 XP
        // Novice (10 finishes = 1000 XP)
        xp = finishedCount * 100;
    }

    return xp;
}
