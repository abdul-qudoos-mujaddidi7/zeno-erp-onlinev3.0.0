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
  import ViewJournalModal from './ViewJournalModal.svelte';
  import JournalReceiptModal from './JournalReceiptModal.svelte';
  import JournalA4ReceiptModal from './JournalA4ReceiptModal.svelte';
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

  /* Row click opens the same read-only voucher the journals list shows. */
  let viewedJournal = null;
  let selectedJournal = null;
  let showReceipt = false;
  let showA4Receipt = false;

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

  /* ===================== voucher dialog ===================== */

  /*
   * The report rows are the same journals the list shows, so a click opens the
   * same read-only voucher instead of expanding anything inline. The report
   * itself stays read-only: the dialog offers no edit or delete, only print,
   * which reuses the receipt sheets the journals list already prints with.
   */
  const TYPE_META = {
    sale: ['sale', 'receipt_long', '#2F6FED'],
    sale_payment: ['salePayment', 'call_received', '#16A34A'],
    purchase: ['purchase', 'shopping_bag', '#7C5CE0'],
    purchase_payment: ['purchasePayment', 'call_made', '#D64560'],
    stock_transfer: ['transfer', 'swap_horiz', '#0EA5E9'],
    exchange: ['exchange', 'currency_exchange', '#7C3AED'],
    sale_return: ['sale', 'assignment_return', '#DB2777'],
  };

  function typeMeta(journal) {
    const meta = TYPE_META[journal?.reference_type];
    if (meta) return { label: lbl(meta[0]), icon: meta[1], color: meta[2] };
    return { label: lbl('journal'), icon: 'edit_note', color: '#0891B2' };
  }

  function fmtAmount(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function gregorianShort(value) {
    const date = toDateObj(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(date);
  }

  /*
   * Both legs, read from the raw columns: the row's own debit/credit are the
   * treasury-netted amounts the report prints, not the two postings.
   */
  function voucherLegs(journal) {
    return [
      {
        id: journal.first_entry_account,
        dr: Number(journal.first_entry_debit || 0),
        cr: Number(journal.first_entry_credit || 0),
      },
      {
        id: journal.second_entry_account,
        dr: Number(journal.second_entry_debit || 0),
        cr: Number(journal.second_entry_credit || 0),
      },
    ].filter((leg) => leg.dr || leg.cr);
  }

  function voucherView(journal) {
    const meta = typeMeta(journal);
    const legs = voucherLegs(journal);
    const symbol = currencySymbol(journal.currency);
    const totalDr = legs.reduce((sum, leg) => sum + leg.dr, 0);
    const totalCr = legs.reduce((sum, leg) => sum + leg.cr, 0);
    const linked = journal.reference_type !== 'account' && journal.reference_id != null;

    const story = [
      { side: 'dr', icon: 'north_west', rows: legs.filter((leg) => leg.dr) },
      { side: 'cr', icon: 'south_east', rows: legs.filter((leg) => leg.cr) },
    ]
      .filter((group) => group.rows.length)
      .map((group) => ({
        side: group.side,
        icon: group.icon,
        names: group.rows.map((leg) => getAccountName(leg.id) || '—').join('، '),
        amount: `${symbol}\u200E ${fmtAmount(group.rows.reduce((sum, leg) => sum + (leg.dr || leg.cr), 0))}`,
      }));

    return {
      no: journal.reference || `#${journal.id}`,
      typeLabel: meta.label,
      typeIcon: meta.icon,
      typeColor: meta.color,
      active: Number(journal.status) === 1,
      dateText: jalaliShort(journal.date),
      gregorian: gregorianShort(journal.date),
      time: '',
      description: descriptionWithCurrencySymbols(journal.description) || '—',
      lines: legs.map((leg, index) => ({
        key: `${leg.id}-${index}`,
        name: getAccountName(leg.id) || '—',
        dr: leg.dr ? fmtAmount(leg.dr) : '',
        cr: leg.cr ? fmtAmount(leg.cr) : '',
      })),
      story,
      totalDr: fmtAmount(totalDr),
      totalCr: fmtAmount(totalCr),
      balanced: Math.abs(totalDr - totalCr) < 0.005,
      sourceLabel: linked ? `#${journal.reference_id}` : '',
      sourceType: linked ? meta.label : '',
      editMode: 'none',
      canDelete: false,
    };
  }

  $: voucherData = viewedJournal ? voucherView(viewedJournal) : null;

  function openJournal(journal) {
    viewedJournal = journal;
  }

  function printViewedJournal() {
    const journal = viewedJournal;
    viewedJournal = null;
    if (!journal) return;
    selectedJournal = journal;
    showA4Receipt = true;
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
      download: 'دانلود', prev: 'قبلی', next: 'بعدی',
      fromDate: 'از تاریخ', toDate: 'تا تاریخ', of: 'از', to: 'تا', rows: 'ردیف',
      tx: 'معامله', all: 'همه', empty: 'با این فیلترها معامله‌ای پیدا نشد',
      typeFilter: 'نوع معامله', fromP: 'از', toP: 'به',
      creditSub: 'مجموع طلبکار دوره', debitSub: 'مجموع بدهکار دوره', balanceSub: 'مانده خالص دوره',
      journal: 'روزنامچه', sale: 'فروش', salePayment: 'بل فروش',
      purchase: 'بل خرید', purchasePayment: 'پرداخت خرید', transfer: 'انتقال', exchange: 'تبادله',
      reportTitle: 'گزارش روزنامچه',
    },
    ps: {
      search: 'لټون', filter: 'فلتر', clear: 'پاکول', show: 'ښکاره کول',
      download: 'ډاونلوډ', prev: 'مخکې', next: 'وروسته',
      fromDate: 'له نیټې', toDate: 'تر نیټې', of: 'له', to: 'تر', rows: 'ردیفونه',
      tx: 'معامله', all: 'ټول', empty: 'په دې فیلترونو سره معامله ونه موندل شوه',
      typeFilter: 'د معاملې ډول', fromP: 'له', toP: 'ته',
      creditSub: 'د دورې ټول اعتبار', debitSub: 'د دورې ټول پور', balanceSub: 'د دورې خالص پاتې',
      journal: 'روزنامچه', sale: 'خرڅلاو', salePayment: 'د خرڅلاو بل',
      purchase: 'د خرید بل', purchasePayment: 'د خرید تادیه', transfer: 'انتقال', exchange: 'تبادله',
      reportTitle: 'د روزنامچې راپور',
    },
    en: {
      search: 'Search', filter: 'Filter', clear: 'Clear', show: 'Show',
      download: 'Download', prev: 'Prev', next: 'Next',
      fromDate: 'From date', toDate: 'To date', of: 'of', to: 'to', rows: 'Rows',
      tx: 'transactions', all: 'All', empty: 'No transactions match these filters',
      typeFilter: 'Transaction type', fromP: 'From', toP: 'To',
      creditSub: 'Total credits in range', debitSub: 'Total debits in range', balanceSub: 'Net balance in range',
      journal: 'Journal', sale: 'Sale', salePayment: 'Sale bill',
      purchase: 'Purchase bill', purchasePayment: 'Purchase payment', transfer: 'Transfer', exchange: 'Exchange',
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

  /*
   * Same shape as the journals list: `1405/06/17 – 1405/07/16`. The Persian
   * «تا» separator the report used to print sat inside a dir="ltr" span, so it
   * rendered as a stray glyph between the two dates.
   */
  $: rangeText = (() => {
    const from = jalaliShort(startDate);
    const to = jalaliShort(endDate);
    if (from && to) return `${from} – ${to}`;
    if (to) return `${lbl('to')} ${to}`;
    return from || '';
  })();

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

</script>

<div class="jindex" dir={t('dir')}>
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Journals Report')}
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
          {#if rangeText}
            <span class="journal-range" dir="ltr">{rangeText}</span>
          {/if}
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
            <th class="col-end">{t('Debit')}</th>
            <th class="col-end">{t('Credit')}</th>
            <th class="col-end">{t('Balance')}</th>
          </tr>
        </svelte:fragment>

        {#each paginated as journal (journal.id)}
          {@const runs = runningLines(journal.running)}
          {@const dV = Number(journal.debit || 0)}
          {@const cV = Number(journal.credit || 0)}
          <tr
            class="report-row"
            role="button"
            tabindex="0"
            aria-haspopup="dialog"
            on:click={() => openJournal(journal)}
            on:keydown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openJournal(journal);
              }
            }}>
            <td>
              <b class="report-date" dir="ltr">{jalaliShort(journal.date)}</b>
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

            <td class="col-end">
              {#if dV}
                <span class="report-amount report-amount--dr">
                  <b dir="ltr">{dV.toLocaleString(undefined, { maximumFractionDigits: 3 })}</b>
                  <span class="report-sym">{currencySymbol(journal.currency || '')}</span>
                </span>
              {/if}
            </td>

            <td class="col-end">
              {#if cV}
                <span class="report-amount report-amount--cr">
                  <b dir="ltr">{cV.toLocaleString(undefined, { maximumFractionDigits: 3 })}</b>
                  <span class="report-sym">{currencySymbol(journal.currency || '')}</span>
                </span>
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

  {#if voucherData}
    <ViewJournalModal
      view={voucherData}
      on:close={() => (viewedJournal = null)}
      on:print={printViewedJournal} />
  {/if}

  {#if showReceipt}
    <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
  {/if}
  {#if showA4Receipt}
    <JournalA4ReceiptModal
      journal={selectedJournal}
      on:close={() => (showA4Receipt = false)}
      on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
  {/if}
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

  /* ================= toolbar date range ================= */
  /* The transaction count is gone; only the range the report is scoped to
     stays, in LTR Inter-700 against --z-text. */
  .journal-range {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-sm, 11.5px);
    font-weight: 700;
    color: var(--z-text, #475569);
    white-space: nowrap;
  }

  /* ================= report cells ================= */
  /* The whole row is the «نمایش» control, exactly like the journals list. */
  .report-row {
    cursor: pointer;
  }

  .report-row:focus-visible {
    outline: 2px solid var(--z-brand, #2f6fed);
    outline-offset: -2px;
  }

  /* The date stands alone: the row's Kabul time was dropped from the column. */
  .report-date {
    font-family: var(--z-font-num);
    font-size: var(--z-fs-base, 12.5px);
    font-weight: 800;
    letter-spacing: -0.2px;
    color: var(--z-ink, #0b1530);
    white-space: nowrap;
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

  /*
   * Plain direction words. The tinted pills behind «از» / «به» read as a badge
   * and boxed in two prepositions, so only the colour is left.
   */
  .report-side {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    font-size: 9.5px;
    font-weight: 800;
    color: var(--z-text, #475569);
  }

  .report-side--to {
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

  /*
   * A body cell carries 6px of inline padding while a header cell carries 12,
   * so every figure in the amount columns sat a few pixels outside the heading
   * it belongs to. Both edges now match, the way the reference report reads.
   */
  :global(.jindex .data-table thead th.col-end),
  :global(.jindex .data-table tbody td.col-end) {
    padding-inline: 12px;
  }

  /* The outermost column keeps the wider 16px edge inset its header uses. */
  :global(.jindex .data-table thead th.col-end:last-child),
  :global(.jindex .data-table tbody td.col-end:last-child) {
    padding-inline-end: 16px;
  }

</style>
