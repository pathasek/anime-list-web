# -*- coding: utf-8 -*-
"""
Stáhne katalog OP/ED znělek z AnimeThemes.moe pro všechna anime v listu
(Plán 9, Ú1) → public/data/animethemes_op_ed.json.

Proti GDrive knihovně (op_ed_videos.json, ~210 mých vybraných verzí) jde o
KOMPLETNÍ katalog všech znělek všech anime v listu. Pro kvíz se preferuje
audio-only .ogg stopa (a.animethemes.moe) — menší přenos a nulové riziko
vizuálního spoileru.

Výběr nejlepší verze i dedup TV vs. BD kopíruje logiku
src/utils/animeThemesService.js, aby se web i data chovaly stejně.

Spuštění:  python download_animethemes_cache.py [--limit N] [--force]
Skript je resumovatelný: mezivýsledky drží v .animethemes_cache_partial.json,
takže po přerušení naváže tam, kde skončil.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = 'https://api.animethemes.moe/anime'
HERE = os.path.dirname(os.path.abspath(__file__))
ANIME_LIST = os.path.join(HERE, 'public', 'data', 'anime_list.json')
OUT_PATH = os.path.join(HERE, 'public', 'data', 'animethemes_op_ed.json')
PARTIAL_PATH = os.path.join(HERE, '.animethemes_cache_partial.json')

BATCH_SIZE = 10          # kolik MAL id v jednom dotazu
SLEEP_BETWEEN = 0.8      # s — limit API je ~90 req/min
INCLUDE = ('animethemes.animethemeentries.videos.audio,'
           'animethemes.song.artists,resources')


def mal_id_of(anime):
    m = re.search(r'/anime/(\d+)', anime.get('mal_url') or '')
    return int(m.group(1)) if m else None


def video_score(v):
    """Shodné s videoScore() v animeThemesService.js."""
    score = v.get('resolution') or 0
    if v.get('nc'):
        score += 4000                       # creditless
    if v.get('overlap') == 'None':
        score += 2000                       # bez překryvu epizody
    if v.get('source') == 'BD':
        score += 500
    if v.get('lyrics'):
        score -= 300                        # verze s titulky textu až jako záloha
    return score


def fetch(url, attempts=4):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'anime-list-web/1.0'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            wait = 2 ** i
            print(f'    ! {type(e).__name__}: {e} — zkouším znovu za {wait}s')
            time.sleep(wait)
    return None


def themes_of(anime_obj):
    """Vrátí seznam znělek jednoho anime: nejlepší video + audio na znělku."""
    out = []
    for theme in anime_obj.get('animethemes') or []:
        ttype = (theme.get('type') or '').upper()
        if ttype not in ('OP', 'ED'):
            continue

        best, best_version = None, None
        for entry in theme.get('animethemeentries') or []:
            for v in entry.get('videos') or []:
                if not v.get('link'):
                    continue
                if best is None or video_score(v) > video_score(best):
                    best, best_version = v, entry.get('version') or 1
        if best is None:
            continue

        song = theme.get('song') or {}
        artists = [a.get('name') for a in (song.get('artists') or []) if a.get('name')]
        audio = best.get('audio') or {}
        out.append({
            'type': ttype,
            'label': theme.get('slug') or f"{ttype}{theme.get('sequence') or ''}",
            'song': (song.get('title') or '').strip() or None,
            'artist': ', '.join(artists) if artists else None,
            'video_url': best.get('link'),
            'audio_url': audio.get('link'),
            'version': best_version,
            '_score': video_score(best),
        })

    # Dedup TV vs. BD: stejná znělka může být v katalogu 2× (OP1 a OP1-BD).
    # Necháme lepší video, ale s čitelnějším labelem bez "-BD".
    by_song = {}
    for t in out:
        key = (t['type'], re.sub(r'[^a-z0-9]+', ' ', (t['song'] or t['label']).lower()).strip())
        prev = by_song.get(key)
        if prev is None:
            by_song[key] = t
        elif t['_score'] > prev['_score']:
            if re.search(r'-bd\b', t['label'], re.I) and not re.search(r'-bd\b', prev['label'], re.I):
                t['label'] = prev['label']
            by_song[key] = t
    return list(by_song.values())


def main():
    force = '--force' in sys.argv
    limit = None
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    with open(ANIME_LIST, encoding='utf-8') as f:
        anime_list = json.load(f)

    # MAL id → název z mého listu (preferovaný, přesný název)
    wanted = {}
    for a in anime_list:
        mid = mal_id_of(a)
        if mid and mid not in wanted:
            wanted[mid] = {'name': a.get('name'), 'series': a.get('series')}
    ids = list(wanted.keys())
    if limit:
        ids = ids[:limit]
    print(f'Anime v listu s MAL id: {len(ids)}')

    done = {}
    if os.path.exists(PARTIAL_PATH) and not force:
        with open(PARTIAL_PATH, encoding='utf-8') as f:
            done = {int(k): v for k, v in json.load(f).items()}
        print(f'Načteno z rozdělané cache: {len(done)} anime')

    todo = [i for i in ids if i not in done]
    print(f'Zbývá stáhnout: {len(todo)} (dávky po {BATCH_SIZE})')

    for start in range(0, len(todo), BATCH_SIZE):
        batch = todo[start:start + BATCH_SIZE]
        params = {
            'filter[has]': 'resources',
            'filter[site]': 'MyAnimeList',
            'filter[external_id]': ','.join(str(i) for i in batch),
            'include': INCLUDE,
            'page[size]': str(BATCH_SIZE * 2),
        }
        url = API + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        data = fetch(url)
        if data is None:
            print(f'  ⨯ dávka {batch} selhala, přeskakuji')
            for i in batch:
                done[i] = []
            continue

        got = {}
        for obj in data.get('anime') or []:
            mal = None
            for r in obj.get('resources') or []:
                if r.get('site') == 'MyAnimeList' and r.get('external_id'):
                    mal = int(r['external_id'])
                    break
            if mal is None:
                continue
            got[mal] = themes_of(obj)

        for i in batch:
            done[i] = got.get(i, [])

        n = start + len(batch)
        found = sum(1 for i in batch if done.get(i))
        print(f'  [{n}/{len(todo)}] dávka OK — znělky nalezeny u {found}/{len(batch)} anime')

        with open(PARTIAL_PATH, 'w', encoding='utf-8') as f:
            json.dump({str(k): v for k, v in done.items()}, f)
        time.sleep(SLEEP_BETWEEN)

    # Sestavení plochého výstupu
    themes = []
    no_audio = 0
    for mid, items in done.items():
        meta = wanted.get(mid)
        if not meta:
            continue
        for t in items:
            if not t.get('audio_url'):
                no_audio += 1
            themes.append({
                'mal_id': mid,
                'anime_name': meta['name'],
                'series': meta['series'],
                'type': t['type'],
                'label': t['label'],
                'song': t['song'],
                'artist': t['artist'],
                'audio_url': t.get('audio_url'),
                'video_url': t.get('video_url'),
            })

    out = {
        'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'source': 'AnimeThemes.moe API',
        'anime_count': sum(1 for v in done.values() if v),
        'count': len(themes),
        'themes': themes,
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f'\nHotovo: {len(themes)} znelek z {out["anime_count"]} anime -> {OUT_PATH}')
    if no_audio:
        print(f'Pozor: {no_audio} znělek nemá audio stopu (použije se video URL)')


if __name__ == '__main__':
    main()
