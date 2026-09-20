const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const exchangeRepository =
  require('../repositories/exchange.repository');

const journalRepository =
  require('../repositories/journal.repository');

const accountRepository =
  require('../repositories/account.repository');

const salePaymentRepository =
  require('../repositories/sale-payment.repository');

const purchasePaymentRepository =
  require('../repositories/purchase-payment.repository');

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

async function listExchanges({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const result = await exchangeRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      referenceType: filters.reference_type,
      accountId: filters.account_id,
      excludeSystemAccounts:
        Number(filters.exclude_system_accounts) === 1,
      skipCount: Number(filters.skip_count) === 1,
      pagination,
    },
  );

  if (result.data.length) {
    const salePaymentIds = result.data
      .filter((row) => row.reference_type === 'sale_payment')
      .map((row) => row.reference_id)
      .filter((id) => id != null);

    const purchasePaymentIds = result.data
      .filter((row) => row.reference_type === 'purchase_payment')
      .map((row) => row.reference_id)
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

    result.data = result.data.map((exchange) => ({
      ...exchange,
      reference_sale_id:
        exchange.reference_type === 'sale_payment'
          ? saleMap.get(String(exchange.reference_id)) ?? null
          : undefined,
      reference_purchase_id:
        exchange.reference_type === 'purchase_payment'
          ? purchaseMap.get(String(exchange.reference_id)) ?? null
          : undefined,
    }));
  }

  return result;
}

