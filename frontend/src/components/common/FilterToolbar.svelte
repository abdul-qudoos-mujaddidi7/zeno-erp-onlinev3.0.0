<script>
  import { createEventDispatcher, tick } from 'svelte';
  import FilterSelect from './FilterSelect.svelte';
  import AppDatePicker from './AppDatePicker.svelte';

  export let searchValue = '';
  export let searchPlaceholder = '';
  export let filters = [];
  export let resetLabel = 'پاک‌کردن';
  export let filterLabel = 'فیلتر';
  export let applyLabel = 'نمایش';
  export let showReset = true;
  export let showApply = true;
  export let showFilterText = false;
  /** Draw shared toolbar controls with the Journal Material Symbols icons. */
  export let material = true;

  const dispatch = createEventDispatcher();

  let filtersOpen = false;
  let filterTriggerEl;
  let filterPanelEl;
  let filterPanelStyle = '';
  let filterPanelDir = 'ltr';

  const panelId = `filter-toolbar-panel-${Math.random().toString(36).slice(2)}`;

  $: visibleFilters = filters.filter((filter) => filter.visible !== false);

  $: activeFilterCount = visibleFilters.filter((filter) =>
    Array.isArray(filter.value)
      ? filter.value.length > 0
      : !['', 'all', null, undefined].includes(filter.value),
  ).length;

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  async function toggleFilters() {
    if (filtersOpen) {
      filtersOpen = false;
      return;
    }

    filterPanelDir = getComputedStyle(filterTriggerEl).direction;
    filtersOpen = true;
    await tick();
    positionFilterPanel();
  }

  function positionFilterPanel() {
    if (!filtersOpen || !filterTriggerEl || !filterPanelEl) return;

    if (window.innerWidth <= 575.98) {
      filterPanelStyle = 'position:fixed;top:auto;right:8px;bottom:8px;left:8px;width:auto;max-width:none;';
      return;
    }

    const triggerRect = filterTriggerEl.getBoundingClientRect();
    const width = Math.min(filterPanelEl.offsetWidth, window.innerWidth - 16);
    const height = filterPanelEl.offsetHeight;
    const isRtl = filterPanelDir === 'rtl';
    const desiredLeft = isRtl ? triggerRect.right - width : triggerRect.left;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, desiredLeft));
    const belowTop = triggerRect.bottom + 6;
    const fitsBelow = belowTop + height <= window.innerHeight - 8;
    const top = fitsBelow
      ? belowTop
      : Math.max(8, triggerRect.top - height - 6);

    filterPanelStyle = `position:fixed;top:${top}px;right:auto;bottom:auto;left:${left}px;width:${width}px;`;
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

      if (!node.contains(event.target) && !filterPanelEl?.contains(event.target)) {
        filtersOpen = false;
      }
    }

    window.addEventListener('click', handleWindowClick, true);

    return {
      destroy() {
        window.removeEventListener('click', handleWindowClick, true);
      },
    };
  }
</script>

<svelte:window
  on:keydown={closeOnEscape}
  on:resize={positionFilterPanel}
  on:scroll|capture={positionFilterPanel} />

