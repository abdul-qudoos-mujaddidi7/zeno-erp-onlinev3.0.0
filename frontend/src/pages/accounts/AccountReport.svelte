<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { journalApi } from '../../api/journalApi.js';
  import { accountApi } from '../../api/accountApi.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { accountTypeApi } from '../../api/accountTypeApi.js';
  import { accountImageApi } from '../../api/accountImageApi.js';
  import { fiscalYearApi } from '../../api/fiscalYearApi.js';
  import { t, lang, translate_org_type, shortID } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../lib/pagination.js';
  import { localizeDescription } from '../../utils/localizedDescription.js';
  import { accountRunningBalance } from '../../utils/accountRunningBalance.js';

  import EditJournalModal from '../journals/EditJournalModal.svelte';

  import { showDate, setDatePickers } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';
  import { applyCurrentFiscalYearRange } from '../../utils/currentFiscalYear.js';
  import { isWorkingFiscalYearRange } from '../../utils/fiscalYearSelection.js';
  import {
    toDateOnly,
    toOpeningBalanceRows,
  } from '../../utils/openingBalanceRows.js';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import ExportMenu from '../../components/common/ExportMenu.svelte';
  export let id;

  import JournalReceiptModal from '../journals/JournalReceiptModal.svelte';
  let showReceipt = false;
  let selectedJournal = null;

  import { generatePDF } from '../generatePDF.js';
  import { generateExcel } from '../generateExcel.js';
  let exportingReport = false;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  let componentRoot = null;
  let accounts = [];
  let currencies = [];
  let selectedCurrency = 'all';
  let account = null;
  let accountType = null;
  let imageUrl = null;
  let journals = [];
  let computedBalance = {}; // per-currency computed balances

  /*
   * Canonical per-currency balances and credit/debit totals computed
   * from the journals ledger (accounts.balance is a stale column that
   * is never maintained in the online version).
   */
  let accountBalances = {};
  let accountCreditDebit = {};

  /*
   * Lifetime figures (all years) and the fiscal-year scoped ones.
   *
   * When the screen is showing a fiscal year, the displayed balance must be
   * `opening balance of that year + that year's movement`. Using the lifetime
   * balance instead would mix closed years into the running balance and the
   * summary cards, and the opening row would be missing entirely.
   */
  let lifetimeBalances = {};
  let lifetimeCreditDebit = {};
  let workingFiscalYear = null;
  let fiscalYearBalances = null;
  let fiscalYearCreditDebit = null;
  let openingBalanceRows = [];

  /** True when the visible date range is exactly the working fiscal year. */
  function fiscalYearInScope() {
    return isWorkingFiscalYearRange(workingFiscalYear, startDate, endDate);
  }

  /*
   * Picks the source of the summary cards and of the running-balance seed: the
   * working fiscal year's opening + movement while its range is shown, the
   * lifetime ledger otherwise. Called whenever the range changes.
   */
  function applyBalanceScope() {
    const scoped = fiscalYearInScope() && fiscalYearBalances !== null;

    accountBalances = scoped ? fiscalYearBalances : lifetimeBalances;
    accountCreditDebit = scoped
      ? fiscalYearCreditDebit || {}
      : lifetimeCreditDebit;
    computedBalance = buildCanonicalSummary();
  }

  /**
   * Turns `fiscal_years/:id/accounts/:accountId/statement` lines into the
   * per-currency shapes this page already uses.
   */
  function scopeFromStatement(statement) {
    const balances = {};
    const creditDebit = {};

    for (const line of statement?.lines || []) {
      const key = line.currency || account?.currency || 'DEFAULT';

      balances[key] = Number(line.closing_balance) || 0;
      creditDebit[key] = {
        credit: Number(line.credit) || 0,
        debit: Number(line.debit) || 0,
      };
    }

    return { balances, creditDebit };
  }

  /*
   * The opening balance row(s) of the working fiscal year, shown as the first
   * line of the statement. These are snapshots the close wrote, not journals,
   * so the row is synthetic: it carries no journal id and no actions.
   */
  function openingRowsForStatement() {
    return openingBalanceRows.map((row, index) => ({
      id: `opening-balance-${index}`,
      is_opening_balance: true,
      date: row.date,
      currency: row.currency || account?.currency || 'DEFAULT',
      description: row.description,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0,
      running: {
        [row.currency || account?.currency || 'DEFAULT']:
          Number(row.balance) || 0,
      },
    })).filter((row) => selectedCurrency === 'all' || row.currency === selectedCurrency);
  }

  /*
   * The opening balance row of the fiscal year the visible range STARTS on.
   *
   * Right after a year is closed, the year the close just opened has no
   * journals at all, so this single row is the only thing this screen can show
   * — and it is the row an operator looks for ("what did this account start
   * with?"). It must therefore never depend on the year's statement being
   * readable, and it must not require the visible year to be the *working* year:
   * any year range the user selects shows that year's opening line.
   *
   * The data is the stored opening balance itself (the record the close writes),
   * read straight from the roll-forward endpoint. The row belongs to the top of
   * a range when the range begins on the year's first day.
   */
  async function loadOpeningRowsForRange(accountIdValue) {
    openingBalanceRows = [];

    if (!accountIdValue || !startDate) return;

    try {
      const years = await loadFiscalYears();
      const from = toDateOnly(startDate);
      const year = years.find((item) => toDateOnly(item.start_date) === from);

      if (!year) return;

      const received = await openingBalancesOf(year.id ?? year.local_id);

      /*
       * `ensureAccount` makes the row appear for THIS account even when the
       * close carried no balance for it: an account that starts the year at zero
       * still starts the year at zero, and the screen says so instead of showing
       * nothing. Only when the year really was carried forward.
       */
      openingBalanceRows = toOpeningBalanceRows({
        fiscalYear: year,
        rows: received.filter(
          (row) => String(row.account_id) === String(accountIdValue),
        ),
        ensureAccount: {
          id: accountIdValue,
          name: account?.name ?? null,
          currency: account?.currency ?? null,
        },
      });
    } catch (error) {
      openingBalanceRows = [];

      if (import.meta.env?.DEV) {
        console.warn('Opening balance lookup failed:', error?.message);
      }
    }
  }

  /*
   * The fiscal-year list is fetched once per session; the opening balances are
   * fetched fresh every time, because a close or a reopen changes them and a
   * stale row would be an accounting statement that is no longer true.
   */
  let fiscalYearsCache = null;

  async function loadFiscalYears() {
    if (fiscalYearsCache) return fiscalYearsCache;

    try {
      const response = await fiscalYearApi.getAll();

      fiscalYearsCache = response?.data || [];
    } catch (error) {
      fiscalYearsCache = [];
    }

    return fiscalYearsCache;
  }

  async function openingBalancesOf(fiscalYearId) {
    if (!fiscalYearId) return [];

    try {
      const response = await fiscalYearApi.getOpeningBalances(fiscalYearId);

      return response?.data?.received || [];
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.warn('Opening balance lookup failed:', error?.message);
      }

      return [];
    }
  }

  function buildCanonicalSummary() {
    const summary = {};
    const currencies = new Set([
      ...Object.keys(accountBalances || {}),
      ...Object.keys(accountCreditDebit || {}),
    ]);

    for (const currency of currencies) {
      const cd = accountCreditDebit?.[currency] || { credit: 0, debit: 0 };
      summary[currency] = {
        debit: Number(cd.debit) || 0,
        credit: Number(cd.credit) || 0,
        balance: Number(accountBalances?.[currency]) || 0,
      };
    }

    return summary;
  }

  let modalRef;

  let PAYABLE_ID = null;
  let RECEIVABLE_ID = null;
  let TREASURY_ID = null;

  function handleDateChange(inputName, value) {
    if (inputName === 'startDate') startDate = value;
    else if (inputName === 'endDate') endDate = value;
    page = 1;
    lastPageKey = `1|${pageSize}`;

    /*
     * A hand-edited range is no longer the fiscal year, so the opening row and
     * the year-scoped balance stop applying (they belong to the year's range).
     */
    applyBalanceScope();

    if (account?.id) loadJournals(account.id);
  }

  async function loadAccounts() {
    const [payableResponse, receivableResponse, treasuryResponse] =
      await Promise.all([
        accountApi.getAll({ status: 1, code: 'PAYABLE' }),
        accountApi.getAll({ status: 1, code: 'RECEIVABLE' }),
        accountApi.getAll({ status: 1, code: 'TREASURY' }),
      ]);

    PAYABLE_ID = payableResponse?.data?.[0]?.id || null;
    RECEIVABLE_ID = receivableResponse?.data?.[0]?.id || null;
    TREASURY_ID = treasuryResponse?.data?.[0]?.id || null;

    const systemAccounts = [
      payableResponse?.data?.[0],
      receivableResponse?.data?.[0],
      treasuryResponse?.data?.[0],
    ].filter(Boolean);

    accounts = systemAccounts;
  }

  async function ensurePeerAccounts(journalRows) {
    const needed = new Set();
    for (const j of journalRows) {
      if (j.first_entry_account) needed.add(Number(j.first_entry_account));
      if (j.second_entry_account) needed.add(Number(j.second_entry_account));
    }

    const have = new Set(accounts.map((a) => Number(a.id)));
    const missing = [...needed].filter((accountId) => !have.has(accountId));
    if (!missing.length) return;

    /*
     * Many distinct peers (e.g. treasury) — one accounts list is cheaper
     * than hundreds of getById round-trips.
     */
    if (missing.length > 40) {
      const accountsResponse = await accountApi.getAll({ status: 1 });
      accounts = accountsResponse?.data || accounts;
      return;
    }

    const fetched = await Promise.all(
      missing.map((accountId) => accountApi.getById(accountId).then((res) => res?.data).catch(() => null)),
    );

    accounts = [...accounts, ...fetched.filter(Boolean)];
  }

  function getAccountName(accountId) {
    const acc = accounts.find((a) => Number(a.id) === Number(accountId)) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }

  onMount(async () => {
    await Promise.all([
      loadAccounts(),
      currencyApi.getAll({ status: 1 }).then((response) => {
        currencies = response?.data || [];
      }),
    ]);
    tick().then(() => setDatePickers(handleDateChange, componentRoot));
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  // Filters & pagination (server-side, same pattern as JournalsIndex)
  let q = '';
  let page = 1;
  let pageSize = DEFAULT_PAGE_SIZE;
  const pageSizes = PAGE_SIZE_OPTIONS;
  let totalPages = 1;
  let listLoading = false;
  let bootstrapped = false;
  let lastPageKey = '';
  let loadRequestId = 0;
  let searchDebounceTimer = null;

  let loadedAccountId = null;

  $: if (id && Number(id) !== loadedAccountId) {
    loadedAccountId = Number(id);
    loadAccount(id);
  }

  let processed = [];
  let paginated = [];

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  let startDate = '';
  let endDate = '';

  function buildProcessedRows(accountId, rows) {
    const pageRows = [];
    for (const j of rows) {
      let debit = 0;
      let credit = 0;

      if (Number(j.first_entry_account) === Number(accountId)) {
        debit += Number(j.first_entry_debit) || 0;
        credit += Number(j.first_entry_credit) || 0;
      }

      if (Number(j.second_entry_account) === Number(accountId)) {
        debit += Number(j.second_entry_debit) || 0;
        credit += Number(j.second_entry_credit) || 0;
      }

      if (debit !== 0 || credit !== 0) {
        pageRows.push({
          ...j,
          description: j.description || '',
          debit,
          credit,
          currency: j.currency,
        });
      }
    }

    return pageRows.map((j) => ({
      ...j,
      running: accountRunningBalance(j, accountBalances, account?.currency),
    }));
  }

  async function loadAccount(accountId) {
    if (!accountId) return;

    summaryLoading = true;
    listLoading = true;

    journals = [];
    processed = [];
    paginated = [];
    computedBalance = {};

    try {
      if (!accounts.length) {
        await loadAccounts();
      }

      const accountResponse = await accountApi.getById(accountId);
      account = accountResponse?.data || null;

      if (!account) {
        accountType = null;
        imageUrl = null;
        summaryLoading = false;
        listLoading = false;
        return;
      }

      /*
       * Load the canonical journal-derived balances (accounts.balance is
       * a stale column). These drive both the summary cards and the
       * running-balance seed, so they match the account overview page.
       */
      const key = String(accountId);
      const [balancesRes, creditDebitRes] = await Promise.all([
        accountApi
          .getBalances({ status: 1, account_ids: key })
          .catch(() => null),
        accountApi
          .getCreditDebit({ status: 1, account_ids: key })
          .catch(() => null),
      ]);

      lifetimeBalances =
        balancesRes?.data?.[key] || balancesRes?.data?.[accountId] || {};
      lifetimeCreditDebit =
        creditDebitRes?.data?.[key] ||
        creditDebitRes?.data?.[accountId] ||
        {};
      accountBalances = lifetimeBalances;
      accountCreditDebit = lifetimeCreditDebit;
      computedBalance = buildCanonicalSummary();

      accountType = account.account_type_id
        ? (await accountTypeApi.getById(account.account_type_id))?.data || null
        : null;

      const img = (await accountImageApi.getAll({ status: 1, account_id: account.id }))?.data?.[0];

      if (!img?.image) {
        imageUrl = null;
      } else if (typeof img.image === 'string') {
        imageUrl = img.image;
      } else {
        try {
          imageUrl = URL.createObjectURL(img.image);
        } catch (error) {
          console.error('Failed to create the account image URL:', error);
          imageUrl = null;
        }
      }

      /*
       * Default to the current fiscal year (if one is configured) so a closed
       * year's journals stop appearing here, while the custom date range and
       * the fiscal-year history can still show them.
       */
      workingFiscalYear = null;
      fiscalYearBalances = null;
      fiscalYearCreditDebit = null;
      openingBalanceRows = [];

      const fyRange = await applyCurrentFiscalYearRange((range) => {
        workingFiscalYear = range;
        startDate = range.from;
        endDate = range.to;
      });

      if (!fyRange) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 365);
        startDate = start.toISOString().slice(0, 10);
        endDate = end.toISOString().slice(0, 10);
      } else {
        /*
         * The year's own statement supplies two things the lifetime ledger
         * cannot: the opening balance the close carried into this year, and the
         * year-scoped movement totals. Failure is not fatal — the screen falls
         * back to the lifetime figures rather than showing nothing.
         */
        const statement = await fiscalYearApi
          .getAccountStatement(fyRange.id, accountId)
          .then((response) => response?.data || null)
          .catch((error) => {
            console.warn('Fiscal-year statement lookup failed:', error?.message);

            return null;
          });

        if (statement) {
          const scope = scopeFromStatement(statement);

          fiscalYearBalances = scope.balances;
          fiscalYearCreditDebit = scope.creditDebit;
        }
      }

      /*
       * Resolved AFTER the range was applied: the opening row belongs to the
       * fiscal year the visible range starts on, whatever that year is.
       */
      await loadOpeningRowsForRange(accountId);

      /* the cards and the running-balance seed follow the visible range */
      applyBalanceScope();

      q = '';
      page = 1;
      lastPageKey = `${page}|${pageSize}`;
      bootstrapped = true;

      await loadJournals(account.id);

      await tick();
      summaryLoading = false;
      await tick();
    } catch (error) {
      console.error('Failed to load the account report:', error);

      account = null;
      accountType = null;
      journals = [];
      processed = [];
      paginated = [];
      computedBalance = {};
      summaryLoading = false;
      listLoading = false;
    }
  }

  async function deleteJournal(journalId) {
    await journalApi.remove(journalId);
    await loadJournals(account.id);
  }

  async function loadJournals(accountId) {
    if (!accountId) return;

    const requestId = ++loadRequestId;
    const requestedPage = page;
    const requestedPageSize = pageSize;
    lastPageKey = `${page}|${pageSize}`;
    listLoading = true;

    try {
      const journalResponse = await journalApi.getAll({
        status: 1,
        account_id: Number(accountId),
        search: q.trim(),
        currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
        date_from: startDate || undefined,
        date_to: endDate || undefined,
        page: requestedPage,
        limit: requestedPageSize,
        skip_count: 1,
        include_running_balance: 1,
        balance_date_to: fiscalYearInScope() && fiscalYearBalances !== null
          ? endDate : undefined,
      });

      if (requestId !== loadRequestId) return;

      const rows = journalResponse?.data || [];
      await ensurePeerAccounts(rows);
      if (requestId !== loadRequestId) return;

      /*
       * The opening row is shown whenever the visible range starts on a fiscal
       * year's first day — it is the top line of that year's statement, so it is
       * not tied to the "working" year any more.
       */
      const openingRows = openingRowsForStatement();

      processed = [
        ...(requestedPage === 1 ? openingRows : []),
        ...buildProcessedRows(accountId, rows),
      ];
      journals = processed;
      paginated = processed;

      const hasMore = Boolean(journalResponse?.meta?.hasMore);
      totalPages = hasMore
        ? requestedPage + 1
        : Math.max(requestedPage, 1);
    } catch (error) {
      if (requestId !== loadRequestId) return;
      console.error('Failed to load account report journals:', error);
      processed = [];
      journals = [];
      paginated = [];
      totalPages = 1;
    } finally {
      if (requestId === loadRequestId) listLoading = false;
    }
  }

  $: if (bootstrapped && account?.id) {
    void page;
    void pageSize;
    const key = `${page}|${pageSize}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      loadJournals(account.id);
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (page !== 1) page = 1;
      else if (account?.id) loadJournals(account.id);
    }, 300);
  }

  function fmtDate(d) {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleString();
    } catch (e) {
      return d;
    }
  }

  function formatAmountInline(amount, currency) {
    return `<span class="amount-inline"><span dir="ltr">${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span><span>${t(currency)}</span></span>`;
  }

  function formatRunningObj(obj) {
    if (!obj) return '-';
    return Object.keys(obj)
      .filter((currency) => selectedCurrency === 'all' || currency === selectedCurrency)
      .map((k) => formatAmountInline(obj[k], k))
      .join('<br />');
  }

  function goBack() {
    push('/dashboard/accounts');
  }

  function getCurrencyInfoArray(obj, currencyFilter = selectedCurrency) {
    let arr = [];
    for (const k in obj) {
      if (currencyFilter !== 'all' && k !== currencyFilter) continue;
      arr.push({
        code: k,
        debit: obj[k].debit,
        credit: obj[k].credit,
        balance: obj[k].balance,
        color: k === account?.currency ? 'primary' : 'success',
      });
    }
    return arr;
  }

  function formatSummaryValues(balance, type, currencyFilter) {
    return getCurrencyInfoArray(balance, currencyFilter)
      .map((cur) => `<div class="summary-currency-line">${formatAmountInline(cur[type], cur.code)}</div>`)
      .join('') || '0';
  }

  $: reportToolbarFilters = [
    {
      key: 'currency', label: t('Currency'), icon: 'bi-cash-stack', value: selectedCurrency,
      options: [{ value: 'all', label: t('All') }, ...currencies.map((currency) => ({ value: currency.code, label: t(currency.code) }))],
    },
    { key: 'startDate', label: t('From Date'), value: startDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'endDate', label: t('To Date'), value: endDate, icon: 'bi-calendar3', type: 'date' },
  ];

  async function handleReportFilterChange(event) {
    if (event.detail.key === 'currency') selectedCurrency = event.detail.value;
    if (event.detail.key === 'startDate') startDate = event.detail.value;
    if (event.detail.key === 'endDate') endDate = event.detail.value;
    page = 1;
    lastPageKey = `1|${pageSize}`;
    applyBalanceScope();

    if (account?.id) {
      await loadOpeningRowsForRange(account.id);
      await loadJournals(account.id);
    }
  }

  async function resetReportFilters() {
    q = '';
    selectedCurrency = 'all';
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 365);
    startDate = start.toISOString().slice(0, 10);
    endDate = end.toISOString().slice(0, 10);
    page = 1;
    applyBalanceScope();
    lastPageKey = `1|${pageSize}`;

    if (account?.id) {
      await loadOpeningRowsForRange(account.id);
      await loadJournals(account.id);
    }
  }

  function getPageNumbers(current, total) {
    const pages = [];
    for (let i = 1; i <= total; i += 1) {
      if (i === 1 || i === total || Math.abs(i - current) <= 2) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  }

  async function exportReport(format = 'pdf') {
    if (exportingReport) return;

    exportingReport = true;

    try {
      await tick();
      const exporter = format === 'excel' ? generateExcel : generatePDF;

      await exporter(
        'account_financial_report',
        processed,
        startDate,
        endDate,
        processed.length,
        getCurrencyInfoArray(computedBalance),
        account,
      );
    } catch (error) {
      console.error('Failed to generate the account financial report:', error);
    } finally {
      exportingReport = false;
    }
  }

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;
  // Open the summary automatically when this page is first displayed.
  let showSummaryCards = true;
  let summaryLoading = true;
  let summaryReady = false;

  let summaryCurrencies = [];
  let creditSummary = '0';
  let debitSummary = '0';
  let balanceSummary = '0';
  let summaryRenderKey = 'empty';

  $: summaryCurrencies = getCurrencyInfoArray(computedBalance, selectedCurrency);

  $: creditSummary =
    summaryCurrencies.length > 0
      ? formatSummaryValues(computedBalance, 'credit', selectedCurrency)
      : '0';

  $: debitSummary =
    summaryCurrencies.length > 0
      ? formatSummaryValues(computedBalance, 'debit', selectedCurrency)
      : '0';

  $: balanceSummary =
    summaryCurrencies.length > 0
      ? formatSummaryValues(computedBalance, 'balance', selectedCurrency)
      : '0';

  /*
   * The summary may display zero values when an account has no journals,
   * but it must not display before the account load has completed.
   */
  $: summaryReady = !summaryLoading && account !== null;

  /*
   * SummaryCard is remounted whenever its calculated values change.
   * This prevents its slot from keeping the empty first-render content.
   */
  $: summaryRenderKey =
    summaryCurrencies.length > 0
      ? summaryCurrencies
          .map(
            (currency) =>
              `${currency.code}:${currency.credit}:${currency.debit}:${currency.balance}`,
          )
          .join('|')
      : `empty:${account?.id || 'none'}`;

  function getReportActions(journal) {
    const actions = [];

    /* an opening-balance snapshot is not a journal: nothing to view or edit */
    if (journal.is_opening_balance) {
      return actions;
    }

    if (journal.reference_type !== 'account' && journal.reference_id) {
      const saleId =
        journal.reference_sale_id ||
        (journal.reference_type === 'sale' ? journal.reference_id : null);
      const purchaseId =
        journal.reference_purchase_id ||
        (journal.reference_type === 'purchase' ? journal.reference_id : null);

      const routes = {
        stock_transfer: `/dashboard/stock-transfers/${journal.reference_id}`,
        sale: saleId ? `/dashboard/sales/${saleId}` : null,
        sale_payment: saleId ? `/dashboard/sales/${saleId}` : null,
        purchase: purchaseId ? `/dashboard/purchases/${purchaseId}` : null,
        purchase_payment: purchaseId ? `/dashboard/purchases/${purchaseId}` : null,
        exchange: '/dashboard/exchanges/list',
      };
      const route = routes[journal.reference_type];
      if (route) {
        actions.push({
          icon: 'bi-eye',
          label: t('View'),
          tone: 'view',
          onClick: () => push(route),
        });
      }
    } else {
      if (permissions?.some((p) => p.code === 'Journals' && p.edit)) {
        actions.push({
          icon: 'bi-pencil',
          label: t('Edit'),
          tone: 'edit',
          onClick: () => modalRef.openModal(journal.id),
        });
      }
      if (permissions?.some((p) => p.code === 'Journals' && p.delete)) {
        actions.push({
          icon: 'bi-trash',
          label: t('Delete'),
          tone: 'delete',
          onClick: async () => {
            const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));
            if (ok) deleteJournal(journal.id);
          },
        });
      }
    }
    actions.push({
      icon: 'bi-printer',
      label: t('Print'),
      tone: 'view',
      onClick: () => {
        selectedJournal = journal;
        showReceipt = true;
      },
    });
    return actions;
  }
</script>

<!-- Transactions section (full width) -->

<div bind:this={componentRoot} class="account-report-page">
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Account Report')}
    showStats={showSummaryCards && summaryReady}
    showFooter={processed.length > 0 || listLoading}
    dense={true}
    tablePadding={true}>
    <svelte:fragment slot="actions">
      <ExportMenu
        extraClass="pdf-btn"
        loading={exportingReport}
        disabled={exportingReport || processed.length === 0}
        on:export={(event) => exportReport(event.detail)}
      />
      <button
        type="button"
        class="index-settings-button"
        class:is-active={showSummaryCards}
        aria-label={t('Financial summary')}
        aria-expanded={showSummaryCards}
        title={t('Financial summary')}
        disabled={summaryLoading}
        on:click={() => {
          if (!summaryLoading) {
            showSummaryCards = !showSummaryCards;
          }
        }}>
        {#if summaryLoading}
          <span
            class="spinner-border spinner-border-sm"
            role="status"
            aria-hidden="true"></span>
        {:else}
          <i
            class="bi {showSummaryCards ? 'bi-x-lg' : 'bi-wallet2'}"
            aria-hidden="true"></i>
        {/if}
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={q}
        searchPlaceholder={t('Search transactions')}
        filters={reportToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(event) => {
          q = event.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleReportFilterChange}
        on:reset={resetReportFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      {#if showSummaryCards && summaryReady}
        {#key summaryRenderKey}
          <div class="index-summary-grid account-report-summary">
            <SummaryCard
              label={t('Credit')}
              icon="bi-arrow-down-left"
              tone="green">
              <div class="report-summary-values">
                {#if summaryCurrencies.length}
                  {#each summaryCurrencies as cur}
                    <div class="summary-currency-line">{@html formatAmountInline(cur.credit, cur.code)}</div>
                  {/each}
                {:else}0{/if}
              </div>
            </SummaryCard>

            <SummaryCard
              label={t('Debit')}
              icon="bi-arrow-up-right"
              tone="amber">
              <div class="report-summary-values">
                {#if summaryCurrencies.length}
                  {#each summaryCurrencies as cur}
                    <div class="summary-currency-line">{@html formatAmountInline(cur.debit, cur.code)}</div>
                  {/each}
                {:else}0{/if}
              </div>
            </SummaryCard>

            <SummaryCard
              label={t('Balance')}
              icon="bi-wallet2"
              tone="cyan">
              <div class="report-summary-values">
                {#if summaryCurrencies.length}
                  {#each summaryCurrencies as cur}
                    <div class="summary-currency-line">{@html formatAmountInline(cur.balance, cur.code)}</div>
                  {/each}
                {:else}0{/if}
              </div>
            </SummaryCard>
          </div>
        {/key}
      {/if}
    </svelte:fragment>

  {#if false}
  <div class="mb-3 row">
    <div class="col-md-2">
      <input
        class="form-control form-control-sm"
        placeholder={t('Search transactions')}
        bind:value={q}
        on:input={() => (page = 1)}
        style="max-width:320px;" />
    </div>
    <div class="col-md-2">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="startDate" bind:value={startDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-2">
      <div class="input-group input-group-sm persianDatePicker">
        <input type="date" class="form-control" data-bind="endDate" bind:value={endDate} />

        <span class="input-group-text persian-date-text"></span>
      </div>
    </div>

    <div class="col-md-2">
      <button
        class="btn btn-primary btn-sm w-100"
        on:click={() => {
          startDate = '';
          endDate = '';
        }}><i class="bi bi-list me-2"></i> {t('Show All')}</button>
    </div>

    <div class="col-md-2">
      <button
        on:click={() => exportReport('pdf')}
        disabled={exportingReport}
        class="btn btn-outline-danger btn-sm me-2 px-2 float-end">
        {#if exportingReport}
          <div class="spinner-border spinner-border-sm" role="status">
            <span class="visually-hidden">${t('Generating...')}</span>
          </div>
        {:else}
          <i class="bi bi-file-pdf-fill"></i>
          {t('PDF')}
        {/if}
      </button>
    </div>
  </div>
  <div class="my-3 d-flex justify-content-start align-items-center">
    {#each getCurrencyInfoArray(computedBalance, selectedCurrency) as cur}
      <div class="card me-4 shadow border-start border-{cur.color} border-5">
        <div class="card-body p-4">
          <div class="d-flex align-items-center">
            <div class="flex-grow-1">
              <p class="text-{cur.color} mb-1 fw-bold">
                {t(cur.code)}
              </p>
              <table>
                <tbody>
                  <tr>
                    <td>{t('Credit')}</td>
                    <td
                      ><small class="ms-2" dir="ltr">{cur.credit.toLocaleString()}</small>
                      <small> {t(cur.code)}</small></td>
                  </tr>
                  <tr>
                    <td>{t('Debit')}</td>
                    <td
                      ><small class="ms-2" dir="ltr">{cur.debit.toLocaleString()}</small>
                      <small> {t(cur.code)}</small></td>
                  </tr>
                  <tr class="fw-bold">
                    <td>{t('Balance')}</td>
                    <td
                      ><small dir="ltr" class="ms-2 {cur.balance > 0 ? '' : 'text-danger'}"
                        >{cur.balance.toLocaleString()}</small>
                      <small class={cur.balance > 0 ? '' : 'text-danger'}>
                        {t(cur.code)}
                      </small></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
  {/if}

  {#if listLoading && processed.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-hourglass-split" message={t('Loading...')} />
    </div>
  {:else if processed.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-inbox" message={t('No transactions found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Account Report')}
      minWidth="920px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th style="width:160px">{t('Date')}</th>
          <th>{t('Peer Account')}</th>
          <th>{t('Reference')}</th>
          <th>{t('Description')}</th>
          <th class="col-start">{t('Debit')}</th>
          <th class="col-start">{t('Credit')}</th>
          <th class="col-start">{t('Balance')}</th>
          <th class="col-end">{t('Actions')}</th>
        </tr>
      </svelte:fragment>
          {#each paginated as j}
            <tr class={j.is_opening_balance ? 'opening-balance-row' : ''}>
              <td style="min-width:140px">{@html showDate(j.date)}</td>
              <td>
                {#if j.is_opening_balance}
                  <span class="badge badge-secondary">{t('Opening balance')}</span>
                {:else if j.first_entry_account == PAYABLE_ID || j.first_entry_account == RECEIVABLE_ID}
                  <span class="badge badge-success">
                    {getAccountName(j.second_entry_account)}
                  </span>
                {:else if j.second_entry_account == PAYABLE_ID || j.second_entry_account == RECEIVABLE_ID}
                  <span class="badge badge-success">
                    {getAccountName(j.first_entry_account)}
                  </span>
                {:else}
                  <span
                    class="badge badge-success"
                    style="cursor: pointer;"
                    on:click={async () => {
                      const peerId =
                        j.first_entry_account == account.id
                          ? j.second_entry_account
                          : j.first_entry_account;
                      await push(`/dashboard/account/${peerId}?tab=financial-report`);
                    }}>
                    {j.first_entry_account == id
                      ? getAccountName(j.second_entry_account)
                      : getAccountName(j.first_entry_account)}</span>
                {/if}
              </td><td>
                {#if j.is_opening_balance}
                  <span class="badge badge-info me-1">
                    {workingFiscalYear?.name || t('Fiscal year')}
                  </span>
                {:else if j.reference_type != 'account' && j.reference_id}
                  {#if j.reference_type === 'stock_transfer'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/stock-transfers/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'sale'}
                    <span
                      class="badge badge-info me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/sales/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'sale_payment'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => {
                        const saleId = j.reference_sale_id;
                        if (saleId) push(`/dashboard/sales/${saleId}`);
                      }}>
                      {t(j.reference_type)}
                      {j.reference_sale_id ? ' ' + shortID(j.reference_sale_id) : ''}
                    </span>
                  {:else if j.reference_type === 'purchase'}
                    <span
                      class="badge badge-info me-1"
                      style="cursor: pointer;"
                      on:click={() => push(`/dashboard/purchases/${j.reference_id}`)}>
                      {t(j.reference_type)}
                      {j.reference_id ? ' ' + shortID(j.reference_id) : ''}
                    </span>
                  {:else if j.reference_type === 'purchase_payment'}
                    <span
                      class="badge badge-success me-1"
                      style="cursor: pointer;"
                      on:click={() => {
                        const purchaseId = j.reference_purchase_id;
                        if (purchaseId) push(`/dashboard/purchases/${purchaseId}`);
                      }}>
                      {t(j.reference_type)}
                      {j.reference_purchase_id ? ' ' + shortID(j.reference_purchase_id) : ''}
                    </span>
                  {/if}
                {:else}{/if}
              </td>
              <td>{localizeDescription(j.description, $lang, t) || '-'}</td>
              <td class="col-start value-cell"
                >{#if j.debit || 0}<span class="amount-inline debit-value"
                    ><span dir="ltr">{j.debit.toLocaleString(undefined, { maximumFractionDigits: 3 }) || 0}</span>
                    <span>{t(j.currency || '')}</span></span
                  >{/if}</td>
              <td class="col-start value-cell"
                >{#if j.credit || 0}<span class="amount-inline credit-value"
                    ><span dir="ltr">{j.credit.toLocaleString(undefined, { maximumFractionDigits: 3 }) || 0}</span>
                    <span>{t(j.currency || '')}</span></span
                  >{/if}</td>
              <td class="col-start fw-bold">{@html formatRunningObj(j.running) || 0}</td>
              <td class="text-center">
                <TableActions actions={getReportActions(j)} />
                {#if false}
                {#if j.reference_type != 'account' && j.reference_id}
                  {#if j.reference_type === 'stock_transfer'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => push(`/dashboard/stock-transfers/${j.reference_id}`)}>
                      <i class="bi bi-box2"></i>
                    </button>
                  {:else if j.reference_type === 'sale'}
                    <button
                      class="btn btn-sm btn-outline-info me-1"
                      on:click={() => push(`/dashboard/sales/${j.reference_id}`)}>
                      <i class="bi bi-cart"></i>
                    </button>
                  {:else if j.reference_type === 'sale_payment'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => {
                        const saleId = j.reference_sale_id;
                        if (saleId) push(`/dashboard/sales/${saleId}`);
                      }}>
                      <i class="bi bi-cart"></i>
                    </button>
                  {:else if j.reference_type === 'purchase'}
                    <button
                      class="btn btn-sm btn-outline-info me-1"
                      on:click={() => push(`/dashboard/purchases/${j.reference_id}`)}>
                      <i class="bi bi-truck"></i>
                    </button>
                  {:else if j.reference_type === 'purchase_payment'}
                    <button
                      class="btn btn-sm btn-outline-success me-1"
                      on:click={() => {
                        const purchaseId = j.reference_purchase_id;
                        if (purchaseId) push(`/dashboard/purchases/${purchaseId}`);
                      }}>
                      <i class="bi bi-truck"></i>
                    </button>
                  {:else if j.reference_type === 'exchange'}
                    <button class="btn btn-sm btn-outline-info me-1" on:click={() => push(`/dashboard/exchanges/list`)}>
                      <i class="bi bi-currency-exchange"></i>
                    </button>
                  {/if}
                {:else}
                  {#if permissions?.some((p) => p.code === 'Journals' && p.edit)}
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => modalRef.openModal(j.id)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                  {/if}
                  {#if permissions?.some((p) => p.code === 'Journals' && p.delete)}
                    <button
                      class="btn btn-sm btn-outline-danger"
                      on:click={async () => {
                        const ok = await toast.confirm(t('Are you sure?'), t("You won't be able to revert this!"));

                        if (ok) {
                          deleteJournal(j.id);
                        }
                      }}>
                      <i class="bi bi-trash"></i>
                    </button>
                  {/if}
                {/if}

                <button
                  class="btn btn-sm btn-outline-primary me-1 px-2"
                  on:click={() => {
                    showReceipt = true;
                    selectedJournal = j;
                  }}>
                  <i class="bi bi-printer"></i>
                </button>
                {/if}
              </td>
            </tr>
          {/each}
    </DataTable>
  {/if}

    <svelte:fragment slot="footer">
      <PaginationBar
        bind:currentPage={page}
        totalPages={totalPages}
        itemsPerPage={pageSize}
        totalItems={null}
        ariaLabel={t('Account Report pagination')}
        rowLabel={t('rows')}
        perPageOptions={pageSizes}
        on:perPageChange={(event) => {
          pageSize = Number(event.detail);
          page = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
</div>

<EditJournalModal
  bind:this={modalRef}
  on:saved={() => {
    if (account?.id) {
      loadJournals(account.id);
    }
  }} />

{#if showReceipt}
  <JournalReceiptModal journal={selectedJournal} on:close={() => (showReceipt = false)} />
{/if}

<style>
  .account-report-page {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .account-report-page :global(.index-page) {
    flex: 1 1 auto;
  }

  .account-report-summary {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .account-report-summary :global(.summary-card) {
    min-height: 5rem;
    padding: 0.75rem 0.9rem;
    gap: 0.75rem;
    border-color: #dce6f5;
    border-radius: 0.85rem;
    background: linear-gradient(145deg, #ffffff, #f8faff);
    box-shadow: none;
  }

  :global(html.dark) .account-report-summary :global(.summary-card) {
    border-color: var(--erp-border);
    background: var(--erp-surface);
  }

  .account-report-summary :global(.summary-icon) {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 0.75rem;
    font-size: 1rem;
  }

  .account-report-summary :global(.summary-content) {
    flex: 1;
  }

  .account-report-summary :global(.summary-label) {
    margin-bottom: 0.2rem;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .account-report-summary :global(.summary-value) {
    display: flex !important;
    flex-direction: column;
    align-items: stretch;
    overflow: visible;
    white-space: normal;
  }

  .report-summary-values {
    color: #13213a;
    font-size: 0.86rem;
    font-weight: 800;
    line-height: 1.45;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  :global(.summary-currency-line) {
    display: block !important;
    width: 100%;
    min-height: 1.35rem;
  }

  :global(html.dark) .report-summary-values {
    color: var(--erp-text);
  }

  .amount-inline,
  :global(.amount-inline) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }

  .col-start {
    text-align: start;
  }

  .value-cell .amount-inline {
    font-size: 0.75rem;
    font-weight: 750;
  }

  .debit-value{color:#dc3545}.credit-value{color:#11875d}

  /*
   * The opening balance line: a snapshot carried in by the fiscal-year close,
   * not a journal, so it is visually distinct from the year's transactions.
   */
  .opening-balance-row :global(td) {
    background: #f1f5f9;
  }

  .opening-balance-row :global(td.amount-inline),
  .opening-balance-row :global(.amount-inline) {
    font-weight: 750;
  }

  @media (max-width: 700px) {
    .account-report-summary { grid-template-columns: 1fr !important; }
    .account-report-summary :global(.summary-card) { min-height: 4.3rem; padding: 0.6rem 0.7rem; }
  }
</style>
