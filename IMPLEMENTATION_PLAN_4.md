# Implementační plán 4 — „Plán pro Claude" (verze z 11. 7. 2026, odpoledne)

Čtvrtá dávka úprav z `Plán pro Claude.docx`. 7 úkolů, 5 referenčních obrázků
(zkopírovány do `docs/plan4-images/`). Předchozí dávky: `IMPLEMENTATION_PLAN.md`
(18), `IMPLEMENTATION_PLAN_2.md` (14), `IMPLEMENTATION_PLAN_3.md` (11).
Úkoly 4, 5 a 7 navazují na B3-9, B3-10 a B3-11 z batch 3 (B3-9 měl přípravné
komentáře v kódu, ale zakotvení hlaviček reálně nefunguje — ověřit živě).

---

## Úkol 1 — Optimalizace přechodu rozcestník → Série / Jednotlivě
**Stránka:** `AnimeRatings.jsx` — přepínání `viewMode` `'split'` →
`'individual'`/`'series'` (řádky ~2293–2469). Už používá `useTransition` +
`.choice-loading` dim (batch 2), přesto je cítit lag.

**Cíl:** Výrazněji zrychlit přechod, bez rozbití funkcí.

**Postup:**
1. Profilovat v prohlížeči (Performance / React profiler přes
   `react-dom/profiling` není nutný — stačí `performance.now()` sondy +
   DevTools trace): co přesně blokuje — mount celého view (stovky
   selector-item divů + grafy + radar), nebo výpočty v useMemo?
2. Kandidátní opatření (kombinovat dle profilace):
   - odložený mount těžkých panelů: první paint jen kostra (selector +
     prázdné panely), grafy/radar mount až v `requestIdleCallback` /
     druhém raf ticku (staged mounting s `contentVisible` state);
   - `content-visibility: auto` na dlouhé seznamy selectoru;
   - memoizace položek seznamu (React.memo na selector item);
   - ověřit, že všechny Chart.js instance mají `animation: false` (batch 2
     to zavedl — zkontrolovat nové grafy);
   - případně virtualizace seznamu anime (jen pokud profilace ukáže, že
     je to dominantní).
3. Regresní kontrola: přepínání Série ↔ Jednotlivě ↔ Rozcestník, výběr
   anime/série, žádné zmizelé panely.

## Úkol 2 — „Spojitý vývoj hodnocení epizod" vizuálně jako graf v detailu
**Stránka:** `AnimeRatings.jsx` — panel „Spojitý vývoj hodnocení epizod"
(JSX ~2676–2728, `timelineChartData` ~1145, `timelineOptions` ~1452).
**Vzor:** `AnimeDetail.jsx` — karta „Hodnocení epizod" (JSX ~893–948,
`episodeChartData` ~224, `barOptions` ~312, dynamická osa `epChartMin/Max`
~287).
**Obrázky:** `plan4-images/image1.png` (současný stav v sérii),
`plan4-images/image2.png` (vzor z detailu).

**Zachovat (specifika série):** filtr zdroje hodnocení (Moje/MAL/IMDb),
checkbox Trendová čára, `seasonBoundariesPlugin` (oddělení dílů, S1/Specials
pásy), klik na bod → detail epizody v pravém panelu.

**Převzít z detailu:**
- průměr v titulku: „Spojitý vývoj hodnocení epizod (Průměr: X)" — počítat
  z aktivního zdroje (pro Moje z `seriesTimelineData`);
- barevná legenda úrovní (Absolute Cinema / Awesome / Great / Good /
  Regular / Bad) vpravo v hlavičce — stejné barvy jako v detailu;
- info text „Faktické rozbory epizod byly vygenerovány AI… Kliknutím na
  bod…" (zobrazit jen když série má DOCX rozbory);
- dynamický rozsah osy Y podle dat (jako `epChartMin/epChartMax`;
  pro MAL zdroj škálu /2 zachovat);
- kurzor pointer nad body s rozborem (onHover jako v detailu);
- formát tooltipu sjednotit (📝 titul z DOCX už série má).

**Pozor:** hlavička panelu už obsahuje filtr+checkbox — legendu a průměr
vměstnat tak, aby se to nerozbilo na užších šířkách (flex-wrap).

## Úkol 3 — Odstranit slider hlasitosti z modalu OP/ED videí
**Komponenta:** `CategoryMediaPlayers.jsx` → `VideoModalInner` (řádky
~82–128): 🔊 range input + `VIDEO_VOLUME_KEY` localStorage + sync efekt.
Modal se otevírá z tabulky OP/ED ve `Favorites.jsx` (`<VideoModal …>`).

