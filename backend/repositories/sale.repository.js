const SALE_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  account_id,
  sale_type,
  invoice_number,
  invoice_date,
  due_date,
  expense_amount,
  total_amount,
  discount_type,
  discount_amount,
  description,
  extra_info,
  remaining,
  benefit,
  currency,
  invoice_status,
  items_count,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const SALE_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  sale_id,
  product_id,
  product_unit_id,
  quantity,
  buy_price,
  buy_price_currency,
  unit_price,
  currency,
  discount_type,
  discount_amount,
  subtotal,
  fifo_cost,
  profit,
  extra_info,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const PAYMENT_COLUMNS = `
  sp.local_id AS id,
  sp.local_id,
  sp.sale_id,
  sp.account_id,
  sp.amount,
  sp.currency,
  sp.payment_date,
  sp.description,
  sp.status,
  COALESCE(sp.version, 1) AS version,
  sp.created_by,
  sp.updated_by,
  sp.approved_by,
  sp.approved_at,
  sp.created_at,
  sp.updated_at,
  a.name AS account_name,
  a.name_fa AS account_name_fa,
  a.name_ps AS account_name_ps,
  a.code AS account_code
`;

const PAYMENT_FROM = `
  sale_payments sp
  LEFT JOIN accounts a
    ON a.org_id = sp.org_id
   AND a.local_id = sp.account_id
`;

