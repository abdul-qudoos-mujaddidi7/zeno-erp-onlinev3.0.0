const { createHmac } = require('node:crypto');
const passwords = require('./passwords');
const validators = require('../validators/auth');

const PERMISSIONS = Object.freeze(['overview.read']);
module.exports = function createAuthService(repository, secret) {
  const digest = (scope, value) => createHmac('sha256', secret).update(scope + '\0' + value).digest('hex');
  const audit = (event, outcome, context = {}, extra = {}) => repository.audit({
    event, outcome, origin: 'http', subjectHash: digest('audit', context.ip || 'unknown'), ...extra,
  });
  return {
    audit,
    ready: () => repository.ready(),
    async authenticate(body, ip) {
      const parsed = validators.login.safeParse(body);
      const accountKey = parsed.success ? parsed.data.username : '(invalid)';
      const allowed = await repository.consumeLimits([
        { key: digest('account-limit', accountKey), maximum: 10 },
        { key: digest('ip-limit', ip || 'unknown'), maximum: 30 },
      ]);
      if (!allowed) {
        await audit('login.failure', 'denied', { ip }, { detailCode: 'throttled' });
        return { ok: false, throttled: true };
      }
      if (!parsed.success) {
        await audit('login.failure', 'denied', { ip }, { detailCode: 'invalid_credentials' });
        return { ok: false };
      }
      const credentials = await repository.findCredentials(parsed.data.username);
      const matches = await passwords.verify(parsed.data.password, credentials?.password_hash);
      const current = credentials ? await repository.access(credentials.id) : null;
      if (!matches || !current || Number(current.is_active) !== 1 || !current.permissions.includes('overview.read')) {
        await audit('login.failure', 'denied', { ip }, { detailCode: 'invalid_credentials' });
        return { ok: false };
      }
      return { ok: true, administrator: current, language: parsed.data.language };
    },
    async current(identity) {
      const parsed = validators.sessionIdentity.safeParse(identity);
      if (!parsed.success) return null;
      const account = await repository.access(parsed.data.id);
      if (!account || Number(account.is_active) !== 1 || Number(account.auth_version) !== parsed.data.authVersion) return null;
      return { id: account.id, authVersion: Number(account.auth_version), displayName: account.display_name,
        permissions: account.permissions.filter(code => PERMISSIONS.includes(code)) };
    },
  };
};
module.exports.PERMISSIONS = PERMISSIONS;
