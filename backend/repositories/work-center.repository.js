const WORK_CENTER_COLUMNS = `
  local_id AS id,
  local_id,
  code,
  name,
  description,
  cost_per_hour,
  cost_currency,
  capacity_per_hour,
  capacity_unit_id,
  setup_time,
  setup_time_unit,
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

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        code LIKE ?
        OR name LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${WORK_CENTER_COLUMNS}
      FROM work_centers
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC, local_id ASC
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
        ${WORK_CENTER_COLUMNS}
      FROM work_centers
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
      INSERT INTO work_centers (
        org_id,
        local_id,
        code,
        name,
        description,
        cost_per_hour,
        cost_currency,
        capacity_per_hour,
        capacity_unit_id,
        setup_time,
        setup_time_unit,
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
      data.code ?? null,
      data.name ?? null,
      data.description ?? null,
      data.cost_per_hour ?? null,
      data.cost_currency ?? null,
      data.capacity_per_hour ?? null,
      data.capacity_unit_id ?? null,
      data.setup_time ?? null,
      data.setup_time_unit ?? null,
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
      UPDATE work_centers
      SET
        code = ?,
        name = ?,
        description = ?,
        cost_per_hour = ?,
        cost_currency = ?,
        capacity_per_hour = ?,
        capacity_unit_id = ?,
        setup_time = ?,
        setup_time_unit = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.code ?? null,
      data.name ?? null,
      data.description ?? null,
      data.cost_per_hour ?? null,
      data.cost_currency ?? null,
      data.capacity_per_hour ?? null,
      data.capacity_unit_id ?? null,
      data.setup_time ?? null,
      data.setup_time_unit ?? null,
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
      UPDATE work_centers
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
