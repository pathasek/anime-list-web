# 🔌 API & Integrations — Doporučení pro Anime List WEB

> **Datum:** 11. 7. 2026  
> **Účel:** Přehled externích API a služeb, které projekt aktuálně nepoužívá, ale mohly by přinést nové funkcionality.

---

## 📊 Přehled současných vs. doporučených API

| # | API / Služba | Aktuálně používáme? | Doporučená priorita |
|---|-------------|---------------------|---------------------|
| 1 | **Jikan `/anime/{id}/characters`** | ❌ (store připraven) | ⭐⭐⭐⭐⭐ Okamžitě |
| 2 | **AniList API (rozšíření)** | ⚠️ Jen v Recommendations | ⭐⭐⭐⭐ Vysoká |
| 3 | **AnimeThemes.moe (GraphQL)** | ❌ | ⭐⭐⭐⭐ Vysoká |
| 4 | **Kitsu API** | ❌ | ⭐⭐⭐ Střední |
| 5 | **OMDb API (IMDB)** | ⚠️ Jen statický cache | ⭐⭐⭐ Střední |
| 6 | **MAL OAuth 2.0** | ❌ | ⭐⭐⭐ Střední |
| 7 | **YouTube Data API v3** | ❌ (jen embed) | ⭐⭐ Nízká |
| 8 | **Spotify Web API** | ❌ | ⭐⭐ Nízká |
| 9 | **Google Drive API v3** | ⚠️ Jen API klíč | ⭐ Nízká |

---

## 1. Jikan `/anime/{id}/characters` ⭐⭐⭐⭐⭐

### Co to je?
Endpoint Jikan API v4 vracející **seznam postav** daného anime včetně jejich rolí (Main/Supporting), japonských i anglických voice actorů a obrázků.

### Endpoint
```
GET https://api.jikan.moe/v4/anime/{malId}/characters
```

### Co vrací?
```json
{
  "data": [
    {
      "character": {
        "mal_id": 123,
        "url": "https://myanimelist.net/character/123/...",
        "images": { "jpg": { "image_url": "..." } },
        "name": "Character Name"
      },
      "role": "Main",
      "voice_actors": [
        {
          "person": { "mal_id": 456, "name": "VA Name", "images": {...} },
          "language": "Japanese"
        }
      ]
    }
  ]
}
```

### Co to přinese tvému webu?
- **Detail anime → záložka "Postavy"**: galerie postav s voice actors
- **Propojení s XP systémem**: achievementy za "oblíbené postavy", "nejvíc anime s daným VA"
- **Dashboard widget**: "Tví nejčastější voice actors" (top 10 podle počtu viděných anime)
- **IndexedDB store `characters` už máš připravený** — stačí implementovat downloader

### Rate limiting
- Stejný jako zbytek Jikan: 3 req/s, 60 req/min
- Data se prakticky nemění → **permanentní cache** do IndexedDB

### Náročnost implementace
🟢 **Nízká** — infrastruktura je hotová (rate limiter, IndexedDB, background downloader)

---

## 2. AniList API (rozšíření) ⭐⭐⭐⭐

### Co už používáme?
V `Recommendations.jsx` používáme AniList GraphQL pro:
- Tagy (s rankem ≥ 30, bez spoilerů)
- Relace (sequel/prequel/side story/spin-off)
- Formát, epizody, trvání, sezónu

### Co dalšího AniList nabízí?
AniList GraphQL API (`https://graphql.anilist.co`) je **mnohem bohatší**, než aktuálně využíváme:

