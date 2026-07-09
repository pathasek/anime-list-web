import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AnimeList from './pages/AnimeList'
import AnimeDetail from './pages/AnimeDetail'
import HistoryLog from './pages/HistoryLog'
import Favorites from './pages/Favorites'
import PlanToWatch from './pages/PlanToWatch'
import AnimeRatings from './pages/AnimeRatings'
import TopFavorites from './pages/TopFavorites'
import StatsTree from './pages/StatsTree'
import Wrapped from './pages/Wrapped'
import Recommendations from './pages/Recommendations'
import { ThemeProvider, useTheme } from './components/ThemeProvider'
import ThemeSwitcher from './components/ThemeSwitcher'
import { OstPlayerProvider } from './components/OstPlayerProvider'
import { runBackgroundSync, importJikanStaticCache } from './utils/jikanService'
import { preloadAllData } from './utils/dataStore'
import './index.css'

// Icons as simple SVG components
const Icons = {
  Dashboard: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  List: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  History: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Music: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
    </svg>
  ),
  Bookmark: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  ),
  Chart: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  ),
  Tree: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14v4h-2v-4a2 2 0 0 1-2-2h-3v-2h3v-2H6V8h3a2 2 0 0 1 2-2v-2h2v2a2 2 0 0 1 2 2h3v2h-3v2h3v2h-3a2 2 0 0 1-2 2z" />
    </svg>
  ),
  Star: () => (
    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.382-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  Logo: () => {
    const { theme } = useTheme();
    if (theme === 'rezero') {
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="70 20 470 470" width="32" height="32" className="rezero-logo">
          <title>Gospel – Re:Zero (Tome of Wisdom) icon</title>
          <desc>Black leather-bound tome in 3/4 view with ornate cover panels, emblem, cream pages and warm rim light.</desc>
          <defs>
            <linearGradient id="coverGrad" gradientUnits="userSpaceOnUse" x1="390" y1="95" x2="185" y2="335">
              <stop offset="0" stopColor="#373044"/>
              <stop offset="0.45" stopColor="#1e1a27"/>
              <stop offset="1" stopColor="#121017"/>
            </linearGradient>
            <linearGradient id="spineGrad" gradientUnits="userSpaceOnUse" x1="140" y1="150" x2="220" y2="400">
              <stop offset="0" stopColor="#241f30"/>
              <stop offset="1" stopColor="#0d0b11"/>
            </linearGradient>
            <linearGradient id="pagesGrad" gradientUnits="userSpaceOnUse" x1="456" y1="294" x2="214" y2="385">
              <stop offset="0" stopColor="#f6ecd4"/>
              <stop offset="0.55" stopColor="#e0d0ac"/>
              <stop offset="1" stopColor="#bda879"/>
            </linearGradient>
            <linearGradient id="rimWarm" gradientUnits="userSpaceOnUse" x1="140" y1="140" x2="455" y2="285">
              <stop offset="0" stopColor="#9a6cc9"/>
              <stop offset="0.45" stopColor="#e8935a"/>
              <stop offset="1" stopColor="#f7ad60"/>
            </linearGradient>
            <linearGradient id="rimPurple" gradientUnits="userSpaceOnUse" x1="150" y1="204" x2="218" y2="396">
              <stop offset="0" stopColor="#8b5cf6"/>
              <stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/>
            </linearGradient>
            <radialGradient id="glowOrange" gradientUnits="userSpaceOnUse" cx="310" cy="400" r="210">
              <stop offset="0" stopColor="#f59e4b" stopOpacity="0.45"/>
              <stop offset="0.6" stopColor="#f59e4b" stopOpacity="0.14"/>
              <stop offset="1" stopColor="#f59e4b" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="glowPurple" gradientUnits="userSpaceOnUse" cx="175" cy="175" r="160">
              <stop offset="0" stopColor="#7c3aed" stopOpacity="0.28"/>
              <stop offset="1" stopColor="#7c3aed" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="sheen" gradientUnits="userSpaceOnUse" cx="150" cy="55" r="120">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.14"/>
              <stop offset="1" stopColor="#ffffff" stopOpacity="0"/>
            </radialGradient>
            <clipPath id="coverClip">
              <rect x="0" y="0" width="200" height="280"/>
            </clipPath>
            <clipPath id="spineClip">
              <path d="M140,140 L205,330 L215,394 Q175,302 150,204 Z"/>
            </clipPath>
          </defs>

          {/* Soft ambient glow (delete this group for a fully flat icon) */}
          <g id="glow">
            <ellipse cx="310" cy="398" rx="165" ry="36" fill="url(#glowOrange)" opacity="0.65"/>
            <ellipse cx="180" cy="180" rx="95" ry="78" fill="url(#glowPurple)" opacity="0.55"/>
          </g>

          {/* Spine (left face, slightly bowed leather with raised bands) */}
          <g id="spine">
            <path d="M140,140 L205,330 L215,394 Q175,302 150,204 Z" fill="url(#spineGrad)"/>
            <path d="M215,394 Q175,302 150,204 L140,140" fill="none" stroke="url(#rimPurple)" strokeWidth="2" strokeLinecap="round" opacity="0.85"/>
            {/* raised bands */}
            <g strokeLinecap="round" clipPath="url(#spineClip)">
              <path d="M153,178 L161,240" stroke="#322c3e" strokeWidth="5"/>
              <path d="M167.3,219.8 L174.8,285" stroke="#322c3e" strokeWidth="5"/>
              <path d="M181,254 L186,321" stroke="#322c3e" strokeWidth="5"/>
              <path d="M194.3,296.8 L200.3,362" stroke="#322c3e" strokeWidth="4.5"/>
              <path d="M152,178 L160,239" stroke="#4a4258" strokeWidth="1.4" opacity="0.9"/>
              <path d="M166.3,219.6 L173.8,284" stroke="#4a4258" strokeWidth="1.4" opacity="0.9"/>
              <path d="M180,253.8 L185,320" stroke="#4a4258" strokeWidth="1.4" opacity="0.9"/>
              <path d="M193.3,296.5 L199.3,361" stroke="#4a4258" strokeWidth="1.3" opacity="0.9"/>
            </g>
            <path d="M140,140 L205,330" stroke="#000000" strokeWidth="2" opacity="0.35"/>
          </g>

          {/* Bottom (tail) side: cover edge, page block, back cover */}
          <g id="tail">
            <path d="M205,330 L455,285 L456.5,294 L206.5,339 Z" fill="#14111a"/>
            <path d="M206.5,339 L456.5,294 L463.5,340 L213.5,385 Z" fill="url(#pagesGrad)"/>
            <path d="M213.5,385 L463.5,340 L465,349 L215,394 Z" fill="#0d0b10"/>

            {/* page stack lines */}
            <g stroke="#9c8b6a" strokeWidth="1.2" opacity="0.7">
              <path d="M208,349.1 L458,304.1"/>
              <path d="M209.7,359.7 L459.7,314.7"/>
              <path d="M211.3,370.3 L461.3,325.3"/>
              <path d="M212.5,378.1 L462.5,333.1"/>
            </g>
            {/* anime-style ink hatching near the edges */}
            <g stroke="#6f5e41" strokeLinecap="round" opacity="0.85">
              <path d="M208,345.5 L272,334" strokeWidth="2.4"/>
              <path d="M209.5,356.5 L259.5,347.5" strokeWidth="2"/>
              <path d="M211.5,369 L281.5,356.4" strokeWidth="1.8"/>
              <path d="M459.5,306 L396.5,317.3" strokeWidth="2.2"/>
              <path d="M461.5,322 L413.5,330.6" strokeWidth="1.8"/>
              <path d="M462.5,334.5 L430.5,340.2" strokeWidth="1.6"/>
            </g>
            {/* warm light on the page edge */}
            <path d="M206.5,339 L456.5,294" stroke="#f2b273" strokeWidth="1.2" opacity="0.6"/>
          </g>

          {/* Front cover (top face) */}
          <path id="cover" d="M140,140 L390,95 L455,285 L205,330 Z" fill="url(#coverGrad)"/>

          {/* Cover decorations, drawn flat and skewed into the cover plane */}
          <g transform="matrix(1.25 -0.225 0.232143 0.678571 140 140)" clipPath="url(#coverClip)">
            <circle cx="150" cy="55" r="120" fill="url(#sheen)"/>

            {/* double frame */}
            <rect x="12" y="12" width="176" height="256" rx="8" fill="none" stroke="#6f6353" strokeWidth="1.6" opacity="0.95" vectorEffect="non-scaling-stroke"/>
            <rect x="20" y="20" width="160" height="240" rx="6" fill="none" stroke="#453d51" strokeWidth="1" opacity="0.85" vectorEffect="non-scaling-stroke"/>

            {/* top panel */}
            <rect x="34" y="32" width="132" height="40" rx="4" fill="#242030" stroke="#5a5064" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>
            <rect x="39" y="37" width="122" height="30" rx="3" fill="none" stroke="#3a3345" strokeWidth="1" vectorEffect="non-scaling-stroke"/>

            {/* bottom panel */}
            <rect x="34" y="208" width="132" height="40" rx="4" fill="#242030" stroke="#5a5064" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/>
            <rect x="39" y="213" width="122" height="30" rx="3" fill="none" stroke="#3a3345" strokeWidth="1" vectorEffect="non-scaling-stroke"/>

            {/* central emblem: two scalloped wings + central plate */}
            <g fill="#0b0a10" stroke="#5c4f78" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
              <path d="M88,114 C70,105 57,111 55,124 C41,120 31,130 33,140 C31,150 41,160 55,156 C57,169 70,175 88,166 Z" vectorEffect="non-scaling-stroke"/>
              <path d="M88,114 C70,105 57,111 55,124 C41,120 31,130 33,140 C31,150 41,160 55,156 C57,169 70,175 88,166 Z" transform="translate(200 0) scale(-1 1)" vectorEffect="non-scaling-stroke"/>
              <rect x="90" y="110" width="20" height="60" rx="2" vectorEffect="non-scaling-stroke"/>
            </g>
            <rect x="93.5" y="114" width="13" height="52" rx="1.5" fill="none" stroke="#7a6a95" strokeWidth="0.8" opacity="0.6" vectorEffect="non-scaling-stroke"/>
          </g>

          {/* Rim light along the lit edges */}
          <path d="M140,140 L390,95 L455,285" fill="none" stroke="url(#rimWarm)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.95"/>
        </svg>
      );
    }
    return (
      <svg width="32" height="32" viewBox="0 0 24 24">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="var(--accent-primary, #6366f1)" />
      </svg>
    );
  },
  Menu: () => (
    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  Close: () => (
    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// Wrapper component to handle sidebar close on navigation
function AppContent({ stats }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const handleNavClick = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <header className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <Icons.Close /> : <Icons.Menu />}
        </button>
        <div className="mobile-logo">
          <Icons.Logo />
          <span>Anime List</span>
        </div>
      </header>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Icons.Logo />
          <h1>Anime List</h1>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Dashboard />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/anime" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.List />
            <span>Anime List</span>
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => {
            sessionStorage.removeItem('history_log_scroll_y');
            sessionStorage.removeItem('history_log_visible_count');
            handleNavClick();
          }}>
            <Icons.History />
            <span>History Log</span>
          </NavLink>
          <NavLink to="/ratings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Chart />
            <span>Anime hodnocení</span>
          </NavLink>
          <NavLink to="/top-favorites" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <span style={{ fontSize: '1.2rem', paddingRight: '0.4rem' }}>🏆</span>
            <span>Top Favorites</span>
          </NavLink>
          <NavLink to="/favorites" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Music />
            <span>Favourite OP/ED/OST</span>
          </NavLink>
          <NavLink to="/plan-to-watch" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Bookmark />
            <span>Plan to Watch</span>
          </NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Star />
            <span>Recommendations</span>
          </NavLink>
          <NavLink to="/stats-tree" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Tree />
            <span>Research Tree</span>
          </NavLink>
          <NavLink to="/wrapped" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <span style={{ fontSize: '1.2rem', paddingRight: '0.4rem' }}>🎁</span>
            <span>Anime Wrapped</span>
          </NavLink>
        </nav>

        <ThemeSwitcher />

        {/* Stats in sidebar footer */}
        {stats && (
          <div style={{
            marginTop: 'auto',
            padding: 'var(--spacing-md)',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem'
          }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Poslední aktualizace</div>
            <div style={{ color: 'var(--accent-primary)', fontWeight: '600' }}>
              {stats.last_update ? new Date(stats.last_update).toLocaleDateString('cs-CZ') : 'N/A'}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/anime" element={<AnimeList />}>
            <Route path=":name" element={<AnimeDetail />} />
          </Route>
          <Route path="/ratings" element={<AnimeRatings />} />
          <Route path="/top-favorites" element={<TopFavorites />} />
          <Route path="/history" element={<HistoryLog />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/plan-to-watch" element={<PlanToWatch />} />
          <Route path="/recommendations" element={<Recommendations />} />
          <Route path="/stats-tree" element={<StatsTree />} />
          <Route path="/wrapped" element={<Wrapped />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    // Preload all list and detail data in the background
    preloadAllData()

    fetch('data/stats.json')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to load stats:', err))

    // Start background download for Jikan API v4 episodes 24/7 across the entire application
    fetch('data/anime_list.json')
      .then(res => res.json())
      .then(al => {
        // First bulk import the static cache deployed on the server
        fetch('data/jikan_cache.json')
          .then(res => {
            if (!res.ok) throw new Error('Static Jikan cache not available on server');
            return res.json();
          })
          .then(async (staticCache) => {
            await importJikanStaticCache(staticCache);
            runBackgroundSync(al);
          })
          .catch(err => {
            console.warn('[Jikan] Could not load static cache on startup, running clean downloader:', err);
            runBackgroundSync(al);
          });
      })
      .catch(err => console.error('Failed to start Jikan downloader in App:', err))
  }, [])

  return (
    <ThemeProvider>
      <HashRouter>
        <OstPlayerProvider>
          <AppContent stats={stats} />
        </OstPlayerProvider>
      </HashRouter>
    </ThemeProvider>
  )
}

export default App

