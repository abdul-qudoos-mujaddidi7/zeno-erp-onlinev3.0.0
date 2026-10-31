<script>
  import { onDestroy, onMount } from 'svelte';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { push } from 'svelte-spa-router';

  import { productApi } from '../../api/productApi.js';
  import { productCategoryApi } from '../../api/productCategoryApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { warehouseProductApi } from '../../api/warehouseProductApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { calculateAllStocks } from '../stocktransactions/calculateStock.js';

  import ActionButton from '../../components/common/ActionButton.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableSkeleton from '../../components/common/TableSkeleton.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import { DEFAULT_PAGE_SIZE } from '../../lib/pagination.js';

  export let selectedWarehouseId = null;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let loading = true;
  let referenceDataReady = false;
  let calculatingStock = false;
  let showWarehouseStats = false;
  let shiftPressed = false;
  let ctrlPressed = false;
  let loadedWarehouseId = null;

  let warehouseProducts = [];
  let units = [];
  let warehouses = [];
  let products = [];
  let productCategories = [];

  let searchTerm = '';
  let filterCategory = 'all';
  let filterStock = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'updated_at';
  let sortDirection = 'desc';

  let productMap = {};
  let categoryMap = {};
  let unitMap = {};
  let currentWarehouse = null;
  let warehouseToolbarFilters = [];
  let priceSummary = { purchase: {}, sale: {}, quantity: 0 };

  function handleKeyDown(event) {
    if (event.key === 'Shift') shiftPressed = true;
    if (event.key === 'Control') ctrlPressed = true;
  }

  function handleKeyUp(event) {
    if (event.key === 'Shift') shiftPressed = false;
    if (event.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  async function loadReferenceData() {
    try {
      [units, warehouses, products, productCategories] = await Promise.all([
        productUnitApi.getAll({ status: 1 }).then((r) => r?.data || []),
        Promise.all([
          warehouseApi.getAll({ status: 1 }),
          warehouseApi.getAll({ status: 0 }),
        ]).then(([active, deleted]) => [
          ...(active?.data || []),
          ...(deleted?.data || []),
        ]),
        productApi.getAll({ status: 1 }).then((r) => r?.data || []),
        productCategoryApi.getAll({ status: 1 }).then((r) => r?.data || []),
      ]);
    } catch (error) {
      console.error('Failed to load warehouse reference data:', error);
    }
  }

  async function loadWarehouseProducts(warehouseId) {
    loading = true;
    try {
      warehouseProducts = (await warehouseProductApi.getAll({
        warehouse_id: Number(warehouseId),
        status: 1,
      }))?.data || [];
    } catch (error) {
      console.error('Failed to load warehouse products:', error);
      warehouseProducts = [];
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    await loadReferenceData();
    referenceDataReady = true;

    if (selectedWarehouseId == null) {
      loading = false;
    }
  });

  $: if (
    referenceDataReady &&
    selectedWarehouseId != null &&
    Number(selectedWarehouseId) !== loadedWarehouseId
  ) {
    loadedWarehouseId = Number(selectedWarehouseId);
    loadWarehouseProducts(loadedWarehouseId);
  }

  $: productMap = Object.fromEntries(products.map((product) => [product.id, product]));
  $: categoryMap = Object.fromEntries(productCategories.map((category) => [category.id, category]));
  $: unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));
  $: currentWarehouse =
    warehouses.find((warehouse) => Number(warehouse.id) === Number(selectedWarehouseId)) || null;

  function getLocalizedName(item, fallback = '') {
    if (!item) return fallback;
    if (t('Lang') === 'fa') return item.name_fa || item.name || fallback;
    if (t('Lang') === 'ps') return item.name_ps || item.name || fallback;
    return item.name || fallback;
  }

  function buildPriceSummary(rows) {
    const purchase = {};
    const sale = {};
    let quantity = 0;

    rows.forEach((warehouseProduct) => {
      const product = productMap[warehouseProduct.product_id];
      if (!product) return;

      const productQuantity = Number(warehouseProduct.quantity) || 0;
      const purchaseCurrency = product.buy_currency?.trim() || '';
      const saleCurrency = product.sell_currency?.trim() || '';

      purchase[purchaseCurrency] =
        (purchase[purchaseCurrency] || 0) + (Number(product.buy_price) || 0) * productQuantity;
      sale[saleCurrency] =
        (sale[saleCurrency] || 0) + (Number(product.sell_price) || 0) * productQuantity;
      quantity += productQuantity;
    });

    return { purchase, sale, quantity };
  }

  $: filteredProducts = (() => {
    let result = warehouseProducts.filter((warehouseProduct) => {
      return Number(warehouseProduct.quantity) !== 0 && Boolean(productMap[warehouseProduct.product_id]);
    });

    if (filterCategory !== 'all') {
      result = result.filter((warehouseProduct) => {
        return (
          Number(productMap[warehouseProduct.product_id]?.category_id) === Number(filterCategory)
        );
      });
    }

    if (filterStock === 'positive') {
      result = result.filter((warehouseProduct) => Number(warehouseProduct.quantity) > 0);
    } else if (filterStock === 'negative') {
      result = result.filter((warehouseProduct) => Number(warehouseProduct.quantity) < 0);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter((warehouseProduct) => {
        const product = productMap[warehouseProduct.product_id];
        const category = categoryMap[product?.category_id];
        return (
          getLocalizedName(product).toLowerCase().includes(term) ||
          product?.code?.toLowerCase().includes(term) ||
          getLocalizedName(category).toLowerCase().includes(term)
        );
      });
    }

    return [...result].sort((a, b) => {
      let valueA;
      let valueB;

      if (sortColumn === 'name') {
        valueA = getLocalizedName(productMap[a.product_id]);
        valueB = getLocalizedName(productMap[b.product_id]);
      } else if (sortColumn === 'category') {
        valueA = getLocalizedName(categoryMap[productMap[a.product_id]?.category_id]);
        valueB = getLocalizedName(categoryMap[productMap[b.product_id]?.category_id]);
      } else {
        valueA = a[sortColumn];
        valueB = b[sortColumn];
      }

      if (valueA == null) return 1;
      if (valueB == null) return -1;
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();

      if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  })();

  $: priceSummary = buildPriceSummary(filteredProducts);

  $: paginatedProducts = (() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredProducts.slice(start, start + itemsPerPage);
  })();

  $: totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  $: if (totalPages > 0 && currentPage > totalPages) currentPage = totalPages;

  $: {
    _lang;
    warehouseToolbarFilters = [
      {
        key: 'category',
        label: t('Category'),
        icon: 'bi-tags',
        value: filterCategory,
        options: [
          { value: 'all', label: t('All') },
          ...productCategories.map((category) => ({
            value: category.id,
            label: getLocalizedName(category),
          })),
        ],
      },
      {
        key: 'stock',
        label: t('Stock Status'),
        icon: 'bi-box-seam',
        value: filterStock,
        options: [
          { value: 'all', label: t('All') },
          { value: 'positive', label: t('In Stock') },
          { value: 'negative', label: t('Negative Stock') },
        ],
      },
    ];
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function handleFilterChange(event) {
    if (event.detail.key === 'category') filterCategory = event.detail.value;
    if (event.detail.key === 'stock') filterStock = event.detail.value;
    currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterCategory = 'all';
    filterStock = 'all';
    currentPage = 1;
  }

  function getPageNumbers(current, total) {
    const range = [];
    const pages = [];
    const delta = 2;
    let previous;

    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || (page >= current - delta && page <= current + delta)) {
        range.push(page);
      }
    }

    range.forEach((page) => {
      if (previous) {
        if (page - previous === 2) pages.push(previous + 1);
        else if (page - previous !== 1) pages.push('...');
      }
      pages.push(page);
      previous = page;
    });

    return pages;
  }

  function formatNumber(value, minimumFractionDigits = 0) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits,
      maximumFractionDigits: 3,
    });
  }

  function formatUpdatedDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  async function recalculateStock() {
    if (
      !window.confirm(
        t('Are you sure you want to recalculate stock for all products? This may take a while.'),
      )
    ) {
      return;
    }

    calculatingStock = true;
    try {
      await calculateAllStocks();
      await loadReferenceData();
      await loadWarehouseProducts(Number(selectedWarehouseId));
    } finally {
      calculatingStock = false;
    }
  }
