# -*- coding: utf-8 -*-
"""Dohledání celých OST albumů na YouTube Music (ytmusicapi, bez API klíče).

Pro každé anime z anime_list.json zkusí najít oficiální soundtrackové album
a jeho auto-generovaný playlist (OLAK5uy_...), který jde přehrát v běžném
YouTube embedu. Výstup čte web v detailu anime — API album se zobrazuje jako
"extra" vedle mých fav playlistů (stejný vzor jako OP/ED z AnimeThemes.moe).

Výstup: anime-list-web/public/data/ytmusic_ost.json
    { "generated": ms, "albums": [ { match_key, anime_name, album_title,
      artists, year, track_count, duration, playlist_id, thumbnail, confidence } ] }

Cache:  ytmusic_ost_cache.json (vedle skriptu) — výsledky i neúspěchy per
        match_key, aby opakované běhy hledaly jen nová anime.
        Smazáním cache se vynutí kompletní nové hledání.

Ruční kurátorství: ytmusic_ost_overrides.json (vedle skriptu):
    { "<match_key>": { "block": true } }            -> anime nikdy nedostane API album
    { "<match_key>": { "playlist_id": "OLAK..." } } -> ručně určené album (přebíjí hledání
                                                       jen id; ostatní metadata z hledání)
Automatika je fuzzy — stejnojmenné filmy/hry a fan covery projdou přes název,
blokace je jediná spolehlivá obrana. Overrides přežívají i rebuild cache.
"""
import argparse
import io
import json
import os
import re
import sys
import time
import unicodedata

import requests
from ytmusicapi import YTMusic


def _force_utf8_stdio():
    # Windows konzole bývá cp1250 — japonské názvy alb by shodily print.
    # Jen při spuštění jako skript (import nesmí sahat na stdout volajícího).
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Skript žije v anime-list-web/tools/ → data jsou o úroveň výš (anime-list-web/public/data)
APP_ROOT = os.path.dirname(BASE_DIR)
LIST_FILE = os.path.join(APP_ROOT, "public", "data", "anime_list.json")
OUT_FILE = os.path.join(APP_ROOT, "public", "data", "ytmusic_ost.json")
CACHE_FILE = os.path.join(BASE_DIR, "ytmusic_ost_cache.json")
OVERRIDES_FILE = os.path.join(BASE_DIR, "ytmusic_ost_overrides.json")
# Japonské/romaji/alternativní názvy z AniList (idMal -> tituly) — Jikan bývá 504
ANILIST_CACHE_FILE = os.path.join(BASE_DIR, "anilist_titles_cache.json")

SLEEP_BETWEEN = 0.35  # slušnost k neoficiálnímu API
ANILIST_SLEEP = 2.0   # AniList: degradovaný limit ~30 req/min

# Alba s těmito slovy v názvu nejsou OST (character songs, openingové/theme
# singly, "inspired by" kompilace...)
BAD_TITLE_RE = re.compile(
    r"character\s+song|drama\s+cd|radio\s+cd|best\s+of\b|cover|remix|tribute"
    r"|inspired|music\s+for\s+reading|theme\s+song|insert\s+song|\bopening\b|\bending\b",
    re.IGNORECASE,
)

# Album s ≤ tolika skladbami je nejspíš singl/EP, ne celé OST
MIN_TRACKS = 6
OST_TITLE_RE = re.compile(
    r"soundtrack|\bost\b|music\s+collection|complete\s+music|サウンドトラック|音楽集|劇伴",
    re.IGNORECASE,
)


def normalize_key(s: str) -> str:
    """Sjednocený klíč pro párování názvů — musí odpovídat normalizeAnimeKey v JS."""
    s = (s or "").lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


_SEASON_PART_RE = re.compile(r"\s+(?:s(?:eason)?\s*\d+(?:\s+part\s*\d+)?|part\s*\d+)$", re.IGNORECASE)


def strip_season_part(key: str) -> str:
    return _SEASON_PART_RE.sub("", key or "").strip()


