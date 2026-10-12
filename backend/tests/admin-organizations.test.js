const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
const { randomBytes, createHmac } = require('node:crypto');
const createApp = require('../admin/app');
const createRepository = require('../admin/repositories/organizations');
const validators = require('../admin/validators/organizations');
const upgradePolicy = require('../admin/services/organization-policy');
const labels = { ...require('../admin/services/translations').en, ...require('../admin/services/organization-translations').en };
const createService = require('../admin/services/organizations');
const secret = 'organization-tests-only-independent-secret-'.repeat(2);

async function fixture(t) {
  const state = { permissions: ['overview.read', 'organizations.read', 'organizations.select'], outage: false, events: [],
    rows: Array.from({ length: 41 }, (_, index) => ({ id: index + 1, name: index === 0 ? '<script>Organization</script>' : 'Organization ' + (index + 1), code: 'ORG' + (index + 1), type: index === 1 ? null : 'general', inventory_method: 'CLASSIC', status: index === 2 ? 0 : 1 })) };
  const check = () => { if (state.outage) throw Object.assign(new Error('unavailable'), { code: 'DB_UNAVAILABLE' }); };
  const organizationRepository = {
    async find(id) { check(); return state.rows.find(row => row.id === id) || null; },
    async list(filters) {
      check(); let rows = state.rows.filter(row => (!filters.q || (row.name + row.code).toLowerCase().includes(filters.q.toLowerCase()))
        && (!filters.type || (filters.type === '__none__' ? row.type === null : row.type === filters.type))
        && (filters.status === 'all' || row.status === Number(filters.status))
        && (filters.inventory === 'all' || row.inventory_method === filters.inventory));
      rows.sort((a, b) => (filters.dir === 'asc' ? 1 : -1) * (a.id - b.id));
      const total = rows.length, totalPages = Math.max(1, Math.ceil(total / filters.pageSize)), page = Math.min(filters.page, totalPages);
      return { rows: rows.slice((page - 1) * filters.pageSize, page * filters.pageSize), total, totalPages, page, types: ['general'] };
    },
    async counts() { check(); return ['products', 'sales', 'purchases', 'journals', 'accounts', 'users', 'warehouses', 'activity_logs'].map(category => ({ category, total: 3 })); },
  };
  const authRepository = { ready: async () => {}, audit: async event => state.events.push(event),
    access: async () => ({ id: 1, display_name: 'Operator', is_active: 1, auth_version: 1, permissions: state.permissions }),
    findCredentials: async () => null, consumeLimits: async () => true };
  const store = new session.MemoryStore();
  const parent = express();
  parent.use('/superadmin', createApp({ environment: { ADMIN_SESSION_SECRET: secret, NODE_ENV: 'test' }, sessionStore: store, authRepository, organizationRepository }));
  parent.get('/api/superadmin', (req, res) => res.send('legacy'));
  const server = parent.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const id = 'platform-admin:' + randomBytes(32).toString('hex');
  await new Promise((resolve, reject) => store.set(id, { cookie: { path: '/superadmin', httpOnly: true, expires: new Date(Date.now() + 3600000) }, platformAdmin: { id: 1, authVersion: 1 } }, error => error ? reject(error) : resolve()));
  const signature = createHmac('sha256', secret).update(id).digest('base64').replace(/=+$/, '');
  const cookie = 'zeno_platform_admin=' + encodeURIComponent('s:' + id + '.' + signature);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, anonymous = false) => fetch(origin + '/superadmin' + url, { redirect: 'manual', method: body ? 'POST' : 'GET',
    headers: { Cookie: anonymous ? 'erp_session=erp-session' : cookie, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, ...(body ? { body: new URLSearchParams(body) } : {}) });
  const csrf = async () => (await (await request('/organizations')).text()).match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  return { state, request, csrf, store, origin };
}

test('organization routes require current read/select permissions, not ERP sessions', async t => {
  const app = await fixture(t);
  assert.equal((await app.request('/organizations', null, true)).status, 401);
  assert.equal((await app.request('/organizations/1', null, true)).status, 401);
  app.state.permissions = ['overview.read'];
  assert.equal((await app.request('/organizations')).status, 403);
  assert.equal((await app.request('/organizations/1')).status, 403);
  app.state.permissions = ['organizations.read'];
  assert.equal((await app.request('')).status, 403);
  assert.equal((await app.request('/organizations')).status, 200);
  const token = await app.csrf();
  assert.equal((await app.request('/organizations/select', { organizationId: '1', _csrf: token })).status, 403);
  app.state.permissions = ['organizations.select'];
  assert.equal((await app.request('/organizations/select', { organizationId: '1', _csrf: token })).status, 403);
  assert.equal((await fetch(app.origin + '/api/superadmin')).status, 200);
});

