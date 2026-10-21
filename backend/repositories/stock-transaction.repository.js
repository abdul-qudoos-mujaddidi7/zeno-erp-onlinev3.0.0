const {
  paginateSelect,
} = require('../utils/pagination');

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

/*
 * The list filters live in one builder so the unpaginated read (used by the
 * edit/delete modals and by every internal reconciliation) and the paginated
 * read the index page uses can never drift apart.
 */
function buildListQuery({ orgId, filters = {} }) {
  const conditions = [
    'org_id = ?',
  ];

  const values = [
    orgId,
  ];

  const {
    status,
    date_from,
    date_to,
    product_id,
    product_ids,
    warehouse_id,
    reference_type,
    transaction_type,
    reference_id,
    search,
  } = filters;

  if (
    status !== undefined &&
    status !== null &&
    status !== ''
  ) {
    conditions.push('status = ?');
    values.push(status);
  }

  if (date_from) {
    conditions.push('date >= ?');
    values.push(date_from);
  }

  if (date_to) {
    conditions.push('date <= ?');
    values.push(date_to);
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

  /*
   * The index page searches descriptions. The comparison is deliberately left
   * to the column's own collation: MySQL's default is case-insensitive, which
   * is what the browser-side filter it replaces did. Whitespace is trimmed
   * before the test, so a box holding only spaces does not add a `LIKE '%%'`
   * condition that would defeat the index for the page.
   */
  const searchTerm = String(search ?? '').trim();

  if (searchTerm) {
    conditions.push('description LIKE ?');
    values.push(`%${searchTerm}%`);
  }

  return {
    whereSql: conditions.join(' AND '),
    values,
  };
}

/*
 * Sortable columns, mapped to the physical column each one means. The list is a
 * whitelist because the value reaches an ORDER BY clause that cannot be a bind
 * parameter.
 */
const LIST_SORT_COLUMNS = {
  id: 'local_id',
  local_id: 'local_id',
  date: 'date',
  created_at: 'created_at',
  updated_at: 'updated_at',
  transaction_type: 'transaction_type',
  reference_type: 'reference_type',
  reference_id: 'reference_id',
  quantity: 'quantity',
  unit_cost: 'unit_cost',
  total_cost: 'total_cost',
  status: 'status',
};

/*
 * Newest first. `created_at` is the default because that is the order the index
 * page has always shown - it sorted the rows it had downloaded by created_at -
 * and local_id keeps that order stable when two rows share a timestamp.
 */
const LIST_DEFAULT_ORDER = 'created_at DESC, local_id DESC';

function listOrderBy(filters = {}) {
  const column = LIST_SORT_COLUMNS[filters.sort];
  if (!column) return LIST_DEFAULT_ORDER;

  const direction =
    String(filters.direction || '').toLowerCase() === 'asc'
      ? 'ASC'
      : 'DESC';

  /* local_id is already the tiebreak, so it is not repeated for itself. */
  if (column === 'local_id') return `local_id ${direction}`;

  return `${column} ${direction}, local_id DESC`;
}

async function findAll(
  executor,
  {
    orgId,
    filters = {},
  },
) {
  const { whereSql, values } = buildListQuery({ orgId, filters });

  let sql = `
    SELECT
      ${STOCK_TRANSACTION_COLUMNS}
    FROM stock_transactions
    WHERE ${whereSql}
    ORDER BY date DESC, local_id DESC
  `;

  if (filters.limit) {
    sql += ` LIMIT ${Number(filters.limit)}`;
  }

  const [rows] = await executor.execute(
    sql,
    values,
  );

  return rows;
}

/*
 * One page of transactions plus the filtered total the footer reports.
 *
 * Only reached when a caller actually asks for a page, so the unpaginated read
 * above keeps serving the modals and the internal reconciliations unchanged.
 */
async function findPage(
  executor,
  {
    orgId,
    filters = {},
    pagination = null,
  },
) {
  const { whereSql, values } = buildListQuery({ orgId, filters });

  return paginateSelect(executor, {
    tableSql: 'stock_transactions',
    whereSql,
    values,
    orderBySql: `ORDER BY ${listOrderBy(filters)}`,
    columnsSql: STOCK_TRANSACTION_COLUMNS,
    pagination,
    skipCount:
      filters.skipCount === true || Number(filters.skip_count) === 1,
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

/*
 * Bulk counterpart of recordMovement, for operations that move stock for the
 * whole catalog at once. Same columns, still inside the caller's transaction.
 */
async function recordMovements(
  connection,
  {
    orgId,
    userId,
    rows,
    chunkSize = 200,
  },
) {
  const {
    generateLocalId,
  } = require('../utils/generateLocalId');

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3))').join(', ');
    const values = chunk.flatMap((row) => [
      orgId,
      generateLocalId(),
      row.warehouse_id ?? null,
      row.product_id ?? null,
      row.product_unit_id ?? null,
      row.reference_id ?? null,
      row.reference_type ?? null,
      row.transaction_type ?? null,
      row.quantity ?? null,
      row.date || new Date(),
      row.description ?? null,
      userId,
      userId,
    ]);

    await connection.execute(
      `INSERT INTO stock_transactions
        (org_id, local_id, warehouse_id, product_id, product_unit_id, reference_id, reference_type,
          transaction_type, quantity, date, description, version, created_by, updated_by, created_at, updated_at)
        VALUES ${placeholders}`,
      values,
    );
  }
}

module.exports = {
  findAll,
  findPage,
  buildListQuery,
  listOrderBy,
  findByLocalId,
  create,
  update,
  softDelete,
  recordMovement,
  recordMovements,
};
