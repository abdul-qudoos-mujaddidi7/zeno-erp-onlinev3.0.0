/*
 * Formatting rules for the 74mm sale receipt (SaleReceiptModal).
 *
 * The receipt prints one block per line item — the product name on its own
 * line, then quantity / price / amount underneath — followed by Subtotal,
 * NET Total, Payments and Change, and a header that states how many items and
 * how much total quantity the bill holds ("Items Count [2]", "Items Qty
 * Count [6]").
 *
 * Everything here is a pure function so the exact strings a printer receives
 * can be unit tested without a browser.
 *
 * Numbers are always rendered in a fixed, latin format ('en-US': comma
 * group separator, dot decimal separator) instead of the browser locale.
 * A thermal receipt is a fixed-width document: the same bill must print the
 * same characters on every machine, and the auto-shrink in the modal depends
 * on a predictable string width.
 */

import { BUSINESS_TIME_ZONE } from '../../utils/accountingDate.js';

const LOCALE = 'en-US';

function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

/** Decimals the value actually carries, capped so a float artifact cannot leak. */
function decimalPlaces(value) {
  const text = String(Math.abs(toNumber(value)));
  const dot = text.indexOf('.');

  return dot === -1 ? 0 : Math.min(text.length - dot - 1, 3);
}

/*
 * Money: padded to at least 2 decimals so a price column reads 330.00 and not
 * 330, but never rounded below the 3rd decimal the application stores.
 *   330        -> "330.00"
 *   1320       -> "1,320.00"
 *   30.46      -> "30.46"
 *   513516.857 -> "513,516.857"
 */
