# 🎨 Theme Research — "Red Outline" Style

> Vlož sem analýzu z AI (odpověď na prompt o červených linkách v anime).
> Až budeš mít data, řekni mi a já téma implementuju.

---

## 🔍 Co hledáme

- Přesné hex kódy červených obrysů (lineart) v anime scénách s bílým pozadím
- Re:Zero — sanctuary/dream scény s bílým pozadím
- Classroom of the Elite — White Room scény (Kiyotaka Ayanokoji)
- Japonský termín: 赤縁取り (akai fuchidori)

---

## 📥 Sem vlož výsledek:

# Anime Red Outline Lineart on White Background: Color Codes and Website Theme Guidance
## Overview
This report investigates the "red lineart on bright white background" look seen in anime (e.g., Re:Zero sanctuary scenes, Classroom of the Elite White Room) and related production practices, with the goal of extracting plausible hex color codes and design principles you can adapt for a web theme. Because studios do not publicly publish exact per-shot RGB values for outlines, the analysis triangulates from anime color measurement charts, CLIP STUDIO / PaintMan workflow documentation, and general anime color guides. The outcome is a set of realistic, production-adjacent reds and a broader art-direction framework rather than a single "official" value.[1][2][3][4]
## Data Sources and Limitations
### Lack of per-scene studio disclosure
Official production materials for Re:Zero (White Fox) and Classroom of the Elite (Lerche) do not include technical RGB/HEX breakdowns for specific shots or outline layers. Available art books, fan art, and streaming footage allow visual sampling but are not accompanied by authoritative numeric color specs, and frame capture plus eyedropper sampling is outside the scope of this text-only research workflow. Therefore, the report focuses on:[5][6]

- Standard anime color charts derived from measured cel paints (Taiyo Color) and digitized "anime color" sets.
- CLIP STUDIO / PaintMan documentation describing line / trace colors in RGB terms.
- Generic anime color design guidance with explicit hex/RGB codes.
### Anime color measurement charts (Taiyo Color)
The "アニメカラー測定データ" (Anime Color Measurement Data) by ねこまたや (Nekomataya) provides LAB and RGB measurements for a large catalog of traditional anime color swatches, including multiple reds and red-pinks used for cel paint. These swatches are referenced by tools like "アニメカラーチャート" (Anime Color Chart) and CLIP STUDIO color sets, which explicitly state they are built from Nekomataya’s measured RGB values. While they are not labeled "outline" colors, they represent typical red hues found in anime production.[7][2][3]
### Anime color chart / palette tools
The "アニメカラーチャート" page provides downloadable palettes (Photoshop, CLIP STUDIO, etc.) based on Nekomataya’s RGB data so illustrators can paint with "anime-like" colors in digital workflows. An associated CLIP STUDIO "アニメカラー_カラーセット" asset confirms it is simply wrapping those measured swatches into a practical color set for digital painting. This gives a realistic spectrum of reds that are consistent with cel-era anime and widely reused in digital production.[7][3]
### General anime color guides with hex codes
A 2025 Japanese blog post on "アニメでよく使われる色12選" explicitly lists hex and RGB codes for typical strong anime colors, including a "鮮やかな赤色" (bright vivid red) at hex `#FF0000`. The same article gives other accent colors (pinks, yellows, etc.) that help situate red in the overall palette context, though it does not address outline-specific usage.[4]
### Line / trace color workflow documentation (CLIP STUDIO & PaintMan)
CLIP STUDIO documentation and support articles describe how animators and digital painters change line colors and how PaintMan recognizes specific RGB values as color-trace lines. One support article lists the RGB values used as "彩色プレーン" (color-trace planes) in PaintMan, with explicit RGB definitions such as red `(255, 0, 0)` and a set of magenta, yellow, cyan, and pastel variants. This shows that bright, pure red (`#FF0000`) is a standard control color used for line/trace work in digital pipelines.[8][9][10]
## Candidate Reds for Anime Red Lineart
### 1. Pure RGB control red used in PaintMan / CLIP STUDIO workflows
The PaintMan documentation describes that, for color-trace lines, certain RGB values are reserved as plane-separating colors.[8]

- Red: RGB `(255, 0, 0)` → hex `#FF0000`
- Green: RGB `(0, 255, 0)` → hex `#00FF00`
- Blue: RGB `(0, 0, 255)` → hex `#0000FF`

It also lists additional pastel/magenta codes like `0xFF80FF (255, 128, 255)` and `0xFF8080 (255, 128, 128)` as special-purpose colors for shadow/hilight designations, though these are not recognized as color-trace lines in PaintMan. In practice, artists using CLIP STUDIO often recolor black lines by applying any desired RGB/HEX via "線の色を描画色に変更" or by clipping colored layers, and pure `#FF0000` is frequently used as a clear, high-contrast choice.[9][10][8]
### 2. Measured anime reds from Nekomataya’s Taiyo Color data
The Nekomataya anime color measurement chart lists many red-index swatches with associated RGB values; a few representative entries include:[2]

