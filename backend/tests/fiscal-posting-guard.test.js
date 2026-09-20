/*
 * fiscal-posting-guard.test.js
 *
 * Step 4.5 tests. No database connection: the guard is exercised against a
 * stubbed fiscal-year repository, and the journal service is exercised
 * end-to-end against stubbed repositories and a fake transaction.
 *
 * Three layers are covered:
 *
 *   1. BEHAVIOUR of the shared guard (open year / closed year / no year /
 *      no date / organization isolation / date normalization / locking).
 *   2. END-TO-END rejection in the journal service: a closed year really
 *      stops the write, and nothing is left behind afterwards.
 *   3. WIRING of every other financial entry point, asserted against the
 *      source text: the guard must be present AND must come before the first
 *      mutating call, so a rejection can never leave a document, a payment,
 *      a stock movement or a journal behind.
 */

process.env.DB_HOST = 'fiscal-posting-guard-test-host';
process.env.DB_USER = 'fiscal-posting-guard-test-user';
process.env.DB_PASSWORD = 'fiscal-posting-guard-test-password';
process.env.DB_NAME = 'fiscal-posting-guard-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const pool = require('../database/pool');

const fiscalYearRepository =
  require('../repositories/fiscal-year.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const accountService =
  require('../services/account.service');

const journalService =
  require('../services/journal.service');

const guard =
  require('../services/fiscal-posting-guard.service');

const USER = { org_id: 42, local_id: 7 };
const OTHER_ORG_USER = { org_id: 77, local_id: 9 };

const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test',
  deviceInfo: 'node:test',
};

const CLOSED = {
  local_id: 111,
  name: 'FY 2026',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  fiscal_status: 'closed',
};

const OPEN = {
  local_id: 222,
  name: 'FY 2027',
  start_date: '2027-01-01',
  end_date: '2027-12-31',
  fiscal_status: 'open',
};

let state;
let connection;

/* ------------------------------ harness ------------------------------ */

function createConnection() {
  const conn = {
    committed: false,
    rolledBack: false,
    released: false,
    executed: [],
    async beginTransaction() {},
    async commit() {
      conn.committed = true;
    },
    async rollback() {
      conn.rolledBack = true;
    },
    async release() {
      conn.released = true;
    },
    async execute(sql, values) {
      conn.executed.push({
        sql: String(sql),
        values,
      });

      return [[], []];
    },
  };

  return conn;
}

/*
 * Stands in for the fiscal_years table: one row per organization, per year.
 */
function coveringYear({ orgId, date, lock = null }) {
  state.lookups.push({
    orgId,
    date,
    lock,
  });

  const year = state.years.find(
    (row) =>
      Number(row.org_id) === Number(orgId) &&
      Number(row.status ?? 1) === 1 &&
      row.start_date <= date &&
      row.end_date >= date,
  );

  return year || null;
}

function installStubs() {
  state = {
    years: [],
    lookups: [],
    journals: [],
    activities: [],
  };

  connection = createConnection();

  pool.getConnection = async () => connection;

  fiscalYearRepository.findCoveringDate = async (executor, params) =>
    coveringYear(params);

  journalRepository.create = async (executor, { orgId, localId, data }) => {
    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: 1,
      version: 1,
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  journalRepository.findByLocalId = async (executor, { orgId, localId }) =>
    state.journals.find(
      (journal) =>
        Number(journal.org_id) === Number(orgId) &&
        String(journal.local_id) === String(localId),
    ) || null;

  journalRepository.update = async (executor, { orgId, localId, data }) => {
    const journal = state.journals.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    );

    if (!journal) return null;

    Object.assign(journal, data);

    return journal;
  };

  journalRepository.softDelete = async (executor, { orgId, localId }) => {
    const journal = state.journals.find(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        String(row.local_id) === String(localId),
    );

    if (journal) {
      journal.status = 0;
      journal.deleted = true;
    }

    return journal;
  };

  activityRepository.create = async (executor, entry) => {
    state.activities.push(entry);

    return { id: `ACT-${state.activities.length}` };
  };

  accountService.invalidateAccountAggregates = () => {};
}

