<script>
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { settingsApi } from '../../api/settingsApi.js';
  import { onMount } from 'svelte';
  import StockTransferItemsTable from './StockTransferItemsTable.svelte';
  import AccountModal from '../accounts/AccountModal.svelte';
  import WarehouseModal from '../products/WarehouseModal.svelte';
  import Swal from 'sweetalert2';
  import { push } from 'svelte-spa-router';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;
  import { showDate, setDatePickers } from '../../calendar.js';
import { currencyApi } from '../../api/currencyApi.js';
import { accountApi } from '../../api/accountApi.js';
import { accountTypeApi } from '../../api/accountTypeApi.js';
import { productApi } from '../../api/productApi.js';
import { stockTransferApi } from '../../api/stockTransferApi.js';
  let warehouseModalRef;
  export let stocktransferId = null;
  $: stocktransferId = stocktransferId == 0 ? null : stocktransferId;
  let warehouses = [];
  let currencies = [];
  let settings = [];
  let accountTypes = [];
  let items = [];
  let form = {
    warehouse_id: '',
    to_warehouse_id: '',
    transfer_number: '',
    transfer_date: new Date().toISOString().slice(0, 10),
    description: '',
    currency: '',
    transfer_status: 'draft',
    status: 1,
  };
  let loading = false;
  let paymentAmount = null;
  let paymentDescription = '';
  let paymentCurrency = '';
  let modalRef;
  let accounts = [];
  let allAccountTypes = [];
  let treasury_ID = 0;
  let notrack_ID = 0;
  let track_ID = 0;
  let filteredSecondAccounts = [];
  let second_entry_account_search = '';
  let showTrackModal = false;
  let second_entry_account = null;

  function getAccountTypeColor(type) {
    const colors = ['dark', 'danger', 'secondary', 'primary', 'success', 'info', 'warning', 'dark', 'info', 'success'];
    return colors[type];
  }
  function getAccountName(id) {
    const acc = accounts.find((a) => a.id === id) || {};
    let out = '';
    if (t('Lang') === 'en') out = acc.name || '';
    if (t('Lang') === 'fa') out = acc.name_fa || acc.name || '';
    if (t('Lang') === 'ps') out = acc.name_ps || acc.name || '';
    out = out || 'Unknown';
    return out;
  }
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
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    settings = (await settingsApi.getAll({ status: 1, key: 'transfer_index' }))?.data || [];
    form.transfer_number = settings[0]?.value || '';
    accountTypes = allAccountTypes.filter((at) => at.id == 4 && at.status === 1);
    const defaultCurrency = currencies.find((c) => c.isDefault == 1);
    if (defaultCurrency && !form.currency) form.currency = defaultCurrency.code;
    paymentCurrency = form.currency;
    if (stocktransferId) await loadStockTransfer(stocktransferId);
    setDatePickers();
  });
  async function loadStockTransfer(id) {
    try {
      const response = await stockTransferApi.getById(Number(id));
      const stocktransfer = response?.data;
      if (!stocktransfer || stocktransfer.transfer_status !== 'draft' || Number(stocktransfer.status) !== 1) {
        push('/dashboard/stock-transfers');
        return;
      }
      form = {
        warehouse_id: stocktransfer.warehouse_id,
        to_warehouse_id: stocktransfer.to_warehouse_id,
        transfer_number: stocktransfer.transfer_number,
        transfer_date: stocktransfer.transfer_date,
        description: stocktransfer.description,
        currency: stocktransfer.currency,
        transfer_status: stocktransfer.transfer_status,
        status: stocktransfer.status,
      };
      const stocktransferItems = (stocktransfer.items || []).filter((item) => Number(item.status) === 1);
      const productIds = stocktransferItems.map((i) => i.product_id);
      const products = (await productApi.getAll({ status: 1 }))?.data || [];
      items = stocktransferItems.map((i) => {
        const product = products.find((p) => p.id === i.product_id);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
        };
      });
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to load stocktransfer. Please try again.'),
        confirmButtonText: t('OK'),
      });
    }
  }
  $: total_amount = items.reduce((s, i) => s + i.subtotal, 0);
  $: if (form.currency) paymentCurrency = form.currency;
  async function saveStockTransfer(confirm = false) {
    if (!form.warehouse_id || !form.to_warehouse_id) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('From Warehouse, To Warehouse and at least one Item are required.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (form.warehouse_id == form.to_warehouse_id) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('From Warehouse & To Warehouse cannot be the same.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (items.length === 0) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('At least one Item is required.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    if (confirm && paymentAmount === null) {
      Swal.fire({
        icon: 'error',
        title: t('Validation Error'),
        text: t('Payment amount cannot be empty. Enter 0 if no payment.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    loading = true;
    try {
      const payload = {
        warehouse_id: form.warehouse_id,
        to_warehouse_id: form.to_warehouse_id,
        transfer_number: form.transfer_number,
        transfer_date: form.transfer_date,
        description: form.description,
        currency: form.currency,
        transfer_status: confirm ? 'confirmed' : 'draft',
        status: form.status,
        total_amount: total_amount,
        payment_account_id: second_entry_account,
        payment_amount: paymentAmount,
        payment_currency: paymentCurrency,
        payment_description: paymentDescription,
        items: items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.calculated_price != null ? item.calculated_price : item.unit_price,
          currency: form.currency,
          subtotal: item.subtotal,
          status: 1,
        })),
      };

      if (stocktransferId) {
        await stockTransferApi.update(Number(stocktransferId), payload);
      } else {
        await stockTransferApi.create(payload);
        const _indexSetting = (await settingsApi.getAll({ status: 1, key: 'transfer_index' }))?.data?.[0];
        if (_indexSetting) {
          await settingsApi.update(_indexSetting.id, { value: String(Number(_indexSetting.value || 0) + 1) });
        }
      }
      form.transfer_status = confirm ? 'confirmed' : 'draft';
      Swal.fire({
        icon: 'success',
        title: t('Success'),
        text: confirm ? t('Stock Transfer Confirmed.') : t('Draft Saved.'),
        confirmButtonText: t('OK'),
      });
      resetForm();
      push('/dashboard/stock-transfers/');
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Failed to save stock transfer. Please try again.'),
        confirmButtonText: t('OK'),
      });
    }
    loading = false;
  }

  function resetForm() {
    form = {
      ...form,
      warehouse_id: '',
      to_warehouse_id: '',
      transfer_number: '',
      transfer_date: new Date().toISOString().slice(0, 10),
      description: '',
    };
    items = [];
    paymentAmount = null;
    paymentDescription = '';
    paymentCurrency = form.currency;
  }


