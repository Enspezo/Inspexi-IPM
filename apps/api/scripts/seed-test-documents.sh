#!/usr/bin/env bash
# seed-test-documents.sh – Upload dummy bestanden om de document preview te testen
# Gebruik: bash apps/api/scripts/seed-test-documents.sh

set -euo pipefail

API="http://localhost:3001/api/v1"
HOST_HEADER="Host: inspexidemo.localhost"
EMAIL="admin@inspexi-demo.nl"
PASSWORD="Password123!"
TMPDIR=$(mktemp -d)

echo "=== Document preview test-seeder ==="
echo "Temp dir: $TMPDIR"

# 1. Login
echo ""
echo "[1/8] Inloggen..."
LOGIN_BODY="$TMPDIR/login.json"
cat > "$LOGIN_BODY" << LOGINEOF
{"email":"$EMAIL","password":"$PASSWORD"}
LOGINEOF
LOGIN_RESP=$(curl -s -X POST "$API/auth/login" \
  -H "$HOST_HEADER" \
  -H "Content-Type: application/json" \
  --data-binary "@$LOGIN_BODY")

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo "  FOUT: Kon niet inloggen. Is de API actief op $API?"
  echo "  Response: $LOGIN_RESP"
  rm -rf "$TMPDIR"
  exit 1
fi
echo "  OK – token verkregen"

