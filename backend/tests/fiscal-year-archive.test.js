/*
 * fiscal-year-archive.test.js
 *
 * Step 5 tests for the fiscal-year ARCHIVE + balance ROLL-FORWARD.
 *
 * Everything runs against stubbed repositories, a fake connection and an
 * in-memory double-entry ledger, so there is NO database connection and no
 * production data is touched.
 *
 * The harness re-implements the documented SQL semantics so the assertions are
 * real accounting assertions:
 *
 *   * the snapshot of a balance-sheet account is `SUM(credit - debit)` over
 *     every ACTIVE journal up to and including the source year's end_date;
 *   * the P&L codes (SALES / PURCHASE / EXPENSES / BENEFITS) never roll
 *     forward, because Step 4 already closed them into RETAINED;
 *   * currencies are separate buckets and are never summed;
 *   * a snapshot is NOT a journal — the historical journals stay in the
 *     ledger, so posting an opening journal would double-count every balance.
 */

process.env.DB_HOST = 'fiscal-year-archive-test-host';
process.env.DB_USER = 'fiscal-year-archive-test-user';
process.env.DB_PASSWORD = 'fiscal-year-archive-test-password';
process.env.DB_NAME = 'fiscal-year-archive-test-db';

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

const fiscalYearArchiveService =
  require('../services/fiscal-year-archive.service');

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

const FY_2026 = { name: 'FY 2026', start: '2026-01-01', end: '2026-12-31' };
const FY_2027 = { name: 'FY 2027', start: '2027-01-01', end: '2027-12-31' };
const FY_2028 = { name: 'FY 2028', start: '2028-01-01', end: '2028-12-31' };

let state;
let connection;

/* ------------------------------- harness ------------------------------- */

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
    (account) =>
      String(account.code) === String(code) && Number(account.status) === 1,
  );
}

function journalsForOrg(orgId) {
  return state.journals.filter(
    (journal) => Number(journal.org_id) === Number(orgId),
  );
}

/*
 * Signed period-end balance per account + currency over the whole ledger up to
 * (and including) `endDate`: credit - debit. One-sided on purpose — this is the
 * closing balance of a year, not that year's movement.
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

    if (!date || date > endDate) continue;

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

/*
 * The Step 4 closing query, in memory: net activity (credit - debit) of the
 * given codes inside the inclusive window, closing journals excluded.
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

  if (existing) return existing;

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
 * Accounts the roll-forward cares about: the four P&L codes, a treasury/cash
 * account, receivable/payable controls, one customer, one supplier, one owner
 * and the ASSETS bucket.
 */
function seedContext({
  orgId = USER.org_id,
  withInventory = true,
  withYears = true,
} = {}) {
  if (withYears) {
    seedYear({ orgId });
    seedYear({ orgId, name: FY_2027.name, start: FY_2027.start, end: FY_2027.end });
    seedYear({ orgId, name: FY_2028.name, start: FY_2028.start, end: FY_2028.end });
  }

  for (const code of ['SALES', 'PURCHASE', 'EXPENSES', 'BENEFITS']) {
    seedAccount({ orgId, code });
  }

  seedAccount({ orgId, code: 'TREASURY', name: 'Cash' });
  seedAccount({ orgId, code: 'RECEIVABLE', name: 'Receivable' });
  seedAccount({ orgId, code: 'PAYABLE', name: 'Payable' });
  seedAccount({ orgId, code: 'ASSETS', name: 'Assets' });
  seedAccount({ orgId, code: 'CUSTOMER-1', name: 'Customer One', accountTypeId: 4 });
  seedAccount({ orgId, code: 'SUPPLIER-1', name: 'Supplier One', accountTypeId: 3 });
  seedAccount({ orgId, code: 'OWNER-1', name: 'Owner One', accountTypeId: 7 });
  seedAccount({ orgId, code: 'WALKIN', name: 'Walk-in customer', accountTypeId: 4 });

  if (withInventory) {
    state.inventory = {
      products: [{ local_id: 1, org_id: orgId, quantity: 25 }],
      batches: [{ local_id: 1, org_id: orgId, quantity_remaining: 25 }],
      stockTransactions: [{ local_id: 1, org_id: orgId, quantity: 25 }],
    };
  }
}

/*
 * A realistic FY2026 book:
 *
 *   cash AFN 400 (credit)      treasury 500 in - 100 out
 *   cash USD 7,000 (credit)
 *   customer 5,000 AFN debit   (receivable)
 *   supplier 3,000 AFN credit  (payable)
 *   owner 100,000 AFN credit   (capital)
 *   SALES 100,000 credit / PURCHASE 50,000 debit / EXPENSES 20,000 debit
 *   -> net profit 30,000 AFN
 */
function seedRealisticYear(orgId = USER.org_id) {
  /* owner puts 100,000 in */
  seedJournal({
    orgId,
    date: '2026-01-05',
    debit: { code: 'TREASURY', amount: 100000 },
    credit: { code: 'OWNER-1', amount: 100000 },
  });

  /* USD owner capital */
  seedJournal({
    orgId,
    date: '2026-01-06',
    currency: 'USD',
    debit: { code: 'TREASURY', amount: 7000 },
    credit: { code: 'OWNER-1', amount: 7000 },
  });

  /* a sale on credit: customer owes 100,000 */
  seedJournal({
    orgId,
    date: '2026-02-01',
    debit: { code: 'CUSTOMER-1', amount: 100000 },
    credit: { code: 'SALES', amount: 100000 },
  });

  /* part of it is collected in cash */
  seedJournal({
    orgId,
    date: '2026-02-10',
    debit: { code: 'TREASURY', amount: 45000 },
    credit: { code: 'CUSTOMER-1', amount: 45000 },
  });

  /* a purchase on credit: supplier is owed 50,000 */
  seedJournal({
    orgId,
    date: '2026-03-01',
    debit: { code: 'PURCHASE', amount: 50000 },
    credit: { code: 'SUPPLIER-1', amount: 50000 },
  });

  /* operating expenses paid from cash */
  seedJournal({
    orgId,
    date: '2026-04-01',
    debit: { code: 'EXPENSES', amount: 20000 },
    credit: { code: 'TREASURY', amount: 20000 },
  });

  /*
   * Expected period-end balances under the application's convention
   * (credit - debit): cash 125,000 on the DEBIT side, the customer owes 55,000
   * (debit side), the supplier is owed 50,000 and the owner holds 100,000 of
   * credit-side capital. The 400 / 7,000 example of the brief is asserted
   * separately with its own book.
   */
  return {
    cash_afn: -125000,
    cash_usd: -7000,
    customer_afn: -55000,
    supplier_afn: 50000,
    owner_afn: 100000,
    owner_usd: 7000,
    profit_afn: 30000,
  };
}

