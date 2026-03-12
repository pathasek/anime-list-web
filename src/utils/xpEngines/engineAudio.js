/**
 * Computes XP for Audio and Frisson nodes based on favorites and favorites_ost.
 */
export function calculateAudioXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const favs = data.favorites || [];

    const addFavs = (filterFn, multiplier) => {
        favs.forEach(f => {
            if (filterFn(f)) {
                let gained = multiplier;
                // Scale XP based on ranking if it exists
                if (f.rating_total != null && !isNaN(f.rating_total)) {
                    gained += parseFloat(f.rating_total) * 100;
                }
                xp += gained;
                const animeName = f.anime_name || f.name || 'Unknown';
                contributors.push({ id: animeName, name: animeName, xp: gained });
            }
        });
    };

    // ─── ROOT AUDIO ───
    if (nodeDef.id === 'audio_listener') {
        addFavs(() => true, 1000);
    }

    // ─── NEW FRISSON & EMOTION CHAIN ───
    else if (nodeDef.id === 'audio_frisson') {
        addFavs(f => 
            (f.has_frisson === true || (f.has_frisson != null && String(f.has_frisson).toLowerCase() === 'ano')) ||
            (f.tags != null && String(f.tags).toLowerCase().includes('frisson')), 
        2000);
    }
    else if (nodeDef.id === 'audio_emotion') {
        addFavs(f => f.tags != null && String(f.tags).toLowerCase().includes('emotion'), 3000);
    }

    // ─── HYPE & VOCAL CHAIN ───
    else if (nodeDef.id === 'audio_singalong') {
        addFavs(f => 
            (parseFloat(f.sing_along || 0) >= 8) ||
            (f.tags != null && String(f.tags).toLowerCase().includes('sing_along')), 
        1500);
    }
    else if (nodeDef.id === 'audio_hype') {
        addFavs(f => f.tags != null && (String(f.tags).toLowerCase().includes('energy') || String(f.tags).toLowerCase().includes('hype')), 2500);
    }

    // ─── OP & ED COLLECTOR CHAIN ───
    else if (nodeDef.id === 'audio_op_collector') {
        addFavs(f => f.type === 'OP', 1500);
    }
    else if (nodeDef.id === 'audio_ed_collector') {
        addFavs(f => f.type === 'ED', 2000);
    }
    else if (nodeDef.id === 'audio_completeset') {
        // Find anime where user has both OP and ED
        const opAnime = new Set(favs.filter(f => f.type === 'OP').map(f => f.anime_name || f.name));
        const edAnime = new Set(favs.filter(f => f.type === 'ED').map(f => f.anime_name || f.name));
        
        opAnime.forEach(anime => {
            if (edAnime.has(anime) && anime) {
                const gained = 5000;
                xp += gained;
                contributors.push({ id: anime, name: anime, xp: gained });
            }
        });
    }

    // ─── OMEGAS ───
    else if (nodeDef.id === 'omega_composer') {
        const uniqueArtists = new Map();
        favs.forEach(f => {
            const artist = f.artist || 'Unknown';
            if (artist !== 'Unknown') {
                if (!uniqueArtists.has(artist)) uniqueArtists.set(artist, 0);
                uniqueArtists.set(artist, uniqueArtists.get(artist) + 1);
            }
        });

        uniqueArtists.forEach((count, artist) => {
            if (count >= 3) { // Artist with at least 3 tracks
                const gained = count * 2000;
                xp += gained;
                contributors.push({ id: artist, name: artist, xp: gained });
            }
        });
    }
    else if (nodeDef.id === 'omega_audiophile') {
        // Ultimate convergence handles by dictionary thresholds, but we can give raw points for total favs volume
        addFavs(() => true, 500);
    }

    // Old handlers (karaoke, seiyuu, melody, visual) - kept for safety if needed
    else if (nodeDef.id === 'audio_karaoke') addFavs(f => parseFloat(f.sing_along || 0) >= 8, 1000);
    else if (nodeDef.id === 'audio_seiyuu') addFavs(f => parseFloat(f.rating_voice || 0) >= 9, 1000);
    else if (nodeDef.id === 'audio_melody') addFavs(f => parseFloat(f.rating_melody || 0) === 10, 2500);
    else if (nodeDef.id === 'audio_visual') addFavs(f => parseFloat(f.rating_video || 0) >= 9.5, 2500);

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);

    // Remove duplicates based on ID (for `addFavs` logic where multiple songs from same anime exist)
    const uniqueContributors = [];
    const seenIds = new Set();
    contributors.forEach(c => {
        if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            // Combine XP for duplicates
            const totalXp = contributors.filter(x => x.id === c.id).reduce((sum, item) => sum + item.xp, 0);
            uniqueContributors.push({ ...c, xp: totalXp });
        }
    });

    uniqueContributors.sort((a, b) => b.xp - a.xp);

    return { xp, contributors: uniqueContributors.slice(0, 50) };
}
