# -*- coding: utf-8 -*-
"""Zmenšeniny obálek pro minimalizovaný pás „Cesta Anime".

Stejný problém a stejné řešení jako u Top Favorites (`build_top_favorites_thumbs.py`)
a obalů OST (`build_cover_thumbs.py`): dlaždice pásu kreslí obálku do pole ~80 x 44 px
(viz `.aj-tile-media` v `animeJourney.css`), ale soubory v `public/images/anime/`
mají ~1000 px šířky. Prohlížeč je zmenšuje >10x rychlou metodou, která rozbíjí
tenkou linku anime kresby, takže dlaždice působí měkce/kostičkovaně.

Skript proto obálky předgeneruje na 176 px šířky (~2x pole kvůli displejům
s vyšší hustotou) filtrem LANCZOS a s jemným doostřením. Prohlížeč pak
nezmenšuje skoro nic a pás je ostrý. Menší soubory navíc zrychlují warm-up
dekódování při prvním tahu.

ORIGINÁLY SE NEPŘEPISUJÍ. Výstup jde do podsložky journey_thumbs/.

Obálka, která je menší než cílová šířka, se jen zkopíruje, aby měl každý soubor
svou zmenšeninu a web (s fallbackem přes onError) nenarážel zbytečně na 404.

Výstup: anime-list-web/public/images/anime/journey_thumbs/<stejný název>.jpg

Použití:
    python tools/build_journey_thumbs.py
    python tools/build_journey_thumbs.py --force   # přegenerovat vše

Závislost: Pillow (pip install Pillow).
"""
import argparse
import os
import shutil
import sys

from PIL import Image, ImageFilter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
SRC_DIR = os.path.join(APP_ROOT, "public", "images", "anime")
OUT_DIR = os.path.join(SRC_DIR, "journey_thumbs")

# ~80 px je šířka dlaždice v pásu, 2x kvůli displejům s vyšší hustotou
TARGET_WIDTH = 176
JPEG_QUALITY = 86


def _force_utf8_stdio():
    for proud in (sys.stdout, sys.stderr):
        try:
            proud.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def build_thumb(src_path, out_path):
    with Image.open(src_path) as im:
        im = im.convert("RGB")
        w, h = im.size

        # Bez ořezu: poměr stran se zachová, o vykreslení do pole se stará
        # object-fit: cover v CSS, stejně jako u originálu.
        nova_vyska = max(1, round(h * TARGET_WIDTH / w))
        im = im.resize((TARGET_WIDTH, nova_vyska), Image.LANCZOS)

        # Jemné doostření vrátí kontrast hranám, které zmenšení změkčilo.
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=70, threshold=3))

        im.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return os.path.getsize(out_path)


def main():
    _force_utf8_stdio()
    ap = argparse.ArgumentParser(description="Zmenšeniny obálek pro pás Cesta Anime")
    ap.add_argument("--force", action="store_true",
                    help="přegenerovat i existující zmenšeniny")
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print(f"Složka s obálkami neexistuje: {SRC_DIR}")
        return 1

    os.makedirs(OUT_DIR, exist_ok=True)

    vyrobeno = preskoceno = male = chyby = 0
    zdroj_celkem = vystup_celkem = 0

    for name in sorted(os.listdir(SRC_DIR)):
        if not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        src_path = os.path.join(SRC_DIR, name)
        if not os.path.isfile(src_path):
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

        # Přegenerovat, když je originál novější nebo když zmenšenina chybí
        if (os.path.exists(out_path) and not args.force
                and os.path.getmtime(out_path) >= os.path.getmtime(src_path)):
            zdroj_celkem += os.path.getsize(src_path)
            vystup_celkem += os.path.getsize(out_path)
            preskoceno += 1
            continue

        try:
            if sirka <= TARGET_WIDTH:
                # Obálka, která už je dost malá, se jen zkopíruje.
                shutil.copyfile(src_path, out_path)
                velikost = os.path.getsize(out_path)
                male += 1
            else:
                velikost = build_thumb(src_path, out_path)
                vyrobeno += 1
            zdroj_celkem += os.path.getsize(src_path)
            vystup_celkem += velikost
        except Exception as exc:
            chyby += 1
            print(f"  [chyba] {name}: {exc}")

    print(f"Hotovo: {vyrobeno} vyrobeno, {preskoceno} beze změny, "
          f"{male} necháno v originále, {chyby} chyb.")
    if zdroj_celkem:
        print(f"Velikost zmenšovaných obálek: {zdroj_celkem / 1024:.0f} kB "
              f"→ {vystup_celkem / 1024:.0f} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
