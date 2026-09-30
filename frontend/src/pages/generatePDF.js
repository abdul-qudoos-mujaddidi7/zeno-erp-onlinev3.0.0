;
import { productUnitApi } from '../api/productUnitApi.js';
import { settingsApi } from '../api/settingsApi.js';
import { accountGroupApi } from '../api/accountGroupApi.js';
import vazirTTF from '../assets/fonts/vazirmatn/Vazirmatn-Regular.ttf?url';
import vazirBoldTTF from '../assets/fonts/vazirmatn/Vazirmatn-Bold.ttf?url';

/*
 * This is the browser URL for:
 *
 * public/img/logo.png
 *
 * It is the same source used by:
 *
 * <img src="/img/logo.png" alt="ZENO ERP" />
 */
const systemLogoPNG = '/img/logo.png';

import { showDate } from '../calendar.js';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { t, shortID } from '../i18n/i18n';
import { accountApi } from '../api/accountApi.js';
import { accountTypeApi } from '../api/accountTypeApi.js';
import { sumReportQuantity } from './reportQuantity.js';

/*
 * ZenoERP modern PDF report generator
 *
 * Supported report types:
 * - sales
 * - purchases
 * - accounts
 * - account_financial_report
 * - journals_report
 * - product_transactions
 */

const PDF_THEME = {
  /*
   * Human-centered ERP palette:
   * calm white surfaces, neutral slate text and a focused blue accent.
   */
  primary: [54, 117, 136], // #367588
  primaryDark: [37, 82, 96], // #255260
  primarySoft: [238, 246, 248], // #eef6f8

  lavender: [245, 243, 255],
  mint: [236, 253, 245],
  peach: [255, 247, 237],
  sky: [240, 249, 255],

  ink: [15, 23, 42], // #0f172a
  text: [51, 65, 85], // #334155
  muted: [100, 116, 139], // #64748b

  border: [226, 232, 240], // #e2e8f0
  borderStrong: [203, 213, 225], // #cbd5e1

  surface: [248, 250, 252], // #f8fafc
  surfaceSoft: [255, 255, 255], // white
  white: [255, 255, 255],

  green: [5, 150, 105], // #059669
  greenSoft: [236, 253, 245],

  red: [220, 38, 38], // #dc2626
  redSoft: [254, 242, 242],

  amber: [217, 119, 6], // #d97706
  amberSoft: [255, 251, 235],

  cyan: [2, 132, 199], // #0284c7
  cyanSoft: [240, 249, 255],

  violet: [124, 58, 237], // #7c3aed
  violetSoft: [245, 243, 255],
};

const FONT_NAME = 'Vazirmatn';
const REGULAR_FONT_FILE = 'Vazirmatn-Regular.ttf';
const BOLD_FONT_FILE = 'Vazirmatn-Bold.ttf';

let company = {
  name: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  logo: '',
};

let account_types = [];
let account_groups = [];
let accounts = [];
let units = [];

let fontCache = null;
let systemLogoCache = null;

export let generatingPDF = false;

function normalizeItems(value) {
  return Array.isArray(value) ? value : [];
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatNumber(value, options = {}) {
  const number = Number(value || 0);

  return number.toLocaleString(undefined, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 3,
  });
}

/*
 * Keep the monetary text in an explicit left-to-right embedding so
 * jsPDF cannot reorder the minus sign or digits.
 *
 * LTR visual order:
 *   -116,483,018.00 AFN
 *
 * RTL visual order requested by the user:
 *   افغانی -116,483,018.00
 *
 * For RTL reports, the currency is written first in the embedded visual
 * sequence, placing the currency on the left and the number on the right.
 */
const LTR_EMBEDDING = '\u202A';
const POP_DIRECTIONAL_FORMATTING = '\u202C';
const MONEY_SPACE = '\u00A0';

function keepMoneyValueFirst(amount, currencyLabel = '') {
  const numberText = String(amount ?? '0');
  const labelText = String(currencyLabel || '').trim();

  if (!labelText) {
    return `${LTR_EMBEDDING}${numberText}${POP_DIRECTIONAL_FORMATTING}`;
  }

  if (t('dir') === 'rtl') {
    return `${LTR_EMBEDDING}${labelText}${MONEY_SPACE}${numberText}${POP_DIRECTIONAL_FORMATTING}`;
  }

  return `${LTR_EMBEDDING}${numberText}${MONEY_SPACE}${labelText}${POP_DIRECTIONAL_FORMATTING}`;
}

function stripDirectionalFormatting(value) {
  return String(value ?? '').replace(
    /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,
    '',
  );
}

function formatMoney(value, currency) {
  const amount = formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });

  return keepMoneyValueFirst(
    amount,
    currency ? t(currency) : '',
  );
}

/*
 * Monetary table cells are drawn manually instead of being passed to
 * autoTable as mixed RTL/LTR text. This gives every PDF table the same
 * deterministic layout used by the Sales summary:
 *
 * RTL visual layout:  currency   117,350,116.87
 * LTR visual layout:  117,350,116.87   currency
 */
function createMoneyCell(
  amount,
  currency,
  {
    showZero = true,
    emptyText = '',
  } = {},
) {
  const numericAmount = Number(amount || 0);

  if (!showZero && numericAmount === 0) {
    return emptyText;
  }

  return {
    content: '',
    moneyLines: [
      {
        amount: numericAmount,
        currency: normalizeCurrencyCode(currency),
      },
    ],
  };
}

function createMoneyMapCell(
  values,
  {
    emptyText = '0',
  } = {},
) {
  const moneyLines = Object.entries(
    values && typeof values === 'object'
      ? values
      : {},
  ).map(([currency, amount]) => ({
    amount: Number(amount || 0),
    currency: normalizeCurrencyCode(currency),
  }));

  if (!moneyLines.length) {
    return emptyText;
  }

  return {
    content: '',
    moneyLines,
  };
}

function createAccountBalancesMoneyCell(account) {
  if (!account?.computedBalances) return '-';

  const values = {};

  Object.entries(account.computedBalances).forEach(
    ([currency, value]) => {
      values[currency] =
        Number(value?.credit || 0) -
        Number(value?.debit || 0);
    },
  );

  return createMoneyMapCell(values, {
    emptyText: '-',
  });
}

function isMoneyTableCell(raw) {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      Array.isArray(raw.moneyLines) &&
      raw.moneyLines.length,
  );
}

/*
 * Details cells for Sale/Purchase reports are also drawn manually.
 * This avoids jsPDF/autoTable reordering mixed Dari and invoice-number
 * fragments or clipping the leading "اسم:" label.
 */
function createSalesPurchaseDetailCell({
  partyName = '',
  billNumber = '',
  description = '',
} = {}) {
  return {
    content: '',
    detailCell: {
      partyName: String(partyName || '').trim(),
      billNumber: String(billNumber || '').trim(),
      description: String(description || '').trim(),
      descriptionLines: [],
    },
  };
}

function isSalesPurchaseDetailCell(raw) {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      raw.detailCell &&
      typeof raw.detailCell === 'object',
  );
}

