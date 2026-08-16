const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const purchaseRepository =
  require('../repositories/purchase.repository');

const warehouseProductRepository =
  require('../repositories/warehouse-product.repository');

const stockTransactionRepository =
  require('../repositories/stock-transaction.repository');

const batchLedger =
  require('./batch-ledger.service');


const journalRepository =
  require('../repositories/journal.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

const {
  convertCurrencyAmount,
} = require('../utils/currency');

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

function isConfirmed(billStatus) {
  return String(billStatus || '') === 'confirmed';
}

/*
 * Creates a journal row inside the caller's transaction and
 * records an activity log entry for it. The journal mirrors
 * the exact double-entry structure the frontend used to write
 * to Dexie: supplier + PAYABLE for the purchase, PURCHASE +
 * PAYABLE and supplier + treasury for payments, supplier +
 * PAYABLE for returns.
 */
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

async function listPurchases({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const result = await purchaseRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      accountId: filters.account_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      skipCount: Number(filters.skip_count) === 1,
      pagination,
    },
  );

  /*
   * The purchases index page renders remaining balances from
   * payments and returns, so the list endpoint can attach them
   * in a single round trip instead of one request per purchase.
   */
  if (Number(filters.relations) === 1) {
    const purchases = result.data;
    const purchaseIds =
      purchases.map((p) => p.id);

    const [
      payments,
      returns,
    ] = await Promise.all([
      purchaseRepository.findPaymentsByPurchaseIds(
        db,
        {
          orgId,
          purchaseIds,
        },
      ),
      purchaseRepository.findReturnsByPurchaseIds(
        db,
        {
          orgId,
          purchaseIds,
        },
      ),
    ]);

    const paymentsByPurchase = new Map();
    for (const payment of payments) {
      const key = Number(payment.purchase_id);
      if (!paymentsByPurchase.has(key)) {
        paymentsByPurchase.set(key, []);
      }
      paymentsByPurchase.get(key).push(payment);
    }

    const returnsByPurchase = new Map();
    for (const purchaseReturn of returns) {
      const key = Number(purchaseReturn.purchase_id);
      if (!returnsByPurchase.has(key)) {
        returnsByPurchase.set(key, []);
      }
      returnsByPurchase.get(key).push({
        ...purchaseReturn,
        items: [],
      });
    }

    return {
      data: purchases.map((purchase) => ({
        ...purchase,
        payments: paymentsByPurchase.get(Number(purchase.id)) || [],
        returns: returnsByPurchase.get(Number(purchase.id)) || [],
      })),
      meta: result.meta,
    };
  }

  return result;
}

