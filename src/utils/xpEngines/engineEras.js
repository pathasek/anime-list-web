/**
 * Computes XP for Release Eras and Release Format domains.
 */

export function calculateErasXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const animeList = data.animeList || [];

    const addEra = (start, end) => {
        animeList.forEach(anime => {
            if (anime.release_date != null) {
                const year = parseInt(String(anime.release_date).substring(0, 4));
                if (!isNaN(year) && year >= start && year <= end) {
                    const gained = 1000;
                    xp += gained;
                    contributors.push({ id: anime.anime_id, name: anime.name, xp: gained });
                }
            }
        });
    };

    // ─── NEW ERA CHAIN ───
    if (nodeDef.id === 'fmt_retro') addEra(1980, 1999);
    else if (nodeDef.id === 'era_2000s') addEra(2000, 2009);
    else if (nodeDef.id === 'era_2010s') addEra(2010, 2019);
    else if (nodeDef.id === 'era_2020s') addEra(2020, 2023);
    else if (nodeDef.id === 'era_current') addEra(2024, 2030);

    // ─── FORMAT MATRICES ───
    else if (nodeDef.id === 'fmt_tv') {
        animeList.forEach(a => {
            const typeStr = a.type != null ? String(a.type).toUpperCase() : '';
            if (typeStr === 'TV') {
                const eps = parseInt(a.episodes) || (a.total_time != null && !isNaN(a.total_time) ? Math.max(1, Math.floor(a.total_time / 24)) : 12);
                const gained = eps * 100;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'fmt_movie') {
        animeList.forEach(a => {
            const typeStr = a.type != null ? String(a.type).toUpperCase() : '';
            if (typeStr === 'MOVIE') {
                const gained = 1500;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'fmt_ova') {
        animeList.forEach(a => {
            const typeStr = a.type != null ? String(a.type).toUpperCase() : '';
            if (typeStr === 'OVA' || typeStr === 'ONA' || typeStr === 'SPECIAL') {
                const eps = parseInt(a.episodes) || 1;
                const gained = eps * 300;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'fmt_short') {
        animeList.forEach(a => {
            const eps = parseInt(a.episodes);
            if (!isNaN(eps) && eps > 0 && eps <= 13 && a.type === 'TV') {
                const gained = 500;
                xp += gained;
                contributors.push({ id: a.anime_id, name: a.name, xp: gained });
            }
        });
    }

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}

// Kept rating logics in here to preserve original backward compat if called,
// although V2 uses engineRatings.js heavily.
export function calculateRatingsXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const animeList = data.animeList || [];

    const addAnime = (anime, gained) => {
        xp += gained;
        contributors.push({ id: anime.anime_id, name: anime.name, xp: gained });
    };

    if (nodeDef.id === 'rating_reviewer') {
        animeList.forEach(anime => {
            if (anime.rating != null && !isNaN(parseFloat(anime.rating))) {
                addAnime(anime, 100);
            }
        });
    }
    else if (nodeDef.id === 'rating_strict') {
        animeList.forEach(anime => {
            const r = parseFloat(anime.rating);
            if (!isNaN(r) && r <= 6 && r > 0) { // Only count scores 1-6
                addAnime(anime, 2500);
            }
        });
    }
    else if (nodeDef.id === 'rating_optimist') {
        let sumRatings = 0;
        let totalRatings = 0;
        animeList.forEach(anime => {
            if (anime.rating != null) {
                const r = parseFloat(anime.rating);
                if (!isNaN(r)) { totalRatings++; sumRatings += r; }
            }
        });
        const avg = totalRatings > 0 ? (sumRatings / totalRatings) : 0;
        if (totalRatings >= 10 && avg >= 8.0) {
            animeList.forEach(anime => {
                const r = parseFloat(anime.rating);
                if (!isNaN(r) && r >= 9) {
                    addAnime(anime, 2500);
                }
            });
        }
    }

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}
