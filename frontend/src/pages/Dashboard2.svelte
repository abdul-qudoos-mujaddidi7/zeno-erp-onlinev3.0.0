


<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import Chart from 'chart.js/auto';
  import { link } from 'svelte-spa-router';
  import { t, lang, translate_org_type } from "../i18n/i18n.js";
  import PanelSkeleton from "../components/common/PanelSkeleton.svelte";

  import {calculateBalancesOfAllAccounts} from "./accounts/AccountsHelper.js"

  import {getGeneralBenefit,calculateBalanceOfTreasury,findTreasuryAccountId} from "./accounts/AccountsHelper.js";





  import 'animate.css';

  /**
   * ╔══════════════════════════════════════════════════════════════╗
   * ║  IMPORT YOUR DEXIE DB INSTANCE — adjust path as needed     ║
   * ╚══════════════════════════════════════════════════════════════╝
   */

import { currencyApi } from '../api/currencyApi.js';
import { warehouseApi } from '../api/warehouseApi.js';
import { accountApi } from '../api/accountApi.js';
import { productApi } from '../api/productApi.js';
import { saleApi } from '../api/saleApi.js';
import { purchaseApi } from '../api/purchaseApi.js';
import { wasteApi } from '../api/wasteApi.js';
import { warehouseProductApi } from '../api/warehouseProductApi.js';
import { saleItemApi } from '../api/saleItemApi.js';

  
  // ─── Date Utilities ──────────────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function inRange(dateStr, start, end) {
    if (!dateStr) return false;
    const d = dateStr.substring(0, 10);
    return d >= toDateStr(start) && d < toDateStr(end);
  }

  // ─── Reactive State ──────────────────────────────────────────────
  let loading = $state(true);
  let error = $state(null);
  let activePeriod = $state('today');
  let lastRefreshed = $state(null);

  let defaultCurrency = $state({ code: 'USD', symbol: '$', name: 'US Dollar' });
  let allCurrencies = $state([]);
  let allWarehouses = $state([]);
  let allAccounts = $state([]);
  let allProducts = $state([]);

  const emptySummary = () => ({
    sales: {}, purchases: {}, saleReturns: {},
    purchaseReturns: {}, wastes: {}, salePayments: {}, purchasePayments: {}
  });
  const emptyCounts = () => ({
    sales: 0, purchases: 0, saleReturns: 0, purchaseReturns: 0, wastes: 0
  });

  let summaries = $state({ today: emptySummary(), week: emptySummary(), month: emptySummary() });
  let counts = $state({ today: emptyCounts(), week: emptyCounts(), month: emptyCounts() });

  let trendData = $state({ labels: [], sales: [], purchases: [] });
  let topProducts = $state([]);
  let revenueByType = $state({ sales: 0, purchases: 0, saleReturns: 0, purchaseReturns: 0, wastes: 0 });
  let paymentStatus = $state({ salePaid: 0, saleUnpaid: 0, purchasePaid: 0, purchaseUnpaid: 0 });
  let warehouseStock = $state([]);

  let recentSales = $state([]);
  let recentPurchases = $state([]);
  let lowStockProducts = $state([]);
  let stockAlertCount = $state(0);
  let totalInventoryValue = $state(0);
  let totalProducts = $state(0);
  let totalAccounts = $state(0);
  let totalWarehouses = $state(0);

  let salesTrendCanvas;
  let revenueBreakdownCanvas;
  let topProductsCanvas;
  let paymentStatusCanvas;
  let warehouseCanvas;
  let charts = {};

  // ─── Formatters & Helpers ────────────────────────────────────────
  function fmt(n) {
    if (n == null || isNaN(n)) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
  }
  function curSym(code) {
    return allCurrencies.find(c => c.code === code)?.symbol || (code || '');
  }
  function primaryAmt(map) {
    if (!map || !Object.keys(map).length) return { amt: '0', sym: defaultCurrency.symbol, code: defaultCurrency.code };
    const dc = defaultCurrency.code;
    if (dc && map[dc] !== undefined) return { amt: fmt(map[dc]), sym: curSym(dc), code: dc };
    const [c, v] = Object.entries(map).find(([, x]) => x) || Object.entries(map)[0];
    return { amt: fmt(v), sym: curSym(c), code: c };
  }
  function otherCurrs(map) {
    if (!map) return [];
    return Object.entries(map)
      .filter(([c, a]) => c !== defaultCurrency.code && a)
      .map(([c, a]) => ({ code: c, amt: fmt(a), sym: curSym(c) }));
  }
  function sumCurr(items, field) {
    const m = {};
    items.forEach(i => { const c = i.currency || defaultCurrency.code; m[c] = (m[c] || 0) + (Number(i[field]) || 0); });
    return m;
  }
  function invBadge(s) {
    return { 0: ['Cancelled', 'bg-secondary'], 1: ['Pending', 'bg-warning text-dark'], 2: ['Partial', 'bg-info'], 3: ['Paid', 'bg-success'], 4: ['Overdue', 'bg-danger'] }[s] || [`#${s}`, 'bg-secondary'];
  }
  function billBadge(s) {
    return { 0: ['Cancelled', 'bg-secondary'], 1: ['Pending', 'bg-warning text-dark'], 2: ['Partial', 'bg-info'], 3: ['Received', 'bg-success'], 4: ['Overdue', 'bg-danger'] }[s] || [`#${s}`, 'bg-secondary'];
  }
  const periodLabels = { today: t('Today'), week: t('This Week'), month: t('This Month') };

  // ─── Derived ─────────────────────────────────────────────────────
  let activeSummary = $derived(summaries[activePeriod]);
  let activeCounts = $derived(counts[activePeriod]);

  // ─── Data Fetching ───────────────────────────────────────────────
  

  // ─── Chart Management ────────────────────────────────────────────
  function destroyCharts() { Object.values(charts).forEach(c => c?.destroy()); charts = {}; }

  const chartFont = { family: "'Roboto', 'Helvetica Neue', Arial, sans-serif" };
  const gridColor = 'rgba(0,0,0,0.05)';

  function createCharts() {
  destroyCharts();
  const basePlugins = { legend: { labels: { font: { ...chartFont, size: 12 } } } };

  // ── Create plain copies of state data for Chart.js ──
  // Chart.js internally modifies arrays using Object.defineProperty,
  // which conflicts with Svelte 5's $state proxy
  const plainTrendLabels = [...trendData.labels];
  const plainTrendSales = [...trendData.sales];
  const plainTrendPurchases = [...trendData.purchases];
  const plainRevenueByType = { ...revenueByType };
  const plainPaymentStatus = { ...paymentStatus };
  const plainTopProducts = topProducts.map(p => ({ ...p }));
  const plainWarehouseStock = warehouseStock.map(w => ({ ...w }));

  // ── Sales vs Purchases Trend ──
  if (salesTrendCanvas) {
    charts.trend = new Chart(salesTrendCanvas, {
      type: 'line',
      data: {
        labels: plainTrendLabels,
        datasets: [
          { label: t('Sales'), data: plainTrendSales, borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 },
          { label: t('Purchases'), data: plainTrendPurchases, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.08)', fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 7, borderWidth: 2.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { ...basePlugins, tooltip: { titleFont: chartFont, bodyFont: chartFont, callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { callback: v => fmt(v), font: chartFont } },
          x: { grid: { display: false }, ticks: { font: chartFont } }
        }
      }
    });
  }

  // ── Revenue Breakdown Doughnut ──
  if (revenueBreakdownCanvas) {
    charts.revenue = new Chart(revenueBreakdownCanvas, {
      type: 'doughnut',
      data: {
        labels: [t('Sales'), t('Purchases'), t('Sale Returns'), t('Purchase Returns'), t('Wastes')],
        datasets: [{
          data: [
            plainRevenueByType.sales,
            plainRevenueByType.purchases,
            plainRevenueByType.saleReturns,
            plainRevenueByType.purchaseReturns,
            plainRevenueByType.wastes
          ],
          backgroundColor: ['#0d6efd', '#e74c3c', '#fd7e14', '#6f42c1', '#495057'],
          borderWidth: 3, borderColor: '#fff', hoverOffset: 10
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          ...basePlugins,
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { ...chartFont, size: 11 } } },
          tooltip: { titleFont: chartFont, bodyFont: chartFont, callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.parsed)}` } }
        }
      }
    });
  }

  // ── Top Products Horizontal Bar ──
  if (topProductsCanvas && plainTopProducts.length > 0) {
    const barColors = ['#0d6efd', '#0dcaf0', '#198754', '#ffc107', '#fd7e14', '#6f42c1', '#e74c3c'];
    charts.topProds = new Chart(topProductsCanvas, {
      type: 'bar',
      data: {
        labels: plainTopProducts.map(p => (p.name || '').substring(0, 24)),
        datasets: [{
          label: 'Revenue',
          data: plainTopProducts.map(p => p.rev),
          backgroundColor: plainTopProducts.map((_, i) => barColors[i % barColors.length] + 'BB'),
          borderColor: plainTopProducts.map((_, i) => barColors[i % barColors.length]),
          borderWidth: 1, borderRadius: 5, barThickness: 18
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          ...basePlugins, legend: { display: false },
          tooltip: { titleFont: chartFont, bodyFont: chartFont, callbacks: { label: ctx => `Revenue: ${fmt(ctx.parsed.x)}` } }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: gridColor }, ticks: { callback: v => fmt(v), font: chartFont } },
          y: { grid: { display: false }, ticks: { font: { ...chartFont, size: 11 } } }
        }
      }
    });
  }

  // ── Payment Status Doughnut ──
  if (paymentStatusCanvas) {
    charts.payments = new Chart(paymentStatusCanvas, {
      type: 'doughnut',
      data: {
        labels: [t('Sales Received'), t('Sales Due'), t('Purchases Paid'), t('Purchases Due')],
        datasets: [{
          data: [
            plainPaymentStatus.salePaid,
            plainPaymentStatus.saleUnpaid,
            plainPaymentStatus.purchasePaid,
            plainPaymentStatus.purchaseUnpaid
          ],
          backgroundColor: ['#198754', '#fd7e14', '#0dcaf0', '#e74c3c'],
          borderWidth: 3, borderColor: '#fff', hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          ...basePlugins,
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { ...chartFont, size: 11 } } },
          tooltip: { titleFont: chartFont, bodyFont: chartFont, callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.parsed)}` } }
        }
      }
    });
  }

  // ── Warehouse Stock Bar ──
  if (warehouseCanvas && plainWarehouseStock.length > 0) {
    const wColors = ['#0d6efd', '#198754', '#ffc107', '#e74c3c', '#6f42c1', '#0dcaf0', '#fd7e14', '#d63384'];
    charts.warehouse = new Chart(warehouseCanvas, {
      type: 'bar',
      data: {
        labels: plainWarehouseStock.map(w => w.name),
        datasets: [{
          label: 'Qty',
          data: plainWarehouseStock.map(w => w.quantity),
          backgroundColor: plainWarehouseStock.map((_, i) => wColors[i % wColors.length] + 'BB'),
          borderColor: plainWarehouseStock.map((_, i) => wColors[i % wColors.length]),
          borderWidth: 1, borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          ...basePlugins, legend: { display: false },
          tooltip: { titleFont: chartFont, bodyFont: chartFont, callbacks: { label: ctx => `Qty: ${fmt(ctx.parsed.y)}` } }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { font: chartFont } },
          x: { grid: { display: false }, ticks: { font: { ...chartFont, size: 11 } } }
        }
      }
    });
  }
}

  let netBenefit = ['-',0]
  let treasuryBalance = {};
  let treasuryAccountId = $state(null);
  // Treasury card target: the treasury account profile, with the aggregate
  // treasury page as the fallback while the account id is unknown.
  let treasuryHref = $derived(treasuryAccountId ? `/dashboard/account/${treasuryAccountId}` : '/dashboard/treasury');
  // ─── Lifecycle ───────────────────────────────────────────────────
  onMount(async () => {

    netBenefit = await getGeneralBenefit();
    treasuryBalance =  await calculateBalanceOfTreasury();
    treasuryAccountId = await findTreasuryAccountId().catch(() => null);
    console.log("Net Benefit",netBenefit);
    let accountBalances = await calculateBalancesOfAllAccounts();
    console.log(accountBalances);


    await fetchDashboardData();
    await tick();
    createCharts();
  });
  onDestroy(() => destroyCharts());

  async function refresh() {
    destroyCharts();
    await fetchDashboardData();
    await tick();
    createCharts();
  }


  async function fetchDashboardData() {
    loading = true;
    error = null;
    try {
      /*
       * Only fetch rows needed for the today/week/month panels
       * instead of the entire table: a window of the last 31 days
       * through the end of the current week covers all three.
       */
      const date_from = toDateStr(new Date(todayStart.getTime() - 31 * 86400000));
      const date_to = toDateStr(weekEnd);

      const [
        currencies, warehouses, accounts, products,
        sales, purchases,
        wastes, salePayments, purchasePayments,
        saleItems, warehouseProducts
      ] = await Promise.all([
        currencyApi.getAll({ status: 1 }).then((r) => r?.data || []).catch(() => []),
        warehouseApi.getAll({ status: 1 }).then((r) => r?.data || []).catch(() => []), accountApi.getAll({ status: 1 }).then((r) => r?.data || []).catch(() => []), productApi.getAll({ status: 1 }).then((r) => r?.data || []).catch(() => []),
        saleApi.getAllWithRelations({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []),
        purchaseApi.getAllWithRelations({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []),
        wasteApi.getAll({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []),
        salePaymentApi.getAll({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []),
        purchasePaymentApi.getAll({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []),
        saleItemApi.getAll({ status: 1, date_from, date_to }).then((r) => r?.data || []).catch(() => []), warehouseProductApi.getAll({ status: 1 }).then((r) => r?.data || []).catch(() => [])
      ]);

      const saleReturns = sales.flatMap((s) => s.returns || []);
      const purchaseReturns = purchases.flatMap((p) => p.returns || []);

      allCurrencies = currencies;
      if (currencies.length) defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
      allWarehouses = warehouses;
      allAccounts = accounts;
      allProducts = products;
      totalWarehouses = warehouses.length;

      const ranges = { today: [todayStart, todayEnd], week: [weekStart, weekEnd], month: [monthStart, monthEnd] };
      for (const [period, [start, end]] of Object.entries(ranges)) {
        const f = (arr, field) => arr.filter(x => inRange(x[field], start, end));
        summaries[period] = {
          sales: sumCurr(f(sales, 'invoice_date'), 'total_amount'),
          purchases: sumCurr(f(purchases, 'bill_date'), 'total_amount'),
          saleReturns: sumCurr(f(saleReturns, 'return_date'), 'total_amount'),
          purchaseReturns: sumCurr(f(purchaseReturns, 'return_date'), 'total_amount'),
          wastes: sumCurr(f(wastes, 'date'), 'total_amount'),
          salePayments: sumCurr(f(salePayments, 'payment_date'), 'amount'),
          purchasePayments: sumCurr(f(purchasePayments, 'payment_date'), 'amount')
        };
        counts[period] = {
          sales: f(sales, 'invoice_date').length,
          purchases: f(purchases, 'bill_date').length,
          saleReturns: f(saleReturns, 'return_date').length,
          purchaseReturns: f(purchaseReturns, 'return_date').length,
          wastes: f(wastes, 'date').length
        };
      }

      // 7-day trend
      const tl = [], ts = [], tp = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart); d.setDate(d.getDate() - i);
        const ds = toDateStr(d), ns = toDateStr(new Date(d.getTime() + 86400000));
        tl.push(d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));
        ts.push(sales.filter(s => s.invoice_date >= ds && s.invoice_date < ns).reduce((a, x) => a + (Number(x.total_amount) || 0), 0));
        tp.push(purchases.filter(p => p.bill_date >= ds && p.bill_date < ns).reduce((a, x) => a + (Number(x.total_amount) || 0), 0));
      }
      trendData = { labels: tl, sales: ts, purchases: tp };

      // Top products by revenue (this month)
      const sMap = {};
      sales.forEach(s => { sMap[s.id] = s.invoice_date; });
      const msi = saleItems.filter(si => sMap[si.sale_id] && inRange(sMap[si.sale_id], monthStart, monthEnd));
      const pMap = {};
      msi.forEach(si => {
        if (!pMap[si.product_id]) pMap[si.product_id] = { pid: si.product_id, qty: 0, rev: 0 };
        pMap[si.product_id].qty += Number(si.quantity) || 0;
        pMap[si.product_id].rev += Number(si.subtotal) || 0;
      });
      topProducts = Object.values(pMap).sort((a, b) => b.rev - a.rev).slice(0, 7)
        .map(tp => { const p = products.find(x => x.id === tp.pid); return { ...tp, name: p?.name || `#${tp.pid}`, code: p?.code || '' }; });

      // Revenue breakdown (month)
      const mf = (arr, f) => arr.filter(x => inRange(x[f], monthStart, monthEnd)).reduce((a, x) => a + (Number(x.total_amount) || 0), 0);
      revenueByType = { sales: mf(sales, 'invoice_date'), purchases: mf(purchases, 'bill_date'), saleReturns: mf(saleReturns, 'return_date'), purchaseReturns: mf(purchaseReturns, 'return_date'), wastes: mf(wastes, 'date') };

      // Payment status (month)
      const mSP = salePayments.filter(p => inRange(p.payment_date, monthStart, monthEnd)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
      const mPP = purchasePayments.filter(p => inRange(p.payment_date, monthStart, monthEnd)).reduce((a, x) => a + (Number(x.amount) || 0), 0);
      paymentStatus = { salePaid: mSP, saleUnpaid: Math.max(0, revenueByType.sales - mSP), purchasePaid: mPP, purchaseUnpaid: Math.max(0, revenueByType.purchases - mPP) };

      // Warehouse stock distribution
      const whMap = {};
      warehouseProducts.forEach(wp => {
        const n = warehouses.find(w => w.id === wp.warehouse_id)?.name || `WH #${wp.warehouse_id}`;
        whMap[n] = (whMap[n] || 0) + (Number(wp.quantity) || 0);
      });
      warehouseStock = Object.entries(whMap).map(([name, quantity]) => ({ name, quantity }));

      // Low stock alerts
      const stkByProd = {};
      warehouseProducts.forEach(wp => { stkByProd[wp.product_id] = (stkByProd[wp.product_id] || 0) + (Number(wp.quantity) || 0); });
      lowStockProducts = products.map(p => ({ ...p, totalQty: stkByProd[p.id] || 0 }))
        .filter(p => p.totalQty <= (Number(p.alarm_quantity) || 0))
        .sort((a, b) => a.totalQty - b.totalQty).slice(0, 10);
      stockAlertCount = products.filter(p => (stkByProd[p.id] || 0) <= (Number(p.alarm_quantity) || 0)).length;

      // Inventory value
      totalInventoryValue = products.reduce((s, p) => s + ((stkByProd[p.id] || 0) * (Number(p.buy_price) || 0)), 0);
      totalProducts = products.length;
      totalAccounts = accounts.length;

      // Recent tables with resolved names
      const acctName = (id) => accounts.find(a => a.id === id)?.name || '—';
      const whName = (id) => warehouses.find(w => w.id === id)?.name || '—';
      recentSales = [...sales].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 8)
        .map(s => ({ ...s, accountName: acctName(s.account_id), warehouseName: whName(s.warehouse_id) }));
      recentPurchases = [...purchases].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 8)
        .map(p => ({ ...p, accountName: acctName(p.account_id), warehouseName: whName(p.warehouse_id) }));

      lastRefreshed = new Date();
    } catch (err) {
      console.error('Dashboard error:', err);
      error = err.message || 'Failed to load dashboard data';
    } finally {
      loading = false;
    }
  }
  // Metric card definitions. Every card is a link into the section that owns
  // the figure it shows, so the dashboard doubles as a launcher.
  const metrics = [
    { key: 'sales', label: t('Sales'), icon: 'bi-graph-up', color: 'primary', border: 'border-primary', bgLight: 'bg-primary bg-opacity-10', href: '/dashboard/sales' },
    { key: 'purchases', label: t('Purchases'), icon: 'bi-cart', color: 'danger', border: 'border-danger', bgLight: 'bg-danger bg-opacity-10', href: '/dashboard/purchases' },
    { key: 'saleReturns', label: t('Sale Returns'), icon: 'bi-arrow-counterclockwise', color: 'warning', border: 'border-warning', bgLight: 'bg-warning bg-opacity-10', href: '/dashboard/stock/returns' },
    { key: 'purchaseReturns', label: t('Purchase Returns'), icon: 'bi-arrow-repeat', color: 'info', border: 'border-info', bgLight: 'bg-info bg-opacity-10', href: '/dashboard/stock/returns' },
    { key: 'wastes', label: t('Wastes'), icon: 'bi-trash', color: 'dark', border: 'border-dark', bgLight: 'bg-dark bg-opacity-10', href: '/dashboard/wastes' }
  ];

  // Quick stats bar: same idea, each tile opens its own section.
  const quickStats = $derived([
    { label: t('Products'), val: fmt(totalProducts), icon: 'bi-box-seam', color: 'primary', href: '/dashboard/stock/products' },
    { label: t('Accounts'), val: fmt(totalAccounts), icon: 'bi-people', color: 'success', href: '/dashboard/accounts/list' },
    { label: t('Warehouses'), val: fmt(totalWarehouses), icon: 'bi-building', color: 'info', href: '/dashboard/stock/warehouses' },
    { label: t('Inventory Value'), val: `${defaultCurrency.symbol}${fmt(totalInventoryValue)}`, icon: 'bi-cash-stack', color: 'warning', href: '/dashboard/stock/products' },
    { label: t('Stock Alerts'), val: fmt(stockAlertCount), icon: 'bi-exclamation-triangle', color: stockAlertCount > 0 ? 'danger' : 'success', href: '/dashboard/product-alerts?tab=quantity' }
  ]);


  let ns = $derived(primaryAmt(activeSummary.sales));
let nsr = $derived(primaryAmt(activeSummary.saleReturns));
let np = $derived(primaryAmt(activeSummary.purchases));
let npr = $derived(primaryAmt(activeSummary.purchaseReturns));
let nsp = $derived(primaryAmt(activeSummary.salePayments));
let npp = $derived(primaryAmt(activeSummary.purchasePayments));
</script>

<svelte:head>
  <style>
    /* MDBootstrap-compatible tweaks */
    .mdb-tabs .nav-link { border: none; padding: 0.6rem 1.2rem; font-weight: 500; color: #6c757d; transition: all 0.2s; }
    .mdb-tabs .nav-link.active { color: #0d6efd; background-color: transparent; border-bottom: 2px solid #0d6efd; }
    .mdb-tabs .nav-link:hover:not(.active) { color: #0d6efd; background-color: rgba(13,110,253,0.04); }
    .card { border-radius: 0.75rem; }
    .table th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
    .table td { font-size: 0.85rem; vertical-align: middle; }
    .badge { font-weight: 500; letter-spacing: 0.3px; }
    .shadow-sm { box-shadow: 0 0.125rem 0.5rem rgba(0,0,0,0.08) !important; }
    .btn-rounded { border-radius: 50rem; }
    /* Cards that open a section behave like links but keep the card look. */
    .dashboard-card { display: flex; flex-direction: column; color: inherit; text-decoration: none; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
    .dashboard-card:hover { transform: translateY(-2px); border-color: #cfe0ff !important; box-shadow: 0 0.6rem 1.4rem rgba(15, 23, 42, 0.14) !important; }
    .dashboard-card:focus-visible { outline: 2px solid #0d6efd; outline-offset: 2px; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #dee2e6; border-radius: 4px; }
    @media (prefers-reduced-motion: reduce) { .animate__animated { animation: none !important; opacity: 1 !important; } }
  </style>
</svelte:head>

{#if loading}
  <div class="container-fluid px-3 px-md-4 py-4">
    <PanelSkeleton ariaLabel={t('Loading...')} lines={3} lineHeight="88px" gap="16px" />
  </div>
{:else if error}
  <div class="container-fluid py-5">
    <div class="alert alert-danger animate__animated animate__shakeX d-flex align-items-center">
      <i class="bi bi-exclamation-triangle fa-2x me-3"></i>
      <div>
        <h6 class="alert-heading mb-1">Failed to Load Dashboard</h6>
        <p class="mb-2 text-muted">{error}</p>
        <button onclick={refresh} class="btn btn-outline-danger btn-sm btn-rounded">
          <i class="bi bi-arrow-left me-1"></i>Retry
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="container-fluid px-3 px-md-4 animate__animated animate__fadeIn">

    <!-- ═══════════ HEADER ═══════════ -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4">
      <div>
        <h4 class="fw-bold mb-0">
          <i class="bi bi-speedometer2 text-primary me-2"></i>{t('Dashboard')}
        </h4>
        <small class="text-muted">
          {#if lastRefreshed}{t('Updated Date')}: {lastRefreshed.toLocaleTimeString()}{/if}
        </small>
      </div>
      <button onclick={refresh} class="btn btn-outline-primary btn-rounded btn-sm px-3">
        <i class="bi bi-arrow-clockwise me-1"></i>{t('Refresh')}
      </button>
    </div>

    <!-- ═══════════ QUICK STATS BAR ═══════════ -->
    <div class="row g-3 mb-4">
      {#each quickStats as item, i}
        <div class="col-6 col-md animate__animated animate__fadeInUp" style="animation-delay:{0.05 * i}s">
          <a
            class="card border-0 shadow-sm dashboard-card h-100"
            href={item.href}
            use:link
            title={item.label}
            aria-label={`${t('Open')} ${item.label}`}>
            <div class="card-body text-center py-3">
              <div class="text-{item.color} mb-1"><i class="bi {item.icon} fs-5"></i></div>
              <h5 class="fw-bold mb-0">{item.val}</h5>
              <small class="text-muted">{item.label}</small>
            </div>
          </a>
        </div>
      {/each}
    </div>

    <!-- ═══════════ PERIOD TABS ═══════════ -->
    <ul class="nav nav-tabs mdb-tabs mb-4 animate__animated animate__fadeIn" style="animation-delay:0.3s">
      {#each ['today', 'week', 'month'] as period}
        <li class="nav-item">
          <button class="nav-link {activePeriod === period ? 'active' : ''}" onclick={() => activePeriod = period} role="tab">
            <i class="bi {period === 'today' ? 'bi-calendar-day' : period === 'week' ? 'bi-calendar-week' : 'bi-calendar'} me-1"></i>
            {periodLabels[period]}
          </button>
        </li>
      {/each}
    </ul>

    <!-- ═══════════ METRIC CARDS ═══════════ -->
    <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 row-cols-xl-5 g-3 mb-4">
      {#each metrics as m, i}
        {@const pa = primaryAmt(activeSummary[m.key])}
        {@const oc = otherCurrs(activeSummary[m.key])}
        {@const cnt = activeCounts[m.key]}
        <div class="col animate__animated animate__fadeInUp" style="animation-delay:{0.05 * (i + 1)}s">
          <a
            class="card border-start border-4 {m.border} shadow-sm h-100 dashboard-card"
            href={m.href}
            use:link
            title={m.label}
            aria-label={`${t('Open')} ${m.label}`}>
            <div class="card-body py-3">
              <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1 min-w-0">
                  <p class="text-muted small mb-1 fw-medium">{m.label}</p>
                  <h5 class="fw-bold mb-0 text-truncate" title="{pa.sym}{pa.amt}">
                    {pa.sym}{pa.amt}
                  </h5>
                  <small class="text-muted">{cnt} {cnt === 1 ? t('record') : t('records')}</small>
                  {#if oc.length > 0}
                    <div class="mt-1 d-flex flex-wrap gap-1">
                      {#each oc as o}
                        <span class="badge bg-light text-dark border" style="font-size:0.62rem">
                          {o.sym}{o.amt} {o.code}
                        </span>
                      {/each}
                    </div>
                  {/if}
                </div>
                <div class="{m.bgLight} rounded-3 p-2 ms-2 flex-shrink-0">
                  <i class="bi {m.icon} text-{m.color}"></i>
                </div>
              </div>
            </div>
          </a>
        </div>
      {/each}
    </div>

    <!-- ═══════════ NET SUMMARY STRIP ═══════════ -->
    <div class="row g-3 mb-4 animate__animated animate__fadeInUp" style="animation-delay:0.6s">
      <div class="col-md-4">
        <a
          class="card border-0 shadow-sm dashboard-card h-100"
          href="/dashboard/accounts/report"
          use:link
          title={t('Net Benefit')}
          aria-label={`${t('Open')} ${t('Net Benefit')}`}>
          <div class="card-body py-3 d-flex align-items-center">
            <div class="bg-success bg-opacity-10 rounded-3 p-3 me-3 flex-shrink-0">
              <i class="bi bi-arrow-up-right text-success fa-lg"></i>
            </div>
            <div class="min-w-0">
              <small class="text-muted">{t('Net Benefit')}</small>
              <h6 class="fw-bold mb-0">
                <span dir='ltr'>{Number(netBenefit[1]).toLocaleString(undefined,{maximumFractionDigits:3})}</span> {t(netBenefit[0])}<br>
              </h6>
            </div>
          </div>
        </a>
      </div>
      <div class="col-md-4">
        <a
          class="card border-0 shadow-sm dashboard-card h-100"
          href={treasuryHref}
          use:link
          title={t('Treasury')}
          aria-label={`${t('Open')} ${t('Treasury')}`}>
          <div class="card-body py-3 d-flex align-items-center">
            <div class="bg-danger bg-opacity-10 rounded-3 p-3 me-3 flex-shrink-0">
              <i class="bi bi-bank2 text-danger fa-lg"></i>
            </div>
            <div class="min-w-0">
              <small class="text-muted">{t('Treasury')}</small>
              <h6 class="fw-bold mb-0">
                {#each Object.entries(treasuryBalance) as [key, value], i}
                  <span class="text-{Number(value)<0?"danger":"dark"}">
                    <span dir="ltr">
                      {Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    </span>
                    {t(key)}
                  </span>

                  {#if i < Object.entries(treasuryBalance).length - 1}
                    <span class="text-muted mx-1">|</span>
                  {/if}
                {/each}
              </h6>
            </div>
          </div>
        </a>
      </div>
      <div class="col-md-4">
        <a
          class="card border-0 shadow-sm dashboard-card h-100"
          href="/dashboard/sales"
          use:link
          title={t('Payments Collected')}
          aria-label={`${t('Open')} ${t('Payments Collected')}`}>
          <div class="card-body py-3 d-flex align-items-center">
            <div class="bg-dark bg-opacity-10 rounded-3 p-3 me-3 flex-shrink-0">
              <i class="bi bi-cash-coin text-dark fa-lg"></i>
            </div>
            <div class="min-w-0">
              <small class="text-muted">{t('Payments Collected')}</small>
              <h6 class="fw-bold mb-0">
                <span class="text-success">{t('Sales')}: {nsp.sym}{nsp.amt}</span>
                <span class="text-muted mx-1">|</span>
                <span class="text-info">{t('Purchases')}: {npp.sym}{npp.amt}</span>
              </h6>
            </div>
          </div>
        </a>
      </div>
    </div>

    <!-- ═══════════ CHARTS ROW 1 ═══════════ -->
    <div class="row g-3 mb-4">
      <div class="col-lg-8 animate__animated animate__fadeIn" style="animation-delay:0.65s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent border-bottom-0 pt-3 pb-0">
            <h6 class="fw-bold mb-0"><i class="bi bi-graph-up text-primary me-2"></i>{t('Sales vs Purchases — Last 7 Days')}</h6>
          </div>
          <div class="card-body" style="height:320px">
            <canvas bind:this={salesTrendCanvas}></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:0.7s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent border-bottom-0 pt-3 pb-0">
            <h6 class="fw-bold mb-0"><i class="bi bi-pie-chart text-danger me-2"></i>{t('Revenue Breakdown — This Month')}</h6>
          </div>
          <div class="card-body d-flex align-items-center justify-content-center" style="height:320px">
            <canvas bind:this={revenueBreakdownCanvas}></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ CHARTS ROW 2 ═══════════ -->
    <div class="row g-3 mb-4">
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:0.75s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent border-bottom-0 pt-3 pb-0">
            <h6 class="fw-bold mb-0"><i class="bi bi-trophy text-warning me-2"></i>{t('Top Products — This Month')}</h6>
          </div>
          <div class="card-body" style="height:290px">
            {#if topProducts.length === 0}
              <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                <div class="text-center">
                  <i class="bi bi-box mb-2 d-block opacity-50"></i>
                  <small>No sales this month</small>
                </div>
              </div>
            {:else}
              <canvas bind:this={topProductsCanvas}></canvas>
            {/if}
          </div>
        </div>
      </div>
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:0.8s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent border-bottom-0 pt-3 pb-0">
            <h6 class="fw-bold mb-0"><i class="bi bi-cash-stack text-success me-2"></i>{t('Payment Status — This Month')}</h6>
          </div>
          <div class="card-body d-flex align-items-center justify-content-center" style="height:290px">
            <canvas bind:this={paymentStatusCanvas}></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:0.85s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent border-bottom-0 pt-3 pb-0">
            <h6 class="fw-bold mb-0"><i class="bi bi-building text-info me-2"></i>{t('Stock by Warehouse')}</h6>
          </div>
          <div class="card-body" style="height:290px">
            {#if warehouseStock.length === 0}
              <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                <div class="text-center">
                  <i class="bi bi-building mb-2 d-block opacity-50"></i>
                  <small>No warehouse data</small>
                </div>
              </div>
            {:else}
              <canvas bind:this={warehouseCanvas}></canvas>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ RECENT SALES TABLE ═══════════ -->
    <div class="row g-3 mb-4">
      <div class="col-lg-8 animate__animated animate__fadeIn" style="animation-delay:0.9s">
        <div class="card border-0 shadow-sm">
          <div class="card-header bg-transparent d-flex justify-content-between align-items-center py-3">
            <h6 class="fw-bold mb-0"><i class="bi bi-receipt text-primary me-2"></i>{t('Recent Sales')}</h6>
            <span class="badge bg-primary bg-opacity-10 text-primary rounded-pill">{recentSales.length}</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive" style="max-height:380px;overflow-y:auto">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th class="ps-3">Invoice #</th>
                    <th>Account</th>
                    <th class="d-none d-md-table-cell">Warehouse</th>
                    <th>Date</th>
                    <th class="text-end pe-3">Amount</th>
                    <th class="text-center" style="width:90px">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#if recentSales.length === 0}
                    <tr><td colspan="6" class="text-center text-muted py-4">No sales recorded yet</td></tr>
                  {:else}
                    {#each recentSales as sale (sale.id)}
                      {@const b = invBadge(sale.invoice_status)}
                      <tr>
                        <td class="ps-3 fw-medium">{sale.invoice_number || `#${sale.id}`}</td>
                        <td>
                          <span class="text-truncate d-inline-block" style="max-width:140px" title={sale.accountName}>
                            {sale.accountName}
                          </span>
                        </td>
                        <td class="d-none d-md-table-cell">
                          <span class="text-muted small">{sale.warehouseName}</span>
                        </td>
                        <td><span class="text-muted small">{sale.invoice_date}</span></td>
                        <td class="text-end pe-3 fw-medium">{curSym(sale.currency)}{fmt(sale.total_amount)}</td>
                        <td class="text-center"><span class="badge {b[1]}">{b[0]}</span></td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════ LOW STOCK ═══════════ -->
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:0.95s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent d-flex justify-content-between align-items-center py-3">
            <h6 class="fw-bold mb-0">
              <i class="bi bi-exclamation-triangle text-danger me-2"></i>{t('Low Stock')}
            </h6>
            <span class="badge {stockAlertCount > 0 ? 'bg-danger' : 'bg-success'} bg-opacity-10 rounded-pill
              {stockAlertCount > 0 ? 'text-danger' : 'text-success'}">
              {stockAlertCount}
            </span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive" style="max-height:380px;overflow-y:auto">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th class="ps-3">Product</th>
                    <th class="text-center" style="width:70px">Stock</th>
                    <th class="text-center pe-3" style="width:70px">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {#if lowStockProducts.length === 0}
                    <tr>
                      <td colspan="3" class="text-center py-5">
                        <div class="text-success">
                          <i class="bi bi-check-circle mb-2 d-block"></i>
                          <small class="fw-medium">All products well stocked</small>
                        </div>
                      </td>
                    </tr>
                  {:else}
                    {#each lowStockProducts as prod (prod.id)}
                      <tr class="{prod.totalQty === 0 ? 'table-danger bg-danger bg-opacity-5' : 'table-warning bg-warning bg-opacity-5'}">
                        <td class="ps-3">
                          <div class="fw-medium text-truncate" style="max-width:160px" title={prod.name}>{prod.name}</div>
                          {#if prod.code}
                            <small class="text-muted">{prod.code}</small>
                          {/if}
                        </td>
                        <td class="text-center">
                          <span class="fw-bold {prod.totalQty === 0 ? 'text-danger' : 'text-warning'}">
                            {fmt(prod.totalQty)}
                          </span>
                        </td>
                        <td class="text-center pe-3">
                          <span class="text-muted small">{fmt(prod.alarm_quantity)}</span>
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ RECENT PURCHASES TABLE ═══════════ -->
    <div class="row g-3 mb-4">
      <div class="col-lg-8 animate__animated animate__fadeIn" style="animation-delay:1s">
        <div class="card border-0 shadow-sm">
          <div class="card-header bg-transparent d-flex justify-content-between align-items-center py-3">
            <h6 class="fw-bold mb-0"><i class="bi bi-file text-danger me-2"></i>{t('Recent Purchases')}</h6>
            <span class="badge bg-danger bg-opacity-10 text-danger rounded-pill">{recentPurchases.length}</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive" style="max-height:380px;overflow-y:auto">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th class="ps-3">Bill #</th>
                    <th>Account</th>
                    <th class="d-none d-md-table-cell">Warehouse</th>
                    <th>Date</th>
                    <th class="text-end pe-3">Amount</th>
                    <th class="text-center" style="width:90px">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {#if recentPurchases.length === 0}
                    <tr><td colspan="6" class="text-center text-muted py-4">No purchases recorded yet</td></tr>
                  {:else}
                    {#each recentPurchases as purch (purch.id)}
                      {@const b = billBadge(purch.bill_status)}
                      <tr>
                        <td class="ps-3 fw-medium">{purch.bill_number || `#${purch.id}`}</td>
                        <td>
                          <span class="text-truncate d-inline-block" style="max-width:140px" title={purch.accountName}>
                            {purch.accountName}
                          </span>
                        </td>
                        <td class="d-none d-md-table-cell">
                          <span class="text-muted small">{purch.warehouseName}</span>
                        </td>
                        <td><span class="text-muted small">{purch.bill_date}</span></td>
                        <td class="text-end pe-3 fw-medium">{curSym(purch.currency)}{fmt(purch.total_amount)}</td>
                        <td class="text-center"><span class="badge {b[1]}">{b[0]}</span></td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════ CURRENCY OVERVIEW ═══════════ -->
      <div class="col-lg-4 animate__animated animate__fadeIn" style="animation-delay:1.05s">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-header bg-transparent py-3">
            <h6 class="fw-bold mb-0"><i class="bi bi-coin text-warning me-2"></i>{t('Currencies')}</h6>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive" style="max-height:380px;overflow-y:auto">
              <table class="table table-hover align-middle mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th class="ps-3">Currency</th>
                    <th class="text-end pe-3">Rate</th>
                    <th class="text-center" style="width:70px">Default</th>
                  </tr>
                </thead>
                <tbody>
                  {#if allCurrencies.length === 0}
                    <tr><td colspan="3" class="text-center text-muted py-4">No currencies configured</td></tr>
                  {:else}
                    {#each allCurrencies as cur (cur.id)}
                      <tr class="{cur.isDefault ? 'table-primary bg-primary bg-opacity-5' : ''}">
                        <td class="ps-3 fw-medium">
                          {cur.symbol} {cur.code}
                          {#if cur.name}
                            <br><small class="text-muted">{cur.name}</small>
                          {/if}
                        </td>
                        <td class="text-end pe-3">
                          <span class="fw-medium">{fmt(cur.exchangeRate)}</span>
                          {#if cur.exchangeRateDate}
                            <br><small class="text-muted">{cur.exchangeRateDate}</small>
                          {/if}
                        </td>
                        <td class="text-center">
                          {#if cur.isDefault}
                            <span class="badge bg-primary">Yes</span>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ FOOTER ═══════════ -->
    <div class="text-center py-4">
      <small class="text-muted">
        {#if lastRefreshed}
          Dashboard data refreshed at {lastRefreshed.toLocaleTimeString()} — {periodLabels[activePeriod]} view
        {/if}
      </small>
    </div>

  </div>
{/if}