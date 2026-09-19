const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const journalRepository =
  require('../repositories/journal.repository');

const salePaymentRepository =
  require('../repositories/sale-payment.repository');

const purchasePaymentRepository =
  require('../repositories/purchase-payment.repository');

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

const paymentPosting =
  require('./payment-posting.service');

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

/*
 * Journal-driven bill payments (a journal with reference_type 'sale' /
 * 'purchase') are handled entirely by the authoritative
 * payment-posting service, so there is exactly one remaining formula
 * and one payment-row path in the codebase. The journal itself remains
 * the accounting entry for this flow; payment-posting only creates the
 * matching payment row and refreshes the bill's remaining.
 */

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
    await paymentPosting.recordJournalBillPayment(
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

    if (
      referenceChanged &&
      (oldJournal.reference_type === 'sale' ||
        oldJournal.reference_type === 'purchase')
    ) {
      await paymentPosting.removeJournalBillPayment(
        connection,
        {
          orgId,
          userId,
          journal: oldJournal,
        },
      );
    }

    await paymentPosting.syncJournalBillPayment(
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
    await paymentPosting.removeJournalBillPayment(
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
