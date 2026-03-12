/**
 * Computes XP for Chronos (Time/Quantity) nodes.
 */
export function calculateChronosXP(nodeDef, totalWatchHours, data) {
    let xp = 0;
    const contributors = [];

    const addAnime = (a, gained) => {
        xp += gained;
        contributors.push({ id: a.anime_id, name: a.name, xp: gained });
    };

    if (nodeDef.id === 'chronos_novice') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.total_time != null) {
                    const totalDays = parseFloat(a.total_time);
                    if (!isNaN(totalDays)) {
                        addAnime(a, Math.floor(totalDays * 24 * 10)); // 1 hour = 10 XP
                    }
                }
            });
        }
    }
    // ─── NEW BINGE CHAIN ───
    else if (nodeDef.id === 'chronos_binge') {
        const dateMap = new Map();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    const dateStr = String(entry.date).split('T')[0];
                    if (!dateMap.has(dateStr)) dateMap.set(dateStr, []);
                    dateMap.get(dateStr).push(entry);
                }
            });
            let maxEps = 0;
            dateMap.forEach((entries) => {
                if (entries.length > maxEps) maxEps = entries.length;
            });
            xp = maxEps * 200; // Scaled up for V2
        }
    }
    else if (nodeDef.id === 'chronos_nightowl') {
        // Just raw tracking of active viewing days
        const activeDates = new Set();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    activeDates.add(String(entry.date).split('T')[0]);
                }
            });
        }
        xp = activeDates.size * 50; // 50 XP per day you were active on MAL
    }
    else if (nodeDef.id === 'chronos_abyss') {
        const dateMap = new Map();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    const dateStr = String(entry.date).split('T')[0];
                    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
                }
            });
            let extremeDays = 0;
            dateMap.forEach(count => {
                if (count >= 15) extremeDays++; // 15+ episodes in a day
            });
            xp = extremeDays * 1000;
        }
    }
    
    // ─── NEW STREAK CHAIN ───
    else if (nodeDef.id === 'chronos_streak') {
        const activeDates = new Set();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    activeDates.add(String(entry.date).split('T')[0]);
                }
            });
        }
        
        const sortedDates = Array.from(activeDates).sort();
        let currentStreak = 0;
        let maxStreak = 0;
        
        for (let i = 0; i < sortedDates.length; i++) {
            if (i === 0) {
                currentStreak = 1;
                maxStreak = 1;
            } else {
                const prevDate = new Date(sortedDates[i-1]);
                const currDate = new Date(sortedDates[i]);
                const diffTime = Math.abs(currDate - prevDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays === 1) {
                    currentStreak++;
                    if (currentStreak > maxStreak) maxStreak = currentStreak;
                } else {
                    currentStreak = 1;
                }
            }
        }
        xp = maxStreak * 200;
    }
    else if (nodeDef.id === 'chronos_marathon') {
        const dateMap = new Map();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    const dateStr = String(entry.date).split('T')[0];
                    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
                }
            });
            let marathonDays = 0;
            dateMap.forEach(count => {
                if (count >= 10) marathonDays++; // 10+ episodes in a day
            });
            xp = marathonDays * 500;
        }
    }
    else if (nodeDef.id === 'chronos_ironman') {
        // Look for 10+ episodes across 3 consecutive days
        const dateMap = new Map();
        if (data.historyLog) {
            data.historyLog.forEach(entry => {
                if (entry.date != null) {
                    const dateStr = String(entry.date).split('T')[0];
                    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
                }
            });
        }
        
        const marathonDates = [];
        dateMap.forEach((count, dateStr) => {
            if (count >= 10) marathonDates.push(dateStr);
        });
        marathonDates.sort();

        let ironmanStreaks = 0;
        let currStreak = 1;
        for (let i = 1; i < marathonDates.length; i++) {
            const prev = new Date(marathonDates[i-1]);
            const curr = new Date(marathonDates[i]);
            const diffDays = Math.ceil(Math.abs(curr - prev) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currStreak++;
                if (currStreak >= 3) {
                    ironmanStreaks++;
                    currStreak = 0; // reset after hitting a streak of 3
                }
            } else {
                currStreak = 1;
            }
        }
        xp = ironmanStreaks * 3000;
    }

    // ─── SEASONAL & TURTLE ───
    else if (nodeDef.id === 'chronos_seasonal') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.status != null && String(a.status).toUpperCase() === 'WATCHING') {
                    addAnime(a, 500); // Massive XP for actively watching
                }
            });
        }
    }
    else if (nodeDef.id === 'chronos_turtle') {
        if (data.animeList) {
            data.animeList.forEach(a => {
                if (a.start_date != null && a.end_date != null && a.status != null && String(a.status).toUpperCase() === 'FINISHED') {
                    const start = new Date(a.start_date);
                    const end = new Date(a.end_date);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        const diffTime = Math.abs(end - start);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        if (diffDays >= 180) { // More than 6 months
                            addAnime(a, 100); // Bumped XP for V2
                        }
                    }
                }
            });
        }
    }

    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}
