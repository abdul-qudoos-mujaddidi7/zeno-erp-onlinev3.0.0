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

const settingsRepository =
  require('../repositories/settings.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

const {
  itemQuantityInProductUnit,
} = require('../utils/unitConversion');

const {
  accountingDate,
} = require('../utils/accountingDate');

const accountService =
  require('./account.service');

const paymentPosting =
  require('./payment-posting.service');

const fiscalPostingGuard =
  require('./fiscal-posting-guard.service');

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
 * A purchase line is entered in a business unit; product stock, the
 * per-warehouse balance and the FIFO/LIFO layers created for the same
 * line are all kept in the product's base unit. Every inventory write in
 * this service (create, edit, draft reversal, delete, return, return
 * reversal) goes through this one conversion so the forward and reverse
 * quantities are always symmetrical.
 */
async function toProductStockQuantity(connection, orgId, item) {
  return itemQuantityInProductUnit(
    connection,
    {
      orgId,
      item,
    },
  );
}

/*
 * Bills keep only the counter in `bill_number` (`275`), the prefix is added
 * when the document is rendered. The allocation mirrors sales: the
 * `bill_index` setting is locked with SELECT ... FOR UPDATE and the number is
 * checked against the bills that already exist, so a stale value coming from
 * the client can never be stored twice.
 *
 * A preview (consume: false) resolves the same number without moving the
 * counter, so the purchase form can display it.
 */
async function allocateBillNumber(
  connection,
  {
    orgId,
    userId,
    consume = true,
  },
) {
  const indexSetting = await settingsRepository.findByKey(
    connection,
    {
      orgId,
      key: 'bill_index',
      forUpdate: consume,
    },
  );

  let index = Number(indexSetting?.value || 0);

  /*
   * If the counter was clobbered, fall back to the highest sequential bill
   * number actually in use instead of issuing absurd numbers.
   */
  if (!Number.isSafeInteger(index) || index > 99999999) {
    const [rows] = await connection.execute(
      `SELECT
         MAX(CAST(bill_number AS UNSIGNED)) m
       FROM purchases
       WHERE org_id = ?
         AND bill_number REGEXP '^[0-9]+$'`,
      [orgId],
    );

    index = Math.max(Number(rows[0]?.m || 0), 0);
  }

  let billNumber = String(index + 1);

  while (await billNumberExists(connection, { orgId, billNumber })) {
    index += 1;
    billNumber = String(index + 1);
  }

  index += 1;

  if (consume && indexSetting) {
    await settingsRepository.update(
      connection,
      {
        orgId,
        localId: indexSetting.local_id,
        userId,
        data: {
          value: String(index),
        },
      },
    );
  }

  return billNumber;
}

async function billNumberExists(
  connection,
  {
    orgId,
    billNumber,
  },
) {
  const [rows] = await connection.execute(
    `
      SELECT 1
      FROM purchases
      WHERE org_id = ?
        AND bill_number = ?
      LIMIT 1
    `,
    [
      orgId,
      billNumber,
    ],
  );

  return rows.length > 0;
}

/*
 * Read-only counterpart used by GET /purchases/next-number.
 */
async function previewNextBillNumber({
  user,
}) {
  const {
    orgId,
    userId,
  } = getAuthenticatedIdentity(user);

  const connection = await db.getConnection();

  try {
    return {
      bill_number: await allocateBillNumber(
        connection,
        {
          orgId,
          userId,
          consume: false,
        },
      ),
    };
  } finally {
    connection.release();
  }
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
  /*
   * Step 4.5 second line of defence: the document entry points are already
   * guarded, so this only catches a journal dated from something other than
   * the bill (for example a journal dated today). The whole transaction
   * unwinds when it rejects.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: data.date,
      operation: 'purchase.journal',
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

async function listPurchases({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);
  const ids = String(filters.ids || '')
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

  const result = await purchaseRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      accountId: filters.account_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      billStatus: filters.bill_status,
      paymentStatus: filters.payment_status,
      skipCount: Number(filters.skip_count) === 1,
      pagination,
      sortBy: filters.sort_by,
      sortDir: filters.sort_dir,
      ids,
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

    /*
     * Step 4.5: a bill dated inside a CLOSED fiscal year may not be created.
     * Checked before any document, stock or journal write. A date with no
     * configured fiscal year is still accepted.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: data.bill_date,
        operation: 'purchase.create',
      },
    );

    const localId = generateLocalId();

    /*
     * Confirmed and draft bills alike get their number from the org's
     * counter, allocated atomically inside this transaction. The form only
     * shows a preview of that number, so two bills can never share one.
     */
    const resolvedData = {
      ...data,
      bill_number: await allocateBillNumber(
        connection,
        {
          orgId,
          userId,
        },
      ),
    };

    const purchase =
      await purchaseRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data: resolvedData,
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
        const stockQty = await toProductStockQuantity(
          connection,
          orgId,
          item,
        );

        /*
         * A service is not inventory: its line, totals and prices are
         * kept, but it moves no stock and writes no inventory movement.
         */
        if (!stockQty.isService) {
          await purchaseRepository.adjustProductQuantity(
            connection,
            {
              orgId,
              productId: item.product_id,
              delta: stockQty.quantity,
            },
          );

          /*
           * Warehouse balances: the purchase header carries the
           * warehouse, so the per-warehouse row moves in lockstep
           * with the product quantity inside the same transaction.
           * Both are in the product base unit.
           */
          await warehouseProductRepository.adjustQuantity(
            connection,
            {
              orgId,
              userId,
              warehouseId: data.warehouse_id,
              productId: item.product_id,
              productUnitId: stockQty.productUnitId,
              delta: stockQty.quantity,
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
        }

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

    accountService.invalidateAccountAggregates(orgId);

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

/*
 * Step 2.6 — backend-authoritative purchase reversal.
 *
 * A confirmed purchase changes four things: product + warehouse stock,
 * its own FIFO/LIFO batch layers, its payments (with their journals and
 * the purchase `remaining` value), and its posted purchase journal.
 * Reverting it (to draft, or by deleting it) must undo all four inside
 * ONE transaction. These helpers are shared by updatePurchase
 * (confirmed -> draft) and deletePurchase so the frontend only ever
 * sends a single request instead of orchestrating the reversal itself.
 */

/*
 * Rejects the reversal while any of the purchase's own stock has already
 * been consumed by a later sale, transfer or waste (FIFO/LIFO orgs).
 */
async function assertPurchaseReversibleOnConnection(
  connection,
  {
    orgId,
    purchaseId,
  },
) {
  await batchLedger.assertPurchaseReversible(
    connection,
    {
      orgId,
      purchaseId,
    },
  );
}

/*
 * Purchase returns belong to the purchase's own lifecycle (goods went
 * back to the supplier), so they are undone BEFORE the purchase' layers
 * are zeroed: a return had put its quantity back into the original
 * layers, and that quantity has to leave again together with the
 * purchase. Doing it in the other order would restore into layers that
 * are already gone.
 */
async function revertPurchaseReturnsOnConnection(
  connection,
  {
    orgId,
    userId,
    purchaseId,
  },
) {
  const returns =
    await purchaseRepository.findReturnsByPurchase(
      connection,
      {
        orgId,
        purchaseId,
        includeDeleted: true,
      },
    );

  /*
   * Step 4.5: each return is its own accounting event, so its own date is
   * checked before this reversal erases it.
   */
  await fiscalPostingGuard.assertAccountingDatesOpen(
    connection,
    {
      orgId,
      dates: returns.map(
        (purchaseReturn) => purchaseReturn.return_date,
      ),
      operation: 'purchase reversal (return reversal)',
    },
  );

  for (const purchaseReturn of returns) {
    if (Number(purchaseReturn.status) === 0) {
      continue;
    }

    /*
     * Undo the return's own stock/batch deduction first, so the purchase
     * reversal leaves the pre-purchase stock level intact.
     */
    await revertPurchaseReturnStockOnConnection(
      connection,
      {
        orgId,
        userId,
        purchaseReturn,
      },
    );

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
     * Account process: soft-delete the return journal so the
     * supplier/PAYABLE balances revert.
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
}

/*
 * Removes the purchase's payments through the Step 1 authoritative
 * payment service, so the payment rows, their journals, the purchase
 * `remaining` value and the account aggregates stay consistent. No
 * payment-reversal logic is duplicated here.
 */
async function revertPurchasePaymentsOnConnection(
  connection,
  {
    orgId,
    userId,
    purchaseId,
  },
) {
  const payments =
    await purchaseRepository.findPaymentsByPurchase(
      connection,
      {
        orgId,
        purchaseId,
        includeDeleted: true,
      },
    );

  /* Same rule for the payments this reversal is about to reverse. */
  await fiscalPostingGuard.assertAccountingDatesOpen(
    connection,
    {
      orgId,
      dates: payments.map(
        (payment) => payment.payment_date,
      ),
      operation: 'purchase reversal (payment reversal)',
    },
  );

  for (const payment of payments) {
    if (Number(payment.status) === 0) {
      continue;
    }

    await paymentPosting.softDeleteBillPaymentOnConnection(
      connection,
      {
        orgId,
        userId,
        payment,
        isSale: false,
      },
    );
  }
}

/*
 * Removes the purchase's own inventory contribution: product quantity,
 * warehouse quantity, the compensating stock movement, and (for
 * FIFO/LIFO) the purchase's batch layers.
 */
async function revertPurchaseInventoryOnConnection(
  connection,
  {
    orgId,
    userId,
    purchase,
    items,
    movementDescription,
  },
) {
  const purchaseId = purchase.id;

  for (const item of items) {
    if (Number(item.status) === 0) {
      continue;
    }

    /*
     * Reverse the exact BASE-UNIT quantity the confirmation applied, by
     * re-deriving it from the same stored line, so receiving and
     * reverting can never disagree for a multi-unit product.
     */
    const stockQty = await toProductStockQuantity(
      connection,
      orgId,
      item,
    );

    /* Services are not inventory: no stock balance, no movement. */
    if (stockQty.isService) {
      continue;
    }

    await purchaseRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: -stockQty.quantity,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: purchase.warehouse_id,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: -stockQty.quantity,
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: purchase.warehouse_id,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: purchaseId,
          reference_type: 'purchase',
          transaction_type: 'purchase_revert',
          quantity: -Number(item.quantity || 0),
          unit_cost: Number(item.unit_price || 0),
          total_cost: -Number(item.subtotal || 0),
          currency: item.currency || purchase.currency || null,
          peer_price: Number(item.sell_price || 0),
          peer_currency: item.sell_currency || purchase.currency || null,
          date: new Date(),
          description:
            movementDescription || `Purchase #${purchaseId} stock reverted`,
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

/*
 * Full reversal of a confirmed purchase inside the caller's transaction:
 * returns -> payments -> inventory/batches -> posted purchase journal.
 * The caller decides what to do with the purchase row itself (draft it or
 * soft-delete it).
 */
async function revertConfirmedPurchaseOnConnection(
  connection,
  {
    orgId,
    userId,
    purchaseId,
    purchase,
    items,
    movementDescription,
  },
) {
  await assertPurchaseReversibleOnConnection(
    connection,
    {
      orgId,
      purchaseId,
    },
  );

  await revertPurchaseReturnsOnConnection(
    connection,
    {
      orgId,
      userId,
      purchaseId,
    },
  );

  await revertPurchasePaymentsOnConnection(
    connection,
    {
      orgId,
      userId,
      purchaseId,
    },
  );

  await revertPurchaseInventoryOnConnection(
    connection,
    {
      orgId,
      userId,
      purchase,
      items,
      movementDescription,
    },
  );

  /*
   * Account process: soft-delete the purchase journal so the supplier
   * balance no longer counts the phantom credit.
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

    /*
     * Step 4.5: both the stored bill date and the incoming one are checked.
     * This also covers the confirmed -> draft reversal, which re-reads and
     * re-posts this bill's journals, payments and returns.
     */
    await fiscalPostingGuard.assertAccountingDatesOpen(
      connection,
      {
        orgId,
        dates: [oldPurchase.bill_date, data.bill_date],
        operation: 'purchase.update',
      },
    );

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
     * Account process: when a confirmed purchase is reverted to draft
     * (PurchaseDraftModal) the WHOLE reversal runs here, in this one
     * transaction: returns, payments (through the Step 1 authoritative
     * payment service), product/warehouse stock, FIFO/LIFO layers, the
     * compensating stock movements and the posted purchase journal. The
     * frontend only sends { bill_status: 'draft' }.
     *
     * Nothing runs when the purchase is not currently confirmed, so an
     * already-draft purchase can never be reversed twice. When a draft is
     * confirmed through an edit, the journal is posted below (items
     * branch).
     */
    if (
      isConfirmed(oldPurchase.bill_status) &&
      nextBillStatus &&
      !isConfirmed(nextBillStatus)
    ) {
      await revertConfirmedPurchaseOnConnection(
        connection,
        {
          orgId,
          userId,
          purchaseId,
          purchase: oldPurchase,
          items: oldItems,
          movementDescription:
            `Purchase #${purchaseId} reverted to draft, stock deducted`,
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
          const stockQty = await toProductStockQuantity(
            connection,
            orgId,
            item,
          );

          /* Services are not inventory: no stock balance, no movement. */
          if (stockQty.isService) {
            continue;
          }

          await purchaseRepository.adjustProductQuantity(
            connection,
            {
              orgId,
              productId: item.product_id,
              delta: -stockQty.quantity,
            },
          );

          await warehouseProductRepository.adjustQuantity(
            connection,
            {
              orgId,
              userId,
              warehouseId: oldPurchase.warehouse_id,
              productId: item.product_id,
              productUnitId: stockQty.productUnitId,
              delta: -stockQty.quantity,
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
          const stockQty = await toProductStockQuantity(
            connection,
            orgId,
            item,
          );

          /*
           * A service is not inventory: its line, totals and prices are
           * kept, but it moves no stock and writes no inventory movement.
           */
          if (!stockQty.isService) {
            await purchaseRepository.adjustProductQuantity(
              connection,
              {
                orgId,
                productId: item.product_id,
                delta: stockQty.quantity,
              },
            );

            await warehouseProductRepository.adjustQuantity(
              connection,
              {
                orgId,
                userId,
                warehouseId: data.warehouse_id ?? oldPurchase.warehouse_id,
                productId: item.product_id,
                productUnitId: stockQty.productUnitId,
                delta: stockQty.quantity,
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
          }

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

    accountService.invalidateAccountAggregates(orgId);

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

    /*
     * Step 4.5: deleting a closed-year bill would erase that year's cost and
     * stock movement. The ORIGINAL bill date decides, never today's date.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: oldPurchase.bill_date,
        operation: 'purchase.delete',
      },
    );

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
     * Batch safety: a FIFO/LIFO purchase whose layers have already been
     * consumed by a later sale, transfer or waste cannot be reversed
     * without corrupting inventory, so reject instead of guessing.
     */
    await assertPurchaseReversibleOnConnection(
      connection,
      {
        orgId,
        purchaseId,
      },
    );

    /*
     * Returns and payments are undone through the shared reversal helpers
     * (payments via the Step 1 authoritative payment service) so deleting
     * a purchase can never leave an orphan payment or return behind.
     */
    await revertPurchaseReturnsOnConnection(
      connection,
      {
        orgId,
        userId,
        purchaseId,
      },
    );

    await revertPurchasePaymentsOnConnection(
      connection,
      {
        orgId,
        userId,
        purchaseId,
      },
    );

    /*
     * Revert stock that a confirmed purchase added. A draft purchase never
     * touched stock, but its layers are still healed in case the
     * organization changed its inventory method after the fact.
     */
    if (isConfirmed(oldPurchase.bill_status)) {
      await revertPurchaseInventoryOnConnection(
        connection,
        {
          orgId,
          userId,
          purchase: oldPurchase,
          items: oldItems,
          movementDescription:
            `Deleted purchase #${purchaseId}, stock deducted`,
        },
      );
    } else {
      await batchLedger.revertPurchaseBatches(
        connection,
        {
          orgId,
          userId,
          purchaseId,
        },
      );
    }

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

    accountService.invalidateAccountAggregates(orgId);

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

    /*
     * Delegates to the single authoritative payment posting service so
     * the purchase screen, the journal screen, and the generic
     * purchase-payment endpoint all share one algorithm.
     */
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

    /*
     * Soft-deletes the payment, reverses its journals, and refreshes the
     * purchase's remaining through the single authoritative payment service.
     */
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

    accountService.invalidateAccountAggregates(orgId);

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

    /*
     * A return is its own accounting event: only the return's own date is
     * checked here. Returning goods in an open year against a bill from a
     * closed year stays allowed.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: data.return_date,
        operation: 'purchase_return.create',
      },
    );

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
       * A return removes the returned quantity from stock, converted
       * into the product base unit like every other inventory write.
       */
      const stockQty = await toProductStockQuantity(
        connection,
        orgId,
        item,
      );

      /* Services are not inventory: no stock balance, no movement. */
      if (stockQty.isService) {
        continue;
      }

      await purchaseRepository.adjustProductQuantity(
        connection,
        {
          orgId,
          productId: item.product_id,
          delta: -stockQty.quantity,
        },
      );

      await warehouseProductRepository.adjustQuantity(
        connection,
        {
          orgId,
          userId,
          warehouseId: data.warehouse_id ?? purchase.warehouse_id,
          productId: item.product_id,
          productUnitId: stockQty.productUnitId,
          delta: -stockQty.quantity,
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
          /*
           * The return carries its own accounting date. The previous value
           * was the UTC calendar day at posting time, which files a return
           * into the wrong day (and potentially the wrong fiscal year) for
           * part of every day in a non-UTC timezone.
           */
          date: accountingDate(purchaseReturn.return_date),
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

    accountService.invalidateAccountAggregates(orgId);

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

/*
 * Reverses the inventory effect of a single purchase return: adds the
 * returned quantity back to product + warehouse stock, records the
 * compensating movement, and restores exactly the batch layers the
 * return had reduced. Shared by return deletion and by purchase delete
 * so a purchase that has returns never leaves stock understated.
 */
async function revertPurchaseReturnStockOnConnection(
  connection,
  {
    orgId,
    userId,
    purchaseReturn,
  },
) {
  const returnItems =
    await purchaseRepository.findReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId: purchaseReturn.id,
        includeDeleted: true,
      },
    );

  for (const item of returnItems) {
    if (Number(item.status) === 0) {
      continue;
    }

    /*
     * Mirror of the return's own deduction, in base units, so a return
     * reversal never leaves the product/warehouse balance off by the
     * unit ratio.
     */
    const stockQty = await toProductStockQuantity(
      connection,
      orgId,
      item,
    );

    /* Services are not inventory: no stock balance, no movement. */
    if (stockQty.isService) {
      continue;
    }

    await purchaseRepository.adjustProductQuantity(
      connection,
      {
        orgId,
        productId: item.product_id,
        delta: stockQty.quantity,
      },
    );

    await warehouseProductRepository.adjustQuantity(
      connection,
      {
        orgId,
        userId,
        warehouseId: purchaseReturn.warehouse_id,
        productId: item.product_id,
        productUnitId: stockQty.productUnitId,
        delta: stockQty.quantity,
      },
    );

    await stockTransactionRepository.recordMovement(
      connection,
      {
        orgId,
        userId,
        data: {
          warehouse_id: purchaseReturn.warehouse_id,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: purchaseReturn.id,
          reference_type: 'purchase_return',
          transaction_type: 'purchase_return_revert',
          quantity: Number(item.quantity || 0),
          unit_cost: Number(item.unit_price || 0),
          total_cost: Number(item.subtotal || 0),
          currency: item.currency || null,
          peer_price: Number(item.sell_price || 0),
          peer_currency: item.sell_currency || null,
          date: new Date(),
          description: `Reversed purchase return #${purchaseReturn.id}, stock restored`,
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
      returnId: purchaseReturn.id,
    },
  );
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

    /*
     * Step 4.5: reversing a return that belongs to a closed year would change
     * that year's result, so the return's own date decides.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: oldReturn.return_date,
        operation: 'purchase_return.delete',
      },
    );

    const oldItems =
      await purchaseRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
          includeDeleted: true,
        },
      );

    await revertPurchaseReturnStockOnConnection(
      connection,
      {
        orgId,
        userId,
        purchaseReturn: oldReturn,
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

    accountService.invalidateAccountAggregates(orgId);

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
  previewNextBillNumber,
  /* Exported for the bill-number regression tests. */
  allocateBillNumber,
};