function drawSalesPurchaseDetailCell(doc, data, rtl) {
  const raw = data?.cell?.raw;

  if (!isSalesPurchaseDetailCell(raw)) return;

  const cell = data.cell;
  const detail = raw.detailCell;
  const partyName = String(detail.partyName || '').trim();
  const billNumber = String(detail.billNumber || '').trim();
  const description = String(detail.description || '').trim();
  const padding = 2;
  const maximumWidth = Math.max(8, cell.width - padding * 2);

  let primaryFontSize = Math.min(
    8.8,
    Number(cell.styles.fontSize || 8.8),
  );
  const minimumPrimaryFontSize = 6.3;

  const nameLabel = t('Lang') === 'en' ? 'Name' : 'اسم';
  const billLabel = t('Lang') === 'en' ? 'Bill' : 'بل';
  const labelColon = ':';

  function setPrimaryFont(style = 'normal') {
    doc.setFont(FONT_NAME, style);
    doc.setFontSize(primaryFontSize);
  }

  function getSegmentWidth(text, style = 'normal') {
    setPrimaryFont(style);
    return doc.getTextWidth(String(text || ''));
  }

  function getPrimaryWidth() {
    if (rtl) {
      let width = 0;

      if (partyName) {
        width += getSegmentWidth(nameLabel, 'bold');
        width += getSegmentWidth(labelColon, 'bold');
        width += getSegmentWidth(' ');
        width += getSegmentWidth(partyName);
      }

      if (partyName && billNumber) {
        width += getSegmentWidth(' _ ');
      }

      if (billNumber) {
        width += getSegmentWidth(billLabel, 'bold');
        width += getSegmentWidth(labelColon, 'bold');
        width += getSegmentWidth(' ');
        width += getSegmentWidth(billNumber, 'bold');
      }

      return width;
    }

    const primaryText = [
      partyName ? `${nameLabel}: ${partyName}` : '',
      billNumber ? `${billLabel}: ${billNumber}` : '',
    ]
      .filter(Boolean)
      .join(' _ ');

    return getSegmentWidth(primaryText);
  }

  while (
    primaryFontSize > minimumPrimaryFontSize &&
    getPrimaryWidth() > maximumWidth
  ) {
    primaryFontSize -= 0.25;
  }

  const firstLineY = cell.y + 4.7;
  doc.setTextColor(...PDF_THEME.text);

  if (rtl) {
    /*
     * Draw each fragment separately from the right edge. The resulting
     * visual line is always:
     *
     * اسم: Customer name _ بل : INV-12
     */
    let cursorRight = cell.x + cell.width - padding;

    if (partyName) {
      /*
       * Draw the RTL label word and colon as separate fragments.
       * This guarantees the visual order "اسم:" instead of letting
       * the bidi algorithm move the colon to the wrong side.
       */
      setPrimaryFont('bold');
      doc.text(nameLabel, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(nameLabel, 'bold');

      doc.text(labelColon, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(labelColon, 'bold');

      cursorRight -= getSegmentWidth(' ');

      setPrimaryFont('normal');
      doc.text(partyName, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(partyName);
    }

    if (partyName && billNumber) {
      const separator = ' _ ';
      setPrimaryFont('normal');
      doc.text(separator, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(separator);
    }

    if (billNumber) {
      /* Keep the colon physically after "بل": بل: INV-12 */
      setPrimaryFont('bold');
      doc.text(billLabel, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(billLabel, 'bold');

      doc.text(labelColon, cursorRight, firstLineY, {
        align: 'right',
      });
      cursorRight -= getSegmentWidth(labelColon, 'bold');

      cursorRight -= getSegmentWidth(' ');

      const billWidth = getSegmentWidth(billNumber, 'bold');
      setPrimaryFont('bold');
      doc.text(
        billNumber,
        cursorRight - billWidth,
        firstLineY,
        {
          align: 'left',
        },
      );
    }
  } else {
    const primaryText = [
      partyName ? `${nameLabel}: ${partyName}` : '',
      billNumber ? `${billLabel}: ${billNumber}` : '',
    ]
      .filter(Boolean)
      .join(' _ ');

    setPrimaryFont('normal');
    doc.text(
      primaryText,
      cell.x + padding,
      firstLineY,
      {
        align: 'left',
      },
    );
  }

  if (!description) return;

  const descriptionLines = Array.isArray(detail.descriptionLines) &&
    detail.descriptionLines.length
    ? detail.descriptionLines
    : [description];

  doc.setFont(FONT_NAME, 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...PDF_THEME.muted);

  descriptionLines.slice(0, 2).forEach((line, lineIndex) => {
    doc.text(
      String(line),
      rtl
        ? cell.x + cell.width - padding
        : cell.x + padding,
      firstLineY + 4.15 + lineIndex * 3.65,
      {
        align: rtl ? 'right' : 'left',
      },
    );
  });
}

function formatShamsiNumericDateForPDF(value) {
  if (!value) return '-';

  try {
    const parts = showDate(value, 'forPDF');

    /*
     * showDate(..., 'forPDF') returns:
     * [year, month, day]
     */
    if (
      Array.isArray(parts) &&
      parts.length >= 3
    ) {
      const year = String(
        toLatinDigits(parts[0]),
      );

      const month = String(
        toLatinDigits(parts[1]),
      ).padStart(2, '0');

      const day = String(
        toLatinDigits(parts[2]),
      ).padStart(2, '0');

      /*
       * Force physical left-to-right order:
       * 1405-03-18
       */
      return `${LTR_EMBEDDING}${year}-${month}-${day}${POP_DIRECTIONAL_FORMATTING}`;
    }
  } catch (error) {
    console.warn(
      'Could not format numeric Hijri Shamsi PDF date:',
      value,
      error,
    );
  }

  return '-';
}

function formatDateForPDF(value) {
  return formatShamsiNumericDateForPDF(value);
}

function formatGregorianDateForPDF(value) {
  if (!value) return '-';

  const rawValue = String(value).trim();

  const isoDateMatch = rawValue.match(
    /^(\d{4})-(\d{2})-(\d{2})/,
  );

  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');

  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDualDateForPDF(value) {
  if (!value) return '-';

  const shamsiDate =
    formatShamsiNumericDateForPDF(value);

  const gregorianDate =
    `${LTR_EMBEDDING}${formatGregorianDateForPDF(value)}${POP_DIRECTIONAL_FORMATTING}`;

  return `${shamsiDate}\n${gregorianDate}`;
}

function toLatinDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
    )
    .replace(/[٠-٩]/g, (digit) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)),
    );
}

function localizeDateDigits(value) {
  return String(value ?? '');
}

function formatReadableDateForPDF(value) {
  /*
   * Keep every Hijri Shamsi date numeric.
   * This also affects report date ranges.
   */
  return formatShamsiNumericDateForPDF(value);
}

function formatDateRange(fromDate, toDate) {
  const from = fromDate
    ? formatReadableDateForPDF(fromDate)
    : '';

  const to = toDate
    ? formatReadableDateForPDF(toDate)
    : '';

  /*
   * Never show "All" for a missing date.
   *
   * From + To:  ۶ اسد ۱۴۰۵ - ۱۰ اسد ۱۴۰۵
   * From only:  ۶ اسد ۱۴۰۵
   * To only:    ۱۰ اسد ۱۴۰۵
   * No dates:   empty subtitle
   */
  if (from && to) {
    return `${from} - ${to}`;
  }

  return from || to || '';
}

function getAccountName(account) {
  if (!account) return '';

  if (account.code === 'PAYABLE' || account.code === 'RECEIVABLE') {
    return '';
  }

  if (t('Lang') === 'en') {
    return account.name || account.name_fa || account.name_ps || '';
  }

  if (t('Lang') === 'ps') {
    return account.name_ps || account.name_fa || account.name || '';
  }

  return account.name_fa || account.name || account.name_ps || '';
}

function getAccountTypeName(accountTypeId) {
  return getAccountName(
    account_types.find(
      (accountType) => Number(accountType.id) === Number(accountTypeId),
    ),
  );
}

function getAccountGroupName(accountGroupId) {
  const group = account_groups.find(
    (accountGroup) => Number(accountGroup.id) === Number(accountGroupId),
  );

  if (!group) return '';

  if (t('Lang') === 'en') {
    return group.name || group.name_fa || group.name_ps || '';
  }

  if (t('Lang') === 'ps') {
    return group.name_ps || group.name_fa || group.name || '';
  }

  return group.name_fa || group.name || group.name_ps || '';
}

function getUnitName(unitId) {
  const unit = units.find(
    (item) => Number(item.id) === Number(unitId),
  );

  if (!unit) return '';

  if (t('Lang') === 'en') {
    return unit.name || unit.name_fa || unit.name_ps || '';
  }

  if (t('Lang') === 'ps') {
    return unit.name_ps || unit.name_fa || unit.name || '';
  }

  return unit.name_fa || unit.name || unit.name_ps || '';
}

function formatCurrencyMap(values, separator = '\n') {
  if (!values || typeof values !== 'object') return '0';

  const rows = Object.entries(values).map(
    ([currency, amount]) =>
      keepMoneyValueFirst(
        formatNumber(amount, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3,
        }),
        t(currency),
      ),
  );

  return rows.length ? rows.join(separator) : '0';
}

function formatBalanceArray(values, key) {
  return normalizeItems(values)
    .map((item) => {
      let amount = 0;

      if (key === 'debit') {
        amount = Number(item.debit || 0);
      } else if (key === 'credit') {
        amount = Number(item.credit || 0);
      } else {
        amount =
          Number(item.credit || 0) -
          Number(item.debit || 0);
      }

      return formatMoney(
        amount,
        item.currency || item.code,
      );
    })
    .join(' | ');
}

function showBalances(account) {
  if (!account?.computedBalances) return '-';

  return Object.entries(account.computedBalances)
    .map(([currency, value]) =>
      formatMoney(
        Number(value.credit || 0) -
          Number(value.debit || 0),
        currency,
      ),
    )
    .join('\n');
}

function createRunningBalanceFormatter() {
  const balances = {};

  return {
    add(currency, value) {
      const code = currency || 'AFN';
      balances[code] =
        Number(balances[code] || 0) + Number(value || 0);

      return { ...balances };
    },

    get() {
      return { ...balances };
    },
  };
}

async function loadThings() {
  const [
    loadedAccountTypes,
    loadedAccountGroups,
    loadedAccounts,
    loadedUnits,
    settings,
  ] = await Promise.all([
    Promise.all([
      accountTypeApi.getAll({ status: 1 }),
      accountTypeApi.getAll({ status: 0 }),
    ]).then(([a, d]) => [
      ...(a?.data || []),
      ...(d?.data || []),
    ]),
    Promise.all([
      accountGroupApi.getAll({ status: 1 }),
      accountGroupApi.getAll({ status: 0 }),
    ]).then(([active, deleted]) => [
      ...(active?.data || []),
      ...(deleted?.data || []),
    ]),
    accountApi.getAll({ status: 1 }).then((r) => r?.data || []),
    productUnitApi.getAll({ status: 1 }).then((r) => r?.data || []),
    settingsApi.getAll({ status: 1 }).then((r) => r?.data || []),
  ]);

  account_types = loadedAccountTypes;
  account_groups = loadedAccountGroups;
  accounts = loadedAccounts;
  units = loadedUnits;

  company = {
    name:
      settings.find((setting) => setting.key === 'company_name')
        ?.value || '',
    phone:
      settings.find((setting) => setting.key === 'company_phone')
        ?.value || '',
    phone2:
      settings.find((setting) => setting.key === 'company_phone2')
        ?.value || '',
    email:
      settings.find((setting) => setting.key === 'company_email')
        ?.value || '',
    address:
      settings.find((setting) => setting.key === 'company_address')
        ?.value || '',
    logo:
      settings.find((setting) => setting.key === 'company_logo')
        ?.value || '',
  };
}

async function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }

  return btoa(binary);
}

async function getFontCache() {
  if (fontCache) return fontCache;

  const [regularResponse, boldResponse] = await Promise.all([
    fetch(vazirTTF),
    fetch(vazirBoldTTF),
  ]);

  if (!regularResponse.ok || !boldResponse.ok) {
    throw new Error('Could not load the PDF fonts.');
  }

  const [regularBuffer, boldBuffer] = await Promise.all([
    regularResponse.arrayBuffer(),
    boldResponse.arrayBuffer(),
  ]);

  fontCache = {
    regular: await arrayBufferToBase64(regularBuffer),
    bold: await arrayBufferToBase64(boldBuffer),
  };

  return fontCache;
}

async function loadFont(doc) {
  const fonts = await getFontCache();

  doc.addFileToVFS(REGULAR_FONT_FILE, fonts.regular);
  doc.addFont(
    REGULAR_FONT_FILE,
    FONT_NAME,
    'normal',
  );

  doc.addFileToVFS(BOLD_FONT_FILE, fonts.bold);
  doc.addFont(
    BOLD_FONT_FILE,
    FONT_NAME,
    'bold',
  );

  doc.setFont(FONT_NAME, 'normal');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);

    image.onerror = () => {
      reject(
        new Error(`Failed to load image: ${src}`),
      );
    };

    /*
     * This uses the same public URL as:
     *
     * <img src="/img/logo.png" alt="ZENO ERP" />
     */
    image.src = src;
  });
}

async function getSystemLogoCache() {
  if (systemLogoCache) {
    return systemLogoCache;
  }

  try {
    systemLogoCache = await loadImage(
      systemLogoPNG,
    );
  } catch (error) {
    console.warn(
      'Could not load the system logo image:',
      error,
    );

    systemLogoCache = null;
  }

  return systemLogoCache;
}

async function drawCompactSystemLogo(
  doc,
  x,
  y,
  size,
) {
  const systemLogo =
    await getSystemLogoCache();

  drawRoundedRect(
    doc,
    x,
    y,
    size,
    size,
    1.8,
    PDF_THEME.white,
    PDF_THEME.border,
  );

  if (systemLogo) {
    try {
      doc.addImage(
        systemLogo,
        'PNG',
        x + 0.9,
        y + 0.9,
        size - 1.8,
        size - 1.8,
      );

      return;
    } catch (error) {
      console.warn(
        'Could not draw the compact system logo:',
        error,
      );
    }
  }

  doc.setFont(FONT_NAME, 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(
    ...PDF_THEME.primary,
  );

  doc.text(
    'Z',
    x + size / 2,
    y + size / 2 + 1.4,
    {
      align: 'center',
    },
  );
}

function resolveReportTitle(type) {
  const titles = {
    sales: t('Sales Report'),
    purchases: t('Purchase Report'),
    accounts: t('Accounts Report'),
    account_financial_report: t('Account Financial Report'),
    journals_report: t('Journals Report'),
    exchanges_report: t('Exchanges Report'),
    product_transactions: t('Product Transactions Report'),
    account_products_report: t('Account Products Report'),
    visitor_report: t('Visitor Report'),
  };

  return titles[type] || t('Report');
}

function resolveOrientation() {
  return 'portrait';
}

function resolveFileName(type) {
  const safeType = String(type || 'report')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const date = new Date().toISOString().slice(0, 10);

  return `ZenoERP-${safeType || 'report'}-${date}.pdf`;
}

function normalizePdfColor(
  color,
  fallback = PDF_THEME.white,
) {
  const source =
    Array.isArray(color) && color.length >= 3
      ? color
      : fallback;

  return source.slice(0, 3).map((channel) => {
    const value = Number(channel);

    if (!Number.isFinite(value)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(255, value),
    );
  });
}

function drawRoundedRect(
  doc,
  x,
  y,
  width,
  height,
  radius,
  fillColor,
  borderColor = fillColor,
) {
  const safeFillColor = normalizePdfColor(
    fillColor,
    PDF_THEME.white,
  );

  const safeBorderColor = normalizePdfColor(
    borderColor,
    safeFillColor,
  );

  doc.setFillColor(...safeFillColor);
  doc.setDrawColor(...safeBorderColor);

  doc.roundedRect(
    x,
    y,
    width,
    height,
    radius,
    radius,
    'FD',
  );
}

function fitTextToWidth(
  doc,
  text,
  maxWidth,
  preferredSize,
  minimumSize = 7,
) {
  const value = String(text || '');
  let fontSize = preferredSize;

  doc.setFontSize(fontSize);

  while (
    fontSize > minimumSize &&
    doc.getTextWidth(value) > maxWidth
  ) {
    fontSize -= 0.35;
    doc.setFontSize(fontSize);
  }

  return fontSize;
}

function clampTextToWidth(doc, text, maxWidth) {
  const value = String(text || '');

  if (doc.getTextWidth(value) <= maxWidth) {
    return value;
  }

  let output = value;

  while (
    output.length > 1 &&
    doc.getTextWidth(`${output}...`) > maxWidth
  ) {
    output = output.slice(0, -1);
  }

  return `${output.trim()}...`;
}

function detectImageFormat(source) {
  const value = String(source || '').toLowerCase();

  if (
    value.startsWith('data:image/jpeg') ||
    value.startsWith('data:image/jpg') ||
    value.endsWith('.jpeg') ||
    value.endsWith('.jpg')
  ) {
    return 'JPEG';
  }

  if (
    value.startsWith('data:image/webp') ||
    value.endsWith('.webp')
  ) {
    return 'WEBP';
  }

  return 'PNG';
}

function createRoundedCanvasPath(
  context,
  x,
  y,
  width,
  height,
  radius,
) {
  const safeRadius = Math.min(
    Math.max(0, radius),
    width / 2,
    height / 2,
  );

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(
    x + width - safeRadius,
    y,
  );
  context.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + safeRadius,
  );
  context.lineTo(
    x + width,
    y + height - safeRadius,
  );
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(
    x + safeRadius,
    y + height,
  );
  context.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - safeRadius,
  );
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(
    x,
    y,
    x + safeRadius,
    y,
  );
  context.closePath();
}

