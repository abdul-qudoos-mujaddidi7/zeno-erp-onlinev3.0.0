<script>
  import { createEventDispatcher } from 'svelte';
  import { t, lang, isRTL } from '../../i18n/i18n';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';

  export let currentPage = 1;
  export let totalPages = 0;
  export let itemsPerPage = DEFAULT_PAGE_SIZE;
  export let totalItems = 0;
  export let getPageNumbers = () => [];
  export let ariaLabel = 'Pagination';

  export let showPerPage = true;
  export let perPageOptions = PAGE_SIZE_OPTIONS;
  export let perPageSuffix = 'صفحه';
  /** Floating label on the per-page select (e.g. نمایش). */
  export let perPageLabel = null;
  /** Label before the total count (e.g. تعداد). */
  export let countLabel = null;
  /** Optional row unit for options; falls back to perPageSuffix (no slash). */
  export let rowLabel = '';

  const dispatch = createEventDispatcher();

  $: isRtl = isRTL($lang);
  $: prevDisabled = currentPage === 1;
  $: nextDisabled = currentPage === totalPages || totalPages === 0;
  $: pageNumbers = getPageNumbers(currentPage, totalPages);
  $: resolvedCountLabel = ($lang, countLabel ?? t('record') ?? 'تعداد');
  $: resolvedPerPageLabel = ($lang, perPageLabel ?? t('Showing') ?? 'نمایش');
  $: optionUnit = ($lang, rowLabel || t('rows') || perPageSuffix);
</script>

<div class="pagination-shell">
  <nav class="pagination-nav" aria-label={ariaLabel}>
    <button
      type="button"
      class="nav-arrow"
      aria-label={isRtl ? 'صفحه بعد' : 'Previous page'}
      disabled={prevDisabled}
      on:click={() => (currentPage -= 1)}>
      <i class="bi bi-chevron-{isRtl ? 'right' : 'left'}"></i>
    </button>

    <div class="page-numbers">
      {#each pageNumbers as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
        {#if pageNum === '...'}
          <span class="page-ellipsis">...</span>
        {:else}
          <button
            type="button"
            class="page-num"
            class:active={currentPage === pageNum}
            aria-current={currentPage === pageNum ? 'page' : undefined}
            on:click={() => (currentPage = pageNum)}>
            {pageNum}
          </button>
        {/if}
      {/each}
    </div>

    <button
      type="button"
      class="nav-arrow"
      aria-label={isRtl ? 'صفحه قبل' : 'Next page'}
      disabled={nextDisabled}
      on:click={() => (currentPage += 1)}>
      <i class="bi bi-chevron-{isRtl ? 'left' : 'right'}"></i>
    </button>
  </nav>

  <div class="pagination-meta">
    {#if showPerPage}
      <label class="per-page-picker">
        <span class="picker-label">{resolvedPerPageLabel}</span>
        <select
          value={itemsPerPage}
          aria-label={resolvedPerPageLabel}
          on:change={(e) => dispatch('perPageChange', e.currentTarget.value)}>
          {#each perPageOptions as option (option)}
            <option value={option}>{option} {optionUnit}</option>
          {/each}
        </select>
        <i class="bi bi-chevron-down picker-icon" aria-hidden="true"></i>
      </label>
    {/if}

    {#if totalItems != null}
      <span class="pagination-count">
        {resolvedCountLabel} : {totalItems}
      </span>
    {/if}
  </div>
</div>

<style>
  .pagination-shell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.65rem 1rem;
    padding: var(--card-padding, 0.65rem 0.85rem);
    border-top: 1px solid #eef2f7;
    background: #fff;
    min-width: 0;
  }

  :global(html.dark) .pagination-shell {
    border-top-color: var(--erp-border);
    background: var(--erp-surface);
  }

  .pagination-nav {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .nav-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm, 2rem);
    height: var(--control-height-sm, 2rem);
    min-width: var(--control-height-sm, 2rem);
    padding: 0;
    border: none;
    border-radius: 0.35rem;
    color: #475569;
    background: transparent;
    font-size: 0.85rem;
    transition: color 0.15s ease, background 0.15s ease;
  }

  :global(html.dark) .nav-arrow {
    color: var(--erp-text-soft);
  }

  .nav-arrow:hover:not(:disabled) {
    color: #0f172a;
    background: #f1f5f9;
  }

  :global(html.dark) .nav-arrow:hover:not(:disabled) {
    color: var(--erp-text);
    background: rgba(148, 163, 184, 0.12);
  }

  .nav-arrow:disabled {
    color: #cbd5e1;
    background: transparent;
    cursor: not-allowed;
  }

  :global(html.dark) .nav-arrow:disabled {
    color: #475569;
  }

  .page-numbers {
    display: inline-flex;
    align-items: center;
    gap: 0.1rem;
  }

  .page-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--control-height-sm, 2rem);
    height: var(--control-height-sm, 2rem);
    padding: 0 0.35rem;
    border: none;
    border-radius: 0.35rem;
    color: #1e293b;
    background: transparent;
    font-size: var(--table-font-size, 0.78rem);
    color: #0f172a;
    background: #f1f5f9;
  }

  :global(html.dark) .page-num {
    color: var(--erp-text-soft);
    background: var(--erp-surface-soft);
  }

  .page-num.active {
    color: #fff;
    background: #0f6efd;
    font-weight: 700;
    box-shadow: none;
  }

  :global(html.dark) .page-num.active {
    color: #ffffff;
    background: #2563eb;
  }

  .page-ellipsis {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: var(--control-height-sm, 2rem);
    color: #64748b;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  :global(html.dark) .page-ellipsis {
    color: var(--erp-muted);
  }

  .pagination-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.65rem 0.85rem;
    min-width: 0;
  }

  .pagination-count {
    color: #334155;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 600;
    white-space: nowrap;
  }

  :global(html.dark) .pagination-count {
    color: var(--erp-text-soft);
  }

  .per-page-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    margin: 0;
  }

  .picker-label {
    position: absolute;
    top: 0;
    inset-inline-start: 0.55rem;
    z-index: 1;
    transform: translateY(-50%);
    padding: 0 0.28rem;
    background: #fff;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    pointer-events: none;
  }

  :global(html.dark) .picker-label {
    background: var(--erp-surface);
    color: var(--erp-muted);
  }

  .per-page-picker select {
    appearance: none;
    min-width: 6.5rem;
    height: var(--control-height-sm, 2rem);
    padding-inline: 0.7rem 1.65rem;
    border: 1px solid #d1d5db;
    border-radius: 0.4rem;
    color: #1e293b;
    background: #fff;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  :global(html.dark) .per-page-picker select {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text);
  }

  .per-page-picker select:focus {
    outline: none;
    border-color: #93c5fd;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
  }

  :global(html.dark) .per-page-picker select:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.16);
  }

  .picker-icon {
    position: absolute;
    inset-inline-end: 0.55rem;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: #64748b;
    font-size: 0.68rem;
  }

  :global(html.dark) .picker-icon {
    color: var(--erp-muted);
  }

  @media (max-width: 767.98px) {
    .pagination-shell {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .pagination-nav {
      justify-content: center;
    }

    .pagination-meta {
      justify-content: center;
    }

    .per-page-picker {
      flex: 1 1 auto;
    }

    .per-page-picker select {
      width: 100%;
    }
  }
</style>
