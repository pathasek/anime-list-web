# MIGRAČNÍ A REFACTOR PLÁN — Anime_List konsolidace

> Vytvořeno: 2026-07-21 · Status dokumentu: **ČEKÁ NA SCHVÁLENÍ**
> Průběžně aktualizováno — každá fáze má stav: ⬜ TODO / 🔄 PROBÍHÁ / ✅ HOTOVO / ⚠️ POZOR

## Cíl

Konsolidovat tři pracovní složky do jedné OneDrive lokace, zajistit zálohu důležitých
skriptů na GitHub, uklidit hierarchii, opravit chyby vzniklé smazáním + rekonstrukcí
z paměti. **Nic jiného ve složce `Anime_List` na OneDrive se nesmí dotknout.**

### Cílová destinace
`C:\Users\macou\OneDrive - ŠKODA AUTO VYSOKÁ ŠKOLA o.p.s\Osobní PC\Excel Projekt - nemazat\Anime_List\`

Tam vzniknou (přesunem) tři podsložky:
1. `Anime List WEB\`            ← ze scratch `C:\Users\macou\.gemini\antigravity-ide\scratch\Anime List WEB`
2. `Anime slučovač rozborů\`    ← z `C:\Users\macou\Desktop\Anime slučovač rozborů`
3. `Anime list - experimenting\` ← z `C:\Users\macou\Desktop\Anime list - experimenting`

## Rozhodnutí uživatele (z 2026-07-21)
- **Git záloha:** důležité pipeline skripty + VBA sloučit DO existujícího repa `anime-list-web` (GitHub: `pathasek/anime-list-web`). Jeden repo zálohuje vše.
- **node_modules/dist/pycache:** nekopírovat, **regenerovat v cíli** (`npm install` + build). Uživatel je navíc přidá do OneDrive „Vyloučit ze synchronizace".
- **Jednorázové skripty:** projít VŠECHNY, zajímavé poznámky sepsat do jednoho MD, pak opatrně uklidit + smazat. Zlogičtit hierarchii repa i složky.
- **Originály:** kopírovat → ověřit → **až pak smazat** originály.

---

## KATEGORIZACE SKRIPTŮ (kořen `Anime List WEB`)

### ✅ CORE PIPELINE (zachovat, → `anime-list-web/tools/`)
Ověřeno z orchestrace v `export_data.py` (řádky 1137–1205):
- `export_data.py` — hlavní exportér (orchestrátor)
- `map_from_folder.py` — mapování náhledovek (volá export_data)
- `extract_spotify_images.py` — kopírování Spotify obrázků (volá export_data)
- `export_docx_categories.py` — kategorie z DOCX (volá export_data)
- `build_ytmusic_ost.py` — YT Music OST (volá export_data)
- `anime-list-web/download_jikan_cache.py` — Jikan cache (volá export_data)
- `anime-list-web/download_animethemes_cache.py` — AnimeThemes (volá export_data)
- `anime-list-web/download_imdb_cache.py` — IMDB cache (samostatný, ale core)

### 🗄️ JEDNORÁZOVÉ (audit → poznámky do MD → smazat)
`test_*.py`, `inspect_*.py`, `analyze_*`, `check_*` (kromě potvrzených), `compare_*`,
`convert_*`, `extract_charts/history/images/vsix`, `find_*`, `fix_dashboard`, `fix_paths`,
`get_stats`, `list_shapes`, `make_all_16_9`, `map_images`, `optimize_gdrive_videos`,
`patch`, `refactor`, `render_orig`, `scratch_diagnostic`, `search_vba`, `update_charts`,
`fetch_tokyo`, `add_to_extensions_json`, `create_final_copy`, `analyze_excel`, `analyze_vba`,
celá složka `scratch/` (~27 analytických skriptů).
→ Před smazáním se jejich užitečné poznatky sepíšou do `anime-list-web/docs/ONEOFF_SCRIPTS_NOTES.md`.

---

## NALEZENÉ BUGY / CHYBY Z REKONSTRUKCE (k opravě)
1. **`export_data.py:1045`** — fallback `output_dir = ...\.gemini\antigravity\scratch\...` → chybí `-ide`. Neplatná cesta. → Opravit na relativní/správnou.
2. **`fix_paths.py`** — ukazuje na mrtvou cestu `.gemini\antigravity\scratch\OPUS_Anime_List`. → Jednorázový, smazat (poznámka do MD).
3. **`AutoUpdateWeb.bas:35`** — natvrdo `scratch\Anime List WEB`. → Po přesunu přepsat na novou OneDrive cestu + `tools\export_data.py`.
4. **Path-coupling `scratch\Anime List WEB`** v ~30 skriptech (většina jednorázových – zmizí smazáním; core se opraví relativně přes `__file__`).
5. **Slučovač `skripty\*.py`** — ~15× natvrdo `Desktop\Anime slučovač rozborů`. → Přepsat na relativní (odvození z `__file__`), ať jsou relokovatelné. Jedna mrtvá ref `Hell's Paradise`.
6. **`export_data.py:1160/1187`** — join `(script_root, "anime-list-web", "download_*.py")` → po přesunu skriptů do `tools/` přepsat na správné relativní cesty + cwd.

---

## CÍLOVÁ STRUKTURA (po refactoru)

