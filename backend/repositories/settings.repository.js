const SETTINGS_COLUMNS = `
  local_id AS id,
  local_id,
  category,
  type,
  \`key\`,
  value,
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

const UPDATE_COLUMN_MAP = {
  category: 'category',
  type: 'type',
  key: '`key`',
  value: 'value',
  description: 'description',
  status: 'status',
};

async function findAll(
  executor,
  {
    orgId,
    status = 1,
    key = '',
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

  if (key) {
    conditions.push('`key` = ?');
    values.push(key);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(
      '(`key` LIKE ? OR description LIKE ?)',
    );

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${SETTINGS_COLUMNS}
      FROM settings
      WHERE ${conditions.join(' AND ')}
      ORDER BY \`key\` ASC, local_id ASC
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
        ${SETTINGS_COLUMNS}
      FROM settings
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
      INSERT INTO settings (
        org_id,
        local_id,
        category,
        type,
        \`key\`,
        value,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.category ?? null,
      data.type ?? null,
      data.key ?? null,
      data.value ?? null,
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
  const assignments = [];
  const values = [];

  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP)) {
    if (data[key] !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(data[key]);
    }
  }

  assignments.push('version = COALESCE(version, 0) + 1');
  assignments.push('updated_by = ?');
  assignments.push('updated_at = NOW(3)');
  values.push(userId);

  values.push(orgId, localId);

  const [result] = await connection.execute(
    `
      UPDATE settings
      SET
        ${assignments.join(',\n        ')}
      WHERE org_id = ?
        AND local_id = ?
    `,
    values,
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
      UPDATE settings
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
