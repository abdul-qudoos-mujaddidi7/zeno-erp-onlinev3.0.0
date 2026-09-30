<script>
  import { onMount, onDestroy } from 'svelte';
import { productImageApi } from '../../api/productImageApi.js';
import { departmentApi } from '../../api/departmentApi.js';
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { unitCategoryApi } from '../../api/unitCategoryApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import { productBrandApi } from '../../api/productBrandApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import ProductModal from './ProductModal.svelte';
  import { t, lang, translate_org_type, shortID, settings_all } from '../../i18n/i18n.js';
  import { push } from 'svelte-spa-router';
  import OpenFoodAPIModal from './OpenFoodAPIModal.svelte';
  import { getCachedImage, cacheImage } from './imageCache.js';

  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  let openFoodAPIModalRef;

  import { calculateAllStocks, calculateProductStock } from '../stocktransactions/calculateStock.js';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { userApi } from '../../api/userApi.js';
import { warehouseProductApi } from '../../api/warehouseProductApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  let shiftPressed = false;
  let ctrlPressed = false;

  // get shift key status for sidebar toggle
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });
  // --- State ---
  let products = [];
  let calculatingStock = false;
  let categories = [];
  let brands = [];
  let generics = [];
  let departments = [];
  let users = [];
  let units = [];
  let unitCategories = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let loading = true;
  let totalItems = 0;
  let totalPages = 0;

  let goodModal;
  let serviceModal;

  // --- Table State ---
  let searchTerm = '';
  let filterCategory = 'all';
  let filterBrand = 'all';
  let filterCurrency = 'all';
  let filterGeneric = 'all';
  let filterDepartment = 'all';
  let filterUser = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc'; // 'asc' or 'desc'

  // --- Helper Functions ---
  function getStockBadge(qty, unitName, alarm_quantity) {
    let cls = 'badge-success';
    if (qty <= 0) {
      cls = 'badge-danger';
    } else if (qty < alarm_quantity) {
      cls = 'badge-warning';
    }
    return `<span class="badge ${cls}"><span dir='ltr'>${qty}</span> ${unitName}</span>`;
  }

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

  function getUserName(user) {
    if (user) {
      return user.first_name ? user.first_name + ' ' + user.last_name : user.username;
    } else {
      return '';
    }
  }

  // --- Data Loading ---

  let totalPurchaseCostMap = {};
  let totalSaleValueMap = {};
  let totalQuantityCount = 0;

  async function calculatePriceMap() {
    totalPurchaseCostMap = {};
    totalSaleValueMap = {};
    totalQuantityCount = 0;
    products.forEach((p) => {
      const buyPrice = parseFloat(p.buy_price) || 0;
      const sellPrice = parseFloat(p.sell_price) || 0;
      const qty = parseFloat(p.quantity) * -1 || 0;
      const buyCurrency = p.buy_currency;
      const sellCurrency = p.sell_currency;
      totalPurchaseCostMap[buyCurrency] = (totalPurchaseCostMap[buyCurrency] || 0) + buyPrice * qty;
      totalSaleValueMap[sellCurrency] = (totalSaleValueMap[sellCurrency] || 0) + sellPrice * qty;
      totalQuantityCount += qty;
      // check if qty is not integer and it is float, then round to 2 decimal places
      if (qty % 1 !== 0) {
        console.log(p.name, p.id, qty);
      }
    });
  }

  async function moveToProducts(product_id) {
    await productApi.update(product_id, { type: 'good' });
    loadAll();
  }

  async function loadAll() {
    loading = true;
    try {
      const response = await productApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        type: 'service',
        page: currentPage,
        limit: itemsPerPage,
      });
      products = (response?.data || []).filter((p) => p.type === 'service');
      const meta = readListMeta(response, products.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

      categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
      const brandResponse = await productBrandApi.getAll({ status: 1 });
    brands = brandResponse?.data || [];
      const genericResponse = await productGenericApi.getAll({ status: 1 });
      generics = genericResponse?.data || [];
      departments = (await departmentApi.getAll({ status: 1 }))?.data || [];
      units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
      unitCategories = (await unitCategoryApi.getAll({ status: 1 }))?.data || [];
      currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
      warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
      warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
      users = await (await userApi.getAll({ status: 1 }))?.data || [];

      await calculateTotalBenefit();
      await calculateTotalPredictedBenefit();
      await calculatePriceMap();
      const pageIds = products.map((p) => p.id).filter(Boolean);
      const images =
        (await productImageApi.getAll({
          status: 1,
          product_ids: pageIds.join(','),
        }))?.data || [];
      const imageByProductId = new Map(
        images.map((img) => [Number(img.product_id), img]),
      );
      for (let product of products) {
        const img = imageByProductId.get(Number(product.id)) || null;
        product.thumbnailUrl = resolveMediaUrl(img?.thumbnail, '/img/no-image.png');
      }
    } catch (e) {
      console.error('Error loading products:', e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    loadAll();
  });

  // --- Actions ---
  async function deleteProduct(id) {
    if (confirm(t('Are you sure you want to delete this product?'))) {
      await productApi.remove(id);
      loadAll();
    }
  }

  function openNewProduct(type = 'product') {
    if (type === 'service') {
      serviceModal.openModal();
      return;
    }
    goodModal.openModal();
  }

  function editExistingProduct(product) {
    if (product?.type === 'service') {
      serviceModal.editProduct(product);
    } else {
      goodModal.editProduct(product);
    }
  }

  function onProductSaved() {
    loadAll();
  }

  // --- Computed Data (Filter, Sort, Pagination) ---
  // Use a reactive statement to filter and sort the products list

  $: filteredProducts = (() => {
    let result = products;

    // 1. Filter Status
    if (filterStatus === 'active') {
      result = result.filter((p) => p.status === 1);
    } else if (filterStatus === 'inactive') {
      result = result.filter((p) => p.status === 0);
    }

    // 2. Filter Category
    if (filterCategory !== 'all') {
      result = result.filter((p) => p.category_id === parseInt(filterCategory));
    }

    if (filterBrand !== 'all') {
      result = result.filter((p) => p.brand_id === parseInt(filterBrand));
    }

    if (filterCurrency !== 'all') {
      console.log('filterCurrency', filterCurrency);
      result = result.filter((p) => p.currency === filterCurrency);
    }
    if (filterGeneric !== 'all') {
      result = result.filter((p) => p.generic_id === parseInt(filterGeneric));
    }
    if (filterDepartment !== 'all') {
      result = result.filter((p) => p.department_id === parseInt(filterDepartment));
    }

    if (filterUser !== 'all') {
      result = result.filter((p) => p.user_id === parseInt(filterUser));
    }
    // 3. Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) => (p.name && p.name.toLowerCase().includes(term)) || (p.code && p.code.toLowerCase().includes(term)),
      );
    }

    // 4. Sort
    result = result.sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      // Handle null/undefined
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      // Specific handling for calculated fields
      // String comparison
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  $: paginatedProducts = filteredProducts;

  // --- UI Helpers ---
  function setSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  function getCategoryName(id) {
    return categories.find((c) => c.id === id)?.name || '-';
  }

  function getBrandName(id) {
    return brands.find((b) => b.id === id)?.name || '-';
  }

  function getGenericName(id) {
    return generics.find((g) => g.id === id)?.name || '-';
  }

  function getUnitName(id) {
    return units.find((u) => u.id === id)?.name || '';
  }

  // Reset pagination when filters change
  $: if (searchTerm || filterCategory || filterStatus) {
    currentPage = 1;
  }

  function addInitialStockTransactionsForAllProducts() {
    if (
      !confirm(
        'This will create initial stock transactions for all products based on current warehouse_products quantities. Are you sure?',
      )
    )
      return;
    (async () => {
      const [activeProducts, deletedProducts] = await Promise.all([
        productApi.getAll({ status: 1 }),
        productApi.getAll({ status: 0 }),
      ]);
      const products = [
        ...(activeProducts?.data || []),
        ...(deletedProducts?.data || []),
      ];
      const warehouses = await Promise.all([
        warehouseApi.getAll({ status: 1 }),
        warehouseApi.getAll({ status: 0 }),
      ]).then(([active, deleted]) => [
        ...(active?.data || []),
        ...(deleted?.data || []),
      ]);
      for (const p of products) {
        if (p.initial_warehouse_id > 0) {
          const w = warehouses.find((w) => w.id === p.initial_warehouse_id);
          if (!w) continue;
          await stockTransactionApi.create({
            warehouse_id: w.id,
            product_id: p.id,
            product_unit_id: p.product_unit_id || 0,
            reference_id: p.id,
            reference_type: 'manual_adjustment',
            transaction_type: 'adjustment_in',
            quantity: p.initial_quantity || 0,
            unit_cost: parseFloat(p.buy_price) || 0,
            total_cost: parseFloat(p.buy_price) * parseFloat(p.initial_quantity || 0) || 0,
            currency: p.buy_currency,
            peer_price: parseFloat(p.sell_price) || 0,
            peer_currency: p.sell_currency,
            expiry_date: null,
            heaviness: null,
            date: new Date().toISOString(),
            description: `Initial stock for product #${p.id}`,
            status: 1,
          });
        }
      }
    })();
  }

  function formatValueObj(obj) {
    if (!obj) return '-';
    return Object.keys(obj)
      .map((k) => `${obj[k].toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t(k)}`)
      .join('<br />');
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  function calculateBenefit(product) {
    let data = product.benefit ? JSON.parse(product.benefit) : null;
    if (!data) {
      product.calculated_benefit = 0;
      return 0;
    }
    let balance = data.balance || {};
    let output = 0;
    const totalBuyPrice = product.buy_price * Number(product.quantity || 0);
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }

      output += amount;
    });
    product.calculated_benefit = totalBuyPrice + output;
    return totalBuyPrice + output;
  }
  let totalBenefit = {};
  async function calculateTotalBenefit() {
    totalBenefit = {};
    let count = {};
    products.forEach((p) => {
      const benefit = Number(calculateBenefit(p));
      if (totalBenefit[p.buy_currency]) {
        totalBenefit[p.buy_currency] += benefit;
      } else {
        totalBenefit[p.buy_currency] = benefit;
      }
    });
    return totalBenefit;
  }
  async function calculatePredictedBenefit(product) {
    let data = product.benefit ? JSON.parse(product.benefit) : null;
    if (!data) {
      product.calculated_predicted_benefit = 0;
      return 0;
    }
    let balance = data.balance || {};
    let output = 0;
    let totalSellPrice = product.sell_price * Number(product.quantity || 0);
    if (product.sell_currency != product.buy_currency) {
      totalSellPrice = exchangeRate(totalSellPrice, product.sell_currency, product.buy_currency);
    }
    Object.entries(balance).forEach(([currency, amount]) => {
      if (currency != product.buy_currency) {
        amount = exchangeRate(amount, currency, product.buy_currency);
      }

      output += amount;
    });
    product.calculated_predicted_benefit = totalSellPrice + output;
    return totalSellPrice + output;
  }
  let totalPredictedBenefit = {};
  async function calculateTotalPredictedBenefit() {
    totalPredictedBenefit = {};
    for (const p of products) {
      const benefit = await calculatePredictedBenefit(p);
      if (totalPredictedBenefit[p.buy_currency]) {
        totalPredictedBenefit[p.buy_currency] += benefit;
      } else {
        totalPredictedBenefit[p.buy_currency] = benefit;
      }
    }
    return totalPredictedBenefit;
  }
