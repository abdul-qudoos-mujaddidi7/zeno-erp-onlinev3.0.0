const ACCOUNT_TYPE_COLUMNS = `
  local_id AS id,
  local_id,
  name,
  name_fa,
  name_ps,
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
        name LIKE ?
        OR name_fa LIKE ?
        OR name_ps LIKE ?
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

  const [rows] = await executor.execute(
    `
      SELECT
        ${ACCOUNT_TYPE_COLUMNS}
      FROM account_types
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
        ${ACCOUNT_TYPE_COLUMNS}
      FROM account_types
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
      INSERT INTO account_types (
        org_id,
        local_id,
        name,
        name_fa,
        name_ps,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.name ?? null,
      data.name_fa ?? null,
      data.name_ps ?? null,
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
  const sets = [];
  const values = [];

  const columnMap = {
    name: 'name',
    name_fa: 'name_fa',
    name_ps: 'name_ps',
    description: 'description',
    status: 'status',
  };

  for (const [field, column] of Object.entries(columnMap)) {
    if (data[field] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(data[field]);
    }
  }

  if (sets.length === 0) {
    return findByLocalId(
      connection,
      {
        orgId,
        localId,
      },
    );
  }

  sets.push(
    'version = COALESCE(version, 0) + 1',
    'updated_by = ?',
  );

  values.push(userId);

  values.push(
    orgId,
    localId,
  );

  await connection.execute(
    `
      UPDATE account_types
      SET ${sets.join(', ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
  );

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
      UPDATE account_types
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
