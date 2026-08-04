# Changelog (Seznam změn) — Anime List WEB

Tento soubor shrnuje všechny nedávné změny, opravy a vylepšení implementované ve webové aplikaci (React + Vite) pro vizualizaci osobní databáze anime.

---

## [1.4.0] - 2026-08-04 (pozdní večer)

### 🚀 Druhá vlna zrychlení (B2 + C1 + C2)
- **Podskripty exportu běží souběžně v „lajnách".** `map_from_folder.py` doběhne první (přepisuje `anime_list.json`), pak jedou paralelně: [Jikan cache → postery], [Spotify obaly → jejich zmenšeniny], rozbory, YT Music, AnimeThemes, zmenšeniny Top Favorites a případně IMDb. Oba Jikan skripty zůstávají schválně za sebou v jedné lajně (společný rate limit 3/s a 60/min). Výstup každého skriptu se bufferuje a vypisuje vcelku, ať se souběžné logy nemíchají; git commit čeká na všechny lajny. Souhrn podskriptů: ~12 s → 4,8 s.
- **In-process NotebookLM klient (C1).** Orchestrátor už nespouští na každý příkaz nový Python proces (~1 až 2 s režie na list/delete/upload), ale volá knihovnu `notebooklm_tools` přímo, s thread-local klienty pro paralelní workery. Trojí pojistka: při jakékoli chybě operace automaticky přejde na původní subprocess cestu, celý mechanismus se vypíná přes `NLM_INPROC=0`, a po novém loginu se klienti vyrábí znovu (čerstvé cookies). Otestováno na dočasném testovacím notebooku (create → upload souboru → list → rename → delete zdroje → delete notebooku, vše in-process) a čtením ostrého notebooku: množiny ID z in-proc a CLI listu jsou identické.
- **Souběžné načtení obou podob sešitu (C2): poctivý výsledek je ~0.** Načtení hodnot i vzorců běží ve dvou vláknech, ale openpyxl parsování drží GIL: 17,7 s proti dřívějším 8,9 + 8,6 s sekvenčně. Ponecháno (neškodí a na studené OneDrive cache může něco málo dát); skutečné zrychlení by chtělo výměnu čtecí knihovny, což je riziko třídy C3 a bylo zamítnuto.
- Webový řetěz při ležícím Jikanu: **23 s** (původně ~127 s, po první vlně 30 až 32 s).

---

## [1.3.0] - 2026-08-04 (večer)

