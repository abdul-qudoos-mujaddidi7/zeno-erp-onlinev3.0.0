<script>
  import { onMount, tick, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { generatePDF, generatingPDF } from './generatePDF.js';
  import PaymentSection from './inventory_records/PaymentSection.svelte';
  import { calculateRemainingAndBenefitOfAllInventoryRecords } from './inventory_records/InventoryRecordsHelper.js';

  import { showDate, setDatePickers } from '../calendar.js';

  import { auth } from '../auth/authStore.js';
  $: permissions = $auth.permissions;

  import { t, lang, translate_org_type, shortID, settings_all } from '../i18n/i18n.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let inventory_records = [];
  let currencies = [];
  let accounts = [];
  let totalItems = 0;
  let totalPages = 0;

  let shiftPressed = false;
  let ctrlPressed = false;

  // get shift key status for sidebar toggle
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });
  import InventoryRecordA4ReceiptModal from './inventory_records/InventoryRecordA4ReceiptModal.svelte';
import { currencyApi } from '../api/currencyApi.js';
import { accountApi } from '../api/accountApi.js';
import { productApi } from '../api/productApi.js';
import { inventoryRecordApi } from '../api/inventoryRecordApi.js';
import { apartmentApi } from '../api/apartmentApi.js';
  let showA4Receipt = false;
  let selectedA4InventoryRecord = null;

  function getAccountName(acc) {
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  export let account_id = null;
  let apartments = [];
  let inventory_recordId = null;
  let loading = true;
  let products = [];

  // --- Table State ---
  let searchTerm = '';
  let filterStatus = 'all'; // 'all', 'confirmed', 'draft', etc.
  let filterPaymentStatus = 'all'; // 'all', 'confirmed', 'draft', etc.
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
  }

  async function load() {
    loading = true;
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    accounts = (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];
    filteredAccounts = accounts;
    apartments = (await apartmentApi.getAll({ status: 1 }))?.data || [];
    const response = await inventoryRecordApi.getAll({
      status: 1,
      search: searchTerm.trim(),
      page: currentPage,
      limit: itemsPerPage,
    });
    inventory_records = response?.data || [];
    const meta = readListMeta(response, inventory_records.length);
    totalItems = meta.total;
    totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
    loading = false;
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    await load();
    tick().then(() => setDatePickers(handleDateChange));
    if (addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }

    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
    }
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

  let fromDate = "";
  let toDate = "";
  // Reactive computed list
  $: filteredInventoryRecords = (() => {
    let result = inventory_records.filter((s) => {
      const recordDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's inventory_records
      if (from && to && from.getTime() === to.getTime()) {
        return recordDate.toDateString() === from.toDateString();
      }
      if (from && recordDate < from) return false;
      if (to && recordDate > to) return false;
      return true;
    });

    if (account_id) {
      result = result.filter((s) => s.account_id === Number(account_id));
    }

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.record_status === filterStatus);
    }

    if (filterPaymentStatus !== 'all') {
      result = result.filter((s) => {
        const remaining = s.remaining;

        if (remaining === undefined) return false;

        if (filterPaymentStatus === 'paid') return remaining <= 0;
        if (filterPaymentStatus === 'unpaid') return remaining > 0;

        return true;
      });
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (s) =>
          (s.record_number && String(s.record_number).toLowerCase().includes(term)) ||
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

  $: paginatedInventoryRecords = filteredInventoryRecords;

  $: totalBenefitAmount = filteredInventoryRecords.reduce((totals, s) => {
    if (!s.record_status || s.record_status !== 'confirmed') return totals; // Skip cancelled or invalid inventory_records
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.benefit || 0);
    return totals;
  }, {});
  $: if (searchTerm || filterStatus !== 'all' || filterPaymentStatus !== 'all') {
    currentPage = 1;
  }

  // createJournalsForAllInventoryRecords();

  let totalInventoryRecordsAmount = {};
  // consider currency if you have multi currency support
  $: totalInventoryRecordsAmount = filteredInventoryRecords.reduce((totals, s) => {
    if (!s.record_status || s.record_status !== 'confirmed') return totals; // Skip cancelled or invalid inventory_records
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});


  let fromDateInput = null;
  let toDateInput = null;

  let addPaymentModal;
  let addPaymentModalInstance;
  let selectedInventoryRecord = null;

  function openPaymentModal(inventory_record) {
    selectedInventoryRecord = inventory_record;

    if (!addPaymentModalInstance && addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }

    addPaymentModalInstance?.show();
  }

  async function closePaymentModal() {
    addPaymentModalInstance?.hide();

    // wait a little for payment saves / modal animation
    await tick();

    // recalculate remaining + benefits
    await load();

    // optional cleanup
    selectedInventoryRecord = null;
  }

  let account_search = '';
  let showAccountDropdown = false;
  let filteredAccounts = [];
  let account_search_input = '';

  let calculatingAll = false;
