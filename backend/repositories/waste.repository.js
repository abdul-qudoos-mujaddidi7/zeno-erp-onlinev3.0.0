const WASTE_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  reference_number,
  date,
  total_amount,
  description,
  currency,
  waste_status,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const WASTE_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  waste_id,
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
async function findAll(
  executor,
  {
    orgId,
    status = 1,
    search = '',
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

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        reference_number LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  if (dateFrom) {
    conditions.push('COALESCE(date, created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('COALESCE(date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }

  return paginateSelect(executor, {
    tableSql: 'wastes',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY date DESC, local_id DESC',
    columnsSql: WASTE_COLUMNS,
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
        ${WASTE_COLUMNS}
      FROM wastes
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
      INSERT INTO wastes (
        org_id,
        local_id,
        warehouse_id,
        reference_number,
        date,
        total_amount,
        description,
        currency,
        waste_status,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.reference_number ?? null,
      data.date ?? null,
      data.total_amount ?? null,
      data.description ?? null,
      data.currency ?? null,
      data.waste_status ?? null,
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

async function update(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE wastes
      SET
        warehouse_id = ?,
        reference_number = ?,
        date = ?,
        total_amount = ?,
        description = ?,
        currency = ?,
        waste_status = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.warehouse_id,
      data.reference_number,
      data.date,
      data.total_amount,
      data.description,
      data.currency,
      data.waste_status,
      data.status,
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
      UPDATE wastes
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

async function findItemsByWaste(
  executor,
  {
    orgId,
    wasteId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${WASTE_ITEM_COLUMNS}
      FROM waste_items
      WHERE org_id = ?
        AND waste_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      wasteId,
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
      INSERT INTO waste_items (
        org_id,
        local_id,
        waste_id,
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.waste_id ?? null,
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
        ${WASTE_ITEM_COLUMNS}
      FROM waste_items
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

async function softDeleteItemsByWaste(
  connection,
  {
    orgId,
    wasteId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE waste_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND waste_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      wasteId,
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
        name,
        code,
        account_type_id,
        currency
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

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  findItemsByWaste,
  createItem,
  softDeleteItemsByWaste,
  findAccountByCode,
  adjustProductQuantity,
};
