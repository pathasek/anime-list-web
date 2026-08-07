Aktualizováno 6. 8. 2026 (Claude): smazány splněné body 22 a 23, u zbývajících
krátký stav. Hotové ze 6. 8.: Cesta Anime (filmový pás), Dabing redesign,
Top Favorites přepínač, mobilní spodní lišta, OST typy z rozborů, hlavička
OST přehrávače na laptopech (bod 22), oprava git pushe exportu. Bod 23
(BEST PIECES černá obrazovka) se nepotvrdil: na tvém PC funguje, přehrávač
se neměnil, na cizím PC šlo nejspíš o přechodný stav YouTube/reklamy.
Detaily v CHANGELOG.md (1.5.0) a dokumentace/ZDROJ_PRAVDY.md.

1) Písničky se nepřehrají, když hrají v MS EDGE tabu a ten tab není selected (respektive hrají, ale nepustí se další písnička) -> OST player v FAVOURITE OP/ED/OST
   [STAV 6. 8.: otevřené. Příčina i návrh opravy v ZDROJ_PRAVDY §8 (Edge škrtí časovače neaktivního tabu, týká se jen pieces režimu). Oprava = zásah do chráněného přehrávače, jen na výslovný pokyn a se zálohou.]
3) Použít Claude DESIGN pro Top Favourites a úplně předělat/optimalizovat
   [STAV 7. 8.: HOTOVO. Top Favourites plně předělané podle designu 1A (panel, segmentový přepínač, karty jen postery s medailemi, název + MAL/List + FH až na hover, u postav bez ID). CHANGELOG 1.7.0.]
4) Použít Claude DESIGN prvky pro vylepšení některých věcí v Dashboard a jinde
   [STAV 7. 8.: rozšířeno. Kromě Dabingu a Cesty Anime nově předělané i Recommendations (1b), Plan to Watch a horní část Favourite OP/ED/OST podle Claude Designu (barvy přes proměnné témat, funkčnost zachovaná). CHANGELOG 1.7.0. Další prvky podle dalších podkladů.]
9) Přidat AniDB relation chart map pro série do svého listu Anime List Web
   [STAV: research hotový (ZDROJ_PRAVDY §8, varianta B). Potřebuje tvou registraci AniDB API klienta, pak jednorázově ~20 min stahování s trvalou cache.]
10) Já bych chtěl udělat rozsáhlou revizi recenzní.
Většina z nich od srpna 2025 do dubna 2026 je napsaná s asistencí AI a úplně se mi nelíbí - chtěl bych je přepsat znovu s AI, ale tentokrát s lepším promptem a mým stylem.
Anime, které jsem viděl poprvé nebo rewatched od května 2026 má vykřičník, ale je to už lepší.
Prosím, sestav comprehensive prompt v "task.md" s názvem třeba: "Plán přepsání recenzní.md" a vysvětlivku budoucího plánu - přepsání recenzní pomocí AI, ale kvalitněji.
Zapiš tam všechny anime, které mají recenze a i speciální typy (kde není recenzne, ale nějaký text v poznámce je u daného Anime (třeba Steins;Gate...)).
Tento dokument ulož v projektu taky.
Předchozí dokument se mi líbí a nech ho být (20K+ slov).
----> viz projekt v Claude z 04.08.2026, použít Claude Opus 4.6 na přepis
   [STAV: připraveno k realizaci na vyžádání. Inventář recenzí i poznámek se dá vygenerovat z category_texts.json + notes.json.]
11) Optimalizace místa Claude/AI projektů (GB na disku) -> projít
   [STAV: mimo webový repozitář, systémová věc.]
13) Optimalizovat tvoření rozborů pro NotebookLM - - přidat osnovy a vylepšit formát i pro manuální čtení (indexing: rozdělení dějové a kategorie části s popisem kategorií /co znamená originalita, co znamená dějová část.., markdown). Viz: https://www.perplexity.ai/search/be367bfd-da54-479c-abe3-3d0fd40c5efa
   [STAV: mimo web (docx pipeline / orchestrátor, editace jen se zálohou .bak).]
14) Vylepšit kvalitu nahrávání OP/ED -> menší soubory, vyšší kvalita (už mám na ploše skript)
   [STAV: mimo web, skript na ploše.]
15) Vylepšit audit rozborů tak, aby dal mínusové body priority pro filmy (v sérii)/OVA/Specials (short ones) -> Excel VBA
   [STAV: Excel VBA, mimo web.]
16) Začít přidávat další grafy z Excelu na web (opravdu bych chtěl similar z Excelu s možností customizace obrázků)
   [STAV: čeká na upřesnění - které konkrétní grafy a co přesně znamená „customizace obrázků".]
19) K modalu hodnocení epizod: přidat vertical bar animovaný, který se mění podle kategorií (animace, OST, emoce... epizody jsou kulminace kategorií a nejoyment je kluminace kategorií taky... hmm)
   [STAV 6. 8.: odloženo na tvůj pokyn. Bloker: v datech nejsou per-epizodní hodnocení kategorií (episode_ratings.json má jen jedno číslo na epizodu); bez rozšíření Excelu a exportu to nejde.]
21) Zkusit vymyslet kodex/wiki pro Anime z mých rozborů a sematické/quick vyhledávání na webu
   [STAV: velký projekt, nezačato. Rychlé textové hledání jde hned; sémantické potřebuje upřesnit rozsah a infrastrukturu.]
24) Změnit kvalitu/čtivost u rozborů modalů - bolí oči
   [STAV: nové (6. 8.). Potřebuju upřesnit, který modal a co bolí (velikost písma, kontrast, šířka řádku?). Typograficky jde vylepšit rychle, jakmile řekneš detaily.]
