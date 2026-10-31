<script>
  import DataTable from './DataTable.svelte';

  /*
   * Placeholder sheet shown while an index page waits for its rows.
   *
   * It renders through the shared DataTable, so the header band, row height,
   * gutters and edge insets are the same ones the real rows land in — the grid
   * does not jump when the data arrives. A page only hands over the widths it
   * already passes to its own DataTable.
   */

  /** Column widths, e.g. ['158px', 'auto', '162px']. */
  export let columns = null;
  /** Column count when the page's table has no fixed widths. */
  export let colCount = 5;
  /** Placeholder rows — enough to fill one screen without a scrollbar jump. */
  export let rows = 7;
  export let ariaLabel = '';
  export let minWidth = '760px';
  export let dense = true;
  export let layout = 'fixed';
  export let headerHeight = null;
  export let cellPaddingY = null;
  export let edgePaddingX = null;
  export let headEdgePaddingX = null;
  export let headBorderColor = null;
  export let mobileCards = true;

  /* Bars alternate long/short so a column reads as a value, not as a block. */
  const BAR_WIDTHS = [72, 56, 64, 44, 58, 40, 68, 50, 36];

  $: cellCount = columns?.length || colCount;
  $: gridColumns = columns?.length ? columns : null;

  const barWidth = (index) => `${BAR_WIDTHS[index % BAR_WIDTHS.length]}%`;
</script>

<DataTable
  {ariaLabel}
  {minWidth}
  {dense}
  {layout}
  {headerHeight}
  {cellPaddingY}
  {edgePaddingX}
  {headEdgePaddingX}
  {headBorderColor}
  {mobileCards}
  columns={gridColumns}
  striped={false}
  hover={false}>
  <svelte:fragment slot="head">
    <tr>
      {#each Array(cellCount) as _, index (index)}
        <th>
          <span
            class="skeleton-bar skeleton-bar--head"
            style={`width: ${barWidth(index)}`}></span>
        </th>
      {/each}
    </tr>
  </svelte:fragment>

  {#each Array(rows) as _, rowIndex (rowIndex)}
    <tr class="data-table__skeleton">
      {#each Array(cellCount) as _, index (index)}
        <td>
          <span class="skeleton-bar" style={`width: ${barWidth(index)}`}></span>
        </td>
      {/each}
    </tr>
  {/each}
</DataTable>

<style>
  .skeleton-bar {
    display: block;
    width: 100%;
    max-width: 100%;
    height: 10px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--z-surface-3, #eef2f7) 25%,
      var(--z-surface-2, #f8fafc) 50%,
      var(--z-surface-3, #eef2f7) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.25s ease-in-out infinite;
  }

  .skeleton-bar--head {
    height: 8px;
    opacity: 0.7;
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }

    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-bar {
      animation: none;
    }
  }

  /*
   * On phones the shared table turns each row into a labelled card. The
   * placeholder row has no header text to label with, so the labels would print
   * an empty index — drop them and let the bars speak.
   */
  @media (max-width: 767px) {
    :global(.data-table-wrap.mobile-cards .data-table tbody tr.data-table__skeleton td)::before {
      content: none;
    }
  }
</style>
