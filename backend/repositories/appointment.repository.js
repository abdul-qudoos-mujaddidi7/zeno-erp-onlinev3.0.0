const APPOINTMENT_COLUMNS = `
  local_id AS id,
  local_id,
  date,
  serial_no,
  reference_id,
  reference_type,
  description,
  patient_id,
  fee,
  paid_amount,
  currency,
  doctor_id,
  department_id,
  visit_type,
  visit_status,
  visit_date,
  doctor_notes,
  diagnosis,
  prescriptions,
  vitals,
  parent_visit_id,
  follow_up_date,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  appointment_id,
  product_id,
  product_unit_id,
  quantity,
  unit_price,
  currency,
  discount_type,
  discount_amount,
  subtotal,
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
    doctorId = null,
    departmentId = null,
  
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

  if (doctorId) {
    conditions.push('doctor_id = ?');
    values.push(doctorId);
  }

  if (departmentId) {
    conditions.push('department_id = ?');
    values.push(departmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        serial_no LIKE ?
        OR description LIKE ?
        OR visit_type LIKE ?
        OR visit_status LIKE ?
        OR diagnosis LIKE ?
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
    tableSql: 'appointments',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY date DESC, local_id DESC',
    columnsSql: APPOINTMENT_COLUMNS,
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
        ${APPOINTMENT_COLUMNS}
      FROM appointments
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
      INSERT INTO appointments (
        org_id,
        local_id,
        date,
        serial_no,
        reference_id,
        reference_type,
        description,
        patient_id,
        fee,
        paid_amount,
        currency,
        doctor_id,
        department_id,
        visit_type,
        visit_status,
        visit_date,
        doctor_notes,
        diagnosis,
        prescriptions,
        vitals,
        parent_visit_id,
        follow_up_date,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.date ?? null,
      data.serial_no ?? null,
      data.reference_id ?? null,
      data.reference_type ?? null,
      data.description ?? null,
      data.patient_id ?? null,
      data.fee ?? null,
      data.paid_amount ?? null,
      data.currency ?? null,
      data.doctor_id ?? null,
      data.department_id ?? null,
      data.visit_type ?? null,
      data.visit_status ?? null,
      data.visit_date ?? null,
      data.doctor_notes ?? null,
      data.diagnosis ?? null,
      data.prescriptions ?? null,
      data.vitals ?? null,
      data.parent_visit_id ?? null,
      data.follow_up_date ?? null,
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
      UPDATE appointments
      SET
        date = ?,
        serial_no = ?,
        reference_id = ?,
        reference_type = ?,
        description = ?,
        patient_id = ?,
        fee = ?,
        paid_amount = ?,
        currency = ?,
        doctor_id = ?,
        department_id = ?,
        visit_type = ?,
        visit_status = ?,
        visit_date = ?,
        doctor_notes = ?,
        diagnosis = ?,
        prescriptions = ?,
        vitals = ?,
        parent_visit_id = ?,
        follow_up_date = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.date ?? null,
      data.serial_no ?? null,
      data.reference_id ?? null,
      data.reference_type ?? null,
      data.description ?? null,
      data.patient_id ?? null,
      data.fee ?? null,
      data.paid_amount ?? null,
      data.currency ?? null,
      data.doctor_id ?? null,
      data.department_id ?? null,
      data.visit_type ?? null,
      data.visit_status ?? null,
      data.visit_date ?? null,
      data.doctor_notes ?? null,
      data.diagnosis ?? null,
      data.prescriptions ?? null,
      data.vitals ?? null,
      data.parent_visit_id ?? null,
      data.follow_up_date ?? null,
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
      UPDATE appointments
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

async function findItemsByAppointment(
  executor,
  {
    orgId,
    appointmentId,
    includeDeleted = false,
  },
) {
  const conditions = [
    'org_id = ?',
    'appointment_id = ?',
  ];

  const values = [
    orgId,
    appointmentId,
  ];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM appointment_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_id ASC
    `,
    values,
  );

  return rows;
}

async function findItemsByAppointmentIds(
  executor,
  {
    orgId,
    appointmentIds,
  },
) {
  if (!appointmentIds.length) {
    return [];
  }

  const placeholders = appointmentIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM appointment_items
      WHERE org_id = ?
        AND appointment_id IN (${placeholders})
        AND status = 1
      ORDER BY local_id ASC
    `,
    [
      orgId,
      ...appointmentIds,
    ],
  );

  return rows;
}

async function createItem(
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
      INSERT INTO appointment_items (
        org_id,
        local_id,
        appointment_id,
        product_id,
        product_unit_id,
        quantity,
        unit_price,
        currency,
        discount_type,
        discount_amount,
        subtotal,
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
      data.appointment_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.unit_price ?? null,
      data.currency ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
      data.subtotal ?? null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM appointment_items
      WHERE org_id = ?
        AND local_id = ?
      LIMIT 1
    `,
    [
      orgId,
      localId,
    ],
  );

  return rows[0] || null;
}

async function softDeleteItemsByAppointment(
  connection,
  {
    orgId,
    appointmentId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE appointment_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND appointment_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      appointmentId,
    ],
  );
}

async function findAccountByCode(
  executor,
  {
    orgId,
    code,
  },
) {
  const [rows] = await executor.execute(
    `
      SELECT
        local_id AS id,
        local_id,
        code,
        name,
        balance,
        currency,
        status
      FROM accounts
      WHERE org_id = ?
        AND code = ?
        AND status = 1
      LIMIT 1
    `,
    [
      orgId,
      code,
    ],
  );

  return rows[0] || null;
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  findItemsByAppointment,
  findItemsByAppointmentIds,
  createItem,
  softDeleteItemsByAppointment,
  findAccountByCode,
};
