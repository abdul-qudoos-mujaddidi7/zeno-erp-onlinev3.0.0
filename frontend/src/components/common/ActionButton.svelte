<script>
  import { createEventDispatcher } from 'svelte';

  export let label = '';
  export let icon = '';
  export let variant = 'primary';
  export let tone = 'default';
  export let disabled = false;
  export let loading = false;
  export let title = '';
  export let type = 'button';
  export let compact = false;
  export let extraClass = '';

  const dispatch = createEventDispatcher();
</script>

<button
  class="action-btn {variant} tone-{tone} {extraClass}"
  class:compact
  class:icon-only={variant === 'icon' && !label}
  {disabled}
  {type}
  title={title || label}
  aria-label={title || label}
  on:click={() => dispatch('click')}>
  {#if loading}
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
  {:else if icon}
    <i class="bi {icon}"></i>
  {/if}
  {#if label && variant !== 'icon'}
    <span>{label}</span>
  {/if}
</button>

<style>
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: var(--button-height-sm, 2rem);
    padding: 0.25rem 0.55rem;
    border: 1px solid transparent;
    border-radius: var(--control-radius, 0.4rem);
    font-size: var(--control-font, 0.78rem);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .action-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .primary {
    color: #ffffff;
    background: #0f6efd;
    border-color: #0f6efd;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
  }

  .primary:hover:not(:disabled) {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }

  .secondary {
    color: #334155;
    background: #ffffff;
    border-color: #e5e7eb;
  }

  :global(html.dark) .secondary {
    color: var(--erp-text);
    background: var(--erp-surface-soft);
    border-color: var(--erp-border);
  }

  .secondary:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  :global(html.dark) .secondary:hover:not(:disabled) {
    background: #1e293b;
    border-color: var(--erp-border-strong);
  }

  .ghost {
    color: #64748b;
    background: transparent;
    border-color: transparent;
  }

  :global(html.dark) .ghost {
    color: var(--erp-text-soft);
  }

  .ghost:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
  }

  :global(html.dark) .ghost:hover:not(:disabled) {
    background: rgba(148, 163, 184, 0.12);
    color: var(--erp-text);
  }

  .icon {
    width: var(--control-height-sm, 2.125rem);
    min-height: var(--button-height-sm, var(--control-height-sm));
    padding: 0;
    border-radius: 10px;
    background: #ffffff;
    border-color: #e5e7eb;
    color: #64748b;
  }

  :global(html.dark) .icon {
    background: var(--erp-surface-soft);
    border-color: var(--erp-border);
    color: var(--erp-text-soft);
  }

  .icon.tone-view {
    color: #0f6efd;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  :global(html.dark) .icon.tone-view {
    color: #93c5fd;
    background: rgba(96, 165, 250, 0.14);
    border-color: rgba(96, 165, 250, 0.38);
  }

  .icon.tone-edit {
    color: #475569;
    background: #f8fafc;
    border-color: #e5e7eb;
  }

  :global(html.dark) .icon.tone-edit {
    color: var(--erp-text-soft);
    background: var(--erp-surface-soft);
    border-color: var(--erp-border);
  }

  .icon.tone-danger {
    color: #dc2626;
    background: #fef2f2;
    border-color: #fecaca;
  }

  :global(html.dark) .icon.tone-danger {
    color: #fca5a5;
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.36);
  }

  .icon.tone-muted {
    color: #64748b;
    background: #ffffff;
    border-color: #e5e7eb;
  }

  :global(html.dark) .icon.tone-muted {
    color: var(--erp-muted);
    background: var(--erp-surface-soft);
    border-color: var(--erp-border);
  }

  .compact {
    min-height: var(--button-height-sm, var(--control-height-sm));
    padding: 0.22rem 0.5rem;
    font-size: var(--app-font-sm, 0.74rem);
  }

  .icon-only {
    width: var(--control-height-sm, 2.125rem);
    padding: 0;
  }
</style>
