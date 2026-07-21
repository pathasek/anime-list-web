# 🏮 Anime List Web

Aplikace **Anime List Web** je interaktivní a vizuálně bohaté webové centrum určené pro sledování, analýzu a detailní hodnocení anime seriálů a filmů. Nabízí pokročilé statistiky, analytické grafy, AI textové rozbory epizod a široké možnosti přizpůsobení.

![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=flat&logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=black)
![Chart.js](https://img.shields.io/badge/Chart.js-4.5-FF6384?style=flat&logo=chartdotjs&logoColor=white)

---

## ✨ Hlavní funkce a vlastnosti

- 📊 **Dashboard & Kompletní Analytika**: Interaktivní přehled o celkovém počtu zhlédnutých epizod, času sledování, rozložení podle žánrů, typů a animačních studií.
- 🎯 **Detailní hodnocení (Anime Ratings)**: Pokročilé možnosti srovnávání titulů podle kategorií (Animace, Plot, Pacing, Postavy, OST atd.), radarové grafy, vyhlašování TOP žebříčků a sledování dynamických trendů.
- 📅 **Historický log & Heatmapa (History Log)**: 
  - Roční heatmapa aktivity sledování podle jednotlivých dnů.
  - Sledování a vyhodnocování nejdělších i aktuálních **streaků** zhlédnutých dnů.
  - Přehled rozložení podle dnů v týdnu a nejúspěšnějších měsíců.
- 📝 **AI Rozbory epizod a kategorií**:
  - Podrobné faktické a narativní rozbory z vygenerovaných DOCX analýz.
  - Interaktivní modal okna s plynulou tlačítkovou (◄/►) i klávesnicovou (`←` `→`) navigací mezi epizodami.
- 🎨 **9 Vizuálních témat**:
  - Dynamické přepínání vzhledu (*Neon Dark*, *Cyberpunk*, *Emerald Forest*, *Re:Zero*, *Scarlet Outline*, *Retro 8-bit*, *Obsidian Grey*, *Pastel Light*, *Excel Classic*).
  - Okamžitá synchronizace barevných palet grafů s vybraným tématem.
- 🎵 **OST & Media Player**: Integrované přehrávání OP/ED znělek a hudebních ukázek přímo u jednotlivých rozborů.
- 🎁 **Personalizovaný Anime Wrapped & Doporučení**: Osobní výroční rekapitulace sledování s inteligentními doporučeními dalších anime.
- 📌 **Plánovač sledování (Plan to Watch)**: Přehledná správa priorit a plánovaných sérií k vidění.

---

## 🛠️ Použité technologie

- **Frontend**: React 19, Vite, React Router DOM
- **Vizualizace dat**: Chart.js, React-Chartjs-2, Chartjs-Plugin-Datalabels, D3 Cloud
- **Styling**: Custom CSS variables, moderní skleněný/neonový design systém, responsive grid layout
- **Deployment**: Automated GitHub Pages script (`gh-pages`)

---

## 🚀 Lokální spuštění a vývoj

1. Klonování repozitáře:
```bash
git clone https://github.com/macou/Anime_List.git
cd Anime_List/anime-list-web
```

2. Instalace závislostí:
```bash
npm install
```

3. Spuštění vývojářského serveru:
```bash
npm run dev
```

4. Produkční build:
```bash
npm run build
```

5. Nasazení na GitHub Pages:
```bash
npm run deploy
```
