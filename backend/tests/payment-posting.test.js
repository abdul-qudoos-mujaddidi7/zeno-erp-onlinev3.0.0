/*
 * payment-posting.test.js
 *
 * Step 1 tests. These run entirely against repository/pool stubs — there
 * is NO database connection, so real production data is never touched.
 *
 * They prove that sale and purchase payments share the authoritative
 * posting service: one payment row, exactly the expected journals, a
 * server-recomputed `remaining`, and no partial state after a failure.
 */

/*
 * Force placeholder DB settings BEFORE loading any service.
 * database/pool -> db.js throws when DB_* env vars are missing.
 * mysql2.createPool() opens connections lazily and we replace
 * getConnection below, so no socket is ever opened.
 */
process.env.DB_HOST = 'payment-test-host';
process.env.DB_USER = 'payment-test-user';
process.env.DB_PASSWORD = 'payment-test-password';
process.env.DB_NAME = 'payment-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../database/pool');

const saleRepository =
  require('../repositories/sale.repository');

const purchaseRepository =
  require('../repositories/purchase.repository');

const salePaymentRepository =
  require('../repositories/sale-payment.repository');

const purchasePaymentRepository =
  require('../repositories/purchase-payment.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const paymentPosting =
  require('../services/payment-posting.service');

const salePaymentService =
  require('../services/sale-payment.service');

const purchasePaymentService =
  require('../services/purchase-payment.service');

const USER = { org_id: 42, local_id: 7 };
const OTHER_ORG_USER = { org_id: 99, local_id: 7 };

const ACCOUNTS = {
  SALES: { id: 'ACC-SALES', code: 'SALES' },
  RECEIVABLE: { id: 'ACC-RECV', code: 'RECEIVABLE' },
  PURCHASE: { id: 'ACC-PURCHASE', code: 'PURCHASE' },
  PAYABLE: { id: 'ACC-PAYABLE', code: 'PAYABLE' },
};

let state;
let connection;

function createConnection() {
  return {
    committed: false,
    rolledBack: false,
    released: false,

    async beginTransaction() {},
    async commit() {
      this.committed = true;
    },
    async rollback() {
      this.rolledBack = true;
    },
    async release() {
      this.released = true;
    },
    async execute() {
      return [[], []];
    },
  };
}

function activeConfirmedSale(overrides = {}) {
  return {
    id: '1001',
    local_id: '1001',
    org_id: 42,
    total_amount: 1000,
    currency: 'AFN',
    account_id: 'CUST-1',
    status: 1,
    invoice_status: 'confirmed',
    remaining: 1000,
    ...overrides,
  };
}

function activeConfirmedPurchase(overrides = {}) {
  return {
    id: '2001',
    local_id: '2001',
    org_id: 42,
    total_amount: 800,
    currency: 'AFN',
    account_id: 'SUP-1',
    status: 1,
    bill_status: 'confirmed',
    remaining: 800,
    ...overrides,
  };
}

function installStubs() {
  state = {
    sales: new Map(),
    purchases: new Map(),
    salePayments: [],
    purchasePayments: [],
    journals: [],
    returns: [],
  };

  const scoped = (row, orgId) =>
    row && Number(row.org_id) === Number(orgId) ? row : null;

  /* ------------------------- sale repository ------------------------ */
  saleRepository.findByLocalId = async (conn, { orgId, localId }) =>
    scoped(state.sales.get(String(localId)), orgId);

  saleRepository.findPaymentsBySale = async (
    conn,
    { orgId, saleId, includeDeleted = false },
  ) =>
    state.salePayments.filter(
      (payment) =>
        Number(payment.org_id) === Number(orgId) &&
        String(payment.sale_id) === String(saleId) &&
        (includeDeleted || Number(payment.status) === 1),
    );

  saleRepository.findReturnsBySale = async (
    conn,
    { orgId, saleId, includeDeleted = false },
  ) =>
    state.returns.filter(
      (entry) =>
        entry.kind === 'sale' &&
        Number(entry.org_id) === Number(orgId) &&
        String(entry.sale_id || entry.parent_id) === String(saleId) &&
        (includeDeleted || Number(entry.status) === 1),
    );

  saleRepository.createPayment = async (
    conn,
    { orgId, localId, userId, data },
  ) => {
    const row = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: data.status ?? 1,
      ...data,
    };
    state.salePayments.push(row);
    return row;
  };

  saleRepository.findAccountByCode = async (conn, { code }) =>
    ACCOUNTS[code] || null;

  saleRepository.update = async (conn, { localId, data }) => {
    const row = state.sales.get(String(localId));
    if (row && data.remaining !== undefined) {
      row.remaining = data.remaining;
    }
    return row;
  };

  saleRepository.softDeletePayment = async (conn, { localId }) => {
    const row = state.salePayments.find(
      (payment) => String(payment.id) === String(localId),
    );
    if (row) row.status = 0;
    return row;
  };

  /* ----------------------- purchase repository ---------------------- */
  purchaseRepository.findByLocalId = async (conn, { orgId, localId }) =>
    scoped(state.purchases.get(String(localId)), orgId);

  purchaseRepository.findPaymentsByPurchase = async (
    conn,
    { orgId, purchaseId, includeDeleted = false },
  ) =>
    state.purchasePayments.filter(
      (payment) =>
        Number(payment.org_id) === Number(orgId) &&
        String(payment.purchase_id) === String(purchaseId) &&
        (includeDeleted || Number(payment.status) === 1),
    );

  purchaseRepository.findReturnsByPurchase = async (
    conn,
    { orgId, purchaseId, includeDeleted = false },
  ) =>
    state.returns.filter(
      (entry) =>
        entry.kind === 'purchase' &&
        Number(entry.org_id) === Number(orgId) &&
        String(entry.purchase_id || entry.parent_id) === String(purchaseId) &&
        (includeDeleted || Number(entry.status) === 1),
    );

  purchaseRepository.createPayment = async (
    conn,
    { orgId, localId, userId, data },
  ) => {
    const row = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: data.status ?? 1,
      ...data,
    };
    state.purchasePayments.push(row);
    return row;
  };

  purchaseRepository.findAccountByCode = async (conn, { code }) =>
    ACCOUNTS[code] || null;

  purchaseRepository.update = async (conn, { localId, data }) => {
    const row = state.purchases.get(String(localId));
    if (row && data.remaining !== undefined) {
      row.remaining = data.remaining;
    }
    return row;
  };

  purchaseRepository.softDeletePayment = async (conn, { localId }) => {
    const row = state.purchasePayments.find(
      (payment) => String(payment.id) === String(localId),
    );
    if (row) row.status = 0;
    return row;
  };

  /* --------------------- payment repositories ----------------------- */
  salePaymentRepository.findByLocalId = async (conn, { orgId, localId }) => {
    const row = state.salePayments.find(
      (payment) => String(payment.local_id) === String(localId),
    );
    return scoped(row, orgId);
  };

  salePaymentRepository.update = async (conn, { localId, data }) => {
    const row = state.salePayments.find(
      (payment) => String(payment.local_id) === String(localId),
    );
    if (row) Object.assign(row, data);
    return row;
  };

  purchasePaymentRepository.findByLocalId = async (
    conn,
    { orgId, localId },
  ) => {
    const row = state.purchasePayments.find(
      (payment) => String(payment.local_id) === String(localId),
    );
    return scoped(row, orgId);
  };

  purchasePaymentRepository.update = async (conn, { localId, data }) => {
    const row = state.purchasePayments.find(
      (payment) => String(payment.local_id) === String(localId),
    );
    if (row) Object.assign(row, data);
    return row;
  };

  /* -------------------------- journal repo -------------------------- */
  journalRepository.create = async (conn, { orgId, localId, data }) => {
    const journal = {
      id: localId,
      local_id: localId,
      org_id: orgId,
      status: data.status ?? 1,
      ...data,
    };
    state.journals.push(journal);
    return journal;
  };

  journalRepository.softDeleteByReference = async (
    conn,
    { orgId, referenceId, referenceType },
  ) => {
    for (const journal of state.journals) {
      if (
        Number(journal.org_id) === Number(orgId) &&
        String(journal.reference_id) === String(referenceId) &&
        journal.reference_type === referenceType &&
        Number(journal.status) === 1
      ) {
        journal.status = 0;
      }
    }
  };

  activityRepository.create = async () => ({});

  connection = createConnection();
  pool.getConnection = async () => connection;
}

