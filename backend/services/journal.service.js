const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const journalRepository =
  require('../repositories/journal.repository');

const salePaymentRepository =
  require('../repositories/sale-payment.repository');

const purchasePaymentRepository =
  require('../repositories/purchase-payment.repository');

const saleRepository =
  require('../repositories/sale.repository');

const purchaseRepository =
  require('../repositories/purchase.repository');

const activityRepository =
  require('../repositories/activity.repository');

const {
  generateLocalId,
} = require('../utils/generateLocalId');

const {
  resolvePagination,
} = require('../utils/pagination');

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

function isConfirmedBill(billStatus) {
  return String(billStatus || '') === 'confirmed';
}

function isBillReference(referenceType) {
  return referenceType === 'sale' || referenceType === 'purchase';
}

/*
 * Journals entered against a bill (reference_type 'sale' / 'purchase')
 * mark that bill as paid. The payment amount and direction follow the
 * journal's entries:
 *
 * - Sale bill (customer paid us): the customer is credited on the first
 *   entry, so the payment amount is positive (Receive).
 * - Purchase bill (we paid the supplier): the supplier is debited on the
 *   first entry, so the payment amount is positive (Payment).
 *
 * A reverse entry (first_entry_debit on a sale bill, first_entry_credit
 * on a purchase bill) produces a negative amount, mirroring the refund
 * conventions used by the sale/purchase payment forms.
 */
function billPaymentAmount(journal) {
  if (journal.reference_type === 'sale') {
    return (
      Number(journal.first_entry_credit || 0) -
      Number(journal.first_entry_debit || 0)
    );
  }

  if (journal.reference_type === 'purchase') {
    return (
      Number(journal.first_entry_debit || 0) -
      Number(journal.first_entry_credit || 0)
    );
  }

  return 0;
}

function journalPaymentTag(journalId) {
  return `journal:${journalId}`;
}

function billDisplayNumber(bill, isSale) {
  return isSale
    ? bill.invoice_number || bill.bill_number || `#${bill.id}`
    : bill.bill_number || bill.invoice_number || `#${bill.id}`;
}

async function findJournalBillPayment(
  executor,
  {
    orgId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type)) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';
  const repo = isSale ? saleRepository : purchaseRepository;

  const payments = isSale
    ? await repo.findPaymentsBySale(
        executor,
        {
          orgId,
          saleId: journal.reference_id,
          includeDeleted: true,
        },
      )
    : await repo.findPaymentsByPurchase(
        executor,
        {
          orgId,
          purchaseId: journal.reference_id,
          includeDeleted: true,
        },
      );

  const tag = journalPaymentTag(journal.id);
  const matches = payments.filter((payment) =>
    (payment.description || '').includes(tag),
  );

  /*
   * Prefer the active payment — after an edit the journal can have a
   * soft-deleted payment and a fresh one carrying the same tag.
   */
  return (
    matches.find((payment) => Number(payment.status) === 1) ||
    matches[0] ||
    null
  );
}

/*
 * Keeps the bill's stored remaining column in sync after a journal
 * payment is created or removed, so the sales/purchases list shows
 * the paid state immediately. Uses the same formula as the frontend
 * recalc (total - payments - returns).
 */
async function recomputeBillRemaining(
  connection,
  {
    orgId,
    userId,
    bill,
    isSale,
  },
) {
  const repo = isSale ? saleRepository : purchaseRepository;

  const [payments, returns] = isSale
    ? await Promise.all([
        repo.findPaymentsBySale(
          connection,
          {
            orgId,
            saleId: bill.id,
            includeDeleted: true,
          },
        ),
        repo.findReturnsBySale(
          connection,
          {
            orgId,
            saleId: bill.id,
            includeDeleted: true,
          },
        ),
      ])
    : await Promise.all([
        repo.findPaymentsByPurchase(
          connection,
          {
            orgId,
            purchaseId: bill.id,
            includeDeleted: true,
          },
        ),
        repo.findReturnsByPurchase(
          connection,
          {
            orgId,
            purchaseId: bill.id,
            includeDeleted: true,
          },
        ),
      ]);

  const totalPayments = payments
    .filter((payment) => Number(payment.status) === 1)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const totalReturns = returns
    .filter((saleReturn) => Number(saleReturn.status) === 1)
    .reduce(
      (sum, saleReturn) => sum + Number(saleReturn.total_amount || 0),
      0,
    );

  const remaining =
    Number(bill.total_amount || 0) - totalPayments - totalReturns;

  await repo.update(
    connection,
    {
      orgId,
      localId: bill.id,
      userId,
      data: { remaining },
    },
  );
}