async function createRoundedLogoData(
  source,
  cornerRadiusRatio = 0.24,
) {
  try {
    const image =
      typeof source === 'string'
        ? await loadImage(source)
        : source;

    if (
      !image ||
      !image.naturalWidth ||
      !image.naturalHeight
    ) {
      return null;
    }

    const canvasSize = 320;
    const canvas =
      document.createElement('canvas');

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    const context =
      canvas.getContext('2d');

    if (!context) return null;

    const sourceWidth =
      image.naturalWidth || image.width;
    const sourceHeight =
      image.naturalHeight || image.height;

    /*
     * Crop with "cover" behavior so rectangular logos do not stretch.
     */
    const sourceSize = Math.min(
      sourceWidth,
      sourceHeight,
    );
    const sourceX =
      (sourceWidth - sourceSize) / 2;
    const sourceY =
      (sourceHeight - sourceSize) / 2;

    context.save();

    createRoundedCanvasPath(
      context,
      0,
      0,
      canvasSize,
      canvasSize,
      canvasSize * cornerRadiusRatio,
    );

    context.clip();

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      canvasSize,
      canvasSize,
    );

    context.restore();

    return canvas.toDataURL(
      'image/png',
    );
  } catch (error) {
    console.warn(
      'Could not create the rounded PDF logo:',
      error,
    );

    return null;
  }
}

async function resolveHeaderLogo() {
  /*
   * Prefer the user's/company logo from settings.
   * If it is unavailable, use public/img/logo.png.
   */
  if (company.logo) {
    try {
      if (
        typeof company.logo === 'string' &&
        company.logo.startsWith('data:image/')
      ) {
        return {
          source: company.logo,
          format: detectImageFormat(company.logo),
        };
      }

      if (typeof company.logo === 'string') {
        return {
          source: await loadImage(company.logo),
          format: detectImageFormat(company.logo),
        };
      }

      return {
        source: company.logo,
        format: 'PNG',
      };
    } catch (error) {
      console.warn(
        'Could not load the company logo. Falling back to the system logo:',
        error,
      );
    }
  }

  const systemLogo =
    await getSystemLogoCache();

  if (!systemLogo) return null;

  return {
    source: systemLogo,
    format: 'PNG',
  };
}

async function drawMainHeader(
  doc,
  {
    pageWidth,
    margin,
    title,
    subtitle,
    rtl,
  },
) {
  /*
   * Clean borderless header:
   * - no outer border
   * - company name centered
   * - phone numbers removed from the header
   * - circular logo remains at the outer side
   * - report title/date remain on the opposite side
   */
  const headerY = 5;
  const headerHeight = 21.5;
  const headerX = margin;
  const headerWidth =
    pageWidth - margin * 2;

  /*
   * Soft background only. No stroke/border is drawn.
   */
  doc.setFillColor(
    ...PDF_THEME.primarySoft,
  );
  doc.roundedRect(
    headerX,
    headerY,
    headerWidth,
    headerHeight,
    3,
    3,
    'F',
  );

  const logoSize = 10.5;
  const logoX = rtl
    ? headerX +
      headerWidth -
      logoSize -
      3
    : headerX + 3;

  const logoY =
    headerY +
    (headerHeight - logoSize) / 2 +
    0.2;

  /*
   * Circular logo frame.
   */
  drawRoundedRect(
    doc,
    logoX,
    logoY,
    logoSize,
    logoSize,
    logoSize / 2,
    PDF_THEME.white,
    PDF_THEME.border,
  );

  const headerLogo =
    await resolveHeaderLogo();

  if (headerLogo) {
    try {
      const circularLogo =
        await createRoundedLogoData(
          headerLogo.source,
          0.5,
        );

      if (circularLogo) {
        doc.addImage(
          circularLogo,
          'PNG',
          logoX + 0.55,
          logoY + 0.55,
          logoSize - 1.1,
          logoSize - 1.1,
        );
      } else {
        doc.addImage(
          headerLogo.source,
          headerLogo.format,
          logoX + 0.75,
          logoY + 0.75,
          logoSize - 1.5,
          logoSize - 1.5,
        );
      }
    } catch (error) {
      console.warn(
        'Could not draw the circular PDF header logo:',
        error,
      );
    }
  } else {
    doc.setFont(
      FONT_NAME,
      'bold',
    );
    doc.setFontSize(7.5);
    doc.setTextColor(
      ...PDF_THEME.primary,
    );

    doc.text(
      'Z',
      logoX + logoSize / 2,
      logoY + logoSize / 2 + 1.3,
      {
        align: 'center',
      },
    );
  }

  /*
   * Company name is centered across the header.
   */
  const companyName =
    company.name || 'ZenoERP';

  const companyCenterX =
    headerX + headerWidth / 2;

  const companyTextWidth =
    headerWidth - 78;

  doc.setFont(
    FONT_NAME,
    'bold',
  );
  doc.setTextColor(
    ...PDF_THEME.ink,
  );

  doc.setFontSize(
    fitTextToWidth(
      doc,
      companyName,
      companyTextWidth,
      9.3,
      6.2,
    ),
  );

  doc.text(
    clampTextToWidth(
      doc,
      companyName,
      companyTextWidth,
    ),
    companyCenterX,
    headerY + 9.1,
    {
      align: 'center',
    },
  );

  /*
   * Address may remain below the centered company name.
   * Phone numbers are intentionally moved to the footer.
   */
  if (company.address) {
    doc.setFont(
      FONT_NAME,
      'normal',
    );
    doc.setFontSize(4.7);
    doc.setTextColor(
      ...PDF_THEME.muted,
    );

    doc.text(
      clampTextToWidth(
        doc,
        company.address,
        companyTextWidth,
      ),
      companyCenterX,
      headerY + 14.9,
      {
        align: 'center',
      },
    );
  }

  /*
   * Report information stays on the side opposite the logo.
   */
  const reportTextWidth = 38;

  const reportTextX = rtl
    ? headerX + 3.5
    : headerX + headerWidth - 3.5;

  const reportAlign = rtl
    ? 'left'
    : 'right';

  doc.setFont(
    FONT_NAME,
    'bold',
  );
  doc.setTextColor(
    ...PDF_THEME.ink,
  );

  doc.setFontSize(
    fitTextToWidth(
      doc,
      title,
      reportTextWidth,
      8.6,
      6.4,
    ),
  );

  doc.text(
    clampTextToWidth(
      doc,
      title,
      reportTextWidth,
    ),
    reportTextX,
    subtitle
      ? headerY + 8
      : headerY + 12.2,
    {
      align: reportAlign,
    },
  );

  if (subtitle) {
    doc.setFont(
      FONT_NAME,
      'bold',
    );

    doc.setFontSize(
      fitTextToWidth(
        doc,
        subtitle,
        reportTextWidth,
        5.9,
        4.7,
      ),
    );

    doc.setTextColor(
      ...PDF_THEME.text,
    );

    doc.text(
      clampTextToWidth(
        doc,
        subtitle,
        reportTextWidth,
      ),
      reportTextX,
      headerY + 14.4,
      {
        align: reportAlign,
      },
    );
  }

  return headerY + headerHeight;
}

function drawSectionTitle(
  doc,
  x,
  y,
  title,
  rtl,
) {
  /*
   * Minimal section heading inspired by a list icon:
   *
   * RTL:  [list icon]  جزئیات
   * LTR:  [list icon]  Details
   *
   * No pill, card, or colored background.
   */
  /*
   * Smaller, quieter list icon.
   */
  const iconWidth = 4.2;
  const iconHeight = 3.1;
  const iconX = rtl
    ? x - iconWidth
    : x;
  const iconY = y - iconHeight / 2;

  doc.setDrawColor(
    ...PDF_THEME.primary,
  );
  doc.setFillColor(
    ...PDF_THEME.primary,
  );
  doc.setLineWidth(0.38);

  const lineStartX = rtl
    ? iconX
    : iconX + 1.55;
  const lineEndX = rtl
    ? iconX + 3.45
    : iconX + iconWidth;

  const bulletX = rtl
    ? iconX + 4.55
    : iconX + 0.55;

  const lineYs = [
    iconY + 0.6,
    iconY + 2.05,
    iconY + 3.5,
  ];

  lineYs.forEach((lineY) => {
    doc.line(
      lineStartX,
      lineY,
      lineEndX,
      lineY,
    );

    doc.circle(
      bulletX,
      lineY,
      0.24,
      'F',
    );
  });

  doc.setFont(FONT_NAME, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PDF_THEME.ink);

  doc.text(
    title,
    rtl ? iconX - 2.1 : iconX + iconWidth + 2.1,
    y + 0.55,
    {
      align: rtl ? 'right' : 'left',
    },
  );
}

function drawMetricIcon(
  doc,
  {
    icon,
    x,
    y,
    size,
    accent,
    background,
  },
) {
  drawRoundedRect(
    doc,
    x,
    y,
    size,
    size,
    2.2,
    background,
    background,
  );

  const left = x + 2.2;
  const top = y + 2.2;
  const right = x + size - 2.2;
  const bottom = y + size - 2.2;
  const centerX = x + size / 2;
  const centerY = y + size / 2;

  doc.setDrawColor(...accent);
  doc.setTextColor(...accent);
  doc.setLineWidth(0.55);

  if (icon === 'chart') {
    doc.line(left, bottom, left, top);
    doc.line(left, bottom, right, bottom);
    doc.line(left + 0.8, bottom - 1.1, centerX - 0.2, centerY + 0.8);
    doc.line(centerX - 0.2, centerY + 0.8, right - 0.7, top + 0.8);
    doc.line(right - 0.7, top + 0.8, right - 2.2, top + 1.1);
    doc.line(right - 0.7, top + 0.8, right - 1, top + 2.25);
    return;
  }

  if (icon === 'coin') {
    doc.circle(centerX, centerY, size * 0.27, 'S');
    doc.circle(centerX, centerY, size * 0.19, 'S');

    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(5.6);
    doc.text(
      '$',
      centerX,
      centerY + 1.8,
      {
        align: 'center',
      },
    );
    return;
  }

  if (icon === 'wallet') {
    doc.roundedRect(
      left,
      top + 0.9,
      right - left,
      bottom - top - 0.9,
      1,
      1,
      'S',
    );

    doc.line(
      left + 1,
      top + 0.8,
      right - 1,
      top + 0.8,
    );

    doc.roundedRect(
      right - 3.4,
      centerY - 1.25,
      3.3,
      2.5,
      0.7,
      0.7,
      'S',
    );

    doc.circle(
      right - 2.3,
      centerY,
      0.25,
      'F',
    );
    return;
  }

  if (icon === 'receipt') {
    doc.roundedRect(
      left + 1,
      top,
      right - left - 2,
      bottom - top,
      0.8,
      0.8,
      'S',
    );

    doc.line(
      left + 2,
      top + 2,
      right - 2,
      top + 2,
    );
    doc.line(
      left + 2,
      centerY,
      right - 2,
      centerY,
    );
    doc.line(
      left + 2,
      bottom - 2,
      centerX,
      bottom - 2,
    );
    return;
  }

  if (icon === 'calendar') {
    doc.roundedRect(
      left,
      top + 1,
      right - left,
      bottom - top - 1,
      0.8,
      0.8,
      'S',
    );
    doc.line(
      left,
      top + 3,
      right,
      top + 3,
    );
    doc.line(
      left + 2,
      top,
      left + 2,
      top + 2,
    );
    doc.line(
      right - 2,
      top,
      right - 2,
      top + 2,
    );
    return;
  }

  if (icon === 'user') {
    doc.circle(
      centerX,
      top + 2.3,
      1.6,
      'S',
    );
    doc.roundedRect(
      centerX - 3,
      centerY + 0.2,
      6,
      3,
      1.5,
      1.5,
      'S',
    );
    return;
  }

  if (icon === 'box') {
    doc.line(
      centerX,
      top,
      right,
      top + 2.2,
    );
    doc.line(
      right,
      top + 2.2,
      right,
      bottom - 1,
    );
    doc.line(
      right,
      bottom - 1,
      centerX,
      bottom + 0.5,
    );
    doc.line(
      centerX,
      bottom + 0.5,
      left,
      bottom - 1,
    );
    doc.line(
      left,
      bottom - 1,
      left,
      top + 2.2,
    );
    doc.line(
      left,
      top + 2.2,
      centerX,
      top,
    );
    doc.line(
      centerX,
      top,
      centerX,
      bottom + 0.5,
    );
    doc.line(
      left,
      top + 2.2,
      centerX,
      top + 4.3,
    );
    doc.line(
      centerX,
      top + 4.3,
      right,
      top + 2.2,
    );
    return;
  }

  doc.circle(
    centerX,
    centerY,
    size * 0.24,
    'S',
  );
}

