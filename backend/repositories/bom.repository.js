const BOM_COLUMNS = `
  local_id AS id,
  local_id,
  product_id,
  bill_number,
  bill_date,
  bill_status,
  quantity,
  product_unit_id,
  description,
  total_amount,
  currency,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const BOM_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  bom_id,
  product_id,
  product_unit_id,
  quantity,
  wastage_percent,
  unit_price,
  subtotal,
  currency,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const BOM_OPERATION_COLUMNS = `
  local_id AS id,
  local_id,
  bom_id,
  work_center_id,
  operation_name,
  sequence,
  setup_time,
  setup_time_unit,
  run_time,
  run_time_unit,
  cost_per_hour,
  cost_currency,
  fixed_cost,
  labor_count,
  efficiency,
  description,
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
    billStatus = null,
    search = '',
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

  if (billStatus) {
    conditions.push('bill_status = ?');
    values.push(billStatus);
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

  const [rows] = await executor.execute(
    `
      SELECT
        ${BOM_COLUMNS}
      FROM boms
      WHERE ${conditions.join(' AND ')}
      ORDER BY bill_date DESC, local_id DESC
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
        ${BOM_COLUMNS}
      FROM boms
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
      INSERT INTO boms (
        org_id,
        local_id,
        product_id,
        bill_number,
        bill_date,
        bill_status,
        quantity,
        product_unit_id,
        description,
        total_amount,
        currency,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.product_id ?? null,
      data.bill_number ?? null,
      data.bill_date ?? null,
      data.bill_status ?? null,
      data.quantity ?? null,
      data.product_unit_id ?? null,
      data.description ?? null,
      data.total_amount ?? null,
      data.currency ?? null,
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
      UPDATE boms
      SET
        product_id = ?,
        bill_number = ?,
        bill_date = ?,
        bill_status = ?,
        quantity = ?,
        product_unit_id = ?,
        description = ?,
        total_amount = ?,
        currency = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.product_id ?? null,
      data.bill_number ?? null,
      data.bill_date ?? null,
      data.bill_status ?? null,
      data.quantity ?? null,
      data.product_unit_id ?? null,
      data.description ?? null,
      data.total_amount ?? null,
      data.currency ?? null,
      data.status ?? null,
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
      UPDATE boms
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

async function findItemsByBom(
  executor,
  {
    orgId,
    bomId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${BOM_ITEM_COLUMNS}
      FROM bom_items
      WHERE org_id = ?
        AND bom_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      bomId,
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
      INSERT INTO bom_items (
        org_id,
        local_id,
        bom_id,
        product_id,
        product_unit_id,
        quantity,
        wastage_percent,
        unit_price,
        subtotal,
        currency,
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
      data.bom_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.wastage_percent ?? null,
      data.unit_price ?? null,
      data.subtotal ?? null,
      data.currency ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${BOM_ITEM_COLUMNS}
      FROM bom_items
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

async function softDeleteItemsByBom(
  connection,
  {
    orgId,
    bomId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE bom_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND bom_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      bomId,
    ],
  );
}

async function findOperationsByBom(
  executor,
  {
    orgId,
    bomId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${BOM_OPERATION_COLUMNS}
      FROM bom_operations
      WHERE org_id = ?
        AND bom_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY sequence ASC, local_id ASC
    `,
    [
      orgId,
      bomId,
    ],
  );

  return rows;
}

async function createOperation(
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
      INSERT INTO bom_operations (
        org_id,
        local_id,
        bom_id,
        work_center_id,
        operation_name,
        sequence,
        setup_time,
        setup_time_unit,
        run_time,
        run_time_unit,
        cost_per_hour,
        cost_currency,
        fixed_cost,
        labor_count,
        efficiency,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.bom_id ?? null,
      data.work_center_id ?? null,
      data.operation_name ?? null,
      data.sequence ?? null,
      data.setup_time ?? null,
      data.setup_time_unit ?? null,
      data.run_time ?? null,
      data.run_time_unit ?? null,
      data.cost_per_hour ?? null,
      data.cost_currency ?? null,
      data.fixed_cost ?? null,
      data.labor_count ?? null,
      data.efficiency ?? null,
      data.description ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${BOM_OPERATION_COLUMNS}
      FROM bom_operations
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

async function softDeleteOperationsByBom(
  connection,
  {
    orgId,
    bomId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE bom_operations
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND bom_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      bomId,
    ],
  );
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  findItemsByBom,
  createItem,
  softDeleteItemsByBom,
  findOperationsByBom,
  createOperation,
  softDeleteOperationsByBom,
};
