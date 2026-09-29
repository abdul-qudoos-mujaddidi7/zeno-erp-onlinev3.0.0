<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { leaseApi } from '../../api/leaseApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { amountInWords } from '../../utils/amountInWords.js';
  import { currencyLabels } from '../../utils/currencyLabel.js';

  /* The billed amount, spelled out under the figure it restates. */
  $: totalInWords = amountInWords(invoice?.total_amount, $lang, currencyLabels(invoice?.currency, t));
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';
  import QRCode from 'qrcode';
  import { accountApi } from '../../api/accountApi.js';
  import { settingsApi } from '../../api/settingsApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let invoice = {};

  let dataUrl = '';
  async function loadQRCode() {
    if (!invoice?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/whbill/' + String(invoice.id), {
      width: 100,
      margin: 1,
    });
  }

  $: if (invoice) {
    loadQRCode();
  }

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  let settings = [];
  let customer = null;
  let accounts = [];
  let apartments = [];
  let apartment = null;
  let leases = [];
  let lease = null;
  let floors = [];
  let floor = null;
  let buildings = [];
  let building = null;
  async function loadItems() {
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    try {
      const [leaseRes, aptRes, flrRes, bldRes] = await Promise.all([
        leaseApi.getAll({ status: 1 }),
        apartmentApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
        buildingApi.getAll({ status: 1 }),
      ]);
      leases = leaseRes?.data || [];
      apartments = aptRes?.data || [];
      floors = flrRes?.data || [];
      buildings = bldRes?.data || [];
    } catch (err) {
      console.error('Failed to load related entities:', err);
      leases = [];
      apartments = [];
      floors = [];
      buildings = [];
    }
  }

  $: if (invoice) {
    lease = leases.find((l) => Number(l.id) === Number(invoice.lease_id));
    if (lease) {
      apartment = apartments.find((a) => Number(a.id) === Number(lease.apartment_id));
      if (apartment) {
        floor = floors.find((f) => Number(f.id) === Number(apartment.floor_id));
        if (floor) {
          building = buildings.find((b) => Number(b.id) === Number(floor.building_id));
        }
      }
    } else {
      apartment = null;
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
    customer = accounts.find((b) => b.id === leases.find((b) => b.id === invoice.lease_id)?.tenant_account_id);
  }

  onMount(async () => {
    await loadItems();
    await loadCustomer();
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
          {t('Rent Invoice')} — {invoice?.invoice_number}
        </h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="invoice-content" class="invoice-container">
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
            <div class={invoice ? '' : 'me-5'}>
              {#if invoice?.invoice_status === 'draft'}
                <span class="badge badge-warning text-dark">{t('Draft')}</span>
              {:else if invoice?.invoice_status === 'confirmed'}
                <span class="badge badge-success">{t('confirmed')}</span>
              {:else}
                <span class="badge badge-secondary">{invoice?.invoice_status || ''}</span>
              {/if}
              {#if invoice?.version && invoice?.version > 1}<span class="badge badge-info"
                  >{t('Version')} {invoice?.version}</span
                >{/if}
              <div class={invoice ? '' : 'me-5'}>
                <strong>{t('Rent Invoice')}</strong>: {invoice?.invoice_number}
              </div>
              <div class={invoice ? '' : 'me-5'}>
                <strong>{t('Created')}: </strong>
                {@html invoice?.created_at ? showDate(invoice.created_at.slice(0, 10), 'justPersian') : ''}
              </div>
              <div class="small {invoice ? '' : 'me-5'}" dir="ltr">
                {invoice?.created_at ? new Date(invoice?.created_at).toLocaleString() : ''}
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-6">
              <table class="table table-bordered">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1"> {t('Lease Number')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{leases.find((b) => b.id === invoice.lease_id)?.lease_number || ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Apartment')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{apartment?.unit_number || ''} - {floor?.floor_number || ''} - {building?.code || ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Issue Date')}</td>
                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{invoice?.issue_date}</span>{@html invoice?.issue_date
                        ? showDate(invoice.issue_date.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Due Date')}</td>
                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{invoice?.due_date}</span>{@html invoice?.due_date
                        ? showDate(invoice.due_date.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Name')}{t('-of-')}{t('Customer')}</td>
                    <td class="fw-bold p-2 py-1">{getAccountName(customer) || ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Billing Period Start')}</td>
                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{invoice?.billing_period_start}</span
                      >{@html invoice?.billing_period_start
                        ? showDate(invoice.billing_period_start.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Billing Period End')}</td>
                    <td class="fw-bold p-2 py-1"
                      ><span class="float-end">{invoice?.billing_period_end}</span>{@html invoice?.billing_period_end
                        ? showDate(invoice.billing_period_end.slice(0, 10), 'justPersian')
                        : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="col-6">
              <table class="table table-bordered">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1"> {t('Base Rent')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.base_rent || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Utility Charges')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.utility_charges || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Other Charges')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.other_charges || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Late Fee')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.late_fee || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Total Amount')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1" style="font-size:9pt;" colspan="2">{totalInWords}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Paid Amount')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(invoice.paid_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {t(invoice.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Bill Due')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)).toLocaleString(
                        undefined,
                        { maximumFractionDigits: 3 },
                      )}
                      {t(invoice.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {#if invoice?.description}
            <div class="notes-section border p-3 mt-3">
              <strong>{t('Description')}:</strong>
              <p class="mb-0">{@html nl2br(invoice.description)}</p>
            </div>
          {/if}
          <div class="text-end" style="padding:0px 100px">{t('Signature')}</div>
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