function normalizeCurrencyCode(value) {
  const currency = String(value || '')
    .trim()
    .toUpperCase();

  return currency || 'AFN';
}

function buildSalesCurrencySummary(
  items,
  totalAmount,
  benefitAmount,
) {
  const summary = new Map();

  function ensureCurrency(currencyValue) {
    const currency = normalizeCurrencyCode(
      currencyValue,
    );

    if (!summary.has(currency)) {
      summary.set(currency, {
        currency,
        totalSales: 0,
        saleCount: 0,
        benefit: 0,
      });
    }

    return summary.get(currency);
  }

  Object.entries(totalAmount || {}).forEach(
    ([currency, amount]) => {
      ensureCurrency(currency).totalSales =
        Number(amount || 0);
    },
  );

  normalizeItems(items).forEach((item) => {
    const row = ensureCurrency(
      item?.currency,
    );

    row.saleCount += 1;
  });

  Object.entries(benefitAmount || {}).forEach(
    ([currency, amount]) => {
      /*
       * Sales extraInfo is the benefit map. Ignore any accidental
       * non-numeric metadata so it does not become a fake currency.
       */
      if (
        amount === null ||
        amount === undefined ||
        amount === '' ||
        Number.isNaN(Number(amount))
      ) {
        return;
      }

      ensureCurrency(currency).benefit =
        Number(amount || 0);
    },
  );

  return Array.from(summary.values());
}

function getCurrencySummaryTone(currency) {
  const tones = {
    AFN: {
      accent: PDF_THEME.green,
      soft: PDF_THEME.greenSoft,
    },
    USD: {
      accent: PDF_THEME.primary,
      soft: PDF_THEME.primarySoft,
    },
    EUR: {
      accent: PDF_THEME.cyan,
      soft: PDF_THEME.cyanSoft,
    },
    AED: {
      accent: PDF_THEME.amber,
      soft: PDF_THEME.amberSoft,
    },
  };

  return tones[currency] || {
    accent: PDF_THEME.primary,
    soft: PDF_THEME.primarySoft,
  };
}

function getCurrencyDisplayName(currency) {
  const translated = t(currency);

  if (
    translated &&
    String(translated).trim() !== currency
  ) {
    return String(translated);
  }

  const names = {
    AFN: t('Afghani'),
    USD: t('US Dollar'),
    EUR: t('Euro'),
    AED: t('UAE Dirham'),
  };

  return names[currency] || currency;
}

