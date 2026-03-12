/**
 * NODE_DICTIONARY
 * YGGDRASIL V2 (Titan Expansion): Massive horizontal expansion, dynamic math thresholds, deep Lore, and organic flow.
 * 96 Total Nodes across 8 layers. Single connected organism originating from singularity.
 */
export const NODE_DICTIONARY = [
    // ─── L0: Genesis (x = 0) ───
    { 
        id: 'singularity', label: 'První Anime', domain: 'primary', x: 0, y: 0, dependencies: [], 
        reqBase: 100, reqMultiplier: 1.0, maxLevel: 1,
        description: "Vaše cesta právě začíná. Zkoukne-li člověk alespoň jedno anime, už z tohoto kolotoče nelze vysednout. Každá série, kterou uvidíte, přidává kapku zkušeností do tohoto jádra."
    },

    // ─── L1: First Steps (x = 500) ───
    { id: 'genre_explorer', label: 'Cestovatel Žánry', domain: 'purple', x: 800, y: -4000, dependencies: ['singularity'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Objevování nových světů. Získáváte XP za každý unikátní žánr, který si připíšete do svého listu." },
    { id: 'studio_connoisseur', label: 'Lovec Studií', domain: 'orange', x: 800, y: -2000, dependencies: ['singularity'], reqBase: 2000, reqMultiplier: 2.2, maxLevel: 5, description: "Rozpoznáte styl animace od prvního framu. Každé nové animační studio vám dává zkušenosti." },
    { id: 'chronos_novice', label: 'Strážce Času', domain: 'emerald', x: 800, y: 0, dependencies: ['singularity'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Čas plyne a vy ho měníte ve zhlédnuté epizody. XP rostou s každou minutou, kterou strávíte u obrazovky." },
    { id: 'audio_listener', label: 'První Soundtrack', domain: 'cyan', x: 800, y: 2000, dependencies: ['singularity'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 5, description: "Hudba dokáže anime povýšit na umění. Tento uzel sleduje vaši lásku k originálním soundtrackům a znělkám." },
    { id: 'rating_reviewer', label: 'První Hodnocení', domain: 'red', x: 800, y: 4000, dependencies: ['singularity'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Nejsi jen pasivní konzument, chceš promluvit do světa. Hodnoť a kritizuj, abys zvyšoval úroveň tohoto uzlu." },

    // ─── L2: Specialization (x = 1000) ───
    // Genre Branch - Expanded
    { id: 'genre_action', label: 'Nával Adrenalinu', domain: 'purple', x: 1600, y: -6500, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Ať už jde o pěstní souboje nebo obří meče, čistokrevná akce vám doplňuje XP." },
    { id: 'genre_horror', label: 'Noční Můra', domain: 'purple', x: 1600, y: -5500, dependencies: ['genre_action'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Znáte pocit strachu? Temnota skrývá stíny, a vy je s radostí vyhledáváte." },
    { id: 'genre_romance', label: 'Červená Nit', domain: 'purple', x: 1600, y: -4500, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.1, maxLevel: 5, description: "Sledování rozmazaných vztahů a školních románků. Kdo z nás by netlačil lodičky postav?" },
    { id: 'genre_drama', label: 'Slzy a Krev', domain: 'purple', x: 1600, y: -3800, dependencies: ['genre_romance'], reqBase: 1200, reqMultiplier: 2.0, maxLevel: 5, description: "Melodrama, pláč a utrpení. Pro ty, kdo milují silné emoce." },
    { id: 'genre_mystery', label: 'Hledač Pravdy', domain: 'purple', x: 1600, y: -2800, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.2, maxLevel: 5, description: "Kdo je vrah? Kde je pravda? Detektivky a záhady sytí vaši touhu po poznání." },
    { id: 'genre_sports', label: 'Do Posledního Dechu', domain: 'purple', x: 1600, y: -1800, dependencies: ['genre_explorer'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "I pro ty, co reálně nesportují. Krev, pot a síla přátelství na hřišti." },
    { id: 'genre_scifi', label: 'Sci-fi Technologie', domain: 'purple', x: 1600, y: -800, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Lasery, vesmírné lety a dystopická budoucnost." },
    { id: 'genre_comedy', label: 'Smíchova Alej', domain: 'purple', x: 1600, y: 200, dependencies: ['genre_explorer'], reqBase: 800, reqMultiplier: 1.8, maxLevel: 5, description: "Jste tu pro zábavu a gagy. Smích prodlužuje život, aspoň ten animovaný." },
    { id: 'genre_fantasy', label: 'Brány Říše', domain: 'purple', x: 1600, y: 1200, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Magie, elfové a draci. Útěk do jiných realit." },

    // Studio Branch
    { id: 'studio_kyoani', label: 'KyoAni Estét', domain: 'orange', x: 1600, y: -3200, dependencies: ['studio_connoisseur'], reqBase: 1500, reqMultiplier: 2.2, maxLevel: 5, description: "Kyoto Animation ztělesňuje jemnost, detail a neuvěřitelnou emoci." },
    { id: 'studio_mappa', label: 'MAPPA Továrna', domain: 'orange', x: 1600, y: -2200, dependencies: ['studio_connoisseur'], reqBase: 2000, reqMultiplier: 1.8, maxLevel: 5, description: "Tvrdá, filmově zpracovaná akce za cenu krve a potu animátorů." },
    { id: 'studio_madhouse', label: 'Šílencův Dům', domain: 'orange', x: 1600, y: -1200, dependencies: ['studio_connoisseur'], reqBase: 2500, reqMultiplier: 1.5, maxLevel: 5, description: "Madhouse, legenda, která neztratí svůj divoký, neomluvitelný styl." },
    { id: 'studio_bones', label: 'Z Kostí a Krve', domain: 'orange', x: 1600, y: -200, dependencies: ['studio_connoisseur'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Studio Bones, známé pro plynulou a fantastickou bojovou choreografii." },
    { id: 'studio_shaft', label: 'Nakloněné Hlavy', domain: 'orange', x: 1600, y: 800, dependencies: ['studio_connoisseur'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 5, description: "Avantgarda, textové prolínačky a ikonické praskání krku. Shaft je umění." },
    { id: 'studio_wit', label: 'Válečný Umělec', domain: 'orange', x: 1600, y: 1800, dependencies: ['studio_connoisseur'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Velkolepá produkce a neuvěřitelné adaptace. WIT Studio vás nepustí." },
    { id: 'misc_series_master', label: 'Sériový Znalec', domain: 'orange', x: 1600, y: 2500, dependencies: ['studio_connoisseur'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Neunikne vám ani jedno OVA. Vyhledáváte celé univerza a franšízy." },

    // Chronos Branch
    { id: 'chronos_binge', label: 'Noční Jízda', domain: 'emerald', x: 1600, y: -2000, dependencies: ['chronos_novice'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Proč spát, když má série ještě pět epizod? Za bingování dáváme XP." },
    { id: 'chronos_turtle', label: 'Želví Poutník', domain: 'emerald', x: 1600, y: -1300, dependencies: ['chronos_novice'], reqBase: 5, reqMultiplier: 2.0, maxLevel: 5, description: "Pomalý a rozvážný divák. Vychutnává si anime pekne díl po dílu." },
    { id: 'chronos_streak', label: 'Neporušený Řetěz', domain: 'emerald', x: 1600, y: -300, dependencies: ['chronos_novice'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Pravidelnost jako železné pravidlo. Anime každý den, ani jeden nevynechaný." },
    { id: 'chronos_seasonal', label: 'Sezónní Lovec', domain: 'emerald', x: 1600, y: 400, dependencies: ['chronos_novice'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Věrný divák airing sezón. Čekat týden na epizodu je pro vás denní chleba." },
    { id: 'fmt_retro', label: 'VHS Kazeta (90s)', domain: 'emerald', x: 1600, y: 1400, dependencies: ['chronos_novice'], reqBase: 1000, reqMultiplier: 3.0, maxLevel: 5, description: "Klasický cell shading. Sledování všeho, co vyšlo před rokem 2000." },
    { id: 'fmt_ova', label: 'Sběratel VHS', domain: 'emerald', x: 1600, y: 2400, dependencies: ['chronos_novice'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Obscurní formáty Original Video Animation a bonusové epizody." },
    { id: 'misc_completionist', label: 'Dokončovatel', domain: 'emerald', x: 1600, y: 3700, dependencies: ['chronos_novice'], reqBase: 1000, reqMultiplier: 1.5, maxLevel: 5, description: "Zásadně titul dokoukáte. Rozepsaných moc nezbývá." },

    // Audio Branch
    { id: 'audio_frisson', label: 'Husí Kůže', domain: 'cyan', x: 1600, y: -700, dependencies: ['audio_listener'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Skladby, co vám naježí chlupy na rukou. Hluboký estetický hudební zážitek." },
    { id: 'audio_singalong', label: 'Zpěvák ve Sprše', domain: 'cyan', x: 1600, y: 300, dependencies: ['audio_listener'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Songy, co prostě musíte řvát s interpretem. Ať už umíte japonsky nebo ne." },
    { id: 'audio_op_collector', label: 'Sběratel Openingů', domain: 'cyan', x: 1600, y: 1000, dependencies: ['audio_listener'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Opening Thematic Songs. Vaše kolekce ranního hypu." },
    { id: 'audio_ed_collector', label: 'Sběratel Endingů', domain: 'cyan', x: 1600, y: 2000, dependencies: ['audio_listener'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Ending Thematic Songs. Náladové a temnější tracky." },
    { id: 'misc_sub_purist', label: 'Čistokrevný Sub', domain: 'cyan', x: 1600, y: 3000, dependencies: ['audio_listener'], reqBase: 1000, reqMultiplier: 1.8, maxLevel: 5, description: "Sledujete výhradně japonský originál s titulky. Seiyuu jsou nezastupitelní." },

    // Ratings Branch
    { id: 'rating_strict', label: 'Neoblomný Kritik', domain: 'red', x: 1600, y: 1600, dependencies: ['rating_reviewer'], reqBase: 5000, reqMultiplier: 2.0, maxLevel: 5, description: "Nebojíš se stisknout známku nižší než 5. Za tuto odvahu ješ odměněn těmito zkušenostmi." },
    { id: 'demo_shounen', label: 'Shounen Odvaha', domain: 'primary', x: 1600, y: 2600, dependencies: ['rating_reviewer'], reqBase: 5000, reqMultiplier: 1.8, maxLevel: 5, description: "Zaměřeno primárně na dospívající publikum, s důrazem na akci a přátelství." },
    { id: 'rating_category', label: 'Multidimenzionální Kritik', domain: 'red', x: 1600, y: 3600, dependencies: ['rating_reviewer'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Jedno číslo nestačí. Hodnotíte animaci, OST, příběh, a všechny ostatní aspekty." },
    { id: 'rating_episodic', label: 'Epizodní Chirurg', domain: 'red', x: 1600, y: 4300, dependencies: ['rating_reviewer'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Každá epizoda je pod drobnohledem. Pečlivě sledujete výkyvy kvality." },
    { id: 'notes_scribe', label: 'Písař', domain: 'red', x: 1600, y: 5000, dependencies: ['rating_reviewer'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Nedržíš to v sobě. Píšeš poznámky, myšlenky a recenze." },

    // ─── L3: Deep Dive & Niches (x = 1500) ───
    { id: 'genre_isekai', label: 'Převtělený Hrdina', domain: 'purple', x: 2400, y: -6500, dependencies: ['genre_action'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Srazil vás náklaďák (Truck-kun)? Výborně, další fantasy svět na záchranu." },
    { id: 'trope_gore', label: 'Krvavá Lázeň', domain: 'purple', x: 2400, y: -5500, dependencies: ['genre_horror'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 4, description: "Litry krve, utržené končetiny, body horror. Žaludek máš ze železa." },
    { id: 'trope_psychological', label: 'Zlomená Mysl', domain: 'purple', x: 2400, y: -5000, dependencies: ['genre_horror'], reqBase: 1500, reqMultiplier: 2.2, maxLevel: 4, description: "Teror, který nepochází z monster, ale z hloubi lidské zkaženosti." },
    { id: 'genre_slice', label: 'Kavárny a Pohoda', domain: 'emerald', x: 2400, y: -4500, dependencies: ['genre_romance'], reqBase: 1200, reqMultiplier: 1.8, maxLevel: 5, description: "Pohodové 'Slice of Life' anime, které pohladí na duši po těžkém dni v práci." },
    { id: 'trope_school', label: 'Školní Zvonění', domain: 'purple', x: 2400, y: -4000, dependencies: ['genre_romance'], reqBase: 1000, reqMultiplier: 1.8, maxLevel: 5, description: "Školní uniformy, festivaly a testy. Jádro anime kultury." },
    { id: 'genre_tragedy', label: 'Tragédie Osudu', domain: 'purple', x: 2400, y: -3800, dependencies: ['genre_drama'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 4, description: "Někdy to prostě nekončí dobře. Vaše slzy živí tento uzel." },
    { id: 'trope_found_family', label: 'Nalezená Rodina', domain: 'purple', x: 2400, y: -3000, dependencies: ['genre_drama'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 4, description: "Pokrevní příbuzní jsou overrated. Rodinu si vytvoříte s těmi, co vás milují." },
    { id: 'genre_psycho', label: 'Psychologický Pád', domain: 'red', x: 2400, y: -2500, dependencies: ['genre_mystery'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Když díla pronikají do nejhlubších zákoutí temné lidské psychiky." },
    { id: 'genre_mecha', label: 'Robotický Pilot', domain: 'purple', x: 2400, y: -1300, dependencies: ['genre_scifi', 'genre_action'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 5, description: "Obří metalické zbraně. Naskočte do robota a braňte lidstvo!" },
    { id: 'trope_dystopia', label: 'Dystopický Svět', domain: 'purple', x: 2400, y: -500, dependencies: ['genre_scifi'], reqBase: 2000, reqMultiplier: 2.2, maxLevel: 4, description: "Budoucnost se spálila na popel. Totalita, kyborgové nebo post-apo pustiny." },
    { id: 'trope_parody', label: 'Parodista', domain: 'purple', x: 2400, y: 500, dependencies: ['genre_comedy'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 4, description: "Smějete se sami sobě i žánru. Nic není svaté." },
    { id: 'trope_magic', label: 'Arkána Magie', domain: 'purple', x: 2400, y: 1200, dependencies: ['genre_fantasy'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Čarodějové, kruhy a starověké svitky zaklínadel." },
    { id: 'rating_animace', label: 'Sakuga Lovec', domain: 'orange', x: 2400, y: -3200, dependencies: ['studio_kyoani', 'rating_category'], reqBase: 3000, reqMultiplier: 2.0, maxLevel: 5, description: "Oceňujete dokonalou, plynulou animaci napříč odvětvími." },
    { id: 'misc_franchise', label: 'Franchisový Guru', domain: 'orange', x: 2400, y: 2200, dependencies: ['misc_series_master'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 4, description: "Desítky spin-offů, prequelů, side-story? Pro vás žádný problém." },
    { id: 'chronos_nightowl', label: 'Noční Sova', domain: 'emerald', x: 2400, y: -2000, dependencies: ['chronos_binge'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Slunce už dávno zapadlo, ale obrazovka stále září. Noci patří vám." },
    { id: 'chronos_marathon', label: 'Železný Maraton', domain: 'emerald', x: 2400, y: -300, dependencies: ['chronos_streak'], reqBase: 1500, reqMultiplier: 2.5, maxLevel: 5, description: "Více než 10 epizod za jediný den. To už není hobby, to je výkon." },
    { id: 'era_2000s', label: 'Éra Nového Milénia', domain: 'cyan', x: 2400, y: 1800, dependencies: ['fmt_retro'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Léta 2000-2009. Přechod na digitál, úsvit internetové weeb kultury." },
    { id: 'fmt_movie', label: 'Filmový Kritik', domain: 'cyan', x: 2400, y: 1700, dependencies: ['fmt_retro'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Zavíráte se do celovečerních animovaných zážitků." },
    { id: 'fmt_short', label: 'Jednohubky', domain: 'cyan', x: 2400, y: 2400, dependencies: ['fmt_ova'], reqBase: 1000, reqMultiplier: 1.8, maxLevel: 5, description: "Krátké série a miniepizody. Rychlá dávka narativu." },
    { id: 'misc_dropped', label: 'Odložené Sny', domain: 'emerald', x: 2400, y: 3200, dependencies: ['misc_completionist'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Někdy to prostě nejde. Život je moc krátký na špatné anime." },
    { id: 'misc_onhold', label: 'Očistec', domain: 'emerald', x: 2400, y: 3700, dependencies: ['misc_completionist'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Zamrznuto v čase. Jednou se k tomu vrátíte. Možná." },
    { id: 'misc_hundred_club', label: 'Klub Stovky', domain: 'emerald', x: 2400, y: 4200, dependencies: ['misc_completionist'], reqBase: 5000, reqMultiplier: 2.0, maxLevel: 3, description: "Dokončit 100 sérií je první skutečný milník otaku kariéry." },
    { id: 'audio_emotion', label: 'Slzy v Melodii', domain: 'cyan', x: 2400, y: -700, dependencies: ['audio_frisson'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 5, description: "Husí kůže je jen začátek, tyhle tracky vámi otřásly od základů." },
    { id: 'audio_hype', label: 'Adrenalinová Vlna', domain: 'cyan', x: 2400, y: 300, dependencies: ['audio_singalong'], reqBase: 2500, reqMultiplier: 2.0, maxLevel: 4, description: "Čirá energie. 200 BPM a elektrické kytary drtí vaši lebku." },
    { id: 'misc_dub_enjoyer', label: 'Dabingový Gurmán', domain: 'cyan', x: 2400, y: 3000, dependencies: ['misc_sub_purist'], reqBase: 1000, reqMultiplier: 1.8, maxLevel: 5, description: "Někdy po práci nezvládáte číst titulky. Anglický (či jiný) dabing je spása." },
    { id: 'omega_elitist', label: 'ULTIMATE: Elitista', domain: 'red', x: 2400, y: 1000, dependencies: ['rating_strict'], reqBase: 20000, reqMultiplier: 2.5, maxLevel: 5, description: 'Nic co vyšlo po roce 2011 "neprodává esenci pravého media".' },
    { id: 'demo_seinen', label: 'Seinen Filozof', domain: 'cyan', x: 2400, y: 2300, dependencies: ['demo_shounen'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 5, description: "Přejití k dospělým traumatům, morálním ambiguitám a hlubším tématům." },
    { id: 'rating_ost_perf', label: 'OST Dokonalost', domain: 'red', x: 2400, y: 2800, dependencies: ['rating_category'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 5, description: "Udělení dokonalé desítky za úžasný audio zážitek celé série." },
    { id: 'rating_enjoyment', label: 'Čistý Požitek', domain: 'red', x: 2400, y: 3600, dependencies: ['rating_category'], reqBase: 3000, reqMultiplier: 2.0, maxLevel: 5, description: "Může to být objektivně škvár, ale vy jste si to naplno užili." },
    { id: 'rating_waifu', label: 'Srdcový Kurz', domain: 'red', x: 2400, y: 3800, dependencies: ['rating_category'], reqBase: 2500, reqMultiplier: 2.0, maxLevel: 5, description: "Jedno oko zavřené nad dějem, druhé upřené na best girl." },
    { id: 'fav_pantheon', label: 'Pantheon Favoritů', domain: 'red', x: 2400, y: 4300, dependencies: ['rating_category'], reqBase: 5000, reqMultiplier: 2.0, maxLevel: 5, description: "Aktivně doplňujete Top 10 anime a pečlivě je kurátorujete." },
    { id: 'rating_variance', label: 'Emoční Výkyvy', domain: 'red', x: 2400, y: 4800, dependencies: ['rating_episodic'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Série vás provlekla od 10.0 pecek k průměrným fillerům." },
    { id: 'rating_peak', label: 'Absolutní Vrchol', domain: 'red', x: 2400, y: 5000, dependencies: ['rating_episodic'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Udělení plných 10.0 na epizodické úrovni. Epické odhalení nebo sakuga fest." },
    { id: 'rating_consistency', label: 'Neochvějný Standard', domain: 'red', x: 2400, y: 5500, dependencies: ['rating_episodic'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 4, description: "Série s neuvěřitelně ustálenou kvalitou od první do poslední minuty." },
    { id: 'notes_essayist', label: 'Esejista', domain: 'red', x: 2400, y: 6000, dependencies: ['notes_scribe'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 5, description: "100 znaků je pro amatéry. Vy píšete rozsáhlé elaboráty a eseje na téma anime." },

    // ─── L4: Mastering Paths (x = 2000) ───
    { id: 'trope_op_mc', label: 'Overpowered Hrdina', domain: 'purple', x: 3200, y: -6500, dependencies: ['genre_isekai'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Kirito, Rimuru, Ainz. Sledování bohů převlečených za lidi." },
    { id: 'trope_darkfantasy', label: 'Temná Fantasy', domain: 'purple', x: 3200, y: -5500, dependencies: ['trope_gore'], reqBase: 3000, reqMultiplier: 2.0, maxLevel: 4, description: "Grimdark, beznaděj a monstra. Fantasy ve své nejdrsnější podobě." },
    { id: 'trope_iyashikei', label: 'Léčitel Duše', domain: 'emerald', x: 3200, y: -4500, dependencies: ['genre_slice'], reqBase: 3000, reqMultiplier: 2.0, maxLevel: 4, description: "Dosáhli jste stavu vnitřního klidu, Iyashikei anime vás kompletně zbavilo stresu." },
    { id: 'demo_shoujo', label: 'Shoujo Estét', domain: 'purple', x: 3200, y: -4000, dependencies: ['trope_school'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Oči velké přes půlku obličeje, třpytky a spletitá pavučina lidských vztahů." },
    { id: 'backlog_dreamer', label: 'Snílek Backlogu', domain: 'purple', x: 3200, y: -3500, dependencies: ['genre_tragedy'], reqBase: 500, reqMultiplier: 1.5, maxLevel: 5, description: "Plány a sny. Seznam 'Plan to Watch' je bezedná propsat nekonečných možností." },
    { id: 'trope_timeloop', label: 'Smyčka Času', domain: 'purple', x: 3200, y: -2500, dependencies: ['genre_psycho'], reqBase: 2500, reqMultiplier: 2.5, maxLevel: 4, description: "Steins;Gate, Re:Zero. Opakující se utrpení za účelem nalezení dokonalé linie." },
    { id: 'trope_survival', label: 'Přežití Nejsilnějších', domain: 'purple', x: 3200, y: -500, dependencies: ['trope_dystopia'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 4, description: "Death games, battle royale. Kdo zůstane naživu, vyhrává." },
    { id: 'trope_music', label: 'Budokan Koncert', domain: 'purple', x: 3200, y: 1200, dependencies: ['trope_magic'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 4, description: "Animované koncerty, idoly a zářící light sticky. Magie hudby v praxi." },
    { id: 'chronos_abyss', label: 'Bezedná Propast', domain: 'emerald', x: 3200, y: -2000, dependencies: ['chronos_nightowl'], reqBase: 8000, reqMultiplier: 3.0, maxLevel: 3, description: "Absolutní oběť spánkového cyklu oltáři japonské animace." },
    { id: 'chronos_ironman', label: 'Neúnavný Stroj', domain: 'emerald', x: 3200, y: 0, dependencies: ['chronos_marathon'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 4, description: "Udržet 10 epizod po celé dny vyžaduje disciplínu, kterou většina nemá." },
    { id: 'era_2010s', label: 'Zlatý Věk Streamingu', domain: 'cyan', x: 3200, y: 1800, dependencies: ['era_2000s'], reqBase: 2500, reqMultiplier: 2.5, maxLevel: 5, description: "Léta 2010-2019. Boom isekai, Crunchyroll explozí a Full HD standardizace." },
    { id: 'misc_two_hundred', label: 'Dvojitá Stovka', domain: 'emerald', x: 3200, y: 4200, dependencies: ['misc_hundred_club'], reqBase: 10000, reqMultiplier: 2.0, maxLevel: 3, description: "200 dokončených zářezů na pažbě. Uctyhodné skóre." },
    { id: 'omega_composer', label: 'Skladatel Duší', domain: 'cyan', x: 3200, y: -1000, dependencies: ['audio_emotion'], reqBase: 8000, reqMultiplier: 2.0, maxLevel: 5, description: "Sledujete autory, nejen samotnou hudbu. Znáte pečetě skladatelů jako je Sawano nebo Kajiura." },
    { id: 'audio_completeset', label: 'Kompletní Sbírka', domain: 'cyan', x: 3200, y: 2000, dependencies: ['audio_ed_collector'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 4, description: "Když milujete OP i ED a přidáte si oba z jedné série." },
    { id: 'misc_bilingual', label: 'Bilingvální Divák', domain: 'cyan', x: 3200, y: 3000, dependencies: ['misc_dub_enjoyer'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 4, description: "Ceníte si obou cest." },
    { id: 'fav_characters', label: 'Galerie Hrdinů', domain: 'red', x: 3200, y: 4000, dependencies: ['fav_pantheon'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 5, description: "Top 10 postav po boku Top anime. Budujete si svatostánek favoritů." },
    { id: 'rating_rollercoaster', label: 'Horská Dráha', domain: 'red', x: 3200, y: 4800, dependencies: ['rating_variance'], reqBase: 5000, reqMultiplier: 2.5, maxLevel: 4, description: "Z totální deprese 2.0 k osvícení 10.0 během pár epizod." },
    { id: 'rating_perfectionist', label: 'Perfekcionista', domain: 'red', x: 3200, y: 5000, dependencies: ['rating_peak'], reqBase: 8000, reqMultiplier: 2.5, maxLevel: 4, description: "Desítky padají jako na běžícím páse, nacházíte jen to absolutně nejlepší." },
    { id: 'notes_chronicler', label: 'Kronikář Anime', domain: 'red', x: 3200, y: 6000, dependencies: ['notes_essayist'], reqBase: 8000, reqMultiplier: 2.0, maxLevel: 5, description: "Vaše slova o anime by naplnila celé tlusté svazky encyklopedií." },

    // ─── L5: Omegas Convergence (x = 2600) ───
    { id: 'omega_shounen', label: 'ULTIMATE: Protagonista', domain: 'orange', x: 4160, y: -6500, dependencies: ['trope_op_mc'], reqBase: 10000, reqMultiplier: 2.0, maxLevel: 5, description: "Jste vtělením nakama power. Čeká vás výcvik v horách a následný power creep." },
    { id: 'omega_corporate_slave', label: 'ULTIMATE: Oáza', domain: 'emerald', x: 4160, y: -4500, dependencies: ['demo_seinen', 'trope_iyashikei'], reqBase: 15000, reqMultiplier: 2.0, maxLevel: 5, description: "Útěk od kruté reality do animovaného bezpečného přístavu." },
    { id: 'era_2020s', label: 'Nová Generace', domain: 'cyan', x: 4160, y: 1500, dependencies: ['era_2010s'], reqBase: 3000, reqMultiplier: 2.5, maxLevel: 5, description: "Léta po pandemii 2020+. Éra šílené animační inflace a gachaprodukcí." },
    { id: 'misc_three_hundred', label: 'Tricenturion', domain: 'emerald', x: 4160, y: 4500, dependencies: ['misc_two_hundred'], reqBase: 15000, reqMultiplier: 2.0, maxLevel: 3, description: "Třístovka. Zde se oddělují chlapci a dívky od mužů a žen. Obří penzum času." },
    { id: 'omega_audiophile', label: 'ULTIMATE: Audiofil', domain: 'cyan', x: 4160, y: 0, dependencies: ['omega_composer', 'rating_ost_perf'], reqBase: 20000, reqMultiplier: 2.5, maxLevel: 5, description: "Spojení hudby a dokonalého kritického sluchu (10.0 OST). Zvuk je všechno." },
    { id: 'fav_devoted', label: 'Zasvěcený Fanoušek', domain: 'red', x: 4160, y: 4000, dependencies: ['fav_characters'], reqBase: 10000, reqMultiplier: 2.0, maxLevel: 4, description: "Nejen top show a charakter, ale oddanost jedné značce přes obě kategorie." },
    { id: 'omega_analyst', label: 'ULTIMATE: Analytik', domain: 'red', x: 4160, y: 6000, dependencies: ['rating_category', 'rating_episodic', 'notes_chronicler'], reqBase: 25000, reqMultiplier: 2.0, maxLevel: 5, description: "Rozkládáte anime na šroubky. Kategorie, epizody, dlouhé texty. Absolutní znalec." },

    // ─── L6: Zenith & Ascensions (x = 3200) ───
    { id: 'era_current', label: 'Současný Meta', domain: 'cyan', x: 5120, y: 1500, dependencies: ['era_2020s'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Žijete v přítomnosti. Sledování toho, co práve teď letí sítí." },
    { id: 'omega_zenith', label: 'YGGDRASIL ZENITH', domain: 'primary', x: 5120, y: -5000, dependencies: ['omega_shounen', 'omega_elitist', 'omega_corporate_slave'], reqBase: 100000, reqMultiplier: 2.0, maxLevel: 5, description: "Osvícený stav čistého pozorovatele. Pravý otaku, se kterým se rojí legendy Akihabary." },

    // ─── L7: The Ultimate Singularity (x = 3800) ───
    { id: 'omega_absolute', label: 'YGGDRASIL ABSOLUTNÍ', domain: 'primary', x: 6080, y: 0, dependencies: ['omega_zenith', 'omega_analyst', 'omega_audiophile'], reqBase: 200000, reqMultiplier: 2.0, maxLevel: 5, description: "Singularita se hroutí sama do sebe. Dosáhli jste absolutního spojení hudby, analytického myšlení a veteránství. Uzel, který neměl být dosažen." }
];
