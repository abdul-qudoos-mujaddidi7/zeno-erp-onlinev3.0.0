const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { PassThrough } = require('node:stream');
const createAdminApp = require('../admin/app');
const passwords = require('../admin/services/passwords');
const createAuthService = require('../admin/services/auth');
const provisioningService = require('../admin/services/provisioning');
const createRepository = require('../admin/repositories/auth');
const { hiddenQuestion } = require('../admin/cli');

const environment = { ADMIN_SESSION_SECRET: 'auth-tests-only-independent-secret-'.repeat(2), SESSION_SECRET: 'erp-test-secret', NODE_ENV: 'test' };
// Test-only credentials never create an account in the application database.
const password = 'Test only password 42!';
let encoded;
test.before(async () => { encoded = await passwords.hash(password); });

async function fixture(t, options = {}) {
  const state = { account: { id: 1, display_name: 'Operator', is_active: 1, auth_version: 1, permissions: ['overview.read'] },
    events: [], allowed: true, outage: false, buckets: new Map() };
  const check = () => { if (state.outage) throw Object.assign(new Error('unavailable'), { code: 'DB_UNAVAILABLE' }); };
  const repository = {
    async ready() { check(); },
    async findCredentials(username) { check(); return username === 'operator' ? { id: 1, password_hash: encoded } : null; },
    async access(id) { check(); return id === 1 ? state.account : null; },
    async consumeLimits(buckets) {
      check(); let allowed = state.allowed;
      for (const bucket of buckets) {
        const attempts = (state.buckets.get(bucket.key) || 0) + 1;
        state.buckets.set(bucket.key, attempts);
        if (attempts > bucket.maximum) allowed = false;
      }
      return allowed;
    },
    async audit(event) { check(); if (state.auditFailure) throw new Error('AUDIT_UNAVAILABLE'); state.events.push(event); },
  };
  const store = options.store || new session.MemoryStore();
  const parent = express();
  parent.use('/superadmin', createAdminApp({ environment, sessionStore: store, authRepository: repository, ...options }));
  parent.get('/api/superadmin', (req, res) => res.send('legacy panel'));
  const server = parent.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let cookie;
  async function request(path, body, extraHeaders = {}) {
    const response = await fetch(origin + '/superadmin' + path, {
      redirect: 'manual', method: body ? 'POST' : 'GET',
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...options.requestHeaders, ...extraHeaders },
      ...(body ? { body: new URLSearchParams(body) } : {}),
    });
    const issued = response.headers.get('set-cookie');
    if (issued) cookie = issued.split(';')[0];
    return response;
  }
  async function loginForm(language = 'en') {
    const response = await request('/login?lang=' + language);
    const html = await response.text();
    return { response, html, csrf: html.match(/name="_csrf" value="([a-f0-9]+)"/)?.[1] };
  }
  async function login() {
    const { csrf } = await loginForm();
    return request('/login', { username: 'operator', password, language: 'en', _csrf: csrf });
  }
  return { state, repository, store, origin, request, loginForm, login, getCookie: () => cookie };
}

test('anonymous and ERP sessions cannot authorize overview; public login is multilingual', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('')).status, 401);
  assert.equal((await app.request('', null, { Cookie: 'erp_session=s:ordinary-erp-session', Authorization: 'Bearer erp-token' })).status, 401);
  for (const [code, htmlCode, direction] of [['en', 'en', 'ltr'], ['fa', 'fa-AF', 'rtl'], ['ps', 'ps-AF', 'rtl']]) {
    const { response, html } = await app.loginForm(code);
    assert.equal(response.status, 200);
    assert.match(html, new RegExp(`lang="${htmlCode}" dir="${direction}"`));
    assert.match(html, /type="password"/);
  }
});

test('valid login regenerates and saves only dedicated identity; old ID loses access', async t => {
  const app = await fixture(t);
  const { csrf } = await app.loginForm();
  const oldCookie = app.getCookie();
  const response = await app.request('/login', { username: 'operator', password, language: 'en', _csrf: csrf });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/superadmin');
  assert.notEqual(app.getCookie(), oldCookie);
  assert.doesNotMatch(response.headers.get('set-cookie'), /erp_session/);
  const all = await new Promise((resolve, reject) => app.store.all((err, data) => err ? reject(err) : resolve(data)));
  const sessions = Object.values(all);
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].platformAdmin, { id: 1, authVersion: 1 });
  assert.equal(sessions[0].user, undefined);
  assert.equal((await app.request('')).status, 200);
  assert.equal((await app.request('', null, { Cookie: oldCookie })).status, 401);
  assert.ok(app.state.events.some(event => event.event === 'login.success'));
  assert.doesNotMatch(JSON.stringify(app.state.events), /password|csrf|session|Test only/i);
});

