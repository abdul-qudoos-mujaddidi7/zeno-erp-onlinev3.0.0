/**
 * Fiscal-year CLOSING reads/writes (Step 4).
 *
 * This module is the only place that touches the `journals` table on behalf
 * of the closing engine, and it adds nothing to the schema: the closing entry
 * is an ordinary balanced journal row identified by
 *
 *   reference_type = 'fiscal_year_close'
 *   reference_id   = <fiscal year local_id>
 *
 * Accounting-date semantics are shared with the fiscal-year summary through
 * `windowSql` from fiscal-year.repository.js, so a period is always
 * `COALESCE(j.date, j.created_at)` inside the inclusive
 * [start_date, end_date] window. `j.date` (not created_at) is what decides
 * which year a journal belongs to; created_at stays the audit timestamp.
 *
 * Everything here is read-only except `lockOrganization` (a row lock) and
 * `markClosed` (the fiscal-year status flip).
 */

const {
  windowSql,
} = require('./fiscal-year.repository');

/*
 * Serializes concurrent closes of the same organization.
 *
 * Fiscal years of one organization may not overlap, and closing is a rare
 * administrative action, so taking the organization row first gives the
 * closing engine a single well-defined lock order:
 *
 *   organizations -> fiscal_years -> journals/accounts
 *
 * Two concurrent closes therefore queue instead of interleaving, and no
 * deadlock can be created by a second closing implementation ordering the
 * same rows differently.
 */
async function lockOrganization(connection, { orgId }) {
  const [rows] = await connection.execute(
    `
      SELECT id
      FROM organizations
      WHERE id = ?
      FOR UPDATE
    `,
    [orgId],
  );

  return rows[0] || null;
}

function closingJournalColumns() {
  return `
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
    version,
    created_at
  `;
}

/*
 * Closing journals that are still ACTIVE for a fiscal year. Used twice:
 *
 *   1. as the idempotency guard before a close (a year that already has an
 *      active closing entry can never be closed a second time), and
 *   2. as the audit trail returned to the caller / preview.
 *
 * Soft-deleted rows are ignored, so a future, explicitly approved reopen
 * workflow could invalidate a close without this guard blocking the retry.
 */
async function findClosingJournals(
  executor,
  {
    orgId,
    referenceType,
    referenceId,
    forUpdate = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${closingJournalColumns()}
      FROM journals
      WHERE org_id = ?
        AND reference_type = ?
        AND reference_id = ?
        AND status = 1
      ORDER BY local_id ASC
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [orgId, referenceType, referenceId],
  );

  return rows;
}

/*
 * ACTIVE closing journals whose fiscal year no longer exists.
 *
 * A closing entry is identified by `reference_type = 'fiscal_year_close'` plus
 * `reference_id = <fiscal year local_id>`, and nothing enforces that the year
 * is still there. When a fiscal-year row disappears (outside the API: an older
 * build, a manual SQL edit) the closing entry stays ACTIVE, keeps offsetting
 * the P&L accounts and keeps its profit in RETAINED, while the date range it
 * belongs to is no longer covered by any fiscal year — so the period silently
 * reopens and the next close would compute a period result on top of a phantom
 * closing entry.
 *
 * This read is how the close engine DETECTS that instead of silently
 * compounding it. Nothing here is repaired: the rows are reported.
 */
async function findOrphanClosingJournals(
  executor,
  {
    orgId,
    referenceType,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        j.local_id AS id,
        j.local_id,
        j.reference_id,
        j.currency,
        j.date,
        j.description,
        j.created_at
      FROM journals j
      LEFT JOIN fiscal_years f
        ON f.org_id = j.org_id
       AND f.local_id = j.reference_id
      WHERE j.org_id = ?
        AND j.status = 1
        AND j.reference_type = ?
        AND f.local_id IS NULL
      ORDER BY j.local_id ASC
    `,
    [orgId, referenceType],
  );

  return rows;
}

/*
 * ACTIVE opening balances that no longer have a valid CLOSED source year.
 *
 * The receiving year's own guard rejects a second roll-forward with
 * OPENING_BALANCES_ALREADY_EXIST and tells the operator to "reopen the year
 * that produced them" — an instruction that cannot be followed when that year
 * no longer exists. Reporting that case separately is what turns a dead end
 * into an actionable business error.
 */
async function findOrphanOpeningBalances(
  executor,
  {
    orgId,
    source,
    fiscalYearId = null,
  },
) {
  const conditions = [
    'o.org_id = ?',
    'o.status = 1',
    'o.source = ?',
    "(s.local_id IS NULL OR s.status <> 1 OR LOWER(COALESCE(s.fiscal_status, '')) <> 'closed')",
  ];

  const values = [orgId, source];

  if (fiscalYearId !== null && fiscalYearId !== undefined) {
    conditions.push('o.fiscal_year_id = ?');
    values.push(fiscalYearId);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        o.local_id AS id,
        o.local_id,
        o.fiscal_year_id,
        o.source_fiscal_year_id,
        o.account_id,
        o.currency,
        o.opening_balance,
        o.balance_side,
        o.note,
        s.local_id AS source_found,
        s.fiscal_status AS source_status
      FROM fiscal_year_opening_balances o
      LEFT JOIN fiscal_years s
        ON s.org_id = o.org_id
       AND s.local_id = o.source_fiscal_year_id
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY o.local_id ASC
    `,
    values,
  );

  return rows;
}

/*
 * Net activity of the given account codes inside one inclusive period.
 *
 * A journal row has exactly two entry positions, so each row contributes to
 * whichever position holds one of the codes. Both positions are aggregated
 * separately and merged, exactly like account.repository.findBalances and
 * fiscal-year.repository.sumJournalsForAccountCode do.
 *
 * `excludeReferenceType`/`excludeReferenceId` skip the fiscal year's own
 * closing journals: without that, a re-run of the close calculation (or a
 * preview of an already closed year) would see the closing entry as further
 * period activity and produce a zero-by-construction plan.
 *
 * Debit/credit stay raw (as MySQL returns them). Rounding and sign decisions
 * belong to the service, in one place.
 */
