<script>
  import Router from "svelte-spa-router";
  import routes from "./routes";
  import { onMount } from 'svelte';
  import { auth,setPermissionsFromUsers } from './auth/authStore';
  import { logout } from './auth/authService.js';
  import {
    SESSION_KEYS,
    hasValidSession,
    readSessionExpiry,
    sessionRemainingMs,
  } from './utils/session.js';
  import { fetchOrganizationInventoryMethod } from './stores/organizationStore.js';
  import './stores/themeStore.js';
  import { loadUserTheme } from './stores/themeStore.js';
  import { loadSettings } from './i18n/i18n';

  import ToastContainer from "./ToastUI/ToastContainer.svelte";
  import ConfirmModalHost from "./components/common/ConfirmModalHost.svelte";

  /*
   * The session watchdog.
   *
   * The server enforces the 24 hours of a login, but an open tab has to act on
   * them itself: at the deadline it signs itself out, so the operator sees the
   * login page instead of a dashboard that has quietly stopped working. The
   * same check runs when the tab is woken (a laptop that slept through the
   * deadline) and when another tab changes the stored token, which is how a
   * logout in one window closes the dashboard in all of them.
   */
  let expiryTimer = null;
  let endingSession = false;

  function clearExpiryTimer() {
    if (expiryTimer !== null) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
  }

  async function endSession() {
    if (endingSession) return;

    endingSession = true;
    clearExpiryTimer();

    try {
      await logout();
    } finally {
      endingSession = false;
    }
  }

  function armExpiryTimer() {
    clearExpiryTimer();

    if (!$auth || !$auth.isAuthenticated) return;

    const remaining = sessionRemainingMs(readSessionExpiry());

    /* Already past the deadline: no reason to wait for a timer to notice. */
    if (remaining <= 0) {
      endSession();
      return;
    }

    /* setTimeout tops out around 24.8 days, so 24 hours fits comfortably. */
    expiryTimer = setTimeout(endSession, remaining);
  }

  function handleStorageChange(event) {
    /* localStorage.clear() reaches other tabs with a null key. */
    if (event.key !== null && !SESSION_KEYS.includes(event.key)) return;

    if (hasValidSession()) return;

    endSession();
  }

  function handleVisibilityChange() {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!$auth || !$auth.isAuthenticated) return;

    if (!hasValidSession()) {
      endSession();
      return;
    }

    armExpiryTimer();
  }

  onMount(() => {
    setPermissionsFromUsers();
    loadUserTheme();
    loadSettings();

    armExpiryTimer();
    const unsubscribeAuth = auth.subscribe(() => armExpiryTimer());
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeAuth();
      clearExpiryTimer();
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  let initialOnlineLoadDone = false;
  let loadedThemeUserId = null;

  $: if ($auth && $auth.isAuthenticated && !initialOnlineLoadDone) {
    initialOnlineLoadDone = true;
    try {
      fetchOrganizationInventoryMethod().catch((e) =>
        console.warn('Could not load inventory method, using cache if available', e),
      );
    } catch (e) {
      console.warn(e);
    }
  }

  $: if ($auth && $auth.isAuthenticated && $auth.user_id && loadedThemeUserId !== $auth.user_id) {
    loadedThemeUserId = $auth.user_id;
    loadUserTheme();
  }

  $: if (!$auth || !$auth.isAuthenticated) {
    initialOnlineLoadDone = false;
    loadedThemeUserId = null;
  }
</script>

<ToastContainer />
<ConfirmModalHost />
<Router {routes} />
