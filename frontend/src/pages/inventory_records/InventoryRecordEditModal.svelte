<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  export let inventory_record;

  import {calculateRemainingAndBenefit} from './InventoryRecordsHelper.js';
import { currencyApi } from '../../api/currencyApi.js';
import { productApi } from '../../api/productApi.js';
import { journalApi } from '../../api/journalApi.js';
import { stockTransactionApi } from '../../api/stockTransactionApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';
  const dispatch = createEventDispatcher();

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    console.log('Exchanging', amount, fromCurrencyCode, 'to', toCurrencyCode);
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }


  let saving = false;
  let products = [];
  let units = [];
  let currencies = [];

  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100; // simple random number for confirmation
  let loading = true;

  let inventory_record_items = [];
  let inventory_record_payments = [];
  let inventory_record_returns = [];
  let inventory_record_return_items = [];

  let inventory_record_journals = [];

  let inventory_record_stock_transactions = [];

  let totalAmount = 0;
  let inventory_record_currency = '';
  let subTotalAmount = 0;

  $: if (inventory_record_items.length > 0) {
    subTotalAmount = inventory_record_items.reduce((s, i) => { 
        if (i.currency && inventory_record_currency && i.currency !== inventory_record_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, inventory_record_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
  } else {
    subTotalAmount = 0;
  }


  $: if (inventory_record_items.length > 0) {
    totalAmount = inventory_record_items.reduce((s, i) => { 
        if (i.currency && inventory_record_currency && i.currency !== inventory_record_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, inventory_record_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
    if (inventory_record.discount_amount > totalAmount) {
      inventory_record.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - Number(inventory_record.discount_amount || 0) + Number(inventory_record.expense_amount || 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    await loadInventoryRecordDetails();
  });

  async function loadInventoryRecordDetails() {
    if (!inventory_record) return;

    const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_record.id));
    inventory_record = inventory_recordResponse?.data || inventory_record;
    inventory_record_currency = inventory_record.currency;
    // Load inventory_record items
 
      inventory_record_items = (inventory_record.items || [])
  .filter((item) => Number(item.status) === 1)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // set inventory_record item currency as default if not available

    inventory_record_items = inventory_record_items.map(si=>{
      if (!si.currency) {
        return {...si, currency: inventory_record_currency}
      }
      return si;
    });

    // Load payments
    inventory_record_payments = (inventory_record.payments || []).filter((p) => Number(p.status) === 1);

    // Load returns
    inventory_record_returns = (inventory_record.returns || []).filter((r) => Number(r.status) === 1);

    const returnIds = inventory_record_returns.map((r) => r.id);
    if (returnIds.length > 0) {
      inventory_record_return_items = inventory_record_returns.flatMap(
        (r) => (r.items || []).filter((ri) => Number(ri.status) === 1),
      );
    }

    // Load associated journals (read-only for display counts)
    inventory_record_journals = (await journalApi.getAll({ status: 1, reference_type: 'inventory_record', reference_id: inventory_record.id }))?.data || [];

    // Load associated stock transactions (read-only for display counts)
    inventory_record_stock_transactions = (await stockTransactionApi.getAll({ status: 1, reference_type: 'inventory_record', reference_id: inventory_record.id }))?.data || [];

    // append inventory_record return transactions to inventory_record stock transactions for unified display
    for (const ret of inventory_record_returns) {
      const retTrans = (await stockTransactionApi.getAll({ status: 1, reference_type: 'inventory_record_return', reference_id: ret.id }))?.data || [];
      inventory_record_stock_transactions = inventory_record_stock_transactions.concat(retTrans);
    }

    // append inventory_record_return journals to inventory_record journals for unified display
    for (const ret of inventory_record_returns) {
      const retJournals = (await journalApi.getAll({ status: 1, reference_type: 'inventory_record_return', reference_id: ret.id }))?.data || [];
      inventory_record_journals = inventory_record_journals.concat(retJournals);
    }

    for (const p of inventory_record_payments) {
      const paymentJournals = (await journalApi.getAll({ status: 1, reference_type: 'inventory_record_payment', reference_id: p.id }))?.data || [];
      inventory_record_journals = inventory_record_journals.concat(paymentJournals);
    }
    loading = false;
  }
  async function doUpdateInventoryRecord() {
    saving = true;
    try {
      /*
       * Backend updates header, replaces items, and refreshes
       * posted journals / stock when needed.
       */
      await inventoryRecordApi.update(inventory_record.id, {
        total_amount: totalAmount,
        description: inventory_record.description,
        discount_amount: inventory_record.discount_amount,
        expense_amount: inventory_record.expense_amount,
        items: inventory_record_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: Number(item.quantity || 0),
          buy_price: Number(item.buy_price || 0),
          buy_price_currency: item.buy_price_currency || item.currency || inventory_record_currency,
          unit_price: Number(item.unit_price || 0),
          currency: item.currency || inventory_record_currency,
          discount_type: 'fixed',
          discount_amount: 0,
          subtotal: Number(item.unit_price || 0) * Number(item.quantity || 0),
          status: 1,
        })),
      });
      await calculateRemainingAndBenefit(inventory_record.id);
      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('InventoryRecord updated successfully.'),
        confirmButtonText: t('OK'),
      });
      dispatch('close');
      push(`/dashboard/inventory_records`);
    } catch (e) {
      console.error('Error updating inventory_record:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the inventory_record.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateInventoryRecord() {
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
      text: t('Are you sure you want to update this inventory_record? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateInventoryRecord();

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
            {t('Update InventoryRecord')}
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
                  {t('Are you sure you want to update this inventory_record? This action cannot be undone.')}<br />
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
                          : inventory_record_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Payments')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_payments.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Returns')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_returns.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Return Items')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_return_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Journals')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_journals.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : inventory_record_stock_transactions.length}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- create a mini captcha system -->
                <div class="mt-4">
                  <small>
                    {t(`To confirm updating, please type`)}
                    {randomNumber}
                    {t(`in the box below:`)}
                  </small>
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
                  <strong>{t('Invoice #')}</strong>
                  : {inventory_record.invoice_number}
                </div>

                <div class="mb-3">
                  <strong>{t('Invoice Date')}</strong>
                  : {inventory_record.invoice_date.slice(0, 10)}
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
                      {#each inventory_record_items as item, index}
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
                    >{t('Total')}
                    : {subTotalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(inventory_record.currency)}</strong>
                </div>
                <div class="mb-3 d-flex gap-3">
                
                  <div class="input-group">
                    <div class="input-group-text">{t('Expenses')}</div>
                    <input class="form-control" placeholder={t('Expenses')} bind:value={inventory_record.expense_amount} />
                  </div>

                  <div class="input-group">
                    <div class="input-group-text">{t('Discount')}</div>
                    <input class="form-control" placeholder={t('Discount')} bind:value={inventory_record.discount_amount} />
                  </div>
                  
                  
                </div>

                <div class="mb-3">
                  <strong
                    >{t('Total Amount')}
                    : {totalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(inventory_record.currency)}</strong>
                </div>

                <div class="mb-3">
                  <textarea class="form-control" placeholder={t('Description')} bind:value={inventory_record.description}></textarea>
                </div>
              </div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => dispatch('close')}
            ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
          <button class="btn btn-info" on:click={updateInventoryRecord} disabled={saving || loading}
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
