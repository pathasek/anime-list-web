import { NODE_DICTIONARY } from './dictionary';
import { calculateChronosXP } from './engineChronos';
import { calculateGenreXP } from './engineGenre';
import { calculateStudioXP } from './engineStudio';
import { calculateAudioXP } from './engineAudio';
import { calculateErasXP, calculateRatingsXP } from './engineEras';
import { calculateMiscXP } from './engineMisc';

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

        switch (nodeDef.domain) {
            case 'singularity':
                xp = data.animeList ? data.animeList.length * 100 : 0;
                break;
            case 'chronos':
                processEngine(calculateChronosXP(nodeDef, totalWatchHours, data));
                break;
            case 'purple': // Generes are defined as 'purple' domain in dictionary
            case 'genre':
                processEngine(calculateGenreXP(nodeDef, data));
                break;
            case 'orange': // Studios are orange domain
            case 'studio':
                processEngine(calculateStudioXP(nodeDef, data));
                break;
            case 'emerald': // Audio is emerald domain
            case 'audio':
                processEngine(calculateAudioXP(nodeDef, data));
                break;
            case 'cyan': // Eras and Misc
            case 'era':
                processEngine(calculateErasXP(nodeDef, data));
                break;
            case 'red': // Critic ratings
            case 'rating':
                processEngine(calculateRatingsXP(nodeDef, data));
                break;
            case 'misc':
                processEngine(calculateMiscXP(nodeDef, data));
                break;
            default:
                xp = 0;
        }

        // Generate dynamic thresholds or use hardcoded if provided
        let calculatedThresholds = [];
        if (nodeDef.thresholds) {
            calculatedThresholds = nodeDef.thresholds;
        } else if (nodeDef.reqBase && nodeDef.maxLevel) {
            const multiplier = nodeDef.reqMultiplier || 1.5;
            for (let i = 0; i < nodeDef.maxLevel; i++) {
                calculatedThresholds.push(Math.round(nodeDef.reqBase * Math.pow(multiplier, i)));
            }
        } else {
            calculatedThresholds = [100]; // Fallback
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

        // Attach calculated thresholds so UI can access them
        nodeDef.calculatedThresholds = calculatedThresholds;

        // Sort contributors and get top 3
        let topContributors = [];
        if (contributors.length > 0) {
            // Group duplicates by anime ID just in case
            const uniqueMap = new Map();
            contributors.forEach(c => {
                if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
                else {
                    const existing = uniqueMap.get(c.id);
                    existing.xp += c.xp;
                }
            });
            const merged = Array.from(uniqueMap.values());
            merged.sort((a, b) => b.xp - a.xp);
            topContributors = merged.slice(0, 3);
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
                return parentNode && parentNode.level >= 1;
            });
            node.isUnlocked = allReqsMet;
        }
    });

    return baseNodes;
}
