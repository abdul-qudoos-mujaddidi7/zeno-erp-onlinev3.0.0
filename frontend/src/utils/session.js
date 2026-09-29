/*
 * The login session, as the browser sees it.
 *
 * A login lasts 24 hours (backend/routes/auth.js SESSION_TTL_HOURS). The server
 * is the authority — it refuses an older token — but the browser has to know
 * the deadline too, for two things the server cannot do:
 *
 *   1. A tab that is opened (or woken) after the deadline must show the login
 *      page instead of drawing a dashboard whose every request will 401.
 *   2. An open tab must sign itself out the moment the deadline passes, instead
 *      of waiting for the next failed request to be noticed.
 *
 * The deadline is stored in localStorage next to the token, so every tab of the
 * same browser shares it and a session cannot outlive its 24 hours by being
 * reopened. It is stored as an instant in milliseconds, and it is normally
 * derived from the `expires_in` seconds the login response returns.
 *
 * Why a duration and not a server timestamp: the database writes `expires_at`
 * with its own wall clock (`DATE_ADD(NOW(), ...)`), which on this deployment
 * runs at +04:30 while the driver reads columns as UTC. An absolute value sent
 * to the browser would therefore be off by hours. Counting 24 hours from the
 * moment the token arrives is immune to that, and it is the client's own clock
 * that it has to agree with.
 *
 * Nothing here touches the auth store, so it can be unit tested on its own.
 */

/** The length of a login, in milliseconds. Kept in step with the backend. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Where the deadline lives, beside the token it belongs to. */
export const SESSION_EXPIRY_KEY = 'token_expires_at';

/*
 * Everything that belongs to the login. Logging out removes exactly these, so
 * the operator's language and theme survive a session ending.
 */
export const SESSION_KEYS = [
  'token',
  SESSION_EXPIRY_KEY,
  'user_id',
  'org_id',
  'role_id',
  'username',
  'subscription',
  'permissions',
];

function storageOf(storage) {
  return storage || (typeof localStorage !== 'undefined' ? localStorage : null);
}

/*
 * The deadline, in epoch milliseconds, or null when nothing usable is stored.
 *
 * Anything that is not a finite number (including the 'NaN' an older value
 * could produce) is treated as "unknown", never as a valid deadline.
 */
export function readSessionExpiry(storage) {
  const store = storageOf(storage);

  if (!store) return null;

  try {
    const raw = store.getItem(SESSION_EXPIRY_KEY);

    if (raw === null || raw === '') return null;

    const value = Number(raw);

    return Number.isFinite(value) ? value : null;
  } catch (error) {
    return null;
  }
}

/** Record the deadline. A null/absent value removes it rather than storing junk. */
export function writeSessionExpiry(value, storage) {
  const store = storageOf(storage);

  if (!store) return null;

  const number = Number(value);

  try {
    if (!Number.isFinite(number)) {
      store.removeItem(SESSION_EXPIRY_KEY);
      return null;
    }

    store.setItem(SESSION_EXPIRY_KEY, String(number));
    return number;
  } catch (error) {
    return null;
  }
}

/*
 * When the session ends, from a login response.
 *
 * `expires_in` is seconds from receipt, which is what the backend sends. An
 * absolute `expires_at` is still honoured for any other caller, and when the
 * response carries neither, the full 24 hours is assumed — the same choice the
 * server would have made.
 */
export function sessionExpiryFromLogin(data, now = Date.now()) {
  const seconds = Number(data?.expires_in);

  if (Number.isFinite(seconds) && seconds > 0) {
    return now + seconds * 1000;
  }

  const absolute = Date.parse(data?.expires_at ?? '');

  if (Number.isFinite(absolute)) {
    return absolute;
  }

  return now + SESSION_TTL_MS;
}

/*
 * True when the deadline has been reached.
 *
 * A missing deadline counts as expired: a token whose 24 hours are unknown
 * cannot be shown to a dashboard, and the fix is one login — which then records
 * a deadline like every later session.
 */
export function isSessionExpired(expiry, now = Date.now()) {
  const deadline = Number(expiry);

  if (!Number.isFinite(deadline)) return true;

  return now >= deadline;
}

/** Milliseconds left, never negative. */
export function sessionRemainingMs(expiry, now = Date.now()) {
  const deadline = Number(expiry);

  if (!Number.isFinite(deadline)) return 0;

  return Math.max(0, deadline - now);
}

/*
 * The one question the app asks on start-up and on every wake: may this tab
 * show the dashboard? A token alone is not enough — its deadline has to be in
 * the future too.
 */
export function hasValidSession(storage, now = Date.now()) {
  const store = storageOf(storage);

  if (!store) return false;

  try {
    if (!store.getItem('token')) return false;
  } catch (error) {
    return false;
  }

  return !isSessionExpired(readSessionExpiry(store), now);
}

/*
 * Drop everything that belongs to the session. Used both by logout and by the
 * expiry watchdog, and deliberately narrow: the language, the theme and the
 * chosen organization type are settings, not credentials.
 */
export function clearSessionStorage(storage) {
  const store = storageOf(storage);

  if (!store) return;

  for (const key of SESSION_KEYS) {
    try {
      store.removeItem(key);
    } catch (error) {
      /* A storage that refuses one key must not stop the others. */
    }
  }
}