/* ------------------------------- stubs ------------------------------- */

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
    failOpeningAt: null,
    failMarkClosed: false,
  };

  connection = createConnection();

  pool.getConnection = async () => connection;

  /* ----------------------------- fiscal years ----------------------------- */

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

  fiscalYearRepository.findAll = async (conn, { orgId }) =>
    state.years.filter(
      (year) =>
        Number(year.org_id) === Number(orgId) && Number(year.status ?? 1) === 1,
    );

  /*
   * Real overlap semantics, not an empty stub: the close refuses to CREATE a
   * receiving year whose range would overlap a year that already exists.
   * Only reached when no year starts on the required day.
   */
  fiscalYearRepository.findOverlapping = async (
    conn,
    {
      orgId,
      startDate,
      endDate,
      excludeLocalId = null,
    },
  ) =>
    state.years.filter(
      (year) =>
        Number(year.org_id) === Number(orgId) &&
        Number(year.status ?? 1) === 1 &&
        (excludeLocalId === null ||
          String(year.local_id) !== String(excludeLocalId)) &&
        String(year.start_date) <= String(endDate) &&
        String(year.end_date) >= String(startDate),
    );

  fiscalYearRepository.lockOrganizationYears = async (conn, { orgId }) => {
    state.calls.push('lockOrganizationYears');

    return state.years.filter(
      (year) => Number(year.org_id) === Number(orgId),
    );
  };

  /*
   * Mirrors fiscal-year.repository.create: insert, then read the row back.
   * Recorded in state.years so a later close (or a repeated one) sees the year
   * exactly as the database would.
   */
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

  /* -------------------------- closing repository -------------------------- */

  fiscalYearCloseRepository.lockOrganization = async (conn, { orgId }) => ({
    id: orgId,
  });

  fiscalYearCloseRepository.findClosingJournals = async (
    conn,
    { orgId, referenceType, referenceId },
  ) =>
    journalsForOrg(orgId).filter(
      (journal) =>
        journal.reference_type === referenceType &&
        String(journal.reference_id) === String(referenceId) &&
        Number(journal.status ?? 1) === 1,
    );

  fiscalYearCloseRepository.sumPeriodAccountActivity = async (conn, params) =>
    periodActivity(params);

  fiscalYearCloseRepository.findPreferredAccountTypeId = async () => 1;

  fiscalYearCloseRepository.markClosed = async (conn, { orgId, localId, userId }) => {
    state.calls.push('markClosed');

    if (state.failMarkClosed) return 0;

    const year = state.years.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    );

    if (!year || year.fiscal_status !== 'open') return 0;

    year.fiscal_status = 'closed';
    year.closed_at = '2027-01-05T09:30:00.000Z';
    year.closed_by = userId;

    return 1;
  };

  fiscalYearCloseRepository.markReopened = async (conn, { orgId, localId, userId }) => {
    state.calls.push('markReopened');

    const year = state.years.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    );

    if (!year || year.fiscal_status !== 'closed') return 0;

    year.fiscal_status = 'open';
    year.closed_at = null;
    year.closed_by = null;
    year.updated_by = userId;

    return 1;
  };

  /* ---------------------- opening-balance repository ---------------------- */

  fiscalYearOpeningRepository.findPeriodEndAccountBalances = async (
    conn,
    { orgId, endDate, excludedCodes = [] },
  ) => periodEndAccountBalances({ orgId, endDate, excludedCodes });

  fiscalYearOpeningRepository.findAll = async (
    conn,
    {
      orgId,
      fiscalYearId = null,
      sourceFiscalYearId = null,
      source = null,
      includeInactive = false,
    } = {},
  ) =>
    state.openings.filter(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        (fiscalYearId === null ||
          String(row.fiscal_year_id) === String(fiscalYearId)) &&
        (sourceFiscalYearId === null ||
          String(row.source_fiscal_year_id) === String(sourceFiscalYearId)) &&
        (source === null || row.source === source) &&
        (includeInactive || Number(row.status) === 1),
    );

  fiscalYearOpeningRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createOpening');

    if (state.failOpeningAt !== null) {
      const attempts = state.calls.filter((call) => call === 'createOpening').length;

      if (attempts === state.failOpeningAt) {
        throw new Error('opening balance insert failed');
      }
    }

    const currency = fiscalYearOpeningRepository.normalizeCurrency(data.currency);

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
      created_at: '2027-01-05T09:30:00.000Z',
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

  /* ------------------------------- accounts ------------------------------- */

  accountRepository.findByCode = async (conn, { orgId, code }) =>
    accountsForOrg(orgId).find((account) => String(account.code) === String(code)) ||
    null;

  accountRepository.findByLocalId = async (conn, { orgId, localId }) =>
    accountsForOrg(orgId).find(
      (account) => String(account.local_id) === String(localId),
    ) || null;

  accountRepository.create = async (conn, { orgId, localId, data }) => {
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
    const account = accountsForOrg(orgId).find(
      (row) => String(row.local_id) === String(localId),
    );

    if (!account) return null;

    Object.assign(account, data);

    return account;
  };

  /* ------------------------------- journals ------------------------------- */

  journalRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createJournal');

    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: 1,
      version: 1,
      created_at: '2027-01-05T09:30:00.000Z',
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  journalRepository.softDelete = async (conn, { orgId, localId }) => {
    state.calls.push('softDeleteJournal');

    const journal = journalsForOrg(orgId).find(
      (row) => String(row.local_id) === String(localId),
    );

    if (!journal) return null;

    journal.status = 0;

    return journal;
  };

  journalRepository.findAll = async (
    conn,
    { orgId, status = 1, accountId = null, dateFrom = null, dateTo = null } = {},
  ) => {
    state.calls.push('findJournals');

    const rows = journalsForOrg(orgId).filter((journal) => {
      if (Number(journal.status ?? 1) !== Number(status)) return false;

      if (
        accountId !== null &&
        String(journal.first_entry_account) !== String(accountId) &&
        String(journal.second_entry_account) !== String(accountId)
      ) {
        return false;
      }

      const date = String(journal.date || journal.created_at || '').slice(0, 10);

      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;

      return true;
    });

    return { data: rows, meta: { total: rows.length, page: 1, limit: rows.length } };
  };

  activityRepository.create = async (conn, entry) => {
    state.activities.push(entry);

    return { id: `ACT-${state.activities.length}` };
  };

  accountService.invalidateAccountAggregates = (orgId) => {
    state.invalidatedOrgs.push(orgId);
  };
}

