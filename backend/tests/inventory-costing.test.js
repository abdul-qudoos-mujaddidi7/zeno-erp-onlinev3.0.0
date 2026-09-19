/*
 * inventory-costing.test.js
 *
 * Step 2.7 tests. These run entirely against stubbed repositories and a
 * fake connection — there is NO database connection, so real production
 * data is never touched.
 *
 * They lock down the inventory-costing contract:
 *
 *   1. EVERY stock balance (products.quantity, warehouse_products.quantity,
 *      stock_batches, batch_consumptions) is expressed in the product's
 *      BASE unit, while a document line stays in the business unit the
 *      user picked — one shared conversion, never converted twice.
 *   2. A FIFO/LIFO operation is either fully covered by real layers or it
 *      is rejected before anything is written (enable_stock_minus does not
 *      relax this).
 *   3. sale_items.fifo_cost is the exact cost of the consumed layers and
 *      profit = revenue - fifo_cost, including for a legitimate
 *      zero-cost layer.
 */

process.env.DB_HOST = 'inventory-costing-test-host';
process.env.DB_USER = 'inventory-costing-test-user';
process.env.DB_PASSWORD = 'inventory-costing-test-password';
process.env.DB_NAME = 'inventory-costing-test-db';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

const productRepository =
  require('../repositories/product.repository');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const saleRepository =
  require('../repositories/sale.repository');

const batchLedger =
  require('../services/batch-ledger.service');

const saleService =
  require('../services/sale.service');

const {
  itemQuantityInProductUnit,
  convertQuantityBetweenUnits,
} = require('../utils/unitConversion');

const USER = { org_id: 42, local_id: 7 };

/* 1 carton = 12 pieces. Unit 1 is the product base unit. */
const PIECE = { id: 1, name: 'piece', subunit_id: null, subunit_multiple: null };
const CARTON = { id: 2, name: 'carton', subunit_id: 1, subunit_multiple: 12 };

const STOCK_PRODUCT = { id: 10, local_id: 10, product_unit_id: 1, type: 'stock' };
const SERVICE_PRODUCT = { id: 20, local_id: 20, product_unit_id: 1, type: 'service' };

let state;
let connection;
let idCounter;

function nextId() {
  idCounter += 1;
  return `ID-${idCounter}`;
}

function createConnection() {
  return {
    async execute(sql) {
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
    status: 1,
  };
  state.batches.push(batch);
  return batch;
}

function remaining(batchId) {
  const batch = state.batches.find((row) => row.local_id === batchId);
  return batch ? Number(batch.quantity_remaining) : null;
}

function consumptionsFor(operationType) {
  return state.consumptions.filter(
    (row) => row.operation_type === operationType && Number(row.status) === 1,
  );
}

function installStubs() {
  state = {
    method: 'FIFO',
    batches: [],
    consumptions: [],
    itemCostUpdates: [],
    products: new Map([
      [10, { ...STOCK_PRODUCT }],
      [20, { ...SERVICE_PRODUCT }],
    ]),
  };
  idCounter = 0;
  connection = createConnection();

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

  stockBatchRepository.updateRemaining = async (
    conn,
    { localId, quantityRemaining },
  ) => {
    const batch = state.batches.find(
      (row) => String(row.local_id) === String(localId),
    );
    if (!batch) return;
    batch.quantity_remaining = quantityRemaining;
  };

  stockBatchRepository.findByLocalId = async (conn, { localId }) =>
    state.batches.find((row) => String(row.local_id) === String(localId)) ||
    null;

  stockBatchRepository.recordBatch = async (conn, { localId, data }) => {
    const batch = { local_id: localId, id: localId, org_id: 42, status: 1, ...data };
    state.batches.push(batch);
    return batch;
  };

  stockBatchRepository.createConsumption = async (conn, { localId, data }) => {
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

  stockBatchRepository.findConsumptionsForBatches = async (
    conn,
    { batchIds, status = 1 },
  ) =>
    state.consumptions.filter(
      (row) =>
        Number(row.status) === Number(status) &&
        (batchIds || [])
          .map(String)
          .includes(String(row.stock_batch_id)),
    );

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

  stockBatchRepository.revertBatchesBySource = async () => {};

  productRepository.findByLocalId = async (conn, { localId }) =>
    state.products.get(Number(localId)) || null;

  /* Only the carton hierarchy exists; the piece unit is implied. */
  productUnitRepository.findAll = async () => [PIECE, CARTON];

  saleRepository.updateItemCosts = async (
    conn,
    { localId, fifoCost, profit },
  ) => {
    state.itemCostUpdates.push({ localId, fifoCost, profit });
  };
}

beforeEach(() => {
  installStubs();
});

/* =================================================================== */
/* unit conversion                                                      */
/* =================================================================== */

test('the base unit and an alternate unit convert in both directions', () => {
  assert.equal(
    convertQuantityBetweenUnits(2, CARTON.id, PIECE.id, [PIECE, CARTON]),
    24,
  );
  assert.equal(
    convertQuantityBetweenUnits(24, PIECE.id, CARTON.id, [PIECE, CARTON]),
    2,
  );
  assert.equal(
    convertQuantityBetweenUnits(3, PIECE.id, PIECE.id, [PIECE, CARTON]),
    3,
  );
});

test('a document line resolves to the product base unit', async () => {
  const carton = await itemQuantityInProductUnit(connection, {
    orgId: 42,
    item: { product_id: 10, product_unit_id: CARTON.id, quantity: 2 },
  });
  assert.equal(carton.quantity, 24);
  assert.equal(carton.productUnitId, PIECE.id);
  assert.equal(carton.isService, false);

  const piece = await itemQuantityInProductUnit(connection, {
    orgId: 42,
    item: { product_id: 10, product_unit_id: PIECE.id, quantity: 5 },
  });
  assert.equal(piece.quantity, 5);
});

test('purchase layers are created in base units for an alternate-unit purchase', async () => {
  await batchLedger.createPurchaseBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    warehouseId: 1,
    receivedAt: '2026-01-01',
    defaultCurrency: 'AFN',
    items: [
      {
        product_id: 10,
        product_unit_id: CARTON.id,
        quantity: 2,
        unit_price: 5,
      },
    ],
  });

  assert.equal(state.batches.length, 1);
  assert.equal(state.batches[0].quantity_in, 24);
  assert.equal(state.batches[0].quantity_remaining, 24);
});

