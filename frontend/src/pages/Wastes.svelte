<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { wasteApi } from '../api/wasteApi.js';
  import { showDate } from '../calendar.js';
  import { t, shortID } from '../i18n/i18n';
  import WasteForm from './wastes/WasteForm.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import SummaryCard from '../components/common/SummaryCard.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import StatusBadge from '../components/common/StatusBadge.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';

  let mode = 'list';
  let wastes = [];
  let wasteId = null;
  let loading = true;

  let searchTerm = '';
  let filterStatus = 'all';
  let fromDate = '';
  let toDate = '';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'date';
  let sortDirection = 'desc';
  let showSummaryCards = false;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;
    try {
      const response = await wasteApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        page: currentPage,
        limit: itemsPerPage,
      });
      if (requestId !== loadRequestId) return;
      wastes = response?.data || [];
      const meta = readListMeta(response, wastes.length);
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

  function openCreate() {
    mode = 'create';
  }

  function openEdit(id) {
    wasteId = id;
    mode = 'edit';
  }

  function backToList() {
    mode = 'list';
    wasteId = null;
    load();
  }

  onMount(() => {
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    load();
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

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getStatusTone(status) {
    if (status === 'confirmed') return 'positive';
    if (status === 'cancelled') return 'negative';
    return 'warning';
  }

  function isWithinDateRange(waste) {
    if (!fromDate && !toDate) return true;
    const value = new Date(waste.date || waste.updated_at || waste.created_at);
    if (Number.isNaN(value.getTime())) return false;

    if (fromDate && value < new Date(`${fromDate}T00:00:00`)) return false;
    if (toDate && value > new Date(`${toDate}T23:59:59.999`)) return false;
    return true;
  }

  function getPageNumbers(current, total) {
    const range = [];
    const compact = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) range.push(page);
    }

    for (const page of range) {
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  $: filtered = wastes
    .filter((waste) => {
      if (filterStatus !== 'all' && waste.waste_status !== filterStatus) return false;
      if (!isWithinDateRange(waste)) return false;
      return true;
    })
    .sort((a, b) => {
      let left = a[sortColumn];
      let right = b[sortColumn];

      if (['id', 'total_amount'].includes(sortColumn)) {
        left = Number(left) || 0;
        right = Number(right) || 0;
      } else {
        left = String(left ?? '').toLowerCase();
        right = String(right ?? '').toLowerCase();
      }

      if (left === right) return 0;
      const result = left < right ? -1 : 1;
      return sortDirection === 'asc' ? result : -result;
    });

  $: paginated = filtered;
  $: confirmedCount = filtered.filter((waste) => waste.waste_status === 'confirmed').length;
  $: draftCount = filtered.filter((waste) => waste.waste_status === 'draft').length;
  $: totalAmount = filtered.reduce((totals, waste) => {
    const currency = waste.currency || '';
    totals[currency] = (totals[currency] || 0) + Number(waste.total_amount || 0);
    return totals;
  }, {});

  $: wasteToolbarFilters = [
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
    searchTerm = '';
    filterStatus = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
    load();
  }

  function formatValueObj(values) {
    if (!Object.keys(values).length) return '0';
    return Object.entries(values)
      .map(
        ([currency, amount]) =>
          `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(currency)}`,
      )
      .join('<br />');
  }
</script>

{#if mode === 'list'}
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Wastes')}
    showStats={showSummaryCards}
    showFooter={!loading && totalItems > 0}
    dense={true}
  
    contentClass="wastes-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ActionButton icon="bi-plus-lg" label={`+ ${t('New Waste')}`} on:click={openCreate} />

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showSummaryCards}
        aria-label={t('Summary')}
        aria-expanded={showSummaryCards}
        title={t('Summary')}
        on:click={() => (showSummaryCards = !showSummaryCards)}>
        <i class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-trash3'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search wastes...')}
        filters={wasteToolbarFilters}
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

    <svelte:fragment slot="stats">
      <div class="index-summary-grid">
        <SummaryCard label={t('Wastes Count')} icon="bi-trash3" tone="cyan">
          {totalItems}
        </SummaryCard>
        <SummaryCard label={t('Confirmed')} icon="bi-check2-circle" tone="green">
          {confirmedCount}
        </SummaryCard>
        <SummaryCard label={t('Draft')} icon="bi-file-earmark" tone="amber">
          {draftCount}
        </SummaryCard>
        <SummaryCard label={t('Total')} icon="bi-cash-stack" tone="purple">
          {@html formatValueObj(totalAmount)}
        </SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if filtered.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-trash3" message={t('No wastes found.')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Wastes')}
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
            <th class="cursor-pointer" on:click={() => setSort('reference_number')}>
              {t('Ref #')}
              {#if sortColumn === 'reference_number'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
            <th class="cursor-pointer" on:click={() => setSort('date')}>
              {t('Date')}
              {#if sortColumn === 'date'}
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

        {#each paginated as waste, index (waste.id)}
          <tr>
            <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
            <td>
              <button type="button" class="reference-link" on:click={() => push(`/dashboard/wastes/${waste.id}`)}>
                {waste.reference_number || `#${shortID(waste.id)}`}
              </button>
            </td>
            <td>
              <StatusBadge tone="neutral" ghost ltr={true} stacked>
                {@html showDate(waste.date || waste.updated_at || waste.created_at)}
              </StatusBadge>
            </td>
            <td>
              <span class="amount-pill">
                <span dir="ltr">
                  {Number(waste.total_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                </span>
                {t(waste.currency)}
              </span>
            </td>
            <td>
              <StatusBadge tone={getStatusTone(waste.waste_status)}>
                {t(waste.waste_status)}
              </StatusBadge>
            </td>
            <td>
              <div class="visible-table-actions">
                <ActionButton
                  variant="icon"
                  tone="view"
                  icon="bi-eye"
                  title={t('View')}
                  on:click={() => push(`/dashboard/wastes/${waste.id}`)} />
                {#if waste.waste_status === 'draft'}
                  <ActionButton
                    variant="icon"
                    tone="edit"
                    icon="bi-pencil"
                    title={t('Edit')}
                    on:click={() => openEdit(waste.id)} />
                {/if}
              </div>
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
        ariaLabel={t('Wastes pagination')}
        rowLabel={t('rows')}
        on:perPageChange={(event) => {
          itemsPerPage = Number(event.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
{:else if mode === 'create'}
  <WasteForm wasteId={null} on:back={backToList} />
{:else if mode === 'edit'}
  <WasteForm {wasteId} on:back={backToList} />
{/if}

<style>
  .cursor-pointer {
    cursor: pointer;
  }

  .cell-muted {
    color: #7b8ba1;
    font-weight: 650;
  }

  .reference-link {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .reference-link:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }

  .amount-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    min-height: 1.625rem;
    padding: 0.25rem 0.625rem;
    border: 1px solid #dbe4ee;
    border-radius: 999px;
    background: #f8fafc;
    color: #334155;
    font-weight: 750;
    white-space: nowrap;
  }

  .visible-table-actions {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .visible-table-actions :global(.action-btn.icon),
  .visible-table-actions :global(.action-btn.icon:hover:not(:disabled)) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }
</style>
