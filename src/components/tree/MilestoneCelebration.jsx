import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MilestoneCelebration — Full-screen celebration overlay with CSS particles.
 * Triggered when a skill node is unlocked or reaches max level.
 */

const PARTICLE_COUNT = 60;
const CELEBRATION_DURATION = 4000; // 4 seconds

// Generate celebration sound programmatically using Web Audio API
function playCelebrationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Chime 1 - high frequency sparkle
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
        gain1.gain.setValueAtTime(0.3, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.6);

        // Chime 2 - ascending arpeggio
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.1); // C5
        osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2); // E5
        osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5
        osc2.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.4); // C6
        gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(ctx.currentTime + 0.1);
        osc2.stop(ctx.currentTime + 0.8);

        // Chime 3 - resonant bell
        const osc3 = ctx.createOscillator();
        const gain3 = ctx.createGain();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.35); // E6
        gain3.gain.setValueAtTime(0.15, ctx.currentTime + 0.35);
        gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc3.connect(gain3);
        gain3.connect(ctx.destination);
        osc3.start(ctx.currentTime + 0.35);
        osc3.stop(ctx.currentTime + 1.2);

        // Cleanup
        setTimeout(() => ctx.close(), 2000);
    } catch {
        // Audio API not available, fail silently
    }
}

// Random color from celebration palette
const COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#06b6d4',
    '#10b981', '#f59e0b', '#ef4444', '#a855f7',
    '#fbbf24', '#34d399', '#f472b6', '#22d3ee'
];

function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function Particle({ index }) {
    const angle = Math.random() * 360;
    const velocity = 60 + Math.random() * 140;
    const x = Math.cos(angle * Math.PI / 180) * velocity;
    const y = Math.sin(angle * Math.PI / 180) * velocity;
    const rotation = Math.random() * 720 - 360;
    const size = 4 + Math.random() * 8;
    const delay = Math.random() * 0.3;
    const duration = 1.5 + Math.random() * 1.5;
    const color = randomColor();
    const shape = Math.random() > 0.5 ? 'circle' : 'rect';

    const style = {
        position: 'absolute',
        left: '50%',
        top: '45%',
        width: `${size}px`,
        height: shape === 'rect' ? `${size * 0.6}px` : `${size}px`,
        backgroundColor: color,
        borderRadius: shape === 'circle' ? '50%' : '2px',
        opacity: 1,
        transform: 'translate(-50%, -50%)',
        animation: `celebrate-particle ${duration}s ${delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
        '--px': `${x}px`,
        '--py': `${y}px`,
        '--pr': `${rotation}deg`,
        pointerEvents: 'none',
        zIndex: 100001,
    };

    return <div key={index} style={style} />;
}

export default function MilestoneCelebration({ milestone, onComplete }) {
    const [isVisible, setIsVisible] = useState(false);
    const [isFading, setIsFading] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (milestone) {
            setIsVisible(true);
            setIsFading(false);
            playCelebrationSound();

            // Start fade-out before removal
            timerRef.current = setTimeout(() => {
                setIsFading(true);
            }, CELEBRATION_DURATION - 800);

            // Remove completely
            const removeTimer = setTimeout(() => {
                setIsVisible(false);
                onComplete?.();
            }, CELEBRATION_DURATION);

            return () => {
                clearTimeout(timerRef.current);
                clearTimeout(removeTimer);
            };
        }
    }, [milestone, onComplete]);

    if (!isVisible || !milestone) return null;

    const isMaxLevel = milestone.isMaxLevel;
    const emoji = isMaxLevel ? '🏆' : '⭐';
    const title = isMaxLevel ? 'MAX LEVEL!' : 'NODE UNLOCKED!';
    const subtitle = milestone.nodeName || 'Unknown Node';
    const levelText = isMaxLevel
        ? `Level ${milestone.level} — Maximum Dosaženo!`
        : `Level ${milestone.level} Odemčen`;

    return (
        <div className={`milestone-celebration-overlay ${isFading ? 'fading' : ''}`}>
            {/* Particles */}
            <div className="milestone-particles">
                {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
                    <Particle key={i} index={i} />
                ))}
            </div>

            {/* Central card */}
            <div className={`milestone-card ${isMaxLevel ? 'max-level' : 'unlock'}`}>
                <div className="milestone-emoji">{emoji}</div>
                <div className="milestone-title">{title}</div>
                <div className="milestone-subtitle">{subtitle}</div>
                <div className="milestone-level">{levelText}</div>
                {isMaxLevel && (
                    <div className="milestone-sparkle-ring" />
                )}
            </div>
        </div>
    );
}
