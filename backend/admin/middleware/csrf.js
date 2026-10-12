const { randomBytes, timingSafeEqual } = require('node:crypto');

module.exports = async function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const token = req.body?._csrf;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)
      || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrfToken))) {
      if (req.adminAudit) await req.adminAudit(req.path === '/login' ? 'login.failure' : 'request.denied', 'denied', { ip: req.ip }, { detailCode: 'csrf_rejected' });
      return res.status(403).render('restricted', {
        layout: 'auth', title: res.locals.labels.restricted, message: res.locals.labels.expiredForm,
      });
    }
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};
