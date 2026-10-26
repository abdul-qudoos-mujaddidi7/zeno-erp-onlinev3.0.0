<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { journalApi } from '../../api/journalApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { applyCurrentFiscalYearRange } from '../../utils/currentFiscalYear.js';
  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import { localizeDescription } from '../../utils/localizedDescription.js';
  import { replaceCurrencyNamesWithSymbols } from '../../utils/currencyDescription.js';
  import {
    withJournalRunningBalances,
  } from '../../utils/journalRunningBalance.js';
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

  let accounts = [];
  let currencies = [];
  let selectedCurrency = 'all';
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

    /*
     * Default to the current fiscal year. A closed year's journals therefore
     * leave the report's default view while remaining fully available through
     * the fiscal-year history; the existing custom date range still wins when
     * the user sets one.
     */
    await applyCurrentFiscalYearRange(({ from, to }) => {
      startDate = from;
      endDate = to;
    });

    try {
      /*
       * One account list for the visit: both sides of every row are named from
       * it, so no page has to look accounts up row by row.
       */
      const [accountsResponse, currenciesResponse] = await Promise.all([
        accountApi.getAll({ status: 1 }),
        currencyApi.getAll({ status: 1 }),
      ]);

      accounts = accountsResponse?.data || [];
      currencies = currenciesResponse?.data || [];

      /*
       * Same treasury account the API resolves for the report's amounts and
       * opening balances (the lowest local id), so both sides agree.
       */
      const treasuryAccounts = accounts.filter((item) => item.code === 'TREASURY');
      TREASURY_ID = treasuryAccounts.length
        ? Math.min(...treasuryAccounts.map((item) => Number(item.id)))
        : null;

      lastPageKey = `${page}|${pageSize}`;
      bootstrapped = true;
      await loadJournals({ includeSummary: true });
    } catch (error) {
      console.error('Failed to load journals report:', error);
      loadError = error?.message || t('Failed to load data.');
    } finally {
      loading = false;
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

  function getAccountName(id) {
    const acc = accounts.find((item) => Number(item.id) === Number(id)) || {};

    if (_lang === 'fa') return acc.name_fa || acc.name || '';
    if (_lang === 'ps') return acc.name_ps || acc.name || '';

    return acc.name || '';
  }

  async function ensurePeerAccounts(journalRows) {
    /*
     * The bootstrap already holds every account, so the report never has to
     * resolve names one row at a time. Kept as a guard for a page rendered
     * before that list arrives.
     */
    const have = new Set(accounts.map((item) => Number(item.id)));
    const missing = new Set();

    for (const journal of journalRows || []) {
      if (journal.first_entry_account && !have.has(Number(journal.first_entry_account))) {
        missing.add(Number(journal.first_entry_account));
      }
      if (journal.second_entry_account && !have.has(Number(journal.second_entry_account))) {
        missing.add(Number(journal.second_entry_account));
      }
    }

    if (!missing.size) return;

    const accountsResponse = await accountApi.getAll({ status: 1 });
    accounts = accountsResponse?.data || accounts;
  }

  function reportQuery(extra = {}) {
    return {
      status: 1,
      search: q.trim(),
      date_from: startDate || undefined,
      date_to: endDate || undefined,
      currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
      reference_type: typeFilter !== 'all' ? typeFilter : undefined,
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
          /*
           * The running balance of a row counts every older movement, so the
           * page asks the server for that opening total instead of downloading
           * the rest of the ledger to add it up here.
           */
          include_opening_balance: 1,
        }),
      );

      if (requestId !== loadRequestId) return;

      const rows = (journalResponse?.data || []).map(mapJournalAmounts);
      await ensurePeerAccounts(rows);

      if (requestId !== loadRequestId) return;

      processed = withJournalRunningBalances(
        rows,
        journalResponse?.opening_balance || {},
      );
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
    {
      key: 'currency',
      label: t('Currency'),
      icon: 'bi-cash-stack',
      value: selectedCurrency,
      options: [{ value: 'all', label: t('All') }, ...currencies.map((currency) => ({ value: currency.code, label: t(currency.code) }))],
    },
    {
      key: 'type',
      label: lbl('typeFilter'),
      icon: 'bi-filter',
      value: typeFilter,
      options: typeTabs.map((tab) => ({ value: tab.value, label: lbl(tab.labelKey) })),
    },
  ];

  function handleReportFilter(event) {
    const { key, value } = event.detail;

    if (key === 'startDate') startDate = value;
    if (key === 'endDate') endDate = value;
    if (key === 'currency') selectedCurrency = value;
    if (key === 'type') typeFilter = value;

    reloadFromFirstPage();
  }

  function resetReportFilters() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    startDate = '';
    endDate = '';
    q = '';
    selectedCurrency = 'all';
    typeFilter = 'all';
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

  function currencySymbol(code) {
    const normalizedCode = String(code ?? '');
    return currencies.find((item) => String(item.code ?? '') === normalizedCode)?.symbol || t(normalizedCode);
  }

  function descriptionWithCurrencySymbols(description) {
    return replaceCurrencyNamesWithSymbols(
      localizeDescription(description, $lang, t),
      currencies,
      (code) => t(code),
    );
  }

  function buildSummary(rows, type, currentLanguage) {
    void currentLanguage;

    if (!Array.isArray(rows) || rows.length === 0) return '0';

    return rows
      .map((currency) => {
        const amount = Number(currency[type] || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        });

        return `${amount} ${currencySymbol(currency.code)}`;
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

        return `${formattedAmount} ${currencySymbol(currency)}`;
      })
      .join('<br />');
  }

  /*
   * Export only: a download needs the whole filtered ledger in one array, which
   * is the one place a full sweep is still worth paying for. Viewing the report
   * no longer uses it.
   */
  async function fetchAllReportJournals() {
    const all = [];
    let exportPage = 1;
    const limit = 200;
    const seenPages = new Set();

    while (true) {
      const response = await journalApi.getAll(
        reportQuery({
          page: exportPage,
          limit,
          skip_count: 1,
        }),
      );
      const rows = response?.data || [];
      all.push(...rows);
      if (!response?.meta?.hasMore) break;

      const pageSignature = JSON.stringify(rows.map((row) => row.id));
      if (!rows.length || seenPages.has(pageSignature)) {
        throw new Error(t('Unable to complete journal pagination while calculating balances.'));
      }
      seenPages.add(pageSignature);
      exportPage += 1;
    }

    return withJournalRunningBalances(all.map(mapJournalAmounts));
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

  /* ===================== Zeno presentation helpers ===================== */

  const L = {
    fa: {
      search: 'جستجو', filter: 'فیلتر', clear: 'پاک‌کردن', show: 'نمایش',
      print: 'چاپ', download: 'دانلود', prev: 'قبلی', next: 'بعدی',
      fromDate: 'از تاریخ', toDate: 'تا تاریخ', of: 'از', to: 'تا', rows: 'ردیف',
      tx: 'معامله', all: 'همه', empty: 'با این فیلترها معامله‌ای پیدا نشد',
      typeFilter: 'نوع معامله', fromP: 'از', toP: 'به',
      creditSub: 'مجموع طلبکار دوره', debitSub: 'مجموع بدهکار دوره', balanceSub: 'مانده خالص دوره',
      journal: 'روزنامچه', sale: 'بل فروش', salePayment: 'دریافت پول',
      purchase: 'بل خرید', purchasePayment: 'پرداخت پول', transfer: 'انتقال', exchange: 'تبادله',
      reportTitle: 'گزارش روزنامچه',
    },
    ps: {
      search: 'لټون', filter: 'فلتر', clear: 'پاکول', show: 'ښکاره کول',
      print: 'چاپ', download: 'ډاونلوډ', prev: 'مخکې', next: 'وروسته',
      fromDate: 'له نیټې', toDate: 'تر نیټې', of: 'له', to: 'تر', rows: 'ردیفونه',
      tx: 'معامله', all: 'ټول', empty: 'په دې فیلترونو سره معامله ونه موندل شوه',
      typeFilter: 'د معاملې ډول', fromP: 'له', toP: 'ته',
      creditSub: 'د دورې ټول اعتبار', debitSub: 'د دورې ټول پور', balanceSub: 'د دورې خالص پاتې',
      journal: 'روزنامچه', sale: 'د خرڅلاو بل', salePayment: 'د پیسو رسید',
      purchase: 'د خرید بل', purchasePayment: 'د پیسو ورکړه', transfer: 'انتقال', exchange: 'تبادله',
      reportTitle: 'د روزنامچې راپور',
    },
    en: {
      search: 'Search', filter: 'Filter', clear: 'Clear', show: 'Show',
      print: 'Print', download: 'Download', prev: 'Prev', next: 'Next',
      fromDate: 'From date', toDate: 'To date', of: 'of', to: 'to', rows: 'Rows',
      tx: 'transactions', all: 'All', empty: 'No transactions match these filters',
      typeFilter: 'Transaction type', fromP: 'From', toP: 'To',
      creditSub: 'Total credits in range', debitSub: 'Total debits in range', balanceSub: 'Net balance in range',
      journal: 'Journal', sale: 'Sale bill', salePayment: 'Money received',
      purchase: 'Purchase bill', purchasePayment: 'Money paid', transfer: 'Transfer', exchange: 'Exchange',
      reportTitle: 'Journal report',
    },
  };

  function lbl(key) {
    return L[_lang]?.[key] || L.fa[key] || key;
  }

  function toDateObj(value) {
    const d = value instanceof Date ? value : new Date(String(value || ''));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function jalaliShort(iso) {
    const d = toDateObj(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).reduce((acc, part) => ((acc[part.type] = part.value), acc), {});
    return `${p.year}/${p.month}/${p.day}`;
  }

  function kabulTime(iso) {
    const d = toDateObj(iso);
    if (!d) return '';
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kabul', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce((acc, part) => ((acc[part.type] = part.value), acc), {});
    return p.hour ? `${p.hour}:${p.minute}` : '';
  }

  /* Journal type filter options shown inside the shared filter popover. */
  const typeTabs = [
    { value: 'all', labelKey: 'all' },
    { value: 'sale', labelKey: 'sale' },
    { value: 'sale_payment', labelKey: 'salePayment' },
    { value: 'purchase', labelKey: 'purchase' },
    { value: 'purchase_payment', labelKey: 'purchasePayment' },
    { value: 'stock_transfer', labelKey: 'transfer' },
    { value: 'exchange', labelKey: 'exchange' },
  ];
  let typeFilter = 'all';

  /* ===================== report presentation ===================== */

  $: rangeText = startDate || endDate
    ? `${jalaliShort(startDate) || '—'} ${lbl('to')} ${jalaliShort(endDate) || '—'}`
    : '';

  /* Per-currency KPI lines — SummaryCard renders one line per settlement currency. */
  $: creditLines = kpiLines(currencyInfo, 'credit');
  $: debitLines = kpiLines(currencyInfo, 'debit');
  $: balanceLines = kpiLines(currencyInfo, 'balance');

  /* ===================== KPI lines & print ===================== */

  function kpiLines(info, type) {
    return info.map((c) => ({
      v: Number(c[type] || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
      sym: currencySymbol(c.code),
    }));
  }

  function runningLines(balanceObject) {
    if (!balanceObject || typeof balanceObject !== 'object') return [];
    return Object.entries(balanceObject).map(([currency, amount]) => ({
      v: Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 }),
      sym: currencySymbol(currency),
      neg: Number(amount || 0) < 0,
    }));
  }

  function escText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function printReport() {
    const body = paginated
      .map((j) => {
        const debit = Number(j.debit || 0);
        const credit = Number(j.credit || 0);
        const time = kabulTime(j.created_at);
        return (
          '<tr>' +
          `<td dir="ltr">${escText(jalaliShort(j.date))}${time ? ' · ' + escText(time) : ''}</td>` +
          `<td>${escText(getAccountName(j.first_entry_account))}<br/>${escText(getAccountName(j.second_entry_account))}</td>` +
          `<td>${escText(descriptionWithCurrencySymbols(j.description))}</td>` +
          `<td dir="ltr">${debit ? escText(debit.toLocaleString(undefined, { maximumFractionDigits: 3 })) + ' ' + escText(currencySymbol(j.currency)) : '—'}</td>` +
          `<td dir="ltr">${credit ? escText(credit.toLocaleString(undefined, { maximumFractionDigits: 3 })) + ' ' + escText(currencySymbol(j.currency)) : '—'}</td>` +
          `<td dir="ltr">${escText(formatRunningObj(j.running))}</td>` +
          '</tr>'
        );
      })
      .join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش روزنامچه · Zeno</title><style>' +
      'body{font-family:Inter,Vazirmatn,Tahoma,sans-serif;color:#0B1530;margin:24px;font-size:11px}' +
      'table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}' +
      'th{background:#F6F8FC;border-bottom:1px solid #E7EBF3;padding:6px 8px;text-align:right;font-size:10px;color:#5B6478}' +
      'td{border-bottom:1px solid #F0F2F7;padding:6px 8px}' +
      '.hd{display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px}' +
      '</style></head><body>' +
      `<div class="hd"><b>گزارش روزنامچه · Zeno</b><span dir="ltr">${escText(rangeText)}</span></div>` +
      '<table><thead><tr><th>تاریخ</th><th>طرفین معامله</th><th>شرح</th><th>بدهکار</th><th>طلبکار</th><th>مانده</th></tr></thead><tbody>' +
      body +
      '</tbody></table><script>window.onload=function(){window.focus();window.print()}</scr' + 'ipt></body></html>',
    );
    win.document.close();
  }