# Tokeny bez rozlišovací hodnoty — nesmí stačit ke shodě názvů
STOPWORDS = {"the", "a", "an", "of", "in", "on", "to", "no", "ni", "wa", "wo", "ga", "and", "s", "x", "de"}

# Odvozená alba — správná série, ale ne hlavní OST (mírná penalizace)
DERIVED_TITLE_RE = re.compile(r"piano|arrange|acoustic|orchestr|jazz|collections", re.IGNORECASE)
MOVIE_TITLE_RE = re.compile(r"motion\s+picture|movie|film", re.IGNORECASE)


def significant_tokens(key: str):
    # Roky (1997, 2011...) vynechat — v názvech alb obvykle nejsou
    return [
        t for t in (key or "").split(" ")
        if len(t) > 1 and t not in STOPWORDS and not re.fullmatch(r"(19|20)\d{2}", t)
    ]


def title_coverage(anime_key: str, album_title: str) -> float:
    """Podíl VÝZNAMOVÝCH tokenů názvu anime přítomných v názvu alba (0..1).
    Stopwords ('the', 'in'...) nestačí — jinak Eminence in Shadow chytal
    'Solo Leveling ... from the Shadow'."""
    a_tokens = significant_tokens(strip_season_part(anime_key))
    if not a_tokens:
        return 0.0
    b_set = set(normalize_key(album_title).split(" "))
    return sum(1 for t in a_tokens if t in b_set) / len(a_tokens)


def coverage_ok(anime_key: str, album_title: str) -> bool:
    """Práh pokrytí podle délky názvu: krátké názvy (≤2 slova) musí sedět celé —
    jinak 'Log Horizon' chytal 'Horizon Zero Dawn' a 'Elfen Lied' 'Das Lied in Mir'."""
    n = len(significant_tokens(strip_season_part(anime_key)))
    cov = title_coverage(anime_key, album_title)
    if n <= 2:
        return cov >= 0.99
    if n <= 4:
        return cov >= 0.65
    return cov >= 0.5


# CJK shoda: ponechat jen alfanumerické + kana/kanji, porovnat jako substring.
# Japonský název alba typicky obsahuje přesný nativní název anime.
_CJK_CLEAN_RE = re.compile(r"[^0-9a-zA-Z぀-ヿ㐀-鿿ｦ-ﾝ]+")


def clean_cjk(s: str) -> str:
    return _CJK_CLEAN_RE.sub("", (s or "")).lower()


def native_title_hit(native_titles, album_title: str) -> bool:
    at = clean_cjk(album_title)
    if not at:
        return False
    for nt in native_titles or []:
        cn = clean_cjk(nt)
        if len(cn) >= 3 and cn in at:
            return True
    return False


_ANIME_SEASON_RE = re.compile(r"\bs(?:eason)?\s*(\d+)\b")
_ALBUM_SEASON_RE = re.compile(r"(?:season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+season|\bseason(\d+))", re.IGNORECASE)


def anime_season(anime_key: str):
    m = _ANIME_SEASON_RE.search(anime_key)
    return int(m.group(1)) if m else None


def album_seasons(album_title: str):
    out = set()
    for m in _ALBUM_SEASON_RE.finditer(album_title or ""):
        for g in m.groups():
            if g:
                out.add(int(g))
    return out


def score_album(anime_key: str, album: dict, accept_keys=None, native_titles=None) -> float:
    """anime_key = primární (anglický) klíč — řídí season logiku.
    accept_keys = další přijatelné klíče (romaji, synonyma) pro pokrytí názvu.
    native_titles = japonské názvy pro CJK substring shodu."""
    title = album.get("title") or ""
    if BAD_TITLE_RE.search(title):
        return -1.0

    best_cov = 0.0
    cov_pass = False
    for k in [anime_key] + list(accept_keys or []):
        if k and coverage_ok(k, title):
            cov_pass = True
            best_cov = max(best_cov, title_coverage(k, title))
    native_hit = native_title_hit(native_titles, title)

    if not cov_pass and not native_hit:
        return 0.0  # název anime v názvu alba dostatečně není -> nevěřit

    # Nativní (kanji/kana) shoda je nejsilnější signál — přesný substring
    score = 3.5 if native_hit else best_cov * 3.0
    if OST_TITLE_RE.search(title):
        score += 2.0
    if DERIVED_TITLE_RE.search(title):
        score -= 0.5  # piano/arrange verze — až když není hlavní OST

    season = anime_season(anime_key)
    alb_seasons = album_seasons(title)
    if season is not None:
        if alb_seasons and season not in alb_seasons:
            score -= 2.5  # album jiné řady (Slime S02 vs "season 3" OST)
        if MOVIE_TITLE_RE.search(title):
            score -= 1.0  # filmové OST k TV řadě (Spy x Family S01 vs CODE: White)
    elif alb_seasons and 1 not in alb_seasons:
        score -= 1.5  # anime bez řady (=S1), album výslovně jiné řady

    return score


