/*
 * The business accounting day.
 *
 * A payment or invoice date is a CALENDAR DAY, not an instant. Sending
 * `new Date().toISOString()` sends a UTC instant, and its calendar day is a
 * different day from the business day for part of every day — at 02:00 local
 * in a UTC+4:30 book, the UTC day is still yesterday. That files the payment
 * (and the journal the backend derives from it) into the wrong day, and
 * potentially the wrong fiscal year.
 *
 * The business day is pinned to the organization's calendar rather than to
 * the operator's browser: the same convention the sale invoice date already
 * uses (calendar.js `getKabulDate`), the Persian calendar display uses, and
 * the default AFN currency implies. A laptop set to UTC therefore cannot
 * post yesterday's date, and every user sees the same business day.
 *
 * `getKabulDate` in calendar.js delegates here, so this is the single
 * implementation of the rule.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Kabul';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/*
 * 'YYYY-MM-DD' for the business calendar day of an instant.
 *
 * Built with Intl.formatToParts so the result never passes through UTC:
 * `toISOString().slice(0, 10)` would answer with the UTC day instead.
 */
export function toAccountingDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce((result, part) => {
      result[part.type] = part.value;

      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/* Today's business accounting day, as 'YYYY-MM-DD'. */
export function todayAccountingDate() {
  return toAccountingDateString(new Date());
}

/*
 * The value to send for a date the user may or may not have chosen.
 *
 *   '' / null / undefined -> today's business day
 *   'YYYY-MM-DD'          -> returned untouched (never round-tripped
 *                            through Date, which is what shifts the day)
 *   anything else         -> today's business day
 */
export function paymentDateForInput(value) {
  if (typeof value === 'string' && DATE_ONLY.test(value.trim())) {
    return value.trim();
  }

  return todayAccountingDate();
}

/*
 * True when the value is already a calendar day rather than an instant, so a
 * caller can tell a user-chosen date apart from a stored timestamp.
 */
export function isAccountingDateString(value) {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

/*
 * The calendar day of a value that may be stored either way.
 *
 * Rows written before this step hold a UTC instant; rows written since hold
 * a calendar day. Both must display the same day the backend stored, so a
 * date-only string is returned as-is and a timestamp is only ever read
 * through the UTC day its own naive value already represents — never through
 * the viewer's timezone.
 */
export function accountingDateOfStoredValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const text = String(value);

  if (DATE_ONLY.test(text.slice(0, 10))) {
    return text.slice(0, 10);
  }

  return toAccountingDateString(value);
}
