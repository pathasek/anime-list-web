const LIGHT_THEMES = ['pastel-light', 'excel-table'];

function isLightTheme() {
  try {
    const stored = localStorage.getItem('anime-list-theme');
    if (stored) return LIGHT_THEMES.includes(stored);
  } catch {}
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme') || '';
    return LIGHT_THEMES.includes(attr);
  }
  return false;
}

/**
 * Returns chart colors that adapt to the current theme (light vs dark).
 */
export function getThemeChartColors() {
  const isLight = isLightTheme();

  return {
    text: isLight ? '#333' : '#fff',
    textMuted: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)',
    textFaint: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)',
    grid: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)',
    pointBorder: isLight ? '#333' : '#fff',
    isLight,
  };
}
