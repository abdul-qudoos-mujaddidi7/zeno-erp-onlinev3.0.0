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
  /** Draw the trigger caret and dropdown search glyph with Material Symbols
      (the reference journal filter panel). */
  export let material = false;

  const dispatch = createEventDispatcher();

  let open = false;
  let triggerEl;
  let menuEl;
  let menuStyle = '';
  let menuDir = 'ltr';
  let searchEl;
  let query = '';
  let activeIndex = -1;

  $: isOutline = variant === 'outline';
  /** `stacked` keeps the plain label above the control (filter-panel layout). */
  $: isStacked = variant === 'stacked';
  $: selectedValues = Array.isArray(value) ? value : [];
  $: selectedOption = options.find((option) => String(option.value) === String(value));
  $: selectedOptions = multiple ? options.filter((option) => selectedValues.includes(option.value)) : [];
  $: selectedLabel = multiple
    ? selectedOptions.length
      ? `${selectedOptions.length} ${label}`
      : (isOutline || isStacked ? '' : label)
    : selectedOption?.label ?? (isOutline || isStacked ? '' : label);
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
    menuDir = getComputedStyle(triggerEl).direction;
    const width = Math.max(rect.width, 150);
    const maxHeight = Math.min(224, window.innerHeight * 0.45);
    const estimatedHeight = options.length * 36 + 12 + (canSearch ? 44 : 0);
    const openUp = window.innerHeight - rect.bottom < Math.min(maxHeight, estimatedHeight);
    const desiredLeft = menuDir === 'rtl' ? rect.right - width : rect.left;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, desiredLeft));
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
  class:stacked={isStacked}
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
      {#if icon && !isOutline && !material}<i class="bi {icon}" aria-hidden="true"></i>{/if}
      <span class="filter-select__value">{selectedLabel}</span>
      {#if material}
        <span class="ms filter-select__caret" aria-hidden="true">expand_more</span>
      {:else}
        <i class="bi bi-chevron-down filter-select__chevron" aria-hidden="true"></i>
      {/if}
    </button>

    {#if open}
      <div
        bind:this={menuEl}
        use:portal
        class="filter-select__menu"
        role="presentation"
        dir={menuDir}
        style={menuStyle}
        on:click|stopPropagation>
        {#if canSearch}
          <div class="filter-select__search">
            {#if material}
              <span class="ms filter-select__search-ms" aria-hidden="true">search</span>
            {:else}
              <i class="bi bi-search filter-select__search-icon" aria-hidden="true"></i>
            {/if}

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
    gap: 3px;
    flex: 0 1 auto;
    min-width: 0;
    width: min(100%, 8.5rem);
    margin: 0;
    position: relative;
  }

  .filter-select.is-open {
    z-index: 40;
  }

  .filter-select.stacked {
    width: 100%;
    min-width: 0;
    gap: 3px;
  }

  .filter-select.stacked .filter-select__label {
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 700;
  }

  .filter-select.stacked .filter-select__trigger {
    font-weight: 600;
  }

  .filter-select.stacked .filter-select__label i {
    font-size: 11px;
    color: var(--z-subtle, #94a3b8);
  }

  .filter-select__label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .filter-select__control {
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .filter-select__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    width: 100%;
    height: var(--fs-h, 30px);
    min-height: var(--fs-h, 30px);
    padding: 0 8px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 700;
    line-height: 1.2;
    text-align: start;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .filter-select__trigger:hover {
    border-color: var(--z-border-strong, #dce6f8);
    background: var(--z-surface-2, #f8fafc);
  }

  .filter-select__trigger:focus-visible {
    outline: none;
    border-color: var(--z-brand-300, #93b7f7);
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .filter-select.is-open .filter-select__trigger {
    border-color: var(--z-brand-300, #93b7f7);
  }

  .filter-select__trigger:disabled {
    opacity: 0.55;
    cursor: not-allowed;
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
    color: var(--z-muted, #64748b);
    font-size: 11px;
    opacity: 0.9;
    transition: transform 0.16s ease;
  }

  .filter-select.is-open .filter-select__chevron {
    transform: rotate(180deg);
  }

  /* Reference expand_more: 17px, muted, upright in both states. */
  .filter-select__caret {
    flex: 0 0 auto;
    color: var(--z-muted, #64748b);
    font-size: 17px;
  }

  .filter-select__menu {
    position: fixed;
    z-index: 100000;
    max-height: 13.75rem;
    margin: 0;
    padding: 3px;
    list-style: none;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 9px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 14px 34px -12px rgba(11, 21, 48, 0.35);
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
    gap: 4px;
    height: 28px;
    margin: 0 0 3px;
    padding: 0 6px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 6px;
    background: var(--z-surface-2, #f8fafc);
  }

  .filter-select__search-icon {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 11px;
  }

  .filter-select__search-ms {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 15px;
  }

  .filter-select__search-input {
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
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 600;
  }

  .filter-select__search-input::placeholder {
    color: var(--z-subtle, #94a3b8);
    font-weight: 500;
  }

  .filter-select__search-clear {
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
  }

  .filter-select__search-clear:hover {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  .filter-select__options {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .filter-select__option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 600;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
  }

  .filter-select__option:hover {
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-link, #2f6fed);
  }

  .filter-select__option.is-active {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-link, #2f6fed);
  }

  .filter-select__option.active {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-weight: 700;
  }

  .filter-select__check {
    flex: 0 0 auto;
    font-size: 12px;
  }

  .filter-select__empty {
    padding: 8px;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    font-weight: 500;
    text-align: center;
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
    gap: 4px;
    max-width: calc(100% - 1.4rem);
    padding: 0 5px;
    transform: translateY(-50%);
    background: var(--z-surface, #ffffff);
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .filter-select__notch i {
    font-size: 11px;
  }

  .filter-select.outline .filter-select__trigger {
    height: 36px;
    min-height: 36px;
    padding: 0 10px;
    border-radius: var(--z-r-sm, 8px);
    border-color: var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #0b1530);
    font-weight: 700;
  }

  .filter-select.outline.has-value .filter-select__trigger,
  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:hover,
  .filter-select.outline .filter-select__trigger:focus-visible {
    border-color: var(--z-brand-300, #93b7f7);
  }

  .filter-select.outline.is-open .filter-select__trigger,
  .filter-select.outline .filter-select__trigger:focus-visible {
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .filter-select.outline.is-open .filter-select__notch,
  .filter-select.outline:focus-within .filter-select__notch,
  .filter-select.outline.has-value .filter-select__notch {
    color: var(--z-link, #2f6fed);
  }

  .filter-select.outline .filter-select__value:empty::before {
    content: '\00a0';
  }

  .filter-select.stacked .filter-select__value:empty::before {
    content: '—';
    color: var(--z-subtle, #94a3b8);
  }
</style>
