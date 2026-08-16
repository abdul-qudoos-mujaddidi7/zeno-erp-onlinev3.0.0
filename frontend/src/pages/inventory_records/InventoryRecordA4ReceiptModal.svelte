<script>
  import { onMount, createEventDispatcher } from 'svelte';
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n.js';
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';


  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let inventory_record = {};
  let items = [];
  let payments = [];
  let customer = {};
  let settings = [];
  let units = [];
  let currencies = [];

  
  import {calculateDiscountAmount} from './InventoryRecordsHelper.js';
  
  import QRCode from 'qrcode';
import { currencyApi } from '../../api/currencyApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
import { journalApi } from '../../api/journalApi.js';
import { productBrandApi } from '../../api/productBrandApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';
  let dataUrl = '';
  async function loadQRCode() {
    if (!inventory_record?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/inventory_record/' + String(inventory_record.id), {
      width: 100,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  $: if(inventory_record) {
    loadQRCode();
  }


  let editable = false;

  let customer_name = '';
  let customer_phone = '';
  let customer_address = '';

  $: enable_vertical_info = $settings_all.find((s) => s.key === 'enable_vertical_info')?.value == 1;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;

  $: enable_show_qr_code = $settings_all.find((s) => s.key === 'enable_show_qr_code')?.value == 1;
  

  $: enable_full_table = $settings_all.find((s) => s.key === 'enable_full_table')?.value == 1;
  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  $: enable_show_category_in_record =
    $settings_all.find((s) => s.key === 'enable_show_category_in_record')?.value == 1;

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  let generics = [];
  let brands = [];
  let categories = [];
  let inventory_recordItems = [];
  let allJournals = [];
  async function loadItems() {
    if (inventory_record) {
           const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_record.id));
           inventory_recordItems = ((inventory_recordResponse?.data?.items) || [])
  .filter((item) => Number(item.status) === 1)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }


    const genericResponse = await productGenericApi.getAll({ status: 1 });
    generics = genericResponse?.data || [];
    brands = (await productBrandApi.getAll({ status: 1 }))?.data || [];
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];

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
    await loadCustomer();
    if (inventory_record?.account_id) {
    showAccountBalance = calculateAccountBalance(inventory_record.account_id, inventory_record.currency);
    }
    items = items.map((it) => ({
      ...it,
      unit_name: units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol: currencies.find((c) => c.code == inventory_record?.currency)?.symbol || '',
    }));
  });

  function printrecord() {
    const content = document.getElementById('record-content').innerHTML;
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

  .record-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .footer {
  width:100%;
    position: fixed;
    bottom: 0mm;
  }



    .ProseMirror td p,
    .ProseMirror th p {
        margin: 0;
    }

    
	.ProseMirror table {
		border-collapse: collapse;
		width: 100%;
		margin: 1rem 0;
	}

	.ProseMirror th,
	.ProseMirror td {
		border: 1px solid #ccc;
		padding: 4px;
	}

	.ProseMirror th {
		background: #f5f5f5;
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

  $: total = Number(inventory_record?.total_amount || items.reduce((s, i) => s + Number(Number(i.unit_price || 0) * Number(i.quantity || 0)), 0));
  $: paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  $: due = total - paid;

  let showAccountBalance = '';

  let balance = {};

  function calculateAccountBalance(accountId, currency) {
    balance = {};
    allJournals.forEach((j) => {
      if (j.first_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.first_entry_credit || 0) - Number(j.first_entry_debit || 0));
      }
      if (j.second_entry_account === accountId) {
        const currency = j.currency || 'AFN';
        balance[currency] =
          (balance[currency] || 0) + (Number(j.second_entry_credit || 0) - Number(j.second_entry_debit || 0));
      }
    });
    console.log('Calculated balance for account', accountId, balance, allJournals.length);
    return balance.toString
      ? Object.entries(balance)
          .map(
            ([cur, amt]) =>
              `<span class='${amt < 0 ? 'text-danger' : ''}'><span dir='ltr'>${amt.toLocaleString(undefined, { maximumfractiondigits: 3 })}</span> ${t(cur)}</span>`,
          )
          .join(' ')
      : '';
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('record')} — {inventory_record?.record_number}
          <button type="button" class="btn btn-{editable?"success":"warning"} btn-sm px-2" on:click={()=>{
            editable = !editable;
          }}><i class='bi bi-{editable?"save":"pencil"}'></i></button>
        </h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="record-content" class="record-container">
          <!-- Header -->
          <div class="record-header d-flex justify-content-between align-items-center">
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
            <div class="{inventory_record?"":'me-5'}">
            
              {#if inventory_record?.record_status === 'draft'}
                <span class="badge badge-warning text-dark">{t('Draft')}</span>
              {:else if inventory_record?.record_status === 'confirmed'}
                <span class="badge badge-success">{t('confirmed')}</span>
              {/if}

              
        {#if inventory_record?.version && inventory_record?.version > 1}<span class="badge badge-info">{t('Version')} {inventory_record?.version}</span>{/if}
              <div class="{inventory_record?"":'me-5'}"><strong>{t('Record #')}</strong>:  {inventory_record?.record_number}</div>
              <div class="{inventory_record?"":'me-5'}">
                <strong>{t('Date')}: </strong>
                {@html inventory_record?.record_date ? showDate(inventory_record.created_at.slice(0, 10),"justPersian") : ''}
              </div>
              <div class="small {inventory_record?"":'me-5'}" dir="ltr">{inventory_record?.created_at?new Date(inventory_record?.created_at).toLocaleString(): ''}</div>
            </div>
          </div>

          <table class="table table-bordered">
                <tbody class="" style="font-size: 10pt;">
                    <tr>
                      <td class="p-2 py-1"style="width: 35%;">
                        {t('Name')}{t('-of-')}{t('Customer')}: 
                        
                        <strong>
                          {#if editable}
                            <input type='text' class="form-control form-control-sm" bind:value={customer_name} />
                          {:else if customer_name}
                            {customer_name}
                          {:else}
                            {getAccountName(customer) || ''}
                          {/if}
                        </strong>
                      
                      </td>
                      <td class="p-2 py-1"style="width: 30%;">{t('Phone')}{t('-of-')}{t('Customer')}:
                        
                        <strong>
                         {#if editable}
                            <input type='text' class="form-control form-control-sm" bind:value={customer_phone} />
                          {:else if customer_phone}
                            {customer_phone}
                          {:else}
                        {customer?.phone || ''} {customer?.phone2 ? ' - ' + customer?.phone2 : ''}
                      
                          {/if}
                          
                        </strong>
                      </td>
                      <td class="p-2 py-1" style="width: 35%;">{t('Address')}{t('-of-')}{t('Customer')}: 
                        
                        <strong>
                         {#if editable}
                            <input type='text' class="form-control form-control-sm" bind:value={customer_address} />
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

          <!-- Customer & record Info -->

          <!-- Product Table -->
          <table class="table table-bordered">
            <thead>
              <tr style="border:1px solid #e0e0e0;font-size:11pt">
                <th class="p-2 py-1 fw-bold">#</th>
                <th class="p-2 py-1 fw-bold">{t('Product')}</th>
                {#if enable_show_category_in_record}
                  <th class="text-center p-2 py-1 fw-bold">{t('Category')}</th>
                {/if}
                {#if enable_generics}
                  <th class="text-center p-2 py-1 fw-bold">{t('Generic')}</th>
                {/if}
                {#if enable_brands}
                  <th class="text-center p-2 py-1 fw-bold">{t('Brand')}</th>
                {/if}
                {#if enable_batch}
                  <th class="text-center p-2 py-1 fw-bold">{t('Batch')}</th>
                {/if}
                {#if enable_manufacturing_date}
                  <th class="text-center p-2 py-1 fw-bold">{t('Mfg')}</th>
                {/if}
                {#if enable_expiry_date}
                  <th class="text-center p-2 py-1 fw-bold">{t('Expiry')}</th>
                {/if}
                <th class="text-center p-2 py-1 fw-bold">{t('Qty')}</th>
                <th class="text-center p-2 py-1 fw-bold">{t('Price')}</th>
                <th class="text-center p-2 py-1 fw-bold">{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody style="font-size: 9pt;">
              {#each items as it, index}
                {#if index < bill_max_items}
                  <tr style="border:1px solid #e0e0e0;height:25px">
                    <td class="p-2 py-0" style="vertical-align: middle;">{index + 1}</td>
                    <td class="p-2 py-0" style="vertical-align: middle;">{it.product_name}</td>
                    {#if enable_show_category_in_record}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.category_name || '-'}</td>
                    {/if}
                    {#if enable_generics}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.generic_name || '-'}</td>
                    {/if}
                    {#if enable_brands}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.brand_name || '-'}</td>
                    {/if}
                    {#if enable_batch}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.batch || '-'}</td>
                    {/if}
                    {#if enable_manufacturing_date}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">
                        {it.manufacturing_date}
                      </td>
                    {/if}
                    {#if enable_expiry_date}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">
                        {it.expiry_date}
                      </td>
                    {/if}
                    <td class="text-center p-2 py-0" style="vertical-align: middle;"
                      >{Number(it.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {it.unit_name}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;"
                      >{Number(it.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(it.currency)}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;"
                      >{(Number(it.unit_price) * Number(it.quantity || 0)).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(it.currency)}</td>
                  </tr>
                {/if}
              {/each}
              {#if enable_full_table && items.length < bill_max_items}
                {#each Array(bill_max_items - items.length) as _, i}
                  <tr style="border:1px solid #e0e0e0;height:30px">
                    <td class="p-2 py-0" style="vertical-align: middle;">{i + items.length + 1}</td>
                    <td class="p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    {#if enable_generics}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    {/if}
                    {#if enable_brands}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    {/if}
                    {#if enable_batch}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    {/if}
                    {#if enable_manufacturing_date}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;"> &nbsp; </td>
                    {/if}
                    {#if enable_expiry_date}
                      <td class="text-center p-2 py-0" style="vertical-align: middle;"> &nbsp; </td>
                    {/if}
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
          <div class="row">
            {#if enable_vertical_info}
            <div class="col-sm-8">
              <div class="border h-100 p-3" style="border-color:#e0e0e0 !important;">
                <div class="section-title">{inventory_record?.description ? t('Description') : t('Description')}:</div>
                
        <div class='ProseMirror'>
               {@html inventory_record?.description || ''}
        </div>
              </div>
            </div>
            {/if}
            <div class="col-sm-{enable_vertical_info ? 4 : 12}">
              <table class="table mt-3 ">
                <tbody class="" style="font-size: 10pt;">
                  {#if enable_vertical_info}
                    <tr>
                      <td class="p-2 py-1">{t('Total')}</td><td class="p-2 py-1 fw-bold"> {items
                          .reduce((s, i) => s + (Number(Number(i.unit_price || 0) * Number(i.quantity || 0)) || 0), 0)
                          .toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {t(inventory_record?.currency) || ''}</td>
                    </tr>
                  
                  {:else}
                    <tr>
                      <td class="p-2 py-1">{t('Total')}: <strong>{inventory_record?items
                          .reduce((s, i) => s + (Number(Number(i.unit_price || 0) * Number(i.quantity || 0)) || 0), 0)
                          .toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(inventory_record?.currency) || ''}</strong></td>
                        
                    </tr>
                  {/if}
                </tbody>
              </table>
            </div>
            {#if !enable_vertical_info}
              <div class="col-sm-12">
                <div class="border h-100 p-3" style="border-color:#e0e0e0 !important;">
                  <div class="section-title">{inventory_record?.description ? t('Description') : t('Description')}:</div>
                  
        <div class='ProseMirror'>
                  {@html inventory_record?.description || ''}
        </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Totals -->
          <!-- Notes -->

          <!-- Footer -->

          <div class="footer small text-primary">
            <hr class="mt-5" />
            {#if enable_show_qr_code}
            <img src={dataUrl} class="qrcode-img float-end" style="max-height: 50px;" />
            {/if}
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
        <button class="btn btn-primary" disabled={editable} on:click={printrecord}>{t('Print')}</button>
      </div>
    </div>
  </div>
</div>



<style>

    :global(.ProseMirror td p),
    :global(.ProseMirror th p) {
        margin: 0;
    }

</style>
