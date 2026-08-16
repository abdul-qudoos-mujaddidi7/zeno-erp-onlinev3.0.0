const PAYMENT_COLUMNS = `
  local_id AS id,
  local_id,
  purchase_id,
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

async function findAll(
  executor,
  {
    orgId,
    status,
    parentId,
    dateFrom,
    dateTo,
  },
) {
  const conditions = [
    'org_id = ?',
  ];

  const values = [
    orgId,
  ];

  if (status !== undefined && status !== null) {
    conditions.push('status = ?');
    values.push(status);
  }

  if (parentId) {
    conditions.push('purchase_id = ?');
    values.push(parentId);
  }

  if (dateFrom) {
    conditions.push('COALESCE(payment_date, created_at) >= ?');
    values.push(dateFrom);
  }

  if (dateTo) {
    conditions.push('COALESCE(payment_date, created_at) < DATE_ADD(?, INTERVAL 1 DAY)');
    values.push(dateTo);
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM purchase_payments
      WHERE ${conditions.join(' AND ')}
      ORDER BY id DESC
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
        ${PAYMENT_COLUMNS}
      FROM purchase_payments
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

async function findByIds(
  executor,
  {
    orgId,
    ids,
  },
) {
  if (!ids || ids.length === 0) {
    return [];
  }

  const placeholders =
    ids.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM purchase_payments
      WHERE org_id = ?
        AND local_id IN (${placeholders})
    `,
    [
      orgId,
      ...ids,
    ],
  );

  return rows;
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
      INSERT INTO purchase_payments (
        org_id,
        local_id,
        purchase_id,
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
      data.purchase_id ?? null,
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
      UPDATE purchase_payments
      SET
        purchase_id = ?,
        account_id = ?,
        amount = ?,
        currency = ?,
        payment_date = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.purchase_id,
      data.account_id,
      data.amount,
      data.currency,
      data.payment_date,
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
      UPDATE purchase_payments
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
  findByIds,
  create,
  update,
  softDelete,
};