test('invalid, nonexistent, disabled and permissionless credentials have the same generic error', async t => {
  const app = await fixture(t);
  const { csrf } = await app.loginForm();
  const tryLogin = async (username, value) => {
    const response = await app.request('/login', { username, password: value, language: 'en', _csrf: csrf });
    assert.equal(response.status, 401);
    const html = await response.text();
    assert.match(html, /Unable to sign in/);
    assert.doesNotMatch(html, /disabled|not found|unknown user/i);
    return html;
  };
  const wrong = await tryLogin('operator', 'Wrong password 42!');
  assert.equal(await tryLogin('unknown', password), wrong);
  app.state.account.is_active = 0;
  assert.equal(await tryLogin('operator', password), wrong);
  app.state.account.is_active = 1; app.state.account.permissions = [];
  assert.equal(await tryLogin('operator', password), wrong);
  assert.equal((await app.request('')).status, 401);
  assert.equal(app.state.events.filter(event => event.event === 'login.failure').length, 4);
});

test('login/logout/preferences reject missing, malformed and stale CSRF tokens', async t => {
  const app = await fixture(t);
  const { csrf } = await app.loginForm();
  for (const token of [undefined, 'a'.repeat(64), 'د'.repeat(64)]) {
    assert.equal((await app.request('/login', { username: 'operator', password, language: 'en', ...(token ? { _csrf: token } : {}) })).status, 403);
  }
  assert.equal((await app.request('/login', { username: 'operator', password, language: 'en', _csrf: csrf })).status, 303);
  assert.equal((await app.request('/logout', { _csrf: csrf })).status, 403);
  assert.equal((await app.request('/preferences/language', { language: 'fa' })).status, 403);
  assert.equal((await app.request('')).status, 200);
});

test('disabled accounts and current database permission revocation deny existing sessions', async t => {
  const app = await fixture(t);
  assert.equal((await app.login()).status, 303);
  app.state.account.permissions = [];
  assert.equal((await app.request('')).status, 403);
  assert.ok(app.state.events.some(event => event.event === 'access.changed'));
  app.state.account.permissions = ['overview.read'];
  app.state.account.is_active = 0;
  assert.equal((await app.request('')).status, 401);
  assert.ok(app.state.events.some(event => event.event === 'access.revoked'));
  app.state.account.is_active = 1;
  assert.equal((await app.request('')).status, 401);
});

test('auth-version changes invalidate sessions even after access is restored', async t => {
  const app = await fixture(t);
  assert.equal((await app.login()).status, 303);
  app.state.account.auth_version++;
  assert.equal((await app.request('')).status, 401);
});

test('POST logout destroys access and clears the matching cookie; GET never logs out', async t => {
  const app = await fixture(t);
  assert.equal((await app.login()).status, 303);
  assert.equal((await app.request('/logout')).status, 404);
  const html = await (await app.request('')).text();
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const oldCookie = app.getCookie();
  const response = await app.request('/logout', { _csrf: csrf });
  assert.equal(response.status, 303);
  const cleared = response.headers.get('set-cookie');
  assert.match(cleared, /zeno_platform_admin=;/);
  assert.match(cleared, /Path=\/superadmin/); assert.match(cleared, /HttpOnly/); assert.match(cleared, /SameSite=Strict/);
  assert.equal((await app.request('', null, { Cookie: oldCookie })).status, 401);
  assert.ok(app.state.events.some(event => event.event === 'logout'));
});

test('database, audit and session persistence failures never grant access', async t => {
  const app = await fixture(t);
  app.state.outage = true;
  assert.equal((await app.request('/login')).status, 503);
  app.state.outage = false;
  const { csrf } = await app.loginForm();
  app.state.outage = true;
  assert.equal((await app.request('/login', { username: 'operator', password, language: 'en', _csrf: csrf })).status, 503);
  assert.equal((await app.request('')).status, 401);
  app.state.outage = false;
  assert.equal((await app.login()).status, 303);
  app.state.outage = true;
  assert.equal((await app.request('')).status, 503);
  app.state.outage = false;
  const failing = await fixture(t);
  await failing.loginForm();
  failing.state.auditFailure = true;
  assert.equal((await failing.login()).status, 503);
  assert.equal((await failing.request('')).status, 401);
  const saving = await fixture(t);
  const form = await saving.loginForm();
  const originalSet = saving.store.set.bind(saving.store);
  saving.store.set = (id, data, cb) => data.platformAdmin ? cb(new Error('STORE_FAILURE')) : originalSet(id, data, cb);
  assert.equal((await saving.request('/login', { username: 'operator', password, language: 'en', _csrf: form.csrf })).status, 503);
  assert.equal((await saving.request('')).status, 401);
});

