const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const stockBatchRepository =
  require('../repositories/stock-batch.repository');

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

async function listStockBatches({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return stockBatchRepository.findAll(
    db,
    {
      orgId,
      filters,
    },
  );
}

async function getStockBatch({
  user,
  stockBatchId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const stockBatch =
    await stockBatchRepository.findByLocalId(
      db,
      {
        orgId,
        localId: stockBatchId,
      },
    );

  if (!stockBatch) {
    throw new AppError(
      'Stock batch not found.',
      404,
      'STOCK_BATCH_NOT_FOUND',
    );
  }

  return stockBatch;
}

async function createStockBatch({
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

    const stockBatch =
      await stockBatchRepository.create(
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
        tableName: 'stock_batches',
        entityId: stockBatch.id,

        oldValues: null,
        newValues: stockBatch,

        description:
          `Created stock batch ${stockBatch.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return stockBatch;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateStockBatch({
  user,
  stockBatchId,
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

    const oldStockBatch =
      await stockBatchRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockBatchId,
          forUpdate: true,
        },
      );

    if (!oldStockBatch) {
      throw new AppError(
        'Stock batch not found.',
        404,
        'STOCK_BATCH_NOT_FOUND',
      );
    }

    const updatedStockBatch =
      await stockBatchRepository.update(
        connection,
        {
          orgId,
          localId: stockBatchId,
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
        tableName: 'stock_batches',
        entityId: updatedStockBatch.id,

        oldValues: oldStockBatch,
        newValues: updatedStockBatch,

        description:
          `Updated stock batch ${updatedStockBatch.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedStockBatch;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteStockBatch({
  user,
  stockBatchId,
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

    const oldStockBatch =
      await stockBatchRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: stockBatchId,
          forUpdate: true,
        },
      );

    if (!oldStockBatch) {
      throw new AppError(
        'Stock batch not found.',
        404,
        'STOCK_BATCH_NOT_FOUND',
      );
    }

    if (Number(oldStockBatch.status) === 0) {
      throw new AppError(
        'Stock batch is already deleted.',
        409,
        'STOCK_BATCH_ALREADY_DELETED',
      );
    }

    const deletedStockBatch =
      await stockBatchRepository.softDelete(
        connection,
        {
          orgId,
          localId: stockBatchId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'stock_batches',
        entityId: deletedStockBatch.id,

        oldValues: oldStockBatch,
        newValues: deletedStockBatch,

        description:
          `Deleted stock batch ${oldStockBatch.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedStockBatch;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listStockBatches,
  getStockBatch,
  createStockBatch,
  updateStockBatch,
  deleteStockBatch,
};
