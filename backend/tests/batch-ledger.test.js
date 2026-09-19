/*
 * batch-ledger.test.js
 *
 * Step 2 tests. These run entirely against stubbed repositories and a
 * fake connection — there is NO database connection, so real production
 * data is never touched.
 *
 * They lock down the FIFO/LIFO consumption + restoration contract:
 *   - FIFO consumes oldest layers, LIFO newest
 *   - a document reversal restores EXACTLY the layers it consumed,
 *     using the original batch_consumptions as the source of truth
 *   - sale returns restore the original layers
 *   - historical rows whose operation_id is NULL are still restorable
 *     (sale-scoped lookup)
 */

process.env.DB_HOST = 'batch-test-host';
process.env.DB_USER = 'batch-test-user';
process.env.DB_PASSWORD = 'batch-test-password';
process.env.DB_NAME = 'batch-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

const productRepository =
  require('../repositories/product.repository');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const batchLedger =
  require('../services/batch-ledger.service');

const USER = { org_id: 42, local_id: 7 };

let state;
let connection;
let idCounter;

function nextId() {
  idCounter += 1;
  return `ID-${idCounter}`;
}

function createConnection() {
  return {
    async execute(sql, values = []) {
      if (/inventory_method/i.test(sql)) {
        return [[{ inventory_method: state.method }], []];
      }
      return [[], []];
    },
  };
}

function addBatch({
  batchId,
  productId = 10,
  warehouseId = 1,
  quantityIn,
  receivedAt,
  unitCost = 10,
  sourceType = 'purchase',
  sourceId = null,
  status = 1,
}) {
  const batch = {
    local_id: batchId,
    id: batchId,
    org_id: 42,
    product_id: productId,
    warehouse_id: warehouseId,
    quantity_in: quantityIn,
    quantity_remaining: quantityIn,
    unit_cost: unitCost,
    received_at: receivedAt,
    created_at: receivedAt,
    source_type: sourceType,
    source_id: sourceId,
    currency: 'AFN',
    status,
  };
  state.batches.push(batch);
  return batch;
}

function installStubs() {
  state = {
    method: 'FIFO',
    batches: [],
    consumptions: [],
  };
  idCounter = 0;
  connection = createConnection();

  stockBatchRepository.findOpenBatches = async (
    conn,
    { orgId, productId, warehouseId },
  ) =>
    state.batches.filter(
      (batch) =>
        Number(batch.product_id) === Number(productId) &&
        Number(batch.warehouse_id) === Number(warehouseId) &&
        Number(batch.status) === 1 &&
        Number(batch.quantity_remaining) > 0,
    );

  stockBatchRepository.updateRemaining = async (
    conn,
    { localId, quantityRemaining },
  ) => {
    const batch = state.batches.find(
      (row) => String(row.local_id) === String(localId),
    );
    if (batch) batch.quantity_remaining = quantityRemaining;
  };

  stockBatchRepository.findByLocalId = async (conn, { localId }) =>
    state.batches.find(
      (row) => String(row.local_id) === String(localId),
    ) || null;

  stockBatchRepository.recordBatch = async (conn, { localId, data }) => {
    const batch = {
      local_id: localId,
      id: localId,
      org_id: 42,
      status: 1,
      ...data,
    };
    state.batches.push(batch);
    return batch;
  };

  stockBatchRepository.createConsumption = async (
    conn,
    { localId, data },
  ) => {
    state.consumptions.push({
      local_id: localId,
      id: localId,
      org_id: 42,
      status: 1,
      ...data,
    });
  };

  stockBatchRepository.findConsumptions = async (
    conn,
    {
      operationType,
      operationId,
      saleId,
      productId,
      status = 1,
    },
  ) =>
    state.consumptions.filter((row) => {
      if (Number(row.status) !== Number(status)) return false;
      if (operationType && row.operation_type !== operationType) return false;
      if (
        operationId !== undefined &&
        operationId !== null &&
        String(row.operation_id) !== String(operationId)
      ) {
        return false;
      }
      if (saleId && String(row.sale_id) !== String(saleId)) return false;
      if (productId && Number(row.product_id) !== Number(productId)) {
        return false;
      }
      return true;
    });

  stockBatchRepository.softDeleteConsumption = async (conn, { localId }) => {
    const row = state.consumptions.find(
      (consumption) => String(consumption.local_id) === String(localId),
    );
    if (row) row.status = 0;
  };

  stockBatchRepository.findBatchesBySource = async (
    conn,
    { sourceType, sourceId, status = 1 },
  ) =>
    state.batches.filter(
      (batch) =>
        batch.source_type === sourceType &&
        String(batch.source_id) === String(sourceId) &&
        Number(batch.status) === Number(status),
    );

  stockBatchRepository.revertBatchesBySource = async (
    conn,
    { sourceType, sourceId },
  ) => {
    for (const batch of state.batches) {
      if (
        batch.source_type === sourceType &&
        String(batch.source_id) === String(sourceId) &&
        Number(batch.status) === 1
      ) {
        batch.quantity_remaining = 0;
        batch.status = 0;
      }
    }
  };

  /* Unit conversion: return no units and a product with no unit link so
   * quantities pass through unchanged. */
  productRepository.findByLocalId = async () => null;
  productUnitRepository.findAll = async () => [];
}

