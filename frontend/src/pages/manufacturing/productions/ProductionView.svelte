<script>
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import ProductionReceiptModal from './ProductionReceiptModal.svelte';
  import ProductionA4ReceiptModal from './ProductionA4ReceiptModal.svelte';
  import ProductionDeleteModal from './ProductionDeleteModal.svelte';
  import ProductionEditModal from './ProductionEditModal.svelte';
  import { showDate } from '../../../calendar.js';
  import Swal from 'sweetalert2';
  import { getMultiple } from '../../stocktransactions/calculateStock.js';
  import { push } from 'svelte-spa-router';
  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { currencyApi } from '../../../api/currencyApi.js';
  import { accountApi } from '../../../api/accountApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { productionApi } from '../../../api/productionApi.js';
  import { workCenterApi } from '../../../api/workCenterApi.js';
  export let productionId;
  const dispatch = createEventDispatcher();

  let production;
  let loading = true;
  let products = [];
  let work_centers = [];
  let currencies = [];
  let items = [];
  let operations = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let customer = null;
  let units = [];
  let showDelete = false;
  let showEdit = false;

  /*
   * Production edit/delete actions are hidden for now. Flip this flag back
   * to true to bring the header buttons and their modals back.
   */
  const showProductionActions = false;
  let calculatedItems = [];
  $: if (currencies.length && products.length) {
    calculateItems();
  }
  async function calculateItems() {
    calculatedItems = await Promise.all(
      items.map(async (item) => {
        let product = products.find((p) => p.id === item.product_id);
        if (!product) return item;
        let costPrice = Number(product.buy_price) || 0;
        if (product.buy_currency != production.currency) {
          costPrice = exchangeRate(costPrice, product.buy_currency, production.currency) || 0;
        }
        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }
        let benefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        return {
          ...item,
          calculated_unit_price: costPrice,
          benefit,
        };
      }),
    );
  }
  let product = null;
  let unit = null;
  onMount(async () => {
    production = (await productionApi.getById(Number(productionId)))?.data || null;
    if (!production || Number(production.status) !== 1) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Production not found.'),
        confirmButtonText: t('OK'),
      });
      loading = false;
      return;
    }
    product =
      (await productApi.getAll({ status: 1 }))?.data?.find(
        (p) => Number(p.id) === Number(production.product_id),
      ) || null;
    const unitData = product?.product_unit_id
      ? (await productUnitApi.getById(product.product_unit_id))?.data || null
      : null;
    unit = unitData?.status === 1 ? unitData : null;
    const productionItems = (production.items || []).filter((item) => Number(item.status) === 1);
    const productIds = productionItems.map((i) => i.product_id);
    products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));
    items = productionItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_buy_price: product?.buy_price || 'Unknown',
        product_buy_currency: product?.buy_currency || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });
    work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];
    const productionOperations = (production.operations || []).filter((item) => Number(item.status) === 1);
    operations = productionOperations.map((i) => {
      const work_center = work_centers.find((p) => p.id === i.work_center_id);
      return {
        ...i,
        work_center_name: work_center?.name || 'Unknown',
      };
    });
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    if (production.account_id) {
      const _a = (await accountApi.getById(production.account_id))?.data;
      customer = _a && _a.status === 1 ? _a : null;
    }
    loading = false;
  });
  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }
</script>

