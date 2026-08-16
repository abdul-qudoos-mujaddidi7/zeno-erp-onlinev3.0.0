<script>
  import { createEventDispatcher } from 'svelte';

  export let value = 10;
  export let label = '';
  export let suffix = '';
  export let options = [5, 10, 20, 50, 100, 250];

  const dispatch = createEventDispatcher();
</script>

<label class="per-page-select">
  {#if label}
    <span><i class="bi bi-list-ol"></i>{label}</span>
  {/if}
  <select class="form-select" {value} on:change={(e) => dispatch('change', e.currentTarget.value)}>
    {#each options as option}
      <option value={option}>{option} {suffix}</option>
    {/each}
  </select>
</label>

<style>
  .per-page-select {
    display: grid;
    gap: 0.18rem;
    flex: 0 0 118px;
    margin: 0;
  }

  .per-page-select span {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    color: #64748b;
    font-size: 0.64rem;
    font-weight: 800;
    white-space: nowrap;
  }

  :global(html.dark) .per-page-select span {
    color: var(--erp-muted);
  }

  .per-page-select :global(select) {
    min-height: 34px;
    border: 1px solid #dbe7f3;
    border-radius: 10px;
    background-color: #f8fafc;
    color: #0f172a;
    font-size: 0.78rem;
  }

  :global(html.dark) .per-page-select :global(select) {
    border-color: var(--erp-border);
    background-color: var(--erp-surface-soft);
    color: var(--erp-text);
  }

  .per-page-select :global(select:focus) {
    border-color: #93c5fd;
    box-shadow: 0 0 0 0.15rem rgba(37, 99, 235, 0.1);
  }

  :global(html.dark) .per-page-select :global(select:focus) {
    border-color: #60a5fa;
    box-shadow: 0 0 0 0.15rem rgba(96, 165, 250, 0.16);
  }
</style>
