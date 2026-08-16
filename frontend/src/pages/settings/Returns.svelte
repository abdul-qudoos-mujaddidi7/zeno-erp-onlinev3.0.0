<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { showDate } from '../../calendar.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { generatePDF, generatingPDF } from '../generatePDF.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import { returnsApi } from '../../api/returnsApi.js';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';

  export let account_id = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let items = [];
  let loading = true;
  let searchTerm = '';
  let filterType = 'all';
  let fromDate = '';
  let toDate = '';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let totalPages = 1;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let showReturnStats = false;
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;

    try {
      const response = await returnsApi.getItems({
        return_type: filterType === 'all' ? 'all' : filterType,
        account_id: account_id || undefined,
        search: searchTerm.trim(),
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        page: currentPage,
        limit: itemsPerPage,
        skip_count: 1,
      });

      if (requestId !== loadRequestId) return;

      items = response?.data || [];
      const hasMore = Boolean(response?.meta?.hasMore);
      totalPages = hasMore
        ? Math.max(currentPage + 1, currentPage)
        : Math.max(currentPage, items.length ? currentPage : 1);
    } catch (error) {
      console.error('Failed to load returns:', error);
      items = [];
      totalPages = 1;
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

  function openDocument(item) {
    const id = item.document_id;
    if (!id) return;
    push(item.sale_return_id ? `/dashboard/sales/${id}` : `/dashboard/purchases/${id}`);
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getPageNumbers(current, total) {
    const pages = [];
    const compact = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - 2 && page <= current + 2)) pages.push(page);
    }

    for (const page of pages) {
      if (previous && page - previous > 1) compact.push(page - previous === 2 ? previous + 1 : '...');
      compact.push(page);
      previous = page;
    }
    return compact;
  }

  $: paginatedReturns = (() => {
    const result = [...items];
    result.sort((a, b) => {
      let left = sortColumn === 'product_id' ? a.product_name : a[sortColumn];
      let right = sortColumn === 'product_id' ? b.product_name : b[sortColumn];

      if (['unit_price', 'quantity', 'subtotal', 'id'].includes(sortColumn)) {
        left = Number(left) || 0;
        right = Number(right) || 0;
      } else {
        left = String(left ?? '').toLowerCase();
        right = String(right ?? '').toLowerCase();
      }
      if (left === right) return 0;
      const outcome = left < right ? -1 : 1;
      return sortDirection === 'asc' ? outcome : -outcome;
    });
    return result;
  })();

  $: pageTotalAmount = paginatedReturns.reduce((totals, item) => {
    const currency = item.currency || '';
    totals[currency] = (totals[currency] || 0) + Number(item.subtotal || 0);
    return totals;
  }, {});

  $: pageSaleCount = paginatedReturns.filter((item) => item.sale_return_id).length;
  $: pagePurchaseCount = paginatedReturns.filter((item) => item.purchase_return_id).length;

  $: totalAmountHtml =
    Object.entries(pageTotalAmount)
      .map(
        ([currency, amount]) =>
          `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t(currency || '')}`,
      )
      .join(' · ') || `0 ${t('Returns')}`;

  $: toolbarFilters = [
    {
      key: 'type',
      label: t('Return Type'),
      icon: 'bi-arrow-left-right',
      value: filterType,
      options: [
        { value: 'all', label: t('All Returns') },
        { value: 'sale', label: t('Sale Returns') },
        { value: 'purchase', label: t('Purchase Returns') },
      ],
    },
    { key: 'fromDate', label: t('From Date'), type: 'date', value: fromDate },
    { key: 'toDate', label: t('To Date'), type: 'date', value: toDate },
  ];

  function handleFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterType = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  function resetFilters() {
    filterType = 'all';
    fromDate = '';
    toDate = '';
    searchTerm = '';
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Returns')}
  toolbarWidth="25rem"
  showStats={showReturnStats}
  showFooter={!loading && paginatedReturns.length > 0}
  dense={true}
  contentClass="returns-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      variant="secondary"
      icon="bi-file-pdf-fill"
      label={t('PDF')}
      loading={generatingPDF}
      disabled={loading || paginatedReturns.length === 0 || generatingPDF}
      on:click={() =>
        generatePDF(
          'sales',
          paginatedReturns,
          fromDate,
          toDate,
          paginatedReturns.length,
          pageTotalAmount,
        )} />

    <button
      type="button"
      class="index-settings-button"
      class:is-active={showReturnStats}
      aria-label={t('Summary')}
      aria-expanded={showReturnStats}
      title={t('Summary')}
      on:click={() => (showReturnStats = !showReturnStats)}>
      <i class="bi {showReturnStats ? 'bi-x-lg' : 'bi-arrow-return-left'}" aria-hidden="true"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={t('Search returns...')}
      filters={toolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        scheduleSearchReload();
      }}
      on:filterChange={handleFilterChange}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid">
      <SummaryCard label={t('Sale Returns')} icon="bi-receipt" tone="green" value={String(pageSaleCount)} />
      <SummaryCard label={t('Purchase Returns')} icon="bi-bag-dash" tone="amber" value={String(pagePurchaseCount)} />
      <SummaryCard label={t('Total Returns Amount')} icon="bi-cash-stack" tone="purple" value={totalAmountHtml} />
    </div>
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if paginatedReturns.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-arrow-return-left" message={t('No returns found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Returns')}
      minWidth="900px"
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
          <th class="col-start cursor-pointer" on:click={() => setSort('product_id')}>
            {t('Product')}
            {#if sortColumn === 'product_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Type')}</th>
          <th class="cursor-pointer" on:click={() => setSort('unit_price')}>
            {t('Unit Price')}
            {#if sortColumn === 'unit_price'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('quantity')}>
            {t('Quantity')}
            {#if sortColumn === 'quantity'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('subtotal')}>
            {t('Total')}
            {#if sortColumn === 'subtotal'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedReturns as item, index (`${item.return_type}-${item.id}`)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
          <td>
            <StatusBadge tone="neutral" ghost ltr={true} stacked>
              {@html showDate(item.created_at)}
            </StatusBadge>
          </td>
          <td class="col-start">
            <StatusBadge tone="neutral" ghost>
              {item.product_name || t('Unknown product')}
            </StatusBadge>
          </td>
          <td>
            <StatusBadge tone={item.sale_return_id ? 'info' : 'warning'}>
              {item.sale_return_id ? t('Sale Return') : t('Purchase Return')}
            </StatusBadge>
          </td>
          <td>
            <span class="amount-pill">
              <span dir="ltr">
                {Number(item.unit_price || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              </span>
              {t(item.currency)}
            </span>
          </td>
          <td>
            <StatusBadge tone="neutral" ltr={true}>
              {Number(item.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              {item.product_unit_name || ''}
            </StatusBadge>
          </td>
          <td>
            <span class="amount-pill amount-pill--strong">
              <span dir="ltr">
                {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
              </span>
              {t(item.currency)}
            </span>
          </td>
          <td>
            <button type="button" class="return-link" on:click={() => openDocument(item)}>
              {t('View')}
            </button>
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
      totalItems={null}
      ariaLabel={t('Returns pagination')}
      rowLabel={t('rows')}
      perPageOptions={PAGE_SIZE_OPTIONS}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<style>
  .returns-index-content {
    min-width: 0;
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .sort-icon {
    margin-inline-start: 0.2rem;
    font-size: 0.75rem;
  }

  .cell-muted {
    color: #6b7280;
  }

  .amount-pill {
    display: inline-flex;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .amount-pill--strong {
    font-weight: 600;
  }

  .return-link {
    border: 0;
    background: transparent;
    color: #0d6efd;
    cursor: pointer;
    padding: 0;
  }

  .return-link:hover {
    text-decoration: underline;
  }
</style>
