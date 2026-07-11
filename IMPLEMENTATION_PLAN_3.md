# Implementační plán 3 — „Plán pro Claude" (verze z 11. 7. 2026)

Třetí dávka úprav z `Plán pro Claude.docx`. 11 úkolů, 6 referenčních obrázků
(zkopírovány do `docs/plan3-images/`). Předchozí dávky jsou hotové —
viz `IMPLEMENTATION_PLAN.md` (18 úkolů) a `IMPLEMENTATION_PLAN_2.md` (14 úkolů).

---

## Úkol 1 — Zaoblené rohy sticky hlaviček tabulek v modalech
**Komponenta:** CategoryDetailModal v `CategoryRatingsPanel.jsx` (rozbor modaly),
tabulky generované z markdownu (`formatCategoryMarkdown`) + modal epizod
v `AnimeDetail.jsx`. CSS v `index.css` (sekce category-detail-modal).
**Obrázky:** `plan3-images/image1.png` (hlavička „HLAVNÍ POSTAVY…" má hranaté
rohy i v klidovém stavu), `plan3-images/image2.png` (při scrollu je hranatá —
to je OK).

**Cíl:** V klidovém stavu (tabulka nescrollovaná) mají mít rohy hlavičky
zaoblení navazující na zaoblení tabulky. Jakmile se hlavička „chytne"
(sticky) a tabulka pod ní scrolluje, rohy se **plynule (seamlessly)** změní
na hranaté. Totéž platí pro spodní „hlavičku" (footer řádek) na konci tabulky
— zaoblená dole v klidu, hranatá při scrollu.

**Postup:**
- Audit všech tabulek v modalech: rozbor kategorií, rozbor děje (story),
  rozbory epizod, příp. další (série modal…). Uživatel píše „u epizod a možná
  i jinde – ověř".
- Detekce „stuck" stavu: buď IntersectionObserver na sentinel element nad
  tabulkou, nebo scroll handler už existující v CategoryDetailModal (batch 2
  přidal scroll handler pro push-off hlavičky u posledního řádku — rozšířit).
- Přepínat třídu `.is-stuck` na thead/th → `border-radius` s CSS `transition`.
- Pozor na známý Chrome quirk z batch 2: sticky `th` clampuje záporný `top`;
  padding řešen na `.category-detail-text-column`.

## Úkol 2 — Grafické vylepšení hlavičky série (SVG ikonky)
**Stránka:** `AnimeRatings.jsx` → Hodnocení sérií → hero hlavička série
(řádky ~2489–2590, `seriesHeaderStats`).
**Obrázek:** `plan3-images/image3.png` — Lord of Mysteries: meta boxy
(PRŮMĚR EPIZOD / WA KATEGORIÍ / ČÁSTÍ / EPIZOD / CELKOVÝ ČAS / VYDÁNÍ /
SLEDOVÁNO / REWATCH / STUDIO) jsou jen text a je kolem prázdno.

**Cíl:** Doplnit SVG ikonky (části, epizody, celkový čas…) a hlavičku
graficky/interaktivně vylepšit, aby prázdné místo dostalo smysl. Vyjít
z toho, co už web používá jinde (např. meta řada v AnimeDetail, InfoIcon
vzor — SVG, 1em, currentColor), jen to pro série vylepšit/udělat smysluplnější.
**Pozn.:** redesign těchto boxů proběhl už v batch 2 (úkol 6) — teď jde
o další iteraci: ikonografie + interaktivita, ne o novou strukturu.

## Úkol 3 — Zkrácení názvu série v navigačním badge (jen v detailu!)
**Stránka:** `AnimeDetail.jsx` → series-nav-badge (řádky ~749–786,
prostřední chip `series-nav-name-label` zobrazuje plný `anime.series`).
**Obrázek:** `plan3-images/image4.png` — „Re:Zero -Starting Life in Anoth… 4/7"
se láme/zabírá tolik místa, že badge tvoří druhý řádek.

