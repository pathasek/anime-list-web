# Implementační plán — „Plán pro Claude" (2026-07-09)

Zdroj: `Plán pro Claude.docx` (18 úkolů + 13 obrázků). Tento dokument mapuje každý úkol na konkrétní soubory, popisuje postup, otevřené otázky a rizika.

## Datový model (reference)

Data se načítají přes `src/utils/dataStore.js` z `public/data/*.json` (cache v localStorage + memory). Klíčem je vždy `name` anime.

| Soubor | Tvar | Použití |
|---|---|---|
| `anime_list.json` | `{index, name, type, series, episodes, episode_duration, rating, status, mal_url, tags, thumbnail, …}` | seznam, detail, hlavičky |
| `category_ratings.json` | `{name, categories:{Animace, CGI, MC, Vedlejší postavy, Waifu, Plot, Pacing, Story Conclusion, Originalita, Emoce, Enjoyment, OP, ED, OST}}` | radar, R² panel |
| `category_texts.json` (16 MB) | `{ [name]: { [kategorie]: "markdown text" } }` | modaly kategorií (rozbory) |
| `notes.json` | `[{name, note}]` — rozbor **celého anime** | detail, recenze |
| `episode_ratings.json` | `[{name, episodes:[{episode:"EP 1", rating:8.75}]}]` — jen čísla | graf vývoje epizod |

**Klíčové soubory UI:**
- `src/pages/AnimeRatings.jsx` (209 KB) + `AnimeRatings.css` (52 KB) — stránka „Anime hodnocení a analýza" (úkoly 1–11)
- `src/pages/AnimeDetail.jsx` (47 KB) — detail anime (úkoly 12, 17)
- `src/pages/Favorites.jsx` (98 KB) — „Favourite OP/ED/OST" (úkoly 13, 14)
- `src/pages/Dashboard.jsx` (135 KB) — Dashboard (úkol 15)
- `src/pages/Wrapped.jsx` (73 KB) — „Anime Wrapped" (úkol 16)
- `src/components/CategoryRadar.jsx`, `categoryIcons.jsx`, `CategoryRatingsPanel.jsx` — radar + modaly kategorií
- `src/components/MusicPlayer.jsx`, `FavoritesOstPlayer.jsx`, `CategoryMediaPlayers.jsx`, `OstPlayerProvider.jsx` — přehrávače (úkol 18)

---

## Doporučené pořadí (fáze)

Nejdřív rychlé CSS/layout opravy (nízké riziko), pak větší featury.

**Fáze 1 — CSS/layout drobnosti (rychlé):** 3, 5, 6, 9, 10a, 18
**Fáze 2 — Layout shift & tabulky:** 4, 11
**Fáze 3 — R² panel redesign & detail rozborů:** 1, 2
**Fáze 4 — Radar interakce & oprava průměru:** 8
**Fáze 5 — Rozbory do grafů + audit dat:** 7, 10b
**Fáze 6 — Badge systémy:** 12, 17
**Fáze 7 — Grafy Favorites & Dashboard & Wrapped:** 14, 15, 16
**Fáze 8 — Velká featura (minihra):** 13

---

## Úkoly

### 1. R² panel „Vliv kategorií na finální hodnocení" → seskupení s nadpisy (obr. 1)
- **Kde:** `AnimeRatings.jsx:3277` (`r2-overview-title`), příslušný `.css`.
- **Co:** 14 ukazatelů natáhnout a **seskupit** podle příslušnosti. **✅ UPŘESNĚNO:**
  - **Viditelné nadpisy** skupin + vizuální seskupení **barvou nebo ohraničením** (k čemu patří).
  - **Zachovat kanonické pořadí kategorií — Animace první, OST poslední. NEPŘEROVNÁVAT podle R² hodnoty!** (Pozor: aktuálně je panel seřazený sestupně podle R² — nutno přepnout na kanonické pořadí z `category_ratings.json`.)
  - Skupiny (souvislé v kanonickém pořadí): **Vizuál** (Animace, CGI) → **Postavy** (MC, Vedlejší postavy, Waifu) → **Příběh** (Plot, Pacing, Story Conclusion, Originalita, Emoce) → **Zážitek** (Enjoyment) → **Hudba** (OP, ED, OST). Animace první ✓, OST poslední ✓.
