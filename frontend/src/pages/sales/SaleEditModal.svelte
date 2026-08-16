<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  export let sale;

  import {calculateRemainingAndBenefit, resolveCostCurrency} from './SalesHelper.js';
import { currencyApi } from '../../api/currencyApi.js';
import { saleApi } from '../../api/saleApi.js';
import { productApi } from '../../api/productApi.js';
import { journalApi } from '../../api/journalApi.js';
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

  let sale_items = [];
  let sale_payments = [];
  let sale_returns = [];
  let sale_return_items = [];

  let sale_journals = [];

  let sale_stock_transactions = [];

  let totalAmount = 0;
  let sale_currency = '';
  let subTotalAmount = 0;

  $: if (sale_items.length > 0) {
    subTotalAmount = sale_items.reduce((s, i) => { 
        if (i.currency && sale_currency && i.currency !== sale_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, sale_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
  } else {
    subTotalAmount = 0;
  }


  $: if (sale_items.length > 0) {
    totalAmount = sale_items.reduce((s, i) => { 
        if (i.currency && sale_currency && i.currency !== sale_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, sale_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
    if (sale.discount_amount > totalAmount) {
      sale.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - Number(sale.discount_amount || 0) + Number(sale.expense_amount || 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    await loadSaleDetails();
  });

  async function loadSaleDetails() {
    if (!sale) return;

    const saleResponse = await saleApi.getById(Number(sale.id));
    sale = saleResponse?.data || sale;
    sale_currency = sale.currency;
    // Load sale items
 
      sale_items = (sale.items || [])
  .filter((item) => Number(item.status) === 1)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // set sale item currency as default if not available

    sale_items = sale_items.map(si=>{
      if (!si.currency) {
        return {...si, currency: sale_currency}
      }
      return si;
    });

    // Load payments
    sale_payments = (sale.payments || []).filter((p) => Number(p.status) === 1);

    // Load returns
    sale_returns = (sale.returns || []).filter((r) => Number(r.status) === 1);

    const returnIds = sale_returns.map((r) => r.id);
    if (returnIds.length > 0) {
      sale_return_items = sale_returns.flatMap(
        (r) => (r.items || []).filter((ri) => Number(ri.status) === 1),
      );
    }

    // Load associated journals
    sale_journals =
      (await journalApi.getAll({
        status: 1,
        reference_type: 'sale',
        reference_id: sale.id,
      }))?.data || [];

    // Load associated stock transactions
    sale_stock_transactions = [];

    // append sale_return journals to sale journals for unified display
    for (const ret of sale_returns) {
      const retJournals =
        (await journalApi.getAll({
          status: 1,
          reference_type: 'sale_return',
          reference_id: ret.id,
        }))?.data || [];
      sale_journals = sale_journals.concat(retJournals);
    }

    for (const p of sale_payments) {
      const paymentJournals =
        (await journalApi.getAll({
          status: 1,
          reference_type: 'sale_payment',
          reference_id: p.id,
        }))?.data || [];
      sale_journals = sale_journals.concat(paymentJournals);
    }
    loading = false;
  }
  async function doUpdateSale() {
    saving = true;
    try {
      /*
       * The backend updates the sale header, replaces its items
       * and refreshes the posted sale journal atomically.
       */
      await saleApi.update(sale.id, {
        total_amount: totalAmount,
        description: sale.description,
        discount_amount: sale.discount_amount,
        expense_amount: sale.expense_amount,
        items: sale_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: Number(item.quantity || 0),
          buy_price: Number(item.buy_price || 0),
          buy_price_currency: resolveCostCurrency(
            item,
            products.find((p) => Number(p.id) === Number(item.product_id)),
            sale_currency,
          ),
          unit_price: Number(item.unit_price || 0),
          currency: item.currency || sale_currency,
          discount_type: 'fixed',
          discount_amount: 0,
          subtotal: Number(item.unit_price || 0) * Number(item.quantity || 0),
          fifo_cost: Number(item.fifo_cost || 0),
          profit: Number(item.profit || 0),
          status: 1,
        })),
      });
      await calculateRemainingAndBenefit(sale.id);
      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Sale updated successfully.'),
        confirmButtonText: t('OK'),
      });
      dispatch('close');
      push(`/dashboard/sales`);
    } catch (e) {
      console.error('Error updating sale:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the sale.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateSale() {
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
      text: t('Are you sure you want to update this sale? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateSale();

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
            {t('Update Sale')}
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
                  {t('Are you sure you want to update this sale? This action cannot be undone.')}<br />
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
                          : sale_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Payments')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_payments.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Returns')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_returns.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Return Items')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_return_items.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Journals')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_journals.length}</td>
                    </tr>
                    <tr>
                      <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                      <td class="fw-bold ps-3"
                        >{@html loading
                          ? `<div class="spinner-border spinner-border-sm" role="status">
    <span class="visually-hidden">${t('Loading...')}</span>
  </div>`
                          : sale_stock_transactions.length}</td>
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
                  : {sale.invoice_number}
                </div>

                <div class="mb-3">
                  <strong>{t('Invoice Date')}</strong>
                  : {sale.invoice_date.slice(0, 10)}
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
                      {#each sale_items as item, index}
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
                    {t(sale.currency)}</strong>
                </div>
                <div class="mb-3 d-flex gap-3">
                
                  <div class="input-group">
                    <div class="input-group-text">{t('Expenses')}</div>
                    <input class="form-control" placeholder={t('Expenses')} bind:value={sale.expense_amount} />
                  </div>

                  <div class="input-group">
                    <div class="input-group-text">{t('Discount')}</div>
                    <input class="form-control" placeholder={t('Discount')} bind:value={sale.discount_amount} />
                  </div>
                  
                  
                </div>

                <div class="mb-3">
                  <strong
                    >{t('Total Amount')}
                    : {totalAmount.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}
                    {t(sale.currency)}</strong>
                </div>

                <div class="mb-3">
                  <textarea class="form-control" placeholder={t('Description')} bind:value={sale.description}></textarea>
                </div>
              </div>
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={() => dispatch('close')}
            ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
          <button class="btn btn-info" on:click={updateSale} disabled={saving || loading}
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