**Cíl:** Zkrátit název série **pouze v tomto badge** (nikde jinde!) —
např. „Re:Zero -Starting Life in Another World-" → „Re:Zero".
**Postup:** heuristika zkrácení: říznout na prvním oddělovači
(` -`, ` –`, `:` + mezera, `,`) pokud prefix ≥ ~3 znaky; jinak ponechat celé
+ ellipsis přes max-width jako pojistka. Ověřit na reálných názvech sérií
v datech (Re:Zero, That Time I Got Reincarnated as a Slime, …) — vypsat si
všechny `series` hodnoty a heuristiku na nich otestovat.

## Úkol 4 — TYP/STATUS/MAL badges na 2. řádku (Tears of the Azure Sea)
**Stránka:** `AnimeDetail.jsx` — `badgesRow2` logika (useLayoutEffect měří
scrollWidth, řádky ~68, ~559–610).
**Obrázek:** `plan3-images/image5.png` — u filmu „That Time I Got Reincarnated
as a Slime the Movie: Tears of the Azure Sea" (dlouhý titul na 1. řádku)
spadly badges MOVIE/FINISHED/MAL až na **3. řádek**; mají být na **2. řádku**.

**Cíl:** Badges vždy nejvýš na 2. řádku. Uživatel výslovně žádá: **nic jiného
tím nerozbít — elegantní řešení.** Diagnostikovat, proč se u dlouhého
zalomeného titulu měření/umístění posune (pravděpodobně: titul sám zabere
2 řádky → badgeGroup vypadne z title-row a spadne pod druhý řádek titulu +
tlačítko „Najít doporučení" koliduje). Ověřit na Tears of the Azure Sea
i na krátkých titulech, u kterých dnes layout funguje (regresní kontrola).

## Úkol 5 — Minihra „hádej OP/ED": autoplay, hlasitost, neomezená kola
**Komponenta:** `src/components/opedquiz/` (OpEdQuizGame.jsx, quizEngine.js).

Tři podúkoly:
- **a) Autoplay:** písnička se má pustit automaticky bez kliknutí. Přímé
  `<video>` už `.play()` zkouší (řádek ~114) — po prvním user gesture
  (start hry je klik) by autoplay měl projít. GDrive iframe fallback
  (`/preview`) autoplay programově nejde (cross-origin) → zdokumentovat;
  maximalizovat úspěšnost direct-video cesty, iframe nechat jako fallback
  s click-to-play.
- **b) Hlasitost:** přidat volume slider (persistovat volbu např. do
  localStorage). Funguje jen pro direct `<video>` (`video.volume`);
  u iframe fallbacku nelze — slider v tom režimu skrýt/disabled s tooltip.
- **c) Neomezený počet kol:** nová volba počtu kol „∞ / Nekonečno" — hra
  běží, dokud ji uživatel sám neukončí (tlačítko „Ukončit hru" → finální
  score obrazovka). Skóre dál dává smysl: průběžně X správně / Y špatně,
  procenta. Pozor na quizEngine: `generateGame` dnes generuje pevný počet
  kol s unikátností (usedAnime/usedSongs) — pro ∞ režim generovat kola
  průběžně/po dávkách; až dojdou unikátní skladby, povolit recyklaci
  (a ideálně to oznámit) nebo ukončit s hláškou. Zachovat cap na series
  rounds (p=0.15) po dávkách.

## Úkol 6 — Autoplay OP/ED videí v modalu (tabulka odkazů)
**Komponenty:** `VideoModal` v `CategoryMediaPlayers.jsx` (řádky ~50–104);
otevírá se z Favorites.jsx (OP/ED tabulka) a CategoryRatingsPanel.
Dnes: `file_id` → GDrive `/preview` iframe (vyžaduje klik na play),
jinak `<video autoPlay>`.

