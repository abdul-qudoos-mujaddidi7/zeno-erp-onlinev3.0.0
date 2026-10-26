<script>
  export let label = '';
  export let value = '';
  export let icon = 'bi-grid';
  export let tone = 'blue';
  /** Per-currency breakdown rendered as separate lines: [{ v, sym }]. */
  export let lines = [];
  export let sub = '';
</script>

<div class="summary-card {tone}">
  <div class="summary-head">
    <span class="summary-icon"><i class="bi {icon}" aria-hidden="true"></i></span>
    <span class="summary-label">{label}</span>
  </div>

  {#if lines.length}
    <div class="summary-lines">
      {#each lines as line}
        <span class="summary-line">
          <b>{line.v}</b>
          {#if line.sym}<span class="summary-sym">{line.sym}</span>{/if}
        </span>
      {/each}
    </div>
  {:else}
    <div class="summary-value">
      <slot>{@html value}</slot>
    </div>
  {/if}

  {#if sub}
    <div class="summary-sub">{sub}</div>
  {/if}
</div>

<style>
  /* Zeno KPI tile — measured from the reference report strip:
     8/10 padding, radius 11, surface-2 fill, 11px/700 label, 14px value. */
  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
    padding: 8px 10px;
    border: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 11px;
    background: var(--z-surface-2, #f8fafc);
    box-shadow: none;
  }

  .summary-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .summary-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-size: 11px;
    line-height: 1;
  }

  .summary-label {
    min-width: 0;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-value {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', 'Vazirmatn', sans-serif);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-value :global(b) {
    font-weight: 800;
  }

  .summary-value :global(small) {
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 700;
  }

  .summary-lines {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    min-width: 0;
  }

  .summary-line {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', 'Vazirmatn', sans-serif);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .summary-line b {
    font-size: 13.5px;
    font-weight: 800;
    line-height: 1.3;
  }

  .summary-sym {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 16px;
    padding: 0 3px;
    border-radius: 4px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    font-size: 9.5px;
    font-weight: 800;
  }

  .summary-sub {
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .green .summary-icon {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .red .summary-icon {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .amber .summary-icon {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .purple .summary-icon {
    background: #f3e8ff;
    color: #7c3aed;
  }

  .cyan .summary-icon {
    background: #cffafe;
    color: #0e7490;
  }
</style>