beforeEach(installStubs);

/* ------------------------------- helpers ------------------------------- */

async function closeYear(year, user = USER) {
  return fiscalYearCloseService.closeFiscalYear({
    user,
    fiscalYearId: year.id,
    requestContext: REQUEST_CONTEXT,
  });
}

async function reopenYear(year, user = USER, reason = null) {
  return fiscalYearCloseService.reopenFiscalYear({
    user,
    fiscalYearId: year.id,
    reason,
    requestContext: REQUEST_CONTEXT,
  });
}

function activeOpeningsFor(
  fiscalYearId,
  orgId = USER.org_id,
) {
  return state.openings.filter(
    (row) =>
      Number(row.org_id) === Number(orgId) &&
      Number(row.status) === 1 &&
      String(row.fiscal_year_id) === String(fiscalYearId),
  );
}

function openingFor(
  accountCode,
  { orgId = USER.org_id, fiscalYearId, currency = null, sourceFiscalYearId } = {},
) {
  const account = accountByCode(accountCode, orgId);

  return (
    state.openings.find(
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
    ) || null
  );
}

function closingJournals(orgId = USER.org_id, fiscalYearId) {
  return journalsForOrg(orgId).filter(
    (journal) =>
      journal.reference_type ===
        fiscalYearCloseService.CLOSING_REFERENCE_TYPE &&
      (fiscalYearId === undefined ||
        String(journal.reference_id) === String(fiscalYearId)),
  );
}

/* ====================================================================== */
/* Roll-forward: which accounts, which currencies                          */
/* ====================================================================== */

test("the brief's cash example rolls AFN 400 and USD 7,000 as separate openings", async () => {
  seedContext();
  const year = seedYear();

  /* cash in 400 AFN */
  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  /* cash in 7,000 USD */
  seedJournal({
    date: '2026-02-02',
    currency: 'USD',
    debit: { code: 'TREASURY', amount: 7000 },
    credit: { code: 'OWNER-1', amount: 7000 },
  });

  const result = await closeYear(year);
  const next = result.next_fiscal_year;

  assert.equal(next.name, FY_2027.name);

  const afn = openingFor('TREASURY', { fiscalYearId: next.id, currency: 'AFN' });
  const usd = openingFor('TREASURY', { fiscalYearId: next.id, currency: 'USD' });

  /*
   * Sign convention of the whole application
   * (account.repository.findBalances): balance = credit - debit. Cash on hand
   * is therefore a DEBIT-side balance and carries a negative signed amount.
   * `balance_side` states the same fact readably; the magnitude is what the
   * business calls "the closing balance".
   */
  assert.equal(afn.opening_balance, -400);
  assert.equal(afn.balance_side, 'debit');
  assert.equal(Math.abs(afn.opening_balance), 400);

  assert.equal(usd.opening_balance, -7000);
  assert.equal(usd.balance_side, 'debit');
  assert.equal(Math.abs(usd.opening_balance), 7000);
});

test('currencies are never summed into one opening balance', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  seedJournal({
    date: '2026-02-02',
    currency: 'USD',
    debit: { code: 'TREASURY', amount: 7000 },
    credit: { code: 'OWNER-1', amount: 7000 },
  });

  const result = await closeYear(year);

  const treasuryRows = result.opening_balances.filter(
    (row) => row.account_code === 'TREASURY',
  );

  assert.equal(treasuryRows.length, 2);
  assert.deepEqual(
    treasuryRows
      .map((row) => [row.currency, Math.abs(row.opening_balance)])
      .sort(),
    [
      ['AFN', 400],
      ['USD', 7000],
    ].sort(),
  );

  /* and never a single combined 7,400 row */
  assert.equal(
    result.opening_balances.some((row) => Math.abs(row.opening_balance) === 7400),
    false,
  );
});

test('customer receivable, supplier payable and owner capital all roll forward', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const result = await closeYear(year);
  const next = result.next_fiscal_year;

  assert.equal(
    openingFor('CUSTOMER-1', { fiscalYearId: next.id }).opening_balance,
    -55000,
    'a receivable is a DEBIT balance and stays negative',
  );
  assert.equal(
    openingFor('CUSTOMER-1', { fiscalYearId: next.id }).balance_side,
    'debit',
  );

  assert.equal(
    openingFor('SUPPLIER-1', { fiscalYearId: next.id }).opening_balance,
    50000,
  );
  assert.equal(
    openingFor('SUPPLIER-1', { fiscalYearId: next.id }).balance_side,
    'credit',
  );

  assert.equal(
    openingFor('OWNER-1', { fiscalYearId: next.id, currency: 'AFN' })
      .opening_balance,
    100000,
  );
  assert.equal(
    openingFor('OWNER-1', { fiscalYearId: next.id, currency: 'USD' })
      .opening_balance,
    7000,
  );
});

test('RETAINED rolls forward with the year result while the P&L accounts roll nothing', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const result = await closeYear(year);
  const next = result.next_fiscal_year;

  const retained = openingFor(RETAINED_ACCOUNT_CODE, { fiscalYearId: next.id });

  assert.equal(retained.opening_balance, 30000);
  assert.equal(retained.balance_side, 'credit');

  for (const code of PNL_ACCOUNT_CODES) {
    assert.equal(
      openingFor(code, { fiscalYearId: next.id }),
      null,
      `${code} must start the new year at zero`,
    );
  }
});

test('no opening balance row is created for any P&L code, per currency', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'RECEIVABLE', amount: 1000 },
    credit: { code: 'SALES', amount: 1000 },
  });

  seedJournal({
    date: '2026-02-02',
    currency: 'USD',
    debit: { code: 'PURCHASE', amount: 500 },
    credit: { code: 'PAYABLE', amount: 500 },
  });

  const result = await closeYear(year);

  const codes = result.opening_balances.map((row) => row.account_code);

  for (const code of PNL_ACCOUNT_CODES) {
    assert.equal(codes.includes(code), false);
  }
});

