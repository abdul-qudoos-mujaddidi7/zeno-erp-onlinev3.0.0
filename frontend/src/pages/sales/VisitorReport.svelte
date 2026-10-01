<script>
  import { onMount, tick } from 'svelte';
  import { push } from 'svelte-spa-router';

  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';

  import { setDatePickers } from '../../calendar.js';
  import { t, lang, shortID } from '../../i18n/i18n.js';
  import { saleApi } from '../../api/saleApi.js';
  import { productApi } from '../../api/productApi.js';
  import { applyCurrentFiscalYearRange } from '../../utils/currentFiscalYear.js';
  import { oneMonthDateWindow } from '../accounts/reportDateRange.js';
  import { lookupAccounts } from '../../lib/formLookups.js';

  $: _lang = $lang;

  export let currencies = [];

  let rows = [];
  let visibleRows = [];
  let totalsByCurrency = {};
  let loading = true;
  let bootstrapped = false;
  let loadRequestId = 0;
  let exportingReport = false;

  let fromDate = '';
  let toDate = '';
  let selectedCurrency = 'all';
  let searchTerm = '';
  let products = [];
  let selectedProducts = [];
  let visitors = [];
  let selectedVisitors = [];

  /*
   * A visitor's name is translated on the account, so the report reads the
   * column that matches the active language and only falls back to the base
   * name when that translation was never filled in.
   */
  function visitorName(row) {
    const language = t('Lang');

    if (language === 'fa') return row.visitor_name_fa || row.visitor_name || '—';
    if (language === 'ps') return row.visitor_name_ps || row.visitor_name || '—';

    return row.visitor_name || '—';
  }

  /*
   * The dropdown shows one line per visitor account. Like the report itself, it
   * prefers the name in the active language, and keeps the account code so two
   * visitors with the same name stay tellable apart.
   */
  function visitorOptionLabel(account) {
    const language = t('Lang');

    const name =
      language === 'fa'
        ? account.name_fa || account.name
        : language === 'ps'
          ? account.name_ps || account.name
          : account.name;

    return account.code ? `${name || '—'} (${account.code})` : name || '—';
  }

  function amountText(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function percentText(value) {
    if (value === null || value === undefined || value === '') return '—';

    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
  }

  async function load() {
    const requestId = ++loadRequestId;
    loading = true;

    try {
      const response = await saleApi.getVisitorReport({
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        currency: selectedCurrency,
        product_ids: selectedProducts,
        visitor_ids: selectedVisitors,
      });

      if (requestId !== loadRequestId) return;

      rows = Array.isArray(response?.data) ? response.data : [];
      totalsByCurrency = response?.meta?.by_currency || {};
    } catch (error) {
      console.error('Failed to load the visitor report:', error);
      rows = [];
      totalsByCurrency = {};
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  /*
   * The exporter labels rows itself, so the translated visitor name is attached
   * here rather than resolved inside generatePDF (which does not know how a
   * visitor's account names are translated).
   */
  function decorateRow(row) {
    return {
      ...row,
      visitor_display_name: visitorName(row),
    };
  }

  function sumByCurrency(items, key) {
    return (items || []).reduce((totals, row) => {
      const currency = row.currency || 'AFN';

      totals[currency] = (totals[currency] || 0) + Number(row[key] || 0);

      return totals;
    }, {});
  }

  /*
   * Exports exactly what the report is showing: the same date range, currency
   * filter and search that produced the rows on screen.
   */
  async function exportReport(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel' ? generateExcel : generatePDF;
      const items = visibleRows.map(decorateRow);

      await exporter(
        'visitor_report',
        items,
        fromDate,
        toDate,
        items.length,
        sumByCurrency(items, 'total_amount'),
        {
          visitors: new Set(items.map((row) => row.visitor_account_id)).size,
        },
      );
    } catch (error) {
      console.error('Failed to generate the visitor report:', error);
    } finally {
      exportingReport = false;
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'fromDate') fromDate = value;
    else if (inputName === 'toDate') toDate = value;

    load();
  }

  function handleReportFilter(event) {
    const { key, value } = event.detail;

    if (key === 'currency') selectedCurrency = value;
    if (key === 'product') selectedProducts = Array.isArray(value) ? value : [];
    if (key === 'visitor') selectedVisitors = Array.isArray(value) ? value : [];
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;

    load();
  }

  function resetReportFilters() {
    searchTerm = '';
    selectedCurrency = 'all';
    selectedProducts = [];
    selectedVisitors = [];

    const window = oneMonthDateWindow();
    fromDate = window.from;
    toDate = window.to;

    load();
  }

  onMount(async () => {
    try {
      products = (await productApi.getAll({ status: 1 }))?.data || [];
    } catch (error) {
      console.error('Failed to load products for the visitor report:', error);
      products = [];
    }

    /*
     * The visitor filter is server-side, so the dropdown only needs the active
     * visitor accounts; the report itself decides which of them have sales.
     */
    try {
      visitors = await lookupAccounts({ role: 'visitor', limit: 200 });
    } catch (error) {
      console.error('Failed to load visitors for the visitor report:', error);
      visitors = [];
    }

    /*
     * Default to the working fiscal year, exactly like the sales list: a closed
     * year's documents stay out of the normal screens without ever being
     * deleted. No fiscal year configured -> the last month, as before.
     */
    const range = await applyCurrentFiscalYearRange(({ from, to }) => {
      fromDate = from;
      toDate = to;
    });

    if (!range) {
      const fallback = oneMonthDateWindow();
      fromDate = fallback.from;
      toDate = fallback.to;
    }

    bootstrapped = true;
    await load();

    tick().then(() => setDatePickers(handleDateChange));
  });

  /*
   * Searching is local: the report is already a whole-table aggregate, so
   * filtering the visitor names needs no round trip.
   */
  $: visibleRows = (rows || []).filter((row) => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) return true;

    return (
      visitorName(row).toLowerCase().includes(term)
      || String(row.visitor_code || '').toLowerCase().includes(term)
    );
  });

  /*
   * The summary cards show one currency at a time. With a currency filter the
   * bucket is exact; on "all" the organization's default currency is preferred,
   * so a mixed-currency organization still gets meaningful cards.
   */
  $: defaultCurrencyCode = (
    currencies.find((currency) => Number(currency.isDefault ?? currency.is_default) === 1)?.code
    || currencies[0]?.code
    || null
  );

  $: activeTotals = (() => {
    const buckets = Object.values(totalsByCurrency || {});

    if (!buckets.length) return null;

    if (selectedCurrency !== 'all') return totalsByCurrency[selectedCurrency] || null;

    if (defaultCurrencyCode && totalsByCurrency[defaultCurrencyCode]) {
      return totalsByCurrency[defaultCurrencyCode];
    }

    return [...buckets].sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))[0];
  })();

  $: activeCurrency = activeTotals?.currency || (selectedCurrency !== 'all' ? selectedCurrency : '');
  $: summarySuffix = activeCurrency ? ` (${t(activeCurrency)})` : '';

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
      label: t('Products'),
      value: selectedProducts,
      icon: 'bi-box-seam',
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
      key: 'visitor',
      label: t('Visitor'),
      value: selectedVisitors,
      icon: 'bi-person-badge',
      multiple: true,
      visible: visitors.length > 0,
      options: [
        { value: 'all', label: t('All') },
        ...visitors.map((visitor) => ({
          value: String(visitor.id),
          label: visitorOptionLabel(visitor),
        })),
      ],
    },
    {
      key: 'currency',
      label: t('Currency'),
      value: selectedCurrency,
      icon: 'bi-cash-stack',
      options: [
        { value: 'all', label: t('All') },
        ...currencies.map((currency) => ({ value: currency.code, label: t(currency.code) })),
      ],
    },
  ];
