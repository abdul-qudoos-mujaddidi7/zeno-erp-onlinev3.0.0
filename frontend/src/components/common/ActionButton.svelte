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
  /** Toggle state for view switches (balance cards, density…) — mirrors the reference `.on` button. */
  export let pressed = false;
  /** Use the Journal Material Symbols throughout; set `bootstrap` only when
      a caller specifically requires a Bootstrap glyph. */
  export let iconSet = 'material';

  const dispatch = createEventDispatcher();
  const materialIconNames = {
    'bi-plus-lg': 'add',
    'bi-printer': 'print',
    'bi-printer-fill': 'print',
    'bi-arrow-clockwise': 'refresh',
    'bi-bar-chart': 'bar_chart',
    'bi-clock-history': 'history',
    'bi-pencil': 'edit',
    'bi-lock': 'lock',
    'bi-clipboard-data': 'assignment',
    'bi-unlock': 'lock_open',
    'bi-check-lg': 'check',
    'bi-eye': 'visibility',
    'bi-wallet2': 'account_balance_wallet',
    'bi-calculator': 'calculate',
    'bi-archive': 'archive',
    'bi-box-arrow-in-up': 'move_to_inbox',
    'bi-box-seam': 'inventory_2',
    'bi-arrow-counterclockwise': 'undo',
    'bi-file-earmark': 'description',
    'bi-file-pdf-fill': 'picture_as_pdf',
    'bi-arrow-left': 'arrow_back',
    'bi-check2-circle': 'check_circle',
    'bi-person-plus': 'person_add',
  };

  $: useMaterialIcon = iconSet === 'material';
  $: renderedIcon = materialIconNames[icon] || icon;
</script>

<button
  class="action-btn {variant} tone-{tone} {extraClass}"
  class:compact
  class:is-pressed={pressed}
  class:icon-only={variant === 'icon' && !label}
  aria-pressed={pressed ? 'true' : undefined}
  {disabled}
  {type}
  title={title || label}
  aria-label={title || label}
  on:click={() => dispatch('click')}>
  {#if loading}
    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
  {:else if icon}
    {#if useMaterialIcon}
      <span class="ms" aria-hidden="true">{renderedIcon}</span>
    {:else}
      <i class="bi {icon}"></i>
    {/if}
  {/if}
  {#if label && variant !== 'icon'}
    <span>{label}</span>
  {/if}
</button>

<style>
  /* Zeno toolbar button: 30px tall, 8px radius, 12px/700.
     Pages may shrink it by redefining --ab-h where buttons live in dense rows. */
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 0 0 auto;
    height: var(--ab-h, 30px);
    min-height: var(--ab-h, 30px);
    padding: 0 10px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface, #fff);
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: var(--z-fs-base, 12px);
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.14s ease,
      border-color 0.14s ease,
      color 0.14s ease,
      box-shadow 0.14s ease;
  }

  .action-btn > i {
    font-size: 15px;
    line-height: 1;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--z-surface-2, #f8fafc);
    border-color: var(--z-border-strong, #dce6f8);
  }

  .action-btn:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .action-btn.is-pressed {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .action-btn.is-pressed > i {
    color: var(--z-link, #2f6fed);
  }

  .action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .primary {
    padding: 0 12px;
    border-color: transparent;
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
  }

  .primary > i {
    font-size: 17px;
  }

  .action-btn > .ms {
    font-size: 16px;
  }

  .primary > .ms {
    font-size: 17px;
  }

  .primary:hover:not(:disabled) {
    background: #245fcf;
    border-color: transparent;
    color: #ffffff;
  }

  .secondary {
    color: var(--z-ink, #0b1530);
    background: var(--z-surface, #fff);
    border-color: var(--z-border, #e1e7f0);
  }

  .secondary:hover:not(:disabled) {
    background: var(--z-surface-3, #f1f5f9);
    border-color: var(--z-border-strong, #dce6f8);
  }

  .secondary > i {
    color: var(--z-muted, #64748b);
  }

  .ghost {
    color: var(--z-muted, #64748b);
    background: transparent;
    border-color: transparent;
  }

  .ghost:hover:not(:disabled) {
    background: var(--z-surface-2, #f8fafc);
    border-color: var(--z-border-soft, #eef2f7);
    color: var(--z-ink, #0b1530);
  }

  .icon {
    width: var(--ab-h, 30px);
    height: var(--ab-h, 30px);
    min-height: var(--ab-h, 30px);
    padding: 0;
    border-radius: var(--z-r-sm, 8px);
    background: transparent;
    border-color: transparent;
    color: var(--z-muted, #64748b);
  }

  .icon > i {
    font-size: 16px;
  }

  .icon:hover:not(:disabled) {
    background: var(--z-surface-3, #f1f5f9);
    border-color: transparent;
    color: var(--z-ink, #0b1530);
  }

  .icon.tone-view {
    color: var(--z-link, #2f6fed);
  }

  .icon.tone-view:hover:not(:disabled) {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .icon.tone-edit {
    color: var(--z-text, #475569);
  }

  .icon.tone-edit:hover:not(:disabled) {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  .icon.tone-danger {
    color: var(--z-debit, #dc2626);
  }

  .icon.tone-danger:hover:not(:disabled) {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .icon.tone-muted {
    color: var(--z-muted, #64748b);
  }

  .compact {
    padding: 0 8px;
    font-size: var(--z-fs-sm, 11.5px);
  }

  .icon-only {
    width: var(--ab-h, 30px);
    padding: 0;
  }
</style>
