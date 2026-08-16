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
        <div class="index-toolbar-actions">
          <slot name="actions" />
        </div>

        <div class="index-toolbar-main">
          <slot name="toolbar" />
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
  .index-page {
    --index-toolbar-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    color: #172033;
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
    border: 1px solid #dfe5ed;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.025);
  }

  :global(html.dark) .index-panel {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow: var(--erp-shadow-sm);
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
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.875rem;
    flex: 0 0 auto;
    min-height: 4rem;
    padding: 0.6875rem 1.25rem;
    overflow: visible;
    border-bottom: 1px solid #edf1f5;
    background: #ffffff;
    direction: ltr;
  }

  :global(html.dark) .index-toolbar {
    border-bottom-color: var(--erp-border);
    background: var(--erp-surface);
  }

  .index-toolbar-actions {
    grid-column: 1;
    grid-row: 1;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-width: 0;
  }

  .index-toolbar-main {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    justify-self: end;
    width: min(100%, var(--index-toolbar-width, 25rem));
    min-width: 0;
  }

  .index-page[dir='rtl'] .index-toolbar-actions,
  .index-page[dir='rtl'] .index-toolbar-main {
    direction: rtl;
  }

  .index-page[dir='ltr'] .index-toolbar-actions,
  .index-page[dir='ltr'] .index-toolbar-main {
    direction: ltr;
  }

  .index-toolbar-actions :global(.action-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4375rem;
    flex: 0 0 auto;
    height: var(--index-toolbar-control-height);
    min-height: var(--index-toolbar-control-height);
    max-height: var(--index-toolbar-control-height);
    margin: 0;
    padding: 0 1rem;
    border-radius: 0.5625rem;
    line-height: 1;
    white-space: nowrap;
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
    border: 1px solid #ccd8e7;
    border-radius: 0.5625rem;
    background: #ffffff;
    color: #64748b;
    font: inherit;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  :global(html.dark) .index-toolbar-actions :global(.index-settings-button) {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text-soft);
  }

  :global(html.dark) .index-toolbar-actions :global(.index-settings-button:hover),
  :global(html.dark) .index-toolbar-actions :global(.index-settings-button.is-active),
  :global(html.dark) .index-toolbar-actions :global(.index-settings-button:focus-visible) {
    border-color: rgba(96, 165, 250, 0.48);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.12);
  }

  .index-toolbar-actions :global(.index-settings-button:hover),
  .index-toolbar-actions :global(.index-settings-button.is-active),
  .index-toolbar-actions :global(.index-settings-button:focus-visible) {
    border-color: #93b4e7;
    outline: none;
    background: #f5f9ff;
    color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.07);
  }

  .index-toolbar-main :global(.filter-toolbar),
  .index-toolbar-main :global(.filter-toolbar-row) {
    width: 100%;
    min-width: 0;
  }

  .index-toolbar-main :global(.filter-toolbar-row) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: nowrap;
    gap: 0.5rem;
  }

  .index-toolbar-main :global(.filter-search) {
    flex: 1 1 auto;
    width: 100%;
    min-width: 15rem;
    height: var(--index-toolbar-control-height);
    min-height: var(--index-toolbar-control-height);
    max-height: var(--index-toolbar-control-height);
    margin: 0;
  }

  .index-toolbar-main :global(.filter-search__input) {
    height: calc(var(--index-toolbar-control-height) - 2px);
    min-height: calc(var(--index-toolbar-control-height) - 2px);
    max-height: calc(var(--index-toolbar-control-height) - 2px);
  }

  .index-toolbar-main :global(.filter-toggle) {
    flex: 0 0 1.75rem;
    width: 1.75rem;
    min-width: 1.75rem;
    max-width: 1.75rem;
    height: 1.75rem;
    min-height: 1.75rem;
    max-height: 1.75rem;
  }

  .index-statistics {
    position: relative;
    z-index: 20;
    flex: 0 0 auto;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #edf1f5;
    background: #fafcff;
  }

  :global(html.dark) .index-statistics {
    border-bottom-color: var(--erp-border);
    background: var(--erp-surface-soft);
  }

  .index-statistics :global(.index-summary-grid) {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .index-statistics :global(.summary-card) {
    min-height: 4.625rem;
    padding: 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: none;
  }

  :global(html.dark) .index-statistics :global(.summary-card) {
    border-color: var(--erp-border);
    background: var(--erp-surface);
  }

  .index-statistics :global(.summary-icon) {
    width: 2.25rem;
    height: 2.25rem;
    flex: 0 0 2.25rem;
    border-radius: 0.625rem;
    font-size: 0.9375rem;
  }

  .index-statistics :global(.summary-label) {
    margin-bottom: 0.1875rem;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 700;
  }

  :global(html.dark) .index-statistics :global(.summary-label) {
    color: var(--erp-muted);
  }

  .index-statistics :global(.summary-value) {
    color: #0f172a;
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.25;
  }

  :global(html.dark) .index-statistics :global(.summary-value) {
    color: var(--erp-text);
  }

  .index-extra-actions {
    position: relative;
    z-index: 10;
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    padding: 0.625rem 1.25rem;
    border-bottom: 1px solid #edf1f5;
    background: #fffdf7;
  }

  :global(html.dark) .index-extra-actions {
    border-bottom-color: var(--erp-border);
    background: rgba(245, 158, 11, 0.08);
  }

  .index-content {
    position: relative;
    z-index: 1;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #ffffff;
  }

  :global(html.dark) .index-content {
    background: var(--erp-surface);
  }

  .index-content--padded {
    padding-inline: 1.25rem;
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
    overflow: auto;
  }

  .index-page:not(.index-page--flow) .index-content :global(.data-table) {
    height: auto;
  }

  .index-content :global(.erp-badge) {
    min-height: 1.625rem;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.15;
  }

  .index-content :global(.erp-badge.neutral) {
    border: 1px solid #dfe6ee;
    background: #f1f5f9;
    color: #475569;
  }

  :global(html.dark) .index-content :global(.erp-badge.neutral) {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text-soft);
  }

  .index-content :global(.table-actions) {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .index-content :global(.table-actions .action-btn) {
    width: 2.125rem;
    height: 2.125rem;
    min-height: 2.125rem;
    padding: 0;
    border-radius: 0.5rem;
    box-shadow: none;
  }

  .index-content :global(.table-actions .action-btn.tone-view),
  .index-content :global(.table-actions .action-btn.tone-edit) {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #0f6efd;
  }

  :global(html.dark) .index-content :global(.table-actions .action-btn.tone-view),
  :global(html.dark) .index-content :global(.table-actions .action-btn.tone-edit) {
    border-color: rgba(96, 165, 250, 0.38);
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  .index-content :global(.table-actions .action-btn.tone-danger) {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  :global(html.dark) .index-content :global(.table-actions .action-btn.tone-danger) {
    border-color: rgba(248, 113, 113, 0.36);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
  }

  .index-footer {
    position: relative;
    z-index: 10;
    flex: 0 0 auto;
    background: #ffffff;
  }

  :global(html.dark) .index-footer {
    background: var(--erp-surface);
  }

  .index-footer :global(.pagination-shell) {
    min-height: auto;
    padding: 0.875rem 1.25rem 1rem;
    border: 0;
    background: transparent;
  }

  @media (max-width: 1199.98px) {
    .index-toolbar,
    .index-statistics,
    .index-extra-actions {
      padding-inline: 1rem;
    }

    .index-content--padded {
      padding-inline: 1rem;
    }

    .index-statistics :global(.index-summary-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 991.98px) {
    .index-toolbar {
      gap: 0.75rem;
      padding-inline: 0.75rem;
    }

    .index-toolbar-main {
      width: min(100%, 36rem);
    }

    .index-toolbar-main :global(.filter-search) {
      min-width: 12rem;
    }

    .index-statistics,
    .index-extra-actions,
    .index-content--padded {
      padding-inline: 0.75rem;
    }

    .index-footer :global(.pagination-shell) {
      padding-inline: 0.75rem;
    }
  }

  @media (max-width: 767.98px) {
    .index-page {
      overflow: visible;
    }

    .index-page:not(.index-page--flow) .index-panel {
      min-height: calc(100dvh - 1.5rem);
      overflow: hidden;
      border-radius: 0.75rem;
    }

    .index-toolbar {
      display: flex;
      align-items: stretch;
      flex-direction: column;
      gap: 0.625rem;
      min-height: auto;
      padding: 0.75rem;
      direction: initial;
    }

    .index-toolbar-main {
      order: 1;
      width: 100%;
      max-width: none;
      justify-self: stretch;
    }

    .index-toolbar-actions {
      order: 2;
      display: flex;
      width: 100%;
      justify-content: flex-start;
    }

    .index-toolbar-main :global(.filter-search) {
      width: 100%;
      min-width: 0;
    }

    .index-toolbar-actions :global(.action-btn) {
      flex: 1 1 auto;
    }

    .index-statistics {
      max-height: 50vh;
      padding-inline: 0.75rem;
      overflow-y: auto;
    }

    .index-statistics :global(.index-summary-grid) {
      grid-template-columns: 1fr;
    }

    .index-content--padded {
      padding-inline: 0.5rem;
    }

    .index-footer :global(.pagination-shell) {
      padding: 0.625rem;
    }
  }

  @media (max-width: 575.98px) {
    .index-toolbar {
      padding: 0.625rem;
    }

    .index-content--padded {
      padding-inline: 0.375rem;
    }
  }
</style>
