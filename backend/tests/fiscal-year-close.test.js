/*
 * fiscal-year-close.test.js
 *
 * Step 4 tests for the fiscal-year CLOSING engine. Everything runs against
 * stubbed repositories, a fake connection and an in-memory double-entry
 * ledger — there is NO database connection, so production data is never
 * touched.
 *
 * The in-memory ledger deliberately re-implements the documented SQL window
 * (organization-scoped, COALESCE(date, created_at) inside the inclusive
 * fiscal-year range, closing journals excluded) so the assertions below are
 * real accounting assertions rather than echoes of the implementation:
 *
 *   - every P&L account's period net is ZERO once its closing journal exists,
 *   - RETAINED holds exactly the net profit/loss, per currency,
 *   - nothing else in the ledger (customer, supplier, owner, treasury,
 *     inventory) moves at all.
 */

process.env.DB_HOST = 'fiscal-year-close-test-host';
process.env.DB_USER = 'fiscal-year-close-test-user';
process.env.DB_PASSWORD = 'fiscal-year-close-test-password';
process.env.DB_NAME = 'fiscal-year-close-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const pool = require('../database/pool');

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
  require('../services/account.service');

const fiscalYearCloseService =
  require('../services/fiscal-year-close.service');

const {
  PNL_ACCOUNT_CODES,
  RETAINED_ACCOUNT_CODE,
} = require('../constants/systemAccounts');

const USER = { org_id: 42, local_id: 7 };
const OTHER_ORG_USER = { org_id: 77, local_id: 9 };

const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test',
  deviceInfo: 'node:test',
};

const FY_2026 = {
  name: 'FY 2026',
  start: '2026-01-01',
  end: '2026-12-31',
};

const FY_2027 = {
  name: 'FY 2027',
  start: '2027-01-01',
  end: '2027-12-31',
};

let state;
let connection;

/* ------------------------------ harness ------------------------------ */

function createConnection() {
  const conn = {
    committed: false,
    rolledBack: false,
    released: false,
    snapshot: null,
    async beginTransaction() {
      conn.snapshot = structuredClone(state);
    },
    async commit() {
      conn.committed = true;
    },
    async rollback() {
      conn.rolledBack = true;
      if (conn.snapshot) state = conn.snapshot;
    },
    async release() {
      conn.released = true;
    },
    async execute() {
      return [[], []];
    },
  };

  return conn;
}

function round6(value) {
  return Math.round(Number(value || 0) * 1e6) / 1e6;
}

function accountsForOrg(orgId) {
  return state.accounts.filter(
    (account) => Number(account.org_id) === Number(orgId),
  );
}

function accountByCode(code, orgId = USER.org_id) {
  return accountsForOrg(orgId).find(
    (account) => String(account.code) === String(code) && Number(account.status) === 1,
  );
}

function journalsForOrg(orgId) {
  return state.journals.filter(
    (journal) => Number(journal.org_id) === Number(orgId),
  );
}

/*
 * The SQL window, in memory: organization-scoped, active rows, accounting
 * date inside the inclusive range, closing journals excluded.
 */
function periodActivity({
  orgId,
  startDate,
  endDate,
  codes,
  excludeReferenceType = null,
  excludeReferenceId = null,
}) {
  const byId = new Map(
    state.accounts.map((account) => [String(account.local_id), account]),
  );
  const merged = new Map();

  for (const journal of journalsForOrg(orgId)) {
    if (Number(journal.status ?? 1) !== 1) continue;

    const date = String(journal.date || '').slice(0, 10);

    if (!date || date < startDate || date > endDate) continue;

    if (
      excludeReferenceType &&
      journal.reference_type === excludeReferenceType &&
      String(journal.reference_id) === String(excludeReferenceId)
    ) {
      continue;
    }

    for (const side of ['first', 'second']) {
      const account = byId.get(String(journal[`${side}_entry_account`]));

      if (!account) continue;

      const code = String(account.code || '').toUpperCase();

      if (!codes.includes(code)) continue;

      const currency = journal.currency || null;
      const key = `${code}::${account.local_id}::${currency || ''}`;

      const row = merged.get(key) || {
        account_code: code,
        account_local_id: account.local_id,
        account_name: account.name,
        account_currency: account.currency ?? null,
        currency,
        entries: 0,
        debit: 0,
        credit: 0,
      };

      row.entries += 1;
      row.debit += Number(journal[`${side}_entry_debit`] || 0);
      row.credit += Number(journal[`${side}_entry_credit`] || 0);

      merged.set(key, row);
    }
  }

  return [...merged.values()];
}

/*
 * Signed period net for one account code: credit - debit. Used to prove that
 * a P&L account is exactly zero after its closing journal, and that RETAINED
 * holds the profit.
 */
function periodNet(code, { orgId = USER.org_id, currency = null, startDate, endDate } = {}) {
  const byId = new Map(
    state.accounts.map((account) => [String(account.local_id), account]),
  );

  let net = 0;

  for (const journal of journalsForOrg(orgId)) {
    if (Number(journal.status ?? 1) !== 1) continue;

    const date = String(journal.date || '').slice(0, 10);

    if (!date) continue;
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;

    const journalCurrency = journal.currency || null;

    if (currency !== null && journalCurrency !== currency) continue;

    for (const side of ['first', 'second']) {
      const account = byId.get(String(journal[`${side}_entry_account`]));

      if (!account) continue;
      if (String(account.code || '').toUpperCase() !== code) continue;

      net +=
        Number(journal[`${side}_entry_credit`] || 0) -
        Number(journal[`${side}_entry_debit`] || 0);
    }
  }

  return round6(net);
}

/*
 * The Step 5 roll-forward query, in memory: signed balance (credit - debit)
 * per account + currency for EVERY journal up to and including the given end
 * date, active accounts only, P&L codes excluded.
 *
 * One-sided on purpose (no lower bound): the closing balance of a year is
 * "everything up to its end date", which is what makes FY2027's opening equal
 * FY2026's opening plus FY2026's movement.
 */
function periodEndAccountBalances({ orgId, endDate, excludedCodes = [] }) {
  const byId = new Map(
    state.accounts.map((account) => [String(account.local_id), account]),
  );
  const excluded = new Set(
    excludedCodes.map((code) => String(code).toUpperCase()),
  );
  const merged = new Map();

  for (const journal of journalsForOrg(orgId)) {
    if (Number(journal.status ?? 1) !== 1) continue;

    const date = String(journal.date || journal.created_at || '').slice(0, 10);

    if (!date) continue;
    if (date > endDate) continue;

    for (const side of ['first', 'second']) {
      const account = byId.get(String(journal[`${side}_entry_account`]));

      if (!account) continue;
      if (Number(account.status ?? 1) !== 1) continue;

      const code = String(account.code || '').toUpperCase();

      if (excluded.has(code)) continue;

      const currency = journal.currency || '';
      const key = `${account.local_id}|${currency}`;

      const row = merged.get(key) || {
        account_id: account.local_id,
        account_code: code,
        account_name: account.name,
        account_currency: account.currency ?? null,
        account_type_id: account.account_type_id ?? null,
        currency,
        entries: 0,
        debit: 0,
        credit: 0,
      };

      row.entries += 1;
      row.debit += Number(journal[`${side}_entry_debit`] || 0);
      row.credit += Number(journal[`${side}_entry_credit`] || 0);

      merged.set(key, row);
    }
  }

  return [...merged.values()];
}

