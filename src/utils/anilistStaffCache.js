// Asynchronní cache pro autory hudby stažené z AniList GraphQL API.
//
// AniList GraphQL API je veřejné a nevyžaduje API klíč.
// Stažená data ukládáme do localStorage s platností 30 dní.
// Dotaz se provede pouze při prvním načtení karty (když chybí autoři
// nebo jsou označeni jako "Various Artists") a v paměti zůstává trvale.

const LS_KEY = 'anilist_artists_cache_v2';
export const ANILIST_ARTISTS_EVENT = 'anilist-artists-changed';

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 dní v milisekundách

let cache = null;
const pendingFetches = new Set();

function loadCache() {
    if (cache) return cache;
    try {
        cache = JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch {
        cache = {};
    }
    return cache;
}

function saveCache(data) {
    cache = data;
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
        /* Quota exceeded */
    }
}

/**
 * Získá autory z cache, nebo spustí stahování v pozadí.
 */
export function getAnilistArtists(animeName) {
    if (!animeName) return null;
    const store = loadCache();
    const entry = store[animeName];
    const now = Date.now();

    if (entry && entry.artists !== undefined && (now - entry.fetchedAt < CACHE_TTL)) {
        return entry.artists;
    }

    // Pokud už nestahujeme, spustíme stahování na pozadí
    if (!pendingFetches.has(animeName)) {
        triggerFetch(animeName);
    }

    return entry ? entry.artists : null;
}

const GRAPHQL_QUERY = `
query ($search: String, $page: Int) {
  Media (search: $search, type: ANIME) {
    id
    title {
      english
      romaji
      native
    }
    staff (page: $page, perPage: 25) {
      pageInfo {
        total
        perPage
        currentPage
        hasNextPage
      }
      edges {
        role
        node {
          name {
            full
          }
        }
      }
    }
  }
}
`;

async function fetchPage(search, page) {
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: GRAPHQL_QUERY,
                variables: { search, page }
            })
        });
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

async function triggerFetch(animeName) {
    pendingFetches.add(animeName);

    try {
        // 1. Načíst první stránku pro získání celkového počtu
        const page1Data = await fetchPage(animeName, 1);
        if (!page1Data || !page1Data.data || !page1Data.data.Media) {
            // Označíme jako prázdné v cache, abychom se nedotazovali neustále dokola
            updateCacheEntry(animeName, null);
            return;
        }

        const media = page1Data.data.Media;
        const pageInfo = media.staff.pageInfo;
        let allEdges = [...media.staff.edges];

        // 2. Pokud je více stránek, stáhneme je paralelně (max 20 stránek, což pokryje 500 členů)
        const totalStaff = pageInfo.total || 0;
        const perPage = pageInfo.perPage || 25;
        const totalPages = Math.min(20, Math.ceil(totalStaff / perPage));

        if (totalPages > 1) {
            const promises = [];
            for (let p = 2; p <= totalPages; p++) {
                promises.push(fetchPage(animeName, p));
            }
            const results = await Promise.all(promises);
            results.forEach(res => {
                if (res && res.data && res.data.Media) {
                    allEdges = allEdges.concat(res.data.Media.staff.edges || []);
                }
            });
        }

        // 3. Filtrace hlavních hudebních autorů
        const composers = new Set();
        allEdges.forEach(edge => {
            if (!edge || !edge.role || !edge.node || !edge.node.name || !edge.node.name.full) return;
            const r = edge.role.toLowerCase().trim();
            const isMainComposer = r === 'music' || 
                                   r === 'music director' || 
                                   r === 'original music' ||
                                   r === 'composer' ||
                                   r === 'original music composer' ||
                                   r === 'bgm composer';
            if (isMainComposer) {
                composers.add(edge.node.name.full);
            }
        });

        const artistsString = composers.size > 0 ? Array.from(composers).join(', ') : null;
        updateCacheEntry(animeName, artistsString);

    } catch (e) {
        console.error('Failed to fetch AniList artists for ' + animeName, e);
    } finally {
        pendingFetches.delete(animeName);
    }
}

function updateCacheEntry(animeName, artists) {
    const store = loadCache();
    store[animeName] = {
        artists,
        fetchedAt: Date.now()
    };
    saveCache(store);

    // Vyvolat událost pro překreslení komponent
    try {
        window.dispatchEvent(new CustomEvent(ANILIST_ARTISTS_EVENT, { detail: { animeName, artists } }));
    } catch {
        /* SSR */
    }
}
