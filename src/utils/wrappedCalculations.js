/**
 * Utility functions for computing Anime Wrapped statistics from raw user data.
 */

// Helper to translate months to Czech (Nominative)
const CZECH_MONTHS = [
    'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 
    'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
];

// Helper to translate months to Czech (Locative - after "V")
const CZECH_MONTHS_LOCATIVE = [
    'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 
    'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'
];

// Helper to translate days of week to Czech
const CZECH_DAYS = [
    'Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'
];

/**
 * Checks if the user watched the anime weekly/simulcast as it aired.
 * According to MAL rules (from INFO_5_MAL.jpg):
 * 1. started the title within 4 weeks (28 days) of beginning broadcast, and
 * 2. completed it within 2 weeks (14 days) of finishing airing.
 */
function isWeeklyWatch(a) {
    if (!a.release_date || !a.start_date || !a.end_date) return false;
    const release = new Date(a.release_date);
    const start = new Date(a.start_date.split('T')[0]);
    const end = new Date(a.end_date.split('T')[0]);
    
    // Started within 4 weeks (28 days) of airing start, allowing up to 7 days before
    const diffDaysStart = (start - release) / (1000 * 60 * 60 * 24);
    if (diffDaysStart < -7 || diffDaysStart > 28) return false;
    
    const eps = parseInt(a.episodes) || 12;
    const estimatedAiringDays = Math.max(0, eps - 1) * 7;
    const estimatedEndAiring = new Date(release);
    estimatedEndAiring.setDate(estimatedEndAiring.getDate() + estimatedAiringDays);
    
    const diffDaysEnd = (end - estimatedEndAiring) / (1000 * 60 * 60 * 24);
    // Completed within 2 weeks (14 days) of airing end, allowing up to 14 days before
    if (diffDaysEnd < -14 || diffDaysEnd > 14) return false;
    
    return true;
}


/**
 * Parses episodes string like "(3x) EP 1-3" or "EP 12" to get numeric count of episodes watched
 * @param {string} epsStr 
 * @returns {number}
 */
function parseEpisodeCount(epsStr) {
    if (!epsStr) return 0;
    const str = String(epsStr).trim();
    
    // Pattern "(3x) EP 1-3" -> returns 3
    const multiplierMatch = str.match(/^\((\d+)x\)/);
    if (multiplierMatch) {
        return parseInt(multiplierMatch[1], 10);
    }
    
    // Pattern "EP 1-12" -> returns 12
    const rangeMatch = str.match(/EP\s+(\d+)-(\d+)/i);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        return Math.max(1, end - start + 1);
    }

    // Pattern "EP 12" -> returns 1
    const singleEpMatch = str.match(/EP\s+(\d+)/i);
    if (singleEpMatch) {
        return 1;
    }

    // Generic fallback: first number found
    const genericMatch = str.match(/\d+/);
    if (genericMatch) {
        return parseInt(genericMatch[0], 10);
    }

    return 1;
}

/**
 * Parses time spent string like "72 min (1,2 hod)" to minutes
 * @param {string} timeStr 
 * @returns {number}
 */
