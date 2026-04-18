import zipfile, xml.etree.ElementTree as ET, json

z = zipfile.ZipFile('../A-List.xlsm', 'r')

# =============================================================
# STEP 1: Get ACTUAL column widths and row heights for sheet2
#         (OBECNÉ INFORMACE = drawing1.xml's parent sheet)
# =============================================================

# Find which sheet file maps to "OBECNÉ INFORMACE"
workbook_xml = z.read('xl/workbook.xml').decode('utf-8')
wb_root = ET.fromstring(workbook_xml)

# Get sheet names and rIds
sheets_info = {}
for elem in wb_root.iter():
    tag = elem.tag.split('}')[-1]
    if tag == 'sheet':
        sheets_info[elem.get('name')] = elem.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')

print("Sheets found:", list(sheets_info.keys()))

# Parse relationships to find sheet file
rels_xml = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
rels_root = ET.fromstring(rels_xml)
rid_to_file = {}
for elem in rels_root:
    rid_to_file[elem.get('Id')] = elem.get('Target')

# Find OBECNE INFORMACE sheet file
obecne_rid = sheets_info.get('OBECNÉ INFORMACE', '')
obecne_file = 'xl/' + rid_to_file.get(obecne_rid, 'worksheets/sheet2.xml')
print(f"OBECNÉ INFORMACE: rId={obecne_rid}, file={obecne_file}")

# Parse the sheet XML for column widths and row heights
sheet_data = z.read(obecne_file).decode('utf-8')
sheet_root = ET.fromstring(sheet_data)

default_col_width_chars = 8.43
default_row_height_pt = 15.0

for elem in sheet_root.iter():
    tag = elem.tag.split('}')[-1]
    if tag == 'sheetFormatPr':
        dcw = elem.get('defaultColWidth')
        if dcw:
            default_col_width_chars = float(dcw)
        drh = elem.get('defaultRowHeight')
        if drh:
            default_row_height_pt = float(drh)
        print(f"Defaults: colWidth={default_col_width_chars} chars, rowHeight={default_row_height_pt}pt")

# Collect custom column widths (character-based)
col_width_chars = {}  # 1-indexed col -> width in characters
for elem in sheet_root.iter():
    tag = elem.tag.split('}')[-1]
    if tag == 'col':
        cmin = int(elem.get('min', 0))
        cmax = int(elem.get('max', 0))
        width = float(elem.get('width', default_col_width_chars))
        custom_width = elem.get('customWidth', '0')
        for c in range(cmin, cmax + 1):
            col_width_chars[c] = width

# Collect custom row heights
row_height_pt_map = {}  # 1-indexed row -> height in points
for elem in sheet_root.iter():
    tag = elem.tag.split('}')[-1]
    if tag == 'row':
        rn = int(elem.get('r', 0))
        ht = elem.get('ht')
        if ht:
            row_height_pt_map[rn] = float(ht)

# =============================================================
# STEP 2: Convert character widths to pixels
# Excel formula: pixel_width = int((chars * max_digit_width + padding) / max_digit_width * 256) / 256 * max_digit_width
# Simplified at 96 DPI with Calibri 11pt: max_digit_width ≈ 7 pixels
# pixel_width = round(((256 * width + round(128/7)) / 256) * 7)
# But more practically: width_px = round(width * 7.5) for narrow cols, or width * 8 for standard
# Actually the most accurate formula used by Excel:
# For width > 1: pixels = round((width * MAX_DIGIT_WIDTH + 5) / MAX_DIGIT_WIDTH) * MAX_DIGIT_WIDTH
# For width <= 1: pixels = round(width * (MAX_DIGIT_WIDTH + 5))
# MAX_DIGIT_WIDTH for Calibri 11pt at 96 DPI = 7
# =============================================================

MAX_DIGIT_WIDTH = 7  # Calibri 11pt at 96 DPI

def char_width_to_px(char_width):
    """Convert Excel character width to pixel width"""
    if char_width <= 0:
        return 0
    # Standard Excel formula
    if char_width < 1:
        return round(char_width * (MAX_DIGIT_WIDTH + 5))
    else:
        return round(((char_width * MAX_DIGIT_WIDTH + 5) / MAX_DIGIT_WIDTH)) * MAX_DIGIT_WIDTH
    # Simpler approximation: return round(char_width * 7.5)

def pt_to_px(pt):
    """Convert points to pixels at 96 DPI"""
    return round(pt * 96 / 72)