- **Postup:** obalit každou skupinu do kontejneru s nadpisem + rámečkem/barvou; uvnitř grid karet. R² hodnota zůstává na kartě. Původní „7+7 na řádek" je nahrazeno seskupením (řádky určuje skupina).

### 2. Detail popisu hodnocení kategorie — malé tlačítko + mock text (obr. 1)
- **Kde:** karty v R² panelu (viz #1), `CategoryRatingsPanel.jsx`.
- **Co:** na každé kartě kategorie malé tlačítko → otevře panel/modal s detailním popisem „jak vidím tuto kategorii". Zatím **mock text** (placeholder), připravit strukturu pro pozdější reálný obsah.
- **Postup:** přidat `onClick` + stav `openedCategoryDetail`; komponenta modalu s mock textem; napojit na budoucí zdroj (např. nový klíč v datech).

### 3. Náhledové obrázky anime = vždy 16:9 (obr. 2 — Jujutsu Kaisen)
- **Kde:** `AnimeRatings.jsx` (náhledovky v seznamu/hlavičce), `.css`.
- **Co:** náhledové obrázky nesmí být deformované/zmenšené mimo poměr. Vynutit `aspect-ratio: 16/9; object-fit: cover;`.
- **Riziko:** ořez postav — `object-fit: cover` ořízne okraje; ověřit vizuálně.

### 4. Layout shift při prvním otevření modalu (posun o pár px doprava po F5)
- **Kde:** globálně — modaly epizod i kategorií (`AnimeRatings.jsx`, `index.css`).
- **Příčina:** objevení vertikálního scrollbaru při zamčení scrollu (`overflow:hidden` na body) mění šířku viewportu.
- **Řešení:** `scrollbar-gutter: stable both-edges;` na `html`/scroll kontejneru, nebo kompenzace `padding-right` = šířka scrollbaru při otevření modalu. Ověřit, že se to netýká jen desktopu.

### 5. Přetékající datum sledování v hlavičce série (obr. 3 — Lord of Mysteries)
- **Kde:** hlavička série v `AnimeRatings.jsx`, blok „SLEDOVÁNÍ" (`28. 6. 2025 – 29. 6. 2026`).
- **Co:** text přetéká. Opravit šířku sloupce/`white-space`/`flex` wrap nebo zmenšit font/rozšířit kontejner.

### 6. Zarovnat „Vyberte sérii" a „Spojitý vývoj hodnocení epizod" (obr. 4)
- **Kde:** `AnimeRatings.jsx:2504` (Spojitý vývoj), sekce „Vyberte sérii".
- **Co:** při scrollu úplně nahoře nejsou stejně dlouhé/vysoké. Sjednotit výšku (align-items/stretch v gridu, nebo min-height).

### 7. Přidat moje rozbory epizod do „Spojitý vývoj hodnocení epizod" + odebrat MAL synopse
- **Kde:** `AnimeRatings.jsx` — modal detailu epizody „STAV B" (~ř. 2560–2620), kde se dnes zobrazuje `jikanSynopsis`.
- **Co:** místo MAL/Jikan synopse zobrazit **můj popis** epizody. U filmů jde o **děj** (ne „Plot").
- **✅ VYŘEŠENO — zdroj dat:** texty už existují v **`category_texts.json`**! Skript `export_docx_categories.py` je generuje z read‑only složky `C:\AL\Anime hodnocení a rozbory\Faktické rozbory (Gemini AI)\Vytvořené faktické rozbory` (**tuto složku NEMĚNIT** — jen konzumujeme hotový JSON). Struktura:
  - `category_texts.json[name].episodes = { "1": {title, text}, "2": {…}, … }` — per epizoda (181 výskytů klíče `episodes`).
  - u filmů/speciálů místo epizod klíč pro **děj** (STORY) — ověřit přesný název klíče při implementaci.
- **Postup:** 1) stránka už načítá `category_texts.json` (ř. 29) — vytáhnout `episodes[epNum].text` pro vybranou epizodu; 2) nahradit `jikanSynopsis` v modalu vlastním textem (MAL skóre badge lze ponechat); 3) u filmů použít text děje; 4) odebrat závislost na Jikan synopsi pro tento panel.
- **💡 REFERENCE:** epizodní texty z `category_texts.json` se už používají v grafu v **detailu anime** (`AnimeDetail.jsx`) — inspirovat se tamní implementací a udělat spojitý graf podobně.

