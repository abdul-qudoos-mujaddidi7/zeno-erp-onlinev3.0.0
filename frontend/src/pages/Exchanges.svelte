<script>
  import { onMount, tick } from 'svelte';
  import { t, lang , translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import ExchangesIndex from './exchanges/ExchangesIndex.svelte';
  // import JournalsReport from './journals/JournalsReport.svelte';

  export let page = 'list';
</script>

{#if page == 'list'}
  <ExchangesIndex />
{:else if page == 'report'}
  <!-- <JournalsReport /> -->
{/if}
