with open("c:/Users/macou/.gemini/antigravity-ide/scratch/Anime List WEB/anime-list-web/src/index.css", "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find data-theme blocks
matches = re.finditer(r"\[data-theme=\"([^\"]+)\"\]\s+([^{]+)\{", content)

for m in matches:
    theme = m.group(1)
    selectors = m.group(2)
    start_pos = m.start()
    
    # Count line numbers
    line_no = content[:start_pos].count('\n') + 1
    
    if ".card" in selectors or ".dashboard-group" in selectors:
        # Find the full block containing '{' and '}'
        block_end = content.find("}", start_pos)
        block = content[start_pos:block_end+1]
        print(f"Line {line_no}: Theme '{theme}'")
        print(block)
        print("-" * 50)
