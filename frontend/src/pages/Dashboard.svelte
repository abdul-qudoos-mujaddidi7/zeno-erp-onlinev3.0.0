<script>
  import { onMount } from 'svelte';
  import { t, lang, settings_all } from '../i18n/i18n';
  import { toGregorian, toJalaali } from 'jalaali-js';
  import { dashboardApi } from '../api/dashboardApi.js';
  import { saleApi } from '../api/saleApi.js';
  import { purchaseApi } from '../api/purchaseApi.js';
  import { journalApi } from '../api/journalApi.js';
  import { exchangeApi } from '../api/exchangeApi.js';
  import { warehouseApi } from '../api/warehouseApi.js';
  import { warehouseProductApi } from '../api/warehouseProductApi.js';
  import { productApi } from '../api/productApi.js';
  import { subscriptionApi } from '../api/subscriptionApi.js';
  import { accountApi } from '../api/accountApi.js';
  import { accountTypeApi } from '../api/accountTypeApi.js';
  import { currencyApi } from '../api/currencyApi.js';
  import { getDashboardExchangeRates } from '../services/marketRates.js';
  import { findTreasuryAccountId } from './accounts/AccountsHelper.js';
  import { auth } from '../auth/authStore';
  import { canViewDashboard, canViewDashboardCard, canViewModule } from '../auth/permissions.js';
  import { getSubscriptionExpiryReminder } from '../utils/subscriptionExpiry.js';
  import { toAccountingDateString } from '../utils/accountingDate.js';
  import DashboardBoard from '../components/DashboardBoard.svelte';

  $: _lang = $lang;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_sales_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;
  $: enable_purchase_due_date = $settings_all.find((s) => s.key === 'enable_purchase_bill_due_date')?.value == 1;

  // Every card is gated by the module that owns its data. A permission set with
  // no entry for a module keeps the legacy behaviour (visible), so a card only
  // disappears when its permission was explicitly unchecked.
  $: permissions = $auth.permissions;
  $: subscriptionReminder = getSubscriptionExpiryReminder($auth.subscription);
  $: canViewDashboardPage = canViewDashboard(permissions);
  $: canViewBenefit = canViewModule(permissions, 'Benefit');
  $: canViewAccounts = canViewModule(permissions, 'Accounts');
  $: canViewSales = canViewModule(permissions, 'Sales');
  $: canViewPurchases = canViewModule(permissions, 'Purchases');
  $: canViewProducts = canViewModule(permissions, 'Products');
  $: canViewJournals = canViewModule(permissions, 'Journals');
  $: canViewExchange = canViewModule(permissions, 'Exchange');

  // Modules decide what the cards may contain (a series, a mix entry, a
  // number). The card rows decide whether the card itself is shown, falling
  // back to their module when the operator has no card decision.
  $: cardExpenses = canViewDashboardCard(permissions, 'expenses');
  $: cardNetProfit = canViewDashboardCard(permissions, 'netProfit');
  $: cardTrend = canViewDashboardCard(permissions, 'trend');
  $: cardTreasury = canViewDashboardCard(permissions, 'treasury');
  $: cardTopProducts = canViewDashboardCard(permissions, 'topProducts');
  $: cardStockAlerts = canViewDashboardCard(permissions, 'stockAlerts');
  $: cardDebtors = canViewDashboardCard(permissions, 'debtors');

  let loading = true;
  let loadingMetricData = true;
  let error = '';

  let defaultCurrency = 'AFN';

  let netBenefit = ['-', 0, {}, {}];
  let treasuryBalance = {};
  let treasuryAccountId = null;
  let totalPurchaseCostMap = {};
  let defaultCurrencyPurchaseCostMap = 0;

  let lowStockProducts = [];
  let lowStockTotal = 0;
  let expiringProducts = [];
  let expiringTotal = 0;
  let plainTopProducts = [];
  let topDebtors = { total: 0, sum: 0, default_currency: 'AFN', items: [] };

  let activePeriod = 'week';
  let customStartDate = new Date(new Date().setDate(new Date().getDate() - 30))
    .toISOString()
    .slice(0, 10);
  let customEndDate = new Date().toISOString().slice(0, 10);
  let returnsPeriod = 'today';
  let returnsCustomStartDate = customStartDate;
  let returnsCustomEndDate = customEndDate;
  let returnMetricRequest = 0;
  let returnMetricData = { saleReturns: 0, purchaseReturns: 0, wastes: 0, saleReturnCount: 0, purchaseReturnCount: 0, wasteCount: 0 };
  let lastRefreshed = null;

  /* The exchange card reads configured currency rates. Live market rates remain
     available for the dashboard's balance conversions. */
  let marketRates = null;
  let systemCurrencies = [];
  let marketAccounts = [];
  let marketAccountTypes = [];
  let warehouseRows = [];
  let recentTransactions = [];
  let overdueBills = [];
  let draftBills = [];

  let metricDataTotal = {
    sales: 0,
    purchases: 0,
    benefit: 0,
    expenses: 0,
    saleReturns: 0,
    purchaseReturns: 0,
    wastes: 0,
  };

  let metricDataCount = {
    sales: 0,
    salesCash: 0,
    salesCredit: 0,
    purchases: 0,
    purchasesCash: 0,
    purchasesCredit: 0,
    expenses: 0,
    saleReturns: 0,
    purchaseReturns: 0,
    wastes: 0,
  };

  let trendData = {
    labels: [],
    sales: [],
    purchases: [],
    benefit: [],
    expenses: [],
  };

  $: treasuryEntries = Object.entries(treasuryBalance || {});
  $: treasuryHref = treasuryAccountId
    ? `/dashboard/account/${treasuryAccountId}`
    : '/dashboard/treasury';

  $: benefitTotal = Number(metricDataTotal.benefit) || 0;
  $: expenseTotal = Number(metricDataTotal.expenses) || 0;
  $: netProfit = benefitTotal - expenseTotal;
  $: marginPercent = Number(metricDataTotal.sales) > 0
    ? (netProfit / Number(metricDataTotal.sales)) * 100
    : 0;

  $: periodLabels = {
    today: t('Today'),
    week: t('This Week'),
    month: t('This Month'),
    year: t('This Year'),
    custom: t('Custom'),
  };
  $: periodLabel = periodLabels[activePeriod] || periodLabels.today;

  async function refreshSubscription() {
    try {
      const response = await subscriptionApi.getCurrent();
      if (!response?.subscription) {
        throw new Error('Subscription data was missing from the server response.');
      }

      localStorage.setItem('subscription', JSON.stringify(response.subscription));
      auth.update((current) => ({
        ...current,
        subscription: response.subscription,
      }));
    } catch (subscriptionError) {
      console.error('Failed to refresh dashboard subscription reminder:', subscriptionError);
    }
  }

  onMount(() => {
    refresh();
    loadReturnsMetrics();
    refreshSubscription();
    resolveTreasuryAccount();
    loadMarket();
    loadSupplementalReports();
  });

  /* The detailed report cards use the existing operational APIs. The stock
     card is a current inventory valuation; SVSale has no dated warehouse
     valuation history endpoint, so it does not invent a time series. */
  async function loadSupplementalReports() {
    /* Business-calendar cutoff for a bill that is seven days past due. */
    const lateCutoff = new Date(`${toAccountingDateString()}T00:00:00Z`);
    lateCutoff.setUTCDate(lateCutoff.getUTCDate() - 7);
    const lateCutoffDate = lateCutoff.toISOString().slice(0, 10);

    const [salesResult, purchasesResult, journalsResult, exchangesResult, overdueSalesResult, draftSalesResult, draftPurchasesResult, warehousesResult, productsResult, stockResult] = await Promise.allSettled([
      canViewSales ? saleApi.getAll({ status: 1, relations: 1, limit: 6, sort_by: 'invoice_date', sort_dir: 'desc' }) : Promise.resolve(null),
      canViewPurchases ? purchaseApi.getAll({ status: 1, relations: 1, limit: 6, sort_by: 'bill_date', sort_dir: 'desc' }) : Promise.resolve(null),
      canViewJournals ? journalApi.getAll({ status: 1, page: 1, limit: 20 }) : Promise.resolve(null),
      canViewExchange ? exchangeApi.getAll({ status: 1, page: 1, limit: 6 }) : Promise.resolve(null),
      canViewSales && enable_sales_due_date ? saleApi.getAll({ status: 1, relations: 1, invoice_status: 'confirmed', payment_status: 'unpaid', due_before: lateCutoffDate, page: 1, limit: 100, sort_by: 'due_date', sort_dir: 'asc' }) : Promise.resolve(null),
      canViewSales ? saleApi.getAll({ status: 1, relations: 1, invoice_status: 'draft', page: 1, limit: 100, sort_by: 'invoice_date', sort_dir: 'desc' }) : Promise.resolve(null),
      canViewPurchases ? purchaseApi.getAll({ status: 1, relations: 1, bill_status: 'draft', page: 1, limit: 100, sort_by: 'bill_date', sort_dir: 'desc' }) : Promise.resolve(null),
      canViewProducts ? warehouseApi.getAll({ status: 1 }) : Promise.resolve(null),
      canViewProducts ? productApi.getAll({ status: 1 }) : Promise.resolve(null),
      canViewProducts ? warehouseProductApi.getAll({ status: 1 }) : Promise.resolve(null),
    ]);

    const rows = (result) => result.status === 'fulfilled' ? (result.value?.data || []) : [];
    /*
     * The late-bills tab is a sales collection list: only confirmed sale
     * invoices that are still unpaid and whose due date passed at least seven
     * days ago. Purchases are deliberately excluded.
     */
    const overdueSales = rows(overdueSalesResult).filter(
      (item) =>
        item.due_date &&
        String(item.due_date).slice(0, 10) <= lateCutoffDate,
    );

    /*
     * The sale list row only carries account_id, so the customer name is
     * resolved in one batched lookup for the rows the panel actually shows.
     * The list is ordered by due date, so the first six are the oldest bills.
     */
    const overdueCustomerIds = [
      ...new Set(
        overdueSales
          .slice(0, 6)
          .map((item) => Number(item.account_id))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ];
    let overdueCustomers = new Map();
    if (overdueCustomerIds.length) {
      try {
        const response = await accountApi.getAll({
          status: 1,
          ids: overdueCustomerIds.join(','),
        });
        overdueCustomers = new Map(
          (response?.data || []).map((account) => [Number(account.id), partyName(account)]),
        );
      } catch (lookupError) {
        console.warn('Dashboard late-bill customer lookup failed:', lookupError);
      }
    }

    overdueBills = overdueSales.map((item) => ({
      ...item,
      kind: 'sale',
      href: `/dashboard/sales/${item.id}`,
      number: item.invoice_number || `#${item.id}`,
      party: item.account?.name || item.account_name || overdueCustomers.get(Number(item.account_id)) || '—',
      amount: Number(item.remaining) || 0,
    }));
    draftBills = [
      ...rows(draftSalesResult).map((item) => ({ ...item, kind: 'sale', href: `/dashboard/sales/${item.id}`, number: item.invoice_number || `#${item.id}`, party: item.account?.name || item.account_name || '—', date: item.invoice_date || item.created_at, amount: Number(item.total_amount) || 0 })),
      ...rows(draftPurchasesResult).map((item) => ({ ...item, kind: 'purchase', href: `/dashboard/purchases/${item.id}`, number: item.bill_number || `#${item.id}`, party: item.account?.name || item.account_name || '—', date: item.bill_date || item.created_at, amount: Number(item.total_amount) || 0 })),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const sales = rows(salesResult).map((item) => ({
      id: item.id,
      kind: 'sale',
      label: t('Sales'),
      number: item.invoice_number || `#${item.id}`,
      party: item.account?.name || item.account_name || '—',
      date: item.invoice_date || item.created_at,
      amount: Number(item.total_amount) || 0,
      currency: item.currency || defaultCurrency,
      status: item.invoice_status,
      href: `/dashboard/sales/${item.id}`,
    }));
    const purchases = rows(purchasesResult).map((item) => ({
      id: item.id,
      kind: 'purchase',
      label: t('Purchases'),
      number: item.bill_number || `#${item.id}`,
      party: item.account?.name || item.account_name || '—',
      date: item.bill_date || item.created_at,
      amount: Number(item.total_amount) || 0,
      currency: item.currency || defaultCurrency,
      status: item.bill_status,
      href: `/dashboard/purchases/${item.id}`,
    }));
    const journals = rows(journalsResult)
      .filter((item) => item.reference_type !== 'fiscal_year_close')
      .map((item) => ({
        id: item.id,
        kind: 'journal',
        label: t('Journals'),
        number: item.journal_number || item.reference_number || `#${item.id}`,
        party: item.account?.name || item.account_name || item.description || '—',
        date: item.date || item.created_at,
        amount: Number(item.amount ?? item.total_amount) || 0,
        currency: item.currency || defaultCurrency,
        status: item.status,
        href: '/dashboard/journals/list',
      }));
    const exchanges = rows(exchangesResult).map((item) => ({
      id: item.id,
      kind: 'exchange',
      label: t('Exchange'),
      number: item.exchange_number || item.reference_number || `#${item.id}`,
      party: item.account?.name || item.account_name || item.description || '—',
      date: item.date || item.created_at,
      amount: Number(item.amount ?? item.total_amount) || 0,
      currency: item.currency || defaultCurrency,
      status: item.status,
      href: '/dashboard/exchanges/list',
    }));
    recentTransactions = [...sales, ...purchases, ...journals, ...exchanges]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 6);

    if (productsResult.status === 'fulfilled' && stockResult.status === 'fulfilled' && warehousesResult.status === 'fulfilled') {
      const products = rows(productsResult);
      const warehouses = rows(warehousesResult);
      const stock = rows(stockResult);
      const productById = new Map(products.map((item) => [Number(item.id), item]));
      const warehouseById = new Map(warehouses.map((item) => [Number(item.id), item]));
      const totals = new Map();
      for (const item of stock) {
        const product = productById.get(Number(item.product_id));
        const warehouse = warehouseById.get(Number(item.warehouse_id));
        if (!warehouse) continue;
        const current = totals.get(Number(warehouse.id)) || { value: 0, quantity: 0, unpriced: false };
        const quantity = Number(item.quantity) || 0;
        current.quantity += quantity;
        if (product) {
          const amount = quantity * Math.abs(Number(product.buy_price) || 0);
          const value = convertInventoryValue(amount, product.buy_currency || defaultCurrency);
          if (value == null) current.unpriced = true;
          else current.value += value;
        }
        totals.set(Number(warehouse.id), current);
      }
      const maxValue = Math.max(1, ...Array.from(totals.values(), (item) => item.unpriced ? 0 : item.value));
      warehouseRows = warehouses
        .filter((warehouse) => totals.has(Number(warehouse.id)))
        .map((warehouse) => ({
          id: warehouse.id,
          name: warehouse.name,
          value: totals.get(Number(warehouse.id)).unpriced ? null : totals.get(Number(warehouse.id)).value,
          quantity: totals.get(Number(warehouse.id)).quantity,
          share: Math.max(3, ((totals.get(Number(warehouse.id)).unpriced ? 0 : totals.get(Number(warehouse.id)).value) / maxValue) * 100),
          href: `/dashboard/warehouse/${warehouse.id}`,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
    }
  }

  function convertInventoryValue(amount, currency) {
    const source = String(currency || defaultCurrency).toUpperCase();
    const destination = String(defaultCurrency || 'AFN').toUpperCase();
    if (source === destination) return amount;
    const afnPerUnit = {
      AFN: 1,
      USD: Number(marketRates?.usdToAfn),
      EUR: Number(marketRates?.eurToAfn),
    };
    const sourceRate = afnPerUnit[source];
    const destinationRate = afnPerUnit[destination];
    if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(destinationRate) || destinationRate <= 0) return null;
    return amount * sourceRate / destinationRate;
  }

  /*
   * Treasury balances come from the summary endpoint as a currency map with no
   * account id, so the card resolves the account once from its system code. A
   * failed lookup (for example without the Accounts permission) leaves the card
   * pointing at the aggregate treasury page.
   */
  async function resolveTreasuryAccount() {
    try {
      treasuryAccountId = await findTreasuryAccountId();
    } catch (lookupError) {
      console.warn('Dashboard treasury account lookup failed:', lookupError);
      treasuryAccountId = null;
    }
  }

  async function loadMarket() {
    const [ratesResult, currenciesResult, typesResult, accountsResult] = await Promise.allSettled([
      getDashboardExchangeRates(),
      currencyApi.getAll({ status: 1 }),
      canViewAccounts ? accountTypeApi.getAll({ status: 1 }) : Promise.resolve(null),
      canViewAccounts ? accountApi.getAll({ status: 1, exclude_system: 1 }) : Promise.resolve(null),
    ]);

    if (ratesResult.status === 'fulfilled' && ratesResult.value) {
      marketRates = ratesResult.value;
    }

    if (currenciesResult.status === 'fulfilled' && currenciesResult.value) {
      systemCurrencies = currenciesResult.value.data || [];
    }

    if (typesResult.status === 'fulfilled' && typesResult.value) {
      marketAccountTypes = typesResult.value.data || [];
    }

    if (accountsResult.status === 'fulfilled' && accountsResult.value) {
      marketAccounts = accountsResult.value.data || [];
    }
  }

  function fmt(n) {
    if (n == null || isNaN(Number(n))) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Number(n));
  }

  function toDateParam(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatPersianDay(date) {
    const afghanMonthsMap = {
      فروردین: 'حمل',
      اردیبهشت: 'ثور',
      خرداد: 'جوزا',
      تیر: 'سرطان',
      مرداد: 'اسد',
      شهریور: 'سنبله',
      مهر: 'میزان',
      آبان: 'عقرب',
      آذر: 'قوس',
      دی: 'جدی',
      بهمن: 'دلو',
      اسفند: 'حوت',
    };

    const parts = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
      day: 'numeric',
      month: 'long',
    }).formatToParts(date);

    let day = '';
    let month = '';

    parts.forEach((part) => {
      if (part.type === 'day') day = part.value;
      if (part.type === 'month') month = afghanMonthsMap[part.value] || part.value;
    });

    return `${day} ${month}`;
  }

  function formatExpiryDay(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return value;
    if (_lang === 'fa' || _lang === 'ps') return formatPersianDay(date);
    return new Intl.DateTimeFormat(_lang || 'en', { day: 'numeric', month: 'short' }).format(date);
  }

  function daysOverdue(value) {
    if (!value) return 0;
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return 0;
    const [todayYear, todayMonth, todayDay] = toAccountingDateString().split('-').map(Number);
    const today = Date.UTC(todayYear, todayMonth - 1, todayDay);
    const due = Date.UTC(year, month - 1, day);
    return Math.max(0, Math.floor((today - due) / 86400000));
  }

  async function refresh() {
    const startTime = Date.now();
    error = '';

    const cached = readLocalSnapshot();
    if (cached) {
      applySnapshot(cached);
      loading = false;
      loadingMetricData = false;
    } else {
      loading = true;
      loadingMetricData = true;
    }

    try {
      // Paint period metrics first, then fill overview cards.
      await getData({ includeOverview: false, includeMetrics: true });
      loading = false;
      loadingMetricData = false;
      lastRefreshed = new Date().toLocaleString();
      writeLocalSnapshot();

      getData({ includeOverview: true, includeMetrics: false })
        .then(() => {
          lastRefreshed = new Date().toLocaleString();
          writeLocalSnapshot();
        })
        .catch((overviewError) => {
          console.warn('Dashboard overview load failed:', overviewError);
        });

      console.log(`Loading Dashboard took ${Date.now() - startTime}ms`);
    } catch (e) {
      console.error(e);
      error = e?.message || String(e);
      loading = false;
      loadingMetricData = false;
    }
  }

  function refreshAll() {
    refresh();
    loadReturnsMetrics();
    loadMarket();
  }

  const LOCAL_CACHE_KEY = 'zeno:dashboard:lastSnapshot';

  function readLocalSnapshot() {
    try {
      const raw = sessionStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      // Only reuse same-period snapshots so stale custom ranges don't flash.
      if (parsed.activePeriod && parsed.activePeriod !== activePeriod) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeLocalSnapshot() {
    try {
      sessionStorage.setItem(
        LOCAL_CACHE_KEY,
        JSON.stringify({
          activePeriod,
          defaultCurrency,
          netBenefit,
          treasuryBalance,
          treasuryAccountId,
          totalPurchaseCostMap,
          defaultCurrencyPurchaseCostMap,
          lowStockProducts,
          lowStockTotal,
          expiringProducts,
          expiringTotal,
          metricDataTotal,
          metricDataCount,
          plainTopProducts,
          topDebtors,
          trendData,
          savedAt: Date.now(),
        }),
      );
    } catch {
      // ignore quota / private mode
    }
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;
    defaultCurrency = snapshot.defaultCurrency || defaultCurrency;
    netBenefit = snapshot.netBenefit || netBenefit;
    treasuryBalance = snapshot.treasuryBalance || {};
    if (snapshot.treasuryAccountId) {
      treasuryAccountId = Number(snapshot.treasuryAccountId);
    }
    totalPurchaseCostMap = snapshot.totalPurchaseCostMap || {};
    defaultCurrencyPurchaseCostMap =
      Number(snapshot.defaultCurrencyPurchaseCostMap) || 0;
    lowStockProducts = snapshot.lowStockProducts || [];
    lowStockTotal = Number(snapshot.lowStockTotal) || 0;
    expiringProducts = snapshot.expiringProducts || [];
    expiringTotal = Number(snapshot.expiringTotal) || 0;
    metricDataTotal = snapshot.metricDataTotal || metricDataTotal;
    metricDataCount = {
      ...metricDataCount,
      ...(snapshot.metricDataCount || {}),
    };
    plainTopProducts = snapshot.plainTopProducts || [];
    topDebtors = snapshot.topDebtors || topDebtors;
    trendData = snapshot.trendData || trendData;
  }

  function applyOverview(overview = {}) {
    defaultCurrency = overview.default_currency || defaultCurrency || 'AFN';
    netBenefit = [
      defaultCurrency,
      Number(overview.net_benefit) || 0,
      {},
      overview.inventory_by_currency || {},
    ];
    treasuryBalance = overview.treasury_balance || {};
    totalPurchaseCostMap = overview.inventory_by_currency || {};
    defaultCurrencyPurchaseCostMap = Number(overview.inventory_value) || 0;

    lowStockProducts = overview.low_stock?.items || [];
    lowStockTotal = Number(overview.low_stock?.total) || lowStockProducts.length;
    expiringProducts = overview.expiring?.items || [];
    expiringTotal = Number(overview.expiring?.total) || expiringProducts.length;

    topDebtors = {
      total: Number(overview.top_debtors?.total) || 0,
      sum: Number(overview.top_debtors?.sum) || 0,
      default_currency: overview.top_debtors?.default_currency || defaultCurrency,
      items: overview.top_debtors?.items || [],
    };
  }

  function debtorName(debtor) {
    return debtor?.name || debtor?.code || `#${debtor?.account_id}`;
  }

  function getPeriodRange(period) {
    const current = new Date();
    const start = new Date();
    const end = new Date();

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
      return { start, end: current };
    }

    if (period === 'week') {
      const day = current.getDay();
      const diff = current.getDate() - ((day + 1) % 7);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime() + 7 * 86400000);
      return { start, end };
    }

    if (period === 'prev_week') {
      const day = current.getDay();
      const diff = current.getDate() - ((day + 1) % 7);
      const currentWeekStart = new Date(current);
      currentWeekStart.setDate(diff);
      currentWeekStart.setHours(0, 0, 0, 0);
      start.setTime(currentWeekStart.getTime() - 7 * 86400000);
      end.setTime(currentWeekStart.getTime());
      return { start, end };
    }

    if (period === 'month') {
      return getPersianMonthRange(current);
    }

    if (period === 'year') {
      const { jy } = toJalaali(current.getFullYear(), current.getMonth() + 1, current.getDate());
      const startG = toGregorian(jy, 1, 1);
      const endG = toGregorian(jy + 1, 1, 1);
      return { start: new Date(startG.gy, startG.gm - 1, startG.gd), end: new Date(endG.gy, endG.gm - 1, endG.gd) };
    }

    if (period === 'custom' && customStartDate && customEndDate) {
      const customStart = new Date(`${customStartDate}T00:00:00`);
      const customEnd = new Date(`${customEndDate}T00:00:00`);
      customEnd.setDate(customEnd.getDate() + 1);
      return { start: customStart, end: customEnd };
    }

    if (period === 'prev_month') {
      const { jy, jm } = toJalaali(current.getFullYear(), current.getMonth() + 1, current.getDate());
      let prevJm = jm - 1;
      let prevJy = jy;

      if (prevJm < 1) {
        prevJm = 12;
        prevJy--;
      }

      const startG = toGregorian(prevJy, prevJm, 1);
      start.setFullYear(startG.gy, startG.gm - 1, startG.gd);
      start.setHours(0, 0, 0, 0);

      let nextJm = prevJm + 1;
      let nextJy = prevJy;

      if (nextJm > 12) {
        nextJm = 1;
        nextJy++;
      }

      const endG = toGregorian(nextJy, nextJm, 1);
      end.setFullYear(endG.gy, endG.gm - 1, endG.gd);
      end.setHours(0, 0, 0, 0);

      return { start, end };
    }

    return { start, end: current };
  }

  function getPersianMonthRange(date = new Date()) {
    const { jy, jm } = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const startG = toGregorian(jy, jm, 1);
    const start = new Date(startG.gy, startG.gm - 1, startG.gd);

    let nextJm = jm + 1;
    let nextJy = jy;

    if (nextJm > 12) {
      nextJm = 1;
      nextJy++;
    }

    const endG = toGregorian(nextJy, nextJm, 1);
    const end = new Date(endG.gy, endG.gm - 1, endG.gd);

    return { start, end };
  }

  async function getData({ includeOverview = false, includeMetrics = true } = {}) {
    const { start, end } = getPeriodRange(activePeriod);

    /*
     * Period metrics come from a server-side summary endpoint
     * (SQL aggregates) so we never download every sale /
     * purchase / journal row for the selected range.
     */
    const date_from = toDateParam(start);
    const endInclusive = new Date(end.getTime() - 1);
    const date_to = toDateParam(endInclusive < start ? start : endInclusive);

    const granularity =
      activePeriod === 'today'
        ? 'hour'
        : activePeriod === 'year'
          ? 'month'
          : 'day';

    const summary =
      (
        await dashboardApi.getSummary({
          date_from,
          date_to,
          period: activePeriod,
          granularity,
          include_overview: includeOverview,
          include_metrics: includeMetrics,
        })
      )?.data || {};

    if (includeOverview && summary.overview) {
      applyOverview(summary.overview);
    } else if (summary.default_currency) {
      defaultCurrency = summary.default_currency;
    }

    if (!includeMetrics) {
      return;
    }

    const metrics = summary.metrics || {};

    metricDataTotal = {
      sales: Number(metrics.sales?.value) || 0,
      purchases: Number(metrics.purchases?.value) || 0,
      benefit: Number(metrics.benefit?.value) || 0,
      expenses: Number(metrics.expenses?.value) || 0,
      saleReturns: Number(metrics.saleReturns?.value) || 0,
      purchaseReturns: Number(metrics.purchaseReturns?.value) || 0,
      wastes: Number(metrics.wastes?.value) || 0,
    };

    metricDataCount = {
      sales: Number(metrics.sales?.count) || 0,
      salesCash: Number(metrics.sales?.cashCount) || 0,
      salesCredit: Number(metrics.sales?.creditCount) || 0,
      purchases: Number(metrics.purchases?.count) || 0,
      purchasesCash: Number(metrics.purchases?.cashCount) || 0,
      purchasesCredit: Number(metrics.purchases?.creditCount) || 0,
      expenses: Number(metrics.expenses?.count) || 0,
      saleReturns: Number(metrics.saleReturns?.count) || 0,
      purchaseReturns: Number(metrics.purchaseReturns?.count) || 0,
      wastes: Number(metrics.wastes?.count) || 0,
    };

    plainTopProducts = (summary.top_products || []).map((topProduct) => ({
      pid: topProduct.pid,
      qty: Number(topProduct.qty) || 0,
      rev: Number(topProduct.rev) || 0,
      name: topProduct.name || `#${topProduct.pid}`,
      code: topProduct.code || '',
    }));

    buildTrendDataFromSummary(start, end, summary.trend || []);
  }

  function buildTrendDataFromSummary(start, end, trendRows) {
    const buckets = buildBuckets(start, end);
    const labels = [];
    const salesValues = [];
    const purchaseValues = [];
    const benefitValues = [];
    const expenseValues = [];

    const parsedTrend = (trendRows || []).map((row) => {
      const bucketStart = new Date(row.bucket);
      return {
        start: bucketStart,
        sales: Number(row.sales) || 0,
        purchases: Number(row.purchases) || 0,
        benefit: Number(row.benefit) || 0,
        expenses: Number(row.expenses) || 0,
      };
    });

    buckets.forEach((bucket) => {
      labels.push(bucket.label);

      let benefit = 0;
      let expenses = 0;
      let sales = 0;
      let purchases = 0;

      for (const row of parsedTrend) {
        if (isNaN(row.start.getTime())) continue;
        if (row.start >= bucket.start && row.start < bucket.end) {
          benefit += row.benefit;
          expenses += row.expenses;
          sales += row.sales;
          purchases += row.purchases;
        }
      }

      benefitValues.push(benefit);
      expenseValues.push(expenses);
      salesValues.push(sales);
      purchaseValues.push(purchases);
    });

    trendData = {
      labels,
      sales: salesValues,
      purchases: purchaseValues,
      benefit: benefitValues,
      expenses: expenseValues,
    };
  }

  function buildBuckets(start, end) {
    const buckets = [];

    if (activePeriod === 'today') {
      for (let hour = 0; hour < 24; hour += 3) {
        const bucketStart = new Date(start);
        bucketStart.setHours(hour, 0, 0, 0);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setHours(hour + 3, 0, 0, 0);
        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: `${String(hour).padStart(2, '0')}:00`,
        });
      }

      return buckets;
    }

    if (activePeriod === 'week' || activePeriod === 'prev_week') {
      for (let day = 0; day < 7; day++) {
        const bucketStart = new Date(start);
        bucketStart.setDate(start.getDate() + day);
        bucketStart.setHours(0, 0, 0, 0);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketStart.getDate() + 1);
        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: bucketStart.toLocaleDateString(_lang || 'en', { weekday: 'short' }),
        });
      }

      return buckets;
    }

    if (activePeriod === 'year') {
      const startJalaali = toJalaali(start.getFullYear(), start.getMonth() + 1, start.getDate());

      for (let month = 1; month <= 12; month++) {
        const monthStartG = toGregorian(startJalaali.jy, month, 1);
        const nextMonthG =
          month === 12
            ? toGregorian(startJalaali.jy + 1, 1, 1)
            : toGregorian(startJalaali.jy, month + 1, 1);
        const bucketStart = new Date(monthStartG.gy, monthStartG.gm - 1, monthStartG.gd);
        const bucketEnd = new Date(nextMonthG.gy, nextMonthG.gm - 1, nextMonthG.gd);

        buckets.push({
          start: bucketStart,
          end: bucketEnd,
          label: formatPersianDay(bucketStart),
        });
      }

      return buckets;
    }

    const dayCount = Math.max(1, Math.ceil((end - start) / 86400000));
    const step = Math.max(1, Math.ceil(dayCount / 6));
    const cursor = new Date(start);

    while (cursor < end) {
      const bucketStart = new Date(cursor);
      const bucketEnd = new Date(cursor);
      bucketEnd.setDate(bucketEnd.getDate() + step);
      if (bucketEnd > end) bucketEnd.setTime(end.getTime());
      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: formatPersianDay(bucketStart),
      });
      cursor.setDate(cursor.getDate() + step);
    }

    return buckets;
  }

  async function setPeriod(period) {
    activePeriod = period;
    loadingMetricData = true;
    await getData({ includeOverview: false, includeMetrics: true });
    loadingMetricData = false;
    writeLocalSnapshot();
  }

  async function loadReturnsMetrics(period = returnsPeriod, from = returnsCustomStartDate, to = returnsCustomEndDate) {
    const requestId = ++returnMetricRequest;
    let start;
    let end;

    if (period === 'custom') {
      if (!from || !to || from > to) return;
      start = new Date(`${from}T00:00:00`);
      end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
    } else {
      ({ start, end } = getPeriodRange(period));
    }

    const date_from = toDateParam(start);
    const endInclusive = new Date(end.getTime() - 1);
    const date_to = toDateParam(endInclusive < start ? start : endInclusive);

    try {
      const summary = (await dashboardApi.getSummary({
        date_from,
        date_to,
        period,
        granularity: period === 'today' ? 'hour' : 'day',
        include_overview: false,
        include_metrics: true,
      }))?.data || {};
      if (requestId !== returnMetricRequest) return;

      const metrics = summary.metrics || {};
      returnMetricData = {
        saleReturns: Number(metrics.saleReturns?.value) || 0,
        purchaseReturns: Number(metrics.purchaseReturns?.value) || 0,
        wastes: Number(metrics.wastes?.value) || 0,
        saleReturnCount: Number(metrics.saleReturns?.count) || 0,
        purchaseReturnCount: Number(metrics.purchaseReturns?.count) || 0,
        wasteCount: Number(metrics.wastes?.count) || 0,
      };
    } catch (returnsMetricError) {
      console.warn('Dashboard returns metrics load failed:', returnsMetricError);
    }
  }

  function handlePeriod(event) {
    setPeriod(event.detail);
  }

  function handleCustomPeriod(event) {
    const { from, to } = event.detail;
    if (!from || !to || from > to) return;
    customStartDate = from;
    customEndDate = to;
    setPeriod('custom');
  }

  function handleReturnsPeriod(event) {
    const { period, from, to } = event.detail || {};
    if (!['today', 'month', 'custom'].includes(period)) return;
    if (period === 'custom') {
      if (!from || !to || from > to) return;
      returnsCustomStartDate = from;
      returnsCustomEndDate = to;
    }
    returnsPeriod = period;
    loadReturnsMetrics(period, from, to);
  }

  /* ---------- view model for the board ---------- */

  const CURRENCY_SYMBOLS = { AFN: '؋', USD: '$', EUR: '€', PKR: '₨', IRR: '﷼' };

  function currencySymbol(code) {
    return CURRENCY_SYMBOLS[code] || String(code || '').slice(0, 2);
  }

  /*
   * The treasury total lives in the org's default currency. Other currencies
   * are only folded in when a live rate exists, so the headline stays honest
   * instead of mixing raw amounts from different currencies.
   */
  function treasuryTotalOf(balance, currency, rates) {
    let total = 0;

    for (const [code, rawAmount] of Object.entries(balance || {})) {
      const amount = Number(rawAmount) || 0;
      if (code === currency) {
        total += amount;
        continue;
      }
      if (!rates) continue;
      if (currency === 'AFN' && code === 'USD') total += amount * rates.usdToAfn;
      else if (currency === 'AFN' && code === 'EUR') total += amount * rates.eurToAfn;
    }

    return total;
  }

  $: treasuryRows = treasuryEntries.map(([code, rawAmount]) => ({
    code,
    symbol: currencySymbol(code),
    name: t(code),
    amount: fmt(Math.abs(Number(rawAmount) || 0)),
    negative: Number(rawAmount) < 0,
  }));

  $: treasuryTotal = treasuryTotalOf(treasuryBalance, defaultCurrency, marketRates);

  /*
   * Svelte only tracks the identifiers it can see in a reactive statement.
   * A call such as `buildKpiCards()` hides every value read inside the
   * function, so the cards were computed once (with the empty initial state)
   * and never again when the summary arrived. Passing the inputs in keeps the
   * dependency graph honest.
   */
  $: kpiCards = buildKpiCards({
    lang: _lang,
    metricDataTotal,
    metricDataCount,
    defaultCurrency,
    benefitTotal,
    expenseTotal,
    netProfit,
    marginPercent,
    canViewSales,
    canViewPurchases,
    canViewBenefit,
    canViewAccounts,
    cardExpenses,
    cardNetProfit,
  });

  function buildKpiCards({
    lang,
    metricDataTotal,
    metricDataCount,
    defaultCurrency,
    benefitTotal,
    expenseTotal,
    netProfit,
    marginPercent,
    canViewSales,
    canViewPurchases,
    canViewBenefit,
    canViewAccounts,
    cardExpenses,
    cardNetProfit,
  }) {
    const cards = [];
    /* Persian and Pashto keep the noun singular after a number. */
    const billUnit = lang === 'en' ? t('Bills') : t('Bill');

    if (canViewSales) {
      cards.push({
        key: 'sales',
        label: t("Today's Sales (Dashboard Card)"),
        value: fmt(metricDataTotal.sales),
        unit: t(defaultCurrency),
        icon: 'bi-cart-fill',
        hue: 'sale',
        href: '/dashboard/sales',
        sub: [
          { text: fmt(metricDataCount.sales), bold: true },
          { text: billUnit },
          { text: fmt(metricDataCount.salesCash), bold: true },
          { text: t('Cash') },
          { text: fmt(metricDataCount.salesCredit), bold: true },
          { text: t('On Credit') },
        ],
      });
    }

    if (canViewPurchases) {
      cards.push({
        key: 'purchases',
        label: t("Today's Purchases (Dashboard Card)"),
        value: fmt(metricDataTotal.purchases),
        unit: t(defaultCurrency),
        icon: 'bi-bag-fill',
        hue: 'purchase',
        href: '/dashboard/purchases',
        sub: [
          { text: fmt(metricDataCount.purchases), bold: true },
          { text: billUnit },
          { text: fmt(metricDataCount.purchasesCash), bold: true },
          { text: t('Cash') },
          { text: fmt(metricDataCount.purchasesCredit), bold: true },
          { text: t('On Credit') },
        ],
      });
    }

    if (cardExpenses) {
      cards.push({
        key: 'expenses',
        label: t("Today's Expenses (Dashboard Card)"),
        value: fmt(expenseTotal),
        unit: t(defaultCurrency),
        icon: 'bi-receipt',
        hue: 'expense',
        href: '/dashboard/journals/list',
        sub: [
          { text: fmt(metricDataCount.expenses), bold: true },
          { text: t('Voucher') },
          ...(metricDataCount.expenses ? [] : [{ text: t('No Expense') }]),
        ],
      });
    }

    if (cardNetProfit && (canViewBenefit || canViewAccounts)) {
      cards.push({
        key: 'profit',
        label: t("Today's Profit (Dashboard Card)"),
        value: fmt(netProfit),
        unit: t(defaultCurrency),
        icon: 'bi-graph-up-arrow',
        hue: 'profit',
        href: '/dashboard/reports',
        sub: [
          { text: t('Margin') },
          { text: `${fmt(Math.round(marginPercent * 10) / 10)}%`, bold: true },
          { text: fmt(metricDataCount.sales), bold: true },
          { text: billUnit },
        ],
      });
    }

    return cards;
  }

  $: quickActions = buildQuickActions({
    canViewSales,
    canViewJournals,
    canViewPurchases,
    canViewProducts,
    canViewExchange,
  });

  function buildQuickActions({
    canViewSales,
    canViewJournals,
    canViewPurchases,
    canViewProducts,
    canViewExchange,
  }) {
    return [
      {
        label: t('New Sale'),
        icon: 'bi-cart-fill',
        hue: 'sale',
        href: '/dashboard/sale-form/0',
        show: canViewSales,
      },
      {
        label: t('Receive Money'),
        icon: 'bi-cash-coin',
        hue: 'receive',
        href: '/dashboard/journals/list',
        show: canViewJournals,
      },
      {
        label: t('New Purchase'),
        icon: 'bi-bag-plus-fill',
        hue: 'purchase',
        href: '/dashboard/purchase-form/0',
        show: canViewPurchases,
      },
      {
        label: t('New Product'),
        icon: 'bi-box-seam-fill',
        hue: 'product',
        href: '/dashboard/product-form/new',
        show: canViewProducts,
      },
      {
        label: t('Record Expense'),
        icon: 'bi-receipt-cutoff',
        hue: 'expense',
        href: '/dashboard/journals/list',
        show: canViewJournals,
      },
      {
        label: t('Exchange'),
        icon: 'bi-currency-exchange',
        hue: 'exchange',
        href: '/dashboard/exchanges/list',
        show: canViewExchange,
      },
    ].filter((action) => action.show);
  }

  $: expiredCount = expiringProducts.filter(
    (product) => Number(product.remaining_days) <= 0,
  ).length;
  $: nearExpiryCount = Math.max(0, expiringTotal - expiredCount);
  $: negativeStockCount = lowStockProducts.filter(
    (product) => Number(product.totalQty) <= 0,
  ).length;
  $: alertTiles = buildAlertTiles({
    cardStockAlerts,
    enable_expiry_date,
    expiringTotal,
    expiredCount,
    nearExpiryCount,
    negativeStockCount,
    lowStockTotal,
    canViewSales,
    enable_sales_due_date,
    canViewPurchases,
    enable_purchase_due_date,
    overdueBills,
    draftBills,
    defaultCurrency,
  });

  function buildAlertTiles({
    cardStockAlerts,
    enable_expiry_date,
    expiringTotal,
    expiredCount,
    nearExpiryCount,
    negativeStockCount,
    lowStockTotal,
    canViewSales,
    enable_sales_due_date,
    canViewPurchases,
    enable_purchase_due_date,
    overdueBills,
    draftBills,
    defaultCurrency,
  }) {
    const tiles = [];

    if (cardStockAlerts && enable_expiry_date) {
      tiles.push({
        key: 'expiry',
        icon: 'bi-hourglass-split',
        hue: 'expiry',
        label: t('Expiry'),
        count: fmt(expiringTotal),
        note: `${fmt(expiredCount)} ${t('Expired')} · ${fmt(nearExpiryCount)} ${t('Near expiry')}`,
      });
    }

    if (cardStockAlerts) {
      tiles.push({
        key: 'stock',
        symbol: '−',
        hue: 'stock',
        label: t('Low Stock'),
        count: fmt(lowStockTotal),
        note: `${fmt(negativeStockCount)} ${t('Negative')}`,
      });
    }

    if (canViewSales && enable_sales_due_date) {
      tiles.push({
        key: 'late',
        icon: 'bi-hourglass-split',
        hue: 'expiry',
        label: t('Late Bills'),
        count: fmt(overdueBills.length),
        note: `${fmt(overdueBills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0))} ${currencySymbol(defaultCurrency)}`,
      });
    }

    if (canViewSales || canViewPurchases) {
      tiles.push({
        key: 'drafts',
        icon: 'bi-pencil-square',
        hue: 'wastes',
        label: t('Drafts'),
        count: fmt(draftBills.length),
        note: t('Unfinished'),
      });
    }

    return tiles;
  }

  $: alertPanels = buildAlertPanels({
    cardStockAlerts,
    enable_expiry_date,
    expiringProducts,
    lowStockProducts,
    canViewSales,
    enable_sales_due_date,
    canViewPurchases,
    enable_purchase_due_date,
    overdueBills,
    draftBills,
    defaultCurrency,
  });

  function buildAlertPanels({
    cardStockAlerts,
    enable_expiry_date,
    expiringProducts,
    lowStockProducts,
    canViewSales,
    enable_sales_due_date,
    canViewPurchases,
    enable_purchase_due_date,
    overdueBills,
    draftBills,
    defaultCurrency,
  }) {
    const panels = {};

    if (cardStockAlerts && enable_expiry_date) {
      panels.expiry = {
        title: t('Expiry'),
        href: '/dashboard/product-alerts?tab=expiry',
        rows: expiringProducts.slice(0, 6).map((product) => {
          const expired = Number(product.remaining_days) <= 0;
          const quantityMeta = `${fmt(product.totalQty)} ${_lang === 'en' ? 'pcs' : 'عدد'}`;
          return {
            title: product.name,
            meta: `${t('Expiry')} ${formatExpiryDay(product.expiry_date)} · ${quantityMeta}`,
            value: expired ? t('Expired') : `${fmt(product.remaining_days)} ${t('days')}`,
            negative: expired,
            lead: expired ? '!' : fmt(product.remaining_days),
            hue: expired ? 'danger' : 'warn',
            href: '/dashboard/product-alerts?tab=expiry',
          };
        }),
      };
    }

    if (cardStockAlerts) {
      panels.stock = {
        title: t('Low Stock'),
        href: '/dashboard/product-alerts?tab=quantity',
        rows: lowStockProducts.slice(0, 6).map((product) => {
          const negative = Number(product.totalQty) < 0;
          return {
            title: product.name,
            meta: negative
              ? (_lang === 'en' ? 'Negative stock' : _lang === 'ps' ? 'منفي ذخیره' : 'موجودی منفی')
              : t('Low Stock'),
            value: fmt(product.totalQty),
            negative,
            lead: '−',
            hue: 'danger',
            kind: 'stock',
            actionLabel: _lang === 'en' ? 'Order' : _lang === 'ps' ? 'امر' : 'سفارش',
            actionHref: '/dashboard/purchase-form/0',
            href: '/dashboard/product-alerts?tab=quantity',
          };
        }),
      };
    }

    if (canViewSales && enable_sales_due_date) {
      panels.late = {
        title: t('Late Bills'),
        linkLabel: t('All Bills'),
        href: '/dashboard/sales',
        rows: overdueBills.slice(0, 6).map((bill) => {
          const lateDays = daysOverdue(bill.due_date);
          const customerName = String(bill.party || '').trim();
          const hasCustomer = customerName && customerName !== '—';
          return {
            title: `${_lang === 'fa' ? 'بل' : t('Bill #')} ${bill.number}${hasCustomer ? ` · ${customerName}` : ''}`,
            meta: `${_lang === 'fa' ? 'سررسید' : t('Due Date')} ${formatExpiryDay(bill.due_date)}`,
            value: `${fmt(bill.amount)} ${currencySymbol(bill.currency || defaultCurrency)} · ${fmt(lateDays)} ${t('days')}`,
            lead: hasCustomer ? customerName.charAt(0) : '',
            hideLead: !hasCustomer,
            hue: 'warn',
            valueHue: lateDays >= 30 ? 'danger' : 'warn',
            actionLabel: t('Reminder'),
            actionHref: bill.href,
            href: bill.href,
          };
        }),
      };
    }

    if (canViewSales || canViewPurchases) {
      panels.drafts = {
        title: t('Drafts'),
        href: canViewSales ? '/dashboard/sales' : '/dashboard/purchases',
        rows: draftBills.slice(0, 6).map((bill) => ({
          title: [t(bill.kind === 'sale' ? 'Sales' : 'Purchases'), bill.number, bill.party === '—' ? '' : bill.party]
            .filter(Boolean)
            .join(' · '),
          meta: draftMetaOf(bill),
          value: `${fmt(bill.amount)} ${currencySymbol(bill.currency || defaultCurrency)}`,
          lead: t(bill.kind === 'sale' ? 'Sales' : 'Purchases').trim().slice(0, 1),
          hue: bill.kind === 'sale' ? 'draft-sale' : 'draft-purchase',
          actionLabel: t('Complete'),
          href: bill.href,
        })),
      };
    }

    return panels;
  }

  function relativeDraftTime(value) {
    if (!value) return '';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return '';
    const seconds = (timestamp - Date.now()) / 1000;
    const units = [
      ['year', 31536000], ['month', 2592000], ['week', 604800],
      ['day', 86400], ['hour', 3600], ['minute', 60],
    ];
    const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) || ['minute', 60];
    const locale = _lang === 'fa' ? 'fa-IR' : _lang === 'ps' ? 'ps-AF' : 'en';
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(seconds / size), unit);
  }

  function draftMetaOf(bill) {
    const creator = bill.created_by?.name || bill.created_by?.username || bill.user?.name || bill.user?.username || bill.created_by_name;
    const time = relativeDraftTime(bill.created_at || bill.date);
    return [creator, time].filter(Boolean).join(' · ');
  }

  const ACCOUNT_HUES = ['emerald', 'blue', 'orange', 'violet', 'cyan', 'slate'];
  const ACCOUNT_TYPE_ORDER = ['CUSTOMER', 'COMPANY', 'BOTH', 'EMPLOYEE', 'VISITOR', 'SHAREHOLDER', 'ASSET', 'BANK', 'LOAN', 'EXPENSE'];

  /*
   * Account types in the wild are named rather than coded: a type created from
   * the account dialog carries its English or Persian name and an empty code.
   * The dashboard categories follow the reference design, so classify by code
   * first and fall back to the names, or every tile would land in the fallback
   * slot and lose its colour, icon and position.
   */
  function accountTypeKey(type) {
    const code = String(type?.code || '').trim().toUpperCase();
    if (code) return code;

    const label = `${type?.name || ''} ${type?.name_fa || ''} ${type?.name_ps || ''}`.toLowerCase();
    const has = (...parts) => parts.some((part) => label.includes(part));

    if (has('both') || (has('مشتر') && has('تأمین', 'تامین'))) return 'BOTH';
    if (has('customer', 'مشتر', 'پیرود')) return 'CUSTOMER';
    if (has('company', 'supplier', 'شرکت', 'تأمین', 'تامین', 'عرضه')) return 'COMPANY';
    if (has('employee', 'کارمند', 'کارکوون')) return 'EMPLOYEE';
    if (has('visitor', 'ویزیتور', 'لیدونک')) return 'VISITOR';
    if (has('shareholder', 'سهم', 'ونډه')) return 'SHAREHOLDER';
    if (has('bank', 'بانک')) return 'BANK';
    if (has('loan', 'قرض')) return 'LOAN';
    if (has('asset', 'cash', 'treasury', 'سرمایه', 'خزانه')) return 'ASSET';
    if (has('income', 'عاید')) return 'INCOME';
    if (has('expense', 'مصرف', 'لګښت')) return 'EXPENSE';

    return '';
  }

  function accountIconForType(type) {
    const icons = {
      CUSTOMER: 'bi-people-fill', COMPANY: 'bi-truck', BOTH: 'bi-arrow-left-right',
      EMPLOYEE: 'bi-person-vcard-fill', VISITOR: 'bi-person-walking',
      SHAREHOLDER: 'bi-people-fill', BANK: 'bi-bank', ASSET: 'bi-cash-stack',
      INCOME: 'bi-cash-coin', LOAN: 'bi-file-earmark-text-fill', EXPENSE: 'bi-receipt-cutoff',
    };
    return icons[accountTypeKey(type)] || accountIconFor(`${type.code || ''} ${type.name || ''} ${type.name_fa || ''}`);
  }

  function accountHueForType(type, index) {
    const hues = {
      CUSTOMER: 'blue', COMPANY: 'teal', BOTH: 'cyan', EMPLOYEE: 'violet',
      VISITOR: 'orange', SHAREHOLDER: 'slate', BANK: 'cyan', ASSET: 'emerald',
      INCOME: 'rose', LOAN: 'rose', EXPENSE: 'orange',
    };
    return hues[accountTypeKey(type)] || ACCOUNT_HUES[index % ACCOUNT_HUES.length];
  }

  function accountIconFor(name) {
    const label = String(name || '').toLowerCase();
    if (label.includes('customer') || label.includes('مشتر') || label.includes('پیرود')) return 'bi-person-fill';
    if (label.includes('supplier') || label.includes('تامین') || label.includes('عرضه')) return 'bi-truck';
    if (label.includes('shareholder') || label.includes('سهم') || label.includes('ونډه')) return 'bi-pie-chart-fill';
    if (label.includes('expense') || label.includes('مصرف') || label.includes('لګښت')) return 'bi-receipt';
    if (label.includes('bank') || label.includes('بانک')) return 'bi-bank';
    if (label.includes('employee') || label.includes('کارمند') || label.includes('کارکوونکي')) return 'bi-person-badge-fill';
    return 'bi-folder-fill';
  }

  function partyName(account) {
    if (!account) return '';
    if (_lang === 'ps') return account.name_ps || account.name_fa || account.name || '';
    if (_lang === 'fa') return account.name_fa || account.name || '';
    return account.name || account.name_fa || '';
  }

  function accountTypeLabel(type, language = _lang) {
    if (language === 'ps') return type.name_ps || type.name_fa || type.name || '';
    if (language === 'fa') return type.name_fa || type.name || '';
    return type.name || type.name_fa || '';
  }

  $: accountTiles = buildAccountTiles({
    canViewAccounts,
    marketAccounts,
    marketAccountTypes,
    language: _lang,
  });

  function buildAccountTiles({
    canViewAccounts,
    marketAccounts,
    marketAccountTypes,
    language,
  }) {
    if (!canViewAccounts || !marketAccountTypes.length) return [];

    const counts = new Map();
    const recent = new Date();
    recent.setDate(1);
    recent.setHours(0, 0, 0, 0);

    for (const type of marketAccountTypes) {
      if (accountTypeKey(type) === 'INCOME') continue;
      if (type.id != null) counts.set(type.id, { count: 0, added: 0 });
    }

    for (const account of marketAccounts) {
      const typeId = account.account_type_id;
      if (typeId == null) continue;
      const accountType = marketAccountTypes.find((item) => Number(item.id) === Number(typeId));
      if (accountTypeKey(accountType) === 'INCOME') continue;

      const entry = counts.get(typeId) || { count: 0, added: 0 };
      entry.count += 1;

      const created = new Date(account.created_at || 0).getTime();
      if (created && created >= recent) entry.added += 1;

      counts.set(typeId, entry);
    }

    const max = Math.max(1, ...Array.from(counts.values(), (entry) => entry.count));

    return Array.from(counts.entries())
      .filter(([typeId]) => {
        const type = marketAccountTypes.find((item) => Number(item.id) === Number(typeId)) || {};
        return accountTypeKey(type) !== 'BANK';
      })
      .sort((a, b) => {
        const typeA = marketAccountTypes.find((item) => Number(item.id) === Number(a[0])) || {};
        const typeB = marketAccountTypes.find((item) => Number(item.id) === Number(b[0])) || {};
        const orderA = ACCOUNT_TYPE_ORDER.indexOf(accountTypeKey(typeA));
        const orderB = ACCOUNT_TYPE_ORDER.indexOf(accountTypeKey(typeB));
        return (orderA < 0 ? ACCOUNT_TYPE_ORDER.length : orderA) - (orderB < 0 ? ACCOUNT_TYPE_ORDER.length : orderB);
      })
      .map(([typeId, entry], index) => {
        const type = marketAccountTypes.find((item) => Number(item.id) === Number(typeId)) || {};
        const label = accountTypeLabel(type, language) || `${t('Accounts')} ${typeId}`;

        return {
          label,
          count: fmt(entry.count),
          added: entry.added,
          /* The reference sizes the bar by the square root of the share so a
             dominant category does not flatten every other bar to a stub. */
          share: Math.max(4, Math.round(Math.sqrt(entry.count / max) * 100)),
          icon: accountIconForType(type),
          hue: accountHueForType(type, index),
          href: `/dashboard/accounts/list?type=${typeId}`,
        };
      });
  }

  function configuredCurrencyRate(code, currencies, baseCurrency) {
    const baseCode = String(baseCurrency || '').toUpperCase();
    const currency = currencies.find(
      (item) => String(item.code || '').toUpperCase() === code,
    );
    const base = currencies.find(
      (item) => String(item.code || '').toUpperCase() === baseCode,
    ) || currencies.find((item) => Number(item.isDefault) === 1);
    const rate = Number(currency?.exchangeRate);
    const baseRate = Number(base?.exchangeRate);

    if (!currency || !Number.isFinite(rate) || rate <= 0) return null;
    if (code === baseCode) return 1;
    if (!Number.isFinite(baseRate) || baseRate <= 0) return null;
    return rate / baseRate;
  }

  $: fxItems = ['USD', 'EUR'].flatMap((code) => {
    const rate = configuredCurrencyRate(code, systemCurrencies, defaultCurrency);
    if (rate == null) return [];
    return [{
      code,
      symbol: code === 'USD' ? '$' : '€',
      name: t(code === 'USD' ? 'Dollar' : 'Euro'),
      rate: fmt(Math.round(rate * 100) / 100),
      unit: currencySymbol(defaultCurrency),
    }];
  });

  $: fxRateDate = systemCurrencies
    .filter((item) => ['USD', 'EUR'].includes(String(item.code || '').toUpperCase()))
    .map((item) => item.exchangeRateDate)
    .filter(Boolean)
    .sort()
    .slice(-1)[0];
  $: fxUpdated = fxRateDate || '—';
  $: topProductRows = plainTopProducts.slice(0, 6).map((product) => ({
    name: product.name,
    code: product.code,
    revenue: product.rev,
    qty: product.qty,
    share: Math.max(
      6,
      (Number(product.rev) || 0) /
        Math.max(1, ...plainTopProducts.map((item) => Number(item.rev) || 0)) *
        100,
    ),
  }));

  $: returnRows = [
    {
      label: t('Sale Returns'),
      value: returnMetricData.saleReturns,
      count: returnMetricData.saleReturnCount,
      href: '/dashboard/stock/returns',
    },
    {
      label: t('Purchase Returns'),
      value: returnMetricData.purchaseReturns,
      count: returnMetricData.purchaseReturnCount,
      href: '/dashboard/stock/returns',
    },
    {
      label: t('Wastes'),
      value: returnMetricData.wastes,
      count: returnMetricData.wasteCount,
      href: '/dashboard/wastes',
    },
  ];

  $: boardData = {
    currency: defaultCurrency,
    currencySymbol: currencySymbol(defaultCurrency),
    periodLabel,
    reminder: subscriptionReminder
      ? {
          title: t(
            subscriptionReminder.status === 'trial'
              ? 'Your free trial ends soon'
              : 'Your subscription ends soon',
          ),
          daysLeft: subscriptionReminder.daysRemaining,
          href: '/dashboard/subscription',
        }
      : null,
    kpi: kpiCards,
    quickActions,
    treasury: cardTreasury
      ? {
          href: treasuryHref,
          total: treasuryTotal,
          symbol: currencySymbol(defaultCurrency),
          entries: treasuryRows,
        }
      : null,
    alerts: {
      tiles: alertTiles,
      panels: alertPanels,
    },
    market: {
      debtors: cardDebtors
        ? {
            sum: topDebtors.sum,
            currencySymbol: currencySymbol(topDebtors.default_currency || defaultCurrency),
            items: (topDebtors.items || []).slice(0, 6).map((debtor) => ({
              id: debtor.account_id,
              name: debtorName(debtor),
              initial: String(debtorName(debtor)).trim().charAt(0) || '#',
              amount: Number(debtor.amount) || 0,
              currencySymbol: currencySymbol(debtor.currency || defaultCurrency),
              share: Math.max(
                6,
                ((Number(debtor.amount) || 0) /
                  Math.max(
                    1,
                    ...(topDebtors.items || []).map((item) => Number(item.amount) || 0),
                  )) *
                  100,
              ),
            })),
          }
        : null,
      accounts: canViewAccounts
        ? {
            total: marketAccounts.length || null,
            items: accountTiles,
          }
        : null,
      fx: canViewAccounts
        ? {
            href: '/dashboard/settings/currencies',
            updated: fxUpdated,
            rates: fxItems,
          }
        : null,
    },
    inventory: {
      warehouses: warehouseRows,
    },
    transactions: recentTransactions,
    reports:
      cardTrend || cardTopProducts
        ? {
            summary: `${t('Financial Trend')} · ${t('Inventory & Returns')} · ${t('Top Products')} · ${t('Transactions')}`,
            returns: returnRows,
            topProducts: cardTopProducts ? topProductRows : [],
          }
        : null,
    totals: {
      benefit: benefitTotal,
      expenses: expenseTotal,
      net: netProfit,
    },
  };
