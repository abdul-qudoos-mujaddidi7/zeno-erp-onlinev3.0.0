const STOCK_TRANSFER_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  to_warehouse_id,
  transfer_number,
  transfer_date,
  total_amount,
  description,
  currency,
  transfer_status,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const STOCK_TRANSFER_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  stock_transfer_id,
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
        transfer_number LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'stock_transfers',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY transfer_date DESC, local_id DESC',
    columnsSql: STOCK_TRANSFER_COLUMNS,
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
        ${STOCK_TRANSFER_COLUMNS}
      FROM stock_transfers
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
      INSERT INTO stock_transfers (
        org_id,
        local_id,
        warehouse_id,
        to_warehouse_id,
        transfer_number,
        transfer_date,
        total_amount,
        description,
        currency,
        transfer_status,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.to_warehouse_id ?? null,
      data.transfer_number ?? null,
      data.transfer_date ?? null,
      data.total_amount ?? null,
      data.description ?? null,
      data.currency ?? null,
      data.transfer_status ?? null,
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
      UPDATE stock_transfers
      SET
        warehouse_id = ?,
        to_warehouse_id = ?,
        transfer_number = ?,
        transfer_date = ?,
        total_amount = ?,
        description = ?,
        currency = ?,
        transfer_status = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.warehouse_id,
      data.to_warehouse_id,
      data.transfer_number,
      data.transfer_date,
      data.total_amount,
      data.description,
      data.currency,
      data.transfer_status,
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
      UPDATE stock_transfers
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

async function findItemsByTransfer(
  executor,
  {
    orgId,
    transferId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${STOCK_TRANSFER_ITEM_COLUMNS}
      FROM stock_transfer_items
      WHERE org_id = ?
        AND stock_transfer_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      transferId,
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
      INSERT INTO stock_transfer_items (
        org_id,
        local_id,
        stock_transfer_id,
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
      data.stock_transfer_id ?? null,
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
        ${STOCK_TRANSFER_ITEM_COLUMNS}
      FROM stock_transfer_items
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

async function softDeleteItemsByTransfer(
  connection,
  {
    orgId,
    transferId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE stock_transfer_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND stock_transfer_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      transferId,
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

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  findItemsByTransfer,
  createItem,
  softDeleteItemsByTransfer,
  findAccountByCode,
};