- R30: RGB `127, 39, 52` → hex approximately `#7F2734` (a deep, slightly desaturated crimson).
- R10: RGB `74, 42, 45` → approx `#4A2A2D` (dark reddish-brown).
- R3: RGB `193, 17, 63` → approx `#C1113F` (strong, bluish red).
- R7: RGB `215, 70, 91` → approx `#D7465B` (bright, warm red-pink).
- R50: RGB `227, 131, 134` → approx `#E38386` (soft, light coral-red).
- R80: RGB `218, 128, 146` → approx `#DA8092` (pale, pinkish red).
- R90: RGB `231, 161, 167` → approx `#E7A1A7` (light pastel red-pink).

These swatches come from actual cel paint samples measured under standardized conditions, so they represent plausible "anime paint" reds that could be applied to lineart, especially when the intention is a softer or more melancholic look rather than a harsh control red.[3][2]
### 3. Palette-level anime reds from general guides
The "アニメでよく使われる色12選" article defines "鮮やかな赤色" with hex `#FF0000`, RGB `255,0,0`, and associates it with high-energy characters, battle scenes, and attention-grabbing effects. It also features a vivid pink (`#FF69B4`) and various warm oranges and yellows that often coexist with red in high-key scenes. This corroborates that, in modern digital anime, pure `#FF0000` is accepted as a standard vivid red, and pastel/pink variants around it are common accent choices.[4]
### 4. Practical design range for "anime red outline" on white
Given the control red `#FF0000` and the measured paint reds, a practical range for anime-inspired red lineart on white backgrounds can be framed as:

- Hard, technical outline / control red: `#FF0000`.
- Warm crimson/rose outlines:
  - Deep crimson: `#C1113F` (Nekomataya R3).
  - Bright rose: `#D7465B` (Nekomataya R7).
  - Soft coral: `#E38386` (Nekomataya R50).
  - Pastel pinkish red: `#DA8092` or `#E7A1A7` (R80/R90).
- Utility pastel control-like red: `#FF8080` (PaintMan shadow designation).[8]

This range covers strong emotional reds used for outlines, while allowing you to tune saturation and brightness to match the mood of your website sections.
## Specific Series: Re:Zero and Classroom of the Elite
### Re:Zero "Akai fuchidori" sanctuary / dream scenes
Available web sources discuss Re:Zero’s use of white backgrounds in "重要な回" (important episodes), but they focus on compositional contrast and character visibility rather than technical color codes. No direct RGB/HEX is published for the "赤縁取り" (red edge/outline) technique used in sanctuary or dream-like scenes. Production studios typically manage color via proprietary LUTs or internal palette sheets, which are not distributed publicly in numeric form.[7][3][11][12]

Given the absence of disclosed codes, a realistic approximation for Re:Zero-like soft red outlines on white is to draw from the pastel anime reds above:

- Base outline: `#E38386` (soft coral) or `#DA8092` (pale pinkish red) for a gentle, ethereal look.
- Hover/active or "more intense" states: `#D7465B` or `#C1113F` for heightened emotional emphasis.

These values sit visually close to the rosy, slightly desaturated reds observed in many high-key, white-background anime scenes, while remaining grounded in measured anime color data.[2][3]
### Classroom of the Elite: White Room scenes
For Kiyotaka Ayanokoji’s "White Room" scenes, public commentary and video content focus on narrative and character psychology, not line color specifications. Available scenes feature stark high-key lighting, pure or near-pure white backgrounds, and relatively neutral character outlines that sometimes trend towards low-saturation grays rather than bright color outlines.[13][14]

Since Lerche does not publish per-shot RGB specs either, a plausible design interpretation is:

- Default outline color: near-black or dark neutral (e.g. `#1A1A1A` to `#333333`), based on typical anime line usage on white.[2]
- Occasional red-tinged outline or accent in psychological emphasis cuts: deep crimson within the Nekomataya range (e.g. `#7F2734` or `#C1113F`).

If you want to echo the "White Room" feeling in your web theme, these scenes suggest minimal, controlled use of color, with red reserved for specific focal elements (e.g. critical buttons or warning states), rather than global outlines.
## How Studios Use Red Lines in Bright / Overexposed Contexts
### Color-trace and multi-color line systems
Anime beginners tutorials show examples of multi-color line systems where the same drawing uses black for primary lines, blue for shadow lines, and red for highlight lines and certain boundaries (such as eyes and white-of-eye separation). This reinforces the idea that red lines are often functional and layered, not simply "the only outline color." In production, these colored lines are later composited, recolored, or merged into a final line pass that may appear black or tinted depending on the cut.[15]
### Digital line recoloring in CLIP STUDIO
CLIP STUDIO offers several mechanisms to recolor lineart:

