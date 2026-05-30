with open(r"c:\Users\macou\.gemini\antigravity-ide\scratch\Anime List WEB\anime-list-web\src\pages\AnimeRatings.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "jikan" in line.lower() or "cache" in line.lower():
        print(f"Line {idx + 1}: {line.strip()}")
