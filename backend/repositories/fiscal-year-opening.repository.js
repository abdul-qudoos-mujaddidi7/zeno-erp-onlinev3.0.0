/**
 * Fiscal-year OPENING BALANCE snapshots (Step 5).
 *
 * One row = "this account held this amount, in this currency, at the end of
 * that fiscal year, and it carries into the next one".
 *
 * Why a table instead of journals
 * -------------------------------
 * The historical journals of a closed year are NEVER deleted or soft-deleted,
 * so they still account for every balance-sheet amount. Posting an opening
 * journal on top of them would double-count the cash/bank/receivable/payable
 * balances. The snapshot is therefore a derived, auditable row that the
 * reporting layer adds to the RECEIVING year's own movement:
 *
 *   current-year balance = opening snapshot + movement inside that year
 *
 * Balance convention
 * ------------------
 * Signed like account.repository.findBalances: credit - debit. Positive = a
 * credit balance (cash after a receipt, a payable, owner capital), negative =
 * a debit balance (a receivable, an expense-like asset). `balance_side` says
 * the same thing in words for the UI.
 *
 * Date window
 * -----------
 * The closing balance of the source year is the account's balance from the
 * beginning of its journals up to and including its end_date:
 *
 *   SUM(credit - debit) WHERE COALESCE(j.date, j.created_at) < end + 1 day
 *
 * Computing it as "everything up to the end date" (rather than "this year's
 * movement") is what makes the roll-forward consistent year after year: the
 * FY2028 opening equals the FY2027 opening plus FY2027 movement, so no year
 * is ever counted twice and no year is ever lost.
 */

/**
 * Inclusive upper date bound with the application's accounting-date fallback:
 *
 *   COALESCE(<accounting day of the date column>, created_at) < end_date + 1 day
 *
 * Same rule as fiscal-year.repository.windowSql (which the Step 4 close uses),
 * but ONE-SIDED on purpose: the roll-forward needs every journal up to the end
 * of the closed year, not activity inside a range. The accounting day itself
 * comes from utils/accountingDaySql, so the roll-forward cannot read a stored
 * instant as a different day than the posting guard does.
 */
function upToDateSql(dateExpression) {
  return `${accountingDayOrCreatedAtSql(dateExpression)} < DATE_ADD(?, INTERVAL 1 DAY)`;
}

const {
  accountingDayOrCreatedAtSql,
} = require('../utils/accountingDaySql');

const OPENING_BALANCE_COLUMNS = `
  o.local_id AS id,
  o.local_id,
  o.fiscal_year_id,
  o.source_fiscal_year_id,
  o.account_id,
  o.currency,
  o.opening_balance,
  o.balance_side,
  o.source,
  o.note,
  o.status,
  COALESCE(o.version, 1) AS version,
  o.created_by,
  o.created_at,
  o.updated_at,
  a.code AS account_code,
  a.name AS account_name,
  a.currency AS account_currency,
  a.account_type_id,
  a.account_status
`;

/*
 * Signed period-end balance per account + currency, for every ACTIVE account
 * whose code is not excluded.
 *
 * `excludedCodes` is how the P&L accounts (SALES / PURCHASE / EXPENSES /
 * BENEFITS) stay out of the roll-forward: Step 4 already closed them to zero
 * through RETAINED, so carrying them forward would recreate the cost and
 * revenue of a finished year as if it were still open.
 *
 * Both entry positions are aggregated separately and merged, exactly like
 * account.repository.findBalances and the Step 4 closing query, because a
 * journal row stores two entry positions and one account may appear in either.
 *
 * Zero balances are dropped in SQL: a snapshot of 0 is noise, and the brief
 * requires that a roll-forward never creates meaningless rows.
 */