beforeEach(installStubs);

function addYear(orgId, year) {
  state.years.push({
    ...year,
    org_id: orgId,
  });
}

function expectClosedYearRejection(promise, { operation, fiscalYearId = 111 } = {}) {
  return assert.rejects(promise, (error) => {
    assert.equal(error.code, 'FISCAL_YEAR_CLOSED');
    assert.equal(error.statusCode, 409);

    assert.equal(error.details.fiscal_year_id, fiscalYearId);
    assert.equal(error.details.fiscal_status, 'closed');
    assert.ok(error.details.start_date);
    assert.ok(error.details.end_date);
    assert.ok(error.details.accounting_date);

    if (operation) {
      assert.equal(error.details.operation, operation);
    }

    return true;
  });
}

/* ====================================================================== */
/* 1. Behaviour of the shared guard                                        */
/* ====================================================================== */

test('a date inside an OPEN fiscal year is allowed', async () => {
  addYear(USER.org_id, OPEN);

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2027-06-15',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.OPEN_FISCAL_YEAR);
  assert.equal(verdict.fiscal_year.local_id, OPEN.local_id);
});

test('a date inside a CLOSED fiscal year is rejected with 409 FISCAL_YEAR_CLOSED', async () => {
  addYear(USER.org_id, CLOSED);

  await expectClosedYearRejection(
    guard.assertAccountingDateOpen(connection, {
      orgId: USER.org_id,
      date: '2026-12-31',
      operation: 'sale.create',
    }),
    { operation: 'sale.create' },
  );
});

test('the rejection message names the year, the range and the operation', async () => {
  addYear(USER.org_id, CLOSED);

  let captured = null;

  try {
    await guard.assertAccountingDateOpen(connection, {
      orgId: USER.org_id,
      date: '2026-05-05',
      operation: 'journal.delete',
    });
  } catch (error) {
    captured = error;
  }

  assert.ok(captured);
  assert.match(captured.message, /FY 2026/);
  assert.match(captured.message, /2026-01-01/);
  assert.match(captured.message, /2026-12-31/);
  assert.match(captured.message, /journal\.delete/);
  assert.match(captured.message, /2026-05-05/);
});

test('a date with no configured fiscal year is allowed (backward compatible)', async () => {
  addYear(USER.org_id, CLOSED);

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2025-06-30',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.NO_FISCAL_YEAR);
  assert.equal(verdict.fiscal_year, null);
});

test('an organization with no fiscal years at all is unaffected', async () => {
  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2026-06-30',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.NO_FISCAL_YEAR);
});

test('a document with no usable date is allowed and never queried', async () => {
  addYear(USER.org_id, CLOSED);

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: null,
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.NO_ACCOUNTING_DATE);
  assert.equal(state.lookups.length, 0);
});

test('an unparseable date is treated as a missing date, not as today', async () => {
  addYear(USER.org_id, CLOSED);

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: 'not-a-date',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.NO_ACCOUNTING_DATE);
});

test('organization isolation: another organization closed year has no effect', async () => {
  addYear(OTHER_ORG_USER.org_id, CLOSED);

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2026-06-30',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, guard.REASONS.NO_FISCAL_YEAR);

  /* and the other organization is still blocked */
  await expectClosedYearRejection(
    guard.assertAccountingDateOpen(connection, {
      orgId: OTHER_ORG_USER.org_id,
      date: '2026-06-30',
      operation: 'test',
    }),
  );
});

test('a soft-deleted fiscal year does not block posting', async () => {
  addYear(USER.org_id, {
    ...CLOSED,
    status: 0,
  });

  const verdict = await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2026-06-30',
    operation: 'test',
  });

  assert.equal(verdict.allowed, true);
});

