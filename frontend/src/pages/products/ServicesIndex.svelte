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
  import { t, lang, translate_org_type, shortID, settings_all } from '../../i18n/i18n.js';
  import { push } from 'svelte-spa-router';
  import { resolveMediaUrl } from '../../lib/mediaUrl.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';

  import { calculateAllStocks, calculateProductStock } from '../stocktransactions/calculateStock.js';
  import { currencyApi } from '../../api/currencyApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { userApi } from '../../api/userApi.js';

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
  let loading = true;
  let totalItems = 0;
  let totalPages = 0;
  let showSummary = true;

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

  function getServiceDuration(service) {
    const duration = Number(service.service_duration) || 0;
    if (!duration) return '—';

    return `${duration.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t(
      service.service_duration_unit || 'minute',
    )}`;
  }

  function formatAmount(value) {
    return Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 3,
      minimumFractionDigits: 2,
    });
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
      users = (await (await userApi.getAll({ status: 1 }))?.data) || [];

      await calculateTotalBenefit();
      await calculateTotalPredictedBenefit();
      await calculatePriceMap();
      const pageIds = products.map((p) => p.id).filter(Boolean);
      const images =
        (await productImageApi.getAll({
          status: 1,
          product_ids: pageIds.join(','),
        }))?.data || [];
      const imageByProductId = new Map(images.map((img) => [Number(img.product_id), img]));
      for (let product of products) {
        const img = imageByProductId.get(Number(product.id)) || null;
        product.thumbnailUrl = resolveMediaUrl(img?.thumbnail, '/img/no-image.png');
      }
    } catch (e) {
      console.error('Error loading services:', e);
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

  function openNewProduct() {
    push('/dashboard/service-form/new');
  }

  function editExistingProduct(product) {
    push(`/dashboard/service-form/${product.id}`);
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

  // --- Toolbar ---

  $: serviceToolbarFilters = [
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      options: [
        { value: 'all', label: t('All') },
        { value: 'active', label: t('Active') },
        { value: 'inactive', label: t('Inactive') },
      ],
    },
    {
      key: 'category',
      label: t('Category'),
      value: filterCategory,
      options: [{ value: 'all', label: t('All') }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))],
    },
    {
      key: 'department',
      label: t('Department'),
      value: filterDepartment,
      options: [{ value: 'all', label: t('All') }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
    },
    {
      key: 'user',
      label: t('User'),
      value: filterUser,
      options: [{ value: 'all', label: t('All') }, ...users.map((u) => ({ value: u.id, label: getUserName(u) }))],
    },
    {
      key: 'currency',
      label: t('Currency'),
      value: filterCurrency,
      visible: _translate_org_type == 'exchange',
      options: [
        { value: 'all', label: t('All') },
        ...currencies.map((cur) => ({ value: cur.code, label: t(cur.code) })),
      ],
    },
  ];

  function handleToolbarFilterChange(event) {
    const { key, value } = event.detail;
    if (key === 'status') filterStatus = value;
    if (key === 'category') filterCategory = value;
    if (key === 'department') filterDepartment = value;
    if (key === 'user') filterUser = value;
    if (key === 'currency') filterCurrency = value;
    if (currentPage !== 1) currentPage = 1;
  }

  function resetFilters() {
    searchTerm = '';
    filterCategory = 'all';
    filterBrand = 'all';
    filterCurrency = 'all';
    filterGeneric = 'all';
    filterDepartment = 'all';
    filterUser = 'all';
    filterStatus = 'active';
    currentPage = 1;
    loadAll();
  }

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
    return categories.find((c) => c.id === id)?.name || '—';
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
      const products = [...(activeProducts?.data || []), ...(deletedProducts?.data || [])];
      const warehouses = await Promise.all([warehouseApi.getAll({ status: 1 }), warehouseApi.getAll({ status: 0 })]).then(
        ([active, deleted]) => [...(active?.data || []), ...(deleted?.data || [])],
      );
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
    if (!obj) return '—';
    const keys = Object.keys(obj);
    if (!keys.length) return '—';
    return keys
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

