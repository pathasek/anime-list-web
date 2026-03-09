/**
 * NODE_DICTIONARY
 * The ultimate blueprint of the Stats Research Tree.
 * 
 * HORIZONTAL LAYOUT (Left to Right)
 */
export const NODE_DICTIONARY = [
    // ─── L0: THE ORIGIN (x = 0) ───
    { id: 'singularity', label: 'The Singularity', domain: 'primary', x: 0, y: 600, dependencies: [], thresholds: [100, 5000, 10000, 25000, 50000, 100000] },

    // ─── L1: THE DOMAIN ROOTS (x = 400) ───
    { id: 'chronos_novice', label: 'Time Novice', domain: 'chronos', x: 400, y: -1000, dependencies: ['singularity'], thresholds: [1000, 5000, 25000, 100000, 200000] },
    { id: 'genre_explorer', label: 'Genre Explorer', domain: 'purple', x: 400, y: -500, dependencies: ['singularity'], thresholds: [500, 2500, 5000] },
    { id: 'studio_connoisseur', label: 'Animation Connoisseur', domain: 'orange', x: 400, y: 0, dependencies: ['singularity'], thresholds: [5000, 15000, 25000] },
    { id: 'audio_listener', label: 'Active Listener', domain: 'emerald', x: 400, y: 500, dependencies: ['singularity'], thresholds: [10000, 50000, 100000] },
    { id: 'era_time_skipper', label: 'Time Skipper', domain: 'cyan', x: 400, y: 1000, dependencies: ['singularity'], thresholds: [1000, 5000] },
    { id: 'rating_reviewer', label: 'The Reviewer', domain: 'red', x: 400, y: 1500, dependencies: ['singularity'], thresholds: [1000, 5000, 10000] },
    { id: 'lang_interpreter', label: 'The Interpreter', domain: 'misc', x: 400, y: 2000, dependencies: ['singularity'], thresholds: [1000, 5000] },
    { id: 'len_pacer', label: 'Pacing Analyzer', domain: 'misc', x: 400, y: 2400, dependencies: ['singularity'], thresholds: [1000, 5000] },

    // ─── L2: THE SPECIALIZATIONS (x = 800) ───

    // Chronos sub-branches
    { id: 'chronos_binge', label: 'Weekend Warrior', domain: 'chronos', x: 800, y: -1100, dependencies: ['chronos_novice'], thresholds: [500, 1200, 2400, 3600, 5000] },
    { id: 'chronos_completionist', label: 'The Completionist', domain: 'chronos', x: 800, y: -900, dependencies: ['chronos_novice'], thresholds: [1000, 5000, 10000, 25000, 50000] },

    // Genre sub-branches
    { id: 'genre_action', label: 'Action Brawler', domain: 'purple', x: 800, y: -700, dependencies: ['genre_explorer'], thresholds: [1000, 5000, 10000, 20000] },
    { id: 'genre_romance', label: 'Heart Throb', domain: 'purple', x: 800, y: -500, dependencies: ['genre_explorer'], thresholds: [1000, 3000, 10000] },
    { id: 'genre_mystery', label: 'The Detective', domain: 'purple', x: 800, y: -300, dependencies: ['genre_explorer'], thresholds: [1000, 3000, 8000] },
    { id: 'genre_sports', label: 'The Zone', domain: 'purple', x: 800, y: -100, dependencies: ['genre_explorer'], thresholds: [1000, 5000, 10000] },

    // Studio sub-branches
    { id: 'studio_kyoani', label: 'KyoAni Devotee', domain: 'orange', x: 800, y: -350, dependencies: ['studio_connoisseur'], thresholds: [1500, 5000, 10000] },
    { id: 'studio_mappa', label: 'MAPPA Survivor', domain: 'orange', x: 800, y: -250, dependencies: ['studio_connoisseur'], thresholds: [2000, 6000, 12000] },
    { id: 'studio_ufotable', label: 'Tax Evasion Specialist', domain: 'orange', x: 800, y: -150, dependencies: ['studio_connoisseur'], thresholds: [1000, 4000, 8000] },
    { id: 'studio_madhouse', label: 'Madhouse Veteran', domain: 'orange', x: 800, y: -50, dependencies: ['studio_connoisseur'], thresholds: [2500, 8000, 15000] },
    { id: 'studio_bones', label: 'Skeleton King', domain: 'orange', x: 800, y: 50, dependencies: ['studio_connoisseur'], thresholds: [2000, 6000, 12000] },
    { id: 'studio_trigger', label: 'Space Driller', domain: 'orange', x: 800, y: 150, dependencies: ['studio_connoisseur'], thresholds: [1500, 5000, 10000] },
    { id: 'studio_a1', label: 'Mass Production', domain: 'orange', x: 800, y: 250, dependencies: ['studio_connoisseur'], thresholds: [3000, 10000, 20000] },
    { id: 'studio_shaft', label: 'Monogatari Scholar', domain: 'orange', x: 800, y: 350, dependencies: ['studio_connoisseur'], thresholds: [1000, 5000, 8000] },

    // Audio sub-branches
    { id: 'audio_frisson', label: 'Soul Shaker', domain: 'emerald', x: 800, y: 300, dependencies: ['audio_listener'], thresholds: [5000, 25000, 75000, 150000] },
    { id: 'audio_karaoke', label: 'Budokan Headliner', domain: 'emerald', x: 800, y: 400, dependencies: ['audio_listener'], thresholds: [5000, 20000, 50000] },
    { id: 'audio_seiyuu', label: 'Seiyuu Worshipper', domain: 'emerald', x: 800, y: 500, dependencies: ['audio_listener'], thresholds: [10000, 30000, 60000] },
    { id: 'audio_melody', label: 'The Maestro', domain: 'emerald', x: 800, y: 600, dependencies: ['audio_listener'], thresholds: [10000, 25000, 50000] },
    { id: 'audio_visual', label: 'The Director', domain: 'emerald', x: 800, y: 700, dependencies: ['audio_listener'], thresholds: [5000, 15000, 30000] },

    // Era sub-branches
    { id: 'era_80s90s', label: 'The Ancestor', domain: 'era', x: 800, y: 850, dependencies: ['era_time_skipper'], thresholds: [10000, 50000, 100000] },
    { id: 'era_2000s', label: 'Golden Era Scholar', domain: 'era', x: 800, y: 950, dependencies: ['era_time_skipper'], thresholds: [15000, 80000, 150000] },
    { id: 'era_2010s', label: 'SAO Generation', domain: 'era', x: 800, y: 1050, dependencies: ['era_time_skipper'], thresholds: [25000, 100000, 250000] },
    { id: 'era_2020s', label: 'The Current Meta', domain: 'era', x: 800, y: 1150, dependencies: ['era_time_skipper'], thresholds: [10000, 50000, 100000] },

    // Ratings sub-branches
    { id: 'rating_strict', label: 'The Executioner', domain: 'red', x: 800, y: 1400, dependencies: ['rating_reviewer'], thresholds: [5000, 25000, 50000] },
    { id: 'rating_optimist', label: 'Loving Embrace', domain: 'red', x: 800, y: 1600, dependencies: ['rating_reviewer'], thresholds: [5000, 25000, 50000] },

    // Misc / Lang / Length
    { id: 'lang_sub', label: 'Certified Weeb', domain: 'misc', x: 800, y: 1900, dependencies: ['lang_interpreter'], thresholds: [10000, 50000, 250000] },
    { id: 'lang_dub', label: 'The Localizer', domain: 'misc', x: 800, y: 2100, dependencies: ['lang_interpreter'], thresholds: [5000, 25000, 100000] },

    { id: 'len_sprinter', label: 'Attention Deficit', domain: 'misc', x: 800, y: 2300, dependencies: ['len_pacer'], thresholds: [15000, 45000] },
    { id: 'len_marathon', label: 'The Long Run', domain: 'misc', x: 800, y: 2500, dependencies: ['len_pacer'], thresholds: [25000, 75000] },

    // ─── L3: ADVANCED PRESTIGE MASTERY (x = 1200) ───

    { id: 'rewatch_lane', label: 'Comfort Zone', domain: 'misc', x: 1200, y: -1100, dependencies: ['chronos_binge'], thresholds: [2000, 5000, 15000] },

    { id: 'genre_shounen', label: 'Shounen Kami', domain: 'purple', x: 1200, y: -800, dependencies: ['genre_action'], thresholds: [2500, 10000, 25000] },
    { id: 'genre_isekai', label: 'Isekai Survivor', domain: 'purple', x: 1200, y: -700, dependencies: ['genre_action'], thresholds: [1500, 5000, 15000] },
    { id: 'genre_mecha', label: 'Mecha Pilot', domain: 'purple', x: 1200, y: -600, dependencies: ['genre_action'], thresholds: [1000, 4000, 10000] },
    { id: 'genre_drama', label: 'Ocean of Tears', domain: 'purple', x: 1200, y: -500, dependencies: ['genre_romance'], thresholds: [1500, 5000, 12000] },
    { id: 'genre_sol', label: 'Absolute Zen', domain: 'purple', x: 1200, y: -400, dependencies: ['genre_romance'], thresholds: [2000, 6000, 15000] },
    { id: 'genre_psychological', label: 'Mind Break', domain: 'purple', x: 1200, y: -300, dependencies: ['genre_mystery'], thresholds: [1500, 5000, 10000] },

    { id: 'status_airing', label: 'Seasonal Scrub', domain: 'misc', x: 1200, y: 2300, dependencies: ['len_sprinter'], thresholds: [5000, 15000, 50000] },

    // ─── L4: THE DEEP EXTREMES (x = 1600) ───
    { id: 'rewatch_endless', label: 'Endless Eight', domain: 'misc', x: 1600, y: -1100, dependencies: ['rewatch_lane'], thresholds: [10000, 25000, 40000] },

    // ─── ULTIMATE / OMEGA CLASSES (x = 2000) ───
    { id: 'omega_shounen', label: 'ULTIMATE: True Protagonist', domain: 'primary', x: 2000, y: -800, dependencies: ['genre_shounen', 'len_marathon'], thresholds: [20000, 50000] },
    { id: 'omega_aesthete', label: 'ULTIMATE: Animation God', domain: 'orange', x: 2000, y: 0, dependencies: ['studio_kyoani', 'studio_ufotable', 'studio_bones'], thresholds: [10000, 20000] },
    { id: 'omega_feels', label: 'ULTIMATE: Emotional Wreck', domain: 'purple', x: 2000, y: -500, dependencies: ['genre_drama', 'studio_kyoani', 'audio_frisson'], thresholds: [15000, 30000] },
    { id: 'omega_elitist', label: 'ULTIMATE: The Elitist', domain: 'red', x: 2000, y: 1400, dependencies: ['rating_strict', 'lang_sub', 'era_80s90s'], thresholds: [20000, 50000] },

    // ─── THE APEX (x = 2600) ───
    { id: 'omega_zenith', label: 'THE OTAKU ZENITH', domain: 'primary', x: 2600, y: 600, dependencies: ['chronos_completionist', 'genre_explorer', 'studio_connoisseur', 'audio_listener'], thresholds: [100000, 500000, 1000000] },
];
