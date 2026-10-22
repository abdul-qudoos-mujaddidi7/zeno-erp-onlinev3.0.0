<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { showDate } from '../../calendar.js';
  import { generatePDF, generatingPDF } from './../generatePDF.js';
  import { bomApi } from '../../api/bomApi.js';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let boms = [];
  let loading = true;

  let searchTerm = '';
  let filterStatus = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  let fromDate = '';
  let toDate = '';

  async function load() {
    loading = true;
    boms = (await bomApi.getAll({ status: 1 }))?.data || [];
    loading = false;
  }

  onMount(async () => {
    await load();
  });

  function handleToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    if (currentPage !== 1) currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterStatus = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'cancelled', label: t('Cancelled') },
  ];

  $: toolbarFilters = [
    { key: 'status', label: t('Status'), value: filterStatus, icon: 'bi-activity', options: statusFilterOptions },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function statusTone(status) {
    if (status === 'confirmed') return 'positive';
    if (status === 'cancelled') return 'negative';
    return 'neutral';
  }

  $: totalBOMsAmount = filteredBOMs.reduce((totals, p) => {
    if (!p.bill_status || p.bill_status !== 'confirmed') return totals;
    if (!totals[p.currency]) totals[p.currency] = 0;
    totals[p.currency] += Number(p.total_amount);
    return totals;
  }, {});

  $: filteredBOMs = (() => {
    let result = boms.filter((p) => {
      const invoiceDate = new Date(p.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
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

</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('BOMs')}
  toolbarWidth="25rem"
  showFooter={!loading && filteredBOMs.length > 0}
  dense={true}
  contentClass="boms-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-plus-lg" label={t('New BOM')} on:click={() => push(`/dashboard/bom-form/0`)} />

    <ExportMenu
      extraClass="pdf-btn"
      loading={generatingPDF}
      disabled={generatingPDF || filteredBOMs.length === 0}
      on:export={() => {
        generatePDF('boms', filteredBOMs, fromDate, toDate, filteredBOMs.length, totalBOMsAmount, {});
      }} />

  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search boms...')}
      filters={toolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => (searchTerm = event.detail)}
      on:filterChange={handleToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredBOMs.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-inbox" message={t('No boms found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('BOMs')}
      minWidth="780px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="cursor-pointer" on:click={() => setSort('created_at')}>
            {t('Date')}
            {#if sortColumn === 'created_at'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('bill_date')}>
            {t('BOM Date')}
            {#if sortColumn === 'bill_date'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('bill_number')}>
            {t('Bill #')}
            {#if sortColumn === 'bill_number'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('total_amount')}>
            {t('Total')}
            {#if sortColumn === 'total_amount'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Status')}</th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedBOMs as p, index (p.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td>
            <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(p.created_at)}</StatusBadge>
          </td>
          <td>
            <StatusBadge tone="neutral" ghost ltr={true} stacked>{@html showDate(p.bill_date)}</StatusBadge>
          </td>
          <td>
            <button type="button" class="invoice-link" on:click={() => push(`/dashboard/boms/${p.id}`)}>
              {p.bill_number}
            </button>
          </td>
          <td>
            <span class="amount-pill">
              <span dir="ltr">{Number(p.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
              {t(p.currency)}
            </span>
          </td>
          <td>
            <button type="button" class="invoice-link" on:click={() => push(`/dashboard/boms/${p.id}`)}>
              <StatusBadge tone={statusTone(p.bill_status)}>{t(p.bill_status)}</StatusBadge>
            </button>
          </td>
          <td>
            <TableActions
              actions={[
                {
                  icon: 'bi-eye',
                  label: t('View'),
                  tone: 'view',
                  onClick: () => push(`/dashboard/boms/${p.id}`),
                },
                {
                  icon: 'bi-pencil',
                  label: t('Edit'),
                  tone: 'edit',
                  onClick: () => push(`/dashboard/bom-form/` + p.id),
                },
              ]} />
          </td>
        </tr>
      {/each}
    </DataTable>
  {/if}

  <svelte:fragment slot="footer">
    <PaginationBar
      bind:currentPage
      {totalPages}
      {itemsPerPage}
      totalItems={filteredBOMs.length}
      ariaLabel={t('BOMs pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(e) => {
        itemsPerPage = Number(e.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<style>:global(.boms-index-content .data-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: var(--table-font-size, 0.78rem);
  }

:global(.boms-index-content .data-table thead th) {
    height: 3rem;
    padding: 0.625rem 0.875rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #ffffff;
    color: #66758a;
    font-size: var(--table-header-font-size, 0.78125rem);
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

:global(.boms-index-content .data-table tbody tr) {
    height: auto;
    background: #ffffff;
  }

:global(.boms-index-content .data-table tbody td) {
    height: auto;
    padding: 0.4rem 0.875rem;
    border: 0;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: var(--table-font-size, 0.75rem);
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

:global(.boms-index-content .data-table tbody tr:nth-child(even)) {
    background: #f5f7fa;
  }

:global(.boms-index-content .data-table tbody tr:nth-child(odd):hover) {
    background: #ffffff;
  }

:global(.boms-index-content .data-table tbody tr:nth-child(even):hover) {
    background: #f5f7fa;
  }

:global(.data-table tbody tr.row-overdue) {
    background: #fef2f2 !important;
  }

:global(.data-table tbody tr.row-due-soon) {
    background: #fffbeb !important;
  }

.cell-muted {
    color: #94a3b8;
    font-size: 0.78rem;
  }

.invoice-link {
    padding: 0;
    border: 0;
    color: #0f6efd;
    background: transparent;
    font-size: var(--table-font-size, 0.78rem);
    font-weight: 700;
    cursor: pointer;
  }

.amount-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 28px;
    padding: 0.28rem 0.62rem;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    color: #334155;
    background: #ffffff;
    font-size: 0.78rem;
    font-weight: 700;
    white-space: nowrap;
  }

</style>
