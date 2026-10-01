<script>
  /*
   * Products & Alerts.
   *
   * The drill-down behind three dashboard cards: the top-products card, the
   * low-stock (quantity) card and the expiry card. Each one deep-links here
   * with `?tab=…`; the tab bar itself lives in the top bar (like the sales and
   * stock screens), so this page only follows the hash and renders the tab.
   *
   * The products tab reuses the Products Report so it keeps the filters,
   * sorting and exports of every other products screen. The quantity and expiry
   * tabs are current stock state, so they read the dashboard overview once and
   * filter/search locally — the lists are short alerts, not reports.
   */
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';

  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import ProductsReport from '../accounts/ProductsReport.svelte';

  import { showDate } from '../../calendar.js';
  import { t, lang } from '../../i18n/i18n.js';
  import { dashboardApi } from '../../api/dashboardApi.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';
  import {
    alertPageCount,
    amountText,
    buildExpiryRows,
    buildLowStockRows,
    countExpired,
    countExpiringSoon,
    countOutOfStock,
    expiryTone,
    filterAlertRows,
    filterAlertRowsByStatus,
    pageSlice,
    resolveProductAlertTab,
    stockTone,
  } from './productAlerts.js';

  $: _lang = $lang;

  let activeTab = readTabFromHash();
  let loading = activeTab !== 'products';
  let alertsRequested = false;
  let loadError = '';
  let overview = {};
  let overviewLoaded = false;

  let currencies = [];
  let selectedCurrency = 'all';

  let searchTerm = '';
  let statusFilter = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;

  /* Dashboard cards land here as `/dashboard/product-alerts?tab=<key>`. */
  function readTabFromHash() {
    const hash = typeof window === 'undefined' ? '' : window.location.hash || '';
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';

    return resolveProductAlertTab(new URLSearchParams(query).get('tab'));
  }

  function syncTabFromHash() {
    const tab = readTabFromHash();

    if (tab === activeTab) return;

    activeTab = tab;
    statusFilter = 'all';
    currentPage = 1;
    ensureAlertsLoaded();
  }

  async function loadAlerts() {
    loading = true;
    loadError = '';

    try {
      const today = new Date().toISOString().slice(0, 10);

      /*
       * Only the overview is needed here, and the endpoint caches it per
       * organization for 45s, so opening the page right after the dashboard is
       * effectively free. The date range is required by the endpoint but does
       * not affect the two stock alerts.
       */
      const summary =
        (
          await dashboardApi.getSummary({
            date_from: today,
            date_to: today,
            period: 'today',
            granularity: 'hour',
            include_overview: true,
            include_metrics: false,
          })
        )?.data || {};

      overview = summary.overview || {};
      overviewLoaded = true;
    } catch (error) {
      console.error('Failed to load the product alerts:', error);
      loadError = error?.message || '';
      overview = {};
      /* Let a later tab switch retry; the Refresh button calls loadAlerts directly. */
      alertsRequested = false;
    } finally {
      loading = false;
    }
  }

  /* The products tab may never need the alerts, so it does not fetch them. */
  function ensureAlertsLoaded() {
    if (activeTab === 'products' || overviewLoaded || alertsRequested) return;

    alertsRequested = true;
    loadAlerts();
  }

  onMount(() => {
    window.addEventListener('hashchange', syncTabFromHash);

    (async () => {
      try {
        currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
      } catch (error) {
        console.error('Failed to load currencies for the products report:', error);
        currencies = [];
      }
    })();

    ensureAlertsLoaded();

    return () => window.removeEventListener('hashchange', syncTabFromHash);
  });

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

  function openProduct(id) {
    if (id == null) return;

    push(`/dashboard/product/${id}`);
  }

  function countText(value) {
    return Number(value || 0).toLocaleString();
  }

  $: lowStockRows = buildLowStockRows(overview);
  $: expiryRows = buildExpiryRows(overview);
  $: activeRows =
    activeTab === 'quantity' ? lowStockRows : activeTab === 'expiry' ? expiryRows : [];
  $: statusFilteredRows = filterAlertRowsByStatus(activeRows, activeTab, statusFilter);
  $: matchingRows = filterAlertRows(statusFilteredRows, searchTerm);
  $: totalPages = alertPageCount(matchingRows.length, itemsPerPage);
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: pageRows = pageSlice(matchingRows, currentPage, itemsPerPage);

  $: lowStockTotal = Number(overview?.low_stock?.total) || lowStockRows.length;
  $: expiryTotal = Number(overview?.expiring?.total) || expiryRows.length;
  $: outOfStockCount = countOutOfStock(lowStockRows);
  $: expiredCount = countExpired(expiryRows);
  $: expiringSoonCount = countExpiringSoon(expiryRows);

  function resetSearch() {
    searchTerm = '';
    statusFilter = 'all';
    currentPage = 1;
  }

  function handleAlertFilter(event) {
    const { key, value } = event.detail;

    if (key === 'status') statusFilter = value;

    currentPage = 1;
  }

  $: statusFilterOptions = activeTab === 'quantity'
    ? [
        { value: 'all', label: t('All') },
        { value: 'out', label: t('Out of Stock') },
        { value: 'low', label: t('Low Stock') },
      ]
    : [
        { value: 'all', label: t('All') },
        { value: 'expired', label: t('Expired') },
        { value: 'soon', label: t('Expiring Soon') },
      ];

  /* Only the two stock-alert tabs have a status worth narrowing. */
  $: alertFilters = activeTab === 'products'
    ? []
    : [
        {
          key: 'status',
          label: t('Status'),
          value: statusFilter,
          icon: 'bi-funnel',
          options: statusFilterOptions,
        },
      ];