### ⚡ Zrychlení automatického běhu (NotebookLM + web)
- **Webový export běží souběžně s Excel makrem.** Orchestrátor (`Anime NotebookLM Updater.py` v kořeni `Anime_List/`) spouští 4 vlákna místo 3: mazání zdrojů, Excel makro, file watcher a nově `export_data.py` jako samostatnou větev. Na výstupech makra nezávisí; jediná vazba (čtení alt-textů přes Excel COM) odpadla, viz níže. Celek se zkracuje zhruba o délku makra a `excel_done` nově znamená jen „makro hotovo", takže watcher nečeká na web.
- **Alt-texty tvarů Top Favorites se čtou ze zipu sešitu** (atribut `descr` elementu `cNvPr` v drawing XML) místo přes Excel COM. Ověřeno proti `Shape.AlternativeText` na všech 73 tvarech: znak po znaku shodné a výsledný `top_favorites.json` bit po bitu identický. COM zůstává jen jako fallback a při orchestrovaném běhu (`NLM_ORCHESTRATED=1`) je zakázaný.
- **Sdílená pojistka výpadku Jikanu** (`tools/jikan_health.py`): kdo výpadek vyhodnotí (3 totální selhání po sobě), zapíše ho do temp souboru a ostatní skripty (jména postav v `export_data.py`, `download_jikan_cache.py`, `download_journey_posters.py`) ho po dobu platnosti (30 min) rovnou přeskočí. Při výpadku to šetří 1,5 až 2 minuty. `download_jikan_cache.py` navíc po prvním totálním selhání zrychlí sondování na jeden pokus místo plných backoffů.
- **Jména postav Top 10 se cachují** (`tools/top_chars_cache.json`), API se volá jen pro nová CHAR_ID. Všechna `requests.get` v exportu dostala `timeout`, dřív uměla viset neomezeně.
- **Nezměněné soubory se nepřepisují:** obrázky extrahované ze sešitu se porovnávají po bajtech (takže se zbytečně nepřegenerovávají zmenšeniny Top Favorites), Spotify obaly se kopírují jen při změně, `spotify_images.json` a `jikan_cache.json` se zapisují jen při změně obsahu. Míň práce pro OneDrive i git.
- **Běh beze změn už nenasazuje:** když se v `public/` nic nezměnilo, commit a push se přeskočí a timestamp v `metadata.json` se vrátí zpět, ať klientům zbytečně neinvaliduje cache. Záchranná git větev už nepoužívá `add -A`, přidává jen `public/` (dřív uměla nasadit i rozpracované zdrojáky).
- **Měření kroků:** `export_data.py` i orchestrátor vypisují `[TIMER]` řádky (načtení sešitů, každý podskript, fáze běhu), regrese rychlosti budou vidět na první pohled. Nový přepínač `--no-push` pro testovací běhy bez commitu.
- **NotebookLM část:** hashe docx se přebírají z cache podle mtime a velikosti (474 zipů se nehashuje při každém běhu), po auth chybě se jde rovnou na login bez druhého marného pokusu, přejmenování notebooku jen jednou denně, mazání staré verze zdroje se přesunulo do upload workeru (skenování watcheru nic neblokuje) a opravená inicializace COM v `resolve_lnk` (příčina chyby `-2147221020` u WMI cleanupu).
- **`notebooklm-mcp-cli` upgradováno 0.7.7 → 0.9.6** (instalace je přes pip, ne uv, takže `uv tool upgrade` z hlášky by nefungoval). Monkey-patch `NLM_NO_HEADLESS` byl na 0.7.7 celou dobu tiše mrtvý (marker nesedí na skutečný text `base.py`); patche jsou přecílené na 0.9.x, po aplikaci se ohlásí a když nesedí, hlasitě varují. Přihlášení po upgradu ověřeno (`nlm login --check`); verze 0.8.2 navíc průběžně obnovuje cookies (RotateCookies), takže interaktivních loginů by mělo ubýt, a 0.9.3 zvládá migraci účtů na `notebook.google.com`.
- Testováno dvěma ostrými běhy `export_data.py --no-push`: výstupní data identická s předchozími, webový řetěz 30 až 32 s při ležícím Jikanu (dřív ~127 s). První ostrý běh celé automatizace chce dohled u konzole; záloha orchestrátoru je vedle něj v `Anime NotebookLM Updater.py.bak`.

---

## [1.2.0] - 2026-08-04

### 📄 Chytrý export DOCX rozborů
- **`export_docx_categories.py` je nově inkrementální.** Otisk obsahu (`word/document.xml` plus `word/numbering.xml`, očištěný o náhodné identifikátory Wordu) se drží v `tools/docx_export_cache.json`, takže se parsují jen změněné rozbory a zbytek se převezme z minulého běhu. Z 474 souborů při každém exportu je běžný běh dnes prakticky nulový. Kompletní přeparse vynutí `--full`, zkušební výstup jinam `--out`.
- **Cache se váže na `PARSER_VERSION`.** Když se změní pravidla parsování, cache se sama zahodí a vše se naparsuje znovu, aby v JSONu nezůstaly výsledky podle staré logiky.
- **Nový kontrolní výpis po každém exportu:** tituly bez jediné kategorie a tituly s míň epizodami, než kolik jich má v `anime_list.json`. Nadpis mimo `HEADING_MAP` totiž propadne tiše a dosud se to poznalo až na webu.

### 🔧 Opravy parseru rozborů (18 titulů)
- **Kategorie už nevisí na nadpisu „Animace".** Rozbor, který má první kapitolu pojmenovanou jinak (např. „2. Analýza animace (2D)" u Tower of God), přicházel o **všechny** kategorie, i o ty, které se namapovat uměly. Nově se při prázdném výsledku jede druhý průchod, kde jako začátek stačí libovolná namapovaná kategorie. Dokumenty, které se parsovaly správně, se tím nemůžou rozbít, protože pro ně druhý průchod vůbec nenastane.
- **Nadpisy typu „5. Technická analýza animace: 2D a Background Art"** se rozpoznají odloupnutím uvozovacího „analýza / rozbor / dekonstrukce". Schválně jen u číslovaných sekcí: nečíslovaný tučný podnadpis uvnitř textu („Analýza Adaptace:") by se jinak namapoval na kategorii, utnul rozepsaný text a část rozboru by se ztratila.
- **Rozpoznávání epizod zvládá i „2.1 Epizoda 1: …", „1. Děj Epizody 1: …" a „1.1 Angel Beats! Special 1: …".** Pojistky, které tam musí zůstat: nadpis souhrnu děje není epizoda, i když v něm číslo epizody padne („1. Shrnutí Děje (Chronologicky EP 13–EP 24)"), a uvnitř rozepsaného děje se na epizodu láme jen nadpis začínající rovnou klíčem, jinak by filmy a speciály přišly o tlačítko „Děj".
- **Poslední epizoda se už neztrácí.** U rozborů bez nadpisu „Animace" nebyla nikdy uložena, protože se čekalo na další nadpis, který nepřišel.
- Výsledek ověřen porovnáním celého výstupu proti předchozímu: **žádný titul nepřišel o kategorii, epizodu, děj ani o kus textu**, přibylo 568 tisíc znaků. Zbývají dva neúplné rozbory (`Fullmetal Alchemist: Brotherhood OVA Collection`, `Is It Wrong to Try to Pick Up Girls in a Dungeon?, S05`), ty hlásí nový kontrolní výpis.