const RETURN_COLUMNS = `
  local_id AS id,
  local_id,
  sale_id,
  warehouse_id,
  account_id,
  return_number,
  return_date,
  total_amount,
  description,
  currency,
  return_status,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const RETURN_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  sale_return_id,
  product_id,
  product_unit_id,
  quantity,
  unit_price,
  currency,
  subtotal,
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

function saleListOrderSql(sortBy = 'created_at', sortDir = 'desc') {
  const dir = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const invoiceSeq = `CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)`;

  if (sortBy === 'invoice_number') {
    return `ORDER BY ${invoiceSeq} ${dir}, created_at DESC, local_id DESC`;
  }

  if (sortBy === 'invoice_date' || sortBy === 'due_date') {
    return `ORDER BY ${sortBy} ${dir}, created_at DESC, local_id DESC`;
  }

  if (sortBy === 'total_amount' || sortBy === 'remaining' || sortBy === 'benefit' || sortBy === 'items_count') {
    return `ORDER BY ${sortBy} ${dir}, created_at DESC, local_id DESC`;
  }

  return `ORDER BY created_at ${dir}, updated_at ${dir}, local_id DESC`;
}

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    search = '',
    accountId,
    dateFrom,
    dateTo,
    skipCount = false,
    pagination = null,
    sortBy = 'created_at',
    sortDir = 'desc',
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
    conditions.push('account_id = ?');
    values.push(accountId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        invoice_number LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  if (dateFrom) {
    conditions.push('COALESCE(invoice_date, created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('COALESCE(invoice_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }

  return paginateSelect(executor, {
    tableSql: 'sales',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: saleListOrderSql(sortBy, sortDir),
    columnsSql: SALE_COLUMNS,
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
        ${SALE_COLUMNS}
      FROM sales
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function findByInvoiceNumber(
  executor,
  {
    orgId,
    invoiceNumber,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${SALE_COLUMNS}
      FROM sales
      WHERE org_id = ?
        AND invoice_number = ?
        AND status = 1
      LIMIT 1
    `,
    [
      orgId,
      invoiceNumber,
    ],
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
      INSERT INTO sales (
        org_id,
        local_id,
        warehouse_id,
        account_id,
        sale_type,
        invoice_number,
        invoice_date,
        due_date,
        expense_amount,
        total_amount,
        discount_type,
        discount_amount,
        description,
        extra_info,
        remaining,
        benefit,
        currency,
        invoice_status,
        items_count,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.sale_type ?? null,
      data.invoice_number ?? null,
      data.invoice_date ?? null,
      data.due_date ?? null,
      data.expense_amount ?? null,
      data.total_amount ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
      data.description ?? null,
      data.extra_info ?? null,
      data.remaining ?? null,
      data.benefit ?? null,
      data.currency ?? null,
      data.invoice_status ?? null,
      data.items_count ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

const SALE_UPDATE_COLUMNS = [
  'warehouse_id',
  'account_id',
  'sale_type',
  'invoice_number',
  'invoice_date',
  'due_date',
  'expense_amount',
  'total_amount',
  'discount_type',
  'discount_amount',
  'description',
  'extra_info',
  'remaining',
  'benefit',
  'currency',
  'invoice_status',
  'items_count',
  'status',
];

async function update(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const setters = [];
  const values = [];

  for (const column of SALE_UPDATE_COLUMNS) {
    if (data[column] !== undefined) {
      setters.push(`${column} = ?`);
      values.push(data[column]);
    }
  }

  if (setters.length > 0) {
    setters.push('version = COALESCE(version, 0) + 1');
    setters.push('updated_by = ?');
    setters.push('updated_at = NOW(3)');

    values.push(
      userId,
      orgId,
      localId,
    );

    await connection.execute(
      `
        UPDATE sales
        SET ${setters.join(', ')}
        WHERE org_id = ?
          AND local_id = ?
      `,
      values,
    );
  }

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDelete(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE sales
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      userId,
      orgId,
      localId,
    ],
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function findItemsBySale(
  executor,
  {
    orgId,
    saleId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${SALE_ITEM_COLUMNS}
      FROM sale_items
      WHERE org_id = ?
        AND sale_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      saleId,
    ],
  );

  return rows;
}

async function createItem(
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
      INSERT INTO sale_items (
        org_id,
        local_id,
        sale_id,
        product_id,
        product_unit_id,
        quantity,
        buy_price,
        buy_price_currency,
        unit_price,
        currency,
        discount_type,
        discount_amount,
        subtotal,
        fifo_cost,
        profit,
        extra_info,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.sale_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.buy_price ?? null,
      data.buy_price_currency ?? null,
      data.unit_price ?? null,
      data.currency ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
      data.subtotal ?? null,
      data.fifo_cost ?? null,
      data.profit ?? null,
      data.extra_info ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${SALE_ITEM_COLUMNS}
      FROM sale_items
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function softDeleteItemsBySale(
  connection,
  {
    orgId,
    saleId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE sale_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND sale_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      saleId,
    ],
  );
}

async function findPaymentsBySaleIds(
  executor,
  {
    orgId,
    saleIds,
    includeDeleted = false,
  },
) {
  if (!saleIds || saleIds.length === 0) {
    return [];
  }

  const placeholders =
    saleIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM ${PAYMENT_FROM}
      WHERE sp.org_id = ?
        AND sp.sale_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND sp.status = 1'}
      ORDER BY sp.created_at ASC, sp.local_id ASC
    `,
    [
      orgId,
      ...saleIds,
    ],
  );

  return rows;
}

async function findPaymentsBySale(
  executor,
  {
    orgId,
    saleId,
    includeDeleted = false,
  },
) {
  return findPaymentsBySaleIds(
    executor,
    {
      orgId,
      saleIds: [saleId],
      includeDeleted,
    },
  );
}

async function createPayment(
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
      INSERT INTO sale_payments (
        org_id,
        local_id,
        sale_id,
        account_id,
        amount,
        currency,
        payment_date,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
        ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.sale_id ?? null,
      data.account_id ?? null,
      data.amount ?? null,
      data.currency ?? null,
      data.payment_date ?? null,
      data.description ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM ${PAYMENT_FROM}
      WHERE sp.org_id = ?
        AND sp.local_id = ?
      LIMIT 1
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function findPaymentByLocalId(
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
        ${PAYMENT_COLUMNS}
      FROM ${PAYMENT_FROM}
      WHERE sp.org_id = ?
        AND sp.local_id = ?
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function softDeletePayment(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE sale_payments
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      userId,
      orgId,
      localId,
    ],
  );

  return findPaymentByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function findReturnsBySaleIds(
  executor,
  {
    orgId,
    saleIds,
    includeDeleted = false,
  },
) {
  if (!saleIds || saleIds.length === 0) {
    return [];
  }

  const placeholders =
    saleIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM sale_returns
      WHERE org_id = ?
        AND sale_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      ...saleIds,
    ],
  );

  return rows;
}

async function findReturnsBySale(
  executor,
  {
    orgId,
    saleId,
    includeDeleted = false,
  },
) {
  return findReturnsBySaleIds(
    executor,
    {
      orgId,
      saleIds: [saleId],
      includeDeleted,
    },
  );
}

async function findReturnByLocalId(
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
        ${RETURN_COLUMNS}
      FROM sale_returns
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function createReturn(
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
      INSERT INTO sale_returns (
        org_id,
        local_id,
        sale_id,
        warehouse_id,
        account_id,
        return_number,
        return_date,
        total_amount,
        description,
        currency,
        return_status,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.sale_id ?? null,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.return_number ?? null,
      data.return_date ?? null,
      data.total_amount ?? null,
      data.description ?? null,
      data.currency ?? null,
      data.return_status ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  return findReturnByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function createReturnItem(
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
      INSERT INTO sale_return_items (
        org_id,
        local_id,
        sale_return_id,
        product_id,
        product_unit_id,
        quantity,
        unit_price,
        currency,
        subtotal,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.sale_return_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.unit_price ?? null,
      data.currency ?? null,
      data.subtotal ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM sale_return_items
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function findReturnItemsByReturn(
  executor,
  {
    orgId,
    returnId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM sale_return_items
      WHERE org_id = ?
        AND sale_return_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      returnId,
    ],
  );

  return rows;
}

async function findReturnItemsByReturnIds(
  executor,
  {
    orgId,
    returnIds,
    includeDeleted = false,
  },
) {
  if (!returnIds || returnIds.length === 0) {
    return [];
  }

  const placeholders =
    returnIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM sale_return_items
      WHERE org_id = ?
        AND sale_return_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      ...returnIds,
    ],
  );

  return rows;
}

async function softDeleteReturn(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE sale_returns
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      userId,
      orgId,
      localId,
    ],
  );

  return findReturnByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDeleteReturnItemsByReturn(
  connection,
  {
    orgId,
    returnId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE sale_return_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND sale_return_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      returnId,
    ],
  );
}

/*
 * Stock-quantity writes: increment or decrement the product's
 * current quantity inside the same MySQL transaction as the
 * sale/return being saved. A confirmed sale deducts stock, a
 * sale return restores it (positive delta).
 */
async function adjustProductQuantity(
  connection,
  {
    orgId,
    productId,
    delta,
  },
) {
  if (!productId || !delta) {
    return;
  }

  await connection.execute(
    `
      UPDATE products
      SET
        quantity = COALESCE(quantity, 0) + ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      delta,
      orgId,
      productId,
    ],
  );
}

