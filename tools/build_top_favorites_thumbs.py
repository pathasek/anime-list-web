# -*- coding: utf-8 -*-
"""Zmenšeniny posterů pro stránku „Top Favorites".

Stejný problém a stejné řešení jako u obalů OST (`build_cover_thumbs.py`):
karta kreslí poster do pole 222 x 334 px, ale většina souborů `HM_Anime_*.jpg`
má 1000 x 1426 px. Prohlížeč je zmenšuje 4,5x rychlou metodou, která rozbíjí
tenkou linku anime kresby, takže poster působí kostičkovaně. Nejlíp je to vidět
u členitých plakátů (Witch Hat Atelier, Madoka Magica, DanMachi), zatímco
Spice and Wolf vypadá dobře, protože jeho soubor má 425 x 600 px a zmenšuje se
jen nepatrně.

Skript proto postery předgeneruje na 450 px šířky (dvojnásobek pole kvůli
displejům s vyšší hustotou) filtrem LANCZOS a s jemným doostřením. Prohlížeč
pak nezmenšuje nic.

ORIGINÁLY SE NEPŘEPISUJÍ. Výstup jde do podsložky thumbs/.

Zpracovávají se **jen postery anime** (`top10_anime` a `hm_anime`
z `top_favorites.json`). Obrázky postav se schválně nechávají být.

Poster, který je menší než cílová šířka, se jen zkopíruje. Zmenšovat není co
a soubor v thumbs/ musí existovat pro každý poster anime, aby prohlížeč
nenarážel na chybějící zmenšeninu chybou 404.

Výstup: anime-list-web/public/images/top_favorites/thumbs/<stejný název>.jpg

Použití:
    python tools/build_top_favorites_thumbs.py
    python tools/build_top_favorites_thumbs.py --force   # přegenerovat vše

Závislost: Pillow (pip install Pillow).
"""
import argparse
import json
import os
import shutil
import sys

from PIL import Image, ImageFilter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
SRC_DIR = os.path.join(APP_ROOT, "public", "images", "top_favorites")
OUT_DIR = os.path.join(SRC_DIR, "thumbs")
DATA_FILE = os.path.join(APP_ROOT, "public", "data", "top_favorites.json")

# 222 px je šířka pole na kartě, 2x kvůli displejům s vyšší hustotou
TARGET_WIDTH = 450
JPEG_QUALITY = 88


def _force_utf8_stdio():
    for proud in (sys.stdout, sys.stderr):
        try:
            proud.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def postery_anime():
    """Názvy souborů posterů anime z top_favorites.json (bez postav)."""
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    soubory = []
    for sekce in ("top10_anime", "hm_anime"):
        for polozka in data.get(sekce, []):
            cesta = polozka.get("image_file")
            if cesta:
                soubory.append(os.path.basename(cesta))
    return soubory


def build_thumb(src_path, out_path):
    with Image.open(src_path) as im:
        im = im.convert("RGB")
        w, h = im.size

        # Bez ořezu: poměr stran se zachová a o vykreslení do pole se stará
        # object-fit v CSS, stejně jako u originálu.
        nova_vyska = max(1, round(h * TARGET_WIDTH / w))
        im = im.resize((TARGET_WIDTH, nova_vyska), Image.LANCZOS)

        # Jemné doostření vrátí kontrast hranám, které zmenšení změkčilo.
        # Radius i práh jsou schválně nízké, ať to nevypadá „přeostřeně".
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=70, threshold=3))

        im.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return os.path.getsize(out_path)


def main():
    _force_utf8_stdio()
    ap = argparse.ArgumentParser(description="Zmenšeniny posterů pro Top Favorites")
    ap.add_argument("--force", action="store_true",
                    help="přegenerovat i existující zmenšeniny")
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print(f"Složka s postery neexistuje: {SRC_DIR}")
        return 1
    if not os.path.exists(DATA_FILE):
        print(f"Chybí {DATA_FILE}, nevím, které obrázky jsou anime.")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)

    vyrobeno = preskoceno = male = chyby = 0
    zdroj_celkem = vystup_celkem = 0

    for name in postery_anime():
        src_path = os.path.join(SRC_DIR, name)
        if not os.path.isfile(src_path):
            print(f"  [chybí] {name}")
            continue

        out_name = os.path.splitext(name)[0] + ".jpg"
        out_path = os.path.join(OUT_DIR, out_name)

        try:
            with Image.open(src_path) as im:
                sirka = im.size[0]
        except Exception as exc:
            print(f"  [chyba] {name}: {exc}")
            chyby += 1
            continue

        # Přegenerovat, když je originál novější (rebuild_top_favorites.py
        # obrázky občas vymění) nebo když zmenšenina ještě není
        if (os.path.exists(out_path) and not args.force
                and os.path.getmtime(out_path) >= os.path.getmtime(src_path)):
            zdroj_celkem += os.path.getsize(src_path)
            vystup_celkem += os.path.getsize(out_path)
            preskoceno += 1
            continue

        try:
            if sirka <= TARGET_WIDTH:
                # Poster, který už je dost malý (Spice and Wolf má 425 px), se
                # jen zkopíruje. Zmenšovat není co a přeuložení by ho zbytečně
                # protáhlo další ztrátovou kompresí. Kopie tu ale musí být, aby
                # měl každý poster anime svůj soubor v thumbs/ a prohlížeč
                # nemusel na chybějící zmenšeninu narazit chybou 404.
                shutil.copyfile(src_path, out_path)
                velikost = os.path.getsize(out_path)
                male += 1
                print(f"  [kopie] {name[:44]:46s} {sirka} px, zmenšovat netřeba")
            else:
                velikost = build_thumb(src_path, out_path)
                vyrobeno += 1
                print(f"  [nová]  {name[:44]:46s} {sirka} px → {TARGET_WIDTH} px")
            zdroj_celkem += os.path.getsize(src_path)
            vystup_celkem += velikost
        except Exception as exc:
            chyby += 1
            print(f"  [chyba] {name}: {exc}")

    print()
    print(f"Hotovo: {vyrobeno} vyrobeno, {preskoceno} beze změny, "
          f"{male} necháno v originále, {chyby} chyb.")
    if zdroj_celkem:
        print(f"Velikost zmenšovaných posterů: {zdroj_celkem / 1024:.0f} kB "
              f"→ {vystup_celkem / 1024:.0f} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
