/**
 * Computes XP for Release Eras, Release Format and Critic Ratings domains.
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

    // ─── TITAN V2: FORMAT MATRICES ───
    else if (nodeDef.id === 'fmt_tv') {
        animeList.forEach(a => {
            if (String(a.type).toUpperCase() === 'TV') {
                const eps = parseInt(a.episodes) || (!isNaN(a.total_time) ? Math.max(1, Math.floor(a.total_time / 24)) : 12);
                const gained = eps * 100;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'fmt_movie') {
        animeList.forEach(a => {
            if (String(a.type).toUpperCase() === 'MOVIE') {
                const gained = 1500;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'fmt_ova') {
        animeList.forEach(a => {
            if (String(a.type).toUpperCase() === 'OVA' || String(a.type).toUpperCase() === 'ONA' || String(a.type).toUpperCase() === 'SPECIAL') {
                const eps = parseInt(a.episodes) || 1;
                const gained = eps * 300;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }

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
