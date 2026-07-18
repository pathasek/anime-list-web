import os
import json
import time
import random
import urllib.request
import urllib.error
import re
import sys
from collections import deque

# Reconfigure stdout/stderr to UTF-8 to prevent Windows CP1250 charmap encoding crashes on unicode titles
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# ============================================
# CONFIGURATION
# ============================================
RETRY_MAX = 3
RETRY_BASE_MS = 1500
RETRY_CAP_MS = 30000          # Strop pro exponencialni backoff
JIKAN_BASE_URL = 'https://api.jikan.moe/v4'

# Jikan ma DVA soubezne limity: 3 pozadavky/s a 60 pozadavku/min.
# Puvodnich 350 ms respektovalo jen sekundovy limit (~171 req/min) a minutovy
# systematicky prekracovalo - odtud pramenily vsechny chyby 429.
RATE_PER_SECOND = 3
RATE_PER_MINUTE = 60

# Kolikrat celkem projit seznam (1 = bez opakovani) a jak dlouho cekat mezi pruchody
MAX_PASSES = 3
PASS_PAUSE_S = 60

# Pojistka: kdyz po sobe uplne selze tolik anime (oba endpointy), je zjevne
# mimo provoz cele API a nema smysl cekat u kazdeho dalsiho titulu pres pul
# minuty. Beh se ukonci hned a zbytek se odlozi na priste.
CIRCUIT_BREAK_AFTER = 3
MIN_INTERVAL_S = 1.0 / RATE_PER_SECOND

# Paths
script_dir = os.path.dirname(os.path.abspath(__file__))
public_data_dir = os.path.join(script_dir, "public", "data")
anime_list_path = os.path.join(public_data_dir, "anime_list.json")
jikan_cache_path = os.path.join(public_data_dir, "jikan_cache.json")

class TransientAPIError(Exception):
    """API docasne selhalo (5xx, sit, vycerpane retry).

    Odlisuje se od 404 zamerne: 404 znamena "tohle anime opravdu nema seznam
    epizod" a smi se zacementovat do cache. TransientAPIError znamena "ted to
    nevyslo" a NESMI vest k zapisu do cache - jinak se vypadek serveru ulozi
    natrvalo jako platny vysledek.
    """
    pass

def extract_mal_id(mal_url):
    if not mal_url:
        return None
    match = re.search(r'/anime/(\d+)', mal_url)
    return int(match.group(1)) if match else None

# Casova razitka odeslanych pozadavku pro hlidani minutoveho limitu
_request_times = deque()

def _throttle():
    """Pocka tak, aby byly dodrzeny oba limity Jikanu (3/s i 60/min)."""
    now = time.monotonic()

    # Sekundovy limit: rozestup mezi dvema po sobe jdoucimi pozadavky
    if _request_times:
        gap = now - _request_times[-1]
        if gap < MIN_INTERVAL_S:
            time.sleep(MIN_INTERVAL_S - gap)
            now = time.monotonic()

    # Minutovy limit: zahodit razitka starsi nez 60 s a pripadne pockat,
    # az nejstarsi z okna vyprsi
    while _request_times and now - _request_times[0] > 60.0:
        _request_times.popleft()

    if len(_request_times) >= RATE_PER_MINUTE:
        wait_s = 60.0 - (now - _request_times[0]) + 0.05
        if wait_s > 0:
            print(f"  [throttle] Minutovy limit vycerpan, cekam {wait_s:.1f}s")
            time.sleep(wait_s)
        now = time.monotonic()
        while _request_times and now - _request_times[0] > 60.0:
            _request_times.popleft()

    _request_times.append(time.monotonic())

def _backoff_ms(attempt):
    """Exponencialni backoff se stropem a jitterem (proti thundering herd)."""
    wait_ms = min(RETRY_BASE_MS * (2 ** attempt), RETRY_CAP_MS)
    return wait_ms + random.randint(0, 500)

