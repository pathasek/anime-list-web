import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import YouTube from 'react-youtube'
import { useModalScrollLock } from '../utils/useModalScrollLock'
import { fetchAnimeThemes } from '../utils/animeThemesService'
import { songsLooselyMatch } from '../utils/mediaMatch'

export function ScrollableText({ text, className, children }) {
    const containerRef = useRef(null)
    const [isOverflowing, setIsOverflowing] = useState(false)
    const [scrollWidth, setScrollWidth] = useState(0)
    const [clientWidth, setClientWidth] = useState(0)

    useEffect(() => {
        const el = containerRef.current
        if (el) {
            const check = () => {
                const hasOverflow = el.scrollWidth > el.clientWidth
                setIsOverflowing(hasOverflow)
                setScrollWidth(el.scrollWidth)
                setClientWidth(el.clientWidth)
            }
            check()
            // Malá prodleva pro případ, že se DOM nebo fonty ještě nestihly vykreslit
            const timer = setTimeout(check, 100)
            return () => clearTimeout(timer)
        }
    }, [text, children])

    const scrollDistance = isOverflowing ? scrollWidth - clientWidth : 0
    const duration = isOverflowing ? Math.max(4, scrollDistance / 25) : 0 // 25px za sekundu, min 4s

    const style = isOverflowing ? {
        '--scroll-dist': `-${scrollDistance}px`,
        '--scroll-duration': `${duration}s`
    } : {}

    return (
        <div 
            ref={containerRef} 
            className={`scrollable-text-container${isOverflowing ? ' overflowing' : ''} ${className || ''}`}
            style={style}
        >
            <span className="scrollable-text-content">
                {children || text}
            </span>
        </div>
    )
}

// Překryvné (modal) přehrávání OP/ED videa z Google Drive.
// Ztmavené pozadí, vlastní <video> s ovládáním + tlačítko fullscreen, zavření (X / Esc / klik do pozadí).
// B3-6: nejdřív zkusí přímé <video autoPlay> (plné ovládání), při selhání
// fallback na GDrive /preview iframe (vyžaduje klik na play — limit Google Drive).
export function VideoModal({ media, onClose, onNext }) {
    // Zamknout scroll pozadí, dokud je video otevřené
    useModalScrollLock(!!media)

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    if (!media) return null

    // Key na url/file_id: nový klip → nový VideoModalInner → čistý state (playMode='video')
    const mediaKey = media.url || media.file_id || 'unknown'

    return createPortal(
        <div className="media-modal-backdrop" onClick={onClose}>
            <VideoModalInner key={mediaKey} media={media} onClose={onClose} onNext={onNext} />
        </div>,
        document.body
    )
}

const isMobileLike = () => window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 900px)').matches

// Najde na AnimeThemes.moe stejnou znělku (typ OP/ED + tolerantní shoda názvu
// písně). Vrací URL videa, nebo null když katalog znělku nemá.
async function findAnimeThemesUrl(media) {
    const wantType = (media.type || '').toUpperCase()
    if (!media.malId || (wantType !== 'OP' && wantType !== 'ED')) return null
    const themes = await fetchAnimeThemes(media.malId)
    const ofType = (themes || []).filter(t => t.type === wantType && t.url && t.url !== media.url)
    if (!ofType.length) return null
    const match = media.song
        ? ofType.find(t => songsLooselyMatch(t.song, media.song))
        : (ofType.length === 1 ? ofType[0] : null)
    return match?.url || null
}

