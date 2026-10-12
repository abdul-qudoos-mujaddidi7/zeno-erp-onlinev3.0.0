const session = require('express-session');
const { randomBytes } = require('node:crypto');
const createStore = require('../repositories/session-store');

const COOKIE_NAME = 'zeno_platform_admin';
const SESSION_PREFIX = 'platform-admin:';
function cookieOptions(environment) {
  return { path: '/superadmin', httpOnly: true, sameSite: 'strict', secure: environment.NODE_ENV === 'production' };
}

function createAdminSession({ environment, pool, sessionStore }) {
  const secret = environment.ADMIN_SESSION_SECRET;
  const configured = typeof secret === 'string' && secret.trim().length >= 32 && secret.length <= 512
    && secret !== environment.SESSION_SECRET;
  if (!configured) return { configured: false, middleware: (req, res, next) => next() };
  return {
    configured: true,
    middleware: session({
      name: COOKIE_NAME,
      secret,
      store: sessionStore || createStore(pool || require('../../db')),
      genid: () => SESSION_PREFIX + randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        ...cookieOptions(environment), maxAge: 4 * 60 * 60 * 1000,
      },
    }),
  };
}
module.exports = createAdminSession;
module.exports.COOKIE_NAME = COOKIE_NAME;
module.exports.SESSION_PREFIX = SESSION_PREFIX;
module.exports.cookieOptions = cookieOptions;
