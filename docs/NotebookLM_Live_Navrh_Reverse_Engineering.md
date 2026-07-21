# Návrh: Dá se živé interaktivní audio NotebookLM „vytvořit", i když to zatím neexistuje?

**Navazuje na:** `NotebookLM_Live_Web_Feasibility.md`
**Autor:** Claude (Opus 4.8) · **Datum:** 12. 7. 2026
**Otázka od tebe:** *„MCP taky neexistovalo a lidi to stejně vytvořili. Nešlo by to podobně reverse-engineerovat?"*

Vzal jsem tvou námitku vážně a rozebral ji do hloubky — ne jako „nejde to", ale jako inženýrský návrh: **co přesně jde reverse-engineerovat, kde je strop, a proč.**

---

## 0. Přímá odpověď

**Máš z poloviny pravdu — a je to důležitá polovina.**

- ✅ **ANO, dá se postavit funkční PoC** živého relé (web ↔ tvoje interaktivní session NotebookLM). Je to stejná třída hacku jako MCP: automatizace přihlášeného prohlížeče. Níže dávám konkrétní návrh, jak.
- ❌ **NE, nedá se z toho udělat to, co jsi popsal** (veřejné tlačítko pro kohokoli / cizí 3. osobu). A důvod je klíčový: bariéry, které zbývají, **nejsou „automatizační"** (ty MCP prolomilo), ale **strukturální** — a ty se „prostě někým dořešit" nedají.

**Rozdíl, který je jádrem celé věci:**

| | Statické audio / chat (MCP to umí) | Živé interaktivní audio (chceš) |
|---|---|---|
| Charakter | request → počkej → soubor | real-time, obousměrný, stavový proud |
| Souběžnost | 1 účet obslouží mnoho lidí ve frontě | 1 účet = **1 živá session**, exkluzivně |
| Jazyk | 50+ jazyků (i česky) | **jen anglicky** (limit modelu) |
| Škálování na veřejnost | fronta + pár účtů | **farma účtů + prohlížečů + audio zařízení** |

MCP se povedlo, protože statické audio je pomalé, nárazové a serializovatelné. Živé audio pro veřejnost je opačná úloha — a přesně proto to **nikdo nepostavil** (viz sekce 1).

---

## 1. Důkaz z terénu: co reverse-engineering komunita opravdu dokázala (a co ne)

Prošel jsem existující projekty, které NotebookLM „odemykají". Vzorec je jednoznačný:

