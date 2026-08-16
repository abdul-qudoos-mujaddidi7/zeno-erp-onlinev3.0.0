/**
 * Tiny in-memory TTL cache for expensive org-scoped aggregates.
 * Not durable across processes — fine for cutting repeat journal scans.
 */

const store = new Map();

function makeKey(parts = []) {
  return parts.map((part) => String(part ?? '')).join('|');
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  return entry.value;
}

function set(key, value, ttlMs = 45000) {
  store.set(key, {
    value,
    expiresAt: Date.now() + Number(ttlMs || 45000),
  });
  return value;
}

function del(key) {
  store.delete(key);
}

function invalidatePrefix(prefix) {
  const needle = String(prefix);
  for (const key of store.keys()) {
    if (key.startsWith(needle)) {
      store.delete(key);
    }
  }
}

async function getOrSet(key, ttlMs, loader) {
  const cached = get(key);
  if (cached !== undefined) {
    return cached;
  }

  const value = await loader();
  return set(key, value, ttlMs);
}

module.exports = {
  makeKey,
  get,
  set,
  del,
  invalidatePrefix,
  getOrSet,
};
