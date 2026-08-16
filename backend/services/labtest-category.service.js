const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const labtestCategoryRepository =
  require('../repositories/labtest-category.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError('Invalid authenticated user.', 401, 'INVALID_USER');
  }

  return { orgId, userId };
}

async function listLabtestCategories({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return labtestCategoryRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getLabtestCategory({
  user,
  labtestCategoryId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await labtestCategoryRepository.findByLocalId(
      db,
      {
        orgId,
        localId: labtestCategoryId,
      },
    );

  if (!record) {
    throw new AppError(
      'Lab test category not found.',
      404,
      'LABTEST_CATEGORIES_NOT_FOUND',
    );
  }

  return record;
}

async function createLabtestCategory({
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

    const record =
      await labtestCategoryRepository.create(
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
        tableName: 'labtest_categories',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created lab test category ${record.name || record.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return record;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateLabtestCategory({
  user,
  labtestCategoryId,
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

    const oldRecord =
      await labtestCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestCategoryId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test category not found.',
        404,
        'LABTEST_CATEGORIES_NOT_FOUND',
      );
    }

    const updated =
      await labtestCategoryRepository.update(
        connection,
        {
          orgId,
          localId: labtestCategoryId,
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
        tableName: 'labtest_categories',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated lab test category ${updated.name || updated.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteLabtestCategory({
  user,
  labtestCategoryId,
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

    const oldRecord =
      await labtestCategoryRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestCategoryId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test category not found.',
        404,
        'LABTEST_CATEGORIES_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Lab test category is already deleted.',
        409,
        'LABTEST_CATEGORIES_ALREADY_DELETED',
      );
    }

    const deleted =
      await labtestCategoryRepository.softDelete(
        connection,
        {
          orgId,
          localId: labtestCategoryId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'labtest_categories',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted lab test category ${oldRecord.name || oldRecord.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deleted;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listLabtestCategories,
  getLabtestCategory,
  createLabtestCategory,
  updateLabtestCategory,
  deleteLabtestCategory,
};
