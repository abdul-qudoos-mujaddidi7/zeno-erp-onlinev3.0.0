const { buildPagination } = require("../helpers/handlebars-helpers");
const TABLES = Object.freeze([
  "organizations",
  "org_types",
  "features",
  "subscription_plans",
  "subscription_plan_features",
  "subscriptions",
  "subscription_features",
  "subscription_invoices",
  "subscription_payments",
  "users",
  "user_roles",
  "user_images",
  "warehouses",
  "warehouse_products",
  "products",
  "product_images",
  "product_categories",
  "product_units",
  "product_brands",
  "product_generics",
  "currencies",
  "sales",
  "sale_items",
  "sale_payments",
  "purchases",
  "purchase_items",
  "purchase_payments",
  "accounts",
  "account_groups",
  "account_images",
  "journals",
  "activity_logs",
  "settings",
  "stock_transactions",
  "stock_transfers",
  "stock_transfer_items",
  "wastes",
  "waste_items",
]);
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function id(value, zero = false) {
  if (
    !/^(0|[1-9]\d{0,15})$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    (!zero && Number(value) === 0)
  )
    fail("Invalid ID");
  return Number(value);
}
function text(value, max = 255) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max)
    fail("Invalid or oversized field");
  return value.trim();
}
function money(value, positive = false) {
  const result = String(value ?? "0");
  if (
    !/^\d{1,14}(\.\d{1,6})?$/.test(result) ||
    (positive && !/[1-9]/.test(result))
  )
    fail("Invalid amount");
  return result;
}
module.exports = function createDatabase(pool) {
  const cache = new Map();
  async function schema(table) {
    if (!TABLES.includes(table)) fail("Unknown table", 404);
    if (!cache.has(table)) {
      const [rows] = await pool.execute(
        "SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position",
        [table],
      );
      const columns = rows.filter(
        (row) => !/password|token|secret/i.test(row.name),
      );
      if (!columns.length) fail("Table is unavailable", 404);
      cache.set(table, columns);
    }
    return cache.get(table);
  }
  async function one(table, identifier, executor = pool) {
    const columns = await schema(table);
    const [rows] = await executor.execute(
      `SELECT ${columns.map((c) => "`" + c.name + "`").join(",")} FROM \`${table}\` WHERE id=?`,
      [id(identifier)],
    );
    if (!rows.length) fail("Record not found", 404);
    return rows[0];
  }
  async function list(table, params, filters = {}, computed = {}) {
    const columns = await schema(table),
      names = columns.map((c) => c.name);
    if (names.includes("org_id"))
      computed = {
        org_name: `(SELECT o.name FROM organizations o WHERE o.id=\`${table}\`.org_id)`,
        ...computed,
      };
    const sort = params.sortcolumn || "id";
    if (![...names, ...Object.keys(computed)].includes(sort))
      fail("Unsupported sort field");
    const direction = params.sortdir || "DESC";
    if (!["ASC", "DESC"].includes(direction))
      fail("Unsupported sort direction");
    const limit = id(params.limit || 20);
    if (limit > 250) fail("Page size must be at most 250");
    const requested = id(params.page || 1);
    if (requested > 1000000) fail("Page is too large");
    const conditions = [],
      values = [];
    const org = id(params.org ?? 0, true);
    if (org && names.includes("org_id")) {
      conditions.push("org_id=?");
      values.push(org);
    }
    for (const [column, value] of Object.entries(filters)) {
      if (value !== undefined && value !== "" && value !== "all") {
        if (column === "$search") {
          const fields = [
            "name",
            "username",
            "code",
            "message",
            "invoice_number",
            "script",
          ].filter((field) => names.includes(field));
          if (fields.length) {
            const term =
              "%" + text(value, 120).replace(/[!%_]/g, (c) => "!" + c) + "%";
            conditions.push(
              "(" +
                fields
                  .map((field) => "`" + field + "` LIKE ? ESCAPE '!'")
                  .join(" OR ") +
                ")",
            );
            values.push(...fields.map(() => term));
          }
        } else {
          if (!names.includes(column)) fail("Unsupported filter");
          conditions.push("`" + column + "`=?");
          values.push(text(String(value), 255));
        }
      }
    }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    const [counts] = await pool.execute(
      `SELECT COUNT(*) AS count FROM \`${table}\`${where}`,
      values,
    );
    const total = Number(counts[0].count),
      totalPages = Math.max(1, Math.ceil(total / limit)),
      page = Math.min(requested, totalPages);
    const [rows] = await pool.execute(
      `SELECT ${[...names.map((n) => "`" + n + "`"), ...Object.entries(computed).map(([name, expression]) => expression + " AS `" + name + "`")].join(",")} FROM \`${table}\`${where} ORDER BY \`${sort}\` ${direction}${sort !== "id" ? ", id " + direction : ""} LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    );
    return {
      tableName: table,
      rows,
      columns: [
        ...columns,
        ...Object.keys(computed).map((name) => ({ name, type: "bigint" })),
      ],
      total,
      totalPages,
      page,
      limit,
      org,
      sort,
      direction,
    };
  }
  async function lookup(table) {
    const columns = await schema(table);
    const label = columns.some((c) => c.name === "name")
      ? "name"
      : columns.some((c) => c.name === "username")
        ? "username"
        : "id";
    const [rows] = await pool.execute(
      `SELECT id, \`${label}\` AS label FROM \`${table}\` ORDER BY id DESC LIMIT 1000`,
    );
    return rows;
  }
  async function transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async function save(table, data, identifier, executor = pool) {
    const columns = (await schema(table)).map((c) => c.name),
      keys = Object.keys(data);
    if (!keys.length || keys.some((key) => !columns.includes(key)))
      fail("Unsupported field");
    if (identifier) {
      await one(table, identifier, executor);
      await executor.execute(
        `UPDATE \`${table}\` SET ${keys.map((k) => "`" + k + "`=?").join(",")} WHERE id=?`,
        [...keys.map((k) => data[k]), id(identifier)],
      );
      return id(identifier);
    }
    const [result] = await executor.execute(
      `INSERT INTO \`${table}\` (${keys.map((k) => "`" + k + "`").join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      keys.map((k) => data[k]),
    );
    return result.insertId;
  }
  return {
    pool,
    schema,
    one,
    list,
    lookup,
    transaction,
    save,
    id,
    text,
    money,
    fail,
    buildPagination,
  };
};
module.exports.TABLES = TABLES;
module.exports.id = id;
module.exports.text = text;
module.exports.money = money;
