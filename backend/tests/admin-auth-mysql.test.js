const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

test('real MySQL migration, provisioning, sessions, login, revocation, logout and throttling', {
  skip: process.env.ADMIN_TEST_MYSQL !== '1', timeout: 60000,
}, async () => {
  require('dotenv').config({ quiet: true });
  const mysql = require('mysql2/promise');
  const createAdminApp = require('../admin/app');
  const createRepository = require('../admin/repositories/auth');
  const createProvisioning = require('../admin/services/provisioning');
  const database = 'zeno_admin_test_' + randomBytes(8).toString('hex');
  const options = { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectTimeout: 5000 };
  let control, pool, server, created = false;
  try {
    control = await mysql.createConnection(options);
    // Only create/drop the generated test schema; never modify the configured ERP schema.
    await control.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
    created = true;
    await control.query('USE ??', [database]);
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20261012_platform_administrator_auth.sql'), 'utf8');
    for (const statement of sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').split(';').map(value => value.trim()).filter(Boolean)) {
      await control.query(statement);
    }
    await control.query('CREATE TABLE sessions (session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY, expires INT UNSIGNED NOT NULL, data MEDIUMTEXT COLLATE utf8mb4_bin)');
    const [references] = await control.query(`SELECT c.column_type source_type, p.column_type target_type
      FROM information_schema.key_column_usage k
      JOIN information_schema.columns c ON c.table_schema=k.table_schema AND c.table_name=k.table_name AND c.column_name=k.column_name
      JOIN information_schema.columns p ON p.table_schema=k.referenced_table_schema AND p.table_name=k.referenced_table_name AND p.column_name=k.referenced_column_name
      WHERE k.table_schema=? AND k.referenced_table_name IS NOT NULL`, [database]);
    assert.equal(references.length, 4);
    for (const reference of references) assert.equal(reference.source_type, reference.target_type);
    pool = mysql.createPool({ ...options, database, connectionLimit: 6, timezone: 'Z' });
    // Organization fixtures match the verified schema; no ERP data is copied.
    await pool.query(`CREATE TABLE organizations (id INT NOT NULL PRIMARY KEY, name VARCHAR(255) NOT NULL,
      code VARCHAR(100), type VARCHAR(255), inventory_method VARCHAR(255), status TINYINT,
      created_at DATETIME(3), updated_at DATETIME(3))`);
    const organizationRepository = require('../admin/repositories/organizations')(pool);
    for (const table of require('../admin/repositories/organizations').COUNTS) {
      await pool.query(`CREATE TABLE ${table} (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, org_id INT, status TINYINT)`);
      await pool.query(`INSERT INTO ${table} (org_id,status) VALUES (1,1),(1,2),(1,0),(1,NULL),(2,1)`);
    }
    for (let index = 1; index <= 31; index++) {
      await pool.execute('INSERT INTO organizations (id,name,code,type,inventory_method,status) VALUES (?,?,?,?,?,?)',
        [index, index === 1 ? 'Literal 50%_!' : 'Fixture ' + index, 'CODE' + index, index === 2 ? null : 'general', index === 3 ? 'FIFO' : 'CLASSIC', index === 3 ? 0 : 1]);
    }
    const filters = require('../admin/validators/organizations');
    const page = await organizationRepository.list(filters.list.parse({ pageSize: '10', page: '2', dir: 'asc' }));
    assert.equal(page.total, 31); assert.equal(page.rows.length, 10); assert.equal(page.rows[0].id, 11);
    const literal = await organizationRepository.list(filters.list.parse({ q: '50%_!' }));
    assert.equal(literal.total, 1); assert.equal(literal.rows[0].id, 1);
    const filtered = await organizationRepository.list(filters.list.parse({ type: 'general', inventory: 'FIFO', status: '0' }));
    assert.equal(filtered.total, 1); assert.equal(filtered.rows[0].id, 3);
    const absentType = await organizationRepository.list(filters.list.parse({ type: '__none__' }));
    assert.equal(absentType.total, 1);
    const counts = await organizationRepository.counts(1);
    assert.equal(counts.length, 8); assert.ok(counts.every(count => count.total === 2));
    const repository = createRepository(pool);
    await repository.ready();
    const provisioning = createProvisioning(repository);
    const password = randomBytes(24).toString('base64');
    await provisioning.create({ username: 'integration_operator', displayName: 'Integration operator', password });
    // Emulate an existing Step 2 role, then upgrade it twice without duplicates.
    await pool.query("DELETE rp FROM platform_admin_role_permissions rp JOIN platform_admin_permissions p ON p.id=rp.permission_id WHERE p.code IN ('organizations.read','organizations.select')");
    const grantOrganizations = require('../admin/services/organization-policy')(repository);
    await assert.rejects(() => require('../admin/services/organization-policy')({ ...repository, audit: async () => { throw new Error('AUDIT_UNAVAILABLE'); } })());
    const [beforeUpgrade] = await pool.query('SELECT COUNT(*) count FROM platform_admin_role_permissions');
    assert.equal(Number(beforeUpgrade[0].count), 1);
    await grantOrganizations(); await grantOrganizations();
    const [policyRows] = await pool.query('SELECT COUNT(*) count FROM platform_admin_role_permissions');
    assert.equal(Number(policyRows[0].count), 3);
    await assert.rejects(() => provisioning.create({ username: 'integration_operator', displayName: 'Duplicate', password }));
    const [accounts] = await pool.query('SELECT COUNT(*) count FROM platform_admin_accounts');
    assert.equal(Number(accounts[0].count), 1);
    const app = createAdminApp({ pool, environment: { ADMIN_SESSION_SECRET: randomBytes(48).toString('hex'), SESSION_SECRET: 'different-erp-secret', NODE_ENV: 'test' } });
    const express = require('express');
    const parent = express(); parent.use('/superadmin', app);
    server = parent.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}/superadmin`;
    let cookie;
    const request = async (url, body, overrideCookie) => {
      const response = await fetch(origin + url, { redirect: 'manual', method: body ? 'POST' : 'GET',
        headers: { ...(overrideCookie || cookie ? { Cookie: overrideCookie || cookie } : {}), ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        ...(body ? { body: new URLSearchParams(body) } : {}) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    const token = html => html.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
    const login = async () => {
      const html = await (await request('/login')).text();
      return request('/login', { username: 'integration_operator', password, language: 'en', _csrf: token(html) });
    };
    assert.equal((await request('')).status, 401);
    const loginHtml = await (await request('/login')).text();
    const oldCookie = cookie;
    assert.equal((await request('/login', { username: 'integration_operator', password, language: 'en', _csrf: token(loginHtml) })).status, 303);
    assert.notEqual(cookie, oldCookie);
    assert.equal((await request('')).status, 200);
    const directory = await (await request('/organizations')).text();
    assert.match(directory, /Directory of all organizations/);
    assert.equal((await request('/organizations/select', { organizationId: '1', _csrf: token(directory) })).status, 303);
    assert.match(await (await request('')).text(), /<strong>Literal 50%_!<\/strong>/);
    const detail = await (await request('/organizations/1')).text();
    assert.equal((detail.match(/<dd>2<\/dd>/g) || []).length, 8);
    assert.equal((await request('/organizations/select', { organizationId: '999', _csrf: token(detail) })).status, 404);
    assert.equal((await request('/organizations/select', { organizationId: 'all', _csrf: token(detail) })).status, 303);
    await provisioning.change('integration_operator', 'active', false);
    assert.equal((await request('')).status, 401);
    await provisioning.change('integration_operator', 'active', true);
    assert.equal((await request('')).status, 401);
    assert.equal((await login()).status, 303);
    await pool.query('DELETE FROM platform_admin_role_permissions');
    assert.equal((await request('')).status, 403);
    await pool.query(`INSERT INTO platform_admin_role_permissions (role_id,permission_id)
      SELECT r.id,p.id FROM platform_admin_roles r,platform_admin_permissions p WHERE r.code=? AND p.code=?`, ['platform_administrator', 'overview.read']);
    const overview = await (await request('')).text();
    const loggedInCookie = cookie;
    assert.equal((await request('/logout', { _csrf: token(overview) })).status, 303);
    assert.equal((await request('', null, loggedInCookie)).status, 401);
    const key = randomBytes(32).toString('hex');
    const attempts = await Promise.all(Array.from({ length: 12 }, () => repository.consumeLimits([{ key, maximum: 10 }])));
    assert.equal(attempts.filter(Boolean).length, 10);
    await pool.query('UPDATE platform_admin_login_limits SET window_start=DATE_SUB(NOW(3), INTERVAL 16 MINUTE) WHERE bucket_key=?', [key]);
    assert.equal(await repository.consumeLimits([{ key, maximum: 10 }]), true);
    const [events] = await pool.query('SELECT event, origin, detail_code FROM platform_admin_audit');
    for (const expected of ['account.provisioned', 'login.success', 'logout', 'access.changed', 'access.revoked']) assert.ok(events.some(event => event.event === expected));
    // An audit write failure must roll back a newly provisioned account.
    const failing = createProvisioning({ ...repository, audit: async () => { throw new Error('AUDIT_UNAVAILABLE'); } });
    await assert.rejects(() => failing.create({ username: 'rollback_operator', displayName: 'Rollback', password }));
    const [rolledBack] = await pool.query('SELECT COUNT(*) count FROM platform_admin_accounts WHERE username=?', ['rollback_operator']);
    assert.equal(Number(rolledBack[0].count), 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (control) {
      if (created && /^zeno_admin_test_[a-f0-9]{16}$/.test(database) && database !== process.env.DB_NAME) await control.query('DROP DATABASE ??', [database]);
      await control.end();
    }
  }
});
