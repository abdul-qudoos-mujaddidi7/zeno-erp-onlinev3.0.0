module.exports = (db) => ({
  ...require("./forms.service")(db, "subscription-plans"),
  async features(planId) {
    await db.one("subscription_plans", planId);
    const [rows] = await db.pool.execute(
      `SELECT pf.feature_id,pf.value,pf.unit,f.name AS feature_name,f.feature_key,f.type AS feature_type FROM subscription_plan_features pf JOIN features f ON f.id=pf.feature_id WHERE pf.plan_id=? ORDER BY pf.id`,
      [db.id(planId)],
    );
    return rows;
  },
});