test('a zero balance never becomes an opening row', async () => {
  seedContext();
  const year = seedYear();

  /* customer owes 5,000 and pays it back inside the same year */
  seedJournal({
    date: '2026-02-01',
    debit: { code: 'CUSTOMER-1', amount: 5000 },
    credit: { code: 'SALES', amount: 5000 },
  });

  seedJournal({
    date: '2026-02-02',
    debit: { code: 'TREASURY', amount: 5000 },
    credit: { code: 'CUSTOMER-1', amount: 5000 },
  });

  const result = await closeYear(year);

  assert.equal(
    result.opening_balances.some((row) => row.account_code === 'CUSTOMER-1'),
    false,
  );
  assert.equal(
    result.opening_balances.every((row) => Number(row.opening_balance) !== 0),
    true,
  );
});

test('the opening balance is the balance AS OF the year end, inclusive', async () => {
  seedContext();
  const year = seedYear();

  seedJournal({
    date: '2026-12-31',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  /* the day after the year end must NOT be carried into FY2027 */
  seedJournal({
    date: '2027-01-01',
    debit: { code: 'TREASURY', amount: 999 },
    credit: { code: 'OWNER-1', amount: 999 },
  });

  const result = await closeYear(year);

  assert.equal(
    Math.abs(
      openingFor('TREASURY', { fiscalYearId: result.next_fiscal_year.id })
        .opening_balance,
    ),
    400,
  );

  assert.equal(
    openingFor('OWNER-1', { fiscalYearId: result.next_fiscal_year.id })
      .opening_balance,
    400,
    'owner capital is a credit balance and is unaffected by the day after the year end',
  );
});

test('a soft-deleted account does not roll forward', async () => {
  seedContext();
  const year = seedYear();

  const account = accountByCode('CUSTOMER-1');

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'CUSTOMER-1', amount: 5000 },
    credit: { code: 'SALES', amount: 5000 },
  });

  account.status = 0;

  const result = await closeYear(year);

  assert.equal(
    result.opening_balances.some((row) => row.account_code === 'CUSTOMER-1'),
    false,
  );
});

test('the roll-forward is organization-scoped', async () => {
  seedContext();
  seedContext({ orgId: OTHER_ORG_USER.org_id, withInventory: false });

  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  seedJournal({
    orgId: OTHER_ORG_USER.org_id,
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 7777 },
    credit: { code: 'OWNER-1', amount: 7777 },
  });

  await closeYear(year);

  assert.equal(state.openings.length > 0, true);
  assert.equal(
    state.openings.every((row) => Number(row.org_id) === USER.org_id),
    true,
  );
});

/* ====================================================================== */
/* Next fiscal year: created automatically from the closed year's end       */
/* ====================================================================== */

test('closing creates the next fiscal year automatically from the closed year end date', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  const result = await closeYear(year);

  const created = state.years.find(
    (row) => String(row.start_date) === '2027-01-01',
  );

  assert.ok(created, 'the successor fiscal year must exist after the close');
  assert.equal(created.name, 'FY 2027');
  assert.equal(created.start_date, '2027-01-01');
  assert.equal(created.end_date, '2027-12-31');
  assert.equal(created.fiscal_status, 'open');
  assert.equal(Number(created.status), 1);
  assert.equal(created.created_by, USER.local_id);

  /* the close reports the year it configured and rolls into it */
  assert.equal(result.next_fiscal_year_created, true);
  assert.equal(result.next_fiscal_year.id, created.local_id);
  assert.equal(result.next_fiscal_year_range.start_date, '2027-01-01');
  assert.equal(result.next_fiscal_year_range.end_date, '2027-12-31');

  assert.ok(result.opening_balances_created > 0);
  assert.equal(
    activeOpeningsFor(created.local_id).length,
    result.opening_balances_created,
  );

  /* and the closed year really is closed */
  assert.equal(year.fiscal_status, 'closed');
  assert.equal(connection.committed, true);

  /* creating the successor year is auditable, not a side effect */
  assert.ok(
    state.activities.some(
      (entry) =>
        entry.tableName === 'fiscal_years' &&
        entry.action === 'create' &&
        /automatically/.test(entry.description),
    ),
    'the automatic fiscal-year creation must be written to the activity log',
  );
});

test('a non-January fiscal year keeps its own boundaries in the year the close creates', async () => {
  seedContext({ withYears: false });

  /* 2026-09-10 → 2027-06-10 (the example in the brief) */
  const year = seedYear({
    name: 'FY 2026-2027',
    start: '2026-09-10',
    end: '2027-06-10',
  });

  seedJournal({
    date: '2026-10-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  await closeYear(year);

  const created = state.years.find(
    (row) => String(row.start_date) === '2027-06-11',
  );

  assert.ok(created);
  assert.equal(created.end_date, '2028-06-10');
  assert.equal(created.name, 'FY 2027-2028');
});

test('closing reuses an existing next fiscal year instead of creating a second one', async () => {
  seedContext();
  const year = seedYear();

  const next = state.years.find(
    (row) => String(row.start_date) === FY_2027.start,
  );

  const result = await closeYear(year);

  assert.equal(result.next_fiscal_year_created, false);
  assert.equal(result.next_fiscal_year.id, next.local_id);
  assert.equal(
    state.years.filter((row) => String(row.start_date) === FY_2027.start)
      .length,
    1,
    'the close must never duplicate an existing fiscal year',
  );
});

test('a year that already covers the required start date blocks the close with NEXT_FISCAL_YEAR_CONFLICT', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  /*
   * FY2028 covers 2027-01-01 (the required start date) but does not START on
   * it, so neither "reuse it" nor "create the next year" is possible. That is
   * a configuration problem: reported, never guessed around.
   */
  seedYear({ name: FY_2028.name, start: '2027-01-15', end: FY_2028.end });

  const yearsBefore = state.years.length;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'NEXT_FISCAL_YEAR_CONFLICT');
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.required_next_start_date, '2027-01-01');
      assert.equal(
        error.details.conflicting_fiscal_year_name,
        FY_2028.name,
      );

      return true;
    },
  );

  /* refused before anything was written, and no year was invented */
  assert.equal(year.fiscal_status, 'open');
  assert.equal(state.years.length, yearsBefore);
  assert.equal(closingJournals().length, 0);
  assert.equal(state.openings.length, 0);
  assert.equal(connection.rolledBack, true);
});

test('a failed close rolls the automatically created fiscal year back too', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  state.failOpeningAt = 1;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.match(error.message, /opening balance insert failed/);

      return true;
    },
  );

  assert.equal(
    state.years.some((row) => String(row.start_date) === '2027-01-01'),
    false,
    'a rolled-back close must not leave a fiscal year behind',
  );
  assert.equal(year.fiscal_status, 'open');
  assert.equal(closingJournals().length, 0);
});

