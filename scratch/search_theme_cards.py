with open("c:/Users/macou/.gemini/antigravity-ide/scratch/Anime List WEB/anime-list-web/src/index.css", "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find selectors that include .card and are inside a data-theme
# E.g. [data-theme="..."] .card
matches = re.finditer(r"\[data-theme=\"([^\"]+)\"\]\s+([^{]+)\{([^}]+)\}", content)

for m in matches:
    theme = m.group(1)
    selectors = m.group(2)
    rules = m.group(3)
    if ".card" in selectors or ".dashboard-group" in selectors:
        print(f"Theme: {theme}")
        print(f"Selectors: {selectors.strip()}")
        print(f"Rules: {rules.strip()}")
        print("-" * 50)
