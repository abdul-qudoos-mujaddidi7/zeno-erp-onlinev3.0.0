<script>
  import { onMount, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import JournalsIndex from './journals/JournalsIndex.svelte';
  import JournalsReport from './journals/JournalsReport.svelte';

  export let page = 'list';


  
  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions;
</script>

{#if !permissions?.some((p) => p.code === 'Journals' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
  {#if page == 'list'}
    <JournalsIndex />
  {:else if page == 'report'}
    <JournalsReport />
  {/if}

{/if}