test('a service purchase creates no layer', async () => {
  await batchLedger.createPurchaseBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    warehouseId: 1,
    receivedAt: '2026-01-01',
    defaultCurrency: 'AFN',
    items: [
      {
        product_id: 20,
        product_unit_id: CARTON.id,
        quantity: 2,
        unit_price: 5,
      },
    ],
  });

  assert.equal(state.batches.length, 0);
});

test('a sale entered in an alternate unit consumes the base-unit quantity', async () => {
  addBatch({ batchId: 'A', quantityIn: 24, receivedAt: '2026-01-01', unitCost: 5 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: CARTON.id, quantity: 1 }],
  });

  assert.equal(remaining('A'), 12);
  assert.equal(costs[0].required_quantity, 12);
  assert.equal(costs[0].consumed_quantity, 12);
  assert.equal(costs[0].covered, true);
  assert.equal(costs[0].fifo_cost, 60);

  const consumptions = consumptionsFor('sale');
  assert.equal(consumptions.length, 1);
  assert.equal(consumptions[0].quantity, 12);
});

test('a base-unit sale line is never converted twice', async () => {
  addBatch({ batchId: 'A', quantityIn: 24, receivedAt: '2026-01-01', unitCost: 5 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: PIECE.id, quantity: 5 }],
  });

  assert.equal(remaining('A'), 19);
  assert.equal(costs[0].fifo_cost, 25);
});

test('a purchase return in an alternate unit reduces the layers by the converted quantity', async () => {
  addBatch({
    batchId: 'A',
    quantityIn: 24,
    receivedAt: '2026-01-01',
    sourceType: 'purchase',
    sourceId: 'P1',
  });

  await batchLedger.purchaseReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    purchaseId: 'P1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: CARTON.id, quantity: 1 }],
  });

  assert.equal(remaining('A'), 12);

  const consumptions = consumptionsFor('purchase_return');
  assert.equal(consumptions.length, 1);
  assert.equal(consumptions[0].quantity, 12);
});

test('a sale return in an alternate unit restores the converted quantity', async () => {
  addBatch({ batchId: 'A', quantityIn: 24, receivedAt: '2026-01-01', unitCost: 5 });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: CARTON.id, quantity: 2 }],
  });
  assert.equal(remaining('A'), 0);

  await batchLedger.saleReturnBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    returnId: 'R1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: CARTON.id, quantity: 1 }],
  });

  assert.equal(remaining('A'), 12);
});

test('a service sale line needs no layer and carries no cost', async () => {
  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 20, product_unit_id: PIECE.id, quantity: 3 }],
  });

  assert.equal(state.batches.length, 0);
  assert.equal(state.consumptions.length, 0);
  assert.equal(costs[0].required_quantity, 0);
  assert.equal(costs[0].covered, true);
  assert.equal(costs[0].fifo_cost, 0);
});

/* =================================================================== */
/* batch coverage policy                                                */
/* =================================================================== */

test('a FIFO sale with full coverage consumes every unit of the line', async () => {
  addBatch({ batchId: 'A', quantityIn: 4, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 6, receivedAt: '2026-02-01', unitCost: 20 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: PIECE.id, quantity: 10 }],
  });

  assert.equal(remaining('A'), 0);
  assert.equal(remaining('B'), 0);
  assert.equal(costs[0].consumed_quantity, 10);
  assert.equal(costs[0].covered, true);
});

test('a LIFO sale with full coverage consumes every unit of the line', async () => {
  state.method = 'LIFO';
  addBatch({ batchId: 'A', quantityIn: 4, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 6, receivedAt: '2026-02-01', unitCost: 20 });

  const costs = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: PIECE.id, quantity: 10 }],
  });

  assert.equal(costs[0].consumed_quantity, 10);
  assert.equal(costs[0].covered, true);
});

