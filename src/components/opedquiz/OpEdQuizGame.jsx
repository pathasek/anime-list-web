// Minihra „Hádej OP/ED“ — izolovaná featura (vlastní data, logika i styly).
// Pustí se jen zvuk znělky (video je skryté, aby vizuál neprozradil anime)
// a hádá se anime + bonusy: typ (OP/ED), interpret a název písničky.
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { POINTS, buildPool, generateGame } from './quizEngine'
import './opedquiz.css'

const ROUND_CHOICES = [5, 10, 15]

const emptyPicks = () => ({ anime: null, type: null, artist: null, song: null })
const emptyStats = () => ({
    anime: { ok: 0, total: 0 },
    type: { ok: 0, total: 0 },
    artist: { ok: 0, total: 0 },
    song: { ok: 0, total: 0 },
})

function fmtTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
}

function rankFor(pct) {
    if (pct >= 0.9) return { grade: 'S', label: 'Absolutní weeb legenda!' }
    if (pct >= 0.75) return { grade: 'A', label: 'Skvělé uši, jen tak dál!' }
    if (pct >= 0.6) return { grade: 'B', label: 'Solidní znalost knihovny.' }
    if (pct >= 0.4) return { grade: 'C', label: 'Občas to trefíš…' }
    return { grade: 'D', label: 'Čas na rewatch marathon!' }
}

