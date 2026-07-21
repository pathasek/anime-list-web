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
        if (cache[id] && cache[id].score && cache[id].imageUrl) {
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
                    score: data.score,
                    imageUrl: data.images?.jpg?.image_url,
                    largeImageUrl: data.images?.jpg?.large_image_url
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