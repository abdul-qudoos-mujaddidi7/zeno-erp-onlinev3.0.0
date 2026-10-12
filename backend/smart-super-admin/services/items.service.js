module.exports = (db) => ({
  list: (params, query) =>
    db.list(params.tableName, params, { $search: query.q }),
  async detail(table, id) {
    const record = await db.one(table, id),
      related = [];
    const child = {
      sales: ["sale_items", "sale_id"],
      purchases: ["purchase_items", "purchase_id"],
      wastes: ["waste_items", "waste_id"],
      stock_transfers: ["stock_transfer_items", "stock_transfer_id"],
    }[table];
    if (child && record.local_id && record.org_id) {
      const columns = await db.schema(child[0]);
      const [rows] = await db.pool.execute(
        `SELECT ${columns.map((column) => "i.`" + column.name + "`").join(",")},p.name AS product_name,pu.name AS unit_name
        FROM ${child[0]} i LEFT JOIN products p ON p.local_id=i.product_id AND p.org_id=i.org_id
        LEFT JOIN product_units pu ON pu.local_id=i.product_unit_id AND pu.org_id=i.org_id
        WHERE i.${child[1]}=? AND i.org_id=? AND i.status=1 ORDER BY i.id LIMIT 1000`,
        [record.local_id, record.org_id],
      );
      related.push({ title: "Line items", rows });
    }
    const payments = {
      sales: ["sale_payments", "sale_id"],
      purchases: ["purchase_payments", "purchase_id"],
    }[table];
    if (payments && record.local_id && record.org_id) {
      const columns = await db.schema(payments[0]);
      const [rows] = await db.pool.execute(
        `SELECT ${columns.map((column) => "p.`" + column.name + "`").join(",")},a.name AS account_name FROM ${payments[0]} p LEFT JOIN accounts a ON a.local_id=p.account_id AND a.org_id=p.org_id WHERE p.${payments[1]}=? AND p.org_id=? AND p.status=1 ORDER BY p.id LIMIT 1000`,
        [record.local_id, record.org_id],
      );
      related.push({ title: "Payments", rows });
    }
    const people = {};
    if (record.org_id)
      for (const field of ["created_by", "updated_by", "approved_by"])
        if (record[field]) {
          const [rows] = await db.pool.execute(
            "SELECT username FROM users WHERE local_id=? AND org_id=? LIMIT 1",
            [record[field], record.org_id],
          );
          people[field + "_name"] = rows[0]?.username || "";
        }
    return { record: { ...record, ...people }, related };
  },
  async clearSync() {
    await db.pool.execute("DELETE FROM sync_logs");
  },
});
