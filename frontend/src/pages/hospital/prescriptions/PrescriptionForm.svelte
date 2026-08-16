<script>
  import { onMount, tick } from 'svelte';
  import PrescriptionItemsTable from './PrescriptionItemsTable.svelte';
  import AccountModal from '../../accounts/AccountModal.svelte';

  import { toast } from '../../../ToastUI/toast.js';
  import { push } from 'svelte-spa-router';
  import AccountView from '../../accounts/AccountView.svelte';

  import { calculateProductStock } from '../../stocktransactions/calculateStock.js';
  import { t, lang, translate_org_type,shortID } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { showDate, setDatePickers } from '../../../calendar.js';
import { currencyApi } from '../../../api/currencyApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { productApi } from '../../../api/productApi.js';
import { journalApi } from '../../../api/journalApi.js';
import { accountTypeApi } from '../../../api/accountTypeApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';
import { prescriptionApi } from '../../../api/prescriptionApi.js';
  let accountModalRef;

  let date = new Date().toISOString().slice(0, 10);
  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
  }

  export let prescriptionId = null;

  export let prescriptionAppointmentId = null;

  $: prescriptionId = prescriptionId == 0 ? null : prescriptionId;

  let showAccountModal = false;

  let doctors = [];
  let customers = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];
  let prescription_index = 0;
  let prescription_index_prefix = 'PRE-';

  let journals = [];

  let items = [];

  let form = {
    doctor_id: '',
    patient_id: '',
    appointment_id: prescriptionAppointmentId?Number(prescriptionAppointmentId):'',
    prescription_number: '',
    diagnosis: '',
    notes: '',
    vitals: '',
    prescription_date: new Date().toISOString().slice(0, 10),
    description: '',
    prescription_status: 'draft',
    status: 1,
  };

  let appointment = [];

  async function loadAppointment() {
    if (prescriptionAppointmentId) {
      appointment = (await appointmentApi.getById(Number(prescriptionAppointmentId)))?.data || null;
      if (appointment && Number(appointment.status) !== 1) appointment = null;
      if (appointment) {
        form.patient_id = appointment.patient_id;
        form.doctor_id = appointment.doctor_id;
      }
    }
  }

  $: if (prescriptionAppointmentId) {
    form.appointment_id = Number(prescriptionAppointmentId);
    loadAppointment();
  }

  $: form.prescription_date = date;

  let loading = false;

  // payment inputs for new prescription
  let paymentDescription = '';

  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }

  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
  let WALKIN = null;

  let allJournals = [];
  onMount(async () => {
    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];

    allJournals = (await journalApi.getAll({ status: 1 }))?.data || [];
    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
        treasury_ID = acc.id;
      }

      if (acc.code === 'NOTRACK') {
        notrack_ID = acc.id;
      }
    });
    accounts = accounts.filter((a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'].includes(a.code));

    allAccountTypes = (await accountTypeApi.getAll({ status: 1 }))?.data || [];
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
    customers = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];

    WALKIN = customers.find((c) => c.code === 'WALKIN');

    form.patient_id = WALKIN ? WALKIN.id : '';

    form.doctor_id = doctors.length > 0 ? doctors[0].id : '';

    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    prescription_index = Number(
      (
        (await settingsApi.getAll({ status: 1, key: 'prescription_index' }))?.data?.[0]
      )?.value,
    );
    prescription_index_prefix =
      (
        (await settingsApi.getAll({ status: 1, key: 'prescription_index_prefix' }))?.data?.[0]
      )?.value || 'PRE-';

    form.prescription_number = prescription_index_prefix + prescription_index || '';

    accountTypes = ((await accountTypeApi.getAll({ status: 1 }))?.data || []).filter((s) => s.id == 4);


    if (prescriptionId) await loadPrescription(prescriptionId);
    setDatePickers(handleDateChange, componentRoot); //

    loadAppointment();
  });

  let componentRoot;
  async function loadPrescription(id) {
    try {
      const prescription = (await prescriptionApi.getById(Number(id)))?.data || null;
      if (!prescription || prescription.prescription_status !== 'draft' || Number(prescription.status) !== 1) {
        push('/dashboard/prescriptions');
        return;
      }

      date = prescription.prescription_date.slice(0, 10);
      form = {
        doctor_id: prescription.doctor_id,
        patient_id: prescription.patient_id,
        appointment_id: prescription.appointment_id,
        prescription_number: prescription.prescription_number,
        prescription_date: prescription.prescription_date,
        description: prescription.description,
        diagnosis: prescription.diagnosis,
        notes: prescription.notes,

        vitals: prescription.vitals,
        prescription_status: prescription.prescription_status,
        status: prescription.status,
      };

      const prescriptionItems = (prescription.items || []).filter((item) => Number(item.status) === 1);
      const productIds = prescriptionItems.map((i) => i.product_id);
      const products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

      items = prescriptionItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          unit_price_currency: i.currency,
          subtotal: i.subtotal,
        };
      });
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to load prescription. Please try again.'));
    }
  }


  async function savePrescription(confirm = false) {
    if (!form.doctor_id || !form.patient_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Doctor, Customer and at least one Item are required.'));
      return;
    }


    loading = true;
    let savedId = null;
    try {
      const payload = {
        doctor_id: form.doctor_id,
        patient_id: form.patient_id,
        appointment_id: form.appointment_id,
        prescription_number: form.prescription_number,
        prescription_date: form.prescription_date,
        description: form.description,
        discount_amount: form.discount_amount || 0,
        discount_type: form.discount_type || 'fixed',
        prescription_status: confirm ? 'confirmed' : 'draft',
        status: form.status,
        diagnosis: form.diagnosis,
        notes: form.notes,
        vitals: form.vitals,
        items: items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: item.unit_price_currency || item.currency,
          subtotal: item.subtotal,
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

      let id = Number(prescriptionId);
      if (id) {
        savedId = id;
        await prescriptionApi.update(id, payload);
      } else {
        const created = await prescriptionApi.create(payload);
        id = created?.data?.id;
        savedId = id;
        const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'prescription_index' }))?.data?.[0];
        if (_indexSetting) {
          await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
        }
      }

      form.prescription_status = confirm ? 'confirmed' : 'draft';

      toast.success(t('Success'), confirm ? t('Prescription Confirmed.') : t('Draft Saved.'));
      resetForm();
      push(savedId ? '/dashboard/prescriptions/' + savedId : '/dashboard/prescriptions/');
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to save prescription. Please try again.'));
    }

    loading = false;
  }

  function resetForm() {
    date = new Date().toISOString().slice(0, 10);
    form = {
      ...form,
      doctor_id: '',
      diagnosis: '',
      notes: '',
      vitals: '',
      patient_id: '',
      appointment_id: prescriptionAppointmentId?Number(prescriptionAppointmentId):'',
      prescription_number: '',
      prescription_date: new Date().toISOString().slice(0, 10),
      description: '',
    };
    items = [];
    paymentDescription = '';
  }

  let form_account_search = '';
  let form_account_search_input = null;
  let filteredAccounts = [];
  let showAccountDropdown = false;
