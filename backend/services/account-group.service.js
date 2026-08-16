const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const accountGroupRepository =
  require('../repositories/account-group.repository');

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

async function listAccountGroups({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return accountGroupRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getAccountGroup({
  user,
  accountGroupId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const accountGroup =
    await accountGroupRepository.findByLocalId(
      db,
      {
        orgId,
        localId: accountGroupId,
      },
    );

  if (!accountGroup) {
    throw new AppError(
      'Account group not found.',
      404,
      'ACCOUNT_GROUP_NOT_FOUND',
    );
  }

  return accountGroup;
}

async function createAccountGroup({
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

    const accountGroup =
      await accountGroupRepository.create(
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
        tableName: 'account_groups',
        entityId: accountGroup.id,

        oldValues: null,
        newValues: accountGroup,

        description:
          `Created account group ${accountGroup.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return accountGroup;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAccountGroup({
  user,
  accountGroupId,
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

    const oldAccountGroup =
      await accountGroupRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountGroupId,
          forUpdate: true,
        },
      );

    if (!oldAccountGroup) {
      throw new AppError(
        'Account group not found.',
        404,
        'ACCOUNT_GROUP_NOT_FOUND',
      );
    }

    const updatedAccountGroup =
      await accountGroupRepository.update(
        connection,
        {
          orgId,
          localId: accountGroupId,
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
        tableName: 'account_groups',
        entityId: updatedAccountGroup.id,

        oldValues: oldAccountGroup,
        newValues: updatedAccountGroup,

        description:
          `Updated account group ${updatedAccountGroup.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedAccountGroup;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAccountGroup({
  user,
  accountGroupId,
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

    const oldAccountGroup =
      await accountGroupRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountGroupId,
          forUpdate: true,
        },
      );

    if (!oldAccountGroup) {
      throw new AppError(
        'Account group not found.',
        404,
        'ACCOUNT_GROUP_NOT_FOUND',
      );
    }

    if (Number(oldAccountGroup.status) === 0) {
      throw new AppError(
        'Account group is already deleted.',
        409,
        'ACCOUNT_GROUP_ALREADY_DELETED',
      );
    }

    const deletedAccountGroup =
      await accountGroupRepository.softDelete(
        connection,
        {
          orgId,
          localId: accountGroupId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'account_groups',
        entityId: deletedAccountGroup.id,

        oldValues: oldAccountGroup,
        newValues: deletedAccountGroup,

        description:
          `Deleted account group ${oldAccountGroup.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedAccountGroup;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listAccountGroups,
  getAccountGroup,
  createAccountGroup,
  updateAccountGroup,
  deleteAccountGroup,
};
