<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { t } from '../../i18n/i18n';
  import {
    filterSelectOptions,
    resolveKeyboardIndex,
    resolveKeyboardSelection,
    shouldShowFilterSearch,
  } from '../../utils/filterSearch.js';

  export let label = '';
  export let icon = '';
  export let value = '';
  export let options = [];
  export let compact = false;
  export let variant = 'default';
  export let multiple = false;
  /** `auto` (default) adds the search box to lists long enough to search, `true` always, `false` never. */
  export let searchable = 'auto';
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let open = false;
  let triggerEl;
  let menuEl;
  let menuStyle = '';
  let searchEl;
  let query = '';
  let activeIndex = -1;

  $: isOutline = variant === 'outline';
  $: selectedValues = Array.isArray(value) ? value : [];
  $: selectedOption = options.find((option) => String(option.value) === String(value));
  $: selectedOptions = multiple ? options.filter((option) => selectedValues.includes(option.value)) : [];
  $: selectedLabel = multiple
    ? selectedOptions.length
      ? `${selectedOptions.length} ${label}`
      : (isOutline ? '' : label)
    : selectedOption?.label ?? (isOutline ? '' : label);
  $: hasValue = multiple ? selectedValues.length > 0 : !!selectedOption;
  $: canSearch = shouldShowFilterSearch(options, searchable);
  $: selection = filterSelectOptions(options, query);
  $: visibleOptions = selection.visibleOptions;
  $: pinnedOptions = selection.pinnedOptions;
  $: queryText = selection.queryText;
  $: matchedOptions = selection.matchedOptions;

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  async function toggle() {
    if (disabled) return;
    if (open) { closeMenu(); return; }
    const rect = triggerEl.getBoundingClientRect();
    const width = Math.max(rect.width, 150);
    const maxHeight = Math.min(224, window.innerHeight * 0.45);
    const estimatedHeight = options.length * 36 + 12 + (canSearch ? 44 : 0);
    const openUp = window.innerHeight - rect.bottom < Math.min(maxHeight, estimatedHeight);
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    menuStyle = openUp
      ? `left:${left}px;width:${width}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;max-height:${maxHeight}px;`
      : `left:${left}px;width:${width}px;top:${rect.bottom + 5}px;bottom:auto;max-height:${maxHeight}px;`;
    resetSearch();
    open = true;

    if (canSearch) {
      await tick();
      searchEl?.focus();
    }
  }

  function closeMenu() {
    open = false;
    resetSearch();
    triggerEl?.focus();
  }

  function resetSearch() {
    query = '';
    activeIndex = -1;
  }

  function handleSearchInput(event) {
    query = event.currentTarget.value;
    activeIndex = -1;
  }

  function clearSearchInput() {
    resetSearch();
    searchEl?.focus();
  }

  function scrollActiveIntoView() {
    const nodes = menuEl?.querySelectorAll('.filter-select__option');
    nodes?.[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function handleSearchKeydown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visibleOptions.length) return;

      activeIndex = resolveKeyboardIndex({
        direction: event.key === 'ArrowDown' ? 1 : -1,
        visibleOptions,
        queryText,
        pinnedOptions,
        activeIndex,
      });
      scrollActiveIntoView();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const option = resolveKeyboardSelection({ visibleOptions, matchedOptions, queryText, activeIndex });
      if (option) selectOption(option.value);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  }

  function selectOption(optionValue) {
    if (!multiple) {
      open = false;
      resetSearch();
      dispatch('change', optionValue);
      return;
    }

    if (optionValue === 'all') {
      dispatch('change', []);
      return;
    }

    const nextValues = selectedValues.includes(optionValue)
      ? selectedValues.filter((item) => item !== optionValue)
      : [...selectedValues, optionValue];
    dispatch('change', nextValues);
  }

  function closeOnEscape(event) {
    if (event.key === 'Escape' && open) closeMenu();
  }

  function clickOutside(node) {
    function onClick(event) {
      if (!open) return;
      if (!node.contains(event.target) && !menuEl?.contains(event.target)) {
        open = false;
        resetSearch();
      }
    }

    window.addEventListener('click', onClick);
    return {
      destroy() {
        window.removeEventListener('click', onClick);
      }
    };
  }
</script>

<svelte:window on:keydown={closeOnEscape} />

