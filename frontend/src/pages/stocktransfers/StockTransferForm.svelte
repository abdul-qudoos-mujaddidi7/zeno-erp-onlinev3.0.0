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
import { journalApi } from '../../api/journalApi.js';
  import FilterSelect from '../../components/common/FilterSelect.svelte';
  import AppDatePicker from '../../components/common/AppDatePicker.svelte';
  let warehouseModalRef;
  let componentRoot;
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
      if (!stocktransfer || Number(stocktransfer.status) !== 1) {
        Swal.fire({
          icon: 'error',
          title: t('Error'),
          text: t('Stock Transfer not found.'),
          confirmButtonText: t('OK'),
        });
        push('/dashboard/stock-transfers');
        return;
      }
      form = {
        warehouse_id: stocktransfer.warehouse_id,
        to_warehouse_id: stocktransfer.to_warehouse_id,
        transfer_number: stocktransfer.transfer_number,
        transfer_date: stocktransfer.transfer_date?.slice(0, 10) || '',
        description: stocktransfer.description,
        currency: stocktransfer.currency,
        transfer_status: stocktransfer.transfer_status,
        status: stocktransfer.status,
      };
      const stocktransferItems = (stocktransfer.items || []).filter((item) => Number(item.status) === 1);
      const productIds = stocktransferItems.map((i) => i.product_id);
      const products = (await productApi.getAll({ status: 1 }))?.data || [];
      items = stocktransferItems.map((i) => {
        const product = products.find((p) => Number(p.id) === Number(i.product_id));
        const quantity = Number(i.quantity || 0);
        const unit_price = Number(i.unit_price || 0);
        return {
          product_id: i.product_id,
          product_name: product?.name || 'Unknown',
          product_unit_id: i.product_unit_id || product?.product_unit_id,
          quantity,
          unit_price,
          calculated_price: unit_price,
          currency: i.currency || stocktransfer.currency,
          subtotal: quantity * unit_price,
        };
      });

      const journals = (await journalApi.getAll({ status: 1 }))?.data || [];
      const transferJournal = journals.find(
        (journal) =>
          journal.reference_type === 'stock_transfer' &&
          Number(journal.reference_id) === Number(stocktransfer.id) &&
          Number(journal.status) === 1,
      );
      paymentAmount = transferJournal ? Number(transferJournal.first_entry_credit || 0) : 0;
      paymentCurrency = transferJournal?.currency || stocktransfer.currency || paymentCurrency;
      second_entry_account = transferJournal?.second_entry_account || second_entry_account;
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
  $: total_amount = items.reduce((s, i) => s + Number(i.subtotal || 0), 0);
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

  function openTrackModal() {
    filteredSecondAccounts = accounts;
    showTrackModal = true;
  }

</script>

