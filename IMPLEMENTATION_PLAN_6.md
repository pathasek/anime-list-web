# Implementační plán 6 — „Plán pro Claude.docx" (2026-07-14)

Zdroj: `Plán pro Claude.docx` (plocha, verze z 14.07.2026 19:06). Obsahuje 7 úkolů:
doporučení (kombinace API + tagy), průzkum OP/ED API, 2× mobilní oprava, historie
streaků, AniList tagy na Dashboardu, odkazy v kompletní tabulce hodnocení.

---

## Ú1 — Recommendations: viděná anime v nastavení + kombinace Jikan × AniList + AniList tagy

**Zadání:** (a) Možnost zobrazit ve výsledcích i anime, která už jsem viděl — default
zůstává jako teď (skrytá), tj. nový přepínač v nastavení. (b) Používat Jikan i AniList
GraphQL doporučení zároveň (async), smíchat do jednoho seznamu a férově vyrovnat body.
(c) Přidat AniList tagy jako faktor do výpočtu priority — váhu zvolit tak, aby seděla
na moje hodnocení. „Chci dobrá doporučení, ne random."

### Zjištění z kódu (`src/pages/Recommendations.jsx`)
- Engine je port VBA: Jikan `/anime/{id}/recommendations` → pro každé doporučení fetch
  detailů → `calculateRelevance` (váhy: votes 50, MAL score 20, žánry/témata 16, délka 8,
  PTW 8, popularita 8; max 110). Už zhlédnutá anime se **skipují natvrdo** (`watchedIds`).
- AniList se už používá — ale jen na **tagy TOP-N výsledků** (batch přes `idMal`), po
  seřazení, čistě pro zobrazení. Tagy do skóre nevstupují.
- Nastavení: `SettingsModal` + localStorage `rec-settings`; existuje precedens toggle
  `showPTWAnime`.

### Průzkum — AniList recommendations API
- GraphQL `Media(idMal: X, type: ANIME) { recommendations(sort: RATING_DESC) { nodes {
  rating mediaRecommendation { idMal title … } } } }`.
- `rating` = čistý počet hlasů uživatelů (upvotes−downvotes) — **ekvivalent Jikan
  `votes`**, ale na AniList bývají hodnoty výrazně nižší (menší komunita).
- Jeden POST vrátí celý seznam doporučení vč. metadat — žádné iterování po jednom.
- Limit: 30 req/min (degraded stav AniList), batch dotazy se počítají jako 1.

### Návrh férového sloučení (bodová parita zdrojů)
1. **Async naráz:** `Promise.all([jikanRecs, anilistRecs])`.
2. **Union podle MAL id.** Kandidát nese `jikanVotes` a `anilistRating`.
3. **Normalizace hlasů per zdroj** (řeší různě velké komunity): v každém zdroji
   `norm = getVotesScore(votes, MAX_VOTES_src)` — pro Jikan stávající log škála
   (`MAX_VOTES_FOR_SCORE`=120), pro AniList stejná log škála s vlastním stropem
   (`ANILIST_MAX_VOTES_FOR_SCORE`, default 40 — AniList ratingy jsou ~3× menší).
4. **Kombinace:** `votesScore = max(normJikan, normAnilist) + AGREEMENT_BONUS ×
   min(normJikan, normAnilist)` s `AGREEMENT_BONUS` default 0.35, cap 1.0.
   → anime doporučené oběma komunitami dostane bonus, ale jednostranně silné
   doporučení není penalizováno. Ve breakdownu se zobrazí oba zdroje.
5. Detaily pro AniList-only kandidáty se stejně dotáhnou z Jikan (MAL score, members,
   žánry) — pipeline zůstává, jen se rozšíří vstupní množina.

### AniList tagy ve skóre
- Uživatelův profil tagů už webu počítá (`excelChartCalculations.js` — vážený průměr
  hodnocení per tag, weight = rank/100, filtr `sumWeights ≥ 3`). Stejný vzorec použít v
  Recommendations: z `anime_list.json` (pole `tags` = `Name:rank:desc;…`) spočítat
  `userTagRatings`.
