const {
  systemAccountOrderSql,
  systemAccountFlagSql,
} = require('../constants/systemAccounts');

const ACCOUNT_COLUMNS = `
  local_id AS id,
  local_id,
  account_status,
  account_type_id,
  COALESCE((SELECT at_cap.can_be_customer FROM account_types at_cap
    WHERE at_cap.org_id = accounts.org_id AND at_cap.local_id = accounts.account_type_id LIMIT 1),
    CASE WHEN account_type_id = 4 THEN 1 ELSE 0 END) AS can_be_customer,
  COALESCE((SELECT at_cap.can_be_supplier FROM account_types at_cap
    WHERE at_cap.org_id = accounts.org_id AND at_cap.local_id = accounts.account_type_id LIMIT 1),
    CASE WHEN account_type_id = 3 THEN 1 ELSE 0 END) AS can_be_supplier,
  account_group_id,
  patient_type_id,
  nid,
  code,
  name,
  name_fa,
  name_ps,
  main_acc,
  ${systemAccountFlagSql('code')} AS is_system,
  balance,
  currency,
  percentage,
  description,
  phone,
  phone2,
  email,
  address,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const {
  paginateSelect,
} = require('../utils/pagination');

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    search = '',
    code,
    accountTypeId,
    role,
    accountGroupId,
    patientTypeId,
    accountStatus,
    excludeCodes = [],
    pagination = null,
    columnsSql = ACCOUNT_COLUMNS,
    ids = [],
  },
) {
  const conditions = [
    'org_id = ?',
    'status = ?',
  ];

  const values = [
    orgId,
    status,
  ];

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        name LIKE ?
        OR name_fa LIKE ?
        OR name_ps LIKE ?
        OR code LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (code) {
    conditions.push('code = ?');
    values.push(code);
  }

  if (accountTypeId) {
    conditions.push('account_type_id = ?');
    values.push(accountTypeId);
  }

  if (role === 'visitor') {
    /*
     * A visitor is identified by its type's `code`, not by a capability flag,
     * matching services/account-role.service.js. The code is the stable name
     * of a type, so this keeps working after a rename.
     */
    conditions.push(`
      EXISTS (
        SELECT 1 FROM account_types at_role
        WHERE at_role.org_id = accounts.org_id
          AND at_role.local_id = accounts.account_type_id
          AND at_role.status = 1
          AND UPPER(TRIM(at_role.code)) = 'VISITOR'
      )
    `);
  }

  if (role === 'customer' || role === 'supplier') {
    const capability = role === 'customer' ? 'can_be_customer' : 'can_be_supplier';
    const legacyType = role === 'customer' ? 4 : 3;
    conditions.push(`(
      account_type_id = ? OR EXISTS (
        SELECT 1 FROM account_types at_role
        WHERE at_role.org_id = accounts.org_id
          AND at_role.local_id = accounts.account_type_id
          AND at_role.status = 1
          AND at_role.${capability} = 1
      )
    )`);
    values.push(legacyType);
  }

  if (accountGroupId) {
    conditions.push('account_group_id = ?');
    values.push(accountGroupId);
  }

  if (patientTypeId) {
    conditions.push('patient_type_id = ?');
    values.push(patientTypeId);
  }

  if (accountStatus) {
    conditions.push('account_status = ?');
    values.push(accountStatus);
  }

  if (Array.isArray(ids) && ids.length > 0) {
    conditions.push(
      `local_id IN (${ids.map(() => '?').join(', ')})`,
    );
    values.push(...ids);
  }

  if (Array.isArray(excludeCodes) && excludeCodes.length > 0) {
    conditions.push(
      `code NOT IN (${excludeCodes.map(() => '?').join(', ')})`,
    );
    values.push(...excludeCodes);
  }

  return paginateSelect(executor, {
    tableSql: 'accounts',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: `ORDER BY ${systemAccountOrderSql('code')}, name ASC, local_id ASC`,
    columnsSql,
    pagination,
  });
}

/**
 * Aggregate journal balances per account + currency (replaces
 * shipping every journal row to the browser).
 *
 * Runs one GROUP BY pass per entry column instead of a UNION ALL
 * of both passes: each pass can use a covering index on
 * (org_id, status, entry_account, currency, credit, debit), so the
 * aggregation is an index-only scan grouped in index order without a
 * temp table or filesort.
 */
async function findBalances(
  executor,
  {
    orgId,
    status = 1,
    accountIds = null,
  },
) {
  const hasAccountFilter =
    Array.isArray(accountIds) && accountIds.length > 0;
  const placeholders = hasAccountFilter
    ? accountIds.map(() => '?').join(', ')
    : '';

  const baseWhere = 'org_id = ? AND status = ?';

  const firstWhere = hasAccountFilter
    ? `${baseWhere} AND first_entry_account IN (${placeholders})`
    : `${baseWhere} AND first_entry_account IS NOT NULL`;

  const secondWhere = hasAccountFilter
    ? `${baseWhere} AND second_entry_account IN (${placeholders})`
    : `${baseWhere} AND second_entry_account IS NOT NULL`;

  const baseValues = [orgId, status];
  const values = hasAccountFilter
    ? [...baseValues, ...accountIds]
    : baseValues;

  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          first_entry_account AS account_id,
          currency,
          SUM(COALESCE(first_entry_credit, 0) - COALESCE(first_entry_debit, 0)) AS balance
        FROM journals
        WHERE ${firstWhere}
        GROUP BY first_entry_account, currency
      `,
      values,
    ),
    executor.execute(
      `
        SELECT
          second_entry_account AS account_id,
          currency,
          SUM(COALESCE(second_entry_credit, 0) - COALESCE(second_entry_debit, 0)) AS balance
        FROM journals
        WHERE ${secondWhere}
        GROUP BY second_entry_account, currency
      `,
      values,
    ),
  ]);

  /*
   * A single account may appear as the first entry of some journals
   * and the second entry of others; merge the two passes by adding
   * their per-currency balances (mirrors UNION ALL + GROUP BY).
   */
  const merged = new Map();

  for (const row of [...firstPass[0], ...secondPass[0]]) {
    const key = `${row.account_id}|${row.currency}`;
    const existing = merged.get(key);

    if (existing) {
      existing.balance = Number(existing.balance) + Number(row.balance);
    } else {
      merged.set(key, row);
    }
  }

  return [...merged.values()];
}

