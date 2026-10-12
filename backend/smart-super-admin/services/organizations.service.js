const COUNT_TABLES = [
  "products",
  "sales",
  "purchases",
  "journals",
  "accounts",
  "users",
  "activity_logs",
];
module.exports = (db) => ({
  async grid(query) {
    return db.list(
      "organizations",
      {
        sortcolumn: "created_at",
        sortdir: "DESC",
        org: 0,
        limit: 100,
        page: query.page || 1,
      },
      query.type ? { type: query.type } : {},
    );
  },
  async list(params, query) {
    const org = db.id(params.org, true);
    return db.list(
      "organizations",
      params,
      {
        ...(org ? { id: String(org) } : {}),
        ...(query.type ? { type: query.type } : {}),
        $search: query.q,
      },
      {
        ...Object.fromEntries(
          COUNT_TABLES.map((table) => [
            table + "_count",
            `(SELECT COUNT(*) FROM ${table} WHERE org_id=organizations.id AND status<>0)`,
          ]),
        ),
        subscription_id:
          "(SELECT s.id FROM subscriptions s WHERE s.org_id=organizations.id ORDER BY s.id DESC LIMIT 1)",
        subscription_plan_name:
          "(SELECT p.name FROM subscriptions s LEFT JOIN subscription_plans p ON p.id=s.plan_id WHERE s.org_id=organizations.id ORDER BY s.id DESC LIMIT 1)",
        subscription_status:
          "(SELECT s.subscription_status FROM subscriptions s WHERE s.org_id=organizations.id ORDER BY s.id DESC LIMIT 1)",
        subscription_end_date:
          "(SELECT s.end_date FROM subscriptions s WHERE s.org_id=organizations.id ORDER BY s.id DESC LIMIT 1)",
        subscription_trial_end_date:
          "(SELECT s.trial_end_date FROM subscriptions s WHERE s.org_id=organizations.id ORDER BY s.id DESC LIMIT 1)",
      },
    );
  },
});
