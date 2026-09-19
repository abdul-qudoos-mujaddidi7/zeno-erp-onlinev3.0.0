const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const paymentRepository =
  require('../repositories/sale-payment.repository');

const saleRepository =
  require('../repositories/sale.repository');

const activityRepository =
  require('../repositories/activity.repository');

const paymentPosting =
  require('./payment-posting.service');

const accountService =
  require('./account.service');

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

/*
 * The generic endpoint now shares the authoritative sale-payment
 * algorithm: it posts the payment row, its journals, and recomputes the
 * sale's remaining inside one transaction. A payment must reference a
 * sale — a payment row with no bill cannot be reconciled.
 */
async function createPayment({
  user,
  data,
  requestContext,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const saleId = data.sale_id;

  if (!saleId) {
    throw new AppError(
      'sale_id is required to post a sale payment.',
      400,
      'SALE_ID_REQUIRED',
    );
  }

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const sale =
      await saleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: saleId,
          forUpdate: true,
        },
      );

    if (!sale) {
      throw new AppError(
        'Sale not found.',
        404,
        'SALE_NOT_FOUND',
      );
    }

    const payment =
      await paymentPosting.postSalePaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          requestContext,
          sale,
          saleId,
          data,
        },
      );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return payment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * Updating a payment reverses its existing journals, updates the row in
 * place, re-posts the journals against the (possibly new) sale, and
 * refreshes the remaining on both the old and new bill. The payment row
 * and its journals can never drift apart.
 */
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

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'SALE_PAYMENT is already deleted.',
        409,
        'SALE_PAYMENT_ALREADY_DELETED',
      );
    }

    let newBillId = oldPayment.sale_id;

    if (data.sale_id) {
      const sale = await saleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: data.sale_id,
        },
      );

      if (!sale) {
        throw new AppError(
          'Sale not found.',
          404,
          'SALE_NOT_FOUND',
        );
      }

      newBillId = data.sale_id;
    }

    const updatedPayment =
      await paymentPosting.updateBillPaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          requestContext,
          oldPayment,
          isSale: true,
          data,
          newBillId,
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
          requestContext?.ipAddress,

        sessionId:
          requestContext?.sessionId,

        deviceInfo:
          requestContext?.deviceInfo,
      },
    );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return updatedPayment;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * Deletes a payment through the authoritative service so its journals
 * are reversed and the parent sale's remaining is refreshed atomically.
 */
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
      await paymentPosting.softDeleteBillPaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          payment: oldPayment,
          isSale: true,
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
          requestContext?.ipAddress,

        sessionId:
          requestContext?.sessionId,

        deviceInfo:
          requestContext?.deviceInfo,
      },
    );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

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
