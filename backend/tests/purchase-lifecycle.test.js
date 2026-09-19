/*
 * purchase-lifecycle.test.js
 *
 * Step 2.6 tests. These run entirely against repository stubs and a fake
 * connection — there is NO database connection, so real production data
 * is never touched.
 *
 * They prove that the purchase lifecycle is backend-authoritative:
 *
 *   PUT  /purchases/:id  { bill_status: 'draft' }
 *   DELETE /purchases/:id
 *
 * each reverse the WHOLE document (returns, payments + their journals,
 * product/warehouse stock, FIFO/LIFO layers, stock movements and the
 * posted purchase journal) in ONE transaction, that a rejected reversal
 * leaves the database untouched, and that the frontend no longer
 * orchestrates any of it.
 */

process.env.DB_HOST = 'purchase-lifecycle-test-host';
process.env.DB_USER = 'purchase-lifecycle-test-user';
process.env.DB_PASSWORD = 'purchase-lifecycle-test-password';
process.env.DB_NAME = 'purchase-lifecycle-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const pool = require('../database/pool');

const purchaseRepository =
  require('../repositories/purchase.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const batchLedger =
  require('../services/batch-ledger.service');

const productRepository =
  require('../repositories/product.repository');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const purchaseService =
  require('../services/purchase.service');

const {
  localDateOnly,
} = require('../utils/accountingDate');

const AppError = require('../errors/AppError');

const USER = { org_id: 42, local_id: 7 };

/* Unit 1 is the product base unit; 1 carton (unit 2) = 12 base units. */
const BASE_UNIT_ID = 1;
const CARTON_UNIT_ID = 2;

const PIECE_UNIT = {
  id: BASE_UNIT_ID,
  name: 'piece',
  subunit_id: null,
  subunit_multiple: null,
};

const CARTON_UNIT = {
  id: CARTON_UNIT_ID,
  name: 'carton',
  subunit_id: BASE_UNIT_ID,
  subunit_multiple: 12,
};
const OTHER_ORG_USER = { org_id: 99, local_id: 7 };

const REQUEST_CONTEXT = {
  ipAddress: '127.0.0.1',
  sessionId: 'test-session',
  deviceInfo: 'node:test',
};

let state;
let connection;

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
      if (conn.snapshot) {
        state = conn.snapshot;
      }
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

function failIf(step) {
  if (state.failAt === step) {
    throw new Error(`injected failure at ${step}`);
  }
}

function productQty(productId) {
  return state.productQty[String(productId)] || 0;
}

function warehouseQty(productId, warehouseId = 1) {
  return state.warehouseQty[`${warehouseId}:${productId}`] || 0;
}

function addProductQty(productId, delta) {
  const key = String(productId);
  state.productQty[key] = (state.productQty[key] || 0) + Number(delta);
}

function addWarehouseQty(productId, delta, warehouseId = 1) {
  const key = `${warehouseId}:${productId}`;
  state.warehouseQty[key] = (state.warehouseQty[key] || 0) + Number(delta);
}

/*
 * Seeds a confirmed purchase that has already been received.
 *
 *   quantity = 10, one payment of 300, one return of 2
 *
 * Stock therefore currently sits at purchased - returned = 8 for a
 * purchase that has a return, and at 10 when it has none.
 */
function installStubs({
  billStatus = 'confirmed',
  withPayment = true,
  withReturn = false,
  stock = 10,
  method = 'CLASSIC',
  itemUnitId = BASE_UNIT_ID,
  itemQuantity = 10,
  returnItemQuantity = 2,
} = {}) {
  state = {
    method,
    stockConsumed: false,
    failAt: null,
    purchase: {
      id: '2001',
      local_id: '2001',
      org_id: 42,
      status: 1,
      bill_status: billStatus,
      bill_number: 'B-2001',
      total_amount: 800,
      remaining: 800,
      currency: 'AFN',
      account_id: 'SUP-1',
      warehouse_id: 1,
      bill_date: '2026-01-01',
    },
    items: [
      {
        id: 'ITEM-1',
        local_id: 'ITEM-1',
        org_id: 42,
        purchase_id: '2001',
        product_id: 10,
        product_unit_id: itemUnitId,
        quantity: itemQuantity,
        unit_price: 80,
        subtotal: 800,
        status: 1,
      },
    ],
    payments: withPayment
      ? [
          {
            id: 'PAY-1',
            local_id: 'PAY-1',
            org_id: 42,
            purchase_id: '2001',
            amount: 300,
            currency: 'AFN',
            status: 1,
          },
        ]
      : [],
    returns: withReturn
      ? [
          {
            id: 'RET-1',
            local_id: 'RET-1',
            org_id: 42,
            purchase_id: '2001',
            total_amount: 160,
            warehouse_id: 1,
            status: 1,
          },
        ]
      : [],
    returnItems: withReturn
      ? [
          {
            id: 'RET-ITEM-1',
            local_id: 'RET-ITEM-1',
            org_id: 42,
            return_id: 'RET-1',
            product_id: 10,
            product_unit_id: itemUnitId,
            quantity: returnItemQuantity,
            unit_price: 80,
            subtotal: 160,
            status: 1,
          },
        ]
      : [],
    journals: [
      {
        id: 'JRN-PURCHASE',
        org_id: 42,
        reference_id: '2001',
        reference_type: 'purchase',
        status: 1,
      },
      ...(withPayment
        ? [
            {
              id: 'JRN-PAYMENT',
              org_id: 42,
              reference_id: 'PAY-1',
              reference_type: 'purchase_payment',
              status: 1,
            },
          ]
        : []),
      ...(withReturn
        ? [
            {
              id: 'JRN-RETURN',
              org_id: 42,
              reference_id: 'RET-1',
              reference_type: 'purchase_return',
              status: 1,
            },
          ]
        : []),
    ],
    /* purchase layers a FIFO/LIFO organization would have created */
    batches: [
      {
        local_id: 'BATCH-1',
        org_id: 42,
        product_id: 10,
        warehouse_id: 1,
        quantity_in: 10,
        quantity_remaining: withReturn ? 8 : 10,
        source_type: 'purchase',
        source_id: '2001',
        status: 1,
      },
    ],
    movements: [],
    activity: [],
    productQty: {},
    warehouseQty: {},
    assertCalls: 0,
    revertBatchCalls: 0,
    revertReturnBatchCalls: 0,
    purchaseBatchCalls: 0,
    purchaseBatchItems: null,
  };

  addProductQty(10, stock);
  addWarehouseQty(10, stock);

  connection = createConnection();

  const scoped = (row, orgId) =>
    row && Number(row.org_id) === Number(orgId) ? row : null;

  /* ---------------------- purchase repository ----------------------- */
  /*
   * A fresh row object every call, exactly like mysql2: the service must
   * never be able to see the effects of a write through the object it
   * read before the write.
   */
  purchaseRepository.findByLocalId = async (conn, { orgId, localId }) => {
    if (String(localId) !== '2001') return null;
    const row = scoped(state.purchase, orgId);
    return row ? { ...row } : null;
  };

  purchaseRepository.findItemsByPurchase = async (
    conn,
    { orgId, includeDeleted = false },
  ) =>
    state.items.filter(
      (item) =>
        Number(item.org_id) === Number(orgId) &&
        (includeDeleted || Number(item.status) === 1),
    );

  purchaseRepository.update = async (
    conn,
    { orgId, localId, data },
  ) => {
    failIf('purchase.update');
    assert.equal(Number(orgId), 42);
    Object.assign(state.purchase, data);
    return { ...state.purchase };
  };

  purchaseRepository.adjustProductQuantity = async (
    conn,
    { orgId, productId, delta },
  ) => {
    failIf('adjustProductQuantity');
    assert.equal(Number(orgId), 42);
    addProductQty(productId, delta);
    return productQty(productId);
  };

  purchaseRepository.softDelete = async (conn, { orgId }) => {
    failIf('purchase.softDelete');
    assert.equal(Number(orgId), 42);
    state.purchase.status = 0;
    return { ...state.purchase };
  };

  purchaseRepository.createReturn = async (conn, { localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: 42,
    status: 1,
    ...data,
  });

  purchaseRepository.createReturnItem = async (conn, { localId, data }) => {
    const item = {
      id: localId,
      local_id: localId,
      org_id: 42,
      status: 1,
      ...data,
    };
    state.returnItems.push(item);
    return item;
  };

  purchaseRepository.createItem = async (conn, { localId, data }) => {
    const item = {
      id: localId,
      local_id: localId,
      org_id: 42,
      status: 1,
      ...data,
    };
    state.items.push(item);
    return item;
  };

  purchaseRepository.updateProductPrices = async () => {};

  purchaseRepository.softDeleteItemsByPurchase = async (conn, { orgId }) => {
    assert.equal(Number(orgId), 42);
    state.items.forEach((item) => {
      item.status = 0;
    });
  };

  purchaseRepository.findPaymentsByPurchase = async (
    conn,
    { orgId, includeDeleted = false },
  ) =>
    state.payments.filter(
      (payment) =>
        Number(payment.org_id) === Number(orgId) &&
        (includeDeleted || Number(payment.status) === 1),
    );

  purchaseRepository.softDeletePayment = async (
    conn,
    { orgId, localId },
  ) => {
    failIf('purchase.softDeletePayment');
    assert.equal(Number(orgId), 42);
    const payment = state.payments.find(
      (row) => String(row.id) === String(localId),
    );
    if (payment) payment.status = 0;
    return payment ? { ...payment } : null;
  };

  purchaseRepository.findReturnsByPurchase = async (
    conn,
    { orgId, includeDeleted = false },
  ) =>
    state.returns.filter(
      (row) =>
        Number(row.org_id) === Number(orgId) &&
        (includeDeleted || Number(row.status) === 1),
    );

  purchaseRepository.findReturnItemsByReturn = async (
    conn,
    { orgId, includeDeleted = false },
  ) =>
    state.returnItems.filter(
      (item) =>
        Number(item.org_id) === Number(orgId) &&
        (includeDeleted || Number(item.status) === 1),
    );

  purchaseRepository.softDeleteReturn = async (conn, { orgId, localId }) => {
    assert.equal(Number(orgId), 42);
    const row = state.returns.find((r) => String(r.id) === String(localId));
    if (row) row.status = 0;
    return row ? { ...row } : null;
  };

  purchaseRepository.softDeleteReturnItemsByReturn = async (
    conn,
    { orgId },
  ) => {
    assert.equal(Number(orgId), 42);
    state.returnItems.forEach((item) => {
      item.status = 0;
    });
  };

  purchaseRepository.findAccountByCode = async () => ({
    id: 'ACC-PAYABLE',
    code: 'PAYABLE',
  });

  journalRepository.create = async (conn, { localId, data }) => {
    const journal = {
      id: localId,
      local_id: localId,
      ...data,
    };

    state.journals.push(journal);

    return journal;
  };

  /*
   * Unit conversion: product 10 has base unit 1, and one carton is 12
   * base units, so a line entered in cartons really does convert.
   */
  productRepository.findByLocalId = async (conn, { localId }) => {
    const id = Number(localId);

    if (id !== 10 && id !== 20) return null;

    return {
      id: String(id),
      local_id: String(id),
      product_unit_id: BASE_UNIT_ID,
      /* product 20 is a service: it holds no inventory. */
      type: id === 20 ? 'service' : 'stock',
    };
  };

  productUnitRepository.findAll = async () => [PIECE_UNIT, CARTON_UNIT];

  /* ------------------- warehouse / stock / journal ------------------ */
  warehouseProductRepository.adjustQuantity = async (
    conn,
    { orgId, warehouseId, productId, delta },
  ) => {
    failIf('adjustQuantity');
    assert.equal(Number(orgId), 42);
    addWarehouseQty(productId, delta, warehouseId);
    return warehouseQty(productId, warehouseId);
  };

  stockTransactionRepository.recordMovement = async (conn, { orgId, data }) => {
    failIf('recordMovement');
    assert.equal(Number(orgId), 42);
    state.movements.push({ ...data });
    return { id: `MOV-${state.movements.length}`, ...data };
  };

  journalRepository.softDeleteByReference = async (
    conn,
    { orgId, referenceId, referenceType },
  ) => {
    assert.equal(Number(orgId), 42);
    let deleted = 0;
    state.journals.forEach((journal) => {
      if (
        String(journal.reference_id) === String(referenceId) &&
        journal.reference_type === referenceType &&
        Number(journal.status) === 1
      ) {
        journal.status = 0;
        deleted += 1;
      }
    });
    return deleted;
  };

  journalRepository.findAll = async () => ({ data: [], total: 0 });

  activityRepository.create = async (conn, { tableName, action }) => {
    state.activity.push({ tableName, action });
    return { id: `ACT-${state.activity.length}` };
  };

  /* --------------------------- batch ledger ------------------------- */
  batchLedger.createPurchaseBatches = async (conn, args) => {
    state.purchaseBatchCalls += 1;
    state.purchaseBatchItems = args.items;
  };

  batchLedger.assertPurchaseReversible = async (conn, { orgId }) => {
    assert.equal(Number(orgId), 42);
    state.assertCalls += 1;

    if (state.stockConsumed) {
      throw new AppError(
        'Cannot reverse this purchase: its stock has already been consumed by later sales, transfers or waste.',
        409,
        'PURCHASE_STOCK_ALREADY_CONSUMED',
      );
    }
  };

  batchLedger.revertPurchaseBatches = async (conn, { orgId }) => {
    failIf('revertPurchaseBatches');
    assert.equal(Number(orgId), 42);
    state.revertBatchCalls += 1;
    state.batches.forEach((batch) => {
      batch.quantity_remaining = 0;
      batch.status = 0;
    });
  };

  batchLedger.revertPurchaseReturnBatches = async (conn, { orgId }) => {
    assert.equal(Number(orgId), 42);
    state.revertReturnBatchCalls += 1;
    state.batches.forEach((batch) => {
      batch.quantity_remaining += 2;
    });
  };

  pool.getConnection = async () => connection;
}

beforeEach(() => {
  installStubs();
});

function draftPurchase({ user = USER, data = { bill_status: 'draft' } } = {}) {
  return purchaseService.updatePurchase({
    user,
    purchaseId: '2001',
    data,
    requestContext: REQUEST_CONTEXT,
  });
}

function removePurchase({ user = USER } = {}) {
  return purchaseService.deletePurchase({
    user,
    purchaseId: '2001',
    requestContext: REQUEST_CONTEXT,
  });
}

/* =================================================================== */
/* confirmed purchase -> draft                                          */
/* =================================================================== */

test('confirmed CLASSIC purchase -> draft reverses product and warehouse stock', async () => {
  await draftPurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  assert.equal(state.purchase.bill_status, 'draft');
  assert.equal(connection.committed, true);
  assert.equal(connection.rolledBack, false);
  assert.equal(connection.released, true);
});

test('confirmed purchase -> draft records one compensating stock movement', async () => {
  await draftPurchase();

  const reverts = state.movements.filter(
    (movement) => movement.transaction_type === 'purchase_revert',
  );

  assert.equal(reverts.length, 1);
  assert.equal(reverts[0].quantity, -10);
  assert.equal(reverts[0].reference_id, '2001');
  assert.equal(reverts[0].reference_type, 'purchase');
});

test('confirmed FIFO purchase -> draft reverses the purchase batch layer', async () => {
  installStubs({ method: 'FIFO' });

  await draftPurchase();

  assert.equal(state.assertCalls, 1);
  assert.equal(state.revertBatchCalls, 1);
  assert.equal(state.batches[0].quantity_remaining, 0);
  assert.equal(state.batches[0].status, 0);
});

test('confirmed LIFO purchase -> draft reverses the purchase batch layer', async () => {
  installStubs({ method: 'LIFO' });

  await draftPurchase();

  assert.equal(state.assertCalls, 1);
  assert.equal(state.revertBatchCalls, 1);
  assert.equal(state.batches[0].quantity_remaining, 0);
  assert.equal(state.batches[0].status, 0);
});

test('purchase with a return leaves the pre-purchase stock level after drafting', async () => {
  /* purchase +10, return -2 => current stock is 8 */
  installStubs({ withReturn: true, stock: 8 });

  await draftPurchase();

  /* return reverted (+2), purchase reverted (-10) => back to zero */
  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  assert.equal(state.returns[0].status, 0);
  assert.equal(state.returnItems[0].status, 0);
  assert.equal(state.revertReturnBatchCalls, 1);
  assert.equal(state.revertBatchCalls, 1);
});

test('confirmed purchase -> draft removes payments through the authoritative payment service', async () => {
  await draftPurchase();

  assert.equal(state.payments[0].status, 0);
  /* remaining = total - active payments - active returns */
  assert.equal(Number(state.purchase.remaining), 800);
});

test('confirmed purchase -> draft soft-deletes the payment, return and purchase journals', async () => {
  installStubs({ withReturn: true, stock: 8 });

  await draftPurchase();

  const byId = (id) => state.journals.find((journal) => journal.id === id);

  assert.equal(byId('JRN-PURCHASE').status, 0);
  assert.equal(byId('JRN-PAYMENT').status, 0);
  assert.equal(byId('JRN-RETURN').status, 0);
});

test('repeated draft request does not reverse the inventory twice', async () => {
  await draftPurchase();

  const stockAfterFirst = productQty(10);
  const movementsAfterFirst = state.movements.length;

  await draftPurchase();

  assert.equal(productQty(10), stockAfterFirst);
  assert.equal(state.movements.length, movementsAfterFirst);
  assert.equal(state.revertBatchCalls, 1);
});

test('drafting an already draft purchase leaves stock and stock movements alone', async () => {
  installStubs({ billStatus: 'draft', withPayment: false, stock: 0 });

  await draftPurchase();

  assert.equal(productQty(10), 0);
  assert.equal(state.movements.length, 0);
  assert.equal(state.revertBatchCalls, 0);
  assert.equal(state.purchase.bill_status, 'draft');
});

/* =================================================================== */
/* rejected reversals                                                  */
/* =================================================================== */

test('consumed FIFO purchase cannot be drafted', async () => {
  installStubs({ method: 'FIFO', withReturn: true, stock: 8 });
  state.stockConsumed = true;

  await assert.rejects(
    () => draftPurchase(),
    (error) =>
      error.code === 'PURCHASE_STOCK_ALREADY_CONSUMED' &&
      error.statusCode === 409,
  );
});

test('consumed LIFO purchase cannot be drafted', async () => {
  installStubs({ method: 'LIFO', withPayment: false, stock: 10 });
  state.stockConsumed = true;

  await assert.rejects(
    () => draftPurchase(),
    (error) => error.code === 'PURCHASE_STOCK_ALREADY_CONSUMED',
  );
});

test('a rejected draft leaves the purchase, stock, batches, payments, returns, journals and movements untouched', async () => {
  installStubs({ method: 'FIFO', withReturn: true, stock: 8 });
  state.stockConsumed = true;

  const before = {
    product: productQty(10),
    warehouse: warehouseQty(10),
    batchRemaining: state.batches[0].quantity_remaining,
    batchStatus: state.batches[0].status,
    paymentStatus: state.payments[0].status,
    returnStatus: state.returns[0].status,
    journalStatuses: state.journals.map((journal) => journal.status),
    movements: state.movements.length,
    remaining: state.purchase.remaining,
  };

  await assert.rejects(() => draftPurchase());

  assert.equal(state.purchase.bill_status, 'confirmed');
  assert.equal(state.purchase.status, 1);
  assert.equal(productQty(10), before.product);
  assert.equal(warehouseQty(10), before.warehouse);
  assert.equal(state.batches[0].quantity_remaining, before.batchRemaining);
  assert.equal(state.batches[0].status, before.batchStatus);
  assert.equal(state.payments[0].status, before.paymentStatus);
  assert.equal(state.returns[0].status, before.returnStatus);
  assert.deepEqual(
    state.journals.map((journal) => journal.status),
    before.journalStatuses,
  );
  assert.equal(state.movements.length, before.movements);
  assert.equal(Number(state.purchase.remaining), Number(before.remaining));
  assert.equal(state.revertBatchCalls, 0);
  assert.equal(state.revertReturnBatchCalls, 0);
  assert.equal(connection.rolledBack, true);
  assert.equal(connection.committed, false);
});

test('a failure while reverting the purchase rolls the whole transaction back', async () => {
  installStubs({ method: 'FIFO', withReturn: true, stock: 8 });
  state.failAt = 'revertPurchaseBatches';

  const before = {
    product: productQty(10),
    warehouse: warehouseQty(10),
    paymentStatus: state.payments[0].status,
    returnStatus: state.returns[0].status,
    journalStatuses: state.journals.map((journal) => journal.status),
    movements: state.movements.length,
  };

  await assert.rejects(() => draftPurchase(), /injected failure/);

  assert.equal(state.purchase.bill_status, 'confirmed');
  assert.equal(productQty(10), before.product);
  assert.equal(warehouseQty(10), before.warehouse);
  assert.equal(state.payments[0].status, before.paymentStatus);
  assert.equal(state.returns[0].status, before.returnStatus);
  assert.deepEqual(
    state.journals.map((journal) => journal.status),
    before.journalStatuses,
  );
  assert.equal(state.movements.length, before.movements);
  assert.equal(connection.rolledBack, true);
});

test('a failure while soft-deleting payments rolls the whole transaction back', async () => {
  installStubs({ method: 'FIFO', stock: 10 });
  state.failAt = 'purchase.softDeletePayment';

  await assert.rejects(() => draftPurchase(), /injected failure/);

  assert.equal(state.purchase.bill_status, 'confirmed');
  assert.equal(productQty(10), 10);
  assert.equal(state.payments[0].status, 1);
  assert.equal(connection.rolledBack, true);
});

test('cross-org draft request is rejected and never touches another organization', async () => {
  await assert.rejects(
    () => draftPurchase({ user: OTHER_ORG_USER }),
    (error) =>
      error.code === 'PURCHASE_NOT_FOUND' && error.statusCode === 404,
  );

  assert.equal(state.purchase.bill_status, 'confirmed');
  assert.equal(productQty(10), 10);
  assert.equal(state.movements.length, 0);
});

/* =================================================================== */
/* purchase delete                                                      */
/* =================================================================== */

test('confirmed purchase delete follows the same safety rule when stock was consumed', async () => {
  installStubs({ method: 'FIFO', withReturn: true, stock: 8 });
  state.stockConsumed = true;

  await assert.rejects(
    () => removePurchase(),
    (error) => error.code === 'PURCHASE_STOCK_ALREADY_CONSUMED',
  );

  assert.equal(state.purchase.status, 1);
  assert.equal(productQty(10), 8);
  assert.equal(state.movements.length, 0);
  assert.equal(connection.rolledBack, true);
});

test('confirmed purchase delete reverses stock, batches, payments, returns and journals', async () => {
  installStubs({ method: 'FIFO', withReturn: true, stock: 8 });

  await removePurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  assert.equal(state.purchase.status, 0);
  assert.equal(state.items[0].status, 0);
  assert.equal(state.payments[0].status, 0);
  assert.equal(state.returns[0].status, 0);
  assert.equal(state.revertBatchCalls, 1);
  assert.equal(state.revertReturnBatchCalls, 1);
  assert.equal(
    state.journals.every((journal) => Number(journal.status) === 0),
    true,
  );
  assert.ok(
    state.movements.some(
      (movement) => movement.transaction_type === 'purchase_revert',
    ),
  );
  assert.equal(connection.committed, true);
});

test('repeated delete cannot reverse the purchase twice', async () => {
  installStubs({ method: 'FIFO', stock: 10 });

  await removePurchase();
  const afterFirst = productQty(10);
  const movementsAfterFirst = state.movements.length;

  await assert.rejects(
    () => removePurchase(),
    (error) => error.code === 'PURCHASE_ALREADY_DELETED',
  );

  assert.equal(productQty(10), afterFirst);
  assert.equal(state.movements.length, movementsAfterFirst);
  assert.equal(state.revertBatchCalls, 1);
});

test('deleting a draft purchase does not change stock', async () => {
  installStubs({ billStatus: 'draft', withPayment: false, stock: 0 });

  await removePurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  assert.equal(
    state.movements.filter(
      (movement) => movement.transaction_type === 'purchase_revert',
    ).length,
    0,
  );
  assert.equal(state.purchase.status, 0);
});

/* =================================================================== */
/* unit integrity (Step 2.7)                                            */
/* =================================================================== */

test('confirming a purchase entered in cartons adds the converted base quantity', async () => {
  installStubs({
    billStatus: 'draft',
    withPayment: false,
    stock: 0,
    itemUnitId: CARTON_UNIT_ID,
    itemQuantity: 10,
  });

  await purchaseService.updatePurchase({
    user: USER,
    purchaseId: '2001',
    data: {
      bill_status: 'confirmed',
      warehouse_id: 1,
      items: [
        {
          product_id: 10,
          product_unit_id: CARTON_UNIT_ID,
          quantity: 10,
          unit_price: 80,
          subtotal: 800,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  /* 10 cartons x 12 base units */
  assert.equal(productQty(10), 120);
  assert.equal(warehouseQty(10), 120);
  assert.equal(state.purchaseBatchCalls, 1);
  assert.equal(state.purchaseBatchItems[0].product_unit_id, CARTON_UNIT_ID);
});

test('a purchase in the base unit is stored without any conversion', async () => {
  installStubs({
    billStatus: 'draft',
    withPayment: false,
    stock: 0,
    itemUnitId: BASE_UNIT_ID,
    itemQuantity: 10,
  });

  await purchaseService.updatePurchase({
    user: USER,
    purchaseId: '2001',
    data: {
      bill_status: 'confirmed',
      warehouse_id: 1,
      items: [
        {
          product_id: 10,
          product_unit_id: BASE_UNIT_ID,
          quantity: 10,
          unit_price: 80,
          subtotal: 800,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(10), 10);
  assert.equal(warehouseQty(10), 10);
});

test('drafting a purchase entered in cartons reverses the exact base quantity', async () => {
  installStubs({
    withPayment: false,
    stock: 120,
    itemUnitId: CARTON_UNIT_ID,
    itemQuantity: 10,
  });

  await draftPurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
});

test('deleting a purchase entered in cartons reverses the exact base quantity', async () => {
  installStubs({
    withPayment: false,
    stock: 120,
    itemUnitId: CARTON_UNIT_ID,
    itemQuantity: 10,
  });

  await removePurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
});

test('a carton purchase with a carton return still nets to the pre-purchase stock', async () => {
  /* 10 cartons received, 2 cartons returned => 96 base units on hand */
  installStubs({
    withPayment: false,
    withReturn: true,
    stock: 96,
    itemUnitId: CARTON_UNIT_ID,
    itemQuantity: 10,
    returnItemQuantity: 2,
  });

  await draftPurchase();

  /* return reverted (+24) and purchase reverted (-120) */
  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  assert.equal(state.revertReturnBatchCalls, 1);
  assert.equal(state.revertBatchCalls, 1);
});

/* =================================================================== */
/* service lines hold no inventory (Step 2.8)                           */
/* =================================================================== */

const SERVICE_PRODUCT_ID = 20;

function mixedItems() {
  return [
    {
      product_id: 10,
      product_unit_id: BASE_UNIT_ID,
      quantity: 10,
      unit_price: 80,
      subtotal: 800,
    },
    {
      product_id: SERVICE_PRODUCT_ID,
      product_unit_id: BASE_UNIT_ID,
      quantity: 3,
      unit_price: 100,
      subtotal: 300,
    },
  ];
}

async function confirmMixedPurchase() {
  return purchaseService.updatePurchase({
    user: USER,
    purchaseId: '2001',
    data: {
      bill_status: 'confirmed',
      warehouse_id: 1,
      items: mixedItems(),
    },
    requestContext: REQUEST_CONTEXT,
  });
}

test('a purchase with a service line moves only the physical line', async () => {
  installStubs({
    billStatus: 'draft',
    withPayment: false,
    stock: 0,
  });

  await confirmMixedPurchase();

  assert.equal(productQty(10), 10);
  assert.equal(warehouseQty(10), 10);
  assert.equal(productQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(warehouseQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].product_id, 10);
});

test('drafting a purchase with a service line reverses only the physical line', async () => {
  installStubs({
    withPayment: false,
    stock: 10,
  });
  /* the confirmed bill has a physical line and a service line */
  state.items.push({
    id: 'ITEM-2',
    local_id: 'ITEM-2',
    org_id: 42,
    purchase_id: '2001',
    product_id: SERVICE_PRODUCT_ID,
    product_unit_id: BASE_UNIT_ID,
    quantity: 3,
    unit_price: 100,
    subtotal: 300,
    status: 1,
  });

  await draftPurchase();

  assert.equal(productQty(10), 0);
  assert.equal(warehouseQty(10), 0);
  /* the service line never had an inventory effect to reverse */
  assert.equal(productQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].product_id, 10);
});

test('a purchase return with a service line deducts only the physical line', async () => {
  installStubs({ withPayment: false, stock: 10 });

  await purchaseService.createReturn({
    user: USER,
    purchaseId: '2001',
    data: {
      total_amount: 200,
      currency: 'AFN',
      warehouse_id: 1,
      items: [
        {
          product_id: 10,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 80,
          subtotal: 160,
        },
        {
          product_id: SERVICE_PRODUCT_ID,
          product_unit_id: BASE_UNIT_ID,
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(10), 8);
  assert.equal(warehouseQty(10), 8);
  assert.equal(productQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(warehouseQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0].product_id, 10);
});

test('reversing a purchase return with a service line restores only the physical line', async () => {
  installStubs({ withPayment: false, withReturn: true, stock: 8 });
  state.returnItems.push({
    id: 'RET-ITEM-2',
    local_id: 'RET-ITEM-2',
    org_id: 42,
    return_id: 'RET-1',
    product_id: SERVICE_PRODUCT_ID,
    product_unit_id: BASE_UNIT_ID,
    quantity: 1,
    unit_price: 100,
    subtotal: 100,
    status: 1,
  });

  await draftPurchase();

  /* physical: return reverted (+2) then purchase reverted (-10) */
  assert.equal(productQty(10), 0);
  assert.equal(productQty(SERVICE_PRODUCT_ID), 0);
  assert.equal(state.movements.length, 2);
  assert.equal(
    state.movements.filter(
      (movement) => movement.product_id === SERVICE_PRODUCT_ID,
    ).length,
    0,
  );
});

/* =================================================================== */
/* frontend no longer orchestrates                                      */
/* =================================================================== */

const PURCHASES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'frontend',
  'src',
  'pages',
  'purchases',
);

const draftModalSource = fs.readFileSync(
  path.join(PURCHASES_DIR, 'PurchaseDraftModal.svelte'),
  'utf8',
);

const deleteModalSource = fs.readFileSync(
  path.join(PURCHASES_DIR, 'PurchaseDeleteModal.svelte'),
  'utf8',
);

test('PurchaseDraftModal performs exactly one authoritative mutation', () => {
  assert.match(
    draftModalSource,
    /await purchaseApi\.update\(purchase\.id, \{ bill_status: "draft" \}\);/,
  );

  assert.doesNotMatch(draftModalSource, /purchaseApi\.removePayment\(/);
  assert.doesNotMatch(draftModalSource, /purchaseApi\.removeReturn\(/);
});

test('PurchaseDraftModal no longer deletes stock transactions or recalculates stock', () => {
  assert.doesNotMatch(draftModalSource, /stockTransactionApi\.remove\(/);
  assert.doesNotMatch(draftModalSource, /calculateProductStock/);
});

test('PurchaseDeleteModal performs exactly one authoritative mutation', () => {
  assert.match(
    deleteModalSource,
    /await purchaseApi\.remove\(purchase\.id\);/,
  );
});

test('PurchaseDeleteModal no longer deletes stock transactions or recalculates stock', () => {
  assert.doesNotMatch(deleteModalSource, /stockTransactionApi\.remove\(/);
  assert.doesNotMatch(deleteModalSource, /calculateProductStock/);
});

/* =================================================================== */
/* accounting date (Step 3.5)                                           */
/* =================================================================== */
/*
 * The purchase return journal used to be stamped with the UTC calendar day
 * at posting time. For a UTC+4:30 book that files a return into the wrong
 * day — and potentially the wrong fiscal year — for the first hours of
 * every local day. It must use the return's own date.
 */

/*
 * installStubs seeds pre-existing journal rows for the fixture, so these
 * tests only inspect the journals written by the call under test.
 */
function newJournalsOfType(since, referenceType) {
  return state.journals
    .slice(since)
    .filter((journal) => journal.reference_type === referenceType);
}

test('a purchase return journal is dated from return_date, not posting time', async () => {
  installStubs({ withPayment: false, stock: 10 });

  const before = state.journals.length;

  await purchaseService.createReturn({
    user: USER,
    purchaseId: '2001',
    data: {
      total_amount: 200,
      currency: 'AFN',
      warehouse_id: 1,
      return_date: '2026-12-31',
      items: [
        {
          product_id: 10,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 80,
          subtotal: 160,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  const returnJournals = newJournalsOfType(before, 'purchase_return');

  assert.equal(returnJournals.length, 1);
  assert.equal(returnJournals[0].date, '2026-12-31');
});

test('a purchase return journal falls back to the local day when no date is given', async () => {
  installStubs({ withPayment: false, stock: 10 });

  const before = state.journals.length;

  await purchaseService.createReturn({
    user: USER,
    purchaseId: '2001',
    data: {
      total_amount: 200,
      currency: 'AFN',
      warehouse_id: 1,
      items: [
        {
          product_id: 10,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 80,
          subtotal: 160,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  const returnJournals = newJournalsOfType(before, 'purchase_return');

  assert.equal(returnJournals.length, 1);
  assert.equal(returnJournals[0].date, localDateOnly(new Date()));
});

test('a confirmed purchase journal is dated from bill_date', async () => {
  /* the seeded purchase starts as a draft so confirming posts its journal */
  installStubs({ billStatus: 'draft', withPayment: false, stock: 0 });

  const before = state.journals.length;

  await purchaseService.updatePurchase({
    user: USER,
    purchaseId: '2001',
    data: {
      bill_status: 'confirmed',
      bill_date: '2026-04-17',
      total_amount: 1200,
      account_id: 'SUP-1',
      warehouse_id: 1,
    },
    requestContext: REQUEST_CONTEXT,
  });

  const purchaseJournals = newJournalsOfType(before, 'purchase');

  assert.ok(
    purchaseJournals.length >= 1,
    'confirming a purchase must post a purchase journal',
  );

  for (const journal of purchaseJournals) {
    assert.equal(journal.date, '2026-04-17');
  }
});
