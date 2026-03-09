import React from 'react';

export default function SidePanel({ nodeData, onClose }) {
    if (!nodeData) return null;

    const { id, label, xp = 0, level = 0, maxLevel = 5, isUnlocked = false, thresholds = [], domain, dependencies = [] } = nodeData;
    const isMaxed = level >= maxLevel;

    // Calculate next threshold distance
    const nextThreshold = isMaxed ? thresholds[thresholds.length - 1] : thresholds[level];
    const progressPercent = Math.min(100, Math.max(0, (xp / nextThreshold) * 100));

    return (
        <div className={`tree-side-panel ${nodeData ? 'open' : ''}`}>
            <div className="panel-header">
                <h2 className="panel-title">{label}</h2>
                <button className="panel-close-btn" onClick={onClose}>
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div className="panel-content">
                <div className={`panel-status-card node-${domain} ${isMaxed ? 'status-maxed' : ''}`}>
                    <div className="panel-level-badge">
                        {isMaxed ? 'MAX LEVEL' : `LEVEL ${level} / ${maxLevel}`}
                    </div>

                    {!isUnlocked && (
                        <div className="panel-locked-warning">
                            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '8px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            NODE LOCKED - Requirements not met
                        </div>
                    )}

                    <div className="panel-xp-bar-container">
                        <div className="panel-xp-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                    <div className="panel-xp-text">
                        {xp.toLocaleString()} / {nextThreshold.toLocaleString()} XP
                    </div>
                </div>

                <div className="panel-lore-section">
                    <h3>Domain: {String(domain).toUpperCase()}</h3>
                    <p className="panel-description">
                        {getLoreDescription(id)}
                    </p>
                </div>

                {thresholds.length > 0 && (
                    <div className="panel-thresholds">
                        <h3>Level Milestones</h3>
                        <ul>
                            {thresholds.map((t, idx) => (
                                <li key={idx} className={level > idx ? 'milestone-reached' : ''}>
                                    <span className="milestone-level">Lvl {idx + 1}</span>
                                    <span className="milestone-xp">{t.toLocaleString()} XP</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

            </div>
        </div>
    );
}

// Helper to provide some RPG flavor text depending on the node
function getLoreDescription(id) {
    if (id.startsWith('omega')) return "An ULTIMATE node crossing the boundaries of space and time. Requires absolute mastery across multiple domains to unlock.";
    if (id.includes('shounen')) return "The power of friendship alone cannot save you. Only raw dedication to the Shounen genre provides this much energy.";
    if (id.includes('binge')) return "Sleep is a myth. The Weekend Warrior thrives on consecutive hours of non-stop animation consumption.";
    if (id.includes('connoisseur')) return "You observe animation not as moving pictures, but as a deliberate craft sculpted by human hands.";
    if (id.includes('frisson')) return "That shiver down your spine during the climax? That's your soul resonating with the soundtrack.";
    return "A specific node tracking your behavior in the infinite expanses of the anime database.";
}
