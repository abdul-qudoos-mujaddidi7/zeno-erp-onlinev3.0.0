import { writable, get } from 'svelte/store';
import { userApi } from '../api/userApi.js';
import {
  parsePermissions,
  readStoredPermissions,
  writeStoredPermissions,
} from './permissions.js';
import { clearSessionStorage, hasValidSession } from '../utils/session.js';

/*
 * May this tab open a dashboard?
 *
 * A token is not enough on its own: a session lasts 24 hours, so a stored token
 * whose deadline has passed has to be treated as no token at all. Deciding here
 * — once, before the store exists — is what makes a tab opened a day later land
 * on the login page instead of drawing a dashboard whose every request would
 * come back 401.
 *
 * The expired token is removed rather than left in place, because the API client
 * and the media loader read localStorage directly and would otherwise keep
 * sending a token the server will refuse. Language and theme are left alone;
 * they are settings, not credentials.
 */
const sessionIsValid = hasValidSession();

if (!sessionIsValid) {
  clearSessionStorage();
}

function stored(key) {
  return sessionIsValid ? localStorage.getItem(key) : null;
}

export const auth = writable({
  token: stored('token'),
  user_id: stored('user_id'),
  org_id: stored('org_id'),
  username: stored('username'),
  role_id: stored('role_id'),
  subscription: stored('subscription'),
  permissions: sessionIsValid ? readStoredPermissions() : [],
  isAuthenticated: sessionIsValid,
});


export async function setPermissionsFromUsers() {
  const userId = get(auth).user_id;
  if (!userId || !get(auth).token) return;

  console.log('Setting permissions from users table...', userId);
  try {
    let user = (await userApi.getById(userId))?.data;
    console.log('Fetched user for permissions:', user);
    if (user && user.permissions != null && user.permissions !== '') {
      const perms = parsePermissions(user.permissions);
      writeStoredPermissions(perms);

      auth.update((v) => ({
        ...v,
        permissions: perms,
      }));
      console.log('Permissions updated from users table:', perms);
    }
  } catch (error) {
    console.error('Error fetching user permissions:', error);
  }
}