test('closing twice does not create a second next fiscal year', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  await closeYear(year);

  const yearsAfterFirstClose = state.years.length;
  const openingsAfterFirstClose = state.openings.length;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_ALREADY_CLOSED');

      return true;
    },
  );

  assert.equal(state.years.length, yearsAfterFirstClose);
  assert.equal(state.openings.length, openingsAfterFirstClose);
});

test('reopening and closing again reuses the year the close created', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  const first = await closeYear(year);
  const created = first.next_fiscal_year;

  await reopenYear(year);

  /* reopen withdraws the balances but keeps the fiscal year itself */
  assert.equal(
    state.years.filter((row) => String(row.start_date) === '2027-01-01').length,
    1,
  );
  assert.equal(activeOpeningsFor(created.id).length, 0);

  const second = await closeYear(year);

  assert.equal(second.next_fiscal_year_created, false);
  assert.equal(second.next_fiscal_year.id, created.id);
  assert.equal(
    state.years.filter((row) => String(row.start_date) === '2027-01-01').length,
    1,
  );
  assert.equal(activeOpeningsFor(created.id).length > 0, true);
});

test('the next fiscal year range is derived from the closed year end date', () => {
  const cases = [
    ['2026-12-31', '2027-01-01', '2027-12-31'],
    ['2026-09-18', '2026-09-19', '2027-09-18'],
    ['2027-06-10', '2027-06-11', '2028-06-10'],
    /* a leap-day end clamps to the last day of the target month */
    ['2028-02-29', '2028-03-01', '2029-02-28'],
  ];

  for (const [endDate, expectedStart, expectedEnd] of cases) {
    const range = fiscalYearCloseService.nextFiscalYearRange(endDate);

    assert.equal(range.start_date, expectedStart);
    assert.equal(range.end_date, expectedEnd);
  }
});

test('a closed next year is refused with NEXT_FISCAL_YEAR_NOT_OPEN', async () => {
  seedContext();
  const year = seedYear();

  const next = state.years.find(
    (row) => String(row.start_date) === FY_2027.start,
  );

  next.fiscal_status = 'closed';

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'NEXT_FISCAL_YEAR_NOT_OPEN');

      return true;
    },
  );

  assert.equal(year.fiscal_status, 'open');
  assert.equal(state.openings.length, 0);
});

test('the preview reports the missing next year as "will be created" and writes nothing', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedJournal({
    date: '2026-02-01',
    debit: { code: 'TREASURY', amount: 400 },
    credit: { code: 'OWNER-1', amount: 400 },
  });

  const yearsBefore = state.years.length;

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.read_only, true);

  /* a missing successor no longer blocks the close: it will be created */
  assert.equal(preview.roll_forward_ready, true);
  assert.equal(preview.roll_forward_blocker, null);
  assert.equal(preview.next_fiscal_year, null);
  assert.equal(preview.next_fiscal_year_will_be_created, true);
  assert.equal(preview.proposed_next_fiscal_year.name, 'FY 2027');
  assert.equal(preview.proposed_next_fiscal_year.start_date, '2027-01-01');
  assert.equal(preview.proposed_next_fiscal_year.end_date, '2027-12-31');
  assert.equal(preview.required_next_start_date, '2027-01-01');
  assert.equal(preview.required_next_end_date, '2027-12-31');
  assert.equal(preview.proposed_opening_balance_count > 0, true);

  /* read-only means read-only: nothing in the database changed */
  assert.equal(state.years.length, yearsBefore);
  assert.equal(state.openings.length, 0);
  assert.equal(year.fiscal_status, 'open');
});

test('the preview never claims it will create a year when one already exists', async () => {
  seedContext();
  const year = seedYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.next_fiscal_year_will_be_created, false);
  assert.equal(preview.proposed_next_fiscal_year, null);
  assert.equal(preview.roll_forward_ready, true);
  assert.equal(preview.roll_forward_blocker, null);
  assert.equal(preview.next_fiscal_year.start_date, FY_2027.start);
});

test('the preview reports a conflicting fiscal year as a blocker', async () => {
  seedContext({ withYears: false });
  const year = seedYear();

  seedYear({ name: FY_2028.name, start: '2027-01-15', end: FY_2028.end });

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  assert.equal(preview.roll_forward_ready, false);
  assert.equal(preview.roll_forward_blocker, 'NEXT_FISCAL_YEAR_CONFLICT');
  assert.equal(preview.next_fiscal_year_will_be_created, false);
  assert.equal(
    preview.receiving_fiscal_year_conflict.name,
    FY_2028.name,
  );
  assert.equal(state.years.length, 2);
});

test('the preview proposes the same openings the close writes, including the year result', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const preview = await fiscalYearCloseService.previewFiscalYearClose({
    user: USER,
    fiscalYearId: year.id,
  });

  const proposed = preview.proposed_opening_balances.find(
    (row) => row.account_code === RETAINED_ACCOUNT_CODE,
  );

  assert.ok(proposed, 'the preview must show the profit reaching RETAINED');
  assert.equal(proposed.opening_balance, 30000);

  assert.equal(preview.roll_forward_ready, true);

  const result = await closeYear(year);

  for (const balance of preview.proposed_opening_balances) {
    const written = openingFor(balance.account_code, {
      fiscalYearId: result.next_fiscal_year.id,
      currency: balance.currency,
    });

    assert.ok(written, `missing written opening for ${balance.account_code}`);
    assert.equal(
      written.opening_balance,
      balance.opening_balance,
      `${balance.account_code} ${balance.currency} differs between preview and close`,
    );
  }
});

/* ====================================================================== */
/* Atomicity                                                               */
/* ====================================================================== */

test('a failed opening-balance insert rolls the whole close back', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  state.failOpeningAt = 2;

  await assert.rejects(
    () => closeYear(year),
    /opening balance insert failed/,
  );

  assert.equal(connection.rolledBack, true);
  assert.equal(year.fiscal_status, 'open');
  assert.equal(closingJournals().length, 0);
  assert.equal(state.openings.length, 0);
  assert.equal(
    state.accounts.some((account) => account.code === RETAINED_ACCOUNT_CODE),
    false,
  );
  assert.deepEqual(state.inventory, {
    products: [{ local_id: 1, org_id: USER.org_id, quantity: 25 }],
    batches: [{ local_id: 1, org_id: USER.org_id, quantity_remaining: 25 }],
    stockTransactions: [{ local_id: 1, org_id: USER.org_id, quantity: 25 }],
  });
});

test('a close that loses the status race posts nothing and opens nothing', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  state.failMarkClosed = true;

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_ALREADY_CLOSED');

      return true;
    },
  );

  assert.equal(state.openings.length, 0);
  assert.equal(closingJournals().length, 0);
});