async function findAccountByCode(
  executor,
  {
    orgId,
    code,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        local_id AS id,
        local_id,
        code,
        name,
        balance,
        currency,
        status
      FROM accounts
      WHERE org_id = ?
        AND code = ?
        AND status = 1
      LIMIT 1
    `,
    [
      orgId,
      code,
    ],
  );

  return rows[0] || null;
}

async function updateItemCosts(
  connection,
  {
    orgId,
    localId,
    userId,
    fifoCost,
    profit,
  },
) {
  await connection.execute(
    `
      UPDATE sale_items
      SET
        fifo_cost = ?,
        profit = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      fifoCost,
      profit,
      userId,
      orgId,
      localId,
    ],
  );
}

module.exports = {
  findAll,
  findByLocalId,
  findByInvoiceNumber,
  create,
  update,
  softDelete,
  findItemsBySale,
  createItem,
  softDeleteItemsBySale,
  findPaymentsBySale,
  findPaymentsBySaleIds,
  createPayment,
  findPaymentByLocalId,
  softDeletePayment,
  findReturnsBySale,
  findReturnsBySaleIds,
  findReturnByLocalId,
  createReturn,
  createReturnItem,
  findReturnItemsByReturn,
  findReturnItemsByReturnIds,
  softDeleteReturn,
  softDeleteReturnItemsByReturn,
  adjustProductQuantity,
  findAccountByCode,
  updateItemCosts,
};
