const fs = require('fs');
const https = require('https');
const path = require('path');

const dataFile = path.resolve(__dirname, 'public/data/anime_list.json');
const imageDir = path.resolve(__dirname, 'public/images/anime');

if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
}

const animeList = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const delay = ms => new Promise(res => setTimeout(res, ms));

function getMalId(url) {
    if (!url) return null;
    const match = url.match(/anime\/(\d+)\//);
    return match ? match[1] : null;
}

function fetchJikan(malId, name) {
    return new Promise((resolve, reject) => {
        let url = `https://api.jikan.moe/v4/anime/${malId}`;
        if (!malId) {
            url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(name)}&limit=1`;
        }

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    process.stdout.write(` API Error ${res.statusCode} `);
                    resolve(null);
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    if (malId && json.data && json.data.images) {
                        resolve(json.data.images.jpg.large_image_url);
                    } else if (!malId && json.data && json.data.length > 0) {
                        resolve(json.data[0].images.jpg.large_image_url);
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

function downloadImage(url, destPath) {
    return new Promise((resolve) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            } else {
                file.close();
                fs.unlink(destPath, () => {});
                resolve(false);
            }
        }).on('error', () => {
            file.close();
            fs.unlink(destPath, () => {});
            resolve(false);
        });
    });
}

async function run() {
    console.log(`Starting download for ${animeList.length} anime...`);
    
    for (let i = 0; i < animeList.length; i++) {
        const a = animeList[i];
        
        // Ensure name acts as a valid filename by replacing illegal chars if necessary
        // Windows illegal chars: < > : " / \ | ? *
        const safeName = a.name.replace(/[<>:"/\\|?*]/g, '');
        const finalDest = path.join(imageDir, `${safeName}.jpg`);
        // Actual json uses existing names, we should match exact names in animeList
        const actualDest = path.join(imageDir, `${a.name}.jpg`);
        
        process.stdout.write(`[${i + 1}/${animeList.length}] ${a.name}...`);
        
        try {
            const malId = getMalId(a.mal_url);
            const imgUrl = await fetchJikan(malId, a.name);
            
            if (imgUrl) {
                const success = await downloadImage(imgUrl, actualDest);
                if (success) {
                    process.stdout.write(` OK\n`);
                } else {
                    process.stdout.write(` FAILED DOWNLOAD\n`);
                }
            } else {
                process.stdout.write(` NOT FOUND\n`);
            }
        } catch (e) {
            process.stdout.write(` ERROR\n`);
        }
        
        // 1200ms delay to respect 60 requests per minute API rate limit safely
        await delay(1200);
    }
    
    console.log('All downloads completed.');
}

run();