/*
 * Creates the sale_payment / purchase_payment row that marks a bill as
 * paid when a journal is saved against it. The payment description
 * carries a journal: tag so later updates/deletes of the journal can
 * find and keep that payment in sync.
 */
async function createBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type)) {
    return null;
  }

  const amount = billPaymentAmount(journal);
  if (!amount || !journal.reference_id) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';
  const repo = isSale ? saleRepository : purchaseRepository;

  const bill = await repo.findByLocalId(
    connection,
    {
      orgId,
      localId: journal.reference_id,
    },
  );

  if (!bill || Number(bill.status) === 0) {
    return null;
  }

  const confirmed = isSale
    ? isConfirmedBill(bill.invoice_status)
    : isConfirmedBill(bill.bill_status);

  if (!confirmed) {
    return null;
  }

  const paymentLocalId = generateLocalId();

  const payment = await repo.createPayment(
    connection,
    {
      orgId,
      localId: paymentLocalId,
      userId,
      data: {
        ...(isSale
          ? { sale_id: bill.id }
          : { purchase_id: bill.id }),
        account_id:
          journal.second_entry_account || journal.first_entry_account,
        amount,
        currency: journal.currency || bill.currency || null,
        payment_date: journal.date || new Date().toISOString(),
        description:
          `Payment via ${journalPaymentTag(journal.id)} for ${isSale ? 'Sale' : 'Purchase'} #${billDisplayNumber(bill, isSale)}`,
        status: 1,
      },
    },
  );

  await recomputeBillRemaining(
    connection,
    {
      orgId,
      userId,
      bill,
      isSale,
    },
  );

  return payment;
}

/*
 * Removes the payment a journal previously created against a bill
 * (journal update that dropped the reference, or journal delete), and
 * refreshes the bill's remaining.
 */
async function removeBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type) || !journal.reference_id) {
    return null;
  }

  const isSale = journal.reference_type === 'sale';
  const repo = isSale ? saleRepository : purchaseRepository;

  const bill = await repo.findByLocalId(
    connection,
    {
      orgId,
      localId: journal.reference_id,
    },
  );

  if (!bill) {
    return null;
  }

  const existing = await findJournalBillPayment(
    connection,
    {
      orgId,
      journal,
    },
  );

  if (existing) {
    await repo.softDeletePayment(
      connection,
      {
        orgId,
        localId: existing.id,
        userId,
      },
    );

    await recomputeBillRemaining(
      connection,
      {
        orgId,
        userId,
        bill,
        isSale,
      },
    );
  }

  return existing;
}

/*
 * Keeps a journal's bill payment in sync after the journal is edited:
 * recreates the payment with the new amount/date, or removes it when
 * the reference was dropped or the payment direction is gone.
 */
async function syncBillPayment(
  connection,
  {
    orgId,
    userId,
    journal,
  },
) {
  if (!isBillReference(journal.reference_type) || !journal.reference_id) {
    return null;
  }

  await removeBillPayment(
    connection,
    {
      orgId,
      userId,
      journal,
    },
  );

  return createBillPayment(
    connection,
    {
      orgId,
      userId,
      journal,
    },
  );
}

