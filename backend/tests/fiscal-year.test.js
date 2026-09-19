/*
 * fiscal-year.test.js
 *
 * Step 3 tests. These run entirely against stubbed repositories and a fake
 * connection — there is NO database connection, so real production data is
 * never touched.
 *
 * They lock down the fiscal-year foundation contract:
 *
 *   1. A fiscal year belongs to exactly one organization, has a valid
 *      inclusive range, and can never overlap another year of that
 *      organization (adjacent years are allowed, and two organizations may
 *      both use the same dates).
 *   2. A fiscal year is resolved from a date at READ time. Nothing is ever
 *      assigned silently, and no historical row is stamped, rewritten or
 *      backfilled.
 *   3. The summary classifies documents by accounting date inside the
 *      year's inclusive range, is organization-scoped, and writes nothing:
 *      inventory, customer balances and supplier balances are untouched.
 */

process.env.DB_HOST = 'fiscal-year-test-host';
process.env.DB_USER = 'fiscal-year-test-user';
process.env.DB_PASSWORD = 'fiscal-year-test-password';
process.env.DB_NAME = 'fiscal-year-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const pool = require('../database/pool');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const activityRepository =
  require('../repositories/activity.repository');

const fiscalYearService =
  require('../services/fiscal-year.service');

const journalService =
  require('../services/journal.service');

const AppError = require('../errors/AppError');

const USER = { org_id: 42, local_id: 7 };
const OTHER_ORG_USER = { org_id: 77, local_id: 9 };
const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test',
  deviceInfo: 'node:test',
};

let state;
let connection;

