import fs from 'fs';
import path from 'path';
import { calculateTreeState } from './src/utils/xpEngines/index.js';

// Read JSON files
const dataDir = './public/data';
const animeList = JSON.parse(fs.readFileSync(path.join(dataDir, 'anime_list.json'), 'utf-8'));
const historyLog = JSON.parse(fs.readFileSync(path.join(dataDir, 'history_log.json'), 'utf-8'));
const favorites = JSON.parse(fs.readFileSync(path.join(dataDir, 'favorites.json'), 'utf-8'));
const favoritesOst = JSON.parse(fs.readFileSync(path.join(dataDir, 'favorites_ost.json'), 'utf-8'));
const stats = JSON.parse(fs.readFileSync(path.join(dataDir, 'stats.json'), 'utf-8'));
const topFavorites = JSON.parse(fs.readFileSync(path.join(dataDir, 'top_favorites.json'), 'utf-8'));
const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf-8'));
const planToWatch = JSON.parse(fs.readFileSync(path.join(dataDir, 'plan_to_watch.json'), 'utf-8'));
const categoryRatings = JSON.parse(fs.readFileSync(path.join(dataDir, 'category_ratings.json'), 'utf-8'));
const episodeRatings = JSON.parse(fs.readFileSync(path.join(dataDir, 'episode_ratings.json'), 'utf-8'));

// Run the engine
const nodes = calculateTreeState({
    animeList, historyLog, favorites, favoritesOst, stats,
    topFavorites, notes, planToWatch, categoryRatings, episodeRatings
});

// Sum up XP
const totalXp = nodes.reduce((sum, n) => sum + (n.xp || 0), 0);
const base = 50;
const globalLevel = Math.floor(Math.sqrt(totalXp / base)) || 1;

console.log(`=== DEBUG TREE ===`);
console.log(`Total Nodes: ${nodes.length}`);
console.log(`Total XP: ${totalXp.toLocaleString()}`);
console.log(`Global Level: ${globalLevel}`);

// Print top 15 nodes by XP
console.log(`\n=== TOP 15 NODES BY XP ===`);
const sortedNodes = [...nodes].sort((a, b) => b.xp - a.xp);
sortedNodes.slice(0, 15).forEach((n, idx) => {
    console.log(`${idx+1}. [${n.id}] ${n.label}: ${n.xp.toLocaleString()} XP (Level: ${n.level}/${n.maxLevel})`);
});
