const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const meterReadingRepository =
  require('../repositories/meter-reading.repository');

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

async function listMeterReadings({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return meterReadingRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      meterId: filters.meter_id || null,
      pagination,
    },
  );
}

async function getMeterReading({
  user,
  meterReadingId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await meterReadingRepository.findByLocalId(
      db,
      {
        orgId,
        localId: meterReadingId,
      },
    );

  if (!record) {
    throw new AppError(
      'Meter reading not found.',
      404,
      'METER_READINGS_NOT_FOUND',
    );
  }

  return record;
}

async function createMeterReading({
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
      await meterReadingRepository.create(
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
        tableName: 'meter_readings',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created meter reading ${record.id}`,

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

async function updateMeterReading({
  user,
  meterReadingId,
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
      await meterReadingRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: meterReadingId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Meter reading not found.',
        404,
        'METER_READINGS_NOT_FOUND',
      );
    }

    const updated =
      await meterReadingRepository.update(
        connection,
        {
          orgId,
          localId: meterReadingId,
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
        tableName: 'meter_readings',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated meter reading ${updated.id}`,

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

async function deleteMeterReading({
  user,
  meterReadingId,
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
      await meterReadingRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: meterReadingId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Meter reading not found.',
        404,
        'METER_READINGS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Meter reading is already deleted.',
        409,
        'METER_READINGS_ALREADY_DELETED',
      );
    }

    const deleted =
      await meterReadingRepository.softDelete(
        connection,
        {
          orgId,
          localId: meterReadingId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'meter_readings',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted meter reading ${oldRecord.id}`,

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
  listMeterReadings,
  getMeterReading,
  createMeterReading,
  updateMeterReading,
  deleteMeterReading,
};
