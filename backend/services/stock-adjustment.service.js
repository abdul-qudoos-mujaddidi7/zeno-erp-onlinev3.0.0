const db = require('../database/pool');
const AppError = require('../errors/AppError');
const adjustmentRepository = require('../repositories/stock-adjustment.repository');
const productRepository = require('../repositories/product.repository');
const warehouseProductRepository = require('../repositories/warehouse-product.repository');
const stockTransactionRepository = require('../repositories/stock-transaction.repository');
const activityRepository = require('../repositories/activity.repository');
const batchLedger = require('./batch-ledger.service');

function identity(user) {
  const orgId = Number(user?.org_id); const userId = Number(user?.local_id);
  if (!Number.isSafeInteger(orgId) || !Number.isSafeInteger(userId) || orgId <= 0 || userId <= 0) {
    throw new AppError('Invalid authenticated user.', 401, 'INVALID_IDENTITY');
  }
  return { orgId, userId };
}

/*
 * A service is not physical inventory, so it must never take part in a
 * stock adjustment.
 */
function isServiceProduct(product) {
  return String(product?.type || '').trim().toLowerCase() === 'service';
}

async function listStockAdjustments({ user, filters }) {
  const { orgId } = identity(user);
  return adjustmentRepository.findAll(db, { orgId, productId: filters.product_id, warehouseId: filters.warehouse_id,
    adjustmentType: filters.adjustment_type, dateFrom: filters.date_from, dateTo: filters.date_to });
}

async function getStockAdjustment({ user, adjustmentId }) {
  const { orgId } = identity(user);
  const adjustment = await adjustmentRepository.findById(db, { orgId, id: adjustmentId });
  if (!adjustment) throw new AppError('Stock adjustment not found.', 404, 'STOCK_ADJUSTMENT_NOT_FOUND');
  return adjustment;
}