/**
 * Credit/debit totals per account+currency via two GROUP BY passes
 * (same shape as findBalances, but keeps credit and debit separate).
 */
async function findCreditDebit(
  executor,
  {
    orgId,
    status = 1,
    accountIds = null,
  },
) {
  const hasAccountFilter =
    Array.isArray(accountIds) && accountIds.length > 0;
  const placeholders = hasAccountFilter
    ? accountIds.map(() => '?').join(', ')
    : '';

  const baseWhere = 'org_id = ? AND status = ?';

  const firstWhere = hasAccountFilter
    ? `${baseWhere} AND first_entry_account IN (${placeholders})`
    : `${baseWhere} AND first_entry_account IS NOT NULL`;

  const secondWhere = hasAccountFilter
    ? `${baseWhere} AND second_entry_account IN (${placeholders})`
    : `${baseWhere} AND second_entry_account IS NOT NULL`;

  const baseValues = [orgId, status];
  const values = hasAccountFilter
    ? [...baseValues, ...accountIds]
    : baseValues;

  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          first_entry_account AS account_id,
          currency,
          SUM(COALESCE(first_entry_credit, 0)) AS credit,
          SUM(COALESCE(first_entry_debit, 0)) AS debit
        FROM journals
        WHERE ${firstWhere}
        GROUP BY first_entry_account, currency
      `,
      values,
    ),
    executor.execute(
      `
        SELECT
          second_entry_account AS account_id,
          currency,
          SUM(COALESCE(second_entry_credit, 0)) AS credit,
          SUM(COALESCE(second_entry_debit, 0)) AS debit
        FROM journals
        WHERE ${secondWhere}
        GROUP BY second_entry_account, currency
      `,
      values,
    ),
  ]);

  const merged = new Map();

  for (const row of [...firstPass[0], ...secondPass[0]]) {
    const key = `${row.account_id}|${row.currency}`;
    const existing = merged.get(key);

    if (existing) {
      existing.credit = Number(existing.credit) + Number(row.credit);
      existing.debit = Number(existing.debit) + Number(row.debit);
    } else {
      merged.set(key, {
        account_id: row.account_id,
        currency: row.currency,
        credit: Number(row.credit) || 0,
        debit: Number(row.debit) || 0,
      });
    }
  }

  return [...merged.values()];
}

async function findDirectionalBalances(executor, { orgId, accountIds = null }) {
  const idFilter = Array.isArray(accountIds) && accountIds.length
    ? ` AND entry_account IN (${accountIds.map(() => '?').join(', ')})`
    : '';
  /*
   * Each UNION branch aggregates its own side of the journals first, so the
   * derived table the outer query groups is a few hundred small rows instead
   * of every journal entry of the organization twice over. The grouping stays
   * at (account, currency, reference_type) so the outer CASE sums add up to
   * exactly the same numbers as summing the raw rows did.
   */
  const [rows] = await executor.execute(
    `
      SELECT entry_account AS account_id, currency,
        SUM(CASE WHEN reference_type IN ('sale','sale_payment','sale_return')
          THEN debit - credit ELSE 0 END) AS customer_receivable,
        SUM(CASE WHEN reference_type IN ('purchase','purchase_payment','purchase_return')
          THEN credit - debit ELSE 0 END) AS supplier_payable
      FROM (
        SELECT first_entry_account AS entry_account, currency, reference_type,
          SUM(COALESCE(first_entry_debit,0)) AS debit,
          SUM(COALESCE(first_entry_credit,0)) AS credit
        FROM journals WHERE org_id = ? AND status = 1
        GROUP BY first_entry_account, currency, reference_type
        UNION ALL
        SELECT second_entry_account AS entry_account, currency, reference_type,
          SUM(COALESCE(second_entry_debit,0)) AS debit,
          SUM(COALESCE(second_entry_credit,0)) AS credit
        FROM journals WHERE org_id = ? AND status = 1
        GROUP BY second_entry_account, currency, reference_type
      ) directional
      WHERE reference_type IN ('sale','sale_payment','sale_return','purchase','purchase_payment','purchase_return')
        ${idFilter}
      GROUP BY entry_account, currency
      ORDER BY entry_account, currency
    `,
    [orgId, orgId, ...(accountIds || [])],
  );
  return rows.map((row) => {
    const customerReceivable = Number(row.customer_receivable || 0);
    const supplierPayable = Number(row.supplier_payable || 0);
    return {
      account_id: Number(row.account_id),
      currency: row.currency || 'AFN',
      customer_receivable: customerReceivable,
      supplier_payable: supplierPayable,
      net_position: customerReceivable - supplierPayable,
    };
  });
}

async function findByLocalId(
  executor,
  {
    orgId,
    localId,
    forUpdate = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${ACCOUNT_COLUMNS}
      FROM accounts
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function findByCode(
  executor,
  {
    orgId,
    code,
    forUpdate = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${ACCOUNT_COLUMNS}
      FROM accounts
      WHERE org_id = ?
        AND code = ?
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      code,
    ],
  );

  return rows[0] || null;
}

async function create(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  await connection.execute(
    `
      INSERT INTO accounts (
        org_id,
        local_id,
        account_status,
        account_type_id,
        account_group_id,
        patient_type_id,
        nid,
        code,
        name,
        name_fa,
        name_ps,
        main_acc,
        balance,
        currency,
        percentage,
        description,
        phone,
        phone2,
        email,
        address,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.account_status ?? null,
      data.account_type_id ?? null,
      data.account_group_id ?? null,
      data.patient_type_id ?? null,
      data.nid ?? null,
      data.code ?? null,
      data.name ?? null,
      data.name_fa ?? null,
      data.name_ps ?? null,
      data.main_acc ?? null,
      data.balance ?? null,
      data.currency ?? null,
      data.percentage ?? null,
      data.description ?? null,
      data.phone ?? null,
      data.phone2 ?? null,
      data.email ?? null,
      data.address ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function update(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const sets = [];
  const values = [];

  const columnMap = {
    account_status: 'account_status',
    account_type_id: 'account_type_id',
    account_group_id: 'account_group_id',
    code: 'code',
    name: 'name',
    name_fa: 'name_fa',
    name_ps: 'name_ps',
    main_acc: 'main_acc',
    currency: 'currency',
    percentage: 'percentage',
    description: 'description',
    phone: 'phone',
    phone2: 'phone2',
    email: 'email',
    address: 'address',
    status: 'status',
  };

  for (const [field, column] of Object.entries(columnMap)) {
    if (data[field] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(data[field]);
    }
  }

  if (sets.length === 0) {
    return findByLocalId(
      connection,
      {
        orgId,
        localId,
      },
    );
  }

  sets.push(
    'version = COALESCE(version, 0) + 1',
    'updated_by = ?',
  );

  values.push(userId);

  values.push(
    orgId,
    localId,
  );

  await connection.execute(
    `
      UPDATE accounts
      SET ${sets.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDelete(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE accounts
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      userId,
      orgId,
      localId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

module.exports = {
  findAll,
  findBalances,
  findCreditDebit,
  findDirectionalBalances,
  findByLocalId,
  findByCode,
  create,
  update,
  softDelete,
};
