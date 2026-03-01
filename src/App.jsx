import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AnimeList from './pages/AnimeList'
import AnimeDetail from './pages/AnimeDetail'
import HistoryLog from './pages/HistoryLog'
import Favorites from './pages/Favorites'
import PlanToWatch from './pages/PlanToWatch'
import TopFavorites from './pages/TopFavorites'
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
  Logo: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="url(#gradient)">
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
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
          <NavLink to="/history" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.History />
            <span>History Log</span>
          </NavLink>
          <NavLink to="/favorites" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Music />
            <span>Favourite OP/ED/OST</span>
          </NavLink>
          <NavLink to="/plan-to-watch" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <Icons.Bookmark />
            <span>Plan to Watch</span>
          </NavLink>
          <NavLink to="/top-favorites" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={handleNavClick}>
            <span style={{ fontSize: '1.2rem', paddingRight: '0.4rem' }}>🏆</span>
            <span>Top Favorites</span>
          </NavLink>
        </nav>

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
          <Route path="/anime" element={<AnimeList />} />
          <Route path="/anime/:name" element={<AnimeDetail />} />
          <Route path="/history" element={<HistoryLog />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/plan-to-watch" element={<PlanToWatch />} />
          <Route path="/top-favorites" element={<TopFavorites />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('data/stats.json')
      .then(res => res.json())
      .then(data => setStats(data))
      .catch(err => console.error('Failed to load stats:', err))
  }, [])

  return (
    <HashRouter>
      <AppContent stats={stats} />
    </HashRouter>
  )
}

export default App

