const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const accountRepository =
  require('../repositories/account.repository');

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

const ttlCache =
  require('../utils/ttlCache');

const {
  accountingDate,
} = require('../utils/accountingDate');

const fiscalPostingGuard =
  require('./fiscal-posting-guard.service');

const accountTypeRepository =
  require('../repositories/account-type.repository');

const accountGroupRepository =
  require('../repositories/account-group.repository');

const accountProductItemRepository =
  require('../repositories/account-product-item.repository');

const {
  isSystemAccountCode,
} = require('../constants/systemAccounts');

const BALANCE_CACHE_TTL_MS = 45000;

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

async function listAccounts({
  user,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const pagination = resolvePagination(filters);

  const excludeCodes = filters.exclude_system
    ? [
        'NOTRACK',
        'RECEIVABLE',
        'PAYABLE',
        'SALES',
        'PURCHASE',
        'EXCHANGE',
      ]
    : [];

  return accountRepository.findAll(
    db,
    {
      orgId,
      status: filters.status,
      search: filters.search,
      code: filters.code,
      accountTypeId: filters.account_type_id,
      role: filters.role,
      accountGroupId: filters.account_group_id,
      patientTypeId: filters.patient_type_id,
      accountStatus: filters.account_status,
      excludeCodes,
      pagination,
      ids: String(filters.ids || '')
        .split(',')
        .map((part) => Number(String(part).trim()))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    },
  );
}

async function listAccountBalances({
  user,
  filters = {},
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const status = filters.status ?? 1;
  const accountIds = filters.accountIds ?? filters.account_ids ?? null;
  const idsKey = Array.isArray(accountIds) && accountIds.length
    ? accountIds.slice().sort((a, b) => a - b).join(',')
    : 'all';
  const cacheKey = ttlCache.makeKey([
    'balances',
    orgId,
    status,
    idsKey,
  ]);

  return ttlCache.getOrSet(
    cacheKey,
    BALANCE_CACHE_TTL_MS,
    async () => {
      const rows = await accountRepository.findBalances(
        db,
        {
          orgId,
          status,
          accountIds,
        },
      );

      const balances = {};
      for (const row of rows) {
        const accountId = Number(row.account_id);
        if (!balances[accountId]) {
          balances[accountId] = {};
        }
        balances[accountId][row.currency] =
          Number(row.balance) || 0;
      }

      return balances;
    },
  );
}

async function listAccountCreditDebit({
  user,
  filters = {},
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const status = filters.status ?? 1;
  const accountIds = filters.accountIds ?? filters.account_ids ?? null;
  const idsKey = Array.isArray(accountIds) && accountIds.length
    ? accountIds.slice().sort((a, b) => a - b).join(',')
    : 'all';
  const cacheKey = ttlCache.makeKey([
    'creditDebit',
    orgId,
    status,
    idsKey,
  ]);

  return ttlCache.getOrSet(
    cacheKey,
    BALANCE_CACHE_TTL_MS,
    async () => {
      const rows = await accountRepository.findCreditDebit(
        db,
        {
          orgId,
          status,
          accountIds,
        },
      );

      const creditDebit = {};
      for (const row of rows) {
        const accountId = Number(row.account_id);
        if (!creditDebit[accountId]) {
          creditDebit[accountId] = {};
        }
        const currency = row.currency || 'AFN';
        if (!creditDebit[accountId][currency]) {
          creditDebit[accountId][currency] = {
            credit: 0,
            debit: 0,
          };
        }
        creditDebit[accountId][currency].credit +=
          Number(row.credit) || 0;
        creditDebit[accountId][currency].debit +=
          Number(row.debit) || 0;
      }

      return creditDebit;
    },
  );
}

async function listDirectionalBalances({ user, filters }) {
  const { orgId } = getAuthenticatedIdentity(user);
  return accountRepository.findDirectionalBalances(db, {
    orgId,
    accountIds: filters.accountIds,
  });
}

function invalidateAccountAggregates(orgId) {
  ttlCache.invalidatePrefix(
    ttlCache.makeKey(['balances', orgId]),
  );
  ttlCache.invalidatePrefix(
    ttlCache.makeKey(['creditDebit', orgId]),
  );
  ttlCache.invalidatePrefix(
    ttlCache.makeKey(['dashboard', orgId]),
  );
}

async function getReportBootstrap({
  user,
  filters = {},
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const status = filters.status ?? 1;

  const [
    accountsResult,
    typesResult,
    groupsResult,
    creditDebit,
  ] = await Promise.all([
    accountRepository.findAll(
      db,
      {
        orgId,
        status,
        excludeCodes: [
          'NOTRACK',
          'RECEIVABLE',
          'PAYABLE',
          'SALES',
          'PURCHASE',
          'EXCHANGE',
        ],
        pagination: null,
        columnsSql: `
          local_id AS id,
          local_id,
          account_status,
          account_type_id,
          COALESCE((SELECT at_cap.can_be_customer FROM account_types at_cap
            WHERE at_cap.org_id = accounts.org_id AND at_cap.local_id = accounts.account_type_id LIMIT 1), 0) AS can_be_customer,
          COALESCE((SELECT at_cap.can_be_supplier FROM account_types at_cap
            WHERE at_cap.org_id = accounts.org_id AND at_cap.local_id = accounts.account_type_id LIMIT 1), 0) AS can_be_supplier,
          account_group_id,
          code,
          name,
          name_fa,
          name_ps,
          status,
          created_at
        `,
      },
    ),
    accountTypeRepository.findAll(db, {
      orgId,
      status: 1,
    }),
    accountGroupRepository.findAll(db, {
      orgId,
      status: 1,
    }),
    listAccountCreditDebit({
      user,
      filters: { status },
    }),
  ]);

  const accounts = (accountsResult?.data || [])
    .filter((account) =>
      account.account_status
        ? account.account_status === 'active'
        : Number(account.status) === 1,
    )
    .map((account) => ({
      ...account,
      include: true,
      computedBalances: creditDebit[account.id] || undefined,
    }));

  return {
    accounts,
    account_types: typesResult?.data || typesResult || [],
    account_groups: groupsResult?.data || groupsResult || [],
    credit_debit: creditDebit,
  };
}

async function getAccount({
  user,
  accountId,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const account =
    await accountRepository.findByLocalId(
      db,
      {
        orgId,
        localId: accountId,
      },
    );

  if (!account) {
    throw new AppError(
      'Account not found.',
      404,
      'ACCOUNT_NOT_FOUND',
    );
  }

  return account;
}

/*
 * Creates the initial-balance journal for a new account using the
 * NOTRACK account as the counter entry, mirroring the previous
 * frontend (Dexie) behavior.
 */
async function createInitialBalanceJournals({
  connection,
  orgId,
  userId,
  account,
  name,
  currency,
  initialBalanceType,
  balance,
  additionalInitialBalances,
  effectiveDate,
}) {
  const parsedBalance = parseFloat(balance) || 0;

  if (parsedBalance === 0) {
    return;
  }

  const noTrackAccount =
    await accountRepository.findByCode(
      connection,
      {
        orgId,
        code: 'NOTRACK',
        forUpdate: true,
      },
    );

  if (!noTrackAccount) {
    throw new AppError(
      'NO_TRACK account not found! Please create an account with code "NOTRACK" for handling initial balances.',
      400,
      'NO_TRACK_ACCOUNT_NOT_FOUND',
    );
  }

  /*
   * An opening balance is an accounting event with a date the user chooses,
   * not with the date the record happened to be created. Callers may pass
   * `effective_date` (OPTIONAL and additive); when it is omitted the previous
   * behaviour is preserved exactly, except that the fallback is now the
   * server's LOCAL calendar day rather than the UTC one.
   */
  const journalDate = accountingDate(effectiveDate);

  /*
   * Step 4.5: an opening balance is an accounting event whose date the user
   * chooses, so it may not be dated inside a CLOSED fiscal year. When no
   * effective_date is supplied the Step 3.5 fallback (today's local day) is
   * what gets checked, preserving the previous behaviour for dates that have
   * no configured fiscal year at all.
   */
  await fiscalPostingGuard.assertAccountingDateOpen(
    connection,
    {
      orgId,
      date: journalDate,
      operation: 'account.opening_balance',
    },
  );

  async function createJournal(entry) {
    const journalLocalId = generateLocalId();

    await journalRepository.create(
      connection,
      {
        orgId,
        localId: journalLocalId,
        userId,
        data: {
          date: journalDate,
          reference_id: account.id,
          reference_type: 'account',
          description: `Initial balance for account ${name}`,
          currency: entry.currency || currency,
          first_entry_account: account.id,
          first_entry_debit: entry.type === 'Debit' ? entry.balance : 0,
          first_entry_credit: entry.type === 'Credit' ? entry.balance : 0,
          second_entry_account: noTrackAccount.id,
          second_entry_debit: entry.balance > 0 && entry.type === 'Credit' ? entry.balance : 0,
          second_entry_credit: entry.balance > 0 && entry.type === 'Debit' ? entry.balance : 0,
          status: 1,
        },
      },
    );
  }

  await createJournal({
    type: initialBalanceType,
    balance: parsedBalance,
    currency,
  });

  for (const additional of additionalInitialBalances || []) {
    const additionalBalance = parseFloat(additional.balance) || 0;

    if (additionalBalance === 0) {
      continue;
    }

    await createJournal({
      type: additional.type || 'Debit',
      balance: additionalBalance,
      currency: additional.currency,
    });
  }
}

async function createAccount({
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

    if (isSystemAccountCode(data.code)) {
      throw new AppError(
        'System accounts cannot be created.',
        403,
        'SYSTEM_ACCOUNT_LOCKED',
      );
    }

    if (data.code) {
      const existingCode =
        await accountRepository.findByCode(
          connection,
          {
            orgId,
            code: data.code,
            forUpdate: true,
          },
        );

      if (existingCode) {
        throw new AppError(
          'An account with this code already exists. Please choose a different code.',
          409,
          'ACCOUNT_CODE_EXISTS',
        );
      }
    }

    const localId = generateLocalId();

    const initialBalanceType =
      data.initial_balance_type || 'Debit';

    const rawBalance = parseFloat(data.balance) || 0;

    /*
     * The stored balance follows the previous frontend convention:
     * Credit => positive, Debit => negative.
     */
    const storedBalance =
      initialBalanceType === 'Credit'
        ? rawBalance
        : rawBalance * -1 || 0;

    const account =
      await accountRepository.create(
        connection,
        {
          orgId,
          localId,
          userId,
          data: {
            ...data,
            balance: storedBalance,
          },
        },
      );

    await createInitialBalanceJournals({
      connection,
      orgId,
      userId,
      account,
      name: account.name,
      currency: account.currency,
      initialBalanceType,
      balance: rawBalance,
      additionalInitialBalances:
        data.additional_initial_balances,
      effectiveDate: data.effective_date,
    });

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'create',
        tableName: 'accounts',
        entityId: account.id,

        oldValues: null,
        newValues: account,

        description:
          `Created account ${account.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    invalidateAccountAggregates(orgId);

    return account;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAccount({
  user,
  accountId,
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

    const oldAccount =
      await accountRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountId,
          forUpdate: true,
        },
      );

    if (!oldAccount) {
      throw new AppError(
        'Account not found.',
        404,
        'ACCOUNT_NOT_FOUND',
      );
    }

    if (isSystemAccountCode(oldAccount.code)) {
      throw new AppError(
        'System accounts cannot be edited.',
        403,
        'SYSTEM_ACCOUNT_LOCKED',
      );
    }

    if (isSystemAccountCode(data.code)) {
      throw new AppError(
        'System accounts cannot be edited.',
        403,
        'SYSTEM_ACCOUNT_LOCKED',
      );
    }

    if (data.code) {
      const existingCode =
        await accountRepository.findByCode(
          connection,
          {
            orgId,
            code: data.code,
            forUpdate: true,
          },
        );

      if (
        existingCode &&
        Number(existingCode.id) !== Number(accountId)
      ) {
        throw new AppError(
          'An account with this code already exists. Please choose a different code.',
          409,
          'ACCOUNT_CODE_EXISTS',
        );
      }
    }

    const updatedAccount =
      await accountRepository.update(
        connection,
        {
          orgId,
          localId: accountId,
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
        tableName: 'accounts',
        entityId: updatedAccount.id,

        oldValues: oldAccount,
        newValues: updatedAccount,

        description:
          `Updated account ${updatedAccount.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return updatedAccount;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteAccount({
  user,
  accountId,
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

    const oldAccount =
      await accountRepository.findByLocalId(
        connection,
        {
          orgId,
          localId: accountId,
          forUpdate: true,
        },
      );

    if (!oldAccount) {
      throw new AppError(
        'Account not found.',
        404,
        'ACCOUNT_NOT_FOUND',
      );
    }

    if (isSystemAccountCode(oldAccount.code)) {
      throw new AppError(
        'System accounts cannot be deleted.',
        403,
        'SYSTEM_ACCOUNT_LOCKED',
      );
    }

    if (Number(oldAccount.status) === 0) {
      throw new AppError(
        'Account is already deleted.',
        409,
        'ACCOUNT_ALREADY_DELETED',
      );
    }

    const deletedAccount =
      await accountRepository.softDelete(
        connection,
        {
          orgId,
          localId: accountId,
          userId,
        },
      );

    await activityRepository.create(
      connection,
      {
        orgId,
        userId,

        action: 'delete',
        tableName: 'accounts',
        entityId: deletedAccount.id,

        oldValues: oldAccount,
        newValues: deletedAccount,

        description:
          `Deleted account ${oldAccount.name}`,

        ipAddress:
          requestContext.ipAddress,

        sessionId:
          requestContext.sessionId,

        deviceInfo:
          requestContext.deviceInfo,
      },
    );

    await connection.commit();

    return deletedAccount;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listAccountProductItems({
  user,
  accountId,
  filters,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  /*
   * accountId is optional: when omitted the report covers every
   * customer/supplier instead of a single account (used by the
   * Sales page "Products" tab).
   */
  let account = null;

  if (accountId != null) {
    account =
      await accountRepository.findByLocalId(
        db,
        {
          orgId,
          localId: accountId,
        },
      );

    if (!account) {
      throw new AppError(
        'Account not found.',
        404,
        'ACCOUNT_NOT_FOUND',
      );
    }
  }

  const pagination = resolvePagination(filters) || {
    page: 1,
    limit: 15,
    offset: 0,
  };

  /*
   * Customers (type 4) only have sales; suppliers (type 3) only
   * have purchases. Narrowing avoids a useless second scan.
   */
  let itemType = filters.item_type || 'all';
  if (itemType === 'all' && account) {
    if (Number(account.account_type_id) === 4) itemType = 'sale';
    else if (Number(account.account_type_id) === 3) itemType = 'purchase';
  }

  return accountProductItemRepository.findByAccount(
    db,
    {
      orgId,
      accountId: accountId != null ? Number(accountId) : null,
      itemType,
      productId: filters.product_id,
      currency: filters.currency,
      search: filters.search || '',
      dateFrom: filters.date_from,
      dateTo: filters.date_to,
      skipCount: Number(filters.skip_count) !== 0,
      pagination,
    },
  );
}

module.exports = {
  listAccounts,
  listAccountBalances,
  listAccountCreditDebit,
  listDirectionalBalances,
  getReportBootstrap,
  listAccountProductItems,
  invalidateAccountAggregates,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
};
