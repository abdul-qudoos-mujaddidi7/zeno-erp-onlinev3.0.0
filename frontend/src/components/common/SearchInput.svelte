<script>
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let placeholder = '';
  export let id = '';

  const dispatch = createEventDispatcher();
</script>

<div class="search-input">
  <i class="bi bi-search"></i>
  <input
    type="text"
    class="form-control"
    {id}
    {placeholder}
    {value}
    on:input={(e) => dispatch('input', e.currentTarget.value)} />
</div>

<style>
  .search-input {
    position: relative;
    flex: 1 1 min(13.75rem, 100%);
    min-width: 0;
  }

  .search-input i {
    position: absolute;
    top: 50%;
    inset-inline-start: 0.65rem;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: var(--app-font-sm, 0.82rem);
    pointer-events: none;
  }

  :global(html.dark) .search-input i {
    color: var(--erp-muted);
  }

  .search-input :global(input) {
    height: var(--control-height-sm, 2.125rem);
    min-height: var(--control-height-sm, 2.125rem);
    padding-inline-start: 2rem;
    border: 1px solid #dbe7f3;
    border-radius: var(--control-radius, 0.625rem);
    background: #f8fafc;
    font-size: var(--control-font, 0.8rem);
  }

  :global(html.dark) .search-input :global(input) {
    border-color: var(--erp-border);
    background: var(--erp-surface-soft);
    color: var(--erp-text);
  }

  .search-input :global(input:focus) {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  :global(html.dark) .search-input :global(input:focus) {
    border-color: #60a5fa;
    box-shadow: 0 0 0 0.15rem rgba(96, 165, 250, 0.16);
  }
</style>
