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

  async function saveProduction(confirm = false) {
    if (!form.warehouse_id || !form.bom_id || !form.product_id || items.length === 0) {
      toast.error(t('Validation Error'), t('Warehouse, Customer, BOM, and at least one Item are required.'));
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
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to save production. Please try again.'),
        confirmButtonText: t('OK'),
      });
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

<div class="container-fluid mt-4">
  <div class="card shadow-2">
    <div class="card-body">
      <h4 class="mb-4">
        {productionId ? t('Edit Production') : t('New Production')}
      </h4>

      <div class="row g-3">
        <div class="col-md-3">
          <select class="form-select form-select-sm" bind:value={form.warehouse_id}>
            <option value="">{t('Select Warehouse')}</option>
            {#each warehouses as w}
              <option value={w.id}>{w.name}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-3">
          <select class="form-select form-select-sm" bind:value={form.bom_id}>
            <option value="">{t('Select BOM')}</option>
            {#each boms as b}
              <option value={b.id}>BOM-{b.bill_number}</option>
            {/each}
          </select>
        </div>

        <div class="col-md-3">
          <div class="input-group">
            <select class="form-select form-select-sm" bind:value={form.product_id}>
              <option value="">{t('Select Product')}</option>
              {#each products as p}
                <option value={p.id}>
                  {p.name}
                </option>
              {/each}
            </select>
            <button
              class="btn btn-info btn-sm pt-1 px-2 d-none"
              type="button"
              on:click={() => productModalRef.openModal()}><i class="bi bi-plus-circle"></i></button>
          </div>
        </div>

        <div class="col-md-3">
          <div class="input-group input-group-sm">
            <div class="form-outline flex-grow-1" data-mdb-input-init>
              <input
                type="text"
                id="inp_quantity"
                class="form-control form-control-sm"
                bind:value={form.quantity} />
              <label class="form-label" for="inp_quantity">{t('Quantity')}</label>
            </div>
            {#if units.find((u) => u.id == form.product_unit_id)}
              <div class="input-group-text">
                {units.find((u) => u.id == form.product_unit_id)?.name || t('Select The Product')}
              </div>
            {/if}
          </div>
        </div>
        <div class="col-md-3">
          <input
            readonly
            type="text"
            class="form-control form-control-sm"
            value="{t('Production #')}: {form.production_number}" />
        </div>

        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input
              type="date"
              class="form-control form-control-sm dater1"
              required
              bind:value={form.production_start_date} />
          </div>
        </div>
        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input
              type="date"
              class="form-control form-control-sm dater2"
              required
              bind:value={form.production_end_date} />
          </div>
        </div>
        <div class="col-md-3">
          <button
            id="showCurrencyDropdown"
            class="btn btn-secondary dropdown-toggle btn-sm w-100"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false">
            {form.currency ? t(form.currency) : t('AFN')}
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            {#each currencies as cur}
              <li>
                <button
                  class="dropdown-item"
                  style={form.currency == cur.code
                    ? 'background-color:rgb(225.6, 233.7, 247.05) !important;color: rgb(41.3, 79.1, 141.4) !important'
                    : ''}
                  on:click={() => (form.currency = cur.code)}
                  type="button">
                  {t(cur.code)}
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <div class="col-md-12">
          <textarea
            class="form-control form-control-sm"
            rows="2"
            bind:value={form.description}
            placeholder={t('Description')}></textarea>
        </div>
      </div>
    </div>
  </div>
  <ProductionItemsTable bind:items currency={form.currency} warehouse_id={form.warehouse_id} />
  <ProductionOperationsTable bind:operations bind:quantity bind:currency />
  <div class="card shadow-2 mt-4">
    <div class="card-body d-flex justify-content-between align-items-center">
      <h4>
        {t('Total')}{t('-of-')}{t('Production Cost')}: {total_amount.toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}
        {t(form.currency)}
        | {t('Cost')}{t('-of-')}
        {t('per')}
        {t('Product')}: {(total_amount / form.quantity).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}
        {t(form.currency)}
      </h4>
      <div>
        <button class="btn btn-secondary me-2" on:click={() => saveProduction(false)} disabled={loading}
          >{t('Save Draft')}</button>
        <button class="btn btn-success" on:click={() => saveProduction(true)} disabled={loading}
          >{t('Confirm Production')}</button>
      </div>
    </div>
  </div>
</div>

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
