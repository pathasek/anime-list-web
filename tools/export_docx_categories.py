import argparse
import hashlib
import os
import re
import json
import sys
import unicodedata
import zipfile
from docx import Document
from docx.text.paragraph import Paragraph
from docx.table import Table
from docx.oxml.ns import qn

# Folder path - read-only source
SRC_DIR = r"C:\AL\Anime hodnocení a rozbory\Faktické rozbory (Gemini AI)\Vytvořené faktické rozbory"
# Target output — skript žije v anime-list-web/tools/ → app root je o úroveň výš
APP_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_FILE = os.path.join(APP_ROOT, "public", "data", "category_texts.json")
# Cache pro inkrementální běh (leží vedle ostatních cache souborů v tools/)
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docx_export_cache.json")

# Verze parseru. Když se změní pravidla parsování, musí se všechno přeparsovat
# znovu, jinak by v JSONu zůstaly staré výsledky ze zacachovaných souborů.
# Zvyšuj při každé změně logiky parseru.
PARSER_VERSION = 3

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
    for char in ['*', '?', '"', "'", '<', '>', '|', '`']:
        s = s.replace(char, "")
    s = re.sub(r'\s+', ' ', s)
    return s.strip()

# Uvozovací slova, kterými rozbory často začínají nadpis kategorie
# („2. Analýza animace (2D)", „5. Technická analýza animace: 2D a Background Art").
# Bez odstranění se nadpis nenapáruje a kategorie tiše propadne.
_UVOD_ANALYZY = re.compile(
    r'^(?:'
    r'(?:komplexn[ií]|technick[aá]|detailn[ií]|podrobn[aá]|hloubkov[aá]|'
    r'z[aá]kladn[ií]|celkov[aá]|struktur[aá]ln[ií]|krit[ií]ck[aá])?\s*'
    r'(?:anal[yý]z\w*|rozbor\w*|dekonstrukc\w*|zhodnocen[ií]|hodnocen[ií])'
    r')\s+')


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

    # Druhý pokus: odloupnout uvozovací „analýza / rozbor / dekonstrukce".
    # Schválně jen u číslovaných sekcí („2. Analýza animace (2D)"), protože tak
    # jsou hlavní kapitoly rozborů psané. Uvnitř textu se totiž běžně objevují
    # nečíslované tučné podnadpisy typu „Analýza Adaptace:", a ty by se po
    # odloupnutí namapovaly na kategorii (adaptace → Originalita), utnuly by
    # rozepsanou kategorii a jejich text by se cestou ztratil.
    if re.match(r'^\s*\d+[.)]\s', text):
        for sp in sub_parts:
            holy = _UVOD_ANALYZY.sub('', sp).strip()
            if holy and holy != sp and holy in HEADING_MAP:
                return HEADING_MAP[holy]
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

# ── Rozbor děje („story") pro filmy / 1EP / speciály ────────────────────────
# Tyhle docx mají PŘED kategoriemi (Animace…) sekci „Shrnutí Děje" místo
# epizodních nadpisů „EP N". Zachytíme ji jako story = {title, text} → na webu
# se u kategorie Plot ukáže tlačítko „Děj". `story` a `episodes` se vzájemně
# vylučují: jakmile se objeví „EP N" nadpis, jde o epizodní docx a rozpracovaný
# story režim se zahodí.
def _norm_heading(text):
    t = re.sub(r'^[\d\.\)\s]+', '', text.strip())
    t = re.sub(r'^\s*(?:č[aá]st|cast|part)\s+[ivxlcdm\d]+\s*[:\-–]?\s*', '', t, flags=re.I)
    return ''.join(c for c in unicodedata.normalize('NFKD', t) if not unicodedata.combining(c)).lower()

_STORY_RE = re.compile(r'shrnut|narativni\s+syntez|narativni\s+a\s+scenick|podrobna\s+analyza\s+narativni|hloubkova\s+rekonstrukce\s+narativ|dejova\s+expozice|narativni\s+rekonstrukc|narativni\s+architektura|detailni\s+narativni')
# Nadpis dokumentu (ne sekce Shrnutí) — vyloučit, ať detektor nechytá titulek
_TITLE_RE = re.compile(r'analyticka\s+(?:studie|zprava)|komplexni\s+analyt|komplexni\s+dekonstrukce')
# Přechod na sekci kategorií („Deskriptivní analýza komponentů") = konec story
_COMPONENT_RE = re.compile(r'deskriptivni\s+analyz|deskriptivni\s+.*komponent|analyza\s+komponent|popisna\s+analyz')
# Číslovaná top-level sekce NE-dějové analýzy (postavy/animace/vizuál/hudba…) =
# konec „Děje" u akademických rozborů, které nemají „Deskriptivní analýzu" ani
# holé „Animace" (např. Hrob světlušek: „3. Komplexní analýza postav" ukončí děj).
_ACADEMIC_STOP = re.compile(
    r'analyza\s+postav|postav\s+a\s+psycholog|profil\w*\s+postav|analyza\s+komponent|deskriptivn|'
    r'technick[aá]\s+analyza\s+animace|animace\s+a\s+vizualn|vizualni\s+(?:styl|estetik|jazyk)|'
    r'hudebn[ií]|zvukov[aá]\s+slozk|technick[aá]\s+(?:realizace|slozka)')

def _top_secnum(text):
    m = re.match(r'^\s*(\d+)\.\s', text)
    return int(m.group(1)) if m else None

def _matches_story_heading(text):
    h = _norm_heading(text)
    if _TITLE_RE.search(h):
        return False
    return bool(_STORY_RE.search(h))

def _matches_component_heading(text):
    return bool(_COMPONENT_RE.search(_norm_heading(text)))

# Číslovaná sekce ne-dějové analýzy → ukončí „Děj"
def _is_academic_stop(text):
    return _top_secnum(text) is not None and bool(_ACADEMIC_STOP.search(_norm_heading(text)))


# Nadpis epizody. Kromě prostého „EP 3" musí zvládnout i víceúrovňové číslování
# („2.1 Epizoda 1: The Abduction…"), slovo před klíčem („1. Děj Epizody 1: …",
# „1. Analýza Epizody 1: …") a název díla před pořadím
# („1.1 Angel Beats! Special 1: …"). Do části před klíčem se schválně nepouští
# dvojtečka ani číslice, aby se nadpis typu „Shrnutí děje: Epizoda 1" nezachytil
# jako epizoda, když je to ve skutečnosti souhrn.
# Skupiny: 1 = číslování sekce, 2 = slova před klíčem, 3 = číslo epizody.
_EP_HEADING_RE = re.compile(
    r'^\s*(?:(\d+(?:\.\d+)*)\.?\s+)?'
    r'([^:\d\n]{1,40}?\s)?'
    r'\b(?:EP|Epizod[aěy]|D[ií]l|Speci[aá]l|Special)\s*'
    r'(?:č\.\s*)?(\d+)',
    re.IGNORECASE)


def parse_docx_categories(docx_path: str, start_on_any_category: bool = False) -> dict[str, any]:
    """Rozparsuje jeden DOCX rozbor.

    `start_on_any_category`: sekce kategorií normálně začíná až nadpisem
    „Animace". Některé rozbory ale mají první kategorii pojmenovanou jinak
    (např. „2. Analýza animace (2D)" u Tower of God) a pak propadl celý
    dokument, i kategorie, které by se namapovaly. S tímhle přepínačem stačí
    jako začátek libovolná namapovaná kategorie. Používá se až ve druhém
    průchodu, když první nenajde nic (viz `parse_docx`).
    """
    doc = Document(docx_path)
    categories = {}
    episodes = {}

    current_cat = None
    current_ep_num = None
    current_ep_title = None
    current_paragraphs = []
    current_story_title = None
    story = None

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
                cat = map_heading_to_category(text) if is_cat_heading else None

                is_ep_heading = False
                matched_ep_num = None
                para_is_bold = all(r.bold for r in block.runs if r.text.strip()) if block.runs else False
                if list_type is None and not is_cat_heading:
                    if para_is_bold:
                        ep_match = _EP_HEADING_RE.search(text)
                        # Nadpis souhrnu děje není epizoda, i když v něm číslo
                        # epizody padne („1. Shrnutí Děje (Chronologicky EP 13–EP 24)").
                        if ep_match and not _matches_story_heading(text):
                            cislovani, predpona = ep_match.group(1), ep_match.group(2)
                            # Uvnitř rozepsaného děje bývají podnadpisy typu
                            # „1.1 Epizoda 1: …" nebo „Narativní obsah Epizody 18.5".
                            # To je pořád děj, ne epizodní rozbor. Na epizodu se
                            # tam proto láme jen nadpis, který začíná rovnou
                            # klíčem („EP 13: …"), jinak by filmy a speciály
                            # přišly o tlačítko „Děj".
                            v_deji = current_story_title is not None
                            je_podnadpis = bool(predpona) or bool(cislovani and '.' in cislovani)
                            if not (v_deji and je_podnadpis):
                                is_ep_heading = True
                                matched_ep_num = ep_match.group(3)

                # Detekce začátku sekce „Shrnutí Děje" (jen před kategoriemi,
                # jen když ještě neběží epizody ani story)
                is_story_heading = False
                if (list_type is None and not is_ep_heading and not has_started
                        and current_story_title is None and current_ep_num is None and story is None
                        and para_is_bold and cat != "Animace" and _matches_story_heading(text)):
                    is_story_heading = True
                story_active = (not has_started) and (current_story_title is not None)

                je_start_kategorii = is_cat_heading and (
                    cat == "Animace" or (start_on_any_category and not has_started))

                if je_start_kategorii:
                    if current_ep_num and current_paragraphs:
                        episodes[current_ep_num] = {
                            "title": current_ep_title,
                            "text": "\n".join(current_paragraphs).strip()
                        }
                        current_ep_num = None
                        current_ep_title = None
                    if current_story_title is not None and current_paragraphs and story is None:
                        story = {"title": current_story_title, "text": "\n".join(current_paragraphs).strip()}
                        current_story_title = None
                    has_started = True
                    if current_cat and current_paragraphs:
                        categories[current_cat] = "\n".join(current_paragraphs).strip()
                    current_cat = cat
                    current_paragraphs = []
                    list_counters.clear()
                    list_base_ilvl.clear()

                elif is_ep_heading and not has_started:
                    # EP nadpis => epizodní docx: zahoď případný story režim
                    # (story a episodes se vzájemně vylučují).
                    current_story_title = None
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

                elif story_active:
                    # Uvnitř „Shrnutí Děje": vše je narativní obsah až do sekce
                    # „Deskriptivní analýza komponentů" nebo do „Animace" (výše).
                    # I nadpisy mapující na kategorii (např. „1.3 Závěr") jsou tu
                    # obsahem děje, ne kategorií.
                    if para_is_bold and len(text) < 130 and (_matches_component_heading(text) or _is_academic_stop(text)):
                        if current_paragraphs and story is None:
                            story = {"title": current_story_title, "text": "\n".join(current_paragraphs).strip()}
                        current_story_title = None
                        current_paragraphs = []
                        list_counters.clear()
                        list_base_ilvl.clear()
                    else:
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

                elif is_story_heading:
                    current_story_title = text
                    current_paragraphs = []
                    list_counters.clear()
                    list_base_ilvl.clear()

                elif is_cat_heading:
                    if has_started:
                        if current_cat and current_paragraphs:
                            categories[current_cat] = "\n".join(current_paragraphs).strip()
                        current_cat = cat
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
            elif not has_started and (current_ep_num is not None or current_story_title is not None):
                table_text = "\n[TABULKA_START]\n"
                for row in block.rows:
                    row_data = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
                    table_text += "| " + " | ".join(row_data) + " |\n"
                table_text += "[TABULKA_KONEC]\n"
                current_paragraphs.append(table_text)

    if current_cat and current_paragraphs:
        categories[current_cat] = "\n".join(current_paragraphs).strip()

    # Story bez ukončovací sekce (došla až do konce dokumentu)
    if current_story_title is not None and current_paragraphs and story is None:
        story = {"title": current_story_title, "text": "\n".join(current_paragraphs).strip()}
    if story:
        categories["story"] = story

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


def parse_docx(docx_path: str) -> dict[str, any]:
    """Rozparsuje rozbor, v případě potřeby na dva průchody.

    První průchod jede podle původního pravidla: kategorie začínají nadpisem
    „Animace". Když z toho nevypadne ani jedna kategorie, jde se na druhý
    průchod, kde stačí libovolný namapovaný nadpis. Rozdělení na dva průchody
    je schválně: dokumenty, které se dnes parsují správně, se tím nemůžou
    rozbít, protože pro ně druhý průchod vůbec nenastane.
    """
    vysledek = parse_docx_categories(docx_path)
    if [k for k in vysledek if k not in ("episodes", "story")]:
        return vysledek

    druhy = parse_docx_categories(docx_path, start_on_any_category=True)
    if [k for k in druhy if k not in ("episodes", "story")]:
        # Epizody a děj z prvního průchodu se nesmí ztratit
        for klic in ("episodes", "story"):
            if klic in vysledek and klic not in druhy:
                druhy[klic] = vysledek[klic]
        return druhy

    return vysledek


