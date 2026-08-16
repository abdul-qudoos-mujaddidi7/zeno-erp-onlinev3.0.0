<script>
  export let title = '';
  export let icon = 'bi-list';
  export let count = null;
  export let tone = 'primary';
</script>

<div class="erp-list-panel tone-{tone}">
  <div class="erp-list-header">
    <h5><i class="bi {icon}"></i>{title}</h5>
    {#if count !== null}
      <span>{count}</span>
    {/if}
  </div>
  <div class="erp-list-body">
    <slot />
  </div>
</div>

<style>
  .erp-list-panel {
    height: 100%;
    overflow: hidden;
    border: 1px solid #e6ebf2;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }

  .erp-list-panel:hover {
    transform: translateY(-2px);
    border-color: #d3deed;
    box-shadow: 0 14px 30px rgba(21, 32, 51, 0.075);
  }

  .erp-list-header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.95rem 1rem;
    border-bottom: 1px solid #eef2f7;
    background: #fbfcfe;
  }

  .erp-list-header h5 {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    margin: 0;
    color: #172033;
    font-size: 0.95rem;
    font-weight: 900;
  }

  .erp-list-header i {
    color: #2f6fed;
  }

  .erp-list-header span {
    min-width: 30px;
    padding: 0.28rem 0.58rem;
    border-radius: 7px;
    background: #eaf2ff;
    color: #2f6fed;
    font-size: 0.75rem;
    font-weight: 800;
    text-align: center;
  }

  .erp-list-body {
    max-height: 360px;
    overflow: auto;
  }

  .erp-list-body :global(table) {
    --mdb-table-bg: transparent;
  }

  .erp-list-body :global(tbody tr) {
    transition:
      background 0.2s ease,
      transform 0.2s ease;
  }

  .erp-list-body :global(tbody tr:hover) {
    background: #f5f8fc;
  }

  .tone-danger .erp-list-header i,
  .tone-danger .erp-list-header span {
    color: #c83248;
  }

  .tone-danger .erp-list-header span {
    background: #fff0f1;
  }

  .tone-warning .erp-list-header i,
  .tone-warning .erp-list-header span {
    color: #b77905;
  }

  .tone-warning .erp-list-header span {
    background: #fff6dd;
  }

  @media (max-width: 575px) {
    .erp-list-panel {
      border-radius: 0.9rem;
    }

    .erp-list-header {
      padding: 0.95rem 1rem;
    }
  }
</style>
