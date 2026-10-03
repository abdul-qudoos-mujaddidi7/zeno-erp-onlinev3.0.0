/**
 * Tiny in-memory TTL cache for expensive org-scoped aggregates.
 * Not durable across processes — fine for cutting repeat journal scans.
 */

const store = new Map();

/*
 * Loader promises that are currently running, keyed by cache key. While one
 * request is rebuilding an aggregate, every other request for the same key
 * awaits the SAME promise instead of starting its own duplicate scan.
 */
const inflight = new Map();

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

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const value = await loader();
      set(key, value, ttlMs);
      return value;
    } finally {
      /*
       * Always clear the in-flight entry — on success the value now lives in
       * the store; on failure nothing was cached, so the next caller retries
       * the load instead of awaiting a promise that already settled.
       */
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

module.exports = {
  makeKey,
  get,
  set,
  del,
  invalidatePrefix,
  getOrSet,
};