async function sumPeriodAccountActivity(
  executor,
  {
    orgId,
    startDate,
    endDate,
    codes,
    excludeReferenceType = null,
    excludeReferenceId = null,
  },
) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return [];
  }

  const placeholders = codes.map(() => '?').join(', ');

  const conditions = [
    'j.org_id = ?',
    'j.status = 1',
    `a.code IN (${placeholders})`,
    windowSql('j.date'),
  ];

  const values = [orgId, ...codes, startDate, endDate];

  if (
    excludeReferenceType &&
    excludeReferenceId !== null &&
    excludeReferenceId !== undefined
  ) {
    conditions.push(
      `NOT (j.reference_type = ? AND j.reference_id = ?)`,
    );

    values.push(
      excludeReferenceType,
      excludeReferenceId,
    );
  }

  const where = conditions.join('\n          AND ');

  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          a.code AS account_code,
          a.local_id AS account_local_id,
          a.name AS account_name,
          a.currency AS account_currency,
          j.currency AS currency,
          COUNT(*) AS entries,
          SUM(COALESCE(j.first_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.first_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.first_entry_account
        WHERE ${where}
        GROUP BY
          a.code,
          a.local_id,
          a.name,
          a.currency,
          j.currency
      `,
      values,
    ),
    executor.execute(
      `
        SELECT
          a.code AS account_code,
          a.local_id AS account_local_id,
          a.name AS account_name,
          a.currency AS account_currency,
          j.currency AS currency,
          COUNT(*) AS entries,
          SUM(COALESCE(j.second_entry_debit, 0)) AS debit,
          SUM(COALESCE(j.second_entry_credit, 0)) AS credit
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.second_entry_account
        WHERE ${where}
        GROUP BY
          a.code,
          a.local_id,
          a.name,
          a.currency,
          j.currency
      `,
      values,
    ),
  ]);

  const merged = new Map();

  for (const row of [...(firstPass[0] || []), ...(secondPass[0] || [])]) {
    const code = String(row.account_code || '').trim().toUpperCase();
    const currency = row.currency || null;

    /*
     * Keyed by account as well as code: accounts has no unique index on
     * (org_id, code), so two accounts sharing a system code must be closed
     * separately instead of being silently merged into one balance.
     */
    const key = `${code}::${row.account_local_id}::${currency || ''}`;

    const existing = merged.get(key) || {
      account_code: code,
      account_local_id: row.account_local_id,
      account_name: row.account_name || null,
      account_currency: row.account_currency || null,
      currency,
      entries: 0,
      debit: 0,
      credit: 0,
    };

    existing.entries += Number(row.entries) || 0;
    existing.debit += Number(row.debit) || 0;
    existing.credit += Number(row.credit) || 0;

    merged.set(key, existing);
  }

  return [...merged.values()].sort((left, right) => {
    if (left.account_code !== right.account_code) {
      return left.account_code < right.account_code ? -1 : 1;
    }

    if (String(left.account_local_id) !== String(right.account_local_id)) {
      return String(left.account_local_id) < String(right.account_local_id) ? -1 : 1;
    }

    const leftCurrency = left.currency || '';
    const rightCurrency = right.currency || '';

    return leftCurrency < rightCurrency ? -1 : leftCurrency > rightCurrency ? 1 : 0;
  });
}

/*
 * The account type used to host the RETAINED account.
 *
 * account_types is per organization and there is no Equity type in this
 * application, so the host type is resolved from the organization's own data
 * instead of a hard-coded global id:
 *
 *   1. whatever type the organization's own system accounts use (ASSETS,
 *      then TREASURY) — the same bucket every other balance-sheet system
 *      account lives in, and
 *   2. otherwise the organization's lowest active account type.
 *
 * Returns null when the organization has no account types at all; the RETAINED
 * account is still created (account_type_id is nullable) and the caller
 * reports the fallback.
 */
async function findPreferredAccountTypeId(executor, { orgId }) {
  const [rows] = await executor.execute(
    `
      SELECT
        account_type_id,
        code
      FROM accounts
      WHERE org_id = ?
        AND status = 1
        AND account_type_id IS NOT NULL
        AND code IN ('ASSETS', 'TREASURY')
      ORDER BY FIELD(code, 'ASSETS', 'TREASURY') ASC
      LIMIT 1
    `,
    [orgId],
  );

  if (rows[0]?.account_type_id !== undefined && rows[0]?.account_type_id !== null) {
    return Number(rows[0].account_type_id);
  }

  const [types] = await executor.execute(
    `
      SELECT
        local_id
      FROM account_types
      WHERE org_id = ?
        AND status = 1
      ORDER BY local_id ASC
      LIMIT 1
    `,
    [orgId],
  );

  if (types[0]?.local_id === undefined || types[0]?.local_id === null) {
    return null;
  }

  return Number(types[0].local_id);
}

/*
 * Flips OPEN -> CLOSED for exactly one fiscal year of one organization.
 *
 * The `fiscal_status = 'open'` predicate makes the transition itself the
 * idempotency guard: a second close request (even one that slipped past the
 * service-level check) updates zero rows and cannot create a duplicate
 * closing entry. Returns the affected row count; 0 means "already closed".
 */
async function markClosed(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE fiscal_years
      SET
        fiscal_status = 'closed',
        closed_at = NOW(3),
        closed_by = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
        AND fiscal_status = 'open'
    `,
    [userId, userId, orgId, localId],
  );

  return result.affectedRows;
}

/*
 * Flips CLOSED -> OPEN for exactly one fiscal year of one organization
 * (Step 5 reopen).
 *
 * Mirrors `markClosed`: the `fiscal_status = 'closed'` predicate makes the
 * transition itself the concurrency guard, so two simultaneous reopen
 * requests can affect at most one row. `closed_at` / `closed_by` are cleared
 * because the year is open again — they describe a state that no longer
 * holds — while both values remain in the activity log written by the service.
 *
 * Returns the affected row count; 0 means "was not closed".
 */
async function markReopened(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE fiscal_years
      SET
        fiscal_status = 'open',
        closed_at = NULL,
        closed_by = NULL,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
        AND fiscal_status = 'closed'
    `,
    [userId, orgId, localId],
  );

  return result.affectedRows;
}

module.exports = {
  lockOrganization,
  findClosingJournals,
  findOrphanClosingJournals,
  findOrphanOpeningBalances,
  sumPeriodAccountActivity,
  findPreferredAccountTypeId,
  markClosed,
  markReopened,
};
