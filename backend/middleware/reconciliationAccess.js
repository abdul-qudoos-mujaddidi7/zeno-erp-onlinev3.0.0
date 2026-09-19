const AppError = require('../errors/AppError');

/*
 * Access guard for the read-only reconciliation report.
 *
 * Every /api/v2 route already requires a valid token (middleware/auth),
 * and that token carries org_id — which is what enforces tenant
 * isolation. This ERP API has no role/permission middleware, so by
 * default any authenticated member of the organization may read their
 * own organization's report.
 *
 * Set RECONCILIATION_REQUIRE_SUPERADMIN=1 to additionally restrict the
 * endpoint to the ERP user named "superadmin". The guard is opt-in so
 * it can never lock existing users out unexpectedly.
 */
module.exports = function requireReconciliationAccess(req, res, next) {
  const user = req.user;

  if (!user) {
    return next(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
  }

  if (String(process.env.RECONCILIATION_REQUIRE_SUPERADMIN || '') === '1') {
    if (String(user.username || '').toLowerCase() !== 'superadmin') {
      return next(
        new AppError(
          'Reconciliation report is restricted to superadmin.',
          403,
          'FORBIDDEN',
        ),
      );
    }
  }

  return next();
};
