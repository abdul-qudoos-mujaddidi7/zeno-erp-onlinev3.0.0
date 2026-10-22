<script>
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount } from 'svelte';
  import BOMReceiptModal from './BOMReceiptModal.svelte';
  import BOMDeleteModal from './BOMDeleteModal.svelte';
  import { push } from 'svelte-spa-router';
  import { bomApi } from '../../../api/bomApi.js';
  import { workCenterApi } from '../../../api/workCenterApi.js';
  import { showDate } from '../../../calendar.js';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import { productApi } from '../../../api/productApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let bomId;

  let bom = null;
  let items = [];
  let operations = [];

  let product = null;
  let unit = null;
  let showReceipt = false;

  let units = [];
  let work_centers = [];

  let showDelete = false;
  let loading = true;

  onMount(async () => {
    try {
      bom = (await bomApi.getById(Number(bomId)))?.data || null;
      if (!bom || Number(bom.status) !== 1) {
        push('/dashboard/boms');
        return;
      }

      product =
        (await productApi.getAll({ status: 1 }))?.data?.find(
          (p) => Number(p.id) === Number(bom.product_id),
        ) || null;

      const unitData = product?.product_unit_id
        ? (await productUnitApi.getById(product.product_unit_id))?.data || null
        : null;
      unit = unitData?.status === 1 ? unitData : null;

      const bomItems = (bom.items || []).filter((item) => Number(item.status) === 1);

      const productIds = bomItems.map((i) => i.product_id);
      const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) =>
        productIds.includes(p.id),
      );

      items = bomItems.map((i) => {
        const itemProduct = products.find((p) => p.id === i.product_id);
        return {
          ...i,
          product_name: itemProduct?.name || 'Unknown',
          product_unit_id: i.product_unit_id || itemProduct?.product_unit_id,
        };
      });

      work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];

      const bomOperations = (bom.operations || []).filter((item) => Number(item.status) === 1);

      operations = bomOperations.map((o) => {
        const work_center = work_centers.find((wc) => wc.id === o.work_center_id);
        return {
          ...o,
          work_center_name: work_center?.name || 'Unknown',
        };
      });

      units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    } finally {
      loading = false;
    }
  });

  function goBack() {
    push('/dashboard/boms');
  }

  function unitName(unitId) {
    return units.find((u) => u.id === unitId)?.name || '-';
  }

  function formatAmount(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
</script>

<div class="purchase-detail-page">
  <div class="purchase-detail-page__inner">
    {#if loading}
      <div class="purchase-detail-card purchase-detail-card--loading">
        <div class="purchase-detail-skeleton"></div>
        <div class="purchase-detail-skeleton purchase-detail-skeleton--short"></div>
      </div>
    {:else if !bom}
      <div class="purchase-detail-card purchase-detail-empty">
        <i class="bi bi-diagram-3"></i>
        <p>{t('BOM not found.')}</p>
        <button type="button" class="pd-btn pd-btn--neutral" on:click={goBack}>
          <i class="bi bi-arrow-left"></i>
          {t('Back')}
        </button>
      </div>
    {:else}
      <header class="pd-header-card">
        <div class="pd-header-card__top">
          <div class="pd-header-card__title-row">
            <button type="button" class="pd-btn pd-btn--neutral pd-btn--icon" on:click={goBack} title={t('Back')}>
              <i class="bi bi-arrow-left"></i>
            </button>
            <h1 class="pd-header-card__title">
              {t('BOM #')}: {bom?.bill_number}
            </h1>
            {#if bom?.bill_status === 'draft'}
              <span class="pd-status-badge pd-status-badge--draft">{t('Draft')}</span>
            {:else if bom?.bill_status === 'confirmed'}
              <span class="pd-status-badge pd-status-badge--confirmed">{t('confirmed')}</span>
            {/if}
            {#if bom?.version && bom?.version > 1}
              <span class="pd-status-badge pd-status-badge--version">{t('Version')} {bom?.version}</span>
            {/if}
          </div>

          <div class="pd-header-card__actions hide-for-pdf">
            <button type="button" class="pd-btn pd-btn--primary" on:click={() => (showReceipt = true)}>
              <i class="bi bi-printer"></i>
              {t('Print')}
            </button>
            <button
              type="button"
              class="pd-btn pd-btn--secondary"
              on:click={() => push(`/dashboard/bom-form/${bomId}`)}>
              <i class="bi bi-pencil"></i>
              {t('Edit')}
            </button>
            <button type="button" class="pd-btn pd-btn--danger-outline" on:click={() => (showDelete = true)}>
              <i class="bi bi-trash"></i>
              {t('Delete')}
            </button>
          </div>
        </div>

        <dl class="pd-header-meta">
          <div class="pd-header-meta__item">
            <dt>{t('Product')}</dt>
            <dd>
              {#if product}
                <button type="button" class="pd-link" on:click={() => push(`/dashboard/product/${product.id}`)}>
                  {product.name}
                </button>
              {:else}
                —
              {/if}
            </dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('BOM Date')}</dt>
            <dd>{@html bom?.bill_date ? showDate(bom.bill_date) : '-'}</dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('Quantity')}</dt>
            <dd>
              <span class="pd-table__num">
                <span dir="ltr">{formatAmount(bom?.quantity)}</span>
                <span class="pd-table__currency">{unit?.name || '-'}</span>
              </span>
            </dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('Total')}</dt>
            <dd>
              <span class="pd-table__num">
                <span dir="ltr">{formatAmount(bom?.total_amount)}</span>
                <span class="pd-table__currency">{t(bom?.currency)}</span>
              </span>
            </dd>
          </div>
          {#if bom?.description}
            <div class="pd-header-meta__item">
              <dt>{t('Description')}</dt>
              <dd class="pd-header-meta__desc">{@html bom.description}</dd>
            </div>
          {/if}
        </dl>
      </header>

      <div class="purchase-detail-summary purchase-detail-summary--bom">
        <div class="purchase-summary-card">
          <div class="purchase-summary-card__icon purchase-summary-card__icon--total">
            <i class="bi bi-box-seam"></i>
          </div>
          <div class="purchase-summary-card__body">
            <span class="purchase-summary-card__label">{t('BOM Items')}</span>
            <span class="purchase-summary-card__value">
              <span dir="ltr">{formatAmount(items.length)}</span>
            </span>
          </div>
        </div>

        <div class="purchase-summary-card">
          <div class="purchase-summary-card__icon purchase-summary-card__icon--paid">
            <i class="bi bi-gear-wide-connected"></i>
          </div>
          <div class="purchase-summary-card__body">
            <span class="purchase-summary-card__label">{t('BOM Operations')}</span>
            <span class="purchase-summary-card__value">
              <span dir="ltr">{formatAmount(operations.length)}</span>
            </span>
          </div>
        </div>

        <div class="purchase-summary-card">
          <div class="purchase-summary-card__icon purchase-summary-card__icon--returns">
            <i class="bi bi-receipt"></i>
          </div>
          <div class="purchase-summary-card__body">
            <span class="purchase-summary-card__label">{t('Total')}</span>
            <span class="purchase-summary-card__value">
              <span dir="ltr">{formatAmount(bom?.total_amount)}</span>
              <small>{t(bom?.currency)}</small>
            </span>
          </div>
        </div>
      </div>

      <section class="pd-card pd-items-card">
        <div class="pd-card__head">
          <h2 class="pd-card__title">
            <i class="bi bi-box-seam"></i>
            {t('BOM Items')}
          </h2>
        </div>
        <div class="pd-card__scroll">
          <table class="pd-table pd-table--items">
            <colgroup>
              <col class="pd-table__col-product" />
              <col class="pd-table__col-num" />
              <col class="pd-table__col-num" />
              <col class="pd-table__col-qty" />
              <col class="pd-table__col-num pd-table__col-total" />
            </colgroup>
            <thead>
              <tr>
                <th class="pd-table__col-product">{t('Product')}</th>
                <th class="pd-table__col-num">{t('Buy Price')}</th>
                <th class="pd-table__col-num">{t('Wastage Percent')}</th>
                <th class="pd-table__col-qty">{t('Quantity')}</th>
                <th class="pd-table__col-num pd-table__col-total">{t('Total Price')}</th>
              </tr>
            </thead>
            <tbody>
              {#each items as i}
                <tr>
                  <td class="pd-table__col-product">
                    <button
                      type="button"
                      class="pd-link pd-link--product"
                      on:click={() => push(`/dashboard/product/${i.product_id}`)}>
                      {i.product_name}
                    </button>
                  </td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(i.unit_price)}</span>
                      <span class="pd-table__currency">{t(i.currency)}</span>
                    </span>
                  </td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(i.wastage_percent)}</span>
                      <span class="pd-table__currency">%</span>
                    </span>
                  </td>
                  <td class="pd-table__col-qty">
                    <span class="pd-table__qty-cell">
                      <span class="purchase-qty-pill">
                        <span dir="ltr">{formatAmount(i.quantity)}</span>
                      </span>
                      <span class="purchase-qty-unit">{unitName(i.product_unit_id)}</span>
                    </span>
                  </td>
                  <td class="pd-table__amount pd-table__amount--total pd-table__col-num pd-table__col-total">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(i.subtotal)}</span>
                      <span class="pd-table__currency">{t(i.currency)}</span>
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="pd-card">
        <div class="pd-card__head">
          <h2 class="pd-card__title">
            <i class="bi bi-gear-wide-connected"></i>
            {t('BOM Operations')}
          </h2>
        </div>
        <div class="pd-card__scroll">
          <table class="pd-table pd-table--operations">
            <colgroup>
              <col class="pd-table__col-index" />
              <col class="pd-table__col-work-center" />
              <col class="pd-table__col-operation" />
              <col class="pd-table__col-num" />
              <col class="pd-table__col-num" />
              <col class="pd-table__col-num" />
              <col class="pd-table__col-num" />
            </colgroup>
            <thead>
              <tr>
                <th class="pd-table__col-index">#</th>
                <th class="pd-table__col-work-center">{t('Work Center')}</th>
                <th class="pd-table__col-operation">{t('Operation')}</th>
                <th class="pd-table__col-num">{t('Setup Time')}</th>
                <th class="pd-table__col-num">{t('Run Time')}</th>
                <th class="pd-table__col-num">{t('Cost per Hour')}</th>
                <th class="pd-table__col-num">{t('Fixed Cost')}</th>
              </tr>
            </thead>
            <tbody>
              {#each operations as operation, index}
                <tr>
                  <td class="pd-table__col-index cell-muted">{index + 1}</td>
                  <td>{operation.work_center_name}</td>
                  <td>{operation.operation_name}</td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(operation.setup_time)}</span>
                      {#if operation.setup_time}
                        <span class="pd-table__currency">{t(operation.setup_time_unit)}</span>
                      {/if}
                    </span>
                  </td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(operation.run_time)}</span>
                      {#if operation.run_time}
                        <span class="pd-table__currency">{t(operation.run_time_unit)}</span>
                      {/if}
                    </span>
                  </td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(operation.cost_per_hour)}</span>
                      {#if operation.cost_per_hour}
                        <span class="pd-table__currency">{t(operation.cost_currency)}</span>
                      {/if}
                    </span>
                  </td>
                  <td class="pd-table__amount pd-table__col-num">
                    <span class="pd-table__num">
                      <span dir="ltr">{formatAmount(operation.fixed_cost)}</span>
                      {#if operation.fixed_cost}
                        <span class="pd-table__currency">{t(operation.cost_currency)}</span>
                      {/if}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  </div>
</div>

{#if showReceipt && bom}
  <BOMReceiptModal {bom} on:close={() => (showReceipt = false)} />
{/if}

{#if showDelete && bom}
  <BOMDeleteModal {bom} on:close={() => (showDelete = false)} />
{/if}

<style>
  .purchase-detail-page {
    width: calc(100% + 1rem);
    margin: -0.5rem;
    min-height: 100%;
    padding-block: 24px;
    background: #f8fafc;
  }

  .purchase-detail-page__inner {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .pd-header-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pd-header-card__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pd-header-card__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
    flex: 1 1 auto;
  }

  .pd-header-card__title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
  }

  .pd-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }

  .pd-status-badge--confirmed {
    background: #ecfdf5;
    color: #10b981;
    border: 1px solid #a7f3d0;
  }

  .pd-status-badge--draft {
    background: #fffbeb;
    color: #f59e0b;
    border: 1px solid #fde68a;
  }

  .pd-status-badge--version {
    background: #eff6ff;
    color: #0f6efd;
    border: 1px solid #bfdbfe;
  }

  .pd-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    margin: 0;
    padding-block-start: 8px;
    border-block-start: 1px solid #f1f5f9;
  }

  .pd-header-meta__item {
    margin: 0;
  }

  .pd-header-meta__desc :global(p) {
    margin: 0;
    display: inline;
  }

  .pd-header-meta__desc :global(p:not(:last-child))::after {
    content: ' ';
  }

  .pd-header-meta dt {
    margin: 0 0 1px;
    font-size: 11px;
    font-weight: 500;
    color: #64748b;
  }

  .pd-header-meta dd {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .pd-header-card__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }

  .pd-link {
    background: none;
    border: none;
    padding: 0;
    color: #0f6efd;
    font-weight: 600;
    cursor: pointer;
    text-align: start;
  }

  .pd-link--product {
    font-size: 14px;
  }

  .pd-link:hover {
    text-decoration: underline;
  }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 8px;
    padding: 7px 12px;
    font-weight: 600;
    font-size: 12px;
    border: 1px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pd-btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .pd-btn--primary:hover {
    background: #1d4ed8;
  }

  .pd-btn--secondary {
    background: #eff6ff;
    color: #0f6efd;
    border-color: #bfdbfe;
  }

  .pd-btn--secondary:hover {
    background: #dbeafe;
  }

  .pd-btn--outline {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--outline:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  .pd-btn--danger-outline {
    background: #ffffff;
    color: #ef4444;
    border-color: #ef4444;
  }

  .pd-btn--danger-outline:hover {
    background: #fef2f2;
  }

  .pd-btn--neutral {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .pd-btn--neutral:hover {
    background: #f8fafc;
  }

  .pd-btn--icon {
    padding: 7px 9px;
    flex-shrink: 0;
  }

  .pd-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .pd-card__head {
    padding: 14px 20px;
    border-bottom: 1px solid #e2e8f0;
  }

  .pd-card__title {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    font-weight: 700;
    color: #0f172a;
  }

  .pd-card__title i {
    color: #0f6efd;
    font-size: 1rem;
  }

  .pd-card__scroll {
    overflow-x: auto;
  }

  .pd-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  .pd-table--items col.pd-table__col-product {
    width: 28%;
  }

  .pd-table--items col.pd-table__col-qty {
    width: 14%;
  }

  .pd-table--items col.pd-table__col-num {
    width: 16%;
  }

  .pd-table--items col.pd-table__col-total {
    width: 18%;
  }

  .pd-table--operations col.pd-table__col-index {
    width: 5%;
  }

  .pd-table--operations col.pd-table__col-work-center {
    width: 21%;
  }

  .pd-table--operations col.pd-table__col-operation {
    width: 24%;
  }

  .pd-table--operations col.pd-table__col-num {
    width: 12.5%;
  }

  /* Let the seven operations headers wrap on narrow screens instead of
     overflowing into the neighbouring columns. */
  .pd-table--operations th {
    white-space: normal;
  }

  .pd-table th {
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    padding: 12px 16px;
    text-align: start;
    white-space: nowrap;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }

  .pd-table td {
    padding: 12px 16px;
    border-block-start: 1px solid #f1f5f9;
    color: #0f172a;
    text-align: start;
    vertical-align: middle;
    font-size: 14px;
  }

  .pd-table th.pd-table__col-qty,
  .pd-table td.pd-table__col-qty,
  .pd-table th.pd-table__col-num,
  .pd-table td.pd-table__col-num,
  .pd-table th.pd-table__col-index,
  .pd-table td.pd-table__col-index {
    text-align: start;
  }

  .pd-table td.pd-table__col-qty {
    white-space: nowrap;
  }

  .pd-table__qty-cell {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    max-width: 100%;
  }

  .pd-table__num {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .pd-table__num > [dir='ltr'] {
    unicode-bidi: isolate;
  }

  .pd-table tbody tr:hover td {
    background: #f8fafc;
  }

  .pd-table__amount {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .pd-table__amount--total {
    font-weight: 800;
  }

  .pd-table__currency {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .purchase-qty-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 6px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 13px;
    font-weight: 600;
  }

  .purchase-qty-unit {
    font-size: 12px;
    color: #64748b;
  }

  .cell-muted {
    color: #94a3b8;
  }

  .purchase-detail-summary--bom {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    align-items: stretch;
  }

  .purchase-summary-card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 14px 16px;
    min-height: 72px;
  }

  .purchase-summary-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .purchase-summary-card__icon--total {
    background: #eff6ff;
    color: #0f6efd;
  }

  .purchase-summary-card__icon--paid {
    background: #f0fdf4;
    color: #10b981;
  }

  .purchase-summary-card__icon--returns {
    background: #fffbeb;
    color: #f59e0b;
  }

  .purchase-summary-card__body {
    min-width: 0;
  }

  .purchase-summary-card__label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    margin-bottom: 2px;
  }

  .purchase-summary-card__value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-size: 1.0625rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .purchase-summary-card__value small {
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
  }

  .purchase-detail-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
  }

  .purchase-detail-card--loading {
    display: grid;
    gap: 12px;
  }

  .purchase-detail-skeleton {
    height: 20px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
    background-size: 200% 100%;
    animation: pd-shimmer 1.2s infinite;
  }

  .purchase-detail-skeleton--short {
    width: 60%;
  }

  @keyframes pd-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .purchase-detail-empty {
    text-align: center;
    padding: 48px 24px;
    color: #64748b;
  }

  .purchase-detail-empty i {
    font-size: 2.5rem;
    margin-bottom: 12px;
    display: block;
    color: #94a3b8;
  }

  .purchase-detail-empty p {
    margin: 0 0 16px;
  }

  :global(html.dark) .purchase-detail-page,
  :global([data-mdb-theme='dark']) .purchase-detail-page {
    background: #0b1220;
    color: #e5edf8;
  }

  :global(html.dark) .pd-header-card,
  :global(html.dark) .pd-card,
  :global(html.dark) .purchase-summary-card,
  :global(html.dark) .purchase-detail-card,
  :global([data-mdb-theme='dark']) .pd-header-card,
  :global([data-mdb-theme='dark']) .pd-card,
  :global([data-mdb-theme='dark']) .purchase-summary-card,
  :global([data-mdb-theme='dark']) .purchase-detail-card {
    border-color: #334762;
    background: #111827;
    color: #e5edf8;
  }

  :global(html.dark) .pd-header-card__title,
  :global(html.dark) .pd-header-meta dd,
  :global(html.dark) .pd-card__title,
  :global(html.dark) .purchase-summary-card__value,
  :global([data-mdb-theme='dark']) .pd-header-card__title,
  :global([data-mdb-theme='dark']) .pd-header-meta dd,
  :global([data-mdb-theme='dark']) .pd-card__title,
  :global([data-mdb-theme='dark']) .purchase-summary-card__value {
    color: #f1f5f9;
  }

  :global(html.dark) .pd-header-meta,
  :global(html.dark) .pd-card__head,
  :global([data-mdb-theme='dark']) .pd-header-meta,
  :global([data-mdb-theme='dark']) .pd-card__head {
    border-color: #2b3b52;
  }

  :global(html.dark) .pd-header-meta dt,
  :global(html.dark) .pd-table__currency,
  :global(html.dark) .purchase-qty-unit,
  :global(html.dark) .purchase-summary-card__label,
  :global(html.dark) .purchase-summary-card__value small,
  :global(html.dark) .purchase-detail-empty,
  :global([data-mdb-theme='dark']) .pd-header-meta dt,
  :global([data-mdb-theme='dark']) .pd-table__currency,
  :global([data-mdb-theme='dark']) .purchase-qty-unit,
  :global([data-mdb-theme='dark']) .purchase-summary-card__label,
  :global([data-mdb-theme='dark']) .purchase-summary-card__value small,
  :global([data-mdb-theme='dark']) .purchase-detail-empty {
    color: #94a3b8;
  }

  :global(html.dark) .pd-table th,
  :global([data-mdb-theme='dark']) .pd-table th {
    border-color: #334762;
    background: #172033;
    color: #a9b7ca;
  }

  :global(html.dark) .pd-table td,
  :global([data-mdb-theme='dark']) .pd-table td {
    border-color: #2b3b52;
    color: #dbe7f7;
  }

  :global(html.dark) .pd-table tbody tr:hover td,
  :global([data-mdb-theme='dark']) .pd-table tbody tr:hover td {
    background: #1a2638;
  }

  :global(html.dark) .pd-btn--neutral,
  :global(html.dark) .pd-btn--outline,
  :global([data-mdb-theme='dark']) .pd-btn--neutral,
  :global([data-mdb-theme='dark']) .pd-btn--outline {
    border-color: #334762;
    background: #172033;
    color: #dbe7f7;
  }

  :global(html.dark) .pd-btn--neutral:hover,
  :global(html.dark) .pd-btn--outline:hover,
  :global([data-mdb-theme='dark']) .pd-btn--neutral:hover,
  :global([data-mdb-theme='dark']) .pd-btn--outline:hover {
    border-color: #4a5f7d;
    background: #202b3d;
  }

  :global(html.dark) .purchase-qty-pill,
  :global([data-mdb-theme='dark']) .purchase-qty-pill {
    background: rgba(59, 130, 246, 0.16);
    color: #93c5fd;
  }

  @media (max-width: 768px) {
    .purchase-detail-page {
      padding-block: 16px;
    }

    .purchase-detail-page__inner {
      padding-inline: 16px;
      gap: 16px;
    }

    .pd-header-card__top {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }

    .pd-header-card__actions {
      justify-content: stretch;
    }

    .pd-header-card__actions .pd-btn {
      flex: 1 1 auto;
      justify-content: center;
    }
  }
</style>
