/*
 * Accounting dates are CALENDAR dates, not instants.
 *
 * journals.date is a DATETIME, and the pool reads and writes it in a fixed
 * "Z" frame, so a value written here comes back unchanged. The danger is not
 * the storage layer — it is JavaScript turning a calendar day into an instant:
 *
 *   new Date('2026-12-31').toISOString()      -> '2026-12-31T00:00:00.000Z'
 *   new Date(2026, 11, 31).toISOString()      -> '2026-12-30T20:30:00.000Z'  (UTC+4:30)
 *   new Date().toISOString().slice(0, 10)     -> yesterday, for the first
 *                                                hours of the local day
 *
 * For a UTC+4:30 book that means a document dated 31 Dec can be filed into
 * the wrong year, which is exactly what breaks fiscal-year reporting.
 *
 * These helpers are the single place that decision is made.
 *
 * WHOSE calendar day is it?
 * -------------------------
 * The BUSINESS calendar, not the machine's. This application's business day is
 * Asia/Kabul: the frontend pins it (utils/accountingDate.js `BUSINESS_TIME_ZONE`
 * -> `getKabulDate`/`todayAccountingDate`), the Persian calendar display assumes
 * it, and the default currency implies it. A server whose process timezone is
 * UTC must therefore still answer with Kabul's day — otherwise the same payment
 * would be an accounting day earlier or later depending on which machine ran
 * the code, and the SQL windows (Kabul offset) would disagree with JavaScript
 * again.
 *
 * Every function below is therefore expressed against BUSINESS_TIME_ZONE, and
 * none of them depends on `process.env.TZ` / `new Date().getTimezoneOffset()`.
 */

const BUSINESS_TIME_ZONE = 'Asia/Kabul';

/*
 * Afghanistan has had no daylight saving since 1945, so this is only a fallback
 * for an ICU-less runtime; the offset is normally measured from Intl.
 */
const BUSINESS_OFFSET_FALLBACK_MINUTES = 270;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

/*
 * The date/time parts an instant shows on the business calendar.
 *
 * Intl (ICU) resolves Asia/Kabul itself, so no arithmetic constant and no
 * process timezone is involved.
 */
function businessTimeParts(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

    const read = (type) =>
      Number(parts.find((part) => part.type === type)?.value);

    return {
      year: read('year'),
      month: read('month'),
      day: read('day'),
      hour: read('hour'),
      minute: read('minute'),
      second: read('second'),
    };
  } catch (error) {
    return null;
  }
}

/*
 * The BUSINESS calendar day of an instant, as 'YYYY-MM-DD'.
 *
 * This is the rule for every instant the application handles: a payment posted
 * at 20:00Z is the next day in Kabul, and that is the day it belongs to.
 */
function kabulDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = businessTimeParts(date);

  if (!parts) {
    /* ICU-less runtime: Kabul is a fixed UTC+04:30 book. */
    const shifted = new Date(
      date.getTime() + BUSINESS_OFFSET_FALLBACK_MINUTES * 60 * 1000,
    );

    return shifted.toISOString().slice(0, 10);
  }

  return [parts.year, pad(parts.month), pad(parts.day)].join('-');
}

/*
 * The BUSINESS timezone's UTC offset in minutes (Kabul -> +270), measured from
 * ICU for the instant given (so a timezone with DST would still be exact).
 *
 * SQL cannot ask Node what "business local" means, so the fiscal-year windows
 * are handed this number as a literal — the same rule this module applies in
 * JavaScript, in every process timezone.
 */
function businessOffsetMinutes(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return BUSINESS_OFFSET_FALLBACK_MINUTES;
  }

  const parts = businessTimeParts(date);

  if (!parts) {
    return BUSINESS_OFFSET_FALLBACK_MINUTES;
  }

  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  const instant = Math.floor(date.getTime() / 1000) * 1000;

  return Math.round((wallClock - instant) / 60000);
}

/*
 * The process's own calendar day of an instant, as 'YYYY-MM-DD'.
 *
 * NOT an accounting rule any more: kept because a caller may legitimately ask
 * about the machine's day, but nothing that decides an accounting date may use
 * it (use kabulDateOnly).
 */
function localDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
}

/*
 * Resolves the value to store in an accounting date column.
 *
 *   'YYYY-MM-DD'  returned untouched — never round-tripped through Date, so
 *                 the calendar day cannot shift.
 *   Date / other  returned untouched — mysql2 encodes it in the pool's "Z"
 *                 frame, which is how the existing sale, purchase and
 *                 journal paths already write their accounting dates.
 *   empty         the fallback, expressed as a LOCAL calendar day so a
 *                 missing document date can never land on the UTC day.
 *
 * Returns null when the fallback itself is unusable.
 */
