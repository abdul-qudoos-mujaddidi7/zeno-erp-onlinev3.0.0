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
  const [rows] = await connection.execute(`SELECT local_id AS id, name, code, product_unit_id, COALESCE(quantity, 0) AS quantity
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

module.exports = { findAll, findById, findProductForUpdate, findWarehouseForUpdate, warehouseExists, create };