test('a shortage in an alternate unit leaves layers and consumptions untouched', async () => {
  addBatch({ batchId: 'A', quantityIn: 12, receivedAt: '2026-01-01' });

  await assert.rejects(
    () =>
      batchLedger.consumeSaleBatches(connection, {
        orgId: 42,
        userId: 7,
        saleId: 'S1',
        warehouseId: 1,
        /* 2 cartons = 24 pieces, only 12 exist */
        items: [{ product_id: 10, product_unit_id: CARTON.id, quantity: 2 }],
      }),
    (error) => error.code === 'INSUFFICIENT_BATCH_STOCK',
  );

  assert.equal(remaining('A'), 12);
  assert.equal(state.consumptions.length, 0);
});

/* =================================================================== */
/* COGS                                                                 */
/* =================================================================== */

test('fifo_cost is the exact consumed-layer cost across multiple layers', async () => {
  addBatch({ batchId: 'A', quantityIn: 6, receivedAt: '2026-01-01', unitCost: 10 });
  addBatch({ batchId: 'B', quantityIn: 4, receivedAt: '2026-02-01', unitCost: 20 });

  const items = [{ product_id: 10, product_unit_id: PIECE.id, quantity: 10, unit_price: 30 }];
  const createdItems = [{ local_id: 'SI1', id: 'SI1', quantity: 10, unit_price: 30 }];

  const itemCosts = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: items.map((item) => ({ ...item, sale_item_id: 'SI1' })),
  });

  await saleService.persistSaleBatchCosts(connection, {
    orgId: 42,
    userId: 7,
    items,
    createdItems,
    itemCosts,
  });

  assert.equal(state.itemCostUpdates.length, 1);
  /* 6 x 10 + 4 x 20 = 140, revenue 10 x 30 = 300 */
  assert.equal(state.itemCostUpdates[0].fifoCost, 140);
  assert.equal(state.itemCostUpdates[0].profit, 160);
});

test('a legitimate zero-cost layer stores fifo_cost 0 and profit = revenue', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 0 });

  const items = [{ product_id: 10, product_unit_id: PIECE.id, quantity: 5, unit_price: 7 }];
  const createdItems = [{ local_id: 'SI1', id: 'SI1', quantity: 5, unit_price: 7 }];

  const itemCosts = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: items.map((item) => ({ ...item, sale_item_id: 'SI1' })),
  });

  assert.equal(itemCosts[0].covered, true);
  assert.equal(itemCosts[0].consumed_quantity, 5);
  assert.equal(itemCosts[0].fifo_cost, 0);

  await saleService.persistSaleBatchCosts(connection, {
    orgId: 42,
    userId: 7,
    items,
    createdItems,
    itemCosts,
  });

  assert.equal(state.itemCostUpdates.length, 1);
  assert.equal(state.itemCostUpdates[0].fifoCost, 0);
  assert.equal(state.itemCostUpdates[0].profit, 35);
});

test('a zero-cost batch is fully consumed, not treated as missing stock', async () => {
  addBatch({ batchId: 'A', quantityIn: 5, receivedAt: '2026-01-01', unitCost: 0 });

  await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items: [{ product_id: 10, product_unit_id: PIECE.id, quantity: 5 }],
  });

  assert.equal(remaining('A'), 0);
  assert.equal(consumptionsFor('sale').length, 1);
});

test('an uncovered line is refused instead of storing a partial cost', async () => {
  await assert.rejects(
    () =>
      saleService.persistSaleBatchCosts(connection, {
        orgId: 42,
        userId: 7,
        items: [{ product_id: 10, quantity: 10, unit_price: 30 }],
        createdItems: [{ local_id: 'SI1', quantity: 10, unit_price: 30 }],
        itemCosts: [
          {
            sale_item_id: 'SI1',
            product_id: 10,
            required_quantity: 10,
            consumed_quantity: 6,
            covered: false,
            fifo_cost: 60,
          },
        ],
      }),
    (error) => error.code === 'INCOMPLETE_BATCH_COST_COVERAGE',
  );

  assert.equal(state.itemCostUpdates.length, 0);
});

test('CLASSIC organizations keep their existing behaviour', async () => {
  state.method = 'CLASSIC';

  const items = [{ product_id: 10, product_unit_id: PIECE.id, quantity: 5, unit_price: 7 }];
  const createdItems = [{ local_id: 'SI1', id: 'SI1', quantity: 5, unit_price: 7 }];

  const itemCosts = await batchLedger.consumeSaleBatches(connection, {
    orgId: 42,
    userId: 7,
    saleId: 'S1',
    warehouseId: 1,
    items,
  });

  assert.deepEqual(itemCosts, []);

  await saleService.persistSaleBatchCosts(connection, {
    orgId: 42,
    userId: 7,
    items,
    createdItems,
    itemCosts,
  });

  /* CLASSIC never writes batch cost, exactly as before Step 2.7. */
  assert.equal(state.itemCostUpdates.length, 0);
});