| Endpoint/Query | Co vrací | Využití |
|---------------|----------|---------|
| `Media.staff` | Režiséři, scénáristé, animátoři | Detail anime → "Tým" |
| `Media.studios` | Studia s `isMain` flag | Lepší studio data než z Excelu |
| `Media.recommendations` | Uživatelská doporučení | Rozšíření Recommendations stránky |
| `Media.rankings` | Žebříčky (popularita, skóre) | Dashboard statistiky |
| `Media.trailer` | YouTube/site trailer URL | Embed traileru v detailu |
| `Media.externalLinks` | Odkazy na Oficiální web, Twitter, Wikipedii | Detail anime |
| `Media.streamingEpisodes` | Kde se dá legálně streamovat | Detail anime → "Kde sledovat" |
| `Character` queries | Detail postav, včetně description | Galerie postav |
| `Staff` queries | Detail tvůrců, filmografie | "Tým" záložka |
| `Studio` queries | Všechna anime studia | Rozšíření Dashboard grafu studií |
| `User` queries | Statistiky, favorites | *(vyžaduje OAuth)* |

### Příklad — Staff + Studios v jednom dotazu
```graphql
query ($id: Int) {
  Media(idMal: $id, type: ANIME) {
    staff(sort: RELEVANCE) {
      nodes {
        name { full }
        primaryOccupations
      }
    }
    studios {
      nodes {
        name
        isMain
      }
    }
    recommendations { nodes { mediaRecommendation { title { romaji } } } }
    trailer { id site }
  }
}
```

### Co to přinese?
- **Detail anime → záložka "Tým"**: režisér, scénárista, hudební skladatel
- **Detail anime → "Kde sledovat"**: odkazy na Crunchyroll, Netflix atd.
- **Rozšířené Recommendations**: použít AniList doporučení jako další signál
- **Trailer embed**: YouTube trailer přímo v hlavičce detailu

### Rate limiting
- AniList má **90 req/min** (velmi štědré)
- Žádná autentizace není potřeba pro čtení

### Náročnost implementace
🟢 **Nízká** — GraphQL už máš nastavené, jen rozšířit existující dotazy

---

## 3. AnimeThemes.moe API ⭐⭐⭐⭐

### Co to je?
**Specializovaná databáze OP/ED videí** — obsahuje přímé odkazy na WebM/MP4 videa openingů a endingů včetně metadat (verze, spoilery, NSFW flag).

### Endpoint (GraphQL)
```
POST https://graphql.animethemes.moe/
```

### Co vrací?
```graphql
query {
  anime(search: "Steins;Gate") {
    resources {
      edges {
        node {
          id
          name
          slug
          images { facet }
          resources {
            nodes {
              site
              link
            }
          }
          themes {
            id
            type          # OP / ED
            sequence      # OP1, OP2...
            group
            entries {
              id
              version      # 1, 2, 3...
              nsfw
              spoiler
              episodes
              videos {
                link       # Přímý odkaz na .webm
                resolution
              }
              audio {
                link
              }
            }
          }
        }
      }
    }
  }
}
```

### Co to přinese?
- **Automatické doplňování OP/ED videí** — nemusíš je ručně stahovat na Google Drive
- **Přímé streamovatelné .webm odkazy** — žádný Google Drive rate limiting
- **Verzování OP/ED**: OP1, OP2, OP v2 (jiný vizuál), OP v3...
- **Metadata**: spoilery flag, NSFW, epizody kde se theme používá
- **Alternativní zdroj**: pokud Google Drive selže, fallback na AnimeThemes

### Rate limiting
- Standardní Laravel rate limiter — přesné limity nejsou veřejné, ale API je štědré

### Náročnost implementace
🟡 **Střední** — potřeba přidat GraphQL klienta a nový zdroj videí vedle existujícího GDrive systému

---

## 4. Kitsu API ⭐⭐⭐

### Co to je?
**Alternativní anime databáze** (kitsu.io) s JSON:API rozhraním. Má **bohatší metadata než Jikan** v některých oblastech a **mnohem mírnější rate limiting**.

### Endpoint
```
https://kitsu.io/api/edge/anime?filter[text]=cowboy+bebop
```

### Klíčové výhody oproti Jikan