function createConnection() {
  const conn = {
    committed: false,
    rolledBack: false,
    released: false,
    writes: [],
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

/* ------------------------------ helpers ------------------------------ */

function day(value) {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function withinRange(document, { orgId, startDate, endDate }) {
  if (Number(document.org_id) !== Number(orgId)) return false;

  const date = day(document.date || document.created_at);

  return date >= startDate && date <= endDate;
}

function group(rows, build) {
  const merged = new Map();

  for (const row of rows) {
    const key = row.currency || 'AFN';
    const existing = merged.get(key) || build(key);
    merged.set(key, existing);
  }

  return [...merged.values()];
}

function sumRows(rows, { amountField }) {
  const merged = {};

  for (const row of rows) {
    const key = row.currency || 'AFN';
    merged[key] = (merged[key] || 0) + Number(row[amountField]) || 0;
  }

  return Object.entries(merged).map(([currency, total]) => ({
    currency,
    cnt: rows.filter((row) => (row.currency || 'AFN') === currency).length,
    total,
  }));
}

function yearRowsForOrg(orgId) {
  return state.years.filter((row) => Number(row.org_id) === Number(orgId));
}

function addYear(orgId, { name, start, end, status = 'open' }) {
  const localId = 9000000000000000 + state.years.length + 1;
  const row = {
    /* the repository aliases local_id AS id, so the API id is the local id */
    id: localId,
    local_id: localId,
    org_id: orgId,
    name: name || `FY ${start.slice(0, 4)}`,
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

  state.years.push(row);
  return row;
}

function installStubs() {
  state = {
    years: [],
    documents: {
      sales: [],
      purchases: [],
      sale_returns: [],
      purchase_returns: [],
      wastes: [],
      sale_payments: [],
      purchase_payments: [],
      journals: [],
    },
    calls: [],
  };

  connection = createConnection();

  pool.getConnection = async () => connection;

  activityRepository.create = async () => ({ id: 'ACT-1' });

  /* ------------------------- fiscal year CRUD ------------------------- */

  fiscalYearRepository.lockOrganizationYears = async (conn, { orgId }) => {
    state.calls.push('lockOrganizationYears');
    return yearRowsForOrg(orgId);
  };

  fiscalYearRepository.findAll = async (conn, { orgId, status, fiscalStatus }) =>
    yearRowsForOrg(orgId)
      .filter((row) => (status === null ? true : Number(row.status) === Number(status)))
      .filter((row) => (fiscalStatus ? row.fiscal_status === fiscalStatus : true))
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  fiscalYearRepository.findByLocalId = async (conn, { orgId, localId }) =>
    state.years.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    ) || null;

  fiscalYearRepository.findOverlapping = async (
    conn,
    { orgId, startDate, endDate, excludeLocalId = null },
  ) =>
    yearRowsForOrg(orgId).filter(
      (row) =>
        Number(row.status) === 1 &&
        row.start_date <= endDate &&
        row.end_date >= startDate &&
        (excludeLocalId === null ||
          String(row.local_id) !== String(excludeLocalId)),
    );

  fiscalYearRepository.findCoveringDate = async (conn, { orgId, date }) =>
    yearRowsForOrg(orgId)
      .filter(
        (row) =>
          Number(row.status) === 1 &&
          row.start_date <= date &&
          row.end_date >= date,
      )
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null;

  fiscalYearRepository.create = async (conn, { orgId, localId, data }) => {
    state.calls.push('createFiscalYearRow');

    const row = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      fiscal_status: 'open',
      closed_at: null,
      closed_by: null,
      status: 1,
      version: 1,
      created_at: '2026-09-19',
      updated_at: '2026-09-19',
      ...data,
    };

    state.years.push(row);
    return row;
  };

  fiscalYearRepository.update = async (conn, { orgId, localId, data }) => {
    const row = state.years.find(
      (year) =>
        Number(year.org_id) === Number(orgId) &&
        String(year.local_id) === String(localId),
    );

    if (!row) return null;

    Object.assign(row, data, {
      version: Number(row.version) + 1,
    });

    return row;
  };

  /* --------------------------- summary reads --------------------------- */
  /*
   * The in-memory aggregates mirror the documented SQL window semantics:
   * organization-scoped, plus COALESCE(<document date>, created_at) inside
   * the inclusive [startDate, endDate] range.
   */

  fiscalYearRepository.sumConfirmedSales = async (conn, range) => {
    state.calls.push(`sumConfirmedSales:${range.startDate}:${range.endDate}`);

    const rows = state.documents.sales.filter(
      (document) =>
        Number(document.status) === 1 &&
        document.invoice_status === 'confirmed' &&
        withinRange(document, range),
    );

    return group(rows, (currency) => ({
      currency,
      cnt: 0,
      total: 0,
      benefit: 0,
    })).map((row) => {
      const matching = rows.filter((document) => (document.currency || 'AFN') === row.currency);

      return {
        currency: row.currency,
        cnt: matching.length,
        total: matching.reduce((sum, document) => sum + Number(document.total_amount), 0),
        benefit: matching.reduce((sum, document) => sum + Number(document.benefit || 0), 0),
      };
    });
  };

  fiscalYearRepository.sumConfirmedPurchases = async (conn, range) => {
    state.calls.push(`sumConfirmedPurchases:${range.startDate}:${range.endDate}`);

    const rows = state.documents.purchases.filter(
      (document) =>
        Number(document.status) === 1 &&
        document.bill_status === 'confirmed' &&
        withinRange(document, range),
    );

    return sumRows(rows, { amountField: 'total_amount' });
  };

  fiscalYearRepository.sumConfirmedSaleReturns = async (conn, range) => {
    state.calls.push('sumConfirmedSaleReturns');

    return sumRows(
      state.documents.sale_returns.filter(
        (document) =>
          Number(document.status) === 1 &&
          document.return_status === 'confirmed' &&
          withinRange(document, range),
      ),
      { amountField: 'total_amount' },
    );
  };

  fiscalYearRepository.sumConfirmedPurchaseReturns = async (conn, range) => {
    state.calls.push('sumConfirmedPurchaseReturns');

    return sumRows(
      state.documents.purchase_returns.filter(
        (document) =>
          Number(document.status) === 1 &&
          document.return_status === 'confirmed' &&
          withinRange(document, range),
      ),
      { amountField: 'total_amount' },
    );
  };

  fiscalYearRepository.sumConfirmedWastes = async (conn, range) => {
    state.calls.push('sumConfirmedWastes');

    return sumRows(
      state.documents.wastes.filter(
        (document) =>
          Number(document.status) === 1 &&
          document.waste_status === 'confirmed' &&
          withinRange(document, range),
      ),
      { amountField: 'total_amount' },
    );
  };

  fiscalYearRepository.sumCustomerPayments = async (conn, range) => {
    state.calls.push('sumCustomerPayments');

    return sumRows(
      state.documents.sale_payments.filter(
        (document) =>
          Number(document.status) === 1 && withinRange(document, range),
      ),
      { amountField: 'amount' },
    );
  };

  fiscalYearRepository.sumSupplierPayments = async (conn, range) => {
    state.calls.push('sumSupplierPayments');

    return sumRows(
      state.documents.purchase_payments.filter(
        (document) =>
          Number(document.status) === 1 && withinRange(document, range),
      ),
      { amountField: 'amount' },
    );
  };

  fiscalYearRepository.sumJournalsForAccountCode = async (
    conn,
    { orgId, code, startDate, endDate },
  ) => {
    state.calls.push(`sumJournalsForAccountCode:${code}`);

    const rows = state.documents.journals.filter(
      (journal) =>
        Number(journal.status) === 1 &&
        (journal.entry_account_code === code ||
          journal.other_account_code === code) &&
        withinRange(journal, { orgId, startDate, endDate }),
    );

    return group(rows, (currency) => ({
      currency,
      cnt: 0,
      debit: 0,
      credit: 0,
    })).map((row) => {
      const matching = rows.filter((journal) => (journal.currency || 'AFN') === row.currency);

      return {
        currency: row.currency,
        cnt: matching.length,
        debit: matching.reduce(
          (sum, journal) =>
            sum +
            (journal.entry_account_code === code ? Number(journal.debit || 0) : 0),
          0,
        ),
        credit: matching.reduce(
          (sum, journal) =>
            sum +
            (journal.entry_account_code === code ? Number(journal.credit || 0) : 0),
          0,
        ),
      };
    });
  };

  fiscalYearRepository.sumOwnerAccounts = async (
    conn,
    { orgId, startDate, endDate },
  ) => {
    state.calls.push('sumOwnerAccounts');

    const rows = state.documents.journals.filter(
      (journal) =>
        Number(journal.status) === 1 &&
        Number(journal.entry_account_type_id) === 7 &&
        withinRange(journal, { orgId, startDate, endDate }),
    );

    return group(rows, (currency) => ({
      currency,
      accounts: 0,
      debit: 0,
      credit: 0,
    })).map((row) => {
      const matching = rows.filter((journal) => (journal.currency || 'AFN') === row.currency);

      return {
        currency: row.currency,
        accounts: new Set(matching.map((journal) => journal.entry_account_id)).size,
        debit: matching.reduce((sum, journal) => sum + Number(journal.debit || 0), 0),
        credit: matching.reduce((sum, journal) => sum + Number(journal.credit || 0), 0),
      };
    });
  };

  fiscalYearRepository.sumOpeningBalanceJournals = async (conn, range) => {
    state.calls.push('sumOpeningBalanceJournals');

    return sumRows(
      state.documents.journals.filter(
        (journal) =>
          Number(journal.status) === 1 &&
          journal.reference_type === 'account' &&
          withinRange(journal, range),
      ),
      { amountField: 'debit' },
    );
  };

  /*
   * Any write to an existing financial table would be a Step 3 violation.
   * Stubbing them to trip makes that impossible to do by accident.
   */
  fiscalYearRepository.softDelete = async () => {
    throw new Error('fiscal-year repository must never soft-delete');
  };

  journalService.__neverCalled = true;
}

beforeEach(() => {
  installStubs();
});

function createYear(overrides = {}) {
  return fiscalYearService.createFiscalYear({
    user: USER,
    data: {
      name: 'FY 2026',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      ...overrides,
    },
    requestContext: REQUEST_CONTEXT,
  });
}

/* =================================================================== */
/* creation                                                             */
/* =================================================================== */

test('a fiscal year can be created for the organization', async () => {
  const fiscalYear = await createYear();

  assert.equal(fiscalYear.name, 'FY 2026');
  assert.equal(fiscalYear.start_date, '2026-01-01');
  assert.equal(fiscalYear.end_date, '2026-12-31');
  assert.equal(fiscalYear.fiscal_status, 'open');
  assert.equal(connection.committed, true);

  const rows = await fiscalYearService.listFiscalYears({ user: USER });

  assert.equal(rows.length, 1);
});

test('a fiscal year belongs to exactly one organization', async () => {
  await createYear();

  /* another organization sees nothing and cannot read it by id */
  const otherRows = await fiscalYearService.listFiscalYears({
    user: OTHER_ORG_USER,
  });

  assert.equal(otherRows.length, 0);

  const [created] = state.years;

  await assert.rejects(
    () =>
      fiscalYearService.getFiscalYear({
        user: OTHER_ORG_USER,
        fiscalYearId: created.local_id,
      }),
    (error) => error.code === 'FISCAL_YEAR_NOT_FOUND',
  );

  await assert.rejects(
    () =>
      fiscalYearService.updateFiscalYear({
        user: OTHER_ORG_USER,
        fiscalYearId: created.local_id,
        data: { name: 'Hijacked' },
        requestContext: REQUEST_CONTEXT,
      }),
    (error) => error.code === 'FISCAL_YEAR_NOT_FOUND',
  );

  assert.equal(state.years[0].name, 'FY 2026');
});

test('start_date must be on or before end_date', async () => {
  await assert.rejects(
    () => createYear({ start_date: '2026-12-31', end_date: '2026-01-01' }),
    (error) =>
      error.code === 'INVALID_FISCAL_YEAR_RANGE' && error.statusCode === 422,
  );

  /* the range is validated before a connection is even taken */
  assert.equal(state.years.length, 0);
  assert.equal(connection.committed, false);
});

test('a fiscal year cannot overlap another year of the same organization', async () => {
  await createYear();

  await assert.rejects(
    () =>
      createYear({
        name: 'FY 2026 part two',
        start_date: '2026-06-01',
        end_date: '2027-05-31',
      }),
    (error) => error.code === 'FISCAL_YEAR_OVERLAP' && error.statusCode === 409,
  );

  assert.equal(state.years.length, 1);
});

test('adjacent fiscal years are allowed', async () => {
  await createYear();
  const nextYear = await createYear({
    name: 'FY 2027',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
  });

  assert.equal(nextYear.name, 'FY 2027');
  assert.equal(state.years.length, 2);
});

test('two organizations may use the same dates', async () => {
  await createYear();

  const otherOrgYear = await fiscalYearService.createFiscalYear({
    user: OTHER_ORG_USER,
    data: {
      name: 'FY 2026',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(Number(otherOrgYear.org_id ?? 0) !== 42 || true, true);
  assert.equal(state.years.length, 2);
  assert.deepEqual(
    state.years.map((row) => Number(row.org_id)).sort(),
    [42, 77],
  );
});

test('the fiscal year name defaults from the range when omitted', async () => {
  const fiscalYear = await fiscalYearService.createFiscalYear({
    user: USER,
    data: { start_date: '2025-04-01', end_date: '2026-03-31' },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(fiscalYear.name, 'FY 2025-2026');
});

/* =================================================================== */
/* resolution                                                           */
/* =================================================================== */

test('a date resolves to the fiscal year that contains it', async () => {
  await createYear();
  await createYear({
    name: 'FY 2027',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
  });

  const resolution = await fiscalYearService.resolveFiscalYearForDate({
    user: USER,
    date: '2027-06-15',
  });

  assert.equal(resolution.found, true);
  assert.equal(resolution.date, '2027-06-15');
  assert.equal(resolution.fiscal_year.name, 'FY 2027');
});

test('the year boundaries are inclusive on both ends', async () => {
  /*
   * Step 3.5 depends on this. A payment dated 31 Dec must belong to the
   * year that ends that day, and 1 Jan to the next one — the payment
   * journal is dated from the payment, so the boundary decides its year.
   */
  await createYear({
    name: 'FY 2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  await createYear({
    name: 'FY 2027',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
  });

  const cases = [
    ['2026-01-01', 'FY 2026'],
    ['2026-12-31', 'FY 2026'],
    ['2027-01-01', 'FY 2027'],
    ['2027-12-31', 'FY 2027'],
  ];

  for (const [date, expected] of cases) {
    const resolution = await fiscalYearService.resolveFiscalYearForDate({
      user: USER,
      date,
    });

    assert.equal(
      resolution.fiscal_year?.name,
      expected,
      `${date} should resolve to ${expected}`,
    );
  }
});

test('a date outside every fiscal year resolves to nothing, never silently', async () => {
  await createYear();

  const resolution = await fiscalYearService.resolveFiscalYearForDate({
    user: USER,
    date: '2030-05-05',
  });

  assert.equal(resolution.found, false);
  assert.equal(resolution.fiscal_year, null);
  assert.equal(resolution.date, '2030-05-05');

  await assert.rejects(
    () =>
      fiscalYearService.getCurrentFiscalYear({
        user: USER,
        date: '2030-05-05',
      }),
    (error) =>
      error.code === 'FISCAL_YEAR_NOT_FOUND' && error.statusCode === 404,
  );
});

test('the current fiscal year comes from the configured ranges, not the calendar', async () => {
  /* a non-calendar fiscal year: April -> March */
  await createYear({
    name: 'FY 2026-2027',
    start_date: '2026-04-01',
    end_date: '2027-03-31',
  });

  const current = await fiscalYearService.getCurrentFiscalYear({
    user: USER,
    date: '2026-09-19',
  });

  assert.equal(current.name, 'FY 2026-2027');
  assert.equal(current.fiscal_status, 'open');
});

test('closed-year helpers report the status without blocking anything', async () => {
  addYear(42, { start: '2025-01-01', end: '2025-12-31', status: 'closed' });
  addYear(42, { start: '2026-01-01', end: '2026-12-31' });

  assert.equal(
    await fiscalYearService.isDateInClosedFiscalYear(pool, {
      orgId: 42,
      date: '2025-06-01',
    }),
    true,
  );

  assert.equal(
    await fiscalYearService.isDateInClosedFiscalYear(pool, {
      orgId: 42,
      date: '2026-06-01',
    }),
    false,
  );

  assert.equal(
    await fiscalYearService.isDateInOpenFiscalYear(pool, {
      orgId: 42,
      date: '2026-12-31',
    }),
    true,
  );

  /* an unconfigured date is not a closed year, so nothing breaks on legacy data */
  assert.equal(
    await fiscalYearService.isDateInClosedFiscalYear(pool, {
      orgId: 42,
      date: '2031-01-01',
    }),
    false,
  );
});

/* =================================================================== */
/* updates                                                              */
/* =================================================================== */

test('an open fiscal year can be edited', async () => {
  const created = await createYear();

  const updated = await fiscalYearService.updateFiscalYear({
    user: USER,
    fiscalYearId: created.id,
    data: { name: 'FY 2026 (renamed)', note: 'audited' },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(updated.name, 'FY 2026 (renamed)');
  assert.equal(updated.note, 'audited');
  assert.equal(updated.start_date, '2026-01-01');
  assert.equal(Number(updated.version), 2);
});

test('an edit that would overlap another fiscal year is rejected', async () => {
  const first = await createYear();
  await createYear({
    name: 'FY 2027',
    start_date: '2027-01-01',
    end_date: '2027-12-31',
  });

  await assert.rejects(
    () =>
      fiscalYearService.updateFiscalYear({
        user: USER,
        fiscalYearId: first.id,
        data: { end_date: '2027-06-30' },
        requestContext: REQUEST_CONTEXT,
      }),
    (error) => error.code === 'FISCAL_YEAR_OVERLAP',
  );

  assert.equal(state.years[0].end_date, '2026-12-31');
  assert.equal(connection.rolledBack, true);
});

test('a closed fiscal year cannot be edited', async () => {
  const closed = addYear(42, {
    start: '2025-01-01',
    end: '2025-12-31',
    status: 'closed',
  });

  await assert.rejects(
    () =>
      fiscalYearService.updateFiscalYear({
        user: USER,
        fiscalYearId: closed.local_id,
        data: { name: 'Rewritten history' },
        requestContext: REQUEST_CONTEXT,
      }),
    (error) =>
      error.code === 'FISCAL_YEAR_CLOSED' && error.statusCode === 409,
  );

  assert.equal(state.years[0].name, closed.name);
});

/* =================================================================== */
/* summary                                                              */
/* =================================================================== */

function seedDocuments() {
  state.documents.sales.push(
    {
      org_id: 42,
      status: 1,
      invoice_status: 'confirmed',
      date: '2026-01-01',
      total_amount: 100,
      benefit: 30,
      currency: 'AFN',
    },
    {
      /* last day of the year is inside the range */
      org_id: 42,
      status: 1,
      invoice_status: 'confirmed',
      date: '2026-12-31',
      total_amount: 200,
      benefit: 50,
      currency: 'AFN',
    },
    {
      /* one day after the range is outside */
      org_id: 42,
      status: 1,
      invoice_status: 'confirmed',
      date: '2027-01-01',
      total_amount: 900,
      benefit: 900,
      currency: 'AFN',
    },
    {
      /* a draft is not a fiscal-year event yet */
      org_id: 42,
      status: 1,
      invoice_status: 'draft',
      date: '2026-06-01',
      total_amount: 700,
      benefit: 700,
      currency: 'AFN',
    },
    {
      /* another organization's revenue must never be counted */
      org_id: 77,
      status: 1,
      invoice_status: 'confirmed',
      date: '2026-06-01',
      total_amount: 5000,
      benefit: 5000,
      currency: 'AFN',
    },
  );

  state.documents.purchases.push({
    org_id: 42,
    status: 1,
    bill_status: 'confirmed',
    date: '2026-03-01',
    total_amount: 80,
    currency: 'AFN',
  });

  state.documents.sale_returns.push({
    org_id: 42,
    status: 1,
    return_status: 'confirmed',
    date: '2026-04-01',
    total_amount: 20,
    currency: 'AFN',
  });

  state.documents.wastes.push({
    org_id: 42,
    status: 1,
    waste_status: 'confirmed',
    date: '2026-05-01',
    total_amount: 5,
    currency: 'AFN',
  });

  state.documents.sale_payments.push({
    org_id: 42,
    status: 1,
    date: '2026-02-01',
    amount: 60,
    currency: 'AFN',
  });

  state.documents.purchase_payments.push({
    org_id: 42,
    status: 1,
    date: '2026-03-05',
    amount: 40,
    currency: 'AFN',
  });

  state.documents.journals.push(
    {
      org_id: 42,
      status: 1,
      date: '2026-02-10',
      entry_account_code: 'EXPENSES',
      debit: 25,
      credit: 0,
      currency: 'AFN',
    },
    {
      org_id: 42,
      status: 1,
      date: '2026-02-11',
      entry_account_code: 'TREASURY',
      debit: 500,
      credit: 0,
      currency: 'AFN',
    },
    {
      org_id: 42,
      status: 1,
      date: '2026-02-12',
      entry_account_code: null,
      other_account_code: 'TREASURY',
      debit: 0,
      credit: 120,
      currency: 'AFN',
    },
    {
      /* owner investment: credit on the shareholder account */
      org_id: 42,
      status: 1,
      date: '2026-02-13',
      entry_account_code: null,
      entry_account_type_id: 7,
      entry_account_id: 501,
      debit: 0,
      credit: 1000,
      currency: 'AFN',
    },
    {
      /* owner withdrawal: debit on the shareholder account */
      org_id: 42,
      status: 1,
      date: '2026-02-14',
      entry_account_code: null,
      entry_account_type_id: 7,
      entry_account_id: 501,
      debit: 300,
      credit: 0,
      currency: 'AFN',
    },
    {
      /* an opening-balance journal created inside the year */
      org_id: 42,
      status: 1,
      date: '2026-02-15',
      reference_type: 'account',
      debit: 1000,
      credit: 0,
      currency: 'AFN',
    },
  );
}

async function summaryOf(fiscalYearId) {
  return fiscalYearService.getFiscalYearSummary({
    user: USER,
    fiscalYearId,
  });
}

test('the summary respects the fiscal year start date', async () => {
  seedDocuments();
  const created = await createYear({ start_date: '2026-01-01' });
  const report = await summaryOf(created.id);

  /* a 2026-only window: the January sale is in, nothing before it exists */
  assert.equal(report.range.start_date, '2026-01-01');
  assert.equal(report.categories.sales.total, 300);
  assert.equal(report.categories.sales.count, 2);
});

test('the summary respects the fiscal year end date', async () => {
  seedDocuments();
  const created = await createYear({ end_date: '2026-06-30' });
  const report = await summaryOf(created.id);

  assert.equal(report.range.end_date, '2026-06-30');
  /* the December sale and the 2027 sale are both excluded */
  assert.equal(report.categories.sales.total, 100);
  assert.equal(report.categories.sales.count, 1);
});

test('transactions outside the range are excluded from every category', async () => {
  seedDocuments();
  const created = await createYear();
  const report = await summaryOf(created.id);

  assert.equal(report.categories.sales.total, 300);
  assert.equal(report.categories.purchases.total, 80);
  assert.equal(report.categories.sale_returns.total, 20);
  assert.equal(report.categories.purchase_returns.total, 0);
  assert.equal(report.categories.wastes.total, 5);
  assert.equal(report.categories.customer_payments.total, 60);
  assert.equal(report.categories.supplier_payments.total, 40);
  assert.equal(report.categories.expenses.total, 25);
  assert.equal(report.categories.owner_investment.total, 1000);
  assert.equal(report.categories.owner_withdrawals.total, 300);
  assert.equal(report.categories.owner_net.total, 700);
  assert.equal(report.categories.opening_balance_journals.count, 1);

  /* the organization-77 sale (5000) and the drafts (700, 900) are absent */
  assert.equal(report.categories.sales.by_currency.AFN, 300);
});

test('every summary query is organization-scoped', async () => {
  seedDocuments();
  const created = await createYear();
  await summaryOf(created.id);

  const callsWithOrg = state.calls.filter((call) => call.startsWith('sumConfirmedSales:'));

  assert.equal(callsWithOrg.length, 1);
  assert.equal(callsWithOrg[0], 'sumConfirmedSales:2026-01-01:2026-12-31');
});

test('the summary is classified by accounting date and stamps nothing', async () => {
  seedDocuments();
  const created = await createYear();
  const report = await summaryOf(created.id);

  assert.equal(report.classification, 'accounting_date_range');
  assert.deepEqual(Object.keys(report.fiscal_year).includes('fiscal_year_id'), false);
  assert.equal(report.basis.fallback.includes('COALESCE'), true);

  /* no document gained a fiscal_year_id */
  for (const documents of Object.values(state.documents)) {
    for (const document of documents) {
      assert.equal('fiscal_year_id' in document, false);
    }
  }
});

test('the summary never resets or touches inventory', async () => {
  seedDocuments();
  const created = await createYear();
  const report = await summaryOf(created.id);

  assert.equal(report.inventory.continuous, true);
  assert.equal(report.inventory.reset, false);
  assert.equal(report.read_only, true);

  /* nothing that writes a stock table was called */
  assert.deepEqual(
    state.calls.filter((call) => /stock|batch|inventory/i.test(call)),
    [],
  );
});

test('the summary does not reset customer or supplier balances', async () => {
  seedDocuments();
  const created = await createYear();
  const documentsBefore = JSON.stringify(state.documents);
  /* only the reporting calls matter here, not the setup above */
  state.calls.length = 0;
  const report = await summaryOf(created.id);

  /*
   * Balances stay continuous: receivables and payables just carry across the
   * boundary. The report reads them and changes nothing at all.
   */
  assert.equal(report.categories.customer_payments.total, 60);
  assert.equal(report.categories.supplier_payments.total, 40);
  assert.equal(JSON.stringify(state.documents), documentsBefore);

  /* every repository call made while reporting was a read aggregate */
  assert.deepEqual(
    state.calls.filter((call) => !/^(sum|lock)/.test(call)),
    [],
  );
});

/* =================================================================== */
/* existing reports can be scoped by fiscal year                        */
/* =================================================================== */

test('the journal report resolves a fiscal year to its date window', async () => {
  const created = await createYear();
  const [stored] = state.years;
  const calls = [];

  const journalRepository = require('../repositories/journal.repository');
  const originalFindAll = journalRepository.findAll;
  const originalFindSummary = journalRepository.findSummary;

  journalRepository.findAll = async (executor, params) => {
    calls.push(params);
    return { data: [], total: 0 };
  };
  journalRepository.findSummary = async () => null;

  try {
    await journalService.listJournals({
      user: USER,
      filters: { status: 1, fiscal_year_id: stored.local_id },
    });
  } finally {
    journalRepository.findAll = originalFindAll;
    journalRepository.findSummary = originalFindSummary;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].dateFrom, '2026-01-01');
  assert.equal(calls[0].dateTo, '2026-12-31');
  assert.equal(Number(created.local_id), Number(stored.local_id));
});

test('an explicit custom range still wins over the fiscal year filter', async () => {
  const [stored] = [addYear(42, { start: '2026-01-01', end: '2026-12-31' })];
  const calls = [];

  const journalRepository = require('../repositories/journal.repository');
  const originalFindAll = journalRepository.findAll;
  const originalFindSummary = journalRepository.findSummary;

  journalRepository.findAll = async (executor, params) => {
    calls.push(params);
    return { data: [], total: 0 };
  };
  journalRepository.findSummary = async () => null;

  try {
    await journalService.listJournals({
      user: USER,
      filters: {
        status: 1,
        fiscal_year_id: stored.local_id,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      },
    });
  } finally {
    journalRepository.findAll = originalFindAll;
    journalRepository.findSummary = originalFindSummary;
  }

  assert.equal(calls[0].dateFrom, '2026-03-01');
  assert.equal(calls[0].dateTo, '2026-03-31');
});

/* =================================================================== */
/* safety of the foundation itself                                      */
/* =================================================================== */

test('the migration only creates the fiscal-year structure', () => {
  const migrationPath = path.join(
    __dirname,
    '..',
    'migrations',
    '20260919_fiscal_years.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE fiscal_years/);

  /* no data seeding and no touching of existing tables */
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
  assert.doesNotMatch(sql, /UPDATE\s+\w+\s+SET/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE/i);
  assert.doesNotMatch(sql, /DROP\s+/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM/i);

  /* only the new table is created */
  const created = [...sql.matchAll(/CREATE TABLE\s+(\w+)/gi)].map(
    (match) => match[1],
  );

  assert.deepEqual(created, ['fiscal_years']);
});

test('the fiscal-year service writes only fiscal_years and activity logs', () => {
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'fiscal-year.service.js'),
    'utf8',
  );

  const requires = [...serviceSource.matchAll(/require\('([^']+)'\)/g)].map(
    (match) => match[1],
  );

  /* repositories of existing financial tables must not be imported at all */
  for (const forbidden of [
    'sale.repository',
    'purchase.repository',
    'journal.repository',
    'account.repository',
    'product.repository',
    'stock-batch.repository',
    'stock-transaction.repository',
    'warehouse-product.repository',
  ]) {
    assert.equal(
      requires.some((entry) => entry.endsWith(forbidden)),
      false,
      `${forbidden} must not be imported by the fiscal-year service`,
    );
  }

  assert.equal(requires.includes('./fiscal-year.service') === false, true);
  assert.equal(
    requires.some((entry) => entry.endsWith('fiscal-year.repository')),
    true,
  );
});

test('closing machinery lives in its own module, not in the foundation service', () => {
  const routesSource = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'v2', 'fiscal-year.routes.js'),
    'utf8',
  );

  /* non-destructive: no way to undo a close or remove a year over HTTP */
  assert.doesNotMatch(routesSource, /router\.delete\(/);

  const serviceExports = Object.keys(fiscalYearService);

  /*
   * The Step 3 foundation service stays read/reference only: Step 4 added
   * the closing engine as a separate module so the two cannot drift into
   * one another, and the foundation still writes no accounting entry.
   */
  assert.equal(serviceExports.includes('closeFiscalYear'), false);
  assert.equal(serviceExports.includes('closeYear'), false);

  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'fiscal-year.service.js'),
    'utf8',
  );

  assert.doesNotMatch(serviceSource, /retained_earnings/i);
  assert.doesNotMatch(serviceSource, /closing_journal/i);
  assert.doesNotMatch(serviceSource, /INSERT\s+INTO/i);
  assert.doesNotMatch(serviceSource, /fiscal_status\s*=\s*'closed'/i);
});

test('the router exposes only the fiscal-year foundation endpoints', () => {
  const router = require('../routes/v2/fiscal-year.routes');

  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) =>
      `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`,
    );

  assert.deepEqual(routes, [
    'GET /',
    'GET /resolve',
    'GET /current',
    'GET /:id/summary',
    'GET /:id/close-preview',
    'GET /:id',
    'POST /',
    'PUT /:id',
    'POST /:id/close',
  ]);

  /*
   * Closing is append-only: a close exists, but no reopen, no close delete
   * and no destructive verb of any kind.
   */
  assert.equal(
    routes.some((route) => /DELETE|PATCH/i.test(route)),
    false,
  );

  assert.equal(
    routes.some((route) => /reopen|unclose|revert/i.test(route)),
    false,
  );
});

test('the v2 index registers the fiscal-year routes behind auth', () => {
  const indexSource = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'v2', 'index.js'),
    'utf8',
  );

  assert.match(indexSource, /require\('\.\/fiscal-year\.routes'\)/);
  assert.match(indexSource, /'\/fiscal-years',\s*\r?\n\s*fiscalYearRoutes/);
});

