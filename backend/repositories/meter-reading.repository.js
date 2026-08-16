const COLUMNS = `
  local_id AS id,
  local_id,
  meter_id,
  reading_date,
  previous_reading,
  current_reading,
  consumption,
  rate_per_unit,
  calculated_amount,
  currency,
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
    meterId = null,
  
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

  if (meterId) {
    conditions.push('meter_id = ?');
    values.push(meterId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        currency LIKE ?
        OR description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'meter_readings',
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
      FROM meter_readings
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
      INSERT INTO meter_readings (
        org_id,
        local_id,
        meter_id,
        reading_date,
        previous_reading,
        current_reading,
        consumption,
        rate_per_unit,
        calculated_amount,
        currency,
        description,
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
      data.meter_id ?? null,
      data.reading_date ?? null,
      data.previous_reading ?? null,
      data.current_reading ?? null,
      data.consumption ?? null,
      data.rate_per_unit ?? null,
      data.calculated_amount ?? null,
      data.currency ?? null,
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
      UPDATE meter_readings
      SET
        meter_id = ?,
        reading_date = ?,
        previous_reading = ?,
        current_reading = ?,
        consumption = ?,
        rate_per_unit = ?,
        calculated_amount = ?,
        currency = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.meter_id ?? null,
      data.reading_date ?? null,
      data.previous_reading ?? null,
      data.current_reading ?? null,
      data.consumption ?? null,
      data.rate_per_unit ?? null,
      data.calculated_amount ?? null,
      data.currency ?? null,
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
      UPDATE meter_readings
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