def find_ost_album(yt: YTMusic, anime_name: str, alt=None):
    """Vrátí (album_dict, confidence) nebo (None, None).
    alt = {'romaji', 'english', 'native', 'synonyms'} z AniList (může být None)."""
    anime_key = normalize_key(anime_name)
    base_name = strip_season_part(anime_key)

    queries = [f"{anime_name} original soundtrack"]
    if base_name and base_name != anime_key:
        queries.append(f"{base_name} original soundtrack")

    accept_keys = []
    native_titles = []
    if alt:
        for t in [alt.get("english")] + list(alt.get("synonyms") or []):
            k = normalize_key(t)
            if k and k not in (anime_key, base_name) and k not in accept_keys:
                accept_keys.append(k)
        romaji = alt.get("romaji")
        if romaji:
            rk = normalize_key(romaji)
            if rk and rk not in (anime_key, base_name) and rk not in accept_keys:
                accept_keys.append(rk)
                queries.append("%s original soundtrack" % romaji)
        native = alt.get("native")
        if native:
            native_titles.append(native)
            queries.append("%s オリジナルサウンドトラック" % native)

    # Ze všech dotazů se posbírají kandidáti a vybere se nejlépe hodnocený.
    # Skóre řeší score_album (pokrytí názvu, sezóna, „soundtrack" v názvu...).
    seen = set()
    best = None
    best_score = 0.0
    for q in queries:
        try:
            results = yt.search(q, filter="albums", limit=8) or []
        except Exception:
            continue
        for r in results:
            bid = r.get("browseId")
            if not bid or bid in seen:
                continue
            seen.add(bid)
            s = score_album(anime_key, r, accept_keys, native_titles)
            if s > best_score:
                best_score, best = s, r
        time.sleep(SLEEP_BETWEEN)

    if not best or best_score <= 0:
        return None, None

    album = album_details(yt, best.get("browseId"))
    if not album:
        return None, None

    # Krátká alba jsou singly a EP, ne celé OST
    if album.get("track_count") and album["track_count"] < MIN_TRACKS:
        return None, None

    if best_score >= 4.0:
        confidence = "high"
    elif best_score >= 2.5:
        confidence = "medium"
    else:
        confidence = "low"
    return album, confidence


def album_details(yt: YTMusic, browse_id: str):
    """Z browseId udělá záznam alba v podobě, jakou čte web. None při chybě."""
    if not browse_id:
        return None
    try:
        d = yt.get_album(browse_id)
    except Exception:
        return None
    if not d:
        return None

    playlist_id = d.get("audioPlaylistId")
    if not playlist_id:
        return None  # bez playlistu si album stejně nepustím

    artists = ", ".join(a["name"] for a in (d.get("artists") or []) if a.get("name"))
    thumbs = d.get("thumbnails") or []
    return {
        "album_title": d.get("title"),
        "artists": artists or None,
        "year": str(d["year"]) if d.get("year") else None,
        "track_count": d.get("trackCount") or len(d.get("tracks") or []) or None,
        "duration": d.get("duration"),
        "playlist_id": playlist_id,
        "thumbnail": thumbs[-1].get("url") if thumbs else None,
    }


