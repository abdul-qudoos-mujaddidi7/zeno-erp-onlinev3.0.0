<script>
  export let title = '';
  export let icon = 'bi-cash-stack';
  export let tone = 'primary';
</script>

<div class="erp-finance-card tone-{tone}">
  <div class="erp-finance-icon">
    <i class="bi {icon}"></i>
  </div>
  <div class="erp-finance-body">
    <p>{title}</p>
    <div class="erp-finance-value">
      <slot />
    </div>
  </div>
</div>

<style>
  .erp-finance-card {
    position: relative;
    height: 100%;
    min-height: 112px;
    display: flex;
    gap: 0.9rem;
    align-items: center;
    overflow: hidden;
    padding: 1.05rem;
    border: 1px solid #e6ebf2;
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }

  .erp-finance-card:hover {
    transform: translateY(-2px);
    border-color: #d3deed;
    box-shadow: 0 14px 30px rgba(21, 32, 51, 0.075);
  }

  .erp-finance-icon {
    position: relative;
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 11px;
    background: #eaf2ff;
    color: #2f6fed;
    font-size: 1.05rem;
  }

  .erp-finance-body {
    position: relative;
    min-width: 0;
    flex: 1;
  }

  .erp-finance-body p {
    margin: 0 0 0.38rem;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .erp-finance-value {
    color: #172033;
    font-size: 0.94rem;
    font-weight: 900;
    line-height: 1.45;
    letter-spacing: -0.01em;
  }

  .tone-success .erp-finance-icon {
    background: #e8f8f0;
    color: #11875d;
  }

  .tone-danger .erp-finance-icon {
    background: #fff0f1;
    color: #c83248;
  }

  .tone-warning .erp-finance-icon,
  .tone-info .erp-finance-icon {
    background: #e7f7fa;
    color: #14839a;
  }

  @media (max-width: 575px) {
    .erp-finance-card {
      min-height: 98px;
      padding: 0.9rem;
    }
  }
</style>
