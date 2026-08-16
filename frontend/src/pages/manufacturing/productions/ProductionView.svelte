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
  import ProductionReturnModal from './ProductionReturnModal.svelte';
  import { currencyApi } from '../../../api/currencyApi.js';
  import { accountApi } from '../../../api/accountApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { productionApi } from '../../../api/productionApi.js';
  import { workCenterApi } from '../../../api/workCenterApi.js';
  export let productionId;
  const dispatch = createEventDispatcher();

  let paymentSectionKey = 0;
  let production;
  let products = [];
  let work_centers = [];
  let currencies = [];
  let items = [];
  let operations = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let customer = null;
  let units = [];
  let showReturn = false;
  let showDelete = false;
  let showEdit = false;
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

<div>
  <div class="card shadow-2 mb-3">
    <div class="card-body">
      <div class="float-end hide-for-pdf d-none">
        <button class="btn btn-primary btn-sm me-2" on:click={() => (showReceipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')} 80mm</button>
        <button class="btn btn-primary btn-sm me-2" on:click={() => (showA4Receipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')} A4</button>
        <button class="btn btn-danger btn-sm me-2" on:click={() => (showDelete = true)}
          ><i class="bi bi-trash me-2"></i>{t('Delete')}</button>
        {#if production?.production_status === 'confirmed'}
          <button class="btn btn-warning btn-sm me-2" on:click={() => (showReturn = true)}
            ><i class="bi bi-arrow-return-left me-2"></i>{t('Return')}</button>
          <button class="btn btn-info btn-sm me-2" on:click={() => (showEdit = true)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {:else}
          <button
            class="btn btn-warning btn-sm me-2"
            on:click={() => push(`/dashboard/production-form/${productionId}`)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {/if}
      </div>
      <div class="mb-3">
        {#if production?.production_status === 'draft'}
          <span class="badge badge-warning text-dark mb-3">{t('Draft')}</span>
        {:else if production?.production_status === 'confirmed'}
          <span class="badge badge-success mb-3">{t('confirmed')}</span>
        {/if}
        <h5 class="mb-3">
          {t('Production #')}:
          {production?.production_number}
        </h5>
        <strong>{t('Start Date')}:</strong>
        {@html production?.production_start_date ? showDate(production.production_start_date) : '-'}<br />
        <strong>{t('End Date')}:</strong>
        {@html production?.production_end_date ? showDate(production.production_end_date) : '-'}<br />
        <strong>{t('Created Date')}:</strong>
        <span dir="ltr">{@html production?.created_at ? new Date(production.created_at).toLocaleString() : '-'}</span
        ><br />
        <strong>{t('Updated Date')}:</strong>
        <span dir="ltr">{@html production?.updated_at ? new Date(production.updated_at).toLocaleString() : '-'}</span
        ><br />
        <div class="fs-5 mt-2">
          <strong>{t('Produced Product')}:</strong>
          <button
            class="btn btn-link fw-bold fs-5 text-primary btn-lg py-1 px-2"
            on:click={() => push(`/dashboard/product/${production?.product_id}`)}>
            {@html production?.product_id ? product?.name : '-'}<br />
          </button>
        </div>
        <div class="fs-5 mt-2">
          <strong>{t('Quantity')}:</strong>
          {@html production?.quantity ? production?.quantity : '-'}
          {@html unit?.name || '-'} <br />
        </div>
        <div class="fs-5 mt-2">
          <strong>{t('Total Cost')}:</strong>
          {@html production?.total_amount
            ? production?.total_amount.toLocaleString(undefined, { maximumFractionDigits: 3 })
            : '-'}
          {@html t(production?.currency || '-')} <br />
        </div>
        <div class="fs-5 mt-2">
          <strong>{t('Cost')}{t('-of-')} {t('per')} {t('Product')}:</strong>
          {@html production?.total_amount
            ? (production?.total_amount / production?.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })
            : '-'}
          {@html t(production?.currency || '-')} <br />
        </div>
        <br />
        {#if production?.description}<strong>{t('Description')}:</strong>
          {production?.description || t('No description.')}<br />{/if}
      </div>
      <h5 class="mb-0">{t('Production Materials')}</h5>
      <div class="table-responsive">
        <table class="table table-striped">
          <thead class="table-light">
            <tr>
              <th>{t('Product')}</th>
              <th class="text-center">{t('Buy Price')}</th>
              <th class="text-center">{t('Sell Price')}</th>
              <th class="text-center">{t('Quantity')}</th>
              <th class="text-center">{t('Benefit')}</th>
              <th class="text-center">{t('Total Price')}</th>
            </tr>
          </thead>
          <tbody>
            {#each calculatedItems as i}
              <tr>
                <td class="fw-bold">
                  <button
                    class="btn btn-link text-primary btn-sm fw-bold px-2"
                    on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button>
                </td>
                <td class="text-center fw-bold"
                  >{Number(i.calculated_unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(i.product_buy_currency)}</td>
                <td class="text-center fw-bold"
                  >{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(i.currency)}</td>
                <td class="text-center fw-bold"
                  >{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>
                <td class="text-center fw-bold">
                  <span class="badge badge-{i.benefit >= 0 ? 'success' : 'danger'}">
                    <span dir="ltr"> {Number(i.benefit).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                    {t(i.currency)}
                  </span>
                </td>
                <td class="text-center fw-bold"
                  >{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(i.currency)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <h5 class="mt-4">{t('Production Operations')}</h5>
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>{t('Work Center')}</th>
              <th>{t('Name')}{t('-of-')}{t('Operation')}</th>
              <th>{t('Setup Time')}</th>
              <th>{t('Run Time')}</th>
              <th>{t('Cost per Hour')}</th>
              <th>{t('Fixed Cost')}</th>
              <th class="d-none">{t('Labor Count')}</th>
              <th class="d-none">{t('Efficiency')}</th>
            </tr>
          </thead>
          <tbody>
            {#each operations as operation, index}
              <tr>
                <td>{index + 1}</td>
                <td>{operation.work_center_name}</td>
                <td>{operation.operation_name}</td>
                <td>{operation.setup_time} {operation.setup_time ? t(operation.setup_time_unit) : ''}</td>
                <td>{operation.run_time} {operation.run_time ? t(operation.run_time_unit) : ''}</td>
                <td>{operation.cost_per_hour} {operation.cost_per_hour ? t(operation.cost_currency) : ''}</td>
                <td>{operation.fixed_cost} {operation.fixed_cost ? t(operation.cost_currency) : ''}</td>
                <td class="d-none">{operation.labor_count}</td>
                <td class="d-none">{operation.efficiency}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
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

  {#if showReturn}
    <ProductionReturnModal
      {production}
      on:close={async () => {
        showReturn = false;
        paymentSectionKey += 1;
      }} />
  {/if}
</div>