async function getExchange({
  user,
  exchangeId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const exchange =
    await exchangeRepository.findByLocalId(
      db,
      {
        orgId,
        localId: exchangeId,
      },
    );

  if (!exchange) {
    throw new AppError(
      'Exchange entry not found.',
      404,
      'EXCHANGE_NOT_FOUND',
    );
  }

  return exchange;
}

/*
 * Mirrors the journal rows the frontend used to write to Dexie when
 * saving an exchange: one journal per currency side plus an optional
 * benefit journal, all referencing the exchange by
 * reference_type = 'exchange'.
 */
async function createExchangeJournals(
  connection,
  {
    orgId,
    userId,
    requestContext,
    data,
    exchangeId,
  },
) {
  /*
   * Step 4.5: all exchange journals (first, second and benefit) carry
   * `data.date`, so one guard covers the create and the reverse/repost paths
   * that share this helper. A closed year therefore cannot be changed by an
   * exchange, and an exchange cannot be moved into one.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: data.date,
      operation: 'exchange.journal',
    },
  );

  let exchangeAccount =
    await accountRepository.findByCode(
      connection,
      {
        orgId,
        code: 'EXCHANGE',
      },
    );

  if (!exchangeAccount) {
    exchangeAccount =
      await accountRepository.create(
        connection,
        {
          orgId,
          localId: generateLocalId(),
          userId,
          data: {
            account_type_id: 1,
            code: 'EXCHANGE',
            name: 'Currency Exchange',
            main_acc: 'true',
            name_fa: 'تبادله ارز',
            name_ps: 'تبادله ارز',
            balance: 0,
            currency: 'AFN',
            description: '',
            phone: '',
            phone2: '',
            email: '',
            address: '',
            status: 1,
          },
        },
      );
  }

  const createdJournals = [];

  if (exchangeAccount) {
    const firstJournal =
      await journalRepository.create(
        connection,
        {
          orgId,
          localId: generateLocalId(),
          userId,
          data: {
            date: data.date,
            description:
              data.description ||
              `First Journal for exchange #${exchangeId}`,
            reference_id: exchangeId,
            reference_type: 'exchange',
            currency: data.first_currency,
            first_entry_account: data.first_entry_account,
            first_entry_debit: data.first_entry_debit || 0,
            first_entry_credit: 0,
            second_entry_account: exchangeAccount.id,
            second_entry_debit: 0,
            second_entry_credit: data.first_entry_debit || 0,
            status: data.status ?? 1,
          },
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'journals',
        entityId: firstJournal.id,

        oldValues: null,
        newValues: firstJournal,

        description:
          `Created exchange journal ${firstJournal.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    createdJournals.push(firstJournal);

    const secondJournal =
      await journalRepository.create(
        connection,
        {
          orgId,
          localId: generateLocalId(),
          userId,
          data: {
            date: data.date,
            description:
              data.description ||
              `Second Journal for exchange #${exchangeId}`,
            reference_id: exchangeId,
            reference_type: 'exchange',
            currency: data.second_currency,
            first_entry_account: data.second_entry_account,
            first_entry_debit: 0,
            first_entry_credit: data.second_entry_credit || 0,
            second_entry_account: exchangeAccount.id,
            second_entry_debit: data.second_entry_credit || 0,
            second_entry_credit: 0,
            status: data.status ?? 1,
          },
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'journals',
        entityId: secondJournal.id,

        oldValues: null,
        newValues: secondJournal,

        description:
          `Created exchange journal ${secondJournal.id}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    createdJournals.push(secondJournal);

    const benefitAmount =
      Number(data.benefit_amount || 0);

    if (benefitAmount !== 0) {
      const benefitAccount =
        await accountRepository.findByCode(
          connection,
          {
            orgId,
            code: 'BENEFITS',
          },
        );

      if (benefitAccount) {
        const benefitJournal =
          await journalRepository.create(
            connection,
            {
              orgId,
              localId: generateLocalId(),
              userId,
              data: {
                date: data.date,
                description:
                  data.description ||
                  `Benefit Journal for exchange #${exchangeId}`,
                reference_id: exchangeId,
                reference_type: 'exchange',
                currency: data.first_currency,
                first_entry_account: benefitAccount.id,
                first_entry_debit:
                  benefitAmount < 0
                    ? Math.abs(benefitAmount)
                    : 0,
                first_entry_credit:
                  benefitAmount > 0
                    ? Math.abs(benefitAmount)
                    : 0,
                second_entry_account: exchangeAccount.id,
                second_entry_debit:
                  benefitAmount > 0
                    ? Math.abs(benefitAmount)
                    : 0,
                second_entry_credit:
                  benefitAmount < 0
                    ? Math.abs(benefitAmount)
                    : 0,
                status: data.status ?? 1,
              },
            },
          );

        await activityRepository.create(
          connection,
          {
            orgId,
            userId,

            action: 'create',
            tableName: 'journals',
            entityId: benefitJournal.id,

            oldValues: null,
            newValues: benefitJournal,

            description:
              `Created exchange benefit journal ${benefitJournal.id}`,

            ipAddress:
              requestContext.ipAddress,

            sessionId:
              requestContext.sessionId,

            deviceInfo:
              requestContext.deviceInfo,
          },
        );

        createdJournals.push(benefitJournal);
      }
    }
  }

  return createdJournals;
}

async function createExchange({
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

    const exchange =
      await exchangeRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data,
        },
      );

    await createExchangeJournals(
      connection,
      {
        orgId,
        userId,
        requestContext,
        data,
        exchangeId: exchange.id,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'exchanges',
        entityId: exchange.id,

        oldValues: null,
        newValues: exchange,

        description:
          `Created exchange entry ${exchange.id}`,

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

    return exchange;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateExchange({
  user,
  exchangeId,
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

    const oldExchange =
      await exchangeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: exchangeId,
          forUpdate: true,
        },
      );

    if (!oldExchange) {
      throw new AppError(
        'Exchange entry not found.',
        404,
        'EXCHANGE_NOT_FOUND',
      );
    }

    const updatedExchange =
      await exchangeRepository.update(
        connection,
        {
          orgId,
          localId: exchangeId,
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
        tableName: 'exchanges',
        entityId: updatedExchange.id,

        oldValues: oldExchange,
        newValues: updatedExchange,

        description:
          `Updated exchange entry ${updatedExchange.id}`,

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

    return updatedExchange;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteExchange({
  user,
  exchangeId,
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

    const oldExchange =
      await exchangeRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: exchangeId,
          forUpdate: true,
        },
      );

    if (!oldExchange) {
      throw new AppError(
        'Exchange entry not found.',
        404,
        'EXCHANGE_NOT_FOUND',
      );
    }

    if (Number(oldExchange.status) === 0) {
      throw new AppError(
        'Exchange entry is already deleted.',
        409,
        'EXCHANGE_ALREADY_DELETED',
      );
    }

    const deletedExchange =
      await exchangeRepository.softDelete(
        connection,
        {
          orgId,
          localId: exchangeId,
          userId,
        },
      );

    await journalRepository.softDeleteByReference(
      connection,
      {
        orgId,
        referenceId: exchangeId,
        referenceType: 'exchange',
        userId,
      },
    );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'exchanges',
        entityId: deletedExchange.id,

        oldValues: oldExchange,
        newValues: deletedExchange,

        description:
          `Deleted exchange entry ${oldExchange.id}`,

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

    return deletedExchange;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listExchanges,
  getExchange,
  createExchange,
  updateExchange,
  deleteExchange,
};
