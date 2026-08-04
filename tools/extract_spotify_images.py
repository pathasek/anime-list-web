import os
import shutil
import glob
import json

def copy_spotify_images():
    # Skript žije v anime-list-web/tools/ → app root je o úroveň výš
    app_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # …a kořen Anime_List další dvě úrovně nad ním. Odvozeno z __file__, ať se dá
    # celá složka přesunout; přebít lze proměnnou prostředí ANIME_LIST_ROOT.
    anime_list_root = os.environ.get("ANIME_LIST_ROOT") or os.path.dirname(os.path.dirname(app_root))
    source_dir = os.path.join(anime_list_root, "Náhledovky a obrázky - Anime", "Obrázky", "Spotify")
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

                # Kopíruje se jen nový/změněný soubor: copy2 zachovává mtime,
                # takže shoda velikosti a času znamená stejný obrázek. Dřív se
                # všech ~32 obrázků přepisovalo při každém běhu.
                zkopirovat = True
                try:
                    ss = os.stat(src_img)
                    ds = os.stat(dest_path)
                    if ss.st_size == ds.st_size and abs(ss.st_mtime - ds.st_mtime) < 2:
                        zkopirovat = False
                except OSError:
                    pass

                if zkopirovat:
                    shutil.copy2(src_img, dest_path)
                    print(f"Copied {item} -> {dest_filename}")

                # Mapping is original folder name -> relative path
                mapping[item] = f"images/spotify/{dest_filename}"

                # Also add mapping for colon version (Windows replaces : with _)
                if "_" in item:
                    # Replace "_ " with ": " first as it's the most common pattern
                    colon_item = item.replace("_ ", ": ").replace("_", ":")
                    if colon_item != item:
                        mapping[colon_item] = f"images/spotify/{dest_filename}"

    # Output map to data folder (zapisuje se jen při změně obsahu)
    map_dst = os.path.join(app_root, "public", "data", "spotify_images.json")
    stara_mapa = None
    try:
        with open(map_dst, "r", encoding="utf-8") as f:
            stara_mapa = json.load(f)
    except Exception:
        pass
    if stara_mapa != mapping:
        with open(map_dst, "w", encoding="utf-8") as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
        print("Exported spotify_images.json map")
    else:
        print("spotify_images.json beze změny")
    
if __name__ == "__main__":
    copy_spotify_images()
