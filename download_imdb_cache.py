import os
import json
import time
import urllib.request
import gzip
import io
import re
from datetime import datetime

# ============================================
# CONFIGURATION
# ============================================
script_dir = os.path.dirname(os.path.abspath(__file__))
public_data_dir = os.path.join(script_dir, "public", "data")
anime_list_path = os.path.join(public_data_dir, "anime_list.json")
imdb_cache_path = os.path.join(public_data_dir, "imdb_cache.json")

# Public data sources
MAPPING_URL = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json"
IMDB_EPISODES_URL = "https://datasets.imdbws.com/title.episode.tsv.gz"
IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def download_data(url):
    """Download binary data with progress/status print"""
    print(f"Stahuji: {url}")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()

def download_mapping():
    """Fetch MAL to IMDb ID mapping with season numbers"""
    raw_data = download_data(MAPPING_URL)
    full_list = json.loads(raw_data.decode('utf-8'))
    
    mapping = {}
    for item in full_list:
        if "mal_id" in item and "imdb_id" in item and item["imdb_id"]:
            season = item.get("season", {})
            # Look up TMDB or TVDB season number, default to season 1
            season_num = season.get("tmdb") or season.get("tvdb") or 1
            mapping[int(item["mal_id"])] = {
                "imdb_id": item["imdb_id"],
                "season": season_num
            }
    return mapping