test('database-backed account/IP throttling stops attempts with generic responses', async t => {
  const app = await fixture(t);
  const { csrf } = await app.loginForm();
  for (let attempt = 0; attempt < 10; attempt++) {
    assert.equal((await app.request('/login', { username: 'operator', password: 'too short', language: 'en', _csrf: csrf })).status, 401);
  }
  // Invalid bodies share a bounded invalid-account bucket; no bcrypt work is done.
  const throttled = await app.request('/login', { username: 'operator', password: 'too short', language: 'en', _csrf: csrf });
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers.get('retry-after'), '900');
  assert.match(await throttled.text(), /Unable to sign in/);
  assert.ok(app.state.events.some(event => event.detailCode === 'throttled'));
});

test('password policy rejects bcrypt truncation and hashes with salted cost 12', async () => {
  assert.match(encoded, /^\$2[aby]\$12\$/);
  assert.equal(await passwords.verify(password, encoded), true);
  assert.equal(await passwords.verify('Wrong password 42!', encoded), false);
  await assert.rejects(() => passwords.hash('د'.repeat(40)));
  await assert.rejects(() => passwords.hash('a'.repeat(73)));
  assert.notEqual(await passwords.hash(password), encoded);
});

test('provisioning and access changes audit atomically without plaintext credentials', async () => {
  const events = [], changes = [];
  const repository = { transaction: async work => work({}), ensurePolicy: async () => 1,
    createAccount: async (conn, input) => { assert.match(input.hash, /^\$2/); assert.equal(input.password, undefined); return 1; },
    audit: async event => events.push(event), changeAccess: async (...args) => { changes.push(args); return 1; } };
  const service = provisioningService(repository);
  await service.create({ username: 'Operator', displayName: 'Operator', password });
  await service.change('operator', 'active', false);
  await service.change('operator', 'access', false);
  assert.equal(events.length, 4); assert.equal(changes.length, 2);
  assert.doesNotMatch(JSON.stringify(events), /password|hash|secret|token|Test only/i);
});

test('repository transactions roll back errors and always release the connection', async () => {
  const calls = [];
  const connection = { beginTransaction: async () => calls.push('begin'), commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
  const repository = createRepository({ getConnection: async () => connection });
  await assert.rejects(() => repository.transaction(async () => { throw new Error('failure'); }));
  assert.deepEqual(calls, ['begin', 'rollback', 'release']);
});

test('hidden password prompt emits no entered characters and restores terminal state', async () => {
  const input = new PassThrough(); input.isTTY = true;
  const states = []; input.setRawMode = value => states.push(value);
  let output = ''; const writer = { isTTY: true, write: value => { output += value; } };
  const reading = hiddenQuestion('Password: ', { input, output: writer });
  input.emit('keypress', 'H', { name: 'h' }); input.emit('keypress', 'i', { name: 'i' });
  input.emit('keypress', '\r', { name: 'return' });
  assert.equal(await reading, 'Hi'); assert.equal(output, 'Password: \n'); assert.deepEqual(states, [true, false]);
  await assert.rejects(() => hiddenQuestion('Password:', { input: { isTTY: false }, output: writer }));
});

test('missing configuration and oversized forms produce safe pages', async t => {
  const app = await fixture(t, { environment: {} });
  assert.equal((await app.request('/login')).status, 503);
  const healthy = await fixture(t);
  const response = await healthy.request('/login', { password: 'x'.repeat(9000) });
  assert.equal(response.status, 413);
  assert.doesNotMatch(await response.text(), /stack|password|SELECT/);
});

test('production TLS proxy issues and clears Secure cookies with matching scope', async t => {
  const app = await fixture(t, { environment: { ...environment, NODE_ENV: 'production', ADMIN_TRUST_PROXY: 'loopback' }, requestHeaders: { 'X-Forwarded-Proto': 'https' } });
  const response = await app.login();
  assert.equal(response.status, 303);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  const html = await (await app.request('')).text();
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const logout = await app.request('/logout', { _csrf: csrf });
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get('set-cookie'), /; Secure/);
  assert.match(logout.headers.get('set-cookie'), /Path=\/superadmin/);
});

test('logout failure clears the browser cookie and never claims success', async t => {
  const app = await fixture(t);
  assert.equal((await app.login()).status, 303);
  const html = await (await app.request('')).text();
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  app.store.destroy = (id, cb) => cb(new Error('STORE_UNAVAILABLE'));
  const response = await app.request('/logout', { _csrf: csrf });
  assert.equal(response.status, 503);
  assert.match(response.headers.get('set-cookie'), /zeno_platform_admin=;/);
  assert.equal(app.state.events.some(event => event.event === 'logout' && event.outcome === 'success'), false);
  assert.ok(app.state.events.some(event => event.event === 'logout' && event.outcome === 'denied'));
});

test('invalid proxy configuration leaves only the new application unavailable', async t => {
  const app = await fixture(t, { environment: { ...environment, ADMIN_TRUST_PROXY: 'invalid-proxy-range' } });
  assert.equal((await app.request('/login')).status, 503);
  assert.equal((await fetch(app.origin + '/api/superadmin')).status, 200);
});
