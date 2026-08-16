const crypto = require('crypto');

const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const userRepository =
  require('../repositories/user.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');
}

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

async function listUsers({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  return userRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      roleId: filters.role_id || null,
      departmentId: filters.department_id || null,
      pagination,
    },
  );
}

async function getUser({
  user,
  userId: targetUserId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const targetUser =
    await userRepository.findByLocalId(
      db,
      {
        orgId,
        localId: targetUserId,
      },
    );

  if (!targetUser) {
    throw new AppError(
      'User not found.',
      404,
      'USER_NOT_FOUND',
    );
  }

  return targetUser;
}

async function assertUniqueFields({
  connection,
  orgId,
  username,
  email,
  excludeLocalId = null,
}) {
  const usernameCount =
    await userRepository.findUsernameCount(
      connection,
      {
        orgId,
        username,
        excludeLocalId,
      },
    );

  if (usernameCount > 0) {
    throw new AppError(
      'Username already exists.',
      409,
      'USERNAME_EXISTS',
    );
  }

  const emailCount =
    await userRepository.findEmailCount(
      connection,
      {
        orgId,
        email,
        excludeLocalId,
      },
    );

  if (emailCount > 0) {
    throw new AppError(
      'Email already exists.',
      409,
      'EMAIL_EXISTS',
    );
  }
}

async function createUser({
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

    await assertUniqueFields({
      connection,
      orgId,
      username: data.username,
      email: data.email,
    });

    const localId = generateLocalId();

    const passwordHash =
      hashPassword(data.password);

    const createdUser =
      await userRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
          passwordHash,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'users',
        entityId: createdUser.id,

        oldValues: null,
        newValues: createdUser,

        description:
          `Created user ${createdUser.username}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return createdUser;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUser({
  user,
  userId: targetUserId,
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

    const oldUser =
      await userRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: targetUserId,
          forUpdate: true,
        },
      );

    if (!oldUser) {
      throw new AppError(
        'User not found.',
        404,
        'USER_NOT_FOUND',
      );
    }

    if (
      data.username !== undefined ||
      data.email !== undefined
    ) {
      await assertUniqueFields({
        connection,
        orgId,
        username:
          data.username !== undefined
            ? data.username
            : oldUser.username,
        email:
          data.email !== undefined
            ? data.email
            : oldUser.email,
        excludeLocalId: targetUserId,
      });
    }

    let passwordHash;
    if (
      data.password !== undefined &&
      data.password !== ''
    ) {
      passwordHash = hashPassword(data.password);
    }

    const updatedUser =
      await userRepository.update(
        connection,
        {
          orgId,
          localId: targetUserId,
          userId,
          data,
          passwordHash,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'users',
        entityId: updatedUser.id,

        oldValues: oldUser,
        newValues: updatedUser,

        description:
          `Updated user ${updatedUser.username}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedUser;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteUser({
  user,
  userId: targetUserId,
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

    const oldUser =
      await userRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: targetUserId,
          forUpdate: true,
        },
      );

    if (!oldUser) {
      throw new AppError(
        'User not found.',
        404,
        'USER_NOT_FOUND',
      );
    }

    if (Number(oldUser.status) === 0) {
      throw new AppError(
        'User is already deleted.',
        409,
        'USER_ALREADY_DELETED',
      );
    }

    const deletedUser =
      await userRepository.softDelete(
        connection,
        {
          orgId,
          localId: targetUserId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'users',
        entityId: deletedUser.id,

        oldValues: oldUser,
        newValues: deletedUser,

        description:
          `Deleted user ${oldUser.username}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedUser;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
