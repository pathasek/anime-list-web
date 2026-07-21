# Poznámky z jednorázových skriptů (před úklidem)

> Vytvořeno 2026-07-21 při migraci. Původní jednorázové/testovací skripty (root
> `Anime List WEB\*.py` + `scratch\*.py`) byly po sepsání těchto poznámek smazány.
> Plná záloha smazaných skriptů zůstala v původní scratch složce do fáze F7 migrace.
> Zde je zachyceno jen to, co má trvalou hodnotu (techniky, struktura dat, gotchas).

## 🔑 Znovupoužitelné znalosti / techniky

- **VBA `.bas`/`.cls` moduly jsou v kódování `windows-1250` (cp1250), NE UTF-8.**
  Skripty `convert_tags.py`, `convert_vba.py`, `convert_watch_overview.py`, `patch.py`
  je četly přes `encoding="cp1250"` / `"windows-1250"` a zapisovaly UTF-8. Při jakémkoli
  strojovém čtení VBA exportů z Excelu je nutné počítat s cp1250.

- **Čtení `.xlsm`, když ho drží otevřený Excel (zámek).** Skripty `inspect_all_p.py`,
  `inspect_doc.py`, `inspect_table_details.py`, `inspect_tables_xml.py`,
  `inspect_t1_formatting.py` používaly Win32 `CreateFile` s
  `FILE_SHARE_READ|WRITE|DELETE` (0x1|0x2|0x4), příp. `win32com.client.Dispatch("Excel.Application")`,
  aby přečetly sešit bez `PermissionError`. `export_data.py` to řeší jinak — kopií do
  `tempfile.mkstemp()` a čtením kopie (spolehlivější, viz `tools/export_data.py`).

- **Matching názvů anime napříč datovými soubory** (`test_matching.py`,
  `scratch/check_op_ed_matches.py`) zrcadlí JS funkci `normalizeAnimeKey` — normalizace
  (lowercase, odstranění nealfanumerických znaků, `?`→`questionmark`). Stejný vzorec
  používá `map_from_folder.py` (`clean_string`) pro párování náhledovek.

- **Docx → kategorie: `HEADING_MAP`.** `scratch/diagnostic.py` a `scratch_diagnostic.py`
  obsahovaly kopii mapy variant českých nadpisů (`animace`, `animace a vizuální jazyk`, …)
  na kanonické kategorie. Kanonická verze žije v `tools/export_docx_categories.py`
  (`HEADING_MAP`). Nadpis mimo mapu = kategorie se do `category_texts.json` nedostane
  (viz `DATA_AUDIT.md`).

## 📊 Struktura Excelu (`Anime list.xlsm` / dřívější `A-List.xlsm`, `DEF.xlsm`)

Listy zjištěné z `check.py`, `get_sheets.py`, `inspect_anime_list_cols.py`, `extract_charts.py`:
- `HODNOCENÍ ANIME` — hodnocení; sloupec **K (11)** obsahuje hodnoticí data.
- `OBECNÉ INFORMACE` — grafy (`ws._charts`).
- `ANIME LIST` — hlavní seznam.
- `HISTORY LOG` — data pro Wrapped statistiky (přegenerovává se před exportem, viz `AutoUpdateWeb.bas`).
- AniList tagy: cache list, sloupce **BY/BZ** → pole `tags` (viz `IMPLEMENTATION_PLAN_9.md`).

## 🚀 Deploy gotcha (GitHub Pages)

- **Datové cesty v JS musí být relativní** (`data/...`, ne `/data/...`). `fix_paths.py`
  hromadně nahrazoval `'/data/` → `'data/` v `src/**`, protože absolutní `/data/`
  nefunguje pod subcestou GitHub Pages (`/anime-list-web/`). Při přidávání nových
  `fetch()` na datové soubory používat relativní cesty.

## 🎞️ Média / video pipeline

- `optimize_gdrive_videos.py` — reencode OP/ED videí z `op_ed_videos.json` (GDrive).
- `scratch/optimize_videos.py` + `scratch/upscale_videos.py` — ReLive capture →
  optimalizace → 4K upscale (viz paměť „OP/ED video optimization", SVT-AV1).
- `make_all_16_9.py` — doplnění obrázků na poměr 16:9 rozmazaným pozadím (PIL).

## 🌐 API poznámky

- `get_stats.py` — Jikan `/anime/{id}/statistics`. **Tento endpoint trvale vrací 504**
  (MAL/Cloudflare blokuje Jikan servery) — proto má web AniList fallback (viz paměť).
- `fetch_tokyo.py`, `scratch/*` — jednorázové AniList GraphQL dotazy (`graphql.anilist.co`)
  na chybějící cover/banner obrázky.
- SoundCloud/YT hledání konkrétních znělek (`compare_sc_yt.py`, `find_servante.py`,
  `find_exact_sc_yt.py`) — jednorázové dohledávání „Servante de feu" (Sora no Woto).

## ⚠️ Mrtvé/zastaralé skripty (odkazovaly na neexistující staré cesty)

Tyto ukazovaly na `...\.gemini\antigravity\scratch\OPUS_Anime_List\...` nebo
`.gemini\antigravity\scratch\...` (bez `-ide`) — starý layout workspace, dnes neplatné.
Nemají žádnou trvalou hodnotu nad rámec výše uvedeného:
`check_missing_thumbs.py`, `extract_images.py`, `fix_dashboard.py`, `fix_paths.py`,
`list_shapes.py`, `update_charts.py`, `map_images.py`, `extract_charts.py`,
`add_to_extensions_json.py`, `extract_vsix.py`, `refactor.py`, `render_orig.py`,
`patch.py`, `search_vba.py`, `analyze_excel.py`, `analyze_vba.py`, všechny `test_*.py`
(experimenty s docx layoutem), `scratch/generate_artifact.py`,
`scratch/analyze_recent_commits.py`, `scratch/summarize_commits.py` (analýza commitů do
brain artifactů).

## 🧪 Validační one-linery (nahrazeno / na vyžádání)

`check.py`, `check_all_ost.py`, `scratch/check_ost_favs.py`, `scratch/inspect_*`,
`scratch/print_keys.py`, `scratch/search_json_keys.py` — ad-hoc kontroly JSON klíčů a
konzistence `favorites_ost.json` vs `ytmusic_ost.json` vs `favorites.json`. Jednoduché
`json.load` + print; v případě potřeby snadno napsat znovu.
