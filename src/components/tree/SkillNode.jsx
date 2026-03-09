import React, { useState } from 'react';

/**
 * SkillNode: The physical representation of a "Skill" or "Achievement" in the tree.
 * 
 * Props:
 * - nodeData: Complete node object (id, label, xp, maxXp, level, etc.)
 * - onHover: Callback for populating the external Sidebar / Detail Panel
 * - onClick: Callback for forcing open detailed view
 */
export default function SkillNode({ nodeData, onHover, onClick }) {
    const [isHovered, setIsHovered] = useState(false);

    if (!nodeData) return null;

    const { id, label, xp = 0, maxXp = 1, level = 0, isUnlocked = false, maxLevel = 5, icon, x = 0, y = 0, domainColor = 'primary' } = nodeData;

    const isMaxed = level >= maxLevel;
    const progressPercent = Math.min(100, Math.max(0, (xp / maxXp) * 100));

    // Domain styling dynamic classes
    const colorClass = `node-${domainColor}`;
    const statusClass = isMaxed ? 'status-maxed' : (isUnlocked ? 'status-unlocked' : 'status-locked');
    const hoverClass = isHovered ? 'node-hovered' : '';

    return (
        <div
            className={`skill-node ${colorClass} ${statusClass} ${hoverClass}`}
            style={{
                transform: `translate(${x}px, ${y}px)`,
                // CSS custom properties for dynamic theming
                '--node-progress': `${progressPercent}%`,
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
            {/* Inner Glowing Borders and Glass Effect are handled in CSS */}
            <div className="node-content">
                <div className="node-header">
                    <div className="node-title">{label}</div>
                    {isUnlocked && (
                        <div className={`node-level ${isMaxed ? 'text-maxed' : ''}`}>
                            {isMaxed ? 'MAX' : `Lvl ${level}`}
                        </div>
                    )}
                </div>

                {/* Progress Bar Track & Fill */}
                <div className="node-progress-track">
                    <div className="node-progress-fill" style={{ width: `${progressPercent}%` }}></div>
                </div>

                <div className="node-xp-text">
                    {xp} / {maxXp} XP
                </div>
            </div>

            {/* Decorative corners/edges for UI punchiness */}
            {isMaxed && <div className="max-sparkles"></div>}
            {!isUnlocked && (
                <div className="node-lock-icon">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>
            )}
        </div>
    );
}
