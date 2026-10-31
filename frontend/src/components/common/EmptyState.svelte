<script>
  export let icon = 'bi-inbox';
  export let message = '';
  /** Second, quieter line under the message (the reference empty card has one). */
  export let description = '';
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
  {#if description}
    <p class="empty-state-description">{description}</p>
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
    align-content: center;
    gap: 8px;
    min-height: clamp(8rem, 18vh, 12.5rem);
    padding: 40px 16px;
    color: var(--z-muted, #64748b);
    text-align: center;
  }

  i {
    color: var(--z-subtle, #94a3b8);
    font-size: 26px;
    line-height: 1;
  }

  p {
    margin: 0;
    max-width: 28rem;
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 600;
    line-height: 1.45;
  }

  .empty-state-description {
    margin: 0;
    max-width: 28rem;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
  }

  .empty-state-action {
    margin-top: 2px;
  }
</style>
