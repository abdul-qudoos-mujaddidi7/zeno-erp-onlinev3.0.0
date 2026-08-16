const COLUMNS = `
  local_id AS id,
  local_id,
  apartment_id,
  meter_number,
  utility_type,
  initial_reading,
  current_reading,
  installation_date,
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
    apartmentId = null,
  
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

  if (apartmentId) {
    conditions.push('apartment_id = ?');
    values.push(apartmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        meter_number LIKE ?
        OR utility_type LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'utility_meters',
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
      FROM utility_meters
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
      INSERT INTO utility_meters (
        org_id,
        local_id,
        apartment_id,
        meter_number,
        utility_type,
        initial_reading,
        current_reading,
        installation_date,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.apartment_id ?? null,
      data.meter_number ?? null,
      data.utility_type ?? null,
      data.initial_reading ?? null,
      data.current_reading ?? null,
      data.installation_date ?? null,
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
      UPDATE utility_meters
      SET
        apartment_id = ?,
        meter_number = ?,
        utility_type = ?,
        initial_reading = ?,
        current_reading = ?,
        installation_date = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.apartment_id ?? null,
      data.meter_number ?? null,
      data.utility_type ?? null,
      data.initial_reading ?? null,
      data.current_reading ?? null,
      data.installation_date ?? null,
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
      UPDATE utility_meters
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
