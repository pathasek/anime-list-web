# Anime Futures — kompletní research (2026-07-18)

Cíl: nahradit ruční Excel tabulku „ANIME FUTURES“ (65 položek: název, typ
TV/Movie/Special, datum vydání nebo „?“, počítadlo „N vychází do 3 měsíců“)
automatickým řešením. **Stav: ODLOŽENO — vrátíme se k tomu; tady je vše zjištěné.**

---

## Závěr (TL;DR)
**Doporučení: vlastní pipeline nad AniList GraphQL API** (`build_futures.py` →
`futures.json` → UI v tabu Plán). Deterministické, zdarma, bez auth, ověřeno živě.
Google AI / brAInstorm (https://github.com/mindflowgo/brAInstorm) NENÍ potřeba —
LLM parsing internetu je nedeterministický, náchylný k halucinacím a údržbově
drahý; jediná přidaná hodnota (zachycení oznámení dřív, než ho někdo zanese do
AniList DB — typicky hodiny až dny) za to nestojí. Max. jako volitelná vrstva later.

## Ověřený PoC (živé dotazy 2026-07-18) ✅
1. `Media(search:"Mushoku Tensei III")` → id 178789, status RELEASING,
   **startDate 2026-07-04** (Excel má ručně 06.07.2026 — API přesnější).
2. `Media(idMal:40834)` (Ousama Ranking) → `relations.edges` obsahuje
   `OTHER | Ousama Ranking Movie | NOT_YET_RELEASED | startDate null`
   = **přesně Excel řádek „Ranking of Kings Sequel / Movie / ?“** včetně „?“.
3. **Batch**: `Page(perPage:50){ media(idMal_in:[…]){ relations{…} } }` funguje ✅
   → celý list (488 anime) = ~10 requestů.

## Hlavní řešení: AniList GraphQL
- Endpoint `https://graphql.anilist.co`, POST JSON, **bez auth** pro veřejná data.
- Rate limit: normálně 90 req/min, **dlouhodobě degradováno na 30 req/min** —
  s batchingem nepodstatné.
- Klíčová pole: `relations.edges{ relationType, node{ idMal, title{romaji english},
  format, status, startDate{year month day}, episodes, coverImage{large}, siteUrl,
  season, seasonYear, studios } }`.
- `status`: NOT_YET_RELEASED / RELEASING / FINISHED / CANCELLED / HIATUS.
  `startDate` je FuzzyDate — year/month/day samostatně nullable („červenec 2026“
  = year+month bez day; „?“ = vše null).
- `relationType`: SEQUEL, PREQUEL, SIDE_STORY, SPIN_OFF, ALTERNATIVE, OTHER,
  CHARACTER, SUMMARY, ADAPTATION, SOURCE, COMPILATION, CONTAINS.
- Bonus: `airingSchedule` per media (přesné časy dílů) — už používáme v kalendáři
  Dashboardu (batch dotazy fungují, viz jikanService/AiringCalendar, batch 8).

### Navržená architektura
1. `build_futures.py` (root; vzor `build_ytmusic_ost.py`):
   - MAL id z `mal_url` všech položek `anime_list.json` + `plan_to_watch.json` (dedup).
   - Batch `idMal_in` po 50 → relations.
   - Filtr: `node.status ∈ {NOT_YET_RELEASED, RELEASING}`, `node.idMal ∉ vlastní list`,
     `relationType ∉ {CHARACTER, ADAPTATION, SUMMARY, SOURCE, COMPILATION}`.
   - **BFS po řetězu sequelů**: vlastním jen S01, S02 je FINISHED (nekoukaná) a S03
     je oznámená → S03 z 1. úrovně neuvidím. Řešení: FINISHED sequel nody (do
     hloubky ~3) přidat do fronty a dotázat i jejich relations.
   - Dedup (S01 i S02 ukazují na týž sequel → 1 záznam, `sources` sloučit).
   - `futures_overrides.json`: blocklist idček (false positives — recapy apod.)
     + ruční záznamy (oznámení, které AniList ještě nemá). Vzor `ytmusic_ost_overrides.json`.
   - Výstup `public/data/futures.json` + `generated` timestamp.
2. UI: sekce „Futures“ v tabu **Plán** (v Excelu tentýž list „ANIME PLAN TO WATCH
   + FUTURES“). Řazení: známá data vzestupně, pak „?“. Header „Futures: N Anime ·
   M vychází do 3 měsíců“. Karta: poster, název, badge typu (TV modrá / Movie
   fialová / Special žlutá — barvy z Excelu), datum/„?“, countdown, odkaz AniList,
   „navazuje na: {source}“.
3. Refresh: ručně spouštěný skript jako ostatní pipelines (příp. napojit na
   existující update workflow).

## Alternativy (zvážené, proč ne / kdy ano)
- **Jikan (MAL) API** — `/anime/{id}/relations`, `/seasons/upcoming`. Nevýhody:
  žádný batch (488 requestů), rate limit 3/s, a hlavně MAL/Cloudflare aktuálně
  blokuje Jikan servery (naše zkušenost: /statistics 504, issues jikan-rest
  #595/#607/#610) — nespolehlivé. Datumy na MAL bývají méně strukturované.
- **Oficiální MAL API v2** — potřebuje client id (registrace), má `related_anime`;
  data ekvivalentní Jikanu, méně pohodlné než GraphQL. Záloha, kdyby AniList vypadl.
- **LiveChart.me** — nejlepší hotové *manuální* online řešení: sledování franšíz
  („Follow“), e-mail/push notifikace o oznámeních a datech, ICS kalendář feedy.
  **Nemá veřejné API** (scraping proti ToS). Použitelné hned bez programování,
  ale neintegrovatelné do webu → doporučeno jen jako doplněk/notifikace.
- **AniChart.net** — jen seasonal frontend AniListu, nic navíc oproti API.
- **AnimeSchedule.net** — má veřejné API (token zdarma) pro airing/seasonal data;
  slabší na relace/franšízy, silné na týdenní rozvrhy. Alternativa pro kalendář,
  ne pro Futures.
- **Kitsu API** — má media relationships, ale databáze i údržba slabší než AniList.
- **brAInstorm / Google AI (nápad uživatele)** — periodický LLM prompt „najdi data
  vydání“. Hodnocení: nedeterministické, halucinace dat, nutná údržba promptů a
  parsování odpovědí, duplikuje to, co AniList dělá strukturovaně. Jediný scénář,
  kde by pomohl: čerstvá oznámení/rumory před zanesením do DB — to lze později
  přidat jako volitelnou vrstvu (např. týdenní check nad news RSS + LLM sumarizace),
  ale core musí být API.

## Edge cases k ošetření
- Částečná data (`year` bez `month`): zobrazit „2027“ / „červenec 2026“ / „?“.
- CANCELLED/HIATUS nody: nezobrazovat (nebo šedě s badge — rozhodnout při implementaci).
- Movie/Special bez vazby na sérii v listu (úplně nové dílo oblíbeného studia)
  systém nezachytí — to je mimo scope (Futures = pokračování vlastněných sérií).
- Anime, které mezitím začalo vysílat (NOT_YET_RELEASED → RELEASING): nechat ve
  Futures dokud si ho uživatel nepřidá do listu/plánu, s badge „už vysílá!“.
