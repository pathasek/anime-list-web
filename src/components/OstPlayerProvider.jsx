import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import FavoritesOstPlayer from './FavoritesOstPlayer'
import { loadOstSession, saveOstSession, saveOstProgress, clearOstSession } from '../utils/ostSession'

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
    // session = { mode: 'pieces'|'whole', index, tracks, groups, nonce, resume }
    //
    // Po refreshi se session obnoví z localStorage i s pozicí a časem ve stopě,
    // takže hudba naváže tam, kde skončila. `resume` dostane přehrávač jen
    // jednou, při prvním sestavení.
    // Uložená session se čte jen jednou při prvním renderu
    const [restored] = useState(() => loadOstSession())

    const [session, setSession] = useState(() => {
        const saved = restored
        if (!saved) return null
        return {
            mode: saved.mode,
            index: saved.mode === 'whole' ? (saved.groupIdx ?? saved.index ?? 0) : (saved.trackIdx ?? saved.index ?? 0),
            tracks: saved.tracks || [],
            groups: saved.groups || [],
            nonce: 0,
            resume: {
                trackIdx: saved.trackIdx ?? null,
                groupIdx: saved.groupIdx ?? null,
                playlistPos: saved.playlistPos ?? null,
                seconds: saved.seconds ?? 0,
            },
        }
    })
    // Po refreshi se drží stav, ve kterém přehrávač byl. Původně se vždycky
    // maximalizoval kvůli tlačítku „Pokračovat", ale když se hudba rozjede sama,
    // je to jen otravné vyskakování okna. Maximalizuje se proto jen při změně
    // režimu, tedy když se přepne mezi seznamem „Best pieces" a playlisty
    // „As a Whole" (viz openPlayer).
    const [minimized, setMinimized] = useState(() => restored?.minimized ?? false)
    const modeRef = useRef(restored?.mode ?? null)
    const location = useLocation()
    const prevPathRef = useRef(location.pathname)

    // Stav okna si session pamatuje, ať ho refresh neztratí
    useEffect(() => {
        if (session) saveOstProgress({ minimized })
    }, [minimized, session])

    // Při odchodu z /favorites se přehrávač jen minimalizuje (hudba hraje dál)
    useEffect(() => {
        const prev = prevPathRef.current
        prevPathRef.current = location.pathname
        if (session && prev === '/favorites' && location.pathname !== '/favorites') {
            setMinimized(true)
        }
    }, [location.pathname, session])

    const openPlayer = useCallback(({ mode, index = 0, tracks = [], groups = [] }) => {
        // Okno se otevře jen když se mění TYP seznamu (pieces ↔ whole).
        // Spuštění jiného playlistu ve stejném režimu nechá přehrávač tak,
        // jak je: když byl minimalizovaný, minimalizovaný zůstane.
        const modeChanged = modeRef.current !== mode
        modeRef.current = mode

        // Nové spuštění z UI: žádné `resume`, hraje se od začátku vybrané položky
        setSession(prev => ({ mode, index, tracks, groups, nonce: (prev?.nonce || 0) + 1, resume: null }))
        if (modeChanged) setMinimized(false)
        saveOstSession({
            mode, index, tracks, groups,
            trackIdx: mode === 'pieces' ? index : null,
            groupIdx: mode === 'whole' ? index : null,
            playlistPos: null,
            seconds: 0,
            minimized: modeChanged ? false : minimized,
        })
    }, [minimized])

    const closePlayer = useCallback(() => {
        setSession(null)
        setMinimized(false)
        clearOstSession()
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
                    resume={session.resume}
                    isMinimized={minimized}
                    onMinimizeChange={setMinimized}
                    onClose={closePlayer}
                />
            )}
        </OstPlayerContext.Provider>
    )
}
