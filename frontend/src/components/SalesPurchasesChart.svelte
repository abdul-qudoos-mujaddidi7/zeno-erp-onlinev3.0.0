<script>
  export let title = '';
  export let subtitle = '';
  export let canvas = null;
</script>

<div class="erp-panel h-100">
  <div class="erp-panel-header">
    <div>
      <span class="erp-eyebrow">تحلیل معاملات</span>
      <h5><i class="bi bi-graph-up-arrow"></i>{title}</h5>
    </div>
    {#if subtitle}
      <span class="erp-panel-chip">{subtitle}</span>
    {/if}
  </div>
  <div class="erp-chart-body">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .erp-panel {
    height: 100%;
    padding: 1.1rem;
    border: 1px solid #e6ebf2;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }

  .erp-panel:hover {
    transform: translateY(-2px);
    border-color: #d3deed;
    box-shadow: 0 14px 30px rgba(21, 32, 51, 0.075);
  }

  .erp-panel-header {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .erp-eyebrow {
    color: #2f6fed;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0;
  }

  h5 {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    margin: 0.2rem 0 0;
    color: #172033;
    font-size: 1.02rem;
    font-weight: 900;
  }

  h5 i {
    color: #2f6fed;
  }

  .erp-panel-chip {
    padding: 0.3rem 0.58rem;
    border: 1px solid #dbe7f7;
    border-radius: 7px;
    background: #f2f6fc;
    color: #52657d;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .erp-chart-body {
    height: clamp(270px, 32vw, 330px);
    padding: 0.2rem 0 0;
  }

  @media (max-width: 575px) {
    .erp-panel {
      padding: 1rem;
      border-radius: 0.9rem;
    }

    .erp-panel-header {
      flex-direction: column;
      gap: 0.65rem;
    }

    .erp-chart-body {
      height: 260px;
    }
  }
</style>
