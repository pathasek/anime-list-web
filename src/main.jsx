import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Clear HistoryLog state on app load (e.g. F5 reload)
sessionStorage.removeItem('history_log_scroll_y');
sessionStorage.removeItem('history_log_visible_count');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
