const dates = require("../helpers/date-helpers");

module.exports = (db) => ({
  list: (params, query) =>
    db.list(params.tableName, params, {
      $search: query.q,
      $from: query.from,
      $to: query.to,
    }),
  record: (table, id) => db.one(table, id),
  async editForm(table, id) {
    const columns = await db.editableColumns(table);
    const record = await db.one(table, id);
    const fields = columns.map((column) => {
      const value = record[column.name];
      const type = String(column.type).toLowerCase();
      let inputType = "text",
        formatted = value === null || value === undefined ? "" : String(value);
      if (
        /^(tinyint|smallint|mediumint|int|bigint|decimal|numeric|float|double)$/.test(
          type,
        )
      ) {
        inputType = "number";
      } else if (type === "date") {
        inputType = "date";
        formatted = formatted.slice(0, 10);
      } else if (/^(datetime|timestamp)$/.test(type)) {
        inputType = "datetime-local";
        formatted = dates.getLocalDateTime(value);
      } else if (type === "time") {
        inputType = "time";
        formatted = formatted.slice(0, 8);
      }
      return {
        name: column.name,
        label: column.name.replaceAll("_", " "),
        value: formatted,
        inputType,
        textarea: /^(json|tinytext|text|mediumtext|longtext)$/.test(type),
        step: /^(tinyint|smallint|mediumint|int|bigint)$/.test(type)
          ? "1"
          : /^(float|double)$/.test(type)
            ? "any"
            : "0.000001",
        nullable: column.nullable === "YES",
        required:
          column.nullable !== "YES" &&
          !/^(text|mediumtext|longtext|tinytext|json)$/.test(type),
      };
    });
    return {
      title: `Edit ${table.replaceAll("_", " ")} #${record.id}`,
      tableName: table,
      recordId: record.id,
      fields,
      action: `/smart-super-admin/edit/${table}/${record.id}`,
      backUrl: `/smart-super-admin/view/${table}/${record.id}`,
    };
  },
  async saveEdit(table, id, body) {
    if (table === "subscriptions") {
      db.fail("Subscriptions must be changed through subscription management.", 403);
    }
    const identifier = db.id(id);
    const columns = await db.editableColumns(table);
    const names = columns.map((column) => column.name);
    const keys = Object.keys(body);
    if (
      keys.length !== names.length ||
      keys.some((key) => !names.includes(key))
    )
      db.fail("Invalid record fields");
    const data = {};
    for (const column of columns) {
      const value = body[column.name];
      if (typeof value !== "string")
        db.fail("Invalid field: " + column.name);
      const type = String(column.type).toLowerCase();
      if (value === "" && column.nullable === "YES") {
        data[column.name] = null;
      } else if (
        /^(tinyint|smallint|mediumint|int|bigint|decimal|numeric|float|double)$/.test(
          type,
        )
      ) {
        const integer = /^(tinyint|smallint|mediumint|int|bigint)$/.test(type);
        if (
          !(integer
            ? /^-?\d{1,30}$/.test(value)
            : /^-?\d{1,30}(\.\d{1,12})?$/.test(value))
        )
          db.fail("Invalid number: " + column.name);
        data[column.name] = value;
      } else if (type === "date") {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(value + "T00:00:00Z")) ||
          new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
        )
          db.fail("Invalid date: " + column.name);
        data[column.name] = value;
      } else if (/^(datetime|timestamp)$/.test(type)) {
        data[column.name] = dates.formatMySQLDateKabulToUTC(value);
      } else if (type === "time") {
        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value))
          db.fail("Invalid time: " + column.name);
        data[column.name] = value;
      } else {
        const maximum = Number(column.maxLength);
        data[column.name] = db.text(
          value,
          Number.isFinite(maximum) && maximum > 0
            ? Math.min(maximum, 1000000)
            : 1000000,
        );
      }
    }
    await db.one(table, identifier);
    await db.save(table, data, identifier);
    return identifier;
  },
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
});
