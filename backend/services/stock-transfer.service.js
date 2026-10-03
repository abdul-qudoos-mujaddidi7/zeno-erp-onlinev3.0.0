const db = require('../database/pool');
const dashboardService = require('./dashboard.service');

const AppError =
  require('../errors/AppError');

const stockTransferRepository =
  require('../repositories/stock-transfer.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const journalRepository =
  require('../repositories/journal.repository');

const batchLedger =
  require('./batch-ledger.service');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const fiscalPostingGuard =
  require('./fiscal-posting-guard.service');

const {
  resolvePagination,
} = require('../utils/pagination');

const {
  itemQuantityInProductUnit,
} = require('../utils/unitConversion');

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

function isConfirmed(status) {
  return String(status || '').trim().toLowerCase() === 'confirmed';
}

/*
 * A confirmed transfer moves quantity out of the source warehouse
 * and into the destination warehouse. The total product quantity
 * is unchanged (the movement is warehouse-to-warehouse).
 */
async function applyTransferStock(
  connection,
  {
    orgId,
    userId,
    transferId,
    sourceWarehouseId,
    destWarehouseId,
    transferDate,
    defaultCurrency,
    items,
    sign = -1,
  },
) {
  for (const item of items || []) {
    const enteredQuantity = Number(item.quantity || 0);
    if (enteredQuantity <= 0) continue;

    /*
     * Warehouse balances are kept in the product base unit, while the
     * movement keeps the entered quantity together with its
     * product_unit_id (the ledger convention used everywhere else).
     */
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    /* A service is not inventory: there is nothing to transfer. */
    if (stockQty.isService) {
      continue;
    }

    const quantity = Number(stockQty.quantity || 0);

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: sourceWarehouseId,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: sign * quantity,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: destWarehouseId,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: -sign * quantity,
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: sourceWarehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: transferId,
          reference_type: 'stock_transfer',
          transaction_type: sign < 0 ? 'transfer_out' : 'transfer_out_revert',
          quantity: sign * enteredQuantity,
          unit_cost: Number(item.unit_price || 0),
          total_cost: sign * Number(item.subtotal || 0),
          currency: item.currency || defaultCurrency || null,
          date: transferDate || new Date(),
          description: sign < 0
            ? `Transfer out #${transferId}`
            : `Transfer out #${transferId} reverted`,
          status: 1,
        },
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: destWarehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: transferId,
          reference_type: 'stock_transfer',
          transaction_type: sign < 0 ? 'transfer_in' : 'transfer_in_revert',
          quantity: -sign * enteredQuantity,
          unit_cost: Number(item.unit_price || 0),
          total_cost: -sign * Number(item.subtotal || 0),
          currency: item.currency || defaultCurrency || null,
          date: transferDate || new Date(),
          description: sign < 0
            ? `Transfer in #${transferId}`
            : `Transfer in #${transferId} reverted`,
          status: 1,
        },
      },
    );
  }
}

/*
 * Optional expense journal (mirrors the legacy form: EXPENSES is
 * credited, the treasury / payment account is debited).
 */
