<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';

  ;

  import WhatsappModal from '../WhatsappModal.svelte';
  let WhatsappModalRef = null;

  import { t, lang, translate_org_type, shortID,settings_all } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { calculateBalanceOfAccount } from '../accounts/AccountsHelper.js';

  import { showDate } from '../../calendar.js';

  export let journal = {};

  $: if (journal) {
    loadQRCode();
  }

  export let saleData = null;
  
  $: enable_show_qr_code = $settings_all.find((s) => s.key === 'enable_show_qr_code')?.value == 1;

  import QRCode from 'qrcode';
import { accountApi } from '../../api/accountApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { salePaymentApi } from '../../api/salePaymentApi.js';
import { saleApi } from '../../api/saleApi.js';
  let dataUrl = '';
  async function loadQRCode() {
    if (!journal?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/journal/' + String(journal.id), {
      width: 100,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  let firstEntryBalance = {};
  let sales = [];
  let sale_payments = [];

  async function loadBalance() {
    if (!journal?.first_entry_account) {
      firstEntryBalance = {};
      return;
    }
    const result = await calculateBalanceOfAccount(journal.first_entry_account);
    firstEntryBalance = result || {};
  }

  $: if (journal?.first_entry_account) {
    loadBalance();
  }

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function show80mm() {
    dispatch('show80mm');
  }

  let accounts = [];
  let settings = [];

  let addressEl;
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
  onMount(async () => {
    await loadItems();
    sales = (await saleApi.getAll({ status: 1 }))?.data || [];
    sale_payments = (await salePaymentApi.getAll({ status: 1 }))?.data || [];
    await tick();
    fitText(addressEl);
  });

  let receipt_content;
  function printReceipt() {
    const content = receipt_content.innerHTML;
    const styles = `
        <style>
body { margin: 10mm; }
       
table {border-bottom: 2px solid #000 !important}
td {border-bottom: 1px solid #000 !important;font-size:10pt !important;padding:4px 4px  !important;}
th {border-bottom: 2px solid #000 !important;border-top: 2px solid #000 !important;font-size:11pt  !important;}

          @page { size: 190mm auto; margin: 10mm; }
.receipt {
            width: 190mm;
            padding: 8px 4px;
            max-width: 190mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
          }
.brand { font-size: 16px; font-weight: 700; }
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

  $: referenceText = (() => {
    if (!journal?.reference_type) return '';
    let text = ``;
    if (journal.reference_type != 'account') {
      text = `<div class='col'>${t('Reference')}: <strong>${t(journal.reference_type)}</strong></div>`;
    }
    if (journal.reference_type === 'sale_payment') {
      const payment = sale_payments.find((sp) => sp.id === journal.reference_id);
      const sale = sales.find((s) => s.id === payment?.sale_id);
      text += `<div class='col border-start'>${t('Invoice #')}: <strong>${sale?.invoice_number ?? '-'}</strong></div>`;
    } else if (journal.reference_type != 'account') {
      text += `<div class='col border-start'>${t('Reference ID')}: <strong>${shortID(journal?.reference_id)}</strong></div>`;
    }
    return text;
  })();

  function nl2br(str) {
    if (!str) return '';
    return str.replace(/\n/g, '<br>');
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg modal-dialog-centered" style="max-width: 750px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {journal?.id}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="receipt-content" bind:this={receipt_content}>
          <div class="receipt">
            <div class=" d-flex justify-content-start align-items-center">
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
            <hr class="my-1" />
            <div class="row">
              <div class="col">
                <div>
                  {t('Date')}:
                  <strong>{@html journal?.date ? showDate(journal?.date.slice(0, 10), 'receipt') : ''}</strong>
                  <span class="float-end fw-bold">{journal?.date.slice(0, 10)}</span>
                </div>
              </div>
              <div class="col border-start">
                <div><span>{t('Number')} {t('Journal')}: <strong>{shortID(journal?.id || 0)}</strong></span></div>
              </div>
            </div>
            <hr class="my-1" />
            <div class="row">
              {#if referenceText}
              {@html nl2br(referenceText)}
              {/if}
            </div>
            {#if saleData}
              <hr class="my-1" />
              <div class="row">
                <div class="col">{t('Total')}: <strong><span dir='ltr'>{saleData.total}</span> {t(saleData.currency)}</strong></div>
                {#if saleData.expenses}<div class="col border-start">{t('Expenses')}: <strong><span dir='ltr'>{saleData.expenses}</span> {t(saleData.currency)}</strong></div>{/if}
                <div class="col border-start">{t('Discount')}: <strong> <span dir='ltr'>{saleData.discount}</span> {t(saleData.currency)}</strong></div>
                <div class="col border-start">{t('Payable')}: <strong><span dir='ltr'>{saleData.payable}</span> {t(saleData.currency)}</strong></div>
              </div>
              <hr class="my-1" />
              <div class="row">
                <div class="col">{t('Total Payments')}: <strong><span dir='ltr'>{saleData.totalPayments}</span> {t(saleData.currency)}</strong></div>
                <div class="col border-start">{t('Total Returns')}: <strong><span dir='ltr'>{saleData.totalReturns}</span> {t(saleData.currency)}</strong></div>
                <div class="col border-start">{t('Remaining')}: <strong><span dir='ltr'>{saleData.remaining}</span> {t(saleData.currency)}</strong></div>
              </div>
            {/if}
            <hr class="my-1" />
            <div class="row">
              <div class="col border-start">
                {t('Account')}:
                <span class="fw-bold"
                  >{getAccountName(accounts.find((a) => a.id === journal?.first_entry_account)) || '-'}</span>
              </div>
              {#if accounts.find((a) => a.id === journal?.first_entry_account)?.main_acc != 'true'}
                <div class="col border-start">
                  {t('Number')}
                  {t('Account')}:
                  <span class="fw-bold"
                    >{shortID(accounts.find((a) => a.id === journal?.first_entry_account)?.id || '0')}</span>
                </div>
              {/if}
            </div>
            <hr class="my-1" />
            <div class="row">
              {#if firstEntryBalance && Object.keys(firstEntryBalance).length}
                <div class="col border-start">
                  {#each Object.entries(firstEntryBalance) as [key, value]}
                    {t('Old Balance')}:
                    <span class="fw-bold">
                      <span dir="ltr"
                        >{key == journal?.currency
                          ? (
                              Number(value) +
                              Number(journal?.first_entry_debit || 0) -
                              Number(journal?.first_entry_credit || 0)
                            ).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      {t(key)}
                    </span>
                  {/each}
                </div>
              {/if}
              {#if journal?.first_entry_debit != 0}<div class="col border-start">
                  {t('Withdrawal')}:
                  <span class="fw-bold"
                    >{Number(journal?.first_entry_debit || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(journal?.currency)}</span>
                </div>
              {/if}
              {#if journal?.first_entry_credit != 0}<div class="col border-start">
                  {t('Received')}:
                  <span class="fw-bold"
                    >{Number(journal?.first_entry_credit || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(journal?.currency)}</span>
                </div>
              {/if}
              {#if firstEntryBalance && Object.keys(firstEntryBalance).length}
                <div class="col border-start">
                  {#each Object.entries(firstEntryBalance) as [key, value]}
                    {t('Now Balance')}:
                    <span class="fw-bold">
                      <span dir="ltr">{value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      {t(key)}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
            {#if accounts.find((a) => a.id === journal?.second_entry_account)?.main_acc != 'true'}
              <hr class="my-1" />
              <div class="row">
                <div class="col">
                  {t('Number')}
                  {t('Peer Account')}:
                  <span class="fw-bold"
                    >{shortID(accounts.find((a) => a.id === journal?.second_entry_account)?.id || 0)}</span>
                </div>
                <div class="col border-start">
                  {t('Peer Account')}:
                  <span class="fw-bold"
                    >{getAccountName(accounts.find((a) => a.id === journal?.second_entry_account)) || '-'}</span>
                </div>
              </div>
            {/if}
            <!-- 
            {#if journal?.second_entry_debit != 0}
              <div>
                {t('Debit')}:
                <span class="fw-bold"
                  >{Number(journal?.second_entry_debit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal?.currency)}</span>
              </div>
            {/if}
            {#if journal?.second_entry_credit != 0}
              <div>
                {t('Credit')}:
                <span class="fw-bold"
                  >{Number(journal?.second_entry_credit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal?.currency)}</span>
              </div>
            {/if} -->

            {#if journal?.description && journal?.description !== ''}
              <hr class="my-1" />
              <div>
                {t('Description')}: <span>{t(journal.description)}</span>
              </div>
            {/if}
            <div class="footer small text-primary">
              <hr class="mt-1" />
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
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}><i class="bi bi-x-lg"></i> {t('Close')}</button>
        <button class="btn btn-outline-primary px-3" on:click={show80mm}>
          <i class="bi bi-receipt"></i>
          {t('Receipt')}
        </button>
        <button
          class="btn btn-success px-3"
          on:click={() => {
            WhatsappModalRef.openModal(
              'journal_created_template',
              journal,
              accounts.find((a) => a.id === journal?.first_entry_account),
              firstEntryBalance,
              accounts.find((a) => a.id === journal?.second_entry_account),
              referenceText,
            );
          }}><i class="bi bi-whatsapp"></i></button>
        <button class="btn btn-primary" on:click={printReceipt}><i class="bi bi-printer"></i> {t('Print')}</button>
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
    width: 190mm;
    padding: 8px 4px;
    max-width: 190mm;
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
</style>
