# Audit kompletnosti rozborů (task 10b) — 2026-07-10

Porovnání `category_ratings.json` / `episode_ratings.json` / `anime_list.json` proti
`category_texts.json` (generováno z read-only složky docx rozborů přes
`export_docx_categories.py`). Skript: scratchpad `audit_data.py`.

## 1) Hodnocení kategorií bez textových rozborů (chybí modaly) — 5 z 287
- Owarimonogatari, S02
- **Re:Zero -Starting Life in Another World-, S02 Part 1** ← nahlášený případ potvrzen
- Saga of Tanya the Evil, S01
- Tower of God, S01
- Tower of God, S02: Return of the Prince

> Pozn.: Re:Zero S02P1 má v `category_texts.json` **13 textů epizod, ale 0 kategorií**
> → docx existuje a parsuje se, ale sekce kategorií se nerozpoznaly (pravděpodobně
> nadpisy mimo `HEADING_MAP` v `export_docx_categories.py`). Stejný vzorec může platit
> i pro ostatní 4. Řešení: doplnit mapování nadpisů v parseru, nebo upravit nadpisy
> při příštím rozboru (zdrojová složka se nemění zpětně).

## 2) Hodnocení epizod bez textů epizod
**Zcela chybí (33)** — nejspíš rozbory zatím nevznikly: 5 Centimeters per Second,
Agents of the Four Seasons, Black Butler S02 Specials, Burn the Witch, Chainsaw Man:
The Compilation, Classroom of the Elite S04, Daemons of the Shadow Realm, Demon
Slayer (S01), Dorohedoro Bonus, From the New World, Himouto! (OVA/R/Specials),
**Jujutsu Kaisen S01**, May I Ask for One Final Thing?, Mushoku Tensei S03 (2 ep),
Nippon Sangoku, Petals of Reincarnation, Psycho-Pass S02, Rascal…Santa Claus,
Re:Zero S04, Shiki, Sound of the Sky (+Specials), Spy x Family S01P2 & S02,
Steins;Gate Sagacious Wisdom, Ancient Magus' Bride (2× speciály), The Beginning
After the End S02, Disappearance of Haruhi, Future Diary, Witch Hat Atelier.

**Částečně chybí (4)** — podezření na parsování konkrétní epizody v docx:
- Fullmetal Alchemist: Brotherhood OVA Collection (1/4)
- Ranking of Kings: The Treasure Chest of Courage (9/10)
- That Time I Got Reincarnated as a Slime, S02 Part 1 (11/12)
- Tower of God, S02: Return of the Prince (9/13)

## 3) Filmy/speciály bez rozboru děje (story) — 2
- Burn the Witch [ONA]
- Steins;Gate: The Sagacious Wisdom of Cognitive Computing [ONA]

## 4) Rozbory-sirotci (překlep v názvu) — 0 ✓
Všechny klíče v `category_texts.json` odpovídají anime v listu.
