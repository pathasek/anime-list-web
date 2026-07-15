import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { pauseBackgroundDownload, resumeBackgroundDownload, fetchWithRetry as jikanFetchWithRetry } from '../utils/jikanService'
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

    // Plán 6 Ú1: kombinace Jikan × AniList doporučení + tagy ve skóre
    RELEVANCE_W_TAGS: 16,              // váha AniList tagů (vážený průměr mého hodnocení per tag)
    ANILIST_MAX_VOTES_FOR_SCORE: 40,   // log-strop hlasů AniList (menší komunita ⇒ nižší strop než MAL 120)
    AGREEMENT_BONUS: 0.35,             // bonus, když anime doporučují OBA zdroje (podíl slabšího skóre)
    useAniListRecs: true,              // kombinovat s AniList doporučeními

    // PTW filter
    showPTWAnime: false,
    // Plán 6 Ú1: zobrazit ve výsledcích i už zhlédnutá anime (default skrytá — jako dřív)
    showWatchedAnime: false,
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

// Plán 6 Ú1: AniList doporučení pro zdrojové anime — jeden GraphQL dotaz vrátí celý
// seznam včetně počtu hlasů (rating = upvotes−downvotes, ekvivalent Jikan votes).
async function fetchAnilistRecommendations(malId, signal) {
    const query = `query ($idMal: Int) {
        Media(idMal: $idMal, type: ANIME) {
            recommendations(sort: RATING_DESC, perPage: 25) {
                nodes { rating mediaRecommendation { idMal type } }
            }
        }
    }`
    try {
        const resp = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { idMal: malId } }),
            signal
        })
        if (!resp.ok) {
            console.warn('AniList recommendations API Error:', resp.status)
            return {}
        }
        const json = await resp.json()
        const nodes = json?.data?.Media?.recommendations?.nodes || []
        const result = {} // malId -> počet hlasů AniList
        for (const n of nodes) {
            const m = n?.mediaRecommendation
            if (!m?.idMal || m.type !== 'ANIME') continue
            if ((n.rating || 0) <= 0) continue
            result[m.idMal] = (result[m.idMal] || 0) + n.rating
        }
        return result
    } catch (err) {
        if (err.name === 'AbortError') throw err
        console.warn('AniList recommendations error:', err)
        return {}
    }
}

