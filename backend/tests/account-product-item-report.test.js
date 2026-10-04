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
