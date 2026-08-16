<script>
  import { onMount, createEventDispatcher,tick } from 'svelte';
  import { t, lang, translate_org_type, settings_all, shortID,refreshSettings } from '../../../i18n/i18n.js';
  import { showDate } from '../../../calendar.js';
  import { push } from 'svelte-spa-router';

  import QRCode from 'qrcode';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { toast } from '../../../ToastUI/toast.js';
  export let labtest = {};
  import LabTestCategoryModal from './LabTestCategoryModal.svelte';
import { currencyApi } from '../../../api/currencyApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';
import { labtestApi } from '../../../api/labtestApi.js';
import { labtestTypeApi } from '../../../api/labtestTypeApi.js';
import { labtestCategoryApi } from '../../../api/labtestCategoryApi.js';
  let settings = [];

  $: brand_primary_color = $settings_all.find((s) => s.key === 'brand_primary_color')?.value || '#3B71CA';

  $: brand_secondary_color = $settings_all.find((s) => s.key === 'brand_secondary_color')?.value || '#54B4D3';

  $: main_technician = $settings_all.find((s) => s.key === 'main_technician')?.value || null;

  $: labtest_index = $settings_all.find((s) => s.key === 'labtest_index')?.value || 0;
  $: labtest_index_prefix = $settings_all.find((s) => s.key === 'labtest_index_prefix')?.value || '--';

  const dispatch = createEventDispatcher();
  function close() {
    dispatch('close');
  }



  let dataUrl = '';
  async function loadQRCode(id) {
    if (!id) return;
    dataUrl = await QRCode.toDataURL('https://zenoerp.com/labtest/' + String(id), {
      width: 60,
      margin: 1,
    });
    console.log('Generated QR code', dataUrl);
  }

  export let appointment_id = null;

  let appointment = null;

  $: if (appointment_id) {
    loadAppointment(appointment_id);
  }

  let labtest_statuses = ['pending', 'collected', 'in_progress', 'completed', 'cancelled'];

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

  async function saveLabTest() {
    let newId = null;
    const payload = {
      labtest_category_id,
      patient_id: appointment?.patient_id || null,
      technician_id: technician?.id || null,
      labtest_type_id,
      appointment_id,
      name: name.trim(),
      description,
      parameters: JSON.stringify(parameters),
      price,
      currency,
      labtest_number,
      labtest_date,
      labtest_status,
      status: parseInt(status) || 1,
    };
    if (labtest) {
      await labtestApi.update(labtest.id, payload);
    } else {
      const created = await labtestApi.create(payload);
      newId = created?.data?.id;
      const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'labtest_index' }))?.data?.[0];
      if (_indexSetting) {
        await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
      }
      await refreshSettings();
    }
    toast.success(t('Success'), t('Lab Test Type Saved Successfully'));
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
  let technician = null;
  let units = [];

  let users = [];

  let labtest_categories = [];
  let labtest_type_id = null;
  let labtest_types = [];
  let currencies = [];
  let parameters = [];
  let name = '';

  let labtest_date = new Date().toISOString();
  let labtest_number = '';
  let labtest_status = labtest_statuses[0];
  let description = '';
  let price = 0;
  let currency = 'AFN';
  let labtest_category_id = '';

  $: if (labtest_index && labtest_index_prefix) {
    labtest_number = labtest_index_prefix + labtest_index;
  }

  let printable = false;

  async function loadItems() {
    labtest_types = ((await labtestTypeApi.getAll({ status: 1 }))?.data || [])
      .sort((a, b) => Number(b.id) - Number(a.id));
    labtest_categories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    currency = currencies.find((c) => c.isDefault == 1)?.code || 'AFN';
    users = await (await userApi.getAll({ status: 1 }))?.data || [];

    technician = users.find((u) => u.id == main_technician);
  }
  $: if (labtest) {
    labtest_status = labtest.labtest_status;
    labtest_number = labtest.labtest_number;
    labtest_date = labtest.labtest_date;
    labtest_type_id = labtest.labtest_type_id;
    if (users) {
      technician = users.find((u) => u.id == labtest.technician_id);
    }
    name = labtest.name;
    price = labtest.price;
    currency = labtest.currency || currency;
    description = labtest.description;
    labtest_category_id = labtest.labtest_category_id;
    parameters = JSON.parse(labtest.parameters);
    loadAppointment(labtest.appointment_id);

    loadQRCode(labtest.id);
  }

  function addParameter() {
    parameters.push({
      type: 'parameter',
      name: '',
      result: '',
      range_from: '',
      range_to: '',
      unit: '',
    });
    parameters = [...parameters];
  }
  function removeParameter(index) {
    parameters.splice(index, 1);
    parameters = [...parameters];
  }
  function makeCatParameter(index) {
    parameters[index].type = 'category';
    parameters = [...parameters];
  }
  function editParameter(index) {
    parameters[index].mode = 'edit';
    parameters = [...parameters];
  }

  function saveParameter(index) {
    parameters[index].mode = 'show';
    parameters = [...parameters];
  }

  function makeParParameter(index) {
    parameters[index].type = 'parameter';
    parameters = [...parameters];
  }

  onMount(async () => {
    await loadItems();

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


  let labtest_category_search = '';
  let showLabTestCategoryDropdown = false;
  let filteredCategories = [];
  let form_category_search_input = null;

  let labtest_type_search = '';
  let showLabTestTypeDropdown = false;
  let filteredTypes = [];
  let form_type_search_input = null;

  function filterTypes(term = '') {
  const t = term.toLowerCase();

  filteredTypes = labtest_types.filter((typ) => {
    const matchCategory = labtest_category_id
      ? typ.labtest_category_id == labtest_category_id
      : true; // allow all if no category selected

    const matchSearch =
      typ.name?.toLowerCase().includes(t) ||
      (typ.code ?? '').toLowerCase().includes(t);

    return matchCategory && matchSearch;
  });
}


let editName = false;


  function printLabTest() {
    const content = document.getElementById('labtest-content').innerHTML;
    const styles = `
      <style>
            @page {
      size: A4;
      margin: 10mm;
    }

    html, body {
      height: 100%;
    }

    #labtest-content {
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
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal d-block" tabindex="-1" style="z-index:1050;">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">


        <div class="row w-100">
        <div class="col-md-3">
          
            {#if labtest}{t('EditLabTest')} — {shortID(labtest?.id)}{:else}{t('NewLabTest')}{/if}

        </div>

        <div class="col-md-4">
        {#if labtest_category_id}
            <div class="input-group input-group-sm  w-100">


                <button class="btn btn-sm btn-primary px-2 pt-1"><i class="bi bi-tag"></i>
                </button>


                <span class="input-group-text badge-primary w-100 fw-bold d-flex justify-content-between">
                  {labtest_categories.find((c) => c.id == labtest_category_id)?.name}
                </span>
                <button
                  class="btn btn-danger btn-sm pt-1"
                  on:click={async () => {

                    labtest_category_id = '';
                    labtest_category_search = '';
                    showLabTestCategoryDropdown = true;
                    filteredCategories = labtest_categories;

                    await tick(); // wait for DOM to update
                    
                    form_category_search_input?.focus();

                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
            </div>
        {:else}
            <div class="">
              <div class="input-group input-group-sm mb-1">
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    id="labtest_category_search"
                    bind:this={form_category_search_input}
                    bind:value={labtest_category_search}
                    on:input={() => {
                      showLabTestCategoryDropdown = true;
                      filteredCategories = labtest_categories.filter((cat) => {
                        const name = cat.name;
                        const code = (cat.code ?? '').toString().toLowerCase();
                        const nameStr = (name ?? '').toLowerCase();
                        const term = labtest_category_search.trim().toLowerCase();
                        return nameStr.includes(term) || code.includes(term);
                      });
                    }}
                    on:focus={() => {
                      showLabTestCategoryDropdown = true;
                      if (labtest_category_search.trim()) {
                        filteredCategories = labtest_categories.filter((cat) => {
                          const name = cat.name;
                          const code = (cat.code ?? '').toString().toLowerCase();
                          const nameStr = (name ?? '').toLowerCase();
                          const term = labtest_category_search.trim().toLowerCase();
                          return nameStr.includes(term) || code.includes(term);
                        });
                      } else {
                        filteredCategories = labtest_categories;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showLabTestCategoryDropdown = false), 150)}
                    autocomplete="off" />
                  <label class="form-label" for="labtest_category_search">{t('Select Lab Test Category')}</label>
                </div>
                <button
                  class="btn btn-info btn-sm pt-1"
                  on:click={() => {
                    catModalRef.openLabTestCategoryModal();
                  }}>
                  <i class="bi bi-plus-circle"></i>
                </button>
                
              </div>
              <input type="hidden" bind:value={labtest_category_id} />
              {#if showLabTestCategoryDropdown && filteredCategories.length > 0}
                <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                  {#each filteredCategories as cat}
                    <li
                      class="list-group-item list-group-item-action bg-body"
                      style="cursor:pointer"
                      on:mousedown|preventDefault={async () => {
                        labtest_category_id = cat.id;
                        labtest_category_search = '';
                        showLabTestCategoryDropdown = false;

                      labtest_type_id = '';
                      labtest_type_search = '';
                      showLabTestTypeDropdown = true;
                      filterTypes('');

                      await tick(); // wait for DOM to update
                      
                      form_type_search_input?.focus();
                        setTimeout(() => {
                          if (window.mdb) {
                            document
                              .querySelectorAll('[data-mdb-input-init]')
                              .forEach((el) => new window.mdb.Input(el));

                            document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                              new window.mdb.Dropdown(el);
                            });
                          }
                        }, 100);
                      }}>
                      {cat.name}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
        {/if}

        </div>

        <div class="col-md-4">


        {#if labtest_type_id}
            <div class="input-group input-group-sm w-100">
                <button class="btn btn-sm btn-success px-2 pt-1"><i class="bi bi-list"></i>
                </button>


                <span class="input-group-text badge-success w-100 fw-bold d-flex justify-content-between">
                  {labtest_types.find((c) => c.id == labtest_type_id)?.name}
                </span>
                <button
                  class="btn btn-danger btn-sm pt-1"
                  on:click={async () => {

                    labtest_type_id = '';
                    labtest_type_search = '';
                    showLabTestTypeDropdown = true;
                    filterTypes(labtest_type_search);

                    await tick(); // wait for DOM to update
                    
                    form_type_search_input?.focus();
                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
            </div>
        {:else}
            <div class="">
              <div class="input-group input-group-sm mb-1">
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    id="labtest_type_search"
                    bind:this={form_type_search_input}
                    bind:value={labtest_type_search}
                    on:input={() => {
                      showLabTestTypeDropdown = true;
                      filterTypes(labtest_type_search);
                    }}
                    on:focus={() => {
                      showLabTestTypeDropdown = true;
                      filterTypes(labtest_type_search);
                    }}
                    on:blur={(e) => {
  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
    showLabTestTypeDropdown = false;
  }
}}
                    autocomplete="off" />
                  <label class="form-label" for="labtest_type_search">{t('Select Lab Test Type')}</label>
                </div>
              </div>
              <input type="hidden" bind:value={labtest_type_id} />
              {#if showLabTestTypeDropdown && filteredTypes.length > 0}
                <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                  {#each filteredTypes as type}
                    <li
                      class="list-group-item list-group-item-action bg-body"
                      style="cursor:pointer"
                      on:mousedown={() => {
                        labtest_type_id = type.id;
                        labtest_type_search = '';
                        showLabTestTypeDropdown = false;
                        labtest_type_id = type.id;
                        name = type.name;
                        price = type.price;
                        description = type.description;
                        labtest_category_id = type.labtest_category_id;
                        parameters = JSON.parse(type.parameters);

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
                      }}>
                      {type.name}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
        {/if}


        </div>

        <div class="col-md-1">


        <button type="button" class="btn-close" aria-label="Close" on:click={close}></button>

        </div>
        </div>

      </div>
      <div class="modal-body">
        <div id="labtest-content" class="labtest-container">
          <!-- Header -->
          <div class="labtest-header d-flex justify-content-between align-items-center">
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
                <strong style="color:{brand_primary_color} !important">{t('Technologist')}: </strong>
                <strong style="color:{brand_secondary_color} !important"
                  >{technician ? technician.first_name + ' ' + technician.last_name : ''}</strong>
              </div>
              <div class="">
                <strong style="color:{brand_primary_color} !important">{t('LabTest #')}: </strong>
                {labtest_number}
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
                {@html labtest_date ? new Date(labtest_date).toLocaleString() : ''}
              </div>
            </div>
          </div>
          <hr class="my-2" />
          {#if editName && !printable}
          <div class='input-group my-3 '>
          <div class="form-outline" data-mdb-input-init>
            <input type="text" id="c-name" class="form-control" bind:value={name} />
            <label class="form-label" for="c-name">{t('Name')}</label>
          </div>
          <button class="btn btn-success" on:click={() => (editName = false)}>
            <i class="bi bi-save"></i>
          </button>
          </div>
          {:else}
          <h4 class="my-3 text-center" style="color:{brand_primary_color} !important">{name}
            {#if !printable}
            <button class="btn btn-primary btn-sm ms-2 float-end" on:click={() => (editName = true)}>
              <i class="bi bi-pencil"></i>
            </button>
            {/if}
          </h4>
          {/if}
          <table class="table">
            <thead>
              <tr style="border-bottom:1px solid #000000;font-size:11pt;">
                <th style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold">{t('Investigation')}</th>
                <th style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center"
                  >{t('Result')}</th>
                <th style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center"
                  >{t('Reference Range')}</th>
                <th style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center">{t('Unit')}</th>
                {#if !printable}
                <th style="color:{brand_primary_color} !important" class="p-2 py-1 fw-bold text-center"
                  >{t('Actions')}
                  <button class="btn btn-primary btn-sm px-2" on:click={addParameter}>
                    <i class="bi bi-plus-circle"></i>
                  </button>
                </th>
                {/if}
              </tr>
            </thead>
            <tbody style="font-size: 9pt;">
              {#each parameters as it, index}
                <tr style={it.type == 'category' ? 'height:40px;vertical-align:bottom' : 'height:25px;'} class="">
                  <td
                    class="p-2 py-0"
                    colspan={it.type == 'category' ? '4' : '0'}
                    style={it.type == 'category' ? 'vertical-align:bottom' : 'vertical-align: middle;'}>
                    {#if it.mode && it.mode == 'edit' && !printable}
                      <input type="text" class="form-control form-control-sm" bind:value={it.name} />
                    {:else}
                      {@html it.type == 'category' ? `<strong>${it.name}</strong>` : it.name}
                    {/if}
                  </td>
                  {#if it.type != 'category'}
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      {#if !printable}
                      <input type="text" class="form-control form-control-sm" bind:value={it.result} />
                      {:else}
                      {it.result}
                      {/if}
                    </td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      {#if it.mode && it.mode == 'edit' && !printable}
                        <input type="text" class="form-control form-control-sm" bind:value={it.range_from} />
                      {:else}
                        {it.range_from}
                      {/if} -
                      {#if it.mode && it.mode == 'edit' && !printable}
                        <input type="text" class="form-control form-control-sm" bind:value={it.range_to} />
                      {:else}
                        {it.range_to}
                      {/if}
                    </td>
                    <td class="text-center p-2 py-0" style="vertical-align: middle;">
                      {#if it.mode && it.mode == 'edit' && !printable}
                        <input type="text" class="form-control form-control-sm" bind:value={it.unit} />
                      {:else}
                        {it.unit}
                      {/if}
                    </td>
                  {/if}
                  {#if !printable}
                  <td class="text-center p-2 py-0" style="vertical-align: middle;">
                    <div class="input-group input-group-sm">
                      {#if it.mode && it.mode == 'edit'}
                        <button
                          class="btn btn-success btn-sm px-2"
                          on:click={() => {
                            saveParameter(index);
                          }}><i class="bi bi-save"></i></button>
                      {:else}
                        <button
                          class="btn btn-primary btn-sm px-2"
                          on:click={() => {
                            editParameter(index);
                          }}><i class="bi bi-pencil"></i></button>
                      {/if}
                      <button
                        class="btn btn-danger btn-sm px-2"
                        on:click={() => {
                          removeParameter(index);
                        }}><i class="bi bi-trash"></i></button>
                      {#if it.type != 'category'}
                        <button
                          class="btn btn-info btn-sm px-2"
                          on:click={() => {
                            makeCatParameter(index);
                          }}><i class="bi bi-list"></i></button>
                      {:else}
                        <button
                          class="btn btn-success btn-sm px-2"
                          on:click={() => {
                            makeParParameter(index);
                          }}><i class="bi bi-list"></i></button>
                      {/if}
                    </div>
                  </td>
                    {/if}
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
              <p class="form-control-plaintext">{description}</p>
            {/if}
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
        <div class="input-group">
          <div class="form-outline flex-grow-1" data-mdb-input-init>
            <input type="number" id="price" class="form-control" bind:value={price} />
            <label class="form-label" for="price">{t('Price')}</label>
          </div>
          <button
            id="showCurrencyDropdown"
            class="btn btn-secondary dropdown-toggle pt-1"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false">
            {currency ? t(currency) : t(currency)}
          </button>

          <ul class="dropdown-menu dropdown-menu-end">
            {#each currencies as cur}
              <li>
                <button
                  class="dropdown-item"
                  style={currency == cur.code
                    ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                    : ''}
                  on:click={() => (currency = cur.code)}
                  type="button">
                  {t(cur.code)}
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <select class="form-select" bind:value={labtest_status}>
          {#each labtest_statuses as st}
            <option value={st} selected={labtest_status == st}>{t(st)}</option>
          {/each}
        </select>
        <button class="btn btn-primary px-3" on:click={()=>{printable = !printable}}>{@html !printable?"<i class='bi bi-eye'></i>":"<i class='bi bi-pencil'></i>"}</button>

        <button class="btn btn-success px-3" on:click={async()=>{
          printable = true;
          await tick();
          printLabTest();
        }}>
        <i class="bi bi-printer"></i>
        </button>
        <button class="btn btn-primary" on:click={saveLabTest}>{t('Save')}</button>
      </div>
    </div>
  </div>
</div>

<LabTestCategoryModal
  bind:this={catModalRef}
  on:saved={async (e) => {
    labtest_categories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
    labtest_category_id = e.detail.id;
  }} />