async function fetchAnilistTagsBatch(malIds, settings, signal) {
    if (!malIds.length) return {}

    let queryParts = malIds.map((id, i) =>
        `m${i}: Media(idMal: ${id}, type: ANIME) { idMal siteUrl format episodes duration season seasonYear tags { name rank description isMediaSpoiler } relations { edges { relationType node { format episodes duration } } } }`
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
                .map(t => ({ name: t.name, rank: t.rank, description: t.description || '' }))

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

            result[media.idMal] = { tags, relations: rel, siteUrl: media.siteUrl || null }
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

function getVotesScoreScaled(votesCount, maxVotes) {
    if (votesCount <= 1) return 0
    if (votesCount >= maxVotes) return 1
    return Math.log(votesCount) / Math.log(maxVotes)
}

function getVotesScore(votesCount, settings) {
    return getVotesScoreScaled(votesCount, settings.MAX_VOTES_FOR_SCORE)
}

// Plán 6 Ú1: férová kombinace hlasů obou zdrojů — každý zdroj se normalizuje na vlastní
// log-škále (různě velké komunity), silnější zdroj dává základ, shoda obou dává bonus.
function getCombinedVotesScore(jikanVotes, anilistVotes, settings) {
    const normJ = getVotesScoreScaled(jikanVotes || 0, settings.MAX_VOTES_FOR_SCORE)
    const normA = getVotesScoreScaled(anilistVotes || 0, settings.ANILIST_MAX_VOTES_FOR_SCORE)
    return Math.min(1, Math.max(normJ, normA) + settings.AGREEMENT_BONUS * Math.min(normJ, normA))
}

// Plán 6 Ú1: skóre AniList tagů kandidáta vůči mému tag profilu (vážený průměr mého
// hodnocení per tag; váha = rank tagu u kandidáta). Bez průniku → neutrální 0.5.
function getTagScore(tags, userTagRatings) {
    let sumW = 0, sumWR = 0
    for (const t of tags || []) {
        const ur = userTagRatings[t.name]
        if (ur === undefined) continue
        const w = (t.rank || 0) / 100
        if (w <= 0) continue
        sumW += w
        sumWR += ur * w
    }
    return sumW > 0 ? (sumWR / sumW) / 10 : 0.5
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

function calculateRelevance(details, userRatings, votesInfo, ptwList, settings, anilistTags, userTagRatings) {
    const planScore = isInPlanToWatch(
        details.title_english || details.title, ptwList
    ) ? 1 : 0

    const jikanVotes = votesInfo?.jikan || 0
    const anilistVotes = votesInfo?.anilist || 0
    const votes = jikanVotes + anilistVotes

    const malScoreVal = details.score || 0
    const malScoreNorm = malScoreVal / 10
    const genreThemeScore = getGenreThemeScore(details, userRatings.genreRatings, userRatings.themeRatings)
    const lengthScore = getLengthScore(details.episodes || 0, details.duration, settings)
    const votesScore = getCombinedVotesScore(jikanVotes, anilistVotes, settings)
    const popScore = malScoreVal >= settings.MIN_SCORE_FOR_POP_BONUS
        ? getPopularityScore(details.members || 0, settings) : 0
    const tagScore = getTagScore(anilistTags, userTagRatings || {})

    const plan_p = planScore * settings.RELEVANCE_W_IN_PLAN
    const mal_p = malScoreNorm * settings.RELEVANCE_W_MAL_SCORE
    const genre_p = genreThemeScore * settings.RELEVANCE_W_GENRE_THEME
    const length_p = lengthScore * settings.RELEVANCE_W_LENGTH
    const votes_p = votesScore * settings.RELEVANCE_W_VOTES
    const pop_p = popScore * settings.RELEVANCE_W_POPULARITY
    const tags_p = tagScore * (settings.RELEVANCE_W_TAGS || 0)

    const total = plan_p + mal_p + genre_p + length_p + votes_p + pop_p + tags_p

    // Compute human-readable length string like VBA: "5,0 h / 12 EP" or "1 hr 53 min"
    let lengthVal = null
    const episodes = details.episodes || 0
    const durationStr = details.duration || ''
    if (episodes > 0 && /per ep/i.test(durationStr)) {
        const durMatch = String(durationStr).match(/(\d+)/)
        if (durMatch) {
            const durationPerEp = parseInt(durMatch[1])
            const totalMinutes = episodes * durationPerEp
            const hours = (totalMinutes / 60).toFixed(1).replace('.', ',')
            lengthVal = `${hours} h / ${episodes} EP`
        }
    } else if (durationStr && episodes <= 1) {
        // Movie or single-episode — use raw duration text (e.g. "1 hr 53 min")
        lengthVal = durationStr
    }

    return {
        total, plan_s: planScore, mal_s_val: malScoreVal, mal_s_norm: malScoreNorm,
        genre_s: genreThemeScore, length_s: lengthScore, length_s_val: lengthVal,
        votes_s: votesScore, pop_s: popScore, tags_s: tagScore,
        plan_p, mal_p, genre_p, length_p, votes_p, pop_p, tags_p,
        votes_c: votes, votes_jikan: jikanVotes, votes_anilist: anilistVotes,
        members_c: details.members || 0,
    }
}

// Plán 6 Ú1: dynamický maximální součet bodů podle aktuálních vah (breakdown „X / max")
function getMaxRelevance(settings) {
    return (settings.RELEVANCE_W_IN_PLAN || 0) + (settings.RELEVANCE_W_MAL_SCORE || 0)
        + (settings.RELEVANCE_W_GENRE_THEME || 0) + (settings.RELEVANCE_W_LENGTH || 0)
        + (settings.RELEVANCE_W_VOTES || 0) + (settings.RELEVANCE_W_POPULARITY || 0)
        + (settings.RELEVANCE_W_TAGS || 0)
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
                    <NumberInput label="AniList tagy" field="RELEVANCE_W_TAGS" />
                    <NumberInput label="V plánu (PTW bonus)" field="RELEVANCE_W_IN_PLAN" />
                    <NumberInput label="Délka anime" field="RELEVANCE_W_LENGTH" />
                    <NumberInput label="Popularita" field="RELEVANCE_W_POPULARITY" />

                    <div className="rec-settings-section-title">Kombinace zdrojů (Jikan × AniList)</div>
                    <div className="rec-toggle-row">
                        <label>Kombinovat s AniList doporučeními</label>
                        <div
                            className={`rec-toggle-switch ${local.useAniListRecs ? 'active' : ''}`}
                            onClick={() => set('useAniListRecs', !local.useAniListRecs)}
                        />
                    </div>
                    <NumberInput label="Max. hlasů AniList (plné skóre)" field="ANILIST_MAX_VOTES_FOR_SCORE" />
                    <NumberInput label="Bonus za shodu obou zdrojů" field="AGREEMENT_BONUS" step={0.05} />

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
                    <div className="rec-toggle-row">
                        <label>Zobrazit i zhlédnutá anime</label>
                        <div
                            className={`rec-toggle-switch ${local.showWatchedAnime ? 'active' : ''}`}
                            onClick={() => set('showWatchedAnime', !local.showWatchedAnime)}
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

    useEffect(() => {
        let isMounted = true

        if (jikanStatsCache[malId]) {
            setStats(jikanStatsCache[malId])
            setLoading(false)
            return
        }

        setLoading(true)
        jikanFetchWithRetry(`https://api.jikan.moe/v4/anime/${malId}/statistics`, 3, 'high')
            .then(data => {
                if (isMounted && data && data.data) {
                    jikanStatsCache[malId] = data.data
                    setStats(data.data)
                    setLoading(false)
                } else if (isMounted) {
                    setError(true)
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

    useEffect(() => {
        // Prevent calculating position until data is 100% loaded and rendered into the ref
        if (loading || error || !stats || !tooltipRef.current) return
        
        try {
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
        } catch (e) {
            console.error("Position calculation error", e)
        }
    }, [stats, loading, error])

    if (loading) {
        return (
            <div className="rec-breakdown-tooltip rec-stats-tooltip" style={{ width: '250px', zIndex: 1001, padding: '12px', textAlign: 'center', pointerEvents: 'none' }}>
                <span style={{ color: 'var(--text-muted)' }}>Načítám statistiky...</span>
            </div>
        )
    }

    if (error || !stats || !stats.scores) {
        return (
            <div className="rec-breakdown-tooltip rec-stats-tooltip" style={{ width: '250px', zIndex: 1001, padding: '12px', textAlign: 'center', pointerEvents: 'none' }}>
                <span style={{ color: 'var(--accent-red)' }}>Statistiky nedostupné</span>
            </div>
        )
    }

    try {
        const scoresMap = {}
        stats.scores.forEach(s => {
            scoresMap[s.score] = s
        })

        const totalVotes = stats.total || 1
        const maxVotesArray = stats.scores.map(s => Number(s.votes) || 0)
        const maxVotes = Math.max(...maxVotesArray, 1)
        
        const formatNumber = (num, noSpaceBehindTis) => {
            if (num == null) return "0"
            if (num >= 1000) {
                const fNum = (num / 1000).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1}).replace(/[\s\u202F\xA0]+$/g, '')
                return fNum + (noSpaceBehindTis ? ' tis.' : ' tis.')
            }
            return num.toLocaleString('cs-CZ').replace(/[\s\u202F\xA0]+$/g, '')
        }

        const MAX_BAR_WIDTH = 25
        const barChar = '█'

        return (
            <div 
                ref={tooltipRef} 
                className="rec-breakdown-tooltip rec-stats-tooltip" 
                style={{ 
                    width: 'max-content', zIndex: 1001, padding: '16px', 
                    border: '1px solid var(--border-color)', 
                    background: 'rgba(20, 20, 25, 0.98)', 
                    color: 'var(--text-primary)', 
                    fontFamily: 'Consolas, monospace',
                    fontSize: '0.9rem', lineHeight: '1.4',
                    pointerEvents: 'none', 
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                    ...positionStyle 
                }}
            >
                <div style={{ paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    Statistika hodnocení: <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>({formatNumber(stats.total)} uživatelů)</span>
                </div>
                
                <div style={{ whiteSpace: 'pre', display: 'flex', flexDirection: 'column' }}>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(scoreVal => {
                        const row = scoresMap[scoreVal] || { votes: 0, percentage: 0 }
                        
                        let barWidth = 0
                        if (row.votes > 0 && maxVotes > 0) {
                            barWidth = Math.round((row.votes / maxVotes) * (MAX_BAR_WIDTH - 1)) + 1
                        }
                        if (isNaN(barWidth) || barWidth < 0) barWidth = 0
                        const bar = barChar.repeat(barWidth)
                        
                        const valPercent = (totalVotes > 0) ? (row.votes / totalVotes) * 100 : 0
                        const statsPart = `${valPercent.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1}).replace(/[\s\u202F\xA0]+$/g, '')} % (${formatNumber(row.votes, true)})`
                        
                        let padCount = Math.max(MAX_BAR_WIDTH - barWidth + 2, 0)
                        if (isNaN(padCount)) padCount = 0
                        const padding = " ".repeat(padCount)

                        return (
                            <div key={scoreVal} style={{ display: 'flex', alignItems: 'baseline' }}>
                                {`${scoreVal.toString().padStart(2, ' ')}: `}
                                <span style={{ color: '#fbbf24', backgroundColor: '#fbbf24', height: '0.8rem', display: 'inline-block', lineHeight: '0.8' }}>{bar}</span>
                                <span style={{ opacity: 0 }}>{padding}</span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '4px', fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '0.85rem' }}>{statsPart}</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    } catch (renderError) {
        console.error("Score rendering error", renderError)
        return (
            <div className="rec-breakdown-tooltip rec-stats-tooltip" style={{ width: '250px', zIndex: 1001, padding: '12px', textAlign: 'center', pointerEvents: 'none', background: 'rgba(20, 20, 25, 0.98)', border: '1px solid var(--border-color)', color: 'var(--accent-red)' }}>
                Chyba při vykreslování
            </div>
        )
    }
}

// ============================================================
// RELEVANCE BREAKDOWN TOOLTIP
// ============================================================
function RelevanceBreakdown({ data, settings, sourceScore, anchorRef }) {
    const tooltipRef = useRef(null)
    const [positionStyle, setPositionStyle] = useState({ visibility: 'hidden' })

    useLayoutEffect(() => {
        if (!tooltipRef.current || !anchorRef?.current) return
        // Tooltip je v portálu na <body> a pozicuje se přes position:fixed vůči
        // ringu (anchorRef). DŮLEŽITÉ: nesmí být potomkem .rec-card — ta má na
        // hover transform a fixed by se pak počítal vůči kartě, ne viewportu.
        // Preferuje místo vedle ringu, svisle se centruje, přiskřípne k okrajům;
        // kdyby byl vyšší než obrazovka (telefon naležato), zmenší se (scale).
        const el = tooltipRef.current
        const cellRect = anchorRef.current.getBoundingClientRect()
        const w = el.offsetWidth
        let h = el.offsetHeight
        const vw = window.innerWidth
        const vh = window.innerHeight
        const margin = 10

        let scale = 1
        const maxH = vh - 2 * margin
        if (h > maxH) {
            scale = maxH / h
            h = maxH
        }
        const scaledW = w * scale

        let left
        if (cellRect.right + 8 + scaledW <= vw - margin) left = cellRect.right + 8
        else if (cellRect.left - 8 - scaledW >= margin) left = cellRect.left - 8 - scaledW
        else left = Math.max(margin, Math.min(vw - scaledW - margin, cellRect.left + cellRect.width / 2 - scaledW / 2))

        let top = cellRect.top + cellRect.height / 2 - h / 2
        top = Math.max(margin, Math.min(vh - h - margin, top))

        setPositionStyle({
            visibility: 'visible',
            left: `${left}px`,
            top: `${top}px`,
            // přebít mobilní CSS translateX(-50%) — fixed souřadnice jsou už finální
            transform: scale < 1 ? `scale(${scale})` : 'none',
            transformOrigin: 'top left',
        })
    }, [anchorRef])

    const fmtScore = sourceScore ? sourceScore.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : 'N/A'
    const malCompare = (sourceScore && data.mal_s_val > sourceScore) ? `Má vyšší hodnocení` : `Nemá vyšší hodnocení`
    
    // Use pre-computed length string from calculateRelevance (e.g. "5,0 h / 12 EP")
    const lengthStr = data.length_s_val || 'Neznámá'
    
    const Row = ({ label, status, mult, weight, result }) => (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                {label}: <i style={{ color: 'var(--text-muted)' }}>({status})</i>
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                ({(mult || 0).toLocaleString('cs-CZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} * {weight}) = <strong style={{ color: '#fbbf24' }}>{(result || 0).toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} b.</strong>
            </span>
        </div>
    )

    return createPortal(
        <div
            ref={tooltipRef}
            className="rec-breakdown-tooltip rec-relevance-tooltip"
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                right: 'auto',
                bottom: 'auto',
                width: '320px',
                padding: '16px',
                textAlign: 'left',
                background: 'rgba(20, 20, 25, 0.98)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                pointerEvents: 'none',
                zIndex: 100001,
                ...positionStyle
            }}
        >
            <div style={{ marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px dashed #000', fontSize: '0.95rem' }}>
                Celková Relevance: <strong>{data.total.toLocaleString('cs-CZ', {minimumFractionDigits: 1, maximumFractionDigits: 1})} / {getMaxRelevance(settings)}</strong>
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
                status={(data.votes_jikan !== undefined)
                    ? `MAL ${data.votes_jikan}× · AniList ${data.votes_anilist || 0}×`
                    : `${data.votes_c}x doporučeno`}
                mult={data.votes_p / settings.RELEVANCE_W_VOTES}
                weight={settings.RELEVANCE_W_VOTES}
                result={data.votes_p}
            />
            {data.tags_p !== undefined && settings.RELEVANCE_W_TAGS > 0 && (
                <Row
                    label={`AniList tagy`}
                    status={data.tags_s === 0.5 ? 'Neutrální (bez shody tagů)' : data.tags_p >= settings.RELEVANCE_W_TAGS * 0.85 ? 'Silná shoda s mými tagy' : 'Shoda s mými tagy'}
                    mult={data.tags_p / settings.RELEVANCE_W_TAGS}
                    weight={settings.RELEVANCE_W_TAGS}
                    result={data.tags_p}
                />
            )}
            <Row
                label={`Popularita`}
                status={getPopularityTierName(data.members_c, settings)}
                mult={data.pop_p / settings.RELEVANCE_W_POPULARITY}
                weight={settings.RELEVANCE_W_POPULARITY}
                result={data.pop_p}
            />
        </div>,
        document.body
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
    const relevanceCellRef = useRef(null)

    // Tooltip relevance se nesmí „zaseknout" otevřený (hlavně dotyková zařízení,
    // kde mouseleave nikdy nepřijde) — zavřít kliknutím mimo nebo Escape.
    useEffect(() => {
        if (!showBreakdown) return
        const onDocClick = (e) => {
            if (relevanceCellRef.current && !relevanceCellRef.current.contains(e.target)) {
                setShowBreakdown(false)
            }
        }
        const onKey = (e) => { if (e.key === 'Escape') setShowBreakdown(false) }
        document.addEventListener('click', onDocClick)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('click', onDocClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [showBreakdown])

    const { relevance, details, anilistData } = rec
    // Plán 6 Ú1: normalizace na dynamické maximum vah (s tagy už není max 110)
    const maxTotal = getMaxRelevance(settings) || 100
    const score = Math.min(100, Math.max(0, (relevance.total / maxTotal) * 100))
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

    // User rec review link — textové posudky existují jen na MAL (AniList doporučení
    // jsou pouze hlasy bez textu), takže odkaz ukazujeme jen když má MAL hlasy.
    const hasMalRec = relevance.votes_jikan !== undefined ? relevance.votes_jikan > 0 : (relevance.votes_c || 0) > 0
    const recLink = `https://myanimelist.net/recommendations/anime/${sourceAnimeId}-${details.mal_id}`
    const anilistUrl = anilistData?.siteUrl || null

    return (
        <div className="rec-card">
            {/* Relevance Ring */}
            <div className="rec-relevance-cell" ref={relevanceCellRef} style={{ position: 'relative' }}>
                <div className="rec-relevance-ring"
                    onMouseEnter={() => setShowBreakdown(true)}
                    onMouseLeave={() => setShowBreakdown(false)}
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    style={{ cursor: 'pointer', filter: 'brightness(0.85) saturate(1.2)' }}
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
                {showBreakdown && <RelevanceBreakdown data={relevance} settings={settings} sourceScore={sourceScore} anchorRef={relevanceCellRef} />}
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
                        style={{ position: 'relative', filter: 'brightness(0.85) contrast(1.1)' }}
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
                    {rec.isWatched && (
                        <span className="rec-meta-badge" style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)', borderColor: 'rgba(52, 211, 153, 0.4)' }}>
                            ✅ Zhlédnuto{rec.myRating ? ` · FH ${Math.round(rec.myRating)}/10` : ''}
                        </span>
                    )}
                    <span className="rec-meta-badge votes" title="Počet uživatelských doporučení na MAL a AniList">
                        👍 {relevance.votes_jikan !== undefined
                            ? [
                                relevance.votes_jikan > 0 ? `MAL ${relevance.votes_jikan}×` : null,
                                relevance.votes_anilist > 0 ? `AniList ${relevance.votes_anilist}×` : null,
                              ].filter(Boolean).join(' · ') || '0× doporučeno'
                            : `${relevance.votes_c}× doporučeno`}
                    </span>
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
                            <span key={i} title={tag.description} style={{ cursor: tag.description ? 'help' : 'default' }} className={`rec-tag ${tag.rank >= 80 ? 'tier-1' : tag.rank >= 60 ? 'tier-2' : 'tier-3'}`}>
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
                    {hasMalRec && (
                        <a href={recLink} target="_blank" rel="noopener noreferrer" className="rec-link-btn">
                            👥 Uživatelský posudek (MAL)
                        </a>
                    )}
                    <a href={`https://myanimelist.net/anime/${details.mal_id}`} target="_blank" rel="noopener noreferrer" className="rec-link-btn">
                        🔗 MAL
                    </a>
                    {anilistUrl && (
                        <a href={anilistUrl} target="_blank" rel="noopener noreferrer" className="rec-link-btn">
                            🔗 AniList
                        </a>
                    )}
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

    // Pozastaví automatickou synchronizaci Jikanu na pozadí po dobu, kdy je uživatel v záložce Recommendations
    useEffect(() => {
        pauseBackgroundDownload()
        return () => {
            resumeBackgroundDownload()
        }
    }, [])

    const [animeList, setAnimeList] = useState([])
    const [showScrollTop, setShowScrollTop] = useState(false)

    useEffect(() => {
        const handleScroll = (e) => {
            const currentY = window.scrollY || document.documentElement.scrollTop;
            setShowScrollTop(currentY > 1000);
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, []);
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
            fetch('data/anime_list.json?v=' + Date.now()).then(r => r.json()),
            fetch('data/plan_to_watch.json?v=' + Date.now()).then(r => r.json()).catch(() => []),
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

    // Plán 6 Ú1: MAL id → můj záznam (pro badge „Zhlédnuto" s mým hodnocením)
    const watchedInfo = useMemo(() => {
        const map = new Map()
        for (const a of animeList) {
            const m = a.mal_url?.match(/\/anime\/(\d+)/)
            if (m) map.set(parseInt(m[1]), a)
        }
        return map
    }, [animeList])

    // Plán 6 Ú1: můj tag profil — vážený průměr hodnocení per AniList tag
    // (stejný vzorec jako Dashboard: váha = rank/100, jen dokončená a ohodnocená anime;
    // práh sumWeights ≥ 1.5, aby jeden náhodný výskyt tagu nerozhazoval skóre)
    const userTagRatings = useMemo(() => {
        const acc = {}
        for (const a of animeList) {
            if (!a.tags) continue
            const rating = parseFloat(a.rating)
            const finished = a.end_date && a.end_date !== 'X' && a.end_date !== ''
            if (!finished || isNaN(rating) || rating < 1 || rating > 10) continue
            for (const tagEntry of String(a.tags).split(';')) {
                const parts = tagEntry.split(':')
                if (parts.length < 2) continue
                const name = parts[0].trim()
                const rank = parseInt(parts[1]) || 0
                if (!name || rank <= 0) continue
                const w = rank / 100
                if (!acc[name]) acc[name] = { sw: 0, swr: 0 }
                acc[name].sw += w
                acc[name].swr += rating * w
            }
        }
        const out = {}
        for (const [name, s] of Object.entries(acc)) {
            if (s.sw >= 1.5) out[name] = s.swr / s.sw
        }
        return out
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

            // 2. Get recommendations — Jikan + AniList asynchronně naráz (Plán 6 Ú1)
            const [recsResp, anilistRecs] = await Promise.all([
                fetchWithRetry(`https://api.jikan.moe/v4/anime/${animeId}/recommendations`, settings, signal),
                settings.useAniListRecs !== false
                    ? fetchAnilistRecommendations(animeId, signal)
                    : Promise.resolve({}),
            ])

            // Union kandidátů podle MAL id (Jikan pořadí první, pak AniList-only)
            const candidates = []
            const seenIds = new Set()
            for (const item of (recsResp?.data || [])) {
                const id = item.entry.mal_id
                if (!id || seenIds.has(id)) continue
                seenIds.add(id)
                candidates.push({ malId: id, jikanVotes: item.votes || 0, anilistVotes: anilistRecs[id] || 0 })
            }
            for (const [idStr, aVotes] of Object.entries(anilistRecs)) {
                const id = parseInt(idStr, 10)
                if (!id || seenIds.has(id)) continue
                seenIds.add(id)
                candidates.push({ malId: id, jikanVotes: 0, anilistVotes: aVotes })
            }

            if (!candidates.length) {
                setProgress({ current: 0, total: 0, text: 'Žádná doporučení nebyla nalezena.', eta: '' })
                setIsProcessing(false)
                return
            }

            const totalRecs = candidates.length
            setProgress({ current: 0, total: totalRecs, text: `Zpracovávám 0 z ${totalRecs} doporučení...`, eta: '' })

            // 3. Process each candidate (Jikan detaily — MAL score, members, žánry)
            let results = []
            let avgTime = 0
            const startTime = Date.now()

            for (let i = 0; i < totalRecs; i++) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

                const cand = candidates[i]
                const recId = cand.malId
                const isWatched = watchedIds.has(recId)

                // Skip already watched (pokud nejsou v nastavení povolená)
                if (isWatched && !settings.showWatchedAnime) {
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
                    const myEntry = isWatched ? watchedInfo.get(recId) : null
                    const myRating = myEntry ? parseFloat(myEntry.rating) : null

                    results.push({
                        details,
                        relevance: null, // spočítá se až po stažení tagů (vstupují do skóre)
                        votes: cand.jikanVotes + cand.anilistVotes,
                        votesInfo: { jikan: cand.jikanVotes, anilist: cand.anilistVotes },
                        isWatched,
                        myRating: (myRating && !isNaN(myRating)) ? myRating : null,
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

            // 4. AniList tagy pro VŠECHNY kandidáty před scoringem (tagy vstupují do
            //    relevance) — po dávkách, ať nepřeteče komplexita GraphQL dotazu
            if (results.length > 0) {
                setProgress(prev => ({ ...prev, text: `Stahuji AniList tagy pro ${results.length} anime...` }))
                const malIds = results.map(r => r.details.mal_id)
                const anilistData = {}
                for (let i = 0; i < malIds.length; i += 15) {
                    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
                    const chunk = malIds.slice(i, i + 15)
                    Object.assign(anilistData, await fetchAnilistTagsBatch(chunk, settings, signal))
                    if (i + 15 < malIds.length) await sleep(700)
                }
                for (const r of results) {
                    r.anilistData = anilistData[r.details.mal_id] || null
                }
            }

            // 5. Scoring (včetně kombinovaných hlasů a tag profilu)
            for (const r of results) {
                r.relevance = calculateRelevance(
                    r.details, userRatings, r.votesInfo, ptwList, settings,
                    r.anilistData?.tags, userTagRatings
                )
            }

            // PTW filter: skip anime already in PTW if user disabled showing them
            if (!settings.showPTWAnime) {
                results = results.filter(r => r.relevance.plan_s !== 1)
            }

            // 6. Sort by relevance + trim to display limit
            results.sort((a, b) => b.relevance.total - a.relevance.total)
            results = results.slice(0, settings.MAX_RECS_TO_DISPLAY)

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
    }, [selectedAnime, settings, watchedIds, watchedInfo, userRatings, userTagRatings, ptwList])

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

            {showScrollTop && createPortal(
                <button
                    onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        const mainContent = document.querySelector('.main-content');
                        if (mainContent) {
                            mainContent.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    }}
                    style={{
                        position: 'fixed',
                        bottom: '30px', /* Posunuto dolů pro lepší ergonomii na telefonu/desktopu */
                        right: '30px',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '50px',
                        height: '50px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 9999, // Extremely high z-index to be over everything
                        fontSize: '1.5rem',
                        animation: 'fadeIn 0.3s ease-out'
                    }}
                    title="Zpět nahoru"
                >
                    ↑
                </button>,
                document.body
            )}
        </div>
    )
}

export default Recommendations
