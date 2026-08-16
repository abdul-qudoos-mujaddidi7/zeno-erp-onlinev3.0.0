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
  .erp-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.22rem;
    min-height: 22px;
    padding: 0.18rem 0.48rem;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  .erp-badge.ltr {
    direction: ltr;
  }

  .erp-badge.stacked {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.14rem;
    line-height: 1.15;
  }

  .erp-badge.stacked :global(br) { display: none; }
  .erp-badge.stacked :global(small) { display: block; margin: 0; }

  .neutral {
    color: #475569;
  }

  .ghost {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }

  .positive {
    color: #047857;
  }

  .negative {
    color: #b91c1c;
  }

  .warning {
    color: #92400e;
  }

  .info {
    color: #1d4ed8;
  }
</style>