### 8. Radar „Kategorie série" — zmenšit, klikatelné ikonky, oprava průměru (obr. 5)
- **Kde:** `CategoryRadar.jsx`, `categoryIcons.jsx`, `AnimeRatings.jsx:2756`.
- **Co:**
  - **a)** Zmenšit pavoučí graf, ať nepřetéká.
  - **b)** Ikonky kategorií udělat klikatelné (jen pro „Kategorie série") → modal s částí rozboru (`category_texts.json`). Když je zvoleno „Ø Průměr série", nabídnout výběr, pro který díl modal zobrazit.
  - **c)** **Bug:** při výběru různých dílů se mění vizuál průměru (jako by se měnil poměr min/max) — nedává smysl. Opravit tak, aby škála radaru byla **fixní** (pevné min/max, ne dynamické podle vybraného dílu).
- **Riziko:** klikatelné SVG/Canvas ikonky u chart.js radaru — možná nutný custom overlay místo nativních bodů.

### 9. Bubble graf „Kvalita vs Hloubka" — body u kraje celé viditelné (obr. 6)
- **Kde:** `AnimeRatings.jsx` (chart.js scatter/bubble), možná `excelChartCalculations.js`.
- **Co:** body na 10/10 jsou uříznuté hranicí grafu. Přidat padding do os (`suggestedMax` o kousek výš, nebo `layout.padding`), aby byly kulaté body celé vidět.

### 10. Tlačítko „děj"/Plot doprava + audit kompletnosti dat (obr. 7)
- **Kde:** `AnimeRatings.jsx` (tlačítko děje u filmů/OVA/TV special, řádek s „Plot"), data audit napříč JSONy.
- **Co:**
  - **a)** Posunout tlačítko děje víc doprava (za slovo „Plot").
  - **b)** **Audit:** ověřit, že všechna anime mají namapované všechny kategorie a děje/epizody. Konkrétně nahlášeno: „Re:Zero -Starting Life in Another World-, S02 Part 1" nemá rozbory pro modaly kategorií. → skript, který zkontroluje `category_texts.json` vs `category_ratings.json` vs `anime_list.json` a vypíše chybějící.

### 11. Modal kategorií — tabulky bez scrollu, sticky hlavička, chytrá výška řádků (obr. 8 — CGI)
- **Kde:** `CategoryRatingsPanel.jsx` / modal kategorií, `.css`.
- **Co:**
  - zrušit vertikální scroll tabulky — ukázat **celou tabulku**;
  - hlavička tabulky **sticky** nahoře při scrollu v modalu;
  - **chytrá výška řádků**: upravit výšku, aby nebyl horizontální scrollbar — ale ne zbytečně vysoké řádky; když to nejde, scrollbar smí zůstat.
- **Postup:** `position: sticky; top:0` na `thead`; `table-layout` + `word-break`; heuristika: pokud součet min-šířek sloupců > šířka modalu, povolit horizontal scroll, jinak roztáhnout.

### 12. Chytrý badge systém (TYP + STATUS + MAL na stejném řádku) (obr. 9, 10)
- **Kde:** `AnimeDetail.jsx` (a `AnimeRatings.jsx`, pokud se badges používají i tam).
- **Co:** 3 badge (TYP, STATUS, MAL) musí být **vždy na stejném řádku**. Špatně: „Tears of the Azure Sea" — TYP zůstal na 1. řádku, zbytek spadl na 2. Když se badges nevejdou vedle tlačítka „Najít doporučení", přesunout **všechny 3** na druhý řádek (jako „Country Bumpkin S01").
- **Postup:** obalit 3 badge do jednoho `flex` kontejneru s `flex-wrap: nowrap` (drží pohromadě), a celý blok wrapovat vůči tlačítku. Otestovat na obou příkladech.

### 13. Minihra „Hádej OP/ED" v „Favourite OP/ED/OST" (obr. — Favorites)
- **Kde:** nová komponenta v `Favorites.jsx`, přehrávač (`FavoritesOstPlayer.jsx`), data `favorites_ost.json`, `op_ed_videos.json`, `anime_list.json` (tags/série).
- **Co:** přehraje se jen hudba (OP/ED), hádá se anime. Bonusové body za typ (OP/ED), interpreta, název písničky. **Chytré možnosti**: distraktory z podobných anime (anilist tagy/témata) a z téže série („Z jaké série je toto OP?").
- **Postup:** 1) herní stav + skóre; 2) výběr správné + generátor distraktorů (podobnost přes `tags`/`series`); 3) audio-only režim přehrávače; 4) UI kola, výsledků, bonusů.
- **✅ UPŘESNĚNO — architektura:** postavit jako **samostatnou, izolovanou featuru** (vlastní složka/komponenty), která **není extra provázaná** s ostatními funkcemi Favorites — jen konzumuje data (`favorites_ost.json`, `op_ed_videos.json`, `anime_list.json`). Cíl: **žádný spaghetti code**, minimální coupling, čisté rozhraní.
- **Poznámka:** největší úkol — vlastní fáze na konci.

