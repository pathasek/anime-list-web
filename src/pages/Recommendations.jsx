import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import './recommendations.css'

// ============================================================
// VBA-IDENTICAL CONSTANTS (from Table_Anime_Recommendations.bas)
// ============================================================
const DEFAULTS = {
    // Rate limiting
    USE_ADAPTIVE_DELAY: true,
    API_DELAY_MS: 366,
    INITIAL_DELAY_MS: 100,
    RETRY_DELAY_BASE_MS: 388,
    MAX_RETRIES: 3,

    // Relevance weights
    RELEVANCE_W_IN_PLAN: 8,
    RELEVANCE_W_MAL_SCORE: 20,
    RELEVANCE_W_GENRE_THEME: 16,
    RELEVANCE_W_LENGTH: 8,
    RELEVANCE_W_POPULARITY: 8,
    RELEVANCE_W_VOTES: 50,

    // Length settings
    IDEAL_EPISODES: 13,
    IDEAL_DURATION_MIN: 24,
    MAX_PENALTY_RANGE_MIN: 480,

    // Thresholds
    THRESHOLD_HIGH: 75,
    THRESHOLD_MEDIUM: 45,

    // Popularity tiers
    POP_TIER1_ULTRA: 50000,
    POP_TIER2_HIDDEN: 100000,
    POP_TIER3_NORMAL: 500000,
    POP_TIER4_KNOWN: 1000000,

    // Votes
    MAX_VOTES_FOR_SCORE: 120,
    MIN_SCORE_FOR_POP_BONUS: 6.5,

    // AniList
    ANILIST_MIN_RANK: 30,
    MAX_RECS_TO_DISPLAY: 16,

    // PTW filter
    showPTWAnime: false,
}

const ANILIST_API_URL = 'https://graphql.anilist.co'

// ============================================================
// SETTINGS PERSISTENCE
// ============================================================
function loadSettings() {
    try {
        const saved = localStorage.getItem('rec-settings')
        if (saved) {
            const parsed = JSON.parse(saved)
            return { ...DEFAULTS, ...parsed }
        }
    } catch { /* ignore */ }
    return { ...DEFAULTS }
}

function saveSettings(settings) {
    try {
        localStorage.setItem('rec-settings', JSON.stringify(settings))
    } catch { /* ignore */ }
}

// ============================================================
// API HELPERS (VBA-identical rate limiting)
// ============================================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchWithRetry(url, settings, signal) {
    for (let attempt = 1; attempt <= settings.MAX_RETRIES; attempt++) {
        try {
            const resp = await fetch(url, { signal })
            if (resp.ok) return await resp.json()

            console.warn(`API Error: Status ${resp.status} for ${url} on attempt ${attempt}`)
            if (attempt < settings.MAX_RETRIES) {
                const delay = settings.RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)
                await sleep(delay)
            }
        } catch (err) {
            if (err.name === 'AbortError') throw err
            console.warn(`Fetch error for ${url} on attempt ${attempt}:`, err)
            if (attempt < settings.MAX_RETRIES) {
                const delay = settings.RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1)
                await sleep(delay)
            }
        }
    }
    return null
}

async function fetchAnilistTagsBatch(malIds, settings, signal) {
    if (!malIds.length) return {}

    let queryParts = malIds.map((id, i) =>
        `m${i}: Media(idMal: ${id}, type: ANIME) { idMal format episodes duration season seasonYear tags { name rank isMediaSpoiler } relations { edges { relationType node { format episodes duration } } } }`
    )
    const query = `query { ${queryParts.join(' ')} }`

    try {
        const resp = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query }),
            signal
        })

        if (!resp.ok) {
            console.warn('AniList API Error:', resp.status)
            return {}
        }

        const json = await resp.json()
        if (!json.data) return {}

        const result = {}
        for (const key of Object.keys(json.data)) {
            const media = json.data[key]
            if (!media) continue

            // Tags
            const tags = (media.tags || [])
                .filter(t => t.rank >= settings.ANILIST_MIN_RANK && !t.isMediaSpoiler)
                .sort((a, b) => b.rank - a.rank)
                .map(t => ({ name: t.name, rank: t.rank }))

            // Relations
            const rel = {
                format: media.format || 'Unknown',
                episodes: media.episodes || 0,
                duration: media.duration || 0,
                season_text: `${media.season || ''} ${media.seasonYear || ''}`.trim() || 'N/A',
                cnt_seq_pre: 0, cnt_side: 0, cnt_spin: 0, cnt_alt: 0,
                franchise_ep: media.episodes || 0,
                franchise_min: (media.episodes || 0) * (media.duration || 0),
            }

            if (media.relations?.edges) {
                for (const edge of media.relations.edges) {
                    const rt = edge.relationType
                    const node = edge.node
                    if (!node) continue

                    if (rt === 'SEQUEL' || rt === 'PREQUEL') rel.cnt_seq_pre++
                    else if (rt === 'SIDE_STORY') rel.cnt_side++
                    else if (rt === 'SPIN_OFF') rel.cnt_spin++
                    else if (rt === 'ALTERNATIVE') rel.cnt_alt++

                    if (['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'PARENT'].includes(rt)) {
                        const nEp = node.episodes || 0
                        const nDur = node.duration || 0
                        rel.franchise_ep += nEp
                        rel.franchise_min += nEp * nDur
                    }
                }
            }

            result[media.idMal] = { tags, relations: rel }
        }
        return result
    } catch (err) {
        if (err.name === 'AbortError') throw err
        console.warn('AniList batch error:', err)
        return {}
    }
}


