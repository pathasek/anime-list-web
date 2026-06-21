import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';

const renderThemeIcon = (themeId, defaultIcon) => {
    switch (themeId) {
        case 'rezero':
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
                    <img 
                        src="/images/rezero-insignia.svg" 
                        alt="Re:Zero" 
                        style={{ width: '20px', height: '20px', objectFit: 'contain', filter: 'drop-shadow(0 0 3px rgba(207,156,69,0.4))' }} 
                    />
                </span>
            );
        case 'obsidian-grey':
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="obs-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#e2e8f0" />
                                <stop offset="100%" stopColor="#475569" />
                            </linearGradient>
                        </defs>
                        <polygon points="12,2 20,6 20,18 12,22 4,18 4,6" stroke="#94a3b8" strokeWidth="1.5" fill="rgba(148,163,184,0.08)" />
                        <polygon points="12,5 17,8 17,16 12,19 7,16 7,8" fill="url(#obs-grad)" opacity="0.2" />
                        <line x1="12" y1="2" x2="12" y2="22" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                        <line x1="4" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                    </svg>
                </span>
            );
        case 'emerald-forest':
            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 2px rgba(52,211,153,0.5))' }}>
                        <defs>
                            <linearGradient id="em-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#34d399" />
                                <stop offset="100%" stopColor="#059669" />
                            </linearGradient>
                        </defs>
                        <path d="M12,2 C17,6 20,12 18,17 C16,21 12,22 12,22 C12,22 8,21 6,17 C4,12 7,6 12,2 Z" stroke="#34d399" strokeWidth="1.5" fill="rgba(52,211,153,0.12)" />
                        <path d="M12,6 C15,9 17,13 15.5,16 C14.5,18.5 12,19.5 12,19.5 C12,19.5 9.5,18.5 8.5,16 C7,13 9,9 12,6 Z" fill="url(#em-grad)" opacity="0.35" />
                        <line x1="12" y1="6" x2="12" y2="20" stroke="#34d399" strokeWidth="0.8" opacity="0.5" />
                        <path d="M12,10 Q9,13 10,16" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.4" />
                        <path d="M12,10 Q15,13 14,16" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.4" />
                    </svg>
                </span>
            );
        default:
            return defaultIcon;
    }
};

export default function ThemeSwitcher() {
    const { theme, setTheme, themes } = useTheme();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="theme-switcher">
            <button
                className="theme-switcher-toggle"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Přepnout téma"
                title="Přepnout grafické téma"
            >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                <span>Téma</span>
            </button>

            {isOpen && (
                <div className="theme-switcher-panel">
                    <div className="theme-switcher-header">
                        <span>Grafické téma</span>
                        <button
                            className="theme-switcher-close"
                            onClick={() => setIsOpen(false)}
                            aria-label="Zavřít"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="theme-switcher-options">
                        {themes.map(t => (
                            <button
                                key={t.id}
                                className={`theme-option ${theme === t.id ? 'active' : ''}`}
                                onClick={() => {
                                    setTheme(t.id);
                                    setIsOpen(false);
                                }}
                                title={t.description}
                            >
                                <span className="theme-option-icon">{renderThemeIcon(t.id, t.icon)}</span>
                                <span className="theme-option-label">{t.label}</span>
                                {theme === t.id && (
                                    <span className="theme-option-check">✓</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
