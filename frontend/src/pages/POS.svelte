<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get } from 'svelte/store';
import { productImageApi } from '../api/productImageApi.js';
import { settingsApi } from '../api/settingsApi.js';
import { productCategoryApi } from '../api/productCategoryApi.js';
import { productUnitApi } from '../api/productUnitApi.js';
  import { toast } from '../ToastUI/toast.js';
  import { t, lang, setLanguage, isRTL, translate_org_type, settings_all } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { auth } from '../auth/authStore';
  $: permissions = $auth.permissions;

  import { resolveMediaUrl } from '../lib/mediaUrl.js';
  import FilterSelect from '../components/common/FilterSelect.svelte';
  import AccountModal from './accounts/AccountModal.svelte';
  import {
    mergeById,
    lookupAccounts,
    lookupAccountByCode,
    lookupBalances,
    lookupProducts,
    lookupProductsPage,
    balanceAmount,
  } from '../lib/formLookups.js';

  $: enable_stock_minus = $settings_all.find((s) => s.key === 'enable_stock_minus')?.value == 1;
  $: enable_a4_default_print_mode = $settings_all.find((s) => s.key === 'enable_a4_default_print_mode')?.value == 1;

  import { calculateRemainingAndBenefit, resolveCostCurrency } from './sales/SalesHelper.js';
