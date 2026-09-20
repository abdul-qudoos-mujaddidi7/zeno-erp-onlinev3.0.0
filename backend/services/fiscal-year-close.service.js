/**
 * Fiscal-year CLOSING engine (Step 4).
 *
 * The close is ADDITIVE and AUDITABLE: it never deletes, rewrites or
 * re-dates a historical journal, never resets inventory, and never touches
 * customer, supplier, cash or owner balances. Its only effects are
 *
 *   1. one or more balanced closing journals per currency, dated with the
 *      fiscal year's end_date, identified by
 *      reference_type = 'fiscal_year_close' / reference_id = <year id>,
 *      that move each P&L account's period result into RETAINED, and
 *   2. fiscal_status OPEN -> CLOSED with closed_at / closed_by.
 *
 * Accounting model this respects (verified against the live code, see the
 * Step 4 report):
 *
 *   SALES     revenue                        (normally credit)
 *   PURCHASE  period cost, expensed on receipt — there is no inventory asset
 *             or COGS ledger account in this application
 *   EXPENSES  period expense
 *   BENEFITS  exchange gain/loss             (debit OR credit)
 *
 * P&L accounts are identified by system account CODE, never by
 * account_type_id: account_type_id is per organization and is not a reliable
 * classifier across organizations.
 *
 * Currencies are closed SEPARATELY. AFN + USD are never summed, and no
 * exchange rate is invented at year end: each currency bucket independently
 * nets to zero through its own balanced journals.
 */

const db = require('../database/pool');

const AppError = require('../errors/AppError');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const fiscalYearCloseRepository =
  require('../repositories/fiscal-year-close.repository');

const fiscalYearOpeningRepository =
  require('../repositories/fiscal-year-opening.repository');

const accountRepository =
  require('../repositories/account.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const accountService =
  require('./account.service');

/*
 * Only the naming rule is borrowed, so a year the close creates automatically
 * is named exactly like a year created by hand (`FY 2026` /
 * `FY 2026-2027`). fiscal-year.service does not import this module, so there
 * is no cycle; the close engine still owns the transaction.
 */
const {
  defaultYearName,
} = require('./fiscal-year.service');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  PNL_ACCOUNT_CODES,
  RETAINED_ACCOUNT_CODE,
} = require('../constants/systemAccounts');

const CLOSING_REFERENCE_TYPE =
  'fiscal_year_close';

/*
 * Where an opening-balance snapshot came from. Closing is the only producer in
 * this step; the column exists so a future, explicitly approved manual
 * opening-balance feature cannot collide with the close's unique key.
 */
const OPENING_BALANCE_SOURCE =
  'fiscal_year_close';

const OPEN_STATUS = 'open';
const CLOSED_STATUS = 'closed';

/*
 * Business errors of the roll-forward. The receiving year is never invented:
 * when the next year is missing or is not open, the CLOSE ITSELF is refused,
 * because a year may not be marked CLOSED while the balances it must carry
 * forward have nowhere to go.
 */
const NEXT_FISCAL_YEAR_REQUIRED =
  'NEXT_FISCAL_YEAR_REQUIRED';

const NEXT_FISCAL_YEAR_NOT_OPEN =
  'NEXT_FISCAL_YEAR_NOT_OPEN';

/*
 * The day after the closed year ends is already inside ANOTHER fiscal year, so
 * no receiving year can be created for the roll-forward without producing
 * overlapping fiscal years. Configuration problem, reported instead of fixed.
 */
const NEXT_FISCAL_YEAR_CONFLICT =
  'NEXT_FISCAL_YEAR_CONFLICT';

const RECEIVING_FISCAL_YEAR_CLOSED =
  'RECEIVING_FISCAL_YEAR_CLOSED';

const FISCAL_YEAR_NOT_CLOSED =
  'FISCAL_YEAR_NOT_CLOSED';

const OPENING_BALANCES_ALREADY_EXIST =
  'FISCAL_YEAR_OPENING_BALANCES_EXIST';

const AMOUNT_DECIMALS = 6;

const DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

/*
 * Same calendar-day rule as the fiscal-year foundation and the accounting
 * date helper: a DATE column is compared as a plain YYYY-MM-DD string, so no
 * timezone conversion can move the year boundary.
 */
