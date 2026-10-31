<script>
  import { onMount } from 'svelte';
import { departmentApi } from '../../../api/departmentApi.js';
  import { toast } from '../../../ToastUI/toast.js';

  import { push } from 'svelte-spa-router';
  import AppointmentReceiptModal from './AppointmentReceiptModal.svelte';
  let showReceipt = false;
  let selectedAppointment = null;

  import { t, lang, translate_org_type, shortID } from '../../../i18n/i18n';
  import TableSkeleton from '../../../components/common/TableSkeleton.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let patient_id = null;

  $: if (patient_id) {
    patient_id = Number(patient_id);
    loadAppointments();
  }

  let selectedDoctorID = localStorage.getItem('role_id') == 5 ? localStorage.getItem('user_id') : null;

  let visit_types = ['outpatient', 'emergency', 'followup', 'inpatient', 'consulting'];
  let visit_type_colors = ['primary', 'danger', 'warning', 'secondary', 'success'];
  let visit_statuses = ['pending', 'waiting', 'in_progress', 'in_examination','in_operation','in_bed','following_up', 'completed','cancelled'];
  let visit_status_colors = ['secondary', 'info', 'warning', 'primary','danger','dark','warning', 'success','dark'];
  let visit_status = visit_statuses[0];
  let patients = [];
  let doctors = [];
  let users = [];
  let departments = [];
  let patientTypes = [];
  let currencies = [];
  let appointments = [];
  let totalItems = 0;
  let totalPages = 0;

  let loading = true;

  let modalRef;

  let currency = '';
  import { showDate } from '../../../calendar.js';

  import AddAppointment from './AddAppointment.svelte';
  import EditAppointmentModal from './EditAppointmentModal.svelte';