// ============================================================
// RELEVANCE SCORING (ported from VBA CalculateRelevance)
// ============================================================
function precalculateUserRatings(animeList) {
    const genreCounts = {}, genreSums = {}
    const themeCounts = {}, themeSums = {}

    for (const anime of animeList) {
        const rating = parseFloat(anime.rating)
        if (isNaN(rating) || rating <= 0) continue

        if (anime.themes) {
            for (const t of String(anime.themes).split(';')) {
                const theme = t.trim()
                if (!theme) continue
                themeCounts[theme] = (themeCounts[theme] || 0) + 1
                themeSums[theme] = (themeSums[theme] || 0) + rating
            }
        }
        if (anime.genres) {
            for (const g of String(anime.genres).split(';')) {
                const genre = g.trim()
                if (!genre) continue
                genreCounts[genre] = (genreCounts[genre] || 0) + 1
                genreSums[genre] = (genreSums[genre] || 0) + rating
            }
        }
    }

    const genreRatings = {}
    for (const g of Object.keys(genreCounts)) {
        genreRatings[g] = genreSums[g] / genreCounts[g]
    }
    const themeRatings = {}
    for (const t of Object.keys(themeCounts)) {
        themeRatings[t] = themeSums[t] / themeCounts[t]
    }

    return { genreRatings, themeRatings }
}

function getGenreThemeScore(details, genreRatings, themeRatings) {
    let totalScore = 0, count = 0

    if (details.genres) {
        for (const g of details.genres) {
            if (genreRatings[g.name] !== undefined) {
                totalScore += genreRatings[g.name]
                count++
            }
        }
    }
    if (details.themes) {
        for (const t of details.themes) {
            if (themeRatings[t.name] !== undefined) {
                totalScore += themeRatings[t.name]
                count++
            }
        }
    }

    return count > 0 ? (totalScore / count) / 10 : 0.5
}

function getLengthScore(episodes, durationStr, settings) {
    let durationMin = 24
    if (durationStr) {
        const match = String(durationStr).match(/(\d+)/)
        if (match) durationMin = parseInt(match[1])
    }
    const ep = episodes > 0 ? episodes : 1
    const totalMin = ep * durationMin
    const idealMin = settings.IDEAL_EPISODES * settings.IDEAL_DURATION_MIN
    const diff = Math.abs(totalMin - idealMin)
    return diff >= settings.MAX_PENALTY_RANGE_MIN ? 0 : 1 - diff / settings.MAX_PENALTY_RANGE_MIN
}

function getVotesScore(votesCount, settings) {
    if (votesCount <= 1) return 0
    if (votesCount >= settings.MAX_VOTES_FOR_SCORE) return 1
    return Math.log(votesCount) / Math.log(settings.MAX_VOTES_FOR_SCORE)
}

function getPopularityScore(members, settings) {
    if (members <= settings.POP_TIER1_ULTRA) return 1
    if (members <= settings.POP_TIER2_HIDDEN) return 0.75
    if (members <= settings.POP_TIER3_NORMAL) return 0.4
    if (members <= settings.POP_TIER4_KNOWN) return 0.1
    return 0
}

function getPopularityTierName(members, settings) {
    if (members <= settings.POP_TIER1_ULTRA) return 'Hidden gem ultra'
    if (members <= settings.POP_TIER2_HIDDEN) return 'Hidden gem'
    if (members <= settings.POP_TIER3_NORMAL) return 'Normal'
    if (members <= settings.POP_TIER4_KNOWN) return 'Quite known'
    return 'Mainstream'
}

function isInPlanToWatch(title, ptwList) {
    if (!title || !ptwList?.length) return false
    const lower = title.toLowerCase()
    return ptwList.some(p => p.name && p.name.toLowerCase().includes(lower))
}

function calculateRelevance(details, userRatings, votes, ptwList, settings) {
    const planScore = isInPlanToWatch(
        details.title_english || details.title, ptwList
    ) ? 1 : 0

    const malScoreVal = details.score || 0
    const malScoreNorm = malScoreVal / 10
    const genreThemeScore = getGenreThemeScore(details, userRatings.genreRatings, userRatings.themeRatings)
    const lengthScore = getLengthScore(details.episodes || 0, details.duration, settings)
    const votesScore = getVotesScore(votes, settings)
    const popScore = malScoreVal >= settings.MIN_SCORE_FOR_POP_BONUS
        ? getPopularityScore(details.members || 0, settings) : 0

    const plan_p = planScore * settings.RELEVANCE_W_IN_PLAN
    const mal_p = malScoreNorm * settings.RELEVANCE_W_MAL_SCORE
    const genre_p = genreThemeScore * settings.RELEVANCE_W_GENRE_THEME
    const length_p = lengthScore * settings.RELEVANCE_W_LENGTH
    const votes_p = votesScore * settings.RELEVANCE_W_VOTES
    const pop_p = popScore * settings.RELEVANCE_W_POPULARITY

    const total = plan_p + mal_p + genre_p + length_p + votes_p + pop_p

    return {
        total, plan_s: planScore, mal_s_val: malScoreVal, mal_s_norm: malScoreNorm,
        genre_s: genreThemeScore, length_s: lengthScore, votes_s: votesScore, pop_s: popScore,
        plan_p, mal_p, genre_p, length_p, votes_p, pop_p,
        votes_c: votes, members_c: details.members || 0,
    }
}

// ============================================================
// COLOR GRADIENT (ported from VBA GetColorGradient)
// ============================================================
function getColorGradient(val, min, max) {
    val = Math.max(min, Math.min(max, val))
    const mid = (min + max) / 2
    let r, g, b

    if (val <= mid) {
        const f = (val - min) / (mid - min || 1)
        r = Math.round(248 + (255 - 248) * f)
        g = Math.round(105 + (235 - 105) * f)
        b = Math.round(107 + (132 - 107) * f)
    } else {
        const f = (val - mid) / (max - mid || 1)
        r = Math.round(255 + (99 - 255) * f)
        g = Math.round(235 + (190 - 235) * f)
        b = Math.round(132 + (123 - 132) * f)
    }
    return `rgb(${r},${g},${b})`
}

