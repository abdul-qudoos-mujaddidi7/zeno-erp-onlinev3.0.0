const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

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

async function listWarehouseProducts({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return warehouseProductRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      warehouseId: filters.warehouse_id,
      productId: filters.product_id,
      /* null unless the caller sent page/limit/offset. */
      pagination: resolvePagination(filters),
    },
  );
}

async function getWarehouseProduct({
  user,
  warehouseProductId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const warehouseProduct =
    await warehouseProductRepository.findByLocalId(
      db,
      {
        orgId,
        localId: warehouseProductId,
      },
    );

  if (!warehouseProduct) {
    throw new AppError(
      'Warehouse product not found.',
      404,
      'WAREHOUSE_PRODUCT_NOT_FOUND',
    );
  }

  return warehouseProduct;
}

async function createWarehouseProduct({
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

    const warehouseProduct =
      await warehouseProductRepository.create(
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
        tableName: 'warehouse_products',
        entityId: warehouseProduct.id,

        oldValues: null,
        newValues: warehouseProduct,

        description:
          `Created warehouse product #${warehouseProduct.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return warehouseProduct;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateWarehouseProduct({
  user,
  warehouseProductId,
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

    const oldWarehouseProduct =
      await warehouseProductRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: warehouseProductId,
          forUpdate: true,
        },
      );

    if (!oldWarehouseProduct) {
      throw new AppError(
        'Warehouse product not found.',
        404,
        'WAREHOUSE_PRODUCT_NOT_FOUND',
      );
    }

    const updatedWarehouseProduct =
      await warehouseProductRepository.update(
        connection,
        {
          orgId,
          localId: warehouseProductId,
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
        tableName: 'warehouse_products',
        entityId: warehouseProductId,

        oldValues: oldWarehouseProduct,
        newValues: updatedWarehouseProduct,

        description:
          `Updated warehouse product #${warehouseProductId}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedWarehouseProduct;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteWarehouseProduct({
  user,
  warehouseProductId,
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

    const oldWarehouseProduct =
      await warehouseProductRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: warehouseProductId,
          forUpdate: true,
        },
      );

    if (!oldWarehouseProduct) {
      throw new AppError(
        'Warehouse product not found.',
        404,
        'WAREHOUSE_PRODUCT_NOT_FOUND',
      );
    }

    if (Number(oldWarehouseProduct.status) === 0) {
      throw new AppError(
        'Warehouse product is already deleted.',
        409,
        'WAREHOUSE_PRODUCT_ALREADY_DELETED',
      );
    }

    const deletedWarehouseProduct =
      await warehouseProductRepository.softDelete(
        connection,
        {
          orgId,
          localId: warehouseProductId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'warehouse_products',
        entityId: deletedWarehouseProduct.id,

        oldValues: oldWarehouseProduct,
        newValues: deletedWarehouseProduct,

        description:
          `Deleted warehouse product #${warehouseProductId}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedWarehouseProduct;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listWarehouseProducts,
  getWarehouseProduct,
  createWarehouseProduct,
  updateWarehouseProduct,
  deleteWarehouseProduct,
};
