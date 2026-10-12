const express = require('express');
const path = require('node:path');
const { engine } = require('express-handlebars');
const createAdminSession = require('./middleware/session');
const { locale } = require('./middleware/locale');
const { securityHeaders } = require('./middleware/security');
const createRoutes = require('./routes');
const createAuthRepository = require('./repositories/auth');
const createAuthService = require('./services/auth');

module.exports = function createAdminApp({ environment = process.env, pool, sessionStore, authRepository } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Trust only an explicitly configured proxy range on this sub-application.
  let proxyConfigured = true;
  if (environment.ADMIN_TRUST_PROXY) {
    try { app.set('trust proxy', environment.ADMIN_TRUST_PROXY); }
    catch { proxyConfigured = false; }
  }
  app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, '../views/admin/layouts'),
    partialsDir: path.join(__dirname, '../views/admin/partials'),
  }));
  app.set('view engine', 'hbs');
  app.set('views', path.join(__dirname, '../views/admin'));
  app.use(securityHeaders);
  app.use(locale);
  app.use('/assets', express.static(path.join(__dirname, '../public/admin'), {
    index: false, dotfiles: 'deny', fallthrough: false,
  }));
  const adminSession = createAdminSession({ environment: proxyConfigured ? environment : { ...environment, ADMIN_SESSION_SECRET: undefined }, pool, sessionStore });
  app.use(adminSession.middleware);
  app.use(locale);
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  const repository = adminSession.configured ? (authRepository || createAuthRepository(pool || require('../db'))) : null;
  const authService = repository ? createAuthService(repository, environment.ADMIN_SESSION_SECRET) : null;
  app.use(createRoutes({ sessionConfigured: adminSession.configured, authService, environment }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = [400, 404, 413].includes(error.status) ? error.status : 503;
    if (status === 503) console.error('Platform admin request failed:', error.code || 'ADMIN_UNAVAILABLE');
    res.status(status).render('restricted', {
      layout: 'auth', title: res.locals.labels?.unavailable || 'Panel unavailable',
      message: (status === 503 ? res.locals.labels?.serviceError : res.locals.labels?.error) || 'Please try again later.',
    });
  });
  return app;
};
