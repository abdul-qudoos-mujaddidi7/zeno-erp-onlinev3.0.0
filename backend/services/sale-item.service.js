const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const saleItemRepository =
  require('../repositories/sale-item.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

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

async function listSaleItems({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return saleItemRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      saleId: filters.sale_id,
      productId: filters.product_id,
      accountId: filters.account_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
    },
  );
}

async function getSaleItem({
  user,
  saleItemId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const saleItem =
    await saleItemRepository.findByLocalId(
      db,
      {
        orgId,
        localId: saleItemId,
      },
    );

  if (!saleItem) {
    throw new AppError(
      'Sale item not found.',
      404,
      'SALE_ITEM_NOT_FOUND',
    );
  }

  return saleItem;
}

async function createSaleItem({
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

    const saleItem =
      await saleItemRepository.create(
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
        tableName: 'sale_items',
        entityId: saleItem.id,

        oldValues: null,
        newValues: saleItem,

        description:
          `Created sale item ${saleItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return saleItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateSaleItem({
  user,
  saleItemId,
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

    const oldSaleItem =
      await saleItemRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: saleItemId,
          forUpdate: true,
        },
      );

    if (!oldSaleItem) {
      throw new AppError(
        'Sale item not found.',
        404,
        'SALE_ITEM_NOT_FOUND',
      );
    }

    const updatedSaleItem =
      await saleItemRepository.update(
        connection,
        {
          orgId,
          localId: saleItemId,
          userId,
          data,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'sale_items',
        entityId: updatedSaleItem.id,

        oldValues: oldSaleItem,
        newValues: updatedSaleItem,

        description:
          `Updated sale item ${updatedSaleItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedSaleItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteSaleItem({
  user,
  saleItemId,
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

    const oldSaleItem =
      await saleItemRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: saleItemId,
          forUpdate: true,
        },
      );

    if (!oldSaleItem) {
      throw new AppError(
        'Sale item not found.',
        404,
        'SALE_ITEM_NOT_FOUND',
      );
    }

    if (Number(oldSaleItem.status) === 0) {
      throw new AppError(
        'Sale item is already deleted.',
        409,
        'SALE_ITEM_ALREADY_DELETED',
      );
    }

    const deletedSaleItem =
      await saleItemRepository.softDelete(
        connection,
        {
          orgId,
          localId: saleItemId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'sale_items',
        entityId: deletedSaleItem.id,

        oldValues: oldSaleItem,
        newValues: deletedSaleItem,

        description:
          `Deleted sale item ${oldSaleItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedSaleItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listSaleItems,
  getSaleItem,
  createSaleItem,
  updateSaleItem,
  deleteSaleItem,
};