<section class="filter-toolbar">
  <div class="filter-toolbar-row">
    <div class="filter-search">
      {#if material}
        <span class="ms filter-search__icon" aria-hidden="true">search</span>
      {:else}
        <i class="bi bi-search filter-search__icon" aria-hidden="true"></i>
      {/if}

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
    </div>

    {#if $$slots.beforeFilters || visibleFilters.length}
      <div class="filter-tools" class:filter-tools--grouped={$$slots.beforeFilters}>
        {#if $$slots.beforeFilters}
          <slot name="beforeFilters" />
        {/if}

        {#if visibleFilters.length}
          <div class="filter-control" use:clickOutside>
        <button
          bind:this={filterTriggerEl}
          type="button"
          class="filter-toggle"
          class:filter-toggle--action={showFilterText}
          class:filter-toggle--active={filtersOpen || activeFilterCount > 0}
          aria-label={filterLabel}
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          title={filterLabel}
          on:click|stopPropagation={toggleFilters}>
          {#if showFilterText}
            <span class="filter-toggle__label">{filterLabel}</span>
          {:else if material}
            <span class="ms" aria-hidden="true">tune</span>
          {:else}
            <i class="bi bi-sliders2" aria-hidden="true"></i>
          {/if}

          {#if activeFilterCount > 0 && !showFilterText}
            <span class="filter-toggle__count">{activeFilterCount}</span>
          {/if}
        </button>

        {#if filtersOpen}
          <div
            bind:this={filterPanelEl}
            use:portal
            class="filter-panel"
            id={panelId}
            role="dialog"
            aria-label={filterLabel}
            dir={filterPanelDir}
            style={filterPanelStyle}
            on:click|stopPropagation>
            <header class="filter-panel__header">
              <strong class="filter-panel__title">{filterLabel}</strong>

              {#if showReset}
                <button
                  type="button"
                  class="filter-panel__reset"
                  disabled={activeFilterCount === 0}
                  on:click={handleReset}>{resetLabel}</button>
              {/if}
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
                        variant="stacked"
                        label={filter.label}
                        icon={filter.icon}
                        value={filter.value}
                        multiple={filter.multiple}
                        options={filter.options || []}
                        material={material}
                        on:change={(event) => handleFilterChange(filter, event.detail)} />
                    {/if}
                  </div>
                {/each}
              </div>
            </div>

            {#if showApply}
              <footer class="filter-panel__footer">
                <button type="button" class="filter-apply" on:click={closeFilters}>{applyLabel}</button>
              </footer>
            {/if}
          </div>
        {/if}
          </div>
        {/if}
      </div>
    {/if}

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
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  /* Search field — 30px tall on surface-2, exactly like the reference toolbar */

  .filter-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 1 auto;
    width: 220px;
    max-width: 100%;
    height: var(--index-toolbar-control-height, 30px);
    min-height: var(--index-toolbar-control-height, 30px);
    padding: 0 8px;
    overflow: visible;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface-2, #f8fafc);
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      background 0.16s ease;
  }

  .filter-search:hover {
    border-color: var(--z-border-strong, #dce6f8);
  }

  .filter-search:focus-within {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-surface, #ffffff);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .filter-search__icon {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 16px;
    pointer-events: none;
  }

  .filter-search__input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.3;
  }

  .filter-search__input::placeholder {
    color: var(--z-subtle, #94a3b8);
    opacity: 1;
  }

  .filter-search__input::-webkit-search-cancel-button {
    display: none;
  }

  /* Clear-search button */

  .search-clear {
    display: inline-grid;
    place-items: center;
    flex: 0 0 18px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--z-subtle, #94a3b8);
    font-size: 10px;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .search-clear:hover {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  /*
   * Quick filters and the filter trigger share one capsule, as in the
   * Accounts reference: 24px segments beside a 28px tune button.
   */
  .filter-tools {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .filter-tools--grouped {
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: var(--z-surface-3, #f1f5f9);
  }

  .filter-tools--grouped .filter-toggle {
    height: 28px;
    min-height: 28px;
    padding: 0 9px;
  }

  /* Filter trigger — its own 30px button with an active-count badge */

  .filter-control {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .filter-toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: auto;
    height: var(--index-toolbar-control-height, 30px);
    min-width: 32px;
    min-height: var(--index-toolbar-control-height, 30px);
    padding: 0 10px;
    border: 1px solid #ccd6f0;
    border-radius: var(--z-r-sm, 8px);
    background: #e4e9f7;
    color: #3d5ac8;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .filter-toggle:hover {
    border-color: #ccd6f0;
    background: #d9e1f5;
    color: #3d5ac8;
  }

  .filter-toggle:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .filter-toggle.filter-toggle--active {
    border-color: #ccd6f0;
    background: #e4e9f7;
    color: #3d5ac8;
  }

  .filter-toggle > .ms {
    font-size: 17px;
  }

  .filter-toggle__label {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .filter-toggle.filter-toggle--action {
    padding: 0 12px;
    border-color: transparent;
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  .filter-toggle.filter-toggle--action:hover {
    border-color: transparent;
    background: #245fcf;
    color: #ffffff;
  }

  .filter-toggle.filter-toggle--action.filter-toggle--active {
    border-color: transparent;
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
  }

  .filter-toggle__count {
    position: absolute;
    top: -5px;
    left: -5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    box-sizing: border-box;
    border: 2px solid var(--z-surface, #ffffff);
    border-radius: 8px;
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
  }
  /* Filter panel — 300px popover anchored under the trigger */

  .filter-panel {
    position: fixed;
    top: 36px;
    inset-inline-start: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: 300px;
    max-width: calc(100vw - 2rem);
    max-height: min(34rem, calc(100vh - 8rem));
    overflow: visible;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 11px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 18px 44px -14px rgba(11, 21, 48, 0.4);
    animation: filter-panel-enter 0.16s ease-out;
  }

  @keyframes filter-panel-enter {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Filter panel header */

  .filter-panel__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
  }

  .filter-panel__title {
    color: var(--z-ink, #0b1530);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
  }

  .filter-panel__reset {
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .filter-panel__reset:hover:not(:disabled) {
    background: var(--z-brand-soft, #e3ecff);
  }

  .filter-panel__reset:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Filter panel body — two-column field grid */

  .filter-panel__body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 9px 10px;
    overflow-y: auto;
  }

  /*
   * Styled through ::-webkit-scrollbar only: `scrollbar-width` / `scrollbar-color`
   * would hand the panel to Chromium's native painter and bring back the arrow
   * buttons at both ends of the bar.
   */
  .filter-panel__body::-webkit-scrollbar {
    width: 6px;
  }

  .filter-panel__body::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }

  .filter-panel__body::-webkit-scrollbar-track {
    background: transparent;
  }

  .filter-panel__body::-webkit-scrollbar-thumb {
    border-radius: 6px;
    background: var(--z-border, #e1e7f0);
  }

  .filter-panel__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px 8px;
  }

  .filter-field {
    position: relative;
    min-width: 0;
  }

  .filter-date {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .filter-date :global(.date-label) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.3;
  }

 


  .filter-panel__fields :global(.filter-select) {
    width: 100%;
    min-width: 0;
  }

  .filter-panel__fields :global(.filter-select.is-open) {
    position: relative;
    z-index: 1050;
  }

  /* Footer — single full-width primary action */

  .filter-panel__footer {
    display: flex;
    flex: 0 0 auto;
    padding: 8px 10px;
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 11px 11px;
    background: var(--z-surface-2, #f8fafc);
  }

  .filter-apply {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .filter-apply:hover {
    background: #245fcf;
  }

  .filter-apply:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  /* Actions slot */

  .filter-toolbar-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }

  @media (max-width: 767.98px) {
    .filter-search {
      flex: 1 1 160px;
      width: auto;
      min-width: 0;
    }

    .filter-panel {
      width: min(300px, calc(100vw - 1.5rem));
      max-width: none;
    }
  }

  @media (max-width: 575.98px) {
    .filter-toolbar-actions {
      width: 100%;
      justify-content: stretch;
    }

    .filter-panel {
      position: fixed;
      top: auto;
      right: 8px;
      bottom: 8px;
      left: 8px;
      width: auto;
      max-width: none;
      max-height: min(80vh, 36rem);
      border-radius: 11px;
      animation: filter-sheet-enter 0.2s ease-out;
    }

    @keyframes filter-sheet-enter {
      from {
        opacity: 0;
        transform: translateY(16px);
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
  }
</style>
