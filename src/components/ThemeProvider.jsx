import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEMES = [
    { id: 'neon-dark', label: 'Neon Dark', icon: '🌌', description: 'Výchozí tmavý neonový styl' },
    { id: 'retro-8bit', label: 'Retro 8-bit', icon: '🕹️', description: 'Pixelový retro herní styl' },
    { id: 'pastel-light', label: 'Pastel Light', icon: '🌸', description: 'Jemný pastelový světlý styl' },
    { id: 'excel-table', label: 'Excel Classic', icon: '📊', description: 'Čistý tabulkový Excel-like styl' },
    { id: 'rezero', label: 'Re:Zero', icon: '💎', description: 'Exkluzivní fialovo-stříbrné téma s krystalem a miasmatem' },
    { id: 'obsidian-grey', label: 'Obsidian Grey', icon: '⚙️', description: 'Minimalistický grafitový design' },
    { id: 'emerald-forest', label: 'Emerald Forest', icon: '🍃', description: 'Hluboký lesní a mátový design s vysokým kontrastem' },
];

const STORAGE_KEY = 'anime-list-theme';

const ThemeContext = createContext();

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'neon-dark';
        } catch {
            return 'neon-dark';
        }
    });

    const setTheme = useCallback((newTheme) => {
        setThemeState(newTheme);
        try {
            localStorage.setItem(STORAGE_KEY, newTheme);
        } catch { /* localStorage unavailable */ }
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        // Remove all theme attributes then set the new one
        root.setAttribute('data-theme', theme);

        return () => {
            root.removeAttribute('data-theme');
        };
    }, [theme]);

    const value = {
        theme,
        setTheme,
        themes: THEMES,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}
