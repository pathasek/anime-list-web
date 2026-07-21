"""
Export Excel anime data to JSON format for web application
"""
import openpyxl
import json
import os
import sys
import subprocess
import base64
import shutil
import tempfile
from datetime import datetime, date, timedelta
from io import BytesIO
import re
import zipfile
from xml.etree import ElementTree as ET
import win32com.client
import hashlib

def serialize_value(val):
    """Convert Excel values to JSON-serializable format"""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    if isinstance(val, str):
        val_str = val.strip()
        # Match DD.MM.YYYY or D.M.YYYY with optional spaces
        m = re.match(r'^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$', val_str)
        if m:
            try:
                day = int(m.group(1))
                month = int(m.group(2))
                year = int(m.group(3))
                return datetime(year, month, day).isoformat()
            except ValueError:
                pass
    if isinstance(val, timedelta):
        total_seconds = val.total_seconds()
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        return f"{hours}:{minutes:02d}"
    if hasattr(val, 'value'):  # ArrayFormula or similar
        return str(val)
    return val

def extract_hyperlink_text(cell):
    """Extract display text from hyperlink if present"""
    if cell.hyperlink:
        return cell.value if cell.value else str(cell.hyperlink.target)
    return cell.value

def export_anime_list(wb, wb_comments=None):
    """Export main anime list"""
    ws = wb["ANIME LIST"]
    data = []
    
    # Load tags from cache
    tags_cache = {}
    if "MAL Cache + Interactive Rating" in wb.sheetnames:
        try:
            ws_cache = wb["MAL Cache + Interactive Rating"]
            
            # 1. Load Tag Descriptions (BP=68, BQ=69)
            tag_descriptions = {}
            for row in range(2, ws_cache.max_row + 1):
                t_name = ws_cache.cell(row, 68).value
                t_desc = ws_cache.cell(row, 69).value
                if t_name and t_desc:
                    tag_descriptions[str(t_name).strip()] = str(t_desc).strip()
                    
            # 2. Map tags to Anime (BY=77, BZ=78)
            for row in range(2, ws_cache.max_row + 1):
                name_val = ws_cache.cell(row, 77).value
                tags_val = ws_cache.cell(row, 78).value
                if name_val and tags_val:
                    name_str = str(name_val).strip()
                    new_tags = []
                    for t in str(tags_val).strip().split(';'):
                        parts = t.split(':')
                        if len(parts) >= 1:
                            t_n = parts[0].strip()
                            rank = parts[1].strip() if len(parts) > 1 else "0"
                            t_d = tag_descriptions.get(t_n, "").replace(':', '-')
                            new_tags.append(f"{t_n}:{rank}:{t_d}")
                    tags_cache[name_str] = ";".join(new_tags)
        except Exception as e:
            print(f"  Warning: Error reading tags from cache: {e}")
    
    # Headers are in row 1
    headers = [
        "index", "thumbnail", "name", "type", "studio", "release_date",
        "themes", "genres", "episodes", "episode_duration", "rating",
        "start_date", "end_date", "rewatch_count", "total_time",
        "dub", "status", "mal_url"
    ]
    
    for row in range(2, ws.max_row + 1):
        # Skip empty rows
        if not ws.cell(row, 3).value:  # Name column
            continue
            
        anime = {}
        col_map = {
            1: "index",
            2: "thumbnail",
            3: "name",
            4: "type",
            5: "studio",
            6: "release_date",
            7: "themes",
            8: "genres",
            9: "episodes",
            10: "episode_duration",
            11: "rating",
            12: "start_date",
            13: "end_date",
            14: "rewatch_count",
            15: "total_time",
            16: "dub",
            17: "status"
        }
        
        for col, key in col_map.items():
            cell = ws.cell(row, col)
            val = cell.value
            
            # Special user rule for Status (Column 17/Q)
            if col == 17:
                if not val or str(val).strip() == "":
                    anime[key] = "PENDING"
                elif str(val).strip().upper() in ["AIRING", "AIRING!"]:
                    anime[key] = "AIRING!"
                else:
                    anime[key] = "FINISHED"
                continue

            # Handle hyperlinks in studio column
            if col == 5 and cell.hyperlink:
                val = str(cell.value) if cell.value else ""
                # Extract studio name from hyperlink text
                if val.startswith("=HYPERLINK"):
                    parts = val.split(",")
                    if len(parts) > 1:
                        val = parts[1].strip().strip('"').strip(")")
            
            anime[key] = serialize_value(val)
        
        # Extract MAL URL from name column hyperlink
        name_cell = ws.cell(row, 3)
        if name_cell.hyperlink and name_cell.hyperlink.target:
            anime["mal_url"] = name_cell.hyperlink.target
        else:
            anime["mal_url"] = None
        
        if anime.get("studio") and isinstance(anime["studio"], str):
            if anime["studio"].startswith("=HYPERLINK"):
                # Try to extract from the formula
                studio = ws.cell(row, 5).value
                if hasattr(studio, '__str__'):
                    anime["studio"] = str(studio).split(",")[-1].strip().strip('"').strip(")")
        
        # Extract series and rewatches from comment if possible
        series_name = None
        rewatch_list = []
        if wb_comments:
            try:
                ws_comments = wb_comments["ANIME LIST"]
                comment = ws_comments.cell(row, 3).comment
                if comment:
                    text = comment.text
                    for line in text.split('\n'):
                        line = line.strip()
                        if not line: continue
                        
                        if 'Rewatch' in line:
                            rewatch_list.append(line)
                            
                        # Use split and case-insensitive check for "Název série"
                        if ":" in line:
                            parts = line.split(":", 1)
                            if parts[0].strip().lower() == "název série":
                                series_name = parts[1].strip()
            except Exception as e:
                print(f"  Warning: Error extracting comment data at row {row}: {e}")
        
        anime["series"] = series_name
        anime["rewatches"] = rewatch_list
        
        anime_name_str = str(anime.get("name", "")).strip()
        anime["tags"] = tags_cache.get(anime_name_str)
        # Fallback: pokud se tagy nenašly podle jména (např. uživatel přejmenoval
        # "Witch Hat Atelier" → "Witch Hat Atelier, S01"), zkusíme název série
        if not anime["tags"] and anime.get("series"):
            series_str = str(anime["series"]).strip()
            anime["tags"] = tags_cache.get(series_str)
        
        data.append(anime)
    
    return data

