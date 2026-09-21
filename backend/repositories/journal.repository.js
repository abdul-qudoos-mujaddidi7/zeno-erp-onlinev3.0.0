const {
  storageCalendarDay,
} = require('../utils/accountingDate');

const JOURNAL_COLUMNS = `
  local_id AS id,
  local_id,
  date,
  reference_id,
  reference_type,
  description,
  currency,
  first_entry_account,
  first_entry_debit,
  first_entry_credit,
  second_entry_account,
  second_entry_debit,
  second_entry_credit,
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
    referenceId,
    referenceType,
    dateFrom,
    dateTo,
    accountId,
    excludeSystemAccounts = false,
    excludeReportAccounts = false,
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

  if (accountId !== undefined && accountId !== null) {
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
        OR currency LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (referenceId !== undefined && referenceId !== null) {
    conditions.push('reference_id = ?');
    values.push(referenceId);
  }

  if (referenceType) {
    conditions.push('reference_type = ?');
    values.push(referenceType);
  }

  if (dateFrom) {
    conditions.push('COALESCE(date, created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('COALESCE(date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }

  /*
   * Hide system double-entry rows whose counterpart is
   * PAYABLE/RECEIVABLE. Prefer a tiny NOT IN list over
   * building a huge IN (...) of every valid account id —
   * that large placeholder list forces full scans and
   * heavy query planning when the journals table is large.
   */
  const excludedIds = await resolveExcludedAccountIds(
    executor,
    {
      orgId,
      excludeSystemAccounts,
      excludeReportAccounts,
    },
  );

  appendExcludedAccountFilters(
    conditions,
    values,
    excludedIds,
  );

  return paginateSelect(executor, {
    tableSql: 'journals',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY date DESC, local_id DESC',
    columnsSql: JOURNAL_COLUMNS,
    pagination,
    skipCount,
  });
}

async function resolveExcludedAccountIds(
  executor,
  {
    orgId,
    excludeSystemAccounts = false,
    excludeReportAccounts = false,
  },
) {
  const codes = [];

  if (excludeSystemAccounts || excludeReportAccounts) {
    codes.push('PAYABLE', 'RECEIVABLE');
  }

  if (excludeReportAccounts) {
    codes.push('SALES', 'PURCHASE');
  }

  if (!codes.length) return [];

  const placeholders = codes.map(() => '?').join(', ');
  const [rows] = await executor.execute(
    `
      SELECT local_id
      FROM accounts
      WHERE org_id = ?
        AND code IN (${placeholders})
    `,
    [orgId, ...codes],
  );

  return rows
    .map((row) => Number(row.local_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function appendExcludedAccountFilters(conditions, values, excludedIds) {
  if (!excludedIds.length) return;

  const placeholders = excludedIds.map(() => '?').join(', ');
  conditions.push(`first_entry_account NOT IN (${placeholders})`);
  conditions.push(`second_entry_account NOT IN (${placeholders})`);
  values.push(...excludedIds, ...excludedIds);
}

async function findSummary(
  executor,
  {
    orgId,
    status = 1,
    search = '',
    referenceId,
    referenceType,
    dateFrom,
    dateTo,
    accountId,
    excludeSystemAccounts = false,
    excludeReportAccounts = false,
  },
) {
  const conditions = [
    'j.org_id = ?',
    'j.status = ?',
  ];
  const values = [orgId, status];

  if (accountId !== undefined && accountId !== null) {
    conditions.push(
      '(j.first_entry_account = ? OR j.second_entry_account = ?)',
    );
    values.push(accountId, accountId);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(`
      (
        j.description LIKE ?
        OR j.reference_type LIKE ?
        OR j.currency LIKE ?
      )
    `);
    values.push(searchPattern, searchPattern, searchPattern);
  }

  if (referenceId !== undefined && referenceId !== null) {
    conditions.push('j.reference_id = ?');
    values.push(referenceId);
  }

  if (referenceType) {
    conditions.push('j.reference_type = ?');
    values.push(referenceType);
  }

  if (dateFrom) {
    conditions.push('COALESCE(j.date, j.created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(
      'COALESCE(j.date, j.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    );
    values.push(dateTo);
  }

  const excludedIds = await resolveExcludedAccountIds(
    executor,
    {
      orgId,
      excludeSystemAccounts,
      excludeReportAccounts,
    },
  );

  if (excludedIds.length) {
    const placeholders = excludedIds.map(() => '?').join(', ');
    conditions.push(`j.first_entry_account NOT IN (${placeholders})`);
    conditions.push(`j.second_entry_account NOT IN (${placeholders})`);
    values.push(...excludedIds, ...excludedIds);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        j.currency,
        SUM(
          CASE
            WHEN j.first_entry_account = t.local_id
              THEN COALESCE(j.second_entry_debit, 0)
            WHEN j.second_entry_account = t.local_id
              THEN COALESCE(j.first_entry_debit, 0)
            ELSE COALESCE(j.first_entry_debit, 0)
              + COALESCE(j.second_entry_debit, 0)
          END
        ) AS debit,
        SUM(
          CASE
            WHEN j.first_entry_account = t.local_id
              THEN COALESCE(j.second_entry_credit, 0)
            WHEN j.second_entry_account = t.local_id
              THEN COALESCE(j.first_entry_credit, 0)
            ELSE COALESCE(j.first_entry_credit, 0)
              + COALESCE(j.second_entry_credit, 0)
          END
        ) AS credit
      FROM journals j
      LEFT JOIN (
        SELECT org_id, MIN(local_id) AS local_id
        FROM accounts
        WHERE code = 'TREASURY'
          AND status = 1
        GROUP BY org_id
      ) t ON t.org_id = j.org_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY j.currency
    `,
    values,
  );

  const summary = {};
  for (const row of rows) {
    const currency = row.currency || 'AFN';
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    summary[currency] = {
      debit,
      credit,
      balance: credit - debit,
    };
  }

  return summary;
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
        ${JOURNAL_COLUMNS}
      FROM journals
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
      INSERT INTO journals (
        org_id,
        local_id,
        date,
        reference_id,
        reference_type,
        description,
        currency,
        first_entry_account,
        first_entry_debit,
        first_entry_credit,
        second_entry_account,
        second_entry_debit,
        second_entry_credit,
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
        1,
        ?,
        ?
      )
    `,
    [
      orgId,
      localId,
      storageCalendarDay(data.date),
      data.reference_id ?? null,
      data.reference_type || null,
      data.description || null,
      data.currency || null,
      data.first_entry_account ?? null,
      data.first_entry_debit ?? null,
      data.first_entry_credit ?? null,
      data.second_entry_account ?? null,
      data.second_entry_debit ?? null,
      data.second_entry_credit ?? null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  const [rows] = await executor.execute(
    `
      SELECT
        ${JOURNAL_COLUMNS}
      FROM journals
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
    currency: 'currency',
    first_entry_account: 'first_entry_account',
    first_entry_debit: 'first_entry_debit',
    first_entry_credit: 'first_entry_credit',
    second_entry_account: 'second_entry_account',
    second_entry_debit: 'second_entry_debit',
    second_entry_credit: 'second_entry_credit',
    status: 'status',
  };

  for (const [field, column] of Object.entries(columnMap)) {
    if (data[field] !== undefined) {
      sets.push(`${column} = ?`);
      /*
       * `date` is an ACCOUNTING date, so it is stored as a calendar day: a
       * caller that hands over `new Date()` or an ISO instant is normalized to
       * its local day instead of writing a moment that a second reader could
       * classify as a different day (and a different fiscal year).
       */
      values.push(
        field === 'date'
          ? storageCalendarDay(data[field])
          : data[field],
      );
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
      UPDATE journals
      SET ${sets.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

  const [rows] = await executor.execute(
    `
      SELECT
        ${JOURNAL_COLUMNS}
      FROM journals
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

async function softDeleteByReference(
  executor,
  {
    orgId,
    referenceId,
    referenceType,
    userId,
  },
) {
  await executor.execute(
    `
      UPDATE journals
      SET status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?
      WHERE org_id = ?
        AND reference_id = ?
        AND reference_type = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      referenceId,
      referenceType,
    ],
  );
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
      UPDATE journals
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
        ${JOURNAL_COLUMNS}
      FROM journals
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
  findSummary,
  findByLocalId,
  create,
  update,
  softDelete,
  softDeleteByReference,
};
