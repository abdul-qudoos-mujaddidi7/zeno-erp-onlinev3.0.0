<script>
  /*
   * Stacked shimmer bars for a panel, card group or dialog body that is still
   * loading its content — the detail-shaped counterpart to TableSkeleton.
   */

  /** Bars to draw. Cards pass a small count with a tall `lineHeight`. */
  export let lines = 3;
  export let lineHeight = '12px';
  export let gap = '10px';
  export let ariaLabel = '';

  const WIDTHS = [100, 86, 64, 92, 72];

  const barWidth = (index) => `${WIDTHS[index % WIDTHS.length]}%`;
</script>

<div class="panel-skeleton" aria-busy="true" style={`--ps-gap: ${gap};`}>
  {#each Array(lines) as _, index (index)}
    <span
      class="panel-skeleton__bar"
      style={`height: ${lineHeight}; width: ${barWidth(index)}`}></span>
  {/each}
  {#if ariaLabel}
    <span class="visually-hidden">{ariaLabel}</span>
  {/if}
</div>

<style>
  .panel-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--ps-gap, 10px);
    width: 100%;
  }

  .panel-skeleton__bar {
    display: block;
    max-width: 100%;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--z-surface-3, #eef2f7) 25%,
      var(--z-surface-2, #f8fafc) 50%,
      var(--z-surface-3, #eef2f7) 75%
    );
    background-size: 200% 100%;
    animation: panel-skeleton-shimmer 1.25s ease-in-out infinite;
  }

  @keyframes panel-skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }

    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-skeleton__bar {
      animation: none;
    }
  }
</style>
