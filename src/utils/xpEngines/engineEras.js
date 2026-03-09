/**
 * Computes XP for Release Eras and Critic Ratings domains.
 */

export function calculateErasXP(nodeDef, data) {
    let xp = 0;

    const countReleasedInYearRange = (start, end) => {
        let count = 0;
        if (data.animeList) {
            data.animeList.forEach(anime => {
                if (anime.release_date) {
                    // Extract year from isoformat string or whatever it is
                    const yearStr = String(anime.release_date).substring(0, 4);
                    const year = parseInt(yearStr);
                    if (!isNaN(year) && year >= start && year <= end) {
                        count += 1;
                    }
                }
            });
        }
        return count * 1000; // 1000 XP per anime in that era
    };

    if (nodeDef.id === 'era_80s90s') xp = countReleasedInYearRange(1980, 1999);
    else if (nodeDef.id === 'era_2000s') xp = countReleasedInYearRange(2000, 2009);
    else if (nodeDef.id === 'era_2010s') xp = countReleasedInYearRange(2010, 2019);
    else if (nodeDef.id === 'era_2020s') xp = countReleasedInYearRange(2020, 2030);

    return xp;
}

export function calculateRatingsXP(nodeDef, data) {
    let xp = 0;

    // Use category_ratings.json (data.categoryRatings) or stats.json
    // Calculate global average rating if possible
    let totalRatings = 0;
    let sumRatings = 0;
    let highCount = 0; // 9 or 10
    let lowCount = 0;  // < 6

    // Using the animeList rating property (from 1 to 10)
    if (data.animeList) {
        data.animeList.forEach(anime => {
            if (anime.rating) {
                const r = parseFloat(anime.rating);
                if (!isNaN(r)) {
                    totalRatings++;
                    sumRatings += r;
                    if (r >= 9) highCount++;
                    if (r <= 6) lowCount++;
                }
            }
        });
    }

    const avg = totalRatings > 0 ? (sumRatings / totalRatings) : 0;

    if (nodeDef.id === 'rating_reviewer') {
        xp = totalRatings * 100; // Base reviewer level
    }
    else if (nodeDef.id === 'rating_strict') {
        // Unlock only if avg < 7.5 and you have actually rated things
        if (totalRatings >= 10 && avg > 0 && avg < 7.5) {
            xp = lowCount * 2500; // 2500 XP per low rating
        }
    }
    else if (nodeDef.id === 'rating_optimist') {
        // Unlock only if avg > 8.0
        if (totalRatings >= 10 && avg >= 8.0) {
            xp = highCount * 2500;
        }
    }
    else if (nodeDef.id === 'rating_variance') {
        // Episode variance using episodeRatings if available (not fully loaded in index right now, but assuming we can approximate)
        xp = totalRatings * 50;
    }

    return xp;
}
