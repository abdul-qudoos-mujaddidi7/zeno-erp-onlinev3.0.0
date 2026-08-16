const PRESCRIPTION_COLUMNS = `
  local_id AS id,
  local_id,
  prescription_number,
  prescription_status,
  prescription_date,
  patient_id,
  doctor_id,
  appointment_id,
  warehouse_id,
  account_id,
  vitals,
  diagnosis,
  notes,
  description,
  total_amount,
  discount_type,
  discount_amount,
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

const ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  prescription_id,
  product_id,
  product_unit_id,
  dosage,
  dosage_unit,
  frequency,
  duration,
  duration_unit,
  route,
  instructions,
  quantity,
  unit_price,
  currency,
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

const PAYMENT_COLUMNS = `
  local_id AS id,
  local_id,
  prescription_id,
  account_id,
  amount,
  currency,
  payment_date,
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

const RETURN_COLUMNS = `
  local_id AS id,
  local_id,
  prescription_id,
  warehouse_id,
  account_id,
  return_number,
  return_date,
  total_amount,
  description,
  currency,
  return_status,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const RETURN_ITEM_COLUMNS = `
  local_id AS id,
  local_id,
  prescription_return_id,
  product_id,
  product_unit_id,
  quantity,
  unit_price,
  currency,
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
    prescriptionStatus = '',
    patientId = null,
    doctorId = null,
    appointmentId = null,
    search = '',
  
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

  if (prescriptionStatus) {
    conditions.push('prescription_status = ?');
    values.push(prescriptionStatus);
  }

  if (patientId) {
    conditions.push('patient_id = ?');
    values.push(patientId);
  }

  if (doctorId) {
    conditions.push('doctor_id = ?');
    values.push(doctorId);
  }

  if (appointmentId) {
    conditions.push('appointment_id = ?');
    values.push(appointmentId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        prescription_number LIKE ?
        OR description LIKE ?
        OR diagnosis LIKE ?
        OR notes LIKE ?
      )
    `);

    values.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  return paginateSelect(executor, {
    tableSql: 'prescriptions',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY prescription_date DESC, local_id DESC',
    columnsSql: PRESCRIPTION_COLUMNS,
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
        ${PRESCRIPTION_COLUMNS}
      FROM prescriptions
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
      INSERT INTO prescriptions (
        org_id,
        local_id,
        prescription_number,
        prescription_status,
        prescription_date,
        patient_id,
        doctor_id,
        appointment_id,
        warehouse_id,
        account_id,
        vitals,
        diagnosis,
        notes,
        description,
        total_amount,
        discount_type,
        discount_amount,
        currency,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.prescription_number ?? null,
      data.prescription_status ?? null,
      data.prescription_date ?? null,
      data.patient_id ?? null,
      data.doctor_id ?? null,
      data.appointment_id ?? null,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.vitals ?? null,
      data.diagnosis ?? null,
      data.notes ?? null,
      data.description ?? null,
      data.total_amount ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
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
      UPDATE prescriptions
      SET
        prescription_number = ?,
        prescription_status = ?,
        prescription_date = ?,
        patient_id = ?,
        doctor_id = ?,
        appointment_id = ?,
        warehouse_id = ?,
        account_id = ?,
        vitals = ?,
        diagnosis = ?,
        notes = ?,
        description = ?,
        total_amount = ?,
        discount_type = ?,
        discount_amount = ?,
        currency = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.prescription_number ?? null,
      data.prescription_status ?? null,
      data.prescription_date ?? null,
      data.patient_id ?? null,
      data.doctor_id ?? null,
      data.appointment_id ?? null,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.vitals ?? null,
      data.diagnosis ?? null,
      data.notes ?? null,
      data.description ?? null,
      data.total_amount ?? null,
      data.discount_type ?? null,
      data.discount_amount ?? null,
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
      UPDATE prescriptions
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

async function findItemsByPrescription(
  executor,
  {
    orgId,
    prescriptionId,
    includeDeleted = false,
  },
) {
  const conditions = [
    'org_id = ?',
    'prescription_id = ?',
  ];

  const values = [
    orgId,
    prescriptionId,
  ];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${ITEM_COLUMNS}
      FROM prescription_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_id ASC
    `,
    values,
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
      INSERT INTO prescription_items (
        org_id,
        local_id,
        prescription_id,
        product_id,
        product_unit_id,
        dosage,
        dosage_unit,
        frequency,
        duration,
        duration_unit,
        route,
        instructions,
        quantity,
        unit_price,
        currency,
        subtotal,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.prescription_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.dosage ?? null,
      data.dosage_unit ?? null,
      data.frequency ?? null,
      data.duration ?? null,
      data.duration_unit ?? null,
      data.route ?? null,
      data.instructions ?? null,
      data.quantity ?? null,
      data.unit_price ?? null,
      data.currency ?? null,
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
      FROM prescription_items
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

async function softDeleteItemsByPrescription(
  connection,
  {
    orgId,
    prescriptionId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE prescription_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND prescription_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      prescriptionId,
    ],
  );
}

async function findPaymentsByPrescription(
  executor,
  {
    orgId,
    prescriptionId,
    includeDeleted = false,
  },
) {
  const conditions = [
    'org_id = ?',
    'prescription_id = ?',
  ];

  const values = [
    orgId,
    prescriptionId,
  ];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM prescription_payments
      WHERE ${conditions.join(' AND ')}
      ORDER BY payment_date DESC, local_id DESC
    `,
    values,
  );

  return rows;
}

async function findPaymentsByPrescriptionIds(
  executor,
  {
    orgId,
    prescriptionIds,
  },
) {
  if (!prescriptionIds.length) {
    return [];
  }

  const placeholders = prescriptionIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${PAYMENT_COLUMNS}
      FROM prescription_payments
      WHERE org_id = ?
        AND prescription_id IN (${placeholders})
        AND status = 1
      ORDER BY payment_date DESC, local_id DESC
    `,
    [
      orgId,
      ...prescriptionIds,
    ],
  );

  return rows;
}

