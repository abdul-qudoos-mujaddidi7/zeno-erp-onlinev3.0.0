/*
 * Which fiscal year the operational screens work in.
 *
 * Normal case: the fiscal year that contains today, while it is OPEN.
 *
 * A year can be closed BEFORE its end date, and then today falls inside a
 * CLOSED year. The working screens must not keep showing that year's documents
 * — a closed year is archived, not "current" — so the working year falls
 * forward to the nearest OPEN one:
 *
 *   1. the year containing today, when it is open;
 *   2. otherwise the earliest OPEN year that starts after today (this is the
 *      successor a close creates automatically);
 *   3. otherwise the latest OPEN year (best available);
 *   4. otherwise null — no open year exists, and every screen keeps its
 *      previous, unscoped behaviour instead of scoping to a year that must not
 *      be posted into.
 *
 * Pure functions only (no imports, no I/O) so the rule can be unit tested
 * without a browser or a server.
 */

/** `open` (and any missing status, for rows written before the column existed). */
export function isOpenFiscalYear(year) {
  if (!year) {
    return false;
  }

  const status = String(year.fiscal_status ?? 'open').trim().toLowerCase();

  return status === '' || status === 'open';
}

/** `open`/`closed`, read defensively. */
export function fiscalYearStatus(year) {
  return String(year?.fiscal_status ?? 'open').trim().toLowerCase();
}

/**
 * Not soft-deleted (status = 1). The list endpoint hides deleted rows unless it
 * is asked for them, so this is a defence, not the primary filter.
 */
export function isActiveFiscalYear(year) {
  if (!year) {
    return false;
  }

  return Number(year.status ?? 1) !== 0;
}

function startDateOf(year) {
  return String(year?.start_date ?? '');
}

function byStartAscending(left, right) {
  return startDateOf(left) < startDateOf(right)
    ? -1
    : startDateOf(left) > startDateOf(right)
      ? 1
      : 0;
}

/**
 * @param covering the year that contains `today` (may be closed, or null)
 * @param years    every fiscal year of the organization
 * @param today    `YYYY-MM-DD` of the business day
 */
export function selectWorkingFiscalYear({
  covering = null,
  years = [],
  today = null,
} = {}) {
  if (isActiveFiscalYear(covering) && isOpenFiscalYear(covering)) {
    return covering;
  }

  const open = (Array.isArray(years) ? years : []).filter(
    (year) => isActiveFiscalYear(year) && isOpenFiscalYear(year),
  );

  if (open.length === 0) {
    return null;
  }

  if (today) {
    const next = [...open].sort(byStartAscending).find(
      (year) => startDateOf(year) > String(today),
    );

    if (next) {
      return next;
    }
  }

  return [...open].sort(byStartAscending)[open.length - 1];
}

/**
 * True when a date range currently shown by a screen is exactly the working
 * fiscal year's range — i.e. the range the balance and the opening-balance row
 * belong to. A hand-edited range is no longer that year.
 */
export function isWorkingFiscalYearRange(workingYear, from, to) {
  if (!workingYear?.start_date || !workingYear?.end_date) {
    return false;
  }

  return String(from ?? '') === String(workingYear.start_date) &&
    String(to ?? '') === String(workingYear.end_date);
}
