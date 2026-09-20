/**
 * Fiscal-year ARCHIVE reads (Step 5).
 *
 * "Archived" in this application means PRESENTATION, never mutation:
 *
 *   * no historical row is deleted, soft-deleted or re-dated;
 *   * a closed year's documents simply fall outside the date range of the
 *     current fiscal year, so the operational screens (which default to the
 *     current fiscal year) no longer list them;
 *   * they stay fully queryable through the fiscal-year history, which scopes
 *     every list to [start_date, end_date] of the selected year.
 *
 * This service therefore only READS. The single write of the whole step (the
 * opening-balance snapshot) belongs to the close transaction.
 *
 * Current-year balance model
 * --------------------------
 *   current balance = opening snapshot + movement inside THIS year
 *
 * NOT "lifetime balance plus opening", which would count the closed years'
 * journals twice: those journals still exist and still hold every
 * balance-sheet amount.
 */

const db = require('../database/pool');

const AppError = require('../errors/AppError');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const fiscalYearOpeningRepository =
  require('../repositories/fiscal-year-opening.repository');

const accountRepository =
  require('../repositories/account.repository');

const journalRepository =
  require('../repositories/journal.repository');

const {
  PNL_ACCOUNT_CODES,
} = require('../constants/systemAccounts');

const {
  resolvePagination,
} = require('../utils/pagination');

const OPENING_BALANCE_SOURCE = 'fiscal_year_close';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return { orgId, userId };
}

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
      row.fiscal_status || 'open',
    ).toLowerCase(),
  };
}

const AMOUNT_DECIMALS = 6;

function toAmount(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const factor = 10 ** AMOUNT_DECIMALS;

  return Math.round(number * factor) / factor;
}

function currencyKey(currency) {
  return fiscalYearOpeningRepository.normalizeCurrency(currency);
}

function summarizeOpeningBalance(row, { yearsById = null } = {}) {
  if (!row) return null;

  const amount = toAmount(row.opening_balance);
  const sourceYear = yearsById?.get(String(row.source_fiscal_year_id)) || null;
  const receivingYear = yearsById?.get(String(row.fiscal_year_id)) || null;

  return {
    id: row.local_id,
    local_id: row.local_id,

    /* audit trail required by the Step 5 brief, all four facts in one row */
    source_fiscal_year_id: row.source_fiscal_year_id ?? null,
    source_fiscal_year_name: sourceYear?.name ?? null,
    fiscal_year_id: row.fiscal_year_id,
    fiscal_year_name: receivingYear?.name ?? null,

    account_id: row.account_id,
    account_code: row.account_code ?? null,
    account_name: row.account_name ?? null,
    account_type_id: row.account_type_id ?? null,

    currency: fiscalYearOpeningRepository.toApiCurrency(row.currency),
    opening_balance: amount,
    balance_side:
      row.balance_side ||
      (amount > 0 ? 'credit' : amount < 0 ? 'debit' : 'credit'),

    source: row.source ?? OPENING_BALANCE_SOURCE,
    note: row.note ?? null,
    status: Number(row.status ?? 1),
    created_at: row.created_at ?? null,
  };
}

async function loadFiscalYear(executor, { orgId, fiscalYearId }) {
  const row = await fiscalYearRepository.findByLocalId(executor, {
    orgId,
    localId: fiscalYearId,
  });

  if (!row || Number(row.status) === 0) {
    throw new AppError(
      'Fiscal year not found.',
      404,
      'FISCAL_YEAR_NOT_FOUND',
    );
  }

  return normalizeYear(row);
}

/**
 * Everything an operator needs to audit a roll-forward:
 *
 *   * `received`   — the opening balances this year STARTED with, produced by
 *                    the close of the previous year;
 *   * `generated`  — the opening balances this year PRODUCED for the next
 *                    year when it was closed;
 *   * `voided`     — generations deactivated by a reopen, kept as audit
 *                    history (only with include_inactive=1).
 */
