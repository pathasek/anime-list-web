import React, { useMemo } from 'react';
import { useStatsTree } from './StatsTreeContext';

export default function ProfileHUD() {
    const { nodes, isLoading, error } = useStatsTree();

    const { globalLevel, totalXp, xpToNextLevel, progressPercent, title } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { globalLevel: 0, totalXp: 0, xpToNextLevel: 100, progressPercent: 0, title: 'Novice Watcher' };

        // Sum up total XP across all nodes
        const totalXp = nodes.reduce((sum, n) => sum + (n.xp || 0), 0);

        // Simple global level curve: Level = floor(sqrt(totalXP / base))
        // Let's say base is 50. So 200 XP = lvl 2. 800 XP = lvl 4. 20000 XP = lvl 20.
        const base = 50;
        const globalLevel = Math.floor(Math.sqrt(totalXp / base)) || 1;
        
        // XP required for current level and next level
        const currentLevelXp = Math.pow(globalLevel, 2) * base;
        const nextLevelXp = Math.pow(globalLevel + 1, 2) * base;
        
        const xpIntoLevel = totalXp - currentLevelXp;
        const xpNeededForLevel = nextLevelXp - currentLevelXp;
        
        const progressPercent = Math.min(100, Math.max(0, (xpIntoLevel / xpNeededForLevel) * 100));

        let title = 'Anime Novice';
        if (globalLevel >= 5) title = 'Weeb Initiate';
        if (globalLevel >= 15) title = 'Seasoned Otaku';
        if (globalLevel >= 30) title = 'Anime Scholar';
        if (globalLevel >= 50) title = 'Grandmaster of the Medium';
        if (globalLevel >= 100) title = 'Kami-Sama';

        return { globalLevel, totalXp, xpToNextLevel: nextLevelXp, progressPercent, title };
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
                <div style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)'
                }}>
                    M
                </div>
                <div>
                    <div style={{ fontWeight: '800', fontSize: '1.2rem', letterSpacing: '0.02em', color: '#f8fafc' }}>
                        Macou
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#fde047', fontWeight: '600', marginTop: '2px' }}>
                        {title}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                    <span style={{ color: '#94a3b8', fontWeight: '600' }}>Overall Level {globalLevel}</span>
                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{totalXp.toLocaleString()} XP</span>
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
                    Next Level at {xpToNextLevel.toLocaleString()} XP
                </div>
            </div>
        </div>
    );
}
