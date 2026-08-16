import { writable, get } from 'svelte/store';
import { userApi } from '../api/userApi.js';

const isBrowser = typeof window !== 'undefined';
const savedTheme = isBrowser ? localStorage.getItem('theme') : null;
const defaultTheme = savedTheme || (isBrowser && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export const theme = writable(defaultTheme);

function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}

function applyTheme(value) {
  if (!isBrowser) return;

  const normalized = normalizeTheme(value);
  document.documentElement.classList.toggle('dark', normalized === 'dark');
  document.documentElement.classList.toggle('light', normalized === 'light');
  document.documentElement.dataset.mdbTheme = normalized;
  document.documentElement.style.colorScheme = normalized;
  localStorage.setItem('theme', normalized);
}

function getCurrentUserId() {
  if (!isBrowser) return null;

  const userId = Number(localStorage.getItem('user_id') || 0);
  return userId || null;
}

async function saveUserTheme(value) {
  const userId = getCurrentUserId();
  if (!userId) return;

  try {
    await userApi.update(userId, { theme: normalizeTheme(value) });
  } catch (error) {
    console.warn('Failed to save theme to user table', error);
  }
}

if (isBrowser) {
  theme.subscribe(applyTheme);
}

export async function loadUserTheme() {
  const userId = getCurrentUserId();
  if (!userId) {
    applyTheme(get(theme));
    return get(theme);
  }

  try {
    const user = (await userApi.getById(userId))?.data;
    const userTheme = user?.theme ? normalizeTheme(user.theme) : normalizeTheme(localStorage.getItem('theme'));
    theme.set(userTheme);
    return userTheme;
  } catch (error) {
    console.warn('Failed to load theme from user table', error);
    applyTheme(get(theme));
    return get(theme);
  }
}

export async function setTheme(value) {
  const normalized = normalizeTheme(value);
  theme.set(normalized);
  await saveUserTheme(normalized);
}

export async function toggleTheme() {
  const nextTheme = get(theme) === 'dark' ? 'light' : 'dark';
  await setTheme(nextTheme);
}