test('directory renders escaped values, filters and bounded pagination', async t => {
  const app = await fixture(t);
  let response = await app.request('/organizations?pageSize=10&page=1&sort=id&dir=asc');
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.match(html, /&lt;script&gt;Organization&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>Organization/);
  assert.equal((html.match(/class="organization-code"/g) || []).length, 10);
  assert.match(html, /page(?:=|&#x3D;)2/);
  response = await app.request('/organizations?q=ORG2&type=general&status=1&inventory=CLASSIC&pageSize=10&dir=asc');
  html = await response.text(); assert.match(html, /ORG20/); assert.doesNotMatch(html, /ORG1<\/span>/);
  response = await app.request('/organizations?status=0');
  html = await response.text(); assert.match(html, /ORG3/); assert.doesNotMatch(html, /ORG4<\/span>/);
  response = await app.request('/organizations?type=__none__');
  html = await response.text(); assert.match(html, /ORG2/);
  response = await app.request('/organizations?page=999999&pageSize=10');
  assert.match(await response.text(), /Page 5 \/ 5/);
  response = await app.request('/organizations?q=does-not-exist');
  assert.match(await response.text(), /No organizations match/);
});

test('all modes and selected context change only through validated CSRF POST', async t => {
  const app = await fixture(t), token = await app.csrf();
  assert.match(await (await app.request('')).text(), /All organizations/);
  assert.equal((await app.request('/organizations/select', { organizationId: '1' })).status, 403);
  assert.equal((await app.request('/organizations/select')).status, 400);
  assert.equal((await app.request('/organizations/select', { organizationId: '1', _csrf: token })).status, 303);
  let html = await (await app.request('')).text();
  assert.match(html, /<strong>&lt;script&gt;Organization&lt;\/script&gt;<\/strong>/);
  const response = await app.request('/organizations/select', { organizationId: '999', _csrf: token });
  assert.equal(response.status, 404);
  html = await (await app.request('/organizations')).text();
  assert.match(html, /Directory of all organizations/);
  assert.equal((await app.request('/organizations/select', { organizationId: 'all', _csrf: token })).status, 303);
  assert.match(await (await app.request('')).text(), /No organization is selected/);
  assert.ok(app.state.events.some(event => event.event === 'organization.selected'));
});

test('invalid IDs, sort injection and unbounded/duplicate filters are rejected', async t => {
  const app = await fixture(t), token = await app.csrf();
  for (const value of ['0', '-1', '01', '1e2', '2147483648', '1 OR 1=1', '1.5']) {
    assert.equal((await app.request('/organizations/' + encodeURIComponent(value))).status, 400);
    assert.equal((await app.request('/organizations/select', { organizationId: value, _csrf: token })).status, 400);
  }
  assert.equal((await app.request('/organizations/999')).status, 404);
  for (const query of ['sort=password_hash', 'sort=name%3BDROP+TABLE+users', 'pageSize=10000', 'page=0', 'page=-1', 'q=' + 'x'.repeat(121), 'status=2', 'q=a&q=b', 'unknown=1']) {
    assert.equal((await app.request('/organizations?' + query)).status, 400, query);
  }
});

test('detail counts are labeled and English/Dari/Pashto use correct direction', async t => {
  const app = await fixture(t);
  for (const [lang, htmlLang, direction] of [['en', 'en', 'ltr'], ['fa', 'fa-AF', 'rtl'], ['ps', 'ps-AF', 'rtl']]) {
    const response = await app.request('/organizations/1?lang=' + lang);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, new RegExp(`lang="${htmlLang}" dir="${direction}"`));
    assert.equal((html.match(/<dd>3<\/dd>/g) || []).length, 8);
    assert.doesNotMatch(html, /password_hash|auth_tokens|session_id/);
  }
});

test('database errors fail closed, missing selections reset and permissions revoke immediately', async t => {
  const app = await fixture(t), token = await app.csrf();
  app.state.outage = true;
  for (const url of ['/organizations', '/organizations/1']) assert.equal((await app.request(url)).status, 503);
  assert.equal((await app.request('/organizations/select', { organizationId: '1', _csrf: token })).status, 503);
  app.state.outage = false;
  assert.equal((await app.request('/organizations/select', { organizationId: '1', _csrf: token })).status, 303);
  app.state.outage = true; assert.equal((await app.request('')).status, 503);
  app.state.outage = false; app.state.rows = app.state.rows.filter(row => row.id !== 1);
  assert.match(await (await app.request('')).text(), /no longer available/);
  app.state.permissions = ['overview.read']; assert.equal((await app.request('/organizations')).status, 403);
});

test('repository uses explicit columns, escaped literal LIKE, fixed sort and parameterized limits', async () => {
  const calls = [];
  const repository = createRepository({ execute: async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.includes('COUNT(*) AS total FROM organizations')) return [[{ total: 51 }]];
    if (sql.startsWith('SELECT DISTINCT')) return [[{ type: 'general' }]];
    return [[]];
  } });
  await repository.list(validators.list.parse({ q: "50%_!'", status: '0', type: 'general', inventory: 'FIFO', sort: 'name', dir: 'asc', pageSize: '25', page: '3' }));
  const listing = calls.find(call => call.sql.includes('LIMIT ? OFFSET ?'));
  assert.match(listing.sql, /ORDER BY o.name ASC, o.id ASC LIMIT \? OFFSET \?/);
  assert.doesNotMatch(listing.sql, /SELECT \*|50%/);
  assert.equal(listing.values[0], "%50!%!_!!'%");
  assert.deepEqual(listing.values.slice(-2), [25, 50]);
  calls.length = 0; await repository.counts(2);
  assert.equal(calls[0].values.length, 8); assert.ok(calls[0].values.every(value => value === 2));
  assert.equal((calls[0].sql.match(/org_id = \? AND status <> 0/g) || []).length, 8);
  assert.doesNotMatch(calls[0].sql, /password|token|session|INSERT|UPDATE|DELETE/);
});

test('policy upgrade requires transaction and audit; unknown selections never reach save', async () => {
  const operations = [];
  await upgradePolicy({ transaction: async work => work({}), grantOrganizationPolicy: async () => operations.push('grant'), audit: async event => operations.push(event.event) })();
  assert.deepEqual(operations, ['grant', 'access.policy_changed']);
  const service = createService({ find: async () => null });
  await assert.rejects(() => service.select({ organizationId: '99', _csrf: 'a'.repeat(64) }), error => error.status === 404);
});
