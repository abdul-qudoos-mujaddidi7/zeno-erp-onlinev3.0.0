<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { journalApi } from '../../api/journalApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { lookupAccountByCode } from '../../lib/formLookups.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { showDate, setDatePickers } from '../../calendar.js';
  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import {
    DEFAULT_PAGE_SIZE,
    PAGE_SIZE_OPTIONS,
    readListMeta,
  } from '../../lib/pagination.js';

  let generatingPDF = false;
  let loading = true;
  let loadError = '';
  let showBalanceCards = true;

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let componentRoot = null;
  let accounts = [];
  let account = null;

  let computedBalance = {};
  let currencyInfo = [];
  let creditSummary = '0';
  let debitSummary = '0';
  let balanceSummary = '0';

  let TREASURY_ID = null;

  let q = '';
  let page = 1;
  let pageSize = DEFAULT_PAGE_SIZE;
  const pageSizes = PAGE_SIZE_OPTIONS;
  let totalItems = 0;
  let totalPages = 1;

  let startDate = '';
  let endDate = '';

  let processed = [];
  let paginated = [];

  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;

  onMount(async () => {
    loading = true;
    loadError = '';

    try {
      const treasuryAccount = await lookupAccountByCode('TREASURY');
      TREASURY_ID = treasuryAccount?.id ?? null;
      if (treasuryAccount) accounts = [treasuryAccount];

      lastPageKey = `${page}|${pageSize}`;
      bootstrapped = true;
      await loadJournals({ includeSummary: true });
    } catch (error) {
      console.error('Failed to load journals report:', error);
      loadError = error?.message || t('Failed to load data.');
    } finally {
      loading = false;
    }

    await tick();
    if (componentRoot) {
      setDatePickers(handleDateChange, componentRoot);
    }
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void page;
    void pageSize;
    const key = `${page}|${pageSize}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      loadJournals();
    }
  }

  function handleDateChange(inputName, value) {
    if (inputName === 'startDate') startDate = value;
    if (inputName === 'endDate') endDate = value;
    reloadFromFirstPage();
  }

  function getAccountName(id) {
    const acc = accounts.find((item) => Number(item.id) === Number(id)) || {};

    if (_lang === 'fa') return acc.name_fa || acc.name || '';
    if (_lang === 'ps') return acc.name_ps || acc.name || '';

    return acc.name || '';
  }

  async function ensurePeerAccounts(journalRows) {
    const needed = new Set();
    for (const journal of journalRows || []) {
      if (journal.first_entry_account) {
        needed.add(Number(journal.first_entry_account));
      }
      if (journal.second_entry_account) {
        needed.add(Number(journal.second_entry_account));
      }
    }

    const have = new Set(accounts.map((item) => Number(item.id)));
    const missing = [...needed].filter((id) => !have.has(id));
    if (!missing.length) return;

    if (missing.length > 40) {
      const accountsResponse = await accountApi.getAll({ status: 1 });
      accounts = accountsResponse?.data || accounts;
      return;
    }

    const fetched = await Promise.all(
      missing.map((id) =>
        accountApi.getById(id).then((res) => res?.data).catch(() => null),
      ),
    );
    accounts = [...accounts, ...fetched.filter(Boolean)];
  }

  function reportQuery(extra = {}) {
    return {
      status: 1,
      search: q.trim(),
      date_from: startDate || undefined,
      date_to: endDate || undefined,
      exclude_system_accounts: 1,
      exclude_report_accounts: 1,
      ...extra,
    };
  }

  function mapJournalAmounts(journal) {
    let debit =
      Number(journal.first_entry_debit || 0) +
      Number(journal.second_entry_debit || 0);
    let credit =
      Number(journal.first_entry_credit || 0) +
      Number(journal.second_entry_credit || 0);

    if (Number(journal.first_entry_account) === Number(TREASURY_ID)) {
      debit = Number(journal.second_entry_debit || 0);
      credit = Number(journal.second_entry_credit || 0);
    }

    if (Number(journal.second_entry_account) === Number(TREASURY_ID)) {
      debit = Number(journal.first_entry_debit || 0);
      credit = Number(journal.first_entry_credit || 0);
    }

    return {
      ...journal,
      debit,
      credit,
      currency: journal.currency || account?.currency || 'DEFAULT',
    };
  }

  function withPageRunning(rows) {
    const run = {};
    const ascending = [...rows].reverse();
    const withRunning = ascending.map((journal) => {
      const currency = journal.currency || 'DEFAULT';
      run[currency] =
        Number(run[currency] || 0) +
        Number(journal.credit || 0) -
        Number(journal.debit || 0);

      return {
        ...journal,
        running: { ...run },
      };
    });

    return withRunning.reverse();
  }

  async function loadJournals({ includeSummary = page === 1 } = {}) {
    const requestId = ++loadRequestId;
    lastPageKey = `${page}|${pageSize}`;
    loading = true;
    loadError = '';

    try {
      const journalResponse = await journalApi.getAll(
        reportQuery({
          page,
          limit: pageSize,
          skip_count: 1,
          include_summary: includeSummary ? 1 : 0,
        }),
      );

      if (requestId !== loadRequestId) return;

      const rows = (journalResponse?.data || []).map(mapJournalAmounts);
      await ensurePeerAccounts(rows);

      processed = withPageRunning(rows);
      paginated = processed;

      if (includeSummary && journalResponse?.summary) {
        computedBalance = journalResponse.summary;
      }

      const meta = readListMeta(journalResponse, rows.length);
      const hasMore = Boolean(journalResponse?.meta?.hasMore);

      totalItems = hasMore
        ? Math.max(meta.total, page * pageSize + 1)
        : Math.max(meta.total, (page - 1) * pageSize + rows.length);
      totalPages = hasMore
        ? Math.max(page + 1, Math.ceil(totalItems / pageSize) || 0)
        : Math.max(page, Math.ceil(totalItems / pageSize) || 0);
    } catch (error) {
      if (requestId !== loadRequestId) return;
      console.error('Failed to load journals report:', error);
      loadError = error?.message || t('Failed to load data.');
      processed = [];
      paginated = [];
      totalItems = 0;
      totalPages = 1;
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function reloadFromFirstPage() {
    if (page !== 1) {
      page = 1;
      return;
    }

    loadJournals({ includeSummary: true });
  }

  $: reportFilters = [
    {
      key: 'startDate',
      type: 'date',
      label: t('From Date'),
      icon: 'bi-calendar3',
      value: startDate,
    },
    {
      key: 'endDate',
      type: 'date',
      label: t('To Date'),
      icon: 'bi-calendar3',
      value: endDate,
    },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;

    if (key === 'startDate') startDate = value;
    if (key === 'endDate') endDate = value;

    reloadFromFirstPage();
  }

  function resetReportFilters() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    startDate = '';
    endDate = '';
    q = '';
    reloadFromFirstPage();
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      reloadFromFirstPage();
    }, 300);
  }

  $: currencyInfo = buildCurrencyInfo(computedBalance, account?.currency);
  $: creditSummary = buildSummary(currencyInfo, 'credit', _lang);
  $: debitSummary = buildSummary(currencyInfo, 'debit', _lang);
  $: balanceSummary = buildSummary(currencyInfo, 'balance', _lang);

  function buildCurrencyInfo(balanceObject, accountCurrency) {
    if (!balanceObject || typeof balanceObject !== 'object') return [];

    return Object.entries(balanceObject).map(([code, values]) => ({
      code,
      debit: Number(values?.debit || 0),
      credit: Number(values?.credit || 0),
      balance: Number(values?.balance || 0),
      color: code === accountCurrency ? 'primary' : 'success',
    }));
  }

  function buildSummary(rows, type, currentLanguage) {
    void currentLanguage;

    if (!Array.isArray(rows) || rows.length === 0) return '0';

    return rows
      .map((currency) => {
        const amount = Number(currency[type] || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        });

        return `${amount} ${t(currency.code)}`;
      })
      .join('<br />');
  }

  function formatRunningObj(balanceObject) {
    if (!balanceObject || typeof balanceObject !== 'object') return '0';

    const entries = Object.entries(balanceObject);
    if (entries.length === 0) return '0';

    return entries
      .map(([currency, amount]) => {
        const formattedAmount = Number(amount || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        });

        return `${formattedAmount} ${t(currency)}`;
      })
      .join('<br />');
  }

  async function fetchAllReportJournals() {
    const all = [];
    let exportPage = 1;
    const limit = 200;

    while (exportPage <= 100) {
      const response = await journalApi.getAll(
        reportQuery({
          page: exportPage,
          limit,
          skip_count: 1,
        }),
      );
      const rows = response?.data || [];
      all.push(...rows);
      if (!response?.meta?.hasMore || !rows.length) break;
      exportPage += 1;
    }

    return withPageRunning(all.map(mapJournalAmounts));
  }

  function getPageNumbers(current, total) {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= total; i += 1) {
      if (
        i === 1 ||
        i === total ||
        (i >= current - delta && i <= current + delta)
      ) {
        range.push(i);
      }
    }

    for (const i of range) {
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

  async function downloadReport(format) {
    if (generatingPDF) return;

    generatingPDF = true;

    try {
      const rows = await fetchAllReportJournals();
      await tick();

      const exporter = format === 'excel' ? generateExcel : generatePDF;

      await exporter(
        'journals_report',
        rows,
        startDate,
        endDate,
        rows.length,
        currencyInfo,
        {},
      );
    } catch (error) {
      console.error('Failed to generate journals report:', error);
    } finally {
      generatingPDF = false;
    }
  }
</script>

<div
  class="journals-report-page"
  bind:this={componentRoot}
  dir={t('dir')}
>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Journals Report')}
    toolbarWidth="25rem"
    showStats={showBalanceCards}
    showFooter={!loading && (processed.length > 0 || totalPages > 1)}
    dense
    tablePadding
  >
    <svelte:fragment slot="actions">
      <ExportMenu
        loading={generatingPDF}
        disabled={generatingPDF || loading || processed.length === 0}
        on:export={(event) => downloadReport(event.detail)}
      />

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showBalanceCards}
        aria-label={t('Balance')}
        title={t('Balance')}
        on:click={() => (showBalanceCards = !showBalanceCards)}
      >
        <i class="bi {showBalanceCards ? 'bi-x-lg' : 'bi-wallet2'}"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={q}
        searchPlaceholder={t('Search transactions')}
        filters={reportFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Show All')}
        showReset={true}
        on:searchChange={(event) => {
          q = event.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleReportFilter}
        on:reset={resetReportFilters}
      />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="summary-grid">
        <SummaryCard
          label={t('Credit')}
          icon="bi-arrow-down-left"
          tone="green"
        >
          {@html creditSummary}
        </SummaryCard>

        <SummaryCard
          label={t('Debit')}
          icon="bi-arrow-up-right"
          tone="amber"
        >
          {@html debitSummary}
        </SummaryCard>

        <SummaryCard
          label={t('Balance')}
          icon="bi-wallet2"
          tone="cyan"
        >
          {@html balanceSummary}
        </SummaryCard>
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="table-state">
        <EmptyState loading message={t('Loading...')} />
      </div>
    {:else if loadError}
      <div class="table-state">
        <EmptyState icon="bi-exclamation-triangle" message={loadError} />
      </div>
    {:else if processed.length === 0}
      <div class="table-state">
        <EmptyState
          icon="bi-journal-x"
          message={t('No transactions found.')}
        />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Journals Report')}
        minWidth="850px"
        dense
        striped
        hover={false}
        stickyHeader
        layout="fixed"
        scrollbar="thin"
      >
        <svelte:fragment slot="head">
          <tr>
            <th>{t('Date')}</th>
            <th>{t('Account')}</th>
            <th>{t('Description')}</th>
            <th>{t('Debit')}</th>
            <th>{t('Credit')}</th>
            <th>{t('Balance')}</th>
          </tr>
        </svelte:fragment>

        {#each paginated as journal (journal.id)}
          <tr>
            <td>
              <span class="date-badge">
                {@html showDate(journal.date) || '—'}
              </span>
            </td>

            <td>
              <div class="account-pair">
                <span
                  class:positive={Number(journal.first_entry_credit || 0) > 0}
                  class:negative={Number(journal.first_entry_credit || 0) <= 0}
                >
                  {getAccountName(journal.first_entry_account)}
                </span>

                <span
                  class:positive={Number(journal.second_entry_credit || 0) > 0}
                  class:negative={Number(journal.second_entry_credit || 0) <= 0}
                >
                  {getAccountName(journal.second_entry_account)}
                </span>
              </div>
            </td>

            <td>
              <span
                class="description-cell"
                title={journal.description || ''}
              >
                {journal.description || '—'}
              </span>
            </td>

            <td>
              {#if journal.debit}
                <span class="amount negative">
                  {Number(journal.debit).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal.currency || '')}
                </span>
              {:else}
                <span class="dash">—</span>
              {/if}
            </td>

            <td>
              {#if journal.credit}
                <span class="amount positive">
                  {Number(journal.credit).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(journal.currency || '')}
                </span>
              {:else}
                <span class="dash">—</span>
              {/if}
            </td>

            <td>
              <span class="running-balance">
                {@html formatRunningObj(journal.running)}
              </span>
            </td>
          </tr>
        {/each}
      </DataTable>
    {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage={page}
        {totalPages}
        itemsPerPage={pageSize}
        totalItems={totalItems}
        {getPageNumbers}
        rowLabel={t('rows')}
        perPageOptions={pageSizes}
        on:perPageChange={(event) => {
          pageSize = Number(event.detail);
          page = 1;
        }}
      />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<style>
  .journals-report-page { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; overflow:hidden; }
  .summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem; width:100%; }
  .index-settings-button { display:grid; place-items:center; width:2.625rem; height:2.625rem; border:1px solid #dbe4ef; border-radius:.6rem; color:#0f6efd; background:#eff6ff; }
  .index-settings-button.is-active { color:#fff; background:#0f6efd; border-color:#0f6efd; }
  .table-state { display:grid; place-items:center; min-height:18rem; }
  .date-badge { color:#475569; font-size:.8rem; } .account-pair { display:flex; justify-content:center; gap:.35rem; flex-wrap:wrap; }
  .account-pair span,.amount { display:inline; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; font-size:.75rem; font-weight:700; }
  .positive { color:#047857; background:transparent; } .negative { color:#dc2626; background:transparent; }
  .description-cell { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .running-balance { font-weight:700; line-height:1.5; } .dash { color:#cbd5e1; }
  @media(max-width:700px){ .summary-grid{grid-template-columns:1fr;} }
</style>
