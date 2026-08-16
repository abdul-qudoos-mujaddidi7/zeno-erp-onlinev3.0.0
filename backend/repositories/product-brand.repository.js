const SELECT_COLUMNS = `
  local_id AS id,
  local_id,
  name,
  code,
  description,
  status,
  COALESCE(version, 0) AS version,
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

  const normalizedSearch =
    String(search || '').trim();

  if (normalizedSearch) {
    conditions.push(`
      (
        name LIKE ?
        OR code LIKE ?
        OR description LIKE ?
      )
    `);

    const searchValue =
      `%${normalizedSearch}%`;

    values.push(
      searchValue,
      searchValue,
      searchValue,
    );
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${SELECT_COLUMNS}
      FROM product_brands
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
        ${SELECT_COLUMNS}
      FROM product_brands
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
  executor,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const [result] = await executor.execute(
    `
      INSERT INTO product_brands (
        org_id,
        local_id,
        name,
        code,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        1,
        ?,
        ?,
        NOW(3),
        NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.name ?? null,
      data.code ?? null,
      data.description ?? null,
      data.status ?? null,
      userId,
      userId,
    ],
  );

  return result;
}

async function update(
  executor,
  {
    orgId,
    localId,
    userId,
    data,
  },
) {
  const [result] = await executor.execute(
    `
      UPDATE product_brands
      SET
        name = ?,
        code = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.name ?? null,
      data.code ?? null,
      data.description ?? null,
      data.status ?? null,
      userId,
      orgId,
      localId,
    ],
  );

  return result;
}

async function softDelete(
  executor,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await executor.execute(
    `
      UPDATE product_brands
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

  return result;
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
};
