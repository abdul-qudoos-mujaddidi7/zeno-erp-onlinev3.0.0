<script>
  import { onMount } from 'svelte';
  import { labelTableRows } from '../../utils/tableCards.js';

  export let minWidth = '720px';
  export let ariaLabel = '';
  export let dense = true;
  export let striped = true;
  export let hover = false;
  export let stickyHeader = true;
  export let layout = 'fixed';
  export let scrollbar = 'thin';
  export let clipCells = true;
  /**
   * On phones the row is shown as a stacked card — one label/value line per
   * cell — instead of a 720px+ table that has to be dragged sideways. Set to
   * false for a table that only makes sense as a grid.
   */
  export let mobileCards = true;

  $: tableLayout = layout === 'auto' ? 'auto' : 'fixed';
  $: scrollbarMode = ['thin', 'hidden', 'normal'].includes(scrollbar) ? scrollbar : 'thin';

  let tableEl;

  /*
   * The card layout labels each cell from its column header (see
   * utils/tableCards.js): the headers live in a slot, so the rendered <thead>
   * is the only reliable source.
   */
  const labelRows = () => labelTableRows(tableEl);

  onMount(() => {
    labelRows();

    const body = tableEl?.querySelector('tbody');
    if (!body) return;

    /* Rows are re-rendered on sort, filter and paging — keep the labels in
       step. Attributes are not observed, so writing `data-label` cannot loop. */
    const observer = new MutationObserver(labelRows);
    observer.observe(body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  });
</script>

<div
  class="data-table-wrap table-container"
  class:mobile-cards={mobileCards}
  class:scrollbar-thin={scrollbarMode === 'thin'}
  class:scrollbar-hidden={scrollbarMode === 'hidden'}
  class:scrollbar-normal={scrollbarMode === 'normal'}>
  <table
    bind:this={tableEl}
    class="data-table"
    class:data-table--dense={dense}
    class:data-table--striped={striped}
    class:data-table--hover={hover}
    class:data-table--sticky={stickyHeader}
    class:data-table--clip-cells={clipCells}
    style:min-width={minWidth}
    style:table-layout={tableLayout}
    aria-label={ariaLabel || undefined}
  >
    <thead>
      <slot name="head" />
    </thead>

    <tbody>
      <slot />
    </tbody>
  </table>
</div>

<style>
  .data-table-wrap {
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }

  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #b8c4d2 transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #b8c4d2;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  :global(html.dark) .scrollbar-thin {
    scrollbar-color: #526176 transparent;
  }

  :global(html.dark) .scrollbar-thin::-webkit-scrollbar-thumb {
    background: #526176;
  }

  :global(html.dark) .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }

  .scrollbar-hidden {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .scrollbar-hidden::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .scrollbar-normal {
    scrollbar-width: auto;
    scrollbar-color: auto;
  }

  .data-table {
    --data-table-row-bg: #ffffff;
    --data-table-alt-row-bg: #f5f7fa;
    --data-table-hover-bg: #f0f5ff;

    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: var(--table-font-size, 0.78rem);
  }

  :global(html.dark) .data-table {
    --data-table-row-bg: var(--erp-surface, #111827);
    --data-table-alt-row-bg: var(--erp-surface-soft, #172033);
    --data-table-hover-bg: rgba(96, 165, 250, 0.12);

    color: var(--erp-text);
  }

  .data-table :global(thead th) {
    height: auto;
    padding: 0.625rem 0.875rem;

    border-bottom: 1px solid #dfe5ed;
    background: #ffffff;
    color: #66758a;

    font-size: var(--table-header-font-size, 0.78125rem);
    font-weight: 800;
    line-height: 1.25;

    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  :global(html.dark) .data-table :global(thead th) {
    border-bottom-color: var(--erp-border);
    background: var(--erp-surface);
    color: var(--erp-text-soft);
  }

  .data-table--sticky :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 5;
  }

  .data-table :global(tbody tr) {
    height: auto;
    min-height: 0;
    background: var(--data-table-row-bg);
  }

  :global(html.dark) .data-table :global(tbody tr) {
    background: var(--data-table-row-bg);
  }

  .data-table :global(tbody td) {
    height: auto;
    min-height: 0;
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid rgb(224, 224, 224);
    background: inherit;
    font-size: var(--table-font-size, 0.75rem);
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

  :global(html.dark) .data-table :global(tbody td) {
    border-bottom-color: var(--erp-border);
    color: var(--erp-text);
  }

  .data-table--clip-cells :global(tbody td) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-table--dense :global(thead th) {
    height: 3rem;
    padding-block: 0.625rem;
  }

  .data-table--dense :global(tbody td) {
    padding-block: 0.4rem;
  }

  .data-table--striped :global(tbody tr:nth-child(odd)) {
    background: var(--data-table-row-bg);
  }

  .data-table--striped :global(tbody tr:nth-child(even)) {
    background: var(--data-table-alt-row-bg);
  }

  :global(html.dark) .data-table--striped :global(tbody tr:nth-child(odd)) {
    background: var(--data-table-row-bg);
  }

  :global(html.dark) .data-table--striped :global(tbody tr:nth-child(even)) {
    background: var(--data-table-alt-row-bg);
  }

  .data-table--hover :global(tbody tr:hover) {
    background: var(--data-table-hover-bg);
  }

  :global(html.dark) .data-table--hover :global(tbody tr:hover) {
    background: var(--data-table-hover-bg);
  }

  .data-table:not(.data-table--hover):not(.data-table--striped) :global(tbody tr:hover),
  .data-table--striped:not(.data-table--hover) :global(tbody tr:nth-child(odd):hover) {
    background: var(--data-table-row-bg);
  }

  .data-table--striped:not(.data-table--hover) :global(tbody tr:nth-child(even):hover) {
    background: var(--data-table-alt-row-bg);
  }

  :global(html.dark) .data-table:not(.data-table--hover):not(.data-table--striped) :global(tbody tr:hover),
  :global(html.dark) .data-table--striped:not(.data-table--hover) :global(tbody tr:nth-child(odd):hover) {
    background: var(--data-table-row-bg);
  }

  :global(html.dark) .data-table--striped:not(.data-table--hover) :global(tbody tr:nth-child(even):hover) {
    background: var(--data-table-alt-row-bg);
  }

  .data-table :global(.col-start) {
    text-align: start;
  }

  .data-table :global(.sort-icon) {
    margin-inline-start: 0.25rem;
  }

  .data-table :global(td > *) {
    margin-top: 0;
    margin-bottom: 0;
  }

  .data-table :global(button),
  .data-table :global(.erp-badge),
  .data-table :global(.price-pill) {
    vertical-align: middle;
  }

  /*
   * Phone layout: every row becomes a card, every cell a label/value line.
   * This replaces the sideways drag of a 720px+ table, so the amount and the
   * row actions are reachable without scrolling. The label comes from the
   * column header copied by labelRows() above.
   */
  @media (max-width: 767px) {
    .data-table-wrap.mobile-cards {
      overflow-x: hidden;
    }

    /* The inline min-width (e.g. 780px) would otherwise keep the drag. */
    .data-table-wrap.mobile-cards .data-table {
      display: block;
      min-width: 0 !important;
      border-collapse: separate;
    }

    .data-table-wrap.mobile-cards .data-table :global(thead) {
      display: none;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody) {
      display: block;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody tr) {
      display: block;
      margin-bottom: 0.6rem;
      border: 1px solid var(--erp-border, #e2e8f0);
      border-radius: 12px;
      background: var(--erp-surface, #ffffff);
      overflow: hidden;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody tr:last-child) {
      margin-bottom: 0;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody td) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: auto;
      min-width: 0;
      padding: 0.4rem 0.7rem;
      border-bottom: 1px solid #eef2f7;
      text-align: end;
      white-space: normal;
      overflow: visible;
      text-overflow: clip;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody td:last-child) {
      border-bottom: 0;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody td)::before {
      content: attr(data-label);
      flex: 0 1 auto;
      min-width: 0;
      color: #66758a;
      font-size: 0.72rem;
      font-weight: 800;
      text-align: start;
      overflow-wrap: anywhere;
    }

    /* Rows without a matching column (subtotals, notes) read as plain lines. */
    .data-table-wrap.mobile-cards .data-table :global(tbody td:not([data-label])) {
      justify-content: flex-start;
      text-align: start;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody td:not([data-label]))::before {
      content: none;
    }

    /* Action cells: the controls sit on their own line and share the width. */
    .data-table-wrap.mobile-cards .data-table :global(tbody td:has(> :nth-child(2))) {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody tr),
    .data-table-wrap.mobile-cards .data-table--striped :global(tbody tr:nth-child(odd)),
    .data-table-wrap.mobile-cards .data-table--striped :global(tbody tr:nth-child(even)) {
      background: var(--erp-surface, #ffffff);
    }
  }
</style>