</script>

<div class="visitor-report-page" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Visitor Report')}
    toolbarWidth="25rem"
    showStats={true}
    showFooter={false}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ExportMenu
        extraClass="pdf-btn"
        loading={exportingReport}
        disabled={exportingReport || loading || visibleRows.length === 0}
        on:export={(event) => exportReport(event.detail)} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid visitor-summary-grid">
        <SummaryCard label={`${t('Total Sales')}${summarySuffix}`} icon="bi-cash-stack" tone="cyan">
          <span dir="ltr">{amountText(activeTotals?.total_amount)}</span>
        </SummaryCard>
        <SummaryCard label={`${t('Benefit')}${summarySuffix}`} icon="bi-graph-up-arrow" tone="blue">
          <span dir="ltr">{amountText(activeTotals?.total_benefit)}</span>
        </SummaryCard>
        <SummaryCard label={`${t('Visitor Share')}${summarySuffix}`} icon="bi-person-badge" tone="amber">
          <span dir="ltr">{amountText(activeTotals?.total_share)}</span>
        </SummaryCard>
        <SummaryCard label={`${t('Company Share')}${summarySuffix}`} icon="bi-piggy-bank" tone="green">
          <span dir="ltr">{amountText(activeTotals?.company_share)}</span>
        </SummaryCard>
      </div>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search visitors...')}
        filters={reportFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => (searchTerm = event.detail)}
        on:filterChange={handleReportFilter}
        on:reset={resetReportFilters} />
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
    {:else if visibleRows.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-person-badge" message={t('No visitors found.')} />
      </div>
    {:else}
      <p class="visitor-report-caption">
        {activeTotals?.visitors ?? 0} {t('Visitors')} ·
        {activeTotals?.sales_count ?? 0} {t('Sales Count')}
      </p>

      <DataTable
        ariaLabel={t('Visitor Report')}
        minWidth="920px"
        dense
        striped
        hover={false}
        stickyHeader
        layout="fixed"
        scrollbar="thin">
        <svelte:fragment slot="head">
          <tr>
            <th>{t('Visitor')}</th>
            <th class="col-start">{t('Rate')}</th>
            <th class="col-start">{t('Sales Count')}</th>
            <th class="col-start">{t('Total Sales')}</th>
            <th class="col-start">{t('Benefit')}</th>
            <th class="col-start">{t('Visitor Share')}</th>
            <th class="col-start">{t('Company Share')}</th>
          </tr>
        </svelte:fragment>

        {#each visibleRows as row (row.visitor_account_id + '|' + row.currency)}
          <tr>
            <td>
              <button
                class="visitor-link"
                on:click={() => push(`/dashboard/account/${row.visitor_account_id}?tab=financial-report`)}>
                {visitorName(row)}
              </button>
              <small class="visitor-code" dir="ltr">{row.visitor_code || shortID(row.visitor_account_id)}</small>
            </td>
            <td class="col-start">
              <StatusBadge tone="neutral" ltr>{percentText(row.visitor_percentage)}</StatusBadge>
            </td>
            <td class="col-start">{Number(row.sales_count || 0).toLocaleString()}</td>
            <td class="col-start">
              <span class="amount-inline">
                <span dir="ltr">{amountText(row.total_amount)}</span>
                <span>{t(row.currency || '')}</span>
              </span>
            </td>
            <td class="col-start">
              <span class="amount-inline">
                <span dir="ltr">{amountText(row.total_benefit)}</span>
                <span>{t(row.currency || '')}</span>
              </span>
            </td>
            <td class="col-start fw-bold">
              <span class="amount-inline">
                <span dir="ltr">{amountText(row.total_share)}</span>
                <span>{t(row.currency || '')}</span>
              </span>
            </td>
            <td class="col-start fw-bold visitor-company-share">
              <span class="amount-inline">
                <span dir="ltr">{amountText(row.company_share)}</span>
                <span>{t(row.currency || '')}</span>
              </span>
            </td>
          </tr>
        {/each}
      </DataTable>
    {/if}
  </IndexPageLayout>
</div>

<style>
  .visitor-report-page {
    height: 100%;
    min-height: 0;
  }

  .visitor-report-caption {
    margin: 0;
    padding: 0.5rem 0.25rem 0;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .visitor-link {
    padding: 0;
    border: 0;
    background: none;
    color: #0f6efd;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .visitor-link:hover {
    text-decoration: underline;
  }

  .visitor-code {
    display: block;
    margin-top: 0.125rem;
    color: #94a3b8;
    font-size: 0.6875rem;
  }

  .amount-inline {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .visitor-company-share {
    color: #047857;
  }

  :global(html.dark) .visitor-report-caption,
  :global(html.dark) .visitor-code {
    color: var(--erp-muted);
  }

  :global(html.dark) .visitor-company-share {
    color: #6ee7b7;
  }
</style>