/* Signed opening balance of one account + currency in one receiving year. */
function openingFor(
  accountCode,
  { orgId = USER.org_id, fiscalYearId, currency = null, sourceFiscalYearId } = {},
) {
  const account = accountByCode(accountCode, orgId);

  const row = state.openings.find(
    (opening) =>
      Number(opening.org_id) === Number(orgId) &&
      Number(opening.status) === 1 &&
      String(opening.account_id) === String(account?.local_id) &&
      (fiscalYearId === undefined ||
        String(opening.fiscal_year_id) === String(fiscalYearId)) &&
      (sourceFiscalYearId === undefined ||
        String(opening.source_fiscal_year_id) === String(sourceFiscalYearId)) &&
      (currency === null ||
        fiscalYearOpeningRepository.normalizeCurrency(opening.currency) ===
          fiscalYearOpeningRepository.normalizeCurrency(currency)),
  );

  return row ? round6(row.opening_balance) : null;
}

function journalDebitTotal(journal) {
  return round6(
    Number(journal.first_entry_debit || 0) +
      Number(journal.second_entry_debit || 0),
  );
}

function journalCreditTotal(journal) {
  return round6(
    Number(journal.first_entry_credit || 0) +
      Number(journal.second_entry_credit || 0),
  );
}

function closingJournals(orgId = USER.org_id, fiscalYearId) {
  return journalsForOrg(orgId).filter(
    (journal) =>
      journal.reference_type === fiscalYearCloseService.CLOSING_REFERENCE_TYPE &&
      (fiscalYearId === undefined ||
        String(journal.reference_id) === String(fiscalYearId)),
  );
}

/* ------------------------------- seeding ------------------------------- */

let localIdCounter;

function nextLocalId() {
  localIdCounter += 1;

  return 9000000000000000 + localIdCounter;
}

function seedAccount({
  orgId = USER.org_id,
  code,
  name = code,
  accountTypeId = 1,
  currency = 'AFN',
  status = 1,
}) {
  const localId = nextLocalId();

  const account = {
    id: localId,
    local_id: localId,
    org_id: orgId,
    code,
    name,
    account_type_id: accountTypeId,
    account_status: 'active',
    account_group_id: null,
    currency,
    balance: 0,
    status,
    version: 1,
  };

  state.accounts.push(account);

  return account;
}

/*
 * Seeds (or reuses) a fiscal year.
 *
 * Reuse keeps the fixture honest: `seedContext` already creates the fiscal-year
 * CHAIN that a close requires (a year may only be closed when the next, still
 * open year exists — Step 5), so a test that asks for FY 2027 explicitly gets
 * that same row instead of a second year starting on the same date.
 */
function seedYear({
  orgId = USER.org_id,
  name = FY_2026.name,
  start = FY_2026.start,
  end = FY_2026.end,
  status = 'open',
} = {}) {
  const existing = state.years.find(
    (year) =>
      Number(year.org_id) === Number(orgId) &&
      String(year.start_date) === String(start) &&
      String(year.fiscal_status) === String(status),
  );

  if (existing) {
    return existing;
  }

  const localId = nextLocalId();

  const year = {
    id: localId,
    local_id: localId,
    org_id: orgId,
    name,
    start_date: start,
    end_date: end,
    fiscal_status: status,
    closed_at: null,
    closed_by: null,
    note: null,
    status: 1,
    version: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };

  state.years.push(year);

  return year;
}

/*
 * A double-entry journal built from two account codes, so the seeded ledger
 * reads like real accounting:
 *
 *   seedJournal({ date, credit: { code: 'SALES', amount: 100 }, debit: { code: 'CUST', amount: 100 } })
 */
function seedJournal({
  orgId = USER.org_id,
  date,
  currency = 'AFN',
  referenceType = null,
  referenceId = null,
  debit,
  credit,
  status = 1,
}) {
  const localId = nextLocalId();

  const debitAccount = accountByCode(debit.code, orgId);
  const creditAccount = accountByCode(credit.code, orgId);

  if (!debitAccount || !creditAccount) {
    throw new Error(`missing seeded account for ${debit.code}/${credit.code}`);
  }

  const journal = {
    id: localId,
    local_id: localId,
    org_id: orgId,
    date,
    reference_id: referenceId,
    reference_type: referenceType,
    description: `${debit.code} / ${credit.code}`,
    currency,
    first_entry_account: debitAccount.local_id,
    first_entry_debit: Number(debit.amount),
    first_entry_credit: 0,
    second_entry_account: creditAccount.local_id,
    second_entry_debit: 0,
    second_entry_credit: Number(credit.amount),
    status,
    version: 1,
    created_at: `${date}T10:00:00.000Z`,
  };

  state.journals.push(journal);

  return journal;
}

/*
 * A profitable year: SALES 100,000 credit, PURCHASE 50,000 debit,
 * EXPENSES 20,000 debit, BENEFITS 5,000 credit  ->  net profit 35,000.
 */
function seedProfitableYear(orgId = USER.org_id, currency = 'AFN') {
  seedJournal({
    orgId,
    date: '2026-03-01',
    currency,
    debit: { code: 'RECEIVABLE', amount: 100000 },
    credit: { code: 'SALES', amount: 100000 },
  });

  seedJournal({
    orgId,
    date: '2026-04-01',
    currency,
    debit: { code: 'PURCHASE', amount: 50000 },
    credit: { code: 'PAYABLE', amount: 50000 },
  });

  seedJournal({
    orgId,
    date: '2026-05-01',
    currency,
    debit: { code: 'EXPENSES', amount: 20000 },
    credit: { code: 'TREASURY', amount: 20000 },
  });

  seedJournal({
    orgId,
    date: '2026-06-01',
    currency,
    debit: { code: 'TREASURY', amount: 5000 },
    credit: { code: 'BENEFITS', amount: 5000 },
  });
}

function seedContext({
  orgId = USER.org_id,
  withInventory = true,
  withYears = true,
} = {}) {
  /*
   * The fiscal-year chain a close needs (Step 5): closing FY 2026 rolls the
   * balance-sheet balances into FY 2027, which must exist and be open. FY 2028
   * exists for the same reason on the second hop.
   */
  if (withYears) {
    seedYear({ orgId });
    seedYear({
      orgId,
      name: FY_2027.name,
      start: FY_2027.start,
      end: FY_2027.end,
    });
    seedYear({
      orgId,
      name: 'FY 2028',
      start: '2028-01-01',
      end: '2028-12-31',
    });
  }

  for (const code of ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS', 'TREASURY']) {
    seedAccount({ orgId, code });
  }

  seedAccount({ orgId, code: 'RECEIVABLE', name: 'Receivable' });
  seedAccount({ orgId, code: 'PAYABLE', name: 'Payable' });
  seedAccount({ orgId, code: 'CUSTOMER-1', name: 'Customer One', accountTypeId: 4 });
  seedAccount({ orgId, code: 'SUPPLIER-1', name: 'Supplier One', accountTypeId: 3 });
  seedAccount({ orgId, code: 'OWNER-1', name: 'Owner One', accountTypeId: 7 });

  if (withInventory) {
    state.inventory = {
      products: [{ local_id: 1, org_id: orgId, quantity: 25 }],
      batches: [{ local_id: 1, org_id: orgId, quantity_remaining: 25 }],
      stockTransactions: [{ local_id: 1, org_id: orgId, quantity: 25 }],
    };
  }
}

