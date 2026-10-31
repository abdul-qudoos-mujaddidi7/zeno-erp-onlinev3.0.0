<script>
  import { stockTransferApi } from '../api/stockTransferApi.js';
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';

  import { generatePDF, generatingPDF } from './generatePDF.js';

  import { showDate, setDatePickers } from '../calendar.js';

  import { t, lang, translate_org_type, shortID } from '../i18n/i18n';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import TableSkeleton from '../components/common/TableSkeleton.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import StockTransferDeleteModal from './stocktransfers/StockTransferDeleteModal.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';
  import { onDestroy } from 'svelte';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let stocktransfers = [];
  let stocktransferId = null;
  let loading = true;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let transferToDelete = null;

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

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;
    try {
      const response = await stockTransferApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        page: currentPage,
        limit: itemsPerPage,
      });
      if (requestId !== loadRequestId) return;
      stocktransfers = response?.data || [];
      const meta = readListMeta(response, stocktransfers.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;
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

  onMount(async () => {
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await load();
    tick().then(() => setDatePickers(handleDateChange));
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    const key = `${currentPage}|${itemsPerPage}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      load();
    }
  }

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
  $: filteredStockTransfers = (() => {
    let result = stocktransfers.filter((s) => {
      const transferDate = new Date(s.created_at);
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      // If both dates are same, show that day's stocktransfers
      if (from && to && from.getTime() === to.getTime()) {
        return transferDate.toDateString() === from.toDateString();
      }
      if (from && transferDate < from) return false;
      if (to && transferDate > to) return false;
      return true;
    });

    if (filterStatus !== 'all') {
      result = result.filter((s) => s.transfer_status === filterStatus);
    }

    // Search is server-side

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

  $: paginatedStockTransfers = filteredStockTransfers;

  let totalStockTransfersAmount = {};
  // consider currency if you have multi currency support
  $: totalStockTransfersAmount = filteredStockTransfers.reduce((totals, s) => {
    if (!s.transfer_status || s.transfer_status !== 'confirmed') return totals; // Skip cancelled or invalid stocktransfers
    if (!totals[s.currency]) totals[s.currency] = 0;
    totals[s.currency] += Number(s.total_amount);
    return totals;
  }, {});

  $: transferToolbarFilters = [
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      icon: 'bi-activity',
      options: [
        { value: 'all', label: t('All Statuses') },
        { value: 'confirmed', label: t('Confirmed') },
        { value: 'draft', label: t('Draft') },
        { value: 'cancelled', label: t('Cancelled') },
      ],
    },
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  function handleToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
  }

  function resetFilters() {
    filterStatus = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
  }

  async function closeDeleteModal() {
    transferToDelete = null;
    await load();
  }

</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Stock Transfers')}
  showFooter={!loading && totalItems > 0}
  dense={true}
  contained={true}
  contentClass="stock-transfers-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('New Stock Transfer')}`}
      on:click={() => push(`/dashboard/stock-transfer-form/0`)} />
    <ActionButton
      variant="secondary"
      icon="bi-file-pdf-fill"
      label={t('PDF')}
      loading={generatingPDF}
      disabled={generatingPDF || loading}
      on:click={() => generatePDF('stocktransfers', filteredStockTransfers, fromDate, toDate)} />
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search Stock Transfers...')}
      filters={transferToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        scheduleSearchReload();
      }}
      on:filterChange={handleToolbarFilter}
      on:reset={resetFilters} />
  </svelte:fragment>

  {#if loading}
    <TableSkeleton ariaLabel={t('Loading...')} colCount={7} minWidth="820px" />
  {:else if filteredStockTransfers.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-arrow-left-right" message={t('No stocktransfers found.')} />
    </div>
  {:else}
    <DataTable ariaLabel={t('Stock Transfers')} minWidth="820px" striped={false} hover={true}>
      <svelte:fragment slot="head">
        <tr>
          <th class="cursor-pointer" on:click={() => setSort('id')}>
            {t('ID')}
            {#if sortColumn === 'id'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('transfer_number')}>
            {t('Transfer #')}
            {#if sortColumn === 'transfer_number'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('transfer_date')}>
            {t('Date')}
            {#if sortColumn === 'transfer_date'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="col-end cursor-pointer" on:click={() => setSort('total_amount')}>
            {t('Total')}
            {#if sortColumn === 'total_amount'}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th>{t('Status')}</th>
          <th>{t('Created Date')}</th>
          <th class="col-end">{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedStockTransfers as s (s.id)}
        <tr>
          <td class="cell-muted">{shortID(s.id)}</td>
          <td dir="ltr">{s.transfer_number}</td>
          <td>{@html showDate(s.transfer_date)}</td>
          <td class="col-end">
            <span dir="ltr">
              {Number(s.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}
            </span>
            {t(s.currency)}
          </td>
          <td>
            <StatusBadge tone={s.transfer_status === 'confirmed' ? 'positive' : 'warning'}>
              {t(s.transfer_status)}
            </StatusBadge>
          </td>
          <td><span dir="ltr">{new Date(s.created_at).toLocaleString()}</span></td>
          <td class="col-end">
            <TableActions
              actions={[
                {
                  icon: 'bi-eye',
                  label: t('View'),
                  tone: 'view',
                  onClick: () => push(`/dashboard/stock-transfers/${s.id}`),
                },
                {
                  icon: 'bi-pencil',
                  label: t('Edit'),
                  tone: 'edit',
                  onClick: () => push(`/dashboard/stock-transfer-form/${s.id}`),
                },
                {
                  icon: 'bi-trash',
                  label: t('Delete'),
                  tone: 'delete',
                  onClick: () => (transferToDelete = s),
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
      {totalItems}
      ariaLabel={t('Stock Transfers pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

{#if transferToDelete}
  <StockTransferDeleteModal stocktransfer={transferToDelete} on:close={closeDeleteModal} />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }
</style>
