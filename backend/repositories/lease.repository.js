const COLUMNS = `
  local_id AS id,
  local_id,
  apartment_id,
  tenant_account_id,
  lease_number,
  lease_type,
  start_date,
  end_date,
  monthly_rent,
  deposit_amount,
  currency,
  payment_cycle,
  auto_renew,
  grace_period_days,
  late_fee_percent,
  terms_conditions,
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
    tenantAccountId = null,
  
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

  if (tenantAccountId) {
    conditions.push('tenant_account_id = ?');
    values.push(tenantAccountId);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(`
      (
        lease_number LIKE ?
        OR lease_type LIKE ?
        OR currency LIKE ?
        OR payment_cycle LIKE ?
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
    tableSql: 'leases',
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
      FROM leases
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
      INSERT INTO leases (
        org_id,
        local_id,
        apartment_id,
        tenant_account_id,
        lease_number,
        lease_type,
        start_date,
        end_date,
        monthly_rent,
        deposit_amount,
        currency,
        payment_cycle,
        auto_renew,
        grace_period_days,
        late_fee_percent,
        terms_conditions,
        description,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.apartment_id ?? null,
      data.tenant_account_id ?? null,
      data.lease_number ?? null,
      data.lease_type ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.monthly_rent ?? null,
      data.deposit_amount ?? null,
      data.currency ?? null,
      data.payment_cycle ?? null,
      data.auto_renew ?? null,
      data.grace_period_days ?? null,
      data.late_fee_percent ?? null,
      data.terms_conditions ?? null,
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
      UPDATE leases
      SET
        apartment_id = ?,
        tenant_account_id = ?,
        lease_number = ?,
        lease_type = ?,
        start_date = ?,
        end_date = ?,
        monthly_rent = ?,
        deposit_amount = ?,
        currency = ?,
        payment_cycle = ?,
        auto_renew = ?,
        grace_period_days = ?,
        late_fee_percent = ?,
        terms_conditions = ?,
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
      data.tenant_account_id ?? null,
      data.lease_number ?? null,
      data.lease_type ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.monthly_rent ?? null,
      data.deposit_amount ?? null,
      data.currency ?? null,
      data.payment_cycle ?? null,
      data.auto_renew ?? null,
      data.grace_period_days ?? null,
      data.late_fee_percent ?? null,
      data.terms_conditions ?? null,
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
      UPDATE leases
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