<div class="transfer-create-page" bind:this={componentRoot} dir={t('dir')}>
  <section class="transfer-section transfer-details-section">
    <header class="transfer-section-header">
      <div class="transfer-section-heading">
        <span class="transfer-section-icon" aria-hidden="true">
          <i class="bi bi-arrow-left-right"></i>
        </span>

        <div>
          <h2>
            {stocktransferId ? t('Edit Stock Transfer') : t('New Stock Transfer')}
            <span class="transfer-required-note"><i class="bi bi-asterisk" aria-hidden="true"></i></span>
          </h2>
        </div>
      </div>
    </header>

    <div class="transfer-details-grid">
      <div class="transfer-field">
        <span class="transfer-field-label">
          <i class="bi bi-building" aria-hidden="true"></i>
          {t('From Warehouse')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('From Warehouse')}
          icon="bi-building"
          value={form.warehouse_id}
          options={[
            { value: '', label: t('Select From Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.warehouse_id = event.detail)} />
      </div>

      <div class="transfer-field">
        <div class="transfer-field-label-row">
          <span class="transfer-field-label">
            <i class="bi bi-building" aria-hidden="true"></i>
            {t('To Warehouse')}
          </span>

          <button
            type="button"
            class="transfer-field-add"
            title={t('Add Warehouse')}
            aria-label={t('Add Warehouse')}
            on:click={() => warehouseModalRef.openWarehouseModal()}>
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </div>

        <FilterSelect
          variant="outline"
          label={t('To Warehouse')}
          icon="bi-building"
          value={form.to_warehouse_id}
          options={[
            { value: '', label: t('Select To Warehouse') },
            ...warehouses.map((w) => ({ value: w.id, label: w.name })),
          ]}
          on:change={(event) => (form.to_warehouse_id = event.detail)} />
      </div>

      <div class="transfer-field">
        <span class="transfer-field-label">
          <i class="bi bi-receipt" aria-hidden="true"></i>
          {t('Transfer #')}
        </span>

        <div class="transfer-readonly-field">
          <span dir="ltr">{form.transfer_number}</span>
          <i class="bi bi-lock-fill" aria-hidden="true"></i>
        </div>
      </div>

      <div class="transfer-field">
        <span class="transfer-field-label">
          <i class="bi bi-calendar3" aria-hidden="true"></i>
          {t('Date')}
        </span>

        <div class="transfer-app-datepicker">
          <AppDatePicker bind:value={form.transfer_date} required />
        </div>
      </div>

      <div class="transfer-field">
        <span class="transfer-field-label">
          <i class="bi bi-currency-exchange" aria-hidden="true"></i>
          {t('Currency')}
        </span>

        <FilterSelect
          variant="outline"
          label={t('Currency')}
          icon="bi-currency-exchange"
          value={form.currency}
          options={currencies.map((cur) => ({
            value: cur.code,
            label: t(cur.code),
          }))}
          on:change={(event) => (form.currency = event.detail)} />
      </div>

      <div class="transfer-field transfer-field--description">
        <div class="transfer-description-body">
          <textarea bind:value={form.description} rows="2" placeholder={t('Description')}></textarea>
        </div>
      </div>
    </div>
  </section>

  <StockTransferItemsTable bind:items currency={form.currency} warehouse_id={form.warehouse_id} />

  <section class="transfer-simple-payment" class:is-invalid={paymentAmount === null}>
    <label class="transfer-simple-payment__field transfer-simple-payment__field--amount">
      <span>{t('Amount')}</span>

      <div class="transfer-amount-control">
        <input
          type="number"
          min="0"
          step="any"
          bind:value={paymentAmount}
          placeholder="0"
          on:input={() => {
            if (paymentAmount === '') {
              paymentAmount = null;
            } else if (paymentAmount < 0) {
              paymentAmount = 0;
            } else {
              paymentAmount = Number(paymentAmount);
            }
          }} />

        <select bind:value={paymentCurrency} aria-label={t('Currency')}>
          {#each currencies as cur}
            <option value={cur.code}>{t(cur.code)}</option>
          {/each}
        </select>
      </div>
    </label>

    <label class="transfer-simple-payment__field transfer-simple-payment__field--note">
      <span>{t('Description')}</span>

      <div>
        <i class="bi bi-card-text" aria-hidden="true"></i>

        <input type="text" bind:value={paymentDescription} placeholder={t('Description')} />
      </div>
    </label>

    <div class="transfer-simple-payment__field">
      <span>{t('Payment Way')}</span>

      <div
        class="transfer-simple-payment__method"
        role="group"
        aria-label={t('Payment Way')}>
        <button
          type="button"
          class:is-active={second_entry_account == treasury_ID}
          on:click={() => (second_entry_account = treasury_ID)}>
          <span>{t('Treasury')}</span>
        </button>

        <button
          type="button"
          class:is-active={second_entry_account == track_ID}
          on:click={openTrackModal}>
          <span>
            {#if second_entry_account == track_ID && track_ID}
              {getAccountName(track_ID)}
            {:else}
              {t('Track')}
            {/if}
          </span>
        </button>
      </div>
    </div>

    <div class="transfer-simple-payment__total">
      <span>{t('Total')}</span>

      <strong dir="ltr">
        {Number(total_amount || 0).toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}
      </strong>

      <small>{t(form.currency || 'AFN')}</small>
    </div>
  </section>

  <footer class="transfer-actions">
    <div class="transfer-actions__buttons">
      <button
        type="button"
        class="transfer-action-button transfer-action-button--draft"
        on:click={() => saveStockTransfer(false)}
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
        class="transfer-action-button transfer-action-button--confirm"
        on:click={() => saveStockTransfer(true)}
        disabled={loading}>
        {#if loading}
          <span class="spinner-border spinner-border-sm" role="status"></span>
        {:else}
          <i class="bi bi-check2-circle" aria-hidden="true"></i>
        {/if}

        <span>{t('Confirm Stock Transfer')}</span>
      </button>
    </div>
  </footer>

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

<style>
  .transfer-create-page {
    --transfer-primary: var(--bs-primary, #2f6fed);
    --transfer-primary-dark: #1d4ed8;
    --transfer-green: #059669;
    --transfer-green-dark: #047857;
    --transfer-text: #172033;
    --transfer-muted: #718096;
    --transfer-border: #dfe6ef;
    --transfer-border-soft: #edf1f6;
    --transfer-surface: #ffffff;
    --transfer-bg-soft: #f7f9fc;
    --transfer-control-height: 2.625rem;

    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0 0 1.25rem;
    color: var(--transfer-text);
  }

  /* Shared sections */

  .transfer-section {
    min-width: 0;
    overflow: visible;
    border: 1px solid var(--transfer-border);
    border-radius: 0.875rem;
    background: var(--transfer-surface);
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .transfer-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 4rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--transfer-border-soft);
  }

  .transfer-section-heading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .transfer-section-icon {
    display: inline-grid;
    flex: 0 0 2.2rem;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 0.6rem;
    background: #edf4ff;
    color: var(--transfer-primary);
    font-size: 0.9rem;
  }

  .transfer-section-icon--green {
    background: #ecfdf5;
    color: var(--transfer-green);
  }

  .transfer-section-heading h2 {
    margin: 0;
    color: #26364b;
    font-size: 0.88rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .transfer-required-note {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin-inline-start: 0.35rem;
    color: #b42318;
    font-size: 0.62rem;
    font-weight: 700;
  }

  .transfer-required-note i {
    color: #dc2626;
    font-size: 0.48rem;
  }

  /* Details */

  .transfer-details-grid {
    --transfer-control-height: 2.375rem;

    display: grid;
    grid-template-columns:
      minmax(10rem, 1fr)
      minmax(13rem, 1.35fr)
      minmax(8rem, 0.72fr)
      minmax(10rem, 0.9fr)
      minmax(9rem, 0.82fr);
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.625rem;
  }

  .transfer-field {
    display: grid;
    grid-template-rows: 1rem auto;
    align-content: start;
    gap: 0.15rem;
    min-width: 0;
  }

  .transfer-field--description {
    grid-column: 1 / -1;
    grid-template-rows: auto;
  }

  .transfer-field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    height: 1rem;
    min-height: 1rem;
  }

  .transfer-field-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1rem;
    color: #59687c;
    font-size: 0.68rem;
    font-weight: 750;
  }

  .transfer-field-label i {
    display: none;
  }

  .transfer-field-add {
    display: inline-grid;
    width: 1rem;
    height: 1rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 0.3rem;
    background: transparent;
    color: #8c9aad;
    font-size: 0.62rem;
    cursor: pointer;
  }

  .transfer-field-add:hover {
    background: #edf4ff;
    color: var(--transfer-primary);
  }

  .transfer-details-grid :global(.filter-select) {
    width: 100%;
    max-width: none;
    min-width: 0;
  }

  .transfer-details-grid :global(.filter-select__label),
  .transfer-details-grid :global(.filter-label),
  .transfer-details-grid :global(.filter-select__notch) {
    display: none !important;
  }

  .transfer-details-grid :global(.filter-select.outline) {
    padding-top: 0 !important;
  }

  .transfer-details-grid :global(.filter-select__control),
  .transfer-details-grid :global(.filter-select select),
  .transfer-details-grid :global(.filter-select button),
  .transfer-details-grid :global(.form-select) {
    width: 100%;
    min-height: var(--transfer-control-height) !important;
    height: var(--transfer-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    color: #26364b !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .transfer-details-grid :global(.filter-select__control:hover),
  .transfer-details-grid :global(.filter-select select:hover),
  .transfer-details-grid :global(.form-select:hover) {
    border-color: #bcc9db !important;
  }

  .transfer-details-grid :global(.filter-select__control:focus-within),
  .transfer-details-grid :global(.filter-select select:focus),
  .transfer-details-grid :global(.form-select:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .transfer-readonly-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    height: var(--transfer-control-height);
    padding-inline: 0.75rem;
    border: 1px solid #dfe5ed;
    border-radius: 0.625rem;
    background: #f7f9fc;
    color: #526176;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .transfer-readonly-field i {
    color: #9aa7b8;
    font-size: 0.65rem;
  }

  .transfer-app-datepicker {
    width: 100%;
    min-width: 0;
  }

  .transfer-app-datepicker :global(.app-date-field) {
    width: 100%;
    gap: 0 !important;
  }

  .transfer-app-datepicker :global(.date-label) {
    display: none !important;
  }

  .transfer-app-datepicker :global(.date-picker-control) {
    width: 100%;
    min-width: 0;
    min-height: var(--transfer-control-height) !important;
    height: var(--transfer-control-height) !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .transfer-app-datepicker :global(input) {
    width: 100%;
    min-width: 0;
    min-height: var(--transfer-control-height) !important;
    height: var(--transfer-control-height) !important;
    border-color: #d6dfeb !important;
    border-radius: 0.625rem !important;
    background: #ffffff !important;
    font-size: 0.78rem !important;
    font-weight: 650 !important;
    box-shadow: none !important;
  }

  .transfer-app-datepicker :global(input:focus) {
    border-color: #78a4f5 !important;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1) !important;
  }

  .transfer-description-body textarea {
    width: 100%;
    min-height: 2.375rem;
    padding: 0.75rem;
    border: 1px solid #d6dfeb;
    border-radius: 0.625rem;
    outline: 0;
    background: #ffffff;
    color: #26364b;
    font: inherit;
    font-size: 0.78rem;
    line-height: 1.55;
    resize: vertical;
  }

  .transfer-description-body textarea:focus {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .transfer-description-body textarea::placeholder {
    color: #a2adbd;
  }

  /* Transfer expense row — mirrors sale-simple-payment */

  .transfer-simple-payment {
    display: grid;
    grid-template-columns:
      minmax(12rem, 0.9fr)
      minmax(12rem, 1fr)
      minmax(16rem, 1.3fr)
      minmax(9rem, 0.7fr);
    align-items: end;
    gap: 0.55rem;
    min-width: 0;
    padding: 0.65rem 0.75rem;
    border: 1px solid #dfe6ef;
    border-radius: 0.875rem;
    background: #ffffff;
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.045);
  }

  .transfer-simple-payment__field {
    display: grid;
    gap: 0.24rem;
    min-width: 0;
    margin: 0;
  }

  .transfer-simple-payment__field > span {
    color: #64748b;
    font-size: 0.6rem;
    font-weight: 800;
    line-height: 1;
  }

  .transfer-simple-payment__field > div {
    display: flex;
    align-items: center;
    height: 2.5rem;
    min-width: 0;
    overflow: visible;
    border: 1px solid #d6dfeb;
    border-radius: 0.65rem;
    background: #ffffff;
  }

  .transfer-simple-payment__field > div:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .transfer-simple-payment__field i {
    flex: 0 0 1.8rem;
    width: 1.8rem;
    color: #8c9aad;
    text-align: center;
    font-size: 0.76rem;
  }

  .transfer-simple-payment__field input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 0.55rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
    text-align: start;
  }

  .transfer-simple-payment__field input::placeholder {
    color: #a2adbd;
  }

  .transfer-amount-control {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: 2.5rem;
    overflow: hidden;
    border: 1px solid #d6dfeb;
    border-radius: 0.65rem;
    background: #ffffff;
  }

  .transfer-amount-control:focus-within {
    border-color: #78a4f5;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.1);
  }

  .transfer-amount-control input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0 0.6rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: #26364b;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .transfer-amount-control select {
    flex: 0 0 auto;
    min-width: 4.5rem;
    height: 100%;
    padding: 0 0.5rem;
    border: 0;
    border-inline-start: 1px solid #dbe3ef;
    outline: 0;
    background: #f8fafc;
    color: #334155;
    font-size: 0.65rem;
    font-weight: 850;
    cursor: pointer;
  }

  .transfer-simple-payment.is-invalid .transfer-amount-control,
  .transfer-simple-payment.is-invalid .transfer-amount-control input {
    border-color: #fca5a5;
  }

  .transfer-simple-payment__method {
    display: inline-flex;
    align-items: center;
    align-self: stretch;
    height: 2.5rem;
    flex: 0 0 auto;
    min-width: 14rem;
    padding: 0.18rem;
    border: 1px solid #dbe3ef;
    border-radius: 0.65rem;
    background: #f8fafc;
  }

  .transfer-simple-payment__method button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.32rem;
    height: 100%;
    flex: 1 1 auto;
    min-width: 4.5rem;
    padding-inline: 0.65rem;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: #64748b;
    font-size: 0.64rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
  }

  .transfer-simple-payment__method button > span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.1;
  }

  .transfer-simple-payment__method button.is-active {
    background: #ecfdf5;
    color: var(--transfer-green);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  }

  .transfer-simple-payment__total {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    min-height: 2.5rem;
    min-width: 0;
    padding: 0.45rem 0.6rem;
    border-radius: 0.65rem;
    background: #f5f9ff;
    color: #26364b;
    white-space: nowrap;
  }

  .transfer-simple-payment__total span {
    color: #718096;
    font-size: 0.62rem;
    font-weight: 800;
  }

  .transfer-simple-payment__total strong {
    color: var(--transfer-primary);
    font-size: 0.95rem;
    font-weight: 900;
  }

  .transfer-simple-payment__total small {
    color: #64748b;
    font-size: 0.62rem;
    font-weight: 750;
  }

  /* Sticky actions */

  .transfer-actions {
    position: sticky;
    bottom: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    min-height: 4.5rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid #d9e1ec;
    border-radius: 0.875rem;
    background: rgba(255, 255, 255, 0.96);
    box-shadow:
      0 -8px 28px rgba(15, 23, 42, 0.07),
      0 8px 24px rgba(15, 23, 42, 0.05);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
  }

  .transfer-actions__buttons {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-shrink: 0;
  }

  .transfer-action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    min-height: 2.6rem;
    padding-inline: 1rem;
    border-radius: 0.625rem;
    font-size: 0.74rem;
    font-weight: 850;
    white-space: nowrap;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .transfer-action-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .transfer-action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .transfer-action-button--draft {
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #526176;
  }

  .transfer-action-button--draft:hover:not(:disabled) {
    border-color: #becbdb;
    background: #f8fafc;
    color: #26364b;
  }

  .transfer-action-button--confirm {
    min-width: 9rem;
    border: 1px solid var(--transfer-primary);
    background: var(--transfer-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(47, 111, 237, 0.22);
  }

  .transfer-action-button--confirm:hover:not(:disabled) {
    border-color: var(--transfer-primary-dark);
    background: var(--transfer-primary-dark);
    box-shadow: 0 7px 18px rgba(47, 111, 237, 0.27);
  }

  /* Responsive */

  @media (max-width: 1199.98px) {
    .transfer-details-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .transfer-simple-payment {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767.98px) {
    .transfer-details-grid {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.8rem;
    }

    .transfer-section-header {
      padding-inline: 0.8rem;
    }

    .transfer-simple-payment {
      grid-template-columns: minmax(0, 1fr);
      padding: 0.8rem;
    }

    .transfer-actions {
      align-items: stretch;
      flex-direction: column;
      padding: 0.65rem;
    }

    .transfer-actions__buttons {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .transfer-action-button {
      width: 100%;
      min-width: 0;
      padding-inline: 0.6rem;
    }
  }

  @media (max-width: 480px) {
    .transfer-section-icon {
      display: none;
    }

    .transfer-actions__buttons {
      grid-template-columns: 1fr;
    }
  }

  /* Dark theme */

  :global(html.dark) .transfer-create-page {
    --transfer-text: var(--erp-text, #e5edf8);
    --transfer-muted: var(--erp-muted, #94a3b8);
    --transfer-border: var(--erp-border, #2b3a4f);
    --transfer-border-soft: var(--erp-border, #2b3a4f);
    --transfer-surface: var(--erp-surface, #111827);
    --transfer-bg-soft: var(--erp-surface-soft, #172033);
    color-scheme: dark;
  }

  :global(html.dark) .transfer-section,
  :global(html.dark) .transfer-simple-payment,
  :global(html.dark) .transfer-actions {
    border-color: var(--transfer-border);
    background: var(--transfer-surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  :global(html.dark) .transfer-section-heading h2 {
    color: var(--transfer-text);
  }

  :global(html.dark) .transfer-details-grid :global(.filter-select__control),
  :global(html.dark) .transfer-details-grid :global(.filter-select select),
  :global(html.dark) .transfer-details-grid :global(.form-select),
  :global(html.dark) .transfer-description-body textarea,
  :global(html.dark) .transfer-amount-control,
  :global(html.dark) .transfer-simple-payment__field > div {
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
    border-color: var(--erp-border, #2b3a4f) !important;
  }

  :global(html.dark) .transfer-readonly-field {
    background: var(--erp-surface-soft, #172033);
    border-color: var(--erp-border, #2b3a4f);
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .transfer-action-button--draft {
    background: var(--erp-surface-soft, #172033);
    border-color: var(--erp-border, #2b3a4f);
    color: var(--erp-muted, #94a3b8);
  }
</style>
