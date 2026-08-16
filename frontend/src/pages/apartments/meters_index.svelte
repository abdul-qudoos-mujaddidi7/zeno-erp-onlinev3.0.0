<script>
  import { onMount, onDestroy } from 'svelte';
  import { utilityMeterApi } from '../../api/utilityMeterApi.js';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { t, shortID } from '../../i18n/i18n.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  let mode = 'list';
  let meters = [];
  let loading = true;
  let apartments = [];
  let buildings = [];
  let floors = [];
  let lookupsLoaded = false;

  import MeterModal from './MeterModal.svelte';

  let meterModalRef = null;
  let filterApartment = 'all';
  let searchTerm = '';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;

  async function loadLookups() {
    if (lookupsLoaded) return;
    try {
      const [aptRes, buildingRes, floorRes] = await Promise.all([
        apartmentApi.getAll({ status: 1 }),
        buildingApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
      ]);
      apartments = aptRes?.data || [];
      buildings = buildingRes?.data || [];
      floors = floorRes?.data || [];
      lookupsLoaded = true;
    } catch (err) {
      console.error('Failed to load apartment labels:', err);
      apartments = [];
      buildings = [];
      floors = [];
    }
  }

  function pageKey() {
    return `${currentPage}|${itemsPerPage}|${filterApartment}`;
  }

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = pageKey();
    loading = true;
    try {
      await loadLookups();
      const query = {
        status: 1,
        search: searchTerm.trim(),
        page: currentPage,
        limit: itemsPerPage,
      };
      if (filterApartment !== 'all') query.apartment_id = filterApartment;
      const response = await utilityMeterApi.getAll(query);
      if (requestId !== loadRequestId) return;
      meters = response?.data || [];
      const meta = readListMeta(response, meters.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
    } catch (err) {
      console.error('Failed to load meters:', err);
      if (requestId === loadRequestId) {
        meters = [];
        totalItems = 0;
        totalPages = 0;
      }
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else load();
    }, 300);
  }

  function onFilterChange() {
    if (currentPage !== 1) currentPage = 1;
    else load();
  }

  onMount(() => {
    lastPageKey = pageKey();
    bootstrapped = true;
    load();
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void filterApartment;
    const key = pageKey();
    if (key !== lastPageKey) {
      lastPageKey = key;
      load();
    }
  }

  function setSort(col) {
    if (sortColumn === col) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else {
      sortColumn = col;
      sortDirection = 'asc';
    }
  }

  $: filtered = (() => {
    let res = meters.slice();
    res = res.sort((a, b) => {
      let A = a[sortColumn];
      let B = b[sortColumn];
      if (A === undefined || A === null) return 1;
      if (B === undefined || B === null) return -1;
      if (typeof A === 'string') A = A.toLowerCase();
      if (typeof B === 'string') B = B.toLowerCase();
      if (A < B) return sortDirection === 'asc' ? -1 : 1;
      if (A > B) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return res;
  })();

  $: paginated = filtered;
</script>

{#if mode === 'list'}
  {#if loading}
    <div>Loading...</div>
  {:else}
    <div class="card shadow-2">
      <div class="card-header bg-body-tertiary border-bottom p-3">
        <div class="row g-3 align-items-center">
          <div class="col-md-4">
            <input
              class="form-control"
              placeholder={t('Search meters...')}
              value={searchTerm}
              on:input={(e) => {
                searchTerm = e.currentTarget.value;
                scheduleSearchReload();
              }}
            />
          </div>
          <div class="col-md-2">
            <select
              class="form-select form-select-sm me-3"
              value={filterApartment}
              on:change={(e) => {
                filterApartment = e.currentTarget.value;
                onFilterChange();
              }}
            >
              <option value="all">{t('All') + ' ' + t('Apartments')}</option>
              {#each apartments as apartment}
                <option value={apartment.id}
                  >{t('Apartment')}: {apartment.unit_number} - {t('Floor')}: {floors.find(
                    (f) => f.id === apartment.floor_id,
                  )?.floor_number || ''} - {t('Building')}: {buildings.find((b) => b.id === apartment.building_id)
                    ?.name || ''} ({buildings.find((b) => b.id === apartment.building_id)?.code || ''})</option>
              {/each}
            </select>
          </div>
          <div class="col-md-4 text-end">
            <select
              class="form-select form-select-sm d-inline-block w-auto"
              value={itemsPerPage}
              on:change={(e) => {
                itemsPerPage = Number(e.currentTarget.value);
                currentPage = 1;
              }}
            >
              <option value={15}>15 {t('per page')}</option>
              <option value={25}>25 {t('per page')}</option>
              <option value={50}>50 {t('per page')}</option>
              <option value={100}>100 {t('per page')}</option>
            </select>
          </div>
          <div class="col-md-2">
            <button
              class="btn btn-primary w-100"
              on:click={() => {
                meterModalRef?.openMeterModal();
              }}><i class="bi bi-plus-circle me-2"></i>{t('New Meter')}</button>
          </div>
        </div>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle">
            <thead class="table-light">
              <tr>
                <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}
                  >{t('ID')}{#if sortColumn === 'id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('apartment_id')}
                  >{t('Apartment')}{#if sortColumn === 'apartment_id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('meter_number')}
                  >{t('Meter Number')}{#if sortColumn === 'meter_number'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('installation_date')}
                  >{t('Installation Date')}{#if sortColumn === 'installation_date'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('initial_reading')}
                  >{t('Initial Reading')}{#if sortColumn === 'initial_reading'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('current_reading')}
                  >{t('Current Reading')}{#if sortColumn === 'current_reading'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('utility_type')}
                  >{t('Utility Type')}{#if sortColumn === 'utility_type'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('created_at')}
                  >{t('Created')}{#if sortColumn === 'created_at'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th width="150" class="text-center">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each paginated as w}
                <tr>
                  <td class="ps-4 text-muted small">{shortID(w.id)}</td>
                  <td class="text-center">{apartments.find((b) => b.id === w.apartment_id)?.unit_number || ''}</td>
                  <td class="text-center">{w.meter_number}</td>
                  <td class="text-center">{w.installation_date}</td>
                  <td class="text-center"
                    >{Number(w.initial_reading || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {t(w.currency)}</td>
                  <td class="text-center"
                    >{Number(w.current_reading || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {t(w.currency)}</td>
                  <td class="text-center">{w.utility_type}</td>
                  <td class="text-center" dir="ltr">{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => meterModalRef?.editMeter(w)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                  </td>
                </tr>
              {/each}
              {#if filtered.length === 0}
                <tr><td colspan="12" class="text-center text-muted p-4">{t('No meters found.')}</td></tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      {#if !loading && totalItems > 0}
        <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
          <div class="text-muted small">
            {t('Showing')}
            {(currentPage - 1) * itemsPerPage + 1}
            {t('to')}
            {Math.min(currentPage * itemsPerPage, totalItems)}
            {t('of')}
            {totalItems}
            {t('entries')}
          </div>
          <nav>
            <ul class="pagination pagination-circle pagination-sm mb-0">
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage = 1)}>&laquo;</button>
              </li>
              <li class="page-item" class:disabled={currentPage === 1}>
                <button class="page-link" on:click={() => (currentPage -= 1)}>&lt;</button>
              </li>
              {#each Array(totalPages) as _, i}
                <li class="page-item" class:active={currentPage === i + 1}>
                  <button class="page-link" on:click={() => (currentPage = i + 1)}>{i + 1}</button>
                </li>
              {/each}
              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage += 1)}>&gt;</button>
              </li>
              <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
                <button class="page-link" on:click={() => (currentPage = totalPages)}>&raquo;</button>
              </li>
            </ul>
          </nav>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<MeterModal bind:this={meterModalRef} on:saved={load} />

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
