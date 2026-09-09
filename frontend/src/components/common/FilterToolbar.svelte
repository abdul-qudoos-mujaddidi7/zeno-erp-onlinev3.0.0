<script>
  import { createEventDispatcher } from 'svelte';
  import FilterSelect from './FilterSelect.svelte';
  import AppDatePicker from './AppDatePicker.svelte';

  export let searchValue = '';
  export let searchPlaceholder = '';
  export let filters = [];
  export let resetLabel = 'حذف فیلترها';
  export let filterLabel = 'فیلتر';
  export let showReset = true;

  const dispatch = createEventDispatcher();

  let filtersOpen = false;

  const panelId = `filter-toolbar-panel-${Math.random().toString(36).slice(2)}`;

  $: visibleFilters = filters.filter((filter) => filter.visible !== false);

  $: activeFilterCount = visibleFilters.filter((filter) => !['', 'all', null, undefined].includes(filter.value)).length;

  function toggleFilters() {
    filtersOpen = !filtersOpen;
  }

  function closeFilters() {
    filtersOpen = false;
  }

  function clearSearch() {
    dispatch('searchChange', '');
  }

  function handleReset() {
    dispatch('reset');
    filtersOpen = false;
  }

  function handleFilterChange(filter, value) {
    dispatch('filterChange', {
      key: filter.key,
      value,
    });
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape' && filtersOpen) {
      filtersOpen = false;
    }
  }

  function clickOutside(node) {
    function handleWindowClick(event) {
      if (!filtersOpen) return;
      if (event.target.closest?.('.filter-select__menu')) return;

      if (!node.contains(event.target)) {
        filtersOpen = false;
      }
    }

    window.addEventListener('click', handleWindowClick);

    return {
      destroy() {
        window.removeEventListener('click', handleWindowClick);
      },
    };
  }
</script>

<svelte:window on:keydown={closeOnEscape} />