```
Anime_List\                                  (OneDrive — ostatní obsah NETKNUTÝ)
├── Anime list.xlsm                          (existující LIVE Excel — netknuté)
├── RULEBOOK\, Anime hodnocení a rozbory\... (existující — netknuté)
│
├── Anime List WEB\                          ← přesunuto
│   ├── anime-list-web\                       git repo (GitHub: pathasek/anime-list-web)
│   │   ├── src\, public\, index.html ...     web app (netknuté)
│   │   ├── tools\                            ★ NOVÉ: celá Python pipeline
│   │   │   ├── export_data.py
│   │   │   ├── map_from_folder.py
│   │   │   ├── extract_spotify_images.py
│   │   │   ├── export_docx_categories.py
│   │   │   ├── build_ytmusic_ost.py
│   │   │   ├── download_jikan_cache.py
│   │   │   ├── download_animethemes_cache.py
│   │   │   └── download_imdb_cache.py
│   │   ├── vba\                              ★ NOVÉ: VBA moduly (.bas) v gitu
│   │   │   ├── AutoUpdateWeb.bas
│   │   │   ├── NotebookLM_Updater.bas
│   │   │   └── (moduly z „VBA .bas files\")
│   │   ├── docs\
│   │   │   └── ONEOFF_SCRIPTS_NOTES.md       ★ NOVÉ: poznámky z jednorázových
│   │   └── MIGRATION_PLAN.md                 (tento dokument)
│   └── assets\                              non-git velké soubory
│       └── Náhledovky a obrázky - Anime\
│       (A-List.xlsm = stará duplicitní kopie → NEkopírovat, ověřit s uživatelem)
│
├── Anime slučovač rozborů\                  ← přesunuto (bat relokovatelné; py opravit)
└── Anime list - experimenting\             ← přesunuto (archiv + VBA .bas/.txt)
```

---

## FÁZE (checklist)

### FÁZE 0 — Bezpečnostní síť ⬜
- [ ] Commit + push všech necommitnutých změn v `anime-list-web` (AiringCalendar.jsx/css, scripts/, wrapped_inspiration/) → GitHub má aktuální stav PŘED zásahem.
- [ ] Ověřit `git status` čistý, `git push` OK.

### FÁZE 1 — Kopie do OneDrive ⬜
- [ ] `robocopy` „Anime List WEB" → cíl, s vyloučením `node_modules`, `dist`, `__pycache__`, `.wrangler`, temp_* složek.
- [ ] Ověřit počet souborů / integritu kopie.

### FÁZE 2 — Reorg hierarchie + sloučení do git repa ⬜
- [ ] Vytvořit `anime-list-web/tools/`, `anime-list-web/vba/`.
- [ ] Přesunout core pipeline skripty do `tools/`.
- [ ] Přesunout VBA `.bas` do `vba/`.
- [ ] Upravit `.gitignore` (node_modules, dist, temp, assets velké soubory).

### FÁZE 3 — Oprava cest a bugů (post-move) ⬜
- [ ] `export_data.py`: script_root joins pro `tools/` layout, download skripty, fallback output_dir (bug #1).
- [ ] Ověřit I/O cesty download_*.py po přesunu (cwd/relativní).
- [ ] Slučovač `skripty\*.py`: absolutní → relativní přes `__file__`.

### FÁZE 4 — Jednorázové skripty: audit → MD → úklid ⬜
- [ ] Projít každý jednorázový skript, extrahovat užitečné poznatky.
- [ ] Sepsat `docs/ONEOFF_SCRIPTS_NOTES.md`.
- [ ] (Volitelně) ZIP záloha jednorázových do OneDrive před smazáním.
- [ ] Smazat jednorázové skripty (opatrně, až po commitu core + MD).

### FÁZE 5 — Regenerace + ověření ⬜
- [ ] `npm install` v cíli.
- [ ] `npm run build` — musí projít.
- [ ] Git commit + **push** (core skripty + VBA + MD) → skutečná záloha.
- [ ] Dry-run ověření orchestrace cest (bez reálného spuštění Excelu).

### FÁZE 6 — Přesun dvou Desktop workspaců ⬜
- [ ] Kopie „Anime slučovač rozborů" → cíl (vyloučit __pycache__).
- [ ] Kopie „Anime list - experimenting" → cíl.
- [ ] Ověřit.

### FÁZE 7 — Smazání originálů (po plném ověření) ⬜
- [ ] Smazat scratch „Anime List WEB", Desktop workspacy — až vše ověřeno.

### FÁZE 8 — VBA aktualizace cest (na úplný konec) ⬜
- [ ] `AutoUpdateWeb.bas`: nová workspacePath + `tools\export_data.py`.
- [ ] `Export_Anilist_WEB.bas` (experimenting kopie): stejná změna.
- [ ] Zdokumentovat, které moduly uživatel musí re-importovat do Excelu.

### FÁZE 9 — OneDrive vyloučení + finální report ⬜
- [ ] Pokyny pro OneDrive „Vyloučit node_modules ze synchronizace".
- [ ] Finální report + aktualizace paměti.

---

## OTEVŘENÉ OTÁZKY PRO UŽIVATELE
- **A-List.xlsm** (102 MB v kořeni scratch) vs. live `Anime list.xlsm` (115 MB v OneDrive) — je A-List.xlsm stará duplicitní kopie ke smazání, nebo ji přesunout? (Doporučeno: nekopírovat.)
- **Náhledovky a obrázky - Anime** už existují i v OneDrive Anime_List — sloučit / nekopírovat duplicitu?
```