async function createTransferJournal(
  connection,
  {
    orgId,
    userId,
    transferId,
    transferDate,
    paymentAmount,
    paymentCurrency,
    paymentDescription,
    paymentAccountId,
  },
) {
  if (!paymentAmount || Number(paymentAmount) <= 0) {
    return;
  }

  /*
   * Step 4.5: the transfer's expense journal is dated with the transfer date,
   * so that is the date that must not fall inside a closed fiscal year.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: transferDate || new Date(),
      operation: 'stock_transfer.journal',
    },
  );

  const expensesAccount =
    await stockTransferRepository.findAccountByCode(
      connection,
      {
        orgId,
        code: 'EXPENSES',
      },
    );

  if (!expensesAccount) {
    throw new AppError(
      'EXPENSES account not found.',
      500,
      'EXPENSES_ACCOUNT_NOT_FOUND',
    );
  }

  const localId = generateLocalId();

  await journalRepository.create(
    connection,
    {
      orgId,
      localId,
      userId,
      data: {
        date: transferDate || new Date(),
        reference_id: transferId,
        reference_type: 'stock_transfer',
        description:
          `Expense for Stock Transfer #${transferId}` +
          (paymentDescription ? ` - ${paymentDescription}` : ''),
        currency: paymentCurrency || null,
        first_entry_account: expensesAccount.id,
        first_entry_debit: 0,
        first_entry_credit: Number(paymentAmount),
        second_entry_account: paymentAccountId ?? null,
        second_entry_debit: Number(paymentAmount),
        second_entry_credit: 0,
        status: 1,
      },
    },
  );
}

async function listStockTransfers({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return stockTransferRepository.findAll(
    db,
    {
      orgId,
      status: filters.status ?? 1,
      search: filters.search || '',
      pagination,
    },
  );
}

async function getStockTransfer({
  user,
  stockTransferId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const stockTransfer =
    await stockTransferRepository.findByLocalId(
      db,
      {
        orgId,
        localId: stockTransferId,
      },
    );

  if (!stockTransfer) {
    throw new AppError(
      'Stock transfer not found.',
      404,
      'STOCK_TRANSFER_NOT_FOUND',
    );
  }

  const items =
    await stockTransferRepository.findItemsByTransfer(
      db,
      {
        orgId,
        transferId: stockTransferId,
      },
    );

  return {
    ...stockTransfer,
    items,
  };
}

async function createStockTransfer({
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

    const stockTransfer =
      await stockTransferRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await stockTransferRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              stock_transfer_id: localId,
            },
          },
        );

      createdItems.push(createdItem);
    }

    if (isConfirmed(data.transfer_status)) {
      await applyTransferStock(
        connection,
        {
          orgId,
          userId,
          transferId: localId,
          sourceWarehouseId: data.warehouse_id,
          destWarehouseId: data.to_warehouse_id,
          transferDate: data.transfer_date,
          defaultCurrency: data.currency,
          items: data.items,
          sign: -1,
        },
      );

      await batchLedger.transferBatches(
        connection,
        {
          orgId,
          userId,
          transferId: localId,
          sourceWarehouseId: data.warehouse_id,
          destWarehouseId: data.to_warehouse_id,
          receivedAt: data.transfer_date,
          defaultCurrency: data.currency,
          items: data.items,
        },
      );

      await createTransferJournal(
        connection,
        {
          orgId,
          userId,
          transferId: localId,
          transferDate: data.transfer_date,
          paymentAmount: data.payment_amount,
          paymentCurrency: data.payment_currency,
          paymentDescription: data.payment_description,
          paymentAccountId: data.payment_account_id,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'stock_transfers',
        entityId: stockTransfer.id,

        oldValues: null,
        newValues: {
          ...stockTransfer,
          items: createdItems,
        },

        description:
          `Created stock transfer ${stockTransfer.transfer_number || `#${stockTransfer.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Stock (and therefore the overview's inventory value / low stock) changed. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...stockTransfer,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStockTransfer({
  user,
  stockTransferId,
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

    const oldStockTransfer =
      await stockTransferRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockTransferId,
          forUpdate: true,
        },
      );

    if (!oldStockTransfer) {
      throw new AppError(
        'Stock transfer not found.',
        404,
        'STOCK_TRANSFER_NOT_FOUND',
      );
    }

    const oldItems =
      await stockTransferRepository.findItemsByTransfer(
        connection,
        {
          orgId,
          transferId: stockTransferId,
        },
      );

    const nextStatus =
      data.transfer_status ?? oldStockTransfer.transfer_status;

    /*
     * Any edit of a confirmed transfer must first undo its old stock,
     * batch and journal effects. Confirmed replacements are reapplied below.
     */
    if (isConfirmed(oldStockTransfer.transfer_status)) {
      await applyTransferStock(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
          sourceWarehouseId: oldStockTransfer.warehouse_id,
          destWarehouseId: oldStockTransfer.to_warehouse_id,
          transferDate: oldStockTransfer.transfer_date,
          defaultCurrency: oldStockTransfer.currency,
          items: oldItems,
          sign: 1,
        },
      );

      await batchLedger.revertTransferBatches(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: stockTransferId,
          referenceType: 'stock_transfer',
          userId,
        },
      );
    }

    const updatedStockTransfer =
      await stockTransferRepository.update(
        connection,
        {
          orgId,
          localId: stockTransferId,
          userId,
          data,
        },
      );

    await stockTransferRepository.softDeleteItemsByTransfer(
      connection,
      {
        orgId,
        transferId: stockTransferId,
        userId,
      },
    );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await stockTransferRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              stock_transfer_id: stockTransferId,
            },
          },
        );

      createdItems.push(createdItem);
    }

    /* Apply the current values whenever the resulting transfer is confirmed. */
    if (isConfirmed(nextStatus)) {
      await applyTransferStock(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
          sourceWarehouseId: data.warehouse_id ?? oldStockTransfer.warehouse_id,
          destWarehouseId: data.to_warehouse_id ?? oldStockTransfer.to_warehouse_id,
          transferDate: data.transfer_date ?? oldStockTransfer.transfer_date,
          defaultCurrency: data.currency || oldStockTransfer.currency,
          items: createdItems,
          sign: -1,
        },
      );

      await batchLedger.transferBatches(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
          sourceWarehouseId: data.warehouse_id ?? oldStockTransfer.warehouse_id,
          destWarehouseId: data.to_warehouse_id ?? oldStockTransfer.to_warehouse_id,
          receivedAt: data.transfer_date ?? oldStockTransfer.transfer_date,
          defaultCurrency: data.currency || oldStockTransfer.currency,
          items: createdItems,
        },
      );

      await createTransferJournal(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
          transferDate: data.transfer_date ?? oldStockTransfer.transfer_date,
          paymentAmount: data.payment_amount,
          paymentCurrency: data.payment_currency,
          paymentDescription: data.payment_description,
          paymentAccountId: data.payment_account_id,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'stock_transfers',
        entityId: stockTransferId,

        oldValues: {
          ...oldStockTransfer,
          items: oldItems,
        },
        newValues: {
          ...updatedStockTransfer,
          items: createdItems,
        },

        description:
          `Updated stock transfer ${updatedStockTransfer.transfer_number || `#${stockTransferId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Stock (and therefore the overview's inventory value / low stock) changed. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...updatedStockTransfer,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteStockTransfer({
  user,
  stockTransferId,
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

    const oldStockTransfer =
      await stockTransferRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockTransferId,
          forUpdate: true,
        },
      );

    if (!oldStockTransfer) {
      throw new AppError(
        'Stock transfer not found.',
        404,
        'STOCK_TRANSFER_NOT_FOUND',
      );
    }

    if (Number(oldStockTransfer.status) === 0) {
      throw new AppError(
        'Stock transfer is already deleted.',
        409,
        'STOCK_TRANSFER_ALREADY_DELETED',
      );
    }

    const oldItems =
      await stockTransferRepository.findItemsByTransfer(
        connection,
        {
          orgId,
          transferId: stockTransferId,
        },
      );

    if (isConfirmed(oldStockTransfer.transfer_status)) {
      await applyTransferStock(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
          sourceWarehouseId: oldStockTransfer.warehouse_id,
          destWarehouseId: oldStockTransfer.to_warehouse_id,
          transferDate: oldStockTransfer.transfer_date,
          defaultCurrency: oldStockTransfer.currency,
          items: oldItems,
          sign: 1,
        },
      );

      await batchLedger.revertTransferBatches(
        connection,
        {
          orgId,
          userId,
          transferId: stockTransferId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: stockTransferId,
          referenceType: 'stock_transfer',
          userId,
        },
      );
    }

    const deletedStockTransfer =
      await stockTransferRepository.softDelete(
        connection,
        {
          orgId,
          localId: stockTransferId,
          userId,
        },
      );

    await stockTransferRepository.softDeleteItemsByTransfer(
      connection,
      {
        orgId,
        transferId: stockTransferId,
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'stock_transfers',
        entityId: stockTransferId,

        oldValues: {
          ...oldStockTransfer,
          items: oldItems,
        },
        newValues: deletedStockTransfer,

        description:
          `Deleted stock transfer ${oldStockTransfer.transfer_number || `#${stockTransferId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Stock (and therefore the overview's inventory value / low stock) changed. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return deletedStockTransfer;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listStockTransfers,
  getStockTransfer,
  createStockTransfer,
  updateStockTransfer,
  deleteStockTransfer,
};
