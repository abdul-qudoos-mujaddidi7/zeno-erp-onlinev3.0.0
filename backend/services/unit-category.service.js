const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const unitCategoryRepository =
  require('../repositories/unit-category.repository');

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

/**
 * Names are unique per organization in the database, so check first and answer
 * with a readable 409 instead of letting MySQL throw a duplicate-key 500.
 */
async function assertNameIsFree(
  connection,
  {
    orgId,
    name,
    exceptLocalId = null,
  },
) {
  if (!name) {
    return;
  }

  const existing =
    await unitCategoryRepository.findByName(
      connection,
      {
        orgId,
        name,
      },
    );

  if (!existing) {
    return;
  }

  if (
    exceptLocalId &&
    Number(existing.local_id) === Number(exceptLocalId)
  ) {
    return;
  }

  throw new AppError(
    `A unit category named "${name}" already exists.`,
    409,
    'UNIT_CATEGORY_NAME_TAKEN',
  );
}

async function listUnitCategories({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return unitCategoryRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getUnitCategory({
  user,
  unitCategoryId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const unitCategory =
    await unitCategoryRepository.findByLocalId(
      db,
      {
        orgId,
        localId: unitCategoryId,
      },
    );

  if (!unitCategory) {
    throw new AppError(
      'Unit category not found.',
      404,
      'UNIT_CATEGORY_NOT_FOUND',
    );
  }

  return unitCategory;
}

async function createUnitCategory({
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

    await assertNameIsFree(
      connection,
      {
        orgId,
        name: data.name,
      },
    );

    const localId = generateLocalId();

    const unitCategory =
      await unitCategoryRepository.create(
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
        tableName: 'unit_categories',
        entityId: unitCategory.id,

        oldValues: null,
        newValues: unitCategory,

        description:
          `Created unit category ${unitCategory.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return unitCategory;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUnitCategory({
  user,
  unitCategoryId,
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

    const oldUnitCategory =
      await unitCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: unitCategoryId,
          forUpdate: true,
        },
      );

    if (!oldUnitCategory) {
      throw new AppError(
        'Unit category not found.',
        404,
        'UNIT_CATEGORY_NOT_FOUND',
      );
    }

    await assertNameIsFree(
      connection,
      {
        orgId,
        name: data.name,
        exceptLocalId: unitCategoryId,
      },
    );

    const updatedUnitCategory =
      await unitCategoryRepository.update(
        connection,
        {
          orgId,
          localId: unitCategoryId,
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
        tableName: 'unit_categories',
        entityId: updatedUnitCategory.id,

        oldValues: oldUnitCategory,
        newValues: updatedUnitCategory,

        description:
          `Updated unit category ${updatedUnitCategory.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedUnitCategory;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteUnitCategory({
  user,
  unitCategoryId,
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

    const oldUnitCategory =
      await unitCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: unitCategoryId,
          forUpdate: true,
        },
      );

    if (!oldUnitCategory) {
      throw new AppError(
        'Unit category not found.',
        404,
        'UNIT_CATEGORY_NOT_FOUND',
      );
    }

    if (Number(oldUnitCategory.status) === 0) {
      throw new AppError(
        'Unit category is already deleted.',
        409,
        'UNIT_CATEGORY_ALREADY_DELETED',
      );
    }

    /*
     * A unit must always have a category, so a category that still holds units
     * is refused instead of leaving those units pointing at a deleted row.
     * Move the units first, then delete the category.
     */
    const unitsUsingCategory =
      await productUnitRepository.countActiveByCategory(
        connection,
        {
          orgId,
          unitCategoryId,
        },
      );

    if (unitsUsingCategory > 0) {
      throw new AppError(
        `Cannot delete this unit category: ${unitsUsingCategory} unit(s) still use it. Move them to another category first.`,
        409,
        'UNIT_CATEGORY_IN_USE',
      );
    }

    const deletedUnitCategory =
      await unitCategoryRepository.softDelete(
        connection,
        {
          orgId,
          localId: unitCategoryId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'unit_categories',
        entityId: deletedUnitCategory.id,

        oldValues: oldUnitCategory,
        newValues: deletedUnitCategory,

        description:
          `Deleted unit category ${oldUnitCategory.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedUnitCategory;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listUnitCategories,
  getUnitCategory,
  createUnitCategory,
  updateUnitCategory,
  deleteUnitCategory,
};
