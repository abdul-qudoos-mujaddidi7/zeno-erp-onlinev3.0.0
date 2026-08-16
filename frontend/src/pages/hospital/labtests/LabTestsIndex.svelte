<script>
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { convertUnit, getMultiple } from '../../stocktransactions/calculateStock.js';
  import { generatePDF, generatingPDF } from '../../generatePDF.js';
  import LabTestModal from './LabTestModal.svelte';


  import { showDate, setDatePickers } from '../../../calendar.js';

  import { t, lang, translate_org_type, shortID } from '../../../i18n/i18n.js';
import { accountApi } from '../../../api/accountApi.js';
import { userApi } from '../../../api/userApi.js';
import { productApi } from '../../../api/productApi.js';
import { labtestCategoryApi } from '../../../api/labtestCategoryApi.js';
import { labtestApi } from '../../../api/labtestApi.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let labtests = [];
  let showA4Receipt = false;
  let selectedLabTest = null;
  let totalItems = 0;
  let totalPages = 0;

  let accounts = [];

  let labtest_categories = [];

  function getAccountName(acc) {
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

    labtest_categories = (await labtestCategoryApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];

    accounts = await (await accountApi.getAll({ status: 1 }))?.data || [];
    doctors = await (await userApi.getAll({ status: 1 }))?.data || [];
    const labtestResponse = await labtestApi.getAll({
      status: 1,
      search: searchTerm.trim(),
      page: currentPage,
      limit: itemsPerPage,
    });
    labtests = labtestResponse?.data || [];
    const meta = readListMeta(labtestResponse, labtests.length);
    totalItems = meta.total;
    totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

    loading = false;
  }

  let patients = [];

  onMount(async () => {
    patients = await (await accountApi.getAll({ status: 1 }))?.data || [];
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
  $: filteredLabTests = (() => {
    let result = labtests.filter((s) => {
      const labtestDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's labtests
      if (from && to && from.getTime() === to.getTime()) {
        return labtestDate.toDateString() === from.toDateString();
      }
      if (from && labtestDate < from) return false;
      if (to && labtestDate > to) return false;
      return true;
    });

    if (patient_id) {
      result = result.filter((s) => s.patient_id === Number(patient_id));
    }

    if (appointment_id) {
      result = result.filter((s) => s.appointment_id === Number(appointment_id));
    }

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.labtest_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.labtest_number && String(s.labtest_number).toLowerCase().includes(term)) ||
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

  $: paginatedLabTests = filteredLabTests;

  $: if (searchTerm || filterStatus) currentPage = 1;

function getPatientName(id) {
    const acc = patients.find((a) => a.id === id) || {};
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }


</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('labtests', filteredLabTests, fromDate, toDate, filteredLabTests.length, {}, {});
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
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('LabTests Count')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredLabTests.length}
          {filteredLabTests.length < 2 ? t('LabTest') : t('LabTests')}

          Appointment: {appointment_id}
        </small>
      </div>
    </div>
  
  </div>
  <div class="card shadow-2">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-4">
          <input type="text" class="form-control" placeholder={t('Search labtests...')} bind:value={searchTerm} />
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
            selectedLabTest = null;
            showA4Receipt = true;
          }}
            ><i class="bi bi-plus-circle me-2"></i>{t('New LabTest')}</button>
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
              {#if !appointment_id}
              <th class="text-center cursor-pointer" on:click={() => setSort('appointment_id')}
                >{t('Appointment')}{#if sortColumn === 'appointment_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center cursor-pointer" on:click={() => setSort('patient_id')}
                >{t('Patient')}{#if sortColumn === 'patient_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              {/if}

              <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                >{t('Date')}{#if sortColumn === 'created_at'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center cursor-pointer" on:click={() => setSort('labtest_number')}
                >{t('Lab Test Number')}{#if sortColumn === 'labtest_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('labtest_category_id')}
                >{t('Category')}{#if sortColumn === 'labtest_category_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('name')}
                >{t('Name')}{#if sortColumn === 'name'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
                  
              <th class="text-center cursor-pointer" on:click={() => setSort('description')}
                >{t('Description')}{#if sortColumn === 'description'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('labtest_status')}
                >{t('Status')}{#if sortColumn === 'labtest_status'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              <th class="text-center cursor-pointer" on:click={() => setSort('price')}
                >{t('Price')}{#if sortColumn === 'price'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th width="150" class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedLabTests as s}
              <tr>
                <td class="ps-4 text-muted small">{shortID(s.id)}</td>

              {#if !appointment_id}
              
                <td class="text-center">

                  {#if s.appointment_id}

                <span class="badge badge-info d-block mb-1" on:click={() => push(`/dashboard/appointment/${s.appointment_id}`)} style="cursor:pointer"
                    >{shortID(s.appointment_id)}</span
                  >

                  {/if}
                
                </td>

                <td class="text-center">

                  {#if s.patient_id}
<div
                      on:click={push(`/dashboard/account/${s.patient_id}`)}
                      style="cursor:pointer"
                      class="btn btn-link btn-sm p-0 d-block">
                      {getPatientName(s.patient_id)}
                  </div>
                   <span
                      on:click={push(`/dashboard/account/${s.patient_id}`)}
                      style="cursor:pointer"
                      class=" d-block badge badge-primary">
                      {patients.find((a) => a.id === s.patient_id)?.code || '0'}
                    </span>

                  {/if}
                
                </td>
              {/if}
                <td class="text-center">{@html showDate(s.created_at)}</td>
                <td class="text-center">{s.labtest_number}</td>
                <td class="text-center">{labtest_categories.find(lbc=>lbc.id==s.labtest_category_id)?.name}</td>
                <td class="text-center">{s.name}</td>
                <td class="text-center">{s.description}</td>
                <td class="text-center">{s.labtest_status}</td>
                <td class="text-center">{#if s.price}{s.price} {t(s.currency)}{/if}</td>
                <td class="text-center">
                  <button class="btn btn-sm btn-primary px-2" on:click={()=>{
                    selectedLabTest = s;
                    showA4Receipt = true;
                  }}><i class='bi bi-pencil'></i></button>

                </td>
              </tr>
            {/each}
            {#if filteredLabTests.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No labtests found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    {#if !loading && filteredLabTests.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredLabTests.length)}
          {t('of')}
          {filteredLabTests.length}
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
    <LabTestModal labtest={selectedLabTest} appointment_id={appointment_id} on:close={() => (showA4Receipt = false)} on:saved={()=>{
      showA4Receipt = false;load();
      }} />
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