function installStubs() {
  localIdCounter = 0;

  state = {
    years: [],
    accounts: [],
    journals: [],
    openings: [],
    activities: [],
    invalidatedOrgs: [],
    calls: [],
    inventory: null,
  };

  connection = createConnection();

  pool.getConnection = async () => connection;

  /* ------------------------- fiscal year reads ------------------------- */

  fiscalYearRepository.findByLocalId = async (conn, { orgId, localId }) => {
    state.calls.push('findByLocalId');

    return (
      state.years.find(
        (year) =>
          Number(year.org_id) === Number(orgId) &&
          String(year.local_id) === String(localId),
      ) || null
    );
  };

  fiscalYearRepository.findOverlapping = async () => [];

  fiscalYearRepository.findByStartDate = async (conn, { orgId, startDate }) => {
    state.calls.push(`findByStartDate:${startDate}`);

    return (
      state.years.find(
        (year) =>
          Number(year.org_id) === Number(orgId) &&
          String(year.start_date) === String(startDate) &&
          Number(year.status ?? 1) === 1,
      ) || null
    );
  };

  /*
   * The close now CREATES the receiving fiscal year when it is missing, so the
   * two repository calls that path needs are stubbed here as well.
   */
  fiscalYearRepository.lockOrganizationYears = async (conn, { orgId }) => {
    state.calls.push('lockOrganizationYears');

    return state.years.filter(
      (year) => Number(year.org_id) === Number(orgId),
    );
  };

  fiscalYearRepository.create = async (
    conn,
    {
      orgId,
      localId,
      userId,
      data,
    },
  ) => {
    state.calls.push('createFiscalYear');

    const year = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      name: data.name,
      start_date: data.start_date,
      end_date: data.end_date,
      fiscal_status: 'open',
      closed_at: null,
      closed_by: null,
      note: data.note ?? null,
      status: 1,
      version: 1,
      created_by: userId,
      updated_by: userId,
      created_at: '2027-01-05T09:30:00.000Z',
      updated_at: '2027-01-05T09:30:00.000Z',
    };

    state.years.push(year);

    return year;
  };

  /* ------------------- opening-balance roll-forward (Step 5) ------------------- */

  state.failOpeningAt = null;

  fiscalYearOpeningRepository.findPeriodEndAccountBalances = async (
    conn,
    { orgId, endDate, excludedCodes = [] },
  ) => {
    state.calls.push(`findPeriodEndAccountBalances:${endDate}`);

    return periodEndAccountBalances({ orgId, endDate, excludedCodes });
  };

  fiscalYearOpeningRepository.findAll = async (
    conn,
    {
      orgId,
      fiscalYearId = null,
      sourceFiscalYearId = null,
      source = null,
      includeInactive = false,
    } = {},
  ) => {
    state.calls.push('findOpenings');

    return state.openings.filter(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        (fiscalYearId === null ||
          String(row.fiscal_year_id) === String(fiscalYearId)) &&
        (sourceFiscalYearId === null ||
          String(row.source_fiscal_year_id) === String(sourceFiscalYearId)) &&
        (source === null || row.source === source) &&
        (includeInactive || Number(row.status) === 1),
    );
  };

  fiscalYearOpeningRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createOpening');

    if (state.failOpeningAt !== null) {
      const attempts = state.calls.filter((call) => call === 'createOpening').length;

      if (attempts === state.failOpeningAt) {
        throw new Error('opening balance insert failed');
      }
    }

    const currency = fiscalYearOpeningRepository.normalizeCurrency(data.currency);

    /* the unique key of the real table, enforced in memory */
    const clash = state.openings.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.fiscal_year_id) === String(data.fiscal_year_id) &&
        String(row.account_id) === String(data.account_id) &&
        fiscalYearOpeningRepository.normalizeCurrency(row.currency) === currency &&
        row.source === data.source &&
        Number(row.status) === 1,
    );

    if (clash) {
      const error = new Error('ER_DUP_ENTRY: duplicate opening balance');

      error.code = 'ER_DUP_ENTRY';

      throw error;
    }

    const account = state.accounts.find(
      (row) => String(row.local_id) === String(data.account_id),
    );

    const opening = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: 1,
      version: 1,
      account_code: account?.code ?? null,
      account_name: account?.name ?? null,
      account_type_id: account?.account_type_id ?? null,
      created_at: '2027-01-10T09:30:00.000Z',
      ...data,
      currency,
    };

    state.openings.push(opening);

    return opening;
  };

  fiscalYearOpeningRepository.deactivateBySourceYear = async (
    conn,
    { orgId, sourceFiscalYearId },
  ) => {
    state.calls.push('deactivateOpenings');

    let affected = 0;

    for (const row of state.openings) {
      if (
        Number(row.org_id) === Number(orgId) &&
        String(row.source_fiscal_year_id) === String(sourceFiscalYearId) &&
        Number(row.status) === 1
      ) {
        row.status = 0;
        affected += 1;
      }
    }

    return affected;
  };

  /* --------------------------- close repository --------------------------- */

  fiscalYearCloseRepository.lockOrganization = async (conn, { orgId }) => {
    state.calls.push(`lockOrganization:${orgId}`);

    return { id: orgId };
  };

  fiscalYearCloseRepository.findClosingJournals = async (
    conn,
    { orgId, referenceType, referenceId },
  ) => {
    state.calls.push('findClosingJournals');

    return journalsForOrg(orgId).filter(
      (journal) =>
        journal.reference_type === referenceType &&
        String(journal.reference_id) === String(referenceId) &&
        Number(journal.status ?? 1) === 1,
    );
  };

  fiscalYearCloseRepository.sumPeriodAccountActivity = async (conn, params) => {
    state.calls.push(`sumPeriodAccountActivity:${params.startDate}:${params.endDate}`);

    return periodActivity(params);
  };

  fiscalYearCloseRepository.findPreferredAccountTypeId = async (conn, { orgId }) => {
    state.calls.push('findPreferredAccountTypeId');

    const assets = accountByCode('ASSETS', orgId);

    return assets?.account_type_id ?? 1;
  };

  /*
   * Ledger-hygiene reads, mirroring the production SQL: ACTIVE closing journals
   * whose `fiscal_years` row does not exist, and ACTIVE opening balances whose
   * source year is missing or no longer closed. Without these two stubs the
   * preview reached the real pool and every preview test failed on DNS.
   *
   * A test seeds an orphan by posting a closing journal (or an opening) whose
   * reference names no year of the organization.
   */
  fiscalYearCloseRepository.findOrphanClosingJournals = async (
    conn,
    { orgId, referenceType },
  ) => {
    state.calls.push('findOrphanClosingJournals');

    return journalsForOrg(orgId).filter(
      (journal) =>
        journal.reference_type === referenceType &&
        Number(journal.status ?? 1) === 1 &&
        !state.years.some(
          (year) =>
            Number(year.org_id) === Number(orgId) &&
            String(year.local_id) === String(journal.reference_id),
        ),
    );
  };

  fiscalYearCloseRepository.findOrphanOpeningBalances = async (
    conn,
    { orgId, source, fiscalYearId = null },
  ) => {
    state.calls.push('findOrphanOpeningBalances');

    return state.openings.filter((row) => {
      if (
        Number(row.org_id) !== Number(orgId) ||
        Number(row.status ?? 1) !== 1 ||
        row.source !== source
      ) {
        return false;
      }

      if (
        fiscalYearId !== null &&
        fiscalYearId !== undefined &&
        String(row.fiscal_year_id) !== String(fiscalYearId)
      ) {
        return false;
      }

      return !state.years.some(
        (year) =>
          Number(year.org_id) === Number(orgId) &&
          String(year.local_id) === String(row.source_fiscal_year_id) &&
          Number(year.status ?? 1) === 1 &&
          year.fiscal_status === 'closed',
      );
    });
  };

  fiscalYearCloseRepository.markClosed = async (conn, { orgId, localId, userId }) => {
    state.calls.push('markClosed');

    if (state.forceMarkClosedZero) {
      return 0;
    }

    const year = state.years.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    );

    if (!year || year.fiscal_status !== 'open') {
      return 0;
    }

    year.fiscal_status = 'closed';
    year.closed_at = '2027-01-10T09:30:00.000Z';
    year.closed_by = userId;
    year.version += 1;

    return 1;
  };

  /* ---------------------------- account writes ---------------------------- */

  accountRepository.findByCode = async (conn, { orgId, code }) =>
    accountsForOrg(orgId).find((account) => String(account.code) === String(code)) ||
    null;

  accountRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createAccount');

    const account = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      ...data,
      version: 1,
    };

    state.accounts.push(account);

    return account;
  };

  accountRepository.update = async (conn, { orgId, localId, data }) => {
    state.calls.push('updateAccount');

    const account = accountsForOrg(orgId).find(
      (row) => String(row.local_id) === String(localId),
    );

    if (!account) return null;

    Object.assign(account, data, { version: Number(account.version || 1) + 1 });

    return account;
  };

  /* ---------------------------- journal writes ---------------------------- */

  state.failJournalAt = null;

  journalRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createJournal');

    if (
      state.failJournalAt !== null &&
      state.calls.filter((call) => call === 'createJournal').length === state.failJournalAt
    ) {
      throw new Error('journal insert failed');
    }

    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: 1,
      version: 1,
      created_at: '2027-01-10T09:30:00.000Z',
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  activityRepository.create = async (conn, entry) => {
    state.calls.push(`activity:${entry.action}:${entry.tableName}`);

    state.activities.push(entry);

    return { id: `ACT-${state.activities.length}` };
  };

  accountService.invalidateAccountAggregates = (orgId) => {
    state.invalidatedOrgs.push(orgId);
  };
}

