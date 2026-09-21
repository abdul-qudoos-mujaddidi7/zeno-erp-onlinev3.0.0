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
 *
 * TWO POLICIES, DELIBERATELY DIFFERENT
 * ------------------------------------
 * NEW transactions: the accounting day is the BUSINESS (Kabul) calendar day of
 * the moment (`kabulDateOnly`, `storageCalendarDay`), so a payment posted at
 * 00:30 Kabul belongs to the new day even on a server whose own day lags.
 *
 * STORED / HISTORICAL values: THE STORED SQL CALENDAR DAY IS AUTHORITATIVE, and
 * no offset is applied (`storedCalendarDay`). An audit of production found the
 * same DATETIME column holding calendar days, UTC instants AND migrated
 * wall-clock values, so an individual row's convention cannot be proven.
 * Historical reclassification is out of scope; see the READING section below.
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
 * READING a stored accounting date back (historical policy)
 * ---------------------------------------------------------------------------
 *
 * THE STORED SQL CALENDAR DAY IS AUTHORITATIVE. A stored value is never
 * shifted, by the business offset or by anything else:
 *
 *   '2026-12-31'                        -> 2026-12-31
 *   '2026-12-31 20:30:00'               -> 2026-12-31
 *   mysql2 Date '2026-12-31T20:30:00Z'  -> 2026-12-31
 *
 * Why: the DATETIME column demonstrably holds more than one convention —
 * calendar days written from 'YYYY-MM-DD', UTC instants written by older
 * `new Date()` paths, and migrated rows whose clock is a local wall time. An
 * audit of production found 7,627 non-midnight rows whose stored clock equals
 * their own row-insertion clock (a wall clock, not an instant); applying the
 * +270-minute business offset to those would move 129 of them a day forward.
 * No per-row test can separate the families, so the column is read at face
 * value and historical reclassification stays out of scope. A legacy
 * UTC-looking 20:30 therefore ALSO stays on its stored day — deliberately, not
 * by oversight.
 *
 * The +270 offset now applies to NEW transactions only (`kabulDateOnly` for a
 * default/"today" and `storageCalendarDay` for anything written), which is
 * where "the current business day" is decided.
 *
 * Because every reader shares this one function — the posting guard, the
 * closing engine and the fiscal-year SQL windows (which compare the stored
 * value directly) — a document can never be filed into one year by one path
 * and a different year by another.
 */
function isRealCalendarDay(text) {
  if (!DATE_ONLY.test(text)) {
    return false;
  }

  const [year, month, day] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));

  /* rejects 2026-02-30, 2026-13-01 and anything else that is not a real day */
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/*
 * Parses a string as the UTC instant its frame implies. Used by the WRITE path
 * to recognise an instant that must be resolved to a business day
 * (`storageCalendarDay`); the READ path never needs it, because a stored value
 * is read as its own calendar day.
 *
 * A value without an explicit zone is treated as storage-framed ("Z"), which
 * is how the pool reads every date column; 'YYYY-MM-DD HH:MM:SS' is therefore
 * parsed the same way a DB row is.
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
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    /*
     * UTC components, never local ones: the pool reads and writes this column
     * in the "Z" frame, so a stored '2026-12-31 20:30:00' arrives as 20:30Z and
     * its stored day is the 31st in every process timezone.
     */
    return [
      value.getUTCFullYear(),
      pad(value.getUTCMonth() + 1),
      pad(value.getUTCDate()),
    ].join('-');
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  /* a stored string's day is its first ten characters — no Date in between */
  const day = text.slice(0, 10);

  return isRealCalendarDay(day) ? day : null;
}

/*
 * ---------------------------------------------------------------------------
 * WRITING an accounting date (no new instants)
 * ---------------------------------------------------------------------------
 *
 * Whatever the caller hands over — a Date, an ISO instant, a calendar day —
 * the column receives a CALENDAR DAY ('YYYY-MM-DD'), so the value can never
 * again mean two different days depending on who reads it.
 *
 * The day chosen for an instant is the BUSINESS (Kabul) day: a payment posted
 * at 00:30 Kabul on 1 Jan is stored as '2027-01-01', never as the 31 Dec UTC
 * instant that a wall clock west of Kabul would read back. Reading is then
 * trivially stable — `storedCalendarDay` returns the stored day unchanged — and
 * identical on a server whose process timezone is UTC.
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

module.exports = {
  BUSINESS_TIME_ZONE,
  accountingDate,
  localDateOnly,
  kabulDateOnly,
  isDateOnly,
  storedCalendarDay,
  storageCalendarDay,
};
