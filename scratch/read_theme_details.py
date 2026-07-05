with open("c:/Users/macou/.gemini/antigravity-ide/scratch/Anime List WEB/anime-list-web/src/index.css", "r", encoding="utf-8") as f:
    lines = f.readlines()

rezero_lines = []
in_rezero = False
bracket_count = 0

for i, line in enumerate(lines):
    if '[data-theme="rezero"]' in line:
        in_rezero = True
        bracket_count = 0
    
    if in_rezero:
        rezero_lines.append((i+1, line))
        bracket_count += line.count('{') - line.count('}')
        if bracket_count <= 0 and '{' in ''.join([rl[1] for rl in rezero_lines]):
            # We found the end of the block
            in_rezero = False
            # Print it
            print(f"--- Block starting at line {rezero_lines[0][0]} ---")
            for idx, rl in rezero_lines:
                print(f"{idx}: {rl}", end="")
            rezero_lines = []
