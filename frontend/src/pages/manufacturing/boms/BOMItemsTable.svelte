<script>
  ;
import { productCategoryApi } from '../../../api/productCategoryApi.js';
import { settingsApi } from '../../../api/settingsApi.js';
import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
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
  let showDropdown = false;

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
    products = products.filter(p=>p.product_status?p.product_status == 'active':p.status == 1);
  });

  $: filteredProducts =
    search.length > 0
      ? products
          .filter(
            (p) =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              p.code?.includes(search.trim().toLowerCase()),
          )
          .slice(0, 10)
      : [];

  function selectProduct(product) {
    selectedProduct = product;
    search = product.name;
    unit_price = Number(product.buy_price) || 0;
    unit_price_currency = product.buy_currency || '';
    sell_price = Number(product.sell_price) || 0;
    sell_price_currency = product.sell_currency || '';
    unit = product.product_unit_id;
    showDropdown = false;
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

<div class="card shadow-2 mt-4">
  <div class="card-body">
    <div class="d-flex align-items-center mb-3">
      <h5>{t('BOM Items')}</h5>
    </div>
    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="row g-3 mb-4">
      <div class="col-md-6 position-relative">
        <div class="input-group input-group-sm">
          <input
            type="text"
            class="form-control form-control-sm"
            bind:value={search}
            on:focus={() => (showDropdown = true)}
            placeholder={t('Search Product...')} />
          {#if showDropdown && filteredProducts.length > 0}
            <div
              class="list-group position-absolute w-100 shadow bg-body-tertiary"
              style="top:100%; left:0; z-index:1055; max-height:250px; overflow:auto;">
              {#each filteredProducts as p}
                <button type="button" class="list-group-item list-group-item-action" on:click={() => selectProduct(p)}>
                  <div class="d-flex justify-content-between">
                    <span>{p.name}</span>
                    <small>{p.code}</small>
                  </div>
                </button>
              {/each}
            </div>
          {/if}

          <button class="btn btn-info btn-sm pt-1 px-2" type="button" on:click={() => productModal.openModal()}>
            <i class="bi bi-plus-circle"></i>
          </button>
        </div>
      </div>
      <div class="col-md-2">
        <div class="input-group input-group-sm">
          <input type="number" class="form-control form-control-sm" bind:value={quantity} min="1" />
          <span class="input-group-text">{units.find((u) => u.id === unit)?.name || t('Unit')}</span>
        </div>
      </div>

      <div class="col-md-2">
        <div class="input-group input-group-sm">
          <input type="number" class="form-control form-control-sm" bind:value={unit_price} min="0" />
          <span class="input-group-text">{t(unit_price_currency)}</span>
        </div>
      </div>

      <div class="col-md-2 d-flex align-items-end">
        <button class="btn btn-primary btn-sm w-100" on:click={addItem}>{t('Add Item')}</button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th>{t('Product')}</th>
            {#if enable_heaviness}
              <th class="text-center">{t('Heaviness')}</th>
            {/if}
            {#if enable_expiry_date}
              <th class="text-center">{t('Expiry Date')}</th>
            {/if}
            <th class="text-center">{t('Quantity')}</th>
            <th class="text-center">{t('Buy Price')}</th>
            <th class="text-center">{t('Wastage Percent')}</th>
            <th width="150" class="text-center">{t('Subtotal')}</th>
            <th width="80" class="text-center">{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {#each items as item, index}
            <tr>
              <td>{item.product_name}</td>

              <td class="text-center">
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.quantity}
                    on:input={() => recalc(index)} />

                  <span class="input-group-text"
                    >{units.find((u) => u.id === item.product_unit_id)?.name || t('Unit')}</span>
                </div>
              </td>
              <td class="text-center">
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.unit_price}
                    on:input={() => recalc(index)} />

                  <span class="input-group-text">{t(item.unit_price_currency)}</span>
                </div>
              </td>

              <td class="text-center">
                <div class="input-group input-group-sm">
                  <input
                    type="number"
                    class="form-control form-control-sm"
                    bind:value={item.wastage_percent}
                    on:input={() => recalc(index)} />
                </div>
              </td>
              <td class="fw-bold text-center">
                {#if item.unit_price_currency && currency && item.unit_price_currency !== currency}
                  {exchangeRate(item.subtotal, item.unit_price_currency, currency).toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(currency)}
                {:else}
                  {Number(item.subtotal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(item.unit_price_currency)}
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
        <span class="text-primary">{total.toFixed(2)} {t(currency)}</span>
      </h5>
    </div>
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
    
    products = products.filter(p=>p.product_status?p.product_status == 'active':p.status == 1);

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