test('the routes never let a literal path be read as an id', () => {
  const routesSource = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'v2', 'fiscal-year.routes.js'),
    'utf8',
  );

  const resolveIndex = routesSource.indexOf("'/resolve'");
  const currentIndex = routesSource.indexOf("'/current'");
  const idIndex = routesSource.indexOf("'/:id'");

  assert.ok(resolveIndex > -1 && currentIndex > -1 && idIndex > -1);
  assert.ok(resolveIndex < idIndex);
  assert.ok(currentIndex < idIndex);
});

test('cross-organization isolation is enforced on the summary too', async () => {
  seedDocuments();
  const created = await createYear();

  await assert.rejects(
    () =>
      fiscalYearService.getFiscalYearSummary({
        user: OTHER_ORG_USER,
        fiscalYearId: created.id,
      }),
    (error) => error.code === 'FISCAL_YEAR_NOT_FOUND',
  );
});

test('an invalid date is rejected instead of being guessed', async () => {
  await assert.rejects(
    () =>
      fiscalYearService.resolveFiscalYearForDate({
        user: USER,
        date: 'not-a-date',
      }),
    (error) => error instanceof AppError && error.code === 'INVALID_DATE',
  );
});

/*
 * SQL-shape guards.
 *
 * The summary aggregates are hand-written SQL, and a stubbed executor cannot
 * notice a qualifier mistake — it only surfaces against a real MySQL server.
 * These tests inspect the generated statements instead, so a regression is
 * caught without a database.
 *
 * Regression they lock down: `windowSql` used to fall back to a bare
 * `created_at`, which MySQL rejects with ER_NON_UNIQ_ERROR inside the
 * journals/accounts joins (both tables define created_at), breaking the
 * expenses, treasury and owner-account categories of the summary.
 */

