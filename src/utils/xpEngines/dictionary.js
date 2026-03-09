/**
 * NODE_DICTIONARY
 * Redesigned to represent chronologically-flowing "Firsts" as requested.
 * X-axis spacing is generous, Y-axis branches out logical themes.
 */
export const NODE_DICTIONARY = [
    // ─── L0: Genesis (x = 0) ───
    { id: 'singularity', label: 'První Anime', domain: 'primary', x: 0, y: 0, dependencies: [], thresholds: [100, 5000, 10000, 25000, 50000] },

    // ─── L1: First Steps (x = 400) ───
    { id: 'genre_explorer', label: 'První Žánr', domain: 'purple', x: 400, y: -600, dependencies: ['singularity'], thresholds: [500, 2500, 5000] },
    { id: 'studio_connoisseur', label: 'První Studio', domain: 'orange', x: 400, y: -200, dependencies: ['singularity'], thresholds: [5000, 15000, 25000] },
    { id: 'chronos_novice', label: 'První Hodiny', domain: 'chronos', x: 400, y: 200, dependencies: ['singularity'], thresholds: [1000, 5000, 25000, 100000] },
    { id: 'audio_listener', label: 'První Soundtrack', domain: 'emerald', x: 400, y: 600, dependencies: ['singularity'], thresholds: [10000, 50000, 100000] },

    // Other early mechanics
    { id: 'lang_interpreter', label: 'První Titulky/Dabing', domain: 'misc', x: 400, y: -1000, dependencies: ['singularity'], thresholds: [1000, 5000] },
    { id: 'era_time_skipper', label: 'Cestovatel Časem', domain: 'cyan', x: 400, y: 1000, dependencies: ['singularity'], thresholds: [1000, 5000] },
    { id: 'rating_reviewer', label: 'První Hodnocení', domain: 'red', x: 400, y: 1400, dependencies: ['singularity'], thresholds: [1000, 5000, 10000] },
    { id: 'len_pacer', label: 'První Maraton', domain: 'misc', x: 400, y: 1800, dependencies: ['singularity'], thresholds: [1000, 5000] },

    // ─── L2: Specialization (x = 800) ───
    // Genre Branch
    { id: 'genre_action', label: 'První Akce', domain: 'purple', x: 800, y: -800, dependencies: ['genre_explorer'], thresholds: [1000, 5000, 10000, 20000] },
    { id: 'genre_romance', label: 'První Romantika', domain: 'purple', x: 800, y: -650, dependencies: ['genre_explorer'], thresholds: [1000, 3000, 10000] },
    { id: 'genre_mystery', label: 'První Mystery', domain: 'purple', x: 800, y: -500, dependencies: ['genre_explorer'], thresholds: [1000, 3000, 8000] },
    { id: 'genre_sports', label: 'První Sportovní', domain: 'purple', x: 800, y: -350, dependencies: ['genre_explorer'], thresholds: [1000, 5000, 10000] },

    // Studio Branch
    { id: 'studio_kyoani', label: 'KyoAni Objevitel', domain: 'orange', x: 800, y: -200, dependencies: ['studio_connoisseur'], thresholds: [1500, 5000, 10000] },
    { id: 'studio_mappa', label: 'MAPPA Objevitel', domain: 'orange', x: 800, y: -50, dependencies: ['studio_connoisseur'], thresholds: [2000, 6000, 12000] },
    { id: 'studio_madhouse', label: 'Madhouse Objevitel', domain: 'orange', x: 800, y: 100, dependencies: ['studio_connoisseur'], thresholds: [2500, 8000, 15000] },
    { id: 'studio_ufotable', label: 'Ufotable Objevitel', domain: 'orange', x: 800, y: 250, dependencies: ['studio_connoisseur'], thresholds: [1000, 4000, 8000] },

    // Chronos Branch
    { id: 'chronos_binge', label: 'Závislák (Binge)', domain: 'chronos', x: 800, y: 400, dependencies: ['chronos_novice'], thresholds: [500, 1200, 2400, 3600] },
    { id: 'chronos_completionist', label: 'Komplecionista', domain: 'chronos', x: 800, y: 550, dependencies: ['chronos_novice'], thresholds: [1000, 5000, 10000, 25000] },

    // Audio Branch
    { id: 'audio_frisson', label: 'První Husí Kůže', domain: 'emerald', x: 800, y: 700, dependencies: ['audio_listener'], thresholds: [5000, 25000, 75000] },
    { id: 'audio_karaoke', label: 'Zpěvák OP', domain: 'emerald', x: 800, y: 850, dependencies: ['audio_listener'], thresholds: [5000, 20000, 50000] },

    // Misc Branches
    { id: 'lang_sub', label: 'Titulky Only', domain: 'misc', x: 800, y: -1100, dependencies: ['lang_interpreter'], thresholds: [10000, 50000, 250000] },
    { id: 'lang_dub', label: 'Dabing Objevitel', domain: 'misc', x: 800, y: -950, dependencies: ['lang_interpreter'], thresholds: [5000, 25000, 100000] },

    { id: 'era_2000s', label: 'Nostalgie 2000s', domain: 'era', x: 800, y: 1000, dependencies: ['era_time_skipper'], thresholds: [15000, 80000, 150000] },
    { id: 'era_2010s', label: 'SAO Generace', domain: 'era', x: 800, y: 1150, dependencies: ['era_time_skipper'], thresholds: [25000, 100000, 250000] },

    { id: 'rating_strict', label: 'Kritik', domain: 'red', x: 800, y: 1300, dependencies: ['rating_reviewer'], thresholds: [5000, 25000, 50000] },
    { id: 'rating_optimist', label: 'Optimista', domain: 'red', x: 800, y: 1450, dependencies: ['rating_reviewer'], thresholds: [5000, 25000, 50000] },

    { id: 'len_sprinter', label: 'První 12-Ep', domain: 'misc', x: 800, y: 1600, dependencies: ['len_pacer'], thresholds: [15000, 45000] },
    { id: 'len_marathon', label: 'První Shounen (100+)', domain: 'misc', x: 800, y: 1750, dependencies: ['len_pacer'], thresholds: [25000, 75000] },


    // ─── L3: Deep Dive (x = 1200) ───
    { id: 'genre_shounen', label: 'Shounen Král', domain: 'purple', x: 1200, y: -800, dependencies: ['genre_action'], thresholds: [2500, 10000, 25000] },
    { id: 'genre_isekai', label: 'Isekai Přeživší', domain: 'purple', x: 1200, y: -650, dependencies: ['genre_action'], thresholds: [1500, 5000, 15000] },
    { id: 'genre_drama', label: 'Slzy Zoufalců', domain: 'purple', x: 1200, y: -500, dependencies: ['genre_romance'], thresholds: [1500, 5000, 12000] },

    { id: 'rewatch_lane', label: 'První Rewatch', domain: 'misc', x: 1200, y: 400, dependencies: ['chronos_binge'], thresholds: [2000, 5000, 15000] },
    { id: 'status_airing', label: 'Sběratel Sezón', domain: 'misc', x: 1200, y: 1600, dependencies: ['len_sprinter'], thresholds: [5000, 15000, 50000] },

    // ─── L4: Mastering (x = 1600) ───
    { id: 'rewatch_endless', label: 'Endless Eight', domain: 'misc', x: 1600, y: 400, dependencies: ['rewatch_lane'], thresholds: [10000, 25000] },

    // ─── L5: Ultimate Goals (x = 2000) ───
    { id: 'omega_shounen', label: 'ULTIMATE: Protagonista', domain: 'primary', x: 2000, y: -800, dependencies: ['genre_shounen', 'len_marathon'], thresholds: [20000, 50000] },
    { id: 'omega_feels', label: 'ULTIMATE: Emoce', domain: 'purple', x: 2000, y: -300, dependencies: ['genre_drama', 'studio_kyoani', 'audio_frisson'], thresholds: [15000, 30000] },
    { id: 'omega_elitist', label: 'ULTIMATE: Elitista', domain: 'red', x: 2000, y: 1300, dependencies: ['rating_strict', 'lang_sub', 'era_2000s'], thresholds: [20000, 50000] },

    // ─── L6: Zenith (x = 2400) ───
    { id: 'omega_zenith', label: 'THE OTAKU ZENITH', domain: 'primary', x: 2400, y: -50, dependencies: ['chronos_completionist', 'genre_explorer', 'studio_connoisseur', 'audio_listener'], thresholds: [100000, 500000, 1000000] },
];
