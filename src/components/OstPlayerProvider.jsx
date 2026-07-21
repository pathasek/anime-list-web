import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import FavoritesOstPlayer from './FavoritesOstPlayer'

// ============================================================
// Globální stav OST přehrávače (stránka Favourite OP/ED/OST).
// Přehrávač žije nad routami — při odchodu ze stránky /favorites
// se nevypne, jen se minimalizuje do plovoucí ikonky a hraje dál.
// ============================================================

const OstPlayerContext = createContext(null)

// Provider a jeho hook záměrně v jednom souboru (běžný React pattern) →
// fast-refresh varování je nerelevantní.
// eslint-disable-next-line react-refresh/only-export-components
export const useOstPlayer = () => useContext(OstPlayerContext)

export function OstPlayerProvider({ children }) {
    // session = { mode: 'pieces'|'whole', index, tracks, groups, nonce }
    const [session, setSession] = useState(null)
    const [minimized, setMinimized] = useState(false)
    const location = useLocation()
    const prevPathRef = useRef(location.pathname)

    // Při odchodu z /favorites se přehrávač jen minimalizuje (hudba hraje dál)
    useEffect(() => {
        const prev = prevPathRef.current
        prevPathRef.current = location.pathname
        if (session && prev === '/favorites' && location.pathname !== '/favorites') {
            setMinimized(true)
        }
    }, [location.pathname, session])

    const openPlayer = useCallback(({ mode, index = 0, tracks = [], groups = [] }) => {
        setSession(prev => ({ mode, index, tracks, groups, nonce: (prev?.nonce || 0) + 1 }))
        setMinimized(false)
    }, [])

    const closePlayer = useCallback(() => {
        setSession(null)
        setMinimized(false)
    }, [])

    return (
        <OstPlayerContext.Provider value={{ openPlayer, closePlayer }}>
            {children}
            {session && (
                <FavoritesOstPlayer
                    key={`${session.mode}-${session.index}-${session.nonce}`}
                    mode={session.mode}
                    tracks={session.tracks}
                    groups={session.groups}
                    initialIndex={session.index}
                    isMinimized={minimized}
                    onMinimizeChange={setMinimized}
                    onClose={closePlayer}
                />
            )}
        </OstPlayerContext.Provider>
    )
}
