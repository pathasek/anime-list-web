/**
 * NODE_DICTIONARY
 * Redesigned to represent chronologically-flowing "Firsts" as requested.
 * X-axis spacing is generous, Y-axis branches out logical themes.
 * Titan V2 (Yggdrasil): Massive horizontal expansion with Demographics, Formats, Tropes, Habits and Omegas.
 */
/**
 * NODE_DICTIONARY
 * Redesigned to represent chronologically-flowing "Firsts" as requested.
 * Titan V3 (Yggdrasil): Massive horizontal expansion, dynamic math thresholds, and deep Lore descriptions.
 */
export const NODE_DICTIONARY = [
    // ─── L0: Genesis (x = 0) ───
    { 
        id: 'singularity', label: 'První Anime', domain: 'primary', x: 0, y: 0, dependencies: [], 
        reqBase: 100, reqMultiplier: 1.0, maxLevel: 1,
        description: "Vaše cesta právě začíná. Zkoukne-li člověk alespoň jedno anime, už z tohoto kolotoče nelze vysednout. Každá série, kterou uvidíte, přidává kapku zkušeností do tohoto jádra."
    },

    // ─── L1: First Steps (x = 500) ───
    { 
        id: 'genre_explorer', label: 'Cestovatel Žánry', domain: 'purple', x: 500, y: -600, dependencies: ['singularity'], 
        reqBase: 500, reqMultiplier: 2.0, maxLevel: 5,
        description: "Objevování nových světů. Získáváte XP za každý unikátní žánr, který si připíšete do svého listu."
    },
    { 
        id: 'studio_connoisseur', label: 'Lovec Studií', domain: 'orange', x: 500, y: -200, dependencies: ['singularity'], 
        reqBase: 2000, reqMultiplier: 2.2, maxLevel: 5,
        description: "Rozpoznáte styl animace od prvního framu. Každé nové animační studio vám dává zkušenosti."
    },
    { 
        id: 'chronos_novice', label: 'Strážce Času', domain: 'emerald', x: 500, y: 200, dependencies: ['singularity'], 
        reqBase: 1000, reqMultiplier: 3.5, maxLevel: 5,
        description: "Čas plyne a vy ho měníte ve zhlédnuté epizody. XP rostou s každou minutou, kterou strávíte u obrazovky."
    },
    { 
        id: 'audio_listener', label: 'První Soundtrack', domain: 'cyan', x: 500, y: 600, dependencies: ['singularity'], 
        reqBase: 5000, reqMultiplier: 2.5, maxLevel: 5,
        description: "Hudba dokáže anime povýsit na umění. Tento uzel sleduje vaši lásku k originálním soundtrackům a znělkám."
    },
    { 
        id: 'rating_reviewer', label: 'První Hodnocení', domain: 'red', x: 500, y: 1000, dependencies: ['singularity'], 
        reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5,
        description: "Nejsi jen pasivní konzument, chceš promluvit do světa. Hodnoť a kritizuj, abys zvyšoval úroveň tohoto uzlu."
    },

    // ─── L2: Specialization (x = 1000) ───
    // Genre Branch - Expanded Horizontally
    { id: 'genre_action', label: 'Nával Adrenalinu', domain: 'purple', x: 1000, y: -1000, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.0, maxLevel: 5, description: "Ať už jde o pěstní souboje nebo obří meče, čistokrevná akce vám doplňuje XP." },
    { id: 'genre_romance', label: 'Červená Nit', domain: 'purple', x: 1000, y: -800, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.1, maxLevel: 5, description: "Sledování rozmazaných vztahů a školních románků. Kdo z nás by netlačil lodičky postav?" },
    { id: 'genre_mystery', label: 'Hledač Pravdy', domain: 'purple', x: 1000, y: -600, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.2, maxLevel: 5, description: "Kdo je vrah? Kde je pravda? Detektivky a záhady sytí vaši touhu po poznání." },
    { id: 'genre_sports', label: 'Do Posledního Dechu', domain: 'purple', x: 1000, y: -400, dependencies: ['genre_explorer'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "I pro ty, co reálně nesportují. Krev, pot a síla přátelství na hřišti." },
    { id: 'genre_scifi', label: 'Sci-fi Technologie', domain: 'purple', x: 1000, y: -200, dependencies: ['genre_explorer'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Lasery, vesmírné lety a dystopická budoucnost. Budoucnost se stává přítomností." },

    // Studio Branch
    { id: 'studio_kyoani', label: 'KyoAni Estét', domain: 'orange', x: 1000, y: 0, dependencies: ['studio_connoisseur'], reqBase: 1500, reqMultiplier: 2.2, maxLevel: 5, description: "Kyoto Animation ztělesňuje jemnost, detail a neuvěřitelnou emoci." },
    { id: 'studio_mappa', label: 'MAPPA Továrna', domain: 'orange', x: 1000, y: 200, dependencies: ['studio_connoisseur'], reqBase: 2000, reqMultiplier: 1.8, maxLevel: 5, description: "Tvrdá, filmově zpracovaná akce za cenu krve a potu animátorů." },
    { id: 'studio_madhouse', label: 'Šílencův Dům', domain: 'orange', x: 1000, y: 400, dependencies: ['studio_connoisseur'], reqBase: 2500, reqMultiplier: 1.5, maxLevel: 5, description: "Madhouse, legenda, která neztratí svůj divoký, neomluvitelný styl." },
    { id: 'studio_bones', label: 'Z Kostí a Krve', domain: 'orange', x: 1000, y: 600, dependencies: ['studio_connoisseur'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Studio Bones, známé pro plynulou a fantastickou bojovou choreografii." },

    // Demographics & Rating
    { id: 'demo_shounen', label: 'Shounen Odvaha', domain: 'primary', x: 1000, y: 800, dependencies: ['rating_reviewer'], reqBase: 5000, reqMultiplier: 1.8, maxLevel: 5, description: "Zaměřeno primárně na dospívající publikum, s důrazem na akci a hodnotu přátelství." },
    { id: 'rating_strict', label: 'Neoblomný Kritik', domain: 'red', x: 1000, y: 1000, dependencies: ['rating_reviewer'], reqBase: 5000, reqMultiplier: 2.0, maxLevel: 5, description: "Nebojíš se stisknout známku nižší než 5. Za tuto odvahu ješ odměněn těmito zkušenostmi." },
    
    // ─── L3: Deep Dive & Niches (x = 1500) ───
    // Finer genre progression
    { id: 'genre_isekai', label: 'Převtělený Hrdina', domain: 'purple', x: 1500, y: -1000, dependencies: ['genre_action'], reqBase: 1500, reqMultiplier: 2.0, maxLevel: 5, description: "Srazil vás náklaďák (Truck-kun)? Výborně, dostáváte XP za každý nový pofidérní fantasy svět, který zachráníte." },
    { id: 'genre_mecha', label: 'Robotický Pilot', domain: 'purple', x: 1500, y: -200, dependencies: ['genre_scifi', 'genre_action'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 5, description: "Obří roboti. Víc není třeba dodávat. Naskočte do Evangeliu!" },
    { id: 'genre_slice', label: 'Kavárny a Pohoda', domain: 'emerald', x: 1500, y: -700, dependencies: ['genre_romance'], reqBase: 1200, reqMultiplier: 1.8, maxLevel: 5, description: "Pohodové 'Slice of Life' anime, které pohladí na duši po těžkém dni v práci." },
    { id: 'genre_psycho', label: 'Psychologický Pád', domain: 'red', x: 1500, y: -500, dependencies: ['genre_mystery'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Když díla pronikají do nejhlubších zákoutí temné lidské psychiky." },

    // Habits breakdown
    { id: 'chronos_binge', label: 'Noční Jízda', domain: 'emerald', x: 1500, y: -100, dependencies: ['chronos_novice'], reqBase: 500, reqMultiplier: 2.0, maxLevel: 5, description: "Proč spát, když má série ještě pět epizod? Za bingování dáváme XP, ale pozor na zdraví!" },
    { id: 'chronos_turtle', label: 'Želví Poutník', domain: 'emerald', x: 1500, y: 100, dependencies: ['chronos_novice'], reqBase: 5, reqMultiplier: 2.0, maxLevel: 5, description: "Pomalý a rozvážný divák, který si vychutnává anime pekne díl po dílu, beze spěchu." },

    // Formats
    { id: 'fmt_retro', label: 'VHS Kazeta (90s)', domain: 'cyan', x: 1500, y: 500, dependencies: ['audio_listener'], reqBase: 1000, reqMultiplier: 3.0, maxLevel: 5, description: "Klasický cell shading a starý zvukový formát. Sledování všeho, co vyšlo před rokem 2000." },
    { id: 'fmt_ova', label: 'Sběratel VHS', domain: 'cyan', x: 1500, y: 700, dependencies: ['audio_listener'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Obscurní formáty Original Video Animation a bonusové epizody rozšiřující svět série." },

    // ─── L4: Mastering and Synergy (x = 2000) ───
    { id: 'rewatch_lane', label: 'Kruh se Uzavírá', domain: 'primary', x: 2000, y: -100, dependencies: ['chronos_binge'], reqBase: 2000, reqMultiplier: 2.0, maxLevel: 5, description: "Někdy jedno zhlédnutí zkrátka nestačí. Kolikrát dokážete vidět tu samou sérii a stále plakat?" },
    { id: 'trope_iyashikei', label: 'Léčitel Duše', domain: 'emerald', x: 2000, y: -700, dependencies: ['genre_slice'], reqBase: 3000, reqMultiplier: 2.0, maxLevel: 4, description: "Dosáhli jste stavu vnitřního klidu, Iyashikei anime vás kompletně zbavilo stresu." },
    { id: 'demo_seinen', label: 'Seinen Filozof', domain: 'cyan', x: 2000, y: 800, dependencies: ['demo_shounen'], reqBase: 2000, reqMultiplier: 2.5, maxLevel: 5, description: "Přejití od akčních rvaček k dospělým traumatům, morálním ambiguitám a hlubším tématům." },
    { id: 'demo_shoujo', label: 'Shoujo Estét', domain: 'purple', x: 2000, y: -800, dependencies: ['genre_romance'], reqBase: 1000, reqMultiplier: 2.5, maxLevel: 5, description: "Oči velké přes půlku obličeje, všudevyhlížející třpytky a spletitá pavučina lidských vztahů." },

    // ─── L5: Omegas (x = 2600) ───
    { id: 'omega_shounen', label: 'ULTIMATE: Protagonista', domain: 'orange', x: 2600, y: 0, dependencies: ['demo_shounen', 'genre_isekai'], reqBase: 20000, reqMultiplier: 2.5, maxLevel: 5, description: "Máte neomezenou zásobu chaker, reiatsu a nen. Jste samotným vtělením nakama power." },
    { id: 'omega_elitist', label: 'ULTIMATE: Elitista', domain: 'red', x: 2600, y: 1000, dependencies: ['rating_strict', 'fmt_retro'], reqBase: 20000, reqMultiplier: 2.5, maxLevel: 5, description: 'Nic co vyšlo po roce 2011 "neprodává esenci pravého media".' },
    { id: 'omega_corporate_slave', label: 'ULTIMATE: Oáza', domain: 'emerald', x: 2600, y: -700, dependencies: ['demo_seinen', 'trope_iyashikei'], reqBase: 15000, reqMultiplier: 2.0, maxLevel: 5, description: "Níčí-li vás tvrdá realita korporátu, tyto uzly jsou vaším dokonalým, jemným, animovaným bezpečným přístavem." },
    
    // ─── L6: Zenith (x = 3200) ───
    { id: 'omega_zenith', label: 'YGGDRASIL ZENITH', domain: 'primary', x: 3200, y: 0, dependencies: ['omega_shounen', 'omega_elitist', 'omega_corporate_slave'], reqBase: 100000, reqMultiplier: 2.0, maxLevel: 5, description: "Osvícený stav čistého pozorovatele. Pravý O-T-A-K-U, se kterým se rojí legendy samotného Akihabara." }
];