function toDateOnly(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  if (DATE_PATTERN.test(text)) {
    return text;
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeYear(row) {
  if (!row) return null;

  return {
    ...row,
    start_date: toDateOnly(row.start_date),
    end_date: toDateOnly(row.end_date),
    fiscal_status: String(
      row.fiscal_status || OPEN_STATUS,
    ).toLowerCase(),
  };
}

/*
 * Money is rounded to the 6 decimals the DECIMAL(20,6) journal columns can
 * actually store. Without this, summing DECIMAL strings as JS floats can
 * leave a 1e-13 remnant and produce a meaningless zero journal line.
 */
function toAmount(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const factor = 10 ** AMOUNT_DECIMALS;

  return Math.round(number * factor) / factor;
}

/*
 * Currency is used verbatim (only trimmed): a bucket must stay byte-identical
 * to the source journals, otherwise a closing line would not cancel the very
 * activity it is meant to close.
 */
function normalizeCurrency(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text === '' ? null : text;
}

function currencyKey(currency) {
  return currency === null ? '' : currency;
}

function currencyLabel(currency) {
  return currency === null ? 'unspecified' : currency;
}

/*
 * Calendar-day arithmetic on YYYY-MM-DD strings. Done in UTC so a server in
 * any timezone can never move the boundary: the next fiscal year starts the
 * day AFTER the closed year ends, which is the rule the business stated.
 */
function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/*
 * Adds whole calendar years to a YYYY-MM-DD string, keeping the month and day.
 * A leap-day source is clamped to the last day of the target month
 * (2028-02-29 + 1 year = 2029-02-28), the same way MySQL's DATE_ADD does, so
 * the helper and a SQL-side calculation can never disagree.
 */
function addYears(dateOnly, years) {
  const year = Number(dateOnly.slice(0, 4)) + years;
  const month = Number(dateOnly.slice(5, 7));
  const day = Number(dateOnly.slice(8, 10));
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(
    Math.min(day, lastDayOfMonth),
  ).padStart(2, '0')}`;
}

/*
 * The fiscal year that FOLLOWS a closed year, derived from the date the closed
 * year ends (the rule the business asked for):
 *
 *   next.start_date = closed.end_date + 1 day
 *   next.end_date   = closed.end_date + 1 calendar year
 *
 * Deriving the end date one calendar year forward (instead of copying the
 * closed year's length in days) keeps the year boundaries stable: a 371-day
 * year does not push every later year forward, and a January-December books
 * year stays January-December forever.
 */
function nextFiscalYearRange(endDate) {
  return {
    start_date: addDays(endDate, 1),
    end_date: addYears(endDate, 1),
  };
}

function proposedNextFiscalYear(range) {
  return {
    id: null,
    local_id: null,
    name: defaultYearName(range.start_date, range.end_date),
    start_date: range.start_date,
    end_date: range.end_date,
    fiscal_status: OPEN_STATUS,
    status: 1,
    created: false,
  };
}

function normalizeAccount(row) {
  return {
    account_id: row.account_id,
    account_code:
      row.account_code === null || row.account_code === undefined
        ? null
        : String(row.account_code),
    account_name: row.account_name ?? null,
    account_type_id: row.account_type_id ?? null,
    currency: fiscalYearOpeningRepository.toApiCurrency(row.currency),
    entries: Number(row.entries) || 0,
    debit: toAmount(row.debit),
    credit: toAmount(row.credit),
    /*
     * Signed exactly like account.repository.findBalances: credit - debit.
     * Positive is a credit balance (cash after a receipt, a payable, owner
     * capital); negative is a debit balance (a receivable).
     */
    opening_balance: toAmount(toAmount(row.credit) - toAmount(row.debit)),
  };
}

/*
 * The opening balances a close will push into the receiving year.
 *
 * Selection rules (Step 5 brief):
 *   * balance-sheet accounts only — the four P&L system codes are excluded by
 *     CODE, never by account_type_id (which is per organization and was proven
 *     unreliable), because Step 4 has already closed them to zero through
 *     RETAINED;
 *   * a zero balance produces no row at all (no meaningless snapshots);
 *   * each currency is carried separately — AFN + USD are never summed.
 *
 * The P&L exclusion is applied here as well as in SQL on purpose: the service
 * must not depend on a caller having passed the right `excludedCodes`.
 */
function buildOpeningBalancePlan({
  fiscalYear,
  receivingFiscalYear,
  rows,
}) {
  const pnlCodes = new Set(
    PNL_ACCOUNT_CODES.map((code) => String(code).toUpperCase()),
  );

  const balances = [];

  for (const row of rows || []) {
    const code = String(row.account_code || '').trim().toUpperCase();

    if (pnlCodes.has(code)) {
      continue;
    }

    const balance = normalizeAccount(row);

    if (balance.opening_balance === 0) {
      continue;
    }

    balances.push({
      ...balance,
      balance_side: balance.opening_balance > 0 ? 'credit' : 'debit',
      fiscal_year_id: receivingFiscalYear?.id ?? null,
      source_fiscal_year_id: fiscalYear.id,
      source_fiscal_year_name: fiscalYear.name,
      receiving_fiscal_year_name: receivingFiscalYear?.name ?? null,
      source: OPENING_BALANCE_SOURCE,
    });
  }

  balances.sort((left, right) => {
    const leftCode = String(left.account_code || '');
    const rightCode = String(right.account_code || '');

    if (leftCode !== rightCode) {
      return leftCode < rightCode ? -1 : 1;
    }

    if (String(left.account_id) !== String(right.account_id)) {
      return String(left.account_id) < String(right.account_id) ? -1 : 1;
    }

    return left.currency < right.currency
      ? -1
      : left.currency > right.currency
        ? 1
        : 0;
  });

  const byCurrency = new Map();

  for (const balance of balances) {
    const key = fiscalYearOpeningRepository.normalizeCurrency(balance.currency);
    const bucket = byCurrency.get(key) || {
      currency: balance.currency,
      total: 0,
      accounts: 0,
    };

    bucket.total = toAmount(bucket.total + balance.opening_balance);
    bucket.accounts += 1;

    byCurrency.set(key, bucket);
  }

  return {
    balances,
    count: balances.length,
    by_currency: [...byCurrency.values()],
  };
}

/*
 * The receiving fiscal year: it must START the day after the closed year ends
 * and it must still be OPEN.
 *
 * Looks for that year by exact start date rather than "the next year that
 * begins after X", because a gap between two configured years has to be
 * visible instead of silently rolling balances somewhere unexpected.
 */
async function findReceivingFiscalYear(
  executor,
  {
    orgId,
    fiscalYear,
    forUpdate = false,
  },
) {
  const startDate = addDays(fiscalYear.end_date, 1);

  const row =
    await fiscalYearRepository.findByStartDate(
      executor,
      {
        orgId,
        startDate,
        forUpdate,
      },
    );

  if (!row || Number(row.status) === 0) {
    return {
      start_date: startDate,
      fiscal_year: null,
      status: 'missing',
    };
  }

  const receiving = normalizeYear(row);

  return {
    start_date: startDate,
    fiscal_year: receiving,
    status: receiving.fiscal_status,
  };
}

/*
 * Resolves — and, when the close asks for it, CREATES — the year that receives
 * the closing balances.
 *
 * The business rule is "the next fiscal year starts on the day this one ends,
 * plus one", so a missing successor is no longer a dead end: the close creates
 * it in the SAME transaction (rolling it back with everything else if the
 * close fails) and rolls the balances into it. Nothing is invented beyond the
 * one range that rule defines.
 *
 * Ordering inside the close transaction:
 *   1. organizations row (taken by the caller)
 *   2. every fiscal year of the organization, ordered by local_id
 *      (only when a year may be created, so an overlapping year cannot be
 *      configured concurrently)
 *   3. the receiving year
 *
 * `create: false` (the read-only preview) resolves exactly the same way but
 * only REPORTS what would happen.
 */
async function resolveReceivingFiscalYear(
  executor,
  {
    orgId,
    fiscalYear,
    userId = null,
    requestContext = null,
    create = false,
  },
) {
  const range = nextFiscalYearRange(fiscalYear.end_date);
  const proposed = proposedNextFiscalYear(range);

  /*
   * Locking every fiscal year of the organization before a possible INSERT is
   * what makes "no overlapping year" hold under concurrency: a manual
   * fiscal-year creation for the same organization cannot slip in between the
   * overlap check and the insert.
   */
  if (create) {
    await fiscalYearRepository.lockOrganizationYears(
      executor,
      {
        orgId,
      },
    );
  }

  const existing = await findReceivingFiscalYear(
    executor,
    {
      orgId,
      fiscalYear,
      forUpdate: create,
    },
  );

  if (existing.fiscal_year) {
    return {
      ...existing,
      created: false,
      will_create: false,
      proposed,
      conflict: null,
    };
  }

  /*
   * Never create a year that would overlap an existing one. A clash here means
   * the day after the closed year is already inside another year — a
   * configuration problem the operator has to resolve, not something to guess
   * around.
   */
  const overlapping = await fiscalYearRepository.findOverlapping(
    executor,
    {
      orgId,
      startDate: range.start_date,
      endDate: range.end_date,
    },
  );

  if (overlapping.length > 0) {
    return {
      start_date: range.start_date,
      fiscal_year: null,
      status: 'conflict',
      created: false,
      will_create: false,
      proposed,
      conflict: normalizeYear(overlapping[0]),
    };
  }

  if (!create) {
    return {
      start_date: range.start_date,
      fiscal_year: null,
      status: 'missing',
      created: false,
      will_create: true,
      proposed,
      conflict: null,
    };
  }

  const localId = generateLocalId();

  const row = await fiscalYearRepository.create(
    executor,
    {
      orgId,
      localId,
      userId,
      data: {
        name: proposed.name,
        start_date: range.start_date,
        end_date: range.end_date,
        note:
          `Created automatically by the close of ${fiscalYear.name} ` +
          `(${fiscalYear.start_date} to ${fiscalYear.end_date}).`,
      },
    },
  );

  const created = normalizeYear(row) || {
    ...proposed,
    id: localId,
    local_id: localId,
  };

  return {
    start_date: range.start_date,
    fiscal_year: created,
    status: created.fiscal_status,
    created: true,
    will_create: false,
    proposed,
    conflict: null,
  };
}

function assertReceivingFiscalYear(
  receiving,
  fiscalYear,
) {
  if (receiving.conflict) {
    throw new AppError(
      `The day after ${fiscalYear.name} ends (${receiving.start_date}) already falls inside ${receiving.conflict.name}. Adjust the fiscal-year ranges so the next year can start on ${receiving.start_date}, then close this year.`,
      409,
      NEXT_FISCAL_YEAR_CONFLICT,
      {
        fiscal_year_id: fiscalYear.id,
        fiscal_year_name: fiscalYear.name,
        closed_end_date: fiscalYear.end_date,
        required_next_start_date: receiving.start_date,
        conflicting_fiscal_year_id: receiving.conflict.id,
        conflicting_fiscal_year_name: receiving.conflict.name,
        conflicting_fiscal_year_start_date:
          receiving.conflict.start_date,
        conflicting_fiscal_year_end_date:
          receiving.conflict.end_date,
      },
    );
  }

  if (!receiving.fiscal_year) {
    throw new AppError(
      `Closing ${fiscalYear.name} requires the next fiscal year (starting ${receiving.start_date}). Create it first, then close this year.`,
      409,
      NEXT_FISCAL_YEAR_REQUIRED,
      {
        fiscal_year_id: fiscalYear.id,
        fiscal_year_name: fiscalYear.name,
        closed_end_date: fiscalYear.end_date,
        required_next_start_date: receiving.start_date,
      },
    );
  }

  if (receiving.fiscal_year.fiscal_status !== OPEN_STATUS) {
    throw new AppError(
      `The next fiscal year ${receiving.fiscal_year.name} is closed. Reopen it before closing ${fiscalYear.name}, so its opening balances can be written.`,
      409,
      NEXT_FISCAL_YEAR_NOT_OPEN,
      {
        fiscal_year_id: fiscalYear.id,
        next_fiscal_year_id: receiving.fiscal_year.id,
        next_fiscal_year_status:
          receiving.fiscal_year.fiscal_status,
      },
    );
  }
}

function findRetainedAccount(executor, { orgId }) {
  return accountRepository.findByCode(executor, {
    orgId,
    code: RETAINED_ACCOUNT_CODE,
  });
}

/*
 * Exactly one ACTIVE RETAINED account per organization.
 *
 * A soft-deleted RETAINED is revived rather than duplicated: `findByCode` has
 * no ORDER BY, so a second row with the same code would make every later
 * close post into an arbitrary one of the two.
 *
 * Concurrency: closes are serialized per organization by the organizations
 * row lock taken before this runs, so two simultaneous closes cannot both
 * provision.
 */
async function ensureRetainedAccount(
  connection,
  {
    orgId,
    userId,
  },
) {
  const existing = await findRetainedAccount(
    connection,
    {
      orgId,
    },
  );

  if (existing && Number(existing.status) === 1) {
    return {
      account: existing,
      created: false,
      restored: false,
      account_type_id: existing.account_type_id ?? null,
    };
  }

  if (existing) {
    const restored =
      await accountRepository.update(
        connection,
        {
          orgId,
          localId: existing.local_id,
          userId,
          data: {
            status: 1,
            account_status: 'active',
          },
        },
      );

    return {
      account: restored || existing,
      created: false,
      restored: true,
      account_type_id:
        (restored || existing).account_type_id ?? null,
    };
  }

  const accountTypeId =
    await fiscalYearCloseRepository.findPreferredAccountTypeId(
      connection,
      {
        orgId,
      },
    );

  const localId = generateLocalId();

  const account =
    await accountRepository.create(
      connection,
      {
        orgId,
        localId,
        userId,
        data: {
          account_status: 'active',
          account_type_id: accountTypeId,
          account_group_id: null,
          code: RETAINED_ACCOUNT_CODE,
          name: 'Retained Earnings',
          name_fa: 'سود انباشته',
          name_ps: 'سود انباشته',
          balance: 0,
          currency: null,
          description:
            'System account: accumulated business profit carried forward by the fiscal-year close. Owner capital and drawings belong on their own accounts, never here.',
          main_acc: 'true',
          status: 1,
        },
      },
    );

  return {
    account,
    created: true,
    restored: false,
    account_type_id: accountTypeId,
  };
}

/*
 * Turns period activity into the closing journals.
 *
 * Per (P&L account, currency), net = credit - debit:
 *
 *   net > 0 (credit balance, e.g. revenue)
 *       DEBIT the P&L account, CREDIT RETAINED
 *   net < 0 (debit balance, e.g. a cost)
 *       CREDIT the P&L account, DEBIT RETAINED
 *
 * A loss needs no special case: the direction reverses automatically, so
 * "profit is credit" is never hard-coded.
 *
 * The journal table stores exactly two entry positions per row, so one
 * compound closing entry is represented as one balanced row per P&L account
 * and currency, all sharing the same reference. Each row balances on its own,
 * and their total per currency balances too.
 *
 * A net of exactly 0 produces no line at all: closing a year must never
 * create meaningless zero-value journals.
 */
function buildClosingPlan({
  fiscalYear,
  retainedAccountId,
  rows,
}) {
  const buckets = new Map();

  for (const row of rows) {
    const net = toAmount(
      toAmount(row.credit) - toAmount(row.debit),
    );

    if (net === 0) {
      continue;
    }

    const currency = normalizeCurrency(row.currency);
    const key = currencyKey(currency);

    const bucket = buckets.get(key) || {
      currency,
      lines: [],
      profit_loss: 0,
      accounts: [],
    };

    const isCreditBalance = net > 0;
    const amount = Math.abs(net);

    const account = {
      account_local_id: row.account_local_id,
      code: row.account_code,
      name: row.account_name,
      debit: toAmount(row.debit),
      credit: toAmount(row.credit),
      net,
      position: isCreditBalance ? 'credit' : 'debit',
      result: isCreditBalance ? 'income' : 'expense',
      entries: Number(row.entries) || 0,
    };

    bucket.accounts.push(account);

    bucket.lines.push({
      currency,
      account_local_id: row.account_local_id,
      code: row.account_code,
      name: row.account_name,
      net,
      position: account.position,
      amount,
      date: fiscalYear.end_date,
      reference_type: CLOSING_REFERENCE_TYPE,
      reference_id: fiscalYear.id,
      description: closingLineDescription({
        fiscalYear,
        row,
        net,
        currency,
      }),
      first_entry_account: row.account_local_id,
      first_entry_debit: isCreditBalance ? amount : 0,
      first_entry_credit: isCreditBalance ? 0 : amount,
      second_entry_account: retainedAccountId,
      second_entry_debit: isCreditBalance ? 0 : amount,
      second_entry_credit: isCreditBalance ? amount : 0,
    });

    bucket.profit_loss = toAmount(bucket.profit_loss + net);

    buckets.set(key, bucket);
  }

  const currencies = [...buckets.values()].sort((left, right) => {
    const leftKey = currencyKey(left.currency);
    const rightKey = currencyKey(right.currency);

    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  for (const bucket of currencies) {
    bucket.result =
      bucket.profit_loss > 0
        ? 'profit'
        : bucket.profit_loss < 0
          ? 'loss'
          : 'breakeven';

    bucket.lines.sort((left, right) => {
      if (left.code !== right.code) {
        return left.code < right.code ? -1 : 1;
      }

      return String(left.account_local_id) < String(right.account_local_id)
        ? -1
        : 1;
    });
  }

  return {
    currencies,
    lines: currencies.flatMap((bucket) => bucket.lines),
    profit_loss: currencies.map((bucket) => ({
      currency: bucket.currency,
      profit_loss: bucket.profit_loss,
      result: bucket.result,
    })),
  };
}

function closingLineDescription({
  fiscalYear,
  row,
  net,
  currency,
}) {
  const direction = net > 0 ? 'credit' : 'debit';

  return (
    `Fiscal year close ${fiscalYear.name} ` +
    `(${fiscalYear.start_date} to ${fiscalYear.end_date}): ` +
    `${row.account_code} period ${direction} balance ` +
    `${Math.abs(net)} ${currencyLabel(currency)} ` +
    `moved to ${RETAINED_ACCOUNT_CODE}`
  );
}

function journalSummary(journal) {
  return {
    id: journal.id,
    local_id: journal.local_id,
    date: toDateOnly(journal.date),
    reference_type: journal.reference_type,
    reference_id: journal.reference_id,
    description: journal.description,
    currency: journal.currency ?? null,
    first_entry_account: journal.first_entry_account,
    first_entry_debit: toAmount(journal.first_entry_debit),
    first_entry_credit: toAmount(journal.first_entry_credit),
    second_entry_account: journal.second_entry_account,
    second_entry_debit: toAmount(journal.second_entry_debit),
    second_entry_credit: toAmount(journal.second_entry_credit),
    status: Number(journal.status ?? 1),
  };
}

function openingBalanceSummary(row) {
  if (!row) return null;

  const amount = toAmount(row.opening_balance);

  return {
    id: row.local_id,
    local_id: row.local_id,
    fiscal_year_id: row.fiscal_year_id,
    source_fiscal_year_id: row.source_fiscal_year_id ?? null,
    account_id: row.account_id,
    account_code: row.account_code ?? null,
    account_name: row.account_name ?? null,
    account_type_id: row.account_type_id ?? null,
    currency:
      row.currency === undefined || row.currency === null
        ? null
        : fiscalYearOpeningRepository.toApiCurrency(row.currency),
    opening_balance: amount,
    balance_side:
      row.balance_side ||
      (amount > 0 ? 'credit' : amount < 0 ? 'debit' : 'credit'),
    source: row.source ?? OPENING_BALANCE_SOURCE,
    status: Number(row.status ?? 1),
  };
}

function summarizeRetainedAccount(account, extras = {}) {
  if (!account) {
    return null;
  }

  return {
    id: account.id,
    local_id: account.local_id,
    code: account.code,
    name: account.name,
    account_type_id: account.account_type_id ?? null,
    currency: account.currency ?? null,
    status: Number(account.status ?? 1),
    ...extras,
  };
}

async function loadFiscalYear(executor, { orgId, fiscalYearId }) {
  const row = await fiscalYearRepository.findByLocalId(
    executor,
    {
      orgId,
      localId: fiscalYearId,
    },
  );

  if (!row || Number(row.status) === 0) {
    throw new AppError(
      'Fiscal year not found.',
      404,
      'FISCAL_YEAR_NOT_FOUND',
    );
  }

  const fiscalYear = normalizeYear(row);

  if (!fiscalYear.start_date || !fiscalYear.end_date) {
    throw new AppError(
      'Fiscal year has no valid range and cannot be closed.',
      422,
      'INVALID_FISCAL_YEAR_RANGE',
    );
  }

  return fiscalYear;
}

/*
 * Read-only. Computes exactly what a close WOULD do and writes nothing —
 * not even the RETAINED account, which is only provisioned inside the close
 * transaction. The close itself recomputes everything inside its own
 * transaction and never trusts a value from here.
 */
async function previewFiscalYearClose({
  user,
  fiscalYearId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const fiscalYear = await loadFiscalYear(
    db,
    {
      orgId,
      fiscalYearId,
    },
  );

  const [retainedAccount, closingJournals, rows] =
    await Promise.all([
      findRetainedAccount(db, {
        orgId,
      }),
      fiscalYearCloseRepository.findClosingJournals(
        db,
        {
          orgId,
          referenceType: CLOSING_REFERENCE_TYPE,
          referenceId: fiscalYear.id,
        },
      ),
      fiscalYearCloseRepository.sumPeriodAccountActivity(
        db,
        {
          orgId,
          startDate: fiscalYear.start_date,
          endDate: fiscalYear.end_date,
          codes: PNL_ACCOUNT_CODES,
          excludeReferenceType: CLOSING_REFERENCE_TYPE,
          excludeReferenceId: fiscalYear.id,
        },
      ),
    ]);

  const retainedActive =
    retainedAccount && Number(retainedAccount.status) === 1;

  const plan = buildClosingPlan({
    fiscalYear,
    retainedAccountId:
      retainedActive ? retainedAccount.local_id : null,
    rows,
  });

  const alreadyClosed =
    fiscalYear.fiscal_status === CLOSED_STATUS ||
    closingJournals.length > 0;

  /*
   * Roll-forward preview. Read-only: the same two questions the close asks
   * (which year receives the balances, and what those balances are) are
   * answered here so the UI can warn BEFORE the user commits.
   */
  const receiving = await resolveReceivingFiscalYear(
    db,
    {
      orgId,
      fiscalYear,
      create: false,
    },
  );

  /*
   * A read-only preview never writes, so a missing successor year is reported
   * as "will be created" instead of being created. The dates and the name shown
   * here are exactly the ones the close will use.
   */
  const willCreateNextFiscalYear =
    receiving.will_create && !alreadyClosed;

  const [balanceRows, existingOpenings] = await Promise.all([
    fiscalYearOpeningRepository.findPeriodEndAccountBalances(
      db,
      {
        orgId,
        endDate: fiscalYear.end_date,
        excludedCodes: PNL_ACCOUNT_CODES,
      },
    ),
    receiving.fiscal_year
      ? fiscalYearOpeningRepository.findAll(db, {
          orgId,
          fiscalYearId: receiving.fiscal_year.id,
          source: OPENING_BALANCE_SOURCE,
        })
      : Promise.resolve([]),
  ]);

  /*
   * The preview reads the ledger BEFORE the closing journals exist, so the
   * year's result has not reached RETAINED yet. Merging the closing plan's
   * net result into RETAINED is what makes the preview equal the state the
   * close will actually produce. For an already closed year the closing
   * journals are already in the ledger, so nothing is merged (that would
   * double count the profit).
   */
  const previewRows = [...balanceRows];

  if (!alreadyClosed) {
    const retainedBalance = toAmount(
      plan.profit_loss.reduce(
        (total, bucket) => total + toAmount(bucket.profit_loss),
        0,
      ),
    );

    if (retainedBalance !== 0) {
      previewRows.push({
        /*
         * On a very first close RETAINED does not exist yet — it is created
         * INSIDE the close transaction — so the account id is unknown here.
         * The row is still reported (by code) so the preview equals what the
         * close will write; `retained_account_provisioned` says which case
         * this is.
         */
        account_id: retainedAccount?.local_id ?? null,
        account_code: RETAINED_ACCOUNT_CODE,
        account_name: retainedAccount?.name ?? 'Retained Earnings',
        account_type_id: retainedAccount?.account_type_id ?? null,
        currency: fiscalYearOpeningRepository.toApiCurrency(
          retainedAccount?.currency,
        ),
        entries: 0,
        credit: retainedBalance > 0 ? retainedBalance : 0,
        debit: retainedBalance < 0 ? -retainedBalance : 0,
      });
    }
  }

  const openingPlan = buildOpeningBalancePlan({
    fiscalYear,
    receivingFiscalYear:
      receiving.fiscal_year ??
      (willCreateNextFiscalYear ? receiving.proposed : null),
    rows: previewRows,
  });

  const nextFiscalYear = receiving.fiscal_year;

  const rollForwardBlocker = receiving.conflict
    ? NEXT_FISCAL_YEAR_CONFLICT
    : nextFiscalYear && nextFiscalYear.fiscal_status !== OPEN_STATUS
      ? NEXT_FISCAL_YEAR_NOT_OPEN
      : existingOpenings.length > 0
        ? OPENING_BALANCES_ALREADY_EXIST
        : null;

  return {
    fiscal_year: fiscalYear,
    range: {
      start_date: fiscalYear.start_date,
      end_date: fiscalYear.end_date,
    },
    read_only: true,
    already_closed: alreadyClosed,
    closing_journal_date: fiscalYear.end_date,
    classification: 'journal_accounting_date_range',
    basis: {
      window:
        'COALESCE(journals.date, journals.created_at) inside the inclusive fiscal-year range',
      pnl_accounts:
        'system account codes identified by code (never account_type_id)',
      excluded: `journals with reference_type = '${CLOSING_REFERENCE_TYPE}' and reference_id = this fiscal year`,
      currency: 'each currency is closed independently; no FX conversion',
    },
    pnl_account_codes: PNL_ACCOUNT_CODES,
    retained_account_code: RETAINED_ACCOUNT_CODE,
    retained_account: summarizeRetainedAccount(retainedAccount, {
      active: Boolean(retainedActive),
      provisioning: retainedActive
        ? 'existing account is reused'
        : 'created inside the close transaction',
    }),
    currencies: plan.currencies,
    profit_loss: plan.profit_loss,
    proposed_journals: plan.lines,
    proposed_journal_count: plan.lines.length,
    existing_closing_journals:
      closingJournals.map(journalSummary),

    /*
     * Balance roll-forward preview. `roll_forward_ready` is false when the
     * close would be refused, and `roll_forward_blocker` carries the exact
     * business error code the close would throw, so the UI can explain it
     * before the user clicks.
     */
    next_fiscal_year: nextFiscalYear,

    /*
     * A missing successor is NOT a blocker any more: the close creates it.
     * The preview shows the exact year that will be created so the operator
     * confirms the dates before committing an accounting action.
     */
    next_fiscal_year_will_be_created: willCreateNextFiscalYear,
    proposed_next_fiscal_year: willCreateNextFiscalYear
      ? receiving.proposed
      : null,
    receiving_fiscal_year_conflict: receiving.conflict,
    required_next_start_date: receiving.start_date,
    required_next_end_date: receiving.proposed?.end_date ?? null,
    roll_forward_ready:
      (Boolean(nextFiscalYear) || willCreateNextFiscalYear) &&
      !rollForwardBlocker,
    roll_forward_blocker: rollForwardBlocker,
    balance_sheet_excluded_codes: PNL_ACCOUNT_CODES,
    proposed_opening_balances: openingPlan.balances,
    proposed_opening_balance_count: openingPlan.count,
    proposed_opening_balances_by_currency:
      openingPlan.by_currency,
    existing_opening_balances:
      existingOpenings.map((row) => openingBalanceSummary(row)),
    retained_account_provisioned: Boolean(retainedActive),
    opening_balance_note:
      'Snapshots for the receiving year: the historical journals are kept, so no opening journal is posted (that would double-count every balance-sheet account).',
  };
}

/*
 * POST /fiscal-years/:id/close
 *
 * One transaction. Any failure — a journal insert, a status flip, the
 * activity log — rolls the whole close back, leaving the year OPEN with no
 * closing journals, so a partial close can never exist.
 *
 * Idempotency: the OPEN -> CLOSED transition (and the active-closing-journal
 * check) is the guard, and `markClosed` only matches `fiscal_status = 'open'`,
 * so two concurrent requests can produce at most one close.
 */
async function closeFiscalYear({
  user,
  fiscalYearId,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Serialize closes per organization before touching anything else.
     * Stable lock order: organizations -> fiscal_years -> journals/accounts.
     */
    await fiscalYearCloseRepository.lockOrganization(
      connection,
      {
        orgId,
      },
    );

    const row =
      await fiscalYearRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: fiscalYearId,
          forUpdate: true,
        },
      );

    if (!row || Number(row.status) === 0) {
      throw new AppError(
        'Fiscal year not found.',
        404,
        'FISCAL_YEAR_NOT_FOUND',
      );
    }

    const fiscalYear = normalizeYear(row);

    if (!fiscalYear.start_date || !fiscalYear.end_date) {
      throw new AppError(
        'Fiscal year has no valid range and cannot be closed.',
        422,
        'INVALID_FISCAL_YEAR_RANGE',
      );
    }

    if (fiscalYear.fiscal_status !== OPEN_STATUS) {
      throw new AppError(
        'Fiscal year is already closed.',
        409,
        'FISCAL_YEAR_ALREADY_CLOSED',
      );
    }

    const existingClosings =
      await fiscalYearCloseRepository.findClosingJournals(
        connection,
        {
          orgId,
          referenceType: CLOSING_REFERENCE_TYPE,
          referenceId: fiscalYear.id,
          forUpdate: true,
        },
      );

    if (existingClosings.length > 0) {
      throw new AppError(
        'Fiscal year already has an active closing journal.',
        409,
        'FISCAL_YEAR_ALREADY_CLOSED',
      );
    }

    /*
     * The receiving year is resolved BEFORE anything is posted, so the whole
     * close is refused up front when the balances would have nowhere to go.
     * When it does not exist yet it is CREATED here, inside this transaction:
     * the successor year of a closed year is not something the operator has to
     * remember to configure first.
     *
     * Lock order stays organizations -> fiscal_years (closed year, then the
     * organization's years, then the receiving year) -> journals/accounts/
     * opening balances.
     */
    const receiving = await resolveReceivingFiscalYear(
      connection,
      {
        orgId,
        fiscalYear,
        userId,
        requestContext,
        create: true,
      },
    );

    assertReceivingFiscalYear(receiving, fiscalYear);

    if (receiving.created) {
      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'create',
          tableName: 'fiscal_years',
          entityId: receiving.fiscal_year.id,

          oldValues: null,
          newValues: receiving.fiscal_year,

          description:
            `Created fiscal year ${receiving.fiscal_year.name} ` +
            `(${receiving.fiscal_year.start_date} to ` +
            `${receiving.fiscal_year.end_date}) automatically as the ` +
            `successor of ${fiscalYear.name}`,

          ipAddress: requestContext?.ipAddress,
          sessionId: requestContext?.sessionId,
          deviceInfo: requestContext?.deviceInfo,
        },
      );
    }

    const existingOpenings =
      await fiscalYearOpeningRepository.findAll(
        connection,
        {
          orgId,
          fiscalYearId: receiving.fiscal_year.id,
          source: OPENING_BALANCE_SOURCE,
          forUpdate: true,
        },
      );

    /*
     * Defensive: a receiving year that is OPEN and was never closed has no
     * active opening balances, so this can only fire if rows were written by
     * another path. Reported instead of silently overwriting them.
     */
    if (existingOpenings.length > 0) {
      throw new AppError(
        `${receiving.fiscal_year.name} already has active opening balances. Reopen the year that produced them before closing ${fiscalYear.name}.`,
        409,
        OPENING_BALANCES_ALREADY_EXIST,
        {
          fiscal_year_id: receiving.fiscal_year.id,
          opening_balances: existingOpenings.length,
        },
      );
    }

    const retained = await ensureRetainedAccount(
      connection,
      {
        orgId,
        userId,
      },
    );

    const rows =
      await fiscalYearCloseRepository.sumPeriodAccountActivity(
        connection,
        {
          orgId,
          startDate: fiscalYear.start_date,
          endDate: fiscalYear.end_date,
          codes: PNL_ACCOUNT_CODES,
          excludeReferenceType: CLOSING_REFERENCE_TYPE,
          excludeReferenceId: fiscalYear.id,
        },
      );

    const plan = buildClosingPlan({
      fiscalYear,
      retainedAccountId: retained.account.local_id,
      rows,
    });

    const createdJournals = [];
    const journalsByCurrency = new Map();

    for (const line of plan.lines) {
      const localId = generateLocalId();

      const journal =
        await journalRepository.create(
          connection,
          {
            orgId,
            localId,
            userId,
            data: {
              date: line.date,
              reference_id: line.reference_id,
              reference_type: line.reference_type,
              description: line.description,
              currency: line.currency,
              first_entry_account: line.first_entry_account,
              first_entry_debit: line.first_entry_debit,
              first_entry_credit: line.first_entry_credit,
              second_entry_account: line.second_entry_account,
              second_entry_debit: line.second_entry_debit,
              second_entry_credit: line.second_entry_credit,
              status: 1,
            },
          },
        );

      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'create',
          tableName: 'journals',
          entityId: journal.id,

          oldValues: null,
          newValues: journal,

          description:
            `Created fiscal-year closing journal ${journal.id} ` +
            `for fiscal year ${fiscalYear.id} (${line.code}, ${currencyLabel(line.currency)})`,

          ipAddress: requestContext?.ipAddress,
          sessionId: requestContext?.sessionId,
          deviceInfo: requestContext?.deviceInfo,
        },
      );

      const key = currencyKey(line.currency);
      const list = journalsByCurrency.get(key) || [];

      list.push(journal);
      journalsByCurrency.set(key, list);

      createdJournals.push(journal);
    }

    /*
     * Balance-sheet roll-forward.
     *
     * Read AFTER the closing journals were inserted, inside this transaction:
     * the closing entry dated on end_date is part of the year's closing
     * balances, which is exactly how RETAINED receives the year's profit and
     * how the P&L accounts arrive at zero by the end date.
     *
     * The balance is "everything up to and including end_date", not "this
     * year's movement". That is what makes the roll-forward consistent: the
     * receiving year's opening equals the source year's opening plus the
     * source year's movement, so no year is double counted and no year is
     * skipped.
     */
    const balanceRows =
      await fiscalYearOpeningRepository.findPeriodEndAccountBalances(
        connection,
        {
          orgId,
          endDate: fiscalYear.end_date,
          excludedCodes: PNL_ACCOUNT_CODES,
        },
      );

    const openingPlan = buildOpeningBalancePlan({
      fiscalYear,
      receivingFiscalYear: receiving.fiscal_year,
      rows: balanceRows,
    });

    const createdOpenings = [];

    for (const balance of openingPlan.balances) {
      const localId = generateLocalId();

      const opening =
        await fiscalYearOpeningRepository.create(
          connection,
          {
            orgId,
            localId,
            userId,
            data: {
              fiscal_year_id: receiving.fiscal_year.id,
              source_fiscal_year_id: fiscalYear.id,
              account_id: balance.account_id,
              currency: balance.currency,
              opening_balance: balance.opening_balance,
              balance_side: balance.balance_side,
              source: OPENING_BALANCE_SOURCE,
              note:
                `Opening balance carried into ${receiving.fiscal_year.name} ` +
                `from the close of ${fiscalYear.name} ` +
                `(${fiscalYear.start_date} to ${fiscalYear.end_date}).`,
            },
          },
        );

      createdOpenings.push(opening);
    }

    if (createdOpenings.length > 0) {
      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'create',
          tableName: 'fiscal_year_opening_balances',
          entityId: receiving.fiscal_year.id,

          oldValues: null,
          newValues: {
            source_fiscal_year_id: fiscalYear.id,
            fiscal_year_id: receiving.fiscal_year.id,
            count: createdOpenings.length,
          },

          description:
            `Rolled ${createdOpenings.length} opening balance(s) from ` +
            `${fiscalYear.name} into ${receiving.fiscal_year.name} ` +
            `(starting ${receiving.start_date})`,

          ipAddress: requestContext?.ipAddress,
          sessionId: requestContext?.sessionId,
          deviceInfo: requestContext?.deviceInfo,
        },
      );
    }

    const affectedRows =
      await fiscalYearCloseRepository.markClosed(
        connection,
        {
          orgId,
          localId: fiscalYear.id,
          userId,
        },
      );

    if (affectedRows !== 1) {
      /*
       * The row stopped being OPEN between the check and the update, so the
       * year was closed concurrently. Nothing is posted.
       */
      throw new AppError(
        'Fiscal year is already closed.',
        409,
        'FISCAL_YEAR_ALREADY_CLOSED',
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'close',
        tableName: 'fiscal_years',
        entityId: fiscalYear.id,

        oldValues: {
          fiscal_status: fiscalYear.fiscal_status,
        },
        newValues: {
          fiscal_status: CLOSED_STATUS,
        },

        description:
          `Closed fiscal year ${fiscalYear.name} ` +
          `(${fiscalYear.start_date} to ${fiscalYear.end_date}) with ` +
          `${createdJournals.length} closing journal(s)`,

        ipAddress: requestContext?.ipAddress,
        sessionId: requestContext?.sessionId,
        deviceInfo: requestContext?.deviceInfo,
      },
    );

    const closedRow =
      await fiscalYearRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: fiscalYear.id,
        },
      );

    await connection.commit();

    /*
     * The closing journals change account balances, so the cached account
     * aggregates of this organization must be dropped exactly like any other
     * journal write does.
     */
    accountService.invalidateAccountAggregates(orgId);

    const closedYear = normalizeYear(closedRow) || fiscalYear;

    const currencyResults = plan.currencies.map((bucket) => ({
      currency: bucket.currency,
      profit_loss: bucket.profit_loss,
      result: bucket.result,
      accounts: bucket.accounts,
      journal_ids: (
        journalsByCurrency.get(currencyKey(bucket.currency)) || []
      ).map((journal) => journal.id),
    }));

    return {
      fiscal_year: closedYear,
      status: closedYear.fiscal_status,
      closed_at: closedYear.closed_at ?? null,
      closed_by: closedYear.closed_by ?? null,
      retained_account: summarizeRetainedAccount(
        retained.account,
        {
          created: retained.created,
          restored: retained.restored,
        },
      ),
      currency_results: currencyResults,
      profit_loss: plan.profit_loss,
      closing_journals: createdJournals.map(journalSummary),
      closing_journals_created: createdJournals.length,
      zero_activity: plan.lines.length === 0,
      /*
       * Roll-forward result. Balance-sheet accounts only, per currency, as
       * SNAPSHOTS for the receiving year — deliberately not journals, because
       * the historical journals still exist and opening journals would
       * double-count every one of these balances.
       */
      next_fiscal_year: receiving.fiscal_year,
      /*
       * True when the receiving year did not exist and this close created it
       * (starting the day after this year ended). Reported so the operator can
       * see that closing also configured the next fiscal year.
       */
      next_fiscal_year_created: receiving.created,
      next_fiscal_year_range: {
        start_date: receiving.fiscal_year.start_date,
        end_date: receiving.fiscal_year.end_date,
      },
      opening_balances: createdOpenings.map((row) =>
        openingBalanceSummary(row),
      ),
      opening_balances_created: createdOpenings.length,
      opening_balances_by_currency: openingPlan.by_currency,
      next_year_opening_journals_created: 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * POST /fiscal-years/:id/reopen
 *
 * The exact inverse of a close, in ONE transaction, and the only supported way
 * to undo one. Nothing is deleted and nothing is rewritten:
 *
 *   1. the closing journals are soft-deleted (status = 0) — the accounting
 *      effect disappears while the rows stay queryable for audit;
 *   2. the opening balances this close pushed into the receiving year are
 *      deactivated (status = 0), because the source year no longer closed
 *      them out;
 *   3. the fiscal year goes back to OPEN with closed_at / closed_by cleared.
 *
 * Because the opening balances are deactivated rather than deleted, and the
 * unique key ignores inactive rows, closing the year again writes a fresh
 * generation of opening balances instead of colliding with the previous one.
 *
 * Guard: the RECEIVING year must not itself be closed. Its own close would
 * have been computed on top of balances this reopen is about to withdraw, so
 * the later year has to be reopened first — a fixed, predictable order instead
 * of a half-consistent history.
 */
async function reopenFiscalYear({
  user,
  fiscalYearId,
  reason = null,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await fiscalYearCloseRepository.lockOrganization(
      connection,
      {
        orgId,
      },
    );

    const row =
      await fiscalYearRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: fiscalYearId,
          forUpdate: true,
        },
      );

    if (!row || Number(row.status) === 0) {
      throw new AppError(
        'Fiscal year not found.',
        404,
        'FISCAL_YEAR_NOT_FOUND',
      );
    }

    const fiscalYear = normalizeYear(row);

    if (fiscalYear.fiscal_status !== CLOSED_STATUS) {
      throw new AppError(
        'Fiscal year is not closed.',
        409,
        FISCAL_YEAR_NOT_CLOSED,
        {
          fiscal_year_id: fiscalYear.id,
          fiscal_status: fiscalYear.fiscal_status,
        },
      );
    }

    const receiving = await findReceivingFiscalYear(
      connection,
      {
        orgId,
        fiscalYear,
        forUpdate: true,
      },
    );

    if (
      receiving.fiscal_year &&
      receiving.fiscal_year.fiscal_status !== OPEN_STATUS
    ) {
      throw new AppError(
        `${receiving.fiscal_year.name} is closed and its opening balances came from ${fiscalYear.name}. Reopen ${receiving.fiscal_year.name} first.`,
        409,
        RECEIVING_FISCAL_YEAR_CLOSED,
        {
          fiscal_year_id: fiscalYear.id,
          receiving_fiscal_year_id: receiving.fiscal_year.id,
          receiving_fiscal_year_status:
            receiving.fiscal_year.fiscal_status,
        },
      );
    }

    const closingJournals =
      await fiscalYearCloseRepository.findClosingJournals(
        connection,
        {
          orgId,
          referenceType: CLOSING_REFERENCE_TYPE,
          referenceId: fiscalYear.id,
          forUpdate: true,
        },
      );

    const deactivatedOpenings =
      await fiscalYearOpeningRepository.deactivateBySourceYear(
        connection,
        {
          orgId,
          sourceFiscalYearId: fiscalYear.id,
          userId,
          note:
            `Deactivated by reopening ${fiscalYear.name} on ` +
            `${new Date().toISOString().slice(0, 10)}.`,
        },
      );

    if (deactivatedOpenings > 0) {
      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'update',
          tableName: 'fiscal_year_opening_balances',
          entityId: receiving.fiscal_year?.id ?? null,

          oldValues: {
            status: 1,
            count: deactivatedOpenings,
          },
          newValues: {
            status: 0,
            count: deactivatedOpenings,
          },

          description:
            `Deactivated ${deactivatedOpenings} opening balance(s) rolled into ` +
            `${receiving.fiscal_year?.name || receiving.start_date} by the close of ${fiscalYear.name}`,

          ipAddress: requestContext?.ipAddress,
          sessionId: requestContext?.sessionId,
          deviceInfo: requestContext?.deviceInfo,
        },
      );
    }

    for (const journal of closingJournals) {
      const reversed =
        await journalRepository.softDelete(
          connection,
          {
            orgId,
            localId: journal.local_id,
            userId,
          },
        );

      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'update',
          tableName: 'journals',
          entityId: journal.local_id,

          oldValues: { status: 1 },
          newValues: { status: 0 },

          description:
            `Reversed fiscal-year closing journal ${journal.local_id} ` +
            `by reopening ${fiscalYear.name}`,

          ipAddress: requestContext?.ipAddress,
          sessionId: requestContext?.sessionId,
          deviceInfo: requestContext?.deviceInfo,
        },
      );

      /*
       * `reversed` is the soft-deleted row returned by the repository. It is
       * read here so a missing journal row fails the reopen instead of
       * silently reporting a reversal that did not happen.
       */
      if (!reversed) {
        throw new AppError(
          'A closing journal of this fiscal year could not be reversed.',
          409,
          FISCAL_YEAR_NOT_CLOSED,
          {
            journal_id: journal.local_id,
          },
        );
      }
    }

    const affectedRows =
      await fiscalYearCloseRepository.markReopened(
        connection,
        {
          orgId,
          localId: fiscalYear.id,
          userId,
        },
      );

    if (affectedRows !== 1) {
      throw new AppError(
        'Fiscal year is not closed.',
        409,
        FISCAL_YEAR_NOT_CLOSED,
        {
          fiscal_year_id: fiscalYear.id,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'reopen',
        tableName: 'fiscal_years',
        entityId: fiscalYear.id,

        oldValues: {
          fiscal_status: CLOSED_STATUS,
          closed_at: fiscalYear.closed_at ?? null,
          closed_by: fiscalYear.closed_by ?? null,
        },
        newValues: {
          fiscal_status: OPEN_STATUS,
        },

        description:
          `Reopened fiscal year ${fiscalYear.name} ` +
          `(${fiscalYear.start_date} to ${fiscalYear.end_date}), ` +
          `reversing ${closingJournals.length} closing journal(s) and ` +
          `deactivating ${deactivatedOpenings} opening balance(s)` +
          (reason ? `: ${reason}` : ''),

        ipAddress: requestContext?.ipAddress,
        sessionId: requestContext?.sessionId,
        deviceInfo: requestContext?.deviceInfo,
      },
    );

    const reopenedRow =
      await fiscalYearRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: fiscalYear.id,
        },
      );

    await connection.commit();

    /*
     * Reversing the closing journals changes account balances again, so the
     * cached aggregates must be dropped exactly like any other journal write.
     */
    accountService.invalidateAccountAggregates(orgId);

    const reopenedYear = normalizeYear(reopenedRow) || fiscalYear;

    return {
      fiscal_year: reopenedYear,
      status: reopenedYear.fiscal_status,
      closed_at: reopenedYear.closed_at ?? null,
      closed_by: reopenedYear.closed_by ?? null,
      reversed_closing_journals: closingJournals.map(
        journalSummary,
      ),
      closing_journals_reversed: closingJournals.length,
      opening_balances_deactivated: deactivatedOpenings,
      receiving_fiscal_year: receiving.fiscal_year ?? null,
      receiving_fiscal_year_start_date: receiving.start_date,
      historical_data_preserved: true,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  CLOSING_REFERENCE_TYPE,
  OPENING_BALANCE_SOURCE,
  NEXT_FISCAL_YEAR_REQUIRED,
  NEXT_FISCAL_YEAR_NOT_OPEN,
  NEXT_FISCAL_YEAR_CONFLICT,
  RECEIVING_FISCAL_YEAR_CLOSED,
  FISCAL_YEAR_NOT_CLOSED,
  OPENING_BALANCES_ALREADY_EXIST,
  previewFiscalYearClose,
  closeFiscalYear,
  reopenFiscalYear,
  ensureRetainedAccount,
  buildClosingPlan,
  buildOpeningBalancePlan,
  findReceivingFiscalYear,
  resolveReceivingFiscalYear,
  nextFiscalYearRange,
  normalizeYear,
  toDateOnly,
  toAmount,
};
