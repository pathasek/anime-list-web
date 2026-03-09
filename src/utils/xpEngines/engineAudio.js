/**
 * Computes XP for Audio and Frisson nodes based on favorites and favorites_ost.
 */
export function calculateAudioXP(nodeDef, data) {
    let xp = 0;

    const favs = data.favorites || [];

    if (nodeDef.id === 'audio_listener') {
        // Total songs saved (1000 XP per song to scale fast)
        xp = favs.length * 1000;
    }
    // ─── 5A: FRISSON PATH ───
    else if (nodeDef.id === 'audio_frisson') {
        const frissonCount = favs.filter(f => f.has_frisson === true || String(f.has_frisson).toLowerCase() === 'ano').length;
        // 1 song = 5000 XP
        // Level 1 = 1 song, Level 2 = 5 songs etc.
        xp = frissonCount * 5000;
    }
    // ─── 5B: VOCAL PATH ───
    else if (nodeDef.id === 'audio_karaoke') {
        // High sing-along score counts
        const singCount = favs.filter(f => parseFloat(f.sing_along || 0) >= 8).length;
        xp = singCount * 1000;
    }
    else if (nodeDef.id === 'audio_seiyuu') {
        // High Voice quality
        const voiceCount = favs.filter(f => parseFloat(f.rating_voice || 0) >= 9).length;
        xp = voiceCount * 1000;
    }
    // ─── 5C: COMPOSITION PATH ───
    else if (nodeDef.id === 'audio_melody') {
        const perfectMelody = favs.filter(f => parseFloat(f.rating_melody || 0) === 10).length;
        xp = perfectMelody * 2500;
    }
    // ─── 5D: VISUAL OP/ED ───
    else if (nodeDef.id === 'audio_visual') {
        const perfectVideo = favs.filter(f => parseFloat(f.rating_video || 0) >= 9.5).length;
        xp = perfectVideo * 2500;
    }

    return xp;
}
