/*
 * apiClient request sharing.
 *
 * A single page render asks for the same configuration from several
 * components at once (settings, account types, currencies and product units
 * are each read by a handful of them), and every one of those reads used to be
 * its own round trip as soon as a token existed. These tests lock down what a
 * signed-in tab does instead:
 *
 *   1. Identical requests in flight together share one fetch, always.
 *   2. Configuration reads are reused for a short window.
 *   3. Business data is never reused, so a saved row cannot be read back stale.
 *   4. That window ends, and any write clears the cache outright.
 *   5. `cache: false` opts a caller out of sharing entirely.
 *   6. Paginated reads keep their own behaviour and are never shared.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { api, invalidateApiCache } from './apiClient.js';

const storage = new Map();

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function signedIn() {
  storage.set('token', 'test-token');
}

function signedOut() {
  storage.delete('token');
}

function deferredFetch() {
  const releases = [];
  const mock = vi.fn(
    () =>
      new Promise((resolve) => {
        releases.push(() => resolve(jsonResponse({ data: [] })));
      }),
  );
  return { mock, release: () => releases.forEach((release) => release()) };
}

beforeEach(() => {
  invalidateApiCache();
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  invalidateApiCache();
  signedOut();
});

describe('a signed-in tab shares its reads', () => {
  it('runs one fetch for callers that ask at the same time', async () => {
    signedIn();

    const { mock, release } = deferredFetch();
    globalThis.fetch = mock;

    const first = api.get('/api/v2/settings?status=1');
    const second = api.get('/api/v2/settings?status=1');
    release();

    expect(await first).toEqual({ data: [] });
    expect(await second).toEqual({ data: [] });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent business data without reusing it afterwards', async () => {
    signedIn();

    const { mock, release } = deferredFetch();
    globalThis.fetch = mock;

    const first = api.get('/api/v2/products?status=1');
    const second = api.get('/api/v2/products?status=1');
    release();

    expect(await first).toEqual({ data: [] });
    expect(await second).toEqual({ data: [] });
    expect(mock).toHaveBeenCalledTimes(1);

    /* Asked again once it has arrived, the list is fetched again. */
    globalThis.fetch = vi.fn(async () => jsonResponse({ data: ['fresh'] }));
    expect(await api.get('/api/v2/products?status=1')).toEqual({
      data: ['fresh'],
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('reuses a configuration answer for a moment after it arrives', async () => {
    signedIn();

    const mock = vi.fn(async () => jsonResponse({ data: ['config'] }));
    globalThis.fetch = mock;

    await api.get('/api/v2/settings?status=1');
    await api.get('/api/v2/settings?status=1');

    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('stops reusing it once the window passes', async () => {
    signedIn();

    const mock = vi.fn(async () => jsonResponse({ data: [] }));
    globalThis.fetch = mock;

    await api.get('/api/v2/currencies?status=1');

    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start + 60_000);

    await api.get('/api/v2/currencies?status=1');

    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('never serves a cached row after a write', async () => {
    signedIn();

    const mock = vi.fn(async (url, options) =>
      jsonResponse(
        options && options.method === 'POST'
          ? { saved: true }
          : { data: ['from-server'] },
      ),
    );
    globalThis.fetch = mock;

    await api.get('/api/v2/settings?status=1');
    await api.post('/api/v2/settings', { value: '1' });
    const afterWrite = await api.get('/api/v2/settings?status=1');

    expect(afterWrite).toEqual({ data: ['from-server'] });
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it('leaves a caller that opts out of caching alone', async () => {
    signedIn();

    const mock = vi.fn(async () => jsonResponse({ data: [] }));
    globalThis.fetch = mock;

    await api.get('/api/v2/accounts/balances?status=1', { cache: false });
    await api.get('/api/v2/accounts/balances?status=1', { cache: false });

    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not share paginated reads', async () => {
    signedIn();

    const { mock, release } = deferredFetch();
    globalThis.fetch = mock;

    const first = api.get('/api/v2/journals?status=1&page=1&limit=15');
    const second = api.get('/api/v2/journals?status=1&page=1&limit=15');
    release();

    await first;
    await second;

    expect(mock).toHaveBeenCalledTimes(2);
  });
});
