const EXCHANGE_COLUMNS = `
  local_id AS id,
  local_id,
  date,
  reference_id,
  reference_type,
  description,
  first_currency,
  first_entry_account,
  first_entry_debit,
  first_entry_credit,
  second_currency,
  second_entry_account,
  second_entry_debit,
  second_entry_credit,
  multiple,
  rate,
  system_rate,
  benefit_amount,
  benefit_currency,
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
    referenceType,
    accountId,
    excludeSystemAccounts = false,
    skipCount = false,
    pagination = null,
  }) {
  const conditions = [
    'org_id = ?',
    'status = ?',
  ];

  const values = [
    orgId,
    status,
  ];

  if (accountId !== undefined && accountId !== null && accountId !== '') {
    conditions.push(
      '(first_entry_account = ? OR second_entry_account = ?)',
    );
    values.push(accountId, accountId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        description LIKE ?
        OR reference_type LIKE ?
        OR first_currency LIKE ?
        OR second_currency LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (referenceType) {
    conditions.push('reference_type = ?');
    values.push(referenceType);
  }

  if (excludeSystemAccounts) {
    const [excludedRows] = await executor.execute(
      "SELECT local_id FROM accounts WHERE org_id = ? AND code IN ('PAYABLE','RECEIVABLE')",
      [orgId],
    );

    const excludedIds = excludedRows
      .map((row) => Number(row.local_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (excludedIds.length) {
      const placeholders = excludedIds.map(() => '?').join(', ');
      conditions.push(`first_entry_account NOT IN (${placeholders})`);
      conditions.push(`second_entry_account NOT IN (${placeholders})`);
      values.push(...excludedIds, ...excludedIds);
    }
  }

  return paginateSelect(executor, {
    tableSql: 'exchanges',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY date DESC, local_id DESC',
    columnsSql: EXCHANGE_COLUMNS,
    pagination,
    skipCount,
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
        ${EXCHANGE_COLUMNS}
      FROM exchanges
      WHERE org_id = ?
        AND local_id = ?
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function create(
  executor,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const [result] = await executor.execute(
    `
      INSERT INTO exchanges (
        org_id,
        local_id,
        date,
        reference_id,
        reference_type,
        description,
        first_currency,
        first_entry_account,
        first_entry_debit,
        first_entry_credit,
        second_currency,
        second_entry_account,
        second_entry_debit,
        second_entry_credit,
        multiple,
        rate,
        system_rate,
        benefit_amount,
        benefit_currency,
        status,
        version,
        created_by,
        updated_by
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        1,
        ?,
        ?
      )
    `,
    [
      orgId,
      localId,
      data.date || null,
      data.reference_id ?? null,
      data.reference_type || null,
      data.description || null,
      data.first_currency || null,
      data.first_entry_account ?? null,
      data.first_entry_debit ?? null,
      data.first_entry_credit ?? null,
      data.second_currency || null,
      data.second_entry_account ?? null,
      data.second_entry_debit ?? null,
      data.second_entry_credit ?? null,
      data.multiple ?? null,
      data.rate ?? null,
      data.system_rate ?? null,
      data.benefit_amount ?? null,
      data.benefit_currency || null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  const [rows] = await executor.execute(
    `
      SELECT
        ${EXCHANGE_COLUMNS}
      FROM exchanges
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0];
}

async function update(
  executor,
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
    date: 'date',
    reference_id: 'reference_id',
    reference_type: 'reference_type',
    description: 'description',
    first_currency: 'first_currency',
    first_entry_account: 'first_entry_account',
    first_entry_debit: 'first_entry_debit',
    first_entry_credit: 'first_entry_credit',
    second_currency: 'second_currency',
    second_entry_account: 'second_entry_account',
    second_entry_debit: 'second_entry_debit',
    second_entry_credit: 'second_entry_credit',
    multiple: 'multiple',
    rate: 'rate',
    system_rate: 'system_rate',
    benefit_amount: 'benefit_amount',
    benefit_currency: 'benefit_currency',
    status: 'status',
  };

  for (const [field, column] of Object.entries(columnMap)) {
    if (data[field] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(data[field]);
    }
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

  await executor.execute(
    `
      UPDATE exchanges
      SET ${sets.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

  const [rows] = await executor.execute(
    `
      SELECT
        ${EXCHANGE_COLUMNS}
      FROM exchanges
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0];
}

async function softDelete(
  executor,
  {
    orgId,
    localId,
    userId,
  },
) {
  await executor.execute(
    `
      UPDATE exchanges
      SET status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      userId,
      orgId,
      localId,
    ],
  );

  const [rows] = await executor.execute(
    `
      SELECT
        ${EXCHANGE_COLUMNS}
      FROM exchanges
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0];
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
};
