const PURCHASE_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  account_id,
  bill_number,
  bill_date,
  due_date,
  expense_amount,
  total_amount,
  description,
  remaining,
  currency,
  bill_status,
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

const PURCHASE_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  purchase_id,
  product_id,
  product_unit_id,
  quantity,
  unit_price,
  sell_price,
  currency,
  sell_currency,
  discount_type,
  discount_amount,
  batch,
  manufacturing_date,
  expiry_date,
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

const PAYMENT_COLUMNS = `
  sp.local_id AS id,
  sp.local_id,
  sp.purchase_id,
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
  purchase_payments sp
  LEFT JOIN accounts a
    ON a.org_id = sp.org_id
   AND a.local_id = sp.account_id
`;

const RETURN_COLUMNS = `
  local_id AS id,
  local_id,
  purchase_id,
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
  purchase_return_id,
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

function purchaseListOrderSql(sortBy = 'created_at', sortDir = 'desc') {
  const dir = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const billSeq = `CAST(SUBSTRING_INDEX(bill_number, '-', -1) AS UNSIGNED)`;

  if (sortBy === 'bill_number') {
    return `ORDER BY ${billSeq} ${dir}, created_at DESC, local_id DESC`;
  }

  if (sortBy === 'bill_date' || sortBy === 'due_date') {
    return `ORDER BY ${sortBy} ${dir}, created_at DESC, local_id DESC`;
  }

  if (sortBy === 'total_amount' || sortBy === 'remaining') {
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
    currency,
    dateFrom,
    dateTo,
    billStatus,
    paymentStatus,
    skipCount = false,
    pagination = null,
    sortBy = 'created_at',
    sortDir = 'desc',
    ids = [],
  }) {
  const conditions = [
    'org_id = ?',
    'status = ?',
  ];

  const values = [
    orgId,
    status,
  ];

  if (Array.isArray(ids) && ids.length > 0) {
    conditions.push(
      `local_id IN (${ids.map(() => '?').join(', ')})`,
    );
    values.push(...ids);
  }

  if (accountId !== undefined && accountId !== null && accountId !== '') {
    conditions.push('account_id = ?');
    values.push(accountId);
  }


  if (currency) {
    conditions.push('currency = ?');
    values.push(currency);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        bill_number LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  if (dateFrom) {
    conditions.push('COALESCE(bill_date, created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('COALESCE(bill_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }

  if (billStatus === 'return') {
    conditions.push(`
      local_id IN (
        SELECT purchase_id
        FROM purchase_returns
        WHERE org_id = ?
          AND status = 1
      )
    `);
    values.push(orgId);
  } else if (billStatus && billStatus !== 'all') {
    conditions.push('LOWER(TRIM(COALESCE(bill_status, \'\'))) = ?');
    values.push(String(billStatus).trim().toLowerCase());
  }

  const outstandingSql = `
    (
      COALESCE(total_amount, 0)
      - COALESCE((
          SELECT SUM(pp.amount)
          FROM purchase_payments pp
          WHERE pp.org_id = purchases.org_id
            AND pp.purchase_id = purchases.local_id
            AND pp.status = 1
        ), 0)
      - COALESCE((
          SELECT SUM(pr.total_amount)
          FROM purchase_returns pr
          WHERE pr.org_id = purchases.org_id
            AND pr.purchase_id = purchases.local_id
            AND pr.status = 1
        ), 0)
    )
  `;

  if (paymentStatus === 'paid') {
    conditions.push(`${outstandingSql} <= 0`);
  } else if (paymentStatus === 'unpaid') {
    conditions.push(`${outstandingSql} > 0`);
  }

  return paginateSelect(executor, {
    tableSql: 'purchases',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: purchaseListOrderSql(sortBy, sortDir),
    columnsSql: PURCHASE_COLUMNS,
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
        ${PURCHASE_COLUMNS}
      FROM purchases
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
      INSERT INTO purchases (
        org_id,
        local_id,
        warehouse_id,
        account_id,
        bill_number,
        bill_date,
        due_date,
        expense_amount,
        total_amount,
        description,
        remaining,
        currency,
        bill_status,
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
        ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.bill_number ?? null,
      data.bill_date ?? null,
      data.due_date ?? null,
      data.expense_amount ?? null,
      data.total_amount ?? null,
      data.description ?? null,
      data.remaining ?? null,
      data.currency ?? null,
      data.bill_status ?? null,
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

const PURCHASE_UPDATE_COLUMNS = [
  'warehouse_id',
  'account_id',
  'bill_number',
  'bill_date',
  'due_date',
  'expense_amount',
  'total_amount',
  'description',
  'remaining',
  'currency',
  'bill_status',
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

  for (const column of PURCHASE_UPDATE_COLUMNS) {
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
        UPDATE purchases
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
      UPDATE purchases
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

async function findItemsByPurchase(
  executor,
  {
    orgId,
    purchaseId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${PURCHASE_ITEM_COLUMNS}
      FROM purchase_items
      WHERE org_id = ?
        AND purchase_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      purchaseId,
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
      INSERT INTO purchase_items (
        org_id,
        local_id,
        purchase_id,
        product_id,
        product_unit_id,
        quantity,
        unit_price,
        sell_price,
        currency,
        sell_currency,
        discount_type,
        discount_amount,
        batch,
        manufacturing_date,
        expiry_date,
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
        ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.purchase_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.unit_price ?? null,
      data.sell_price ?? null,
      data.currency ?? null,
      data.sell_currency ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
      data.batch ?? null,
      data.manufacturing_date ?? null,
      data.expiry_date ?? null,
      data.subtotal ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${PURCHASE_ITEM_COLUMNS}
      FROM purchase_items
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

async function softDeleteItemsByPurchase(
  connection,
  {
    orgId,
    purchaseId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE purchase_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND purchase_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      purchaseId,
    ],
  );
}

async function findPaymentsByPurchaseIds(
  executor,
  {
    orgId,
    purchaseIds,
    includeDeleted = false,
  },
) {
  if (!purchaseIds || purchaseIds.length === 0) {
    return [];
  }

  const placeholders =
    purchaseIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM ${PAYMENT_FROM}
      WHERE sp.org_id = ?
        AND sp.purchase_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND sp.status = 1'}
      ORDER BY sp.created_at ASC, sp.local_id ASC
    `,
    [
      orgId,
      ...purchaseIds,
    ],
  );

  return rows;
}

