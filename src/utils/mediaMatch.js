// Párování OP/ED/OST médií k anime.
// OP/ED (+ příp. OST) videa jsou na Google Drive (op_ed_videos.json).
// OST je typicky YouTube (favorites_ost.json -> pieces).

// Sjednocený klíč pro párování názvů — MUSÍ odpovídat normalize_key v build_gdrive_op_ed.py
export function normalizeAnimeKey(s) {
    return (s || '')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '') // odstraň diakritiku (bez vkládání mezer)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?/\s]+)/

export function extractYoutubeId(url) {
    if (!url) return null
    const m = url.match(YT_RE)
    return m ? m[1] : null
}

export function extractYoutubePlaylistId(url) {
    if (!url) return null
    const m = url.match(/[?&]list=([^&]+)/)
    return m ? m[1] : null
}

// Vyhledávací URL na YouTube (fallback, když klip není na Drive)
export function youtubeSearchUrl(animeName, type) {
    const q = `${animeName} ${type}`.trim()
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
}

// Vrátí { OP: [...], ED: [...], OST: [...] } pro dané anime.
// Každá položka: { kind: 'video'|'youtube'|'youtube-playlist'|'external', type, song, artist, label, url, ytId, file_id, ytPlaylistId, isBestPiece }
export function getMediaForAnime(animeName, opEdVideos, ostPieces, ostWhole, animeSeries) {
    const key = normalizeAnimeKey(animeName)
    const result = { OP: [], ED: [], OST: [] }
    if (!key) return result

    // OP/ED/OST videa z Google Drive
    for (const v of opEdVideos || []) {
        let isMatch = (v.match_key === key);
        if (!isMatch) {
            // Chytřejší párování řad a částí (seasons & parts)
            const cleanFileBase = v.match_key.replace(/\s+(?:s(?:eason)?\s*\d+(\s+part\s*\d+)?|part\s*\d+)$/i, '').trim();
            const cleanAnimeBase = key.replace(/\s+(?:s(?:eason)?\s*\d+(\s+part\s*\d+)?|part\s*\d+)$/i, '').trim();
            
            if (cleanFileBase === cleanAnimeBase) {
                // Mají stejný základní název. Zkontrolujeme řady a části:
                const fileSeasonMatch = v.match_key.match(/s(?:eason)?\s*(\d+)/i);
                const animeSeasonMatch = key.match(/s(?:eason)?\s*(\d+)/i);
                
                // Pokud řada není specifikována, předpokládáme řadu 1
                const fileSeason = fileSeasonMatch ? parseInt(fileSeasonMatch[1], 10) : 1;
                const animeSeason = animeSeasonMatch ? parseInt(animeSeasonMatch[1], 10) : 1;
                
                const filePartMatch = v.match_key.match(/part\s*(\d+)/i);
                const animePartMatch = key.match(/part\s*(\d+)/i);
                
                const filePart = filePartMatch ? parseInt(filePartMatch[1], 10) : null;
                const animePart = animePartMatch ? parseInt(animePartMatch[1], 10) : null;
                
                // Obě mají stejnou řadu (případně default 1)
                if (fileSeason === animeSeason) {
                    // B1: Pokud soubor specifikuje část (Part 1), musí se rovnat části v databázi
                    if (filePart !== null) {
                        if (filePart === animePart) {
                            isMatch = true;
                        }
                    }
                    // B2: Pokud soubor část nespecifikuje, zápasí s jakoukoliv částí v databázi (Part 1 i Part 2)
                    else {
                        isMatch = true;
                    }
                }
            }
        }
        
        if (!isMatch) continue;
        
        const type = (v.type || '').toUpperCase()
        if (!result[type]) continue
        result[type].push({
            kind: 'video',
            type,
            song: v.song || null,
            artist: v.artist || null,
            label: v.ver ? `${type} ${v.ver}` : type,
            url: v.url,
            ytId: null,
            file_id: v.file_id || null,
        })
    }

    // Zjistit, zda existuje celkový playlist pro toto anime (podle série nebo názvu)
    const seriesKey = animeSeries ? normalizeAnimeKey(animeSeries) : null
    const wholeEntry = (ostWhole || []).find(w => {
        const wKey = normalizeAnimeKey(w.anime_name)
        return wKey && (wKey === seriesKey || wKey === key)
    })
    const hasWhole = !!wholeEntry

    // OST z YouTube (favorites_ost.json -> pieces)
    for (const p of ostPieces || []) {
        if (normalizeAnimeKey(p.anime_name) !== key) continue
        const ytId = extractYoutubeId(p.ost_url)
        if (!ytId) continue
        // nepřidávej duplicitně, pokud už existuje stejné YT id
        if (result.OST.some(o => o.ytId === ytId)) continue
        result.OST.push({
            kind: 'youtube',
            type: 'OST',
            song: p.ost_name || null,
            artist: null,
            label: 'OST',
            url: p.ost_url,
            ytId,
            isBestPiece: hasWhole,
        })
    }

    // Pokud existuje celkový playlist, přidat jeho odkazy jako další stopy
    if (wholeEntry) {
        if (wholeEntry.yt_url) {
            const playlistId = extractYoutubePlaylistId(wholeEntry.yt_url)
            if (playlistId) {
                result.OST.push({
                    kind: 'youtube-playlist',
                    type: 'OST',
                    song: `${wholeEntry.anime_name} (YouTube)`,
                    artist: null,
                    label: 'Celý playlist',
                    url: wholeEntry.yt_url,
                    ytPlaylistId: playlistId,
                })
            }
        }
        if (wholeEntry.spotify_url) {
            result.OST.push({
                kind: 'external',
                type: 'OST',
                song: `${wholeEntry.anime_name} (Spotify)`,
                artist: null,
                label: 'Celý playlist',
                url: wholeEntry.spotify_url,
            })
        }
    }

    return result
}

export function hasAnyMedia(media) {
    return !!media && (media.OP.length + media.ED.length + media.OST.length) > 0
}
