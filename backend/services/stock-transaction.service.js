const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const productRepository =
  require('../repositories/product.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

const activityRepository =
  require('../repositories/activity.repository');

const batchLedger =
  require('./batch-ledger.service');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const INCOMING_STOCK_TYPES = new Set([
  'purchase',
  'sale_return',
  'adjustment_in',
  'transfer_in',
  'production_in',
  'waste_revert',
  'purchase_return_revert',
  'sale_revert',
  'inventory_record_return',
  'inventory_record_revert',
  'prescription_return',
  'prescription_revert',
  'transfer_out_revert',
]);

const OUTGOING_STOCK_TYPES = new Set([
  'sale',
  'purchase_return',
  'adjustment_out',
  'transfer_out',
  'production_out',
  'waste',
  'purchase_revert',
  'sale_return_revert',
  'inventory_record',
  'inventory_record_return_revert',
  'prescription',
  'prescription_return_revert',
  'transfer_in_revert',
]);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sameId(first, second) {
  return String(first ?? '').trim() === String(second ?? '').trim();
}

function isManualAdjustment(tx) {
  return String(tx?.reference_type || '') === 'manual_adjustment';
}

function isOpeningStockMovement(tx) {
  return (
    isManualAdjustment(tx) &&
    String(tx?.transaction_type || '') === 'adjustment_in'
  );
}

async function setWarehouseBalance(
  connection,
  {
    orgId,
    userId,
    warehouseId,
    productId,
    productUnitId,
    quantity,
  },
) {
  if (!warehouseId || !productId) {
    return;
  }

  const existing =
    await warehouseProductRepository.findByWarehouseProduct(
      connection,
      {
        orgId,
        warehouseId,
        productId,
        forUpdate: true,
      },
    );

  const delta = toNumber(quantity) - toNumber(existing?.quantity);

  await warehouseProductRepository.adjustQuantity(
    connection,
    {
      orgId,
      userId,
      warehouseId,
      productId,
      productUnitId,
      delta,
    },
  );
}

/*
 * Rebuild products.quantity and warehouse_products from the
 * canonical ledger after an opening-stock edit. FIFO/LIFO uses
 * batch remaining; CLASSIC uses signed stock movements. This
 * heals rows that were already saved on the movement but never
 * written to the product/batch balances (e.g. 0 on the report
 * and 60 still on the product).
 */
async function reconcileProductStock(
  connection,
  {
    orgId,
    userId,
    productId,
    productUnitId,
  },
) {
  if (!productId) {
    return;
  }

  const method =
    await batchLedger.getInventoryMethod(connection, orgId);
  const totalsByWarehouse = new Map();

  if (batchLedger.isBatchMethod(method)) {
    const batches =
      await stockBatchRepository.findAll(
        connection,
        {
          orgId,
          filters: {
            product_id: productId,
            status: 1,
          },
        },
      );

    for (const batch of batches) {
      const warehouseKey = String(batch.warehouse_id || '');
      if (!warehouseKey) continue;

      totalsByWarehouse.set(
        warehouseKey,
        toNumber(totalsByWarehouse.get(warehouseKey)) +
          toNumber(batch.quantity_remaining),
      );
    }
  } else {
    const movements =
      await stockTransactionRepository.findAll(
        connection,
        {
          orgId,
          filters: {
            product_id: productId,
            status: 1,
          },
        },
      );

    for (const movement of movements) {
      const warehouseKey = String(movement.warehouse_id || '');
      if (!warehouseKey) continue;

      totalsByWarehouse.set(
        warehouseKey,
        toNumber(totalsByWarehouse.get(warehouseKey)) +
          stockEffect(
            movement.transaction_type,
            movement.quantity,
          ),
      );
    }
  }

  const warehouseRows =
    await warehouseProductRepository.findAll(
      connection,
      {
        orgId,
        productId,
        status: 1,
      },
    );

  for (const row of warehouseRows) {
    const warehouseKey = String(row.warehouse_id || '');
    if (warehouseKey && !totalsByWarehouse.has(warehouseKey)) {
      totalsByWarehouse.set(warehouseKey, 0);
    }
  }

  let total = 0;

  for (const [warehouseId, quantity] of totalsByWarehouse) {
    total += toNumber(quantity);

    await setWarehouseBalance(
      connection,
      {
        orgId,
        userId,
        warehouseId,
        productId,
        productUnitId,
        quantity: toNumber(quantity),
      },
    );
  }

  await productRepository.update(
    connection,
    {
      orgId,
      localId: productId,
      userId,
      data: {
        quantity: total,
      },
    },
  );
}

/*
 * Convert a stock-transaction row into the signed effect it has
 * on products.quantity (incoming adds, outgoing subtracts),
 * regardless of the sign the quantity was stored with.
 */
function stockEffect(transactionType, quantity) {
  const abs = Math.abs(toNumber(quantity));
  const type = String(transactionType || '');

  if (INCOMING_STOCK_TYPES.has(type)) {
    return abs;
  }

  if (OUTGOING_STOCK_TYPES.has(type)) {
    return -abs;
  }

  return toNumber(quantity);
}

async function applyManualAdjustmentInventory(
  connection,
  {
    orgId,
    userId,
    previous,
    next,
  },
) {
  if (!isManualAdjustment(previous) && !isManualAdjustment(next)) {
    return;
  }

  const productId = next.product_id || previous.product_id;
  const oldWarehouseId = previous.warehouse_id;
  const newWarehouseId = next.warehouse_id || previous.warehouse_id;
  const productUnitId =
    next.product_unit_id || previous.product_unit_id;
  const openingQuantity = Math.abs(toNumber(next.quantity));
  const isOpening =
    isOpeningStockMovement(previous) ||
    isOpeningStockMovement(next);

  if (isOpening) {
    await productRepository.update(
      connection,
      {
        orgId,
        localId: productId,
        userId,
        data: {
          initial_quantity: openingQuantity,
          initial_warehouse_id:
            newWarehouseId || oldWarehouseId || null,
        },
      },
    );

    await batchLedger.adjustOpeningStockBatch(
      connection,
      {
        orgId,
        userId,
        productId,
        oldWarehouseId,
        newWarehouseId: newWarehouseId || oldWarehouseId,
        newQuantity: openingQuantity,
        unitCost: next.unit_cost,
        currency: next.currency,
      },
    );

    await reconcileProductStock(
      connection,
      {
        orgId,
        userId,
        productId,
        productUnitId,
      },
    );

    return;
  }

  const oldEffect = stockEffect(
    previous.transaction_type,
    previous.quantity,
  );
  const newEffect = stockEffect(
    next.transaction_type,
    next.quantity,
  );
  const productDelta = newEffect - oldEffect;
  const warehouseChanged = !sameId(oldWarehouseId, newWarehouseId);

  await productRepository.adjustQuantity(
    connection,
    {
      orgId,
      productId,
      delta: productDelta,
    },
  );

  if (warehouseChanged) {
    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: oldWarehouseId,
        productId,
        productUnitId,
        delta: -oldEffect,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: newWarehouseId,
        productId,
        productUnitId,
        delta: newEffect,
      },
    );
  } else {
    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: newWarehouseId || oldWarehouseId,
        productId,
        productUnitId,
        delta: productDelta,
      },
    );
  }
}

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

