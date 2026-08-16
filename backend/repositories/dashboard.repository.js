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
 * Net-position balances for dashboard overview.
 * Two journal passes JOIN accounts — avoids loading every AR/AP id
 * into Node and building a giant IN (...).
 */
async function sumBenefitBalancesByBucket(executor, orgId) {
  const bucketExpr = `
    CASE
      WHEN a.code = 'TREASURY' THEN 'treasury'
      WHEN a.account_type_id = 4 THEN 'customer'
      WHEN a.account_type_id = 3 THEN 'supplier'
      WHEN a.account_type_id = 7 THEN 'shareholder'
      ELSE NULL
    END
  `;

  const [firstPass, secondPass] = await Promise.all([
    executor.execute(
      `
        SELECT
          ${bucketExpr} AS bucket,
          j.currency,
          SUM(
            COALESCE(j.first_entry_credit, 0) - COALESCE(j.first_entry_debit, 0)
          ) AS balance
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.first_entry_account
         AND a.status = 1
        WHERE j.org_id = ?
          AND j.status = 1
          AND (
            a.code = 'TREASURY'
            OR a.account_type_id IN (3, 4, 7)
          )
        GROUP BY bucket, j.currency
        HAVING bucket IS NOT NULL
      `,
      [orgId],
    ),
    executor.execute(
      `
        SELECT
          ${bucketExpr} AS bucket,
          j.currency,
          SUM(
            COALESCE(j.second_entry_credit, 0) - COALESCE(j.second_entry_debit, 0)
          ) AS balance
        FROM journals j
        INNER JOIN accounts a
          ON a.org_id = j.org_id
         AND a.local_id = j.second_entry_account
         AND a.status = 1
        WHERE j.org_id = ?
          AND j.status = 1
          AND (
            a.code = 'TREASURY'
            OR a.account_type_id IN (3, 4, 7)
          )
        GROUP BY bucket, j.currency
        HAVING bucket IS NOT NULL
      `,
      [orgId],
    ),
  ]);

  const merged = new Map();

  for (const row of [...(firstPass[0] || []), ...(secondPass[0] || [])]) {
    if (!row?.bucket) continue;
    const key = `${row.bucket}|${row.currency || 'AFN'}`;
    const existing = merged.get(key);

    if (existing) {
      existing.balance =
        Number(existing.balance) + (Number(row.balance) || 0);
    } else {
      merged.set(key, {
        bucket: row.bucket,
        currency: row.currency || 'AFN',
        balance: Number(row.balance) || 0,
      });
    }
  }

  return [...merged.values()];
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
  sumBenefitBalancesByBucket,
};
