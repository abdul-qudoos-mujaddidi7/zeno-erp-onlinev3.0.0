<script>
  import { onceAsync } from '../../lib/onceAsync.js';
  import { onMount, onDestroy } from 'svelte';
import { productImageApi } from '../../api/productImageApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { unitCategoryApi } from '../../api/unitCategoryApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import { productBrandApi } from '../../api/productBrandApi.js';
  import { productGenericApi } from '../../api/productGenericApi.js';
  import { productCategoryApi } from '../../api/productCategoryApi.js';
  import DeferredModal from '../../components/DeferredModal.svelte';
  const loadProductModal = () => import('./ProductModal.svelte');
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { push } from 'svelte-spa-router';
  import OpenFoodAPIModal from './OpenFoodAPIModal.svelte';
  import FilterToolbar from '../../components/common/FilterToolbar.svelte';
  import DataTable from '../../components/common/DataTable.svelte';
  import ActionButton from '../../components/common/ActionButton.svelte';
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
    decomposeQuantityWithUnits,
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
    loadRequestId += 1;
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
  let unitCategories = [];
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

  function getProductQueryKey() {
    return `${currentPage}|${itemsPerPage}|${filterCategory}|${filterStatus}|${filterBrand}|${filterCurrency}|${filterGeneric}`;
  }

  let serviceModal;

  // --- Table State ---
  let searchTerm = '';
  let filtersOpen = false;
  let filterCategory = 'all';
  let filterBrand = 'all';
  let filterCurrency = 'all';
  let filterGeneric = 'all';
  let filterStatus = 'active'; // 'all', 'active', 'inactive'
  let currentPage = 1;
  let itemsPerPage = DEFAULT_PAGE_SIZE;
  let sortColumn = 'created_at';
  let sortDirection = 'desc'; // 'asc' or 'desc'
  let expandedStockRows = new Set();

  // --- Reference formatting -------------------------------------------------
  /* Money reads in hundredths, like the prices the catalogue prints. */
  const amountFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const CURRENCY_SYMBOL_FALLBACKS = { AFN: '؋', USD: '$', EUR: '€', PKR: 'Rs', IRR: '﷼' };

  function amountText(value) {
    const number = Number(value);
    return amountFormatter.format(Number.isFinite(number) ? number : 0);
  }

  function currencySymbol(code) {
    const normalizedCode = String(code ?? '').toUpperCase();
    if (!normalizedCode) return '';
    const match = currencies.find(
      (currency) => String(currency.code ?? '').toUpperCase() === normalizedCode,
    );
    return match?.symbol || CURRENCY_SYMBOL_FALLBACKS[normalizedCode] || t(normalizedCode);
  }

  function formatQty(qty) {
    return Number(qty || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  /*
   * Stock state drives the row tone exactly like the reference sheet:
   * negative, out, low (below the alarm quantity) and healthy.
   */
  function stockState(product) {
    const quantity = toNumber(product?.quantity);
    const alarm = toNumber(product?.alarm_quantity);
    if (quantity < 0) return 'negative';
    if (quantity === 0) return 'out';
    if (alarm > 0 && quantity < alarm) return 'low';
    return 'ok';
  }

  function daysUntil(value) {
    if (!value) return null;
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return null;
    return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  function expiryState(product) {
    const days = daysUntil(product?.expiry_date);
    if (days === null) return 'none';
    if (days < 0) return 'expired';
    if (days <= 30) return 'warning';
    return 'ok';
  }

  function expiryTone(product) {
    const state = expiryState(product);
    if (state === 'expired') return 'danger';
    if (state === 'warning') return 'warn';
    return 'ink';
  }

  function expiryTitle(product) {
    const days = daysUntil(product?.expiry_date);
    if (days === null) return t('Expiry Date');
    if (days < 0) return t('Expired');
    return `${Math.abs(days)} ${t('Day')}`;
  }

  /*
   * The reference keeps one warehouse on every row (`گدام`). A product stores
   * the warehouse its stock was opened in, so the column reads that existing
   * field instead of inventing a balance: products opened without one print '—'.
   */
  function warehouseLabel(product) {
    const warehouse = warehouses.find(
      (item) => Number(item.id) === Number(product?.initial_warehouse_id),
    );
    return warehouse?.name || '';
  }

  function brandLabel(product) {
    const brand = brands.find((item) => Number(item.id) === Number(product?.brand_id));
    return brand?.name || '';
  }

  function expiryRemaining(product) {
    const days = daysUntil(product?.expiry_date);
    if (days === null) return '';
    if (days < 0) return t('Expired');
    return `${days} ${t('Day')}`;
  }

  const expiryFormatter = new Intl.DateTimeFormat('fa-AF-u-ca-persian-nu-latn', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  function expiryLabel(product) {
    const value = product?.expiry_date;
    if (!value) return '';

    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '—';

    const parts = expiryFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '';
    const month = parts.find((part) => part.type === 'month')?.value || '';
    const day = parts.find((part) => part.type === 'day')?.value || '';

    return year && month && day ? `${year} ${month} ${day}` : '—';
  }

  /* The summary endpoint reports per-currency totals; the sheet reads in AFN. */
  function afnTotal(map) {
    if (!map) return 0;
    return Object.entries(map).reduce(
      (sum, [currency, amount]) =>
        sum + toNumber(exchangeRate(toNumber(amount), currency, 'AFN')),
      0,
    );
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
  let totalBenefit = {};
  let totalPredictedBenefit = {};

  function subtractValueMaps(saleMap = {}, purchaseMap = {}) {
    const result = {};
    const currencies = new Set([...Object.keys(saleMap), ...Object.keys(purchaseMap)]);
    currencies.forEach((currency) => {
      const value = (toNumber(saleMap[currency]) || 0) - (toNumber(purchaseMap[currency]) || 0);
      if (value !== 0) result[currency] = value;
    });
    return result;
  }

  async function loadIndexSummary() {
    try {
      const response = await productApi.getSummary();
      const data = response?.data || {};
      totalPurchaseCostMap = data.purchase || {};
      totalSaleValueMap = data.sale || {};
      totalPredictedBenefit = subtractValueMaps(
        totalSaleValueMap,
        totalPurchaseCostMap,
      );
      totalQuantityCount = Number(data.quantity) || 0;
    } catch (error) {
      console.error('Error loading product summary:', error);
    }
  }

  const loadLookups = onceAsync(async () => {
    if (lookupsLoaded) return;
    const [
      categoriesRes,
      brandResponse,
      genericResponse,
      unitsRes,
      unitCategoriesRes,
      currenciesRes,
      warehousesRes,
    ] = await Promise.all([
      productCategoryApi.getAll({ status: 1 }),
      productBrandApi.getAll({ status: 1 }),
      productGenericApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
      unitCategoryApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
      warehouseApi.getAll({ status: 1 }),
    ]);
    categories = categoriesRes?.data || [];
    brands = brandResponse?.data || [];
    generics = genericResponse?.data || [];
    units = unitsRes?.data || [];
    unitCategories = unitCategoriesRes?.data || [];
    currencies = currenciesRes?.data || [];
    warehouses = warehousesRes?.data || [];
    warehouse_products = [];
    lookupsLoaded = true;
  });

  async function loadAll({ refreshSummary = false } = {}) {
    const requestId = ++loadRequestId;
    lastPageKey = getProductQueryKey();
    loading = true;
    try {
      void loadLookups().catch((error) => console.error('Failed to load product filters', error));

      // Active products only; exclude services on the server.
      // Do not load status=0 or all sale_items on initial index load.
      const response = await productApi.getAll({
        status: 1,
        search: searchTerm.trim(),
        exclude_type: 'service',
        category_id: filterCategory !== 'all' ? filterCategory : '',
        product_status: filterStatus !== 'all' ? filterStatus : '',
        brand_id: filterBrand !== 'all' ? filterBrand : '',
        generic_id: filterGeneric !== 'all' ? filterGeneric : '',
        currency: filterCurrency !== 'all' ? filterCurrency : '',
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
      totalBenefit = {};

      if (refreshSummary) {
        void loadIndexSummary();
      }

      const pageIds = products
        .flatMap((p) => getProductGroupIds(p))
        .filter(Boolean);
      loading = false;
      if (!pageIds.length) return;
      void productImageApi.getAll({ status: 1, product_ids: pageIds.join(',') }).then((response) => {
        if (requestId !== loadRequestId) return;
        const imageByProductId = new Map((response?.data || []).map((img) => [Number(img.product_id), img]));
        products = products.map((product) => {
          const img = imageByProductId.get(Number(product.id)) ||
            getProductGroupIds(product).map((id) => imageByProductId.get(Number(id))).find(Boolean);
          return { ...product, thumbnailUrl: resolveMediaUrl(img?.thumbnail, '/img/no-image.png') };
        });
      }).catch((error) => console.error('Failed to load product images', error));
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
      void resolveInventoryMethod().catch((error) => console.error('Could not resolve inventory method', error));
    } catch (error) {
      console.error(
        'Could not resolve inventory method:',
        error,
      );
    }

    lastPageKey = getProductQueryKey();
    bootstrapped = true;
    await loadAll({ refreshSummary: true });
  });

  // Reload on page / page-size / filter changes
  $: if (bootstrapped) {
    void currentPage;
    void itemsPerPage;
    void filterCategory;
    void filterStatus;
    void filterBrand;
    void filterCurrency;
    void filterGeneric;
    const key = getProductQueryKey();
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
      loadAll({ refreshSummary: true });
    }
  }

  async function openNewProduct(type = 'product') {
    if (type === 'service') {
      try { await loadLookups(); await serviceModal.openModal(); }
      catch (error) { console.error('Failed to open service form', error); toast.error(t('Error')); }
      return;
    }
    push('/dashboard/product-form/new');
  }

  async function editExistingProduct(product) {
    if (product?.type === 'service') {
      try { await loadLookups(); await serviceModal.editProduct(product); }
      catch (error) { console.error('Failed to open service form', error); toast.error(t('Error')); }
    } else {
      push(`/dashboard/product-form/${product.id}`);
    }
  }

  function onProductSaved(e) {
    loadAll({ refreshSummary: true });
    console.log('Product saved event received:', e.detail);
    if (e.detail.save_type === 'again') {
      setTimeout(() => {
        openNewProduct(); // Open new product modal after saving to allow quick entry of multiple products
      }, 500);
    }
  }

  // --- Computed Data (Filter, Sort, Pagination) ---
  // Use a reactive statement to filter and sort the products list

  // Server already applied category/status/brand/currency/generic filters.
  $: filteredProducts = (() => {
    let result = products;

    /* Inventory value is a computed column, so it sorts on the product of the
       purchase price and the on-hand quantity shown in the cell. */
    const sortValue = (product) =>
      sortColumn === 'stock_value'
        ? toNumber(product.buy_price) * toNumber(product.quantity)
        : product[sortColumn];

    // 4. Sort
    result = result.slice().sort((a, b) => {
      let valA = sortValue(a);
      let valB = sortValue(b);

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

  /*
   * `aria-sort` has to be a reactive value: a function call in the template
   * would only be evaluated once, leaving the header state stale.
   */
  $: sortDirectionAria = sortDirection === 'asc' ? 'ascending' : 'descending';
  $: sortAria = {
    name: sortColumn === 'name' ? sortDirectionAria : 'none',
    quantity: sortColumn === 'quantity' ? sortDirectionAria : 'none',
    expiry_date: sortColumn === 'expiry_date' ? sortDirectionAria : 'none',
    currency: sortColumn === 'currency' ? sortDirectionAria : 'none',
    buy_price: sortColumn === 'buy_price' ? sortDirectionAria : 'none',
    sell_price: sortColumn === 'sell_price' ? sortDirectionAria : 'none',
    stock_value: sortColumn === 'stock_value' ? sortDirectionAria : 'none',
  };

  /*
   * Reference row menu: details, edit, warehouses, stock history and the
   * archive switch — every entry opens a screen this app already has.
   */
  function productActions(product) {
    const active = product.product_status === 'active';
    return [
      {
        icon: 'bi-eye',
        label: t('Details'),
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
        icon: 'bi-building',
        label: t('Warehouses'),
        onClick: () => push(`/dashboard/product/${product.id}/warehouses`),
      },
      {
        icon: 'bi-clock-history',
        label: t('Stock History'),
        onClick: () => push(`/dashboard/product/${product.id}/report`),
      },
      {
        icon: active ? 'bi-archive' : 'bi-box-arrow-in-up',
        label: active ? t('Archive') : t('Unarchive'),
        tone: 'muted',
        onClick: () =>
          changeProductStatus(product.id, active ? 'archived' : 'active'),
      },
    ];
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
    return units.find((unit) => Number(unit.id) === Number(id))?.name || '';
  }

  function getProductUnitParts(product) {
    return decomposeQuantityWithUnits(
      product?.quantity,
      product?.product_unit_id,
      units,
    ).filter((part) => Number(part.quantity) !== 0);
  }

  $: productToolbarFilters = [
    {
      key: 'category',
      label: t('Category'),
      value: filterCategory,
      options: [{ value: 'all', label: t('All') }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))],
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

  function handleToolbarFilterChange(e) {
    const { key, value } = e.detail;
    if (key === 'category') filterCategory = value;
    if (key === 'currency') filterCurrency = value;
    if (key === 'generic') filterGeneric = value;
    if (key === 'brand') filterBrand = value;
    if (currentPage !== 1) currentPage = 1;
  }

  /* ---------- head quick segments, KPI cards, chips, columns ---------- */
  const STATUS_SEGMENTS = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'archived', label: 'Archived' },
  ];

  $: quickSegments = (($lang, STATUS_SEGMENTS.map((segment) => ({
    ...segment,
    label: t(segment.label),
  }))));

  function pickStatus(value) {
    if (filterStatus === value) return;
    filterStatus = value;
    currentPage = 1;
  }

  /* A quick segment applies at once and closes the filter popup. */
  function chooseStatus(value) {
    filtersOpen = false;
    pickStatus(value);
  }

  $: attention = (() => {
    const low = products.filter((product) => stockState(product) === 'low').length;
    const missing = products.filter((product) => {
      const state = stockState(product);
      return state === 'negative' || state === 'out';
    }).length;
    const expiring = products.filter((product) => {
      const state = expiryState(product);
      return state === 'expired' || state === 'warning';
    }).length;
    return { low, missing, expiring, total: low + missing + expiring };
  })();

  $: totalPurchaseAfn = afnTotal(totalPurchaseCostMap);
  $: totalSaleAfn = afnTotal(totalSaleValueMap);
  $: predictedAfn = totalSaleAfn - totalPurchaseAfn;
  $: predictedMargin = totalSaleAfn ? (predictedAfn / totalSaleAfn) * 100 : 0;
  /* Reference sale card: the uplift the sale value carries over the cost, and
     the cost's share of it drawn as a bar. */
  $: saleUplift = totalPurchaseAfn
    ? Math.round(((totalSaleAfn - totalPurchaseAfn) / totalPurchaseAfn) * 100)
    : 0;
  $: costShare = totalSaleAfn
    ? Math.round((totalPurchaseAfn / totalSaleAfn) * 100)
    : 0;

  $: kpiCards = (($lang, [
    {
      key: 'purchase',
      label: t('Value at Purchase Rate'),
      icon: 'inventory_2',
      value: amountText(totalPurchaseAfn),
      unit: currencySymbol('AFN'),
      sub: `${totalItems} ${t('Product')}`,
      title: t('Value at Purchase Rate'),
    },
    {
      key: 'sale',
      label: t('Value at Sale Rate'),
      icon: 'sell',
      value: amountText(totalSaleAfn),
      unit: currencySymbol('AFN'),
      sub: t('If all stock is sold'),
      chip: `${saleUplift}%`,
      chipTone: 'ok',
      bar: costShare,
      barTone: 'ok',
      title: t('Value at Sale Rate'),
    },
    {
      key: 'predicted',
      label: t('Predicted Benefit'),
      icon: 'auto_awesome',
      hero: true,
      value: amountText(predictedAfn),
      unit: currencySymbol('AFN'),
      sub: `${t('Margin')} ${predictedMargin.toFixed(1)}%`,
      title: t('Predicted Benefit'),
    },
    {
      key: 'attention',
      label: t('Needs Attention'),
      icon: 'notification_important',
      value: String(attention.total),
      unit: t('Product'),
      valueTone: attention.total ? 'warn' : 'ink',
      sub: `${attention.low} ${t('Low Stock')} · ${attention.missing} ${t('Out of Stock')} · ${attention.expiring} ${t('Expiring Soon')}`,
      title: t('Products needing attention'),
    },
  ]));

  $: activeChips = (() => {
    const chips = [];

    if (filterCategory !== 'all') {
      chips.push({
        key: 'category',
        label: `${t('Category')}: ${getCategoryName(filterCategory)}`,
        clear: () => {
          filterCategory = 'all';
          currentPage = 1;
        },
      });
    }

    if (filterBrand !== 'all') {
      chips.push({
        key: 'brand',
        label: `${t('Brand')}: ${getBrandName(filterBrand)}`,
        clear: () => {
          filterBrand = 'all';
          currentPage = 1;
        },
      });
    }

    if (filterGeneric !== 'all') {
      chips.push({
        key: 'generic',
        label: `${t('Generic')}: ${getGenericName(filterGeneric)}`,
        clear: () => {
          filterGeneric = 'all';
          currentPage = 1;
        },
      });
    }

    if (filterCurrency !== 'all') {
      chips.push({
        key: 'currency',
        label: `${t('Currency')}: ${t(filterCurrency)}`,
        clear: () => {
          filterCurrency = 'all';
          currentPage = 1;
        },
      });
    }

    return chips;
  })();

  $: tableColumnCount = 7 + (_translate_org_type === 'exchange' ? 1 : 0);
  $: tableColumns = Array.from(
    { length: tableColumnCount },
    () => `${100 / tableColumnCount}%`,
  );

  $: rangeStart = totalItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
  $: rangeEnd = Math.min(currentPage * itemsPerPage, totalItems);

  function toggleStockBreakdown(productId) {
    const next = new Set(expandedStockRows);
    if (next.has(productId)) {
      next.delete(productId);
    } else {
      next.add(productId);
    }
    expandedStockRows = next;
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
          loadAll({ refreshSummary: true });
        }
      });
  }

</script>

{#if !permissions?.some((p) => p.code === 'Products' && p.view)}
  <h3 class="permission-denied">
    <i class="bi bi-exclamation-triangle"></i>
    {t('Permission denied')}
  </h3>
{:else}
  <div class="products-page">
    <IndexPageLayout
      dir={t('dir')}
      ariaLabel={t('Products')}
      showStats={true}
      showExtra={true}
      showFooter={!loading && totalItems > 0}
      dense={true}
      contentClass="products-index-content"
      tablePadding={true}>

    <svelte:fragment slot="toolbar">
      <FilterToolbar
        bind:filtersOpen
        searchValue={searchTerm}
        searchPlaceholder={t('Search name, code or category…')}
        filters={productToolbarFilters}
        filterLabel={t('Filter')}
        resetLabel={t('Clear Filters')}
        applyLabel={t('Show')}
        activeCount={activeChips.length}
        showReset={true}
        on:searchChange={(e) => {
          searchTerm = e.detail;
          scheduleSearchReload();
        }}
        on:filterChange={handleToolbarFilterChange}
        on:reset={resetFilters}>
        <svelte:fragment slot="panelBeforeFields">
          <div class="quick-status" role="group" aria-label={t('Status')}>
            {#each quickSegments as segment (segment.key)}
              <button
                type="button"
                class="quick-status__option"
                class:is-active={filterStatus === segment.key}
                aria-pressed={filterStatus === segment.key}
                on:click={() => chooseStatus(segment.key)}>
                {segment.label}
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
        <button type="button" class="active-filters__clear" on:click={resetFilters}>
          {t('Clear Filters')}
        </button>
      </div>
    {/if}

    <svelte:fragment slot="stats">
      <section class="kpi" aria-label={t('Products')}>
        {#each kpiCards as card (card.key)}
          <article
            class="kcard"
            data-hero={card.hero ? 'true' : undefined}
            title={card.title}>
            <span class="ktile" aria-hidden="true">
              <span class="ms f">{card.icon}</span>
            </span>
            <div class="kbody">
              <span class="klabel">{card.label}</span>
              <span class="kval-line">
                <span class="kval kval--{card.valueTone || 'ink'}" dir="ltr">{card.value}</span>
                {#if card.unit}<span class="kunit">{card.unit}</span>{/if}
              </span>
              <span class="ksub">{card.sub}</span>
            </div>
            {#if card.chip || card.bar != null}
              <div class="kside">
                {#if card.chip}
                  <span class="kchip kchip--{card.chipTone || 'ok'}" dir="ltr">{card.chip}</span>
                {/if}
                {#if card.bar != null}
                  <span class="kbar" aria-hidden="true">
                    <span class="kbar__fill kbar__fill--{card.barTone || 'ok'}" style:width={`${card.bar}%`}></span>
                  </span>
                {/if}
              </div>
            {/if}
          </article>
        {/each}
      </section>
    </svelte:fragment>

    <svelte:fragment slot="extra">
      <div class="products-head__actions">
        {#if shiftPressed && ctrlPressed}
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
                  const inventoryMethod = await resolveInventoryMethod();

                  await calculateAllStocks(inventoryMethod);

                  await loadAll({ refreshSummary: true });

                  toast.success(t('Success'), t('Stock recalculated successfully.'));
                } catch (error) {
                  console.error('Stock recalculation failed:', error);

                  toast.error(
                    t('Error'),
                    error?.message || t('Stock recalculation failed.'),
                  );
                } finally {
                  s = false;
                }
              }
            }} />
        {/if}

        {#if permissions?.some((p) => p.code === 'Products' && p.create)}
          <ActionButton
            icon="add"
            label={t('New Product')}
            extraClass="products-create"
            on:click={() => openNewProduct()} />
        {/if}
      </div>
    </svelte:fragment>

        {#if loading}
          <div class="index-table-state">
            <EmptyState loading message={t('Loading...')} />
          </div>
        {:else if filteredProducts.length === 0}
          <div class="index-table-state">
            <EmptyState icon="bi-search" message={t('No products found.')}>
              <button type="button" class="empty-clear" on:click={resetFilters}>
                {t('Clear Filters')}
              </button>
            </EmptyState>
          </div>
        {:else}
          <DataTable
            ariaLabel={t('Products')}
            minWidth="100%"
            dense={true}
            striped={false}
            hover={false}
            stickyHeader={true}
            headerHeight="40px"
            cellPaddingY="6px"
            cellPaddingX="12px"
            edgePaddingX="16px"
            headPaddingX="12px"
            headEdgePaddingX="16px"
            headFontSize="11.5px"
            headFontWeight="600"
            headColor="var(--z-muted, #64748b)"
            columns={tableColumns}
            mobileCards={true}>
            <svelte:fragment slot="head">
              <tr>
                <th aria-sort={sortAria.name}>
                  <button type="button" class="th-sort" on:click={() => setSort('name')}>
                    {t('Product')}
                    <span
                      class="ms sort-icon"
                      class:sort-icon--idle={sortColumn !== 'name'}
                      aria-hidden="true">
                      {sortColumn === 'name'
                        ? sortDirection === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'swap_vert'}
                    </span>
                  </button>
                </th>

                <th class="col-warehouse">{t('Warehouse')}</th>

                <th class="col-start" aria-sort={sortAria.quantity}>
                  <button type="button" class="th-sort" on:click={() => setSort('quantity')}>
                    {t('Stock')}
                    <span
                      class="ms sort-icon"
                      class:sort-icon--idle={sortColumn !== 'quantity'}
                      aria-hidden="true">
                      {sortColumn === 'quantity'
                        ? sortDirection === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'swap_vert'}
                    </span>
                  </button>
                </th>

                <th class="col-start" aria-sort={sortAria.buy_price}>
                  <button
                    type="button"
                    class="th-sort th-sort--price"
                    on:click={() => setSort('buy_price')}>
                    {t('Purchase Price')}
                    <span
                      class="ms sort-icon"
                      class:sort-icon--idle={sortColumn !== 'buy_price'}
                      aria-hidden="true">
                      {sortColumn === 'buy_price'
                        ? sortDirection === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'swap_vert'}
                    </span>
                  </button>
                </th>

                <th class="col-start" aria-sort={sortAria.sell_price}>
                  <button
                    type="button"
                    class="th-sort th-sort--price"
                    on:click={() => setSort('sell_price')}>
                    {t('Selling Price')}
                    <span
                      class="ms sort-icon"
                      class:sort-icon--idle={sortColumn !== 'sell_price'}
                      aria-hidden="true">
                      {sortColumn === 'sell_price'
                        ? sortDirection === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'swap_vert'}
                    </span>
                  </button>
                </th>

                {#if _translate_org_type === 'exchange'}
                  <th aria-sort={sortAria.currency}>
                    <button type="button" class="th-sort" on:click={() => setSort('currency')}>
                      {t('Currency')}
                      <span
                        class="ms sort-icon"
                        class:sort-icon--idle={sortColumn !== 'currency'}
                        aria-hidden="true">
                        {sortColumn === 'currency'
                          ? sortDirection === 'asc'
                            ? 'arrow_upward'
                            : 'arrow_downward'
                          : 'swap_vert'}
                      </span>
                    </button>
                  </th>
                {/if}

                <th class="col-start" aria-sort={sortAria.stock_value}>
                  <button type="button" class="th-sort" on:click={() => setSort('stock_value')}>
                    {t('Inventory Value')}
                    <span
                      class="ms sort-icon"
                      class:sort-icon--idle={sortColumn !== 'stock_value'}
                      aria-hidden="true">
                      {sortColumn === 'stock_value'
                        ? sortDirection === 'asc'
                          ? 'arrow_upward'
                          : 'arrow_downward'
                        : 'swap_vert'}
                    </span>
                  </button>
                </th>
                <th class="col-end">{t('Actions')}</th>
              </tr>
            </svelte:fragment>

            {#each paginatedProducts as product (product.id)}
              {@const category = getCategoryName(product.category_id)}
              {@const brand = brandLabel(product)}
              {@const unit = getUnitName(product.product_unit_id)}
              {@const unitParts = getProductUnitParts(product)}
              {@const stockExpanded = expandedStockRows.has(product.id)}
              {@const warehouse = warehouseLabel(product)}
              <tr
                class="product-row"
                class:is-archived={product.product_status === 'archived'}>
                <td>
                  <button
                    type="button"
                    class="product-cell"
                    title={`${product.name}${category && category !== '-' ? ` · ${category}` : ''}`}
                    on:click={() => push(`/dashboard/product/${product.id}`)}>
                    <span class="product-cell__body">
                      <span class="product-cell__name">{product.name}</span>
                      {#if (category && category !== '-') || brand}
                        <span class="product-cell__sub">
                          {[category !== '-' ? category : '', brand]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      {/if}
                    </span>
                  </button>
                </td>

                <td class="col-start">
                  <span class="warehouse-cell" title={warehouse || t('Warehouse')}>
                    {#if warehouse}
                      <span class="ms warehouse-cell__icon" aria-hidden="true">warehouse</span>
                    {/if}
                    <span class="warehouse-cell__name">{warehouse || '-'}</span>
                  </span>
                </td>

                <td class="col-start">
                  <div class="stock-cell-wrap">
                    <div class="stock-cell">
                      <button
                        type="button"
                        class="stock-qty"
                        class:stock-qty--available={toNumber(product.quantity) > 0}
                        class:stock-qty--unavailable={toNumber(product.quantity) <= 0}
                        class:is-expanded={stockExpanded}
                        aria-expanded={stockExpanded}
                        disabled={unitParts.length < 2}
                        title={`${formatQty(product.quantity)} ${unit}`}
                        on:click={() => toggleStockBreakdown(product.id)}>
                        {#if stockExpanded}
                          <span class="stock-qty__expand-mark" aria-hidden="true">+</span>
                          <span class="stock-qty__parts">
                            {#each unitParts as part}
                              <span>{formatQty(part.quantity)} {part.unit_name}</span>
                            {/each}
                          </span>
                        {:else}
                          {formatQty(product.quantity)}{#if unit} {unit}{/if}
                        {/if}
                      </button>
                    </div>
                  </div>
                </td>

                <td class="col-start">
                  <span
                    class="amount amount--buy"
                    dir="ltr"
                    title={`${amountText(product.buy_price)} ${currencySymbol(product.buy_currency)}`}>
                    <span class="amount__cur">{currencySymbol(product.buy_currency)}</span>{amountText(product.buy_price)}
                  </span>
                </td>

                <td class="col-start">
                  <span
                    class="amount amount--sell"
                    dir="ltr"
                    title={`${amountText(product.sell_price)} ${currencySymbol(product.sell_currency)}`}>
                    <span class="amount__cur">{currencySymbol(product.sell_currency)}</span>{amountText(product.sell_price)}
                  </span>
                </td>

                {#if _translate_org_type === 'exchange'}
                  <td>
                    <span
                      class="currency-pill"
                      title={t(product.currency || '')}>
                      {currencySymbol(product.currency) || '—'}
                    </span>
                  </td>
                {/if}

                <td class="col-start">
                  {#if toNumber(product.quantity) > 0}
                    <span
                      class="amount amount--value"
                      dir="ltr"
                      title={`${amountText(toNumber(product.buy_price) * toNumber(product.quantity))} ${currencySymbol(product.buy_currency)}`}>
                      <span class="amount__cur">{currencySymbol(product.buy_currency)}</span>{amountText(toNumber(product.buy_price) * toNumber(product.quantity))}
                    </span>
                  {:else}
                    <span class="amount-empty">-</span>
                  {/if}
                </td>

                <td class="col-end">
                  <TableActions
                    material={true}
                    menuTitle={product.name}
                    actions={productActions(product)} />
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
        ariaLabel={t('Products pagination')}
        rowLabel={t('Product')}
        perPageRowLabel={t('rows')}
        on:perPageChange={(e) => {
          itemsPerPage = Number(e.detail);
          currentPage = 1;
        }}
        {getPageNumbers} />
    </svelte:fragment>
  </IndexPageLayout>
  </div>
{/if}

<!-- =====================================================================
     Modals
     ===================================================================== -->
<DeferredModal loader={loadProductModal}
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
  .permission-denied {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px;
    color: var(--z-debit, #dc2626);
    font-size: 14px;
    font-weight: 700;
  }

  .products-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /*
   * The reference puts the sub-navigation/action row and the KPI row on the
   * page surface and the toolbar, table and pager inside one 14px sheet, so the
   * shared panel is unwrapped here and its children are re-ordered to that stack.
   */
  .products-page :global(.index-panel) {
    gap: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
  }

  .products-page :global(.index-statistics) {
    order: -1;
    flex: 0 0 auto;
    padding: 0;
    margin-bottom: 12px;
    border: 0;
    background: transparent;
  }

  .products-page :global(.index-toolbar) {
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

  .products-page :global(.index-toolbar-main) {
    gap: 8px;
  }

  .products-page :global(.index-toolbar-main .filter-toolbar-row) {
    gap: 8px;
    flex-wrap: nowrap;
  }

  /*
   * Reference header/row hairlines: a surface-2 header over border-soft rows.
   * The shared tokens already hold those two colours, so the page only wraps
   * the table in the sheet's side borders.
   */
  .products-page :global(.index-content) {
    order: 1;
    flex: 1 1 auto;
    min-height: 0;
    border-inline: 1px solid var(--z-border, #e1e7f0);
    background: var(--z-surface, #ffffff);
  }


  .products-page :global(.products-index-content .data-table-wrap) {
    border: 0;
  }

  .products-page :global(.index-footer) {
    order: 2;
    flex: 0 0 auto;
    border: 1px solid var(--z-border, #e1e7f0);
    border-top: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 0 0 var(--z-r-xl, 14px) var(--z-r-xl, 14px);
    background: var(--z-surface-2, #f8fafc);
    box-shadow: 0 1px 2px rgba(11, 21, 48, 0.04);
  }

  .products-page :global(.index-footer .pagination-shell) {
    padding: 10px 16px;
    border: 0;
    background: var(--z-surface-2, #f8fafc);
  }

  /* ---------- sub-navigation + page actions ---------- */
  .products-head__actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
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
    min-height: 72px;
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
    background: var(--z-brand, #2f6fed);
    color: #ffffff;
  }

  .kcard:nth-child(4) .ktile {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
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
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kval--warn {
    color: var(--z-warn, #92400e);
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

  /* Reference card side: the uplift chip and the cost-share bar. */
  .kside {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    align-self: stretch;
    justify-content: center;
    gap: 6px;
  }

  .kchip {
    padding: 1px 7px;
    border-radius: 999px;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.45;
    white-space: nowrap;
  }

  .kchip--ok {
    background: var(--z-ok-soft, #dcfce7);
    color: var(--z-ok, #15803d);
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
    border-radius: 3px;
  }

  .kbar__fill--ok {
    background: #16a34a;
  }

  /* ---------- status segments inside the filter popup ---------- */
  .quick-status {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
  }

  .quick-status__option {
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

  .quick-status__option:hover {
    border-color: var(--z-border, #e1e7f0);
    color: var(--z-ink, #0b1530);
  }

  .quick-status__option.is-active {
    border-color: var(--z-brand-300, #93b7f7);
    background: var(--z-brand-soft, #e3ecff);
    color: var(--z-link, #2f6fed);
    box-shadow: none;
  }

  .quick-status__option:focus-visible {
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
    margin: 0;
    font-size: 14px;
    opacity: 1;
  }

  .th-sort .sort-icon--idle {
    opacity: 0.55;
  }

  /* ---------- rows ---------- */
  .product-row {
    height: auto;
  }

  .product-row:hover {
    background: var(--z-hover, #f5f9ff);
  }

  .product-row.is-archived {
    opacity: 0.6;
  }

  .cell-empty {
    color: var(--z-subtle, #94a3b8);
    font-weight: 600;
  }

  /* ---------- warehouse column ---------- */
  .warehouse-cell {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--z-text, #475569);
  }

  .warehouse-cell__icon {
    flex-shrink: 0;
    color: var(--z-subtle, #94a3b8);
    font-size: 15px;
  }

  .warehouse-cell__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ---------- stock cell: status chip, quantity, level bar ---------- */
  .stock-cell-wrap {
    min-width: 0;
  }

  .stock-cell {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
  }

  .stock-qty {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .stock-qty:disabled {
    cursor: default;
  }

  .stock-qty.is-expanded {
    align-items: flex-start;
    overflow: visible;
    text-align: start;
    white-space: normal;
  }

  .stock-qty__expand-mark {
    flex: 0 0 auto;
    color: var(--z-link, #2f6fed);
    font-size: 15px;
    line-height: 1.2;
  }

  .stock-qty__parts {
    display: grid;
    gap: 2px;
    text-align: start;
  }

  .stock-qty--available {
    color: rgb(22, 163, 74);
  }

  .stock-qty--unavailable {
    color: rgb(220, 38, 38);
  }

  /* Reference secondary line under a price or an expiry. */
  .cell-sub {
    display: block;
    margin-top: 2px;
    overflow: hidden;
    color: #475569;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-sub--ink {
    color: #475569;
    font-weight: 400;
  }

  .cell-sub--warn {
    color: #475569;
    font-weight: 400;
  }

  .cell-sub--danger {
    color: #475569;
    font-weight: 400;
  }

  .cell-sub--has-date {
    color: #b91c1c;
    font-weight: 400;
  }

  .product-cell {
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .product-cell__body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .product-cell .product-cell__name {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    padding: 0;
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

  .product-cell:hover .product-cell__name {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .product-cell__sub {
    overflow: hidden;
    color: var(--z-subtle, #94a3b8);
    font-size: 11px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .expiry {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    color: #475569;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .expiry--has-date {
    color: #b91c1c;
  }

  .currency-pill {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-text, #475569);
    font-size: 11.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .amount {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    max-width: 100%;
    overflow: hidden;
    font-family: var(--z-font-num, 'Inter', sans-serif);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .amount__cur {
    flex-shrink: 0;
    font-size: 12.5px;
    font-weight: inherit;
  }

  .amount--buy {
    color: #fbbf24;
    font-weight: 800;
  }

  .amount--sell {
    color: #fbbf24;
    font-weight: 800;
  }

  .amount--value {
    color: var(--z-ink, #0b1530);
    font-size: 13px;
    font-weight: 800;
  }

  .amount-empty {
    color: var(--z-subtle, #94a3b8);
    font-weight: 600;
  }

  /* The reference row actions are 30px squares with an 8px radius. */
  .products-page :global(.table-actions .action-btn) {
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
  .products-page :global(.index-table-state .empty-state i) {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-muted, #64748b);
    font-size: 26px;
  }

  .products-page :global(.index-table-state .empty-state p) {
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
    .products-page :global(.index-toolbar-main .filter-toolbar-row) {
      flex-wrap: wrap;
    }

    .products-page :global(.filter-tools--grouped) {
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
      min-height: 0;
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

    .products-head__actions {
      flex-wrap: wrap;
      width: 100%;
    }

    .active-filters {
      padding-inline: 10px;
    }

    .quick-status__option {
      padding: 0 9px;
    }
  }
</style>