beforeEach(installStubs);

async function closeYear(year, user = USER) {
  return fiscalYearCloseService.closeFiscalYear({
    user,
    fiscalYearId: year.id,
    requestContext: REQUEST_CONTEXT,
  });
}

/* ====================================================================== */
/* RETAINED account                                                        */
/* ====================================================================== */

test('a closed year provisions exactly one RETAINED account for the organization', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  const retained = accountsForOrg(USER.org_id).filter(
    (account) => account.code === RETAINED_ACCOUNT_CODE,
  );

  assert.equal(retained.length, 1);
  assert.equal(retained[0].name, 'Retained Earnings');
  assert.equal(retained[0].status, 1);
  assert.equal(retained[0].currency, null);
  assert.equal(retained[0].balance, 0);
});

test('RETAINED provisioning is idempotent across years', async () => {
  seedContext();
  const first = seedYear();
  seedProfitableYear();

  const firstResult = await closeYear(first);

  assert.equal(firstResult.retained_account.created, true);

  const second = seedYear({ name: FY_2027.name, start: FY_2027.start, end: FY_2027.end });
  const secondResult = await closeYear(second);

  assert.equal(secondResult.retained_account.created, false);

  assert.equal(
    accountsForOrg(USER.org_id).filter((account) => account.code === RETAINED_ACCOUNT_CODE)
      .length,
    1,
  );
});

test('RETAINED is never an owner account', async () => {
  seedContext();
  const owner = accountByCode('OWNER-1');

  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  const retained = accountByCode(RETAINED_ACCOUNT_CODE);

  assert.notEqual(retained.local_id, owner.local_id);
  assert.notEqual(String(retained.account_type_id), '7');

  /* the owner account itself is untouched */
  const untouchedOwner = accountByCode('OWNER-1');

  assert.equal(untouchedOwner.account_type_id, owner.account_type_id);
  assert.equal(untouchedOwner.balance, owner.balance);
});

test('a soft-deleted RETAINED account is revived instead of duplicated', async () => {
  seedContext();
  const deleted = seedAccount({
    code: RETAINED_ACCOUNT_CODE,
    name: 'Retained Earnings',
    status: 0,
  });

  const year = seedYear();
  seedProfitableYear();

  const result = await closeYear(year);

  assert.equal(result.retained_account.restored, true);
  assert.equal(result.retained_account.created, false);

  const retained = accountsForOrg(USER.org_id).filter(
    (account) => account.code === RETAINED_ACCOUNT_CODE,
  );

  assert.equal(retained.length, 1);
  assert.equal(retained[0].local_id, deleted.local_id);
  assert.equal(Number(retained[0].status), 1);
});

test('RETAINED provisioning is organization-scoped', async () => {
  seedContext();
  seedContext({ orgId: OTHER_ORG_USER.org_id, withInventory: false });

  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  assert.equal(
    accountsForOrg(OTHER_ORG_USER.org_id).filter(
      (account) => account.code === RETAINED_ACCOUNT_CODE,
    ).length,
    0,
  );
});

/* ====================================================================== */
/* Close preview                                                           */
/* ====================================================================== */

test('the preview writes absolutely nothing', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const before = structuredClone(state);

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.read_only, true);
  assert.equal(state.journals.length, before.journals.length);
  assert.equal(state.accounts.length, before.accounts.length);
  assert.equal(state.years[0].fiscal_status, 'open');
  assert.deepEqual(state.inventory, before.inventory);

  /* even the RETAINED account is only created inside the close */
  assert.equal(
    accountsForOrg(USER.org_id).some((account) => account.code === RETAINED_ACCOUNT_CODE),
    false,
  );
  assert.equal(preview.retained_account, null);
});

test('the preview excludes activity before the fiscal year start', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2025-12-31',
    debit: { code: 'RECEIVABLE', amount: 900 },
    credit: { code: 'SALES', amount: 900 },
  });
  seedProfitableYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const sales = preview.currencies[0].accounts.find((account) => account.code === 'SALES');

  assert.equal(sales.credit, 100000);
  assert.equal(sales.net, 100000);
});

test('the preview excludes activity after the fiscal year end', async () => {
  seedContext();
  const year = seedYear();

  seedProfitableYear();

  seedJournal({
    date: '2027-01-01',
    debit: { code: 'RECEIVABLE', amount: 900 },
    credit: { code: 'SALES', amount: 900 },
  });

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const sales = preview.currencies[0].accounts.find((account) => account.code === 'SALES');

  assert.equal(sales.credit, 100000);
});

test('SALES is classified as a credit-balance account', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const sales = preview.currencies[0].accounts.find((account) => account.code === 'SALES');
  const line = preview.proposed_journals.find((entry) => entry.code === 'SALES');

  assert.equal(sales.position, 'credit');
  assert.equal(sales.net, 100000);
  assert.equal(line.first_entry_debit, 100000);
  assert.equal(line.first_entry_credit, 0);
  assert.equal(line.second_entry_credit, 100000);
  assert.equal(sales.result, 'income');
});

test('PURCHASE and EXPENSES are classified as debit-balance accounts', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  for (const code of ['PURCHASE', 'EXPENSES']) {
    const account = preview.currencies[0].accounts.find((entry) => entry.code === code);
    const line = preview.proposed_journals.find((entry) => entry.code === code);

    /* the account is CREDITED by its period debit balance, RETAINED debited */
    assert.equal(account.position, 'debit', code);
    assert.equal(account.result, 'expense', code);
    assert.equal(account.net, -account.debit, code);
    assert.equal(line.first_entry_credit, account.debit, code);
    assert.equal(line.second_entry_debit, account.debit, code);
    assert.equal(line.first_entry_debit, 0, code);
    assert.equal(line.second_entry_credit, 0, code);
  }
});

