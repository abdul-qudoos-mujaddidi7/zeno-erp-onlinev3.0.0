const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findByAccount } = require('../repositories/account-product-item.repository');

test('product sales queries include only confirmed invoices, matching sales summary totals', async () => {
  let query;
  const executor = {
    async execute(sql, values) {
      query = { sql, values };
      return [[]];
    },
  };
  await findByAccount(executor, {
    orgId: 206,
    itemType: 'sale',
    dateFrom: '2026-07-23',
    dateTo: '2026-08-22',
  });
  assert.match(query.sql, /s\.invoice_status = 'confirmed'/);
  assert.match(query.sql, /s\.status = 1/);
  assert.ok(query.values.includes('2026-07-23'));
  assert.ok(query.values.includes('2026-08-22'));
});

test('purchase queries keep their existing status policy', async () => {
  let sql;
  await findByAccount({ async execute(query) { sql = query; return [[]]; } }, {
    orgId: 206, itemType: 'purchase',
  });
  assert.match(sql, /p\.status = 1/);
  assert.doesNotMatch(sql, /invoice_status = 'confirmed'/);
});

test('product reports select a bounded page before joining display details', async () => {
  let query;
  await findByAccount({ async execute(sql, values) { query = { sql, values }; return [[]]; } }, {
    orgId: 206, itemType: 'sale', productId: 12, accountId: 8, currency: 'USD',
    search: 'name', dateFrom: '2026-01-01', dateTo: '2026-12-31',
  });
  assert.match(query.sql, /INNER JOIN \(\s*SELECT si.org_id, si.local_id/);
  assert.ok(query.sql.indexOf('LIMIT ?') < query.sql.indexOf('LEFT JOIN product_units'));
  assert.match(query.sql, /page_items.org_id = si.org_id AND page_items.local_id = si.local_id/);
  assert.match(query.sql, /si.product_id = \?/);
  assert.deepEqual(query.values, [206, 8, 206, 12, 'USD', '2026-01-01', '2026-12-31', '%name%', '%name%', '%name%', '%name%', '%name%', '0', '16']);
});

test('report histories remain available after row 500', async () => {
  const executor = { async execute(sql, values) {
    assert.equal(values.at(-2), '600');
    assert.equal(values.at(-1), '201');
    const count = Number(values.at(-1));
    return [Array.from({ length: count }, (_, i) => ({ id: count - i, created_at: '2026-01-01' }))];
  } };
  const result = await findByAccount(executor, {
    orgId: 206, itemType: 'sale', pagination: { page: 4, limit: 200, offset: 600 },
  });
  assert.equal(result.data.length, 200);
  assert.equal(result.meta.hasMore, true);
  assert.equal(result.meta.page, 4);
});