- Kandidátovy tagy (z AniList, rank ≥ ANILIST_MIN_RANK, bez spoilerů):
  `tagScore = Σ(userTagRating[t] × rank_t) / Σ(rank_t) / 10`, jen přes tagy, které mám
  ohodnocené (min. práh výskytu `sumWeights ≥ 1.5`, ať jeden náhodný tag nerozhazuje).
  Bez průniku → neutrální 0.5 (stejně jako žánry).
- **Váha:** `RELEVANCE_W_TAGS` default **16** (stejně jako žánry/témata — tagy jsou
  jemnější signál než žánry, ale u mě dobře kalibrovaný: vážené průměry tagů se
  pohybují ~8.3–9.8, takže rozptyl je informativní). Do nastavení + breakdown řádek.
- ⚠️ Změna flow: tagy je nutné stáhnout **před** scoringem pro všechny kandidáty
  (batch po ~25 přes idMal), ne až pro TOP-16. Breakdown pak max = 126 (110+16) —
  přepočítat zobrazovaný jmenovatel dynamicky ze součtu vah.

### Přepínač „Zobrazit i zhlédnutá anime"
- `showWatchedAnime` (default `false`) do `DEFAULTS` + toggle v SettingsModal (sekce
  Zobrazení, vedle PTW). V enginu: místo skipu se kandidát označí `isWatched` a projde
  scoringem; karta dostane badge „✅ Zhlédnuto (FH X/10)" + moje hodnocení.

Soubory: `src/pages/Recommendations.jsx`, `src/pages/recommendations.css`.

---

## Ú2 — Průzkum: API/katalogy OP/ED videoklipů (odpověď, bez kódu)

**Zadání:** Zjistit, jestli existuje jiné API řešení pro OP/ED videoklipy než GDrive;
vyjmenovat stránky, které katalogizují OP/ED pro všechna anime.

### Nalezené katalogy
| Stránka | API | Obsah | Poznámka |
|---|---|---|---|
| **AnimeThemes.moe** | ✅ plné REST/JSON:API + GraphQL (`api.animethemes.moe`) | 15 000+ WebM videí OP/ED, mapování na MAL/AniList id | Nejlepší kandidát — lze dotazovat `externalsite=myanimelist` + id, vrací přímé URL na video (WebM/audio OGG). Zdarma, bez klíče. |
| **Themes.moe** | ✅ jednoduché REST API | agregátor postavený nad r/AnimeThemes; umí import MAL/AniList seznamu, roulette | Streamuje videa z AnimeThemes infrastruktury. |
| **Openings.moe** | ⚠️ neoficiální | stovky OP/ED ve vysoké kvalitě, přehrávač + quiz | Menší pokrytí, bez oficiálního API. |
| **AniSongDB (anisongdb.com)** | ✅ API | metadata písní (interpret, skladatel, AMQ data) | **Bez videí** — jen databáze skladeb, hodí se na metadata. |

### Doporučení
AnimeThemes.moe API je přesně „katalog OP/ED pro všechna anime s videi": dotaz per MAL
id vrátí všechny OP/ED včetně verzí a přímých video URL. Dá se použít jako fallback
(nebo náhrada) GDrive přehrávače — přímé `<video src>` bez iframe omezení Google Drive.
Implementace zapojení je mimo rozsah této dávky (nice-to-have follow-up).

---

## Ú3 — Mobil: rozbitý OP/ED přehrávač z Google Drive

**Zadání:** Na mobilu se deformuje UI a hůř se pouští/sledují OP/ED (screenshoty v docx:
zdvojené ovládací lišty, bílý seek-bar nahoře přes video, GDrive overlay přes vlastní UI).

### Zjištění
- `VideoModal` (`CategoryMediaPlayers.jsx`): primárně přímý `<video autoPlay>`, při
  chybě fallback GDrive `/preview` iframe.
