const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const paymentRepository =
  require('../repositories/purchase-payment.repository');

const purchaseRepository =
  require('../repositories/purchase.repository');

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
      parentId: filters.purchase_id || null,
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
      'PURCHASE_PAYMENT not found.',
      404,
      'PURCHASE_PAYMENT_NOT_FOUND',
    );
  }

  return payment;
}

/*
 * The generic endpoint now shares the authoritative purchase-payment
 * algorithm: it posts the payment row, its journals, and recomputes the
 * purchase's remaining inside one transaction. A payment must reference
 * a purchase — a payment row with no bill cannot be reconciled.
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

  const purchaseId = data.purchase_id;

  if (!purchaseId) {
    throw new AppError(
      'purchase_id is required to post a purchase payment.',
      400,
      'PURCHASE_ID_REQUIRED',
    );
  }

  const connection =
    await db.getConnection();

  try {
    await connection.beginTransaction();

    const purchase =
      await purchaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: purchaseId,
          forUpdate: true,
        },
      );

    if (!purchase) {
      throw new AppError(
        'Purchase not found.',
        404,
        'PURCHASE_NOT_FOUND',
      );
    }

    const payment =
      await paymentPosting.postPurchasePaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          requestContext,
          purchase,
          purchaseId,
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
 * place, re-posts the journals against the (possibly new) purchase, and
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
        'PURCHASE_PAYMENT not found.',
        404,
        'PURCHASE_PAYMENT_NOT_FOUND',
      );
    }

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'PURCHASE_PAYMENT is already deleted.',
        409,
        'PURCHASE_PAYMENT_ALREADY_DELETED',
      );
    }

    let newBillId = oldPayment.purchase_id;

    if (data.purchase_id) {
      const purchase = await purchaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: data.purchase_id,
        },
      );

      if (!purchase) {
        throw new AppError(
          'Purchase not found.',
          404,
          'PURCHASE_NOT_FOUND',
        );
      }

      newBillId = data.purchase_id;
    }

    const updatedPayment =
      await paymentPosting.updateBillPaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          requestContext,
          oldPayment,
          isSale: false,
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
        tableName: 'purchase_payments',
        entityId: updatedPayment.id,

        oldValues: oldPayment,
        newValues: updatedPayment,

        description:
          'Updated purchase payment',

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
 * are reversed and the parent purchase's remaining is refreshed
 * atomically.
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
        'PURCHASE_PAYMENT not found.',
        404,
        'PURCHASE_PAYMENT_NOT_FOUND',
      );
    }

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'PURCHASE_PAYMENT is already deleted.',
        409,
        'PURCHASE_PAYMENT_ALREADY_DELETED',
      );
    }

    const deletedPayment =
      await paymentPosting.softDeleteBillPaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          payment: oldPayment,
          isSale: false,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'purchase_payments',
        entityId: deletedPayment.id,

        oldValues: oldPayment,
        newValues: deletedPayment,

        description:
          'Deleted purchase payment',

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
