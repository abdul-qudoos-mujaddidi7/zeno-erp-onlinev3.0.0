/*
 * Every organization gets exactly one category with this name. It is what
 * existing units are moved into by scripts/backfill-unit-categories.js and what
 * a new unit falls back to when no category was chosen.
 *
 * `is_default` is computed rather than stored so the name lives in one place
 * and no client has to hardcode it.
 */
const DEFAULT_UNIT_CATEGORY_NAME = 'General';

const UNIT_CATEGORY_COLUMNS = `
  local_id AS id,
  local_id,
  name,
  description,
  status,
  (name = '${DEFAULT_UNIT_CATEGORY_NAME}') AS is_default,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
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
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${UNIT_CATEGORY_COLUMNS}
      FROM unit_categories
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
        ${UNIT_CATEGORY_COLUMNS}
      FROM unit_categories
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

async function findByName(
  executor,
  {
    orgId,
    name,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        ${UNIT_CATEGORY_COLUMNS}
      FROM unit_categories
      WHERE org_id = ?
        AND name = ?
      LIMIT 1
    `,
    [
      orgId,
      name,
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
      INSERT INTO unit_categories (
        org_id,
        local_id,
        name,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.name ?? null,
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
      UPDATE unit_categories
      SET
        name = ?,
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
      UPDATE unit_categories
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

async function findDefault(
  executor,
  {
    orgId,
  },
) {
  return findByName(
    executor,
    {
      orgId,
      name: DEFAULT_UNIT_CATEGORY_NAME,
    },
  );
}

/**
 * Returns the organization's default category, creating it on first use.
 *
 * Safe to call from inside a bigger transaction and safe to call twice: the
 * INSERT relies on the `(org_id, name)` unique key with a no-op ON DUPLICATE
 * KEY clause, so a concurrent caller can never create a second "General".
 */
async function ensureDefault(
  connection,
  {
    orgId,
    userId,
    localId,
  },
) {
  const existing = await findDefault(
    connection,
    {
      orgId,
    },
  );

  if (existing) {
    return existing;
  }

  await connection.execute(
    `
      INSERT INTO unit_categories (
        org_id,
        local_id,
        name,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, NULL, 1, 1, ?, ?, NOW(3), NOW(3)
      )
      ON DUPLICATE KEY UPDATE local_id = local_id
    `,
    [
      orgId,
      localId,
      DEFAULT_UNIT_CATEGORY_NAME,
      userId,
      userId,
    ],
  );

  return findDefault(
    connection,
    {
      orgId,
    },
  );
}

module.exports = {
  DEFAULT_UNIT_CATEGORY_NAME,
  findAll,
  findByLocalId,
  findByName,
  create,
  update,
  softDelete,
  findDefault,
  ensureDefault,
};
