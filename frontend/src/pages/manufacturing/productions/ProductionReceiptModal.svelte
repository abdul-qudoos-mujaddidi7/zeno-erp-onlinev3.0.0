<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { productUnitApi } from '../../../api/productUnitApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
  import { productionApi } from '../../../api/productionApi.js';

  import { t, lang, translate_org_type,shortID } from '../../../i18n/i18n.js';
  import { amountInWords } from '../../../utils/amountInWords.js';
  import { currencyLabels } from '../../../utils/currencyLabel.js';

  /* The bill's own amount, spelled out under the figures. */
  $: totalInWords = amountInWords(total, $lang, currencyLabels(production?.currency, t));
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  import { showDate } from '../../../calendar.js';
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { productApi } from '../../../api/productApi.js';

  export let production = {};
  let items = [];
  let payments = [];
  let customer = {};
  let settings = [];
  let units = [];
  let currencies = [];
  let addressEl;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function showA4() {
    dispatch('showA4');
  }

  let accountBalances = {};
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
    accountBalances = (await accountApi.getBalances({ status: 1 }))?.data || {};
  }

  async function loadPayments() {
    if (payments.length) return;
    const full = (await productionApi.getById(production.id))?.data || production;
    payments = (full.payments || []).filter((s) => Number(s.status) === 1);
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

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
  onMount(async () => {
    // Load all dependencies in order
    await loadUnits(); // <-- await this first
    await loadCurrencies(); // <-- await this second
    await loadItems(); // items depend on products
    await loadPayments();
    await loadCustomer();


    showAccountBalance = calculateAccountBalance(production.account_id, production.currency);

    // Map unit names directly to items to simplify template
    items = items.map((it) => ({
      ...it,
      unit_name: units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol: currencies.find((c) => c.code == production?.currency)?.symbol || '',
    }));

    await tick(); // import from 'svelte'

    fitText(addressEl);
  });
  function printReceipt() {
    const content = document.getElementById('receipt-content').innerHTML;
    const styles = `
        <style>
          .receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
          }

          table {
  table-layout: fixed;
  width: 100%;
}

td, th {
  word-break: break-word;
}
         .underbrand {
    font-size: 12px;
    font-weight: 700;

    white-space: nowrap; /* ❗ FORCE ONE LINE */
    overflow: hidden;
    text-overflow: clip;

    display: block;
    width: 100%;
    text-align: center;
  }

  * {
    box-sizing: border-box;
  }

.nowrap {
  white-space: nowrap;
}
  .receipt * {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
    .underbrand {
    font-size: 12px;
    font-weight: 700;

    display: -webkit-box;
    -webkit-line-clamp: 2; /* 👈 LIMIT TO 2 LINES */
    -webkit-box-orient: vertical;

    overflow: hidden;
    word-break: break-word;
  }
body { margin: 0; }
       
table {border-bottom: 2px solid #000 !important}
td {border-bottom: 1px solid #000 !important;font-size:10pt !important;padding:4px 4px  !important;}
th {border-bottom: 2px solid #000 !important;border-top: 2px solid #000 !important;font-size:11pt  !important;}

          @page { size: 74mm auto; margin: 0; }

.underbrand { font-size: 12px; }
.center { text-align: center; }
.small { font-size: 11px; }
.divider { border-top: 1px solid #000; margin: 6px 0; }

* {color:#000000 !important;}
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

  function fitText(el, maxFont = 12, minFont = 6) {
    if (!el) return;

    let low = minFont;
    let high = maxFont;
    let best = minFont;

    while (low <= high) {
      let mid = (low + high) / 2;

      el.style.fontSize = mid + 'px';

      if (el.scrollWidth <= el.clientWidth) {
        best = mid;
        low = mid + 0.5;
      } else {
        high = mid - 0.5;
      }
    }

    el.style.fontSize = best + 'px';
  }

  $: total = Number(
    production?.total_amount || (items && items.length ? items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) : 0),
  );
  $: paid = payments && payments.length ? payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) : 0;
  $: due = Number(total - paid);





let showAccountBalance = "-";

    let balance = {};

  function calculateAccountBalance(accountId, currency) {
    balance = accountBalances[accountId] || accountBalances[String(accountId)] || {};
    console.log('Calculated balance for account', accountId, balance);
    return balance.toString
      ? Object.entries(balance)
          .map(([cur, amt]) => `<span dir='ltr'>${amt.toLocaleString(undefined,{maximumFractionDigits: 3})}</span> ${t(cur)}`
          )
          .join(' ')
      : '';
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-dialog-centered" style="max-width: 310px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {production?.production_number}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="receipt-content">
          <div class="receipt">
            <div class="center">
              {#if settings.find((s) => s.key === 'company_logo')?.value}
                <img
                  src={settings.find((s) => s.key === 'company_logo')?.value}
                  alt="Company Logo"
                  style="max-width: 100px; max-height: 50px;" />
              {/if}
              {#if settings.find((s) => s.key === 'company_name')?.value}
                <div class="brand mt-2">{settings.find((s) => s.key === 'company_name')?.value || 'Zeno ERP'}</div>
              {/if}
              {#if settings.find((s) => s.key === 'company_address')?.value}
                <div class="underbrand fw-bold mb-1" bind:this={addressEl}>
                  {settings.find((s) => s.key === 'company_address')?.value || 'Company Address'}
                </div>
              {/if}
              {#if settings.find((s) => s.key === 'company_phone')?.value}
                <div class="underbrand fw-bold">
                  {settings.find((s) => s.key === 'company_phone')?.value || 'Company Phone'}
                  {#if settings.find((s) => s.key === 'company_phone2')?.value}
                    - {settings.find((s) => s.key === 'company_phone2')?.value || 'Company Phone 2'}
                  {/if}
                </div>
              {/if}

              {#if settings.find((s) => s.key === 'company_email')?.value}
                <div class="underbrand fw-bold">
                  {settings.find((s) => s.key === 'company_email')?.value || 'Company Email'}
                </div>
              {/if}
              <!-- <div class="muted">123 Business St, City</div>
              <div class="muted">Tel: 000-000-000</div> -->
            </div>
            <div class="divider"></div>

            <div class="mb-2">
                {t('Date')}:  <span class='fw-bold'>{@html production?.production_end_date ? showDate(production?.production_end_date.slice(0, 10), 'receipt') : ''}</span>
              <small class="float-end"> <span class='fw-bold'>{production?.production_end_date.slice(0, 10)}</span></small>
            </div>

            <div  class="float-end"><small>{t('Invoice #')}: <span class='fw-bold'>{production?.production_number}</span></small></div>
   {#if customer?.id > 100000}
              <div class="">
                <small>
                  {t('Number')}
                  {t('Account')}: <span class='fw-bold'>{shortID(customer?.id) || '-'}</span>
                </small>
              </div>
            {/if}
            <div><small>{t('Customer')}: <span class='fw-bold'>{getAccountName(customer) || production?.description || 'Walk-in'}</span></small></div>
         

            <table border="0" cellpadding="3" cellspacing="0" class="w-100 mt-2">
              <thead> </thead>
              <tbody>
                <tr class="">
                  <th width="45%">{t('Product')}</th>
                  <th class="center">{t('Qty')}</th>
                  <th class="center">{t('Price')}</th>
                  <th class="center">{t('Subtotal')}</th>
                </tr>
                {#each items as it}
                  <tr class="">
                    <td style="vertical-align:top" class="product-name fw-bold">{it.product_name}</td>

                    <td class="center fw-bold">
                      <span class="nowrap">
                        {Number(it.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {it.unit_name}
                      </span>
                    </td>
                    <td class="center fw-bold"
                      ><span class="nowrap">
                      {Number(it.unit_price).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}&nbsp;{it.currency_symbol}</span>
                    </td>
                    <td class="center fw-bold"
                      ><span class="nowrap">{Number(it.subtotal).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}&nbsp;{it.currency_symbol}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            <div class="totals small mt-3">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Subtotal')} {t('Bill')}</div>
                <div class="right fw-bold">
                  {items
                    .reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
                    .toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(production?.currency) || ''}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Discount')}</div>
                <div class="right fw-bold">
                  {production?.discount_amount
                    ? Number(production?.discount_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                    : 0}
                  {t(production?.currency) || ''}
                </div>
              </div>
              <div class="fw-bold" style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Bill Received')}</div>
                <div class="right fw-bold">
                  {Number(paid || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(production?.currency) || ''}
                </div>
              </div>

              <!-- The amount stated twice: the figures above, the words here. -->
              <div class="words-line" style="margin-top:6px;">
                <span dir="ltr">{totalInWords}</span>
              </div>

              <!-- <div style="display:flex;justify-content:space-between;font-weight:700;font-size:13px;"><div>{t("Total")}</div><div class="right">{total.toFixed(2)} {t(production?.currency) || ''}</div></div> -->
              {#if due > 0}
                <div style="display:flex;justify-content:space-between;color:#d9534f;margin-top:4px;">
                  <div class="fw-bold">{t('Old Balance')}</div>
                  <div class="right fw-bold">
                    <span dir='ltr'>{balance[production?.currency]?Number(balance[production?.currency]+due||0).toLocaleString(undefined,{maximumFractionDigits: 3}):"---"}</span>
                    {t(production?.currency) || ''}
                  </div>
                </div>
              {/if}
                {#if customer?.code != "WALKIN"}
            <div class="divider"></div>

                <div style="display:flex;justify-content:space-between;color:#d9534f;margin-top:4px;">
                  <div class="fw-bold">{t('Now Balance')}</div>
                  <div class="right fw-bold">
                    {@html showAccountBalance}
                  </div>
                </div>
            {/if}
            </div>

            <div class="divider"></div>
            <div class="center small fw-bold">
              {t('Powered by ZenoERP • Thank you!')}
            </div>

            <div class="center small">
              www.zenoerp.com
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}><i class="bi bi-x-lg"></i> {t('Close')}</button>

        <button class="btn btn-info px-2" on:click={showA4}><i class="bi bi-file-earmark-pdf"></i> {t('A4')}</button>

        <button class="btn btn-primary" on:click={printReceipt}><i class="bi bi-printer"></i> {t('Print')}</button>
      </div>
    </div>
  </div>
</div>

<style>
  table {
    border-bottom: 2px solid #000 !important;
  }
  td {
    border-bottom: 1px solid #000 !important;
    font-size: 10pt !important;
    padding: 4px 4px !important;
  }
  th {
    border-bottom: 2px solid #000 !important;
    border-top: 2px solid #000 !important;
    font-size: 11pt !important;
  }

  .brand {
    font-size: 16px;
    font-weight: 700;
  }
  .receipt {
    width: 74mm;
    padding: 8px 4px;
    max-width: 74mm;
    overflow: hidden;
    word-wrap: break-word;
    word-break: break-word;
  }
  * {
    box-sizing: border-box;
  }

  .receipt * {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
  table {
    table-layout: fixed;
    width: 100%;
  }
  .nowrap {
    white-space: nowrap;
  }
  td,
  th {
    word-break: break-word;
  }
  /* .underbrand {
    font-size: 12px;
    font-weight: 700;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
  } */
  .underbrand {
    font-size: 12px;
    font-weight: 700;

    white-space: nowrap; /* ❗ FORCE ONE LINE */
    overflow: hidden;
    text-overflow: clip;

    display: block;
    width: 100%;
    text-align: center;
  }
  .center {
    text-align: center;
  }
  .divider {
    border-top: 1px solid #000;
    margin: 6px 0;
  }

  * {
    color: #000000 !important;
  }
</style>