async function getPurchase({
  user,
  purchaseId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const purchase =
    await purchaseRepository.findByLocalId(
      db,
      {
        orgId,
        localId: purchaseId,
      },
    );

  if (!purchase) {
    throw new AppError(
      'Purchase not found.',
      404,
      'PURCHASE_NOT_FOUND',
    );
  }

  const [
    items,
    payments,
    returns,
  ] = await Promise.all([
    purchaseRepository.findItemsByPurchase(
      db,
      {
        orgId,
        purchaseId,
      },
    ),
    purchaseRepository.findPaymentsByPurchase(
      db,
      {
        orgId,
        purchaseId,
      },
    ),
    purchaseRepository.findReturnsByPurchase(
      db,
      {
        orgId,
        purchaseId,
      },
    ),
  ]);

  const returnItems =
    await Promise.all(
      returns.map(async (purchaseReturn) =>
        purchaseRepository.findReturnItemsByReturn(
          db,
          {
            orgId,
            returnId: purchaseReturn.id,
          },
        )
      ),
    );

  return {
    ...purchase,
    items,
    payments,
    returns: returns.map(
      (purchaseReturn, index) => ({
        ...purchaseReturn,
        items: returnItems[index] || [],
      }),
    ),
  };
}

async function createPurchase({
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

    const purchase =
      await purchaseRepository.create(
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
        await purchaseRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              purchase_id: localId,
            },
          },
        );

      createdItems.push(createdItem);

      /*
       * Stock-quantity writes: only a confirmed purchase
       * moves stock. Drafts are UI-only.
       */
      if (isConfirmed(data.bill_status)) {
        await purchaseRepository.adjustProductQuantity(
          connection,
          {
            orgId,
            productId: item.product_id,
            delta: Number(item.quantity || 0),
          },
        );

        /*
         * Warehouse balances: the purchase header carries the
         * warehouse, so the per-warehouse row moves in lockstep
         * with the product quantity inside the same transaction.
         */
        await warehouseProductRepository.adjustQuantity(
          connection,
          {
            orgId,
            userId,
            warehouseId: data.warehouse_id,
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
              warehouse_id: data.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: localId,
              reference_type: 'purchase',
              transaction_type: 'purchase',
              quantity: Number(item.quantity || 0),
              unit_cost: Number(item.unit_price || 0),
              total_cost: Number(item.subtotal || 0),
              currency: item.currency || data.currency || null,
              peer_price: Number(item.sell_price || 0),
              peer_currency: item.sell_currency || data.currency || null,
              date: data.bill_date || new Date(),
              description: `Purchase Bill #${data.bill_number || ''}`,
              status: 1,
            },
          },
        );

        await purchaseRepository.updateProductPrices(
          connection,
          {
            orgId,
            productId: item.product_id,
            data: item,
          },
        );
      }
    }

    if (isConfirmed(data.bill_status)) {
      await batchLedger.createPurchaseBatches(
        connection,
        {
          orgId,
          userId,
          purchaseId: localId,
          warehouseId: data.warehouse_id,
          receivedAt: data.bill_date,
          defaultCurrency: data.currency,
          items: data.items,
        },
      );
    }

    /*
     * Account process: a confirmed purchase posts a double
     * entry to the supplier (credit) and PAYABLE (debit)
     * inside the same transaction, so the supplier balance
     * updates atomically with the purchase.
     */
    if (isConfirmed(data.bill_status)) {
      const payableAccount =
        await purchaseRepository.findAccountByCode(
          connection,
          {
            orgId,
            code: 'PAYABLE',
          },
        );

      if (!payableAccount) {
        throw new AppError(
          'PAYABLE account not found.',
          500,
          'PAYABLE_ACCOUNT_NOT_FOUND',
        );
      }

      await createJournalEntry(
        connection,
        {
          orgId,
          userId,
          requestContext,
          data: {
            date: data.bill_date || null,
            reference_id: localId,
            reference_type: 'purchase',
            description:
              data.description || `Purchase Invoice #${data.bill_number || ''}`,
            currency: data.currency || null,
            first_entry_account: data.account_id,
            first_entry_debit: 0,
            first_entry_credit: data.total_amount || 0,
            second_entry_account: payableAccount.id,
            second_entry_debit: data.total_amount || 0,
            second_entry_credit: 0,
            status: 1,
          },
          description:
            `Created purchase journal for purchase ${purchase.id}`,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'purchases',
        entityId: purchase.id,

        oldValues: null,
        newValues: {
          ...purchase,
          items: createdItems,
        },

        description:
          `Created purchase ${purchase.bill_number || `#${purchase.id}`}`,

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
      ...purchase,
      items: createdItems,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updatePurchase({
  user,
  purchaseId,
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

    const oldPurchase =
      await purchaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: purchaseId,
          forUpdate: true,
        },
      );

    if (!oldPurchase) {
      throw new AppError(
        'Purchase not found.',
        404,
        'PURCHASE_NOT_FOUND',
      );
    }

    const oldItems =
      await purchaseRepository.findItemsByPurchase(
        connection,
        {
          orgId,
          purchaseId,
          includeDeleted: true,
        },
      );

    const updatedPurchase =
      await purchaseRepository.update(
        connection,
        {
          orgId,
          localId: purchaseId,
          userId,
          data,
        },
      );

    /*
     * When the caller does not send a bill_status (e.g. the
     * edit modal only sends amounts/items), the purchase keeps
     * its current status so a confirmed edit still refreshes
     * the posted journal and syncs stock quantities.
     */
    const nextBillStatus =
      data.bill_status ?? oldPurchase.bill_status;

    /*
     * Account process: when a confirmed purchase is reverted
     * to draft (PurchaseDraftModal), the posted purchase
     * journal is soft-deleted so the supplier balance no
     * longer counts the phantom credit. When a draft is
     * confirmed through an edit, the journal is posted below
     * (items branch).
     */
    if (
      isConfirmed(oldPurchase.bill_status) &&
      nextBillStatus &&
      !isConfirmed(nextBillStatus)
    ) {
      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: purchaseId,
          referenceType: 'purchase',
          userId,
        },
      );
    }

    /*
     * Account process: when an edited purchase is still
     * confirmed, refresh its posted journal total so the
     * supplier balance stays in sync with the new amount.
     * When a draft is confirmed through an edit, post the
     * journal for the first time (mirrors createPurchase).
     * Runs regardless of whether items were sent, so a
     * header-only confirmation also posts the journal.
     */
    if (isConfirmed(nextBillStatus)) {
      const journalsResult =
        await journalRepository.findAll(
          connection,
          {
            orgId,
            referenceId: purchaseId,
            referenceType: 'purchase',
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

        const purchaseTotal = hasExplicitTotal
          ? Number(data.total_amount) || 0
          : Number(oldPurchase.total_amount) || 0;

        const journalCredit = Number(activeJournal.first_entry_credit) || 0;
        const needsHeal =
          journalCredit === 0 &&
          purchaseTotal > 0;

        if (hasExplicitTotal || needsHeal) {
          await journalRepository.update(
            connection,
            {
              orgId,
              localId: activeJournal.id,
              userId,
              data: {
                first_entry_credit: purchaseTotal,
                second_entry_debit: purchaseTotal,
                description:
                  `Updated journal from Purchase #${purchaseId}`,
              },
            },
          );
        }
      } else if (!isConfirmed(oldPurchase.bill_status)) {
        const payableAccount =
          await purchaseRepository.findAccountByCode(
            connection,
            {
              orgId,
              code: 'PAYABLE',
            },
          );

        if (!payableAccount) {
          throw new AppError(
            'PAYABLE account not found.',
            500,
            'PAYABLE_ACCOUNT_NOT_FOUND',
          );
        }

        await createJournalEntry(
          connection,
          {
            orgId,
            userId,
            requestContext,
            data: {
              date: data.bill_date || null,
              reference_id: purchaseId,
              reference_type: 'purchase',
              description:
                data.description || `Purchase Invoice #${data.bill_number || ''}`,
              currency: data.currency || null,
              first_entry_account: data.account_id,
              first_entry_debit: 0,
              first_entry_credit: data.total_amount || 0,
              second_entry_account: payableAccount.id,
              second_entry_debit: data.total_amount || 0,
              second_entry_credit: 0,
              status: 1,
            },
            description:
              `Created purchase journal for purchase ${purchaseId}`,
          },
        );
      }
    }

    /*
     * Item replacement: the frontend sends the full item
     * list, so old active items are soft-deleted and the
     * new list is inserted.
     */
    if (Array.isArray(data.items)) {
      await purchaseRepository.softDeleteItemsByPurchase(
        connection,
        {
          orgId,
          purchaseId,
          userId,
        },
      );

      const createdItems = [];

      for (const item of data.items) {
        const itemLocalId = generateLocalId();

        const createdItem =
          await purchaseRepository.createItem(
            connection,
            {
              orgId,
              localId: itemLocalId,
              userId,
              data: {
                ...item,
                purchase_id: purchaseId,
              },
            },
          );

        createdItems.push(createdItem);
      }

      /*
       * Stock sync on item replacement:
       * - Confirmed -> confirmed edit: put the old stock back,
       *   then the new quantities are added below (e.g. qty 4 -> 5).
       * - Draft -> confirmed: add stock for the first time.
       * - Draft -> draft: no stock movement.
       */
      const oldActiveItems = oldItems.filter(
        (item) => Number(item.status) === 1,
      );

      if (
        isConfirmed(oldPurchase.bill_status) &&
        isConfirmed(nextBillStatus)
      ) {
        for (const item of oldActiveItems) {
          await purchaseRepository.adjustProductQuantity(
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
              warehouseId: oldPurchase.warehouse_id,
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
                warehouse_id: oldPurchase.warehouse_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                reference_id: purchaseId,
                reference_type: 'purchase',
                transaction_type: 'purchase_revert',
                quantity: -Number(item.quantity || 0),
                unit_cost: Number(item.unit_price || 0),
                total_cost: -Number(item.subtotal || 0),
                currency: item.currency || oldPurchase.currency || null,
                peer_price: Number(item.sell_price || 0),
                peer_currency: item.sell_currency || oldPurchase.currency || null,
                date: oldPurchase.bill_date || new Date(),
                description: `Purchase #${purchaseId} quantities updated, old stock reverted`,
                status: 1,
              },
            },
          );
        }

        await batchLedger.revertPurchaseBatches(
          connection,
          {
            orgId,
            userId,
            purchaseId,
          },
        );
      }

      if (isConfirmed(nextBillStatus)) {
        for (const item of data.items) {
          await purchaseRepository.adjustProductQuantity(
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
              warehouseId: data.warehouse_id ?? oldPurchase.warehouse_id,
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
                warehouse_id: data.warehouse_id ?? oldPurchase.warehouse_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                reference_id: purchaseId,
                reference_type: 'purchase',
                transaction_type: 'purchase',
                quantity: Number(item.quantity || 0),
                unit_cost: Number(item.unit_price || 0),
                total_cost: Number(item.subtotal || 0),
                currency: item.currency || data.currency || oldPurchase.currency || null,
                peer_price: Number(item.sell_price || 0),
                peer_currency: item.sell_currency || data.currency || oldPurchase.currency || null,
                date: data.bill_date || oldPurchase.bill_date || new Date(),
                description: `Purchase Bill #${data.bill_number || oldPurchase.bill_number || ''}`,
                status: 1,
              },
            },
          );

          await purchaseRepository.updateProductPrices(
            connection,
            {
              orgId,
              productId: item.product_id,
              data: item,
            },
          );
        }

        await batchLedger.createPurchaseBatches(
          connection,
          {
            orgId,
            userId,
            purchaseId,
            warehouseId: data.warehouse_id ?? oldPurchase.warehouse_id,
            receivedAt: data.bill_date || oldPurchase.bill_date,
            defaultCurrency: data.currency || oldPurchase.currency,
            items: data.items,
          },
        );
      }

      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'update',
          tableName: 'purchases',
          entityId: purchaseId,

          oldValues: {
            ...oldPurchase,
            items: oldItems,
          },
          newValues: {
            ...updatedPurchase,
            items: createdItems,
          },

          description:
            `Updated purchase ${updatedPurchase.bill_number || `#${purchaseId}`}`,

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
          tableName: 'purchases',
          entityId: purchaseId,

          oldValues: oldPurchase,
          newValues: updatedPurchase,

          description:
            `Updated purchase ${updatedPurchase.bill_number || `#${purchaseId}`}`,

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

    return updatedPurchase;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePurchase({
  user,
  purchaseId,
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

    const oldPurchase =
      await purchaseRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: purchaseId,
          forUpdate: true,
        },
      );

    if (!oldPurchase) {
      throw new AppError(
        'Purchase not found.',
        404,
        'PURCHASE_NOT_FOUND',
      );
    }

    if (Number(oldPurchase.status) === 0) {
      throw new AppError(
        'Purchase is already deleted.',
        409,
        'PURCHASE_ALREADY_DELETED',
      );
    }

    const oldItems =
      await purchaseRepository.findItemsByPurchase(
        connection,
        {
          orgId,
          purchaseId,
          includeDeleted: true,
        },
      );

    /*
     * Revert stock that a confirmed purchase added.
     */
    if (isConfirmed(oldPurchase.bill_status)) {
      for (const item of oldItems) {
        if (Number(item.status) === 0) {
          continue;
        }

        await purchaseRepository.adjustProductQuantity(
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
            warehouseId: oldPurchase.warehouse_id,
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
              warehouse_id: oldPurchase.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: purchaseId,
              reference_type: 'purchase',
              transaction_type: 'purchase_revert',
              quantity: -Number(item.quantity || 0),
              unit_cost: Number(item.unit_price || 0),
              total_cost: -Number(item.subtotal || 0),
              currency: item.currency || oldPurchase.currency || null,
              peer_price: Number(item.sell_price || 0),
              peer_currency: item.sell_currency || oldPurchase.currency || null,
              date: new Date(),
              description: `Deleted purchase #${purchaseId}, stock deducted`,
              status: 1,
            },
          },
        );
      }
    }

    await batchLedger.revertPurchaseBatches(
      connection,
      {
        orgId,
        userId,
        purchaseId,
      },
    );

    const deletedPurchase =
      await purchaseRepository.softDelete(
        connection,
        {
          orgId,
          localId: purchaseId,
          userId,
        },
      );

    await purchaseRepository.softDeleteItemsByPurchase(
      connection,
      {
        orgId,
        purchaseId,
        userId,
      },
    );

    /*
     * Account process: soft-delete the purchase journal so
     * the supplier balance reverts.
     */
    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: purchaseId,
        referenceType: 'purchase',
        userId,
      },
    );

    const payments =
      await purchaseRepository.findPaymentsByPurchase(
        connection,
        {
          orgId,
          purchaseId,
          includeDeleted: true,
        },
      );

    for (const payment of payments) {
      if (Number(payment.status) === 1) {
        await purchaseRepository.softDeletePayment(
          connection,
          {
            orgId,
            localId: payment.id,
            userId,
          },
        );

        /*
         * Account process: soft-delete the payment journals
         * so the supplier/treasury balances revert.
         */
        await journalRepository.softDeleteByReference(
          connection,
          {
            orgId,
            referenceId: payment.id,
            referenceType: 'purchase_payment',
            userId,
          },
        );
      }
    }

    const returns =
      await purchaseRepository.findReturnsByPurchase(
        connection,
        {
          orgId,
          purchaseId,
          includeDeleted: true,
        },
      );

    for (const purchaseReturn of returns) {
      if (Number(purchaseReturn.status) === 0) {
        continue;
      }

      await purchaseRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: purchaseReturn.id,
          userId,
        },
      );

      await purchaseRepository.softDeleteReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId: purchaseReturn.id,
          userId,
        },
      );

      /*
       * Account process: soft-delete the return journal so
       * the supplier/PAYABLE balances revert.
       */
      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: purchaseReturn.id,
          referenceType: 'purchase_return',
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
        tableName: 'purchases',
        entityId: deletedPurchase.id,

        oldValues: {
          ...oldPurchase,
          items: oldItems,
        },
        newValues: deletedPurchase,

        description:
          `Deleted purchase ${oldPurchase.bill_number || `#${purchaseId}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedPurchase;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function createPayment({
  user,
  purchaseId,
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

    const paymentLocalId = generateLocalId();

    const payment =
      await purchaseRepository.createPayment(
        connection,
        {
          orgId,
          localId: paymentLocalId,
          userId,
          data: {
            ...data,
            purchase_id: purchaseId,
          },
        },
      );

    /*
     * Account process: a purchase payment posts two entries
     * (PURCHASE -> PAYABLE and supplier -> treasury/cash)
     * inside the same transaction as the payment.
     */
    const payableAcct =
      await purchaseRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'PAYABLE',
        },
      );

    const purchaseAcct =
      await purchaseRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'PURCHASE',
        },
      );

    if (!payableAcct) {
      throw new AppError(
        'PAYABLE account not found.',
        500,
        'PAYABLE_ACCOUNT_NOT_FOUND',
      );
    }

    if (!purchaseAcct) {
      throw new AppError(
        'PURCHASE account not found.',
        500,
        'PURCHASE_ACCOUNT_NOT_FOUND',
      );
    }

    const paymentDescription =
      data.description || 'Payment for Purchase Invoice';

    /*
     * The amount is positive for a Payment and negative for a
     * Receive (the form sends a signed amount), mirroring the
     * old Dexie journals exactly.
     */
    const signedAmount = Number(payment.amount || 0);
    const isReceive = signedAmount < 0;
    const absAmount = Math.abs(signedAmount);

    const purchaseDebit = isReceive ? 0 : absAmount;
    const purchaseCredit = isReceive ? absAmount : 0;
    const payableDebit = isReceive ? absAmount : 0;
    const payableCredit = isReceive ? 0 : absAmount;

    // PURCHASE -> PAYABLE
    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString(),
          reference_id: payment.id,
          reference_type: 'purchase_payment',
          description: paymentDescription,
          currency: payment.currency || null,
          first_entry_account: purchaseAcct.id,
          first_entry_debit: purchaseDebit,
          first_entry_credit: purchaseCredit,
          second_entry_account: payableAcct.id,
          second_entry_debit: payableDebit,
          second_entry_credit: payableCredit,
          status: 1,
        },
        description:
          `Created purchase/payable journal for payment ${payment.id}`,
      },
    );

    // supplier -> treasury/cash (the account chosen on the form)
    await createJournalEntry(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data: {
          date: new Date().toISOString(),
          reference_id: payment.id,
          reference_type: 'purchase_payment',
          description: paymentDescription,
          currency: payment.currency || null,
          first_entry_account: purchase.account_id,
          first_entry_debit: purchaseDebit,
          first_entry_credit: purchaseCredit,
          second_entry_account: data.account_id,
          second_entry_debit: payableDebit,
          second_entry_credit: payableCredit,
          status: 1,
        },
        description:
          `Created supplier/treasury journal for payment ${payment.id}`,
      },
    );

    /*
     * Cross-currency: when the payment is made in a different
     * currency than the purchase, also post the converted equivalents
     * in the purchase's currency. Without these, the supplier's
     * balance (which lives in the purchase's currency) keeps the full
     * purchase credit even though the payment settled it.
     */
    const purchaseCurrency = purchase.currency || payment.currency || null;

    if (
      payment.currency &&
      purchaseCurrency &&
      payment.currency !== purchaseCurrency &&
      absAmount > 0
    ) {
      const convertedAmount =
        await convertCurrencyAmount(
          connection,
          {
            orgId,
            amount: absAmount,
            fromCurrency: payment.currency,
            toCurrency: purchaseCurrency,
          },
        );

      if (Number(convertedAmount) > 0) {
        // PURCHASE -> PAYABLE (converted to the purchase's currency)
        await createJournalEntry(
          connection,
          {
            orgId,
            userId,
            requestContext,
            data: {
              date: new Date().toISOString(),
              reference_id: payment.id,
              reference_type: 'purchase_payment',
              description: paymentDescription,
              currency: purchaseCurrency,
              first_entry_account: purchaseAcct.id,
              first_entry_debit: purchaseDebit ? convertedAmount : 0,
              first_entry_credit: purchaseCredit ? convertedAmount : 0,
              second_entry_account: payableAcct.id,
              second_entry_debit: payableDebit ? convertedAmount : 0,
              second_entry_credit: payableCredit ? convertedAmount : 0,
              status: 1,
            },
            description:
              `Created converted purchase/payable journal for payment ${payment.id}`,
          },
        );

        // supplier -> treasury/cash (converted to the purchase's currency)
        await createJournalEntry(
          connection,
          {
            orgId,
            userId,
            requestContext,
            data: {
              date: new Date().toISOString(),
              reference_id: payment.id,
              reference_type: 'purchase_payment',
              description: paymentDescription,
              currency: purchaseCurrency,
              first_entry_account: purchase.account_id,
              first_entry_debit: purchaseDebit ? convertedAmount : 0,
              first_entry_credit: purchaseCredit ? convertedAmount : 0,
              second_entry_account: data.account_id,
              second_entry_debit: payableDebit ? convertedAmount : 0,
              second_entry_credit: payableCredit ? convertedAmount : 0,
              status: 1,
            },
            description:
              `Created converted supplier/treasury journal for payment ${payment.id}`,
          },
        );
      }
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'purchase_payments',
        entityId: payment.id,

        oldValues: null,
        newValues: payment,

        description:
          `Added payment of ${payment.amount} ${payment.currency} for purchase #${purchaseId}`,

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
      await purchaseRepository.findPaymentByLocalId(
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

    if (Number(oldPayment.status) === 0) {
      throw new AppError(
        'Payment is already deleted.',
        409,
        'PAYMENT_ALREADY_DELETED',
      );
    }

    const deletedPayment =
      await purchaseRepository.softDeletePayment(
        connection,
        {
          orgId,
          localId: paymentId,
          userId,
        },
      );

    /*
     * Account process: soft-delete the payment journals so
     * the supplier/treasury balances revert.
     */
    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: paymentId,
        referenceType: 'purchase_payment',
        userId,
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
          `Deleted payment for purchase #${oldPayment.purchase_id}`,

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
  purchaseId,
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

    const returnLocalId = generateLocalId();

    const purchaseReturn =
      await purchaseRepository.createReturn(
        connection,
        {
          orgId,
          localId: returnLocalId,
          userId,
          data: {
            ...data,
            purchase_id: purchaseId,
          },
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await purchaseRepository.createReturnItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              purchase_return_id: returnLocalId,
            },
          },
        );

      createdItems.push(createdItem);

      /*
       * A return removes the returned quantity from stock.
       */
      await purchaseRepository.adjustProductQuantity(
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
          warehouseId: data.warehouse_id ?? purchase.warehouse_id,
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
            warehouse_id: data.warehouse_id ?? purchase.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnLocalId,
            reference_type: 'purchase_return',
            transaction_type: 'purchase_return',
            quantity: -Number(item.quantity || 0),
            unit_cost: Number(item.unit_price || 0),
            total_cost: -Number(item.subtotal || 0),
            currency: item.currency || purchase.currency || null,
            peer_price: Number(item.sell_price || 0),
            peer_currency: item.sell_currency || purchase.currency || null,
            date: new Date(),
            description: `Purchase Return for Purchase #${purchase.bill_number || ''}`,
            status: 1,
          },
        },
      );
    }

    await batchLedger.purchaseReturnBatches(
      connection,
      {
        orgId,
        userId,
        purchaseId,
        returnId: returnLocalId,
        warehouseId: data.warehouse_id ?? purchase.warehouse_id,
        items: data.items,
      },
    );

    /*
     * Account process: a purchase return posts a double entry
     * (supplier debit, PAYABLE credit) inside the transaction.
     */
    const payableAccount =
      await purchaseRepository.findAccountByCode(
        connection,
        {
          orgId,
          code: 'PAYABLE',
        },
      );

    if (!payableAccount) {
      throw new AppError(
        'PAYABLE account not found.',
        500,
        'PAYABLE_ACCOUNT_NOT_FOUND',
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
          reference_type: 'purchase_return',
          description:
            `Purchase Return Transaction for Purchase #${purchase.bill_number || ''}`,
          currency: purchaseReturn.currency || null,
          first_entry_account: purchase.account_id,
          first_entry_debit: Number(purchaseReturn.total_amount || 0),
          first_entry_credit: 0,
          second_entry_account: payableAccount.id,
          second_entry_debit: 0,
          second_entry_credit: Number(purchaseReturn.total_amount || 0),
          status: 1,
        },
        description:
          `Created purchase return journal for return ${purchaseReturn.id}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'purchase_returns',
        entityId: purchaseReturn.id,

        oldValues: null,
        newValues: {
          ...purchaseReturn,
          items: createdItems,
        },

        description:
          `Created purchase return ${purchaseReturn.return_number || `#${purchaseReturn.id}`}`,

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
      ...purchaseReturn,
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
      await purchaseRepository.findReturnByLocalId(
        connection,
        {
          orgId,
          localId: returnId,
          forUpdate: true,
        },
      );

    if (!oldReturn) {
      throw new AppError(
        'Purchase return not found.',
        404,
        'PURCHASE_RETURN_NOT_FOUND',
      );
    }

    if (Number(oldReturn.status) === 0) {
      throw new AppError(
        'Purchase return is already deleted.',
        409,
        'PURCHASE_RETURN_ALREADY_DELETED',
      );
    }

    const oldItems =
      await purchaseRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
          includeDeleted: true,
        },
      );

    /*
     * Restore the quantity the return removed.
     */
    for (const item of oldItems) {
      if (Number(item.status) === 0) {
        continue;
      }

      await purchaseRepository.adjustProductQuantity(
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
          warehouseId: oldReturn.warehouse_id,
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
            warehouse_id: oldReturn.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnId,
            reference_type: 'purchase_return',
            transaction_type: 'purchase_return_revert',
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.unit_price || 0),
            total_cost: Number(item.subtotal || 0),
            currency: item.currency || null,
            peer_price: Number(item.sell_price || 0),
            peer_currency: item.sell_currency || null,
            date: new Date(),
            description: `Deleted purchase return #${returnId}, stock restored`,
            status: 1,
          },
        },
      );
    }

    await batchLedger.revertPurchaseReturnBatches(
      connection,
      {
        orgId,
        userId,
        returnId,
      },
    );

    const deletedReturn =
      await purchaseRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: returnId,
          userId,
        },
      );

    await purchaseRepository.softDeleteReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId,
        userId,
      },
    );

    /*
     * Account process: soft-delete the return journal so
     * the supplier/PAYABLE balances revert.
     */
    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: returnId,
        referenceType: 'purchase_return',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'purchase_returns',
        entityId: deletedReturn.id,

        oldValues: {
          ...oldReturn,
          items: oldItems,
        },
        newValues: deletedReturn,

        description:
          `Deleted purchase return ${oldReturn.return_number || `#${returnId}`}`,

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
  listPurchases,
  getPurchase,
  createPurchase,
  updatePurchase,
  deletePurchase,
  createPayment,
  deletePayment,
  createReturn,
  deleteReturn,
};
