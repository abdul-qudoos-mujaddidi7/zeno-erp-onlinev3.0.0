const test = require('node:test');
const assert = require('node:assert/strict');
const { getOrSet, del } = require('../utils/ttlCache');

test('concurrent getOrSet calls share a single loader run', async () => {
  let runs = 0;
  const loader = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { value: runs };
  };
  const key = 'test:single-flight:shared';

  const results = await Promise.all([
    getOrSet(key, 1000, loader),
    getOrSet(key, 1000, loader),
    getOrSet(key, 1000, loader),
    getOrSet(key, 1000, loader),
    getOrSet(key, 1000, loader),
  ]);

  assert.equal(runs, 1, 'the loader must run exactly once for parallel callers');
  for (const result of results) {
    assert.deepEqual(result, { value: 1 });
  }

  del(key);
});

test('a failed loader is not cached and the next caller retries', async () => {
  let runs = 0;
  const key = 'test:single-flight:failure';
  const failing = async () => {
    runs += 1;
    throw new Error('boom');
  };

  await assert.rejects(getOrSet(key, 1000, failing));
  await assert.rejects(getOrSet(key, 1000, failing));
  assert.equal(runs, 2, 'each failed attempt must be retryable');

  const ok = await getOrSet(key, 1000, async () => 'ok');
  assert.equal(ok, 'ok');

  del(key);
});

test('sequential callers after expiry start a fresh load', async () => {
  const key = 'test:single-flight:expiry';
  let runs = 0;
  const loader = async () => {
    runs += 1;
    return runs;
  };

  assert.equal(await getOrSet(key, 1, loader), 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(await getOrSet(key, 1, loader), 2);
  assert.equal(runs, 2);

  del(key);
});
