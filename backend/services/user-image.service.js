const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const userImageRepository =
  require('../repositories/user-image.repository');

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

function imageMetadata(imageRecord) {
  if (!imageRecord) return null;

  return {
    id: imageRecord.id,
    user_id: imageRecord.user_id,
    status: imageRecord.status,
    version: imageRecord.version,
    image_length: imageRecord.image ? imageRecord.image.length : 0,
  };
}

async function listUserImages({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return userImageRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      userId: filters.user_id || null,
    },
  );
}

async function getUserImage({
  user,
  userImageId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const userImage =
    await userImageRepository.findByLocalId(
      db,
      {
        orgId,
        localId: userImageId,
      },
    );

  if (!userImage) {
    throw new AppError(
      'User image not found.',
      404,
      'USER_IMAGE_NOT_FOUND',
    );
  }

  return userImage;
}

async function createUserImage({
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

    const userImage =
      await userImageRepository.create(
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
        tableName: 'user_images',
        entityId: userImage.id,

        oldValues: null,
        newValues: imageMetadata(userImage),

        description:
          `Created user image for user ${userImage.user_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return userImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateUserImage({
  user,
  userImageId,
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

    const oldUserImage =
      await userImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: userImageId,
          forUpdate: true,
        },
      );

    if (!oldUserImage) {
      throw new AppError(
        'User image not found.',
        404,
        'USER_IMAGE_NOT_FOUND',
      );
    }

    const updatedUserImage =
      await userImageRepository.update(
        connection,
        {
          orgId,
          localId: userImageId,
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
        tableName: 'user_images',
        entityId: updatedUserImage.id,

        oldValues: imageMetadata(oldUserImage),
        newValues: imageMetadata(updatedUserImage),

        description:
          `Updated user image for user ${updatedUserImage.user_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedUserImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteUserImage({
  user,
  userImageId,
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

    const oldUserImage =
      await userImageRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: userImageId,
          forUpdate: true,
        },
      );

    if (!oldUserImage) {
      throw new AppError(
        'User image not found.',
        404,
        'USER_IMAGE_NOT_FOUND',
      );
    }

    if (Number(oldUserImage.status) === 0) {
      throw new AppError(
        'User image is already deleted.',
        409,
        'USER_IMAGE_ALREADY_DELETED',
      );
    }

    const deletedUserImage =
      await userImageRepository.softDelete(
        connection,
        {
          orgId,
          localId: userImageId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'user_images',
        entityId: deletedUserImage.id,

        oldValues: imageMetadata(oldUserImage),
        newValues: imageMetadata(deletedUserImage),

        description:
          `Deleted user image for user ${oldUserImage.user_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedUserImage;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listUserImages,
  getUserImage,
  createUserImage,
  updateUserImage,
  deleteUserImage,
};
