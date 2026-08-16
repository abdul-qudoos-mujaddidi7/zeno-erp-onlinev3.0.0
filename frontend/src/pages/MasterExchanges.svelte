<script>
  import { onMount, tick } from 'svelte';
  import { t, lang , translate_org_type } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import ProductsIndex from './products/ProductsIndex.svelte';
  import Purchases from './Purchases.svelte';
  import Sales from './Sales.svelte';
  import POS from './POS.svelte';
  // import JournalsReport from './journals/JournalsReport.svelte';

  export let page = 'list';
</script>

{#if page == 'list'}
  <ProductsIndex />
{:else if page == 'purchases'}
  <Purchases />
{:else if page == 'sales'}
  <Sales />
{:else if page == 'pos'}
  <POS isComponent={true} />
{/if}
