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

const {
  localDateOnly,
} = require('../utils/accountingDate');

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

/* ========================= ACCOUNTING DATE ========================== */
/*
 * Step 3.5. A payment's journals are dated from the payment's own
 * accounting date, never from the moment the posting ran. Posting time and
 * accounting time are different concepts, and only the second one decides
 * which fiscal year a payment belongs to.
 */

function journalDates(journals) {
  return journals.map((journal) => journal.date);
}

function assertJournalsDated(journals, expected) {
  assert.equal(journals.length, 2);

  for (const journal of journals) {
    assert.equal(
      journal.date,
      expected,
      `journal should be dated ${expected}, got ${journal.date}`,
    );
  }
}

test('a sale payment journal is dated from payment_date, not posting time', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: {
      account_id: 'CASH',
      amount: 1000,
      currency: 'AFN',
      payment_date: '2026-03-04',
    },
  });

  assertJournalsDated(activeSaleJournals(), '2026-03-04');

  /* the payment row and its journals agree on the accounting date */
  assert.equal(state.salePayments[0].payment_date, '2026-03-04');
});

test('a purchase payment journal is dated from payment_date, not posting time', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  await paymentPosting.postPurchasePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    purchase: state.purchases.get('2001'),
    purchaseId: '2001',
    data: {
      account_id: 'BANK',
      amount: 800,
      currency: 'AFN',
      payment_date: '2026-11-19',
    },
  });

  assertJournalsDated(activePurchaseJournals(), '2026-11-19');
  assert.equal(state.purchasePayments[0].payment_date, '2026-11-19');
});

test('a December payment entered after year end stays in December', async () => {
  /*
   * The scenario this protects: the book closes on 31 Dec, the payment is
   * keyed in a few days later, and the user expects it to belong to the
   * December they are paying off — not to the new year.
   */
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: {
      account_id: 'CASH',
      amount: 1000,
      currency: 'AFN',
      payment_date: '2026-12-31',
    },
  });

  const journals = activeSaleJournals();

  assertJournalsDated(journals, '2026-12-31');

  /*
   * The fiscal-year window is [start, end] inclusive via a half-open
   * comparison, so 31 Dec belongs to the year that ends that day and never
   * bleeds into the next one.
   */
  const inFy2026 =
    journals[0].date >= '2026-01-01' && journals[0].date <= '2026-12-31';
  const inFy2027 =
    journals[0].date >= '2027-01-01' && journals[0].date <= '2027-12-31';

  assert.equal(inFy2026, true);
  assert.equal(inFy2027, false);
});

test('posting time never leaks into the journal date', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const before = new Date();

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: {
      account_id: 'CASH',
      amount: 500,
      currency: 'AFN',
      payment_date: '2025-01-15',
    },
  });

  const journals = activeSaleJournals();

  assertJournalsDated(journals, '2025-01-15');

  /* the journal is dated well before the posting ran */
  for (const journal of journals) {
    assert.ok(
      new Date(journal.date) < before,
      'the journal must not carry the posting timestamp',
    );
  }
});

test('a payment with no date falls back to the local calendar day', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  await paymentPosting.postSalePaymentOnConnection(connection, {
    orgId: 42,
    userId: 7,
    requestContext: {},
    sale: state.sales.get('1001'),
    saleId: '1001',
    data: { account_id: 'CASH', amount: 1000, currency: 'AFN' },
  });

  const expected = localDateOnly(new Date());

  assertJournalsDated(activeSaleJournals(), expected);
});

test('the generic sale-payment endpoint dates the journal from payment_date', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 1000,
      currency: 'AFN',
      payment_date: '2026-02-09',
    },
    requestContext: {},
  });

  assertJournalsDated(activeSaleJournals(), '2026-02-09');
});

test('the generic purchase-payment endpoint dates the journal from payment_date', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  await purchasePaymentService.createPayment({
    user: USER,
    data: {
      purchase_id: '2001',
      account_id: 'BANK',
      amount: 800,
      currency: 'AFN',
      payment_date: '2026-08-21',
    },
    requestContext: {},
  });

  assertJournalsDated(activePurchaseJournals(), '2026-08-21');
});