**Cíl:** po kliknutí na odkaz v tabulce se video rovnou spustí.
**Postup:** zkusit nejdřív direct-video zdroj (jako v quizu:
`drive.google.com/uc?export=download` / googlevideo stream — dle memory
selhává bez Google cookies) s error fallbackem na iframe. Tj. replikovat
quiz pattern 'video' → 'iframe' fallback do VideoModal. Pokud direct
selže, iframe zůstane (jedno kliknutí navíc — limit Google Drive,
zdokumentovat v komentáři).

## Úkol 7 — Posun pozadí při otevření modalu (scrollbar shift)
**Komponenty:** globálně. Diagnóza už hotová: `RatingGuideModals.jsx`
(řádky ~189–204) scrollbar kompenzuje (`paddingRight` na html), ale
`AddAnimeModal.jsx` a `LogWatchingModal.jsx` jen nastaví
`document.body.style.overflow='hidden'` → obsah se posune. Modaly epizod
a kategorií v AnimeDetail (dle uživatele se to děje tam) — dohledat, kdo
jim zamyká scroll.

**Cíl:** žádný horizontální posun pozadí u **žádného** modalu.
**Postup:** extrahovat sdílený hook `useModalScrollLock()` (vzít
implementaci z RatingGuideModals vč. kompenzace šířky scrollbaru) a použít
ve všech modalech (AddAnimeModal, LogWatchingModal, VideoModal,
CategoryDetailModal, story modal, série modal, epizody…). Zvážit i čistě
CSS řešení `scrollbar-gutter: stable` (v index.css:108 už je!) — ověřit,
proč nestačí (pravděpodobně je na jiném elementu, než který scrolluje).
Audit: grep všech `overflow = 'hidden'` + otestovat každý modal.

## Úkol 8 — Kompletní předělání grafů v Dashboardu
**Stránka:** `Dashboard.jsx` (2713 řádků, GROUPS_CONFIG řádky ~110–121).
**Rozsah:** skupiny **AniList Tagy (tags), Hodnocení (ratings), Typy (types),
Studia (studios), Sezóny & Stáří (seasons), Témata (themes), Žánry (genres),
Dabing (dub)** — tj. vše kromě Status a „Poslední & Binge & Nejdelší".
Předělat **minimalized (preview) i maximalized (expanded/FullChart)** verze.

**Cíl:** standardizovat a vylepšit — jednotný vizuální systém grafů
(barvy, tooltips, osy, fonty, spacing, hover chování), ne jen kosmetika.
**Postup (návrh, před realizací odsouhlasit vzhled):**
1. Inventura současných grafů ve všech 8 skupinách (typy grafů, data).
2. Navrhnout jednotný standard: sdílená paleta/gradienty, jednotné
   `getOptions`, konzistentní preview dlaždice, konzistentní expanded
   layout; `animation:false` zachovat (batch 2, perf).
3. Refaktor po skupinách; průběžná browser verifikace každé skupiny.
- Největší úkol dávky — rozdělit na 8 pod-kroků po skupinách.
- Načíst skill `dataviz` před návrhem standardu.

## Úkol 9 — Sticky hlavička pro OST tabulky ve Favorites
**Stránka:** `Favorites.jsx` — OP/ED tabulka sticky hlavičku má; tabulky
**„OST Only the best"** (thead ~řádek 1673) a **„OST + Scenes"**
(~řádek 1711) ji nemají.
**Cíl:** doplnit stejné zakotvení hlavičky jako u OP/ED tabulky (stejný
mechanismus/CSS třída). Pozor na inline `background: var(--bg-tertiary)`
na thead — sticky hlavička potřebuje neprůhledné pozadí a správný z-index.
Návaznost na úkol 1 (zaoblené rohy sticky hlaviček) — pokud se tyto tabulky
renderují v modalu, aplikovat i tam.

