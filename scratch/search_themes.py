import re

with open("c:/Users/macou/.gemini/antigravity-ide/scratch/Anime List WEB/anime-list-web/src/index.css", "r", encoding="utf-8") as f:
    content = f.read()

print("File size:", len(content))
matches = re.findall(r"\[data-theme=[^\]]+\]", content)
print("Found data-theme selectors:", len(matches))
for m in matches[:20]:
    print(m)

# Find all occurrences of border-color in index.css
border_matches = []
for i, line in enumerate(content.splitlines()):
    if "border-color" in line:
        border_matches.append((i+1, line.strip()))

print("\nBorder color lines (first 30):")
for idx, line in border_matches[:30]:
    print(f"Line {idx}: {line}")