def export_history_log(wb, wb_comments=None):
    """Export watching history"""
    ws = wb["HISTORY LOG"]
    data = []
    
    # Map comments for column A (Anime column) if wb_comments is provided
    rewatch_map = {}
    if wb_comments:
        ws_comments = wb_comments["HISTORY LOG"]
        for row in range(3, ws_comments.max_row + 1):
            cell = ws_comments.cell(row=row, column=1)
            if cell.comment:
                comment_text = cell.comment.text
                # Look for "X. Rewatch" format
                match = re.search(r'(\d+)\.\s*Rewatch', comment_text, re.IGNORECASE)
                if match:
                    rewatch_map[row] = match.group(1)

    current_date = None
    
    for row in range(3, ws.max_row + 1):  # Skip headers
        name = ws.cell(row, 1).value
        episodes = ws.cell(row, 2).value
        time_spent = ws.cell(row, 3).value
        date_val = ws.cell(row, 4).value
        
        if date_val:
            current_date = serialize_value(date_val)
        
        # Skip if no name or episodes
        if not name or not episodes:
            continue
            
        # Skip summary rows - these start with "(" like "(2x)" which indicates daily count
        name_str = str(name).strip()
        if name_str.startswith("(") and name_str.endswith(")"):
            continue
        
        # Also skip if episodes column is just a count like "(14x)" without episode details
        eps_str = str(episodes).strip()
        if eps_str.startswith("(") and eps_str.endswith(")") and "EP" not in eps_str.upper():
            continue
            
        entry = {
            "name": serialize_value(name),
            "episodes": serialize_value(episodes),
            "time": serialize_value(time_spent),
            "date": current_date,
            "rewatch": rewatch_map.get(row)
        }
        data.append(entry)
    
    return data

def export_general_stats(wb, wb_comments=None):
    """Export general statistics from OBECNÉ INFORMACE"""
    ws = wb["OBECNÉ INFORMACE"]
    
    # Dynamic year detection: scan row 2 from column G onward for year headers
    years = ["total"]  # Column F is always total
    col = 7  # Start at G
    while True:
        val = ws.cell(2, col).value
        if val is None:
            break
        year_str = str(int(val)) if isinstance(val, (int, float)) else str(val).strip()
        if year_str.isdigit() and len(year_str) == 4:
            years.append(year_str)
        else:
            break
        col += 1
    
    # If no years detected, fall back to known years
    if len(years) == 1:
        years = ["total", "2024", "2025", "2026"]
    
    # Extract EXACT dashboard table parity (D2:I9)
    # D is index 4, E is index 5 (skip), F is index 6, G=7, H=8, I=9
    # Limit rows to 9 to skip the Type breakdown arrays as requested by user
    dashboard_table = []
    
    # Read headers from row 2 (D2, F2, G2, H2, I2...)
    headers = [serialize_value(ws.cell(2, 4).value)]
    for c in range(6, 6 + len(years)):
        val = ws.cell(2, c).value
        headers.append(serialize_value(val))
    dashboard_table.append(headers)
    
    # Read data from rows 3 to 9
    for r in range(3, 10):
        row_data = [serialize_value(ws.cell(r, 4).value)] # Row label
        
        for c in range(6, 6 + len(years)):
            cell_val = ws.cell(r, c).value
            
            # Row 3 is "Čas sledování (hh:mm)" which is stored in days in Excel
            if r == 3 and isinstance(cell_val, (int, float)):
                total_hours = float(cell_val) * 24
                hrs = int(total_hours)
                mins = int((total_hours - hrs) * 60)
                cell_text = f"{hrs}:{mins:02d}"
            # Formatting numeric values
            elif isinstance(cell_val, (int, float)):
                if int(cell_val) != cell_val:
                    # Format as float with 2 decimal places, replacing . with ,
                    cell_text = f"{cell_val:.2f}".replace('.', ',')
                    if cell_text.endswith(',00'):
                        cell_text = str(int(cell_val))
                else:
                    cell_text = str(int(cell_val))
            else:
                cell_text = serialize_value(cell_val) or "-"
                
            row_data.append(cell_text)
            
        dashboard_table.append(row_data)

    stats = {
        "last_update": serialize_value(ws.cell(2, 1).value),
        "dashboard_table": dashboard_table,
        "total_time": {},
        "total_episodes": {},
        "avg_episode_duration": {},
        "anime_count": {},
        "comments": {
            "total_time": {},
            "total_episodes": {},
            "rewatch_count": {}
        }
    }
    
    for i, year in enumerate(years):
        col = 6 + i  # Columns F, G, H, I...
        stats["total_time"][year] = serialize_value(ws.cell(3, col).value)
        stats["total_episodes"][year] = serialize_value(ws.cell(5, col).value)
        stats["avg_episode_duration"][year] = serialize_value(ws.cell(6, col).value)
    
    # Extract comments from the formula workbook (if available)
    if wb_comments:
        try:
            ws_c = wb_comments["OBECNÉ INFORMACE"]
            for i, year in enumerate(years):
                col = 6 + i
                # Row 3: total time comments (rewatch breakdown)
                cell_time = ws_c.cell(3, col)
                if cell_time.comment:
                    stats["comments"]["total_time"][year] = cell_time.comment.text
                # Row 5: total episodes comments (rewatch breakdown)
                cell_eps = ws_c.cell(5, col)
                if cell_eps.comment:
                    stats["comments"]["total_episodes"][year] = cell_eps.comment.text
                # Row 7: rewatch count comments (rewatch list)
                cell_rw = ws_c.cell(7, col)
                if cell_rw.comment:
                    stats["comments"]["rewatch_count"][year] = cell_rw.comment.text
        except Exception as e:
            print(f"  Warning: Could not extract comments: {e}")
    
    # Remove empty comment sections
    stats["comments"] = {k: v for k, v in stats["comments"].items() if v}
    if not stats["comments"]:
        del stats["comments"]
    
    return stats

