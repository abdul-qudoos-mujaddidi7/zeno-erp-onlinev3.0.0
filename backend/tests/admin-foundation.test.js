const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { createHmac, randomBytes } = require('node:crypto');
const createAdminApp = require('../admin/app');
const createSessionStore = require('../admin/repositories/session-store');

const secret = 'test-only-platform-secret-'.repeat(3);
const environment = { ADMIN_SESSION_SECRET: secret, SESSION_SECRET: 'different-erp-secret', NODE_ENV: 'test' };

async function fixture(t, options = {}) {
  const store = new session.MemoryStore();
  const accounts = new Map();
  const authRepository = {
    ready: async () => {}, audit: async () => {}, consumeLimits: async () => true,
    findCredentials: async () => null,
    access: async id => accounts.get(id) || null,
  };
  const parent = express();
  parent.use('/superadmin', createAdminApp({ environment, sessionStore: store, authRepository, ...options }));
  // Detect accidental fallthrough into old application/session handlers.
  parent.use((req, res) => res.send('legacy application reached'));
  const server = parent.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function seed(data, id = 'platform-admin:' + randomBytes(32).toString('hex')) {
    if (data.platformAdmin) {
      accounts.set(data.platformAdmin.id, { id: data.platformAdmin.id, display_name: data.platformAdmin.displayName,
        is_active: 1, auth_version: 1, permissions: data.platformAdmin.permissions });
      data = { ...data, platformAdmin: { id: data.platformAdmin.id, authVersion: 1 } };
    }
    await new Promise((resolve, reject) => store.set(id, {
      cookie: { originalMaxAge: 14400000, expires: new Date(Date.now() + 14400000),
        httpOnly: true, sameSite: 'strict', secure: false, path: '/superadmin' },
      ...data,
    }, (error) => error ? reject(error) : resolve()));
    const signature = createHmac('sha256', secret).update(id).digest('base64').replace(/=+$/, '');
    return `zeno_platform_admin=${encodeURIComponent('s:' + id + '.' + signature)}`;
  }
  return { origin, seed, store };
}

test('anonymous and ERP identities cannot access new pages or fall through', async (t) => {
  const { origin, seed } = await fixture(t);
  for (const path of ['/superadmin', '/superadmin/unknown']) {
    const response = await fetch(origin + path, { headers: { Cookie: 'erp_session=existing-erp-cookie', Authorization: 'Bearer erp-token' } });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.match(await response.text(), /Administrator access required/);
  }
  const cookie = await seed({ user: { username: 'superadmin' } });
  assert.equal((await fetch(origin + '/superadmin', { headers: { Cookie: cookie } })).status, 401);
  assert.equal(await (await fetch(origin + '/api/superadmin')).text(), 'legacy application reached');
});

test('missing, short, or reused ERP signing secrets fail closed', async (t) => {
  for (const env of [{}, { ADMIN_SESSION_SECRET: 'short' }, { ADMIN_SESSION_SECRET: secret, SESSION_SECRET: secret }]) {
    const { origin } = await fixture(t, { environment: env });
    const response = await fetch(origin + '/superadmin');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('set-cookie'), null);
  }
});

test('legacy session IDs, tampered cookies and absent permissions are denied', async (t) => {
  const { origin, seed } = await fixture(t);
  const identity = { id: 1, displayName: 'Administrator', permissions: ['overview.read'] };
  const legacy = await seed({ platformAdmin: identity }, 'ordinary-erp-session-id');
  assert.equal((await fetch(origin + '/superadmin', { headers: { Cookie: legacy } })).status, 401);
  const valid = await seed({ platformAdmin: identity });
  assert.equal((await fetch(origin + '/superadmin', { headers: { Cookie: valid + 'tampered' } })).status, 401);
  const denied = await seed({ platformAdmin: { ...identity, permissions: [] } });
  assert.equal((await fetch(origin + '/superadmin', { headers: { Cookie: denied } })).status, 403);
});

test('protected shell renders escaped identity, strict headers and dedicated cookie', async (t) => {
  const { origin, seed } = await fixture(t);
  const cookie = await seed({ platformAdmin: { id: 1, displayName: '<script>alert(1)</script>', permissions: ['overview.read'] } });
  const response = await fetch(origin + '/superadmin', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your platform workspace/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /id="admin-sidebar"/);
  assert.match(response.headers.get('set-cookie'), /zeno_platform_admin=/);
  assert.match(response.headers.get('set-cookie'), /Path=\/superadmin/);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  assert.doesNotMatch(response.headers.get('set-cookie'), /erp_session=/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('language preferences require CSRF and allowlisted values', async (t) => {
  const { origin, seed } = await fixture(t);
  const cookie = await seed({ platformAdmin: { id: 1, displayName: 'Administrator', permissions: ['overview.read'] } });
  const html = await (await fetch(origin + '/superadmin', { headers: { Cookie: cookie } })).text();
  const csrf = html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  const post = (body) => fetch(origin + '/superadmin/preferences/language', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body), redirect: 'manual',
  });
  assert.equal((await post({ language: 'fa' })).status, 403);
  assert.equal((await post({ language: 'fa', _csrf: 'a'.repeat(64) })).status, 403);
  assert.equal((await post({ language: 'fa', _csrf: 'د'.repeat(64) })).status, 403);
  assert.equal((await post({ language: 'unsafe', _csrf: csrf })).status, 400);
  assert.equal((await post({ language: 'fa', _csrf: csrf, role: 'superadmin' })).status, 400);
  const response = await post({ language: 'fa', _csrf: csrf });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/superadmin');
  const translated = await (await fetch(origin + '/superadmin', { headers: { Cookie: cookie } })).text();
  assert.match(translated, /lang="fa-AF" dir="rtl"/);
  assert.match(translated, /mdb.rtl.min.css/);
});

test('English, Dari and Pashto render on denied pages with safe query validation', async (t) => {
  const { origin } = await fixture(t);
  for (const [code, lang, direction] of [['en', 'en', 'ltr'], ['fa', 'fa-AF', 'rtl'], ['ps', 'ps-AF', 'rtl']]) {
    const response = await fetch(origin + '/superadmin?lang=' + code);
    assert.equal(response.status, 401);
    assert.match(await response.text(), new RegExp(`lang="${lang}" dir="${direction}"`));
  }
  const injected = await (await fetch(origin + '/superadmin?lang=%3Cscript%3E')).text();
  assert.match(injected, /lang="en" dir="ltr"/);
  assert.doesNotMatch(injected, /<script>/);
});

test('assets are public but expose only static files, not templates or modules', async (t) => {
  const { origin } = await fixture(t);
  const response = await fetch(origin + '/superadmin/assets/css/admin.css');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /#1e6ca5/);
  assert.equal((await fetch(origin + '/superadmin/assets/app.js')).status, 404);
});

test('session repository reuses supplied pool without schema creation or ownership', async () => {
  const fakePool = { query: () => Promise.resolve([[], []]) };
  const store = createSessionStore(fakePool);
  await store.onReady();
  assert.equal(store.connection, fakePool);
  assert.equal(store.options.createDatabaseTable, false);
  assert.equal(store.options.clearExpired, false);
  assert.equal(store.options.endConnectionOnClose, false);
});
