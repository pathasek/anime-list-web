import os
import json
import time
import urllib.request
import urllib.error
import re

# ============================================
# CONFIGURATION
# ============================================
API_DELAY_MS = 350
RETRY_MAX = 3
RETRY_BASE_MS = 1500
JIKAN_BASE_URL = 'https://api.jikan.moe/v4'

# Paths
script_dir = os.path.dirname(os.path.abspath(__file__))
public_data_dir = os.path.join(script_dir, "public", "data")
anime_list_path = os.path.join(public_data_dir, "anime_list.json")
jikan_cache_path = os.path.join(public_data_dir, "jikan_cache.json")

def extract_mal_id(mal_url):
    if not mal_url:
        return None
    match = re.search(r'/anime/(\d+)', mal_url)
    return int(match.group(1)) if match else None

def make_request(url, retries=RETRY_MAX):
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429:  # Rate limit
                wait_ms = RETRY_BASE_MS * (2 ** attempt)
                print(f"  Rate limited (429). Waiting {wait_ms}ms (attempt {attempt + 1}/{retries})")
                time.sleep(wait_ms / 1000.0)
                continue
            elif e.code == 404:  # Not found
                return None
            else:
                print(f"  HTTP Error {e.code} on {url}: {e.reason}")
                if attempt == retries:
                    return None
        except Exception as e:
            print(f"  Error on {url}: {e}")
            if attempt == retries:
                return None
            wait_ms = RETRY_BASE_MS * (2 ** attempt)
            time.sleep(wait_ms / 1000.0)
    return None

def fetch_episode_list(mal_id):
    all_episodes = []
    page = 1
    has_next_page = True

    while has_next_page:
        url = f"{JIKAN_BASE_URL}/anime/{mal_id}/episodes?page={page}"
        data = make_request(url)
        time.sleep(API_DELAY_MS / 1000.0)

        if not data or 'data' not in data:
            if page == 1:
                return None
            break

        all_episodes.extend(data['data'])
        has_next_page = data.get('pagination', {}).get('has_next_page', False)
        page += 1

    return all_episodes

def fetch_episode_detail(mal_id, ep_num):
    url = f"{JIKAN_BASE_URL}/anime/{mal_id}/episodes/{ep_num}"
    data = make_request(url)
    time.sleep(API_DELAY_MS / 1000.0)
    return data['data'] if data and 'data' in data else None