| Vlastnost | Kitsu | Jikan |
|-----------|-------|-------|
| **Rate limit** | Neomezený (bez auth) | 3 req/s |
| **Postavy** | Plné včetně role | Plné včetně VA |
| **Staff** | Anime Productions, Castings | Pouze přes `/staff` |
| **Streaming odkazy** | ✅ Streamers endpoint | ❌ |
| **Manga data** | ✅ Plná podpora | ✅ |
| **Trending** | ✅ `/trending/anime` | ❌ (TOP jen) |
| **Mappings** | MAL/AniDB/Trakt ID mapping | ❌ |
| **Epizody** | Plné včetně synopsí | ✅ |
| **Autentizace** | OAuth2 (volitelná) | ❌ (read-only) |
| **Formát** | JSON:API (standardizovaný) | Vlastní REST |

### Co to přinese?
- **Fallback/alternativní zdroj dat** — když Jikan nestíhá nebo má výpadek
- **Streaming odkazy**: `GET /streaming-links?filter[animeId]=X` — kde se dá legálně streamovat
- **Trending data**: `GET /trending/anime` — co je populární tuto sezónu
- **Lepší paginace**: JSON:API standard, `page[limit]` až 500 (vs Jikan 25)
- **ID mapping**: `GET /mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=40748` — konverze mezi MAL/AniDB/Trakt ID

### Příklad — Streaming odkazy
```
GET https://kitsu.io/api/edge/anime?filter[text]=cowboy+bebop&include=streamingLinks
```
Vrací pole streamerů (Crunchyroll, Netflix, Hulu...) s URL a info o subs/dubs.

### Náročnost implementace
🟡 **Střední** — JSON:API formát je jiný než Jikan REST, chce to samostatný service modul

---

## 5. OMDb API (IMDB) ⭐⭐⭐

### Co to je?
**The Open Movie Database** — REST API poskytující detailní informace o filmech a seriálech z IMDB databáze.

### Endpoint
```
https://www.omdbapi.com/?apikey={key}&t={title}&type={type}
```

### Co vrací?
```json
{
  "Title": "Cowboy Bebop: The Movie",
  "Year": "2001",
  "Rated": "R",
  "Released": "11 Aug 2002",
  "Runtime": "115 min",
  "Genre": "Animation, Action, Crime",
  "Director": "Shinichirô Watanabe",
  "Writer": "Keiko Nobumoto, Hajime Yatate",
  "Actors": "Kôichi Yamadera, Steve Blum, Beau Billingslea",
  "Plot": "A terrorist explosion releases a deadly virus...",
  "imdbRating": "7.8",
  "imdbVotes": "49,529",
  "imdbID": "tt0275277",
  "Type": "movie",
  "BoxOffice": "$1,000,993",
  "Production": "N/A",
  "Awards": "N/A",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "7.8/10" },
    { "Source": "Rotten Tomatoes", "Value": "68%" },
    { "Source": "Metacritic", "Value": "62/100" }
  ]
}
```

### Co to přinese?
- **Další zdroj hodnocení**: IMDB, Rotten Tomatoes, Metacritic (vedle MAL a vlastního)
- **Box office data**: U filmů kolik vydělaly
- **Detailní plot**: IMDB synopse jako další zdroj
- **Ocenění**: Awards informace
- **Rating source přepínač**: Už máš v `AnimeRatings.jsx` UI pro přepínání zdrojů — teď bys mohl dotáhnout živá data

### API klíč
- **FREE tier**: 1 000 requestů/den
- **PATRON**: $1/měsíc — neomezeně + poster API (280k+ obrázků, 2000×3000px)

### Náročnost implementace
🟢 **Nízká** — máš `imdb_cache.json` a UI pro přepínání zdrojů, jen přidat live fetch

---

## 6. MyAnimeList OAuth 2.0 ⭐⭐⭐

### Co to je?
Oficiální MAL API (`https://api.myanimelist.net/v2`) umožňuje **čtení i zápis** uživatelského anime listu — ale vyžaduje OAuth 2.0 autentizaci.

### Hlavní endpointy
```
GET  /v2/anime/{id}?fields=id,title,main_picture,mean,rank,popularity,...
GET  /v2/users/@me/animelist?fields=list_status
PATCH /v2/anime/{id}/my_list_status   # Aktualizace progress/status/score
DELETE /v2/anime/{id}/my_list_status  # Smazání z listu
GET  /v2/anime/ranking?ranking_type=all
GET  /v2/anime/season/{year}/{season}
```