function VideoModalInner({ media, onClose, onNext }) {
    // Pořadí pokusů o přehrání:
    //   PC:    1) 'video' — přímý <video> stream z GDrive (AV1; plné nativní ovládání)
    //          2) 'iframe' — GDrive /preview jako poslední záchrana (omezené Drive UI)
    //   Mobil: 1) 'animethemes' — táž znělka z AnimeThemes.moe, hledá se HNED bez
    //             pokusu o přímý GDrive stream (AV1 + Drive limity na mobilu nefungují;
    //             VP9/H264 z AnimeThemes přehraje i mobil bez AV1 dekodéru)
    //          2) 'video' → 3) 'iframe' — jen když AnimeThemes znělku nemá
    const wantsAtFirst = isMobileLike() && !media.isExtra && !!media.malId
    const [playMode, setPlayMode] = useState(wantsAtFirst ? 'resolving' : 'video')
    const [atUrl, setAtUrl] = useState(null)
    // AnimeThemes lookup už jednou selhal → při chybě videa se znovu nezkouší
    const atFailedRef = useRef(false)

    useEffect(() => {
        if (!wantsAtFirst) return
        let cancelled = false
        findAnimeThemesUrl(media)
            .then(url => {
                if (cancelled) return
                if (url) {
                    setAtUrl(url)
                    setPlayMode('animethemes')
                } else {
                    atFailedRef.current = true
                    setPlayMode('video')
                }
            })
            .catch(() => {
                if (cancelled) return
                atFailedRef.current = true
                setPlayMode('video')
            })
        return () => { cancelled = true }
        // media i wantsAtFirst jsou po dobu života komponenty neměnné (key na url/file_id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const animeTitle = media.anime_display || media.anime_name || media.animeTitle || null
    const subtitle = [
        animeTitle,
        media.label,
        media.artist,
        (media.isExtra || playMode === 'animethemes') ? 'AnimeThemes.moe' : null
    ].filter(Boolean).join(' · ')
    const hasFileId = !!media.file_id

    const onVideoError = async () => {
        if (playMode === 'animethemes') {
            if (hasFileId) setPlayMode('iframe')
            return
        }
        if (playMode !== 'video') return

        // Náhradní stream z AnimeThemes.moe — JEN na mobilech/tabletech a jen
        // pokud už lookup jednou neselhal. Na PC se má při selhání přímého
        // streamu zůstat u GDrive (preview iframe), tam Drive funguje a chci
        // vlastní verze.
        if (isMobileLike() && !atFailedRef.current) {
            try {
                const url = await findAnimeThemesUrl(media)
                if (url) {
                    setAtUrl(url)
                    setPlayMode('animethemes')
                    return
                }
            } catch { /* pokračuje se na iframe */ }
            atFailedRef.current = true
        }

        // Poslední záchrana — GDrive preview iframe
        if (hasFileId) setPlayMode('iframe')
    }

    return (
        <div className="media-modal" onClick={(e) => e.stopPropagation()}>
            <div className="media-modal-header">
                <div className="media-modal-titles">
                    <span className="media-modal-title">{media.song || media.anime_display || 'Videoklip'}</span>
                    {subtitle && <span className="media-modal-subtitle">{subtitle}</span>}
                </div>
                <div className="media-modal-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {onNext && (
                        <button
                            className="media-icon-btn"
                            title="Přehrát další náhodný OP/ED"
                            onClick={onNext}
                            style={{ width: 'auto', padding: '0 10px', gap: '6px', fontSize: '0.8rem', fontWeight: 600 }}
                        >
                            🎲 Další
                        </button>
                    )}
                    <button className="media-icon-btn" title="Zavřít (Esc)" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className={`media-modal-video-wrap${playMode === 'iframe' ? ' is-iframe' : ''}`}>
                {playMode === 'iframe' && hasFileId ? (
                    <div className="media-modal-gdrive-clip">
                        <iframe
                            src={`https://drive.google.com/file/d/${media.file_id}/preview`}
                            width="100%"
                            height="100%"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                            style={{ border: 'none', display: 'block', background: '#000', width: '100%', height: '100%' }}
                        />
                    </div>
                ) : playMode === 'resolving' ? (
                    // Krátká pauza, než se dohledá znělka na AnimeThemes (mobil)
                    <div style={{ width: '100%', height: '100%', background: '#000' }} aria-hidden="true" />
                ) : (
                    <video
                        key={playMode === 'animethemes' ? atUrl : media.url}
                        src={playMode === 'animethemes' ? atUrl : media.url}
                        controls
                        autoPlay
                        playsInline
                        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
                        onError={onVideoError}
                    />
                )}
            </div>
        </div>
    )
}

