const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const saleRepository =
  require('../repositories/sale.repository');

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
 * A document line is entered in a business unit; every inventory balance
 * (products.quantity, warehouse_products.quantity, batch layers) is kept
 * in the product's base unit. This is the single conversion entry point
 * shared by the sale, purchase, transfer and waste services.
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

async function persistSaleBatchCosts(
  connection,
  {
    orgId,
    userId,
    items,
    createdItems,
    itemCosts,
  },
) {
  if (!itemCosts?.length) return;

  for (let index = 0; index < (createdItems || []).length; index += 1) {
    const created = createdItems[index];
    const item = items?.[index] || {};
    const entry = itemCosts[index];

    if (!created) continue;

    /*
     * A successful FIFO/LIFO sale is always fully covered by layers, so
     * every unit of the line has a real batch cost. Coverage is decided
     * by the CONSUMED QUANTITY, never by the cost: a legitimate layer
     * may cost zero, and it must still store a deterministic result
     * (fifo_cost = 0, profit = revenue) instead of being skipped.
     */
    if (!entry?.covered) {
      throw new AppError(
        'Sale line is not fully covered by inventory batches, so its cost is unknown.',
        409,
        'INCOMPLETE_BATCH_COST_COVERAGE',
      );
    }

    const fifoCost = Number(entry.fifo_cost) || 0;
    const quantity = Number(item.quantity ?? created.quantity) || 0;
    const unitPrice = Number(item.unit_price ?? created.unit_price) || 0;
    const localId = created.local_id || created.id;

    await saleRepository.updateItemCosts(
      connection,
      {
        orgId,
        localId,
        userId,
        fifoCost,
        profit: unitPrice * quantity - fifoCost,
      },
    );
  }
}

/*
 * Allocates the next invoice number for the org atomically inside
 * the caller's transaction. The settings `invoice_index` row is
 * locked with SELECT ... FOR UPDATE, so concurrent POS sessions
 * (multiple tabs/devices) can never be handed the same number.
 * Returns a number guaranteed to be unused by any active sale.
 */
async function allocateInvoiceNumber(
  connection,
  {
    orgId,
    userId,
    saleType,
  },
) {
  const isPos = String(saleType || '') === 'pos';

  const prefixSetting = await settingsRepository.findByKey(
    connection,
    {
      orgId,
      key: isPos ? 'pos_index_prefix' : 'invoice_index_prefix',
      forUpdate: true,
    },
  );

  const indexSetting = await settingsRepository.findByKey(
    connection,
    {
      orgId,
      key: 'invoice_index',
      forUpdate: true,
    },
  );

  const prefix = prefixSetting?.value || (isPos ? 'POS-' : 'INV-');
  let index = Number(indexSetting?.value || 0);

  /*
   * If the counter was clobbered (e.g. by the desktop app's
   * timestamp-style value), fall back to the highest sequential
   * number actually in use for this prefix instead of issuing
   * absurd numbers.
   */
  if (!Number.isSafeInteger(index) || index > 99999999) {
    const [rows] = await connection.execute(
      `SELECT
         MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) m
       FROM sales
       WHERE org_id = ?
         AND invoice_number LIKE ?
         AND CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED) < 100000000`,
      [orgId, `${prefix}%`],
    );
    index = Math.max(Number(rows[0]?.m || 0), 0);
  }

  /*
   * Skip past any number a live sale already holds (protects
   * against legacy duplicates and counters that drifted ahead).
   */
  let invoiceNumber = `${prefix}${index + 1}`;
  while (
    await saleRepository.findByInvoiceNumber(
      connection,
      {
        orgId,
        invoiceNumber,
      },
    )
  ) {
    index += 1;
    invoiceNumber = `${prefix}${index + 1}`;
  }
  index += 1;

  if (indexSetting) {
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

  return invoiceNumber;
}

/*
 * Creates a journal row inside the caller's transaction and
 * records an activity log entry for it. The journal mirrors
 * the exact double-entry structure the frontend used to write
 * to Dexie: customer + RECEIVABLE for the sale, SALES +
 * RECEIVABLE and customer + treasury for payments, customer +
 * RECEIVABLE for returns.
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
   * guarded, so this only catches a journal that is dated from something
   * other than the invoice (for example a journal dated today). The whole
   * transaction unwinds when it rejects.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: data.date,
      operation: 'sale.journal',
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

async function listSales({
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

  const result = await saleRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      accountId: filters.account_id,
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      invoiceStatus: filters.invoice_status,
      paymentStatus: filters.payment_status,
      skipCount: Number(filters.skip_count) === 1,
      pagination,
      sortBy: filters.sort_by,
      sortDir: filters.sort_dir,
      ids,
    },
  );

  /*
   * The sales index page renders remaining balances from
   * payments and returns, so the list endpoint can attach them
   * in a single round trip instead of one request per sale.
   */
  if (Number(filters.relations) === 1) {
    const sales = result.data;
    const saleIds =
      sales.map((s) => s.id);

    const [
      payments,
      returns,
    ] = await Promise.all([
      saleRepository.findPaymentsBySaleIds(
        db,
        {
          orgId,
          saleIds,
        },
      ),
      saleRepository.findReturnsBySaleIds(
        db,
        {
          orgId,
          saleIds,
        },
      ),
    ]);

    const paymentsBySale = new Map();
    for (const payment of payments) {
      const key = Number(payment.sale_id);
      if (!paymentsBySale.has(key)) {
        paymentsBySale.set(key, []);
      }
      paymentsBySale.get(key).push(payment);
    }

    const returnsBySale = new Map();
    for (const saleReturn of returns) {
      const key = Number(saleReturn.sale_id);
      if (!returnsBySale.has(key)) {
        returnsBySale.set(key, []);
      }
      returnsBySale.get(key).push({
        ...saleReturn,
        items: [],
      });
    }

    return {
      data: sales.map((sale) => ({
        ...sale,
        payments: paymentsBySale.get(Number(sale.id)) || [],
        returns: returnsBySale.get(Number(sale.id)) || [],
      })),
      meta: result.meta,
    };
  }

  return result;
}