test('closing twice never duplicates the openings', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const first = await closeYear(year);
  const count = first.opening_balances_created;

  assert.equal(count > 0, true);

  await assert.rejects(
    () => closeYear(year),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_ALREADY_CLOSED');

      return true;
    },
  );

  assert.equal(state.openings.length, count);
  assert.equal(
    state.openings.every((row) => Number(row.status) === 1),
    true,
  );
});

test('the close does not post any opening journal (the snapshots are not journals)', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const before = state.journals.length;
  const result = await closeYear(year);

  const journalsAfter = state.journals.slice(before);

  assert.equal(
    journalsAfter.every(
      (journal) =>
        journal.reference_type ===
        fiscalYearCloseService.CLOSING_REFERENCE_TYPE,
    ),
    true,
    'only the balanced closing journals may be posted',
  );

  assert.equal(result.next_year_opening_journals_created, 0);
});

test('closing never mutates inventory or lifetime account balances', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const balancesBefore = new Map(
    state.accounts.map((account) => [
      String(account.local_id),
      account.balance,
    ]),
  );
  const inventoryBefore = structuredClone(state.inventory);

  const result = await closeYear(year);

  for (const account of state.accounts) {
    if (String(account.code) === RETAINED_ACCOUNT_CODE) continue;

    assert.equal(
      account.balance,
      balancesBefore.get(String(account.local_id)),
      'accounts.balance is never touched by the roll-forward',
    );
  }

  const retained = accountsForOrg(USER.org_id).find(
    (account) => String(account.code) === RETAINED_ACCOUNT_CODE,
  );

  assert.equal(
    retained.balance,
    0,
    'the snapshot is not written into accounts.balance: the historical journals already hold the money',
  );
  assert.deepEqual(state.inventory, inventoryBefore);
  assert.equal(result.opening_balances_created > 0, true);
});

/* ====================================================================== */
/* Reopen                                                                  */
/* ====================================================================== */

test('reopening reverses the closing journals, deactivates the openings and leaves the year open', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const closed = await closeYear(year);
  const nextId = closed.next_fiscal_year.id;

  assert.equal(activeOpeningsFor(nextId).length, closed.opening_balances_created);
  assert.equal(closingJournals().length > 0, true);

  const reopened = await reopenYear(year, USER, 'wrong cost centre');

  assert.equal(reopened.status, 'open');
  assert.equal(reopened.closed_at, null);
  assert.equal(year.fiscal_status, 'open');
  assert.equal(year.closed_at, null);
  assert.equal(year.closed_by, null);

  /* closing journals reversed, never deleted */
  assert.equal(closingJournals().length, closed.closing_journals_created);
  assert.equal(
    closingJournals().every((journal) => Number(journal.status) === 0),
    true,
  );
  assert.equal(reopened.closing_journals_reversed, closed.closing_journals_created);

  /* opening balances deactivated, never deleted */
  assert.equal(activeOpeningsFor(nextId).length, 0);
  assert.equal(
    state.openings.filter((row) => String(row.fiscal_year_id) === String(nextId))
      .length,
    closed.opening_balances_created,
  );
  assert.equal(reopened.opening_balances_deactivated, closed.opening_balances_created);
  assert.equal(reopened.historical_data_preserved, true);
});

test('reopening is audited end to end', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  await closeYear(year);
  await reopenYear(year, USER, 'restatement');

  const reopenLog = state.activities.find(
    (entry) => entry.action === 'reopen' && entry.tableName === 'fiscal_years',
  );

  assert.ok(reopenLog);
  assert.equal(reopenLog.oldValues.fiscal_status, 'closed');
  assert.equal(reopenLog.newValues.fiscal_status, 'open');
  assert.match(reopenLog.description, /restatement/);

  assert.equal(
    state.activities.some(
      (entry) => entry.tableName === 'journals' && entry.newValues.status === 0,
    ),
    true,
    'every reversed closing journal is logged',
  );

  assert.equal(
    state.activities.some(
      (entry) =>
        entry.tableName === 'fiscal_year_opening_balances' &&
        entry.newValues.status === 0,
    ),
    true,
    'deactivating the openings is logged',
  );
});

test('reopening refreshes the cached account aggregates', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  await closeYear(year);
  state.invalidatedOrgs.length = 0;

  await reopenYear(year);

  assert.deepEqual(state.invalidatedOrgs, [USER.org_id]);
});

test('reopening an OPEN year is refused', async () => {
  seedContext();
  const year = seedYear();

  await assert.rejects(
    () => reopenYear(year),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_NOT_CLOSED');
      assert.equal(error.statusCode, 409);

      return true;
    },
  );

  assert.equal(state.openings.length, 0);
});

test('reopening is refused while the receiving year is closed', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const closed = await closeYear(year);
  const next = state.years.find(
    (row) => String(row.local_id) === String(closed.next_fiscal_year.id),
  );

  next.fiscal_status = 'closed';

  await assert.rejects(
    () => reopenYear(year),
    (error) => {
      assert.equal(error.code, 'RECEIVING_FISCAL_YEAR_CLOSED');

      return true;
    },
  );

  assert.equal(year.fiscal_status, 'closed');
  assert.equal(activeOpeningsFor(next.local_id).length > 0, true);
});

test('re-close after a reopen writes exactly one fresh generation of openings', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const first = await closeYear(year);
  const nextId = first.next_fiscal_year.id;

  await reopenYear(year);
  const second = await closeYear(year);

  assert.equal(second.next_fiscal_year.id, nextId);
  assert.equal(
    activeOpeningsFor(nextId).length,
    second.opening_balances_created,
  );

  /* two generations exist, only one is active */
  const treasuryRows = state.openings.filter(
    (row) =>
      String(row.fiscal_year_id) === String(nextId) &&
      row.account_code === 'TREASURY' &&
      fiscalYearOpeningRepository.normalizeCurrency(row.currency) === 'AFN',
  );

  assert.equal(treasuryRows.length, 2);
  assert.equal(
    treasuryRows.filter((row) => Number(row.status) === 1).length,
    1,
  );
  assert.equal(
    treasuryRows.filter((row) => Number(row.status) === 0).length,
    1,
  );

  /* active snapshots are never duplicated in the summary */
  const ids = first.opening_balances.map((row) => row.local_id);

  assert.equal(
    second.opening_balances.some((row) => ids.includes(row.local_id)),
    false,
    'the second close must not reuse the first generation',
  );
});

