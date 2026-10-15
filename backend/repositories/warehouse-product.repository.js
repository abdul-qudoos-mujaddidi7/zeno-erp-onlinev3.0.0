const {
  paginateSelect,
} = require('../utils/pagination');

const WAREHOUSE_PRODUCT_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  product_id,
  product_unit_id,
  quantity,
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
    warehouseId = null,
    productId = null,
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

  if (warehouseId) {
    conditions.push('warehouse_id = ?');
    values.push(warehouseId);
  }

  if (productId) {
    conditions.push('product_id = ?');
    values.push(productId);
  }

  /*
   * One page plus its `meta` total when the caller asked for a page, the whole
   * filtered list when it did not.
   *
   * The ~20 form lookups (sale, purchase, POS, BOM, production, prescriptions,
   * inventory records, stock adjustments) call this without pagination and must
   * keep receiving every row - `resolvePagination` returns null for them, so
   * paginateSelect runs the same statement it always did.
   */
  return paginateSelect(executor, {
    tableSql: 'warehouse_products',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY warehouse_id ASC, product_id ASC',
    columnsSql: WAREHOUSE_PRODUCT_COLUMNS,
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
        ${WAREHOUSE_PRODUCT_COLUMNS}
      FROM warehouse_products
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

/*
 * Look up the active warehouse/product balance row so stock
 * movements can be applied to it (or create it on first movement).
 */
async function findByWarehouseProduct(
  executor,
  {
    orgId,
    warehouseId,
    productId,
    forUpdate = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${WAREHOUSE_PRODUCT_COLUMNS}
      FROM warehouse_products
      WHERE org_id = ?
        AND warehouse_id = ?
        AND product_id = ?
        AND status = 1
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      warehouseId,
      productId,
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
      INSERT INTO warehouse_products (
        org_id,
        local_id,
        warehouse_id,
        product_id,
        product_unit_id,
        quantity,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
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

const WAREHOUSE_PRODUCT_UPDATE_COLUMNS = [
  'warehouse_id',
  'product_id',
  'product_unit_id',
  'quantity',
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

  for (const column of WAREHOUSE_PRODUCT_UPDATE_COLUMNS) {
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
        UPDATE warehouse_products
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
      UPDATE warehouse_products
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
 * Stock-quantity writes: increment or decrement the warehouse/product
 * balance inside the caller's transaction. When no active row exists
 * yet, one is created with the delta as its starting quantity.
 */
async function adjustQuantity(
  connection,
  {
    orgId,
    warehouseId,
    productId,
    productUnitId = null,
    delta,
    userId,
  },
) {
  if (!warehouseId || !productId || !delta) {
    return null;
  }

  const existing = await findByWarehouseProduct(
    connection,
    {
      orgId,
      warehouseId,
      productId,
      forUpdate: true,
    },
  );

  if (existing) {
    await connection.execute(
      `
        UPDATE warehouse_products
        SET
          quantity = COALESCE(quantity, 0) + ?,
          product_unit_id = ?,
          version = COALESCE(version, 0) + 1,
          updated_by = ?,
          updated_at = NOW(3)
        WHERE org_id = ?
          AND local_id = ?
      `,
      [
        delta,
        productUnitId ?? existing.product_unit_id,
        userId,
        orgId,
        existing.id,
      ],
    );

    return findByLocalId(
      connection,
      {
        orgId,
        localId: existing.id,
      },
    );
  }

  const { generateLocalId } =
    require('../utils/generateLocalId');

  const localId = generateLocalId();

  await create(
    connection,
    {
      orgId,
      localId,
      userId,
      data: {
        warehouse_id: warehouseId,
        product_id: productId,
        product_unit_id: productUnitId,
        quantity: delta,
        status: 1,
      },
    },
  );

  return findByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

/**
 * Reset every warehouse balance of one product to zero.
 *
 * Zeroing is a product-wide operation: a product's aggregate quantity has to
 * stay equal to the sum of its warehouse balances, so balances in warehouses
 * other than the selected one are cleared too.
 */
async function zeroQuantities(
  connection,
  {
    orgId,
    userId,
    productId,
  },
) {
  if (!orgId || !productId) {
    return;
  }

  await connection.execute(
    `
      UPDATE warehouse_products
      SET
        quantity = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND product_id = ?
        AND COALESCE(quantity, 0) <> 0
    `,
    [
      userId,
      orgId,
      productId,
    ],
  );
}

/**
 * Reset every warehouse balance in the organization to zero. Used by the
 * catalog-wide reset, which clears the product aggregates and the warehouse
 * balances together so they cannot drift apart.
 */
async function zeroAllQuantities(
  connection,
  {
    orgId,
    userId,
  },
) {
  if (!orgId) {
    return 0;
  }

  const [result] = await connection.execute(
    `
      UPDATE warehouse_products
      SET
        quantity = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(quantity, 0) <> 0
    `,
    [
      userId,
      orgId,
    ],
  );

  return result.affectedRows;
}

module.exports = {
  findAll,
  findByLocalId,
  findByWarehouseProduct,
  create,
  update,
  softDelete,
  adjustQuantity,
  zeroQuantities,
  zeroAllQuantities,
};
