# Výzkum: Statistiky historie poslechu OP/ED/OST (YouTube + Spotify)

> Stav k 2026-07-15. Shrnutí výzkumu proveditelnosti napojení historie poslechu
> na Anime List web (GitHub Pages). Zatím NEIMPLEMENTOVÁNO — dokument „na potom".

## Cíl

Vidět na webu věrohodné statistiky, jak často poslouchám anime hudbu
(OP/ED/OST) — poslouchám na **YouTube** a **Spotify**. Ideálně denní
aktualizace a párování na existující katalog (favorites.json, op_ed_videos.json).

---

## 1. Spotify Web API

**Co jde:**
- Endpoint `GET /v1/me/player/recently-played` — funguje, zdarma, stabilní.
- OAuth 2.0 (scope `user-read-recently-played`), refresh token → trvalý přístup bez ručního přihlašování.
- Počítá se jen přehrání **> 30 s** (dobrá věrohodnost — „prokliknuté" skladby se nepočítají).

**Tvrdé limity:**
- Vrací **max 50 posledních přehrání** — je to krátké okno, NE archiv. Jakmile
  přehraješ 51. skladbu, nejstarší navždy zmizí (platí v API i v aplikaci).
- Podcasty endpoint nevrací.
- Žádný oficiální endpoint na kompletní historii.

**Řešení pro plnou historii:**
- **Polling**: cron každých ~30–60 min stáhne novinky (deduplikace přes `played_at`)
  a přikládá je do vlastní DB/JSON. Zachytí prakticky vše, pokud mezi běhy
  nepřehraju 50+ skladeb.
- **GDPR export („Extended streaming history")**: kompletní historie od založení
  účtu (žádost v účtu → trvá dny až týdny). Jednorázově naseje minulost,
  polling pak udržuje přírůstky. ✅ Uživatel s exportem souhlasí.

**Architektura pro GitHub Pages (web bez backendu):**
1. **GitHub Actions scheduled workflow** (zdarma) běží každých 30–60 min.
2. Refresh token + client id/secret v **repo Secrets**.
3. Workflow stáhne `recently-played`, dedupne, appenduje do
   `public/data/listening_history.json` (nebo Parquet/NDJSON po měsících)
   a **commitne do repa** → Pages web jen čte statický JSON.
4. GDPR export se jednorázově zkonvertuje skriptem do téhož formátu.

Pozn.: Actions cron není přesný na minutu (bývá zpožděn) — pro 50-item okno
to nevadí, když interval ≤ 1 h.

## 2. YouTube

**Oficiální cesta neexistuje:**
- YouTube Data API `watchHistory` je **mrtvá od srpna 2016** — vrací trvale
  prázdný seznam. Nic nového se od té doby neotevřelo.
- **Google Takeout** (`watch-history.json/html`): funguje, ale jen ručně,
  vrací jen poslední roky, počet záznamů kolísá → nepoužitelné pro denní update.
- **ytmusicapi** (neoficiální, cookies auth): `get_history()` funguje jen pro
  YouTube Music, křehké (rozbije se při změně interního API), bez timestampů
  (jen „dnes/včera").

**Závěr YT:** denní automatická historie z běžného YouTube přehrávání
oficiálně **nejde**. Jediné robustní řešení je scrobbling (níže).

## 3. Scrobbling jako hub (Last.fm / ListenBrainz)

- **Last.fm**: Spotify se připojí **nativně** (server-side, chytá všechna
  zařízení). YouTube/YT Music se chytá přes browser extension
  **Web Scrobbler** (Chrome/Firefox; jen v prohlížeči s rozšířením!).
- Last.fm API (`user.getRecentTracks`) pak vydá **kompletní historii zdarma**,
  stránkovaně, s timestampy → GitHub Action ji stahuje stejně jako výše.
- **ListenBrainz** = open-source alternativa (import z Last.fm možný).
- **multi-scrobbler** (self-host) umí agregovat Spotify + YT Music automaticky,
  ale vyžaduje vlastní server → mimo GitHub Pages scope.

**Slepá místa scrobblingu:** mobilní YouTube aplikace (mimo YT Music)
nescrobbluje; TV/console přehrávání taky ne.

## 4. Párování na katalog webu

- Spotify/Last.fm vrací `track name + artist (+ ISRC u Spotify)`.
- Párování na `favorites.json` (song + author) přes normalizaci à la
  `normalizeAnimeKey` v `src/utils/mediaMatch.js` — **fuzzy problém**:
  romanizace (Gurenge vs. 紅蓮華), covery, „TV size" verze, feat. zápisy.
- Doporučení: párovat song→favorites ručně potvrzenou mapou (jednorázový
  matching skript + `listening_map.json` s výjimkami), ne čistě automaticky.
- Část OP/ED/OST na Spotify **vůbec není** (TV-size, staré tituly, regionální
  bloky) → statistika nikdy nebude 100% pokrytí katalogu.

## 5. Verdikt

| Otázka | Odpověď |
|---|---|
| Zdarma? | Ano (Spotify API, GH Actions, Last.fm API — vše free tier) |
| Stabilní? | Spotify polling ano; YT jen přes scrobbler (extension) |
| Denní update? | Ano — GH Actions cron + commit JSON |
| Věrohodné? | Spotify ano (>30 s pravidlo); YT jen z prohlížeče s rozšířením |
| GitHub Pages friendly? | Ano — web čte jen statický JSON z repa |

**Doporučené pořadí implementace (až se do toho půjde):**
1. Spotify: OAuth app + GH Action polling → `listening_history.json`.
2. GDPR export konverze (naseje historii).
3. Párovací skript song ↔ favorites + ruční mapa výjimek.
4. UI: statistiky u Favorites (počet přehrání, timeline, top OP/ED).
5. (Volitelně) Last.fm hub, pokud se ukáže, že YT poslech je významný podíl.

**Osobní hodnocení (Claude):** dává smysl jen pokud Spotify tvoří většinu
poslechu anime hudby. Polovičaté pokrytí (YT mimo scrobbler, chybějící
skladby na Spotify) jinak povede k frustrujícím „děravým" statistikám.
Alternativa: brát to jen jako hračku „kolikrát jsem si pustil X" bez ambice
na úplnost.

## Zdroje

- Spotify recently-played docs: https://developer.spotify.com/documentation/web-api/reference/get-recently-played
- 50-item limit (komunita): https://community.spotify.com/t5/Spotify-for-Developers/Recently-Played-Endpoint-%CE%A350/td-p/5033711
- YouTube Data API revision history (deprecace watchHistory 2016): https://developers.google.com/youtube/v3/revision_history
- Takeout parser příklad: https://pypi.org/project/youtubewatched/
- Web Scrobbler: https://webscrobbler.com/
- Last.fm Track My Music: https://www.last.fm/about/trackmymusic
- Last.fm scrobbling API: https://www.last.fm/api/scrobbling
- multi-scrobbler: https://foxxmd.github.io/multi-scrobbler/
- ytmusicapi: https://ytmusicapi.readthedocs.io/
