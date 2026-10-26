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
  /** Accessible label for the page-size option group (e.g. نمایش). */
  export let perPageLabel = null;
  /** Label before the total count (e.g. تعداد). */
  export let countLabel = null;
  /** Visible row label and accessible option unit; falls back to perPageSuffix. */
  export let rowLabel = '';

  const dispatch = createEventDispatcher();

  $: isRtl = isRTL($lang);
  $: prevDisabled = currentPage === 1;
  $: nextDisabled = currentPage === totalPages || totalPages === 0;
  $: pageNumbers = getPageNumbers(currentPage, totalPages);
  $: resolvedCountLabel = ($lang, countLabel ?? t('record') ?? 'تعداد');
  $: resolvedPerPageLabel = ($lang, perPageLabel ?? t('Showing') ?? 'نمایش');
  $: resolvedRowLabel = ($lang, rowLabel || t('rows') || perPageSuffix);
  $: optionUnit = resolvedRowLabel;
</script>

<div class="pagination-shell">
  <div class="pagination-meta">
    {#if totalItems != null}
      <span class="pagination-count">
        {resolvedCountLabel} : <b dir="ltr">{totalItems}</b>
      </span>
    {/if}

    {#if showPerPage}
      <div class="per-page-control" role="group" aria-label={resolvedPerPageLabel}>
        <span class="row-label">{resolvedRowLabel}</span>
        <div class="per-page-options">
          {#each perPageOptions as option (option)}
            <button
              type="button"
              class="per-page-option"
              class:active={Number(itemsPerPage) === Number(option)}
              aria-label={`${option} ${optionUnit}`}
              aria-pressed={Number(itemsPerPage) === Number(option)}
              on:click={() => dispatch('perPageChange', String(option))}>
              {option}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <nav class="pagination-nav" aria-label={ariaLabel}>
    <button
      type="button"
      class="nav-arrow"
      aria-label={isRtl ? 'صفحه قبل' : 'Previous page'}
      disabled={prevDisabled}
      on:click={() => (currentPage -= 1)}>
      <span class="ms nav-icon" aria-hidden="true">{isRtl ? 'chevron_right' : 'chevron_left'}</span>
      <span class="nav-label">{isRtl ? 'قبلی' : 'Previous'}</span>
    </button>

    <div class="page-numbers">
      {#each pageNumbers as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
        {#if pageNum === '...'}
          <span class="page-ellipsis">…</span>
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
      aria-label={isRtl ? 'صفحه بعد' : 'Next page'}
      disabled={nextDisabled}
      on:click={() => (currentPage += 1)}>
      <span class="nav-label">{isRtl ? 'بعدی' : 'Next'}</span>
      <span class="ms nav-icon" aria-hidden="true">{isRtl ? 'chevron_left' : 'chevron_right'}</span>
    </button>
  </nav>
</div>

<style>
  .pagination-shell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    background: #F8FAFC;
    min-width: 0;
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
  }

  .pagination-nav {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .nav-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 9px;
    color: var(--z-text, #475569);
    background: var(--z-surface, #ffffff);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .nav-arrow:hover:not(:disabled) {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-hover, #f5f9ff);
    color: var(--z-ink, #0b1530);
  }

  .nav-arrow:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .nav-arrow:disabled {
    color: var(--z-subtle, #94a3b8);
    background: var(--z-surface, #ffffff);
    opacity: 0.6;
    cursor: not-allowed;
  }

  .nav-icon {
    font-size: 18px !important;
  }

  .nav-label {
    line-height: 1;
  }

  .page-numbers {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  .page-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--z-text, #475569);
    font-family: var(--z-font-num, 'Inter', 'Vazirmatn', sans-serif);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }

  .page-num:hover {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  .page-num:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .page-num.active {
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
    font-weight: 800;
    box-shadow: 0 6px 14px -8px rgba(47, 111, 237, 0.9);
    cursor: default;
  }

  .page-num.active:hover {
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
  }

  .page-ellipsis {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 32px;
    color: var(--z-subtle, #94a3b8);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .pagination-meta {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 16px;
    min-width: 0;
  }

  .pagination-count {
    color: var(--z-muted, #64748b);
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }

  .pagination-count b {
    color: var(--z-ink, #0b1530);
    font-weight: 800;
  }

  .per-page-control {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    margin: 0;
    gap: 6px;
  }

  .row-label {
    color: var(--z-muted, #64748b);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .per-page-options {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--z-surface-3, #f1f5f9);
  }

  .per-page-option {
    min-width: 34px;
    height: 26px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-muted, #64748b);
    font-family: var(--z-font-num, 'Inter', 'Vazirmatn', sans-serif);
    font-size: 11.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  }

  .per-page-option:hover {
    color: var(--z-ink, #0b1530);
  }

  .per-page-option.active {
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #0b1530);
    box-shadow: 0 1px 3px rgba(11, 21, 48, 0.14);
  }

  .per-page-option:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  @media (max-width: 767.98px) {
    .pagination-shell {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .pagination-nav {
      justify-content: center;
    }

    .pagination-meta {
      justify-content: center;
    }

    .nav-label {
      display: none;
    }
  }
</style>
