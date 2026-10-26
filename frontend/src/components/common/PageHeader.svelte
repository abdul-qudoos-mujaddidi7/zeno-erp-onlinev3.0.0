<script>
  export let title = '';
  export let description = '';
  export let icon = '';
</script>

<header class="page-header">
  <div class="header-main">
    {#if icon}
      <div class="header-icon" aria-hidden="true">
        <i class="bi {icon}"></i>
      </div>
    {/if}
    <div class="header-text">
      <h1>{title}</h1>
      {#if description}
        <p>{description}</p>
      {/if}
    </div>
  </div>

  {#if $$slots.actions}
    <div class="header-actions">
      <slot name="actions" />
    </div>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-lg, 12px);
    background: var(--z-surface, #ffffff);
    box-shadow: var(--z-sh-1, 0 1px 2px rgba(11, 21, 48, 0.04));
    min-width: 0;
  }

  .header-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .header-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    color: var(--z-link, #2f6fed);
    background: var(--z-brand-soft, #e3ecff);
    font-size: 15px;
  }

  .header-text {
    min-width: 0;
    text-align: start;
  }

  h1 {
    margin: 0;
    color: var(--z-ink, #0b1530);
    font-size: var(--z-fs-lg, 14px);
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    margin: 2px 0 0;
    color: var(--z-muted, #64748b);
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 500;
    line-height: 1.45;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
    min-width: 0;
  }

  @media (max-width: 767.98px) {
    .page-header {
      align-items: stretch;
      flex-direction: column;
    }

    .header-actions {
      justify-content: stretch;
      width: 100%;
    }

    .header-actions :global(.action-btn) {
      width: 100%;
      justify-content: center;
    }
  }
</style>