function drawSalesSummaryMetric(
  doc,
  {
    x,
    y,
    width,
    height,
    label,
    value,
    icon,
    accent,
    rtl,
    isAmount = false,
    currency = '',
  },
) {
  /*
   * Compact ERP statistic section:
   * - outline icon only
   * - no icon background
   * - small muted label
   * - bold, highly scannable value
   */
  const sectionPadding = 3;
  const iconSize = 5.8;

  const iconX = x + sectionPadding;
  const iconY = y + (height - iconSize) / 2;

  /*
   * drawMetricIcon normally supports a colored background.
   * White makes that container visually disappear, leaving only
   * the colored outline icon.
   */
  drawMetricIcon(doc, {
    icon,
    x: iconX,
    y: iconY,
    size: iconSize,
    accent,
    background: PDF_THEME.white,
  });

  const textRightX =
    x + width - sectionPadding;
  const textWidth =
    width - iconSize - sectionPadding * 3;

  doc.setFont(FONT_NAME, 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(...PDF_THEME.muted);

  doc.text(
    clampTextToWidth(
      doc,
      String(label || ''),
      textWidth,
    ),
    textRightX,
    y + 4.35,
    {
      align: rtl ? 'right' : 'left',
    },
  );

  if (isAmount) {
    drawIsolatedAmountCurrency(doc, {
      amount: value,
      currency,
      x: textRightX,
      y: y + 9.65,
      maxWidth: textWidth,
      align: rtl ? 'right' : 'left',
    });

    return;
  }

  const valueText = String(value || '0');

  doc.setFont(FONT_NAME, 'bold');
  doc.setTextColor(...PDF_THEME.ink);
  doc.setFontSize(
    fitTextToWidth(
      doc,
      valueText,
      textWidth,
      8.2,
      5.8,
    ),
  );

  doc.text(
    clampTextToWidth(
      doc,
      valueText,
      textWidth,
    ),
    textRightX,
    y + 9.65,
    {
      align: rtl ? 'right' : 'left',
    },
  );
}

function drawIsolatedAmountCurrency(
  doc,
  {
    amount,
    currency,
    x,
    y,
    maxWidth,
    align = 'right',
    numberColor = PDF_THEME.ink,
    currencyColor = PDF_THEME.text,
    preferredNumberFontSize = 8.2,
    minimumNumberFontSize = 5.8,
    currencyFontSize = 5.4,
    gap = 1.25,
  },
) {
  /*
   * jsPDF does not support CSS direction rules. Draw the number and
   * currency separately so their physical positions are deterministic.
   *
   * LTR:  -116,483,018.00 AFN
   * RTL:  افغانی -116,483,018.00
   */
  const numberText = formatNumber(amount, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const currencyText =
    t(currency || '') || currency || '';

  let numberFontSize = preferredNumberFontSize;

  doc.setFont(FONT_NAME, 'bold');
  doc.setFontSize(numberFontSize);

  let numberWidth =
    doc.getTextWidth(numberText);

  doc.setFont(FONT_NAME, 'normal');
  doc.setFontSize(currencyFontSize);

  const currencyWidth =
    doc.getTextWidth(currencyText);

  while (
    numberFontSize > minimumNumberFontSize &&
    numberWidth + gap + currencyWidth >
      maxWidth
  ) {
    numberFontSize -= 0.3;

    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(numberFontSize);
    numberWidth =
      doc.getTextWidth(numberText);
  }

  const totalWidth =
    numberWidth + gap + currencyWidth;

  const startX =
    align === 'right'
      ? x - totalWidth
      : align === 'center'
        ? x - totalWidth / 2
        : x;

  const rtlMoney = t('dir') === 'rtl';

  const numberX = rtlMoney
    ? startX + currencyWidth + gap
    : startX;

  const currencyX = rtlMoney
    ? startX
    : startX + numberWidth + gap;

  /*
   * Draw the number as a standalone LTR fragment. This keeps a negative
   * sign attached to the number and preserves comma/decimal ordering.
   */
  doc.setFont(FONT_NAME, 'bold');
  doc.setFontSize(numberFontSize);
  doc.setTextColor(...numberColor);

  doc.text(
    numberText,
    numberX,
    y,
    {
      align: 'left',
    },
  );

  doc.setFont(FONT_NAME, 'normal');
  doc.setFontSize(currencyFontSize);
  doc.setTextColor(...currencyColor);

  doc.text(
    currencyText,
    currencyX,
    y,
    {
      align: 'left',
    },
  );
}

function drawMoneyTableCell(doc, data) {
  const raw = data?.cell?.raw;

  if (!isMoneyTableCell(raw)) return;

  const lines = raw.moneyLines;
  const cell = data.cell;
  const tableFontSize = Number(
    cell.styles.fontSize || 7,
  );

  const lineHeight =
    tableFontSize <= 6
      ? 3.35
      : 3.85;

  const totalHeight =
    lines.length * lineHeight;

  const firstBaseline =
    cell.y +
    (cell.height - totalHeight) / 2 +
    lineHeight * 0.78;

  const baseTextColor = Array.isArray(
    cell.styles.textColor,
  )
    ? cell.styles.textColor
    : PDF_THEME.text;

  lines.forEach((line, lineIndex) => {
    const negative = Number(line.amount || 0) < 0;

    drawIsolatedAmountCurrency(doc, {
      amount: line.amount,
      currency: line.currency,
      x: cell.x + cell.width / 2,
      y: firstBaseline + lineIndex * lineHeight,
      maxWidth: Math.max(6, cell.width - 3),
      align: 'center',
      numberColor: negative
        ? PDF_THEME.red
        : baseTextColor,
      currencyColor: baseTextColor,
      preferredNumberFontSize:
        tableFontSize <= 7
          ? 6.6
          : 7.8,
      minimumNumberFontSize:
        tableFontSize <= 7
          ? 4.6
          : 5.4,
      currencyFontSize:
        tableFontSize <= 7
          ? 4.4
          : 5.2,
      gap: 0.9,
    });
  });
}

function drawSalesCurrencySummary(
  doc,
  {
    items,
    totalAmount,
    benefitAmount,
    startY,
    pageWidth,
    margin,
    rtl,
  },
) {
  const currencyRows =
    buildSalesCurrencySummary(
      items,
      totalAmount,
      benefitAmount,
    );

  if (!currencyRows.length) {
    return startY;
  }

  /*
   * Table-style currency summary:
   * - headings are rendered once
   * - each currency is one numbered data row
   * - separators are drawn after row backgrounds so they remain
   *   visible on alternating rows
   *
   * RTL visual order:
   * Cashbox | Sales | Total Sales | Currency | #
   */
  const headerHeight = 8.2;
  const rowHeight = 9.8;
  const totalWidth =
    pageWidth - margin * 2;
  const totalHeight =
    headerHeight +
    currencyRows.length * rowHeight;

  const numberWidth = 10;
  const currencyWidth = 22;
  const salesCountWidth = 24;
  const remainingWidth =
    totalWidth -
    numberWidth -
    currencyWidth -
    salesCountWidth;
  const totalSalesWidth =
    remainingWidth / 2;
  const cashboxWidth =
    remainingWidth / 2;

  const cashboxLabel =
    t('Lang') === 'en'
      ? 'Cashbox'
      : 'صندوق';

  /*
   * Full #367588 summary surface with square corners.
   * No border radius is used for this section.
   */
  doc.setFillColor(
    ...PDF_THEME.primary,
  );
  doc.setDrawColor(
    ...PDF_THEME.primary,
  );
  doc.rect(
    margin,
    startY,
    totalWidth,
    totalHeight,
    'FD',
  );

  /*
   * Columns are defined in their visual left-to-right order.
   */
  const displayedColumns = rtl
    ? [
        {
          key: 'cashbox',
          label: cashboxLabel,
          width: cashboxWidth,
        },
        {
          key: 'sales',
          label: t('Sales'),
          width: salesCountWidth,
        },
        {
          key: 'totalSales',
          label: t('Total Sales'),
          width: totalSalesWidth,
        },
        {
          key: 'currency',
          label: t('Currency'),
          width: currencyWidth,
        },
        {
          key: 'number',
          label: '#',
          width: numberWidth,
        },
      ]
    : [
        {
          key: 'number',
          label: '#',
          width: numberWidth,
        },
        {
          key: 'currency',
          label: t('Currency'),
          width: currencyWidth,
        },
        {
          key: 'totalSales',
          label: t('Total Sales'),
          width: totalSalesWidth,
        },
        {
          key: 'sales',
          label: t('Sales'),
          width: salesCountWidth,
        },
        {
          key: 'cashbox',
          label: cashboxLabel,
          width: cashboxWidth,
        },
      ];

  let currentX = margin;

  displayedColumns.forEach((column) => {
    column.x = currentX;
    currentX += column.width;
  });

  /*
   * Square header background.
   */
  doc.setFillColor(
    ...PDF_THEME.primaryDark,
  );
  doc.setDrawColor(
    ...PDF_THEME.primaryDark,
  );
  doc.rect(
    margin,
    startY,
    totalWidth,
    headerHeight,
    'FD',
  );

  displayedColumns.forEach((column) => {
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(...PDF_THEME.white);

    doc.text(
      clampTextToWidth(
        doc,
        String(column.label || ''),
        column.width - 3,
      ),
      column.x + column.width / 2,
      startY + 5.25,
      {
        align: 'center',
      },
    );
  });

  currencyRows.forEach(
    (summary, rowIndex) => {
      const rowY =
        startY +
        headerHeight +
        rowIndex * rowHeight;

      doc.setFillColor(
        ...PDF_THEME.primary,
      );
      doc.rect(
        margin,
        rowY,
        totalWidth,
        rowHeight,
        'F',
      );

      displayedColumns.forEach(
        (column) => {
          const centerX =
            column.x +
            column.width / 2;
          const centerY =
            rowY + 6.35;

          if (column.key === 'number') {
            doc.setFont(FONT_NAME, 'bold');
            doc.setFontSize(6.6);
            doc.setTextColor(...PDF_THEME.white);
            doc.text(
              String(rowIndex + 1),
              centerX,
              centerY,
              {
                align: 'center',
              },
            );
            return;
          }

          if (column.key === 'currency') {
            doc.setFont(FONT_NAME, 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(...PDF_THEME.white);
            doc.text(
              summary.currency,
              centerX,
              rowY + 4.1,
              {
                align: 'center',
              },
            );

            doc.setFont(FONT_NAME, 'normal');
            doc.setFontSize(4.2);
            doc.setTextColor(...PDF_THEME.primarySoft);
            doc.text(
              clampTextToWidth(
                doc,
                getCurrencyDisplayName(
                  summary.currency,
                ),
                column.width - 4,
              ),
              centerX,
              rowY + 7.5,
              {
                align: 'center',
              },
            );
            return;
          }

          if (column.key === 'sales') {
            const valueText = String(
              summary.saleCount || 0,
            );

            doc.setFont(FONT_NAME, 'bold');
            doc.setFontSize(
              fitTextToWidth(
                doc,
                valueText,
                column.width - 5,
                7.6,
                5.8,
              ),
            );
            doc.setTextColor(...PDF_THEME.white);
            doc.text(
              valueText,
              centerX,
              centerY,
              {
                align: 'center',
              },
            );
            return;
          }

          const amount =
            column.key === 'totalSales'
              ? summary.totalSales
              : summary.benefit;

          drawIsolatedAmountCurrency(
            doc,
            {
              amount,
              currency: summary.currency,
              x: centerX,
              y: centerY,
              maxWidth: column.width - 5,
              align: 'center',
              numberColor: PDF_THEME.white,
              currencyColor: PDF_THEME.primarySoft,
            },
          );
        },
      );
    },
  );

  /*
   * Draw separators last. Alternating row backgrounds can no longer
   * cover the vertical lines, so every row remains clearly divided.
   */
  doc.setDrawColor(
    ...PDF_THEME.primarySoft,
  );
  doc.setLineWidth(0.14);

  displayedColumns.forEach(
    (column, index) => {
      if (index === displayedColumns.length - 1) {
        return;
      }

      const separatorX =
        column.x + column.width;

      doc.line(
        separatorX,
        startY + 1.2,
        separatorX,
        startY + totalHeight - 1.2,
      );
    },
  );

  for (
    let rowIndex = 0;
    rowIndex < currencyRows.length;
    rowIndex += 1
  ) {
    const separatorY =
      startY +
      headerHeight +
      rowIndex * rowHeight;

    doc.line(margin + 1.5, separatorY, margin + totalWidth - 1.5, separatorY);
  }

  return startY + totalHeight;
}

function drawMetricCards(
  doc,
  {
    metrics,
    startY,
    pageWidth,
    margin,
    rtl,
  },
) {
  /*
   * Unified flat summary used by every non-sales PDF report.
   *
   * It intentionally follows the Sales Report summary style:
   * - square corners
   * - dark teal heading row
   * - teal value row
   * - white text
   * - thin visible separators
   * - no rounded cards, icon boxes, shadows, or gaps
   *
   * The function name is kept as drawMetricCards so the existing
   * generatePDF() call does not need to change.
   */
  const visibleMetrics = normalizeItems(metrics).filter(
    (metric) =>
      metric &&
      metric.value !== undefined &&
      metric.value !== null &&
      String(metric.value).trim() !== '',
  );

  if (!visibleMetrics.length) {
    return startY;
  }

  const displayedMetrics = rtl
    ? [...visibleMetrics].reverse()
    : visibleMetrics;

  const totalWidth =
    pageWidth - margin * 2;

  const columnWidth =
    totalWidth / displayedMetrics.length;

  const headerHeight = 8.2;

  /*
   * More columns require a slightly smaller type size. Landscape
   * reports can therefore show seven or eight summary fields in one
   * clean row without creating a second card row.
   */
  const preferredValueFontSize =
    displayedMetrics.length <= 4
      ? 8.2
      : displayedMetrics.length <= 6
        ? 7.1
        : 6.2;

  const minimumValueFontSize =
    displayedMetrics.length <= 4
      ? 5.6
      : 4.8;

  const preparedMetrics = displayedMetrics.map(
    (metric) => {
      const rawValue = String(
        metric.value ?? '0',
      ).trim();

      /*
       * Currency maps are usually separated with " | ". Keep each
       * currency on its own line, then wrap other long content such as
       * account names and date ranges inside its column.
       */
      const explicitLines = rawValue
        .split(/\s*\|\s*|\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

      const sourceLines = explicitLines.length
        ? explicitLines
        : ['0'];

      let fontSize = preferredValueFontSize;
      let lines = [];

      while (fontSize >= minimumValueFontSize) {
        doc.setFont(FONT_NAME, 'bold');
        doc.setFontSize(fontSize);

        lines = sourceLines.flatMap(
          (line) =>
            doc.splitTextToSize(
              line,
              Math.max(8, columnWidth - 4.5),
            ),
        );

        if (lines.length <= 3) {
          break;
        }

        fontSize -= 0.35;
      }

      if (lines.length > 3) {
        const firstTwo = lines.slice(0, 2);
        const finalLine = clampTextToWidth(
          doc,
          lines.slice(2).join(' '),
          Math.max(8, columnWidth - 4.5),
        );

        lines = [...firstTwo, finalLine];
      }

      return {
        ...metric,
        fontSize,
        lines,
      };
    },
  );

  const maximumLineCount = Math.max(
    1,
    ...preparedMetrics.map(
      (metric) => metric.lines.length,
    ),
  );

  const lineHeight = 4.3;
  const valueRowHeight = Math.max(
    10.8,
    5.1 + maximumLineCount * lineHeight,
  );

  const totalHeight =
    headerHeight + valueRowHeight;

  /* Full square summary surface. */
  doc.setFillColor(...PDF_THEME.primary);
  doc.setDrawColor(...PDF_THEME.primary);
  doc.rect(
    margin,
    startY,
    totalWidth,
    totalHeight,
    'FD',
  );

  /* Square heading row, matching the Sales Report. */
  doc.setFillColor(...PDF_THEME.primaryDark);
  doc.setDrawColor(...PDF_THEME.primaryDark);
  doc.rect(
    margin,
    startY,
    totalWidth,
    headerHeight,
    'FD',
  );

  preparedMetrics.forEach(
    (metric, index) => {
      const columnX =
        margin + index * columnWidth;

      const centerX =
        columnX + columnWidth / 2;

      /* Heading. */
      const labelText = String(
        metric.label || '',
      );

      doc.setFont(FONT_NAME, 'bold');
      doc.setTextColor(...PDF_THEME.white);
      doc.setFontSize(
        fitTextToWidth(
          doc,
          labelText,
          Math.max(8, columnWidth - 4),
          displayedMetrics.length <= 5
            ? 5.9
            : 5.2,
          4.1,
        ),
      );

      doc.text(
        clampTextToWidth(
          doc,
          labelText,
          Math.max(8, columnWidth - 4),
        ),
        centerX,
        startY + 5.25,
        {
          align: 'center',
        },
      );

      /* Value, vertically centered in the teal body row. */
      doc.setFont(FONT_NAME, 'bold');
      doc.setFontSize(metric.fontSize);
      doc.setTextColor(...PDF_THEME.white);

      const blockHeight =
        metric.lines.length * lineHeight;

      const firstBaseline =
        startY +
        headerHeight +
        (valueRowHeight - blockHeight) / 2 +
        lineHeight * 0.78;

      metric.lines.forEach(
        (line, lineIndex) => {
          doc.text(
            String(line),
            centerX,
            firstBaseline +
              lineIndex * lineHeight,
            {
              align: 'center',
            },
          );
        },
      );
    },
  );

  /* Draw separators last so they stay visible above all fills. */
  doc.setDrawColor(...PDF_THEME.primarySoft);
  doc.setLineWidth(0.14);

  doc.line(
    margin + 1.5,
    startY + headerHeight,
    margin + totalWidth - 1.5,
    startY + headerHeight,
  );

  for (
    let index = 1;
    index < preparedMetrics.length;
    index += 1
  ) {
    const separatorX =
      margin + index * columnWidth;

    doc.line(
      separatorX,
      startY + 1.2,
      separatorX,
      startY + totalHeight - 1.2,
    );
  }

  return startY + totalHeight;
}

function buildReportMetrics({
  type,
  filteredItems,
  fromDate,
  toDate,
  length,
  totalAmount,
  extraInfo,
}) {
  const dateRange = formatDateRange(
    fromDate,
    toDate,
  );

  if (type === 'accounts') {
    return [
      {
        label: t('Accounts'),
        value: String(length),
        tone: 'blue',
        icon: 'user',
      },
      {
        label: t('Debit'),
        icon: 'wallet',
        value:
          formatBalanceArray(
            totalAmount,
            'debit',
          ) || '0',
        tone: 'amber',
      },
      {
        label: t('Credit'),
        icon: 'coin',
        value:
          formatBalanceArray(
            totalAmount,
            'credit',
          ) || '0',
        tone: 'green',
      },
      {
        label: t('Balance'),
        icon: 'chart',
        value:
          formatBalanceArray(
            totalAmount,
            'balance',
          ) || '0',
        tone: 'cyan',
      },
    ];
  }

  if (
    type === 'account_financial_report'
  ) {
    return [
      {
        label: t('Account'),
        value:
          getAccountName(extraInfo) || '-',
        tone: 'blue',
      },
      {
        label: t('Account ID'),
        value: shortID(extraInfo?.id || ''),
        tone: 'cyan',
      },
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'amber',
      },
      {
        label: t('Transactions'),
        value: String(length),
        icon: 'receipt',
        tone: 'green',
      },
      {
        label: t('Debit'),
        icon: 'wallet',
        value:
          formatBalanceArray(
            totalAmount,
            'debit',
          ) || '0',
        tone: 'red',
      },
      {
        label: t('Credit'),
        icon: 'coin',
        value:
          formatBalanceArray(
            totalAmount,
            'credit',
          ) || '0',
        tone: 'green',
      },
      {
        label: t('Balance'),
        icon: 'chart',
        value:
          formatBalanceArray(
            totalAmount,
            'balance',
          ) || '0',
        tone: 'cyan',
      },
    ];
  }

  if (type === 'journals_report') {
    return [
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'blue',
      },
      {
        label: t('Transactions'),
        value: String(length),
        icon: 'receipt',
        tone: 'cyan',
      },
      {
        label: t('Debit'),
        icon: 'wallet',
        value:
          formatBalanceArray(
            totalAmount,
            'debit',
          ) || '0',
        tone: 'red',
      },
      {
        label: t('Credit'),
        icon: 'coin',
        value:
          formatBalanceArray(
            totalAmount,
            'credit',
          ) || '0',
        tone: 'green',
      },
      {
        label: t('Balance'),
        icon: 'chart',
        value:
          formatBalanceArray(
            totalAmount,
            'balance',
          ) || '0',
        tone: 'amber',
      },
    ];
  }

  if (type === 'exchanges_report') {
    /*
     * Exchanges move money between two accounts, so debits and credits are
     * totalled per currency and reported separately.
     */
    const sent = {};
    const received = {};

    normalizeItems(filteredItems).forEach((row) => {
      const debitCurrency =
        row.first_currency || '';
      const creditCurrency =
        row.second_currency || '';

      if (debitCurrency) {
        sent[debitCurrency] =
          Number(sent[debitCurrency] || 0) +
          Number(row.first_entry_debit || 0);
      }

      if (creditCurrency) {
        received[creditCurrency] =
          Number(received[creditCurrency] || 0) +
          Number(row.second_entry_credit || 0);
      }
    });

    return [
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'blue',
      },
      {
        label: t('Exchanges'),
        value: String(length),
        icon: 'receipt',
        tone: 'cyan',
      },
      {
        label: t('Debit'),
        icon: 'wallet',
        value:
          formatCurrencyMap(sent, ' | ') || '0',
        tone: 'red',
      },
      {
        label: t('Credit'),
        icon: 'coin',
        value:
          formatCurrencyMap(
            received,
            ' | ',
          ) || '0',
        tone: 'green',
      },
    ];
  }

  if (type === 'product_transactions') {
    const product = extraInfo?.product || {};

    return [
      {
        label: t('Product'),
        value: product.name || '-',
        icon: 'box',
        tone: 'blue',
      },
      {
        label: t('Product ID'),
        value: shortID(product.id || ''),
        tone: 'cyan',
      },
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'amber',
      },
      {
        label: t('Transactions'),
        value: String(length),
        icon: 'receipt',
        tone: 'green',
      },
      {
        label: t('Quantity Balance'),
        value: `${formatNumber(
          extraInfo?.qtyBalance,
        )} ${getUnitName(
          product.product_unit_id,
        )}`,
        tone: 'blue',
      },
      {
        label: t('Purchase Price'),
        value: formatMoney(
          product.buy_price,
          product.buy_currency,
        ),
        tone: 'red',
      },
      {
        label: t('Selling Price'),
        value: formatMoney(
          product.sell_price,
          product.sell_currency,
        ),
        tone: 'green',
      },
      {
        label: t('Benefit'),
        value: formatMoney(
          extraInfo?.benefit,
          product.buy_currency,
        ),
        tone: 'cyan',
      },
    ];
  }

  if (type === 'account_products_report') {
    const totalQuantity = sumReportQuantity(
      normalizeItems(filteredItems),
    );

    return [
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'amber',
      },
      {
        label: t('Total Quantity'),
        value: totalQuantity.toLocaleString(undefined, {
          maximumFractionDigits: 3,
        }),
        icon: 'receipt',
        tone: 'green',
      },
      {
        label: t('Total Amount'),
        value: formatCurrencyMap(totalAmount),
        tone: 'blue',
      },
    ];
  }

  if (type === 'visitor_report') {
    /*
     * The summary mirrors the four cards on the screen plus the date range.
     * Every figure is summed per currency here from the rows themselves: a
     * cross-currency total would be a made-up number.
     */
    const visitorRows = normalizeItems(filteredItems);

    const sumByCurrency = (key) => visitorRows.reduce(
      (totals, row) => {
        const currency = row.currency || 'AFN';

        totals[currency] =
          (totals[currency] || 0) +
          Number(row[key] || 0);

        return totals;
      },
      {},
    );

    const visitorCount = new Set(
      visitorRows.map((row) => String(row.visitor_account_id)),
    ).size;

    return [
      {
        label: t('Date Range'),
        value: dateRange,
        icon: 'calendar',
        tone: 'amber',
      },
      {
        label: t('Visitors'),
        value: String(
          extraInfo?.visitors ?? visitorCount,
        ),
        icon: 'user',
        tone: 'blue',
      },
      {
        label: t('Total Sales'),
        value: formatCurrencyMap(sumByCurrency('total_amount'), ' | ') || '0',
        icon: 'chart',
        tone: 'blue',
      },
      {
        label: t('Benefit'),
        value: formatCurrencyMap(sumByCurrency('total_benefit'), ' | ') || '0',
        icon: 'wallet',
        tone: 'green',
      },
      {
        label: t('Visitor Share'),
        value: formatCurrencyMap(sumByCurrency('total_share'), ' | ') || '0',
        icon: 'receipt',
        tone: 'amber',
      },
      {
        label: t('Company Share'),
        value: formatCurrencyMap(sumByCurrency('company_share'), ' | ') || '0',
        icon: 'coin',
        tone: 'green',
      },
    ];
  }

  if (type === 'sales') {
    return [
      {
        label: t('Total Sales'),
        value:
          formatCurrencyMap(
            totalAmount,
            ' | ',
          ) || '0',
        tone: 'blue',
        icon: 'chart',
      },
      {
        label: t('Sales'),
        value: String(length),
        tone: 'amber',
        icon: 'receipt',
      },
      {
        label: t('Benefit'),
        value:
          formatCurrencyMap(
            extraInfo,
            ' | ',
          ) || '0',
        tone: 'green',
        icon: 'wallet',
      },
    ];
  }

  return [
    {
      label: t('Total Purchases'),
      value:
        formatCurrencyMap(
          totalAmount,
          ' | ',
        ) || '0',
      tone: 'blue',
      icon: 'chart',
    },
    {
      label: t('Purchases'),
      value: String(length),
      tone: 'amber',
      icon: 'receipt',
    },
    {
      label: t('Date Range'),
      value: dateRange,
      tone: 'cyan',
      icon: 'calendar',
    },
  ];
}

