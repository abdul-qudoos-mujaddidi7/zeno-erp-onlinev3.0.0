const express = require('express');
const { requireAdministrator, requirePermission } = require('./middleware/permissions');
const csrf = require('./middleware/csrf');
const overview = require('./controllers/overview');
const createAuthController = require('./controllers/auth');

module.exports = ({ sessionConfigured, authService, environment }) => {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!sessionConfigured) return res.status(503).render('restricted', {
      layout: 'auth', title: res.locals.labels.unavailable, message: res.locals.labels.configurationError,
    });
    req.adminAudit = authService.audit;
    next();
  });
  const auth = createAuthController(authService, environment);
  router.get('/login', csrf, auth.showLogin);
  router.post('/login', csrf, auth.login);
  router.use(requireAdministrator({ sessionConfigured, authService, environment }));
  router.use(csrf);
  router.post('/logout', auth.logout);
  router.use(requirePermission('overview.read'));
  router.get('/', overview.show);
  router.post('/preferences/language', overview.updateLanguage);
  router.use((req, res) => res.status(404).render('restricted', {
    layout: 'auth', title: res.locals.labels.unavailable, message: res.locals.labels.error,
  }));
  return router;
};
