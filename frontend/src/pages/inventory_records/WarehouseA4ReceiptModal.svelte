<script>
  import { onMount, createEventDispatcher } from 'svelte';
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';
  import QRCode from 'qrcode';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
import { journalApi } from '../../api/journalApi.js';
import { productBrandApi } from '../../api/productBrandApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let inventory_record = {};
  export let selectedItem = null;
  let items = [];
  let payments = [];
  let customer = {};
  let settings = [];
  let units = [];
  let currencies = [];

  let dataUrl = '';
  async function loadQRCode() {
    if (!inventory_record?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/whbill/' + String(inventory_record.id), {
      width: 100,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  $: if (inventory_record) {
    loadQRCode();
  }

  let editable = false;

  let warehouse_name = '';
  let warehouse_manager = '';
  let customer_name = '';
  let customer_phone = '';
  let customer_address = '';

  $: enable_vertical_info = $settings_all.find((s) => s.key === 'enable_vertical_info')?.value == 1;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;

  $: enable_full_table = $settings_all.find((s) => s.key === 'enable_full_table')?.value == 1;
  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  $: enable_show_category_in_invoice =
    $settings_all.find((s) => s.key === 'enable_show_category_in_invoice')?.value == 1;

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  let generics = [];
  let brands = [];
  let categories = [];
  let inventory_recordItems = [];
  let warehouses = [];
  let allJournals = [];
  async function loadItems() {
    if (inventory_record) {
      const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_record.id));
      inventory_recordItems = ((inventory_recordResponse?.data?.items) || []).filter(
        (item) => Number(item.status) === 1,
      );
    }

    const genericResponse = await productGenericApi.getAll({ status: 1 });
    generics = genericResponse?.data || [];
    brands = (await productBrandApi.getAll({ status: 1 }))?.data || [];
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];

    const productIds = inventory_recordItems.map((i) => i.product_id);
    const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

    items = inventory_recordItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        generic_name: generics.find((g) => g.id === product?.generic_id)?.name || '',
        brand_name: brands.find((b) => b.id === product?.brand_id)?.name || '',
        category_name: categories.find((c) => c.id === product?.category_id)?.name || '',
        batch: i.batch || product?.batch || null,
        manufacturing_date: i.manufacturing_date || product?.manufacturing_date || null,
        expiry_date: i.expiry_date || product?.expiry_date || null,
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];

    allJournals = (await journalApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadPayments() {
    if (!inventory_record?.id) return;
    const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_record.id));
    payments = (inventory_recordResponse?.data?.payments || []).filter(
      (payment) => Number(payment.status) === 1,
    );
  }

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || '';
    return out;
  }

  async function loadCustomer() {
    if (!inventory_record?.account_id) return;
    customer = await (async () => { const _a = (await accountApi.getById(inventory_record.account_id))?.data; return _a && _a.status === 1 ? _a : null; })();
  }

  async function loadUnits() {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    await loadUnits();
    await loadCurrencies();
    await loadItems();
    await loadPayments();
    await loadCustomer();
    items = items.map((it) => ({
      ...it,
      unit_name: units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol: currencies.find((c) => c.code == inventory_record?.currency)?.symbol || '',
    }));
  });

  function printInvoice() {
    const content = document.getElementById('invoice-content').innerHTML;
    const styles = `
<style>
  @page {
    size: A4;
    margin: 10mm;
  }

  html, body {
    height: 100%;
    margin: 0;
  }

  .invoice-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .footer {
    width:100%;
    position: fixed;
  }
</style>
`;
    const w = window.open('', '_blank');
    w.document.write(/*html*/ `
       
       <!doctype html><html ${t('dir=ltr')}><head><meta charset="utf-8">
        
        
        
        ${styles}

        <link rel='stylesheet' href='/fonts/vazirmatn.css'>
        <link rel='stylesheet' href='/css/mdb.rtl.min.css'>
        
        </head>
        <body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          {t('Bill')}{t('-of-')}{t('Warehouse')} — {inventory_record?.invoice_number}
          <button
            type="button"
            class="btn btn-{editable ? 'success' : 'warning'} btn-sm px-2"
            on:click={() => {
              editable = !editable;
            }}><i class="bi bi-{editable ? 'save' : 'pencil'}"></i></button>
        </h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="invoice-content" class="invoice-container">
          <!-- Header -->
          <div class="invoice-header d-flex justify-content-between align-items-center">
            <div class=" d-flex justify-content-between align-items-center">
              {#if settings.find((s) => s.key === 'company_logo')?.value}
                <img
                  src={settings.find((s) => s.key === 'company_logo')?.value}
                  style="max-height: 120px"
                  class="company-logo me-2" />
              {/if}

              <div>
                <div class="fw-bold fs-5">
                  {settings.find((s) => s.key === 'company_name')?.value || 'Company Name'}
                </div>
                <div class="fw-bold small">{settings.find((s) => s.key === 'company_address')?.value || ''}</div>
                <div class="fw-bold small">
                  {settings.find((s) => s.key === 'company_phone')?.value || ''}
                  {settings.find((s) => s.key === 'company_phone2')?.value
                    ? ' - ' + settings.find((s) => s.key === 'company_phone2')?.value
                    : ''}
                </div>

                <div class="fw-bold">{settings.find((s) => s.key === 'company_email')?.value || ''}</div>
              </div>
            </div>
            <div class={inventory_record ? '' : 'me-5'}>
              {#if inventory_record?.invoice_status === 'draft'}
                <span class="badge badge-warning text-dark">{t('Draft')}</span>
              {:else if inventory_record?.invoice_status === 'confirmed'}
                <span class="badge badge-success">{t('confirmed')}</span>
              {/if}

              {#if inventory_record?.version && inventory_record?.version > 1}<span class="badge badge-info"
                  >{t('Version')} {inventory_record?.version}</span
                >{/if}
              <div class={inventory_record ? '' : 'me-5'}>
                <strong>{t('Bill')}{t('-of-')}{t('Warehouse')}</strong>: {inventory_record?.invoice_number}
              </div>
              <div class={inventory_record ? '' : 'me-5'}>
                <strong>{t('Date')}: </strong>
                {@html inventory_record?.invoice_date ? showDate(inventory_record.created_at.slice(0, 10), 'justPersian') : ''}
              </div>
              <div class="small {inventory_record ? '' : 'me-5'}" dir="ltr">
                {inventory_record?.created_at ? new Date(inventory_record?.created_at).toLocaleString() : ''}
              </div>
            </div>
          </div>

          <table class="table table-bordered">
            <tbody class="" style="font-size: 10pt;">
              <tr>
                <td class="p-2 py-1" style="width: 35%;">
                  {t('Name')}{t('-of-')}{t('Warehouse')}:

                  <strong>
                    {#if editable}
                      <input type="text" class="form-control form-control-sm" bind:value={warehouse_name} />
                    {:else if warehouse_name}
                      {warehouse_name}
                    {:else}
                      {warehouses.find((wh) => wh.id == inventory_record?.warehouse_id)?.name || ''}
                    {/if}
                  </strong>
                </td>
                <td class="p-2 py-1" style="width: 35%;">
                  {t('Manager')}{t('-of-')}{t('Warehouse')}:

                  <strong>
                    {#if editable}
                      <input type="text" class="form-control form-control-sm" bind:value={warehouse_manager} />
                    {:else if warehouse_manager}
                      {warehouse_manager}
                    {:else}
                      {warehouses.find((wh) => wh.id == inventory_record?.warehouse_id)?.manager_name || ''}
                    {/if}
                  </strong>
                </td>
                <td class="p-2 py-1" style="width: 35%;">
                  {t('Location')}{t('-of-')}{t('Warehouse')}:
                  <strong>
                    {warehouses.find((wh) => wh.id == inventory_record?.warehouse_id)?.location || ''}
                  </strong>
                </td>
              </tr>
              <tr>
                <td class="p-2 py-1" style="width: 35%;">
                  {t('Name')}{t('-of-')}{t('Customer')}:

                  <strong>
                    {#if editable}
                      <input type="text" class="form-control form-control-sm" bind:value={customer_name} />
                    {:else if customer_name}
                      {customer_name}
                    {:else}
                      {getAccountName(customer) || ''}
                    {/if}
                  </strong>
                </td>
                <td class="p-2 py-1" style="width: 30%;"
                  >{t('Phone')}{t('-of-')}{t('Customer')}:

                  <strong>
                    {#if editable}
                      <input type="text" class="form-control form-control-sm" bind:value={customer_phone} />
                    {:else if customer_phone}
                      {customer_phone}
                    {:else}
                      {customer?.phone || ''} {customer?.phone2 ? ' - ' + customer?.phone2 : ''}
                    {/if}
                  </strong>
                </td>
                <td class="p-2 py-1" style="width: 35%;"
                  >{t('Address')}{t('-of-')}{t('Customer')}:

                  <strong>
                    {#if editable}
                      <input type="text" class="form-control form-control-sm" bind:value={customer_address} />
                    {:else if customer_address}
                      {customer_address}
                    {:else}
                      {customer?.address || ''}
                    {/if}
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Customer & Invoice Info -->
          <div class="row">
            {#each items as it, index}
              {#if selectedItem && selectedItem.id == it.id}
                <div class="col-4 mb-3">
                  <div class="p-2 py-0" style="vertical-align: middle;">
                    {t('Product')}: <strong>{it.product_name}</strong>
                  </div>
                </div>
                {#if enable_show_category_in_invoice}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Category')}: <strong>{it.category_name || '-'}</strong>
                    </div>
                  </div>
                {/if}
                {#if enable_generics}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Generic')}: <strong>{it.generic_name || '-'}</strong>
                    </div>
                  </div>
                {/if}
                {#if enable_brands}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Brand')}: <strong>{it.brand_name || '-'}</strong>
                    </div>
                  </div>
                {/if}
                {#if enable_batch}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Batch')}: <strong>{it.batch || '-'}</strong>
                    </div>
                  </div>
                {/if}
                {#if enable_manufacturing_date}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Mfg')}: <strong>{it.manufacturing_date}</strong>
                    </div>
                  </div>
                {/if}
                {#if enable_expiry_date}
                  <div class="col-4 mb-3">
                    <div class="p-2 py-0" style="vertical-align: middle;">
                      {t('Expiry')}: <strong>{it.expiry_date}</strong>
                    </div>
                  </div>
                {/if}
                <div class="col-4 mb-3">
                  <div class="p-2 py-0" style="vertical-align: middle;">
                    {t('Qty')}: <strong>{Number(it.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {it.unit_name}</strong>
                  </div>
                </div>
              {/if}
            {/each}
          </div>

          <div class="text-end" style="padding:0px 100px">{t("Signature")}</div>
          <!-- Totals -->
          <!-- Notes -->

          <!-- Footer -->

          <div class="footer small text-primary">
            <hr class="mt-3" />
            <img src={dataUrl} class="qrcode-img float-end" style="max-height: 50px;" />
            <div class="float-start" style="font-size:8pt">
              <img src="/img/logo.png" height="20" /><br />
              {t('Powered by ZenoERP • Thank you!')}<br />

              <strong>{t('www.zenoerp.com')}</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}>{t('Close')}</button>
        <button class="btn btn-primary" disabled={editable} on:click={printInvoice}>{t('Print')}</button>
      </div>
    </div>
  </div>
</div>
