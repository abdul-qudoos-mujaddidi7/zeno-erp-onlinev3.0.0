/*
 * adjustment-integrity.test.js
 *
 * Step 2.8 tests. These run entirely against stubbed repositories and a
 * fake connection — there is NO database connection, so real production
 * data is never touched.
 *
 * They lock down two invariants:
 *
 *   1. A stock adjustment can never leave product/warehouse stock ahead
 *      of the FIFO/LIFO layers. A decrease draws the layers down with the
 *      organization's costing order; an increase is refused until a cost
 *      policy exists (a layer needs a real cost); a zero reset clears the
 *      layers with the balances.
 *   2. A `products.type = 'service'` line has NO inventory footprint:
 *      no product stock, no warehouse stock, no layers, no movement —
 *      while its document line, totals, payments and journals stay
 *      exactly as before.
 */

process.env.DB_HOST = 'adjustment-integrity-test-host';
process.env.DB_USER = 'adjustment-integrity-test-user';
process.env.DB_PASSWORD = 'adjustment-integrity-test-password';
process.env.DB_NAME = 'adjustment-integrity-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const pool = require('../database/pool');

const adjustmentRepository =
  require('../repositories/stock-adjustment.repository');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

const productRepository =
  require('../repositories/product.repository');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const saleRepository =
  require('../repositories/sale.repository');

const settingsRepository =
  require('../repositories/settings.repository');

const wasteRepository =
  require('../repositories/waste.repository');

const stockTransferRepository =
  require('../repositories/stock-transfer.repository');

const stockAdjustmentService =
  require('../services/stock-adjustment.service');

const saleService = require('../services/sale.service');
const wasteService = require('../services/waste.service');
const stockTransferService =
  require('../services/stock-transfer.service');

const AppError = require('../errors/AppError');

const USER = { org_id: 42, local_id: 7 };
const REQUEST_CONTEXT = { ipAddress: '127.0.0.1', sessionId: 'test', deviceInfo: 'node:test' };

const BASE_UNIT_ID = 1;
const PHYSICAL = 10;
const SERVICE = 20;

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
      if (conn.snapshot) state = conn.snapshot;
    },
    async release() {
      conn.released = true;
    },
    async execute(sql) {
      if (/inventory_method/i.test(sql)) {
        return [[{ inventory_method: state.method }], []];
      }
      return [[], []];
    },
  };
  return conn;
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

function remaining(batchId) {
  const batch = state.batches.find((row) => row.local_id === batchId);
  return batch ? Number(batch.quantity_remaining) : null;
}

function addBatch({ batchId, productId = PHYSICAL, quantityIn, receivedAt, unitCost = 10 }) {
  const batch = {
    local_id: batchId,
    id: batchId,
    org_id: 42,
    product_id: productId,
    warehouse_id: 1,
    quantity_in: quantityIn,
    quantity_remaining: quantityIn,
    unit_cost: unitCost,
    received_at: receivedAt,
    created_at: receivedAt,
    source_type: 'purchase',
    source_id: 'P1',
    currency: 'AFN',
    status: 1,
  };
  state.batches.push(batch);
  return batch;
}

function stockMovements() {
  return state.movements;
}

