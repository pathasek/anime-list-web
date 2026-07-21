# -*- coding: utf-8 -*-
import sys
import os
import json

script_dir = "tools"
sys.path.append(script_dir)
from export_data import export_top_favorites, get_file_hash

# Resolve absolute path for Excel COM engine
wb_path = os.path.abspath(os.path.join(".", "..", "..", "Anime list.xlsm"))
out_dir = os.path.normpath("public/data")
dist_dir = os.path.normpath("dist/data")

json_path_public = os.path.join(out_dir, "top_favorites.json")
hash_path_public = os.path.join(out_dir, "top_favorites_hash.txt")

json_path_dist = os.path.join(dist_dir, "top_favorites.json")
hash_path_dist = os.path.join(dist_dir, "top_favorites_hash.txt")

print("Excel absolute path:", wb_path)
print("Excel exists:", os.path.exists(wb_path))

# Remove old files to force clean re-extraction
for p in [json_path_public, hash_path_public, json_path_dist, hash_path_dist]:
    if os.path.exists(p):
        try:
            os.remove(p)
            print("Removed:", p)
        except Exception as e:
            print("Could not remove:", p, e)

res = export_top_favorites(wb_path, out_dir)
print('RES count: Top10 Anime:', len(res.get('top10_anime',[])), 'HM Anime:', len(res.get('hm_anime',[])), 'Top10 Chars:', len(res.get('top10_chars',[])))

if res.get('top10_anime') or res.get('hm_anime') or res.get('top10_chars'):
    with open(json_path_public, 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)

    if os.path.exists(dist_dir):
        with open(json_path_dist, 'w', encoding='utf-8') as f:
            json.dump(res, f, ensure_ascii=False, indent=2)

    current_hash = get_file_hash(wb_path)
    if current_hash:
        with open(hash_path_public, 'w', encoding='utf-8') as f:
            f.write(current_hash)
        if os.path.exists(dist_dir):
            with open(hash_path_dist, 'w', encoding='utf-8') as f:
                f.write(current_hash)

    print("SUCCESSFULLY SAVED top_favorites.json to public and dist!")
else:
    print("WARNING: Extracted empty favorites!")