</script>

<div class="jindex" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Journals Report')}
    toolbarWidth="26rem"
    showStats={showBalanceCards}
    showFooter={totalItems > 0}
    dense={true}
    contained={true}
    panelClass="journals-card"
    contentClass="journals-content"
    tablePadding={true}>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={q}
        searchPlaceholder={t('Search transactions')}
        filters={reportFilters}
        filterLabel={lbl('filter')}
        resetLabel={lbl('clear')}
        applyLabel={lbl('show')}
        showReset={true}
        on:searchChange={(event) => {
          q = event.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleReportFilter}
        on:reset={resetReportFilters}>
        <svelte:fragment slot="actions">
          <span class="journal-count">
            <b>{totalItems}</b> {lbl('tx')}
            {#if rangeText}
              <span class="journal-count__range" dir="ltr">· {rangeText}</span>
            {/if}
          </span>
        </svelte:fragment>
      </FilterToolbar>
    </svelte:fragment>

    <svelte:fragment slot="actions">
      <ActionButton
        variant="secondary"
        icon="bi-wallet2"
        label={t('Balance')}
        title={t('Balance')}
        pressed={showBalanceCards}
        on:click={() => (showBalanceCards = !showBalanceCards)} />
      <ActionButton
        variant="secondary"
        icon="bi-printer"
        label={lbl('print')}
        disabled={loading || processed.length === 0}
        on:click={printReport} />
      <ExportMenu
        disabled={loading || processed.length === 0}
        loading={generatingPDF}
        on:export={(event) => downloadReport(event.detail)} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div class="index-summary-grid">
        <SummaryCard
          icon="bi-arrow-down-left"
          tone="green"
          label={t('Credit')}
          lines={creditLines} />
        <SummaryCard
          icon="bi-arrow-up-right"
          tone="red"
          label={t('Debit')}
          lines={debitLines} />
        <SummaryCard
          icon="bi-wallet2"
          tone="blue"
          label={t('Balance')}
          lines={balanceLines} />
      </div>
    </svelte:fragment>

    {#if loading}
      <div class="index-table-state">
        <EmptyState loading={true} message={t('Loading...')} />
      </div>
    {:else if loadError}
      <div class="index-table-state">
        <EmptyState icon="bi-exclamation-triangle" message={loadError} />
      </div>
    {:else if processed.length === 0}
      <div class="index-table-state">
        <EmptyState icon="bi-journal-x" message={lbl('empty')} />
      </div>
    {:else}
      <DataTable
        ariaLabel={t('Journals Report')}
        layout="auto"
        minWidth="880px"
        dense={true}
        striped={false}
        hover={true}
        stickyHeader={true}
        mobileCards={true}>
        <svelte:fragment slot="head">
          <tr>
            <th>{t('Date')}</th>
            <th>{t('Account')}</th>
            <th>{t('Description')}</th>
            <th class="col-end">{t('Debit')}</th>
            <th class="col-end">{t('Credit')}</th>
            <th class="col-end">{t('Balance')}</th>
          </tr>
        </svelte:fragment>

        {#each paginated as journal (journal.id)}
          {@const runs = runningLines(journal.running)}
          {@const dV = Number(journal.debit || 0)}
          {@const cV = Number(journal.credit || 0)}
          <tr>
            <td>
              <span class="report-date">
                <b dir="ltr">{jalaliShort(journal.date)}</b>
                {#if kabulTime(journal.created_at)}
                  <span dir="ltr" class="report-date__time">{kabulTime(journal.created_at)}</span>
                {/if}
              </span>
            </td>

            <td>
              <span class="report-party">
                <span class="report-party__line">
                  <span class="report-side report-side--from">{lbl('fromP')}</span>
                  <span class="report-name">{getAccountName(journal.first_entry_account)}</span>
                </span>
                <span class="report-party__line">
                  <span class="report-side report-side--to">{lbl('toP')}</span>
                  <span class="report-name report-name--to">{getAccountName(journal.second_entry_account)}</span>
                </span>
              </span>
            </td>

            <td>
              <span class="report-desc" title={descriptionWithCurrencySymbols(journal.description)}>
                {descriptionWithCurrencySymbols(journal.description) || '—'}
              </span>
            </td>

            <td class="col-end">
              {#if dV}
                <span class="report-amount report-amount--dr">
                  <b dir="ltr">{dV.toLocaleString(undefined, { maximumFractionDigits: 3 })}</b>
                  <span class="report-sym">{currencySymbol(journal.currency || '')}</span>
                </span>
              {:else}
                <span class="report-dash">—</span>
              {/if}
            </td>

            <td class="col-end">
              {#if cV}
                <span class="report-amount report-amount--cr">
                  <b dir="ltr">{cV.toLocaleString(undefined, { maximumFractionDigits: 3 })}</b>
                  <span class="report-sym">{currencySymbol(journal.currency || '')}</span>
                </span>
              {:else}
                <span class="report-dash">—</span>
              {/if}
            </td>

            <td class="col-end">
              {#if runs.length}
                <span class="report-runs">
                  {#each runs as rl (rl.sym)}
                    <span class="report-amount" class:report-amount--neg={rl.neg}>
                      <b dir="ltr">{rl.v}</b>
                      <span class="report-sym">{rl.sym}</span>
                    </span>
                  {/each}
                </span>
              {:else}
                <span class="report-dash">—</span>
              {/if}
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
        {totalItems}
        rowLabel={lbl('rows')}
        {getPageNumbers}
        on:perPageChange={(event) => {
          pageSize = Number(event.detail);
          page = 1;
        }} />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<style>
  /*
   * Journals report — shares the index sheet, table, toolbar and pager with
   * every other index page; only the report's own cells are styled here.
   */
  .jindex {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
  }

  :global(.jindex > .index-page) {
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }

  /* ================= toolbar count ================= */
  .journal-count {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 600;
    color: var(--z-muted, #64748b);
    white-space: nowrap;
  }

  .journal-count b {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    color: var(--z-ink, #0b1530);
  }

  .journal-count__range {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-xs, 10.5px);
    color: var(--z-subtle, #94a3b8);
  }

  /* ================= report cells ================= */
  .report-date {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    white-space: nowrap;
  }

  .report-date b {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    letter-spacing: -0.2px;
    color: var(--z-ink, #0b1530);
  }

  .report-date__time {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-xs, 10.5px);
    font-weight: 600;
    color: var(--z-subtle, #94a3b8);
  }

  .report-party {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .report-party__line {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .report-side {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 17px;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    font-size: 9.5px;
    font-weight: 800;
  }

  .report-side--to {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .report-name {
    min-width: 0;
    overflow: hidden;
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 700;
    color: var(--z-ink, #0b1530);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .report-name--to {
    font-weight: 600;
    color: var(--z-text, #475569);
  }

  .report-desc {
    display: block;
    max-width: 34rem;
    overflow: hidden;
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 500;
    color: var(--z-text, #475569);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .report-amount {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 3px;
    white-space: nowrap;
  }

  .report-amount b {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    letter-spacing: -0.2px;
    color: var(--z-ink, #0b1530);
  }

  .report-amount--dr b {
    color: var(--z-debit, #dc2626);
  }

  .report-amount--cr b {
    color: var(--z-credit, #16a34a);
  }

  .report-amount--neg b {
    color: var(--z-debit, #dc2626);
  }

  .report-sym {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-2xs, 10px);
    font-weight: 700;
    color: var(--z-muted, #64748b);
  }

  .report-runs {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .report-dash {
    font-size: var(--z-fs-base, 12.5px);
    color: var(--z-subtle, #94a3b8);
  }

  /* ================= responsive ================= */
  @media (max-width: 900px) {
    .report-desc {
      max-width: 15rem;
    }
  }

</style>
