const PRODUCT_IMAGE_COLUMNS = `
  local_id AS id,
  local_id,
  product_id,
  image,
  thumbnail,
  status,
  COALESCE(version, 1) AS version,
  created_by,
  updated_by,
  approved_by,
  approved_at,
  created_at,
  updated_at
`;

const PRODUCT_IMAGE_THUMBNAIL_COLUMNS = `
  local_id AS id,
  local_id,
  product_id,
  thumbnail,
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
    productId = null,
    productIds = null,
    thumbnailsOnly = false,
    pagination = null,
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

  if (productId) {
    conditions.push('product_id = ?');
    values.push(productId);
  }

  if (Array.isArray(productIds) && productIds.length > 0) {
    conditions.push(
      `product_id IN (${productIds.map(() => '?').join(', ')})`,
    );
    values.push(...productIds);
  }

  // ORDER BY id DESC mirrors Dexie's .last() (most recently inserted first).
  return paginateSelect(executor, {
    tableSql: 'product_images',
    whereSql: conditions.join(' AND '),
    values,
    orderBySql: 'ORDER BY id DESC',
    columnsSql: thumbnailsOnly
      ? PRODUCT_IMAGE_THUMBNAIL_COLUMNS
      : PRODUCT_IMAGE_COLUMNS,
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
        ${PRODUCT_IMAGE_COLUMNS}
      FROM product_images
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
      INSERT INTO product_images (
        org_id,
        local_id,
        product_id,
        image,
        thumbnail,
        status,
        version,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW(3), NOW(3)
      )
    `,
    [
      orgId,
      localId,
      data.product_id ?? null,
      data.image ?? null,
      data.thumbnail ?? null,
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
      UPDATE product_images
      SET
        product_id = ?,
        image = ?,
        thumbnail = ?,
        status = ?,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND local_id = ?
    `,
    [
      data.product_id ?? null,
      data.image ?? null,
      data.thumbnail ?? null,
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
      UPDATE product_images
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


// Soft-deletes every active image row for a product — used by replace
// so each product keeps only its most recently saved image.
async function softDeleteByProduct(
  connection,
  {
    orgId,
    productId,
    userId,
  },
) {
  const [result] = await connection.execute(
    `
      UPDATE product_images
      SET
        status = 0,
        version = COALESCE(version, 0) + 1,
        updated_by = ?,
        updated_at = NOW(3)
      WHERE org_id = ?
        AND product_id = ?
        AND status = 1
    `,
    [
      userId,
      orgId,
      productId,
    ],
  );

  return result.affectedRows;
}

module.exports = {
  findAll,
  findByLocalId,
  create,
  update,
  softDelete,
  softDeleteByProduct,
};
