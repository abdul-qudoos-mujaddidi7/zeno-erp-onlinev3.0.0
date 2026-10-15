/*
 * warehouseProductApi.getAll query construction.
 *
 * The endpoint paginates only when a caller asks it to: the ~20 lookups that
 * need a product's stock (POS, sale and purchase forms, BOM, production,
 * prescriptions, inventory records, stock adjustments) call it with no page at
 * all and must keep receiving every row. These tests lock down that contract, in
 * particular that a caller which sends no page still sends no `page`/`limit`
 * parameters - `appendPaginationParams` defaults to page 1 / limit 15, so
 * calling it unconditionally would silently truncate those lists to 15 rows.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { api, invalidateApiCache } from './apiClient.js';
import { warehouseProductApi } from './warehouseProductApi.js';

const storage = new Map();

function signedIn() {
  storage.set('token', 'test-token');
}

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/* Capture the URL the client actually requests. */
function captureFetch() {
  const urls = [];
  globalThis.fetch = vi.fn(async (url) => {
    urls.push(String(url));
    return jsonResponse({ success: true, data: [] });
  });
  return urls;
}

beforeEach(() => {
  invalidateApiCache();
  storage.clear();
  signedIn();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  invalidateApiCache();
  storage.delete('token');
});

describe('warehouse-product reads stay unpaginated unless a page is asked for', () => {
  it('sends no page or limit for the form lookups', async () => {
    const urls = captureFetch();

    await warehouseProductApi.getAll({ status: 1 });

    const [url] = urls;

    expect(url).toContain('/api/v2/warehouse-products?');
    expect(url).toContain('status=1');
    expect(url).not.toContain('page=');
    expect(url).not.toContain('limit=');
  });

  it('keeps the warehouse and product filters it always had', async () => {
    const urls = captureFetch();

    await warehouseProductApi.getAll({ status: 1, warehouse_id: 13, product_id: 1045 });

    const [url] = urls;

    expect(url).toContain('warehouse_id=13');
    expect(url).toContain('product_id=1045');
    expect(url).not.toContain('page=');
  });

  it('adds page and limit when a caller asks for one page', async () => {
    const urls = captureFetch();

    await warehouseProductApi.getAll({ status: 1, warehouse_id: 13, page: 2, limit: 25 });

    const [url] = urls;

    expect(url).toContain('page=2');
    expect(url).toContain('limit=25');
    expect(url).toContain('warehouse_id=13');
  });

  it('defaults the page number when only a limit is given', async () => {
    const urls = captureFetch();

    await warehouseProductApi.getAll({ status: 1, limit: 50 });

    const [url] = urls;

    expect(url).toContain('page=1');
    expect(url).toContain('limit=50');
  });

  it('keeps status defaulting to 1', async () => {
    const urls = captureFetch();

    await warehouseProductApi.getAll();

    expect(urls[0]).toContain('status=1');
    expect(urls[0]).not.toContain('page=');
  });

  it('reads a page body with meta through the shared response shape', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        success: true,
        data: [{ id: 1, product_id: 7 }],
        meta: { total: 1414, page: 1, limit: 15, totalPages: 95 },
      }),
    );

    const response = await warehouseProductApi.getAll({ status: 1, page: 1, limit: 15 });

    expect(response.data).toHaveLength(1);
    expect(response.meta.total).toBe(1414);
    expect(response.meta.totalPages).toBe(95);
  });
});
