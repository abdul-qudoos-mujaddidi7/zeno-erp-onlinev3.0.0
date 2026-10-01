<script>
  import { onMount, createEventDispatcher } from 'svelte';
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  ;
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { saleApi } from '../../api/saleApi.js';
  import { productApi } from '../../api/productApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import AppModal from '../../components/common/AppModal.svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n.js';
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let sale = {};
  export let items = [];
  export let payments = [];
  export let customer = {};
  export let units = [];
  export let currencies = [];
  $: settings = $settings_all || [];

  
  import {calculateDiscountAmount} from './SalesHelper.js';

  /*
   * The same two counters the 74mm receipt prints are also printed on the A4
   * invoice: how many lines the bill holds ("Items Count [1]") and the total
   * quantity across those lines ("Items Qty Count [10]"). The helper is shared
   * with SaleReceiptModal so both documents always count the same way.
   */
  import { formatCount, itemCounts } from './saleReceiptLayout.js';
  import { amountInWords } from '../../utils/amountInWords.js';
  import { currencyLabels } from '../../utils/currencyLabel.js';
  
  import QRCode from 'qrcode';
import { currencyApi } from '../../api/currencyApi.js';
import { productBrandApi } from '../../api/productBrandApi.js';
  let dataUrl = '';
  async function loadQRCode() {
    if (!sale?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/sale/' + String(sale.id), {
      width: 100,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  $: if(sale) {
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

  $: enable_show_category_in_invoice =
    $settings_all.find((s) => s.key === 'enable_show_category_in_invoice')?.value == 1;

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  function show80mm() {
    dispatch('show80mm');
  }

  let generics = [];
  let brands = [];
  let categories = [];
  let saleItems = [];
  let accountBalances = {};
  async function loadItems() {
    if (sale) {
           const saleResponse = await saleApi.getById(Number(sale.id));
           saleItems = ((saleResponse?.data?.items) || [])
  .filter((item) => Number(item.status) === 1)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    const genericResponse = await productGenericApi.getAll({ status: 1 });
    generics = genericResponse?.data || [];
    brands = (await productBrandApi.getAll({ status: 1 }))?.data || [];
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];

    const products = (await productApi.getAll({ status: 1 }))?.data || [];

    items = saleItems.map((i) => {
      const product = products.find((p) => Number(p.id) === Number(i.product_id));
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

  }

  /*
   * Loads every journal that touches the customer account (first or
   * second entry) so the receipt can show the previous/current balance.
   */
  async function loadJournals() {
    if (!sale?.account_id) return;
    accountBalances = (await accountApi.getBalances({
      status: 1,
      account_ids: String(sale.account_id),
    }))?.data || {};
  }

  async function loadPayments() {
    if (!sale?.id) return;
    const saleResponse = await saleApi.getById(Number(sale.id));
    payments = (saleResponse?.data?.payments || []).filter(
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
    if (!sale?.account_id) return;
    const customerResponse = await accountApi.getById(sale.account_id);
    customer = customerResponse?.data || {};
  }

  async function loadUnits() {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    const tasks = [];
    const itemsAlreadyReady = (items || []).some((it) => it.product_name);
    if (!units?.length && !itemsAlreadyReady) tasks.push(loadUnits());
    if (!currencies?.length && !itemsAlreadyReady) tasks.push(loadCurrencies());
    if (!items?.length && sale?.id) {
      tasks.push(loadItems());
      if (!payments?.length) tasks.push(loadPayments());
    }
    if (!customer?.id && sale?.account_id) tasks.push(loadCustomer());
    if (!Object.keys(accountBalances).length && sale?.account_id) tasks.push(loadJournals());
    if (tasks.length) await Promise.all(tasks);

    if (sale?.account_id && Object.keys(accountBalances).length) {
      showAccountBalance = calculateAccountBalance(sale.account_id, sale.currency);
    }
    items = (items || []).map((it) => ({
      ...it,
      unit_name: it.unit_name || units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol:
        it.currency_symbol ||
        currencies.find((c) => c.code == sale?.currency)?.symbol ||
        '',
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

  $: total = Number(sale?.total_amount || items.reduce((s, i) => s + Number(Number(i.unit_price || 0) * Number(i.quantity || 0)), 0));

  $: counts = itemCounts(items);

  /*
   * The payable amount stated again in words, under the figures, in the
   * invoice's own language — the same rule the 74mm receipt follows.
   */
  $: totalInWords = amountInWords(total, $lang, currencyLabels(sale?.currency, t));

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

  let showAccountBalance = '';

  let balance = {};

  function calculateAccountBalance(accountId, currency) {
    balance = accountBalances[accountId] || accountBalances[String(accountId)] || {};
    console.log('Calculated balance for account', accountId, balance);
    return balance.toString
      ? Object.entries(balance)
          .map(
            ([cur, amt]) =>
              `<span class='${amt < 0 ? 'text-danger' : ''}'><span dir='ltr'>${amt.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span> ${t(cur)}</span>`,
          )
          .join(' ')
      : '';
  }
</script>

<AppModal
  title={`${t('Invoice')} — ${sale?.invoice_number}`}
  icon="bi-file-earmark-pdf"
  variant="primary"
  size="xl"
  on:close={close}>
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
            <div class="{sale?"":'me-5'}">
            
              {#if sale?.invoice_status === 'draft'}
                <span class="badge badge-warning text-dark">{t('Draft')}</span>
              {:else if sale?.invoice_status === 'confirmed'}
                <span class="badge badge-success">{t('confirmed')}</span>
              {/if}

              
        {#if sale?.version && sale?.version > 1}<span class="badge badge-info">{t('Version')} {sale?.version}</span>{/if}
              <div class="{sale?"":'me-5'}"><strong>{t('Sales Invoice')}</strong>:  {sale?.invoice_number}</div>
              <div class="{sale?"":'me-5'}">
                <strong>{t('Date')}: </strong>
                {@html sale?.invoice_date ? showDate(sale.created_at.slice(0, 10),"justPersian") : ''}
              </div>
              <div class="small {sale?"":'me-5'}" dir="ltr">{sale?.created_at?new Date(sale?.created_at).toLocaleString(): ''}</div>
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

          <!-- Customer & Invoice Info -->

          <!--
            Item counters, exactly like the 80mm receipt: the number of lines on
            the bill and the total quantity they carry. Kept as inline styles
            (not a component class) because the print window only receives this
            markup plus mdb.css, never the component's stylesheet.
          -->
          <div
            class="d-flex align-items-center fw-bold"
            style="gap: 1.25rem; font-size: 10pt; margin: 0 0 4px;">
            <span>{t('Items Count')} [{formatCount(counts.itemsCount)}]</span>
            <span>{t('Items Qty Count')} [{formatCount(counts.itemsQtyCount)}]</span>
          </div>

          <!-- Product Table -->
          <table class="table table-bordered">
            <thead>
              <tr style="border:1px solid #e0e0e0;font-size:11pt">
                <th class="p-2 py-1 fw-bold">#</th>
                <th class="p-2 py-1 fw-bold">{t('Product')}</th>
                {#if enable_show_category_in_invoice}
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
                    {#if enable_show_category_in_invoice}
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
                <div class="section-title">{sale?.description ? t('Description') : t('Description')}:</div>
                
        <div class='ProseMirror'>
               {@html sale?.description || ''}
        </div>
              </div>
            </div>
            {/if}
            <div class="col-sm-{enable_vertical_info ? 4 : 12}">
              <table class="table mt-3 ">
                <tbody class="" style="font-size: 10pt;">
                  {#if enable_vertical_info}
                    <tr>
                      <td class="p-2 py-1">{t('Subtotal')}{t('-of-')}{t('Bill')}</td><td class="p-2 py-1 fw-bold"> {items
                          .reduce((s, i) => s + (Number(Number(i.unit_price || 0) * Number(i.quantity || 0)) || 0), 0)
                          .toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {t(sale?.currency) || ''}</td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Discount')}  {sale?.discount_type=='percent' ? `(${Number(sale?.discount_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}%)` : ''} </td><td class="p-2 py-1 fw-bold">
                        {calculateDiscountAmount(sale).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {t(sale?.currency) || ''}</td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Expenses')} </td><td class="p-2 py-1 fw-bold">
                        {sale?.expense_amount
                          ? Number(sale?.expense_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : 0}
                         {t(sale?.currency) || ''}</td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Payable')} </td><td class="p-2 py-1 fw-bold">
                        {sale?.total_amount
                          ? Number(sale?.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : 0}
                        {t(sale?.currency) || ''}</td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Bill Received')}</td><td class="p-2 py-1 fw-bold"
                        >{sale?Number(paid || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(paidCurrency) || ''}</td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Bill Due')} </td><td class="p-2 py-1 fw-bold">
                        {sale?Number(due || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(sale?.currency) || ''}
                      </td>
                    </tr>

                    {#if customer?.code != 'WALKIN'}
                      <tr>
                        <td class="p-2 py-1">{t('Old Balance')} </td><td class="p-2 py-1 fw-bold">
                          <span dir="ltr"
                            >{@html balance[sale?.currency] !== undefined && balance[sale?.currency] !== null
                              ? Number(balance[sale?.currency] + due || 0).toLocaleString(undefined, {
                                  maximumFractionDigits: 3,
                                })
                              : ''}</span>
                          {t(sale?.currency)}</td>
                      </tr>
                      <tr
                        ><td class="p-2 py-1">{t('Now Balance')}</td><td class="p-2 py-1 fw-bold">{@html showAccountBalance}</td
                        ></tr>
                    {/if}
                  {:else}
                    <tr>
                      <td class="p-2 py-1">{t('Subtotal')}{t('-of-')}{t('Bill')}: <strong>{sale?items
                          .reduce((s, i) => s + (Number(Number(i.unit_price || 0) * Number(i.quantity || 0)) || 0), 0)
                          .toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(sale?.currency) || ''}</strong></td>
                        
                      <td class="p-2 py-1">{t('Discount')} {sale?.discount_type=='percent' ? `(${Number(sale?.discount_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}%)` : ''} : <strong>
                        {calculateDiscountAmount(sale).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {t(sale?.currency) || ''}</strong></td>
                      <td class="p-2 py-1">{t('Expenses')}: <strong>  {sale?sale?.expense_amount
                          ? Number(sale?.expense_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : 0:""}
                        {t(sale?.currency) || ''}</strong></td>
                      <td class="p-2 py-1">{t('Payable')}: <strong>
                        {sale?sale?.total_amount
                          ? Number(sale?.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : 0:""}
                        {t(sale?.currency) || ''}</strong></td>
                    </tr>
                    <tr>
                      <td class="p-2 py-1">{t('Bill Received')}: <strong>{sale?Number(paid || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(paidCurrency) || ''}</strong></td>
                      <td class="p-2 py-1">{t('Bill Due')}: <strong>
                        {sale?Number(due || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }):""}
                        {t(sale?.currency) || ''}</strong>
                      </td>

                      {#if customer?.code != 'WALKIN'}
                        <td class="p-2 py-1">{t('Old Balance')}: <strong>
                          <span dir="ltr"
                            >{@html balance[sale?.currency] !== undefined && balance[sale?.currency] !== null
                              ? Number(balance[sale?.currency] + due || 0).toLocaleString(undefined, {
                                  maximumFractionDigits: 3,
                                })
                              : ''}</span>
                          {t(sale?.currency)}</strong></td>
                        <td class="p-2 py-1">{t('Now Balance')}: <strong>{@html showAccountBalance}</strong></td>
                      {/if}
                    </tr>
                  {/if}
                </tbody>
              </table>

              <!--
                The bill states its amount twice: the figures above, and the
                same amount spelled out here so an altered digit stands out.
              -->
              <div class="words-line" style="font-size:10pt; padding:2px 8px;">
                <strong dir="ltr">{totalInWords}</strong>
              </div>
            </div>
            {#if !enable_vertical_info}
              <div class="col-sm-12">
                <div class="border h-100 p-3" style="border-color:#e0e0e0 !important;">
                  <div class="section-title">{sale?.description ? t('Description') : t('Description')}:</div>
                  
        <div class='ProseMirror'>
                  {@html sale?.description || ''}
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
              <img src="/img/logo.png" style="max-width:none;height:20px" /><br />
              {t('Powered by ZenoERP • Thank you!')}<br />

              <strong>{t('www.zenoerp.com')}</strong>
            </div>
          </div>
        </div>

  <svelte:fragment slot="footer">
    <button
      type="button"
      class="app-modal-btn app-modal-btn--secondary"
      on:click={() => {
        editable = !editable;
      }}>
      <i class="bi bi-{editable ? 'check-lg' : 'pencil'}"></i>
      {editable ? t('Done') : t('Edit')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--secondary" on:click={show80mm}>
      <i class="bi bi-receipt"></i>
      {t('Receipt')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--secondary" on:click={close}>
      <i class="bi bi-x-lg"></i>
      {t('Close')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--primary" disabled={editable} on:click={printInvoice}>
      <i class="bi bi-printer"></i>
      {t('Print')}
    </button>
  </svelte:fragment>
</AppModal>

<style>

    :global(.ProseMirror td p),
    :global(.ProseMirror th p) {
        margin: 0;
    }

</style>
