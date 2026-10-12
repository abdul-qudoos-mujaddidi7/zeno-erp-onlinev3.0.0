<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, onDestroy, tick } from 'svelte';
  import { push } from 'svelte-spa-router';

  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type, shortID, settings_all } from '../../i18n/i18n.js';
  import { accountApi } from '../../api/accountApi.js';
  import { productApi } from '../../api/productApi.js';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';
  import {
    buildProductReportRows,
  } from './productReportAggregation.js';
  import { oneMonthDateWindow } from './reportDateRange.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let units = [];
  let products = [];
  let items = [];
  let pdfItems = [];

  export let account_id = null;
  /*
   * Account details may show both purchases and sales, while the global
   * Sales page must never include purchase lines. When supplied, this prop
   * fixes every report request (page, summary and export) to that item type.
   */
  export let itemType = null;
  export let selectedCurrency = 'all';
  export let currencies = [];
  let loading = true;
  let exportingReport = false;
  let lookupsLoaded = false;

  let searchTerm = '';
  let filterStatus = 'all';
  let selectedProducts = [];
  let reportView = 'all';
  $: showBills = reportView === 'bills';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let totalPages = 1;
  let fromDate = '';
  let toDate = '';
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function defaultDateWindow() {
    return oneMonthDateWindow();
  }

  function requestedItemType() {
    return itemType || filterStatus;
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  async function loadLookups() {
    if (lookupsLoaded) return;
    const unitsResponse = await productUnitApi.getAll({ status: 1 });
    units = unitsResponse?.data || [];
    lookupsLoaded = true;
  }

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;

    try {
      const lookupsPromise = loadLookups();

      const selectedProductIds = selectedProducts
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0);
      const productSelected = selectedProductIds.length > 0;
      const response = productSelected
        ? (await Promise.all(selectedProductIds.map((productId) => fetchFilteredItems(productId)))).flat()
        : await accountApi.getProductItems(account_id, {
            item_type: requestedItemType(),
            currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
            search: searchTerm.trim(),
            date_from: fromDate || undefined,
            date_to: toDate || undefined,
            page: currentPage,
            limit: itemsPerPage,
            skip_count: 1,
          });

      if (requestId !== loadRequestId) return;

      const responseRows = Array.isArray(response) ? response : response?.data || [];
      items = buildProductReportRows(responseRows, selectedProductIds, { showBills });

      const missingProductIds = [
        ...new Set(
          items
            .filter((row) => !row.product_name && row.product_id)
            .map((row) => Number(row.product_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      ].filter((id) => !products.some((p) => Number(p.id) === id));

      const productPromise = missingProductIds.length
        ? Promise.all(
            missingProductIds.map((id) =>
              productApi.getById(id).then((res) => res?.data).catch(() => null),
            ),
          ).then((fetched) => {
            products = [...products, ...fetched.filter(Boolean)];
          })
        : Promise.resolve();

      await Promise.all([lookupsPromise, productPromise]);

      for (const row of items) {
        if (row.product_name && !products.some((p) => Number(p.id) === Number(row.product_id))) {
          products = [
            ...products,
            {
              id: row.product_id,
              name: row.product_name,
            },
          ];
        }
      }

      const hasMore = productSelected ? false : Boolean(response?.meta?.hasMore);
      totalPages = productSelected && showBills
        ? Math.max(1, Math.ceil(items.length / itemsPerPage))
        : hasMore
        ? Math.max(currentPage + 1, currentPage)
        : Math.max(currentPage, items.length ? currentPage : 1);
    } catch (error) {
      console.error('Failed to load account products report:', error);
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
    const defaultRange = defaultDateWindow();
    fromDate = defaultRange.from;
    toDate = defaultRange.to;
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

  function decorateItem(item) {
    const product = products.find((p) => p.id == item.product_id);
    const unit = units.find((u) => u.id == item.product_unit_id);
    return {
      ...item,
      product_name: product?.name || product?.code || item.product_id,
      product_unit_name: unit?.name || '',
      invoice_text:
        item.source_count > 1
          ? `${item.source_count} ${t('Invoices')}`
          : item.document_number || shortID(item.sale_id || item.purchase_id || item.product_id),
    };
  }

  function sumSubtotals(rows) {
    return rows.reduce((totals, s) => {
      if (!totals[s.currency]) totals[s.currency] = 0;
      totals[s.currency] += Number(s.subtotal) || 0;
      return totals;
    }, {});
  }

  async function fetchFilteredItems(productId = null) {
    const pageSize = 200;
    const all = [];
    let page = 1;

    for (;;) {
      const response = await accountApi.getProductItems(account_id, {
        item_type: requestedItemType(),
        product_id: productId || undefined,
        currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
        search: searchTerm.trim(),
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        page,
        limit: pageSize,
        skip_count: 1,
      });

      const rows = response?.data || [];
      all.push(...rows);
      if (!rows.length || !response?.meta?.hasMore) break;
      page += 1;
    }

    return all;
  }

  /*
   * The table only holds the current page. For PDF/Excel exports,
   * fetch every row that matches the active filters instead.
   */
  async function fetchAllItemsForExport() {
    const selectedProductIds = selectedProducts
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!selectedProductIds.length) return fetchFilteredItems();
    const rows = (await Promise.all(
      selectedProductIds.map((productId) => fetchFilteredItems(productId)),
    )).flat();
    return buildProductReportRows(rows, selectedProductIds, { showBills, forExport: true });
  }

  async function exportProducts(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel'
        ? (await import('../generateExcel.js')).generateExcel
        : (await import('../generatePDF.js')).generatePDF;

      const allItems = (await fetchAllItemsForExport()).map(decorateItem);

      await exporter(
        'account_products_report',
        allItems,
        fromDate,
        toDate,
        allItems.length,
        sumSubtotals(allItems),
      );
    } catch (error) {
      console.error('Failed to generate the account products report:', error);
    } finally {
      exportingReport = false;
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

  $: paginatedItems = (() => {
    const result = [...items];
    result.sort((a, b) => {
      if (['subtotal', 'quantity', 'unit_price'].includes(sortColumn)) {
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
    return selectedProducts.length && showBills
      ? result.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
      : result;
  })();

  $: pdfItems = paginatedItems.map(decorateItem);

  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  $: reportFilters = [
    {
      key: 'view',
      label: t('Show Bills'),
      value: reportView,
      icon: 'bi-receipt',
      options: [
        { value: 'all', label: t('Total Quantity') },
        { value: 'bills', label: t('Show Bills') },
      ],
    },
    {
      key: 'fromDate',
      label: t('From Date'),
      value: fromDate,
      icon: 'bi-calendar3',
      type: 'date',
    },
    {
      key: 'toDate',
      label: t('To Date'),
      value: toDate,
      icon: 'bi-calendar3',
      type: 'date',
    },
    {
      key: 'product',
      label: enable_services ? t('Product or Service') : t('Product'),
      value: selectedProducts,
      multiple: true,
      options: [
        { value: 'all', label: t('All') },
        ...products.map((product) => ({
          value: String(product.id),
          label: product.name || product.code || String(product.id),
        })),
      ],
    },
    {
      key: 'currency',
      label: t('Currency'),
      value: selectedCurrency,
      icon: 'bi-cash-stack',
      options: [{ value: 'all', label: t('All') }, ...currencies.map((currency) => ({ value: currency.code, label: t(currency.code) }))],
    },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterStatus = value;
    if (key === 'product') selectedProducts = Array.isArray(value) ? value : [];
    if (key === 'view') reportView = value;
    if (key === 'currency') selectedCurrency = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  function resetReportFilters() {
    searchTerm = '';
    filterStatus = 'all';
    selectedProducts = [];
    reportView = 'all';
    selectedCurrency = 'all';
    fromDate = '';
    toDate = '';
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  function openProduct(row) {
    if (showBills) {
      selectedProducts = [String(row.product_id)];
      currentPage = 1;
      lastPageKey = `1|${itemsPerPage}`;
      load();
    } else {
      push(`/dashboard/product/${row.product_id}`);
    }
  }

</script>

<div class="products-report-page" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Products Report')}
    toolbarWidth="25rem"
    showFooter={!loading && paginatedItems.length > 0}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ExportMenu
        extraClass="pdf-btn"
        loading={exportingReport}
        disabled={exportingReport || loading || pdfItems.length === 0}
        on:export={(event) => exportProducts(event.detail)}
      />
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search products...')}
        filters={reportFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => {
          searchTerm = event.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleReportFilter}
        on:reset={resetReportFilters} />
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
    {:else if paginatedItems.length === 0}
      <div class="index-table-state"><EmptyState icon="bi-inbox" message={t('No products found.')} /></div>
    {:else}
      <DataTable
        ariaLabel={t('Products Report')}
        minWidth="920px"
        dense
        striped
        hover={false}
        stickyHeader
        layout="fixed"
        scrollbar="thin">
        <svelte:fragment slot="head">
          <tr>
            <th class="cursor-pointer" on:click={() => setSort('created_at')}>{t('Date')}</th>
            <th>{t('Invoice #')}</th>
            <th>{t('Account')}</th>
            <th class="cursor-pointer" on:click={() => setSort('product_id')}
              >{enable_services ? t('Product or Service') : t('Product')}</th>
            <th class="col-start cursor-pointer" on:click={() => setSort('unit_price')}>{t('Unit Price')}</th>
            <th class="col-start cursor-pointer" on:click={() => setSort('quantity')}>{t('Quantity')}</th>
            <th class="col-start cursor-pointer" on:click={() => setSort('subtotal')}>{t('Total')}</th>
          </tr>
        </svelte:fragment>
        {#each paginatedItems as row}
          <tr>
            <td>
              {#if row.is_product_total}
                <span class="report-total-label">{t('Total')}</span>
              {:else}
                <span class="report-date">{@html showDate(row.created_at)}</span>
              {/if}
            </td>
            <td>
              {#if row.is_product_total}
                <span>{row.source_count} {t('Sale Items')}</span>
              {:else if row.sale_id}
                <button class="report-link" on:click={() => push(`/dashboard/sales/${row.sale_id}`)}
                  >{row.document_number || shortID(row.sale_id)}</button>
              {/if}
              {#if row.purchase_id}
                <button class="report-link" on:click={() => push(`/dashboard/purchases/${row.purchase_id}`)}
                  >{row.document_number || shortID(row.purchase_id)}</button>
              {/if}
            </td>
            <td>
              {#if row.is_product_total}
                <span>{row.account_count} {t('Accounts')}</span>
              {:else if row.account_id}
                <button class="product-link" on:click={() => push(`/dashboard/account/${row.account_id}?tab=financial-report`)}
                  >{row.account_name_fa || row.account_name || '—'}</button>
              {:else}
                <span>—</span>
              {/if}
            </td>
            <td>
              <button class="product-link" on:click={() => openProduct(row)}
                >{row.product_name || products.find((product) => product.id == row.product_id)?.name || '—'}</button>
            </td>
            <td class="col-start fw-bold">
              {#if row.is_product_total}
                <span aria-label={t('Not applicable')}>—</span>
              {:else}
                <span class="amount-inline">
                  <span dir="ltr">{Number(row.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                  <span>{t(row.currency)}</span>
                </span>
              {/if}
            </td>
            <td class="col-start">
              {#if row.is_product_total}
                {#each Object.entries(row.quantities) as [unitName, quantity]}
                  <span class="amount-inline aggregate-line">
                    <span dir="ltr">{Number(quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                    <span>{unitName}</span>
                  </span>
                {/each}
              {:else}
                <span class="amount-inline">
                  <span dir="ltr">{Number(row.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                  <span>{row.product_unit_name || units.find((unit) => unit.id == row.product_unit_id)?.name || ''}</span>
                </span>
              {/if}
            </td>
            <td class="col-start fw-bold">
              {#if row.is_product_total}
                {#each Object.entries(row.balances) as [currencyCode, balance]}
                  <span class="amount-inline aggregate-line">
                    <span dir="ltr">{Number(balance).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                    <span>{t(currencyCode)}</span>
                  </span>
                {/each}
              {:else}
                <span class="amount-inline">
                  <span dir="ltr">{Number(row.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                  <span>{t(row.currency)}</span>
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      </DataTable>
    {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        totalItems={null}
        ariaLabel={t('Products Report pagination')}
        rowLabel={t('rows')}
        perPageOptions={PAGE_SIZE_OPTIONS}
        on:perPageChange={(event) => {
          itemsPerPage = Number(event.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<style>
  .products-report-page {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }


  .report-date {
    white-space: nowrap;
  }

  .report-link,
  .product-link {
    border: 0;
    background: transparent;
    color: #0d6efd;
    padding: 0;
    cursor: pointer;
    text-align: inherit;
  }

  .report-link:hover,
  .product-link:hover {
    text-decoration: underline;
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .col-start {
    text-align: start;
  }

  .amount-inline,
  :global(.amount-inline) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .aggregate-line {
    display: flex;
  }

  .report-total-label {
    font-weight: 800;
  }

</style>