function remaining(batchId) {
  const batch = state.batches.find((row) => row.local_id === batchId);
  return batch ? Number(batch.quantity_remaining) : null;
}

function activeSaleConsumptions(saleId) {
  return state.consumptions.filter(
    (row) =>
      row.operation_type === 'sale' &&
      String(row.sale_id) === String(saleId) &&
      Number(row.status) === 1,
  );
}

beforeEach(() => {
  installStubs();
});

/* ============================== FIFO =============================== */

test('FIFO consumes the oldest batch first', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  assert.equal(remaining('A'), 2);
  assert.equal(remaining('B'), 5);
});

test('FIFO spans multiple batches', async () => {
  addBatch({ batchId: 'A', quantityIn: 2, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 3, receivedAt: '2026-02-01', unitCost: 20 });
  addBatch({ batchId: 'C', quantityIn: 5, receivedAt: '2026-03-01', unitCost: 30 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 6 }],
  });

  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 0);
  assert.equal(remaining('C'), 4);
  // 2@10 + 3@20 + 1@30 = 110
  assert.equal(costs[0].fifo_cost, 110);
});

/* ============================== LIFO =============================== */

test('LIFO consumes the newest batch first', async () => {
  state.method = 'LIFO';
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  assert.equal(remaining('A'), 5);
  assert.equal(remaining('B'), 2);
});

test('LIFO spans multiple batches newest-first', async () => {
  state.method = 'LIFO';
  addBatch({ batchId: 'A', quantityIn: 2, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 3, receivedAt: '2026-02-01', unitCost: 20 });
  addBatch({ batchId: 'C', quantityIn: 5, receivedAt: '2026-03-01', unitCost: 30 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 6 }],
  });

  assert.equal(remaining('C'), 0);
  assert.equal(remaining('B'), 2);
  assert.equal(remaining('A'), 2);
  // 5@30 + 1@20 = 170
  assert.equal(costs[0].fifo_cost, 170);
});

/* ========================= SALE REVERSAL =========================== */

test('sale consumption rows are keyed to the sale (regression)', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  const rows = activeSaleConsumptions('S1');
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].operation_id), 'S1');
  assert.equal(String(rows[0].sale_id), 'S1');
});

test('confirmed->draft restoration puts back exactly the consumed layers', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01', unitCost: 20 });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 7 }],
  });

  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 3);

  await batchLedger.restoreSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
  });

  // exactly A+5 and B+2, regardless of the order they were consumed in
  assert.equal(remaining('A'), 5);
  assert.equal(remaining('B'), 5);
  assert.equal(activeSaleConsumptions('S1').length, 0);
});

test('LIFO restoration puts back exactly the newest layers consumed', async () => {
  state.method = 'LIFO';
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,    items: [{ product_id: 10, product_unit_id: 1, quantity: 7 }],
  });

  assert.equal(remaining('A'), 3);
  assert.equal(remaining('B'), 0);

  await batchLedger.restoreSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
  });

  assert.equal(remaining('A'), 5);
  assert.equal(remaining('B'), 5);
});

test('sale + return then sale revert restores the pre-sale batch state', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 2 }],
  });

  assert.equal(remaining('A'), 4);

  // service order on sale revert/delete: undo the return, then the sale
  await batchLedger.revertSaleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    returnId: 'R1',
  });

  await batchLedger.restoreSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
  });

  assert.equal(remaining('A'), 5);
});

test('a restored (previously empty) batch becomes usable again', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 5 }],
  });

  assert.equal(remaining('A'), 0);

  await batchLedger.restoreSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
  });

  assert.equal(remaining('A'), 5);

  // and it can be consumed again
  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S2',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 4 }],
  });

  assert.equal(remaining('A'), 1);
});

