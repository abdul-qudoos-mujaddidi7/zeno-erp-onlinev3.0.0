<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';

  import { productGenericApi } from '../../api/productGenericApi.js';
  import { saleApi } from '../../api/saleApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import AppModal from '../../components/common/AppModal.svelte';

  import { t, lang, translate_org_type, shortID, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;

  import { push } from 'svelte-spa-router';
  
  import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';
  import { calculateDiscountAmount } from './SalesHelper.js';

  import { showDate } from '../../calendar.js';
import { currencyApi } from '../../api/currencyApi.js';

  export let sale = {};
  export let items = [];
  export let payments = [];
  export let customer = {};
  export let units = [];
  export let currencies = [];
  $: settings = $settings_all || [];
  let generics = [];
  let addressEl;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function showA4() {
    dispatch('showA4');
  }

  let allJournals = [];
  async function loadItems() {
    const saleResponse = await saleApi.getById(Number(sale.id));
    const saleItems = ((saleResponse?.data?.items) || [])
      .filter((item) => Number(item.status) === 1)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const [products, genericResponse] = await Promise.all([
      fetchProductsByIds(saleItems.map((item) => item.product_id)),
      enable_generics
        ? productGenericApi.getAll({ status: 1 })
        : Promise.resolve({ data: [] }),
    ]);
    generics = genericResponse?.data || [];

    items = saleItems.map((i) => {
      const product = products.find((p) => Number(p.id) === Number(i.product_id));
      return {
        ...i,
        product_name: product?.name || i.product_name || 'Unknown',
        generic_name: generics.find((g) => Number(g.id) === Number(product?.generic_id))?.name || '',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });
  }

  async function loadPayments() {
    const saleResponse = await saleApi.getById(Number(sale.id));
    payments = (saleResponse?.data?.payments || []).filter(
      (payment) => Number(payment.status) === 1,
    );
  }

  async function loadCustomer() {
    const customerResponse = await accountApi.getById(sale.account_id);
    customer = customerResponse?.data || {};
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
    const tasks = [];
    if (!units?.length) tasks.push(loadUnits());
    if (!currencies?.length) tasks.push(loadCurrencies());
    if (!items?.length && sale?.id) {
      tasks.push(loadItems());
      if (!payments?.length) tasks.push(loadPayments());
    }
    if (!customer?.id && sale?.account_id) tasks.push(loadCustomer());
    if (tasks.length) await Promise.all(tasks);

    items = (items || []).map((it) => ({
      ...it,
      unit_name: it.unit_name || units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol:
        it.currency_symbol ||
        currencies.find((c) => c.code == sale?.currency)?.symbol ||
        '',
    }));

    if (allJournals.length) {
      showAccountBalance = calculateAccountBalance(sale.account_id, sale.currency);
    }

    await tick();
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


  table {
    table-layout: fixed;
    width: 100%;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 40%; /* product */
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 20%; /* qty */
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 20%; /* price */
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 20%; /* subtotal */
  }

  .product-name {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  td:nth-child(2),
  td:nth-child(3),
  td:nth-child(4) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 8pt;
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
td {
    border-bottom: 1px solid #000 !important;
    font-size: 9pt !important;
    padding: 4px 4px !important;
  }
  th {
    border-bottom: 2px solid #000 !important;
    border-top: 2px solid #000 !important;
    font-size: 11pt !important;
  }
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
    sale?.total_amount || (items && items.length ? items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) : 0),
  );

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode || fromCurrencyCode === toCurrencyCode) {
      return Number(amount || 0);
    }

    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return Number(amount || 0);

    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    if (!Number.isFinite(fromRate) || !Number.isFinite(toRate) || toRate <= 0) {
      return Number(amount || 0);
    }

    return (Number(amount || 0) / toRate) * fromRate;
  }

  /*
   * Bill Received should keep the payment's own currency/amount.
   * When every payment shares one currency, show that currency.
   * Mixed payment currencies fall back to the sale currency total.
   */
  $: paymentCurrencyCodes = [
    ...new Set(
      (payments || [])
        .map((payment) => payment.currency || sale?.currency)
        .filter(Boolean),
    ),
  ];

  $: paidCurrency =
    paymentCurrencyCodes.length === 1
      ? paymentCurrencyCodes[0]
      : sale?.currency || 'AFN';

  $: paid =
    payments && payments.length
      ? paymentCurrencyCodes.length === 1
        ? payments.reduce(
            (sum, payment) => sum + Number(payment.amount || 0),
            0,
          )
        : payments.reduce(
            (sum, payment) =>
              sum +
              exchangeRate(
                Number(payment.amount || 0),
                payment.currency || sale?.currency,
                sale?.currency,
              ),
            0,
          )
      : 0;

  $: paidInSaleCurrency =
    payments && payments.length
      ? payments.reduce(
          (sum, payment) =>
            sum +
            exchangeRate(
              Number(payment.amount || 0),
              payment.currency || sale?.currency,
              sale?.currency,
            ),
          0,
        )
      : 0;

  $: due =
    sale?.remaining != null && sale?.remaining !== ''
      ? Number(sale.remaining)
      : Number(total - paidInSaleCurrency);


  let showAccountBalance = '-';

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
              `<span dir='ltr'>${amt.toLocaleString(undefined, { maximumfractiondigits: 3 })}</span> ${t(cur)}`,
          )
          .join(' ')
      : '';
  }
