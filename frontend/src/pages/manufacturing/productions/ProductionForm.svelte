<script>
  import { productUnitApi } from '../../../api/productUnitApi.js';
  import { settingsApi } from '../../../api/settingsApi.js';
  import { onMount } from 'svelte';
  import ProductionItemsTable from './ProductionItemsTable.svelte';
  import AccountModal from '../../accounts/AccountModal.svelte';
  import Swal from 'sweetalert2';
  import { toast } from '../../../ToastUI/toast.js';
  import { push } from 'svelte-spa-router';
  import AccountView from '../../accounts/AccountView.svelte';
  import { convertTime } from '../../../time.js';
  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { setDatePickers } from '../../../calendar.js';
  import ProductionOperationsTable from './ProductionOperationsTable.svelte';
  import { currencyApi } from '../../../api/currencyApi.js';
  import { warehouseApi } from '../../../api/warehouseApi.js';
  import { accountApi } from '../../../api/accountApi.js';
  import { productApi } from '../../../api/productApi.js';
  import { accountTypeApi } from '../../../api/accountTypeApi.js';
  import { productionApi } from '../../../api/productionApi.js';
  import FilterSelect from '../../../components/common/FilterSelect.svelte';
  import '../manufacturing-form.css';
  import { bomApi } from '../../../api/bomApi.js';

  let productModalRef;

  export let productionId = null;

  $: productionId = productionId == 0 ? null : productionId;

  let showAccountModal = false;

  let units = [];
  let boms = [];
  let warehouses = [];
  let customers = [];
  let products = [];
  let currencies = [];
  let accountTypes = [];
  let production_index = 0;
  let production_index_prefix = 'INV-';

  let operations = [];
  let items = [];

  let form = {
    warehouse_id: '',
    bom_id: '',
    product_id: '',
    product_unit_id: '',
    quantity: '',
    production_type: '',
    production_number: '',
    production_start_date: new Date().toISOString().slice(0, 10),
    production_end_date: new Date().toISOString().slice(0, 10),
    description: '',
    currency: '',
    production_status: 'draft',
    status: 1,
  };

  $: quantity = form.quantity;
  $: currency = form.currency;

  async function loadBomItemsIntoProduction() {
    const fullBom = (await bomApi.getById(Number(form.bom_id)))?.data || null;
    const bomItems = (fullBom?.items || []).filter((i) => Number(i.status) === 1);
    items = bomItems.map((bi) => ({
      product_id: bi.product_id,
      product_name: products.find((p) => p.id == bi.product_id)?.name,
      product_unit_id: bi.product_unit_id,
      quantity: Number(bi.quantity),
      planned_quantity: Number(bi.quantity),
      unit_price: Number(bi.unit_price),
      calculated_price: Number(bi.unit_price),
      currency: bi.currency || form.currency,
      subtotal: Number(bi.quantity) * Number(bi.unit_price),
      availableUnits: [],
    }));
  }

  async function loadBomOperationsIntoProduction() {
    const fullBom = (await bomApi.getById(Number(form.bom_id)))?.data || null;
    const bomOperations = (fullBom?.operations || []).filter((o) => Number(o.status) === 1);

    operations = bomOperations.map((operation) => ({
      ...operation,
      actual_time:
        (Number(operation.run_time) || 0) * (Number(quantity) || 1) +
        convertTime(Number(operation.setup_time) || 0, operation.setup_time_unit, operation.run_time_unit),
      actual_time_unit: operation.run_time_unit,
      bom_operation_id: operation.id,
    }));
  }

  $: if (form.bom_id != null && form.bom_id !== '') {
    const bom = boms.find((b) => b.id == form.bom_id);
    if (bom && form.product_id !== bom.product_id) {
      form.product_id = bom.product_id;
      form.product_unit_id = bom.product_unit_id;
      form.quantity = bom.quantity;
      loadBomItemsIntoProduction();
      loadBomOperationsIntoProduction();
    }
    setTimeout(() => {
      if (window.mdb) {
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  }
  let loading = false;

  let modalRef;
  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let second_entry_account = null;
  let showTrackModal = false;

  let WALKIN = null;

  onMount(async () => {
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];

    accounts.forEach((acc) => {
      if (acc.code === 'TREASURY') {
        second_entry_account = acc.id;
        treasury_ID = acc.id;
      }

      if (acc.code === 'NOTRACK') {
        notrack_ID = acc.id;
      }
    });
    accounts = accounts.filter((a) => !['NOTRACK', 'RECEIVABLE', 'PAYABLE', 'SALES', 'PURCHASE'].includes(a.code));

    allAccountTypes = (await accountTypeApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    boms = (await bomApi.getAll({ status: 1 }))?.data || [];
    customers = (await accountApi.getAll({ status: 1, account_type_id: 4 }))?.data || [];

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];

    WALKIN = customers.find((c) => c.code === 'WALKIN');
    form.product_id = WALKIN ? WALKIN.id : '';
    form.warehouse_id = warehouses.length > 0 ? warehouses[0].id : '';

    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    production_index = Number(
      ((await settingsApi.getAll({ status: 1, key: 'production_index' }))?.data?.[0])?.value,
    );

    production_index_prefix =
      ((await settingsApi.getAll({ status: 1, key: 'production_index_prefix' }))?.data?.[0])?.value || 'INV-';

    form.production_number = production_index_prefix + production_index || '';

    accountTypes = ((await accountTypeApi.getAll({ status: 1 }))?.data || []).filter((s) => s.id == 4);

    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;

    if (productionId) await loadProduction(productionId);

    setDatePickers();
  });

  async function loadProduction(id) {
    try {
      const production = (await productionApi.getById(Number(id)))?.data || null;
      if (!production || production.production_status !== 'draft' || Number(production.status) !== 1) {
        push('/dashboard/productions');
        return;
      }

      form = {
        warehouse_id: production.warehouse_id,
        bom_id: production.bom_id,
        product_id: production.product_id,
        product_unit_id: production.product_unit_id,
        quantity: production.quantity,
        production_type: production.production_type,
        production_number: production.production_number,
        production_start_date: production.production_start_date,
        production_end_date: production.production_end_date,
        description: production.description,
        currency: production.currency,
        production_status: production.production_status,
        status: production.status,
      };

      const productionItems = (production.items || []).filter((item) => Number(item.status) === 1);
      const productIds = productionItems.map((i) => i.product_id);
      const filteredProducts = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) =>
        productIds.includes(p.id),
      );

      items = productionItems.map((i) => {
        const product = filteredProducts.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          planned_quantity: i.planned_quantity,
          unit_price: i.unit_price,
          calculated_price: i.unit_price,
          currency: i.currency,
          unit_price_currency: i.currency,
          subtotal: i.subtotal,
        };
      });

      operations = (production.operations || [])
        .filter((o) => Number(o.status) === 1)
        .map((o) => ({
          ...o,
          bom_operation_id: o.bom_operation_id || o.id,
        }));
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to load production. Please try again.'),
        confirmButtonText: t('OK'),
      });
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

  $: items_total_amount = items.reduce((s, i) => {
    if (i.currency && form.currency && i.currency !== form.currency) {
      return s + exchangeRate(i.subtotal, i.currency, form.currency);
    }
    return s + i.subtotal;
  }, 0);

  $: operations_total_amount = operations.reduce((s, operation) => {
    if (operation.cost_per_hour) {
      if (operation.cost_currency == currency) {
        return (
          s +
          (convertTime((Number(operation.run_time) || 0) * (Number(quantity) || 1), operation.run_time_unit, 'hour') +
            convertTime(Number(operation.setup_time) || 0, operation.setup_time_unit, 'hour')) *
            Number(operation.cost_per_hour)
        );
      }
      return s + 0;
    } else if (operation.fixed_cost) {
      if (operation.cost_currency == currency) {
        return s + Number(operation.fixed_cost || 0);
      }
      return s + 0;
    }
    return s;
  }, 0);

  $: total_amount = items_total_amount + operations_total_amount;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatQuantity(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }

  /*
   * The backend refuses to confirm a production whose raw materials are not
   * in the selected warehouse, and returns every short line so the user can
   * see exactly what to buy or transfer instead of a generic failure.
   */
  function showMaterialShortage(shortages) {
    Swal.fire({
      icon: 'error',
      title: t('Insufficient Raw Material Stock'),
      html: `
        <p class="mb-2">${escapeHtml(t('Not enough raw material stock in the selected warehouse for this production.'))}</p>
        <ul style="text-align: start; margin: 0; padding-inline-start: 1.25rem;">
          ${shortages
            .map(
              (shortage) => `<li>
                <strong>${escapeHtml(shortage.product_name)}</strong><br />
                ${escapeHtml(t('Required'))}: ${escapeHtml(formatQuantity(shortage.required))}
                &nbsp;|&nbsp;
                ${escapeHtml(t('Available'))}: ${escapeHtml(formatQuantity(shortage.available))}
              </li>`,
            )
            .join('')}
        </ul>
      `,
      confirmButtonText: t('OK'),
    });
  }

  async function saveProduction(confirm = false) {
    if (!form.warehouse_id || !form.bom_id || !form.product_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Warehouse, BOM, Product, and at least one Item are required.'));
      return;
    }

    loading = true;

    try {
      const payload = {
        warehouse_id: form.warehouse_id,
        bom_id: form.bom_id,
        product_id: form.product_id,
        quantity: form.quantity,
        product_unit_id: form.product_unit_id,
        production_type: form.production_type,
        production_number: form.production_number,
        production_start_date: form.production_start_date,
        production_end_date: form.production_end_date,
        description: form.description,
        currency: form.currency,
        production_status: confirm ? 'confirmed' : 'draft',
        status: form.status,
        total_amount: total_amount,
        items: items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.calculated_price ?? item.unit_price,
          currency: item.currency,
          subtotal: item.subtotal,
          status: 1,
        })),
        operations: operations.map((o) => ({
          bom_operation_id: o.bom_operation_id || o.id,
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

      let savedId = Number(productionId);
      let saved;

      if (savedId) {
        const response = await productionApi.update(savedId, payload);
        saved = response?.data;
      } else {
        const response = await productionApi.create(payload);
        saved = response?.data;
        savedId = saved?.id;

        const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'production_index' }))?.data?.[0];
        if (_indexSetting) {
          await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
        }
      }

      form.production_status = confirm ? 'confirmed' : 'draft';
      toast.success(t('Success'), confirm ? t('Production Confirmed.') : t('Draft Saved.'));
      resetForm();
      push('/dashboard/productions/' + savedId);
    } catch (err) {
      console.error(err);

      const shortages =
        err?.code === 'INSUFFICIENT_MATERIAL_STOCK'
          ? err.errors?.shortages || []
          : [];

      if (shortages.length) {
        showMaterialShortage(shortages);
      } else {
        Swal.fire({
          icon: 'error',
          title: t('Error'),
          text: t('Failed to save production. Please try again.'),
          confirmButtonText: t('OK'),
        });
      }
    }

    loading = false;
  }

  function resetForm() {
    form = {
      ...form,
      warehouse_id: '',
      bom_id: '',
      product_id: '',
      production_type: '',
      production_number: '',
      production_start_date: new Date().toISOString().slice(0, 10),
      production_end_date: new Date().toISOString().slice(0, 10),
      description: '',
    };
    items = [];
  }
