import os

root_dir = "c:/Users/macou/.gemini/antigravity-ide/scratch/Anime List WEB/anime-list-web"

for dirpath, _, filenames in os.walk(root_dir):
    for f in filenames:
        if f.endswith(('.css', '.jsx', '.html', '.js')):
            filepath = os.path.join(dirpath, f)
            try:
                with open(filepath, 'r', encoding='utf-8') as file:
                    for i, line in enumerate(file):
                        if 'ratings-dashboard-sidebar' in line:
                            print(f"{os.path.relpath(filepath, root_dir)}: Line {i+1}: {line.strip()}")
            except Exception as e:
                pass
