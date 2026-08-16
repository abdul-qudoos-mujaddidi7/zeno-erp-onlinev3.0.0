<script>
  import { onMount, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let page = 'list';
</script>

{#if page == 'list'}
  <div class="m-4">
    <h1>{t('Transfers')}</h1>
    <h2>{t('Coming Soon...')}</h2>
  </div>
{:else if page == 'incoming'}
  <div class="m-4">
    <h1>{t('Incoming Transfers')}</h1>
    <h2>{t('Coming Soon...')}</h2>
  </div>
{:else if page == 'outgoing'}
  <div class="m-4">
    <h1>{t('Outgoing Transfers')}</h1>
    <h2>{t('Coming Soon...')}</h2>
  </div>
{:else if page == 'report'}
  <div class="m-4">
    <h1>{t('Reports')}</h1>
    <h2>{t('Coming Soon...')}</h2>
  </div>
{/if}
