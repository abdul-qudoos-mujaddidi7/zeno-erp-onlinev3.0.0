const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productUnitRepository =
  require('../repositories/product-unit.repository');

const unitCategoryRepository =
  require('../repositories/unit-category.repository');

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
      unitCategoryId: filters.unit_category_id,
    },
  );
}

/**
 * Every unit belongs to a category. A caller-supplied category must belong to
 * the organization, otherwise the unit falls back to the organization's
 * default "General" category, which is created on first use.
 *
 * This is what keeps a newly created unit from ever being category-less even
 * though `product_units.unit_category_id` stays nullable for legacy callers.
 */
async function resolveUnitCategoryId(
  connection,
  {
    orgId,
    userId,
    unitCategoryId,
    fallbackUnitCategoryId = null,
  },
) {
  const requestedUnitCategoryId =
    Number(unitCategoryId) || 0;

  if (requestedUnitCategoryId) {
    const unitCategory =
      await unitCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: requestedUnitCategoryId,
        },
      );

    if (!unitCategory) {
      throw new AppError(
        'Unit category not found.',
        400,
        'UNIT_CATEGORY_NOT_FOUND',
      );
    }

    return requestedUnitCategoryId;
  }

  /* Updating a unit without sending a category must not clear the one it
   * already has. */
  if (Number(fallbackUnitCategoryId)) {
    return Number(fallbackUnitCategoryId);
  }

  const defaultUnitCategory =
    await unitCategoryRepository.ensureDefault(
      connection,
      {
        orgId,
        userId,
        localId: generateLocalId(),
      },
    );

  return Number(
    defaultUnitCategory.local_id ??
    defaultUnitCategory.id,
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

    const unitCategoryId =
      await resolveUnitCategoryId(
        connection,
        {
          orgId,
          userId,
          unitCategoryId: data.unit_category_id,
        },
      );

    const productUnit =
      await productUnitRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data: {
            ...data,
            unit_category_id: unitCategoryId,
          },
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

    const unitCategoryId =
      await resolveUnitCategoryId(
        connection,
        {
          orgId,
          userId,
          unitCategoryId: data.unit_category_id,
          fallbackUnitCategoryId:
            oldProductUnit.unit_category_id,
        },
      );

    const updatedProductUnit =
      await productUnitRepository.update(
        connection,
        {
          orgId,
          localId: productUnitId,
          userId,
          data: {
            ...data,
            unit_category_id: unitCategoryId,
          },
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