function accountingDate(value, { fallback = new Date() } = {}) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? resolveFallback(fallback) : value;
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return resolveFallback(fallback);
}

function resolveFallback(fallback) {
  if (fallback === null || fallback === undefined) {
    return null;
  }

  return fallback instanceof Date ? kabulDateOnly(fallback) : fallback;
}

/*
 * True when the value carries an explicit calendar day (rather than an
 * instant), so a caller can tell a user-chosen accounting date apart from a
 * posting timestamp.
 */
function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

/*
 * ---------------------------------------------------------------------------
 * READING a stored accounting date back (the ONE rule, Step 5 hardening)
 * ---------------------------------------------------------------------------
 *
 * An accounting date column is a DATETIME, and production holds two families
 * of values in it:
 *
 *   calendar day   written from a 'YYYY-MM-DD' string by the Step 3.5 paths.
 *                  mysql2 stores it as midnight and the pool reads it back as
 *                  midnight in the "Z" frame, so the day is unambiguous.
 *   instant        written by older paths that passed `new Date()` or
 *                  `toISOString()`. The stored value is the UTC instant, so
 *                  its ACCOUNTING day is the BUSINESS (Kabul) day of that
 *                  instant — which is what the user actually posted it on.
 *
 * Reading both with one getter is what produced the fiscal-year mismatch:
 * the posting guard read instants in one frame while the closing engine and
 * the SQL windows read them in another (previous day for any posting after
 * 19:30 Kabul). `storedCalendarDay` is the single decision:
 *
 *   midnight in the storage frame -> that day (a calendar-day value)
 *   anything with a time of day   -> the BUSINESS calendar day of the instant
 *
 * It is correct in every server timezone, because it never applies an offset
 * to a value that already is a day, and the offset it does apply is Kabul's —
 * never the process's.
 */
function isMidnightUtc(date) {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/*
 * Parses a stored/ISO string as the UTC instant its frame implies. A value
 * without an explicit zone is treated as storage-framed ("Z"), which is how
 * the pool reads every date column; 'YYYY-MM-DD HH:MM:SS' is therefore read
 * the same way a DB row is.
 */
function parseStoredInstant(text) {
  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(zoned);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function storedCalendarDay(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    return isMidnightUtc(value)
      ? value.toISOString().slice(0, 10)
      : kabulDateOnly(value);
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (DATE_ONLY.test(text)) {
    return text;
  }

  const parsed = parseStoredInstant(text);

  if (!parsed) {
    const day = text.slice(0, 10);

    return DATE_ONLY.test(day) ? day : null;
  }

  return storedCalendarDay(parsed);
}

/*
 * ---------------------------------------------------------------------------
 * WRITING an accounting date (no new instants)
 * ---------------------------------------------------------------------------
 *
 * Whatever the caller hands over — a Date, an ISO instant, a calendar day —
 * the column receives a CALENDAR DAY ('YYYY-MM-DD'), so the value can never
 * again mean two different days depending on who reads it. The day used for an
 * instant is the BUSINESS (Kabul) day, the same rule `storedCalendarDay` reads
 * back, so writing and reading round-trip exactly — and identically on a server
 * whose process timezone is UTC.
 *
 * A value that cannot be read as a date is passed through untouched (the
 * previous behaviour) instead of being turned into NULL.
 */
function storageCalendarDay(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : kabulDateOnly(value);
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (DATE_ONLY.test(text)) {
    return text;
  }

  const parsed = parseStoredInstant(text);

  return parsed ? kabulDateOnly(parsed) : text;
}

/*
 * The STORED wall-clock day of a value that was never an instant.
 *
 * `created_at` is the only such column the fiscal-year windows touch: MySQL
 * writes it with NOW() in the session's clock, so what is stored IS a calendar
 * day, already local. Reading it back as an instant (the way journals.date is
 * read) would move it a day for late-evening rows and disagree with SQL, which
 * compares the stored value directly. Used for that column's diagnostics only.
 */
function storedWallClockDay(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  if (DATE_ONLY.test(text)) {
    return text;
  }

  const day = text.slice(0, 10);

  return DATE_ONLY.test(day) ? day : null;
}

module.exports = {
  BUSINESS_TIME_ZONE,
  accountingDate,
  localDateOnly,
  kabulDateOnly,
  businessOffsetMinutes,
  storedWallClockDay,
  isDateOnly,
  storedCalendarDay,
  storageCalendarDay,
};