### 14. Grafy v „Favourite OP/ED/OST" — roztáhnout do prostoru + odstranit „(z VBA)" (obr. 11)
- **Kde:** `Favorites.jsx`, sekce „Analytika OP/ED".
- **Co:** při otevření detailu grafu se má rozložit **do prostoru** (horizontálně), ne jen vertikálně. Odstranit text „(z VBA)".
- **Postup:** upravit grid/šířku rozbaleného detailu; grep & smazat řetězec „(z VBA)".

### 15. Dashboard — delayed automatický horizontální scroll u „Počet rewatch" (obr. 12)
- **Kde:** `Dashboard.jsx`, detail „Počet rewatch" (horizontální seznam rewatched anime).
- **Co:** přidat zpožděný automatický posun horizontálního scrollbaru.
- **Postup:** `useEffect` s `setTimeout` (delay) → plynulý auto-scroll (requestAnimationFrame nebo `scrollBy` s `behavior:smooth`), pauza při hoveru/interakci uživatele.

### 16. „Anime Wrapped" tab → rovnou klasický přehled, ne stories (obr. — Wrapped)
- **Kde:** `Wrapped.jsx`.
- **Co:** kliknutí na tab teď hned spustí stories. Chci rovnou klasický přehled; stories volitelně.
- **Postup:** změnit výchozí stav view z „stories" na „overview" (najít inicializační stav/route).

### 17. Badge série v detailu + modal se všemi díly série (obr. 13 — Re:Zero S02 Part 1)
- **Kde:** `AnimeDetail.jsx`, data `anime_list.json` (`series`).
- **Co:** pokud má anime sérii, hezký badge v místě červeného kolečka: ukáže název série + částečně předchozí/následující díl (rychlé go forward/backward). Klik na název série → menší modal se **všemi díly série** se základními daty jako odkazy na detaily.
- **Postup:** 1) seskupit anime dle `series`, seřadit (viz `customSeasonOrders.js`); 2) badge s prev/next; 3) modal se seznamem dílů → `Link` na detail.

### 18. Zvětšit OST/Music player o 10 % (všude)
- **Kde:** `MusicPlayer.jsx`, `FavoritesOstPlayer.jsx`, `CategoryMediaPlayers.jsx`, příslušné `.css`.
- **Co:** zvětšit přehrávač o 10 %, zachovat poměr a vše ostatní. **Ikonu minimalizovaného stavu nechat beze změny.**
- **Postup:** najít rozměry (px/rem) přehrávače a přenásobit ×1,1; vynechat minimalizovanou ikonu.

---

## Otevřené otázky — VYŘEŠENO ✅
1. ~~**Úkol 7** — zdroj textů epizod~~ → `category_texts.json[name].episodes` (+ děj u filmů); zdrojová docx složka read‑only, neměnit.
2. ~~**Úkol 1** — nadpisy vs. seskupení~~ → viditelné nadpisy + barva/ohraničení, kanonické pořadí (Animace první, OST poslední).
3. ~~**Úkol 13** — rozsah minihry~~ → plnohodnotná, ale izolovaná featura bez couplingu (žádný spaghetti).

Zbývá ověřit při implementaci: přesný název klíče „děj" v `category_texts.json` u filmů.

## Ověření
- Aplikace: Vite dev server (`npm run dev`). Po každé fázi ověřit v prohlížeči (preview) — layout shift, poměry obrázků, přetékání, modaly.
