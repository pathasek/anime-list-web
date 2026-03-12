import { NODE_DICTIONARY } from './dictionary';
import { calculateChronosXP } from './engineChronos';
import { calculateGenreXP } from './engineGenre';
import { calculateStudioXP } from './engineStudio';
import { calculateAudioXP } from './engineAudio';
import { calculateErasXP } from './engineEras';
import { calculateMiscXP } from './engineMisc';
// --- Titan V2 New Engines ---
import { calculateRatingsXP } from './engineRatings';
import { calculateNotesXP } from './engineNotes';
import { calculateFavoritesXP } from './engineFavorites';

/**
 * calculateTreeState orchestrates the O(N) calculation of all skill nodes.
 */
export function calculateTreeState(data) {
    const totalWatchHours = data.stats?.total_time?.total ? Math.floor(parseFloat(data.stats.total_time.total) * 24) : 0;

    const computedStateMap = new Map();

    const baseNodes = NODE_DICTIONARY.map(nodeDef => {
        let xp = 0;
        let contributors = [];

        const processEngine = (res) => {
            if (typeof res === 'object' && res !== null && 'xp' in res) {
                xp = res.xp;
                contributors = res.contributors || [];
            } else {
                xp = res || 0;
            }
        };

        const id = nodeDef.id;

        if (id === 'singularity') {
            // Genesis node
            if (data.animeList && data.animeList.length > 0) {
                const oldest = [...data.animeList].sort((a, b) => new Date(a.start_date) - new Date(b.start_date))[0];
                xp = 100;
                contributors = [{ id: oldest.name, name: oldest.name, xp: 100 }];
            }
        }
        // ─── CHRONOS ENGINE ───
        else if (id.startsWith('chronos_') || id.startsWith('habit_')) {
            processEngine(calculateChronosXP(nodeDef, totalWatchHours, data));
        }
        // ─── GENRE ENGINE ───
        else if (id.startsWith('genre_') || id.startsWith('demo_') || id.startsWith('trope_')) {
            processEngine(calculateGenreXP(nodeDef, data));
        }
        // ─── STUDIO ENGINE ───
        else if (id.startsWith('studio_')) {
            processEngine(calculateStudioXP(nodeDef, data));
        }
        // ─── AUDIO ENGINE ───
        else if (id.startsWith('audio_') || id === 'omega_composer' || id === 'omega_audiophile') {
            processEngine(calculateAudioXP(nodeDef, data));
        }
        // ─── ERAS ENGINE ───
        else if (id.startsWith('era_') || id.startsWith('fmt_')) {
            processEngine(calculateErasXP(nodeDef, data));
        }
        // ─── RATINGS ENGINE (V2) ───
        else if (id.startsWith('rating_')) {
            processEngine(calculateRatingsXP(nodeDef, 0, data));
        }
        // ─── NOTES ENGINE (V2) ───
        else if (id.startsWith('notes_') || id === 'backlog_dreamer') {
            processEngine(calculateNotesXP(nodeDef, 0, data));
        }
        // ─── FAVORITES ENGINE (V2) ───
        else if (id.startsWith('fav_')) {
            processEngine(calculateFavoritesXP(nodeDef, 0, data));
        }
        // ─── MISC ENGINE ───
        else if (id.startsWith('omega_') || id.startsWith('rewatch_') || id.startsWith('lang_') || id.startsWith('len_') || id.startsWith('status_') || id.startsWith('misc_')) {
            processEngine(calculateMiscXP(nodeDef, data));
        }
        // ─── Fallback ───
        else {
            xp = 0;
        }

        // Generate dynamic thresholds
        let calculatedThresholds = [];
        if (nodeDef.thresholds) {
            calculatedThresholds = nodeDef.thresholds;
        } else if (nodeDef.reqBase && nodeDef.maxLevel) {
            const multiplier = nodeDef.reqMultiplier || 1.5;
            for (let i = 0; i < nodeDef.maxLevel; i++) {
                calculatedThresholds.push(Math.round(nodeDef.reqBase * Math.pow(multiplier, i)));
            }
        } else {
            calculatedThresholds = [100];
        }

        let level = 0;
        for (let i = 0; i < calculatedThresholds.length; i++) {
            if (xp >= calculatedThresholds[i]) {
                level = i + 1;
            } else {
                break;
            }
        }

        let maxXp = calculatedThresholds[0] || 100;
        if (level > 0 && level < calculatedThresholds.length) {
            maxXp = calculatedThresholds[level];
        } else if (level === calculatedThresholds.length) {
            maxXp = calculatedThresholds[level - 1];
        }

        nodeDef.calculatedThresholds = calculatedThresholds;

        // Top 3 for side panel preview
        let topContributors = [];
        if (contributors.length > 0) {
            const uniqueMap = new Map();
            contributors.forEach(c => {
                const uniqueId = typeof c.id === 'string' ? c.id.split('-')[0] : c.id; // handle fav_characters format {name}-{animeName}
                if (!uniqueMap.has(uniqueId)) uniqueMap.set(uniqueId, c);
                else {
                    const existing = uniqueMap.get(uniqueId);
                    existing.xp += c.xp;
                }
            });
            const merged = Array.from(uniqueMap.values());
            merged.sort((a, b) => b.xp - a.xp);
            topContributors = merged.slice(0, 3).map(contrib => {
                const searchId = typeof contrib.id === 'string' ? contrib.id.split('-')[1] || contrib.id : contrib.id;
                const animeInfo = data.animeList?.find(a => a.name === searchId || a.name === contrib.name);
                return {
                    ...contrib,
                    thumbnail: animeInfo ? animeInfo.thumbnail : null,
                    mal_url: animeInfo ? animeInfo.mal_url : null
                };
            });
        }

        return {
            ...nodeDef,
            xp,
            maxXp,
            level,
            maxLevel: calculatedThresholds.length,
            isUnlocked: false,
            topContributors
        };
    });

    baseNodes.forEach(node => {
        computedStateMap.set(node.id, node);
    });

    baseNodes.forEach(node => {
        if (!node.dependencies || node.dependencies.length === 0) {
            node.isUnlocked = true;
        } else {
            const allReqsMet = node.dependencies.every(depId => {
                const parentNode = computedStateMap.get(depId);
                // Parent must be level >= 1 to unlock children
                return parentNode && parentNode.level >= 1;
            });
            node.isUnlocked = allReqsMet;
        }
    });

    return baseNodes;
}
