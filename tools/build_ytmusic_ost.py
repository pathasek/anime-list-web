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