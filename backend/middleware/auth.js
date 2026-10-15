const {
  enforceOrganizationSubscription,
} = require("../services/subscription-access");
const { isModuleFeatureEnabled, moduleForApiPath } = require('../services/subscription-features');

function createAuth(db) {
  return async function auth(req, res, next) {
    try {
      const header = req.headers.authorization;
      let token =
        typeof header === "string"
          ? header.replace(/^Bearer\s+/i, "").trim()
          : "";

      if (!token && typeof req.params?.token === "string") {
        token = req.params.token.trim();
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      const [rows] = await db.execute(
        `SELECT u.*, t.token, t.user_pk AS auth_user_pk
         FROM auth_tokens t
         JOIN users u
           ON u.id = t.user_pk
           OR (t.user_pk IS NULL AND u.local_id = t.user_id)
         WHERE t.token = ?
           AND t.expires_at > NOW()
         LIMIT 2`,
        [token],
      );

      if (rows.length !== 1) {
        if (rows.length > 1) {
          await db.execute("DELETE FROM auth_tokens WHERE token = ?", [token]);
        }
        return res.status(401).json({
          success: false,
          message:
            rows.length > 1
              ? "This session cannot be safely associated with one organization. Please sign in again."
              : "Invalid or expired token",
          code: rows.length > 1 ? "AMBIGUOUS_TOKEN" : "INVALID_TOKEN",
        });
      }

      const user = rows[0];
      if (user.auth_user_pk === null) {
        await db.execute(
          "UPDATE auth_tokens SET user_pk = ? WHERE token = ? AND user_pk IS NULL",
          [user.id, token],
        );
      }

      const access = await enforceOrganizationSubscription(db, user.org_id);
      if (!access.allowed) {
        return res.status(402).json({
          success: false,
          message: access.message,
          code: access.code,
          subscription_status: access.status,
        });
      }

      req.user = user;
      req.subscription = access.subscription;
      if (req.subscription) {
        const [features] = await db.execute(
          `SELECT sf.feature_id, sf.value, sf.unit, sf.status,
                  f.feature_key, f.name, f.type, f.icon
           FROM subscription_features sf
           JOIN features f ON f.id = sf.feature_id
           WHERE sf.subscription_id = ?`,
          [req.subscription.id],
        );
        const [catalog] = await db.execute(
          'SELECT id, feature_key, name FROM features WHERE status = 1',
        );
        const [planFeatures] = await db.execute(
          `SELECT pf.feature_id, pf.status, f.feature_key, f.name
           FROM subscription_plan_features pf
           JOIN features f ON f.id = pf.feature_id
           WHERE pf.plan_id = ?`,
          [req.subscription.plan_id],
        );
        req.subscription.features = features;
        req.subscription.feature_catalog = catalog;
        req.subscription.plan_features = planFeatures;
        const moduleCode = moduleForApiPath(req.originalUrl);
        if (moduleCode && !isModuleFeatureEnabled(req.subscription, moduleCode)) {
          return res.status(403).json({
            success: false,
            message: `The ${moduleCode} feature is not included in this organization's subscription.`,
            code: 'SUBSCRIPTION_FEATURE_DISABLED',
            feature: moduleCode,
          });
        }
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function auth(req, res, next) {
  return createAuth(require("../db"))(req, res, next);
}

auth.createAuth = createAuth;

module.exports = auth;
