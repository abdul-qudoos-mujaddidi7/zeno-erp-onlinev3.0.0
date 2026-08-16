<script>
  import Router from "svelte-spa-router";
  import routes from "./routes";
  import { onMount } from 'svelte';
  import { auth,setPermissionsFromUsers } from './auth/authStore';
  import { fetchOrganizationInventoryMethod } from './stores/organizationStore.js';
  import './stores/themeStore.js';
  import { loadUserTheme } from './stores/themeStore.js';
  import { loadSettings } from './i18n/i18n';

  import ToastContainer from "./ToastUI/ToastContainer.svelte";
  import ConfirmModalHost from "./components/common/ConfirmModalHost.svelte";

  onMount(() => {
    setPermissionsFromUsers();
    loadUserTheme();
    loadSettings();
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
