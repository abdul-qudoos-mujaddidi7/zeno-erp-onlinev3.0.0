<script>
  import { onMount, onDestroy } from 'svelte';
  import { apartmentApi } from '../../api/apartmentApi.js';
  import { buildingApi } from '../../api/buildingApi.js';
  import { floorApi } from '../../api/floorApi.js';
  import { leaseApi } from '../../api/leaseApi.js';
  import { t, shortID } from '../../i18n/i18n.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  let mode = 'list';
  let apartments = [];
  let loading = true;
  let buildings = [];
  let floors = [];
  let leases = [];
  let lookupsLoaded = false;

  import ApartmentModal from './ApartmentModal.svelte';
  let apartmentModalRef = null;
  let filterBuilding = 'all';
  let filterFloor = 'all';

  export let account_id = null;
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
      const [bldRes, flrRes] = await Promise.all([
        buildingApi.getAll({ status: 1 }),
        floorApi.getAll({ status: 1 }),
      ]);
      buildings = bldRes?.data || [];
      floors = flrRes?.data || [];
      lookupsLoaded = true;
    } catch (err) {
      console.error('Failed to load lookups:', err);
      buildings = [];
      floors = [];
    }
  }

  function pageKey() {
    return `${currentPage}|${itemsPerPage}|${filterBuilding}|${filterFloor}|${account_id || ''}`;
  }

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = pageKey();
    loading = true;
    try {
      await loadLookups();

      // account_id view: leases lookup only (filter apartments by tenant leases)
      if (account_id) {
        const leaseRes = await leaseApi.getAll({
          status: 1,
          tenant_account_id: account_id,
        });
        if (requestId !== loadRequestId) return;
        leases = leaseRes?.data || [];
      } else {
        leases = [];
      }

      const query = {
        status: 1,
        search: searchTerm.trim(),
        page: currentPage,
        limit: itemsPerPage,
      };
      if (filterBuilding !== 'all') query.building_id = filterBuilding;
      if (filterFloor !== 'all') query.floor_id = filterFloor;

      const aptRes = await apartmentApi.getAll(query);
      if (requestId !== loadRequestId) return;

      let rows = aptRes?.data || [];
      const meta = readListMeta(aptRes, rows.length);

      if (account_id) {
        const accountLeases = leases.filter(
          (l) => l.tenant_account_id === parseInt(account_id),
        );
        const aptIds = new Set(accountLeases.map((l) => l.apartment_id));
        rows = rows.filter((p) => p.id && aptIds.has(p.id));
        totalItems = rows.length;
        totalPages = Math.ceil(totalItems / itemsPerPage) || 0;
      } else {
        totalItems = meta.total;
        totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
      }

      apartments = rows;
    } catch (err) {
      console.error('Failed to load apartments:', err);
      if (requestId === loadRequestId) {
        apartments = [];
        leases = [];
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
    void filterBuilding;
    void filterFloor;
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
    let res = apartments.slice();
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
              placeholder={t('Search apartments...')}
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
              value={filterBuilding}
              on:change={(e) => {
                filterBuilding = e.currentTarget.value;
                filterFloor = 'all';
                onFilterChange();
              }}
            >
              <option value="all">{t('All') + ' ' + t('Buildings')}</option>
              {#each buildings as building}
                <option value={building.id}>{building.name} ({building.code})</option>
              {/each}
            </select>
          </div>
          <div class="col-md-2">
            {#if filterBuilding != 'all'}
              <select
                class="form-select form-select-sm me-3"
                value={filterFloor}
                on:change={(e) => {
                  filterFloor = e.currentTarget.value;
                  onFilterChange();
                }}
              >
                <option value="all">{t('All') + ' ' + t('Floors')}</option>
                {#each floors as floor}
                  {#if floor.building_id == filterBuilding}
                    <option value={floor.id}>{floor.floor_number}</option>
                  {/if}
                {/each}
              </select>
            {/if}
          </div>
          <div class="col-md-2 text-end">
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
            {#if !account_id}
              <button
                class="btn btn-primary w-100"
                on:click={() => {
                  apartmentModalRef?.openApartmentModal();
                }}><i class="bi bi-plus-circle me-2"></i>{t('New Apartment')}</button>
            {/if}
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
                <th class="text-center cursor-pointer" on:click={() => setSort('unit_number')}
                  >{t('Unit Number')}{#if sortColumn === 'unit_number'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('floor_id')}
                  >{t('Floor')}{#if sortColumn === 'floor_id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('building_id')}
                  >{t('Building')}{#if sortColumn === 'building_id'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('area_sqm')}
                  >{t('Area (sqm)')}{#if sortColumn === 'area_sqm'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('bedrooms')}
                  >{t('Bedrooms')}{#if sortColumn === 'bedrooms'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('bathrooms')}
                  >{t('Bathrooms')}{#if sortColumn === 'bathrooms'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('rent_amount')}
                  >{t('Rent Amount')}{#if sortColumn === 'rent_amount'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('sale_price')}
                  >{t('Sale Price')}{#if sortColumn === 'sale_price'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('unit_type')}
                  >{t('Unit Type')}{#if sortColumn === 'unit_type'}<i
                      class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i
                    >{/if}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('occupancy_status')}
                  >{t('Occupancy Status')}{#if sortColumn === 'occupancy_status'}<i
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
                  <td class="text-center">{w.unit_number}</td>
                  <td class="text-center"
                    >{floors.find((b) => b.id === w.floor_id)?.floor_number == 0
                      ? 0
                      : floors.find((b) => b.id === w.floor_id)?.floor_number || ''}</td>
                  <td class="text-center"
                    >{buildings.find((b) => b.id === w.building_id)?.name || ''} ({buildings.find(
                      (b) => b.id === w.building_id,
                    )?.code || ''})</td>
                  <td class="text-center">{w.area_sqm}</td>
                  <td class="text-center">{w.bedrooms}</td>
                  <td class="text-center">{w.bathrooms}</td>
                  <td class="text-center"
                    >{Number(w.rent_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {t(w.currency)}</td>
                  <td class="text-center"
                    >{Number(w.sale_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {t(w.currency)}</td>
                  <td class="text-center">{w.unit_type}</td>
                  <td class="text-center">{w.occupancy_status}</td>
                  <td class="text-center" dir="ltr">{w.created_at ? new Date(w.created_at).toLocaleString() : ''}</td>
                  <td class="text-center">
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => apartmentModalRef?.editApartment(w)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                  </td>
                </tr>
              {/each}
              {#if filtered.length === 0}
                <tr><td colspan="12" class="text-center text-muted p-4">{t('No apartments found.')}</td></tr>
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

<ApartmentModal bind:this={apartmentModalRef} on:saved={load} />

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