</script>

{#if !canViewDashboardPage}
  <h3 class="dashboard-denied">{t('No access allowed')}</h3>
{:else if loading}
  <div class="dashboard-loading" role="status">
    <span class="dashboard-spinner" aria-hidden="true"></span>
    <span>{t('Loading dashboard data...')}</span>
  </div>
{:else if error}
  <div class="dashboard-error" role="alert">
    <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
    <div>
      <strong>{t('Failed to Load Dashboard')}</strong>
      <p>{error}</p>
    </div>
    <button type="button" class="dashboard-retry" on:click={refreshAll}>
      <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
      <span>{t('Refresh')}</span>
    </button>
  </div>
{:else}
  <DashboardBoard
    data={boardData}
    trend={trendData}
    period={activePeriod}
    customStart={customStartDate}
    customEnd={customEndDate}
    returnsPeriod={returnsPeriod}
    returnsCustomStart={returnsCustomStartDate}
    returnsCustomEnd={returnsCustomEndDate}
    on:period={handlePeriod}
    on:applycustom={handleCustomPeriod}
    on:returnsperiod={handleReturnsPeriod}
    on:refresh={refreshAll} />
{/if}

<style>
  .dashboard-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 40vh;
    color: #64748b;
    font-size: 13px;
    font-weight: 600;
  }

  .dashboard-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid #dbe7f8;
    border-top-color: #2f6fed;
    border-radius: 50%;
    animation: dashboard-spin 0.8s linear infinite;
  }

  @keyframes dashboard-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .dashboard-error {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid #fecaca;
    border-radius: 14px;
    background: #fef2f2;
    color: #7f1d1d;
  }

  .dashboard-error > i {
    font-size: 20px;
  }

  .dashboard-error div {
    flex: 1;
    min-width: 0;
  }

  .dashboard-error strong {
    display: block;
    font-size: 13px;
    font-weight: 800;
  }

  .dashboard-error p {
    margin: 2px 0 0;
    font-size: 12px;
  }

  .dashboard-retry {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 8px;
    background: #b91c1c;
    color: #fff;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .dashboard-denied {
    margin: 16px;
    color: #b91c1c;
    font-size: 15px;
    font-weight: 800;
  }
</style>