function installStubs() {
  state = {
    method: 'CLASSIC',
    productQty: {},
    warehouseQty: {},
    movements: [],
    consumptions: [],
    adjustments: [],
    batches: [],
    types: { [PHYSICAL]: 'stock', [SERVICE]: 'service' },
    layerTouches: 0,
    sales: new Map(),
    saleItems: [],
    saleReturns: [],
    saleReturnItems: [],
    payments: [],
    returns: [],
    journals: [],
  };

  connection = createConnection();

  pool.getConnection = async () => connection;

  /* ---------------------------- products --------------------------- */
  productRepository.findByLocalId = async (conn, { localId }) => {
    const id = Number(localId);
    if (!state.types[id]) return null;
    return {
      id: String(id),
      local_id: String(id),
      name: `Product ${id}`,
      product_unit_id: BASE_UNIT_ID,
      type: state.types[id],
      quantity: productQty(id),
    };
  };

  productRepository.adjustQuantity = async (conn, { productId, delta }) => {
    addProductQty(productId, delta);
  };

  productRepository.zeroAllQuantities = async () => {
    Object.keys(state.productQty).forEach((key) => {
      state.productQty[key] = 0;
    });
  };

  productUnitRepository.findAll = async () => [
    { id: BASE_UNIT_ID, name: 'piece', subunit_id: null, subunit_multiple: null },
  ];

  /* ------------------------- warehouse stock ----------------------- */
  warehouseProductRepository.adjustQuantity = async (
    conn,
    { warehouseId = 1, productId, delta },
  ) => {
    addWarehouseQty(productId, delta, warehouseId);
  };

  warehouseProductRepository.zeroQuantities = async (conn, { productId }) => {
    state.warehouseQty[`1:${productId}`] = 0;
  };

  warehouseProductRepository.zeroAllQuantities = async () => {
    Object.keys(state.warehouseQty).forEach((key) => {
      state.warehouseQty[key] = 0;
    });
    return Object.keys(state.warehouseQty).length;
  };

  /* ------------------------- stock movements ----------------------- */
  stockTransactionRepository.recordMovement = async (conn, { data }) => {
    state.movements.push({ ...data });
    return { id: `MOV-${state.movements.length}`, ...data };
  };

  stockTransactionRepository.recordMovements = async (conn, { rows }) => {
    (rows || []).forEach((row) => state.movements.push({ ...row }));
  };

  /* ---------------------------- batches ---------------------------- */
  stockBatchRepository.findOpenBatches = async (
    conn,
    { productId, warehouseId },
  ) =>
    state.batches.filter(
      (batch) =>
        Number(batch.product_id) === Number(productId) &&
        Number(batch.warehouse_id) === Number(warehouseId) &&
        Number(batch.status) === 1 &&
        Number(batch.quantity_remaining) > 0,
    );

  stockBatchRepository.findAll = async (conn, { filters = {} }) =>
    state.batches.filter(
      (batch) =>
        Number(batch.status) === Number(filters.status ?? 1) &&
        (!filters.product_id ||
          Number(batch.product_id) === Number(filters.product_id)),
    );

  stockBatchRepository.updateRemaining = async (
    conn,
    { localId, quantityRemaining },
  ) => {
    const batch = state.batches.find(
      (row) => String(row.local_id) === String(localId),
    );
    if (!batch) return;
    state.layerTouches += 1;
    batch.quantity_remaining = quantityRemaining;
  };

  stockBatchRepository.softDelete = async (conn, { localId }) => {
    const batch = state.batches.find(
      (row) => String(row.local_id) === String(localId),
    );
    if (batch) batch.status = 0;
  };

  stockBatchRepository.findById = async (conn, { localId }) =>
    state.batches.find((row) => String(row.local_id) === String(localId)) ||
    null;

  stockBatchRepository.createConsumption = async (conn, { localId, data }) => {
    state.consumptions.push({
      local_id: localId,
      id: localId,
      org_id: 42,
      status: 1,
      ...data,
    });
  };

  /* -------------------------- adjustments -------------------------- */
  adjustmentRepository.findProductForUpdate = async (conn, { productId }) => {
    const id = Number(productId);
    if (!state.types[id]) return null;
    return {
      id: String(id),
      name: `Product ${id}`,
      code: `P${id}`,
      type: state.types[id],
      product_unit_id: BASE_UNIT_ID,
      quantity: productQty(id),
    };
  };

  adjustmentRepository.warehouseExists = async () => true;

  adjustmentRepository.findWarehouseForUpdate = async (conn, { productId }) => ({
    id: '1',
    quantity: warehouseQty(productId),
    product_unit_id: BASE_UNIT_ID,
  });

  adjustmentRepository.create = async (conn, data) => {
    state.adjustments.push({ ...data });
    return state.adjustments.length;
  };

  adjustmentRepository.findZeroableStock = async () => ({
    products: Object.keys(state.types).map((id) => ({
      id: String(id),
      name: `Product ${id}`,
      product_unit_id: BASE_UNIT_ID,
      quantity: productQty(id),
    })),
    balances: [],
  });

  adjustmentRepository.findFirstWarehouse = async () => '1';

  adjustmentRepository.createMany = async (conn, rows) => {
    rows.forEach((row) => state.adjustments.push({ ...row }));
    return rows.map((_, index) => index + 1);
  };

  adjustmentRepository.findById = async () => ({ id: 1 });

  /* ----------------------------- sales ----------------------------- */
  /*
   * A row read is a snapshot, exactly like a real SELECT: mutating the
   * stored sale afterwards must not rewrite the caller's `oldSale`.
   */
  saleRepository.findByLocalId = async (conn, { localId }) => {
    const sale = state.sales.get(String(localId));
    return sale ? { ...sale } : null;
  };

  saleRepository.update = async (conn, { localId, data }) => {
    const sale = state.sales.get(String(localId));
    if (sale) Object.assign(sale, data);
    return { ...sale };
  };

  saleRepository.findItemsBySale = async () =>
    state.saleItems.filter((item) => Number(item.status) === 1);

  saleRepository.softDeleteItemsBySale = async () => {
    state.saleItems.forEach((item) => {
      item.status = 0;
    });
  };

  saleRepository.createItem = async (conn, { localId, data }) => {
    const item = { local_id: localId, id: localId, org_id: 42, status: 1, ...data };
    state.saleItems.push(item);
    return item;
  };

  saleRepository.adjustProductQuantity = async (conn, { productId, delta }) => {
    addProductQty(productId, delta);
    return productQty(productId);
  };

  saleRepository.updateItemCosts = async () => {};

  saleRepository.findAccountByCode = async (conn, { code }) => ({
    id: `ACC-${code}`,
    code,
  });

  saleRepository.softDelete = async (conn, { localId }) => {
    const sale = state.sales.get(String(localId));
    if (sale) sale.status = 0;
    return { ...sale };
  };

  saleRepository.findPaymentsBySale = async () => [];
  saleRepository.findReturnsBySale = async () => state.saleReturns;

  saleRepository.findReturnByLocalId = async (conn, { localId }) =>
    state.saleReturns.find((row) => String(row.id) === String(localId)) ||
    null;

  saleRepository.findReturnItemsByReturn = async () => state.saleReturnItems;

  saleRepository.softDeleteReturn = async (conn, { localId }) => {
    const row = state.saleReturns.find(
      (entry) => String(entry.id) === String(localId),
    );
    if (row) row.status = 0;
    return row ? { ...row } : null;
  };

  saleRepository.softDeleteReturnItemsByReturn = async () => {
    state.saleReturnItems.forEach((item) => {
      item.status = 0;
    });
  };

  saleRepository.createReturn = async (conn, { localId, data }) => {
    const row = { id: localId, local_id: localId, org_id: 42, status: 1, ...data };
    state.saleReturns.push(row);
    return row;
  };

  saleRepository.createReturnItem = async (conn, { localId, data }) => {
    const item = { id: localId, local_id: localId, org_id: 42, status: 1, ...data };
    state.saleReturnItems.push(item);
    return item;
  };

  settingsRepository.findByKey = async (conn, { key }) => ({
    local_id: `S-${key}`,
    key,
    value: key === 'invoice_index' ? '0' : 'INV-',
  });

  settingsRepository.update = async () => {};

  saleRepository.findByInvoiceNumber = async () => null;

  saleRepository.create = async (conn, { localId, data }) => {
    const sale = { id: localId, local_id: localId, org_id: 42, status: 1, ...data };
    state.sales.set(String(localId), sale);
    return sale;
  };

  journalRepository.create = async (conn, { localId, data }) => ({
    id: localId,
    ...data,
  });

  journalRepository.softDeleteByReference = async () => 0;
  journalRepository.findAll = async () => ({ data: [], total: 0 });

  activityRepository.create = async () => ({ id: 'ACT' });

  /* ----------------------------- waste ----------------------------- */
  wasteRepository.create = async (conn, { localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: 42,
    status: 1,
    ...data,
  });

  wasteRepository.createItem = async (conn, { localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: 42,
    status: 1,
    ...data,
  });

  wasteRepository.adjustProductQuantity = async (conn, { productId, delta }) => {
    addProductQty(productId, delta);
    return productQty(productId);
  };

  wasteRepository.findByLocalId = async (conn, { localId }) => ({
    id: localId,
    local_id: localId,
    status: 1,
  });

  wasteRepository.findItemsByWaste = async () => [];

  /* --------------------------- transfers --------------------------- */
  stockTransferRepository.create = async (conn, { localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: 42,
    status: 1,
    ...data,
  });

  stockTransferRepository.createItem = async (conn, { localId, data }) => ({
    id: localId,
    local_id: localId,
    org_id: 42,
    status: 1,
    ...data,
  });

  stockTransferRepository.findByLocalId = async (conn, { localId }) => ({
    id: localId,
    local_id: localId,
    status: 1,
  });

  stockTransferRepository.findItemsByTransfer = async () => [];
}