</script>
<div class="sale-create-page manufacturing-form production-form-page" dir={t('dir')}>
  <section class="sale-section sale-details-section">
    <header class="sale-section-header">
      <div class="sale-section-heading">
        <span class="sale-section-icon" aria-hidden="true">
          <i class="bi bi-gear-wide-connected"></i>
        </span>

        <div>
          <h2>
            {productionId ? t('Edit Production') : t('New Production')}
            <span class="sale-required-note"><i class="bi bi-asterisk" aria-hidden="true"></i></span>
          </h2>
        </div>
      </div>
    </header>

    <div class="sale-details-grid">
      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-building" aria-hidden="true"></i>
          {t('Warehouse')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Warehouse')}
          icon="bi-building"
          value={form.warehouse_id}
          options={[
            { value: '', label: t('Select Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.warehouse_id = event.detail)} />
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-list-check" aria-hidden="true"></i>
          {t('BOM')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('BOM')}
          icon="bi-list-check"
          value={form.bom_id}
          options={[
            { value: '', label: t('Select BOM') },
            ...boms.map((b) => ({ value: b.id, label: `BOM-${b.bill_number}` })),
          ]}
          on:change={(event) => (form.bom_id = event.detail)} />
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-box-seam" aria-hidden="true"></i>
          {t('Product')}
        </span>

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
          {t('Production #')}
        </span>

        <input readonly type="text" class="form-control production-number-control" value={form.production_number} />
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

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Start Date')}
        </span>

        <div class="input-group input-group-sm persianDatePicker">
          <input type="date" class="form-control dater1" required bind:value={form.production_start_date} />
        </div>
      </div>

      <div class="sale-field">
        <span class="sale-field-label">
          <i class="bi bi-calendar-check" aria-hidden="true"></i>
          {t('End Date')}
        </span>

        <div class="input-group input-group-sm persianDatePicker">
          <input type="date" class="form-control dater2" required bind:value={form.production_end_date} />
        </div>
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

  <ProductionItemsTable bind:items currency={form.currency} warehouse_id={form.warehouse_id} />
  <ProductionOperationsTable bind:operations bind:quantity bind:currency />

  <footer class="sale-actions">
    <div class="sale-actions__buttons">
      <button
        type="button"
        class="sale-action-button sale-action-button--draft"
        on:click={() => saveProduction(false)}
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
        on:click={() => saveProduction(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm')} {t('Production')}</span>
      </button>
    </div>
  </footer>
</div>

<style>
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

<AccountModal
  bind:this={modalRef}
  accountTypes={allAccountTypes}
  on:saved={async (e) => {
    accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
    second_entry_account = e.detail.account.id;
    track_ID = e.detail.account.id;
    showTrackModal = false;
  }} />

{#if form?.product_id}
  {#if showAccountModal}
    <div class="modal show d-block" id="accountModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              {t('Account')}
            </h5>
            <button
              type="button"
              class="btn-close"
              aria-label={t('Close')}
              on:click={() => {
                showAccountModal = false;
              }}></button>
          </div>
          <div class="modal-body overflow-y-auto" style="max-height:480px">
            <AccountView id={form.product_id} />
          </div>
        </div>
      </div>
    </div>
  {/if}
{/if}