function buildAccountsTable(items, rtl) {
  /*
   * Accounts Report PDF columns:
   * The internal account ID is intentionally not displayed.
   */
  const headers = [
    '#',
    t('Name'),
    t('Type'),
    t('Group'),
    t('Balance'),
  ];

  const body = items.map((item, index) => [
    index + 1,
    getAccountName(item),
    getAccountTypeName(item.account_type_id),
    getAccountGroupName(item.account_group_id),
    createAccountBalancesMoneyCell(item),
  ]);

  /*
   * autoTable indexes follow the displayed column order. In RTL,
   * the # column moves to the last visual position.
   */
  const columnStyles = rtl
    ? {
        4: {
          cellWidth: 17,
          halign: 'center',
        },
      }
    : {
        0: {
          cellWidth: 17,
          halign: 'center',
        },
      };

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body: rtl
      ? body.map((row) => [...row].reverse())
      : body,
    columnStyles,
  };
}

function buildAccountFinancialTable(
  items,
  account,
  rtl,
) {
  const headers = [
    '#',
    t('Date'),
    t('Peer Account'),
    t('Description'),
    t('Debit'),
    t('Credit'),
    t('Balance'),
  ];

  const running = createRunningBalanceFormatter();

  const sortedItems = [...items].reverse();

  const body = sortedItems.map(
    (journal, index) => {
      const accountId = Number(account?.id);
      const isFirstEntry =
        Number(journal.first_entry_account) ===
        accountId;

      const debit = Number(
        isFirstEntry
          ? journal.first_entry_debit
          : journal.second_entry_debit,
      );
      const credit = Number(
        isFirstEntry
          ? journal.first_entry_credit
          : journal.second_entry_credit,
      );
      const peerAccountId = isFirstEntry
        ? journal.second_entry_account
        : journal.first_entry_account;
      const currency =
        journal.currency || 'AFN';
      const journalDate =
        journal.date ||
        journal.created_at;

      const row = [
        index + 1,
        formatDualDateForPDF(journalDate),
        getAccountName(
          accounts.find(
            (candidate) =>
              Number(candidate.id) ===
              Number(peerAccountId),
          ),
        ),
        stripTags(
          t(journal.description || ''),
        ),
        debit
          ? createMoneyCell(debit, currency)
          : '',
        credit
          ? createMoneyCell(credit, currency)
          : '',
        createMoneyMapCell(
          running.add(
            currency,
            credit - debit,
          ),
        ),
      ];

      return rtl ? [...row].reverse() : row;
    },
  );

  const numberColumnIndex =
    rtl ? headers.length - 1 : 0;

  const dateColumnIndex =
    rtl ? headers.length - 2 : 1;

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
    columnStyles: {
      [numberColumnIndex]: {
        cellWidth: 12,
        halign: 'center',
      },
      [dateColumnIndex]: {
        cellWidth: 31,
        halign: 'center',
      },
    },
  };
}

function buildJournalsTable(items, rtl) {
  const headers = [
    '#',
    t('ID'),
    t('Date'),
    t('Account'),
    t('Peer Account'),
    t('Description'),
    t('Debit'),
    t('Credit'),
    t('Balance'),
  ];

  const running = createRunningBalanceFormatter();
  const sortedItems = [...items].reverse();

  const body = sortedItems.map(
    (journal, index) => {
      const currency =
        journal.currency || 'AFN';
      const debit = Number(
        journal.first_entry_debit || 0,
      );
      const credit = Number(
        journal.first_entry_credit || 0,
      );

      const row = [
        index + 1,
        shortID(journal.id),
        formatDateForPDF(
          journal.date ||
            journal.created_at,
        ),
        getAccountName(
          accounts.find(
            (candidate) =>
              Number(candidate.id) ===
              Number(
                journal.first_entry_account,
              ),
          ),
        ),
        getAccountName(
          accounts.find(
            (candidate) =>
              Number(candidate.id) ===
              Number(
                journal.second_entry_account,
              ),
          ),
        ),
        stripTags(
          t(journal.description || ''),
        ),
        debit
          ? createMoneyCell(debit, currency)
          : '',
        credit
          ? createMoneyCell(credit, currency)
          : '',
        createMoneyMapCell(
          running.add(
            currency,
            credit - debit,
          ),
        ),
      ];

      return rtl ? [...row].reverse() : row;
    },
  );

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
  };
}

function buildExchangesTable(
  items,
  rtl,
  printableWidth,
) {
  const headers = [
    '#',
    t('Date'),
    t('From Account'),
    t('To Account'),
    t('Description'),
    t('Debit'),
    t('Rate'),
    t('Credit'),
  ];

  /*
   * Every column is pinned on purpose. The two money columns hold no
   * measurable text (they are drawn manually), so when autoTable is left to
   * distribute the width the last column is starved and its header ends up
   * wrapped one letter per line.
   *
   * The widths are then scaled to fill the printable width, so the table
   * ends flush with the "Details" title instead of stopping short of it.
   * RTL reverses the header row, so the widths must be reversed with it or
   * they land on the wrong columns.
   */
  const baseWidths = [
    8, 20, 28, 28, 30, 24, 18, 24,
  ];
  const baseTotal = baseWidths.reduce(
    (sum, width) => sum + width,
    0,
  );
  const targetWidth =
    Number(printableWidth) > 0
      ? Number(printableWidth)
      : baseTotal;
  const scale = targetWidth / baseTotal;
  const columnWidths = baseWidths.map(
    (width) =>
      Math.round(width * scale * 100) / 100,
  );
  const orderedWidths = rtl
    ? [...columnWidths].reverse()
    : columnWidths;

  function resolveAccountName(accountId) {
    return getAccountName(
      accounts.find(
        (candidate) =>
          Number(candidate.id) ===
          Number(accountId),
      ),
    );
  }

  const body = items.map(
    (exchange, index) => {
      const debit = Number(
        exchange.first_entry_debit || 0,
      );
      const credit = Number(
        exchange.second_entry_credit || 0,
      );
      const rate = Number(exchange.rate || 0);

      const row = [
        index + 1,
        formatDateForPDF(
          exchange.date ||
            exchange.created_at,
        ),
        resolveAccountName(
          exchange.first_entry_account,
        ),
        resolveAccountName(
          exchange.second_entry_account,
        ),
        stripTags(
          exchange.description || '',
        ),
        debit
          ? createMoneyCell(
              debit,
              exchange.first_currency,
            )
          : '',
        rate
          ? formatNumber(rate, {
              maximumFractionDigits: 6,
            })
          : '',
        credit
          ? createMoneyCell(
              credit,
              exchange.second_currency,
            )
          : '',
      ];

      return rtl ? [...row].reverse() : row;
    },
  );

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
    columnStyles: Object.fromEntries(
      orderedWidths.map((cellWidth, index) => [
        index,
        { cellWidth },
      ]),
    ),
  };
}

