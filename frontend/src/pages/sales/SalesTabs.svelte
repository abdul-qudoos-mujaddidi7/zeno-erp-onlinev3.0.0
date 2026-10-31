<script>
  import { createEventDispatcher } from 'svelte';

  /** [{ key, label, icon }] — same anatomy as the reference's sales sub-nav. */
  export let tabs = [];
  export let active = 'sales';
  export let ariaLabel = '';

  const dispatch = createEventDispatcher();
</script>

<nav class="sales-tabs" aria-label={ariaLabel || undefined}>
  {#each tabs as tab (tab.key)}
    <button
      type="button"
      class="sales-tab"
      class:is-active={active === tab.key}
      aria-current={active === tab.key ? 'page' : undefined}
      on:click={() => active !== tab.key && dispatch('select', tab.key)}>
      <span class="ms" aria-hidden="true">{tab.icon}</span>
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .sales-tabs {
    display: flex;
    gap: 2px;
    max-width: 100%;
    padding: 3px;
    overflow-x: auto;
    border-radius: 10px;
    background: var(--z-surface-3, #f1f5f9);
  }

  .sales-tab {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--z-muted, #64748b);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .sales-tab .ms {
    font-size: 16px;
  }

  .sales-tab:hover {
    color: var(--z-ink, #0b1530);
  }

  .sales-tab.is-active {
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #0b1530);
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(11, 21, 48, 0.14);
  }
</style>
