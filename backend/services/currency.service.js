const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const currencyRepository =
  require('../repositories/currency.repository');

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

async function listCurrencies({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return currencyRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
    },
  );
}

async function getCurrency({
  user,
  currencyId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const currency =
    await currencyRepository.findByLocalId(
      db,
      {
        orgId,
        localId: currencyId,
      },
    );

  if (!currency) {
    throw new AppError(
      'Currency not found.',
      404,
      'CURRENCY_NOT_FOUND',
    );
  }

  return currency;
}

async function createCurrency({
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

    const currency =
      await currencyRepository.create(
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
        tableName: 'currencies',
        entityId: currency.id,

        oldValues: null,
        newValues: currency,

        description:
          `Created currency ${currency.code}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return currency;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateCurrency({
  user,
  currencyId,
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

    const oldCurrency =
      await currencyRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: currencyId,
          forUpdate: true,
        },
      );

    if (!oldCurrency) {
      throw new AppError(
        'Currency not found.',
        404,
        'CURRENCY_NOT_FOUND',
      );
    }

    const updatedCurrency =
      await currencyRepository.update(
        connection,
        {
          orgId,
          localId: currencyId,
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
        tableName: 'currencies',
        entityId: updatedCurrency.id,

        oldValues: oldCurrency,
        newValues: updatedCurrency,

        description:
          `Updated currency ${updatedCurrency.code}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedCurrency;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteCurrency({
  user,
  currencyId,
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

    const oldCurrency =
      await currencyRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: currencyId,
          forUpdate: true,
        },
      );

    if (!oldCurrency) {
      throw new AppError(
        'Currency not found.',
        404,
        'CURRENCY_NOT_FOUND',
      );
    }

    if (Number(oldCurrency.status) === 0) {
      throw new AppError(
        'Currency is already deleted.',
        409,
        'CURRENCY_ALREADY_DELETED',
      );
    }

    const deletedCurrency =
      await currencyRepository.softDelete(
        connection,
        {
          orgId,
          localId: currencyId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'currencies',
        entityId: deletedCurrency.id,

        oldValues: oldCurrency,
        newValues: deletedCurrency,

        description:
          `Deleted currency ${oldCurrency.code}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedCurrency;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listCurrencies,
  getCurrency,
  createCurrency,
  updateCurrency,
  deleteCurrency,
};
