<script>
  ;
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';
  import FilterSelect from '../../components/common/FilterSelect.svelte';

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { productApi } from '../../api/productApi.js';
import { warehouseProductApi } from '../../api/warehouseProductApi.js';
import { mergeById, lookupProducts } from '../../lib/formLookups.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let warehouse_id = '';
  export let items = [];
  export let currency = '';

  const dispatch = createEventDispatcher();

  let itemsTableRoot;
  let products = [];
  let filteredProducts = [];
  let search = '';
  let showDropdown = false;
  let isProductCellEditing = false;
  let searchInput;
  let productDropdownStyle = '';
  let activePurchaseItemField = null;
  let activeProductIndex = -1;

  function portal(node) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function positionProductDropdown() {
    if (!searchInput) return;

    const anchor =
      searchInput.closest('.purchase-item-search-cell') ||
      searchInput;

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

  $: if (showDropdown) tick().then(positionProductDropdown);

  let quantity = 1;
  let unit_price = 0;
  let unit_price_currency = '';
  let unit = 0;
  let sell_price = 0;
  let sell_price_currency = '';
  let selectedProduct = null;

  $: enable_duplicate_product =
    $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;
  $: enable_batch_setting = $settings_all.find((s) => s.key === 'enable_batch')?.value == 1;
  $: enable_batch = enable_batch_setting;
  $: enable_manufacturing_date = $settings_all.find((s) => s.key === 'enable_manufacturing_date')?.value == 1;
  $: enable_expiry_date = $settings_all.find((s) => s.key === 'enable_expiry_date')?.value == 1;

  $: enable_heaviness = $settings_all.find((s) => s.key === 'enable_heaviness')?.value == 1;

  $: enable_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'enable_product_benefit_percentage')?.value == 1;
  $: default_product_benefit_percentage =
    $settings_all.find((s) => s.key === 'default_product_benefit_percentage')?.value || 0;

  $: enable_purchase_items_discount = $settings_all.find((s) => s.key === 'enable_purchase_items_discount')?.value == 1;

  let barcodeInput = '';

  // Reference to the modal
  let productModal;

  let categories = [];
  let units = [];
  let unitMap = {};
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];

  $: unitMap = Object.fromEntries(units.map((u) => [u.id, u]));

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
    item.subtotal = Number(item.quantity) * Number(item.unit_price) * (selectedUnit.multiplier || 1);
    if (item.discount_type === 'percent') {
      item.subtotal = item.subtotal - (item.subtotal * Number(item.discount_amount || 0)) / 100;
    } else if (item.discount_type === 'fixed') {
      item.subtotal = item.subtotal - Number(item.discount_amount || 0);
    }
    items = [...items];
    dispatch('update', { items });
  }

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
  }

  $: if (warehouse_id && warehouse_id !== loadedWarehouseId) {
    loadedWarehouseId = warehouse_id;
    loadWarehouseStock(warehouse_id);
  }

  let productSearchTimer;
  async function searchProductsFromServer(term = '') {
    const rows = await lookupProducts({ search: term });
    products = mergeById(products, rows);
  }

  function handleProductSearchInput() {
    showDropdown = true;
    activeProductIndex = filteredProducts.length > 0 ? 0 : -1;
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

  function handleItemDateChange() {
    items = [...items];
    dispatch('update', { items });
  }

  async function handlePurchaseDateSelected(
    index,
    currentField,
  ) {
    activePurchaseItemField = {
      index,
      field: currentField,
    };

    /*
     * A real calendar-day selection has finished.
     * Wait for the current popup to close completely before the
     * next date input receives focus and opens its own popup.
     */
    await tick();

    setTimeout(() => {
      moveToNextPurchaseItemField(
        index,
        currentField,
      );
    }, 150);
  } 

  onMount(async () => {
    await loadAll();
  });

  onMount(() => {
    document.addEventListener(
      'keydown',
      handleActivePurchaseItemEnter,
      true,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        handleActivePurchaseItemEnter,
        true,
      );
    };
  });

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
        (product.product_status ? product.product_status === 'active' : true) &&
        Number(product.status) === 1 &&
        getProductGroupKey(product) === groupKey,
    );
  }

  function getProductBatchOptions(productOrItem) {
    return getProductGroupProducts(productOrItem)
      .map((product) => ({
        id: `product-${product.id}`,
        product_id: product.id,
        product_name: product.name,
        product_unit_id: product.product_unit_id,
        batch: product.batch || product.batch_number || '',
        manufacturing_date: product.manufacturing_date || null,
        expiry_date: product.expiry_date || null,
        quantity: Number(product.quantity || 0),
        buy_price: Number(product.buy_price || 0),
        buy_currency: product.buy_currency || '',
        sell_price: Number(product.sell_price || 0),
        sell_currency: product.sell_currency || '',
      }))
      .filter((option) => String(option.batch || '').trim());
  }

  function applyBatchOptionToItem(item, option) {
    if (!item || !option) return;

    item.product_id = option.product_id || item.product_id;
    item.product_name = option.product_name || item.product_name;
    item.product_unit_id = option.product_unit_id || item.product_unit_id;
    item.availableUnits = getUnitHierarchy(item.product_unit_id);
    item.batch_option_id = option.id;
    item.batch = option.batch || '';
    item.manufacturing_date = option.manufacturing_date || null;
    item.expiry_date = option.expiry_date || null;
    item.stock = Number(option.quantity || 0);
    item.unit_price = option.buy_price || item.unit_price;
    item.unit_price_currency = option.buy_currency || item.unit_price_currency;
    item.sell_price = option.sell_price || item.sell_price;
    item.sell_price_currency = option.sell_currency || item.sell_price_currency;
  }

  function handlePurchaseBatchInput(item, index, value) {
    const normalizedValue = String(value || '').trim();
    const options = item.batch_options || [];
    const selectedOption = options.find(
      (option) => String(option.batch || '').trim() === normalizedValue,
    );

    if (selectedOption) {
      applyBatchOptionToItem(item, selectedOption);
    } else {
      item.batch_option_id = null;
      item.batch = value;
    }

    recalc(index);
    items = [...items];
    dispatch('update', { items });
  }

  function handlePurchaseBatchSelect(item, index, value) {
    item.batch_options = getProductBatchOptions(item);

    if (value === '__new_batch__') {
      item.batch_option_id = null;
      item.is_new_batch = true;
      item.batch = '';
      recalc(index);
      items = [...items];
      dispatch('update', { items });

      tick().then(() => {
        const input = itemsTableRoot?.querySelector(
          `[data-purchase-item-index="${index}"][data-purchase-item-field="batch_new"]`,
        );
        input?.focus();
      });
      return;
    }

    const selectedOption = item.batch_options.find(
      (option) => option.id === value,
    );

    if (selectedOption) {
      item.is_new_batch = false;
      applyBatchOptionToItem(item, selectedOption);
    }

    recalc(index);
    items = [...items];
    dispatch('update', { items });
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
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

  $: {
    const groupedProducts = new Map();

    products
      .filter((product) => productMatchesSearch(product, search))
      .forEach((product) => {
        const groupKey = getProductGroupKey(product);
        const existing = groupedProducts.get(groupKey);
        const stockQuantity = Number(product.quantity || 0);

        if (!existing) {
          groupedProducts.set(groupKey, {
            ...product,
            product_group_key: groupKey,
            product_group_ids: [product.id],
            batch_count: product.type === 'service' ? 0 : 1,
            quantity: stockQuantity,
          });
          return;
        }

        existing.product_group_ids.push(product.id);
        existing.batch_count += product.type === 'service' ? 0 : 1;
        existing.quantity = Number(existing.quantity || 0) + stockQuantity;
      });

    filteredProducts = Array.from(
      groupedProducts.values(),
    ).slice(0, 10);

    if (!filteredProducts.length) {
      activeProductIndex = -1;
    } else if (
      activeProductIndex < 0 ||
      activeProductIndex >= filteredProducts.length
    ) {
      activeProductIndex = 0;
    }
  }

  function getActiveProduct() {
    if (!filteredProducts.length) {
      return null;
    }

    const safeIndex =
      activeProductIndex >= 0 &&
      activeProductIndex < filteredProducts.length
        ? activeProductIndex
        : 0;

    return filteredProducts[safeIndex] || null;
  }

  function moveActiveProduct(direction) {
    if (!filteredProducts.length) {
      activeProductIndex = -1;
      return;
    }

    const currentIndex =
      activeProductIndex >= 0
        ? activeProductIndex
        : 0;

    activeProductIndex =
      (currentIndex +
        direction +
        filteredProducts.length) %
      filteredProducts.length;

    tick().then(() => {
      const activeOption =
        document.querySelector(
          '.purchase-items-dropdown .list-group-item.is-active',
        );

      activeOption?.scrollIntoView({
        block: 'nearest',
      });
    });
  }

  async function handleProductSearchKeydown(
    event,
  ) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      showDropdown = true;
      moveActiveProduct(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      showDropdown = true;
      moveActiveProduct(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();

      const product =
        getActiveProduct() ||
        products.find((row) => productMatchesSearch(row, search));

      if (product) {
        await selectAndAddPurchaseProduct(
          product,
        );
      }

      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();

      closeProductCellSearch();
    }
  }

  function selectProduct(product) {
    const unitHierarchy = getUnitHierarchy(
      product.product_unit_id,
    );

    selectedProduct = {
      ...product,
      availableUnits: unitHierarchy,
      product_group_key:
        product.product_group_key ||
        getProductGroupKey(product),
      product_group_ids:
        product.product_group_ids || [product.id],
      batch_options: getProductBatchOptions(product),
    };

    search = product.name;
    unit_price = Number(product.buy_price) || 0;
    unit_price_currency =
      product.buy_currency || '';
    sell_price = Number(product.sell_price) || 0;
    sell_price_currency =
      product.sell_currency || '';
    unit = product.product_unit_id;
    showDropdown = false;

    return true;
  }

  async function activateProductCellSearch() {
    isProductCellEditing = true;
    search = '';
    selectedProduct = null;
    showDropdown = true;
    if (!products.length) {
      await searchProductsFromServer('');
    }
    activeProductIndex =
      filteredProducts.length > 0
        ? 0
        : -1;

    await tick();

    searchInput?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
    });

    searchInput?.focus();
    positionProductDropdown();
  }

  function closeProductCellSearch() {
    showDropdown = false;
    isProductCellEditing = false;
    search = '';
    selectedProduct = null;
    activeProductIndex = -1;
  }

  function getPurchaseItemFieldOrder(item) {
    const fields = [];

    /*
     * Date-first keyboard order.
     *
     * After a Product is selected, focus moves through:
     * Manufacturing Date -> Expiry Date -> Batch -> remaining inputs.
     */
    if (enable_manufacturing_date) {
      fields.push('manufacturing_date');
    }

    if (enable_expiry_date) {
      fields.push('expiry_date');
    }

    if (enable_batch) {
      fields.push('batch');
    }

    if (enable_heaviness) {
      fields.push(
        'preUnitPrice',
        'preUnitQuantity',
        'heaviness',
      );
    } else {
      fields.push(
        'quantity',
        'unit_price',
      );
    }

    if (
      enable_product_benefit_percentage &&
      item?.enablePercent
    ) {
      fields.push('benefit_percent');
    } else {
      fields.push('sell_price');
    }

    if (enable_purchase_items_discount) {
      fields.push('discount');
    }

    return fields;
  }

  function getPurchaseFieldElement(
    index,
    field,
  ) {
    const holder =
      itemsTableRoot?.querySelector(
        `[data-purchase-item-index="${index}"][data-purchase-item-field="${field}"]`,
      );

    if (!holder) return null;

    /*
     * DatePicker contains internal buttons before its text input.
     * Always focus the visible .pdp-input for date fields.
     */
    if (
      field === 'manufacturing_date' ||
      field === 'expiry_date'
    ) {
      return holder.querySelector(
        'input.pdp-input:not(:disabled), input:not(:disabled)',
      );
    }

    if (
      holder.matches?.(
        'input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
    ) {
      return holder;
    }

    return holder.querySelector(
      'input:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
  }

  function waitForNextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  }

  async function focusPurchaseItemField(
    index,
    field,
  ) {
    await tick();

    /*
     * AppDatePicker may create its visible input one or two frames
     * after the purchase row is added. Retry instead of failing once.
     */
    for (
      let attempt = 0;
      attempt < 10;
      attempt += 1
    ) {
      await waitForNextFrame();

      const element =
        getPurchaseFieldElement(
          index,
          field,
        );

      if (!element) {
        await new Promise((resolve) =>
          setTimeout(resolve, 15),
        );
        continue;
      }

      element.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });

      element.focus({
        preventScroll: true,
      });

      if (
        element instanceof HTMLInputElement &&
        typeof element.select === 'function'
      ) {
        element.select();
      }

      activePurchaseItemField = {
        index,
        field,
      };

      return true;
    }

    return false;
  }

  async function focusFirstPurchaseItemField(
    index,
  ) {
    const item = items[index];
    const firstField =
      getPurchaseItemFieldOrder(item)[0];

    if (!firstField) {
      await activateProductCellSearch();
      return;
    }

    await focusPurchaseItemField(
      index,
      firstField,
    );
  }

  async function moveToNextPurchaseItemField(
    index,
    currentField,
  ) {
    recalc(index);

    const fieldOrder =
      getPurchaseItemFieldOrder(
        items[index],
      );

    const currentIndex =
      fieldOrder.indexOf(
        currentField,
      );

    const nextField =
      fieldOrder[currentIndex + 1];

    if (nextField) {
      await focusPurchaseItemField(
        index,
        nextField,
      );
      return;
    }

    await activateProductCellSearch();
  }

  async function handlePurchaseItemEnter(
    event,
    index,
    currentField,
  ) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();

    await moveToNextPurchaseItemField(
      index,
      currentField,
    );
  }

  async function handlePurchaseDateInputEnter(
    event,
    index,
    currentField,
  ) {
    if (event.key !== 'Enter') return;

    event.preventDefault();
    event.stopPropagation();

    if (
      typeof event.stopImmediatePropagation ===
      'function'
    ) {
      event.stopImmediatePropagation();
    }

    activePurchaseItemField = {
      index,
      field: currentField,
    };

    /*
     * The DatePicker can place focus on one of its internal controls.
     * Blur whichever element is active, then focus the next field.
     */
    const activeElement =
      document.activeElement;

    if (
      activeElement instanceof
      HTMLElement
    ) {
      activeElement.blur();
    }

    await tick();

    await moveToNextPurchaseItemField(
      index,
      currentField,
    );
  }

  function handlePurchaseItemRowEnter(event, index) {
    if (event.key !== 'Enter') return;

    const target = event.target;

    if (!(target instanceof Element)) return;

    const fieldHolder = target.closest(
      '[data-purchase-item-field]',
    );

    if (!fieldHolder || !event.currentTarget.contains(fieldHolder)) {
      return;
    }

    const currentField = fieldHolder.dataset.purchaseItemField;

    /*
     * Date fields have their own capture handler.
     * The row-level handler is only for Batch.
     */
    if (currentField !== 'batch') {
      return;
    }

    handlePurchaseItemEnter(
      event,
      index,
      currentField,
    );
  }

  function rememberPurchaseItemField(event, index) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const fieldHolder = target.closest(
      '[data-purchase-item-field]',
    );

    if (!fieldHolder || !event.currentTarget.contains(fieldHolder)) {
      return;
    }

    activePurchaseItemField = {
      index,
      field: fieldHolder.dataset.purchaseItemField,
    };
  }

  function handleActivePurchaseItemEnter(event) {
    if (event.key !== 'Enter' || !activePurchaseItemField) return;

    const target = event.target;

    if (!(target instanceof Element)) return;

    const isPurchaseTableEvent =
      itemsTableRoot?.contains(target) ||
      Boolean(target.closest('.pdp, .pdp-container, .pdp-calendar'));

    if (!isPurchaseTableEvent) return;

    const { index, field } = activePurchaseItemField;

    /*
     * Date fields handle Enter directly.
     * This global listener is only for Batch.
     */
    if (field !== 'batch') {
      return;
    }

    handlePurchaseItemEnter(
      event,
      index,
      field,
    );
  }

  function addItem() {
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

      const newItem = {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_group_key: selectedProduct.product_group_key,
        product_group_ids: selectedProduct.product_group_ids,
        product_unit_id:
          unit ||
          selectedProduct.product_unit_id,
        quantity: Number(quantity),
        stock:
          Number(selectedProduct.quantity) || 0,
        unit_price: Number(unit_price),
        unit_price_currency,
        sell_price: Number(sell_price),
        sell_price_currency,
        total_amount:
          Number(quantity) *
          Number(unit_price),
        discount_type: 'percent',
        discount_amount: 0,
        heaviness: 1,
        enablePercent:
          enable_product_benefit_percentage,
        benefit_percent:
          default_product_benefit_percentage,
        manufacturing_date: enable_batch
          ? selectedProduct.manufacturing_date ||
            null
          : null,
        expiry_date: enable_batch
          ? selectedProduct.expiry_date ||
            null
          : null,
        batch: enable_batch
          ? selectedProduct.batch || null
          : null,
        batch_options:
          selectedProduct.batch_options || [],
        batch_option_id: null,
        preUnitQuantity: 1,
        preUnitPrice: 0,
        subtotal:
          Number(quantity) *
          Number(unit_price),
        availableUnits:
          selectedProduct.availableUnits,
      };

      if (enable_batch && newItem.batch_options.length > 0) {
        applyBatchOptionToItem(newItem, newItem.batch_options[0]);
      }

      items.push(newItem);
    }

    items = [...items];
    dispatch('update', { items });

    search = '';
    selectedProduct = null;
    quantity = 1;
    unit_price = 0;
    unit_price_currency = '';
    sell_price = 0;
    sell_price_currency = '';
    unit = 0;

    setTimeout(() => {
      if (window.mdb) {
        document
          .querySelectorAll(
            '[data-mdb-input-init]',
          )
          .forEach((element) => {
            new window.mdb.Input(element);
          });

        document
          .querySelectorAll(
            '.dropdown-toggle',
          )
          .forEach((element) => {
            new window.mdb.Dropdown(element);
          });
      }
    }, 50);

    return affectedRowIndex;
  }

  let selectingProduct = false;

  async function selectAndAddPurchaseProduct(
    product,
  ) {
    selectingProduct = true;

    try {
      if (!selectProduct(product)) return;

      const affectedRowIndex = addItem();

      showDropdown = false;
      isProductCellEditing = false;

      if (affectedRowIndex < 0) return;

      await tick();
      await waitForNextFrame();

      await focusFirstPurchaseItemField(
        affectedRowIndex,
      );
    } finally {
      selectingProduct = false;
    }
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

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = fromCurrency.exchangeRate || 1;
    const toRate = toCurrency.exchangeRate || 1;
    return (amount / toRate) * fromRate;
  }
  function recalc(index) {
    if (enable_heaviness) {
      items[index].quantity = (items[index].preUnitQuantity / items[index].heaviness) * 1000;
      items[index].unit_price = items[index].preUnitPrice / (items[index].quantity / items[index].preUnitQuantity);
      items[index].unit_price = exchangeRate(items[index].unit_price, 'USD', currency);
    }
    items[index].subtotal = Number(items[index].quantity) * Number(items[index].unit_price);
    items[index].total_amount = Number(items[index].quantity) * Number(items[index].unit_price);
    if (items[index].discount_type === 'percent') {
      items[index].subtotal = items[index].subtotal - (items[index].subtotal * items[index].discount_amount) / 100;
    } else if (items[index].discount_type === 'fixed') {
      items[index].subtotal = items[index].subtotal - Number(items[index].discount_amount);
    }
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
    const matches = await lookupProducts({ search: String(code || '') });
    const product = matches.find((p) => String(p.code) === String(code)) || matches[0];
    if (!product) return;

    await selectAndAddPurchaseProduct(
      product,
    );
  }

  $: total = items.reduce((s, i) => {
    if (i.unit_price_currency && currency && i.unit_price_currency !== currency) {
      let exchangeRateValue = exchangeRate(i.subtotal, i.unit_price_currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.unit_price_currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);
</script>

<div class="card purchase-items-card" bind:this={itemsTableRoot}>
  <div class="card-body">
    <header class="purchase-items-header">
      <div class="purchase-items-heading">
        <span class="purchase-items-heading__icon" aria-hidden="true">
          <i class="bi bi-cart-plus"></i>
        </span>

        <div class="purchase-items-heading__copy">
          <h5 class="purchase-items-title">{t('Purchase Items')}</h5>
        </div>
      </div>

      <div class="purchase-items-header__summary">
      

      
      </div>
    </header>

    <input
      type="text"
      class="purchase-barcode-input"
      bind:value={barcodeInput}
      on:keydown={handleBarcode}
      aria-hidden="true"
      tabindex="-1" />

    <div class="purchase-items-table-scroll">
      <table class="purchase-items-table">
        <thead>
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>

            {#if enable_manufacturing_date}
              <th class="purchase-item-col-date">{t('Manufacturing Date')}</th>
            {/if}

            {#if enable_expiry_date}
              <th class="purchase-item-col-date">{t('Expiry Date')}</th>
            {/if}

            {#if enable_batch}
              <th class="purchase-item-col-batch">{t('Batch No')}</th>
            {/if}

            {#if enable_heaviness}
              <th class="purchase-item-col-heaviness">{t('Heaviness')}</th>
            {/if}

            <th class="purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="purchase-item-col-price">{t('Buy Price')}</th>
            <th class="purchase-item-col-sell-price">{t('Sell Price')}</th>

            {#if enable_purchase_items_discount}
              <th class="purchase-item-col-discount">{t('Discount')}</th>
            {/if}

            <th class="purchase-item-col-subtotal">{t('Subtotal')}</th>
            <th class="purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>

        <tbody>
          {#each items as item, index (item.id || `${item.product_id}-${index}`)}
            <tr
              on:click|capture={(event) => rememberPurchaseItemField(event, index)}
              on:focusin|capture={(event) => rememberPurchaseItemField(event, index)}
              on:keydown|capture={(event) => handlePurchaseItemRowEnter(event, index)}>
              <td class="purchase-item-product-cell">
                <div class="purchase-item-product">
                  <span class="purchase-item-number">{index + 1}</span>

                  <span class="purchase-item-product-icon" aria-hidden="true">
                    <i class="bi bi-box-seam"></i>
                  </span>

                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">
                      {item.product_name}
                    </strong>

                    <small>
                      {t('Stock')}:
                      <span dir="ltr">
                        {Number(item.stock || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                      </span>
                      {units.find((u) => u.id === item.product_unit_id)?.name ||
                        t('Unit')}
                    </small>
                  </span>
                </div>
              </td>

              {#if enable_manufacturing_date}
                <td class="purchase-item-col-date">
                  <div
                    class="purchase-item-datepicker"
                    data-purchase-item-index={index}
                    data-purchase-item-field="manufacturing_date"
                    on:keydown|capture={(event) =>
                      handlePurchaseDateInputEnter(
                        event,
                        index,
                        'manufacturing_date',
                      )}>
                    <AppDatePicker
                      bind:value={item.manufacturing_date}
                      calendarLocale="fa,en"
                      defaultCalendar="gregorian"
                      inputCalendar="auto"
                      format="YYYY-MM-DD"
                      on:change={handleItemDateChange}
                      on:select={() =>
                        handlePurchaseDateSelected(
                          index,
                          'manufacturing_date',
                        )}
                    />
                  </div>
                </td>
              {/if}

              {#if enable_expiry_date}
                <td class="purchase-item-col-date">
                  <div
                    class="purchase-item-datepicker"
                    data-purchase-item-index={index}
                    data-purchase-item-field="expiry_date"
                    on:keydown|capture={(event) =>
                      handlePurchaseDateInputEnter(
                        event,
                        index,
                        'expiry_date',
                      )}>
                    <AppDatePicker
                      bind:value={item.expiry_date}
                      calendarLocale="fa,en"
                      defaultCalendar="gregorian"
                      inputCalendar="auto"
                      format="YYYY-MM-DD"
                      on:change={handleItemDateChange}
                      on:select={() =>
                        handlePurchaseDateSelected(
                          index,
                          'expiry_date',
                        )}
                    />
                  </div>
                </td>
              {/if}

              {#if enable_batch}
                <td class="purchase-item-col-batch">
                  <div class="purchase-item-field purchase-item-batch-field">
                    {#if item.is_new_batch}
                      <input
                        type="text"
                        list={`purchase-batch-options-${index}`}
                        data-purchase-item-index={index}
                        data-purchase-item-field="batch"
                        bind:value={item.batch}
                        placeholder={t('Batch No')}
                        aria-label={t('Batch No')}
                        on:focus={() => {
                          item.batch_options = getProductBatchOptions(item);
                          items = [...items];
                        }}
                        on:input={(event) =>
                          handlePurchaseBatchInput(
                            item,
                            index,
                            event.currentTarget.value,
                          )}
                        on:keydown={(event) =>
                          handlePurchaseItemEnter(
                            event,
                            index,
                            'batch',
                          )} />
                      <datalist id={`purchase-batch-options-${index}`}>
                        {#each item.batch_options || [] as option}
                          <option value={option.batch}>
                            {option.expiry_date || '-'} / {Number(option.quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                          </option>
                        {/each}
                      </datalist>
                    {:else}
                      <select
                        data-purchase-item-index={index}
                        data-purchase-item-field="batch"
                        value={item.batch_option_id}
                        aria-label={t('Batch No')}
                        on:focus={() => {
                          item.batch_options = getProductBatchOptions(item);
                          items = [...items];
                        }}
                        on:change={(event) =>
                          handlePurchaseBatchSelect(
                            item,
                            index,
                            event.currentTarget.value,
                          )}
                        on:keydown={(event) =>
                          handlePurchaseItemEnter(
                            event,
                            index,
                            'batch',
                          )}>
                        {#if !(item.batch_options || []).length}
                          <option value="">{t('No Batch')}</option>
                        {/if}
                        {#each item.batch_options || [] as option}
                          <option value={option.id}>
                            {option.batch} / {option.expiry_date || '-'}
                          </option>
                        {/each}
                        <option value="__new_batch__">{t('New Batch')}</option>
                      </select>
                    {/if}
                  </div>
                </td>
              {/if}

              {#if enable_heaviness}
                <td class="purchase-item-col-heaviness">
                  <div class="purchase-item-heaviness">
                    <label>
                      <span>{t('USD')} {t('Price')}</span>
                      <input
                        type="number"
                        step="any"
                        data-purchase-item-index={index}
                        data-purchase-item-field="preUnitPrice"
                        bind:value={item.preUnitPrice}
                        on:input={() => recalc(index)}
                        on:keydown={(event) =>
                          handlePurchaseItemEnter(
                            event,
                            index,
                            'preUnitPrice',
                          )} />
                    </label>

                    <label>
                      <span>{t('ton')}</span>
                      <input
                        type="number"
                        step="any"
                        data-purchase-item-index={index}
                        data-purchase-item-field="preUnitQuantity"
                        bind:value={item.preUnitQuantity}
                        on:input={() => recalc(index)}
                        on:keydown={(event) =>
                          handlePurchaseItemEnter(
                            event,
                            index,
                            'preUnitQuantity',
                          )} />
                    </label>

                    <label>
                      <span>{t('Heaviness')}</span>
                      <input
                        type="number"
                        step="any"
                        data-purchase-item-index={index}
                        data-purchase-item-field="heaviness"
                        bind:value={item.heaviness}
                        on:input={() => recalc(index)}
                        on:keydown={(event) =>
                          handlePurchaseItemEnter(
                            event,
                            index,
                            'heaviness',
                          )} />
                    </label>
                  </div>
                </td>
              {/if}

              <td class="purchase-item-col-quantity">
                <div class="purchase-item-field purchase-item-field--with-suffix purchase-item-quantity-field">
                  {#if enable_heaviness}
                    <span class="purchase-item-readonly-value" dir="ltr">
                      {Number(item.quantity || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      data-purchase-item-index={index}
                      data-purchase-item-field="quantity"
                      bind:value={item.quantity}
                      on:input={() => recalc(index)}
                      on:keydown={(event) =>
                        handlePurchaseItemEnter(
                          event,
                          index,
                          'quantity',
                        )}
                      aria-label={t('Quantity')} />
                  {/if}

                  {#if item.availableUnits?.length > 1}
                    <FilterSelect
                      compact
                      value={item.product_unit_id}
                      label={t('Unit')}
                      options={item.availableUnits.map((u) => ({ value: u.id, label: u.name }))}
                      on:change={(event) => changeUnit(item, event.detail)} />
                  {:else}
                    <span class="purchase-item-suffix">
                      {units.find((u) => u.id === item.product_unit_id)?.name ||
                        t('Unit')}
                    </span>
                  {/if}
                </div>
              </td>

              <td class="purchase-item-col-price">
                <div class="purchase-item-field purchase-item-field--with-suffix">
                  {#if enable_heaviness}
                    <span class="purchase-item-readonly-value" dir="ltr">
                      {Number(item.unit_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                  {:else}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      data-purchase-item-index={index}
                      data-purchase-item-field="unit_price"
                      bind:value={item.unit_price}
                      on:input={() => {
                        if (item.enablePercent) {
                          item.sell_price = Number(
                            Number(item.unit_price || 0) +
                              (Number(item.unit_price || 0) *
                                Number(item.benefit_percent || 0)) /
                                100,
                          ).toFixed(2);
                        }

                        recalc(index);
                      }}
                      on:keydown={(event) =>
                        handlePurchaseItemEnter(
                          event,
                          index,
                          'unit_price',
                        )}
                      aria-label={t('Buy Price')} />
                  {/if}

                  <span class="purchase-item-suffix">
                    {t(item.unit_price_currency || currency)}
                  </span>
                </div>
              </td>

              <td class="purchase-item-col-sell-price">
                <div class="purchase-item-field purchase-item-sell-field">
                  {#if enable_product_benefit_percentage}
                    <button
                      type="button"
                      class="purchase-item-toggle"
                      class:is-active={item.enablePercent}
                      title={t('Percent')}
                      aria-label={t('Percent')}
                      on:click={() => {
                        item.enablePercent = !item.enablePercent;

                        if (!item.enablePercent) {
                          if (
                            Number(item.unit_price || 0) &&
                            Number(item.sell_price || 0) < Number(item.unit_price || 0)
                          ) {
                            item.sell_price = item.unit_price;
                          }

                          item.sell_price_currency = item.unit_price_currency;
                        }

                        recalc(index);
                      }}>
                      <i class="bi bi-percent" aria-hidden="true"></i>
                    </button>
                  {/if}

                  {#if item.enablePercent}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      class="purchase-item-percent-input"
                      id="percentage_markup_{index}"
                      data-purchase-item-index={index}
                      data-purchase-item-field="benefit_percent"
                      bind:value={item.benefit_percent}
                      on:input={() => {
                        item.sell_price = Number(
                          Number(item.unit_price || 0) +
                            (Number(item.unit_price || 0) *
                              Number(item.benefit_percent || 0)) /
                              100,
                        ).toFixed(2);

                        recalc(index);
                      }}
                      on:keydown={(event) =>
                        handlePurchaseItemEnter(
                          event,
                          index,
                          'benefit_percent',
                        )}
                      aria-label={t('Percent')} />
                  {/if}

                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={item.enablePercent}
                    data-purchase-item-index={index}
                    data-purchase-item-field="sell_price"
                    bind:value={item.sell_price}
                    on:input={() => recalc(index)}
                    on:keydown={(event) =>
                      handlePurchaseItemEnter(
                        event,
                        index,
                        'sell_price',
                      )}
                    aria-label={t('Sell Price')} />

                  <span class="purchase-item-suffix">
                    {t(item.sell_price_currency || currency)}
                  </span>
                </div>
              </td>

              {#if enable_purchase_items_discount}
                <td class="purchase-item-col-discount">
                  <div class="purchase-item-field purchase-item-discount-field">
                    <button
                      type="button"
                      class="purchase-item-toggle"
                      class:is-active={item.discount_type === 'percent'}
                      title={t('Discount')}
                      aria-label={t('Discount')}
                      on:click={() => {
                        if (item.discount_type === 'percent') {
                          item.discount_amount = Number(
                            Number(item.total_amount || 0) *
                              (Number(item.discount_amount || 0) / 100),
                          ).toFixed(2);
                          item.discount_type = 'fixed';
                        } else {
                          item.discount_amount =
                            Number(item.total_amount || 0) > 0
                              ? Number(
                                  (Number(item.discount_amount || 0) /
                                    Number(item.total_amount || 0)) *
                                    100,
                                ).toFixed(2)
                              : 0;
                          item.discount_type = 'percent';
                        }

                        recalc(index);
                      }}>
                      <i
                        class="bi bi-{item.discount_type === 'fixed'
                          ? 'cash-stack'
                          : 'percent'}"
                        aria-hidden="true"></i>
                    </button>

                    <input
                      type="number"
                      min="0"
                      step="any"
                      id="discountAmount_{index}"
                      data-purchase-item-index={index}
                      data-purchase-item-field="discount"
                      bind:value={item.discount_amount}
                      on:input={() => {
                        if (item.discount_amount === '') {
                          item.discount_amount = null;
                        } else if (Number(item.discount_amount) < 0) {
                          item.discount_amount = 0;
                        } else if (
                          item.discount_type !== 'percent' &&
                          Number(item.discount_amount) > Number(item.total_amount || 0)
                        ) {
                          item.discount_amount = Number(item.total_amount || 0);
                        } else if (
                          item.discount_type === 'percent' &&
                          Number(item.discount_amount) > 100
                        ) {
                          item.discount_amount = 100;
                        } else {
                          item.discount_amount = Number(item.discount_amount);
                        }

                        recalc(index);
                      }}
                      on:keydown={(event) =>
                        handlePurchaseItemEnter(
                          event,
                          index,
                          'discount',
                        )}
                      aria-label={t('Discount')} />

                    <span class="purchase-item-suffix purchase-item-discount-suffix">
                      {#if item.discount_type === 'percent'}
                        {Number(
                          (Number(item.total_amount || 0) *
                            Number(item.discount_amount || 0)) /
                            100,
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      {/if}
                      {t(item.unit_price_currency || currency)}
                    </span>
                  </div>
                </td>
              {/if}

              <td class="purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  <strong dir="ltr">
                    {#if
                      item.unit_price_currency &&
                      currency &&
                      item.unit_price_currency !== currency}
                      {Number(
                        exchangeRate(item.subtotal, item.unit_price_currency, currency),
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    {:else}
                      {Number(item.subtotal || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    {/if}
                  </strong>

                  <small>
                    {t(
                      item.unit_price_currency &&
                        currency &&
                        item.unit_price_currency !== currency
                        ? currency
                        : item.unit_price_currency || currency,
                    )}
                  </small>
                </div>
              </td>

              <td class="purchase-item-actions purchase-item-col-actions">
                <button
                  type="button"
                  class="purchase-item-delete"
                  title={t('Delete')}
                  aria-label={t('Delete')}
                  on:click={() => removeItem(index)}>
                  <i class="bi bi-trash3" aria-hidden="true"></i>
                </button>
              </td>
            </tr>
          {/each}

          <!--
            Permanent blank row:
            selecting a product turns it into a normal purchase row,
            then another blank searchable row remains below it.
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
                  (event.key === 'Enter' ||
                    event.key === ' ')
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
                    id="purchase-product-search"
                    class="purchase-item-search-input"
                    bind:this={searchInput}
                    type="text"
                    bind:value={search}
                    autocomplete="off"
                    placeholder={t('Search product by name, barcode, or SKU...')}
                    on:click|stopPropagation
                    on:input={handleProductSearchInput}
                    on:focus={() => {
                      showDropdown = true;

                      if (
                        filteredProducts.length > 0 &&
                        activeProductIndex < 0
                      ) {
                        activeProductIndex = 0;
                      }
                    }}
                    on:keydown={handleProductSearchKeydown}
                    on:blur={() =>
                      setTimeout(() => {
                        if (isProductCellEditing && !selectingProduct) {
                          closeProductCellSearch();
                        }
                      }, 180)} />

                  {#if
                    showDropdown &&
                    filteredProducts.length > 0}
                    <div
                      use:portal
                      class="list-group shadow purchase-items-dropdown"
                      style={productDropdownStyle}>
                      {#each filteredProducts as product, productIndex (product.id)}
                        <button
                          type="button"
                          class="list-group-item list-group-item-action"
                          class:is-active={productIndex === activeProductIndex}
                          aria-selected={productIndex === activeProductIndex}
                          on:mouseenter={() => {
                            activeProductIndex =
                              productIndex;
                          }}
                          on:mousemove={() => {
                            if (
                              activeProductIndex !==
                              productIndex
                            ) {
                              activeProductIndex =
                                productIndex;
                            }
                          }}
                          on:mousedown|preventDefault={() =>
                            selectAndAddPurchaseProduct(
                              product,
                            )}>
                          <div class="sale-product-option">
                            <span class="sale-product-option__copy">
                              <strong>{product.name}</strong>

                              <small>
                                {categories.find(
                                  (category) =>
                                    category.id ===
                                    product.category_id,
                                )?.name || t('Category')}
                              </small>
                            </span>

                            {#if product.type === 'service'}
                              <span class="sale-product-option__service">
                                <i class="bi bi-tools" aria-hidden="true"></i>
                                {t('Service')}
                              </span>
                            {:else}
                              <span
                                class="sale-product-option__stock"
                                title={t('Stock')}>
                                <i class="bi bi-box-seam" aria-hidden="true"></i>

                                <strong dir="ltr">
                                  {Number(
                                    product.quantity || 0,
                                  ).toLocaleString(undefined, {
                                    maximumFractionDigits: 3,
                                  })}
                                </strong>

                                <small>
                                  {units.find(
                                    (unitItem) =>
                                      unitItem.id ===
                                      product.product_unit_id,
                                  )?.name || t('Unit')}
                                  {#if enable_batch && product.batch_count > 1}
                                    / {product.batch_count} {t('Batch')}
                                  {/if}
                                </small>
                              </span>
                            {/if}
                          </div>
                        </button>
                      {/each}
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
                    <strong>{t('Select Product')}</strong>
                    <small>{t('Product')}</small>
                  </span>
                </div>
              {/if}
            </td>

            {#if enable_manufacturing_date}
              <td class="purchase-item-col-date"></td>
            {/if}

            {#if enable_expiry_date}
              <td class="purchase-item-col-date"></td>
            {/if}

            {#if enable_batch}
              <td class="purchase-item-col-batch"></td>
            {/if}

            {#if enable_heaviness}
              <td class="purchase-item-col-heaviness"></td>
            {/if}

            <td class="purchase-item-col-quantity"></td>
            <td class="purchase-item-col-price"></td>
            <td class="purchase-item-col-sell-price"></td>

            {#if enable_purchase_items_discount}
              <td class="purchase-item-col-discount"></td>
            {/if}

            <td class="purchase-item-col-subtotal"></td>
            <td class="purchase-item-col-actions"></td>
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
          <small>{t(currency)}</small>
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
    type="purchase"
    warehouse_id=""
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

      if (newProduct) {
        items.push({
          product_id: newProduct.id,
          product_name: newProduct.name,
          product_unit_id: newProduct.product_unit_id,
          quantity: 1,
          heaviness: 1,
          stock: Number(newProduct.quantity) || 0,
          batch: newProduct.batch,
          manufacturing_date: newProduct.manufacturing_date,
          expiry_date: newProduct.expiry_date,
          total_amount: Number(newProduct.buy_price) || 0,
          discount_type: 'percent',
          discount_amount: 0,
          preUnitQuantity: 1,
          preUnitPrice: 0,
          enablePercent: enable_product_benefit_percentage,
          benefit_percent: default_product_benefit_percentage,
          unit_price: Number(newProduct.buy_price) || 0,
          unit_price_currency: newProduct.buy_currency || '',
          sell_price: Number(newProduct.sell_price) || 0,
          sell_price_currency: newProduct.sell_currency || '',
          subtotal: Number(newProduct.buy_price) || 0,
          availableUnits: getUnitHierarchy(
            newProduct.product_unit_id,
          ),
        });

        items = [...items];
        dispatch('update', { items });
      }
    }} />
{/if}

 

<style>
  .purchase-items-card {
    --purchase-primary: var(--bs-primary, #2f6fed);
    --purchase-primary-dark: #1d4ed8;
    --purchase-border: #dfe6ef;
    --purchase-border-soft: #edf1f6;
    --purchase-text: #172033;
    --purchase-muted: #718096;

    width: 100%;
    margin-top: 1rem !important;
    overflow: visible;
    border: 1px solid var(--purchase-border);
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.055) !important;
  }

   /* Only layout needed for the existing Product search and Add button. */
  .purchase-product-search-row {
    display: flex;
    align-items: stretch;
    gap: 0.4rem;
    width: 100%;
    min-width: 0;
  }

  .purchase-product-search-row .purchase-product-search {
    flex: 1 1 auto;
    min-width: 0;
  }

  .purchase-product-quick-btn {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.32rem;
    min-width: 4.1rem;
    min-height: 2.25rem;
    padding-inline: 0.7rem;
    border-radius: 0.55rem;
    white-space: nowrap;
  }

  .purchase-product-quick-btn i {
    margin: 0;
    line-height: 1;
  }

  @media (max-width: 575.98px) {
    .purchase-product-quick-btn {
      min-width: 2.4rem;
      padding-inline: 0.6rem;
    }

    .purchase-product-quick-btn__text {
      display: none;
    }
  }

  .purchase-items-card :global(.card-body) {
    padding: 0;
  }

  .purchase-barcode-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  /* Header */

  .purchase-items-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.75rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #ffffff;
  }

  .purchase-items-heading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .purchase-items-heading__icon {
    display: inline-grid;
    flex: 0 0 2.5rem;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 0.625rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1rem;
  }

  .purchase-items-heading__copy {
    min-width: 0;
  }

  .purchase-items-title {
    margin: 0;
    color: var(--purchase-text);
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.3;
    letter-spacing: -0.015em;
  }

  .purchase-items-subtitle {
    margin: 0.15rem 0 0;
    color: var(--purchase-muted);
    font-size: 0.75rem;
    font-weight: 550;
  }

  .purchase-items-header__summary {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
  }

  .purchase-items-count {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.75rem;
    padding-inline: 0.6rem;
    border: 1px solid #dbe7fb;
    border-radius: 999px;
    background: #f4f8ff;
    color: #526783;
    font-size: 0.7rem;
    font-weight: 750;
  }

  .purchase-items-header-total {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    color: var(--purchase-text);
    font-size: 1.05rem;
    font-weight: 900;
  }

  .purchase-items-header-total small {
    color: var(--purchase-muted);
    font-size: 0.68rem;
    font-weight: 750;
  }

  /* Entry toolbar */

  .purchase-items-entry {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns:
      minmax(18rem, 1fr)
      minmax(8rem, 0.28fr)
      minmax(10rem, 0.36fr)
      auto;
    gap: 0.5rem;
    align-items: start;
    margin: 0;
    padding: 0.5rem 0.75rem 0.625rem;
    border-bottom: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-entry-field {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    margin: 0;
  }

  .purchase-entry-field--product {
    align-self: stretch;
  }

  .purchase-entry-label {
    display: none;
  }

  .purchase-product-search,
  .purchase-entry-control {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
    height: 2.375rem;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    background: #ffffff;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-product-search:hover,
  .purchase-entry-control:hover {
    border-color: #bdcadd;
  }

  .purchase-product-search:focus-within,
  .purchase-entry-control:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .purchase-product-search > i,
  .purchase-entry-control > i:first-child {
    flex: 0 0 2.35rem;
    width: 2.35rem;
    color: #8a99ad;
    text-align: center;
    pointer-events: none;
  }

  .purchase-product-search input,
  .purchase-entry-control input,
  .purchase-entry-control select {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: start;
  }

  .purchase-entry-control .input-group {
    flex: 1 1 auto;
    min-width: 0;
  }

  .purchase-entry-control .input-group-text {
    min-width: auto;
    padding: 0 0.75rem;
    border: none;
    background: transparent;
    color: #475569;
    font-weight: 700;
  }

  .purchase-entry-control .form-control {
    padding-left: 0.75rem;
  }

  .purchase-entry-control select {
    padding-inline-end: 2rem;
    appearance: none;
    cursor: pointer;
  }

  .purchase-product-search input::placeholder,
  .purchase-entry-control input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  .purchase-search-clear {
    display: inline-grid;
    flex: 0 0 1.8rem;
    width: 1.8rem;
    height: 1.8rem;
    margin-inline-end: 0.35rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: #94a3b8;
    font-size: 0.65rem;
    cursor: pointer;
  }

  .purchase-search-clear:hover {
    background: #f1f5f9;
    color: #475569;
  }

  .purchase-entry-chevron {
    position: absolute;
    inset-inline-end: 0.75rem;
    color: #8795a8 !important;
    font-size: 0.6rem;
    pointer-events: none;
  }

  /* =========================================================
   PURCHASE PRODUCT SEARCH + CREATE BUTTON
   Same style as SaleItemsTable
   ========================================================= */

.purchase-product-search-group {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 2.625rem;
  min-height: 2.625rem;
  overflow: hidden;

  border: 1px solid #cfd9e7;
  border-radius: 0.625rem;

  background: #ffffff;
  box-shadow: none;

  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background-color 150ms ease;
}

.purchase-product-search-group:hover {
  border-color: #b8c7da;
}

.purchase-product-search-group:focus-within {
  border-color: #78a4f5;
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
}

.purchase-product-search-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 2.5rem;

  width: 2.5rem;
  min-width: 2.5rem;
  height: 100%;

  border-inline-end: 1px solid #e3e9f1;

  background: #ffffff;
  color: #8b9aaf;

  font-size: 0.82rem;
}

.purchase-product-search-input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  height: 100%;

  padding: 0 0.7rem;

  border: 0;
  border-radius: 0;
  outline: none;

  background: transparent;
  color: #26364b;

  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;

  box-shadow: none;
}

.purchase-product-search-input::placeholder {
  color: #98a5b7;
  font-weight: 500;
  opacity: 1;
}

.purchase-product-search-input:focus {
  border: 0;
  outline: none;
  box-shadow: none;
}

.purchase-product-search-clear {
  display: inline-grid;
  flex: 0 0 2rem;
  width: 2rem;
  height: 100%;
  place-items: center;

  padding: 0;
  border: 0;

  background: transparent;
  color: #94a3b8;

  font-size: 0.68rem;
  cursor: pointer;

  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.purchase-product-search-clear:hover {
  background: #f1f5f9;
  color: #475569;
}

.purchase-product-create-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  flex: 0 0 auto;
  gap: 0.35rem;

  min-width: 5rem;
  height: 100%;
  padding: 0 0.85rem;

  border: 0;
  border-inline-start: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0;

  background: var(--bs-primary, #2f6fed);
  color: #ffffff;

  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1;
  white-space: nowrap;

  cursor: pointer;
  box-shadow: none;

  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.purchase-product-create-button:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.purchase-product-create-button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: -4px;
}

.purchase-product-create-button:active {
  background: #1e40af;
}

.purchase-product-create-button i {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1;
}

/* RTL automatically places:
   - search icon on the right
   - Add button on the left
*/
:global(html[dir='rtl']) .purchase-product-search-input {
  text-align: right;
}

:global(html[dir='ltr']) .purchase-product-search-input {
  text-align: left;
}

/* =========================================================
   DARK MODE
   ========================================================= */

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-group {
  border-color: var(--erp-border, #2b3a4f);
  background: var(--erp-surface-soft, #172033);
  color-scheme: dark;
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-group:hover {
  border-color: var(--erp-border-strong, #40516a);
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-group:focus-within {
  border-color: var(--erp-primary, #60a5fa);
  background: #0f172a;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-icon {
  border-color: var(--erp-border, #2b3a4f);
  background: var(--erp-surface-soft, #172033);
  color: var(--erp-muted, #94a3b8);
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-input {
  background: transparent;
  color: var(--erp-text, #e5edf7);
  caret-color: var(--erp-text, #e5edf7);
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-input::placeholder {
  color: #718198;
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-clear {
  color: #8493a8;
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search-clear:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-create-button {
  background: #2563eb;
  color: #ffffff;
}

:global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-create-button:hover {
  background: #3b82f6;
}

/* Mobile */
@media (max-width: 575.98px) {
  .purchase-product-search-group {
    height: 2.75rem;
  }

  .purchase-product-create-button {
    min-width: 2.75rem;
    padding-inline: 0.75rem;
  }

  .purchase-product-create-button span {
    display: none;
  }
}

  .purchase-entry-control--price > span {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    padding-inline: 0.7rem;
    border-inline-start: 1px solid #e2e8f0;
    color: #64748b;
    background: #f8fafc;
    font-size: 0.7rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-entry-control--unit > input {
    min-width: 3rem;
    padding-inline: 0.45rem;
    text-align: center;
  }

  .purchase-entry-unit {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    flex: 0 0 auto;
    min-width: 3.25rem;
    justify-content: center;
    padding-inline: 0.65rem;
    border-inline-start: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-search-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-width: 7.5rem;
    height: 2.375rem;
    padding-inline: 1rem;
    border: 0;
    border-radius: 0.625rem;
    background: var(--purchase-primary);
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: none;
    transition:
      background 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-search-add-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    background: var(--purchase-primary-dark);
    box-shadow: none;
  }

  .purchase-search-add-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .purchase-selected-stock {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.15rem;
    margin-top: 0.22rem;
    color: #62806f;
    font-size: 0.67rem;
    font-weight: 600;
  }

  .purchase-selected-stock.is-empty {
    color: #dc2626;
  }

  /*
   * Permanent blank Product row.
   * The Product TD itself becomes searchable only after it is clicked.
   */
  .purchase-item-search-row {
    height: 4.25rem;
    background: #ffffff;
  }

  .purchase-item-search-row:hover {
    background: #f4f8ff;
  }

  .purchase-item-search-row > td {
    height: 4.25rem !important;
    padding-block: 0.45rem !important;
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

  .purchase-item-search-row:hover
    .purchase-item-search-cell {
    background: #f4f8ff !important;
  }

  .purchase-item-search-cell:focus-visible,
  .purchase-item-search-cell--editing {
    background: #f8fbff !important;
    box-shadow:
      inset 0 0 0 1px
        rgba(47, 111, 237, 0.22),
      1px 0 0 #e9eef5;
  }

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
    color: var(--purchase-primary);
    font-size: 0.68rem;
    cursor: pointer;
  }

  .purchase-item-empty-product__icon:hover {
    background: #dbeafe;
  }

  .purchase-item-empty-product__icon:focus-visible {
    outline: 2px solid var(--purchase-primary);
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
   * No visible search-bar container:
   * the input is part of the Product table cell.
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

  .purchase-item-search-icon,
  .purchase-item-inline-search__icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    color: var(--purchase-primary);
    font-size: 0.76rem;
  }

  .purchase-item-search-input,
  .purchase-item-inline-search__input {
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

  .purchase-item-search-input::placeholder,
  .purchase-item-inline-search__input::placeholder {
    color: #9aa7b8;
    font-weight: 500;
  }

  /* Dropdown */

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
  :global(.purchase-items-dropdown .list-group-item:focus),
  :global(.purchase-items-dropdown .list-group-item.is-active) {
    background: #f0f6ff;
    color: var(--purchase-primary);
  }

  :global(
    .purchase-items-dropdown
      .list-group-item.is-active
      .sale-product-option__copy
      strong
  ) {
    color: var(--purchase-primary);
  }

  :global(.purchase-items-dropdown .list-group-item small) {
    color: #8491a4;
    font-size: 0.64rem;
    font-weight: 600;
  }

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
    color: var(--purchase-primary);
    font-size: 0.6rem;
    font-weight: 750;
    white-space: nowrap;
  }

  /* Table */

  .purchase-items-table-scroll {
    width: 100%;
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: visible;
    background: #ffffff;
    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
  }

  .purchase-items-table-scroll::-webkit-scrollbar {
    height: 0.45rem;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #b9c5d5;
  }

  .purchase-items-table-scroll::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  .purchase-items-table {
    width: 100%;
    min-width: 68rem;
    margin: 0;
    border: 0;
    border-collapse: separate;
    border-spacing: 0;
    table-layout: auto;
    color: #42516a;
  }

  .purchase-items-table thead th {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 2.875rem;
    padding: 0.55rem 0.625rem;
    border: 0;
    border-bottom: 1px solid #dfe5ed;
    background: #f7f9fc;
    color: #67768a;
    font-size: 0.68rem;
    font-weight: 850;
    line-height: 1.2;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }
  .purchase-items-table thead th:first-child {
    text-align: start;
  }

  .purchase-items-table tbody tr {
    height: 4.25rem;
    background: #ffffff;
    transition: background 0.12s ease;
  }

  .purchase-items-table tbody tr:nth-child(even) {
    background: #fbfcfe;
  }

  .purchase-items-table tbody tr:hover {
    background: #f4f8ff;
  }

  .purchase-items-table tbody td {
    height: 4.25rem;
    padding: 0.45rem 0.5rem;
    border: 0;
    border-bottom: 1px solid #e9eef5;
    background: transparent;
    color: #46566d;
    font-size: 0.74rem;
    text-align: center;
    vertical-align: middle;
  }

  /* Product column */

  .purchase-item-col-product {
    width: 15rem;
    min-width: 15rem;

  }

  .purchase-item-product-cell {
    position: sticky;
    inset-inline-start: 0;
    z-index: 2;
    background: #ffffff !important;
    box-shadow: 1px 0 0 #e9eef5;
  }

  .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #fbfcfe !important;
  }

  .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #f4f8ff !important;
  }

  .purchase-items-table thead .purchase-item-col-product {
    inset-inline-start: 0;
    z-index: 6;
    background: #fbfcfe;
    box-shadow: 1px 0 0 #dfe5ed;
  }

  .purchase-item-product {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .purchase-item-number {
    display: inline-grid;
    flex: 0 0 1.6rem;
    width: 1.6rem;
    height: 1.6rem;
    place-items: center;
    border-radius: 0.4rem;
    background: #f0f3f8;
    color: #7b899d;
    font-size: 0.65rem;
    font-weight: 800;
  }

  .purchase-item-product-icon {
    display: inline-grid;
    flex: 0 0 2rem;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.5rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 0.85rem;
  }

  .purchase-item-product-copy {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    gap: 0.1rem;
    text-align: start;
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

  /* General editable field */

  .purchase-item-field {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 6rem;
    height: 2.25rem;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    box-shadow: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .purchase-item-field:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
  }

  .purchase-item-field > input,
  .purchase-item-field > select {
    flex: 1 1 auto;
    width: 100%;
    min-width: 2.5rem;
    height: 100%;
    padding: 0 0.45rem;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 700;
    text-align: center;
    box-shadow: none;
  }

  .purchase-item-field > select {
    cursor: pointer;
  }

  .purchase-item-batch-field {
    min-width: 8.5rem;
  }

  .purchase-item-field > input:disabled {
    background: #f8fafc;
    color: #64748b;
  }

  .purchase-item-field--with-suffix {
    min-width: 7rem;
  }

  .purchase-item-readonly-value {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: center;
    min-width: 3rem;
    padding-inline: 0.4rem;
    color: #26364b;
    font-size: 0.73rem;
    font-weight: 750;
  }

  .purchase-item-suffix {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 2.75rem;
    padding: 0 0.4rem;
    border-inline-start: 1px solid #e3e8ef;
    background: #f7f9fc;
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .purchase-item-quantity-field :global(.filter-select) {
    flex: 0 0 auto;
    width: auto !important;
    min-width: 4.5rem;
    max-width: 8rem !important;
    height: 100%;
    border-inline-start: 1px solid #e3e8ef;
  }

  .purchase-item-quantity-field :global(.filter-select__trigger) {
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

  .purchase-item-toggle {
    display: inline-grid;
    flex: 0 0 2.15rem;
    width: 2.15rem;
    min-width: 2.15rem;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-inline-end: 1px solid #e3e8ef;
    border-radius: 0;
    background: #f7f9fc;
    color: #64748b;
    font-size: 0.7rem;
    cursor: pointer;
    box-shadow: none;
  }

  .purchase-item-toggle:hover {
    background: #edf4ff;
    color: var(--purchase-primary);
  }

  .purchase-item-toggle.is-active {
    background: #fff7df;
    color: #b7791f;
  }

  .purchase-item-sell-field,
  .purchase-item-discount-field {
    min-width: 11rem;
  }

  .purchase-item-percent-input {
    max-width: 3.5rem;
    border-inline-end: 1px solid #e3e8ef !important;
  }

  .purchase-item-discount-suffix {
    min-width: 4.75rem;
  }

  /* Heaviness */

  .purchase-item-col-heaviness {
    width: 19rem;
    min-width: 19rem;
  }

  .purchase-item-heaviness {
    display: grid;
    grid-template-columns: repeat(3, minmax(5rem, 1fr));
    gap: 0.35rem;
    width: 100%;
  }

  .purchase-item-heaviness label {
    display: grid;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
  }

  .purchase-item-heaviness label:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.07);
  }

  .purchase-item-heaviness label span {
    display: block;
    padding: 0.2rem 0.3rem;
    border-bottom: 1px solid #e7ebf1;
    background: #f7f9fc;
    color: #7b8799;
    font-size: 0.55rem;
    font-weight: 750;
    text-align: center;
    white-space: nowrap;
  }

  .purchase-item-heaviness label input {
    width: 100%;
    min-width: 0;
    height: 1.8rem;
    padding-inline: 0.35rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.7rem;
    font-weight: 700;
    text-align: center;
  }

  /* Column widths */

  .purchase-item-col-batch {
    width: 7rem;
    min-width: 7rem;
  }

  .purchase-item-col-date {
    width: 9rem;
    min-width: 9rem;
  }

  .purchase-item-col-quantity {
    width: 7.5rem;
    min-width: 7.5rem;
  }

  .purchase-item-col-price {
    width: 8.5rem;
    min-width: 8.5rem;
  }

  .purchase-item-col-sell-price {
    width: 12rem;
    min-width: 12rem;
  }

  .purchase-item-col-discount {
    width: 12rem;
    min-width: 12rem;
  }

  .purchase-item-col-subtotal {
    width: 8rem;
    min-width: 8rem;
  }

  .purchase-item-col-actions {
    width: 4rem;
    min-width: 4rem;
  }

  /* Datepicker */

  .purchase-item-datepicker {
    display: flex;
    width: 100%;
    height: 2.25rem;
    min-height: 2.25rem;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .purchase-item-datepicker:focus-within {
    box-shadow: none;
  }

  .purchase-item-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    border: 0 !important;
    box-shadow: none !important;
  }

  .purchase-item-datepicker :global(.persian-date-text) {
    display: none !important;
  }

  .purchase-item-datepicker :global(.gregorian-date-text) {
    flex: 1 1 auto;
    min-width: 0;
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    padding: 0 0.45rem !important;
    border: 1px solid #dbe3ee !important;
    border-radius: 0.5rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.73rem !important;
    font-weight: 700 !important;
    line-height: 2.25rem !important;
    text-align: center !important;
    box-shadow: none !important;
  }

  .purchase-item-datepicker :global(.gregorian-date-text:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08) !important;
  }

  .purchase-item-datepicker :global(.date-picker-icon) {
    flex: 0 0 2rem;
    width: 2rem;
    min-width: 2rem;
    height: 100%;
    border: 0 !important;
    border-inline-start: 1px solid #e3e8ef !important;
    background: #f7f9fc !important;
  }

  /* Subtotal and actions */

  .purchase-item-money {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.3rem;
    width: 100%;
    white-space: nowrap;
  }

  .purchase-item-money strong {
    color: #172033;
    font-size: 0.8rem;
    font-weight: 900;
  }

  .purchase-item-money small {
    color: #718096;
    font-size: 0.62rem;
    font-weight: 750;
  }

  .purchase-item-actions {
    text-align: center !important;
  }

  .purchase-item-delete {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    place-items: center;
    border: 1px solid #f3cccc;
    border-radius: 0.5rem;
    background: #fff7f7;
    color: #d64545;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .purchase-item-delete:hover {
    transform: translateY(-1px);
    border-color: #efaaaa;
    background: #feecec;
  }

  /* Empty state */

  .purchase-items-empty-row,
  .purchase-items-empty-row:hover {
    height: auto !important;
    background: #ffffff !important;
  }

  .purchase-items-empty-row td {
    height: auto !important;
    padding: 0 !important;
  }

  .purchase-items-empty {
    display: grid;
    min-height: 12rem;
    place-items: center;
    align-content: center;
    gap: 0.35rem;
    padding: 2rem;
    text-align: center;
  }

  .purchase-items-empty > span {
    display: inline-grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 0.75rem;
    background: #edf4ff;
    color: var(--purchase-primary);
    font-size: 1.2rem;
  }

  .purchase-items-empty strong {
    margin-top: 0.3rem;
    color: #334155;
    font-size: 0.85rem;
    font-weight: 800;
  }

  .purchase-items-empty p {
    margin: 0;
    color: #8491a4;
    font-size: 0.72rem;
  }

  /* Footer */

  .purchase-items-total-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4rem;
    margin: 0;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--purchase-border-soft);
    background: #fbfcfe;
  }

  .purchase-items-clear-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 2.1rem;
    padding-inline: 0.7rem;
    border: 1px solid #f1d0d0;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #cf4b4b;
    font-size: 0.68rem;
    font-weight: 750;
    cursor: pointer;
  }

  .purchase-items-clear-btn:hover {
    border-color: #edb4b4;
    background: #fff5f5;
  }

  .purchase-items-grand-total {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    white-space: nowrap;
  }

  .purchase-items-grand-total > span {
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 750;
  }

  .purchase-items-grand-total strong {
    color: var(--purchase-primary);
    font-size: 1.05rem;
    font-weight: 900;
  }

  .purchase-items-grand-total small {
    color: #718096;
    font-size: 0.68rem;
    font-weight: 750;
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

  @media (max-width: 1200px) {
    .purchase-items-entry {
      grid-template-columns: minmax(16rem, 1fr) 8rem 10rem;
    }

    .purchase-search-add-btn {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  @media (max-width: 767.98px) {
    .purchase-items-card {
      border-radius: 0.75rem;
    }

    .purchase-items-header {
      align-items: flex-start;
      flex-direction: column;
      padding: 0.8rem;
    }

    .purchase-items-header__summary {
      justify-content: space-between;
      width: 100%;
    }

    .purchase-items-entry {
      grid-template-columns: 1fr;
      padding: 0.8rem;
    }

    .purchase-search-add-btn {
      grid-column: auto;
    }

    .purchase-items-table {
      min-width: 62rem;
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }

  @media (max-width: 420px) {
    .purchase-items-heading__icon {
      display: none;
    }

    .purchase-items-header__summary {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .purchase-items-total-row {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .purchase-items-clear-btn {
      width: 100%;
    }
  }

  /* Auto-size editable controls by their current value. */
  .purchase-items-table .purchase-item-field {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    vertical-align: middle;
  }

  .purchase-items-table .purchase-item-field--with-suffix,
  .purchase-items-table .purchase-item-sell-field,
  .purchase-items-table .purchase-item-discount-field {
    min-width: 0;
  }

  .purchase-items-table .purchase-item-field > input,
  .purchase-items-table .purchase-item-heaviness input {
    field-sizing: content;
    inline-size: auto;
    width: auto;
    min-inline-size: 3ch;
    min-width: 3ch;
    max-inline-size: none;
    max-width: none;
    flex: 0 0 auto;
  }

  .purchase-items-table .purchase-item-percent-input {
    max-width: none;
  }

  /* Auto-size the date-picker control to its displayed date value. */
  .purchase-items-table .purchase-item-datepicker {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    vertical-align: middle;
  }

  .purchase-items-table .purchase-item-datepicker :global(.date-picker-control),
  .purchase-items-table .purchase-item-datepicker :global(.app-date-field),
  .purchase-items-table .purchase-item-datepicker :global(.pdp-container) {
    display: inline-flex;
    width: fit-content;
    min-width: 0;
    max-width: none;
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    flex: 0 0 auto;
    align-items: center;
  }

  .purchase-items-table .purchase-item-datepicker :global(input),
  .purchase-items-table .purchase-item-datepicker :global(.gregorian-date-text) {
    field-sizing: content;
    inline-size: auto !important;
    width: auto !important;
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    min-inline-size: 10ch;
    min-width: 10ch !important;
    max-inline-size: none;
    max-width: none !important;
    flex: 0 0 auto !important;
  }

  /* Keep value columns tight around their controls.
     Extra table space is assigned to the Product column only. */
  .purchase-items-table .purchase-item-col-product {
    width: auto;
    min-width: 15rem;
  }

  .purchase-items-table .purchase-item-col-batch,
  .purchase-items-table .purchase-item-col-date,
  .purchase-items-table .purchase-item-col-quantity,
  .purchase-items-table .purchase-item-col-price,
  .purchase-items-table .purchase-item-col-sell-price,
  .purchase-items-table .purchase-item-col-discount,
  .purchase-items-table .purchase-item-col-subtotal,
  .purchase-items-table .purchase-item-col-actions {
    width: 1%;
    min-width: 0;
    white-space: nowrap;
  }

  .purchase-items-table tbody td.purchase-item-col-batch,
  .purchase-items-table tbody td.purchase-item-col-date,
  .purchase-items-table tbody td.purchase-item-col-quantity,
  .purchase-items-table tbody td.purchase-item-col-price,
  .purchase-items-table tbody td.purchase-item-col-sell-price,
  .purchase-items-table tbody td.purchase-item-col-discount,
  .purchase-items-table tbody td.purchase-item-col-subtotal,
  .purchase-items-table tbody td.purchase-item-col-actions {
    padding-inline: 0.25rem;
  }

  /* Dark theme */

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-card {
    --purchase-border: var(--erp-border, #2b3a4f);
    --purchase-border-soft: var(--erp-border, #2b3a4f);
    --purchase-text: var(--erp-text, #e5edf8);
    --purchase-muted: var(--erp-muted, #94a3b8);
    border-color: var(--purchase-border);
    background: var(--erp-surface, #111827);
    color-scheme: dark;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2) !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-header {
    border-color: var(--purchase-border);
    background: var(--erp-surface, #111827);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-title {
    color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-heading__icon,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option__icon,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-product-icon,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-empty > span {
    background: rgba(47, 111, 237, 0.16);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-entry,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-total-row {
    border-color: var(--purchase-border);
    background: #0f1726;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-field,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-heaviness label {
    border-color: var(--purchase-border);
    background: var(--erp-surface-soft, #172033);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search:hover,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control:hover {
    border-color: #42546d;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search input,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control input,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-field > input,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-datepicker :global(.gregorian-date-text),
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-readonly-value,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-heaviness label input {
    border-color: var(--purchase-border) !important;
    background-color: #172033 !important;
    color: var(--purchase-text);
    -webkit-text-fill-color: var(--purchase-text);
    box-shadow: inset 0 0 0 999px #172033;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-search input::placeholder,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control input::placeholder {
    color: #718198;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-unit,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control--price > span,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-suffix,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-toggle,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-heaviness label span,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-datepicker :global(.date-picker-icon),
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-quantity-field :global(.filter-select__trigger) {
    border-color: var(--purchase-border) !important;
    background: #202b3d !important;
    color: #a9b7ca !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-quantity-field :global(.filter-select) {
    border-color: var(--purchase-border);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-field > input:disabled {
    background: #202b3d;
    color: #94a3b8;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-toggle:hover {
    background: #27354a;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-toggle.is-active {
    background: #3a3017;
    color: #f4c967;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-dropdown {
    border-color: var(--purchase-border);
    background: var(--erp-surface, #111827);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.4);
  }

  :global(
    html:is(.dark, [data-mdb-theme='dark'])
      .purchase-items-dropdown
      .list-group-item.is-active
  ),
  :global(
    html:is(.dark, [data-mdb-theme='dark'])
      .purchase-items-dropdown
      .list-group-item:hover
  ) {
    background: #1d2b40 !important;
    color: #93c5fd !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option {
    color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option:hover {
    background: #1d2b40;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option__copy strong {
    color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option__copy small,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option__stock,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-product-option__stock small {
    color: var(--purchase-muted);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table-scroll {
    background: var(--erp-surface, #111827);
    scrollbar-color: #52647d transparent;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table-scroll::-webkit-scrollbar-thumb {
    background: #52647d;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table {
    color: #c8d3e2;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table thead th,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table thead .purchase-item-col-product {
    border-color: var(--purchase-border);
    background: #172033;
    color: #a9b7ca;
    box-shadow: 1px 0 0 var(--purchase-border);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody tr {
    background: var(--erp-surface, #111827);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody tr:nth-child(even) {
    background: #141d2c;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody tr:hover {
    background: #1a2638;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody td {
    border-color: var(--purchase-border);
    color: #c8d3e2;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-product-cell {
    background: var(--erp-surface, #111827) !important;
    box-shadow: 1px 0 0 var(--purchase-border);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody tr:nth-child(even) .purchase-item-product-cell {
    background: #141d2c !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-table tbody tr:hover .purchase-item-product-cell {
    background: #1a2638 !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-number {
    background: #202b3d;
    color: #a9b7ca;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-product-name,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-money strong,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-empty strong {
    color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-product-copy small,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-money small,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-grand-total > span,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-grand-total small {
    color: var(--purchase-muted);
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-delete {
    border-color: #74333c;
    background: #321c25;
    color: #ff8d98;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-delete:hover {
    border-color: #9a4350;
    background: #44222c;
    color: #ffabb3;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-empty-row,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-empty-row:hover {
    background: var(--erp-surface, #111827) !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-clear-btn {
    border-color: #74333c;
    background: var(--erp-surface, #111827);
    color: #ff8d98;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-items-clear-btn:hover {
    border-color: #9a4350;
    background: #321c25;
  }

  :global(body.dark) .purchase-items-entry,
  :global([data-theme='dark']) .purchase-items-entry {
    border-color: var(--erp-border, #2b3a4f);
    background: #0f1726;
    color-scheme: dark;
  }

  :global(body.dark) .purchase-product-search-group,
  :global(body.dark) .purchase-product-search,
  :global(body.dark) .purchase-entry-control,
  :global([data-theme='dark']) .purchase-product-search-group,
  :global([data-theme='dark']) .purchase-product-search,
  :global([data-theme='dark']) .purchase-entry-control {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color-scheme: dark;
  }

  :global(body.dark) .purchase-product-search-group:hover,
  :global(body.dark) .purchase-product-search:hover,
  :global(body.dark) .purchase-entry-control:hover,
  :global([data-theme='dark']) .purchase-product-search-group:hover,
  :global([data-theme='dark']) .purchase-product-search:hover,
  :global([data-theme='dark']) .purchase-entry-control:hover {
    border-color: #42546d;
  }

  :global(body.dark) .purchase-product-search-group:focus-within,
  :global(body.dark) .purchase-product-search:focus-within,
  :global(body.dark) .purchase-entry-control:focus-within,
  :global([data-theme='dark']) .purchase-product-search-group:focus-within,
  :global([data-theme='dark']) .purchase-product-search:focus-within,
  :global([data-theme='dark']) .purchase-entry-control:focus-within {
    border-color: var(--erp-primary, #60a5fa);
    background: #0f172a;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
  }

  :global(body.dark) .purchase-product-search-icon,
  :global([data-theme='dark']) .purchase-product-search-icon {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-muted, #94a3b8);
  }

  :global(body.dark) .purchase-product-search-input,
  :global(body.dark) .purchase-product-search input,
  :global(body.dark) .purchase-entry-control input,
  :global(body.dark) .purchase-entry-control select,
  :global([data-theme='dark']) .purchase-product-search-input,
  :global([data-theme='dark']) .purchase-product-search input,
  :global([data-theme='dark']) .purchase-entry-control input,
  :global([data-theme='dark']) .purchase-entry-control select {
    background-color: #172033 !important;
    color: var(--erp-text, #e5edf7) !important;
    caret-color: var(--erp-text, #e5edf7);
    -webkit-text-fill-color: var(--erp-text, #e5edf7);
    box-shadow: inset 0 0 0 999px #172033;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control--unit > input,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control--price > input,
  :global(body.dark) .purchase-entry-control--unit > input,
  :global(body.dark) .purchase-entry-control--price > input,
  :global([data-theme='dark']) .purchase-entry-control--unit > input,
  :global([data-theme='dark']) .purchase-entry-control--price > input {
    background: #172033 !important;
    color: #e5edf7 !important;
    -webkit-text-fill-color: #e5edf7;
    box-shadow: inset 0 0 0 999px #172033 !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control--unit,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control--price,
  :global(body.dark) .purchase-entry-control,
  :global(body.dark) .purchase-entry-control--unit,
  :global(body.dark) .purchase-entry-control--price,
  :global([data-theme='dark']) .purchase-entry-control,
  :global([data-theme='dark']) .purchase-entry-control--unit,
  :global([data-theme='dark']) .purchase-entry-control--price {
    border-color: #334762 !important;
    background: #172033 !important;
    overflow: hidden;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-entry-control > i:first-child,
  :global(body.dark) .purchase-entry-control > i:first-child,
  :global([data-theme='dark']) .purchase-entry-control > i:first-child {
    align-self: stretch;
    display: inline-grid;
    place-items: center;
    border-inline-end: 1px solid #334762;
    background: #202b3d !important;
    color: #a9b7ca !important;
  }

  :global(body.dark) .purchase-entry-control .input-group-text,
  :global(body.dark) .purchase-entry-unit,
  :global(body.dark) .purchase-entry-control--price > span,
  :global([data-theme='dark']) .purchase-entry-control .input-group-text,
  :global([data-theme='dark']) .purchase-entry-unit,
  :global([data-theme='dark']) .purchase-entry-control--price > span {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: #202b3d !important;
    color: #a9b7ca !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-search-row,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-search-row > td,
  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-search-cell {
    border-color: var(--purchase-border) !important;
    background: var(--erp-surface, #111827) !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark'])) .purchase-item-search-row:hover,
  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-search-row:hover
    .purchase-item-search-cell {
    background: #1a2638 !important;
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-search-cell:focus-visible,
  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-search-cell--editing {
    background: #172338 !important;
    box-shadow:
      inset 0 0 0 1px
        rgba(96, 165, 250, 0.28),
      1px 0 0 var(--purchase-border);
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-empty-product__icon {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-empty-product__copy strong {
    color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-empty-product__copy small {
    color: var(--purchase-muted);
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-inline-search__icon {
    color: #93c5fd;
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-inline-search__input {
    color: var(--purchase-text);
    caret-color: var(--purchase-text);
  }

  :global(html:is(.dark, [data-mdb-theme='dark']))
    .purchase-item-inline-search__input::placeholder {
    color: #718198;
  }

  /*
   * MDB dark-mode support for the purchase date sections.
   */
  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker) {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface-soft, #172033);
    color-scheme: dark;
  }

  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker:focus-within) {
    border-color: #60a5fa;
    background: #0f172a;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
  }

  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker input),
  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker .pdp-input) {
    border-color: var(--erp-border, #2b3a4f) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
    caret-color: var(--erp-text, #e5edf8);
    -webkit-text-fill-color: var(--erp-text, #e5edf8);
    box-shadow: inset 0 0 0 999px var(--erp-surface-soft, #172033) !important;
  }

  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker input::placeholder),
  :global(html[data-mdb-theme='dark'] .purchase-item-datepicker .pdp-input::placeholder) {
    color: #718198 !important;
    -webkit-text-fill-color: #718198;
  }

  :global(html[data-mdb-theme='dark'] .purchase-item-col-date) {
    background: transparent;
  }

  :global(html[data-mdb-theme='dark'] .purchase-items-dropdown .list-group-item) {
    background: transparent;
    color: var(--erp-text, #e5edf8);
  }

  :global(html[data-mdb-theme='dark'] .purchase-items-dropdown .list-group-item.is-active),
  :global(html[data-mdb-theme='dark'] .purchase-items-dropdown .list-group-item:hover) {
    background: #1d2b40 !important;
    color: #93c5fd !important;
  }

  /* =========================================================
     FINAL PURCHASE ITEMS DARK-MODE OVERRIDES
     Supports:
     - <html data-mdb-theme="dark">
     - <html class="dark">
     - <body class="dark">
     ========================================================= */

  :global(html[data-mdb-theme='dark']) .purchase-items-card,
  :global(html.dark) .purchase-items-card,
  :global(body.dark) .purchase-items-card {
    --purchase-border: var(--erp-border, #334155);
    --purchase-border-soft: var(--erp-border, #334155);
    --purchase-text: var(--erp-text, #e5edf8);
    --purchase-muted: var(--erp-muted, #94a3b8);
    background: var(--erp-surface, #111827) !important;
    border-color: var(--purchase-border) !important;
    color: var(--purchase-text) !important;
    color-scheme: dark;
  }

  /* Table header, rows and permanent Product row */

  :global(html[data-mdb-theme='dark']) .purchase-items-table,
  :global(html.dark) .purchase-items-table,
  :global(body.dark) .purchase-items-table {
    background: var(--erp-surface, #111827) !important;
    color: var(--purchase-text) !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-table thead th,
  :global(html.dark) .purchase-items-table thead th,
  :global(body.dark) .purchase-items-table thead th {
    background: #172033 !important;
    border-color: var(--purchase-border) !important;
    color: #b8c5d6 !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-table tbody tr,
  :global(html.dark) .purchase-items-table tbody tr,
  :global(body.dark) .purchase-items-table tbody tr {
    background: var(--erp-surface, #111827) !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-table tbody tr:nth-child(even),
  :global(html.dark) .purchase-items-table tbody tr:nth-child(even),
  :global(body.dark) .purchase-items-table tbody tr:nth-child(even) {
    background: #141e2d !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-table tbody td,
  :global(html.dark) .purchase-items-table tbody td,
  :global(body.dark) .purchase-items-table tbody td {
    border-color: var(--purchase-border) !important;
    color: #d7e0ec !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-product-cell,
  :global(html[data-mdb-theme='dark']) .purchase-item-search-cell,
  :global(html.dark) .purchase-item-product-cell,
  :global(html.dark) .purchase-item-search-cell,
  :global(body.dark) .purchase-item-product-cell,
  :global(body.dark) .purchase-item-search-cell {
    background: var(--erp-surface, #111827) !important;
    box-shadow: 1px 0 0 var(--purchase-border) !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-search-row,
  :global(html[data-mdb-theme='dark']) .purchase-item-search-row > td,
  :global(html.dark) .purchase-item-search-row,
  :global(html.dark) .purchase-item-search-row > td,
  :global(body.dark) .purchase-item-search-row,
  :global(body.dark) .purchase-item-search-row > td {
    background: #111a29 !important;
    border-color: var(--purchase-border) !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-search-row:hover,
  :global(html[data-mdb-theme='dark']) .purchase-item-search-row:hover > td,
  :global(html.dark) .purchase-item-search-row:hover,
  :global(html.dark) .purchase-item-search-row:hover > td,
  :global(body.dark) .purchase-item-search-row:hover,
  :global(body.dark) .purchase-item-search-row:hover > td {
    background: #172235 !important;
  }

  /* All editable row control containers */

  :global(html[data-mdb-theme='dark']) .purchase-item-field,
  :global(html[data-mdb-theme='dark']) .purchase-item-datepicker,
  :global(html[data-mdb-theme='dark']) .purchase-item-heaviness label,
  :global(html.dark) .purchase-item-field,
  :global(html.dark) .purchase-item-datepicker,
  :global(html.dark) .purchase-item-heaviness label,
  :global(body.dark) .purchase-item-field,
  :global(body.dark) .purchase-item-datepicker,
  :global(body.dark) .purchase-item-heaviness label {
    background: var(--erp-surface-soft, #172033) !important;
    border-color: var(--purchase-border) !important;
    color: var(--purchase-text) !important;
    box-shadow: none !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-field:focus-within,
  :global(html[data-mdb-theme='dark']) .purchase-item-datepicker:focus-within,
  :global(html.dark) .purchase-item-field:focus-within,
  :global(html.dark) .purchase-item-datepicker:focus-within,
  :global(body.dark) .purchase-item-field:focus-within,
  :global(body.dark) .purchase-item-datepicker:focus-within {
    border-color: #60a5fa !important;
    background: #0f172a !important;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.16) !important;
  }

  /* Number, text and date inputs */

  :global(html[data-mdb-theme='dark']) .purchase-item-field input,
  :global(html[data-mdb-theme='dark']) .purchase-item-field select,
  :global(html[data-mdb-theme='dark']) .purchase-item-datepicker input,
  :global(html[data-mdb-theme='dark']) .purchase-item-datepicker .pdp-input,
  :global(html[data-mdb-theme='dark']) .purchase-item-heaviness input,
  :global(html.dark) .purchase-item-field input,
  :global(html.dark) .purchase-item-field select,
  :global(html.dark) .purchase-item-datepicker input,
  :global(html.dark) .purchase-item-datepicker .pdp-input,
  :global(html.dark) .purchase-item-heaviness input,
  :global(body.dark) .purchase-item-field input,
  :global(body.dark) .purchase-item-field select,

  :global(html[data-mdb-theme='dark']) .purchase-item-field input:focus,
  :global(html[data-mdb-theme='dark']) .purchase-item-field select:focus,
  :global(html.dark) .purchase-item-field input:focus,
  :global(html.dark) .purchase-item-field select:focus,
  :global(body.dark) .purchase-item-field input:focus,
  :global(body.dark) .purchase-item-field select:focus,
  

  :global(html[data-mdb-theme='dark']) .purchase-item-field input:disabled,
  :global(html[data-mdb-theme='dark']) .purchase-item-field select:disabled,
  :global(html.dark) .purchase-item-field input:disabled,
  :global(html.dark) .purchase-item-field select:disabled,
  :global(body.dark) .purchase-item-field input:disabled,
  :global(body.dark) .purchase-item-field select:disabled {
    background: #202b3d !important;
    background-color: #202b3d !important;
    color: #94a3b8 !important;
    -webkit-text-fill-color: #94a3b8 !important;
    box-shadow:
      inset 0 0 0 1000px #202b3d !important;
  }

  /* Unit, currency, percentage and dropdown suffixes */

  :global(html[data-mdb-theme='dark']) .purchase-item-suffix,
  :global(html[data-mdb-theme='dark']) .purchase-item-toggle,
  :global(html[data-mdb-theme='dark']) .purchase-item-quantity-field :global(.filter-select__trigger),
  :global(html.dark) .purchase-item-suffix,
  :global(html.dark) .purchase-item-toggle,
  :global(html.dark) .purchase-item-quantity-field :global(.filter-select__trigger),
  :global(body.dark) .purchase-item-suffix,
  :global(body.dark) .purchase-item-toggle,
  :global(body.dark) .purchase-item-quantity-field :global(.filter-select__trigger) {
    background: #202b3d !important;
    border-color: var(--purchase-border) !important;
    color: #b8c5d6 !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-quantity-field :global(.filter-select__trigger:hover),
  :global(html[data-mdb-theme='dark']) .purchase-item-toggle:hover,
  :global(html.dark) .purchase-item-quantity-field :global(.filter-select__trigger:hover),
  :global(html.dark) .purchase-item-toggle:hover,
  :global(body.dark) .purchase-item-quantity-field :global(.filter-select__trigger:hover),
  :global(body.dark) .purchase-item-toggle:hover {
    background: #29384d !important;
    color: #dbeafe !important;
  }

  /* Footer and total section shown as white in the screenshot */

  :global(html[data-mdb-theme='dark']) .purchase-items-total-row,
  :global(html.dark) .purchase-items-total-row,
  :global(body.dark) .purchase-items-total-row {
    background: #0f1726 !important;
    background-color: #0f1726 !important;
    border-color: var(--purchase-border) !important;
    color: var(--purchase-text) !important;
    box-shadow: none !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-clear-btn,
  :global(html.dark) .purchase-items-clear-btn,
  :global(body.dark) .purchase-items-clear-btn {
    background: #241923 !important;
    border-color: #74333c !important;
    color: #ff8d98 !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-clear-btn:hover,
  :global(html.dark) .purchase-items-clear-btn:hover,
  :global(body.dark) .purchase-items-clear-btn:hover {
    background: #321c25 !important;
    border-color: #9a4350 !important;
    color: #ffb4bb !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-grand-total,
  :global(html.dark) .purchase-items-grand-total,
  :global(body.dark) .purchase-items-grand-total {
    color: var(--purchase-text) !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-grand-total > span,
  :global(html[data-mdb-theme='dark']) .purchase-items-grand-total small,
  :global(html.dark) .purchase-items-grand-total > span,
  :global(html.dark) .purchase-items-grand-total small,
  :global(body.dark) .purchase-items-grand-total > span,
  :global(body.dark) .purchase-items-grand-total small {
    color: #94a3b8 !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-items-grand-total strong,
  :global(html.dark) .purchase-items-grand-total strong,
  :global(body.dark) .purchase-items-grand-total strong {
    color: #60a5fa !important;
  }

  /* Product information */

  :global(html[data-mdb-theme='dark']) .purchase-item-product-name,
  :global(html.dark) .purchase-item-product-name,
  :global(body.dark) .purchase-item-product-name {
    color: #f1f5f9 !important;
  }

  :global(html[data-mdb-theme='dark']) .purchase-item-product-copy small,
  :global(html.dark) .purchase-item-product-copy small,
  :global(body.dark) .purchase-item-product-copy small {
    color: #94a3b8 !important;
  }

</style>