def get_col_px(col_1indexed):
    """Get pixel width of a column (1-indexed)"""
    w = col_width_chars.get(col_1indexed, default_col_width_chars)
    return char_width_to_px(w)

def get_row_px(row_1indexed):
    """Get pixel height of a row (1-indexed)"""
    h = row_height_pt_map.get(row_1indexed, default_row_height_pt)
    return pt_to_px(h)

# Print some sample column widths to verify
print("\nSample column widths (px):")
for c in [1,2,3,4,5,10,15,20,30,50,70,100,120,150]:
    cw = col_width_chars.get(c, default_col_width_chars)
    px = get_col_px(c)
    print(f"  Col {c:4d}: {cw:8.2f} chars -> {px:4d}px")

print(f"\nDefault row height: {default_row_height_pt}pt -> {pt_to_px(default_row_height_pt)}px")
print("Custom row heights:")
for r in sorted(row_height_pt_map.keys())[:10]:
    print(f"  Row {r}: {row_height_pt_map[r]}pt -> {pt_to_px(row_height_pt_map[r])}px")

# =============================================================
# STEP 3: Calculate actual chart sizes from drawing anchors
# =============================================================

data = z.read('xl/drawings/drawing1.xml').decode('utf-8')
root = ET.fromstring(data)

EMU_PER_PX = 914400 / 96  # 9525 EMU per pixel

results = []
for elem in root.iter():
    tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
    if tag == 'twoCellAnchor':
        name_text = None
        is_chart = False

        for child in elem.iter():
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'graphicFrame':
                is_chart = True
            if ctag == 'cNvPr' and 'name' in child.attrib:
                name_text = child.attrib['name']

        from_elem = to_elem = None
        for child in elem:
            ctag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if ctag == 'from': from_elem = child
            elif ctag == 'to': to_elem = child

        if is_chart and name_text and from_elem is not None and to_elem is not None:
            vals = {}
            for fe in from_elem:
                t = fe.tag.split('}')[-1]
                vals['from_' + t] = int(fe.text)
            for te in to_elem:
                t = te.tag.split('}')[-1]
                vals['to_' + t] = int(te.text)

            # Calculate pixel width: sum of column widths from from_col to to_col
            # Columns in drawing XML are 0-indexed, Excel columns are 1-indexed
            total_w = 0
            for c in range(vals['from_col'], vals['to_col']):
                total_w += get_col_px(c + 1)  # Convert to 1-indexed
            # Subtract from offset, add to offset (EMU to px)
            total_w -= round(vals.get('from_colOff', 0) / EMU_PER_PX)
            total_w += round(vals.get('to_colOff', 0) / EMU_PER_PX)

            # Calculate pixel height: sum of row heights from from_row to to_row
            total_h = 0
            for r in range(vals['from_row'], vals['to_row']):
                total_h += get_row_px(r + 1)  # Convert to 1-indexed
            total_h -= round(vals.get('from_rowOff', 0) / EMU_PER_PX)
            total_h += round(vals.get('to_rowOff', 0) / EMU_PER_PX)

            ratio = f"{total_w / total_h:.2f}" if total_h > 0 else "N/A"
            results.append((name_text, total_w, total_h, ratio,
                            vals['from_col'], vals['to_col'],
                            vals['from_row'], vals['to_row']))

# Sort and print
results.sort(key=lambda x: x[0])

print(f"\n{'Chart Name':45s} {'Width':>7s} {'Height':>7s} {'Ratio':>6s}  {'Cols':>10s}  {'Rows':>10s}")
print("=" * 95)
for name, w, h, ratio, fc, tc, fr, tr in results:
    if 'Textov' in name:
        continue
    print(f"{name:45s} {w:5d}px {h:5d}px {ratio:>6s}  {fc:3d}-{tc:3d}     {fr:3d}-{tr:3d}")

# Print size categories
print("\n\n=== SIZE GROUPS ===")
standard = []
wide = []
short = []
for name, w, h, ratio, fc, tc, fr, tr in results:
    if 'Textov' in name:
        continue
    if w > 800:
        wide.append((name, w, h))
    elif h < 250:
        short.append((name, w, h))
    else:
        standard.append((name, w, h))

print(f"\nStandard (~620x638):")
for n, w, h in standard:
    print(f"  {n}: {w}x{h}")

print(f"\nWide (double width):")
for n, w, h in wide:
    print(f"  {n}: {w}x{h}")

print(f"\nShort/stacked:")
for n, w, h in short:
    print(f"  {n}: {w}x{h}")