import { currencyApi } from '../api/currencyApi.js';
import { warehouseApi } from '../api/warehouseApi.js';
import { saleApi } from '../api/saleApi.js';
import { accountTypeApi } from '../api/accountTypeApi.js';
import { warehouseProductApi } from '../api/warehouseProductApi.js';

  const CUSTOMER_TYPE_ID = 4;
  let SalesCmp = null;
  let SaleReceiptModalCmp = null;
  let SaleA4ReceiptModalCmp = null;
  let showSalesModal = false;

  async function openSalesModal() {
    if (!SalesCmp) {
      SalesCmp = (await import('./Sales.svelte')).default;
    }
    showSalesModal = true;
  }

  $: if (showReceipt && !SaleReceiptModalCmp) {
    import('./sales/SaleReceiptModal.svelte').then((mod) => {
      SaleReceiptModalCmp = mod.default;
    });
  }

  $: if (showA4Receipt && !SaleA4ReceiptModalCmp) {
    import('./sales/SaleA4ReceiptModal.svelte').then((mod) => {
      SaleA4ReceiptModalCmp = mod.default;
    });
  }

  import('./sales/SaleReceiptModal.svelte').then((mod) => {
    SaleReceiptModalCmp = mod.default;
  });
  import('./sales/SaleA4ReceiptModal.svelte').then((mod) => {
    SaleA4ReceiptModalCmp = mod.default;
  });

  async function closeSalesModal() {
    showSalesModal = false;
  }

  export let isComponent = false; // if true, this component is used inside another page and should not request fullscreen

  let isFullscreen = false;

  function enterFullscreen() {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function exitFullscreenIfNeeded() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  function syncFullscreenState() {
    isFullscreen = !!document.fullscreenElement;
  }

  let defaultCurrency = 'AFN';
  let currentPage = 1;
  let accountModalRef;
  let invoice_index = 0;
  let pos_index_prefix = 'POS-';
  let accountTypes = [];
  let pageSize = 25;

  const maxPageButtons = 5;

  $: visiblePages = (() => {
    if (totalPages <= maxPageButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(currentPage - Math.floor(maxPageButtons / 2), 1);
    let end = start + maxPageButtons - 1;
    if (end > totalPages) {
      end = totalPages;
      start = end - maxPageButtons + 1;
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  function goToPage(page) {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    currentPage = page;
    loadPosProducts();
    const container = document.querySelector('.products-container');
    if (container) container.scrollTop = 0;
  }

  let isProcessingSale = false;

  let warehouses = [];
  let categories = [];
  let products = [];
  let currencies = [];
  let customers = [];
  let treasury_ID = 0;
  let selectedCustomerBalance = null;
  let units = [];
  let discount_amount = 0;
  let expense_amount = 0;
  let discount_type = 'fixed';
  let barcodeBuffer = '';
  let barcodeTimeout = null;
  let barcodeLastKeyAt = 0;
  let barcodeListening = true;
  let barcodeBusy = false;
  const productByCode = new Map();
  const BARCODE_MIN_LENGTH = 3;
  const BARCODE_CHAR_GAP_MS = 50;
  const BARCODE_COMMIT_MS = 140;
  let selectedWarehouse = null;
  let selectedCategory = null;
  let selectedCustomer = null;
  let selectedCurrency = null;
  let selectedCurrencyId = null;
  let paymentCurrency = null;
  let showPaymentCurrencyMenu = false;
  let searchQuery = '';
  let cart = [];
  let paymentAmount = null;
  let showReceipt = false;
  let showA4Receipt = false;
  let receiptSale = null;
  let receiptItems = [];
  let receiptPayments = [];
  let receiptCustomer = null;
  let productStocks = {};
  let productTotal = 0;
  let warehouseStockLoaded = false;
  let loadedWarehouseId = null;
  let loadedBalanceKey = '';

  $: if (selectedWarehouse?.id && selectedWarehouse.id !== loadedWarehouseId) {
    loadedWarehouseId = selectedWarehouse.id;
    loadProductStocks();
  }

  $: totalPages = Math.max(1, Math.ceil((productTotal || 0) / pageSize));

  $: gridProducts = products.filter((p) => {
    if (Number(p.status) === 0) return false;
    if (p.type === 'service' || enable_stock_minus) return true;
    if (!warehouseStockLoaded) return true;
    return (productStocks[p.id] || Number(p.quantity || 0)) > 0;
  });

  $: totalAmount = cart.reduce(
    (sum, i) => sum + i.quantity * exchangeRate(i.unit_price, i.unit_currency, selectedCurrency?.code),
    0,
  );

  $: payableAmount =
    totalAmount -
    Number((discount_type == 'fixed' ? discount_amount : (totalAmount * discount_amount) / 100) || 0) +
    Number(expense_amount || 0);

  $: discount_amount = discount_type == 'fixed' && discount_amount > totalAmount ? totalAmount : discount_amount;

  function getMaxPaymentAmount() {
    if (!payableAmount) return 0;
    if (!paymentCurrency || !selectedCurrency?.code || paymentCurrency === selectedCurrency.code) {
      return payableAmount;
    }
    return exchangeRate(payableAmount, selectedCurrency.code, paymentCurrency);
  }

  function selectPaymentCurrency(code) {
    paymentCurrency = code;
    editPaymentCurrencyRate = false;
    if (selectedCustomer && selectedCustomer.code === 'WALKIN') {
      paymentAmount = getMaxPaymentAmount();
    } else if (paymentAmount != null && paymentAmount > getMaxPaymentAmount()) {
      paymentAmount = getMaxPaymentAmount();
    }
  }

  let paymentCurrencyBtnEl = null;
  let paymentMenuEl = null;
  let paymentMenuStyle = '';

  async function openPaymentCurrencyMenu() {
    showPaymentCurrencyMenu = true;
    editPaymentCurrencyRate = false;
    await tick();
    positionPaymentMenu();
  }

  async function togglePaymentCurrencyMenu() {
    if (showPaymentCurrencyMenu) {
      closePaymentCurrencyMenu();
      return;
    }
    await openPaymentCurrencyMenu();
  }

  $: if (showPaymentCurrencyMenu && paymentMenuEl) {
    tick().then(() => positionPaymentMenu());
  }

  function positionPaymentMenu() {
    if (!paymentCurrencyBtnEl) return;
    const rect = paymentCurrencyBtnEl.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const isRtl = document.documentElement.dir === 'rtl';
    let left = isRtl ? rect.left : rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

    const menuHeight = paymentMenuEl?.offsetHeight || 220;
    let top = rect.top - menuHeight - 8;
    if (top < 8) top = rect.bottom + 8;

    paymentMenuStyle = `top:${top}px;left:${left}px;width:${width}px;`;
  }

  function handlePaymentMenuReposition() {
    if (showPaymentCurrencyMenu) positionPaymentMenu();
  }

  function closePaymentCurrencyMenu() {
    showPaymentCurrencyMenu = false;
    editPaymentCurrencyRate = false;
  }

  function customerDisplayName(acc) {
    if (!acc) return '';
    if (t('Lang') === 'en') return acc.name || '';
    if (t('Lang') === 'fa') return acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') return acc.name_ps || acc.name || '';
    return acc.name || '';
  }

  $: if (selectedCustomer?.id && selectedCurrency?.code) {
    loadCustomerBalance(selectedCustomer.id, selectedCurrency.code);
  } else {
    selectedCustomerBalance = null;
    loadedBalanceKey = '';
  }

  function productUnitCode(product) {
    return units.find((u) => u.id === product.product_unit_id)?.code || '';
  }

  function productSaleCurrencyCode(product) {
    return product.sell_currency || product.currency || defaultCurrency;
  }

  function productSalePrice(product, toCurrencyCode = selectedCurrency?.code) {
    const amount = Number(product.sell_price) || 0;
    const fromCurrencyCode = productSaleCurrencyCode(product);
    if (!toCurrencyCode || fromCurrencyCode === toCurrencyCode) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return (
      Number(exchangeRate(amount, fromCurrencyCode, toCurrencyCode)) || 0
    ).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  function closeCustomerMenu() {
    showCustomerMenu = false;
    customerSearch = '';
    barcodeListening = true;
  }

  async function toggleCustomerMenu() {
    if (showCustomerMenu) {
      closeCustomerMenu();
      return;
    }
    showCustomerMenu = true;
    customerSearch = '';
    barcodeListening = false;
    await tick();
    customerSearchInput?.focus();
  }

  function selectCustomer(acc) {
    selectedCustomer = acc;
    showCustomerMenu = false;
    customerSearch = '';
    barcodeListening = true;
  }

  function getWalkinCustomer(list = customers) {
    return list.find((c) => c.code === 'WALKIN') || null;
  }

  function selectWalkinCustomer() {
    const walkin = getWalkinCustomer();
    if (walkin) selectedCustomer = walkin;
    return walkin;
  }

  async function loadCustomerBalance(accountId, currency) {
    const key = `${accountId}:${currency}`;
    if (!accountId || !currency || loadedBalanceKey === key) return;

    loadedBalanceKey = key;
    try {
      const data = await lookupBalances([accountId]);
      if (loadedBalanceKey !== key) return;
      selectedCustomerBalance = {
        amount: balanceAmount(data, accountId, currency),
        currency,
      };
    } catch (error) {
      console.warn('Failed to load customer balance:', error);
      if (loadedBalanceKey === key) {
        selectedCustomerBalance = { amount: 0, currency };
      }
    }
  }

  async function loadCustomers({ preferWalkin = true, selectId = null } = {}) {
    const [customerRows, walkin, treasury] = await Promise.all([
      lookupAccounts({ account_type_id: CUSTOMER_TYPE_ID }),
      lookupAccountByCode('WALKIN'),
      lookupAccountByCode('TREASURY'),
    ]);

    customers = mergeById(customerRows, walkin ? [walkin] : []);
    treasury_ID = treasury?.id || 0;

    if (selectId != null) {
      selectedCustomer = customers.find((c) => c.id === selectId) || selectedCustomer;
    } else if (preferWalkin) {
      selectedCustomer = walkin || selectedCustomer || customers[0] || null;
    } else if (!selectedCustomer) {
      selectedCustomer = walkin || customers[0] || null;
    }
  }


  function handlePaymentCurrencyWindowClick(event) {
    if (
      showPaymentCurrencyMenu &&
      !event.target.closest('.pos-payment-currency-anchor') &&
      !event.target.closest('.payment-currency-filter')
    ) {
      closePaymentCurrencyMenu();
    }
    if (showCustomerMenu && !event.target.closest('.pos-customer-anchor')) {
      closeCustomerMenu();
    }
  }

  $: isWalkinCustomer = selectedCustomer?.code === 'WALKIN';

  // Keep payment filled for walk-in whenever payable amount or currencies change.
  // Dependencies must be read inline so Svelte tracks cart/total updates (not only re-select).
  $: if (isWalkinCustomer) {
    paymentAmount =
      !payableAmount
        ? 0
        : !paymentCurrency || !selectedCurrency?.code || paymentCurrency === selectedCurrency.code
          ? Number(payableAmount || 0)
          : Number(exchangeRate(payableAmount, selectedCurrency.code, paymentCurrency) || 0);
  }

  // --- Load Data ---
  onMount(async () => {
    try {
      if (!isComponent) {
        if (permissions?.some((p) => p.code === 'POS' && p.view)) {
          // Browsers may block without a user gesture; retry on first click.
          enterFullscreen();
          const onFirstInteract = () => {
            enterFullscreen();
            document.removeEventListener('pointerdown', onFirstInteract);
            document.removeEventListener('keydown', onFirstInteract);
          };
          document.addEventListener('pointerdown', onFirstInteract, { once: true });
          document.addEventListener('keydown', onFirstInteract, { once: true });
        }
      }
      const lang = localStorage.getItem('lang') || 'en';
      setLanguage(lang);
      const shouldRtl = isRTL(lang);
      document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
      const mdbCss = document.getElementById('mdb-css');
      const mdbRtlCss = document.getElementById('mdb-rtl-css');
      if (mdbCss && mdbRtlCss) {
        mdbCss['disabled'] = shouldRtl;
        mdbRtlCss['disabled'] = !shouldRtl;
      }
    } catch (e) {}

    try {
      const theme = localStorage.getItem('theme') || 'light';
      document.documentElement.dataset.mdbTheme = theme;
    } catch (e) {}

    const settingsNow = get(settings_all) || [];
    const invoiceSetting = settingsNow.find((row) => row.key === 'invoice_index');
    const prefixSetting = settingsNow.find((row) => row.key === 'pos_index_prefix');

    const [
      warehousesRes,
      categoriesRes,
      currenciesRes,
      unitsRes,
      accountTypesRes,
      invoiceIndexResponse,
      prefixResponse,
      productPage,
    ] = await Promise.all([
      warehouseApi.getAll({ status: 1 }),
      productCategoryApi.getAll({ status: 1 }),
      currencyApi.getAll({ status: 1 }),
      productUnitApi.getAll({ status: 1 }),
      accountTypeApi.getAll({ status: 1 }),
      invoiceSetting
        ? Promise.resolve({ data: [invoiceSetting] })
        : settingsApi.getAll({ status: 1, key: 'invoice_index' }),
      prefixSetting
        ? Promise.resolve({ data: [prefixSetting] })
        : settingsApi.getAll({ status: 1, key: 'pos_index_prefix' }),
      lookupProductsPage({ page: 1, limit: pageSize }),
      loadCustomers({ preferWalkin: true }),
    ]);

    warehouses = warehousesRes?.data || [];
    categories = categoriesRes?.data || [];
    currencies = currenciesRes?.data || [];
    defaultCurrency = currencies.find((c) => c.isDefault)?.code || defaultCurrency;
    units = unitsRes?.data || [];
    accountTypes = (accountTypesRes?.data || []).filter(
      (at) => Number(at.id) === CUSTOMER_TYPE_ID && at.status === 1,
    );
    invoice_index = Number(invoiceIndexResponse?.data?.[0]?.value);
    pos_index_prefix = prefixResponse?.data?.[0]?.value || 'POS-';
    products = (productPage?.data || []).map((product) => ({
      ...product,
      thumbnailUrl: product.thumbnailUrl || '/img/no-image.png',
    }));
    for (const product of products) rememberProduct(product);
    productTotal = productPage?.meta?.total || products.length;

    if (warehouses.length) selectedWarehouse = warehouses.find((w) => w.isDefault) || warehouses[0];

    if (currencies.length) {
      selectedCurrencyId = currencies.find((c) => c.isDefault)?.id || currencies[0].id;
      paymentCurrency = currencies.find((c) => c.id === selectedCurrencyId)?.code || currencies[0].code;
    }

    attachProductThumbnails(products).catch((error) => {
      console.warn('Failed to load product thumbnails:', error);
    });

    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handlePaymentCurrencyWindowClick);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    window.addEventListener('resize', handlePaymentMenuReposition);
    window.addEventListener('scroll', handlePaymentMenuReposition, true);
    syncFullscreenState();
    if (window.mdb) {
      document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      document.querySelectorAll('.dropdown-toggle').forEach((el) => {
        new window.mdb.Dropdown(el);
      });
    }
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('click', handlePaymentCurrencyWindowClick);
    document.removeEventListener('fullscreenchange', syncFullscreenState);
    window.removeEventListener('resize', handlePaymentMenuReposition);
    window.removeEventListener('scroll', handlePaymentMenuReposition, true);
    if (!isComponent) exitFullscreenIfNeeded();
  });

  async function loadProductStocks() {
    if (!selectedWarehouse?.id) {
      productStocks = {};
      warehouseStockLoaded = false;
      return;
    }

    warehouseStockLoaded = false;
    const response = await warehouseProductApi.getAll({
      warehouse_id: selectedWarehouse.id,
      status: 1,
    });
    const nextStocks = {};
    (response?.data || []).forEach((s) => {
      nextStocks[s.product_id] = s.quantity;
    });
    productStocks = nextStocks;
    warehouseStockLoaded = true;
  }

  async function attachProductThumbnails(rows = products) {
    const ids = (rows || [])
      .map((product) => Number(product.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!ids.length) return;

    const response = await productImageApi.getAll({
      status: 1,
      product_ids: ids.join(','),
      thumbnails_only: 1,
      page: 1,
      limit: Math.max(ids.length, pageSize),
    });

    const byProduct = new Map();
    for (const image of response?.data || []) {
      const productId = Number(image.product_id);
      if (!byProduct.has(productId)) {
        byProduct.set(productId, image);
      }
    }

    products = products.map((product) => {
      const image = byProduct.get(Number(product.id));
      if (!image) return product;
      return {
        ...product,
        thumbnailUrl: resolveMediaUrl(image.thumbnail, '/img/no-image.png'),
      };
    });
  }

  async function loadPosProducts() {
    const { data, meta } = await lookupProductsPage({
      search: searchQuery,
      category_id: selectedCategoryId || '',
      page: currentPage,
      limit: pageSize,
    });

    products = (data || []).map((product) => ({
      ...product,
      thumbnailUrl: product.thumbnailUrl || '/img/no-image.png',
    }));
    for (const product of products) rememberProduct(product);
    productTotal = meta?.total || products.length;
    attachProductThumbnails(products).catch((error) => {
      console.warn('Failed to load product thumbnails:', error);
    });
  }

  let productSearchTimer;
  function handleProductSearchInput() {
    currentPage = 1;
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
      loadPosProducts();
    }, 280);
  }

  let customerSearchTimer;
  function handleCustomerSearchInput() {
    const term = String(customerSearch || '').trim();
    clearTimeout(customerSearchTimer);
    if (!term) return;

    customerSearchTimer = setTimeout(async () => {
      const rows = await lookupAccounts({
        account_type_id: CUSTOMER_TYPE_ID,
        search: term,
      });
      customers = mergeById(customers, rows);
    }, 280);
  }

  function changeUnit(item, unitId) {
    unitId = Number(unitId);

    const selectedUnit = item.availableUnits.find((u) => u.id === unitId);

    if (!selectedUnit) return;

    item.selected_unit_id = unitId;

    item.unit_price = item.base_price * selectedUnit.multiplier;

    cart = [...cart];
  }

  function updateQty(item, change) {
    const idx = cart.findIndex((i) => i.id === item.id);
    if (idx === -1) return;
    const newQty = cart[idx].quantity + change;
    if (newQty <= 0) {
      cart.splice(idx, 1);
      cart = [...cart];
      return;
    }
    const selectedUnit = item.availableUnits.find((u) => u.id == item.selected_unit_id);
    const baseQtyNeeded = newQty * (selectedUnit?.multiplier || 1);
    const stockQty = getProductStock(item);
    if (enable_stock_minus || baseQtyNeeded <= stockQty || item.type === 'service') {
      cart[idx].quantity = newQty;
    } else {
      cart[idx].quantity = Math.floor(stockQty / (selectedUnit?.multiplier || 1));
      toast.error(t('Error'), t(`Cannot exceed stock:`) + ` ${stockQty}`);
    }
    cart = [...cart];
  }

  async function finalizePosSale(saleId) {
    try {
      const indexSetting = (await settingsApi.getAll({ status: 1, key: 'invoice_index' }))?.data?.[0];
      if (indexSetting) {
        await settingsApi.update(indexSetting.id, {
          value: String(Number(indexSetting.value || 0) + 1),
        });
      }
    } catch (error) {
      console.warn('Failed to bump POS invoice index:', error);
    }

    try {
      await calculateRemainingAndBenefit(saleId);
    } catch (error) {
      console.warn('Failed to recalculate POS sale totals:', error);
    }

    try {
      await loadProductStocks();
    } catch (error) {
      console.warn('Failed to refresh POS stock:', error);
    }
  }

  function removeFromCart(item) {
    cart = cart.filter((i) => i.id !== item.id);
  }

  // --- Confirm Sale ---
  async function confirmSale() {
    if (isProcessingSale) return;
    isProcessingSale = true;
    if (!selectedWarehouse || !selectedCustomer || cart.length === 0) {
      toast.error(t('Error'), t('Please select Warehouse, Customer, and add items.'));

      isProcessingSale = false;
      return;
    }

    if (!paymentAmount) {
      const ok = await toast.confirm(t('Are you sure?'), t('No payment amount entered. Do you want to proceed?'));
      if (ok) {
        paymentAmount = 0;
      } else {
        isProcessingSale = false;
        return;
      }
    }
    let savedId = null;
    try {
      const payloadItems = cart.map((item) => {
        const unitPrice = exchangeRate(item.unit_price, item.unit_currency, selectedCurrency?.code);
        return {
          product_id: item.id,
          product_unit_id: item.selected_unit_id,
          quantity: item.quantity,
          buy_price: Number(item.buy_price || 0),
          buy_price_currency: resolveCostCurrency(item, item, selectedCurrency?.code),
          unit_price: unitPrice,
          currency: selectedCurrency.code,
          discount_type: 'fixed',
          discount_amount: 0,
          subtotal: exchangeRate(item.quantity * item.unit_price, item.unit_currency, selectedCurrency?.code),
          fifo_cost: 0,
          profit: 0,
          status: 1,
        };
      });

      const payload = {
        warehouse_id: selectedWarehouse.id,
        account_id: selectedCustomer.id,
        sale_type: 'pos',
        invoice_number: pos_index_prefix + invoice_index,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        total_amount: payableAmount,
        discount_amount: Number(discount_amount || 0),
        discount_type,
        expense_amount: Number(expense_amount || 0),
        currency: selectedCurrency.code,
        invoice_status: 'confirmed',
        status: 1,
        remaining: payableAmount,
        items_count: cart.length,
        items: payloadItems,
      };

      /*
       * The backend creates the confirmed POS sale, deducts stock,
       * posts the customer/RECEIVABLE journal and logs the activity
       * atomically.
       */
      const createResponse = await saleApi.create(payload);
      const createdSale = createResponse?.data;
      savedId = createdSale?.id;

      if (paymentAmount && savedId) {
        const payCurrency = paymentCurrency || selectedCurrency.code;
        await saleApi.addPayment(savedId, {
          account_id: treasury_ID || selectedCustomer.id,
          amount: Number(paymentAmount || 0),
          currency: payCurrency,
          payment_date: new Date().toISOString(),
          description: 'POS Cash Payment',
          status: 1,
        });
      }

      const receiptCart = cart;
      receiptSale = {
        ...(createdSale || {}),
        total_amount: payableAmount,
        discount_amount: Number(discount_amount || 0),
        discount_type,
        expense_amount: Number(expense_amount || 0),
        currency: selectedCurrency.code,
        invoice_date: createdSale?.invoice_date || payload.invoice_date,
        invoice_number: createdSale?.invoice_number || payload.invoice_number,
        remaining: Math.max(Number(payableAmount) - Number(paymentAmount || 0), 0),
      };
      receiptItems = receiptCart.map((item) => {
        const selectedUnit = item.availableUnits?.find((u) => u.id == item.selected_unit_id);
        return {
          product_id: item.id,
          product_name: item.name,
          product_unit_id: item.selected_unit_id,
          quantity: item.quantity,
          unit_price: exchangeRate(item.unit_price, item.unit_currency, selectedCurrency?.code),
          subtotal: exchangeRate(
            item.quantity * item.unit_price,
            item.unit_currency,
            selectedCurrency?.code,
          ),
          currency: selectedCurrency.code,
          unit_name: selectedUnit?.name || '',
          currency_symbol: selectedCurrency?.symbol || '',
          status: 1,
        };
      });
      receiptPayments = Number(paymentAmount)
        ? [
            {
              amount: Number(paymentAmount),
              currency: paymentCurrency || selectedCurrency.code,
              status: 1,
            },
          ]
        : [];

      receiptCustomer = selectedCustomer;

      if (enable_a4_default_print_mode) {
        showA4Receipt = true;
      } else {
        showReceipt = true;
      }

      cart = [];
      selectWalkinCustomer();
      invoice_index = Number(invoice_index) + 1;

      if (savedId) {
        finalizePosSale(savedId);
      }
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Error recording sale: ') + err.message);
    } finally {
      isProcessingSale = false; // 🔓 always release lock
    }
  }

  // --- Watch warehouse change ---
  // --- Watch warehouse change handled by loadedWarehouseId ---

  $: cartTotals = {
    subtotal: totalAmount,
    total: totalAmount,
    currencySymbol: t(selectedCurrency?.code) || t('AFN'),
  };

  $: selectedCurrency = currencies.find((c) => c.id == selectedCurrencyId) || currencies[0];

  $: if (selectedCurrency?.code && !paymentCurrency) {
    paymentCurrency = selectedCurrency.code;
  }

  let selectedCategoryId = null;
  $: selectedCategory = categories.find((c) => c.id == selectedCategoryId) || null;

  $: categoryFilterOptions = [
    { value: '', label: t('All Categories') },
    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
  ];
  $: currencyFilterOptions = currencies.map((cur) => ({ value: cur.id, label: t(cur.code) }));
  $: warehouseFilterOptions = [
    { value: '', label: t('Select Warehouse') },
    ...warehouses.map((wh) => ({ value: wh.id, label: wh.name })),
  ];

  // Build lookup map
  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

  // Get full unit chain recursively
  function getUnitHierarchy(unitId) {
    const result = [];

    function traverse(id, multiplier = 1) {
      const unit = unitMap[id];
      if (!unit) return;

      result.push({
        ...unit,
        multiplier,
      });

      if (unit.subunit_id) {
        traverse(unit.subunit_id, multiplier / (unit.subunit_multiple || 1));
      }
    }

    traverse(unitId);
    return result;
  }
  function rememberProduct(product) {
    const code = String(product?.code || '').trim().toLowerCase();
    if (!code) return;
    productByCode.set(code, product);
  }

  function getProductStock(product) {
    if (!product) return 0;
    const mapped = productStocks[product.id];
    if (mapped != null && mapped !== '') return Number(mapped) || 0;
    return Number(product.quantity || 0);
  }

  function stripBarcodeFromActiveField(code) {
    const scanned = String(code || '');
    if (!scanned) return;

    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      const current = String(el.value || '');
      if (current === scanned || current.endsWith(scanned)) {
        el.value = current === scanned ? '' : current.slice(0, current.length - scanned.length);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    if (searchQuery === scanned || String(searchQuery || '').endsWith(scanned)) {
      searchQuery = searchQuery === scanned ? '' : String(searchQuery).slice(0, String(searchQuery).length - scanned.length);
    }
  }

  async function commitBarcode(code) {
    const trimmed = String(code || '').trim();
    if (!trimmed || trimmed.length < BARCODE_MIN_LENGTH || barcodeBusy) return;

    barcodeBusy = true;
    stripBarcodeFromActiveField(trimmed);

    try {
      await handleBarcodeScan(trimmed);
    } finally {
      barcodeBusy = false;
    }
  }

  async function handleBarcodeScan(code) {
    if (!code) return;

    const trimmedCode = String(code).trim().toLowerCase();

    let product =
      productByCode.get(trimmedCode) ||
      products.find((row) => String(row.code || '').trim().toLowerCase() === trimmedCode) ||
      cart.find((row) => String(row.code || '').trim().toLowerCase() === trimmedCode) ||
      null;

    if (!product) {
      const matches = await lookupProducts({
        search: String(code).trim(),
        limit: 10,
      });
      product =
        matches.find((row) => String(row.code || '').trim().toLowerCase() === trimmedCode) ||
        null;
    }

    if (!product) {
      toast.error(t('Error'), t('Product not found for barcode:') + ` ${code}`);
      return;
    }

    rememberProduct(product);
    addOrIncreaseProduct(product);
  }

  function addOrIncreaseProduct(product) {
    if (!selectedWarehouse) {
      toast.error(t('Error'), t('Please select a warehouse.'));
      return;
    }

    const stockQty = getProductStock(product);

    if (
      !enable_stock_minus &&
      warehouseStockLoaded &&
      stockQty <= 0 &&
      product.type !== 'service'
    ) {
      toast.error(t('Error'), t(`Out of stock for`) + ` ${product.name}`);
      return;
    }

    const existing = cart.find((i) => String(i.id) === String(product.id));

    if (existing) {
      const selectedUnit = existing.availableUnits.find((u) => u.id == existing.selected_unit_id);

      const multiplier = selectedUnit?.multiplier || 1;
      const newQty = existing.quantity + 1;
      const baseQtyNeeded = newQty * multiplier;

      if (
        !enable_stock_minus &&
        warehouseStockLoaded &&
        baseQtyNeeded > stockQty &&
        product.type !== 'service'
      ) {
        toast.error(t('Error'), t(`Cannot exceed stock:`) + ` ${stockQty}`);
        return;
      }

      existing.quantity = newQty;
      cart = [...cart];
    } else {
      const unitHierarchy = getUnitHierarchy(product.product_unit_id);

      cart = [
        ...cart,
        {
          ...product,
          quantity: 1,
          type: product.type,
          thumbnailUrl: product.thumbnailUrl,
          buy_price: product.buy_price,
          buy_price_currency: product.buy_currency,
          base_price: product.sell_price,
          selected_unit_id: product.product_unit_id,
          unit_price: product.sell_price,
          unit_currency: productSaleCurrencyCode(product),
          availableUnits: unitHierarchy,
        },
      ];
    }
  }

  function handleKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === 'Escape' && showCustomerMenu) {
      closeCustomerMenu();
      e.preventDefault();
      return;
    }

    const now = Date.now();
    const gap = now - barcodeLastKeyAt;
    barcodeLastKeyAt = now;

    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= BARCODE_MIN_LENGTH) {
        e.preventDefault();
        e.stopPropagation();
        const code = barcodeBuffer;
        barcodeBuffer = '';
        clearTimeout(barcodeTimeout);
        commitBarcode(code);
      }
      return;
    }

    if (e.key.length !== 1) return;

    if (gap > BARCODE_CHAR_GAP_MS * 2) {
      barcodeBuffer = e.key;
    } else {
      barcodeBuffer += e.key;
      if (barcodeBuffer.length >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    clearTimeout(barcodeTimeout);
    barcodeTimeout = setTimeout(() => {
      const code = barcodeBuffer;
      barcodeBuffer = '';
      if (code.length >= BARCODE_MIN_LENGTH) {
        commitBarcode(code);
      }
    }, BARCODE_COMMIT_MS);
  }

  $: paymentCurrencyObj = currencies.find((c) => c.code === paymentCurrency) || null;
  $: defaultCurrencyObj = currencies.find((c) => c.isDefault) || null;
  $: showPaymentRateEdit =
    paymentCurrencyObj && defaultCurrencyObj && paymentCurrencyObj.id !== defaultCurrencyObj.id;

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    if (fromCurrencyCode === toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (Number(amount) / toRate) * fromRate;
  }

  let editPaymentCurrencyRate = false;

  let showCustomerMenu = false;
  let customerSearch = '';
  let customerSearchInput = null;

  $: filteredCustomers = customers.filter((acc) => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      customerDisplayName(acc),
      acc.name,
      acc.name_fa,
      acc.name_ps,
      acc.code,
      acc.phone,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  let form_category_search = '';
  let showCategoryDropdown = true;
  let filteredCategories = [];
  let form_category_search_input = null;
</script>

{#if !permissions?.some((p) => p.code === 'POS' && p.view)}
  <h3 class="text-danger m-3">
    <a class="btn btn-light me-2" href="/#/dashboard/sales" title={t('Sales')} aria-label={t('Sales')}>
      <i class="bi bi-arrow-right"></i>
    </a><i class="bi bi-exclamation-triangle me-2"></i>{t('No access allowed')}
  </h3>
{:else}
  <input
    type="text"
    id="barcodeInput"
    style="position:absolute; opacity:0; height:0; pointer-events:none;"
    autocomplete="off" />
  <div class="pos-page">
    <div class="pos-layout">
      <!-- Products panel -->
      <section class="pos-products-panel">
        <header class="pos-toolbar">
          <div class="pos-toolbar__row pos-toolbar__row--brand">
            <div class="pos-title">
              {#if !isComponent}
                <a class="pos-logo-btn" href="/#/dashboard" title="ZENO ERP" aria-label="ZENO ERP">
                  <img src="/img/logo.png" alt="ZENO ERP" class="pos-logo-img" />
                </a>
                <button
                  class="pos-icon-btn"
                  type="button"
                  title={isFullscreen ? t('Zoom Out') : t('Zoom In')}
                  aria-label={isFullscreen ? t('Zoom Out') : t('Zoom In')}
                  on:click={toggleFullscreen}>
                  <i class="bi {isFullscreen ? 'bi-fullscreen-exit' : 'bi-arrows-fullscreen'}"></i>
                </button>
              {:else}
                <img src="/img/logo.png" alt="ZENO ERP" class="pos-logo-img" />
              {/if}
              <span>{t('POS')}</span>
            </div>
            <div class="pos-toolbar__actions">
              <button class="pos-sales-btn" type="button" title={t('New Sale')} on:click={() => openSalesModal()}>
                <i class="bi bi-plus-lg"></i>
                {t('New Sale')}
              </button>
            </div>
          </div>

          <div class="pos-toolbar__row pos-toolbar__row--filters">
            <div class="pos-search-wrap">
              <i class="bi bi-search pos-search-icon"></i>
              <input
                type="text"
                class="form-control form-control-sm pos-search-input"
                placeholder={t('Search products...')}
                bind:value={searchQuery}
                on:input={handleProductSearchInput}
                on:focus={() => (barcodeListening = false)}
                on:blur={() => (barcodeListening = true)} />
            </div>

            <div class="pos-inline-filter pos-inline-filter--currency">
              <FilterSelect
                compact
                label={t('Sale Currency')}
                icon="bi-currency-exchange"
                value={selectedCurrencyId ?? ''}
                options={currencyFilterOptions}
                on:change={(e) => {
                  selectedCurrencyId = e.detail === '' || e.detail == null ? null : Number(e.detail);
                  if (!paymentCurrency) paymentCurrency = selectedCurrency?.code;
                }} />
            </div>

            <div class="pos-inline-filter">
              <FilterSelect
                compact
                label={t('Category')}
                icon="bi-grid"
                value={selectedCategoryId ?? ''}
                options={categoryFilterOptions}
                on:change={(e) => {
                  selectedCategoryId = e.detail === '' || e.detail == null ? null : Number(e.detail);
                  form_category_search = '';
                  showCategoryDropdown = false;
                  currentPage = 1;
                  loadPosProducts();
                }} />
            </div>

            <div class="pos-inline-filter">
              <FilterSelect
                compact
                label={t('Warehouse')}
                icon="bi-building"
                value={selectedWarehouse?.id ?? ''}
                options={warehouseFilterOptions}
                on:change={(e) => {
                  const warehouseId = e.detail === '' || e.detail == null ? null : Number(e.detail);
                  selectedWarehouse =
                    warehouseId == null ? null : warehouses.find((warehouse) => warehouse.id === warehouseId) || null;
                }} />
            </div>
          </div>
        </header>

        <div class="products-container pos-products-scroll">
          <div class="pos-products-grid">
            {#each gridProducts as product (product.id)}
              <div
                class="pos-product-card"
                role="button"
                tabindex="0"
                on:click={() => addOrIncreaseProduct(product)}
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addOrIncreaseProduct(product);
                  }
                }}>
                <div class="pos-product-card__media">
                  <img src={product.thumbnailUrl} alt={product.name} class="pos-product-card__img" loading="lazy" />
                  {#if productStocks[product.id] <= product.alarm_quantity && productStocks[product.id] > 0}
                    <span class="pos-product-card__badge pos-product-card__badge--low">{t('Low')}</span>
                  {/if}
                  <span class="pos-product-card__star" aria-hidden="true">
                    <i class="bi bi-star"></i>
                  </span>
                </div>
                <div class="pos-product-card__body">
                  <h3 class="pos-product-card__name">{product.name}</h3>

                  <div class="pos-product-card__divider" aria-hidden="true"></div>

                  <div class="pos-product-card__details">
                    {#if product.code}
                      <div class="pos-product-card__detail">
                        <span class="pos-product-card__detail-icon">
                          <i class="bi bi-upc-scan" aria-hidden="true"></i>
                        </span>
                        <span class="pos-product-card__detail-label">{t('Barcode')}:</span>
                        <span
                          class="pos-product-card__detail-value pos-product-card__detail-value--code"
                          title={product.code}
                          dir="ltr">{product.code}</span>
                      </div>
                    {/if}
                    <div class="pos-product-card__detail">
                      <span class="pos-product-card__detail-icon">
                        <i class="bi bi-box-seam" aria-hidden="true"></i>
                      </span>
                      <span class="pos-product-card__detail-label">{t('Stock')}:</span>
                      <span class="pos-product-card__detail-value">
                        {Number(productStocks[product.id] || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {productUnitCode(product)}
                        {#if (productStocks[product.id] || 0) > 0}
                          <span class="pos-product-card__stock-dot" aria-hidden="true"></span>
                        {/if}
                      </span>
                    </div>
                  </div>

                  <div class="pos-product-card__divider" aria-hidden="true"></div>

                  <div class="pos-product-card__footer">
                    <div class="pos-product-card__price">
                      <span class="pos-product-card__price-value">
                        {productSalePrice(product, selectedCurrency?.code)}
                      </span>
                      <span class="pos-product-card__price-currency">{t(selectedCurrency?.code) || t('AFN')}</span>
                    </div>
                    <button
                      type="button"
                      class="pos-product-card__add"
                      on:click|stopPropagation={() => addOrIncreaseProduct(product)}
                      aria-label="+">
                      <i class="bi bi-plus-lg"></i>
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          {#if gridProducts.length === 0}
            <div class="pos-empty">
              <i class="bi bi-box-seam"></i>
              <p>{t('No products found.')}</p>
            </div>
          {/if}

          <footer class="pos-pagination-bar">
            <div class="pos-pagination-info">
              {t('Showing')}
              {productTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              {t('to')}
              {Math.min(currentPage * pageSize, productTotal)}
              {t('of')}
              {productTotal}
              {t('entries')}
            </div>
            <div class="pos-pagination-controls">
              <select
                class="form-select form-select-sm pos-page-size"
                value={pageSize}
                on:change={(e) => {
                  pageSize = Number(e.target.value) || 25;
                  currentPage = 1;
                  loadPosProducts();
                }}>
                <option value={12}>12</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              {#if totalPages > 1}
                <nav class="pos-pagination">
                  <ul class="pagination pagination-sm mb-0">
                    <li class="page-item {currentPage === 1 ? 'disabled' : ''}">
                      <button class="page-link" type="button" on:click={() => goToPage(currentPage - 1)}>«</button>
                    </li>
                    {#if visiblePages[0] > 1}
                      <li class="page-item">
                        <button class="page-link" type="button" on:click={() => goToPage(1)}>1</button>
                      </li>
                      {#if visiblePages[0] > 2}
                        <li class="page-item disabled"><span class="page-link">…</span></li>
                      {/if}
                    {/if}
                {#each visiblePages as page (page)}
                  <li class="page-item {currentPage === page ? 'active' : ''}">
                    <button class="page-link" type="button" on:click={() => goToPage(page)}>{page}</button>
                  </li>
                {/each}
                    {#if visiblePages[visiblePages.length - 1] < totalPages}
                      {#if visiblePages[visiblePages.length - 1] < totalPages - 1}
                        <li class="page-item disabled"><span class="page-link">…</span></li>
                      {/if}
                      <li class="page-item">
                        <button class="page-link" type="button" on:click={() => goToPage(totalPages)}>{totalPages}</button>
                      </li>
                    {/if}
                    <li class="page-item {currentPage === totalPages ? 'disabled' : ''}">
                      <button class="page-link" type="button" on:click={() => goToPage(currentPage + 1)}>»</button>
                    </li>
                  </ul>
                </nav>
              {/if}
            </div>
          </footer>
        </div>
      </section>

      <!-- Cart panel -->
      <aside class="pos-cart-panel">
        <div class="pos-cart-header">
          <div class="pos-cart-title">
            <i class="bi bi-cart3"></i>
            <span>{t('Sales Cart')}</span>
            {#if cart.length > 0}
              <span class="pos-cart-count">{cart.length}</span>
            {/if}
          </div>
          {#if cart.length > 0}
            <button class="pos-clear-btn" type="button" on:click={() => (cart = [])}>
              <i class="bi bi-trash"></i> {t('Clear')}
            </button>
          {/if}
        </div>

        <div class="pos-cart-items">
          {#each cart as item (item.id)}
            <article class="pos-cart-item">
              <img src={item.thumbnailUrl} alt={item.name} class="pos-cart-item__thumb" />
              <div class="pos-cart-item__content">
                <div class="pos-cart-item__top">
                  <div class="pos-cart-item__name">{item.name}</div>
                  <button
                    type="button"
                    class="pos-cart-item__remove"
                    on:click={() => removeFromCart(item)}
                    aria-label="remove">
                    <i class="bi bi-x-lg"></i>
                  </button>
                </div>
                <div class="input-group input-group-sm pos-cart-item__price-row">
                  <input
                    class="form-control form-control-sm"
                    type="number"
                    value={item.unit_price}
                    on:focus={() => (barcodeListening = false)}
                    on:blur={() => (barcodeListening = true)}
                    on:input={(e) => {
                      const newPrice = Number(e.target.value);
                      if (!isNaN(newPrice)) {
                        item.unit_price = newPrice;
                        cart = [...cart];
                      }
                    }} />
                  <span class="input-group-text">{t(item.unit_currency)}</span>
                  {#if item.availableUnits.length > 1}
                    <select
                      class="form-select form-select-sm"
                      bind:value={item.selected_unit_id}
                      on:change={(e) => changeUnit(item, Number(e.target.value))}>
                      {#each item.availableUnits as u (u.id)}
                        <option value={u.id}>{u.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <span class="input-group-text">{item.availableUnits[0]?.name}</span>
                  {/if}
                </div>
                <div class="pos-cart-item__qty-row">
                  <div class="pos-qty">
                    <button class="pos-qty__btn" type="button" on:click={() => updateQty(item, -1)}>−</button>
                    <input
                      type="number"
                      class="pos-qty__input"
                      value={item.quantity}
                      on:focus={() => (barcodeListening = false)}
                      on:blur={() => (barcodeListening = true)}
                      on:input={(e) => {
                        const newQty = Number(e.target.value);
                        if (!isNaN(newQty)) {
                          updateQty(item, newQty - item.quantity);
                        }
                      }} />
                    <button class="pos-qty__btn" type="button" on:click={() => updateQty(item, 1)}>+</button>
                  </div>
                  <span class="pos-cart-item__line-total">
                    {exchangeRate(
                      Number(item.quantity || 0) * Number(item.unit_price || 0),
                      item.unit_currency,
                      selectedCurrency?.code,
                    ).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {t(selectedCurrency?.code)}
                  </span>
                </div>
              </div>
            </article>
          {:else}
            <div class="pos-cart-empty">
              <i class="bi bi-cart3"></i>
              <p>{t('Cart is empty')}</p>
            </div>
          {/each}
        </div>

        <div class="pos-cart-footer">
          <div class="pos-summary-row pos-summary-row--customer">
  <div class="pos-cart-customer pos-cart-customer--footer">
    <div class="pos-customer-field">
      <span class="pos-customer-field__label">
        <i class="bi bi-person" aria-hidden="true"></i>
        {t('Customer')}
      </span>

      <div class="pos-customer-anchor">
        <div class="pos-customer-control {showCustomerMenu ? 'is-open' : ''}">
          <span class="pos-customer-control__icon" aria-hidden="true">
            <i class="bi bi-person"></i>
          </span>

          {#if showCustomerMenu}
            <input
              class="pos-customer-search"
              type="text"
              bind:value={customerSearch}
              bind:this={customerSearchInput}
              placeholder={t('Select Customer')}
              aria-label={t('Select Customer')}
              aria-autocomplete="list"
              aria-controls="pos-customer-listbox"
              autocomplete="off"
              on:click|stopPropagation
              on:input={handleCustomerSearchInput}
              on:focus={() => (barcodeListening = false)}
              on:blur={() => {
                setTimeout(() => {
                  if (!showCustomerMenu) barcodeListening = true;
                }, 150);
              }} />
          {:else}
            <button
              type="button"
              class="pos-selected-customer"
              aria-expanded="false"
              aria-haspopup="listbox"
              aria-controls="pos-customer-listbox"
              on:click|stopPropagation={toggleCustomerMenu}>
              <span class="pos-selected-customer__identity">
                <span class="pos-selected-customer__name">
                  {selectedCustomer
                    ? customerDisplayName(selectedCustomer)
                    : t('Select Customer')}
                </span>
                {#if selectedCustomerBalance !== null}
                  <span class="pos-selected-customer__divider" aria-hidden="true"></span>
                  <span
                    class="pos-selected-customer__balance"
                    class:is-negative={selectedCustomerBalance.amount < 0}>
                    <b dir="ltr">
                      {selectedCustomerBalance.amount.toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </b>
                    <small>{t(selectedCustomerBalance.currency)}</small>
                  </span>
                {/if}
              </span>

              <i
                class="bi {selectedCustomer ? 'bi-pencil-square' : 'bi-chevron-down'}"
                aria-hidden="true"></i>
            </button>
          {/if}

          <button
            class="pos-customer-add"
            type="button"
            title={t('Add Account')}
            aria-label={t('Add Account')}
            on:click|stopPropagation={() => accountModalRef.openModal()}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            <span>{t('Add')}</span>
          </button>
        </div>

        {#if showCustomerMenu}
          <ul
            id="pos-customer-listbox"
            class="pos-customer-menu"
            role="listbox">
            {#each filteredCustomers as acc (acc.id)}
              <li
                role="option"
                aria-selected={selectedCustomer?.id === acc.id}>
                <button
                  type="button"
                  class="pos-customer-menu__item"
                  class:is-selected={selectedCustomer?.id === acc.id}
                  on:mousedown|preventDefault|stopPropagation={() =>
                    selectCustomer(acc)}>
                  <span class="pos-customer-menu__avatar" aria-hidden="true">
                    <i class="bi bi-person"></i>
                  </span>

                  <span class="pos-customer-menu__copy">
                    <strong>{customerDisplayName(acc)}</strong>
                    <small>{t('Customer')}</small>
                  </span>

                  <i
                    class="bi bi-chevron-right pos-customer-menu__arrow"
                    aria-hidden="true"></i>
                </button>
              </li>
            {:else}
              <li role="presentation">
                <span class="pos-customer-menu__empty">
                  <i class="bi bi-search" aria-hidden="true"></i>
                  {t('No accounts found.')}
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</div>

          <div class="pos-summary-row">
            <span>{t('Subtotal')}</span>
            <strong>{(cartTotals?.subtotal || 0).toFixed(2)} {cartTotals?.currencySymbol || '$'}</strong>
          </div>
          <div class="pos-summary-row pos-summary-row--input">
            <span>{t('Discount')}</span>
            <div class="pos-summary-controls">
              <div class="input-group input-group-sm pos-discount-group">
                <button
                  class="btn btn-sm {discount_type === 'fixed' ? 'pos-toggle-active' : 'pos-toggle'}"
                  type="button"
                  on:click={() => {
                    if (discount_type === 'percent') {
                      discount_amount = Number(cartTotals.subtotal * (discount_amount / 100)).toFixed(2);
                      discount_type = 'fixed';
                    } else {
                      discount_amount =
                        cartTotals.subtotal > 0 ? Number((discount_amount / cartTotals.subtotal) * 100).toFixed(2) : 0;
                      discount_type = 'percent';
                    }
                  }}>
                  {discount_type === 'fixed' ? t(selectedCurrency?.code || 'AFN') : '%'}
                </button>
                <input
                  type="number"
                  class="form-control form-control-sm"
                  bind:value={discount_amount}
                  on:focus={() => (barcodeListening = false)}
                  on:blur={() => (barcodeListening = true)}
                  on:input={() => {
                    if (discount_amount < 0) discount_amount = 0;
                    if (discount_type === 'percent' && discount_amount > 100) discount_amount = 100;
                    if (discount_type === 'fixed' && discount_amount > cartTotals.subtotal)
                      discount_amount = cartTotals.subtotal;
                  }} />
              </div>
            </div>
          </div>
          <div class="pos-summary-row pos-summary-row--input">
            <span>{t('Expenses')}</span>
            <input
              type="number"
              class="form-control form-control-sm pos-summary-input"
              bind:value={expense_amount}
              on:focus={() => (barcodeListening = false)}
              on:blur={() => (barcodeListening = true)}
              on:input={() => {
                if (expense_amount < 0) expense_amount = 0;
              }} />
          </div>
          <div class="pos-summary-row pos-summary-row--total">
            <span>{t('Payable')}</span>
            <span class="pos-payable">
              {Number(payableAmount || 0).toFixed(2)} {cartTotals?.currencySymbol || '$'}
            </span>
          </div>

          <div class="pos-summary-row pos-summary-row--payment">
            <span>{t('Payment')}</span>
            <div class="pos-payment-controls">
              <input
                type="number"
                class="form-control form-control-sm fw-bold pos-payment-amount"
                disabled={isWalkinCustomer}
                bind:value={paymentAmount}
                on:focus={() => (barcodeListening = false)}
                on:blur={() => (barcodeListening = true)}
                on:input={() => {
                  if (paymentAmount < 0) paymentAmount = 0;
                  const maxPay = getMaxPaymentAmount();
                  if (paymentAmount > maxPay) paymentAmount = maxPay;
                }} />

              <div class="pos-filter-anchor pos-payment-currency-anchor">
                <button
                  bind:this={paymentCurrencyBtnEl}
                  type="button"
                  class="pos-filter-toggle pos-filter-toggle--compact {showPaymentCurrencyMenu ? 'is-open' : ''}"
                  aria-expanded={showPaymentCurrencyMenu}
                  aria-label={t('Payment Currency')}
                  on:click|stopPropagation={togglePaymentCurrencyMenu}>
                  <i class="bi bi-currency-exchange"></i>
                  {t(paymentCurrency || selectedCurrency?.code || 'AFN')}
                  <i class="bi bi-chevron-down"></i>
                </button>
              </div>
            </div>
          </div>
          {#if paymentCurrency && selectedCurrency?.code && paymentCurrency !== selectedCurrency.code}
            <div class="pos-payment-equiv">
              ≈ {Number(getMaxPaymentAmount() || 0).toFixed(2)}
              {t(paymentCurrency)}
              <span class="text-muted">({t('Payable')}: {Number(payableAmount || 0).toFixed(2)} {t(selectedCurrency.code)})</span>
            </div>
          {/if}

          <button
            class="pos-confirm-btn"
            type="button"
            on:click={confirmSale}
            disabled={cart.length === 0 || !selectedCustomer || isProcessingSale}>
            <i class="bi bi-check2-circle"></i>
            {t('Confirm Sale')}
          </button>
        </div>
      </aside>
    </div>
  </div>

  {#if showPaymentCurrencyMenu}
    <div
      bind:this={paymentMenuEl}
      class="filter currency-filter payment-currency-filter"
      style={paymentMenuStyle}
      role="dialog"
      aria-label={t('Payment Currency')}
      on:click|stopPropagation>
      <div class="filter__header">
        <div>
          <h6 class="filter__title">{t('Payment Currency')}</h6>
          <p class="filter__subtitle">{t('Select Currency')}</p>
        </div>
        <button
          type="button"
          class="filter__close"
          title={t('Close')}
          aria-label={t('Close')}
          on:click={closePaymentCurrencyMenu}>
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div class="filter__body">
        <div class="pos-currency-pills pos-currency-pills--dropdown pos-currency-pills--payment">
          {#each currencies as cur (cur.id)}
            <button
              type="button"
              class="pos-currency-pill {paymentCurrency === cur.code ? 'is-active' : ''}"
              on:click={() => selectPaymentCurrency(cur.code)}>
              {t(cur.code)}
            </button>
          {/each}
        </div>

        {#if showPaymentRateEdit}
          <div class="pos-rate-row pos-rate-row--dropdown">
            {#if !editPaymentCurrencyRate}
              <span class="pos-rate-label">
                1 {t(paymentCurrencyObj.code)} =
                {Number(paymentCurrencyObj.exchangeRate).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 3,
                })}
                {t(defaultCurrency)}
              </span>
              <button
                class="pos-icon-btn pos-icon-btn--sm"
                type="button"
                title={t('Select Currency')}
                aria-label={t('Select Currency')}
                on:click={async () => {
                  editPaymentCurrencyRate = true;
                  await tick();
                  positionPaymentMenu();
                }}>
                <i class="bi bi-pencil"></i>
              </button>
            {:else}
              <div class="input-group input-group-sm">
                <span class="input-group-text">1 {t(paymentCurrencyObj.code)} =</span>
                <input
                  type="number"
                  class="form-control form-control-sm pos-currency-rate-input"
                  bind:value={paymentCurrencyObj.exchangeRate}
                  min="0"
                  step="0.01"
                  on:focus={() => (barcodeListening = false)}
                  on:blur={() => (barcodeListening = true)} />
                <span class="input-group-text">{t(defaultCurrency)}</span>
                <button
                  class="btn btn-primary btn-sm"
                  type="button"
                  title={t('Select Currency')}
                  aria-label={t('Select Currency')}
                  on:click={async () => {
                    editPaymentCurrencyRate = false;
                    await currencyApi.update(paymentCurrencyObj.id, {
                      name: paymentCurrencyObj.name,
                      code: paymentCurrencyObj.code,
                      symbol: paymentCurrencyObj.symbol,
                      isDefault: paymentCurrencyObj.isDefault,
                      exchangeRate: Number(paymentCurrencyObj.exchangeRate),
                      exchangeRateDate: paymentCurrencyObj.exchangeRateDate,
                      status: 1,
                    });
                    positionPaymentMenu();
                  }}>
                  <i class="bi bi-check"></i>
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="filter__footer">
        <button type="button" class="filter__apply" on:click={closePaymentCurrencyMenu}>
          {t('Apply')}
        </button>
      </div>
    </div>
  {/if}

  {#if showReceipt && SaleReceiptModalCmp}
    <svelte:component
      this={SaleReceiptModalCmp}
      sale={receiptSale}
      items={receiptItems}
      payments={receiptPayments}
      customer={receiptCustomer}
      {units}
      {currencies}
      on:close={() => ((showReceipt = false), (receiptSale = null), (receiptItems = []), (receiptPayments = []), (receiptCustomer = null))}
      on:showA4={() => ((showA4Receipt = true), (showReceipt = false))} />
  {/if}

  {#if showA4Receipt && SaleA4ReceiptModalCmp}
    <svelte:component
      this={SaleA4ReceiptModalCmp}
      sale={receiptSale}
      items={receiptItems}
      payments={receiptPayments}
      customer={receiptCustomer}
      {units}
      {currencies}
      on:close={() => ((showA4Receipt = false), (receiptSale = null), (receiptItems = []), (receiptPayments = []), (receiptCustomer = null))}
      on:show80mm={() => ((showReceipt = true), (showA4Receipt = false))} />
  {/if}

  <AccountModal
    bind:this={accountModalRef}
    {accountTypes}
    on:saved={async (e) => {
      const newAccount = e.detail.account;
      await loadCustomers({
        preferWalkin: !(newAccount && newAccount.account_type_id == 4),
        selectId: newAccount && newAccount.account_type_id == 4 ? newAccount.id : null,
      });
    }} />

  {#if showSalesModal && SalesCmp}
    <div
      class="pos-sales-modal-backdrop"
      role="presentation"
      aria-hidden="true"
      on:click={closeSalesModal}></div>
    <div
      class="modal fade show d-block pos-sales-modal"
      tabindex="-1"
      aria-labelledby="showSalesModalLabel"
      aria-hidden="true">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="showSalesModalLabel">
              <i class="bi bi-cart"></i>
              {t('Sales')}
            </h5>
            <button
              type="button"
              class="btn-close"
              title={t('Sales')}
              aria-label={t('Sales')}
              on:click={closeSalesModal}></button>
          </div>
          <div class="modal-body pos-sales-modal__body">
            <svelte:component this={SalesCmp} embedded />
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .pos-page {
    --pos-accent: #0f6efd;
    --pos-accent-soft: #eff6ff;
    --pos-border: #e2e8f0;
    --pos-muted: #64748b;
    --pos-text: #0f172a;
    --pos-panel: #ffffff;
    --pos-panel-soft: #f8fafc;
    --pos-control: #ffffff;
    --pos-control-hover: #eff6ff;
    --pos-control-text: #334155;
    --pos-card: #ffffff;
    --pos-shadow: rgba(15, 23, 42, 0.08);
    font-size: 13px;
    padding: 0.25rem;
    height: 100vh;
    min-height: 0;
    background: var(--erp-bg, #f8fafc);
    container-type: inline-size;
    overflow: hidden;
  }

  :global(html.dark) .pos-page {
    --pos-accent: #60a5fa;
    --pos-accent-soft: rgba(96, 165, 250, 0.14);
    --pos-border: #334155;
    --pos-muted: #94a3b8;
    --pos-text: #e5edf7;
    --pos-panel: #111827;
    --pos-panel-soft: #0f172a;
    --pos-control: #162033;
    --pos-control-hover: #1e293b;
    --pos-control-text: #dbeafe;
    --pos-card: #162033;
    --pos-shadow: rgba(0, 0, 0, 0.32);
    color: var(--pos-text);
    background: #0b1120;
    color-scheme: dark;
  }

  .pos-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 330px);
    gap: 0.25rem;
    align-items: stretch;
    height: 100%;
    min-height: 0;
  }

  .pos-products-panel,
  .pos-cart-panel {
    display: flex;
    flex-direction: column;
    background: var(--pos-panel);
    border: 1px solid var(--erp-surface-glass-border, var(--pos-border));
    border-radius: 0.5rem;
    min-height: 0;
  }

  .pos-cart-panel {
    overflow: visible;
    align-self: stretch;
    height: 100%;
    min-height: 0;
  }

  .pos-products-panel {
    overflow: hidden;
  }

  .pos-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.4rem 0.5rem;
    background: var(--pos-panel);
    border-bottom: 1px solid var(--pos-border);
    flex-shrink: 0;
  }

  .pos-toolbar__row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .pos-toolbar__row--brand {
    justify-content: space-between;
  }

  .currency-filter {
    width: min(220px, calc(100vw - 2rem));
  }

  .currency-filter .filter__footer {
    justify-content: flex-end;
  }

  .pos-currency-pills--dropdown {
    margin-bottom: 0;
  }

  .pos-currency-pills--payment {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .pos-currency-pills--payment .pos-currency-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 auto;
    min-width: 0;
    border-radius: 999px;
    min-height: 2rem;
    padding: 0.3rem 0.75rem;
    text-align: center;
    white-space: nowrap;
  }

  .pos-rate-row--dropdown {
    margin-top: 0.65rem;
    margin-bottom: 0;
  }

  .payment-currency-filter {
    position: fixed;
    top: auto;
    bottom: auto;
    inset-inline-end: auto;
    z-index: 2000;
    width: min(320px, calc(100vw - 2rem));
  }

  .payment-currency-filter .filter__footer {
    justify-content: flex-end;
  }

  .pos-payment-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
    max-width: 18rem;
    overflow: visible;
  }

  .pos-payment-amount {
    flex: 1;
    min-width: 0;
  }

  .pos-payment-currency-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .pos-filter-toggle--compact {
    min-height: 1.65rem;
    padding: 0.2rem 0.45rem;
    font-size: 0.68rem;
  }

  .pos-toolbar__row--filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    position: relative;
    padding: 0.3rem 0.4rem;
    background: var(--pos-panel-soft);
    border: 1px solid var(--pos-border);
    border-radius: 0.5rem;
  }

  .pos-search-wrap {
    position: relative;
    flex: 1 1 180px;
    min-width: 0;
  }

  .pos-inline-filter {
    flex: 0 0 9rem;
    min-width: 8rem;
  }

  .pos-inline-filter--currency {
    flex-basis: 7.5rem;
    min-width: 7rem;
  }

  .pos-inline-filter :global(.filter-select),
  .pos-inline-filter :global(.filter-select.compact) {
    width: 100%;
  }

  .pos-inline-filter :global(.filter-select__trigger) {
    min-height: 1.85rem;
    padding-block: 0.25rem;
    font-size: 0.72rem;
  }

  .pos-filter-anchor {
    position: relative;
    flex-shrink: 0;
  }

  .pos-filter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid var(--pos-border);
    background: var(--pos-control);
    color: var(--pos-control-text);
    border-radius: 0.5rem;
    min-height: 1.85rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .pos-filter-toggle:hover,
  .pos-filter-toggle.is-open {
    border-color: #93c5fd;
    background: var(--pos-control-hover);
    color: #1d4ed8;
  }

  .pos-filter-toggle .bi-chevron-down {
    font-size: 0.7rem;
    transition: transform 0.15s ease;
  }

  .pos-filter-toggle.is-open .bi-chevron-down {
    transform: rotate(180deg);
  }

  .filter {
    position: absolute;
    top: calc(100% + 0.5rem);
    inset-inline-end: 0;
    z-index: 1060;
    width: min(420px, calc(100vw - 2rem));
    padding: 0;
    border: 1px solid #e2e8f0;
    border-radius: 1rem;
    background: #fff;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
    overflow: visible;
  }

  .filter__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1rem 0.65rem;
  }

  .filter__title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
  }

  .filter__subtitle {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: #64748b;
  }

  .filter__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #64748b;
    cursor: pointer;
  }

  .filter__close:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .filter__body {
    padding: 0.35rem 1rem 0.85rem;
    overflow: visible;
  }

  .filter__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid #f1f5f9;
  }

  .filter__apply {
    border: 0;
    border-radius: 0.65rem;
    background: #0f6efd;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 700;
    padding: 0.45rem 1rem;
    min-height: 2.1rem;
    cursor: pointer;
  }

  .filter__apply:hover {
    background: #1d4ed8;
  }

  .pos-toolbar__actions {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .pos-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--pos-text);
  }

  .pos-logo-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.15rem;
    border: 1px solid transparent;
    border-radius: 0.45rem;
    background: transparent;
    text-decoration: none;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .pos-logo-btn:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .pos-logo-img {
    height: 22px;
    width: auto;
    display: block;
  }

  .pos-icon-btn,
  .pos-sales-btn,
  .pos-select-btn,
  .pos-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    border: 1px solid var(--pos-border);
    background: #fff;
    color: #334155;
    border-radius: 0.5rem;
    min-height: 1.85rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.72rem;
    font-weight: 600;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .pos-icon-btn {
    width: 1.85rem;
    padding: 0;
    text-decoration: none;
  }

  .pos-icon-btn--sm {
    width: 1.75rem;
    min-height: 1.75rem;
    border-radius: 0.5rem;
  }

  .pos-icon-btn:hover,
  .pos-sales-btn:hover,
  .pos-select-btn:hover,
  .pos-clear-btn:hover {
    border-color: #94a3b8;
    background: var(--pos-control-hover);
  }

  .pos-sales-btn {
    background: var(--pos-accent);
    border-color: var(--pos-accent);
    color: #fff;
  }

  .pos-sales-btn:hover {
    background: #1d4ed8;
    border-color: #1d4ed8;
    color: #fff;
  }

  .pos-clear-btn {
    color: #dc2626;
    border-color: #fecaca;
    background: var(--pos-control);
  }

  .pos-select-btn {
    width: 100%;
    justify-content: space-between;
  }

  .pos-page-size {
    border-radius: 0.5rem;
    border-color: var(--pos-border);
    min-height: 1.85rem;
  }

  .pos-search-icon {
    position: absolute;
    inset-inline-start: 0.55rem;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    pointer-events: none;
    z-index: 1;
  }

  .pos-search-input {
    padding-inline-start: 1.75rem;
    border-radius: 0.5rem;
    border-color: var(--pos-border);
    min-height: 1.85rem;
    background: var(--pos-control);
    color: var(--pos-control-text);
  }

  .pos-dropdown,
  .pos-autocomplete {
    max-height: 200px;
    overflow-y: auto;
    border-radius: 0.75rem;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
  }

  .pos-products-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.35rem;
    background: var(--pos-panel-soft);
    display: flex;
    flex-direction: column;
  }

  .pos-products-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.35rem;
    align-items: start;
    justify-content: stretch;
  }

  .pos-product-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    width: 100%;
    height: auto;
    padding: 0;
    border: 1px solid var(--pos-border);
    border-radius: 0.45rem;
    background: var(--pos-card);
    text-align: start;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 4px var(--pos-shadow);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    container-type: inline-size;
  }

  .pos-product-card:hover,
  .pos-product-card:focus-visible {
    border-color: #0f6efd;
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.14);
  }

  .pos-product-card:focus {
    outline: none;
  }

  .pos-product-card__media {
    position: relative;
    height: 72px;
    flex-shrink: 0;
    background: linear-gradient(180deg, #8aa9c4 0%, #6f94b0 100%);
    overflow: hidden;
    border-radius: 0.45rem 0.45rem 0 0;
  }

  .pos-product-card__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
    padding: 0;
  }

  .pos-product-card__badge {
    position: absolute;
    top: 0.45rem;
    inset-inline-start: 0.45rem;
    z-index: 2;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }

  .pos-product-card__badge--low {
    background: #fef9c3;
    color: #713f12;
    border: 1px solid #fde68a;
  }

  .pos-product-card__star {
    position: absolute;
    top: 0.3rem;
    inset-inline-end: 0.3rem;
    z-index: 2;
    width: 1.2rem;
    height: 1.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--pos-control);
    color: #f59e0b;
    font-size: 0.72rem;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  }

  .pos-product-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.4rem 0.45rem;
    min-height: 5.2rem;
  }

  .pos-product-card__name {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--pos-text);
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pos-product-card__divider {
    border-top: 1px dashed var(--pos-border);
    margin: 0;
  }

  .pos-product-card__details {
    display: grid;
    grid-template-columns: 1.15rem 3.05rem minmax(0, 1fr);
    column-gap: 0.3rem;
    row-gap: 0.25rem;
    align-items: center;
    padding: 0.1rem 0;
  }

  .pos-product-card__detail {
    display: contents;
  }

  .pos-product-card__detail-icon {
    width: 1.15rem;
    height: 1.15rem;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.45rem;
    background: var(--pos-accent-soft);
    color: var(--pos-accent);
    font-size: 0.62rem;
    justify-self: center;
  }

  .pos-product-card__detail-label {
    flex-shrink: 0;
    font-size: 0.62rem;
    font-weight: 500;
    color: var(--pos-muted);
    line-height: 1.2;
    white-space: nowrap;
  }

  .pos-product-card__detail-value {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--pos-text);
    line-height: 1.2;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  .pos-product-card__detail-value--code {
    display: block;
    width: 100%;
    direction: ltr;
    text-align: end;
    text-overflow: ellipsis;
  }

  .pos-product-card__stock-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: #22c55e;
    flex-shrink: 0;
  }

  .pos-product-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.2rem 0 0;
  }

  .pos-product-card__price {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    min-width: 0;
    flex: 1;
  }

  .pos-product-card__price-value {
    font-size: 0.86rem;
    font-weight: 800;
    color: var(--pos-accent);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .pos-product-card__price-currency {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--pos-accent);
    white-space: nowrap;
  }

  .pos-product-card__add {
    width: 1.55rem;
    height: 1.55rem;
    border: none;
    border-radius: 999px;
    background: var(--pos-accent);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    flex-shrink: 0;
    cursor: pointer;
  }

  .pos-product-card__add i {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.78rem;
    line-height: 1;
  }

  .pos-product-card__add:hover {
    background: #1d4ed8;
  }

  .pos-empty,
  .pos-cart-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.25rem 1rem;
    color: #94a3b8;
    text-align: center;
  }

  .pos-empty i,
  .pos-cart-empty i {
    font-size: 2.5rem;
  }

  .pos-pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: auto;
    padding-top: 0.35rem;
    flex-shrink: 0;
  }

  .pos-pagination-info {
    font-size: 0.75rem;
    color: var(--pos-muted);
  }

  .pos-pagination-controls {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pos-page-size {
    width: auto;
    min-width: 4.5rem;
  }

  .pos-pagination {
    display: flex;
    justify-content: center;
  }

  .pos-cart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.4rem 0.55rem 0.3rem;
    background: #fff;
  }

  .pos-cart-title {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--pos-text);
  }

  .pos-cart-title i {
    color: var(--pos-accent);
  }

  .pos-cart-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.35rem;
    border-radius: 999px;
    background: var(--pos-accent);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 700;
  }

  .pos-cart-customer {
    padding: 0 1rem 0.75rem;
    border-bottom: 1px solid var(--pos-border);
  }

  .pos-cart-customer--footer {
    width: 100%;
    max-width: none;
    padding: 0;
    border-bottom: 0;
  }

  .pos-customer-anchor {
    position: relative;
    width: 100%;
  }

  .pos-customer-select-wrap {
    display: flex;
    align-items: stretch;
    width: 100%;
    border: 1px solid var(--pos-border);
    border-radius: 0.5rem;
    background: #fff;
    overflow: hidden;
    min-height: 1.65rem;
  }

  .pos-customer-select-wrap.is-open,
  .pos-customer-select-wrap:hover {
    border-color: #93c5fd;
    background: #eff6ff;
  }

  .pos-customer-select {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: #334155;
    min-height: 1.65rem;
    padding: 0.2rem 0.45rem;
    font-size: 0.68rem;
    font-weight: 600;
    cursor: pointer;
  }

  .pos-customer-select:hover,
  .pos-customer-select.is-open {
    color: #1d4ed8;
  }

  .pos-customer-select__label {
    flex: 1;
    min-width: 0;
    text-align: start;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pos-customer-search {
    flex: 1;
    min-width: 0;
    width: 100%;
    border: 0;
    background: transparent;
    color: #1d4ed8;
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0;
    margin: 0;
    outline: none;
    text-align: start;
  }

  .pos-customer-search::placeholder {
    color: #94a3b8;
    font-weight: 500;
  }

  .pos-customer-add {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    flex-shrink: 0;
    width: 1.8rem;
    min-height: 1.65rem;
    border: 0;
    border-inline-start: 1px solid var(--pos-border);
    background: var(--pos-accent);
    color: #fff;
    padding: 0;
    line-height: 1;
    cursor: pointer;
  }

  .pos-customer-add i {
    display: block;
    font-size: 0.78rem;
    line-height: 1;
  }

  .pos-customer-add:hover {
    background: #1d4ed8;
  }

  .pos-customer-menu {
    position: absolute;
    bottom: calc(100% + 0.35rem);
    inset-inline: 0;
    z-index: 1060;
    margin: 0;
    padding: 0.35rem;
    max-height: 180px;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    border: 1px solid var(--pos-border);
    border-radius: 0.75rem;
    background: #fff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  }

  .pos-customer-menu::-webkit-scrollbar {
    display: none;
  }

  .pos-customer-menu__item {
    display: block;
    width: 100%;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    padding: 0.45rem 0.6rem;
    text-align: start;
    font-size: 0.75rem;
    font-weight: 600;
    color: #0f172a;
    cursor: pointer;
  }

  .pos-customer-menu__item:hover {
    background: rgba(59, 130, 246, 0.06);
    color: #0f6efd;
  }

  .pos-customer-menu__item.is-selected {
    background: rgba(59, 130, 246, 0.1);
    color: #0f6efd;
  }

  .pos-customer-menu__empty {
    display: block;
    padding: 0.55rem 0.6rem;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: start;
  }

  .pos-summary-row--customer {
    align-items: flex-start;
    margin-bottom: 0.35rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid var(--pos-border);
  }

  .pos-customer-icon {
    background: var(--pos-accent);
    color: #fff;
    border-color: var(--pos-accent);
  }

  .pos-customer-name {
    background: #fff;
  }

  .pos-cart-items {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 0.35rem;
    background: #f8fafc;
  }

  .pos-cart-item {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 0.25rem;
    font-size: 0.7rem;
    padding: 0.35rem;
    margin-bottom: 0.3rem;
    background: #fff;
    border: 1px solid var(--pos-border);
    border-radius: 0.5rem;
  }

  .pos-cart-item__thumb {
    width: 30px;
    height: 30px;
    object-fit: cover;
    border-radius: 0.4rem;
    border: 1px solid var(--pos-border);
  }

  .pos-cart-item__content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .pos-cart-item__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.35rem;
  }

  .pos-cart-item__name {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--pos-text);
    line-height: 1.3;
  }

  .pos-cart-item__remove {
    border: none;
    background: transparent;
    color: #94a3b8;
    padding: 0;
    line-height: 1;
    font-size: 0.75rem;
  }

  .pos-cart-item__remove:hover {
    color: #dc2626;
  }

  .pos-cart-item__price-row,
  .pos-cart-item__qty-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .pos-qty {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--pos-border);
    border-radius: 0.65rem;
    overflow: hidden;
    background: #fff;
  }

  .pos-qty__btn {
    width: 1.4rem;
    height: 1.4rem;
    border: none;
    background: #f8fafc;
    color: #334155;
    font-weight: 700;
  }

  .pos-qty__btn:hover {
    background: var(--pos-accent-soft);
    color: var(--pos-accent);
  }

  .pos-qty__input {
    width: 2rem;
    border: none;
    text-align: center;
    font-size: 0.68rem;
    font-weight: 600;
    height: 1.4rem;
  }

  .pos-cart-item__line-total {
    margin-inline-start: auto;
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--pos-accent);
  }

  .pos-cart-footer {
    position: relative;
    z-index: 2;
    overflow: visible;
    padding: 0.4rem 0.55rem 0.55rem;
    border-top: 1px solid var(--pos-border);
    background: #fff;
  }

  .pos-summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.45rem;
    margin-bottom: 0.28rem;
    font-size: 0.7rem;
    color: #334155;
  }

  .pos-summary-row--total {
    margin-top: 0.2rem;
    margin-bottom: 0.4rem;
    font-weight: 700;
  }

  .pos-summary-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .pos-summary-input {
    width: 4.5rem;
    min-width: 3.75rem;
  }

  .pos-summary-row--payment {
    align-items: center;
  }

  .pos-discount-group {
    width: 7rem;
  }

  .pos-toggle,
  .pos-toggle-active {
    border: 1px solid var(--pos-border);
    font-size: 0.62rem;
    font-weight: 700;
    min-width: 2.25rem;
  }

  .pos-toggle {
    background: #fff;
    color: #64748b;
  }

  .pos-toggle-active {
    background: var(--pos-accent-soft);
    color: var(--pos-accent);
    border-color: #bfdbfe;
  }

  .pos-currency-pills {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.65rem;
  }

  .pos-currency-pills__label {
    width: 100%;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--pos-muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .pos-currency-pill {
    border: 1px solid var(--pos-border);
    background: #fff;
    color: #334155;
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    min-height: 2rem;
  }

  .pos-currency-pill.is-active {
    background: var(--pos-accent);
    border-color: var(--pos-accent);
    color: #fff;
  }

  .pos-rate-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .pos-rate-label {
    font-size: 0.75rem;
    color: var(--pos-muted);
  }

  .pos-currency-rate-input {
    width: 4rem;
  }

  .pos-payment-equiv {
    font-size: 0.62rem;
    color: #64748b;
    text-align: end;
    margin-top: -0.25rem;
    margin-bottom: 0.25rem;
  }

  .pos-payable {
    font-size: 0.84rem;
    font-weight: 800;
    color: var(--pos-accent);
  }

  .pos-confirm-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    margin-top: 0.25rem;
    min-height: 2rem;
    border: none;
    border-radius: 0.55rem;
    background: var(--pos-accent);
    color: #fff;
    font-weight: 700;
    font-size: 0.78rem;
  }

  .pos-confirm-btn:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .pos-confirm-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .pos-sales-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1040;
    background: rgba(15, 23, 42, 0.35);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  :global(.pos-sales-modal) {
    z-index: 1050;
  }

  :global(.pos-sales-modal .modal-dialog) {
    margin: 1rem auto;
    height: auto;
    max-height: calc(100vh - 2rem);
  }

  :global(.pos-sales-modal .modal-content) {
    height: auto;
    max-height: calc(100vh - 2rem);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  :global(.pos-sales-modal .pos-sales-modal__body) {
    flex: 1 1 auto;
    min-height: 0;
    max-height: calc(100vh - 6.5rem);
    overflow-y: auto;
    padding: 0.75rem 1rem 1rem;
  }

  .pos-summary-row--customer {
  position: relative;
  z-index: 120;
  display: flex;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 0.35rem;
  padding-bottom: 0.35rem;
  overflow: visible !important;
  border-bottom: 1px solid var(--pos-border, #e2e8f0);
}

.pos-cart-customer--footer {
  width: 100%;
  max-width: none;
  padding: 0;
  overflow: visible !important;
  border-bottom: 0;
}

.pos-customer-field {
  display: grid;
  gap: 0.3rem;
  width: 100%;
  min-width: 0;
  overflow: visible !important;
}

.pos-customer-field__label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1rem;
  color: #59687c;
  font-size: 0.68rem;
  font-weight: 750;
  line-height: 1;
}

.pos-customer-field__label i {
  display: none;
}

/* Dropdown anchor */

.pos-customer-anchor {
  position: relative;
  z-index: 130;
  width: 100%;
  min-width: 0;
  overflow: visible !important;
}

/* Main customer control */

.pos-customer-control {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 2.625rem;
  overflow: hidden;
  border: 1px solid #d6dfeb;
  border-radius: 0.625rem;
  background: #ffffff;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.pos-customer-control:hover {
  border-color: #bcc9db;
}

.pos-customer-control:focus-within,
.pos-customer-control.is-open {
  border-color: #78a4f5;
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
}

/* Person icon */

.pos-customer-control__icon {
  display: inline-grid;
  flex: 0 0 2.25rem;
  width: 2.25rem;
  place-items: center;
  background: #ffffff;
  color: #8c9aad;
}

/* Search input */

.pos-customer-search {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #26364b;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.2;
  text-align: start;
  box-shadow: none;
}

.pos-customer-search:focus {
  border: 0;
  outline: 0;
  box-shadow: none;
}

.pos-customer-search::placeholder {
  color: #9aa7b8;
  font-weight: 500;
}

/* Selected customer button */

.pos-selected-customer {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
  height: 100%;
  padding-inline: 0.1rem 0.65rem;
  border: 0;
  outline: 0;
  background: transparent;
  color: #26364b;
  font-size: 0.78rem;
  font-weight: 750;
  text-align: start;
  cursor: pointer;
}

.pos-selected-customer__identity {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  overflow: hidden;
}

.pos-selected-customer__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos-selected-customer__divider {
  flex: 0 0 1px;
  width: 1px;
  height: 1rem;
  background: #d6dfeb;
}

.pos-selected-customer__balance {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: baseline;
  gap: 0.22rem;
  color: var(--pos-accent, #0f6efd);
  font-size: 0.68rem;
  font-weight: 850;
  white-space: nowrap;
}

.pos-selected-customer__balance.is-negative {
  color: #dc2626;
}

.pos-selected-customer__balance b {
  font: inherit;
}

.pos-selected-customer__balance small {
  font-size: 0.58rem;
  font-weight: 750;
}

.pos-selected-customer:hover {
  color: #1d4ed8;
}

.pos-selected-customer:focus {
  outline: 0;
  box-shadow: none;
}

.pos-selected-customer__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos-selected-customer > i {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 0.7rem;
}

/* Add customer button */

.pos-customer-add {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  min-width: 4.2rem;
  height: 100%;
  padding-inline: 0.65rem;
  border: 0;
  border-inline-start: 1px solid #dfe6ef;
  background: var(--pos-accent, #0f6efd);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}

.pos-customer-add:hover,
.pos-customer-add:focus-visible {
  background: #1d4ed8;
  color: #ffffff;
}

.pos-customer-add i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  line-height: 1;
}

/* =========================================================
   CUSTOMER DROPDOWN
   ========================================================= */

.pos-customer-menu {
  position: absolute !important;

  /*
   * Cancel the old POS rule that used bottom.
   * The dropdown will open below the customer control.
   */
  top: calc(100% + 0.35rem) !important;
  bottom: auto !important;

  inset-inline-start: 0 !important;
  inset-inline-end: 0 !important;

  z-index: 9999 !important;
  display: block !important;

  width: 100%;
  min-width: 100%;
  max-height: 18rem;

  margin: 0;
  padding: 0.3rem;

  overflow-x: hidden;
  overflow-y: auto;

  list-style: none;
  border: 1px solid #dce4ef;
  border-radius: 0.75rem;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);

  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pos-customer-menu::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.pos-customer-menu > li {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

/* Customer option */

.pos-customer-menu__item {
  display: flex !important;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  min-height: 3rem;
  padding: 0.4rem 0.5rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: #26364b;
  text-align: start;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.pos-customer-menu__item:hover,
.pos-customer-menu__item:focus-visible {
  background: #f0f6ff;
  color: #1d4ed8;
}

.pos-customer-menu__item.is-selected {
  background: #edf4ff;
  color: var(--pos-accent, #0f6efd);
}

/* Customer avatar */

.pos-customer-menu__avatar {
  display: inline-grid;
  flex: 0 0 1.9rem;
  width: 1.9rem;
  height: 1.9rem;
  place-items: center;
  border-radius: 0.5rem;
  background: #edf4ff;
  color: var(--pos-accent, #0f6efd);
}

/* Customer option text */

.pos-customer-menu__copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 0.05rem;
}

.pos-customer-menu__copy strong {
  overflow: hidden;
  color: #26364b;
  font-size: 0.75rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos-customer-menu__copy small {
  overflow: hidden;
  color: #8794a7;
  font-size: 0.61rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos-customer-menu__item:hover
  .pos-customer-menu__copy strong,
.pos-customer-menu__item.is-selected
  .pos-customer-menu__copy strong {
  color: var(--pos-accent, #0f6efd);
}

/* Arrow */

.pos-customer-menu__arrow {
  flex-shrink: 0;
  color: #a0acbc;
  font-size: 0.58rem;
}

.pos-customer-menu__item.is-selected
  .pos-customer-menu__arrow {
  color: var(--pos-accent, #0f6efd);
}

/* Empty result */

.pos-customer-menu__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 3.5rem;
  padding: 0.65rem;
  color: #8794a7;
  font-size: 0.68rem;
  font-weight: 650;
  text-align: center;
}

/* =========================================================
   IMPORTANT PARENT OVERFLOW AND STACKING FIX
   ========================================================= */

.pos-cart-panel,
.pos-cart-footer,
.pos-summary-row--customer,
.pos-cart-customer--footer,
.pos-customer-field,
.pos-customer-anchor {
  overflow: visible !important;
}

.pos-cart-panel {
  position: relative;
}

.pos-cart-footer {
  position: relative;
  z-index: 100;
  overflow: visible !important;
}

/*
 * Keep the customer dropdown above subtotal, payment,
 * discount and other footer controls.
 */
.pos-summary-row--customer {
  z-index: 120;
}

.pos-summary-row--customer
  ~ .pos-summary-row {
  position: relative;
  z-index: 1;
}

/* RTL */

:global(html[dir='rtl']) .pos-customer-menu__arrow {
  transform: scaleX(-1);
}

:global(html.dark) .pos-page :is(
  .pos-products-panel,
  .pos-cart-panel,
  .pos-toolbar,
  .pos-cart-header,
  .pos-cart-footer,
  .pos-product-card,
  .pos-cart-item,
  .pos-customer-control,
  .pos-customer-select-wrap,
  .pos-customer-menu,
  .payment-currency-filter,
  .pos-sales-modal .modal-content
) {
  background: var(--pos-panel);
  border-color: var(--pos-border);
  color: var(--pos-text);
}

:global(html.dark) .pos-page :is(
  .pos-toolbar__row--filters,
  .pos-products-scroll,
  .pos-cart-items,
  .pos-qty__btn,
  .pos-toggle,
  .pos-customer-menu__item:hover,
  .pos-customer-menu__item:focus-visible,
  .pos-customer-menu__item.is-selected
) {
  background: var(--pos-panel-soft);
}

:global(html.dark) .pos-page :is(
  input,
  select,
  textarea,
  .form-control,
  .form-select,
  .pos-filter-toggle,
  .pos-icon-btn,
  .pos-select-btn,
  .pos-clear-btn,
  .pos-currency-pill,
  .pos-qty,
  .pos-qty__input
) {
  background-color: var(--pos-control);
  border-color: var(--pos-border);
  color: var(--pos-control-text);
}

:global(html.dark) .pos-page :is(
  input::placeholder,
  textarea::placeholder,
  .pos-customer-search::placeholder,
  .pos-customer-menu__copy small,
  .pos-customer-menu__empty,
  .pos-payment-equiv,
  .pos-product-card__detail-label,
  .pos-summary-row,
  .pos-customer-field__label
) {
  color: var(--pos-muted);
}

:global(html.dark) .pos-page :is(
  .pos-title,
  .pos-cart-title,
  .pos-product-card__name,
  .pos-product-card__detail-value,
  .pos-cart-item__name,
  .pos-customer-menu__copy strong,
  .pos-selected-customer__name,
  .pos-customer-menu__item
) {
  color: var(--pos-text);
}

:global(html.dark) .pos-page :is(
  .pos-product-card__divider,
  .pos-summary-row--customer,
  .pos-cart-customer,
  .pos-cart-footer,
  .pos-customer-add,
  .pos-cart-item__thumb
) {
  border-color: var(--pos-border);
}

:global(html.dark) .pos-page :is(
  .pos-product-card__detail-icon,
  .pos-customer-menu__avatar,
  .pos-toggle-active
) {
  background: var(--pos-accent-soft);
  color: var(--pos-accent);
  border-color: rgba(96, 165, 250, 0.26);
}

:global(html.dark) .pos-page :is(
  .pos-product-card__price-value,
  .pos-product-card__price-currency,
  .pos-payable,
  .pos-cart-title i,
  .pos-selected-customer__balance,
  .pos-customer-select:hover,
  .pos-customer-select.is-open
) {
  color: var(--pos-accent);
}

:global(html.dark) .pos-page :is(.pos-product-card__star, .pos-customer-control__icon) {
  background: var(--pos-control);
}

:global(html.dark) .pos-page :is(.pos-product-card, .pos-customer-menu) {
  box-shadow: 0 12px 28px var(--pos-shadow);
}

:global(html.dark) .pos-page :is(.pos-filter-toggle:hover, .pos-filter-toggle.is-open, .pos-icon-btn:hover, .pos-clear-btn:hover) {
  background: var(--pos-control-hover);
  border-color: #60a5fa;
  color: var(--pos-accent);
}

:global(html.dark) .pos-page :is(.pos-currency-pill.is-active, .pos-sales-btn, .pos-confirm-btn, .pos-product-card__add, .pos-customer-add) {
  background: var(--pos-accent);
  border-color: var(--pos-accent);
  color: #07111f;
}

:global(html.dark) .pos-page :is(.pos-product-card:hover, .pos-product-card:focus-visible) {
  border-color: var(--pos-accent);
  box-shadow: 0 12px 28px rgba(96, 165, 250, 0.2);
}

/* Small screens */

@media (max-width: 480px) {
  .pos-customer-add {
    width: 2.65rem;
    min-width: 2.65rem;
    padding: 0;
  }

  .pos-customer-add span {
    display: none;
  }

  .pos-customer-control__icon {
    flex-basis: 2rem;
    width: 2rem;
  }
}

  @container (max-width: 1200px) {
    .pos-layout {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }

    .pos-cart-panel {
      min-height: auto;
      max-height: none;
      height: auto;
    }

    .pos-products-panel {
      min-height: 70vh;
    }
  }


  @container (max-width: 980px) {
    .pos-products-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (max-width: 720px) {
    .pos-products-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 576px) {
    .pos-page {
      padding: 0.4rem;
      overflow: auto;
    }

    .pos-layout {
      height: auto;
      min-height: 100%;
    }

    .pos-products-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 235px) {
    .pos-product-card__body {
      padding: 0.65rem;
    }

    .pos-product-card__details {
      grid-template-columns: 1.65rem 3.75rem minmax(0, 1fr);
      column-gap: 0.4rem;
    }

    .pos-product-card__detail-label {
      font-size: 0.7rem;
    }

    .pos-product-card__price-value {
      font-size: 1.1rem;
    }

    .pos-product-card__price-currency {
      font-size: 0.72rem;
    }

    .pos-product-card__add {
      width: 2.1rem;
      height: 2.1rem;
    }
  }
</style>
