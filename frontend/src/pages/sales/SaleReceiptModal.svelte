<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';

  import { productGenericApi } from '../../api/productGenericApi.js';
  import { saleApi } from '../../api/saleApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import AppModal from '../../components/common/AppModal.svelte';
  import WhatsappModal from '../WhatsappModal.svelte';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;

  import { push } from 'svelte-spa-router';
  
  import { fetchProductsByIds } from '../../lib/fetchProductsByIds.js';
  import { calculateDiscountAmount } from './SalesHelper.js';
  import { amountInWords } from '../../utils/amountInWords.js';
  import { currencyLabels } from '../../utils/currencyLabel.js';
  import {
    billChange,
    formatContactPhone,
    formatCount,
    formatMoney,
    formatQty,
    itemCounts,
    itemsSubtotal,
    lineAmount,
    receiptTime,
  } from './saleReceiptLayout.js';

  import { showDate } from '../../calendar.js';
import { currencyApi } from '../../api/currencyApi.js';

  /*
   * Thermal roll width, in millimetres. The printed page is declared as this
   * width (see printReceipt) so the page box equals the paper the driver already
   * has loaded, and the 74mm slip is centred inside it. Change this single number
   * for a 58mm roll — the slip's own width has to be narrowed to match.
   */
  const ROLL_WIDTH_MM = 80;

  export let sale = {};
  export let items = [];
  export let payments = [];
  export let customer = {};
  export let units = [];
  export let currencies = [];
  $: settings = $settings_all || [];

  /*
   * Contact block printed above the footer rule. Every line is optional — the
   * sign-off, the phones, the e-mail and the web/social handles appear once
   * the company fills them in under Settings → Company Profile.
   */
  $: companyPhone = settings.find((s) => s.key === 'company_phone')?.value || '';
  $: companyPhone2 = settings.find((s) => s.key === 'company_phone2')?.value || '';
  $: companyEmail = settings.find((s) => s.key === 'company_email')?.value || '';
  $: companyWebsite = settings.find((s) => s.key === 'company_website')?.value || '';
  $: companyFacebook = settings.find((s) => s.key === 'company_facebook')?.value || '';

  /*
   * The reference slip prints the person who served the customer next to the
   * invoice number. Here that slot carries the customer instead, with the same
   * fallbacks the receipt always used.
   */
  $: customerName = getAccountName(customer) || sale?.description || 'Walk-in';

  /*
   * The time of the sale, printed beside the date. It comes from the row's own
   * timestamp (the invoice date is the business DAY, so it is always midnight)
   * and reads on a 12-hour clock in the slip's own language — see receiptTime().
   */
  $: printedTime = sale?.invoice_date
    ? receiptTime(sale?.created_at || sale?.invoice_date, $lang)
    : '';

  let generics = [];
  let addressEl;
  let WhatsappModalRef = null;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function showA4() {
    dispatch('showA4');
  }

  function getSaleExpenseAmount(saleData = {}) {
    const directValues = [
      saleData.expense_amount,
      saleData.expenses_amount,
      saleData.total_expenses,
      saleData.additional_expenses,
      saleData.shipping_cost,
      saleData.delivery_cost,
      saleData.service_charge,
    ];

    for (const value of directValues) {
      const amount = Number(value);
      if (Number.isFinite(amount)) return amount;
    }

    return Number(saleData.expenses || 0) || 0;
  }

  function openSaleWhatsapp() {
    const billSubtotal = items.reduce(
      (sum, item) => sum + Number(item.subtotal || 0),
      0,
    );
    const discountAmount = Number(calculateDiscountAmount(sale) || 0);
    const expenseAmount = getSaleExpenseAmount(sale);
    const payableAmount = Number(
      sale?.total_amount ?? billSubtotal - discountAmount + expenseAmount,
    );
    const paid = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );

    WhatsappModalRef?.openModal(
      'sale_created_template',
      {
        ...sale,
        items,
        paid,
        due: payableAmount - paid,
        bill_subtotal: billSubtotal,
        discount_amount: discountAmount,
        expense_amount: expenseAmount,
        payable_amount: payableAmount,
      },
      customer,
      balance,
    );
  }

  let accountBalances = {};

  /*
   * The receipt only needs the customer's current per-currency balance.
   * The SQL aggregate endpoint answers that directly — paging through the
   * account's journals both cost more and reported a wrong balance once an
   * account passed the page size.
   */
  async function loadJournals() {
    if (!sale?.account_id) return;
    accountBalances = (await accountApi.getBalances({
      status: 1,
      account_ids: String(sale.account_id),
    }))?.data || {};
  }

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

    items = (items || []).map((it) => ({
      ...it,
      unit_name: it.unit_name || units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol:
        it.currency_symbol ||
        currencies.find((c) => c.code == sale?.currency)?.symbol ||
        '',
    }));

    if (Object.keys(accountBalances).length) {
      showAccountBalance = calculateAccountBalance(sale.account_id, sale.currency);
    }

    await tick();
    fitReceiptText();
  });
  function printReceipt() {
    fitReceiptText();
    /*
     * `size: 74mm auto` is not a valid page size — the `size` descriptor takes
     * one or two lengths — so a browser that drops the rule falls back to the
     * printer's default paper and the slip prints with a long blank tail.
     * The page height is measured from the slip's *printed content*, never from
     * the element's box: a box that a parent has stretched or centred around
     * would declare a page far taller than the ink, and every slip would carry
     * blank paper at the top and at the bottom. The last child's bottom is the
     * end of the ink, plus the slip's own bottom padding and a small feed.
     */
    const slip = document.querySelector('#receipt-content .receipt');
    let pageHeight = 0;

    if (slip) {
      const box = slip.getBoundingClientRect();
      let contentBottom = box.top;

      for (const child of slip.children) {
        const bottom = child.getBoundingClientRect().bottom;

        if (bottom > contentBottom) contentBottom = bottom;
      }

      pageHeight = Math.ceil(contentBottom - box.top) + 16;
    }
    const content = document.getElementById('receipt-content').innerHTML;

    /*
     * The declared page is the PAPER, not the slip.
     *
     * Every other receipt in the app declares 'size: 74mm auto', which is
     * invalid — 'auto' is only legal as the whole value — so browsers drop the
     * rule and lay the slip out against the printer driver's paper. That is why
     * those slips fill the roll. Here the rule IS valid, so the engine builds a
     * real page box; if that box were the 74mm slip, the driver would have to
     * place a 74mm page onto an 80mm roll and the leftover ~6mm would print as an
     * empty strip on whichever side the driver aligns to (left on most thermal
     * drivers, centred on some).
     *
     * So: declare the 80mm roll as the page and centre the 74mm slip inside it.
     * The page box then equals the paper, the driver has nothing left to align,
     * and the ink gets symmetric ~3mm margins — inside the normal non-printable
     * edge of an 80mm roll. ROLL_WIDTH_MM is the one number to change for a 58mm
     * printer (which also needs the slip narrowed).
     *
     * The height is the measured slip, which is what stops the blank tail. When
     * the slip cannot be measured there is no height to declare, so no rule is
     * emitted at all and the printer's own paper governs.
     */
    const pageRule =
      pageHeight > 0
        ? `@page { size: ${ROLL_WIDTH_MM}mm ${pageHeight}px; margin: 0; }`
        : '';

    const styles = `
        <style>
          /*
           * Typography only: 13px / 500 base, one scale for headings (700)
           * and money labels (600), NET Total above the rest (15px / 700).
           * Layout, spacing, colors and alignment are untouched.
           */
          .receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
            font-size: 13px;
            font-weight: 500;
            line-height: 1.45;
          }
          .brand { font-size: 18px; font-weight: 700; }

          table {
  table-layout: fixed;
  width: 100%;
}

td, th {
  word-break: break-word;
}
         .underbrand {
    font-weight: 500;

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
    width: 40%; /* quantity */
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 30%; /* price */
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 30%; /* amount */
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
    text-overflow: clip;
  }
  .fit-amount {
    display: block;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    overflow-wrap: normal;
    word-break: normal;
    line-height: 1.2;
  }

  /* The count lines: money labels, one step under the table headers. */
  .items-count {
    margin-top: 6px;
    font-weight: 600;
  }

  /*
   * Item block: the product name on its own line, then quantity / price /
   * amount underneath. No rule between the lines of one item — only the
   * header, the Subtotal row and the NET Total row carry a line.
   */
  .items-table .item-name-row td {
    border: none !important;
    padding-top: 5px !important;
    padding-bottom: 0 !important;
  }

  .items-table .item-value-row td {
    border: none !important;
    padding-top: 0 !important;
  }

  .items-table .detail-row td {
    border: none !important;
  }

  .items-table .subtotal-row td {
    border-top: 1px solid #000 !important;
  }

  .items-table .nettotal-row td {
    border-top: 2px solid #000 !important;
    border-bottom: 2px solid #000 !important;
  }

  /*
   * Logical alignment: the quantity sits at the start of the row, the money
   * columns at the end, so the receipt mirrors correctly in Dari/Pashto.
   */
  .start {
    text-align: start;
  }

  .end {
    text-align: end;
  }

  .payments-block,
  .totals {
    margin-top: 6px;
  }

  .pay-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
  }


.nowrap {
  white-space: nowrap;
}
  .receipt * {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
    .underbrand {
    font-weight: 700;

    display: -webkit-box;
    -webkit-line-clamp: 2; /* 👈 LIMIT TO 2 LINES */
    -webkit-box-orient: vertical;

    overflow: hidden;
    word-break: break-word;
  }
/*
 * The printed document is a page, not a layout: nothing may add an offset at
 * its top. Horizontal placement is deliberate and declared further down, next
 * to the @page rule: the slip is centred in the paper (see the note there).
 */
html,
body {
  margin: 0;
  padding: 0;
  min-height: 0;
  background: #fff;
}
       
table { table-layout: fixed; width: 100%; }
td {
    padding: 3px 4px !important;
    border: none !important;
  }
  small {
    font-size: inherit;
  }

  /* Item-table header: the slip's strongest table text. */
  th {
    font-size: 13px;
    font-weight: 700 !important;
    padding: 3px 4px !important;
    border-bottom: 2px solid #000 !important;
  }
  /* The count header reads with the count lines, not with Price / Amount. */
  th.fit-cell { font-weight: 600 !important; }

  /* Store address and item names: secondary text. */
  .items-table .item-name-row td { font-weight: 500; }

  /* Invoice information block (invoice #, customer, date, account number). */
  .head-row { font-weight: 600; }

  /* Count lines, quantity / price / amount, subtotal and detail rows. */
  .items-count { font-weight: 600; }
  .items-table .item-value-row td { font-weight: 600; }
  .items-table .subtotal-row td,
  .items-table .detail-row td { font-weight: 600; }

  /* Payment and balance rows carry the same weight as the summary rows. */
  .pay-row { font-weight: 600; }

  /* NET Total stays the strongest row of the slip. */

  /* The total spelled out: smaller than the figures it restates. */
  .items-table .words-row td {
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .items-table .nettotal-row td { font-size: 15px; font-weight: 700; }

  /*
   * Footer: the contact / credit lines, then the sign-off. The sign-off keeps
   * both classes, so it has to be declared last to win its own size/weight.
   */
  .receipt-footer .footer-line { font-size: 12px; font-weight: 500; }
  .receipt-footer .footer-signoff { font-size: 13px; font-weight: 600; }
          ${pageRule}

          /*
           * Slip centred in the paper: a flex row keeps the page width and lets
           * the slip keep its own 74mm. 'align-items: flex-start' stops the slip
           * from being stretched to the page height.
           */
          body { display: flex; justify-content: center; align-items: flex-start; }

.center { text-align: center; }
.divider { border-top: 1px solid #000; margin: 6px 0; }
.head-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.head-row .head-customer { text-align: end; overflow-wrap: anywhere; }
.head-row .head-gregorian { unicode-bidi: embed; white-space: nowrap; }
.head-row .head-time { unicode-bidi: isolate; white-space: nowrap; }
.receipt-footer { text-align: start; line-height: 1.45; margin-top: 2px; }
.receipt-footer .footer-line { white-space: normal; overflow-wrap: anywhere; }
.receipt-footer .footer-signoff { text-align: center; margin-bottom: 8px; }

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
    if (!el || el.clientWidth <= 0) return;

    el.style.whiteSpace = 'nowrap';
    el.style.overflowWrap = 'normal';
    el.style.wordBreak = 'normal';
    el.style.fontSize = maxFont + 'px';

    let low = minFont;
    let high = maxFont;
    let best = minFont;

    while (low <= high) {
      let mid = (low + high) / 2;

      el.style.fontSize = mid + 'px';

      if (el.scrollWidth <= el.clientWidth + 0.5) {
        best = mid;
        low = mid + 0.5;
      } else {
        high = mid - 0.5;
      }
    }

    el.style.fontSize = best + 'px';
  }

  /*
   * The slip prints in one size, so an element that fits must keep the size it
   * inherits: fitText always *sets* a size, which would make a short value
   * smaller than the text around it. This clears any earlier inline size,
   * measures, and only shrinks what genuinely overflows its box.
   */
  function fitTextWithin(el, minFont = 6) {
    if (!el || el.clientWidth <= 0) return;

    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';
    el.style.overflowWrap = 'normal';
    el.style.wordBreak = 'normal';

    if (el.scrollWidth <= el.clientWidth + 0.5) return;

    const natural = parseFloat(getComputedStyle(el).fontSize) || 12;

    fitText(el, natural, minFont);
  }

  function fitReceiptText() {
    fitTextWithin(addressEl);
    document.querySelectorAll('#receipt-content .fit-amount').forEach((el) => {
      fitTextWithin(el, 5);
    });

    /*
     * "Items Qty Count [1]" is wider than the quantity column of a 74mm slip,
     * so this one label shrinks to stay on a single line instead of wrapping
     * its count onto a second line, in any language.
     */
    document.querySelectorAll('#receipt-content th.fit-cell').forEach((el) => {
      fitTextWithin(el, 7);
    });
  }

  $: amountFitKey = (items || [])
    .map((item) => `${item.quantity}|${item.unit_price}|${item.subtotal}|${item.unit_name}|${item.currency_symbol}`)
    .join(';');

  $: if (typeof document !== 'undefined') {
    void amountFitKey;
    tick().then(fitReceiptText);
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


  /* Printed header counts and the Subtotal / NET Total / Change rows. */
  $: counts = itemCounts(items);
  $: itemsSum = itemsSubtotal(items);
  $: change = billChange(total, paidInSaleCurrency);

  /*
   * The same total, spelled out, printed under the figures. A bill states its
   * amount twice so a hand-altered digit cannot pass unnoticed, and the words
   * are read in the slip's own language.
   */
  $: totalInWords = amountInWords(total, $lang, currencyLabels(sale?.currency, t));

  let showAccountBalance = '-';

  let balance = {};

  function calculateAccountBalance(accountId, currency) {
    balance = accountBalances[accountId] || accountBalances[String(accountId)] || {};
    console.log('Calculated balance for account', accountId, balance);
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
                <div class="underbrand mb-1" bind:this={addressEl}>
                  {settings.find((s) => s.key === 'company_address')?.value || 'Company Address'}
                </div>
              {/if}
              <!--
                The phones and the e-mail are printed once, in the footer
                contact block — not here as well.
              -->
              <!-- <div class="muted">123 Business St, City</div>
              <div class="muted">Tel: 000-000-000</div> -->
            </div>
            <div class="divider"></div>

            <!--
              Header of the reference slip: the invoice number and the customer
              share the first line; the date line below puts the local date
              under the invoice number and the Gregorian date under the
              customer. The customer's account number is not
              printed at all.
            -->
            <div class="head-row">
              <span class="nowrap">
                <small>{t('Invoice #')}: {sale?.invoice_number}</small>
              </span>
              <span class="head-customer">
                <small>{t('Customer')}: {customerName}</small>
              </span>
            </div>

            <div class="head-row">
              <span class="head-dates">
                <small
                  >{t('Date')}:{@html sale?.invoice_date
                    ? showDate(sale?.invoice_date.slice(0, 10), 'receipt')
                    : ''}{#if printedTime}<span class="head-time"
                      >&nbsp;– {printedTime}</span
                    >{/if}</small
                >
              </span>
              {#if sale?.invoice_date}
                <span dir="ltr" class="head-gregorian"
                  >{sale.invoice_date.slice(0, 10)}</span
                >
              {/if}
            </div>

            <div class="items-count">{t('Items Count')} [{formatCount(counts.itemsCount)}]</div>

            <table border="0" cellpadding="3" cellspacing="0" class="w-100 items-table">
              <thead>
                <tr>
                  <th class="start fit-cell">
                    {t('Items Qty Count')} [{formatCount(counts.itemsQtyCount)}]
                  </th>
                  <th class="end">{t('Price')}</th>
                  <th class="end">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {#each items as it}
                  <tr class="item-name-row">
                    <td colspan="3" class="product-name">
                      <div>{it.product_name}</div>
                      {#if it.generic_name}
                        <div class="small">{it.generic_name}</div>
                      {/if}
                    </td>
                  </tr>
                  <tr class="item-value-row">
                    <td class="start">
                      <span class="fit-amount">
                        {formatQty(it.quantity)}{#if it.unit_name}&nbsp;{it.unit_name}{/if}
                      </span>
                    </td>
                    <td class="end">
                      <span class="fit-amount">{formatMoney(it.unit_price)}</span>
                    </td>
                    <td class="end">
                      <span class="fit-amount">{formatMoney(lineAmount(it))}</span>
                    </td>
                  </tr>
                {/each}

                <!--
                  The money rows give the amount two of the three columns, so a
                  long total (with its currency) prints at the same size as the
                  rest of the slip instead of being shrunk to fit one column.
                -->
                <tr class="subtotal-row">
                  <td class="start">{t('Subtotal')}:</td>
                  <td colspan="2" class="end">
                    <span class="fit-amount">{formatMoney(itemsSum)}</span>
                  </td>
                </tr>

                {#if sale?.discount_amount}
                  <tr class="detail-row">
                    <td class="start">
                      {t('Discount')}{sale?.discount_type == 'percent'
                        ? ` (${formatMoney(sale?.discount_amount, 0, 3)}%)`
                        : ''}:
                    </td>
                    <td colspan="2" class="end">
                      <span class="fit-amount">{formatMoney(calculateDiscountAmount(sale))}</span>
                    </td>
                  </tr>
                {/if}

                {#if sale?.expense_amount}
                  <tr class="detail-row">
                    <td class="start">{t('Expenses')}:</td>
                    <td colspan="2" class="end">
                      <span class="fit-amount">{formatMoney(sale?.expense_amount)}</span>
                    </td>
                  </tr>
                {/if}

                <tr class="nettotal-row">
                  <td class="start fw-bold">{t('NET Total')}:</td>
                  <td colspan="2" class="end fw-bold">
                    <span class="fit-amount">{formatMoney(total)}&nbsp;{t(sale?.currency) || ''}</span>
                  </td>
                </tr>

                <!--
                  The total stated again in words, in the slip's own language.
                  It spans all three columns because a spelled-out amount is
                  wider than any single money column of a 74mm slip, and it
                  takes the amount's own alignment ('end') so the words read
                  directly under the figure they restate instead of under the
                  label on the far side of the row.
                -->
                <tr class="words-row">
                  <td class="end" colspan="3">
                    <span dir="ltr">{totalInWords}</span>
                  </td>
                </tr>
              </tbody>
            </table>

            <div class="payments-block small">
              <div class="pay-row">
                <span>{t('Bill Received')}:</span>
                <span class="nowrap">(&nbsp;{formatMoney(paid)}&nbsp;{t(paidCurrency) || ''}&nbsp;)</span>
              </div>

              {#if change > 0}
                <div class="pay-row">
                  <span>{t('Change')}:</span>
                  <span class="nowrap">(&nbsp;{formatMoney(change)}&nbsp;{t(sale?.currency) || ''}&nbsp;)</span>
                </div>
              {/if}

              {#if Number(due) > 0}
                <div class="pay-row">
                  <span>{t('Bill Due')}:</span>
                  <span class="nowrap">(&nbsp;{formatMoney(due)}&nbsp;{t(sale?.currency) || ''}&nbsp;)</span>
                </div>
              {/if}
            </div>

            {#if customer?.code != 'WALKIN'}
              <div class="divider"></div>

              <div class="totals small">
                <div class="pay-row">
                  <span>{t('Old Balance')}</span>
                  <span>
                    <span dir="ltr"
                      >{balance[sale?.currency] !== undefined && balance[sale?.currency] !== null
                        ? Number(balance[sale?.currency] + due || 0).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          })
                        : '---'}</span
                    >
                    {t(sale?.currency) || ''}
                  </span>
                </div>

                <div class="pay-row">
                  <span>{t('Now Balance')}</span>
                  <span>
                    {@html showAccountBalance}
                  </span>
                </div>
              </div>
            {/if}

            <div class="divider"></div>

            <!--
              Contact block of the reference receipt: the sign-off first, then
              the company's own lines (phones, e-mail, web, social) and the
              ZenoERP credit last. Each line is skipped when unset.
            -->
            <div class="receipt-footer small">
              <div class="footer-line footer-signoff">
                {t('Thank You For Your Shopping!')}
              </div>
              {#if companyPhone}
                <div class="footer-line">
                  <span dir="ltr">{formatContactPhone(companyPhone)}</span>
                </div>
              {/if}
              {#if companyPhone2}
                <div class="footer-line">
                  <span dir="ltr">{formatContactPhone(companyPhone2)}</span>
                </div>
              {/if}
              {#if companyEmail}
                <div class="footer-line"><span dir="ltr">{companyEmail}</span></div>
              {/if}
              {#if companyWebsite}
                <div class="footer-line"><span dir="ltr">{companyWebsite}</span></div>
              {/if}
              {#if companyFacebook}
                <div class="footer-line"><span dir="ltr">{companyFacebook}</span></div>
              {/if}
              <div class="footer-line">
                {t('Powered by ZenoERP')} - <span dir="ltr">www.zenoerp.com</span>
              </div>
            </div>
          </div>
        </div>

  <svelte:fragment slot="footer">
    <div class="receipt-actions-grid">
      <button type="button" class="app-modal-btn app-modal-btn--secondary" on:click={showA4}>
        <i class="bi bi-file-earmark-pdf"></i>
        {t('A4')}
      </button>
      <button type="button" class="app-modal-btn receipt-whatsapp-btn" on:click={openSaleWhatsapp}>
        <i class="bi bi-whatsapp"></i>
        {t('Whatsapp')}
      </button>
      <button type="button" class="app-modal-btn app-modal-btn--primary" on:click={printReceipt}>
        <i class="bi bi-printer"></i>
        {t('Print')}
      </button>
    </div>
  </svelte:fragment>
</AppModal>

<WhatsappModal bind:this={WhatsappModalRef} />

<style>
  table {
    table-layout: fixed;
    width: 100%;
  }
  td {
    padding: 3px 4px !important;
    border: none !important;
  }
  small {
    font-size: inherit;
  }

  /* Item-table header: the slip's strongest table text. */
  th {
    font-size: 13px;
    font-weight: 700 !important;
    padding: 3px 4px !important;
    border-bottom: 2px solid #000 !important;
  }
  /* The count header reads with the count lines, not with Price / Amount. */
  th.fit-cell { font-weight: 600 !important; }

  /* Store address and item names: secondary text. */
  .items-table .item-name-row td { font-weight: 500; }

  /* Invoice information block (invoice #, customer, date, account number). */
  .head-row { font-weight: 600; }

  /* Count lines, quantity / price / amount, subtotal and detail rows. */
  .items-count { font-weight: 600; }
  .items-table .item-value-row td { font-weight: 600; }
  .items-table .subtotal-row td,
  .items-table .detail-row td { font-weight: 600; }

  /* Payment and balance rows carry the same weight as the summary rows. */
  .pay-row { font-weight: 600; }

  /* NET Total stays the strongest row of the slip. */

  /* The total spelled out: smaller than the figures it restates. */
  .items-table .words-row td {
    font-size: 11px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .items-table .nettotal-row td { font-size: 15px; font-weight: 700; }

  /*
   * Footer: the contact / credit lines, then the sign-off. The sign-off keeps
   * both classes, so it has to be declared last to win its own size/weight.
   */
  .receipt-footer .footer-line { font-size: 12px; font-weight: 500; }
  .receipt-footer .footer-signoff { font-size: 13px; font-weight: 600; }

  table {
    table-layout: fixed;
    width: 100%;
  }

  th:nth-child(1),
  td:nth-child(1) {
    width: 40%; /* quantity */
  }

  th:nth-child(2),
  td:nth-child(2) {
    width: 30%; /* price */
  }

  th:nth-child(3),
  td:nth-child(3) {
    width: 30%; /* amount */
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
    text-overflow: clip;
  }
  .fit-amount {
    display: block;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    overflow-wrap: normal;
    word-break: normal;
    line-height: 1.2;
  }

  /* The count lines: money labels, one step under the table headers. */
  .items-count {
    margin-top: 6px;
    font-weight: 600;
  }

  /*
   * Item block: the product name on its own line, then quantity / price /
   * amount underneath. No rule between the lines of one item — only the
   * header, the Subtotal row and the NET Total row carry a line.
   */
  .items-table .item-name-row td {
    border: none !important;
    padding-top: 5px !important;
    padding-bottom: 0 !important;
  }

  .items-table .item-value-row td {
    border: none !important;
    padding-top: 0 !important;
  }

  .items-table .detail-row td {
    border: none !important;
  }

  .items-table .subtotal-row td {
    border-top: 1px solid #000 !important;
  }

  .items-table .nettotal-row td {
    border-top: 2px solid #000 !important;
    border-bottom: 2px solid #000 !important;
  }

  /*
   * Logical alignment: the quantity sits at the start of the row, the money
   * columns at the end, so the receipt mirrors correctly in Dari/Pashto.
   */
  .start {
    text-align: start;
  }

  .end {
    text-align: end;
  }

  .payments-block,
  .totals {
    margin-top: 6px;
  }

  .pay-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
  }

  /* Store name: the slip's heading. */
  .brand {
    font-size: 18px;
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

  /*
   * Typography only: 13px / 500 base, with headings at 700 and money labels
   * at 600 — see the .brand, .head-row, .items-count, th / td and footer rules
   * below. Layout, spacing, colors, alignment and the 74mm width are the same
   * as before. An element keeps the inherited size unless its own text does
   * not fit at all (see fitTextWithin).
   */
  .receipt {
    width: 74mm;
    padding: 8px 4px;
    max-width: 74mm;
    overflow: hidden;
    word-wrap: break-word;
    word-break: break-word;
    margin: 0 auto;
    background: #fff;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.45;
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
    font-weight: 500;

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
  /*
   * Footer contact block: starts at the reading edge (right in Dari/Pashto)
   * and wraps a long e-mail / web address instead of running off the paper.
   */
  /*
   * Receipt head: two ends of one line — the invoice number on the reading
   * edge, the customer opposite it — so the slip keeps the reference layout
   * and still mirrors in Dari/Pashto.
   */
  .head-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 2px;
  }
  .head-row .head-customer {
    text-align: end;
    overflow-wrap: anywhere;
  }
  /* The Gregorian date keeps its own left-to-right reading on the date line. */
  .head-row .head-gregorian {
    unicode-bidi: embed;
    white-space: nowrap;
  }
  /*
   * The time shares the date line. It is isolated, not forced left-to-right:
   * beside the Persian date the hour and its marker ('۲:۴۳ ب.ظ') must read in
   * the line's own direction, and a slip in English must still read
   * '2:43 PM'. Isolation keeps the dash between the two from flipping.
   */
  .head-row .head-time {
    unicode-bidi: isolate;
    white-space: nowrap;
  }

  .receipt-footer {
    text-align: start;
    line-height: 1.45;
    margin-top: 2px;
  }
  .receipt-footer .footer-line {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /*
   * The sign-off is the one centered line of the slip, and it keeps a clear
   * gap before the contact lines under it.
   */
  .receipt-footer .footer-signoff {
    text-align: center;
    margin-bottom: 8px;
  }
  .divider {
    border-top: 1px solid #000;
    margin: 6px 0;
  }

  .receipt-actions-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .receipt-actions-grid :global(.app-modal-btn) {
    width: 100%;
    justify-content: center;
  }

  .receipt-whatsapp-btn {
    background: #198754;
    border-color: #198754;
    color: #fff;
  }

  .receipt-whatsapp-btn:hover {
    background: #157347;
    border-color: #146c43;
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