test('a BENEFITS credit balance is closed like income', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 5000 },
    credit: { code: 'BENEFITS', amount: 5000 },
  });

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const benefits = preview.currencies[0].accounts.find((entry) => entry.code === 'BENEFITS');

  assert.equal(benefits.net, 5000);
  assert.equal(benefits.position, 'credit');
  assert.equal(preview.profit_loss[0].profit_loss, 5000);
  assert.equal(preview.profit_loss[0].result, 'profit');
});

test('a BENEFITS debit balance is closed like an expense', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'BENEFITS', amount: 4000 },
    credit: { code: 'TREASURY', amount: 4000 },
  });

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const benefits = preview.currencies[0].accounts.find((entry) => entry.code === 'BENEFITS');
  const line = preview.proposed_journals.find((entry) => entry.code === 'BENEFITS');

  assert.equal(benefits.net, -4000);
  assert.equal(benefits.position, 'debit');
  assert.equal(line.first_entry_credit, 4000);
  assert.equal(line.second_entry_debit, 4000);
  assert.equal(preview.profit_loss[0].result, 'loss');
});

test('the preview reports the net profit of the year', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.profit_loss.length, 1);
  assert.equal(preview.profit_loss[0].currency, 'AFN');
  assert.equal(preview.profit_loss[0].profit_loss, 35000);
  assert.equal(preview.profit_loss[0].result, 'profit');
  assert.equal(preview.proposed_journal_count, 4);
  assert.equal(preview.closing_journal_date, FY_2026.end);
});

test('the preview reports a net loss', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'PURCHASE', amount: 8000 },
    credit: { code: 'PAYABLE', amount: 8000 },
  });

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.profit_loss[0].profit_loss, -8000);
  assert.equal(preview.profit_loss[0].result, 'loss');
});

test('a year with no P&L activity proposes no journal at all', async () => {
  seedContext();
  const year = seedYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.deepEqual(preview.proposed_journals, []);
  assert.deepEqual(preview.profit_loss, []);
  assert.equal(preview.proposed_journal_count, 0);
});

test('currencies stay separate in the preview', async () => {
  seedContext();
  const year = seedYear();

  seedProfitableYear(USER.org_id, 'AFN');
  seedProfitableYear(USER.org_id, 'USD');

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.currencies.length, 2);

  const byCurrency = new Map(
    preview.profit_loss.map((entry) => [entry.currency, entry.profit_loss]),
  );

  assert.equal(byCurrency.get('AFN'), 35000);
  assert.equal(byCurrency.get('USD'), 35000);

  /* no currency is ever the sum of the others */
  assert.equal(
    preview.currencies.every((bucket) =>
      bucket.accounts.every((account) => Number.isFinite(Number(account.net))),
    ),
    true,
  );
});

test('cross-organization isolation applies to the close preview', async () => {
  seedContext();
  const year = seedYear();

  await assert.rejects(
    () =>
      fiscalYearCloseService.previewFiscalYearClose({
        user: OTHER_ORG_USER,
        fiscalYearId: year.id,
      }),
    (error) => error.code === 'FISCAL_YEAR_NOT_FOUND',
  );
});

/* ====================================================================== */
/* Close                                                                   */
/* ====================================================================== */

test('closing a profitable year creates one balanced journal per P&L account', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const result = await closeYear(year);

  assert.equal(result.closing_journals_created, 4);
  assert.equal(result.zero_activity, false);

  for (const journal of result.closing_journals) {
    assert.equal(journalDebitTotal(journal), journalCreditTotal(journal));
  }

  const totalDebit = round6(
    result.closing_journals.reduce(
      (sum, journal) => sum + journalDebitTotal(journal),
      0,
    ),
  );
  const totalCredit = round6(
    result.closing_journals.reduce(
      (sum, journal) => sum + journalCreditTotal(journal),
      0,
    ),
  );

  assert.equal(totalDebit, totalCredit);
});

test('every closing journal is dated with the fiscal year end date', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const result = await closeYear(year);

  for (const journal of result.closing_journals) {
    assert.equal(journal.date, FY_2026.end);
  }

  /* created_at stays the real posting timestamp */
  for (const journal of closingJournals()) {
    assert.equal(String(journal.created_at).slice(0, 10), '2027-01-10');
  }
});

test('every closing journal identifies the fiscal year it closes', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  const created = closingJournals(USER.org_id, year.id);

  assert.equal(created.length, 4);

  for (const journal of created) {
    assert.equal(journal.reference_type, 'fiscal_year_close');
    assert.equal(String(journal.reference_id), String(year.id));
    assert.equal(Number(journal.status), 1);
  }
});

test('after the close each P&L account nets to zero for the fiscal year', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  for (const code of PNL_ACCOUNT_CODES) {
    assert.equal(
      periodNet(code, { startDate: FY_2026.start, endDate: FY_2026.end }),
      0,
      `${code} must be closed to zero`,
    );
  }
});

test('profit is credited to RETAINED', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  assert.equal(
    periodNet(RETAINED_ACCOUNT_CODE, {
      startDate: FY_2026.start,
      endDate: FY_2026.end,
    }),
    35000,
  );
});

test('a loss is debited to RETAINED without any special case', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'EXPENSES', amount: 12000 },
    credit: { code: 'TREASURY', amount: 12000 },
  });

  const result = await closeYear(year);

  assert.equal(result.profit_loss[0].result, 'loss');
  assert.equal(result.profit_loss[0].profit_loss, -12000);

  assert.equal(
    periodNet(RETAINED_ACCOUNT_CODE, {
      startDate: FY_2026.start,
      endDate: FY_2026.end,
    }),
    -12000,
  );

  /* the debit went to RETAINED, not to an owner account */
  const retainedLine = closingJournals().find(
    (journal) => journal.first_entry_account !== journal.second_entry_account,
  );

  const retained = accountByCode(RETAINED_ACCOUNT_CODE);

  const retainedDebit = closingJournals().reduce((sum, journal) => {
    let total = sum;

    if (String(journal.first_entry_account) === String(retained.local_id)) {
      total += Number(journal.first_entry_debit || 0);
    }

    if (String(journal.second_entry_account) === String(retained.local_id)) {
      total += Number(journal.second_entry_debit || 0);
    }

    return total;
  }, 0);

  assert.ok(retainedLine);
  assert.equal(retainedDebit, 12000);
});

test('each currency is closed by its own independently balanced journal', async () => {
  seedContext();
  const year = seedYear();

  seedProfitableYear(USER.org_id, 'AFN');
  seedProfitableYear(USER.org_id, 'USD');

  const result = await closeYear(year);

  const afn = closingJournals().filter((journal) => journal.currency === 'AFN');
  const usd = closingJournals().filter((journal) => journal.currency === 'USD');

  assert.equal(afn.length, 4);
  assert.equal(usd.length, 4);

  for (const journal of [...afn, ...usd]) {
    assert.equal(journalDebitTotal(journal), journalCreditTotal(journal));
  }

  for (const currency of ['AFN', 'USD']) {
    for (const code of PNL_ACCOUNT_CODES) {
      assert.equal(
        periodNet(code, {
          currency,
          startDate: FY_2026.start,
          endDate: FY_2026.end,
        }),
        0,
        `${code} ${currency}`,
      );
    }

    assert.equal(
      periodNet(RETAINED_ACCOUNT_CODE, {
        currency,
        startDate: FY_2026.start,
        endDate: FY_2026.end,
      }),
      35000,
      `RETAINED ${currency}`,
    );
  }

  /* no journal ever mixes two currencies */
  assert.equal(
    result.currency_results.length,
    2,
  );
});

