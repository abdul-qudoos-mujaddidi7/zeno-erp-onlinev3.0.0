<script>
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';
  import PrescriptionModal from './prescriptions/PrescriptionModal.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n.js';
import { accountApi } from '../../api/accountApi.js';
import { userApi } from '../../api/userApi.js';
import { productApi } from '../../api/productApi.js';
import { prescriptionApi } from '../../api/prescriptionApi.js';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let prescriptions = [];
  let showA4Receipt = false;
  let selectedPrescription = null;

  let accounts = [];

  function getAccountName(acc) {
    if (!acc) return 'Unknown';
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  export let patient_id = null;

  export let appointment_id = null;

  
  let loading = true;
  let products = [];

  // --- Table State ---
  let searchTerm = '';
  let filterStatus = 'all'; // 'all', 'confirmed', 'draft', etc.
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }
  let doctors = [];

  async function load() {
    loading = true;
    products = (await productApi.getAll({ status: 1 }))?.data || [];

    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
    prescriptions = (await prescriptionApi.getAll({ status: 1 }))?.data || [];

    prescriptions = prescriptions.filter((s) => s.status == 1).sort((a, b) => Number(b.id) - Number(a.id));
    loading = false;
  }

  onMount(async () => {
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

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

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let fromDate = '';
  let toDate = '';
  // Reactive computed list
  $: filteredPrescriptions = (() => {
    let result = prescriptions.filter((s) => {
      const prescriptionDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's prescriptions
      if (from && to && from.getTime() === to.getTime()) {
        return prescriptionDate.toDateString() === from.toDateString();
      }
      if (from && prescriptionDate < from) return false;
      if (to && prescriptionDate > to) return false;
      return true;
    });

    if (patient_id) {
      result = result.filter((s) => s.patient_id === Number(patient_id));
    }

    if (appointment_id) {
      result = result.filter((s) => s.appointment_id === Number(appointment_id));
    }

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.prescription_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.prescription_number && String(s.prescription_number).toLowerCase().includes(term)) ||
          (s.description && s.description.toLowerCase().includes(term)) ||
          (s.id && String(s.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      if (sortColumn == 'total_amount') {
        const valA = Number(a[sortColumn]) || 0;
        const valB = Number(b[sortColumn]) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      let valA = a[sortColumn];
      let valB = b[sortColumn];

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

  $: paginatedPrescriptions = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredPrescriptions.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredPrescriptions.length / itemsPerPage);

  $: if (searchTerm || filterStatus) currentPage = 1;



  async function getPrescriptionItems(id) {
    const detail = (await prescriptionApi.getById(id))?.data;
    return (detail?.items || []).filter((item) => Number(item.status) === 1);
  }

</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('prescriptions', filteredPrescriptions, fromDate, toDate, filteredPrescriptions.length, {}, {});
    }}
    disabled={generatingPDF}
    class="btn btn-outline-danger btn-sm me-2 px-2 float-end">
    {#if generatingPDF}
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">${t('Generating...')}</span>
      </div>
    {:else}
      <i class="bi bi-file-pdf-fill"></i>
      {t('PDF')}
    {/if}
  </button>
  <div class="row">
    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="fromDate" bind:value={fromDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-4">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="toDate" bind:value={toDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>
  </div>
  <div class="m-3 d-flex gap-3 flex-wrap">
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Prescriptions Count')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredPrescriptions.length}
          {filteredPrescriptions.length < 2 ? t('Prescription') : t('Prescriptions')}
        </small>
      </div>
    </div>
  
  </div>
  <div class="card shadow-2">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-4">
          <input type="text" class="form-control" placeholder={t('Search prescriptions...')} bind:value={searchTerm} />
        </div>

        <div class="col-md-3">
          <select class="form-select" bind:value={filterStatus}>
            <option value="all">{t('All Statuses')}</option>
            <option value="confirmed">{t('Confirmed')}</option>
            <option value="draft">{t('Draft')}</option>
            <option value="cancelled">{t('Cancelled')}</option>
          </select>
        </div>

        <div class="col-md-2 offset-md-1 text-end">
          <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
          </select>
        </div>
        <div class="col-md-2 {appointment_id?"":"d-none"}">

          <button class="btn btn-primary w-100" on:click={() => {
            selectedPrescription = null;
            showA4Receipt = true;
          }}
            ><i class="bi bi-plus-circle me-2"></i>{t('New Prescription')}</button>
        </div>

      </div>
    </div>

    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('prescription_number')}
                >{t('Prescription #')}{#if sortColumn === 'prescription_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
                  
              <th class="text-center cursor-pointer {appointment_id ? 'd-none' : ''}" on:click={() => setSort('appointment_id')}
                >{t('Appointment')}{#if sortColumn === 'appointment_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer {patient_id ? 'd-none' : ''}" on:click={() => setSort('patient_id')}
                >{t('Patient')}{#if sortColumn === 'patient_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('doctor_id')}
                >{t('Doctor')}{#if sortColumn === 'doctor_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center">{t('Status')}</th>
              <th width="150" class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedPrescriptions as s}
              <tr>
                <td class="ps-4 text-muted small">{shortID(s.id)}</td>
                <td class="text-center">{@html showDate(s.created_at)}</td>

                <td class="text-center">
                  <button on:click={push(`/dashboard/prescriptions/${s.id}`)} class="btn btn-link btn-sm"
                    >{s.prescription_number}</button>
                </td>

                <td class="text-center {appointment_id ? 'd-none' : ''}">
                  <span
                    on:click={push(`/dashboard/appointment/${s.appointment_id}`)}
                    style="cursor:pointer"
                    class="badge badge-success">
                    {shortID(s.appointment_id)}
                  </span></td>


                <td class="text-center {patient_id ? 'd-none' : ''}">
                  <span
                    on:click={push(`/dashboard/account/${s.patient_id}`)}
                    style="cursor:pointer"
                    class="badge badge-success">
                    {getAccountName(accounts.find((a) => a.id == s.patient_id))}
                  </span></td>


                <td class="text-center fw-bold">{doctors.find((w) => w.id == s.doctor_id)?.username || '-'}</td>

                <td class="text-center"
                  ><span class="badge badge-{s.prescription_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(s.prescription_status)}</span
                  ></td>

                <td class="text-center">

  <button
                    class="btn btn-sm btn-primary me-1"
                    on:click={() => {
                      
  selectedPrescription = s;
  showA4Receipt = true;
                    }}
                    title="View"><i class="bi bi-eye"></i></button>



                  <button
                    class="btn btn-sm btn-outline-info me-1 d-none"
                    on:click={() => push(`/dashboard/prescriptions/${s.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>





                  {#if s.prescription_status === 'draft'}
                    <button class="btn btn-sm btn-warning" on:click={() => push(`/dashboard/prescription-form/` + s.id)}
                      >{t('Edit')}</button>
                  {/if}



                </td>
              </tr>
            {/each}
            {#if filteredPrescriptions.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No prescriptions found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    {#if !loading && filteredPrescriptions.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredPrescriptions.length)}
          {t('of')}
          {filteredPrescriptions.length}
          {t('entries')}
        </div>
        <nav>
          <ul class="pagination pagination-circle pagination-sm mb-0">
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage = 1)}
                ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
            </li>
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage -= 1)}
                ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i></button>
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
              <button class="page-link" on:click={() => (currentPage += 1)}
                ><i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
            </li>
            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage = totalPages)}
                ><i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i></button>
            </li>
          </ul>
        </nav>
      </div>
    {/if}
  </div>
{/if}

  {#if showA4Receipt}
    <PrescriptionModal prescription={selectedPrescription} appointment_id={appointment_id} on:closed={() => {
      showA4Receipt = false;
      load();
    }} 
    on:saved={() => {
      load();
    }} 
    
    />
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
