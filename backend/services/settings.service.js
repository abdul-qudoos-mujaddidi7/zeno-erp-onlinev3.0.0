const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const settingsRepository =
  require('../repositories/settings.repository');

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

async function listSettings({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return settingsRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      key: filters.key,
      search: filters.search,
    },
  );
}

async function getSetting({
  user,
  settingId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const setting =
    await settingsRepository.findByLocalId(
      db,
      {
        orgId,
        localId: settingId,
      },
    );

  if (!setting) {
    throw new AppError(
      'Setting not found.',
      404,
      'SETTING_NOT_FOUND',
    );
  }

  return setting;
}

async function createSetting({
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

    const setting =
      await settingsRepository.create(
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
        tableName: 'settings',
        entityId: setting.id,

        oldValues: null,
        newValues: setting,

        description:
          `Created setting ${setting.key}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return setting;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateSetting({
  user,
  settingId,
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

    const oldSetting =
      await settingsRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: settingId,
          forUpdate: true,
        },
      );

    if (!oldSetting) {
      throw new AppError(
        'Setting not found.',
        404,
        'SETTING_NOT_FOUND',
      );
    }

    const updatedSetting =
      await settingsRepository.update(
        connection,
        {
          orgId,
          localId: settingId,
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
        tableName: 'settings',
        entityId: updatedSetting.id,

        oldValues: oldSetting,
        newValues: updatedSetting,

        description:
          `Updated setting ${updatedSetting.key}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedSetting;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteSetting({
  user,
  settingId,
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

    const oldSetting =
      await settingsRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: settingId,
          forUpdate: true,
        },
      );

    if (!oldSetting) {
      throw new AppError(
        'Setting not found.',
        404,
        'SETTING_NOT_FOUND',
      );
    }

    if (Number(oldSetting.status) === 0) {
      throw new AppError(
        'Setting is already deleted.',
        409,
        'SETTING_ALREADY_DELETED',
      );
    }

    const deletedSetting =
      await settingsRepository.softDelete(
        connection,
        {
          orgId,
          localId: settingId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'settings',
        entityId: deletedSetting.id,

        oldValues: oldSetting,
        newValues: deletedSetting,

        description:
          `Deleted setting ${oldSetting.key}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedSetting;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listSettings,
  getSetting,
  createSetting,
  updateSetting,
  deleteSetting,
};
