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

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    saleId,
    productId,
    accountId,
    dateFrom,
    dateTo,
  },
) {
  const conditions = [
    'org_id = ?',
    'status = ?',
  ];

  const values = [
    orgId,
    status,
  ];

  if (saleId !== undefined && saleId !== null && saleId !== '') {
    conditions.push('sale_id = ?');
    values.push(saleId);
  }

  if (productId !== undefined && productId !== null && productId !== '') {
    conditions.push('product_id = ?');
    values.push(productId);
  }

  /*
   * When a date range and/or account is supplied, only return
   * items belonging to matching sales.
   */
  if (dateFrom || dateTo || (accountId !== undefined && accountId !== null && accountId !== '')) {
    const subConditions = ['org_id = ?', 'status = 1'];
    const subValues = [orgId];

    if (accountId !== undefined && accountId !== null && accountId !== '') {
      subConditions.push('account_id = ?');
      subValues.push(accountId);
    }

    if (dateFrom) {
      subConditions.push('COALESCE(invoice_date, created_at) >= ?');
      subValues.push(dateFrom);
    }

    if (dateTo) {
      subConditions.push('COALESCE(invoice_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
      subValues.push(dateTo);
    }

    conditions.push(
      `sale_id IN (SELECT local_id FROM sales WHERE ${subConditions.join(' AND ')})`,
    );

    values.push(...subValues);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${SALE_ITEM_COLUMNS}
      FROM sale_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at ASC, local_id ASC
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
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${SALE_ITEM_COLUMNS}
      FROM sale_items
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
      ) VALUES (
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

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

const SALE_ITEM_UPDATE_COLUMNS = [
  'sale_id',
  'product_id',
  'product_unit_id',
  'quantity',
  'buy_price',
  'buy_price_currency',
  'unit_price',
  'currency',
  'discount_type',
  'discount_amount',
  'subtotal',
  'fifo_cost',
  'profit',
  'extra_info',
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

  for (const column of SALE_ITEM_UPDATE_COLUMNS) {
    if (data[column] !== undefined) {
      setters.push(`${column} = ?`);
      values.push(data[column]);
    }
  }

  if (setters.length === 0) {
    return findByLocalId(
      connection,
      {
        orgId,
        localId,
      },
    );
  }

  setters.push(
    'version = COALESCE(version, 0) + 1',
    'updated_by = ?',
    'updated_at = NOW(3)',
  );

  values.push(
    userId,
    orgId,
    localId,
  );

  await connection.execute(
    `
      UPDATE sale_items
      SET ${setters.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

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
  await connection.execute(
    `
      UPDATE sale_items
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

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
};
