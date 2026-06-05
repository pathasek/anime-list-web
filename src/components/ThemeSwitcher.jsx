import React, { useState } from 'react';
import { useTheme } from './ThemeProvider';

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
                                <span className="theme-option-icon">{t.icon}</span>
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
