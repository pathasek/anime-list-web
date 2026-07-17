import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import YouTube from 'react-youtube'
import { ScrollableText } from './CategoryMediaPlayers'

// ============================================================
// Plovoucí OST přehrávač pro stránku Favourite OP/ED/OST.
// (Přehrávač v detailu anime — FloatingOstPlayer — zůstává beze změny.)
//
// mode 'pieces': plochý playlist všech skladeb "OST Only (The Best)".
//                Chová se jako přehrávač v detailu — seznam skladeb,
//                shuffle, u každého řádku tlačítko přehrát.
// mode 'whole' : "OST As a Whole" — všechny YouTube playlisty seskupené
//                podle anime/série. Skupiny jdou rozbalit a jednotlivé
//                skladby přehrát. Skladby skupiny se načtou při prvním
//                přehrání playlistu (YouTube je jinak neposkytne).
// ============================================================

const PlaySmallIcon = () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
    </svg>
)

export default function FavoritesOstPlayer({ mode, tracks = [], groups = [], initialIndex = 0, onClose, isMinimized: minimizedProp, onMinimizeChange }) {
    // Minimalizaci může řídit rodič (OstPlayerProvider) — přehrávač pak přežívá
    // navigaci mezi stránkami; bez props funguje postaru s vlastním stavem.
    const [internalMinimized, setInternalMinimized] = useState(false)
    const isMinimized = minimizedProp !== undefined ? minimizedProp : internalMinimized
    const setIsMinimized = onMinimizeChange !== undefined ? onMinimizeChange : setInternalMinimized
    const [isShuffle, setIsShuffle] = useState(false)

    // ---- pieces mode ----
    const [trackIdx, setTrackIdx] = useState(mode === 'pieces' ? initialIndex : 0)

    // ---- whole mode ----
    const [groupIdx, setGroupIdx] = useState(mode === 'whole' ? initialIndex : 0)
    const [player, setPlayer] = useState(null)
    const [playlistPos, setPlaylistPos] = useState(-1)
    const [tracksByGroup, setTracksByGroup] = useState({})   // { groupIdx: [{ytId, song}] }
    const [expandedGroups, setExpandedGroups] = useState(() => new Set([initialIndex]))
    const pendingTrackRef = useRef(null) // index skladby, která se má pustit po načtení playlistu
    const userActionRef = useRef(false)
    const lastPosRef = useRef(-1)

    const activeListRef = useRef(null)

    // Auto-scroll na aktivní položku v seznamu
    useEffect(() => {
        const el = activeListRef.current?.querySelector('.ost-playlist-item.active')
        if (el) el.scrollIntoView({ block: 'nearest' })
    }, [trackIdx, playlistPos, groupIdx])

    const isWhole = mode === 'whole'
    const currentTrack = !isWhole ? tracks[trackIdx] : null
    const currentGroup = isWhole ? groups[groupIdx] : null

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            ...(isWhole ? { listType: 'playlist', list: currentGroup?.playlistId } : {})
        },
    }

    const toggleShuffle = () => {
        setIsShuffle(prev => !prev)
    }

    // ---- pieces: navigace ----
    const playNextPiece = () => {
        if (tracks.length <= 1) return
        if (isShuffle) {
            let next = trackIdx
            while (next === trackIdx) next = Math.floor(Math.random() * tracks.length)
            setTrackIdx(next)
        } else {
            setTrackIdx((trackIdx + 1) % tracks.length)
        }
    }

    const playNext = () => {
        if (isWhole) {
            if (player) {
                if (isShuffle) {
                    const ids = player.getPlaylist() || (tracksByGroup[groupIdx] || []).map(t => t.ytId)
                    if (ids.length > 1) {
                        const pos = player.getPlaylistIndex()
                        let next = pos
                        while (next === pos) next = Math.floor(Math.random() * ids.length)
                        userActionRef.current = true
                        lastPosRef.current = next
                        player.playVideoAt(next)
                        return
                    }
                }
                if (typeof player.nextVideo === 'function') {
                    userActionRef.current = true
                    player.nextVideo()
                }
            }
        } else {
            playNextPiece()
        }
    }

    // ---- whole: player callbacks ----
    const onPlayerReady = (event) => {
        const p = event.target
        setPlayer(p)
        if (!isWhole) return

        const ids = p.getPlaylist() || []
        const initialTracks = ids.map((id, i) => ({ ytId: id, song: `Skladba ${i + 1}` }))
        setTracksByGroup(prev => ({ ...prev, [groupIdx]: initialTracks }))
        const pos = p.getPlaylistIndex()
        setPlaylistPos(pos)
        userActionRef.current = true
        lastPosRef.current = pos

        if (pendingTrackRef.current !== null) {
            const idx = pendingTrackRef.current
            pendingTrackRef.current = null
            if (idx >= 0 && idx < ids.length) {
                userActionRef.current = true
                lastPosRef.current = idx
                p.playVideoAt(idx)
            }
        }

        // Názvy skladeb dotáhneme asynchronně přes noembed
        ids.forEach((id) => {
            fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
                .then(r => r.json())
                .then(data => {
                    if (!data?.title) return
                    setTracksByGroup(prev => {
                        const list = prev[groupIdx]
                        if (!list) return prev
                        return {
                            ...prev,
                            [groupIdx]: list.map(t => (t.ytId === id ? { ...t, song: data.title } : t))
                        }
                    })
                })
                .catch(() => {})
        })
    }

    const onPlayerStateChange = (event) => {
        if (!isWhole) return
        const p = event.target
        const pos = p.getPlaylistIndex()
        setPlaylistPos(pos)

        if (event.data === 1) { // PLAYING
            if (userActionRef.current) {
                userActionRef.current = false
                lastPosRef.current = pos
            } else if (isShuffle && pos !== lastPosRef.current && lastPosRef.current !== -1) {
                const ids = p.getPlaylist() || (tracksByGroup[groupIdx] || []).map(t => t.ytId)
                if (ids.length > 1) {
                    let next = lastPosRef.current
                    while (next === lastPosRef.current) {
                        next = Math.floor(Math.random() * ids.length)
                    }
                    userActionRef.current = true
                    lastPosRef.current = next
                    p.playVideoAt(next)
                }
            } else {
                lastPosRef.current = pos
            }
        }
    }

    const handleEnd = () => {
        if (!isWhole) {
            playNextPiece()
            return
        }
        // Auto-advance inside whole playlist is handled by onPlayerStateChange.
        // If at the end of playlist without shuffle, advance to next group:
        if (!player) return
        if (!isShuffle) {
            const ids = player.getPlaylist() || []
            const pos = player.getPlaylistIndex()
            if (pos >= ids.length - 1 && groups.length > 1) {
                activateGroup((groupIdx + 1) % groups.length)
            }
        }
    }

    // Přepnutí aktivní skupiny (načte a spustí její playlist)
    const activateGroup = (idx, trackToPlay = null) => {
        pendingTrackRef.current = trackToPlay
        setPlayer(null)
        setPlaylistPos(-1)
        setGroupIdx(idx)
        setExpandedGroups(prev => new Set(prev).add(idx))
    }

    const toggleGroupExpand = (idx) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(idx)) next.delete(idx)
            else next.add(idx)
            return next
        })
    }

    const handleGroupTrackClick = (gIdx, tIdx) => {
        if (gIdx === groupIdx) {
            if (player) {
                userActionRef.current = true
                lastPosRef.current = tIdx
                player.playVideoAt(tIdx)
            }
        } else {
            activateGroup(gIdx, tIdx)
        }
    }

    const headerTitle = isWhole
        ? (currentGroup?.name || 'OST playlisty')
        : (currentTrack ? `${currentTrack.anime} – ${currentTrack.song}` : 'OST')

    const headerBadge = isWhole ? 'OST · Playlisty' : 'OST · Best'

    return createPortal(
        <>
            {isMinimized && (
                <button
                    className="ost-minimized-btn"
                    onClick={() => setIsMinimized(false)}
                    title={`Přehrává se: ${headerTitle}. Kliknutím maximalizujete.`}
                >
                    <span className="ost-minimized-note">🎵</span>
                    <div className="ost-minimized-waves">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </button>
            )}

            <div className={`ost-floating-player fav-ost-player${isMinimized ? ' minimized' : ''}`}>
                <div className="ost-floating-header">
                    <span className="ost-floating-title" title={headerTitle}>
                        <span className="ost-floating-badge">{headerBadge}</span>
                        <ScrollableText text={headerTitle}>{headerTitle}</ScrollableText>
                    </span>
                    <div className="ost-floating-controls">
                        <button
                            className="media-icon-btn"
                            title="Minimalizovat na pozadí"
                            onClick={() => setIsMinimized(true)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
                            </svg>
                        </button>
                        <button className="media-icon-btn" title="Zavřít" onClick={onClose}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="ost-floating-video">
                    <YouTube
                        key={isWhole ? `pl-${currentGroup?.playlistId}` : `tr-${currentTrack?.ytId}`}
                        {...(isWhole ? {} : { videoId: currentTrack?.ytId })}
                        opts={opts}
                        onReady={onPlayerReady}
                        onStateChange={onPlayerStateChange}
                        onEnd={handleEnd}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>

                {/* ---- pieces: plochý seznam všech skladeb ---- */}
                {!isWhole && tracks.length > 0 && (
                    <div className="ost-floating-playlist fav-ost-playlist">
                        <div className="ost-playlist-header">
                            <span>Skladby ({tracks.length}):</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="ost-shuffle-btn"
                                    onClick={playNext}
                                    title="Přehrát další skladbu"
                                >
                                    ⏭️ Next song
                                </button>
                                <button
                                    type="button"
                                    className={`ost-shuffle-btn${isShuffle ? ' active' : ''}`}
                                    onClick={toggleShuffle}
                                    title={isShuffle ? 'Vypnout náhodné přehrávání' : 'Zapnout náhodné přehrávání'}
                                >
                                    🔀 Shuffle
                                </button>
                            </div>
                        </div>
                        <div className="ost-playlist-list fav-ost-list" ref={activeListRef}>
                            {tracks.map((t, i) => {
                                const isActive = i === trackIdx
                                return (
                                    <button
                                        key={`${t.ytId}-${i}`}
                                        type="button"
                                        className={`ost-playlist-item${isActive ? ' active' : ''}`}
                                        onClick={() => setTrackIdx(i)}
                                        disabled={isActive}
                                    >
                                        <span className="ost-playlist-item-num">{i + 1}.</span>
                                        <span className="ost-playlist-item-title" title={`${t.anime} – ${t.song}`}>
                                            <ScrollableText text={`${t.anime} – ${t.song}`}>
                                                <b>{t.anime}</b> – {t.song}
                                            </ScrollableText>
                                        </span>
                                        <span className="fav-ost-row-play" title="Přehrát">
                                            {isActive ? '♪' : <PlaySmallIcon />}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* ---- whole: skupiny podle anime/série ---- */}
                {isWhole && groups.length > 0 && (
                    <div className="ost-floating-playlist fav-ost-playlist">
                        <div className="ost-playlist-header">
                            <span>Playlisty podle anime ({groups.length}):</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    className="ost-shuffle-btn"
                                    onClick={playNext}
                                    title="Přehrát další skladbu"
                                >
                                    ⏭️ Next song
                                </button>
                                <button
                                    type="button"
                                    className={`ost-shuffle-btn${isShuffle ? ' active' : ''}`}
                                    onClick={toggleShuffle}
                                    title={isShuffle ? 'Vypnout náhodné přehrávání' : 'Zapnout náhodné přehrávání (uvnitř playlistu)'}
                                >
                                    🔀 Shuffle
                                </button>
                            </div>
                        </div>
                        <div className="ost-playlist-list fav-ost-list fav-ost-groups" ref={activeListRef}>
                            {groups.map((g, gIdx) => {
                                const isActiveGroup = gIdx === groupIdx
                                const isExpanded = expandedGroups.has(gIdx)
                                const gTracks = tracksByGroup[gIdx] || null
                                return (
                                    <div key={g.playlistId} className={`fav-ost-group${isActiveGroup ? ' active' : ''}`}>
                                        <div className="fav-ost-group-header">
                                            <button
                                                type="button"
                                                className="fav-ost-group-toggle"
                                                onClick={() => toggleGroupExpand(gIdx)}
                                                title={isExpanded ? 'Sbalit skladby' : 'Rozbalit skladby'}
                                            >
                                                <span className={`fav-ost-caret${isExpanded ? ' open' : ''}`}>▸</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="fav-ost-group-name"
                                                onClick={() => (isActiveGroup ? toggleGroupExpand(gIdx) : activateGroup(gIdx))}
                                                title={isActiveGroup ? g.name : `Přehrát playlist: ${g.name}`}
                                            >
                                                <ScrollableText text={g.name}>{g.name}</ScrollableText>
                                                {gTracks && <span className="fav-ost-group-count">({gTracks.length})</span>}
                                            </button>
                                            <button
                                                type="button"
                                                className="fav-ost-row-play group-play"
                                                onClick={() => (isActiveGroup && player ? player.playVideoAt(0) : activateGroup(gIdx))}
                                                title="Přehrát playlist od začátku"
                                            >
                                                {isActiveGroup ? '♪' : <PlaySmallIcon />}
                                            </button>
                                        </div>
                                        {isExpanded && (
                                            <div className="fav-ost-group-tracks">
                                                {gTracks ? gTracks.map((t, tIdx) => {
                                                    const isActiveTrack = isActiveGroup && tIdx === playlistPos
                                                    return (
                                                        <button
                                                            key={`${t.ytId}-${tIdx}`}
                                                            type="button"
                                                            className={`ost-playlist-item${isActiveTrack ? ' active' : ''}`}
                                                            onClick={() => handleGroupTrackClick(gIdx, tIdx)}
                                                            disabled={isActiveTrack}
                                                        >
                                                            <span className="ost-playlist-item-num">{tIdx + 1}.</span>
                                                            <span className="ost-playlist-item-title" title={t.song}>
                                                                <ScrollableText text={t.song}>{t.song}</ScrollableText>
                                                            </span>
                                                            <span className="fav-ost-row-play" title="Přehrát">
                                                                {isActiveTrack ? '♪' : <PlaySmallIcon />}
                                                            </span>
                                                        </button>
                                                    )
                                                }) : (
                                                    <div className="fav-ost-group-hint">
                                                        Skladby se zobrazí po spuštění playlistu ▸
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </>,
        document.body
    )
}