beforeEach(() => {
  installStubs();
});

function createAdjustment({
  productId = PHYSICAL,
  type = 'increase',
  qty = 5,
  warehouseId = 1,
} = {}) {
  return stockAdjustmentService.createStockAdjustment({
    user: USER,
    data: {
      product_id: productId,
      warehouse_id: warehouseId,
      adjustment_type: type,
      qty,
      reason: 'count',
      note: null,
    },
    requestContext: REQUEST_CONTEXT,
  });
}

/* =================================================================== */
/* adjustments — CLASSIC                                                */
/* =================================================================== */

test('CLASSIC increase adjustment keeps its existing behaviour', async () => {
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 4);

  await createAdjustment({ type: 'increase', qty: 5 });

  assert.equal(productQty(PHYSICAL), 15);
  assert.equal(warehouseQty(PHYSICAL), 9);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].transaction_type, 'adjustment_in');
  assert.equal(stockMovements()[0].quantity, 5);
  assert.equal(state.batches.length, 0);
  assert.equal(connection.committed, true);
});

test('CLASSIC decrease adjustment keeps its existing behaviour', async () => {
  addProductQty(PHYSICAL, 15);
  addWarehouseQty(PHYSICAL, 9);
  addBatch({ batchId: 'A', quantityIn: 15, receivedAt: '2026-01-01' });

  await createAdjustment({ type: 'decrease', qty: 2 });

  assert.equal(productQty(PHYSICAL), 13);
  assert.equal(warehouseQty(PHYSICAL), 7);
  assert.equal(stockMovements()[0].transaction_type, 'adjustment_out');
  /* CLASSIC never touches layers, even leftovers from an earlier method. */
  assert.equal(remaining('A'), 15);
  assert.equal(state.layerTouches, 0);
});