import { currencyApi } from '../../../api/currencyApi.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { patientTypeApi } from '../../../api/patientTypeApi.js';
import { appointmentApi } from '../../../api/appointmentApi.js';

  async function loadPatients() {
    patientTypes = (await patientTypeApi.getAll({ status: 1 }))?.data || [];
    patients = await (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];

  }


  async function loadDoctors() {
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
  }


  async function loadUsers() {
    users = await (await userApi.getAll({ status: 1 }))?.data || [];
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
    const response = await appointmentApi.getAll({
      status: 1,
      patient_id: patient_id ? Number(patient_id) : '',
      search: searchTerm.trim(),
      page: currentPage,
      limit: itemsPerPage,
    });
    appointments = response?.data || [];
    const meta = readListMeta(response, appointments.length);
    totalItems = meta.total;
    totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

    if (selectedDoctorID) {
      appointments = appointments.filter(ap=>{
        return ap.doctor_id == selectedDoctorID;
      });
    }

    appointments = appointments.slice().sort((a, b) => Number(b.id) - Number(a.id));
    loading = false;

  }

  onMount(async () => {
    await loadPatients();
    await loadDoctors();
    await loadUsers();
    await loadDepartments();
    await loadCurrencies();
    await loadAppointments();
  });
  // --- Table State (mirrors ProductsIndex design) ---
  let searchTerm = '';
  let filterPatient = 'all';
  let filterDoctor = 'all';
  let filterDepartment = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let reference_type = null;
  let reference_types = [null];

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i++) {
      if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      }
    }

    for (let i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    return rangeWithDots;
  }
  $: filteredAppointments = (() => {
    let result = appointments.slice();

    // Status
    if (filterStatus === 'active') {
      result = result.filter((j) => j.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((j) => j.status === 0);
    }

    if (reference_type != null) {
      result = result.filter((j) => j.reference_type === reference_type);
    }

    // Patient filter
    if (filterPatient !== 'all') {
      result = result.filter(
        (j) => j.patient_id === parseInt(filterPatient),
      );
    }

    if (filterDoctor !== 'all') {
      result = result.filter(
        (j) => j.doctor_id === parseInt(filterDoctor),
      );
    }

    if (filterDepartment !== 'all') {
      result = result.filter(
        (j) => j.department_id === parseInt(filterDepartment),
      );
    }


    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((j) => {
        const acctName = getPatientName(j.patient_id).toLowerCase();
        const doctorName = getDoctorName(j.doctor_id).toLowerCase();
        return (
          (j.description && j.description.toLowerCase().includes(term)) ||
          acctName.includes(term) ||
          doctorName.includes(term) ||
          (j.id && String(j.id).includes(term))
        );
      });
    }

    // Sort
    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (sortColumn === 'patient') {
        valA = getPatientName(a.patient_id);
        valB = getPatientName(b.patient_id);
      }

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedAppointments = filteredAppointments;

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  async function deleteAppointment(id) {
    await appointmentApi.remove(id);
    await loadAppointments();
  }
  function getPatientName(id) {
    const acc = patients.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }


  function getDoctorName(id) {
    const doc = doctors.find((d) => d.id === id) || {};
    return doc.first_name+" "+doc.last_name || '';
  }



  function getUserName(id) {
    const user = users.find((d) => d.id == id) || {};
    if (!user) {
      return id;
    }
    if (!user.first_name || !user.last_name) {
      return user.username || id;
    }
    return user.first_name+" "+user.last_name || '';
  }


  // Reset pagination when filters change
  $: if (searchTerm || filterPatient || filterDoctor || filterDepartment || filterStatus) {
    currentPage = 1;
  }

  function editAppointment(j) {}

  let entry_patient_search = '';
  let showPatientDropdown = false;
  let filteredPatients = [];


  let entry_department_search = '';
  let showDepartmentDropdown = false;
  let filteredDepartments = [];


  let entry_doctor_search = '';
  let showDoctorDropdown = false;
  let filteredDoctors = [];

  function getPatientTypeColor(type) {
    const colors = ['dark', 'primary','secondary','danger','success', 'info', 'warning', 'dark','secondary'];
    return colors[type];
  }
</script>

<EditAppointmentModal bind:this={modalRef} on:saved={loadAppointments} />

<AddAppointment selectedPatientID={patient_id}
 on:saved={(e)=>{
  loadAppointments();
  selectedAppointment = e.detail.appointment;
  showReceipt = true;
}}
 />

<div class="card shadow-sm">
  <!-- Toolbar -->
  <div class="card-header bg-body-tertiary border-bottom p-3">
    <div class="row g-3 align-items-center">
      <!-- <div class="col-md-4">
                <input
                    type="text"
                    class="form-control"
                    placeholder={t("Search appointments...")}
                    bind:value={searchTerm}
                />
            </div> -->

      <div class="col-md-3">
        <!-- Searchable Patient Select -->
        <div class="position-relative">
          <div class="form-outline" data-mdb-input-init>
            <input
              type="text"
              class="form-control form-control-sm mb-1"
              id="entry_patient_search"
              bind:value={entry_patient_search}
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
                  const term = entry_patient_search.trim().toLowerCase();
                  return nameStr.includes(term) || code.includes(term);
                });
              }}
              on:focus={() => {
                showPatientDropdown = true;
                if (entry_patient_search.trim()) {
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
                    const term = entry_patient_search.trim().toLowerCase();
                    return nameStr.includes(term) || code.includes(term);
                  });
                } else {
                  filteredPatients = patients;
                }
              }}
              on:blur={() => setTimeout(() => (showPatientDropdown = false), 150)}
              autocomplete="off" />
            <label class="form-label" for="patient_id_search">{t('Select Patient')}</label>
          </div>
          {#if showPatientDropdown && filteredPatients.length > 0}
            <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
              <li
                class="list-group-item list-group-item-action bg-body text-info"
                style="cursor:pointer"
                on:mousedown={() => {
                  filterPatient = 'all';
                  entry_patient_search = '';
                  setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                }}>
                <i class="bi bi-card-checklist me-2"></i>{t('All')}
              </li>
              {#each filteredPatients as acc}
                <li
                  class="list-group-item list-group-item-action bg-body"
                  style="cursor:pointer"
                  on:mousedown={() => {
                    filterPatient = acc.id;
                    entry_patient_search =
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
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                  }}>
                  {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                  {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                  {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}

                  <span class="badge badge-{getPatientTypeColor(acc.patient_type_id)} ms-2 float-end">
                    {acc.code}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="col-md-3">
        <!-- Searchable Department Select -->
        <div class="position-relative">
          <div class="form-outline" data-mdb-input-init>
            <input
              type="text"
              class="form-control form-control-sm mb-1"
              id="entry_department_search"
              bind:value={entry_department_search}
              on:input={() => {
                showDepartmentDropdown = true;
                filteredDepartments = departments.filter((acc) => {
                  const name = acc.name;
                  return name && name.toLowerCase().includes(entry_department_search.trim().toLowerCase());
                });
              }}
              on:focus={() => {
                showDepartmentDropdown = true;
                if (entry_department_search.trim()) {
                  filteredDepartments = departments.filter((acc) => {
                    const name = acc.name;
                    return name && name.toLowerCase().includes(entry_department_search.trim().toLowerCase());
                  });
                } else {
                  filteredDepartments = departments;
                }
              }}
              on:blur={() => setTimeout(() => (showDepartmentDropdown = false), 150)}
              autocomplete="off" />
            <label class="form-label" for="department_id_search">{t('Select Department')}</label>
          </div>
          {#if showDepartmentDropdown && filteredDepartments.length > 0}
            <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
              <li
                class="list-group-item list-group-item-action bg-body text-info"
                style="cursor:pointer"
                on:mousedown={() => {
                  filterDepartment = 'all';
                  entry_department_search = '';
                  setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                }}>
                <i class="bi bi-card-checklist me-2"></i>{t('All')}
              </li>
              {#each filteredDepartments as acc}
                <li
                  class="list-group-item list-group-item-action bg-body"
                  style="cursor:pointer"
                  on:mousedown={() => {
                    filterDepartment = acc.id;
                    entry_department_search = acc.name;
                    setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                  }}>
                  {acc.name}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>


      <div class="col-md-3">
        <!-- Searchable Doctor Select -->
        <div class="position-relative">
          <div class="form-outline" data-mdb-input-init>
            <input
              type="text"
              class="form-control form-control-sm mb-1"
              id="entry_doctor_search"
              bind:value={entry_doctor_search}
              on:input={() => {
                showDoctorDropdown = true;
                filteredDoctors = doctors.filter((acc) => {
                  const name = acc.name;
                  return name && name.toLowerCase().includes(entry_doctor_search.trim().toLowerCase());
                });
              }}
              on:focus={() => {
                showDoctorDropdown = true;
                if (entry_doctor_search.trim()) {
                  filteredDoctors = doctors.filter((acc) => {
                    const name = acc.name;
                    return name && name.toLowerCase().includes(entry_doctor_search.trim().toLowerCase());
                  });
                } else {
                  filteredDoctors = doctors;
                }
              }}
              on:blur={() => setTimeout(() => (showDoctorDropdown = false), 150)}
              autocomplete="off" />
            <label class="form-label" for="doctor_id_search">{t('Select Doctor')}</label>
          </div>
          {#if showDoctorDropdown && filteredDoctors.length > 0}
            <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
              <li
                class="list-group-item list-group-item-action bg-body text-info"
                style="cursor:pointer"
                on:mousedown={() => {
                  filterDoctor = 'all';
                  entry_doctor_search = '';
                  setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                }}>
                <i class="bi bi-card-checklist me-2"></i>{t('All')}
              </li>
              {#each filteredDoctors as acc}
                <li
                  class="list-group-item list-group-item-action bg-body"
                  style="cursor:pointer"
                  on:mousedown={() => {
                    filterDoctor = acc.id;
                    entry_doctor_search = acc.first_name +" "+ acc.last_name;
                    setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                  }}>
                  {acc.first_name} {acc.last_name}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <div class="col-md-2 d-none">
        <select class="form-select" bind:value={filterStatus}>
          <option value="active">{t('Active')}</option>
          <option value="inactive">{t('Inactive')}</option>
          <option value="all">{t('All')}</option>
        </select>
      </div>

      <div class="col-md-2 d-none">
        <select class="form-select form-select-sm" bind:value={reference_type}>
          {#each reference_types as rt}
            <option value={rt}>{rt == null ? t('All') : t(rt)}</option>
          {/each}
        </select>
      </div>

      <div class="col-md-3 text-end">
        <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
          <option value={5}>5 {t('per page')}</option>
          <option value={10}>10 {t('per page')}</option>
          <option value={20}>20 {t('per page')}</option>
          <option value={50}>50 {t('per page')}</option>
          <option value={100}>100 {t('per page')}</option>
          <option value={250}>250 {t('per page')}</option>
        </select>
      </div>
    </div>
  </div>

  <div class="card-body p-0">
    {#if loading}
      <TableSkeleton ariaLabel={t('Loading...')} colCount={9} minWidth="1000px" />
    {:else}
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('date')}
                >{t('Date')}
                {#if sortColumn === 'date'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              {#if !patient_id}
              <th class="text-center cursor-pointer" on:click={() => setSort('patient_id')}
                >{t('Patient')}
                {#if sortColumn === 'patient_id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              {/if}
              <th class="text-center cursor-pointer" on:click={() => setSort('department_id')}
                >{t('Department')}
                {#if sortColumn === 'department_id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('doctor_id')}
                >{t('Doctor')}
                {#if sortColumn === 'doctor_id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>

              <th class="text-center cursor-pointer" on:click={() => setSort('serial_no')}
                >{t('Appointment')}
                {#if sortColumn === 'serial_no'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center cursor-pointer">{t('Fee')} </th>
              
              <th class="text-center cursor-pointer" on:click={() => setSort('visit_type')}
                >{t('Visit')}
                {#if sortColumn === 'visit_type'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedAppointments as j}
              <tr >
                <td class="ps-4 text-muted small" style="vertical-align: middle;">
                  
                
                <span class="badge badge-info d-block mb-1" on:click={() => push(`/dashboard/appointment/${j.id}`)} style="cursor:pointer"
                    >{shortID(j.id)}</span
                  >
                
                <span class="badge badge-success d-block mb-1"
                    >{t('By')}: {getUserName(j.created_by)}</span
                  >
                
                
                </td>
                <td class="text-center" style="vertical-align: middle;">{@html showDate(j.date)}</td>
                {#if !patient_id}
                  <td class="text-center" style="vertical-align: middle;">
                    <div
                      on:click={push(`/dashboard/account/${j.patient_id}`)}
                      style="cursor:pointer"
                      class="btn btn-link btn-sm p-0 d-block">
                      {getPatientName(j.patient_id)}
                  </div>
                    <span
                      on:click={push(`/dashboard/account/${j.patient_id}`)}
                      style="cursor:pointer"
                      class=" d-block badge badge-{getPatientTypeColor(patients.find((a) => a.id === j.patient_id)?.patient_type_id)}">
                      {patients.find((a) => a.id === j.patient_id)?.code || '0'}
                    </span>
                </td>
                {/if}
                <td class="text-center" style="vertical-align: middle;">
                    {departments.find((d) => d.id === j.department_id)?.name || ''}
                </td>
                <td class="text-center" style="vertical-align: middle;">
                    {getDoctorName(j.doctor_id)}
                </td>
                <td class="text-center fw-bold" style="vertical-align: middle;">{j.serial_no}</td>
                <td class="text-center fw-bold" style="vertical-align: middle;">
                  <span class="badge badge-info d-block mb-1"
                    >{j.fee != 0
                      ? Number(j.fee).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  >
                
                <span class="badge badge-success d-block mb-1"
                    >{j.paid_amount != 0
                      ? Number(j.paid_amount || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        }) +
                        ' ' +
                        t(j.currency)
                      : ''}</span
                  >
                
                </td>
              
                <td class="text-center fw-bold" style="vertical-align: middle;">
                <span class='badge badge-{visit_type_colors[visit_types.indexOf(j.visit_type)]} d-block mb-1'>{t(j.visit_type)}</span>
                <span class='badge badge-{visit_status_colors[visit_statuses.indexOf(j.visit_status)]} d-block'>{t(j.visit_status)}</span>
                  </td>
              
              
                <td class="text-center" style="vertical-align: middle;">
                    <button class="btn btn-sm btn-info px-2" on:click={() => push(`/dashboard/appointment/${j.id}`)}>
                      <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning px-2" on:click={() => modalRef.openModal(j.id)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-danger px-2"
                      on:click={() => {
                        toast.confirm(t('Are you sure?'), t("You won't be able to revert this!")).then((ok) => {
                          if (ok) {
                            deleteAppointment(j.id);
                          }
                        });
                      }}>
                      <i class="bi bi-trash"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-primary me-1 px-2"
                      on:click={() => {
                        showReceipt = true;
                        selectedAppointment = j;
                      }}>
                      <i class="bi bi-printer"></i>
                    </button>
                </td>
              </tr>
            {/each}
            {#if filteredAppointments.length === 0}
              <tr>
                <td colspan="12" class="text-center text-muted p-4">{t('No appointment entries found.')}</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  {#if !loading && filteredAppointments.length > 0}
    <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
      <div class="text-muted small">
        {t('Showing')}
        {(currentPage - 1) * itemsPerPage + 1}
        {t('to')}
        {Math.min(currentPage * itemsPerPage, filteredAppointments.length)}
        {t('of')}
        {filteredAppointments.length}
        {t('entries')}
      </div>
      <nav>
        <ul class="pagination pagination-circle pagination-sm mb-0">
          <li class="page-item" class:disabled={currentPage === 1}>
            <button class="page-link" on:click={() => (currentPage = 1)}>
              <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage === 1}>
            <button class="page-link" on:click={() => (currentPage -= 1)}>
              <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
            </button>
          </li>

          {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
            {#if pageNum === '...'}
              <li class="page-item disabled">
                <span class="page-link">...</span>
              </li>
            {:else}
              <li class="page-item" class:active={currentPage === pageNum}>
                <button class="page-link" on:click={() => (currentPage = pageNum)}>{pageNum}</button>
              </li>
            {/if}
          {/each}

          <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
            <button class="page-link" on:click={() => (currentPage += 1)}>
              <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
            </button>
          </li>
          <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
            <button class="page-link" on:click={() => (currentPage = totalPages)}>
              <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  {/if}
</div>

{#if showReceipt}
  <AppointmentReceiptModal appointment={selectedAppointment} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
  .pagination-circle .page-link {
    border-radius: 50% !important;
    margin-left: 3px;
    margin-right: 3px;
    border: none;
  }
</style>
