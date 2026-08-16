const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const buildingRepository =
  require('../repositories/building.repository');

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

async function listBuildings({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return buildingRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      pagination,
    },
  );
}

async function getBuilding({
  user,
  buildingId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await buildingRepository.findByLocalId(
      db,
      {
        orgId,
        localId: buildingId,
      },
    );

  if (!record) {
    throw new AppError(
      'Building not found.',
      404,
      'BUILDINGS_NOT_FOUND',
    );
  }

  return record;
}

async function createBuilding({
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
      await buildingRepository.create(
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
        tableName: 'buildings',
        entityId: record.id,

        oldValues: null,
        newValues: record,

        description:
          `Created building ${record.name || record.id}`,

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

async function updateBuilding({
  user,
  buildingId,
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
      await buildingRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: buildingId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Building not found.',
        404,
        'BUILDINGS_NOT_FOUND',
      );
    }

    const updated =
      await buildingRepository.update(
        connection,
        {
          orgId,
          localId: buildingId,
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
        tableName: 'buildings',
        entityId: updated.id,

        oldValues: oldRecord,
        newValues: updated,

        description:
          `Updated building ${updated.name || updated.id}`,

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

async function deleteBuilding({
  user,
  buildingId,
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
      await buildingRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: buildingId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Building not found.',
        404,
        'BUILDINGS_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Building is already deleted.',
        409,
        'BUILDINGS_ALREADY_DELETED',
      );
    }

    const deleted =
      await buildingRepository.softDelete(
        connection,
        {
          orgId,
          localId: buildingId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'buildings',
        entityId: deleted.id,

        oldValues: oldRecord,
        newValues: deleted,

        description:
          `Deleted building ${oldRecord.name || oldRecord.id}`,

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
  listBuildings,
  getBuilding,
  createBuilding,
  updateBuilding,
  deleteBuilding,
};