async function createStockAdjustment({ user, data, requestContext }) {
  const { orgId, userId } = identity(user);
  const qty = Number(data.qty);
  const delta = data.adjustment_type === 'increase' ? qty : -qty;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Lock the product and its warehouse balance in a stable order. Every
    // validation and quantity update happens while those locks are held.
    const product = await adjustmentRepository.findProductForUpdate(connection, { orgId, productId: data.product_id });
    if (!product) throw new AppError('The selected product does not exist or is inactive.', 422, 'PRODUCT_NOT_FOUND');
    if (!await adjustmentRepository.warehouseExists(connection, { orgId, warehouseId: data.warehouse_id })) {
      throw new AppError('The selected warehouse does not exist or is inactive.', 422, 'WAREHOUSE_NOT_FOUND');
    }
    const warehouseStock = await adjustmentRepository.findWarehouseForUpdate(connection, { orgId, warehouseId: data.warehouse_id, productId: data.product_id });
    const beforeQty = Number(product.quantity);
    const beforeWarehouseQty = Number(warehouseStock?.quantity || 0);
    const afterQty = beforeQty + delta;
    const afterWarehouseQty = beforeWarehouseQty + delta;
    if (afterQty < -0.000001 || afterWarehouseQty < -0.000001) {
      throw new AppError(`Cannot decrease ${product.name}: available warehouse stock is ${beforeWarehouseQty}.`, 422, 'INSUFFICIENT_STOCK', { available_qty: beforeWarehouseQty });
    }

    /*
     * A service holds no inventory, so an adjustment for one is refused.
     * (The zero-stock / zero-all repair paths stay available for cleaning
     * up drift left behind by history.)
     */
    if (isServiceProduct(product)) {
      throw new AppError(`Cannot adjust stock for ${product.name}: it is a service and holds no inventory.`, 422, 'SERVICE_HAS_NO_STOCK');
    }

    const isBatchOrg = batchLedger.isBatchMethod(await batchLedger.getInventoryMethod(connection, orgId));

    /*
     * A positive adjustment puts inventory INTO the system, which for a
     * FIFO/LIFO organization means creating a real layer with a real
     * unit cost. Neither the adjustment form nor stock_adjustments
     * captures any cost (no unit cost, no buy price, no reference cost),
     * and a sale price or the product's last buy price is not the cost of
     * this event. Inventing one would corrupt FIFO/LIFO COGS, so the
     * increase is refused until a deliberate cost policy exists.
     */
    if (isBatchOrg && delta > 0) {
      throw new AppError('A stock increase cannot be recorded for a FIFO/LIFO organization: it would create an inventory layer with no captured cost. Adjust the stock up through a purchase (which carries a cost), or add a cost policy to stock adjustments first.', 409, 'ADJUSTMENT_COST_POLICY_REQUIRED');
    }

    // Keep the established aggregate and warehouse balances in lockstep.
    await productRepository.adjustQuantity(connection, { orgId, productId: data.product_id, delta });
    await warehouseProductRepository.adjustQuantity(connection, { orgId, userId, warehouseId: data.warehouse_id,
      productId: data.product_id, productUnitId: warehouseStock?.product_unit_id || product.product_unit_id, delta });
    const adjustmentId = await adjustmentRepository.create(connection, { orgId, userId, productId: data.product_id,
      warehouseId: data.warehouse_id, adjustmentType: data.adjustment_type, qty, reason: data.reason, note: data.note,
      beforeQty, afterQty, beforeWarehouseQty, afterWarehouseQty });

    /*
     * A negative adjustment has to draw down the actual layers using the
     * organization's costing order, so product/warehouse stock and the
     * layer totals stay equal. A shortfall throws here and rolls the whole
     * adjustment back.
     */
    if (isBatchOrg) {
      await batchLedger.consumeAdjustmentBatches(connection, { orgId, userId, adjustmentId,
        warehouseId: data.warehouse_id, productId: data.product_id, quantity: qty });
    }
    // Retain a canonical stock movement for existing stock-history reports.
    await stockTransactionRepository.recordMovement(connection, { orgId, userId, data: { warehouse_id: data.warehouse_id,
      product_id: data.product_id, product_unit_id: warehouseStock?.product_unit_id || product.product_unit_id,
      reference_id: adjustmentId, reference_type: 'stock_adjustment', transaction_type: data.adjustment_type === 'increase' ? 'adjustment_in' : 'adjustment_out',
      quantity: qty, date: new Date(), description: `Stock adjustment: ${data.reason}${data.note ? ` — ${data.note}` : ''}`, status: 1 } });
    await activityRepository.create(connection, { orgId, userId, action: 'create', tableName: 'stock_adjustments', entityId: adjustmentId,
      oldValues: { product_qty: beforeQty, warehouse_qty: beforeWarehouseQty }, newValues: { product_qty: afterQty, warehouse_qty: afterWarehouseQty, ...data },
      description: `${data.adjustment_type === 'increase' ? 'Increased' : 'Decreased'} ${product.name} by ${qty}.`, ...requestContext });
    await connection.commit();
    return getStockAdjustment({ user, adjustmentId });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw new AppError('Stock changed concurrently. Please refresh and try again.', 409, 'STOCK_CONCURRENT_UPDATE');
    }
    throw error;
  } finally { connection.release(); }
}

/**
 * Reset a product's stock to zero.
 *
 * A regular adjustment cannot express this: when stock was never allocated to a
 * warehouse (or its warehouse balance drifted from the aggregate), the decrease
 * is rejected by the insufficient-stock guard above. Zeroing therefore resets
 * the product aggregate and its warehouse balances together, and still records
 * a stock adjustment plus a stock movement so the change is auditable.
 */