**Cíl:** Elegantně odstranit ovládání hlasitosti (uživatel: „je stejně
nefunkční" — v iframe fallbacku je disabled a u direct videa má `<video
controls>` vlastní volume). Odstranit: label+input, `volume` state,
`handleVolumeChange`, sync useEffect, `VIDEO_VOLUME_KEY` čtení/zápis
(pozn.: klíč `opq-volume` sdílí i opedquiz — tam NEsahat, jen v tomto
modalu). `onLoadedMetadata` nastavování volume vypustit. Nic dalšího
neměnit (autoplay/fallback logika zůstává).

## Úkol 4 — Zakotvení hlavičky pro tabulky „OST Only (The Best)" a „OST + Scenes"
**Stránka:** `Favorites.jsx` (~1654–1725). Tabulka OP/ED zakotvení má;
OST tabulky ne. Z batch 3 tu zbyly komentáře „Bez overflow: hidden —
rozbíjelo by sticky thead", ale sticky reálně nefunguje.

**Postup:**
1. Ověřit v prohlížeči, proč globální `thead { position: sticky; top: 0 }`
   (index.css ~436) u těchto dvou tabulek nefunguje — kandidáti:
   ancestor s `overflow` (flex wrapper, `.table-container` má na
   ≤1024px `overflow-x: auto`), `border-radius` wrapper, nebo top offset
   (tabulky jsou hluboko na stránce, sticky top:0 vůči scroll kontejneru
   `.main-content`?). Porovnat s fungující OP/ED tabulkou.
2. Opravit minimálně invazivně (stejný mechanismus jako OP/ED tabulka),
   vč. zaoblených rohů hlavičky a témat (theme overrides na
   `.table-container` existují pro 6 témat).
3. Ověřit obě tabulky + regresi OP/ED tabulky.

## Úkol 5 — Nová sekce rozborů pro anime bez detailního hodnocení
**Stránky:** `AnimeDetail.jsx` + datový pipeline `export_docx_categories.py`.
**Obrázek:** `plan4-images/image3.png` (Made in Abyss — detail bez sekcí
hodnocení).

**Analýza (hotová):** Rozbory tečou z read-only složky
`C:\AL\...\Vytvořené faktické rozbory\*.docx` přes `export_docx_categories.py`
do `public/data/category_texts.json` ({anime: {Kategorie: text, story,
episodes: {n: {title, text}}}}). **Root cause datové mezery:** exportér
iteruje jen `category_ratings.json` (anime s detailním hodnocením) →
Made in Abyss (+ 2 další MiA díly) mají DOCX, ale do JSON se nikdy
nedostanou. Web pak nemá co zobrazit.

**Postup:**
1. **Exportér:** iterovat přes `anime_list.json` (všechna anime) místo
   jen `category_ratings.json` — zachovat matching (clean/normalized key)
   i SPECIAL_FILE_HEADINGS. Read-only přístup ke zdrojové složce dodržet.
   Přegenerovat `category_texts.json` + bump metadata verze.
2. **UI (AnimeDetail):** když anime nemá `categoryRatings` ani
   `episodeRatings`, ale má záznam v `category_texts.json`, vykreslit
   novou menší kartu (např. „Faktické rozbory (AI)") mezi hero a Historií
   sledování:
   - tlačítko/chipy kategorií → otevře modal s rozborem kategorie
     (reuse `CategoryDetailModal` z `CategoryRatingsPanel.jsx`, případně
     jeho lehčí variantu — bez ratingů);
   - seznam/dropdown epizod s DOCX rozborem → `EpisodeDetailModal`
     (už existuje v AnimeDetail, jen mu chybí rating — zobrazit bez něj);
   - AI disclaimer text jako jinde.
   Sekce se NEzobrazuje u anime, která detailní hodnocení mají (tam už
   jsou plné sekce).
3. Ověřit na Made in Abyss (po přegenerování JSON) + na anime bez DOCX
   (sekce se nesmí objevit) + regrese anime s plným hodnocením.

## Úkol 6 — Špatné názvy epizod v „Epizody" seznamu (série)
**Stránka:** `AnimeRatings.jsx` — pravý panel „Epizody" (STAV A, ~2848–2916),
zdroj `jikanEpisodes` (useEffect ~695–773, `ep.title` z Jikan cache;
synthetic fallback „Epizoda N").
**Obrázky:** `plan4-images/image4.png` (SPECIALS EP 1–3 ukazují „Lord of
Myste…" místo názvů), `plan4-images/image5.png` (detail téže epizody má
správný titul „City of Silver" z DOCX).

**Root cause (hypotéza k ověření živě):** Jikan pro entry „Lord of
Mysteries Specials" vrací generické tituly (= název anime), zatímco DOCX
rozbory (`category_texts.json` → „Lord of Mysteries Specials".episodes,
3 záznamy) správné názvy mají.

**Cíl:** Univerzální oprava — v seznamu preferovat smysluplný titul:
pokud Jikan titul chybí nebo je generický (== animeName / začíná názvem
anime / == cleanSeasonName), použít titul z DOCX rozboru
(`categoryReviews[ep.animeName]?.episodes?.[ep.mal_id]?.title`), očištěný
od prefixu „Epizoda N: " a případného „(Premiéra …)". Fallback řetěz:
Jikan → DOCX → „Epizoda N". Ověřit i na jiných sériích se specials
(projít data: entry s episodes v category_texts vs. jikan_cache tituly).

## Úkol 7 — Mobilní audit stěžejních částí (PC verze beze změn!)
**Až po dokončení 1–6.** Přes `resize_window` (375×812) projít:
Dashboard, Anime List + detail (vč. nové sekce z úkolu 5), Anime
hodnocení (rozcestník, série, jednotlivě — graf z úkolu 2), Favorites
(tabulky z úkolu 4, video modal z úkolu 3), History Log, Top Favorites.
Nálezy opravit **výhradně v media queries** (max-width breakpointy) —
žádná změna PC layoutu. Po opravách kontrola desktop viewportu (1280×800),
že se nic nezměnilo.

---

## Doporučené pořadí implementace
3 (triviální) → 4 (CSS fix) → 6 (data/titulky) → 2 (graf) → 1 (perf,
vyžaduje profilaci) → 5 (exportér + nová sekce) → 7 (mobil, poslední).
Po každém úkolu browser verifikace; lint na konci.
