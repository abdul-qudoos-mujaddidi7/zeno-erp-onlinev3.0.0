<script>
  import { productCategoryApi } from '../../../api/productCategoryApi.js';
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ProductModal from '../../products/ProductModal.svelte';
  import Swal from 'sweetalert2';

  import { t, lang, translate_org_type, settings_all } from '../../../i18n/i18n.js';
  import { currencyApi } from '../../../api/currencyApi.js';
  import { warehouseApi } from '../../../api/warehouseApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { warehouseProductApi } from '../../../api/warehouseProductApi.js';
  import FilterSelect from '../../../components/common/FilterSelect.svelte';
  import '../production-ledger.css';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let items = [];
  export let currency = '';
  export let warehouse_id = '';

  $: enable_stock_minus = $settings_all.find((s) => s.key === 'enable_stock_minus')?.value == 1;

  const dispatch = createEventDispatcher();

  let products = [];
  let search = '';

  let quantity = 1;
  let unit_price = 0;
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

  let search_input = null;
  let showProductDropdown = false;
  let productDropdownStyle = '';
  let isProductCellEditing = false;
  let selectingProduct = false;
  let productSearchTimer;

  async function loadAll() {
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
  }

  onMount(async () => {
    loadAll();

    products = (await productApi.getAll({ status: 1 }))?.data || [];
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));
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

  $: filteredProducts = products
    .filter((p) => {
      if (!search.trim()) return true;

      const term = search.trim().toLowerCase();

      return p.name?.toLowerCase().includes(term) || p.code?.includes(term);
    })
    .slice(0, 12);

  function selectProduct(product) {
    selectedProduct = product;
    const unitHierarchy = getUnitHierarchy(product.product_unit_id);
    search = product.name;
    unit_price = Number(product.sell_price) || 0;
    selectedProduct.availableUnits = unitHierarchy;
    stock = getProductStock(product.id);
  }

  function addItem() {
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => Number(i.product_id) === Number(selectedProduct.id));

    if (existingIndex !== -1) {
      items[existingIndex].quantity += Number(quantity);
      items[existingIndex].subtotal = items[existingIndex].quantity * items[existingIndex].calculated_price;
    } else {
      items.push({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(quantity),
        planned_quantity: Number(quantity),
        unit_price: Number(unit_price),
        calculated_price: Number(unit_price),
        currency: selectedProduct.sell_currency || currency,
        subtotal: Number(quantity) * Number(unit_price),
        availableUnits: selectedProduct.availableUnits,
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

  function getProductStock(productId) {
    const rows = warehouse_products.filter(
      (wp) => Number(wp.product_id) === Number(productId) && Number(wp.warehouse_id) === Number(warehouse_id),
    );

    return rows.reduce(
      (sum, wp) =>
        sum +
        Number(
          wp.quantity ?? wp.current_quantity ?? wp.available_quantity ?? wp.stock ?? 0,
        ),
      0,
    );
  }

  function getCalculatedStock(item) {
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;
    return Math.floor(getProductStock(item.product_id) / multiplier);
  }

  function recalc(index) {
    const item = items[index];
    if (!item) return;

    // Find the selected unit
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;

    // Get stock in the warehouse adjusted for selected unit
    let stockAvailable = Math.floor(getProductStock(item.product_id) / multiplier);

    // Adjust quantity if it exceeds available stock
    if (!enable_stock_minus && stockAvailable < item.quantity) {
      item.quantity = stockAvailable;
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
    const product =
      products.find(
        (item) =>
          String(item.code) === String(code) &&
          (item.product_status ? item.product_status === 'active' : Number(item.status) === 1),
      ) || null;
    if (!product) return;
    selectProduct(product);
    addItem();
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

  $: total = items.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency) {
      return s + exchangeRate(i.subtotal, i.currency, currency);
    }

    return s + Number(i.subtotal || 0);
  }, 0);

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function positionProductDropdown() {
    if (!search_input) return;

    const rect = search_input.getBoundingClientRect();
    const availableHeight = Math.max(90, window.innerHeight - rect.bottom - 12);
    const maxHeight = Math.min(250, availableHeight);

    productDropdownStyle =
      `position:fixed;` +
      `left:${rect.left}px;` +
      `width:${Math.max(rect.width, 260)}px;` +
      `top:${rect.bottom + 5}px;` +
      `bottom:auto;` +
      `max-height:${maxHeight}px;` +
      `overflow:auto;` +
      `z-index:100000;`;
  }

  $: if (showProductDropdown) {
    tick().then(positionProductDropdown);
  }

  function handleProductSearchInput() {
    showProductDropdown = true;

    clearTimeout(productSearchTimer);
    productSearchTimer = setTimeout(async () => {
      if (!products.length) {
        products = (await productApi.getAll({ status: 1 }))?.data || [];
      }

      if (showProductDropdown) positionProductDropdown();
    }, 250);
  }

  async function activateProductCellSearch() {
    isProductCellEditing = true;
    search = '';
    selectedProduct = null;
    showProductDropdown = true;

    if (!products.length) {
      products = (await productApi.getAll({ status: 1 }))?.data || [];
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

  async function selectAndAddProduct(product) {
    if (!product) return;

    selectingProduct = true;

    try {
      if (!warehouse_id) {
        Swal.fire({
          icon: 'warning',
          title: t('Warehouse'),
          text: t('Please select a warehouse first.'),
        });
        return;
      }

      selectProduct(product);

      if (!enable_stock_minus && stock <= 0) {
        Swal.fire({
          icon: 'error',
          title: t('Out of Stock'),
          text: t('Product is out of stock in the selected warehouse.'),
        });
        return;
      }

      addItem();
      showProductDropdown = false;
      isProductCellEditing = false;
    } finally {
      selectingProduct = false;
    }
  }

  async function openCreateProductModal() {
    productModal?.openModal();
  }
</script>

<div class="card shadow-2 production-ledger-card">
  <header class="production-ledger-header">
    <h5 class="production-ledger-title">
      <span class="production-ledger-icon" aria-hidden="true"><i class="bi bi-box-seam"></i></span>
      {t('Production Materials')}
    </h5>
  </header>

  <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

  <div class="production-ledger-scroll">
    <table class="table table-hover align-middle production-ledger-table">
      <thead>
        <tr>
          <th class="production-ledger-col-product">{t('Product')}</th>
          <th class="production-ledger-col-planned text-center">{t('Planned Quantity')}</th>
          <th class="production-ledger-col-quantity text-center">{t('Quantity')}</th>
          <th class="production-ledger-col-price text-center">{t('Cost Price')}</th>
          <th class="production-ledger-col-subtotal text-center">{t('Subtotal')}</th>
          <th class="production-ledger-col-actions text-center">{t('Actions')}</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item, index}
          <tr>
            <td class="production-ledger-product-cell">
              <div class="production-ledger-product">
                <span class="production-ledger-product-copy">
                  <strong class="production-ledger-product-name">{item.product_name}</strong>
                  <small>
                    {t('Present in Warehouse')}:
                    {Number(getCalculatedStock(item) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                    {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
                  </small>
                </span>
              </div>
            </td>

            <td class="production-ledger-col-planned text-center">
              <span class="production-ledger-readonly">
                {Number(item.planned_quantity || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}
              </span>
            </td>

            <td class="production-ledger-col-quantity text-center">
              <div class="input-group input-group-sm production-ledger-cell-group">
                <input
                  type="number"
                  class="form-control form-control-sm"
                  bind:value={item.quantity}
                  on:input={() => recalc(index)} />
                {#if item.availableUnits?.length > 1}
                  <FilterSelect
                    compact
                    value={item.product_unit_id}
                    label={t('Unit')}
                    options={item.availableUnits.map((u) => ({ value: u.id, label: u.name }))}
                    on:change={(event) => changeUnit(item, event.detail)} />
                {:else}
                  <span class="input-group-text">
                    {item.availableUnits?.[0]?.name ||
                      units.find((u) => u.id === item.product_unit_id)?.name ||
                      t('Unit')}
                  </span>
                {/if}
              </div>
            </td>

            <td class="production-ledger-col-price text-center">
              <div class="input-group input-group-sm production-ledger-cell-group">
                <input
                  type="number"
                  class="form-control form-control-sm"
                  bind:value={item.calculated_price}
                  on:input={() => recalc(index)} />
                <span class="input-group-text">{t(item.currency)}</span>
              </div>
            </td>

            <td class="production-ledger-col-subtotal text-center">
              <div class="production-ledger-money">
                {#if item.currency != currency}
                  <strong>
                    {Number(exchangeRate(item.subtotal, item.currency, currency) || 0).toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                  </strong>
                  <small>{t(currency)}</small>
                {:else}
                  <strong>
                    {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </strong>
                  <small>{t(item.currency)}</small>
                {/if}
              </div>
            </td>

            <td class="production-ledger-col-actions production-ledger-actions-cell">
              <button
                type="button"
                class="btn btn-sm production-ledger-row-button production-ledger-row-button--danger"
                title={t('Delete')}
                aria-label={t('Delete')}
                on:click={() => removeItem(index)}>
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </td>
          </tr>
        {/each}

        <!--
          Permanent blank row: click the Product cell, pick a product,
          the row becomes filled and a new blank row stays below.
        -->
        <tr class="production-ledger-search-row">
          <td
            class="production-ledger-product-cell production-ledger-search-cell"
            class:production-ledger-search-cell--editing={isProductCellEditing}
            role="button"
            tabindex="0"
            aria-label={t('Select Product')}
            on:click={() => {
              if (!isProductCellEditing) activateProductCellSearch();
            }}
            on:keydown={(event) => {
              if (!isProductCellEditing && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                activateProductCellSearch();
              }
            }}>
            {#if isProductCellEditing}
              <div class="production-ledger-inline-search">
                <span class="production-ledger-search-icon" aria-hidden="true">
                  <i class="bi bi-search"></i>
                </span>

                <input
                  type="text"
                  class="production-ledger-search-input"
                  bind:this={search_input}
                  bind:value={search}
                  on:click|stopPropagation
                  on:input={handleProductSearchInput}
                  on:focus={() => {
                    showProductDropdown = true;
                    positionProductDropdown();
                  }}
                  on:keydown={(event) => {
                    if (event.key === 'Enter') {
                      const match = filteredProducts[0];

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
                  <div use:portal class="list-group shadow production-ledger-dropdown" style={productDropdownStyle}>
                    {#each filteredProducts as prod (prod.id)}
                      <button
                        type="button"
                        class="list-group-item list-group-item-action"
                        on:mousedown|preventDefault={() => selectAndAddProduct(prod)}>
                        <div class="production-ledger-option">
                          <span class="production-ledger-option__copy">
                            <strong>{prod.name}</strong>
                            <small>
                              {categories.find((category) => category.id === prod.category_id)?.name || t('Category')}
                            </small>
                          </span>

                          <span class="production-ledger-option__stock" title={t('Present in Warehouse')}>
                            <i class="bi bi-box-seam" aria-hidden="true"></i>
                            <strong dir="ltr">
                              {Number(getProductStock(prod.id) || 0).toLocaleString(undefined, {
                                maximumFractionDigits: 3,
                              })}
                            </strong>
                            <small>
                              {units.find((item) => item.id === prod.product_unit_id)?.name || t('Unit')}
                            </small>
                          </span>
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <div class="production-ledger-empty-product">
                <button
                  type="button"
                  class="production-ledger-empty-product__icon"
                  title={t('New Product')}
                  aria-label={t('New Product')}
                  on:click|stopPropagation={openCreateProductModal}>
                  <i class="bi bi-plus-lg" aria-hidden="true"></i>
                </button>

                <span class="production-ledger-empty-product__copy">
                  <strong>{t('Select Product')}</strong>
                  <small>{t('Product')}</small>
                </span>
              </div>
            {/if}
          </td>

          <td class="production-ledger-col-planned"></td>
          <td class="production-ledger-col-quantity"></td>
          <td class="production-ledger-col-price"></td>
          <td class="production-ledger-col-subtotal"></td>
          <td class="production-ledger-col-actions"></td>
        </tr>
      </tbody>
    </table>
  </div>

  {#if items.length > 0}
    <footer class="production-ledger-footer">
      <button type="button" class="production-ledger-clear" on:click={clearItems}>
        <i class="bi bi-trash3" aria-hidden="true"></i>
        <span>{t('Clear All')}</span>
      </button>

      <div class="production-ledger-total">
        <span>{t('Total')}{t('-of-')}{t('Production Materials')}</span>

        <strong dir="ltr">
          {Number(total || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
        </strong>

        <small>{t(currency)}</small>
      </div>
    </footer>
  {/if}
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="production"
  {warehouse_id}
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        currency: newProduct.sell_currency || currency,
        quantity: 1,
        planned_quantity: 1,
        unit_price: Number(newProduct.sell_price) || 0,
        calculated_price: Number(newProduct.sell_price) || 0,
        subtotal: Number(newProduct.sell_price) || 0,
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />
