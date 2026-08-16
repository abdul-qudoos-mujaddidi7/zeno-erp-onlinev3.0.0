const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const accountTypeRepository =
  require('../repositories/account-type.repository');

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

async function listAccountTypes({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return accountTypeRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getAccountType({
  user,
  accountTypeId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const accountType =
    await accountTypeRepository.findByLocalId(
      db,
      {
        orgId,
        localId: accountTypeId,
      },
    );

  if (!accountType) {
    throw new AppError(
      'Account type not found.',
      404,
      'ACCOUNT_TYPE_NOT_FOUND',
    );
  }

  return accountType;
}

async function createAccountType({
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

    const accountType =
      await accountTypeRepository.create(
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
        tableName: 'account_types',
        entityId: accountType.id,

        oldValues: null,
        newValues: accountType,

        description:
          `Created account type ${accountType.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return accountType;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAccountType({
  user,
  accountTypeId,
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

    const oldAccountType =
      await accountTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountTypeId,
          forUpdate: true,
        },
      );

    if (!oldAccountType) {
      throw new AppError(
        'Account type not found.',
        404,
        'ACCOUNT_TYPE_NOT_FOUND',
      );
    }

    const updatedAccountType =
      await accountTypeRepository.update(
        connection,
        {
          orgId,
          localId: accountTypeId,
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
        tableName: 'account_types',
        entityId: updatedAccountType.id,

        oldValues: oldAccountType,
        newValues: updatedAccountType,

        description:
          `Updated account type ${updatedAccountType.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedAccountType;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAccountType({
  user,
  accountTypeId,
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

    const oldAccountType =
      await accountTypeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountTypeId,
          forUpdate: true,
        },
      );

    if (!oldAccountType) {
      throw new AppError(
        'Account type not found.',
        404,
        'ACCOUNT_TYPE_NOT_FOUND',
      );
    }

    if (Number(oldAccountType.status) === 0) {
      throw new AppError(
        'Account type is already deleted.',
        409,
        'ACCOUNT_TYPE_ALREADY_DELETED',
      );
    }

    const deletedAccountType =
      await accountTypeRepository.softDelete(
        connection,
        {
          orgId,
          localId: accountTypeId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'account_types',
        entityId: deletedAccountType.id,

        oldValues: oldAccountType,
        newValues: deletedAccountType,

        description:
          `Deleted account type ${oldAccountType.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedAccountType;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listAccountTypes,
  getAccountType,
  createAccountType,
  updateAccountType,
  deleteAccountType,
};
