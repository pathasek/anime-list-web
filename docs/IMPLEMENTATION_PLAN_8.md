# Implementační plán 8 — Adaptivní hero obrázky, kalendář vysílání, oprava MAL statistik (2026-07-15)

Zadání z „Plán pro Claude.docx" (3 úkoly).

---

## Ú1 — Dynamický (neořezaný) hero obrázek

**Problém:** velký obrázek v detailu anime (a v hlavičkách tabu Hodnocení) byl
zamčený na 16:9 + `object-fit: cover`, takže vyšší obrázky (např. Mushoku
Tensei 800×689) se ořezávaly. Tab Anime List se dle zadání nemění.

**Řešení (čisté CSS, bez JS měření):**
- Kontejner: `aspect-ratio: 16/9` zůstává jako **minimum**, `align-self: stretch`
  ho nechá vyrůst až na výšku sousedního info sloupce, `position: relative`.
- Obrázek: `position: absolute; inset: 0; margin: auto; width: 100%;
  height: auto; max-height: 100%; object-fit: cover`.
  - přirozený poměr stran → nižší než dostupné místo = zobrazí se **celý**, centrovaný;
  - vyšší než dostupné místo = ořízne se jen zbytek (cover);
  - absolutní pozice → obrázek **neovlivňuje výšku řádku** (řádek určuje info sloupec,
    minimálně 16:9 přes aspect-ratio kontejneru);
  - nikdy se neroztahuje NAD přirozenou výšku (dřívější problém stretch+cover na `<img>`).
- Radius/border/stín přesunuty z kontejneru na `<img>` — roztažený kontejner je
  průhledný a stín by jinak vykreslil „duchový" rám okolo prázdného místa.

**Dotčená místa:**
- `src/index.css` → `.hero-image-container` (+ nový `.hero-image-container img`),
  `src/pages/AnimeDetail.jsx` (odstraněn inline styl imgu).
- `src/pages/AnimeRatings.css` → nový `.series-header-poster-frame` (`-lg` 280px,
  `-xl` 320px) + mobilní pravidla; `src/pages/AnimeRatings.jsx` — obrázek v hlavičce
  Série i Jednotlivě obalen do frame. Placeholdery (🎬) zůstávají na starých třídách.
- **Mobil (<768px) beze změny** — pevné 16:9 (záměr, vysoké postery by jinak zabraly
  celou obrazovku).

**Ověřeno:** detail Mushoku S01P2 — kontejner 452×748 (výška info sloupce), obrázek
452×389 celý + centrovaný (dřív ořez na 254px). Hodnocení/Série 280×223 → img 158px;
Jednotlivě 320×371 → img 181px. Mobil drží 16:9.

---

## Ú2 — Dashboard: kalendář vysílání v maximalizovaném okně Status

**Nová komponenta `AiringCalendar`** (`src/pages/Dashboard.jsx`):
- Mini měsíční kalendář (Po–Ne, cs locale), navigace ‹ měsíc ›, klik na název
  měsíce = návrat na aktuální; dnešek zvýrazněný.
