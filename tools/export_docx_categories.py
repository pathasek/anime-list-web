import os
import re
import json
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.oxml.ns import qn

# Folder path - read-only source
SRC_DIR = r"C:\AL\Anime hodnocení a rozbory\Faktické rozbory (Gemini AI)\Vytvořené faktické rozbory"
# Target output — skript žije v anime-list-web/tools/ → app root je o úroveň výš
APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FILE = os.path.join(APP_ROOT, "public", "data", "category_texts.json")

HEADING_MAP = {
    # Animace
    'animace': 'Animace',
    'animace a vizuální jazyk': 'Animace',
    'animace a vizualni jazyk': 'Animace',
    'animace a vizuální stránka': 'Animace',
    'animace a vizualni stranka': 'Animace',
    'animace a 2d vizuální zpracování': 'Animace',
    'animace a 2d vizualni zpracovani': 'Animace',
    # CGI
    'cgi': 'CGI',
    '3d': 'CGI',
    'počítačem generovaná grafika': 'CGI',
    'pocitacem generovana grafika': 'CGI',
    'cgi a integrace 3d prvků': 'CGI',
    'cgi a integrace 3d prvku': 'CGI',
    'integrace 3d cgi': 'CGI',
    'integrace cgi': 'CGI',
    '3d cgi': 'CGI',
    'cgi (computer-generated imagery) a technické efekty': 'CGI',
    'cgi (computer-generated imagery) a technicke efekty': 'CGI',
    # MC
    'hlavní postava': 'MC',
    'hlavni postava': 'MC',
    'mc': 'MC',
    'hlavní postavy': 'MC',
    'hlavni postavy': 'MC',
    'profil hlavního hrdiny': 'MC',
    'profil hlavniho hrdiny': 'MC',
    'hlavní postava (mc)': 'MC',
    'hlavni postava (mc)': 'MC',
    'hlavní hrdina': 'MC',
    'hlavni hrdina': 'MC',
    # Vedlejší postavy
    'vedlejší postavy': 'Vedlejší postavy',
    'vedlejsi postavy': 'Vedlejší postavy',
    'vedlejší': 'Vedlejší postavy',
    'vedlejsi': 'Vedlejší postavy',
    'analýza vedlejších postav': 'Vedlejší postavy',
    'analyza vedlejsich postav': 'Vedlejší postavy',
    'analýza vedlejších postav a archetypů': 'Vedlejší postavy',
    'analyza vedlejsich postav a archetypu': 'Vedlejší postavy',
    'vedlejší postavy a dynamika vysokoškolského bratrstva': 'Vedlejší postavy',
    'vedlejsi postavy a dynamika vysokoskolskeho bratstva': 'Vedlejší postavy',
    # Waifu
    'waifu': 'Waifu',
    'výrazné ženské postavy': 'Waifu',
    'vyrazne zenske postavy': 'Waifu',
    'ženské postavy': 'Waifu',
    'zenske postavy': 'Waifu',
    'fenomén "waifu" a estetika postav': 'Waifu',
    'fenomen "waifu" a estetika postav': 'Waifu',
    'waifu / výrazné ženské postavy': 'Waifu',
    'waifu / vyrazne zenske postavy': 'Waifu',
    # Plot
    'plot': 'Plot',
    'struktura příběhu': 'Plot',
    'struktura pribehu': 'Plot',
    'dějová linka': 'Plot',
    'dejova linka': 'Plot',
    'děj': 'Plot',
    'dej': 'Plot',
    'struktura děje': 'Plot',
    'struktura deje': 'Plot',
    'příběh': 'Plot',
    'pribeh': 'Plot',
    'zápletka': 'Plot',
    'zapletka': 'Plot',
    'plot a story conclusion': 'Plot',
    'děj a závěr příběhu': 'Plot',
    'dej a zaver pribehu': 'Plot',
    # Pacing
    'pacing': 'Pacing',
    'tempo vyprávění': 'Pacing',
    'tempo vypraveni': 'Pacing',
    'tempo': 'Pacing',
    'rytmus vyprávění': 'Pacing',
    'rytmus vypraveni': 'Pacing',
    'pacing (narativní rytmus a struktura)': 'Pacing',
    'pacing (narativni rytmus a struktura)': 'Pacing',
    # Conclusion
    'story conclusion': 'Story Conclusion',
    'conclusion': 'Story Conclusion',
    'závěr příběhu': 'Story Conclusion',
    'zaver pribehu': 'Story Conclusion',
    'závěr': 'Story Conclusion',
    'zaver': 'Story Conclusion',
    'závěr příběhu a implikace': 'Story Conclusion',
    'zaver pribehu a implikace': 'Story Conclusion',
    'story conclusion (závěr první sezóny)': 'Story Conclusion',
    'story conclusion (zaver prni sezony)': 'Story Conclusion',
    # Originalita
    'originalita': 'Originalita',
    'originalita a dekonstrukce': 'Originalita',
    'adaptace': 'Originalita',
    'originalita a kánon': 'Originalita',
    'originalita a kanon': 'Originalita',
    'originalita a subverze žánru': 'Originalita',
    'originalita a subverze zanru': 'Originalita',
    'originalita a práce s žánrovými tropy': 'Originalita',
    'originalita a prace s zanrovymi tropy': 'Originalita',
    # Emoce
    'emoce': 'Emoce',
    'emoce a atmosféra': 'Emoce',
    'emoce a atmosfera': 'Emoce',
    'emoční spektrum a atmosféra': 'Emoce',
    'emocni spektrum a atmosfera': 'Emoce',
    'emoce a enjoyment': 'Emoce',
    'evokace specifických emocí': 'Emoce',
    'evokace specifickych emoci': 'Emoce',
    # Enjoyment
    'enjoyment': 'Enjoyment',
    'faktory divácké zábavnosti': 'Enjoyment',
    'faktory divacke zabavnosti': 'Enjoyment',
    'faktory zábavnosti': 'Enjoyment',
    'faktory zabavnosti': 'Enjoyment',
    'přijetí a recepce': 'Enjoyment',
    'prijeti a recepce': 'Enjoyment',
    'přijetí': 'Enjoyment',
    'prijeti': 'Enjoyment',
    'recepce': 'Enjoyment',
    'divácký prožitek': 'Enjoyment',
    'divacky prozitek': 'Enjoyment',
    'faktor zapojení diváka': 'Enjoyment',
    'faktor zapojeni divaka': 'Enjoyment',
    'celkový zážitek': 'Enjoyment',
    'celkovy zazitek': 'Enjoyment',
    # OST
    'ost': 'OST',
    'soundtrack': 'OST',
    'soundtrack / ost': 'OST',
    'hudební doprovod a zvukový design': 'OST',
    'hudebni doprovod a zvukovy design': 'OST',
    'analýza soundtracku': 'OST',
    'analyza soundtracku': 'OST',
    'ost (original soundtrack) a hudební design': 'OST',
    'ost (original soundtrack) a hudebni design': 'OST',
}

