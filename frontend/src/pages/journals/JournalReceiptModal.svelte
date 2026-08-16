<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  ;
  import JournalA4ReceiptModal from './JournalA4ReceiptModal.svelte';
  let showA4Receipt = false;
  import WhatsappModal from '../WhatsappModal.svelte';
  let WhatsappModalRef = null;
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { calculateBalanceOfAccount } from '../accounts/AccountsHelper.js';
  import { showDate } from '../../calendar.js';
import { accountApi } from '../../api/accountApi.js';
import { settingsApi } from '../../api/settingsApi.js';
import { salePaymentApi } from '../../api/salePaymentApi.js';
import { saleApi } from '../../api/saleApi.js';
  export let journal = {};
  export let saleData = null;
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
  function printReceipt() {
    const content = document.getElementById('receipt-content').innerHTML;
    const styles = `
        <style>
body { margin: 0; }
       
table {border-bottom: 2px solid #000 !important}
td {border-bottom: 1px solid #000 !important;font-size:10pt !important;padding:4px 4px  !important;}
th {border-bottom: 2px solid #000 !important;border-top: 2px solid #000 !important;font-size:11pt  !important;}

          @page { size: 74mm auto; margin: 0; }
.receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
            overflow: hidden;
            word-wrap: break-word;
            word-break: break-word;
          }
.brand { font-size: 16px; font-weight: 500; }
         .underbrand {
    font-size: 12px;
    font-weight: 500;

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

  function sameId(first, second) {
    return String(first ?? '').trim() === String(second ?? '').trim();
  }

  function findLinkedSaleFromCache() {
    if (saleData?.invoice_number) return saleData;
    if (journal?.reference_type !== 'sale_payment') return null;

    const payment = sale_payments.find((item) =>
      sameId(item.id, journal?.reference_id),
    );

    if (!payment?.sale_id) return null;

    return (
      sales.find((item) => sameId(item.id, payment.sale_id)) ||
      null
    );
  }

  async function resolveLinkedSale() {
    const cachedSale = findLinkedSaleFromCache();
    if (cachedSale) return cachedSale;

    if (journal?.reference_type !== 'sale_payment') {
      return saleData || null;
    }

    const payments = (await salePaymentApi.getAll())?.data || [];
    const payment = payments.find((item) =>
      sameId(item.id, journal?.reference_id),
    );

    if (!payment?.sale_id) return saleData || null;

    const allSales = [
      ...((await saleApi.getAll({ status: 1 }))?.data || []),
      ...((await saleApi.getAll({ status: 0 }))?.data || []),
    ];

    return (
      allSales.find((item) => sameId(item.id, payment.sale_id)) ||
      saleData ||
      null
    );
  }

  $: referenceText = (() => {
    if (!journal?.reference_type) return '';

    let text = '';

    if (journal.reference_type !== 'account') {
      text = `${t('Reference')}: ${t(journal.reference_type)}\n`;
    }

    if (journal.reference_type === 'sale_payment') {
      const linkedSale = findLinkedSaleFromCache();

      text += `${t('Invoice #')}: ${
        linkedSale?.invoice_number ??
        journal?.invoice_number ??
        '-'
      }`;
    } else if (journal.reference_type !== 'account') {
      text += `${t('Reference ID')}: ${shortID(journal?.reference_id)}`;
    }

    return text;
  })();

  async function openWhatsappReceipt() {
    const firstAccount =
      accounts.find((item) =>
        sameId(item.id, journal?.first_entry_account),
      ) || {};

    const peerAccount =
      accounts.find((item) =>
        sameId(item.id, journal?.second_entry_account),
      ) || {};

    const linkedSale = await resolveLinkedSale();

    /*
     * Add the linked invoice number directly to the journal payload.
     * This keeps the WhatsApp modal compatible with old calls while
     * also allowing {{شماره بل}} to be replaced for journal receipts.
     */
    const whatsappJournal = {
      ...journal,
      invoice_number:
        linkedSale?.invoice_number ||
        journal?.invoice_number ||
        '',
      sale_id:
        linkedSale?.id ||
        journal?.sale_id ||
        null,
    };

    WhatsappModalRef?.openModal(
      'journal_created_template',
      whatsappJournal,
      firstAccount,
      firstEntryBalance,
      peerAccount,
      referenceText,
      linkedSale,
    );
  }

  function nl2br(str) {
    if (!str) return '';
    return str.replace(/\n/g, '<br>');
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-dialog-centered" style="max-width: 310px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {journal?.id}</h5>
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
            </div>
            <div class="divider"></div>
            <div>
              <small>
                {t('Date')}: {@html journal?.date ? showDate(journal?.date.slice(0, 10), 'receipt') : ''}
              </small>
              <small class="float-end">{journal?.date.slice(0, 10)}</small>
            </div>
            <div><small>{t('Number')} {t('Journal')}: {shortID(journal?.id || 0)}</small></div>
            {#if referenceText}
              <div class="divider"></div>
              <div class="">
                <small>
                  {@html nl2br(referenceText)}
                </small>
              </div>
            {/if}
            <div class="divider"></div>
            {#if accounts.find((a) => a.id === journal?.first_entry_account)?.main_acc != 'true'}
              <div class="">
                <small>
                  {t('Number')}
                  {t('Account')}:
                  <span class=""
                    >{shortID(accounts.find((a) => a.id === journal?.first_entry_account)?.id || '0')}</span>
                </small>
              </div>
            {/if}
            <div>
              {t('Account')}:
              <span class="fw-bold"
                >{getAccountName(accounts.find((a) => a.id === journal?.first_entry_account)) || '-'}</span>
            </div>
            {#if journal?.first_entry_debit != 0}<div>
                {t('Debit')}:
                <span class="fw-bold"
                  >{Number(journal?.first_entry_debit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal?.currency)}</span>
              </div>
            {/if}
            {#if journal?.first_entry_credit != 0}<div>
                {t('Credit')}:
                <span class="fw-bold"
                  >{Number(journal?.first_entry_credit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal?.currency)}</span>
              </div>
            {/if}
            <div class="divider"></div>
            <div class="balance-list">
              {#if firstEntryBalance && Object.keys(firstEntryBalance).length}
                {#each Object.entries(firstEntryBalance) as [key, value]}
                  <div class="balance-row">
                    <span class="balance-label">{t('Balance')}:</span>
                    <span class="balance-value">
                      <span dir="ltr">{value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                      {t(key)}
                    </span>
                  </div>
                {/each}
              {/if}
            </div>
            {#if accounts.find((a) => a.id === journal?.second_entry_account)?.main_acc != 'true'}
              <div class="divider"></div>
              <div class="">
                <small>
                  {t('Number')}
                  {t('Peer Account')}:
                  <span class="fw-bold"
                    >{shortID(accounts.find((a) => a.id === journal?.second_entry_account)?.id || 0)}</span>
                </small>
              </div>
              <div>
                {t('Peer Account')}:
                <span class="fw-bold"
                  >{getAccountName(accounts.find((a) => a.id === journal?.second_entry_account)) || '-'}</span>
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
              <div class="divider"></div>
              <div>
                {t('Description')}: <span>{journal.description}</span>
              </div>
            {/if}
            <div class="divider"></div>
            <div class="center small">
              {t('Powered by ZenoERP • Thank you!')}
            </div>
            <div class="center small">www.zenoerp.com</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={close}><i class="bi bi-x-lg"></i> {t('Close')}</button>
        <button
          class="btn btn-success px-2"
          on:click={openWhatsappReceipt}>
          <i class="bi bi-whatsapp"></i>
        </button>
        <button class="btn btn-warning px-2" on:click={()=>{
          showA4Receipt = true;
        }}><i class="bi bi-file"></i> {t('A4')}</button>
        <button class="btn btn-primary px-2" on:click={printReceipt}><i class="bi bi-printer"></i> {t('Print')}</button>
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
    font-weight: 500;
  }
  .underbrand {
    font-size: 12px;
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
  .balance-list {
    margin-top: 4px;
  }
  .balance-row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 10pt;
    line-height: 1.3;
    margin-bottom: 2px;
  }
  .balance-label {
    font-weight: 500;
  }
  .balance-value {
    font-weight: 600 !important;
    text-align: right;
    white-space: nowrap;
  }
  .divider {
    border-top: 1px solid #000;
    margin: 6px 0;
  }
</style>
{#if showA4Receipt}
  <JournalA4ReceiptModal
    journal={journal}
    saleData={saleData}
    on:close={() => (showA4Receipt = false)}
    on:show80mm={() => (showA4Receipt = false)} />
{/if}