async function listOpeningBalances({
  user,
  fiscalYearId,
  includeInactive = false,
  generated = true,
}) {
  const { orgId } = getAuthenticatedIdentity(user);

  const fiscalYear = await loadFiscalYear(db, {
    orgId,
    fiscalYearId,
  });

  const [receivedRows, generatedRows, yearRows] = await Promise.all([
    fiscalYearOpeningRepository.findAll(db, {
      orgId,
      fiscalYearId: fiscalYear.id,
      includeInactive,
    }),
    generated
      ? fiscalYearOpeningRepository.findAll(db, {
          orgId,
          sourceFiscalYearId: fiscalYear.id,
          includeInactive,
        })
      : Promise.resolve([]),
    fiscalYearRepository.findAll(db, { orgId, status: 1 }),
  ]);

  const yearsById = new Map(
    (yearRows || []).map((year) => [
      String(year.local_id),
      normalizeYear(year),
    ]),
  );

  const received = receivedRows.map((row) =>
    summarizeOpeningBalance(row, { yearsById }),
  );
  const generatedList = generatedRows.map((row) =>
    summarizeOpeningBalance(row, { yearsById }),
  );

  return {
    fiscal_year: fiscalYear,
    range: {
      start_date: fiscalYear.start_date,
      end_date: fiscalYear.end_date,
    },
    read_only: true,
    basis: {
      model:
        'current-year balance = opening snapshot + movement inside this year',
      pnl_excluded: PNL_ACCOUNT_CODES,
      currency: 'each currency is carried separately; no FX conversion',
      snapshot:
        'balance-sheet closing balance as of the source year end_date (credit - debit)',
    },
    received,
    received_by_currency: groupByCurrency(received),
    generated: generatedList,
    generated_by_currency: groupByCurrency(generatedList),
    generated_count: generatedList.length,
    generated_next_fiscal_year:
      generatedList.length > 0
        ? yearsById.get(String(generatedList[0].fiscal_year_id)) || null
        : null,
    received_count: received.length,
  };
}

function groupByCurrency(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const key = currencyKey(row.currency);
    const bucket = buckets.get(key) || {
      currency: row.currency,
      total: 0,
      accounts: 0,
    };

    bucket.total = toAmount(bucket.total + toAmount(row.opening_balance));
    bucket.accounts += 1;

    buckets.set(key, bucket);
  }

  return [...buckets.values()];
}

/**
 * The account statement of ONE fiscal year (Step 5, §6/§7):
 *
 *   opening  = the snapshot the year started with (per currency)
 *   entries  = journals inside [start_date, end_date] touching the account
 *   movement = sum(credit - debit) of those journals, per currency
 *   closing  = opening + movement, per currency
 *
 * The old year's journal rows are deliberately NOT included: they are still in
 * the ledger, but they belong to the previous fiscal year's statement, which
 * the fiscal-year history can show instead.
 */
