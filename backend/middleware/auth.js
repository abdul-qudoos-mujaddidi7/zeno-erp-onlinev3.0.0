const {
  enforceOrganizationSubscription,
} = require("../services/subscription-access");
const { isModuleFeatureEnabled, moduleForApiPath } = require('../services/subscription-features');

/*
 * NOTE: the subscription feature metadata (subscription_features, the features
 * catalogue, subscription_plan_features) is deliberately NOT cached here, even
 * though it is three queries on every request.
 *
 * It is read-only configuration, so caching it looks attractive - and it does
 * cost only about 4 ms per request on this database - but a plan or tenant
 * feature change has to reach the very next request. A short TTL would make an
 * administrator's "disable Accounts for this tenant" sit unnoticed for up to a
 * minute, which is exactly the guarantee the subscription tests pin down. The
 * three queries stay; only the token lookup below was worth rewriting.
 */

/*
 * Token -> user, resolved by primary key.
 *
 * The old single statement joined on
 *
 *   ON u.id = t.user_pk OR (t.user_pk IS NULL AND u.local_id = t.user_id)
 *
 * An OR spanning two tables cannot be driven by an index, so MySQL resolved it
 * by scanning every row of `users` with a block-nested-loop join on **every
 * authenticated request** - plan: `u type=ALL ... Using join buffer` - and
 * `SELECT u.*` then reads all 25 columns of each of them. A page that issues
 * about eighteen API calls paid for eighteen full user scans before any handler
 * ran.
 *
 * The two halves are split instead of ORed, which is exactly equivalent:
 * `u.id = t.user_pk` can only match when the token's user_pk is not NULL
 * (comparing to NULL is never true), and the legacy branch requires user_pk IS
 * NULL. For one token, only one of the two can ever apply, so the pair of
 * statements returns the same rows the single statement did - including the
 * ambiguity case, which can only arise on the legacy branch where local_id is
 * not unique across organisations.
 */
const TOKEN_USER_BY_PK_SQL = `
  SELECT u.*, t.token, t.user_pk AS auth_user_pk
  FROM auth_tokens t
  JOIN users u
    ON u.id = t.user_pk
  WHERE t.token = ?
    AND t.expires_at > NOW()
  LIMIT 2
`;

const TOKEN_USER_BY_LOCAL_ID_SQL = `
  SELECT u.*, t.token, t.user_pk AS auth_user_pk
  FROM auth_tokens t
  JOIN users u
    ON u.local_id = t.user_id
  WHERE t.token = ?
    AND t.expires_at > NOW()
    AND t.user_pk IS NULL
  LIMIT 2
`;

/*
 * @returns {Promise<Array>} up to two user rows for this token
 */
async function findTokenUser(db, token) {
  const [rows] = await db.execute(TOKEN_USER_BY_PK_SQL, [token]);

  if (rows.length > 0) return rows;

  /* Only reached for legacy tokens that have never been upgraded. */
  const [legacyRows] = await db.execute(TOKEN_USER_BY_LOCAL_ID_SQL, [token]);

  return legacyRows;
}

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

      const rows = await findTokenUser(db, token);

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
auth.TOKEN_USER_BY_PK_SQL = TOKEN_USER_BY_PK_SQL;
auth.TOKEN_USER_BY_LOCAL_ID_SQL = TOKEN_USER_BY_LOCAL_ID_SQL;

module.exports = auth;