# ── Inkrementální běh ───────────────────────────────────────────────────────

def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def docx_content_hash(path: str) -> str:
    """Otisk obsahu rozboru, očištěný o technický šum Wordu.

    Word při každém uložení přepíše náhodné identifikátory (RSID, paraId,
    textId), takže hash celého souboru by hlásil změnu i u dokumentu, kterého
    se nikdo nedotkl. Počítá se proto z `document.xml` (text) a `numbering.xml`
    (formát seznamů, který parser taky čte). Stejný postup používá i
    NotebookLM updater.
    """
    try:
        if not zipfile.is_zipfile(path):
            return _file_hash(path)
        h = hashlib.sha256()
        with zipfile.ZipFile(path, 'r') as z:
            jmena = z.namelist()
            for name in ("word/document.xml", "word/numbering.xml"):
                if name not in jmena:
                    continue
                obsah = z.read(name)
                obsah = re.sub(
                    rb'(w:rsid[a-zA-Z0-9]*|w14:paraId|w14:textId)="[a-fA-F0-9]{8}"',
                    b'', obsah)
                obsah = re.sub(rb'\s+', b' ', obsah)
                h.update(obsah)
        return h.hexdigest()
    except Exception:
        return _file_hash(path)


def _nacti_json(cesta: str, vychozi):
    try:
        with open(cesta, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return vychozi


def _force_utf8_stdio():
    # Skript spouští export_data.py přes subprocess a české výpisy by na
    # konzoli s windows-1250 shodily celý export na UnicodeEncodeError.
    for proud in (sys.stdout, sys.stderr):
        try:
            proud.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def vypis_kontrolu(result: dict, list_items: list):
    """Vypíše tituly, jejichž rozbor vypadá neúplně.

    HEADING_MAP je tichý propad: nadpis mimo mapu znamená, že se kategorie do
    JSONu vůbec nedostane a nikde to nezasvítí. Tenhle report je proti tomu
    pojistka, ať se na to nepřijde až na webu.
    """
    ocekavane_epizody = {}
    for it in list_items:
        try:
            ocekavane_epizody[it['name']] = int(it.get('episodes'))
        except (TypeError, ValueError):
            continue

    bez_kategorii = []
    malo_epizod = []
    for name, v in result.items():
        if not isinstance(v, dict):
            continue
        kategorie = [k for k in v if k not in ("episodes", "story")]
        epizod = len(v.get("episodes", {}) or {})
        ocekavano = ocekavane_epizody.get(name)
        if not kategorie:
            bez_kategorii.append(name)
        if (ocekavano and ocekavano > 1 and "story" not in v
                and epizod < ocekavano * 0.5):
            malo_epizod.append(f"{name} ({epizod} z {ocekavano})")

    print()
    print("--- Kontrola úplnosti rozborů ---")
    if bez_kategorii:
        print(f"Bez jediné kategorie ({len(bez_kategorii)}):")
        for n in sorted(bez_kategorii):
            print(f"   {n}")
    if malo_epizod:
        print(f"Míň epizod, než má titul v seznamu ({len(malo_epizod)}):")
        for n in sorted(malo_epizod):
            print(f"   {n}")
    if not bez_kategorii and not malo_epizod:
        print("Všechny rozbory vypadají úplné.")
    print("Nadpis mimo HEADING_MAP propadne tiše, proto tenhle výpis existuje.")


def main():
    _force_utf8_stdio()

    parser = argparse.ArgumentParser(
        description="Export DOCX rozborů do public/data/category_texts.json")
    parser.add_argument("--full", action="store_true",
                        help="přeparsovat všechny rozbory a ignorovat cache")
    parser.add_argument("--out", default=OUT_FILE,
                        help="cesta k výstupnímu JSONu (pro zkušební běhy)")
    args = parser.parse_args()

    print("Spouštím export DOCX rozborů...")

    # Načteme názvy anime ze DVOU zdrojů a sjednotíme je:
    #   1) category_ratings.json — anime s kategoriálním hodnocením (~296)
    #   2) anime_list.json — KOMPLETNÍ seznam všech titulů (~488), vč. jednotlivých
    #      řad, filmů a OVA, které mají vlastní DOCX rozbor, ale nemají samostatné
    #      kategoriální hodnocení (to je sdílené pod hlavní sérií).
    # Bez anime_list se ~178 rozborů (Attack on Titan po řadách, filmy Fate/Evangelion,
    # DanMachi sezóny, KonoSuba filmy atd.) nikdy nespárovalo — každý titul teď
    # dostane svůj vlastní rozbor, když k němu DOCX existuje.
    ratings_file = os.path.join(APP_ROOT, "public", "data", "category_ratings.json")
    list_file = os.path.join(APP_ROOT, "public", "data", "anime_list.json")
    if not os.path.exists(ratings_file):
        print(f"Chyba: Soubor {ratings_file} neexistuje! Spusťte nejdřív hlavní export.")
        return

    all_anime_names = []
    seen_names = set()
    list_items = []

    def add_names(names):
        for n in names:
            if n and n not in seen_names:
                seen_names.add(n)
                all_anime_names.append(n)

    with open(ratings_file, 'r', encoding='utf-8') as f:
        rating_items = json.load(f)
    add_names(item['name'] for item in rating_items)
    rating_count = len(all_anime_names)

    if os.path.exists(list_file):
        with open(list_file, 'r', encoding='utf-8') as f:
            list_items = json.load(f)
        add_names(item['name'] for item in list_items)
    else:
        print(f"Varování: {list_file} neexistuje — použije se jen category_ratings.json.")

    print(f"Načteno {len(all_anime_names)} anime "
          f"({rating_count} z hodnocení + {len(all_anime_names) - rating_count} navíc z anime_list).")
    
    # Check directory
    if not os.path.exists(SRC_DIR):
        print(f"Chyba: Složka s rozbory {SRC_DIR} neexistuje!")
        return

    # Cache file list
    files = os.listdir(SRC_DIR)
    docx_files = {clean_file_name(f[:-5]).lower(): f
                  for f in files if f.endswith(".docx") and not f.startswith("~$")}
    print(f"Nalezeno {len(docx_files)} DOCX souborů ve zdrojové složce.")

    # Cache otisků. Když se změní verze parseru, staré výsledky by neodpovídaly
    # nové logice, takže se cache zahodí a parsuje se všechno znovu.
    cache = _nacti_json(CACHE_FILE, {})
    if cache.get("parser_version") != PARSER_VERSION:
        if cache:
            print(f"Parser má novou verzi ({PARSER_VERSION}), cache se zahazuje "
                  f"a rozbory se parsují znovu.")
        cache = {"parser_version": PARSER_VERSION, "soubory": {}}
    zaznamy = cache.setdefault("soubory", {})

    # Předchozí výstup je základ pro merge: nezměněné rozbory se z něj přeberou,
    # aby se nemusely znovu parsovat.
    stary_vystup = {} if args.full else _nacti_json(args.out, {})

    result = {}
    prevzato = 0
    prohnano = 0

    for name in all_anime_names:
        clean = clean_file_name(name).lower()
        if clean not in docx_files:
            continue

        file_name = docx_files[clean]
        file_path = os.path.join(SRC_DIR, file_name)

        try:
            otisk = docx_content_hash(file_path)
        except Exception as e:
            print(f"Varování: otisk {file_name} nelze spočítat ({e}), parsuje se natvrdo.")
            otisk = None

        zaznam = zaznamy.get(name)
        if (not args.full and otisk and zaznam
                and zaznam.get("hash") == otisk and name in stary_vystup):
            result[name] = stary_vystup[name]
            prevzato += 1
            continue

        try:
            # Read-Only access
            categories = parse_docx(file_path)
            if categories:
                result[name] = categories
                prohnano += 1
                zaznamy[name] = {"soubor": file_name, "hash": otisk}
            else:
                zaznamy.pop(name, None)
        except Exception as e:
            print(f"Chyba při parsování {file_name}: {e}")

    # Rozbory, ke kterým už DOCX neexistuje, z cache i z výstupu vypadnou
    for jmeno in [k for k in zaznamy if k not in result]:
        del zaznamy[jmeno]

    zmizelo = [k for k in stary_vystup if k not in result]
    if zmizelo:
        print(f"Pozor: {len(zmizelo)} rozborů oproti minulému běhu zmizelo: "
              f"{', '.join(sorted(zmizelo)[:10])}"
              f"{' …' if len(zmizelo) > 10 else ''}")

    # Save results
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    if args.out == OUT_FILE:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=1)

    print(f"Hotovo! Vyexportováno {len(result)} rozborů do {args.out} "
          f"({prohnano} nově naparsováno, {prevzato} beze změny převzato z minula).")

    vypis_kontrolu(result, list_items)

if __name__ == "__main__":
    main()
