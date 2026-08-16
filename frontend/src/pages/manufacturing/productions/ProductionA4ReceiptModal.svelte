<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { productUnitApi } from '../../../api/productUnitApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
  import { productionApi } from '../../../api/productionApi.js';
  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  import { showDate } from '../../../calendar.js';
  import {push} from 'svelte-spa-router';
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { productApi } from '../../../api/productApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let production = {};
  let items = [];
  let payments = [];
  let customer = {};
  let settings = [];
  let units = [];
  let currencies = [];

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  async function loadItems() {
    const full = (await productionApi.getById(production.id))?.data || production;
    const productionItems = (full.items || []).filter((s) => Number(s.status) === 1);

    const productIds = productionItems.map((i) => i.product_id);
    const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

    items = productionItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    payments = (full.payments || []).filter((s) => Number(s.status) === 1);
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadPayments() {
    if (payments.length) return;
    const full = (await productionApi.getById(production.id))?.data || production;
    payments = (full.payments || []).filter((s) => Number(s.status) === 1);
  }

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  async function loadCustomer() {
    customer = await (async () => { const _a = (await accountApi.getById(production.account_id))?.data; return _a && _a.status === 1 ? _a : null; })();
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
      currency_symbol: currencies.find((c) => c.code == production?.currency)?.symbol || '',
    }));
  });

  function printInvoice() {
    const content = document.getElementById('production-content').innerHTML;
    const styles = `
      <style>
        @page { size: A4; margin: 10mm; }
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

  $: total = Number(production?.total_amount || items.reduce((s, i) => s + Number(i.subtotal || 0), 0));
  $: paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  $: due = (total - paid);
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Invoice')} — {production?.production_number}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="production-content" class="production-container">
          <!-- Header -->
          <div class="production-header d-flex justify-content-between align-items-center">
            <div class="">
              <div class="fw-bold fs-3">{settings.find((s) => s.key === 'company_name')?.value || 'Company Name'}</div>
              <div class="fw-bold">{settings.find((s) => s.key === 'company_address')?.value || ''}</div>
              <div class="fw-bold">{settings.find((s) => s.key === 'company_phone')?.value || ''} {settings.find((s) => s.key === 'company_phone2')?.value?" - " + settings.find((s) => s.key === 'company_phone2')?.value : ''}</div>

              <div class="fw-bold">{settings.find((s) => s.key === 'company_email')?.value || ''}</div>
            </div>
            <div class="">
              {#if settings.find((s) => s.key === 'company_logo')?.value}
                <img
                  src={settings.find((s) => s.key === 'company_logo')?.value}
                  style="max-height: 120px"
                  class="company-logo mb-2" />
              {/if}
            </div>
          </div>

          <hr />

          <!-- Customer & Invoice Info -->
          <div class="row mb-4">
            <div class="col-md-6">
              <div class="fw-bold">{t('Product')}: {getAccountName(customer) || 'Walk-in'}</div>
              <div class="fw-bold">{t('Invoice #')}: {production?.production_number}</div>
              <div class="fw-bold">{t('Start Date')}: {@html production?.production_start_date ? showDate(production.production_start_date.slice(0, 10)) : ''}</div>
              <div class="fw-bold">{t('End Date')}: {@html production?.production_end_date ? showDate(production.production_end_date.slice(0, 10)) : ''}</div>
            </div>
          </div>

          <!-- Product Table -->
          <table class="table table-bordered">
            <thead>
              <tr style="border:1px solid #000000;font-size:14pt">
                <th class="p-2 fw-bold">#</th>
                <th class="p-2 fw-bold">{t('Product')}</th>
                <th class="text-center p-2 fw-bold">{t('Qty')}</th>
                <th class="text-center p-2 fw-bold">{t('Unit Price')}</th>
                <th class="text-center p-2 fw-bold">{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {#each items as it, index}
                <tr style="border:1px solid #000000">
                  <td class="p-2 fw-bold">{index+1}</td>
                  <td class="p-2 fw-bold">{it.product_name}</td>
                  <td class="text-center p-2 fw-bold">{Number(it.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {it.unit_name}</td>
                  <td class="text-center p-2 fw-bold">{Number(it.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(it.currency)}</td>
                  <td class="text-center p-2 fw-bold">{Number(it.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(it.currency)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <table class="table w-50 mt-5">
            <tbody class="fw-bold" style="font-size: 14pt;">
              <tr>
                <td class="p-2">{t('Subtotal')}</td>
                <td class="p-2 fw-bold"
                  >{items.reduce((s, i) => s + Number(i.subtotal || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(production?.currency) || ''}</td>
              </tr>
              <tr>
                <td class="p-2">{t('Discount')}</td>
                <td class="p-2 fw-bold">{Number(production?.discount_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(production?.currency) || ''}</td>
              </tr>
              <tr>
                <td class="p-2">{t('Payable')}</td>
                <td class="p-2 fw-bold">{Number(production?.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(production?.currency) || ''}</td>
              </tr>
              <tr>
                <td class="p-2">{t('Due')}</td>
                <td class="p-2 fw-bold">{Number(due).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(production?.currency) || ''}</td>
              </tr>
            </tbody>
          </table>
          <!-- Totals -->
          <!-- Notes -->
          {#if production?.description}
            <div class="mt-4">
              <div class="section-title">{t('Description')}:</div>
              <p>{production?.description || '-'}</p>
            </div>
          {/if}

          <!-- Footer -->
          <div class="footer text-center mt-5 fw-bold" style="bottom:0">
            <hr />
            {t('Powered by ZenoERP • Thank you!')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}>{t('Close')}</button>
        <button class="btn btn-primary" on:click={printInvoice}>{t('Print')}</button>
      </div>
    </div>
  </div>
</div>
