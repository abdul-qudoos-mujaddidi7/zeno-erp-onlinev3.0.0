const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const prescriptionRepository =
  require('../repositories/prescription.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const fiscalPostingGuard =
  require('./fiscal-posting-guard.service');

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

function isConfirmed(prescriptionStatus) {
  return String(prescriptionStatus || '') === 'confirmed';
}

async function createJournalEntry(
  connection,
  {
    orgId,
    userId,
    requestContext,
    data,
    description,
  },
) {
  /*
   * Step 4.5: no journal may be written into a CLOSED fiscal year. Guarding
   * here — not only at each document entry point — covers every call site of
   * this module, present and future, and the guard throws before this
   * transaction can commit any part of the operation.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: data.date,
      operation: 'prescription.journal',
    },
  );

  const localId = generateLocalId();

  const journal =
    await journalRepository.create(
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
      tableName: 'journals',
      entityId: journal.id,

      oldValues: null,
      newValues: journal,

      description:
        description || `Created journal entry ${journal.id}`,

      ipAddress:
        requestContext.ipAddress,

      sessionId:
        requestContext.sessionId,

      deviceInfo:
        requestContext.deviceInfo,
    },
  );

  return journal;
}

async function applyStockOut(
  connection,
  {
    orgId,
    userId,
    prescriptionId,
    warehouseId,
    currency,
    date,
    number,
    items,
  },
) {
  for (const item of items || []) {
    await prescriptionRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: -Number(item.quantity || 0),
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId,
        productId: item.product_id,
        productUnitId: item.product_unit_id,
        delta: -Number(item.quantity || 0),
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: warehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: prescriptionId,
          reference_type: 'prescription',
          transaction_type: 'prescription',
          quantity: -Number(item.quantity || 0),
          unit_cost: Number(item.unit_price ?? 0),
          total_cost: -Number(item.subtotal ?? 0),
          currency: item.currency || currency || null,
          peer_price: Number(item.unit_price ?? 0),
          peer_currency: item.currency || currency || null,
          date: date || new Date(),
          description: `Prescription #${number || ''}`,
          status: 1,
        },
      },
    );
  }
}

async function revertStockOut(
  connection,
  {
    orgId,
    userId,
    prescriptionId,
    warehouseId,
    currency,
    date,
    items,
  },
) {
  for (const item of items || []) {
    if (Number(item.status) === 0) {
      continue;
    }

    await prescriptionRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: Number(item.quantity || 0),
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId,
        productId: item.product_id,
        productUnitId: item.product_unit_id,
        delta: Number(item.quantity || 0),
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: warehouseId,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: prescriptionId,
          reference_type: 'prescription',
          transaction_type: 'prescription_revert',
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_price ?? 0),
          total_cost: Number(item.subtotal ?? 0),
          currency: item.currency || currency || null,
          peer_price: Number(item.unit_price ?? 0),
          peer_currency: item.currency || currency || null,
          date: date || new Date(),
          description: `Deleted/reverted prescription #${prescriptionId}, stock restored`,
          status: 1,
        },
      },
    );
  }
}

async function postPrescriptionJournal(
  connection,
  {
    orgId,
    userId,
    requestContext,
    prescriptionId,
    data,
  },
) {
  const receivableAccount =
    await prescriptionRepository.findAccountByCode(
      connection,
      {
        orgId,
        code: 'RECEIVABLE',
      },
    );

  if (!receivableAccount) {
    throw new AppError(
      'RECEIVABLE account not found.',
      500,
      'RECEIVABLE_ACCOUNT_NOT_FOUND',
    );
  }

  const patientAccountId =
    data.account_id || data.patient_id;

  await createJournalEntry(
    connection,
    {
      orgId,
      userId,
      requestContext,
      data: {
        date: data.prescription_date || null,
        reference_id: prescriptionId,
        reference_type: 'prescription',
        description:
          data.description || `Prescription #${data.prescription_number || ''}`,
        currency: data.currency || null,
        first_entry_account: patientAccountId,
        first_entry_debit: data.total_amount || 0,
        first_entry_credit: 0,
        second_entry_account: receivableAccount.id,
        second_entry_debit: 0,
        second_entry_credit: data.total_amount || 0,
        status: 1,
      },
      description:
        `Created prescription journal for ${prescriptionId}`,
    },
  );
}

async function listPrescriptions({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const result =
    await prescriptionRepository.findAll(
      db,
      {
        orgId,
        status: filters.status,
        prescriptionStatus: filters.prescription_status,
        patientId: filters.patient_id || null,
        doctorId: filters.doctor_id || null,
        appointmentId: filters.appointment_id || null,
        search: filters.search,
        pagination,
      },
    );

  if (Number(filters.relations) === 1) {
    const prescriptions = result.data;
    const prescriptionIds =
      prescriptions.map((row) => row.id);

    const [
      payments,
      returns,
    ] = await Promise.all([
      prescriptionRepository.findPaymentsByPrescriptionIds(
        db,
        {
          orgId,
          prescriptionIds,
        },
      ),
      prescriptionRepository.findReturnsByPrescriptionIds(
        db,
        {
          orgId,
          prescriptionIds,
        },
      ),
    ]);

    const returnItems =
      await prescriptionRepository.findReturnItemsByReturnIds(
        db,
        {
          orgId,
          returnIds: returns.map(
            (row) => row.id,
          ),
        },
      );

    return {
      data: prescriptions.map((prescription) => ({
        ...prescription,
        payments: payments.filter(
          (payment) =>
            payment.prescription_id === prescription.id,
        ),
        returns: returns
          .filter(
            (row) =>
              row.prescription_id === prescription.id,
          )
          .map((row) => ({
            ...row,
            items: returnItems.filter(
              (item) =>
                item.prescription_return_id === row.id,
            ),
          })),
      })),
      meta: result.meta,
    };
  }

  return result;
}

async function getPrescription({
  user,
  prescriptionId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const prescription =
    await prescriptionRepository.findByLocalId(
      db,
      {
        orgId,
        localId: prescriptionId,
      },
    );

  if (!prescription) {
    throw new AppError(
      'Prescription not found.',
      404,
      'PRESCRIPTION_NOT_FOUND',
    );
  }

  const [
    items,
    payments,
    returns,
  ] = await Promise.all([
    prescriptionRepository.findItemsByPrescription(
      db,
      {
        orgId,
        prescriptionId,
      },
    ),
    prescriptionRepository.findPaymentsByPrescription(
      db,
      {
        orgId,
        prescriptionId,
      },
    ),
    prescriptionRepository.findReturnsByPrescription(
      db,
      {
        orgId,
        prescriptionId,
      },
    ),
  ]);

  const returnItems =
    await prescriptionRepository.findReturnItemsByReturnIds(
      db,
      {
        orgId,
        returnIds: returns.map((row) => row.id),
      },
    );

  return {
    ...prescription,
    items,
    payments,
    returns: returns.map((row) => ({
      ...row,
      items: returnItems.filter(
        (item) =>
          item.prescription_return_id === row.id,
      ),
    })),
  };
}

async function createPrescription({
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

    const prescription =
      await prescriptionRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await prescriptionRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              prescription_id: localId,
            },
          },
        );

      createdItems.push(createdItem);
    }

    if (isConfirmed(data.prescription_status)) {
      await applyStockOut(
        connection,
        {
          orgId,
          userId,
          prescriptionId: localId,
          warehouseId: data.warehouse_id,
          currency: data.currency,
          date: data.prescription_date,
          number: data.prescription_number,
          items: data.items,
        },
      );

      await postPrescriptionJournal(
        connection,
        {
          orgId,
          userId,
          requestContext,
          prescriptionId: localId,
          data,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'prescriptions',
        entityId: prescription.id,

        oldValues: null,
        newValues: {
          ...prescription,
          items: createdItems,
        },

        description:
          `Created prescription ${prescription.prescription_number || `#${prescription.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...prescription,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePrescription({
  user,
  prescriptionId,
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

    const oldPrescription =
      await prescriptionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: prescriptionId,
          forUpdate: true,
        },
      );

    if (!oldPrescription) {
      throw new AppError(
        'Prescription not found.',
        404,
        'PRESCRIPTION_NOT_FOUND',
      );
    }

    const oldItems =
      await prescriptionRepository.findItemsByPrescription(
        connection,
        {
          orgId,
          prescriptionId,
          includeDeleted: true,
        },
      );

    const nextStatus =
      data.prescription_status ?? oldPrescription.prescription_status;

    const mergedData = {
      ...oldPrescription,
      ...data,
    };

    const updatedPrescription =
      await prescriptionRepository.update(
        connection,
        {
          orgId,
          localId: prescriptionId,
          userId,
          data: mergedData,
        },
      );

    if (
      isConfirmed(oldPrescription.prescription_status) &&
      data.prescription_status &&
      !isConfirmed(data.prescription_status)
    ) {
      await revertStockOut(
        connection,
        {
          orgId,
          userId,
          prescriptionId,
          warehouseId: oldPrescription.warehouse_id,
          currency: oldPrescription.currency,
          date: oldPrescription.prescription_date,
          items: oldItems,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: prescriptionId,
          referenceType: 'prescription',
          userId,
        },
      );
    }

    if (isConfirmed(nextStatus)) {
      const journalsResult =
      await journalRepository.findAll(
      connection,
          {
            orgId,
            referenceId: prescriptionId,
            referenceType: 'prescription',
          },
      );
    const journals = journalsResult.data;

      const activeJournal = journals.find(
        (journal) => Number(journal.status) === 1,
      );

      if (activeJournal) {
        await journalRepository.update(
          connection,
          {
            orgId,
            localId: activeJournal.id,
            userId,
            data: {
              first_entry_debit: mergedData.total_amount || 0,
              second_entry_credit: mergedData.total_amount || 0,
              description:
                `Updated journal from Prescription #${prescriptionId}`,
            },
          },
        );
      } else if (!isConfirmed(oldPrescription.prescription_status)) {
        await postPrescriptionJournal(
          connection,
          {
            orgId,
            userId,
            requestContext,
            prescriptionId,
            data: mergedData,
          },
        );
      }
    }

    let createdItems = oldItems.filter(
      (item) => Number(item.status) === 1,
    );

    if (Array.isArray(data.items)) {
      await prescriptionRepository.softDeleteItemsByPrescription(
        connection,
        {
          orgId,
          prescriptionId,
          userId,
        },
      );

      createdItems = [];

      for (const item of data.items) {
        const itemLocalId = generateLocalId();

        const createdItem =
          await prescriptionRepository.createItem(
            connection,
            {
              orgId,
              localId: itemLocalId,
              userId,
              data: {
                ...item,
                prescription_id: prescriptionId,
              },
            },
          );

        createdItems.push(createdItem);
      }

      if (
        !isConfirmed(oldPrescription.prescription_status) &&
        isConfirmed(nextStatus)
      ) {
        await applyStockOut(
          connection,
          {
            orgId,
            userId,
            prescriptionId,
            warehouseId: mergedData.warehouse_id,
            currency: mergedData.currency,
            date: mergedData.prescription_date,
            number: mergedData.prescription_number,
            items: data.items,
          },
        );
      }
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'update',
        tableName: 'prescriptions',
        entityId: prescriptionId,

        oldValues: {
          ...oldPrescription,
          items: oldItems,
        },
        newValues: {
          ...updatedPrescription,
          items: createdItems,
        },

        description:
          `Updated prescription ${updatedPrescription.prescription_number || `#${prescriptionId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...updatedPrescription,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePrescription({
  user,
  prescriptionId,
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

    const oldPrescription =
      await prescriptionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: prescriptionId,
          forUpdate: true,
        },
      );

    if (!oldPrescription) {
      throw new AppError(
        'Prescription not found.',
        404,
        'PRESCRIPTION_NOT_FOUND',
      );
    }

    if (Number(oldPrescription.status) === 0) {
      throw new AppError(
        'Prescription is already deleted.',
        409,
        'PRESCRIPTION_ALREADY_DELETED',
      );
    }

    const oldItems =
      await prescriptionRepository.findItemsByPrescription(
        connection,
        {
          orgId,
          prescriptionId,
          includeDeleted: true,
        },
      );

    if (isConfirmed(oldPrescription.prescription_status)) {
      await revertStockOut(
        connection,
        {
          orgId,
          userId,
          prescriptionId,
          warehouseId: oldPrescription.warehouse_id,
          currency: oldPrescription.currency,
          date: oldPrescription.prescription_date,
          items: oldItems,
        },
      );
    }

    const deletedPrescription =
      await prescriptionRepository.softDelete(
        connection,
        {
          orgId,
          localId: prescriptionId,
          userId,
        },
      );

    await prescriptionRepository.softDeleteItemsByPrescription(
      connection,
      {
        orgId,
        prescriptionId,
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: prescriptionId,
        referenceType: 'prescription',
        userId,
      },
    );

    const payments =
      await prescriptionRepository.findPaymentsByPrescription(
        connection,
        {
          orgId,
          prescriptionId,
          includeDeleted: true,
        },
      );

    for (const payment of payments) {
      if (Number(payment.status) !== 1) {
        continue;
      }

      await prescriptionRepository.softDeletePayment(
        connection,
        {
          orgId,
          localId: payment.id,
          userId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: payment.id,
          referenceType: 'prescription_payment',
          userId,
        },
      );
    }

    const returns =
      await prescriptionRepository.findReturnsByPrescription(
        connection,
        {
          orgId,
          prescriptionId,
          includeDeleted: true,
        },
      );

    for (const prescriptionReturn of returns) {
      if (Number(prescriptionReturn.status) !== 1) {
        continue;
      }

      const returnItems =
        await prescriptionRepository.findReturnItemsByReturn(
          connection,
          {
            orgId,
            returnId: prescriptionReturn.id,
          },
        );

      for (const item of returnItems) {
        await prescriptionRepository.adjustProductQuantity(
          connection,
          {
            orgId,
            productId: item.product_id,
            delta: -Number(item.quantity || 0),
          },
        );

        await warehouseProductRepository.adjustQuantity(
          connection,
          {
            orgId,
            userId,
            warehouseId: prescriptionReturn.warehouse_id,
            productId: item.product_id,
            productUnitId: item.product_unit_id,
            delta: -Number(item.quantity || 0),
          },
        );

        await stockTransactionRepository.recordMovement(
          connection,
          {
            orgId,
            userId,
            data: {
              warehouse_id: prescriptionReturn.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: prescriptionReturn.id,
              reference_type: 'prescription_return',
              transaction_type: 'prescription_return_revert',
              quantity: -Number(item.quantity || 0),
              unit_cost: Number(item.unit_price ?? 0),
              total_cost: -Number(item.subtotal ?? 0),
              currency: item.currency || prescriptionReturn.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || prescriptionReturn.currency || null,
              date: prescriptionReturn.return_date || new Date(),
              description: `Deleted prescription return #${prescriptionReturn.id}, stock reversed`,
              status: 1,
            },
          },
        );
      }

      await prescriptionRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: prescriptionReturn.id,
          userId,
        },
      );

      await prescriptionRepository.softDeleteReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId: prescriptionReturn.id,
          userId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: prescriptionReturn.id,
          referenceType: 'prescription_return',
          userId,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'prescriptions',
        entityId: deletedPrescription.id,

        oldValues: oldPrescription,
        newValues: deletedPrescription,

        description:
          `Deleted prescription ${oldPrescription.prescription_number || `#${prescriptionId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedPrescription;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPayment({
  user,
  prescriptionId,
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

    const prescription =
      await prescriptionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: prescriptionId,
          forUpdate: true,
        },
      );

    if (!prescription) {
      throw new AppError(
        'Prescription not found.',
        404,
        'PRESCRIPTION_NOT_FOUND',
      );
    }

    const paymentLocalId = generateLocalId();

    const payment =
      await prescriptionRepository.createPayment(
        connection,
        {
          orgId,
          localId: paymentLocalId,
          userId,
          data: {
            ...data,
            prescription_id: prescriptionId,
          },
        },
      );

    const receivableAcct =
      await prescriptionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'RECEIVABLE',
        },
      );

    const salesAcct =
      await prescriptionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'SALES',
        },
      );

    if (!receivableAcct) {
      throw new AppError(
        'RECEIVABLE account not found.',
        500,
        'RECEIVABLE_ACCOUNT_NOT_FOUND',
      );
    }

    if (!salesAcct) {
      throw new AppError(
        'SALES account not found.',
        500,
        'SALES_ACCOUNT_NOT_FOUND',
      );
    }

    const paymentDescription =
      data.description || 'Payment for Prescription';

    const signedAmount = Number(payment.amount || 0);
    const isReceive = signedAmount >= 0;
    const absAmount = Math.abs(signedAmount);

    const salesDebit = isReceive ? 0 : absAmount;
    const salesCredit = isReceive ? absAmount : 0;
    const receivableDebit = isReceive ? absAmount : 0;
    const receivableCredit = isReceive ? 0 : absAmount;

    const patientAccountId =
      prescription.account_id || prescription.patient_id;

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString(),
          reference_id: payment.id,
          reference_type: 'prescription_payment',
          description: paymentDescription,
          currency: payment.currency || null,
          first_entry_account: salesAcct.id,
          first_entry_debit: salesDebit,
          first_entry_credit: salesCredit,
          second_entry_account: receivableAcct.id,
          second_entry_debit: receivableDebit,
          second_entry_credit: receivableCredit,
          status: 1,
        },
        description:
          `Created sales/receivable journal for prescription payment ${payment.id}`,
      },
    );

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString(),
          reference_id: payment.id,
          reference_type: 'prescription_payment',
          description: paymentDescription,
          currency: payment.currency || null,
          first_entry_account: patientAccountId,
          first_entry_debit: salesDebit,
          first_entry_credit: salesCredit,
          second_entry_account: data.account_id,
          second_entry_debit: receivableDebit,
          second_entry_credit: receivableCredit,
          status: 1,
        },
        description:
          `Created customer/treasury journal for prescription payment ${payment.id}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'prescription_payments',
        entityId: payment.id,

        oldValues: null,
        newValues: payment,

        description:
          `Added payment of ${payment.amount} ${payment.currency} for prescription #${prescriptionId}`,

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

async function deletePayment({
  user,
  prescriptionId,
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
      await prescriptionRepository.findPaymentByLocalId(
        connection,
        {
          orgId,
          localId: paymentId,
          forUpdate: true,
        },
      );

    if (!oldPayment) {
      throw new AppError(
        'Payment not found.',
        404,
        'PAYMENT_NOT_FOUND',
      );
    }

    if (
      prescriptionId &&
      Number(oldPayment.prescription_id) !== Number(prescriptionId)
    ) {
      throw new AppError(
        'Payment does not belong to this prescription.',
        404,
        'PAYMENT_NOT_FOUND',
      );
    }

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'Payment is already deleted.',
        409,
        'PAYMENT_ALREADY_DELETED',
      );
    }

    const deletedPayment =
      await prescriptionRepository.softDeletePayment(
        connection,
        {
          orgId,
          localId: paymentId,
          userId,
        },
      );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: paymentId,
        referenceType: 'prescription_payment',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'prescription_payments',
        entityId: deletedPayment.id,

        oldValues: oldPayment,
        newValues: deletedPayment,

        description:
          `Deleted payment for prescription #${oldPayment.prescription_id}`,

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

async function createReturn({
  user,
  prescriptionId,
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

    const prescription =
      await prescriptionRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: prescriptionId,
          forUpdate: true,
        },
      );

    if (!prescription) {
      throw new AppError(
        'Prescription not found.',
        404,
        'PRESCRIPTION_NOT_FOUND',
      );
    }

    const returnLocalId = generateLocalId();

    const prescriptionReturn =
      await prescriptionRepository.createReturn(
        connection,
        {
          orgId,
          localId: returnLocalId,
          userId,
          data: {
            ...data,
            prescription_id: prescriptionId,
          },
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await prescriptionRepository.createReturnItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              prescription_return_id: returnLocalId,
            },
          },
        );

      createdItems.push(createdItem);

      await prescriptionRepository.adjustProductQuantity(
        connection,
        {
          orgId,
          productId: item.product_id,
          delta: Number(item.quantity || 0),
        },
      );

      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId: data.warehouse_id ?? prescription.warehouse_id,
          productId: item.product_id,
          productUnitId: item.product_unit_id,
          delta: Number(item.quantity || 0),
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id: data.warehouse_id ?? prescription.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnLocalId,
            reference_type: 'prescription_return',
            transaction_type: 'prescription_return',
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.unit_price ?? 0),
            total_cost: Number(item.subtotal ?? 0),
            currency: item.currency || data.currency || prescription.currency || null,
            peer_price: Number(item.unit_price ?? 0),
            peer_currency: item.currency || data.currency || prescription.currency || null,
            date: data.return_date || new Date(),
            description: `Prescription return for Prescription #${prescription.prescription_number || prescriptionId}`,
            status: 1,
          },
        },
      );
    }

    const receivableAccount =
      await prescriptionRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'RECEIVABLE',
        },
      );

    if (!receivableAccount) {
      throw new AppError(
        'RECEIVABLE account not found.',
        500,
        'RECEIVABLE_ACCOUNT_NOT_FOUND',
      );
    }

    const patientAccountId =
      data.account_id ||
      prescription.account_id ||
      prescription.patient_id;

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: data.return_date || new Date().toISOString().slice(0, 10),
          reference_id: returnLocalId,
          reference_type: 'prescription_return',
          description:
            data.description ||
            `Prescription Return Transaction for Prescription #${prescription.prescription_number || prescriptionId}`,
          currency: data.currency || prescription.currency || null,
          first_entry_account: patientAccountId,
          first_entry_debit: 0,
          first_entry_credit: Number(data.total_amount || 0),
          second_entry_account: receivableAccount.id,
          second_entry_debit: Number(data.total_amount || 0),
          second_entry_credit: 0,
          status: 1,
        },
        description:
          `Created prescription return journal for ${returnLocalId}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'prescription_returns',
        entityId: prescriptionReturn.id,

        oldValues: null,
        newValues: {
          ...prescriptionReturn,
          items: createdItems,
        },

        description:
          `Created prescription return #${prescriptionReturn.return_number || prescriptionReturn.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return {
      ...prescriptionReturn,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteReturn({
  user,
  prescriptionId,
  returnId,
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

    const oldReturn =
      await prescriptionRepository.findReturnByLocalId(
        connection,
        {
          orgId,
          localId: returnId,
          forUpdate: true,
        },
      );

    if (!oldReturn) {
      throw new AppError(
        'Prescription return not found.',
        404,
        'PRESCRIPTION_RETURN_NOT_FOUND',
      );
    }

    if (
      prescriptionId &&
      Number(oldReturn.prescription_id) !== Number(prescriptionId)
    ) {
      throw new AppError(
        'Return does not belong to this prescription.',
        404,
        'PRESCRIPTION_RETURN_NOT_FOUND',
      );
    }

    if (Number(oldReturn.status) === 0) {
      throw new AppError(
        'Prescription return is already deleted.',
        409,
        'PRESCRIPTION_RETURN_ALREADY_DELETED',
      );
    }

    const returnItems =
      await prescriptionRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
        },
      );

    for (const item of returnItems) {
      await prescriptionRepository.adjustProductQuantity(
        connection,
        {
          orgId,
          productId: item.product_id,
          delta: -Number(item.quantity || 0),
        },
      );

      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId: oldReturn.warehouse_id,
          productId: item.product_id,
          productUnitId: item.product_unit_id,
          delta: -Number(item.quantity || 0),
        },
      );

      await stockTransactionRepository.recordMovement(
        connection,
        {
          orgId,
          userId,
          data: {
            warehouse_id: oldReturn.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnId,
            reference_type: 'prescription_return',
            transaction_type: 'prescription_return_revert',
            quantity: -Number(item.quantity || 0),
            unit_cost: Number(item.unit_price ?? 0),
            total_cost: -Number(item.subtotal ?? 0),
            currency: item.currency || oldReturn.currency || null,
            peer_price: Number(item.unit_price ?? 0),
            peer_currency: item.currency || oldReturn.currency || null,
            date: oldReturn.return_date || new Date(),
            description: `Deleted prescription return #${returnId}, stock reversed`,
            status: 1,
          },
        },
      );
    }

    const deletedReturn =
      await prescriptionRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: returnId,
          userId,
        },
      );

    await prescriptionRepository.softDeleteReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId,
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: returnId,
        referenceType: 'prescription_return',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'prescription_returns',
        entityId: deletedReturn.id,

        oldValues: oldReturn,
        newValues: deletedReturn,

        description:
          `Deleted prescription return #${oldReturn.return_number || returnId}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedReturn;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listPrescriptions,
  getPrescription,
  createPrescription,
  updatePrescription,
  deletePrescription,
  createPayment,
  deletePayment,
  createReturn,
  deleteReturn,
};
