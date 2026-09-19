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

const accountRepository =
  require('../repositories/account.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const accountService =
  require('./account.service');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  PNL_ACCOUNT_CODES,
  RETAINED_ACCOUNT_CODE,
} = require('../constants/systemAccounts');

const CLOSING_REFERENCE_TYPE =
  'fiscal_year_close';

const OPEN_STATUS = 'open';
const CLOSED_STATUS = 'closed';

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
      next_year_opening_journals_created: 0,
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
  previewFiscalYearClose,
  closeFiscalYear,
  ensureRetainedAccount,
  buildClosingPlan,
};
