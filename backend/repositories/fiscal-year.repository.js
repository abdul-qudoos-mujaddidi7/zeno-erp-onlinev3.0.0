/**
 * Fiscal-year foundation (Step 3).
 *
 * Everything here is additive: the module owns the `fiscal_years` table and
 * a set of READ-ONLY aggregates used by the fiscal-year summary. No existing
 * table is written to, and no historical row is ever rewritten.
 *
 * Accounting-date convention: this application already classifies a document
 * by `COALESCE(<document date>, created_at)` (see dashboard.repository.js),
 * so the summary reuses exactly that window semantics:
 *
 *   COALESCE(date_col, created_at) >= startDate
 *   AND COALESCE(date_col, created_at) < DATE_ADD(endDate, INTERVAL 1 DAY)
 */

const FISCAL_YEAR_COLUMNS = `
  local_id AS id,
  local_id,
  name,
  start_date,
  end_date,
  fiscal_status,
  closed_at,
  closed_by,
  note,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

/*
 * The fiscal-year window is inclusive on both ends, so a document saved on
 * either boundary date belongs to the year.
 */
function windowSql(dateExpression) {
  /*
   * The `created_at` fallback must carry the same table qualifier as the
   * date expression itself. journals and accounts both define created_at,
   * so an unqualified fallback is ambiguous inside the joined queries.
   */
  const qualifier = dateExpression.includes('.')
    ? dateExpression.slice(0, dateExpression.indexOf('.') + 1)
    : '';

  return `
    COALESCE(${dateExpression}, ${qualifier}created_at) >= ?
    AND COALESCE(${dateExpression}, ${qualifier}created_at) < DATE_ADD(?, INTERVAL 1 DAY)
  `;
}

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    fiscalStatus = null,
  },
) {
  const conditions = ['org_id = ?'];
  const values = [orgId];

  if (status !== null && status !== undefined) {
    conditions.push('status = ?');
    values.push(status);
  }

  if (fiscalStatus) {
    conditions.push('fiscal_status = ?');
    values.push(fiscalStatus);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${FISCAL_YEAR_COLUMNS}
      FROM fiscal_years
      WHERE ${conditions.join(' AND ')}
      ORDER BY start_date DESC, local_id DESC
    `,
    values,
  );

  return rows;
}

async function findByLocalId(
  executor,
  {
    orgId,
    localId,
    forUpdate = false,
    includeDeleted = true,
  },
) {
  const conditions = ['org_id = ?', 'local_id = ?'];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${FISCAL_YEAR_COLUMNS}
      FROM fiscal_years
      WHERE ${conditions.join(' AND ')}
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [orgId, localId],
  );

  return rows[0] || null;
}

/*
 * Locks every fiscal year of the organization in a stable order before a
 * write. Fiscal-year ranges may not overlap, and MySQL cannot express that
 * as a constraint, so writes are serialized per organization instead: two
 * concurrent creates can never both see an empty range and commit.
 *
 * Ordered by local_id (never by date) so concurrent writers acquire the
 * locks in the same sequence and cannot deadlock each other.
 */
async function lockOrganizationYears(connection, { orgId }) {
  const [rows] = await connection.execute(
    `
      SELECT
        local_id AS id,
        local_id,
        start_date,
        end_date,
        fiscal_status
      FROM fiscal_years
      WHERE org_id = ?
      ORDER BY local_id ASC
      FOR UPDATE
    `,
    [orgId],
  );

  return rows;
}

/*
 * Overlap test on inclusive ranges: two years overlap when each one starts
 * on or before the other's end date. Adjacent years (2026-12-31 /
 * 2027-01-01) do NOT overlap, which is the behaviour the ERP needs.
 */