def clean_file_name(name: str) -> str:
    s = name
    s = s.replace(":", "_").replace("/", " ").replace("\\", "")
    for char in ['*', '?', '"', '<', '>', '|']:
        s = s.replace(char, "")
    return s.strip()

def map_heading_to_category(text: str) -> str:
    clean = text.lower().strip()
    clean = re.sub(r'^[\d\.\s\-:]+', '', clean).strip()
    clean = re.sub(r'^[-\*•\s]+', '', clean).strip()
    clean = clean.rstrip('.:')
    
    first_part = clean.split(':')[0].strip()
    first_part_no_paren = re.sub(r'\(.*?\)', '', first_part).strip()
    
    sub_parts = re.split(r'[:/()\-]| a | and ', clean)
    sub_parts = [sp.strip() for sp in sub_parts if sp.strip()]
    
    for sp in sub_parts:
        if sp in HEADING_MAP:
            return HEADING_MAP[sp]
    return None

def is_likely_animation(text: str) -> bool:
    cat = map_heading_to_category(text)
    return cat == "Animace"

def is_bold_heading(paragraph) -> bool:
    runs = [r for r in paragraph.runs if r.text.strip()]
    if not runs:
        return False
    if not all(r.bold for r in runs):
        return False
    text = paragraph.text.strip()
    if len(text) > 200 or not text:
        return False
    if text.startswith(('-', '*', '•')):
        return False
        
    num_match = re.match(r'^(\d+)', text)
    if num_match:
        num = int(num_match.group(1))
        if not (1 <= num <= 25):
            return False
            
    return map_heading_to_category(text) is not None

