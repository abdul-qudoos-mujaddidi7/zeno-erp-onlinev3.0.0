<script>
  import { onMount, createEventDispatcher } from 'svelte';
import { productUnitApi } from '../../../api/productUnitApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
  import { productGenericApi } from '../../../api/productGenericApi.js';
  import { t, lang, translate_org_type, settings_all } from '../../../i18n/i18n.js';
  import { showDate } from '../../../calendar.js';
  import { push } from 'svelte-spa-router';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import QRCode from "qrcode";
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { productApi } from '../../../api/productApi.js';
import { journalApi } from '../../../api/journalApi.js';
import { productBrandApi } from '../../../api/productBrandApi.js';
import { prescriptionApi } from '../../../api/prescriptionApi.js';

  export let prescription = {};
  let items = [];
  let payments = [];
  let patient = {};
  let settings = [];
  let doctor = null;
  let units = [];
  let currencies = [];

  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_batch = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;




  $: brand_primary_color = $settings_all.find((s) => s.key === 'brand_primary_color')?.value||"#3B71CA";

  $: brand_secondary_color = $settings_all.find((s) => s.key === 'brand_secondary_color')?.value||"#54B4D3";

  $: enable_full_table = $settings_all.find((s) => s.key === 'enable_full_table')?.value == 1;
  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }

  let generics = [];
  let brands = [];

  let dataUrl = '';
  async function loadQRCode() {
    if (!prescription?.id) return;
    dataUrl = await QRCode.toDataURL("https://zenoerp.com/prescription/" + String(prescription.id), { width: 60, margin: 1 });
    console.log('Generated QR code', dataUrl);
  }

  let allJournals = [];
  async function loadItems() {
    const detail = (await prescriptionApi.getById(prescription.id))?.data || prescription;
    const prescriptionItems = (detail.items || []).filter((s) => Number(s.status) === 1);

    const genericResponse = await productGenericApi.getAll({ status: 1 });
    generics = genericResponse?.data || [];
    brands = (await productBrandApi.getAll({ status: 1 }))?.data || [];

    const productIds = prescriptionItems.map((i) => i.product_id);
    const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

    items = prescriptionItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        generic_name: generics.find((g) => g.id === product?.generic_id)?.name || '',
        brand_name: brands.find((b) => b.id === product?.brand_id)?.name || '',
        batch: i.batch || product?.batch || null,
        manufacturing_date: i.manufacturing_date || product?.manufacturing_date || null,
        expiry_date: i.expiry_date || product?.expiry_date || null,
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];

    allJournals = (await journalApi.getAll({ status: 1 }))?.data || [];
  }


  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  async function loadPatient() {
    patient = await (async () => { const _a = (await accountApi.getById(prescription.patient_id))?.data; return _a && _a.status === 1 ? _a : null; })();
    console.log('Loaded patient', patient);
  }


  async function loadDoctor() {
    doctor = await (async () => { const _u = (await userApi.getById(prescription.doctor_id))?.data; return _u && _u.status === 1 ? _u : null; })();
    console.log('Loaded doctor', doctor);
  }

  async function loadUnits() {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    await loadUnits();
    await loadDoctor();
    await loadPatient();
    await loadCurrencies();
    await loadItems();
    await loadQRCode();

    showAccountBalance = calculateAccountBalance(prescription.account_id, prescription.currency);

    items = items.map((it) => ({
      ...it,
      unit_name: units.find((u) => u.id == it.product_unit_id)?.name || '',
      currency_symbol: currencies.find((c) => c.code == prescription?.currency)?.symbol || '',
    }));
  });

  function printInvoice() {
    const content = document.getElementById('prescription-content').innerHTML;
    const styles = `
      <style>
        @page { size: A4; margin: 10mm; }
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

  $: total = Number(prescription?.total_amount || items.reduce((s, i) => s + Number(i.subtotal || 0), 0));
  $: paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  $: due = total - paid;

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
              `<span class='${amt < 0 ? 'text-danger' : ''}'><span dir='ltr'>${amt.toLocaleString(undefined, { maximumfractiondigits: 3 })}</span> ${t(cur)}</span>`,
          )
          .join(' ')
      : '';
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{t('Prescription')} — {prescription?.prescription_number}</h5>
        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
      </div>
      <div class="modal-body">
        <div id="prescription-content" class="prescription-container">
          <!-- Header -->
          <div class="prescription-header d-flex justify-content-between align-items-center">
            <div class=" d-flex justify-content-between align-items-center">
              {#if settings.find((s) => s.key === 'company_logo')?.value}
                <img
                  src={settings.find((s) => s.key === 'company_logo')?.value}
                  style="max-height: 120px"
                  class="company-logo mb-2 me-2" />
              {/if}

              <div>
                <div class="fw-bold fs-3" style="color:{brand_primary_color} !important">
                  {settings.find((s) => s.key === 'company_name')?.value || 'Company Name'}
                </div>
                <div class="fw-bold"  style="color:{brand_secondary_color} !important">{settings.find((s) => s.key === 'company_address')?.value || ''}</div>
                <div class="fw-bold">
                  {settings.find((s) => s.key === 'company_phone')?.value || ''}
                  {settings.find((s) => s.key === 'company_phone2')?.value
                    ? ' - ' + settings.find((s) => s.key === 'company_phone2')?.value
                    : ''}
                </div>

                <div class="fw-bold">{settings.find((s) => s.key === 'company_email')?.value || ''}</div>
              </div>
            </div>
            <div class="">
              <div class="fs-5"><strong  style="color:{brand_primary_color} !important">{t('Doctor')}: </strong> <strong  style="color:{brand_secondary_color} !important">{doctor ? doctor.first_name +" "+ doctor.last_name : ""}</strong></div>
              <div class=""><strong  style="color:{brand_primary_color} !important">{t('Prescription #')}: </strong> {prescription?.prescription_number}</div>
              <div class=""><strong  style="color:{brand_primary_color} !important">{t('Patient')}: </strong> {getAccountName(patient) || 'Walk-in'}</div>
              <div class=""><strong  style="color:{brand_primary_color} !important">{t('Code')}{t('-of-')}{t('Patient')}: </strong> {patient?.code || '-'}</div>
              <div class="">
                <strong  style="color:{brand_primary_color} !important">{t('Date')}: </strong>
                {@html prescription?.prescription_date ? showDate(prescription.prescription_date.slice(0, 10),'forPDF')[0] + " "+ showDate(prescription.prescription_date.slice(0, 10),'forPDF')[1] + " " + showDate(prescription.prescription_date.slice(0, 10),'forPDF')[2]  : ''}
              </div>
            </div>
          </div>

          <hr />

          <!-- Patient & Invoice Info -->

          <!-- Product Table -->

          <div class="row">
            <div class="col-sm-3">

          <div class="border p-3 h-100" style="border-color:#888 !important;min-height:760px">
              <strong style="color:{brand_primary_color} !important">{t('Vitals')}:</strong><br />
              {prescription?.vitals || t('No Vitals.')}<br /><br />
              <strong style="color:{brand_primary_color} !important">{t('Diagnosis')}:</strong><br />
              {prescription?.diagnosis || t('No diagnosis.')}<br /><br />
              <strong style="color:{brand_primary_color} !important">{t('Notes')}:</strong><br />
              {prescription?.notes || t('No notes.')}

              </div>
            </div>
            <div class="col-sm-9">

              <h1 style="color:{brand_secondary_color} !important">&#8478;</h1>
<table class="table table-striped">
            <thead>
              <tr style="border-bottom:1px solid #000000;font-size:11pt;">
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold">#</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold">{t('Medication')}</th>

                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Dosage')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Frequency')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Duration')}</th>
                <th  style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Instructions')}</th>
                <th  style="color:{brand_primary_color} !important" class="text-center p-2 py-1 fw-bold">{t('Qty')}</th>
              </tr>
            </thead>
            <tbody style="font-size: 9pt;">
              {#each items as it, index}
                {#if index < bill_max_items}
                  <tr style="height:30px">
                    <td class="p-2 py-0" style="vertical-align: middle;">{index + 1}</td>
                    <td class="p-2 py-0" style="vertical-align: middle;">{it.product_name}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.dosage} {it.dosage_unit}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.frequency}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.duration} {t(it.duration_unit)}</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">{it.instructions}</td>


                    <td class="text-center p-2 py-0" style="vertical-align: middle;"
                      >{Number(it.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {it.unit_name}</td>
                  </tr>
                {/if}
              {/each}
              {#if enable_full_table && items.length < bill_max_items}
                {#each Array(bill_max_items - items.length) as _, i}
                  <tr style="border:1px solid #000000;height:30px">
                    <td class="p-2 py-0" style="vertical-align: middle;">{i + items.length + 1}</td>
                    <td class="p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">&nbsp;</td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
          {#if prescription?.description}
          <div class="p-0 mt-3" style="">
            <div class="section-title">{prescription?.description?t('Description'):t('Description')}:</div>
            <p>{prescription?.description || ''}</p>
          </div>
          {/if}
         
            </div>

          </div>
          
          <!-- Totals -->
          <!-- Notes -->
         
          <!-- Footer -->
           <hr class=" mt-5" />
          
          <div class="footer small text-primary" style="bottom:0">
          <img src="{dataUrl}" class="qrcode-img float-end"/>
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
