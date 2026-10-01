const {
  buildMeta,
} = require('../utils/pagination');

function buildSaleQuery({
  orgId,
  accountId,
  productId,
  currency,
  search,
  dateFrom,
  dateTo,
  limit,
}) {
  const conditions = [
    's.org_id = ?',
    's.status = 1',
  ];
  const values = [orgId];

  if (accountId != null) {
    conditions.push('s.account_id = ?');
    values.push(accountId);
  }

  conditions.push(
    'si.org_id = ?',
    'si.status = 1',
  );
  values.push(orgId);

  if (productId !== undefined && productId !== null && productId !== '') {
    conditions.push('si.product_id = ?');
    values.push(productId);
  }

  if (currency) {
    conditions.push('si.currency = ?');
    values.push(currency);
  }

  if (dateFrom) {
    conditions.push('COALESCE(s.invoice_date, s.created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(
      'COALESCE(s.invoice_date, s.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    );
    values.push(dateTo);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(`(
      CAST(si.local_id AS CHAR) LIKE ?
      OR CAST(si.sale_id AS CHAR) LIKE ?
      OR CAST(si.product_id AS CHAR) LIKE ?
      OR IFNULL(s.invoice_number, '') LIKE ?
      OR IFNULL(pr.name, '') LIKE ?
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  // LIMIT as string: MySQL 8.0.22+ rejects DOUBLE binds for LIMIT (ER_WRONG_ARGUMENTS).
  values.push(String(Number(limit)));

  return {
    sql: `      SELECT
        si.local_id AS id,
        si.local_id,
        si.sale_id,
        NULL AS purchase_id,
        s.account_id,
        si.product_id,
        si.product_unit_id,
        si.quantity,
        si.buy_price,
        si.buy_price_currency,
        si.unit_price,
        si.currency,
        si.subtotal,
        si.fifo_cost,
        si.profit,
        s.invoice_status,
        s.currency AS sale_currency,
        COALESCE(s.invoice_date, si.created_at) AS created_at,
        s.invoice_number AS document_number,
        'sale' AS item_type,
        pr.name AS product_name,
        pr.buy_price AS product_buy_price,
        pr.buy_currency AS product_buy_currency,
        pr.product_unit_id AS product_base_unit_id,
        pu.name AS product_unit_name,
        ac.name AS account_name,
        ac.name_fa AS account_name_fa,
        ac.name_ps AS account_name_ps
      FROM sales s
      INNER JOIN sale_items si
        ON si.org_id = s.org_id
       AND si.sale_id = s.local_id
      LEFT JOIN products pr
        ON pr.org_id = si.org_id
       AND pr.local_id = si.product_id
      LEFT JOIN product_units pu
        ON pu.org_id = si.org_id
        AND pu.local_id = si.product_unit_id
      LEFT JOIN accounts ac
        ON ac.org_id = s.org_id
        AND ac.local_id = s.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(s.invoice_date, s.created_at) DESC, si.local_id DESC
      LIMIT ?
    `,
    values,
  };
}

function buildPurchaseQuery({
  orgId,
  accountId,
  productId,
  currency,
  search,
  dateFrom,
  dateTo,
  limit,
}) {
  const conditions = [
    'p.org_id = ?',
    'p.status = 1',
  ];
  const values = [orgId];

  if (accountId != null) {
    conditions.push('p.account_id = ?');
    values.push(accountId);
  }

  conditions.push(
    'pi.org_id = ?',
    'pi.status = 1',
  );
  values.push(orgId);

  if (productId !== undefined && productId !== null && productId !== '') {
    conditions.push('pi.product_id = ?');
    values.push(productId);
  }


  if (currency) {
    conditions.push('pi.currency = ?');
    values.push(currency);
  }

  if (dateFrom) {
    conditions.push('COALESCE(p.bill_date, p.created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(
      'COALESCE(p.bill_date, p.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    );
    values.push(dateTo);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(`(
      CAST(pi.local_id AS CHAR) LIKE ?
      OR CAST(pi.purchase_id AS CHAR) LIKE ?
      OR CAST(pi.product_id AS CHAR) LIKE ?
      OR IFNULL(p.bill_number, '') LIKE ?
      OR IFNULL(pr.name, '') LIKE ?
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  // LIMIT as string: MySQL 8.0.22+ rejects DOUBLE binds for LIMIT (ER_WRONG_ARGUMENTS).
  values.push(String(Number(limit)));

  return {
    sql: `      SELECT
        pi.local_id AS id,
        pi.local_id,
        NULL AS sale_id,
        pi.purchase_id,
        p.account_id,
        pi.product_id,
        pi.product_unit_id,
        pi.quantity,
        NULL AS buy_price,
        NULL AS buy_price_currency,
        pi.unit_price,
        pi.currency,
        pi.subtotal,
        NULL AS fifo_cost,
        NULL AS profit,
        NULL AS invoice_status,
        NULL AS sale_currency,
        COALESCE(p.bill_date, pi.created_at) AS created_at,
        p.bill_number AS document_number,
        'purchase' AS item_type,
        pr.name AS product_name,
        pr.buy_price AS product_buy_price,
        pr.buy_currency AS product_buy_currency,
        pr.product_unit_id AS product_base_unit_id,
        pu.name AS product_unit_name,
        ac.name AS account_name,
        ac.name_fa AS account_name_fa,
        ac.name_ps AS account_name_ps
      FROM purchases p
      INNER JOIN purchase_items pi
        ON pi.org_id = p.org_id
       AND pi.purchase_id = p.local_id
      LEFT JOIN products pr
        ON pr.org_id = pi.org_id
       AND pr.local_id = pi.product_id
      LEFT JOIN product_units pu
        ON pu.org_id = pi.org_id
        AND pu.local_id = pi.product_unit_id
      LEFT JOIN accounts ac
        ON ac.org_id = p.org_id
        AND ac.local_id = p.account_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(p.bill_date, p.created_at) DESC, pi.local_id DESC
      LIMIT ?
    `,
    values,
  };
}

function sortRows(a, b) {
  const dateA = new Date(a.created_at || 0).getTime();
  const dateB = new Date(b.created_at || 0).getTime();
  if (dateA !== dateB) return dateB - dateA;
  return Number(b.id || 0) - Number(a.id || 0);
}

/**
 * Paginated sale/purchase line items for one account.
 *
 * Each side is capped with LIMIT before merge so MySQL never materializes
 * the full account history just to return one page.
 */
async function findByAccount(
  executor,
  {
    orgId,
    accountId,
    itemType = 'all',
    productId,
    currency,
    search = '',
    dateFrom,
    dateTo,
    skipCount = true,
    pagination = null,
  },
) {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 15;
  const offset = pagination?.offset || 0;
  const fetchLimit = Math.min(offset + limit + 1, 500);

  const includeSales = itemType === 'all' || itemType === 'sale';
  const includePurchases = itemType === 'all' || itemType === 'purchase';

  const tasks = [];

  if (includeSales) {
    const saleQuery = buildSaleQuery({
      orgId,
      accountId,
      productId,
      currency,
      search,
      dateFrom,
      dateTo,
      limit: fetchLimit,
    });
    tasks.push(
      executor
        .execute(saleQuery.sql, saleQuery.values)
        .then(([rows]) => rows),
    );
  }

  if (includePurchases) {
    const purchaseQuery = buildPurchaseQuery({
      orgId,
      accountId,
      productId,
      currency,
      search,
      dateFrom,
      dateTo,
      limit: fetchLimit,
    });
    tasks.push(
      executor
        .execute(purchaseQuery.sql, purchaseQuery.values)
        .then(([rows]) => rows),
    );
  }

  if (!tasks.length) {
    return {
      data: [],
      meta: {
        ...buildMeta({ total: 0, page, limit }),
        hasMore: false,
        approximate: true,
      },
    };
  }

  const chunks = await Promise.all(tasks);
  const merged = chunks.flat().sort(sortRows);
  const windowRows = merged.slice(offset, offset + limit + 1);
  const hasMore = windowRows.length > limit;
  const data = hasMore ? windowRows.slice(0, limit) : windowRows;

  return {
    data,
    meta: {
      ...buildMeta({
        total: offset + data.length + (hasMore ? 1 : 0),
        page,
        limit,
      }),
      hasMore,
      approximate: Boolean(skipCount),
    },
  };
}

module.exports = {
  findByAccount,
};
