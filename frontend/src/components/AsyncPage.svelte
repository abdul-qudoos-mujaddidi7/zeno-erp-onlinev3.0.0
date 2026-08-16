<script>
  export let loader;
</script>

{#await loader()}
  <div class="erp-route-loading" aria-busy="true">
    <div class="erp-route-spinner"></div>
  </div>
{:then mod}
  <svelte:component this={mod.default} {...$$restProps} />
{:catch}
  <div class="erp-route-loading">Failed to load page. Check your connection and try again.</div>
{/await}

<style>
  .erp-route-loading {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
    color: var(--erp-muted, #6b7280);
    font-size: 0.95rem;
  }

  .erp-route-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(15, 23, 42, 0.12);
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: erp-spin 0.7s linear infinite;
  }

  @keyframes erp-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
