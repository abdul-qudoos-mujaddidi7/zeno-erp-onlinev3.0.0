const {
  buildMeta,
} = require('../utils/pagination');

function buildSaleReturnQuery({
  orgId,
  accountId,
  search,
  dateFrom,
  dateTo,
  limit,
}) {
  const conditions = [
    'sr.org_id = ?',
    'sr.status = 1',
    'sri.org_id = ?',
    'sri.status = 1',
  ];
  const values = [orgId, orgId];

  if (accountId) {
    conditions.push('sr.account_id = ?');
    values.push(accountId);
  }

  if (dateFrom) {
    conditions.push('COALESCE(sr.return_date, sri.created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(
      'COALESCE(sr.return_date, sri.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    );
    values.push(dateTo);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(`(
      CAST(sri.local_id AS CHAR) LIKE ?
      OR CAST(sr.sale_id AS CHAR) LIKE ?
      OR CAST(sri.product_id AS CHAR) LIKE ?
      OR IFNULL(sr.return_number, '') LIKE ?
      OR IFNULL(pr.name, '') LIKE ?
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  // LIMIT as string: MySQL 8.0.22+ rejects DOUBLE binds for LIMIT (ER_WRONG_ARGUMENTS).
  values.push(String(Number(limit)));

  return {
    sql: `
      SELECT
        sri.local_id AS id,
        sri.local_id,
        sri.sale_return_id,
        NULL AS purchase_return_id,
        sri.product_id,
        sri.product_unit_id,
        sri.quantity,
        sri.unit_price,
        sri.currency,
        sri.subtotal,
        sri.status,
        COALESCE(sr.return_date, sri.created_at) AS created_at,
        sr.sale_id AS document_id,
        sr.account_id,
        sr.return_number,
        'sale' AS return_type,
        pr.name AS product_name,
        pu.name AS product_unit_name
      FROM sale_returns sr
      INNER JOIN sale_return_items sri
        ON sri.org_id = sr.org_id
       AND sri.sale_return_id = sr.local_id
      LEFT JOIN products pr
        ON pr.org_id = sri.org_id
       AND pr.local_id = sri.product_id
      LEFT JOIN product_units pu
        ON pu.org_id = sri.org_id
       AND pu.local_id = sri.product_unit_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(sr.return_date, sri.created_at) DESC, sri.local_id DESC
      LIMIT ?
    `,
    values,
  };
}

function buildPurchaseReturnQuery({
  orgId,
  accountId,
  search,
  dateFrom,
  dateTo,
  limit,
}) {
  const conditions = [
    'prr.org_id = ?',
    'prr.status = 1',
    'pri.org_id = ?',
    'pri.status = 1',
  ];
  const values = [orgId, orgId];

  if (accountId) {
    conditions.push('prr.account_id = ?');
    values.push(accountId);
  }

  if (dateFrom) {
    conditions.push('COALESCE(prr.return_date, pri.created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push(
      'COALESCE(prr.return_date, pri.created_at) < DATE_ADD(?, INTERVAL 1 DAY)',
    );
    values.push(dateTo);
  }

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(`(
      CAST(pri.local_id AS CHAR) LIKE ?
      OR CAST(prr.purchase_id AS CHAR) LIKE ?
      OR CAST(pri.product_id AS CHAR) LIKE ?
      OR IFNULL(prr.return_number, '') LIKE ?
      OR IFNULL(pr.name, '') LIKE ?
    )`);
    values.push(pattern, pattern, pattern, pattern, pattern);
  }

  // LIMIT as string: MySQL 8.0.22+ rejects DOUBLE binds for LIMIT (ER_WRONG_ARGUMENTS).
  values.push(String(Number(limit)));

  return {
    sql: `
      SELECT
        pri.local_id AS id,
        pri.local_id,
        NULL AS sale_return_id,
        pri.purchase_return_id,
        pri.product_id,
        pri.product_unit_id,
        pri.quantity,
        pri.unit_price,
        pri.currency,
        pri.subtotal,
        pri.status,
        COALESCE(prr.return_date, pri.created_at) AS created_at,
        prr.purchase_id AS document_id,
        prr.account_id,
        prr.return_number,
        'purchase' AS return_type,
        pr.name AS product_name,
        pu.name AS product_unit_name
      FROM purchase_returns prr
      INNER JOIN purchase_return_items pri
        ON pri.org_id = prr.org_id
       AND pri.purchase_return_id = prr.local_id
      LEFT JOIN products pr
        ON pr.org_id = pri.org_id
       AND pr.local_id = pri.product_id
      LEFT JOIN product_units pu
        ON pu.org_id = pri.org_id
       AND pu.local_id = pri.product_unit_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(prr.return_date, pri.created_at) DESC, pri.local_id DESC
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

async function findItems(
  executor,
  {
    orgId,
    accountId,
    returnType = 'all',
    search = '',
    dateFrom,
    dateTo,
    pagination = null,
  },
) {
  const page = pagination?.page || 1;
  const limit = pagination?.limit || 15;
  const offset = pagination?.offset || 0;
  const fetchLimit = Math.min(offset + limit + 1, 500);

  const includeSales = returnType === 'all' || returnType === 'sale';
  const includePurchases = returnType === 'all' || returnType === 'purchase';
  const tasks = [];

  if (includeSales) {
    const query = buildSaleReturnQuery({
      orgId,
      accountId,
      search,
      dateFrom,
      dateTo,
      limit: fetchLimit,
    });
    tasks.push(
      executor.execute(query.sql, query.values).then(([rows]) => rows),
    );
  }

  if (includePurchases) {
    const query = buildPurchaseReturnQuery({
      orgId,
      accountId,
      search,
      dateFrom,
      dateTo,
      limit: fetchLimit,
    });
    tasks.push(
      executor.execute(query.sql, query.values).then(([rows]) => rows),
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
      approximate: true,
    },
  };
}

module.exports = {
  findItems,
};