function parseMinutes(timeStr) {
    if (!timeStr) return 0;
    const str = String(timeStr).trim();
    const match = str.match(/(\d+)\s*min/i);
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Calculates wrapped statistics for a given year.
 * @param {object[]} animeList 
 * @param {object[]} historyLog 
 * @param {object} statsJson 
 * @param {object} jikanCache 
 * @param {string} year 
 */
export function calculateWrappedData(animeList, historyLog, statsJson, jikanCache, year) {
    if (!animeList || !animeList.length) return null;
    const isAllTime = year === 'all';
    
    // ----------------------------------------------------
    // 1. FILTER DATA BY YEAR
    // ----------------------------------------------------
    const filteredAnime = animeList.filter(a => {
        if (isAllTime) return a.status === 'FINISHED';
        if (!a.end_date) return false;
        const endYear = new Date(a.end_date).getFullYear().toString();
        return a.status === 'FINISHED' && endYear === year;
    });

    const filteredHistory = historyLog.filter(h => {
        if (isAllTime) return true;
        if (!h.date) return false;
        const watchYear = new Date(h.date).getFullYear().toString();
        return watchYear === year;
    });

    // ----------------------------------------------------
    // 2. WATCH TIME & EPISODES (EXCEL STATS ALIGNMENT)
    // ----------------------------------------------------
    let totalTimeFormatted = "0 hod";
    let totalMins = 0;
    let completedCount = filteredAnime.length;
    let rewatchedCount = 0;
    let rewatchTimeFormatted = "0:00";
    let originalTimeFormatted = "0:00";
    let rewatchEpCount = 0;
    let originalEpCount = 0;
    let totalEpCount = 0;
    let avgEpDuration = 24;

    if (statsJson) {
        // Read directly from stats.json to align 100% with the excel sheets
        const yKey = isAllTime ? 'total' : year;
        totalTimeFormatted = statsJson.total_time[yKey] || "0:00";
        totalEpCount = statsJson.total_episodes[yKey] || 0;
        avgEpDuration = statsJson.avg_episode_duration[yKey] || 24;

        // Parse formatted time "1473:36" to total minutes
        const [hStr, mStr] = totalTimeFormatted.split(':');
        if (hStr) {
            totalMins = parseInt(hStr, 10) * 60 + (mStr ? parseInt(mStr, 10) : 0);
        }

        // Parse comments for rewatch breakdowns
        const timeComment = statsJson.comments?.total_time?.[yKey] || "";
        const epsComment = statsJson.comments?.total_episodes?.[yKey] || "";
        const rwListComment = statsJson.comments?.rewatch_count?.[yKey] || "";

        // Extract rewatch time
        const rewatchTimeMatch = timeComment.match(/rewatchnuto:\s*(\d+:\d+)/i);
        if (rewatchTimeMatch) rewatchTimeFormatted = rewatchTimeMatch[1];
        
        const origTimeMatch = timeComment.match(/bez rewatchů:\s*(\d+:\d+)/i);
        if (origTimeMatch) originalTimeFormatted = origTimeMatch[1];

        // Extract rewatch episodes
        const rewatchEpsMatch = epsComment.match(/rewatchnuto:\s*(\d+)\s*epizod/i);
        if (rewatchEpsMatch) rewatchEpCount = parseInt(rewatchEpsMatch[1], 10);
        
        const origEpsMatch = epsComment.match(/originálních epizod:\s*(\d+)\s*epizod/i);
        if (origEpsMatch) originalEpCount = parseInt(origEpsMatch[1], 10);

        // Count number of rewatched titles from the comment list
        if (rwListComment) {
            const matches = rwListComment.match(/\d+\.\s*Rewatch/g);
            rewatchedCount = matches ? matches.length : 0;
        }
    } else {
        // Fallback calculations if stats.json is missing
        filteredAnime.forEach(a => {
            const eps = parseInt(a.episodes) || 0;
            const dur = parseFloat(a.episode_duration) || 24;
            const rc = parseInt(a.rewatch_count) || 0;
            totalMins += parseFloat(a.total_time) || (eps * dur * (1 + rc));
            totalEpCount += eps * (1 + rc);
            if (rc > 0) {
                rewatchedCount++;
                rewatchEpCount += eps * rc;
            }
        });
        const hrs = Math.floor(totalMins / 60);
        const mns = Math.round(totalMins % 60);
        totalTimeFormatted = `${hrs}:${mns < 10 ? '0' : ''}${mns}`;
        originalEpCount = totalEpCount - rewatchEpCount;
    }

    const daysCount = isAllTime ? 365.25 * 5 : (parseInt(year) % 4 === 0 ? 366 : 365);
    const minsPerDay = totalMins / (isAllTime ? 365.25 * 2 : 365); // normalized over active years

    // Convert total watch time to days & hours Czech description
    const totalHours = totalMins / 60;
    const daysPart = Math.floor(totalHours / 24);
    const hoursPart = Math.round(totalHours % 24);
    let durationText = "";
    if (daysPart > 0) {
        if (daysPart === 1) durationText += "1 den ";
        else if (daysPart >= 2 && daysPart <= 4) durationText += `${daysPart} dny `;
        else durationText += `${daysPart} dní `;
    }
    if (hoursPart > 0) {
        if (hoursPart === 1) durationText += "1 hodinu";
        else if (hoursPart >= 2 && hoursPart <= 4) durationText += `${hoursPart} hodiny`;
        else durationText += `${hoursPart} hodin`;
    }
    if (!durationText) durationText = "0 hodin";

    // ----------------------------------------------------
    // 3. PEAK MONTH (SLIDE 4)
    // ----------------------------------------------------
    const monthStats = Array(12).fill(0);
    filteredHistory.forEach(h => {
        if (!h.date) return;
        const month = new Date(h.date).getMonth();
        monthStats[month] += parseEpisodeCount(h.episodes);
    });

    let peakMonthIdx = 0;
    let peakMonthEpCount = 0;
    monthStats.forEach((count, idx) => {
        if (count > peakMonthEpCount) {
            peakMonthEpCount = count;
            peakMonthIdx = idx;
        }
    });
    const peakMonthName = CZECH_MONTHS[peakMonthIdx];
    const peakMonthLocative = CZECH_MONTHS_LOCATIVE[peakMonthIdx];

    // ----------------------------------------------------
    // 4. FAVORITE DAY OF WEEK (SLIDE 5)
    // ----------------------------------------------------
    const dayStats = Array(7).fill(0);
    filteredHistory.forEach(h => {
        if (!h.date) return;
        const day = new Date(h.date).getDay();
        dayStats[day] += parseEpisodeCount(h.episodes);
    });

    let activeDayIdx = 0;
    let activeDayEpCount = 0;
    let totalHistoryEps = 0;
    dayStats.forEach((count, idx) => {
        totalHistoryEps += count;
        if (count > activeDayEpCount) {
            activeDayEpCount = count;
            activeDayIdx = idx;
        }
    });
    const activeDayName = CZECH_DAYS[activeDayIdx];
    const activeDayRatio = totalHistoryEps > 0 ? (activeDayEpCount / totalHistoryEps) : 0;

    // ----------------------------------------------------
    // 5. UNIQUE DAYS WATCHED (SLIDE 6) & HEATMAP
    // ----------------------------------------------------
    const uniqueDates = new Set();
    const dailyTotals = {};

    filteredHistory.forEach(h => {
        if (!h.date) return;
        const dateStr = h.date.split('T')[0];
        uniqueDates.add(dateStr);
        
        const epMatch = h.episodes?.match(/\d+/);
        const eps = epMatch ? parseInt(epMatch[0], 10) : 0;
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + eps;
    });

    const uniqueDaysCount = uniqueDates.size;
    const totalYearDays = isAllTime ? 365 : daysCount;
    const uniqueDaysRatio = totalYearDays > 0 ? Math.round((uniqueDaysCount / totalYearDays) * 100) : 0;

    // Build calendar grid data for Github-like grid
    const calendarGrid = [];
    const heatmapColumns = [];

    if (!isAllTime) {
        const startOfYear = new Date(`${year}-01-01`);
        const endOfYear = new Date(`${year}-12-31`);

        // 1. Flat calendar grid for Slide 6
        for (let d = new Date(startOfYear); d <= endOfYear; d.setDate(d.getDate() + 1)) {
            const dStr = d.toISOString().split('T')[0];
            const eps = dailyTotals[dStr] || 0;
            calendarGrid.push({
                date: dStr,
                active: eps > 0,
                eps: eps,
                dayOfWeek: d.getDay()
            });
        }

        // 2. Structured heatmap columns (representing weeks, starting on Monday)
        const startHeatmap = new Date(startOfYear);
        const dayOfWeek = startHeatmap.getDay(); // 0 is Sun, 1 is Mon...
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startHeatmap.setDate(startHeatmap.getDate() - diff);

        const endHeatmap = new Date(endOfYear);
        const endDayOfWeek = endHeatmap.getDay();
        const endDiff = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
        endHeatmap.setDate(endHeatmap.getDate() + endDiff);

        let currDate = new Date(startHeatmap);
        while (currDate <= endHeatmap) {
            const col = [];
            for (let d = 0; d < 7; d++) {
                if (currDate > endHeatmap) break;
                const pad = (n) => n.toString().padStart(2, '0');
                const dStr = `${currDate.getFullYear()}-${pad(currDate.getMonth() + 1)}-${pad(currDate.getDate())}`;
                
                const isOtherYear = !isAllTime && currDate.getFullYear().toString() !== year;
                col.push({
                    date: new Date(currDate),
                    dateStr: dStr,
                    eps: dailyTotals[dStr] || 0,
                    isOtherYear: isOtherYear
                });
                currDate.setDate(currDate.getDate() + 1);
            }
            if (col.length > 0) {
                heatmapColumns.push(col);
            }
        }
    } else {
        // For All-Time, build the last 364 days leading to today
        const endHeatmap = new Date();
        endHeatmap.setHours(23, 59, 59, 999);
        const startHeatmap = new Date(endHeatmap);
        startHeatmap.setDate(startHeatmap.getDate() - 364);

        const dayOfWeek = startHeatmap.getDay();
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startHeatmap.setDate(startHeatmap.getDate() - diff);

        let currDate = new Date(startHeatmap);
        while (currDate <= endHeatmap) {
            const col = [];
            for (let d = 0; d < 7; d++) {
                if (currDate > endHeatmap) break;
                const pad = (n) => n.toString().padStart(2, '0');
                const dStr = `${currDate.getFullYear()}-${pad(currDate.getMonth() + 1)}-${pad(currDate.getDate())}`;
                
                col.push({
                    date: new Date(currDate),
                    dateStr: dStr,
                    eps: dailyTotals[dStr] || 0
                });
                currDate.setDate(currDate.getDate() + 1);
            }
            if (col.length > 0) {
                heatmapColumns.push(col);
            }
        }
    }

    // ----------------------------------------------------
    // 6. SCORE DISTRIBUTION & AVERAGE (SLIDE 7)
    // ----------------------------------------------------
    const ratedAnime = filteredAnime.filter(a => a.rating && !isNaN(parseFloat(a.rating)));
    const avgScore = ratedAnime.length > 0
        ? parseFloat((ratedAnime.reduce((sum, a) => sum + parseFloat(a.rating), 0) / ratedAnime.length).toFixed(2))
        : 0;

    // Minimum rating is 5 (worst rating scale for user)
    const scoreDistribution = { 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
    ratedAnime.forEach(a => {
        const r = Math.round(parseFloat(a.rating));
        if (r >= 5 && r <= 10) {
            scoreDistribution[r]++;
        }
    });

    // ----------------------------------------------------
    // 7. FRANCHISE WATCH TIME (SLIDE 11 & 12)
    // ----------------------------------------------------
    const franchises = {};
    filteredAnime.forEach(a => {
        const key = a.series || a.name;
        if (!franchises[key]) {
            franchises[key] = {
                name: key,
                totalMins: 0,
                episodes: 0,
                malUrl: a.mal_url,
                thumbnail: a.thumbnail
            };
        }
        const eps = parseInt(a.episodes) || 0;
        const dur = parseFloat(a.episode_duration) || 24;
        // Exclude rewatches from Top Series watch time and episode count
        const mins = eps * dur;
        
        franchises[key].totalMins += mins;
        franchises[key].episodes += eps;
    });

    const franchiseList = Object.values(franchises)
        .map(f => {
            const hours = f.totalMins / 60;
            return {
                ...f,
                hours: parseFloat(hours.toFixed(1)),
                days: parseFloat((hours / 24).toFixed(2))
            };
        })
        .sort((a, b) => b.totalMins - a.totalMins);

    const topFranchise = franchiseList[0] || null;
    const topFranchisesList = franchiseList.slice(0, 5);

    // ----------------------------------------------------
    // 8. QUICKEST BINGES (SLIDE 13 & 14)
    // ----------------------------------------------------
    const binges = [];
    filteredAnime.forEach(a => {
        if (a.status !== 'FINISHED' || !a.start_date || !a.end_date) return;
        const start = new Date(a.start_date.split('T')[0]);
        const end = new Date(a.end_date.split('T')[0]);
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        if (days <= 0) return;
        
        const eps = parseInt(a.episodes) || 0;
        const dur = parseFloat(a.episode_duration) || 24;
        // Exclude rewatches from binge statistics
        const durationMins = eps * dur;

        // Binge definition: total duration > 180 mins and average watch time >= 77 mins/day
        const minsPerDayBinge = durationMins / days;
        if (durationMins > 180 && minsPerDayBinge >= 77) {
            binges.push({
                name: a.name,
                days,
                episodes: eps,
                hoursPerDay: parseFloat((minsPerDayBinge / 60).toFixed(2)),
                totalHours: parseFloat((durationMins / 60).toFixed(1)),
                malUrl: a.mal_url,
                thumbnail: a.thumbnail
            });
        }
    });

    const bingeList = binges.sort((a, b) => b.hoursPerDay - a.hoursPerDay);
    const quickestBinge = bingeList[0] || null;
    const topBingesList = bingeList.slice(0, 5);

    // ----------------------------------------------------
    // 9. RECENCY BIAS & SEASONAL WARRIOR (SLIDE 15)
    // ----------------------------------------------------
    let recencyCount = 0;
    let seasonalCount = 0;
    let totalSeriesCount = filteredAnime.filter(a => a.type === 'TV' || a.type === 'ONA').length;

    filteredAnime.forEach(a => {
        if (!a.release_date) return;
        const releaseYear = new Date(a.release_date).getFullYear().toString();
        
        // Recency: aired in the current year
        const isRecent = releaseYear === year;
        if (isRecent) {
            recencyCount++;
        }

        // Seasonal Warrior: watched weekly/simulcast as it aired
        if (isRecent && isWeeklyWatch(a)) {
            seasonalCount++;
        }
    });

    const recencyBiasRatio = totalSeriesCount > 0 ? Math.round((recencyCount / totalSeriesCount) * 100) : 0;
    const seasonalWarriorRatio = recencyCount > 0 ? Math.round((seasonalCount / recencyCount) * 100) : 0;

    // ----------------------------------------------------
    // 10. HOT TAKES, UNDER-HYPED, OVER-HYPED (SLIDE 8)
    // ----------------------------------------------------
    // Calculate difference between user rating and community score.
    // jikanCache is key-value where key is mal_id and value has episodes, or read from localStorage
    const userDifferences = [];

    filteredAnime.forEach(a => {
        if (!a.rating || !a.mal_url) return;
        const malId = a.mal_url.match(/\/anime\/(\d+)/)?.[1];
        if (!malId) return;

        // Try to get score from JikanCache or local storage
        let communityScore = null;
        
        // 1. Check local storage cache
        const localCached = localStorage.getItem(`jikan_anime_info_${malId}`);
        if (localCached) {
            try {
                communityScore = JSON.parse(localCached).score;
            } catch {}
        }
        
        // 2. Check memory/jikanCache file
        if (!communityScore && jikanCache && jikanCache.episode_lists && jikanCache.episode_lists[malId]) {
            const listData = jikanCache.episode_lists[malId];
            if (listData.episodes && listData.episodes.length > 0) {
                // If it's a Movie/Special, it might have score in the synthetic episode
                const firstEp = listData.episodes[0];
                if (listData.episodes.length === 1 && (firstEp.title === 'Film' || firstEp.title === 'OVA' || firstEp.title === 'Speciál')) {
                    communityScore = firstEp.score;
                } else {
                    // Average the scores of all episodes
                    const ratedEps = listData.episodes.filter(e => e.score !== null);
                    if (ratedEps.length > 0) {
                        communityScore = ratedEps.reduce((s, e) => s + e.score, 0) / ratedEps.length;
                    }
                }
            }
        }

        if (communityScore) {
            const userScore = parseFloat(a.rating);
            const diff = userScore - communityScore;
            userDifferences.push({
                name: a.name,
                userScore,
                communityScore: parseFloat(communityScore.toFixed(2)),
                diff: parseFloat(diff.toFixed(2)),
                malUrl: a.mal_url,
                thumbnail: a.thumbnail
            });
        }
    });

    // Hot take: absolute diff is high, user scored lower than community usually, or just largest deviation
    // MAL formula: scored lower than 75% of community, meaning negative diff
    const hotTakes = [...userDifferences]
        .sort((a, b) => a.diff - b.diff) // biggest negative differences first
        .slice(0, 10);

    // Under-hyped: user score is high (>=8), community is lower, positive diff
    const underHyped = [...userDifferences]
        .filter(x => x.userScore >= 8)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3);

    // Over-hyped: user score is low (<=6), community is higher, negative diff
    const overHyped = [...userDifferences]
        .filter(x => x.userScore <= 6)
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 3);

    // ----------------------------------------------------
    // 11. GENRE BIAS & DEVIANT (SLIDE 9 & 10)
    // ----------------------------------------------------
    // We compare user's genre representation in the current year with the user's ALL TIME representation
    // to calculate deviation/bias, or use fixed baseline if All Time
    const userGenreCounts = {};
    let totalGenresCount = 0;
    
    filteredAnime.forEach(a => {
        if (!a.genres) return;
        a.genres.split(';').forEach(g => {
            const genre = g.trim();
            if (genre) {
                userGenreCounts[genre] = (userGenreCounts[genre] || 0) + 1;
                totalGenresCount++;
            }
        });
    });

    const allTimeGenreCounts = {};
    let allTimeGenresTotal = 0;
    animeList.forEach(a => {
        if (!a.genres) return;
        a.genres.split(';').forEach(g => {
            const genre = g.trim();
            if (genre) {
                allTimeGenreCounts[genre] = (allTimeGenreCounts[genre] || 0) + 1;
                allTimeGenresTotal++;
            }
        });
    });

    const genreBias = [];
    Object.entries(userGenreCounts).forEach(([genre, count]) => {
        const userRatio = count / totalGenresCount;
        const allTimeRatio = (allTimeGenreCounts[genre] || 1) / (allTimeGenresTotal || 1);
        // Simple affinity factor
        const deviation = userRatio - allTimeRatio;
        genreBias.push({
            genre,
            count,
            ratio: Math.round(userRatio * 100),
            deviation: parseFloat(deviation.toFixed(4))
        });
    });

    const topGenres = [...genreBias].sort((a, b) => b.deviation - a.deviation).slice(0, 5);
    const bottomGenres = [...genreBias].sort((a, b) => a.deviation - b.deviation).slice(0, 5);

    // ----------------------------------------------------
    // 12. SEASONS BREAKDOWN (SLIDES 16-19)
    // ----------------------------------------------------
    const seasonsData = {
        Winter: { name: 'Zima', count: 0, total: 0, sumScore: 0, items: [] },
        Spring: { name: 'Jaro', count: 0, total: 0, sumScore: 0, items: [] },
        Summer: { name: 'Léto', count: 0, total: 0, sumScore: 0, items: [] },
        Fall: { name: 'Podzim', count: 0, total: 0, sumScore: 0, items: [] }
    };

    filteredAnime.forEach(a => {
        if (!a.release_date) return;
        const date = new Date(a.release_date);
        
        // Pro roční období uvažujeme POUZE anime vydané v daném roce (new releases)
        if (!isAllTime && date.getFullYear().toString() !== year) return;



        const month = date.getMonth(); // 0-11
        
        let seasonKey = 'Winter';
        if (month >= 2 && month <= 4) seasonKey = 'Spring'; // Mar-May
        else if (month >= 5 && month <= 7) seasonKey = 'Summer'; // Jun-Aug
        else if (month >= 8 && month <= 10) seasonKey = 'Fall'; // Sep-Nov
        
        const score = parseFloat(a.rating);
        seasonsData[seasonKey].total++;
        if (!isNaN(score)) {
            seasonsData[seasonKey].count++;
            seasonsData[seasonKey].sumScore += score;
        }
        seasonsData[seasonKey].items.push(a);
    });

    let favoriteSeasonKey = 'Winter';
    let highestSeasonAvg = 0;

    Object.keys(seasonsData).forEach(key => {
        const s = seasonsData[key];
        const avg = s.count > 0 ? parseFloat((s.sumScore / s.count).toFixed(2)) : 0;
        s.avgScore = avg;
        s.topAnime = s.items
            .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
            .slice(0, 10);
            
        if (avg > highestSeasonAvg && s.total >= 2) { // must watch at least 2 to be favorite
            highestSeasonAvg = avg;
            favoriteSeasonKey = key;
        }
    });

    if (highestSeasonAvg === 0) {
        // Fallback to the one with most watched titles
        let maxWatched = 0;
        Object.keys(seasonsData).forEach(key => {
            if (seasonsData[key].total > maxWatched) {
                maxWatched = seasonsData[key].total;
                favoriteSeasonKey = key;
            }
        });
    }

    seasonsData[favoriteSeasonKey].isFavorite = true;

    // ----------------------------------------------------
    // 13. TOP 5 ANIME OF THE YEAR (FOR RECAP CARD)
    // ----------------------------------------------------
    const topAnime = [...ratedAnime]
        .sort((a, b) => {
            // Sort by rating desc, then by user-community difference (hidden gem factor), then by total_time desc
            const scoreDiff = parseFloat(b.rating) - parseFloat(a.rating);
            if (scoreDiff !== 0) return scoreDiff;
            
            // Poměr k počtu lidí / skryté klenoty: čím větší diff (user > community), tím výše
            const aDiffObj = userDifferences.find(ud => ud.name === a.name);
            const bDiffObj = userDifferences.find(ud => ud.name === b.name);
            const aDiff = aDiffObj ? aDiffObj.diff : 0;
            const bDiff = bDiffObj ? bDiffObj.diff : 0;
            if (bDiff !== aDiff) return bDiff - aDiff;
            
            return parseFloat(b.total_time || 0) - parseFloat(a.total_time || 0);
        })
        .slice(0, 10);

    return {
        year,
        totalTimeFormatted,
        totalMins,
        durationText,
        minsPerDay: Math.round(minsPerDay),
        completedCount,
        rewatchedCount,
        rewatchTimeFormatted,
        originalTimeFormatted,
        rewatchEpCount,
        originalEpCount,
        totalEpCount,
        avgEpDuration: parseFloat(Number(avgEpDuration).toFixed(2)),
        
        peakMonthName,
        peakMonthLocative,
        peakMonthEpCount,
        activeDayName,
        activeDayRatio: Math.round(activeDayRatio * 100),
        uniqueDaysCount,
        uniqueDaysRatio,
        calendarGrid,
        heatmapColumns,
        
        avgScore,
        scoreDistribution,
        hotTakes,
        underHyped,
        overHyped,
        
        topGenres,
        bottomGenres,
        
        topFranchise,
        topFranchisesList,
        
        quickestBinge,
        topBingesList,
        
        totalSeries: totalSeriesCount,
        recencyBiasRatio,
        seasonalWarriorRatio,
        
        seasons: seasonsData,
        favoriteSeason: seasonsData[favoriteSeasonKey]?.name || "Zima",
        topAnime
    };
}