test('editing payment_date reposts the journals with the corrected date', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const created = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 400,
      currency: 'AFN',
      payment_date: '2026-01-05',
    },
    requestContext: {},
  });

  assertJournalsDated(activeSaleJournals(), '2026-01-05');

  await salePaymentService.updatePayment({
    user: USER,
    paymentId: created.id,
    data: { payment_date: '2025-12-31' },
    requestContext: {},
  });

  /*
   * The reversal is a soft delete of the original journals, so exactly two
   * active journals remain — reposted with the corrected accounting date.
   */
  const active = activeSaleJournals();

  assertJournalsDated(active, '2025-12-31');
  assert.equal(
    state.journals.filter((journal) => Number(journal.status) === 0).length,
    2,
  );
});

test('a reversal does not invent a today-dated journal', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const created = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 400,
      currency: 'AFN',
      payment_date: '2025-12-31',
    },
    requestContext: {},
  });

  await salePaymentService.deletePayment({
    user: USER,
    paymentId: created.id,
    requestContext: {},
  });

  /* no new journal at all — the original two are simply reversed */
  assert.equal(state.journals.length, 2);
  assert.equal(activeSaleJournals().length, 0);
  assert.deepEqual(
    journalDates(state.journals).sort(),
    ['2025-12-31', '2025-12-31'],
  );
});

test('editing a payment without a date preserves the stored date', async () => {
  /*
   * Step 3.6. An edit that does not speak about the accounting date must not
   * move it: the payment keeps the day it was posted on, and the reposted
   * journal keeps that day too.
   */
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const created = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 400,
      currency: 'AFN',
      payment_date: '2026-12-31',
    },
    requestContext: {},
  });

  await salePaymentService.updatePayment({
    user: USER,
    paymentId: created.id,
    data: { amount: 250 },
    requestContext: {},
  });

  assert.equal(state.salePayments[0].payment_date, '2026-12-31');
  assert.equal(state.salePayments[0].amount, 250);
  assertJournalsDated(activeSaleJournals(), '2026-12-31');
});

test('editing a payment with an empty date does not wipe the stored date', async () => {
  state.purchases.set('2001', activeConfirmedPurchase({ total_amount: 800 }));

  const created = await purchasePaymentService.createPayment({
    user: USER,
    data: {
      purchase_id: '2001',
      account_id: 'BANK',
      amount: 300,
      currency: 'AFN',
      payment_date: '2026-06-15',
    },
    requestContext: {},
  });

  await purchasePaymentService.updatePayment({
    user: USER,
    paymentId: created.id,
    data: { amount: 350 },
    requestContext: {},
  });

  assert.equal(state.purchasePayments[0].payment_date, '2026-06-15');
  assertJournalsDated(activePurchaseJournals(), '2026-06-15');
});

test('a payment date chosen for the previous year survives the round trip', async () => {
  /*
   * The user pays a December bill in January. The payment must stay in
   * December — payment row, journals, and therefore fiscal year.
   */
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const payment = await salePaymentService.createPayment({
    user: USER,
    data: {
      sale_id: '1001',
      account_id: 'CASH',
      amount: 1000,
      currency: 'AFN',
      payment_date: '2026-12-31',
    },
    requestContext: {},
  });

  assert.equal(payment.payment_date, '2026-12-31');
  assertJournalsDated(activeSaleJournals(), '2026-12-31');

  const journalDates = activeSaleJournals().map((journal) => journal.date);
  const inFy2026 = journalDates.every(
    (date) => date >= '2026-01-01' && date <= '2026-12-31',
  );
  const inFy2027 = journalDates.some(
    (date) => date >= '2027-01-01' && date <= '2027-12-31',
  );

  assert.equal(inFy2026, true);
  assert.equal(inFy2027, false);
});

test('a journal-driven shadow payment keeps the manual journal date', async () => {
  state.sales.set('1001', activeConfirmedSale({ total_amount: 1000 }));

  const journal = {
    id: 'J-1',
    org_id: 42,
    reference_type: 'sale',
    reference_id: '1001',
    date: '2026-12-31',
    currency: 'AFN',
    first_entry_account: 'CASH',
    first_entry_debit: 0,
    first_entry_credit: 1000,
    second_entry_account: 'ACC-RECV',
    second_entry_debit: 1000,
    second_entry_credit: 0,
  };

  const payment = await paymentPosting.recordJournalBillPayment(
    connection,
    { orgId: 42, userId: 7, journal },
  );

  assert.equal(payment.payment_date, '2026-12-31');

  /* the manual journal already IS the accounting entry — no extra journals */
  assert.equal(state.journals.length, 0);
});
