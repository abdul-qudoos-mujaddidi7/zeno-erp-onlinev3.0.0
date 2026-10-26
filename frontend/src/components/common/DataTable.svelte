<script>
  import { onMount } from 'svelte';
  import { labelTableRows } from '../../utils/tableCards.js';

  export let minWidth = '720px';
  export let ariaLabel = '';
  export let dense = true;
  export let striped = true;
  export let hover = true;
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
  /**
   * Column template, e.g. ['156px', 'auto', '162px', '162px', '102px'].
   *
   * The reference journal sheet is a grid — 136 / minmax(0,1fr) / 150 / 150 / 64
   * with a 12px gutter and a 14px inset at both edges. A table reproduces that
   * rhythm with 6px of cell padding per side (6 + 6 = the 12px gutter) and 14px
   * on the two edge cells, so a reference 150px column is declared 162px here.
   * Supplying widths pins the table to a fixed layout, which is what keeps the
   * columns where the reference puts them.
   *
   * @type {string[] | null}
   */
  export let columns = null;
  /**
   * Vertical padding of a body cell, e.g. '9px'. The reference journal row pads
   * 9px top and bottom; the default stays at the denser 7px.
   *
   * @type {string | null}
   */
  export let cellPaddingY = null;

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
    style={`min-width: ${minWidth}; table-layout: ${
      columns?.length ? 'fixed' : tableLayout
    };${cellPaddingY ? ` --dt-cell-pad-y: ${cellPaddingY};` : ''}`}
    aria-label={ariaLabel || undefined}
  >
    {#if columns?.length}
      <colgroup>
        {#each columns as width, index (index)}
          <col style:width={width} />
        {/each}
      </colgroup>
    {/if}

    <thead>
      <slot name="head" />
    </thead>

    <tbody>
      <slot />
    </tbody>
  </table>
</div>

<style>
  /*
   * Zeno table — reference purchase header: 40px on surface-2, 11.5/600 muted
   * labels, 12px column gutters and a single border-colored bottom rule.
   */
  .data-table-wrap {
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--z-surface, #ffffff);
  }

  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .scrollbar-thin::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    border: 2px solid var(--erp-bg, #eef2f8);
    border-radius: 8px;
    background: #cbd5e1;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background: #cbd5e1;
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
    --data-table-row-bg: var(--z-surface, #ffffff);
    --data-table-alt-row-bg: color-mix(in srgb, var(--z-surface-2, #f8fafc) 60%, var(--z-surface, #ffffff));
    --data-table-hover-bg: var(--z-hover, #f5f9ff);

    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--z-text, #475569);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .data-table :global(thead th) {
    height: 40.67px;
    padding: 0 12px;

    border-bottom: 1px solid var(--z-border, #E1E7F0);
    background: var(--z-th-bg, #f8fafc);
    color: var(--z-muted, #64748b);

    font-family: var(--z-font, 'Inter', 'Vazirmatn', sans-serif);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.25;

    text-align: start;
    vertical-align: middle;
    white-space: nowrap;
  }

  .data-table--sticky :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 3;
  }

  .data-table :global(tbody tr) {
    height: 40.67px;
    min-height: 0;
    background: var(--data-table-row-bg);
  }

  .data-table :global(tbody td) {
    height: auto;
    min-height: 0;
    padding: var(--dt-cell-pad-y, 7px) 6px;
    border-bottom: 1px solid var(--z-row-border, #f0f2f7);
    background: inherit;
    font-size: 12px;
    line-height: 1.4;
    text-align: start;
    vertical-align: middle;
  }

  .data-table :global(tbody tr:last-child td) {
    border-bottom: 0;
  }

  /* Keep header labels aligned with the purchase reference's 16px edge insets. */
  .data-table :global(thead th:first-child) {
    padding-inline-start: 16px;
  }

  .data-table :global(thead th:last-child) {
    padding-inline-end: 16px;
  }

  /* Body cells retain their existing edge inset and column alignment. */
  .data-table :global(tbody td:first-child) {
    padding-inline-start: 14px;
  }

  .data-table :global(tbody td:last-child) {
    padding-inline-end: 14px;
  }

  .data-table :global(thead th.col-center) {
    text-align: center;
  }

  .data-table :global(thead th.cursor-pointer) {
    cursor: pointer;
  }

  .data-table :global(thead th[aria-sort] > button) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    margin-inline-start: -6px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--z-r-xs, 6px);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .data-table :global(thead th[aria-sort="ascending"] > button),
  .data-table :global(thead th[aria-sort="descending"] > button) {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-weight: 800;
  }

  .data-table :global(thead th[aria-sort] > button:focus-visible) {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .data-table--clip-cells :global(tbody td) {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-table--dense :global(thead th) {
    height: 40px;
    padding-block: 0;
  }

  .data-table--dense :global(tbody td) {
    padding-block: var(--dt-cell-pad-y, 7px);
  }

  .data-table--striped :global(tbody tr:nth-child(odd)) {
    background: var(--data-table-row-bg);
  }

  .data-table--striped :global(tbody tr:nth-child(even)) {
    background: var(--data-table-alt-row-bg);
  }

  .data-table--hover :global(tbody tr:hover) {
    background: var(--data-table-hover-bg);
  }

  /* Amounts and codes read as numbers, flush to the end of their column. */
  .data-table :global(.col-end),
  .data-table :global(.cell-end) {
    text-align: end;
  }

  .data-table :global(.num) {
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    direction: ltr;
  }

  .data-table :global(.col-start) {
    text-align: start;
  }

  .data-table :global(.cell-muted) {
    color: var(--z-muted, #64748b);
  }

  .data-table :global(.sort-icon) {
    margin-inline-start: 3px;
    font-size: 14px;
    opacity: 0.55;
    vertical-align: middle;
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

  /* Action cells sit at the end of the row. An actions column header wants
     `col-end` too, so the label sits over its buttons. A page that centres the
     column (the reference journal row does) opts out with `col-center`. */
  .data-table :global(td:has(.table-actions):not(.col-center)),
  .data-table :global(td:has(.action-btn):not(.col-center)) {
    text-align: end;
    white-space: nowrap;
  }

  .data-table :global(td.col-center) {
    justify-content: center;
    text-align: center;
  }

  /* Expanded detail row (journal lines, invoice items). */
  .data-table :global(tr.data-table__detail > td) {
    padding: 4px 14px 10px;
    border-bottom: 1px solid var(--z-row-border, #f0f2f7);
    background: var(--z-surface-2, #f8fafc);
  }

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
      height: auto;
      margin-bottom: 8px;
      border: 1px solid var(--z-border, #e1e7f0);
      border-radius: var(--z-r-lg, 12px);
      background: var(--z-surface, #ffffff);
      overflow: hidden;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody tr:last-child) {
      margin-bottom: 0;
    }

    .data-table-wrap.mobile-cards .data-table :global(tbody td) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: auto;
      min-width: 0;
      padding: 6px 10px;
      border-bottom: 1px solid var(--z-border-soft, #eef2f7);
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
      color: var(--z-muted, #64748b);
      font-size: 10.5px;
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
      background: var(--z-surface, #ffffff);
    }

    .data-table-wrap.mobile-cards .data-table :global(tr.data-table__detail) {
      margin-top: -8px;
      border-top: 0;
      border-radius: 0 0 var(--z-r-lg, 12px) var(--z-r-lg, 12px);
    }

    .data-table-wrap.mobile-cards .data-table :global(tr.data-table__detail > td) {
      display: block;
      padding: 8px 10px;
      text-align: start;
    }
  }
</style>
