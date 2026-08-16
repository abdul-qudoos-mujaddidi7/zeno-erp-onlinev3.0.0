<script>
  export let icon = 'bi-inbox';
  export let message = '';
  export let loading = false;
</script>

<div class="empty-state">
  {#if loading}
    <div class="spinner-border text-primary" role="status">
      <span class="visually-hidden">{message}</span>
    </div>
  {:else}
    <i class="bi {icon}" aria-hidden="true"></i>
  {/if}
  {#if message}
    <p>{message}</p>
  {/if}
  {#if $$slots.default}
    <div class="empty-state-action">
      <slot />
    </div>
  {/if}
</div>

<style>
  .empty-state {
    display: grid;
    place-items: center;
    gap: 0.55rem;
    min-height: clamp(8rem, 18vh, 12.5rem);
    padding: var(--card-padding, 1rem);
    color: #64748b;
    text-align: center;
  }

  i {
    color: #cbd5e1;
    font-size: clamp(1.6rem, 2.5vw, 2rem);
  }

  p {
    margin: 0;
    max-width: 28rem;
    font-size: var(--control-font, 0.86rem);
    font-weight: 600;
    line-height: 1.45;
  }

  .empty-state-action {
    margin-top: 0.25rem;
  }
</style>