- V `index.css` už existují mobilní fixy z **13.07.** (commity `4cee9d5`, `f5e78d1`):
  ořezová maska GDrive iframe (top −46px), `aspect-ratio` obálky, landscape pravidla.
  Docx je ale z **14.07. 19:06** → nejdřív **ověřit na 375px a landscape viewportu**,
  co přesně ještě zlobí (screenshoty můžou být starší i aktuální).
- Kandidáti na zbývající problémy: GDrive vlastní UI se s maskou pere při landscape
  (screenshot 1 je landscape — maska −46px platí jen pro ≤600px portrait breakpoint!);
  duplicitní ovládání (naše hlavička + GDrive lišta + nativní `<video>` controls).

### Plán
1. Reprodukovat v preview (mobile 375×812 + landscape 812×375), zjistit aktivní režim
   (video vs iframe).
2. Landscape ≤900px: aplikovat stejnou ořezovou masku jako portrait (teď chybí).
3. Ověřit, že se controls nekryjí; případně na mobilu preferovat iframe/video podle
   toho, co reálně funguje (uc?export=download na mobilních datech často selže →
   rychlejší fallback).
4. Desktop beze změny.

Soubory: `src/index.css` (media queries), příp. `CategoryMediaPlayers.jsx`.

---

## Ú4 — Mobil: „warped" tlačítka „?" a „play"

**Zadání:** Na mobilu jsou všechna tlačítka s „?" nebo „play" deformovaná; na PC ne.

### Zjištění
- Fix už existuje (commit `b9734a1`, 13.07.): v `index.css` ≤600px pravidlo
  `flex-shrink: 0 + aspect-ratio: 1/1` pro `.rating-info-btn`, `.media-play-btn`,
  `.fav-table-play-btn`, `.media-icon-btn`, `.r2-chip-info` atd.
- Plán: **ověřit na mobile viewportu** všechny výskyty (AnimeRatings tabulka, detail,
  Favorites, History). Pokud něco zbývá (např. tlačítka mimo seznam selektorů, nebo
  deformace `height` místo šířky), doplnit selektory / `width/height` fix. Jinak
  označit za hotové z 13.07.

---

## Ú5 — History Log: tlačítko historie streaků

**Zadání:** K ukazateli streaku přidat malé tlačítko historie. Po kliknutí mini
shrnutí: délky streaků a další info, vizualizace — co streak přerušilo (den, situace,
jaké anime bylo poslední) — zajímavé, ale pěkné, styl dle webu.

### Zjištění (`src/pages/HistoryLog.jsx`)
- `watchStreak` memo: den se počítá do streaku při ≥20 min; vrací jen current/longest
  s daty od–do. Denní minuty se agregují do `dailyMinutes`.
- Hlavička má „🔥 aktuální" a „🏆 nejdelší" v `.history-streaks-container`.

### Plán
1. Rozšířit výpočet: **seznam všech streaků** `{start, end, days, totalMinutes,
   totalEpisodes, animeCount, topAnime, lastAnime, gapAfterDays}` (jedním průchodem
   po dnech; anime per den z historyLog).
2. Malé tlačítko „🕐" (media-icon-btn styl) vedle streak ukazatelů → modal
   (useModalScrollLock, styl `media-modal` / guide modalů):
   - **Souhrn:** počet streaků, průměrná délka, nejdelší, celkové dny se sledováním.
   - **Timeline vizualizace:** horizontální pruhy streaků na časové ose (SVG/flex,
     šířka ~délka, barva podle délky — gradient jako heatmapa), tooltip s detaily.
   - **Seznam TOP streaků:** řádek = období, délka, hodin, poslední anime před
     přerušením + kolik dní pauza následovala („Streak ukončen po X, následovalo
     Y dní pauzy — poslední: <anime>").
3. Styl: existující proměnné (--accent-amber/emerald, radius, bg-card), fade-in.

Soubory: `src/pages/HistoryLog.jsx` (+ styl v index.css nebo inline dle konvence souboru).

---

## Ú6 — Dashboard: AniList tagy — hezčí graf + weighted hodnocení vybraných tagů

**Zadání:** Graf „Top 20 tagů (vážené hodnocení)" vizuálně trochu vylepšit (už je
dobrý). Přidat někam weighted hodnocení pro **vybrané** tagy.

