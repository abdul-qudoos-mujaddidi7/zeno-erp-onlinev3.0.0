const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const labtestTypeRepository =
  require('../repositories/labtest-type.repository');

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

async function listLabtestTypes({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return labtestTypeRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      labtestCategoryId: filters.labtest_category_id || null,
    },
  );
}

async function getLabtestType({
  user,
  labtestTypeId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await labtestTypeRepository.findByLocalId(
      db,
      {
        orgId,
        localId: labtestTypeId,
      },
    );

  if (!record) {
    throw new AppError(
      'Lab test type not found.',
      404,
      'LABTEST_TYPES_NOT_FOUND',
    );
  }

  return record;
}

async function createLabtestType({
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
      await labtestTypeRepository.create(
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
        tableName: 'labtest_types',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created lab test type ${record.name || record.id}`,

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

async function updateLabtestType({
  user,
  labtestTypeId,
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
      await labtestTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestTypeId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test type not found.',
        404,
        'LABTEST_TYPES_NOT_FOUND',
      );
    }

    const updated =
      await labtestTypeRepository.update(
        connection,
        {
          orgId,
          localId: labtestTypeId,
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
        tableName: 'labtest_types',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated lab test type ${updated.name || updated.id}`,

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

async function deleteLabtestType({
  user,
  labtestTypeId,
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
      await labtestTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestTypeId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test type not found.',
        404,
        'LABTEST_TYPES_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Lab test type is already deleted.',
        409,
        'LABTEST_TYPES_ALREADY_DELETED',
      );
    }

    const deleted =
      await labtestTypeRepository.softDelete(
        connection,
        {
          orgId,
          localId: labtestTypeId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'labtest_types',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted lab test type ${oldRecord.name || oldRecord.id}`,

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
  listLabtestTypes,
  getLabtestType,
  createLabtestType,
  updateLabtestType,
  deleteLabtestType,
};
