# Implementační plán 2 — „Plán pro Claude" (verze z 10. 7. 2026)

Druhá dávka úprav z `Plán pro Claude.docx`. 14 úkolů, 11 referenčních obrázků
(zkopírovány do `docs/plan2-images/`). První dávka (18 úkolů) je hotová —
viz `IMPLEMENTATION_PLAN.md`.

---

## Úkol 1 — Výška sekce „Průzkum hodnocení: X"
**Stránka:** AnimeRatings.jsx (Průzkum hodnocení)
Celá sekce se musí vejít na obrazovku v Google Chrome **se zapnutou lištou
záložek** (viewport ≈ 1080 − systémová lišta − Chrome UI vč. bookmarks baru).
Momentálně je o kousek vyšší → zmenšit celkovou výšku sekce tak, aby se vešla
bez scrollu.

## Úkol 2 — Filtr „Hodnocení" na řádek k „Položce"
**Stránka:** AnimeRatings.jsx → panel „Filtry a seznam"
**Obrázek:** `plan2-images/image1.png` — dnes jsou Typ / Položka / Hodnocení
tři samostatné řádky nad sebou. Cíl: **Položka a Hodnocení na jednom řádku**
(dva sloupce), Typ zůstává nahoře. Souvisí s úkolem 1 (ušetří vertikální místo).

## Úkol 3 — Vertikální centrování obrázku v zobrazení „Jednotlivě"
**Stránka:** AnimeRatings.jsx → nastavení zobrazení „Jednotlivě"
**Obrázek:** `plan2-images/image2.png` — karta Jujutsu Kaisen S02: cover
obrázek je zarovnaný nahoru, má být **vertikálně na střed** karty.

## Úkol 4 — Hover text „Děj" u kategorie Plot
**Stránky:** všude, kde se používá řádek kategorie Plot — AnimeDetail.jsx
i AnimeRatings.jsx (pravděpodobně sdílená komponenta / categoryIcons.jsx).
**Obrázek:** `plan2-images/image3.png` — řádek „Plot | váha: 4 | 8".
Při najetí myší na kategorii Plot zobrazit text **„Děj"** napravo od ikony děje.

## Úkol 5 — Odstranit delay při vstupu do Hodnocení sérií / Jednotlivě
**Stránka:** rozcestník „Anime hodnocení" → AnimeRatings.jsx
Kliknutí na „Hodnocení sérií" nebo „Hodnocení jednotlivě" se sekne (delay),
a po načtení ještě běží enter-animace grafů. Cíl: plynulý přechod — odstranit
delay a zbavit se rušivých výpočtů/animací grafů po načtení (elegantně:
např. deferovat těžký výpočet, vypnout mount-animace, memoizace).

## Úkol 6 — Redesign ukazatelů v hlavičce Anime série
**Stránka:** AnimeRatings.jsx → hlavička série (Hodnocení sérií)
**Obrázek:** `plan2-images/image4.png` — Lord of Mysteries: čtyři boxy
HODNOCENÍ / ROZSAH / SLEDOVÁNÍ / STUDIO vypadají „trapně" — malé sekce, moc
prázdného místa. Značně elegantní redesign celé řady ukazatelů.
**Navíc:** „?" u kolečka hodnocení v hlavičce se překrývá s kruhem — posunout
dál od středu, musí být mezera mezi „?" a kolečkem.

## Úkol 7 — Oprava pavoučího grafu u Sérií
**Stránka:** AnimeRatings.jsx → CategoryRadar.jsx („Kategorie série")
**Obrázek:** `plan2-images/image5.png` — radar Lord of Mysteries:
a) popisky se překrývají (label „Animace/CGI" koliduje s vrcholem grafu),
b) velikost čísel hodnocení a názvů kategorií nesedí k velikosti grafu a ikon,
c) tlačítko po najetí myši na ikonu se špatně vykresluje.

## Úkol 8 — Tabulky v rozborovém modalu (3 vady)
**Komponenta:** rozbor modal (formatReview.jsx / CategoryRatingsPanel)
**Obrázky:** `plan2-images/image6.png` (A, B), `plan2-images/image7.png` (C)
A) Nad sticky hlavičkou tabulky je **díra, kterou prosvítá text** při scrollu
   (viz Waifu 8/10 modal) → hlavička musí těsně navazovat / mít neprůhledné pozadí.
B) **Chytřejší šířky sloupců** — první sloupec „POSTAVA (VĚK)" se hloupě zúžil
   a láme se po písmenech. Zabránit degenerovaně úzkým sloupcům.