function activeSaleJournals() {
  return state.journals.filter(
    (journal) =>
      journal.reference_type === 'sale_payment' &&
      Number(journal.status) === 1,
  );
}

function activePurchaseJournals() {
  return state.journals.filter(
    (journal) =>
      journal.reference_type === 'purchase_payment' &&
      Number(journal.status) === 1,
  );
}

beforeEach(() => {
  installStubs();
});

/* =============================== SALE =============================== */

test('sale payment posts two balanced journals and recomputes remaining', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const payment = await paymentPosting.postSalePaymentOnConnection(
    connection,
    {
      orgId: 42,
      userId: 7,
      requestContext: {},
      sale: state.sales.get('1001'),
      saleId: '1001',
      data: { account_id: 'CASH', amount: 1000, currency: 'AFN' },
    },
  );

  assert.equal(state.salePayments.length, 1);
  assert.equal(payment.amount, 1000);

  const journals = activeSaleJournals();
  assert.equal(journals.length, 2);

  for (const journal of journals) {
    assert.equal(journal.reference_type, 'sale_payment');
    assert.equal(journal.reference_id, payment.id);
    const debit =
      Number(journal.first_entry_debit) + Number(journal.second_entry_debit);
    const credit =
      Number(journal.first_entry_credit) + Number(journal.second_entry_credit);
    assert.equal(debit, credit);
  }

  // SALES credited, RECEIVABLE debited
  assert.equal(journals[0].first_entry_account, 'ACC-SALES');
  assert.equal(Number(journals[0].first_entry_credit), 1000);
  assert.equal(Number(journals[0].second_entry_debit), 1000);

  // customer credited, treasury debited
  assert.equal(journals[1].first_entry_account, 'CUST-1');
  assert.equal(Number(journals[1].first_entry_credit), 1000);
  assert.equal(journals[1].second_entry_account, 'CASH');
  assert.equal(Number(journals[1].second_entry_debit), 1000);

  assert.equal(state.sales.get('1001').remaining, 0);
});

