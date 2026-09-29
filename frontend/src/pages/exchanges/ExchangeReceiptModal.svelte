<script>
  import { onMount, createEventDispatcher,tick } from 'svelte';


  import { t, lang, translate_org_type,shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate } from '../../calendar.js';
import { accountApi } from '../../api/accountApi.js';
import WhatsappModal from '../WhatsappModal.svelte';
import { settingsApi } from '../../api/settingsApi.js';
import { amountInWords } from '../../utils/amountInWords.js';
import { currencyLabels } from '../../utils/currencyLabel.js';

  export let exchange = {};

  /*
   * Both sides of the exchange stated again in words, under the figures they
   * restate: the receipt is a document of money, so the amount has to appear
   * spelled out in the language the slip is printed in.
   */
  $: debitInWords = amountInWords(
    exchange?.first_entry_debit,
    $lang,
    currencyLabels(exchange?.first_currency, t),
  );
  $: creditInWords = amountInWords(
    exchange?.second_entry_credit,
    $lang,
    currencyLabels(exchange?.second_currency, t),
  );

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  let addressEl;
  let WhatsappModalRef = null;
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

  let accounts = [];
  let settings = [];

  async function loadItems() {
    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  }

  function getAccountName(acc) {
    let out = '';
    if (!acc) return '-';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  function openExchangeWhatsapp() {
    const firstAccount = accounts.find(
      (account) => account.id === exchange?.first_entry_account,
    );
    const secondAccount = accounts.find(
      (account) => account.id === exchange?.second_entry_account,
    );

    WhatsappModalRef?.openModal(
      'exchange_created_template',
      exchange,
      firstAccount,
      {},
      secondAccount,
    );
  }
  onMount(async () => {
    // Load all dependencies in order
    await loadItems(); // items depend on products
    // Map unit names directly to items to simplify template
    await tick(); // import from 'svelte'

    fitText(addressEl);
  });
  function printReceipt() {
    const content = document.getElementById('receipt-content').innerHTML;
    const styles = `
        <style>
body { margin: 0; }
          
table {border-bottom: 2px solid #000 !important}
td {border-bottom: 1px solid #000 !important;font-size:10pt !important;padding:4px 4px  !important;}
th {border-bottom: 2px solid #000 !important;border-top: 2px solid #000 !important;font-size:11pt  !important;}

          @page { size: 74mm auto; margin: 0; }

.brand { font-size: 16px; font-weight: 700; }
.receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
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
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-dialog-centered" style="max-width: 310px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {exchange?.id}</h5>
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

            <div>
              <small>
                {t('Date')}: {@html exchange?.date ? showDate(exchange?.date.slice(0, 10), 'receipt') : ''}
              </small>
              <small class="float-end">{exchange?.date.slice(0, 10)}</small>
            </div>

            <div><small>{t('Number')} {t('Exchange')}: {shortID(exchange?.id)}</small></div>

            <div class="divider"></div>
            {#if accounts.find((a) => a.id === exchange?.first_entry_account)?.id > 100000}
              <div class="">
                <small>
                  {t('Number')}
                  {t('Account')}: {shortID(accounts.find((a) => a.id === exchange?.first_entry_account)?.id || 0)}
                </small>
              </div>
            {/if}
            <div>
              {t('Account')}:
              <span class="fw-bold"
                >{getAccountName(accounts.find((a) => a.id === exchange?.first_entry_account)) || '-'}</span>
            </div>
            {#if exchange?.first_entry_debit > 0}<div>
                {t('Debit')}:
                <span class="fw-bold"
                  >{Number(exchange?.first_entry_debit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,minimumFractionDigits: 2,
                  })}
                  {t(exchange?.first_currency)}</span>
              </div>

              <div class="words-line" style="font-size:10pt;">
                <span dir="ltr">{debitInWords}</span>
              </div>
            {/if}

            <div class="divider"></div>
            <div>
              {t('Rate')}:
              <span class="fw-bold"
                >{Number(exchange.rate || 0).toLocaleString(undefined, {
                  maximumFractionDigits: 6,minimumFractionDigits: 2,
                })}</span>
            </div>

            <div class="divider"></div>

            {#if accounts.find((a) => a.id === exchange?.second_entry_account)?.id > 100000}
              <div class="">
                <small>
                  {t('Number')}
                  {t('Peer Account')}: {shortID(accounts.find((a) => a.id === exchange?.second_entry_account)?.id || 0)}
                </small>
              </div>

            <div>
              {t('Peer Account')}:
              <span class="fw-bold"
                >{getAccountName(accounts.find((a) => a.id === exchange?.second_entry_account)) || '-'}</span>
            </div>
            {/if}

            {#if exchange?.second_entry_credit > 0}
              <div>
                {t('Credit')}:
                <span class="fw-bold"
                  >{Number(exchange?.second_entry_credit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,minimumFractionDigits: 2,
                  })}
                  {t(exchange?.second_currency)}</span>
              </div>

              <div class="words-line" style="font-size:10pt;">
                <span dir="ltr">{creditInWords}</span>
              </div>
            {/if}


            {#if exchange?.description && exchange?.description !== ''}

            <div class="divider"></div>
              <div>
                {t('Description')}: <span class="fw-bold">{exchange.description}</span>
              </div>
            {/if}


            <div class="divider"></div>
            <div class="center small fw-bold">
              {t('Powered by ZenoERP • Thank you!')}
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}><i class="bi bi-x-lg"></i> {t('Close')}</button>

          <button class="btn btn-success" on:click={openExchangeWhatsapp}>
            <i class="bi bi-whatsapp"></i> {t('Whatsapp')}
          </button>

        <button class="btn btn-primary" on:click={printReceipt} style="color:#ffffff !important;"><i class="bi bi-printer" style="color:#ffffff !important;"></i> {t('Print')}</button>
      </div>
    </div>
  </div>
</div>

<WhatsappModal bind:this={WhatsappModalRef} />

<style>
  td {
    border-bottom: 1px solid #000 !important;
    border-left: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    font-size: 10pt !important;
    padding: 4px 4px !important;
  }
  th {
    border-bottom: 2px solid #000 !important;
    border-left: 1px solid #000 !important;
    border-right: 1px solid #000 !important;
    font-size: 11pt !important;
  }

  .receipt {
    width: 74mm;
    padding: 8px 4px;
    max-width: 74mm;
    overflow: hidden;
    word-wrap: break-word;
    word-break: break-word;
  }
  .brand {
    font-size: 16px;
    font-weight: 700;
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