test('reopening does not delete a single historical row', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const journalsBefore = state.journals.length;

  await closeYear(year);
  await reopenYear(year);

  assert.equal(
    state.journals.length >= journalsBefore + 1,
    true,
    'closing journals still exist after the reopen',
  );
  assert.equal(
    state.journals.every((journal) => typeof journal.local_id !== 'undefined'),
    true,
  );
});

/* ====================================================================== */
/* Archive reads: opening balances + account statement                     */
/* ====================================================================== */

test('the opening-balance audit lists received and generated openings with both years named', async () => {
  seedContext();
  const fiscal2026 = seedYear();
  seedRealisticYear();

  const closed = await closeYear(fiscal2026);

  const generated = await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: fiscal2026.id,
  });

  assert.equal(generated.read_only, true);
  assert.equal(generated.generated_count, closed.opening_balances_created);

  const treasury = generated.generated.find(
    (row) => row.account_code === 'TREASURY' && row.currency === 'AFN',
  );

  assert.equal(treasury.source_fiscal_year_id, fiscal2026.id);
  assert.equal(treasury.source_fiscal_year_name, FY_2026.name);
  assert.equal(treasury.fiscal_year_id, closed.next_fiscal_year.id);
  assert.equal(treasury.fiscal_year_name, FY_2027.name);
  assert.equal(treasury.opening_balance, -125000);
  assert.equal(treasury.balance_side, 'debit');

  const received = await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: closed.next_fiscal_year.id,
  });

  assert.equal(received.received_count, closed.opening_balances_created);
  assert.equal(
    received.received.every(
      (row) => row.source_fiscal_year_name === FY_2026.name,
    ),
    true,
  );
  assert.equal(
    received.received.every((row) => row.status === 1),
    true,
  );
});

test('the audit view can include the generations voided by a reopen', async () => {
  seedContext();
  const year = seedYear();
  seedRealisticYear();

  const closed = await closeYear(year);

  await reopenYear(year);

  const active = await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: closed.next_fiscal_year.id,
  });

  assert.equal(active.received_count, 0);

  const all = await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: closed.next_fiscal_year.id,
    includeInactive: true,
  });

  assert.equal(all.received_count, closed.opening_balances_created);
  assert.equal(
    all.received.every((row) => row.status === 0),
    true,
  );
});

test('the statement is opening + this year only, so historical movement is never counted twice', async () => {
  seedContext();
  const fiscal2026 = seedYear();
  seedRealisticYear();

  const closed = await closeYear(fiscal2026);
  const fiscal2027 = seedYear({
    name: FY_2027.name,
    start: FY_2027.start,
    end: FY_2027.end,
  });

  /* FY2027: one receipt and one payment */
  seedJournal({
    date: '2027-02-01',
    debit: { code: 'TREASURY', amount: 100 },
    credit: { code: 'CUSTOMER-1', amount: 100 },
  });

  seedJournal({
    date: '2027-03-01',
    debit: { code: 'EXPENSES', amount: 50 },
    credit: { code: 'TREASURY', amount: 50 },
  });

  const treasury = accountByCode('TREASURY');

  const statement = await fiscalYearArchiveService.getAccountStatement({
    user: USER,
    fiscalYearId: fiscal2027.id,
    accountId: treasury.local_id,
    currency: 'AFN',
  });

  const line = statement.lines.find((row) => row.currency === 'AFN');

  /*
   * Cash opening (debit side) 125,000, then +100 in and -50 out inside FY2027
   * -> 125,050 on hand. NOT "lifetime movement + opening", which would report
   * 250,050 and double-count the closed year.
   */
  assert.equal(line.opening_balance, -125000);
  assert.equal(line.credit, 50);
  assert.equal(line.debit, 100);
  assert.equal(line.movement, -50);
  assert.equal(line.closing_balance, -125050);
  assert.equal(Math.abs(line.closing_balance), 125050);
  assert.notEqual(Math.abs(line.closing_balance), 250050);

  assert.equal(statement.opening_balance, -125000);

  /* exactly one opening row, and only this year's journals */
  assert.equal(statement.opening_rows.length, 1);
  assert.equal(
    statement.entries.every((journal) =>
      String(journal.date).startsWith('2027'),
    ),
    true,
  );
  assert.equal(closed.next_fiscal_year.id, fiscal2027.id);
});

test('the statement keeps currencies separate', async () => {
  seedContext();
  const fiscal2026 = seedYear();
  seedRealisticYear();

  await closeYear(fiscal2026);

  const fiscal2027 = seedYear({
    name: FY_2027.name,
    start: FY_2027.start,
    end: FY_2027.end,
  });

  seedJournal({
    date: '2027-02-01',
    currency: 'USD',
    debit: { code: 'TREASURY', amount: 300 },
    credit: { code: 'CUSTOMER-1', amount: 300 },
  });

  const treasury = accountByCode('TREASURY');

  const statement = await fiscalYearArchiveService.getAccountStatement({
    user: USER,
    fiscalYearId: fiscal2027.id,
    accountId: treasury.local_id,
  });

  const afn = statement.lines.find((row) => row.currency === 'AFN');
  const usd = statement.lines.find((row) => row.currency === 'USD');

  assert.equal(afn.opening_balance, -125000);
  assert.equal(afn.closing_balance, -125000);
  assert.equal(afn.movement, 0);

  assert.equal(usd.opening_balance, -7000);
  assert.equal(usd.debit, 300);
  assert.equal(usd.movement, -300);
  assert.equal(usd.closing_balance, -7300);
});

test('the statement only counts the entry positions that reference the account', async () => {
  seedContext();
  const fiscal2026 = seedYear();
  seedRealisticYear();

  await closeYear(fiscal2026);

  const treasury = accountByCode('TREASURY');

  const statement = await fiscalYearArchiveService.getAccountStatement({
    user: USER,
    fiscalYearId: fiscal2026.id,
    accountId: treasury.local_id,
    currency: 'AFN',
  });

  const line = statement.lines.find((row) => row.currency === 'AFN');

  /*
   * FY2026 cash: 100,000 in, 45,000 in, 20,000 out. Only the treasury side of
   * each journal counts — the counter account's amount must never leak into
   * this account's movement.
   */
  assert.equal(line.debit, 145000);
  assert.equal(line.credit, 20000);
  assert.equal(line.movement, -125000);
  assert.equal(line.opening_balance, 0);
  assert.equal(line.closing_balance, -125000);
});