def iter_block_items(parent):
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if child.tag == qn('w:p'):
            yield Paragraph(child, parent)
        elif child.tag == qn('w:tbl'):
            yield Table(child, parent)

def _resolve_list_format(paragraph, doc):
    try:
        p_elem = paragraph._element
        num_pr = p_elem.xpath('./w:pPr/w:numPr')
        
        if not num_pr and paragraph.style and paragraph.style.element is not None:
            num_pr = paragraph.style.element.xpath('./w:pPr/w:numPr')
            
        if not num_pr:
            return None, None, None
            
        num_id_val = num_pr[0].xpath('./w:numId/@w:val')
        if not num_id_val:
            return None, None, None
            
        num_id = int(num_id_val[0])
        ilvl_val = num_pr[0].xpath('./w:ilvl/@w:val')
        ilvl = int(ilvl_val[0]) if ilvl_val else 0
        
        numbering_part = doc.part.numbering_part
        if not numbering_part:
            return None, None, None
            
        num_element = numbering_part._element.xpath(f'./w:num[@w:numId="{num_id}"]/w:abstractNumId/@w:val')
        if not num_element:
            return None, None, None
            
        abs_num_id = num_element[0]
        num_fmt = numbering_part._element.xpath(f'./w:abstractNum[@w:abstractNumId="{abs_num_id}"]/w:lvl[@w:ilvl="{ilvl}"]/w:numFmt/@w:val')
        
        if not num_fmt:
            return None, None, None
            
        fmt = num_fmt[0]
        if fmt in ('decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman'):
            return 'decimal', num_id, ilvl
        elif fmt == 'bullet':
            return 'bullet', num_id, ilvl
            
        return None, None, None
    except Exception:
        return None, None, None

def extract_markdown_text(paragraph) -> str:
    merged_runs = []
    for run in paragraph.runs:
        t = run.text
        if not t:
            continue
        
        fmt = (bool(run.bold), bool(run.italic))
        
        if merged_runs and merged_runs[-1]['fmt'] == fmt:
            merged_runs[-1]['text'] += t
        else:
            merged_runs.append({'text': t, 'fmt': fmt})
            
    md_text = ""
    for mr in merged_runs:
        t = mr['text']
        bold, italic = mr['fmt']
        
        core_text = t.strip()
        if not core_text:
            md_text += t
            continue
            
        lspace = len(t) - len(t.lstrip())
        rspace = len(t) - len(t.rstrip())
        prefix = t[:lspace]
        suffix = t[len(t)-rspace:] if rspace else ""
        
        if bold and italic:
            core_text = f"***{core_text}***"
        elif bold:
            core_text = f"**{core_text}**"
        elif italic:
            core_text = f"*{core_text}*"
            
        md_text += prefix + core_text + suffix
        
    return md_text