async function findOverlapping(
  executor,
  {
    orgId,
    startDate,
    endDate,
    excludeLocalId = null,
  },
) {
  const conditions = [
    'org_id = ?',
    'status = 1',
    'start_date <= ?',
    'end_date >= ?',
  ];

  const values = [orgId, endDate, startDate];

  if (excludeLocalId !== null && excludeLocalId !== undefined) {
    conditions.push('local_id <> ?');
    values.push(excludeLocalId);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${FISCAL_YEAR_COLUMNS}
      FROM fiscal_years
      WHERE ${conditions.join(' AND ')}
      ORDER BY start_date ASC
    `,
    values,
  );

  return rows;
}

/*
 * `lock` turns the lookup into a locking read (Step 4.5 posting guard):
 *
 *   'share'  LOCK IN SHARE MODE — concurrent postings in the same open year
 *            do not block each other, but a fiscal-year close (which needs
 *            the same row exclusively) waits for them and therefore cannot
 *            compute a period that misses an in-flight posting.
 *   'update' FOR UPDATE
 *
 * LOCK IN SHARE MODE is used rather than MySQL 8.0's `FOR SHARE` because this
 * deployment runs MariaDB 10.4, where `FOR SHARE` is not available. The read
 * is a no-op lock outside a transaction, so only transactional callers should
 * ask for it.
 */
async function findCoveringDate(
  executor,
  {
    orgId,
    date,
    lock = null,
  },
) {
  const lockSql =
    lock === 'share'
      ? 'LOCK IN SHARE MODE'
      : lock === 'update'
        ? 'FOR UPDATE'
        : '';

  const [rows] = await executor.execute(
    `
      SELECT
        ${FISCAL_YEAR_COLUMNS}
      FROM fiscal_years
      WHERE org_id = ?
        AND status = 1
        AND start_date <= ?
        AND end_date >= ?
      ORDER BY start_date DESC
      LIMIT 1
      ${lockSql}
    `,
    [orgId, date, date],
  );

  return rows[0] || null;
}

/*
 * The fiscal year that STARTS on an exact date (Step 5 roll-forward).
 *
 * The receiving year of a close is defined by the brief as
 * `next.start_date = closed.end_date + 1 day`, so the lookup is by exact
 * start date rather than "the next year that begins after X": a gap between
 * two configured years must be reported as missing configuration instead of
 * silently rolling balances into a year that does not follow the closed one.
 */
async function findByStartDate(
  executor,
  {
    orgId,
    startDate,
    forUpdate = false,
    includeDeleted = true,
  },
) {
  const conditions = ['org_id = ?', 'start_date = ?'];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${FISCAL_YEAR_COLUMNS}
      FROM fiscal_years
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_id ASC
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [orgId, startDate],
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
      INSERT INTO fiscal_years (
        org_id,
        local_id,
        name,
        start_date,
        end_date,
        fiscal_status,
        note,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, 'open', ?, 1, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.name,
      data.start_date,
      data.end_date,
      data.note ?? null,
      userId,
      userId,
    ],
  );

  return findByLocalId(connection, { orgId, localId });
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
    name: 'name',
    start_date: 'start_date',
    end_date: 'end_date',
    note: 'note',
  };

  for (const [field, column] of Object.entries(columnMap)) {
    if (data[field] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(data[field]);
    }
  }

  if (sets.length === 0) {
    return findByLocalId(connection, { orgId, localId });
  }

  sets.push(
    'version = COALESCE(version, 0) + 1',
    'updated_by = ?',
    'updated_at = NOW(3)',
  );

  values.push(userId, orgId, localId);

  await connection.execute(
    `
      UPDATE fiscal_years
      SET ${sets.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

  return findByLocalId(connection, { orgId, localId });
}

/*
 * ------------------------------- summary ---------------------------------
 *
 * Every aggregate below is read-only and scoped to one organization and one
 * inclusive date window. Revenue-type documents count only CONFIRMED rows,
 * because a draft invoice is not a fiscal-year event yet.
 */

async function sumConfirmedSales(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total,
        SUM(COALESCE(benefit, 0)) AS benefit
      FROM sales
      WHERE org_id = ?
        AND status = 1
        AND invoice_status = 'confirmed'
        AND ${windowSql('invoice_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumConfirmedPurchases(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM purchases
      WHERE org_id = ?
        AND status = 1
        AND bill_status = 'confirmed'
        AND ${windowSql('bill_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumConfirmedSaleReturns(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM sale_returns
      WHERE org_id = ?
        AND status = 1
        AND return_status = 'confirmed'
        AND ${windowSql('return_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumConfirmedPurchaseReturns(
  executor,
  { orgId, startDate, endDate },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM purchase_returns
      WHERE org_id = ?
        AND status = 1
        AND return_status = 'confirmed'
        AND ${windowSql('return_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumConfirmedWastes(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM wastes
      WHERE org_id = ?
        AND status = 1
        AND waste_status = 'confirmed'
        AND ${windowSql('date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumCustomerPayments(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(amount, 0)) AS total
      FROM sale_payments
      WHERE org_id = ?
        AND status = 1
        AND ${windowSql('payment_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

async function sumSupplierPayments(executor, { orgId, startDate, endDate }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(amount, 0)) AS total
      FROM purchase_payments
      WHERE org_id = ?
        AND status = 1
        AND ${windowSql('payment_date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

/*
 * Journals touching one system account code (EXPENSES, TREASURY, ...),
 * split into the two entry positions and merged, exactly like
 * account.repository.findBalances does — but with a date window.
 */
async function sumJournalsForAccountCode(
  executor,
  {
    orgId,
    code,
    startDate,
    endDate,
  },
) {
  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          j.currency,
          COUNT(*) AS cnt,
          SUM(COALESCE(j.first_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.first_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.first_entry_account
        WHERE j.org_id = ?
          AND j.status = 1
          AND a.code = ?
          AND ${windowSql('j.date')}
        GROUP BY j.currency
      `,
      [orgId, code, startDate, endDate],
    ),
    executor.execute(
      `
        SELECT
          j.currency,
          COUNT(*) AS cnt,
          SUM(COALESCE(j.second_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.second_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.second_entry_account
        WHERE j.org_id = ?
          AND j.status = 1
          AND a.code = ?
          AND ${windowSql('j.date')}
        GROUP BY j.currency
      `,
      [orgId, code, startDate, endDate],
    ),
  ]);

  const merged = new Map();

  for (const row of [...(firstPass[0] || []), ...(secondPass[0] || [])]) {
    const key = row.currency || 'AFN';
    const existing = merged.get(key) || {
      currency: key,
      cnt: 0,
      debit: 0,
      credit: 0,
    };

    existing.cnt += Number(row.cnt) || 0;
    existing.debit += Number(row.debit) || 0;
    existing.credit += Number(row.credit) || 0;

    merged.set(key, existing);
  }

  return [...merged.values()];
}

/*
 * Owner (shareholder) accounts are the accounts of type 7 — the same bucket
 * the dashboard and the accounts report use. Money the owner puts in is a
 * credit on that account; money the owner takes out is a debit.
 */
async function sumOwnerAccounts(executor, { orgId, startDate, endDate }) {
  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          j.currency,
          COUNT(DISTINCT a.local_id) AS accounts,
          SUM(COALESCE(j.first_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.first_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.first_entry_account
        WHERE j.org_id = ?
          AND j.status = 1
          AND a.account_type_id = 7
          AND ${windowSql('j.date')}
        GROUP BY j.currency
      `,
      [orgId, startDate, endDate],
    ),
    executor.execute(
      `
        SELECT
          j.currency,
          COUNT(DISTINCT a.local_id) AS accounts,
          SUM(COALESCE(j.second_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.second_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.second_entry_account
        WHERE j.org_id = ?
          AND j.status = 1
          AND a.account_type_id = 7
          AND ${windowSql('j.date')}
        GROUP BY j.currency
      `,
      [orgId, startDate, endDate],
    ),
  ]);

  const merged = new Map();

  for (const row of [...(firstPass[0] || []), ...(secondPass[0] || [])]) {
    const key = row.currency || 'AFN';
    const existing = merged.get(key) || {
      currency: key,
      accounts: 0,
      debit: 0,
      credit: 0,
    };

    existing.accounts += Number(row.accounts) || 0;
    existing.debit += Number(row.debit) || 0;
    existing.credit += Number(row.credit) || 0;

    merged.set(key, existing);
  }

  return [...merged.values()];
}

/*
 * Opening balances are journals with reference_type 'account' created by
 * account.service.createInitialBalanceJournals against the NOTRACK account.
 * They are reported as a raw category because their journal date is the
 * creation time, not a user-entered accounting date — a fiscal-year closing
 * step has to treat them deliberately.
 */
async function sumOpeningBalanceJournals(
  executor,
  { orgId, startDate, endDate },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(
          COALESCE(first_entry_debit, 0)
          + COALESCE(second_entry_debit, 0)
        ) AS total
      FROM journals
      WHERE org_id = ?
        AND status = 1
        AND reference_type = 'account'
        AND ${windowSql('date')}
      GROUP BY currency
    `,
    [orgId, startDate, endDate],
  );

  return rows;
}

module.exports = {
  FISCAL_YEAR_COLUMNS,
  /*
   * Exported so the Step 4 closing engine can reuse the exact same
   * accounting-date window semantics instead of restating them.
   */
  windowSql,
  findAll,
  findByLocalId,
  findByStartDate,
  findOverlapping,
  findCoveringDate,
  lockOrganizationYears,
  create,
  update,
  sumConfirmedSales,
  sumConfirmedPurchases,
  sumConfirmedSaleReturns,
  sumConfirmedPurchaseReturns,
  sumConfirmedWastes,
  sumCustomerPayments,
  sumSupplierPayments,
  sumJournalsForAccountCode,
  sumOwnerAccounts,
  sumOpeningBalanceJournals,
};