test('the statement cannot reach another organization account', async () => {
  seedContext();
  seedContext({ orgId: OTHER_ORG_USER.org_id, withInventory: false });

  const fiscal2026 = seedYear();
  const otherAccount = accountByCode('TREASURY', OTHER_ORG_USER.org_id);

  await assert.rejects(
    () =>
      fiscalYearArchiveService.getAccountStatement({
        user: USER,
        fiscalYearId: fiscal2026.id,
        accountId: otherAccount.local_id,
      }),
    (error) => {
      assert.equal(error.code, 'ACCOUNT_NOT_FOUND');

      return true;
    },
  );
});

test('the archive reads refuse another organization fiscal year', async () => {
  seedContext();
  seedContext({ orgId: OTHER_ORG_USER.org_id, withInventory: false });

  const fiscal2026 = seedYear();

  await assert.rejects(
    () =>
      fiscalYearArchiveService.listOpeningBalances({
        user: OTHER_ORG_USER,
        fiscalYearId: fiscal2026.id,
      }),
    (error) => {
      assert.equal(error.code, 'FISCAL_YEAR_NOT_FOUND');

      return true;
    },
  );
});

test('a first fiscal year starts with no opening balance at all', async () => {
  seedContext({ withYears: false });
  const fiscal2026 = seedYear();

  const report = await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: fiscal2026.id,
  });

  assert.equal(report.received_count, 0);
  assert.equal(report.generated_count, 0);
  assert.deepEqual(report.received, []);
});

test('the archive model never resets inventory or party balances', async () => {
  seedContext();
  const fiscal2026 = seedYear();
  seedRealisticYear();

  const before = {
    inventory: structuredClone(state.inventory),
    customer: accountByCode('CUSTOMER-1').balance,
    supplier: accountByCode('SUPPLIER-1').balance,
  };

  const closed = await closeYear(fiscal2026);

  await fiscalYearArchiveService.listOpeningBalances({
    user: USER,
    fiscalYearId: fiscal2026.id,
  });

  await fiscalYearArchiveService.getAccountStatement({
    user: USER,
    fiscalYearId: fiscal2026.id,
    accountId: accountByCode('CUSTOMER-1').local_id,
  });

  void closed;

  assert.deepEqual(state.inventory, before.inventory);
  assert.equal(accountByCode('CUSTOMER-1').balance, before.customer);
  assert.equal(accountByCode('SUPPLIER-1').balance, before.supplier);
});

/* ====================================================================== */
/* Schema + API shape guards                                               */
/* ====================================================================== */

test('the migration only creates the snapshot table and inserts nothing', () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'migrations',
      '20260920_fiscal_year_opening_balances.sql',
    ),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE fiscal_year_opening_balances/);
  assert.match(sql, /UNIQUE KEY uq_fy_opening_active/);

  /* idempotency relies on NULLs being ignored by unique indexes */
  assert.match(sql, /GENERATED ALWAYS AS/);

  /*
   * No historical table is altered and nothing is seeded.
   *
   * The check is per STATEMENT LINE rather than a regex over the whole file:
   * a whitespace-class regex would happily match across a newline and flag a
   * keyword that only appears in the surrounding prose.
   */
  const statements = sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('--'));

  for (const keyword of ['ALTER TABLE', 'UPDATE', 'DELETE', 'DROP', 'INSERT INTO']) {
    assert.equal(
      statements.some((line) => {
        const upper = line.toUpperCase();

        /*
         * A word, not a prefix: `updated_at` and `ON UPDATE ...` must not be
         * mistaken for a bare UPDATE statement.
         */
        return upper === keyword || upper.startsWith(`${keyword} `);
      }),
      false,
      `the migration must not contain ${keyword}`,
    );
  }
  assert.match(sql, /INTENTIONALLY NO DATA INSERTS/);
});

test('the snapshot repository is the only place that computes a closing balance', () => {
  const repositorySource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'repositories',
      'fiscal-year-opening.repository.js',
    ),
    'utf8',
  );

  assert.match(repositorySource, /DATE_ADD\(\?, INTERVAL 1 DAY\)/);
  assert.match(repositorySource, /o\.status = 1/);

  const archiveSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'fiscal-year-archive.service.js'),
    'utf8',
  );

  /* read-only: the archive service must not write anything at all */
  for (const forbidden of [
    'BEGIN',
    'beginTransaction',
    '.create(',
    'connection.execute',
    'UPDATE ',
    'DELETE ',
  ]) {
    assert.equal(
      archiveSource.includes(forbidden),
      false,
      `the archive service must not contain ${forbidden}`,
    );
  }
});

test('the archive endpoints exist and expose no way to edit a generated opening', () => {
  const router = require('../routes/v2/fiscal-year.routes');

  const routes = router.stack
    .filter((layer) => layer.route)
    .map(
      (layer) =>
        `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`,
    );

  assert.ok(routes.includes('GET /:id/opening-balances'));
  assert.ok(routes.includes('GET /:id/accounts/:accountId/statement'));
  assert.ok(routes.includes('POST /:id/reopen'));

  /*
   * No route can EDIT a generated opening balance: the archive is read-only,
   * so the only write routes are create / update-metadata / close / reopen.
   */
  const writeRoutes = routes.filter((route) => !route.startsWith('GET'));

  assert.deepEqual(writeRoutes.sort(), [
    'POST /',
    'POST /:id/close',
    'POST /:id/reopen',
    'PUT /:id',
  ]);

  assert.equal(
    routes.some((route) => /opening-balances|statement/.test(route) && !route.startsWith('GET')),
    false,
  );
});

test('the operational screens default to the current fiscal year', () => {
  const helper = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'frontend',
      'src',
      'utils',
      'currentFiscalYear.js',
    ),
    'utf8',
  );

  assert.match(helper, /fiscalYearApi/);
  assert.match(helper, /getCurrent/);
  assert.match(helper, /start_date/);
  assert.match(helper, /end_date/);

  /*
   * Every operational screen that lists documents must ask for the current
   * fiscal year's range by default. A null range (no fiscal year configured)
   * keeps the previous lifetime behaviour, which is the backward-compatible
   * path the brief requires.
   */
  for (const page of [
    ['pages', 'Sales.svelte'],
    ['pages', 'Purchases.svelte'],
    ['pages', 'journals', 'JournalsReport.svelte'],
    ['pages', 'accounts', 'AccountReport.svelte'],
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', ...page),
      'utf8',
    );

    assert.match(
      source,
      /currentFiscalYearRange|applyCurrentFiscalYearRange/,
      `${page.join('/')} does not scope itself to the current fiscal year`,
    );
  }
});