### Zjištění (`src/pages/Dashboard.jsx`, case 'tags' ř. 1362+)
- Panel: selector tagů (OR/AND/exclude) + seznam anime + Bar graf (Chart.js,
  `horizontalBarOptionsExcel`, jednobarevné bordó pruhy, min osa dynamická).
- Vážený vzorec v `excelChartCalculations.js` (weight=rank/100, práh sumWeights ≥ 3).

### Plán
1. **Graf:** gradient/škála barev podle hodnoty (heatmapa červená→zelená nebo akcentní
   gradient dle tématu), zaoblené pruhy, jemnější mřížka, hodnota na konci pruhu
   (datalabel), hover zvýrazní odpovídající tag. Držet Chart.js (žádný rewrite).
2. **Weighted hodnocení vybraných tagů:** do hlavičky `tag-anime-panel` (kde je
   „N anime") přidat badge „⚖️ Vážené hodnocení: X,XX" — stejný vzorec jako
   `anilistTags` (Σ rating×rank/100 / Σ rank/100 přes anime z aktuální kombinace
   OR/AND, jen dokončená s hodnocením). U AND kombinace přes průnik. Tooltip
   s počtem započtených anime; při < 2 hodnocených zobrazit „málo dat".
3. Selected tagy zvýraznit i v Bar grafu (pokud jsou v TOP 20).

---

## Ú7 — Kompletní tabulka hodnocení: odkazy na anime + modal rozboru kategorie

**Zadání:** V „Anime hodnocení a analýza" → Kompletní tabulka: klik na **název** načte
to anime; najetí na buňku kategorie → možnost zobrazit **modal s rozborem** (stejný
jako v detailu anime).

### Zjištění (`src/pages/AnimeRatings.jsx` ř. 3818+)
- Klik na řádek už přepíná do `individual` view (`setViewMode`+`setSelectedAnimeTitle`).
- Modal rozboru existuje: `openRadarCategoryReview(animeName, cat)` → `EpisodeModalHost`
  (vrací false, když text není). Texty: `categoryReviews[name][cat]`.

### Plán
1. **Název anime jako odkaz:** `td-name` → klikatelný span se stylem odkazu (hover
   podtržení, accent barva) — chová se jako dosud (individual view + scroll top =
   `openAnimeFromChart`), ale vizuálně čitelné, že jde kliknout. Řádkový klik zůstává.
2. **Buňky kategorií:** pokud pro `item.name`+`cat` existuje rozbor
   (`categoryReviews`), buňka dostane hover afordanci (tečka/📄 kurzor help, jemný
   outline) a `onClick` (e.stopPropagation) → `openRadarCategoryReview(item.name, cat)`.
   Hover tooltip „Zobrazit rozbor: <cat>". Bez rozboru — beze změny.
3. Výkon: lookup map `hasReview[name]` memo, ne find v renderu každé buňky.

---

## Pořadí implementace
1. Ú7 (malé, vše existuje) → 2. Ú5 (izolované, HistoryLog) → 3. Ú6 (Dashboard tagy)
→ 4. Ú1 (největší — doporučení) → 5. Ú3+Ú4 (mobilní ověření/dofix) → 6. Ú2 je jen
report (hotovo v tomto dokumentu).

## Stav (2026-07-14 — vše hotovo a ověřeno v prohlížeči)
- [x] Ú1 Recommendations — **ověřeno na Steins;Gate 0**: async merge Jikan+AniList
      (AniList-only kandidáti se objevují, např. Tokyo Revengers 51× AniList), breakdown
      ukazuje „MAL X× · AniList Y×" + řádek „AniList tagy" (0,82 × 16 = 13,2 b.),
      dynamické maximum 126; toggle „Zobrazit i zhlédnutá anime" funguje (badge
      ✅ Zhlédnuto + FH). Nové položky v nastavení: váha tagů, AniList strop hlasů,
      bonus za shodu zdrojů, toggle kombinace, toggle zhlédnutých.
