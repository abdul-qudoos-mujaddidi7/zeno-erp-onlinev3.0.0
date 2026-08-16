const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const warehouseRepository =
  require('../repositories/warehouse.repository');

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

async function listWarehouses({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return warehouseRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getWarehouse({
  user,
  warehouseId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const warehouse =
    await warehouseRepository.findByLocalId(
      db,
      {
        orgId,
        localId: warehouseId,
      },
    );

  if (!warehouse) {
    throw new AppError(
      'Warehouse not found.',
      404,
      'WAREHOUSE_NOT_FOUND',
    );
  }

  return warehouse;
}

async function createWarehouse({
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

    const warehouse =
      await warehouseRepository.create(
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
        tableName: 'warehouses',
        entityId: warehouse.id,

        oldValues: null,
        newValues: warehouse,

        description:
          `Created warehouse ${warehouse.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return warehouse;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateWarehouse({
  user,
  warehouseId,
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

    const oldWarehouse =
      await warehouseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: warehouseId,
          forUpdate: true,
        },
      );

    if (!oldWarehouse) {
      throw new AppError(
        'Warehouse not found.',
        404,
        'WAREHOUSE_NOT_FOUND',
      );
    }

    const updatedWarehouse =
      await warehouseRepository.update(
        connection,
        {
          orgId,
          localId: warehouseId,
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
        tableName: 'warehouses',
        entityId: updatedWarehouse.id,

        oldValues: oldWarehouse,
        newValues: updatedWarehouse,

        description:
          `Updated warehouse ${updatedWarehouse.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedWarehouse;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteWarehouse({
  user,
  warehouseId,
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

    const oldWarehouse =
      await warehouseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: warehouseId,
          forUpdate: true,
        },
      );

    if (!oldWarehouse) {
      throw new AppError(
        'Warehouse not found.',
        404,
        'WAREHOUSE_NOT_FOUND',
      );
    }

    if (Number(oldWarehouse.status) === 0) {
      throw new AppError(
        'Warehouse is already deleted.',
        409,
        'WAREHOUSE_ALREADY_DELETED',
      );
    }

    const deletedWarehouse =
      await warehouseRepository.softDelete(
        connection,
        {
          orgId,
          localId: warehouseId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'warehouses',
        entityId: deletedWarehouse.id,

        oldValues: oldWarehouse,
        newValues: deletedWarehouse,

        description:
          `Deleted warehouse ${oldWarehouse.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedWarehouse;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
