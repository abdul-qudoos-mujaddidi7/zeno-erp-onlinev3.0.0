const SUMMARY_SQL = `
  SELECT
    (SELECT COUNT(*) FROM organizations) AS totalOrganizations,
    (SELECT COUNT(*) FROM subscriptions WHERE subscription_status = 'active') AS activeSubscriptions,
    (SELECT COUNT(*) FROM subscriptions WHERE subscription_status = 'trial') AS trialSubscriptions,
    (
      SELECT COUNT(*)
      FROM subscriptions
      WHERE subscription_status IN ('active', 'trial')
        AND CASE
          WHEN subscription_status = 'trial' THEN trial_end_date
          ELSE end_date
        END >= UTC_DATE()
        AND CASE
          WHEN subscription_status = 'trial' THEN trial_end_date
          ELSE end_date
        END < DATE_ADD(UTC_DATE(), INTERVAL 31 DAY)
    ) AS expiringSubscriptions,
    (
      SELECT COUNT(*)
      FROM subscription_invoices
      WHERE invoice_status NOT IN ('paid', 'cancelled')
        AND COALESCE(total_amount, 0) > COALESCE(paid_amount, 0)
    ) AS openInvoices
`;

const RECENT_SUBSCRIPTIONS_SQL = `
  SELECT
    s.id,
    s.org_id AS organizationId,
    COALESCE(o.name, '—') AS organizationName,
    COALESCE(p.name, '—') AS planName,
    s.subscription_status AS status,
    CASE
      WHEN s.subscription_status = 'trial' THEN s.trial_end_date
      ELSE s.end_date
    END AS expiryDate
  FROM subscriptions s
  LEFT JOIN organizations o ON o.id = s.org_id
  LEFT JOIN subscription_plans p ON p.id = s.plan_id
  ORDER BY s.id DESC
  LIMIT 6
`;

function searchTerm(db, query) {
  return (
    "%" +
    db.text(query, 120).replace(/[!%_]/g, (character) => "!" + character) +
    "%"
  );
}

module.exports = (db) => ({
  async summary() {
    const [metricsResult, subscriptionsResult] = await Promise.all([
      db.pool.execute(SUMMARY_SQL),
      db.pool.execute(RECENT_SUBSCRIPTIONS_SQL),
    ]);
    const metrics = metricsResult[0][0];
    if (!metrics)
      throw new Error("Smart Super Admin dashboard metrics are unavailable.");
    return {
      metrics,
      recentSubscriptions: subscriptionsResult[0],
    };
  },
  async select(orgId) {
    const id = db.id(orgId, true);
    if (id) await db.one("organizations", id);
    return id;
  },
  async options(query) {
    const term = searchTerm(db, query);
    const [rows] = await db.pool.execute(
      "SELECT id,name FROM organizations WHERE name LIKE ? ESCAPE '!' OR CAST(id AS CHAR) LIKE ? ESCAPE '!' ORDER BY name LIMIT 20",
      [term, term],
    );
    return rows;
  },
  async quickSearch(query) {
    const normalized = db.text(query, 120);
    if (normalized.length < 2) return [];
    const term = searchTerm(db, normalized);
    const [organizations, subscriptions] = await Promise.all([
      db.pool.execute(
        "SELECT id,name FROM organizations WHERE name LIKE ? ESCAPE '!' OR CAST(id AS CHAR) LIKE ? ESCAPE '!' ORDER BY name LIMIT 6",
        [term, term],
      ),
      db.pool.execute(
        `SELECT s.id, s.org_id AS organizationId,
          COALESCE(o.name, '—') AS organizationName,
          COALESCE(p.name, '—') AS planName,
          s.subscription_status AS status
        FROM subscriptions s
        LEFT JOIN organizations o ON o.id = s.org_id
        LEFT JOIN subscription_plans p ON p.id = s.plan_id
        WHERE CAST(s.id AS CHAR) LIKE ? ESCAPE '!'
          OR CAST(s.org_id AS CHAR) LIKE ? ESCAPE '!'
          OR o.name LIKE ? ESCAPE '!'
          OR p.name LIKE ? ESCAPE '!'
        ORDER BY s.id DESC
        LIMIT 6`,
        [term, term, term, term],
      ),
    ]);
    return [
      ...organizations[0].map((row) => ({
        type: "organization",
        label: row.name,
        detail: `#${row.id}`,
        url:
          "/smart-super-admin/select-org/" +
          encodeURIComponent(row.id) +
          "?returnTo=%2Fsmart-super-admin%2Forganizations",
      })),
      ...subscriptions[0].map((row) => ({
        type: "subscription",
        label: row.organizationName,
        detail: `#${row.id} · ${row.planName} · ${row.status}`,
        url:
          "/smart-super-admin/subscription/" +
          encodeURIComponent(row.id) +
          "/" +
          encodeURIComponent(row.organizationId),
      })),
    ];
  },
});
