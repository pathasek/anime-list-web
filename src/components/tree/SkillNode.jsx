import React, { useState, memo } from 'react';

/**
 * SkillNode: The physical representation of a "Skill" or "Achievement" in the tree.
 * Optimized with React.memo to prevent re-renders when parent canvas is dragged.
 */
const SkillNode = memo(function SkillNode({ nodeData, onHover, onClick }) {
    const [isHovered, setIsHovered] = useState(false);

    if (!nodeData) return null;

    const { id, label, xp = 0, maxXp = 1, level = 0, isUnlocked = false, maxLevel = 5, x = 0, y = 0, domain = 'primary' } = nodeData;

    const isMaxed = level >= maxLevel;
    const progressPercent = Math.min(100, Math.max(0, (xp / maxXp) * 100));

    // Determine visual state
    const statusClass = isMaxed ? 'status-maxed' : (isUnlocked ? 'status-unlocked' : 'status-locked');
    const hoverClass = isHovered ? 'node-hovered' : '';
    const domainClass = `node-${domain}`;

    return (
        <div
            className={`skill-node-v2 ${domainClass} ${statusClass} ${hoverClass}`}
            style={{
                top: `${y}px`,
                left: `${x}px`
            }}
            onMouseEnter={() => {
                setIsHovered(true);
                if (onHover) onHover(nodeData);
            }}
            onMouseLeave={() => {
                setIsHovered(false);
            }}
            onClick={() => {
                if (onClick) onClick(nodeData);
            }}
        >
            <div className="node-v2-header">
                <span className="node-v2-title">{label}</span>
                {isUnlocked && (
                    <span className={`node-v2-level ${isMaxed ? 'text-maxed' : ''}`}>
                        {isMaxed ? 'MAX' : `Lvl ${level}`}
                    </span>
                )}
            </div>

            <div className="node-v2-body">
                <div className="node-v2-progress-track">
                    <div 
                        className="node-v2-progress-fill" 
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
                <div className="node-v2-xp-text">
                    {xp.toLocaleString()} / {maxXp.toLocaleString()} XP
                </div>
            </div>

            {!isUnlocked && (
                <div className="node-v2-lock-overlay">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
            )}
        </div>
    );
});

export default SkillNode;
