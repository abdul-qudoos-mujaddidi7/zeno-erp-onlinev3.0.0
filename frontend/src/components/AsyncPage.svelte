<script>
  import RouteSkeleton from './common/RouteSkeleton.svelte';

  export let loader;
</script>

{#await loader()}
  <RouteSkeleton />
{:then mod}
  <svelte:component this={mod.default} {...$$restProps} on:close on:saved on:showA4 on:show80mm />
{:catch}
  <div class="erp-route-error">Failed to load page. Check your connection and try again.</div>
{/await}

<style>
  .erp-route-error {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
    color: var(--erp-muted, #6b7280);
    font-size: 0.95rem;
  }
</style>
