<script>
  import { productCategoryApi } from '../../../api/productCategoryApi.js';
  import { settingsApi } from '../../../api/settingsApi.js';
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount } from 'svelte';
  import BOMItemsTable from './BOMItemsTable.svelte';
  import BOMOperationsTable from './BOMOperationsTable.svelte';
  import ProductModal from '../../products/ProductModal.svelte';
  import { push } from 'svelte-spa-router';
  import { bomApi } from '../../../api/bomApi.js';
  import FilterSelect from '../../../components/common/FilterSelect.svelte';
  import '../manufacturing-form.css';
  import { workCenterApi } from '../../../api/workCenterApi.js';
  import { toast } from '../../../ToastUI/toast.js';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import { currencyApi } from '../../../api/currencyApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { warehouseProductApi } from '../../../api/warehouseProductApi.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let bomId = null;

  $: bomId = bomId == 0 ? null : bomId;

  let currencies = [];
  let categories = [];
  let warehouse_products = [];
  let warehouses = [];
  let units = [];
  let settings = [];
  let products = [];
  let work_centers = [];

  let productModal;

  let operations = [];

  $: quantity = form.quantity;
  $: currency = form.currency;

  let items = [];

  let form = {
    product_id: '',
    product_unit_id: '',
    quantity: '',
    bill_number: '',
    bill_date: new Date().toISOString().slice(0, 10),
    bill_status: 'draft',
    total_amount: 0,
    currency: '',
    description: '',
    status: 1,
  };

  $: if (form.product_id && products.length && !bomId) {
    const selectedProduct = products.find((p) => p.id == form.product_id);

    if (selectedProduct && form.product_unit_id !== selectedProduct.product_unit_id) {
      form.product_unit_id = selectedProduct.product_unit_id;
    }
  }

  let loading = false;

  onMount(async () => {
    work_centers = (await workCenterApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    categories = (await productCategoryApi.getAll({ status: 1 }))?.data || [];
    warehouse_products = (await warehouseProductApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1, key: 'bill_index' }))?.data || [];

    form.bill_number = settings[0]?.value;

    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;
    if (bomId) await loadBOM(bomId);
  });

  async function loadBOM(id) {
    try {
      const bom = (await bomApi.getById(Number(id)))?.data || null;
      if (!bom || bom.bill_status !== 'draft' || Number(bom.status) !== 1) {
        push('/dashboard/boms');
        return;
      }

      form = {
        product_id: bom.product_id,
        quantity: bom.quantity,
        product_unit_id: bom.product_unit_id,
        bill_number: bom.bill_number,
        bill_date: bom.bill_date,
        description: bom.description,
        total_amount: bom.total_amount,
        bill_status: bom.bill_status,
        currency: bom.currency,
        status: bom.status,
      };

      const bomItems = (bom.items || []).filter((item) => Number(item.status) === 1);
      const bomOperations = (bom.operations || []).filter((item) => Number(item.status) === 1);

      products = (await productApi.getAll({ status: 1 }))?.data || [];

      items = bomItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          sell_price: i.sell_price,
          unit_price_currency: i.currency,
          subtotal: i.subtotal,
          wastage_percent: i.wastage_percent,
        };
      });

      operations = bomOperations.map((o) => {
        const work_center = work_centers.find((wc) => wc.id === o.work_center_id);
        return {
          work_center_name: work_center?.name,
          work_center_id: o.work_center_id,
          operation_name: o.operation_name,
          sequence: o.sequence,
          setup_time: o.setup_time,
          run_time: o.run_time,
          cost_per_hour: o.cost_per_hour,
          cost_currency: o.cost_currency,
          fixed_cost: o.fixed_cost,
          labor_count: o.labor_count,
          description: o.description,
          efficiency: o.efficiency,
          setup_time_unit: o.setup_time_unit,
          run_time_unit: o.run_time_unit,
        };
      });
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to load bom. Please try again.'));
    }
  }

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }

  $: total_amount = items.reduce((s, i) => {
    if (i.unit_price_currency && form.currency && i.unit_price_currency !== form.currency) {
      return s + exchangeRate(i.subtotal, i.unit_price_currency, form.currency);
    }
    return s + i.subtotal;
  }, 0);

  async function saveBOM(confirm = false) {
    if (!form.product_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Product and at least one Item are required.'));
      return;
    }

    loading = true;

    try {
      const payload = {
        ...form,
        total_amount: total_amount,
        bill_status: confirm ? 'confirmed' : 'draft',
        items: items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          wastage_percent: item.wastage_percent,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          currency: item.unit_price_currency,
          status: 1,
        })),
        operations: operations.map((o) => ({
          work_center_id: o.work_center_id,
          operation_name: o.operation_name,
          sequence: o.sequence,
          setup_time: o.setup_time,
          run_time: o.run_time,
          cost_per_hour: o.cost_per_hour,
          cost_currency: o.cost_currency,
          fixed_cost: o.fixed_cost,
          labor_count: o.labor_count,
          description: o.description,
          efficiency: o.efficiency,
          setup_time_unit: o.setup_time_unit,
          run_time_unit: o.run_time_unit,
          status: 1,
        })),
      };

      if (Number(bomId)) {
        await bomApi.update(Number(bomId), payload);
      } else {
        await bomApi.create(payload);
        const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'bill_index' }))?.data?.[0];
        if (_indexSetting) {
          await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
        }
      }

      form.bill_status = confirm ? 'confirmed' : 'draft';
      toast.success(t('Success'), confirm ? t('BOM Confirmed.') : t('Draft Saved.'));
      resetForm();
      push('/dashboard/boms/');
    } catch (err) {
      console.error(err);
      toast.error(t('Error'), t('Failed to save bom. Please try again.'));
    }

    loading = false;
  }

  function resetForm() {
    form = {
      ...form,
      product_id: '',
      quantity: '',
      total_amount: 0,
      bill_number: '',
      product_unit_id: '',
      bill_date: new Date().toISOString().slice(0, 10),
      bill_status: 'draft',
      description: '',
      status: 1,
    };
    items = [];
  }
