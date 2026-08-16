<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
import { productCategoryApi } from '../../../api/productCategoryApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { productUnitApi } from '../../../api/productUnitApi.js';
  import { t, lang, translate_org_type, settings_all, shortID, refreshSettings } from '../../../i18n/i18n.js';
  import { showDate } from '../../../calendar.js';
  import { push } from 'svelte-spa-router';

  import ProductModal from '../../products/ProductModal.svelte';

  import QRCode from 'qrcode';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { toast } from '../../../ToastUI/toast.js';
  export let prescription = {};
  let settings = [];
  import { time_units } from '../../../time.js';
import { currencyApi } from '../../../api/currencyApi.js';
import { warehouseApi } from '../../../api/warehouseApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { productApi } from '../../../api/productApi.js';
import { warehouseProductApi } from '../../../api/warehouseProductApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';
import { prescriptionApi } from '../../../api/prescriptionApi.js';

  $: brand_primary_color = $settings_all.find((s) => s.key === 'brand_primary_color')?.value || '#3B71CA';

  $: brand_secondary_color = $settings_all.find((s) => s.key === 'brand_secondary_color')?.value || '#54B4D3';

  $: prescription_index = $settings_all.find((s) => s.key === 'prescription_index')?.value || 0;
  $: prescription_index_prefix = $settings_all.find((s) => s.key === 'prescription_index_prefix')?.value || '--';

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('closed');
  }

  let dataUrl = '';
  async function loadQRCode(id) {
    if (!id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/prescription/' + String(id), {
      width: 60,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  let productModal = null;

  let categories = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let warehouse_id = null;

  export let appointment_id = null;

  let appointment = null;

  $: if (appointment_id) {
    loadAppointment(appointment_id);
  }

  let prescription_statuses = ['pending', 'requested', 'in_progress', 'completed', 'cancelled'];

  async function loadAppointment(appoint_id) {
    if (!appoint_id) return;

    appointment = (await appointmentApi.getById(Number(appoint_id)))?.data || null;

    if (appointment?.status !== 1) appointment = null;

    console.log('Loaded Appointment', appointment);
  }
  let lastAppointmentId = null;

  $: if (appointment?.id && appointment.id !== lastAppointmentId) {
    lastAppointmentId = appointment.id;
    loadPatient();
    loadDoctor();
  }

  async function savePrescription() {
    let newId = null;
    const payload = {
      patient_id: appointment?.patient_id || null,
      doctor_id: doctor?.id || null,
      appointment_id,
      description,
      prescription_number,
      prescription_date,
      prescription_status,
      vitals,
      diagnosis,
      notes,
      status: parseInt(status) || 1,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_unit_id: item.product_unit_id,
        quantity: item.quantity,
        dosage: item.dosage || '',
        dosage_unit: item.dosage_unit || '',
        frequency: item.frequency || '',
        duration: item.duration || '',
        duration_unit: item.duration_unit || '',
        route: item.route || '',
        instructions: item.instructions || '',
        status: 1,
      })),
    };
    if (prescription?.id) {
      await prescriptionApi.update(prescription.id, payload);
    } else {
      const created = await prescriptionApi.create(payload);
      newId = created?.data?.id;
      const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'prescription_index' }))?.data?.[0];
      if (_indexSetting) {
        await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
      }
      await refreshSettings();
    }
    toast.success(t('Success'), t('Prescription Saved Successfully'));
    dispatch('saved');
  }

  let catModalRef = null;

  async function loadPatient() {
    if (!appointment?.patient_id) return;

    patient = await (await accountApi.getById(appointment.patient_id))?.data;

    if (patient?.status !== 1) patient = null;

    console.log('Loaded patient', patient);
  }

  async function loadDoctor() {
    if (!appointment?.doctor_id) return;

    doctor = await (await userApi.getById(appointment.doctor_id))?.data;

    if (doctor?.status !== 1) doctor = null;

    console.log('Loaded doctor', doctor);
  }

  let patient = null;
  let doctor = null;
  let units = [];

  let users = [];
  let items = [];

  let prescription_date = new Date().toISOString();
  let prescription_number = '';
  let prescription_status = prescription_statuses[0];

  let vitals = '';
  let diagnosis = '';
  let notes = '';

  let description = '';

  $: if (prescription_index && prescription_index_prefix) {
    prescription_number = prescription_index_prefix + prescription_index;
  }

  let printable = false;

  async function loadItems() {
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    users = await (await userApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadPrescriptionItems() {
    if (!prescription?.id) return;
    const detail = (await prescriptionApi.getById(Number(prescription.id)))?.data;
    const prescriptionItems = (detail?.items || []).filter((item) => Number(item.status) === 1);

    items = prescriptionItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);

      const unitHierarchy = getUnitHierarchy(product.product_unit_id);
      product.availableUnits = unitHierarchy;
      return {
        product_id: i.product_id,
        product_name: product?.name || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
        quantity: i.quantity,
        availableUnits: product.availableUnits,
        dosage: i.dosage || '',
        dosage_unit: i.dosage_unit || '',
        frequency: i.frequency || '',
        duration: i.duration || '',
        duration_unit: i.duration_unit || '',
        route: i.route || '',
        instructions: i.instructions || '',
      };
    });
  }

  $: if (prescription) {
    prescription_status = prescription.prescription_status;
    prescription_number = prescription.prescription_number;
    prescription_date = prescription.prescription_date;

    vitals = prescription.vitals || '';
    diagnosis = prescription.diagnosis || '';
    notes = prescription.notes || '';

    description = prescription.description;
    items = JSON.parse(prescription.items);
    loadAppointment(prescription.appointment_id);

    loadPrescriptionItems();

    loadQRCode(prescription.id);
  }

  onMount(async () => {
    await loadItems();

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];

    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];

    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  });

  function getAccountName(acc) {
    let out = '';
    if (acc) {
      if (t('Lang') === 'en') out = acc.name || '';
      if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
      if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    }
    out = out || 'Unknown';
    return out;
  }

  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));
  function printPrescription() {
    const content = document.getElementById('prescription-content').innerHTML;
    const styles = `
      <style>
            @page {
      size: A4;
      margin: 10mm;
    }

    html, body {
      height: 100%;
    }

    #prescription-content {
      position: relative;
      min-height: 100vh;
      padding-bottom: 80px; /* space for footer */
      box-sizing: border-box;
    }

    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
    }
      </style>
    `;
    const w = window.open('', '_blank');
    w.document.write(/*html*/ `
       
       <!doctype html><html ${t('dir=ltr')}><head><meta charset="utf-8">
        
        
        
        ${styles}

        <link rel='stylesheet' href='/fonts/vazirmatn.css'>
        <link rel='stylesheet' href='/css/mdb${t('dir') == 'rtl' ? '.rtl' : ''}.min.css'>
        
        </head>
        <body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  }

  let products = [];

  function nl2br(str) {
    if (str) return str.replace(/\n/g, '<br />');
    return '';
  }

  function getUnitHierarchy(unitId) {
    const result = [];

    function traverse(id, multiplier = 1) {
      const unit = unitMap[id];
      if (!unit) return;

      result.push({
        ...unit,
        multiplier,
      });

      if (unit.subunit_id) {
        traverse(unit.subunit_id, multiplier / (unit.subunit_multiple || 1));
      }
    }

    traverse(unitId);
    return result;
  }
  function changeUnit(item, unitId) {
    unitId = Number(unitId);

    const selectedUnit = item.availableUnits?.find((u) => u.id === unitId);
    if (!selectedUnit) return;

    item.product_unit_id = unitId;

    items = [...items];
    dispatch('update', { items });
  }
  let search = '';
  let showDropdown = false;

  $: filteredProducts =
    search.length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              p.code?.includes(search.trim().toLowerCase()),
          )
          .slice(0, 10)
      : [];

  function addItem(selectedProduct) {
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    const unitHierarchy = getUnitHierarchy(selectedProduct.product_unit_id);
    selectedProduct.availableUnits = unitHierarchy;

    if (existingIndex !== -1) {
      items[existingIndex].quantity += 1;
    } else {
      items.push({
        type: selectedProduct.type || 'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(1),
        availableUnits: selectedProduct.availableUnits,
        dosage: '',
        dosage_unit: '',
        frequency: '',
        duration: '',
        duration_unit: '',
        route: '',
        instructions: '',
      });
    }

    // Important: reassign so Svelte updates the table
    items = [...items];

    dispatch('update', { items });

    // Reset
    search = '';
    selectedProduct = null;
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }

  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
    dispatch('update', { items });
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <div class="row w-100">
          <div class="col-md-3">
            {#if prescription}{t('EditPrescription')} — {shortID(prescription?.id)}{:else}{t('NewPrescription')}{/if}
          </div>

          <div class="col-md-4"></div>

          <div class="col-md-4"></div>

          <div class="col-md-1">
            <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>
          </div>
        </div>
      </div>
      <div class="modal-body">
        <div id="prescription-content" class="prescription-container">
          <!-- Header -->
          <div class="prescription-header d-flex justify-content-between align-items-center">
            <div class="d-flex justify-content-between align-items-center">
              {#if settings.find((s) => s.key === 'company_logo')?.value}
                <img
                  src={settings.find((s) => s.key === 'company_logo')?.value}
                  style="max-height: 60px"
                  class="company-logo mb-2 me-2" />
              {/if}

              <div>
                <div class="fw-bold fs-4" style="color:{brand_primary_color} !important;height:33px">
                  {settings.find((s) => s.key === 'company_name')?.value || 'Company Name'}
                </div>
                <div class="fw-bold small" style="color:{brand_secondary_color} !important">
                  {settings.find((s) => s.key === 'company_address')?.value || ''}
                </div>
              </div>
            </div>

            <div>
              <div class="fw-bold text-end" style="color:{brand_primary_color} !important;height:23px">
                {settings.find((s) => s.key === 'company_phone')?.value || ''}
                {settings.find((s) => s.key === 'company_phone2')?.value
                  ? ' - ' + settings.find((s) => s.key === 'company_phone2')?.value
                  : ''}
              </div>

              <div class="fw-bold text-end">{settings.find((s) => s.key === 'company_email')?.value || ''}</div>
            </div>
          </div>

          <hr class="my-2" />

          <div class="d-flex justify-content-between align-items-center">
            <div class="">
              <div class="fs-5">
                <strong style="color:{brand_primary_color} !important">{t('Doctor')}: </strong>
                <strong style="color:{brand_secondary_color} !important"
                  >{doctor ? doctor.first_name + ' ' + doctor.last_name : ''}</strong>
              </div>
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('Prescription #')}: </strong>
                {prescription_number}
              </div>
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('Patient')}: </strong>
                {getAccountName(patient) || 'Walk-in'}
              </div>
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('Code')}{t('-of-')}{t('Patient')}: </strong>
                {patient?.code || '-'}
              </div>
            </div>

            <div class="">
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('Appointment')}: </strong>
                {shortID(appointment?.id)}
              </div>
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('Date')}: </strong>
                {@html prescription_date ? new Date(prescription_date).toLocaleString() : ''}
              </div>
            </div>
          </div>

          <hr class="my-2" />

          <div class="row">
            <div class="col-sm-3">
              <div class="border p-3 h-100" style="border-color:#888 !important;min-height:760px">
                {#if !printable}
                  <div class="form-outline" data-mdb-input-init>
                    <textarea id="c-vitals" class="form-control" bind:value={vitals}></textarea>
                    <label class="form-label" for="c-vitals">{t('Vitals')}</label>
                  </div>

                  <div class="form-outline mt-3" data-mdb-input-init>
                    <textarea id="c-diagnosis" class="form-control" bind:value={diagnosis}></textarea>
                    <label class="form-label" for="c-diagnosis">{t('Diagnosis')}</label>
                  </div>

                  <div class="form-outline mt-3" data-mdb-input-init>
                    <textarea id="c-notes" class="form-control" bind:value={notes}></textarea>
                    <label class="form-label" for="c-notes">{t('Notes')}</label>
                  </div>
                {:else}
                  <strong style="color:{brand_primary_color} !important">{t('Vitals')}:</strong><br />
                  {@html nl2br(vitals) || t('No Vitals.')}<br /><br />

                  <strong style="color:{brand_primary_color} !important">{t('Diagnosis')}:</strong><br />
                  {@html nl2br(diagnosis) || ''}<br /><br />
                  <strong style="color:{brand_primary_color} !important">{t('Notes')}:</strong><br />
                  {@html nl2br(notes) || ''}
                {/if}
              </div>
            </div>
            <div class="col-sm-9">
              <div>
                {#if !printable}
                  <div class="input-group input-group-sm float-end mb-3" style="width:350px;">
                    <input
                      type="text"
                      class="form-control form-control-sm"
                      bind:value={search}
                      on:focus={() => (showDropdown = true)}
                      placeholder={t('Search Product...')} />
                    {#if showDropdown && filteredProducts.length > 0}
                      <div
                        class="list-group position-absolute w-100 shadow bg-body-tertiary"
                        style="top:100%; left:0; z-index:1055; max-height:250px; overflow:auto;">
                        {#each filteredProducts as p}
                          <button
                            type="button"
                            class="list-group-item list-group-item-action"
                            on:click={() => addItem(p)}>
                            <div class="d-flex justify-content-between">
                              <span>{p.name}</span>
                              <small>{p.code}</small>
                            </div>
                          </button>
                        {/each}
                      </div>
                    {/if}

                    <button
                      class="btn btn-info btn-sm pt-1 px-2"
                      type="button"
                      on:click={() => productModal.openModal()}>
                      <i class="bi bi-plus-circle"></i>
                    </button>
                  </div>
                {/if}
                <span class="fs-1" style="color:{brand_secondary_color} !important"> &#8478;</span>
              </div>
              <table class="table table-hover table-sm align-middle">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>{t('Medication')}</th>
                    <th class="text-center">{t('Quantity')}</th>
                    <th class="text-center">{t('Dosage')}</th>
                    <th class="text-center">{t('Frequency')}</th>
                    {#if !printable}
                      <th class="text-center">{t('Actions')}</th>
                    {/if}
                  </tr>
                </thead>
                <tbody>
                  {#each items as item, index}
                    <tr>
                      <td>{index + 1}</td>
                      <td
                        >{item.product_name}

                        {#if !printable}
                          <div class="form-outline mt-2" data-mdb-input-init>
                            <input
                              type="text"
                              id="c-instructions{index}"
                              class="form-control form-control-sm"
                              bind:value={item.instructions} />
                            <label class="form-label" for="c-instructions{index}">{t('Instructions')}</label>
                          </div>
                        {:else if item.instructions}
                          <div>
                            Instruction: {item.instructions}
                          </div>
                        {/if}
                      </td>
                      <td class="text-center">
                        {#if !printable}
                          <div class="input-group input-group-sm">
                            <input type="number" class="form-control form-control-sm" bind:value={item.quantity} />
                            {#if item.availableUnits?.length > 1}
                              <select
                                class="form-select form-select-sm"
                                bind:value={item.product_unit_id}
                                on:change={(e) => changeUnit(item, e.target.value)}>
                                {#each item.availableUnits as u}
                                  <option value={u.id}>{u.name}</option>
                                {/each}
                              </select>
                            {:else}
                              <span class="badge bg-body-tertiary text-dark border">
                                {item.availableUnits?.[0]?.name}
                              </span>
                            {/if}
                          </div>
                        {:else}
                          <div>
                            {item.quantity}
                            {unitMap[item.product_unit_id]?.name || ''}
                          </div>
                        {/if}

                        {#if !printable}
                          <div class="form-outline mt-2" data-mdb-input-init>
                            <input
                              type="text"
                              id="c-duration{index}"
                              class="form-control form-control-sm"
                              bind:value={item.duration} />
                            <label class="form-label" for="c-duration{index}">{t('Duration')}</label>
                          </div>
                        {:else if item.duration}
                          <div>
                            Duration: {item.duration}
                            {item.duration_unit}
                          </div>
                        {/if}
                      </td>
                      <td  class="text-center">
                        {#if !printable}
                          <input type="text" class="form-control form-control-sm" bind:value={item.dosage} />
                        {:else}
                          <div>
                            {item.dosage}
                            {item.dosage_unit}
                          </div>
                        {/if}
                      </td>

                      <td class="text-center">
                        {#if !printable}
                          <input type="text" class="form-control form-control-sm" bind:value={item.frequency} />
                        {:else}
                          <div>
                            {item.frequency}
                          </div>
                        {/if}
                      </td>

                      {#if !printable}
                        <td class="text-center"
                          ><button class="btn btn-sm btn-outline-danger" on:click={() => removeItem(index)}>✕</button
                          ></td
                        >{/if}
                    </tr>
                  {/each}
                </tbody>
              </table>
              <div class="p-0 mt-3" style="">
                {#if !printable}
                  <div class="form-outline" data-mdb-input-init>
                    <textarea id="c-description" class="form-control" bind:value={description}></textarea>
                    <label class="form-label" for="c-description">{t('Description')}</label>
                  </div>
                {:else}
                  <p class="form-control-plaintext">{@html nl2br(description)}</p>
                {/if}
              </div>
            </div>
          </div>

          <div class="footer small text-primary" style="bottom:0">
            <hr class=" mt-5" />
            <img src={dataUrl} class="qrcode-img float-end" />
            <div class="float-start" style="font-size:8pt">
              <img src="/img/logo.png" height="20" /><br />
              {t('Powered by ZenoERP • Thank you!')}<br />

              <strong>{t('www.zenoerp.com')}</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer d-flex align-items-center gap-2 flex-nowrap">
        <select class="form-select" bind:value={prescription_status}>
          {#each prescription_statuses as st}
            <option value={st} selected={prescription_status == st}>{t(st)}</option>
          {/each}
        </select>
        <button
          class="btn btn-primary px-3"
          on:click={() => {
            printable = !printable;
            setTimeout(() => {
              if (window.mdb) {
                document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
                  new window.mdb.Input(el);
                });
                document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                  new window.mdb.Dropdown(el);
                });
              }
            }, 50);
          }}>{@html !printable ? "<i class='bi bi-eye'></i>" : "<i class='bi bi-pencil'></i>"}</button>

        <button
          class="btn btn-success px-3"
          on:click={async () => {
            printable = true;
            await tick();
            printPrescription();
          }}>
          <i class="bi bi-printer"></i>
        </button>
        <button class="btn btn-primary" on:click={savePrescription}>{t('Save')}</button>
      </div>
    </div>
  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="prescription"
  {warehouse_id}
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        type: newProduct.type || 'good',
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        quantity: 1,
        dosage: '',
        dosage_unit: '',
        frequency: '',
        duration: '',
        duration_unit: 'day',
        route: '',
        instructions: '',
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />
