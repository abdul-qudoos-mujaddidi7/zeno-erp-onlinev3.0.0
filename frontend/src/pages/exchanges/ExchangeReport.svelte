<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { exchangeApi } from '../../api/exchangeApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { showDate } from '../../calendar.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';
  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let loading = true;
  let loadError = '';
  let exchanges = [];
  let accounts = [];
  let searchTerm = '';
  let accountFilter = 'all';
  let referenceFilter = 'all';
  let startDate = '';
  let endDate = '';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let exportingReport = false;

  function localDateValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function getAccountName(id) {
    const account = accounts.find((item) => Number(item.id) === Number(id)) || {};
    if (_lang === 'fa') return account.name_fa || account.name || '';
    if (_lang === 'ps') return account.name_ps || account.name || '';
    return account.name || '';
  }

  async function loadReport() {
    loading = true;
    loadError = '';
    try {
      const [exchangeResponse, accountResponse] = await Promise.all([
        exchangeApi.getAll({ status: 1, exclude_system_accounts: 1 }),
        accountApi.getAll({ status: 1 }),
      ]);
      exchanges = exchangeResponse?.data || [];
      accounts = accountResponse?.data || [];
    } catch (error) {
      console.error('Failed to load exchange report:', error);
      loadError = error?.message || t('Failed to load data.');
    } finally {
      loading = false;
    }
  }

  onMount(loadReport);

  $: referenceTypes = [...new Set(exchanges.map((row) => row.reference_type).filter(Boolean))];

  $: filtered = exchanges.filter((row) => {
    const query = searchTerm.trim().toLowerCase();
    const rowDate = localDateValue(row.date);
    if (startDate && rowDate < startDate) return false;
    if (endDate && rowDate > endDate) return false;
    if (
      accountFilter !== 'all' &&
      Number(row.first_entry_account) !== Number(accountFilter) &&
      Number(row.second_entry_account) !== Number(accountFilter)
    )
      return false;
    if (referenceFilter !== 'all' && row.reference_type !== referenceFilter) return false;
    if (!query) return true;
    return [
      row.description,
      row.reference_type,
      row.first_currency,
      row.second_currency,
      getAccountName(row.first_entry_account),
      getAccountName(row.second_entry_account),
    ].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(query),
    );
  });

  $: totals = filtered.reduce(
    (result, row) => {
      const debitCurrency = row.first_currency || '';
      const creditCurrency = row.second_currency || '';
      if (debitCurrency)
        result.sent[debitCurrency] = (result.sent[debitCurrency] || 0) + Number(row.first_entry_debit || 0);
      if (creditCurrency)
        result.received[creditCurrency] = (result.received[creditCurrency] || 0) + Number(row.second_entry_credit || 0);
      return result;
    },
    { sent: {}, received: {} },
  );

  $: totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  $: if (currentPage > totalPages) currentPage = totalPages;
  $: paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function formatTotals(values) {
    const entries = Object.entries(values);
    if (!entries.length) return '0';
    return entries
      .map(
        ([currency, amount]) =>
          `<span class="exchange-total"><span dir="ltr">${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span> <span>${t(currency)}</span></span>`,
      )
      .join('');
  }

  function handleFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'account') accountFilter = value;
    if (key === 'reference') referenceFilter = value;
    if (key === 'startDate') startDate = value;
    if (key === 'endDate') endDate = value;
    currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    accountFilter = 'all';
    referenceFilter = 'all';
    startDate = '';
    endDate = '';
    currentPage = 1;
  }

  async function downloadReport(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      /*
       * Export every row that matches the current filters, not just the
       * rows visible on the current page.
       */
      const exporter = format === 'excel' ? generateExcel : generatePDF;

      await exporter('exchanges_report', filtered, startDate, endDate, filtered.length);
    } catch (error) {
      console.error('Failed to generate the exchange report:', error);
    } finally {
      exportingReport = false;
    }
  }

  function getPageNumbers(current, total) {
    const pages = [];
    for (let page = 1; page <= total; page += 1) {
      if (page === 1 || page === total || Math.abs(page - current) <= 2) pages.push(page);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  }

  $: reportFilters = [
    { key: 'startDate', label: t('From Date'), value: startDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'endDate', label: t('To Date'), value: endDate, icon: 'bi-calendar3', type: 'date' },
    {
      key: 'account',
      label: t('Account'),
      value: accountFilter,
      icon: 'bi-person',
      options: [
        { value: 'all', label: t('All') },
        ...accounts.map((account) => ({ value: account.id, label: getAccountName(account.id) })),
      ],
    },
    {
      key: 'reference',
      label: t('Reference Type'),
      value: referenceFilter,
      icon: 'bi-link-45deg',
      options: [{ value: 'all', label: t('All') }, ...referenceTypes.map((value) => ({ value, label: t(value) }))],
    },
  ];
</script>

<div class="exchange-report-page" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={`${t('Exchanges')} ${t('Report')}`}
    showStats={!loading && !loadError}
    showFooter={!loading && filtered.length > 0}
    dense
    tablePadding>
    <svelte:fragment slot="actions">
      <ExportMenu
        loading={exportingReport}
        disabled={exportingReport || loading || !!loadError || filtered.length === 0}
        on:export={(event) => downloadReport(event.detail)} />
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('Search exchanges...')}
        filters={reportFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset
        on:searchChange={(event) => {
          searchTerm = event.detail;
          currentPage = 1;
        }}
        on:filterChange={handleFilterChange}
        on:reset={resetFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid exchange-summary">
        <SummaryCard
          label={t('Exchanges')}
          icon="bi-arrow-left-right"
          tone="blue"
          value={filtered.length.toLocaleString()} />
        <SummaryCard label={t('Debit')} icon="bi-arrow-up-right" tone="amber">
          <div class="summary-lines">{@html formatTotals(totals.sent)}</div>
        </SummaryCard>
        <SummaryCard label={t('Credit')} icon="bi-arrow-down-left" tone="green">
          <div class="summary-lines">{@html formatTotals(totals.received)}</div>
        </SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state"><EmptyState loading message={t('Loading...')} /></div>
    {:else if loadError}
      <div class="index-table-state"><EmptyState icon="bi-exclamation-triangle" message={loadError} /></div>
    {:else if filtered.length === 0}
      <div class="index-table-state"><EmptyState icon="bi-inbox" message={t('No exchange entries found.')} /></div>
    {:else}
      <DataTable
        ariaLabel={`${t('Exchanges')} ${t('Report')}`}
        minWidth="900px"
        dense
        striped
        hover={false}
        stickyHeader
        layout="fixed"
        scrollbar="thin">
        <svelte:fragment slot="head">
          <tr>
            <th class="col-start">{t('#')}</th>
            <th>{t('Date')}</th>
            <th>{t('Account')}</th>
            <th>{t('Description')}</th>
            <th>{t('Debit')}</th>
            <th>{t('Rate')}</th>
            <th>{t('Credit')}</th>
          </tr>
        </svelte:fragment>
        {#each paginated as exchange, index (exchange.id)}
          <tr>
            <td class="col-start muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
            <td><StatusBadge tone="neutral" ghost ltr stacked>{@html showDate(exchange.date)}</StatusBadge></td>
            <td>
              <div class="account-pair">
                <button
                  type="button"
                  on:click={() => push(`/dashboard/account/${exchange.first_entry_account}?tab=financial-report`)}
                  >{getAccountName(exchange.first_entry_account)}</button>
                <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
                <button
                  type="button"
                  on:click={() => push(`/dashboard/account/${exchange.second_entry_account}?tab=financial-report`)}
                  >{getAccountName(exchange.second_entry_account)}</button>
              </div>
            </td>
            <td><span class="description" title={exchange.description || ''}>{exchange.description || '—'}</span></td>
            <td
              ><StatusBadge tone="negative"
                ><span dir="ltr"
                  >{Number(exchange.first_entry_debit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}</span
                ><span>{t(exchange.first_currency)}</span></StatusBadge
              ></td>
            <td
              ><StatusBadge tone="info" ltr
                >{Number(exchange.rate || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })}</StatusBadge
              ></td>
            <td
              ><StatusBadge tone="positive"
                ><span dir="ltr"
                  >{Number(exchange.second_entry_credit || 0).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}</span
                ><span>{t(exchange.second_currency)}</span></StatusBadge
              ></td>
          </tr>
        {/each}
      </DataTable>
    {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage
        {totalPages}
        {itemsPerPage}
        totalItems={filtered.length}
        ariaLabel={`${t('Exchanges')} ${t('Report')} ${t('pagination')}`}
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
  .exchange-report-page {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .exchange-report-page :global(.index-page) {
    flex: 1 1 auto;
  }
  .exchange-summary {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }
  .summary-lines {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    white-space: normal;
  }
  :global(.exchange-total) {
    display: block;
    white-space: nowrap;
  }
  .account-pair {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-width: 0;
  }
  .account-pair button {
    max-width: 9rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: #2563eb;
    font: inherit;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .account-pair button:hover {
    text-decoration: underline;
  }
  .account-pair button:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 3px;
    border-radius: 3px;
  }
  .account-pair i {
    flex: 0 0 auto;
    color: #94a3b8;
    font-size: 0.72rem;
  }
  .description {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col-start {
    text-align: start;
  }
  .muted {
    color: #64748b;
  }
  @media (max-width: 700px) {
    .exchange-summary {
      grid-template-columns: 1fr !important;
    }
  }
</style>
