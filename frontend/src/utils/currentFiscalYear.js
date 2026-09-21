/*
 * Working fiscal year (Step 5).
 *
 * The operational screens (sales, purchases, journals, payments, account
 * statements) default to the WORKING fiscal year's date range, so the moment a
 * year is closed its documents stop appearing in the normal working screens.
 * Nothing is deleted or flagged: the rows simply fall outside the default
 * range, and the fiscal-year history can still scope a list to any year's
 * [start_date, end_date].
 *
 * "Working" is the year containing today WHILE IT IS OPEN. A year closed before
 * its end date leaves today inside a CLOSED year, and scoping the screens to it
 * would keep showing exactly the documents the close archived; in that case the
 * working year is the nearest OPEN one (see fiscalYearSelection.js).
 *
 * Backward compatibility: when an organization has NO open fiscal year to work
 * in, `currentFiscalYearRange()` returns null and every screen keeps its
 * previous behaviour (either no date filter at all, or its own default). The
 * date filters themselves are never removed — a user can always widen or
 * replace the range by hand, and the fiscal-year history still exposes every
 * closed year's documents.
 *
 * The lookup is cached for the session and de-duplicated while in flight, so
 * opening five list screens costs one request (two after an early close, when
 * the year list has to be consulted).
 */

import { fiscalYearApi } from '../api/fiscalYearApi.js';
import { todayAccountingDate } from './accountingDate.js';
import {
  isOpenFiscalYear,
  selectWorkingFiscalYear,
} from './fiscalYearSelection.js';

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
 * Makes an already-authoritative fiscal-year response the working year.
 *
 * Reopening is the inverse of closing: the documents in that year must become
 * visible again on every operational screen.  Using the reopened row directly
 * also avoids selecting the still-open successor year that the earlier close
 * created for its roll-forward.
 */
export function setCurrentFiscalYear(fiscalYear) {
  cache = { loaded: true, fiscalYear: fiscalYear || null };
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
    let covering = null;

    try {
      const response = await fiscalYearApi.getCurrent(date);

      covering = response?.data || null;
    } catch (error) {
      /*
       * 404 FISCAL_YEAR_NOT_FOUND means "not configured", which must leave the
       * screens exactly as they were before this step. Any other failure is
       * also treated as "not configured" so a temporary server problem can
       * never make an operational screen look empty.
       */
      covering = null;

      if (import.meta.env?.DEV && error?.status !== 404) {
        console.warn('Current fiscal year lookup failed:', error?.message);
      }
    }

    try {
      /*
       * The year covering today only wins while it is OPEN. After an early
       * close, today sits inside a CLOSED year, and scoping the working screens
       * to it would keep showing the documents the close just archived.
       */
      let working = covering;

      if (!isOpenFiscalYear(covering)) {
        const listResponse = await fiscalYearApi
          .getAll()
          .catch(() => null);

        working = selectWorkingFiscalYear({
          covering,
          years: listResponse?.data || [],
          today: date || todayAccountingDate(),
        });
      }

      cache = { loaded: true, fiscalYear: working || null };

      return cache.fiscalYear;
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