test('date normalization never shifts the accounting day', async () => {
  addYear(USER.org_id, CLOSED);

  /* date-only: the boundary day itself is inside the year */
  await expectClosedYearRejection(
    guard.assertAccountingDateOpen(connection, {
      orgId: USER.org_id,
      date: '2026-01-01',
      operation: 'test',
    }),
  );

  assert.equal(state.lookups.at(-1).date, '2026-01-01');

  /* ISO date-time: the calendar day is taken as written */
  await expectClosedYearRejection(
    guard.assertAccountingDateOpen(connection, {
      orgId: USER.org_id,
      date: '2026-12-31T23:30:00.000Z',
      operation: 'test',
    }),
  );

  assert.equal(state.lookups.at(-1).date, '2026-12-31');

  /* a JS Date (what mysql2 returns for a DATETIME column) */
  await expectClosedYearRejection(
    guard.assertAccountingDateOpen(connection, {
      orgId: USER.org_id,
      date: new Date(2026, 5, 15, 10, 0, 0),
      operation: 'test',
    }),
  );

  assert.equal(state.lookups.at(-1).date, '2026-06-15');
});

test('the guard takes a shared lock by default so a close cannot overtake it', async () => {
  addYear(USER.org_id, OPEN);

  await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2027-03-03',
    operation: 'test',
  });

  assert.equal(state.lookups.at(-1).lock, 'share');
});

test('read-only callers can skip the lock', async () => {
  addYear(USER.org_id, OPEN);

  await guard.assertAccountingDateOpen(connection, {
    orgId: USER.org_id,
    date: '2027-03-03',
    operation: 'test',
    lock: false,
  });

  assert.equal(state.lookups.at(-1).lock, null);
});

test('multiple dates are all checked', async () => {
  addYear(USER.org_id, OPEN);
  addYear(USER.org_id, CLOSED);

  /* an open-year edit is fine */
  await guard.assertAccountingDatesOpen(connection, {
    orgId: USER.org_id,
    dates: ['2027-01-05', '2027-04-04'],
    operation: 'test',
  });

  /* moving a document OUT of the closed year is rejected too */
  await expectClosedYearRejection(
    guard.assertAccountingDatesOpen(connection, {
      orgId: USER.org_id,
      dates: ['2026-12-30', '2027-01-05'],
      operation: 'sale.update',
    }),
    { operation: 'sale.update' },
  );

  /* and moving one INTO the closed year as well */
  await expectClosedYearRejection(
    guard.assertAccountingDatesOpen(connection, {
      orgId: USER.org_id,
      dates: ['2027-01-05', '2026-12-30'],
      operation: 'sale.update',
    }),
    { operation: 'sale.update' },
  );
});

test('a missing date inside a date list is ignored, not treated as today', async () => {
  addYear(USER.org_id, OPEN);

  const verdicts = await guard.assertAccountingDatesOpen(connection, {
    orgId: USER.org_id,
    dates: [null, undefined, '', '2027-02-02'],
    operation: 'test',
  });

  assert.equal(verdicts.length, 4);
  assert.equal(state.lookups.length, 1);
  assert.equal(state.lookups[0].date, '2027-02-02');
});

/* ====================================================================== */
/* 2. End-to-end: the journal service                                       */
/* ====================================================================== */

test('a manual journal dated in a closed year is rejected and writes nothing', async () => {
  addYear(USER.org_id, CLOSED);

  await expectClosedYearRejection(
    journalService.createJournal({
      user: USER,
      data: {
        date: '2026-08-08',
        description: 'should never exist',
      },
      requestContext: REQUEST_CONTEXT,
    }),
    { operation: 'journal.create' },
  );

  assert.equal(state.journals.length, 0);
  assert.equal(state.activities.length, 0);
  assert.equal(connection.committed, false);
  assert.equal(connection.rolledBack, true);
  assert.equal(connection.released, true);
});