### Co to přinese?
- **Live synchronizace s MAL**: automaticky aktualizovat `anime_list.json` když si něco přidáš na MAL
- **Obousměrná synchornizace**: změny na webu → MAL, změny na MAL → web
- **MAL skóre v reálném čase**: aktuální `mean`, `rank`, `popularity` (ne 24h cache z Jikan)
- **Anime sezóny**: `GET /anime/season/2026/summer` — co vychází tuto sezónu
- **MAL rankings**: oficiální žebříčky

### Autentizace (Authorization Code + PKCE)
```
1. GET https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=...&code_challenge=...
2. Uživatel autorizuje aplikaci na MAL
3. Redirect s ?code=AUTHORIZATION_CODE
4. POST https://myanimelist.net/v1/oauth2/token → access_token + refresh_token
```

### Omezení
- Access token vyprší za **1 hodinu**
- Refresh token za **1 měsíc**
- Nutná registrace aplikace na MAL — získáš `client_id` a `client_secret`
- Pro `localhost` development musíš použít `redirect_uri=http://localhost:5173/callback`

### Náročnost implementace
🔴 **Vysoká** — OAuth flow, backend proxy (client_secret nesmí být v JS), token management

---

## 7. YouTube Data API v3 ⭐⭐

### Co to je?
Oficiální Google API pro práci s YouTube metadaty — vyhledávání, informace o videích, playlistech.

### Endpoint
```
https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id={videoId}&key={apiKey}
```

### Co vrací (oproti Noembed)?
| Data | Noembed | YT Data API |
|------|---------|-------------|
| Název videa | ✅ | ✅ |
| Autor/kanál | ✅ | ✅ |
| Délka videa | ❌ | ✅ `contentDetails.duration` |
| Thumbnaily | ❌ | ✅ Všechny velikosti |
| Statistiky | ❌ | ✅ Views, likes |
| Publikační datum | ❌ | ✅ |
| Kategorie | ❌ | ✅ |
| Description | ❌ | ✅ |
| Kapitoly | ❌ | ✅ |

### Co to přinese?
- **Délka OST videí**: aktuálně Noembed neposkytuje délku — YouTube API ano
- **Automatické thumbnaily** pro OST playlist
- **Lepší metadata** v přehrávači (views, datum vydání)
- **Vyhledávání OST na YouTube**: místo `mediaMatch.js` → `youtubeSearchUrl()` použít API search

### Quota
- **10 000 quota units/den zdarma** (1 search = 100 units, 1 video info = 1 unit)
- API klíč stačí (OAuth jen pro write operace)

### Náročnost implementace
🟢 **Nízká** — jen nahradit Noembed fetch za YouTube API fetch, klíč už máš (Google API Console)

---

## 8. Spotify Web API ⭐⭐

### Co to je?
Oficiální Spotify API pro vyhledávání tracků, alb, playlistů a embedování přehrávače.

### Endpointy
```
GET https://api.spotify.com/v1/search?q={query}&type=track
GET https://api.spotify.com/v1/tracks/{id}
GET https://api.spotify.com/v1/playlists/{id}/tracks
```

### Co to přinese?
- **Embedded Spotify player**: místo YouTube pro OST — Spotify embed oficiálně podporovaný
- **Automatické matching**: vyhledat OST skladby na Spotify a embedovat je
- **Spotify playlisty**: vytvářet "Anime OST playlist" automaticky z `favorites_ost.json`
- **Album arty**: kvalitnější obrázky než YouTube thumbnaily

### Omezení
- Vyžaduje **Spotify Premium** pro Web API
- OAuth 2.0 (Client Credentials pro search, Authorization Code pro playlisty)
- Rate limit: závisí na typu tokenu

### Aktuálně používáme
- `spotify_images.json` — statický soubor s obrázky
- Žádné živé Spotify API volání

### Náročnost implementace
🟡 **Střední** — OAuth, token refresh, ale knihovna existuje

---

## 9. Google Drive API v3 ⭐

