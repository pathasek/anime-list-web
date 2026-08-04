# -*- coding: utf-8 -*-
"""Zmenšeniny obalů OST pro karty „OST Only (As a Whole)".

Karta kreslí obal do čtverce 104 px, ale ve složce leží originály od 300 px až
po 2160 px. Prohlížeč je zmenšuje rychlou metodou, která rozbíjí tenkou linku
anime kresby: obrysy se trhají a obrázek působí rozmazaně. Nejvíc je to vidět
u členitých kompozic (Attack on Titan, Shield Hero), zatímco malovaný detail
obličeje (Berserk) to přežije.

Skript proto obaly předgeneruje na 208 px (dvojnásobek boxu kvůli retina
displejům) filtrem LANCZOS a s jemným doostřením. Prohlížeč pak nezmenšuje nic.

Vedlejší efekt: web dnes kvůli 104px náhledům stahuje přes 12 MB obalů
(Cyberpunk sám 3,6 MB). Po předgenerování jsou to jednotky set kB.

ORIGINÁLY SE NEPŘEPISUJÍ. Výstup jde do podsložky thumbs/.

Výstup: anime-list-web/public/images/spotify/thumbs/<stejný název>.jpg

Použití:
    python tools/build_cover_thumbs.py
    python tools/build_cover_thumbs.py --force    # přegenerovat i existující

Závislost: Pillow (pip install Pillow).
"""
import argparse
import io
import os
import sys

from PIL import Image, ImageFilter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_ROOT = os.path.dirname(BASE_DIR)
SRC_DIR = os.path.join(APP_ROOT, "public", "images", "spotify")
OUT_DIR = os.path.join(SRC_DIR, "thumbs")

# 104 px je velikost boxu na kartě, 2x kvůli displejům s vyšší hustotou
TARGET = 208
JPEG_QUALITY = 88
EXTS = (".jpg", ".jpeg", ".png", ".webp")


def _force_utf8_stdio():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


def build_thumb(src_path, out_path):
    with Image.open(src_path) as im:
        im = im.convert("RGB")
        w, h = im.size

        # Čtvercový ořez ze středu, ať to sedí s object-fit: cover na kartě
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        im = im.crop((left, top, left + side, top + side))

        # LANCZOS si s tenkou linkou poradí nesrovnatelně líp než prohlížeč
        im = im.resize((TARGET, TARGET), Image.LANCZOS)

        # Jemné doostření vrátí kontrast hranám, které zmenšení změkčilo.
        # Radius i práh jsou schválně nízké, ať to nevypadá „přeostřeně".
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=70, threshold=3))

        im.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    return os.path.getsize(out_path)


def main():
    _force_utf8_stdio()
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="přegenerovat i existující zmenšeniny")
    args = ap.parse_args()

    if not os.path.isdir(SRC_DIR):
        print("Složka s obaly neexistuje: %s" % SRC_DIR)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)

    made = skipped = failed = 0
    src_total = out_total = 0

    for name in sorted(os.listdir(SRC_DIR)):
        if not name.lower().endswith(EXTS):
            continue
        src_path = os.path.join(SRC_DIR, name)
        if not os.path.isfile(src_path):
            continue

        # Výstup je vždycky .jpg, i když originál byl PNG
        out_name = os.path.splitext(name)[0] + ".jpg"
        out_path = os.path.join(OUT_DIR, out_name)

        src_size = os.path.getsize(src_path)
        src_total += src_size

        # Přeskočit jen tehdy, když je zmenšenina novější než originál. Dřív
        # stačilo, že vůbec existuje, takže vyměněný obal si nechal starou
        # zmenšeninu a na webu se změna neprojevila.
        if (os.path.exists(out_path) and not args.force
                and os.path.getmtime(out_path) >= os.path.getmtime(src_path)):
            out_total += os.path.getsize(out_path)
            skipped += 1
            continue

        try:
            out_size = build_thumb(src_path, out_path)
        except Exception as exc:
            failed += 1
            print("  [!!] %-46s chyba: %s" % (name[:46], exc))
            continue

        out_total += out_size
        made += 1
        print("  [->] %-46s %6d kB -> %4d kB" % (name[:46], src_size // 1024, out_size // 1024))

    print("")
    print("Hotovo: %d vytvořeno, %d přeskočeno, %d selhalo." % (made, skipped, failed))
    print("Originály: %d kB, zmenšeniny: %d kB" % (src_total // 1024, out_total // 1024))
    print("Zapsáno do %s" % OUT_DIR)
    return 0


if __name__ == "__main__":
    sys.exit(main())