async function createPayment(
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
      INSERT INTO prescription_payments (
        org_id,
        local_id,
        prescription_id,
        account_id,
        amount,
        currency,
        payment_date,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.prescription_id ?? null,
      data.account_id ?? null,
      data.amount ?? null,
      data.currency ?? null,
      data.payment_date ?? null,
      data.description ?? null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  return findPaymentByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function findPaymentByLocalId(
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
        ${PAYMENT_COLUMNS}
      FROM prescription_payments
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

async function softDeletePayment(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE prescription_payments
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

  return findPaymentByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function findReturnsByPrescription(
  executor,
  {
    orgId,
    prescriptionId,
    includeDeleted = false,
  },
) {
  const conditions = [
    'org_id = ?',
    'prescription_id = ?',
  ];

  const values = [
    orgId,
    prescriptionId,
  ];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM prescription_returns
      WHERE ${conditions.join(' AND ')}
      ORDER BY return_date DESC, local_id DESC
    `,
    values,
  );

  return rows;
}

async function findReturnsByPrescriptionIds(
  executor,
  {
    orgId,
    prescriptionIds,
  },
) {
  if (!prescriptionIds.length) {
    return [];
  }

  const placeholders = prescriptionIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_COLUMNS}
      FROM prescription_returns
      WHERE org_id = ?
        AND prescription_id IN (${placeholders})
        AND status = 1
      ORDER BY return_date DESC, local_id DESC
    `,
    [
      orgId,
      ...prescriptionIds,
    ],
  );

  return rows;
}

async function findReturnByLocalId(
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
        ${RETURN_COLUMNS}
      FROM prescription_returns
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

async function createReturn(
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
      INSERT INTO prescription_returns (
        org_id,
        local_id,
        prescription_id,
        warehouse_id,
        account_id,
        return_number,
        return_date,
        total_amount,
        description,
        currency,
        return_status,
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
      data.prescription_id ?? null,
      data.warehouse_id ?? null,
      data.account_id ?? null,
      data.return_number ?? null,
      data.return_date ?? null,
      data.total_amount ?? null,
      data.description ?? null,
      data.currency ?? null,
      data.return_status ?? null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  return findReturnByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function createReturnItem(
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
      INSERT INTO prescription_return_items (
        org_id,
        local_id,
        prescription_return_id,
        product_id,
        product_unit_id,
        quantity,
        unit_price,
        currency,
        subtotal,
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
      data.prescription_return_id ?? null,
      data.product_id ?? null,
      data.product_unit_id ?? null,
      data.quantity ?? null,
      data.unit_price ?? null,
      data.currency ?? null,
      data.subtotal ?? null,
      data.status ?? 1,
      userId,
      userId,
    ],
  );

  const [rows] = await connection.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM prescription_return_items
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

async function findReturnItemsByReturn(
  executor,
  {
    orgId,
    returnId,
    includeDeleted = false,
  },
) {
  const conditions = [
    'org_id = ?',
    'prescription_return_id = ?',
  ];

  const values = [
    orgId,
    returnId,
  ];

  if (!includeDeleted) {
    conditions.push('status = 1');
  }

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM prescription_return_items
      WHERE ${conditions.join(' AND ')}
      ORDER BY local_id ASC
    `,
    values,
  );

  return rows;
}

async function findReturnItemsByReturnIds(
  executor,
  {
    orgId,
    returnIds,
  },
) {
  if (!returnIds.length) {
    return [];
  }

  const placeholders = returnIds.map(() => '?').join(', ');

  const [rows] = await executor.execute(
    `
      SELECT
        ${RETURN_ITEM_COLUMNS}
      FROM prescription_return_items
      WHERE org_id = ?
        AND prescription_return_id IN (${placeholders})
        AND status = 1
      ORDER BY local_id ASC
    `,
    [
      orgId,
      ...returnIds,
    ],
  );

  return rows;
}

async function softDeleteReturn(
  connection,
  {
    orgId,
    localId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE prescription_returns
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

  return findReturnByLocalId(
    connection,
    {
      orgId,
      localId,
    },
  );
}

async function softDeleteReturnItemsByReturn(
  connection,
  {
    orgId,
    returnId,
    userId,
  },
) {
  await connection.execute(
    `
      UPDATE prescription_return_items
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND prescription_return_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      returnId,
    ],
  );
}

async function adjustProductQuantity(
  connection,
  {
    orgId,
    productId,
    delta,
  },
) {
  if (!productId || !delta) {
    return;
  }

  await connection.execute(
    `
      UPDATE products
      SET
        quantity = COALESCE(quantity, 0) + ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      delta,
      orgId,
      productId,
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
  findItemsByPrescription,
  createItem,
  softDeleteItemsByPrescription,
  findPaymentsByPrescription,
  findPaymentsByPrescriptionIds,
  createPayment,
  findPaymentByLocalId,
  softDeletePayment,
  findReturnsByPrescription,
  findReturnsByPrescriptionIds,
  findReturnByLocalId,
  createReturn,
  createReturnItem,
  findReturnItemsByReturn,
  findReturnItemsByReturnIds,
  softDeleteReturn,
  softDeleteReturnItemsByReturn,
  adjustProductQuantity,
  findAccountByCode,
};
