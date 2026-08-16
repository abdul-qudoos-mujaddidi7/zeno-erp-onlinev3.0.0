<script>
  ;
import { productCategoryApi } from '../../../api/productCategoryApi.js';
import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import ProductModal from '../../products/ProductModal.svelte';
  import Swal from 'sweetalert2';

  import { toast } from '../../../ToastUI/toast.js';
  import { t, lang, translate_org_type,settings_all } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { time_units } from '../../../time.js';
import { currencyApi } from '../../../api/currencyApi.js';
import { warehouseApi } from '../../../api/warehouseApi.js';
import { productApi } from '../../../api/productApi.js';
import { warehouseProductApi } from '../../../api/warehouseProductApi.js';

  export let items = [];
  export let currency = '';
  export let warehouse_id = '';
  export let doctor_id = '';

  $: enable_stock_minus = $settings_all.find((s) => s.key === 'enable_stock_minus')?.value == 1;
  $: enable_duplicate_product = $settings_all.find((s) => s.key === 'enable_duplicate_product')?.value == 1;

  $: bill_max_items = $settings_all.find((s) => s.key === 'bill_max_items')?.value || 100;

  const dispatch = createEventDispatcher();

  let products = [];
  let search = '';
  let showDropdown = false;

  let quantity = 1;
  let unit_price = 0;
  let unit_currency = '';
  let unit = 0;

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

  function addItem(selectedProduct) {
    if (items.length >= bill_max_items) {
      toast.warning(t('Maximum Items Reached'),t('You have added more than '+bill_max_items+' items to the bill.'));
      // return;
    }
    if (!selectedProduct) return;

    const existingIndex = items.findIndex((i) => i.product_id === selectedProduct.id);

    const unitHierarchy = getUnitHierarchy(selectedProduct.product_unit_id);
    selectedProduct.availableUnits = unitHierarchy;

    if (existingIndex !== -1 && !enable_duplicate_product) {
      items[existingIndex].quantity += Number(quantity);
    } else {
      items.push({
        type: selectedProduct.type||'good',
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_unit_id: selectedProduct.product_unit_id,
        quantity: Number(1),
        availableUnits: selectedProduct.availableUnits,
        dosage: '',
        dosage_unit: '',
        frequency: '',
        duration: '',
        duration_unit: 'day',
        route: '',
        instructions: '',
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
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
      
    }, 100);
  }
  function removeItem(index) {
    items.splice(index, 1);
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
    addItem(product);
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
  

  function getProductStock(productId) {
    return (
      warehouse_products.find((wp) => wp.product_id === productId && wp.warehouse_id === warehouse_id)?.quantity || 0
    );
  }
</script>

<div class="card shadow-2 mt-4">
  <div class="card-body">
  <div class="input-group input-group-sm float-end mb-3" style="width:350px;">
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
                <button type="button" class="list-group-item list-group-item-action" on:click={() => addItem(p)}>
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
    <h5 class="mb-4">{t('Prescription Items')}</h5>

    <input type="text" class="position-absolute opacity-0" bind:value={barcodeInput} on:keydown={handleBarcode} />

    <div class="table-responsive">
      <table class="table table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>{t('Product')}</th>
            <th width="200" class="text-center">{t('Quantity')}</th>
            <th class="text-center">{t('Dosage')}</th>
            <th class="text-center">{t('Frequency')}</th>
            <th class="text-center">{t('Duration')}</th>
            <th class="text-center">{t('Instructions')}</th>
            <th class="text-center">{t('Actions')}</th>
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
                    bind:value={item.quantity} />
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
              <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="text"
                    id="inp_dosage"
                    class="form-control form-control-sm"
                    bind:value={item.dosage} />
                  <label class="form-label" for="inp_dosage">{t('Dosage')}</label>
                </div>
                <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="text"
                    id="inp_dosage_unit"
                    class="form-control form-control-sm"
                    bind:value={item.dosage_unit} />
                  <label class="form-label" for="inp_dosage_unit">{t('Unit')}</label>
                </div>
              </div>
              
              
              </td>
              <td><input type="text" class="form-control form-control-sm" bind:value={item.frequency} /></td>
              <td>
              <div class="input-group input-group-sm">
                <div class="form-outline flex-grow-1" data-mdb-input-init>
                  <input
                    type="text"
                    id="inp_duration"
                    class="form-control form-control-sm"
                    bind:value={item.duration} />
                  <label class="form-label" for="inp_duration">{t('Duration')}</label>
                </div>
                <button
                  id="showCategoryDropdown"
                  class="btn btn-info btn-sm dropdown-toggle p-2"
                  type="button"
                  data-mdb-toggle="dropdown"
                  aria-expanded="false">
                  {item.duration_unit
                    ? t(time_units.find((c) => c == item.duration_unit))
                    : t('Select Time Unit')}
                </button>

                <ul class="dropdown-menu dropdown-menu-end" style="max-height: 200px;overflow-y: auto;">
                  {#each time_units as tu}
                    <li>
                      <button
                        class="dropdown-item {item.duration_unit == tu ? 'bg-info text-white' : ''}"
                        on:click={() => (item.duration_unit = tu)}
                        type="button">
                        {t(tu)}
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
              
              </td>
              <td><input type="text" class="form-control form-control-sm" bind:value={item.instructions} /></td>
              <td class="text-center"
                ><button class="btn btn-sm btn-outline-danger" on:click={() => removeItem(index)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  </div>
</div>

<ProductModal
  bind:this={productModal}
  {categories}
  {units}
  {warehouses}
  type="prescription"
  {warehouse_id}
  defaultCurrency="AFN"
  {warehouse_products}
  on:saved={async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    const newProduct = products[products.length - 1];
    if (newProduct) {
      items.push({
        type:newProduct.type||'good',
        product_id: newProduct.id,
        product_name: newProduct.name,
        product_unit_id: newProduct.product_unit_id,
        quantity: 1,
        dosage: '',
        dosage_unit: '',
        frequency: '',
        duration: '',
        duration_unit: 'day',
        route: '',
        instructions: '',
      });
      items = [...items];
      dispatch('update', { items });
    }
  }} />
