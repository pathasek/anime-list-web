# Implementační plán 7 — Research Tree V3: Vazby, tajné uzly a kodex (2026-07-15)

Zadání: kompletně předělat a vylepšit tab **Research Tree** (`/stats-tree`) — větší
strom se secret cestami, propojení posbíraná z anime databází (AniList), sběratelská
mechanika „musím vše odemknout", hinty/kodex. **Žádný jiný tab se nemění.**

---

## Co přibylo

### 1. Vazby — jižní větev stromu (AniList sken sbírky)
Nová větev `singularity → Detektor Vazeb → 6 hubů → souhvězdí`:

- **Detektor Vazeb** (`vazby_gateway`, 800/6800) — XP za naskenovaná anime,
  úrovně = 10/30/60/90/100 % sbírky (prahy dynamické podle velikosti listu).
- **Huby typů** (x=1600, y 6600–12100): Pavučina Studií, Křeslo Režiséra,
  Partitura Duše (skladatelé), Prameny Předloh (autoři), Kalendář Sezón,
  Komnata Rezonancí (vzácné sdílené tagy). XP hubu = odhalené vazby daného
  typu (100 XP + 15 XP za každé anime nad minimum shluku); prahy úrovní se
  počítají dynamicky z celkového počtu vazeb → **max level = odhalit vše**.
- **Souhvězdí**: každá odhalená vazba vyroste na mapě jako `ConstellationNode`
  napravo od svého hubu (sloupce po 4, stejný směr růstu jako zbytek stromu).
  Klik na uzel souhvězdí → SidePanel se seznamem propojených anime
  (thumbnail, FH hodnocení, odkaz na Můj List + MAL).

**Sken** (`src/utils/research/anilistScan.js`):
- batch 8 anime / 1 GraphQL dotaz (studia, staff s rolemi, sezóna, tagy ≥80),
  rozestup 2,1 s (AniList degraded limit 30 req/min), resume po přerušení,
  persistence `localStorage['research-scan-v1']`.
- ⚠️ AniList kuriozita: **HTTP 404 + `data:null` pro celý batch**, pokud jediné
  idMal neexistuje (typicky donghua). Řešení: 404 se neretryuje a dávka se
  rozpadne na jednotlivé dotazy; skutečné misses se cachují (retry po 7 dnech).

**Shluky** (`src/utils/research/connections.js`):
- studio (min 3 anime), režisér/skladatel/autor (min 2), sezóna (min 4),
  rezonance = sdílený tag rank ≥85 (min 3, bez generických tagů).
- Kodex reveal state v `localStorage['research-codex-v1']`; maskování jmen
  pro mystery karty („MAPPA" → „M●●●●").

### 2. Tajné uzly (??? + hádanky)
10 uzlů `secret: true` v dictionary, na mapě zamaskované jako „? ? ?" se zlatým
pulsem, dokud nesplníš podmínku (pak klasická oslava „Tajemství odhaleno").
Engine `engineSecrets.js` počítá čistě z lokálních dat:

| Uzel | Podmínka (hity × 100 XP) |
|---|---|
| Dokonalá Záře | hodnocení 10/10 |
| Poutník Dekádami | anime z různých dekád |
| Blesková Poprava | 5h+ anime dokončené v 1 dni |
| Lovec Relikvií | anime vydané před 1995 |
| Déjà Vu | rewatch |
| Centurion | série se 100+ EP |
| Jazykový Chameleon | různé jazyky (dub pole) |
| Dvojitá Tečka | 2+ dokončení v tentýž den |
| Znovuzrození | návrat po 60+ dnech pauzy |
| Odysea | sledování jednoho anime přes rok |

### 3. Kodex (📜 tlačítko vpravo nahoře)
- **🕸️ Vazby**: skener (start/pauza/resume, progress), filtry typů, sběratelské
  karty — mystery karta se odhalí kliknutím (flip animace, XP, milestone při
  level-upu hubu, pop nového uzlu souhvězdí na mapě, fokus kliknutím na kartu).
- **🧩 Hádanky**: seznam tajných uzlů — nevyřešené jen hádanka, vyřešené popis+level.
- **📊 Přehled**: completion ring (vážený mix: sken 10 %, vazby 35 %, tajné uzly
  20 %, úrovně stromu 35 %) + rozpad po kategoriích.

### 4. Vylepšení celého stromu
- **Oprava klikání / dotyk**: TreeCanvas přepsán na Pointer Events — funguje
  myš, dotyk, **pinch zoom na mobilu**; `centerOn()` API pro fokus z kodexu;
  tlačítko „🎯 Střed". Pozn.: žádné `setPointerCapture` na kontejner (rozbilo
  by click na uzlech) a odstraněno `will-change: transform` (obří GPU textura).
- Ikony domén na uzlech (✨🎭🏭⏳🎧✒️🔮, tajné ✦).
- Milestone detekce běží i po odhalení vazby (ne jen při načtení stránky).
- Zlatá doména `gold` (uzly, hrany, panel).

## Soubory
- Nové: `src/utils/research/{anilistScan,connections}.js`,
  `src/utils/xpEngines/{engineVazby,engineSecrets}.js`,
  `src/components/tree/{ConstellationNode,CodexPanel}.jsx`
- Změněné: `dictionary.js` (+17 uzlů), `xpEngines/index.js` (routing),
  `StatsTreeContext.jsx` (connections data + `recompute()`),
  `StatsTree.jsx`, `TreeCanvas.jsx`, `SkillNode.jsx`, `SidePanel.jsx`, `tree.css`
- Beze změny: všechny ostatní taby (Recommendations nedotčen)

## Ověřeno (dev server, DOM asserty)
- 123 uzlů, gateway + 6 hubů, tajné uzly maskované (8/10 už splněno historií —
  při první návštěvě se odehraje série oslav „Tajemství odhaleno")
- klik na uzel → SidePanel s contributors ✓
- kodex: karty, maskování, reveal → milestone „Pavučina Studií Lvl 1" +
  souhvězdí na mapě + completion 38 → 44 % ✓
- ostrý AniList sken: reálná data (studia/režiséři/tagy), 404-batch fallback ✓
- `npm run build` prochází, eslint bez nových chyb