test('CLASSIC decrease below zero is still rejected', async () => {
  addProductQty(PHYSICAL, 3);
  addWarehouseQty(PHYSICAL, 3);

  await assert.rejects(
    () => createAdjustment({ type: 'decrease', qty: 5 }),
    (error) => error.code === 'INSUFFICIENT_STOCK',
  );

  assert.equal(productQty(PHYSICAL), 3);
  assert.equal(warehouseQty(PHYSICAL), 3);
  assert.equal(stockMovements().length, 0);
  assert.equal(connection.rolledBack, true);
});

/* =================================================================== */
/* adjustments — FIFO / LIFO                                            */
/* =================================================================== */

test('a FIFO increase adjustment is refused until a cost policy exists', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 10, receivedAt: '2026-01-01' });

  await assert.rejects(
    () => createAdjustment({ type: 'increase', qty: 5 }),
    (error) => error.code === 'ADJUSTMENT_COST_POLICY_REQUIRED' && error.statusCode === 409,
  );

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(warehouseQty(PHYSICAL), 10);
  assert.equal(remaining('A'), 10);
  assert.equal(state.adjustments.length, 0);
  assert.equal(stockMovements().length, 0);
  assert.equal(connection.rolledBack, true);
});

test('a LIFO increase adjustment is refused as well', async () => {
  state.method = 'LIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);

  await assert.rejects(
    () => createAdjustment({ type: 'increase', qty: 5 }),
    (error) => error.code === 'ADJUSTMENT_COST_POLICY_REQUIRED',
  );

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(stockMovements().length, 0);
});

