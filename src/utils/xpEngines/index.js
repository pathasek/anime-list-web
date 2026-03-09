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

        switch (nodeDef.domain) {
            case 'singularity':
                xp = data.animeList ? data.animeList.length * 100 : 0;
                break;
            case 'chronos':
                xp = calculateChronosXP(nodeDef, totalWatchHours, data);
                break;
            case 'purple': // Generes are defined as 'purple' domain in dictionary
            case 'genre':
                xp = calculateGenreXP(nodeDef, data);
                break;
            case 'orange': // Studios are orange domain
            case 'studio':
                xp = calculateStudioXP(nodeDef, data);
                break;
            case 'emerald': // Audio is emerald domain
            case 'audio':
                xp = calculateAudioXP(nodeDef, data);
                break;
            case 'cyan': // Eras and Misc
            case 'era':
                xp = calculateErasXP(nodeDef, data);
                break;
            case 'red': // Critic ratings
            case 'rating':
                xp = calculateRatingsXP(nodeDef, data);
                break;
            case 'misc':
                xp = calculateMiscXP(nodeDef, data);
                break;
            default:
                xp = 0;
        }

        let level = 0;
        if (nodeDef.thresholds) {
            for (let i = 0; i < nodeDef.thresholds.length; i++) {
                if (xp >= nodeDef.thresholds[i]) {
                    level = i + 1;
                } else {
                    break;
                }
            }
        }

        let maxXp = nodeDef.thresholds[0] || 100;
        if (level > 0 && level < nodeDef.thresholds.length) {
            maxXp = nodeDef.thresholds[level];
        } else if (level === nodeDef.thresholds.length) {
            maxXp = nodeDef.thresholds[level - 1];
        }

        return {
            ...nodeDef,
            xp,
            maxXp,
            level,
            maxLevel: nodeDef.thresholds.length,
            isUnlocked: false
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
