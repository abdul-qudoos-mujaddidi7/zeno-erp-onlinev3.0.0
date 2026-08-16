const COLUMNS = `
  local_id AS id,
  local_id,
  lease_id,
  invoice_number,
  issue_date,
  due_date,
  billing_period_start,
  billing_period_end,
  base_rent,
  late_fee,
  utility_charges,
  other_charges,
  total_amount,
  paid_amount,
  currency,
  invoice_status,
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


const {
  paginateSelect,
} = require('../utils/pagination');
async function findAll(
  executor,
  {
    orgId,
    status = 1,
    search = '',
    leaseId = null,
    invoiceStatus = null,
  
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

  if (leaseId) {
    conditions.push('lease_id = ?');
    values.push(leaseId);
  }

  if (invoiceStatus) {
    conditions.push('invoice_status = ?');
    values.push(invoiceStatus);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        invoice_number LIKE ?
        OR invoice_status LIKE ?
        OR currency LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'rent_invoices',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY local_id DESC',
    columnsSql: COLUMNS,
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
        ${COLUMNS}
      FROM rent_invoices
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
      INSERT INTO rent_invoices (
        org_id,
        local_id,
        lease_id,
        invoice_number,
        issue_date,
        due_date,
        billing_period_start,
        billing_period_end,
        base_rent,
        late_fee,
        utility_charges,
        other_charges,
        total_amount,
        paid_amount,
        currency,
        invoice_status,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.lease_id ?? null,
      data.invoice_number ?? null,
      data.issue_date ?? null,
      data.due_date ?? null,
      data.billing_period_start ?? null,
      data.billing_period_end ?? null,
      data.base_rent ?? null,
      data.late_fee ?? null,
      data.utility_charges ?? null,
      data.other_charges ?? null,
      data.total_amount ?? null,
      data.paid_amount ?? null,
      data.currency ?? null,
      data.invoice_status ?? null,
      data.description ?? null,
      data.status ?? 1,
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
      UPDATE rent_invoices
      SET
        lease_id = ?,
        invoice_number = ?,
        issue_date = ?,
        due_date = ?,
        billing_period_start = ?,
        billing_period_end = ?,
        base_rent = ?,
        late_fee = ?,
        utility_charges = ?,
        other_charges = ?,
        total_amount = ?,
        paid_amount = ?,
        currency = ?,
        invoice_status = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.lease_id ?? null,
      data.invoice_number ?? null,
      data.issue_date ?? null,
      data.due_date ?? null,
      data.billing_period_start ?? null,
      data.billing_period_end ?? null,
      data.base_rent ?? null,
      data.late_fee ?? null,
      data.utility_charges ?? null,
      data.other_charges ?? null,
      data.total_amount ?? null,
      data.paid_amount ?? null,
      data.currency ?? null,
      data.invoice_status ?? null,
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
      UPDATE rent_invoices
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

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
};