</script>
<div class="sale-create-page manufacturing-form" dir={t('dir')}>
  <section class="sale-section sale-details-section">
    <header class="sale-section-header">
      <div class="sale-section-heading">
        <span class="sale-section-icon" aria-hidden="true">
          <i class="bi bi-diagram-3"></i>
        </span>

        <div>
          <h2>
            {bomId ? t('Edit BOM') : t('New BOM')}
            <span class="sale-required-note"><i class="bi bi-asterisk" aria-hidden="true"></i></span>
          </h2>
        </div>
      </div>
    </header>

    <div class="sale-details-grid">
      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-box-seam" aria-hidden="true"></i>
          {t('Product')}
        </span>

        <div class="bom-product-control">
          <FilterSelect
            variant="outline"
            label={t('Product')}
            icon="bi-box-seam"
            value={form.product_id}
            options={[
              { value: '', label: t('Select Product') },
              ...products.map((p) => ({ value: p.id, label: p.name })),
            ]}
            on:change={(event) => (form.product_id = event.detail)} />

          <button
            type="button"
            class="bom-add-product"
            title={t('New Product')}
            aria-label={t('New Product')}
            on:click={() => productModal.openModal()}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-123" aria-hidden="true"></i>
          {t('Quantity')}
        </span>

        <div class="sale-quantity-control">
          <input type="text" class="form-control" id="inp_quantity" bind:value={form.quantity} />
          {#if units.find((u) => u.id == form.product_unit_id)}
            <span class="sale-quantity-suffix">
              {units.find((u) => u.id == form.product_unit_id)?.name}
            </span>
          {/if}
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-hash" aria-hidden="true"></i>
          {t('Bill #')}
        </span>

        <input readonly type="text" class="form-control" value={form.bill_number} />
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Date')}
        </span>

        <div class="input-group input-group-sm persianDatePicker">
          <input type="date" class="form-control dater1" bind:value={form.bill_date} />
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-cash-stack" aria-hidden="true"></i>
          {t('Currency')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Currency')}
          icon="bi-cash-stack"
          value={form.currency}
          options={currencies.map((c) => ({ value: c.code, label: t(c.code) }))}
          on:change={(event) => (form.currency = event.detail)} />
      </div>

      <div class="sale-field sale-field--description">
        <span class="sale-field-label">
          <i class="bi bi-card-text" aria-hidden="true"></i>
          {t('Description')}
        </span>

        <textarea class="form-control" rows="2" bind:value={form.description} placeholder={t('Description')}></textarea>
      </div>
    </div>
  </section>

  <BOMItemsTable bind:items warehouse_id={form.warehouse_id} currency={form.currency} />
  <BOMOperationsTable bind:operations bind:quantity bind:currency />

  <footer class="sale-actions">
    <div class="sale-actions__buttons">
      <button
        type="button"
        class="sale-action-button sale-action-button--draft"
        on:click={() => saveBOM(false)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-file-earmark-text" aria-hidden="true"></i>
        {/if}

        <span>{t('Save Draft')}</span>
      </button>

      <button
        type="button"
        class="sale-action-button sale-action-button--confirm"
        on:click={() => saveBOM(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm BOM')}</span>
      </button>
    </div>
  </footer>
</div>

<style>
  .bom-product-control {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .bom-product-control :global(.filter-select) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .bom-add-product {
    display: inline-grid;
    flex: 0 0 auto;
    width: 2.2rem;
    height: 2.375rem;
    place-items: center;
    border: 1px solid var(--sale-primary);
    border-radius: 0.625rem;
    background: var(--sale-primary);
    color: #ffffff;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .bom-add-product:hover {
    border-color: var(--sale-primary-dark);
    background: var(--sale-primary-dark);
    box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
  }

  .sale-quantity-control {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .sale-quantity-suffix {
    flex: 0 0 auto;
    color: #64748b;
    font-size: 0.7rem;
    font-weight: 750;
    white-space: nowrap;
  }

</style>

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

    const newProduct = products[products.length - 1];
    if (newProduct) {
      form.product_id = newProduct.id;
    }
  }} />
