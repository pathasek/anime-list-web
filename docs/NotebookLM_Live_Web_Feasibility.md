# Analýza proveditelnosti: Živé propojení NotebookLM interaktivního audia („Join" / „butt-in") s webem

**Autor analýzy:** Claude (Opus 4.8) · **Datum:** 12. 7. 2026
**Zadání:** Ověřit, zda lze živě propojit interaktivní audio přehled NotebookLM (funkce „Join" / „butt-in") s webovou stránkou tak, aby libovolný návštěvník (i cizí 3. osoba) klikl na tlačítko, přehrál se výchozí přehled (např. *„Why viewers rightfully despise Rudeus Greyrat"*) a poté se mohl „Připojit se" a zadat vlastní prompt dvěma AI hlasům.

> **Poznámka k rozsahu:** Tento dokument je pouze analýza a návrh (PoC / feasibility). Nic jsem nekódoval ani nesestavoval. Návody v sekci 5 popisují *jak* by se to stavělo, ne že je to hotové.

---

## 0. TL;DR – Verdikt

**Přesně to, co chceš, s NotebookLM NELZE postavit.** Interaktivní audio („Join") je funkce vázaná na tvůj přihlášený Google účet v prohlížeči a **Google výslovně zakazuje, aby s tvým přehledem interagovali cizí lidé přes sdílený odkaz.** Neexistuje žádné veřejné real-time API a žádný z tvých MCP serverů tuto funkci vůbec neumí (umí jen vyrobit *statické* MP3).

**Co ale jde** (a čím se dá tvůj zážitek reálně dosáhnout), jsou tři alternativní cesty:

| Cesta | Co to je | Pro koho | Fidelita vůči tvému nápadu | Náročnost |
|---|---|---|---|---|
| **A. „Relay" přes automatizaci prohlížeče** | Server řídí tvůj přihlášený Chrome, audio se přeposílá na web | Jen ty sám, 1 session | Vysoká vizuálně, ale křehké a proti pravidlům | Vysoká |
| **B. Vlastní živé audio přes Gemini Live API** ⭐ | Postavíš si vlastní „dva hlasy + butt-in" na Gemini Live | Kdokoli, škáluje, veřejné | Vysoká funkčně, ne doslova „hlasy NotebookLM" | Vysoká, ale čistá |
| **C. Statické Audio Overview + živé Q&A** | Předgeneruješ MP3 přes MCP + chat/hlasová otázka | Kdokoli, nejrobustnější | Střední (není to „stejný živý proud") | Nízká |

**Doporučení:** Pokud chceš přesně ten zážitek (kdokoli, veřejně, živě, butt-in) → **cesta B**. Pokud chceš rychlý funkční MVP dnes s tím, co máš → **cesta C**. Cesta A je jen efektní „párty trik" pro tebe, ne produkční řešení.

---

## 1. Ověření verzí (co doopravdy máš nainstalováno)

Zadal jsi repo `jacob-bd/notebooklm-mcp-cli`. Při ověření se ukázalo, že máš nainstalované **tři různé** NotebookLM balíčky (všechny přes `pip`, v `C:\Users\macou\AppData\Roaming\Python\Python312\site-packages`), a že MCP, který ve skutečnosti volá tvé Antigravity IDE, je **jiný projekt**, než jaký jsi mi poslal.

| Balíček (PyPI) | Autor / repo | Tvoje verze | Aktuální verze | Používá to IDE? |
|---|---|---|---|---|
| `notebooklm-mcp-cli` | **Jacob Ben-David** — [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) *(repo, které jsi poslal)* | **0.7.7** | **0.8.6** (GitHub) | ❌ Ne |
| `notebooklm-mcp` | „NotebookLM MCP Team" — [github.com/notebooklm-mcp/notebooklm-mcp](https://github.com/notebooklm-mcp/notebooklm-mcp) | **2.0.11** | **2.0.11** (PyPI) | ✅ **Ano** |
| `notebooklm_cli` | — | 0.1.12 | — | ❌ Ne |

**Jak to čteme:**

- **Repo, které jsi poslal (jacob-bd):** máš verzi **0.7.7**, aktuální na GitHubu je **0.8.6** → jsi **o jednu menší verzi pozadu**. (Soubor `C:\Users\macou\.notebooklm-mcp-cli\update_check.json` obsahuje záznam `"latest_version": "0.5.27"` z 22. 4. 2026 — to je jen zastaralý záznam updateru z dubna, ne tvoje reálná verze.)
- **MCP, který ve skutečnosti běží v Antigravity IDE:** tvůj `mcp_config.json` ukazuje na `...\Python312\Scripts\notebooklm-mcp.exe`, což je balíček `notebooklm-mcp` verze **2.0.11** od jiného autora — a ten je **plně aktuální**.
- Kolem se povaluje i npm balíček `notebooklm-mcp@2.0.0` (od třetího autora, PleasePrompto) v `npm-cache`, ale ten se nepoužívá.

**Důležitý závěr pro tebe:** myslíš si, že jedeš na jacob-bd, ale tvůj denní MCP je „NotebookLM MCP Team" `notebooklm-mcp` 2.0.11. Pro účely tvého dotazu je to ale jedno — **ani jeden ze tří balíčků funkci živého interaktivního audia neobsahuje** (viz sekce 2 a 3).

---

## 2. Co tvůj MCP umí a co ne (limity)

Všechny tři balíčky fungují na stejném principu: **automatizace prohlížeče** (Selenium / `undetected-chromedriver`, resp. Playwright/CDP), přihlášeného pod **tvým** Google účtem. Nejde o oficiální API — „mluví" s webovým UI NotebookLM za tebe.

### Co MCP umí (dle `instructions.md` verze 2.0 a README)
- `setup_auth` / `get_health` / `re_auth` – přihlášení tvým Google účtem, cookies přetrvávají
- `add_notebook`, `select_notebook`, `add_source` – správa notebooků a zdrojů
- `ask_question` – chat s Gemini nad tvými zdroji (RAG), s `session_id` pro kontext
- `generate_audio` → `get_audio_status` → `download_audio` – **vygeneruje a stáhne *statický* Audio Overview jako MP3**

### Co MCP NEumí (klíčové limity)
- ❌ **Žádný interaktivní / „Join" / „butt-in" režim.** Tok je jen: vygeneruj → čekej 2–10 min → stáhni hotové MP3. Není tam žádný nástroj pro živou obousměrnou konverzaci.
- ❌ Žádné živé streamování audia; výstup je předrenderovaný soubor.
- ❌ Ve v2.0 jsou z „Studio" výstupů podporované jen Audio Overview (Video, Prezentace, Myšlenková mapa, Kvíz, Infografika, Tabulka dat generuje NotebookLM, ale MCP je neobaluje).
- ❌ Nahrávání souborů / YouTube / Drive zdrojů není ve v2.0 implementováno (jen text a URL).

### Provozní limity (relevantní pro jakékoli „veřejné" použití)
- **Rate limit:** free Google účet = ~50 dotazů/den na notebook.
- **Session timeout:** ~15 min nečinnosti.
- **Jeden účet = jedno přihlášení.** Automatizace jede pod tvojí identitou.

> **Pointa:** MCP je užitečný na *výrobu* statického podcastu a na chat nad zdroji. K **živému interaktivnímu** zážitku ti nepomůže vůbec — tu funkci prostě nemá a mít nemůže (viz sekce 3).

---

## 3. Proč přesně tvůj cíl s NotebookLM nejde (7 nezávislých blokátorů)

Každý z těchto bodů sám o sobě tvůj scénář zabíjí. Dohromady je to jednoznačné.

1. **Google to explicitně zakazuje.** V nápovědě k Audio Overview stojí, že interaktivní režim je „Join" jen pro autora a že *ostatní uživatelé nemohou s tvým Audio Overview interagovat přes sdílený odkaz*. Tedy ani nativní sdílení NotebookLM cizí „butt-in" neumožňuje. → [Google: Audio Overview](https://support.google.com/notebooklm/answer/16212820?hl=en)
2. **Neexistuje veřejné real-time API.** NotebookLM nemá oficiální developer API pro (interaktivní) audio. Všechny „MCP" nástroje jsou obcházení UI přes automatizaci prohlížeče.
3. **Session je vázaná na tvůj přihlášený Google účet.** Interaktivní přehled běží v tvém autentizovaném prohlížeči. Cizí 3. osoba se nemůže „přihlásit jako ty" a ty nemůžeš svou Google session bezpečně vystavit anonymnímu webu.
4. **MCP interaktivní režim vůbec nenabízí** (sekce 2) — takže ani přes automatizaci ti hotový nástroj nic neusnadní.
5. **Concurrency = 1.** Jedno Google přihlášení = jedna živá session. Nemůžeš současně obsloužit víc návštěvníků webu.
6. **Interaktivní režim je jen anglicky.** Tvůj obsah i prompty jsou česky → i kdyby vše ostatní šlo, „Join" by česky nefungoval dobře.
7. **ToS a bezpečnost.** Vystavit přihlášenou Google session anonymním lidem z internetu je vážné bezpečnostní riziko (únos session) a téměř jistě porušení podmínek Google.

**Závěr sekce:** Doslovné zadání — *veřejné tlačítko → cizí 3. osoba se živě připojí do stejné interaktivní konverzace dvou hlasů NotebookLM* — **není proveditelné.**

---

## 4. Co z tvého nápadu jde zachránit

Tvůj nápad se skládá ze tří „přání", a ne všechna padají:

| Přání | Jde to? | Jak |
|---|---|---|
| Veřejné tlačítko „Přehrát" výchozí přehled | ✅ Ano | Předgeneruj MP3 přes MCP a hostuj ho (cesta C) |
| Dva AI hlasy vedou konverzaci | ✅ Ano | Statické MP3 (C) nebo živě přes Gemini Live (B) |
| Kdokoli (i 3. osoba) se živě „Připojí se" a promptuje hlasy | ⚠️ Ne přes NotebookLM, ale **ano přes vlastní stavbu (B)** | Gemini Live API s native barge-in |
| Konkrétně to bude „hlasy NotebookLM" ve stejném živém proudu | ❌ Ne | Nedosažitelné (sekce 3) |

---

## 5. Návody: tři proveditelné cesty (detailně)

### Cesta A — „Relay" přes automatizaci prohlížeče *(jen PoC pro tebe; NEdoporučuji do produkce)*

**Myšlenka:** Server drží skutečný Chrome přihlášený pod *tvým* Google účtem s otevřeným notebookem. Web má tlačítka „Přehrát" a „Připojit se". Kliknutí přes WebSocket řekne serveru, ať v prohlížeči spustí Audio Overview v *Interactive mode* a klikne „Join". Audio dvou hlasů se zachytí z karty a streamuje na web. Když návštěvník klikne „Připojit se" a mluví, jeho mikrofon se přes virtuální audio zařízení vstříkne do automatizovaného Chromu jako by mluvil vlastník.

**Komponenty:**
1. **Headful Chrome + tvůj perzistentní profil** (už ho máš: `C:\Users\macou\.notebooklm-mcp-cli\chrome-profile`).
2. **Řízení UI** – Playwright / CDP: klik na *Interactive mode* → *Join*.
3. **Virtuální mikrofon** – Windows: [VB-CABLE](https://vb-audio.com/Cable/); Linux: PulseAudio `module-null-sink` + `virtual-source`. Chrome se spustí s tímto zařízením jako default mic.
4. **Zachycení audia karty** – `getDisplayMedia({audio:true})` nebo rozšíření s `chrome.tabCapture`.
5. **Relay na web** – WebSocket/WebRTC obousměrně (audio hlasů ven, mikrofon návštěvníka dovnitř).

**Tok dat (butt-in):** návštěvník mikrofon → WS → server → virtuální mic → NotebookLM „slyší" → odpoví → zachycení karty → WS → reproduktor návštěvníka.

**Proč to NENÍ tvůj cíl a nedoporučuji:**
- Vždy je to **tvoje jediná** Google session → „3. osoba" reálně ovládá tvůj účet; **jen 1 návštěvník naráz**.
- Interaktivní režim = **jen anglicky** → česky nepoužitelné.
- **Křehké** (beta UI se mění), **proti ToS**, **bezpečnostní riziko** (vystavená přihlášená session).
- Latence se sčítá (mic → server → virtuál → NotebookLM → capture → web).

➡️ Použitelné maximálně jako lokální demo pro tebe samotného, ne pro veřejnost.

---

### Cesta B — Vlastní živé interaktivní audio přes **Gemini Live API** ⭐ *(doporučeno pro věrnost + škálování)*

Toto je jediná cesta, která splní *přesně* popsaný zážitek (veřejné tlačítko, kdokoli se připojí, dva hlasy, živý butt-in s prompty) — čistě, škálovatelně a bez ToS problémů. Nebudou to doslova „hlasy NotebookLM", ale **funkčně identický** zážitek, navíc **v češtině** a pro **libovolný počet návštěvníků**.

Gemini Live API je od Google I/O 2026 obecně dostupné (Vertex AI), nabízí **nativní obousměrné audio přes WebSocket**, více hlasů (Zephyr, Aoede, Enceladus…), **native barge-in / přerušení** (přesně tvůj „butt-in") a 70+ jazyků. → [Gemini Live API docs](https://ai.google.dev/gemini-api/docs/live-api)

**Architektura:**

```
 Prohlížeč (web)                     Tvůj backend                 Google
 ┌──────────────┐   WebSocket/WebRTC ┌──────────────┐  WebSocket  ┌───────────────┐
 │ Play / Join  │◄──────────────────►│  Session      │◄──────────►│ Gemini Live   │
 │ mic + audio  │   audio in/out     │  orchestr.    │  audio+text │ (2.5 Native   │
 └──────────────┘                    │  + grounding  │             │  Audio)       │
                                     └──────────────┘             └───────────────┘
```

**Klíčové stavební bloky:**

1. **Frontend** – tlačítka „Přehrát" a „Připojit se"; zachytávání mikrofonu a přehrávání audia (`AudioWorklet` / WebRTC). Kliknutí „Přehrát" otevře session; „Připojit se" jen odemkne mikrofon a pošle přerušení.
2. **Backend proxy** – jedna Live session **na návštěvníka** (klíč nikdy nedáváš do prohlížeče). Node/Python drží WebSocket ke Gemini Live.
3. **Dva hlasy (emulace hostů):**
   - *Jednodušší:* jeden model hraje oba hosty a střídá hlas per replika (systémový prompt „jste dvojice podcasterů A a B…").
   - *Věrnější:* dvě paralelní Live sessions (Host A + Host B), které si povídají mezi sebou; jejich audio mixuješ; butt-in návštěvníka je přeruší. Bližší originálnímu 2‑hlasému banteru NotebookLM.
4. **Grounding na tvé zdroje** – tady je tvoje výhoda: **už máš všech 204 zdrojů lokálně jako `.docx`** (viz `.switchboard/NotebookLM`). Exportuješ je → chunkuješ → vložíš jako kontext (File API / context caching / vektorový store) → hosté jsou „grounded" na stejném materiálu jako v NotebookLM.
5. **Výchozí téma** – session naseeduješ úvodním promptem (např. *„Why viewers rightfully despise Rudeus Greyrat"*), takže dva hosté začnou tímto monologem; „Připojit se" vloží novou uživatelskou repliku, která je nasměruje jinam (native interruption).
6. **Škálování a cena** – každý návštěvník = vlastní session = vlastní náklad (Gemini Live se účtuje **za minutu audia**). Podporuje concurrency i češtinu.

**Postup výstavby (bez kódu, koncepčně):**
1. Zřídit přístup ke Gemini Live API (Vertex AI projekt / API klíč), ověřit v ceníku cenu za minutu audia a že je **čeština** v seznamu podporovaných hlasů/jazyků.
2. Připravit knowledge bázi: dávkově vyexportovat `.docx` zdroje → očistit text → chunky → embeddings / File API.
3. Backend: WS proxy, správa session per uživatel, injektáž system promptu (persony dvou hostů + grounding) a seed tématu.
4. Frontend: mic capture + přehrávání, tlačítka Play/Join, indikace „hosté mluví / posloucháme tě".
5. Butt-in: při „Připojit se" poslat audio uživatele jako přerušení; ověřit, že barge-in funguje plynule.
6. Zátěž/limit: rate-limit na návštěvníka, časový strop session, ochrana klíče.

**Kompromisy:** je to reálná stavba (ne „jen NotebookLM"), platí se za minuty audia, potřebuje export zdrojů. Ale je to **jediná cesta**, která splní „kdokoli, 3. osoba, živě, butt-in, veřejně".

---

### Cesta C — Statické Audio Overview + živé Q&A *(nejrychlejší, nejrobustnější MVP)*

Kompromis, který jde postavit **dnes** a z velké části **s tím, co už máš**.

**Architektura:**
1. **Předgenerování podcastu** – přes tvůj existující MCP: `generate_audio` (téma „Rudeus…") → `get_audio_status` → `download_audio` → dostaneš MP3. **Tuto část umíš už teď.**
2. **Web „Přehrát"** – tlačítko přehraje předrenderované MP3 (např. ten Rudeus přehled).
3. **„Připojit se" = Q&A box** (text nebo push-to-talk):
   - Otázka návštěvníka → backend → buď MCP `ask_question` nad notebookem (grounded RAG, ale **limit ~50 dotazů/den** na free účtu), nebo Gemini grounded na exportovaných zdrojích →
   - odpověď se převede na řeč (TTS – Google Cloud TTS / ElevenLabs, klidně dva hlasy) a přehraje.

**Tok:** Přehraj podcast → návštěvník se „připojí" a zeptá → uslyší odpověď „hostů". Není to doslova přerušení stejného živého proudu, ale zážitek to aproximuje.

**Výhody:** nejlevnější, nejrobustnější, žádná ToS šeď, funguje česky (chat i TTS), škáluje pro text. **Nevýhody:** není to opravdové „butt-in do stejné konverzace".

**Postup:**
1. Přes MCP vyrobit a stáhnout výchozí MP3.
2. Jednoduchá stránka: přehrávač + tlačítko „Připojit se" → textové/hlasové pole.
3. Backend: dotaz → `ask_question` (nebo Gemini nad exportem) → TTS → přehraj.
4. Ošéfovat rate-limit (cachovat časté dotazy, případně přejít z MCP na přímý Gemini + tvůj export, aby ses zbavil limitu 50/den).

---

## 6. Srovnávací tabulka cest

| Kritérium | A. Relay | B. Gemini Live ⭐ | C. Static + Q&A |
|---|---|---|---|
| Splní „kdokoli 3. osoba, veřejně" | ❌ (jen ty, 1 naráz) | ✅ | ✅ |
| Opravdový živý butt-in | ✅ (ale křehký) | ✅ (native barge-in) | ⚠️ (Q&A, ne stejný proud) |
| Čeština | ❌ (EN only) | ✅ | ✅ |
| Concurrency / škálování | ❌ | ✅ | ✅ |
| „Hlasy NotebookLM" doslova | ✅ | ❌ | ❌ (statické MP3 ano) |
| Využije tvůj MCP | částečně | ne | ✅ (generování MP3) |
| ToS / bezpečnost | ❌ rizikové | ✅ čisté | ✅ čisté |
| Náročnost stavby | Vysoká | Vysoká (čistá) | **Nízká** |
| Provozní cena | serverový Chrome | za minutu audia | nízká (MP3 + TTS) |

---

## 7. Doporučení a další kroky

1. **Chceš‑li přesně ten zážitek** (veřejné, kdokoli, živě, butt-in, česky) → jdi cestou **B (Gemini Live API)**. Máš pro ni ideální výchozí pozici: 204 zdrojů už leží lokálně jako `.docx`, takže grounding je „jen" jejich export + embeddings.
2. **Chceš‑li rychlý funkční prototyp tento týden** → cesta **C**: předgeneruj MP3 přes MCP (to umíš hned) a přidej Q&A box.
3. **Cestu A nestav** jako produkt — maximálně jako soukromé demo pro sebe; do veřejného webu se nehodí (ToS, bezpečnost, 1 session, EN only).
4. **Údržba MCP:** balíček jacob-bd máš 0.7.7 (aktuální 0.8.6) — ale reálně jedeš na `notebooklm-mcp` 2.0.11, který je aktuální. Zvaž, jestli vůbec potřebuješ mít nainstalované tři balíčky současně (může to plést, který se spouští).

---

## 8. Jak jsem to ověřoval (transparentnost)

- **Verze:** `pip show` pro `notebooklm-mcp` (2.0.11), `notebooklm-mcp-cli` (0.7.7); PyPI/npm registry pro aktuální verze; `mcp_config.json` pro zjištění, co IDE reálně spouští; GitHub jacob-bd pro aktuální 0.8.6.
- **Schopnosti MCP:** přečetl jsem `instructions.md` (v2.0) a výpis nástrojů (`generate_audio`/`get_audio_status`/`download_audio` = statické) + README jacob-bd. Ani jeden nemá interaktivní/live/join nástroj.
- **Chování NotebookLM:** oficiální nápověda Google k Audio Overview (interaktivní režim je jen pro autora, přes sdílený odkaz cizí lidé neinteragují, jen EN, hlas se neukládá).
- **Alternativa B:** ověřil jsem existenci a schopnosti Gemini Live API (nativní obousměrné audio, více hlasů, barge-in, 70+ jazyků, GA na Vertex 2026).
- **Vědomě jsem NEspouštěl** živou interaktivní session ve tvém přihlášeném Chromu — bylo by to invazivní a nic navíc by to neprokázalo, protože Google limit („cizí přes sdílený odkaz nemohou interagovat") je autoritativní a dokumentovaný.

### Zdroje
- [Google NotebookLM – Generate Audio Overview / Interactive mode](https://support.google.com/notebooklm/answer/16212820?hl=en)
- [Google blog – NotebookLM audio interactivity (Dec 2024)](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024/)
- [Gemini Live API – docs (ai.google.dev)](https://ai.google.dev/gemini-api/docs/live-api)
- [Gemini Live API Native Audio on Vertex AI (Google Cloud blog)](https://cloud.google.com/blog/topics/developers-practitioners/how-to-use-gemini-live-api-native-audio-in-vertex-ai)
- [jacob-bd/notebooklm-mcp-cli (repo, který jsi poslal)](https://github.com/jacob-bd/notebooklm-mcp-cli)
- [notebooklm-mcp na PyPI (balíček, který reálně jede v IDE)](https://pypi.org/project/notebooklm-mcp/)