</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('inventory_records', filteredInventoryRecords, fromDate, toDate, filteredInventoryRecords.length, totalInventoryRecordsAmount, totalBenefitAmount);
    }}
    disabled={generatingPDF}
    class="btn btn-outline-danger btn-sm me-2 px-2 float-end d-none">
    {#if generatingPDF}
      <div class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">${t('Generating...')}</span>
      </div>
    {:else}
      <i class="bi bi-file-pdf-fill"></i>
      {t('PDF')}
    {/if}
  </button>

  <button
    on:click={() => {
      selectedA4InventoryRecord = null;
      showA4Receipt = true;
    }}
    class="btn btn-outline-danger btn-sm me-2 px-2 float-end d-none">
    <i class="bi bi-file"></i>
    {t('Empty Bill')}
  </button>

  <div class="row">
    <div class="col-md-3">
      <div class="position-relative">
        <div class="input-group input-group-sm w-100">
          {#if account_id}
            <span class="input-group-text bg-success text-white fw-bold" style="cursor: pointer;"
              ><i class="bi bi-person"></i>
            </span>
            <span class="input-group-text badge-success w-100 fw-bold">
              {getAccountName(accounts.find((a) => a.id === Number(account_id)))}
            </span>

            <button
              class="btn btn-danger btn-sm pt-1"
              on:click={async () => {
                account_id = null;
                account_search = '';
                showAccountDropdown = true;
                filteredAccounts = accounts;

                await tick(); // wait for DOM to update

                account_search_input?.focus();
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
                bind:this={account_search_input}
                bind:value={account_search}
                on:input={() => {
                  showAccountDropdown = true;
                  filteredAccounts = accounts.filter((acc) => {
                    const name =
                      t('Lang') === 'en'
                        ? acc.name
                        : t('Lang') === 'fa'
                          ? acc.name_fa
                          : t('Lang') === 'ps'
                            ? acc.name_ps
                            : acc.name;
                    return name && name.toLowerCase().includes(account_search.trim().toLowerCase());
                  });
                }}
                on:focus={() => {
                  showAccountDropdown = true;
                  if (account_search.trim()) {
                    filteredAccounts = accounts.filter((acc) => {
                      const name =
                        t('Lang') === 'en'
                          ? acc.name
                          : t('Lang') === 'fa'
                            ? acc.name_fa
                            : t('Lang') === 'ps'
                              ? acc.name_ps
                              : acc.name;
                      return name && name.toLowerCase().includes(account_search.trim().toLowerCase());
                    });
                  } else {
                    filteredAccounts = accounts;
                  }
                }}
                on:blur={() => setTimeout(() => (showAccountDropdown = false), 150)}
                autocomplete="off" />
              <label class="form-label" for="form_account_search">{t('Select Customer')}</label>
            </div>
          {/if}
        </div>
        {#if showAccountDropdown && filteredAccounts.length > 0}
          <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
            {#each filteredAccounts as acc}
              <li
                class="list-group-item list-group-item-action bg-body small px-2 py-1"
                style="cursor:pointer"
                on:mousedown={() => {
                  account_id = acc.id;
                  account_search =
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
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" bind:this={fromDateInput} data-bind="fromDate" bind:value={fromDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-3">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" bind:this={toDateInput} data-bind="toDate" bind:value={toDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-2">
      <button
        class="btn btn-primary btn-sm w-100"
        on:click={() => {
          fromDateInput.value = '';
          fromDateInput.dispatchEvent(new Event('change'));
          toDateInput.value = '';
          toDateInput.dispatchEvent(new Event('change'));
          fromDate = '';
          toDate = '';
        }}><i class="bi bi-list me-2"></i> {t('Show All')}</button>
    </div>
  </div>
  
  <div class="card shadow-2">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-2">
          <input type="text" class="form-control" placeholder={t('Search inventory_records...')} bind:value={searchTerm} />
        </div>

        <div class="col-md-6">
          <select class="form-select" bind:value={filterStatus}>
            <option value="all">{t('All Statuses')}</option>
            <option value="confirmed">{t('Confirmed')}</option>
            <option value="draft">{t('Draft')}</option>
            <option value="cancelled">{t('Cancelled')}</option>
          </select>
        </div>


        <div class="col-md-2 text-end">
          <select class="form-select form-select-sm d-inline-block w-auto" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
          </select>
        </div>
        <div class="col-md-2">
        
          <button
            class="btn btn-primary w-100"
            on:click={() => {
              if (account_id) {
                push(`/dashboard/account-inventory_record-form/${account_id}`);
              } else {
                push(`/dashboard/inventory_record-form/0`);
              }
            }}><i class="bi bi-plus-circle me-2"></i>{t('New Inventory Record')}</button>
          <button
            disabled={calculatingAll}
            class="btn btn-danger btn-sm mt-2 w-100 {(shiftPressed && ctrlPressed) || calculatingAll ? '' : 'd-none'}"
            on:click={async () => {
              if (
                confirm(
                  t('Are you sure you want to recalculate benefit and remaining for all inventory_records? This may take a while.'),
                )
              ) {
                calculatingAll = true;
                await calculateRemainingAndBenefitOfAllInventoryRecords();
                calculatingAll = false;
                load();
              }
            }}>
            {@html calculatingAll
              ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">Loading...</span>
</div>
`
              : `<i class="bi bi-plus-circle me-2"></i>` + t('Calculate All InventoryRecords')}
          </button>
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

              <th class="text-center cursor-pointer" on:click={() => setSort('record_number')}
                >{t('Record #')}{#if sortColumn === 'record_number'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer {account_id ? 'd-none' : ''}" on:click={() => setSort('account_id')}
                >{t('Customer')}{#if sortColumn === 'account_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}
                >{t('Total')}{#if sortColumn === 'total_amount'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>


              {#if shiftPressed && ctrlPressed}
                <th class="text-center cursor-pointer" on:click={() => setSort('items_count')}
                  >{t('Items')}{#if sortColumn === 'items_count'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
              {/if}

              <th class="text-center cursor-pointer" on:click={() => setSort('apartment_id')}
                >{t('Apartment')}{#if sortColumn === 'apartment_id'}<i
                    class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                  >{/if}</th>

              <th class="text-center">{t('Status')}</th>
              <th width="150" class="text-center">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedInventoryRecords as s}
              <tr>
                <td class="ps-4 text-muted small">{shortID(s.id)}</td>
                <td class="text-center">{@html showDate(s.created_at)}</td>

             
                <td class="text-center">
                  <button on:click={push(`/dashboard/inventory_records/${s.id}`)} class="btn btn-link btn-sm"
                    >{s.record_number}</button>
                </td>

                <td class="text-center {account_id ? 'd-none' : ''}">
                  <span
                    on:click={push(`/dashboard/account/${s.account_id}`)}
                    style="cursor:pointer"
                    class="badge badge-success">
                    {getAccountName(accounts.find((a) => a.id == s.account_id))}
                  </span></td>

                <td class="text-center fw-bold"
                  >{Number(s.total_amount).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}{' '}
                  {t(s.currency)}</td>


                {#if shiftPressed && ctrlPressed}
                  <td class="text-center fw-bold">{s.items_count} </td>
                {/if}

                <td class="text-center fw-bold">{apartments.find((w) => w.id == s.apartment_id)?.unit_number || '-'}</td>

                <td class="text-center"
                  ><span class="badge badge-{s.record_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(s.record_status)}</span
                  ></td>

                <td class="text-center">
                
  <button
    on:click={() => {
      selectedA4InventoryRecord = s;
      showA4Receipt = true;
    }}
    class="btn btn-outline-primary btn-sm me-2 px-2">
    <i class="bi bi-printer"></i>
  </button>

                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    on:click={() => push(`/dashboard/inventory_records/${s.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>
                  {#if s.record_status === 'draft'}
                    <button class="btn btn-sm btn-warning" on:click={() => push(`/dashboard/inventory_record-form/` + s.id)}
                      >{t('Edit')}</button>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if filteredInventoryRecords.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No inventory_records found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    {#if !loading && filteredInventoryRecords.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredInventoryRecords.length)}
          {t('of')}
          {filteredInventoryRecords.length}
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
  <InventoryRecordA4ReceiptModal inventory_record={selectedA4InventoryRecord} on:close={() => (showA4Receipt = false)} />
{/if}

<div
  class="modal fade"
  bind:this={addPaymentModal}
  tabindex="-1"
  aria-labelledby="addPaymentModalLabel"
  aria-hidden="true">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="addPaymentModalLabel">
          <i class="bi bi-plus-circle"></i>
          {t('Add Payment')}
          {selectedInventoryRecord?.record_number}
        </h5>
        <button type="button" class="btn-close" on:click={closePaymentModal}></button>
      </div>
      <div class="modal-body">
        {#if selectedInventoryRecord}
          <PaymentSection inventory_recordId={selectedInventoryRecord.id} />
        {/if}
      </div>
    </div>
  </div>
</div>

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
