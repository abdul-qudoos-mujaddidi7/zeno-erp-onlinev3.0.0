<script>
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import BOMReceiptModal from './BOMReceiptModal.svelte';
  import BOMDeleteModal from './BOMDeleteModal.svelte';
  import BOMEditModal from './BOMEditModal.svelte';
  import { push } from 'svelte-spa-router';
  import { bomApi } from '../../../api/bomApi.js';
  import { workCenterApi } from '../../../api/workCenterApi.js';

  import { showDate } from '../../../calendar.js';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import { productApi } from '../../../api/productApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let bomId;
  const dispatch = createEventDispatcher();

  let showReturn = false;
  let paymentSectionKey = 0;
  let bom;
  let items = [];
  let operations = [];

  let product = null;
  let unit = null;
  let showReceipt = false;
  let supplier = null;
  let units = [];

  let showDelete = false;
  let showEdit = false;

  let work_centers = [];

  onMount(async () => {
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
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
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
  });
</script>

<div class="card shadow-2 mb-3">
  <div class="card-body">
    <div class="float-end">
      <button class="btn btn-primary btn-sm me-2" on:click={() => (showReceipt = true)}
        ><i class="bi bi-printer me-2"></i>{t('Print')}</button>
      <button class="btn btn-danger btn-sm me-2" on:click={() => (showDelete = true)}
        ><i class="bi bi-trash me-2"></i>{t('Delete')}</button>

      {#if bom?.bill_status === 'confirmed'}
        <button class="btn btn-info btn-sm me-2" on:click={() => (showEdit = true)}
          ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
      {:else}
        <button class="btn btn-warning btn-sm me-2" on:click={() => push(`/dashboard/bom-form/${bomId}`)}
          ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
      {/if}
    </div>
    <div class="mb-3">
      {#if bom?.bill_status === 'draft'}
        <span class="badge badge-warning text-dark mb-3">{t('Draft')}</span>
      {:else if bom?.bill_status === 'confirmed'}
        <span class="badge badge-success mb-3">{t('confirmed')}</span>
      {/if}
      <h5 class="mb-3">
        {t('BOM #')}
        {bom?.bill_number}
      </h5>

      <strong>{t('Date')}:</strong>
      {@html bom?.bill_date ? showDate(bom.bill_date) : '-'}<br />

      <strong>{t('Product')}:</strong>
      {@html bom?.product_id ? product?.name : '-'}<br />
      <strong>{t('Quantity')}:</strong>
      {@html bom?.quantity ? bom?.quantity : '-'}
      {@html unit?.name || '-'} <br />

      <br />
      {#if bom?.description}<strong>{t('Description')}:</strong>
        {bom?.description || t('No description.')}<br />{/if}
    </div>

    <h5>{t('BOM Items')}</h5>

    <div class="table-responsive">
      <table class="table table-striped">
        <thead class="table-light">
          <tr>
            <th>{t('Product')}</th>
            <th class="text-end">{t('Buy Price')}</th>
            <th class="text-end">{t('Wastage Percent')}</th>
            <th class="text-end">{t('Quantity')}</th>
            <th class="text-end">{t('Total Price')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as i}
            <tr>
              <td>
                <button
                  class="btn btn-link text-primary btn-sm"
                  on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button>
              </td>

              <td class="text-end"
                >{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {t(i.currency)}</td>
              <td class="text-end"
                >{Number(i.wastage_percent).toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
              <td class="text-end"
                >{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>
              <td class="text-end"
                >{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {t(i.currency)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h5 class="mt-4">{t('BOM Operations')}</h5>
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
  <BOMReceiptModal {bom} on:close={() => (showReceipt = false)} />
{/if}

{#if showDelete}
  <BOMDeleteModal {bom} on:close={() => (showDelete = false)} />
{/if}

{#if showEdit}
  <BOMEditModal {bom} on:close={() => (showEdit = false)} />
{/if}
