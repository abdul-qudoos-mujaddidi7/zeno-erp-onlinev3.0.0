import { beforeEach, describe, expect, it } from 'vitest';

import {
  SESSION_EXPIRY_KEY,
  SESSION_TTL_MS,
  clearSessionStorage,
  hasValidSession,
  isSessionExpired,
  readSessionExpiry,
  sessionExpiryFromLogin,
  sessionRemainingMs,
  writeSessionExpiry,
} from './session.js';

/* A stand-in for localStorage, so no jsdom is needed. */
function fakeStorage(initial = {}) {
  const store = { ...initial };

  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    keys: () => Object.keys(store),
  };
}

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-09-29T10:00:00.000Z');

describe('sessionExpiryFromLogin', () => {
  it('counts the expires_in seconds the login response carries', () => {
    expect(sessionExpiryFromLogin({ expires_in: 86_400 }, NOW)).toBe(NOW + 24 * HOUR);
  });

  it('accepts an absolute expires_at from any other caller', () => {
    expect(sessionExpiryFromLogin({ expires_at: '2026-09-30T10:00:00.000Z' }, NOW)).toBe(NOW + 24 * HOUR);
  });

  it('falls back to the full day when the response says nothing', () => {
    expect(sessionExpiryFromLogin({}, NOW)).toBe(NOW + SESSION_TTL_MS);
    expect(sessionExpiryFromLogin(null, NOW)).toBe(NOW + SESSION_TTL_MS);
  });
});

describe('isSessionExpired', () => {
  it('is false right up to the deadline and true at it', () => {
    expect(isSessionExpired(NOW + HOUR, NOW)).toBe(false);
    expect(isSessionExpired(NOW + 1, NOW)).toBe(false);
    expect(isSessionExpired(NOW, NOW)).toBe(true);
    expect(isSessionExpired(NOW - 1, NOW)).toBe(true);
  });

  it('treats an unknown deadline as expired, never as valid', () => {
    expect(isSessionExpired(null, NOW)).toBe(true);
    expect(isSessionExpired(undefined, NOW)).toBe(true);
    expect(isSessionExpired('nonsense', NOW)).toBe(true);
    expect(isSessionExpired(NaN, NOW)).toBe(true);
  });
});

describe('sessionRemainingMs', () => {
  it('never answers a negative time left', () => {
    expect(sessionRemainingMs(NOW + 90 * 60_000, NOW)).toBe(90 * 60_000);
    expect(sessionRemainingMs(NOW - 5 * HOUR, NOW)).toBe(0);
    expect(sessionRemainingMs(null, NOW)).toBe(0);
  });
});

describe('the deadline kept in storage', () => {
  let storage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it('round-trips through the store', () => {
    writeSessionExpiry(NOW + 3 * HOUR, storage);

    expect(storage.getItem(SESSION_EXPIRY_KEY)).toBe(String(NOW + 3 * HOUR));
    expect(readSessionExpiry(storage)).toBe(NOW + 3 * HOUR);
  });

  it('reports nothing when the value is missing or unusable', () => {
    expect(readSessionExpiry(storage)).toBe(null);

    storage.setItem(SESSION_EXPIRY_KEY, 'not-a-number');
    expect(readSessionExpiry(storage)).toBe(null);

    storage.setItem(SESSION_EXPIRY_KEY, '');
    expect(readSessionExpiry(storage)).toBe(null);
  });

  it('and a write of junk clears the entry instead of storing NaN', () => {
    writeSessionExpiry(NOW + HOUR, storage);
    writeSessionExpiry('nonsense', storage);

    expect(storage.getItem(SESSION_EXPIRY_KEY)).toBe(null);
  });
});

describe('hasValidSession', () => {
  it('needs both a token and a deadline still in the future', () => {
    const storage = fakeStorage({ token: 'abc', [SESSION_EXPIRY_KEY]: String(NOW + HOUR) });

    expect(hasValidSession(storage, NOW)).toBe(true);
  });

  it('is false once the 24 hours are up, even though the token is still stored', () => {
    const storage = fakeStorage({ token: 'abc', [SESSION_EXPIRY_KEY]: String(NOW - 1) });

    expect(hasValidSession(storage, NOW)).toBe(false);
  });

  it('is false for a token with no recorded deadline', () => {
    const storage = fakeStorage({ token: 'abc' });

    expect(hasValidSession(storage, NOW)).toBe(false);
  });

  it('is false without a token', () => {
    const storage = fakeStorage({ [SESSION_EXPIRY_KEY]: String(NOW + HOUR) });

    expect(hasValidSession(storage, NOW)).toBe(false);
  });

  it('is false when there is no storage at all', () => {
    expect(hasValidSession({ getItem: () => null }, NOW)).toBe(false);
  });
});

describe('clearSessionStorage', () => {
  it('removes the session but keeps the operator settings', () => {
    const storage = fakeStorage({
      token: 'abc',
      [SESSION_EXPIRY_KEY]: String(NOW + HOUR),
      user_id: '1774267253790002',
      org_id: '21',
      role_id: '1',
      username: 'hewad',
      subscription: '{"id":1}',
      permissions: '[]',
      lang: 'fa',
      theme: 'light',
      org_type: 'general',
    });

    clearSessionStorage(storage);

    expect(storage.keys().sort()).toEqual(['lang', 'org_type', 'theme']);
  });
});

describe('the 24-hour rule end to end', () => {
  it('a session recorded at login is valid for 24 hours and not a minute longer', () => {
    const storage = fakeStorage();
    const expiry = sessionExpiryFromLogin({ expires_in: 86_400 }, NOW);

    storage.setItem('token', 'abc');
    writeSessionExpiry(expiry, storage);

    expect(hasValidSession(storage, NOW)).toBe(true);
    expect(hasValidSession(storage, NOW + 23 * HOUR)).toBe(true);
    expect(hasValidSession(storage, NOW + 24 * HOUR - 1)).toBe(true);
    expect(hasValidSession(storage, NOW + 24 * HOUR)).toBe(false);
    expect(hasValidSession(storage, NOW + 25 * HOUR)).toBe(false);
  });
});
