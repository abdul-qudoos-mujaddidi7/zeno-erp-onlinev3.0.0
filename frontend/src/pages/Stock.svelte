<script>
  import AsyncPage from "../components/AsyncPage.svelte";
  const loadProductsIndex = () => import('./products/ProductsIndex.svelte');
  const loadWarehouses = () => import('./products/Warehouses.svelte');
  const loadReturns = () => import('./settings/Returns.svelte');
  const loadWastes = () => import('./Wastes.svelte');

  export let page = 'products';
</script>

<div class="stock-route-page">
  {#if page === 'products'}
    <AsyncPage loader={loadProductsIndex} />
  {:else if page === 'warehouses'}
    <AsyncPage loader={loadWarehouses} />
  {:else if page === 'returns'}
    <AsyncPage loader={loadReturns} />
  {:else if page === 'wastes'}
    <AsyncPage loader={loadWastes} />
  {/if}
</div>

<style>
  .stock-route-page {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  .stock-route-page :global(.index-page-layout),
  .stock-route-page :global(.index-page),
  .stock-route-page :global(.warehouses-page) {
    flex: 1 1 auto;
    min-height: 0;
  }
</style>