async function findPaymentsByPurchase(
  executor,
  {
    orgId,
    purchaseId,
    includeDeleted = false,
  },
) {
  return findPaymentsByPurchaseIds(
    executor,
    {
      orgId,
      purchaseIds: [purchaseId],
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
      INSERT INTO purchase_payments (
        org_id,
        local_id,
        purchase_id,
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
      data.purchase_id ?? null,
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
      UPDATE purchase_payments
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

async function findReturnsByPurchaseIds(
  executor,
  {
    orgId,
    purchaseIds,
    includeDeleted = false,
  },
) {
  if (!purchaseIds || purchaseIds.length === 0) {
    return [];
  }

  const placeholders =
    purchaseIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM purchase_returns
      WHERE org_id = ?
        AND purchase_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      ...purchaseIds,
    ],
  );

  return rows;
}

async function findReturnsByPurchase(
  executor,
  {
    orgId,
    purchaseId,
    includeDeleted = false,
  },
) {
  return findReturnsByPurchaseIds(
    executor,
    {
      orgId,
      purchaseIds: [purchaseId],
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
      FROM purchase_returns
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
      INSERT INTO purchase_returns (
        org_id,
        local_id,
        purchase_id,
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
      data.purchase_id ?? null,
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
      INSERT INTO purchase_return_items (
        org_id,
        local_id,
        purchase_return_id,
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
      data.purchase_return_id ?? null,
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
      FROM purchase_return_items
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
      FROM purchase_return_items
      WHERE org_id = ?
        AND purchase_return_id = ?
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
      FROM purchase_return_items
      WHERE org_id = ?
        AND purchase_return_id IN (${placeholders})
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
      UPDATE purchase_returns
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
      UPDATE purchase_return_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND purchase_return_id = ?
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
 * purchase/return being saved.
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

/*
 * Price writes: when a purchase is confirmed the product's
 * buy/sell prices are updated from the purchase line.
 */
async function updateProductPrices(
  connection,
  {
    orgId,
    productId,
    data,
  },
) {
  if (!productId) {
    return;
  }

  await connection.execute(
    `
      UPDATE products
      SET
        buy_price = ?,
        buy_currency = ?,
        sell_price = ?,
        sell_currency = ?,
        batch = ?,
        manufacturing_date = ?,
        expiry_date = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.unit_price,
      data.currency,
      data.sell_price,
      data.sell_currency,
      data.batch,
      data.manufacturing_date,
      data.expiry_date,
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

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  findItemsByPurchase,
  createItem,
  softDeleteItemsByPurchase,
  findPaymentsByPurchase,
  findPaymentsByPurchaseIds,
  createPayment,
  findPaymentByLocalId,
  softDeletePayment,
  findReturnsByPurchase,
  findReturnsByPurchaseIds,
  findReturnByLocalId,
  createReturn,
  createReturnItem,
  findReturnItemsByReturn,
  findReturnItemsByReturnIds,
  softDeleteReturn,
  softDeleteReturnItemsByReturn,
  adjustProductQuantity,
  updateProductPrices,
  findAccountByCode,
};
