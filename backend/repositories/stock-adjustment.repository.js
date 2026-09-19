async function findAll(executor, { orgId, id, productId, warehouseId, adjustmentType, dateFrom, dateTo }) {
  const conditions = ['sa.org_id = ?'];
  const values = [orgId];
  if (id) { conditions.push('sa.id = ?'); values.push(id); }
  if (productId) { conditions.push('sa.product_id = ?'); values.push(productId); }
  if (warehouseId) { conditions.push('sa.warehouse_id = ?'); values.push(warehouseId); }
  if (adjustmentType) { conditions.push('sa.adjustment_type = ?'); values.push(adjustmentType); }
  if (dateFrom) { conditions.push('sa.created_at >= ?'); values.push(dateFrom); }
  if (dateTo) { conditions.push('sa.created_at < DATE_ADD(?, INTERVAL 1 DAY)'); values.push(dateTo); }
  const [rows] = await executor.execute(`
    SELECT sa.*, p.name AS product_name, p.code AS product_code, w.name AS warehouse_name,
      u.username AS created_by_name, au.username AS approved_by_name
    FROM stock_adjustments sa
    JOIN products p ON p.org_id = sa.org_id AND p.local_id = sa.product_id
    JOIN warehouses w ON w.org_id = sa.org_id AND w.local_id = sa.warehouse_id
    -- local_id is organization-scoped. Including org_id prevents users
    -- from other organizations with the same local ID from duplicating rows.
    LEFT JOIN users u ON u.org_id = sa.org_id AND u.local_id = sa.created_by
    LEFT JOIN users au ON au.org_id = sa.org_id AND au.local_id = sa.approved_by
    WHERE ${conditions.join(' AND ')}
    ORDER BY sa.created_at DESC, sa.id DESC`, values);
  return rows;
}

async function findById(executor, { orgId, id }) {
  const rows = await findAll(executor, { orgId, id });
  return rows[0] || null;
}

async function findProductForUpdate(connection, { orgId, productId }) {
  const [rows] = await connection.execute(`SELECT local_id AS id, name, code, product_unit_id, type, COALESCE(quantity, 0) AS quantity
    FROM products WHERE org_id = ? AND local_id = ? AND status = 1 FOR UPDATE`, [orgId, productId]);
  return rows[0] || null;
}

async function findWarehouseForUpdate(connection, { orgId, warehouseId, productId }) {
  const [rows] = await connection.execute(`SELECT local_id AS id, COALESCE(quantity, 0) AS quantity, product_unit_id
    FROM warehouse_products WHERE org_id = ? AND warehouse_id = ? AND product_id = ? AND status = 1 FOR UPDATE`, [orgId, warehouseId, productId]);
  return rows[0] || null;
}

async function warehouseExists(connection, { orgId, warehouseId }) {
  const [rows] = await connection.execute(`SELECT local_id FROM warehouses WHERE org_id = ? AND local_id = ? AND status = 1 LIMIT 1`, [orgId, warehouseId]);
  return Boolean(rows[0]);
}

async function create(connection, data) {
  const [result] = await connection.execute(`INSERT INTO stock_adjustments
    (org_id, product_id, warehouse_id, adjustment_type, qty, reason, note, status,
      before_qty, after_qty, before_warehouse_qty, after_warehouse_qty, created_by, approved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`, [
    data.orgId, data.productId, data.warehouseId, data.adjustmentType, data.qty,
    data.reason, data.note, data.beforeQty, data.afterQty, data.beforeWarehouseQty,
    data.afterWarehouseQty, data.userId, data.userId,
  ]);
  return result.insertId;
}

/*
 * Everything that any stock is currently held in: the product aggregates and
 * the per-warehouse balances. Both result sets are locked, because a
 * catalog-wide reset must not race a sale or a purchase.
 */
async function findZeroableStock(connection, { orgId }) {
  const [products] = await connection.execute(
    `
      SELECT
        local_id AS id,
        name,
        product_unit_id,
        COALESCE(quantity, 0) AS quantity
      FROM products
      WHERE org_id = ?
        AND status = 1
        AND COALESCE(quantity, 0) <> 0
      FOR UPDATE
    `,
    [orgId],
  );

  const [balances] = await connection.execute(
    `
      SELECT
        wp.product_id,
        wp.warehouse_id,
        wp.product_unit_id,
        COALESCE(wp.quantity, 0) AS quantity,
        p.name AS product_name,
        p.product_unit_id AS product_unit_id_fallback
      FROM warehouse_products wp
      JOIN products p
        ON p.org_id = wp.org_id
        AND p.local_id = wp.product_id
        AND p.status = 1
      WHERE wp.org_id = ?
        AND wp.status = 1
        AND COALESCE(wp.quantity, 0) <> 0
      FOR UPDATE
    `,
    [orgId],
  );

  return { products, balances };
}

/*
 * Adjustments require a warehouse. Products whose stock never reached a
 * warehouse have no balance row to name, so the oldest active warehouse is
 * used as the recording site for those rows.
 */
async function findFirstWarehouse(connection, { orgId }) {
  const [rows] = await connection.execute(
    `
      SELECT local_id AS id
      FROM warehouses
      WHERE org_id = ?
        AND status = 1
      ORDER BY local_id ASC
      LIMIT 1
    `,
    [orgId],
  );

  return rows[0] ? rows[0].id : null;
}

/*
 * Bulk insert for a catalog-wide reset: writing one INSERT per product would
 * mean thousands of round trips inside the transaction. The returned ids keep
 * the same order as the given rows, so the matching movements can reference
 * their adjustment.
 */
async function createMany(connection, rows, { chunkSize = 200 } = {}) {
  const ids = [];

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)").join(', ');
    const values = chunk.flatMap((row) => [
      row.orgId, row.productId, row.warehouseId, row.adjustmentType, row.qty, row.reason, row.note,
      row.beforeQty, row.afterQty, row.beforeWarehouseQty, row.afterWarehouseQty,
      row.userId, row.userId,
    ]);

    const [result] = await connection.execute(
      `INSERT INTO stock_adjustments
        (org_id, product_id, warehouse_id, adjustment_type, qty, reason, note, status,
          before_qty, after_qty, before_warehouse_qty, after_warehouse_qty, created_by, approved_by)
        VALUES ${placeholders}`,
      values,
    );

    // One INSERT returns the id of its first row. Rows inside a single
    // multi-row insert take consecutive auto-increment values.
    chunk.forEach((_, index) => ids.push(result.insertId + index));
  }

  return ids;
}

module.exports = { findAll, findById, findProductForUpdate, findWarehouseForUpdate, warehouseExists, create,
  findZeroableStock, findFirstWarehouse, createMany };