</script>

<div class="container-fluid mt-4">
  <div class="card shadow-2">
    <div class="card-body">
      <h4 class="mb-4">
        {stocktransferId ? t('Edit Stock Transfer') : t('New Stock Transfer')}
      </h4>
      <div class="row g-3">
        <div class="col-md-2">
          <input
            readonly
            type="text"
            class="form-control form-control-sm"
            value="{t('Transfer #')}: {form.transfer_number}" />
        </div>
        <div class="col-md-3">
          <div class="input-group input-group-sm persianDatePicker">
            <input type="date" class="form-control form-control-sm dater1" required bind:value={form.transfer_date} />
          </div>
        </div>
        <div class="col-md-2">
          <select class="form-select form-select-sm" bind:value={form.warehouse_id}>
            <option value="">{t('Select From Warehouse')}</option>
            {#each warehouses as w}
              <option value={w.id}>{w.name}</option>
            {/each}
          </select>
        </div>
        <div class="col-md-3">
          <div class="input-group">
            <select class="form-select form-select-sm" bind:value={form.to_warehouse_id}>
              <option value="">{t('Select To Warehouse')}</option>
              {#each warehouses as w}
                <option value={w.id}>{w.name}</option>
              {/each}
            </select>
            <button class="btn btn-info btn-sm pt-1 px-2" type="button" on:click={() => warehouseModalRef.openWarehouseModal()}
              ><i class="bi bi-plus-circle"></i></button>
          </div>
        </div>
        <div class="col-md-2">
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
  <StockTransferItemsTable bind:items currency={form.currency} warehouse_id={form.warehouse_id} />
  <div class="card shadow-2 mt-4 w-50 ms-auto">
    <div class="card-body">
      <p class="mb-3">{t('Transfer Expense')}</p>
      <div class="row g-3 align-items-end">
        <div class="col-md-12">
          <div class="input-group input-group-sm">
            <div class="form-outline" data-mdb-input-init>
              <input
                type="number"
                id="paymentAmount"
                class="form-control form-control-sm {paymentAmount !== null && paymentAmount <= total_amount
                  ? 'is-valid'
                  : paymentAmount == null
                    ? 'is-invalid'
                    : ''}"
                bind:value={paymentAmount}
                on:input={() => {
                  if (paymentAmount === '') {
                    paymentAmount = null;
                  } else if (paymentAmount < 0) {
                    paymentAmount = 0;
                  } else {
                    paymentAmount = Number(paymentAmount);
                  }
                }} />
              <label class="form-label" for="paymentAmount">{t('Amount')}</label>
            </div>
            <button
              id="showCurrencyDropdown"
              class="btn btn-secondary btn-sm dropdown-toggle px-2"
              type="button"
              data-mdb-toggle="dropdown"
              aria-expanded="false"
              aria-label="Currency">
              {paymentCurrency ? t(paymentCurrency) : t(form.currency)}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              {#each currencies as cur}
                <li>
                  <button class="dropdown-item" on:click={() => (paymentCurrency = cur.code)} type="button">
                    {t(cur.code)}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        </div>
        <div class="input-group input-group-sm justify-content-end mt-3">
          <input type="text" class="form-control" bind:value={paymentDescription} placeholder={t('Description')} />
          <button
            id="second_entry_account_search"
            class="btn btn-sm py-2 text-center btn-{second_entry_account == track_ID ? 'danger' : 'light'}"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            on:click={() => {
              filteredSecondAccounts = accounts;
              showTrackModal = true;
            }}
            ><i class="bi bi-check-circle"></i>
            {#if second_entry_account == track_ID}
              {t('Lang') === 'en'
                ? accounts.find((a) => a.id === track_ID)?.name
                : t('Lang') === 'fa'
                  ? accounts.find((a) => a.id === track_ID)?.name_fa
                  : t('Lang') === 'ps'
                    ? accounts.find((a) => a.id === track_ID)?.name_ps
                    : accounts.find((a) => a.id === track_ID)?.name}
            {:else}
              {t('Track')}
            {/if}
          </button>
          <button
            id="second_entry_account_search"
            class="btn btn-sm py-2 text-center btn-{second_entry_account == treasury_ID ? 'success' : 'light'}"
            type="button"
            data-mdb-toggle="dropdown"
            aria-expanded="false"
            on:click={() => {
              second_entry_account = treasury_ID;
            }}><i class="bi bi-box"></i> {t('Treasury')}</button>
        </div>
        {#if showTrackModal}
          <div class="modal-backdrop fade show"></div>
          <div
            class="modal fade show d-block"
            id="trackModal"
            tabindex="-1"
            aria-labelledby="trackModalLabel"
            aria-hidden="true">
            <div class="modal-dialog">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="trackModalLabel">
                    <i class="bi bi-check-circle"></i>
                    {t('Track')}
                  </h5>
                  <button type="button" class="btn-close" aria-label="Close" on:click={() => (showTrackModal = false)}
                  ></button>
                </div>
                <div class="modal-body">
                  <div class="mb-3">
                    <div class="input-group">
                      <input
                        type="text"
                        class="form-control"
                        placeholder={t('Search accounts...')}
                        bind:value={second_entry_account_search}
                        on:input={() => {
                          filteredSecondAccounts = accounts.filter((acc) => {
                            const name =
                              t('Lang') === 'en'
                                ? acc.name
                                : t('Lang') === 'fa'
                                  ? acc.name_fa
                                  : t('Lang') === 'ps'
                                    ? acc.name_ps
                                    : acc.name;
                            return name && name.toLowerCase().includes(second_entry_account_search.toLowerCase());
                          });
                        }} />
                      <button class="btn btn-outline-primary" on:click={() => modalRef?.openModal()}>
                        <i class="bi bi-plus-circle"></i>
                      </button>
                    </div>
                    <div class="mt-3" style="max-height:300px;overflow:auto;">
                      {#each filteredSecondAccounts as acc}
                        <div class="list-group mt-1">
                          <button
                            type="button"
                            class="list-group-item list-group-item-action"
                            on:click={() => {
                              second_entry_account = acc.id;
                              track_ID = acc.id;
                              showTrackModal = false;
                            }}>
                            {#if t('Lang') === 'en' && acc.name}{acc.name}{/if}
                            {#if t('Lang') === 'fa' && acc.name_fa}{acc.name_fa}{/if}
                            {#if t('Lang') === 'ps' && acc.name_ps}{acc.name_ps}{/if}
                            <span class="badge badge-{getAccountTypeColor(acc.account_type_id)} ms-2 float-end">
                              {#if allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                                {t('Lang') === 'en'
                                  ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name
                                  : t('Lang') === 'fa'
                                    ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_fa
                                    : t('Lang') === 'ps'
                                      ? allAccountTypes.find((at) => at.id === acc.account_type_id)?.name_ps
                                      : allAccountTypes.find((at) => at.id === acc.account_type_id)?.name}
                              {:else}
                                N/A
                              {/if}
                            </span>
                          </button>
                        </div>
                        {#if filteredSecondAccounts.length === 0}
                          <div class="text-center text-muted mt-3">
                            {t('No accounts found')}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" on:click={() => (showTrackModal = false)}
                    ><i class="bi bi-x-lg"></i>
                    {t('Close')}</button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="card shadow-2 mt-4">
    <div class="card-body d-flex justify-content-end align-items-center">
      <div>
        <button class="btn btn-secondary me-2" on:click={() => saveStockTransfer(false)} disabled={loading}
          >{t('Save Draft')}</button>
        <button class="btn btn-success" on:click={() => saveStockTransfer(true)} disabled={loading}>{t('Confirm Stock Transfer')}</button>
      </div>
    </div>
  </div>
</div>

<WarehouseModal
bind:this={warehouseModalRef}
on:saved={async (e) => {
  warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
  const newWarehouse = e.detail;
  if (newWarehouse) {
    form.to_warehouse_id = newWarehouse.id;
  }
}} />

<AccountModal
bind:this={modalRef}
accountTypes={allAccountTypes}
on:saved={async (e) => {
  accounts = (await accountApi.getAll({ status: 1 }))?.data || [];
  second_entry_account = e.detail.account.id;
  track_ID = e.detail.account.id;
  showTrackModal = false;
}} />
