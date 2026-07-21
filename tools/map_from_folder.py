"""
Map anime thumbnails from 'Náhledovky a obrázky - Anime' folder to anime_list.json.
Uses robust normalization to match filenames to anime names.
"""
import os
import json
import shutil
import re

# Paths
# Skript žije v anime-list-web/tools/ → app root je o úroveň výš
APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_IMAGES_DIR = r"C:\Users\macou\OneDrive - ŠKODA AUTO VYSOKÁ ŠKOLA o.p.s\Osobní PC\Excel Projekt - nemazat\Anime_List\Náhledovky a obrázky - Anime"
TARGET_IMAGES_DIR = os.path.join(APP_ROOT, "public", "images", "anime")
ANIME_LIST_PATH = os.path.join(APP_ROOT, "public", "data", "anime_list.json")

def clean_string(s):
    """
    Remove all non-alphanumeric characters and lowercase.
    Strictly keeps only a-z and 0-9 for robust matching.
    """
    # Fix for files saved with (question mark)
    s = s.replace('(question mark)', '')
    
    # Keep only alphanumeric
    cleaned = re.sub(r'[^a-zA-Z0-9]', '', s)
    return cleaned.lower()

def strip_season_suffix(name):
    """Odstraní koncové označení sezóny/části, aby 'X, S01' napárovalo obrázek 'X'.
    (Např. 'Bocchi the Rock!, S01' -> 'Bocchi the Rock!' -> obrázek 'Bocchi the Rock!.jpg'.)"""
    n = re.sub(r'[,\s]*\bS(?:eason)?\s*\d+\b(?:[,\s]*\bPart\s*\d+\b)?\s*$', '', name, flags=re.I)
    n = re.sub(r'[,\s]*\bPart\s*\d+\b\s*$', '', n, flags=re.I)
    return n.strip(' ,')

def main():
    print("=" * 50)
    print("Mapping images from folder (Robust Match)")
    print("=" * 50)
    
    # Create a map of cleaned_filename -> original_filename
    source_files_map = {}
    valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
    
    for filename in os.listdir(SOURCE_IMAGES_DIR):
        if filename.lower().endswith(valid_extensions):
            # Remove extension for matching
            name_part = os.path.splitext(filename)[0]
            cleaned = clean_string(name_part)
            source_files_map[cleaned] = filename
            
    print(f"Found {len(source_files_map)} unique image names in source directory")
    
    # Ensure target dir exists
    os.makedirs(TARGET_IMAGES_DIR, exist_ok=True)
    
    # Load anime list
    with open(ANIME_LIST_PATH, 'r', encoding='utf-8') as f:
        anime_list = json.load(f)
    
    print(f"Found {len(anime_list)} anime entries in JSON")
    
    mapped_count = 0
    copied_count = 0
    
    for anime in anime_list:
        name = anime['name']
        cleaned_name = clean_string(name)
        
        match_filename = source_files_map.get(cleaned_name)

        # Fallback: obrázek bez sezónního sufixu (řeší 'X, S01' vs obrázek 'X').
        # Interpunkce (vč. '!') je už odstraněná v clean_string, takže tohle
        # řeší zbývající případy jako Bocchi the Rock!.
        if not match_filename:
            base = strip_season_suffix(name)
            if base and base != name:
                match_filename = source_files_map.get(clean_string(base))
                if match_filename:
                    print(f"  [fallback bez sezóny] {name} -> {match_filename}")

        if match_filename:
            # Copy file to public/images/anime
            src = os.path.join(SOURCE_IMAGES_DIR, match_filename)
            dst = os.path.join(TARGET_IMAGES_DIR, match_filename)
            
            # Copy if not exists or size differs
            try:
                if not os.path.exists(dst) or os.path.getsize(src) != os.path.getsize(dst):
                    shutil.copy2(src, dst)
                    copied_count += 1
                
                # Update json with relative path
                anime['thumbnail'] = f"images/anime/{match_filename}"
                mapped_count += 1
            except Exception as e:
                print(f"Error copying {match_filename}: {e}")
        else:
            # print(f"  No image found for: {name} (cleaned: {cleaned_name})")
            anime['thumbnail'] = None

    # Save updated anime list
    with open(ANIME_LIST_PATH, 'w', encoding='utf-8') as f:
        json.dump(anime_list, f, ensure_ascii=False, indent=2)
    
    print(f"\nMapped {mapped_count} images")
    print(f"Copied {copied_count} new/changed images")
    print(f"Saved updated list to {ANIME_LIST_PATH}")

if __name__ == "__main__":
    main()
