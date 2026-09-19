const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const wasteRepository =
  require('../repositories/waste.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const batchLedger =
  require('./batch-ledger.service');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

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

async function applyWasteStock(
  connection,
  {
    orgId,
    userId,
    wasteId,
    warehouseId,
    wasteDate,
    defaultCurrency,
    items,
    sign = -1,
  },
) {
  for (const item of items || []) {
    const enteredQuantity = Number(item.quantity || 0);
    if (enteredQuantity <= 0) continue;

    /*
     * Product and warehouse balances are kept in the product base unit,
     * while the movement keeps the entered quantity together with its
     * product_unit_id (the ledger convention used everywhere else).
     */
    const stockQty = await itemQuantityInProductUnit(
      connection,
      {
        orgId,
        item,
      },
    );

    /* A service is not inventory: it can never be wasted out of stock. */
    if (stockQty.isService) {
      continue;
    }

    const quantity = Number(stockQty.quantity || 0);

    await wasteRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: sign * quantity,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: sign * quantity,
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: warehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: wasteId,
          reference_type: 'waste',
          transaction_type: sign < 0 ? 'waste' : 'waste_revert',
          quantity: sign * enteredQuantity,
          unit_cost: Number(item.unit_price || 0),
          total_cost: sign * Number(item.subtotal || 0),
          currency: item.currency || defaultCurrency || null,
          date: wasteDate || new Date(),
          description: sign < 0
            ? `Waste #${wasteId}`
            : `Waste #${wasteId} reverted`,
          status: 1,
        },
      },
    );
  }
}

async function listWastes({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return wasteRepository.findAll(
    db,
    {
      orgId,
      status: filters.status ?? 1,
      search: filters.search || '',
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      pagination,
    },
  );
}

async function getWaste({
  user,
  wasteId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const waste =
    await wasteRepository.findByLocalId(
      db,
      {
        orgId,
        localId: wasteId,
      },
    );

  if (!waste) {
    throw new AppError(
      'Waste not found.',
      404,
      'WASTE_NOT_FOUND',
    );
  }

  const items =
    await wasteRepository.findItemsByWaste(
      db,
      {
        orgId,
        wasteId,
      },
    );

  return {
    ...waste,
    items,
  };
}

async function createWaste({
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

    const waste =
      await wasteRepository.create(
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
        await wasteRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              waste_id: localId,
            },
          },
        );

      createdItems.push(createdItem);
    }

    if (isConfirmed(data.waste_status)) {
      await applyWasteStock(
        connection,
        {
          orgId,
          userId,
          wasteId: localId,
          warehouseId: data.warehouse_id,
          wasteDate: data.date,
          defaultCurrency: data.currency,
          items: data.items,
          sign: -1,
        },
      );

      await batchLedger.consumeWasteBatches(
        connection,
        {
          orgId,
          userId,
          wasteId: localId,
          warehouseId: data.warehouse_id,
          defaultCurrency: data.currency,
          items: data.items,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'wastes',
        entityId: waste.id,

        oldValues: null,
        newValues: {
          ...waste,
          items: createdItems,
        },

        description:
          `Created waste ${waste.reference_number || `#${waste.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...waste,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateWaste({
  user,
  wasteId,
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

    const oldWaste =
      await wasteRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: wasteId,
          forUpdate: true,
        },
      );

    if (!oldWaste) {
      throw new AppError(
        'Waste not found.',
        404,
        'WASTE_NOT_FOUND',
      );
    }

    const oldItems =
      await wasteRepository.findItemsByWaste(
        connection,
        {
          orgId,
          wasteId,
        },
      );

    const nextStatus =
      data.waste_status ?? oldWaste.waste_status;

    /*
     * Confirmed -> draft: undo the stock movement.
     */
    if (
      isConfirmed(oldWaste.waste_status) &&
      nextStatus &&
      !isConfirmed(nextStatus)
    ) {
      await applyWasteStock(
        connection,
        {
          orgId,
          userId,
          wasteId,
          warehouseId: oldWaste.warehouse_id,
          wasteDate: oldWaste.date,
          defaultCurrency: oldWaste.currency,
          items: oldItems,
          sign: 1,
        },
      );

      await batchLedger.revertWasteBatches(
        connection,
        {
          orgId,
          userId,
          wasteId,
        },
      );
    }

    const updatedWaste =
      await wasteRepository.update(
        connection,
        {
          orgId,
          localId: wasteId,
          userId,
          data,
        },
      );

    await wasteRepository.softDeleteItemsByWaste(
      connection,
      {
        orgId,
        wasteId,
        userId,
      },
    );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await wasteRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              waste_id: wasteId,
            },
          },
        );

      createdItems.push(createdItem);
    }

    /*
     * Draft -> confirmed: apply the stock movement.
     */
    if (
      !isConfirmed(oldWaste.waste_status) &&
      isConfirmed(nextStatus)
    ) {
      await applyWasteStock(
        connection,
        {
          orgId,
          userId,
          wasteId,
          warehouseId: data.warehouse_id ?? oldWaste.warehouse_id,
          wasteDate: data.date ?? oldWaste.date,
          defaultCurrency: data.currency || oldWaste.currency,
          items: createdItems,
          sign: -1,
        },
      );

      await batchLedger.consumeWasteBatches(
        connection,
        {
          orgId,
          userId,
          wasteId,
          warehouseId: data.warehouse_id ?? oldWaste.warehouse_id,
          defaultCurrency: data.currency || oldWaste.currency,
          items: createdItems,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'wastes',
        entityId: wasteId,

        oldValues: {
          ...oldWaste,
          items: oldItems,
        },
        newValues: {
          ...updatedWaste,
          items: createdItems,
        },

        description:
          `Updated waste ${updatedWaste.reference_number || `#${wasteId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...updatedWaste,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteWaste({
  user,
  wasteId,
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

    const oldWaste =
      await wasteRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: wasteId,
          forUpdate: true,
        },
      );

    if (!oldWaste) {
      throw new AppError(
        'Waste not found.',
        404,
        'WASTE_NOT_FOUND',
      );
    }

    if (Number(oldWaste.status) === 0) {
      throw new AppError(
        'Waste is already deleted.',
        409,
        'WASTE_ALREADY_DELETED',
      );
    }

    const oldItems =
      await wasteRepository.findItemsByWaste(
        connection,
        {
          orgId,
          wasteId,
        },
      );

    if (isConfirmed(oldWaste.waste_status)) {
      await applyWasteStock(
        connection,
        {
          orgId,
          userId,
          wasteId,
          warehouseId: oldWaste.warehouse_id,
          wasteDate: oldWaste.date,
          defaultCurrency: oldWaste.currency,
          items: oldItems,
          sign: 1,
        },
      );

      await batchLedger.revertWasteBatches(
        connection,
        {
          orgId,
          userId,
          wasteId,
        },
      );
    }

    const deletedWaste =
      await wasteRepository.softDelete(
        connection,
        {
          orgId,
          localId: wasteId,
          userId,
        },
      );

    await wasteRepository.softDeleteItemsByWaste(
      connection,
      {
        orgId,
        wasteId,
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'wastes',
        entityId: wasteId,

        oldValues: {
          ...oldWaste,
          items: oldItems,
        },
        newValues: deletedWaste,

        description:
          `Deleted waste ${oldWaste.reference_number || `#${wasteId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedWaste;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listWastes,
  getWaste,
  createWaste,
  updateWaste,
  deleteWaste,
};
