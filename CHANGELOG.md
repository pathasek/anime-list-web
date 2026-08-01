# Changelog (Seznam změn) — Anime List WEB

Tento soubor shrnuje všechny nedávné změny, opravy a vylepšení implementované ve webové aplikaci (React + Vite) pro vizualizaci osobní databáze anime.

---

## [1.1.0] - 2026-08-01

### 🎬 Cesta Anime & Statistiky měsíce
- **Nový detailní modal měsíce (`AnimeJourneyMonthModal.jsx`):** Otevírá se kliknutím na název měsíce v maximalizované časové ose Cesty Anime. Zobrazuje:
  - Podrobné statistiky za daný měsíc (dokončená anime, počet epizod, reálný odsledovaný čas z History logu, průměrné hodnocení a případně rewatch statistiky).
  - Kartu nejlepšího anime měsíce a informaci o nejdelším sledovaném anime.
  - Tři interaktivní chord diagramy (propojující žánry, témata a AniList tagy) pro vizualizaci společných prvků u zhlédnutých děl. U menších měsíců se místo diagramů zobrazuje čistý přehledový seznam s počty.
- **Oprava výpočtu v Cestě Anime:** Nejdelší anime nyní správně počítá i tituly se statusem `AIRING!` a `PENDING` (opraveno ignorování koncového data v `journeyCalculations.js` a korektně filtrovány rewatche z minut history logu).
- **Propojení na filtr série:** Kliknutí na nejdelší sérii z Dashboardu nově vede na seznam anime vyfiltrovaný podle dané série (`#/anime?series=…`).

### 🎵 OST Přehrávač & Hudební sekce (Vylepšení & Optimalizace)
- **F5 Persistence (Obnova po refreshi stránky):**
  - Implementována utilita `ostSession.js` a upraven `OstPlayerProvider.jsx`.
  - Přehrávač si nyní ukládá uživatelské preference (shuffle, řazení) a rozpracovanou relaci (co hraje, index skladby, pozici v playlistu a přesný čas) do `localStorage`. Session přežívá 12 hodin.
  - **Ochrana před autoplay policy:** Pokud prohlížeč po znovunačtení stránky zablokuje automatické spuštění zvuku, na přehrávači se zobrazí velké tlačítko „Pokračovat“.
- **Čištění názvů skladeb (`ostTrackTitle.js`):**
  - Názvy skladeb z YouTube playlistů jsou automaticky očištěny od nadbytečných ozdob a závorek (např. *[CD1]*, *Original Soundtrack*, *Disc 2*, *#5*).
  - Skript detekuje a odstraňuje společný prefix playlistu (např. název anime a rok), aby se v seznamu skladeb nezobrazoval u každé položky duplicitně.
- **Skutečné délky playlistů:**
  - Vytvořen Python skript `tools/build_ytmusic_durations.py` využívající `yt-dlp`. Získává reálný počet skladeb a celkový čas přímo z YouTube playlistů (výstup v `public/data/ost_playlist_durations.json`).
  - Vyřešen nesoulad, kdy karta v sekci „OST As a Whole“ brala délku z původního alba, ale počet stop z reálného playlistu.
- **Zmenšeniny obalů (Úspora dat & Vzhled):**
  - Vytvořen skript `tools/build_cover_thumbs.py` pro generování optimalizovaných náhledů (208 px, JPG) s filtrem Lanczos a jemným doostřením.
  - Výrazná úspora přenášených dat na webu (stahování stovek kB namísto původních ~12 MB) a čistší render tenkých linek anime kreseb.
- **Vizuální design sekce "As a Whole":**
  - Karty playlistů dynamicky počítají dominantní barvu z obalu (přes canvas a vážený průměr) a aplikují ji na pozadí, rámeček a odznaky karet.
  - Pořadí v žebříčku je zobrazeno velkým číslem vedle názvu s medailovým zvýrazněním pro TOP 3.
  - Kliknutí na „Best pieces“ u karty pustí první vybranou skladbu, hned za ní druhou best skladbu a následně pokračuje zbytek knihovny.
- **Rozšíření přehrávání OP/ED z AnimeThemes:**
  - Zvýšeno pokrytí funkčních tlačítek přehrávání z 211 na 251 (využíván statický katalog `animethemes_op_ed.json`). Tyto skladby jsou v seznamu odlišené jantarovou barvou.

### 📊 Uživatelské Rozhraní (UI) & Tabulky
- **Tabulka epizod v Hodnocení:**
  - Přidán přepínač formou mini tabů: `📊 Kategorie` (původní) a `🎬 Epizody` (nová tabulka).
  - V tabulce epizod lze kliknout na zvýrazněné ohodnocené buňky a otevřít tak detailní rozbor dílu s možností listování.
  - Vyhledávání v tabulce nově dynamicky filtruje řádky i sloupce (podle maximální zobrazené délky série).
- **Zobrazení MAL statusu:** Odkaz a status na MAL byl přesunut na řádek k počtu epizod, aby název anime dostal celý řádek pro sebe.
- **Oprava kalendáře vysílání:**
  - Zajištěno správné ukládání klíče `broadcast` do metadat a zaveden denní TTL.
  - Karta vysílaného anime sdílí události s kalendářem (vše se synchronizuje bez nadbytečných dotazů na Jikan API).
  - Opravena projekce dílů za plánované finále.
- **Standardizace hoverů:** Všechny textové odkazy mají sjednocené hover efekty (barva akcentu + offset podtržení 2px) definované globálně v `index.css`.
- **Mobilní verze pavoučího (radar) grafu:** Opraveno přetékání a ořezávání popisků u mobilních rozlišení (optimalizace paddingu a clampování).

### ⚙️ Vývojářské & Systémové změny
- **Relativní cesty ve skriptech:** Opraveny absolutní cesty na relativní (odvozené od umístění souboru) u skriptů `tools/export_data.py`, `tools/extract_spotify_images.py` a `tools/map_from_folder.py`.
- **Zabezpečení:** V hlavičce stránek nastaven `noindex` (`robots.txt`), vypnuto odesílání referrera a skryt název webu v titulku tabu (`<title>Anime List</title>`).
- **AI pravidla:** Přidána jednotná pravidla pro AI asistenty (`AGENTS.md` v repozitáři, `CLAUDE.md`, `GEMINI.md` aj.) zamezující nekonzistencím a chybám při rewatchech.
