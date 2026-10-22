<script>
  import { productCategoryApi } from '../../../api/productCategoryApi.js';
  import { settingsApi } from '../../../api/settingsApi.js';
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ProductModal from '../../products/ProductModal.svelte';

  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import { currencyApi } from '../../../api/currencyApi.js';
  import { warehouseApi } from '../../../api/warehouseApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { warehouseProductApi } from '../../../api/warehouseProductApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let warehouse_id = '';
  export let items = [];
  export let currency = '';

  const dispatch = createEventDispatcher();

  let products = [];
  let search = '';
  let showProductDropdown = false;
  let isProductCellEditing = false;
  let selectingProduct = false;
  let search_input = null;
  let productDropdownStyle = '';

  let quantity = 1;
  let unit_price = 0;
  let unit_price_currency = '';
  let unit = 0;
  let sell_price = 0;
  let sell_price_currency = '';
  let selectedProduct = null;

  let enable_heaviness = false;
  let enable_expiry_date = false;

  let barcodeInput = '';

  // Reference to the modal
  let productModal;

  let categories = [];
  let units = [];
  let currencies = [];
  let warehouses = [];
  let warehouse_products = [];

  async function loadAll() {
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];

    enable_heaviness =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_heaviness' }))?.data?.[0]
      )?.value == 1;
    enable_expiry_date =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_expiry_date' }))?.data?.[0]
      )?.value == 1;
  }

  onMount(async () => {
    loadAll();
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));
  });

  $: filteredProducts =
    search.trim().length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              p.code?.includes(search.trim().toLowerCase()),
          )
          .slice(0, 10)
      : products.slice(0, 10);

  function selectProduct(product) {
    selectedProduct = product;
    search = product.name;
    unit_price = Number(product.buy_price) || 0;
    unit_price_currency = product.buy_currency || '';
    sell_price = Number(product.sell_price) || 0;
    sell_price_currency = product.sell_currency || '';
    unit = product.product_unit_id;
    showProductDropdown = false;
  }

  function addItem() {
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    if (existingIndex !== -1) {
      items[existingIndex].quantity += Number(quantity);
      items[existingIndex].subtotal = items[existingIndex].quantity * items[existingIndex].unit_price;
    } else {
      items.push({
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(quantity),
        unit_price: Number(unit_price),
        unit_price_currency: unit_price_currency,
        sell_price: Number(sell_price),
        sell_price_currency: sell_price_currency,
        heaviness: Number(1),
        wastage_percent: Number(0),
        expiry_date: null,
        preUnitQuantity: Number(1),
        preUnitPrice: 0,
        subtotal: Number(quantity) * Number(unit_price),
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
    sell_price = 0;
    unit = 0;
  }

  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
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
    const product = (await productApi.getAll({ status: 1 }))?.data
      ?.find((p) => String(p.code) === String(code)) || null;
    if (!product) return;
    selectProduct(product);
    addItem();
  }

  $: total = items.reduce((s, i) => {
    /* Loaded BOM rows carry DECIMAL subtotals as strings; coerce before
       summing so two rows no longer concatenate into NaN. */
    const subtotal = Number(i.subtotal) || 0;
    if (i.unit_price_currency && currency && i.unit_price_currency !== currency) {
      return s + exchangeRate(subtotal, i.unit_price_currency, currency);
    } else {
      return s + subtotal;
    }
  }, 0);

  /* Searchable product cell — same pattern as the sale items table. */
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
    positionProductDropdown();
  }

  async function activateProductCellSearch() {
    isProductCellEditing = true;
    search = '';
    selectedProduct = null;
    showProductDropdown = true;

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

  function selectAndAddProduct(product) {
    if (!product) return;

    selectingProduct = true;

    try {
      selectProduct(product);
      addItem();
      closeProductCellSearch();
    } finally {
      selectingProduct = false;
    }
  }

  function clearItems() {
    items = [];
    dispatch('update', { items });
  }
</script>

<div class="card shadow-2 mt-4 purchase-items-card">
  <div class="card-body">
    <div class="d-flex align-items-center mb-3">
      <h5 class="mb-0 purchase-items-title">{t('BOM Items')}</h5>
    </div>

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="table-responsive sale-items-scroll-area">
      <table class="table table-hover align-middle purchase-items-table">
        <thead class="table-light">
          <tr>
            <th class="purchase-item-col-product">{t('Product')}</th>
            {#if enable_heaviness}
              <th class="text-center purchase-item-col-heaviness">{t('Heaviness')}</th>
            {/if}
            {#if enable_expiry_date}
              <th class="text-center purchase-item-col-expiry">{t('Expiry Date')}</th>
            {/if}
            <th class="text-center purchase-item-col-quantity">{t('Quantity')}</th>
            <th class="text-center purchase-item-col-price">{t('Buy Price')}</th>
            <th class="text-center purchase-item-col-wastage">{t('Wastage Percent')}</th>
            <th class="text-center purchase-item-col-subtotal">{t('Subtotal')}</th>
            <th class="text-center purchase-item-col-actions">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td class="purchase-item-product-cell purchase-item-col-product">
                <div class="purchase-item-product">
                  <span class="purchase-item-product-copy">
                    <strong class="purchase-item-product-name">{item.product_name}</strong>
                    <small>{units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</small>
                  </span>
                </div>
              </td>

              {#if enable_heaviness}
                <td class="text-center purchase-item-col-heaviness">
                  <div class="input-group input-group-sm purchase-item-cell-group">
                    <input
                      type="number"
                      class="form-control form-control-sm"
                      bind:value={item.heaviness}
                      on:input={() => recalc(index)} />
                  </div>
                </td>
              {/if}

              {#if enable_expiry_date}
                <td class="text-center purchase-item-col-expiry">
                  <input type="date" class="purchase-item-date-input" bind:value={item.expiry_date} />
                </td>
              {/if}

              <td class="text-center purchase-item-col-quantity">
                <div class="input-group input-group-sm purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)} />

                  <span class="input-group-text"
                    >{units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                </div>
              </td>

              <td class="text-center purchase-item-col-price">
                <div class="input-group input-group-sm purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.unit_price}
                    on:input={() => recalc(index)} />

                  <span class="input-group-text">{t(item.unit_price_currency)}</span>
                </div>
              </td>

              <td class="text-center purchase-item-col-wastage">
                <div class="input-group input-group-sm purchase-item-cell-group">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.wastage_percent}
                    on:input={() => recalc(index)} />
                  <span class="input-group-text">%</span>
                </div>
              </td>

              <td class="text-center purchase-item-col-subtotal">
                <div class="purchase-item-money">
                  {#if item.unit_price_currency && currency && item.unit_price_currency !== currency}
                    <strong>
                      {exchangeRate(item.subtotal, item.unit_price_currency, currency).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                    </strong>
                    <small>{t(currency)}</small>
                  {:else}
                    <strong>{Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}</strong>
                    <small>{t(item.unit_price_currency)}</small>
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
            click the Product cell, choose a product, this row becomes filled,
            and a new blank row remains below it.
          -->
          <tr class="purchase-item-search-row">
            <td
              class="purchase-item-product-cell purchase-item-col-product purchase-item-search-cell"
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
                    id="bom_items_product_search"
                    class="purchase-item-search-input"
                    bind:this={search_input}
                    bind:value={search}
                    on:click|stopPropagation
                    on:input={handleProductSearchInput}
                    on:focus={() => {
                      showProductDropdown = true;
                    }}
                    on:keydown={(event) => {
                      if (event.key === 'Enter') {
                        const match =
                          filteredProducts[0] ||
                          products.find(
                            (row) =>
                              row.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                              row.code?.includes(search.trim().toLowerCase()),
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
                    on:click|stopPropagation={() => productModal.openModal()}>
                    <i class="bi bi-plus-lg" aria-hidden="true"></i>
                  </button>

                  <span class="purchase-item-empty-product__copy">
                    <strong>{t('Select Product')}</strong>
                    <small>{t('Product')}</small>
                  </span>
                </div>
              {/if}
            </td>

            {#if enable_heaviness}
              <td class="text-center purchase-item-col-heaviness"></td>
            {/if}
            {#if enable_expiry_date}
              <td class="text-center purchase-item-col-expiry"></td>
            {/if}
            <td class="text-center purchase-item-col-quantity"></td>
            <td class="text-center purchase-item-col-price"></td>
            <td class="text-center purchase-item-col-wastage"></td>
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

          <small>{t(currency || 'AFN')}</small>
        </div>
      </footer>
    {/if}
  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="purchase"
  warehouse_id=""
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];

    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));

    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        quantity: 1,
        heaviness: 1,
        wastage_percent: Number(0),
        expiry_date: null,
        preUnitQuantity: 1,
        preUnitPrice: 0,
        unit_price: Number(newProduct.buy_price) || 0,
        unit_price_currency: newProduct.buy_currency || '',
        sell_price: Number(newProduct.sell_price) || 0,
        sell_price_currency: newProduct.sell_currency || '',
        subtotal: Number(newProduct.buy_price) || 0,
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />

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

  /* BOM Items heading — same visual language as the Sale Items card. */
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
   * Inactive Product cell.
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
   * Active search uses the cell itself. There is no bordered search-bar box.
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
   */
  /*
   * Keep ONE table grid: the wrapper is the only scroll container and the
   * header sticks inside it. Splitting into a separate <thead> table and a
   * scrolling block <tbody> made every body row re-derive its own column
   * widths on a narrower box, so the columns drifted away from their headers.
   */
  .purchase-items-card :global(.table-responsive),
  .purchase-items-card :global(.sale-items-scroll-area) {
    width: 100%;
    max-width: 100%;
    min-height: 0;
    height: auto;
    max-height: calc(2.875rem + 21.25rem + 4.25rem);

    overflow-x: auto !important;
    overflow-y: auto !important;

    border: 0;
    background: #ffffff;

    overscroll-behavior: auto;

    scrollbar-width: thin;
    scrollbar-color: #b9c5d5 transparent;
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
    min-width: 46rem;
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

  .purchase-item-col-product {
    width: 30%;
    min-width: 13rem;
  }

  .purchase-item-col-heaviness {
    width: 8%;
    min-width: 6rem;
    white-space: nowrap;
  }

  .purchase-item-col-expiry {
    width: 10%;
    min-width: 7.5rem;
    white-space: nowrap;
  }

  .purchase-item-col-quantity {
    width: 12%;
    min-width: 8rem;
    white-space: nowrap;
  }

  .purchase-item-col-price {
    width: 12%;
    min-width: 8rem;
    white-space: nowrap;
  }

  .purchase-item-col-wastage {
    width: 10%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-subtotal {
    width: 10%;
    min-width: 7rem;
    white-space: nowrap;
  }

  .purchase-item-col-actions {
    width: 5%;
    min-width: 4rem;
    white-space: nowrap;
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

  .purchase-item-date-input {
    width: min(100%, 8.5rem);
    min-height: 2.25rem;
    padding: 0 0.55rem;
    border: 1px solid #dbe3ee;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #26364b;
    font-size: 0.68rem;
    font-weight: 800;
    text-align: center;
    cursor: pointer;
  }

  .purchase-item-date-input:focus {
    border-color: #78a4f5;
    outline: 0;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.08);
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
      max-height: calc(2.875rem + 17rem + 4.25rem);
      overflow-y: auto !important;
    }

    .purchase-items-total-row {
      padding-inline: 0.8rem;
    }
  }

  /* Product search results */
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

  #bom_items_product_search:disabled {
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

  :global(html.dark) .purchase-items-table .purchase-item-cell-group,
  :global(html.dark) .purchase-item-date-input {
    border-color: var(--sale-border);
    background: var(--erp-surface-soft, #172033);
  }

  :global(html.dark) .purchase-items-table .purchase-item-cell-group :global(.form-control),
  :global(html.dark) .purchase-item-date-input {
    color: var(--sale-text);
  }

  :global(html.dark) .purchase-items-table .purchase-item-cell-group :global(.input-group-text) {
    border-color: var(--sale-border) !important;
    background: #202b3d !important;
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

  :global(html.dark) #bom_items_product_search:disabled {
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
</style>
