const db = require('../database/pool');
const dashboardService = require('./dashboard.service');

const AppError =
  require('../errors/AppError');

const inventoryRecordRepository =
  require('../repositories/inventory-record.repository');

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

const {
  paymentDescription,
} = require('../utils/transactionDescription');

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

function isConfirmed(recordStatus) {
  return String(recordStatus || '') === 'confirmed';
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
      operation: 'inventory_record.journal',
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

async function listInventoryRecords({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const result =
    await inventoryRecordRepository.findAll(
      db,
      {
        orgId,
        status: filters.status,
        recordStatus: filters.record_status,
        accountId: filters.account_id,
        apartmentId: filters.apartment_id,
        search: filters.search,
        pagination,
      },
    );

  if (Number(filters.relations) === 1) {
    const records = result.data;
    const recordIds =
      records.map((record) => record.id);

    const [
      payments,
      returns,
    ] = await Promise.all([
      inventoryRecordRepository.findPaymentsByRecordIds(
        db,
        {
          orgId,
          recordIds,
        },
      ),
      inventoryRecordRepository.findReturnsByRecordIds(
        db,
        {
          orgId,
          recordIds,
        },
      ),
    ]);

    const returnItems =
      await inventoryRecordRepository.findReturnItemsByReturnIds(
        db,
        {
          orgId,
          returnIds:
            returns.map(
              (recordReturn) =>
                recordReturn.id,
            ),
        },
      );

    return {
      data: records.map((record) => ({
        ...record,
        payments: payments.filter(
          (payment) =>
            payment.record_id === record.id,
        ),
        returns: returns
          .filter(
            (recordReturn) =>
              recordReturn.record_id === record.id,
          )
          .map((recordReturn) => ({
            ...recordReturn,
            items: returnItems.filter(
              (returnItem) =>
                returnItem.return_id ===
                recordReturn.id,
            ),
          })),
      })),
      meta: result.meta,
    };
  }

  return result;
}

async function getInventoryRecord({
  user,
  recordId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const record =
    await inventoryRecordRepository.findByLocalId(
      db,
      {
        orgId,
        localId: recordId,
      },
    );

  if (!record) {
    throw new AppError(
      'Inventory record not found.',
      404,
      'INVENTORY_RECORD_NOT_FOUND',
    );
  }

  const [
    items,
    payments,
    returns,
  ] = await Promise.all([
    inventoryRecordRepository.findItemsByRecord(
      db,
      {
        orgId,
        recordId,
      },
    ),
    inventoryRecordRepository.findPaymentsByRecord(
      db,
      {
        orgId,
        recordId,
      },
    ),
    inventoryRecordRepository.findReturnsByRecord(
      db,
      {
        orgId,
        recordId,
      },
    ),
  ]);

  const returnItems =
    await Promise.all(
      returns.map(async (recordReturn) =>
        inventoryRecordRepository.findReturnItemsByReturn(
          db,
          {
            orgId,
            returnId: recordReturn.id,
          },
        )
      ),
    );

  return {
    ...record,
    items,
    payments,
    returns: returns.map(
      (recordReturn, index) => ({
        ...recordReturn,
        items: returnItems[index] || [],
      }),
    ),
  };
}

async function createInventoryRecord({
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

    const record =
      await inventoryRecordRepository.create(
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
        await inventoryRecordRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              record_id: localId,
            },
          },
        );

      createdItems.push(createdItem);

      if (isConfirmed(data.record_status)) {
        await inventoryRecordRepository.adjustProductQuantity(
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
            warehouseId: data.warehouse_id,
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
              warehouse_id: data.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: localId,
              reference_type: 'inventory_record',
              transaction_type: 'inventory_record',
              quantity: -Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: -Number(item.subtotal ?? 0),
              currency: item.currency || data.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || data.currency || null,
              date: data.record_date || new Date(),
              description: `Inventory Record #${data.record_number || ''}`,
              status: 1,
            },
          },
        );
      }
    }

    if (isConfirmed(data.record_status)) {
      const receivableAccount =
        await inventoryRecordRepository.findAccountByCode(
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

      await createJournalEntry(
        connection,
        {
          orgId,
          userId,
          requestContext,
          data: {
            date: data.record_date || null,
            reference_id: localId,
            reference_type: 'inventory_record',
            description:
              data.description || `Inventory Record #${data.record_number || ''}`,
            currency: data.currency || null,
            first_entry_account: data.account_id,
            first_entry_debit: data.total_amount || 0,
            first_entry_credit: 0,
            second_entry_account: receivableAccount.id,
            second_entry_debit: 0,
            second_entry_credit: data.total_amount || 0,
            status: 1,
          },
          description:
            `Created inventory record journal for ${record.id}`,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'inventory_records',
        entityId: record.id,

        oldValues: null,
        newValues: {
          ...record,
          items: createdItems,
        },

        description:
          `Created inventory record ${record.record_number || `#${record.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...record,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateInventoryRecord({
  user,
  recordId,
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

    const oldRecord =
      await inventoryRecordRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: recordId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Inventory record not found.',
        404,
        'INVENTORY_RECORD_NOT_FOUND',
      );
    }

    const oldItems =
      await inventoryRecordRepository.findItemsByRecord(
        connection,
        {
          orgId,
          recordId,
          includeDeleted: true,
        },
      );

    const nextStatus =
      data.record_status ?? oldRecord.record_status;

    const updatedRecord =
      await inventoryRecordRepository.update(
        connection,
        {
          orgId,
          localId: recordId,
          userId,
          data,
        },
      );

    if (
      isConfirmed(oldRecord.record_status) &&
      data.record_status &&
      !isConfirmed(data.record_status)
    ) {
      for (const item of oldItems) {
        if (Number(item.status) === 0) {
          continue;
        }

        await inventoryRecordRepository.adjustProductQuantity(
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
            warehouseId: oldRecord.warehouse_id,
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
              warehouse_id: oldRecord.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: recordId,
              reference_type: 'inventory_record',
              transaction_type: 'inventory_record_revert',
              quantity: Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: Number(item.subtotal ?? 0),
              currency: item.currency || oldRecord.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || oldRecord.currency || null,
              date: oldRecord.record_date || new Date(),
              description: `Inventory record #${recordId} reverted to draft, stock restored`,
              status: 1,
            },
          },
        );
      }

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: recordId,
          referenceType: 'inventory_record',
          userId,
        },
      );

      const payments =
        await inventoryRecordRepository.findPaymentsByRecord(
          connection,
          {
            orgId,
            recordId,
          },
        );

      for (const payment of payments) {
        if (Number(payment.status) === 0) {
          continue;
        }

        await inventoryRecordRepository.softDeletePayment(
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
            referenceType: 'inventory_record_payment',
            userId,
          },
        );
      }

      const returns =
        await inventoryRecordRepository.findReturnsByRecord(
          connection,
          {
            orgId,
            recordId,
          },
        );

      for (const recordReturn of returns) {
        if (Number(recordReturn.status) === 0) {
          continue;
        }

        await inventoryRecordRepository.softDeleteReturn(
          connection,
          {
            orgId,
            localId: recordReturn.id,
            userId,
          },
        );

        await inventoryRecordRepository.softDeleteReturnItemsByReturn(
          connection,
          {
            orgId,
            returnId: recordReturn.id,
            userId,
          },
        );

        await journalRepository.softDeleteByReference(
          connection,
          {
            orgId,
            referenceId: recordReturn.id,
            referenceType: 'inventory_record_return',
            userId,
          },
        );
      }
    }

    if (isConfirmed(nextStatus)) {
      const journalsResult =
      await journalRepository.findAll(
      connection,
          {
            orgId,
            referenceId: recordId,
            referenceType: 'inventory_record',
          },
      );
    const journals = journalsResult.data;

      const activeJournal = journals.find(
        (journal) => Number(journal.status) === 1,
      );

      if (activeJournal) {
        const hasExplicitTotal =
          Object.prototype.hasOwnProperty.call(data, 'total_amount') &&
          data.total_amount !== null &&
          data.total_amount !== undefined &&
          Number.isFinite(Number(data.total_amount));

        const recordTotal = hasExplicitTotal
          ? Number(data.total_amount) || 0
          : Number(oldRecord.total_amount) || 0;

        const journalDebit = Number(activeJournal.first_entry_debit) || 0;
        const needsHeal =
          journalDebit === 0 &&
          recordTotal > 0;

        if (hasExplicitTotal || needsHeal) {
          await journalRepository.update(
            connection,
            {
              orgId,
              localId: activeJournal.id,
              userId,
              data: {
                first_entry_debit: recordTotal,
                second_entry_credit: recordTotal,
                description:
                  `Updated journal from Inventory Record #${recordId}`,
              },
            },
          );
        }
      } else if (!isConfirmed(oldRecord.record_status)) {
        const receivableAccount =
          await inventoryRecordRepository.findAccountByCode(
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

        await createJournalEntry(
          connection,
          {
            orgId,
            userId,
            requestContext,
            data: {
              date: data.record_date || null,
              reference_id: recordId,
              reference_type: 'inventory_record',
              description:
                data.description || `Inventory Record #${data.record_number || ''}`,
              currency: data.currency || null,
              first_entry_account: data.account_id,
              first_entry_debit: data.total_amount || 0,
              first_entry_credit: 0,
              second_entry_account: receivableAccount.id,
              second_entry_debit: 0,
              second_entry_credit: data.total_amount || 0,
              status: 1,
            },
            description:
              `Created inventory record journal for ${recordId}`,
          },
        );
      }
    }

    if (Array.isArray(data.items)) {
      await inventoryRecordRepository.softDeleteItemsByRecord(
        connection,
        {
          orgId,
          recordId,
          userId,
        },
      );

      const createdItems = [];

      for (const item of data.items) {
        const itemLocalId = generateLocalId();

        const createdItem =
          await inventoryRecordRepository.createItem(
            connection,
            {
              orgId,
              localId: itemLocalId,
              userId,
              data: {
                ...item,
                record_id: recordId,
              },
            },
          );

        createdItems.push(createdItem);
      }

      if (
        !isConfirmed(oldRecord.record_status) &&
        isConfirmed(nextStatus)
      ) {
        for (const item of data.items) {
          await inventoryRecordRepository.adjustProductQuantity(
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
              warehouseId: data.warehouse_id ?? oldRecord.warehouse_id,
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
                warehouse_id: data.warehouse_id ?? oldRecord.warehouse_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                reference_id: recordId,
                reference_type: 'inventory_record',
                transaction_type: 'inventory_record',
                quantity: -Number(item.quantity || 0),
                unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
                total_cost: -Number(item.subtotal ?? 0),
                currency: item.currency || data.currency || oldRecord.currency || null,
                peer_price: Number(item.unit_price ?? 0),
                peer_currency: item.currency || data.currency || oldRecord.currency || null,
                date: data.record_date || oldRecord.record_date || new Date(),
                description: `Inventory Record #${data.record_number || oldRecord.record_number || ''}`,
                status: 1,
              },
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
          tableName: 'inventory_records',
          entityId: recordId,

          oldValues: {
            ...oldRecord,
            items: oldItems,
          },
          newValues: {
            ...updatedRecord,
            items: createdItems,
          },

          description:
            `Updated inventory record ${updatedRecord.record_number || `#${recordId}`}`,

          ipAddress:
            requestContext.ipAddress,

          sessionId:
            requestContext.sessionId,

          deviceInfo:
            requestContext.deviceInfo,
        },
      );
    } else {
      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'update',
          tableName: 'inventory_records',
          entityId: recordId,

          oldValues: oldRecord,
          newValues: updatedRecord,

          description:
            `Updated inventory record ${updatedRecord.record_number || `#${recordId}`}`,

          ipAddress:
            requestContext.ipAddress,

          sessionId:
            requestContext.sessionId,

          deviceInfo:
            requestContext.deviceInfo,
        },
      );
    }

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return updatedRecord;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteInventoryRecord({
  user,
  recordId,
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

    const oldRecord =
      await inventoryRecordRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: recordId,
          forUpdate: true,
        },
      );

    if (!oldRecord) {
      throw new AppError(
        'Inventory record not found.',
        404,
        'INVENTORY_RECORD_NOT_FOUND',
      );
    }

    if (Number(oldRecord.status) === 0) {
      throw new AppError(
        'Inventory record is already deleted.',
        409,
        'INVENTORY_RECORD_ALREADY_DELETED',
      );
    }

    const oldItems =
      await inventoryRecordRepository.findItemsByRecord(
        connection,
        {
          orgId,
          recordId,
          includeDeleted: true,
        },
      );

    if (isConfirmed(oldRecord.record_status)) {
      for (const item of oldItems) {
        if (Number(item.status) === 0) {
          continue;
        }

        await inventoryRecordRepository.adjustProductQuantity(
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
            warehouseId: oldRecord.warehouse_id,
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
              warehouse_id: oldRecord.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: recordId,
              reference_type: 'inventory_record',
              transaction_type: 'inventory_record_revert',
              quantity: Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: Number(item.subtotal ?? 0),
              currency: item.currency || oldRecord.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || oldRecord.currency || null,
              date: oldRecord.record_date || new Date(),
              description: `Deleted inventory record #${recordId}, stock restored`,
              status: 1,
            },
          },
        );
      }
    }

    const deletedRecord =
      await inventoryRecordRepository.softDelete(
        connection,
        {
          orgId,
          localId: recordId,
          userId,
        },
      );

    await inventoryRecordRepository.softDeleteItemsByRecord(
      connection,
      {
        orgId,
        recordId,
        userId,
      },
    );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: recordId,
        referenceType: 'inventory_record',
        userId,
      },
    );

    const payments =
      await inventoryRecordRepository.findPaymentsByRecord(
        connection,
        {
          orgId,
          recordId,
          includeDeleted: true,
        },
      );

    for (const payment of payments) {
      if (Number(payment.status) === 1) {
        await inventoryRecordRepository.softDeletePayment(
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
            referenceType: 'inventory_record_payment',
            userId,
          },
        );
      }
    }

    const returns =
      await inventoryRecordRepository.findReturnsByRecord(
        connection,
        {
          orgId,
          recordId,
          includeDeleted: true,
        },
      );

    for (const recordReturn of returns) {
      if (Number(recordReturn.status) === 0) {
        continue;
      }

      await inventoryRecordRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: recordReturn.id,
          userId,
        },
      );

      await inventoryRecordRepository.softDeleteReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId: recordReturn.id,
          userId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: recordReturn.id,
          referenceType: 'inventory_record_return',
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
        tableName: 'inventory_records',
        entityId: deletedRecord.id,

        oldValues: {
          ...oldRecord,
          items: oldItems,
        },
        newValues: deletedRecord,

        description:
          `Deleted inventory record ${oldRecord.record_number || `#${recordId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return deletedRecord;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPayment({
  user,
  recordId,
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

    const record =
      await inventoryRecordRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: recordId,
          forUpdate: true,
        },
      );

    if (!record) {
      throw new AppError(
        'Inventory record not found.',
        404,
        'INVENTORY_RECORD_NOT_FOUND',
      );
    }

    const paymentLocalId = generateLocalId();

    const payment =
      await inventoryRecordRepository.createPayment(
        connection,
        {
          orgId,
          localId: paymentLocalId,
          userId,
          data: {
            ...data,
            record_id: recordId,
          },
        },
      );

    const receivableAcct =
      await inventoryRecordRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'RECEIVABLE',
        },
      );

    const salesAcct =
      await inventoryRecordRepository.findAccountByCode(
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

    const paymentDescriptionText =
      String(data.description || '').trim() ||
      paymentDescription({
        kind: 'inventory',
        document: record,
        payment: data,
        language: requestContext?.language,
      });

    const signedAmount = Number(payment.amount || 0);
    const isReceive = signedAmount >= 0;
    const absAmount = Math.abs(signedAmount);

    const salesDebit = isReceive ? 0 : absAmount;
    const salesCredit = isReceive ? absAmount : 0;
    const receivableDebit = isReceive ? absAmount : 0;
    const receivableCredit = isReceive ? 0 : absAmount;

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString(),
          reference_id: payment.id,
          reference_type: 'inventory_record_payment',
          description: paymentDescriptionText,
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
          `Created sales/receivable journal for inventory record payment ${payment.id}`,
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
          reference_type: 'inventory_record_payment',
          description: paymentDescriptionText,
          currency: payment.currency || null,
          first_entry_account: record.account_id,
          first_entry_debit: salesDebit,
          first_entry_credit: salesCredit,
          second_entry_account: data.account_id,
          second_entry_debit: receivableDebit,
          second_entry_credit: receivableCredit,
          status: 1,
        },
        description:
          `Created customer/treasury journal for inventory record payment ${payment.id}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'inventory_record_payments',
        entityId: payment.id,

        oldValues: null,
        newValues: payment,

        description:
          `Added payment of ${payment.amount} ${payment.currency} for inventory record #${recordId}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

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
  recordId,
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
      await inventoryRecordRepository.findPaymentByLocalId(
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
      recordId &&
      Number(oldPayment.record_id) !== Number(recordId)
    ) {
      throw new AppError(
        'Payment does not belong to this inventory record.',
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
      await inventoryRecordRepository.softDeletePayment(
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
        referenceType: 'inventory_record_payment',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'inventory_record_payments',
        entityId: deletedPayment.id,

        oldValues: oldPayment,
        newValues: deletedPayment,

        description:
          `Deleted payment for inventory record #${oldPayment.record_id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

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
  recordId,
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

    const record =
      await inventoryRecordRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: recordId,
          forUpdate: true,
        },
      );

    if (!record) {
      throw new AppError(
        'Inventory record not found.',
        404,
        'INVENTORY_RECORD_NOT_FOUND',
      );
    }

    const returnLocalId = generateLocalId();

    const recordReturn =
      await inventoryRecordRepository.createReturn(
        connection,
        {
          orgId,
          localId: returnLocalId,
          userId,
          data: {
            ...data,
            record_id: recordId,
          },
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await inventoryRecordRepository.createReturnItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              return_id: returnLocalId,
            },
          },
        );

      createdItems.push(createdItem);

      await inventoryRecordRepository.adjustProductQuantity(
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
          warehouseId: data.warehouse_id ?? record.warehouse_id,
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
            warehouse_id: data.warehouse_id ?? record.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnLocalId,
            reference_type: 'inventory_record_return',
            transaction_type: 'inventory_record_return',
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
            total_cost: Number(item.subtotal ?? 0),
            currency: item.currency || record.currency || null,
            peer_price: Number(item.unit_price ?? 0),
            peer_currency: item.currency || record.currency || null,
            date: new Date(),
            description: `Inventory Record Return for Record #${record.record_number || ''}`,
            status: 1,
          },
        },
      );
    }

    const receivableAccount =
      await inventoryRecordRepository.findAccountByCode(
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

    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString().slice(0, 10),
          reference_id: returnLocalId,
          reference_type: 'inventory_record_return',
          description:
            `Inventory Record Return Transaction for Record #${record.record_number || ''}`,
          currency: recordReturn.currency || null,
          first_entry_account: record.account_id,
          first_entry_debit: 0,
          first_entry_credit: Number(recordReturn.total_amount || 0),
          second_entry_account: receivableAccount.id,
          second_entry_debit: Number(recordReturn.total_amount || 0),
          second_entry_credit: 0,
          status: 1,
        },
        description:
          `Created inventory record return journal for return ${recordReturn.id}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'inventory_record_returns',
        entityId: recordReturn.id,

        oldValues: null,
        newValues: {
          ...recordReturn,
          items: createdItems,
        },

        description:
          `Created inventory record return ${recordReturn.return_number || `#${recordReturn.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return {
      ...recordReturn,
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
  recordId,
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
      await inventoryRecordRepository.findReturnByLocalId(
        connection,
        {
          orgId,
          localId: returnId,
          forUpdate: true,
        },
      );

    if (!oldReturn) {
      throw new AppError(
        'Inventory record return not found.',
        404,
        'INVENTORY_RECORD_RETURN_NOT_FOUND',
      );
    }

    if (
      recordId &&
      Number(oldReturn.record_id) !== Number(recordId)
    ) {
      throw new AppError(
        'Return does not belong to this inventory record.',
        404,
        'INVENTORY_RECORD_RETURN_NOT_FOUND',
      );
    }

    if (Number(oldReturn.status) === 0) {
      throw new AppError(
        'Inventory record return is already deleted.',
        409,
        'INVENTORY_RECORD_RETURN_ALREADY_DELETED',
      );
    }

    const oldItems =
      await inventoryRecordRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
          includeDeleted: true,
        },
      );

    for (const item of oldItems) {
      if (Number(item.status) === 0) {
        continue;
      }

      await inventoryRecordRepository.adjustProductQuantity(
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
            reference_type: 'inventory_record_return',
            transaction_type: 'inventory_record_return_revert',
            quantity: -Number(item.quantity || 0),
            unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
            total_cost: -Number(item.subtotal ?? 0),
            currency: item.currency || null,
            peer_price: Number(item.unit_price ?? 0),
            peer_currency: item.currency || null,
            date: new Date(),
            description: `Deleted inventory record return #${returnId}, stock deducted`,
            status: 1,
          },
        },
      );
    }

    const deletedReturn =
      await inventoryRecordRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: returnId,
          userId,
        },
      );

    await inventoryRecordRepository.softDeleteReturnItemsByReturn(
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
        referenceType: 'inventory_record_return',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'inventory_record_returns',
        entityId: deletedReturn.id,

        oldValues: {
          ...oldReturn,
          items: oldItems,
        },
        newValues: deletedReturn,

        description:
          `Deleted inventory record return ${oldReturn.return_number || `#${returnId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    /* Records/payments/returns write journals and move stock. */
    dashboardService.invalidateDashboardAggregates(orgId);

    return deletedReturn;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listInventoryRecords,
  getInventoryRecord,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
  createPayment,
  deletePayment,
  createReturn,
  deleteReturn,
};
