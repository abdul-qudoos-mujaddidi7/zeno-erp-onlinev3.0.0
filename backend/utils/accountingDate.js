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
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

/*
 * The local calendar day of an instant, as 'YYYY-MM-DD'.
 *
 * Built from local components on purpose: toISOString() would answer with the
 * UTC day, which is a different calendar day for part of every day in any
 * non-UTC timezone.
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

  return fallback instanceof Date ? localDateOnly(fallback) : fallback;
}

/*
 * True when the value carries an explicit calendar day (rather than an
 * instant), so a caller can tell a user-chosen accounting date apart from a
 * posting timestamp.
 */
function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

module.exports = {
  accountingDate,
  localDateOnly,
  isDateOnly,
};
