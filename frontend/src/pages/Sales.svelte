<script>
  import { onceAsync } from '../lib/onceAsync.js';
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import AsyncPage from '../components/AsyncPage.svelte';
  import { t, lang, translate_org_type, settings_all } from '../i18n/i18n.js';
  import { auth } from '../auth/authStore';
  import { calculateRemainingAndBenefitOfAllSales } from './sales/SalesHelper.js';
  import { applyCurrentFiscalYearRange } from '../utils/currentFiscalYear.js';
  import { accountApi } from '../api/accountApi.js';
  import { currencyApi } from '../api/currencyApi.js';
  import { saleApi } from '../api/saleApi.js';
  import { warehouseApi } from '../api/warehouseApi.js';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import ExportMenu from '../components/common/ExportMenu.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import SalesTabs from './sales/SalesTabs.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';
  const loadPaymentSection = () => import('./sales/PaymentSection.svelte');
  const loadSaleA4ReceiptModal = () => import('./sales/SaleA4ReceiptModal.svelte');
  const loadSaleReceiptModal = () => import('./sales/SaleReceiptModal.svelte');
  const loadProductsReport = () => import('./accounts/ProductsReport.svelte');
  const loadVisitorReport = () => import('./sales/VisitorReport.svelte');

  $: permissions = $auth.permissions;
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: enable_visitor = $settings_all.find((s) => s.key === 'enable_visitor')?.value == 1;
  $: enable_a4_default_print_mode =
    $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;
  $: showBenefit = permissions?.some((p) => p.code === 'Benefit' && p.view);

  export let embedded = false;
  export let account_id = null;
  const scopedAccountId = account_id;

  let sales = [];
  let accounts = [];
  let warehouses = [];
  let currencies = [];
  let loading = true;
  let exportingReport = false;
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let lookupsLoaded = false;
  let calculatingAll = false;

  let searchTerm = '';
  let filtersOpen = false;
  let filterStatus = 'all';
  let filterPaymentStatus = 'all';
  let selectedCurrency = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'invoice_date';
  let sortDirection = 'desc';
  let fromDate = '';
  let toDate = '';

  let shiftPressed = false;
  let ctrlPressed = false;

  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }

  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  /* ------------------------------------------------------------------ *
   * Reference formatting                                                *
   * ------------------------------------------------------------------ */

  /* Money reads in hundredths, like every bill the app prints. */
  const amountFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  /* A balance smaller than half a hundredth counts as settled. */
  const AMOUNT_EPSILON = 0.005;
  const persianDateFormatter = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const persianShortFormatter = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
    day: 'numeric',
    month: 'short',
  });

  function asDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function amountText(value) {
    const number = Number(value);
    return amountFormatter.format(Number.isFinite(number) ? number : 0);
  }

  function persianDate(value) {
    const date = asDate(value);
    return date ? persianDateFormatter.format(date) : '—';
  }

  function persianShortDate(value) {
    const date = asDate(value);
    return date ? persianShortFormatter.format(date) : '—';
  }

  function isoDate(value) {
    return value ? String(value).slice(0, 10) : '';
  }

  function getLocalDate() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  function shiftDate(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  }

  /*
   * The Persian month cannot be derived from the Gregorian one, so today's
   * Persian day number is read from the calendar and stepped back to its 1st.
   */
  function startOfPersianMonth() {
    const today = new Date();
    const day = Number(
      new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', { day: 'numeric' })
        .formatToParts(today)
        .find((part) => part.type === 'day')?.value || 1,
    );
    const start = new Date(today);
    start.setDate(start.getDate() - Math.max(0, day - 1));
    start.setMinutes(start.getMinutes() - start.getTimezoneOffset());
    return start.toISOString().split('T')[0];
  }

  function dayOffset(value) {
    const date = asDate(value);
    if (!date) return null;
    const today = new Date();
    const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((target - base) / 86400000);
  }

  function currencySymbol(code) {
    if (!code) return '';
    const match = currencies.find((currency) => String(currency.code) === String(code));
    return match?.symbol || t(code);
  }

  /* The reference prints every money cell as `؋ 1,234` (symbol + LRM + number). */
  function moneyLabel(value, currency) {
    return `${currencySymbol(currency)}\u200E ${amountText(value)}`;
  }

  function sumByCurrency(rows, pick) {
    const totals = {};
    for (const row of rows) {
      const currency = row.currency || 'AFN';
      totals[currency] = (totals[currency] || 0) + Number(pick(row) || 0);
    }
    return totals;
  }

  function moneyLines(totals) {
    const entries = Object.entries(totals).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!entries.length) return [{ value: '0', unit: '' }];
    return entries.map(([currency, value]) => ({
      value: amountText(value),
      unit: currencySymbol(currency),
    }));
  }

  /* ------------------------------------------------------------------ *
   * Rows, balances and due dates                                        *
   * ------------------------------------------------------------------ */

  function getAccountName(acc) {
    if (!acc) return lookupsLoaded ? 'Unknown' : '...';
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    return out || 'Unknown';
  }

  /*
   * Name lookups are memoised into reactive maps: a template that calls a
   * helper reading `accounts`/`warehouses` directly is not re-rendered when
   * those lists arrive, which left every customer as «…» on first paint.
   */
  $: accountNameById = new Map(
    accounts.map((account) => [String(account.id), getAccountName(account)]),
  );
  $: warehouseNameById = new Map(
    warehouses.map((warehouse) => [String(warehouse.id), warehouse.name]),
  );

  function unknownCustomerLabel() {
    return lookupsLoaded ? t('Unknown') : '…';
  }

  function invoiceLabel(sale) {
    return String(sale.invoice_number ?? sale.id ?? '');
  }

  function saleDate(sale) {
    return sale.invoice_date || sale.created_at;
  }

  function remainingOf(sale) {
    if (sale.remaining === null || sale.remaining === undefined) {
      return Number(sale.total_amount) || 0;
    }
    return Number(sale.remaining) || 0;
  }

  function paidOf(sale) {
    return (Number(sale.total_amount) || 0) - remainingOf(sale);
  }

  function paymentState(sale) {
    if (remainingOf(sale) <= AMOUNT_EPSILON) return 'paid';
    if (paidOf(sale) > AMOUNT_EPSILON) return 'partial';
    return 'credit';
  }

  function paidPercent(sale) {
    const total = Number(sale.total_amount) || 0;
    if (total <= 0) return 0;
    const percent = Math.round((paidOf(sale) / total) * 100);
    return Math.min(100, Math.max(0, percent));
  }

  function statusTone(status) {
    if (status === 'confirmed') return 'ok';
    if (!status || status === 'draft') return 'neutral';
    return 'danger';
  }

  function statusLabel(status) {
    return t(status || 'draft');
  }

  /* ------------------------------------------------------------------ *
   * Data loading                                                        *
   * ------------------------------------------------------------------ */

  const loadLookups = onceAsync(async () => {
    if (lookupsLoaded) return;
    if (account_id) {
      const [accountResponse, warehouseResponse, currencyResponse] = await Promise.all([
        accountApi.getById(account_id),
        warehouseApi.getAll({ status: 1 }),
        currencyApi.getAll({ status: 1 }),
      ]);
      accounts = accountResponse?.data ? [accountResponse.data] : [];
      warehouses = warehouseResponse?.data || [];
      currencies = currencyResponse?.data || [];
      lookupsLoaded = true;
      return;
    }

    const [accountsResponse, warehouseResponse, currencyResponse] = await Promise.all([
      accountApi.getAll({ status: 1, role: 'customer' }),
      warehouseApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
    ]);
    accounts = (accountsResponse?.data || []).filter((a) => a.status === 1);
    warehouses = warehouseResponse?.data || [];
    currencies = currencyResponse?.data || [];
    lookupsLoaded = true;
  });

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = getSalesQueryKey();
    loading = true;
    try {
      // Supporting filters must not hold up the invoice table.
      void loadLookups().catch((error) => console.error('Failed to load filters', error));
      const response = await saleApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        account_id: account_id || undefined,
        invoice_status: filterStatus !== 'all' ? filterStatus : undefined,
        payment_status: filterPaymentStatus !== 'all' ? filterPaymentStatus : undefined,
        currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
        page: currentPage,
        limit: itemsPerPage,
        skip_count:
          searchTerm.trim() ||
          account_id ||
          filterStatus !== 'all' ||
          filterPaymentStatus !== 'all' ||
          fromDate ||
          toDate
            ? 0
            : 1,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        sort_by: sortColumn,
        sort_dir: sortDirection,
      });
      if (requestId !== loadRequestId) return;
      sales = response?.data || [];
      const meta = readListMeta(response, sales.length);
      const hasMore = Boolean(response?.meta?.hasMore);
      totalItems = hasMore
        ? Math.max(meta.total, currentPage * itemsPerPage + 1)
        : Math.max(meta.total, (currentPage - 1) * itemsPerPage + sales.length);
      totalPages = hasMore
        ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
        : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function getSalesQueryKey() {
    return `${currentPage}|${itemsPerPage}|${account_id || ''}|${filterStatus}|${filterPaymentStatus}|${selectedCurrency}|${fromDate}|${toDate}`;
  }

  function reload() {
    // Changing the page is enough: the reactive block below reloads once.
    if (currentPage !== 1) {
      currentPage = 1;
      return;
    }
    lastPageKey = getSalesQueryKey();
    load();
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else load();
    }, 300);
  }

  onMount(async () => {
    syncTabFromHash();
    window.addEventListener('hashchange', syncTabFromHash);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    /*
     * Operational screens default to the CURRENT fiscal year, so a closed
     * year's bills stop appearing here. Nothing is deleted: the year history
     * still lists them, and the user can widen or replace the range with the
     * same date filters as before. When no fiscal year is configured the range
     * stays empty, which is the previous (lifetime) behaviour.
     */
    await applyCurrentFiscalYearRange(({ from, to }) => {
      fromDate = from;
      toDate = to;
    });

    lastPageKey = getSalesQueryKey();
    bootstrapped = true;
    await load();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('hashchange', syncTabFromHash);
    loadRequestId += 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void account_id;
    void filterStatus;
    void filterPaymentStatus;
    void selectedCurrency;
    void fromDate;
    void toDate;
    const key = getSalesQueryKey();
    if (key !== lastPageKey) {
      lastPageKey = key;
      load();
    }
  }

  /* ------------------------------------------------------------------ *
   * Tabs (?tab=products / ?tab=visitors)                                *
   * ------------------------------------------------------------------ */

  $: SALES_TABS = enable_visitor ? ['sales', 'products', 'visitors'] : ['sales', 'products'];
  let activeTab = 'sales';

  function syncTabFromHash() {
    const hash = window.location.hash || '';
    const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const tab = new URLSearchParams(query).get('tab');
    activeTab = SALES_TABS.includes(tab) ? tab : 'sales';
  }

  function selectTab(tab) {
    if (tab === activeTab) return;
    push(tab === 'sales' ? '/dashboard/sales' : `/dashboard/sales?tab=${tab}`);
    activeTab = tab;
  }

  $: saleTabs = [
    ...(enable_visitor
      ? [{ key: 'visitors', label: t('Visitor Report'), icon: 'badge' }]
      : []),
  ];

  /* ------------------------------------------------------------------ *
   * Actions                                                             *
   * ------------------------------------------------------------------ */

  function openNewSale() {
    if (account_id) {
      push(`/dashboard/account-sale-form/${account_id}`);
    } else {
      push(`/dashboard/sale-form/0`);
    }
  }

  let showA4Receipt = false;
  let showReceipt = false;
  let selectedA4Sale = null;

  function openPrint(sale) {
    selectedA4Sale = sale;
    if (enable_a4_default_print_mode) {
      showA4Receipt = true;
      showReceipt = false;
    } else {
      showReceipt = true;
      showA4Receipt = false;
    }
  }

  function openEmptyBill() {
    selectedA4Sale = null;
    if (enable_a4_default_print_mode) {
      showA4Receipt = true;
      showReceipt = false;
    } else {
      showReceipt = true;
      showA4Receipt = false;
    }
  }

  function saleActions(sale) {
    const remaining = remainingOf(sale);
    return [
      {
        icon: 'bi-printer',
        label: t('Print'),
        tone: 'muted',
        onClick: () => openPrint(sale),
      },
      {
        icon: 'bi-eye',
        label: t('View'),
        tone: 'view',
        onClick: () => push(`/dashboard/sales/${sale.id}`),
      },
      {
        icon: 'bi-pencil',
        label: t('Edit'),
        tone: 'edit',
        onClick: () => push(`/dashboard/sale-form/${sale.id}`),
      },
      {
        icon: 'bi-wallet2',
        label: t('Payments'),
        disabled: remaining <= AMOUNT_EPSILON,
        onClick: () => openPaymentModal(sale),
      },
    ];
  }

  let addPaymentModal;
  let addPaymentModalInstance;
  let selectedSale = null;

  function openPaymentModal(sale) {
    selectedSale = sale;
    if (!addPaymentModalInstance && addPaymentModal) {
      addPaymentModalInstance = new window.mdb.Modal(addPaymentModal);
    }
    addPaymentModalInstance?.show();
  }

  async function closePaymentModal() {
    addPaymentModalInstance?.hide();
    selectedSale = null;
    await load();
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = ['created_at', 'invoice_date', 'due_date', 'id', 'invoice_number'].includes(column)
        ? 'desc'
        : 'asc';
    }
    if (currentPage !== 1) currentPage = 1;
    else load();
  }

  function sortAria(column) {
    if (sortColumn !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  /*
   * The table only holds the current page. For PDF/Excel exports the
   * user expects every record that matches the active filters, so
   * re-fetch all matching rows with the same server-side filters
   * (search, customer, status, payment status, dates and sorting).
   */
  async function fetchAllSalesForExport() {
    /* The backend caps limit at 200 (MAX_LIMIT). */
    const pageSize = 200;
    const all = [];
    let page = 1;

    for (;;) {
      const response = await saleApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        account_id: account_id || undefined,
        invoice_status: filterStatus !== 'all' ? filterStatus : undefined,
        payment_status: filterPaymentStatus !== 'all' ? filterPaymentStatus : undefined,
        currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
        page,
        limit: pageSize,
        skip_count: 1,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        sort_by: sortColumn,
        sort_dir: sortDirection,
      });

      const rows = response?.data || [];
      all.push(...rows);

      if (!rows.length || !response?.meta?.hasMore) break;
      page += 1;
    }

    return all;
  }

  async function exportSales(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel'
        ? (await import('./generateExcel.js')).generateExcel
        : (await import('./generatePDF.js')).generatePDF;

      const allSales = await fetchAllSalesForExport();

      /*
       * Summary totals must cover the whole exported dataset,
       * not just the rows currently visible on the page.
       */
      const exportSalesAmount = allSales.reduce((totals, s) => {
        if (!s.invoice_status || s.invoice_status !== 'confirmed') return totals;
        if (!totals[s.currency]) totals[s.currency] = 0;
        totals[s.currency] += Number(s.total_amount || 0);
        return totals;
      }, {});

      const exportBenefitAmount = allSales.reduce((totals, s) => {
        if (!s.invoice_status || s.invoice_status !== 'confirmed') return totals;
        if (!totals[s.currency]) totals[s.currency] = 0;
        totals[s.currency] += Number(s.benefit || 0);
        return totals;
      }, {});

      await exporter(
        'sales',
        allSales,
        fromDate,
        toDate,
        allSales.length,
        exportSalesAmount,
        exportBenefitAmount,
      );
    } catch (error) {
      console.error('Failed to generate sales report:', error);
    } finally {
      exportingReport = false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Filters                                                             *
   * ------------------------------------------------------------------ */

  function handleSalesToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'account') {
      if (scopedAccountId) return;
      account_id = value === 'all' ? null : Number(value);
    }
    if (key === 'status') filterStatus = value;
    if (key === 'paymentStatus') filterPaymentStatus = value;
    if (key === 'currency') selectedCurrency = value;
    if (key === 'fromDate') fromDate = value;
    if (key === 'toDate') toDate = value;
    reload();
  }

  function clearAllFilters() {
    fromDate = '';
    toDate = '';
    if (!scopedAccountId) {
      account_id = null;
    } else {
      account_id = scopedAccountId;
    }
    filterStatus = 'all';
    filterPaymentStatus = 'all';
    selectedCurrency = 'all';
    searchTerm = '';
    reload();
  }

  /* A quick range applies at once and closes the filter popup. */
  function chooseRange(range) {
    filtersOpen = false;
    pickRange(range);
  }

  function pickRange(range) {
    const today = getLocalDate();
    if (range === 'today') {
      fromDate = today;
      toDate = today;
    } else if (range === 'week') {
      fromDate = shiftDate(-6);
      toDate = today;
    } else if (range === 'month') {
      fromDate = startOfPersianMonth();
      toDate = today;
    }
    reload();
  }

  function clearDateRange() {
    fromDate = '';
    toDate = '';
    reload();
  }

  $: todayIso = ($lang, getLocalDate());
  $: weekStartIso = ($lang, shiftDate(-6));
  $: monthStartIso = ($lang, startOfPersianMonth());
  $: activeRange =
    fromDate && toDate
      ? fromDate === toDate && fromDate === todayIso
        ? 'today'
        : fromDate === weekStartIso && toDate === todayIso
          ? 'week'
          : fromDate === monthStartIso && toDate === todayIso
            ? 'month'
            : ''
      : '';
  $: quickRanges = ($lang, [
    { key: 'today', label: t('Today') },
    { key: 'week', label: t('7 Days') },
    { key: 'month', label: t('This Month') },
  ]);

  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'cancelled', label: t('Cancelled') },
  ];

  $: paymentStatusFilterOptions = [
    { value: 'all', label: t('All Payment Statuses') },
    { value: 'paid', label: t('Settled') },
    { value: 'unpaid', label: t('Unpaid') },
  ];

  $: salesToolbarFilters = [
    {
      key: 'account',
      label: t('Customer'),
      value: account_id || 'all',
      icon: 'bi-person',
      visible: !scopedAccountId,
      options: [
        { value: 'all', label: t('All') },
        ...accounts.map((account) => ({ value: account.id, label: getAccountName(account) })),
      ],
    },
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      icon: 'bi-activity',
      options: statusFilterOptions,
    },
    {
      key: 'paymentStatus',
      label: t('Payment'),
      value: filterPaymentStatus,
      icon: 'bi-credit-card',
      options: paymentStatusFilterOptions,
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
    { key: 'fromDate', label: t('From Date'), value: fromDate, icon: 'bi-calendar3', type: 'date' },
    { key: 'toDate', label: t('To Date'), value: toDate, icon: 'bi-calendar3', type: 'date' },
  ];

  /* ------------------------------------------------------------------ *
   * Aggregates                                                          *
   * ------------------------------------------------------------------ */

  $: filteredSales = sales;

  $: confirmedRows = filteredSales.filter((sale) => sale.invoice_status === 'confirmed');
  $: settledRows = confirmedRows.filter((sale) => remainingOf(sale) <= AMOUNT_EPSILON);
  $: openRows = confirmedRows.filter((sale) => remainingOf(sale) > AMOUNT_EPSILON);
  $: overdueRows = openRows.filter((sale) => {
    const offset = dayOffset(sale.due_date);
    return offset !== null && offset < 0;
  });
  $: soonRows = openRows.filter((sale) => {
    const offset = dayOffset(sale.due_date);
    return offset !== null && offset >= 0 && offset <= 3;
  });

  $: totalByCurrency = sumByCurrency(confirmedRows, (sale) => sale.total_amount);
  $: paidByCurrency = sumByCurrency(confirmedRows, (sale) => paidOf(sale));
  $: outstandingByCurrency = sumByCurrency(openRows, (sale) => remainingOf(sale));
  $: overdueByCurrency = sumByCurrency(overdueRows, (sale) => remainingOf(sale));

  $: headerCurrency =
    selectedCurrency !== 'all'
      ? selectedCurrency
      : Object.entries(totalByCurrency).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ||
        confirmedRows[0]?.currency ||
        'AFN';

  $: dailySeries = (() => {
    const days = new Map();
    for (const sale of confirmedRows) {
      const key = isoDate(saleDate(sale));
      if (!key) continue;
      const entry = days.get(key) || { total: 0, outstanding: 0 };
      entry.total += Number(sale.total_amount) || 0;
      entry.outstanding += Math.max(remainingOf(sale), 0);
      days.set(key, entry);
    }
    return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, value]) => value);
  })();

  function sparkPoints(field) {
    const values = dailySeries.map((day) => day[field]);
    if (values.length < 2) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    return values
      .map(
        (value, index) =>
          `${((index / (values.length - 1)) * 120).toFixed(1)},${(4 + 28 * (1 - (value - min) / range)).toFixed(1)}`,
      )
      .join(' ');
  }

  /*
   * A paid percentage only means something in one currency; with several
   * currencies set against one bar the figure would be a fiction.
   */
  $: paidPercentTotal =
    Object.keys(totalByCurrency).length === 1
      ? (() => {
          const [currency] = Object.keys(totalByCurrency);
          const total = Number(totalByCurrency[currency]) || 0;
          if (total <= 0) return 0;
          return Math.min(
            100,
            Math.max(
              0,
              Math.round(((total - Number(outstandingByCurrency[currency] || 0)) / total) * 100),
            ),
          );
        })()
      : null;

  $: kpiCards = (($lang, [
    {
      key: 'total',
      label: t('Total Sales'),
      icon: 'shopping_cart',
      lines: moneyLines(totalByCurrency),
      sub: `${filteredSales.length} ${t('Bill')}`,
      title: t('Total Sales'),
      spark: sparkPoints('total'),
      sparkTone: 'brand',
    },
    {
      key: 'received',
      label: t('Received'),
      icon: 'payments',
      lines: moneyLines(paidByCurrency),
      sub: `${settledRows.length} ${t('Bill')} ${t('Settled')}`,
      title: t('Received'),
      chip: paidPercentTotal != null ? `${paidPercentTotal}%` : '',
      chipTone: 'ok',
      bar: paidPercentTotal,
      barTone: 'ok',
    },
    {
      key: 'receivable',
      label: t('Receivable'),
      icon: 'pending_actions',
      lines: moneyLines(outstandingByCurrency),
      sub: `${openRows.length} ${t('Bill')} ${t('On Credit')} / ${t('Partial')}`,
      title: t('Receivable'),
      spark: sparkPoints('outstanding'),
      sparkTone: 'warn',
      valueTone: 'warn',
    },
    {
      key: 'overdue',
      label: t('Overdue'),
      icon: 'event_busy',
      hero: true,
      lines: moneyLines(overdueByCurrency),
      sub: `${overdueRows.length} ${t('Bill')} · ${soonRows.length} ${t('Bill')} ${t('Due Soon')}`,
      title: t('Overdue'),
      valueTone: overdueRows.length ? 'danger' : 'ink',
    },
  ]));

  /* ------------------------------------------------------------------ *
   * Filter chips, columns, footer                                       *
   * ------------------------------------------------------------------ */

  $: activeChips = (() => {
    const chips = [];

    if (fromDate || toDate) {
      const label =
        fromDate && toDate && fromDate !== toDate
          ? `${persianShortDate(fromDate)} – ${persianShortDate(toDate)}`
          : persianShortDate(fromDate || toDate);
      chips.push({ key: 'date', label: `${t('Date')}: ${label}`, clear: clearDateRange });
    }

    if (!scopedAccountId && account_id) {
      chips.push({
        key: 'customer',
        label: `${t('Customer')}: ${accountNameById.get(String(account_id)) || unknownCustomerLabel()}`,
        clear: () => {
          account_id = null;
          reload();
        },
      });
    }

    if (filterStatus !== 'all') {
      chips.push({
        key: 'status',
        label: `${t('Status')}: ${t(filterStatus)}`,
        clear: () => {
          filterStatus = 'all';
          reload();
        },
      });
    }

    if (filterPaymentStatus !== 'all') {
      chips.push({
        key: 'payment',
        label: `${t('Payment')}: ${t(filterPaymentStatus === 'paid' ? 'Settled' : 'Unpaid')}`,
        clear: () => {
          filterPaymentStatus = 'all';
          reload();
        },
      });
    }

    if (selectedCurrency !== 'all') {
      chips.push({
        key: 'currency',
        label: `${t('Currency')}: ${t(selectedCurrency)}`,
        clear: () => {
          selectedCurrency = 'all';
          reload();
        },
      });
    }

    return chips;
  })();

  $: toolbarActiveCount = activeChips.length;
  $: showItems = shiftPressed && ctrlPressed;

  /* Keep every visible column the same width, including optional columns. */
  $: tableColumnCount = 7 + (showBenefit ? 1 : 0) + (showItems ? 1 : 0);
  $: tableColumns = Array(tableColumnCount).fill(`${100 / tableColumnCount}%`);

  $: rangeStart = totalItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
  $: rangeEnd = Math.min(currentPage * itemsPerPage, totalItems);

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
</script>