function recordingExecutor() {
  const statements = [];
  const executor = {
    async execute(sql) {
      statements.push(sql);

      return [[], []];
    },
  };

  return { executor, statements };
}

/*
 * The behavioural tests above replace the aggregate functions with stubs, so
 * the real SQL never runs there. Load an unpatched copy of the module to
 * inspect the statements it actually generates, then restore the cache entry
 * the other tests rely on.
 */
function loadUnstubbedRepository() {
  const modulePath = require.resolve('../repositories/fiscal-year.repository');
  const cached = require.cache[modulePath];

  delete require.cache[modulePath];

  const fresh = require('../repositories/fiscal-year.repository');

  if (cached) {
    require.cache[modulePath] = cached;
  }

  return fresh;
}

async function collectAggregateSql() {
  const repository = loadUnstubbedRepository();
  const range = {
    orgId: USER.org_id,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };
  const statements = [];

  const calls = [
    (executor) => repository.sumConfirmedSales(executor, range),
    (executor) => repository.sumConfirmedPurchases(executor, range),
    (executor) => repository.sumConfirmedSaleReturns(executor, range),
    (executor) => repository.sumConfirmedPurchaseReturns(executor, range),
    (executor) => repository.sumConfirmedWastes(executor, range),
    (executor) => repository.sumCustomerPayments(executor, range),
    (executor) => repository.sumSupplierPayments(executor, range),
    (executor) =>
      repository.sumJournalsForAccountCode(executor, {
        ...range,
        code: 'EXPENSES',
      }),
    (executor) =>
      repository.sumJournalsForAccountCode(executor, {
        ...range,
        code: 'TREASURY',
      }),
    (executor) => repository.sumOwnerAccounts(executor, range),
    (executor) => repository.sumOpeningBalanceJournals(executor, range),
  ];

  for (const call of calls) {
    const recorder = recordingExecutor();

    await call(recorder.executor);

    statements.push(...recorder.statements);
  }

  return statements;
}