async function listStockTransactions({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return stockTransactionRepository.findAll(
    db,
    {
      orgId,
      filters,
    },
  );
}

async function getStockTransaction({
  user,
  stockTransactionId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const stockTransaction =
    await stockTransactionRepository.findByLocalId(
      db,
      {
        orgId,
        localId: stockTransactionId,
      },
    );

  if (!stockTransaction) {
    throw new AppError(
      'Stock transaction not found.',
      404,
      'STOCK_TRANSACTION_NOT_FOUND',
    );
  }

  return stockTransaction;
}

async function createStockTransaction({
  user,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const localId = generateLocalId();

    const stockTransaction =
      await stockTransactionRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'stock_transactions',
        entityId: stockTransaction.id,

        oldValues: null,
        newValues: stockTransaction,

        description:
          `Created stock transaction ${stockTransaction.transaction_type}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return stockTransaction;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStockTransaction({
  user,
  stockTransactionId,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldStockTransaction =
      await stockTransactionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockTransactionId,
          forUpdate: true,
        },
      );

    if (!oldStockTransaction) {
      throw new AppError(
        'Stock transaction not found.',
        404,
        'STOCK_TRANSACTION_NOT_FOUND',
      );
    }

    const updatedStockTransaction =
      await stockTransactionRepository.update(
        connection,
        {
          orgId,
          localId: stockTransactionId,
          userId,
          data,
        },
      );

    if (!updatedStockTransaction) {
      throw new AppError(
        'Stock transaction not found.',
        404,
        'STOCK_TRANSACTION_NOT_FOUND',
      );
    }

    await applyManualAdjustmentInventory(
      connection,
      {
        orgId,
        userId,
        previous: oldStockTransaction,
        next: updatedStockTransaction,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'stock_transactions',
        entityId: updatedStockTransaction.id,

        oldValues: oldStockTransaction,
        newValues: updatedStockTransaction,

        description:
          `Updated stock transaction ${updatedStockTransaction.transaction_type}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedStockTransaction;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteStockTransaction({
  user,
  stockTransactionId,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const oldStockTransaction =
      await stockTransactionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockTransactionId,
          forUpdate: true,
        },
      );

    if (!oldStockTransaction) {
      throw new AppError(
        'Stock transaction not found.',
        404,
        'STOCK_TRANSACTION_NOT_FOUND',
      );
    }

    if (Number(oldStockTransaction.status) === 0) {
      throw new AppError(
        'Stock transaction is already deleted.',
        409,
        'STOCK_TRANSACTION_ALREADY_DELETED',
      );
    }

    const deletedStockTransaction =
      await stockTransactionRepository.softDelete(
        connection,
        {
          orgId,
          localId: stockTransactionId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'stock_transactions',
        entityId: deletedStockTransaction.id,

        oldValues: oldStockTransaction,
        newValues: deletedStockTransaction,

        description:
          `Deleted stock transaction ${oldStockTransaction.transaction_type}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedStockTransaction;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listStockTransactions,
  getStockTransaction,
  createStockTransaction,
  updateStockTransaction,
  deleteStockTransaction,
};