- Události na dnech (chips s malým MAL posterem + „EP n", klik → detail anime):
  - **Odvysíláno** (šedé) — z Jikan episode listu (IndexedDB cache, TTL 24 h),
  - **Další díl** (zelené, glow) — nejbližší budoucí díl (episode list nebo broadcast),
  - **Odhad** (indigo, čárkovaný) — týdenní projekce z pravidelného vysílacího času
    (`getNextBroadcastDate`, JST→lokální), horizont 10 týdnů; dedupe podle dne,
    číslování navazuje na poslední známý díl. Celková délka série není z Jikanu
    známá, proto jde o označený odhad.
- Legenda dole; „Načítám vysílací data…" dokud se plní z fronty Jikan requestů.

**Layout maximalizovaného Status okna** (`.status-content`, `src/index.css`):
- ≥1250px: 3 sloupce `kalendář (1.3fr) | Právě sledované (1fr) | Pending (0.8fr)`,
  vše 520px → vejde se na obrazovku.
- <1250px: kalendář přes celou šířku, oba seznamy pod ním vedle sebe; <768px 1 sloupec.
- **Právě sledované** (postery + Ø/Last skóre, data dílů, broadcast) i **Pending**
  (MAL postery) zachovány beze změny — jen se zúžily.

**Ověřeno:** 1680px → 3 sloupce (538/414/331 × 520px); 956px → kalendář full-width;
červenec 24 událostí (8 aired / 9 next / 7 odhad), srpen 31 (projekce); navigace
měsíců funguje; konzole bez chyb.

---

## Ú3 — Recommendations: oprava hover statistiky hodnocení

**Příčina:** Jikan endpoint `/anime/{id}/statistics` je **rozbitý upstream** — vrací
`504 BadResponseException „Jikan failed to connect to MyAnimeList"` i pro
nejpopulárnější anime (MAL blokuje scraping stats stránek), zatímco ostatní endpointy
fungují. S „persistent jikan services" to nesouviselo, jen se to časově potkalo.

**Oprava (`ScoreDistributionTooltip` → `fetchScoreStats`):**
1. Jikan statistics se zkusí **jedním pokusem** (kdyby endpoint zase ožil, MAL data
   mají přednost — bez 7s backoff čekání).
2. Fallback: **AniList GraphQL** `Media(idMal:…){ stats { scoreDistribution } }` —
   skóre 10–100 po desítkách mapováno na 1–10, votes = amount.
3. Jednotný tvar `{ scores, total, source }`; hlavička tooltipu ukazuje zdroj:
   „Statistika hodnocení (AniList/MAL)". Cache per malId zachována.

**Ověřeno:** hover na „6,89/10" (The Faraway Paladin) → „Statistika hodnocení
(AniList): (36,7 tis. uživatelů)" + ASCII bar rozložení 10→1.

---

## Stav

- [x] Ú1 — adaptivní hero obrázky (detail + Hodnocení Série/Jednotlivě)
- [x] Ú2 — kalendář vysílání ve Status okně
- [x] Ú3 — hover statistika hodnocení (AniList fallback)

Pozn.: eslint změněných souborů nepřidal žádnou novou chybu (existující nálezy
jsou předchozí; jedna unused var v Recommendations odstraněna).

---

## Kolo 2 (follow-up, 2026-07-16)

### F1 — Statistika hodnocení: MAL vždy primárně + nový vizuál
- Ověřeno v gitu: původní tooltip (commit 1e215ee, 2026-03-25) používal TENTÝŽ
  Jikan endpoint — zdroj byl vždy MAL a rozbil se upstream (u Jikanu).
- **Finální diagnóza (2026-07-16):** MAL stats stránka EXISTUJE a funguje —
  ověřeno v prohlížeči (`/anime/5114/…/stats` → Score Stats 10: 48,7 % /
  1,13 M hlasů) a curl testem dokonce i přes Jikanův vlastní URL formát
  s fake slugem (`/anime/5114/jikan/stats` → Score Stats OK; zdroj formátu:
  jikan-me/jikan `AnimeStatsRequest.php`). Selhání je tedy na straně Jikanu:
  **MAL/Cloudflare blokuje requesty z Jikan serverů** — 504 tělo doslova říká
  „MyAnimeList … refuses to connect". Veřejně datovatelné stopy: série
  jikan-rest issues o „failed to connect" #578 (6. 3.), #582 (12. 4.),
  #595 (21. 5.), #607 (21. 6.) a #610 (10. 7. 2026, otevřené) — poslední
  časově sedí na výpadek tooltipů (~9. 7.). /statistics umírá jako první,
  protože se scrapuje na vyžádání, zatímco ostatní endpointy Jikan servíruje
  ze své DB cache. Žádné oficiální oznámení MAL neexistuje (anti-bot změny
  neoznamují). Až blokace pomine, tooltip se díky Jikan-first pořadí
  automaticky vrátí k MAL datům bez zásahu do kódu.
- `fetchScoreStats`: Jikan se zkouší **naplno** (3 retry + backoff, priority
  high) — jakmile endpoint ožije, tooltip automaticky zase ukazuje MAL data.
  AniList je jen viditelně označený fallback (badge „AniList" + title
  s vysvětlením). Circuit breaker `_jikanStatsDown`: po prvním úplném selhání
  v session jdou další hovery rovnou na AniList (žádné ~10s čekání na backoff).
- Nový vizuál `.rec-stats-tooltip-v2`: skutečné CSS bary (gradient
  z `--rating-N` barev), badge zdroje (MAL modrá #2e51a2 / AniList #3db4f2),
  zvýrazněný řádek s nejvíc hlasy, tabular-nums. Odstraněn try/catch render
  s ASCII bloky.

### F2 — Návrat z detailu vrátí Dashboard „do minulosti"
- `expandedGroups` se persistují v `sessionStorage['dashboard-expanded-groups']`
  (init v useState, zápis v toggleGroup).
- Scroll: průběžné ukládání přes rAF-throttlovaný scroll listener do
  `sessionStorage['dashboard-scroll']` — ukládat až v unmount cleanupu NEJDE,
  prohlížeč scroll ořízne na 0 dřív (nová stránka je zprvu krátká). Obnova jen
  při `useNavigationType() === 'POP'` (tlačítko zpět), 120 ms + pojistný druhý
  pokus v 600 ms. Dopředná navigace beze změny; tlačítko Zpět nedotčeno
  (navigate(-(detailDepth+1)) funguje — ověřeno klikem: scroll 619→619,
  kalendář otevřený a plný).

### F3 — Kalendář: okamžité znovuotevření + „nezhlédnuto"
- Module cache `_airingCalCache` (klíč = seřazené názvy+watchedEps, TTL 10 min):
  useState initializer vykreslí kalendář OKAMŽITĚ z cache (ověřeno: 31 chipů
  150 ms po rozbalení), starší data se tiše obnoví na pozadí.
- **Nalezená skutečná příčina pomalosti:** background downloader v jikanService
  padal od commitu 4a28ee3 (2026-07-08) na ReferenceError — používal nikdy
  nedefinované helpery `animeAgeMs` / `shouldRefreshRecord` / `contentSignature`
  / `EP_FRESH_ANIME_MS`. Doplněny (mladá anime < 1 rok → recheck měsíčně
  s backoff dle unchangedStreak, stará permanentně; signature = hash JSONu)
  + try/finally, ať pád nenechá `_downloadRunning` viset. Downloader zase běží
  (ověřeno v IDB: state running, 376/486).
- Nové druhy událostí + legenda: `aired` Zhlédnuto (šedá) · `unseen`
  Odvysíláno·nezhlédnuto (jantar, podle watchedEps) · `next` Další díl (zelená)
  · `plan` Naplánováno (indigo plná) · `proj` Odhad (indigo čárkovaná).

### F4 — Přesná čísla a data epizod
- Budoucí díly z **AniList airingSchedule** (batch GraphQL dotaz pro všechna
  sledovaná anime najednou; 404-batch kuriozita → rozpad na jednotlivé dotazy):
  reálné číslo dílu + přesný unix čas vysílání → lokální datum i čas.
  Jikan /episodes budoucí díly typicky nezná — proto dřív „EP 1 pro Mushoku
  19.07."; teď správně **EP 4 • 19. 7. 2026 17:00**.
- Broadcast projekce zůstává jen jako fallback bez AniList rozvrhu a čísluje
  od `max(poslední známý díl, zhlédnuté díly) + 1`.
- `getOrFetchEpisodeList` má nový param `priority` — kalendář fetchuje 'high'
  (předbíhá downloader ve frontě).

### F5 — Kalendář: nic se nemaže, postupná aktualizace + odvysílané díly (2026-07-16)
- **Chybějící nedávno odvysílané díly** (prázdná středa 15. 7.): AniList se
  nově ptá i na ODVYSÍLANÉ díly (`airedSchedule: airingSchedule(notYetAired:
  false, perPage: 50)` + guard `pageInfo.hasNextPage` pro >50dílné
  long-runnery) — Jikan /episodes má u probíhajících sérií zpoždění.
  Sjednocený builder `buildAnimeEvents`: epMap číslo dílu → {ts, exact};
  AniList (přesné časy) má přednost, Jikan doplní zbytek, broadcast projekce
  jen bez budoucího rozvrhu. Ověřeno: 15. 7. = Tanya EP 2 14:30, Bumpkin EP 2
  16:45, Tomb Raider King EP 2 18:15, vše „odvysíláno·nezhlédnuto".
- **Persistence & postupné přepisování**: události per-anime
  (`animeEvents[name] = ev[]`) v module cache + `localStorage
  ['dashboard-cal-events-v2']` → po refreshi stránky se kalendář vykreslí
  OKAMŽITĚ z poslední známé podoby (ověřeno: 41 chipů za 286 ms) a pak se
  aktualizuje ve 2 fázích: FÁZE 1 bez sítě (AniList batch + IndexedDB +
  localStorage) přepíše vše hned, FÁZE 2 sekvenčně síťově doplní jen anime
  se zastaralou cache (>24 h) — chip po chipu, nic nebliká/nemizí. Totéž
  „Právě sledované": `jikan_airing_stats_{malId}` v localStorage (TTL 15 min,
  tichý refresh, žádné „Načítám…" po refreshi).
- **Jikan fronta**: (1) dedup souběžných dotazů na tentýž episode list
  (`_epListInflight` — kalendář i Právě sledované žádají stejná malId),
  (2) 429 cooldown — po rate-limitu se zdrží celá fronta místo hammeringu,
  (3) negativní cache — prázdný/selhaný episode list se ukládá s fetchedAt
  (dřív se refetchoval při každém otevření); výpadek API nepřepíše starší
  neprázdnou cache (vrací se stale data).
- **Priority při Excelu beze změny záměru**: background downloader při
  spuštěném Excelu stojí (checkIsExcelRunning), interaktivní dotazy
  (kalendář, Právě sledované, recommendations) jedou s prioritou 'high'
  vždy — frontu Excel negatuje. Ověřeno při excelRunning=true.
- Pozn. pro vývoj: po sérii HMR hot-updatů Dashboardu se efekty kalendáře
  umí „zaseknout" (staré closure) — spraví tvrdý reload stránky, v produkci
  nenastává.

### F6 — Priorita interaktivních dotazů vázaná na aktivní tab + Excel (2026-07-16)
Pravidla (dle zadání):
- Plnou prioritu mají interaktivní dotazy JEN když je uživatel přímo v nich:
  Recommendations hledání v tabu Recommendations, kalendář + Právě sledované
  v Dashboardu (rozbalený Status).
- Po odchodu smí rozdělané dotazy **doběhnout na pozadí** (zahřejí cache,
  kalendář uloží localStorage) — **ale jen když neběží Excel**. Při běžícím
  Excelu se okamžitě ruší, aby měl Excel update klid. Background downloader
  při běžícím Excelu stojí jako dřív (24/7 jinak).

Implementace:
- `jikanService`: AbortSignal protažený až do rate-limit fronty —
  `acquireRequestSlot(priority, signal)` zahazuje zrušené požadavky bez
  spotřeby slotu, `fetchWithRetry/fetchEpisodeListFromAPI/
  getOrFetchEpisodeList/getAnimeInfo` mají param `signal`; zrušený episode
  list NEZAPÍŠE negativní cache (abort ≠ selhání). Export `isExcelRunning()`.
- Cleanup vzor ve všech třech místech (AiringCalendar, AiringEpisodeStats,
  Recommendations): `isExcelRunning().then(r => r && controller.abort())` —
  abort podmíněný Excelem. Smyčky kalendáře hlídají `signal.aborted` (ne
  unmount), takže při zavřeném Excelu dojedou a uloží cache; `setState` po
  unmountu je neškodné no-op.
