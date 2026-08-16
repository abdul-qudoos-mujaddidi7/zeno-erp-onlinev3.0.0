const COLUMNS = `
  local_id AS id,
  local_id,
  name,
  description,
  reference_type,
  reference_id,
  file_type,
  file_size,
  file,
  thumbnail,
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
    referenceId = null,
    referenceType = null,
  
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

  if (referenceId) {
    conditions.push('reference_id = ?');
    values.push(referenceId);
  }

  if (referenceType) {
    conditions.push('reference_type = ?');
    values.push(referenceType);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        name LIKE ?
        OR         description LIKE ?
        OR         reference_type LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'documents',
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
      FROM documents
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
      INSERT INTO documents (
        org_id,
        local_id,
        name,
        description,
        reference_type,
        reference_id,
        file_type,
        file_size,
        file,
        thumbnail,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.name ?? null,
      data.description ?? null,
      data.reference_type ?? null,
      data.reference_id ?? null,
      data.file_type ?? null,
      data.file_size ?? null,
      data.file ?? null,
      data.thumbnail ?? null,
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
      UPDATE documents
      SET
        name = ?,
        description = ?,
        reference_type = ?,
        reference_id = ?,
        file_type = ?,
        file_size = ?,
        file = ?,
        thumbnail = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.name ?? null,
      data.description ?? null,
      data.reference_type ?? null,
      data.reference_id ?? null,
      data.file_type ?? null,
      data.file_size ?? null,
      data.file ?? null,
      data.thumbnail ?? null,
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
      UPDATE documents
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
