<script>
  import AsyncPage from "../components/AsyncPage.svelte";
  import { onMount } from "svelte";
  const loadAccountsIndex = () => import('./accounts/AccountsIndex.svelte');
  const loadAllAccountsReport = () => import('./accounts/AllAccountsReport.svelte');
  const loadGeneralReport = () => import('./accounts/GeneralReport.svelte');
  // import AccountTypes from "./accounts/AccountTypes.svelte";

  import { API_URL } from "../config";
  export let page = 'list';

  
  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions || [];
  $: hasAccountsView = permissions.some((p) => p.code === 'Accounts' && p.view);
  $: permissionsPending =
    $auth.isAuthenticated && (!Array.isArray(permissions) || permissions.length === 0);

  import { t, lang, translate_org_type } from "../i18n/i18n";
  const loadAccountGroups = () => import('./accounts/AccountGroups.svelte');

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
  <AsyncPage loader={loadAccountsIndex} />
{:else if page == 'groups'}
  <AsyncPage loader={loadAccountGroups} />
{:else if page == 'report'}
  <AsyncPage loader={loadAllAccountsReport} />
{:else if page == 'general-report'}
  <AsyncPage loader={loadGeneralReport} />
{/if}
{/if}