async function getSale({
  user,
  saleId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const sale =
    await saleRepository.findByLocalId(
      db,
      {
        orgId,
        localId: saleId,
      },
    );

  if (!sale) {
    throw new AppError(
      'Sale not found.',
      404,
      'SALE_NOT_FOUND',
    );
  }

  let items =
    await saleRepository.findItemsBySale(
      db,
      {
        orgId,
        saleId,
      },
    );

  /*
   * Soft-delete hides sale_items (status = 0). A later totals
   * PATCH can revive the sale header while leaving those
   * lines deleted, so reopen the original items whenever the
   * bill is deleted or the header still has a total with no
   * active lines.
   */
  const includeDeleted =
    Number(sale.status) === 0 ||
    (
      items.length === 0 &&
      (
        Number(sale.items_count) > 0 ||
        Number(sale.total_amount) > 0
      )
    );

  if (includeDeleted && items.length === 0) {
    items =
      await saleRepository.findItemsBySale(
        db,
        {
          orgId,
          saleId,
          includeDeleted: true,
        },
      );
  }

  const [
    payments,
    returns,
  ] = await Promise.all([
    saleRepository.findPaymentsBySale(
      db,
      {
        orgId,
        saleId,
        includeDeleted,
      },
    ),
    saleRepository.findReturnsBySale(
      db,
      {
        orgId,
        saleId,
        includeDeleted,
      },
    ),
  ]);

  const returnItems =
    await Promise.all(
      returns.map(async (saleReturn) =>
        saleRepository.findReturnItemsByReturn(
          db,
          {
            orgId,
            returnId: saleReturn.id,
            includeDeleted,
          },
        )
      ),
    );

  return {
    ...sale,
    items,
    payments,
    returns: returns.map(
      (saleReturn, index) => ({
        ...saleReturn,
        items: returnItems[index] || [],
      }),
    ),
  };
}

async function createSale({
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
     * Step 4.5: an invoice dated inside a CLOSED fiscal year may not be
     * created. Checked before any document, stock or journal write, so a
     * rejection leaves no trace. A date with no configured fiscal year is
     * still accepted.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: data.invoice_date,
        operation: 'sale.create',
      },
    );

    const localId = generateLocalId();

    /*
     * Confirmed sales get their invoice number from the org's
     * counter, allocated atomically inside this transaction so two
     * POS sessions can never stamp the same bill number.
     */
    const resolvedData = isConfirmed(data.invoice_status)
      ? {
          ...data,
          invoice_number: await allocateInvoiceNumber(
            connection,
            {
              orgId,
              userId,
              saleType: data.sale_type,
            },
          ),
        }
      : data;

    const sale =
      await saleRepository.create(
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
        await saleRepository.createItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              sale_id: localId,
            },
          },
        );

      createdItems.push(createdItem);

      /*
       * Stock-quantity writes: only a confirmed sale
       * moves stock (out of the warehouse). Drafts are
       * UI-only.
       */
      if (isConfirmed(data.invoice_status)) {
        const stockQty = await toProductStockQuantity(
          connection,
          orgId,
          item,
        );

        /* Services are not inventory: no stock balance, no movement. */
        if (stockQty.isService) {
          continue;
        }

        await saleRepository.adjustProductQuantity(
          connection,
          {
            orgId,
            productId: item.product_id,
            delta: -stockQty.quantity,
          },
        );

        /*
         * Warehouse balances: the sale header carries the
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
              warehouse_id: data.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: localId,
              reference_type: 'sale',
              transaction_type: 'sale',
              quantity: -Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: -Number(item.subtotal ?? 0),
              currency: item.currency || data.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || data.currency || null,
              date: data.invoice_date || new Date(),
              description: `Sale Invoice #${sale.invoice_number || ''}`,
              status: 1,
            },
          },
        );
      }
    }

    if (isConfirmed(data.invoice_status)) {
      const itemCosts = await batchLedger.consumeSaleBatches(
        connection,
        {
          orgId,
          userId,
          saleId: localId,
          warehouseId: data.warehouse_id,
          date: data.invoice_date,
          defaultCurrency: data.currency,
          items: data.items.map((item, index) => ({
            ...item,
            sale_item_id: createdItems[index]?.id || null,
          })),
        },
      );

      await persistSaleBatchCosts(
        connection,
        {
          orgId,
          userId,
          items: data.items,
          createdItems,
          itemCosts,
        },
      );
    }

    /*
     * Account process: a confirmed sale posts a double
     * entry to the customer (debit) and RECEIVABLE (credit)
     * inside the same transaction, so the customer balance
     * updates atomically with the sale.
     */
    if (isConfirmed(data.invoice_status)) {
      const receivableAccount =
        await saleRepository.findAccountByCode(
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
            date: data.invoice_date || null,
            reference_id: localId,
            reference_type: 'sale',
            description:
              data.description || `Sale Invoice #${sale.invoice_number || ''}`,
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
            `Created sale journal for sale ${sale.id}`,
        },
      );
    }

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'sales',
        entityId: sale.id,

        oldValues: null,
        newValues: {
          ...sale,
          items: createdItems,
        },

        description:
          `Created sale ${sale.invoice_number || `#${sale.id}`}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    let createdPayment = null;

    /*
     * Confirm Sale can send the payment in the same payload so
     * the bill is posted in one round-trip (sale + stock +
     * journals + payment) instead of a follow-up /payments call.
     */
    if (
      isConfirmed(data.invoice_status) &&
      data.payment &&
      Number(data.payment.amount || 0) !== 0
    ) {
      createdPayment = await createSalePaymentOnConnection(
        connection,
        {
          orgId,
          userId,
          requestContext,
          sale,
          saleId: localId,
          data: data.payment,
        },
      );
    }

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return {
      ...sale,
      items: createdItems,
      payments: createdPayment ? [createdPayment] : [],
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateSale({
  user,
  saleId,
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

    const oldSale =
      await saleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: saleId,
          forUpdate: true,
        },
      );

    if (!oldSale) {
      throw new AppError(
        'Sale not found.',
        404,
        'SALE_NOT_FOUND',
      );
    }

    if (Number(oldSale.status) === 0) {
      throw new AppError(
        'Sale is deleted.',
        409,
        'SALE_DELETED',
      );
    }

    /*
     * Step 4.5: both the stored invoice date and the incoming one are
     * checked. A closed year may not be edited, and that includes moving the
     * invoice OUT of it: the published result would stop matching its own
     * journals.
     */
    await fiscalPostingGuard.assertAccountingDatesOpen(
      connection,
      {
        orgId,
        dates: [oldSale.invoice_date, data.invoice_date],
        operation: 'sale.update',
      },
    );

    const oldItems =
      await saleRepository.findItemsBySale(
        connection,
        {
          orgId,
          saleId,
          includeDeleted: true,
        },
      );

    /*
     * When the caller does not send an invoice_status (e.g. the
     * edit modal only sends amounts/items), the sale keeps its
     * current status so a confirmed edit still refreshes the
     * posted journal amount.
     */
    const nextStatus =
      data.invoice_status ?? oldSale.invoice_status;

    const updatedSale =
      await saleRepository.update(
        connection,
        {
          orgId,
          localId: saleId,
          userId,
          data,
        },
      );

    /*
     * Account process: when a confirmed sale is reverted
     * to draft (SaleMakeDraftModal), the posted sale
     * journal is soft-deleted, payments/returns and their
     * journals are soft-deleted, and the deducted stock is
     * restored so the customer balance no longer counts the
     * phantom receivable.
     */
    if (
      isConfirmed(oldSale.invoice_status) &&
      data.invoice_status &&
      !isConfirmed(data.invoice_status)
    ) {
      for (const item of oldItems) {
        if (Number(item.status) === 0) {
          continue;
        }

        const stockQty = await toProductStockQuantity(
          connection,
          orgId,
          item,
        );

        /* Services are not inventory: no stock balance, no movement. */
        if (stockQty.isService) {
          continue;
        }

        await saleRepository.adjustProductQuantity(
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
            warehouseId: oldSale.warehouse_id,
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
              warehouse_id: oldSale.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: saleId,
              reference_type: 'sale',
              transaction_type: 'sale_revert',
              quantity: Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: Number(item.subtotal ?? 0),
              currency: item.currency || oldSale.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || oldSale.currency || null,
              date: oldSale.invoice_date || new Date(),
              description: `Sale #${saleId} reverted to draft, stock restored`,
              status: 1,
            },
          },
        );
      }

      await batchLedger.restoreSaleBatches(
        connection,
        {
          orgId,
          userId,
          saleId,
        },
      );

      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: saleId,
          referenceType: 'sale',
          userId,
        },
      );

      const payments =
        await saleRepository.findPaymentsBySale(
          connection,
          {
            orgId,
            saleId,
          },
        );

      /*
       * Step 4.5: each payment is its own accounting event, so its own date
       * is checked before it is reversed. This stops a closed-year payment
       * from being erased through an open-year sale edit.
       */
      await fiscalPostingGuard.assertAccountingDatesOpen(
        connection,
        {
          orgId,
          dates: payments.map(
            (payment) => payment.payment_date,
          ),
          operation: 'sale.update (payment reversal)',
        },
      );

      for (const payment of payments) {
        if (Number(payment.status) === 0) {
          continue;
        }

        await saleRepository.softDeletePayment(
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
            referenceType: 'sale_payment',
            userId,
          },
        );
      }

      const returns =
        await saleRepository.findReturnsBySale(
          connection,
          {
            orgId,
            saleId,
          },
        );

      /* Same rule for the returns this edit is about to reverse. */
      await fiscalPostingGuard.assertAccountingDatesOpen(
        connection,
        {
          orgId,
          dates: returns.map(
            (saleReturn) => saleReturn.return_date,
          ),
          operation: 'sale.update (return reversal)',
        },
      );

      for (const saleReturn of returns) {
        if (Number(saleReturn.status) === 0) {
          continue;
        }

        /*
         * Undo the return's own stock/batch restoration first, so the
         * sale's stock is restored to exactly the pre-sale level.
         */
        await revertSaleReturnStockOnConnection(
          connection,
          {
            orgId,
            userId,
            saleReturn,
          },
        );

        await saleRepository.softDeleteReturn(
          connection,
          {
            orgId,
            localId: saleReturn.id,
            userId,
          },
        );

        await saleRepository.softDeleteReturnItemsByReturn(
          connection,
          {
            orgId,
            returnId: saleReturn.id,
            userId,
          },
        );

        await journalRepository.softDeleteByReference(
          connection,
          {
            orgId,
            referenceId: saleReturn.id,
            referenceType: 'sale_return',
            userId,
          },
        );
      }
    }

    /*
     * Account process: when an edited sale is still
     * confirmed, refresh its posted journal total so the
     * customer balance stays in sync with the new amount.
     * When a draft is confirmed through an edit, post the
     * journal for the first time (mirrors createSale).
     */
    if (isConfirmed(nextStatus)) {
      const journalsResult =
        await journalRepository.findAll(
          connection,
          {
            orgId,
            referenceId: saleId,
            referenceType: 'sale',
          },
        );

      const journals = journalsResult.data;

      const activeJournal = journals.find(
        (journal) => Number(journal.status) === 1,
      );

      if (activeJournal) {
        /*
         * Only refresh journal totals when the caller explicitly
         * sent a numeric total_amount. Benefit/remaining-only
         * patches must not rewrite the sale journal.
         *
         * Also auto-heal journals that were previously wiped to 0
         * while the sale still has a positive total_amount.
         */
        const hasExplicitTotal =
          Object.prototype.hasOwnProperty.call(data, 'total_amount') &&
          data.total_amount !== null &&
          data.total_amount !== undefined &&
          Number.isFinite(Number(data.total_amount));

        const saleTotal = hasExplicitTotal
          ? Number(data.total_amount) || 0
          : Number(oldSale.total_amount) || 0;

        const journalDebit = Number(activeJournal.first_entry_debit) || 0;
        const needsHeal =
          journalDebit === 0 &&
          saleTotal > 0;

        if (hasExplicitTotal || needsHeal) {
          await journalRepository.update(
            connection,
            {
              orgId,
              localId: activeJournal.id,
              userId,
              data: {
                first_entry_debit: saleTotal,
                second_entry_credit: saleTotal,
                description:
                  `Updated journal from Sale #${saleId}`,
              },
            },
          );
        }
      } else if (!isConfirmed(oldSale.invoice_status)) {
        const receivableAccount =
          await saleRepository.findAccountByCode(
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

        const journalTotal =
          data.total_amount !== undefined && data.total_amount !== null
            ? Number(data.total_amount) || 0
            : Number(oldSale.total_amount) || 0;

        await createJournalEntry(
          connection,
          {
            orgId,
            userId,
            requestContext,
            data: {
              date: data.invoice_date || oldSale.invoice_date || null,
              reference_id: saleId,
              reference_type: 'sale',
              description:
                data.description ||
                oldSale.description ||
                `Sale Invoice #${data.invoice_number || oldSale.invoice_number || ''}`,
              currency: data.currency || oldSale.currency || null,
              first_entry_account: data.account_id || oldSale.account_id,
              first_entry_debit: journalTotal,
              first_entry_credit: 0,
              second_entry_account: receivableAccount.id,
              second_entry_debit: 0,
              second_entry_credit: journalTotal,
              status: 1,
            },
            description:
              `Created sale journal for sale ${saleId}`,
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
      await saleRepository.softDeleteItemsBySale(
        connection,
        {
          orgId,
          saleId,
          userId,
        },
      );

      const createdItems = [];

      for (const item of data.items) {
        const itemLocalId = generateLocalId();

        const createdItem =
          await saleRepository.createItem(
            connection,
            {
              orgId,
              localId: itemLocalId,
              userId,
              data: {
                ...item,
                sale_id: saleId,
              },
            },
          );

        createdItems.push(createdItem);
      }

      /*
       * Stock sync on item replacement:
       * - Confirmed -> confirmed edit: put the old deduction back,
       *   then deduct the new quantities below (e.g. qty 4 -> 5).
       * - Draft -> confirmed: deduct stock for the first time.
       * - Draft -> draft: no stock movement.
       */
      const oldActiveItems = oldItems.filter(
        (item) => Number(item.status) === 1,
      );

      if (
        isConfirmed(oldSale.invoice_status) &&
        isConfirmed(nextStatus)
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

          await saleRepository.adjustProductQuantity(
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
              warehouseId: oldSale.warehouse_id,
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
                warehouse_id: oldSale.warehouse_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                reference_id: saleId,
                reference_type: 'sale',
                transaction_type: 'sale_revert',
                quantity: Number(item.quantity || 0),
                unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
                total_cost: Number(item.subtotal ?? 0),
                currency: item.currency || oldSale.currency || null,
                peer_price: Number(item.unit_price ?? 0),
                peer_currency: item.currency || oldSale.currency || null,
                date: oldSale.invoice_date || new Date(),
                description: `Sale #${saleId} quantities updated, old stock restored`,
                status: 1,
              },
            },
          );
        }

        await batchLedger.restoreSaleBatches(
          connection,
          {
            orgId,
            userId,
            saleId,
          },
        );
      }

      if (isConfirmed(nextStatus)) {
        for (const item of data.items) {
          const stockQty = await toProductStockQuantity(
            connection,
            orgId,
            item,
          );

          /* Services are not inventory: no stock balance, no movement. */
          if (stockQty.isService) {
            continue;
          }

          await saleRepository.adjustProductQuantity(
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
              warehouseId: data.warehouse_id ?? oldSale.warehouse_id,
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
                warehouse_id: data.warehouse_id ?? oldSale.warehouse_id,
                product_id: item.product_id,
                product_unit_id: item.product_unit_id,
                reference_id: saleId,
                reference_type: 'sale',
                transaction_type: 'sale',
                quantity: -Number(item.quantity || 0),
                unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
                total_cost: -Number(item.subtotal ?? 0),
                currency: item.currency || data.currency || oldSale.currency || null,
                peer_price: Number(item.unit_price ?? 0),
                peer_currency: item.currency || data.currency || oldSale.currency || null,
                date: data.invoice_date || oldSale.invoice_date || new Date(),
                description: `Sale Invoice #${data.invoice_number || oldSale.invoice_number || ''}`,
                status: 1,
              },
            },
          );
        }

        const itemCosts = await batchLedger.consumeSaleBatches(
          connection,
          {
            orgId,
            userId,
            saleId,
            warehouseId: data.warehouse_id ?? oldSale.warehouse_id,
            date: data.invoice_date || oldSale.invoice_date,
            defaultCurrency: data.currency || oldSale.currency,
            items: data.items.map((item, index) => ({
              ...item,
              sale_item_id: createdItems[index]?.id || null,
            })),
          },
        );

        await persistSaleBatchCosts(
          connection,
          {
            orgId,
            userId,
            items: data.items,
            createdItems,
            itemCosts,
          },
        );
      }

      await activityRepository.create(
        connection,
        {
          orgId,
          userId,

          action: 'update',
          tableName: 'sales',
          entityId: saleId,

          oldValues: {
            ...oldSale,
            items: oldItems,
          },
          newValues: {
            ...updatedSale,
            items: createdItems,
          },

          description:
            `Updated sale ${updatedSale.invoice_number || `#${saleId}`}`,

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
          tableName: 'sales',
          entityId: saleId,

          oldValues: oldSale,
          newValues: updatedSale,

          description:
            `Updated sale ${updatedSale.invoice_number || `#${saleId}`}`,

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

    return updatedSale;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteSale({
  user,
  saleId,
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

    const oldSale =
      await saleRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: saleId,
          forUpdate: true,
        },
      );

    if (!oldSale) {
      throw new AppError(
        'Sale not found.',
        404,
        'SALE_NOT_FOUND',
      );
    }

    if (Number(oldSale.status) === 0) {
      throw new AppError(
        'Sale is already deleted.',
        409,
        'SALE_ALREADY_DELETED',
      );
    }

    /*
     * Step 4.5: deleting a closed-year invoice would erase that year's
     * revenue and stock movement. The ORIGINAL invoice date decides, never
     * today's date, so a closed year cannot be emptied from the outside.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: oldSale.invoice_date,
        operation: 'sale.delete',
      },
    );

    const oldItems =
      await saleRepository.findItemsBySale(
        connection,
        {
          orgId,
          saleId,
          includeDeleted: true,
        },
      );

    /*
     * Revert stock that a confirmed sale deducted.
     */
    if (isConfirmed(oldSale.invoice_status)) {
      for (const item of oldItems) {
        if (Number(item.status) === 0) {
          continue;
        }

        const stockQty = await toProductStockQuantity(
          connection,
          orgId,
          item,
        );

        /* Services are not inventory: no stock balance, no movement. */
        if (stockQty.isService) {
          continue;
        }

        await saleRepository.adjustProductQuantity(
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
            warehouseId: oldSale.warehouse_id,
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
              warehouse_id: oldSale.warehouse_id,
              product_id: item.product_id,
              product_unit_id: item.product_unit_id,
              reference_id: saleId,
              reference_type: 'sale',
              transaction_type: 'sale_revert',
              quantity: Number(item.quantity || 0),
              unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
              total_cost: Number(item.subtotal ?? 0),
              currency: item.currency || oldSale.currency || null,
              peer_price: Number(item.unit_price ?? 0),
              peer_currency: item.currency || oldSale.currency || null,
              date: oldSale.invoice_date || new Date(),
              description: `Deleted sale #${saleId}, stock restored`,
              status: 1,
            },
          },
        );
      }
    }

    await batchLedger.restoreSaleBatches(
      connection,
      {
        orgId,
        userId,
        saleId,
      },
    );

    const deletedSale =
      await saleRepository.softDelete(
        connection,
        {
          orgId,
          localId: saleId,
          userId,
        },
      );

    await saleRepository.softDeleteItemsBySale(
      connection,
      {
        orgId,
        saleId,
        userId,
      },
    );

    /*
     * Account process: soft-delete the sale journal so
     * the customer balance reverts.
     */
    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: saleId,
        referenceType: 'sale',
        userId,
      },
    );

    const payments =
      await saleRepository.findPaymentsBySale(
        connection,
        {
          orgId,
          saleId,
          includeDeleted: true,
        },
      );

    /*
     * Step 4.5: deleting a sale reverses its payments, and a payment dated in
     * a closed year must not be erased as a side effect.
     */
    await fiscalPostingGuard.assertAccountingDatesOpen(
      connection,
      {
        orgId,
        dates: payments.map(
          (payment) => payment.payment_date,
        ),
        operation: 'sale.delete (payment reversal)',
      },
    );

    for (const payment of payments) {
      if (Number(payment.status) === 1) {
        await saleRepository.softDeletePayment(
          connection,
          {
            orgId,
            localId: payment.id,
            userId,
          },
        );

        /*
         * Account process: soft-delete the payment journals
         * so the customer/treasury balances revert.
         */
        await journalRepository.softDeleteByReference(
          connection,
          {
            orgId,
            referenceId: payment.id,
            referenceType: 'sale_payment',
            userId,
          },
        );
      }
    }

    const returns =
      await saleRepository.findReturnsBySale(
        connection,
        {
          orgId,
          saleId,
          includeDeleted: true,
        },
      );

    /* And its returns, for the same reason. */
    await fiscalPostingGuard.assertAccountingDatesOpen(
      connection,
      {
        orgId,
        dates: returns.map(
          (saleReturn) => saleReturn.return_date,
        ),
        operation: 'sale.delete (return reversal)',
      },
    );

    for (const saleReturn of returns) {
      if (Number(saleReturn.status) === 0) {
        continue;
      }

      /*
       * Undo the return's own stock/batch restoration first, so deleting
       * the sale restores exactly the pre-sale stock level.
       */
      await revertSaleReturnStockOnConnection(
        connection,
        {
          orgId,
          userId,
          saleReturn,
        },
      );

      await saleRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: saleReturn.id,
          userId,
        },
      );

      await saleRepository.softDeleteReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId: saleReturn.id,
          userId,
        },
      );

      /*
       * Account process: soft-delete the return journal so
       * the customer/RECEIVABLE balances revert.
       */
      await journalRepository.softDeleteByReference(
        connection,
        {
          orgId,
          referenceId: saleReturn.id,
          referenceType: 'sale_return',
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
        tableName: 'sales',
        entityId: deletedSale.id,

        oldValues: {
          ...oldSale,
          items: oldItems,
        },
        newValues: deletedSale,

        description:
          `Deleted sale ${oldSale.invoice_number || `#${saleId}`}`,

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

    return deletedSale;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/*
 * Delegates to the single authoritative payment posting service so the
 * sale screen, the sale's inline "Confirm Sale" payment, the journal
 * screen, and the generic sale-payment endpoint all share one algorithm.
 */
async function createSalePaymentOnConnection(
  connection,
  {
    orgId,
    userId,
    requestContext,
    sale,
    saleId,
    data,
  },
) {
  return paymentPosting.postSalePaymentOnConnection(
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
}

async function createPayment({
  user,
  saleId,
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

    const payment = await createSalePaymentOnConnection(
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
      await saleRepository.findPaymentByLocalId(
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
     * sale's remaining through the single authoritative payment service.
     */
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
          `Deleted payment for sale #${oldPayment.sale_id}`,

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
  saleId,
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

    /*
     * A return is its own accounting event: only the return's own date is
     * checked here. Returning goods in an open year against an invoice from
     * a closed year is legitimate business and stays allowed.
     */
    await fiscalPostingGuard.assertAccountingDateOpen(
      connection,
      {
        orgId,
        date: data.return_date,
        operation: 'sale_return.create',
      },
    );

    const returnLocalId = generateLocalId();

    const saleReturn =
      await saleRepository.createReturn(
        connection,
        {
          orgId,
          localId: returnLocalId,
          userId,
          data: {
            ...data,
            sale_id: saleId,
          },
        },
      );

    const createdItems = [];

    for (const item of data.items || []) {
      const itemLocalId = generateLocalId();

      const createdItem =
        await saleRepository.createReturnItem(
          connection,
          {
            orgId,
            localId: itemLocalId,
            userId,
            data: {
              ...item,
              sale_return_id: returnLocalId,
            },
          },
        );

      createdItems.push(createdItem);

      /*
       * A sale return restores the returned quantity to
       * stock.
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

      await saleRepository.adjustProductQuantity(
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
          warehouseId: data.warehouse_id ?? sale.warehouse_id,
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
            warehouse_id: data.warehouse_id ?? sale.warehouse_id,
            product_id: item.product_id,
            product_unit_id: item.product_unit_id,
            reference_id: returnLocalId,
            reference_type: 'sale_return',
            transaction_type: 'sale_return',
            quantity: Number(item.quantity || 0),
            unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
            total_cost: Number(item.subtotal ?? 0),
            currency: item.currency || sale.currency || null,
            peer_price: Number(item.unit_price ?? 0),
            peer_currency: item.currency || sale.currency || null,
            date: new Date(),
            description: `Sale Return for Sale #${sale.invoice_number || ''}`,
            status: 1,
          },
        },
      );
    }

    await batchLedger.saleReturnBatches(
      connection,
      {
        orgId,
        userId,
        saleId,
        returnId: returnLocalId,
        warehouseId: data.warehouse_id ?? sale.warehouse_id,
        items: data.items,
      },
    );

    /*
     * Account process: a sale return posts a double entry
     * (customer credit, RECEIVABLE debit) inside the
     * transaction.
     */
    const receivableAccount =
      await saleRepository.findAccountByCode(
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
          /*
           * The return carries its own accounting date. The previous value
           * was the UTC calendar day at posting time, which files a return
           * into the wrong day (and potentially the wrong fiscal year) for
           * part of every day in a non-UTC timezone.
           */
          date: accountingDate(saleReturn.return_date),
          reference_id: returnLocalId,
          reference_type: 'sale_return',
          description:
            `Sale Return Transaction for Sale #${sale.invoice_number || ''}`,
          currency: saleReturn.currency || null,
          first_entry_account: sale.account_id,
          first_entry_debit: 0,
          first_entry_credit: Number(saleReturn.total_amount || 0),
          second_entry_account: receivableAccount.id,
          second_entry_debit: Number(saleReturn.total_amount || 0),
          second_entry_credit: 0,
          status: 1,
        },
        description:
          `Created sale return journal for return ${saleReturn.id}`,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'sale_returns',
        entityId: saleReturn.id,

        oldValues: null,
        newValues: {
          ...saleReturn,
          items: createdItems,
        },

        description:
          `Created sale return ${saleReturn.return_number || `#${saleReturn.id}`}`,

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
      ...saleReturn,
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
 * Reverses the inventory effect of a single sale return: deducts the
 * returned quantity from product + warehouse stock, records the
 * compensating movement, and re-consumes exactly the batch layers the
 * return had restored. Shared by return deletion and by sale
 * revert/delete so a sale that has returns never over-restores stock.
 */
async function revertSaleReturnStockOnConnection(
  connection,
  {
    orgId,
    userId,
    saleReturn,
  },
) {
  const returnItems =
    await saleRepository.findReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId: saleReturn.id,
        includeDeleted: true,
      },
    );

  for (const item of returnItems) {
    if (Number(item.status) === 0) {
      continue;
    }

    const stockQty = await toProductStockQuantity(
      connection,
      orgId,
      item,
    );

    /* Services are not inventory: no stock balance, no movement. */
    if (stockQty.isService) {
      continue;
    }

    await saleRepository.adjustProductQuantity(
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
        warehouseId: saleReturn.warehouse_id,
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
          warehouse_id: saleReturn.warehouse_id,
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          reference_id: saleReturn.id,
          reference_type: 'sale_return',
          transaction_type: 'sale_return_revert',
          quantity: -Number(item.quantity || 0),
          unit_cost: Number(item.buy_price ?? item.unit_price ?? 0),
          total_cost: -Number(item.subtotal ?? 0),
          currency: item.currency || null,
          peer_price: Number(item.unit_price ?? 0),
          peer_currency: item.currency || null,
          date: new Date(),
          description: `Reversed sale return #${saleReturn.id}, stock deducted`,
          status: 1,
        },
      },
    );
  }

  await batchLedger.revertSaleReturnBatches(
    connection,
    {
      orgId,
      userId,
      returnId: saleReturn.id,
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
      await saleRepository.findReturnByLocalId(
        connection,
        {
          orgId,
          localId: returnId,
          forUpdate: true,
        },
      );

    if (!oldReturn) {
      throw new AppError(
        'Sale return not found.',
        404,
        'SALE_RETURN_NOT_FOUND',
      );
    }

    if (Number(oldReturn.status) === 0) {
      throw new AppError(
        'Sale return is already deleted.',
        409,
        'SALE_RETURN_ALREADY_DELETED',
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
        operation: 'sale_return.delete',
      },
    );

    const oldItems =
      await saleRepository.findReturnItemsByReturn(
        connection,
        {
          orgId,
          returnId,
          includeDeleted: true,
        },
      );

    await revertSaleReturnStockOnConnection(
      connection,
      {
        orgId,
        userId,
        saleReturn: oldReturn,
      },
    );

    const deletedReturn =
      await saleRepository.softDeleteReturn(
        connection,
        {
          orgId,
          localId: returnId,
          userId,
        },
      );

    await saleRepository.softDeleteReturnItemsByReturn(
      connection,
      {
        orgId,
        returnId,
        userId,
      },
    );

    /*
     * Account process: soft-delete the return journal so
     * the customer/RECEIVABLE balances revert.
     */
    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: returnId,
        referenceType: 'sale_return',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'sale_returns',
        entityId: deletedReturn.id,

        oldValues: {
          ...oldReturn,
          items: oldItems,
        },
        newValues: deletedReturn,

        description:
          `Deleted sale return ${oldReturn.return_number || `#${returnId}`}`,

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
  listSales,
  getSale,
  createSale,
  updateSale,
  deleteSale,
  createPayment,
  deletePayment,
  createReturn,
  deleteReturn,
  /* Exported for the Step 2.7 inventory-costing regression tests. */
  persistSaleBatchCosts,
};