export function formatMoney(value, minFractionDigits = 2, maxFractionDigits = 3) {
  const number = toNumber(value);
  const digits = Math.min(Math.max(decimalPlaces(number), minFractionDigits), maxFractionDigits);

  return number.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/* Quantities are always shown with 3 decimals, like the line "4.000 (PC)". */
export function formatQty(value) {
  return toNumber(value).toLocaleString(LOCALE, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/* Counts ("Items Count [2]", "Items Qty Count [6]") drop trailing zeros. */
export function formatCount(value) {
  return toNumber(value).toLocaleString(LOCALE, {
    maximumFractionDigits: 3,
  });
}

/** How many lines and how much quantity the bill holds. */
export function itemCounts(items = []) {
  const rows = Array.isArray(items) ? items : [];

  return {
    itemsCount: rows.length,
    itemsQtyCount: rows.reduce((sum, item) => sum + toNumber(item?.quantity), 0),
  };
}

/*
 * Line amount: the stored subtotal when the server sent one, otherwise the
 * price the line actually charges. 0 is a real amount, so it is kept.
 */
export function lineAmount(item = {}) {
  const subtotal = Number(item?.subtotal);

  if (Number.isFinite(subtotal)) {
    return subtotal;
  }

  return toNumber(item?.unit_price) * toNumber(item?.quantity);
}

/** Sum of the printed line amounts — what the "Subtotal:" row must show. */
export function itemsSubtotal(items = []) {
  const rows = Array.isArray(items) ? items : [];

  return rows.reduce((sum, item) => sum + lineAmount(item), 0);
}

/*
 * Change handed back to the customer. It only exists when the bill was paid
 * beyond its total; a short payment is a debt ("Bill Due"), not a change.
 */
export function billChange(total, paid) {
  const difference = toNumber(paid) - toNumber(total);

  return difference > 0 ? difference : 0;
}

/* Country code the receipt prints in front of a company phone number. */
export const RECEIPT_COUNTRY_CODE = '+93';

/*
 * A phone line on the receipt always carries the country code: the shop
 * stores what the customer dials locally ("793 8888 36") and the printed
 * document is what a caller from outside the country reads.
 *
 *   "793 8888 36"    -> "+93 793 8888 36"
 *   "0793 8888 36"   -> "+93 793 8888 36"   (national 0 dropped)
 *   "+93 793 8888 36"-> "+93 793 8888 36"   (already international)
 *   "0093 793 88 36" -> "+93 793 88 36"     (00 prefix normalised)
 *   "93 20 230 4449" -> "+93 20 230 4449"   (code present, sign missing)
 *   ""               -> ""                  (nothing to print)
 *
 * The stored value is never mutated, only the printed string.
 */
export function formatContactPhone(phone, countryCode = RECEIPT_COUNTRY_CODE) {
  const text = String(phone ?? '').trim();
  const code = countryCode.slice(1);

  if (!text) return '';
  if (text.startsWith('+')) return text;
  if (text.startsWith('00')) return `+${text.slice(2).trim()}`;

  /* 93 followed by anything but a digit is the country code, not a number. */
  if (text.startsWith(code) && new RegExp(`^\\d{${code.length}}(?!\\d)`).test(text)) {
    return `+${text}`;
  }

  /* 793 8888 36 is dialled 0793 8888 36 inside the country. */
  if (/^0\d/.test(text)) return `${countryCode} ${text.slice(1).trim()}`;

  return `${countryCode} ${text}`;
}

/* The three receipt languages, as the locales that spell their day period. */
const TIME_LOCALES = { en: 'en-US', fa: 'fa-AF', ps: 'ps-AF' };

/*
 * The clock time of the sale, for the receipt's date line.
 *
 * The stored value is an instant: the backend's `created_at` comes from
 * `NOW()` on the database host, which is UTC on the online deployment, and
 * the API serialises it as ISO-8601 with a `Z`. Reading those digits straight
 * onto the slip printed the DATABASE's clock, not the shop's — a bill written
 * at 10:46 in Kabul (UTC+04:30) printed as 6:16 ق.ظ.
 *
 * So the instant is converted into the business time zone the rest of the app
 * already dates every transaction with (utils/accountingDate.js), and printed
 * on a 12-hour clock with the day period of the receipt's own language
 * ('ب.ظ', 'غ.و', 'PM') in the numerals of the Persian date beside it.
 *
 *   '2026-09-27T14:43:30.968Z' -> '۷:۱۳ ب.ظ'   (fa, Kabul)
 *   '2026-09-27T14:43:30.968Z' -> '7:13 PM'     (en)
 *   '2026-10-20T06:16:35.918Z' -> '۱۰:۴۶ ق.ظ'   (a 10:46 bill, Kabul)
 *   '2026-09-27T00:00:00.000Z' -> ''            (a date-only row)
 *   '' / null / 'nonsense'     -> ''
 */
export function receiptTime(value, lang = 'fa') {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);

  if (!match) return '';

  const [, year, month, day, rawHour, rawMinute] = match;
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (hour > 23 || minute > 59) return '';

  /*
   * Midnight is the value a business date is stored with, not a time a bill
   * was written: printing it would date every unread row to the same minute.
   * The check is on the STORED hour, before the time zone moves it.
   */
  if (hour === 0 && minute === 0) return '';

  const instant = new Date(
    `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );

  if (Number.isNaN(instant.getTime())) return '';

  const locale = TIME_LOCALES[lang] || TIME_LOCALES.fa;

  /*
   * One formatter answers the whole line: the locale decides the numerals
   * ('۶:۱۶' beside the Persian date, '6:16' in English) and the day period is
   * taken from the same parts, so a 12-hour marker can never disagree with
   * the hour it sits next to.
   */
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: BUSINESS_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(instant);

  const clockHour = parts.find((part) => part.type === 'hour')?.value || '';
  const clockMinute = parts.find((part) => part.type === 'minute')?.value || '';

  if (!clockHour || !clockMinute) return '';

  /* CLDR writes the Persian markers with a closing dot ('ق.ظ.'); a receipt
   * prints the abbreviation, so the trailing dot is dropped. */
  const period = (parts.find((part) => part.type === 'dayPeriod')?.value || '').replace(/\.$/, '');

  return `${clockHour}:${clockMinute} ${period}`.trim();
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/*
 * The slip prints the Persian date with Persian numerals (Intl 'fa-AF'), so
 * the time sharing that line is converted to match instead of mixing two
 * numeral systems inside one phrase.
 */
export function toPersianDigits(text) {
  return String(text ?? '').replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/*
 * What a line prints as its amount: the sale currency is named once, on the
 * NET Total row, so the item rows stay inside 74mm.
 */
export function lineCells(item = {}) {
  return {
    qty: formatQty(item?.quantity),
    unitName: item?.unit_name || '',
    price: formatMoney(item?.unit_price),
    amount: formatMoney(lineAmount(item)),
  };
}
