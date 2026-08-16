<script>
  export let periods = [];
  export let labels = {};
  export let activePeriod = '';
  export let onSelect = () => {};
</script>

<div class="erp-period-filter" role="tablist">
  {#each periods as period}
    <button
      type="button"
      class:active={activePeriod === period}
      on:click={() => onSelect(period)}
      role="tab"
      aria-selected={activePeriod === period}
      tabindex={activePeriod === period ? 0 : -1}>
      <i class="bi {period === 'today' ? 'bi-calendar-day' : period.includes('week') ? 'bi-calendar-week' : 'bi-calendar3'}"></i>
      <span>{labels[period]}</span>
    </button>
  {/each}
</div>
<style>
  .erp-period-filter {
    width: fit-content;
    max-width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    padding: 0.28rem;
    border: 1px solid #e1e7ef;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 6px 18px rgba(21, 32, 51, 0.035);
  }

  .erp-period-filter button {
    display: inline-flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.5rem 0.7rem;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 800;
    transition:
      background 0.18s ease,
      color 0.18s ease;
  }

  .erp-period-filter button:hover {
    background: #f2f5f9;
    color: #2f6fed;
  }

  .erp-period-filter button.active {
    background: #2f6fed;
    color: #fff;
    box-shadow: 0 4px 10px rgba(23, 55, 94, 0.16);
  }

  @media (max-width: 575px) {
    .erp-period-filter {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .erp-period-filter button {
      justify-content: center;
      padding-inline: 0.65rem;
    }
  }
</style>
