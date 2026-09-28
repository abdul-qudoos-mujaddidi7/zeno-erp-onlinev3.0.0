<script>
  import { t, lang, translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import ExchangesIndex from './exchanges/ExchangesIndex.svelte';
  import ExchangeReport from './exchanges/ExchangeReport.svelte';

  export let page = 'list';
</script>

{#if page == 'list'}
  <ExchangesIndex />
{:else if page == 'report'}
  <ExchangeReport />
{/if}
