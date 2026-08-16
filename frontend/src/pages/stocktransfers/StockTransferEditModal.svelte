<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productApi } from '../../api/productApi.js';
  import { stockTransferApi } from '../../api/stockTransferApi.js';
  import { journalApi } from '../../api/journalApi.js';
  import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang , translate_org_type } from '../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
  export let stocktransfer;

  const dispatch = createEventDispatcher();

  let saving = false;
  let products = [];
  let units = [];
  let currencies = [];
  let warehouses = [];

  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
  let loading = true;

  let stocktransfer_items = [];
  let stocktransfer_journals = [];
  let stocktransfer_stock_transactions = [];

  let paymentAmount = 0;
  let paymentCurrency = '';

  let totalAmount = 0;
  let subTotalAmount = 0;

  $: if (stocktransfer_items.length > 0) {
    subTotalAmount = stocktransfer_items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  } else {
    subTotalAmount = 0;
  }

  $: if (stocktransfer_items.length > 0) {
    totalAmount = stocktransfer_items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
    await loadStockTransferDetails();
  });

  async function loadStockTransferDetails() {
    if (!stocktransfer) return;
    try {
      const response = await stockTransferApi.getById(Number(stocktransfer.id));
      const data = response?.data;
      if (!data) return;
      stocktransfer = data;
      stocktransfer_items = (data.items || []).filter((item) => item.status === 1);
      const journalsResponse = await journalApi.getAll({ status: 1 });
      stocktransfer_journals = (journalsResponse?.data || []).filter(
        (j) => j.reference_type === 'stock_transfer' && Number(j.reference_id) === Number(stocktransfer.id) && j.status === 1,
      );
      if (stocktransfer_journals.length == 1) {
        paymentAmount = stocktransfer_journals[0].first_entry_credit;
        paymentCurrency = stocktransfer_journals[0].currency;
      }
      const stxResponse = await stockTransactionApi.getAll({ status: 1 });
      stocktransfer_stock_transactions = (stxResponse?.data || []).filter(
        (st) => st.reference_type === 'stock_transfer' && Number(st.reference_id) === Number(stocktransfer.id) && st.status === 1,
      );
      loading = false;
    } catch (err) {
      console.error(err);
      loading = false;
    }
  }
  async function doUpdateStockTransfer() {
    saving = true;
    try {
      const payload = {
        warehouse_id: stocktransfer.warehouse_id,
        to_warehouse_id: stocktransfer.to_warehouse_id,
        transfer_number: stocktransfer.transfer_number,
        transfer_date: stocktransfer.transfer_date,
        description: stocktransfer.description,
        currency: stocktransfer.currency,
        transfer_status: stocktransfer.transfer_status,
        status: 1,
        total_amount: totalAmount,
        payment_account_id: null,
        payment_amount: 0,
        payment_currency: paymentCurrency,
        payment_description: '',
        items: stocktransfer_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: item.currency || stocktransfer.currency,
          subtotal: Number(item.unit_price) * Number(item.quantity),
          status: 1,
        })),
      };
      await stockTransferApi.update(Number(stocktransfer.id), payload);

      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Stock Transfer updated successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');

      push(`/dashboard/stock-transfers`);
    } catch (e) {
      console.error('Error updating stock transfer:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the stock transfer.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateStockTransfer() {
    if (confirmationText !== String(randomNumber)) {
      Swal.fire({
        icon: 'error',
        title: t('Confirmation Failed'),
        text: t('Confirmation text does not match. Please type the correct number to confirm updating.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    Swal.fire({
      title: t('Are you sure?'),
      text: t('Are you sure you want to update this stock transfer? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateStockTransfer();
      }
    });
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-arrow-return-left"></i>
          {t('Update StockTransfer')}
        </h5>
        <button type="button" class="btn-close" on:click={() => dispatch('close')}></button>
      </div>
      <div class="modal-body">
        {#if saving}
          <div class="d-flex align-items-center">
            <strong>{t('Updating...')}</strong>
            <div class="spinner-border ms-auto" role="status" aria-hidden="true"></div>
          </div>
        {:else}
          <div class="row">
            <div class="col-md-4">
              <h1 class="text-info">
                <i class="bi bi-exclamation-triangle me-2"></i>{t('Warning!')}
              </h1>
              <p>
                {t('Are you sure you want to update this stock transfer? This action cannot be undone.')}<br />
                {t('All associated journals, items and payments will also be updated.')}
              </p>

              <table>
                <tbody>
                  <tr>
                    <td><strong>{t('Associated Items')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : stocktransfer_items.length}</td>
                  </tr>

                  <tr>
                    <td><strong>{t('Associated Journals')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : stocktransfer_journals.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : stocktransfer_stock_transactions.length}</td>
                  </tr>
                </tbody>
              </table>

              <!-- create a mini captcha system -->
              <div class="mt-4">
                <small
                  >{t(`To confirm updating, please type`)}
                  {randomNumber}
                  {t(`in the box below:`)}</small>
                <input
                  type="text"
                  class="form-control form-control-sm mt-2 w-50 {confirmationText != randomNumber
                    ? 'is-invalid'
                    : 'is-valid'}"
                  bind:value={confirmationText}
                  placeholder={t(`To confirm updating, please type`)} />
              </div>
            </div>
            <div class="col-md-8">
              <div class="mb-3">
                <strong>{t('Transfer #')}</strong>
                : {stocktransfer.transfer_number}
              </div>

              <div class="mb-3">
                <strong>{t('Transfer Date')}</strong>
                : {stocktransfer.transfer_date.slice(0, 10)}
              </div>
              <div class="row">
                <div class="mb-3 col-md-6">
                  <strong>{t('From Warehouse')}</strong>
                  <select class="form-select form-select-sm" bind:value={stocktransfer.warehouse_id}>
                    <option value="">{t('Select From Warehouse')}</option>
                    {#each warehouses as w}
                      <option value={w.id}>{w.name}</option>
                    {/each}
                  </select>
                </div>

                <div class="mb-3 col-md-6">
                  <strong>{t('To Warehouse')}</strong>
                  <select class="form-select form-select-sm" bind:value={stocktransfer.to_warehouse_id}>
                    <option value="">{t('Select To Warehouse')}</option>
                    {#each warehouses as w}
                      <option value={w.id}>{w.name}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="table-responsive">
                <table class="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th>{t('Product')}</th>
                      <th>{t('Unit Price')}</th>
                      <th>{t('Quantity')}</th>
                      <th>{t('Subtotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each stocktransfer_items as item, index}
                      <tr>
                        <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" bind:value={item.unit_price} class="form-control form-control-sm" />
                            <span class="input-group-text">{t(item.currency)}</span>
                          </div>
                        </td>

                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" bind:value={item.quantity} class="form-control form-control-sm" />
                            <span class="input-group-text"
                              >{units.find((u) => u.id === item.product_unit_id)?.name}</span>
                          </div>
                        </td>
                        <td>
                          <div class="input-group input-group-sm">
                            {(item.unit_price * item.quantity).toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}&nbsp;{t(item.currency)}
                          </div></td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>

              <div class="mb-3">
                <strong
                  >{t('Total Amount')}
                  : {totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(stocktransfer.currency)}</strong>
              </div>

              {#if stocktransfer_journals.length == 1}
                <div class="input-group input-group-sm mb-3">
                  <span class="input-group-text">{t('Transfer Expense')}</span>
                  <input type="number" bind:value={paymentAmount} class="form-control form-control-sm" />
                  <span class="input-group-text">{t(paymentCurrency)}</span>
                </div>
              {/if}

              <div class="mb-3">
                <textarea class="form-control" placeholder={t('Description')} bind:value={stocktransfer.description}
                ></textarea>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-info" on:click={updateStockTransfer} disabled={saving || loading}
          ><i class="bi bi-trash"></i>
          {@html saving
            ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Updating...')}</span>
</div>`
            : t('Update')}</button>
      </div>
    </div>
  </div>
</div>
