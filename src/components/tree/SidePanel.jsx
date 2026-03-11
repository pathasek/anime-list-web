import React from 'react';

export default function SidePanel({ nodeData, onClose }) {
    if (!nodeData) return null;

    const { id, label, xp = 0, level = 0, maxLevel = 5, isUnlocked = false, calculatedThresholds = [], domain, description, dependencies = [] } = nodeData;
    const isMaxed = level >= maxLevel;

    // Calculate next threshold distance
    const nextThreshold = isMaxed ? calculatedThresholds[calculatedThresholds.length - 1] : calculatedThresholds[level];
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
                            NODE LOCKED - Prereqs not met
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
                        {description || "Odemktknutí dalších dat je skryto pod zámkem paměti. Pokračujte ve studiu animesů a sledujte jak se vaše statistiky formují."}
                    </p>
                </div>

                {nodeData.topContributors && nodeData.topContributors.length > 0 && (
                    <div className="panel-contributors">
                        <h3>Největší Původci (Contributors)</h3>
                        <div className="contributors-posters">
                            {nodeData.topContributors.map((c, idx) => (
                                <div key={idx} className="contrib-poster-wrapper" title={c.name}>
                                    <img 
                                        src={c.thumbnail || 'avatar.jpg'} 
                                        alt={c.name} 
                                        className="contrib-poster-img"
                                        onError={(e) => { e.target.src = 'avatar.jpg' }}
                                    />
                                    <div className="contrib-poster-overlay">
                                        <div className="contrib-poster-xp">+{c.xp.toLocaleString()} XP</div>
                                        <div className="contrib-poster-links">
                                            <a href={`#/anime/${encodeURIComponent(c.name)}`} className="contrib-link local-link">Můj List</a>
                                            {c.mal_url && (
                                                <a href={c.mal_url} target="_blank" rel="noopener noreferrer" className="contrib-link mal-link">MAL</a>
                                            )}
                                        </div>
                                    </div>
                                    <div className="contrib-rank-badge">#{idx + 1}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {calculatedThresholds.length > 0 && (
                    <div className="panel-thresholds">
                        <h3>Level Milestones</h3>
                        <ul>
                            {calculatedThresholds.map((t, idx) => (
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