function resolveProductMovementType(transactionType) {
  if (
    [
      'sale',
      'purchase_return',
      'adjustment_out',
      'transfer_out',
      'production_in',
    ].includes(transactionType)
  ) {
    return 'out';
  }

  if (transactionType === 'waste') {
    return 'waste';
  }

  return 'in';
}

function buildProductTransactionsTable(
  items,
  extraInfo,
  rtl,
) {
  const headers = [
    '#',
    t('ID'),
    t('Date'),
    t('Type'),
    `${t('Account')} ${t('Name')}`,
    t('Warehouse'),
    t('Mfg'),
    t('Expiry'),
    t('In'),
    t('Out'),
    t('Quantity Balance'),
    t('Unit Cost'),
    t('Outgoing'),
    t('Incoming'),
    t('In-Out Balance'),
  ];

  const running = {};
  const product = extraInfo?.product || {};
  const sortedItems = [...items].reverse();

  const body = sortedItems.map(
    (transaction, index) => {
      const movementType =
        resolveProductMovementType(
          transaction.transaction_type,
        );
      const currency =
        transaction.currency || 'AFN';

      if (movementType !== 'waste') {
        const difference =
          movementType === 'out'
            ? Number(transaction.total_cost || 0)
            : Number(transaction.total_cost || 0) *
              -1;

        running[currency] =
          Number(running[currency] || 0) +
          difference;
      }

      const transactionUnit =
        getUnitName(
          transaction.product_unit_id,
        );
      const balanceUnit =
        getUnitName(
          product.product_unit_id,
        );

      const row = [
        index + 1,
        shortID(transaction.id),
        formatDateForPDF(
          transaction.created_at,
        ),
        `${t(
          transaction.transaction_type,
        )} ${
          transaction.reference_number ||
          shortID(transaction.reference_id)
        }`,
        t(transaction.account_name || ''),
        shortID(transaction.warehouse_id),
        formatDateForPDF(
          transaction.manufacturing_date,
        ),
        formatDateForPDF(
          transaction.expiry_date,
        ),
        movementType === 'in'
          ? `${formatNumber(
              transaction.quantity,
            )} ${transactionUnit}`
          : '',
        movementType === 'out' ||
        movementType === 'waste'
          ? `${formatNumber(
              transaction.quantity,
            )} ${transactionUnit}`
          : '',
        `${formatNumber(
          transaction.qtyBalance,
        )} ${balanceUnit}`,
        createMoneyCell(
          transaction.unit_cost,
          currency,
        ),
        movementType === 'in'
          ? createMoneyCell(
              transaction.total_cost,
              currency,
            )
          : '',
        movementType === 'out'
          ? createMoneyCell(
              transaction.total_cost,
              currency,
            )
          : '',
        createMoneyMapCell(running),
      ];

      return rtl ? [...row].reverse() : row;
    },
  );

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
  };
}

function buildAccountProductsTable(
  items,
  rtl,
  printableWidth,
) {
  const headers = [
    '#',
    t('Date'),
    t('Invoice #'),
    t('Product'),
    t('Unit Price'),
    t('Quantity'),
    t('Total'),
  ];

  const body = items.map((item, index) => {
    const currency = item.currency || 'AFN';
    const row = [
      index + 1,
      formatDualDateForPDF(item.created_at),
      stripTags(item.invoice_text),
      stripTags(item.product_name),
      createMoneyCell(item.unit_price, currency),
      `${formatNumber(item.quantity)} ${item.product_unit_name}`,
      createMoneyCell(item.subtotal, currency),
    ];

    return rtl ? [...row].reverse() : row;
  });

  /* Scale the preferred column proportions to the real page width. */
  const preferredWidths = [10, 34, 40, 89, 32, 32, 42];
  const preferredTotal = preferredWidths.reduce(
    (total, width) => total + width,
    0,
  );
  const widthScale =
    (Number(printableWidth) || preferredTotal) /
    preferredTotal;
  const scaledWidths = preferredWidths.map(
    (width) => width * widthScale,
  );

  const ltrColumnStyles = {
    0: { cellWidth: scaledWidths[0], halign: 'center' },
    1: { cellWidth: scaledWidths[1], halign: 'center' },
    2: { cellWidth: scaledWidths[2], halign: rtl ? 'right' : 'left' },
    3: { cellWidth: scaledWidths[3], halign: rtl ? 'right' : 'left' },
    4: { cellWidth: scaledWidths[4], halign: 'center' },
    5: { cellWidth: scaledWidths[5], halign: 'center' },
    6: { cellWidth: scaledWidths[6], halign: 'center' },
  };

  const columnStyles = rtl
    ? Object.fromEntries(
        Object.entries(ltrColumnStyles).map(
          ([columnIndex, style]) => [
            headers.length - 1 - Number(columnIndex),
            style,
          ],
        ),
      )
    : ltrColumnStyles;

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
    columnStyles,
  };
}

/*
 * Visitor Report table: one row per visitor per currency, exactly as the
 * on-screen report shows it. The commission column is the amount the sales
 * actually posted to the visitor and the company column is what was left of
 * the benefit, so a reader of the PDF gets the same 100 - 10 = 90 the app
 * reports.
 */
function buildVisitorReportTable(
  items,
  rtl,
  printableWidth,
) {
  const headers = [
    '#',
    t('Visitor'),
    t('Rate'),
    t('Sales Count'),
    t('Total Sales'),
    t('Benefit'),
    t('Visitor Share'),
    t('Company Share'),
  ];

  const body = items.map((item, index) => {
    const currency = item.currency || 'AFN';
    const row = [
      index + 1,
      stripTags(item.visitor_display_name || item.visitor_name || '—'),
      `${formatNumber(item.visitor_percentage, { maximumFractionDigits: 4 })}%`,
      formatNumber(item.sales_count),
      createMoneyCell(item.total_amount, currency),
      createMoneyCell(item.total_benefit, currency),
      createMoneyCell(item.total_share, currency),
      createMoneyCell(item.company_share, currency),
    ];

    return rtl ? [...row].reverse() : row;
  });

  /* Scale the preferred column proportions to the real page width. */
  const preferredWidths = [8, 34, 18, 20, 34, 34, 36, 36];
  const preferredTotal = preferredWidths.reduce(
    (total, width) => total + width,
    0,
  );
  const widthScale =
    (Number(printableWidth) || preferredTotal) /
    preferredTotal;
  const scaledWidths = preferredWidths.map(
    (width) => width * widthScale,
  );

  const ltrColumnStyles = {
    0: { cellWidth: scaledWidths[0], halign: 'center' },
    1: { cellWidth: scaledWidths[1], halign: rtl ? 'right' : 'left' },
    2: { cellWidth: scaledWidths[2], halign: 'center' },
    3: { cellWidth: scaledWidths[3], halign: 'center' },
    4: { cellWidth: scaledWidths[4], halign: 'center' },
    5: { cellWidth: scaledWidths[5], halign: 'center' },
    6: { cellWidth: scaledWidths[6], halign: 'center' },
    7: { cellWidth: scaledWidths[7], halign: 'center' },
  };

  const columnStyles = rtl
    ? Object.fromEntries(
        Object.entries(ltrColumnStyles).map(
          ([columnIndex, style]) => [
            headers.length - 1 - Number(columnIndex),
            style,
          ],
        ),
      )
    : ltrColumnStyles;

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
    columnStyles,
  };
}

function buildSalesPurchaseTable(
  type,
  items,
  rtl,
) {
  const headers = [
    '#',
    t('Date'),
    t('Description'),
    t('Total Amount'),
    t('Balance'),
  ];

  const running = {};

  const body = items.map((item, index) => {
    const currency = item.currency || 'AFN';
    running[currency] =
      Number(running[currency] || 0) +
      Number(item.total_amount || 0);

    const billText = stripTags(
      type === 'sales'
        ? item.invoice_number
        : item.bill_number,
    );

    const partyName = getAccountName(
      accounts.find(
        (account) =>
          Number(account.id) ===
          Number(item.account_id),
      ),
    );

    const descriptionText = stripTags(
      item.description,
    );

    const row = [
      index + 1,
      formatDateForPDF(
        type === 'sales'
          ? item.invoice_date
          : item.bill_date,
      ),
      createSalesPurchaseDetailCell({
        partyName,
        billNumber: billText,
        description: descriptionText,
      }),
      createMoneyCell(
        item.total_amount,
        currency,
      ),
      createMoneyCell(
        running[currency],
        currency,
      ),
    ];

    return rtl ? [...row].reverse() : row;
  });

  /*
   * autoTable column indexes follow the displayed order. Since RTL
   * reverses the row, the width map must also be reversed.
   *
   * Available portrait width:
   * A4 210mm - 10mm left - 10mm right = 190mm.
   */
  const ltrColumnStyles = {
    0: {
      cellWidth: 10,
      halign: 'center',
    },
    1: {
      cellWidth: 30,
      halign: 'center',
    },
    2: {
      cellWidth: 80,
      halign: rtl ? 'right' : 'left',
    },
    3: {
      cellWidth: 35,
      halign: 'center',
    },
    4: {
      cellWidth: 35,
      halign: 'center',
    },
  };

  const columnStyles = rtl
    ? Object.fromEntries(
        Object.entries(ltrColumnStyles).map(
          ([columnIndex, style]) => [
            headers.length - 1 - Number(columnIndex),
            style,
          ],
        ),
      )
    : ltrColumnStyles;

  return {
    head: [rtl ? [...headers].reverse() : headers],
    body,
    columnStyles,
  };
}

function buildTableData({
  type,
  items,
  extraInfo,
  rtl,
  printableWidth,
}) {
  if (type === 'accounts') {
    return buildAccountsTable(items, rtl);
  }

  if (
    type === 'account_financial_report'
  ) {
    return buildAccountFinancialTable(
      items,
      extraInfo,
      rtl,
    );
  }

  if (type === 'journals_report') {
    return buildJournalsTable(items, rtl);
  }

  if (type === 'exchanges_report') {
    return buildExchangesTable(
      items,
      rtl,
      printableWidth,
    );
  }

  if (type === 'product_transactions') {
    return buildProductTransactionsTable(
      items,
      extraInfo,
      rtl,
    );
  }

  if (type === 'account_products_report') {
    return buildAccountProductsTable(
      items,
      rtl,
      printableWidth,
    );
  }

  if (type === 'visitor_report') {
    return buildVisitorReportTable(
      items,
      rtl,
      printableWidth,
    );
  }

  return buildSalesPurchaseTable(
    type,
    items,
    rtl,
  );
}

function getTableFontSize(type) {
  /*
   * Larger table font for every generated PDF report.
   */
  if (type === 'product_transactions') return 6.8;

  if (
    type === 'account_financial_report' ||
    type === 'journals_report' ||
    type === 'exchanges_report'
  ) {
    return 8.2;
  }

  if (type === 'accounts') return 8.7;

  return 9.3;
}

async function drawCompactPageHeader() {
  /*
   * Removed entirely as requested.
   * Continuation pages no longer render the top compact header.
   */
  return;
}

