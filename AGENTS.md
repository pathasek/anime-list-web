# Pravidla pro AI asistenty

Tenhle soubor je **jediný zdroj pravdy** pro všechny AI nástroje v tomhle projektu.
`CLAUDE.md`, `GEMINI.md` a `.clinerules` na něj jen odkazují.

Projekt: **Anime List Web** (React 19 + Vite 5, HashRouter, Chart.js). Osobní
aplikace pro sledování a hodnocení anime. Data se generují z Excelu, ne ručně.

**Kontext a souvislosti** (architektura, data, ověřené pasti, co je otevřené)
jsou o patro výš v `../dokumentace/ZDROJ_PRAVDY.md`. Tenhle soubor drží
**pravidla**, ten druhý **znalosti**. Mimo repozitář je schválně, ať se
neveřejní na GitHubu.

---

## 1. Rozsah práce (nejdůležitější pravidlo)

**Pracuj výhradně uvnitř této složky (`anime-list-web/`).**

Zakázáno bez mého výslovného pokynu:

- Zapisovat cokoliv do nadřazené složky `Anime_List/` nebo do sourozeneckých
  složek (`Anime hodnocení a rozbory/`, `Poznámky ke sledovaným Anime/`,
  `Náhledovky a obrázky - Anime/`, `Anime OP, ED, OST videos/`, `RULEBOOK/`, …).
- Sahat na `Anime list.xlsm`. Je to zdroj všech dat a má 117 MB.
- Zakládat pomocné/dočasné skripty v kořeni projektu. Dočasné soubory patří do
  systémové temp složky, ne do repozitáře.
- Mazat nebo přesouvat cokoliv mimo to, co jsem výslovně zadal.

Když si nejsi jistý, jestli něco spadá do rozsahu, **zeptej se místo hádání**.

## 2. Data se needitují ručně

`public/data/*.json` **generuje Excel VBA** přes skripty v `tools/`
(`export_data.py`, `export_docx_categories.py`, …). Ruční úprava se při dalším
exportu ztratí.

Když je potřeba změnit data, uprav **generátor** v `tools/`, ne výstupní JSON.

Klíčové soubory a co v nich je:

| Soubor | Obsah |
|---|---|
| `anime_list.json` | hlavní seznam (488 položek); `end_date: "X"` = AIRING!/PENDING |
| `history_log.json` | denní záznamy sledování; pole `rewatch` (`null` / `"1"` / `"2"`) |
| `category_ratings.json` | hodnocení kategorií |
| `episode_ratings.json` | hodnocení epizod |
| `category_texts.json` | **moje texty z Wordu** (26 MB) — nikdy negeneruj ani nepřepisuj |
| `notes.json` | **moje poznámky** — totéž |
| `favorites*.json`, `op_ed_videos.json`, `animethemes_op_ed.json` | OP/ED/OST |

## 3. Nesahat na hotové věci

- **OST přehrávač** (`OstPlayerProvider.jsx`, `FavoritesOstPlayer.jsx`,
  `MusicPlayer.jsx`) funguje dobře a **nemá se měnit**. Můžeš ho volat, ne
  přepisovat.
- **Nemazat existující odkazy ani funkce** při refaktoru vzhledu. Když sjednocuješ
  styl, měň styl, ne chování.
- **Rewatch se nepočítá** do statistik typu „Nejdelší anime". Když čteš
  `history_log.json` kvůli odsledovanému času, vždy přeskoč `h.rewatch`.
  (Tohle už jednou způsobilo regresi — commit `1d1759c`.)

## 4. Git a nasazení

- **Nikdy** `git push` ani `git commit` bez mého pokynu.
- **Nasazení není samostatný krok.** Push do `main` spustí workflow
  `.github/workflows/deploy.yml`, který web postaví a publikuje na GitHub Pages.
  Push do `main` = nasazení. Žádný `npm run deploy` neexistuje.
  Výsledek ověřuj přes `gh run list`. Hash assetu z lokálního buildu se
  se živým webem **neshoduje**, protože Actions staví znovu u sebe.
- Repozitář je veřejný na GitHubu (`pathasek/anime-list-web`) a nasazuje se na
  GitHub Pages. **Nikdy do něj nepřidávej** přihlašovací údaje, tokeny ani nové
  soukromé odkazy (OneDrive/SharePoint/Google Drive).
- Nepoužívej `--no-verify` ani force push.

## 5. Styl kódu a textů

- Komentáře i UI texty jsou **česky**.
- V textech, které vidí uživatel, **nepoužívej em dash (—)**. Použij dvojtečku,
  čárku, závorku nebo větu rozděl. Náhrada za `" - "` se nepočítá.
  (Výjimka: samostatné `—` jako zástupný znak pro chybějící hodnotu v tabulce.)
- Odkazy na anime dostávají třídu `anime-link`; externí odkazy `ext-link` +
  `ext-link--mal` / `--yt` / `--spotify`. Nepiš hover efekty inline stylem ani
  `onMouseEnter` handlerem — hover řeší globální pravidlo v `index.css`.
- Čísla se formátují přes `toLocaleString('cs-CZ')`.

## 6. Ověřování změn

```bash
npm run dev      # dev server (port 5173)
npm run lint     # musí projít bez chyb
npm run build    # musí projít
```

Změnu, která je vidět v prohlížeči, **ověř v prohlížeči** — nestačí, že se to
zkompilovalo. Grafy (Chart.js) a popisky radaru se počítají přes
`requestAnimationFrame`, takže se v neviditelném/nezobrazeném okně nevykreslí.

## 7. Orientace v kódu

```
src/
├── App.jsx                    routing (HashRouter), sidebar
├── pages/                     Dashboard, AnimeList, AnimeDetail, HistoryLog,
│                              AnimeRatings, Favorites, TopFavorites, Wrapped, …
├── components/                CategoryRatingsPanel (radar + karty kategorií),
│                              AnimeJourney (Cesta Anime), OST přehrávače, kvíz
├── utils/                     journeyCalculations, excelChartCalculations,
│                              jikanService (Jikan API + IndexedDB cache),
│                              dataStore, mediaMatch
└── index.css                  jeden velký stylesheet + 9 barevných témat
```

Externí API: **Jikan** (MAL), **AniList GraphQL** (rozvrh vysílání),
**AnimeThemes** (znělky). Jikan má rate limit, proto globální prioritní fronta
v `jikanService.js` — nové volání veď přes ni, ne přímým `fetch`.
