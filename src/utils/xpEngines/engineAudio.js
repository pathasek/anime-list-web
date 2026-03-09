/**
 * Computes XP for Audio and Frisson nodes based on favorites and favorites_ost.
 */
export function calculateAudioXP(nodeDef, data) {
    let xp = 0;
    let contributors = [];

    const favs = data.favorites || [];

    const addFavs = (filterFn, multiplier) => {
        favs.forEach(f => {
            if (filterFn(f)) {
                const gained = multiplier;
                xp += gained;
                // favs.name might contain "Song Name - Anime Name", extracting just anime name if possible, or using the whole string
                contributors.push({ id: f.name, name: f.name, xp: gained });
            }
        });
    };

    if (nodeDef.id === 'audio_listener') {
        // Total songs saved (1000 XP per song to scale fast)
        addFavs(() => true, 1000);
    }
    // ─── 5A: FRISSON PATH ───
    else if (nodeDef.id === 'audio_frisson') {
        addFavs(f => f.has_frisson === true || String(f.has_frisson).toLowerCase() === 'ano', 5000);
    }
    // ─── 5B: VOCAL PATH ───
    else if (nodeDef.id === 'audio_karaoke') {
        addFavs(f => parseFloat(f.sing_along || 0) >= 8, 1000);
    }
    else if (nodeDef.id === 'audio_seiyuu') {
        addFavs(f => parseFloat(f.rating_voice || 0) >= 9, 1000);
    }
    // ─── 5C: COMPOSITION PATH ───
    else if (nodeDef.id === 'audio_melody') {
        addFavs(f => parseFloat(f.rating_melody || 0) === 10, 2500);
    }
    // ─── 5D: VISUAL OP/ED ───
    else if (nodeDef.id === 'audio_visual') {
        addFavs(f => parseFloat(f.rating_video || 0) >= 9.5, 2500);
    }

    return { xp, contributors };
}