C) Při doscrollování na konec tabulky **hlavička nemá dojet až na konec** —
   má se zastavit na předposledním řádku (přestat být sticky o řádek dřív).

## Úkol 9 — Přesun ukazatele série v detailu anime
**Stránka:** AnimeDetail.jsx
**Obrázek:** `plan2-images/image9.png` — Tears of the Azure Sea (movie),
červená šipka: navigátor série (← S04 | název | 10/10 | →) přesunout ze
stávající pozice v hlavičce **doprava od témat** — stejná pozice na ose X,
jen posunuto níž na ose Y (do řádku žánrů/témat).

## Úkol 10 — Chování „Zpět" + vylepšení modalu série
**Stránka:** AnimeDetail.jsx (+ modal série)
**Obrázek:** `plan2-images/image8.png` — modal Country Bumpkin.
a) **Zpět:** po navigaci A → sequel B má první kliknutí na „Zpět" opustit
   detail a vrátit se na uloženou pozici seznamu (jako u anime A) — ne krokovat
   zpět přes prequel.
b) **„X dílů"** v hlavičce modalu se zalamuje na dva řádky („2 / dílů") → nesmí.
c) Za počet EP v modalu přidat **délku dílu** (např. „TV · 12 ep · 23 min").
d) **„Sledováno"** — chytrý formát rozsahu datumů:
   `dd. – dd. mm. yyyy` (stejný měsíc i rok) /
   `dd. mm. – dd. mm. yyyy` (stejný rok) /
   `dd. mm. yyyy – dd. mm. yyyy` (různé roky).

## Úkol 11 — Badge systém: zalomení na druhý řádek
**Stránka:** AnimeDetail.jsx — hlavička s TAG (TV), STATUS (AIRING!) a MAL
**Obrázek:** `plan2-images/image10.png` — Country Bumpkin S02: dlouhý titul →
badge řada zasahuje do pole tlačítka „Najít doporučení". Když TAG + STATUS +
MAL kolidují s tlačítkem, automaticky je přesunout **na druhý řádek** pod titul.

## Úkol 12 — OP/ED minihra: duplicity a série
**Komponenta:** src/components/opedquiz/
a) **Nikdy** nesmí nastat duplicita ve hře — stejné anime/písnička dvakrát
   (ani jako otázka, ani mezi možnostmi v jedné otázce).
b) Omezit četnost otázek zaměřených na specifickou sérii — teď jich padá moc.

## Úkol 13 — Dashboard: kratší delay auto-scrollu u „Počet rewatch"
**Stránka:** Dashboard.jsx → detail „Počet rewatch" (horizontální scroll
rewatched anime). Delay automatického posouvání výrazně zkrátit, ale ponechat
ergonomický pro čtení.

## Úkol 14 — Výměna všech „i" informačních ikon
**Rozsah:** celá aplikace
**Obrázek:** `plan2-images/image11.png` — stará ⓘ ikona (vedle „43").
Nahradit všude modernější/hezčí verzí, velikost zachovat přibližně stejnou.

---

## Mapování obrázků

| Obrázek | Úkol | Co ukazuje |
|---|---|---|
| image1.png | 2 | Panel „Filtry a seznam" — Typ/Položka/Hodnocení pod sebou |
| image2.png | 3 | Karta Jujutsu Kaisen S02 — cover není vertikálně na střed |
| image3.png | 4 | Řádek kategorie Plot (váha 4, hodnota 8) |
| image4.png | 6 | Hlavička série Lord of Mysteries — 4 boxy + „?" u kolečka |
| image5.png | 7 | Radar „Kategorie série" — překryvy popisků, velikosti |
| image6.png | 8A, 8B | Modal Waifu — díra nad hlavičkou, zúžený 1. sloupec |
| image7.png | 8C | Modal Waifu — sticky hlavička dojíždí na konec |
| image8.png | 10 | Modal Country Bumpkin — zalomené „2 dílů", EP bez délky |
| image9.png | 9 | Tears of the Azure Sea — šipka kam přesunout navigátor série |
| image10.png | 11 | Country Bumpkin S02 — badge řada koliduje s tlačítkem |
| image11.png | 14 | Stará ⓘ ikona |

## Navržené pořadí realizace

1. **CSS/layout drobnosti:** 3, 4, 6 („?" mezera), 2 → 1 (výška až po 2, protože
   sloučení řádků filtrů výšku ovlivní)
2. **Grafy a výkon:** 5, 7
3. **Modal tabulky:** 8
4. **Detail anime:** 9, 11, 10
5. **Ostatní:** 13, 14
6. **Minihra (izolovaně, jako vždy):** 12