// Plovoucí přehrávač OST (YouTube) v rohu stránky — objeví se až po spuštění
// a zůstane, dokud ho uživatel nezavře nebo neopustí detail (komponenta se odmountuje).
// Umožňuje minimalizaci na pozadí a přepínání skladeb, pokud jich je více.
export function FloatingOstPlayer({ ost, playlist, onPlayTrack, onClose }) {
    const [isMinimized, setIsMinimized] = useState(false)
    const [isShuffle, setIsShuffle] = useState(false)
    const [player, setPlayer] = useState(null)
    const [playlistTracks, setPlaylistTracks] = useState([])
    const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(-1)

    const userActionRef = useRef(false)
    const lastPosRef = useRef(-1)

    if (!ost) return null

    const visibleTracks = (playlist || []).filter(t => t.kind === 'youtube')
    const displayTracks = ost.kind === 'youtube-playlist' ? playlistTracks : visibleTracks

    const opts = {
        height: '100%',
        width: '100%',
        playerVars: { 
            autoplay: 1, 
            rel: 0, 
            modestbranding: 1,
            ...(ost.kind === 'youtube-playlist' ? { listType: 'playlist', list: ost.ytPlaylistId } : {})
        },
    }

    const toggleShuffle = () => {
        setIsShuffle(prev => !prev)
    }

    const onPlayerReady = (event) => {
        const p = event.target
        setPlayer(p)
        
        if (ost.kind === 'youtube-playlist') {
            const ids = p.getPlaylist() || []
            const initialTracks = ids.map((id, index) => ({
                kind: 'youtube',
                ytId: id,
                song: `Skladba ${index + 1}`,
            }))
            setPlaylistTracks(initialTracks)
            const initialPos = p.getPlaylistIndex()
            setCurrentPlaylistIndex(initialPos)
            userActionRef.current = true
            lastPosRef.current = initialPos
            
            // Asynchronne nacteme nazvy skladeb z noembed
            ids.forEach((id) => {
                fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`)
                    .then(r => r.json())
                    .then(data => {
                        setPlaylistTracks(prev => prev.map(t => 
                            t.ytId === id ? { ...t, song: data.title || t.song } : t
                        ))
                    })
                    .catch(() => {})
            })
        }
    }

    const onPlayerStateChange = (event) => {
        const p = event.target
        if (ost.kind === 'youtube-playlist') {
            const pos = p.getPlaylistIndex()
            setCurrentPlaylistIndex(pos)

            // State 1 = PLAYING
            if (event.data === 1) {
                if (userActionRef.current) {
                    userActionRef.current = false
                    lastPosRef.current = pos
                } else if (isShuffle && pos !== lastPosRef.current && lastPosRef.current !== -1) {
                    // YouTube auto-advanced naturally to next track (pos = lastPosRef + 1),
                    // but Shuffle is ON -> intercept and play a random track instead!
                    const ids = p.getPlaylist() || playlistTracks.map(t => t.ytId)
                    if (ids.length > 1) {
                        let randomIndex = lastPosRef.current
                        while (randomIndex === lastPosRef.current) {
                            randomIndex = Math.floor(Math.random() * ids.length)
                        }
                        userActionRef.current = true
                        lastPosRef.current = randomIndex
                        p.playVideoAt(randomIndex)
                    }
                } else {
                    lastPosRef.current = pos
                }
            }
        }
    }

    const handleTrackClick = (track, index) => {
        if (ost.kind === 'youtube-playlist') {
            if (player) {
                userActionRef.current = true
                lastPosRef.current = index
                player.playVideoAt(index)
            }
        } else {
            onPlayTrack(track)
        }
    }

    const playNext = () => {
        if (ost.kind === 'youtube-playlist') {
            if (player) {
                if (isShuffle) {
                    const ids = player.getPlaylist() || playlistTracks.map(t => t.ytId)
                    if (ids.length > 1) {
                        const currentIndex = player.getPlaylistIndex()
                        let randomIndex = currentIndex
                        while (randomIndex === currentIndex) {
                            randomIndex = Math.floor(Math.random() * ids.length)
                        }
                        userActionRef.current = true
                        lastPosRef.current = randomIndex
                        player.playVideoAt(randomIndex)
                        return
                    }
                }
                if (typeof player.nextVideo === 'function') {
                    userActionRef.current = true
                    player.nextVideo()
                }
            }
            return
        }
        if (!playlist || playlist.length <= 1) return
        
        // Pouze stopy hratelné uvnitř přehrávače
        const playable = playlist.filter(t => t.kind === 'youtube' || t.kind === 'youtube-playlist')
        if (playable.length <= 1) return

        const currentIndex = playable.findIndex(t => 
            t.kind === 'youtube-playlist' 
                ? ost.kind === 'youtube-playlist' && t.ytPlaylistId === ost.ytPlaylistId
                : ost.kind === 'youtube' && t.ytId === ost.ytId
        )

        let nextTrack
        if (isShuffle) {
            const others = playable.filter((_, idx) => idx !== currentIndex)
            if (others.length > 0) {
                nextTrack = others[Math.floor(Math.random() * others.length)]
            } else {
                nextTrack = playable[0]
            }
        } else {
            const nextIndex = (currentIndex + 1) % playable.length
            nextTrack = playable[nextIndex]
        }

        if (nextTrack) {
            onPlayTrack(nextTrack)
        }
    }

    const handleEnd = () => {
        if (ost.kind === 'youtube-playlist') {
            // YouTube playlist auto-advance is handled inside onPlayerStateChange
            return
        }
        playNext()
    }

    return createPortal(
        <>
            {isMinimized && (
                <button
                    className="ost-minimized-btn"
                    onClick={() => setIsMinimized(false)}
                    title={`Přehrává se: ${ost.song || 'OST'}. Kliknutím maximalizujete.`}
                >
                    <span className="ost-minimized-note">🎵</span>
                    <div className="ost-minimized-waves">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </button>
            )}

            <div className={`ost-floating-player${isMinimized ? ' minimized' : ''}`}>
                <div className="ost-floating-header">
                    <span className="ost-floating-title" title={ost.song || 'OST'}>
                        <span className="ost-floating-badge">{ost.label || 'OST'}</span>
                        <ScrollableText text={ost.song || 'OST'}>
                            {ost.song || 'OST'}
                            {ost.isBestPiece && (
                                <span className="best-piece-title-tag"> (Best Pieces)</span>
                            )}
                        </ScrollableText>
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
                        key={ost.kind === 'youtube-playlist' ? ost.ytPlaylistId : ost.ytId}
                        {...(ost.kind === 'youtube-playlist' ? {} : { videoId: ost.ytId })}
                        opts={opts} 
                        onReady={onPlayerReady}
                        onStateChange={onPlayerStateChange}
                        onEnd={handleEnd}
                        style={{ width: '100%', height: '100%' }} 
                    />
                </div>

                {displayTracks && displayTracks.length > 0 && (
                    <div className="ost-floating-playlist">
                        <div className="ost-playlist-header">
                            <span>Další skladby ({displayTracks.length}):</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                {displayTracks.length > 1 && (
                                    <button
                                        type="button"
                                        className="ost-shuffle-btn"
                                        onClick={playNext}
                                        title="Přehrát další skladbu"
                                    >
                                        ⏭️ Next song
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={`ost-shuffle-btn${isShuffle ? ' active' : ''}`}
                                    onClick={toggleShuffle}
                                    title={isShuffle ? "Vypnout náhodné přehrávání" : "Zapnout náhodné přehrávání"}
                                >
                                    🔀 Shuffle
                                </button>
                            </div>
                        </div>
                        <div className="ost-playlist-list">
                            {displayTracks.map((track, i) => {
                                const isActive = ost.kind === 'youtube-playlist'
                                    ? i === currentPlaylistIndex
                                    : ost.kind === 'youtube' && track.ytId === ost.ytId;
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        className={`ost-playlist-item${isActive ? ' active' : ''}`}
                                        onClick={() => handleTrackClick(track, i)}
                                        disabled={isActive}
                                    >
                                        <span className="ost-playlist-item-num">{i + 1}.</span>
                                        <span className="ost-playlist-item-title" title={track.song}>
                                            <ScrollableText text={track.song || `Soundtrack ${i + 1}`}>
                                                {track.song || `Soundtrack ${i + 1}`}
                                                {track.isBestPiece && (
                                                    <span className="best-piece-tag"> (Best Pieces)</span>
                                                )}
                                            </ScrollableText>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </>,
        document.body
    )
}
