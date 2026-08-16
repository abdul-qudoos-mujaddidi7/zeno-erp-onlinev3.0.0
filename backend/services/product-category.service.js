const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const productCategoryRepository =
  require('../repositories/product-category.repository');

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

async function listCategories({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return productCategoryRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getCategory({
  user,
  categoryId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const category =
    await productCategoryRepository.findByLocalId(
      db,
      {
        orgId,
        localId: categoryId,
      },
    );

  if (!category) {
    throw new AppError(
      'Product category not found.',
      404,
      'PRODUCT_CATEGORY_NOT_FOUND',
    );
  }

  return category;
}

async function createCategory({
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

    const category =
      await productCategoryRepository.create(
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
        tableName: 'product_categories',
        entityId: category.id,

        oldValues: null,
        newValues: category,

        description:
          `Created product category ${category.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return category;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateCategory({
  user,
  categoryId,
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

    const oldCategory =
      await productCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: categoryId,
          forUpdate: true,
        },
      );

    if (!oldCategory) {
      throw new AppError(
        'Product category not found.',
        404,
        'PRODUCT_CATEGORY_NOT_FOUND',
      );
    }

    const updatedCategory =
      await productCategoryRepository.update(
        connection,
        {
          orgId,
          localId: categoryId,
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
        tableName: 'product_categories',
        entityId: updatedCategory.id,

        oldValues: oldCategory,
        newValues: updatedCategory,

        description:
          `Updated product category ${updatedCategory.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedCategory;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteCategory({
  user,
  categoryId,
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

    const oldCategory =
      await productCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: categoryId,
          forUpdate: true,
        },
      );

    if (!oldCategory) {
      throw new AppError(
        'Product category not found.',
        404,
        'PRODUCT_CATEGORY_NOT_FOUND',
      );
    }

    if (Number(oldCategory.status) === 0) {
      throw new AppError(
        'Product category is already deleted.',
        409,
        'PRODUCT_CATEGORY_ALREADY_DELETED',
      );
    }

    const deletedCategory =
      await productCategoryRepository.softDelete(
        connection,
        {
          orgId,
          localId: categoryId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'product_categories',
        entityId: deletedCategory.id,

        oldValues: oldCategory,
        newValues: deletedCategory,

        description:
          `Deleted product category ${oldCategory.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedCategory;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};