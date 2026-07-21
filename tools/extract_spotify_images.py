import os
import shutil
import glob
import json

def copy_spotify_images():
    # Skript žije v anime-list-web/tools/ → app root je o úroveň výš
    app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    source_dir = r"C:\Users\macou\OneDrive - ŠKODA AUTO VYSOKÁ ŠKOLA o.p.s\Osobní PC\Excel Projekt - nemazat\Anime_List\Náhledovky a obrázky - Anime\Obrázky\Spotify"
    dest_dir = os.path.join(app_root, "public", "images", "spotify")
    os.makedirs(dest_dir, exist_ok=True)
    
    mapping = {}
    
    if not os.path.exists(source_dir):
        print("Source directory not found")
        return
        
    for item in os.listdir(source_dir):
        item_path = os.path.join(source_dir, item)
        if os.path.isdir(item_path):
            images = glob.glob(os.path.join(item_path, "*.*"))
            valid_images = [img for img in images if img.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
            
            if valid_images:
                src_img = valid_images[0]
                ext = os.path.splitext(src_img)[1].lower()
                dest_filename = f"{item}{ext}"
                dest_path = os.path.join(dest_dir, dest_filename)
                
                shutil.copy2(src_img, dest_path)
                
                # Mapping is original folder name -> relative path
                mapping[item] = f"images/spotify/{dest_filename}"
                
                # Also add mapping for colon version (Windows replaces : with _)
                if "_" in item:
                    # Replace "_ " with ": " first as it's the most common pattern
                    colon_item = item.replace("_ ", ": ").replace("_", ":")
                    if colon_item != item:
                        mapping[colon_item] = f"images/spotify/{dest_filename}"
                
                print(f"Copied {item} -> {dest_filename}")

    # Output map to data folder
    map_dst = os.path.join(app_root, "public", "data", "spotify_images.json")
    with open(map_dst, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print("Exported spotify_images.json map")
    
if __name__ == "__main__":
    copy_spotify_images()
