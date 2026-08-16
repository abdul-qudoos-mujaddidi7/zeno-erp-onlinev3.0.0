<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
import { departmentApi } from '../../../api/departmentApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { salePaymentApi } from '../../../api/salePaymentApi.js';

  ;
  import QRCode from "qrcode";

  import WhatsappModal from '../../WhatsappModal.svelte';
  let WhatsappModalRef = null;

  import { t, lang, translate_org_type, shortID } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate } from '../../../calendar.js';
import { userApi } from '../../../api/userApi.js';
import { saleApi } from '../../../api/saleApi.js';

  export let appointment = {};

  let firstEntryBalance = {};
  let sales = [];
  let sale_payments = [];
  let dataUrl = '';

  async function loadQRCode() {
    if (!appointment?.id) return;
    dataUrl = await QRCode.toDataURL("https://zenoerp.com/appointment/" + String(appointment.id), { width: 70, margin: 1 });
  }

  $: if (appointment?.id) {
    loadQRCode();
  }

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  let patients = [];
  let departments = [];
  let doctors = [];
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
    patients = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];
    departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
  }

  function getPatientName(acc) {
    let out = '';
    if (!acc) return '-';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
  onMount(async () => {
    // Load all dependencies in order
    await loadItems(); // items depend on products

    sales = (await saleApi.getAll({ status: 1 }))?.data || [];
    sale_payments = (await salePaymentApi.getAll({ status: 1 }))?.data || [];
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
.receipt {
            width: 74mm;
            padding: 8px 4px;
            max-width: 74mm;
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
    if (!appointment?.reference_type) return '';
    let text = ``;
    if (appointment.reference_type != 'patient') {
        text = `${t('Reference')}: ${t(appointment.reference_type)}\n`;
    }
    if (appointment.reference_type === 'sale_payment') {
      const payment = sale_payments.find((sp) => sp.id === appointment.reference_id);
      const sale = sales.find((s) => s.id === payment?.sale_id);

      text += `${t('Invoice #')}: ${sale?.invoice_number ?? '-'}`;
    } else if (appointment.reference_type != 'patient') {
      text += `${t('Reference ID')}: ${shortID(appointment?.reference_id)}`;
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
  <div class="modal-dialog modal-dialog-centered" style="max-width: 310px;">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Receipt')} — {appointment?.id}</h5>
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

            <div class="center fw-bold">
                {t('Serial Number')}: {@html appointment?.serial_no || '-'}
            </div>

            <div class="divider"></div>

            <div>
              <small>
                {t('Date')}: {@html appointment?.date ? showDate(appointment?.date.slice(0, 10), 'receipt') : ''}
              </small>
              <small class="float-end">{appointment?.date.slice(0, 10)}</small>
            </div>

            {#if referenceText}
              <div class="divider"></div>

              <div class="">
                <small>
                  {@html nl2br(referenceText)}
                </small>
              </div>
            {/if}

            <div class="divider"></div>

            <table class='w-100'>
            <tbody>
              <tr>
                <td>{t('Code')}
                  {t('Patient')}</td>
                <td class="fw-bold ps-4">
                  {patients.find((a) => a.id === appointment?.patient_id)?.code || '0'}
                </td>
              </tr>
              <tr>
                <td>{t('Patient')}</td>
                <td class="fw-bold">{getPatientName(patients.find((a) => a.id === appointment?.patient_id)) || '-'}</td>
              </tr>

            {#if appointment?.doctor_id}
              <tr>
                <td>{t('Doctor')}</td>
                <td class="fw-bold">{doctors.find((d) => d.id === appointment?.doctor_id)?.first_name + ' ' + doctors.find((d) => d.id === appointment?.doctor_id)?.last_name || '-'}</td>
              </tr>
            {/if}

            {#if appointment?.department_id}
            <tr>
                <td>{t('Department')}</td>
                <td class="fw-bold">{departments.find((d) => d.id === appointment?.department_id)?.name || '-'}</td>
              </tr>
            {/if}

              {#if appointment?.visit_date != 0}
                <tr>
                  <td>{t('Visit Date')} </td>
                  <td class="fw-bold">{new Date(appointment?.visit_date).toLocaleString(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
})}</td>

                </tr>
              {/if}

              </tbody>
            </table>
            <table class='w-100 mt-2'>
            <tbody>
              {#if appointment?.fee != 0}
                <tr>
                  <td>{t('Appointment Fee')}</td>
                  <td class="fw-bold">{Number(appointment?.fee || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(appointment?.currency)}</td>

                <td rowspan="3" class="text-end"><img src="{dataUrl}" class="qrcode-img"/></td>

                </tr>

                <tr>
                  <td>{t('Receipt')}</td>
                  <td class="fw-bold" colspan="2">{Number(appointment?.paid_amount || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(appointment?.currency)}</td>
                </tr>
              {/if}

              <tr>
                <td>{t('ID')}{t("-of-")}{t('Appointment')} </td>
                <td class="fw-bold"  colspan="2">{shortID(appointment?.id || 0)}
                  {#if appointment?.fee == 0}
                    <td class="text-end"><img src="{dataUrl}" class="qrcode-img"/></td>
                  {/if}

                </td>

              </tr>
              </tbody>
            </table>

            {#if appointment?.description && appointment?.description !== ''}
              <div class="divider"></div>
              <div class="fw-bold">
                {t('Description')}: <span>{appointment.description}</span>
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
          class="btn btn-success px-3"
          on:click={() => {
            WhatsappModalRef.openModal(
              'appointment_created_template',
              appointment,
              patients.find((a) => a.id === appointment?.patient_id),
              appointment?.fee,
              doctors.find((a) => a.id === appointment?.doctor_id),
              departments.find((a) => a.id === appointment?.department_id)?.name,
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
    /* border-bottom: 1px solid #000 !important;
    border-left: 1px solid #000 !important;
    border-right: 1px solid #000 !important; */
    font-size: 10pt !important;
    padding: 4px 4px !important;
  }
  th {
    /* border-bottom: 2px solid #000 !important;
    border-left: 1px solid #000 !important;
    border-right: 1px solid #000 !important; */
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
</style>
