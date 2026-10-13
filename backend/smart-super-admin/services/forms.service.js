const dates = require("../helpers/date-helpers");
const field = (name, type = "text", options) => ({
  name,
  type,
  options,
  label: name.replaceAll("_", " "),
});
const multilingual = [
  "name",
  "name_fa",
  "name_ps",
  "description",
  "description_fa",
  "description_ps",
].map((name) =>
  field(name, name.startsWith("description") ? "textarea" : "text"),
);
const definitions = {
  "org-types": {
    table: "org_types",
    idField: "org_type_id",
    path: "org-type",
    title: "Organization Types",
    fields: [
      field("code"),
      field("icon"),
      field("type_status", "select", ["active", "coming_soon", "inactive"]),
      ...[
        "name",
        "name_fa",
        "name_ps",
        "summary",
        "summary_fa",
        "summary_ps",
        "description",
        "description_fa",
        "description_ps",
      ].map((name) =>
        field(name, /summary|description/.test(name) ? "textarea" : "text"),
      ),
    ],
  },
  features: {
    table: "features",
    idField: "feature_id",
    path: "feature",
    title: "Features",
    fields: [
      field("feature_key"),
      field("type"),
      field("icon"),
      ...multilingual,
      field("status", "select", ["1", "0"]),
    ],
  },
  "subscription-plans": {
    table: "subscription_plans",
    idField: "subscription_plan_id",
    path: "subscription-plan",
    title: "Subscription Plans",
    features: true,
    fields: [
      field("org_type_id", "reference", "org_types"),
      field("code"),
      field("color", "color"),
      field("plan_type"),
      ...multilingual,
      field("is_active", "select", ["true", "false"]),
      field("price", "decimal"),
      field("recurring_price", "decimal"),
      field("currency", "currency"),
      field("billing_cycle_unit"),
      field("billing_cycle_count", "integer"),
      field("trial_days", "integer"),
      field("grace_period_days", "integer"),
    ],
  },
  subscriptions: {
    table: "subscriptions",
    idField: "subscription_id",
    path: "subscription",
    title: "Subscriptions",
    features: true,
    fields: [
      field("org_id", "reference", "organizations"),
      field("plan_id", "reference", "subscription_plans"),
      ...[
        "start_date",
        "end_date",
        "next_billing_date",
        "trial_end_date",
        "cancelled_at",
      ].map((name) => field(name, "datetime-local")),
      field("subscription_status", "select", [
        "active",
        "trial",
        "expired",
        "cancelled",
        "suspended",
      ]),
      field("auto_renew", "select", ["true", "false"]),
      field("price_override", "decimal"),
      field("currency", "currency"),
      field("description", "textarea"),
    ],
  },
};
module.exports = function formsService(db, key) {
  const config = definitions[key];
  async function form(identifier = 0, org = 0) {
    identifier = db.id(identifier, true);
    org = db.id(org, true);
    const row = Number(identifier)
      ? await db.one(config.table, identifier)
      : {};
    if (!Number(identifier)) {
      row.org_id = Number(org) || "";
      row.currency = "USD";
      row.status = 1;
      row.is_active = "true";
      row.subscription_status = "trial";
    }
    const fields = [];
    for (const descriptor of config.fields) {
      let value =
        row[descriptor.name] ??
        (descriptor.type === "select"
          ? descriptor.options[0]
          : descriptor.name === "price_override"
            ? ""
            : ["decimal", "integer"].includes(descriptor.type)
              ? "0"
              : "");
      if (descriptor.type === "datetime-local")
        value = dates.getLocalDateTime(value);
      const choices =
        descriptor.type === "reference"
          ? await db.lookup(descriptor.options)
          : (descriptor.options || []).map((choice) => ({
              id: choice,
              label: choice,
            }));
      fields.push({
        ...descriptor,
        value,
        textarea: descriptor.type === "textarea",
        select: ["reference", "select"].includes(descriptor.type),
        inputType: ["decimal", "integer"].includes(descriptor.type)
          ? "number"
          : descriptor.type === "currency"
            ? "text"
            : descriptor.type,
        required: ["name", "org_id", "plan_id"].includes(descriptor.name),
        rtl: /_(fa|ps)$/.test(descriptor.name),
        choices: choices.map((choice) => ({
          ...choice,
          selected: String(choice.id) === String(value),
        })),
      });
    }
    let assigned = [];
    if (config.features && row.id) {
      const table =
          key === "subscriptions"
            ? "subscription_features"
            : "subscription_plan_features",
        owner = key === "subscriptions" ? "subscription_id" : "plan_id";
      const [rows] = await db.pool.execute(
        `SELECT sf.feature_id,sf.value,sf.unit${key === "subscriptions" ? ",sf.used_value" : ""},f.name FROM ${table} sf JOIN features f ON f.id=sf.feature_id WHERE sf.${owner}=?`,
        [row.id],
      );
      assigned = rows;
    }
    return {
      config,
      record: row,
      fields,
      idField: config.idField,
      featuresEnabled: !!config.features,
      assigned,
      allFeatures: config.features ? await db.lookup("features") : [],
      action: "/smart-super-admin/" + config.path,
      backUrl: "/smart-super-admin/list-" + key + "/id/DESC/0/20/1",
      title: row.id ? "Edit " + config.title : "New " + config.title,
    };
  }
  function input(body) {
    const data = {};
    for (const descriptor of config.fields) {
      const value = body[descriptor.name];
      if (
        ["name", "org_id", "plan_id"].includes(descriptor.name) &&
        !db.text(value)
      )
        db.fail(descriptor.name + " is required");
      if (descriptor.type === "reference")
        data[descriptor.name] = value ? db.id(value) : null;
      else if (descriptor.type === "datetime-local")
        data[descriptor.name] = dates.formatMySQLDateKabulToUTC(value);
      else if (descriptor.type === "decimal")
        data[descriptor.name] =
          value === "" || value === undefined ? null : db.money(value);
      else if (descriptor.type === "integer") {
        const number = value ? db.id(value, true) : 0;
        if (number > 1000000) db.fail("Integer is too large");
        data[descriptor.name] = number;
      } else if (descriptor.type === "select") {
        const chosen = String(value ?? descriptor.options[0]);
        if (!descriptor.options.includes(chosen))
          db.fail("Invalid " + descriptor.name);
        data[descriptor.name] =
          descriptor.name === "status" ? Number(chosen) : chosen;
      } else if (descriptor.type === "currency") {
        const currency = db.text(value || "USD", 3).toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency)) db.fail("Invalid currency");
        data[descriptor.name] = currency;
      } else
        data[descriptor.name] = db.text(
          value,
          descriptor.type === "textarea"
            ? 20000
            : descriptor.name === "code" && key === "subscription-plans"
              ? 100
              : 255,
        );
    }
    return data;
  }
  async function assignments(connection, ownerId, body) {
    const array = (value) =>
      Array.isArray(value) ? value : value === undefined ? [] : [value];
    const ids = array(body.feature_id),
      values = array(body.feature_value),
      units = array(body.feature_unit);
    if (
      ids.length > 100 ||
      values.length !== ids.length ||
      units.length !== ids.length
    )
      db.fail("Invalid feature rows");
    const seen = new Set();
    const table =
        key === "subscriptions"
          ? "subscription_features"
          : "subscription_plan_features",
      owner = key === "subscriptions" ? "subscription_id" : "plan_id";
    const [previous] = await connection.execute(
      `SELECT id,feature_id FROM ${table} WHERE ${owner}=? FOR UPDATE`,
      [ownerId],
    );
    for (let i = 0; i < ids.length; i++) {
      const featureId = db.id(ids[i]);
      if (seen.has(featureId)) db.fail("Duplicate feature");
      seen.add(featureId);
      await db.one("features", featureId, connection);
      const value = db.text(values[i], 20000),
        unit = db.text(units[i], 50);
      const existing = previous.find(
        (row) => Number(row.feature_id) === featureId,
      );
      if (existing)
        await connection.execute(
          `UPDATE ${table} SET value=?,unit=? WHERE id=?`,
          [value, unit, existing.id],
        );
      else
        await connection.execute(
          `INSERT INTO ${table} (${owner},feature_id,value,unit,status) VALUES (?,?,?,?,1)`,
          [ownerId, featureId, value, unit],
        );
    }
    for (const row of previous)
      if (!seen.has(Number(row.feature_id)))
        await connection.execute(`DELETE FROM ${table} WHERE id=?`, [row.id]);
  }
  async function save(body) {
    const identifier = db.id(body[config.idField] || 0, true),
      data = input(body);
    return db.transaction(async (connection) => {
      for (const descriptor of config.fields.filter(
        (field) => field.type === "reference",
      ))
        if (data[descriptor.name])
          await db.one(descriptor.options, data[descriptor.name], connection);
      const columns = await db.schema(config.table);
      if (
        !identifier &&
        columns.some((column) => column.name === "status") &&
        data.status === undefined
      )
        data.status = 1;
      const saved = await db.save(config.table, data, identifier, connection);
      if (config.features) await assignments(connection, saved, body);
      return saved;
    });
  }
  const filterColumn = {
    "org-types": "type_status",
    features: "type",
    "subscription-plans": "plan_type",
    subscriptions: "subscription_status",
  }[key];
  return {
    config,
    form,
    save,
    list: (params, query = {}) =>
      db.list(
        config.table,
        params,
        {
          [filterColumn]: query.filter,
          $search: query.q,
          $from: query.from,
          $to: query.to,
        },
        key === "subscriptions"
          ? {
              plan_name:
                "(SELECT p.name FROM subscription_plans p WHERE p.id=subscriptions.plan_id)",
            }
          : key === "subscription-plans"
            ? {
                org_type_name:
                  "(SELECT o.name FROM org_types o WHERE o.id=subscription_plans.org_type_id)",
              }
            : {},
      ),
  };
};
module.exports.definitions = definitions;
