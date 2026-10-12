const { randomBytes } = require('node:crypto');
const { COOKIE_NAME, SESSION_PREFIX, cookieOptions } = require('../middleware/session');
const { sessionIdentity } = require('../validators/auth');
const callback = (object, method) => new Promise((resolve, reject) => object[method](error => error ? reject(error) : resolve()));

module.exports = (authService, environment) => ({
  async showLogin(req, res) {
    await authService.ready();
    if (req.sessionID.startsWith(SESSION_PREFIX) && sessionIdentity.safeParse(req.session.platformAdmin).success) {
      const current = await authService.current(req.session.platformAdmin);
      if (current?.permissions.includes('overview.read')) return res.redirect(303, '/superadmin');
    }
    res.render('login', { layout: 'auth', title: res.locals.labels.signIn });
  },
  async login(req, res) {
    const result = await authService.authenticate(req.body, req.ip);
    if (!result.ok) {
      if (result.throttled) res.set('Retry-After', '900');
      return res.status(result.throttled ? 429 : 401).render('login', {
        layout: 'auth', title: res.locals.labels.signIn, errorMessage: res.locals.labels.invalidCredentials,
      });
    }
    // Destroy the pre-login ID and generate a new namespaced session.
    try {
      await callback(req.session, 'regenerate');
      req.session.platformAdmin = { id: result.administrator.id, authVersion: Number(result.administrator.auth_version) };
      req.session.language = result.language;
      req.session.csrfToken = randomBytes(32).toString('hex');
      req.session.accessSnapshot = JSON.stringify(result.administrator.permissions);
      await callback(req.session, 'save');
      // An audit failure prevents issuing a usable login response.
      await authService.audit('login.success', 'success', { ip: req.ip }, { actorId: result.administrator.id, targetId: result.administrator.id });
    } catch (error) {
      res.clearCookie(COOKIE_NAME, cookieOptions(environment));
      try { if (req.session) await callback(req.session, 'destroy'); }
      finally { await authService.audit('login.failure', 'denied', { ip: req.ip }, { detailCode: 'session_establishment_failed' }); }
      throw error;
    }
    res.redirect(303, '/superadmin');
  },
  async logout(req, res) {
    const accountId = req.platformAdmin.id;
    // Invalidate first; even audit failures must not leave the browser logged in.
    res.clearCookie(COOKIE_NAME, cookieOptions(environment));
    try { await callback(req.session, 'destroy'); }
    catch (error) {
      await authService.audit('logout', 'denied', { ip: req.ip }, { actorId: accountId, targetId: accountId, detailCode: 'session_destroy_failed' });
      throw error;
    }
    await authService.audit('logout', 'success', { ip: req.ip }, { actorId: accountId, targetId: accountId });
    res.redirect(303, '/superadmin/login');
  },
});
