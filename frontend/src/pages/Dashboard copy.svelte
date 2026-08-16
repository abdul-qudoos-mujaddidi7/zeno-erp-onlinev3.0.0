<script>
  import { onMount } from "svelte";
  ;
  import { t, lang, translate_org_type } from "../i18n/i18n.js";
  import { Chart, registerables } from "chart.js";
import { accountApi } from '../api/accountApi.js';
import { productApi } from '../api/productApi.js';
import { journalApi } from '../api/journalApi.js';
import { warehouseProductApi } from '../api/warehouseProductApi.js';
import { saleApi } from '../api/saleApi.js';
import { purchaseApi } from '../api/purchaseApi.js';
import { saleItemApi } from '../api/saleItemApi.js';

  // Register Chart.js components
  Chart.register(...registerables);

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  let loading = true;
  let metrics = {
    totalSales: 0,
    totalPurchases: 0,
    inventoryValue: 0,
    accountsReceivable: 0,
    accountsPayable: 0,
  };
  let recentSales = [];
  let recentPurchases = [];
  let recentJournals = [];
  let topProducts = [];
  let salesChart = null;
  let salesChartCanvas = null;

  async function loadMetrics() {
    // Total Sales
    const sales = ((await saleApi.getAll({ status: 1 }))?.data || []).filter(
      (s) => s.invoice_status === "confirmed",
    );
    metrics.totalSales = sales.reduce(
      (sum, s) => sum + (parseFloat(s.total_amount) || 0),
      0,
    );

    // Total Purchases
    const purchases = ((await purchaseApi.getAll({ status: 1 }))?.data || []).filter(
      (p) => p.bill_status === "confirmed",
    );
    metrics.totalPurchases = purchases.reduce(
      (sum, p) => sum + (parseFloat(p.total_amount) || 0),
      0,
    );

    // Inventory Value
    const warehouseProducts = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    let invValue = 0;
    for (const wp of warehouseProducts) {
      const product = (await productApi.getAll({ status: 1 }))?.data?.find((p) => Number(p.id) === Number(wp.product_id)) || null;
      if (product) {
        invValue +=
          (parseFloat(wp.quantity) || 0) *
          (parseFloat(product.sell_price) || 0);
      }
    }
    metrics.inventoryValue = invValue;

    // Accounts Receivable
    const receivableAccounts = await (await accountApi.getAll({ status: 1, code: 'RECEIVABLE' }))?.data || [];
    metrics.accountsReceivable = receivableAccounts.reduce(
      (sum, a) => sum + (parseFloat(a.balance) || 0),
      0,
    );

    // Accounts Payable
    const payableAccounts = await (await accountApi.getAll({ status: 1, code: 'PAYABLE' }))?.data || [];
    metrics.accountsPayable = payableAccounts.reduce(
      (sum, a) => sum + (parseFloat(a.balance) || 0),
      0,
    );
  }

  async function loadRecentActivities() {
    // Recent Sales
    recentSales = ((await saleApi.getAll({ status: 1 }))?.data || [])
      .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date))
      .slice(0, 5);

    // Recent Purchases
    recentPurchases = ((await purchaseApi.getAll({ status: 1 }))?.data || [])
      .sort((a, b) => new Date(b.bill_date) - new Date(a.bill_date))
      .slice(0, 5);

    // Recent Journals
    recentJournals = ((await journalApi.getAll({ status: 1 }))?.data || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);
  }

  async function loadTopProducts() {
    // Top products by sales quantity
    const saleItems = (await saleItemApi.getAll({ status: 1 }))?.data || [];
    const productSales = {};
    for (const item of saleItems) {
      if (!productSales[item.product_id]) productSales[item.product_id] = 0;
      productSales[item.product_id] += parseFloat(item.quantity) || 0;
    }
    const sorted = Object.entries(productSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    topProducts = [];
    for (const [pid, qty] of sorted) {
      const product = (await productApi.getAll({ status: 1 }))?.data
        ?.find((p) => Number(p.id) === Number(parseInt(pid))) || null;
      if (product) {
        topProducts.push({ ...product, totalSold: qty });
      }
    }
  }

  function createSalesChart() {
    if (salesChart) salesChart.destroy();
    if (!salesChartCanvas) return;

    // Monthly sales data (simplified - in real app, group by month)
    const sales = recentSales.slice().reverse(); // oldest first
    const labels = sales.map((s) =>
      new Date(s.invoice_date).toLocaleDateString(),
    );
    const data = sales.map((s) => parseFloat(s.total_amount) || 0);

    salesChart = new Chart(salesChartCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: t("Sales"),
            data,
            borderColor: "#007bff",
            backgroundColor: "rgba(0, 123, 255, 0.1)",
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  async function loadData() {
    loading = true;
    await Promise.all([
      loadMetrics(),
      loadRecentActivities(),
      loadTopProducts(),
    ]);
    loading = false;
    // Create chart after data is loaded
    setTimeout(createSalesChart, 100);
  }

  onMount(() => {
    loadData();
  });

  // Recreate chart when language changes
  $: if (_lang && salesChartCanvas) {
    setTimeout(createSalesChart, 100);
  }
</script>

<div class="container-fluid mt-4">
  <div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="fw-bold">{t("Dashboard")}</h4>
    <button class="btn btn-outline-primary" on:click={loadData}>
      <i class="bi bi-arrow-clockwise me-2"></i>{t("Sync Now")}
    </button>
  </div>

  {#if loading}
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">{t("Loading...")}</span>
      </div>
      <p class="mt-2">{t("Loading...")}</p>
    </div>
  {:else}
    <!-- Metrics Cards -->
    <div class="row g-4 mb-4">
      <div class="col-xl-3 col-md-6">
        <div class="card shadow-sm border-start border-primary border-4">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="flex-shrink-0">
                <i class="bi bi-graph-up text-primary fs-2"></i>
              </div>
              <div class="flex-grow-1 ms-3">
                <h6 class="text-muted mb-1">{t("Total Sales")}</h6>
                <h4 class="mb-0">
                  {metrics.totalSales.toLocaleString()}
                  {t("AFN")}
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-3 col-md-6">
        <div class="card shadow-sm border-start border-success border-4">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="flex-shrink-0">
                <i class="bi bi-cart-plus text-success fs-2"></i>
              </div>
              <div class="flex-grow-1 ms-3">
                <h6 class="text-muted mb-1">{t("Total Purchases")}</h6>
                <h4 class="mb-0">
                  {metrics.totalPurchases.toLocaleString()}
                  {t("AFN")}
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-3 col-md-6">
        <div class="card shadow-sm border-start border-warning border-4">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="flex-shrink-0">
                <i class="bi bi-boxes text-warning fs-2"></i>
              </div>
              <div class="flex-grow-1 ms-3">
                <h6 class="text-muted mb-1">{t("Inventory Value")}</h6>
                <h4 class="mb-0">
                  {metrics.inventoryValue.toLocaleString()}
                  {t("AFN")}
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-3 col-md-6">
        <div class="card shadow-sm border-start border-info border-4">
          <div class="card-body">
            <div class="d-flex align-items-center">
              <div class="flex-shrink-0">
                <i class="bi bi-cash text-info fs-2"></i>
              </div>
              <div class="flex-grow-1 ms-3">
                <h6 class="text-muted mb-1">{t("Accounts Receivable")}</h6>
                <h4 class="mb-0">
                  {metrics.accountsReceivable.toLocaleString()}
                  {t("AFN")}
                </h4>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts and Recent Activities -->
    <div class="row g-4">
      <!-- Sales Chart -->
      <div class="col-xl-8">
        <div class="card shadow-sm">
          <div class="card-header bg-body-tertiary">
            <h6 class="mb-0">{t("Sales Overview")}</h6>
          </div>
          <div class="card-body">
            <canvas bind:this={salesChartCanvas} height="200"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Products -->
      <div class="col-xl-4">
        <div class="card shadow-sm">
          <div
            class="card-header bg-body-tertiary d-flex justify-content-between align-items-center"
          >
            <h6 class="mb-0">{t("Top Products")}</h6>
            <a href="#/products" class="btn btn-sm btn-outline-primary"
              >{t("View All")}</a
            >
          </div>
          <div class="card-body">
            {#if topProducts.length > 0}
              {#each topProducts as product}
                <div class="d-flex align-items-center mb-3">
                  <div class="flex-grow-1">
                    <h6 class="mb-1">{product.name}</h6>
                    <small class="text-muted"
                      >{t("Sold")}: {product.totalSold}</small
                    >
                  </div>
                  <div class="text-end">
                    <span class="badge bg-primary">{product.totalSold}</span>
                  </div>
                </div>
              {/each}
            {:else}
              <p class="text-muted mb-0">{t("No data available")}</p>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Activities -->
    <div class="row g-4 mt-2">
      <!-- Recent Sales -->
      <div class="col-lg-4">
        <div class="card shadow-sm">
          <div
            class="card-header bg-body-tertiary d-flex justify-content-between align-items-center"
          >
            <h6 class="mb-0">{t("Recent Sales")}</h6>
            <a href="#/sales" class="btn btn-sm btn-outline-primary"
              >{t("View All")}</a
            >
          </div>
          <div class="card-body">
            {#if recentSales.length > 0}
              {#each recentSales as sale}
                <div class="d-flex align-items-center mb-3">
                  <div class="flex-shrink-0">
                    <i class="bi bi-receipt text-success fs-4"></i>
                  </div>
                  <div class="flex-grow-1 ms-3">
                    <h6 class="mb-1">{t("Invoice")} #{sale.invoice_number}</h6>
                    <small class="text-muted"
                      >{new Date(sale.invoice_date).toLocaleDateString()}</small
                    >
                  </div>
                  <div class="text-end">
                    <span class="fw-bold"
                      >{parseFloat(sale.total_amount).toLocaleString()}
                      {t(sale.currency)}</span
                    >
                  </div>
                </div>
              {/each}
            {:else}
              <p class="text-muted mb-0">{t("No data available")}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Recent Purchases -->
      <div class="col-lg-4">
        <div class="card shadow-sm">
          <div
            class="card-header bg-body-tertiary d-flex justify-content-between align-items-center"
          >
            <h6 class="mb-0">{t("Recent Purchases")}</h6>
            <a href="#/purchases" class="btn btn-sm btn-outline-primary"
              >{t("View All")}</a
            >
          </div>
          <div class="card-body">
            {#if recentPurchases.length > 0}
              {#each recentPurchases as purchase}
                <div class="d-flex align-items-center mb-3">
                  <div class="flex-shrink-0">
                    <i class="bi bi-cart-plus text-warning fs-4"></i>
                  </div>
                  <div class="flex-grow-1 ms-3">
                    <h6 class="mb-1">{t("Bill")} #{purchase.bill_number}</h6>
                    <small class="text-muted"
                      >{new Date(
                        purchase.bill_date,
                      ).toLocaleDateString()}</small
                    >
                  </div>
                  <div class="text-end">
                    <span class="fw-bold"
                      >{parseFloat(purchase.total_amount).toLocaleString()}
                      {t(purchase.currency)}</span
                    >
                  </div>
                </div>
              {/each}
            {:else}
              <p class="text-muted mb-0">{t("No data available")}</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Recent Journals -->
      <div class="col-lg-4">
        <div class="card shadow-sm">
          <div
            class="card-header bg-body-tertiary d-flex justify-content-between align-items-center"
          >
            <h6 class="mb-0">{t("Recent Journals")}</h6>
            <a href="#/journals" class="btn btn-sm btn-outline-primary"
              >{t("View All")}</a
            >
          </div>
          <div class="card-body">
            {#if recentJournals.length > 0}
              {#each recentJournals as journal}
                <div class="d-flex align-items-center mb-3">
                  <div class="flex-shrink-0">
                    <i class="bi bi-journal-text text-info fs-4"></i>
                  </div>
                  <div class="flex-grow-1 ms-3">
                    <h6 class="mb-1">
                      {journal.description || t("Journal Entry")}
                    </h6>
                    <small class="text-muted"
                      >{new Date(journal.date).toLocaleDateString()}</small
                    >
                  </div>
                  <div class="text-end">
                    <span class="fw-bold"
                      >{t("Reference")}: {journal.reference_id}</span
                    >
                  </div>
                </div>
              {/each}
            {:else}
              <p class="text-muted mb-0">{t("No data available")}</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .card {
    transition: transform 0.2s ease-in-out;
  }
  .card:hover {
    transform: translateY(-2px);
  }
</style>
