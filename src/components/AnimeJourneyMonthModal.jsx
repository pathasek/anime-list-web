// Detail měsíce v „Cestě Anime". Otevře se klikem na název měsíce
// v maximalizované timeline a ukáže rozpad měsíce podrobněji, než se vejde
// na souhrnnou kartu: všechna anime, čísla a tři chord diagramy
// (žánry, témata, AniList tagy).
//
// Data se neberou odjinud, jen z měsíce, který už spočítal journeyCalculations.
import { useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { animePath } from '../utils/animeSlug'
import { fmtHours } from '../utils/journeyCalculations'
import AnimeGenreChordChart from './charts/AnimeGenreChordChart'

const REASON_LABEL = {
    top10: 'Vítěz podle TOP 10',
    hm: 'Vítěz podle Honourable Mentions',
    detail: 'Rozhodlo detailní hodnocení',
    standard: 'Nejlépe hodnocené anime měsíce',
}

// Kolik anime a různých hodnot musí měsíc mít, aby mělo smysl kreslit chord.
// Pod tím je diagram skoro prázdný a čitelnější je prostý seznam s počty.
const CHORD_MIN_ANIME = 4
const CHORD_MIN_VALUES = 3

const splitValues = (raw) => String(raw || '')
    .split(';')
    .map(v => v.split(':')[0].trim())
    .filter(v => v && v.toLowerCase() !== 'x')

function countValues(items, field) {
    const counts = new Map()
    for (const a of items) {
        for (const v of splitValues(a[field])) {
            const k = v.toLowerCase()
            const e = counts.get(k)
            if (e) e.n++
            else counts.set(k, { name: v, n: 1 })
        }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'cs'))
}

function ChordBlock({ title, items, field, topN }) {
    const counted = useMemo(() => countValues(items, field), [items, field])
    // Chord dává smysl jen tam, kde je co propojovat: potřebuje víc anime
    // a aspoň pár různých hodnot, které se potkávají u téhož díla.
    const enoughToDraw = items.length >= CHORD_MIN_ANIME && counted.length >= CHORD_MIN_VALUES

    return (
        <div className="ajm-chord">
            <h4 className="ajm-chord-title">
                {title}
                <span className="ajm-chord-note">{counted.length}</span>
            </h4>
            {enoughToDraw ? (
                <div className="ajm-chord-canvas">
                    <AnimeGenreChordChart data={items} field={field} topN={topN} background="transparent" />
                </div>
            ) : (
                <div className="ajm-chord-fallback">
                    {counted.length === 0
                        ? <span className="ajm-empty">Žádná data</span>
                        : (
                            <>
                                <p className="ajm-chord-hint">
                                    Na diagram je tenhle měsíc příliš malý, tady je prostý přehled.
                                </p>
                                <ul className="ajm-count-list">
                                    {counted.map(c => (
                                        <li key={c.name}><span>{c.name}</span><b>{c.n}x</b></li>
                                    ))}
                                </ul>
                            </>
                        )}
                </div>
            )}
        </div>
    )
}

