<script>
  export let title = '';
  export let subtitle = '';
  export let products = [];
  export let formatValue = (value) => value;
  export let emptyText = 'No data';

  $: maxRevenue = Math.max(...products.map((product) => Number(product.rev || 0)), 0);
</script>

<div class="erp-panel h-100">
  <div class="erp-panel-header">
    <div>
      <span class="erp-eyebrow">رتبه‌بندی محصولات</span>
      <h5><i class="bi bi-trophy"></i>{title}</h5>
    </div>
    {#if subtitle}
      <span class="erp-panel-chip">{subtitle}</span>
    {/if}
  </div>

  {#if products.length === 0}
    <div class="erp-empty">
      <i class="bi bi-box-seam"></i>
      <span>{emptyText}</span>
    </div>
  {:else}
    <div class="erp-top-products">
      {#each products as product, index}
        <div class="erp-product-row">
          <div class="erp-product-rank">{index + 1}</div>
          <div class="erp-product-main">
            <div class="erp-product-title">
              <span title={product.name}>{product.name}</span>
              <strong dir="ltr">{formatValue(product.rev)}</strong>
            </div>
            <div class="erp-product-sub">
              <small>{product.code || '-'}</small>
              <small>{formatValue(product.qty)} عدد فروخته‌شده</small>
            </div>
            <div class="progress">
              <div
                class="progress-bar"
                role="progressbar"
                style="width: {maxRevenue ? Math.max((Number(product.rev || 0) / maxRevenue) * 100, 5) : 0}%"></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
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
    color: #c58b17;
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

  .erp-top-products {
    display: grid;
    gap: 0.5rem;
  }

  .erp-product-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.5rem;
    border-radius: 9px;
    transition:
      background 0.2s ease,
      transform 0.2s ease;
  }

  .erp-product-row:hover {
    transform: translateX(-1px);
    background: #f5f8fc;
  }

  :global(html[dir='ltr']) .erp-product-row:hover {
    transform: translateX(1px);
  }

  .erp-product-rank {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid #e2e9f2;
    border-radius: 8px;
    background: #f6f8fb;
    color: #2f6fed;
    font-size: 0.78rem;
    font-weight: 900;
    box-shadow: none;
  }

  .erp-product-main {
    min-width: 0;
    flex: 1;
  }

  .erp-product-title,
  .erp-product-sub {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .erp-product-title span {
    min-width: 0;
    overflow: hidden;
    color: #172033;
    font-size: 0.86rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .erp-product-title strong {
    color: #172033;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  .erp-product-sub small {
    color: #8a98ab;
    font-size: 0.68rem;
  }

  .progress {
    height: 5px;
    margin-top: 0.45rem;
    border-radius: 999px;
    background: #e8eef6;
  }

  .progress-bar {
    border-radius: 999px;
    background: #2f6fed;
  }

  .erp-empty {
    min-height: 260px;
    display: grid;
    place-items: center;
    color: #94a3b8;
    text-align: center;
  }

  .erp-empty i {
    display: block;
    margin-bottom: 0.45rem;
    font-size: 1.7rem;
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
  }
</style>