async function getAccountStatement({
  user,
  fiscalYearId,
  accountId,
  currency = null,
  filters = {},
}) {
  const { orgId } = getAuthenticatedIdentity(user);

  const fiscalYear = await loadFiscalYear(db, {
    orgId,
    fiscalYearId,
  });

  const account = await accountRepository.findByLocalId(db, {
    orgId,
    localId: accountId,
  });

  if (!account || Number(account.status) === 0) {
    throw new AppError(
      'Account not found.',
      404,
      'ACCOUNT_NOT_FOUND',
    );
  }

  const pagination = resolvePagination(filters);

  const [openingRows, journalResult] = await Promise.all([
    fiscalYearOpeningRepository.findAll(db, {
      orgId,
      fiscalYearId: fiscalYear.id,
    }),
    journalRepository.findAll(db, {
      orgId,
      status: 1,
      accountId: account.local_id,
      dateFrom: fiscalYear.start_date,
      dateTo: fiscalYear.end_date,
      skipCount: Number(filters.skip_count) === 1,
      pagination,
    }),
  ]);

  const requestedCurrency =
    currency === null || currency === undefined || currency === ''
      ? null
      : currencyKey(currency);

  const openings = openingRows
    .filter((row) => String(row.account_id) === String(account.local_id))
    .filter(
      (row) =>
        requestedCurrency === null ||
        currencyKey(row.currency) === requestedCurrency,
    );

  const entries = (journalResult?.data || []).filter((journal) =>
    requestedCurrency === null
      ? true
      : currencyKey(journal.currency) === requestedCurrency,
  );

  /*
   * One statement line per currency, so AFN and USD never mix:
   * opening snapshot + movement inside the year = closing balance.
   */
  const lines = new Map();

  const lineFor = (currencyValue) => {
    const key = currencyKey(currencyValue);
    const existing = lines.get(key);

    if (existing) return existing;

    const line = {
      currency:
        fiscalYearOpeningRepository.toApiCurrency(currencyValue),
      opening_balance: 0,
      debit: 0,
      credit: 0,
      movement: 0,
      closing_balance: 0,
      entries: 0,
      opening_source_fiscal_year_id: null,
      opening_source_fiscal_year_name: null,
    };

    lines.set(key, line);

    return line;
  };

  for (const row of openings) {
    const line = lineFor(row.currency);

    line.opening_balance = toAmount(
      line.opening_balance + toAmount(row.opening_balance),
    );
    line.opening_source_fiscal_year_id = row.source_fiscal_year_id ?? null;
  }

  for (const journal of entries) {
    const line = lineFor(journal.currency);

    /*
     * Only the positions that actually reference THIS account count: a journal
     * row carries two entry positions and the other one belongs to a
     * different account.
     */
    const isFirst =
      String(journal.first_entry_account) === String(account.local_id);
    const isSecond =
      String(journal.second_entry_account) === String(account.local_id);

    const ownDebit = isFirst
      ? toAmount(journal.first_entry_debit)
      : isSecond
        ? toAmount(journal.second_entry_debit)
        : 0;

    const ownCredit = isFirst
      ? toAmount(journal.first_entry_credit)
      : isSecond
        ? toAmount(journal.second_entry_credit)
        : 0;

    line.debit = toAmount(line.debit + ownDebit);
    line.credit = toAmount(line.credit + ownCredit);
    line.entries += 1;
  }

  const statementLines = [...lines.values()].map((line) => {
    const movement = toAmount(line.credit - line.debit);

    return {
      ...line,
      movement,
      closing_balance: toAmount(line.opening_balance + movement),
      closing_side:
        line.opening_balance + movement >= 0 ? 'credit' : 'debit',
    };
  });

  const reference =
    statementLines.find((line) => line.opening_balance !== 0) ||
    statementLines[0] ||
    null;

  return {
    fiscal_year: fiscalYear,
    account: {
      id: account.local_id,
      code: account.code ?? null,
      name: account.name ?? null,
      currency:
        fiscalYearOpeningRepository.toApiCurrency(account.currency),
      account_type_id: account.account_type_id ?? null,
    },
    range: {
      start_date: fiscalYear.start_date,
      end_date: fiscalYear.end_date,
    },
    read_only: true,
    formula: 'opening_balance + period movement = closing_balance',

    /* Opening balance of the year, shown as the first statement row. */
    opening_balance:
      reference === null ? 0 : toAmount(reference.opening_balance),
    opening_balance_source_fiscal_year_id:
      reference?.opening_source_fiscal_year_id ?? null,

    lines: statementLines,

    /* The statement itself: one opening row, then the year's own journals. */
    opening_rows: statementLines
      .filter((line) => line.opening_balance !== 0)
      .map((line) => ({
        type: 'opening_balance',
        date: fiscalYear.start_date,
        currency: line.currency,
        description:
          `Opening balance carried into ${fiscalYear.name}`,
        debit: line.opening_balance < 0 ? -line.opening_balance : 0,
        credit: line.opening_balance > 0 ? line.opening_balance : 0,
        opening_balance: line.opening_balance,
        balance: line.opening_balance,
      })),

    entries,

    movement_by_currency: statementLines.map((line) => ({
      currency: line.currency,
      debit: line.debit,
      credit: line.credit,
      movement: line.movement,
      entries: line.entries,
    })),

    closing_by_currency: statementLines.map((line) => ({
      currency: line.currency,
      opening_balance: line.opening_balance,
      movement: line.movement,
      closing_balance: line.closing_balance,
      closing_side: line.closing_side,
    })),

    meta: journalResult?.meta ?? null,
    inventory_model:
      'inventory is continuous across fiscal years; no opening stock is created',
  };
}

module.exports = {
  listOpeningBalances,
  getAccountStatement,
  summarizeOpeningBalance,
  groupByCurrency,
};
