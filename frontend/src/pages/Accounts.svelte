<script>
  import { onMount } from "svelte";
  import AccountsIndex from "./accounts/AccountsIndex.svelte";
  import AccountsGroups from "./accounts/AccountGroups.svelte";
  import AllAccountsReport from "./accounts/AllAccountsReport.svelte";
  import GeneralReport from "./accounts/GeneralReport.svelte";
  // import AccountTypes from "./accounts/AccountTypes.svelte";

  import { API_URL } from "../config";
  export let page = 'list';

  
  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions || [];
  $: hasAccountsView = permissions.some((p) => p.code === 'Accounts' && p.view);
  $: permissionsPending =
    $auth.isAuthenticated && (!Array.isArray(permissions) || permissions.length === 0);

  import { t, lang, translate_org_type } from "../i18n/i18n";
  import AccountGroups from "./accounts/AccountGroups.svelte";

  // ensure component re-renders when language changes
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

</script>

{#if permissionsPending && !hasAccountsView}
  <div class="m-3 text-muted">{t('Loading...')}</div>
{:else if !hasAccountsView}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
{#if page == 'list'}
  <AccountsIndex />
{:else if page == 'groups'}
  <AccountGroups />
{:else if page == 'report'}
  <AllAccountsReport />
{:else if page == 'general-report'}
  <GeneralReport />
{/if}
{/if}