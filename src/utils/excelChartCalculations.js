// utils/excelChartCalculations.js

export function calculateExcelChartsData(animeList, historyLog) {
    if (!animeList || !animeList.length) return null;

    // Helper: Excel sum function for ratings
    const avgScore = (items) => {
        const rated = items.filter(a => a.rating && !isNaN(parseFloat(a.rating)));
        if (!rated.length) return 0;
        return rated.reduce((s, a) => s + parseFloat(a.rating), 0) / rated.length;
    };

    // 1. GrafTypuPop (Pie) & 2. GrafTypuKombi & 3. GrafTypuDist
    const typesDist = {};
    const typeRatingStats = {};
    const scoreMatrix = {}; // For Stacked Dist

    animeList.forEach(a => {
        if (!a.type) return;
        const t = a.type;
        typesDist[t] = (typesDist[t] || 0) + 1;

        if (!typeRatingStats[t]) {
            typeRatingStats[t] = { count: 0, sumRating: 0, totalHours: 0 };
        }
        
        typeRatingStats[t].count++;
        
        if (a.rating && !isNaN(parseFloat(a.rating))) {
            typeRatingStats[t].sumRating += parseFloat(a.rating);
            
            // Score tracking 1-10 for GrafTypuDist
            const r = Math.round(parseFloat(a.rating));
            if (r >= 1 && r <= 10) {
                if (!scoreMatrix[r]) scoreMatrix[r] = {};
                scoreMatrix[r][t] = (scoreMatrix[r][t] || 0) + 1;
            }
        }
        
        const eps = parseInt(a.episodes) || 0;
        const dur = parseFloat(a.episode_duration) || 24;
        const rc = parseInt(a.rewatch_count) || 0;
        const hours = (parseFloat(a.total_time) || (eps * dur * (1 + rc))) / 60;
        typeRatingStats[t].totalHours += hours;
    });

    const typesOrder = Object.keys(typesDist).sort((a,b) => typesDist[b] - typesDist[a]);

    // 4. GrafStudiiPop (Pie) & 5. GrafStudiiBest (Bar)
    let studios = {};
    animeList.forEach(a => {
        if (a.studio) {
            a.studio.split(';').forEach(s => {
                const std = s.trim();
                if (std && std.length < 50) {
                    if (!studios[std]) studios[std] = { count: 0, ratings: [] };
                    studios[std].count++;
                    const r = parseFloat(a.rating);
                    if (!isNaN(r)) studios[std].ratings.push(r);
                }
            });
        }
    });

    // Excel threshold logic: < 4 -> "Ostatní Studia"
    const studiosPie = { 'Ostatní Studia': 0 };
    Object.keys(studios).forEach(k => {
        if (studios[k].count < 4) {
            studiosPie['Ostatní Studia'] += studios[k].count;
        } else {
            studiosPie[k] = studios[k].count;
        }
    });

    const studiosBest = Object.keys(studios)
        .filter(k => studios[k].count >= 4)
        .map(k => ({
             name: k, 
             avg: studios[k].ratings.reduce((s, x)=>s+x, 0) / studios[k].ratings.length || 0 
        }))
        .sort((a,b) => b.avg - a.avg)
        .slice(0, 10);

    // 6. GrafAnimeSezony & 7. GrafAnimeVeku & 8. GrafPrumerVeku
    const seasons = { 'Winter': 0, 'Spring': 0, 'Summer': 0, 'Fall': 0 };
    const ageGroups = { '0–2 roky': { count: 0, r: [] }, '2–5 let': { count:0, r:[] }, '5–15 let': {count:0,r:[]}, '15+ let': {count:0,r:[]} };
    
    const now = new Date();
    
    animeList.forEach(a => {
        // Seasons
        if (a.release_date) {
            const d = new Date(a.release_date);
            const m = d.getMonth();
            if (m >= 0 && m <= 2) seasons['Winter']++;
            else if (m >= 3 && m <= 5) seasons['Spring']++;
            else if (m >= 6 && m <= 8) seasons['Summer']++;
            else seasons['Fall']++;
            
            // Age
            const diffYears = (now - d) / (1000 * 60 * 60 * 24 * 365.25);
            const r = parseFloat(a.rating);
            const validR = !isNaN(r);
            
            if (diffYears <= 2) { 
                ageGroups['0–2 roky'].count++; 
                if (validR) ageGroups['0–2 roky'].r.push(r);
            }
            else if (diffYears <= 5) { 
                ageGroups['2–5 let'].count++; 
                if (validR) ageGroups['2–5 let'].r.push(r);
            }
            else if (diffYears <= 15) { 
                ageGroups['5–15 let'].count++; 
                if (validR) ageGroups['5–15 let'].r.push(r);
            }
            else { 
                ageGroups['15+ let'].count++; 
                if (validR) ageGroups['15+ let'].r.push(r);
            }
        }
    });

    const ageAvg = {};
    Object.keys(ageGroups).forEach(k => {
        ageAvg[k] = ageGroups[k].r.length ? (ageGroups[k].r.reduce((a,b)=>a+b,0) / ageGroups[k].r.length).toFixed(2) : 0;
    });

    // 9. AnimeHodnoceniVCaseGraf (Line combo)
    const yearStats = {};
    animeList.forEach(a => {
        if (a.release_date) {
            const y = new Date(a.release_date).getFullYear();
            if (y > 1960 && y <= now.getFullYear()) {
                if (!yearStats[y]) yearStats[y] = { count: 0, r: [] };
                yearStats[y].count++;
                const r = parseFloat(a.rating);
                if (!isNaN(r)) yearStats[y].r.push(r);
            }
        }
    });
    
    const allYears = Object.keys(yearStats).sort((a,b)=>a-b);
    let decadeRunning = { count: 0, sum: 0 };
    let lastDecadeLabel = null;
    const decadalAverages = {};
    
    allYears.forEach(y => {
        const dec = Math.floor(y / 10) * 10;
        if (lastDecadeLabel !== dec) {
            decadeRunning = { count: 0, sum: 0 };
            lastDecadeLabel = dec;
        }
        decadeRunning.count += yearStats[y].r.length;
        decadeRunning.sum += yearStats[y].r.reduce((a,b)=>a+b,0);
        decadalAverages[y] = decadeRunning.count ? (decadeRunning.sum / decadeRunning.count).toFixed(2) : null;
    });

    const comboRatingByYear = allYears.map(y => {
        const ys = yearStats[y];
        return {
            year: y,
            count: ys.count,
            annualAvg: ys.r.length ? (ys.r.reduce((a,b)=>a+b,0) / ys.r.length).toFixed(2) : null,
            decadeAvg: decadalAverages[y]
        };
    });

    // 10. GrafTematPop & 11. GrafTematBest (>= 4 limit)
    const themes = {};
    animeList.forEach(a => {
        if (a.themes && a.themes !== 'X') {
            a.themes.split(';').forEach(t => {
                const theme = t.trim();
                if (theme) {
                    if (!themes[theme]) themes[theme] = { count: 0, r: [] };
                    themes[theme].count++;
                    const r = parseFloat(a.rating);
                    if (!isNaN(r)) themes[theme].r.push(r);
                }
            });
        }
    });

    const topThemes = Object.keys(themes).sort((a,b)=>themes[b].count - themes[a].count).slice(0,10);
    const themesBest = Object.keys(themes).filter(t => themes[t].count >= 4).map(t => ({
        name: t,
        avg: themes[t].r.reduce((a,b)=>a+b,0)/themes[t].r.length || 0
    })).sort((a,b)=>b.avg - a.avg).slice(0, 10);

    // 12. GrafZanru & 13. GrafZanruBest
    const genres = {};
    animeList.forEach(a => {
        if (a.genres) {
            a.genres.split(';').forEach(g => {
                const genre = g.trim();
                if (genre) {
                    if (!genres[genre]) genres[genre] = { count: 0, r: [] };
                    genres[genre].count++;
                    const r = parseFloat(a.rating);
                    if (!isNaN(r)) genres[genre].r.push(r);
                }
            });
        }
    });

    const topGenres = Object.keys(genres).sort((a,b)=>genres[b].count - genres[a].count);
    const genresBest = Object.keys(genres).filter(g => genres[g].count >= 4).map(g => ({
        name: g,
        avg: genres[g].r.reduce((a,b)=>a+b,0)/genres[g].r.length || 0
    })).sort((a,b)=>b.avg - a.avg).slice(0, 10);


    // 14. GrafPrubehHodnoceni (Chronological rating timeline)
    // We sort anime by their finish date (default order usually is chronological or we can sort by date_finished if available, or just use the log)
    // We will just use the index if it's already chronological, but let's look at `log` or just reverse `animeList` (assuming newest is at top).
    // The user's list usually prepends. Let's sort by release_year or id to be safe, but a timeline is best with an index.
    const validRatingsList = [...animeList].filter(a => !isNaN(parseFloat(a.rating))).reverse();
    
    const ratingTimeline = validRatingsList.map((a, i) => {
        return {
            x: i + 1,
            title: a.name_cz || a.name_en,
            rating: parseFloat(a.rating)
        };
    });
    
    // Calculate moving average for timeline
    const movingAvgPeriod = 10;
    const timelineWithAvg = ratingTimeline.map((item, i, arr) => {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - movingAvgPeriod + 1); j <= i; j++) {
            sum += arr[j].rating;
            count++;
        }
        return {
            ...item,
            movingAvg: count > 0 ? parseFloat((sum / count).toFixed(2)) : item.rating
        };
    });

    // 15. GrafHodnoceniVsEpizody
    const epBuckets = [
        { label: '1', min: 1, max: 1, count: 0, sum: 0 },
        { label: '2-13', min: 2, max: 13, count: 0, sum: 0 },
        { label: '14-26', min: 14, max: 26, count: 0, sum: 0 },
        { label: '27-39', min: 27, max: 39, count: 0, sum: 0 },
        { label: '40-52', min: 40, max: 52, count: 0, sum: 0 },
        { label: '53+', min: 53, max: 99999, count: 0, sum: 0 }
    ];
    
    animeList.forEach(a => {
        const rating = parseFloat(a.rating);
        const eps = parseInt(String(a.episodes).replace(/[^\d]/g, ''));
        if (!isNaN(rating) && !isNaN(eps) && eps > 0) {
            const bucket = epBuckets.find(b => eps >= b.min && eps <= b.max);
            if (bucket) {
                bucket.count++;
                bucket.sum += rating;
            }
        }
    });
    
    const ratingByEpisodes = epBuckets.map(b => ({
        label: b.label,
        avg: b.count > 0 ? parseFloat((b.sum / b.count).toFixed(2)) : 0,
        count: b.count
    }));

    // ── Dubbing Charts Data ──
    const dubStats = {};
    animeList.forEach(a => {
        const dubs = a.dub ? a.dub.split(';').map(d => d.trim()).filter(Boolean) : ['Neznámý'];
        const rating = parseFloat(a.rating) || 0;
        const totalTime = parseFloat(a.total_time) || 0;
        dubs.forEach(dub => {
            if (!dubStats[dub]) dubStats[dub] = { count: 0, sumRating: 0, ratedCount: 0, totalMinutes: 0 };
            dubStats[dub].count++;
            dubStats[dub].totalMinutes += totalTime;
            if (rating > 0) {
                dubStats[dub].sumRating += rating;
                dubStats[dub].ratedCount++;
            }
        });
    });

    const dubCount = Object.entries(dubStats)
        .map(([label, s]) => ({ label, count: s.count }))
        .sort((a, b) => b.count - a.count);

    const dubAvgRating = Object.entries(dubStats)
        .filter(([, s]) => s.ratedCount >= 2)
        .map(([label, s]) => ({ label, avg: parseFloat((s.sumRating / s.ratedCount).toFixed(2)) }))
        .sort((a, b) => b.avg - a.avg);

    const dubTotalTime = Object.entries(dubStats)
        .map(([label, s]) => ({ label, hours: parseFloat((s.totalMinutes / 60).toFixed(1)) }))
        .sort((a, b) => b.hours - a.hours);

    // ── AniList Tags Data (Weighted Average Rating per VBA) ──
    // VBA: weight = rank/100; score = Σ(rating × weight) / Σ(weight); filter: sumWeights >= 3.0
    const tagWeighted = {};
    const tagRelevance = {}; // For word cloud — total rank sum
    const tagDescriptions = {}; // tag name → description text
    const tagAnimeMap = {}; // tag name → [{name, rank}]
    animeList.forEach(a => {
        if (!a.tags) return;
        const rating = parseFloat(a.rating);
        const isFinished = a.end_date && a.end_date !== 'X' && a.end_date !== '';
        a.tags.split(';').forEach(tagEntry => {
            const parts = tagEntry.split(':');
            if (parts.length >= 2) {
                const tagName = parts[0].trim();
                const rank = parseInt(parts[1]) || 0;
                const description = parts.length >= 3 ? parts.slice(2).join(':').trim() : '';
                if (!tagName || rank <= 0) return;
                // Store description and anime mapping for tag selector UI
                if (description && !tagDescriptions[tagName]) tagDescriptions[tagName] = description;
                if (!tagAnimeMap[tagName]) tagAnimeMap[tagName] = [];
                tagAnimeMap[tagName].push({ name: a.name_cz || a.name || a.name_en, rank });
                // Word cloud: sum all ranks regardless of rating
                if (!tagRelevance[tagName]) tagRelevance[tagName] = 0;
                tagRelevance[tagName] += rank;
                // Weighted avg: only finished anime with valid rating
                if (isFinished && !isNaN(rating) && rating >= 1 && rating <= 10) {
                    const weight = rank / 100;
                    if (!tagWeighted[tagName]) tagWeighted[tagName] = { sumWeights: 0, sumWeightedRatings: 0 };
                    tagWeighted[tagName].sumWeights += weight;
                    tagWeighted[tagName].sumWeightedRatings += rating * weight;
                }
            }
        });
    });

    const anilistTags = Object.entries(tagWeighted)
        .filter(([, s]) => s.sumWeights >= 3.0)
        .map(([label, s]) => ({ label, score: parseFloat((s.sumWeightedRatings / s.sumWeights).toFixed(2)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    // Word cloud data — relevance score (total rank sum), min 100
    const tagCloud = Object.entries(tagRelevance)
        .filter(([, score]) => score >= 100)
        .map(([label, score]) => ({ label, score }))
        .sort((a, b) => b.score - a.score);

    // All tags with descriptions for tag selector UI
    const allTags = Object.keys(tagRelevance)
        .sort((a, b) => a.localeCompare(b, 'cs'))
        .map(label => ({
            label,
            description: tagDescriptions[label] || '',
            animeList: (tagAnimeMap[label] || []).sort((a, b) => b.rank - a.rank),
            relevance: tagRelevance[label]
        }));

    // ── Latest Watched (all anime with valid end_date, sorted by end_date desc) ──
    // VBA: filter IsDate(end), sort by end desc, show start/end/totalTime/rating
    const latestWatched = [...animeList]
        .filter(a => a.end_date && a.end_date !== 'X' && a.end_date !== '' && !isNaN(new Date(a.end_date).getTime()))
        .sort((a, b) => new Date(b.end_date) - new Date(a.end_date))
        .map(a => ({
            name: a.name,
            startDate: a.start_date || null,
            endDate: a.end_date,
            totalTime: parseFloat(a.total_time) || 0, // minutes
            rating: parseFloat(a.rating) || null
        }));

    // ── Longest Series (aggregated by series field) ──
    // VBA: group by series name (from comment), aggregate: totalMinutes, totalEps, sumRating, countRated, parts
    const seriesAgg = {};
    animeList.forEach(a => {
        const series = a.series || a.name;
        const eps = parseInt(a.episodes) || 0;
        const epDur = parseFloat(a.episode_duration) || 0;
        const totalMin = eps * epDur;
        const rating = parseFloat(a.rating);
        if (!seriesAgg[series]) seriesAgg[series] = { totalMinutes: 0, totalEps: 0, sumRating: 0, countRated: 0, parts: 0 };
        seriesAgg[series].totalMinutes += totalMin;
        seriesAgg[series].totalEps += eps;
        seriesAgg[series].parts++;
        if (!isNaN(rating) && rating > 0) {
            seriesAgg[series].sumRating += rating;
            seriesAgg[series].countRated++;
        }
    });
    const longestSeries = Object.entries(seriesAgg)
        .map(([name, s]) => ({
            name,
            hours: parseFloat((s.totalMinutes / 60).toFixed(1)),
            days: parseFloat((s.totalMinutes / 60 / 24).toFixed(1)),
            totalEps: s.totalEps,
            parts: s.parts,
            avgRating: s.countRated > 0 ? parseFloat((s.sumRating / s.countRated).toFixed(1)) : null
        }))
        .sort((a, b) => b.hours - a.hours);

    // ── Fastest Binge ──
    // VBA: totalMin = eps * epDuration; must be > 180; days = DateDiff("d",start,end)+1; tempo >= 77 min/day
    const fastestBinge = animeList
        .map(a => {
            const eps = parseInt(a.episodes) || 0;
            const epDur = parseFloat(a.episode_duration) || 0;
            const totalMin = eps * epDur;
            if (totalMin <= 180) return null;
            const start = a.start_date ? new Date(a.start_date) : null;
            const end = a.end_date && a.end_date !== 'X' ? new Date(a.end_date) : null;
            if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
            // VBA: DateDiff("d", start, end) + 1 — includes both endpoints
            const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
            const minPerDay = totalMin / days;
            if (minPerDay < 77) return null;
            return {
                name: a.name,
                days,
                episodes: eps,
                totalHours: parseFloat((totalMin / 60).toFixed(1)),
                minPerDay: Math.round(minPerDay)
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.minPerDay - a.minPerDay);

    // ── Airing Anime (for Status group) ──
    const airingAnime = animeList
        .filter(a => a.status === 'AIRING!')
        .map(a => ({
            name: a.name,
            watchedEps: parseInt(a.watched_episodes) || parseInt(a.episodes) || 0,
            startDate: a.start_date || null
        }))
        .sort((a, b) => {
            if (!a.startDate || !b.startDate) return 0;
            return new Date(b.startDate) - new Date(a.startDate);
        });

    return {
        typesPie: typesOrder.map(k => ({ label: k, count: typesDist[k] })),
        typesKombi: typesOrder.map(k => ({ label: k, hours: typeRatingStats[k].totalHours, rating: typeRatingStats[k].count ? typeRatingStats[k].sumRating/typeRatingStats[k].count : 0 })),
        typesDistScoreMatrix: scoreMatrix,
        studiosPie,
        studiosBest,
        seasons,
        ageGroups,
        ageAvg,
        comboRatingByYear,
        topThemes: topThemes.map(t => ({ label: t, count: themes[t].count })),
        themesBest,
        topGenres: topGenres.map(g => ({ label: g, count: genres[g].count })),
        genresBest,
        ratingTimeline: timelineWithAvg,
        ratingByEpisodes,
        // New groups data
        dubCount,
        dubAvgRating,
        dubTotalTime,
        anilistTags,
        tagCloud,
        allTags,
        tagDescriptions,
        latestWatched,
        longestSeries,
        fastestBinge,
        airingAnime
    };
}

