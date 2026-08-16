import { writable, get } from 'svelte/store';
import { userApi } from '../api/userApi.js';
import {
  parsePermissions,
  readStoredPermissions,
  writeStoredPermissions,
} from './permissions.js';

export const auth = writable({
  token: localStorage.getItem('token'),
  user_id: localStorage.getItem('user_id'),
  org_id: localStorage.getItem('org_id'),
  username: localStorage.getItem('username'),
  role_id: localStorage.getItem('role_id'),
  subscription: localStorage.getItem('subscription'),
  permissions: readStoredPermissions(),
  isAuthenticated: !!localStorage.getItem('token'),
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
