<script>
  import TableSkeleton from './TableSkeleton.svelte';

  /*
   * Shell painted while a lazily imported page is still downloading its chunk.
   *
   * The route used to answer with a lone spinning circle, so a slow connection
   * showed a spinner first and then the page's own skeleton — two loading
   * states for one navigation. This placeholder draws the index shell the page
   * will replace it with (toolbar band, summary strip, sheet), so the circle
   * never appears and the real content lands on a matching outline.
   */

  /** Placeholder rows in the sheet. */
  export let rows = 7;
  export let ariaLabel = '';
</script>

<div class="route-skeleton" aria-busy="true">
  {#if ariaLabel}<span class="visually-hidden">{ariaLabel}</span>{/if}

  <div class="route-skeleton__panel">
    <div class="route-skeleton__toolbar">
      <span class="rs-bar rs-bar--search"></span>
      <span class="rs-bar rs-bar--chip"></span>
      <span class="rs-bar rs-bar--action"></span>
    </div>

    <div class="route-skeleton__stats">
      {#each Array(4) as _, index (index)}
        <span class="rs-bar rs-card"></span>
      {/each}
    </div>

    <div class="route-skeleton__sheet">
      <TableSkeleton {rows} colCount={5} minWidth="100%" />
    </div>
  </div>
</div>

<style>
  .route-skeleton {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .route-skeleton__panel {
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

  .route-skeleton__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 46px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
  }

  .route-skeleton__stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
    flex: 0 0 auto;
    padding: 10px 12px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
  }

  .route-skeleton__sheet {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }

  .rs-bar {
    display: block;
    border-radius: 8px;
    background: linear-gradient(
      90deg,
      var(--z-surface-3, #eef2f7) 25%,
      var(--z-surface-2, #f8fafc) 50%,
      var(--z-surface-3, #eef2f7) 75%
    );
    background-size: 200% 100%;
    animation: route-skeleton-shimmer 1.25s ease-in-out infinite;
  }

  .rs-bar--search {
    width: min(328px, 45%);
    height: 30px;
  }

  .rs-bar--chip {
    width: 28px;
    height: 28px;
  }

  .rs-bar--action {
    width: 104px;
    height: 30px;
    margin-inline-start: auto;
  }

  .rs-card {
    height: 56px;
    border-radius: 12px;
  }

  @keyframes route-skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rs-bar {
      animation: none;
    }
  }

  @media (max-width: 767.98px) {
    .route-skeleton__toolbar {
      flex-wrap: wrap;
    }

    .rs-bar--search {
      width: 100%;
    }

    .rs-bar--action {
      margin-inline-start: 0;
    }
  }
</style>
