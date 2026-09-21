/**
 * Fiscal-period posting guard (Step 4.5).
 *
 * ONE implementation of "may this accounting date still be written?".
 *
 * Every financial mutation funnels through `assertAccountingDateOpen` (or its
 * multi-date sibling) instead of each service re-querying fiscal years:
 *
 *   journal create / update / delete
 *   sale create / update / delete, sale return create / delete
 *   purchase create / update / delete, purchase return create / delete
 *   sale + purchase payments (create / update / delete / refund)
 *   account opening balance
 *   every module that writes a financial journal of its own
 *
 * POLICY
 *
 *   date inside a CLOSED fiscal year   -> 409 FISCAL_YEAR_CLOSED
 *   date inside an OPEN fiscal year    -> allowed
 *   no fiscal year configured for date -> allowed (backward compatible)
 *   document has no usable date        -> allowed (nothing to classify)
 *
 * The third rule matters in production: this table was introduced after the
 * application had been running for years, so most organizations' historical
 * (and even current) dates still have no fiscal year. Blocking those would
 * take the application down on deploy; classifying a date into a year is an
 * explicit act, and "every date must belong to a fiscal year" can become a
 * separate, opt-in setting later.
 *
 * Historical data is never touched: this guard only rejects NEW mutation
 * attempts.
 *
 * CONCURRENCY
 *
 * The fiscal-year lookup is a LOCKING read (`LOCK IN SHARE MODE`, the syntax
 * this server — MariaDB 10.4 — supports; `FOR SHARE` is MySQL 8.0 only).
 *
 * The lock is what makes the Step 4 close race-free:
 *
 *   posting starts -> takes a shared lock on the OPEN fiscal-year row
 *   close starts   -> needs an exclusive lock on that same row, so it WAITS
 *   posting commits -> its journals are visible
 *   close proceeds  -> its P&L window is read after the wait, so the posting
 *                      is included
 *
 * and the other way round:
 *
 *   close commits first -> the waiting posting re-reads the row with a locking
 *                          read (which always sees the latest committed data,
 *                          not its transaction snapshot) -> sees CLOSED ->
 *                          409 FISCAL_YEAR_CLOSED
 *
 * Shared locks are mutually compatible, so ordinary concurrent postings in
 * the same open year do not serialize against each other; only a close (or a
 * fiscal-year write) has to wait for them.
 *
 * Lock order stays consistent with the rest of the codebase: fiscal_years is
 * acquired before any journal/document row, which is the same order the close
 * uses (organizations -> fiscal_years -> journals).
 */

const AppError = require('../errors/AppError');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const {
  storedCalendarDay,
} = require('../utils/accountingDate');

const CLOSED_YEAR_ERROR = 'FISCAL_YEAR_CLOSED';

const REASONS = {
  NO_ACCOUNTING_DATE: 'no_accounting_date',
  NO_FISCAL_YEAR: 'no_fiscal_year',
  OPEN_FISCAL_YEAR: 'open_fiscal_year',
};

/*
 * Resolves any accounting-date value to a comparable calendar day
 * ('YYYY-MM-DD'), or null when the value carries no usable date.
 *
 * This is `storedCalendarDay` from utils/accountingDate — the ONE rule. It
 * matters that the guard does not have an opinion of its own here: the closing
 * engine and the fiscal-year SQL windows classify a stored date with the same
 * function (or its SQL mirror), so a document cannot belong to FY2026 for one
 * code path and FY2027 for another.
 *
 * Concretely, an accounting-date column written by an older path holds the UTC
 * instant of the posting; its accounting day is the LOCAL day of that instant
 * (`2026-09-09 20:00Z` is the 10th in Kabul), while a value written as
 * 'YYYY-MM-DD' is already a day and is never shifted.
 */
function toCalendarDay(value) {
  return storedCalendarDay(value);
}

function closedYearError({
  orgId,
  fiscalYear,
  accountingDate,
  operation,
}) {
  const name = fiscalYear.name || `fiscal year ${fiscalYear.local_id}`;

  return new AppError(
    `Fiscal year ${name} (${fiscalYear.start_date} to ${fiscalYear.end_date}) is closed. ` +
      `${operation} cannot change accounting activity dated ${accountingDate}.`,
    409,
    CLOSED_YEAR_ERROR,
    {
      org_id: orgId,
      operation,
      accounting_date: accountingDate,
      fiscal_year_id: fiscalYear.local_id,
      fiscal_year_name: name,
      start_date: fiscalYear.start_date,
      end_date: fiscalYear.end_date,
      fiscal_status: 'closed',
    },
  );
}

/*
 * Rejects the operation when the date belongs to a closed fiscal year.
 *
 * Returns a small verdict object so a caller (or a test) can see WHY a write
 * was allowed; nothing is ever returned for the rejected case because the
 * guard throws before the caller mutates anything.
 *
 * `lock: false` is for read-only callers. Every writer inside a transaction
 * should keep the default so the close cannot slip past it.
 */
async function assertAccountingDateOpen(
  executor,
  {
    orgId,
    date,
    operation,
    lock = true,
  },
) {
  const accountingDate = toCalendarDay(date);

  if (!accountingDate) {
    return {
      allowed: true,
      reason: REASONS.NO_ACCOUNTING_DATE,
      accounting_date: null,
      fiscal_year: null,
    };
  }

  const fiscalYear = await fiscalYearRepository.findCoveringDate(
    executor,
    {
      orgId,
      date: accountingDate,
      lock: lock ? 'share' : null,
    },
  );

  if (!fiscalYear) {
    return {
      allowed: true,
      reason: REASONS.NO_FISCAL_YEAR,
      accounting_date: accountingDate,
      fiscal_year: null,
    };
  }

  if (String(fiscalYear.fiscal_status || 'open').toLowerCase() !== 'open') {
    throw closedYearError({
      orgId,
      fiscalYear,
      accountingDate,
      operation,
    });
  }

  return {
    allowed: true,
    reason: REASONS.OPEN_FISCAL_YEAR,
    accounting_date: accountingDate,
    fiscal_year: fiscalYear,
  };
}

/*
 * The same check for a set of dates. Used where one request already implies
 * several accounting dates:
 *
 *   - an edit that moves a document from one date to another (old AND new,
 *     because moving a document OUT of a closed year changes that year just
 *     as much as moving one INTO it),
 *   - a delete/reversal that also reverses the document's returns and
 *     payments, each of which has its own date.
 *
 * Null/undefined entries are ignored, so callers can pass optional dates
 * (e.g. an omitted `payment_date` in a patch) without special-casing.
 */
async function assertAccountingDatesOpen(
  executor,
  {
    orgId,
    dates,
    operation,
    lock = true,
  },
) {
  const verdicts = [];

  for (const date of dates || []) {
    verdicts.push(
      await assertAccountingDateOpen(executor, {
        orgId,
        date,
        operation,
        lock,
      }),
    );
  }

  return verdicts;
}

module.exports = {
  CLOSED_YEAR_ERROR,
  REASONS,
  toCalendarDay,
  assertAccountingDateOpen,
  assertAccountingDatesOpen,
};