test('historical sale consumptions with NULL operation_id still restore', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  // simulate a row written by the old code: sale_id set, operation_id null
  state.consumptions.push({
    local_id: 'HIST-1',
    id: 'HIST-1',
    org_id: 42,
    status: 1,
    operation_type: 'sale',
    operation_id: null,
    sale_id: 'S1',
    product_id: 10,
    stock_batch_id: 'A',
    warehouse_id: 1,
    quantity: 3,
    unit_cost: 10,
    total_cost: 30,
    currency: 'AFN',
  });
  state.batches[0].quantity_remaining = 2;

  await batchLedger.restoreSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
  });

  assert.equal(remaining('A'), 5);
  assert.equal(activeSaleConsumptions('S1').length, 0);
});

/* ========================== SALE RETURNS ============================ */

test('sale return restores the original consumed batches', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 5, receivedAt: '2026-02-01', unitCost: 20 });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 7 }],
  });

  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 3);

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 4 }],
  });

  // first 4 back into A
  assert.equal(remaining('A'), 4);
  assert.equal(remaining('B'), 3);
});

test('multiple partial sale returns never over-restore', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 5 }],
  });

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 2 }],
  });

  assert.equal(remaining('A'), 2);

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R2',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 2 }],
  });

  // capped at the 5 originally consumed, never 2+2 on top of each other
  assert.equal(remaining('A'), 4);
});

test('deleting a sale return re-consumes the restored layers', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 5 }],
  });

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  assert.equal(remaining('A'), 3);

  await batchLedger.revertSaleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    returnId: 'R1',
  });

  assert.equal(remaining('A'), 0);
});

/* ======================== PURCHASE RETURNS ========================= */

test('purchase return reduces the original purchase layers', async () => {
  addBatch({
    batchId: 'P-A',
    quantityIn: 5,
    receivedAt: '2026-01-01',
    sourceType: 'purchase',
    sourceId: 'P1',
  });
  addBatch({
    batchId: 'P-B',
    quantityIn: 5,
    receivedAt: '2026-02-01',
    sourceType: 'purchase',
    sourceId: 'P1',
  });

  await batchLedger.purchaseReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    returnId: 'PR1',
    warehouseId: 1,
    items: [{ product_id: 10, quantity: 3 }],
  });

  // newest source layer is reduced first (mirrors legacy behaviour)
  assert.equal(remaining('P-B'), 2);
  assert.equal(remaining('P-A'), 5);
});

test('purchase return cannot drive batch remaining negative', async () => {
  addBatch({
    batchId: 'P-A',
    quantityIn: 2,
    receivedAt: '2026-01-01',
    sourceType: 'purchase',
    sourceId: 'P1',
  });

  await batchLedger.purchaseReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    returnId: 'PR1',
    warehouseId: 1,
    items: [{ product_id: 10, quantity: 100 }],
  });

  assert.equal(remaining('P-A'), 0);
});

test('reverting a purchase return puts the layers back', async () => {
  addBatch({
    batchId: 'P-A',
    quantityIn: 5,
    receivedAt: '2026-01-01',
    sourceType: 'purchase',
    sourceId: 'P1',
  });

  await batchLedger.purchaseReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    returnId: 'PR1',
    warehouseId: 1,
    items: [{ product_id: 10, quantity: 3 }],
  });

  assert.equal(remaining('P-A'), 2);

  await batchLedger.revertPurchaseReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    returnId: 'PR1',
  });

  assert.equal(remaining('P-A'), 5);
});

/* ============================ CLASSIC ============================== */

test('CLASSIC organizations never touch batches', async () => {
  state.method = 'CLASSIC';
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
  });

  assert.deepEqual(costs, []);
  assert.equal(remaining('A'), 5);
  assert.equal(state.consumptions.length, 0);
});

/* ======================= FAILURE PROPAGATION ======================= */

test('a batch update failure propagates so the caller can roll back', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01' });

  stockBatchRepository.updateRemaining = async () => {
    throw new Error('batch update failed');
  };

  await assert.rejects(() =>
    batchLedger.consumeSaleBatches(connection, {
      orgId: 42,
      userId: 7,
      saleId: 'S1',
      warehouseId: 1,
      items: [{ product_id: 10, product_unit_id: 1, quantity: 3 }],
    }),
  );

  assert.equal(remaining('A'), 5);
});

test('insufficient batch stock is consumed best-effort (documents current behaviour)', async () => {
  addBatch({ batchId: 'A', quantityIn: 2, receivedAt: '2026-01-01' });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: 1, quantity: 5 }],
  });

  // consumption is capped at available; the shortfall is not fabricated
  assert.equal(remaining('A'), 0);
  assert.equal(costs[0].fifo_cost, 20);
});