function addPageFooters(
  doc,
  {
    pageWidth,
    pageHeight,
    margin,
    title,
  },
) {
  const totalPages =
    doc.internal.getNumberOfPages();

  const companyPhones = [
    company.phone,
    company.phone2,
  ].filter(Boolean);

  const phoneText =
    companyPhones.join('  |  ');

  for (
    let pageNumber = 1;
    pageNumber <= totalPages;
    pageNumber += 1
  ) {
    doc.setPage(pageNumber);

    doc.setDrawColor(
      ...PDF_THEME.border,
    );
    doc.setLineWidth(0.16);

    doc.line(
      margin,
      pageHeight - 13,
      pageWidth - margin,
      pageHeight - 13,
    );

    drawRoundedRect(
      doc,
      pageWidth / 2 - 11,
      pageHeight - 11.6,
      22,
      6.2,
      3,
      PDF_THEME.surface,
      PDF_THEME.border,
    );

    /*
     * Page number
     */
    doc.setFont(
      FONT_NAME,
      'normal',
    );
    doc.setFontSize(5.8);
    doc.setTextColor(
      ...PDF_THEME.primaryDark,
    );

    doc.text(
      `${pageNumber} / ${totalPages}`,
      pageWidth / 2,
      pageHeight - 7.7,
      {
        align: 'center',
      },
    );

    /*
     * Report title
     */
    doc.text(
      title,
      pageWidth - margin,
      pageHeight - 8.5,
      {
        align: 'right',
      },
    );

    /*
     * System brand
     */
    doc.setFont(
      FONT_NAME,
      'bold',
    );
    doc.setTextColor(
      ...PDF_THEME.ink,
    );

    doc.text(
      'ZenoERP',
      margin,
      pageHeight - 8.5,
      {
        align: 'left',
      },
    );

    /*
     * Company phone numbers at the bottom center.
     */
    if (phoneText) {
      doc.setFont(
        FONT_NAME,
        'normal',
      );
      doc.setFontSize(5.3);
      doc.setTextColor(
        ...PDF_THEME.text,
      );

      doc.text(
        phoneText,
        pageWidth / 2,
        pageHeight - 4.7,
        {
          align: 'center',
        },
      );
    }

    /*
     * Website remains at the lower-left.
     */
    doc.setFont(
      FONT_NAME,
      'normal',
    );
    doc.setFontSize(5.2);
    doc.setTextColor(
      ...PDF_THEME.muted,
    );

    doc.text(
      'www.zenoerp.com',
      margin,
      pageHeight - 4.7,
      {
        align: 'left',
      },
    );
  }
}

function buildTableColumnStyles(type) {
  if (type === 'product_transactions') {
    return {
      0: { cellWidth: 18 },
      1: { cellWidth: 18 },
      2: { cellWidth: 19 },
      3: { cellWidth: 18 },
    };
  }

  if (
    type === 'account_financial_report' ||
    type === 'journals_report'
  ) {
    return {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
    };
  }

  return {};
}

export async function generatePDF(
  type = 'sales',
  filteredItems = [],
  fromDate = null,
  toDate = null,
  length = 0,
  totalAmount = {},
  extraInfo = {},
) {
  if (generatingPDF) return;

  generatingPDF = true;

  try {
    await loadThings();

    const rtl = t('dir') === 'rtl';
    const orientation = resolveOrientation();
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    await loadFont(doc);

    const pageWidth =
      doc.internal.pageSize.getWidth();
    const pageHeight =
      doc.internal.pageSize.getHeight();
    const margin =
      orientation === 'landscape' ? 9 : 10;
    const reportTitle =
      resolveReportTitle(type);

    let items = normalizeItems(filteredItems);

    if (type === 'accounts') {
      items = items.filter(
        (item) => item.include,
      );
      length = items.length;
    } else if (!length) {
      length = items.length;
    }

    const headerHeight = await drawMainHeader(doc, {
      pageWidth,
      margin,
      title: reportTitle,
      subtitle:
        type === 'account_financial_report'
          ? getAccountName(extraInfo)
          : type === 'product_transactions'
            ? extraInfo?.product?.name || ''
            : formatDateRange(
                fromDate,
                toDate,
              ),
      rtl,
    });

    /*
     * The report title already appears in the header strip,
     * so do not repeat it above the flat summary table.
     */
    let currentY = headerHeight + 7;

    if (type === 'sales') {
      currentY = drawSalesCurrencySummary(
        doc,
        {
          items,
          totalAmount,
          benefitAmount: extraInfo,
          startY: currentY,
          pageWidth,
          margin,
          rtl,
        },
      );
    } else {
      const metrics = buildReportMetrics({
        type,
        filteredItems: items,
        fromDate,
        toDate,
        length,
        totalAmount,
        extraInfo,
      });

      currentY = drawMetricCards(doc, {
        metrics,
        startY: currentY,
        pageWidth,
        margin,
        rtl,
      });
    }

    currentY += 7;

    drawSectionTitle(
      doc,
      rtl ? pageWidth - margin : margin,
      currentY,
      t('Details'),
      rtl,
    );

    currentY += 6;

    const table = buildTableData({
      type,
      items,
      extraInfo,
      rtl,
      printableWidth:
        pageWidth - margin * 2,
    });

    const fontSize =
      getTableFontSize(type);

    autoTable(doc, {
      startY: currentY,
      margin: {
        top: 19,
        right: margin,
        bottom: 18,
        left: margin,
      },

      head: table.head,
      body: table.body,

      theme: 'plain',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',

      styles: {
        font: FONT_NAME,
        fontStyle: 'normal',
        fontSize,
        textColor: PDF_THEME.text,
        lineColor: PDF_THEME.border,
        lineWidth: 0.08,
        cellPadding:
          type === 'product_transactions'
            ? 1.45
            : 2.25,
        valign: 'middle',
        halign: 'center',
        overflow: 'linebreak',
        minCellHeight:
          type === 'product_transactions'
            ? 6.8 
            : 7.8,
      },

      headStyles: {
        font: FONT_NAME,
        fontStyle: 'bold',
        fontSize:
          type === 'product_transactions'
            ? 7
            : fontSize,
        fillColor: PDF_THEME.primary,
        textColor: PDF_THEME.white,
        lineColor: PDF_THEME.primaryDark,
        lineWidth: 0.08,
        halign: 'center',
        valign: 'middle',
        minCellHeight: 8.8,
      },

      alternateRowStyles: {
        fillColor: PDF_THEME.surface,
      },

      bodyStyles: {
        fillColor: PDF_THEME.white,
      },

      tableWidth: 'auto',

      columnStyles: {
        ...buildTableColumnStyles(type),
        ...(table.columnStyles || {}),
      },

      didParseCell(data) {
        if (
          data.section === 'body' &&
          isMoneyTableCell(data.cell.raw)
        ) {
          const moneyLineCount =
            data.cell.raw.moneyLines.length;

          data.cell.styles.halign = 'center';
          data.cell.styles.valign = 'middle';
          data.cell.styles.minCellHeight = Math.max(
            Number(data.cell.styles.minCellHeight || 0),
            4.8 + moneyLineCount * 3.85,
          );
        }

        if (
          (type === 'sales' ||
            type === 'purchases') &&
          data.section === 'body'
        ) {
          data.cell.styles.cellPadding = 1.65;
          data.cell.styles.minCellHeight = 8;

          /*
           * The merged Details column is index 2 in both LTR and RTL.
           */
          if (data.column.index === 2) {
            data.cell.styles.halign = rtl
              ? 'right'
              : 'left';
            data.cell.styles.valign = 'middle';
          }

          if (isSalesPurchaseDetailCell(data.cell.raw)) {
            const detail = data.cell.raw.detailCell;
            const availableWidth = Math.max(
              10,
              Number(data.cell.width || 80) - 4,
            );

            doc.setFont(FONT_NAME, 'normal');
            doc.setFontSize(7.4);

            detail.descriptionLines = detail.description
              ? doc
                  .splitTextToSize(
                    detail.description,
                    availableWidth,
                  )
                  .slice(0, 2)
              : [];

            data.cell.styles.minCellHeight = Math.max(
              Number(data.cell.styles.minCellHeight || 0),
              detail.descriptionLines.length > 1
                ? 16.5
                : detail.descriptionLines.length === 1
                  ? 12.8
                  : 8.8,
            );
          }
        }

        if (
          data.section === 'body' &&
          isMoneyTableCell(data.cell.raw) &&
          data.cell.raw.moneyLines.some(
            (line) => Number(line.amount || 0) < 0,
          )
        ) {
          data.cell.styles.textColor =
            PDF_THEME.red;
        }

        if (
          data.section === 'body' &&
          typeof data.cell.raw === 'string'
        ) {
          const text = stripDirectionalFormatting(
            data.cell.raw.trim(),
          );

          if (
            text.startsWith('-') &&
            /\d/.test(text)
          ) {
            data.cell.styles.textColor =
              PDF_THEME.red;
          }
        }
      },

      didDrawCell(data) {
        if (
          data.section === 'body' &&
          isMoneyTableCell(data.cell.raw)
        ) {
          drawMoneyTableCell(doc, data);
        }

        if (
          data.section === 'body' &&
          isSalesPurchaseDetailCell(data.cell.raw)
        ) {
          drawSalesPurchaseDetailCell(
            doc,
            data,
            rtl,
          );
        }
      },

      didDrawPage() {
        /*
         * Continuation pages receive the compact header later in a
         * dedicated async pass, because the header includes the
         * external system logo (logo.png).
         */
      },
    });

    const totalPages =
      doc.internal.getNumberOfPages();

    for (
      let pageNumber = 2;
      pageNumber <= totalPages;
      pageNumber += 1
    ) {
      doc.setPage(pageNumber);
      await drawCompactPageHeader(doc, {
        pageWidth,
        margin,
      });
    }

    addPageFooters(doc, {
      pageWidth,
      pageHeight,
      margin,
      title: reportTitle,
    });

    doc.setProperties({
      title: reportTitle,
      subject: `${company.name || 'ZenoERP'} - ${reportTitle}`,
      author: company.name || 'ZenoERP',
      creator: 'ZenoERP',
      keywords:
        'ZenoERP, ERP, report, accounting',
    });

    doc.save(resolveFileName(type));
  } catch (error) {
    console.error(
      'Failed to generate the PDF report:',
      error,
    );

    throw error;
  } finally {
    generatingPDF = false;
  }
}

function formatMoneyPlain(value, currency) {
  const amount = formatNumber(value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
  const label = currency ? t(currency) : '';

  if (!label) return amount;

  if (t('dir') === 'rtl') {
    return `${label} ${amount}`;
  }

  return `${amount} ${label}`;
}

function flattenExportCell(cell) {
  if (cell == null || cell === '') return '';

  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return String(cell);
  }

  if (typeof cell === 'string') {
    return stripDirectionalFormatting(cell)
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (isMoneyTableCell(cell)) {
    return cell.moneyLines
      .map((line) => formatMoneyPlain(line.amount, line.currency))
      .join(' | ');
  }

  if (isSalesPurchaseDetailCell(cell)) {
    const detail = cell.detailCell;

    return [detail.partyName, detail.billNumber, detail.description]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' | ');
  }

  if (typeof cell === 'object' && cell.content != null && cell.content !== '') {
    return flattenExportCell(cell.content);
  }

  return '';
}

export async function getReportExportData(
  type = 'sales',
  filteredItems = [],
  fromDate = null,
  toDate = null,
  length = 0,
  totalAmount = {},
  extraInfo = {},
) {
  await loadThings();

  let items = normalizeItems(filteredItems);

  if (type === 'accounts') {
    items = items.filter((item) => item.include);
    length = items.length;
  } else if (!length) {
    length = items.length;
  }

  const table = buildTableData({
    type,
    items,
    extraInfo,
    rtl: false,
  });

  const metrics = buildReportMetrics({
    type,
    filteredItems: items,
    fromDate,
    toDate,
    length,
    totalAmount,
    extraInfo,
  });

  return {
    type,
    title: resolveReportTitle(type),
    companyName: company.name || 'ZenoERP',
    dateRange: flattenExportCell(formatDateRange(fromDate, toDate)),
    metrics: normalizeItems(metrics).map((metric) => ({
      label: flattenExportCell(metric?.label),
      value: flattenExportCell(metric?.value),
    })),
    headers: normalizeItems(table.head?.[0]).map((header) =>
      flattenExportCell(header),
    ),
    rows: normalizeItems(table.body).map((row) =>
      normalizeItems(row).map((cell) => flattenExportCell(cell)),
    ),
    rtl: t('dir') === 'rtl',
  };
}
