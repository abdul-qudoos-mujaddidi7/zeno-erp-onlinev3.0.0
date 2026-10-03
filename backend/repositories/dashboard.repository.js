/**
 * Dashboard aggregates — SQL SUMs/COUNTs instead of shipping
 * full sales/purchase/journal row sets to the browser.
 * Intentionally avoids relying on new journal indexes.
 */

async function findExpensesAccountId(executor, orgId) {
  const [rows] = await executor.execute(
    `
      SELECT local_id
      FROM accounts
      WHERE org_id = ?
        AND code = 'EXPENSES'
        AND status = 1
      LIMIT 1
    `,
    [orgId],
  );

  return rows[0]?.local_id ?? null;
}

async function sumSales(executor, { orgId, dateFrom, dateTo }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total,
        SUM(
          CASE
            WHEN invoice_status = 'confirmed'
              THEN COALESCE(benefit, 0)
            ELSE 0
          END
        ) AS benefit
      FROM sales
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(invoice_date, created_at) >= ?
        AND COALESCE(invoice_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function sumPurchases(executor, { orgId, dateFrom, dateTo }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM purchases
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(bill_date, created_at) >= ?
        AND COALESCE(bill_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function sumSaleReturns(executor, { orgId, dateFrom, dateTo }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM sale_returns
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(return_date, created_at) >= ?
        AND COALESCE(return_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function sumPurchaseReturns(executor, { orgId, dateFrom, dateTo }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM purchase_returns
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(return_date, created_at) >= ?
        AND COALESCE(return_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function sumWastes(executor, { orgId, dateFrom, dateTo }) {
  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        COUNT(*) AS cnt,
        SUM(COALESCE(total_amount, 0)) AS total
      FROM wastes
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(date, created_at) >= ?
        AND COALESCE(date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function sumExpenses(
  executor,
  {
    orgId,
    expensesAccountId,
    dateFrom,
    dateTo,
  },
) {
  if (!expensesAccountId) return [];

  const [rows] = await executor.execute(
    `
      SELECT
        currency,
        SUM(
          CASE
            WHEN first_entry_account = ?
              THEN COALESCE(first_entry_debit, 0) - COALESCE(first_entry_credit, 0)
            ELSE 0
          END
          + CASE
            WHEN second_entry_account = ?
              THEN COALESCE(second_entry_debit, 0) - COALESCE(second_entry_credit, 0)
            ELSE 0
          END
        ) AS total
      FROM journals
      WHERE org_id = ?
        AND status = 1
        AND (
          first_entry_account = ?
          OR second_entry_account = ?
        )
        AND COALESCE(date, created_at) >= ?
        AND COALESCE(date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY currency
    `,
    [
      expensesAccountId,
      expensesAccountId,
      orgId,
      expensesAccountId,
      expensesAccountId,
      dateFrom,
      dateTo,
    ],
  );

  return rows;
}

async function topProducts(executor, { orgId, dateFrom, dateTo, limit = 40 }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 40, 1), 200);

  const [rows] = await executor.execute(
    `
      SELECT
        si.product_id,
        si.currency,
        SUM(COALESCE(si.quantity, 0)) AS qty,
        SUM(COALESCE(si.subtotal, 0)) AS rev,
        MAX(p.name) AS name,
        MAX(p.code) AS code
      FROM sale_items si
      INNER JOIN sales s
        ON s.org_id = si.org_id
        AND s.local_id = si.sale_id
        AND s.status = 1
      LEFT JOIN products p
        ON p.org_id = si.org_id
        AND p.local_id = si.product_id
      WHERE si.org_id = ?
        AND si.status = 1
        AND COALESCE(s.invoice_date, s.created_at) >= ?
        AND COALESCE(s.invoice_date, s.created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY si.product_id, si.currency
      ORDER BY rev DESC
      LIMIT ${safeLimit}
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function trendBenefit(
  executor,
  {
    orgId,
    dateFrom,
    dateTo,
    granularity,
  },
) {
  const bucketExpr =
    granularity === 'hour'
      ? `DATE_FORMAT(COALESCE(invoice_date, created_at), '%Y-%m-%dT%H:00:00')`
      : granularity === 'month'
        ? `DATE_FORMAT(COALESCE(invoice_date, created_at), '%Y-%m-01T00:00:00')`
        : `DATE_FORMAT(COALESCE(invoice_date, created_at), '%Y-%m-%dT00:00:00')`;

  const [rows] = await executor.execute(
    `
      SELECT
        ${bucketExpr} AS bucket,
        currency,
        SUM(COALESCE(benefit, 0)) AS amount
      FROM sales
      WHERE org_id = ?
        AND status = 1
        AND invoice_status = 'confirmed'
        AND COALESCE(invoice_date, created_at) >= ?
        AND COALESCE(invoice_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY bucket, currency
      ORDER BY bucket ASC
    `,
    [orgId, dateFrom, dateTo],
  );

  return rows;
}

async function trendExpenses(
  executor,
  {
    orgId,
    expensesAccountId,
    dateFrom,
    dateTo,
    granularity,
  },
) {
  if (!expensesAccountId) return [];

  const bucketExpr =
    granularity === 'hour'
      ? `DATE_FORMAT(COALESCE(date, created_at), '%Y-%m-%dT%H:00:00')`
      : granularity === 'month'
        ? `DATE_FORMAT(COALESCE(date, created_at), '%Y-%m-01T00:00:00')`
        : `DATE_FORMAT(COALESCE(date, created_at), '%Y-%m-%dT00:00:00')`;

  const [rows] = await executor.execute(
    `
      SELECT
        ${bucketExpr} AS bucket,
        currency,
        SUM(
          CASE
            WHEN first_entry_account = ?
              THEN COALESCE(first_entry_debit, 0) - COALESCE(first_entry_credit, 0)
            ELSE 0
          END
          + CASE
            WHEN second_entry_account = ?
              THEN COALESCE(second_entry_debit, 0) - COALESCE(second_entry_credit, 0)
            ELSE 0
          END
        ) AS amount
      FROM journals
      WHERE org_id = ?
        AND status = 1
        AND (
          first_entry_account = ?
          OR second_entry_account = ?
        )
        AND COALESCE(date, created_at) >= ?
        AND COALESCE(date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)
      GROUP BY bucket, currency
      ORDER BY bucket ASC
    `,
    [
      expensesAccountId,
      expensesAccountId,
      orgId,
      expensesAccountId,
      expensesAccountId,
      dateFrom,
      dateTo,
    ],
  );

  return rows;
}

async function findInventoryValueByCurrency(executor, orgId) {
  const [rows] = await executor.execute(
    `
      SELECT
        p.buy_currency AS currency,
        SUM(
          COALESCE(p.buy_price, 0) * COALESCE(q.qty, 0) * -1
        ) AS amount
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          SUM(COALESCE(quantity, 0)) AS qty
        FROM warehouse_products
        WHERE org_id = ?
          AND status = 1
        GROUP BY product_id
      ) q ON q.product_id = p.local_id
      WHERE p.org_id = ?
        AND p.status = 1
      GROUP BY p.buy_currency
    `,
    [orgId, orgId],
  );

  return rows;
}

async function findInventoryValuation(executor, orgId) {
  const [buyRows, sellRows, qtyRows] = await Promise.all([
    executor.execute(
      `
        SELECT
          p.buy_currency AS currency,
          SUM(
            COALESCE(p.buy_price, 0) * COALESCE(q.qty, 0) * -1
          ) AS amount
        FROM products p
        LEFT JOIN (
          SELECT
            product_id,
            SUM(COALESCE(quantity, 0)) AS qty
          FROM warehouse_products
          WHERE org_id = ?
            AND status = 1
          GROUP BY product_id
        ) q ON q.product_id = p.local_id
        WHERE p.org_id = ?
          AND p.status = 1
        GROUP BY p.buy_currency
      `,
      [orgId, orgId],
    ),
    executor.execute(
      `
        SELECT
          p.sell_currency AS currency,
          SUM(
            COALESCE(p.sell_price, 0) * COALESCE(q.qty, 0)
          ) AS amount
        FROM products p
        LEFT JOIN (
          SELECT
            product_id,
            SUM(COALESCE(quantity, 0)) AS qty
          FROM warehouse_products
          WHERE org_id = ?
            AND status = 1
          GROUP BY product_id
        ) q ON q.product_id = p.local_id
        WHERE p.org_id = ?
          AND p.status = 1
        GROUP BY p.sell_currency
      `,
      [orgId, orgId],
    ),
    executor.execute(
      `
        SELECT
          SUM(COALESCE(quantity, 0)) AS total_quantity
        FROM warehouse_products
        WHERE org_id = ?
          AND status = 1
      `,
      [orgId],
    ),
  ]);

  const buyByCurrency = {};
  for (const row of buyRows[0] || []) {
    const currency = row.currency || 'AFN';
    buyByCurrency[currency] =
      (buyByCurrency[currency] || 0) + (Number(row.amount) || 0);
  }

  const sellByCurrency = {};
  for (const row of sellRows[0] || []) {
    const currency = row.currency || 'AFN';
    sellByCurrency[currency] =
      (sellByCurrency[currency] || 0) + (Number(row.amount) || 0);
  }

  return {
    buy_by_currency: buyByCurrency,
    sell_by_currency: sellByCurrency,
    total_quantity: Number(qtyRows[0]?.[0]?.total_quantity) || 0,
  };
}

async function findLowStockProducts(executor, orgId, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const [rows] = await executor.execute(
    `
      SELECT
        local_id AS id,
        name,
        code,
        quantity,
        alarm_quantity,
        expiry_date,
        alarm_expiry_days,
        COUNT(*) OVER() AS total_count
      FROM products
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(alarm_quantity, 0) > 0
        AND COALESCE(quantity, 0) <= COALESCE(alarm_quantity, 0)
      ORDER BY quantity ASC, local_id ASC
      LIMIT ${safeLimit}
    `,
    [orgId],
  );

  return rows;
}

async function findExpiringProducts(executor, orgId, limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const [rows] = await executor.execute(
    `
      SELECT
        local_id AS id,
        name,
        code,
        quantity,
        alarm_quantity,
        expiry_date,
        alarm_expiry_days,
        DATEDIFF(expiry_date, CURDATE()) AS remaining_days,
        COUNT(*) OVER() AS total_count
      FROM products
      WHERE org_id = ?
        AND status = 1
        AND expiry_date IS NOT NULL
        AND DATEDIFF(expiry_date, CURDATE()) <= COALESCE(alarm_expiry_days, 30)
      ORDER BY expiry_date ASC, local_id ASC
      LIMIT ${safeLimit}
    `,
    [orgId],
  );

  return rows;
}

async function findBenefitAccounts(executor, orgId) {
  const [rows] = await executor.execute(
    `
      SELECT
        local_id AS id,
        code,
        account_type_id
      FROM accounts
      WHERE org_id = ?
        AND status = 1
        AND (
          code = 'TREASURY'
          OR account_type_id IN (3, 4, 7)
        )
    `,
    [orgId],
  );

  return rows;
}

/**
 * Shared journal aggregation for the dashboard overview.
 *
 * The original overview queries each scanned the org's journals TWICE
 * (UNION ALL of the first/second entry sides) and joined accounts plus
 * account_types on every one of those rows. This helper instead lets SQL
 * sum each side once per (account, currency, reference_type) — a few hundred
 * small rows — while the two sides run in PARALLEL on the pool, and the
 * account/type metadata is loaded once and shared by every consumer.
 *
 * `executor` must be the connection pool (not a single transaction
 * connection) because the two side queries run concurrently.
 */
async function loadJournalSideTotals(executor, orgId) {
  const sideSql = (side) => `
    SELECT ${side}_entry_account AS account_id, currency, reference_type,
      SUM(COALESCE(${side}_entry_credit, 0)) AS credit,
      SUM(COALESCE(${side}_entry_debit, 0)) AS debit
    FROM journals
    WHERE org_id = ? AND status = 1
    GROUP BY ${side}_entry_account, currency, reference_type`;

  const [firstSide, secondSide] = await Promise.all([
    executor.execute(sideSql('first'), [orgId]),
    executor.execute(sideSql('second'), [orgId]),
  ]);

  return { first: firstSide[0], second: secondSide[0] };
}

/**
 * Active accounts plus the account-type flags the bucket classification and
 * debtor ranking need. Tiny result — one row per active account/type.
 */
async function loadAccountMeta(executor, orgId) {
  const [accountRows, typeRows] = await Promise.all([
    executor.execute(
      `SELECT local_id, name, code, account_type_id
         FROM accounts
        WHERE org_id = ? AND status = 1`,
      [orgId],
    ),
    executor.execute(
      `SELECT local_id, can_be_customer, can_be_supplier
         FROM account_types
        WHERE org_id = ? AND status = 1`,
      [orgId],
    ),
  ]);

  return { accounts: accountRows[0], types: typeRows[0] };
}

function buildAccountIndex(accountMeta) {
  const accounts = new Map();
  for (const account of accountMeta.accounts || []) {
    accounts.set(Number(account.local_id), account);
  }

  const types = new Map();
  for (const type of accountMeta.types || []) {
    types.set(Number(type.local_id), type);
  }

  return { accounts, types };
}

/*
 * Mirrors the original SQL CASE exactly:
 *   1. code = 'TREASURY'            -> treasury
 *   2. account_type_id = 7          -> shareholder
 *   3. sale-side references AND
 *      (type 4 OR can_be_customer)  -> customer
 *   4. purchase-side references AND
 *      (type 3 OR can_be_supplier)  -> supplier
 *   5. everything else              -> dropped (bucket IS NULL)
 *
 * MySQL compares account codes case-insensitively under its default
 * collation, so the TREASURY check is case-insensitive too. A missing or
 * inactive account_types row behaves like COALESCE(at.can_be_*, 0).
 */
function classifyAccountEntry(account, type, referenceType) {
  if (String(account.code || '').toUpperCase() === 'TREASURY') return 'treasury';
  if (Number(account.account_type_id) === 7) return 'shareholder';

  const reference = String(referenceType || '');
  const canBeCustomer = Number(type?.can_be_customer) === 1;
  const canBeSupplier = Number(type?.can_be_supplier) === 1;

  if (
    ['sale', 'sale_payment', 'sale_return'].includes(reference) &&
    (Number(account.account_type_id) === 4 || canBeCustomer)
  ) {
    return 'customer';
  }

  if (
    ['purchase', 'purchase_payment', 'purchase_return'].includes(reference) &&
    (Number(account.account_type_id) === 3 || canBeSupplier)
  ) {
    return 'supplier';
  }

  return null;
}

/**
 * Net-position balances for the dashboard overview, computed from the shared
 * per-side totals. Same rows as the original GROUP BY bucket, currency:
 * SUM(credit - debit) per bucket/currency, with a NULL currency rendered as
 * 'AFN'. Row order is irrelevant to the only consumer (the service builds
 * currency maps from it).
 */
function classifyBenefitBuckets(sideTotals, accountMeta) {
  const { accounts, types } = buildAccountIndex(accountMeta);
  const balances = new Map();

  for (const side of ['first', 'second']) {
    for (const row of sideTotals[side] || []) {
      const account = accounts.get(Number(row.account_id));
      if (!account) continue; // the original INNER JOIN dropped these

      const bucket = classifyAccountEntry(
        account,
        types.get(Number(account.account_type_id)) || null,
        row.reference_type,
      );
      if (!bucket) continue;

      const currency = row.currency || 'AFN';
      const key = `${bucket}|${currency}`;
      const entry = balances.get(key) || { bucket, currency, balance: 0 };
      entry.balance += Number(row.credit) - Number(row.debit);
      balances.set(key, entry);
    }
  }

  return [...balances.values()];
}

/**
 * Customers who still owe money, one row per account and currency — same
 * semantics as the original query: every active journal entry on the account
 * (not just sale references, so manual adjustments stay included),
 * receivable = debit - credit, HAVING receivable > 0, ORDER BY receivable
 * DESC. Ties are broken deterministically by account and currency where the
 * original left tie order to the optimizer.
 */
function rankDebtors(sideTotals, accountMeta) {
  const { accounts, types } = buildAccountIndex(accountMeta);
  const receivables = new Map();

  for (const side of ['first', 'second']) {
    for (const row of sideTotals[side] || []) {
      const account = accounts.get(Number(row.account_id));
      if (!account) continue;

      const type = types.get(Number(account.account_type_id)) || null;
      const isCustomer =
        Number(account.account_type_id) === 4 || Number(type?.can_be_customer) === 1;
      if (!isCustomer) continue;

      const accountId = Number(account.local_id);
      const currency = row.currency || 'AFN';
      const key = `${accountId}|${currency}`;
      const entry = receivables.get(key) || {
        account_id: accountId,
        name: account.name || '',
        code: account.code || '',
        currency,
        receivable: 0,
      };
      entry.receivable += Number(row.debit) - Number(row.credit);
      receivables.set(key, entry);
    }
  }

  return [...receivables.values()]
    .filter((row) => row.receivable > 0)
    .sort(
      (a, b) =>
        b.receivable - a.receivable ||
        a.account_id - b.account_id ||
        String(a.currency).localeCompare(String(b.currency)),
    );
}

/**
 * Backward-compatible wrapper: loads the shared aggregates itself and
 * classifies them. The dashboard service uses loadJournalSideTotals directly
 * so the bucket and debtor views share ONE pair of scans instead of four.
 */
async function sumBenefitBalancesByBucket(executor, orgId) {
  const [sideTotals, accountMeta] = await Promise.all([
    loadJournalSideTotals(executor, orgId),
    loadAccountMeta(executor, orgId),
  ]);

  return classifyBenefitBuckets(sideTotals, accountMeta);
}

/**
 * Backward-compatible wrapper for the debtor ranking (see rankDebtors for
 * the full semantics note). The dashboard service shares this work with the
 * bucket view through loadJournalSideTotals instead.
 */
async function findTopDebtors(executor, orgId) {
  const [sideTotals, accountMeta] = await Promise.all([
    loadJournalSideTotals(executor, orgId),
    loadAccountMeta(executor, orgId),
  ]);

  return rankDebtors(sideTotals, accountMeta);
}

module.exports = {
  findExpensesAccountId,
  sumSales,
  sumPurchases,
  sumSaleReturns,
  sumPurchaseReturns,
  sumWastes,
  sumExpenses,
  topProducts,
  trendBenefit,
  trendExpenses,
  findInventoryValueByCurrency,
  findInventoryValuation,
  findLowStockProducts,
  findExpiringProducts,
  findBenefitAccounts,
  loadJournalSideTotals,
  loadAccountMeta,
  classifyBenefitBuckets,
  rankDebtors,
  sumBenefitBalancesByBucket,
  findTopDebtors,
};
