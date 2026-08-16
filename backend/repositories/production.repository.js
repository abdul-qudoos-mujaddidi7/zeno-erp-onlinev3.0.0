const PRODUCTION_COLUMNS = `
  local_id AS id,
  local_id,
  production_type,
  production_number,
  production_start_date,
  production_end_date,
  production_status,
  product_id,
  bom_id,
  warehouse_id,
  quantity,
  product_unit_id,
  total_amount,
  currency,
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

const PRODUCTION_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  production_id,
  product_id,
  product_unit_id,
  quantity,
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

const PRODUCTION_OPERATION_COLUMNS = `
  local_id AS id,
  local_id,
  production_id,
  bom_operation_id,
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

const PAYMENT_COLUMNS = `
  local_id AS id,
  local_id,
  production_id,
  account_id,
  amount,
  currency,
  payment_date,
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

const RETURN_COLUMNS = `
  local_id AS id,
  local_id,
  production_id,
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
  production_return_id,
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

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    productionStatus = null,
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

  if (productionStatus) {
    conditions.push('production_status = ?');
    values.push(productionStatus);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        production_number LIKE ?
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
        ${PRODUCTION_COLUMNS}
      FROM productions
      WHERE ${conditions.join(' AND ')}
      ORDER BY production_end_date DESC, local_id DESC
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
        ${PRODUCTION_COLUMNS}
      FROM productions
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
      INSERT INTO productions (
        org_id,
        local_id,
        production_type,
        production_number,
        production_start_date,
        production_end_date,
        production_status,
        product_id,
        bom_id,
        warehouse_id,
        quantity,
        product_unit_id,
        total_amount,
        currency,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.production_type ?? null,
      data.production_number ?? null,
      data.production_start_date ?? null,
      data.production_end_date ?? null,
      data.production_status ?? null,
      data.product_id ?? null,
      data.bom_id ?? null,
      data.warehouse_id ?? null,
      data.quantity ?? null,
      data.product_unit_id ?? null,
      data.total_amount ?? null,
      data.currency ?? null,
      data.description ?? null,
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
      UPDATE productions
      SET
        production_type = ?,
        production_number = ?,
        production_start_date = ?,
        production_end_date = ?,
        production_status = ?,
        product_id = ?,
        bom_id = ?,
        warehouse_id = ?,
        quantity = ?,
        product_unit_id = ?,
        total_amount = ?,
        currency = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.production_type ?? null,
      data.production_number ?? null,
      data.production_start_date ?? null,
      data.production_end_date ?? null,
      data.production_status ?? null,
      data.product_id ?? null,
      data.bom_id ?? null,
      data.warehouse_id ?? null,
      data.quantity ?? null,
      data.product_unit_id ?? null,
      data.total_amount ?? null,
      data.currency ?? null,
      data.description ?? null,
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
      UPDATE productions
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

async function findItemsByProduction(
  executor,
  {
    orgId,
    productionId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${PRODUCTION_ITEM_COLUMNS}
      FROM production_items
      WHERE org_id = ?
        AND production_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      productionId,
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
      INSERT INTO production_items (
        org_id,
        local_id,
        production_id,
        product_id,
        product_unit_id,
        quantity,
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.production_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
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
        ${PRODUCTION_ITEM_COLUMNS}
      FROM production_items
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

async function softDeleteItemsByProduction(
  connection,
  {
    orgId,
    productionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE production_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND production_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      productionId,
    ],
  );
}

async function findOperationsByProduction(
  executor,
  {
    orgId,
    productionId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${PRODUCTION_OPERATION_COLUMNS}
      FROM production_operations
      WHERE org_id = ?
        AND production_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY sequence ASC, local_id ASC
    `,
    [
      orgId,
      productionId,
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
      INSERT INTO production_operations (
        org_id,
        local_id,
        production_id,
        bom_operation_id,
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
      data.production_id ?? null,
      data.bom_operation_id ?? null,
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
        ${PRODUCTION_OPERATION_COLUMNS}
      FROM production_operations
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

async function softDeleteOperationsByProduction(
  connection,
  {
    orgId,
    productionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE production_operations
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND production_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      productionId,
    ],
  );
}

async function findPaymentsByProduction(
  executor,
  {
    orgId,
    productionId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM production_payments
      WHERE org_id = ?
        AND production_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      productionId,
    ],
  );

  return rows;
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
      FROM production_payments
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
      INSERT INTO production_payments (
        org_id,
        local_id,
        production_id,
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.production_id ?? null,
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

  return findPaymentByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDeletePayment(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE production_payments
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

  return findPaymentByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDeletePaymentsByProduction(
  connection,
  {
    orgId,
    productionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE production_payments
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND production_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      productionId,
    ],
  );
}

async function findReturnsByProduction(
  executor,
  {
    orgId,
    productionId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM production_returns
      WHERE org_id = ?
        AND production_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      productionId,
    ],
  );

  return rows;
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
      FROM production_returns
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
      INSERT INTO production_returns (
        org_id,
        local_id,
        production_id,
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.production_id ?? null,
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
      INSERT INTO production_return_items (
        org_id,
        local_id,
        production_return_id,
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
      data.production_return_id ?? null,
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
      FROM production_return_items
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
      FROM production_return_items
      WHERE org_id = ?
        AND production_return_id = ?
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

async function softDeleteReturn(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE production_returns
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
      UPDATE production_return_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND production_return_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      returnId,
    ],
  );
}

async function softDeleteReturnsByProduction(
  connection,
  {
    orgId,
    productionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE production_returns
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND production_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      productionId,
    ],
  );
}

async function softDeleteReturnItemsByProduction(
  connection,
  {
    orgId,
    productionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE production_return_items pri
      INNER JOIN production_returns pr
        ON pr.org_id = pri.org_id
        AND pr.local_id = pri.production_return_id
      SET
        pri.status = 0,
        pri.version = COALESCE(pri.version, 0) + 1,
        pri.updated_by = ?,
        pri.updated_at = NOW(3)
      WHERE pri.org_id = ?
        AND pr.production_id = ?
        AND pri.status = 1
    `,
    [
      userId,
      orgId,
      productionId,
    ],
  );
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

async function updateProductBuyPrice(
  connection,
  {
    orgId,
    productId,
    buyPrice,
    buyCurrency,
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
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      buyPrice,
      buyCurrency,
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
  findItemsByProduction,
  createItem,
  softDeleteItemsByProduction,
  findOperationsByProduction,
  createOperation,
  softDeleteOperationsByProduction,
  findPaymentsByProduction,
  findPaymentByLocalId,
  createPayment,
  softDeletePayment,
  softDeletePaymentsByProduction,
  findReturnsByProduction,
  findReturnByLocalId,
  createReturn,
  createReturnItem,
  findReturnItemsByReturn,
  softDeleteReturn,
  softDeleteReturnItemsByReturn,
  softDeleteReturnsByProduction,
  softDeleteReturnItemsByProduction,
  adjustProductQuantity,
  updateProductBuyPrice,
  findAccountByCode,
};