export default function AnimeJourneyMonthModal({ month, onClose, onPrev, onNext, hasPrev, hasNext }) {
    // Esc zavírá, šipky listují mezi měsíci
    const onKey = useCallback((e) => {
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowLeft' && hasPrev) onPrev()
        else if (e.key === 'ArrowRight' && hasNext) onNext()
    }, [onClose, onPrev, onNext, hasPrev, hasNext])

    useEffect(() => {
        document.addEventListener('keydown', onKey)
        // Zamknout scroll pozadí, ať se pod modalem neposouvá stránka
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [onKey])

    if (!month) return null

    const items = month.items || []
    // Chordy kreslí tytéž žánry/témata/tagy jako chipy na kartě, takže musí stát
    // na stejné kolekci — na tom, co se v měsíci koukalo, ne co se dokončilo.
    // Jinak by dvě místa ukazovala pro stejný měsíc jiná čísla.
    const watched = month.watchedItems || []
    const rated = items.filter(a => a.rating !== null && a.rating !== undefined && a.rating !== '' && !isNaN(parseFloat(a.rating)))
    const avgRating = rated.length
        ? rated.reduce((s, a) => s + parseFloat(a.rating), 0) / rated.length
        : null
    const totalEps = items.reduce((s, a) => s + (parseInt(a.episodes, 10) || 0), 0)

    return createPortal(
        <div className="ajm-backdrop" onClick={onClose}>
            <div className="ajm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Detail měsíce ${month.label}`}>

                <div className="ajm-header">
                    <button
                        type="button"
                        className="ajm-nav"
                        onClick={onPrev}
                        disabled={!hasPrev}
                        title="Předchozí měsíc (šipka vlevo)"
                    >‹</button>

                    <div className="ajm-title-block">
                        <h3 className="ajm-title">{month.label}</h3>
                        <span className="ajm-subtitle">
                            +{month.plusCount} anime · celkem {month.runningTotal.toLocaleString('cs-CZ')}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="ajm-nav"
                        onClick={onNext}
                        disabled={!hasNext}
                        title="Další měsíc (šipka vpravo)"
                    >›</button>

                    <button type="button" className="ajm-close" onClick={onClose} title="Zavřít (Esc)">✕</button>
                </div>

                <div className="ajm-body">

                    {/* ── Čísla měsíce ── */}
                    <div className="ajm-stats">
                        <div className="ajm-stat">
                            <span className="ajm-stat-label">Dokončeno</span>
                            <b className="ajm-stat-value">{month.plusCount}</b>
                        </div>
                        <div className="ajm-stat">
                            <span className="ajm-stat-label">Epizod</span>
                            <b className="ajm-stat-value">{totalEps.toLocaleString('cs-CZ')}</b>
                        </div>
                        <div className="ajm-stat" title="Skutečně odsledovaný čas z History logu, včetně rozkoukaných">
                            <span className="ajm-stat-label">Nakoukáno</span>
                            <b className="ajm-stat-value">{fmtHours(month.watchedMins)}</b>
                        </div>
                        {avgRating !== null && (
                            <div className="ajm-stat">
                                <span className="ajm-stat-label">Průměr</span>
                                <b className="ajm-stat-value">
                                    {avgRating.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}
                                </b>
                            </div>
                        )}
                        {month.rewatchStats?.count > 0 && (
                            <div className="ajm-stat" title={`${month.rewatchStats.eps} EP / ${month.rewatchStats.hoursText}`}>
                                <span className="ajm-stat-label">Rewatch</span>
                                <b className="ajm-stat-value">{month.rewatchStats.count}</b>
                            </div>
                        )}
                    </div>

                    {/* ── Nejlepší anime měsíce ── */}
                    {month.best && (
                        <div className="ajm-section">
                            <h4 className="ajm-section-title">Nejlepší anime měsíce</h4>
                            <Link to={animePath(month.best.memberNames[0])} className="ajm-best">
                                {month.best.thumbnail
                                    ? <img src={month.best.thumbnail} alt="" loading="lazy" />
                                    : <div className="ajm-best-ph">🎬</div>}
                                <div className="ajm-best-info">
                                    <span className="ajm-best-name">{month.best.name}</span>
                                    <span className="ajm-best-meta">
                                        <b>{month.best.ratingText}</b>
                                        <span className={`ajm-badge ${month.best.isSeries ? 'series' : 'standalone'}`}>
                                            {month.best.isSeries ? 'SÉRIE' : 'STANDALONE'}
                                        </span>
                                    </span>
                                    <span className="ajm-best-reason">
                                        {REASON_LABEL[month.best.reason] || REASON_LABEL.standard}
                                    </span>
                                </div>
                            </Link>
                        </div>
                    )}

                    {/* ── Nejdelší ── */}
                    {month.longest && (
                        <div className="ajm-section">
                            <h4
                                className="ajm-section-title"
                                title="Nejvíc odkoukaného času v měsíci podle History logu (bez rewatche). U série se sčítají všechny její díly a filmy zhlédnuté v tomto měsíci."
                            >Nejdelší v měsíci</h4>
                            <div className="ajm-longest">
                                <Link
                                    to={month.longest.isSeries
                                        ? `/anime?series=${encodeURIComponent(month.longest.name)}`
                                        : animePath(month.longest.firstName || month.longest.name)}
                                    className="anime-link"
                                >
                                    {month.longest.name}
                                </Link>
                                <b>{month.longest.hoursText}{month.longest.eps > 0 ? ` / ${month.longest.eps} EP` : ''}</b>
                            </div>
                        </div>
                    )}

                    {/* ── Všechna anime měsíce ── */}
                    <div className="ajm-section">
                        <h4 className="ajm-section-title">
                            Všechna anime měsíce
                            <span className="ajm-section-note">{items.length}</span>
                        </h4>
                        <div className="ajm-grid">
                            {items.map(a => (
                                <Link key={a.name} to={animePath(a.name)} className="ajm-card" title={a.name}>
                                    {a.thumbnail
                                        ? <img src={a.thumbnail} alt="" loading="lazy" />
                                        : <div className="ajm-card-ph">🎬</div>}
                                    <div className="ajm-card-info">
                                        <span className="ajm-card-name">{a.name}</span>
                                        <span className="ajm-card-meta">
                                            {a.rating ? <b>★ {String(a.rating).replace('.', ',')}</b> : null}
                                            {a.type ? <span className="ajm-card-type">{a.type}</span> : null}
                                            {a.episodes ? <span>{a.episodes} EP</span> : null}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* ── Tři chord diagramy ── */}
                    <div className="ajm-section">
                        <h4 className="ajm-section-title">Co se v měsíci potkávalo</h4>
                        <p className="ajm-hint">
                            Oblouk je jedna hodnota, stuha mezi nimi znamená, že se sešly u téhož anime.
                            Najetím myší se ostatní ztlumí. Počítá se, co jsi v měsíci koukal
                            (z History logu, bez rewatche), ne jen dokončené tituly.
                        </p>
                        <div className="ajm-chords">
                            <ChordBlock title="Žánry" items={watched} field="genres" topN={12} />
                            <ChordBlock title="Témata" items={watched} field="themes" topN={12} />
                            <ChordBlock title="AniList tagy" items={watched} field="tags" topN={15} />
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