{#if !permissions?.some((p) => p.code === 'Sales' && p.view)}
  <h3 class="permission-denied">
    <span class="ms" aria-hidden="true">error</span>
    {t('No access allowed')}
  </h3>
{:else if activeTab === 'products'}
  <div class="sales-report">
    {#if !embedded && saleTabs.length}
      <SalesTabs
        tabs={saleTabs}
        active={activeTab}
        ariaLabel={t('Sales')}
        on:select={(event) => selectTab(event.detail)} />
    {/if}
    {#await loadProductsReport() then mod}
      <svelte:component
        this={mod.default}
        account_id={account_id}
        itemType="sale"
        bind:selectedCurrency
        {currencies} />
    {/await}
  </div>
{:else if enable_visitor && activeTab === 'visitors'}
  <div class="sales-report">
    {#if !embedded && saleTabs.length}
      <SalesTabs
        tabs={saleTabs}
        active={activeTab}
        ariaLabel={t('Sales')}
        on:select={(event) => selectTab(event.detail)} />
    {/if}
    <AsyncPage loader={loadVisitorReport} {currencies} />
  </div>
{:else}
  <div class="sales-page">
    <IndexPageLayout
      dir={t('dir')}
      ariaLabel={t('Sales')}
      showExtra={true}
      showStats={true}
      showFooter={!loading && totalItems > 0}
      dense={true}
      contained={!embedded}
      contentClass="sales-index-content"
      tablePadding={true}>
      <svelte:fragment slot="nav">
        {#if !embedded && saleTabs.length}
          <div class="sales-nav">
            <SalesTabs
              tabs={saleTabs}
              active={activeTab}
              ariaLabel={t('Sales')}
              on:select={(event) => selectTab(event.detail)} />
          </div>
        {/if}
      </svelte:fragment>

      <svelte:fragment slot="extra">
        <div class="sales-head__actions">
          {#if shiftPressed && ctrlPressed}
            <ActionButton
              variant="secondary"
              icon="bi-calculator"
              label={t('Calculate All Sales')}
              loading={calculatingAll}
              disabled={calculatingAll}
              extraClass="sales-calc"
              on:click={async () => {
                if (
                  confirm(
                    t(
                      'Are you sure you want to recalculate benefit and remaining for all sales? This may take a while.',
                    ),
                  )
                ) {
                  calculatingAll = true;
                  await calculateRemainingAndBenefitOfAllSales();
                  calculatingAll = false;
                  load();
                }
              }} />
          {/if}

          <ExportMenu
            showLabel={true}
            loading={exportingReport}
            disabled={exportingReport || filteredSales.length === 0}
            on:export={(event) => exportSales(event.detail)} />

          <ActionButton
            variant="secondary"
            icon="note_add"
            label={t('Empty Bill')}
            extraClass="sales-blank-bill"
            on:click={openEmptyBill} />

          {#if permissions?.some((p) => p.code === 'Sales' && p.create)}
            <ActionButton
              icon="add"
              label={t('New Sale')}
              extraClass="sales-create"
              on:click={openNewSale} />
          {/if}
        </div>
      </svelte:fragment>

      <svelte:fragment slot="stats">
        <section class="kpi" aria-label={t('Sales')}>
          {#each kpiCards as card (card.key)}
            <article
              class="kcard"
              class:kcard--multi={card.lines.length > 1}
              data-hero={card.hero ? 'true' : undefined}
              title={card.title}>
              <span class="ktile" aria-hidden="true">
                <span class="ms f">{card.icon}</span>
              </span>
              <div class="kbody">
                <span class="klabel">{card.label}</span>
                <span class="kvals">
                  {#each card.lines as line, index (index)}
                    <span class="kval-line">
                      <span class="kval kval--{card.valueTone || 'ink'}" dir="ltr">{line.value}</span>
                      {#if line.unit}<span class="kunit">{line.unit}</span>{/if}
                    </span>
                  {/each}
                </span>
                <span class="ksub">{card.sub}</span>
              </div>
              {#if card.chip || card.spark || card.bar != null}
                <div class="kside">
                  {#if card.chip}
                    <span class="kchip kchip--{card.chipTone}" dir="ltr">{card.chip}</span>
                  {/if}
                  {#if card.spark}
                    <svg
                      class="kspark kspark--{card.sparkTone}"
                      width="56"
                      height="20"
                      viewBox="0 0 120 36"
                      preserveAspectRatio="none"
                      aria-hidden="true">
                      <polyline
                        points={card.spark}
                        fill="none"
                        stroke-width="3"
                        stroke-linecap="round"
                        stroke-linejoin="round" />
                    </svg>
                  {/if}
                  {#if card.bar != null}
                    <span class="kbar" aria-hidden="true">
                      <span class="kbar__fill kbar__fill--{card.barTone}" style:width={`${card.bar}%`}
                      ></span>
                    </span>
                  {/if}
                </div>
              {/if}
            </article>
          {/each}
        </section>
      </svelte:fragment>

      <svelte:fragment slot="toolbar">
        <FilterToolbar
          bind:filtersOpen
          searchValue={searchTerm}
          searchPlaceholder={t('Search bill or customer…')}
          filters={salesToolbarFilters}
          filterLabel={t('Filter')}
          resetLabel={t('Clear Filters')}
          applyLabel={t('Show')}
          activeCount={toolbarActiveCount}
          showReset={true}
          on:searchChange={(event) => {
            searchTerm = event.detail;
            scheduleSearchReload();
          }}
          on:filterChange={handleSalesToolbarFilter}
          on:reset={clearAllFilters}>
          <svelte:fragment slot="panelBeforeFields">
            <div class="date-range" role="group" aria-label={t('Date')}>
              {#each quickRanges as range (range.key)}
                <button
                  type="button"
                  class="date-range__option"
                  class:is-active={activeRange === range.key}
                  aria-pressed={activeRange === range.key}
                  on:click={() => chooseRange(range.key)}>
                  {range.label}
                </button>
              {/each}
            </div>
          </svelte:fragment>
        </FilterToolbar>
      </svelte:fragment>

      {#if activeChips.length}
        <div class="active-filters">
          {#each activeChips as chip (chip.key)}
            <button type="button" class="active-chip" on:click={chip.clear}>
              {chip.label}
              <span class="ms" aria-hidden="true">close</span>
            </button>
          {/each}
          <button type="button" class="active-filters__clear" on:click={clearAllFilters}>
            {t('Clear Filters')}
          </button>
        </div>
      {/if}

      {#if loading}
        <div class="index-table-state">
          <EmptyState loading={true} message={t('Loading...')} />
        </div>
      {:else if filteredSales.length === 0}
        <div class="index-table-state">
          <EmptyState
            icon="bi-search"
            message={t('No sales found.')}
            description={t('Change the range or filters')}>
            <button type="button" class="empty-clear" on:click={clearAllFilters}>
              {t('Clear Filters')}
            </button>
          </EmptyState>
        </div>
      {:else}
        <DataTable
          ariaLabel={t('Sales')}
          minWidth="100%"
          dense={true}
          striped={false}
          hover={false}
          stickyHeader={true}
          headerHeight="40px"
          cellPaddingY="6px"
          cellPaddingX="6px"
          edgePaddingX="8px"
          columns={tableColumns}
          mobileCards={true}>
          <svelte:fragment slot="head">
            <tr>
              <th aria-sort={sortAria('invoice_number')}>
                <button type="button" class="th-sort" on:click={() => setSort('invoice_number')}>
                  {t('Invoice #')}
                  {#if sortColumn === 'invoice_number'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
              <th class="col-center" aria-sort={sortAria('invoice_date')}>
                <button type="button" class="th-sort" on:click={() => setSort('invoice_date')}>
                  {t('Date')}
                  {#if sortColumn === 'invoice_date'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {/if}
                </button>
              </th>
              <th aria-sort={sortAria('account_id')}>
                <button type="button" class="th-sort" on:click={() => setSort('account_id')}>
                  {t('Customer')}
                  {#if sortColumn === 'account_id'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {/if}
                </button>
              </th>
              <th class="col-end" aria-sort={sortAria('total_amount')}>
                <button type="button" class="th-sort" on:click={() => setSort('total_amount')}>
                  {t('Total')}
                  <span class="th-hint">({currencySymbol(headerCurrency)})</span>
                  {#if sortColumn === 'total_amount'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {/if}
                </button>
              </th>
              <th aria-sort={sortAria('remaining')}>
                <button type="button" class="th-sort" on:click={() => setSort('remaining')}>
                  {t('Remaining')}
                  {#if sortColumn === 'remaining'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {/if}
                </button>
              </th>
              {#if showBenefit}
                <th class="col-end" aria-sort={sortAria('benefit')}>
                  <button type="button" class="th-sort" on:click={() => setSort('benefit')}>
                    {t('Benefit')}
                    <span class="th-hint">({currencySymbol(headerCurrency)})</span>
                    {#if sortColumn === 'benefit'}
                      <span class="ms sort-icon" aria-hidden="true">
                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    {/if}
                  </button>
                </th>
              {/if}
              <th>{t('Status')}</th>
              {#if showItems}<th>{t('Items')}</th>{/if}
              <th class="col-end">{t('Actions')}</th>
            </tr>
          </svelte:fragment>

          {#each filteredSales as sale (sale.id)}
            {@const remaining = remainingOf(sale)}
            {@const state = paymentState(sale)}
            {@const customer =
              accountNameById.get(String(sale.account_id)) || unknownCustomerLabel()}
            {@const warehouse = warehouseNameById.get(String(sale.warehouse_id)) || ''}
            <tr class="sale-row" class:is-voided={sale.invoice_status === 'cancelled'}>
              <td>
                <button
                  type="button"
                  class="bill-no"
                  dir="ltr"
                  title={`${invoiceLabel(sale)} · ${customer}`}
                  on:click={() => push(`/dashboard/sales/${sale.id}`)}>
                  {invoiceLabel(sale)}
                </button>
              </td>
              <td class="col-center">
                <div class="bill-date" title={isoDate(saleDate(sale))}>
                  <!-- The formatted date is Persian, so it keeps RTL word order
                       even when the whole page is laid out left to right. -->
                  <span class="bill-date__main" dir="rtl">{persianDate(saleDate(sale))}</span>
                  <span class="bill-date__sub" dir="ltr">{isoDate(saleDate(sale))}</span>
                </div>
              </td>
              <td>
                <button
                  type="button"
                  class="customer"
                  title={`${customer} · ${warehouse || t('Warehouse')}`}
                  on:click={() => push(`/dashboard/account/${sale.account_id}`)}>
                  <span class="customer__avatar" aria-hidden="true">{customer.charAt(0)}</span>
                  <span class="customer__details">
                    <span class="customer__name">{customer}</span>
                    <span class="customer__warehouse">
                      <span class="ms customer__warehouse-icon" aria-hidden="true">warehouse</span>
                      <span class="customer__warehouse-name">{warehouse || '—'}</span>
                    </span>
                  </span>
                </button>
              </td>
              <td class="col-end">
                <span
                  class="amount"
                  dir="ltr"
                  title={`${amountText(sale.total_amount)} ${t(sale.currency)}`}>
                  {moneyLabel(sale.total_amount, sale.currency)}
                </span>
              </td>
              <td>
                <div class="payment-cell">
                  <span class="payment-cell__row">
                    <span class="pay-chip pay-chip--{state}">
                      {t(state === 'paid' ? 'Settled' : state === 'partial' ? 'Partial' : 'On Credit')}
                    </span>
                    {#if remaining > AMOUNT_EPSILON}
                      <span
                        class="payment-cell__remaining is-open"
                        dir="ltr"
                        title={`${t('Remaining')}: ${amountText(remaining)} ${t(sale.currency)}`}>
                        {moneyLabel(remaining, sale.currency)}
                      </span>
                    {/if}
                  </span>
                  <span class="payment-cell__bar" aria-hidden="true">
                    <span
                      class="payment-cell__fill payment-cell__fill--{state}"
                      style:width={`${paidPercent(sale)}%`}></span>
                  </span>
                </div>
              </td>
              {#if showBenefit}
                <td class="col-end">
                  <span
                    class="amount amount--benefit"
                    class:is-negative={Number(sale.benefit) < 0}
                    dir="ltr"
                    title={`${t('Benefit')}: ${amountText(sale.benefit)} ${t(sale.currency)}`}>
                    {moneyLabel(sale.benefit, sale.currency)}
                  </span>
                </td>
              {/if}
              <td>
                <span class="status-chip status-chip--{statusTone(sale.invoice_status)}">
                  <span class="status-chip__dot" aria-hidden="true"></span>
                  {statusLabel(sale.invoice_status)}
                </span>
              </td>
              {#if showItems}
                <td class="cell-info">{sale.items_count ?? '—'}</td>
              {/if}
              <td class="col-end">
                <TableActions material={true} actions={saleActions(sale)} />
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
          {totalItems}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          perPageOptions={[15, 30, 50, 100]}
          ariaLabel={t('Sales pagination')}
          rowLabel={t('Bill')}
          perPageRowLabel={t('rows')}
          on:perPageChange={(event) => {
            itemsPerPage = Number(event.detail);
            currentPage = 1;
          }}
          {getPageNumbers} />
      </svelte:fragment>
    </IndexPageLayout>
  </div>
{/if}

{#if showA4Receipt}
  <AsyncPage
    loader={loadSaleA4ReceiptModal}
    sale={selectedA4Sale}
    on:close={() => (showA4Receipt = false)}
    on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
{/if}

{#if showReceipt}
  <AsyncPage
    loader={loadSaleReceiptModal}
    sale={selectedA4Sale}
    on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
    on:close={() => (showReceipt = false)} />
{/if}

<div
  class="modal fade"
  bind:this={addPaymentModal}
  tabindex="-1"
  aria-labelledby="addPaymentModalLabel"
  aria-hidden="true">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="addPaymentModalLabel">
          <span class="ms" aria-hidden="true">add_circle</span>
          {t('Add Payment')} {selectedSale?.invoice_number}
        </h5>
        <button
          type="button"
          class="btn-close"
          aria-label={t('Close')}
          on:click={closePaymentModal}></button>
      </div>
      <div class="modal-body">
        {#if selectedSale}
          <AsyncPage loader={loadPaymentSection} saleId={selectedSale.id} />
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .sales-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .permission-denied {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px;
    color: var(--z-debit, #dc2626);
    font-size: 14px;
    font-weight: 700;
  }

  /*
   * The reference puts the tab/action row and the KPI row on the page surface
   * and the toolbar, table and pager inside one 14px sheet, so the shared panel
   * is unwrapped here and its children are re-ordered to that stack.
   */
  .sales-page :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  /* ---------- sub-navigation + page actions ---------- */
  .sales-nav {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding-bottom: 12px;
  }

  /* Report tabs keep the same sub-navigation above the report sheet. */
  .sales-report {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    min-width: 0;
    min-height: 0;
  }

  .sales-head__actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .sales-page :global(.index-statistics) {
    order: -1;
    flex: 0 0 auto;
    padding: 0;
    margin-bottom: 12px;
    border: 0;
    background: transparent;
  }

  .sales-page :global(.index-toolbar) {
    order: 0;
    flex: 0 0 auto;
    min-height: 0;
    padding: 12px 14px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: var(--z-r-xl, 14px) var(--z-r-xl, 14px) 0 0;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .sales-page :global(.index-toolbar-main) {
    gap: 8px;
  }

  .sales-page :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
    flex-wrap: nowrap;
  }

  .sales-page :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    --z-row-border: var(--z-border-soft, #eef2f7);
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }

  .sales-page :global(.sales-index-content .data-table-wrap) {
    border: 0;
  }

  .sales-page :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .sales-page :global(.index-footer .pagination-shell) {
    padding: 10px 16px;
    border: 0;
    background: var(--z-surface-2, #f8fafc);
  }

  /* ---------- KPI row (reference `.kcard`) ---------- */
  .kpi {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .kcard {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 9px 12px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 12px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .kcard[data-hero='true'] {
    border-color: var(--z-border-strong, #dce6f8);
    background: linear-gradient(135deg, var(--z-brand-soft, #e3ecff) 0%, var(--z-surface, #ffffff) 70%);
  }

  .kcard[data-hero='true']::before {
    content: '';
    position: absolute;
    inset-block: 12px;
    inset-inline-start: 4px;
    width: 3px;
    border-radius: 3px;
    background: var(--z-brand, #2f6fed);
  }

  .ktile {
    display: inline-grid;
    place-items: center;
    flex: 0 0 32px;
    width: 32px;
    height: 32px;
    border-radius: 9px;
    line-height: 1;
  }

  .ktile .ms {
    font-size: 16px;
  }

  .kcard:nth-child(1) .ktile {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .kcard:nth-child(2) .ktile {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .kcard:nth-child(3) .ktile {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .kcard:nth-child(4) .ktile {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .kbody {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }

  .klabel {
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 11.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kvals {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .kval-line {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
  }

  .kval {
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 17px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kcard--multi .kval {
    font-size: 13px;
    line-height: 1.45;
  }

  .kval--warn {
    color: var(--z-warn, #92400e);
  }

  .kval--danger {
    color: var(--z-debit, #dc2626);
  }

  .kunit {
    flex-shrink: 0;
    overflow: hidden;
    color: var(--z-muted, #64748b);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ksub {
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kside {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-self: stretch;
    align-items: flex-end;
    justify-content: center;
    gap: 6px;
  }

  .kchip {
    border-radius: 999px;
    padding: 0 6px;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 18px;
    white-space: nowrap;
  }

  .kchip--ok {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .kspark {
    display: block;
  }

  .kspark--brand polyline {
    stroke: var(--z-brand, #2f6fed);
  }

  .kspark--warn polyline {
    stroke: #d97706;
  }

  .kbar {
    display: block;
    width: 56px;
    height: 5px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--z-surface-3, #f1f5f9);
  }

  .kbar__fill {
    display: block;
    height: 100%;
  }

  .kbar__fill--ok {
    background: var(--z-ok, #16a34a);
  }

  /* ---------- quick ranges inside the filter popup ---------- */
  .date-range {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .date-range__option {
    width: 100%;
    height: 28px;
    padding: 0 9px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-muted, #64748b);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      color 0.14s ease,
      background 0.14s ease,
      border-color 0.14s ease;
  }

  .date-range__option:hover {
    border-color: var(--z-border, #e1e7f0);
    color: var(--z-ink, #0b1530);
  }

  .date-range__option.is-active {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    box-shadow: none;
  }

  .date-range__option:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  /* ---------- active filter chips ---------- */
  .active-filters {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    background: var(--z-surface-2, #f8fafc);
  }

  .active-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding-inline-start: 10px;
    padding-inline-end: 6px;
    border: 1px solid var(--z-border-strong, #dce6f8);
    border-radius: 999px;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .active-chip .ms {
    font-size: 14px;
  }

  .active-filters__clear {
    height: 26px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--z-muted, #64748b);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }

  .active-filters__clear:hover {
    color: var(--z-ink, #0b1530);
  }

  /* ---------- table header ---------- */
  .th-sort {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 26px;
    margin-inline-start: -6px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.14s ease,
      color 0.14s ease;
  }

  .th-sort:hover {
    color: var(--z-ink, #0b1530);
  }

  .th-sort .sort-icon {
    font-size: 14px;
    margin: 0;
    opacity: 1;
  }

  .th-sort .sort-icon--idle {
    opacity: 0.55;
  }

  .th-hint {
    margin-inline-start: 2px;
    color: var(--z-subtle, #94a3b8);
    font-size: 10.5px;
    font-weight: 500;
  }

  /* ---------- rows ---------- */
  .sale-row {
    height: auto;
  }

  .sale-row:hover {
    background: var(--z-hover, #f5f9ff);
  }

  .sale-row.is-voided {
    opacity: 0.55;
  }

  .bill-no {
    display: inline-block;
    max-width: 100%;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: transparent;
    color: var(--z-link, #2f6fed);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12.5px;
    font-weight: 800;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .sale-row.is-voided .bill-no {
    color: var(--z-subtle, #94a3b8);
    text-decoration: line-through;
  }

  .bill-no:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .bill-date {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.35;
  }

  .bill-date__main {
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-size: 12.5px;
    font-weight: 600;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bill-date__sub {
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 11px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .customer__avatar {
    display: inline-flex;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    font-size: 12.5px;
    font-weight: 800;
    line-height: 1;
  }

  .customer__name {
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-size: 12.5px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customer__details {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .customer__warehouse {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--z-muted, #64748b);
    font-size: 11px;
    line-height: 1.35;
  }

  .customer__warehouse-icon {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 14px;
  }

  .customer__warehouse-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.55;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount--benefit {
    color: var(--z-ok, #15803d);
  }

  .amount--benefit.is-negative {
    color: var(--z-debit, #dc2626);
  }

  .cell-info {
    color: var(--z-muted, #64748b);
    font-size: 12px;
    font-weight: 600;
  }

  .payment-cell {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .payment-cell__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .pay-chip {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.55;
    white-space: nowrap;
  }

  .pay-chip--paid {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .pay-chip--partial {
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
  }

  .pay-chip--credit {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .payment-cell__remaining {
    min-width: 0;
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .payment-cell__remaining.is-open {
    color: var(--z-warn, #92400e);
  }

  .payment-cell__bar {
    display: block;
    height: 4px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--z-surface-3, #f1f5f9);
  }

  .payment-cell__fill {
    display: block;
    height: 100%;
    border-radius: 2px;
  }

  .payment-cell__fill--paid {
    background: #16a34a;
  }

  .payment-cell__fill--partial {
    background: #2f6fed;
  }

  .payment-cell__fill--credit {
    background: #d97706;
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding-inline-start: 9px;
    padding-inline-end: 10px;
    padding-block: 3px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.55;
    white-space: nowrap;
  }

  .status-chip__dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: currentColor;
  }

  .status-chip--ok {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
  }

  .status-chip--neutral {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
  }

  .status-chip--danger {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  /* The reference row actions are 30px squares with an 8px radius. */
  .sales-page :global(.table-actions .action-btn) {
    width: 30px;
    height: 30px;
    min-height: 30px;
    border-radius: 8px;
  }

  .empty-clear {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--z-border-strong, #dce6f8);
    border-radius: 9px;
    background: var(--z-surface, #ffffff);
    color: var(--z-link, #2f6fed);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .empty-clear:hover {
    background: var(--z-brand-soft, #e3ecff);
  }

  /* Reference empty state: glyph in a 48px tile. */
  .sales-page :global(.index-table-state .empty-state i) {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-muted, #64748b);
    font-size: 26px;
  }

  .sales-page :global(.index-table-state .empty-state p) {
    color: var(--z-ink, #0b1530);
    font-size: 14px;
    font-weight: 700;
  }

  @media (max-width: 1100px) {
    .kpi {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .sales-page :global(.index-toolbar-main .filter-toolbar-row) {
      flex-wrap: wrap;
    }

    .sales-page :global(.filter-tools--grouped) {
      max-width: 100%;
      overflow-x: auto;
    }
  }

  @media (max-width: 767.98px) {
    /* Reference mobile KPI: two compact cards, side figures dropped. */
    .kpi {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .kcard {
      padding: 8px 10px;
      gap: 8px;
    }

    .ktile {
      flex-basis: 28px;
      width: 28px;
      height: 28px;
    }

    .ktile .ms {
      font-size: 14px;
    }

    .kval {
      font-size: 15px;
    }

    .kside {
      display: none;
    }

    .sales-nav {
      padding-bottom: 8px;
    }

    .sales-head__actions {
      flex-wrap: wrap;
      width: 100%;
    }

    .active-filters {
      padding-inline: 10px;
    }

    .date-range__option {
      padding: 0 9px;
    }
  }
</style>
