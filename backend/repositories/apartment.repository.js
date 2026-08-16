const COLUMNS = `
  local_id AS id,
  local_id,
  building_id,
  floor_id,
  unit_number,
  area_sqm,
  bedrooms,
  bathrooms,
  unit_type,
  rent_amount,
  sale_price,
  currency,
  occupancy_status,
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
    buildingId = null,
    floorId = null,
  
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

  if (buildingId) {
    conditions.push('building_id = ?');
    values.push(buildingId);
  }

  if (floorId) {
    conditions.push('floor_id = ?');
    values.push(floorId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        unit_number LIKE ?
        OR unit_type LIKE ?
        OR occupancy_status LIKE ?
        OR currency LIKE ?
        OR description LIKE ?
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
    tableSql: 'apartments',
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
      FROM apartments
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
      INSERT INTO apartments (
        org_id,
        local_id,
        building_id,
        floor_id,
        unit_number,
        area_sqm,
        bedrooms,
        bathrooms,
        unit_type,
        rent_amount,
        sale_price,
        currency,
        occupancy_status,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.building_id ?? null,
      data.floor_id ?? null,
      data.unit_number ?? null,
      data.area_sqm ?? null,
      data.bedrooms ?? null,
      data.bathrooms ?? null,
      data.unit_type ?? null,
      data.rent_amount ?? null,
      data.sale_price ?? null,
      data.currency ?? null,
      data.occupancy_status ?? null,
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
      UPDATE apartments
      SET
        building_id = ?,
        floor_id = ?,
        unit_number = ?,
        area_sqm = ?,
        bedrooms = ?,
        bathrooms = ?,
        unit_type = ?,
        rent_amount = ?,
        sale_price = ?,
        currency = ?,
        occupancy_status = ?,
        description = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.building_id ?? null,
      data.floor_id ?? null,
      data.unit_number ?? null,
      data.area_sqm ?? null,
      data.bedrooms ?? null,
      data.bathrooms ?? null,
      data.unit_type ?? null,
      data.rent_amount ?? null,
      data.sale_price ?? null,
      data.currency ?? null,
      data.occupancy_status ?? null,
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
      UPDATE apartments
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