# 2. Haal een bestaande relatie op
echo ""
echo "[2/8] Relatie ophalen..."
CONTACT_RESP=$(curl -s -X GET "$API/contacts?limit=1" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN")

CONTACT_ID=$(echo "$CONTACT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); data=d.get('data',d); data=data.get('data',data) if isinstance(data,dict) else data; print(data[0]['id'])" 2>/dev/null || true)

if [ -z "$CONTACT_ID" ]; then
  echo "  FOUT: Geen relaties gevonden. Draai eerst de seed."
  rm -rf "$TMPDIR"
  exit 1
fi
echo "  OK – relatie: $CONTACT_ID"

# 3. Haal een bestaande taak op
echo ""
echo "[3/8] Taak ophalen..."
TASK_RESP=$(curl -s -X GET "$API/tasks?limit=1" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN")

TASK_ID=$(echo "$TASK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); data=d.get('data',d); data=data.get('data',data) if isinstance(data,dict) else data; print(data[0]['id'])" 2>/dev/null || true)

if [ -z "$TASK_ID" ]; then
  echo "  WAARSCHUWING: Geen taken gevonden, sla taak-documenten over."
fi

# ---- Dummy bestanden aanmaken ----

# PDF (minimal valid PDF)
echo ""
echo "[4/8] Dummy bestanden aanmaken..."

cat > "$TMPDIR/test-rapport.pdf" << 'PDFEOF'
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 100 700 Td (Test Rapport) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF
PDFEOF
echo "  test-rapport.pdf (PDF)"

# PNG + JPEG via python3 (betrouwbaar voor binaire bestanden)
export TMPDIR_SEED="$TMPDIR"
python3 << 'PYEOF'
import struct, zlib, os

tmpdir = os.environ['TMPDIR_SEED']

# --- PNG 100x100 blue ---
w, h = 100, 100
raw = b''
for y in range(h):
    raw += b'\x00'
    for x in range(w):
        raw += b'\x33\x66\xff'
compressed = zlib.compress(raw)
def chunk(tag, data):
    c = tag + data
    return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', ihdr)
png += chunk(b'IDAT', compressed)
png += chunk(b'IEND', b'')
with open(tmpdir + '/inspectie-foto.png', 'wb') as f:
    f.write(png)
print('  inspectie-foto.png (PNG 100x100)')

# --- JPEG via PIL or fallback minimal ---
try:
    from PIL import Image
    img = Image.new('RGB', (100, 100), (255, 140, 0))
    img.save(tmpdir + '/object-foto.jpg', 'JPEG')
    print('  object-foto.jpg (JPEG 100x100 via PIL)')
except ImportError:
    # Minimal valid JPEG - a solid color 1x1
    import base64
    # Pre-encoded minimal 1x1 white JPEG
    b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
    # Actually just skip JPEG if PIL not available, PNG + SVG + PDF is enough
    print('  object-foto.jpg (overgeslagen - PIL niet beschikbaar)')
PYEOF

# CSV
cat > "$TMPDIR/meetresultaten.csv" << 'CSVEOF'
Datum;Locatie;Object;Meting;Waarde;Eenheid;Status
2026-01-15;Amsterdam;Object A;Dikte;12.5;mm;Goedgekeurd
2026-01-15;Amsterdam;Object A;Lengte;340;cm;Goedgekeurd
2026-01-16;Rotterdam;Object B;Dikte;8.2;mm;Afgekeurd
2026-01-16;Rotterdam;Object B;Lengte;280;cm;Goedgekeurd
2026-02-01;Utrecht;Object C;Dikte;15.0;mm;Goedgekeurd
2026-02-01;Utrecht;Object C;Lengte;510;cm;Goedgekeurd
2026-02-10;Den Haag;Object D;Dikte;6.1;mm;Afgekeurd
2026-02-10;Den Haag;Object D;Lengte;195;cm;Goedgekeurd
2026-02-20;Eindhoven;Object E;Dikte;11.8;mm;Goedgekeurd
2026-02-20;Eindhoven;Object E;Lengte;425;cm;Goedgekeurd
CSVEOF
echo "  meetresultaten.csv (CSV)"

# SVG
cat > "$TMPDIR/plattegrond.svg" << 'SVGEOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect fill="#f0f0f0" width="400" height="300" rx="8"/>
  <rect x="40" y="40" width="150" height="100" fill="#4f46e5" rx="4" opacity="0.8"/>
  <text x="115" y="95" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">Ruimte A</text>
  <rect x="210" y="40" width="150" height="100" fill="#059669" rx="4" opacity="0.8"/>
  <text x="285" y="95" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">Ruimte B</text>
  <rect x="40" y="160" width="320" height="100" fill="#d97706" rx="4" opacity="0.8"/>
  <text x="200" y="215" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">Hal / Gang</text>
  <text x="200" y="290" text-anchor="middle" fill="#666" font-size="11" font-family="sans-serif">Plattegrond – Verdieping 1</text>
</svg>
SVGEOF
echo "  plattegrond.svg (SVG)"

# DOCX + XLSX via python3 (Office Open XML = ZIP-based formats)
python3 << 'OFFICEEOF'
import zipfile, os

tmpdir = os.environ['TMPDIR_SEED']

# --- Minimal DOCX ---
docx_path = tmpdir + '/inspectie-verslag.docx'
with zipfile.ZipFile(docx_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('[Content_Types].xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>''')
    zf.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>''')
    zf.writestr('word/_rels/document.xml.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''')
    zf.writestr('word/styles.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
</w:styles>''')
    zf.writestr('word/document.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Inspectie Verslag</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Datum: 15 januari 2026</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Locatie: Amsterdam Centrum</w:t></w:r>
    </w:p>
    <w:p/>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Samenvatting</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>De inspectie is uitgevoerd conform de geldende normen en richtlijnen. Alle meetpunten zijn gecontroleerd en de resultaten zijn vastgelegd in het bijgevoegde meetrapport.</w:t></w:r>
    </w:p>
    <w:p/>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Bevindingen</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>1. Object A: Goedgekeurd - dikte binnen tolerantie</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>2. Object B: Afgekeurd - dikte onder minimumwaarde</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>3. Object C: Goedgekeurd - alle metingen conform norm</w:t></w:r>
    </w:p>
    <w:p/>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Conclusie</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Op basis van de inspectieresultaten wordt aanbevolen om Object B te vervangen. De overige objecten voldoen aan de gestelde eisen.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>''')
print('  inspectie-verslag.docx (Word DOCX)')

# --- Minimal XLSX ---
xlsx_path = tmpdir + '/meetdata-2026.xlsx'
with zipfile.ZipFile(xlsx_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('[Content_Types].xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>''')
    zf.writestr('_rels/.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>''')
    zf.writestr('xl/_rels/workbook.xml.rels', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>''')
    zf.writestr('xl/workbook.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Meetresultaten" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>''')
    zf.writestr('xl/styles.xml', '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>''')

    # Shared strings: header row + data
    strings = [
        'Datum', 'Locatie', 'Object', 'Meting', 'Waarde', 'Eenheid', 'Status',
        '2026-01-15', 'Amsterdam', 'Object A', 'Dikte', '12.5', 'mm', 'Goedgekeurd',
        '2026-01-15', 'Amsterdam', 'Object A', 'Lengte', '340', 'cm', 'Goedgekeurd',
        '2026-01-16', 'Rotterdam', 'Object B', 'Dikte', '8.2', 'mm', 'Afgekeurd',
        '2026-01-16', 'Rotterdam', 'Object B', 'Lengte', '280', 'cm', 'Goedgekeurd',
        '2026-02-01', 'Utrecht', 'Object C', 'Dikte', '15.0', 'mm', 'Goedgekeurd',
        '2026-02-01', 'Utrecht', 'Object C', 'Lengte', '510', 'cm', 'Goedgekeurd',
        '2026-02-10', 'Den Haag', 'Object D', 'Dikte', '6.1', 'mm', 'Afgekeurd',
        '2026-02-10', 'Den Haag', 'Object D', 'Lengte', '195', 'cm', 'Goedgekeurd',
    ]
    ss_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    ss_xml += f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(strings)}" uniqueCount="{len(strings)}">\n'
    for s in strings:
        ss_xml += f'  <si><t>{s}</t></si>\n'
    ss_xml += '</sst>'
    zf.writestr('xl/sharedStrings.xml', ss_xml)

    # Build rows
    cols = 'ABCDEFG'
    rows_xml = ''
    for row_idx in range(len(strings) // 7):
        r = row_idx + 1
        style = ' s="1"' if row_idx == 0 else ''
        row_cells = ''
        for col_idx in range(7):
            si = row_idx * 7 + col_idx
            row_cells += f'<c r="{cols[col_idx]}{r}" t="s"{style}><v>{si}</v></c>'
        rows_xml += f'<row r="{r}">{row_cells}</row>\n'

    zf.writestr('xl/worksheets/sheet1.xml', f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
{rows_xml}  </sheetData>
</worksheet>''')
print('  meetdata-2026.xlsx (Excel XLSX)')
OFFICEEOF

echo ""
echo "[5/8] Bestanden uploaden naar relatie $CONTACT_ID..."

# Upload PDF
echo -n "  test-rapport.pdf..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/test-rapport.pdf;type=application/pdf" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Inspectie rapport Q1 2026")
echo " $RESP"

# Upload PNG
echo -n "  inspectie-foto.png..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/inspectie-foto.png;type=image/png" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Foto van inspectielocatie")
echo " $RESP"

# Upload JPEG (alleen als bestand bestaat)
if [ -s "$TMPDIR/object-foto.jpg" ]; then
  echo -n "  object-foto.jpg..."
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
    -H "$HOST_HEADER" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TMPDIR/object-foto.jpg;type=image/jpeg" \
    -F "entityType=CONTACT" \
    -F "entityId=$CONTACT_ID" \
    -F "description=Object foto voor rapportage")
  echo " $RESP"
else
  echo "  object-foto.jpg overgeslagen (bestand niet gegenereerd)"
fi

# Upload CSV
echo -n "  meetresultaten.csv..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/meetresultaten.csv;type=text/csv" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Meetresultaten januari-februari 2026")
echo " $RESP"

# Upload SVG
echo -n "  plattegrond.svg..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/plattegrond.svg;type=image/svg+xml" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Plattegrond verdieping 1")
echo " $RESP"

# Upload DOCX
echo -n "  inspectie-verslag.docx..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/inspectie-verslag.docx;type=application/vnd.openxmlformats-officedocument.wordprocessingml.document" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Inspectie verslag januari 2026")
echo " $RESP"

# Upload XLSX
echo -n "  meetdata-2026.xlsx..."
RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPDIR/meetdata-2026.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" \
  -F "entityType=CONTACT" \
  -F "entityId=$CONTACT_ID" \
  -F "description=Meetdata spreadsheet 2026")
echo " $RESP"

# 6. Upload naar taak (als bijlage)
if [ -n "$TASK_ID" ]; then
  echo ""
  echo "[6/8] Bestanden uploaden naar taak $TASK_ID..."

  echo -n "  test-rapport.pdf (taak bijlage)..."
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TMPDIR/test-rapport.pdf;type=application/pdf" \
    -F "entityType=TASK" \
    -F "entityId=$TASK_ID" \
    -F "description=Rapport als bijlage bij taak")
  echo " $RESP"

  echo -n "  meetresultaten.csv (taak bijlage)..."
  RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/documents" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$TMPDIR/meetresultaten.csv;type=text/csv" \
    -F "entityType=TASK" \
    -F "entityId=$TASK_ID" \
    -F "description=Meetdata als bijlage bij taak")
  echo " $RESP"
else
  echo ""
  echo "[6/8] Overgeslagen – geen taken gevonden"
fi

# 7. Controleer documenten
echo ""
echo "[7/8] Documenten controleren..."
DOC_RESP=$(curl -s -X GET "$API/documents?limit=10" \
  -H "$HOST_HEADER" \
  -H "Authorization: Bearer $TOKEN")

DOC_COUNT=$(echo "$DOC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); data=d.get('data',d); print(data.get('total', len(data.get('data',[]))))" 2>/dev/null || echo "?")
echo "  Totaal documenten in systeem: $DOC_COUNT"

# Cleanup
rm -rf "$TMPDIR"

echo ""
echo "=== Klaar! ==="
echo "Ga naar de applicatie om de document preview te testen:"
echo "  - Documenten overzicht: /documents"
echo "  - Relatie detail: /contacts/$CONTACT_ID"
if [ -n "$TASK_ID" ]; then
  echo "  - Taak detail: /tasks/$TASK_ID"
fi
echo ""
echo "Ondersteunde previews:"
echo "  - PDF: inline viewer"
echo "  - Afbeeldingen (PNG, JPEG, SVG, WebP): inline weergave"
echo "  - CSV: tabelweergave"
echo "  - Word (.docx): document weergave via docx-preview"
echo "  - Excel (.xlsx, .xls): spreadsheet weergave via SheetJS"
echo "  - Overige (PowerPoint, ZIP): download-knop"
