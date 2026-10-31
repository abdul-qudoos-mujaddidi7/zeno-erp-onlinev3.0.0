<script>
  import { onMount } from 'svelte';
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import StockTransactionModal from './StockTransactionModal.svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let transactions = [];
  let loading = true;
  let modalRef;
  let searchQuery = '';
  let selectedType = '';
  let selectedWarehouse = '';
  let selectedProduct = '';
  let selectedStatus = '';
  let warehouses = [];
  let products = [];
  let units = [];
  let productUnits = [];
  let transactionTypes = [
    'purchase',
    'sale',
    'purchase_return',
    'sale_return',
    'waste',
    'adjustment_in',
    'adjustment_out',
    'transfer_in',
    'transfer_out',
    'production_in',
    'production_out',
  ];
  let referenceTypes = [
    'purchase',
    'sale',
    'purchase_return',
    'sale_return',
    'waste',
    'manual_adjustment',
    'stock_transfer',
    'production',
  ];

  /*
   * The list is paged, filtered and sorted by the server.
   *
   * This page used to download every movement of the organisation and do all
   * three in the browser: for a mid-sized organisation that was tens of
   * megabytes and several seconds before anything could be shown. The
   * response now carries one page plus a `meta` block with the filtered total,
   * which is what the footer reports.
   */
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let totalEntries = 0;
  let totalPages = 0;

  /* Must match the server's whitelist in the stock-transaction validator. */
  const SORTABLE_COLUMNS = [
    'id',
    'date',
    'transaction_type',
    'reference_id',
    'quantity',
    'unit_cost',
    'total_cost',
  ];

  /* The search box waits for a pause in typing instead of a request per key. */
  let searchTerm = '';
  let searchTimer = null;
  let initialised = false;
  let lastKey = null;
  let requestId = 0;

  async function loadWarehouses() {
    warehouses = await Promise.all([
      warehouseApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 0 }),
    ]).then(([active, deleted]) => [
      ...(active?.data || []),
      ...(deleted?.data || []),
    ]);
  }
  async function loadUnits() {
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }
  async function loadProducts() {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
  }
  async function loadProductUnits() {
    productUnits = (await productUnitApi.getAll({ status: 1 }))?.data || [];
  }

  function requestKey() {
    return [
      searchTerm,
      selectedType,
      selectedStatus,
      selectedWarehouse,
      selectedProduct,
      sortColumn,
      sortDirection,
      currentPage,
      itemsPerPage,
    ].join('|');
  }

  async function loadTransactions() {
    const id = ++requestId;
    loading = true;

    try {
      const response = await stockTransactionApi.getAll({
        search: searchTerm || undefined,
        transaction_type: selectedType || undefined,
        status: selectedStatus === '' ? undefined : selectedStatus,
        warehouse_id: selectedWarehouse || undefined,
        product_id: selectedProduct || undefined,
        sort: sortColumn,
        direction: sortDirection,
        page: currentPage,
        limit: itemsPerPage,
      });

      /* A slow earlier request must never overwrite a newer one. */
      if (id !== requestId) return;

      transactions = response?.data || [];
      const meta = readListMeta(response, transactions.length);
      totalEntries = meta.total;
      totalPages = meta.totalPages;

      /*
       * Deleting the last row of the last page leaves us past the end; step
       * back one page, which the request key turns into a fresh load.
       */
      if (totalPages > 0 && currentPage > totalPages) {
        currentPage = totalPages;
        return;
      }
    } catch (error) {
      console.error('Failed to load stock transactions:', error);
      if (id !== requestId) return;
      transactions = [];
      totalEntries = 0;
      totalPages = 0;
    } finally {
      if (id === requestId) loading = false;
    }
  }

  function openModal(transaction = null) {
    modalRef.open(transaction);
  }

  function resetToFirstPage() {
    currentPage = 1;
  }

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = searchQuery.trim();
      resetToFirstPage();
    }, 300);
  }

  onMount(async () => {
    loadWarehouses();
    loadUnits();
    loadProducts();
    loadProductUnits();

    lastKey = requestKey();
    initialised = true;
    await loadTransactions();

    return () => clearTimeout(searchTimer);
  });

  $: if (initialised && requestKey() !== lastKey) {
    lastKey = requestKey();
    loadTransactions();
  }

  function removeTransaction(transaction) {
    confirm(t('Confirm Delete?')) &&
      stockTransactionApi
        .remove(transaction.id)
        .then(loadTransactions)
        .catch((err) => console.error(err));
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
    if (SORTABLE_COLUMNS.indexOf(column) === -1) return;

    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }

    resetToFirstPage();
  }
  function isSorted(column) {
    return sortColumn === column;
  }

  /*
   * Toolbar model. The filters stay controlled by the page's own state so the
   * server keeps owning search, filter, sort and paging.
   */
  $: transactionFilters = [
    {
      key: 'type',
      label: t('stock_transactions.type'),
      icon: 'bi-tag',
      value: selectedType,
      options: [
        { value: '', label: t('stock_transactions.all_types') },
        ...transactionTypes.map((type) => ({ value: type, label: t(type) })),
      ],
    },
    {
      key: 'status',
      label: t('stock_transactions.status'),
      icon: 'bi-activity',
      value: selectedStatus,
      options: [
        { value: '', label: t('All') },
        { value: '1', label: t('Active') },
        { value: '0', label: t('Deleted') },
      ],
    },
    {
      key: 'warehouse',
      label: t('stock_transactions.warehouse'),
      icon: 'bi-building',
      value: selectedWarehouse,
      options: [
        { value: '', label: t('stock_transactions.all_warehouses') },
        ...warehouses.map((w) => ({ value: String(w.id), label: w.name })),
      ],
    },
    {
      key: 'product',
      label: t('stock_transactions.product'),
      icon: 'bi-box-seam',
      value: selectedProduct,
      options: [
        { value: '', label: t('stock_transactions.all_products') },
        ...products.map((p) => ({ value: String(p.id), label: p.name })),
      ],
    },
  ];

  function handleFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'type') selectedType = value;
    if (key === 'status') selectedStatus = value;
    if (key === 'warehouse') selectedWarehouse = value;
    if (key === 'product') selectedProduct = value;
    resetToFirstPage();
  }

  function resetFilters() {
    selectedType = '';
    selectedStatus = '';
    selectedWarehouse = '';
    selectedProduct = '';
    searchQuery = '';
    searchTerm = '';
    resetToFirstPage();
  }
</script>

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Stock Transactions')}
  showFooter={!loading && totalEntries > 0}
  dense={true}
  contained={true}
  contentClass="stock-transactions-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton
      icon="bi-plus-lg"
      label={`+ ${t('stock_transactions.add')}`}
      on:click={() => openModal()} />
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchQuery}
      searchPlaceholder={t('stock_transactions.search')}
      filters={transactionFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchQuery = event.detail;
        handleSearchInput();
      }}
      on:filterChange={handleFilterChange}
      on:reset={resetFilters} />
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('stock_transactions.loading')} />
    </div>
  {:else if transactions.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-box-arrow-in-down" message={t('No transactions found.')} />
    </div>
  {:else}
    <DataTable ariaLabel={t('Stock Transactions')} minWidth="980px" striped={false} hover={true}>
      <svelte:fragment slot="head">
        <tr>
          <th class="cursor-pointer" on:click={() => setSort('id')}>
            {t('ID')}
            {#if isSorted('id')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('date')}>
            {t('stock_transactions.date')}
            {#if isSorted('date')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('transaction_type')}>
            {t('stock_transactions.type')}
            {#if isSorted('transaction_type')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('reference_id')}>
            {t('stock_transactions.reference_id')}
            {#if isSorted('reference_id')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th>{t('stock_transactions.warehouse')}</th>
          <th>{t('stock_transactions.product')}</th>
          <th class="col-end cursor-pointer" on:click={() => setSort('quantity')}>
            {t('In')}
            {#if isSorted('quantity')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="col-end cursor-pointer" on:click={() => setSort('quantity')}>
            {t('Out')}
            {#if isSorted('quantity')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="col-end cursor-pointer" on:click={() => setSort('unit_cost')}>
            {t('stock_transactions.unit_cost')}
            {#if isSorted('unit_cost')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="col-end cursor-pointer" on:click={() => setSort('total_cost')}>
            {t('stock_transactions.total_cost')}
            {#if isSorted('total_cost')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>{/if}
          </th>
          <th class="col-end">{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each transactions as tx (tx.id)}
        <tr>
          <td class="cell-muted">{tx.id}</td>
          <td><span dir="ltr">{tx.date}</span></td>
          <td>
            <StatusBadge tone="neutral">{t(tx.transaction_type)}</StatusBadge>
          </td>
          <td>{tx.reference_id}</td>
          <td>{warehouses.find((w) => w.id == tx.warehouse_id)?.name}</td>
          <td>{products.find((p) => p.id == tx.product_id)?.name}</td>
          <td class="col-end">
            {#if tx.transaction_type === 'purchase' ||
              tx.transaction_type === 'sale_return' ||
              tx.transaction_type === 'adjustment_in' ||
              tx.transaction_type === 'transfer_in' ||
              tx.transaction_type === 'production_out'}
              <span dir="ltr">{tx.quantity}</span>
            {/if}
            {units.find((u) => u.id == tx.product_unit_id)?.name}
          </td>
          <td class="col-end">
            {#if tx.transaction_type === 'sale' ||
              tx.transaction_type === 'purchase_return' ||
              tx.transaction_type === 'adjustment_out' ||
              tx.transaction_type === 'transfer_out' ||
              tx.transaction_type === 'waste' ||
              tx.transaction_type === 'production_in'}
              <span dir="ltr">{tx.quantity}</span>
            {/if}
            {units.find((u) => u.id == tx.product_unit_id)?.name}
          </td>
          <td class="col-end">
            <span dir="ltr">
              {Number(tx.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 3 })}
            </span>
            {t(tx.currency)}
          </td>
          <td class="col-end">
            <span dir="ltr">
              {Number(tx.total_cost).toLocaleString(undefined, { maximumFractionDigits: 3 })}
            </span>
            {t(tx.currency)}
          </td>
          <td class="col-end">
            <TableActions
              actions={[
                {
                  icon: 'bi-pencil',
                  label: t('Edit'),
                  tone: 'edit',
                  onClick: () => openModal(tx),
                },
                {
                  icon: 'bi-trash',
                  label: t('Delete'),
                  tone: 'delete',
                  onClick: () => removeTransaction(tx),
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
      totalItems={totalEntries}
      ariaLabel={t('stock_transactions.title')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<StockTransactionModal bind:this={modalRef} {warehouses} {products} {productUnits} on:saved={loadTransactions} />

<style>
  .cursor-pointer {
    cursor: pointer;
  }
</style>