<div class="production-detail-page">
  <div class="production-detail-page__inner">
    {#if production}
      <header class="pd-header-card">
        <div class="pd-header-card__top">
          <div class="pd-header-card__title-row">
            <button type="button" class="pd-btn pd-btn--neutral pd-btn--icon" on:click={() => push('/dashboard/productions')} title={t('Back')}>
              <i class="bi bi-arrow-left"></i>
            </button>
            <h1 class="pd-header-card__title">{t('Production #')}: {production.production_number}</h1>
            {#if production.production_status === 'draft'}
              <span class="pd-status-badge pd-status-badge--draft">{t('Draft')}</span>
            {:else if production.production_status === 'confirmed'}
              <span class="pd-status-badge pd-status-badge--confirmed">{t('confirmed')}</span>
            {/if}
          </div>
          <div class="pd-header-card__actions hide-for-pdf">
            <button type="button" class="pd-btn pd-btn--primary" on:click={() => (showReceipt = true)}>
              <i class="bi bi-printer"></i>{t('Print')} 80mm
            </button>
            <button type="button" class="pd-btn pd-btn--outline" on:click={() => (showA4Receipt = true)}>
              <i class="bi bi-printer"></i>{t('Print')} A4
            </button>
            {#if showProductionActions}
              {#if production.production_status === 'confirmed'}
                <button type="button" class="pd-btn pd-btn--secondary" on:click={() => (showEdit = true)}>
                  <i class="bi bi-pencil"></i>{t('Edit')}
                </button>
              {:else}
                <button type="button" class="pd-btn pd-btn--secondary" on:click={() => push(`/dashboard/production-form/${productionId}`)}>
                  <i class="bi bi-pencil"></i>{t('Edit')}
                </button>
              {/if}
              <button type="button" class="pd-btn pd-btn--danger-outline" on:click={() => (showDelete = true)}>
                <i class="bi bi-trash"></i>{t('Delete')}
              </button>
            {/if}
          </div>
        </div>
        <dl class="pd-header-meta">
          <div class="pd-header-meta__item">
            <dt>{t('Produced Product')}</dt>
            <dd><button class="pd-link" on:click={() => push(`/dashboard/product/${production.product_id}`)}>{product?.name || '-'}</button></dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('Quantity')}</dt>
            <dd>{Number(production.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {unit?.name || ''}</dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('Start Date')}</dt>
            <dd>{@html production.production_start_date ? showDate(production.production_start_date) : '-'}</dd>
          </div>
          <div class="pd-header-meta__item">
            <dt>{t('End Date')}</dt>
            <dd>{@html production.production_end_date ? showDate(production.production_end_date) : '-'}</dd>
          </div>
          {#if customer}
            <div class="pd-header-meta__item">
              <dt>{t('Account')}</dt>
              <dd>{customer.name}</dd>
            </div>
          {/if}
          {#if production.description}
            <div class="pd-header-meta__item pd-header-meta__item--description">
              <dt>{t('Description')}</dt><dd>{production.description}</dd>
            </div>
          {/if}
        </dl>
      </header>

      <section class="production-summary-grid" aria-label={t('Production summary')}>
        <article class="production-summary-card">
          <span class="production-summary-card__icon production-summary-card__icon--blue"><i class="bi bi-cash-stack"></i></span>
          <div><span class="production-summary-card__label">{t('Total Cost')}</span>
            <strong>{Number(production.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(production.currency || '')}</strong></div>
        </article>
        <article class="production-summary-card">
          <span class="production-summary-card__icon production-summary-card__icon--cyan"><i class="bi bi-box-seam"></i></span>
          <div><span class="production-summary-card__label">{t('Cost')}{t('-of-')}{t('per')} {t('Product')}</span>
            <strong>{Number(production.quantity) > 0 ? (Number(production.total_amount || 0) / Number(production.quantity)).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—'} {t(production.currency || '')}</strong></div>
        </article>
        <article class="production-summary-card">
          <span class="production-summary-card__icon production-summary-card__icon--green"><i class="bi bi-list-check"></i></span>
          <div><span class="production-summary-card__label">{t('Production Materials')}</span><strong>{calculatedItems.length}</strong></div>
        </article>
      </section>

      <section class="pd-card">
        <div class="pd-card__head"><h2 class="pd-card__title"><i class="bi bi-boxes"></i>{t('Production Materials')}</h2></div>
        <div class="pd-card__scroll">
          <table class="pd-table pd-table--materials">
            <thead><tr>
              <th>{t('Product')}</th><th>{t('Buy Price')}</th><th>{t('Sell Price')}</th><th>{t('Quantity')}</th><th>{t('Benefit')}</th><th>{t('Total Price')}</th>
            </tr></thead>
            <tbody>
              {#each calculatedItems as i}
                <tr>
                  <td><button class="pd-link" on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button></td>
                  <td class="pd-table__amount">{Number(i.calculated_unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span class="pd-table__currency">{t(i.product_buy_currency)}</span></td>
                  <td class="pd-table__amount">{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span class="pd-table__currency">{t(i.currency)}</span></td>
                  <td>{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })} {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>
                  <td><span class:production-benefit--negative={i.benefit < 0} class="production-benefit"><span dir="ltr">{Number(i.benefit).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span> {t(i.currency)}</span></td>
                  <td class="pd-table__amount pd-table__amount--total">{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })} <span class="pd-table__currency">{t(i.currency)}</span></td>
                </tr>
              {:else}
                <tr><td class="pd-table__empty" colspan="6">{t('No data available')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="pd-card">
        <div class="pd-card__head"><h2 class="pd-card__title"><i class="bi bi-gear-wide-connected"></i>{t('Production Operations')}</h2></div>
        <div class="pd-card__scroll">
          <table class="pd-table pd-table--operations">
            <thead><tr>
              <th>#</th><th>{t('Work Center')}</th><th>{t('Name')}{t('-of-')}{t('Operation')}</th><th>{t('Setup Time')}</th><th>{t('Run Time')}</th><th>{t('Cost per Hour')}</th><th>{t('Fixed Cost')}</th>
            </tr></thead>
            <tbody>
              {#each operations as operation, index}
                <tr>
                  <td>{index + 1}</td><td>{operation.work_center_name}</td><td>{operation.operation_name}</td>
                  <td>{operation.setup_time} {operation.setup_time ? t(operation.setup_time_unit) : ''}</td>
                  <td>{operation.run_time} {operation.run_time ? t(operation.run_time_unit) : ''}</td>
                  <td>{operation.cost_per_hour} {operation.cost_per_hour ? t(operation.cost_currency) : ''}</td>
                  <td>{operation.fixed_cost} {operation.fixed_cost ? t(operation.cost_currency) : ''}</td>
                </tr>
              {:else}
                <tr><td class="pd-table__empty" colspan="7">{t('No data available')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {:else if loading}
      <div class="pd-loading-card">{t('Loading')}...</div>
    {:else}
      <div class="pd-loading-card">{t('Production not found.')}</div>
    {/if}
  </div>

  {#if showReceipt}
    <ProductionReceiptModal
      {production}
      on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
      on:close={() => (showReceipt = false)} />
  {/if}

  {#if showA4Receipt}
    <ProductionA4ReceiptModal {production} on:close={() => (showA4Receipt = false)} />
  {/if}

  {#if showDelete}
    <ProductionDeleteModal {production} on:close={() => (showDelete = false)} />
  {/if}

  {#if showEdit}
    <ProductionEditModal {production} on:close={() => (showEdit = false)} />
  {/if}
</div>

<style>
  .production-detail-page {
    width: calc(100% + 1rem);
    min-height: 100%;
    margin: -0.5rem;
    padding-block: 24px;
    background: #f8fafc;
  }

  .production-detail-page__inner {
    width: 100%;
    max-width: 1180px;
    margin-inline: auto;
    padding-inline: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .pd-header-card,
  .pd-card,
  .production-summary-card,
  .pd-loading-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
  }

  .pd-header-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
  }

  .pd-header-card__top,
  .pd-header-card__title-row,
  .pd-header-card__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .pd-header-card__top { justify-content: space-between; }
  .pd-header-card__title-row { flex: 1 1 auto; min-width: 0; }
  .pd-header-card__actions { justify-content: flex-end; gap: 6px; }
  .pd-header-card__title { margin: 0; color: #0f172a; font-size: 1.0625rem; font-weight: 700; }

  .pd-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border: 1px solid;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .pd-status-badge--confirmed { color: #059669; background: #ecfdf5; border-color: #a7f3d0; }
  .pd-status-badge--draft { color: #d97706; background: #fffbeb; border-color: #fde68a; }

  .pd-header-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    margin: 0;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }
  .pd-header-meta__item { min-width: 110px; margin: 0; }
  .pd-header-meta__item--description { flex: 1 1 100%; }
  .pd-header-meta dt { margin-bottom: 3px; color: #64748b; font-size: 11px; font-weight: 500; }
  .pd-header-meta dd { margin: 0; color: #0f172a; font-size: 13px; font-weight: 600; }

  .pd-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }
  .pd-link:hover { text-decoration: underline; }

  .pd-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }
  .pd-btn--primary { color: #fff; background: #0f6efd; border-color: #0f6efd; }
  .pd-btn--secondary { color: #0f6efd; background: #eff6ff; border-color: #bfdbfe; }
  .pd-btn--outline, .pd-btn--neutral { color: #475569; background: #fff; border-color: #e2e8f0; }
  .pd-btn--danger-outline { color: #ef4444; background: #fff; border-color: #fecaca; }
  .pd-btn--icon { padding-inline: 9px; }
  .pd-btn:hover { filter: brightness(.97); }

  .production-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .production-summary-card { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 16px; }
  .production-summary-card__icon {
    display: grid;
    place-items: center;
    flex: 0 0 42px;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    font-size: 18px;
  }
  .production-summary-card__icon--blue { color: #2563eb; background: #eff6ff; }
  .production-summary-card__icon--cyan { color: #0891b2; background: #ecfeff; }
  .production-summary-card__icon--green { color: #059669; background: #ecfdf5; }
  .production-summary-card__label { display: block; margin-bottom: 4px; color: #64748b; font-size: 12px; font-weight: 600; }
  .production-summary-card strong { color: #0f172a; font-size: 16px; font-weight: 700; }

  .pd-card { overflow: hidden; }
  .pd-card__head { padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }
  .pd-card__title { display: flex; align-items: center; gap: 8px; margin: 0; color: #0f172a; font-size: 15px; font-weight: 700; }
  .pd-card__title i { color: #0f6efd; }
  .pd-card__scroll { overflow-x: auto; }
  .pd-table { width: 100%; min-width: 760px; border-collapse: collapse; table-layout: fixed; }
  .pd-table th { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; font-size: 12px; font-weight: 600; text-align: start; white-space: nowrap; }
  .pd-table td { padding: 12px 16px; border-top: 1px solid #f1f5f9; color: #0f172a; font-size: 13px; vertical-align: middle; }
  .pd-table tbody tr:hover td { background: #f8fafc; }
  .pd-table--materials th:first-child, .pd-table--materials td:first-child { width: 24%; }
  .pd-table--materials th:not(:first-child), .pd-table--materials td:not(:first-child) { text-align: start; }
  .pd-table--operations th:first-child, .pd-table--operations td:first-child { width: 6%; }
  .pd-table__amount { font-variant-numeric: tabular-nums; font-weight: 700; white-space: nowrap; }
  .pd-table__amount--total { font-weight: 800; }
  .pd-table__currency { color: #64748b; font-size: 11px; font-weight: 500; }
  .pd-table__empty { padding: 28px !important; color: #94a3b8 !important; text-align: center; }
  .production-benefit { display: inline-flex; gap: 4px; padding: 3px 8px; border-radius: 999px; color: #059669; background: #ecfdf5; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .production-benefit--negative { color: #dc2626; background: #fef2f2; }
  .pd-loading-card { padding: 32px; color: #64748b; text-align: center; }

  @media (max-width: 760px) {
    .production-detail-page { padding-block: 14px; }
    .production-detail-page__inner { padding-inline: 12px; gap: 14px; }
    .pd-header-card__top { align-items: flex-start; }
    .pd-header-card__actions { justify-content: flex-start; width: 100%; }
    .production-summary-grid { grid-template-columns: 1fr; gap: 10px; }
    .production-summary-card { padding: 12px; }
  }
</style>