async function findPeriodEndAccountBalances(
  executor,
  {
    orgId,
    endDate,
    excludedCodes = [],
  },
) {
  const placeholders = excludedCodes.map(() => '?').join(', ');

  /*
   * NOTE: no leading AND here. Every entry of `conditions` is joined with
   * " AND " below, so a fragment that brings its own AND produces
   * "AND AND ..." and the server rejects the whole statement. The Step 4
   * closing query builds its clauses the same way — keep fragments bare.
   */
  const exclusion = excludedCodes.length
    ? `UPPER(a.code) NOT IN (${placeholders})`
    : '';

  const conditions = [
    'j.org_id = ?',
    'j.status = 1',
    'a.org_id = j.org_id',
    'a.status = 1',
    exclusion,
    upToDateSql('j.date'),
  ]
    .filter(Boolean)
    .join('\n        AND ');

  const values = [orgId, ...excludedCodes, endDate];

  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          a.local_id AS account_id,
          a.code AS account_code,
          a.name AS account_name,
          a.currency AS account_currency,
          a.account_type_id,
          j.currency AS currency,
          COUNT(*) AS entries,
          SUM(COALESCE(j.first_entry_credit, 0)) AS credit,
          SUM(COALESCE(j.first_entry_debit, 0)) AS debit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.first_entry_account
        WHERE ${conditions}
        GROUP BY
          a.local_id,
          a.code,
          a.name,
          a.currency,
          a.account_type_id,
          j.currency
      `,
      values,
    ),
    executor.execute(
      `
        SELECT
          a.local_id AS account_id,
          a.code AS account_code,
          a.name AS account_name,
          a.currency AS account_currency,
          a.account_type_id,
          j.currency AS currency,
          COUNT(*) AS entries,
          SUM(COALESCE(j.second_entry_credit, 0)) AS credit,
          SUM(COALESCE(j.second_entry_debit, 0)) AS debit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.second_entry_account
        WHERE ${conditions}
        GROUP BY
          a.local_id,
          a.code,
          a.name,
          a.currency,
          a.account_type_id,
          j.currency
      `,
      values,
    ),
  ]);

  const merged = new Map();

  for (const row of [...(firstPass[0] || []), ...(secondPass[0] || [])]) {
    const currency = normalizeCurrency(row.currency);
    const key = `${row.account_id}|${currency}`;

    const existing = merged.get(key) || {
      account_id: row.account_id,
      account_code: row.account_code || null,
      account_name: row.account_name || null,
      account_currency: normalizeCurrency(row.account_currency),
      account_type_id: row.account_type_id ?? null,
      currency,
      entries: 0,
      credit: 0,
      debit: 0,
    };

    existing.entries += Number(row.entries) || 0;
    existing.credit += Number(row.credit) || 0;
    existing.debit += Number(row.debit) || 0;

    merged.set(key, existing);
  }

  return [...merged.values()].sort((left, right) => {
    const leftCode = String(left.account_code || '');
    const rightCode = String(right.account_code || '');

    if (leftCode !== rightCode) {
      return leftCode < rightCode ? -1 : 1;
    }

    if (String(left.account_id) !== String(right.account_id)) {
      return String(left.account_id) < String(right.account_id) ? -1 : 1;
    }

    return left.currency < right.currency ? -1 : left.currency > right.currency ? 1 : 0;
  });
}

/*
 * Currency is stored as '' when absent so that the unique key can actually
 * enforce "one active snapshot per account + currency". NULL would be treated
 * as distinct by MySQL and would silently allow duplicates.
 */
function normalizeCurrency(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

/** Reverse of normalizeCurrency, for API responses. */
function toApiCurrency(value) {
  const text = normalizeCurrency(value);

  return text === '' ? null : text;
}

async function findByLocalId(executor, { orgId, localId }) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${OPENING_BALANCE_COLUMNS}
      FROM fiscal_year_opening_balances o
      INNER JOIN accounts a
        ON a.org_id = o.org_id
       AND a.local_id = o.account_id
      WHERE o.org_id = ?
        AND o.local_id = ?
      LIMIT 1
    `,
    [orgId, localId],
  );

  return rows[0] || null;
}

/**
 * Active, NOT-YET-gone snapshots. `includeInactive` is only used by the audit
 * view of a reopened year, so an operator can still see the generations that
 * were voided.
 */
async function findAll(
  executor,
  {
    orgId,
    fiscalYearId = null,
    sourceFiscalYearId = null,
    source = null,
    includeInactive = false,
    forUpdate = false,
  } = {},
) {
  const conditions = ['o.org_id = ?'];
  const values = [orgId];

  if (fiscalYearId !== null && fiscalYearId !== undefined) {
    conditions.push('o.fiscal_year_id = ?');
    values.push(fiscalYearId);
  }

  if (sourceFiscalYearId !== null && sourceFiscalYearId !== undefined) {
    conditions.push('o.source_fiscal_year_id = ?');
    values.push(sourceFiscalYearId);
  }

  if (source) {
    conditions.push('o.source = ?');
    values.push(source);
  }

  if (!includeInactive) {
    conditions.push('o.status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${OPENING_BALANCE_COLUMNS}
      FROM fiscal_year_opening_balances o
      INNER JOIN accounts a
        ON a.org_id = o.org_id
       AND a.local_id = o.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        o.fiscal_year_id ASC,
        a.code ASC,
        o.account_id ASC,
        o.currency ASC,
        o.local_id ASC
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    values,
  );

  return rows;
}

/**
 * Writes one snapshot row. Plain INSERT: the unique key
 * (org, receiving year, account, currency, source) is the last line of defence
 * against a duplicated roll-forward, and a collision is reported instead of
 * silently overwriting an existing opening balance.
 */
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
      INSERT INTO fiscal_year_opening_balances (
        org_id,
        local_id,
        fiscal_year_id,
        source_fiscal_year_id,
        account_id,
        currency,
        opening_balance,
        balance_side,
        source,
        note,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, NOW(3), NOW(3))
    `,
    [
      orgId,
      localId,
      data.fiscal_year_id,
      data.source_fiscal_year_id ?? null,
      data.account_id,
      normalizeCurrency(data.currency),
      data.opening_balance,
      data.balance_side,
      data.source,
      data.note ?? null,
      userId,
      userId,
    ],
  );

  return findByLocalId(connection, { orgId, localId });
}

/**
 * Deactivates every ACTIVE snapshot a close produced for one receiving year.
 *
 * Used by reopen: the source year stops being closed, so the opening balances
 * it pushed into the next year must stop being active. The rows are kept
 * (status = 0) as audit history — the unique key ignores inactive rows, so the
 * next close can write a fresh generation without touching them.
 *
 * Returns the affected row count.
 */
async function deactivateBySourceYear(
  connection,
  {
    orgId,
    sourceFiscalYearId,
    userId,
    note = null,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE fiscal_year_opening_balances
      SET
        status = 0,
        note = COALESCE(?, note),
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND source_fiscal_year_id = ?
        AND status = 1
    `,
    [note, userId, orgId, sourceFiscalYearId],
  );

  return result.affectedRows;
}

module.exports = {
  upToDateSql,
  findPeriodEndAccountBalances,
  findAll,
  findByLocalId,
  create,
  deactivateBySourceYear,
  normalizeCurrency,
  toApiCurrency,
};
