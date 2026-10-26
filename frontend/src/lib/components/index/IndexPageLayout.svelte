<script>
  export let dir = 'ltr';
  export let ariaLabel = '';
  export let toolbarWidth = '25rem';
  export let showStats = false;
  export let showExtra = false;
  export let showFooter = true;
  export let dense = true;
  export let contained = true;
  export let panelClass = '';
  export let contentClass = '';
  export let tablePadding = true;
</script>

<div
  class="index-page"
  class:index-page--dense={dense}
  class:index-page--flow={!contained}
  dir={dir === 'rtl' ? 'rtl' : 'ltr'}
  aria-label={ariaLabel || undefined}>
  <section class={`index-panel ${panelClass}`.trim()}>
    {#if $$slots.actions || $$slots.toolbar}
      <header class="index-toolbar" style={`--index-toolbar-width: ${toolbarWidth};`}>
        <div class="index-toolbar-main">
          <slot name="toolbar" />
        </div>

        <div class="index-toolbar-actions">
          <slot name="actions" />
        </div>
      </header>
    {/if}

    {#if showStats && $$slots.stats}
      <section class="index-statistics">
        <slot name="stats" />
      </section>
    {/if}

    {#if showExtra && $$slots.extra}
      <section class="index-extra-actions">
        <slot name="extra" />
      </section>
    {/if}

    <div
      class={`index-content ${contentClass}`.trim()}
      class:index-content--padded={tablePadding}>
      <slot />
    </div>

    {#if showFooter && $$slots.footer}
      <footer class="index-footer">
        <slot name="footer" />
      </footer>
    {/if}
  </section>
</div>

<style>
  /*
   * Zeno index sheet — measured from the reference Journal.dc.html
   * (panel radius 14, toolbar 8/10 with 30px controls, hairline separators).
   * Shared by every list page: Journal, Sales, Purchases, Products, Accounts…
   */
  .index-page {
    --index-toolbar-control-height: 30px;

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    color: var(--z-text, #475569);
    background: transparent;
  }

  .index-panel {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-xl, 14px);
    background: var(--z-surface, #ffffff);
    box-shadow: var(--z-sh-1, 0 1px 2px rgba(11, 21, 48, 0.04));
  }

  .index-page--flow {
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .index-page--flow .index-panel {
    flex: 0 0 auto;
    min-height: 0;
    overflow: visible;
  }

  .index-page--flow .index-content {
    flex: 0 0 auto;
    overflow: visible;
  }

  .index-page--flow .index-content :global(.data-table-wrap) {
    flex: 0 0 auto;
    max-height: var(--index-table-max-height, calc(100dvh - 17.5rem));
  }

  .index-toolbar {
    position: relative;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 46px;
    padding: 8px 10px;
    overflow: visible;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface, #ffffff);
  }

  .index-toolbar-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .index-toolbar-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex: 0 0 auto;
    margin-inline-start: auto;
    min-width: 0;
  }

  .index-toolbar-actions :global(.action-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 0 0 auto;
    height: var(--index-toolbar-control-height);
    min-height: var(--index-toolbar-control-height);
    max-height: var(--index-toolbar-control-height);
    margin: 0;
    padding: 0 10px;
    border-radius: var(--z-r-sm, 8px);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .index-toolbar-actions :global(.action-btn.primary) {
    padding: 0 12px;
  }

  .index-toolbar-actions :global(.index-settings-button) {
    display: inline-grid;
    place-items: center;
    flex: 0 0 var(--index-toolbar-control-height);
    width: var(--index-toolbar-control-height);
    min-width: var(--index-toolbar-control-height);
    max-width: var(--index-toolbar-control-height);
    height: var(--index-toolbar-control-height);
    min-height: var(--index-toolbar-control-height);
    max-height: var(--index-toolbar-control-height);
    margin: 0;
    padding: 0;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface, #ffffff);
    color: var(--z-muted, #64748b);
    font: inherit;
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .index-toolbar-actions :global(.index-settings-button:hover),
  .index-toolbar-actions :global(.index-settings-button.is-active),
  .index-toolbar-actions :global(.index-settings-button:focus-visible) {
    border-color: var(--z-brand-300, #93b7f7);
    outline: none;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .index-toolbar-main :global(.filter-toolbar),
  .index-toolbar-main :global(.filter-toolbar-row) {
    width: 100%;
    min-width: 0;
  }

  .index-toolbar-main :global(.filter-toolbar-row) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .index-toolbar-main :global(.filter-search) {
    flex: 0 1 auto;
    max-width: var(--index-toolbar-width, 25rem);
    height: var(--index-toolbar-control-height);
    min-height: var(--index-toolbar-control-height);
    margin: 0;
  }

  .index-toolbar-main :global(.filter-search__input) {
    height: 100%;
    min-height: 0;
  }

  .index-statistics {
    position: relative;
    z-index: 20;
    flex: 0 0 auto;
    padding: 10px 12px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface, #ffffff);
  }

  .index-statistics :global(.index-summary-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
  }

  .index-statistics :global(.summary-card) {
    min-height: 0;
  }

  .index-extra-actions {
    position: relative;
    z-index: 10;
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    padding: 8px 12px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface-2, #f8fafc);
  }

  .index-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--z-surface, #ffffff);
  }

  /* Keep the shared table flush with the index panel on every edge. */
  .index-content--padded {
    padding: 0;
    gap: 0;
  }

  .index-content :global(.index-table-state) {
    display: grid;
    flex: 1 1 auto;
    place-items: center;
    min-height: 12rem;
  }

  .index-content :global(.data-table-wrap) {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    /* Keep a fine frame without adding outer spacing around the table. */
    margin: 0;
    overflow: auto;
    border: 1px solid var(--z-border-soft, #eef2f7);
  }

  .index-page:not(.index-page--flow) .index-content :global(.data-table) {
    height: auto;
  }

  .index-content :global(.erp-badge) {
    min-height: 20px;
    padding: 0 8px;
    border-radius: var(--z-r-pill, 999px);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.15;
  }

  .index-content :global(.erp-badge.neutral) {
    border: 1px solid transparent;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
  }

  .index-content :global(.table-actions) {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    white-space: nowrap;
  }

  .index-content :global(.table-actions .action-btn) {
    width: 26px;
    height: 26px;
    min-height: 26px;
    padding: 0;
    border-radius: var(--z-r-xs, 6px);
    box-shadow: none;
  }

  .index-content :global(.table-actions .action-btn.tone-view),
  .index-content :global(.table-actions .action-btn.tone-edit) {
    border-color: transparent;
    background: transparent;
    color: var(--z-brand, #2f6fed);
  }

  .index-content :global(.table-actions .action-btn.tone-view:hover),
  .index-content :global(.table-actions .action-btn.tone-edit:hover) {
    background: var(--z-brand-soft, #e3ecff);
  }

  .index-content :global(.table-actions .action-btn.tone-danger) {
    border-color: transparent;
    background: transparent;
    color: var(--z-debit, #dc2626);
  }

  .index-content :global(.table-actions .action-btn.tone-danger:hover) {
    background: var(--z-debit-soft, #fdecec);
  }

  .index-footer {
    position: relative;
    z-index: 10;
    flex: 0 0 auto;
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface, #ffffff);
  }

  .index-footer :global(.pagination-shell) {
    min-height: auto;
    padding: 8px 12px;
    border: 0;
    background: #F8FAFC;
  }

  @media (max-width: 1199.98px) {
    .index-toolbar,
    .index-statistics,
    .index-extra-actions {
      padding-inline: 10px;
    }

  }

  @media (max-width: 991.98px) {
    .index-toolbar {
      padding-inline: 8px;
    }

    .index-statistics,
    .index-extra-actions {
      padding-inline: 8px;
    }

    .index-footer :global(.pagination-shell) {
      padding-inline: 8px;
    }
  }

  @media (max-width: 767.98px) {
    .index-page {
      overflow: visible;
    }

    .index-page:not(.index-page--flow) .index-panel {
      min-height: calc(100dvh - 1.5rem);
      overflow: hidden;
      border-radius: var(--z-r-xl, 14px);
    }

    .index-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      min-height: auto;
      padding: 8px;
    }

    .index-toolbar-main {
      flex-direction: column;
      align-items: stretch;
      width: 100%;
      gap: 6px;
    }

    .index-toolbar-main :global(.filter-search) {
      width: 100%;
      max-width: none;
      min-width: 0;
    }

    .index-toolbar-actions {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .index-toolbar-actions :global(.action-btn) {
      flex: 1 1 auto;
    }

    .index-statistics {
      max-height: 50vh;
      padding-inline: 8px;
      overflow-y: auto;
    }

    .index-footer :global(.pagination-shell) {
      padding: 8px;
    }
  }

  @media (max-width: 575.98px) {
    .index-toolbar {
      padding: 6px;
    }

  }
</style>
