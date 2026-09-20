/*
 * Current fiscal year (Step 5).
 *
 * The operational screens (sales, purchases, journals, payments, account
 * statements) default to the CURRENT fiscal year's date range, so the moment a
 * year is closed its documents stop appearing in the normal working screens.
 * Nothing is deleted or flagged: the rows simply fall outside the default
 * range, and the fiscal-year history can still scope a list to any year's
 * [start_date, end_date].
 *
 * Backward compatibility: when an organization has NO fiscal year configured
 * for today, `currentFiscalYearRange()` returns null and every screen keeps its
 * previous behaviour (either no date filter at all, or its own default). The
 * date filters themselves are never removed — a user can always widen or
 * replace the range by hand.
 *
 * The lookup is cached for the session and de-duplicated while in flight, so
 * opening five list screens costs one request.
 */

import { fiscalYearApi } from '../api/fiscalYearApi.js';

let cache = {
  loaded: false,
  fiscalYear: null,
};

let inflight = null;

/** Drops the memoized lookup (used after creating/editing/closing a year). */
export function resetCurrentFiscalYearCache() {
  cache = { loaded: false, fiscalYear: null };
  inflight = null;
}

/**
 * The fiscal year covering `date` (default: today), or null when the
 * organization has none. Never throws: a missing fiscal year is a valid,
 * backward-compatible state, not an error for an operational screen.
 */
export async function loadCurrentFiscalYear({ force = false, date } = {}) {
  if (!force && cache.loaded) {
    return cache.fiscalYear;
  }

  if (inflight) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const response = await fiscalYearApi.getCurrent(date);
      const fiscalYear = response?.data || null;

      cache = { loaded: true, fiscalYear };

      return fiscalYear;
    } catch (error) {
      /*
       * 404 FISCAL_YEAR_NOT_FOUND means "not configured", which must leave the
       * screens exactly as they were before this step. Any other failure is
       * also treated as "no scoping" so a temporary server problem can never
       * make an operational screen look empty.
       */
      cache = { loaded: true, fiscalYear: null };

      if (import.meta.env?.DEV && error?.status !== 404) {
        console.warn('Current fiscal year lookup failed:', error?.message);
      }

      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** `{ id, name, from, to }` of a fiscal-year object, or null. */
export function fiscalYearRangeOf(fiscalYear) {
  if (!fiscalYear?.start_date || !fiscalYear?.end_date) {
    return null;
  }

  return {
    id: fiscalYear.id ?? fiscalYear.local_id ?? null,
    name: fiscalYear.name || '',
    from: fiscalYear.start_date,
    to: fiscalYear.end_date,
  };
}

/** The current fiscal year as a `{ from, to }` date range, or null. */
export async function currentFiscalYearRange(options = {}) {
  const fiscalYear = await loadCurrentFiscalYear(options);

  return fiscalYearRangeOf(fiscalYear);
}

/**
 * Convenience for screens that keep two date strings: applies the current
 * fiscal year's range to them, and reports whether it changed anything so a
 * caller can skip a redundant reload.
 */
export async function applyCurrentFiscalYearRange(setter, options = {}) {
  const range = await currentFiscalYearRange(options);

  if (!range) {
    return null;
  }

  setter(range);

  return range;
}