<IndexPageLayout
  dir={t('dir')}
  ariaLabel={t('Services')}
  toolbarWidth="28rem"
  showStats={showSummary}
  showExtra={shiftPressed && ctrlPressed}
  showFooter={!loading && totalItems > 0}
  dense={true}
  contentClass="services-index-content"
  tablePadding={true}>
  <svelte:fragment slot="actions">
    <ActionButton icon="bi-plus-lg" label={t('New Service')} on:click={() => openNewProduct()} />

    <button
      type="button"
      class="index-settings-button"
      class:is-active={showSummary}
      aria-label={t('Summary')}
      aria-expanded={showSummary}
      title={t('Summary')}
      on:click={() => (showSummary = !showSummary)}>
      <i class="bi {showSummary ? 'bi-x-lg' : 'bi-clipboard-data'}" aria-hidden="true"></i>
    </button>
  </svelte:fragment>

  <svelte:fragment slot="toolbar">
    <FilterToolbar
      searchValue={searchTerm}
      searchPlaceholder={`${t('Search services...')}`}
      filters={serviceToolbarFilters}
      filterLabel={t('Filter')}
      resetLabel={t('Clear Filters')}
      showReset={true}
      on:searchChange={(event) => {
        searchTerm = event.detail;
        if (currentPage !== 1) currentPage = 1;
      }}
      on:filterChange={handleToolbarFilterChange}
      on:reset={resetFilters} />
  </svelte:fragment>

  <svelte:fragment slot="stats">
    <div class="index-summary-grid services-summary-grid">
      <SummaryCard label={t('Total Services')} icon="bi-briefcase" tone="blue">
        {totalItems.toLocaleString()}
      </SummaryCard>

      <SummaryCard label={t('Total Expense Rate')} icon="bi-bag-check" tone="cyan">
        {@html formatValueObj(totalPurchaseCostMap)}
      </SummaryCard>

      <SummaryCard label={t('Total Sale Rate')} icon="bi-shop" tone="green">
        {@html formatValueObj(totalSaleValueMap)}
      </SummaryCard>

      <SummaryCard label={t('Current Benefit')} icon="bi-graph-up-arrow" tone="amber">
        {@html formatValueObj(totalBenefit)}
      </SummaryCard>

      <SummaryCard label={t('Predicted Benefit')} icon="bi-stars" tone="purple">
        {@html formatValueObj(totalPredictedBenefit)}
      </SummaryCard>
    </div>
  </svelte:fragment>

  <svelte:fragment slot="extra">
    <ActionButton
      variant="secondary"
      icon="bi-calculator"
      label={t('Calculate All Products Stock')}
      loading={calculatingStock}
      disabled={calculatingStock}
      on:click={async () => {
        if (confirm(t('Are you sure you want to recalculate stock for all products? This may take a while.'))) {
          calculatingStock = true;
          await calculateAllStocks();
          calculatingStock = false;
          loadAll();
        }
      }} />
  </svelte:fragment>

  {#if loading}
    <div class="index-table-state">
      <EmptyState loading message={t('Loading...')} />
    </div>
  {:else if filteredProducts.length === 0}
    <div class="index-table-state">
      <EmptyState icon="bi-inbox" message={t('No services found.')} />
    </div>
  {:else}
    <DataTable
      ariaLabel={t('Services')}
      minWidth="980px"
      dense={true}
      striped={true}
      hover={false}
      stickyHeader={true}
      layout="fixed"
      scrollbar="thin">
      <svelte:fragment slot="head">
        <tr>
          <th class="col-start">#</th>
          <th class="col-start cursor-pointer" on:click={() => setSort('name')}>
            {t('Service')}
            {#if sortColumn === 'name'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('department_id')}>
            {t('Department')}
            {#if sortColumn === 'department_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('user_id')}>
            {t('User')}
            {#if sortColumn === 'user_id'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Category')}</th>
          <th>{t('Duration')}</th>
          {#if _translate_org_type == 'exchange'}
            <th class="cursor-pointer" on:click={() => setSort('currency')}>
              {t('Currency')}
              {#if sortColumn === 'currency'}
                <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
              {/if}
            </th>
          {/if}
          <th class="cursor-pointer" on:click={() => setSort('buy_price')}>
            {t('Cost')}
            {#if sortColumn === 'buy_price'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('sell_price')}>
            {t('Sale')}
            {#if sortColumn === 'sell_price'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th class="cursor-pointer" on:click={() => setSort('calculated_benefit')}>
            {t('Benefit')}
            {#if sortColumn === 'calculated_benefit'}
              <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
            {/if}
          </th>
          <th>{t('Actions')}</th>
        </tr>
      </svelte:fragment>

      {#each paginatedProducts as service, index (service.id)}
        <tr>
          <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>

          <td>
            <div class="service-cell">
              {#if service.thumbnailUrl && service.thumbnailUrl !== '/img/no-image.png'}
                <img class="service-thumb" src={service.thumbnailUrl} alt="" loading="lazy" />
              {:else}
                <span class="service-thumb service-thumb--icon" aria-hidden="true">
                  <i class="bi bi-briefcase"></i>
                </span>
              {/if}

              <span class="service-meta">
                <button
                  type="button"
                  class="service-name-btn"
                  title={service.name}
                  on:click={() => push(`/dashboard/product/${service.id}`)}>
                  {service.name}
                </button>

                {#if service.code}
                  <small class="service-code">{service.code}</small>
                {/if}
              </span>
            </div>
          </td>

          <td class="small">{departments.find((d) => d.id === service.department_id)?.name || '—'}</td>

          <td class="small">{getUserName(users.find((u) => u.id === service.user_id)) || '—'}</td>

          <td>
            <StatusBadge tone="neutral" ghost>{getCategoryName(service.category_id)}</StatusBadge>
          </td>

          <td>
            <span class="service-duration">{getServiceDuration(service)}</span>
          </td>

          {#if _translate_org_type == 'exchange'}
            <td>
              <StatusBadge tone="info">{t(service.currency || '')}</StatusBadge>
            </td>
          {/if}

          <td>
            <span class="amount-pill">
              <span dir="ltr">{formatAmount(service.buy_price)}</span>
              {t(service.buy_currency || '')}
            </span>
          </td>

          <td>
            <span class="amount-pill is-sale">
              <span dir="ltr">{formatAmount(service.sell_price)}</span>
              {t(service.sell_currency || '')}
            </span>
          </td>

          <td>
            <StatusBadge tone={Number(service.calculated_benefit || 0) < 0 ? 'negative' : 'positive'}>
              <span dir="ltr">{formatAmount(service.calculated_benefit)}</span>
              {t(service.buy_currency || '')}
            </StatusBadge>
          </td>

          <td>
            <TableActions
              actions={[
                {
                  icon: 'bi-eye',
                  label: t('View'),
                  tone: 'view',
                  onClick: () => push(`/dashboard/product/${service.id}`),
                },
                {
                  icon: 'bi-pencil',
                  label: t('Edit'),
                  tone: 'edit',
                  onClick: () => editExistingProduct(service),
                },
                ...(shiftPressed && ctrlPressed
                  ? [
                      {
                        icon: 'bi-calculator',
                        label: t('Calculate stock'),
                        tone: 'muted',
                        onClick: async () => {
                          await calculateProductStock(service.id, 'single');
                          loadAll();
                        },
                      },
                      {
                        icon: 'bi-arrow-right',
                        label: t('Move to products'),
                        tone: 'muted',
                        onClick: async () => {
                          await moveToProducts(service.id);
                        },
                      },
                    ]
                  : []),
              ]} />
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
      ariaLabel={t('Services pagination')}
      rowLabel={t('rows')}
      on:perPageChange={(event) => {
        itemsPerPage = Number(event.detail);
        currentPage = 1;
      }}
      {getPageNumbers} />
  </svelte:fragment>
</IndexPageLayout>

<style>
  .cursor-pointer {
    cursor: pointer;
  }

  .cell-muted {
    color: #94a3b8;
  }

  .service-cell {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    text-align: start;
  }

  .service-thumb {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border: 1px solid #e5edf6;
    border-radius: 9px;
    background: #f8fafc;
    object-fit: cover;
  }

  .service-thumb--icon {
    display: inline-grid;
    place-items: center;
    color: #93a5bd;
    font-size: 0.95rem;
  }

  .service-meta {
    display: grid;
    gap: 1px;
    min-width: 0;
    text-align: start;
  }

  .service-name-btn {
    padding: 0;
    border: 0;
    background: transparent;
    color: #0f6efd;
    font: inherit;
    font-weight: 750;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .service-name-btn:hover {
    text-decoration: underline;
  }

  .service-code {
    color: #94a3b8;
    font-size: 0.7rem;
    direction: ltr;
    text-align: start;
  }

  .service-duration {
    color: #475569;
    font-weight: 650;
    white-space: nowrap;
  }

  .amount-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    color: #334155;
    font-weight: 750;
    white-space: nowrap;
  }

  .amount-pill.is-sale {
    color: #0f6efd;
  }

  :global(.index-statistics .services-summary-grid) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  :global(html.dark) .service-name-btn {
    color: #93c5fd;
  }

  :global(html.dark) .service-duration,
  :global(html.dark) .amount-pill {
    color: var(--erp-text, #e5edf9);
  }

  :global(html.dark) .amount-pill.is-sale {
    color: #93c5fd;
  }

  @media (max-width: 1199.98px) {
    :global(.index-statistics .services-summary-grid) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 767.98px) {
    :global(.index-statistics .services-summary-grid) {
      grid-template-columns: 1fr;
    }
  }
</style>
