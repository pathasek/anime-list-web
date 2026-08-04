# -*- coding: utf-8 -*-
"""Sdílený semafor výpadku Jikan API pro exportní skripty.

Proč existuje: při výpadku Jikanu si dřív každý skript v řetězu
(export_data.py – jména postav, download_jikan_cache.py, download_journey_posters.py)
zjišťoval výpadek sám, každý s plnými retry a backoffy, dohromady 90 až 120 s
čekání na jeden a týž ležící server.

Princip: kdo výpadek vyhodnotí (série totálních selhání), zapíše časovou
značku „do kdy to nezkoušet" do souboru v temp složce. Ostatní skripty
(i další běhy exportu) po dobu platnosti Jikan větev rovnou přeskočí.

Falešně pozitivní záznam nic nerozbije: dotčené položky se prostě stáhnou
při příštím běhu po vypršení, úplně stejně, jako když dnes selže stažení.
"""
import os
import tempfile
import time

SOUBOR = os.path.join(tempfile.gettempdir(), "jikan_down_until.txt")
VYCHOZI_MINUT = 30


def je_vypadek():
    """True, dokud platí nahlášený výpadek Jikanu."""
    try:
        with open(SOUBOR, "r", encoding="ascii") as f:
            do_kdy = float(f.read().strip())
        return time.time() < do_kdy
    except Exception:
        return False


def nahlas_vypadek(minut=VYCHOZI_MINUT):
    """Zapíše, že Jikan leží; ostatní skripty ho po tu dobu nezkouší."""
    try:
        with open(SOUBOR, "w", encoding="ascii") as f:
            f.write(str(time.time() + minut * 60))
    except Exception:
        pass


def zrus_vypadek():
    """Smaže záznam o výpadku (např. po úspěšném dotazu)."""
    try:
        os.remove(SOUBOR)
    except Exception:
        pass