function cleanSynopsis(text) {
    if (!text) return ''
    return text
        .replace(/\[Written by MAL Rewrite\]/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
}


// ============================================================
// SETTINGS MODAL COMPONENT
// ============================================================
function SettingsModal({ isOpen, onClose, settings, onSave }) {
    const [local, setLocal] = useState({ ...settings })

    useEffect(() => {
        if (isOpen) setLocal({ ...settings })
    }, [isOpen, settings])

    if (!isOpen) return null

    const set = (key, val) => setLocal(prev => ({ ...prev, [key]: val }))

    const handleDefault = () => setLocal({ ...DEFAULTS })

    const handleSave = () => {
        onSave(local)
        onClose()
    }

    const NumberInput = ({ label, field, step = 1 }) => (
        <div className="rec-settings-row">
            <label>{label}</label>
            <input type="number" value={local[field]} step={step}
                onChange={e => set(field, parseFloat(e.target.value) || 0)} />
        </div>
    )

    return createPortal(
        <div className="rec-settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className="rec-settings-modal">
                <div className="rec-settings-header">
                    <h3>⚙️ Nastavení doporučení</h3>
                    <button className="popover-close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
                </div>

                <div className="rec-settings-body">
                    <div className="rec-settings-section-title">Váhy faktorů relevance</div>
                    <NumberInput label="Hlasy doporučení (Votes)" field="RELEVANCE_W_VOTES" />
                    <NumberInput label="MAL Skóre" field="RELEVANCE_W_MAL_SCORE" />
                    <NumberInput label="Žánry a témata" field="RELEVANCE_W_GENRE_THEME" />
                    <NumberInput label="V plánu (PTW bonus)" field="RELEVANCE_W_IN_PLAN" />
                    <NumberInput label="Délka anime" field="RELEVANCE_W_LENGTH" />
                    <NumberInput label="Popularita" field="RELEVANCE_W_POPULARITY" />

                    <div className="rec-settings-section-title">Nastavení délky</div>
                    <NumberInput label="Ideální počet epizod" field="IDEAL_EPISODES" />
                    <NumberInput label="Ideální délka ep. (min)" field="IDEAL_DURATION_MIN" />
                    <NumberInput label="Max. penalizace (min)" field="MAX_PENALTY_RANGE_MIN" />

                    <div className="rec-settings-section-title">Nastavení popularity</div>
                    <NumberInput label="Hidden gem ultra (< členů)" field="POP_TIER1_ULTRA" step={1000} />
                    <NumberInput label="Hidden gem (< členů)" field="POP_TIER2_HIDDEN" step={1000} />
                    <NumberInput label="Normal (< členů)" field="POP_TIER3_NORMAL" step={10000} />
                    <NumberInput label="Quite known (< členů)" field="POP_TIER4_KNOWN" step={10000} />

                    <div className="rec-settings-section-title">Hlasy</div>
                    <NumberInput label="Max. hlasů pro plné skóre" field="MAX_VOTES_FOR_SCORE" />
                    <NumberInput label="Min. skóre pro pop. bonus" field="MIN_SCORE_FOR_POP_BONUS" step={0.1} />

                    <div className="rec-settings-section-title">Zobrazení</div>
                    <NumberInput label="Max. zobrazených doporučení" field="MAX_RECS_TO_DISPLAY" />
                    <div className="rec-toggle-row">
                        <label>Zobrazit anime, co jsou v PTW</label>
                        <div
                            className={`rec-toggle-switch ${local.showPTWAnime ? 'active' : ''}`}
                            onClick={() => set('showPTWAnime', !local.showPTWAnime)}
                        />
                    </div>
                </div>

                <div className="rec-settings-footer">
                    <button className="btn btn-secondary" onClick={handleDefault} style={{ fontSize: '0.8rem' }}>
                        🔄 Default
                    </button>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.8rem' }}>Zrušit</button>
                        <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: '0.8rem' }}>💾 Uložit</button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}


// ============================================================
// SCORE DISTRIBUTION TOOLTIP (Jikan API)
// ============================================================
const jikanStatsCache = {}