def export_favorites(wb):
    """Export favorite OP/ED/OST"""
    ws = wb["ANIME FAV OP + ED + OST"]
    data = []
    
    # Actual Excel column layout (verified from headers in row 2):
    # Col 8  = Pořadí (index)
    # Col 9  = Název Anime
    # Col 10 = Typ (OP/ED/OST)
    # Col 11 = Song
    # Col 12 = Autor
    # Col 13 = Jazyk
    # Col 14 = Hodnocení textu (Lyrics)
    # Col 15 = Emoce (Emotion)
    # Col 16 = Melodie (Melody)
    # Col 17 = Videoklip (Video)
    # Col 18 = Kvalita hlasu (Voice quality)
    # Col 19 = Sing-along faktor
    # Col 20 = Frisson feeling (Ano/Ne)
    # Col 21 = Hodnocení (průměrné) — average of sub-ratings
    # Col 22 = Finální hodnocení — final user rating
    
    for row in range(3, ws.max_row + 1):
        name = ws.cell(row, 9).value  # Column I - Název Anime
        if not name:
            continue
            
        # Parse frisson as boolean
        frisson_val = ws.cell(row, 20).value
        has_frisson = str(frisson_val).strip().lower() in ('ano', 'yes', 'true') if frisson_val else False
            
        entry = {
            "index": serialize_value(ws.cell(row, 8).value),
            "anime_name": serialize_value(name),
            "type": serialize_value(ws.cell(row, 10).value),
            "song": serialize_value(ws.cell(row, 11).value),
            "author": serialize_value(ws.cell(row, 12).value),
            "language": serialize_value(ws.cell(row, 13).value),
            "rating_lyrics": serialize_value(ws.cell(row, 14).value),
            "rating_emotion": serialize_value(ws.cell(row, 15).value),
            "rating_melody": serialize_value(ws.cell(row, 16).value),
            "rating_video": serialize_value(ws.cell(row, 17).value),
            "rating_voice": serialize_value(ws.cell(row, 18).value),
            "sing_along": serialize_value(ws.cell(row, 19).value),
            "has_frisson": has_frisson,
            "rating_avg": serialize_value(ws.cell(row, 21).value),
            "rating_final": serialize_value(ws.cell(row, 22).value),
        }
        data.append(entry)
    
    return data

def export_ost_tables(wb, wb_formulas=None):
    """Export the three OST tables: scenes, pieces, whole"""
    ws = wb["ANIME FAV OP + ED + OST"]
    ws_formulas = wb_formulas["ANIME FAV OP + ED + OST"] if wb_formulas else None
    
    def get_val_and_link(r, c):
        cell_data = ws.cell(row=r, column=c)
        cell_formula = ws_formulas.cell(row=r, column=c) if ws_formulas else None
        
        # Get link
        link = None
        if hasattr(cell_data, 'hyperlink') and cell_data.hyperlink and cell_data.hyperlink.target:
            link = cell_data.hyperlink.target
        elif cell_formula and hasattr(cell_formula, 'hyperlink') and cell_formula.hyperlink and cell_formula.hyperlink.target:
            link = cell_formula.hyperlink.target
            
        formula_str = str(cell_formula.value) if cell_formula and cell_formula.value else ""
        data_str = str(cell_data.value) if cell_data and cell_data.value else ""
        
        if not link and formula_str.upper().startswith("=HYPERLINK"):
            import re
            m = re.search(r'=HYPERLINK\("([^"]+)"', formula_str, re.IGNORECASE)
            if m: link = m.group(1)
        if not link and data_str.upper().startswith("=HYPERLINK"):
            import re
            m = re.search(r'=HYPERLINK\("([^"]+)"', data_str, re.IGNORECASE)
            if m: link = m.group(1)
            
        # Get text
        val = cell_data.value
        if isinstance(val, str) and val.upper().startswith("=HYPERLINK"):
            import re
            m = re.search(r'=HYPERLINK\("[^"]+",\s*"([^"]+)"\)', val, re.IGNORECASE)
            if m: 
                val = m.group(1)
            else:
                m2 = re.search(r'=HYPERLINK\("[^"]+",\s*(.+)\)', val, re.IGNORECASE)
                if m2: 
                    val = str(m2.group(1)).strip().strip('"')
                
        if val is None and cell_formula and isinstance(cell_formula.value, str) and not cell_formula.value.startswith("="):
            val = cell_formula.value
            
        return serialize_value(val), link

    data = {
        "scenes": [],
        "pieces": [],
        "whole": []
    }
    
    # Table_FAV_OST_SCENES: Y(25), Z(26), AA(27)
    for row in range(3, ws.max_row + 1):
        anime, anime_link = get_val_and_link(row, 25)
        if not anime: continue
        episode, ep_link = get_val_and_link(row, 26)
        scene, scene_link = get_val_and_link(row, 27)
        data["scenes"].append({
            "anime_name": anime, "anime_url": anime_link,
            "episode": episode, "episode_url": ep_link,
            "scene": scene, "scene_url": scene_link
        })
        
    # Table_FAV_OST_PIECES: AD(30), AE(31)
    for row in range(3, ws.max_row + 1):
        anime, anime_link = get_val_and_link(row, 30)
        if not anime: continue
        ost, ost_link = get_val_and_link(row, 31)
        data["pieces"].append({
            "anime_name": anime, "anime_url": anime_link,
            "ost_name": ost, "ost_url": ost_link
        })
        
    # Table_FAV_OST_WHOLE: AG(33)=Pořadí (order), AH(34)=anime, AI(35)=YT, AJ(36)=Spotify
    # POZOR: pole "order" je NUTNÉ — frontend (Favorites.jsx) podle něj řadí "OST Only (As a Whole)";
    # bez něj spadne na abecední řazení (localeCompare). AG obsahuje '01.', '02.', ...
    for row in range(3, ws.max_row + 1):
        order_val, _ = get_val_and_link(row, 33)
        anime, anime_link = get_val_and_link(row, 34)
        if not anime: continue
        yt, yt_link = get_val_and_link(row, 35)
        spotify, spotify_link = get_val_and_link(row, 36)
        data["whole"].append({
            "order": order_val,
            "anime_name": anime, "anime_url": anime_link,
            "yt_playlist": yt, "yt_url": yt_link,
            "spotify_playlist": spotify, "spotify_url": spotify_link
        })
        
    return data

