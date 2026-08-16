const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const floorRepository =
  require('../repositories/floor.repository');

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

async function listFloors({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return floorRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      buildingId: filters.building_id ?? null,
      pagination,
    },
  );
}

async function getFloor({
  user,
  floorId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await floorRepository.findByLocalId(
      db,
      {
        orgId,
        localId: floorId,
      },
    );

  if (!record) {
    throw new AppError(
      'Floor not found.',
      404,
      'FLOORS_NOT_FOUND',
    );
  }

  return record;
}

async function createFloor({
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
      await floorRepository.create(
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
        tableName: 'floors',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created floor ${record.floor_number || record.id}`,

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

async function updateFloor({
  user,
  floorId,
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
      await floorRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: floorId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Floor not found.',
        404,
        'FLOORS_NOT_FOUND',
      );
    }

    const updated =
      await floorRepository.update(
        connection,
        {
          orgId,
          localId: floorId,
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
        tableName: 'floors',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated floor ${updated.floor_number || updated.id}`,

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

async function deleteFloor({
  user,
  floorId,
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
      await floorRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: floorId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Floor not found.',
        404,
        'FLOORS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Floor is already deleted.',
        409,
        'FLOORS_ALREADY_DELETED',
      );
    }

    const deleted =
      await floorRepository.softDelete(
        connection,
        {
          orgId,
          localId: floorId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'floors',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted floor ${oldRecord.floor_number || oldRecord.id}`,

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
  listFloors,
  getFloor,
  createFloor,
  updateFloor,
  deleteFloor,
};