function ScoreDistributionTooltip({ malId }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const tooltipRef = useRef(null)
    const [positionStyle, setPositionStyle] = useState({ visibility: 'hidden' })

    useLayoutEffect(() => {
        let isMounted = true
        setLoading(true)
        if (jikanStatsCache[malId]) {
            setStats(jikanStatsCache[malId])
            setLoading(false)
            return
        }

        fetch(`https://api.jikan.moe/v4/anime/${malId}/statistics`)
            .then(r => {
                if (!r.ok) throw new Error('API Error')
                return r.json()
            })
            .then(data => {
                if (isMounted && data.data) {
                    jikanStatsCache[malId] = data.data
                    setStats(data.data)
                    setLoading(false)
                }
            })
            .catch(err => {
                if (isMounted) {
                    setError(true)
                    setLoading(false)
                }
            })
        return () => { isMounted = false }
    }, [malId])

    if (loading) {
        return (
            <div className="rec-breakdown-tooltip rec-stats-tooltip" style={{ width: '250px', zIndex: 1001, padding: '12px', textAlign: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Načítám statistiky...</span>
            </div>
        )
    }

    if (error || !stats || !stats.scores) {
        return (
            <div className="rec-breakdown-tooltip rec-stats-tooltip" style={{ width: '250px', zIndex: 1001, padding: '12px', textAlign: 'center' }}>
                <span style={{ color: 'var(--accent-red)' }}>Statistiky nedostupné</span>
            </div>
        )
    }

    // Process scores array, order 10 to 1
    const scoresMap = {}
    stats.scores.forEach(s => {
        scoresMap[s.score] = s
    })

    const totalVotes = stats.total || 1
    const maxVotes = Math.max(...(stats.scores.map(s => s.votes)), 1)
    
    const formatNumber = (num) => {
        if (num == null) return "0"
        if (num >= 1000) return (num / 1000).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' tis.'
        return num.toLocaleString('cs-CZ')
    }

    useLayoutEffect(() => {
        if (loading || error || !stats || !tooltipRef.current) return
        const rect = tooltipRef.current.getBoundingClientRect()
        let newStyle = { visibility: 'visible' }
        if (rect.left < 10) {
            newStyle.right = 'auto'
            newStyle.left = '0'
        }
        if (rect.bottom > window.innerHeight - 10) {
            newStyle.top = 'auto'
            newStyle.bottom = 'calc(100% + 8px)'
        }
        setPositionStyle(newStyle)
    }, [stats, loading, error])

    const MAX_BAR_WIDTH = 25
    const barChar = '█'

    return (
        <div 
            ref={tooltipRef} 
            className="rec-breakdown-tooltip rec-stats-tooltip" 
            style={{ 
                width: 'max-content', 
                zIndex: 1001, 
                padding: '12px', 
                border: '1px solid var(--border-color)', 
                background: '#ffffe0', // Use Excel color as requested by user in text layout
                color: '#000', 
                fontFamily: 'Consolas, monospace',
                fontSize: '0.9rem',
                lineHeight: '1.4',
                pointerEvents: 'none', // Crucial: prevents hover flip-flop infinite loop that causes black screen
                ...positionStyle 
            }}
        >
            <div style={{ paddingBottom: '6px', marginBottom: '6px', borderBottom: '1px dashed #000' }}>
                Statistiky hodnocení: <span style={{ fontWeight: 'normal' }}>({formatNumber(stats.total)} uživatelů)</span>
            </div>
            
            <div style={{ whiteSpace: 'pre', display: 'flex', flexDirection: 'column' }}>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(scoreVal => {
                    const row = scoresMap[scoreVal] || { votes: 0, percentage: 0 }
                    
                    let barWidth = 0
                    if (row.votes > 0) {
                        barWidth = Math.round((row.votes / maxVotes) * (MAX_BAR_WIDTH - 1)) + 1
                    }
                    const bar = barChar.repeat(barWidth)
                    
                    const valPercent = (totalVotes > 0) ? (row.votes / totalVotes) * 100 : 0
                    const statsPart = `${valPercent.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})}% (${formatNumber(row.votes)})`
                    const padding = " ".repeat(Math.max(MAX_BAR_WIDTH - barWidth + 2, 0))

                    return (
                        <div key={scoreVal}>
                            {`${scoreVal.toString().padStart(2, ' ')}: `}
                            <span style={{ color: '#000' }}>{bar}</span>
                            {padding}
                            <span style={{ color: '#000' }}>{statsPart}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ============================================================
// RELEVANCE BREAKDOWN TOOLTIP
// ============================================================
function RelevanceBreakdown({ data, settings, sourceScore }) {
    const tooltipRef = useRef(null)
    const [positionStyle, setPositionStyle] = useState({ visibility: 'hidden' })

    useLayoutEffect(() => {
        if (!tooltipRef.current) return
        const rect = tooltipRef.current.getBoundingClientRect()
        let newStyle = { visibility: 'visible' }
        if (rect.right > window.innerWidth - 10) {
            newStyle.left = 'auto'
            newStyle.right = '0'
        }
        if (rect.top < 10) {
            newStyle.bottom = 'auto'
            newStyle.top = 'calc(100% + 8px)'
        }
        setPositionStyle(newStyle)
    }, [])

    const fmtScore = sourceScore ? sourceScore.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : 'N/A'
    const malCompare = (sourceScore && data.mal_s_val > sourceScore) ? `Má vyšší hodnocení` : `Nemá vyšší hodnocení`
    
    // Convert e.g. "4.6h" to "4,6 h" if it exists. Sometimes length_s_val is a string like "4.6h"
    const lengthStr = data.length_s_val ? data.length_s_val.replace('.', ',').replace('h', ' h ') : 'Neznámá'
    
    const Row = ({ label, status, mult, weight, result }) => (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: '#000', marginBottom: '2px' }}>
                {label}: <i style={{ color: '#000' }}>({status})</i>
            </span>
            <span style={{ fontSize: '0.85rem', color: '#000' }}>
                ({(mult || 0).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} * {weight}) = <strong>{(result || 0).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} b.</strong>
            </span>
        </div>
    )

    return (
        <div 
            ref={tooltipRef} 
            className="rec-breakdown-tooltip rec-relevance-tooltip" 
            style={{ 
                width: '320px', 
                padding: '12px', 
                textAlign: 'left', 
                background: '#ffffe0', // Kept Excel color for consistency with the text tooltips, as in VBA
                border: '1px solid #000', 
                color: '#000', 
                pointerEvents: 'none', // Prevents hover flip-flop loop
                ...positionStyle 
            }}
        >
            <div style={{ marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px dashed #000', fontSize: '0.95rem' }}>
                Celková Relevance: <strong>{data.total.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / 110</strong>
            </div>

            <Row 
                label={`V plánu (Plan to Watch)`}
                status={data.plan_s ? 'Ano' : 'Ne'}
                mult={data.plan_p / settings.RELEVANCE_W_IN_PLAN} 
                weight={settings.RELEVANCE_W_IN_PLAN} 
                result={data.plan_p} 
            />
            <Row 
                label={`MAL Skóre (${data.mal_s_val.toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/10)`}
                status={malCompare}
                mult={data.mal_p / settings.RELEVANCE_W_MAL_SCORE} 
                weight={settings.RELEVANCE_W_MAL_SCORE} 
                result={data.mal_p} 
            />
            <Row 
                label={`Žánry a Témata`}
                status={data.genre_p >= settings.RELEVANCE_W_GENRE_THEME/2 ? 'Nadprůměrná shoda' : 'Podprůměrná shoda'}
                mult={data.genre_p / settings.RELEVANCE_W_GENRE_THEME} 
                weight={settings.RELEVANCE_W_GENRE_THEME} 
                result={data.genre_p} 
            />
            <Row 
                label={`Délka Anime`}
                status={lengthStr}
                mult={data.length_p / settings.RELEVANCE_W_LENGTH} 
                weight={settings.RELEVANCE_W_LENGTH} 
                result={data.length_p} 
            />
            <Row 
                label={`Hlasy doporučení`}
                status={`${data.votes_c}x doporučeno`}
                mult={data.votes_p / settings.RELEVANCE_W_VOTES} 
                weight={settings.RELEVANCE_W_VOTES} 
                result={data.votes_p} 
            />
            <Row 
                label={`Popularita`}
                status={getPopularityTierName(data.members_c, settings)}
                mult={data.pop_p / settings.RELEVANCE_W_POPULARITY} 
                weight={settings.RELEVANCE_W_POPULARITY} 
                result={data.pop_p} 
            />
        </div>
    )
}


// ============================================================
// RECOMMENDATION CARD
// ============================================================
function RecCard({ rec, sourceAnimeId, sourceScore, settings }) {
    const [synopsisExpanded, setSynopsisExpanded] = useState(false)
    const [showBreakdown, setShowBreakdown] = useState(false)
    const [tagsExpanded, setTagsExpanded] = useState(false)
    const [showStats, setShowStats] = useState(false)

    const { relevance, details, anilistData } = rec
    const score = Math.min(100, Math.max(0, relevance.total))
    const circumference = 2 * Math.PI * 28 // Updated from 20 to 28
    const offset = circumference - (score / 100) * circumference
    const ringColor = getColorGradient(score, 0, 100)

    const malScoreColor = details.score ? getColorGradient(details.score, 6, 9.31) : 'var(--bg-tertiary)'

    const title = details.title_english || details.title || 'Unknown'
    const synopsis = cleanSynopsis(details.synopsis)
    const synopsisShort = synopsis.length > 200 ? synopsis.substring(0, 200) + '...' : synopsis

    const relevanceLabel = score >= settings.THRESHOLD_HIGH ? 'Vysoká'
        : score >= settings.THRESHOLD_MEDIUM ? 'Střední' : 'Nízká'
    const relevanceLabelColor = score >= settings.THRESHOLD_HIGH ? 'var(--accent-emerald)'
        : score >= settings.THRESHOLD_MEDIUM ? '#f59e0b' : 'var(--accent-red)'

    // AniList tags
    const tags = anilistData?.tags || []
    const tagsToShow = tagsExpanded ? tags : tags.slice(0, 6)

    // Relations
    const rel = anilistData?.relations

    // User rec review link
    const recLink = `https://myanimelist.net/recommendations/anime/${sourceAnimeId}-${details.mal_id}`

    return (
        <div className="rec-card">
            {/* Relevance Ring */}
            <div className="rec-relevance-cell" style={{ position: 'relative' }}>
                <div className="rec-relevance-ring"
                    onMouseEnter={() => setShowBreakdown(true)}
                    onMouseLeave={() => setShowBreakdown(false)}
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    style={{ cursor: 'pointer' }}
                >
                    <svg viewBox="0 0 64 64">
                        <circle className="ring-bg" cx="32" cy="32" r="28" />
                        <circle className="ring-fill" cx="32" cy="32" r="28"
                            stroke={ringColor}
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                        />
                    </svg>
                    <div className="rec-relevance-value">{score.toFixed(0)}</div>
                </div>
                <span className="rec-relevance-label" style={{ color: relevanceLabelColor }}>
                    {relevanceLabel}
                </span>
                {showBreakdown && <RelevanceBreakdown data={relevance} settings={settings} sourceScore={sourceScore} />}
            </div>

            {/* Poster */}
            <div className="rec-poster-cell">
                {details.images?.jpg?.image_url ? (
                    <div className="rec-poster-zoom-wrapper">
                        <img src={details.images.jpg.image_url} alt={title} loading="lazy" />
                    </div>
                ) : (
                    <div style={{ width: 100, height: 142, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>No Image</div>
                )}
            </div>

            {/* Info */}
            <div className="rec-info-cell">
                <div className="rec-info-header">
                    <div className="rec-title">
                        <a href={`https://myanimelist.net/anime/${details.mal_id}`} target="_blank" rel="noopener noreferrer">
                            {title}
                        </a>
                    </div>
                    <div 
                        className="rec-mal-score-wrapper" 
                        onMouseEnter={() => setShowStats(true)} 
                        onMouseLeave={() => setShowStats(false)}
                        style={{ position: 'relative' }}
                    >
                        <div className="rec-mal-score" style={{ background: malScoreColor, color: '#000', textShadow: 'none', cursor: 'help', fontFamily: "'Aptos Narrow', 'Arial Narrow', sans-serif" }}>
                            {details.score ? `${details.score.toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}/10` : 'N/A'}
                        </div>
                        {showStats && <ScoreDistributionTooltip malId={details.mal_id} />}
                    </div>
                </div>

                {/* Meta badges */}
                <div className="rec-meta-row">
                    {details.type && <span className="rec-meta-badge">{details.type}</span>}
                    {details.episodes && <span className="rec-meta-badge">{details.episodes} EP</span>}
                    {rel && <span className="rec-meta-badge">{rel.season_text}</span>}
                    {relevance.plan_s === 1 && <span className="rec-meta-badge ptw">📋 V plánu</span>}
                    <span className="rec-meta-badge votes">👍 {relevance.votes_c}× doporučeno</span>
                </div>

                {/* Synopsis */}
                <div className="rec-synopsis">
                    {synopsisExpanded ? synopsis : synopsisShort}
                    {synopsis.length > 200 && (
                        <button className="rec-synopsis-toggle" onClick={() => setSynopsisExpanded(!synopsisExpanded)}>
                            {synopsisExpanded ? 'Méně' : 'Více'}
                        </button>
                    )}
                </div>

                {/* AniList Tags */}
                {tags.length > 0 && (
                    <div className="rec-tags-section">
                        {tagsToShow.map((tag, i) => (
                            <span key={i} className={`rec-tag ${tag.rank >= 80 ? 'tier-1' : tag.rank >= 60 ? 'tier-2' : 'tier-3'}`}>
                                {tag.name} {tag.rank}%
                            </span>
                        ))}
                        {tags.length > 6 && (
                            <button className="rec-link-btn" onClick={() => setTagsExpanded(!tagsExpanded)}>
                                {tagsExpanded ? 'Méně' : `+${tags.length - 6}`}
                            </button>
                        )}
                    </div>
                )}

                {/* Relations */}
                {rel && (rel.cnt_seq_pre > 0 || rel.cnt_side > 0 || rel.cnt_spin > 0) && (
                    <div className="rec-relations-info">
                        {rel.cnt_seq_pre > 0 && <span>{rel.cnt_seq_pre}× Sequel/Prequel</span>}
                        {rel.cnt_side > 0 && <span>{rel.cnt_side}× Side Story</span>}
                        {rel.cnt_spin > 0 && <span>{rel.cnt_spin}× Spin-off</span>}
                        <span>Série: {rel.franchise_ep} EP ({(rel.franchise_min / 60).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} h)</span>
                    </div>
                )}

                {/* Links */}
                <div className="rec-links-row">
                    <a href={recLink} target="_blank" rel="noopener noreferrer" className="rec-link-btn">
                        👥 Uživatelský posudek
                    </a>
                    <a href={`https://myanimelist.net/anime/${details.mal_id}`} target="_blank" rel="noopener noreferrer" className="rec-link-btn">
                        🔗 MAL
                    </a>
                </div>
            </div>
        </div>
    )
}


// ============================================================
// MAIN COMPONENT
// ============================================================
function Recommendations() {
    const location = useLocation()
    const navigate = useNavigate()

    const [animeList, setAnimeList] = useState([])
    const [ptwList, setPtwList] = useState([])
    const [loading, setLoading] = useState(true)

    // Search & selection with persistence
    const [selectedAnime, setSelectedAnime] = useState(() => {
        try { const saved = localStorage.getItem('lastRecAnime'); return saved ? JSON.parse(saved) : null; } catch { return null; }
    })
    const [searchTerm, setSearchTerm] = useState(() => {
        try { const saved = localStorage.getItem('lastRecAnime'); return saved ? JSON.parse(saved).name : ''; } catch { return ''; }
    })
    const [showDropdown, setShowDropdown] = useState(false)
    const dropdownRef = useRef(null)

    // Recommendations state with persistence
    const [recommendations, setRecommendations] = useState(() => {
        try { const saved = localStorage.getItem('lastRecResults'); return saved ? JSON.parse(saved) : []; } catch { return []; }
    })
    const [isProcessing, setIsProcessing] = useState(false)
    const [autoRun, setAutoRun] = useState(false)
    const [progress, setProgress] = useState({ current: 0, total: 0, text: '', eta: '' })
    const abortRef = useRef(null)

    // Settings
    const [settings, setSettings] = useState(loadSettings)
    const [showSettings, setShowSettings] = useState(false)

    // Handle location presetAnime
    useEffect(() => {
        if (location.state?.presetAnime && animeList.length > 0) {
            const preset = location.state.presetAnime
            // Overwrite localStorage with new preset if coming from navigation
            setSelectedAnime(preset)
            setSearchTerm(preset.name)
            setRecommendations([])
            setAutoRun(true)
            
            // Clear location state safely
            window.history.replaceState({}, document.title)
        }
    }, [location.state, animeList])

    // Persist to localStorage
    useEffect(() => {
        if (selectedAnime) localStorage.setItem('lastRecAnime', JSON.stringify(selectedAnime))
    }, [selectedAnime])
    
    useEffect(() => {
        if (recommendations.length > 0) localStorage.setItem('lastRecResults', JSON.stringify(recommendations))
    }, [recommendations])

    // Load data
    useEffect(() => {
        Promise.all([
            fetch('data/anime_list.json').then(r => r.json()),
            fetch('data/plan_to_watch.json').then(r => r.json()).catch(() => []),
        ]).then(([anime, ptw]) => {
            setAnimeList(anime)
            setPtwList(ptw)
            setLoading(false)
        }).catch(err => {
            console.error('Failed to load data:', err)
            setLoading(false)
        })
    }, [])

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    // Search filter — shows all anime on empty input (like Excel dropdown), or filters as you type
    const filteredAnime = useMemo(() => {
        let list = animeList
        if (searchTerm && searchTerm.length >= 1) {
            const term = searchTerm.toLowerCase()
            list = animeList.filter(a => a.name && a.name.toLowerCase().includes(term))
        }
        // Sort by end_date descending (most recently watched first), "X" at the end
        return [...list].sort((a, b) => {
            const aDate = a.end_date && a.end_date !== 'X' ? new Date(a.end_date).getTime() : 0
            const bDate = b.end_date && b.end_date !== 'X' ? new Date(b.end_date).getTime() : 0
            return bDate - aDate
        })
    }, [searchTerm, animeList])

    // User ratings precalculation
    const userRatings = useMemo(() => precalculateUserRatings(animeList), [animeList])

    // Build watched set (MAL IDs)
    const watchedIds = useMemo(() => {
        const set = new Set()
        for (const a of animeList) {
            if (a.mal_url) {
                const match = a.mal_url.match(/\/anime\/(\d+)/)
                if (match) set.add(parseInt(match[1]))
            }
        }
        return set
    }, [animeList])

    // Select anime
    const handleSelectAnime = useCallback((anime) => {
        setSelectedAnime(anime)
        setSearchTerm(anime.name)
        setShowDropdown(false)
    }, [])

    const handleClearSelection = useCallback(() => {
        setSelectedAnime(null)
        setSearchTerm('')
        setRecommendations([])
        localStorage.removeItem('lastRecAnime')
        localStorage.removeItem('lastRecResults')
    }, [])

    // Save settings
    const handleSaveSettings = useCallback((newSettings) => {
        setSettings(newSettings)
        saveSettings(newSettings)
    }, [])

    // ============================================================
    // GENERATE RECOMMENDATIONS (main engine)
    // ============================================================
    const generateRecommendations = useCallback(async () => {
        if (!selectedAnime?.mal_url) return
        const malIdMatch = selectedAnime.mal_url.match(/\/anime\/(\d+)/)
        if (!malIdMatch) return
        const animeId = parseInt(malIdMatch[1])

        // Abort any previous run
        if (abortRef.current) abortRef.current.abort()
        const controller = new AbortController()
        abortRef.current = controller
        const signal = controller.signal

        setIsProcessing(true)
        setRecommendations([])
        setProgress({ current: 0, total: 0, text: 'Načítání doporučení...', eta: '' })

        try {
            // 1. Get source anime details
            const sourceDetails = await fetchWithRetry(
                `https://api.jikan.moe/v4/anime/${animeId}`, settings, signal
            )
            const sourceScoreVal = sourceDetails?.data?.score || 0

            if (settings.USE_ADAPTIVE_DELAY) await sleep(settings.INITIAL_DELAY_MS)
            else await sleep(settings.API_DELAY_MS)

            // 2. Get recommendations
            const recsResp = await fetchWithRetry(
                `https://api.jikan.moe/v4/anime/${animeId}/recommendations`, settings, signal
            )

            if (!recsResp?.data?.length) {
                setProgress({ current: 0, total: 0, text: 'Žádná doporučení nebyla nalezena.', eta: '' })
                setIsProcessing(false)
                return
            }

            const totalRecs = recsResp.data.length
            setProgress({ current: 0, total: totalRecs, text: `Zpracovávám 0 z ${totalRecs} doporučení...`, eta: '' })

            // 3. Process each recommendation
            let results = []
            let avgTime = 0
            const startTime = Date.now()

            for (let i = 0; i < totalRecs; i++) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

                const item = recsResp.data[i]
                const recId = item.entry.mal_id
                const votes = item.votes

                // Skip already watched
                if (watchedIds.has(recId)) {
                    setProgress(prev => ({
                        ...prev,
                        current: i + 1,
                        text: `Zpracovávám ${i + 1} z ${totalRecs}... (přeskočeno — již zhlédnuto)`,
                    }))
                    continue
                }

                const iterStart = Date.now()

                // Fetch details
                const detailsResp = await fetchWithRetry(
                    `https://api.jikan.moe/v4/anime/${recId}`, settings, signal
                )

                if (detailsResp?.data) {
                    const details = detailsResp.data
                    const relevance = calculateRelevance(details, userRatings, votes, ptwList, settings)

                    // PTW filter: skip anime already in PTW if user disabled showing them
                    if (!settings.showPTWAnime && relevance.plan_s === 1) {
                        continue
                    }

                    results.push({
                        details, relevance, votes,
                        synopsis: cleanSynopsis(details.synopsis),
                        anilistData: null,
                        sourceScore: sourceScoreVal,
                    })
                }

                // Timing
                const iterTime = Date.now() - iterStart
                avgTime = avgTime === 0 ? iterTime : iterTime * 0.1 + avgTime * 0.9
                const remaining = avgTime * (totalRecs - i - 1) / 1000
                const etaText = remaining > 60
                    ? `${Math.floor(remaining / 60)}m ${Math.round(remaining % 60)}s`
                    : `${Math.round(remaining)}s`

                setProgress({
                    current: i + 1, total: totalRecs,
                    text: `Zpracovávám ${i + 1} z ${totalRecs}... (ID: ${recId})`,
                    eta: `Zbývá: ~${etaText}`,
                })

                // Adaptive delay (VBA-identical)
                if (settings.USE_ADAPTIVE_DELAY) await sleep(settings.INITIAL_DELAY_MS)
                else await sleep(settings.API_DELAY_MS)
            }

            // 4. Sort by relevance
            results.sort((a, b) => b.relevance.total - a.relevance.total)

            // 5. Trim to display limit
            results = results.slice(0, settings.MAX_RECS_TO_DISPLAY)

            // 6. AniList tags batch
            if (results.length > 0) {
                setProgress(prev => ({ ...prev, text: `Stahuji AniList tagy pro TOP ${results.length} anime...` }))
                const malIds = results.map(r => r.details.mal_id)
                const anilistData = await fetchAnilistTagsBatch(malIds, settings, signal)

                for (const r of results) {
                    r.anilistData = anilistData[r.details.mal_id] || null
                }
            }

            // 7. Score statistics are now lazy-loaded on hover (ScoreDistributionTooltip)

            setRecommendations(results)
            setProgress({
                current: totalRecs, total: totalRecs,
                text: `Hotovo! Nalezeno ${results.length} doporučení.`,
                eta: `Celkový čas: ${((Date.now() - startTime) / 1000).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})}s`,
            })
        } catch (err) {
            if (err.name === 'AbortError') {
                setProgress({ current: 0, total: 0, text: 'Zrušeno.', eta: '' })
            } else {
                console.error('Recommendation error:', err)
                setProgress({ current: 0, total: 0, text: `Chyba: ${err.message}`, eta: '' })
            }
        } finally {
            setIsProcessing(false)
        }
    }, [selectedAnime, settings, watchedIds, userRatings, ptwList])

    // Auto run when navigated from detail
    useEffect(() => {
        if (autoRun && selectedAnime && !isProcessing) {
            generateRecommendations()
            setAutoRun(false)
        }
    }, [autoRun, selectedAnime, generateRecommendations, isProcessing])

    // Cancel
    const handleCancel = () => {
        if (abortRef.current) abortRef.current.abort()
    }

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Načítání...</div>
    }

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                <h2 style={{ margin: 0 }}>
                    Recommendations
                    {recommendations.length > 0 && (
                        <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                            ({recommendations.length})
                        </span>
                    )}
                </h2>
                <button
                    className="rec-action-btn rec-action-btn-cancel"
                    onClick={() => setShowSettings(true)}
                >
                    ⚙️ Nastavení
                </button>
            </div>

            {/* Anime Selector */}
            <div className="rec-search-row">
                <div className="rec-selector-container" ref={dropdownRef}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Vyber anime ze svého seznamu..."
                        value={searchTerm}
                        onChange={e => {
                            setSearchTerm(e.target.value)
                            setShowDropdown(true)
                            if (selectedAnime && e.target.value !== selectedAnime.name) {
                                setSelectedAnime(null)
                            }
                        }}
                        onFocus={() => setShowDropdown(true)}
                        style={{ width: '100%', paddingRight: selectedAnime ? '36px' : undefined }}
                        disabled={isProcessing}
                    />
                    {selectedAnime && !isProcessing && (
                        <button
                            className="rec-clear-btn"
                            onClick={handleClearSelection}
                            title="Zrušit výběr"
                        >
                            ×
                        </button>
                    )}
                    {showDropdown && filteredAnime.length > 0 && (
                        <div className="search-results-dropdown">
                            {filteredAnime.map((anime, idx) => {
                                const rating = anime.rating && !isNaN(Number(anime.rating)) ? Number(anime.rating) : null
                                const genres = anime.genres || ''
                                const themes = anime.themes && anime.themes !== 'X' ? anime.themes : ''
                                const ep = anime.episodes ? `EP: ${anime.episodes}` : ''
                                const totalMin = anime.total_time ? Math.round(anime.total_time) : 0
                                const totalH = anime.total_time ? (anime.total_time / 60) : 0
                                const duration = totalMin > 0 ? `Délka: ${totalMin} min (${totalH.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} h)` : ''

                                return (
                                    <div key={idx} className="rec-dropdown-item" onClick={() => handleSelectAnime(anime)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                                            <span style={{ fontWeight: '600', color: '#e0e0e0', fontSize: '0.95rem' }}>{anime.name}</span>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)', gap: '0' }}>
                                                {genres && <span>{genres}</span>}
                                                {genres && themes && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>}
                                                {themes && <span style={{ color: 'var(--accent-primary)', opacity: 0.8 }}>{themes}</span>}
                                                {(genres || themes) && ep && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>}
                                                {ep && <span>{ep}</span>}
                                                {ep && duration && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>}
                                                {!ep && (genres || themes) && duration && <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>·</span>}
                                                {duration && <span>{duration}</span>}
                                            </div>
                                        </div>
                                        {rating !== null && (
                                            <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', marginLeft: '12px', fontSize: '0.9rem', paddingTop: '2px', fontWeight: '500' }}>
                                                FH: {Math.round(rating)}/10
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                <button
                    className="rec-action-btn rec-action-btn-primary"
                    onClick={generateRecommendations}
                    disabled={!selectedAnime || isProcessing}
                >
                    {isProcessing ? '⏳ Zpracovávám...' : '🔍 Najít doporučení'}
                </button>

                {isProcessing && (
                    <button className="rec-action-btn rec-action-btn-cancel" onClick={handleCancel}>
                        ✕ Zrušit
                    </button>
                )}
            </div>

            {/* Progress */}
            {(isProcessing || progress.text) && (
                <div className="rec-progress-container">
                    <div className="rec-progress-text">
                        <span>{progress.text}</span>
                        <span>{progress.eta}</span>
                    </div>
                    {progress.total > 0 && (
                        <div className="rec-progress-bar-track">
                            <div
                                className="rec-progress-bar-fill"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Results */}
            {recommendations.length > 0 && (
                <div className="rec-cards-grid">
                    {recommendations.map((rec, idx) => {
                        const malIdMatch = selectedAnime?.mal_url?.match(/\/anime\/(\d+)/)
                        const sourceId = malIdMatch ? parseInt(malIdMatch[1]) : 0
                        return (
                            <RecCard
                                key={rec.details.mal_id}
                                rec={rec}
                                sourceAnimeId={sourceId}
                                sourceScore={rec.sourceScore || 0}
                                settings={settings}
                            />
                        )
                    })}
                </div>
            )}

            {/* Empty state */}
            {!isProcessing && recommendations.length === 0 && !progress.text && (
                <div className="rec-empty-state">
                    <div className="rec-empty-icon">💡</div>
                    <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Doporučení anime</h3>
                    <p style={{ maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
                        Vyber anime ze svého seznamu a systém najde podobná anime,
                        která jsi ještě neviděl. Seřadí je podle relevance na základě tvých preferencí.
                    </p>
                </div>
            )}

            {/* Settings Modal */}
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                settings={settings}
                onSave={handleSaveSettings}
            />
        </div>
    )
}

export default Recommendations
