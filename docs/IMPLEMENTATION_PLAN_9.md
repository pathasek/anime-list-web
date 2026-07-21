# Implementační plán 9 — OP/ED hra přes AnimeThemes, Anime Futures, „Cesta Anime“ na Dashboardu (2026-07-18)

## STAV IMPLEMENTACE (2026-07-18)

| Úkol | Stav |
|---|---|
| **Ú3 — globální časový filtr** | ✅ HOTOVO a ověřeno v prohlížeči |
| **Ú3 — Cesta Anime** | ✅ HOTOVO a ověřeno proti Excel boxům |
| **Ú1 — OP/ED přes AnimeThemes** | ✅ HOTOVO a ověřeno v prohlížeči |
| **Ú2 — Anime Futures** | ⏸ ODLOŽENO uživatelem |

### Ú1 — co bylo uděláno (2026-07-18)

**Nový skript** `download_animethemes_cache.py` (root aplikace): dávkové dotazy
na AnimeThemes (`filter[external_id]=id,id,…` po 10 → **~50 requestů místo 488**),
include `animethemes.animethemeentries.videos.audio` kvůli **audio-only .ogg**
stopě, `videoScore` i dedup TV/BD portovány 1:1 z `animeThemesService.js`,
resumovatelná cache `.animethemes_cache_partial.json`, přepínače `--limit`/`--force`.
**Výsledek:** `public/data/animethemes_op_ed.json` — **1074 znělek ze 401 anime**
(430 OP + 644 ED), 376 kB, **0 znělek bez audio stopy**.

**`quizEngine.buildPool`** má nové API `buildPool({ themes, videos, animeList, mode })`:
- `mode: 'all'` — celý katalog (1074 skladeb; dřív jen 210 z GDrive),
- `mode: 'favorites'` — jen znělky z GDrive knihovny, ale **přehrávané z AnimeThemes**.
  Párování: (1) název anime přes MAL id + typ + normalizovaný název písně,
  (2) **záloha podle pořadí znělky** (`ver` z GDrive ↔ číslo v labelu `OP1`;
  když anime má jen jednu znělku daného typu, je jednoznačná) — nutné proto, že
  tentýž song má v obou zdrojích jiný název (GDrive „My War“ / „Feuerroter Pfeil
  und Bogen“ vs AnimeThemes „Boku no Sensou“ / „Guren no Yumiya“). Bez této
  zálohy hrálo z AnimeThemes 184/208, s ní **206/208 (99 %)**; poslední 2
  (Black Butler S01, Cross Ange) katalog nezná → přímé GDrive URL.

**`OpEdQuizGame.jsx`:** přepínač zdroje „🌐 Všechny OP/ED“ / „⭐ Oblíbené OP/ED“
na intro obrazovce (volba v localStorage `opq-source`, vysvětlující poznámka pod
ním), `<video>` → `<audio>` (`videoRef` → `mediaRef`), **iframe fallback úplně
odstraněn** (`playMode`, `directBrokenRef`, JSX blok i ~56 řádků `.opq-iframe-*`
CSS) — při chybě přehrávání se použije náhradní kolo jako dřív.

**Ověřeno v prohlížeči:** intro hlásí 1074 / 208 skladeb dle zdroje, volba
přežije reload, přehrává se z `a.animethemes.moe` (`readyState 4`,
`paused: false` → autoplay bez kliknutí), kolo 5/10 běželo s časem 8,76 s,
odhalení + 3 bonusové skupiny fungují, v DOM není žádný iframe.
Lint 0 chyb, produkční build projde (6 s).

**Nové soubory:** `src/utils/journeyCalculations.js` (čisté výpočty),
`src/components/AnimeJourney.jsx` (+ `animeJourney.css`).

