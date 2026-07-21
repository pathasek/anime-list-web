import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const LIGHT_THEMES = ['pastel-light', 'excel-table'];

const THEMES = [
    { id: 'neon-dark', label: 'Neon Dark', icon: '🌌', description: 'Výchozí tmavý neonový styl' },
    { id: 'retro-8bit', label: 'Retro 8-bit', icon: '🕹️', description: 'Pixelový retro herní styl' },
    { id: 'pastel-light', label: 'Pastel Light', icon: '🌸', description: 'Jemný pastelový světlý styl' },
    { id: 'excel-table', label: 'Excel Classic', icon: '📊', description: 'Čistý tabulkový Excel-like styl' },
    { id: 'rezero', label: 'Re:Zero', icon: '💎', description: 'Exkluzivní fialovo-stříbrné téma s krystalem a miasmatem' },
    { id: 'cyberpunk', label: 'Cyberpunk', icon: '⚡', description: 'Neonově růžový a azurový kyberpunkový styl' },
    { id: 'scarlet-outline', label: 'Scarlet Outline', icon: '🌹', description: 'Temně karmínové téma inspirované červenými obrysy v anime (R7 bright rose, R3 deep crimson)' },
    { id: 'obsidian-grey', label: 'Obsidian Grey', icon: '⚙️', description: 'Minimalistický grafitový design' },
    { id: 'emerald-forest', label: 'Emerald Forest', icon: '🍃', description: 'Hluboký lesní a mátový design s vysokým kontrastem' },
];

const STORAGE_KEY = 'anime-list-theme';

const ThemeContext = createContext();

// Provider a jeho hook žijí záměrně v jednom souboru (běžný React pattern).
// Fast-refresh varování je tím pádem nerelevantní.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY) || 'neon-dark';
            if (typeof document !== 'undefined') {
                document.documentElement.setAttribute('data-theme', saved);
            }
            return saved;
        } catch {
            return 'neon-dark';
        }
    });

    const setTheme = useCallback((newTheme) => {
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', newTheme);
        }
        setThemeState(newTheme);
        try {
            localStorage.setItem(STORAGE_KEY, newTheme);
        } catch { /* localStorage unavailable */ }
    }, []);

    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', theme);

        // Set Chart.js global defaults for light themes
        if (typeof window !== 'undefined') {
            const isLight = LIGHT_THEMES.includes(theme);
            try {
                import('chart.js').then(({ Chart }) => {
                    Chart.defaults.color = isLight ? '#333' : '#fff';
                    Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
                }).catch(() => {});
            } catch { /* chart.js se nenačetl — theme defaults se přeskočí */ }
        }

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