<div
  class="filter-select"
  class:compact
  class:outline={isOutline}
  class:is-open={open}
  class:has-value={hasValue}
  use:clickOutside>
  {#if !compact && !isOutline}
    <span class="filter-select__label">
      {#if icon}<i class="bi {icon}"></i>{/if}
      {label}
    </span>
  {/if}

  <div class="filter-select__control">
    {#if isOutline && label}
      <span class="filter-select__notch" aria-hidden="true">
        {#if icon}<i class="bi {icon}"></i>{/if}
        {label}
      </span>
    {/if}

    <button
      bind:this={triggerEl}
      type="button"
      {disabled}
      class="filter-select__trigger"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={label || selectedLabel}
      on:click={toggle}>
      {#if icon && !isOutline}<i class="bi {icon}" aria-hidden="true"></i>{/if}
      <span class="filter-select__value">{selectedLabel}</span>
      <i class="bi bi-chevron-down filter-select__chevron" aria-hidden="true"></i>
    </button>

    {#if open}
      <div
        bind:this={menuEl}
        use:portal
        class="filter-select__menu"
        role="presentation"
        style={menuStyle}
        on:click|stopPropagation>
        {#if canSearch}
          <div class="filter-select__search">
            <i class="bi bi-search filter-select__search-icon" aria-hidden="true"></i>

            <input
              bind:this={searchEl}
              type="text"
              class="filter-select__search-input"
              placeholder={t('Search')}
              aria-label={t('Search')}
              autocomplete="off"
              spellcheck="false"
              bind:value={query}
              on:input={handleSearchInput}
              on:keydown={handleSearchKeydown} />

            {#if query}
              <button
                type="button"
                class="filter-select__search-clear"
                tabindex="-1"
                aria-label={t('Clear')}
                on:click={clearSearchInput}>
                <i class="bi bi-x-lg" aria-hidden="true"></i>
              </button>
            {/if}
          </div>
        {/if}

        <ul class="filter-select__options" role="listbox" aria-multiselectable={multiple ? 'true' : undefined}>
          {#each visibleOptions as option, index (option.value)}
            <li role="option" aria-selected={multiple ? selectedValues.includes(option.value) : String(option.value) === String(value)}>
              <button
                type="button"
                class="filter-select__option"
                class:active={multiple ? selectedValues.includes(option.value) : String(option.value) === String(value)}
                class:is-active={activeIndex >= 0 && index === activeIndex}
                on:mouseenter={() => (activeIndex = index)}
                on:click={() => selectOption(option.value)}>
                {#if multiple && option.value !== 'all'}
                  <i class="bi {selectedValues.includes(option.value) ? 'bi-check-square-fill' : 'bi-square'} filter-select__check" aria-hidden="true"></i>
                {/if}
                {option.label}
              </button>
            </li>
          {/each}

          {#if queryText && !matchedOptions.length}
            <li class="filter-select__empty">{t('No result')}</li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  .filter-select {
    display: grid;
    gap: 0.18rem;
    flex: 0 1 auto;
    min-width: 0;
    width: min(100%, 8.5rem);
    margin: 0;
    position: relative;
  }

  .filter-select.is-open {
    z-index: 40;
  }

  .filter-select__label {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    color: #64748b;
    font-size: var(--app-font-xs, 0.68rem);
    font-weight: 800;
    white-space: nowrap;
  }

  :global(html.dark) .filter-select__label {
    color: var(--erp-muted);
  }

  .filter-select__control {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .filter-select__trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    min-height: var(--control-height-sm);
    padding: 0.35rem 0.55rem;
    border: 1px solid #d6e0ed;
    border-radius: 8px;
    background: #ffffff;
    color: #64748b;
    font-size: 0.8rem;
    font-weight: 500;
    line-height: 1.2;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  :global(html.dark) .filter-select__trigger {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text-soft);
  }

  .filter-select__trigger:hover {
    border-color: #d6e0ed;
    background: #f8fbff;
    color: #334155;
  }

  :global(html.dark) .filter-select__trigger:hover {
    border-color: var(--erp-border-strong);
    background: #1e293b;
    color: var(--erp-text);
  }

  .filter-select__trigger:focus-visible {
    outline: none;
    border-color: #d6e0ed;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  .filter-select__trigger:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  :global(html.dark) .filter-select__trigger:focus-visible {
    border-color: #60a5fa;
    box-shadow: 0 0 0 0.15rem rgba(96, 165, 250, 0.16);
  }

  .filter-select__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: inherit;
  }

  .filter-select__chevron {
    flex: 0 0 auto;
    font-size: 0.6rem;
    opacity: 0.6;
    transition: transform 0.16s ease;
  }

  .filter-select.is-open .filter-select__chevron {
    transform: rotate(180deg);
  }

  .filter-select__menu {
    position: fixed;
    z-index: 100000;
    max-height: 14rem;
    margin: 0;
    padding: 0.35rem;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.12);
  }

  :global(html.dark) .filter-select__menu {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.36);
  }

  .filter-select__menu::-webkit-scrollbar {
    display: none;
  }

  /* In-menu search: sticky so it stays reachable while the list scrolls */

  .filter-select__search {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0 0 0.3rem;
    padding: 0.3rem 0.45rem;
    border: 1px solid #dbe4f0;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  :global(html.dark) .filter-select__search {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
  }

  .filter-select__search-icon {
    flex: 0 0 auto;
    color: #94a3b8;
    font-size: 0.7rem;
  }

  .filter-select__search-input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 1.55rem;
    margin: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #0f172a;
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 600;
  }

  :global(html.dark) .filter-select__search-input {
    color: var(--erp-text);
  }

  .filter-select__search-input::placeholder {
    color: #9aa8b9;
    font-weight: 500;
  }

  .filter-select__search-clear {
    display: inline-grid;
    place-items: center;
    flex: 0 0 1.1rem;
    width: 1.1rem;
    height: 1.1rem;
    padding: 0;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: #94a3b8;
    font-size: 0.6rem;
    cursor: pointer;
  }

  .filter-select__search-clear:hover {
    background: #f1f5f9;
    color: #475569;
  }

  :global(html.dark) .filter-select__search-clear:hover {
    background: rgba(148, 163, 184, 0.14);
    color: var(--erp-text);
  }

  .filter-select__options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .filter-select__option.is-active {
    background: rgba(59, 130, 246, 0.08);
    color: #0f6efd;
  }

  :global(html.dark) .filter-select__option.is-active {
    background: rgba(96, 165, 250, 0.16);
    color: #bfdbfe;
  }

  .filter-select__empty {
    padding: 0.6rem 0.5rem;
    color: #94a3b8;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  :global(html.dark) .filter-select__empty {
    color: var(--erp-muted);
  }

  .filter-select__option {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #0f172a;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.42rem 0.6rem;
    text-align: start;
    cursor: pointer;
  }

  :global(html.dark) .filter-select__option {
    color: var(--erp-text);
  }

  .filter-select__option:hover {
    background: rgba(59, 130, 246, 0.06);
    color: #0f6efd;
  }

  :global(html.dark) .filter-select__option:hover {
    background: rgba(96, 165, 250, 0.12);
    color: #93c5fd;
  }

  .filter-select__option.active {
    background: rgba(59, 130, 246, 0.1);
    color: #0f6efd;
  }

  :global(html.dark) .filter-select__option.active {
    background: rgba(96, 165, 250, 0.18);
    color: #bfdbfe;
  }

  .compact {
    width: min(100%, 7.5rem);
  }

  /* MDB-style outline / floating notch label */
  .filter-select.outline {
    width: 100%;
    gap: 0;
    padding-top: 0.2rem;
  }

  .filter-select__notch {
    position: absolute;
    top: 0;
    inset-inline-start: 0.7rem;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    max-width: calc(100% - 1.4rem);
    padding: 0 0.3rem;
    transform: translateY(-50%);
    background: #ffffff;
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  :global(html.dark) .filter-select__notch {
    background: var(--erp-surface);
    color: var(--erp-muted);
  }

  .filter-select__notch i {
    font-size: 0.7rem;
  }

  .filter-select.outline .filter-select__trigger {
    min-height: var(--control-height-sm, 2.125rem);
    padding: 0.45rem 0.75rem;
    border-radius: 0.5rem;
    border-color: #d6e0ed;
    color: #0f172a;
    font-weight: 600;
  }

  :global(html.dark) .filter-select.outline .filter-select__trigger {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    color: var(--erp-text);
  }

  .filter-select.outline.has-value .filter-select__trigger,
  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:hover,
  .filter-select.outline .filter-select__trigger:focus-visible {
    border-color: #d6e0ed;
  }

  :global(html.dark) .filter-select.outline.has-value .filter-select__trigger,
  :global(html.dark) .filter-select.outline.is-open .filter-select__trigger,
  :global(html.dark) .filter-select.outline .filter-select__trigger:hover,
  :global(html.dark) .filter-select.outline .filter-select__trigger:focus-visible {
    border-color: var(--erp-border-strong);
  }

  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:focus-visible {
    box-shadow: 0 0 0 0.12rem rgba(37, 99, 235, 0.08);
  }

  :global(html.dark) .filter-select.outline.is-open .filter-select__trigger,
  :global(html.dark) .filter-select.outline .filter-select__trigger:focus-visible {
    box-shadow: 0 0 0 0.12rem rgba(96, 165, 250, 0.14);
  }

  .filter-select.outline.is-open .filter-select__notch,
  .filter-select.outline:focus-within .filter-select__notch,
  .filter-select.outline.has-value .filter-select__notch {
    color: #0f6efd;
  }

  :global(html.dark) .filter-select.outline.is-open .filter-select__notch,
  :global(html.dark) .filter-select.outline:focus-within .filter-select__notch,
  :global(html.dark) .filter-select.outline.has-value .filter-select__notch {
    color: #93c5fd;
  }

  .filter-select.outline .filter-select__value:empty::before {
    content: '\00a0';
  }
</style>
