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
