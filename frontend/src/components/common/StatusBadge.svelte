<script>
  export let tone = 'neutral';
  export let ltr = false;
  export let ghost = false;
  export let stacked = false;
</script>

<span class="erp-badge {tone}" class:ghost class:ltr class:stacked>
  <slot />
</span>

<style>
  /* Zeno status chip: 20px tall, pill radius, 10.5px/700 on a soft tint. */
  .erp-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 20px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--z-r-pill, 999px);
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.15;
    white-space: nowrap;
    vertical-align: middle;
  }

  .erp-badge.ltr {
    direction: ltr;
  }

  .erp-badge.stacked {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding-block: 3px;
  }

  .erp-badge.stacked :global(br) {
    display: none;
  }

  .erp-badge.stacked :global(small) {
    display: block;
    margin: 0;
    font-size: 9.5px;
    font-weight: 600;
    opacity: 0.85;
  }

  .neutral {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
  }

  .positive {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .negative {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .warning {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .info {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .ghost {
    padding-inline: 0;
    border-color: transparent !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }
</style>
