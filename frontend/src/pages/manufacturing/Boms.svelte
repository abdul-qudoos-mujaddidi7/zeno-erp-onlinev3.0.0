<script>
  import { onMount, tick } from 'svelte';
  import BOMForm from './boms/BOMForm.svelte';
  import { showDate, setDatePickers } from '../../calendar.js';
  import { push } from 'svelte-spa-router';
  import { generatePDF, generatingPDF } from './../generatePDF.js';
  import { bomApi } from '../../api/bomApi.js';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let boms = [];
  let bomId = null;
  let loading = true;

  let searchTerm = '';
  let filterStatus = 'all';
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
    boms = (await bomApi.getAll({ status: 1 }))?.data || [];
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

  // let fromDate = getLocalDate();
  // let toDate = getLocalDate();

  let fromDate = '';
  let toDate = '';

  let totalBOMsAmount = {};

  $: totalBOMsAmount = filteredBOMs.reduce((totals, p) => {
    if (!p.bill_status || p.bill_status !== 'confirmed') return totals; // Skip cancelled or invalid boms
    if (!totals[p.currency]) totals[p.currency] = 0;
    totals[p.currency] += Number(p.total_amount);
    return totals;
  }, {});

  $: filteredBOMs = (() => {
    let result = boms.filter((p) => {
      const invoiceDate = new Date(p.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's sales
      if (from && to && from.getTime() === to.getTime()) {
        return invoiceDate.toDateString() === from.toDateString();
      }
      if (from && invoiceDate < from) return false;
      if (to && invoiceDate > to) return false;
      return true;
    });
    if (filterStatus !== 'all') {
      result = result.filter((p) => p.bill_status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          (p.bill_number && String(p.bill_number).toLowerCase().includes(term)) ||
          (p.description && p.description.toLowerCase().includes(term)) ||
          (p.id && String(p.id).includes(term)),
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

  $: paginatedBOMs = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return filteredBOMs.slice(start, end);
  })();

  $: totalPages = Math.ceil(filteredBOMs.length / itemsPerPage);

  $: if (searchTerm || filterStatus) currentPage = 1;
</script>

{#if loading}
  <div>Loading...</div>
{:else}
  <button
    on:click={() => {
      generatePDF('boms', filteredBOMs, fromDate, toDate, filteredBOMs.length, totalBOMsAmount, {});
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
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('BOMs Count')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {filteredBOMs.length}
          {filteredBOMs.length < 2 ? t('BOM') : t('BOMs')}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>{t('Total BOMs Amount')}</small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html Object.entries(totalBOMsAmount)
            .map(
              ([currency, amount]) =>
                `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${t(currency)}`,
            )
            .join(' <br> ')}
        </small>
      </div>
    </div>
  </div>
  <div class="card shadow-2">
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-3 align-items-center">
        <div class="col-md-4">
          <input type="text" class="form-control" placeholder={t('Search boms...')} bind:value={searchTerm} />
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
        <div class="col-md-2">
          <button class="btn btn-primary w-100" on:click={() => push(`/dashboard/bom-form/0`)}
            ><i class="bi bi-plus-circle me-2"></i>
            {t('New BOM')}</button>
        </div>
      </div>
    </div>
    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}
                >{t('ID')}{#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('bill_number')}
                >{t('Bill #')}{#if sortColumn === 'bill_number'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('bill_date')}
                >{t('Date')}{#if sortColumn === 'bill_date'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
              <th class="text-center cursor-pointer" on:click={() => setSort('total_amount')}
                >{t('Total')}{#if sortColumn === 'total_amount'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}</th>
              <th class="text-center">{t('Status')}</th>
              <th class="text-center" width="150">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedBOMs as p}
              <tr>
                <td class="ps-4 text-muted small">#{p.id}</td>
                <td class="text-center">{p.bill_number}</td>
                <td class="text-center">{@html showDate(p.bill_date)}</td>
                <td class="text-center"
                  >{Number(p.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(p.currency)}</td>
                <td class="text-center"
                  ><span class="badge badge-{p.bill_status === 'confirmed' ? 'success' : 'warning'}"
                    >{t(p.bill_status)}</span
                  ></td>
                <td class="text-center">
                  <button
                    class="btn btn-sm btn-outline-primary me-1"
                    on:click={() => push(`/dashboard/boms/${p.id}`)}
                    title="View"><i class="bi bi-eye"></i></button>
                  {#if p.bill_status === 'draft'}
                    <button class="btn btn-sm btn-warning" on:click={() => push(`/dashboard/bom-form/` + p.id)}
                      >{t('Edit')}</button>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if filteredBOMs.length === 0}
              <tr><td colspan="12" class="text-center text-muted p-4">{t('No boms found.')}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </div>
    {#if !loading && filteredBOMs.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredBOMs.length)}
          {t('of')}
          {filteredBOMs.length}
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
