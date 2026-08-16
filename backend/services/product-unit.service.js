const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productUnitRepository =
  require('../repositories/product-unit.repository');

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

async function listProductUnits({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return productUnitRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getProductUnit({
  user,
  productUnitId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const productUnit =
    await productUnitRepository.findByLocalId(
      db,
      {
        orgId,
        localId: productUnitId,
      },
    );

  if (!productUnit) {
    throw new AppError(
      'Product unit not found.',
      404,
      'PRODUCT_UNIT_NOT_FOUND',
    );
  }

  return productUnit;
}

async function createProductUnit({
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

    const productUnit =
      await productUnitRepository.create(
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
        tableName: 'product_units',
        entityId: productUnit.id,

        oldValues: null,
        newValues: productUnit,

        description:
          `Created product unit ${productUnit.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return productUnit;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateProductUnit({
  user,
  productUnitId,
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

    const oldProductUnit =
      await productUnitRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productUnitId,
          forUpdate: true,
        },
      );

    if (!oldProductUnit) {
      throw new AppError(
        'Product unit not found.',
        404,
        'PRODUCT_UNIT_NOT_FOUND',
      );
    }

    const updatedProductUnit =
      await productUnitRepository.update(
        connection,
        {
          orgId,
          localId: productUnitId,
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
        tableName: 'product_units',
        entityId: updatedProductUnit.id,

        oldValues: oldProductUnit,
        newValues: updatedProductUnit,

        description:
          `Updated product unit ${updatedProductUnit.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedProductUnit;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteProductUnit({
  user,
  productUnitId,
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

    const oldProductUnit =
      await productUnitRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: productUnitId,
          forUpdate: true,
        },
      );

    if (!oldProductUnit) {
      throw new AppError(
        'Product unit not found.',
        404,
        'PRODUCT_UNIT_NOT_FOUND',
      );
    }

    if (Number(oldProductUnit.status) === 0) {
      throw new AppError(
        'Product unit is already deleted.',
        409,
        'PRODUCT_UNIT_ALREADY_DELETED',
      );
    }

    const deletedProductUnit =
      await productUnitRepository.softDelete(
        connection,
        {
          orgId,
          localId: productUnitId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'product_units',
        entityId: deletedProductUnit.id,

        oldValues: oldProductUnit,
        newValues: deletedProductUnit,

        description:
          `Deleted product unit ${oldProductUnit.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedProductUnit;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listProductUnits,
  getProductUnit,
  createProductUnit,
  updateProductUnit,
  deleteProductUnit,
};
