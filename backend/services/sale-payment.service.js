const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const paymentRepository =
  require('../repositories/sale-payment.repository');

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

async function listPayments({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return paymentRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      parentId: filters.sale_id || null,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
    },
  );
}

async function getPayment({
  user,
  paymentId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const payment =
    await paymentRepository.findByLocalId(
      db,
      {
        orgId,
        localId: paymentId,
      },
    );

  if (!payment) {
    throw new AppError(
      'SALE_PAYMENT not found.',
      404,
      'SALE_PAYMENT_NOT_FOUND',
    );
  }

  return payment;
}

async function createPayment({
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

    const payment =
      await paymentRepository.create(
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
        tableName: 'sale_payments',
        entityId: payment.id,

        oldValues: null,
        newValues: payment,

        description:
          'Created sale payment',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return payment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePayment({
  user,
  paymentId,
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

    const oldPayment =
      await paymentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: paymentId,
          forUpdate: true,
        },
      );

    if (!oldPayment) {
      throw new AppError(
        'SALE_PAYMENT not found.',
        404,
        'SALE_PAYMENT_NOT_FOUND',
      );
    }

    const updatedPayment =
      await paymentRepository.update(
        connection,
        {
          orgId,
          localId: paymentId,
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
        tableName: 'sale_payments',
        entityId: updatedPayment.id,

        oldValues: oldPayment,
        newValues: updatedPayment,

        description:
          'Updated sale payment',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedPayment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePayment({
  user,
  paymentId,
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

    const oldPayment =
      await paymentRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: paymentId,
          forUpdate: true,
        },
      );

    if (!oldPayment) {
      throw new AppError(
        'SALE_PAYMENT not found.',
        404,
        'SALE_PAYMENT_NOT_FOUND',
      );
    }

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'SALE_PAYMENT is already deleted.',
        409,
        'SALE_PAYMENT_ALREADY_DELETED',
      );
    }

    const deletedPayment =
      await paymentRepository.softDelete(
        connection,
        {
          orgId,
          localId: paymentId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'sale_payments',
        entityId: deletedPayment.id,

        oldValues: oldPayment,
        newValues: deletedPayment,

        description:
          'Deleted sale payment',

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedPayment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
};
