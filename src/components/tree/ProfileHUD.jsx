import React, { useMemo } from 'react';
import { useStatsTree } from './StatsTreeContext';

export default function ProfileHUD() {
    const { nodes, isLoading, error } = useStatsTree();

    const { globalLevel, totalPXP, xpToNextLevel, progressPercent, title } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { globalLevel: 1, totalPXP: 0, xpToNextLevel: 500, progressPercent: 0, title: 'Anime Novice' };

        const totalPXP = nodes.totalPXP || 0;

        // Quadratic curve: level K where PXP >= 250 * K * (K + 1). globalLevel = min(100, K + 1)
        const K = Math.floor((-1 + Math.sqrt(1 + totalPXP / 62.5)) / 2) || 0;
        const globalLevel = Math.min(100, K + 1);

        const currentLevelPxp = globalLevel === 1 ? 0 : 250 * (globalLevel - 1) * globalLevel;
        const nextLevelPxp = globalLevel === 100 ? currentLevelPxp : 250 * globalLevel * (globalLevel + 1);

        const xpIntoLevel = totalPXP - currentLevelPxp;
        const xpNeededForLevel = nextLevelPxp - currentLevelPxp;

        const progressPercent = globalLevel === 100 ? 100 : Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));

        let title = 'Anime Novice';
        if (globalLevel >= 5) title = 'Weeb Initiate';
        if (globalLevel >= 15) title = 'Seasoned Otaku';
        if (globalLevel >= 30) title = 'Anime Scholar';
        if (globalLevel >= 50) title = 'Grandmaster of the Medium';
        if (globalLevel >= 80) title = 'Kami-Sama';

        return { globalLevel, totalPXP, xpToNextLevel: nextLevelPxp, progressPercent, title };
    }, [nodes]);

    if (isLoading || error) return null;

    return (
        <div className="profile-hud" style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'rgba(17, 20, 30, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            color: 'white',
            width: '280px',
            userSelect: 'none'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <img 
                    src="avatar.jpg" 
                    alt="Macou Profile"
                    style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)'
                    }}
                />
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontWeight: '800', fontSize: '1.2rem', letterSpacing: '0.02em', color: '#f8fafc' }}>
                            patrekingcz
                        </div>
                        <a 
                            href="https://myanimelist.net/profile/patrekingcz" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ 
                                color: '#3b82f6', 
                                display: 'flex', 
                                alignItems: 'center', 
                                textDecoration: 'none' 
                            }}
                            title="MyAnimeList Profile"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 1.97c-.989-.989-2.613-.989-3.602 0l-1.97-1.97c1.978-1.978 5.185-1.978 7.542 0zM8.894 11.221l1.97 1.97c-.989.989-2.613.989-3.602 0l-1.97-1.97c1.978-1.978 5.185-1.978 7.542 0z"/>
                            </svg>
                        </a>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#fde047', fontWeight: '600', marginTop: '2px' }}>
                        {title}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '600' }}>Overall Level {globalLevel}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{totalPXP.toLocaleString()} PXP</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#2a2a35', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ 
                        height: '100%', 
                        background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                        width: `${progressPercent}%`,
                        transition: 'width 1s ease-out'
                    }}></div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
                    {globalLevel === 100 ? 'MAX LEVEL REACHED' : `Next Level at ${xpToNextLevel.toLocaleString()} PXP`}
                </div>
            </div>
        </div>
    );
}
