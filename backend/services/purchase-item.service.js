const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const purchaseItemRepository =
  require('../repositories/purchase-item.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

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

async function listPurchaseItems({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return purchaseItemRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      purchaseId: filters.purchase_id,
      productId: filters.product_id,
      accountId: filters.account_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      pagination,
    },
  );
}

async function getPurchaseItem({
  user,
  purchaseItemId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await purchaseItemRepository.findByLocalId(
      db,
      {
        orgId,
        localId: purchaseItemId,
      },
    );

  if (!record) {
    throw new AppError(
      'Purchase item not found.',
      404,
      'PURCHASE_ITEM_NOT_FOUND',
    );
  }

  return record;
}

async function createPurchaseItem({
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

    const purchaseItem =
      await purchaseItemRepository.create(
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
        tableName: 'purchase_items',
        entityId: purchaseItem.id,

        oldValues: null,
        newValues: purchaseItem,

        description:
          `Created purchase item ${purchaseItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return purchaseItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePurchaseItem({
  user,
  purchaseItemId,
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

    const oldPurchaseItem =
      await purchaseItemRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: purchaseItemId,
          forUpdate: true,
        },
      );

    if (!oldPurchaseItem) {
      throw new AppError(
        'Purchase item not found.',
        404,
        'PURCHASE_ITEM_NOT_FOUND',
      );
    }

    const updatedPurchaseItem =
      await purchaseItemRepository.update(
        connection,
        {
          orgId,
          localId: purchaseItemId,
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
        tableName: 'purchase_items',
        entityId: updatedPurchaseItem.id,

        oldValues: oldPurchaseItem,
        newValues: updatedPurchaseItem,

        description:
          `Updated purchase item ${updatedPurchaseItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedPurchaseItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePurchaseItem({
  user,
  purchaseItemId,
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

    const oldPurchaseItem =
      await purchaseItemRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: purchaseItemId,
          forUpdate: true,
        },
      );

    if (!oldPurchaseItem) {
      throw new AppError(
        'Purchase item not found.',
        404,
        'PURCHASE_ITEM_NOT_FOUND',
      );
    }

    if (Number(oldPurchaseItem.status) === 0) {
      throw new AppError(
        'Purchase item is already deleted.',
        409,
        'PURCHASE_ITEM_ALREADY_DELETED',
      );
    }

    const deletedPurchaseItem =
      await purchaseItemRepository.softDelete(
        connection,
        {
          orgId,
          localId: purchaseItemId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'purchase_items',
        entityId: deletedPurchaseItem.id,

        oldValues: oldPurchaseItem,
        newValues: deletedPurchaseItem,

        description:
          `Deleted purchase item ${oldPurchaseItem.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedPurchaseItem;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listPurchaseItems,
  getPurchaseItem,
  createPurchaseItem,
  updatePurchaseItem,
  deletePurchaseItem,
};
