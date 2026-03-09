/**
 * Computes XP for Release Eras and Critic Ratings domains.
 */

export function calculateErasXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    const animeList = data.animeList || [];

    const addEra = (start, end) => {
        animeList.forEach(anime => {
            if (anime.release_date) {
                const year = parseInt(String(anime.release_date).substring(0, 4));
                if (!isNaN(year) && year >= start && year <= end) {
                    const gained = 1000;
                    xp += gained;
                    contributors.push({ id: anime.anime_id, name: anime.name, xp: gained });
                }
            }
        });
    };

    if (nodeDef.id === 'era_80s90s') addEra(1980, 1999);
    else if (nodeDef.id === 'era_2000s') addEra(2000, 2009);
    else if (nodeDef.id === 'era_2010s') addEra(2010, 2019);
    else if (nodeDef.id === 'era_2020s') addEra(2020, 2030);

    return { xp, contributors };
}

export function calculateRatingsXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    const animeList = data.animeList || [];
    let sumRatings = 0;
    let totalRatings = 0;

    animeList.forEach(anime => {
        if (anime.rating) {
            const r = parseFloat(anime.rating);
            if (!isNaN(r)) {
                totalRatings++;
                sumRatings += r;
            }
        }
    });

    const avg = totalRatings > 0 ? (sumRatings / totalRatings) : 0;

    const addAnime = (anime, gained) => {
        xp += gained;
        contributors.push({ id: anime.anime_id, name: anime.name, xp: gained });
    };

    if (nodeDef.id === 'rating_reviewer') {
        animeList.forEach(anime => {
            if (anime.rating && !isNaN(parseFloat(anime.rating))) {
                addAnime(anime, 100);
            }
        });
    }
    else if (nodeDef.id === 'rating_strict') {
        if (totalRatings >= 10 && avg > 0 && avg < 7.5) {
            animeList.forEach(anime => {
                const r = parseFloat(anime.rating);
                if (!isNaN(r) && r <= 6) {
                    addAnime(anime, 2500);
                }
            });
        }
    }
    else if (nodeDef.id === 'rating_optimist') {
        if (totalRatings >= 10 && avg >= 8.0) {
            animeList.forEach(anime => {
                const r = parseFloat(anime.rating);
                if (!isNaN(r) && r >= 9) {
                    addAnime(anime, 2500);
                }
            });
        }
    }

    return { xp, contributors };
}
