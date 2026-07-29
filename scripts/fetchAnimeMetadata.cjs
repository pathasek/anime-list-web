const fs = require('fs');
const path = require('path');

const ANIME_LIST_PATH = '../public/data/anime_list.json';
const OUTPUT_PATH = '../public/data/anime_metadata.json';
const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

const extractMalId = (url) => {
    if (!url) return null;
    const match = url.match(/\/anime\/(\d+)/);
    return match ? match[1] : null;
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

// Verze schématu záznamu. Zvýšení donutí skript přetáhnout i položky, které
// v cache už jsou, ale nemají nová pole. (v2 přidalo broadcast/episodes/status —
// bez broadcastu se v Dashboardu nezobrazoval řádek „Pravidelně“ a kalendář
// vysílání neměl z čeho promítat další díly.)
const SCHEMA_VERSION = 2;

// Vysílaná a neodvysílaná anime se mění (přibývají díly, upřesní se počet
// epizod i vysílací čas), takže jejich záznam nesmí ležet v cache navždy.
const VOLATILE_STATUSES = new Set(['Currently Airing', 'Not yet aired']);
const VOLATILE_TTL_MS = 24 * 60 * 60 * 1000;

function isFresh(rec) {
    if (!rec || rec.v !== SCHEMA_VERSION) return false;
    if (!rec.imageUrl) return false;
    if (VOLATILE_STATUSES.has(rec.status)) {
        return !!rec.fetchedAt && (Date.now() - rec.fetchedAt < VOLATILE_TTL_MS);
    }
    return true;
}

async function fetchMetadata() {
    console.log('Starting metadata fetch...');
    const animeListData = JSON.parse(fs.readFileSync(path.join(__dirname, ANIME_LIST_PATH), 'utf-8'));
    
    let cache = {};
    const cachePath = path.join(__dirname, OUTPUT_PATH);
    if (fs.existsSync(cachePath)) {
        cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }

    const uniqueIds = new Set();
    animeListData.forEach(anime => {
        const malId = extractMalId(anime.mal_url);
        if (malId) uniqueIds.add(malId);
    });

    console.log(`Found ${uniqueIds.size} unique anime IDs.`);
    
    let processed = 0;
    for (const id of uniqueIds) {
        if (isFresh(cache[id])) {
            processed++;
            continue;
        }

        try {
            console.log(`Fetching ID ${id}...`);
            const res = await fetch(`${JIKAN_BASE_URL}/anime/${id}`);
            if (res.status === 429) {
                console.log('Rate limited! Waiting 3 seconds...');
                await delay(3000);
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const json = await res.json();
            const data = json.data;
            if (data) {
                cache[id] = {
                    v: SCHEMA_VERSION,
                    score: data.score,
                    imageUrl: data.images?.jpg?.image_url,
                    largeImageUrl: data.images?.jpg?.large_image_url,
                    // Pravidelný vysílací čas (JST) — zdroj pro řádek „Pravidelně“
                    // a pro projekci dalších dílů v kalendáři vysílání.
                    broadcast: data.broadcast || null,
                    // Plánovaný celkový počet dílů; null, dokud ho MAL nezná.
                    episodes: data.episodes ?? null,
                    status: data.status || null,
                    fetchedAt: Date.now()
                };
                // Save incrementally
                fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
            }
            await delay(1000); // 1 req/sec
        } catch (error) {
            console.error(`Error fetching ${id}:`, error.message);
            await delay(2000);
        }
        processed++;
        if (processed % 10 === 0) console.log(`Processed ${processed}/${uniqueIds.size}`);
    }
    
    console.log('Done fetching metadata!');
}

fetchMetadata();
