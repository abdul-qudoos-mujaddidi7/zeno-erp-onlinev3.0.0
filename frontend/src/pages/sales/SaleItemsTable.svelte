<script>
  ;
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import Swal from 'sweetalert2';
  import FilterSelect from '../../components/common/FilterSelect.svelte';

  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import { getInventoryMethod, organizationStore } from '../../stores/organizationStore.js';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { productApi } from '../../api/productApi.js';
import { warehouseProductApi } from '../../api/warehouseProductApi.js';
import { stockBatchApi } from '../../api/stockBatchApi.js';
import { saleApi } from '../../api/saleApi.js';
import { saleItemApi } from '../../api/saleItemApi.js';
import { mergeById, lookupProducts } from '../../lib/formLookups.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let items = [];
  export let currency = '';
  export let warehouse_id = '';
  export let selected_account_id = '';

  $: enable_stock_minus = $settings_all.find((s) => s.key === 'enable_stock_minus')?.value == 1;
  $: enable_duplicate_product = $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;
  $: enable_batch_setting = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: inventory_method = $organizationStore.inventoryMethod || getInventoryMethod();
  $: normalized_inventory_method = String(inventory_method || '').trim().toUpperCase();
  $: enable_batch =
    enable_batch_setting &&
    normalized_inventory_method !== 'FIFO' &&
    normalized_inventory_method !== 'LIFO';
  $: enable_show_buy_price = $settings_all.find((s) => s.key === 'enable_show_buy_price')?.value == 1;
  $: enable_show_latest_sale_price = $settings_all.find((s) => s.key === 'enable_show_latest_sale_price')?.value == 1;
  $: enable_show_buy_price_and_latest_sale_price_in_item =
    $settings_all.find((s) => s.key === 'enable_show_buy_price_and_latest_sale_price_in_item')?.value == 1;

  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  const dispatch = createEventDispatcher();

  let products = [];
  let search = '';
  let showDropdown = false;

  let quantity = 1;
  let unit_price = 0;
  let unit_currency = '';
  let unit = 0;
  let selectedProduct = null;

  let barcodeInput = '';

  // Reference to the modal
  let productModal;

  let categories = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];
  let stock = 0;
  let batchModalOpen = false;
  let batchModalItem = null;
  let batchModalIndex = -1;
  let batchModalBatches = [];
  let batchModalLoading = false;

  async function loadAll() {
    const [categoriesRes, unitsRes, currenciesRes, warehousesRes, productRows] =
      await Promise.all([
        productCategoryApi.getAll({ status: 1 }),
        productUnitApi.getAll({ status: 1 }),
        currencyApi.getAll({ status: 1 }),
        warehouseApi.getAll({ status: 1 }),
        lookupProducts({ search: '' }),
      ]);

    categories = categoriesRes?.data || [];
    units = unitsRes?.data || [];
    currencies = currenciesRes?.data || [];
    warehouses = warehousesRes?.data || [];
    products = productRows;
  }

  let loadedWarehouseId = null;
  async function loadWarehouseStock(id) {
    if (!id) {
      warehouse_products = [];
      return;
    }
    warehouse_products =
      (await warehouseProductApi.getAll({ status: 1, warehouse_id: id }))?.data || [];
    refreshAvailableProducts();
  }

  $: if (warehouse_id && warehouse_id !== loadedWarehouseId) {
    loadedWarehouseId = warehouse_id;
    loadWarehouseStock(warehouse_id);
  }

  let productSearchTimer;
  async function searchProductsFromServer(term = '') {
    const rows = await lookupProducts({ search: term });
    products = mergeById(products, rows);
    refreshAvailableProducts();
  }

  function handleProductSearchInput() {
    showProductDropdown = true;
    refreshAvailableProducts();
    const term = String(search || '').trim();
    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(() => {
      searchProductsFromServer(term);
    }, 280);
  }

  let ProductModalCmp = null;
  let showProductModal = false;

  async function openCreateProductModal() {
    if (!ProductModalCmp) {
      ProductModalCmp = (await import('../products/ProductModal.svelte')).default;
    }
    showProductModal = true;
    await tick();
    productModal?.openModal();
  }

  onMount(async () => {
    await loadAll();

    refreshAvailableProducts();
  });

  /* F2 is advertised on the search bar, so it must actually focus it. */
  function handleShortcutKey(event) {
    if (event.key !== 'F2' || event.ctrlKey || event.altKey || event.metaKey) return;

    event.preventDefault();
    activateProductCellSearch();
  }

  onMount(() => {
    window.addEventListener('keydown', handleShortcutKey);
    document.addEventListener('mousedown', handleDocumentMouseDown);

    return () => {
      window.removeEventListener('keydown', handleShortcutKey);
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  });

  function handleDocumentMouseDown(event) {
    if (!warehouseOpen) return;
    if (event.target instanceof Element && event.target.closest('.sfi-wh')) return;

    warehouseOpen = false;
  }

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
  function changeUnit(item, unitId) {
    unitId = Number(unitId);

    const selectedUnit = item.availableUnits?.find((u) => u.id === unitId);
    if (!selectedUnit) return;

    item.product_unit_id = unitId;
    item.calculated_price = item.unit_price * selectedUnit.multiplier || item.unit_price; // adjust price if needed
    item.subtotal = item.quantity * item.calculated_price;

    recalc(items.indexOf(item));
    items = [...items];
    dispatch('update', { items });
  }

  let filteredProducts = [];

  let latestPrice = null;
  let previousWarehouseId = null;

  function isProductActive(product) {
    if (!product) return false;

    if (
      product.product_status !== undefined &&
      product.product_status !== null
    ) {
      return product.product_status === 'active';
    }

    return (
      product.status === undefined ||
      product.status === null ||
      Number(product.status) === 1
    );
  }

  function productMatchesSearch(product, searchValue = '') {
    const term = normalizeSearchText(searchValue);

    if (!term) return true;

    return [
      product.name,
      product.code,
      product.barcode,
      product.sku,
      product.product_code,
    ].some((value) => normalizeSearchText(value).includes(term));
  }

  function getProductGroupKey(product) {
    return [
      String(product?.name || '').trim().toLowerCase(),
      product?.category_id || '',
      product?.product_unit_id || '',
    ].join('|');
  }

  function getProductGroupProducts(productOrItem) {
    const groupKey =
      productOrItem?.product_group_key ||
      getProductGroupKey(productOrItem);

    return products.filter(
      (product) =>
        isProductActive(product) &&
        getProductGroupKey(product) === groupKey,
    );
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  function getProductStock(productId) {
    if (!warehouse_id || !productId) return 0;

    const warehouseRows = warehouse_products.filter((warehouseProduct) => {
      const active =
        warehouseProduct.status === undefined ||
        warehouseProduct.status === null ||
        Number(warehouseProduct.status) === 1;

      return (
        active &&
        Number(warehouseProduct.product_id) === Number(productId) &&
        Number(warehouseProduct.warehouse_id) === Number(warehouse_id)
      );
    });

    if (warehouseRows.length) {
      return warehouseRows.reduce((sum, warehouseProduct) => {
        const rowQuantity = Number(
          warehouseProduct.quantity ??
            warehouseProduct.current_quantity ??
            warehouseProduct.available_quantity ??
            warehouseProduct.stock ??
            0,
        );

        return sum + (Number.isFinite(rowQuantity) ? rowQuantity : 0);
      }, 0);
    }

    const product = products.find(
      (row) => Number(row.id) === Number(productId),
    );

    return Number(
      product?.warehouse_stock ?? product?.quantity ?? 0,
    );
  }

  function getProductGroupStock(productOrItem) {
    if (!warehouse_id || !productOrItem) return 0;

    const productIds =
      Array.isArray(productOrItem.product_group_ids) &&
      productOrItem.product_group_ids.length > 0
        ? productOrItem.product_group_ids
        : getProductGroupProducts(productOrItem).map((product) => product.id);

    const fallbackId = productOrItem.product_id || productOrItem.id;
    const ids = productIds.length > 0 ? productIds : [fallbackId];

    return ids.reduce(
      (sum, productId) => sum + getProductStock(productId),
      0,
    );
  }

  function getVisibleProductStock(productOrItem) {
    if (!productOrItem || productOrItem.type === 'service') return 0;
    if (!enable_batch) return getProductGroupStock(productOrItem);

    return getProductStock(productOrItem.product_id || productOrItem.id);
  }

  function getBatchLabel(batch) {
    return batch?.batch_number || batch?.batch || batch?.lot_number || `#${batch?.id || ''}`;
  }

  function normalizeBatchOption(batch) {
    return {
      id: batch.id,
      stock_batch_id: batch.source === 'product' ? null : batch.id,
      product_id: batch.product_id,
      product_unit_id: batch.product_unit_id,
      product_name: batch.product_name,
      buy_price: batch.buy_price,
      buy_price_currency: batch.buy_price_currency,
      unit_price: batch.unit_price,
      sell_currency: batch.sell_currency,
      batch_number: getBatchLabel(batch),
      manufacturing_date: batch.manufacturing_date || null,
      expiry_date: batch.expiry_date || null,
      quantity_remaining: Number(batch.quantity_remaining || 0),
      source: batch.source || 'batch',
    };
  }

  async function getBatchOptionsForItem(item) {
    if (!enable_batch || !item || item.type === 'service' || !warehouse_id) return [];

      const groupProducts = getProductGroupProducts(item);
      const groupIds = groupProducts.length
        ? groupProducts.map((product) => Number(product.id))
        : [Number(item.product_id)];

      const stockBatchResponse = await stockBatchApi.getAll({
        warehouse_id: Number(warehouse_id),
        status: 1,
      });

      const allBatches = (stockBatchResponse?.data || []).filter(
        (batch) =>
          groupIds.includes(Number(batch.product_id)) &&
          Number(batch.quantity_remaining || 0) > 0,
      );

      const stockBatchOptions = allBatches.map((batch) => {
        const batchProduct =
          groupProducts.find((product) => Number(product.id) === Number(batch.product_id)) ||
          products.find((product) => Number(product.id) === Number(batch.product_id));

        return normalizeBatchOption({
          ...batch,
          product_name: batchProduct?.name || item.product_name,
          product_unit_id: batchProduct?.product_unit_id || item.product_unit_id,
          buy_price: batchProduct?.buy_price ?? item.buy_price,
          buy_price_currency: batchProduct?.buy_currency || item.buy_price_currency,
          unit_price: batchProduct?.sell_price ?? item.calculated_price,
          sell_currency: batchProduct?.sell_currency || item.currency,
          source: 'batch',
        });
      });

      const productBatchOptions = groupProducts
        .map((product) =>
          normalizeBatchOption({
            id: `product-${product.id}`,
            product_id: product.id,
            product_name: product.name,
            product_unit_id: product.product_unit_id,
            batch_number: product.batch || product.batch_number || product.code,
            manufacturing_date: product.manufacturing_date || null,
            expiry_date: product.expiry_date || null,
            quantity_remaining: getProductStock(product.id),
            buy_price: product.buy_price,
            buy_price_currency: product.buy_currency,
            unit_price: product.sell_price,
            sell_currency: product.sell_currency,
            source: 'product',
          }),
        )
        .filter((batch) => Number(batch.quantity_remaining || 0) > 0);

      const mergedOptions = stockBatchOptions.length
        ? stockBatchOptions
        : productBatchOptions;

      return mergedOptions.sort((a, b) => {
        const aDate = new Date(a.expiry_date || a.manufacturing_date || 0).getTime();
        const bDate = new Date(b.expiry_date || b.manufacturing_date || 0).getTime();
      return aDate - bDate;
      });
  }

  function applyBatchToItem(item, batch, index = -1) {
    if (!item || !batch) return;

    item.product_id = batch.product_id || item.product_id;
    item.product_name = batch.product_name || item.product_name;
    item.product_unit_id = batch.product_unit_id || item.product_unit_id;
    item.availableUnits = getUnitHierarchy(item.product_unit_id);
    item.batch_option_id = batch.id;
    item.stock_batch_id = batch.stock_batch_id || null;
    item.batch = batch.batch_number || getBatchLabel(batch);
    item.manufacturing_date = batch.manufacturing_date || null;
    item.expiry_date = batch.expiry_date || null;
    item.buy_price = batch.buy_price ?? item.buy_price;
    item.buy_price_currency = batch.buy_price_currency || item.buy_price_currency;
    const hasBatchPrice = batch.unit_price != null && batch.unit_price !== '';
    const priced = priceInFormCurrency(
      hasBatchPrice ? batch.unit_price : (item.unit_price ?? item.calculated_price ?? 0),
      hasBatchPrice ? (batch.sell_currency || item.currency) : item.currency,
    );
    item.unit_price = priced.price;
    item.calculated_price = priced.price;
    item.currency = priced.currency;

    if (index >= 0) recalc(index);
  }

  async function applyDefaultBatch(item, index) {
    if (!enable_batch || !item || item.type === 'service') return;

    try {
      const batches = await getBatchOptionsForItem(item);
      item.batch_options = batches;
      if (batches.length > 0) {
        applyBatchToItem(item, batches[0], index);
      }
    } catch (error) {
      console.error('Failed to load default product batch:', error);
    }
  }

  async function openBatchModal(item, index) {
    if (!enable_batch || !item || item.type === 'service') return;

    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return;
    }

    batchModalOpen = true;
    batchModalItem = item;
    batchModalIndex = index;
    batchModalLoading = true;
    batchModalBatches = [];

    try {
      batchModalBatches = await getBatchOptionsForItem(item);
    } catch (error) {
      console.error('Failed to load product batches:', error);
      toast.error(t('Error'), t('Failed to load batches. Please try again.'));
      closeBatchModal();
    } finally {
      batchModalLoading = false;
    }
  }

  function closeBatchModal() {
    batchModalOpen = false;
    batchModalItem = null;
    batchModalIndex = -1;
    batchModalBatches = [];
    batchModalLoading = false;
  }

  function selectBatch(batch) {
    if (!batchModalItem || batchModalIndex < 0) return;

    const item = items[batchModalIndex];
    applyBatchToItem(item, batch, batchModalIndex);
    items = [...items];
    dispatch('update', { items });
    closeBatchModal();
    focusSaleItemInput(batchModalIndex, 'quantity');
  }

  async function ensureItemBatchOptions(item) {
    if (!enable_batch || !item || item.type === 'service') return [];
    if (Array.isArray(item.batch_options) && item.batch_options.length > 0) {
      return item.batch_options;
    }

    const batches = await getBatchOptionsForItem(item);
    item.batch_options = batches;
    items = [...items];
    dispatch('update', { items });
    return batches;
  }

  async function handleBatchDropdownFocus(item) {
    try {
      await ensureItemBatchOptions(item);
    } catch (error) {
      console.error('Failed to load product batches:', error);
      toast.error(t('Error'), t('Failed to load batches. Please try again.'));
    }
  }

  async function handleBatchDropdownChange(item, index, batchId) {
    try {
      const batches = await ensureItemBatchOptions(item);
      const batch = batches.find((option) => String(option.id) === String(batchId));
      if (!batch) return;

      applyBatchToItem(item, batch, index);
      item.batch_options = batches;
      items = [...items];
      dispatch('update', { items });
    } catch (error) {
      console.error('Failed to change product batch:', error);
      toast.error(t('Error'), t('Failed to load batches. Please try again.'));
    }
  }

  function getAvailableProducts(searchValue = '') {
    if (!warehouse_id) return [];

    const groupedProducts = new Map();

    products
      .filter((product) => {
        if (!isProductActive(product)) return false;
        if (!productMatchesSearch(product, searchValue)) return false;

        // Services do not use warehouse stock.
        if (product.type === 'service') return true;
        if (enable_stock_minus) return true;
        if (!hasWarehouseStockRow(product.id)) return true;

        return getProductStock(product.id) > 0;
      })
      .forEach((product) => {
        const groupKey = getProductGroupKey(product);
        const existing = groupedProducts.get(groupKey);
        const stockValue =
          product.type === 'service'
            ? null
            : getProductStock(product.id);

        if (!existing) {
          groupedProducts.set(groupKey, {
            ...product,
            product_group_key: groupKey,
            product_group_ids: [product.id],
            warehouse_stock: stockValue,
            batch_count: product.type === 'service' ? 0 : 1,
          });
          return;
        }

        existing.product_group_ids.push(product.id);
        existing.batch_count += product.type === 'service' ? 0 : 1;

        if (product.type !== 'service') {
          existing.warehouse_stock =
            Number(existing.warehouse_stock || 0) + Number(stockValue || 0);
        }
      });

    return Array.from(groupedProducts.values());
  }

  function refreshAvailableProducts() {
    filteredProducts = getAvailableProducts(search);
  }

  async function findLatestSalesPrice(productId) {
    const customerSales = ((await saleApi.getAll({ status: 1 }))?.data || [])
      .filter((s) => String(s.account_id) === String(selected_account_id))
      .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));

    for (const sale of customerSales) {
      if (sale.status !== 1) continue;

      const item = ((await saleItemApi.getAll({ status: 1, sale_id: sale.id, product_id: productId }))?.data || [])[0];

      if (item) {
        latestPrice = {
          price: item.unit_price,
          currency: item.currency,
        };
        return latestPrice;
      }
    }
    latestPrice = null;
    return latestPrice;
  }

  function hasWarehouseStockRow(productId) {
    return warehouse_products.some((warehouseProduct) => {
      const active =
        warehouseProduct.status === undefined ||
        warehouseProduct.status === null ||
        Number(warehouseProduct.status) === 1;

      return (
        active &&
        Number(warehouseProduct.product_id) === Number(productId) &&
        Number(warehouseProduct.warehouse_id) === Number(warehouse_id)
      );
    });
  }

  function getFormCurrencyCode() {
    if (currency && typeof currency === 'object') {
      return currency.code || 'AFN';
    }

    return currency || 'AFN';
  }

  /*
   * The item rows name their amounts with the currency symbol the operator
   * configured (؋, $, €), the same way the header and the receipt do — the
   * translated word belongs on the printed bill, not beside a table figure.
   */
  function currencySymbol(code) {
    const key = code && typeof code === 'object' ? code.code : code;
    if (!key) return '';

    const match = currencies.find((row) => row.code === key);
    return match?.symbol || match?.code || key;
  }

  /*
   * Product sell prices are stored in the product's own currency.
   * Convert them into the Sale Details currency as soon as the product
   * is added, so the price label matches the header on the first pick
   * (not only after the user toggles currency again).
   */
  function priceInFormCurrency(amount, fromCurrencyCode) {
    const formCode = getFormCurrencyCode();
    const fromCode = fromCurrencyCode || formCode;
    const numericAmount = Number(amount) || 0;

    if (!fromCode || fromCode === formCode) {
      return { price: numericAmount, currency: formCode };
    }

    const converted = exchangeRate(numericAmount, fromCode, currency);
    return {
      price: Math.round(converted * 100) / 100,
      currency: formCode,
    };
  }

  function selectProduct(product) {
    if (!product) return false;

    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return false;
    }

    showProductDropdown = false;
    let availableStock = null;

    if (product.type !== 'service') {
      availableStock = getVisibleProductStock(product);

      if (
        !enable_stock_minus &&
        hasWarehouseStockRow(product.id) &&
        availableStock <= 0
      ) {
        selectedProduct = null;
        stock = 0;
        refreshAvailableProducts();
        toast.error(
          t('Product is out of stock in the selected warehouse.'),
        );
        return false;
      }

      stock = availableStock;
    } else {
      stock = 0;
    }

    const unitHierarchy = getUnitHierarchy(product.product_unit_id);

    selectedProduct = {
      ...product,
      availableUnits: unitHierarchy,
      product_group_key:
        product.product_group_key ||
        getProductGroupKey(product),
      product_group_ids:
        product.product_group_ids || [product.id],
      warehouse_stock:
        product.type === 'service' ? null : availableStock,
    };

    search = product.name;
    const priced = priceInFormCurrency(
      product.sell_price,
      product.sell_currency,
    );
    unit_price = priced.price;
    unit_currency = priced.currency;
    unit = product.product_unit_id;
    latestPrice = null;

    return true;
  }

  async function activateProductCellSearch() {
    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return;
    }

    isProductCellEditing = true;
    search = '';
    selectedProduct = null;
    showProductDropdown = true;
    if (!products.length) {
      await searchProductsFromServer('');
    } else {
      refreshAvailableProducts();
    }

    await tick();

    search_input?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });

    search_input?.focus();
  }

  function closeProductCellSearch() {
    showProductDropdown = false;
    isProductCellEditing = false;
    search = '';
    selectedProduct = null;
  }

  function getSaleItemInput(index, field) {
    return document.querySelector(
      `[data-sale-item-index="${index}"][data-sale-item-field="${field}"]`,
    );
  }

  async function focusSaleItemInput(index, field) {
    await tick();

    requestAnimationFrame(() => {
      const input = getSaleItemInput(index, field);

      if (!input) return;

      input.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });

      input.focus();

      if (typeof input.select === 'function') {
        input.select();
      }
    });
  }

  async function handleSaleItemEnter(
    event,
    index,
    nextField,
  ) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();

    recalc(index);

    if (nextField === 'product') {
      await activateProductCellSearch();
      return;
    }

    await focusSaleItemInput(
      index,
      nextField,
    );
  }

  let selectingProduct = false;

  async function selectAndAddProduct(product) {
    selectingProduct = true;

    try {
      if (!selectProduct(product)) return;

      const affectedRowIndex = addItem();

      showProductDropdown = false;
      isProductCellEditing = false;

      if (affectedRowIndex < 0) return;

      if (enable_show_latest_sale_price) {
        findLatestSalesPrice(product.id)
          .then((price) => {
            if (!price || !items[affectedRowIndex]) return;
            items[affectedRowIndex].latestPrice = price;
            items = [...items];
            dispatch('update', { items });
          })
          .catch((error) => {
            console.warn('Failed to load latest sale price:', error);
          });
      }

      if (enable_batch && items[affectedRowIndex]?.type !== 'service') {
        await applyDefaultBatch(items[affectedRowIndex], affectedRowIndex);
        items = [...items];
        dispatch('update', { items });
      }

      await focusSaleItemInput(affectedRowIndex, 'quantity');
    } finally {
      selectingProduct = false;
    }
  }

  function addItem() {
    if (items.length >= bill_max_items) {
      toast.warning(
        t('Maximum Items Reached'),
        t('You have added more than ' + bill_max_items + ' items to the bill.'),
      );
      // return;
    }

    if (!selectedProduct) return -1;

    const existingIndex = items.findIndex(
      (item) =>
        Number(item.product_id) ===
        Number(selectedProduct.id),
    );

    let affectedRowIndex = existingIndex;

    if (
      existingIndex !== -1 &&
      !enable_duplicate_product
    ) {
      items[existingIndex].quantity +=
        Number(quantity);

      items[existingIndex].subtotal =
        items[existingIndex].quantity *
        (Number(items[existingIndex].calculated_price) ||
          Number(items[existingIndex].unit_price) || 0);
    } else {
      affectedRowIndex = items.length;

      const priced = priceInFormCurrency(
        unit_price,
        unit_currency || selectedProduct.sell_currency,
      );

      items.push({
        type: selectedProduct.type || 'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_group_key: selectedProduct.product_group_key,
        product_group_ids: selectedProduct.product_group_ids,
        product_unit_id: selectedProduct.product_unit_id,
        batch: selectedProduct.batch || null,
        manufacturing_date: selectedProduct.manufacturing_date || null,
        expiry_date: selectedProduct.expiry_date || null,
        quantity: Number(quantity),
        unit_price: priced.price,
        latestPrice: latestPrice,
        buy_price: selectedProduct.buy_price,
        buy_price_currency:
          selectedProduct.buy_currency || getFormCurrencyCode(),
        calculated_price: priced.price,
        currency: priced.currency,
        subtotal: Number(quantity) * priced.price,
        availableUnits: selectedProduct.availableUnits,
        warehouse_stock: selectedProduct.warehouse_stock,
      });
    }

    // Important: reassign so Svelte updates the table
    items = [...items];

    dispatch('update', { items });

    // Reset
    search = '';
    selectedProduct = null;
    quantity = 1;
    unit_price = 0;
    unit_currency = '';
    setTimeout(() => {
      if (window.mdb) {
        document
          .querySelectorAll(
            '[data-mdb-input-init]',
          )
          .forEach(
            (element) =>
              new window.mdb.Input(element),
          );
      }
    }, 100);

    return affectedRowIndex;
  }

  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
    dispatch('update', { items });
  }

  function clearItems() {
    items = [];
    dispatch('update', { items });
  }

  function getCalculatedStock(item) {
    if (enable_duplicate_product) {
      const totalQuantity = items
        .filter((i) => i.product_id === item.product_id)
        .reduce((sum, i) => {
          const selectedUnit = i.availableUnits?.find((u) => u.id === i.product_unit_id);
          const multiplier = selectedUnit?.multiplier || 1;
          return sum + i.quantity * multiplier;
        }, 0);
      return Math.floor(
        (getVisibleProductStock(item) - totalQuantity) /
          (item.availableUnits?.find((u) => u.id === item.product_unit_id)?.multiplier || 1),
      );
    }
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;
    return Math.floor(getVisibleProductStock(item) / multiplier);
  }

  function adjustQuantity(item, index, delta) {
    const next = Number(item.quantity || 0) + delta;
    item.quantity = Math.max(0, Number.isFinite(next) ? next : 0);
    recalc(index);
  }

  function recalc(index) {
    const item = items[index];

    // Find the selected unit
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;

    // Get stock in the warehouse adjusted for selected unit
    let stock = Math.floor(getVisibleProductStock(item) / multiplier);

    // Adjust quantity if it exceeds available stock

    if (enable_duplicate_product) {
      const totalQuantity = items
        .filter((i) => i.product_id === item.product_id)
        .reduce((sum, i) => {
          const selectedUnit = i.availableUnits?.find((u) => u.id === i.product_unit_id);
          const multiplier = selectedUnit?.multiplier || 1;
          return sum + i.quantity * multiplier;
        }, 0);
      stock = Math.floor((getVisibleProductStock(item) - totalQuantity + item.quantity * multiplier) / multiplier);
    }

    if (!enable_stock_minus && stock < item.quantity && item.type !== 'service') {
      item.quantity = stock;
    }

    // Calculate subtotal using multiplier
    item.subtotal = Number(item.quantity) * (Number(item.calculated_price) || 0);

    items = [...items];
    dispatch('update', { items });
  }

  let barcodeTimer;
  function handleBarcode(e) {
    if (barcodeTimer) clearTimeout(barcodeTimer);

    if (e.key === 'Enter') {
      processBarcode(barcodeInput);
      barcodeInput = '';
      return;
    }

    barcodeTimer = setTimeout(() => {
      barcodeInput = '';
    }, 100);
  }

  async function processBarcode(code) {
    if (!warehouse_id) {
      toast.warning(t('Please select a warehouse first.'));
      return;
    }

    const product = products.find(
      (item) =>
        String(item.code) === String(code) &&
        (item.product_status
          ? item.product_status === 'active'
          : true) &&
        Number(item.status) === 1,
    );

    if (!product) return;

    const selected = await selectProduct(product);

    if (selected) {
      addItem();
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    let toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (typeof toCurrencyCode === 'object') {
      toCurrency = toCurrencyCode;
    }
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  $: total = items.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency.code) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${currency.code} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  let search_input = null;

  let showProductDropdown = false;
  let isProductCellEditing = false;

  /*
   * Warehouse is the one setting the items card owns (SaleNew shows it as a
   * field in the card header); everything else about it lives in the parent.
   */
  let warehouseOpen = false;

  $: selectedWarehouseName =
    warehouses.find((row) => String(row.id) === String(warehouse_id))?.name || '';

  function pickWarehouse(row) {
    warehouseOpen = false;

    if (String(row.id) === String(warehouse_id)) return;

    warehouse_id = row.id;
  }

  $: {
    // Explicit dependencies so the list refreshes after Dexie reloads.
    products;
    warehouse_products;
    search;
    enable_stock_minus;

    const currentWarehouseId = warehouse_id
      ? Number(warehouse_id)
      : null;

    if (currentWarehouseId !== previousWarehouseId) {
      previousWarehouseId = currentWarehouseId;

      search = '';
      selectedProduct = null;
      stock = 0;
      quantity = 1;
      unit_price = 0;
      unit_currency = '';
      unit = 0;
      latestPrice = null;
      showProductDropdown = false;
      isProductCellEditing = false;
    }

    filteredProducts = getAvailableProducts(search);

    if (
      !enable_stock_minus &&
      selectedProduct &&
      selectedProduct.type !== 'service' &&
      getVisibleProductStock(selectedProduct) <= 0
    ) {
      selectedProduct = null;
      search = '';
      stock = 0;
    }
  }
</script>
<div class="card shadow-2 mt-4 purchase-items-card">
  <div class="card-body">
    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="sfi-head">
      <h3 class="sfi-head__title">
        <i class="ms f" aria-hidden="true">medication</i>
        <span>{t('Sale Items')}</span>
      </h3>

      <div class="sfi-wh">
        <button
          type="button"
          class="sfi-wh__field"
          class:is-open={warehouseOpen}
          aria-haspopup="listbox"
          aria-expanded={warehouseOpen}
          title={t('Warehouse')}
          aria-label={t('Warehouse')}
          on:click={() => (warehouseOpen = !warehouseOpen)}>
          <i class="ms" aria-hidden="true">warehouse</i>
          <span class="sfi-wh__name">{selectedWarehouseName || t('Select Warehouse')}</span>
          <i class="ms sfi-wh__chev" aria-hidden="true">expand_more</i>
        </button>

        {#if warehouseOpen}
          <div class="sfi-wh__menu" role="listbox" aria-label={t('Warehouse')}>
            {#each warehouses as wh (wh.id)}
              {@const active = String(warehouse_id) === String(wh.id)}
              <button
                type="button"
                role="option"
                aria-selected={active}
                class="sfi-wh__opt"
                class:is-active={active}
                title={wh.name}
                on:click={() => pickWarehouse(wh)}>
                <span class="sfi-wh__opt-name">{wh.name}</span>
                <i class="ms sfi-wh__check" aria-hidden="true">check</i>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="sfi-sbar" class:is-open={showProductDropdown}>
        <i class="ms sfi-sbar__icon" aria-hidden="true">search</i>

        <input
          type="text"
          id="form_product_search"
          class="sfi-sbar__input"
          bind:this={search_input}
          bind:value={search}
          role="combobox"
          aria-expanded={showProductDropdown}
          aria-controls="sale-product-suggestions"
          aria-autocomplete="list"
          aria-label={t('Select Product')}
          placeholder={t('Search product by name, barcode, or SKU...')}
          autocomplete="off"
          on:input={handleProductSearchInput}
          on:focus={() => {
            showProductDropdown = true;
            refreshAvailableProducts();
          }}
          on:keydown={(event) => {
            if (event.key === 'Enter') {
              const match =
                filteredProducts[0] ||
                products.find((row) => productMatchesSearch(row, search));

              if (match) {
                event.preventDefault();
                selectAndAddProduct(match);
              }
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              closeProductCellSearch();
            }
          }}
          on:blur={() =>
            setTimeout(() => {
              if (!selectingProduct) {
                showProductDropdown = false;
              }
            }, 180)} />

        {#if showProductDropdown && filteredProducts.length > 0}
          <div
            id="sale-product-suggestions"
            role="listbox"
            aria-label={t('Select Product')}
            class="sfi-suggest">
            <div class="sfi-suggest__scroll">
              {#each filteredProducts as prod (prod.id)}
                {@const stock = Number(prod.warehouse_stock || 0)}
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  class="sfi-suggest__row"
                  title={prod.name}
                  on:mousedown|preventDefault={() => selectAndAddProduct(prod)}>
                  <span class="sfi-suggest__copy">
                    <strong>{prod.name}</strong>

                    <small>
                      {categories.find((category) => category.id === prod.category_id)?.name || t('Category')}
                    </small>
                  </span>

                  {#if prod.type === 'service'}
                    <span class="sfi-suggest__service">{t('Service')}</span>
                  {:else}
                    <span
                      class="sfi-suggest__stock"
                      class:is-low={stock > 0 && stock <= 5}
                      class:is-negative={stock <= 0}
                      title={t('Stock')}>
                      <strong dir="ltr">
                        {stock.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      </strong>

                      <small>
                        {units.find((item) => item.id === prod.product_unit_id)?.name || t('Unit')}
                      </small>
                    </span>
                  {/if}
                </button>
              {/each}
            </div>

            <div class="sfi-suggest__hint" aria-hidden="true">
              <span>↑↓ {t('Select')} · Enter · Esc</span>
              <span class="sfi-suggest__count" dir="ltr">{filteredProducts.length}</span>
            </div>
          </div>
        {/if}

        {#if showProductDropdown && warehouse_id && search.trim() && filteredProducts.length === 0}
          <div class="sfi-suggest sfi-suggest--empty">
            <i class="ms" aria-hidden="true">search_off</i>
            <span class="sfi-suggest__empty-text">«{search}» {t('No products available')}</span>
            <button type="button" class="sfi-suggest__new" on:click={openCreateProductModal}>
              <i class="ms" aria-hidden="true">add</i>
              {t('New Product')}
            </button>
          </div>
        {/if}

        <kbd class="sfi-kbd" title={t('Press F2 to search')}>F2</kbd>
        <span class="sfi-divider" aria-hidden="true"></span>

        <button
          type="button"
          class="sfi-new"
          title={t('New Product')}
          aria-label={t('New Product')}
          on:click={openCreateProductModal}>
          <i class="ms" aria-hidden="true">add_circle</i>
          <span class="sfi-new__label">{t('New Product')}</span>
        </button>
      </div>
    </div>

    {#if items.length > 0}
      <div class="sfi-table-wrap">
        <table class="sfi-table">
        <thead>
          <tr>
            <th class="sfi-col-idx">#</th>
            <th class="sfi-col-name">{t('Product')}</th>
            {#if enable_batch}
              <th class="sfi-col-batch">{t('Batch')}</th>
              <th class="sfi-col-exp">{t('Expiry Date')}</th>
            {/if}
            <th class="sfi-col-qty">{t('Quantity')}</th>
            <th class="sfi-col-price">{t('Sell Price')}</th>
            <th class="sfi-col-total">{t('Subtotal')}</th>
            <th class="sfi-col-act"><span class="sfi-sr">{t('Actions')}</span></th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td class="sfi-col-idx"><span dir="ltr">{index + 1}</span></td>
              <td class="sfi-col-name">
                <span class="sfi-name" title={item.product_name}>{item.product_name}</span>
                {#if item.type !== 'service'}
                  <span class="sfi-meta">
                    {#if item.batch}
                      <span class="sfi-meta__code" dir="ltr">{item.batch}</span>
                    {/if}
                    <span
                      class="sfi-meta__stock"
                      class:is-low={Number(getCalculatedStock(item) || 0) <= 5}
                      title={t('Present in Warehouse')}>
                      {Number(getCalculatedStock(item) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
                    </span>
                  </span>
                {/if}
              </td>
              {#if enable_batch}
                <td class="sfi-col-batch">
                  {#if item.type === 'service'}
                    <span class="sfi-readonly">-</span>
                  {:else}
                    <select
                      class="sfi-batch-select"
                      value={item.batch_option_id || item.stock_batch_id || item.batch || ''}
                      aria-label={t('Batch')}
                      on:mousedown={() => handleBatchDropdownFocus(item)}
                      on:focus={() => handleBatchDropdownFocus(item)}
                      on:change={(event) => handleBatchDropdownChange(item, index, event.currentTarget.value)}>
                      {#if !item.batch_options?.length}
                        <option value={item.batch_option_id || item.stock_batch_id || item.batch || ''}>
                          {item.batch || '-'}
                        </option>
                      {:else}
                        {#each item.batch_options as batch}
                          <option value={batch.id}>
                            {batch.batch_number || '-'} / {Number(batch.quantity_remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          </option>
                        {/each}
                      {/if}
                    </select>
                  {/if}
                </td>
                <td class="sfi-col-exp">
                  <span class="sfi-readonly" dir="ltr">{item.type === 'service' ? '-' : item.expiry_date || '-'}</span>
                </td>
              {/if}
              <td class="sfi-col-qty">
                <span class="sfi-qty">
                  <button
                    type="button"
                    class="sfi-qty__btn"
                    aria-label={t('Increase')}
                    on:click={() => adjustQuantity(item, index, 1)}>
                    <i class="ms" aria-hidden="true">add</i>
                  </button>

                  <input
                    type="number"
                    class="sfi-qty__input"
                    min="0"
                    step="any"
                    data-sale-item-index={index}
                    data-sale-item-field="quantity"
                    bind:value={item.quantity}
                    aria-label={t('Quantity')}
                    dir="ltr"
                    on:input={() => recalc(index)}
                    on:keydown={(event) =>
                      handleSaleItemEnter(
                        event,
                        index,
                        'price',
                      )} />

                  <button
                    type="button"
                    class="sfi-qty__btn"
                    aria-label={t('Decrease')}
                    on:click={() => adjustQuantity(item, index, -1)}>
                    <i class="ms" aria-hidden="true">remove</i>
                  </button>

                  <span class="sfi-qty__divider" aria-hidden="true"></span>

                  {#if item.availableUnits?.length > 1}
                    <FilterSelect compact value={item.product_unit_id}
                      label={t('Unit')} options={item.availableUnits.map((unit)=>({value:unit.id,label:unit.name}))}
                      on:change={(event)=>changeUnit(item,event.detail)} />
                  {:else}
                    <span class="sfi-qty__unit"
                      >{item.availableUnits?.[0]?.name || units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                  {/if}
                </span>
              </td>
              <td class="sfi-col-price">
                <span class="sfi-price">
                  <input
                    type="number"
                    class="sfi-price__input"
                    step="any"
                    data-sale-item-index={index}
                    data-sale-item-field="price"
                    bind:value={item.calculated_price}
                    aria-label={t('Sell Price')}
                    dir="ltr"
                    on:input={() => recalc(index)}
                    on:keydown={(event) =>
                      handleSaleItemEnter(
                        event,
                        index,
                        'product',
                      )} />

                  <span class="sfi-price__cur">{currencySymbol(item.currency)}</span>
                </span>

                {#if enable_show_buy_price_and_latest_sale_price_in_item}
                  <span class="sfi-price__sub">
                    {#if enable_show_buy_price}
                      <span>
                        {t('Buy Price')}:
                        <b dir="ltr">{Number(item.buy_price || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}</b>
                        {currencySymbol(item.buy_price_currency)}
                      </span>
                    {/if}
                    {#if enable_show_latest_sale_price && item.latestPrice}
                      <span>
                        {t('Last Sold Price')}:
                        <button
                          type="button"
                          class="sfi-price__link"
                          on:click={() => {
                            const priced = priceInFormCurrency(
                              item.latestPrice.price,
                              item.latestPrice.currency,
                            );
                            item.calculated_price = priced.price;
                            item.unit_price = priced.price;
                            item.currency = priced.currency;
                            recalc(index);
                          }}>
                          {Number(item.latestPrice.price || 0).toLocaleString(undefined, {
                            maximumFractionDigits: 3,
                          })}
                          {currencySymbol(item.latestPrice.currency)}
                        </button>
                      </span>
                    {/if}
                  </span>
                {/if}
              </td>
              <td class="sfi-col-total">
                <span class="sfi-total">
                  {#if item.currency != currency?.code}
                    <strong dir="ltr">{exchangeRate(item.subtotal, item.currency, currency).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}</strong>
                    <small>{currencySymbol(currency?.code)}</small>
                    <em class="sfi-total__conv" dir="ltr">
                      {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                      {currencySymbol(item.currency)}
                    </em>
                  {:else}
                    <strong dir="ltr">{Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>
                    <small>{currencySymbol(item.currency)}</small>
                  {/if}
                </span>
              </td>
              <td class="sfi-col-act">
                <button
                  type="button"
                  class="sfi-del"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeItem(index)}>
                  <i class="ms" aria-hidden="true">delete</i>
                </button>
              </td>
            </tr>
          {/each}


        </tbody>
        </table>
      </div>

      <footer class="sfi-foot">
        <span class="sfi-foot__stats">
          <span>{t('Items')} <b dir="ltr">{items.length}</b></span>
        </span>

        <span class="sfi-foot__total">
          <span>{t('Total')}</span>
          <strong dir="ltr">
            {Number(total || 0).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </strong>
          <small>{currencySymbol(currency?.code || currency || 'AFN')}</small>
        </span>

        <button type="button" class="sfi-foot__clear" on:click={clearItems}>
          <i class="ms" aria-hidden="true">delete_sweep</i>
          <span>{t('Clear All')}</span>
        </button>
      </footer>
    {:else}
      <div class="sfi-empty">
        <span class="sfi-empty__icon" aria-hidden="true">
          <i class="ms">barcode_scanner</i>
        </span>
        <strong>{t('No items yet. Search for a product above to add it.')}</strong>
        <small>{t('Search product by name, barcode, or SKU...')}</small>
      </div>
    {/if}
  </div>
</div>

{#if showProductModal && ProductModalCmp}
  <svelte:component
    this={ProductModalCmp}
    bind:this={productModal}
    {categories}
    {units}
    {warehouses}
    type="sale"
    {warehouse_id}
    defaultCurrency="AFN"
    {warehouse_products}
    on:saved={async (event) => {
      const createdId = event.detail?.id;
      let newProduct = null;

      if (createdId) {
        newProduct = (await productApi.getById(createdId))?.data || null;
        if (newProduct) products = mergeById(products, [newProduct]);
      }

      if (warehouse_id) await loadWarehouseStock(warehouse_id);
      refreshAvailableProducts();

      if (!newProduct) return;

    const availableStock =
      newProduct.type === 'service'
        ? null
        : getProductStock(newProduct.id);

    if (
      !enable_stock_minus &&
      newProduct.type !== 'service' &&
      Number(availableStock || 0) <= 0
    ) {
      toast.warning(
        t('The new product has no stock in the selected warehouse.'),
      );
      return;
    }

    const availableUnits = getUnitHierarchy(
      newProduct.product_unit_id,
    );

    const priced = priceInFormCurrency(
      newProduct.sell_price,
      newProduct.sell_currency,
    );

    items.push({
      type: newProduct.type || 'good',
      product_id: newProduct.id,
      product_name: newProduct.name,
      product_unit_id: newProduct.product_unit_id,
      batch: newProduct.batch || null,
      manufacturing_date: newProduct.manufacturing_date || null,
      expiry_date: newProduct.expiry_date || null,
      currency: priced.currency,
      quantity: 1,
      latestPrice: null,
      buy_price: newProduct.buy_price,
      buy_price_currency:
        newProduct.buy_currency || getFormCurrencyCode(),
      unit_price: priced.price,
      calculated_price: priced.price,
      subtotal: priced.price,
      availableUnits,
      warehouse_stock: availableStock,
    });

    items = [...items];
    dispatch('update', { items });
  }} />
{/if}

{#if batchModalOpen}
  <div class="sale-batch-backdrop" on:click={closeBatchModal}></div>
  <div class="sale-batch-layer" role="dialog" aria-modal="true" aria-label={t('Batch')}>
    <section class="sale-batch-modal" on:click|stopPropagation>
      <header class="sale-batch-header">
        <div>
          <span><i class="bi bi-layers" aria-hidden="true"></i></span>
          <div>
            <small>{batchModalItem?.product_name}</small>
            <h2>{t('Available Batches')}</h2>
          </div>
        </div>
        <button type="button" aria-label={t('Close')} on:click={closeBatchModal}>
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </header>

      <div class="sale-batch-body">
        {#if batchModalLoading}
          <div class="sale-batch-empty">{t('Loading...')}</div>
        {:else if batchModalBatches.length === 0}
          <div class="sale-batch-empty">{t('No batches available')}</div>
        {:else}
          <div class="sale-batch-list">
            {#each batchModalBatches as batch}
              <button
                type="button"
                class:selected={batchModalItem?.stock_batch_id === batch.id}
                on:click={() => selectBatch(batch)}>
                <span>
                  <strong>{getBatchLabel(batch)}</strong>
                  <small>
                    {t('Batch')}: {batch.batch_number || '-'} · {t('Expiry Date')}: {batch.expiry_date || '-'}
                  </small>
                </span>
                <span class="sale-batch-qty">
                  {Number(batch.quantity_remaining || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {units.find((u) => u.id === batchModalItem?.product_unit_id)?.name || t('Unit')}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
{/if}
<style>
  .purchase-items-card {
    --sale-primary: var(--bs-primary, #2f6fed);
    --sale-primary-dark: #1d4ed8;
    --sale-border: #dfe6ef;
    --sale-border-soft: #edf1f6;
    --sale-text: #172033;
    --sale-muted: #718096;

    position: relative;
    z-index: 35;
    width: 100%;
    margin-top: 1rem !important;
    overflow: visible;
    border: 1px solid var(--sale-border);
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

  .purchase-items-card :global(.card-body) {
    padding: 0;
    overflow: visible;
  }

  /* Sale Items heading — same visual language as Purchase Items. */
  .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
    display: flex !important;
    align-items: center !important;
    min-height: 4.75rem;
    margin: 0 !important;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--sale-border-soft);
    background: #ffffff;
  }

  .purchase-items-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: var(--sale-text);
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .purchase-items-title::before {
    content: '\F23D';
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-family: 'bootstrap-icons';
    font-size: 1rem;
    font-weight: 400;
  }

  /* Hidden barcode field */
  .purchase-items-card > :global(.position-absolute.opacity-0),
  .purchase-items-card :global(input.position-absolute.opacity-0) {
    width: 1px;
    height: 1px;
    overflow: hidden;
    pointer-events: none;
  }

  /*
   * Permanent blank product row.
   * It looks like a normal table row, not a separate search bar.
   */
  .purchase-item-search-row {
    height: 4.25rem;
    background: #ffffff;
  }

  .purchase-item-search-row:hover {
    background: #f4f8ff !important;
  }

  .purchase-item-search-row > td {
    height: 4.25rem !important;
    padding: 0.45rem 0.25rem !important;
    border-bottom: 1px solid #e9eef5 !important;
    background: transparent !important;
    vertical-align: middle !important;
  }

  .purchase-item-search-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 7;
    padding-inline: 0.625rem !important;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
    cursor: text;
    outline: none;
  }

  .purchase-item-search-row:hover .purchase-item-search-cell {
    background: #f4f8ff !important;
  }

  .purchase-item-search-cell:focus-visible,
  .purchase-item-search-cell--editing {
    background: #f8fbff !important;
    box-shadow:
      inset 0 0 0 1px rgba(47, 111, 237, 0.22),
      1px 0 0 #e9eef5;
  }

  /*
   * Inactive Product TD.
   */
  .purchase-item-empty-product {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    color: #718096;
    text-align: start;
  }

  .purchase-item-empty-product__icon {
    display: inline-grid;
    flex: 0 0 1.85rem;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.45rem;
    background: #edf4ff;
    color: var(--sale-primary);
    font-size: 0.68rem;
    cursor: pointer;
  }

  .purchase-item-empty-product__icon:hover {
    background: #dbeafe;
  }

  .purchase-item-empty-product__icon:focus-visible {
    outline: 2px solid var(--sale-primary);
    outline-offset: 2px;
  }

  .purchase-item-empty-product__copy {
    display: grid;
    min-width: 0;
    gap: 0.08rem;
  }

  .purchase-item-empty-product__copy strong {
    color: #526176;
    font-size: 0.74rem;
    font-weight: 800;
    line-height: 1.25;
  }

  .purchase-item-empty-product__copy small {
    color: #94a3b8;
    font-size: 0.61rem;
    font-weight: 600;
  }

  /*
   * Active search uses the TD itself. There is no bordered search-bar box.
   */
  .purchase-item-inline-search {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    min-width: 0;
    min-height: 2.35rem;
    background: transparent;
  }

  .purchase-item-search-icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    color: var(--sale-primary);
    font-size: 0.76rem;
  }

  .purchase-item-search-input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 2.35rem;
    padding: 0 0.3rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font: inherit;
    font-size: 0.76rem;
    font-weight: 700;
    text-align: start;
    box-shadow: none;
  }

  .purchase-item-search-input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  /*
   * Table shell
   *
   * Horizontal scrolling stays on the outer wrapper.
   * Vertical scrolling is applied only to <tbody>, so:
   * - the table header stays visible
   * - the Sale Items footer stays outside the scroll area
   * - the page can still scroll normally when the body reaches its end
   */
  .purchase-items-card :global(.table-responsive),
  .purchase-items-card :global(.sale-items-scroll-area) {
    width: 100%;
    max-width: 100%;
    min-height: 0;
    height: auto;
    max-height: none;

    overflow-x: auto !important;
    overflow-y: visible !important;

    border: 0;
    background: #ffffff;

    overscroll-behavior: auto;
    scrollbar-gutter: auto;

    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  /*
   * Keep the table header outside the vertical scroll area.
   */
  .purchase-items-table :global(thead) {
    display: table;
    width: 100%;
    table-layout: fixed;
  }

  /*
   * Five sale-item rows plus the permanent searchable row.
   * Only the table body scrolls.
   */
  .purchase-items-table :global(tbody) {
    display: block;
    width: 100%;
    max-height: calc(21.25rem + 4.25rem);

    overflow-x: hidden;
    overflow-y: auto;

    overscroll-behavior-y: auto;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  /*
   * Preserve column alignment after making tbody scrollable.
   */
  .purchase-items-table :global(tbody > tr) {
    display: table;
    width: 100%;
    table-layout: fixed;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar) {
    width: 0.45rem;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-track) {
    background: transparent;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-table :global(tbody::-webkit-scrollbar-thumb:hover) {
    background: #94a3b8;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar) {
    width: 0.45rem;
    height: 0.45rem;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-track) {
    background: transparent;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb) {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb:hover) {
    background: #94a3b8;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 44rem;
    margin: 0 !important;
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    color: #42516a;
  }

  .purchase-items-table :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2.875rem;
    padding: 0.55rem 0.5rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #f7f9fc !important;
    color: #67768a;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.2;
    letter-spacing: 0;
    text-align: center;
    text-transform: none;
    vertical-align: middle;
    white-space: nowrap;
  }

  .purchase-items-table :global(thead th:first-child) {
    text-align: start;
  }

  .purchase-items-table :global(tbody tr) {
    height: 4.25rem;
    background: #ffffff;
    transition: background 0.12s ease;
  }

  .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #fbfcfe;
  }

  .purchase-items-table :global(tbody tr:hover) {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(tbody td) {
    height: 4.25rem;
    padding: 0.45rem 0.25rem;
    border: 0;
    border-bottom: 1px solid #e9eef5;
    background: transparent;
    color: #46566d;
    font-size: 0.74rem;
    text-align: center;
    vertical-align: middle;
  }

  /* Keep product dominant while reserving useful space for editable columns. */
  .purchase-item-col-product {
    width: 42%;
    min-width: 15rem;
  }

  .purchase-item-product-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 2;
    padding-inline: 0.625rem !important;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
  }

  .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #fbfcfe !important;
  }

  .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #f4f8ff !important;
  }

  .purchase-items-table :global(thead .purchase-item-col-product) {
    inset-inline-start: 0;
    z-index: 6;
    background: #f7f9fc !important;
    box-shadow: 1px 0 0 #dfe5ed;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    max-width: none;
    overflow: visible;
    white-space: normal;
  }

  .purchase-item-product-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  .purchase-item-batch-button {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border: 1px solid #d8e4f8;
    border-radius: 0.5rem;
    background: #f3f7fe;
    color: var(--sale-primary);
    cursor: pointer;
  }

  .purchase-item-batch-button:hover {
    border-color: #bad0f5;
    background: #edf4ff;
  }

  .sale-batch-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1500;
    background: rgba(15, 23, 42, 0.48);
  }

  .sale-batch-layer {
    position: fixed;
    inset: 0;
    z-index: 1510;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .sale-batch-modal {
    width: min(94vw, 34rem);
    overflow: hidden;
    border: 1px solid #dce4ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 26px 70px rgba(15, 23, 42, 0.22);
  }

  .sale-batch-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    border-bottom: 1px solid #e8eef6;
  }

  .sale-batch-header > div {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .sale-batch-header > div > span {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.55rem;
    background: #edf4ff;
    color: var(--sale-primary);
  }

  .sale-batch-header small {
    display: block;
    overflow: hidden;
    color: #8794a7;
    font-size: 0.58rem;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sale-batch-header h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.9rem;
    font-weight: 850;
  }

  .sale-batch-header > button {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    place-items: center;
    border: 1px solid #e0e6ee;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #718096;
    cursor: pointer;
  }

  .sale-batch-body {
    padding: 0.8rem;
  }

  .sale-batch-list {
    display: grid;
    gap: 0.4rem;
    max-height: 22rem;
    overflow-y: auto;
  }

  .sale-batch-list > button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: 3.2rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid #e4e9f0;
    border-radius: 0.6rem;
    background: #ffffff;
    color: #26364b;
    text-align: start;
    cursor: pointer;
  }

  .sale-batch-list > button:hover,
  .sale-batch-list > button.selected {
    border-color: #cddbf0;
    background: #f5f9ff;
  }

  .sale-batch-list strong,
  .sale-batch-list small {
    display: block;
  }

  .sale-batch-list strong {
    font-size: 0.75rem;
    font-weight: 850;
  }

  .sale-batch-list small {
    color: #8794a7;
    font-size: 0.61rem;
    font-weight: 600;
  }

  .sale-batch-qty {
    flex: 0 0 auto;
    color: #087a54;
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .sale-batch-empty {
    display: grid;
    min-height: 8rem;
    place-items: center;
    color: #8794a7;
    font-size: 0.76rem;
    font-weight: 750;
  }

  .purchase-item-product-name {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 850;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-product-copy small {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-col-batch {
    width: 9%;
    min-width: 6rem;
    white-space: nowrap;
  }

  .purchase-item-col-expiry {
    width: 11%;
    min-width: 7.5rem;
    white-space: nowrap;
  }

  .purchase-item-readonly {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.25rem;
    max-width: 100%;
    padding: 0 0.6rem;
    overflow: hidden;
    border: 1px solid #e3e8ef;
    border-radius: 0.5rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.68rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-item-batch-select {
    width: min(100%, 8.5rem);
    min-height: 2.25rem;
    padding: 0 1.8rem 0 0.55rem;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #26364b;
    font-size: 0.68rem;
    font-weight: 800;
    text-align: center;
    cursor: pointer;
  }

  .purchase-item-batch-select:focus {
    border-color: #78a4f5;
    outline: 0;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-item-col-quantity {
    width: 14%;
    min-width: 8.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-price {
    width: 14%;
    min-width: 8.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-subtotal {
    width: 9%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-actions {
    width: 5%;
    min-width: 4rem;
    white-space: nowrap;
  }

  /* Editable fields */
  .purchase-items-table .purchase-item-cell-group {
    display: inline-flex;
    align-items: stretch;
    width: fit-content;
    min-width: 0;
    max-width: none;
    height: 2.25rem;
    min-height: 2.25rem;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: none;
    vertical-align: middle;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-items-table .purchase-item-cell-group:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-items-table .purchase-item-cell-group :global(.form-control) {
    field-sizing: content;
    flex: 0 0 auto;
    inline-size: auto;
    width: auto;
    min-inline-size: 3ch;
    min-width: 3ch;
    max-inline-size: none;
    max-width: none;
    height: 100% !important;
    min-height: 0 !important;
    padding: 0 0.45rem;
    border: 0 !important;
    border-radius: 0 !important;
    outline: 0;
    background: transparent !important;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: center;
    box-shadow: none !important;
  }

  .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 2.75rem;
    height: 100%;
    padding: 0 0.4rem;
    border: 0 !important;
    border-inline-start: 1px solid #e3e8ef !important;
    border-radius: 0 !important;
    background: #f7f9fc !important;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  /* Unit FilterSelect inside quantity cell */
  .purchase-item-col-quantity :global(.filter-select) {
    flex: 0 0 auto;
    width: auto !important;
    min-width: 4.5rem;
    max-width: 8rem !important;
    height: 100%;
    border-inline-start: 1px solid #e3e8ef;
  }

  .purchase-item-col-quantity :global(.filter-select__trigger) {
    width: 100%;
    min-height: 100% !important;
    height: 100% !important;
    padding: 0 0.45rem !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: #f7f9fc !important;
    color: #718096 !important;
    font-size: 0.62rem !important;
    font-weight: 750 !important;
    box-shadow: none !important;
  }

  .purchase-item-stock {
    margin-top: 0.28rem;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    line-height: 1.35;
    text-align: center;
  }

  .purchase-item-stock-link {
    color: var(--sale-primary) !important;
    font-size: 0.63rem !important;
    font-weight: 750 !important;
    line-height: inherit;
    text-decoration: none;
    vertical-align: baseline;
  }

  /* Subtotal */
  .purchase-item-money {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.3rem;
    width: fit-content;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-item-money strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .purchase-item-money small {
    margin: 0;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
  }

  /* Delete */
  .purchase-item-actions {
    text-align: center !important;
  }

  .purchase-items-table :global(.btn-outline-danger) {
    display: inline-grid;
    width: 2rem !important;
    min-width: 2rem !important;
    height: 2rem !important;
    min-height: 2rem !important;
    padding: 0 !important;
    place-items: center;
    border: 1px solid #f3cccc !important;
    border-radius: 0.5rem !important;
    background: #fff7f7 !important;
    color: #d64545 !important;
    font-size: 0.75rem;
    line-height: 1;
    box-shadow: none !important;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-items-table :global(.btn-outline-danger:hover) {
    transform: translateY(-1px);
    border-color: #efaaaa !important;
    background: #feecec !important;
    color: #c53030 !important;
  }

  /* Footer total row */
  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4rem;
    margin: 0 !important;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--sale-border-soft);
    border-radius: 0 0 0.875rem 0.875rem;
    background: #fbfcfe;
  }

  .purchase-items-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid #f3cccc;
    border-radius: 0.55rem;
    background: #ffffff;
    color: #dc2626;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-items-clear-btn:hover {
    transform: translateY(-1px);
    border-color: #efaaaa;
    background: #fff5f5;
  }

  .purchase-items-clear-btn i {
    font-size: 0.72rem;
  }

  .purchase-items-grand-total {
    display: inline-flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-items-grand-total > span {
    color: #526176;
    font-size: 0.72rem;
    font-weight: 800;
  }

  .purchase-items-grand-total > strong {
    color: var(--sale-primary);
    font-size: 1.05rem;
    font-weight: 900;
    line-height: 1;
  }

  .purchase-items-grand-total > small {
    color: #718096;
    font-size: 0.64rem;
    font-weight: 800;
  }

  /* RTL */
  :global(html[dir='rtl']) .purchase-item-product-cell,
  :global(html[dir='rtl']) .purchase-item-search-cell {
    box-shadow: -1px 0 0 #e9eef5;
  }

  :global(html[dir='rtl']) .purchase-items-table thead .purchase-item-col-product {
    box-shadow: -1px 0 0 #dfe5ed;
  }

  /* Responsive */
  @media (max-width: 767.98px) {
    .purchase-items-card {
      border-radius: 0.75rem;
    }

    .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
      min-height: 4.25rem;
      padding: 0.8rem;
    }

    .purchase-items-table {
      min-width: 42rem;
    }

    .purchase-items-card :global(.table-responsive),
    .purchase-items-card :global(.sale-items-scroll-area) {
      min-height: 0;
      height: auto;
      max-height: none;
      overflow-y: visible !important;
    }

    .purchase-items-table :global(tbody) {
      max-height: calc(17rem + 4.25rem);
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }

  #form_product_search:disabled {
    background: #f7f9fc !important;
    color: #94a3b8;
    cursor: not-allowed;
  }

  /* Dark theme */

  :global(html.dark) .purchase-items-card {
    --sale-border: var(--erp-border, #2b3a4f);
    --sale-border-soft: var(--erp-border, #2b3a4f);
    --sale-text: var(--erp-text, #e5edf8);
    --sale-muted: var(--erp-muted, #94a3b8);
    border-color: var(--sale-border);
    background: var(--erp-surface, #111827);
    color-scheme: dark;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
  }

  :global(html.dark) #form_product_search:disabled {
    background: #202b3d !important;
    color: #718198;
  }

  /* ===== Items section (SaleNew «ادویه‌ها» layout) ===== */
  .sfi-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--z-border-soft, #edf1f6);
  }

  .sfi-head__title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--z-ink, #172033);
    font-size: 12.5px;
    font-weight: 800;
    white-space: nowrap;
  }

  .sfi-head__title .ms {
    color: var(--z-link, #2f6fed);
    font-size: 17px;
  }

  /* warehouse: a setting, drawn as a field with its label (SaleNew) */
  .sfi-wh {
    position: relative;
    flex-shrink: 0;
  }

  .sfi-wh__field {
    display: flex;
    align-items: center;
    gap: 5px;
    max-width: 180px;
    height: 34px;
    padding: 0 6px 0 9px;
    border: 1px solid var(--z-border-strong, #cfd9e6);
    border-radius: 10px;
    background: var(--z-brand-soft, #edf4ff);
    color: var(--z-link, #2f6fed);
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    box-sizing: border-box;
  }

  .sfi-wh__field .ms {
    font-size: 17px;
  }

  .sfi-wh__field.is-open {
    border-color: #2f6fed;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

  .sfi-wh__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-wh__chev {
    font-size: 15px !important;
  }

  .sfi-wh__menu {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-start: 0;
    z-index: 30;
    width: max(100%, 180px);
    padding: 3px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 10px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 14px 32px -14px rgba(11, 21, 48, 0.35);
    box-sizing: border-box;
  }

  .sfi-wh__opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    text-align: start;
    cursor: pointer;
  }

  .sfi-wh__opt:hover,
  .sfi-wh__opt.is-active {
    background: var(--z-brand-soft, #edf4ff);
    color: var(--z-link, #2f6fed);
  }

  .sfi-wh__opt-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-wh__check {
    flex-shrink: 0;
    font-size: 16px;
    color: var(--z-link, #2f6fed);
    visibility: hidden;
  }

  .sfi-wh__opt.is-active .sfi-wh__check {
    visibility: visible;
  }

  .sfi-sbar {
    position: relative;
    display: flex;
    flex: 1 1 220px;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 34px;
    padding: 0 11px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 10px;
    background: var(--z-surface-2, #f5f8fc);
    box-sizing: border-box;
  }

  .sfi-sbar.is-open {
    border-color: #2f6fed;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
  }

  .sfi-sbar__icon {
    flex-shrink: 0;
    color: var(--z-muted, #718096);
    font-size: 18px;
  }

  .sfi-sbar__input {
    flex: 1;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
  }

  .sfi-sbar__input::placeholder {
    color: var(--z-subtle, #94a3b8);
    font-weight: 500;
  }

  /* the shortcut chip and the add button live inside the search field */
  .sfi-kbd {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 20px;
    padding: 0 5px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--z-surface, #ffffff);
    color: var(--z-subtle, #94a3b8);
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2px;
    box-sizing: border-box;
  }

  .sfi-divider {
    flex-shrink: 0;
    width: 1px;
    height: 16px;
    background: var(--z-border, #dfe6ef);
  }

  .sfi-new {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 9px 0 6px;
    border: 0;
    border-radius: 7px;
    background: var(--z-brand-soft, #edf4ff);
    color: var(--z-link, #2f6fed);
    font: inherit;
    font-size: 11.5px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    box-sizing: border-box;
  }

  .sfi-new:hover {
    background: #dbeafe;
  }

  .sfi-new .ms {
    font-size: 17px;
  }

  /*
   * Results panel — SaleNew draws it as a 360px card attached to the inline
   * start of the search bar, with a scrolling list and a keyboard legend.
   */
  .sfi-suggest {
    position: absolute;
    top: calc(100% + 4px);
    inset-inline-start: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    width: 380px;
    max-width: calc(100vw - 48px);
    padding: 4px;
    overflow: hidden;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 12px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 18px 42px -16px rgba(11, 21, 48, 0.32);
    box-sizing: border-box;
    text-align: start;
  }

  .sfi-suggest__scroll {
    display: flex;
    /* keep the scroll box from collapsing under the legend */
    flex: 0 1 auto;
    flex-direction: column;
    gap: 2px;
    max-height: 232px;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* no scrollbar track or arrow buttons, as on the customer dropdown */
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .sfi-suggest__scroll::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .sfi-suggest__row {
    display: flex;
    /* the list is a capped column flexbox: rows must never compress */
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 4px 8px;
    overflow: hidden;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 12px;
    text-align: start;
    box-sizing: border-box;
    cursor: pointer;
  }

  .sfi-suggest__row:hover {
    background: var(--z-brand-soft, #edf4ff);
  }

  /* name over category, typed like the customer dropdown options */
  .sfi-suggest__copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
    text-align: start;
  }

  .sfi-suggest__copy strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-suggest__copy small {
    overflow: hidden;
    color: var(--z-muted, #718096);
    font-size: 10.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-suggest__stock {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 3px;
    color: var(--z-ok, #15803d);
    font-family: Inter, sans-serif;
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .sfi-suggest__stock strong {
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sfi-suggest__stock small {
    font-size: 9.5px;
    font-weight: 700;
    opacity: 0.78;
  }

  .sfi-suggest__stock.is-low {
    color: var(--z-warn, #92400e);
  }

  .sfi-suggest__stock.is-negative {
    color: #b91c1c;
  }

  .sfi-suggest__service {
    flex: 0 0 auto;
    color: var(--z-link, #2f6fed);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .sfi-suggest__hint {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 8px;
    height: 20px;
    padding: 0 7px;
    border-top: 1px solid var(--z-border-soft, #edf1f6);
    color: var(--z-subtle, #94a3b8);
    font-size: 9.5px;
  }

  .sfi-suggest__count {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
  }

  .sfi-suggest--empty {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0;
    padding-inline-start: 10px;
    padding-inline-end: 6px;
  }

  .sfi-suggest--empty .ms {
    color: var(--z-subtle, #94a3b8);
    font-size: 16px;
  }

  .sfi-suggest__empty-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--z-muted, #718096);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-suggest__new {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--z-border-strong, #cfd9e6);
    border-radius: 7px;
    background: var(--z-surface, #ffffff);
    color: var(--z-link, #2f6fed);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .sfi-suggest__new .ms {
    font-size: 14px;
  }

  /* table */
  .sfi-table-wrap {
    max-height: 284px;
    overflow-x: auto;
    overflow-y: auto;
    /*
     * Deliberately `auto`, not `contain`: the item list is a short window
     * inside a scrolling page, so the wheel has to keep going down to the
     * bill summary once the last row is reached.
     */
    overscroll-behavior: auto;
  }

  .sfi-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 12px;
    text-align: start;
  }

  .sfi-table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    height: 30px;
    padding: 0 8px;
    border-bottom: 1px solid var(--z-border-soft, #edf1f6);
    background: var(--z-surface-2, #f5f8fc);
    color: var(--z-muted, #718096);
    font-size: 10.5px;
    font-weight: 700;
    text-align: start;
    white-space: nowrap;
  }

  .sfi-table tbody td {
    height: 48px;
    padding: 10px 8px;
    border-bottom: 1px solid var(--z-border-soft, #edf1f6);
    vertical-align: top;
  }

  /*
   * Cells are top-aligned so the 28px controls (quantity stepper, price box)
   * stay on one line even when the sell cell grows its buy-price / last-sold
   * sub-lines. The product cell stacks two lines, so it takes a little less
   * block padding to keep the row at its 48px height.
   */
  .sfi-table tbody td.sfi-col-name {
    padding-block: 6px;
  }

  .sfi-table tbody tr:hover td {
    background: var(--z-surface-2, #f8fafc);
  }

  .sfi-col-idx {
    width: 30px;
    padding-inline-start: 8px !important;
    text-align: start;
  }

  .sfi-col-idx span {
    color: var(--z-subtle, #94a3b8);
    font-size: 9.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .sfi-col-name {
    min-width: 0;
  }

  .sfi-col-batch {
    width: 132px;
  }

  .sfi-col-exp {
    width: 96px;
  }

  .sfi-col-qty {
    width: 186px;
  }

  .sfi-table thead .sfi-col-price,
  .sfi-table thead .sfi-col-total,
  .sfi-table thead .sfi-col-act {
    text-align: end;
  }

  .sfi-col-price {
    width: 132px;
    text-align: end;
  }

  .sfi-col-total {
    width: 126px;
    text-align: end;
  }

  .sfi-col-act {
    width: 48px;
    padding-inline-end: 12px !important;
    text-align: end;
  }

  .sfi-name {
    display: block;
    overflow: hidden;
    color: var(--z-ink, #172033);
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 6px;
    margin-top: 2px;
    color: var(--z-muted, #718096);
    font-size: 10.5px;
  }

  .sfi-meta__code {
    font-family: Inter, sans-serif;
  }

  .sfi-meta__stock {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 5px;
    border-radius: 4px;
    background: var(--z-surface-3, #eef2f8);
    color: var(--z-muted, #718096);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .sfi-meta__stock.is-low {
    background: var(--z-warn-soft, #fef3c7);
    color: var(--z-warn, #92400e);
  }

  .sfi-readonly {
    color: var(--z-muted, #718096);
    font-size: 11.5px;
    font-weight: 600;
  }

  .sfi-batch-select {
    width: 100%;
    height: 28px;
    padding: 0 4px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 7px;
    background: var(--z-surface, #ffffff);
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  /* quantity + unit */
  .sfi-qty {
    display: inline-flex;
    align-items: center;
    width: 100%;
    height: 28px;
    overflow: hidden;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 8px;
    background: var(--z-surface, #ffffff);
    box-sizing: border-box;
  }

  .sfi-qty:focus-within {
    border-color: #2f6fed;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

  .sfi-qty__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--z-muted, #718096);
    cursor: pointer;
  }

  .sfi-qty__btn:hover {
    background: var(--z-surface-2, #f5f8fc);
    color: var(--z-link, #2f6fed);
  }

  .sfi-qty__btn .ms {
    font-size: 14px;
  }

  .sfi-qty__input {
    width: 44px;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 12.5px;
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .sfi-qty__input::-webkit-outer-spin-button,
  .sfi-qty__input::-webkit-inner-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }

  .sfi-qty__divider {
    flex-shrink: 0;
    width: 1px;
    height: 16px;
    background: var(--z-border, #dfe6ef);
  }

  .sfi-qty__unit {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 7px;
    overflow: hidden;
    color: var(--z-muted, #718096);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sfi-qty :global(.filter-select) {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
  }

  .sfi-qty :global(.filter-select__trigger) {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0 6px;
    border: 0;
    border-radius: 0;
    background: var(--z-surface-2, #f5f8fc);
    color: var(--z-ink, #172033);
    font-size: 11px;
    font-weight: 700;
  }

  /* price */
  .sfi-price {
    display: flex;
    align-items: center;
    max-width: 116px;
    height: 28px;
    margin-inline-start: auto;
    padding: 0 7px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 7px;
    background: var(--z-surface, #ffffff);
    box-sizing: border-box;
  }

  .sfi-price:focus-within {
    border-color: #2f6fed;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.14);
  }

  .sfi-price__input {
    flex: 1;
    width: 0;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--z-ink, #172033);
    font: inherit;
    font-size: 12.5px;
    font-weight: 800;
    text-align: end;
    font-variant-numeric: tabular-nums;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .sfi-price__input::-webkit-outer-spin-button,
  .sfi-price__input::-webkit-inner-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }

  .sfi-price__cur {
    flex-shrink: 0;
    margin-inline-start: 4px;
    padding-inline-start: 4px;
    border-inline-start: 1px solid var(--z-border-soft, #edf1f6);
    color: var(--z-muted, #718096);
    font-size: 10.5px;
    font-weight: 700;
  }

  .sfi-price__sub {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 2px;
    color: var(--z-subtle, #94a3b8);
    font-size: 10px;
    text-align: end;
  }

  .sfi-price__link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--z-link, #2f6fed);
    font: inherit;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  /* total */
  .sfi-total {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: flex-end;
    gap: 3px;
    max-width: 100%;
  }

  .sfi-total strong {
    overflow: hidden;
    color: var(--z-ink, #172033);
    font-family: Inter, sans-serif;
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
  }

  .sfi-total small {
    color: var(--z-muted, #718096);
    font-size: 10.5px;
    font-weight: 700;
  }

  .sfi-total__conv {
    display: block;
    width: 100%;
    overflow: hidden;
    color: var(--z-muted, #718096);
    font-size: 10px;
    font-style: normal;
    font-variant-numeric: tabular-nums;
    text-align: end;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* delete */
  .sfi-del {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-inline-start: auto;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: var(--z-danger-soft, #fee2e2);
    color: var(--z-danger, #b91c1c);
    cursor: pointer;
  }

  .sfi-del:hover {
    background: #fecaca;
  }

  .sfi-del .ms {
    font-size: 16px;
  }

  /* footer */
  .sfi-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px 14px;
    padding: 8px 14px;
    border-top: 1px solid var(--z-border-soft, #edf1f6);
    background: var(--z-surface-2, #f5f8fc);
    border-radius: 0 0 14px 14px;
  }

  .sfi-foot__stats {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-inline-end: auto;
    color: var(--z-muted, #718096);
    font-size: 11.5px;
  }

  .sfi-foot__stats b {
    color: var(--z-ink, #172033);
    font-size: 12.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sfi-foot__total {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    color: var(--z-muted, #718096);
    font-size: 11.5px;
  }

  .sfi-foot__total strong {
    color: var(--z-ink, #172033);
    font-family: Inter, sans-serif;
    font-size: 13px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .sfi-foot__total small {
    color: var(--z-muted, #718096);
    font-size: 10.5px;
    font-weight: 700;
  }

  .sfi-foot__clear {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--z-border, #dfe6ef);
    border-radius: 7px;
    background: var(--z-surface, #ffffff);
    color: var(--z-danger, #b91c1c);
    font: inherit;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .sfi-foot__clear:hover {
    background: var(--z-danger-soft, #fee2e2);
  }

  .sfi-foot__clear .ms {
    font-size: 15px;
  }

  /* empty state */
  .sfi-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 16px;
    text-align: center;
  }

  .sfi-empty__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 13px;
    background: var(--z-brand-soft, #edf4ff);
    color: var(--z-link, #2f6fed);
  }

  .sfi-empty__icon .ms {
    font-size: 23px;
  }

  .sfi-empty strong {
    color: var(--z-ink, #172033);
    font-size: 13px;
    font-weight: 700;
  }

  .sfi-empty small {
    color: var(--z-muted, #718096);
    font-size: 11.5px;
  }

  .sfi-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 767.98px) {
    .sfi-table {
      min-width: 720px;
    }

    .sfi-kbd,
    .sfi-divider,
    .sfi-new__label {
      display: none;
    }

    .sfi-new {
      justify-content: center;
      width: 26px;
      padding: 0;
    }
  }
</style>