test('a FIFO decrease adjustment consumes the oldest layers', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01', unitCost: 20 });

  await createAdjustment({ type: 'decrease', qty: 7 });

  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 3);
  assert.equal(productQty(PHYSICAL), 3);
  assert.equal(warehouseQty(PHYSICAL), 3);
  assert.equal(state.consumptions.length, 2);
  assert.equal(state.consumptions[0].quantity, 5);
  assert.equal(state.consumptions[1].quantity, 2);
  assert.equal(state.consumptions[0].operation_type, 'ADJUSTMENT');
  assert.equal(stockMovements()[0].quantity, 7);
  assert.equal(connection.committed, true);
});

test('a LIFO decrease adjustment consumes the newest layers', async () => {
  state.method = 'LIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01', unitCost: 20 });

  await createAdjustment({ type: 'decrease', qty: 7 });

  assert.equal(remaining('B'), 0);
  assert.equal(remaining('A'), 3);
  assert.equal(productQty(PHYSICAL), 3);
  assert.equal(state.consumptions.length, 2);
  assert.equal(state.consumptions[0].stock_batch_id, 'B');
});

test('a FIFO decrease larger than the layers changes nothing', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 6, receivedAt: '2026-01-01' });

  await assert.rejects(
    () => createAdjustment({ type: 'decrease', qty: 10 }),
    (error) => error.code === 'INSUFFICIENT_BATCH_STOCK',
  );

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(warehouseQty(PHYSICAL), 10);
  assert.equal(remaining('A'), 6);
  assert.equal(state.consumptions.length, 0);
  assert.equal(state.adjustments.length, 0);
  assert.equal(stockMovements().length, 0);
  assert.equal(connection.rolledBack, true);
});

test('a LIFO decrease larger than the layers changes nothing', async () => {
  state.method = 'LIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 6, receivedAt: '2026-01-01' });

  await assert.rejects(
    () => createAdjustment({ type: 'decrease', qty: 10 }),
    (error) => error.code === 'INSUFFICIENT_BATCH_STOCK',
  );

  assert.equal(remaining('A'), 6);
  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(state.consumptions.length, 0);
  assert.equal(connection.rolledBack, true);
});

test('a full FIFO decrease keeps stock and layers equal', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01' });

  await createAdjustment({ type: 'decrease', qty: 10 });

  assert.equal(productQty(PHYSICAL), 0);
  assert.equal(remaining('A') + remaining('B'), 0);
});

/* =================================================================== */
/* adjustments — services and zeroing                                   */
/* =================================================================== */

test('a service product cannot be stock adjusted', async () => {
  addProductQty(SERVICE, 3);
  addWarehouseQty(SERVICE, 3);

  await assert.rejects(
    () => createAdjustment({ productId: SERVICE, type: 'decrease', qty: 1 }),
    (error) => error.code === 'SERVICE_HAS_NO_STOCK' && error.statusCode === 422,
  );

  assert.equal(productQty(SERVICE), 3);
  assert.equal(state.adjustments.length, 0);
  assert.equal(connection.rolledBack, true);
});