### 🖼️ Předstažené postery pro Cestu Anime
- **Nový `tools/download_journey_posters.py`:** stáhne postery z MAL do `public/images/posters/` (482 souborů, 5,7 MB, zmenšeno na 140 px) a vytvoří index `public/data/posters_index.json`. Inkrementální, stahuje jen nové tituly a postery se změněnou adresou.
- **Pás anime v maximalizované Cestě bere postery z repozitáře.** Dřív se tahaly za běhu z Jikanu, což se na mém počítači neprojevilo (poster zůstal v `localStorage`), ale na cizím počítači to znamenalo stovky dotazů přes rate limit, spoustu chyb 504 a místo posterů moje vlastní náhledovky na šířku.
- **Nouzová náhledovka se už neukládá natrvalo.** Když Jikan i AniList selhaly, zapsala se do `localStorage` a poster se pak nedotáhl nikdy, ani když API zase začalo odpovídat.
- Karty „Nejlepší Anime" a orby v minimalizovaném pásu **zůstávají na vlastních náhledovkách**, tam je to záměr.

### 🏆 Ostřejší postery v Top Favorites
- **Nový `tools/build_top_favorites_thumbs.py`** používá stejný postup jako `build_cover_thumbs.py` u obalů OST: karta kreslí poster do pole 222 x 334 px, ale většina souborů má 1000 x 1426 px a prohlížeč je zmenšuje 4,5x metodou, která rozbíjí tenkou linku anime kresby. Zmenšeniny na 450 px jsou hotové filtrem LANCZOS s jemným doostřením, takže prohlížeč nezmenšuje nic. Nejvíc to bylo vidět u Witch Hat Atelier, Madoka Magica a DanMachi; Spice and Wolf vypadal dobře, protože jeho soubor má jen 425 px.
- Postery, které už jsou dost malé, se do `thumbs/` jen zkopírují. Soubor tam musí být pro každý poster anime, jinak by prohlížeč u chybějící zmenšeniny nejdřív dostal chybu 404 a teprve pak sáhl po originálu.
- **Obrázků postav se to netýká**, ty zůstávají beze změny. Skript si bere seznam z `top_favorites.json` (jen `top10_anime` a `hm_anime`), takže na postavy nemůže sáhnout omylem.
- Přenášená data u posterů anime: 7,2 MB → 3,1 MB. Skript je inkrementální (přepočítá jen to, co má novější originál) a je napojený na export.
- **Opravena mezera u obalů OST:** `build_cover_thumbs.py` dosud přeskakoval každou zmenšeninu, která existovala, takže **vyměněný obal si nechal starou zmenšeninu** a na webu se změna neprojevila. Nově se porovnávají časy souborů, stejně jako u posterů.
- **Obě sady zmenšenin se teď dělají samy** jako součást `export_data.py`. Nový nebo vyměněný obrázek se zmenší při nejbližším exportu, bez ručního spouštění.

### 🚑 Opravy exportní pipeline (nalezeno při ostrém běhu)
- **`download_imdb_cache.py` padal na `unhashable type: list`.** Zdroj mapování MAL → IMDb (Fribb) začal vracet `imdb_id` jako seznam místo řetězce, takže se skript nedokončil a IMDb cache ležela 65 dní neaktualizovaná. Nově se zvládají obě podoby a berou se **všechna** ID, ne jen první (46 titulů jich má víc než jedno). **Pokrytí epizod IMDb hodnocením stouplo z 88,5 % na 96,1 %** (2996 z 3116 epizod).
- **`download_jikan_cache.py` padal na `int(None)`.** Pole `episodes` může být přímo `null` u právě vysílaných a plánovaných titulů a `.get('episodes', 0)` to nezachytí, protože klíč existuje. Opraveno na `int(a.get('episodes') or 0)`.
- **Export se zasekával na dotazu od gitu.** Repozitář leží v OneDrive, který drží zámky na souborech, takže automatický úklid gitu neuspěl smazat už zabalené objekty a zeptal se `Deletion of directory '.git/objects/xx' failed. Should I try again? (y/n)`. Export běží bez konzole, na kterou by šlo odpovědět, takže tam zůstal viset s hotovým commitem a neprovedeným pushem. Git příkazy v exportu teď dostávají `-c gc.auto=0`; ruční `git gc` funguje dál.

