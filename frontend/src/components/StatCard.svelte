<script>
  export let title = '';
  export let value = '';
  export let description = '';
  export let icon = 'bi-grid';
  export let tone = 'primary';
  export let loading = false;
</script>

<div class="erp-stat-card tone-{tone}">
  <div class="erp-stat-icon" aria-hidden="true">
    <i class="bi {icon}"></i>
  </div>
  <div class="erp-stat-content">
    <p>{title}</p>
    {#if loading}
      <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
    {:else}
      <h3>{@html value}</h3>
    {/if}
    {#if description}
      <small>{description}</small>
    {/if}
  </div>
</div>

<style>
  .erp-stat-card {
    position: relative;
    display: flex;
    gap: 0.9rem;
    align-items: center;
    overflow: hidden;
    height: 100%;
    min-height: 108px;
    padding: 1.05rem;
    border: 1px solid #e6ebf2;
    border-radius: 14px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease;
  }

  .erp-stat-card::after {
    content: '';
    position: absolute;
    inset-block: 18%;
    inset-inline-start: 0;
    width: 3px;
    border-radius: 0 4px 4px 0;
    background: #2f6fed;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  .erp-stat-card:hover {
    transform: translateY(-2px);
    border-color: #d3deed;
    box-shadow: 0 14px 30px rgba(21, 32, 51, 0.075);
  }

  .erp-stat-card:hover::after {
    opacity: 1;
  }

  .erp-stat-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: #eaf2ff;
    color: #2f6fed;
    font-size: 1.05rem;
  }

  .erp-stat-content {
    min-width: 0;
    flex: 1;
    text-align: start;
  }

  .erp-stat-content p {
    margin: 0 0 0.28rem;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .erp-stat-content h3 {
    margin: 0;
    color: #172033;
    font-size: clamp(1.05rem, 1.5vw, 1.3rem);
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: -0.025em;
  }

  .erp-stat-content small {
    display: block;
    margin-top: 0.32rem;
    color: #8a98ab;
    font-size: 0.7rem;
    font-weight: 650;
    line-height: 1.35;
  }

  .tone-success .erp-stat-icon {
    background: #e8f8f0;
    color: #11875d;
  }

  .tone-success::after {
    background: #11875d;
  }

  .tone-warning .erp-stat-icon {
    background: #fff6dd;
    color: #b77905;
  }

  .tone-warning::after {
    background: #d79a20;
  }

  .tone-danger .erp-stat-icon {
    background: #fff0f1;
    color: #c83248;
  }

  .tone-danger::after {
    background: #d34a5d;
  }

  .tone-info .erp-stat-icon {
    background: #e7f7fa;
    color: #14839a;
  }

  .tone-info::after {
    background: #1d94ab;
  }

  @media (max-width: 575px) {
    .erp-stat-card {
      min-height: 96px;
      padding: 0.9rem;
    }

    .erp-stat-icon {
      width: 40px;
      height: 40px;
      font-size: 1rem;
    }
  }
</style>