test('partial sale payment recomputes remaining', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: { account_id: 'CASH', amount: 400, currency: 'AFN' },
  });

  assert.equal(state.sales.get('1001').remaining, 600);
});

test('multiple partial sale payments accumulate and returns reduce remaining', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));
  state.returns.push({
    kind: 'sale',
    org_id: 42,
    sale_id: '1001',
    total_amount: 100,
    status: 1,
  });

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: { account_id: 'CASH', amount: 300, currency: 'AFN' },
  });

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: { account_id: 'CASH', amount: 200, currency: 'AFN' },
  });

  assert.equal(state.salePayments.length, 2);
  assert.equal(state.sales.get('1001').remaining, 400);
});

test('negative sale payment (refund) reverses the debit/credit sides', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const payment = await paymentPosting.postSalePaymentOnConnection(
    connection,
    {
      orgId: 42,
      userId: 7,
      requestContext: {},
      sale: state.sales.get('1001'),
      saleId: '1001',
      data: { account_id: 'CASH', amount: -250, currency: 'AFN' },
    },
  );

  const journals = activeSaleJournals();
  // SALES debited, RECEIVABLE credited
  assert.equal(Number(journals[0].first_entry_debit), 250);
  assert.equal(Number(journals[0].second_entry_credit), 250);
  // customer debited, treasury credited
  assert.equal(Number(journals[1].first_entry_debit), 250);
  assert.equal(Number(journals[1].second_entry_credit), 250);
  assert.equal(payment.amount, -250);
});

test('duplicate request_id returns the existing payment without posting again', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const first = await paymentPosting.postSalePaymentOnConnection(
    connection,
    {
      orgId: 42,
      userId: 7,
      requestContext: {},
      sale: state.sales.get('1001'),
      saleId: '1001',
      data: {
        account_id: 'CASH',
        amount: 500,
        currency: 'AFN',
        request_id: 'retry-abc',
      },
    },
  );

  const second = await paymentPosting.postSalePaymentOnConnection(
    connection,
    {
      orgId: 42,
      userId: 7,
      requestContext: {},
      sale: state.sales.get('1001'),
      saleId: '1001',
      data: {
        account_id: 'CASH',
        amount: 500,
        currency: 'AFN',
        request_id: 'retry-abc',
      },
    },
  );

  assert.equal(first.id, second.id);
  assert.equal(state.salePayments.length, 1);
  assert.equal(activeSaleJournals().length, 2);
});

