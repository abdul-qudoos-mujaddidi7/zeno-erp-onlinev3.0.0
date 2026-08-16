<script>
  export let minWidth = '720px';
  export let ariaLabel = '';
  export let dense = true;
  export let striped = true;
  export let hover = false;
  export let stickyHeader = true;
  export let layout = 'fixed';
  export let scrollbar = 'thin';
  export let clipCells = true;

  $: tableLayout = layout === 'auto' ? 'auto' : 'fixed';
  $: scrollbarMode = ['thin', 'hidden', 'normal'].includes(scrollbar) ? scrollbar : 'thin';
</script>

<div
  class="data-table-wrap table-container"
  class:scrollbar-thin={scrollbarMode === 'thin'}
  class:scrollbar-hidden={scrollbarMode === 'hidden'}
  class:scrollbar-normal={scrollbarMode === 'normal'}>
  <table
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
</style>