</script>

<div class="warehouse-view-page">
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Warehouse Products')}
    showStats={showWarehouseStats && selectedWarehouseId != null && !loading}
    showExtra={(shiftPressed && ctrlPressed) || calculatingStock}
    showFooter={selectedWarehouseId != null && !loading && filteredProducts.length > 0}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showWarehouseStats}
        aria-label={t('Statistics')}
        aria-expanded={showWarehouseStats}
        aria-controls="warehouse-statistics-panel"
        title={t('Statistics')}
        on:click={() => (showWarehouseStats = !showWarehouseStats)}>
        <i class="bi {showWarehouseStats ? 'bi-x-lg' : 'bi-box-seam'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search products...')}
        filters={warehouseToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => {
          searchTerm = event.detail;
          currentPage = 1;
        }}
        on:filterChange={handleFilterChange}
        on:reset={resetFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div id="warehouse-statistics-panel" class="index-summary-grid warehouse-summary-grid">
        <SummaryCard
          label={t('Total Products')}
          value={filteredProducts.length.toLocaleString()}
          icon="bi-box-seam"
          tone="blue" />

        <SummaryCard
          label={t('Total Quantity')}
          value={formatNumber(priceSummary.quantity)}
          icon="bi-boxes"
          tone="green" />

        <SummaryCard label={t('Total Purchase Rate')} icon="bi-bag-check" tone="amber">
          <div class="warehouse-currency-values">
            {#each Object.entries(priceSummary.purchase) as [currency, value] (currency)}
              <span><b dir="ltr">{formatNumber(value, 2)}</b> {t(currency)}</span>
            {:else}
              <span>—</span>
            {/each}
          </div>
        </SummaryCard>

        <SummaryCard label={t('Total Sale Rate')} icon="bi-shop" tone="cyan">
          <div class="warehouse-currency-values">
            {#each Object.entries(priceSummary.sale) as [currency, value] (currency)}
              <span><b dir="ltr">{formatNumber(value, 2)}</b> {t(currency)}</span>
            {:else}
              <span>—</span>
            {/each}
          </div>
        </SummaryCard>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="extra">
      <ActionButton
        variant="secondary"
        icon="bi-calculator"
        label={t('Calculate stock')}
        loading={calculatingStock}
        disabled={calculatingStock}
        on:click={recalculateStock} />
    </svelte:fragment>

    {#if selectedWarehouseId == null}
      <div class="warehouse-table-state">
        <EmptyState icon="bi-building" message={t('Select a warehouse to view its products.')} />
      </div>
    {:else if loading}
      <TableSkeleton ariaLabel={t('Loading...')} colCount={5} minWidth="760px" />
    {:else if filteredProducts.length === 0}
      <div class="warehouse-table-state">
        <EmptyState icon="bi-inbox" message={t('No products found.')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Warehouse Products')}
        minWidth="760px"
        dense={true}
        striped={true}
        hover={false}
        stickyHeader={true}
        layout="fixed"
        scrollbar="thin">
        <svelte:fragment slot="head">
          <tr>
            <th class="warehouse-col-index">{t('#')}</th>
            <th class="cursor-pointer warehouse-col-product" on:click={() => setSort('name')}>
              {t('Product')}
              {#if sortColumn === 'name'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
            <th class="cursor-pointer warehouse-col-category" on:click={() => setSort('category')}>
              {t('Category')}
              {#if sortColumn === 'category'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
            <th class="cursor-pointer warehouse-col-quantity" on:click={() => setSort('quantity')}>
              {t('Quantity')}
              {#if sortColumn === 'quantity'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
            <th class="cursor-pointer warehouse-col-updated" on:click={() => setSort('updated_at')}>
              {t('Updated Date')}
              {#if sortColumn === 'updated_at'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
          </tr>
        </svelte:fragment>

        {#each paginatedProducts as warehouseProduct, index (warehouseProduct.id)}
          <tr>
            <td class="warehouse-col-index cell-muted">
              {(currentPage - 1) * itemsPerPage + index + 1}
            </td>
            <td class="warehouse-col-product">
              <button
                type="button"
                class="warehouse-product-link"
                title={getLocalizedName(productMap[warehouseProduct.product_id], t('Unknown Product'))}
                on:click={() => push(`/dashboard/product/${warehouseProduct.product_id}`)}>
                <span>
                  {getLocalizedName(productMap[warehouseProduct.product_id], t('Unknown Product'))}
                </span>
                {#if productMap[warehouseProduct.product_id]?.code}
                  <small dir="ltr">{productMap[warehouseProduct.product_id].code}</small>
                {/if}
              </button>
            </td>
            <td class="warehouse-col-category">
              <StatusBadge tone="neutral" ghost>
                {getLocalizedName(
                  categoryMap[productMap[warehouseProduct.product_id]?.category_id],
                  t('Unknown Category'),
                )}
              </StatusBadge>
            </td>
            <td class="warehouse-col-quantity">
              <StatusBadge tone={Number(warehouseProduct.quantity) > 0 ? 'positive' : 'negative'} ltr={true}>
                {formatNumber(warehouseProduct.quantity)}
                {getLocalizedName(unitMap[warehouseProduct.product_unit_id], t('Unknown Unit'))}
              </StatusBadge>
            </td>
            <td class="warehouse-col-updated">
              <span class="warehouse-updated-date" dir="ltr">
                {formatUpdatedDate(warehouseProduct.updated_at)}
              </span>
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
        totalItems={filteredProducts.length}
        ariaLabel={t('Warehouse Products')}
        rowLabel={t('rows')}
        on:perPageChange={(event) => {
          itemsPerPage = Number(event.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<style>
  .warehouse-view-page {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .warehouse-heading {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
    max-width: min(21rem, 40vw);
  }

  .warehouse-heading__icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 2.4rem;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 0.5rem;
    background: #ecfdf5;
    color: #059669;
    font-size: 1rem;
  }

  .warehouse-heading__copy {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  .warehouse-heading__copy small {
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .warehouse-heading__copy strong {
    overflow: hidden;
    color: #0f172a;
    font-size: 0.9rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.dark) .warehouse-heading__icon {
    background: rgba(52, 211, 153, 0.13);
    color: #6ee7b7;
  }

  :global(html.dark) .warehouse-heading__copy small {
    color: var(--erp-muted);
  }

  :global(html.dark) .warehouse-heading__copy strong {
    color: var(--erp-text);
  }

  .warehouse-summary-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .warehouse-currency-values {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  .warehouse-currency-values span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warehouse-currency-values b {
    font-weight: 800;
  }

  .warehouse-table-state {
    display: grid;
    flex: 1 1 auto;
    min-height: 12rem;
    place-items: center;
  }

  .cursor-pointer {
    cursor: pointer;
    user-select: none;
  }

  .sort-icon {
    margin-inline-start: 0.25rem;
    color: #0f6efd;
    font-size: 0.68rem;
  }

  .warehouse-col-index {
    width: 4rem;
  }

  .warehouse-col-product {
    width: 30%;
  }

  .warehouse-col-category {
    width: 22%;
  }

  .warehouse-col-quantity {
    width: 22%;
  }

  .warehouse-col-updated {
    width: 26%;
  }

  .cell-muted {
    color: #94a3b8;
  }

  .warehouse-product-link {
    display: inline-grid;
    gap: 0.08rem;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .warehouse-product-link span,
  .warehouse-product-link small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warehouse-product-link small {
    color: #94a3b8;
    font-size: 0.66rem;
    font-weight: 600;
  }

  .warehouse-product-link:hover span {
    text-decoration: underline;
    text-underline-offset: 0.15rem;
  }

  .warehouse-product-link:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  :global(html.dark) .warehouse-product-link {
    color: #60a5fa;
  }

  :global(html.dark) .warehouse-product-link:hover {
    color: #93c5fd;
  }

  :global(html.dark) .warehouse-product-link small,
  :global(html.dark) .cell-muted {
    color: var(--erp-muted);
  }

  .warehouse-updated-date {
    color: #64748b;
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  :global(html.dark) .warehouse-updated-date {
    color: var(--erp-text-soft);
  }

  @media (max-width: 1050px) {
    .warehouse-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .warehouse-heading {
      max-width: 100%;
    }

    .warehouse-summary-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