<section class="filter-toolbar">
  <div class="filter-toolbar-row">
    <div class="filter-search" class:is-open={filtersOpen} use:clickOutside>
      <i class="bi bi-search filter-search__icon" aria-hidden="true"></i>

      <input
        type="search"
        class="filter-search__input"
        value={searchValue}
        placeholder={searchPlaceholder}
        autocomplete="off"
        on:input={(event) => dispatch('searchChange', event.currentTarget.value)} />

      {#if searchValue}
        <button
          type="button"
          class="search-clear"
          aria-label="Clear search"
          title="Clear search"
          on:click={clearSearch}>
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      {/if}

      {#if visibleFilters.length}
        <button
          type="button"
          class="filter-toggle"
          class:filter-toggle--active={filtersOpen || activeFilterCount > 0}
          aria-label={filterLabel}
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          title={filterLabel}
          on:click|stopPropagation={toggleFilters}>
          <i class="bi bi-sliders2" aria-hidden="true"></i>
        </button>
      {/if}

      {#if filtersOpen && visibleFilters.length}
        <div class="filter-panel" id={panelId} role="dialog" aria-label={filterLabel} on:click|stopPropagation>
          <div class="filter-panel__arrow"></div>

          <header class="filter-panel__header">
            <div class="filter-panel__title">
              <span class="filter-panel__title-icon">
                <i class="bi bi-sliders2" aria-hidden="true"></i>
              </span>

              <div>
                <strong>{filterLabel}</strong>

                <small>
                  {#if activeFilterCount > 0}
                    {activeFilterCount} فیلتر فعال
                  {:else}
                    انتخاب گزینه‌های مورد نظر
                  {/if}
                </small>
              </div>
            </div>

            <button
              type="button"
              class="filter-panel__close"
              aria-label="Close filters"
              title="Close"
              on:click={closeFilters}>
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </header>

          <div class="filter-panel__body">
            <div class="filter-panel__fields">
              {#each visibleFilters as filter (filter.key)}
                <div class="filter-field">
                  {#if filter.type === 'date'}
                    <div class="filter-date">
                      <AppDatePicker
                        value={filter.value || ''}
                        label={filter.label}
                        on:change={(event) => handleFilterChange(filter, event.detail)} />
                    </div>
                  {:else}
                    <FilterSelect
                      variant="outline"
                      label={filter.label}
                      icon={filter.icon}
                      value={filter.value}
                      multiple={filter.multiple}
                      options={filter.options || []}
                      on:change={(event) => handleFilterChange(filter, event.detail)} />
                  {/if}
                </div>
              {/each}
            </div>
          </div>

          <footer class="filter-panel__footer">
            {#if showReset}
              <button type="button" class="filter-reset" disabled={activeFilterCount === 0} on:click={handleReset}>
                <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>

                <span>{resetLabel}</span>
              </button>
            {/if}

            <button type="button" class="filter-apply" on:click={closeFilters}>
              <i class="bi bi-check2" aria-hidden="true"></i>

              <span>تایید</span>
            </button>
          </footer>
        </div>
      {/if}
    </div>

    {#if $$slots.actions}
      <div class="filter-toolbar-actions">
        <slot name="actions" />
      </div>
    {/if}
  </div>
</section>

<style>
  .filter-toolbar {
    position: relative;
    width: 100%;
    min-width: 0;
    padding: 0;
    overflow: visible;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .filter-toolbar-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.625rem;
    width: 100%;
    min-width: 0;
  }

  /* Search container */

  .filter-search {
    position: relative;
    display: flex;
    flex: 1 1 min(25rem, 100%);
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-width: 0;
    min-height: 2.625rem;
    padding-inline: 0.75rem 0.375rem;
    overflow: visible;
    border: 1px solid #d6e0ed;
    border-radius: 0.625rem;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.025);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      background 0.16s ease;
  }

  :global(html.dark) .filter-search {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    box-shadow: none;
  }

  .filter-search:hover {
    border-color: #bfd0e4;
  }

  :global(html.dark) .filter-search:hover {
    border-color: var(--erp-border-strong);
  }

  .filter-search:focus-within,
  .filter-search.is-open {
    border-color: #79a8f8;
    background: #ffffff;
    box-shadow:
      0 0 0 3px rgba(37, 99, 235, 0.08),
      0 4px 12px rgba(15, 23, 42, 0.04);
  }

  :global(html.dark) .filter-search:focus-within,
  :global(html.dark) .filter-search.is-open {
    border-color: #60a5fa;
    background: var(--erp-surface);
    box-shadow:
      0 0 0 3px rgba(96, 165, 250, 0.14),
      0 8px 18px rgba(0, 0, 0, 0.18);
  }

  .filter-search__icon {
    flex: 0 0 auto;
    color: #9aabc0;
    font-size: 1rem;
    pointer-events: none;
  }

  :global(html.dark) .filter-search__icon {
    color: var(--erp-muted);
  }

  .filter-search__input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 2.5rem;
    min-height: 2.5rem;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 550;
    line-height: 1.3;
  }

  :global(html.dark) .filter-search__input {
    color: var(--erp-text);
  }

  .filter-search__input::placeholder {
    color: #9aa8b9;
    opacity: 1;
  }

  :global(html.dark) .filter-search__input::placeholder {
    color: #718096;
  }

  .filter-search__input::-webkit-search-cancel-button {
    display: none;
  }

  /* Clear-search button */

  .search-clear {
    display: inline-grid;
    place-items: center;
    flex: 0 0 1.75rem;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 0;
    border-radius: 0.4375rem;
    background: transparent;
    color: #94a3b8;
    font-size: 0.6875rem;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .search-clear:hover {
    background: #f1f5f9;
    color: #475569;
  }

  :global(html.dark) .search-clear {
    color: var(--erp-muted);
  }

  :global(html.dark) .search-clear:hover {
    background: rgba(148, 163, 184, 0.12);
    color: var(--erp-text);
  }

  /* Filter toggle */

  .filter-search > .filter-toggle {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: 0 0 1.75rem;

  width: 1.75rem;
  min-width: 1.75rem;
  max-width: 1.75rem;

  height: 1.75rem;
  min-height: 1.75rem;
  max-height: 1.75rem;

  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0.4rem;

  background: #0f6efd;
  color: #ffffff;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;

  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);

  transition:
    color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}

.filter-search > .filter-toggle:hover {
  background: #0f6efd;
  color: #ffffff;
}

.filter-search > .filter-toggle:active {
  transform: scale(0.95);
}

.filter-search > .filter-toggle.filter-toggle--active {
  background: #0f6efd;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.18);
}

.filter-search > .filter-toggle i {
  font-size: 0.85rem;
  color: inherit !important;
}

.filter-search > .filter-toggle:not(.filter-toggle--active) i {
  color: #ffffff !important;
}

.filter-search > .filter-toggle.filter-toggle--active i {
  color: #ffffff !important;
}
  /* Filter panel */

  .filter-panel {
    position: absolute;
    top: calc(100% + 0.75rem);

    /* Always open on the physical left side */
    left: 0;
    right: auto;

    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: 22.5rem;
    max-width: calc(100vw - 2rem);
    max-height: min(34rem, calc(100vh - 8rem));
    overflow: visible;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 1rem;
    background: #ffffff;
    box-shadow:
      0 24px 60px rgba(15, 23, 42, 0.17),
      0 8px 20px rgba(15, 23, 42, 0.07);
    transform-origin: top left;
    animation: filter-panel-enter 0.18s ease-out;
  }

  :global(html.dark) .filter-panel {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow:
      0 24px 60px rgba(0, 0, 0, 0.38),
      0 8px 20px rgba(0, 0, 0, 0.28);
  }

  .filter-panel__arrow {
    position: absolute;
    top: -0.4375rem;
    left: 1.125rem;
    width: 0.875rem;
    height: 0.875rem;
    border-top: 1px solid rgba(15, 23, 42, 0.1);
    border-left: 1px solid rgba(15, 23, 42, 0.1);
    background: #ffffff;
    transform: rotate(45deg);
  }

  :global(html.dark) .filter-panel__arrow {
    border-color: var(--erp-border);
    background: var(--erp-surface);
  }

  @keyframes filter-panel-enter {
    from {
      opacity: 0;
      transform: translateY(-0.375rem) scale(0.98);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Filter panel header */

  .filter-panel__header {
    position: relative;
    z-index: 2;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 0.875rem;
    border-bottom: 1px solid #edf1f5;
    border-radius: 1rem 1rem 0 0;
    background: linear-gradient(180deg, #ffffff 0%, #fafcff 100%);
  }

  :global(html.dark) .filter-panel__header {
    border-bottom-color: var(--erp-border);
    background: linear-gradient(180deg, var(--erp-surface) 0%, var(--erp-surface-soft) 100%);
  }

  .filter-panel__title {
    display: flex;
    align-items: center;
    gap: 0.6875rem;
    min-width: 0;
  }

  .filter-panel__title-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 2.25rem;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    background: #eaf2ff;
    color: #0f6efd;
    font-size: 1rem;
  }

  :global(html.dark) .filter-panel__title-icon {
    background: rgba(96, 165, 250, 0.16);
    color: #93c5fd;
  }

  .filter-panel__title > div {
    display: grid;
    min-width: 0;
    gap: 0.125rem;
  }

  .filter-panel__title strong {
    color: #172033;
    font-size: 0.875rem;
    font-weight: 850;
    line-height: 1.3;
  }

  :global(html.dark) .filter-panel__title strong {
    color: var(--erp-text);
  }

  .filter-panel__title small {
    color: #8794a7;
    font-size: 0.6875rem;
    font-weight: 550;
    line-height: 1.3;
  }

  :global(html.dark) .filter-panel__title small {
    color: var(--erp-muted);
  }

  .filter-panel__close {
    display: inline-grid;
    place-items: center;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #7b8ba1;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .filter-panel__close:hover {
    background: #f1f5f9;
    color: #172033;
  }

  :global(html.dark) .filter-panel__close {
    color: var(--erp-muted);
  }

  :global(html.dark) .filter-panel__close:hover {
    background: rgba(148, 163, 184, 0.12);
    color: var(--erp-text);
  }

  /* Filter panel body */

  .filter-panel__body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 0.875rem;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  :global(html.dark) .filter-panel__body {
    scrollbar-color: #526176 transparent;
  }

  .filter-panel__fields {
    display: grid;
    gap: 0.75rem;
  }

  .filter-field {
    position: relative;
    min-width: 0;
  }

  .filter-date {
    display: grid;
    gap: 0.35rem;
  }

  .filter-date__label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #5e6e82;
    font-size: 0.75rem;
    font-weight: 750;
  }

  :global(html.dark) .filter-date__label {
    color: var(--erp-text-soft);
  }

  .filter-date__label i { color: #0f6efd; }

  .filter-date input {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid #d7e1ee;
    border-radius: 0.625rem;
    outline: 0;
    background: #fff;
    color: #26364b;
    font: inherit;
  }

  :global(html.dark) .filter-date input {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text);
  }

  .filter-date input:focus {
    border-color: #79a8f8;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
  }

  :global(html.dark) .filter-date input:focus {
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.14);
  }

  .filter-panel__fields :global(.filter-select) {
    width: 100%;
    min-width: 0;
  }

  .filter-panel__fields :global(.filter-select.is-open) {
    position: relative;
    z-index: 1050;
  }

  .filter-panel__fields :global(.filter-select__control),
  .filter-panel__fields :global(.filter-select-control) {
    min-height: 2.75rem;
    border-color: #d7e1ee;
    border-radius: 0.625rem;
    background: #ffffff;
  }

  :global(html.dark) .filter-panel__fields :global(.filter-select__control),
  :global(html.dark) .filter-panel__fields :global(.filter-select-control) {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
  }

  /* Footer buttons */

  .filter-panel__footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    min-height: 4rem;
    padding: 0.75rem 0.875rem;
    border-top: 1px solid #edf1f5;
    border-radius: 0 0 1rem 1rem;
    background: #fafcff;
  }

  :global(html.dark) .filter-panel__footer {
    border-top-color: var(--erp-border);
    background: var(--erp-surface-soft);
  }

  .filter-reset,
  .filter-apply {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4375rem;
    min-height: 2.375rem;
    padding: 0.4375rem 0.875rem;
    border-radius: 0.5625rem;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 750;
    line-height: 1.2;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .filter-reset {
    border: 1px solid #cbd8e7;
    background: #ffffff;
    color: #5e6e82;
  }

  :global(html.dark) .filter-reset {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    color: var(--erp-text-soft);
  }

  .filter-reset:hover:not(:disabled) {
    border-color: #f0a6ad;
    background: #fff5f5;
    color: #c83248;
  }

  :global(html.dark) .filter-reset:hover:not(:disabled) {
    border-color: rgba(248, 113, 113, 0.42);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
  }

  .filter-reset:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .filter-apply {
    min-width: 6rem;
    border: 1px solid #0f6efd;
    background: #0f6efd;
    color: #ffffff;
    box-shadow: 0 5px 12px rgba(37, 99, 235, 0.18);
  }

  .filter-apply:hover {
    border-color: #1d4ed8;
    background: #1d4ed8;
    box-shadow: 0 7px 16px rgba(37, 99, 235, 0.22);
  }

  /* Actions slot */

  .filter-toolbar-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
  }

  @media (max-width: 767.98px) {
    .filter-toolbar-row {
      align-items: stretch;
      flex-direction: column;
    }

    .filter-search,
    .filter-toolbar-actions {
      width: 100%;
      min-width: 0;
    }

    .filter-toolbar-actions {
      justify-content: stretch;
    }

    .filter-panel {
      left: 0;
      right: auto;
      width: min(22.5rem, calc(100vw - 1.5rem));
      max-width: none;
    }
  }

  @media (max-width: 575.98px) {
    .filter-panel {
      position: fixed;
      top: auto;
      right: 0.75rem;
      bottom: 0.75rem;
      left: 0.75rem;
      width: auto;
      max-width: none;
      max-height: min(80vh, 36rem);
      border-radius: 1rem;
      transform-origin: bottom center;
      animation: filter-sheet-enter 0.2s ease-out;
    }

    .filter-panel__arrow {
      display: none;
    }

    @keyframes filter-sheet-enter {
      from {
        opacity: 0;
        transform: translateY(1rem);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .filter-panel__footer {
      position: sticky;
      bottom: 0;
    }

    .filter-reset,
    .filter-apply {
      flex: 1 1 50%;
    }
  }
</style>
