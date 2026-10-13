import { afterEach, describe, expect, it, vi } from 'vitest';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('central authentication invalidation', () => {
  it('clears only credentials when the server returns an unauthorized response', async () => {
    const localStorage = createStorage({
      token: 'revoked-token',
      token_expires_at: String(Date.now() + 60_000),
      user_id: '7',
      org_id: '206',
      role_id: '2',
      username: 'tenant-user',
      subscription: '{"id":1}',
      permissions: '[]',
      theme: 'dark',
      cached_business_data: 'preserved',
    });
    const sessionStorage = createStorage();
    const listeners = new Map();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);
    vi.stubGlobal('CustomEvent', class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    });
    vi.stubGlobal('window', {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      dispatchEvent(event) {
        listeners.get(event.type)?.(event);
      },
    });

    const { auth } = await import('./authStore.js');
    const { get } = await import('svelte/store');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => ({
          code: 'INVALID_TOKEN',
          message: 'This session was revoked. Please sign in again.',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { api } = await import('../api/apiClient.js');
    await api.get('/products');
    await expect(api.get('/products')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_TOKEN',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(get(auth).isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('cached_business_data')).toBe('preserved');
    expect(sessionStorage.getItem('auth_notice')).toContain('revoked');
  });

  it('clears authentication and preserves a subscription-specific message on 402', async () => {
    const localStorage = createStorage({
      token: 'subscription-token',
      token_expires_at: String(Date.now() + 60_000),
      org_id: '206',
    });
    const sessionStorage = createStorage();
    const listeners = new Map();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);
    vi.stubGlobal('CustomEvent', class {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    });
    vi.stubGlobal('window', {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      dispatchEvent(event) {
        listeners.get(event.type)?.(event);
      },
    });

    const { auth } = await import('./authStore.js');
    const { get } = await import('svelte/store');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      headers: { get: () => 'application/json' },
      json: async () => ({
        code: 'SUBSCRIPTION_SUSPENDED',
        message: 'This organization has been suspended.',
      }),
    }));

    const { api } = await import('../api/apiClient.js');
    await expect(api.get('/products', { cache: false })).rejects.toMatchObject({
      status: 402,
      code: 'SUBSCRIPTION_SUSPENDED',
    });

    expect(get(auth).isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('auth_notice')).toBe(
      'This organization has been suspended.',
    );
  });
});