test('closing does not touch inventory', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const inventoryBefore = structuredClone(state.inventory);

  await closeYear(year);

  assert.deepEqual(state.inventory, inventoryBefore);
});

test('closing does not reset customer, supplier or owner balances', async () => {
  seedContext();

  seedJournal({
    date: '2026-03-05',
    debit: { code: 'CUSTOMER-1', amount: 100000 },
    credit: { code: 'SALES', amount: 100000 },
  });
  seedJournal({
    date: '2026-04-05',
    debit: { code: 'PURCHASE', amount: 50000 },
    credit: { code: 'SUPPLIER-1', amount: 50000 },
  });
  seedJournal({
    date: '2026-05-05',
    debit: { code: 'TREASURY', amount: 30000 },
    credit: { code: 'OWNER-1', amount: 30000 },
  });

  const customerBefore = periodNet('CUSTOMER-1', { startDate: '2026-01-01' });
  const supplierBefore = periodNet('SUPPLIER-1', { startDate: '2026-01-01' });
  const ownerBefore = periodNet('OWNER-1', { startDate: '2026-01-01' });
  const journalsBefore = journalsForOrg(USER.org_id).length;

  const year = seedYear();

  await closeYear(year);

  assert.equal(periodNet('CUSTOMER-1', { startDate: '2026-01-01' }), customerBefore);
  assert.equal(periodNet('SUPPLIER-1', { startDate: '2026-01-01' }), supplierBefore);
  assert.equal(periodNet('OWNER-1', { startDate: '2026-01-01' }), ownerBefore);

  /* only the closing journals were added: no balance was rewritten in place */
  assert.equal(
    journalsForOrg(USER.org_id).length - journalsBefore,
    closingJournals().length,
  );
});

test('the fiscal year is marked closed with closed_at and closed_by', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const result = await closeYear(year);

  assert.equal(result.status, 'closed');
  assert.equal(result.fiscal_year.fiscal_status, 'closed');
  assert.equal(state.years[0].fiscal_status, 'closed');
  assert.ok(result.closed_at);
  assert.equal(String(result.closed_by), String(USER.local_id));

  const activity = state.activities.find((entry) => entry.tableName === 'fiscal_years');

  assert.equal(activity.action, 'close');
  assert.equal(activity.entityId, year.id);
});

test('closing records an activity log for every closing journal', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  const journalActivities = state.activities.filter(
    (entry) => entry.tableName === 'journals',
  );

  assert.equal(journalActivities.length, 4);
  assert.equal(
    journalActivities.every((entry) => entry.action === 'create'),
    true,
  );
});

test('a second close of the same year is rejected and posts nothing', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  const journalsAfterFirstClose = state.journals.length;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_ALREADY_CLOSED');
      assert.equal(error.statusCode, 409);

      return true;
    },
  );

  assert.equal(state.journals.length, journalsAfterFirstClose);
  assert.equal(state.years[0].version, 2);
});

test('a year whose status flip loses a race is rejected and rolled back', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  /*
   * Simulates the losing side of two concurrent closes: the OPEN -> CLOSED
   * update matches zero rows because the other transaction closed the year
   * first.
   */
  state.forceMarkClosedZero = true;

  const before = structuredClone(state);

  await assert.rejects(
    () => closeYear(year),
    (error) => error.code === 'FISCAL_YEAR_ALREADY_CLOSED',
  );

  assert.equal(connection.rolledBack, true);
  assert.equal(state.years[0].fiscal_status, 'open');
  assert.equal(state.journals.length, before.journals.length);
  assert.equal(closingJournals().length, 0);
});

test('a failure while posting a closing journal rolls the whole close back', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const before = structuredClone(state);

  /* the second of the four closing journals fails */
  state.failJournalAt = 2;

  await assert.rejects(() => closeYear(year), /journal insert failed/);

  assert.equal(connection.rolledBack, true);
  assert.equal(state.years[0].fiscal_status, 'open');
  assert.equal(state.journals.length, before.journals.length);
  assert.equal(closingJournals().length, 0);
  assert.equal(
    accountsForOrg(USER.org_id).some((account) => account.code === RETAINED_ACCOUNT_CODE),
    false,
  );
  assert.equal(state.activities.length, 0);
  assert.deepEqual(state.invalidatedOrgs, []);
});

test('a zero-activity year still closes, without a zero-value journal', async () => {
  seedContext();
  const year = seedYear();

  const result = await closeYear(year);

  assert.equal(result.zero_activity, true);
  assert.equal(result.closing_journals_created, 0);
  assert.deepEqual(result.closing_journals, []);
  assert.equal(closingJournals().length, 0);
  assert.equal(state.years[0].fiscal_status, 'closed');
  assert.equal(result.status, 'closed');
});

test('closing creates no next-year opening journal', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const result = await closeYear(year);

  assert.equal(result.next_year_opening_journals_created, 0);

  const outsideRange = journalsForOrg(USER.org_id).filter(
    (journal) =>
      String(journal.date).slice(0, 10) > FY_2026.end ||
      String(journal.date).slice(0, 10) < FY_2026.start,
  );

  assert.deepEqual(
    outsideRange.map((journal) => journal.date),
    [],
  );
});

test('RETAINED carries forward into the next fiscal year without an opening journal', async () => {
  seedContext();

  const first = seedYear();
  seedProfitableYear();

  await closeYear(first);

  assert.equal(
    periodNet(RETAINED_ACCOUNT_CODE, { startDate: '2000-01-01' }),
    35000,
  );

  /* a smaller second year: 20,000 of revenue, 5,000 of expenses */
  seedJournal({
    date: '2027-03-01',
    debit: { code: 'RECEIVABLE', amount: 20000 },
    credit: { code: 'SALES', amount: 20000 },
  });
  seedJournal({
    date: '2027-04-01',
    debit: { code: 'EXPENSES', amount: 5000 },
    credit: { code: 'TREASURY', amount: 5000 },
  });

  const second = seedYear({ name: FY_2027.name, start: FY_2027.start, end: FY_2027.end });

  const secondResult = await closeYear(second);

  assert.equal(secondResult.profit_loss[0].profit_loss, 15000);

  /*
   * The same RETAINED account keeps its FY 2026 balance and accumulates the
   * FY 2027 result: 35,000 + 15,000. Nothing re-creates it, nothing resets
   * it, and no opening journal was posted.
   */
  assert.equal(
    periodNet(RETAINED_ACCOUNT_CODE, { startDate: '2000-01-01' }),
    50000,
  );

  assert.equal(
    accountsForOrg(USER.org_id).filter((account) => account.code === RETAINED_ACCOUNT_CODE)
      .length,
    1,
  );

  /* FY 2027's own window only sees its own result */
  assert.equal(
    periodNet(RETAINED_ACCOUNT_CODE, {
      startDate: FY_2027.start,
      endDate: FY_2027.end,
    }),
    15000,
  );
});

test('the close serializes per organization before writing anything', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  assert.equal(state.calls[0], `lockOrganization:${USER.org_id}`);
});

test('the close refreshes the organization account aggregates after commit', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  await closeYear(year);

  assert.deepEqual(state.invalidatedOrgs, [USER.org_id]);
  assert.equal(connection.committed, true);
  assert.equal(connection.released, true);
});

test('an unauthenticated or invalid identity is rejected', async () => {
  seedContext();
  const year = seedYear();

  await assert.rejects(
    () => closeYear(year, {}),
    (error) => error.code === 'INVALID_ORGANIZATION',
  );
});

