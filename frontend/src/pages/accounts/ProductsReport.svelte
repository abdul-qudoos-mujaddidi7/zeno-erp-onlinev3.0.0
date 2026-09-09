<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, onDestroy, tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';

  import { t, lang, translate_org_type, shortID, settings_all } from '../../i18n/i18n.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { productApi } from '../../api/productApi.js';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let units = [];
  let currencies = [];
  let products = [];
  let items = [];
  let summaryItems = [];
  let pdfItems = [];

  export let account_id = null;
  let loading = true;
  let exportingReport = false;
  let lookupsLoaded = false;

  let searchTerm = '';
  let filterStatus = 'all';
  let selectedProduct = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let totalPages = 1;
  let showProductStats = true;
  let fromDate = '';
  let toDate = '';
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';

  function defaultDateWindow() {
    return { from: '', to: '' };
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
    const [currencyResponse, unitsResponse] = await Promise.all([
      currencyApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
    ]);
    currencies = currencyResponse?.data || [];
    units = unitsResponse?.data || [];
    lookupsLoaded = true;
  }

  async function fetchAllForSummary() {
    const pageSize = 200;
    const all = [];
    let page = 1;
    for (;;) {
      const response = await accountApi.getProductItems(account_id, {
        item_type: filterStatus,
        product_id: selectedProduct !== 'all' ? Number(selectedProduct) : undefined,
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

  let summaryRequestId = 0;
  let needsSummaryRefresh = false;

  async function loadSummary() {
    const reqId = ++summaryRequestId;
    try {
      const all = await fetchAllForSummary();
      if (reqId === summaryRequestId) summaryItems = all;
    } catch (e) {
      console.error('Failed to load summary:', e);
      if (reqId === summaryRequestId) summaryItems = [];
    }
  }

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;
    const shouldRefreshSummary = needsSummaryRefresh;
    needsSummaryRefresh = false;

    try {
      const lookupsPromise = loadLookups();
      const summaryPromise = shouldRefreshSummary ? loadSummary() : Promise.resolve();

      const response = await accountApi.getProductItems(account_id, {
        item_type: filterStatus,
        product_id: selectedProduct !== 'all' ? Number(selectedProduct) : undefined,
        search: searchTerm.trim(),
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        page: currentPage,
        limit: itemsPerPage,
        skip_count: 1,
      });

      if (requestId !== loadRequestId) return;

      items = response?.data || [];

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

      await Promise.all([lookupsPromise, productPromise, summaryPromise]);

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

      const hasMore = Boolean(response?.meta?.hasMore);
      totalPages = hasMore
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
      needsSummaryRefresh = true;
      if (currentPage !== 1) currentPage = 1;
      else load();
    }, 300);
  }

  onMount(async () => {
    fromDate = '';
    toDate = '';
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    needsSummaryRefresh = true;
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
        item.document_number || shortID(item.sale_id || item.purchase_id || item.product_id),
    };
  }

  function sumSubtotals(rows) {
    return rows.reduce((totals, s) => {
      if (!totals[s.currency]) totals[s.currency] = 0;
      totals[s.currency] += Number(s.subtotal) || 0;
      return totals;
    }, {});
  }

  /*
   * The table only holds the current page. For PDF/Excel exports,
   * fetch every row that matches the active filters instead.
   */
  async function fetchAllItemsForExport() {
    const pageSize = 200;
    const all = [];
    let page = 1;

    for (;;) {
      const response = await accountApi.getProductItems(account_id, {
        item_type: filterStatus,
        product_id: selectedProduct !== 'all' ? Number(selectedProduct) : undefined,
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

  async function exportProducts(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel' ? generateExcel : generatePDF;

      const allItems = (summaryItems.length ? summaryItems : await fetchAllItemsForExport()).map(decorateItem);

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
      if (sortColumn === 'subtotal' || sortColumn === 'quantity' || sortColumn === 'unit_price') {
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

  $: pdfItems = paginatedItems.map(decorateItem);

  $: pageTotalAmount = sumSubtotals(paginatedItems);

  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  $: reportFilters = [
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
      value: selectedProduct,
      options: [
        { value: 'all', label: t('All') },
        ...products.map((product) => ({
          value: String(product.id),
          label: product.name || product.code || String(product.id),
        })),
      ],
    },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;
    if (key === 'type') filterStatus = value;
    if (key === 'product') selectedProduct = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    needsSummaryRefresh = true;
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  function resetReportFilters() {
    searchTerm = '';
    filterStatus = 'all';
    selectedProduct = 'all';
    fromDate = '';
    toDate = '';
    needsSummaryRefresh = true;
    currentPage = 1;
    lastPageKey = `1|${itemsPerPage}`;
    load();
  }

  $: summaryTotalAmount = sumSubtotals(summaryItems);
  $: totalAmountHtml =
    Object.entries(summaryTotalAmount)
      .map(
        ([currency, amount]) =>
          `<span class="amount-inline"><span dir="ltr">${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span><span>${t(currency || '')}</span></span>`,
      )
      .join('<br />') || '0';

  $: saleItemCount = summaryItems.filter((r) => r.item_type === 'sale').length;
  $: totalQuantity = summaryItems.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  $: totalQuantityHtml =
    `<span class="amount-inline"><span dir="ltr">${totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span></span>`;
</script>

<div class="products-report-page" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Products Report')}
    toolbarWidth="25rem"
    showStats={showProductStats}
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
      <button
        type="button"
        class="index-settings-button"
        class:is-active={showProductStats}
        aria-label={t('Statistics')}
        aria-expanded={showProductStats}
        title={t('Statistics')}
        on:click={() => (showProductStats = !showProductStats)}>
        <i class="bi {showProductStats ? 'bi-x-lg' : 'bi-gear'}"></i>
      </button>
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

    <svelte:fragment slot="stats">
      <div class="index-summary-grid product-report-summary">
        <SummaryCard
          label={t('Total Amount')}
          icon="bi-cash-stack"
          tone="cyan">
          <div class="report-summary-values">
            {@html totalAmountHtml}
          </div>
        </SummaryCard>
        <SummaryCard
          label={t('Total Quantity')}
          icon="bi-box-seam"
          tone="green">
          {@html totalQuantityHtml}
        </SummaryCard>
        <SummaryCard
          label={t('Sale Items')}
          icon="bi-bag-check"
          tone="blue">
          {saleItemCount}
        </SummaryCard>

      </div>
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
            <td><span class="report-date">{@html showDate(row.created_at)}</span></td>
            <td>
              {#if row.sale_id}
                <button class="report-link" on:click={() => push(`/dashboard/sales/${row.sale_id}`)}
                  >{row.document_number || shortID(row.sale_id)}</button>
              {/if}
              {#if row.purchase_id}
                <button class="report-link" on:click={() => push(`/dashboard/purchases/${row.purchase_id}`)}
                  >{row.document_number || shortID(row.purchase_id)}</button>
              {/if}
            </td>
            <td>
              {#if row.account_id}
                <button class="product-link" on:click={() => push(`/dashboard/account/${row.account_id}?tab=financial-report`)}
                  >{row.account_name_fa || row.account_name || '—'}</button>
              {:else}
                <span>—</span>
              {/if}
            </td>
            <td>
              <button class="product-link" on:click={() => push(`/dashboard/product/${row.product_id}`)}
                >{row.product_name || products.find((product) => product.id == row.product_id)?.name || '—'}</button>
            </td>
            <td class="col-start fw-bold">
              <span class="amount-inline">
                <span dir="ltr">{Number(row.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{t(row.currency)}</span>
              </span>
            </td>
            <td class="col-start">
              <span class="amount-inline">
                <span dir="ltr">{Number(row.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{row.product_unit_name || units.find((unit) => unit.id == row.product_unit_id)?.name || ''}</span>
              </span>
            </td>
            <td class="col-start fw-bold">
              <span class="amount-inline">
                <span dir="ltr">{Number(row.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                <span>{t(row.currency)}</span>
              </span>
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

  .product-report-summary {
    grid-template-columns: repeat(3, 1fr);
  }

  :global(.index-statistics) {
    padding-inline: 0 !important;
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

  .report-summary-values {
    text-align: start;
  }


   :global(.index-statistics) {
    padding-inline: 0 !important;
    width: 100%;
    max-width: 100%;
  }

  .index-summary-grid.product-report-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
    max-width: 100%;
  }
</style>
