<script>
  import { createEventDispatcher } from 'svelte';
  import SearchInput from './SearchInput.svelte';
  import FilterSelect from './FilterSelect.svelte';
  import PerPageSelect from './PerPageSelect.svelte';

  export let searchValue = '';
  export let searchPlaceholder = '';
  export let filters = [];
  export let actions = [];
  export let perPage = 10;
  export let perPageLabel = '';
  export let perPageOptions = [5, 10, 20, 50, 100, 250];
  export let perPageSuffix = '';
  export let compact = true;
  export let showPerPage = true;

  const dispatch = createEventDispatcher();

  $: primaryActions = actions.filter((action) => action.placement !== 'filters' && action.visible !== false);
  $: secondaryActions = actions.filter((action) => action.placement === 'filters' && action.visible !== false);
  $: visibleFilters = filters.filter((filter) => filter.visible !== false);

  function runAction(action) {
    if (action?.event) {
      dispatch(action.event, action);
    }
    dispatch('action', action);
  }
</script>

<section class="page-toolbar" class:compact>
  <div class="toolbar-row">
    <SearchInput
      value={searchValue}
      placeholder={searchPlaceholder}
      on:input={(e) => dispatch('searchChange', e.detail)} />

    {#each visibleFilters as filter}
      <FilterSelect
        label={filter.label}
        icon={filter.icon}
        value={filter.value}
        options={filter.options || []}
        compact={compact}
        on:change={(e) => dispatch('filterChange', { key: filter.key, value: e.detail })} />
    {/each}

    {#if showPerPage}
      <PerPageSelect
        value={perPage}
        label={perPageLabel}
        suffix={perPageSuffix}
        options={perPageOptions}
        on:change={(e) => dispatch('perPageChange', e.detail)} />
    {/if}

    {#if primaryActions.length}
      <div class="toolbar-actions-primary">
        {#each primaryActions as action}
          <button
            class="btn toolbar-action {action.variant ? `btn-${action.variant}` : 'btn-primary'} {action.class || ''}"
            disabled={action.disabled}
            title={action.title || action.label}
            on:click={() => runAction(action)}>
            {#if action.loading}
              <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            {:else if action.icon}
              <i class="bi {action.icon}"></i>
            {/if}
            <span>{action.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if secondaryActions.length}
    <div class="toolbar-secondary">
      {#each secondaryActions as action}
        <button
          class="btn toolbar-secondary-action {action.variant ? `btn-${action.variant}` : 'btn-secondary'} {action.class || ''}"
          disabled={action.disabled}
          title={action.title || action.label}
          on:click={() => runAction(action)}>
          {#if action.loading}
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          {:else if action.icon}
            <i class="bi {action.icon}"></i>
          {/if}
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-toolbar {
    display: grid;
    gap: 0.4rem;
    padding: clamp(0.45rem, 0.7vw, 0.55rem) clamp(0.5rem, 0.8vw, 0.65rem);
    border: 1px solid #e5edf6;
    border-radius: var(--card-radius, 0.875rem);
    background: #fff;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.035);
    min-width: 0;
  }

  :global(html.dark) .page-toolbar {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow: var(--erp-shadow-sm);
  }

  .toolbar-row {
    display: flex;
    align-items: end;
    flex-wrap: wrap;
    gap: 0.45rem;
    min-width: 0;
  }

  .toolbar-actions-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 0 0 auto;
    margin-inline-start: auto;
    flex-wrap: wrap;
    min-width: 0;
  }

  .toolbar-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex: 0 0 auto;
    min-height: var(--control-height-sm, 2.125rem);
    padding-inline: 0.7rem;
    border: none;
    border-radius: 10px;
    box-shadow: 0 6px 12px rgba(37, 99, 235, 0.14);
    font-size: var(--app-font-sm, 0.78rem);
    font-weight: 800;
    white-space: nowrap;
  }

  .toolbar-secondary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .toolbar-secondary-action {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: var(--control-height-sm, 2rem);
    padding-inline: 0.6rem;
    border-radius: 10px;
    font-size: var(--app-font-xs, 0.74rem);
    font-weight: 800;
  }

  @media (max-width: 767.98px) {
    .toolbar-row {
      align-items: stretch;
      flex-direction: column;
    }

    .toolbar-actions-primary {
      margin-inline-start: 0;
      justify-content: center;
      width: 100%;
    }

    .toolbar-action {
      justify-content: center;
      width: 100%;
    }

    .toolbar-secondary-action {
      justify-content: center;
      width: 100%;
    }
  }
</style>
