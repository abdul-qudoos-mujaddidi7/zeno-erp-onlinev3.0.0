const express = require('express');
const { requireAdministrator, requirePermission } = require('./middleware/permissions');
const csrf = require('./middleware/csrf');
const overview = require('./controllers/overview');
const createAuthController = require('./controllers/auth');
const createOrganizationContext = require('./middleware/organization-context');
const createOrganizationService = require('./services/organizations');
const createOrganizationController = require('./controllers/organizations');

module.exports = ({ sessionConfigured, authService, environment, organizationRepository }) => {
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
  router.use(createOrganizationContext(organizationRepository));
  const organizations = createOrganizationController(createOrganizationService(organizationRepository), authService);
  router.get('/', requirePermission('overview.read'), overview.show);
  router.post('/preferences/language', requirePermission('overview.read'), overview.updateLanguage);
  router.get('/organizations', requirePermission('organizations.read'), organizations.list);
  router.get('/organizations/:id', requirePermission('organizations.read'), organizations.detail);
  router.post('/organizations/select', requirePermission('organizations.read'), requirePermission('organizations.select'), organizations.select);
  router.use((req, res) => res.status(404).render('restricted', {
    layout: 'auth', title: res.locals.labels.unavailable, message: res.locals.labels.error,
  }));
  return router;
};
