export const calculateNotesXP = (nodeDef, currentLevel, { notes, planToWatch }) => {
    let xp = 0;
    const contributors = [];

    if (nodeDef.id === 'backlog_dreamer') {
        if (!planToWatch || planToWatch.length === 0) return { xp, contributors };
        
        planToWatch.forEach(anime => {
            const gained = 200; // 200 XP per planned anime
            xp += gained;
            contributors.push({ id: anime.anime_name, name: anime.anime_name, xp: gained });
        });
    }
    else {
        // Notes-based nodes
        if (!notes || notes.length === 0) return { xp, contributors };

        notes.forEach(note => {
            if (!note.text_note) return;
            const length = note.text_note.length;

            if (nodeDef.id === 'notes_scribe' && length > 100) {
                const gained = 500;
                xp += gained;
                contributors.push({ id: note.anime_name, name: note.anime_name, xp: gained });
            }
            else if (nodeDef.id === 'notes_essayist' && length > 1000) {
                const gained = 1500;
                xp += gained;
                contributors.push({ id: note.anime_name, name: note.anime_name, xp: gained });
            }
            else if (nodeDef.id === 'notes_chronicler') {
                // XP scalable by pure char count (1 XP per 2 chars)
                const gained = Math.floor(length / 2);
                if (gained > 0) {
                    xp += gained;
                    contributors.push({ id: note.anime_name, name: note.anime_name, xp: gained });
                }
            }
        });
    }

    // Sort contributors descending
    contributors.sort((a, b) => b.xp - a.xp);

    return { xp, contributors: contributors.slice(0, 50) };
};