### Co už používáme?
- `gdrive_config.json` s API klíčem: `AIzaSyDhiVuDSjiyKKxo6ZYuk8V4xB7w1BTOW4k`
- Python skript `build_gdrive_op_ed.py` — scrapuje / používá API klíč pro listing souborů

### Co Drive API v3 přináší navíc?
- **Spolehlivé stránkování**: `files.list` s `pageToken` — na rozdíl od scrapování, které selhává u 200+ souborů
- **Filtry**: `q=name contains 'OP,'` pro automatické kategorizování
- **Změny v reálném čase**: `files.watch` — notifikace když přibude nové video
- **Metada**: `createdTime`, `modifiedTime`, `size` — lepší informace o videích

### Proč nízká priorita?
- Aktuální systém (scrapování + přímý stream) **funguje dobře**
- AnimeThemes.moe (doporučení #3) by mohl GDrive úplně nahradit
- Investice do GDrive API má smysl jen pokud chceš ponechat GDrive jako primární zdroj

### Náročnost implementace
🟢 **Nízká** — API klíč už máš, jen změnit Python skript

---

## 🎯 Doporučený plán implementace

### Fáze 1: Okamžitě (nízké riziko, vysoký přínos)
1. ✅ **Jikan Characters endpoint** — store máš, stačí downloader + UI
2. ✅ **AniList rozšíření** — staff, studios, trailer, streamingEpisodes
3. ✅ **OMDb live fetch** — doplnit statický IMDB cache o živá data

### Fáze 2: Krátkodobě (střední riziko)
4. ⏳ **AnimeThemes.moe** — alternativní zdroj OP/ED videí
5. ⏳ **Kitsu API** — fallback zdroj dat + streaming odkazy
6. ⏳ **YouTube Data API v3** — metadata pro OST videa

### Fáze 3: Dlouhodobě (vyšší riziko)
7. 📅 **MAL OAuth** — obousměrná synchronizace
8. 📅 **Spotify Web API** — embedded Spotify přehrávač

---

## 📝 Poznámky k implementaci

### Bezpečnost API klíčů
- **GDrive API klíč** je aktuálně v `gdrive_config.json` → NEMĚL by být v Gitu
- Pro produkci: všechny API klíče přes **environment variables** (Vite: `VITE_*` prefix)
- **MAL client_secret** NIKDY nesmí být v client-side kódu — musí jít přes backend proxy

### Rate limiting — současný stav
| API | Limit | Aktuální využití |
|-----|-------|-----------------|
| Jikan | 3 req/s, 60 req/min | ~80 % (background downloader) |
| AniList | 90 req/min | ~5 % (jen Recommendations) |
| GDrive | Neznámý | Nízké (jen občasné streamování) |
| Noembed | Neznámý | Velmi nízké |

⚠️ **Pozor**: Pokud přidáš Jikan Characters downloader, zvýší se vytížení Jikan API ~3×. Zvaž Kitsu jako fallback.

### IndexedDB rozšíření
Aktuální `jikan_cache` DB (verze 2) má 4 store. Pro nové featury přidej:
- `STORE_CHARACTERS` — už existuje, jen prázdný!
- `STORE_STAFF` — pro AniList staff data
- `STORE_THEMES` — pro AnimeThemes cache
- `STORE_STREAMING` — pro Kitsu streaming odkazy

---

## 🔗 Užitečné odkazy

| Služba | Dokumentace |
|--------|------------|
| Jikan API v4 | https://docs.api.jikan.moe/ |
| AniList GraphQL | https://docs.anilist.co/ |
| AnimeThemes GraphQL | https://api-docs.animethemes.moe/graphql/intro/ |
| Kitsu JSON:API | https://kitsu.docs.apiary.io/ |
| OMDb API | https://www.omdbapi.com/ |
| MAL OAuth 2.0 | https://myanimelist.net/apiconfig/references/authorization |
| YouTube Data API | https://developers.google.com/youtube/v3 |
| Spotify Web API | https://developer.spotify.com/documentation/web-api |
| Google Drive API | https://developers.google.com/drive/api |
