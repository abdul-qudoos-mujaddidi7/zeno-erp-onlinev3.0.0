const {
  resolveBatchReceivedAt,
} = require('../utils/fifoBatches');

const AppError =
  require('../errors/AppError');

const STOCK_BATCH_FIELDS = [
  'warehouse_id',
  'product_id',
  'received_at',
  'quantity_in',
  'source_type',
  'source_id',
  'quantity_remaining',
  'unit_cost',
  'currency',
  'status',
];

/*
 * mysql2 rejects undefined bind parameters, so every column is
 * normalized to SQL NULL when the caller did not provide a value.
 */
function normalizeData(data) {
  const out = {};
  for (const field of STOCK_BATCH_FIELDS) {
    out[field] = data[field] === undefined ? null : data[field];
  }
  return out;
}

const STOCK_BATCH_COLUMNS = `
  local_id AS id,
  local_id,
  warehouse_id,
  product_id,
  received_at,
  quantity_in,
  source_type,
  source_id,
  quantity_remaining,
  unit_cost,
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

const BATCH_CONSUMPTION_FIELDS = [
  'sale_id',
  'operation_type',
  'operation_id',
  'operation_item_id',
  'sale_item_id',
  'product_id',
  'stock_batch_id',
  'warehouse_id',
  'quantity',
  'total_cost',
  'unit_cost',
  'currency',
  'status',
];

const BATCH_CONSUMPTION_COLUMNS = `
  local_id AS id,
  local_id,
  sale_id,
  operation_type,
  operation_id,
  operation_item_id,
  sale_item_id,
  product_id,
  stock_batch_id,
  warehouse_id,
  quantity,
  total_cost,
  unit_cost,
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
    source_type,
    source_id,
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

  if (source_type) {
    conditions.push('source_type = ?');
    values.push(source_type);
  }

  if (source_id) {
    conditions.push('source_id = ?');
    values.push(source_id);
  }

  let sql = `
    SELECT
      ${STOCK_BATCH_COLUMNS}
    FROM stock_batches
    WHERE ${conditions.join(' AND ')}
    ORDER BY received_at DESC, local_id DESC
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
        ${STOCK_BATCH_COLUMNS}
      FROM stock_batches
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
      INSERT INTO stock_batches (
        org_id,
        local_id,
        warehouse_id,
        product_id,
        received_at,
        quantity_in,
        source_type,
        source_id,
        quantity_remaining,
        unit_cost,
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
      data.warehouse_id ?? null,
      data.product_id ?? null,
      resolveBatchReceivedAt(data.received_at),
      data.quantity_in ?? null,
      data.source_type ?? null,
      data.source_id ?? null,
      data.quantity_remaining ?? null,
      data.unit_cost ?? null,
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
  data = normalizeData(data);

  const [result] = await connection.execute(
    `
      UPDATE stock_batches
      SET
        warehouse_id = ?,
        product_id = ?,
        received_at = ?,
        quantity_in = ?,
        source_type = ?,
        source_id = ?,
        quantity_remaining = ?,
        unit_cost = ?,
        currency = ?,
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
      resolveBatchReceivedAt(data.received_at),
      data.quantity_in,
      data.source_type,
      data.source_id,
      data.quantity_remaining,
      data.unit_cost,
      data.currency,
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
      UPDATE stock_batches
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
 * ------- Batch-ledger internals (called inside purchase/sale/product
 *         service transactions) -------
 */

async function recordBatch(
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

/*
 * Open batches for FIFO/LIFO consumption, oldest first (FIFO) or
 * newest first (LIFO).
 *
 * Same calendar day is ordered by created_at then local_id.
 * Purchase bill_date is stored at midnight, while opening stock
 * uses a later clock time, so sorting by received_at alone would
 * consume the later purchase before opening stock.
 */
async function findOpenBatches(
  connection,
  {
    orgId,
    productId,
    warehouseId,
    method,
    forUpdate = false,
  },
) {
  const direction =
    String(method || '').toUpperCase() === 'LIFO'
      ? 'DESC'
      : 'ASC';

  /*
   * Deterministic order (received day, then created_at, then local_id)
   * is the lock order too, so concurrent consumptions take the same
   * rows in the same sequence and cannot deadlock or double-consume.
   */
  const [rows] = await connection.execute(
    `
      SELECT
        ${STOCK_BATCH_COLUMNS}
      FROM stock_batches
      WHERE org_id = ?
        AND product_id = ?
        AND warehouse_id = ?
        AND status = 1
        AND quantity_remaining > 0
      ORDER BY CAST(received_at AS DATE) ${direction}, created_at ${direction}, local_id ${direction}
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [
      orgId,
      productId,
      warehouseId,
    ],
  );

  return rows;
}

async function updateRemaining(
  connection,
  {
    orgId,
    localId,
    userId,
    quantityRemaining,
  },
) {
  /*
   * Hard guard: a batch layer must never be driven negative, whatever the
   * caller computed. This is the last line of defence for batch integrity.
   */
  if (Number(quantityRemaining) < -1e-9) {
    throw new AppError(
      'Batch remaining quantity cannot become negative.',
      409,
      'NEGATIVE_BATCH_REMAINING',
    );
  }

  await connection.execute(
    `
      UPDATE stock_batches
      SET
        quantity_remaining = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      quantityRemaining,
      userId,
      orgId,
      localId,
    ],
  );
}