| Projekt | Technika | Audio schopnosti | Interaktivní „Join"? |
|---|---|---|---|
| [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) — nejambicióznější, „capabilities the web UI doesn't expose", multi-účet, headless „at scale" | Playwright (UI automation), **ne** interní API | Statické Audio Overview (4 formáty vč. debata/kritika, 50+ jazyků), hromadné stažení MP3 | ❌ Ne |
| [PleasePrompto/notebooklm-mcp](https://github.com/PleasePrompto/notebooklm-mcp) | Patchright/CDP, perzistentní profil, headless | Statické audio, chat, citace | ❌ Ne |
| [israelbls/notebooklm-podcast-automator](https://github.com/israelbls/notebooklm-podcast-automator) | FastAPI + Playwright, REST API | Statické audio | ❌ Ne |
| [upamune/notebooklm-podcast-automator](https://github.com/upamune/notebooklm-podcast-automator) | Playwright + CDP | Statické audio | ❌ Ne |
| Tvé tři nainstalované balíčky | Selenium / FastMCP | Statické audio | ❌ Ne |

**Závěr:** Celý ekosystém zvládl úplně všechno — bulk export, batch workflow, extrakci JSON, headless běh, přepínání účtů — **kromě živého interaktivního audia.** A všichni to dělají **automatizací UI**, ne prolomením interního API. Když to nikdo z desítek lidí neudělal, není to proto, že by je to nenapadlo. Je to proto, že tam narazili na strukturální zeď (sekce 4).

> Důležitý nález i pro tebe: teng-lin/notebooklm-py potvrzuje, že „capabilities the web UI doesn't expose" ≠ nová funkce jako živé audio — je to jen **hromadný/strukturovaný přístup k tomu, co UI už dělá.** Reverse-engineering nepřidává schopnosti, které model/produkt nemá; jen zpřístupňuje existující.

---

## 2. Co JDE reverse-engineerovat: PoC „NotebookLM Live Relay" (1 session)

Tohle je poctivé „ano, jde to" — jako demo pro tebe. Cíl PoC: **prokázat, že prompt návštěvníka webu doteče do tvé živé session a hlasy hostů se streamují zpět na web.**

### Architektura

```
 Web (návštěvník)          Relay server            Tvůj stroj (přihlášený Chrome)
 ┌───────────────┐  WS/WebRTC ┌──────────┐  CDP    ┌──────────────────────────┐
 │ Přehrát/Připoj │◄─────────►│ signaling │◄───────►│ Chrome + NotebookLM        │
 │ mic + audio   │  audio in  │ + media   │         │  Interactive mode → Join   │
 └───────────────┘  audio out │  bridge   │         │  ▲ virtuální mic (vstup)   │
                              └──────────┘         │  ▼ tab-capture (výstup)    │
                                                    └──────────────────────────┘
```

### Klíčové komponenty

1. **Přihlášený Chrome + perzistentní profil** — už ho máš (`C:\Users\macou\.notebooklm-mcp-cli\chrome-profile`). Spustíš s remote-debugging (CDP) a stealth (patchright / undetected-chromedriver), aby tě Google nedetekoval.

2. **Audio dovnitř (návštěvník → NotebookLM) — jádro celého hacku:** Chrome musí „slyšet" audio návštěvníka jako svůj mikrofon. Dvě cesty:
   - **Virtuální mikrofon** (doporučeno pro živý tok): Windows [VB-CABLE](https://vb-audio.com/Cable/), Linux PulseAudio `null-sink` + `virtual-source`. Chrome se spustí s tímto zařízením jako default; ty do něj streamuješ audio návštěvníka (nebo TTS jeho napsaného promptu).
   - **Fake-audio flagy Chromu** (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=prompt.wav`): jednodušší, ale statický soubor — nehodí se pro živou řeč, jen pro předpřipravené prompty.

3. **Audio ven (NotebookLM → návštěvník):** zachytit zvuk karty — malé rozšíření s `chrome.tabCapture`, nebo `getDisplayMedia({audio:true})`, nebo systémový loopback (WASAPI na Windows / PulseAudio monitor). Zakódovat do Opusu a poslat přes WebRTC/WS na web.

4. **Automatizace UI:** Playwright/CDP klikne: notebook → generovat Audio Overview → **Interactive mode** → **Join**. Když hosté vyzvou k dotazu, do virtuálního mic už teče audio návštěvníka.

5. **Relay server + web:** WebSocket/WebRTC most; front-end s „Přehrát" (server spustí a připojí se do session, začne přeposílat audio hostů) a „Připojit se" (odemkne mic návštěvníka → virtuální mic; nebo textové pole → TTS → virtuální mic).

### Ověřovací plán PoC (pořadí kroků)
- **Krok 0 — zjistit protokol (nejdřív!):** V tvém prohlížeči spustit interaktivní audio a otevřít `chrome://webrtc-internals` (nebo DevTools → Network → WS/Media). Zjistit, jestli „Join" jede přes **WebRTC** (uvidíš PeerConnection + SDP/ICE) nebo **WebSocket** s audio rámci. To rozhoduje o proveditelnosti bezprohlížečové varianty (sekce 3).
- **Krok 1:** Prokázat zachycení audia karty (nahrát hlasy do souboru).
- **Krok 2:** Prokázat injektáž virtuálního mic (pustit testovací WAV → hosté zareagují). **Testuj anglicky** (interaktivní režim česky neumí).
- **Krok 3:** Propojit relé pro jednoho návštěvníka.
- **Krok 4:** Změřit latenci a stabilitu při 10min session.

### Poctivé limity PoC (proč je to jen demo)
- **Interaktivní režim = jen anglicky** → tvé české téma/prompty dopadnou špatně.
- **1 session naráz** — druhý návštěvník koliduje.
- **Latence se sčítá** (mic → server → virtuál → NotebookLM → capture → web).
- **Křehké** (beta UI se mění), roste **riziko banu** účtu s veřejným provozem.
- **Proti ToS** — vystavuješ svou přihlášenou Google identitu cizím lidem.

➡️ **Verdikt sekce:** Postavitelné jako soukromé demo pro tebe. Ne jako veřejný produkt.

---

## 3. „Svatý grál": bezprohlížečový protokolový klient (těžší — a stejně nepomůže)

Elegantnější než klikat v UI by bylo prolomit **samotný protokol** a mluvit s Google servery napřímo, bez Chromu. Pokud Krok 0 ukáže WebRTC, teoreticky by šlo:
1. Odchytit signaling (SDP nabídku/odpověď) + auth tokeny, které stránka při „Join" vytvoří.
2. Postavit vlastní **headless WebRTC klient** (např. [aiortc](https://github.com/aiortc/aiortc) / [pion](https://github.com/pion/webrtc)), který si otevře vlastní spojení k Google media serveru.
3. Posílat Opus (audio návštěvníka) nahoru, přijímat audio hostů dolů — **bez prohlížeče**.

**Proč je to výrazně těžší a stejně to neodemkne veřejný produkt:**
- **Auth/attestation:** tokeny jsou krátkodobé, vytvořené jen uvnitř přihlášené Google session, pravděpodobně obalené anti-abuse ochranou (reCAPTCHA Enterprise / integrity token). Reprodukovat je mimo reálný prohlížeč je velmi křehké.
- **Souběžnost se tím NEŘEŠÍ:** i bezprohlížečově každá souběžná živá session potřebuje **vlastní přihlášený Google účet** → pořád farma účtů (sekce 4).
- **Pohyblivý cíl:** Google protokol/tokeny rotuje; rozbije se to.
- **ToS** se tím jen zhoršuje.

➡️ Náročnost ↑↑, odemčené bariéry = žádné. Nevyplatí se.

---

## 4. Strukturální zdi: proč „někdo to dořeší" tady neplatí

MCP se povedlo, protože statické audio a chat mají tvar, který automatizaci vyhovuje. Živé audio pro veřejnost má tvar, který automatizace **nevyřeší**:

1. **Souběžnost = exkluzivita účtu.** 1 přihlášený účet = 1 živá session. Pro N souběžných návštěvníků potřebuješ **N účtů × N prohlížečů × N audio zařízení** — farma, jejíž cena i riziko banu rostou s počtem uživatelů. (Statický chat naopak zvládne 1 účet ve frontě pro mnoho lidí.)
2. **Angličtina je limit modelu, ne UI.** Žádná automatizace nedonutí interaktivní režim mluvit česky. Dokud to Google nerozšíří, tvůj český korpus je mimo hru.
3. **Anonymní přístup = pronájem tvé Google identity veřejnosti.** Bezpečnostní i ToS problém, který kódem nezmizí.
4. **Rate/session limity** (≈15 min idle, ~50 dotazů/den free) veřejný provoz sežere okamžitě.

Tohle nejsou „nevyužité mezery", které čekají na šikovného hackera. Jsou to **vlastnosti tvaru té funkce.** Proto je (jako jediné) nikdo neautomatizoval.

---

## 5. Chytřejší cesta: postav rovnou to, co chceš (a je to MÍŇ práce)

Zásadní pointa: **robustní reverse-engineering živého relé je víc práce a míň spolehlivé** než postavit tu samou zkušenost načisto — a ta načistá verze **projde všemi zdmi** (veřejné, souběžné, česky, bez ToS rizika).

**Máš dvě zralá real-time audio API, obě umí přesně tvůj „butt-in" (native barge-in):**
- [**OpenAI Realtime API**](https://ai.google.dev/gemini-api/docs/live-api) — nejčistší přerušování („utne se v půlce věty a reaguje na nový bod").
- [**Gemini Live API**](https://ai.google.dev/gemini-api/docs/live-api) — nativní více hlasů, „proactive audio" (model umí i mlčet a poslouchat), GA na Vertexu 2026, 70+ jazyků.

**Návrh (viz i Cesta B v prvním dokumentu):**
- Dva hosté = dvě persony/hlasy; „Připojit se" = nativní přerušení uživatelovým audiem.
- **Grounding máš zdarma vyřešený:** tvých **204 zdrojů už leží lokálně jako `.docx`** (`.switchboard/NotebookLM`). Export → embeddings/File API → hosté grounded na stejném materiálu jako NotebookLM.
- Veřejné, souběžné (session per návštěvník), **česky**, čisté vůči ToS, platíš za minuty audia.
- Bonus: **vlastníš hlasy i persony** — můžeš si vibe „hostů NotebookLM" doslova postavit podle sebe.

**Srovnání energie:**

| | Reverse-engineered live relay | Vlastní build (Realtime/Live API) |
|---|---|---|
| Veřejné / souběžné | ❌ farma účtů | ✅ triviálně |
| Česky | ❌ | ✅ |
| Robustnost | ❌ pohyblivý cíl, ban | ✅ stabilní API |
| ToS | ❌ | ✅ |
| „Butt-in" | ✅ (křehce) | ✅ (nativně) |
| Odhad práce na produkční verzi | **vyšší** | **nižší** |

---

## 6. Doporučení

1. **Chceš důkaz konceptu / „že to jde"?** Postav PoC ze sekce 2 (1 session, anglicky, jen pro tebe). Začni **Krokem 0** — zjisti protokol přes `chrome://webrtc-internals`. Je to skvělý technický experiment, ale ber ho jako demo, ne základ produktu.
2. **Chceš ten produkt (kdokoli, veřejně, živě, butt-in, česky)?** Nestavěj to na NotebookLM. Postav to na **OpenAI Realtime / Gemini Live** a napoj svých 204 zdrojů (sekce 5). Je to méně práce a projde to zdmi ze sekce 4.
3. **Hybrid:** Statické „hlasy NotebookLM" MP3 (přes tvůj MCP, umíš hned) jako „výchozí přehled" + živý butt-in přes Realtime API. Nejlepší poměr autenticita/robustnost.

---

## 7. Jak jsem to ověřoval
- Prošel ekosystém reverse-engineering projektů NotebookLM (teng-lin, PleasePrompto, israelbls, upamune) → všechny dělají **jen statické audio** přes UI automatizaci, žádný živé interaktivní.
- Ověřil real-time API (OpenAI Realtime — čistý barge-in; Gemini Live — multi-voice, proactive audio, 70+ jazyků, GA 2026).
- Techniky audio-plumbingu (VB-CABLE / PulseAudio virtual source, `chrome.tabCapture`, Chrome fake-audio flagy, aiortc/pion) jsou standardní a doložené; **konkrétní transport „Join" (WebRTC vs WS) je nutné potvrdit Krokem 0** — to je jediná neznámá, kterou PoC musí ověřit jako první.

### Zdroje
- [teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) · [PleasePrompto/notebooklm-mcp](https://github.com/PleasePrompto/notebooklm-mcp) · [israelbls/notebooklm-podcast-automator](https://github.com/israelbls/notebooklm-podcast-automator) · [upamune/notebooklm-podcast-automator](https://github.com/upamune/notebooklm-podcast-automator)
- [Gemini Live API docs](https://ai.google.dev/gemini-api/docs/live-api) · [Realtime Voice AI APIs porovnání 2026](https://apiscout.dev/guides/realtime-voice-ai-apis-comparison-2026)
- [Google: NotebookLM audio interactivity](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024/) · [aiortc](https://github.com/aiortc/aiortc) · [pion/webrtc](https://github.com/pion/webrtc)