</script>

<div class="container-fluid mt-4" bind:this={componentRoot}>
  <div class="card shadow-2">
    <div class="card-body">
      <h4 class="mb-4">
        {#if prescriptionAppointmentId}<span class='float-end'>{t("Appointment")+": "+shortID(prescriptionAppointmentId)}</span>{/if}
        {prescriptionId ? t('Edit Prescription') : t('New Prescription')}
      </h4>

      <div class="row g-3">
        <div class="col-md-3">
          <select class="form-select form-select-sm" bind:value={form.doctor_id}>
            <option value="">{t('Select Doctor')}</option>
            {#each doctors as d}
              <option value={d.id}>{d.first_name?d.first_name+" "+d.last_name:d.username}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-3">
          <div class="position-relative">
            <div class="input-group input-group-sm w-100">
              {#if form.patient_id}

                <span class="input-group-text bg-success text-white fw-bold" style='cursor:pointer' on:click={() => {
                        showAccountModal = true;
                      }}
                  ><i class="bi bi-person"></i>
                </span>
                
                <span class="input-group-text badge-success w-100 fw-bold">
                  {getAccountName(form.patient_id)}
                </span>

                <button
                  class="btn btn-danger btn-sm pt-1"
                  on:click={async () => {
                    form.patient_id = '';
                    form_account_search = '';
                    showAccountDropdown = true;
                    filteredAccounts = customers;

                    await tick(); // wait for DOM to update
                    
                    form_account_search_input?.focus();
                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
              {:else}
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    id="form_account_search"
                    bind:this={form_account_search_input}
                    bind:value={form_account_search}
                    on:input={() => {
                      showAccountDropdown = true;
                      filteredAccounts = customers.filter((acc) => {
                        const name =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        return name && name.toLowerCase().includes(form_account_search.trim().toLowerCase());
                      });
                    }}
                    on:focus={() => {
                      showAccountDropdown = true;
                      if (form_account_search.trim()) {
                        filteredAccounts = customers.filter((acc) => {
                          const name =
                            t('Lang') === 'en'
                              ? acc.name
                              : t('Lang') === 'fa'
                                ? acc.name_fa
                                : t('Lang') === 'ps'
                                  ? acc.name_ps
                                  : acc.name;
                          return name && name.toLowerCase().includes(form_account_search.trim().toLowerCase());
                        });
                      } else {
                        filteredAccounts = customers;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showAccountDropdown = false), 150)}
                    autocomplete="off" />
                  <label class="form-label" for="form_account_search">{t('Select Customer')}</label>
                </div>

                <button
                  class="btn btn-info btn-sm pt-1"
                  on:click={() => {
                    accountModalRef.openModal();
                  }}>
                  <i class="bi bi-plus-circle"></i>
                </button>
              {/if}
            </div>
            {#if showAccountDropdown && filteredAccounts.length > 0}
              <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                {#each filteredAccounts as acc}
                  <li
                    class="list-group-item list-group-item-action bg-body"
                    style="cursor:pointer"
                    on:mousedown={() => {
                      form.patient_id = acc.id;
                      form_account_search =
                        t('Lang') === 'en'
                          ? acc.name
                          : t('Lang') === 'fa'
                            ? acc.name_fa
                            : t('Lang') === 'ps'
                              ? acc.name_ps
                              : acc.name;
                      showAccountDropdown = false;
                      setTimeout(() => {
                        if (window.mdb) {
                          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                        }
                      }, 100);
                    }}>
                    <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                      {#if accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                        {t('Lang') === 'en'
                          ? accountTypes.find((at) => at.id === acc.account_type_id)?.name
                          : t('Lang') === 'fa'
                            ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                            : t('Lang') === 'ps'
                              ? accountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                              : accountTypes.find((at) => at.id === acc.account_type_id)?.name}
                      {:else}
                        N/A
                      {/if}
                    </span>
                    {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                    {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                    {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>

        <div class="col-md-3">
          <input
            readonly
            type="text"
            class="form-control form-control-sm"
            value="{t('Prescription #')}: {form.prescription_number}" />
        </div>

        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input type="date" class="form-control" data-bind="date" required bind:value={form.prescription_date} />
            <span class="input-group-text persian-date-text"></span>
          </div>
        </div>

      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-md-3">
<div class="card shadow-2 mt-4">
  <div class="card-body">
      <label class="form-label">{t('Vitals')}</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        bind:value={form.vitals}
        placeholder={t('Vitals')}></textarea>

      <label class="form-label mt-3">{t('Diagnosis')}</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        bind:value={form.diagnosis}
        placeholder={t('Diagnosis')}></textarea>

        
      <label class="form-label mt-3">{t('Notes')}</label>
      <textarea
        class="form-control form-control-sm"
        rows="2"
        bind:value={form.notes}
        placeholder={t('Notes')}></textarea>
    
      
      </div>
      </div>


    </div>
    <div class="col-md-9">
      <PrescriptionItemsTable bind:items currency={form.currency} doctor_id={form.doctor_id} />


          <textarea
            class="form-control form-control-sm mt-3"
            rows="4"
            bind:value={form.description}
            placeholder={t('Description')}></textarea>
    </div>
  </div>

  <div class="card shadow-2 mt-4">
    <div class="card-body d-flex justify-content-end align-items-center">
      <div>
        <button class="btn btn-secondary me-2" on:click={() => savePrescription(false)} disabled={loading}
          >{t('Save Draft')}</button>
        <button class="btn btn-success" on:click={() => savePrescription(true)} disabled={loading}>{t('Confirm Prescription')}</button>
      </div>
    </div>
  </div>
</div>

<AccountModal
  bind:this={accountModalRef}
  {accountTypes}
  on:saved={async (e) => {
    // Reload customers after adding new account
    customers = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];

    // Automatically select the newly added account
    const newAccount = e.detail.account;
    if (newAccount && newAccount.account_type_id == 4) {
      form.patient_id = newAccount.id;
    }
  }} />


{#if form?.patient_id}
  {#if showAccountModal}
    <!-- Modal -->
    <div class="modal show d-block" id="accountModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {t('Account')}
            </h5>
            <button
              type="button"
              class="btn-close"
              on:click={() => {
                showAccountModal = false;
              }}></button>
          </div>
          <div class="modal-body overflow-y-auto" style="max-height:480px">
            <AccountView id={form.patient_id} />
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
