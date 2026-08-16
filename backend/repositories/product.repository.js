const PRODUCT_COLUMNS = `
  local_id AS id,
  local_id,
  product_status,
  type,
  service_duration,
  service_duration_unit,
  currency,
  category_id,
  department_id,
  user_id,
  brand_id,
  generic_id,
  product_unit_id,
  name,
  code,
  description,
  buy_price,
  buy_currency,
  percentage,
  sell_price,
  sell_currency,
  initial_warehouse_id,
  initial_quantity,
  alarm_quantity,
  quantity,
  batch,
  manufacturing_date,
  expiry_date,
  alarm_expiry_days,
  benefit,
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
    search = '',
    type = null,
    exclude_type = null,
    categoryId = null,
    pagination = null,
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

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        name LIKE ?
        OR code LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  if (type) {
    conditions.push('type = ?');
    values.push(type);
  }

  if (exclude_type) {
    conditions.push('(type IS NULL OR type <> ?)');
    values.push(exclude_type);
  }

  if (categoryId) {
    conditions.push('category_id = ?');
    values.push(categoryId);
  }

  return paginateSelect(executor, {
    tableSql: 'products',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY name ASC, local_id ASC',
    columnsSql: PRODUCT_COLUMNS,
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
        ${PRODUCT_COLUMNS}
      FROM products
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
      INSERT INTO products (
        org_id,
        local_id,
        product_status,
        type,
        service_duration,
        service_duration_unit,
        currency,
        category_id,
        department_id,
        user_id,
        brand_id,
        generic_id,
        product_unit_id,
        name,
        code,
        description,
        buy_price,
        buy_currency,
        percentage,
        sell_price,
        sell_currency,
        initial_warehouse_id,
        initial_quantity,
        alarm_quantity,
        quantity,
        batch,
        manufacturing_date,
        expiry_date,
        alarm_expiry_days,
        benefit,
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.product_status ?? null,
      data.type ?? null,
      data.service_duration ?? null,
      data.service_duration_unit ?? null,
      data.currency ?? null,
      data.category_id ?? null,
      data.department_id ?? null,
      data.user_id ?? null,
      data.brand_id ?? null,
      data.generic_id ?? null,
      data.product_unit_id ?? null,
      data.name ?? null,
      data.code ?? null,
      data.description ?? null,
      data.buy_price ?? null,
      data.buy_currency ?? null,
      data.percentage ?? null,
      data.sell_price ?? null,
      data.sell_currency ?? null,
      data.initial_warehouse_id ?? null,
      data.initial_quantity ?? null,
      data.alarm_quantity ?? null,
      data.quantity ?? null,
      data.batch ?? null,
      data.manufacturing_date ?? null,
      data.expiry_date ?? null,
      data.alarm_expiry_days ?? null,
      data.benefit ?? null,
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

const PRODUCT_UPDATE_COLUMNS = [
  'product_status',
  'type',
  'service_duration',
  'service_duration_unit',
  'currency',
  'category_id',
  'department_id',
  'user_id',
  'brand_id',
  'generic_id',
  'product_unit_id',
  'name',
  'code',
  'description',
  'buy_price',
  'buy_currency',
  'percentage',
  'sell_price',
  'sell_currency',
  'initial_warehouse_id',
  'initial_quantity',
  'alarm_quantity',
  'quantity',
  'batch',
  'manufacturing_date',
  'expiry_date',
  'alarm_expiry_days',
  'benefit',
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

  for (const column of PRODUCT_UPDATE_COLUMNS) {
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

  setters.push('version = COALESCE(version, 0) + 1');
  setters.push('updated_by = ?');
  setters.push('updated_at = NOW(3)');

  values.push(
    userId,
    orgId,
    localId,
  );

  const [result] = await connection.execute(
    `
      UPDATE products
      SET ${setters.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
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
      UPDATE products
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

/*
 * Stock-quantity writes: increment or decrement the product's
 * current quantity inside the caller's MySQL transaction. Opening
 * stock edits, purchases and sales all use this so products.quantity
 * stays in lockstep with warehouse balances.
 */
async function adjustQuantity(
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

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  adjustQuantity,
};