def main():
    print("=" * 60)
    print("Jikan API Cache Downloader for Git Persistence")
    print("=" * 60)
    
    if not os.path.exists(anime_list_path):
        print(f"Error: anime_list.json not found at {anime_list_path}")
        return

    # Load anime list
    with open(anime_list_path, 'r', encoding='utf-8') as f:
        anime_list = json.load(f)

    # Filter queue
    queue = []
    for a in anime_list:
        mal_url = a.get('mal_url')
        if mal_url:
            mal_id = extract_mal_id(mal_url)
            if mal_id and int(a.get('episodes', 0)) > 0:
                queue.append({
                    'name': a.get('name'),
                    'malId': mal_id,
                    'episodes': int(a.get('episodes', 0))
                })

    print(f"Loaded {len(queue)} anime with valid MyAnimeList links.")

    # Load existing static cache
    cache = {'episode_lists': {}, 'episode_details': {}}
    if os.path.exists(jikan_cache_path):
        try:
            with open(jikan_cache_path, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            print("Loaded existing jikan_cache.json from disk.")
        except Exception as e:
            print(f"Warning: Could not parse existing cache, starting fresh: {e}")

    if 'episode_lists' not in cache:
        cache['episode_lists'] = {}
    if 'episode_details' not in cache:
        cache['episode_details'] = {}

    total_anime = len(queue)
    save_counter = 0

    for idx, anime in enumerate(queue):
        mal_id_str = str(anime['malId'])
        anime_name = anime['name']
        
        # Check if list is already fully cached
        cached_list = cache['episode_lists'].get(mal_id_str)
        
        # Check details status
        has_all_details = True
        if cached_list and 'episodes' in cached_list:
            for ep in cached_list['episodes']:
                key = f"{mal_id_str}_{ep['mal_id']}"
                if key not in cache['episode_details']:
                    has_all_details = False
                    break
        else:
            has_all_details = False

        if cached_list and has_all_details:
            # Fully cached! Skip.
            continue

        print(f"\n[{idx + 1}/{total_anime}] Downloading: {anime_name} (MAL ID: {mal_id_str})")

        # 1. Fetch Episode List
        if not cached_list:
            api_eps = fetch_episode_list(anime['malId'])
            if api_eps:
                mapped_eps = []
                for ep in api_eps:
                    mapped_eps.append({
                        'mal_id': ep.get('mal_id'),
                        'title': ep.get('title') or ep.get('title_japanese') or f"Episode {ep.get('mal_id')}",
                        'title_japanese': ep.get('title_japanese'),
                        'aired': ep.get('aired'),
                        'score': ep.get('score'),
                        'filler': ep.get('filler', False),
                        'recap': ep.get('recap', False),
                        'url': ep.get('url'),
                        'forum_url': ep.get('forum_url')
                    })
                
                cache['episode_lists'][mal_id_str] = {
                    'animeName': anime_name,
                    'episodes': mapped_eps,
                    'fetchedAt': int(time.time() * 1000)
                }
                cached_list = cache['episode_lists'][mal_id_str]
                print(f"  -> Fetched {len(mapped_eps)} episodes list.")
                save_counter += 1
            else:
                # Fallback: Fetch main anime details (for Movies, OVAs, Specials)
                print(f"  -> No episodes found on API, fetching main Anime details...")
                anime_data = None
                try:
                    url = f"{JIKAN_BASE_URL}/anime/{anime['malId']}"
                    resp_data = make_request(url)
                    time.sleep(API_DELAY_MS / 1000.0)
                    if resp_data and 'data' in resp_data:
                        anime_data = resp_data['data']
                except Exception as e:
                    print(f"    Failed to fetch main anime details fallback: {e}")

                if anime_data:
                    # Create synthetic 1-episode list
                    label = "Film" if anime_data.get('type') == 'Movie' else ("OVA" if anime_data.get('type') == 'OVA' else "Speciál")
                    synthetic_eps = [{
                        'mal_id': 1,
                        'title': label,
                        'title_japanese': anime_data.get('title_japanese'),
                        'aired': anime_data.get('aired', {}).get('from'),
                        'score': anime_data.get('score'),
                        'filler': False,
                        'recap': False,
                        'url': anime_data.get('url'),
                        'forum_url': None
                    }]
                    
                    cache['episode_lists'][mal_id_str] = {
                        'animeName': anime_name,
                        'episodes': synthetic_eps,
                        'fetchedAt': int(time.time() * 1000)
                    }
                    
                    # Immediately save synthetic details
                    key = f"{mal_id_str}_1"
                    cache['episode_details'][key] = {
                        'malId': anime['malId'],
                        'epNum': 1,
                        'title': label,
                        'title_japanese': anime_data.get('title_japanese'),
                        'synopsis': anime_data.get('synopsis'),
                        'duration': anime_data.get('duration'),
                        'aired': anime_data.get('aired', {}).get('from'),
                        'filler': False,
                        'recap': False,
                        'fetchedAt': int(time.time() * 1000),
                        'lastRefreshedAt': int(time.time() * 1000)
                    }
                    
                    print(f"  -> Generated synthetic 1-episode list from main Anime info (Type: {anime_data.get('type')}).")
                    save_counter += 1
                else:
                    print(f"  -> No episodes or main details found on API, skipping.")
                    continue

        # 2. Fetch Episode Details/Synopses
        eps = cached_list.get('episodes', [])
        details_fetched = 0
        
        for ep in eps:
            ep_num = ep['mal_id']
            key = f"{mal_id_str}_{ep_num}"
            
            if key in cache['episode_details']:
                # Already detailed!
                continue
                
            print(f"  -> Fetching synopsis for EP {ep_num}...")
            detail = fetch_episode_detail(anime['malId'], ep_num)
            
            if detail:
                cache['episode_details'][key] = {
                    'malId': anime['malId'],
                    'epNum': ep_num,
                    'title': detail.get('title') or detail.get('title_japanese') or f"Episode {ep_num}",
                    'title_japanese': detail.get('title_japanese'),
                    'synopsis': detail.get('synopsis'),
                    'duration': detail.get('duration'),
                    'aired': detail.get('aired') or ep.get('aired'),
                    'filler': detail.get('filler', False),
                    'recap': detail.get('recap', False),
                    'fetchedAt': int(time.time() * 1000),
                    'lastRefreshedAt': int(time.time() * 1000)
                }
                details_fetched += 1
                save_counter += 1
                
                # Incremental save every 10 API operations to avoid losing progress
                if save_counter >= 10:
                    with open(jikan_cache_path, 'w', encoding='utf-8') as f:
                        json.dump(cache, f, ensure_ascii=False, indent=2)
                    save_counter = 0

        if details_fetched > 0:
            print(f"  -> Completed synopses download: {details_fetched} new episodes saved.")

    # Final Save
    with open(jikan_cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 60)
    print("FINISHED! Static Jikan cache successfully built and written to:")
    print(jikan_cache_path)
    print("=" * 60)

if __name__ == "__main__":
    main()
