<script>
  import ProductsIndex from './products/ProductsIndex.svelte';
  import Warehouses from './products/Warehouses.svelte';
  import Returns from './settings/Returns.svelte';
  import Wastes from './Wastes.svelte';

  export let page = 'products';
</script>

<div class="stock-route-page">
  {#if page === 'products'}
    <ProductsIndex />
  {:else if page === 'warehouses'}
    <Warehouses />
  {:else if page === 'returns'}
    <Returns />
  {:else if page === 'wastes'}
    <Wastes />
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