<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { utilityMeterApi } from '../../api/utilityMeterApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { t, lang, translate_org_type, settings_all, shortID } from '../../i18n/i18n.js';
  import { showDate } from '../../calendar.js';
  import { push } from 'svelte-spa-router';
  import QRCode from 'qrcode';
import { accountApi } from '../../api/accountApi.js';
import { settingsApi } from '../../api/settingsApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let meter_reading = {};

  let dataUrl = '';
  async function loadQRCode() {
    if (!meter_reading?.id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/meterreadingbill/' + String(meter_reading.id), {
      width: 100,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }
  $: if (meter_reading) {
    loadQRCode();
  }
  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }
  let settings = [];
  let customer = null;
  let accounts = [];
  let meters = [];
  let meter = null;
  let apartments = [];
  let apartment = null;
  let floors = [];
  let floor = null;
  let buildings = [];
  let building = null;
  async function loadItems() {
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    try {
      const [meterRes, aptRes, floorRes, buildingRes] = await Promise.all([
        utilityMeterApi.getAll({ status: 1 }),
        apartmentApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
        buildingApi.getAll({ status: 1 }),
      ]);
      meters = meterRes?.data || [];
      apartments = aptRes?.data || [];
      floors = floorRes?.data || [];
      buildings = buildingRes?.data || [];
    } catch (err) {
      console.error('Failed to load meter receipt labels:', err);
      meters = [];
      apartments = [];
      floors = [];
      buildings = [];
    }
  }
  $: if (meter_reading) {
    meter = meters.find((m) => m.id === meter_reading.meter_id);
    if (meter) {
      apartment = apartments.find((a) => a.id === meter.apartment_id);
      if (apartment) {
        floor = floors.find((f) => f.id === apartment.floor_id);
        if (floor) {
          building = buildings.find((b) => b.id === floor.building_id);
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
  onMount(async () => {
    await loadItems();
  });
  function printInvoice() {
    const content = document.getElementById('meter_reading-content').innerHTML;
    const styles = `<style>
                      @page {
                        size: A4;
                        margin: 10mm;
                      }
                      html, body {
                        height: 100%;
                        margin: 0;
                      }
                      .meter_reading-container {
                        min-height: 100vh;
                        display: flex;
                        flex-direction: column;
                      }
                      .footer {
                        width:100%;
                        position: fixed;
                      }
                    </style>`;
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
          {t('Meter Reading')} — {meter_reading?.id}
        </h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="meter_reading-content" class="meter_reading-container">
          <div class="meter_reading-header d-flex justify-content-between align-items-center">
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
            <div class={meter_reading ? '' : 'me-5'}>
              {#if meter_reading?.meter_reading_status === 'draft'}
                <span class="badge badge-warning text-dark">{t('Draft')}</span>
              {:else if meter_reading?.meter_reading_status === 'confirmed'}
                <span class="badge badge-success">{t('confirmed')}</span>
              {:else}
                <span class="badge badge-secondary">{meter_reading?.meter_reading_status || ''}</span>
              {/if}
              {#if meter_reading?.version && meter_reading?.version > 1}<span class="badge badge-info"
                  >{t('Version')} {meter_reading?.version}</span
                >{/if}
              <div class={meter_reading ? '' : 'me-5'}>
                <strong>{t('Meter Reading')}</strong>: {shortID(meter_reading?.id)}
              </div>
              <div class={meter_reading ? '' : 'me-5'}>
                <strong>{t('Created')}: </strong>
                {@html meter_reading?.created_at ? showDate(meter_reading.created_at.slice(0, 10), 'justPersian') : ''}
              </div>
              <div class="small {meter_reading ? '' : 'me-5'}" dir="ltr">
                {meter_reading?.created_at ? new Date(meter_reading?.created_at).toLocaleString() : ''}
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-6">
              <table class="table table-bordered">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1"> {t('Meter Number')}</td>
                    <td class="fw-bold p-2 py-1">{meters.find((b) => b.id === meter_reading.meter_id)?.meter_number || ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Apartment')}</td>
                    <td class="fw-bold p-2 py-1">{apartment?.unit_number || ''} - {floor?.floor_number || 0} - {building?.code || ''}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Rate Per Unit')}</td>
                    <td class="fw-bold p-2 py-1">
                      {Number(meter_reading.rate_per_unit || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(meter_reading.currency)}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1"> {t('Calculated Amount')}</td>
                    <td class="fw-bold p-2 py-1">
                      {Number(meter_reading.calculated_amount || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(meter_reading.currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="col-6">
              <table class="table table-bordered">
                <tbody class="" style="font-size: 10pt;">
                  <tr>
                    <td class="p-2 py-1">{t('Reading Date')}</td>
                    <td class="fw-bold p-2 py-1">
                      <span class="float-end">{meter_reading?.reading_date}</span>
                      {@html meter_reading?.reading_date ? showDate(meter_reading.reading_date.slice(0, 10), 'justPersian') : ''}
                    </td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1">{t('Previous Reading')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(meter_reading.previous_reading || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1">{t('Current Reading')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(meter_reading.current_reading || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}</td>
                  </tr>
                  <tr>
                    <td class="p-2 py-1">{t('Consumption')}</td>
                    <td class="fw-bold p-2 py-1"
                      >{Number(meter_reading.consumption || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {#if meter_reading?.description}
            <div class="notes-section border p-3 mt-3">
              <strong>{t('Description')}</strong>
              <p class="mb-0">{@html nl2br(meter_reading.description)}</p>
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
