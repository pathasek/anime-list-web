# -*- coding: utf-8 -*-
"""Předstažení MAL posterů pro pás anime v „Cestě Anime".

Proč to existuje: pás v maximalizované kartě měsíce si postery tahal za běhu
z Jikan API. Na mém počítači to nebylo vidět, protože jednou získaný poster
zůstal v localStorage prohlížeče. Na cizím počítači ale prohlížeč startuje
s prázdnou pamětí, musí položit stovky dotazů na API s limitem zhruba jeden
dotaz za sekundu, velká část z nich selže (Jikan běžně vrací 504) a místo
posterů se ukážou moje vlastní náhledovky, které jsou ale na šířku.

Skript proto postery stáhne jednou a uloží je do repozitáře, takže se na webu
načtou okamžitě a bez internetu navíc.

Inkrementální: adresa posteru u každého anime se porovná s manifestem a stahuje
se jen to, co je nové nebo se na MAL změnilo. Běžný běh tedy neudělá nic a trvá
sekundy.

Výstup:
    public/images/posters/<malId>.jpg   zmenšené postery
    public/data/posters_index.json      seznam dostupných malId pro web
    tools/journey_posters_cache.json    manifest se zdrojovými adresami

Použití:
    python tools/download_journey_posters.py
    python tools/download_journey_posters.py --force   # stáhnout vše znovu

Závislost: Pillow (pip install Pillow).
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request

from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
DATA_DIR = os.path.join(APP_ROOT, "public", "data")
OUT_DIR = os.path.join(APP_ROOT, "public", "images", "posters")
INDEX_FILE = os.path.join(DATA_DIR, "posters_index.json")
CACHE_FILE = os.path.join(BASE_DIR, "journey_posters_cache.json")

# Pás kreslí obálku do boxu 34 x 48 px. Dvojnásobek kvůli displejům s vyšší
# hustotou bohatě stačí, takže se z originálu (obvykle 225 px a víc) zmenšuje
# na 140 px šířky. Celá sada tak zabere jednotky MB, ne desítky.
TARGET_WIDTH = 140
JPEG_QUALITY = 82

JIKAN_URL = "https://api.jikan.moe/v4/anime/{}"
# Jikan má rate limit, doporučená pauza mezi dotazy je zhruba sekunda
JIKAN_PAUZA = 1.1

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnimeListWeb/1.0"}


def _force_utf8_stdio():
    for proud in (sys.stdout, sys.stderr):
        try:
            proud.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _nacti_json(cesta, vychozi):
    try:
        with open(cesta, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return vychozi


def mal_id_z_url(url):
    m = re.search(r"anime/(\d+)", url or "")
    return m.group(1) if m else None


def zdrojove_adresy():
    """Vrátí {malId: adresa posteru} ze statických cache souborů.

    Chybějící se doplní z Jikan API až v hlavní smyčce, ať se zbytečně
    nechodí na síť pro to, co je dávno stažené.
    """
    anime_list = _nacti_json(os.path.join(DATA_DIR, "anime_list.json"), [])
    metadata = _nacti_json(os.path.join(DATA_DIR, "anime_metadata.json"), {})
    jikan = _nacti_json(os.path.join(DATA_DIR, "jikan_cache.json"), {})

    adresy = {}
    for polozka in anime_list:
        mal_id = mal_id_z_url(polozka.get("mal_url"))
        if not mal_id:
            continue
        zaznam = metadata.get(mal_id) or {}
        url = zaznam.get("imageUrl") or zaznam.get("largeImageUrl")
        if not url:
            zaznam = (jikan.get("anime_info") or {}).get(mal_id) or jikan.get(mal_id) or {}
            if isinstance(zaznam, dict):
                url = zaznam.get("imageUrl") or zaznam.get("largeImageUrl")
        adresy[mal_id] = url
    return adresy


def dotahni_z_jikanu(mal_id):
    try:
        req = urllib.request.Request(JIKAN_URL.format(mal_id), headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        obrazky = (data.get("data") or {}).get("images") or {}
        jpg = obrazky.get("jpg") or {}
        return jpg.get("image_url") or jpg.get("large_image_url")
    except Exception as e:
        print(f"  Jikan pro {mal_id} selhal: {e}")
        return None


def uloz_poster(url, cilova_cesta):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        syrova = resp.read()

    with Image.open(io.BytesIO(syrova)) as im:
        im = im.convert("RGB")
        sirka, vyska = im.size
        if sirka > TARGET_WIDTH:
            nova_vyska = max(1, round(vyska * TARGET_WIDTH / sirka))
            im = im.resize((TARGET_WIDTH, nova_vyska), Image.LANCZOS)
        im.save(cilova_cesta, "JPEG", quality=JPEG_QUALITY, optimize=True)


def main():
    _force_utf8_stdio()
    parser = argparse.ArgumentParser(description="Stáhne MAL postery pro Cestu Anime")
    parser.add_argument("--force", action="store_true",
                        help="stáhnout znovu i postery, které už leží na disku")
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = _nacti_json(CACHE_FILE, {})
    adresy = zdrojove_adresy()
    print(f"Anime s MAL id: {len(adresy)}")

    stazeno = 0
    beze_zmeny = 0
    bez_adresy = []
    chyby = []
    dotazu_na_jikan = 0

    for mal_id, url in sorted(adresy.items(), key=lambda x: int(x[0])):
        soubor = os.path.join(OUT_DIR, f"{mal_id}.jpg")
        zaznam = manifest.get(mal_id) or {}

        # Hrstka titulů nemá adresu v žádné statické cachi a musela se dotáhnout
        # z API. Pro ně platí adresa z manifestu, jinak by se na Jikan chodilo
        # při každém běhu znovu.
        if not url:
            url = zaznam.get("url")

        # Beze změny: adresa sedí a soubor leží na disku
        if (not args.force and url and zaznam.get("url") == url
                and os.path.exists(soubor)):
            beze_zmeny += 1
            continue

        if not url:
            # Adresa není v žádné cachi, zkusíme API (těch případů je pár)
            if dotazu_na_jikan:
                time.sleep(JIKAN_PAUZA)
            dotazu_na_jikan += 1
            url = dotahni_z_jikanu(mal_id)
            if not url:
                bez_adresy.append(mal_id)
                continue

        try:
            uloz_poster(url, soubor)
            manifest[mal_id] = {"url": url}
            stazeno += 1
            if stazeno % 25 == 0:
                print(f"  staženo {stazeno}…")
        except Exception as e:
            chyby.append(f"{mal_id}: {e}")

    # Manifest a index se zapisují až nakonec, ať se při přerušení nerozejdou
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    # Index říká webu, pro která anime smí sáhnout rovnou na lokální soubor.
    # Bez něj by prohlížeč u chybějících posterů střílel 404.
    dostupne = sorted(
        (mid for mid in manifest if os.path.exists(os.path.join(OUT_DIR, f"{mid}.jpg"))),
        key=int)
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(dostupne, f, ensure_ascii=False)

    print()
    print(f"Hotovo: {stazeno} staženo, {beze_zmeny} beze změny, "
          f"celkem k dispozici {len(dostupne)} posterů.")
    if bez_adresy:
        print(f"Bez dohledatelné adresy ({len(bez_adresy)}): {', '.join(bez_adresy[:20])}")
    if chyby:
        print(f"Chyby při stahování ({len(chyby)}):")
        for c in chyby[:20]:
            print(f"   {c}")


if __name__ == "__main__":
    main()
