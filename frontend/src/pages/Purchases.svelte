<script>
  import { onceAsync } from '../lib/onceAsync.js';
  import { warehouseApi } from '../api/warehouseApi.js';
  import { purchaseApi } from '../api/purchaseApi.js';
  import { accountApi } from '../api/accountApi.js';
  import { currencyApi } from '../api/currencyApi.js';
  import { applyCurrentFiscalYearRange } from '../utils/currentFiscalYear.js';
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { t, lang, translate_org_type, settings_all } from '../i18n/i18n';
  import { auth } from '../auth/authStore';
  import FilterToolbar from '../components/common/FilterToolbar.svelte';
  import DataTable from '../components/common/DataTable.svelte';
  import ActionButton from '../components/common/ActionButton.svelte';
  import ExportMenu from '../components/common/ExportMenu.svelte';
  import PaginationBar from '../components/common/PaginationBar.svelte';
  import EmptyState from '../components/common/EmptyState.svelte';
  import TableActions from '../components/common/TableActions.svelte';
  import IndexPageLayout from '../lib/components/index/IndexPageLayout.svelte';
  import PurchaseReceiptModal from './purchases/PurchaseReceiptModal.svelte';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../lib/pagination.js';

  $: bill_index_prefix = $settings_all.find((s) => s.key === 'bill_index_prefix')?.value || 'B-';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  $: permissions = $auth.permissions;

  export let account_id = null;
  const scopedAccountId = account_id;

  let purchases = [];
  let loading = true;
  let exportingReport = false;
  let accounts = [];
  let warehouses = [];
  let currencies = [];
  let purchase_payments = [];
  let purchase_returns = [];
  let totalItems = 0;
  let totalPages = 0;
  let bootstrapped = false;
  let lastPageKey = '';
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let lookupsLoaded = false;
  let printPurchase = null;

  function getPurchasesQueryKey() {
    return `${currentPage}|${itemsPerPage}|${account_id || ''}|${filterStatus}|${paymentStatus}|${selectedCurrency}|${fromDate}|${toDate}`;
  }

  let searchTerm = '';
  let filtersOpen = false;
  let filterStatus = 'all';
  let paymentStatus = 'all';
  let selectedCurrency = 'all';
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc';
  let fromDate = '';
  let toDate = '';

  /* ------------------------------------------------------------------ *
   * Reference formatting                                                *
   * ------------------------------------------------------------------ */

  /* Money reads in hundredths, like every bill the app prints. */
  const amountFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const CURRENCY_SYMBOL_FALLBACKS = { AFN: '؋', USD: '$', EUR: '€', PKR: 'Rs', IRR: '﷼' };
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

  function moneyLabel(value, currency) {
    return `${currencySymbol(currency)}\u200E ${amountText(value)}`;
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
    const normalizedCode = String(code ?? '').toUpperCase();
    if (!normalizedCode) return '';
    const match = currencies.find(
      (currency) => String(currency.code ?? '').toUpperCase() === normalizedCode,
    );
    return match?.symbol || CURRENCY_SYMBOL_FALLBACKS[normalizedCode] || t(normalizedCode);
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
   * those lists arrive, which left every supplier as «…» on first paint.
   */
  $: accountNameById = new Map(
    accounts.map((account) => [String(account.id), getAccountName(account)]),
  );
  $: warehouseNameById = new Map(
    warehouses.map((warehouse) => [String(warehouse.id), warehouse.name]),
  );

  function unknownSupplierLabel() {
    return lookupsLoaded ? t('Unknown') : '…';
  }

  function billLabel(purchase) {
    return `${bill_index_prefix}${purchase.bill_number ?? ''}`;
  }

  function purchaseDate(purchase) {
    return purchase.bill_date || purchase.created_at;
  }

  function remainingOf(purchase) {
    const computed = purchaseRemainingMap?.[purchase.id];
    return Number(computed != null ? computed : purchase.total_amount || 0);
  }

  function paidOf(purchase) {
    return (Number(purchase.total_amount) || 0) - remainingOf(purchase);
  }

  function paymentState(purchase) {
    if (remainingOf(purchase) <= AMOUNT_EPSILON) return 'paid';
    if (paidOf(purchase) > AMOUNT_EPSILON) return 'partial';
    return 'credit';
  }

  function paidPercent(purchase) {
    const total = Number(purchase.total_amount) || 0;
    if (total <= 0) return 0;
    const percent = Math.round((paidOf(purchase) / total) * 100);
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
      const [accountsResponse, warehouseResponse, currencyResponse] = await Promise.all([
        accountApi.getById(account_id),
        warehouseApi.getAll({ status: 1 }),
        currencyApi.getAll({ status: 1 }),
      ]);
      accounts = accountsResponse?.data ? [accountsResponse.data] : [];
      warehouses = warehouseResponse?.data || [];
      currencies = currencyResponse?.data || [];
      lookupsLoaded = true;
      return;
    }

    const [accountsResponse, warehouseResponse, currencyResponse] = await Promise.all([
      accountApi.getAll({ status: 1, role: 'supplier' }),
      warehouseApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
    ]);
    accounts = accountsResponse?.data || [];
    warehouses = warehouseResponse?.data || [];
    currencies = currencyResponse?.data || [];
    lookupsLoaded = true;
  });

  async function load() {
    const requestId = ++loadRequestId;
    lastPageKey = getPurchasesQueryKey();
    loading = true;
    try {
      // Supporting filters must not hold up the invoice table.
      void loadLookups().catch((error) => console.error('Failed to load filters', error));
      const response = await purchaseApi.getAllWithRelations({
        status: 1,
        search: searchTerm.trim(),
        account_id: account_id || undefined,
        bill_status: filterStatus !== 'all' ? filterStatus : undefined,
        payment_status: paymentStatus !== 'all' ? paymentStatus : undefined,
        currency: selectedCurrency !== 'all' ? selectedCurrency : undefined,
        page: currentPage,
        limit: itemsPerPage,
        skip_count:
          searchTerm.trim() ||
          account_id ||
          filterStatus !== 'all' ||
          paymentStatus !== 'all' ||
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
      purchases = response?.data || [];
      const meta = readListMeta(response, purchases.length);
      const hasMore = Boolean(response?.meta?.hasMore);
      totalItems = hasMore
        ? Math.max(meta.total, currentPage * itemsPerPage + 1)
        : Math.max(meta.total, (currentPage - 1) * itemsPerPage + purchases.length);
      totalPages = hasMore
        ? Math.max(currentPage + 1, Math.ceil(totalItems / itemsPerPage) || 0)
        : Math.max(currentPage, Math.ceil(totalItems / itemsPerPage) || 0);
      purchase_payments = purchases.flatMap((p) => p.payments || []);
      purchase_returns = purchases.flatMap((p) => p.returns || []);
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function reload() {
    // Changing the page is enough: the reactive block below reloads once.
    if (currentPage !== 1) {
      currentPage = 1;
      return;
    }
    lastPageKey = getPurchasesQueryKey();
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
    /*
     * Operational screens default to the CURRENT fiscal year, so a closed
     * year's documents stop appearing here. Nothing is deleted: the year
     * history still lists them, and the user can widen or replace the range
     * with the same date filters as before. When no fiscal year is configured
     * the range stays empty, which is the previous (lifetime) behaviour.
     */
    await applyCurrentFiscalYearRange(({ from, to }) => {
      fromDate = from;
      toDate = to;
    });

    lastPageKey = getPurchasesQueryKey();
    bootstrapped = true;
    await load();
  });

  onDestroy(() => {
    loadRequestId += 1;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void account_id;
    void filterStatus;
    void paymentStatus;
    void selectedCurrency;
    void fromDate;
    void toDate;
    const key = getPurchasesQueryKey();
    if (key !== lastPageKey) {
      lastPageKey = key;
      load();
    }
  }

  /* ------------------------------------------------------------------ *
   * Actions                                                             *
   * ------------------------------------------------------------------ */

  function openNewPurchase() {
    if (account_id) {
      push(`/dashboard/account-purchase-form/${account_id}`);
    } else {
      push(`/dashboard/purchase-form/0`);
    }
  }

  async function exportPurchases(format) {
    if (exportingReport) return;

    exportingReport = true;

    try {
      const exporter = format === 'excel'
        ? (await import('./generateExcel.js')).generateExcel
        : (await import('./generatePDF.js')).generatePDF;

      await exporter(
        'purchases',
        filteredPurchases,
        fromDate,
        toDate,
        filteredPurchases.length,
        totalPurchasesAmount,
        {},
      );
    } catch (error) {
      console.error('Failed to generate purchases report:', error);
    } finally {
      exportingReport = false;
    }
  }

  function purchaseActions(purchase) {
    const remaining = remainingOf(purchase);
    return [
      {
        icon: 'bi-printer',
        label: t('Print'),
        tone: 'muted',
        onClick: () => (printPurchase = purchase),
      },
      {
        icon: 'bi-eye',
        label: t('View'),
        tone: 'view',
        onClick: () => push(`/dashboard/purchases/${purchase.id}`),
      },
      {
        icon: 'bi-pencil',
        label: t('Edit'),
        tone: 'edit',
        onClick: () => push(`/dashboard/purchase-form/${purchase.id}`),
      },
      {
        icon: 'bi-wallet2',
        label: t('Payments'),
        disabled: remaining <= AMOUNT_EPSILON,
        onClick: () => push(`/dashboard/purchases/${purchase.id}`),
      },
    ];
  }

  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = ['created_at', 'bill_date', 'id', 'bill_number'].includes(column)
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

  /* ------------------------------------------------------------------ *
   * Filters                                                             *
   * ------------------------------------------------------------------ */

  function handlePurchaseToolbarFilter(event) {
    const { key, value } = event.detail;
    if (key === 'account') {
      if (scopedAccountId) return;
      account_id = value === 'all' ? null : Number(value);
    }
    if (key === 'status') filterStatus = value;
    if (key === 'paymentStatus') paymentStatus = value;
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
    paymentStatus = 'all';
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

  $: filteredPurchases = purchases;

  $: totalPurchasesAmount = filteredPurchases.reduce((totals, p) => {
    if (!p.bill_status || p.bill_status !== 'confirmed') return totals;
    if (!totals[p.currency]) totals[p.currency] = 0;
    totals[p.currency] += Number(p.total_amount);
    return totals;
  }, {});

  // Sum payments for purchases currently in the filtered list (grouped by currency)
  $: totalPaymentsAmount = (() => {
    const totals = {};
    if (!purchase_payments || purchase_payments.length === 0) return totals;
    const purchaseIds = new Set(filteredPurchases.filter(p => p.bill_status === 'confirmed').map(p => p.id));
    for (const pp of purchase_payments) {
      if (!purchaseIds.has(pp.purchase_id)) continue;
      if (!totals[pp.currency]) totals[pp.currency] = 0;
      totals[pp.currency] += Number(pp.amount || 0);
    }
    return totals;
  })();

  // Sum returns for purchases currently in the filtered list (grouped by currency)
  $: totalReturnsAmount = (() => {
    const totals = {};
    if (!purchase_returns || purchase_returns.length === 0) return totals;
    const purchaseIds = new Set(filteredPurchases.filter(p => p.bill_status === 'confirmed').map(p => p.id));
    for (const r of purchase_returns) {
      if (!purchaseIds.has(r.purchase_id)) continue;
      if (!totals[r.currency]) totals[r.currency] = 0;
      totals[r.currency] += Number(r.total_amount || 0);
    }
    return totals;
  })();

  // Aggregate payments by purchase id
  $: paymentsByPurchase = (() => {
    const map = {};
    if (!purchase_payments || purchase_payments.length === 0) return map;
    for (const pp of purchase_payments) {
      if (!map[pp.purchase_id]) map[pp.purchase_id] = 0;
      map[pp.purchase_id] += Number(pp.amount || 0);
    }
    return map;
  })();

  // Aggregate returns by purchase id
  $: returnsByPurchase = (() => {
    const map = {};
    if (!purchase_returns || purchase_returns.length === 0) return map;
    for (const r of purchase_returns) {
      if (!map[r.purchase_id]) map[r.purchase_id] = 0;
      map[r.purchase_id] += Number(r.total_amount || 0);
    }
    return map;
  })();

  // Remaining amount per purchase (in purchase currency)
  $: purchaseRemainingMap = (() => {
    const map = {};
    for (const p of purchases || []) {
      const paid = Number(paymentsByPurchase?.[p.id] || 0);
      const ret = Number(returnsByPurchase?.[p.id] || 0);
      map[p.id] = Number(p.total_amount || 0) - paid - ret;
    }
    return map;
  })();

  /* ------------------------------------------------------------------ *
   * KPI cards                                                           *
   * ------------------------------------------------------------------ */

  $: confirmedRows = filteredPurchases.filter((purchase) => purchase.bill_status === 'confirmed');
  $: settledRows = confirmedRows.filter((purchase) => remainingOf(purchase) <= AMOUNT_EPSILON);
  $: openRows = confirmedRows.filter((purchase) => remainingOf(purchase) > AMOUNT_EPSILON);
  $: overdueRows = openRows.filter((purchase) => {
    const offset = dayOffset(purchase.due_date);
    return offset !== null && offset < 0;
  });
  $: soonRows = openRows.filter((purchase) => {
    const offset = dayOffset(purchase.due_date);
    return offset !== null && offset >= 0 && offset <= 3;
  });

  $: totalByCurrency = sumByCurrency(confirmedRows, (purchase) => purchase.total_amount);
  $: paidByCurrency = sumByCurrency(confirmedRows, (purchase) => paidOf(purchase));
  $: outstandingByCurrency = sumByCurrency(openRows, (purchase) => remainingOf(purchase));
  $: overdueByCurrency = sumByCurrency(overdueRows, (purchase) => remainingOf(purchase));

  $: headerCurrency =
    selectedCurrency !== 'all'
      ? selectedCurrency
      : Object.entries(totalByCurrency).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ||
        confirmedRows[0]?.currency ||
        'AFN';

  $: dailySeries = (() => {
    const days = new Map();
    for (const purchase of confirmedRows) {
      const key = isoDate(purchaseDate(purchase));
      if (!key) continue;
      const entry = days.get(key) || { total: 0, outstanding: 0 };
      entry.total += Number(purchase.total_amount) || 0;
      entry.outstanding += Math.max(remainingOf(purchase), 0);
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

  $: paidPercentTotal = totalByCurrency && Object.keys(totalByCurrency).length === 1
    ? (() => {
        const [currency] = Object.keys(totalByCurrency);
        const total = Number(totalByCurrency[currency]) || 0;
        if (total <= 0) return 0;
        return Math.min(100, Math.max(0, Math.round(((total - Number(outstandingByCurrency[currency] || 0)) / total) * 100)));
      })()
    : 0;

  $: kpiCards = (($lang, [
    {
      key: 'total',
      label: t('Total Purchases Amount'),
      icon: 'shopping_bag',
      lines: moneyLines(totalByCurrency),
      sub: `${filteredPurchases.length} ${t('Bill')}`,
      title: t('Total Purchases Amount'),
      spark: sparkPoints('total'),
      sparkTone: 'brand',
    },
    {
      key: 'paid',
      label: t('Paid'),
      icon: 'payments',
      lines: moneyLines(paidByCurrency),
      sub: `${settledRows.length} ${t('Settled')}`,
      title: t('Paid'),
      chip: `${paidPercentTotal}%`,
      chipTone: 'ok',
      bar: paidPercentTotal,
      barTone: 'ok',
    },
    {
      key: 'outstanding',
      label: t('Payable'),
      icon: 'pending_actions',
      lines: moneyLines(outstandingByCurrency),
      sub: `${openRows.length} ${t('Bill')}`,
      title: t('Payable'),
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
      sub: `${overdueRows.length} ${t('Bill')} · ${soonRows.length} ${t('Due Soon')}`,
      title: t('Overdue'),
      valueTone: overdueRows.length ? 'danger' : 'ink',
    },
  ]));

  /* ------------------------------------------------------------------ *
   * Filter chips, toolbar fields, footer                                 *
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
        key: 'supplier',
        label: `${t('Supplier')}: ${accountNameById.get(String(account_id)) || unknownSupplierLabel()}`,
        
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

    if (paymentStatus !== 'all') {
      chips.push({
        key: 'payment',
        label: `${t('Payment')}: ${t(paymentStatus)}`,
        clear: () => {
          paymentStatus = 'all';
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

  $: statusFilterOptions = [
    { value: 'all', label: t('All Statuses') },
    { value: 'confirmed', label: t('Confirmed') },
    { value: 'draft', label: t('Draft') },
    { value: 'return', label: t('Return') },
  ];

  $: paymentStatusFilterOptions = [
    { value: 'all', label: t('All Payment Statuses') },
    { value: 'paid', label: t('Settled') },
    { value: 'unpaid', label: t('Unpaid') },
  ];

  $: purchaseToolbarFilters = [
    {
      key: 'account',
      label: t('Supplier'),
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
      value: paymentStatus,
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

  $: purchasesCountLabel = `${totalItems} ${totalItems < 2 ? t('Purchase') : t('Purchases')}`;
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

{#if !permissions?.some((p) => p.code === 'Purchases' && p.view)}
  <h3 class="permission-denied">
    <span class="ms" aria-hidden="true">error</span>
    {t('No access allowed')}
  </h3>
{:else}
  <div class="purchases-page">
    <IndexPageLayout
      dir={t('dir')}
      ariaLabel={t('Purchases')}
      showExtra={true}
      showStats={true}
      showFooter={!loading && totalItems > 0}
      dense={true}
      contentClass="purchases-index-content"
      tablePadding={true}>
      <svelte:fragment slot="extra">
        <ExportMenu
          showLabel={true}
          loading={exportingReport}
          disabled={exportingReport || filteredPurchases.length === 0}
          on:export={(event) => exportPurchases(event.detail)} />
        {#if permissions?.some((p) => p.code === 'Purchases' && p.create)}
          <ActionButton
            icon="add"
            label={t('New Purchase')}
            extraClass="purchases-create"
            on:click={openNewPurchase} />
        {/if}
      </svelte:fragment>

      <svelte:fragment slot="stats">
        <section class="kpi" aria-label={t('Purchases')}>
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
                      <polyline points={card.spark} fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  {/if}
                  {#if card.bar != null}
                    <span class="kbar" aria-hidden="true">
                      <span class="kbar__fill kbar__fill--{card.barTone}" style:width={`${card.bar}%`}></span>
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
          searchPlaceholder={t('Search bill or supplier…')}
          filters={purchaseToolbarFilters}
          filterLabel={t('Filter')}
          resetLabel={t('Clear Filters')}
          applyLabel={t('Show')}
          activeCount={toolbarActiveCount}
          showReset={true}
          on:searchChange={(event) => {
            searchTerm = event.detail;
            scheduleSearchReload();
          }}
          on:filterChange={handlePurchaseToolbarFilter}
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
      {:else if filteredPurchases.length === 0}
        <div class="index-table-state">
          <EmptyState
            icon="bi-search"
            message={t('No purchases found.')}
            description={t('Change the range or filters')}>
            <button type="button" class="empty-clear" on:click={clearAllFilters}>
              {t('Clear Filters')}
            </button>
          </EmptyState>
        </div>
      {:else}
        <DataTable
          ariaLabel={t('Purchases')}
          minWidth="980px"
          dense={true}
          striped={false}
          hover={false}
          stickyHeader={true}
          headerHeight="40px"
          cellPaddingY="6px"
          cellPaddingX="12px"
          edgePaddingX="16px"
          mobileCards={true}>
          <svelte:fragment slot="head">
            <tr>
              <th class="col-start" aria-sort={sortAria('bill_number')}>
                <button type="button" class="th-sort" on:click={() => setSort('bill_number')}>
                  {t('Bill #')}
                  {#if sortColumn === 'bill_number'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
              <th class="col-center" aria-sort={sortAria('bill_date')}>
                <button type="button" class="th-sort" on:click={() => setSort('created_at')}>
                  {t('Date')}
                  {#if sortColumn === 'created_at'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
              <th>
                <button type="button" class="th-sort" on:click={() => setSort('account_id')}>
                  {t('Supplier')}
                  {#if sortColumn === 'account_id'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
              <th>
                <button type="button" class="th-sort" on:click={() => setSort('warehouse_id')}>
                  {t('Warehouse')}
                  {#if sortColumn === 'warehouse_id'}
                    <span class="ms sort-icon" aria-hidden="true">
                      {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                    </span>
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
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
                  {:else}
                    <span class="ms sort-icon sort-icon--idle" aria-hidden="true">swap_vert</span>
                  {/if}
                </button>
              </th>
              <th>
                {t('Payment')}
                <span class="th-hint">({t('Remaining')} {currencySymbol(headerCurrency)})</span>
              </th>
              <th>{t('Status')}</th>
              <!-- The reference leaves this header blank; the label still names
                   the column for assistive tech. -->
              <th class="col-end actions-head">{t('Actions')}</th>
            </tr>
          </svelte:fragment>

          {#each filteredPurchases as purchase (purchase.id)}
            {@const remaining = remainingOf(purchase)}
            {@const state = paymentState(purchase)}
            {@const supplier = accountNameById.get(String(purchase.account_id)) || unknownSupplierLabel()}
            {@const warehouse = warehouseNameById.get(String(purchase.warehouse_id)) || ''}
            {@const purchaseCurrency = purchase.currency || 'AFN'}
            {@const showUnit = String(purchaseCurrency) !== String(headerCurrency)}
            <tr class="purchase-row">
              <td class="col-start">
                <button
                  type="button"
                  class="bill-no"
                  dir="ltr"
                  title={`${billLabel(purchase)} · ${supplier}`}
                  on:click={() => push(`/dashboard/purchases/${purchase.id}`)}>
                  {billLabel(purchase)}
                </button>
              </td>
              <td class="col-center">
                <div class="bill-date" title={isoDate(purchaseDate(purchase))}>
                  <span class="bill-date__main">{persianDate(purchaseDate(purchase))}</span>
                  <span class="bill-date__sub" dir="ltr">{isoDate(purchaseDate(purchase))}</span>
                </div>
              </td>
              <td>
                <span class="supplier">
                  <span class="supplier__avatar" aria-hidden="true">{supplier.charAt(0)}</span>
                  <span class="supplier__name" title={supplier}>{supplier}</span>
                </span>
              </td>
              <td>
                <span class="warehouse-cell" title={warehouse || t('Warehouse')}>
                  <span class="ms warehouse-cell__icon" aria-hidden="true">warehouse</span>
                  <span class="warehouse-cell__name">{warehouse || '—'}</span>
                </span>
              </td>
              <td class="col-end">
                <span class="amount" dir="ltr" title={`${amountText(purchase.total_amount)} ${t(purchaseCurrency)}`}>
                  {moneyLabel(purchase.total_amount, purchaseCurrency)}
                </span>
              </td>
              <td>
                <div class="payment-cell">
                  <span class="payment-cell__row">
                    <span class="pay-chip pay-chip--{state}">{t(state === 'paid' ? 'Settled' : state === 'partial' ? 'Partial' : 'On Credit')}</span>
                    <span
                      class="payment-cell__remaining"
                      class:is-open={remaining > AMOUNT_EPSILON}
                      dir="ltr"
                      title={`${t('Remaining')}: ${amountText(remaining)} ${t(purchaseCurrency)}`}>
                      {amountText(remaining)}{#if showUnit}<span class="amount__unit">{currencySymbol(purchaseCurrency)}</span>{/if}
                    </span>
                  </span>
                  <span class="payment-cell__bar" aria-hidden="true">
                    <span
                      class="payment-cell__fill payment-cell__fill--{state}"
                      style:width={`${paidPercent(purchase)}%`}></span>
                  </span>
                </div>
              </td>
              <td>
                <span class="status-chip status-chip--{statusTone(purchase.bill_status)}">
                  <span class="status-chip__dot" aria-hidden="true"></span>
                  {statusLabel(purchase.bill_status)}
                </span>
              </td>
              <td class="col-end">
                <TableActions material={true} actions={purchaseActions(purchase)} />
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
          ariaLabel={t('Purchases pagination')}
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

  {#if printPurchase}
    <PurchaseReceiptModal purchase={printPurchase} on:close={() => (printPurchase = null)} />
  {/if}
{/if}

<style>
  .purchases-page {
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
   * The reference puts the action row and the KPI row on the page surface and
   * the toolbar, table and pager inside one 14px sheet, so the shared panel is
   * unwrapped here and its children are re-ordered to that stack.
   */
  .purchases-page :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .purchases-page :global(.index-statistics) {
    order: -1;
    flex: 0 0 auto;
    padding: 0;
    margin-bottom: 12px;
    border: 0;
    background: transparent;
  }

  .purchases-page :global(.index-toolbar) {
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

  .purchases-page :global(.index-toolbar-main) {
    gap: 8px;
  }

  .purchases-page :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
    flex-wrap: nowrap;
  }

  .purchases-page :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    --z-row-border: var(--z-border-soft, #eef2f7);
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }

  .purchases-page :global(.purchases-index-content .data-table-wrap) {
    border: 0;
  }

  .purchases-page :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .purchases-page :global(.index-footer .pagination-shell) {
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
    padding: 0 6px 0 10px;
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

  .actions-head {
    color: transparent;
    font-size: 0;
  }

  .th-hint {
    margin-inline-start: 2px;
    color: var(--z-subtle, #94a3b8);
    font-size: 10.5px;
    font-weight: 500;
  }

  /* ---------- rows ---------- */
  .purchase-row {
    height: auto;
  }

  .purchase-row:hover {
    background: var(--z-hover, #f5f9ff);
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

  .supplier {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .supplier__avatar {
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

  .supplier__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--z-ink, #0b1530);
    font-size: 12.5px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .warehouse-cell {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--z-text, #475569);
  }

  .warehouse-cell__icon {
    flex: 0 0 auto;
    color: var(--z-subtle, #94a3b8);
    font-size: 15px;
  }

  .warehouse-cell__name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 12.5px;
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

  .amount__unit {
    margin-inline-start: 4px;
    color: var(--z-subtle, #94a3b8);
    font-size: 10px;
    font-weight: 700;
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
    padding: 3px 10px 3px 9px;
    padding-inline-start: 9px;
    padding-inline-end: 10px;
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
  .purchases-page :global(.table-actions .action-btn) {
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
  .purchases-page :global(.index-table-state .empty-state i) {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-muted, #64748b);
    font-size: 26px;
  }

  .purchases-page :global(.index-table-state .empty-state p) {
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
    .purchases-page :global(.index-toolbar-main .filter-toolbar-row) {
      flex-wrap: wrap;
    }

    .purchases-page :global(.filter-tools--grouped) {
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

    .active-filters {
      padding-inline: 10px;
    }

    .date-range__option {
      padding: 0 9px;
    }
  }
</style>