**Doplněno 2026-07-19 — počty epizod na kartách:** karta v maximalizovaném
stavu ukazuje u „Nakoukáno“ i počet epizod měsíce (`82,9 h / 199 EP`) a u
„Nejdelší“ počet epizod nejdelšího anime/série (`The Beast Player Erin
(18 h / 50 EP)`). Výpočet: měsíční epizody z history logu parsováním `(Nx)`
(`watchedEpsByMonth`), epizody nejdelšího = součet `episodes` členů série
(`longest.eps`). Tooltip u „Nejdelší“ nově obsahuje i čas+epizody
(`{název} — {h} / {EP}`), ne jen název — řeší čitelnost useknutých dlouhých
názvů. Ověřeno: květen 2026 = 199 EP / 82,9 h, Beast Player Erin 50 EP.

**Napojení AnimeThemes na pipeline (2026-07-19):** `download_animethemes_cache.py`
je zavěšen v `export_data.py` (ř. 1244–1250, před git push, vzor
`download_jikan_cache`/`build_ytmusic_ost`). Běh bez argumentů je inkrementální
přes `.animethemes_cache_partial.json` — stáhne jen nově přidaná anime, jinak
0 requestů a jen přestaví JSON. Partial cache je v rootu appky, do gitu se
nedostane (push bere jen `public/data/*` a `public/images/*`).

**Minimalizovaný stav — redesign na žádost uživatele (2026-07-18):** původní
pás všech měsíců byl moc vysoký a dlouhý. Nyní **jeden kompaktní řádek 66 px**
(nahrazuje výšku smazaného řádku filtru): nadpis vlevo, uprostřed nekonečně
plující lišta koleček, vpravo ⤢. Kolečka jdou po **diagonále se 4 schody**
(navazuje na Excel `STAIR_GROUP_SIZE`), track je zdvojený a animovaný
`translateX(0 → -50%)` pro bezešvou smyčku (délka `max(24, měsíců × 2,4) s`),
oba konce mizí do stínu přes `mask-image` gradient. Naráz je vidět ~9 měsíců.
Hover pauzuje, klik na kolečko maximalizuje **a nascrolluje timeline na daný
měsíc** (`data-month` + `scrollIntoView({inline:'center'})`).
`prefers-reduced-motion` vypíná animaci a povoluje ruční scroll.
**Změny:** `src/pages/Dashboard.jsx` — filtr přesunut k nadpisu, řádek
`.time-filter` odstraněn, mount `<AnimeJourney>` pod tabulkou „Data projekt“,
time-travel logika ve `stats` useMemo (`isFiltered`, `yearStatsFiltered`,
`filteredList`, základ `end_date`).

**Ověřeno proti Excel screenshotům (shoda přesná):** červenec 2026 „+6 (celkem
474)“, Nejlepší Grand Blue Dreaming (7/10), Nejdelší Grand Blue Dreaming (9,6 h);
červen 2026 „+18 (celkem 468)“, Lord of Mysteries Specials (10/10), Berserk (25 h);
květen 2026 Princess Mononoke (9/10), The Beast Player Erin (18 h); červenec 2025
„+32 (celkem 236)“, Tokyo Magnitude 8.0 (10/10), Black Butler (35 h). Typy, žánry
i témata sedí (u shodných počtů se může lišit pořadí — VBA QuickSort není stabilní).

