<script>
  import { onMount, onDestroy } from 'svelte';
import { productImageApi } from '../../api/productImageApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import { productBrandApi } from '../../api/productBrandApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { productCategoryApi } from '../../api/productCategoryApi.js';
  import ProductModal from './ProductModal.svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import OpenFoodAPIModal from './OpenFoodAPIModal.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import SummaryCard from '../../components/common/SummaryCard.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
  import StatusBadge from '../../components/common/StatusBadge.svelte';
  import PaginationBar from '../../components/common/PaginationBar.svelte';
  import EmptyState from '../../components/common/EmptyState.svelte';
  import TableActions from '../../components/common/TableActions.svelte';
  import IndexPageLayout from '../../lib/components/index/IndexPageLayout.svelte';
  import { getCachedImage, cacheImage } from './imageCache.js';
  import { DEFAULT_PAGE_SIZE, readListMeta } from '../../lib/pagination.js';

  import { auth } from '../../auth/authStore';
  $: permissions = $auth.permissions;

  import { resolveMediaUrl } from '../../lib/mediaUrl.js';

  let openFoodAPIModalRef;

  import { toast } from '../../ToastUI/toast.js';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { saleItemApi } from '../../api/saleItemApi.js';

  import {
    calculateAllStocks,
    resolveInventoryMethod,
  } from '../stocktransactions/calculateStock.js';

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
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });
  // --- State ---
  let products = [];
  let s = false;
  let categories = [];
  let brands = [];
  let generics = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let totalProfitMap = {};
  let loading = true;
  let totalItems = 0;
  let totalPages = 0;
  let lookupsLoaded = false;
  let searchDebounceTimer = null;
  let loadRequestId = 0;
  let bootstrapped = false;
  let lastPageKey = '';

  let goodModal;
  let serviceModal;

  // --- Table State ---
  let searchTerm = '';
  let filterCategory = 'all';
  let filterBrand = 'all';
  let filterCurrency = 'all';
  let filterGeneric = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc'; // 'asc' or 'desc'

  // --- Helper Functions ---
  function getStockTone(qty, alarm_quantity) {
    if (qty <= 0) return 'negative';
    if (qty < alarm_quantity) return 'warning';
    return 'positive';
  }

  function getExpiryTone(expiryDate) {
    if (!expiryDate) return 'neutral';

    const parsedDate = new Date(expiryDate);
    if (Number.isNaN(parsedDate.getTime())) return 'neutral';

    const now = new Date();
    const diffDays = Math.ceil((parsedDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'negative';
    if (diffDays <= 30) return 'warning';
    return 'info';
  }

  function formatQty(qty) {
    return qty.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function getStockBadge(qty, unitName, alarm_quantity) {
    let cls = 'badge-success';
    if (qty <= 0) {
      cls = 'badge-danger';
    } else if (qty < alarm_quantity) {
      cls = 'badge-warning';
    }
    return `<span class="badge ${cls}"><span dir='ltr'>${qty.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })}</span> ${unitName}</span>`;
  }

  function getProductGroupKey(product) {
    return [
      String(product?.name || '').trim().toLowerCase(),
      product?.category_id || '',
      product?.product_unit_id || '',
    ].join('|');
  }

  function getProductBatchValue(product) {
    return String(product?.batch || product?.batch_number || '').trim();
  }

  function getProductGroupIds(product) {
    return Array.isArray(product?.product_group_ids) && product.product_group_ids.length
      ? product.product_group_ids
      : [product?.id].filter(Boolean);
  }

  function getNearestExpiryDate(group) {
    return group
      .map((product) => product.expiry_date)
      .filter(Boolean)
      .sort((first, second) => new Date(first).getTime() - new Date(second).getTime())[0] || null;
  }

  function groupProductRows(rows) {
    const groups = new Map();

    rows.forEach((product) => {
      const groupKey = getProductGroupKey(product);
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(product);
    });

    return Array.from(groups.values()).map((group) => {
      const sortedGroup = [...group].sort((first, second) => {
        const firstCreated = new Date(first.created_at || 0).getTime();
        const secondCreated = new Date(second.created_at || 0).getTime();
        if (firstCreated !== secondCreated) return firstCreated - secondCreated;
        return Number(first.id || 0) - Number(second.id || 0);
      });
      const representative = sortedGroup.find((product) => !getProductBatchValue(product)) || sortedGroup[0];
      const activeProducts = group.filter((product) => product.product_status !== 'archived');
      const totalQuantity = group.reduce((sum, product) => sum + toNumber(product.quantity), 0);

      return {
        ...representative,
        quantity: totalQuantity,
        product_status: activeProducts.length ? 'active' : 'archived',
        expiry_date: getNearestExpiryDate(group) || representative.expiry_date,
        product_group_key: getProductGroupKey(representative),
        product_group_ids: group.map((product) => product.id),
        batch_count: group.filter((product) => getProductBatchValue(product)).length,
        variant_count: group.length,
      };
    });
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
      const qty = parseFloat(p.quantity) || 0;
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

  function subtractValueMaps(saleMap = {}, purchaseMap = {}) {
    const result = {};
    const currencies = new Set([...Object.keys(saleMap), ...Object.keys(purchaseMap)]);
    currencies.forEach((currency) => {
      const value = (toNumber(saleMap[currency]) || 0) - (toNumber(purchaseMap[currency]) || 0);
      if (value !== 0) result[currency] = value;
    });
    return result;
  }

  async function loadLookups() {
    if (lookupsLoaded) return;
    const [
      categoriesRes,
      brandResponse,
      genericResponse,
      unitsRes,
      currenciesRes,
      warehousesRes,
    ] = await Promise.all([
      productCategoryApi.getAll({ status: 1 }),
      productBrandApi.getAll({ status: 1 }),
      productGenericApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 1 }),
    ]);
    categories = categoriesRes?.data || [];
    brands = brandResponse?.data || [];
    generics = genericResponse?.data || [];
    units = unitsRes?.data || [];
    currencies = currenciesRes?.data || [];
    warehouses = warehousesRes?.data || [];
    warehouse_products = [];
    lookupsLoaded = true;
  }

  async function loadAll() {
    const requestId = ++loadRequestId;
    lastPageKey = `${currentPage}|${itemsPerPage}`;
    loading = true;
    try {
      await loadLookups();
      if (requestId !== loadRequestId) return;

      // Active products only; exclude services on the server.
      // Do not load status=0 or all sale_items on initial index load.
      const response = await productApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        exclude_type: 'service',
        page: currentPage,
        limit: itemsPerPage,
      });
      if (requestId !== loadRequestId) return;

      let loadedProducts = response?.data || [];
      const meta = readListMeta(response, loadedProducts.length);
      totalItems = meta.total;
      totalPages = meta.totalPages || Math.ceil(totalItems / itemsPerPage) || 0;

      // Safety filter if exclude_type is ignored by older backends
      loadedProducts = loadedProducts.filter((p) => p.type !== 'service');
      products = groupProductRows(loadedProducts);

      // Skip expensive sale_items profit aggregation on index load
      totalProfitMap = {};

      await calculatePriceMap();
      await calculateTotalBenefit();
      await calculateTotalPredictedBenefit();

      const pageIds = products
        .flatMap((p) => getProductGroupIds(p))
        .filter(Boolean);
      const images =
        (await productImageApi.getAll({
          status: 1,
          product_ids: pageIds.join(','),
        }))?.data || [];
      if (requestId !== loadRequestId) return;

      const imageByProductId = new Map(
        images.map((img) => [Number(img.product_id), img]),
      );
      for (let product of products) {
        const img =
          imageByProductId.get(Number(product.id)) ||
          getProductGroupIds(product)
            .map((id) => imageByProductId.get(Number(id)))
            .find(Boolean) ||
          null;
        product.thumbnailUrl = resolveMediaUrl(img?.thumbnail, '/img/no-image.png');
      }
    } catch (e) {
      console.error('Error loading products:', e);
    } finally {
      if (requestId === loadRequestId) loading = false;
    }
  }

  function scheduleSearchReload() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      if (currentPage !== 1) currentPage = 1;
      else loadAll();
    }, 300);
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    try {
      /*
       * Validate and cache the real organization inventory method before
       * allowing CLASSIC/FIFO/LIFO stock calculations.
       */
      await resolveInventoryMethod();
    } catch (error) {
      console.error(
        'Could not resolve inventory method:',
        error,
      );
    }

    lastPageKey = `${currentPage}|${itemsPerPage}`;
    bootstrapped = true;
    await loadAll();
  });

  // Reload on page / page-size changes
  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    const key = `${currentPage}|${itemsPerPage}`;
    if (key !== lastPageKey) {
      lastPageKey = key;
      loadAll();
    }
  }

  // --- Actions ---
  async function deleteProduct(id) {
    if (confirm(t('Are you sure you want to delete this product?'))) {
      const product = products.find((p) => p.id === id);
      const ids = getProductGroupIds(product);
      await Promise.all(
        ids.map((productId) => productApi.remove(productId)),
      );
      loadAll();
    }
  }

  function openNewProduct(type = 'product') {
    if (type === 'service') {
      serviceModal.openModal();
      return;
    }
    push('/dashboard/product-form/new');
  }

  function editExistingProduct(product) {
    if (product?.type === 'service') {
      serviceModal.editProduct(product);
    } else {
      push(`/dashboard/product-form/${product.id}`);
    }
  }

  function onProductSaved(e) {
    loadAll();
    console.log('Product saved event received:', e.detail);
    if (e.detail.save_type === 'again') {
      setTimeout(() => {
        openNewProduct(); // Open new product modal after saving to allow quick entry of multiple products
      }, 500);
    }
  }

  // --- Computed Data (Filter, Sort, Pagination) ---
  // Use a reactive statement to filter and sort the products list

  // Client filters apply to the current server page only (category/brand/etc.).
  $: filteredProducts = (() => {
    let result = products;

    // 1. Filter Status
    if (filterStatus === 'active') {
      result = result.filter((p) => (p.product_status ? p.product_status === 'active' : true));
    } else if (filterStatus === 'archived') {
      result = result.filter((p) => p.product_status === 'archived');
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

    // Search is server-side; keep light local match only if needed for grouped rows

    // 4. Sort
    result = result.slice().sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  })();

  // Server already paginated — display page rows directly
  $: paginatedProducts = filteredProducts;
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

  function getProductUnitParts(product) {
    try {
      return JSON.parse(product.benefit || '{}')?.unit_parts || [];
    } catch (e) {
      return [];
    }
  }

  let showUnitParts = false;

  function productStatusLabel(status) {
    if (status === 'active') return t('Active');
    if (status === 'archived') return t('Archived');
    return t(status);
  }

  $: productToolbarFilters = [
    {
      key: 'category',
      label: t('Category'),
      value: filterCategory,
      options: [{ value: 'all', label: t('All') }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))],
    },
    {
      key: 'status',
      label: t('Status'),
      value: filterStatus,
      options: [
        { value: 'all', label: t('All') },
        { value: 'active', label: t('Active') },
        { value: 'archived', label: t('Archived') },
      ],
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
    {
      key: 'generic',
      label: t('Generic'),
      value: filterGeneric,
      visible: enable_generics,
      options: [
        { value: 'all', label: t('All') },
        ...generics.map((generic) => ({ value: generic.id, label: generic.name })),
      ],
    },
    {
      key: 'brand',
      label: t('Brand'),
      value: filterBrand,
      visible: enable_brands,
      options: [{ value: 'all', label: t('All') }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))],
    },
  ];

  // Reset pagination when filters change
  $: if (filterCategory || filterStatus || filterBrand || filterCurrency || filterGeneric) {
    // local filters only — do not reset server page aggressively
  }

  function handleToolbarFilterChange(e) {
    const { key, value } = e.detail;
    if (key === 'category') filterCategory = value;
    if (key === 'currency') filterCurrency = value;
    if (key === 'generic') filterGeneric = value;
    if (key === 'brand') filterBrand = value;
    if (key === 'status') filterStatus = value;
  }

  function resetFilters() {
    searchTerm = '';
    filterCategory = 'all';
    filterBrand = 'all';
    filterCurrency = 'all';
    filterGeneric = 'all';
    filterStatus = 'active';
    currentPage = 1;
    loadAll();
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
    const totalAfn = Object.entries(obj).reduce((sum, [currency, amount]) => {
      return sum + toNumber(exchangeRate(toNumber(amount), currency, 'AFN'));
    }, 0);
    return `${totalAfn.toLocaleString(undefined, { maximumFractionDigits: 3, minimumFractionDigits: 2 })} ${t('AFN')}`;
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
  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isWarehouseBalance(balance) {
    if (!balance || typeof balance !== 'object') return false;
    const keys = Object.keys(balance);
    if (!keys.length) return false;
    return keys.every((key) => /^\d+$/.test(String(key)));
  }

  function getProductQty(
    product,
    benefitData = null,
  ) {
    /*
     * products.quantity is the canonical stock written by the
     * method-aware recalculation. A zero or negative value is valid and
     * must not be replaced with stale benefit.balance data.
     */
    const rawQuantity = Number(
      product?.quantity,
    );

    if (Number.isFinite(rawQuantity)) {
      return rawQuantity;
    }

    const warehouseBalance =
      benefitData?.balance;

    if (
      isWarehouseBalance(warehouseBalance)
    ) {
      return Object.values(
        warehouseBalance,
      ).reduce(
        (sum, value) =>
          sum + toNumber(value),
        0,
      );
    }

    return 0;
  }

  function calculateBenefit(product) {
    let benefitData = null;
    try {
      benefitData = product.benefit ? JSON.parse(product.benefit) : null;
    } catch {
      benefitData = null;
    }

    const balance = benefitData?.balance || {};
    const qty = getProductQty(product, benefitData);
    const buyPrice = toNumber(product.buy_price);

    if (isWarehouseBalance(balance) || !Object.keys(balance).length) {
      const benefit = buyPrice * qty;
      product.calculated_benefit = benefit;
      return benefit;
    }

    let output = 0;
    const totalBuyPrice = buyPrice * qty;
    Object.entries(balance).forEach(([currency, amount]) => {
      let val = toNumber(amount);
      if (currency !== product.buy_currency) {
        val = toNumber(exchangeRate(val, currency, product.buy_currency));
      }
      output += val;
    });

    const benefit = totalBuyPrice + output;
    product.calculated_benefit = benefit;
    return benefit;
  }
  let totalBenefit = {};
  async function calculateTotalBenefit() {
    totalBenefit = {};
    products.forEach((p) => {
      if (p.product_status !== 'active') return;
      const benefit = toNumber(totalProfitMap[p.id]);
      if (!benefit) return;
      if (totalBenefit[p.buy_currency]) {
        totalBenefit[p.buy_currency] += benefit;
      } else {
        totalBenefit[p.buy_currency] = benefit;
      }
    });
    return totalBenefit;
  }
  async function calculatePredictedBenefit(product) {
    let benefitData = null;
    try {
      benefitData = product.benefit ? JSON.parse(product.benefit) : null;
    } catch {
      benefitData = null;
    }

    const balance = benefitData?.balance || {};
    const qty = getProductQty(product, benefitData);
    const sellPrice = toNumber(product.sell_price);

    if (isWarehouseBalance(balance) || !Object.keys(balance).length) {
      let sellValue = sellPrice * qty;
      if (product.sell_currency && product.buy_currency && product.sell_currency !== product.buy_currency) {
        sellValue = toNumber(exchangeRate(sellValue, product.sell_currency, product.buy_currency));
      }
      product.calculated_predicted_benefit = sellValue;
      return sellValue;
    }

    let output = 0;
    let totalSellPrice = sellPrice * qty;
    if (product.sell_currency !== product.buy_currency) {
      totalSellPrice = toNumber(exchangeRate(totalSellPrice, product.sell_currency, product.buy_currency));
    }

    Object.entries(balance).forEach(([currency, amount]) => {
      let val = toNumber(amount);
      if (currency !== product.buy_currency) {
        val = toNumber(exchangeRate(val, currency, product.buy_currency));
      }
      output += val;
    });

    const benefit = totalSellPrice + output;
    product.calculated_predicted_benefit = benefit;
    return benefit;
  }
  let totalPredictedBenefit = {};
  async function calculateTotalPredictedBenefit() {
    totalPredictedBenefit = subtractValueMaps(totalSaleValueMap, totalPurchaseCostMap);
    return totalPredictedBenefit;
  }

  function changeProductStatus(id, newStatus) {
    if (newStatus === 'archived') {
      const product = products.find((p) => p.id === id);
      if (Number(product.quantity || 0) > 0) {
        toast.error(
          t('Cannot archive product with stock'),
          t('Please reduce the stock to zero before archiving this product.'),
        );
        return;
      }
    }

    toast
      .confirm(t('Are you sure?'), t('Are you sure you want to change the status of this product!'))
      .then(async (result) => {
        if (result) {
          const product = products.find((p) => p.id === id);
          const ids = getProductGroupIds(product);
          await Promise.all(
            ids.map((productId) =>
              productApi.update(productId, {
                product_status: newStatus,
              }),
            ),
          );
          loadAll();
        }
      });
  }
  let showProductStats = false;
</script>

{#if !permissions?.some((p) => p.code === 'Products' && p.view)}
  <h3 class="permission-denied">
    <i class="bi bi-exclamation-triangle"></i>
    {t('Permission denied')}
  </h3>
{:else}
  <IndexPageLayout
    dir={t('dir')}
    ariaLabel={t('Products')}
    toolbarWidth="34rem"
    showStats={showProductStats}
    showExtra={(shiftPressed && ctrlPressed) || s}
    showFooter={!loading && totalItems > 0}
    dense={true}
    contentClass="products-index-content"
    tablePadding={true}>
    <svelte:fragment slot="actions">
      {#if permissions?.some((p) => p.code === 'Products' && p.create)}
        <ActionButton
          class="new-product-button"
          icon="bi-plus-lg"
          label={t('New Product')}
          on:click={() => openNewProduct()} />
      {/if}

      <button
        type="button"
        class="index-settings-button"
        class:is-active={showProductStats}
        aria-label={t('Table settings')}
        aria-expanded={showProductStats}
        aria-controls="product-statistics-panel"
        title={t('Statistics')}
        on:click={() => {
          showProductStats = !showProductStats;
        }}>
        <i class="bi {showProductStats ? 'bi-x-lg' : ' bi-box-seam'}" aria-hidden="true"></i>
      </button>
    </svelte:fragment>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        searchValue={searchTerm}
        searchPlaceholder={t('stock_transactions.search')}
        filters={productToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        showReset={true}
        on:searchChange={(e) => {
          searchTerm = e.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleToolbarFilterChange}
        on:reset={resetFilters} />
    </svelte:fragment>

    <svelte:fragment slot="stats">
      <div id="product-statistics-panel" class="index-summary-grid">
        <SummaryCard label={t('Total Purchase Rate')} icon="bi-bag-check" tone="cyan">
          {@html formatValueObj(totalPurchaseCostMap)}
        </SummaryCard>

        <SummaryCard label={t('Total Sale Rate')} icon="bi-shop" tone="green">
          {@html formatValueObj(totalSaleValueMap)}
        </SummaryCard>

        {#if permissions?.some((p) => p.code === 'Benefit' && p.view)}
          <SummaryCard label={t('Current Benefit')} icon="bi-graph-up-arrow" tone="amber">
            {@html formatValueObj(totalBenefit)}
          </SummaryCard>

          <SummaryCard label={t('Predicted Benefit')} icon="bi-stars" tone="purple">
            {@html formatValueObj(totalPredictedBenefit)}
          </SummaryCard>
        {/if}
      </div>
    </svelte:fragment>

    <svelte:fragment slot="extra">
      <ActionButton
        variant="secondary"
        icon="bi-calculator"
        label={t('Calculate stock')}
        loading={s}
        disabled={s}
        on:click={async () => {
          if (confirm(t('Are you sure you want to recalculate stock for all products? This may take a while.'))) {
            s = true;

            try {
              /*
               * Resolve the method once, then use the same value for all
               * products in this calculation run.
               */
              const inventoryMethod =
                await resolveInventoryMethod();

              await calculateAllStocks(
                inventoryMethod,
              );

              await loadAll();

              toast.success(
                t('Success'),
                t(
                  'Stock recalculated successfully.',
                ),
              );
            } catch (error) {
              console.error(
                'Stock recalculation failed:',
                error,
              );

              toast.error(
                t('Error'),
                error?.message ||
                  t(
                    'Stock recalculation failed.',
                  ),
              );
            } finally {
              s = false;
            }
          }
        }} />
    </svelte:fragment>

        {#if loading}
          <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if filteredProducts.length === 0}
          <div class="index-table-state">
            <EmptyState icon="bi-inbox" message={t('No products found.')} />
          </div>
        {:else}
          <DataTable
            ariaLabel={t('Products')}
            minWidth="900px"
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
                  <span class="sortable-heading">
                    {t('Product')}

                    {#if sortColumn === 'name'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                <th>{t('Category')}</th>

                <th class="col-start cursor-pointer" on:click={() => setSort('quantity')}>
                  <span class="sortable-heading">
                    {t('Stock')}

                    {#if sortColumn === 'quantity'}
                      <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                    {/if}
                  </span>
                </th>

                {#if _translate_org_type === 'exchange'}
                  <th class="cursor-pointer" on:click={() => setSort('currency')}>
                    <span class="sortable-heading">
                      {t('Currency')}

                      {#if sortColumn === 'currency'}
                        <i class="bi bi-arrow-{sortDirection === 'asc' ? 'up' : 'down'} sort-icon"></i>
                      {/if}
                    </span>
                  </th>
                {/if}

                {#if enable_expiry_date}
                  <th>{t('Expiry Date')}</th>
                {/if}

                <th class="col-start">{t('Purchase Price')}</th>
                <th class="col-start">{t('Selling Price')}</th>
                <th class="col-start">{t('Inventory Value')}</th>

                {#if filterStatus === 'all' || filterStatus === 'archived'}
                  <th>{t('Status')}</th>
                {/if}

                <th>{t('Actions')}</th>
              </tr>
            </svelte:fragment>

            {#each paginatedProducts as product, index (product.id)}
              <tr class:service-row={product.type === 'service'}>
              <td class="col-start cell-muted">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                <!-- Product -->
                <td class="product-column">
                  <div class="product-info">
                    <StatusBadge tone="neutral" ghost>
                      <button
                        type="button"
                        class="product-name-btn"
                        title={product.name}
                        on:click={() => push(`/dashboard/product/${product.id}`)}>
                        {product.name}
                      </button>
                    </StatusBadge>

                    
                  </div>
                </td>

                <!-- Category -->
                <td>
                  <StatusBadge tone="neutral" ghost>
                    {getCategoryName(product.category_id)}
                  </StatusBadge>
                </td>

                <!-- Quantity -->
                <td class="col-start">
                  <button
                    type="button"
                    class="quantity-cell"
                    title={t('Show unit details')}
                    on:click={() => {
                      showUnitParts = !showUnitParts;
                    }}>
                    {#if showUnitParts}
                      <span class="unit-parts">
                        {#each getProductUnitParts(product) as part}
                          {#if part.quantity !== 0}
                            <StatusBadge tone={part.quantity > 0 ? 'positive' : 'negative'}>
                              <span dir="ltr">{formatQty(Number(part.quantity))}</span>
                              <span>{part.unit_name}</span>
                            </StatusBadge>
                          {/if}
                        {/each}
                      </span>
                    {:else}
                      <StatusBadge
                        tone={getStockTone(Number(product.quantity || 0), Number(product.alarm_quantity || 0))}>
                        <span dir="ltr">{formatQty(Number(product.quantity || 0))}</span>
                        <span>{getUnitName(product.product_unit_id)}</span>
                      </StatusBadge>
                    {/if}
                  </button>
                </td>

                <!-- Currency -->
                {#if _translate_org_type === 'exchange'}
                  <td>
                    <StatusBadge tone="info">
                      {t(product.currency || '')}
                    </StatusBadge>
                  </td>
                {/if}

                <!-- Expiry date -->
                {#if enable_expiry_date}
                  <td>
                    <StatusBadge tone={getExpiryTone(product.expiry_date)} ltr={true} ghost>
                      {product.expiry_date || '–'}
                    </StatusBadge>
                  </td>
                {/if}

                <!-- Purchase price -->
                <td class="col-start">
                  <StatusBadge tone="info">
                    <span dir="ltr">
                      {Number(product.buy_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                    <span>{t(product.buy_currency)}</span>
                  </StatusBadge>
                </td>

                <!-- Selling price -->
                <td class="col-start">
                  <StatusBadge tone="positive">
                    <span dir="ltr">
                      {Number(product.sell_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                    <span>{t(product.sell_currency)}</span>
                  </StatusBadge>
                </td>

                <!-- Inventory Value (purchase_price * quantity) -->
                <td class="col-start">
                  {#if product}
                    {#if getProductQty(product) !== undefined}
                      <StatusBadge tone={(toNumber(product.buy_price) * getProductQty(product)) < 0 ? 'negative' : 'positive'}>
                        <span dir="ltr">
                          {Number((toNumber(product.buy_price) * getProductQty(product)) || 0).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        {#if product?.buy_currency}<span>{t(product.buy_currency)}</span>{/if}
                      </StatusBadge>
                    {:else}
                      <span class="muted-dash">–</span>
                    {/if}
                  {:else}
                    <span class="muted-dash">–</span>
                  {/if}
                </td>

                <!-- Status -->
                {#if filterStatus === 'all' || filterStatus === 'archived'}
                  <td>
                    <div class="status-control">
                      <StatusBadge tone={product.product_status === 'active' ? 'positive' : 'negative'}>
                        {productStatusLabel(product.product_status)}
                      </StatusBadge>

                      <ActionButton
                        variant="icon"
                        tone="muted"
                        icon="bi-{product.product_status === 'active' ? 'archive' : 'box-arrow-in-up'}"
                        title={t('Change status')}
                        on:click={() =>
                          changeProductStatus(
                            product.id,
                            product.product_status === 'active' ? 'archived' : 'active',
                          )} />
                    </div>
                  </td>
                {/if}

                <!-- Actions -->
                <td>
                  <TableActions
                    actions={[
                      {
                        icon: 'bi-eye',
                        label: t('View'),
                        tone: 'view',
                        onClick: () => push(`/dashboard/product/${product.id}`),
                      },
                      ...(permissions?.some((p) => p.code === 'Products' && p.edit)
                        ? [
                            {
                              icon: 'bi-pencil',
                              label: t('Edit'),
                              tone: 'edit',
                              onClick: () => editExistingProduct(product),
                            },
                          ]
                        : []),
                      {
                        icon: product.product_status === 'active' ? 'bi-archive' : 'bi-box-arrow-in-up',
                        label: product.product_status === 'active' ? t('Archive') : t('Unarchive'),
                        tone: 'muted',
                        onClick: () =>
                          changeProductStatus(product.id, product.product_status === 'active' ? 'archived' : 'active'),
                      },
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
        ariaLabel={t('Products pagination')}
        rowLabel={t('rows')}
        on:perPageChange={(e) => {
          itemsPerPage = Number(e.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
{/if}

<!-- =====================================================================
     Modals
     ===================================================================== -->
<ProductModal
  bind:this={goodModal}
  {categories}
  {units}
  {warehouses}
  type="product"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={(e) => {
    onProductSaved(e);
  }} />

<ProductModal
  bind:this={serviceModal}
  {categories}
  {units}
  {warehouses}
  type="service"
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={onProductSaved} />

<OpenFoodAPIModal bind:this={openFoodAPIModalRef} on:productSelected={(e) => {}} />

<style>
  .permission-denied {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem;
    color: #dc2626;
    font-size: 1rem;
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .sortable-heading {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
  }

  .sort-icon {
    color: #0f6efd;
    font-size: 0.75rem;
  }

  .product-column {
    max-width: 16rem;
  }

  .product-info {
    display: grid;
    min-width: 0;
    gap: 0.125rem;
    text-align: start;
  }

  .product-name-btn {
    display: block;
    overflow: hidden;
    width: 100%;
    max-width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #172033;
    font-family: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.3;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .product-name-btn:hover,
  .product-name-btn:focus-visible {
    color: #0f6efd;
  }

  .product-info small {
    display: block;
    overflow: hidden;
    max-width: 100%;
    color: #94a3b8;
    font-size: 0.71875rem;
    font-weight: 500;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quantity-cell {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .unit-parts {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .status-control {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .muted-dash {
    color: #a8b4c2;
    font-weight: 800;
  }

</style>
