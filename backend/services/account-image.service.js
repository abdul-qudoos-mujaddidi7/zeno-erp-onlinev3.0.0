const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const accountImageRepository =
  require('../repositories/account-image.repository');

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

// Activity logs keep metadata only — image is a base64 longtext payload
// (potentially MB) that should not be duplicated into activity_logs.
function imageMetadata(imageRecord) {
  if (!imageRecord) return null;

  return {
    id: imageRecord.id,
    account_id: imageRecord.account_id,
    status: imageRecord.status,
    version: imageRecord.version,
    image_length: imageRecord.image ? imageRecord.image.length : 0,
  };
}

async function listAccountImages({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const accountIds = String(filters.account_ids || '')
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  return accountImageRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      accountId: filters.account_id || null,
      accountIds: accountIds.length ? accountIds : null,
      pagination,
    },
  );
}

async function getAccountImage({
  user,
  accountImageId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const accountImage =
    await accountImageRepository.findByLocalId(
      db,
      {
        orgId,
        localId: accountImageId,
      },
    );

  if (!accountImage) {
    throw new AppError(
      'Account image not found.',
      404,
      'ACCOUNT_IMAGE_NOT_FOUND',
    );
  }

  return accountImage;
}

async function createAccountImage({
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

    const accountImage =
      await accountImageRepository.create(
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
        tableName: 'account_images',
        entityId: accountImage.id,

        oldValues: null,
        newValues: imageMetadata(accountImage),

        description:
          `Created account image for account ${accountImage.account_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return accountImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAccountImage({
  user,
  accountImageId,
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

    const oldAccountImage =
      await accountImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountImageId,
          forUpdate: true,
        },
      );

    if (!oldAccountImage) {
      throw new AppError(
        'Account image not found.',
        404,
        'ACCOUNT_IMAGE_NOT_FOUND',
      );
    }

    const updatedAccountImage =
      await accountImageRepository.update(
        connection,
        {
          orgId,
          localId: accountImageId,
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
        tableName: 'account_images',
        entityId: updatedAccountImage.id,

        oldValues: imageMetadata(oldAccountImage),
        newValues: imageMetadata(updatedAccountImage),

        description:
          `Updated account image for account ${updatedAccountImage.account_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedAccountImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAccountImage({
  user,
  accountImageId,
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

    const oldAccountImage =
      await accountImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountImageId,
          forUpdate: true,
        },
      );

    if (!oldAccountImage) {
      throw new AppError(
        'Account image not found.',
        404,
        'ACCOUNT_IMAGE_NOT_FOUND',
      );
    }

    if (Number(oldAccountImage.status) === 0) {
      throw new AppError(
        'Account image is already deleted.',
        409,
        'ACCOUNT_IMAGE_ALREADY_DELETED',
      );
    }

    const deletedAccountImage =
      await accountImageRepository.softDelete(
        connection,
        {
          orgId,
          localId: accountImageId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'account_images',
        entityId: deletedAccountImage.id,

        oldValues: imageMetadata(oldAccountImage),
        newValues: imageMetadata(deletedAccountImage),

        description:
          `Deleted account image for account ${oldAccountImage.account_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedAccountImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listAccountImages,
  getAccountImage,
  createAccountImage,
  updateAccountImage,
  deleteAccountImage,
};