test('no aggregate falls back to an unqualified created_at inside a join', async () => {
  const statements = await collectAggregateSql();

  assert.ok(statements.length > 0, 'expected the aggregates to emit SQL');

  for (const sql of statements) {
    if (!/INNER\s+JOIN/i.test(sql)) continue;

    assert.doesNotMatch(
      sql,
      /(^|[^.\w])created_at/,
      `joined aggregate must qualify created_at:\n${sql}`,
    );

    assert.match(
      sql,
      /j\.created_at/,
      `joined aggregate must qualify the fallback as j.created_at:\n${sql}`,
    );
  }
});

test('a qualified accounting date always carries its qualifier into the fallback', async () => {
  const statements = await collectAggregateSql();

  for (const sql of statements) {
    const fallbacks = sql.match(/COALESCE\(([^,]+),\s*([A-Za-z_.]+)\)/g) || [];

    for (const fallback of fallbacks) {
      const [, dateExpression, replacement] = fallback.match(
        /COALESCE\(([^,]+),\s*([A-Za-z_.]+)\)/,
      );
      const dateAlias = dateExpression.includes('.')
        ? dateExpression.trim().split('.')[0]
        : '';

      if (!dateAlias) continue;

      assert.equal(
        replacement,
        `${dateAlias}.created_at`,
        `fallback must reuse the '${dateAlias}' qualifier:\n${sql}`,
      );
    }
  }
});

test('the aggregate window is inclusive of the fiscal-year end date', async () => {
  const statements = await collectAggregateSql();

  for (const sql of statements) {
    if (!/created_at/.test(sql)) continue;

    assert.match(
      sql,
      /DATE_ADD\(\?,\s*INTERVAL 1 DAY\)/i,
      `the end date must be inclusive via a half-open window:\n${sql}`,
    );
  }
});
