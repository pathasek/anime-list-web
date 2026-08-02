import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import YouTube from 'react-youtube'
import { savePlaylistCount } from '../utils/ostPlaylistCounts'
import { cleanTrackTitles } from '../utils/ostTrackTitle'
import { loadOstPrefs, saveOstPrefs, saveOstProgress } from '../utils/ostSession'

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

export default function FavoritesOstPlayer({ mode, tracks = [], groups = [], initialIndex = 0, resume = null, onClose, isMinimized: minimizedProp, onMinimizeChange }) {
    // Minimalizaci může řídit rodič (OstPlayerProvider) — přehrávač pak přežívá
    // navigaci mezi stránkami; bez props funguje postaru s vlastním stavem.
    const [internalMinimized, setInternalMinimized] = useState(false)
    const isMinimized = minimizedProp !== undefined ? minimizedProp : internalMinimized
    const setIsMinimized = onMinimizeChange !== undefined ? onMinimizeChange : setInternalMinimized
    // Shuffle a řazení jsou preference, ne stav přehrávání: drží se napořád,
    // takže se po každém spuštění nemusí zapínat znovu.
    const [isShuffle, setIsShuffle] = useState(() => loadOstPrefs().isShuffle)
    const [sortOrder, setSortOrder] = useState(() => loadOstPrefs().sortOrder) // 'none' | 'newest' | 'oldest'
    useEffect(() => { saveOstPrefs({ isShuffle, sortOrder }) }, [isShuffle, sortOrder])

    // Čas ve stopě, na který se má po obnovení navázat. Použije se jen jednou.
    const resumeSecondsRef = useRef(resume?.seconds || 0)
    const resumePosRef = useRef(resume?.playlistPos ?? null)
    // Skok na uloženou skladbu se nedá udělat hned v onReady: playlist se teprve
    // načítá a `playVideoAt` se v tu chvíli ztratí (přehrávač pak stejně spustí
    // první stopu). Uloží se sem a provede až při prvním skutečném přehrávání.
    const resumeJumpRef = useRef(null)
    // Varianta C: prohlížeč nemusí po refreshi pustit zvuk sám (autoplay policy).
    // Když se do 1,5 s nerozjede, ukáže se přes video tlačítko „Pokračovat".
    const [needsResumeClick, setNeedsResumeClick] = useState(false)
    // Jakmile se přehrávač jednou rozeběhl (hraje nebo aspoň nabírá data), je
    // jisté, že prohlížeč zvuk povolil, a nabídka „Pokračovat" je zbytečná.
    const hasStartedRef = useRef(false)

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

    // Čas, na který se má navázat po refreshi, a skladba, ke které patří.
    // Váže se na konkrétní ytId, takže po přepnutí na jinou skladbu `start`
    // z parametrů sám zmizí a nová skladba začne od začátku.
    const resumeStartRef = useRef(
        !isWhole && resume?.seconds > 0
            ? { ytId: currentTrack?.ytId, secs: Math.floor(resume.seconds) }
            : null
    )
    const startSecs = (resumeStartRef.current && resumeStartRef.current.ytId === currentTrack?.ytId)
        ? resumeStartRef.current.secs
        : 0

    // opts MUSÍ být stabilní. react-youtube porovnává tenhle objekt a při každé
    // změně video znovu načte, tedy od nuly. Když se `start` po načtení vytratil,
    // komponenta si toho všimla a skladbu restartovala: čas se sice do adresy
    // dostal, ale hned se zahodil. Proto useMemo a závislost jen na tom, co se
    // opravdu smí měnit.
    const opts = useMemo(() => ({
        height: '100%',
        width: '100%',
        playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            // Navázání na čas jde JEN v režimu jedné skladby. V playlistu se
            // embed skládá bez ID videa (`/embed/?listType=playlist&list=...`)
            // a `start` je v té kombinaci neplatný parametr: YouTube odpoví
            // chybou 2 a místo hudby ukáže šedé „Došlo k chybě". Tam se na čas
            // doskakuje až po načtení přes seekTo (viz onPlayerStateChange).
            ...(startSecs > 0 ? { start: startSecs } : {}),
            ...(isWhole ? { listType: 'playlist', list: currentGroup?.playlistId } : {})
        },
    }), [isWhole, currentGroup?.playlistId, startSecs])

    const toggleShuffle = () => {
        setIsShuffle(prev => !prev)
    }

    const toggleSort = () => {
        setSortOrder(prev => {
            if (prev === 'none') return 'newest'
            if (prev === 'newest') return 'oldest'
            return 'none'
        })
    }

    // Seřazené tracky podle watch_date (pouze pro pieces mód)
    const sortedTracks = useMemo(() => {
        if (sortOrder === 'none' || isWhole) return tracks
        const withDates = tracks.map((t, i) => ({ ...t, _origIndex: i }))
        withDates.sort((a, b) => {
            const dateA = a.watch_date || '0000-00-00'
            const dateB = b.watch_date || '0000-00-00'
            if (sortOrder === 'newest') return dateB.localeCompare(dateA)
            return dateA.localeCompare(dateB)
        })
        return withDates
    }, [tracks, sortOrder, isWhole])

    // Zobrazené názvy skladeb: syrové titulky z YouTube jsou zanesené slupkou
    // („BERSERK (1997) Original Soundtrack - Behelit"), která se opakuje u každé
    // skladby. Čistí se po celých skupinách naráz, protože poznat slupku jde jen
    // z porovnání všech názvů playlistu. Název anime pomáhá ji odlišit od názvu
    // skladby. Původní titulek zůstává v atributu title.
    const cleanTitlesByGroup = useMemo(() => {
        const out = {}
        for (const [gIdx, list] of Object.entries(tracksByGroup)) {
            if (!list) continue
            const resolvedIdx = list.map((t, i) => (t.resolved ? i : -1)).filter(i => i >= 0)
            const cleaned = cleanTrackTitles(resolvedIdx.map(i => list[i].song), groups[gIdx]?.name)
            const names = list.map(t => t.song)
            resolvedIdx.forEach((listIdx, k) => { names[listIdx] = cleaned[k] })
            out[gIdx] = names
        }
        return out
    }, [tracksByGroup, groups])

    // Průběžný zápis pozice, aby refresh navázal tam, kde hudba skončila.
    //
    // Zásadní detail: při zavírání karty se přehrávač už rozpadá a
    // `getPlaylistIndex()` v tu chvíli vrátí 0. Kdyby se na něj snapshot ptal
    // ještě při `beforeunload`, přepsal by uloženou pátou skladbu nulou a po
    // refreshi by hudba vždycky začala od začátku playlistu. Proto se poslední
    // spolehlivé hodnoty průběžně odkládají do referencí a při odchodu se
    // zapisují ony, bez dalšího dotazu na přehrávač.
    const lastGoodPosRef = useRef(resume?.playlistPos ?? null)
    const lastGoodSecsRef = useRef(resume?.seconds ?? 0)

    useEffect(() => {
        if (!player) return

        const capture = () => {
            try {
                const secs = player.getCurrentTime ? player.getCurrentTime() : 0
                if (secs > 0) lastGoodSecsRef.current = secs
                if (isWhole && player.getPlaylistIndex) {
                    const pos = player.getPlaylistIndex()
                    if (pos >= 0) lastGoodPosRef.current = pos
                }
            } catch { /* přehrávač právě přepíná stopu */ }
        }

        const store = () => {
            if (lastGoodSecsRef.current <= 0 && lastGoodPosRef.current === null) return
            saveOstProgress({
                trackIdx: isWhole ? null : trackIdx,
                groupIdx: isWhole ? groupIdx : null,
                playlistPos: isWhole ? lastGoodPosRef.current : null,
                seconds: lastGoodSecsRef.current > 0 ? lastGoodSecsRef.current : 0,
            })
        }

        const tick = () => { capture(); store() }
        const id = setInterval(tick, 5000)
        // Při odchodu se jen ukládá, nic se nečte
        window.addEventListener('beforeunload', store)
        return () => {
            clearInterval(id)
            window.removeEventListener('beforeunload', store)
            store()
        }
    }, [player, isWhole, trackIdx, groupIdx])

    // Ruční dopuštění, když prohlížeč po refreshi nepustil zvuk sám
    const resumePlayback = () => {
        setNeedsResumeClick(false)
        try { player?.playVideo() } catch { /* noop */ }
    }

    // Ikona pro tlačítko řazení
    const sortIcon = sortOrder === 'newest'
        ? '🔽'
        : sortOrder === 'oldest'
            ? '🔼'
            : '🔄'

    const sortTitle = sortOrder === 'newest'
        ? 'Seřazeno: nejnovější první'
        : sortOrder === 'oldest'
            ? 'Seřazeno: nejstarší první'
            : 'Seřadit podle data zhlédnutí'

    // ---- pieces: navigace ----
    const playNextPiece = () => {
        if (tracks.length <= 1) return
        if (isShuffle) {
            let next = trackIdx
            while (next === trackIdx) next = Math.floor(Math.random() * tracks.length)
            setTrackIdx(next)
        } else if (sortOrder !== 'none') {
            // Respektovat seřazené pořadí
            const sortedIdx = sortedTracks.findIndex(t => (t._origIndex ?? 0) === trackIdx)
            const nextSorted = (sortedIdx + 1) % sortedTracks.length
            setTrackIdx(sortedTracks[nextSorted]._origIndex)
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

        // Varianta C: dát prohlížeči chvíli, ať se rozjede sám. Když nepustí
        // (autoplay policy po refreshi), nabídneme tlačítko místo tichého okna.
        const resumedFromRefresh = resumeSecondsRef.current > 0 || resumePosRef.current !== null
        if (resumedFromRefresh) {
            setTimeout(() => {
                try {
                    // Nabídka se ukáže jen když přehrávač VŮBEC nezačal. Dřív se
                    // ptala jen „hraje právě teď?", jenže po skoku na uloženou
                    // skladbu přehrávač chvíli bufferuje, takže překryv na
                    // okamžik bliknul a zase zmizel.
                    if (hasStartedRef.current) return
                    const state = p.getPlayerState ? p.getPlayerState() : -1
                    // 1 = hraje, 3 = nabírá data → obojí znamená, že zvuk prošel
                    if (state !== 1 && state !== 3) setNeedsResumeClick(true)
                } catch { /* přehrávač mezitím zmizel */ }
            }, 1500)
        }

        if (!isWhole) {
            resumeSecondsRef.current = 0
            return
        }

        const ids = p.getPlaylist() || []
        // Jediné, co tu přibylo: zapamatovat si délku playlistu pro karty
        // „As a Whole". Čistě zápis do localStorage, přehrávání to nijak
        // neovlivňuje (YouTube počet skladeb dopředu neposkytne).
        savePlaylistCount(currentGroup?.playlistId, ids.length)
        // `resolved` odlišuje zástupný text od skutečného titulku z noembed.
        // Bez toho by se do společného prefixu započítalo i „Skladba " a čištění
        // by usekávalo něco, co názvem skladby vůbec není.
        const initialTracks = ids.map((id, i) => ({ ytId: id, song: `Skladba ${i + 1}`, resolved: false }))
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
        } else if (resumePosRef.current !== null || resumeSecondsRef.current > 0) {
            // Obnovení po refreshi: skočit na skladbu, u které jsem skončil,
            // a do jejího času. V playlistu se `start` použít nedá (viz opts),
            // takže se obojí dorovnává tady ručně. Když se pozice neuložila,
            // zůstane se na první skladbě a doskočí se aspoň čas.
            const idx = resumePosRef.current ?? 0
            const secs = resumeSecondsRef.current
            resumePosRef.current = null
            resumeSecondsRef.current = 0
            // Provede se až v onPlayerStateChange, jakmile playlist opravdu jede
            resumeJumpRef.current = { idx, secs }
        }
        resumeSecondsRef.current = 0

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
                            [groupIdx]: list.map(t => (t.ytId === id ? { ...t, song: data.title, resolved: true } : t))
                        }
                    })
                })
                .catch(() => {})
        })
    }

    const onPlayerStateChange = (event) => {
        // Jakmile se rozjede zvuk, nabídka „Pokračovat" je zbytečná.
        // Platí pro oba režimy, proto před větví jen pro whole.
        // 1 = hraje, 3 = nabírá data; obojí znamená, že prohlížeč zvuk povolil.
        if (event.data === 1 || event.data === 3) {
            hasStartedRef.current = true
            if (needsResumeClick) setNeedsResumeClick(false)
        }

        if (!isWhole) return
        const p = event.target
        const pos = p.getPlaylistIndex()
        setPlaylistPos(pos)
        // Změna stopy je nejspolehlivější okamžik, kdy si pozici zapamatovat
        if (pos >= 0) lastGoodPosRef.current = pos

        // Dokončení obnovy po refreshi: teď už playlist běží, takže skok projde.
        if (event.data === 1 && resumeJumpRef.current) {
            const { idx, secs } = resumeJumpRef.current
            resumeJumpRef.current = null
            const ids = p.getPlaylist() || []
            if (idx > 0 && idx < ids.length) {
                userActionRef.current = true
                lastPosRef.current = idx
                p.playVideoAt(idx)
                // Po přeskoku chvilku trvá, než se nová stopa načte
                if (secs > 0) setTimeout(() => { try { p.seekTo(secs, true) } catch { /* noop */ } }, 800)
                return
            }
            // Zůstáváme na první skladbě, stačí doskočit čas
            if (secs > 0) { try { p.seekTo(secs, true) } catch { /* noop */ } }
        }

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

    // YouTube hlásí chyby číselným kódem. Bez tohohle handleru se v přehrávači
    // jen objevilo šedé „Došlo k chybě" a nebylo poznat proč.
    //   2   = neplatný parametr (třeba čas za koncem videa)
    //   5   = chyba HTML5 přehrávače
    //   100 = video neexistuje
    //   101/150 = majitel zakázal vkládání
    const onPlayerError = (event) => {
        const code = event?.data
        console.warn(`[OST] YouTube chyba ${code} mode=${mode} group=${groupIdx} playlist=${currentGroup?.playlistId || '-'} video=${currentTrack?.ytId || '-'}`)
        // Zakázané nebo chybějící video nemá cenu zkoušet znovu, jde se dál.
        if ((code === 100 || code === 101 || code === 150) && isWhole) {
            setTimeout(() => { try { player?.nextVideo() } catch { /* noop */ } }, 400)
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
        const ids = player.getPlaylist() || []
        const pos = player.getPlaylistIndex()

        if (isShuffle) {
            // U POSLEDNÍ skladby playlistu YouTube sám nikam nepřeskočí, takže
            // onPlayerStateChange nemá co zachytit a shuffle by tiše skončil.
            // Další náhodnou skladbu proto musíme vybrat tady.
            if (ids.length > 1) {
                let next = pos
                while (next === pos) next = Math.floor(Math.random() * ids.length)
                userActionRef.current = true
                lastPosRef.current = next
                player.playVideoAt(next)
            } else if (groups.length > 1) {
                // Jednoskladbový playlist: náhodně dál skupinou
                let nextGroup = groupIdx
                while (nextGroup === groupIdx) nextGroup = Math.floor(Math.random() * groups.length)
                activateGroup(nextGroup)
            }
            return
        }

        if (pos >= ids.length - 1 && groups.length > 1) {
            activateGroup((groupIdx + 1) % groups.length)
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
                        <span className="ost-floating-title-text">{headerTitle}</span>
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
                    {needsResumeClick && (
                        <button
                            type="button"
                            className="ost-resume-overlay"
                            onClick={resumePlayback}
                            title="Prohlížeč nepustil zvuk sám. Kliknutím se hudba rozjede tam, kde skončila."
                        >
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            <span>Pokračovat</span>
                        </button>
                    )}
                    <YouTube
                        key={isWhole ? `pl-${currentGroup?.playlistId}` : `tr-${currentTrack?.ytId}`}
                        {...(isWhole ? {} : { videoId: currentTrack?.ytId })}
                        opts={opts}
                        onReady={onPlayerReady}
                        onStateChange={onPlayerStateChange}
                        onError={onPlayerError}
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
                                    className={`ost-shuffle-btn ost-sort-btn${sortOrder !== 'none' ? ' active' : ''}`}
                                    onClick={toggleSort}
                                    title={sortTitle}
                                >
                                    {sortIcon} Seřadit
                                </button>
                                <button
                                    type="button"
                                    className={`ost-shuffle-btn${isShuffle ? ' active' : ''}`}
                                    onClick={toggleShuffle}
                                    title={isShuffle ? 'Vypnout náhodné přehrávání' : 'Zapnout náhodné přehrávání'}
                                >
                                    🔀 Shuffle
                                </button>
                                <button
                                    type="button"
                                    className="ost-shuffle-btn"
                                    onClick={playNext}
                                    title="Přehrát další skladbu"
                                >
                                    ⏭️ Next song
                                </button>
                            </div>
                        </div>
                        <div className="ost-playlist-list fav-ost-list" ref={activeListRef}>
                            {sortedTracks.map((t, i) => {
                                const origIdx = sortOrder !== 'none' ? (t._origIndex ?? i) : i
                                const isActive = origIdx === trackIdx
                                return (
                                    <button
                                        key={`${t.ytId}-${origIdx}`}
                                        type="button"
                                        className={`ost-playlist-item${isActive ? ' active' : ''}`}
                                        onClick={() => setTrackIdx(origIdx)}
                                        disabled={isActive}
                                    >
                                        <span className="ost-playlist-item-num">{i + 1}.</span>
                                        <span className="ost-playlist-item-title" title={`${t.anime} – ${t.song}`}>
                                            <b>{t.anime}</b> – {t.song}
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
                                    className={`ost-shuffle-btn${isShuffle ? ' active' : ''}`}
                                    onClick={toggleShuffle}
                                    title={isShuffle ? 'Vypnout náhodné přehrávání' : 'Zapnout náhodné přehrávání (uvnitř playlistu)'}
                                >
                                    🔀 Shuffle
                                </button>
                                <button
                                    type="button"
                                    className="ost-shuffle-btn"
                                    onClick={playNext}
                                    title="Přehrát další skladbu"
                                >
                                    ⏭️ Next song
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
                                                <span className="fav-ost-group-name-text">{g.name}</span>
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
                                                                {cleanTitlesByGroup[gIdx]?.[tIdx] ?? t.song}
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
