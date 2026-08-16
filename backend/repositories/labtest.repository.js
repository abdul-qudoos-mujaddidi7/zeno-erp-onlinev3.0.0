const COLUMNS = `
  local_id AS id,
  local_id,
  name,
  labtest_type_id,
  labtest_number,
  labtest_status,
  labtest_date,
  patient_id,
  technician_id,
  appointment_id,
  parameters,
  description,
  price,
  currency,
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
    patientId = null,
    labtestTypeId = null,
    appointmentId = null,
  
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

  if (patientId) {
    conditions.push('patient_id = ?');
    values.push(patientId);
  }

  if (labtestTypeId) {
    conditions.push('labtest_type_id = ?');
    values.push(labtestTypeId);
  }

  if (appointmentId) {
    conditions.push('appointment_id = ?');
    values.push(appointmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        name LIKE ?
        OR         labtest_number LIKE ?
        OR         description LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'labtests',
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
      FROM labtests
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
      INSERT INTO labtests (
        org_id,
        local_id,
        name,
        labtest_type_id,
        labtest_number,
        labtest_status,
        labtest_date,
        patient_id,
        technician_id,
        appointment_id,
        parameters,
        description,
        price,
        currency,
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
      data.name ?? null,
      data.labtest_type_id ?? null,
      data.labtest_number ?? null,
      data.labtest_status ?? null,
      data.labtest_date ?? null,
      data.patient_id ?? null,
      data.technician_id ?? null,
      data.appointment_id ?? null,
      data.parameters ?? null,
      data.description ?? null,
      data.price ?? null,
      data.currency ?? null,
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
      UPDATE labtests
      SET
        name = ?,
        labtest_type_id = ?,
        labtest_number = ?,
        labtest_status = ?,
        labtest_date = ?,
        patient_id = ?,
        technician_id = ?,
        appointment_id = ?,
        parameters = ?,
        description = ?,
        price = ?,
        currency = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.name ?? null,
      data.labtest_type_id ?? null,
      data.labtest_number ?? null,
      data.labtest_status ?? null,
      data.labtest_date ?? null,
      data.patient_id ?? null,
      data.technician_id ?? null,
      data.appointment_id ?? null,
      data.parameters ?? null,
      data.description ?? null,
      data.price ?? null,
      data.currency ?? null,
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
      UPDATE labtests
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