## Úkol 10 — Nová sekce rozborů pro anime bez detailního hodnocení
**Stránka:** `AnimeDetail.jsx`.
**Obrázek:** `plan3-images/image6.png` — Made in Abyss: nemá detailní
hodnocení → chybí sekce kategorií (CategoryRatingsPanel vrací null bez
`categoryRatings`, řádek 322) i sekce epizod (podmíněná `episodeRatings`,
řádek 846). To je správně. Ale rozbory z Wordu (category_texts.json:
`categoryReviews[name]` = texty kategorií, `.episodes` = texty epizod,
`.story` = rozbor děje) pak nejsou vůbec dostupné.

**Cíl:** nová **menší** sekce (karta) zobrazená jen když anime NEMÁ detailní
hodnocení, ale MÁ rozborové texty — s odkazy/tlačítky otevírajícími stávající
modaly: rozbory kategorií + rozbory epizod (+ rozbor děje, pokud existuje).
**Postup:**
- Podmínka: `!categoryRatings && !episodeRatings && categoryReviews[anime.name]`
  (přesně doladit — může mít jen epizody, jen kategorie, jen story).
- Znovupoužít existující modaly z CategoryRatingsPanel (CategoryDetailModal,
  story modal) a modal rozboru epizody z AnimeDetail — **bez duplikace kódu**:
  vytáhnout modaly do znovupoužitelné podoby, nebo CategoryRatingsPanel
  naučit „texts-only" režim (bez radaru, jen seznam rozborů).
- Design: kompaktní karta „📖 Rozbory" se seznamem chipů (kategorie) +
  seznamem epizod.
- **Datový problém:** Made in Abyss dnes v category_texts.json vůbec NENÍ
  (ověřeno). Zkontrolovat zdrojovou složku rozborů (C:\AL\…, read-only!)
  a `export_docx_categories.py` — jestli jde o mezeru exportu, nahlásit
  uživateli; sekce se ukáže, jakmile data doplní/oexportuje.

## Úkol 11 — Analýza a kontrola mobilního pohledu (až po úkolech 1–10)
**Rozsah:** stěžejní části webu (AnimeList, AnimeDetail, AnimeRatings,
Dashboard, Favorites…). **Nic neměnit na PC verzi** — úpravy jen v media
queries / mobilních větvích.
**Postup:**
1. `resize_window` preset mobile (375×812) v preview browseru.
2. Projít stěžejní stránky, zdokumentovat problémy (screenshoty/measurements)
   do `docs/MOBILE_AUDIT_3.md`.
3. Opravy čistě v mobilních breakpointech; po každé opravě ověřit desktop
   (1280×800), že se nic nezměnilo.
- Spustit **až jako poslední** (výslovné zadání).

---

## Doporučené pořadí realizace

Fáze A — malé CSS/layout fixy: **7** (scroll lock hook — globální, udělat
první, ať se na něm ostatní modaly zverifikují), **1** (sticky rohy),
**9** (OST sticky hlavičky), **3** (zkrácení badge), **4** (badges 2. řádek).
Fáze B — vizuální vylepšení: **2** (hlavička série).
Fáze C — funkce: **6** (VideoModal autoplay), **10** (sekce rozborů).
Fáze D — velké celky: **8** (Dashboard grafy — po skupinách).
Fáze E — minihra: **5** (quiz — izolovaná feature, jako vždy poslední
z funkcí).
Fáze F — **11** (mobilní audit — až úplně nakonec).

## Rizika / poznámky
- Úkol 4: výslovný požadavek „nic nerozbij" → regresně otestovat krátké,
  střední i dlouhé tituly + film vs. TV (jiná meta řada).
- Úkol 8 je řádově větší než ostatní — nepodcenit; každou skupinu
  verifikovat v prohlížeči zvlášť (pozn. z batch 2: screenshoty občas
  timeoutují kvůli Jikan fetchi — používat krátké sync evaly + DOM měření).
- Úkol 5c mění quizEngine — po změně znovu spustit monte-carlo test
  unikátnosti (batch 2: 200 her, 0 duplikátů).
- Úkol 10 závisí na datech; UI část jde dodat hned, data gap nahlásit.
- Zdrojová složka rozborů je read-only (viz memory) — nikdy do ní nezapisovat.
