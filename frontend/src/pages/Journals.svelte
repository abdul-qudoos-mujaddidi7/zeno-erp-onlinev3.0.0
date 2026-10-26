<script>
  import AsyncPage from "../components/AsyncPage.svelte";
  import { t, lang, translate_org_type } from '../i18n/i18n';
  import { auth } from '../auth/authStore';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: permissions = $auth.permissions;

  const loadJournalsIndex = () => import('./journals/JournalsIndex.svelte');
  const loadJournalsReport = () => import('./journals/JournalsReport.svelte');

  export let page = 'list';
</script>

{#if !permissions?.some((p) => p.code === 'Journals' && p.view)}
  <h3 class="text-danger m-3"><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}</h3>
{:else}
  <div class="jpage-shell" dir={t('dir')}>
    {#if page == 'list'}
      <AsyncPage loader={loadJournalsIndex} />
    {:else if page == 'report'}
      <AsyncPage loader={loadJournalsReport} />
    {/if}
  </div>
{/if}

<style>
  /*
   * The journal page owns its background and outer gutter around the sheet.
   */
  .jpage-shell {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: transparent;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

</style>