def make_request(url, retries=RETRY_MAX):
    """Vrati dekodovanou JSON odpoved, nebo None pri HTTP 404.

    Vyhodi TransientAPIError, pokud se pozadavek nepodarilo dokoncit ani po
    vycerpani vsech pokusu.
    """
    total_attempts = retries + 1
    last_error = 'neznama chyba'

    for attempt in range(total_attempts):
        _throttle()
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode('utf-8'))

        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None

            last_error = f"HTTP {e.code} ({e.reason})"

            if e.code == 429:
                # Jikan posila Retry-After; kdyz ho posle, respektujeme ho
                retry_after = e.headers.get('Retry-After') if e.headers else None
                if retry_after and str(retry_after).strip().isdigit():
                    wait_ms = int(str(retry_after).strip()) * 1000
                else:
                    wait_ms = _backoff_ms(attempt)
            elif 500 <= e.code < 600:
                # DRIVE SE NERETRYOVALO: smycka pokracovala okamzite bez cekani,
                # takze tri 504 odesly behem milisekund a server nemel sanci se
                # zotavit. Ted i 5xx dostane plny backoff.
                wait_ms = _backoff_ms(attempt)
            else:
                # 4xx mimo 429/404 se opakovanim nespravi
                print(f"  HTTP Error {e.code} on {url}: {e.reason} - neopakovatelne")
                raise TransientAPIError(last_error)

        except Exception as e:
            last_error = str(e)
            wait_ms = _backoff_ms(attempt)

        if attempt == total_attempts - 1:
            break

        print(f"  {last_error}. Cekam {wait_ms}ms (pokus {attempt + 1}/{total_attempts})")
        time.sleep(wait_ms / 1000.0)

    raise TransientAPIError(last_error)