- "線の色を描画色に変更" directly remaps non-transparent pixels in a layer to the current drawing color.[16][9][17]
- "透明ピクセルをロック" plus painting allows selective recoloring of only line pixels.[18][9]
- "レイヤーカラー" can globally tint a line layer with a chosen color while preserving alpha.[9][19]

Tutorials show simple examples where a black line is recolored to red by choosing a red color in the palette (often pure `#FF0000`) and using these tools. This means that, at least in the digital phase, outline color can be any RGB/HEX you choose, constrained primarily by readability against the background.[10]
### Readability and recognition on white
Guides emphasize that strong red is much more readily recognized than light cyan or other cool hues when used sparsely as line-trace or annotation colors. On pure white backgrounds, vivid reds and darker neutrals maintain legibility, whereas light pastel lines risk washing out. This is relevant to web UX: if the background is pure white, outlines must maintain enough contrast to be readable.[20]
## Color Palette Analysis: "Red Outline" on Pure White
### Contrast and luminance
From a design perspective, the anime red-outline look exploits significant luminance contrast: white backgrounds near `#FFFFFF` paired with mid-to-dark red outlines (relative luminance roughly 0.1–0.3) produce crisp, eye-catching edges. Measured anime reds like `#C1113F` and `#D7465B` fall into a sweet spot where outlines are distinctly visible without appearing as pure black.[2]
### Hue and emotional temperature
- Hue: All the candidate reds cluster around traditional red (0–20°) and red-purple (20–340°) on the HSV/HSL wheel.[1][21]
- Emotional temperature: Deeper reds (`#7F2734`, `#C1113F`) feel serious or ominous, while lighter coral/pink (`#E38386`, `#DA8092`, `#E7A1A7`) feel soft, dream-like, or nostalgic.

For a web theme, picking 2–3 reds along this axis allows you to encode emotional states via outline color, echoing anime’s use of red as both a danger and affection color.
### Saturation vs. softness in ethereal scenes
High-key, overexposed anime scenes often soften outlines by lowering saturation and/or raising value, which leads to pastel reds rather than harsh primaries. The measured Nekomataya R50/R80/R90 values illustrate this: they are significantly lighter and less saturated than control red `#FF0000` but still read as "red" rather than pink when juxtaposed with white and neutral surroundings.[2][3]

On a website, you can mimic this by:

- Using pastel red outlines (`#DA8092`, `#E7A1A7`) for non-critical interactive elements (cards, subtle borders), reinforcing a gentle aesthetic.
- Reserving saturated red (`#FF0000` or `#D7465B`) for hover states, alerts, or narrative highlights.
## Suggested Hex Palette for an Anime-Inspired Web Theme
The following table consolidates a practical palette you can build around:

| Role | Hex | Origin / Rationale |
|------|-----|--------------------|
| Core control red (technical, strong) | `#FF0000` | Standard vivid anime red; PaintMan color-trace red; generic anime guide.[4][8] |
| Deep crimson outline | `#7F2734` | Approximation of Nekomataya R30 (127, 39, 52); serious/ominous outlines.[2] |
| Bright rose outline | `#D7465B` | Approximation of R7; emotionally intense but still soft compared to pure red.[2] |
| Soft coral outline | `#E38386` | Approximation of R50; good for Re:Zero-like gentle red edges.[2] |
| Pastel pink-red outline | `#DA8092` | Approximation of R80; ethereal dream scenes, delicate borders.[2] |
| Very light pink-red | `#E7A1A7` | Approximation of R90; almost fading into white, ideal for overexposed backgrounds.[2] |
| Shadow / utility pastel red | `#FF8080` | PaintMan shadow designation color; can be used as hover/secondary accent.[8] |
| Near-black neutral outline | `#1A1A1A` | Generic anime line color against white; fits Classroom of the Elite style.[2][4] |

Using this palette, you can compose a theme where "anime red outlines" are not one fixed color but a hierarchy of reds for different semantic roles.
## Design Patterns for Website Art Direction
### Pattern A: Re:Zero-inspired ethereal white + soft red
- Background: predominantly `#FFFFFF` or slightly tinted off-white (e.g. `#FDFBFF`) to emulate overexposed sanctuary scenes.[11]
- Primary outline color: `#E38386` for card borders, illustrations, and icon strokes.
- Secondary outline/accent: `#DA8092` or `#E7A1A7` for inner borders, subtle separators, or inactive states.
- Highlight/interaction red: `#D7465B` or `#FF0000` for hover states, important buttons, or storytelling beats.