- [x] Ú2 Průzkum OP/ED API — viz tabulka výše (AnimeThemes.moe = doporučený kandidát)
- [x] Ú3 Mobil: OP/ED přehrávač — portrait fix z 13.07. funguje; **chybějící kus byl
      landscape** (≤900px naležato) — GDrive lišta se kreslila přes video. Doplněna
      stejná ořezová maska do landscape media query. Ověřeno na 375×812 i 812×375.
- [x] Ú4 Mobil: warped tlačítka — **nalezena skutečná příčina**: `button { min-height:
      44px }` v ≤768px breakpointu (touch-target pravidlo) přebíjelo aspect-ratio fix
      z 13.07. (`.rating-info-btn` bylo 20×44). Přidána výjimka `min-height/width: 0`
      pro malá ikonová tlačítka v obou breakpointech. Ověřeno: 0 deformovaných z 239
      na Favorites, 0 z 25 na Ratings.
- [x] Ú5 History Log: historie streaků — tlačítko 🕐 vedle streak ukazatelů → modal:
      souhrn (26 streaků, nejdelší 401 dní…), timeline po letech (pruhy dle délky,
      měsíční mřížka, tooltip), TOP 10 s délkou/hodinami/epizodami/počtem anime,
      nejsledovanějším anime, posledním anime před přerušením a délkou pauzy.
- [x] Ú6 Dashboard: AniList tagy — graf per-bar gradient (bordó→zlatá dle hodnoty),
      zaoblené pruhy, hodnoty na koncích pruhů, zvýraznění vybraných tagů obrysem;
      badge „⚖️ vážené hodnocení" vybrané kombinace tagů v hlavičce panelu
      (ověřeno: tag Acting → ⚖️ 8,36 z 5 anime).
- [x] Ú7 Kompletní tabulka: název anime = odkaz na detail (/anime/:name), buňky
      kategorií s dostupným rozborem mají hover afordanci (📄 + outline) a klik
      otevře stejný modal rozboru jako v detailu. Klik na řádek dál přepíná do
      individuálního zobrazení. Ověřeno (290 odkazů, 3385 buněk s rozborem).

Build: `npm run build` OK. Změny zatím **necommitnuté**.

---

## Dodatek 6b (2026-07-14 večer) — obě hotovo a ověřeno

**6b-1 Pořadí kategorií v gridu:** karty hodnocení kategorií (detail anime) nyní končí
řádky `Enjoyment | OST` a `OP | ED` (OP nalevo od ED, OST vedle Enjoymentu). Jen grid —
radar zachovává kanonické pořadí. `CategoryRatingsPanel.jsx` (`CARD_ORDER` +
`displayEntries`).

**6b-2 AnimeThemes.moe v detailu anime:** nový `src/utils/animeThemesService.js` —
dotaz per MAL id (filter MyAnimeList external_id), z každé znělky vybere **nejlepší
video** (skóre: creditless +4000, bez overlapu +2000, BD +500, rozlišení, lyrics −300),
cache per relaci. `CategoryRatingsPanel` dostal prop `malId` (posílá **jen
AnimeDetail** — Favorites beze změny) a do `media.OP/ED` přidá znělky z AnimeThemes:
- **GDrive vždy první a hlavní** — v seznamu s ⭐ (hvězdička jen když existují i
  ostatní verze),
- AnimeThemes položky za oddělovačem „Ostatní verze · AnimeThemes.moe", tlumený badge
  (`.media-track-badge.alt`), v dolní sekci tag „AnimeThemes",
- **dedup podle názvu písně** (normalized include) — píseň pokrytá vybraným GDrive
  klipem se z AnimeThemes nepřidává, zůstávají skutečně jen „ostatní",
- `VideoModal` umí WebM (source type dle přípony) + subtitle „· AnimeThemes.moe".

Ověřeno na Steins;Gate 0: ED karta = ⭐ ED 3/6/1 (GDrive) + oddělovač + ED1 Amadeus,
ED4, ED5 z AnimeThemes (ED2/3/6 správně dedupnuté proti GDrive); WebM přehrávání
funguje (currentTime 1,4→3,4 s, plné ovládání). Build OK.
