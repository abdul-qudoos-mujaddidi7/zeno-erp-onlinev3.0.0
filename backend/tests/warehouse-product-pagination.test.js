const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../repositories/warehouse-product.repository');

const {
  warehouseProductListQuerySchema,
} = require('../validators/warehouse-product.validator');

const {
  MAX_LIMIT,
  resolvePagination,
} = require('../utils/pagination');

/*
 * Minimal stand-in for the mysql2 pool: records the statements the repository
 * runs and answers the COUNT the paginated path issues.
 */
function fakeExecutor({ total = 42 } = {}) {
  const calls = [];

  return {
    calls,
    async execute(sql, params = []) {
      calls.push({
        sql: sql.replace(/\s+/g, ' ').trim(),
        params,
      });

      if (/COUNT\(\*\)/i.test(sql)) {
        return [[{ total }]];
      }

      return [[{ local_id: 1, product_id: 7 }, { local_id: 2, product_id: 9 }]];
    },
  };
}

test('without a page the warehouse-product read is unchanged and unbounded', async () => {
  const executor = fakeExecutor();

  const result = await repository.findAll(executor, {
    orgId: 163,
    status: 1,
    warehouseId: 3,
  });

  assert.equal(executor.calls.length, 1);
  const { sql, params } = executor.calls[0];

  assert.match(sql, /FROM warehouse_products/);
  assert.match(sql, /WHERE org_id = \? AND status = \? AND warehouse_id = \?/);
  assert.match(sql, /ORDER BY warehouse_id ASC, product_id ASC/);
  assert.doesNotMatch(sql, /LIMIT/);
  assert.deepEqual(params, [163, 1, 3]);

  assert.deepEqual(result.data, [{ local_id: 1, product_id: 7 }, { local_id: 2, product_id: 9 }]);
  assert.equal(result.meta, null);
});

test('a requested page adds LIMIT/OFFSET and a meta block', async () => {
  const executor = fakeExecutor({ total: 42 });

  const result = await repository.findAll(executor, {
    orgId: 163,
    status: 1,
    warehouseId: 3,
    pagination: { page: 2, limit: 15, offset: 15 },
  });

  assert.equal(executor.calls.length, 2);

  const [count, page] = executor.calls;

  assert.match(count.sql, /^SELECT COUNT\(\*\) AS total FROM warehouse_products/);
  assert.deepEqual(count.params, [163, 1, 3]);

  assert.match(page.sql, /ORDER BY warehouse_id ASC, product_id ASC/);
  assert.match(page.sql, /LIMIT \? OFFSET \?/);
  /* LIMIT/OFFSET travel as strings; see the note in utils/pagination.js. */
  assert.deepEqual(page.params, [163, 1, 3, '15', '15']);

  assert.equal(result.data.length, 2);
  assert.deepEqual(result.meta, {
    total: 42,
    page: 2,
    limit: 15,
    totalPages: 3,
  });
});

test('every existing caller keeps its filters and order', async () => {
  const unbounded = fakeExecutor();
  const filtered = fakeExecutor();

  await repository.findAll(unbounded, { orgId: 5, status: 0 });
  await repository.findAll(filtered, { orgId: 5, status: 1, productId: 11 });

  assert.match(unbounded.calls[0].sql, /WHERE org_id = \? AND status = \? ORDER BY warehouse_id ASC, product_id ASC$/);
  assert.deepEqual(unbounded.calls[0].params, [5, 0]);

  assert.match(filtered.calls[0].sql, /AND product_id = \?/);
  assert.deepEqual(filtered.calls[0].params, [5, 1, 11]);
});

test('the query schema accepts an optional page and keeps status defaulting to 1', () => {
  const plain = warehouseProductListQuerySchema.parse({});

  assert.equal(plain.status, 1);
  assert.equal(plain.page, undefined);
  assert.equal(resolvePagination(plain), null);

  const paged = warehouseProductListQuerySchema.parse({ page: '3', limit: '25' });

  assert.equal(paged.status, 1);
  assert.deepEqual(resolvePagination(paged), { page: 3, limit: 25, offset: 50 });
});

test('the query schema rejects a page that cannot be served', () => {
  assert.equal(warehouseProductListQuerySchema.safeParse({ page: '0' }).success, false);
  assert.equal(warehouseProductListQuerySchema.safeParse({ page: '-1' }).success, false);
  assert.equal(
    warehouseProductListQuerySchema.safeParse({ limit: String(MAX_LIMIT + 1) }).success,
    false,
  );
});