def album_from_playlist(yt: YTMusic, playlist_id: str):
    """Ruční přiřazení z overrides: z playlist_id (OLAK5uy_...) dohledá album."""
    try:
        browse_id = yt.get_album_browse_id(playlist_id)
    except Exception:
        return None
    return album_details(yt, browse_id)


def load_json(path, default):
    try:
        with io.open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def mal_id_of(anime):
    m = re.search(r"myanimelist\.net/anime/(\d+)", anime.get("mal_url") or "")
    return m.group(1) if m else None


def main():
    _force_utf8_stdio()
    ap = argparse.ArgumentParser(description="Dohledání OST alb na YouTube Music")
    ap.add_argument("--force", action="store_true", help="ignorovat cache a hledat znovu")
    ap.add_argument("--only", default=None, help="jen anime, jejichž název obsahuje tenhle text")
    args = ap.parse_args()

    anime_list = load_json(LIST_FILE, [])
    if not anime_list:
        print("Nepodařilo se načíst %s" % LIST_FILE)
        return 1

    cache = load_json(CACHE_FILE, {})
    overrides = load_json(OVERRIDES_FILE, {})
    anilist = load_json(ANILIST_CACHE_FILE, {})

    yt = YTMusic()
    albums = []
    searched = from_cache = blocked = manual = missing = 0

    for anime in anime_list:
        name = anime.get("name")
        if not name:
            continue
        if args.only and args.only.lower() not in name.lower():
            continue
        key = normalize_key(name)
        ov = overrides.get(key) or {}

        if ov.get("block"):
            blocked += 1
            continue

        album = None
        confidence = None

        if ov.get("playlist_id"):
            # Ruční přiřazení přebíjí hledání i cache: je to moje rozhodnutí.
            album = album_from_playlist(yt, ov["playlist_id"])
            confidence = "manual"
            manual += 1
            time.sleep(SLEEP_BETWEEN)
            if not album:
                print("  [!!] %-46s ruční playlist se nepodařilo načíst" % name[:46])
        elif key in cache and not args.force:
            rec = cache[key] or {}
            album = rec.get("album")
            confidence = rec.get("confidence")
            from_cache += 1
        else:
            alt = anilist.get(mal_id_of(anime) or "") or None
            album, confidence = find_ost_album(yt, name, alt)
            cache[key] = {
                "anime_name": name,
                "album": album,
                "confidence": confidence,
                "checked": int(time.time()),
            }
            searched += 1
            if album:
                print("  [->] %-46s %s" % (name[:46], album.get("album_title", "")[:40]))
            else:
                print("  [--] %-46s nenalezeno" % name[:46])

        if not album:
            missing += 1
            continue

        albums.append({
            "match_key": key,
            "anime_name": name,
            "confidence": confidence,
            **album,
        })

    with io.open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)

    # S --only se prošla jen část seznamu, takže se výsledek SLOUČÍ do stávajícího
    # výstupu. Bez téhle pojistky by cílený běh přepsal celý ytmusic_ost.json
    # hrstkou alb a zbytek by zmizel.
    if args.only:
        merged = {a["match_key"]: a for a in (load_json(OUT_FILE, {}).get("albums") or [])}
        touched = {normalize_key(a.get("name") or "") for a in anime_list
                   if a.get("name") and args.only.lower() in a["name"].lower()}
        # Co se v tomhle běhu vyřadilo (blokace, nenalezeno), musí ze slitiny pryč
        for k in touched:
            merged.pop(k, None)
        for a in albums:
            merged[a["match_key"]] = a
        albums = [merged[k] for k in sorted(merged)]
        print("Sloučeno se stávajícím výstupem, alb celkem: %d" % len(albums))

    out = {"generated": int(time.time() * 1000), "albums": albums}
    with io.open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("")
    print("Alb celkem: %d (%d z cache, %d nově hledáno, %d ručně)"
          % (len(albums), from_cache, searched, manual))
    print("Bez alba: %d, blokováno: %d" % (missing, blocked))
    print("Zapsáno do %s" % OUT_FILE)
    return 0


if __name__ == "__main__":
    sys.exit(main())