<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { workCenterApi } from '../../api/workCenterApi.js';
  import { onMount } from 'svelte';
  import WorkCenterModal from './WorkCenterModal.svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { push } from 'svelte-spa-router';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let work_centerModalRef = null;
  let work_centers = [];
  let loading = true;
  let units = [];
  let searchTerm = '';
  let filterStatus = 'active';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
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
  $: filteredWorkCenters = (() => {
    let result = work_centers;
    if (filterStatus === 'active') {
      result = result.filter((p) => p.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((p) => p.status === 0);
    }
    result = result.sort((a, b) => {
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
  $: paginatedWorkCenters = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredWorkCenters.slice(start, end);
  })();
  $: totalPages = Math.ceil(filteredWorkCenters.length / itemsPerPage);
  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }
  $: if (searchTerm || filterStatus) {
    currentPage = 1;
  }
  async function loadWorkCenters() {
    loading = true;
    try {
      work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }
  onMount(async () => {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
        new window.mdb.Input(el);
      });
    }
    await loadWorkCenters();
  });
</script>

<div class="card shadow-sm rounded-lg border-0">
  <div class="card-header bg-body-tertiary border-bottom p-3">
    <div class="row g-2 align-items-center">
      <div class="col-md-6">
        <input
          type="text"
          id="work_center-search"
          class="form-control form-control-sm me-3"
          placeholder="{t('Search')}..."
          bind:value={searchTerm} />
      </div>
      <div class="col-md-4">
        <select class="form-select form-select-sm me-2" bind:value={itemsPerPage}>
          <option value={5}>5 {t('per page')}</option>
          <option value={10}>10 {t('per page')}</option>
          <option value={20}>20 {t('per page')}</option>
          <option value={50}>50 {t('per page')}</option>
          <option value={100}>100 {t('per page')}</option>
          <option value={250}>250 {t('per page')}</option>
        </select>
      </div>
      <div class="col-md-2">
        <button
          class="btn btn-primary btn-sm px-1 w-100"
          on:click={() => {
            work_centerModalRef?.openWorkCenterModal();
          }}>
          <i class="bi bi-plus-circle"></i>
          {t('New Work Center')}
        </button>
      </div>
    </div>
  </div>
  <div class="card-body p-0">
    {#if loading}
      <div class="text-center p-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">{t('Loading...')}</span>
        </div>
        <p class="mt-2 text-muted">{t('Loading...')}</p>
      </div>
    {:else if filteredWorkCenters.length === 0}
      <div class="text-center p-5">
        <i class="bi bi-inbox fs-1 text-muted"></i>
        <p class="mt-2 text-muted">{t('No work_centers found.')}</p>
      </div>
    {:else}
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('name')}>
                {t('Work Center')}
                {#if sortColumn === 'name'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="cursor-pointer d-none" on:click={() => setSort('code')}>
                {t('Code')}
                {#if sortColumn === 'code'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('setup_time')}>
                {t('Setup Time')}
                {#if sortColumn === 'setup_time'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('cost_per_hour')}>
                {t('Cost Per Hour')}
                {#if sortColumn === 'cost_per_hour'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('capacity_per_hour')}>
                {t('Capacity Per Hour')}
                {#if sortColumn === 'capacity_per_hour'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                {/if}
              </th>
              <th class="text-center pe-4">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedWorkCenters as work_center (work_center.id)}
              <tr>
                <td class="ps-4 text-muted small">#{work_center.id}</td>
                <td class="">
                  <div>
                    <button
                      class="btn btn-link text-primary fw-bold btn-sm px-1"
                      on:click={() => push(`/dashboard/work_center/${work_center.id}`)}>{work_center.name}</button>
                    {#if work_center.description}
                      <small class="text-muted d-none d-md-block">{work_center.description.substring(0, 30)}...</small>
                    {/if}
                  </div>
                </td>
                <td class="d-none">{work_center.code}</td>
                <td class="">{work_center.setup_time} {t(work_center.setup_time_unit)}</td>
                <td class="">{work_center.cost_per_hour} {t(work_center.cost_currency)}</td>
                <td class=""
                  >{work_center.capacity_per_hour} {units.find((u) => u.id == work_center.capacity_unit_id)?.name}</td>
                <td class="">
                  <button
                    class="btn btn-sm btn-outline-secondary me-1"
                    on:click={() => {
                      work_centerModalRef?.editWorkCenter(work_center);
                    }}>
                    <i class="bi bi-pencil"></i>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
  {#if !loading && filteredWorkCenters.length > 0}
    <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
      <div class="text-muted small">
        {t('Showing')}
        {(currentPage - 1) * itemsPerPage + 1}
        {t('to')}
        {Math.min(currentPage * itemsPerPage, filteredWorkCenters.length)}
        {t('of')}
        {filteredWorkCenters.length}
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

<WorkCenterModal bind:this={work_centerModalRef} on:saved={loadWorkCenters} />