def export_category_ratings(wb):
    """Export category ratings for each anime from MAL Cache sheet"""
    ws = wb["MAL Cache + Interactive Rating"]
    
    # Data structure: anime_name -> {category: rating}
    ratings = {}
    
    # Categories are in columns A-D: Název Anime, Typ, Položka, Hodnocení
    for row in range(2, ws.max_row + 1):
        name = ws.cell(row, 1).value
        typ = ws.cell(row, 2).value
        category = ws.cell(row, 3).value
        rating = ws.cell(row, 4).value
        
        if not name or not category or not rating:
            continue
            
        # Only process category ratings (not episodes)
        if str(typ).strip() != "Kategorie":
            continue
            
        # Clean category name (remove weird prefixes)
        cat_str = str(category).strip()
        if cat_str.startswith("_x000D_"):
            cat_str = cat_str.replace("_x000D_", "").strip()
        if cat_str.startswith("\n"):
            cat_str = cat_str[1:].strip()
            
        name_str = str(name).strip()
        
        if name_str not in ratings:
            ratings[name_str] = {}
        
        try:
            ratings[name_str][cat_str] = float(rating) if isinstance(rating, (int, float)) else float(str(rating).replace(",", "."))
        except:
            pass
    
    # Convert to list format
    data = []
    for anime_name, categories in ratings.items():
        if categories:  # Only include anime with ratings
            data.append({
                "name": anime_name,
                "categories": categories
            })
    
    return data

def export_episode_ratings(wb):
    """Export episode ratings for each anime from MAL Cache sheet"""
    ws = wb["MAL Cache + Interactive Rating"]
    
    # Data structure: anime_name -> [{episode: "EP 1", rating: 7.5}, ...]
    ratings = {}
    
    for row in range(2, ws.max_row + 1):
        name = ws.cell(row, 1).value
        typ = ws.cell(row, 2).value
        episode = ws.cell(row, 3).value
        rating = ws.cell(row, 4).value
        
        if not name or not episode:
            continue
            
        # Only process episode ratings
        if str(typ).strip() != "Epizoda":
            continue
            
        name_str = str(name).strip()
        ep_str = str(episode).strip()
        
        if name_str not in ratings:
            ratings[name_str] = []
        
        try:
            rating_val = float(rating) if isinstance(rating, (int, float)) else float(str(rating).replace(",", "."))
            ratings[name_str].append({
                "episode": ep_str,
                "rating": rating_val
            })
        except:
            pass
    
    # Convert to list format and sort episodes
    data = []
    for anime_name, episodes in ratings.items():
        if episodes:
            # Sort by episode number
            sorted_eps = sorted(episodes, key=lambda x: int(x["episode"].replace("EP ", "").strip()) if x["episode"].replace("EP ", "").strip().isdigit() else 0)
            data.append({
                "name": anime_name,
                "episodes": sorted_eps
            })
    
    return data

def export_notes(wb):
    """Export narrative reviews/notes for each anime from MAL Cache sheet"""
    ws = wb["MAL Cache + Interactive Rating"]
    
    # Data structure: list of {name, note}
    data = []
    
    for row in range(2, ws.max_row + 1):
        name = ws.cell(row, 1).value
        typ = ws.cell(row, 2).value
        note = ws.cell(row, 3).value
        
        if not name or not note:
            continue
            
        # Only process notes/reviews
        if str(typ).strip() != "Poznámka":
            continue
            
        name_str = str(name).strip()
        note_str = str(note).strip()
        
        if note_str:
            data.append({
                "name": name_str,
                "note": note_str
            })
    
    return data

def export_plan_to_watch(wb):
    """Export Plan to Watch list"""
    ws = wb["ANIME PLAN TO WATCH + FUTURES"]
    data = []
    
    # Dynamically detect last row (like VBA: ws.Cells(ws.Rows.Count, "G").End(xlUp).Row)
    last_row = ws.max_row
    
    # Plan to Watch table starts at column G, row 3
    for row in range(3, last_row + 1):
        name = ws.cell(row, 7).value  # Column G - Název
        if not name:
            continue
        
        # Filter: must have "Pořadí" in column F to distinguish from category headers (like VBA)
        poradi = ws.cell(row, 6).value  # Column F
        if poradi is None or (isinstance(poradi, str) and poradi.strip() == ""):
            continue
            
        # Read total time from column K (in minutes, like VBA COL_CAS_TOTAL)
        total_time_val = ws.cell(row, 11).value  # Column K
        total_time = None
        if total_time_val is not None and not isinstance(total_time_val, str):
            try:
                total_time = float(total_time_val)
            except (ValueError, TypeError):
                pass
        
        entry = {
            "name": serialize_value(name),
            "type": serialize_value(ws.cell(row, 8).value),   # Column H - Typ
            "episodes": serialize_value(ws.cell(row, 9).value),  # Column I - Počet epizod
            "total_time": total_time,                            # Column K - Celkový čas (minuty)
            "source": serialize_value(ws.cell(row, 12).value),   # Column L - Důvod/Zdroj
            "notes": serialize_value(ws.cell(row, 13).value)     # Column M - Status (Vydáno/AIRING!)
        }
        data.append(entry)
    
    return data