**🐛 Opraven layout bug v `.main-content` (2026-07-18):** timeline roztahovala
celou stránku — `.main-content` je flex položka (`.app-container{display:flex}`)
s `flex: 1` a implicitním `min-width: auto`, takže ji široký obsah natáhl na
plnou šířku okna; spolu s `margin-left: 260px` obsah přetekl přesně o šířku
sidebaru a `overflow-x: clip` uřízl pravou stranu (v maximalizovaném stavu byla
useknutá i tabulka „Data projekt"). Naměřeno při okně 1642 px: `main-content`
1642 px místo správných 1382 px. **Fix:** `min-width: 0` na `.main-content`
(`src/index.css`) + obranné `min-width: 0; max-width: 100%` na `.aj-card`.
Ověřeno na 1642 / 1272 / 375 px: `scrollWidth - clientWidth = 0`, tabulka končí
v ploše okna, timeline scrolluje jen uvnitř sebe (8754 px v 1288 px kontejneru).
Šlo o latentní vadu rozvržení — projevila by ji jakákoli široká komponenta.

**⚠️ Známá odchylka — AniList tagy:** web má systematicky vyšší počty než Excel
(např. čvc 2026: Male Protagonist 5× vs 4×, navíc Swordplay 4×). Příčina: web bere
tagy z cache listu (sloupce BY/BZ, `export_data.py:61-89` → pole `tags`), zatímco
VBA je čte z **komentáře buňky G** (`GetTagsFromComment`) — dva různé zdroje, ne
chyba výpočtu. Ověřeno, že to nejde srovnat procentuálním prahem (zkoušeno 60/70/
80/85 %). Ponechán webový zdroj kvůli konzistenci se zbytkem aplikace
(doporučení, kvíz). Kdyby uživatel chtěl přesnou shodu s Excelem, musel by se
změnit export tagů, ne tento modul.

**Regrese ověřena:** při „Vše“ tabulka vrací identické hodnoty jako před změnou
(2252:34 · 93 dní 20 hodin · 5263 epizod · 25,68 · 43 · 486 · 8,01; roční sloupce
2024/2025/2026 vč. 7,54) — proto si nefiltrovaný pohled záměrně drží původní
základ `start_date`, zatímco filtrovaný počítá podle `end_date`.
Lint: 0 chyb (1 předexistující warning). Konzole: jen známé Jikan 504.

**HANDOFF DOKUMENT** — sepsáno po průzkumu kódu, dat a živých API. Vše označené ✅ je
**ověřený fakt** (kontrola proti souborům/API 2026-07-18), body označené 🔶 jsou
**rozhodnutí s doporučením** (implementátor se může odchýlit jen s dobrým důvodem,
otevřené otázky pro uživatele jsou označené ❓).

Pořadí (aktualizováno po rozhodnutích uživatele 2026-07-18): **Ú1 → Ú3**;
**Ú2 je odloženo** (research hotový v [docs/FUTURES_RESEARCH.md](docs/FUTURES_RESEARCH.md),
vrátíme se k němu později). Ú3 doporučuji rozdělit na dva kroky: nejdřív globální
časový filtr (přesun k nadpisu + refaktor na sdílený filtered dataset), pak modul
Cesta Anime — filtr je předpoklad, Cesta Anime ho už jen konzumuje.

---

## Ú1 — Hra „Hádej OP/ED“ plně přes AnimeThemes.moe

### Současný stav ✅
- Hra: `src/components/opedquiz/OpEdQuizGame.jsx` (452 ř.), `quizEngine.js` (199 ř.), `opedquiz.css`.
- Pool skladeb z `public/data/op_ed_videos.json` — **GDrive knihovna, jen 210 videí**
  (vybrané/oblíbené verze) + metadata z `anime_list.json` přes fuzzy `mediaMatch`.
- Přehrávání: skrytý `<video>` s přímým GDrive URL; při chybě fallback na **rozmazaný
  GDrive iframe** (`playMode === 'iframe'`, `directBrokenRef`, notice „klikni do něj pro ▶“)
  — to je to otravné „spouštění po kliknutí“. Autoplay u přímého URL už funguje
  (spouští se z user gesture Start/Další kolo, `OpEdQuizGame.jsx:111-126`).
- AnimeThemes service už existuje: `src/utils/animeThemesService.js` — dotaz per MAL id,
  `videoScore` (creditless/BD/bez overlapu/penalizace lyrics), dedup TV vs BD.
  Používá se v detailu anime (Plán 6b).
- `anime_list.json`: 488 anime, **488/488 má `mal_url` s MAL id** ✅ (pole `mal_id`
  neexistuje — id se parsuje regexem `/anime/(\d+)` z `mal_url`).

### Cíl
Hra jede **kompletně z AnimeThemes** (celý katalog, ne jen 210 GDrive videí),
vždy autoplay, žádný iframe fallback. Argument uživatele: titulky/vizuál stejně
nejsou vidět (video je skryté), takže verze s lyrics nevadí.

### Návrh
1. **Build-time cache skript** `download_animethemes_cache.py` (vzor:
   `download_jikan_cache.py` + `build_gdrive_op_ed.py` v rootu projektu):
   - Pro každé anime z `anime_list.json`: MAL id z `mal_url` → 
     `GET https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=MyAnimeList&filter[external_id]={id}&include=animethemes.animethemeentries.videos.audio,animethemes.song.artists`
   - Klíčové: include `videos.audio` navíc — AnimeThemes má ke každému videu i
     **audio-only OGG** (`https://a.animethemes.moe/…​.ogg`) — ideální pro hudební
     kvíz (žádný spoiler, zlomek dat).
   - Výběr nejlepší verze: převzít logiku `videoScore` + dedup z
     `animeThemesService.js` (zkopírovat do Pythonu, NEBO skript napsat v Node a
     importovat — 🔶 doporučuji Python, konzistence s ostatními pipeline skripty).
   - Výstup `public/data/animethemes_op_ed.json`:
     ```json
     { "generated": "...", "count": N, "themes": [
       { "mal_id": 40834, "anime_name": "<name z anime_list>", "type": "OP",
         "label": "OP1", "song": "...", "artist": "...",
         "video_url": "https://v.animethemes.moe/….webm",
         "audio_url": "https://a.animethemes.moe/….ogg" } ] }
     ```
   - Rate limit AnimeThemes: uváděno 90 req/min → throttle ~1 s/req, **resumable
     cache** (mezisoubor, přeskočit už stažené) — 488 dotazů ≈ 9 minut jednorázově.
   - Zapojit do stejného workflow, kterým se aktualizují ostatní JSONy (ruční spuštění
     před deployem; NEintegrovat do jikan background downloaderu).
2. **`quizEngine.buildPool`**: nový zdroj `animethemes_op_ed.json`; match na
   `anime_list` podle **MAL id** (přesné, fuzzy `mediaMatch` už není potřeba pro
   pool — `series`/`tags` se dotáhnou z anime_list přes mal_url id mapu).
   Pool naroste z 210 na odhadem 800–1200 skladeb.
3. **Přehrávač** v `OpEdQuizGame.jsx`:
   - `<audio>` (nebo stávající skrytý `<video>`) se `src = audio_url`,
     fallback `video_url` když audio chybí (onError → přehodit src, až pak skip).
   - **Smazat celý iframe fallback**: `playMode`, `directBrokenRef`,
     iframe JSX blok (ř. 310–326), CSS `.opq-iframe-*` v `opedquiz.css`.
   - Autoplay logika beze změny (play() z user gesture funguje).
   - Náhradní kola (spares) ponechat — AnimeThemes taky může mít výpadek.
4. **Přepínač zdroje na intro obrazovce** (rozhodnuto uživatelem 2026-07-18):
   „🌐 Všechny OP/ED“ vs. „⭐ Oblíbené OP/ED“ — vedle výběru počtu kol, stejný
   vizuál jako `.opq-round-btn`, volba persistovat v localStorage.
   - **Všechny** = celý AnimeThemes katalog (`animethemes_op_ed.json`).
   - **Oblíbené** = pool omezený na skladby z GDrive knihovny
     (`op_ed_videos.json`), ale **přehrávat i je z AnimeThemes**: párovat podle
     MAL id + typ + normalizovaný název písně (vzor dedup logiky
     v `animeThemesService.js` / CategoryRatingsPanel z batche 6b). Bez matche →
     fallback přímé GDrive URL, při chybě skip kola (**iframe se nevrací**).
   - Do intro textu doplnit, že hra nově umí hrát ze VŠECH OP/ED všech anime
     v listu; u tlačítka Start ukazovat velikost aktuálního poolu (už tam je).
5. GDrive knihovna jinak zůstává beze změny pro FavoritesOstPlayer/detail anime.
6. ❓ (drobné, rozhodne uživatel při testu): zobrazovat po odpovědi odkaz na
   AnimeThemes video („podívat se na znělku“)? Snadný bonus, navrhuju ano.

### Ověření
Spustit hru: kolo se rozjede samo, žádný iframe, síťový tab ukazuje `a.animethemes.moe`;
schválně zablokovat audio URL → fallback video → skip; zkontrolovat pool size na intru.

---

## Ú2 — Anime Futures (náhrada ruční Excel tabulky)

> **⏸ ODLOŽENO (rozhodnutí uživatele 2026-07-18)** — zatím NEimplementovat.
> Kompletní research včetně všech alternativ (LiveChart, AniChart, Jikan/MAL API,
> AnimeSchedule, Kitsu, hodnocení brAInstorm nápadu) je zapsán v
> [docs/FUTURES_RESEARCH.md](docs/FUTURES_RESEARCH.md). Níže ponechán původní
> návrh pro kontext.

### Zjištění ✅ — Google AI / brAInstorm NENÍ potřeba
Uživatelův nápad (LLM přes brAInstorm parsuje internet) je zbytečně křehký.
**AniList GraphQL API pokrývá celý use-case deterministicky** — ověřeno živě 2026-07-18:

- `Media(search:"Mushoku Tensei III")` → `startDate: 2026-07-04`, status RELEASING
  (Excel má ručně 06.07.2026 — API je přesnější a samo se aktualizuje).
- `Media(idMal:40834)` (Ousama Ranking) → relations obsahuje
  `OTHER | Ousama Ranking Movie | NOT_YET_RELEASED | startDate null`
  — **přesně řádek „Ranking of Kings Sequel / Movie / ?“ z Excel tabulky**, včetně „?“.
- **Batch funguje**: `Page(perPage:50){ media(idMal_in:[…]){ relations{…} } }` ✅
  → celý list 488 anime = **~10 requestů** (AniList limit aktuálně 30 req/min → pohoda).

Hotová online řešení existují (LiveChart.me — sledování franšíz + notifikace;
AniChart.net = frontend AniListu; MAL news), ale nejsou integrovatelná do webu —
vlastní pipeline nad AniList API je správná cesta.

### Návrh
1. **`build_futures.py`** (root, vzor `build_ytmusic_ost.py`):
   - Vstup: `anime_list.json` + `plan_to_watch.json` → množina MAL id (dedup).
   - Batch dotazy `idMal_in` po 50 → z každého media vzít `relations.edges`.
   - **Filtr kandidátů**: `node.status ∈ {NOT_YET_RELEASED, RELEASING}` a
     `node.idMal ∉ vlastní list` a `relationType ∉ {CHARACTER, ADAPTATION, SUMMARY, SOURCE}`
     (SEQUEL, PREQUEL, SIDE_STORY, ALTERNATIVE, SPIN_OFF, OTHER ponechat — Excel
     tabulka obsahuje i movies/specials, což bývá OTHER/SIDE_STORY).
     RELEASING zařadit jen pokud v listu není (právě běžící sequel, který ještě nezačal sledovat).
   - Node fields: `idMal, title{romaji english}, format, status,
     startDate{year month day}, episodes, coverImage{large}, siteUrl` + z které
     položky listu relace vede (`source_anime`).
   - **Dedup** (S01 i S02 ukazují na stejný sequel → jeden záznam, sources sloučit).
   - **Overrides** `futures_overrides.json` (vzor `ytmusic_ost_overrides.json`):
     blocklist id (false positives — recap filmy apod.) + ruční záznamy
     (oznámení, které AniList ještě nemá).
   - Výstup `public/data/futures.json`.
2. **UI**: 🔶 doporučuji sekci „Futures“ v tabu **Plán** (`PlanToWatch.jsx`) —
   v Excelu je to tentýž list („ANIME PLAN TO WATCH + FUTURES“). ❓ potvrdit
   (alternativa: samostatný tab).
   - Řazení jako Excel: známá data vzestupně, potom „?“ položky.
   - Header: „Futures: **N** Anime · **M** vychází do 3 měsíců“ (M zeleně).
   - Řádek/karta: poster (coverImage), název, badge typu (TV modrá / Movie fialová /
     Special žlutá — barvy z Excelu), datum („červenec 2026“ při znalosti jen měsíce,
     `06.07.2026` při plném datu, jinak „?“), countdown „za X dní“, odkaz na
     AniList, malý text „navazuje na: {source_anime}“.
3. **Refresh**: ručně spouštěný skript jako ostatní pipelines. Do JSON dát
   `generated` timestamp a v UI zobrazit „data z DD.MM.“.
4. Ověření: porovnat výstup se screenshotem Excel tabulky (65 futures) — očekává se
   velký překryv; rozdíly řešit přes overrides, ne hardcode.

---

## Ú3 — Dashboard: „Cesta Anime“ místo řádku časového filtru

### Současný stav ✅
- Řádek filtru: `Dashboard.jsx:2999-3028` (`.time-filter`), label
  „📅 Časový filtr (pro grafy):“, select Vše/roky/vlastní rozsah.
- `timeFilter` state (ř. 708) vstupuje do velkého `stats` useMemo (ř. ~864-1099)
  → dnes filtruje **jen grafy**.
- ✅ **ROZHODNUTO (uživatel 2026-07-18)**: filtr přesunout **vedle nadpisu
  „Dashboard“** (do page-header řádku, kompaktní select + date inputy u custom)
  a povýšit na **globální filtr celého tabu Dashboard** — sémantika
  „cestování časem“: vlastní rozsah např. 2019 – 01.07.2025 znamená *„zobraz
  dashboard, jako by dnešek byl 01.07.2025 (a historie začínala 2019)“*.

**Globální filtr — co přesně filtruje** (T0 = začátek rozsahu, T1 = konec):
- **Tabulka „Sledovaná data“**: všechny řádky počítat jen ze záznamů s datem
  v ⟨T0, T1⟩; roční sloupce ukázat jen roky protínající rozsah.
- **Status**: „Právě sledované“ odvodit z dat — anime se `start_date ≤ T1` a
  (`end_date > T1` nebo bez `end_date`); počítadlo „X/Y Finished“ = dokončená
  do T1 / anime započatá do T1. „Plánované“ nemá historická data (plan_to_watch
  je aktuální stav) → při aktivním filtru skrýt s poznámkou. **Kalendář vysílání
  a Jikan live data (postery/EP čísla u Právě sledovaných) jsou inherentně
  „teď“** → při aktivním filtru tuto část skrýt/ukázat hlášku „filtr se
  nevztahuje na živá data“ (🔶 doporučuji skrýt kalendář, když T1 < dnešek).
- **Poslední & Binge & Nejdelší**: počítat jen z `history_log`/anime s datem
  v ⟨T0, T1⟩ („Poslední“ = poslední před T1).
- **Grafy**: beze změny logiky (už filtrují), jen napojit na nový globální state.
- **Cesta Anime** (níže): zobrazit jen měsíce v rozsahu; „celkem N Anime“
  running total ale počítá i historii před T0 (stejně jako VBA runningTotal —
  jinak by čísla neseděla s Excelem).
- Implementačně: jeden useMemo nahoře vyrobí `{filteredAnimeList,
  filteredHistory, T0, T1, isFiltered}` a všechny sekce konzumují tohle —
  žádné per-sekce datumové podmínky roztroušené po 3300řádkovém souboru.
- Default „Vše“ se musí chovat **identicky jako dnes** (regresní kontrola).

### Zdroj logiky ✅ — VBA `LIST_Watch_Overview.txt` (V22, plně analyzován)
Generuje měsíční boxy: „červenec 2026: **+6** (celkem 474 Anime)“ + Nejlepší Anime,
Nejdelší Anime, top 3 typy/žánry/témata, top 6 AniList tagů.

**Hierarchie výběru „Nejlepší Anime“** (převzít 1:1):
1. **PRIORITA 1 — TOP 10** (web: `top_favorites.json → top10_anime` ✅, v Excelu
   shapes Alt-texty): od ranku 1 po 10, série vyhrává v měsíci svého **prvního
   výskytu**, každá jen jednou (paměť vítězů).
2. **PRIORITA 2 — HM** (web: `top_favorites.json → hm_anime` ✅): shoda podle názvu
   série (s kontrolou prvního výskytu) nebo přímo názvu anime (standalone, bez
   kontroly). 1 kandidát = vítěz; víc kandidátů = běžná logika jen nad nimi.
3. **PRIORITA 3 — běžná logika**: (a) winner-by-count: série s nejvíce díly na max
   hodnocení měsíce, (b) outlier: díl série o ≥2 body nad druhým nejvyšším dílem
   vyhrává sám, (c) série se ≥2 díly hodnocenými ≥ nejlepší standalone → série
   (průměr), (d) jinak nejlépe hodnocený standalone. Série s 1 dílem v měsíci
   se počítá jako standalone.

**Mapování dat Excel → web** ✅:
| Excel | Web |
|---|---|
| komentář sloupce C „Název série:“ | `anime_list.json → series` (čistší!) |
| sloupec M datum dokončení | `end_date` |
| sloupce D/H/G/K/I/J | `type`/`genres`/`themes`/`rating`/`episodes`/`episode_duration` |
| komentář G AniList tagy | `tags` (formát `"Tag:95:popis;…"` — parsovat jako quizEngine `splitNames`) |
| TOP10/HM shapes | `top_favorites.json` |
| — | `history_log.json` ✅ 1156 záznamů `{name, episodes:"(6x) EP 7-12", time:"143 min (2,4 hod)", date, rewatch}` |

Statistiky: typy limit 3 (bez delimiteru), žánry/témata limit 3 (`;`), tagy limit 6
s **exkluzí** názvů, které už vyhrály v žánrech/tématech. Nejdelší = max
`episodes × episode_duration` (série = součet dílů v měsíci).

### Odpovědi na 5 otevřených bodů uživatele (🔶 můj názor, zapracovat)
1. **První výskyt HM/TOP10 vs. pozdější nový díl**: na webu počítat
   `seriesFirstAppearance` = **nejstarší `end_date` kteréhokoli dílu série v celém
   `anime_list`** (vždy celá historie, bez ohledu na zobrazený filtr — VBA to dělá
   stejně). Vítězný měsíc je tím zafixovaný; pozdější speciál/nový díl/rewatch
   (`rewatches` pole ignorovat) nic neposune. Deterministické — každý přepočet dá
   stejný výsledek, žádná perzistentní „paměť“ není potřeba (paměť vítězů se
   naplní průchodem měsíců od začátku historie).
2. **Označení série vs. standalone**: ano, data jsou (`series`) — badge
   „SÉRIE“ / „STANDALONE“ u Nejlepšího anime na kartě.
3. **Podobné průměry → tiebreakery + NOVÁ VRSTVA „detailní hodnocení“**
   (doplněno uživatelem 2026-07-18): do hierarchie přidat další layer nad
   epizodovým/kategorickým hodnocením (`episode_ratings.json`,
   `category_ratings.json`). **Problém: anime dokončená před srpnem 2025 detailní
   hodnocení nemají.** 🔶 Můj názor a návrh řešení:
   - Vrstvu použít **jen jako tiebreaker uvnitř měsíce, a jen když ji mají VŠICHNI
     porovnávaní kandidáti** — nikdy nesrovnávat detailní číslo jednoho kandidáta
     s „nic“ druhého (systematicky by zvýhodňovalo novější anime). Boxy porovnávají
     anime dokončená v tomtéž měsíci, takže od srpna 2025 dál vrstva funguje
     prakticky vždy, před ním se tiše přeskočí — asymetrie skoro nekouše.
   - Pořadí při remíze celkových průměrů (rozdíl ≤ **0,2 bodu**):
     (a) vážený průměr kategorií z `category_ratings.json`,
     (b) nejvýše hodnocený díl z `episode_ratings.json`,
     (c) víc dílů na max hodnocení, (d) víc zhlédnutých hodin (history_log).
     U remízy standalone vs. série preferovat sérii.
   - **Zpětné doplnění starých anime neřešit** (dat není odkud vzít); pokud
     uživatel časem doplní detailní hodnocení starším anime, vrstva se jich
     začne týkat automaticky — žádný hardcoded datum-cutoff do kódu nedávat,
     rozhoduje jen přítomnost dat.
   - UI: když o vítězi rozhodla detailní vrstva, malá ikona 📊 s tooltipem
     („rozhodlo detailní hodnocení: kategorie Ø 9,1 vs 8,9“).
   - Prahy vytáhnout jako konstanty vedle `OUTLIER_RATING_THRESHOLD = 2`.
4. **Nejdelší anime se během sledování nezapisuje**: příčina = Excel počítá jen
   dokončená (datum ve sloupci M). Řešení na webu: „Nejdelší Anime“ ponechat pro
   dokončená (kompatibilita), ale **přidat řádek „Nakoukáno: X h“ z
   `history_log.json`** (součet `time` za měsíc) — roste průběžně i u rozkoukaného
   anime a řeší pocit „chybí mi to tam“.
5. **Weekly anime leden–březen padne do března**: **ponechat** přiřazení podle
   měsíce dokončení pro `+N`, „celkem“ i výběr Nejlepšího (jinak se rozbije running
   total a konzistence s Excelem). Hodiny z history_logu (bod 4) se přirozeně
   rozprostřou do správných měsíců — tím je zohledněno, že se koukalo dřív.
6. (Cache listy pro rychlost — z Excel seznamu): na webu **není potřeba** — výpočet
   nad 488 anime + 1156 log záznamů v `useMemo` je instantní. Kdyby někdy ne,
   předpočítat v `export_data.py`.

### UI návrh
- **Nová komponenta** `src/components/AnimeJourney.jsx` + čisté výpočty v
  `src/utils/journeyCalculations.js` (bez Reactu, stejný vzor jako
  `quizEngine.js` — snadno testovatelné; exportovat i mezivýsledky pro debug).
- **Minimalizovaný stav** (výška ≈ odstraněný filtr řádek, aby Status/Poslední…
  zůstaly vizuálně na místě): horizontálně scrollovatelný pás měsíčních chipů
  „čvc 26 **+6**“ + mini thumbnail nejlepšího anime; scroll doprava = nejnovější
  (default). Klik na chip nebo tlačítko ⤢ = maximalizace.
- **Maximalizovaný stav** (vzor: maximalizace Status okna přes `DashboardGroup`):
  horizontální timeline karet po měsících, šipky/scroll. Karta měsíce:
  - hlavička „červenec 2026: **+6** (celkem 474 Anime)“ (+N zeleně jako v Excelu),
  - **Nejlepší Anime**: thumbnail (`anime_list.thumbnail`, formát
    `images/anime/….jpg` ✅) + název + hodnocení + badge SÉRIE/STANDALONE
    + malá ikona proč vyhrál (🏆 TOP10 / 🎖 HM / ⭐ běžná logika — tooltip),
  - Nejdelší Anime (h) + **Nakoukáno: X h** (history_log),
  - chips: typy (3), žánry (3), témata (3), AniList tagy (6, s exkluzí),
  - **strip mini-posterů všech anime dokončených v měsíci** (klik → detail anime;
    hover = název + hodnocení).
- Časový rozsah: řídí ho **globální filtr Dashboardu** (viz výše) — default „Vše“
  = všechny měsíce od začátku historie; žádný vlastní filtr uvnitř modulu, jen
  scroll; roční předěly vizuálně oddělit. Running total „celkem“ vždy zahrnuje
  historii před začátkem rozsahu.

### Ověření
Porovnat vygenerované karty s Excel boxy ze screenshotu (červenec 2025 – červenec
2026): +N, celkem, Nejlepší/Nejdelší a top položky se musí shodovat tam, kde se
neliší záměrně (tiebreakery bod 3, „Nakoukáno“ je nové). Odchylky vypsat a zdůvodnit.

---

## Poznámky pro implementátora
- Konvence projektu: komponenty izolované (vzor opedquiz), komentáře česky, čisté
  výpočty oddělené od Reactu, data-pipeline skripty v Pythonu v rootu s cache/overrides.
- Po každém úkolu ověřit v prohlížeči (dev server přes preview), ne jen build.
- Ú3 se dotýká obřího `Dashboard.jsx` (3311 ř.) — novou logiku NEpřidávat do něj,
  jen mount komponenty místo `.time-filter` bloku.
