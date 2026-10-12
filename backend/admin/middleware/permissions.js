const { SESSION_PREFIX, COOKIE_NAME, cookieOptions } = require('./session');
const { sessionIdentity } = require('../validators/auth');

function requireAdministrator({ sessionConfigured, authService, environment }) {
  return async (req, res, next) => {
    const identity = sessionIdentity.safeParse(req.session?.platformAdmin);
    if (!sessionConfigured || !req.sessionID?.startsWith(SESSION_PREFIX) || !identity.success) {
      return res.status(sessionConfigured ? 401 : 503).render('restricted', {
        layout: 'auth', title: res.locals.labels.restricted, loginLink: sessionConfigured,
        message: sessionConfigured ? res.locals.labels.signInRequired : res.locals.labels.configurationError,
      });
    }
    const current = await authService.current(identity.data);
    if (!current) {
      // Disabled accounts and changed auth versions invalidate the dedicated session.
      const accountId = identity.data.id;
      res.clearCookie(COOKIE_NAME, cookieOptions(environment));
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
      await authService.audit('access.revoked', 'denied', { ip: req.ip }, { actorId: accountId, targetId: accountId });
      return res.status(401).render('restricted', {
        layout: 'auth', title: res.locals.labels.restricted, message: res.locals.labels.signInRequired, loginLink: true,
      });
    }
    const snapshot = JSON.stringify(current.permissions);
    if (req.session.accessSnapshot !== snapshot) {
      await authService.audit('access.changed', 'success', { ip: req.ip }, { actorId: current.id, targetId: current.id, detailCode: 'permissions_reloaded' });
      req.session.accessSnapshot = snapshot;
    }
    req.platformAdmin = current;
    res.locals.administratorName = current.displayName;
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.platformAdmin?.permissions.includes(permission)) {
      return res.status(403).render('restricted', {
        layout: 'auth', title: res.locals.labels.restricted, message: res.locals.labels.forbidden,
      });
    }
    next();
  };
}
module.exports = { requireAdministrator, requirePermission };