async function listJournals({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const listParams = {
    orgId,
    status: filters.status,
    search: filters.search,
    referenceId: filters.reference_id,
    referenceType: filters.reference_type,
    dateFrom: filters.date_from,
    dateTo: filters.date_to,
    accountId: filters.account_id,
    excludeSystemAccounts:
      Number(filters.exclude_system_accounts) === 1,
    excludeReportAccounts:
      Number(filters.exclude_report_accounts) === 1,
    skipCount: Number(filters.skip_count) === 1,
    pagination,
  };

  const includeSummary = Number(filters.include_summary) === 1;

  const [result, summary] = await Promise.all([
    journalRepository.findAll(db, listParams),
    includeSummary
      ? journalRepository.findSummary(db, listParams)
      : Promise.resolve(null),
  ]);

  if (summary) {
    result.summary = summary;
  }

  /*
   * For paginated lists, attach the parent sale/purchase id to
   * sale_payment / purchase_payment rows so the frontend can build
   * reference links without downloading the entire payments tables.
   */
  if (result.data.length) {
    const salePaymentIds = result.data
      .filter((j) => j.reference_type === 'sale_payment')
      .map((j) => j.reference_id)
      .filter((id) => id != null);

    const purchasePaymentIds = result.data
      .filter((j) => j.reference_type === 'purchase_payment')
      .map((j) => j.reference_id)
      .filter((id) => id != null);

    const [salePayments, purchasePayments] = await Promise.all([
      salePaymentRepository.findByIds(db, {
        orgId,
        ids: salePaymentIds,
      }),
      purchasePaymentRepository.findByIds(db, {
        orgId,
        ids: purchasePaymentIds,
      }),
    ]);

    const saleMap = new Map(
      salePayments.map((payment) => [
        String(payment.id),
        payment.sale_id,
      ]),
    );

    const purchaseMap = new Map(
      purchasePayments.map((payment) => [
        String(payment.id),
        payment.purchase_id,
      ]),
    );

    result.data = result.data.map((journal) => ({
      ...journal,
      reference_sale_id:
        journal.reference_type === 'sale_payment'
          ? saleMap.get(String(journal.reference_id)) ?? null
          : undefined,
      reference_purchase_id:
        journal.reference_type === 'purchase_payment'
          ? purchaseMap.get(String(journal.reference_id)) ?? null
          : undefined,
    }));
  }

  return result;
}

async function getJournal({
  user,
  journalId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const journal =
    await journalRepository.findByLocalId(
      db,
      {
        orgId,
        localId: journalId,
      },
    );

  if (!journal) {
    throw new AppError(
      'Journal entry not found.',
      404,
      'JOURNAL_NOT_FOUND',
    );
  }

  return journal;
}

async function createJournal({
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
          `Created journal entry ${journal.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    /*
     * A journal entered against a sale/purchase bill marks the bill as
     * paid: create the matching payment row in the same transaction.
     */
    await createBillPayment(
      connection,
      {
        orgId,
        userId,
        journal,
      },
    );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return journal;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateJournal({
  user,
  journalId,
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

    const oldJournal =
      await journalRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: journalId,
          forUpdate: true,
        },
      );

    if (!oldJournal) {
      throw new AppError(
        'Journal entry not found.',
        404,
        'JOURNAL_NOT_FOUND',
      );
    }

    const updatedJournal =
      await journalRepository.update(
        connection,
        {
          orgId,
          localId: journalId,
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
        tableName: 'journals',
        entityId: updatedJournal.id,

        oldValues: oldJournal,
        newValues: updatedJournal,

        description:
          `Updated journal entry ${updatedJournal.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    /*
     * Keep the bill payment in sync: if the journal still references a
     * bill the payment is recreated with the new amount/date, otherwise
     * the previously created payment is removed so the bill reverts to
     * unpaid. When the reference was dropped or moved to a different
     * bill, the old bill's payment is removed too.
     */
    const referenceChanged =
      oldJournal.reference_type !== updatedJournal.reference_type ||
      Number(oldJournal.reference_id) !== Number(updatedJournal.reference_id);

    if (referenceChanged && isBillReference(oldJournal.reference_type)) {
      await removeBillPayment(
        connection,
        {
          orgId,
          userId,
          journal: oldJournal,
        },
      );
    }

    await syncBillPayment(
      connection,
      {
        orgId,
        userId,
        journal: updatedJournal,
      },
    );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return updatedJournal;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteJournal({
  user,
  journalId,
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

    const oldJournal =
      await journalRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: journalId,
          forUpdate: true,
        },
      );

    if (!oldJournal) {
      throw new AppError(
        'Journal entry not found.',
        404,
        'JOURNAL_NOT_FOUND',
      );
    }

    if (Number(oldJournal.status) === 0) {
      throw new AppError(
        'Journal entry is already deleted.',
        409,
        'JOURNAL_ALREADY_DELETED',
      );
    }

    const deletedJournal =
      await journalRepository.softDelete(
        connection,
        {
          orgId,
          localId: journalId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'journals',
        entityId: deletedJournal.id,

        oldValues: oldJournal,
        newValues: deletedJournal,

        description:
          `Deleted journal entry ${oldJournal.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    /*
     * Deleting a journal that paid a bill reverts the bill to unpaid:
     * remove the payment the journal created.
     */
    await removeBillPayment(
      connection,
      {
        orgId,
        userId,
        journal: oldJournal,
      },
    );

    await connection.commit();

    accountService.invalidateAccountAggregates(orgId);

    return deletedJournal;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listJournals,
  getJournal,
  createJournal,
  updateJournal,
  deleteJournal,
};
