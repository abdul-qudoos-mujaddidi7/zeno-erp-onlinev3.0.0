<script>
  import { prescriptionApi } from '../../../api/prescriptionApi.js';
import { productUnitApi } from '../../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

import { currencyApi } from '../../../api/currencyApi.js';
import { productApi } from '../../../api/productApi.js';
import { journalApi } from '../../../api/journalApi.js';
import { stockTransactionApi } from '../../../api/stockTransactionApi.js';
  export let prescription;

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

  let prescription_items = [];
  let prescription_payments = [];
  let prescription_returns = [];
  let prescription_return_items = [];

  let prescription_journals = [];

  let prescription_stock_transactions = [];

  let totalAmount = 0;
  let prescription_currency = '';
  let subTotalAmount = 0;

  $: if (prescription_items.length > 0) {
    subTotalAmount = prescription_items.reduce((s, i) => { 
        if (i.currency && prescription_currency && i.currency !== prescription_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, prescription_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);
  } else {
    subTotalAmount = 0;
  }


  $: if (prescription_items.length > 0) {

    totalAmount = prescription_items.reduce((s, i) => { 
        if (i.currency && prescription_currency && i.currency !== prescription_currency) {
            return s + exchangeRate(i.unit_price* i.quantity, i.currency, prescription_currency);
        } else {
            return s + i.unit_price * i.quantity;
        }
    }, 0);

    if (prescription.discount_amount > totalAmount) {
      prescription.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - prescription.discount_amount;
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    await loadPrescriptionDetails();
  });

  async function loadPrescriptionDetails() {
    if (!prescription) return;

    const response = await prescriptionApi.getById(Number(prescription.id));
    prescription = response?.data;
    prescription_currency = prescription.currency;
    prescription_items = (prescription.items || []).filter((item) => Number(item.status) === 1);
    prescription_payments = (prescription.payments || []).filter((p) => Number(p.status) === 1);
    prescription_returns = (prescription.returns || []).filter((r) => Number(r.status) === 1);
    prescription_return_items = prescription_returns.flatMap((r) => r.items || []);

    prescription_journals = (await journalApi.getAll({ status: 1, reference_type: 'prescription', reference_id: prescription.id }))?.data || [];
    prescription_stock_transactions = (await stockTransactionApi.getAll({ status: 1, reference_type: 'prescription', reference_id: prescription.id }))?.data || [];

    for (const ret of prescription_returns) {
      const retTrans = (await stockTransactionApi.getAll({ status: 1, reference_type: 'prescription_return', reference_id: ret.id }))?.data || [];
      prescription_stock_transactions = prescription_stock_transactions.concat(retTrans);
    }

    for (const ret of prescription_returns) {
      const retJournals = (await journalApi.getAll({ status: 1, reference_type: 'prescription_return', reference_id: ret.id }))?.data || [];
      prescription_journals = prescription_journals.concat(retJournals);
    }

    for (const p of prescription_payments) {
      const paymentJournals = (await journalApi.getAll({ status: 1, reference_type: 'prescription_payment', reference_id: p.id }))?.data || [];
      prescription_journals = prescription_journals.concat(paymentJournals);
    }
    loading = false;
  }
  async function doUpdatePrescription() {
    saving = true;
    try {
      await prescriptionApi.update(prescription.id, {
        total_amount: totalAmount,
        description: prescription.description,
        discount_amount: prescription.discount_amount,
        items: prescription_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: item.currency,
          discount_type: item.discount_type,
          discount_amount: item.discount_amount,
          subtotal: item.subtotal,
          dosage: item.dosage,
          dosage_unit: item.dosage_unit,
          frequency: item.frequency,
          duration: item.duration,
          duration_unit: item.duration_unit,
          route: item.route,
          instructions: item.instructions,
          status: item.status ?? 1,
        })),
      });

      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Prescription updated successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');

      push(`/dashboard/prescriptions`);
    } catch (e) {
      console.error('Error updating prescription:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the prescription.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updatePrescription() {
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
      text: t('Are you sure you want to update this prescription? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdatePrescription();
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
          {t('Update Prescription')}
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
                {t('Are you sure you want to update this prescription? This action cannot be undone.')}<br />
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
                        : prescription_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Payments')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : prescription_payments.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Returns')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : prescription_returns.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Return Items')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : prescription_return_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Journals')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : prescription_journals.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : prescription_stock_transactions.length}</td>
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
                <strong>{t('Invoice #')}</strong>
                : {prescription.invoice_number}
              </div>

              <div class="mb-3">
                <strong>{t('Invoice Date')}</strong>
                : {prescription.invoice_date.slice(0, 10)}
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
                    {#each prescription_items as item, index}
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
                  {t(prescription.currency)}</strong>
              </div>
              <div class="mb-3">
                <div class="input-group">
                  <div class="input-group-text">{t('Discount')}</div>
                  <input class="form-control" placeholder={t('Discount')} bind:value={prescription.discount_amount} />
                </div>
              </div>

              <div class="mb-3">
                <strong
                  >{t('Total Amount')}
                  : {totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(prescription.currency)}</strong>
              </div>

              <div class="mb-3">
                <textarea class="form-control" placeholder={t('Description')} bind:value={prescription.description}></textarea>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-info" on:click={updatePrescription} disabled={saving || loading}
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
