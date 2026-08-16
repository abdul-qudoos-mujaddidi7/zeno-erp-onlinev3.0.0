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
    gap: var(--section-gap, 0.75rem);
    padding: var(--card-padding, 0.85rem) clamp(0.85rem, 1.1vw, 1.1rem);
    border: 1px solid #e5e7eb;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
    min-width: 0;
  }

  .header-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .header-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: clamp(2.1rem, 2.5vw, 2.5rem);
    height: clamp(2.1rem, 2.5vw, 2.5rem);
    border-radius: 12px;
    color: #0f6efd;
    background: #eff6ff;
    font-size: 1rem;
  }

  .header-text {
    min-width: 0;
    text-align: start;
  }

  h1 {
    margin: 0;
    color: #0f172a;
    font-size: var(--app-heading-sm, 1.1rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    margin: 0.2rem 0 0;
    color: #64748b;
    font-size: var(--app-font-sm, 0.82rem);
    font-weight: 500;
    line-height: 1.45;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
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