test('zero-stock clears the product layers with the balances', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 6, receivedAt: '2026-01-01' });
  addBatch({ batchId: 'B', quantityIn: 4, receivedAt: '2026-02-01' });

  await stockAdjustmentService.zeroStockAdjustment({
    user: USER,
    data: { product_id: PHYSICAL, warehouse_id: 1, reason: 'reset' },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 0);
  assert.equal(warehouseQty(PHYSICAL), 0);
  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 0);
  assert.equal(state.batches.every((batch) => batch.status === 0), true);
});

test('zero-all clears every layer of the organization', async () => {
  state.method = 'FIFO';
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 6, receivedAt: '2026-01-01' });

  await stockAdjustmentService.zeroAllStock({
    user: USER,
    data: { reason: 'reset all' },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 0);
  assert.equal(remaining('A'), 0);
  assert.equal(state.batches[0].status, 0);
});

test('zero-stock leaves CLASSIC layers alone', async () => {
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addBatch({ batchId: 'A', quantityIn: 10, receivedAt: '2026-01-01' });

  await stockAdjustmentService.zeroStockAdjustment({
    user: USER,
    data: { product_id: PHYSICAL, warehouse_id: 1, reason: 'reset' },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 0);
  assert.equal(remaining('A'), 10);
  assert.equal(state.layerTouches, 0);
});

/* =================================================================== */
/* adjustments — no reversal exists                                     */
/* =================================================================== */

const routesSource = fs.readFileSync(
  path.join(__dirname, '..', 'routes', 'v2', 'stock-adjustment.routes.js'),
  'utf8',
);

test('stock adjustments expose no edit, delete or void route', () => {
  assert.doesNotMatch(routesSource, /router\.(put|patch|delete)\(/);
  assert.doesNotMatch(routesSource, /approve|cancel|void|reverse/);
});

test('the adjustment service exposes no reversal entry point', () => {
  const keys = Object.keys(stockAdjustmentService);
  assert.deepEqual(keys.sort(), [
    'createStockAdjustment',
    'getAdjustmentReport',
    'getStockAdjustment',
    'listStockAdjustments',
    'zeroAllStock',
    'zeroStockAdjustment',
  ]);
});

/* =================================================================== */
/* services — sales                                                     */
/* =================================================================== */

function seedDraftSaleWithItems(itemIds = [PHYSICAL, SERVICE]) {
  const sale = {
    id: 'S1',
    local_id: 'S1',
    org_id: 42,
    status: 1,
    invoice_status: 'draft',
    total_amount: 300,
    currency: 'AFN',
    account_id: 'CUST-1',
    warehouse_id: 1,
    invoice_number: 'INV-1',
    invoice_date: '2026-01-01',
  };
  state.sales.set('S1', sale);
  state.saleItems = itemIds.map((productId, index) => ({
    local_id: `SI${index}`,
    id: `SI${index}`,
    org_id: 42,
    sale_id: 'S1',
    product_id: productId,
    product_unit_id: BASE_UNIT_ID,
    quantity: 2,
    unit_price: 50,
    subtotal: 100,
    status: 1,
  }));
  return sale;
}

function mixedSaleItems() {
  return [
    {
      product_id: PHYSICAL,
      product_unit_id: BASE_UNIT_ID,
      quantity: 2,
      unit_price: 50,
      subtotal: 100,
    },
    {
      product_id: SERVICE,
      product_unit_id: BASE_UNIT_ID,
      quantity: 1,
      unit_price: 100,
      subtotal: 100,
    },
  ];
}

test('a sale with a service line moves only the physical line', async () => {
  seedDraftSaleWithItems([PHYSICAL]);
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addProductQty(SERVICE, 4);
  addWarehouseQty(SERVICE, 4);

  await saleService.updateSale({
    user: USER,
    saleId: 'S1',
    data: {
      invoice_status: 'confirmed',
      total_amount: 200,
      account_id: 'CUST-1',
      warehouse_id: 1,
      items: mixedSaleItems(),
    },
    requestContext: REQUEST_CONTEXT,
  });

  /* physical line: -2, service line: untouched */
  assert.equal(productQty(PHYSICAL), 8);
  assert.equal(warehouseQty(PHYSICAL), 8);
  assert.equal(productQty(SERVICE), 4);
  assert.equal(warehouseQty(SERVICE), 4);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].product_id, PHYSICAL);
  assert.equal(connection.committed, true);
});

