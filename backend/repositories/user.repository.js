const USER_COLUMNS = `
  local_id AS id,
  local_id,
  username,
  email,
  first_name,
  last_name,
  phone,
  address,
  description,
  permissions,
  role_id,
  department_id,
  language,
  theme,
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
  username: 'username',
  email: 'email',
  first_name: 'first_name',
  last_name: 'last_name',
  phone: 'phone',
  address: 'address',
  description: 'description',
  permissions: 'permissions',
  role_id: 'role_id',
  department_id: 'department_id',
  language: 'language',
  theme: 'theme',
  status: 'status',
  password: 'password_hash',
};


const {
  paginateSelect,
} = require('../utils/pagination');
async function findAll(
  executor,
  {
    orgId,
    status,
    search = '',
    roleId = null,
    departmentId = null,
    pagination = null,
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

  if (roleId) {
    conditions.push('role_id = ?');
    values.push(roleId);
  }

  if (departmentId) {
    conditions.push('department_id = ?');
    values.push(departmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        username LIKE ?
        OR email LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
        OR phone LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'users',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY created_at DESC, local_id DESC',
    columnsSql: USER_COLUMNS,
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
        ${USER_COLUMNS}
      FROM users
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

async function findUsernameCount(
  executor,
  {
    orgId,
    username,
    excludeLocalId = null,
  },
) {
  const conditions = [
    'org_id = ?',
    'username = ?',
  ];

  const values = [
    orgId,
    username,
  ];

  if (excludeLocalId !== null) {
    conditions.push('local_id <> ?');
    values.push(excludeLocalId);
  }

  const [rows] = await executor.execute(
    `
      SELECT COUNT(*) AS count
      FROM users
      WHERE ${conditions.join(' AND ')}
    `,
    values,
  );

  return Number(rows[0]?.count || 0);
}

async function findEmailCount(
  executor,
  {
    orgId,
    email,
    excludeLocalId = null,
  },
) {
  if (!email) {
    return 0;
  }

  const conditions = [
    'org_id = ?',
    'email = ?',
  ];

  const values = [
    orgId,
    email,
  ];

  if (excludeLocalId !== null) {
    conditions.push('local_id <> ?');
    values.push(excludeLocalId);
  }

  const [rows] = await executor.execute(
    `
      SELECT COUNT(*) AS count
      FROM users
      WHERE ${conditions.join(' AND ')}
    `,
    values,
  );

  return Number(rows[0]?.count || 0);
}

async function create(
  connection,
  {
    orgId,
    localId,
    userId,
    data,
    passwordHash,
  },
) {
  await connection.execute(
    `
      INSERT INTO users (
        org_id,
        local_id,
        username,
        email,
        first_name,
        last_name,
        phone,
        address,
        description,
        permissions,
        role_id,
        department_id,
        language,
        theme,
        password_hash,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.username ?? null,
      data.email ?? null,
      data.first_name ?? null,
      data.last_name ?? null,
      data.phone ?? null,
      data.address ?? null,
      data.description ?? null,
      data.permissions ?? null,
      data.role_id ?? null,
      data.department_id ?? null,
      data.language ?? null,
      data.theme ?? null,
      passwordHash,
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
    passwordHash,
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

  if (passwordHash !== undefined) {
    assignments.push('password_hash = ?');
    values.push(passwordHash);
  }

  assignments.push('version = COALESCE(version, 0) + 1');
  assignments.push('updated_by = ?');
  assignments.push('updated_at = NOW(3)');
  values.push(userId);

  values.push(orgId, localId);

  const [result] = await connection.execute(
    `
      UPDATE users
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
      UPDATE users
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
  findUsernameCount,
  findEmailCount,
  create,
  update,
  softDelete,
};
