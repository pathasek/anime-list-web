#!/usr/bin/env python3
# Generuje public/data/op_ed_videos.json ze složky na Google Drive.
#
# OP/ED videa leží ve veřejné složce na Google Drive (folder_id níže). Tento
# skript přes Google Drive API v3 (files.list) vytáhne seznam souborů, z názvů
# souborů naparsuje anime, typ (OP/ED), verzi, píseň a autora a vygeneruje
# přímé download URL ve formátu
#   https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t
#
# API klíč se čte z reference/gdrive_config.json (GDRIVE_API_KEY), který je
# MIMO repozitář, ať se tajemství nedostane na GitHub. Cestu lze přebít
# proměnnou prostředí GDRIVE_CONFIG.
#
# Napojeno na export_data.py jako samostatná lajna: nové názvy nahrané do
# složky se při dalším exportu automaticky dostanou na web.
#
# Parser názvů souborů odpovídá normalizeAnimeKey v src/utils/mediaMatch.js
# (normalize_key: NFKD bez diakritiky, lowercase, nealfanumerické znaky → mezera).
# match_key_base odstraňuje koncovou řadu/část (s01, s01 part 2, part 1),
# stejně jako stripSeasonPart v mediaMatch.js.

import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # anime-list-web
OUT_PATH = os.path.join(APP_ROOT, "public", "data", "op_ed_videos.json")
DEFAULT_FOLDER_ID = "1oqfgfEFbnkjW92t2HUHU6NS-MdGBdOep"

DOWNLOAD_URL = "https://drive.usercontent.google.com/download?id={id}&export=download&confirm=t"


def najit_api_klice():
    """Vrátí GDRIVE_API_KEY z reference/gdrive_config.json (mimo repo)."""
    config_root = os.path.dirname(APP_ROOT)  # „Anime List WEB"
    kandidati = [
        os.environ.get("GDRIVE_CONFIG", ""),
        os.path.join(config_root, "reference", "gdrive_config.json"),
    ]
    for cesta in kandidati:
        if cesta and os.path.exists(cesta):
            try:
                with open(cesta, encoding="utf-8") as f:
                    cfg = json.load(f)
                if cfg.get("GDRIVE_API_KEY"):
                    return cfg["GDRIVE_API_KEY"]
            except Exception:
                continue
    return None


def normalize_key(s):
    """Sjednocený klíč anime, zrcadlí normalizeAnimeKey v mediaMatch.js."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_season(key):
    """Odstraní koncovou řadu/část z normalizovaného klíče (s01, s01 part 2, part 1)."""
    return re.sub(
        r"\s+(?:s(?:eason)?\s*\d+(?:\s+part\s*\d+)?|part\s*\d+)$", "", key
    ).strip()


def parse_filename(filename):
    """Naparsuje název souboru do polí. Vrací dict, nebo None, když se neshoduje.

    Formát: „Anime, OP|ED [ver], _píseň_ by autor.mp4"
    Např.:   „86 Eighty-Six S01 Part 1, ED v2, _Hands Up to the Sky_ by ..."
             „Black Clover, S01, OP 2 v3, _PAiNT it BLACK_ by BiSH.mp4"
    """
    base = filename[:-4] if filename.lower().endswith(".mp4") else filename

    # 1) Anime + typ + zbytek. Typ musí být OP/ED hned za čárkou, aby se
    #    „OP"/„ED" v názvu anime (před čárkou) nepletlo do hry.
    m = re.match(r"^(.*?),\s*(OP|ED)\s*(.*)$", base, re.IGNORECASE)
    if not m:
        return None
    anime_display = m.group(1).strip()
    typ = m.group(2).upper()
    rest = m.group(3).strip()

    # 2) Verze = vše před první „, " ; zbytek je „_píseň_ by autor".
    ver = None
    song_part = ""
    if rest:
        comma = rest.find(", ")
        if comma != -1:
            ver = rest[:comma].strip() or None
            song_part = rest[comma + 2:].strip()
        else:
            ver = rest.strip() or None

    # 3) „_píseň_ by autor" (píseň může obsahovat podtržítko, např. „Re_Re").
    song = None
    artist = None
    if song_part:
        sm = re.match(r"^_(.+)_\s+by\s+(.+)$", song_part)
        if sm:
            song = sm.group(1).strip()
            artist = sm.group(2).strip()
        else:
            song = song_part

    match_key = normalize_key(anime_display)
    return {
        "anime_display": anime_display,
        "type": typ,
        "ver": ver,
        "song": song,
        "artist": artist,
        "match_key": match_key,
        "match_key_base": strip_season(match_key),
    }


def nacti_soubory(api_key, folder_id):
    """Seznam souborů ve složce přes Drive API v3 (bez OAuth, veřejná složka)."""
    q = urllib.parse.quote("'{0}' in parents".format(folder_id))
    url = (
        "https://www.googleapis.com/drive/v3/files?q={0}"
        "&key={1}&fields=files(id,name)&pageSize=1000&orderBy=name".format(q, api_key)
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return data.get("files", [])


def main():
    out_path = OUT_PATH
    if "--out" in sys.argv:
        i = sys.argv.index("--out")
        if i + 1 < len(sys.argv):
            out_path = sys.argv[i + 1]

    api_key = najit_api_klice()
    if not api_key:
        print("CHYBA: GDRIVE_API_KEY se nenašel (reference/gdrive_config.json).")
        return 2

    # folder_id se bere z existujícího souboru, jinak výchozí konstanta.
    folder_id = DEFAULT_FOLDER_ID
    if os.path.exists(OUT_PATH):
        try:
            with open(OUT_PATH, encoding="utf-8") as f:
                stary = json.load(f)
            if stary.get("folder_id"):
                folder_id = stary["folder_id"]
        except Exception:
            pass

    print(f"Čtu složku Google Drive (folder_id={folder_id})...")
    files = nacti_soubory(api_key, folder_id)

    videos = []
    for f in files:
        name = f.get("name", "")
        if not name.lower().endswith(".mp4"):
            continue
        parsed = parse_filename(name)
        if parsed is None:
            print(f"  varování: nepodařilo se naparsovat: {name}")
            continue
        videos.append({
            "match_key": parsed["match_key"],
            "match_key_base": parsed["match_key_base"],
            "anime_display": parsed["anime_display"],
            "type": parsed["type"],
            "ver": parsed["ver"],
            "song": parsed["song"],
            "artist": parsed["artist"],
            "url": DOWNLOAD_URL.format(id=f["id"]),
            "file_id": f["id"],
            "filename": name,
        })

    videos.sort(key=lambda v: v["filename"].lower())

    nova_data = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "folder_id": folder_id,
        "source": "api",
        "count": len(videos),
        "videos": videos,
    }
    nova_json = json.dumps(nova_data, ensure_ascii=False, indent=2)

    # Nezměněné soubory se nepřepisují (konvence repozitáře): timestamp
    # generated se ignoruje, porovnává se jen obsah videí.
    if os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as f:
                stary_json = f.read()
            stary_pars = json.loads(stary_json)
            nova_pars = json.loads(nova_json)
            stary_pars.pop("generated", None)
            nova_pars.pop("generated", None)
            if stary_pars == nova_pars:
                print(f"op_ed_videos.json beze změny ({len(videos)} videí).")
                return 0
        except Exception:
            pass

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(nova_json)
    print(f"op_ed_videos.json zapsán ({len(videos)} videí).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