async function zeroStockAdjustment({ user, data, requestContext }) {
  const { orgId, userId } = identity(user);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const product = await adjustmentRepository.findProductForUpdate(connection, { orgId, productId: data.product_id });
    if (!product) throw new AppError('The selected product does not exist or is inactive.', 422, 'PRODUCT_NOT_FOUND');
    if (!await adjustmentRepository.warehouseExists(connection, { orgId, warehouseId: data.warehouse_id })) {
      throw new AppError('The selected warehouse does not exist or is inactive.', 422, 'WAREHOUSE_NOT_FOUND');
    }
    const warehouseStock = await adjustmentRepository.findWarehouseForUpdate(connection, { orgId, warehouseId: data.warehouse_id, productId: data.product_id });
    const beforeQty = Number(product.quantity || 0);
    const beforeWarehouseQty = Number(warehouseStock?.quantity || 0);
    if (!beforeQty && !beforeWarehouseQty) {
      throw new AppError(`The stock of ${product.name} is already zero.`, 422, 'STOCK_ALREADY_ZERO');
    }

    // The aggregate and every warehouse balance are cleared, so the product ends
    // up at zero with its balances still adding up.
    const productDelta = -beforeQty;
    const movement = productDelta !== 0 ? productDelta : -beforeWarehouseQty;
    const adjustmentType = movement >= 0 ? 'increase' : 'decrease';
    const qty = Math.abs(movement);

    await productRepository.adjustQuantity(connection, { orgId, productId: data.product_id, delta: productDelta });
    await warehouseProductRepository.zeroQuantities(connection, { orgId, userId, productId: data.product_id });
    // The layers must be cleared with the balances, or they keep holding
    // stock that was just declared gone.
    await batchLedger.zeroProductBatches(connection, { orgId, userId, productId: data.product_id });
    const adjustmentId = await adjustmentRepository.create(connection, { orgId, userId, productId: data.product_id,
      warehouseId: data.warehouse_id, adjustmentType, qty, reason: data.reason, note: data.note,
      beforeQty, afterQty: 0, beforeWarehouseQty, afterWarehouseQty: 0 });
    await stockTransactionRepository.recordMovement(connection, { orgId, userId, data: { warehouse_id: data.warehouse_id,
      product_id: data.product_id, product_unit_id: warehouseStock?.product_unit_id || product.product_unit_id,
      reference_id: adjustmentId, reference_type: 'stock_adjustment', transaction_type: adjustmentType === 'increase' ? 'adjustment_in' : 'adjustment_out',
      quantity: qty, date: new Date(), description: `Stock adjustment: ${data.reason}${data.note ? ` — ${data.note}` : ''}`, status: 1 } });
    await activityRepository.create(connection, { orgId, userId, action: 'create', tableName: 'stock_adjustments', entityId: adjustmentId,
      oldValues: { product_qty: beforeQty, warehouse_qty: beforeWarehouseQty }, newValues: { product_qty: 0, warehouse_qty: 0, ...data },
      description: `Zeroed ${product.name} stock (was ${beforeQty} in total, ${beforeWarehouseQty} in warehouse ${data.warehouse_id}).`, ...requestContext });
    await connection.commit();
    return getStockAdjustment({ user, adjustmentId });
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw new AppError('Stock changed concurrently. Please refresh and try again.', 409, 'STOCK_CONCURRENT_UPDATE');
    }
    throw error;
  } finally { connection.release(); }
}

/**
 * Reset the stock of every product in the organization to zero.
 *
 * This is the catalog-wide version of zeroStockAdjustment, for the same
 * reason: once a product's stock was never allocated to a warehouse, or its
 * warehouse balance drifted away from the aggregate, no ordinary adjustment
 * can take it to zero. Both balances are therefore cleared together, and each
 * affected product still gets an adjustment row, a stock movement and one
 * summary activity entry, so the reset stays visible in the reports.
 */