### 🔗 Ostatní
- **IMDb cache se obnovuje s exportem.** `export_data.py` spustí `download_imdb_cache.py`, ale jen když je cache starší než 7 dní (stahuje datové sady o desítkách MB). Selhání refreshe export neshodí. Dosavadní cache byla stará 65 dní, což je důvod, proč IMDb hodnocení chybělo u části epizod.
- **`meta referrer` změněn z `no-referrer` na `strict-origin`.** YouTube u licencovaných skladeb (např. „Gats" z kanálu Susumu Hirasawa - Topic) vyžaduje vědět, která stránka přehrávač vkládá, a bez toho vrací chybu 153 místo hudby. Na server teď chodí jen holá doména. Indexaci to neovlivňuje, tu drží `meta robots` a `robots.txt`.
- **Nadpis karty na Dashboardu** přejmenován na „Sledování Anime (Dashboard)".
- **README odkazuje na živý web.**

---

## [1.1.1] - 2026-08-02

### 🧭 Dashboard
- **Rozbalený blok „Poslední & Binge & Nejdelší" je zase nahoře** nad Statusem, jak byl původně. Prohození sloupců u karet pod ním (dřív jeden ostrý skok, „flicker") nyní plynule přejede: FLIP animace 180 ms, jen vodorovný posun, respektuje `prefers-reduced-motion`. Rychlost je konstanta `FLIP_MS` v `Dashboard.jsx`.

### 🎵 Názvy skladeb v OST přehrávači
- **`ostTrackTitle.js` přepsán** z pevných vzorů na hledání opakující se slupky napříč celým playlistem. Pevný vzor buď nesedl (Re:Zero má za slovem „Ost" rovnou číslo, ne pomlčku), nebo sedl moc.
- **Opravena regrese u Attack on Titan:** starý vzor na `OST -` ukusoval celý název skladby, takže 63 položek se jmenovalo „Hiroyuki Sawano".
- Nově se čistí i **konce názvů** („— SPY x FAMILY [OST]", „[… Original Soundtrack]") a název anime slouží jako vodítko.
- Pojistky: koncová slupka musí začínat oddělovačem (jinak by se ze skutečného názvu „Beyond the Journey's End" stalo „Beyond the") a neusekne se nic, po čem by dvě různé skladby měly stejný název.
- Ověřeno na 30 playlistech a 2 400 skladbách, bez nových duplicit. Nejvíc opraveno u Re:Zero, Attack on Titan, Garden of Sinners, Spy x Family, Tower of God a Girls' Last Tour.

### 🧹 Úklid
- **Zrušen mrtvý `npm run deploy`.** Web nasazuje workflow z větve `main`, zatímco `deploy.js` force-pushoval build do větve `gh-pages`, kterou GitHub Pages vůbec nečte. Smazán skript, `deploy.js` i závislost `gh-pages`.
- **Dokumentace sloučena do jednoho zdroje pravdy** mimo repozitář (`../dokumentace/ZDROJ_PRAVDY.md`). Z repa zmizelo 18 zastaralých .md (implementační plány 1 až 9, migrační plán, research dokumenty) a 22 obrázků k nim, celkem asi 4,3 MB.
- **Smazán mrtvý duplikát `scripts/fetchAnimeMetadata.js`.** Existoval vedle `.cjs` verze, měl starší schéma (jen skóre a obrázky, bez `broadcast`) a hlavně se vůbec nedal spustit: `package.json` má `"type": "module"`, takže `require()` v souboru s příponou `.js` skončí na `require is not defined`. Živá je `.cjs` verze.
- **Odstraněny mrtvé jednorázové pomůcky z kořene repa:** `run_debug_tree.js` (importoval smazaný `xpEngines` z Research Tree), `extract_chart_sizes.py` (četl dávno přejmenovaný `A-List.xlsm`), `find_jikan_cache.py` (natvrdo stará cesta z Antigravity workspace), `debug_console.py`, `download_all_posters.cjs`, celá složka `scratch/` (7 souborů) a `netlify.toml` (web běží na GitHub Pages, ne na Netlify).

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
