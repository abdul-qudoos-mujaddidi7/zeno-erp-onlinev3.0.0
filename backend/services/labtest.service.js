const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const labtestRepository =
  require('../repositories/labtest.repository');

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

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new AppError('Invalid authenticated user.', 401, 'INVALID_USER');
  }

  return { orgId, userId };
}

async function listLabtests({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return labtestRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      patientId: filters.patient_id || null,
      labtestTypeId: filters.labtest_type_id || null,
      appointmentId: filters.appointment_id || null,
      pagination,
    },
  );
}

async function getLabtest({
  user,
  labtestId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await labtestRepository.findByLocalId(
      db,
      {
        orgId,
        localId: labtestId,
      },
    );

  if (!record) {
    throw new AppError(
      'Lab test not found.',
      404,
      'LABTESTS_NOT_FOUND',
    );
  }

  return record;
}

async function createLabtest({
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
      await labtestRepository.create(
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
        tableName: 'labtests',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created lab test ${record.name || record.id}`,

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

async function updateLabtest({
  user,
  labtestId,
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
      await labtestRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test not found.',
        404,
        'LABTESTS_NOT_FOUND',
      );
    }

    const updated =
      await labtestRepository.update(
        connection,
        {
          orgId,
          localId: labtestId,
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
        tableName: 'labtests',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated lab test ${updated.name || updated.id}`,

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

async function deleteLabtest({
  user,
  labtestId,
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
      await labtestRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: labtestId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Lab test not found.',
        404,
        'LABTESTS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Lab test is already deleted.',
        409,
        'LABTESTS_ALREADY_DELETED',
      );
    }

    const deleted =
      await labtestRepository.softDelete(
        connection,
        {
          orgId,
          localId: labtestId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'labtests',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted lab test ${oldRecord.name || oldRecord.id}`,

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
  listLabtests,
  getLabtest,
  createLabtest,
  updateLabtest,
  deleteLabtest,
};