</script>

<div class="product-alerts-page" dir={t('dir')}>
  <div class="product-alerts-body">
    {#if activeTab === 'products'}
      <ProductsReport itemType="sale" bind:selectedCurrency {currencies} />
    {:else}
      <IndexPageLayout
        dir={t('dir')}
        ariaLabel={activeTab === 'quantity' ? t('Low Stock') : t('Expiry')}
        toolbarWidth="22rem"
        showStats={true}
        showFooter={!loading && matchingRows.length > 0}
        dense={true}
        tablePadding={true}>
        <svelte:fragment slot="actions">
          <ActionButton
            label={t('Refresh')}
            icon="bi-arrow-clockwise"
            variant="secondary"
            loading={loading}
            disabled={loading}
            on:click={loadAlerts} />
        </svelte:fragment>

        <svelte:fragment slot="toolbar">
          <FilterToolbar
            searchValue={searchTerm}
            searchPlaceholder={t('Search products...')}
            filters={alertFilters}
            showReset={true}
            resetLabel={t('Show All')}
            on:searchChange={(event) => {
              searchTerm = event.detail;
              currentPage = 1;
            }}
            on:filterChange={handleAlertFilter}
            on:reset={resetSearch} />
        </svelte:fragment>

        <svelte:fragment slot="stats">
          <div class="index-summary-grid product-alerts-summary-grid">
            {#if activeTab === 'quantity'}
              <SummaryCard label={t('Low Stock')} icon="bi-exclamation-triangle" tone="amber">
                <span dir="ltr">{countText(lowStockTotal)}</span>
              </SummaryCard>
              <SummaryCard label={t('Out of Stock')} icon="bi-x-octagon" tone="purple">
                <span dir="ltr">{countText(outOfStockCount)}</span>
              </SummaryCard>
              <SummaryCard label={t('Total')} icon="bi-box-seam" tone="cyan">
                <span dir="ltr">{countText(matchingRows.length)}</span>
              </SummaryCard>
            {:else}
              <SummaryCard label={t('Expiry')} icon="bi-calendar-x" tone="amber">
                <span dir="ltr">{countText(expiryTotal)}</span>
              </SummaryCard>
              <SummaryCard label={t('Expired')} icon="bi-exclamation-octagon" tone="purple">
                <span dir="ltr">{countText(expiredCount)}</span>
              </SummaryCard>
              <SummaryCard label={t('Expiring Soon')} icon="bi-hourglass-split" tone="cyan">
                <span dir="ltr">{countText(expiringSoonCount)}</span>
              </SummaryCard>
            {/if}
          </div>
        </svelte:fragment>

        {#if loading}
          <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
        {:else if loadError}
          <div class="index-table-state">
            <EmptyState icon="bi-exclamation-triangle" message={loadError || t('Failed to load data.')}>
              <ActionButton
                label={t('Refresh')}
                icon="bi-arrow-clockwise"
                variant="secondary"
                on:click={loadAlerts} />
            </EmptyState>
          </div>
        {:else if matchingRows.length === 0}
          <div class="index-table-state">
            <EmptyState
              icon={activeTab === 'quantity' ? 'bi-check-circle' : 'bi-calendar-check'}
              message={searchTerm || statusFilter !== 'all'
                ? t('No products found.')
                : activeTab === 'quantity'
                  ? t('All products well stocked')
                  : t('All expiry dates look good')} />
          </div>
        {:else if activeTab === 'quantity'}
          <DataTable ariaLabel={t('Low Stock')} minWidth="760px" dense striped hover={false} stickyHeader>
            <svelte:fragment slot="head">
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Code')}</th>
                <th class="col-start">{t('Stock')}</th>
                <th class="col-start">{t('Alarm Quantity')}</th>
                <th class="col-start">{t('Status')}</th>
              </tr>
            </svelte:fragment>

            {#each pageRows as row (row.id)}
              <tr>
                <td>
                  <button class="product-link" on:click={() => openProduct(row.id)}>{row.name}</button>
                </td>
                <td class="muted-cell"><span dir="ltr">{row.code || '—'}</span></td>
                <td class="col-start fw-bold"><span dir="ltr">{amountText(row.quantity)}</span></td>
                <td class="col-start"><span dir="ltr">{amountText(row.alarm_quantity)}</span></td>
                <td class="col-start">
                  <StatusBadge tone={stockTone(row)}>
                    {row.out_of_stock ? t('Out of Stock') : t('Low Stock')}
                  </StatusBadge>
                </td>
              </tr>
            {/each}
          </DataTable>
        {:else}
          <DataTable ariaLabel={t('Expiry')} minWidth="820px" dense striped hover={false} stickyHeader>
            <svelte:fragment slot="head">
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Code')}</th>
                <th class="col-start">{t('Stock')}</th>
                <th class="col-start">{t('Expiry')}</th>
                <th class="col-start">{t('Remaining Days')}</th>
                <th class="col-start">{t('Status')}</th>
              </tr>
            </svelte:fragment>

            {#each pageRows as row (row.id)}
              <tr>
                <td>
                  <button class="product-link" on:click={() => openProduct(row.id)}>{row.name}</button>
                </td>
                <td class="muted-cell"><span dir="ltr">{row.code || '—'}</span></td>
                <td class="col-start"><span dir="ltr">{amountText(row.quantity)}</span></td>
                <td class="col-start">
                  {#if row.expiry_date}<span>{@html showDate(row.expiry_date)}</span>{:else}—{/if}
                </td>
                <td class="col-start fw-bold">{row.remaining_days === null ? '—' : amountText(row.remaining_days)}</td>
                <td class="col-start">
                  <StatusBadge tone={expiryTone(row)}>
                    {row.expired ? t('Expired') : t('Expiring Soon')}
                  </StatusBadge>
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
            totalItems={matchingRows.length}
            ariaLabel={activeTab === 'quantity' ? t('Low Stock') : t('Expiry')}
            rowLabel={t('rows')}
            perPageOptions={PAGE_SIZE_OPTIONS}
            on:perPageChange={(event) => {
              itemsPerPage = Number(event.detail);
              currentPage = 1;
            }}
            {getPageNumbers} />
        </svelte:fragment>
      </IndexPageLayout>
    {/if}
  </div>
</div>

<style>
  .product-alerts-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .product-alerts-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  /*
   * Three cards, three columns: the layout defaults to four, and its scoped
   * rule wins on specificity, so this one needs the extra parent class to land.
   */
  .product-alerts-body .product-alerts-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .product-link {
    padding: 0;
    border: 0;
    background: none;
    color: #0f6efd;
    font: inherit;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .product-link:hover {
    text-decoration: underline;
  }

  .muted-cell {
    color: #64748b;
  }

  :global(html.dark) .muted-cell {
    color: var(--erp-muted);
  }

  @media (max-width: 720px) {
    .product-alerts-body .product-alerts-summary-grid {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }
</style>
