const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const workCenterRepository =
  require('../repositories/work-center.repository');

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

async function listWorkCenters({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return workCenterRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getWorkCenter({
  user,
  workCenterId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const workCenter =
    await workCenterRepository.findByLocalId(
      db,
      {
        orgId,
        localId: workCenterId,
      },
    );

  if (!workCenter) {
    throw new AppError(
      'Work center not found.',
      404,
      'WORK_CENTER_NOT_FOUND',
    );
  }

  return workCenter;
}

async function createWorkCenter({
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

    const workCenter =
      await workCenterRepository.create(
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
        tableName: 'work_centers',
        entityId: workCenter.id,

        oldValues: null,
        newValues: workCenter,

        description:
          `Created work center ${workCenter.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return workCenter;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateWorkCenter({
  user,
  workCenterId,
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

    const oldWorkCenter =
      await workCenterRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: workCenterId,
          forUpdate: true,
        },
      );

    if (!oldWorkCenter) {
      throw new AppError(
        'Work center not found.',
        404,
        'WORK_CENTER_NOT_FOUND',
      );
    }

    const updatedWorkCenter =
      await workCenterRepository.update(
        connection,
        {
          orgId,
          localId: workCenterId,
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
        tableName: 'work_centers',
        entityId: updatedWorkCenter.id,

        oldValues: oldWorkCenter,
        newValues: updatedWorkCenter,

        description:
          `Updated work center ${updatedWorkCenter.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedWorkCenter;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteWorkCenter({
  user,
  workCenterId,
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

    const oldWorkCenter =
      await workCenterRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: workCenterId,
          forUpdate: true,
        },
      );

    if (!oldWorkCenter) {
      throw new AppError(
        'Work center not found.',
        404,
        'WORK_CENTER_NOT_FOUND',
      );
    }

    if (Number(oldWorkCenter.status) === 0) {
      throw new AppError(
        'Work center is already deleted.',
        409,
        'WORK_CENTER_ALREADY_DELETED',
      );
    }

    const deletedWorkCenter =
      await workCenterRepository.softDelete(
        connection,
        {
          orgId,
          localId: workCenterId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'work_centers',
        entityId: deletedWorkCenter.id,

        oldValues: oldWorkCenter,
        newValues: deletedWorkCenter,

        description:
          `Deleted work center ${oldWorkCenter.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedWorkCenter;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listWorkCenters,
  getWorkCenter,
  createWorkCenter,
  updateWorkCenter,
  deleteWorkCenter,
};
