const {
  storageCalendarDay,
} = require('../utils/accountingDate');

const JOURNAL_COLUMNS = `
  local_id AS id,
  local_id,
  date,
  \`reference\`,
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
    referenceIds = null,
    referenceType,
    dateFrom,
    dateTo,
    accountId,
    currency,
    excludeSystemAccounts = false,
    excludeReportAccounts = false,
    skipCount = false,
    includeOpeningBalance = false,
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

  if (currency) {
    conditions.push('currency = ?');
    values.push(currency);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        description LIKE ?
        OR \`reference\` LIKE ?
        OR reference_type LIKE ?
        OR currency LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (referenceId !== undefined && referenceId !== null) {
    conditions.push('reference_id = ?');
    values.push(referenceId);
  }

  if (Array.isArray(referenceIds) && referenceIds.length) {
    conditions.push(
      `reference_id IN (${referenceIds.map(() => '?').join(', ')})`,
    );
    values.push(...referenceIds);
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

  const result = await paginateSelect(executor, {
    tableSql: 'journals',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY date DESC, local_id DESC',
    columnsSql: JOURNAL_COLUMNS,
    pagination,
    skipCount,
  });

  if (includeOpeningBalance && result.data.length) {
    result.openingBalance = await findOpeningBalanceTotals(executor, {
      orgId,
      conditions,
      values,
      cursor: result.data[result.data.length - 1],
    });
  }

  return result;
}

/*
 * The per-currency balance a page opens on: every row that sorts after the
 * page's oldest row (the list is newest-first) added up. A caller that wants a
 * running balance therefore reads one page plus this total instead of
 * downloading the whole ledger a page at a time.
 *
 * Amounts follow the same TREASURY rule as the rows themselves: a movement that
 * touches the treasury account contributes only its counterpart.
 */
async function findOpeningBalanceTotals(
  executor,
  {
    orgId,
    conditions,
    values,
    cursor,
  },
) {
  const [treasuryRows] = await executor.execute(
    `
      SELECT MIN(local_id) AS local_id
      FROM accounts
      WHERE org_id = ?
        AND code = 'TREASURY'
        AND status = 1
    `,
    [orgId],
  );

  const treasuryId = treasuryRows[0]?.local_id ?? null;

  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        SUM(
          CASE
            WHEN first_entry_account = ?
              THEN COALESCE(second_entry_debit, 0)
            WHEN second_entry_account = ?
              THEN COALESCE(first_entry_debit, 0)
            ELSE COALESCE(first_entry_debit, 0)
              + COALESCE(second_entry_debit, 0)
          END
        ) AS debit,
        SUM(
          CASE
            WHEN first_entry_account = ?
              THEN COALESCE(second_entry_credit, 0)
            WHEN second_entry_account = ?
              THEN COALESCE(first_entry_credit, 0)
            ELSE COALESCE(first_entry_credit, 0)
              + COALESCE(second_entry_credit, 0)
          END
        ) AS credit
      FROM journals
      WHERE ${conditions.join(' AND ')}
        AND (
          date < ?
          OR (date <=> ? AND local_id < ?)
        )
      GROUP BY currency
    `,
    [
      treasuryId,
      treasuryId,
      treasuryId,
      treasuryId,
      ...values,
      cursor.date,
      cursor.date,
      cursor.local_id,
    ],
  );

  const totals = {};

  for (const row of rows) {
    const currency = row.currency || 'DEFAULT';
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;

    totals[currency] = {
      debit,
      credit,
      balance: credit - debit,
    };
  }

  return totals;
}

// Calculate against the ledger before restricting to the visible page. Search,
// date_from and pagination must never remove movements from a row's balance.
async function findAccountNewerMovements(executor, {
  orgId, status = 1, accountId, dateTo, journalIds,
}) {
  if (!journalIds.length) return [];
  const values = [accountId, accountId, orgId, status, accountId, accountId];
  const endCondition = dateTo
    ? 'AND COALESCE(n.date, n.created_at) < DATE_ADD(?, INTERVAL 1 DAY)'
    : '';
  if (dateTo) values.push(dateTo);
  values.push(orgId, status, accountId, accountId, ...journalIds);

  const [rows] = await executor.execute(`
    SELECT j.local_id AS id, n.currency,
      COALESCE(SUM(
        CASE WHEN n.first_entry_account = ?
          THEN COALESCE(n.first_entry_credit, 0) - COALESCE(n.first_entry_debit, 0)
          ELSE 0 END
        + CASE WHEN n.second_entry_account = ?
          THEN COALESCE(n.second_entry_credit, 0) - COALESCE(n.second_entry_debit, 0)
          ELSE 0 END
      ), 0) AS newer_movement
    FROM journals j
    LEFT JOIN journals n ON n.org_id = ? AND n.status = ?
      AND (n.first_entry_account = ? OR n.second_entry_account = ?)
      AND (
        n.date > j.date
        OR (n.date <=> j.date) AND n.local_id > j.local_id
        OR j.date IS NULL AND n.date IS NOT NULL
      )
      ${endCondition}
    WHERE j.org_id = ? AND j.status = ?
      AND (j.first_entry_account = ? OR j.second_entry_account = ?)
      AND j.local_id IN (${journalIds.map(() => '?').join(', ')})
    GROUP BY j.local_id, n.currency
  `, values);
  return rows;
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
    referenceIds = null,
    referenceType,
    dateFrom,
    dateTo,
    accountId,
    currency,
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

  if (currency) {
    conditions.push('j.currency = ?');
    values.push(currency);
  }

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(`
      (
        j.description LIKE ?
        OR j.\`reference\` LIKE ?
        OR j.reference_type LIKE ?
        OR j.currency LIKE ?
      )
    `);
    values.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (referenceId !== undefined && referenceId !== null) {
    conditions.push('j.reference_id = ?');
    values.push(referenceId);
  }

  if (Array.isArray(referenceIds) && referenceIds.length) {
    conditions.push(
      `j.reference_id IN (${referenceIds.map(() => '?').join(', ')})`,
    );
    values.push(...referenceIds);
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
        \`reference\`,
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
      data.reference || null,
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
    reference: '`reference`',
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
  findAccountNewerMovements,
  findSummary,
  findByLocalId,
  create,
  update,
  softDelete,
  softDeleteByReference,
};