test('closing cannot reach another organization fiscal year', async () => {
  seedContext();
  const year = seedYear();

  await assert.rejects(
    () => closeYear(year, OTHER_ORG_USER),
    (error) => error.code === 'FISCAL_YEAR_NOT_FOUND',
  );
});

test('closing an already closed year is rejected by the status check', async () => {
  seedContext();
  const year = seedYear({ status: 'closed' });
  seedProfitableYear();

  await assert.rejects(
    () => closeYear(year),
    (error) => error.code === 'FISCAL_YEAR_ALREADY_CLOSED',
  );

  assert.equal(state.journals.length, 4);
});

/* ====================================================================== */
/* Plan builder invariants                                                 */
/* ====================================================================== */

test('the plan builder never emits a zero-value line', () => {
  const plan = fiscalYearCloseService.buildClosingPlan({
    fiscalYear: {
      id: 1,
      name: 'FY',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    },
    retainedAccountId: 99,
    rows: [
      {
        account_code: 'SALES',
        account_local_id: 10,
        account_name: 'Sales',
        currency: 'AFN',
        entries: 3,
        debit: 0,
        credit: 15,
      },
      {
        account_code: 'PURCHASE',
        account_local_id: 11,
        account_name: 'Purchase',
        currency: 'AFN',
        entries: 1,
        debit: 15,
        credit: 0,
      },
      {
        account_code: 'EXPENSES',
        account_local_id: 12,
        account_name: 'Expenses',
        currency: 'AFN',
        entries: 0,
        debit: 0,
        credit: 0,
      },
    ],
  });

  assert.equal(plan.lines.length, 2);
  assert.equal(plan.profit_loss[0].profit_loss, 0);
  assert.equal(plan.profit_loss[0].result, 'breakeven');
});

test('the plan builder rounds to the journal column precision', () => {
  const plan = fiscalYearCloseService.buildClosingPlan({
    fiscalYear: {
      id: 1,
      name: 'FY',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    },
    retainedAccountId: 99,
    rows: [
      {
        account_code: 'SALES',
        account_local_id: 10,
        account_name: 'Sales',
        currency: 'AFN',
        entries: 2,
        debit: 0,
        credit: 0.1 + 0.2,
      },
    ],
  });

  assert.equal(plan.lines.length, 1);
  assert.equal(plan.lines[0].amount, 0.3);
  assert.equal(plan.lines[0].first_entry_debit, 0.3);
  assert.equal(plan.lines[0].second_entry_credit, 0.3);
});

/* ====================================================================== */
/* API shape                                                               */
/* ====================================================================== */

test('the router exposes a close preview and a close, and nothing destructive', () => {
  const router = require('../routes/v2/fiscal-year.routes');

  const routes = router.stack
    .filter((layer) => layer.route)
    .map(
      (layer) =>
        `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`,
    );

  assert.ok(routes.includes('GET /:id/close-preview'));
  assert.ok(routes.includes('POST /:id/close'));

  /*
   * Step 5 added the archive reads and the reopen that undoes a close. No
   * route can edit or delete a closing journal: reopen is the one, audited way
   * back, and every removal is a soft delete inside it.
   */
  assert.ok(routes.includes('POST /:id/reopen'));
  assert.ok(routes.includes('GET /:id/opening-balances'));
  assert.ok(routes.includes('GET /:id/accounts/:accountId/statement'));

  assert.equal(
    routes.some((route) => /unclose|revert|DELETE|PATCH/i.test(route)),
    false,
  );
});

test('the close endpoint takes no body and is registered after the literals', () => {
  const routesSource = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'v2', 'fiscal-year.routes.js'),
    'utf8',
  );

  const previewIndex = routesSource.indexOf("'/:id/close-preview'");
  const idIndex = routesSource.lastIndexOf("'/:id'");

  assert.ok(previewIndex > -1 && idIndex > -1);
  assert.ok(previewIndex < idIndex);
  assert.match(routesSource, /'\/:id\/close'/);
  assert.doesNotMatch(routesSource, /router\.delete\(/);
});

test('the closing module never mutates inventory, batches or party balances', () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'fiscal-year-close.service.js'),
    'utf8',
  );

  for (const forbidden of [
    'product.repository',
    'stock-batch.repository',
    'stock-transaction.repository',
    'warehouse-product.repository',
    'batch-ledger',
    'sale.repository',
    'purchase.repository',
  ]) {
    assert.equal(
      serviceSource.includes(forbidden),
      false,
      `closing must not import ${forbidden}`,
    );
  }
});

test('the closing repository is the only place that builds the period query', () => {
  const repositorySource = fs.readFileSync(
    path.join(__dirname, '..', 'repositories', 'fiscal-year-close.repository.js'),
    'utf8',
  );

  assert.match(repositorySource, /windowSql\('j\.date'\)/);
  assert.match(repositorySource, /reference_type = 'fiscal_year_close'/);
});

/*
 * SQL-shape guard, mirroring the Step 3 one.
 *
 * The behavioural tests replace the aggregates with stubs, so a qualifier
 * mistake in the real SQL would only surface against a live MySQL server
 * (ER_NON_UNIQ_ERROR, because journals and accounts both define created_at).
 */
function recordingExecutor() {
  const statements = [];
  const executor = {
    async execute(sql) {
      statements.push(sql);

      return [[], []];
    },
  };

  return {
    executor,
    statements,
  };
}

function loadUnstubbedCloseRepository() {
  const modulePath = require.resolve('../repositories/fiscal-year-close.repository');
  const cached = require.cache[modulePath];

  delete require.cache[modulePath];

  const fresh = require('../repositories/fiscal-year-close.repository');

  if (cached) {
    require.cache[modulePath] = cached;
  }

  return fresh;
}

test('the period query is windowed, qualified and excludes the closing journals', async () => {
  const repository = loadUnstubbedCloseRepository();
  const recorder = recordingExecutor();

  await repository.sumPeriodAccountActivity(recorder.executor, {
    orgId: USER.org_id,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    codes: PNL_ACCOUNT_CODES,
    excludeReferenceType: 'fiscal_year_close',
    excludeReferenceId: 1234,
  });

  assert.equal(recorder.statements.length, 2);
  assert.equal(recorder.statements[0].includes('a.code IN (?, ?, ?, ?)'), true);

  for (const sql of recorder.statements) {
    assert.match(sql, /COALESCE\(j\.date, j\.created_at\)/);
    assert.match(sql, /DATE_ADD\(\?, INTERVAL 1 DAY\)/);
    assert.match(
      sql,
      /NOT \(j\.reference_type = \? AND j\.reference_id = \?\)/,
    );

    /* no unqualified created_at anywhere in the statement */
    assert.equal(
      /(^|[^.\w])created_at/.test(sql.replace(/j\.created_at/g, '')),
      false,
    );
  }
});

test('the closing-journal lookup filters by status and organization', async () => {
  const repository = loadUnstubbedCloseRepository();
  const recorder = recordingExecutor();

  await repository.findClosingJournals(recorder.executor, {
    orgId: USER.org_id,
    referenceType: 'fiscal_year_close',
    referenceId: 1234,
  });

  const sql = recorder.statements[0];

  assert.match(sql, /FROM journals/);
  assert.match(sql, /org_id = \?/);
  assert.match(sql, /reference_type = \?/);
  assert.match(sql, /reference_id = \?/);
  assert.match(sql, /status = 1/);
});

/* ====================================================================== */
/* Frontend                                                                */
/* ====================================================================== */

