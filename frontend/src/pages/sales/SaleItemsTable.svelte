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
    positionProductDropdown();
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
        items[existingIndex].unit_price;
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
  let productDropdownStyle = '';
  let isProductCellEditing = false;

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionProductDropdown() {
    if (!search_input) return;

    const anchor =
      search_input.closest('.purchase-item-search-cell') ||
      search_input;

    const rect = anchor.getBoundingClientRect();

    /*
     * Always open the product dropdown below the search field.
     * The available height is limited to the remaining viewport,
     * and the dropdown becomes internally scrollable when needed.
     */
    const availableHeight = Math.max(
      90,
      window.innerHeight - rect.bottom - 12,
    );

    const maxHeight = Math.min(
      250,
      availableHeight,
    );

    productDropdownStyle =
      `position:fixed;` +
      `left:${rect.left}px;` +
      `width:${rect.width}px;` +
      `top:${rect.bottom + 5}px;` +
      `bottom:auto;` +
      `max-height:${maxHeight}px;` +
      `overflow:auto;` +
      `z-index:100000;`;
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

  $: if (showProductDropdown) {
    tick().then(positionProductDropdown);
  }
</script>
<div class="card shadow-2 mt-4 purchase-items-card">
  <div class="card-body">
    <div class="d-flex align-items-center mb-3">
      <h5 class="mb-0 purchase-items-title">{t('Sale Items')}</h5>
    </div>

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="table-responsive sale-items-scroll-area">
      <table class="table table-hover align-middle purchase-items-table">
        <thead class="table-light">
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>
            {#if enable_batch}
              <th class="text-center purchase-item-col-expiry">{t('Expiry Date')}</th>
              <th class="text-center purchase-item-col-batch">{t('Batch')}</th>
            {/if}
            <th class="text-center purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="text-center purchase-item-col-price">{t('Sell Price')}</th>
            <th class="text-center purchase-item-col-subtotal">{t('Subtotal')}</th>
            <th class="text-center purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td class="purchase-item-product-cell">
                <div class="purchase-item-product">
                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">{item.product_name}</strong>
                    {#if item.type !== 'service'}
                      <small>
                        {t('Present in Warehouse')}:
                        {Number(getCalculatedStock(item) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
                      </small>
                    {/if}
                  </span>
                </div>
              </td>
              {#if enable_batch}
                <td class="text-center purchase-item-col-expiry">
                  <span class="purchase-item-readonly">{item.type === 'service' ? '-' : item.expiry_date || '-'}</span>
                </td>
                <td class="text-center purchase-item-col-batch">
                  {#if item.type === 'service'}
                    <span class="purchase-item-readonly">-</span>
                  {:else}
                    <select
                      class="purchase-item-batch-select"
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
              {/if}
              <td class="text-center purchase-item-col-quantity">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    data-sale-item-index={index}
                    data-sale-item-field="quantity"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)}
                    on:keydown={(event) =>
                      handleSaleItemEnter(
                        event,
                        index,
                        'price',
                      )} />
                  {#if item.availableUnits?.length > 1}
                    <FilterSelect compact value={item.product_unit_id}
                      label={t('Unit')} options={item.availableUnits.map((unit)=>({value:unit.id,label:unit.name}))}
                      on:change={(event)=>changeUnit(item,event.detail)} />
                  {:else}
                    <span class="input-group-text"
                      >{item.availableUnits?.[0]?.name || units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                  {/if}
                </div>
              </td>
              <td class="text-center purchase-item-col-price">
                <div class="input-group input-group-sm purchase-unified-input-group purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    data-sale-item-index={index}
                    data-sale-item-field="price"
                    bind:value={item.calculated_price}
                    on:input={() => recalc(index)}
                    on:keydown={(event) =>
                      handleSaleItemEnter(
                        event,
                        index,
                        'product',
                      )} />
                  <span class="input-group-text">{t(item.currency)}</span>
                </div>
                {#if enable_show_buy_price_and_latest_sale_price_in_item}
                  <div class="purchase-item-stock">
                    {#if enable_show_buy_price}
                      {t('Buy Price')}: {Number(item.buy_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(item.buy_price_currency)}
                    {/if}
                    {#if enable_show_latest_sale_price && item.latestPrice}
                      <br />
                      {t('Last Sold Price')}:
                      <button
                        type="button"
                        class="btn btn-link p-0 purchase-item-stock-link"
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
                        {t(item.latestPrice.currency)}
                      </button>
                    {/if}
                  </div>
                {/if}
              </td>
              <td class="text-center purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  {#if item.currency != currency?.code}
                    <strong>{exchangeRate(item.subtotal, item.currency, currency).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}</strong>
                    <small>{t(currency?.code)}</small>
                  {:else}
                    <strong>{Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>
                    <small>{t(item.currency)}</small>
                  {/if}
                </div>
              </td>
              <td class="text-center purchase-item-actions purchase-item-col-actions">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeItem(index)}><i class="bi bi-trash" aria-hidden="true"></i></button>
              </td>
            </tr>
          {/each}

          <!--
            Permanent blank row:
            click the Product TD, choose a product, this row becomes filled,
            and a new blank row remains below it.
          -->
          <tr class="purchase-item-search-row">
            <td
              class="purchase-item-product-cell purchase-item-search-cell"
              class:purchase-item-search-cell--editing={isProductCellEditing}
              role="button"
              tabindex="0"
              aria-label={t('Select Product')}
              on:click={() => {
                if (!isProductCellEditing) {
                  activateProductCellSearch();
                }
              }}
              on:keydown={(event) => {
                if (
                  !isProductCellEditing &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  activateProductCellSearch();
                }
              }}>
              {#if isProductCellEditing}
                <div class="purchase-item-inline-search">
                  <span class="purchase-item-search-icon" aria-hidden="true">
                    <i class="bi bi-search"></i>
                  </span>

                  <input
                    type="text"
                    id="form_product_search"
                    class="purchase-item-search-input"
                    bind:this={search_input}
                    bind:value={search}
                    on:click|stopPropagation
                    on:input={handleProductSearchInput}
                    on:focus={() => {
                      showProductDropdown = true;
                      refreshAvailableProducts();
                    }}
                    on:keydown={(event) => {
                      if (event.key === 'Enter') {
                        const match =
                          filteredProducts[0] ||
                          products.find((row) =>
                            productMatchesSearch(row, search),
                          );

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
                        if (isProductCellEditing && !selectingProduct) {
                          closeProductCellSearch();
                        }
                      }, 180)}
                    placeholder={t('Search product by name, barcode, or SKU...')}
                    autocomplete="off" />

                  {#if showProductDropdown && filteredProducts.length > 0}
                    <div
                      use:portal
                      class="list-group shadow purchase-items-dropdown"
                      style={productDropdownStyle}>
                      {#each filteredProducts as prod (prod.id)}
                        <button
                          type="button"
                          class="list-group-item list-group-item-action"
                          on:mousedown|preventDefault={() => selectAndAddProduct(prod)}>
                          <div class="sale-product-option">
                            <span class="sale-product-option__copy">
                              <strong>{prod.name}</strong>

                              <small>
                                {categories.find(
                                  (category) => category.id === prod.category_id,
                                )?.name || t('Category')}
                              </small>
                            </span>

                            {#if prod.type === 'service'}
                              <span class="sale-product-option__service">
                                <i class="bi bi-tools" aria-hidden="true"></i>
                                {t('Service')}
                              </span>
                            {:else}
                              <span
                                class="sale-product-option__stock"
                                title={t('Present in Warehouse')}>
                                <i class="bi bi-box-seam" aria-hidden="true"></i>

                                <strong dir="ltr">
                                  {Number(
                                    prod.warehouse_stock || 0,
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 3,
                                  })}
                                </strong>

                                <small>
                                  {units.find(
                                    (item) => item.id === prod.product_unit_id,
                                  )?.name || t('Unit')}
                                  {#if enable_batch && prod.batch_count > 1}
                                    / {prod.batch_count} {t('Batch')}
                                  {/if}
                                </small>
                              </span>
                            {/if}
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/if}

                  {#if
                    showProductDropdown &&
                    warehouse_id &&
                    search.trim() &&
                    filteredProducts.length === 0}
                    <div
                      use:portal
                      class="purchase-items-dropdown sale-product-empty"
                      style={productDropdownStyle}>
                      <span class="sale-product-empty__icon" aria-hidden="true">
                        <i class="bi bi-box-seam"></i>
                      </span>

                      <strong>{t('No products available')}</strong>

                      <small>
                        {enable_stock_minus
                          ? t('No products match your search.')
                          : t('No stock is available in the selected warehouse.')}
                      </small>
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="purchase-item-empty-product">
                  <button
                    type="button"
                    class="purchase-item-empty-product__icon"
                    title={t('New Product')}
                    aria-label={t('New Product')}
                    on:click|stopPropagation={openCreateProductModal}>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i>
                  </button>

                  <span class="purchase-item-empty-product__copy">
                    <strong>
                      {warehouse_id
                        ? t('Select Product')
                        : t('Select Warehouse')}
                    </strong>

                    {#if warehouse_id}
                      <small>{t('Product')}</small>
                    {/if}
                  </span>
                </div>
              {/if}
            </td>

            {#if enable_batch}
              <td class="text-center purchase-item-col-expiry"></td>
              <td class="text-center purchase-item-col-batch"></td>
            {/if}
            <td class="text-center purchase-item-col-quantity"></td>
            <td class="text-center purchase-item-col-price"></td>
            <td class="text-center purchase-item-col-subtotal"></td>
            <td class="text-center purchase-item-col-actions"></td>
          </tr>
        </tbody>
      </table>
    </div>

    {#if items.length > 0}
      <footer class="purchase-items-total-row">
        <button
          type="button"
          class="purchase-items-clear-btn"
          on:click={clearItems}>
          <i class="bi bi-trash3" aria-hidden="true"></i>
          <span>{t('Clear All')}</span>
        </button>

        <div class="purchase-items-grand-total">
          <span>{t('Total')}</span>

          <strong dir="ltr">
            {Number(total || 0).toLocaleString(undefined, {
              maximumFractionDigits: 3,
            })}
          </strong>

          <small>{t(currency?.code || currency || 'AFN')}</small>
        </div>
      </footer>
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

  /* Product dropdown */
  :global(.purchase-items-dropdown) {
    z-index: 1000 !important;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 20rem;
    padding: 0.3rem;
    border: 1px solid #dce4ef;
    border-radius: 0.75rem;
    background: #ffffff !important;
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16) !important;
  }

  :global(.purchase-items-dropdown .list-group-item) {
    min-height: 3rem;
    padding: 0.55rem 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 700;
    text-align: start;
  }

  :global(.purchase-items-dropdown .list-group-item:hover),
  :global(.purchase-items-dropdown .list-group-item:focus) {
    background: #f0f6ff;
    color: var(--sale-primary);
  }

  :global(.purchase-items-dropdown .list-group-item small) {
    color: #8491a4;
    font-size: 0.64rem;
    font-weight: 600;
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
    padding: 0.55rem 0.625rem;
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

  /* Product search results with available warehouse stock */
  :global(.purchase-items-dropdown .sale-product-option) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy) {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy strong) {
    overflow: hidden;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__copy small) {
    overflow: hidden;
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: baseline;
    gap: 0.25rem;
    min-height: 1.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid #cce9dc;
    border-radius: 0.45rem;
    background: #f2fbf7;
    color: #087a54;
    white-space: nowrap;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock i) {
    font-size: 0.68rem;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock strong) {
    color: #087a54;
    font-size: 0.7rem;
    font-weight: 850;
  }

  :global(.purchase-items-dropdown .sale-product-option__stock small) {
    color: #54806c !important;
    font-size: 0.57rem !important;
    font-weight: 700;
  }

  :global(.purchase-items-dropdown .sale-product-option__service) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.7rem;
    padding-inline: 0.5rem;
    border: 1px solid #d8e4f8;
    border-radius: 999px;
    background: #f3f7fe;
    color: #2f6fed;
    font-size: 0.6rem;
    font-weight: 750;
    white-space: nowrap;
  }

  :global(.sale-product-empty) {
    display: grid;
    min-height: 7.5rem;
    place-items: center;
    align-content: center;
    gap: 0.3rem;
    padding: 1rem;
    color: #8491a4;
    text-align: center;
  }

  :global(.sale-product-empty__icon) {
    display: inline-grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #f1f5f9;
    color: #94a3b8;
    font-size: 1rem;
  }

  :global(.sale-product-empty strong) {
    color: #526176;
    font-size: 0.75rem;
    font-weight: 800;
  }

  :global(.sale-product-empty small) {
    color: #8491a4;
    font-size: 0.63rem;
    font-weight: 600;
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

  :global(html.dark) .purchase-items-card :global(.card-body > .d-flex.align-items-center.mb-3) {
    border-color: var(--sale-border);
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .purchase-items-title {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-items-title::before {
    background: rgba(47, 111, 237, 0.16);
  }

  :global(html.dark) .purchase-item-search-row,
  :global(html.dark) .purchase-item-search-row > td,
  :global(html.dark) .purchase-item-search-cell,
  :global(html.dark) .purchase-items-total-row {
    border-color: var(--sale-border) !important;
    background: #0f1726 !important;
  }

  :global(html.dark) .purchase-item-search-row:hover,
  :global(html.dark) .purchase-item-search-row:hover .purchase-item-search-cell {
    background: #1a2638 !important;
  }

  :global(html.dark) .purchase-item-search-cell:focus-visible,
  :global(html.dark) .purchase-item-search-cell--editing {
    background: #172338 !important;
    box-shadow:
      inset 0 0 0 1px rgba(96, 165, 250, 0.28),
      1px 0 0 var(--sale-border);
  }

  :global(html.dark) .purchase-item-empty-product__icon {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark) .purchase-item-empty-product__copy strong {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-item-empty-product__copy small {
    color: var(--sale-muted);
  }

  :global(html.dark) .purchase-item-search-icon {
    color: #93c5fd;
  }

  :global(html.dark) .purchase-item-search-input {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-item-search-input::placeholder {
    color: #718198;
  }

  :global(html.dark) .purchase-unified-input-group,
  :global(html.dark) .purchase-items-table .purchase-item-cell-group {
    border-color: var(--sale-border);
    background: var(--erp-surface-soft, #172033);
  }

  :global(html.dark) .purchase-unified-input-group:hover {
    border-color: #42546d;
  }

  :global(html.dark) .purchase-unified-input-group :global(.form-control),
  :global(html.dark) .purchase-unified-input-group :global(.form-select),
  :global(html.dark) .purchase-items-table .purchase-item-cell-group :global(.form-control) {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-unified-input-group :global(.form-control::placeholder) {
    color: #718198;
  }

  :global(html.dark) .purchase-unified-input-group :global(.input-group-text),
  :global(html.dark) .purchase-items-table .purchase-item-cell-group :global(.input-group-text),
  :global(html.dark) .purchase-item-col-quantity :global(.filter-select__trigger) {
    border-color: var(--sale-border) !important;
    background: #202b3d !important;
    color: #a9b7ca !important;
  }

  :global(html.dark) .sale-product-search-icon {
    border-color: var(--sale-border) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: #a9b7ca !important;
  }

  :global(html.dark) .purchase-items-card :global(.table-responsive) {
    background: var(--erp-surface, #111827);
    scrollbar-color: #52647d transparent;
  }

  :global(html.dark) .purchase-items-card :global(.table-responsive::-webkit-scrollbar-thumb) {
    background: #52647d;
  }

  :global(html.dark) .purchase-items-table {
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-items-table :global(thead th),
  :global(html.dark) .purchase-items-table :global(thead .purchase-item-col-product) {
    border-color: var(--sale-border);
    background: #172033 !important;
    color: #a9b7ca;
    box-shadow: 1px 0 0 var(--sale-border);
  }

  :global(html.dark) .purchase-items-table :global(tbody tr) {
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .purchase-items-table :global(tbody tr:nth-child(even)) {
    background: #141d2c;
  }

  :global(html.dark) .purchase-items-table :global(tbody tr:hover) {
    background: #1a2638 !important;
  }

  :global(html.dark) .purchase-items-table :global(tbody td) {
    border-color: var(--sale-border);
    color: #c8d3e2;
  }

  :global(html.dark) .purchase-item-product-cell {
    background: var(--erp-surface, #111827) !important;
    box-shadow: 1px 0 0 var(--sale-border);
  }

  :global(html.dark) .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #141d2c !important;
  }

  :global(html.dark) .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #1a2638 !important;
  }

  :global(html.dark) .purchase-item-product-name,
  :global(html.dark) .purchase-item-money strong {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-item-product-copy small,
  :global(html.dark) .purchase-item-stock,
  :global(html.dark) .purchase-item-money small,
  :global(html.dark) .purchase-items-grand-total > span,
  :global(html.dark) .purchase-items-grand-total > small {
    color: var(--sale-muted);
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-danger) {
    border-color: #74333c !important;
    background: #321c25 !important;
    color: #ff8d98 !important;
  }

  :global(html.dark) .purchase-items-table :global(.btn-outline-danger:hover) {
    border-color: #9a4350 !important;
    background: #44222c !important;
    color: #ffabb3 !important;
  }

  :global(html.dark) .purchase-items-clear-btn {
    border-color: #74333c;
    background: var(--erp-surface, #111827);
    color: #ff8d98;
  }

  :global(html.dark) .purchase-items-clear-btn:hover {
    border-color: #9a4350;
    background: #321c25;
  }

  :global(html.dark) #form_product_search:disabled {
    background: #202b3d !important;
    color: #718198;
  }

  :global(html.dark) :global(.purchase-items-dropdown) {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827) !important;
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.4) !important;
  }

  :global(html.dark) :global(.purchase-items-dropdown .list-group-item) {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) :global(.purchase-items-dropdown .list-group-item:hover),
  :global(html.dark) :global(.purchase-items-dropdown .list-group-item:focus) {
    background: #1d2b40;
  }

  :global(html.dark) :global(.purchase-items-dropdown .list-group-item small),
  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__copy small) {
    color: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__copy strong) {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__stock) {
    border-color: #205b49;
    background: #12372d;
    color: #8bd5ba;
  }

  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__stock strong) {
    color: #8bd5ba;
  }

  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__stock small) {
    color: #73b99f !important;
  }

  :global(html.dark) :global(.purchase-items-dropdown .sale-product-option__service) {
    border-color: #2d4770;
    background: #16243a;
    color: #8bb7ff;
  }

  :global(html.dark) :global(.sale-product-empty__icon) {
    background: #202b3d;
    color: #94a3b8;
  }

  :global(html.dark) :global(.sale-product-empty strong) {
    color: var(--erp-text, #e5edf8);
  }

</style>

