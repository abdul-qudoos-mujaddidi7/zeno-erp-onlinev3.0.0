const db = require('../database/pool');
const AppError = require('../errors/AppError');
const adjustmentRepository = require('../repositories/stock-adjustment.repository');
const productRepository = require('../repositories/product.repository');
const warehouseProductRepository = require('../repositories/warehouse-product.repository');
const stockTransactionRepository = require('../repositories/stock-transaction.repository');
const activityRepository = require('../repositories/activity.repository');

function identity(user) {
  const orgId = Number(user?.org_id); const userId = Number(user?.local_id);
  if (!Number.isSafeInteger(orgId) || !Number.isSafeInteger(userId) || orgId <= 0 || userId <= 0) {
    throw new AppError('Invalid authenticated user.', 401, 'INVALID_IDENTITY');
  }
  return { orgId, userId };
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

    // Keep the established aggregate and warehouse balances in lockstep.
    await productRepository.adjustQuantity(connection, { orgId, productId: data.product_id, delta });
    await warehouseProductRepository.adjustQuantity(connection, { orgId, userId, warehouseId: data.warehouse_id,
      productId: data.product_id, productUnitId: warehouseStock?.product_unit_id || product.product_unit_id, delta });
    const adjustmentId = await adjustmentRepository.create(connection, { orgId, userId, productId: data.product_id,
      warehouseId: data.warehouse_id, adjustmentType: data.adjustment_type, qty, reason: data.reason, note: data.note,
      beforeQty, afterQty, beforeWarehouseQty, afterWarehouseQty });
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

async function getAdjustmentReport({ user, filters }) {
  const { orgId } = identity(user);
  const rows = await adjustmentRepository.findAll(db, { orgId, productId: filters.product_id, warehouseId: filters.warehouse_id,
    dateFrom: filters.date_from, dateTo: filters.date_to });
  const byProduct = new Map();
  rows.forEach((row) => { const key = row.product_id; const item = byProduct.get(key) || { product_id: key, product_name: row.product_name, total_increase: 0, total_decrease: 0 };
    item[row.adjustment_type === 'increase' ? 'total_increase' : 'total_decrease'] += Number(row.qty); byProduct.set(key, item); });
  return [...byProduct.values()];
}

module.exports = { listStockAdjustments, getStockAdjustment, createStockAdjustment, zeroStockAdjustment, getAdjustmentReport };