test('a service sale line writes no inventory movement', async () => {
  seedDraftSaleWithItems([SERVICE]);
  addProductQty(SERVICE, 4);
  addWarehouseQty(SERVICE, 4);

  await saleService.createSale({
    user: USER,
    data: {
      invoice_status: 'confirmed',
      total_amount: 100,
      account_id: 'CUST-1',
      warehouse_id: 1,
      items: [
        {
          product_id: SERVICE,
          product_unit_id: BASE_UNIT_ID,
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(SERVICE), 4);
  assert.equal(warehouseQty(SERVICE), 4);
  assert.equal(stockMovements().length, 0);
});

test('deleting a sale with a service line restores only the physical line', async () => {
  const sale = seedDraftSaleWithItems([PHYSICAL, SERVICE]);
  sale.invoice_status = 'confirmed';
  state.saleItems = [
    { ...state.saleItems[0], quantity: 2 },
    { ...state.saleItems[1], quantity: 1 },
  ];
  addProductQty(PHYSICAL, 8);
  addWarehouseQty(PHYSICAL, 8);
  addProductQty(SERVICE, -1);
  addWarehouseQty(SERVICE, -1);

  await saleService.deleteSale({
    user: USER,
    saleId: 'S1',
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(warehouseQty(PHYSICAL), 10);
  /* the service keeps its drifted history: a delete must not move it */
  assert.equal(productQty(SERVICE), -1);
  assert.equal(
    stockMovements().filter((movement) => movement.product_id === SERVICE).length,
    0,
  );
});

test('a sale return with a service line restores only the physical line', async () => {
  const sale = seedDraftSaleWithItems([PHYSICAL, SERVICE]);
  sale.invoice_status = 'confirmed';
  addProductQty(PHYSICAL, 8);
  addWarehouseQty(PHYSICAL, 8);
  addProductQty(SERVICE, 4);
  addWarehouseQty(SERVICE, 4);

  await saleService.createReturn({
    user: USER,
    saleId: 'S1',
    data: {
      total_amount: 100,
      currency: 'AFN',
      warehouse_id: 1,
      items: [
        {
          product_id: PHYSICAL,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 50,
          subtotal: 100,
        },
        {
          product_id: SERVICE,
          product_unit_id: BASE_UNIT_ID,
          quantity: 1,
          unit_price: 100,
          subtotal: 100,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(warehouseQty(PHYSICAL), 10);
  assert.equal(productQty(SERVICE), 4);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].product_id, PHYSICAL);
});

test('deleting a sale return with a service line deducts only the physical line', async () => {
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addProductQty(SERVICE, 4);
  addWarehouseQty(SERVICE, 4);
  state.saleReturns = [
    {
      id: 'R1',
      local_id: 'R1',
      org_id: 42,
      status: 1,
      sale_id: 'S1',
      warehouse_id: 1,
    },
  ];
  state.saleReturnItems = [
    {
      id: 'RI1',
      local_id: 'RI1',
      org_id: 42,
      status: 1,
      product_id: PHYSICAL,
      product_unit_id: BASE_UNIT_ID,
      quantity: 2,
      unit_price: 50,
      subtotal: 100,
    },
    {
      id: 'RI2',
      local_id: 'RI2',
      org_id: 42,
      status: 1,
      product_id: SERVICE,
      product_unit_id: BASE_UNIT_ID,
      quantity: 1,
      unit_price: 100,
      subtotal: 100,
    },
  ];

  await saleService.deleteReturn({
    user: USER,
    returnId: 'R1',
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 8);
  assert.equal(warehouseQty(PHYSICAL), 8);
  assert.equal(productQty(SERVICE), 4);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].product_id, PHYSICAL);
});

/* =================================================================== */
/* services — waste and transfer                                        */
/* =================================================================== */

test('a waste with a service line deducts only the physical line', async () => {
  addProductQty(PHYSICAL, 10);
  addWarehouseQty(PHYSICAL, 10);
  addProductQty(SERVICE, 4);
  addWarehouseQty(SERVICE, 4);

  await wasteService.createWaste({
    user: USER,
    data: {
      waste_status: 'confirmed',
      warehouse_id: 1,
      date: '2026-01-01',
      currency: 'AFN',
      items: [
        {
          product_id: PHYSICAL,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 10,
          subtotal: 20,
        },
        {
          product_id: SERVICE,
          product_unit_id: BASE_UNIT_ID,
          quantity: 1,
          unit_price: 10,
          subtotal: 10,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 8);
  assert.equal(warehouseQty(PHYSICAL), 8);
  assert.equal(productQty(SERVICE), 4);
  assert.equal(warehouseQty(SERVICE), 4);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].product_id, PHYSICAL);
});

test('a transfer with a service line moves only the physical line', async () => {
  addWarehouseQty(PHYSICAL, 10, 1);
  addWarehouseQty(SERVICE, 4, 1);

  await stockTransferService.createStockTransfer({
    user: USER,
    data: {
      transfer_status: 'confirmed',
      warehouse_id: 1,
      to_warehouse_id: 2,
      transfer_date: '2026-01-01',
      currency: 'AFN',
      items: [
        {
          product_id: PHYSICAL,
          product_unit_id: BASE_UNIT_ID,
          quantity: 2,
          unit_price: 10,
          subtotal: 20,
        },
        {
          product_id: SERVICE,
          product_unit_id: BASE_UNIT_ID,
          quantity: 1,
          unit_price: 10,
          subtotal: 10,
        },
      ],
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(warehouseQty(PHYSICAL, 1), 8);
  assert.equal(warehouseQty(PHYSICAL, 2), 2);
  assert.equal(warehouseQty(SERVICE, 1), 4);
  assert.equal(warehouseQty(SERVICE, 2), 0);
  assert.equal(
    stockMovements().filter((movement) => movement.product_id === SERVICE).length,
    0,
  );
});

/* =================================================================== */
/* services — confirmed sale back to draft                              */
/* =================================================================== */

test('reverting a sale to draft restores only the physical line', async () => {
  const sale = seedDraftSaleWithItems([PHYSICAL, SERVICE]);
  sale.invoice_status = 'confirmed';

  /* physical line sold 2, service line 1 */
  state.saleItems = [
    { ...state.saleItems[0], quantity: 2 },
    { ...state.saleItems[1], quantity: 1 },
  ];

  addProductQty(PHYSICAL, 8);
  addWarehouseQty(PHYSICAL, 8);
  /* the service account keeps whatever drifted history it already had */
  addProductQty(SERVICE, -1);
  addWarehouseQty(SERVICE, -1);

  await saleService.updateSale({
    user: USER,
    saleId: 'S1',
    data: {
      invoice_status: 'draft',
      total_amount: 200,
      account_id: 'CUST-1',
      warehouse_id: 1,
    },
    requestContext: REQUEST_CONTEXT,
  });

  assert.equal(productQty(PHYSICAL), 10);
  assert.equal(warehouseQty(PHYSICAL), 10);
  assert.equal(productQty(SERVICE), -1);
  assert.equal(warehouseQty(SERVICE), -1);
  assert.equal(stockMovements().length, 1);
  assert.equal(stockMovements()[0].product_id, PHYSICAL);
  assert.equal(stockMovements()[0].transaction_type, 'sale_revert');
});
