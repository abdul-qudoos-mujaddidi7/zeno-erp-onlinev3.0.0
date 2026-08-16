<script>
import { productCategoryApi } from '../../api/productCategoryApi.js';
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import ProductModal from '../products/ProductModal.svelte';
  import Swal from 'sweetalert2';

  import { toast } from '../../ToastUI/toast.js';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n.js';
import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { productApi } from '../../api/productApi.js';
import { warehouseProductApi } from '../../api/warehouseProductApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let items = [];
  export let currency = '';
  export let warehouse_id = '';
  export let selected_account_id = '';

  $: enable_stock_minus = true;
  $: enable_duplicate_product = $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;
  $: enable_show_buy_price = $settings_all.find((s) => s.key === 'enable_show_buy_price')?.value == 1;
  $: enable_show_latest_inventory_record_price = $settings_all.find((s) => s.key === 'enable_show_latest_inventory_record_price')?.value == 1;
  $: enable_show_buy_price_and_latest_inventory_record_price_in_item =
    $settings_all.find((s) => s.key === 'enable_show_buy_price_and_latest_inventory_record_price_in_item')?.value == 1;

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

    filteredProducts = products;
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

  async function findLatestInventoryRecordsPrice(productId) {
    const customerInventoryRecords = ((await inventoryRecordApi.getAll({
      status: 1,
      account_id: selected_account_id,
    }))?.data || []).sort(
      (a, b) => new Date(b.record_date || b.created_at) - new Date(a.record_date || a.created_at),
    );

    for (const inventory_record of customerInventoryRecords) {
      if (inventory_record.status !== 1) continue;

      const inventory_recordResponse = await inventoryRecordApi.getById(inventory_record.id);
      const item = ((inventory_recordResponse?.data?.items) || []).find(
        (i) => Number(i.product_id) === Number(productId) && Number(i.status) === 1,
      );

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

  function selectProduct(product) {
    selectedProduct = product;
    const unitHierarchy = getUnitHierarchy(product.product_unit_id);
    search = product.name;
    unit_price = Number(product.sell_price) || 0;
    unit_currency = product.sell_currency || currency;
    unit = product.product_unit_id;
    showDropdown = false;
    selectedProduct.availableUnits = unitHierarchy;
    console.log('Calculating stock for product', product.id, 'in warehouse', warehouse_id);
    stock =
      warehouse_products.find((wp) => wp.product_id === product.id && wp.warehouse_id === warehouse_id)?.quantity || 0;
    if (enable_show_latest_inventory_record_price) {
      latestPrice = null;
      findLatestInventoryRecordsPrice(product.id);
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
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    if (existingIndex !== -1 && !enable_duplicate_product) {
      items[existingIndex].quantity += Number(quantity);
      items[existingIndex].subtotal = items[existingIndex].quantity * items[existingIndex].unit_price;
    } else {
      items.push({
        type: selectedProduct.type || 'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(quantity),
        unit_price: Number(unit_price),
        latestPrice: latestPrice,
        buy_price: selectedProduct.buy_price,
        buy_price_currency: selectedProduct.buy_currency || currency,
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
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
      }
    }, 100);
  }
  function removeItem(index) {
    items.splice(index, 1);
    items = [...items];
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
        (getProductStock(item.product_id) - totalQuantity) /
          (item.availableUnits?.find((u) => u.id === item.product_unit_id)?.multiplier || 1),
      );
    }
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;
    return Math.floor(getProductStock(item.product_id) / multiplier);
  }

  function recalc(index) {
    const item = items[index];

    // Find the selected unit
    const selectedUnit = item.availableUnits?.find((u) => u.id === item.product_unit_id);
    const multiplier = selectedUnit?.multiplier || 1;

    // Get stock in the warehouse adjusted for selected unit
    let stock = Math.floor(getProductStock(item.product_id) / multiplier);

    // Adjust quantity if it exceeds available stock

    if (enable_duplicate_product) {
      const totalQuantity = items
        .filter((i) => i.product_id === item.product_id)
        .reduce((sum, i) => {
          const selectedUnit = i.availableUnits?.find((u) => u.id === i.product_unit_id);
          const multiplier = selectedUnit?.multiplier || 1;
          return sum + i.quantity * multiplier;
        }, 0);
      stock = Math.floor((getProductStock(item.product_id) - totalQuantity + item.quantity * multiplier) / multiplier);
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
    const product = (await productApi.getAll({ status: 1 }))?.data
      ?.find((p) => String(p.code) === String(code) && (p.product_status ? p.product_status == 'active' : true)) || null;
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
      let exchangeRateValue = exchangeRate(i.subtotal, i.currency, currency);
      console.log(
        `Converting ${i.subtotal} from ${i.currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.subtotal;
    }
  }, 0);

  function getProductStock(productId) {
    return (
      warehouse_products.find((wp) => wp.product_id === productId && wp.warehouse_id === warehouse_id)?.quantity || 0
    );
  }

  let search_input = null;

  let showProductDropdown = false;
</script>

<div class="card shadow-2 mt-4">
  <div class="card-body">
    <h5 class="mb-4">
      {t('Inventory Record Items')}
    </h5>

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="row g-3 mb-4">
      <div class="col-md-6 position-relative">
        <div class="position-relative">
          <div class="input-group input-group-sm w-100">
            {#if selectedProduct}
              <span class="input-group-text badge-success w-100 fw-bold">
                {selectedProduct.name}
              </span>
              <button
                class="btn btn-danger btn-sm pt-1"
                on:click={async () => {
                  search = '';
                  selectedProduct = null;
                  filteredProducts = products;
                  showProductDropdown = true;
                  await tick(); // wait for DOM to update

                  search_input?.focus();
                  if (window.mdb) {
                    document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                  }
                }}>
                <i class="bi bi-search"></i>
              </button>
            {:else}
              <div class="form-outline" data-mdb-input-init>
                <input
                  type="text"
                  class="form-control form-control-sm"
                  id="form_product_search"
                  bind:this={search_input}
                  bind:value={search}
                  on:input={() => {
                    showProductDropdown = true;
                    filteredProducts = products.filter((prod) => {
                      const name = prod.name || '';
                      const code = prod.code || '';
                      return (
                        name.toLowerCase().includes(search.trim().toLowerCase()) ||
                        code.toLowerCase().includes(search.trim().toLowerCase())
                      );
                    });
                  }}
                  on:focus={() => {
                    showProductDropdown = true;
                    if (search.trim()) {
                      filteredProducts = products.filter((prod) => {
                        const name = prod.name || '';
                        const code = prod.code || '';
                        return (
                          name.toLowerCase().includes(search.trim().toLowerCase()) ||
                          code.toLowerCase().includes(search.trim().toLowerCase())
                        );
                      });
                    } else {
                      filteredProducts = products;
                    }
                  }}
                  on:blur={() => setTimeout(() => (showProductDropdown = false), 150)}
                  autocomplete="off" />
                <label class="form-label" for="form_product_search">{t('Select Product')}</label>
              </div>
              <button
                class="btn btn-info btn-sm pt-1"
                on:click={() => {
                  productModal.openModal();
                }}>
                <i class="bi bi-plus-circle"></i>
              </button>
            {/if}
          </div>
          {#if showProductDropdown && filteredProducts.length > 0}
            <ul class="list-group position-absolute w-100 z-3" style="max-height:180px;overflow:auto;">
              {#each filteredProducts as prod}
                <li
                  class="list-group-item list-group-item-action bg-body small px-2 py-1"
                  style="cursor:pointer"
                  on:mousedown={() => {
                    selectProduct(prod);
                    search = '';
                    showProductDropdown = false;
                    setTimeout(() => {
                      if (window.mdb) {
                        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => new window.mdb.Input(el));
                      }
                    }, 100);
                  }}>
                  <span class="badge badge-primary ms-2 float-end">
                    {categories.find((c) => c.id === prod.category_id)?.name || t('Category')}
                  </span>
                  {prod.name}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        {#if selectedProduct}
          <div class="form-text">
            {#if enable_show_buy_price}
              {t('Buy Price')}: {selectedProduct.buy_price
                ? Number(selectedProduct.buy_price).toLocaleString(undefined, { maximumFractionDigits: 3 })
                : 0}
              {t(selectedProduct.buy_currency)}
            {/if}
            {#if enable_show_latest_inventory_record_price && latestPrice}
              | {t('Last Sold Price')}: {Number(latestPrice.price || 0).toLocaleString(undefined, {
                maximumFractionDigits: 3,
              })}
              {t(latestPrice.currency)}
            {/if}
          </div>
        {/if}
      </div>

      <div class="col-md-2">
        <div class="input-group input-group-sm">
          <input
            type="number"
            class="form-control form-control-sm"
            bind:value={quantity}
            on:input={() => {
              // if (quantity < 1) quantity = 1;
              if (!enable_stock_minus && quantity > stock && selectedProduct?.type !== 'service') quantity = stock;
            }}
            min="1" />
          <span class="input-group-text">{units.find((u) => u.id === unit)?.name || t('Unit')}</span>
        </div>
       
      </div>

      <div class="col-md-2">
        <div class="input-group input-group-sm">
          <input type="number" class="form-control form-control-sm" bind:value={unit_price} min="0" />
          <span class="input-group-text">{t(unit_currency)}</span>
        </div>
      </div>

      <div class="col-md-2">
        <button
          class="btn btn-primary btn-sm w-100"
          on:click={() => {
            if (quantity <= 0) {
              toast.error(t('Quantity must be greater than zero'));
              return;
            }
            if (enable_stock_minus || stock > 0 || selectedProduct?.type === 'service') {
              addItem();
            } else {
              Swal.fire({
                icon: 'error',
                title: t('Out of Stock'),
                text: t('Product is out of stock in the selected warehouse.'),
              });
            }
          }}>{t('Add Item')}</button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>{t('Product')}</th>
            <th width="200" class="text-center">{t('Quantity')}</th>
            <th width="180" class="text-center">{t('Unit Price')}</th>
            <th width="150" class="text-center">{t('Subtotal')}</th>
            <th width="80" class="text-center">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td>{index + 1}</td>
              <td>{item.product_name}</td>
              <td>
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)} />
                  {#if item.availableUnits?.length > 1}
                    <select
                      class="form-select form-select-sm"
                      bind:value={item.product_unit_id}
                      on:change={(e) => changeUnit(item, e.target.value)}>
                      {#each item.availableUnits as u}
                        <option value={u.id}>{u.name}</option>
                      {/each}
                    </select>
                  {:else}
                    <span class="badge bg-body-tertiary text-dark border">
                      {item.availableUnits?.[0]?.name}
                    </span>
                  {/if}
                </div>
              
              </td>
              <td>
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.calculated_price}
                    on:input={() => recalc(index)} />
                  <span class="input-group-text">{t(item.currency)}</span>
                </div>
                {#if enable_show_buy_price_and_latest_inventory_record_price_in_item}
                  <div class="form-text mt-0" style="font-size:8pt">
                    {#if enable_show_buy_price}
                      {t('Buy Price')}: {Number(item.buy_price || 0).toLocaleString(undefined, {
                        maximumFractionDigits: 3,
                      })}
                      {t(item.buy_price_currency)}
                    {/if}
                    {#if enable_show_latest_inventory_record_price && item.latestPrice}
                      <br />
                      {t('Last Sold Price')}:
                      <button
                        class="btn btn-link p-0"
                        on:click={() => {
                          item.calculated_price = Number(item.latestPrice.price || 0);
                          item.currency = item.latestPrice.currency;
                          recalc(index);
                        }}
                        style="font-size:8pt">
                        {Number(item.latestPrice.price || 0).toLocaleString(undefined, {
                          maximumFractionDigits: 3,
                        })}
                        {t(item.latestPrice.currency)}
                      </button>
                    {/if}
                  </div>
                {/if}
              </td>
              <td class="fw-bold text-center">
                {#if item.currency != currency}
                  {exchangeRate(item.subtotal, item.currency, currency).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(currency)}
                {:else}{Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(item.currency)}
                {/if}
              </td>
              <td class="text-center"
                ><button class="btn btn-sm btn-outline-danger" on:click={() => removeItem(index)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="text-end mt-3">
      <h5>
        {t('Total')}:
        <span class="text-primary">{total.toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency)}</span>
      </h5>
    </div>
  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="inventory_record"
  {warehouse_id}
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    products = products.filter((p) => (p.product_status ? p.product_status == 'active' : p.status == 1));
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        type: newProduct.type || 'good',
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        currency: newProduct.sell_currency || currency,
        quantity: 1,
        latestPrice: null,
        buy_price: newProduct.buy_price,
        buy_price_currency: newProduct.buy_currency || currency,
        unit_price: Number(newProduct.sell_price) || 0,
        calculated_price: Number(newProduct.sell_price) || 0,
        subtotal: Number(newProduct.sell_price) || 0,
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />
