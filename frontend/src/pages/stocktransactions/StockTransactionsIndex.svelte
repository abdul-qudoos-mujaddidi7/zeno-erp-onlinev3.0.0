<script>
  import { onMount } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';
  ;
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import StockTransactionModal from './StockTransactionModal.svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';
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
</script>
<div class="card mb-4">
  <div class="card-header d-flex align-items-center justify-content-between">
    <div>
      <button class="btn btn-primary" on:click={() => openModal()}>
        <i class="bi bi-plus-lg me-1"></i>{t('stock_transactions.add')}
      </button>
    </div>
    <div class="d-flex gap-2">
      <input class="form-control" placeholder={t('stock_transactions.search')} bind:value={searchQuery} on:input={handleSearchInput} />
      <select class="form-select" bind:value={selectedType} on:change={resetToFirstPage}>
        <option value="">{t('stock_transactions.all_types')}</option>
        {#each transactionTypes as type}
          <option value={type}>{type}</option>
        {/each}
      </select>
      <select class="form-select" bind:value={selectedStatus} on:change={resetToFirstPage}>
        <option value="">{t('All')}</option>
        <option value="1">{t('Active')}</option>
        <option value="0">{t('Deleted')}</option>
      </select>
      <select class="form-select" bind:value={selectedWarehouse} on:change={resetToFirstPage}>
        <option value="">{t('stock_transactions.all_warehouses')}</option>
        {#each warehouses as w}
          <option value={w.id}>{w.name}</option>
        {/each}
      </select>
      <select class="form-select" bind:value={selectedProduct} on:change={resetToFirstPage}>
        <option value="">{t('stock_transactions.all_products')}</option>
        {#each products as p}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
  </div>
  {#if loading}
    <div class="p-4 text-center">{t('stock_transactions.loading')}</div>
  {:else}
    <div class="card-body p-0">
      <div class="table-responsive">
        <table class="table table-hover table-sm align-middle">
          <thead class="table-light">
            <tr>
              <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                {t('ID')}
                {#if isSorted('id')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('date')}>
                {t('stock_transactions.date')}
                {#if isSorted('date')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('transaction_type')}>
                {t('stock_transactions.type')}
                {#if isSorted('transaction_type')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('reference_id')}>
                {t('stock_transactions.reference_id')}
                {#if isSorted('reference_id')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th>{t('stock_transactions.warehouse')}</th>
              <th>{t('stock_transactions.product')}</th>
              <th class="cursor-pointer" on:click={() => setSort('quantity')}>
                {t('In')}
                {#if isSorted('quantity')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('quantity')}>
                {t('Out')}
                {#if isSorted('quantity')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('unit_cost')}>
                {t('stock_transactions.unit_cost')}
                {#if isSorted('unit_cost')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th class="cursor-pointer" on:click={() => setSort('total_cost')}>
                {t('stock_transactions.total_cost')}
                {#if isSorted('total_cost')}<i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>{/if}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each transactions as tx (tx.id)}
              <tr>
                <td>{tx.id}</td>
                <td>{tx.date}</td>
                <td>{t(tx.transaction_type)}</td>
                <td>{tx.reference_id}</td>
                <td>{warehouses.find((w) => w.id == tx.warehouse_id)?.name}</td>
                <td>{products.find((p) => p.id == tx.product_id)?.name}</td>
                <td>
                  {tx.transaction_type === 'purchase' ||
                  tx.transaction_type === 'sale_return' ||
                  tx.transaction_type === 'adjustment_in' ||
                  tx.transaction_type === 'transfer_in' ||
                  tx.transaction_type === 'production_out'
                    ? tx.quantity
                    : ''}
                  {units.find((u) => u.id == tx.product_unit_id)?.name}
                </td>
                <td>
                  {tx.transaction_type === 'sale' ||
                  tx.transaction_type === 'purchase_return' ||
                  tx.transaction_type === 'adjustment_out' ||
                  tx.transaction_type === 'transfer_out' ||
                  tx.transaction_type === 'waste' ||
                  tx.transaction_type === 'production_in'
                    ? tx.quantity
                    : ''}
                  {units.find((u) => u.id == tx.product_unit_id)?.name}
                </td>
                <td>{Number(tx.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(tx.currency)}</td>
                <td>{Number(tx.total_cost).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(tx.currency)}</td>
                <td>
                  <button class="btn btn-sm btn-outline-primary me-1" aria-label="Edit" title="Edit" on:click={() => openModal(tx)}>
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" aria-label="Delete" title="Delete" on:click={() => removeTransaction(tx)}>
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
  {#if !loading && totalEntries > 0}
    <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3">
      <div class="text-muted small">
        {t('Showing')}
        {(currentPage - 1) * itemsPerPage + 1}
        {t('to')}
        {Math.min(currentPage * itemsPerPage, totalEntries)}
        {t('of')}
        {totalEntries}
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
<StockTransactionModal bind:this={modalRef} {warehouses} {products} {productUnits} on:saved={loadTransactions} />