test('journal-driven bill payment creates the payment row and no extra journals', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const payment = await paymentPosting.recordJournalBillPayment(connection, {
    orgId: 42,
    userId: 7,
    journal: {
      id: 'J-1',
      reference_type: 'sale',
      reference_id: '1001',
      currency: 'AFN',
      date: '2026-06-01',
      first_entry_credit: 300,
      first_entry_debit: 0,
      first_entry_account: 'CUST-1',
      second_entry_account: 'CASH',
    },
  });

  assert.ok(payment);
  assert.equal(payment.amount, 300);
  assert.equal(
    (payment.description || '').includes('journal:J-1'),
    true,
  );
  assert.equal(state.salePayments.length, 1);
  // the manual journal is the accounting entry; no sale_payment journals
  assert.equal(activeSaleJournals().length, 0);
  assert.equal(state.sales.get('1001').remaining, 700);
});

test('removing a journal-driven payment reverts the remaining', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const journal = {
    id: 'J-2',
    reference_type: 'sale',
    reference_id: '1001',
    currency: 'AFN',
    date: '2026-06-01',
    first_entry_credit: 250,
    first_entry_debit: 0,
    first_entry_account: 'CUST-1',
    second_entry_account: 'CASH',
  };

  await paymentPosting.recordJournalBillPayment(connection, {
    orgId: 42,
    userId: 7,
    journal,
  });

  assert.equal(state.sales.get('1001').remaining, 750);

  await paymentPosting.removeJournalBillPayment(connection, {
    orgId: 42,
    userId: 7,
    journal,
  });

  assert.equal(state.salePayments[0].status, 0);
  assert.equal(state.sales.get('1001').remaining, 1000);
});

/* ============================== PURCHASE ============================ */

test('purchase payment posts two balanced journals and recomputes remaining', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  const payment = await paymentPosting.postPurchasePaymentOnConnection(
    connection,
    {
      orgId: 42,
      userId: 7,
      requestContext: {},
      purchase: state.purchases.get('2001'),
      purchaseId: '2001',
      data: { account_id: 'BANK', amount: 800, currency: 'AFN' },
    },
  );

  assert.equal(state.purchasePayments.length, 1);

  const journals = activePurchaseJournals();
  assert.equal(journals.length, 2);

  for (const journal of journals) {
    const debit =
      Number(journal.first_entry_debit) + Number(journal.second_entry_debit);
    const credit =
      Number(journal.first_entry_credit) + Number(journal.second_entry_credit);
    assert.equal(debit, credit);
  }

  // PURCHASE debited, PAYABLE credited
  assert.equal(journals[0].first_entry_account, 'ACC-PURCHASE');
  assert.equal(Number(journals[0].first_entry_debit), 800);
  assert.equal(Number(journals[0].second_entry_credit), 800);

  // supplier debited, treasury credited
  assert.equal(journals[1].first_entry_account, 'SUP-1');
  assert.equal(Number(journals[1].first_entry_debit), 800);
  assert.equal(journals[1].second_entry_account, 'BANK');
  assert.equal(Number(journals[1].second_entry_credit), 800);

  assert.equal(payment.amount, 800);
  assert.equal(state.purchases.get('2001').remaining, 0);
});

test('partial purchase payment recomputes remaining', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  await paymentPosting.postPurchasePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    purchase: state.purchases.get('2001'),
    purchaseId: '2001',
    data: { account_id: 'BANK', amount: 300, currency: 'AFN' },
  });

  assert.equal(state.purchases.get('2001').remaining, 500);
});

/* ===================== GENERIC SERVICE DELEGATION =================== */

test('generic sale-payment endpoint posts a full payment through the shared service', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const payment = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 1000,
      currency: 'AFN',
    },
    requestContext: {},
  });

  assert.equal(state.salePayments.length, 1);
  assert.equal(activeSaleJournals().length, 2);
  assert.equal(state.sales.get('1001').remaining, 0);
  assert.equal(payment.id, state.salePayments[0].id);
  assert.equal(connection.committed, true);
});

