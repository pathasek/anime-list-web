# Implementační plán 5 — „Plán pro Claude.docx" (2026-07-11)

Zdroj: `Plán pro Claude.docx` (plocha) + `Plán - co přidat.txt`. Níže je analýza kódu a
plán pro každý úkol. Pořadí implementace: nejdřív jasné a rychlé opravy s ověřením
v prohlížeči, pak velký redesign Dashboardu, nakonec mobilní audit.

---

## Úkol 1 — Sekce textových rozborů pro anime bez detailního hodnocení

**Zadání:** Anime bez detailního (numerického) hodnocení nemají radar kategorií ani graf
epizod — to je správně. Ale mají existovat odkazy na **modaly pro epizody a kategorie
rozbory (WORD)**. Nová menší sekce nad „Historie sledování". Příklad: *Made in Abyss*.

### Zjištění z analýzy kódu
- Data rozborů: `public/data/category_texts.json` (~25 MB), keyed názvem anime.
  - `categoryReviews[name][<Kategorie>]` = **string** s textem rozboru (Animace, CGI, MC,
    Plot, …, OST).
  - `categoryReviews[name].episodes[<n>]` = **objekt** `{ title, text }`.
  - `categoryReviews[name].story` = objekt `{ text }` (u filmů/OVA místo epizod).
- *Made in Abyss*: **NENÍ** v `category_ratings.json` ani `episode_ratings.json`, ale **MÁ**
  `category_texts` (12 kategorií + 13 epizod).
- `CategoryRatingsPanel` **už má** větev pro `!hasCategoryRatings` (ř. 327–473), která
  renderuje kartu „📖 Textové rozbory a analýza" s hero rozborem děje, chip kategoriemi,
  tlačítky epizod a přehrávačem hudby. **Sekce tedy už existuje** (screenshot v docx byl
  starší build).

### ⚠️ Nalezený bug (potvrzeno v prohlížeči)
Kliknutí na tlačítko „Epizoda N" v této sekci **shodí celou appku na bílou stránku**.
Příčina: handler předává celý objekt `reviews.episodes[epNum]` (`{title,text}`) do
`activeReview.text`, ale `formatCategoryMarkdown(text)` volá `text.split('\n')` → TypeError
→ pád (bez error boundary, StrictMode odmountuje strom).

### Plán
1. **Oprava pádu:** epizodní handler musí použít `episodes[epNum].text` jako text a
   `episodes[epNum].title` jako titulek (stejně jako funguje graf epizod u hodnocených
   anime). Modal pak zobrazí „📝 <title>".
2. **Sjednocení s hodnocenou verzí:** hero „Rozbor děje" i chip kategorie fungují správně;
   ověřit i `story` větev.
3. **Polish sekce** (design/standardizace): konzistentní nadpisy, mezery, ikony
   (`iconFor`), stavy hover/focus; sekce se renderuje **nad** „Historie sledování"
   (už tomu tak je — `CategoryRatingsPanel` je nad blokem historie v `AnimeDetail`).
4. Ověřit i `Made in Abyss: The Golden City…` (epizody) a `…Dawn of the Deep Soul` (story).

Soubory: `src/components/CategoryRatingsPanel.jsx` (+ případně `AnimeDetail.jsx`).

---

## Úkol 2 — Favourite OP/ED/OST: tlačítko „náhodný OP/ED" místo „Videoklipy OP/ED"

**Zadání:** Úplně nahoru přidat tlačítko, které spustí modal přehrávání **náhodného
OP/ED z tabulky**. Nahrazuje tlačítko „Videoklipy OP/ED ↗" (SharePoint odkaz), které
už není potřeba.

### Zjištění
- `Favorites.jsx` ř. 692–722: `<a>` „Videoklipy OP/ED ↗" → SharePoint složka. **Odstranit.**
- `playOpEdVideo(fav)` (ř. 145) najde přes `findVideoFor` GDrive video pro daný fav řádek a
  otevře `VideoModal`. `VideoModal` (`CategoryMediaPlayers.jsx`) přehrává přes `<video>`
  s fallbackem na GDrive iframe.

### Plán
1. Nahradit SharePoint `<a>` tlačítkem „🎲 Náhodný OP/ED".
2. Handler: z favoritů vybere **náhodný řádek, který má spárované video** (`findVideoFor`
   vrátí ne-null), a zavolá `playOpEdVideo`.
3. **Vylepšení modalu:** `VideoModal` dostane volitelný prop `onNext` → v hlavičce se
   zobrazí tlačítko „🎲 Další náhodný", aby šlo re-rollovat bez zavírání.

Soubory: `src/pages/Favorites.jsx`, `src/components/CategoryMediaPlayers.jsx`.

---

## Úkol 3 — History Log: počet zhlédnutých anime v hlavičce dne

**Zadání:** Do hlavičky dne (vedle „epizod" a „času") přidat i počet zhlédnutých anime,
např. „2 Anime".