async function zeroAllStock({ user, data, requestContext }) {
  const { orgId, userId } = identity(user);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { products, balances } = await adjustmentRepository.findZeroableStock(connection, { orgId });
    if (!products.length && !balances.length) {
      throw new AppError('There is no stock left to zero.', 422, 'STOCK_ALREADY_ZERO');
    }

    // Each adjustment names a warehouse, so point it at the warehouse that
    // actually carried the product's stock — the largest balance it has.
    const balancesByProduct = new Map();
    balances.forEach((row) => {
      const quantity = Number(row.quantity || 0);
      const current = balancesByProduct.get(row.product_id);
      if (!current || quantity > current.quantity) {
        balancesByProduct.set(row.product_id, {
          warehouseId: row.warehouse_id,
          quantity,
          productUnitId: row.product_unit_id || row.product_unit_id_fallback,
        });
      }
    });

    // A product can hold stock on its aggregate, on warehouse balances, or on
    // both, so the targets are the union of the two snapshots.
    const targets = new Map();
    products.forEach((row) => targets.set(row.id, { id: row.id, quantity: Number(row.quantity || 0),
      productUnitId: row.product_unit_id }));
    balancesByProduct.forEach((balance, productId) => {
      if (!targets.has(productId)) {
        targets.set(productId, { id: productId, quantity: 0, productUnitId: balance.productUnitId });
      }
    });

    // Products whose stock never reached a warehouse have no balance row to
    // name, and an adjustment always names a warehouse.
    const needsFallbackWarehouse = [...targets.keys()].some((productId) => !balancesByProduct.has(productId));
    const fallbackWarehouseId = await adjustmentRepository.findFirstWarehouse(connection, { orgId });
    if (needsFallbackWarehouse && !fallbackWarehouseId) {
      throw new AppError('No active warehouse exists in this organization.', 422, 'WAREHOUSE_NOT_FOUND');
    }

    const adjustments = [];
    const movements = [];
    let unitsRemoved = 0;
    let unitsAdded = 0;
    targets.forEach((target) => {
      const balance = balancesByProduct.get(target.id);
      const beforeQty = target.quantity;
      const beforeWarehouseQty = balance ? balance.quantity : 0;
      // A product whose aggregate is already zero (or negative) is cleared by
      // its warehouse balances, which makes the movement an increase.
      const delta = -beforeQty;
      const movement = delta !== 0 ? delta : -beforeWarehouseQty;
      const adjustmentType = movement >= 0 ? 'increase' : 'decrease';
      const qty = Math.abs(movement);
      if (movement < 0) unitsRemoved += qty; else unitsAdded += qty;
      const warehouseId = balance ? balance.warehouseId : fallbackWarehouseId;

      adjustments.push({ orgId, userId, productId: target.id, warehouseId, adjustmentType, qty,
        reason: data.reason, note: data.note, beforeQty, afterQty: 0, beforeWarehouseQty, afterWarehouseQty: 0 });
      movements.push({ warehouse_id: warehouseId, product_id: target.id,
        product_unit_id: balance ? balance.productUnitId : target.productUnitId,
        reference_type: 'stock_adjustment',
        transaction_type: adjustmentType === 'increase' ? 'adjustment_in' : 'adjustment_out',
        quantity: qty, date: new Date(), description: `Stock adjustment: ${data.reason}`, status: 1 });
    });

    const adjustmentIds = await adjustmentRepository.createMany(connection, adjustments);
    movements.forEach((movement, index) => { movement.reference_id = adjustmentIds[index]; });

    // Two statements instead of one per product: products and warehouse
    // balances are cleared together, so they stay consistent with each other.
    await productRepository.zeroAllQuantities(connection, { orgId });
    const balancesCleared = await warehouseProductRepository.zeroAllQuantities(connection, { orgId, userId });
    // Same for a catalog-wide reset: every active layer is cleared with it.
    await batchLedger.zeroAllBatches(connection, { orgId, userId });
    await stockTransactionRepository.recordMovements(connection, { orgId, userId, rows: movements });
    await activityRepository.create(connection, { orgId, userId, action: 'create', tableName: 'stock_adjustments',
      entityId: adjustmentIds[0] || null,
      oldValues: { products: adjustments.length, units_removed: unitsRemoved, units_added: unitsAdded },
      newValues: { products: adjustments.length, units_removed: 0, units_added: 0, ...data },
      description: `Zeroed the stock of every product (${adjustments.length} products, ${unitsRemoved} units removed, ${unitsAdded} units added).`,
      ...requestContext });

    await connection.commit();
    return { products_zeroed: adjustments.length, warehouse_balances_zeroed: balancesCleared,
      units_removed: unitsRemoved, units_added: unitsAdded, reason: data.reason, note: data.note };
  } catch (error) {
    await connection.rollback();
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT') {
      throw new AppError('Stock changed concurrently. Please refresh and try again.', 409, 'STOCK_CONCURRENT_UPDATE');
    }
    throw error;
  } finally { connection.release(); }
}

async function getAdjustmentReport({ user, filters }) {
  const { orgId } = identity(user);
  const rows = await adjustmentRepository.findAll(db, { orgId, productId: filters.product_id, warehouseId: filters.warehouse_id,
    dateFrom: filters.date_from, dateTo: filters.date_to });
  const byProduct = new Map();
  rows.forEach((row) => { const key = row.product_id; const item = byProduct.get(key) || { product_id: key, product_name: row.product_name, total_increase: 0, total_decrease: 0 };
    item[row.adjustment_type === 'increase' ? 'total_increase' : 'total_decrease'] += Number(row.qty); byProduct.set(key, item); });
  return [...byProduct.values()];
}

module.exports = { listStockAdjustments, getStockAdjustment, createStockAdjustment, zeroStockAdjustment,
  zeroAllStock, getAdjustmentReport };