def get_file_hash(filepath):
    """Return MD5 hash of a file to detect changes."""
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            buf = f.read(65536)
            while len(buf) > 0:
                hasher.update(buf)
                buf = f.read(65536)
        return hasher.hexdigest()
    except:
        return None

def export_top_favorites(wb_path, output_dir):
    """
    Export Top 10 and HM Anime/Characters data using win32com for AlternativeText
    and zipfile for extracting the raw embedded images perfectly.
    """
    images_dir = os.path.join(output_dir, "..", "images", "top_favorites")
    os.makedirs(images_dir, exist_ok=True)
    json_path = os.path.join(output_dir, "top_favorites.json")
    hash_path = os.path.join(output_dir, "top_favorites_hash.txt")
    
    # Check if we need to update
    current_hash = get_file_hash(wb_path)
    old_hash = None
    if os.path.exists(hash_path):
        try:
            with open(hash_path, 'r') as f:
                old_hash = f.read().strip()
        except:
            pass
            
    # If the file hasn't changed and the json exists, skip extraction
    if current_hash == old_hash and os.path.exists(json_path) and os.listdir(images_dir):
        print("  Excel file hasn't changed. Skipping heavy Top Favorites extraction.")
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            print("  Failed to load cached JSON, re-extracting...")
            pass

    print("  Connecting to Excel via COM to read shape Alternative Text...")
    
    shapes_data = {}
    
    # We must use win32com to read AlternativeText reliably
    excel_was_open = False
    try:
        # Get active instance if it exists, otherwise create new
        try:
            xl = win32com.client.GetActiveObject("Excel.Application")
            excel_was_open = True
        except:
            xl = win32com.client.Dispatch('Excel.Application')
            
        # Check if the workbook is already open
        wb_com = None
        for w in xl.Workbooks:
            if w.FullName.lower() == wb_path.lower():
                wb_com = w
                excel_was_open = True
                break
                
        if not wb_com:
            wb_com = xl.Workbooks.Open(wb_path, ReadOnly=True)
            
        ws_com = wb_com.Sheets('OBECNÉ INFORMACE')
        
        def get_all_shapes(shapes_collection):
            found_shapes = []
            for shape in shapes_collection:
                try:
                    name = str(shape.Name)
                    if name.startswith('Top10_') or name.startswith('HM_'):
                        found_shapes.append(shape)
                    if shape.Type == 6:  # msoGroup
                        found_shapes.extend(get_all_shapes(shape.GroupItems))
                except:
                    pass
            return found_shapes

        all_target_shapes = get_all_shapes(ws_com.Shapes)
        
        for shape in all_target_shapes:
            name = str(shape.Name)
            # We already filtered by startsWith in get_all_shapes, but just in case
            if name.startswith('Top10_') or name.startswith('HM_'):
                # Exclude HM Characters as requested by user
                if name.startswith('HM_Char_'):
                    continue
                    
                alt_text = shape.AlternativeText
                if alt_text:
                    parsed_data = {}
                    import re
                    if "CHAR_ID:" in alt_text or "ANIME_NAME:" in alt_text:
                        char_match = re.search(r'CHAR_ID:(\d+)', alt_text)
                        if char_match:
                            parsed_data["CHAR_ID"] = char_match.group(1)
                            
                        # Handle ANIME_NAME extraction up to the next semicolon that is followed by a known tag
                        # or until the end of the string.
                        anime_match = re.search(r'ANIME_NAME:(.+?)(?=;[A-Z_]+:|$)', alt_text)
                        if anime_match:
                            parsed_data["ANIME_NAME"] = anime_match.group(1).strip()
                            
                        # Handle NAME extraction
                        name_match = re.search(r'NAME:(.+?)(?=;[A-Z_]+:|$)', alt_text)
                        if name_match:
                            parsed_data["NAME"] = name_match.group(1).strip()
                    else:
                        parsed_data["NAME"] = alt_text.strip()
                        
                    shapes_data[name] = {
                        "shape_name": name,
                        "data": parsed_data,
                        "image_file": None  # Will be mapped below
                    }
                    
        # Only close if we opened it
        if not excel_was_open:
            wb_com.Close(SaveChanges=False)
            xl.Quit()
            
        print(f"  Found {len(shapes_data)} valid shapes via COM.")
    except Exception as e:
        print(f"  Error reading shapes via COM: {e}")
        try:
            if not excel_was_open:
                xl.Quit()
        except:
            pass
        return {"top10_anime": [], "hm_anime": [], "top10_chars": []}
        
    print("  Extracting exact original images via Zip/XML parsing...")
    # Copy file to temp just to be safe while unzipping
    temp_fd, temp_path = tempfile.mkstemp(suffix=".xlsm")
    os.close(temp_fd)
    
    try:
        shutil.copy2(wb_path, temp_path)
        
        with zipfile.ZipFile(temp_path, 'r') as zf:
            # 1. xl/workbook.xml -> find sheet name
            xml_content = zf.read('xl/workbook.xml')
            match = re.search(rb'<sheet[^>]+name="OBEC[^"]+"[^>]+r:id="([^"]+)"', xml_content)
            if not match:
                print("  Could not find OBECNE INFORMACE sheet in XML.")
                raise Exception("Sheet not found")
            sheet_rid = match.group(1).decode('utf-8')
            
            # 2. xl/_rels/workbook.xml.rels
            xml_content = zf.read('xl/_rels/workbook.xml.rels')
            match = re.search(rb'<Relationship[^>]+Id="' + sheet_rid.encode() + rb'"[^>]+Target="([^"]+)"', xml_content)
            sheet_target = match.group(1).decode('utf-8')
            sheet_path = 'xl/' + sheet_target
            
            # 3. xl/worksheets/sheetX.xml -> drawing rId
            xml_content = zf.read(sheet_path)
            match = re.search(rb'<drawing r:id="([^"]+)"', xml_content)
            if not match:
                raise Exception("No drawing found in sheet")
            drawing_rid = match.group(1).decode('utf-8')
            
            # 4. xl/worksheets/_rels/sheetX.xml.rels
            rels_path = sheet_path.replace('worksheets/', 'worksheets/_rels/') + '.rels'
            xml_content = zf.read(rels_path)
            match = re.search(rb'<Relationship[^>]+Id="' + drawing_rid.encode() + rb'"[^>]+Target="([^"]+)"', xml_content)
            drawing_target = match.group(1).decode('utf-8').replace('../', '')
            drawing_path = 'xl/' + drawing_target
            
            # 5. xl/drawings/drawingX.xml -> parse shapes and find blip embeds
            xml_content = zf.read(drawing_path).decode('utf-8')
            blocks = re.split(r'</xdr:sp>|</xdr:pic>', xml_content)
            
            shape_rids = {}
            for block in blocks:
                name_match = re.search(r'<xdr:cNvPr[^>]+name="([^"]+)"', block)
                if name_match:
                    name = name_match.group(1)
                    if name in shapes_data:
                        blip_match = re.search(r'<a:blip[^>]+r:embed="([^"]+)"', block)
                        if blip_match:
                            shape_rids[name] = blip_match.group(1)
            
            # 6. xl/drawings/_rels/drawingX.xml.rels
            drw_rels_path = drawing_path.replace('drawings/', 'drawings/_rels/') + '.rels'
            xml_content = zf.read(drw_rels_path).decode('utf-8')
            
            rid_map = {}
            rels = re.finditer(r'<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"', xml_content)
            for rel in rels:
                rid_map[rel.group(1)] = rel.group(2).replace('../', '')
            
            # Extract and copy the actual images
            for name, embed_rid in shape_rids.items():
                if embed_rid in rid_map:
                    image_zip_path = 'xl/' + rid_map[embed_rid]
                    ext = image_zip_path.split('.')[-1]
                    output_file_name = f"{name}.{ext}"
                    output_file_path = os.path.join(images_dir, output_file_name)
                    
                    try:
                        with zf.open(image_zip_path) as img_file:
                            with open(output_file_path, 'wb') as out_file:
                                out_file.write(img_file.read())
                        shapes_data[name]["image_file"] = f"images/top_favorites/{output_file_name}"
                    except Exception as e:
                        print(f"  Warning: failed to extract {image_zip_path}: {e}")

    except Exception as e:
        print(f"  Error extracting images via Zip: {e}")
    finally:
        os.remove(temp_path)
        
    # Categorize into lists and sort them by rank
    # Rank is the number at the end, e.g. "Top10_Char_5" -> 5
    def get_rank(name):
        try:
            return int(name.split('_')[-1])
        except:
            return 999
            
    top10_anime = []
    hm_anime = []
    top10_chars = []
    
    for name, sdata in shapes_data.items():
        if name.startswith('Top10_Anime_') or name.startswith('Top10_CharAnime_'):
            top10_anime.append(sdata)
        elif name.startswith('HM_Anime_'):
            hm_anime.append(sdata)
        elif name.startswith('Top10_Char_'):
            top10_chars.append(sdata)
            
    top10_anime.sort(key=lambda x: get_rank(x["shape_name"]))
    hm_anime.sort(key=lambda x: get_rank(x["shape_name"]))
    top10_chars.sort(key=lambda x: get_rank(x["shape_name"]))

    print("  Loading anime_list.json for accurate MAL ID lookups...")
    anime_list_data = []
    try:
        anime_list_path = os.path.join(output_dir, "anime_list.json")
        with open(anime_list_path, 'r', encoding='utf-8') as f:
            anime_list_data = json.load(f)
    except Exception as e:
        print(f"  Warning: Could not load anime_list.json for ID matching: {e}")
        pass
        
    def get_mal_id(anime_name):
        # find in anime_list_data
        search = anime_name.lower().strip().replace('  ', ' ')
        for a in anime_list_data:
            a_name = (a.get('name') or '').lower().strip().replace('  ', ' ')
            a_series = (a.get('series') or '').lower().strip().replace('  ', ' ')
            
            # Match name exactly OR match series exactly
            if a_name == search or a_series == search:
                url = a.get('mal_url', '')
                if url:
                    import re
                    match = re.search(r'/anime/(\d+)', url)
                    if match:
                        return match.group(1)
                        
        # Secondary fallback matches: starts with
        for a in anime_list_data:
            a_name = (a.get('name') or '').lower().strip()
            if a_name.startswith(search):
                url = a.get('mal_url', '')
                if url:
                    import re
                    match = re.search(r'/anime/(\d+)', url)
                    if match:
                        return match.group(1)
        return None

    print("  Fetching Top 10 Anime imagery from Jikan API by MAL ID (Skipping HM Anime)...")
    import requests
    import time
    
    for sdata in top10_anime:
        anime_name = sdata["data"].get("NAME") or sdata["data"].get("ANIME_NAME")
        if anime_name:
            safe_name = "".join([c for c in anime_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
            if not safe_name:
                safe_name = "unknown"
                
            output_file_name = f"Jikan_{safe_name}.jpg"
            output_file_path = os.path.join(images_dir, output_file_name)
            
            sdata["image_file"] = f"images/top_favorites/{output_file_name}"
            
            if not os.path.exists(output_file_path):
                print(f"    Fetching Jikan API for: {anime_name}")
                mal_id = get_mal_id(anime_name)
                
                try:
                    if mal_id:
                        print(f"      Matched MAL ID: {mal_id} (from anime_list.json)")
                        url = f"https://api.jikan.moe/v4/anime/{mal_id}"
                    else:
                        print(f"      No direct MAL ID match for '{anime_name}'. Falling back to search...")
                        # Priority search for exact title without members sort if it might lead to irrelevant popular shows
                        url = f"https://api.jikan.moe/v4/anime?q={anime_name}&limit=1"
                        
                    resp = requests.get(url)
                    resp.raise_for_status()
                    data = resp.json()
                    
                    img_url = None
                    if mal_id and data.get("data"):
                        img_url = data["data"]["images"]["jpg"]["large_image_url"]
                    elif data.get("data") and len(data["data"]) > 0:
                        img_url = data["data"][0]["images"]["jpg"]["large_image_url"]
                        
                    if img_url:
                        img_resp = requests.get(img_url)
                        img_resp.raise_for_status()
                        
                        with open(output_file_path, 'wb') as f:
                            f.write(img_resp.content)
                        time.sleep(1) # Rate limit exactly as requested
                    else:
                        print(f"      No results found in Jikan for {anime_name}.")
                except Exception as e:
                    print(f"      Fetch failed for {anime_name} at {url}: {e}")

    print("  Fetching missing Character Names from Jikan API by CHAR_ID...")
    for sdata in top10_chars:
        char_id = sdata["data"].get("CHAR_ID")
        # Always fetch NAME using CHAR_ID because visual shape text is often just the anime name!
        if char_id:
            print(f"    Fetching Jikan Character API for ID: {char_id}")
            try:
                url = f"https://api.jikan.moe/v4/characters/{char_id}"
                resp = requests.get(url)
                resp.raise_for_status()
                data = resp.json()
                
                if data.get("data") and data["data"].get("name"):
                    sdata["data"]["ANIME_NAME"] = sdata["data"].get("NAME", "")
                    sdata["data"]["NAME"] = data["data"]["name"]
                    time.sleep(1)
            except Exception as e:
                 print(f"      Character Fetch failed for {char_id}: {e}")
                 sdata["data"]["NAME"] = "Unknown Character"

    result = {
        "top10_anime": top10_anime,
        "hm_anime": hm_anime,
        "top10_chars": top10_chars
    }
    
    # Save hash to indicate this version has been extracted
    if current_hash:
        try:
            with open(hash_path, 'w') as f:
                f.write(current_hash)
        except:
            pass

    return result

def main():
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = r"C:\Users\macou\OneDrive - ŠKODA AUTO VYSOKÁ ŠKOLA o.p.s\Osobní PC\Excel Projekt - nemazat\Anime_List\Anime list.xlsm"
        
    if len(sys.argv) > 2:
        output_dir = sys.argv[2]
    else:
        # Skript žije v anime-list-web/tools/ → data jsou o úroveň výš (anime-list-web/public/data)
        output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data")
    
    print(f"Loading Excel file: {file_path}")
    
    # Excel locks the active file (PermissionError). We must copy it to a temp file to read it.
    temp_fd, temp_path = tempfile.mkstemp(suffix=".xlsm")
    os.close(temp_fd) # Close the file descriptor so we can overwrite it
    
    try:
        shutil.copy2(file_path, temp_path)
        # We don't use read_only=True anymore because it strips hyperlinks resulting in AttributeError
        # But we're safe because we copy the file first
        wb = openpyxl.load_workbook(temp_path, data_only=True)
        
        os.makedirs(output_dir, exist_ok=True)
        
        # Export each dataset
        print("Exporting Anime List (with comments)...")
        # Load workbook again without data_only to get comments.
        print("  Loading formula workbook for comments...")
        wb_comments = openpyxl.load_workbook(temp_path, data_only=False)
        anime_list = export_anime_list(wb, wb_comments)
        with open(os.path.join(output_dir, "anime_list.json"), "w", encoding="utf-8") as f:
            json.dump(anime_list, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(anime_list)} anime entries")
        
        print("Exporting History Log...")
        # Load workbook again without data_only to get comments for history rewatches
        history = export_history_log(wb, wb_comments)
        with open(os.path.join(output_dir, "history_log.json"), "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(history)} history entries")
        
        print("Exporting General Stats (with comments)...")
        stats = export_general_stats(wb, wb_comments)
        wb_comments.close() # Now safe to close after both anime_list and stats are done
        with open(os.path.join(output_dir, "stats.json"), "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        
        print("Exporting Favorites...")
        favorites = export_favorites(wb)
        with open(os.path.join(output_dir, "favorites.json"), "w", encoding="utf-8") as f:
            json.dump(favorites, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(favorites)} favorite entries")
        
        print("Exporting Favorite OST Tables...")
        favorites_ost = export_ost_tables(wb, wb_comments)
        with open(os.path.join(output_dir, "favorites_ost.json"), "w", encoding="utf-8") as f:
            json.dump(favorites_ost, f, ensure_ascii=False, indent=2)
        print(f"  Exported OST Scenes: {len(favorites_ost['scenes'])}, Pieces: {len(favorites_ost['pieces'])}, Whole: {len(favorites_ost['whole'])}")
        
        print("Exporting Plan to Watch...")
        ptw = export_plan_to_watch(wb)
        with open(os.path.join(output_dir, "plan_to_watch.json"), "w", encoding="utf-8") as f:
            json.dump(ptw, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(ptw)} plan to watch entries")
        
        print("Exporting Category Ratings...")
        cat_ratings = export_category_ratings(wb)
        with open(os.path.join(output_dir, "category_ratings.json"), "w", encoding="utf-8") as f:
            json.dump(cat_ratings, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(cat_ratings)} anime with category ratings")
        
        print("Exporting Episode Ratings...")
        ep_ratings = export_episode_ratings(wb)
        with open(os.path.join(output_dir, "episode_ratings.json"), "w", encoding="utf-8") as f:
            json.dump(ep_ratings, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(ep_ratings)} anime with episode ratings")
        
        print("Exporting Notes/Reviews...")
        notes = export_notes(wb)
        with open(os.path.join(output_dir, "notes.json"), "w", encoding="utf-8") as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        print(f"  Exported {len(notes)} anime with notes/reviews")
        
        print("Exporting Top Favorites & Characters...")
        top_favorites = export_top_favorites(file_path, output_dir) # Use original file_path for COM, wb is internal memory
        json_tf_path = os.path.join(output_dir, "top_favorites.json")
        has_items = any(len(top_favorites.get(k, [])) > 0 for k in ["top10_anime", "hm_anime", "top10_chars"])
        if has_items or not os.path.exists(json_tf_path):
            with open(json_tf_path, "w", encoding="utf-8") as f:
                json.dump(top_favorites, f, ensure_ascii=False, indent=2)
            print(f"  Exported Top 10 Anime: {len(top_favorites['top10_anime'])}, HM Anime: {len(top_favorites['hm_anime'])}, Top 10 Chars: {len(top_favorites['top10_chars'])}")
        else:
            print("  Warning: Top Favorites extraction returned 0 items, preserving existing top_favorites.json cache.")
    
        # Export metadata for version checking
        print("Exporting Metadata...")
        import time
        metadata = {
            "lastUpdated": int(time.time() * 1000)
        }
        with open(os.path.join(output_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        print("\nDone! Data exported to:", output_dir)
        
        script_root = os.path.dirname(os.path.abspath(__file__))

        # 1. Map thumbnails from folder
        print("Running map_from_folder.py to restore thumbnail paths...")
        try:
            script_path = os.path.join(script_root, "map_from_folder.py")
            subprocess.run([sys.executable, script_path], check=True, cwd=script_root)
            print("Thumbnails mapped successfully!")
        except Exception as e:
            print(f"Failed to run map_from_folder.py: {e}")

        # 2. Copy Spotify images
        print("Running extract_spotify_images.py to copy Spotify images...")
        try:
            spotify_script = os.path.join(script_root, "extract_spotify_images.py")
            subprocess.run([sys.executable, spotify_script], check=True, cwd=script_root)
            print("Spotify images copied successfully!")
        except Exception as e:
            print(f"Failed to run extract_spotify_images.py: {e}")

        # 3. Download Jikan cache
        print("Running download_jikan_cache.py to update Jikan episode descriptions...")
        try:
            jikan_script = os.path.join(script_root, "download_jikan_cache.py")
            subprocess.run([sys.executable, jikan_script], check=True, cwd=script_root)
            print("Jikan cache updated successfully!")
        except Exception as e:
            print(f"Failed to run download_jikan_cache.py: {e}")

        # 4. Export DOCX categories
        print("Running export_docx_categories.py to update DOCX category reviews...")
        try:
            docx_script = os.path.join(script_root, "export_docx_categories.py")
            subprocess.run([sys.executable, docx_script], check=True, cwd=script_root)
            print("DOCX category reviews updated successfully!")
        except Exception as e:
            print(f"Failed to run export_docx_categories.py: {e}")

        # 5. Build YT Music OST albums
        print("Running build_ytmusic_ost.py to update full OST albums from YT Music...")
        try:
            ytmusic_script = os.path.join(script_root, "build_ytmusic_ost.py")
            subprocess.run([sys.executable, ytmusic_script], check=True, cwd=script_root)
            print("YT Music OST albums updated successfully!")
        except Exception as e:
            print(f"Failed to run build_ytmusic_ost.py: {e}")

        # 6. Download AnimeThemes cache
        print("Running download_animethemes_cache.py to update AnimeThemes OP/ED catalogue...")
        try:
            animethemes_script = os.path.join(script_root, "download_animethemes_cache.py")
            subprocess.run([sys.executable, animethemes_script], check=True, cwd=script_root)
            print("AnimeThemes OP/ED catalogue updated successfully!")
        except Exception as e:
            print(f"Failed to run download_animethemes_cache.py: {e}")

        # 7. Push to GitHub
        print("Pushing data to GitHub...")
        try:
            web_dir = os.path.abspath(os.path.join(output_dir, "..", ".."))
            subprocess.run(["git", "add", "public/data/*", "public/images/*"], cwd=web_dir, check=True)
            subprocess.run(["git", "commit", "-m", "Auto-update dat z Excelu (Background)"], cwd=web_dir, check=True)
            subprocess.run(["git", "push", "origin", "main"], cwd=web_dir, check=True)
            print("Git push completed successfully!")
        except Exception as e:
            try:
                subprocess.run(["git", "add", "-A"], cwd=web_dir, check=True)
                subprocess.run(["git", "commit", "-m", "Auto-update dat z Excelu (Background Fallback)"], cwd=web_dir, check=True)
                subprocess.run(["git", "push", "origin", "main"], cwd=web_dir, check=True)
                print("Git fallback push completed successfully!")
            except Exception as ge:
                print(f"Failed to push to GitHub: {ge}")

    finally:
        # Cleanup the temp file
        if 'wb' in locals():
            wb.close()
        try:
            os.remove(temp_path)
        except Exception as e:
            print(f"Warning: Could not remove temp file {temp_path}: {e}")

if __name__ == "__main__":
    main()