def fetch_episode_list(mal_id):
    """Vrati seznam epizod, nebo None pokud anime zadny seznam nema (404).

    Pri docasnem selhani propagovana TransientAPIError zajisti, ze se nikdy
    nevrati necastecne stazeny seznam - drive se pri vypadku uprostred
    strankovani ulozila do cache neuplna sada epizod.
    """
    all_episodes = []
    page = 1
    has_next_page = True

    while has_next_page:
        url = f"{JIKAN_BASE_URL}/anime/{mal_id}/episodes?page={page}"
        data = make_request(url)

        if not data or 'data' not in data:
            if page == 1:
                return None
            break

        all_episodes.extend(data['data'])
        has_next_page = data.get('pagination', {}).get('has_next_page', False)
        page += 1

    return all_episodes

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
    cache = {'episode_lists': {}}
    if os.path.exists(jikan_cache_path):
        try:
            with open(jikan_cache_path, 'r', encoding='utf-8') as f:
                raw_cache = json.load(f)
                # Keep only episode_lists
                cache['episode_lists'] = raw_cache.get('episode_lists', {})
            print("Loaded existing jikan_cache.json from disk.")
        except Exception as e:
            print(f"Warning: Could not parse existing cache, starting fresh: {e}")

    total_anime = len(queue)
    save_counter = 0
    failed = []   # (nazev, mal_id, duvod) - zaznamy, ktere se zamerne neulozily

    pending = list(queue)
    api_down = False          # nastavi pojistka, kdyz je API zjevne mimo provoz
    consecutive_fails = 0

    # API Jikanu vypadava v narazech - jeden titul selze jen proto, ze se trefil
    # do spatne chvile. Druhy pruchod po pauze proto vetsinu vypadku dozene.
    for pass_num in range(1, MAX_PASSES + 1):
        if pass_num > 1:
            print('\n' + '=' * 60)
            print(f'PRUCHOD {pass_num}/{MAX_PASSES}: opakuji {len(pending)} anime, ktera selhala.')
            print(f'Cekam {PASS_PAUSE_S}s, at ma API cas se zotavit...')
            print('=' * 60)
            time.sleep(PASS_PAUSE_S)

        failed = []
        consecutive_fails = 0      # pojistka se posuzuje v ramci jednoho pruchodu
        for idx, anime in enumerate(pending):
            mal_id_str = str(anime['malId'])
            anime_name = anime['name']
        
            # Check if list is already fully cached
            cached_list = cache['episode_lists'].get(mal_id_str)
        
            if cached_list:
                # Fully cached! Skip.
                continue

            print(f"\n[{idx + 1}/{len(pending)}] Downloading: {anime_name} (MAL ID: {mal_id_str})")

            # 1. Fetch Episode List
            if not cached_list:
                # Rozlisujeme dva RUZNE duvody, proc nemame seznam epizod:
                #   episodes_failed = True  -> API selhalo, o anime nevime nic
                #   episodes_failed = False -> API odpovedelo, ale seznam je prazdny
                #                              (typicky film / OVA / special)
                # V prvnim pripade nesmime hadat, ve druhem smime dopocitat.
                episodes_failed = False
                api_eps = None
                try:
                    api_eps = fetch_episode_list(anime['malId'])
                except TransientAPIError as e:
                    episodes_failed = True
                    print(f"  -> Seznam epizod selhal ({e}), zkousim hlavni info o anime...")

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
                    consecutive_fails = 0
                else:
                    # Fallback: hlavni info o anime (filmy, OVA, specialy - ty seznam
                    # epizod nemaji). Zkousi se i kdyz /episodes selhalo: pokud nam
                    # hlavni info rekne, ze jde o film s jednou "epizodou", umime
                    # zaznam poskladat spolehlive i bez seznamu epizod.
                    if not episodes_failed:
                        print(f"  -> Seznam epizod je prazdny, ctu hlavni info o anime...")
                    anime_data = None
                    try:
                        url = f"{JIKAN_BASE_URL}/anime/{anime['malId']}"
                        resp_data = make_request(url)
                        if resp_data and 'data' in resp_data:
                            anime_data = resp_data['data']
                    except TransientAPIError as e:
                        print(f"    -> Hlavni info take selhalo ({e}).")

                    if not anime_data:
                        print(f"  -> Nic se nepodarilo ziskat. Preskakuji BEZ zapisu, zkusi se pri dalsim behu.")
                        failed.append({'anime': anime, 'name': anime_name, 'mal_id': mal_id_str, 'reason': 'API nedostupne'})
                        consecutive_fails += 1
                        if consecutive_fails >= CIRCUIT_BREAK_AFTER:
                            api_down = True
                            print(f"\n  [POJISTKA] {consecutive_fails} anime po sobe selhalo na obou endpointech.")
                            print(f"  Jikan je zjevne mimo provoz - nema smysl u kazdeho dalsiho cekat pres pul minuty.")
                            print(f"  Koncim; zbytek se dotahne pri dalsim spusteni.")
                            break
                        continue

                    ep_count = anime_data.get('episodes') or 0
                    anime_type = anime_data.get('type')

                    # Pokud /episodes SELHALO a zaroven jde o vicedilne anime, znamena
                    # to, ze bychom museli vymyslet nazvy epizod, ktere nezname. Drive
                    # se v tomto pripade ulozil zaznam s JEDNOU epizodou a tim se do
                    # cache natrvalo zapsal nesmysl (odtud poskozenych 7 zaznamu).
                    if episodes_failed and ep_count > 1:
                        print(f"  -> Anime ma {ep_count} epizod, ale jejich seznam se nepodarilo stahnout.")
                        print(f"     Neukladam nic (jinak by v cache zustal zaznam s 1 epizodou).")
                        failed.append({'anime': anime, 'name': anime_name, 'mal_id': mal_id_str,
                                       'reason': f'seznam epizod nedostupny ({ep_count} ep.)'})
                        continue

                    if ep_count > 1:
                        # API potvrdilo, ze seznam epizod neexistuje, ale pocet zna.
                        # Vyrobime spravny POCET zastupnych epizod misto jedne.
                        synthetic_eps = [{
                            'mal_id': i,
                            'title': f"Epizoda {i}",
                            'title_japanese': None,
                            'aired': anime_data.get('aired', {}).get('from') if i == 1 else None,
                            'score': None,
                            'filler': False,
                            'recap': False,
                            'url': anime_data.get('url'),
                            'forum_url': None
                        } for i in range(1, ep_count + 1)]
                        note = f"{ep_count} zastupnych epizod (API nema jejich seznam)"
                    else:
                        label = "Film" if anime_type == 'Movie' else ("OVA" if anime_type == 'OVA' else "Speciál")
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
                        note = f"1 epizoda (Typ: {anime_type})"

                    cache['episode_lists'][mal_id_str] = {
                        'animeName': anime_name,
                        'episodes': synthetic_eps,
                        'fetchedAt': int(time.time() * 1000)
                    }
                    cached_list = cache['episode_lists'][mal_id_str]
                    print(f"  -> Vygenerovano z hlavniho info: {note}.")
                    save_counter += 1
                    consecutive_fails = 0

            # Incremental save every 10 API operations to avoid losing progress
            if save_counter >= 10:
                with open(jikan_cache_path, 'w', encoding='utf-8') as f:
                    json.dump(cache, f, ensure_ascii=False, indent=2)
                save_counter = 0

        if api_down:
            # zbyla anime uz ani nezkousime - jen je zaznamename
            done = {f['mal_id'] for f in failed}
            for a in pending:
                if str(a['malId']) not in done and str(a['malId']) not in cache['episode_lists']:
                    failed.append({'anime': a, 'name': a['name'], 'mal_id': str(a['malId']),
                                   'reason': 'nezkouseno - beh ukoncen pojistkou'})
            break

        if not failed:
            break
        pending = [f['anime'] for f in failed]

    # Final Save
    with open(jikan_cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    
    print("\n" + "=" * 60)
    print("FINISHED! Static Jikan cache successfully built and written to:")
    print(jikan_cache_path)

    if failed:
        print("-" * 60)
        print(f"POZOR: {len(failed)} anime se nepodarilo stahnout (do cache se")
        print("NEZAPSALO nic, takze je dalsi spusteni skriptu zkusi znovu):")
        for f in failed:
            print(f"  - {f['name']} (MAL {f['mal_id']}): {f['reason']}")
    print("=" * 60)

if __name__ == "__main__":
    main()