</script>

<div class="container-fluid my-4">
  <!-- Header -->

  <div class="mb-4 d-flex gap-3 flex-wrap">
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Total Services')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {products.length.toLocaleString()}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box me-2 text-primary"></i>{t('Total Expense Rate')}</small>
      </div>
      <div class="card-body p-2">
        <small class=" text-center fw-bold d-block">
          {@html formatValueObj(totalPurchaseCostMap)}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-shop me-2 text-success"></i>{t('Total Sale Rate')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {@html formatValueObj(totalSaleValueMap)}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Current Benefit')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {@html formatValueObj(totalBenefit)}
        </small>
      </div>
    </div>
    <div class="card">
      <div class="card-header py-2">
        <small><i class="bi bi-box-seam me-2 text-success"></i>{t('Predicted Benefit')}</small>
      </div>
      <div class="card-body p-2">
        <small class="text-center fw-bold d-block">
          {@html formatValueObj(totalPredictedBenefit)}
        </small>
      </div>
    </div>
  </div>

  <!-- Card Container -->
  <div class="card shadow-sm rounded-lg border-0">
    <!-- Toolbar -->
    <div class="card-header bg-body-tertiary border-bottom p-3">
      <div class="row g-2 align-items-center">
        <!-- Search -->
        <div class="col-md-2">
          <input
            type="text"
            id="product-search"
            class="form-control form-control-sm me-3"
            placeholder={t('Search products...')}
            bind:value={searchTerm} />
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm me-3" bind:value={filterCategory}>
            <option value="all">{t('All Categories')}</option>
            {#each categories as cat}
              <option value={cat.id}>{cat.name}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-2">
          {#if _translate_org_type == 'exchange'}
            <select class="form-select form-select-sm me-3" bind:value={filterCurrency}>
              <option value="all">{t('All Currencies')}</option>
              {#each currencies as cur}
                <option value={cur.code}>{t(cur.code)}</option>
              {/each}
            </select>
          {/if}
          <select class="form-select form-select-sm me-3" bind:value={filterDepartment}>
            <option value="all">{t('All Departments')}</option>
            {#each departments as dept}
              <option value={dept.id}>{dept.name}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-2">
          <select class="form-select form-select-sm me-3" bind:value={filterUser}>
            <option value="all">{t('All Users')}</option>
            {#each users as user}
              <option value={user.id}
                >{user.first_name ? user.first_name + ' ' + user.last_name : user.username}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-2">
          <select class="form-select form-select-sm me-2" bind:value={itemsPerPage}>
            <option value={5}>5 {t('per page')}</option>
            <option value={10}>10 {t('per page')}</option>
            <option value={20}>20 {t('per page')}</option>
            <option value={50}>50 {t('per page')}</option>
            <option value={100}>100 {t('per page')}</option>
            <option value={250}>250 {t('per page')}</option>
          </select>
        </div>

        <div class="col-md-2">
          <button
            class="btn btn-success btn-sm px-1 w-100"
            on:click={() => {
              openNewProduct('service');
            }}>
            <i class="bi bi-plus-circle"></i>
            {t('New Service')}
          </button>

          <button
            disabled={calculatingStock}
            class="btn btn-danger btn-sm mt-2 w-100 {(shiftPressed && ctrlPressed) || calculatingStock ? '' : 'd-none'}"
            on:click={async () => {
              if (confirm(t('Are you sure you want to recalculate stock for all products? This may take a while.'))) {
                calculatingStock = true;
                await calculateAllStocks();
                calculatingStock = false;
                loadAll();
              }
            }}>
            {@html calculatingStock
              ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">Loading...</span>
</div>
`
              : `<i class="bi bi-plus-circle me-2"></i>` + t('Calculate All Products Stock')}
          </button>
        </div>
      </div>
    </div>

    <!-- Table Body -->
    <div class="card-body p-0">
      {#if loading}
        <div class="text-center p-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">{t('Loading...')}</span>
          </div>
          <p class="mt-2 text-muted">{t('Loading...')}</p>
        </div>
      {:else if filteredProducts.length === 0}
        <div class="text-center p-5">
          <i class="bi bi-inbox fs-1 text-muted"></i>
          <p class="mt-2 text-muted">{t('No products found.')}</p>
        </div>
      {:else}
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th class="ps-4 cursor-pointer" on:click={() => setSort('id')}>
                  {t('ID')}
                  {#if sortColumn === 'id'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                <th class="ps-4 cursor-pointer" on:click={() => setSort('department_id')}>
                  {t('Department')}
                  {#if sortColumn === 'department_id'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                <th class="cursor-pointer" on:click={() => setSort('name')}>
                  {t('Service')}
                  {#if sortColumn === 'name'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>

                <th class="ps-4 cursor-pointer" on:click={() => setSort('user_id')}>
                  {t('User')}
                  {#if sortColumn === 'user_id'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>
                {#if _translate_org_type == 'exchange'}
                  <th class="cursor-pointer" on:click={() => setSort('currency')}>
                    {t('Currency')}
                    {#if sortColumn === 'currency'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                    {/if}
                  </th>
                {/if}
                <th class="text-center">{t('Category')}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('quantity')}>
                  {t('Quantity')}
                  {#if sortColumn === 'quantity'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>

                {#if enable_expiry_date}
                  <th class="text-center">{t('Expiry Date')}</th>
                {/if}
                <th class="text-center">{t('Cost')}</th>
                <th class="text-center">{t('Sale')}</th>
                <th class="text-center cursor-pointer" on:click={() => setSort('calculated_benefit')}
                  >{t('Benefit')}

                  {#if sortColumn === 'calculated_benefit'}
                    <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} ms-1"></i>
                  {/if}
                </th>

                <th class="text-center pe-4">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each paginatedProducts as product (product.id)}
                <tr class="">
                  <td class="ps-4 text-muted small">{shortID(product.id)}</td>

                  <td class="ps-4 small">{departments.find((d) => d.id === product.department_id)?.name || ''}</td>

                  <td class="">
                    {#if product.thumbnailUrl != '/img/no-image.png'}<img
                        src={product.thumbnailUrl}
                        alt=""
                        class="rounded-circle shadow-sm float-start"
                        width="40"
                        height="40"
                        style="object-fit: cover; border: 2px solid white;" />
                    {/if}
                    <div>
                      <button
                        class="btn btn-link text-primary fw-bold btn-sm px-1"
                        on:click={() => push(`/dashboard/product/${product.id}`)}>{product.name}</button>
                      {#if product.description}
                        <small class="text-muted d-none d-md-block">{product.description.substring(0, 30)}...</small>
                      {/if}
                    </div>
                  </td>

                  <td class="ps-4 small">{getUserName(users.find((d) => d.id === product.user_id)) || ''}</td>

                  {#if _translate_org_type == 'exchange'}
                    <td class="text-center">{t(product.currency || '')}</td>
                  {/if}
                  <td class="text-center">{getCategoryName(product.category_id)}</td>
                  <td class="text-center">
                    {@html getStockBadge(
                      Number(product.quantity || 0) * -1 || 0,
                      getUnitName(product.product_unit_id),
                      product.alarm_quantity,
                    )}
                  </td>

                  {#if enable_expiry_date}
                    <th class="text-center">{product.expiry_date}</th>
                  {/if}
                  <td class="text-center">
                    <span class="font-weight-bold"
                      >{Number(product.buy_price).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}&nbsp;{t(product.buy_currency)}</span>
                  </td>
                  <td class="text-center">
                    <span class="font-weight-bold text-primary"
                      >{Number(product.sell_price).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}&nbsp;{t(product.sell_currency)}</span>
                  </td>
                  <td class="text-center">
                    <div class="badge badge-{product.calculated_benefit < 0 ? 'danger' : 'success'}">
                      <span dir="ltr"
                        >{product.calculated_benefit.toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                          minimumFractionDigits: 2,
                        })}</span>
                      {t(product.buy_currency) || ''}
                    </div>
                  </td>

                  <td class="text-center pe-4">
                    <button
                      class="btn btn-sm btn-outline-primary me-1"
                      on:click={() => push(`/dashboard/product/${product.id}`)}
                      title="View"><i class="bi bi-eye"></i></button>
                    <button
                      class="btn btn-sm btn-outline-secondary me-1 {shiftPressed && ctrlPressed ? '' : 'd-none'}"
                      on:click={async () => {
                        await calculateProductStock(product.id, 'single');
                        loadAll();
                      }}>
                      <i class="bi bi-calculator"></i>
                    </button>
                    <button
                      class="btn btn-sm btn-outline-secondary me-1 {shiftPressed && ctrlPressed ? '' : 'd-none'}"
                      on:click={async () => {
                        await moveToProducts(product.id);
                      }}>
                      <i class="bi bi-arrow-right"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => editExistingProduct(product)}>
                      <i class="bi bi-pencil"></i>
                    </button>
                    <!-- <button
                      class="btn btn-sm btn-outline-danger"
                      on:click={() => deleteProduct(product.id)}
                    >
                      <i class="bi bi-trash"></i>
                    </button> -->
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Pagination Footer -->
    {#if !loading && filteredProducts.length > 0}
      <div class="card-footer bg-body-tertiary d-flex justify-content-between align-items-center pt-3 overflow-x-auto">
        <div class="text-muted small">
          {t('Showing')}
          {(currentPage - 1) * itemsPerPage + 1}
          {t('to')}
          {Math.min(currentPage * itemsPerPage, filteredProducts.length)}
          {t('of')}
          {filteredProducts.length}
          {t('entries')}
        </div>
        <nav>
          <ul class="pagination pagination-circle pagination-sm mb-0">
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage = 1)}>
                <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
              </button>
            </li>
            <li class="page-item" class:disabled={currentPage === 1}>
              <button class="page-link" on:click={() => (currentPage -= 1)}>
                <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'right' : 'left'}"></i>
              </button>
            </li>

            {#each getPageNumbers(currentPage, totalPages) as pageNum, idx (pageNum === '...' ? `dot-${idx}` : pageNum)}
              {#if pageNum === '...'}
                <li class="page-item disabled">
                  <span class="page-link">...</span>
                </li>
              {:else}
                <li class="page-item" class:active={currentPage === pageNum}>
                  <button class="page-link" on:click={() => (currentPage = pageNum)}>{pageNum}</button>
                </li>
              {/if}
            {/each}

            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage += 1)}>
                <i class="bi bi-chevron-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
              </button>
            </li>
            <li class="page-item" class:disabled={currentPage === totalPages || totalPages === 0}>
              <button class="page-link" on:click={() => (currentPage = totalPages)}>
                <i class="bi bi-chevron-double-{t('dir') === 'rtl' ? 'left' : 'right'}"></i>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    {/if}
  </div>
</div>

<ProductModal
  bind:this={goodModal}
  {categories}
  {units}
  {unitCategories}
  {warehouses}
  type="product"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={onProductSaved} />

<ProductModal
  bind:this={serviceModal}
  {categories}
  {units}
  {unitCategories}
  {warehouses}
  type="service"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={onProductSaved} />

<OpenFoodAPIModal bind:this={openFoodAPIModalRef} on:productSelected={(e) => {}} />

<style>
  /* MDBootstrap specific tweaks */
  .cursor-pointer {
    cursor: pointer;
  }

  /* Custom Badge Styles (MDB Inspired) */
  /* :global(.badge-success) {
    background-color: #00b074 !important;
  }

  :global(.badge-warning) {
    background-color: #ffbb33 !important;
    color: #000 !important;
  }

  :global(.badge-danger) {
    background-color: #ff3547 !important;
  } */

  .pagination-circle .page-link {
    border-radius: 50% !important;
    margin-left: 3px;
    margin-right: 3px;
    border: none;
  }
</style>
