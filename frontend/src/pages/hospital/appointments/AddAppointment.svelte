<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
import { departmentApi } from '../../../api/departmentApi.js';
  import { t, lang, translate_org_type,settings_all } from '../../../i18n/i18n.js';
  import AppointmentReceiptModal from './AppointmentReceiptModal.svelte';

  import { push } from 'svelte-spa-router';

  let showReceipt = false;
  let savedAppointment = null;
  export let appointmentId = null;
  export let parent_visit_id = null;




  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let componentRoot;
  import PatientModal from '../patients/PatientModal.svelte';
  import { showDate, setDatePickers } from '../../../calendar.js';
  import { toast } from '../../../ToastUI/toast.js';
    import app from '../../../main.js';
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { productApi } from '../../../api/productApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';
import { patientTypeApi } from '../../../api/patientTypeApi.js';

  $: enable_duplicate_product = $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;


  let patient = null;
  let doctor = null;
  let department = null;
  let patients = [];
  let patientTypes = [];
  let currencies = [];
  let appointments = [];
  let allAppointments = [];
  let doctors = [];
  let departments = [];






  function visitDateNow() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    visit_date = now.toISOString().slice(0, 16);
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }

  let loading = true;

  export let selectedPatientID = null;


  let selectedDoctorID = localStorage.getItem('role_id') == 5 ? localStorage.getItem('user_id') : null;

  $: if (selectedPatientID) {
    patient_id = Number(selectedPatientID);
    loadPatients();
    console.log('patient_id', patient_id);
  }

  async function loadPatientforParent(pvid) {
    const parent = (await appointmentApi.getById(Number(pvid)))?.data;
    selectedPatientID = parent?.patient_id;
  }


  $: if (parent_visit_id) {
    selectedDoctorID = null;
    visit_type = visit_types[2];
    loadPatientforParent(parent_visit_id);
  }


  export let selectedDepartmentID = null;


  export async function modalOpened(id) {
    
    if (Array.isArray(id)) {
    } else {
      appointmentId = id;
      await loadAppointmentIfEditing();
    }
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 100);
  }


  function recalc(index) {

    const item = appointment_items[index];


    // Calculate subtotal using multiplier
    item.subtotal = Number(item.quantity) * (Number(item.calculated_price) || 0);

    appointment_items = [...appointment_items];
    dispatch('update', { items: appointment_items });
  }
  function handleDateChange(inputName, value) {
    if (inputName === 'date') date = value;
  }

  async function calculateSerialNo() {
    await loadAppointments();
    let count = appointments.filter(
      (a) => a.date?.slice(0, 10) === date && (doctor_id ? a.doctor_id === doctor_id : true),
    ).length;
    serial_no = count + 1;
  }

  $: if (date || doctor_id) {
    calculateSerialNo();
  }

  const dispatch = createEventDispatcher();

  let modalRef; // reference to PatientModal for opening it from appointment form
  let modalRefAdd;
  // Form fields
  let date = new Date().toISOString().slice(0, 10);
  let description = '';
  let serial_no = '';
  let fee = null;
  let currency = '';
  let paid_amount = null;
  let patient_id = '';
  let doctor_id = '';
  let department_id = '';
  let reference_id = null;
  let reference_type = null;

  let products = [];
  let appointment_items = [];

  let visit_types = ['outpatient', 'emergency', 'followup', 'inpatient', 'consulting'];
  let visit_type_colors = ['primary', 'danger', 'warning', 'secondary', 'success'];
  let visit_type = parent_visit_id ? visit_types[2] : visit_types[0];
  let visit_statuses = ['pending', 'waiting', 'in_progress', 'in_examination','in_operation','in_bed','following_up', 'completed','cancelled'];
  let visit_status_colors = ['secondary', 'info', 'warning', 'primary','danger','dark','warning', 'success','dark'];


  if (localStorage.getItem('org_type')&&localStorage.getItem('org_type') == 'barbershop') {
    visit_statuses = ['pending', 'waiting', 'in_progress', 'following_up', 'completed','cancelled'];
    visit_status_colors = ['secondary', 'info', 'warning', 'warning', 'success','dark'];
    visit_types = ['outpatient', 'emergency', 'followup',  'consulting'];
    visit_type_colors = ['primary', 'danger', 'warning',  'success'];
  } 
  let visit_status = visit_statuses[0];
  let visit_date = null;

  let status = 1;


  function addItem() {
    if (!selectedProduct) return;

    const existingIndex = appointment_items.findIndex((i) => i.product_id === selectedProduct.id);

    if (existingIndex !== -1 && !enable_duplicate_product) {
      appointment_items[existingIndex].quantity += 1;
      appointment_items[existingIndex].subtotal = appointment_items[existingIndex].quantity * appointment_items[existingIndex].unit_price;
    } else {
      appointment_items.push({
        type: selectedProduct.type||'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: 1,
        unit_price: Number(selectedProduct.sell_price),
        calculated_price: Number(selectedProduct.sell_price),
        currency: selectedProduct.sell_currency || currency,
        subtotal: Number(selectedProduct.sell_price),
        availableUnits: selectedProduct.availableUnits,
      });
    }

    // Important: reassign so Svelte updates the table
    appointment_items = [...appointment_items];

    dispatch('update', { items: appointment_items });

    // Reset
    search = '';
    selectedProduct = null;
  }


  function removeItem(index) {
    appointment_items.splice(index, 1);
    appointment_items = [...appointment_items];
    dispatch('update', { items: appointment_items });
  }
  if (selectedPatientID) {
    patient_id = parseInt(selectedPatientID);
  }

  if (selectedDoctorID) {
    doctor_id = parseInt(selectedDoctorID);
  }

  if (selectedDepartmentID) {
    department_id = parseInt(selectedDepartmentID);
  }

  async function loadPatients() {
    await loadAppointments();
    patientTypes = (await patientTypeApi.getAll({ status: 1 }))?.data || [];

    // sort patients by id to ensure consistent order



    patients = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];
    
    patients = patients.filter((a) => a.account_status ? a.account_status == 'active' : a.status == 1);
    patients.sort((a, b) => b.id - a.id);



    patient = patients.find((a) => a.id == patient_id);
    console.log('Loaded patient:', patient);
  }

  async function loadProducts() {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
  }
  async function loadDoctors() {
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
    if (selectedDoctorID) {
      doctor = await ((await userApi.getAll({ status: 1 }))?.data || []).find((u) => Number(u.id) === Number(selectedDoctorID));
      selectedDepartmentID = doctor?.department_id;
      department_id = parseInt(selectedDepartmentID);
    }
  }

  async function loadDepartments() {
    departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
  }

  async function loadCurrencies() {
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    const defaultCurr = currencies.find((c) => c.isDefault);
    if (defaultCurr) currency = defaultCurr.code;
  }

  async function loadAppointments() {
    loading = true;

    appointments = (await appointmentApi.getAll({ status: 1 }))?.data || [];

    loading = false;
  }

  async function loadAppointmentIfEditing() {
    if (appointmentId) {
      let appointment = (await appointmentApi.getById(Number(appointmentId)))?.data || null;
      if (appointment && Number(appointment.status) === 1) {
        date = appointment.date.slice(0, 10);
        console.log(date);
        serial_no = appointment.serial_no;
        description = appointment.description;
        currency = appointment.currency;
        patient_id = appointment.patient_id;
        department_id = appointment.department_id;
        fee = appointment.fee;
        visit_type = appointment.visit_type || visit_types[0];
        visit_status = appointment.visit_status || visit_statuses[0];
        visit_date = appointment.visit_date ? appointment.visit_date : null;
        paid_amount = appointment.paid_amount;
        doctor_id = appointment.doctor_id;
        reference_id = appointment.reference_id;
        reference_type = appointment.reference_type;
        status = appointment.status;

        let first_patient = await (async () => { const _a = (await accountApi.getById(patient_id))?.data; return _a && _a.status === 1 && Number(_a.account_type_id) === 4 ? _a : null; })();
        patient_id_search = first_patient
          ? t('Lang') === 'en'
            ? first_patient.name
            : t('Lang') === 'fa'
              ? first_patient.name_fa
              : t('Lang') === 'ps'
                ? first_patient.name_ps
                : first_patient.name
          : patient_id;

        doctor_id_search = doctors.find((d) => d.id === doctor_id)
          ? doctors.find((d) => d.id === doctor_id).first_name + ' ' + doctors.find((d) => d.id === doctor_id).last_name
          : doctor_id;

        department_id_search = departments.find((d) => d.id === department_id)
          ? departments.find((d) => d.id === department_id).name
          : department_id;

        const appointmentItems = (appointment.items || []).filter((i) => Number(i.status) === 1);
        
        appointment_items = appointmentItems.map((i) => {
          const product = products.find((p) => p.id === i.product_id);
          return {
            product_id: i.product_id,
            product_name: product?.name || 'Unknown',
            product_unit_id: i.product_unit_id || product?.product_unit_id,
            quantity: Number(i.quantity),
            calculated_price: Number(i.unit_price),
            unit_price: Number(i.unit_price),
            unit_price_currency: i.currency,
            subtotal: i.subtotal,
          };
        });

        console.log('loaded', appointment);
      }
    }
  }

  onMount(async () => {
    loadCurrencies();

    await loadProducts();
    await loadPatients();
    await loadDoctors();
    await loadDepartments();
    loadAppointmentIfEditing();
    await tick();
    setDatePickers(handleDateChange, componentRoot); //

    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  });

  async function saveAppointment() {
    console.log(
      'Saving appointment with data:',
      date,
      description,
      serial_no,
      currency,
      patient_id,
      fee,
      paid_amount,
      department_id,
      doctor_id,
    );

    if (!date) {
      toast.error(t('Error'), t('Please Enter Date.'));
      return;
    }
    if (!patient_id) {
      toast.error(t('Error'), t('Please Select Patient.'));
      return;
    }

    if (!department_id) {
      toast.error(t('Error'), t('Please Select Department.'));
      return;
    }
    if (!doctor_id) {
      toast.error(t('Error'), t('Please Select Doctor.'));
      return;
    }
    if (!serial_no) {
      toast.error(t('Error'), t('Please Enter Serial Number.'));
      return;
    }

    if (!fee) {
      toast.error(t('Error'), t('Please Enter Fee.'));
      return;
    }

    if (paid_amount === null || paid_amount === undefined) {
      toast.error(t('Error'), t('Please Enter Paid Amount.'));
      return;
    }

    const data = {
      date,
      description,
      serial_no,
      reference_id,
      reference_type,
      currency,
      visit_type,
      visit_status,
      visit_date,
      patient_id,
      parent_visit_id:parent_visit_id,
      department_id,
      fee: parseFloat(fee) || 0,
      paid_amount: parseFloat(paid_amount) || 0,
      doctor_id,
      status: parseInt(status) || 1,
      items: appointment_items.map((item) => ({
        product_id: item.product_id,
        product_unit_id: item.product_unit_id,
        quantity: item.quantity,
        unit_price: item.calculated_price,
        discount_amount: 0,
        discount_type: 'fixed',
        currency: item.currency || currency,
        subtotal: item.subtotal,
        status: 1,
      })),
    };

    try {
      if (!appointmentId) {
        const created = await appointmentApi.create(data);
        data.id = created?.data?.id;
        console.log('Appointment saved with ID:', data);
      } else {
        await appointmentApi.update(Number(appointmentId), data);
        data.id = appointmentId;
        console.log('Appointment Updated with ID:', data);
      }


      if (!appointmentId) {
        resetForm();
      }
      await loadPatients();

      dispatch('saved', { appointment: data });
      savedAppointment = data;
      toast.success(t('Success'), t('Appointment saved successfully.'));
    } catch (err) {
      console.error('Failed to save appointment:', err);
      toast.error(t('Error'), t('An error occurred while saving the appointment. Please try again.'));
    }
  }

  $: patient_name =
  patients.find((p) => p.id === patient_id)
    ? (
        t('Lang') === 'en'
          ? patients.find((p) => p.id === patient_id).name
          : t('Lang') === 'fa'
          ? patients.find((p) => p.id === patient_id).name_fa
          : t('Lang') === 'ps'
          ? patients.find((p) => p.id === patient_id).name_ps
          : patients.find((p) => p.id === patient_id).name
      )
    : '';

  async function getPatientName(id) {

    let allPatients = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];
    console.log("Patients",allPatients);
    const acc = allPatients.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
  function resetForm() {
    
    date = new Date().toISOString().slice(0, 10);
    description = '';
    serial_no = '';
    if (!selectedPatientID) {
      patient_id = '';
    } else {
      patient_id = parseInt(selectedPatientID);
    }
    if (!selectedDoctorID) {
      doctor_id = '';
    } else {
      doctor_id = parseInt(selectedDoctorID);
    }
    fee = null;
    paid_amount = null;
    department_id = null;
    patient_id_search = '';
    doctor_id_search = '';
    visit_date = null;
    visit_status = visit_statuses[0];
    visit_type = parent_visit_id ? visit_types[2] : visit_types[0]
    department_id_search = '';
   
    appointment_items = [];
    currency = currencies.find((c) => c.isDefault)?.code || '';
    status = 1;
  }

  function format(value) {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  }
  function normalize(value) {
    if (!value) return '0';

    // remove all non-digits and non-dot
    value = value.toString().replace(/[^0-9.]/g, '');

    // allow only one decimal
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    // split integer and decimal parts
    let [integer, decimal] = value.split('.');

    // remove leading zeros from integer part
    if (integer) {
      integer = integer.replace(/^0+(?=\d)/, '');
      if (integer === '') integer = '0';
    }

    // join integer and decimal back
    return decimal !== undefined ? integer + '.' + decimal : integer;
  }
  function onFeeInput(value) {
    const amount = normalize(value);
    fee = amount;
  }

  function onPaidAmountInput(value) {
    const amount = normalize(value);
    if (Number(amount) > Number(fee)) {
      console.log(amount, fee);
      paid_amount = normalize(fee);
    } else {
      paid_amount = amount;
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  function onlyNumbers(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'];
    if (allowed.includes(e.key)) return;
    if (/[0-9]/.test(e.key)) return;
    if (e.key === '.' && !e.target.value.includes('.')) return;

    e.preventDefault();
  }

  // --- Computed Data (Filter, Sort, Pagination) ---

   $: total = appointment_items.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  $: if (total) {
    fee = total;
    setInterval(() => {
    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
    }, 100);
  }

  let patient_id_search = '';
  let showPatientDropdown = false;
  let filteredPatients = [];

  let doctor_id_search = '';
  let showDoctorDropdown = false;
  let filteredDoctors = [];

  let department_id_search = '';
  let showDepartmentDropdown = false;
  let filteredDepartments = [];

  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary', 'secondary', 'danger', 'success', 'info', 'warning', 'dark', 'secondary'];
    return colors[type];
  }


  let search = '';
  let showDropdown = false;
  let form_patient_search_input = null;
  let form_department_search_input = null;
  let form_doctor_search_input = null;
  let form_product_search_input = null;

  $: filteredProducts = products
          .filter(
            (p) =>
            p.department_id == department_id && p.type === 'service' && (search == '' ||
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              p.code?.includes(search.trim().toLowerCase())),
          )
          .slice(0, 10);


  let selectedProduct = null;
</script>

<div class="mb-4" bind:this={componentRoot}>
  <div class="card shadow-sm mb-4">
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input type="date" class="form-control" data-bind="date" bind:value={date} />

            <span class="input-group-text persian-date-text"></span>
          </div>
        </div>

          <div class="col-md-3">
        {#if patient_id}
            <div class="input-group input-group-sm w-100">


                <button class="btn btn-sm btn-{getPatientTypeColor(patients.find((p) => p.id === patient_id)?.patient_type_id || 0)} px-2 pt-1" on:click={() => {push('/dashboard/account/'+patient_id)}}><i class="bi bi-person"></i>
                </button>


                <span class="input-group-text badge-{getPatientTypeColor(patients.find((p) => p.id === patient_id)?.patient_type_id || 0)} w-100 fw-bold d-flex justify-content-between">
                <span>
                  {patient_name || patient_id}
                      </span>
                      <span>
                        {patients.find((p) => p.id === patient_id)?.code ? ` (${patients.find((p) => p.id === patient_id).code})` : ''}
                      </span>
                </span>
                <button
                  class="btn btn-danger btn-sm pt-1"
                  on:click={async () => {

                    patient_id = '';
                    patient_id_search = '';
                    showPatientDropdown = true;
                    filteredPatients = patients;

                    await tick(); // wait for DOM to update
                    
                    form_patient_search_input?.focus();
                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
            </div>
        {:else}
            <!-- Searchable Patient Select -->
            <div class="position-relative">
              <div class="input-group input-group-sm mb-1">
                <div class="form-outline" data-mdb-input-init>
                  <input
                    type="text"
                    class="form-control form-control-sm"
                    id="patient_id_search"
                    bind:this={form_patient_search_input}
                    bind:value={patient_id_search}
                    on:input={() => {
                      showPatientDropdown = true;
                      filteredPatients = patients.filter((acc) => {
                        const name =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        const code = (acc.code ?? '').toString().toLowerCase();
                        const nameStr = (name ?? '').toLowerCase();
                        const term = patient_id_search.trim().toLowerCase();
                        return nameStr.includes(term) || code.includes(term);
                      });
                    }}
                    on:focus={() => {
                      showPatientDropdown = true;
                      if (patient_id_search.trim()) {
                        filteredPatients = patients.filter((acc) => {
                          const name =
                            t('Lang') === 'en'
                              ? acc.name
                              : t('Lang') === 'fa'
                                ? acc.name_fa
                                : t('Lang') === 'ps'
                                  ? acc.name_ps
                                  : acc.name;
                          const code = (acc.code ?? '').toString().toLowerCase();
                          const nameStr = (name ?? '').toLowerCase();
                          const term = patient_id_search.trim().toLowerCase();
                          return nameStr.includes(term) || code.includes(term);
                        });
                      } else {
                        filteredPatients = patients;
                      }
                    }}
                    on:blur={() => setTimeout(() => (showPatientDropdown = false), 150)}
                    autocomplete="off" />
                  <label class="form-label" for="patient_id_search">{t('Select Customer')}</label>
                </div>
                <button
                  class="btn btn-info btn-sm pt-1"
                  on:click={() => {
                    modalRefAdd.openModal();
                  }}>
                  <i class="bi bi-plus-circle"></i>
                </button>
                
              </div>
              <PatientModal
                  bind:this={modalRefAdd}
                  {patientTypes}
                  on:saved={async (e) => {
                    await loadPatients();
                    patient_id = e.detail.patient.id;
                    patient_id_search =
                      t('Lang') === 'en'
                        ? e.detail.patient.name
                        : t('Lang') === 'fa'
                          ? e.detail.patient.name_fa
                          : t('Lang') === 'ps'
                            ? e.detail.patient.name_ps
                            : e.detail.patient.name;
                    setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));

                        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                          new window.mdb.Dropdown(el);
                        });
                      }
                    }, 100);
                  }} />
              <input type="hidden" bind:value={patient_id} />
              {#if showPatientDropdown && filteredPatients.length > 0}
                <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                  {#each filteredPatients as acc}
                    <li
                      class="list-group-item list-group-item-action bg-body"
                      style="cursor:pointer"
                      on:mousedown={() => {
                        patient_id = acc.id;
                        patient_id_search =
                          t('Lang') === 'en'
                            ? acc.name
                            : t('Lang') === 'fa'
                              ? acc.name_fa
                              : t('Lang') === 'ps'
                                ? acc.name_ps
                                : acc.name;
                        showPatientDropdown = false;
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
                      <small class="badge badge-{getPatientTypeColor(acc.patient_type_id || 0)} ms-2 float-end">
                        {acc.code}
                      </small>
                      {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                      {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                      {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
        {/if}
          </div>

        <div class="col-md-3">
          <!-- Searchable doctor Select -->
          {#if doctor_id}
            <div class="input-group input-group-sm w-100">


                <span class="input-group-text bg-info text-white fw-bold"
                  ><i class="bi bi-person-plus"></i>
                </span>
                <span class="input-group-text badge-info w-100 fw-bold d-flex justify-content-between">
                <span>{doctor_id ? doctors.find((d) => d.id === doctor_id)?.first_name+ ' ' + doctors.find((d) => d.id === doctor_id)?.last_name || doctor_id : t('Select Doctor')}</span>
                </span>
                <button
                  class="btn btn-danger btn-sm pt-1"
                  disabled={selectedDoctorID}
                  on:click={async () => {

                    doctor_id = '';
                    doctor_id_search = '';
                    showDoctorDropdown = true;
                    filteredDoctors = doctors.filter((acc) => {
                        return department_id ? department_id === acc.department_id : true;
                      });

                    department_id = '';
                    department_id_search = '';
                    filteredDepartments = departments;
                    await tick(); // wait for DOM to update
                    
                    form_doctor_search_input?.focus();
                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
            </div>
        {:else}
          <div class="position-relative">
            <div class="input-group input-group-sm mb-1">
              <div class="form-outline" data-mdb-input-init>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  id="doctor_id_search"
                  bind:this={form_doctor_search_input}
                  bind:value={doctor_id_search}
                  on:input={() => {
                    showDoctorDropdown = true;
                    filteredDoctors = doctors.filter((acc) => {
                      const department = department_id ? department_id === acc.department_id : true;
                      const name = acc.username;
                      const first_name = acc.first_name;
                      const last_name = acc.last_name;
                      return (
                        (department && name && name.toLowerCase().includes(doctor_id_search.trim().toLowerCase())) ||
                        (first_name && first_name.toLowerCase().includes(doctor_id_search.trim().toLowerCase())) ||
                        (last_name && last_name.toLowerCase().includes(doctor_id_search.trim().toLowerCase()))
                      );
                    });
                  }}
                  on:focus={() => {
                    showDoctorDropdown = true;
                    if (doctor_id_search.trim()) {
                      filteredDoctors = doctors.filter((acc) => {
                        const department = department_id ? department_id === acc.department_id : true;
                        const name = acc.username;
                        const first_name = acc.first_name;
                        const last_name = acc.last_name;
                        return (
                          (department && name && name.toLowerCase().includes(doctor_id_search.trim().toLowerCase())) ||
                          (first_name && first_name.toLowerCase().includes(doctor_id_search.trim().toLowerCase())) ||
                          (last_name && last_name.toLowerCase().includes(doctor_id_search.trim().toLowerCase()))
                        );
                      });
                    } else {
                      filteredDoctors = doctors.filter((acc) => {
                        return department_id ? department_id === acc.department_id : true;
                      });
                    }
                  }}
                  on:blur={() => setTimeout(() => (showDoctorDropdown = false), 150)}
                  autocomplete="off" />
                <label class="form-label" for="doctor_id_search">{t('Select Doctor')}</label>
              </div>
            </div>
            <input type="hidden" bind:value={doctor_id} />
            {#if showDoctorDropdown && filteredDoctors.length > 0}
              <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                {#each filteredDoctors as doc}
                  <li
                    class="list-group-item list-group-item-action bg-body"
                    style="cursor:pointer"
                    on:mousedown={async () => {
                      doctor_id = doc.id;
                      doctor_id_search = doc.first_name + ' ' + doc.last_name;
                      department_id = doc.department_id;
                      department_id_search = departments.find((d) => d.id === doc.department_id)?.name || '';
                      showDoctorDropdown = false;



                      search = "";
                      await tick(); // wait for DOM to update
                      showDropdown = true;
                      form_product_search_input?.focus();
                      setTimeout(() => {
                        if (window.mdb) {
                          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                          document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                            new window.mdb.Dropdown(el);
                          });
                        }
                      }, 100);
                    }}>
                    {doc.first_name}
                    {doc.last_name}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          {/if}
        </div>

        <div class="col-md-2">
          <!-- Searchable department Select -->
             {#if department_id}
            <div class="input-group input-group-sm w-100">


                <span class="input-group-text bg-primary text-white fw-bold"
                  ><i class="bi bi-building"></i>
                </span>
                <span class="input-group-text badge-primary w-100 fw-bold d-flex justify-content-between">
                {department_id ? departments.find((d) => d.id === department_id)?.name || department_id : t('Select Department')}
                </span>
                <button
                  class="btn btn-danger btn-sm pt-1"
                  disabled={selectedDepartmentID}
                  on:click={async () => {

                    department_id = '';
                    department_id_search = '';
                    showDepartmentDropdown = true;
                    doctor_id = '';
                    doctor_id_search = '';
                    filteredDepartments = departments;

                    await tick(); // wait for DOM to update
                    
                    form_department_search_input?.focus();
                    if (window.mdb) {
                      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                    }
                    
                  }}>
                  <i class="bi bi-search"></i>
                </button>
            </div>
        {:else}
          <div class="position-relative">
            <div class="input-group input-group-sm mb-1">
              <div class="form-outline" data-mdb-input-init>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  id="department_id_search"
                  bind:this={form_department_search_input}
                  bind:value={department_id_search}
                  on:input={() => {
                    showDepartmentDropdown = true;
                    filteredDepartments = departments.filter((acc) => {
                      const name = acc.name;
                      return (
                        acc.id != 1 &&
                        acc.id != 2 &&
                        name &&
                        name.toLowerCase().includes(department_id_search.trim().toLowerCase())
                      );
                    });
                  }}
                  on:focus={() => {
                    showDepartmentDropdown = true;
                    if (department_id_search.trim()) {
                      filteredDepartments = departments.filter((acc) => {
                        const name = acc.name;
                        return (
                          acc.id != 1 &&
                          acc.id != 2 &&
                          name &&
                          name.toLowerCase().includes(department_id_search.trim().toLowerCase())
                        );
                      });
                    } else {
                      filteredDepartments = departments.filter((acc) => {
                        return acc.id != 1 && acc.id != 2;
                      });
                    }
                  }}
                  on:blur={() => setTimeout(() => (showDepartmentDropdown = false), 150)}
                  autocomplete="off" />
                <label class="form-label" for="department_id_search">{t('Select Department')}</label>
              </div>
            </div>
            <input type="hidden" bind:value={department_id} />
            {#if showDepartmentDropdown && filteredDepartments.length > 0}
              <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
                {#each filteredDepartments as dep}
                  <li
                    class="list-group-item list-group-item-action bg-body"
                    style="cursor:pointer"
                    on:mousedown={async () => {
                      department_id = dep.id;
                      department_id_search = dep.name;
                      showDepartmentDropdown = false;

                    doctor_id = '';
                    doctor_id_search = '';
                    showDoctorDropdown = true;
                    await tick(); // wait for DOM to update
                    
                      setTimeout(() => {
                    form_doctor_search_input?.focus();
                        if (window.mdb) {
                          document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                        }
                      }, 100);

                      
                    }}>
                    {dep.name}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          {/if}
        </div>

        <div class="col-md-1">
          <div class="form-outline" data-mdb-input-init>
            <input id="c-serial-no" readonly class="form-control form-control-sm fw-bold" bind:value={serial_no} />
            <label class="form-label" for="c-serial-no">{t('Serial Number')}</label>
          </div>
        </div>

        <!-- First Entry -->

        <div class="col-md-6">
          <div class="input-group">
            <button
              id="showVisitTypeDropdown"
              class="btn btn-{visit_type_colors[visit_types.indexOf(visit_type)]} dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              data-mdb-auto-close="true"
              aria-expanded="false">
              {t(visit_type)}
            </button>

            <ul class="dropdown-menu dropdown-menu-end">
              {#each visit_types as vt}
                <li>
                  <button
                    class="dropdown-item {visit_type == vt
                      ? 'bg-' + visit_type_colors[visit_types.indexOf(vt)] + ' text-white'
                      : ''}"
                    on:click={(e) => {
                      visit_type = vt;
                      e.target.closest('.dropdown-menu')?.classList.remove('show');
                    }}
                    type="button">
                    {t(vt)}
                  </button>
                </li>
              {/each}
            </ul>
            <!-- Floating label input -->

            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="datetime-local"
                id="visit_date"
                bind:value={visit_date}
                class="form-control form-control-sm" />
              <label class="form-label" for="visit_date">{t('Visit Date')}</label>
            </div>

            <button class="btn btn-sm btn-success" on:click={visitDateNow}>{t('Now')}</button>
            <button
              id="showVisitStatusDropdown"
              class="btn btn-{visit_status_colors[visit_statuses.indexOf(visit_status)]} dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              data-mdb-auto-close="true"
              aria-expanded="false">
              {t(visit_status)}
            </button>

            <ul class="dropdown-menu dropdown-menu-end">
              {#each visit_statuses as vs}
                <li>
                  <button
                    class="dropdown-item {visit_status == vs
                      ? 'bg-' + visit_status_colors[visit_statuses.indexOf(vs)] + ' text-white'
                      : ''}"
                    on:click={(e) => {
                      visit_status = vs;
                      e.target.closest('.dropdown-menu')?.classList.remove('show');
                    }}
                    type="button">
                    {t(vs)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>


        <div class="col-md-6 position-relative">
          <div class="input-group input-group-sm">
          {#if selectedProduct}

            <button class="btn btn-danger btn-sm pt-1 px-2" type="button" on:click={async () => {
              selectedProduct = null
              
              search = "";
              await tick(); // wait for DOM to update
              form_product_search_input?.focus();
              showDropdown = false;
              setTimeout(() => {
                if (window.mdb) {
                  document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                  document.querySelectorAll('.dropdown-toggle').forEach((el) => {
                    new window.mdb.Dropdown(el);
                  });
                }
              }, 100);
              
              }}>
              <i class="bi bi-x-circle"></i>
            </button>
            <span class="input-group-text badge-success w-100">
              {selectedProduct.name} <small class="text-muted ms-2">{selectedProduct.code}</small>
            </span>
            <button class="btn btn-success btn-sm pt-1 px-2" type="button" on:click={() => (addItem()) && (selectedProduct = null)}>
              <i class="bi bi-plus"></i>
            </button>
          {:else}
            <input
              type="text"
              class="form-control form-control-sm"
              bind:value={search}
              bind:this={form_product_search_input}
              on:focus={() => (showDropdown = true)}
              placeholder={t('Search services...')} />
            {#if showDropdown && filteredProducts.length > 0}
              <div
                class="list-group position-absolute w-100 shadow bg-body-tertiary"
                style="top:100%; left:0; z-index:1055; max-height:250px; overflow:auto;">
                {#each filteredProducts as p}
                  <button
                    type="button"
                    class="list-group-item list-group-item-action"
                    on:click={() => {
                      selectedProduct = p;
                      search = '';
                      showDropdown = false;
                      addItem();
                    }}>
                    <div class="d-flex justify-content-between">
                      <span>{p.name}</span>
                      <small>{p.code}</small>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}

            {/if}
          </div>
        </div>


        <div class="col-md-12">
          {#if appointment_items.length > 0}
      <h5 class="">{t('Appointment Services')}</h5>


    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>{t('Service')}</th>
            <th width="200" class="text-center">{t('Quantity')}</th>
            <th width="180" class="text-center">{t('Sell Price')}</th>
            <th width="150" class="text-center">{t('Subtotal')}</th>
            <th width="80" class="text-center">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each appointment_items as item, index}
            <tr>
              <td>{index + 1}</td>
              <td>{item.product_name}</td>
              <td>
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)} />
                </div>
              </td>
              <td>
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.calculated_price}
                    on:input={() => recalc(index)} />
                  <span class="input-group-text">{t(item.currency)}</span>
                </div>
              </td>
              <td class="fw-bold text-center">
                
                {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(item.currency)}
              </td>
              <td class="text-center"
                ><button class="btn btn-sm btn-outline-danger" on:click={() => removeItem(index)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}

        </div>
        <div class="col-md-6">
          <div class="form-outline" data-mdb-input-init>
            <textarea id="c-description" class="form-control form-control-sm" rows={3} bind:value={description} />
            <label class="form-label" for="c-description">{t('Description')}</label>
          </div>
        </div>
        <!-- Second Entry -->

        <div class="col-md-6">

          <div class="row mb-2">

        <div class="col-md-6">
          <div class="input-group">
            <!-- Floating label input -->
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="fee"
                class="form-control form-control-sm"
                value={format(fee)}
                on:keydown={onlyNumbers}
                on:input={(e) => onFeeInput(normalize(e.target.value))} />
              <label class="form-label" for="fee">{t('Appointment Fee')}</label>
            </div>

            <button
              id="showCurrencyFeeDropdown"
              class="btn btn-secondary dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false">
              {t(currency)}
            </button>

            <ul class="dropdown-menu dropdown-menu-end">
              {#each currencies as cur}
                <li>
                  <button
                    class="dropdown-item {currency == cur.code ? 'bg-info text-white' : ''}"
                    on:click={() => (currency = cur.code)}
                    type="button">
                    {t(cur.code)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <div class="col-md-6">
          <div class="input-group">
            <!-- Floating label input -->
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9,]*"
                id="paid_amount"
                class="form-control form-control-sm"
                value={format(paid_amount)}
                on:keydown={onlyNumbers}
                on:input={(e) => onPaidAmountInput(normalize(e.target.value))} />
              <label class="form-label" for="paid_amount">{t('Paid Amount')}</label>
            </div>

            <button
              id="showCurrencyPaymentDropdown"
              class="btn btn-secondary dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false">
              {t(currency)}
            </button>

            <ul class="dropdown-menu dropdown-menu-end">
              {#each currencies as cur}
                <li>
                  <button
                    class="dropdown-item {currency == cur.code ? 'bg-info text-white' : ''}"
                    on:click={() => (currency = cur.code)}
                    type="button">
                    {t(cur.code)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>

          </div>



          <button class="btn btn-success btn-sm w-100" on:click={saveAppointment}>
            <i class="bi bi-check-circle"></i>
            {appointmentId ? t('Update Appointment') : t('Add Appointment')}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

{#if showReceipt}
  <AppointmentReceiptModal appointment={savedAppointment} on:close={() => (showReceipt = false)} />
{/if}