### Zjištění
- `HistoryLog.jsx` ř. 515–545: skupiny podle data, `group.entries` = seznam záznamů dne,
  `group.totalEpisodes`, `group.totalTime`.
- Hlavička dne ř. 1042–1049: dva badge — epizody (cyan) + čas (amber).

### Plán
1. Při stavbě skupiny spočítat `uniqueAnime = new Set(entries.map(e => e.name)).size`
   (unikátní anime, ne počet řádků).
2. Přidat třetí badge do hlavičky: „N Anime" (vlastní barva, konzistentní styl). Pořadí:
   `N Anime · N epizod · čas`.

Soubor: `src/pages/HistoryLog.jsx`.

---

## Úkol 4 — Dashboard: redesign sekcí grafů (SVG / nativní, bez Excel obrázků)

**Zadání:** Kompletně přemodelovat sekce **Hodnocení, Typy, Studia, Sezóny & Stáří,
Témata, Žánry, Dabing**. Momentálně používají grafy s **obrázky z Excelu** (nesedí na
styl). Vytvořit nové, čisté, standardizované grafy — konzistentní výška, font.

### Zjištění
- Řada expanded grafů má jako **pozadí protažený screenshot Excel grafu**:
  `getOptions(..., './assets/excel_charts_media/imageXX.jpg')` →
  `excelImageBackgroundPlugin` kreslí obrázek za Chart.js graf. Dotčené:
  - Typy: `GrafTypuKombi` (image41)
  - Studia: `GrafStudiiBest` (image4)
  - Sezóny & Stáří: `GrafAnimeSezony` (image6), `GrafAnimeVeku` (image5),
    `GrafPrumerVeku` (image45)
  - Témata: `GrafTematBest` (image7)
  - Žánry: `GrafZanruBest` (image8)
  - (+ `AnimeHodnoceniVCaseGraf` image35)
- Barvy přes `excelPalettes` (Excel-derived). Výšky/fonty nekonzistentní mezi sekcemi.

### Plán
1. **Odstranit Excel obrázková pozadí** ze všech dotčených grafů (imagePath → null).
2. **Standardizovat vzhled** na design systém webu: jednotná výška karet grafů, font,
   barvy z CSS proměnných / sjednocené palety, konzistentní osy/mřížka/tooltip.
3. Kde dává smysl čistší a lehčí vykreslení (malé bar/řadové grafy náhledů), použít
   **vlastní SVG** komponenty místo Chart.js; velké interaktivní grafy nechat na Chart.js,
   ale ve sjednoceném stylu.
4. Projít všech 7 sekcí, sjednotit výšky a typografii; ověřit v light i dark.

Soubory: `src/pages/Dashboard.jsx`, `src/utils/excelStyles.js`, `src/App.css` (styly).
Poznámka: rozsáhlé — dělat po sekcích s průběžným ověřováním.

---

## Úkol 5 — Mobilní audit stěžejních částí

**Zadání:** Až bude vše výše hotové, provést analýzu a kontrolu **mobilního pohledu** pro
stěžejní části webu. **Nic neměnit na PC verzi** — jen mobil.

### Plán
1. Projít mobilní viewport (375 px) klíčové stránky: Detail anime, Favourite OP/ED/OST,
   History Log, Dashboard.
2. Opravit jen mobilní problémy (overflow, přetékání, čitelnost, dotykové cíle) přes
   media queries / `window.innerWidth` guardy — beze změny desktop layoutu.

---

## Pořadí a stav
- [x] Ú1: Oprava pádu epizod + titulky epizod v sekci textových rozborů — **ověřeno v prohlížeči**
- [x] Ú3: History Log počet anime („N Anime · N epizod · čas") — **ověřeno**
- [x] Ú2: Favourite „🎲 Náhodný OP/ED" + re-roll v modalu — **ověřeno** (KICK BACK přehráno)
- [x] Ú4: Dashboard — **odstraněna všechna Excel obrázková pozadí (9 grafů)** + **sjednocena
      sekce Dabing** (font titulku 0.75→0.82rem, levý okraj, výška těla 140→160px, karta na
      radius-lg) s ostatními sekcemi. Grafy renderují, build OK. Rewrite funkčních Chart.js
      grafů do vlastního SVG záměrně **neproveden** — vysoké riziko regresí bez screenshotů.
- [x] Ú5: Mobilní audit — na 375px **žádné horizontální přetečení** na klíčových stránkách
      (Dashboard, Detail, Favorites, History). Opraveno oříznutí `series-nav-badge` na mobilu
      (media query ≤600px zúží labely/padding). Desktop beze změny.

### ⚠️ Omezení prostředí
Nástroj na screenshoty v tomto preview panelu **konzistentně timeoutuje** (30 s) na jakékoli
stránce. Funkční zůstává čtení DOM/textu/konzole a spouštění JS. Funkční změny se ověřit
dají, ale **vizuální redesign (Ú4 hloubkově, Ú5) nelze naslepo bezpečně dodělat.**
