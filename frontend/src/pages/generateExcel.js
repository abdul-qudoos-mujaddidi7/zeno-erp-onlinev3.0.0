import { get } from 'svelte/store';
import { isRTL, lang, t } from '../i18n/i18n';
import { getReportExportData } from './generatePDF.js';

export let generatingExcel = false;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes =
      file.data instanceof Uint8Array ? file.data : encoder.encode(file.data);
    const checksum = crc32(dataBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, dataBytes.length);
    writeUint32(localView, 22, dataBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, dataBytes.length);
    writeUint32(centralView, 24, dataBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);

  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, offset);
  writeUint16(endView, 20, 0);

  return concatBytes([...localParts, centralDirectory, endRecord]);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function columnLetter(index) {
  let position = Number(index) + 1;
  let letter = '';

  while (position > 0) {
    const remainder = (position - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    position = Math.floor((position - 1) / 26);
  }

  return letter;
}

function cellRef(columnIndex, rowNumber) {
  return `${columnLetter(columnIndex)}${rowNumber}`;
}

function sanitizeSheetName(name) {
  const cleaned = String(name || 'Report')
    .replace(/[:\\/?*[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || 'Report').slice(0, 31);
}

function resolveExcelFileName(type) {
  const safeType = String(type || 'report')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const date = new Date().toISOString().slice(0, 10);

  return `ZenoERP-${safeType || 'report'}-${date}.xlsx`;
}

function estimateColumnWidth(text) {
  const length = String(text || '').length;

  return Math.min(42, Math.max(12, length + 4));
}

function createSharedStringTable() {
  const values = [];
  const indexByValue = new Map();

  function intern(text) {
    const value = String(text ?? '');

    if (indexByValue.has(value)) return indexByValue.get(value);

    const index = values.length;
    values.push(value);
    indexByValue.set(value, index);

    return index;
  }

  function cell(ref, text, styleId) {
    return `<c r="${ref}" s="${styleId}" t="s"><v>${intern(text)}</v></c>`;
  }

  return { cell, values };
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function corePropsXml(title) {
  const now = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title || 'ZenoERP')}</dc:title>
  <dc:creator>ZenoERP</dc:creator>
  <cp:lastModifiedBy>ZenoERP</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>${escapeXml(sheetName)}</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company>ZenoERP</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`;
}

function containsRtlText(value) {
  return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(String(value || ''));
}

function resolveSheetRtl(report) {
  if (report?.rtl) return true;
  if (t('dir') === 'rtl') return true;
  if (isRTL(get(lang))) return true;
  if (
    typeof document !== 'undefined' &&
    document.documentElement?.getAttribute('dir') === 'rtl'
  ) {
    return true;
  }

  const samples = [
    report?.title,
    report?.companyName,
    report?.dateRange,
    ...(Array.isArray(report?.headers) ? report.headers : []),
    ...(Array.isArray(report?.metrics)
      ? report.metrics.flatMap((metric) => [metric?.label, metric?.value])
      : []),
    ...(Array.isArray(report?.rows)
      ? report.rows.slice(0, 12).flatMap((row) => (Array.isArray(row) ? row : []))
      : []),
  ];

  return samples.some(containsRtlText);
}

function workbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="11231"/>
  <workbookPr defaultThemeVersion="166925"/>
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="27795" windowHeight="12585" tabRatio="600" firstSheet="0" activeTab="0"/>
  </bookViews>
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcId="191028"/>
</workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
}

function sharedStringsXml(values) {
  const items = Array.isArray(values) ? values : [];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${items.length}" uniqueCount="${items.length}">
${items
  .map((value) => {
    const text = escapeXml(value);
    const space = /^\s|\s$/.test(String(value || ''))
      ? ' xml:space="preserve"'
      : '';

    return `<si><t${space}>${text}</t></si>`;
  })
  .join('')}
</sst>`;
}

function stylesXml(rtl = false) {
  const readingOrder = rtl ? ' readingOrder="2"' : ' readingOrder="1"';
  const contentAlign = rtl ? 'right' : 'center';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF255260"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF367588"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="${contentAlign}" vertical="center"${readingOrder}/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"${readingOrder}/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"${readingOrder}/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${contentAlign}" vertical="center" wrapText="1"${readingOrder}/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="${contentAlign}" vertical="center" wrapText="1"${readingOrder}/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${contentAlign}" vertical="center" wrapText="1"${readingOrder}/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function padRow(values, length) {
  const row = Array.isArray(values) ? [...values] : [];

  while (row.length < length) {
    row.push('');
  }

  return row.slice(0, length);
}

function buildWorksheet(report) {
  const rtl = resolveSheetRtl(report);
  const strings = createSharedStringTable();
  const metrics = Array.isArray(report.metrics) ? [...report.metrics] : [];
  const headers = Array.isArray(report.headers) ? [...report.headers] : [];
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columnCount = Math.max(1, metrics.length, headers.length, 1);
  const displayHeaders = padRow(headers, columnCount);
  const displayMetrics = padRow(metrics, columnCount);
  const displayRows = rows.map((row) => padRow(row, columnCount));
  const lastColumn = columnLetter(columnCount - 1);
  const sheetRows = [];
  let rowNumber = 1;

  function pushRow(values, styleId, height, reverse = false) {
    const cells = values
      .slice(0, columnCount)
      .map((value, columnIndex) =>
        strings.cell(
          cellRef(columnIndex, rowNumber),
          value,
          styleId,
        ),
      )
      .join('');
    const heightAttr = height ? ` ht="${height}" customHeight="1"` : '';

    sheetRows.push(
      `<row r="${rowNumber}"${heightAttr} spans="1:${columnCount}">${cells}</row>`,
    );
    rowNumber += 1;
  }

  const titleCells = Array.from({ length: columnCount }, (_, index) =>
    index === 0 ? report.title || 'Report' : '',
  );
  pushRow(titleCells, 1, 24);

  const companyCells = Array.from({ length: columnCount }, (_, index) =>
    index === 0 ? report.companyName || 'ZenoERP' : '',
  );
  pushRow(companyCells, 2, 18);

  if (report.dateRange) {
    const rangeCells = Array.from({ length: columnCount }, (_, index) =>
      index === 0 ? report.dateRange : '',
    );
    pushRow(rangeCells, 2, 18);
  }

  pushRow(Array.from({ length: columnCount }, () => ''), 0, 8);

  if (metrics.length) {
    pushRow(
      Array.from(
        { length: columnCount },
        (_, index) => displayMetrics[index]?.label || '',
      ),
      3,
      18,
      true,
    );
    pushRow(
      Array.from(
        { length: columnCount },
        (_, index) => displayMetrics[index]?.value || '',
      ),
      4,
      20,
      true,
    );
    pushRow(Array.from({ length: columnCount }, () => ''), 0, 8);
  }

  const headerRowNumber = rowNumber;
  pushRow(
    Array.from({ length: columnCount }, (_, index) => displayHeaders[index] || ''),
    3,
    20,
    true,
  );

  displayRows.forEach((row, index) => {
    pushRow(
      Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] || ''),
      index % 2 === 0 ? 4 : 5,
      18,
      true,
    );
  });

  const lastRow = Math.max(1, rowNumber - 1);
  const logicalWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const samples = [
      report.title,
      report.companyName,
      report.dateRange,
      displayMetrics[columnIndex]?.label,
      displayMetrics[columnIndex]?.value,
      displayHeaders[columnIndex],
      ...displayRows.slice(0, 40).map((row) => row[columnIndex]),
    ];

    return samples.reduce(
      (width, value) => Math.max(width, estimateColumnWidth(value)),
      12,
    );
  });
  const widths = logicalWidths;

  const colsXml = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');

  const merges = [
    `<mergeCell ref="A1:${lastColumn}1"/>`,
    `<mergeCell ref="A2:${lastColumn}2"/>`,
  ];

  if (report.dateRange) {
    merges.push(`<mergeCell ref="A3:${lastColumn}3"/>`);
  }

  const freezeRow = headerRowNumber - 1;
  const rtlAttr = rtl ? ' rightToLeft="1"' : '';
  const sheetView = `<sheetView${rtlAttr} tabSelected="1" zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${headerRowNumber}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRowNumber}" sqref="A${headerRowNumber}"/></sheetView>`;

  return {
    sharedStrings: strings.values,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews>
    ${sheetView}
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${sheetRows.join('')}</sheetData>
  <mergeCells count="${merges.length}">${merges.join('')}</mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`,
  };
}

function downloadBlob(bytes, fileName) {
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function generateExcel(
  type = 'sales',
  filteredItems = [],
  fromDate = null,
  toDate = null,
  length = 0,
  totalAmount = {},
  extraInfo = {},
) {
  if (generatingExcel) return;

  generatingExcel = true;

  try {
    const report = await getReportExportData(
      type,
      filteredItems,
      fromDate,
      toDate,
      length,
      totalAmount,
      extraInfo,
    );
    const sheetName = sanitizeSheetName(report.title);
    const rtl = resolveSheetRtl(report);
    const worksheet = buildWorksheet(report);
    const zipBytes = buildZip([
      { name: '[Content_Types].xml', data: contentTypesXml() },
      { name: '_rels/.rels', data: rootRelsXml() },
      { name: 'docProps/app.xml', data: appPropsXml(sheetName) },
      { name: 'docProps/core.xml', data: corePropsXml(report.title) },
      { name: 'xl/workbook.xml', data: workbookXml(sheetName) },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml() },
      { name: 'xl/styles.xml', data: stylesXml(rtl) },
      { name: 'xl/sharedStrings.xml', data: sharedStringsXml(worksheet.sharedStrings) },
      { name: 'xl/worksheets/sheet1.xml', data: worksheet.xml },
    ]);

    downloadBlob(zipBytes, resolveExcelFileName(type));
  } catch (error) {
    console.error('Failed to generate the Excel report:', error);
    throw error;
  } finally {
    generatingExcel = false;
  }
}
