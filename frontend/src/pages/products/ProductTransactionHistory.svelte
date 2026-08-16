<script>
  import { onMount } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';
import { settingsApi } from '../../api/settingsApi.js';
  import { push } from 'svelte-spa-router';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import { purchaseApi } from '../../api/purchaseApi.js';
  import { saleApi } from '../../api/saleApi.js';
  import { t } from '../../i18n/i18n';
   import { showDate} from '../../calendar.js';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  /** @type {'buy' | 'sale'} */
  export let kind = 'buy';
  export let productId = null;
  export let productIds = [];

  let rows = [];
  let units = [];
  let enable_expiry_date = false;
  let loading = true;
  let searchTerm = '';
  let filterStatus = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'date';
  let sortDirection = 'desc';
  let showHistoryStats = false;

  $: isBuy = kind === 'buy';
  $: config = isBuy
    ? {
        title: t('Purchases for this product'),
        searchPlaceholder: t('Search purchases...'),
        docLabel: t('Bill #'),
        dateLabel: t('Bill Date'),
        viewRoute: (id) => `/dashboard/purchases/${id}`,
        emptyIcon: 'bi-bag',
      }
    : {
        title: t('Sales for this product'),
        searchPlaceholder: t('Search sales...'),
        docLabel: t('Invoice #'),
        dateLabel: t('Invoice Date'),
        viewRoute: (id) => `/dashboard/sales/${id}`,
        emptyIcon: 'bi-cart',
      };

  $: toolbarFilters = [
    {
      key: 'status',
      label: t('Status'),
      icon: 'bi-check-circle',
      value: filterStatus,
      options: [
        { value: 'all', label: t('All') },
        { value: 'confirmed', label: t('confirmed') },
        { value: 'draft', label: t('Draft') },
      ],
    },
  ];

  onMount(async () => {
    if (!getSelectedProductIds().length) {
      loading = false;
      return;
    }

    if (isBuy) {
      enable_expiry_date =
        ((await settingsApi.getAll({ status: 1, key: 'enable_expiry_date' }))?.data?.[0])?.value == 1;
    }

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    await loadRows();
    loading = false;
  });

  async function loadRows() {
    const selectedProductIds = getSelectedProductIds();
    if (!selectedProductIds.length) return;

    const referenceType = isBuy ? 'purchase' : 'sale';
    const response = await stockTransactionApi.getAll({
      product_ids: selectedProductIds,
      reference_type: referenceType,
      status: 1,
    });
    const movements = (response?.data || []).filter(
      (m) => m.transaction_type === referenceType,
    );

    const headerMap = await loadDocumentHeaders(movements, referenceType);

    rows = movements
      .map((m) => {
        const header = headerMap[m.reference_id] || {};
        if (isBuy) {
          return {
            id: m.reference_id,
            doc_number: header.bill_number || '',
            date: m.date || header.bill_date || header.created_at || '',
            quantity: m.quantity,
            unit_price: m.unit_cost,
            sell_price: m.peer_price,
            sell_currency: m.peer_currency,
            subtotal: m.total_cost,
            expiry_date: m.expiry_date,
            product_unit_id: m.product_unit_id,
            currency: m.currency || header.currency || '',
            status: header.bill_status || header.status || 'confirmed',
          };
        }
        return {
          id: m.reference_id,
          doc_number: header.invoice_number || '',
          date: m.date || header.invoice_date || header.created_at || '',
          quantity: m.quantity,
          unit_price: m.peer_price,
          subtotal: m.total_cost,
          product_unit_id: m.product_unit_id,
          currency: m.currency || header.currency || '',
          status: header.invoice_status || header.status || 'confirmed',
        };
      })
      .sort((a, b) => ((b.date || '') > (a.date || '') ? 1 : -1));
  }

  async function loadDocumentHeaders(movements, referenceType) {
    const headerMap = {};
    const refIds = [...new Set(movements.map((m) => m.reference_id).filter(Boolean))];
    for (let i = 0; i < refIds.length; i += 20) {
      const chunk = refIds.slice(i, i + 20);
      const results = await Promise.all(
        chunk.map((id) =>
          referenceType === 'purchase'
            ? purchaseApi.getById(id).catch(() => null)
            : saleApi.getById(id).catch(() => null),
        ),
      );
      chunk.forEach((id, idx) => {
        const header = results[idx]?.data || results[idx];
        if (header) headerMap[id] = header;
      });
    }
    return headerMap;
  }

  function getSelectedProductIds() {
    const ids = Array.isArray(productIds) && productIds.length ? productIds : [productId];
    return ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  }

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - delta && page <= current + delta)) {
        range.push(page);
      }
    }

    for (const page of range) {
      if (previous) {
        if (page - previous === 2) rangeWithDots.push(previous + 1);
        else if (page - previous !== 1) rangeWithDots.push('...');
      }
      rangeWithDots.push(page);
      previous = page;
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

  function handleToolbarFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterStatus = 'all';
    currentPage = 1;
  }

  function unitName(id) {
    return units.find((unit) => unit.id === id)?.name || id || '';
  }

  function formatAmount(value) {
    if (value == null || value === '') return '-';
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function statusTone(status) {
    if (status === 'confirmed' || status === 1 || status === '1') return 'positive';
    if (status === 'cancelled') return 'negative';
    if (status === 'draft') return 'warning';
    return 'neutral';
  }

  function statusLabel(status) {
    if (status === 1 || status === '1') return t('confirmed');
    return status ? t(status) : '-';
  }

  $: filteredRows = (() => {
    let result = rows.slice();

    if (filterStatus !== 'all') {
      result = result.filter((row) => row.status === filterStatus);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (row) =>
          (row.doc_number && String(row.doc_number).toLowerCase().includes(term)) ||
          (row.id && String(row.id).includes(term)),
      );
    }

    result = result.sort((a, b) => {
      let valueA = a[sortColumn];
      let valueB = b[sortColumn];

      if (sortColumn === 'doc_number') {
        valueA = a.doc_number;
        valueB = b.doc_number;
      }

      if (valueA === undefined || valueA === null) return 1;
      if (valueB === undefined || valueB === null) return -1;
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();
      if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  $: totalPages = Math.ceil(filteredRows.length / itemsPerPage) || 1;
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: if (searchTerm || filterStatus) currentPage = 1;

  $: stats = {
    total: rows.length,
    confirmed: rows.filter((row) => row.status === 'confirmed' || row.status === 1 || row.status === '1').length,
    draft: rows.filter((row) => row.status === 'draft').length,
    quantity: rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
  };
</script>


  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={config.title}
    toolbarWidth="34rem"
    showStats={showHistoryStats}
    showFooter={!loading && filteredRows.length > 0}
    dense={true}
   
    tablePadding={false}>
    <svelte:fragment slot="actions">
      <button
        type="button"
        class="index-settings-button"
        class:is-active={showHistoryStats}
        aria-label={t('Table settings')}
        aria-expanded={showHistoryStats}
        aria-controls="transaction-history-statistics"
        title={t('Statistics')}
        on:click={() => (showHistoryStats = !showHistoryStats)}>
        <i class="bi {showHistoryStats ? 'bi-x-lg' : 'bi-gear'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={config.searchPlaceholder}
        filters={toolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => {
          searchTerm = event.detail;
          currentPage = 1;
        }}
        on:filterChange={handleToolbarFilterChange}
        on:reset={resetFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div id="transaction-history-statistics" class="index-summary-grid">
        <SummaryCard label={t('Total')} icon="bi-receipt" tone="cyan">
          {stats.total.toLocaleString()}
        </SummaryCard>

        <SummaryCard label={t('confirmed')} icon="bi-check-circle" tone="green">
          {stats.confirmed.toLocaleString()}
        </SummaryCard>

        <SummaryCard label={t('Draft')} icon="bi-file-earmark" tone="amber">
          {stats.draft.toLocaleString()}
        </SummaryCard>

        <SummaryCard label={t('Quantity')} icon="bi-boxes" tone="blue">
          <span dir="ltr">{stats.quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
        </SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if filteredRows.length === 0}
      <div class="index-table-state">
        <EmptyState icon={config.emptyIcon} message={t('No transactions found.')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={config.title}
        minWidth="900px"
        dense={true}
        striped={true}
        hover={false}
        stickyHeader={true}
        layout="fixed"
        scrollbar="thin"
        clipCells={false}>
        <svelte:fragment slot="head">
          <tr>
            <th class="col-start cursor-pointer" on:click={() => setSort('id')}>
              <span class="sortable-heading">
                {t('#')}
                {#if sortColumn === 'id'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </span>
            </th>

            <th class="cursor-pointer" on:click={() => setSort('doc_number')}>
              <span class="sortable-heading">
                {config.docLabel}
                {#if sortColumn === 'doc_number'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </span>
            </th>

            <th class="cursor-pointer" on:click={() => setSort('date')}>
              <span class="sortable-heading">
                {config.dateLabel}
                {#if sortColumn === 'date'}
                  <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                {/if}
              </span>
            </th>

            {#if isBuy && enable_expiry_date}
              <th>{t('Expiry Date')}</th>
            {/if}

            <th class="col-start">{t('Quantity')}</th>

            {#if isBuy}
              <th class="col-start">{t('Buy Price')}</th>
            {/if}

            <th class="col-start">{t('Sell Price')}</th>
            <th class="col-start">{t('Total')}</th>
            <th>{t('Status')}</th>
            <th>{t('Actions')}</th>
          </tr>
        </svelte:fragment>

        {#each paginatedRows as row, index}
          <tr>
       
              <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
            

            <td>
              <button type="button" class="document-link" on:click={() => push(config.viewRoute(row.id))}>
                {row.doc_number || '-'}
              </button>
            </td>

          
            <td>
                  <StatusBadge tone="neutral" ghost ltr={true} stacked>
                    {@html showDate(row.date || row.created_at)}
                  </StatusBadge>
                </td>

            {#if isBuy && enable_expiry_date}
              <td>
                <StatusBadge tone="neutral" ghost={true} ltr={true}>
                  {row.expiry_date || '-'}
                </StatusBadge>
              </td>
            {/if}

            <td class="col-start">
              <StatusBadge tone="neutral">
                <span dir="ltr">{Number(row.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{unitName(row.product_unit_id)}</span>
              </StatusBadge>
            </td>

            {#if isBuy}
              <td class="col-start">
                <StatusBadge tone="info">
                  <span dir="ltr">{formatAmount(row.unit_price)}</span>
                  {#if row.unit_price != null && row.unit_price !== ''}<span>{t(row.currency || '')}</span>{/if}
                </StatusBadge>
              </td>
            {/if}

            <td class="col-start">
              <StatusBadge tone="positive">
                <span dir="ltr">{formatAmount(isBuy ? row.sell_price : row.unit_price)}</span>
                {#if (isBuy ? row.sell_price : row.unit_price) != null && (isBuy ? row.sell_price : row.unit_price) !== ''}
                  <span>{t(isBuy ? row.sell_currency || row.currency : row.currency)}</span>
                {/if}
              </StatusBadge>
            </td>

            <td class="col-start">
              <StatusBadge tone="info">
                <span dir="ltr">{formatAmount(row.subtotal)}</span>
                {#if row.subtotal != null && row.subtotal !== ''}<span>{t(row.currency || '')}</span>{/if}
              </StatusBadge>
            </td>

            <td>
              <StatusBadge tone={statusTone(row.status)}>
                {statusLabel(row.status)}
              </StatusBadge>
            </td>

            <td>
              <TableActions
                actions={[
                  {
                    icon: 'bi-eye',
                    label: t('View'),
                    tone: 'view',
                    onClick: () => push(config.viewRoute(row.id)),
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
        totalItems={filteredRows.length}
        {getPageNumbers}
        ariaLabel={config.title}
        perPageOptions={[5, 10, 20, 50]}
        perPageSuffix={t('per page')}
        on:perPageChange={(event) => {
          itemsPerPage = Number(event.detail);
          currentPage = 1;
        }} />
    </svelte:fragment>
  </IndexPageLayout>


<style>
 

  .cursor-pointer {
    cursor: pointer;
    user-select: none;
  }

  .sortable-heading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3125rem;
  }

  .sort-icon {
    color: #0f6efd;
    font-size: 0.75rem;
  }

  .document-link {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #0f6efd;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .document-link:hover,
  .document-link:focus-visible {
    color: #0b57c7;
    text-decoration: underline;
  }

  @media (max-width: 767.98px) {
    .history-index {
      --index-table-max-height: 32rem;
    }
  }
</style>
