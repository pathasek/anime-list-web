# -*- coding: utf-8 -*-
"""Počet skladeb a celková délka mých YouTube playlistů „OST As a Whole".

Proč to existuje: karty v sekci „OST Only (As a Whole)" braly počet skladeb
z přehrávače (živý údaj z mého playlistu), ale délku z YT Music alba. Když
playlist není totožný s jedním albem (a u sérií nikdy není, Attack on Titan
jich má napříč sezónami 129), byla ta dvojice nesmyslná: „129 skladeb · 1:17:00",
kde ta délka patřila k šestnáctiskladbovému albu.

Tenhle skript sáhne rovnou do playlistu a spočítá obojí ze STEJNÉHO zdroje.
Stahuje jen metadata (extract_flat), žádné video.

Výstup: anime-list-web/public/data/ost_playlist_durations.json
    { "generated": ms,
      "playlists": { "<playlistId>": { "count": 11, "seconds": 1934,
                                       "anime_name": "Berserk", "at": ms } } }

Cache: ost_durations_cache.json (vedle skriptu). Playlisty, které už znám,
se přeskakují, takže opakovaný běh řeší jen nové. Vynutit kompletní nové
načtení jde přepínačem --force nebo smazáním cache.

Použití:
    python tools/build_ytmusic_durations.py
    python tools/build_ytmusic_durations.py --force
    python tools/build_ytmusic_durations.py --only "Berserk"

Závislost: yt-dlp (pip install yt-dlp). Žádný API klíč, nic tajného.
"""
import argparse
import io
import json
import os
import re
import sys
import time

import yt_dlp


def _force_utf8_stdio():
    # Windows konzole bývá cp1250 — japonské názvy by shodily print.
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
OST_FILE = os.path.join(APP_ROOT, "public", "data", "favorites_ost.json")
OUT_FILE = os.path.join(APP_ROOT, "public", "data", "ost_playlist_durations.json")
CACHE_FILE = os.path.join(BASE_DIR, "ost_durations_cache.json")

SLEEP_BETWEEN = 1.0  # slušnost k YouTube

PLAYLIST_RE = re.compile(r"[?&]list=([A-Za-z0-9_-]+)")


def playlist_id(url):
    m = PLAYLIST_RE.search(url or "")
    return m.group(1) if m else None


def load_json(path, default):
    try:
        with io.open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def fetch_playlist(pid):
    """Vrátí (count, available, seconds) nebo None, když se playlist nenačetl.

    `tracks`  = kolik skladeb se opravdu dá přehrát (a k nim patří `seconds`).
    `listed`  = číslo z hlavičky playlistu na YouTube (`playlist_count`).
    `seconds` = součet délek hratelných skladeb.

    Ta dvě čísla se u starších playlistů rozcházejí: hlavička počítá i videa,
    která mezitím zmizela (smazaná, privátní, zablokovaná), ale ve výpisu je
    YouTube vůbec nevrátí. Demon Slayer hlásí 322 položek, přehrát jde 211.

    Karta ukazuje `tracks`, protože jen k němu sedí `seconds` a jen to se
    doopravdy přehraje. `listed` se veze s sebou pro kontrolu.
    """
    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "skip_download": True,
        "ignoreerrors": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info("https://www.youtube.com/playlist?list=" + pid, download=False)
    if not info:
        return None
    entries = [e for e in (info.get("entries") or []) if e]
    if not entries:
        return None
    with_duration = [e for e in entries if e.get("duration")]
    seconds = sum(int(e["duration"]) for e in with_duration)
    listed = info.get("playlist_count") or len(entries)
    return len(with_duration), listed, seconds


def hms(sec):
    return "%d:%02d:%02d" % (sec // 3600, sec % 3600 // 60, sec % 60)


def main():
    _force_utf8_stdio()
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="ignorovat cache a načíst vše znovu")
    ap.add_argument("--only", default=None, help="jen playlisty, jejichž anime obsahuje tenhle text")
    args = ap.parse_args()

    ost = load_json(OST_FILE, {})
    whole = ost.get("whole") or []
    if not whole:
        print("V %s není sekce 'whole'. Končím." % OST_FILE)
        return 1

    cache = {} if args.force else load_json(CACHE_FILE, {})
    playlists = {}
    fetched = skipped = failed = 0

    for w in whole:
        name = w.get("anime_name") or "?"
        if args.only and args.only.lower() not in name.lower():
            continue
        pid = playlist_id(w.get("yt_url"))
        if not pid:
            print("  [--] %-45s bez playlist id" % name[:45])
            continue

        if pid in cache and not args.force:
            rec = dict(cache[pid])
            rec["anime_name"] = name
            playlists[pid] = rec
            skipped += 1
            print("  [ok] %-45s z cache: %d skladeb, %s"
                  % (name[:45], rec.get("tracks", 0), hms(rec.get("seconds", 0))))
            continue

        try:
            res = fetch_playlist(pid)
        except Exception as exc:  # síť, rate limit, změna YouTube
            res = None
            print("  [!!] %-45s chyba: %s" % (name[:45], exc))

        if not res:
            failed += 1
            print("  [!!] %-45s nenačteno" % name[:45])
            time.sleep(SLEEP_BETWEEN)
            continue

        tracks, listed, seconds = res
        rec = {"tracks": tracks, "listed": listed, "seconds": seconds,
               "anime_name": name, "at": int(time.time() * 1000)}
        playlists[pid] = rec
        cache[pid] = rec
        fetched += 1
        note = "  (hlavička hlásí %d, %d nedostupných)" % (listed, listed - tracks) if listed != tracks else ""
        print("  [->] %-45s %d skladeb, %s%s" % (name[:45], tracks, hms(seconds), note))
        time.sleep(SLEEP_BETWEEN)

    with io.open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)

    out = {"generated": int(time.time() * 1000), "playlists": playlists}
    with io.open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print("")
    print("Hotovo: %d nově načteno, %d z cache, %d selhalo." % (fetched, skipped, failed))
    print("Zapsáno do %s" % OUT_FILE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
