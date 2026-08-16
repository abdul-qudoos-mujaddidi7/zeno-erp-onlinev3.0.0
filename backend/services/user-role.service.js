const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const userRoleRepository =
  require('../repositories/user-role.repository');

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

async function listUserRoles({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return userRoleRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getUserRole({
  user,
  userRoleId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const userRole =
    await userRoleRepository.findByLocalId(
      db,
      {
        orgId,
        localId: userRoleId,
      },
    );

  if (!userRole) {
    throw new AppError(
      'User role not found.',
      404,
      'USER_ROLE_NOT_FOUND',
    );
  }

  return userRole;
}

async function createUserRole({
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

    const userRole =
      await userRoleRepository.create(
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
        tableName: 'user_roles',
        entityId: userRole.id,

        oldValues: null,
        newValues: userRole,

        description:
          `Created user role ${userRole.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return userRole;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUserRole({
  user,
  userRoleId,
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

    const oldUserRole =
      await userRoleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: userRoleId,
          forUpdate: true,
        },
      );

    if (!oldUserRole) {
      throw new AppError(
        'User role not found.',
        404,
        'USER_ROLE_NOT_FOUND',
      );
    }

    const updatedUserRole =
      await userRoleRepository.update(
        connection,
        {
          orgId,
          localId: userRoleId,
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
        tableName: 'user_roles',
        entityId: updatedUserRole.id,

        oldValues: oldUserRole,
        newValues: updatedUserRole,

        description:
          `Updated user role ${updatedUserRole.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedUserRole;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteUserRole({
  user,
  userRoleId,
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

    const oldUserRole =
      await userRoleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: userRoleId,
          forUpdate: true,
        },
      );

    if (!oldUserRole) {
      throw new AppError(
        'User role not found.',
        404,
        'USER_ROLE_NOT_FOUND',
      );
    }

    if (Number(oldUserRole.status) === 0) {
      throw new AppError(
        'User role is already deleted.',
        409,
        'USER_ROLE_ALREADY_DELETED',
      );
    }

    const deletedUserRole =
      await userRoleRepository.softDelete(
        connection,
        {
          orgId,
          localId: userRoleId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'user_roles',
        entityId: deletedUserRole.id,

        oldValues: oldUserRole,
        newValues: deletedUserRole,

        description:
          `Deleted user role ${oldUserRole.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedUserRole;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listUserRoles,
  getUserRole,
  createUserRole,
  updateUserRole,
  deleteUserRole,
};
