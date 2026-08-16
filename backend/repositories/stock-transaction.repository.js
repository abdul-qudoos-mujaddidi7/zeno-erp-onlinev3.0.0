const STOCK_TRANSACTION_FIELDS = [
  'warehouse_id',
  'product_id',
  'product_unit_id',
  'reference_id',
  'reference_type',
  'transaction_type',
  'quantity',
  'unit_cost',
  'total_cost',
  'currency',
  'peer_price',
  'peer_currency',
  'date',
  'batch',
  'manufacturing_date',
  'expiry_date',
  'heaviness',
  'description',
  'status',
];

/*
 * mysql2 rejects undefined bind parameters, and internal
 * recordMovement calls only set the fields they know, so
 * every column is normalized to SQL NULL when absent.
 */
function normalizeData(data) {
  const out = {};
  for (const field of STOCK_TRANSACTION_FIELDS) {
    out[field] = data[field] === undefined ? null : data[field];
  }
  return out;
}

const STOCK_TRANSACTION_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  product_id,
  product_unit_id,
  reference_id,
  reference_type,
  transaction_type,
  quantity,
  unit_cost,
  total_cost,
  currency,
  peer_price,
  peer_currency,
  date,
  batch,
  manufacturing_date,
  expiry_date,
  heaviness,
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
    filters = {},
  },
) {
  const conditions = [
    'org_id = ?',
  ];

  const values = [
    orgId,
  ];

  const {
    status,
    product_id,
    product_ids,
    warehouse_id,
    reference_type,
    transaction_type,
    reference_id,
    limit,
  } = filters;

  if (
    status !== undefined &&
    status !== null &&
    status !== ''
  ) {
    conditions.push('status = ?');
    values.push(status);
  }

  if (product_id) {
    conditions.push('product_id = ?');
    values.push(product_id);
  }

  if (product_ids) {
    const ids = String(product_ids)
      .split(',')
      .map((part) => Number(String(part).trim()))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (ids.length > 0) {
      conditions.push(
        `product_id IN (${ids.map(() => '?').join(', ')})`,
      );
      values.push(...ids);
    }
  }

  if (warehouse_id) {
    conditions.push('warehouse_id = ?');
    values.push(warehouse_id);
  }

  if (reference_type) {
    conditions.push('reference_type = ?');
    values.push(reference_type);
  }

  if (transaction_type) {
    conditions.push('transaction_type = ?');
    values.push(transaction_type);
  }

  if (reference_id) {
    conditions.push('reference_id = ?');
    values.push(reference_id);
  }

  let sql = `
    SELECT
      ${STOCK_TRANSACTION_COLUMNS}
    FROM stock_transactions
    WHERE ${conditions.join(' AND ')}
    ORDER BY date DESC, local_id DESC
  `;

  if (limit) {
    sql += ` LIMIT ${Number(limit)}`;
  }

  const [rows] = await executor.execute(
    sql,
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
        ${STOCK_TRANSACTION_COLUMNS}
      FROM stock_transactions
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
  data = normalizeData(data);

  await connection.execute(
    `
      INSERT INTO stock_transactions (
        org_id,
        local_id,
        warehouse_id,
        product_id,
        product_unit_id,
        reference_id,
        reference_type,
        transaction_type,
        quantity,
        unit_cost,
        total_cost,
        currency,
        peer_price,
        peer_currency,
        date,
        batch,
        manufacturing_date,
        expiry_date,
        heaviness,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.warehouse_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.reference_id ?? null,
      data.reference_type ?? null,
      data.transaction_type ?? null,
      data.quantity ?? null,
      data.unit_cost ?? null,
      data.total_cost ?? null,
      data.currency ?? null,
      data.peer_price ?? null,
      data.peer_currency ?? null,
      data.date || new Date(),
      data.batch ?? null,
      data.manufacturing_date ?? null,
      data.expiry_date ?? null,
      data.heaviness ?? null,
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
  data = normalizeData(data);

  const [result] = await connection.execute(
    `
      UPDATE stock_transactions
      SET
        warehouse_id = ?,
        product_id = ?,
        product_unit_id = ?,
        reference_id = ?,
        reference_type = ?,
        transaction_type = ?,
        quantity = ?,
        unit_cost = ?,
        total_cost = ?,
        currency = ?,
        peer_price = ?,
        peer_currency = ?,
        date = ?,
        batch = ?,
        manufacturing_date = ?,
        expiry_date = ?,
        heaviness = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.warehouse_id,
      data.product_id,
      data.product_unit_id,
      data.reference_id,
      data.reference_type,
      data.transaction_type,
      data.quantity,
      data.unit_cost,
      data.total_cost,
      data.currency,
      data.peer_price,
      data.peer_currency,
      data.date || new Date(),
      data.batch,
      data.manufacturing_date,
      data.expiry_date,
      data.heaviness,
      data.description,
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
      UPDATE stock_transactions
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
 * recordMovement is used INSIDE the sale/purchase/product
 * service transactions so the online stock ledger moves in
 * lockstep with the product quantity and the per-warehouse
 * balance. The parent document (sale, purchase, product)
 * already writes the activity log, so movements are inserted
 * directly without their own log entries.
 */
async function recordMovement(
  connection,
  {
    orgId,
    userId,
    data,
  },
) {
  const {
    generateLocalId,
  } = require('../utils/generateLocalId');

  const localId = generateLocalId();

  return create(
    connection,
    {
      orgId,
      localId,
      userId,
      data,
    },
  );
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  recordMovement,
};