test('generic sale-payment endpoint rejects a payment with no sale_id', async () => {
  await assert.rejects(
    () =>
      salePaymentService.createPayment({
        user: USER,
        data: { account_id: 'CASH', amount: 100, currency: 'AFN' },
        requestContext: {},
      }),
    (error) => error.code === 'SALE_ID_REQUIRED',
  );
});

test('generic sale payment is rejected across organizations', async () => {
  state.sales.set(
    '1001',
    activeConfirmedSale({ org_id: 99, total_amount: 1000 }),
  );

  await assert.rejects(
    () =>
      salePaymentService.createPayment({
        user: USER,
        data: {
          sale_id: '1001',
          account_id: 'CASH',
          amount: 100,
          currency: 'AFN',
        },
        requestContext: {},
      }),
    (error) => error.code === 'SALE_NOT_FOUND',
  );

  assert.equal(state.salePayments.length, 0);
});

test('generic purchase-payment endpoint posts a full payment through the shared service', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  const payment = await purchasePaymentService.createPayment({
    user: USER,
    data: {
      purchase_id: '2001',
      account_id: 'BANK',
      amount: 800,
      currency: 'AFN',
    },
    requestContext: {},
  });

  assert.equal(state.purchasePayments.length, 1);
  assert.equal(activePurchaseJournals().length, 2);
  assert.equal(state.purchases.get('2001').remaining, 0);
  assert.equal(payment.id, state.purchasePayments[0].id);
});

/* ============================ UPDATE / DELETE ======================= */

test('updating a payment reverses and reposts its journals and remaining', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const created = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 400,
      currency: 'AFN',
    },
    requestContext: {},
  });

  assert.equal(state.sales.get('1001').remaining, 600);

  await salePaymentService.updatePayment({
    user: USER,
    paymentId: created.id,
    data: { amount: 250 },
    requestContext: {},
  });

  // the two original journals are soft-deleted, two new active ones exist
  const active = activeSaleJournals();
  assert.equal(active.length, 2);
  assert.equal(state.journals.length, 4);
  assert.equal(
    state.journals.filter((j) => Number(j.status) === 0).length,
    2,
  );

  assert.equal(state.sales.get('1001').remaining, 750);
  assert.equal(state.salePayments[0].amount, 250);
});

test('deleting a payment soft-deletes the row and reverses its journals', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const created = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 500,
      currency: 'AFN',
    },
    requestContext: {},
  });

  assert.equal(state.sales.get('1001').remaining, 500);

  await salePaymentService.deletePayment({
    user: USER,
    paymentId: created.id,
    requestContext: {},
  });

  assert.equal(state.salePayments[0].status, 0);
  assert.equal(activeSaleJournals().length, 0);
  assert.equal(state.sales.get('1001').remaining, 1000);
});

/* ============================== FAILURES ============================ */

test('payment insert failure rolls back and does not commit', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  saleRepository.createPayment = async () => {
    throw new Error('insert failed');
  };

  await assert.rejects(() =>
    salePaymentService.createPayment({
      user: USER,
      data: {
        sale_id: '1001',
        account_id: 'CASH',
        amount: 100,
        currency: 'AFN',
      },
      requestContext: {},
    }),
  );

  assert.equal(connection.rolledBack, true);
  assert.equal(connection.committed, false);
});

test('journal insert failure rolls back the whole payment', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  journalRepository.create = async () => {
    throw new Error('journal insert failed');
  };

  await assert.rejects(() =>
    salePaymentService.createPayment({
      user: USER,
      data: {
        sale_id: '1001',
        account_id: 'CASH',
        amount: 100,
        currency: 'AFN',
      },
      requestContext: {},
    }),
  );

  assert.equal(connection.rolledBack, true);
  assert.equal(connection.committed, false);
});

test('missing SALES account aborts the payment', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  saleRepository.findAccountByCode = async (conn, { code }) =>
    code === 'SALES' ? null : ACCOUNTS[code] || null;

  await assert.rejects(
    () =>
      salePaymentService.createPayment({
        user: USER,
        data: {
          sale_id: '1001',
          account_id: 'CASH',
          amount: 100,
          currency: 'AFN',
        },
        requestContext: {},
      }),
    (error) => error.code === 'SALES_ACCOUNT_NOT_FOUND',
  );
});
