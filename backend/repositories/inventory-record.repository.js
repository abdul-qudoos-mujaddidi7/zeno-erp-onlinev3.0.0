const RECORD_COLUMNS = `
  local_id AS id,
  local_id,
  apartment_id,
  warehouse_id,
  account_id,
  record_type,
  record_number,
  record_date,
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
  record_status,
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

const ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  record_id,
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
  local_id AS id,
  local_id,
  record_id,
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
  record_id,
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
  return_id,
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
    recordStatus = '',
    accountId = '',
    apartmentId = '',
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

  if (recordStatus) {
    conditions.push('record_status = ?');
    values.push(recordStatus);
  }

  if (accountId) {
    conditions.push('account_id = ?');
    values.push(accountId);
  }

  if (apartmentId) {
    conditions.push('apartment_id = ?');
    values.push(apartmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        record_number LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'inventory_records',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY record_date DESC, local_id DESC',
    columnsSql: RECORD_COLUMNS,
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
        ${RECORD_COLUMNS}
      FROM inventory_records
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
      INSERT INTO inventory_records (
        org_id,
        local_id,
        apartment_id,
        warehouse_id,
        account_id,
        record_type,
        record_number,
        record_date,
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
        record_status,
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
        ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.apartment_id ?? null,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.record_type ?? null,
      data.record_number ?? null,
      data.record_date ?? null,
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
      data.record_status ?? null,
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

const RECORD_UPDATE_COLUMNS = [
  'apartment_id',
  'warehouse_id',
  'account_id',
  'record_type',
  'record_number',
  'record_date',
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
  'record_status',
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

  for (const column of RECORD_UPDATE_COLUMNS) {
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
        UPDATE inventory_records
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
      UPDATE inventory_records
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

async function findItemsByRecord(
  executor,
  {
    orgId,
    recordId,
    includeDeleted = false,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM inventory_record_items
      WHERE org_id = ?
        AND record_id = ?
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      recordId,
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
      INSERT INTO inventory_record_items (
        org_id,
        local_id,
        record_id,
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
        ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.record_id ?? null,
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
      data.extra_info ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM inventory_record_items
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

async function softDeleteItemsByRecord(
  connection,
  {
    orgId,
    recordId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE inventory_record_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND record_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      recordId,
    ],
  );
}

async function findPaymentsByRecordIds(
  executor,
  {
    orgId,
    recordIds,
    includeDeleted = false,
  },
) {
  if (!recordIds || recordIds.length === 0) {
    return [];
  }

  const placeholders =
    recordIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM inventory_record_payments
      WHERE org_id = ?
        AND record_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      ...recordIds,
    ],
  );

  return rows;
}

async function findPaymentsByRecord(
  executor,
  {
    orgId,
    recordId,
    includeDeleted = false,
  },
) {
  return findPaymentsByRecordIds(
    executor,
    {
      orgId,
      recordIds: [recordId],
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
      INSERT INTO inventory_record_payments (
        org_id,
        local_id,
        record_id,
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
      data.record_id ?? null,
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
      FROM inventory_record_payments
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
      FROM inventory_record_payments
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
      UPDATE inventory_record_payments
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

async function findReturnsByRecordIds(
  executor,
  {
    orgId,
    recordIds,
    includeDeleted = false,
  },
) {
  if (!recordIds || recordIds.length === 0) {
    return [];
  }

  const placeholders =
    recordIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM inventory_record_returns
      WHERE org_id = ?
        AND record_id IN (${placeholders})
        ${includeDeleted ? '' : 'AND status = 1'}
      ORDER BY created_at ASC, local_id ASC
    `,
    [
      orgId,
      ...recordIds,
    ],
  );

  return rows;
}

async function findReturnsByRecord(
  executor,
  {
    orgId,
    recordId,
    includeDeleted = false,
  },
) {
  return findReturnsByRecordIds(
    executor,
    {
      orgId,
      recordIds: [recordId],
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
      FROM inventory_record_returns
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
      INSERT INTO inventory_record_returns (
        org_id,
        local_id,
        record_id,
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
      data.record_id ?? null,
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
      INSERT INTO inventory_record_return_items (
        org_id,
        local_id,
        return_id,
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
      data.return_id ?? null,
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
      FROM inventory_record_return_items
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
      FROM inventory_record_return_items
      WHERE org_id = ?
        AND return_id = ?
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
      FROM inventory_record_return_items
      WHERE org_id = ?
        AND return_id IN (${placeholders})
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
      UPDATE inventory_record_returns
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
      UPDATE inventory_record_return_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND return_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      returnId,
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
  findItemsByRecord,
  createItem,
  softDeleteItemsByRecord,
  findPaymentsByRecord,
  findPaymentsByRecordIds,
  createPayment,
  findPaymentByLocalId,
  softDeletePayment,
  findReturnsByRecord,
  findReturnsByRecordIds,
  findReturnByLocalId,
  createReturn,
  createReturnItem,
  findReturnItemsByReturn,
  findReturnItemsByReturnIds,
  softDeleteReturn,
  softDeleteReturnItemsByReturn,
  adjustProductQuantity,
  findAccountByCode,
};
