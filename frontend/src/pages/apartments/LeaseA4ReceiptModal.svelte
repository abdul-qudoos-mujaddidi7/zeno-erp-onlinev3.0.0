<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { amountInWords } from '../../utils/amountInWords.js';
  import { currencyLabels } from '../../utils/currencyLabel.js';
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';
  import QRCode from 'qrcode';
  import { accountApi } from '../../api/accountApi.js';
  import { settingsApi } from '../../api/settingsApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let lease = {};

  let dataUrl = '';
  async function loadQRCode() {
    if (!lease?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/whbill/' + String(lease.id), {
      width: 100,
      margin: 1,
    });
  }

  $: if (lease) {
    loadQRCode();
  }

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  let apartments = [];
  let buildings = [];
  let floors = [];

  let settings = [];
  let customer = null;
  let accounts = [];
  async function loadItems() {
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    try {
      const [aptRes, bldRes, flrRes] = await Promise.all([
        apartmentApi.getAll({ status: 1 }),
        buildingApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
      ]);
      apartments = aptRes?.data || [];
      buildings = bldRes?.data || [];
      floors = flrRes?.data || [];
    } catch (err) {
      console.error('Failed to load related entities:', err);
      apartments = [];
      buildings = [];
      floors = [];
    }
  }

  function getAccountName(acc) {
    if (!acc) return '';
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || '';
    return out;
  }

  async function loadCustomer() {
    customer = accounts.find((b) => b.id === lease?.tenant_account_id);
  }

  onMount(async () => {
    await loadItems();
    await loadCustomer();
  });

  function printInvoice() {
    const content = document.getElementById('lease-content').innerHTML;
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

  .lease-container {
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

  function nl2br(str) {
    if (!str) return '';
    return str.replace(/\n/g, '<br>');
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          {t('Lease')} — {lease?.lease_number}
        </h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="lease-content" class="lease-container">
          <!-- Header -->
          <div class="lease-header d-flex justify-content-between align-items-center">
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
            <div class={lease ? '' : 'me-5'}>
              {#if lease?.version && lease?.version > 1}<span class="badge badge-info"
                  >{t('Version')} {lease?.version}</span
                >{/if}
              <div class={lease ? '' : 'me-5'}>
                <strong>{t('Lease')}</strong>: {lease?.lease_number}
              </div>
              <div class={lease ? '' : 'me-5'}>
                <strong>{t('Created')}: </strong>
                {@html lease?.created_at ? showDate(lease.created_at.slice(0, 10), 'justPersian') : ''}
              </div>
              <div class="small {lease ? '' : 'me-5'}" dir="ltr">
                {lease?.created_at ? new Date(lease?.created_at).toLocaleString() : ''}
              </div>
            </div>
          </div>

          <table class="table table-bordered">
            <tbody class="" style="font-size: 10pt;">
              <tr>
                <td class="p-2 py-1">
                  {t('Name')}{t('-of-')}{t('Customer')}: <strong>{getAccountName(customer) || ''}</strong></td>
                <td class="p-2 py-1">
                  {t('Phone')}{t('-of-')}{t('Customer')}: <strong>{customer?.phone || ''}</strong></td>
                <td class="p-2 py-1">
                  {t('Address')}{t('-of-')}{t('Customer')}: <strong>{customer?.address || ''}</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="row">
            <div class="col-6">
              <table class="table table-bordered mb-0">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1"> {t('Apartment')}</td>

                    <td class="fw-bold p-2 py-1"
                      >{apartments.find((a) => a.id === lease?.apartment_id)?.unit_number}</td>
                  </tr>

                  <tr>
                    <td class="p-2 py-1"> {t('Floor')}</td>

                    <td class="fw-bold p-2 py-1"
                      >{floors.find((f) => f.id === apartments.find((a) => a.id === lease?.apartment_id)?.floor_id)
                        ?.floor_number || ''}</td>
                  </tr>

                  <tr>
                    <td class="p-2 py-1"> {t('Building')}</td>

                    <td class="fw-bold p-2 py-1"
                      >{buildings.find(
                        (b) => b.id === apartments.find((a) => a.id === lease?.apartment_id)?.building_id,
                      )?.name || ''} ({buildings.find(
                        (b) => b.id === apartments.find((a) => a.id === lease?.apartment_id)?.building_id,
                      )?.code || ''})</td>
                  </tr>

                  <tr>
                    <td class="p-2 py-1"> {t('Start Date')}</td>

                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{lease?.start_date}</span>{@html lease?.start_date
                        ? showDate(lease.start_date.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>

                  <tr>
                    <td class="p-2 py-1"> {t('End Date')}</td>

                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{lease?.end_date}</span>{@html lease?.end_date
                        ? showDate(lease.end_date.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="col-6">
              <table class="table table-bordered mb-0">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1"> {t('Payment Cycle')}</td>
                    <td class="fw-bold p-2 py-1">{lease.payment_cycle}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Grace Period (Days)')}</td>
                    <td class="fw-bold p-2 py-1">{lease.grace_period_days}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Late Fee Percent')}</td>
                    <td class="fw-bold p-2 py-1">{lease.late_fee_percent}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Monthly Rent')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(lease.monthly_rent || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(lease.currency)}</td>
                  </tr>
                  <!-- The rent stated again in words, in the contract's language. -->
                  <tr>
                    <td class="p-2 py-1" style="font-size:9pt;" colspan="2">{amountInWords(lease.monthly_rent, $lang, currencyLabels(lease.currency, t))}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Deposit Amount')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(lease.deposit_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(lease.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1" style="font-size:9pt;" colspan="2">{amountInWords(lease.deposit_amount, $lang, currencyLabels(lease.currency, t))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {#if lease?.terms_conditions}
            <div class="notes-section border p-3 mt-3">
              <strong>{t('Terms and Conditions')}:</strong>
              <p class="mb-0">{@html nl2br(lease.terms_conditions)}</p>
            </div>
          {/if}
          {#if lease?.description}
            <div class="notes-section border p-3 mt-3">
              <strong>{t('Description')}:</strong>
              <p class="mb-0">{@html nl2br(lease.description)}</p>
            </div>
          {/if}

          <!-- Customer & Invoice Info -->

          <div class="text-end" style="padding:0px 100px">{t('Signature')}</div>
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
        <button class="btn btn-primary" on:click={printInvoice}>{t('Print')}</button>
      </div>
    </div>
  </div>
</div>