def parse_docx_categories(docx_path: str) -> dict[str, any]:
    doc = Document(docx_path)
    categories = {}
    episodes = {}
    
    current_cat = None
    current_ep_num = None
    current_ep_title = None
    current_paragraphs = []
    
    list_counters = {}
    list_base_ilvl = {}

    has_started = False

    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if text:
                list_type, num_id, ilvl = _resolve_list_format(block, doc)
                
                is_cat_heading = False
                if list_type is None and is_bold_heading(block):
                    is_cat_heading = True
                
                is_ep_heading = False
                matched_ep_num = None
                if list_type is None and not is_cat_heading:
                    is_bold = all(r.bold for r in block.runs if r.text.strip()) if block.runs else False
                    if is_bold:
                        ep_match = re.search(r'^\s*(?:\d+\.\s+)?\b(EP|Epizoda)\s*(\d+)', text, re.IGNORECASE)
                        if ep_match:
                            is_ep_heading = True
                            matched_ep_num = ep_match.group(2)
                
                if is_cat_heading:
                    cat = map_heading_to_category(text)
                    if cat == "Animace":
                        if current_ep_num and current_paragraphs:
                            episodes[current_ep_num] = {
                                "title": current_ep_title,
                                "text": "\n".join(current_paragraphs).strip()
                            }
                            current_ep_num = None
                            current_ep_title = None
                        has_started = True
                    
                    if has_started:
                        if current_cat and current_paragraphs:
                            categories[current_cat] = "\n".join(current_paragraphs).strip()
                        current_cat = cat
                        current_paragraphs = []
                        list_counters.clear()
                        list_base_ilvl.clear()
                
                elif is_ep_heading and not has_started:
                    if current_ep_num and current_paragraphs:
                        episodes[current_ep_num] = {
                            "title": current_ep_title,
                            "text": "\n".join(current_paragraphs).strip()
                        }
                    current_ep_num = matched_ep_num
                    current_ep_title = text
                    current_paragraphs = []
                    list_counters.clear()
                    list_base_ilvl.clear()
                
                elif (has_started and current_cat is not None) or (not has_started and current_ep_num is not None):
                    md_text = extract_markdown_text(block)
                    if not md_text.strip():
                        md_text = text
                        
                    if num_id is not None:
                        if num_id not in list_base_ilvl:
                            list_base_ilvl[num_id] = ilvl
                        relative_ilvl = ilvl - list_base_ilvl[num_id]
                    else:
                        relative_ilvl = 0
                        
                    indent = "    " * max(0, relative_ilvl)
                    
                    if list_type == 'bullet':
                        md_text = f"{indent}- {md_text}"
                    elif list_type == 'decimal':
                        key = (num_id, ilvl)
                        if key not in list_counters:
                            list_counters[key] = 1
                        else:
                            list_counters[key] += 1
                        md_text = f"{indent}{list_counters[key]}. {md_text}"
                        
                    current_paragraphs.append(md_text)
                    
        elif isinstance(block, Table):
            if has_started and current_cat is not None:
                table_text = "\n[TABULKA_START]\n"
                for row in block.rows:
                    row_data = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
                    table_text += "| " + " | ".join(row_data) + " |\n"
                table_text += "[TABULKA_KONEC]\n"
                current_paragraphs.append(table_text)
            elif not has_started and current_ep_num is not None:
                table_text = "\n[TABULKA_START]\n"
                for row in block.rows:
                    row_data = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
                    table_text += "| " + " | ".join(row_data) + " |\n"
                table_text += "[TABULKA_KONEC]\n"
                current_paragraphs.append(table_text)
            
    if current_cat and current_paragraphs:
        categories[current_cat] = "\n".join(current_paragraphs).strip()
        
    if episodes:
        int_keys = sorted([int(k) for k in episodes.keys() if k.isdigit()])
        if int_keys and int_keys[0] > 1:
            for idx, orig_num in enumerate(int_keys, start=1):
                str_rel = str(idx)
                str_orig = str(orig_num)
                if str_rel not in episodes:
                    episodes[str_rel] = episodes[str_orig]
        categories["episodes"] = episodes
        
    return categories

def main():
    print("Spouštím export DOCX rozborů...")
    
    # Load all anime names from the web rating file to map them properly
    ratings_file = os.path.join(APP_ROOT, "public", "data", "category_ratings.json")
    if not os.path.exists(ratings_file):
        print(f"Chyba: Soubor {ratings_file} neexistuje! Spusťte nejdřív hlavní export.")
        return
        
    with open(ratings_file, 'r', encoding='utf-8') as f:
        anime_items = json.load(f)
        
    all_anime_names = [item['name'] for item in anime_items]
    print(f"Načteno {len(all_anime_names)} anime z webového seznamu.")
    
    result = {}
    parsed_count = 0
    
    # Check directory
    if not os.path.exists(SRC_DIR):
        print(f"Chyba: Složka s rozbory {SRC_DIR} neexistuje!")
        return

    # Cache file list
    files = os.listdir(SRC_DIR)
    docx_files = {clean_file_name(f[:-5]).lower(): f for f in files if f.endswith(".docx")}
    print(f"Nalezeno {len(docx_files)} DOCX souborů ve zdrojové složce.")
    
    for name in all_anime_names:
        clean = clean_file_name(name).lower()
        if clean in docx_files:
            file_name = docx_files[clean]
            file_path = os.path.join(SRC_DIR, file_name)
            try:
                # Read-Only access
                categories = parse_docx_categories(file_path)
                if categories:
                    result[name] = categories
                    parsed_count += 1
            except Exception as e:
                print(f"Chyba při parsování {file_name}: {e}")
                
    # Save results
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        
    print(f"Hotovo! Úspěšně napárováno a vyexportováno {parsed_count} rozborů do {OUT_FILE}.")

if __name__ == "__main__":
    main()
