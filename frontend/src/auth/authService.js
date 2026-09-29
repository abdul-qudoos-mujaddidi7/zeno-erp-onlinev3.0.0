import { auth } from './authStore';
import { API_URL } from '../config';
import { setTranslateOrgType, setSettingsAll } from '../i18n/i18n';
import { parsePermissions, writeStoredPermissions } from './permissions.js';
import { clearSessionStorage, sessionExpiryFromLogin, writeSessionExpiry } from '../utils/session.js';

const API = API_URL + '/api';

/*
 * Delete the session on the server as well.
 *
 * The browser has already thrown its own token away by the time this runs, so
 * the operator is signed out whatever happens here: this call is what stops a
 * copy of the token that leaked into a cache, a log or another device from
 * being usable for the rest of its 24 hours.
 *
 * It is bounded by a timeout because it sits on the way to the login page — an
 * unreachable server must not leave the dashboard on screen.
 */
async function deleteServerSession(token, timeoutMs = 2000) {
  if (!token) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (error) {
    /* Offline, or no answer in time: the local logout stands. */
  } finally {
    clearTimeout(timer);
  }
}

export async function validateRegister(username, email) {
  const res = await fetch(`${API}/auth/validate-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.message || 'Validation failed');
    return false;
  }

  const data = await res.json();
  return data;
}

export async function register(data) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Registration failed');
  }

  try {
    await login(data.username, data.password);
    return await res.json();
  } catch (err) {
    error = err.message;
  }
}

export async function login(username, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();
  const permissions = parsePermissions(data.permissions);

  localStorage.setItem('token', data.token);
  /*
   * Start the 24-hour clock. Stored beside the token so every tab of this
   * browser shares the one deadline, and counted from here rather than taken
   * from a server timestamp (see utils/session.js).
   */
  writeSessionExpiry(sessionExpiryFromLogin(data));
  localStorage.setItem('user_id', data.user_id);
  localStorage.setItem('role_id', data.role_id);
  localStorage.setItem('org_id', data.org_id);
  localStorage.setItem('subscription', JSON.stringify(data.subscription));
  writeStoredPermissions(permissions);

  if (data.settings) {
    setSettingsAll(data.settings);
  }
  if (data.org_type) {
    localStorage.setItem('org_type', data.org_type);
    setTranslateOrgType(data.org_type);
  }
  if (data.inventory_method) {
    const { setOrganizationContext } = await import('../stores/organizationStore.js');
    setOrganizationContext({ inventoryMethod: String(data.inventory_method).trim().toUpperCase() });
  }
  localStorage.setItem('username', data.username);
  if (data.language) localStorage.setItem('lang', data.language);
  if (data.theme) localStorage.setItem('theme', data.theme);
  localStorage.setItem('last_synced_org', data.org_id);

  auth.set({
    token: data.token,
    user_id: data.user_id,
    org_id: data.org_id,
    role_id: data.role_id,
    username: data.username,
    subscription: data.subscription,
    permissions,
    isAuthenticated: true,
  });

  try {
    const { fetchOrganizationInventoryMethod } = await import('../stores/organizationStore.js');
    await fetchOrganizationInventoryMethod();
  } catch (e) {
    console.warn('Inventory method not loaded at login', e);
  }

  return Object.assign({}, data);
}

import { push } from 'svelte-spa-router';

/* The token as it is stored right now — captured before it is deleted. */
function readToken() {
  try {
    return localStorage.getItem('token');
  } catch (e) {
    return null;
  }
}

async function clearEverything() {
  // Best-effort wipe of leftover IndexedDB from the old Dexie era.
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const d of dbs) {
        try {
          if (d && d.name) await indexedDB.deleteDatabase(d.name);
        } catch (err) {
          /* ignore individual failures */
        }
      }
    } else if (typeof indexedDB !== 'undefined') {
      try {
        await indexedDB.deleteDatabase('ERPDatabase');
      } catch (err) {
        /* ignore */
      }
    }
  } catch (e) {
    console.warn('Failed to enumerate/delete indexedDB databases', e);
  }

  try {
    localStorage.clear();
  } catch (e) {}
  try {
    sessionStorage.clear();
  } catch (e) {}
  try {
    if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      for (const k of keys) {
        try {
          await caches.delete(k);
        } catch (err) {
          /* ignore */
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
}

export async function logoutClear() {
  const token = readToken();

  /*
   * The token and its deadline go first, and synchronously. localStorage is
   * shared by every window of this browser, so the moment they are gone no
   * other tab can reopen the dashboard — a full wipe of the rest (IndexedDB,
   * caches) can take its time.
   */
  clearSessionStorage();

  auth.set({
    token: null,
    user_id: null,
    org_id: null,
    username: null,
    role_id: null,
    subscription: null,
    permissions: null,
    isAuthenticated: false,
  });

  await deleteServerSession(token);

  try {
    const { clearOrganizationContext } = await import('../stores/organizationStore.js');
    clearOrganizationContext();
  } catch (e) {
    /* ignore */
  }
  await clearEverything();

  try {
    push('/login');
    location.reload();
  } catch (e) {
    /* ignore if reload unavailable */
  }

  try {
    push('/login');
  } catch (e) {
    /* ignore if push unavailable */
  }
}

export async function logout(clearLocalData = true) {
  const token = readToken();

  /*
   * Logout is deliberately token-first and synchronous: the token is what every
   * other window reads to decide whether it may show the dashboard, so removing
   * it here is what makes the logout immediate everywhere rather than only in
   * the window the button was clicked in.
   */
  clearSessionStorage();

  auth.set({
    token: null,
    user_id: null,
    org_id: null,
    username: null,
    role_id: null,
    subscription: null,
    permissions: null,
    isAuthenticated: false,
  });

  /* Then the server's copy, so the token cannot be replayed. */
  await deleteServerSession(token);

  if (clearLocalData) {
    try {
      sessionStorage.clear();
    } catch (e) {}
  }

  try {
    push('/login');
  } catch (e) {
    /* ignore if push unavailable */
  }
}
