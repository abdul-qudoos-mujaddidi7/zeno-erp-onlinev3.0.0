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


const {
  paginateSelect,
} = require('../utils/pagination');
async function findAll(
  executor,
  {
    orgId,
    status = 1,
    purchaseId,
    productId,
    accountId,
    dateFrom,
    dateTo,
    pagination = null,
  }) {
  const conditions = [
    'org_id = ?',
    'status = ?',
  ];

  const values = [
    orgId,
    status,
  ];

  if (purchaseId !== undefined && purchaseId !== null && purchaseId !== '') {
    conditions.push('purchase_id = ?');
    values.push(purchaseId);
  }

  if (productId !== undefined && productId !== null && productId !== '') {
    conditions.push('product_id = ?');
    values.push(productId);
  }

  if (dateFrom || dateTo || (accountId !== undefined && accountId !== null && accountId !== '')) {
    const subConditions = ['org_id = ?', 'status = 1'];
    const subValues = [orgId];

    if (accountId !== undefined && accountId !== null && accountId !== '') {
      subConditions.push('account_id = ?');
      subValues.push(accountId);
    }

    if (dateFrom) {
      subConditions.push('COALESCE(bill_date, created_at) >= ?');
      subValues.push(dateFrom);
    }

    if (dateTo) {
      subConditions.push('COALESCE(bill_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
      subValues.push(dateTo);
    }

    conditions.push(
      `purchase_id IN (SELECT local_id FROM purchases WHERE ${subConditions.join(' AND ')})`,
    );

    values.push(...subValues);
  }

  return paginateSelect(executor, {
    tableSql: 'purchase_items',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY created_at ASC, local_id ASC',
    columnsSql: PURCHASE_ITEM_COLUMNS,
    pagination,
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
        ${PURCHASE_ITEM_COLUMNS}
      FROM purchase_items
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
      ) VALUES (
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

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

const PURCHASE_ITEM_UPDATE_COLUMNS = [
  'purchase_id',
  'product_id',
  'product_unit_id',
  'quantity',
  'unit_price',
  'sell_price',
  'currency',
  'sell_currency',
  'discount_type',
  'discount_amount',
  'batch',
  'manufacturing_date',
  'expiry_date',
  'subtotal',
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

  for (const column of PURCHASE_ITEM_UPDATE_COLUMNS) {
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
      UPDATE purchase_items
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
      UPDATE purchase_items
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