test('the close UI is a single confirmed request that orchestrates nothing', () => {
  const pagePath = path.join(
    __dirname,
    '..',
    '..',
    'frontend',
    'src',
    'pages',
    'FiscalYears.svelte',
  );

  const source = fs.readFileSync(pagePath, 'utf8');

  /* exactly one authoritative close call, inside the confirmation handler */
  const closeCalls = source.match(/fiscalYearApi\.close\(/g) || [];

  assert.equal(closeCalls.length, 1);

  const confirmStart = source.indexOf('async function confirmClose');
  const afterConfirm = source.slice(confirmStart);

  assert.ok(confirmStart > -1);
  assert.ok(afterConfirm.indexOf('fiscalYearApi.close(') > -1);

  /* the user must be warned and must confirm */
  assert.match(source, /Closing is an accounting action/);
  assert.match(source, /<AppModal/);
  assert.match(source, /fiscalYearApi\.getClosePreview\(/);
  assert.match(source, /on:click=\{confirmClose\}/);

  /* the page never touches inventory or payments on behalf of the close */
  for (const forbidden of [
    'productApi',
    'stockTransaction',
    'stock_transaction',
    'warehouse',
    'salePaymentApi',
    'purchasePaymentApi',
    'batch',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `the fiscal-year page must not reference ${forbidden}`,
    );
  }
});

test('the frontend API exposes a close, a preview and the audited reopen', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'api', 'fiscalYearApi.js'),
    'utf8',
  );

  assert.match(source, /getClosePreview:/);
  assert.match(
    source,
    /close: \(id\) => api\.post\(`\$\{BASE_URL\}\/\$\{id\}\/close`\)/,
  );

  /*
   * Step 5: the archive reads and the reopen that undoes a close. There is
   * still no "delete a close", no unclose alias and no revert: reopen is the
   * one backend-authoritative way back.
   */
  assert.match(source, /getOpeningBalances:/);
  assert.match(source, /getAccountStatement:/);
  assert.match(
    source,
    /reopen: \(id, data\) => api\.post\(`\$\{BASE_URL\}\/\$\{id\}\/reopen`, data \|\| \{\}\)/,
  );

  const codeOnly = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.equal(/unclose|revert/i.test(codeOnly), false);
});

/* ====================================================================== */
/* Ledger hygiene: an orphaned close blocks its organization entirely      */
/* ====================================================================== */

/*
 * An orphan closing journal is an ACTIVE `fiscal_year_close` journal whose
 * reference_id names a fiscal year that does not exist. It is seeded directly
 * because no code path can produce one: production holds six, all created
 * outside the API by an older build, and they are never repaired here.
 *
 * Policy under test — deliberately DATE-INDEPENDENT:
 *
 *   ANY active orphan blocks EVERY close of that organization.
 *
 * The journal's own date is not the safety decision. Its service period is
 * gone, so its accounting ownership cannot be proven, and the RETAINED effect
 * it already produced is still posted. An orphan dated one day after a
 * replacement year's end may well belong to the successor period — which is
 * exactly why overlap cannot decide it.
 */
/* deliberately outside the harness's id generator (9000000000000000 + n) */
const ORPHAN_FISCAL_YEAR_ID = '9999999999999999';

function seedOrphanClosingJournal({
  orgId = USER.org_id,
  date = '2026-06-30',
  currency = 'AFN',
  status = 1,
  referenceId = ORPHAN_FISCAL_YEAR_ID,
} = {}) {
  const localId = nextLocalId();

  const journal = {
    id: localId,
    local_id: localId,
    org_id: orgId,
    reference_id: referenceId,
    reference_type: 'fiscal_year_close',
    description: 'closing entry of a fiscal year that no longer exists',
    currency,
    date,
    status,
    version: 1,
    created_at: `${date}T10:00:00.000Z`,
  };

  state.journals.push(journal);

  return journal;
}

function closingJournalsFor(referenceId) {
  return state.journals.filter(
    (journal) =>
      journal.reference_type === 'fiscal_year_close' &&
      String(journal.reference_id) === String(referenceId),
  );
}

async function previewYear(year, user = USER) {
  return fiscalYearCloseService.previewFiscalYearClose({
    user,
    fiscalYearId: year.id,
  });
}

test('an orphan closing journal blocks the close of its organization', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  seedOrphanClosingJournal({ date: '2026-06-30' });

  const journalsBefore = state.journals.length;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'ORPHAN_CLOSING_JOURNALS');
      assert.equal(error.details.orphan_closing_journals.length, 1);
      assert.equal(
        error.details.orphan_closing_journals[0].reference_id,
        ORPHAN_FISCAL_YEAR_ID,
      );

      /* the date stays in the details, as a diagnostic only */
      assert.equal(
        error.details.orphan_closing_journals[0].accounting_date,
        '2026-06-30',
      );

      assert.match(error.details.policy, /any active/);

      return true;
    },
  );

  /* nothing happened: no closing journal, no opening, no status flip */
  assert.equal(state.journals.length, journalsBefore);
  assert.equal(state.openings.length, 0);
  assert.equal(connection.rolledBack, true);
  assert.equal(
    state.years.find((row) => row.local_id === year.id).fiscal_status,
    'open',
  );
});

test('an orphan dated OUTSIDE the candidate year blocks just as well', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  /* a year before the candidate: its own period is gone either way */
  seedOrphanClosingJournal({ date: '2025-01-15' });

  await assert.rejects(
    () => closeYear(year),
    (error) => error.code === 'ORPHAN_CLOSING_JOURNALS',
  );

  assert.equal(closingJournalsFor(year.id).length, 0);
  assert.equal(connection.rolledBack, true);
});

test('an orphan one day after the candidate year end still blocks', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  /*
   * 2027-01-01 is the day after FY 2026 ends, so it could belong to the
   * successor period — which is exactly why overlap is not the rule.
   */
  seedOrphanClosingJournal({ date: '2027-01-01' });

  await assert.rejects(
    () => closeYear(year),
    (error) => error.code === 'ORPHAN_CLOSING_JOURNALS',
  );
});

test('a SOFT-DELETED orphan does not block: only active rows are read', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  seedOrphanClosingJournal({ date: '2026-06-30', status: 0 });

  const result = await closeYear(year);

  assert.equal(result.status, 'closed');
});

test('another organization\'s orphan does not block this one', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  seedOrphanClosingJournal({ orgId: USER.org_id + 1, date: '2026-06-30' });

  const result = await closeYear(year);

  assert.equal(result.status, 'closed');
});

test('the preview reports ledger_ready false when any active orphan exists', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  seedOrphanClosingJournal({ date: '2026-06-30' });

  const journalsBefore = state.journals.length;

  const preview = await previewYear(year);

  assert.equal(preview.read_only, true);
  assert.equal(preview.ledger_ready, false);
  assert.equal(preview.orphan_closing_journals.length, 1);
  assert.equal(preview.orphan_closing_journals_blocking.length, 1);
  assert.equal(
    preview.orphan_closing_journals_blocking[0].reference_id,
    ORPHAN_FISCAL_YEAR_ID,
  );

  /* the date is reported, not used */
  assert.equal(
    preview.orphan_closing_journals[0].accounting_date,
    '2026-06-30',
  );

  assert.equal(state.journals.length, journalsBefore, 'preview writes nothing');
});

test('a clean organization reports ledger_ready true and closes normally', async () => {
  seedContext();
  const year = seedYear();
  seedProfitableYear();

  const preview = await previewYear(year);

  assert.equal(preview.ledger_ready, true);
  assert.deepEqual(preview.orphan_closing_journals, []);
  assert.deepEqual(preview.orphan_closing_journals_blocking, []);

  const result = await closeYear(year);

  assert.equal(result.status, 'closed');
  assert.equal(closingJournalsFor(year.id).length > 0, true);
});