export default function OpEdQuizGame({ onClose }) {
    const [data, setData] = useState(null)          // { pool, animeList }
    const [loadError, setLoadError] = useState(null)
    const [phase, setPhase] = useState('intro')     // intro | round | results
    const [roundCount, setRoundCount] = useState(10)
    const [game, setGame] = useState(null)          // { rounds, spares }
    const [idx, setIdx] = useState(0)
    const [picks, setPicks] = useState(emptyPicks)
    const [score, setScore] = useState(0)
    const [stats, setStats] = useState(emptyStats)
    const [audio, setAudio] = useState({ playing: false, time: 0, dur: 0, error: false })
    const [volume, setVolume] = useState(0.75)
    const [notice, setNotice] = useState(null)
    // 'video' = skrytý <video> s přímým URL (žádný vizuál, plné ovládání).
    // 'iframe' = fallback: GDrive preview rozmazaný proti spoilerům — přímé
    // stažení vyžaduje Google cookies / veřejný soubor a někde selže.
    const [playMode, setPlayMode] = useState('video')
    const directBrokenRef = useRef(false)
    const videoRef = useRef(null)

    // Zrcadla stavu pro handlery mimo render cyklus (onError přehrávače) —
    // žádné side-effecty uvnitř setState updaterů (StrictMode je spouští 2×).
    const picksRef = useRef(picks)
    const gameRef = useRef(game)
    const idxRef = useRef(idx)
    useEffect(() => { picksRef.current = picks }, [picks])
    useEffect(() => { gameRef.current = game }, [game])
    useEffect(() => { idxRef.current = idx }, [idx])

    const round = game?.rounds?.[idx] || null

    // Data si hra načítá sama — nulová vazba na stav stránky Favorites
    useEffect(() => {
        let cancelled = false
        Promise.all([
            fetch('data/op_ed_videos.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()),
        ])
            .then(([opEd, animeList]) => {
                if (cancelled) return
                const pool = buildPool(opEd?.videos, animeList)
                setData({ pool, animeList })
            })
            .catch(() => { if (!cancelled) setLoadError('Nepodařilo se načíst data pro hru.') })
        return () => { cancelled = true }
    }, [])

    // Zámek scrollu pozadí (stejný vzor jako ostatní modaly v aplikaci)
    useEffect(() => {
        const html = document.documentElement
        const prev = html.style.overflow
        html.style.overflow = 'hidden'
        return () => { html.style.overflow = prev }
    }, [])

    // Esc zavírá hru; při odchodu zastavit zvuk
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    useEffect(() => () => { videoRef.current?.pause() }, [])

    useEffect(() => {
        if (videoRef.current) videoRef.current.volume = volume
    }, [volume, idx, phase])

    // Nové kolo → automaticky přehrát (spouští se z user gesture Start/Další)
    useEffect(() => {
        if (phase !== 'round') return
        setAudio({ playing: false, time: 0, dur: 0, error: false })
        const r = gameRef.current?.rounds?.[idxRef.current]
        const useIframe = directBrokenRef.current && !!r?.track?.fileId
        setPlayMode(useIframe ? 'iframe' : 'video')
        if (useIframe) return
        const v = videoRef.current
        if (v) {
            v.currentTime = 0
            v.volume = volume
            v.play().catch(() => { /* autoplay block → uživatel klikne ▶ */ })
        }
        // volume je v deps záměrně vynecháno — změna hlasitosti nemá restartovat kolo
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, idx, game])

    const startGame = useCallback(() => {
        if (!data) return
        const g = generateGame(data.pool, data.animeList, roundCount)
        if (!g.rounds.length) { setLoadError('V knihovně není dost skladeb.'); return }
        setGame(g)
        setIdx(0)
        setScore(0)
        setStats(emptyStats())
        setPicks(emptyPicks())
        setNotice(null)
        setPhase('round')
    }, [data, roundCount])

    const answer = useCallback((kind, option, correctValue) => {
        const prev = picksRef.current
        if (prev[kind] !== null) return
        // Bonusy až po zodpovězení hlavní otázky
        if (kind !== 'anime' && prev.anime === null) return
        const ok = option === correctValue
        setPicks({ ...prev, [kind]: option })
        setScore(s => s + (ok ? POINTS[kind] : 0))
        setStats(st => ({
            ...st,
            [kind]: { ok: st[kind].ok + (ok ? 1 : 0), total: st[kind].total + 1 },
        }))
    }, [])

    const next = useCallback(() => {
        videoRef.current?.pause()
        setNotice(null)
        if (!game) return
        if (idx + 1 >= game.rounds.length) {
            setPhase('results')
        } else {
            setPicks(emptyPicks())
            setIdx(i => i + 1)
        }
    }, [game, idx])

    // Přímé přehrávání selhalo → přepnout na rozmazaný GDrive iframe.
    // Bez file_id (nelze iframe) zkusit náhradní kolo; když ani to nejde, skip.
    const onAudioError = useCallback(() => {
        const g = gameRef.current
        const r = g?.rounds?.[idxRef.current]
        if (r?.track?.fileId) {
            directBrokenRef.current = true
            setPlayMode('iframe')
            setNotice('Přímé přehrávání nejde — použit rozmazaný Drive přehrávač. Klikni do něj pro ▶.')
            return
        }
        if (!g || picksRef.current.anime !== null || g.spares.length === 0) {
            setAudio(a => ({ ...a, error: true }))
            return
        }
        const spares = [...g.spares]
        const spare = spares.shift()
        const rounds = [...g.rounds]
        rounds[idxRef.current] = spare
        setGame({ rounds, spares })
        setNotice('Skladbu se nepodařilo přehrát — nahrazena náhradní. 🎲')
    }, [])

    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play().catch(() => {})
        else v.pause()
    }

    const restartTrack = () => {
        const v = videoRef.current
        if (!v) return
        v.currentTime = 0
        v.play().catch(() => {})
    }

    const optionBtn = (kind, option, correctValue) => {
        const picked = picks[kind]
        const revealed = picked !== null
        const isCorrect = option === correctValue
        const isPicked = option === picked
        let cls = 'opq-option'
        if (revealed) {
            if (isCorrect) cls += ' correct'
            else if (isPicked) cls += ' wrong'
            else cls += ' dim'
        }
        return (
            <button
                key={`${kind}-${option}`}
                type="button"
                className={cls}
                disabled={revealed || (kind !== 'anime' && picks.anime === null)}
                onClick={() => answer(kind, option, correctValue)}
            >
                {option}
            </button>
        )
    }

    const totalMax = game ? game.rounds.reduce((s, r) => s + r.maxPoints, 0) : 0

    return createPortal(
        <div className="opq-overlay">
            <div className="opq-modal" role="dialog" aria-label="Minihra Hádej OP/ED">
                <div className="opq-header">
                    <span className="opq-title">🎮 Hádej OP/ED</span>
                    {phase !== 'intro' && (
                        <span className="opq-score-chip">Skóre: <b>{score}</b></span>
                    )}
                    <button type="button" className="opq-close" onClick={onClose} aria-label="Zavřít">✕</button>
                </div>

                {/* ============ INTRO ============ */}
                {phase === 'intro' && (
                    <div className="opq-body">
                        <p className="opq-lead">
                            Pustí se <b>jen hudba</b> náhodné OP/ED znělky z tvé knihovny.
                            Uhádni, z jakého anime je — a sbírej bonusy!
                        </p>
                        <ul className="opq-rules">
                            <li>🎯 Anime <b>+{POINTS.anime} b.</b></li>
                            <li>🎬 Typ (OP/ED) <b>+{POINTS.type} b.</b></li>
                            <li>🎤 Interpret <b>+{POINTS.artist} b.</b></li>
                            <li>🎵 Název písničky <b>+{POINTS.song} b.</b></li>
                        </ul>
                        <p className="opq-hint">
                            Pozor: v možnostech jsou podobná anime (dle tagů) a občas se hádá
                            i konkrétní <b>část série</b>. 😈
                        </p>
                        <div className="opq-rounds-select">
                            <span>Počet kol:</span>
                            {ROUND_CHOICES.map(n => (
                                <button
                                    key={n}
                                    type="button"
                                    className={`opq-round-btn${roundCount === n ? ' active' : ''}`}
                                    onClick={() => setRoundCount(n)}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                        {loadError ? (
                            <div className="opq-error">{loadError}</div>
                        ) : (
                            <button
                                type="button"
                                className="opq-start-btn"
                                disabled={!data}
                                onClick={startGame}
                            >
                                {data ? `▶ Spustit hru (${data.pool.length} skladeb v knihovně)` : 'Načítám knihovnu…'}
                            </button>
                        )}
                    </div>
                )}

                {/* ============ KOLO ============ */}
                {phase === 'round' && round && (
                    <div className="opq-body">
                        <div className="opq-progress">
                            <span>Kolo {idx + 1} / {game.rounds.length}</span>
                            {round.isSeries && <span className="opq-series-badge">SÉRIOVÉ KOLO</span>}
                        </div>

                        {playMode === 'iframe' ? (
                            /* Fallback: GDrive preview rozmazaný proti spoilerům.
                               Kliknutí projdou skrz blur (▶/⏸), horní pruh s názvem
                               souboru je překrytý neprůhledně. */
                            <div className="opq-iframe-wrap">
                                <iframe
                                    key={round.track.id}
                                    src={`https://drive.google.com/file/d/${round.track.fileId}/preview`}
                                    allow="autoplay"
                                    title="Přehrávač znělky (rozmazaný proti spoilerům)"
                                />
                                <span className="opq-iframe-topcover" aria-hidden="true" />
                                <span className="opq-iframe-blur" aria-hidden="true" />
                                <div className="opq-iframe-hint">
                                    🔒 Rozmazáno proti spoilerům — klikni do přehrávače pro ▶ / ⏸
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Skrytý přehrávač — jen zvuk, vizuál by prozradil anime */}
                                <video
                                    key={round.track.id}
                                    ref={videoRef}
                                    src={round.track.url}
                                    preload="auto"
                                    style={{ display: 'none' }}
                                    onPlay={() => setAudio(a => ({ ...a, playing: true }))}
                                    onPause={() => setAudio(a => ({ ...a, playing: false }))}
                                    onTimeUpdate={e => setAudio(a => ({ ...a, time: e.target.currentTime }))}
                                    onLoadedMetadata={e => setAudio(a => ({ ...a, dur: e.target.duration }))}
                                    onEnded={() => setAudio(a => ({ ...a, playing: false }))}
                                    onError={onAudioError}
                                />

                                <div className="opq-player">
                                    <button type="button" className="opq-play-btn" onClick={togglePlay}>
                                        {audio.playing ? '⏸' : '▶'}
                                    </button>
                                    <button type="button" className="opq-replay-btn" title="Od začátku" onClick={restartTrack}>↻</button>
                                    <div className={`opq-visualizer${audio.playing ? ' playing' : ''}`} aria-hidden="true">
                                        {Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 7) * 0.13}s` }} />)}
                                    </div>
                                    <span className="opq-time">{fmtTime(audio.time)} / {fmtTime(audio.dur)}</span>
                                    <input
                                        type="range"
                                        className="opq-volume"
                                        min="0" max="1" step="0.05"
                                        value={volume}
                                        onChange={e => setVolume(parseFloat(e.target.value))}
                                        title="Hlasitost"
                                    />
                                </div>

                                {audio.error && (
                                    <div className="opq-error">
                                        Skladbu se nepodařilo přehrát. 😢
                                        <button type="button" className="opq-skip-btn" onClick={next}>Přeskočit kolo →</button>
                                    </div>
                                )}
                            </>
                        )}
                        {notice && <div className="opq-notice">{notice}</div>}

                        <h3 className="opq-question">{round.question}</h3>
                        <div className="opq-options">
                            {round.animeOptions.map(o => optionBtn('anime', o, round.track.animeName))}
                        </div>

                        {picks.anime !== null && (
                            <div className="opq-bonus fade-in">
                                <div className="opq-reveal">
                                    {picks.anime === round.track.animeName ? '✅ Správně!' : '❌ Špatně.'}{' '}
                                    Byla to znělka z <b>{round.track.animeName}</b>.
                                </div>

                                <div className="opq-bonus-group">
                                    <span className="opq-bonus-label">🎬 OP nebo ED? <i>(+{POINTS.type})</i></span>
                                    <div className="opq-options two">
                                        {['OP', 'ED'].map(o => optionBtn('type', o, round.track.type))}
                                    </div>
                                </div>

                                {round.artistOptions && (
                                    <div className="opq-bonus-group">
                                        <span className="opq-bonus-label">🎤 Kdo to zpívá? <i>(+{POINTS.artist})</i></span>
                                        <div className="opq-options">
                                            {round.artistOptions.map(o => optionBtn('artist', o, round.track.artist))}
                                        </div>
                                    </div>
                                )}

                                {round.songOptions && (
                                    <div className="opq-bonus-group">
                                        <span className="opq-bonus-label">🎵 Jak se jmenuje písnička? <i>(+{POINTS.song})</i></span>
                                        <div className="opq-options">
                                            {round.songOptions.map(o => optionBtn('song', o, round.track.song))}
                                        </div>
                                    </div>
                                )}

                                <button type="button" className="opq-next-btn" onClick={next}>
                                    {idx + 1 >= game.rounds.length ? '🏁 Vyhodnocení' : 'Další kolo →'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ============ VÝSLEDKY ============ */}
                {phase === 'results' && game && (() => {
                    const pct = totalMax > 0 ? score / totalMax : 0
                    const rank = rankFor(pct)
                    return (
                        <div className="opq-body opq-results">
                            <div className={`opq-rank rank-${rank.grade}`}>{rank.grade}</div>
                            <div className="opq-rank-label">{rank.label}</div>
                            <div className="opq-final-score">
                                {score} / {totalMax} bodů ({Math.round(pct * 100)} %)
                            </div>
                            <div className="opq-stats-grid">
                                <div>🎯 Anime <b>{stats.anime.ok}/{stats.anime.total}</b></div>
                                <div>🎬 Typ <b>{stats.type.ok}/{stats.type.total}</b></div>
                                <div>🎤 Interpret <b>{stats.artist.ok}/{stats.artist.total}</b></div>
                                <div>🎵 Píseň <b>{stats.song.ok}/{stats.song.total}</b></div>
                            </div>
                            <div className="opq-results-actions">
                                <button type="button" className="opq-start-btn" onClick={startGame}>🔄 Hrát znovu</button>
                                <button type="button" className="opq-secondary-btn" onClick={() => setPhase('intro')}>Nastavení</button>
                                <button type="button" className="opq-secondary-btn" onClick={onClose}>Zavřít</button>
                            </div>
                        </div>
                    )
                })()}
            </div>
        </div>,
        document.body
    )
}