def main():
    print("=" * 60)
    print("IMDb TSV Cache Downloader for Anime List Web")
    print("=" * 60)
    
    if not os.path.exists(anime_list_path):
        print(f"Error: {anime_list_path} neexistuje!")
        return
        
    with open(anime_list_path, 'r', encoding='utf-8') as f:
        anime_list = json.load(f)
        
    # Load existing cache
    cache = {}
    if os.path.exists(imdb_cache_path):
        try:
            with open(imdb_cache_path, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            print("Načtena stávající IMDb cache z disku.")
        except Exception as e:
            print(f"Varování: Nepodařilo se načíst stávající cache: {e}")

    # Build target mapping and filter queue
    mapping = download_mapping()
    print(f"Načteno {len(mapping)} MAL -> IMDb mapování s informací o sériích.")
    
    # 1. Identify which IMDb IDs need updates
    now = time.time()
    three_months_ago = now - (90 * 24 * 60 * 60)
    one_week_ago_ms = (now - (7 * 24 * 60 * 60)) * 1000
    
    imdb_ids_to_update = set()
    
    for a in anime_list:
        mal_url = a.get("mal_url")
        if not mal_url: continue
        
        match = re.search(r'/anime/(\d+)', mal_url)
        if not match: continue
        mal_id = int(match.group(1))
        mal_id_str = str(mal_id)
        
        mal_id_info = mapping.get(mal_id)
        if not mal_id_info: continue
        imdb_id = mal_id_info["imdb_id"]
        
        # Check if already cached and if it's fresh
        is_cached = mal_id_str in cache
        should_update = not is_cached
        
        if is_cached:
            cached_data = cache[mal_id_str]
            fetched_at = cached_data.get("fetchedAt", 0)
            
            # Update weekly if fetched more than 7 days ago AND release date is < 3 months ago or Airing
            if fetched_at < one_week_ago_ms:
                is_recent = False
                release_date_str = a.get("release_date")
                if release_date_str and release_date_str != 'X':
                    try:
                        release_dt = datetime.fromisoformat(release_date_str.replace('Z', ''))
                        if release_dt.timestamp() > three_months_ago:
                            is_recent = True
                    except:
                        pass
                
                is_airing = a.get("status") == "AIRING!"
                if is_recent or is_airing:
                    should_update = True
                    print(f"  -> {a['name']} vyžaduje týdenní aktualizaci (Nedávné/Airing)")
        
        if should_update:
            imdb_ids_to_update.add(imdb_id)
            
    if not imdb_ids_to_update:
        print("Všechna data v cache jsou aktuální. Není potřeba nic stahovat.")
        return
        
    # Build complete target series entries for the target IMDb IDs
    target_series = {}  # imdb_id -> list of {mal_id_str, name, season}
    for a in anime_list:
        mal_url = a.get("mal_url")
        if not mal_url: continue
        
        match = re.search(r'/anime/(\d+)', mal_url)
        if not match: continue
        mal_id = int(match.group(1))
        mal_id_str = str(mal_id)
        
        mal_id_info = mapping.get(mal_id)
        if not mal_id_info: continue
        imdb_id = mal_id_info["imdb_id"]
        season_num = mal_id_info["season"]
        
        if imdb_id in imdb_ids_to_update:
            if imdb_id not in target_series:
                target_series[imdb_id] = []
            target_series[imdb_id].append({
                "mal_id_str": mal_id_str,
                "name": a["name"],
                "season": season_num
            })
            
    print(f"Bude aktualizováno {len(imdb_ids_to_update)} IMDb ID (pokrývající {sum(len(v) for v in target_series.values())} sérií/sezón v naší databázi).")
    
    # 2. Download and process title.episode.tsv.gz
    episodes_data = download_data(IMDB_EPISODES_URL)
    print("Zpracovávám tabulku epizod (title.episode.tsv)...")
    
    # map: ep_tconst -> {parent_imdb_id, season, episode}
    episodes_map = {}
    
    with gzip.GzipFile(fileobj=io.BytesIO(episodes_data)) as f:
        header = f.readline().decode('utf-8').strip().split('\t')
        tconst_idx = header.index('tconst')
        parent_idx = header.index('parentTconst')
        season_idx = header.index('seasonNumber')
        episode_idx = header.index('episodeNumber')
        
        for line_bytes in f:
            line = line_bytes.decode('utf-8').strip().split('\t')
            if len(line) <= max(tconst_idx, parent_idx, season_idx, episode_idx): continue
            
            parent = line[parent_idx]
            if parent in target_series:
                tconst = line[tconst_idx]
                season = line[season_idx]
                episode = line[episode_idx]
                
                if season != '\\N' and episode != '\\N':
                    episodes_map[tconst] = {
                        "parent": parent,
                        "season": int(season),
                        "episode": int(episode)
                    }
                    
    print(f"Nalezeno {len(episodes_map)} epizod patřících k našim vybraným sériím.")
    
    # 3. Download and process title.ratings.tsv.gz
    ratings_data = download_data(IMDB_RATINGS_URL)
    print("Zpracovávám tabulku hodnocení (title.ratings.tsv)...")
    
    # Structure to hold temporary ratings: mal_id_str -> { "EP X": rating }
    temp_ratings = {}
    
    with gzip.GzipFile(fileobj=io.BytesIO(ratings_data)) as f:
        header = f.readline().decode('utf-8').strip().split('\t')
        tconst_idx = header.index('tconst')
        rating_idx = header.index('averageRating')
        
        for line_bytes in f:
            line = line_bytes.decode('utf-8').strip().split('\t')
            if len(line) <= max(tconst_idx, rating_idx): continue
            
            tconst = line[tconst_idx]
            
            # Case A: It's an episode tconst in episodes_map (TV Series Episode)
            if tconst in episodes_map:
                rating = float(line[rating_idx])
                ep_info = episodes_map[tconst]
                parent = ep_info["parent"]
                
                # Find matching MAL IDs for this parent and season
                matched_items = [item for item in target_series[parent] if item["season"] == ep_info["season"]]
                
                # Fallback: if no match by season, but there is only 1 MAL ID for this IMDb ID, match it anyway
                if not matched_items and len(target_series[parent]) == 1:
                    matched_items = target_series[parent]
                    
                for item in matched_items:
                    mal_id_str = item["mal_id_str"]
                    if mal_id_str not in temp_ratings:
                        temp_ratings[mal_id_str] = {}
                    ep_key = f"EP {ep_info['episode']}"
                    temp_ratings[mal_id_str][ep_key] = rating
            
            # Case B: It is the main title IMDb ID itself (Movie / OVA / Single Special)
            elif tconst in target_series:
                rating = float(line[rating_idx])
                for item in target_series[tconst]:
                    mal_id_str = item["mal_id_str"]
                    if mal_id_str not in temp_ratings:
                        temp_ratings[mal_id_str] = {}
                    # Store under all possible keys for maximum compatibility
                    temp_ratings[mal_id_str]["Film"] = rating
                    temp_ratings[mal_id_str]["OVA"] = rating
                    temp_ratings[mal_id_str]["Speciál"] = rating
                    temp_ratings[mal_id_str]["EP 1"] = rating
                
    # 4. Integrate back into cache
    for mal_id_str, eps_ratings in temp_ratings.items():
        # Find anime info in target_series
        anime_name = "Unknown"
        imdb_id = None
        for parent, items in target_series.items():
            for item in items:
                if item["mal_id_str"] == mal_id_str:
                    anime_name = item["name"]
                    imdb_id = parent
                    break
            if imdb_id:
                break
                
        cache[mal_id_str] = {
            "imdb_id": imdb_id,
            "animeName": anime_name,
            "episodes": eps_ratings,
            "fetchedAt": int(time.time() * 1000)
        }
        try:
            print(f"  -> Uloženo {len(eps_ratings)} epizod pro: {anime_name} (MAL: {mal_id_str})")
        except:
            print(f"  -> Uloženo {len(eps_ratings)} epizod pro: [Unicode Name] (MAL: {mal_id_str})")
        
    # Write cache back to file
    with open(imdb_cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
        
    print("\n" + "=" * 60)
    print("IMDb cache byla úspěšně vytvořena a uložena do:")
    print(imdb_cache_path)
    print("=" * 60)

if __name__ == "__main__":
    main()