</script>

<AppModal
  title={`${t('Receipt')} — ${sale?.invoice_number}`}
  icon="bi-printer"
  variant="primary"
  size="sm"
  on:close={close}>
  <div id="receipt-content" class="receipt-preview-wrap">
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
              {t('Date')}:
              <span class="fw-bold"
                >{@html sale?.invoice_date ? showDate(sale?.invoice_date.slice(0, 10), 'receipt') : ''}</span>
              <small class="float-end"> <span class="fw-bold">{sale?.invoice_date.slice(0, 10)}</span></small>
            </div>

            <div class="float-end">
              <small>{t('Invoice #')}: <span class="fw-bold">{sale?.invoice_number}</span></small>
            </div>
            {#if customer?.id > 100000}
              <div class="">
                <small>
                  {t('Number')}
                  {t('Account')}: <span class="fw-bold">{shortID(customer?.id) || '-'}</span>
                </small>
              </div>
            {/if}
            <div>
              <small
                >{t('Customer')}:
                <span class="fw-bold">{getAccountName(customer) || sale?.description || 'Walk-in'}</span></small>
            </div>

            <table border="0" cellpadding="3" cellspacing="0" class="w-100 mt-2">
              <thead> </thead>
              <tbody>
                <tr class="">
                  <th>{t('Product')}</th>
                  <th class="center">{t('Qty')}</th>
                  <th class="center">{t('Price')}</th>
                  <th class="center">{t('Subtotal')}</th>
                </tr>
                {#each items as it}
                  <tr class="">
                    <td class="product-name fw-bold">
                      <div>{it.product_name}</div>
                      {#if it.generic_name}
                        <div class="small text-muted mt-1">{it.generic_name}</div>
                      {/if}
                    </td>

                    <td class="center fw-bold">
                      <span>
                        {Number(it.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {it.unit_name}
                      </span>
                    </td>
                    <td class="center fw-bold"
                      ><span>
                        {Number(it.unit_price).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}&nbsp;{it.currency_symbol}</span>
                    </td>
                    <td class="center fw-bold"
                      ><span
                        >{Number(it.subtotal).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}&nbsp;{it.currency_symbol}</span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>

            <div class="totals small mt-3">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Subtotal')}{t("-of-")}{t('Bill')}</div>
                <div class="right fw-bold">
                  {items
                    .reduce((s, i) => s + (Number(i.subtotal) || 0), 0)
                    .toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(sale?.currency) || ''}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Discount')} {sale?.discount_type=='percent' ? `(${Number(sale?.discount_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}%)` : ''}</div>
                <div class="right fw-bold">
                 
                  {sale?.discount_amount
                    ? calculateDiscountAmount(sale).toLocaleString(undefined, { maximumFractionDigits: 3 })
                    : 0}
                  
                  {t(sale?.currency) || ''}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Expenses')}</div>
                <div class="right fw-bold">
                  {sale?.expense_amount
                    ? Number(sale?.expense_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                    : 0}
                  {t(sale?.currency) || ''}
                </div>
              </div>
              
              
              <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Payable')}</div>
                <div class="right fw-bold">
                  {sale?.total_amount
                    ? Number(sale?.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                    : 0}
                  {t(sale?.currency) || ''}
                </div>
              </div>
              <div class="fw-bold" style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <div class="fw-bold">{t('Bill Received')}</div>
                <div class="right fw-bold">
                  {Number(paid || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(paidCurrency) || ''}
                </div>
              </div>

              {#if customer?.code != 'WALKIN'}
              
              <div style="display:flex;justify-content:space-between;margin-top:4px;">
                <div class="fw-bold">{t('Old Balance')}</div>
                <div class="right fw-bold">
                  <span dir="ltr"
                    >{balance[sale?.currency]
                      ? Number(balance[sale?.currency] + due || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })
                      : '---'}</span>
                  {t(sale?.currency) || ''}
                </div>
              </div>
                <div class="divider"></div>

                <div style="display:flex;justify-content:space-between;margin-top:4px;">
                  <div class="fw-bold">{t('Now Balance')}</div>
                  <div class="right fw-bold">
                    {@html showAccountBalance}
                  </div>
                </div>
              {/if}
            </div>

            <div class="divider"></div>
            <div class="center small">
              {t('Powered by ZenoERP • Thank you!')}
            </div>

            <div class="center small">www.zenoerp.com</div>
          </div>
        </div>

  <svelte:fragment slot="footer">
    <div class="receipt-actions-grid">
     
      <button type="button" class="app-modal-btn app-modal-btn--secondary" on:click={showA4}>
        <i class="bi bi-file-earmark-pdf"></i>
        {t('A4')}
      </button>
      <button type="button" class="app-modal-btn app-modal-btn--primary" on:click={printReceipt}>
        <i class="bi bi-printer"></i>
        {t('Print')}
      </button>
    </div>
  </svelte:fragment>
</AppModal>

<style>
  table {
    border-bottom: 2px solid #000 !important;
  }
  td {
    border-bottom: 1px solid #000 !important;
    font-size: 9pt !important;
    padding: 4px 4px !important;
  }
  th {
    border-bottom: 2px solid #000 !important;
    border-top: 2px solid #000 !important;
    font-size: 11pt !important;
  }

  table {
    table-layout: fixed;
    width: 100%;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 40%; /* product */
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 20%; /* qty */
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 20%; /* price */
  }

  th:nth-child(4),
  td:nth-child(4) {
    width: 20%; /* subtotal */
  }

  .product-name {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  td:nth-child(2),
  td:nth-child(3),
  td:nth-child(4) {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 8pt;
  }

  .brand {
    font-size: 16px;
    font-weight: 700;
  }
  :global(.app-modal--primary.app-modal--sm) {
    width: min(100%, 360px);
  }

  :global(.app-modal--primary.app-modal--sm .app-modal__body) {
    padding: 14px 12px;
  }

  #receipt-content.receipt-preview-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 0 4px;
  }

  .receipt {
    width: 74mm;
    padding: 8px 4px;
    max-width: 74mm;
    overflow: hidden;
    word-wrap: break-word;
    word-break: break-word;
    margin: 0 auto;
    background: #fff;
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

  .receipt-actions-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .receipt-actions-grid :global(.app-modal-btn) {
    width: 100%;
    justify-content: center;
  }

  @media (max-width: 420px) {
    :global(.app-modal--primary.app-modal--sm) {
      width: min(100%, 340px);
    }

    #receipt-content.receipt-preview-wrap {
      padding: 0;
    }
  }
</style>
