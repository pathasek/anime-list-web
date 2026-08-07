# -*- coding: utf-8 -*-
"""Odvození hudebních typů OST z mých rozborů (pole "OST" v category_texts.json).

Karta Whole OST na webu ukazovala žánry ANIME (Fantasy, Action...), ne hudbu.
Tenhle skript čte text OST kapitoly rozboru a klíčovými slovy z něj odvodí
1 až 3 hudební štítky (Orchestral, Electronic, ...). Ruční výjimky mají
přednost a žijí v tools/ost_types_overrides.json ({ "Anime": ["Tag", ...] }).

Vstup:  public/data/category_texts.json  (píše export_docx_categories.py,
        proto tenhle skript běží ve stejné lajně exportu až po něm)
Výstup: public/data/ost_types.json       { "Anime jméno": ["Tag", ...] }

Párování klíčových slov je bez diakritiky a lowercase, řadí se podle počtu
zásahů v textu, bere se nejvýš TOP_N štítků s aspoň jedním zásahem.
"""
import json
import os
import sys
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.abspath(os.path.join(BASE, ".."))
SRC = os.path.join(WEB, "public", "data", "category_texts.json")
OUT = os.path.join(WEB, "public", "data", "ost_types.json")
OVERRIDES = os.path.join(BASE, "ost_types_overrides.json")

TOP_N = 3

# Pořadí pravidel = pořadí štítků při shodě počtu zásahů.
# Klíčová slova jsou podřetězce v textu bez diakritiky (lowercase).
# Pozor na inflaci: obecná slova („zpěv", „píseň", „balada", „operní",
# „chorál") zasahují skoro každý text přes zmínky OP/ED a přeskládala by
# stovky titulů (ověřeno 6. 8. 2026: +112 Vocal). Přidávej jen vzácné,
# jednoznačně stylové termíny a vždy porovnej rozložení před/po.
PRAVIDLA = [
    ("Orchestral", ["orchestr", "symfon", "smycc", "filharmon", "valcik"]),
    ("Piano", ["klavir", "piano", "cembalo"]),
    ("Electronic", ["syntez", "elektron", "industrial", "techno", "dubstep"]),
    ("Ambient", ["ambient"]),
    ("Rock", ["rock", "metalov", "punk", "elektricka kytara", "elektrickych kytar"]),
    ("Jazz", ["jazz", "swing", "saxofon", "big band"]),
    ("Vocal", ["vokal", "sbor", "a cappella", "acapella"]),
    ("Folk/Celtic", ["keltsk", "folk", "irsk", "dudy", "lidov"]),
    ("Chiptune", ["chiptune", "8-bit", "8bit"]),
]


def bez_diakritiky(text):
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii").lower()


def odvod_tagy(ost_text):
    """Vrátí až TOP_N štítků seřazených podle počtu zásahů klíčových slov."""
    plochy = bez_diakritiky(ost_text)
    zasahy = []
    for tag, klice in PRAVIDLA:
        n = sum(plochy.count(k) for k in klice)
        if n > 0:
            zasahy.append((tag, n))
    zasahy.sort(key=lambda t: -t[1])
    return [tag for tag, _ in zasahy[:TOP_N]]


def main():
    if not os.path.exists(SRC):
        print(f"CHYBA: chybí {SRC} (musí běžet po export_docx_categories.py)")
        return 1

    with open(SRC, encoding="utf-8") as f:
        texty = json.load(f)

    overrides = {}
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding="utf-8") as f:
            overrides = json.load(f)

    vysledek = {}
    bez_ost = 0
    bez_tagu = []
    for jmeno in sorted(texty.keys()):
        ost_text = (texty[jmeno] or {}).get("OST") or ""
        if jmeno in overrides:
            vysledek[jmeno] = list(overrides[jmeno])
            continue
        if not ost_text.strip():
            bez_ost += 1
            continue
        tagy = odvod_tagy(ost_text)
        if tagy:
            vysledek[jmeno] = tagy
        else:
            bez_tagu.append(jmeno)

    # Override i pro anime, která v rozborech vůbec nejsou
    for jmeno, tagy in overrides.items():
        vysledek.setdefault(jmeno, list(tagy))

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(vysledek, f, ensure_ascii=False, indent=1)

    pocty = {}
    for tagy in vysledek.values():
        for t in tagy:
            pocty[t] = pocty.get(t, 0) + 1
    print(f"OST typy: {len(vysledek)} anime se štítky -> {OUT}")
    print("  Rozložení: " + ", ".join(f"{t}: {n}" for t, n in sorted(pocty.items(), key=lambda x: -x[1])))
    if bez_ost:
        print(f"  Bez OST textu v rozboru: {bez_ost}")
    if bez_tagu:
        print(f"  OST text bez zásahu klíčových slov ({len(bez_tagu)}): " + ", ".join(bez_tagu[:8]) + ("..." if len(bez_tagu) > 8 else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