This pattern prioritizes softness and emotional warmth, suitable for portfolio sections, about pages, or narrative-driven content.
### Pattern B: Classroom of the Elite "White Room" minimalism
- Background: pure white `#FFFFFF` with large empty spaces.
- Default outline: near-black `#1A1A1A` or dark neutral for most UI elements, mirroring the clinical, controlled environment.[13]
- Rare red accents: use `#C1113F` or `#D7465B` only for critical callouts (e.g. warnings, pivotal CTAs), intensifying their impact.

This pattern makes red feel "dangerous" or "disruptive," matching the psychological tension of the White Room narrative.
### Pattern C: Technical anime production homage
- Use pure control colors (`#FF0000`, `#00FF00`, `#0000FF`) as subtle motif references (e.g. small corner marks, indicators) inspired by PaintMan’s color-trace planes.[8]
- Combine with measured anime neutrals (`N` series grays and `BL`/`BB` darks) approximated as hex values like `#121212`, `#333333`, `#555555`.[2]

This yields a more meta, "behind-the-scenes" feel while still harnessing the red outline idea where necessary.
## Originality Considerations
### Avoid literal copying; focus on systems
Because no public source provides the exact numeric outline colors for the scenes you mentioned, any hex values you derive are, by necessity, approximations rather than copies. This gives you freedom to design an original system that is anime-informed but not derivative:[5][6]

- Use anime-measured reds as anchor points, then adjust slightly (e.g. HSL tweaks) to create a unique signature hue.
- Establish clear rules: which elements use deep crimson vs. pastel red vs. near-black; under what interactions the color shifts.
### Encode narrative meaning in color states
Anime uses red outlines and accents contextually—romantic tension, danger, sanctity—rather than as a static brand color. Reflect this by mapping your palette to semantic states:[4][15]

- Soft pastel red for safe, intimate content (profile, story, testimonials).
- Bright rose or crimson for critical actions (submit, delete, jump-to-scene), evoking tempo and risk.
- Neutral outlines where you want to emphasize emptiness, isolation, or focus.
### Integrate non-red complementary colors
Guides on anime colors highlight strong pairings and contrast relationships: red with deep green, red with dark navy, red with white or silver. For a coherent theme, extend your palette:[1][4][22]

- Complementary deep green (`#006400`) for rare accent backgrounds or status badges.[4]
- Low-saturation navy (`#191970`) for typography or structural elements that need authority without competing with the red.[4]

By limiting the number of strong complementary hues, you maintain the red outline as the perceptual focus.
## How to Implement the Palette in Practice (Tool-Level Notes)
While this report cannot manipulate images directly, CLIP STUDIO and similar tools allow you to test and refine these colors in lineart workflows:[16][9][10]

- In CLIP STUDIO, you can input hex or RGB in the "色の設定" dialog and apply "線の色を描画色に変更" to quickly recolor line layers to your candidate reds.[9][23]
- The Anime Color Chart palettes can be loaded, and you can sample Nekomataya reds with an eyedropper, then record their hex equivalents for consistency between illustration and CSS.[3]

This makes it straightforward to match your site’s CSS hex codes to lineart colors you actually see in test illustrations, tightening the link between code and art direction.
## Conclusion
There is no single published "official" hex code for the red lineart used in Re:Zero sanctuary scenes or Classroom of the Elite White Room cuts; studios manage those colors internally and do not expose them numerically. However, by combining PaintMan’s control red (`#FF0000`), Nekomataya’s measured anime reds (e.g. `#C1113F`, `#D7465B`, `#E38386`, `#DA8092`, `#E7A1A7`), and general anime color guidance, you can construct a robust, anime-informed palette for red outlines on white backgrounds. The proposed palette and design patterns give you a flexible but principled foundation for creating a website theme with strong originality and clear art direction, while remaining visually grounded in recognizable anime color language.[2][3][4][5][6][8]



---

## 🎯 Cíl

Vytvořit nové tmavé téma inspirované "červenými linkami" — teplé, karmínové, 
s dominantní červenou jako hlavním akcentem. Nesmí být podobné Pastel Light 
(fialovo-světlý) ani Re:Zero (oranžovo-fialový).

### Moje návrhy barev (před výzkumem):

| Proměnná | Varianta A "Crimson" | Varianta B "White Room" | Varianta C "Cursed Energy" |
|---|---|---|---|
| `--bg-primary` | `#0d0808` | `#050508` | `#0f0508` |
| `--bg-secondary` | `#140e0e` | `#0a0a10` | `#180a0e` |
| `--accent-primary` | `#dc2626` | `#ef4444` | `#e11d48` |
| `--text-primary` | `#f5f0f0` | `#fafafa` | `#ffe4e6` |