test('a manual journal dated in an open year is created normally', async () => {
  addYear(USER.org_id, OPEN);

  const journal = await journalService.createJournal({
    user: USER,
    data: {
      date: '2027-02-02',
      description: 'open year entry',
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.ok(journal.local_id);
  assert.equal(state.journals.length, 1);
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
});

test('a manual journal dated outside every fiscal year is still created', async () => {
  addYear(USER.org_id, CLOSED);
  addYear(USER.org_id, OPEN);

  await journalService.createJournal({
    user: USER,
    data: {
      date: '2025-07-07',
      description: 'no fiscal year covers this date',
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(state.journals.length, 1);
});

test('editing a journal into a closed year is rejected and leaves it unchanged', async () => {
  addYear(USER.org_id, OPEN);
  addYear(USER.org_id, CLOSED);

  const journal = await journalService.createJournal({
    user: USER,
    data: {
      date: '2027-05-05',
      description: 'open',
    },
    requestContext: REQUEST_CONTEXT,
  });

  /* the creation itself logged one activity entry; nothing more may follow */
  const activitiesAfterCreate = state.activities.length;

  await expectClosedYearRejection(
    journalService.updateJournal({
      user: USER,
      journalId: journal.local_id,
      data: {
        date: '2026-05-05',
      },
      requestContext: REQUEST_CONTEXT,
    }),
    { operation: 'journal.update' },
  );

  assert.equal(state.journals[0].date, '2027-05-05');
  assert.equal(state.activities.length, activitiesAfterCreate);
});

test('editing a journal OUT of a closed year is rejected too', async () => {
  addYear(USER.org_id, CLOSED);
  addYear(USER.org_id, OPEN);

  /* seeded directly: creation of a closed-year entry is itself blocked */
  state.journals.push({
    id: 500,
    local_id: 500,
    org_id: USER.org_id,
    date: '2026-09-09',
    description: 'historical closed-year entry',
    status: 1,
  });

  await expectClosedYearRejection(
    journalService.updateJournal({
      user: USER,
      journalId: 500,
      data: {
        date: '2027-09-09',
      },
      requestContext: REQUEST_CONTEXT,
    }),
    { operation: 'journal.update' },
  );

  assert.equal(state.journals[0].date, '2026-09-09');
});

test('deleting a journal that belongs to a closed year is rejected', async () => {
  addYear(USER.org_id, CLOSED);

  state.journals.push({
    id: 501,
    local_id: 501,
    org_id: USER.org_id,
    date: '2026-03-03',
    description: 'closed-year entry',
    status: 1,
  });

  await expectClosedYearRejection(
    journalService.deleteJournal({
      user: USER,
      journalId: 501,
      requestContext: REQUEST_CONTEXT,
    }),
    { operation: 'journal.delete' },
  );

  assert.equal(state.journals[0].status, 1);
  assert.equal(state.activities.length, 0);
  assert.equal(connection.rolledBack, true);
});

test('deleting an open-year journal still works', async () => {
  addYear(USER.org_id, OPEN);

  const journal = await journalService.createJournal({
    user: USER,
    data: {
      date: '2027-03-03',
      description: 'open',
    },
    requestContext: REQUEST_CONTEXT,
  });

  const deleted = await journalService.deleteJournal({
    user: USER,
    journalId: journal.local_id,
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(deleted.status, 0);
});

/* ====================================================================== */
/* 3. Wiring of the other financial entry points                           */
/* ====================================================================== */

function sourceOf(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

/*
 * Extracts one top-level function body so the assertions below can prove
 * ORDERING (the guard must run before the first mutation), not just presence.
 */
function functionBody(source, name) {
  const start = source.search(
    new RegExp(`(^|\\n)async function ${name}\\(`),
  );

  assert.ok(start > -1, `function ${name} not found`);

  const rest = source.slice(start);

  const end = rest.slice(1).search(/\nasync function |\nfunction |\nmodule\.exports/);

  return end === -1 ? rest : rest.slice(0, end + 1);
}

function assertGuardBefore(body, {
  name,
  operation,
  mutation,
}) {
  const guardIndex = body.indexOf('fiscalPostingGuard.assertAccountingDate');
  const mutationIndex = body.indexOf(mutation);

  assert.ok(guardIndex > -1, `${name}: guard call missing`);
  assert.ok(mutationIndex > -1, `${name}: mutation marker "${mutation}" missing`);
  assert.ok(
    guardIndex < mutationIndex,
    `${name}: guard must run before "${mutation}"`,
  );

  if (operation) {
    assert.ok(
      body.includes(`'${operation}'`),
      `${name}: expected operation label ${operation}`,
    );
  }
}

test('the sale entry points are guarded before any mutation', () => {
  const source = sourceOf('services/sale.service.js');

  assertGuardBefore(functionBody(source, 'createSale'), {
    name: 'createSale',
    operation: 'sale.create',
    mutation: 'saleRepository.create(',
  });

  assertGuardBefore(functionBody(source, 'updateSale'), {
    name: 'updateSale',
    operation: 'sale.update',
    mutation: 'saleRepository.update(',
  });

  assertGuardBefore(functionBody(source, 'deleteSale'), {
    name: 'deleteSale',
    operation: 'sale.delete',
    mutation: 'saleRepository.softDelete(',
  });

  assertGuardBefore(functionBody(source, 'createReturn'), {
    name: 'createReturn',
    operation: 'sale_return.create',
    mutation: 'saleRepository.createReturn(',
  });

  assertGuardBefore(functionBody(source, 'deleteReturn'), {
    name: 'deleteReturn',
    operation: 'sale_return.delete',
    mutation: 'saleRepository.softDeleteReturn(',
  });

  /*
   * The reversal of a sale's payments and returns happens inside updateSale
   * and deleteSale; each reversed row's own date is checked first.
   */
  for (const fn of ['updateSale', 'deleteSale']) {
    const body = functionBody(source, fn);
    const paymentGuard = body.indexOf('(payment reversal)');
    const paymentLoop = body.indexOf('await saleRepository.softDeletePayment(');

    assert.ok(paymentGuard > -1, `${fn}: payment reversal guard missing`);
    assert.ok(paymentGuard < paymentLoop, `${fn}: payment guard must run first`);

    const returnGuard = body.indexOf('(return reversal)');
    const returnLoop = body.indexOf('revertSaleReturnStockOnConnection(');

    assert.ok(returnGuard > -1, `${fn}: return reversal guard missing`);
    assert.ok(returnGuard < returnLoop, `${fn}: return guard must run first`);
  }
});

test('the purchase entry points are guarded before any mutation', () => {
  const source = sourceOf('services/purchase.service.js');

  assertGuardBefore(functionBody(source, 'createPurchase'), {
    name: 'createPurchase',
    operation: 'purchase.create',
    mutation: 'purchaseRepository.create(',
  });

  assertGuardBefore(functionBody(source, 'updatePurchase'), {
    name: 'updatePurchase',
    operation: 'purchase.update',
    mutation: 'purchaseRepository.update(',
  });

  assertGuardBefore(functionBody(source, 'deletePurchase'), {
    name: 'deletePurchase',
    operation: 'purchase.delete',
    mutation: 'assertPurchaseReversibleOnConnection(',
  });

  assertGuardBefore(functionBody(source, 'createReturn'), {
    name: 'createReturn',
    operation: 'purchase_return.create',
    mutation: 'purchaseRepository.createReturn(',
  });

  assertGuardBefore(functionBody(source, 'deleteReturn'), {
    name: 'deleteReturn',
    operation: 'purchase_return.delete',
    mutation: 'revertPurchaseReturnStockOnConnection(',
  });

  /* the shared reversal helpers guard the rows they are about to erase */
  assertGuardBefore(functionBody(source, 'revertPurchaseReturnsOnConnection'), {
    name: 'revertPurchaseReturnsOnConnection',
    mutation: 'revertPurchaseReturnStockOnConnection(',
  });

  assertGuardBefore(functionBody(source, 'revertPurchasePaymentsOnConnection'), {
    name: 'revertPurchasePaymentsOnConnection',
    mutation: 'paymentPosting.softDeleteBillPaymentOnConnection(',
  });
});

test('every payment path is guarded where the payment date is decided', () => {
  const source = sourceOf('services/payment-posting.service.js');

  assertGuardBefore(functionBody(source, 'postBillPaymentOnConnection'), {
    name: 'postBillPaymentOnConnection',
    operation: 'sale_payment.create',
    mutation: 'repository.createPayment(',
  });

  assertGuardBefore(functionBody(source, 'softDeleteBillPaymentOnConnection'), {
    name: 'softDeleteBillPaymentOnConnection',
    operation: 'sale_payment.delete',
    mutation: 'repository.softDeletePayment(',
  });

  assertGuardBefore(functionBody(source, 'updateBillPaymentOnConnection'), {
    name: 'updateBillPaymentOnConnection',
    operation: 'sale_payment.update',
    mutation: 'reverseBillPaymentJournals(',
  });

  assertGuardBefore(functionBody(source, 'recordJournalBillPayment'), {
    name: 'recordJournalBillPayment',
    mutation: 'repository.createPayment(',
  });

  /*
   * The update path checks BOTH dates: a payment may not be moved into a
   * closed year, nor out of one.
   */
  const updateBody = functionBody(source, 'updateBillPaymentOnConnection');

  assert.ok(updateBody.includes('accountingDate(oldPayment.payment_date)'));
  assert.ok(updateBody.includes('accountingDate(merged.payment_date)'));
});

test('a return only answers for its own date, not for the invoice it returns', () => {
  /*
   * Documented policy: returning goods in an OPEN year against an invoice from
   * a CLOSED year is legitimate business — the return is a new accounting
   * event of its own year — so the guard must not consult the invoice date.
   */
  const saleSource = sourceOf('services/sale.service.js');
  const purchaseSource = sourceOf('services/purchase.service.js');

  const saleReturn = functionBody(saleSource, 'createReturn');

  assert.ok(saleReturn.includes('date: data.return_date'));
  assert.equal(saleReturn.includes('invoice_date'), false);

  const purchaseReturn = functionBody(purchaseSource, 'createReturn');

  assert.ok(purchaseReturn.includes('date: data.return_date'));
  assert.equal(purchaseReturn.includes('bill_date'), false);
});

test('the close takes its fiscal-year lock before it reads any balance', () => {
  /*
   * This ordering is what makes the shared lock in the guard meaningful: the
   * close must acquire the exclusive fiscal_years lock (and so wait for every
   * in-flight posting) BEFORE its first non-locking read, otherwise its
   * snapshot could miss a posting that is about to commit.
   */
  const source = sourceOf('services/fiscal-year-close.service.js');
  const body = functionBody(source, 'closeFiscalYear');

  const lockOrganization = body.indexOf('lockOrganization(');
  const lockFiscalYear = body.indexOf('forUpdate: true');
  const firstRead = body.indexOf('sumPeriodAccountActivity(');
  const firstWrite = body.indexOf('journalRepository.create(');

  assert.ok(lockOrganization > -1);
  assert.ok(lockFiscalYear > -1);
  assert.ok(firstRead > -1);
  assert.ok(firstWrite > -1);

  assert.ok(lockOrganization < lockFiscalYear);
  assert.ok(lockFiscalYear < firstRead);
  assert.ok(firstRead < firstWrite);
});

test('the opening balance is guarded on its effective date', () => {
  const source = sourceOf('services/account.service.js');

  assertGuardBefore(functionBody(source, 'createInitialBalanceJournals'), {
    name: 'createInitialBalanceJournals',
    operation: 'account.opening_balance',
    mutation: 'async function createJournal(',
  });
});

test('every module that writes a journal calls the shared guard', () => {
  const modules = [
    ['services/sale.service.js', 'createJournalEntry'],
    ['services/purchase.service.js', 'createJournalEntry'],
    ['services/payment-posting.service.js', 'createJournalEntry'],
    ['services/appointment.service.js', 'createJournalEntry'],
    ['services/inventory-record.service.js', 'createJournalEntry'],
    ['services/prescription.service.js', 'createJournalEntry'],
    ['services/production.service.js', 'createJournalEntry'],
    ['services/exchange.service.js', 'createExchangeJournals'],
    ['services/stock-transfer.service.js', 'createTransferJournal'],
  ];

  for (const [file, fn] of modules) {
    const source = sourceOf(file);

    assert.ok(
      source.includes("fiscal-posting-guard.service"),
      `${file} must use the shared guard`,
    );

    assertGuardBefore(functionBody(source, fn), {
      name: `${file}:${fn}`,
      mutation: 'journalRepository.create(',
    });
  }
});

test('the fiscal-year close is deliberately NOT guarded', () => {
  const source = sourceOf('services/fiscal-year-close.service.js');

  /*
   * The close writes its journals dated with the year's end_date while the
   * year is still open, and it is the only writer allowed to date a journal
   * inside the year it is closing. Guarding it would make closing impossible.
   */
  assert.equal(source.includes('fiscalPostingGuard'), false);
  assert.ok(source.includes("require('../repositories/journal.repository')"));
});

test('no journal-writing module was left unguarded', () => {
  const servicesDirectory = path.join(__dirname, '..', 'services');

  const writers = fs
    .readdirSync(servicesDirectory)
    .filter((file) => file.endsWith('.service.js'))
    .filter((file) =>
      fs
        .readFileSync(path.join(servicesDirectory, file), 'utf8')
        .includes('journalRepository.create('),
    );

  for (const file of writers) {
    const source = fs.readFileSync(path.join(servicesDirectory, file), 'utf8');

    const allowedWithoutGuard = file === 'fiscal-year-close.service.js';

    if (!allowedWithoutGuard) {
      assert.ok(
        source.includes('fiscal-posting-guard.service'),
        `${file} writes journals but never calls the shared guard`,
      );
    }
  }

  assert.ok(writers.length >= 10);
});

/* ====================================================================== */
/* 4. SQL shape                                                            */
/* ====================================================================== */

function recordingExecutor() {
  const statements = [];
  const executor = {
    async execute(sql) {
      statements.push(String(sql));

      return [[], []];
    },
  };

  return {
    executor,
    statements,
  };
}

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

test('the covering-year lookup locks in share mode, scoped to one organization', async () => {
  const repository = loadUnstubbedRepository();

  const shared = recordingExecutor();

  await repository.findCoveringDate(shared.executor, {
    orgId: USER.org_id,
    date: '2026-06-30',
    lock: 'share',
  });

  assert.match(shared.statements[0], /org_id = \?/);
  assert.match(shared.statements[0], /status = 1/);
  assert.match(shared.statements[0], /start_date <= \?/);
  assert.match(shared.statements[0], /end_date >= \?/);

  /*
   * MariaDB 10.4 (this deployment) has no `FOR SHARE`; LOCK IN SHARE MODE is
   * the portable spelling and is what serializes posting against closing.
   */
  assert.match(shared.statements[0], /LOCK IN SHARE MODE/);

  const exclusive = recordingExecutor();

  await repository.findCoveringDate(exclusive.executor, {
    orgId: USER.org_id,
    date: '2026-06-30',
    lock: 'update',
  });

  assert.match(exclusive.statements[0], /FOR UPDATE/);

  const plain = recordingExecutor();

  await repository.findCoveringDate(plain.executor, {
    orgId: USER.org_id,
    date: '2026-06-30',
  });

  assert.equal(/LOCK IN SHARE MODE|FOR UPDATE/.test(plain.statements[0]), false);
});
