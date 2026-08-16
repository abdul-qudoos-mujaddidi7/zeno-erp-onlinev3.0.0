<script>
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../i18n/i18n';
  import { getDashboardExchangeRates } from '../services/marketRates.js';

  let loadingRates = true;
  let ratesError = '';
  let usdToAfn = null;
  let eurToAfn = null;
  let refreshTimer;

  function formatRate(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value));
  }

  async function loadRates(force = false) {
    loadingRates = true;
    ratesError = '';

    try {
      const rates = await getDashboardExchangeRates({ force });
      if (!rates) throw new Error('No rates available');

      usdToAfn = rates.usdToAfn;
      eurToAfn = rates.eurToAfn;
    } catch (error) {
      ratesError = error?.message || 'Failed to load rates';
      usdToAfn = null;
      eurToAfn = null;
    } finally {
      loadingRates = false;
    }
  }

  onMount(() => {
    loadRates();
    refreshTimer = setInterval(() => loadRates(true), 15 * 60 * 1000);
  });

  onDestroy(() => {
    if (refreshTimer) clearInterval(refreshTimer);
  });
</script>

<div class="dashboard-accent">
  <div class="dashboard-accent__glow dashboard-accent__glow--1"></div>
  <div class="dashboard-accent__glow dashboard-accent__glow--2"></div>
  <div class="dashboard-accent__grid"></div>

  <div class="dashboard-accent__content">
    <div class="dashboard-accent__art" aria-hidden="true">
      <i class="bi bi-currency-exchange"></i>
    </div>

    <div class="dashboard-accent__copy">
      <span class="dashboard-accent__title">{t('Currency Rates')}</span>
      {#if loadingRates}
        <p class="dashboard-accent__status">{t('Loading rates...')}</p>
      {:else if ratesError || usdToAfn == null || eurToAfn == null}
        <p class="dashboard-accent__status">{t('Rates unavailable')}</p>
      {:else}
        <div class="dashboard-accent__rates">
          <div class="dashboard-accent__rate">
            <span class="dashboard-accent__icon dashboard-accent__icon--usd" aria-hidden="true">
              <i class="bi bi-currency-dollar"></i>
            </span>
            <div class="dashboard-accent__rate-body">
              <div class="dashboard-accent__value-row" dir="ltr">
                <span class="dashboard-accent__from">1 USD</span>
                <i class="bi bi-arrow-right-short"></i>
                <span class="dashboard-accent__amount">{formatRate(usdToAfn)}</span>
                <span class="dashboard-accent__currency">{t('Afghani')}</span>
              </div>
            </div>
          </div>

          <div class="dashboard-accent__rate">
            <span class="dashboard-accent__icon dashboard-accent__icon--eur" aria-hidden="true">
              <i class="bi bi-currency-euro"></i>
            </span>
            <div class="dashboard-accent__rate-body">
              <div class="dashboard-accent__value-row" dir="ltr">
                <span class="dashboard-accent__from">1 EUR</span>
                <i class="bi bi-arrow-right-short"></i>
                <span class="dashboard-accent__amount">{formatRate(eurToAfn)}</span>
                <span class="dashboard-accent__currency">{t('Afghani')}</span>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .dashboard-accent {
    --accent-from: var(--erp-primary-hover, #245fcf);
    --accent-to: var(--erp-primary, #2f6fed);

    position: relative;
    display: block;
    width: 100%;
    min-height: 84px;
    height: 100%;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid #bfd4ff;
    background: linear-gradient(135deg, var(--accent-from) 0%, var(--accent-to) 100%);
    box-shadow: 0 14px 34px rgba(47, 111, 237, 0.24);
  }

  .dashboard-accent__glow {
    position: absolute;
    border-radius: 999px;
    filter: blur(22px);
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-accent__glow--1 {
    width: 110px;
    height: 110px;
    top: -40px;
    inset-inline-start: -20px;
    background: rgba(255, 255, 255, 0.22);
    animation: accent-drift 8s ease-in-out infinite;
  }

  .dashboard-accent__glow--2 {
    width: 90px;
    height: 90px;
    bottom: -30px;
    inset-inline-end: 72px;
    background: rgba(255, 255, 255, 0.16);
    animation: accent-drift 10s ease-in-out infinite reverse;
  }

  .dashboard-accent__grid {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.07;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.9) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.9) 1px, transparent 1px);
    background-size: 20px 20px;
    mask-image: linear-gradient(90deg, transparent 35%, rgba(0, 0, 0, 0.7) 100%);
  }

  .dashboard-accent__content {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 68px;
    align-items: center;
    gap: 0.5rem;
    min-height: 84px;
    padding: 0.5rem 0.7rem;
  }

  .dashboard-accent__copy {
    min-width: 0;
    color: #ffffff;
  }

  .dashboard-accent__title {
    display: block;
    margin-bottom: 0.16rem;
    color: #4b5563;
    font-size: 0.74rem;
    font-weight: 650;
    line-height: 1.15;
  }

  .dashboard-accent__status {
    margin: 0;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .dashboard-accent__rates {
    display: grid;
    gap: 0.28rem;
  }

  .dashboard-accent__rate {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.22rem 0.42rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.16);
  }

  .dashboard-accent__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
    font-size: 0.78rem;
  }

  .dashboard-accent__rate-body {
    min-width: 0;
    flex: 1;
  }

  .dashboard-accent__value-row {
    display: flex;
    align-items: baseline;
    gap: 0.22rem;
    flex-wrap: nowrap;
    white-space: nowrap;
    color: #ffffff;
  }

  .dashboard-accent__from {
    font-size: 0.68rem;
    font-weight: 800;
    opacity: 0.9;
  }

  .dashboard-accent__value-row i {
    font-size: 0.88rem;
    line-height: 1;
    opacity: 0.85;
  }

  .dashboard-accent__amount {
    font-size: 0.92rem;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.03em;
    text-shadow: 0 1px 8px rgba(15, 23, 42, 0.18);
  }

  .dashboard-accent__currency {
    font-size: 0.66rem;
    font-weight: 800;
    opacity: 0.92;
  }

  .dashboard-accent__art {
    position: relative;
    width: 68px;
    height: 64px;
    flex-shrink: 0;
    isolation: isolate;
  }

  .dashboard-accent__svg {
    width: 100%;
    height: 100%;
    animation: accent-chart 4.5s ease-in-out infinite;
  }

  .dashboard-accent__orbit {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .dashboard-accent__orbit span {
    position: absolute;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #ffffff;
    font-size: 0.72rem;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
  }

  .dashboard-accent__orbit span:nth-child(1) {
    top: 0;
    inset-inline-end: 0;
    animation: accent-float 5s ease-in-out infinite;
  }

  .dashboard-accent__orbit span:nth-child(2) {
    bottom: 0;
    inset-inline-start: 2px;
    animation: accent-float 6.2s ease-in-out infinite reverse;
  }

  @keyframes accent-float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }

  @keyframes accent-drift {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(6px, -8px);
    }
  }

  @keyframes accent-chart {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.88;
    }
    50% {
      transform: translateY(-3px);
      opacity: 1;
    }
  }

  @media (max-width: 1199px) {
    .dashboard-accent__content {
      grid-template-columns: minmax(0, 1fr) 60px;
    }

    .dashboard-accent__art {
      width: 60px;
      height: 58px;
    }

    .dashboard-accent__amount {
      font-size: 0.86rem;
    }
  }

  @media (max-width: 767px) {
    .dashboard-accent__content {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .dashboard-accent__art {
      width: 100%;
      max-width: 120px;
      height: 72px;
      justify-self: center;
    }

    .dashboard-accent__grid {
      mask-image: none;
      opacity: 0.05;
    }
  }

  @media (min-width: 768px) {
    .dashboard-accent {
      min-height: clamp(4.5rem, 6vw, 5.25rem);
      border-color: rgba(15, 110, 253, 0.5);
      background:
        radial-gradient(circle at 88% 14%, rgba(255, 255, 255, 0.22), transparent 34%),
        linear-gradient(135deg, #0b4fc0 0%, #0f6efd 58%, #2f80ed 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 14px 30px rgba(15, 110, 253, 0.24);
    }

    .dashboard-accent::before,
    .dashboard-accent::after {
      content: '';
      position: absolute;
      z-index: 0;
      border-radius: 50%;
      pointer-events: none;
    }

    .dashboard-accent::before {
      width: 72px;
      height: 72px;
      inset-block-start: -42px;
      inset-inline-end: 24px;
      border: 12px solid rgba(255, 255, 255, 0.07);
    }

    .dashboard-accent::after {
      width: 44px;
      height: 44px;
      inset-block-end: -26px;
      inset-inline-start: 38%;
      background: rgba(56, 189, 248, 0.13);
    }

    .dashboard-accent__glow,
    .dashboard-accent__grid {
      display: none;
    }

    .dashboard-accent__content {
      grid-template-columns: 28px minmax(0, 1fr);
      gap: 0.8rem;
      min-height: 100%;
      padding: 0.65rem 0.9rem;
    }

    .dashboard-accent__art {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.38);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      font-size: 1.3rem;
      text-shadow: 0 1px 5px rgba(7, 49, 120, 0.35);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.28),
        0 5px 12px rgba(7, 49, 120, 0.16);
    }

    .dashboard-accent__status {
      color: #dbeafe;
      font-size: 0.72rem;
    }

    .dashboard-accent__rates {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
    }

    .dashboard-accent__rate {
      gap: 0;
      padding: 0.2rem 0.38rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.07);
    }

    .dashboard-accent__value-row i,
    .dashboard-accent__currency {
      display: none;
    }

    .dashboard-accent__icon {
      width: 22px;
      height: 22px;
      display: inline-flex;
      border: 1px solid rgba(255, 255, 255, 0.75);
      background: #fff;
      font-size: 0.72rem;
      box-shadow: 0 3px 8px rgba(7, 49, 120, 0.18);
    }

    .dashboard-accent__icon--usd {
      color: #16a34a;
    }

    .dashboard-accent__icon--eur {
      color: #f59e0b;
    }

    .dashboard-accent__value-row {
      display: grid;
      gap: 0.05rem;
      color: #fff;
      direction: inherit;
      justify-items: start;
      text-align: start;
    }

    .dashboard-accent__from {
      order: 2;
      color: #bfdbfe;
      font-size: 0.62rem;
      font-weight: 650;
      opacity: 1;
    }

    .dashboard-accent__amount {
      order: 1;
      color: #fff;
      direction: ltr;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 1rem;
      text-shadow: none;
    }

    .dashboard-accent__copy,
    .dashboard-accent__title {
      text-align: start;
    }

    .dashboard-accent__title {
      color: #dbeafe;
    }
  }

</style>