async function findBatchesBySource(
  connection,
  {
    orgId,
    sourceType,
    sourceId,
    status = 1,
  },
) {
  const [rows] = await connection.execute(
    `
      SELECT
        ${STOCK_BATCH_COLUMNS}
      FROM stock_batches
      WHERE org_id = ?
        AND source_type = ?
        AND source_id = ?
        AND status = ?
      ORDER BY received_at ASC, local_id ASC
    `,
    [
      orgId,
      sourceType,
      sourceId,
      status,
    ],
  );

  return rows;
}

/*
 * Undo a source's batches (purchase delete / sale-return delete):
 * zero the remaining quantity and soft-delete every row.
 */
async function revertBatchesBySource(
  connection,
  {
    orgId,
    userId,
    sourceType,
    sourceId,
  },
) {
  const batches =
    await findBatchesBySource(
      connection,
      {
        orgId,
        sourceType,
        sourceId,
        status: 1,
      },
    );

  for (const batch of batches) {
    await updateRemaining(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
        quantityRemaining: 0,
      },
    );

    await softDelete(
      connection,
      {
        orgId,
        localId: batch.local_id,
        userId,
      },
    );
  }
}

function normalizeConsumption(data) {
  const out = {};
  for (const field of BATCH_CONSUMPTION_FIELDS) {
    out[field] = data[field] === undefined ? null : data[field];
  }
  return out;
}

async function createConsumption(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  data = normalizeConsumption(data);

  await connection.execute(
    `
      INSERT INTO batch_consumptions (
        org_id,
        local_id,
        sale_id,
        operation_type,
        operation_id,
        operation_item_id,
        sale_item_id,
        product_id,
        stock_batch_id,
        warehouse_id,
        quantity,
        total_cost,
        unit_cost,
        currency,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.sale_id ?? null,
      data.operation_type ?? null,
      data.operation_id ?? null,
      data.operation_item_id ?? null,
      data.sale_item_id ?? null,
      data.product_id ?? null,
      data.stock_batch_id ?? null,
      data.warehouse_id ?? null,
      data.quantity ?? null,
      data.total_cost ?? null,
      data.unit_cost ?? null,
      data.currency ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );
}

async function findConsumptions(
  connection,
  {
    orgId,
    operationType,
    operationId,
    saleId,
    productId,
    status = 1,
  },
) {
  /*
   * Filters are optional so a document can be located either by its
   * explicit operation key (transfer/waste/purchase_return) OR by the
   * sale it belongs to. Sale consumptions written before this fix have a
   * NULL operation_id, so sale-scoped lookups MUST work via sale_id to
   * keep historical sales reversible.
   */
  const conditions = [
    'org_id = ?',
  ];

  const values = [
    orgId,
  ];

  if (operationType) {
    conditions.push('operation_type = ?');
    values.push(operationType);
  }

  if (operationId !== undefined && operationId !== null) {
    conditions.push('operation_id = ?');
    values.push(operationId);
  }

  if (saleId) {
    conditions.push('sale_id = ?');
    values.push(saleId);
  }

  if (productId) {
    conditions.push('product_id = ?');
    values.push(productId);
  }

  conditions.push('status = ?');
  values.push(status);

  const [rows] = await connection.execute(
    `
      SELECT
        ${BATCH_CONSUMPTION_COLUMNS}
      FROM batch_consumptions
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_id ASC
    `,
    values,
  );

  return rows;
}

async function findConsumptionsForBatches(
  executor,
  {
    orgId,
    batchIds,
    status = 1,
  },
) {
  if (!batchIds || batchIds.length === 0) {
    return [];
  }

  const placeholders = batchIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${BATCH_CONSUMPTION_COLUMNS}
      FROM batch_consumptions
      WHERE org_id = ?
        AND stock_batch_id IN (${placeholders})
        AND status = ?
      ORDER BY local_id ASC
    `,
    [
      orgId,
      ...batchIds,
      status,
    ],
  );

  return rows;
}

async function softDeleteConsumption(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE batch_consumptions
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
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  recordBatch,
  findOpenBatches,
  updateRemaining,
  findBatchesBySource,
  revertBatchesBySource,
  createConsumption,
  findConsumptions,
  findConsumptionsForBatches,
  softDeleteConsumption,
};
