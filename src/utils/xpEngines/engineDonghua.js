/**
 * Computes XP for the Donghua Explorer node.
 * Filters animeList for entries where type is 'Donghua'.
 */
export function calculateDonghuaXP(nodeDef, data) {
    let xp = 0;
    const contributors = [];

    const animeList = data.animeList || [];
    animeList.forEach(a => {
        const typeStr = a.type != null ? String(a.type).toLowerCase() : '';
        if (typeStr === 'donghua') {
            const gained = 1000;
            xp += gained;
            contributors.push({ id: a.name, name: a.name, xp: gained });
        }
    });

    contributors.sort((a, b) => b.xp - a.xp);
    return { xp, contributors: contributors.slice(0, 50) };
}
