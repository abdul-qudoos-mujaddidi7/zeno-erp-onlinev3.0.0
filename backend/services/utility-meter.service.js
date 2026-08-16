const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const utilityMeterRepository =
  require('../repositories/utility-meter.repository');

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

async function listUtilityMeters({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return utilityMeterRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      apartmentId: filters.apartment_id || null,
      pagination,
    },
  );
}

async function getUtilityMeter({
  user,
  utilityMeterId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await utilityMeterRepository.findByLocalId(
      db,
      {
        orgId,
        localId: utilityMeterId,
      },
    );

  if (!record) {
    throw new AppError(
      'Utility meter not found.',
      404,
      'UTILITY_METERS_NOT_FOUND',
    );
  }

  return record;
}

async function createUtilityMeter({
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
      await utilityMeterRepository.create(
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
        tableName: 'utility_meters',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created utility meter ${record.meter_number || record.id}`,

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

async function updateUtilityMeter({
  user,
  utilityMeterId,
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
      await utilityMeterRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: utilityMeterId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Utility meter not found.',
        404,
        'UTILITY_METERS_NOT_FOUND',
      );
    }

    const updated =
      await utilityMeterRepository.update(
        connection,
        {
          orgId,
          localId: utilityMeterId,
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
        tableName: 'utility_meters',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated utility meter ${updated.meter_number || updated.id}`,

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

async function deleteUtilityMeter({
  user,
  utilityMeterId,
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
      await utilityMeterRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: utilityMeterId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Utility meter not found.',
        404,
        'UTILITY_METERS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Utility meter is already deleted.',
        409,
        'UTILITY_METERS_ALREADY_DELETED',
      );
    }

    const deleted =
      await utilityMeterRepository.softDelete(
        connection,
        {
          orgId,
          localId: utilityMeterId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'utility_meters',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted utility meter ${oldRecord.meter_number || oldRecord.id}`,

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
  listUtilityMeters,
  getUtilityMeter,
  createUtilityMeter,
  updateUtilityMeter,
  deleteUtilityMeter,
};
