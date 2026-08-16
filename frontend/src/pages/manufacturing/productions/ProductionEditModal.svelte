<script>
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
  import { productionApi } from '../../../api/productionApi.js';

  export let production;

  const dispatch = createEventDispatcher();

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
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
  let randomNumber = Math.floor(Math.random() * 900) + 100;
  let loading = true;

  let production_items = [];
  let production_payments = [];
  let production_returns = [];
  let production_return_items = [];
  let production_operations = [];

  let production_journals = [];
  let production_stock_transactions = [];

  let totalAmount = 0;
  let production_currency = '';
  let subTotalAmount = 0;

  $: if (production_items.length > 0) {
    subTotalAmount = production_items.reduce((s, i) => {
      if (i.currency && production_currency && i.currency !== production_currency) {
        return s + exchangeRate(i.unit_price * i.quantity, i.currency, production_currency);
      }
      return s + i.unit_price * i.quantity;
    }, 0);
  } else {
    subTotalAmount = 0;
  }

  $: if (production_items.length > 0) {
    totalAmount = production_items.reduce((s, i) => {
      if (i.currency && production_currency && i.currency !== production_currency) {
        return s + exchangeRate(i.unit_price * i.quantity, i.currency, production_currency);
      }
      return s + i.unit_price * i.quantity;
    }, 0);

    if (production.discount_amount > totalAmount) {
      production.discount_amount = totalAmount;
    }
    totalAmount = totalAmount - Number(production.discount_amount || 0);
  } else {
    totalAmount = 0;
  }

  onMount(async () => {
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    await loadProductionDetails();
  });

  async function loadProductionDetails() {
    if (!production) return;

    production = (await productionApi.getById(Number(production.id)))?.data || null;
    if (!production || Number(production.status) !== 1) {
      loading = false;
      return;
    }
    production_currency = production.currency;
    production_items = (production.items || []).filter((item) => Number(item.status) === 1);
    production_operations = (production.operations || []).filter((op) => Number(op.status) === 1);
    production_payments = (production.payments || []).filter((p) => Number(p.status) === 1);
    production_returns = (production.returns || []).filter((r) => Number(r.status) === 1);
    production_return_items = production_returns.flatMap((r) =>
      (r.items || []).filter((ri) => Number(ri.status) === 1),
    );

    production_journals =
      (await journalApi.getAll({
        status: 1,
        reference_type: 'production',
        reference_id: production.id,
      }))?.data || [];

    production_stock_transactions =
      (await stockTransactionApi.getAll({
        status: 1,
        reference_type: 'production',
        reference_id: production.id,
      }))?.data || [];

    for (const ret of production_returns) {
      const retTrans =
        (await stockTransactionApi.getAll({
          status: 1,
          reference_type: 'production_return',
          reference_id: ret.id,
        }))?.data || [];
      production_stock_transactions = production_stock_transactions.concat(retTrans);
    }

    for (const ret of production_returns) {
      const retJournals =
        (await journalApi.getAll({
          status: 1,
          reference_type: 'production_return',
          reference_id: ret.id,
        }))?.data || [];
      production_journals = production_journals.concat(retJournals);
    }

    for (const p of production_payments) {
      const paymentJournals =
        (await journalApi.getAll({
          status: 1,
          reference_type: 'production_payment',
          reference_id: p.id,
        }))?.data || [];
      production_journals = production_journals.concat(paymentJournals);
    }
    loading = false;
  }

  async function doUpdateProduction() {
    saving = true;
    try {
      /*
       * Backend updates the production header, replaces nested
       * items/operations, and refreshes stock/journals when confirmed.
       */
      await productionApi.update(production.id, {
        total_amount: totalAmount,
        description: production.description,
        discount_amount: production.discount_amount,
        items: production_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          currency: item.currency || production_currency,
          subtotal: Number(item.unit_price || 0) * Number(item.quantity || 0),
          status: 1,
        })),
        operations: production_operations.map((o) => ({
          bom_operation_id: o.bom_operation_id,
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
      });

      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Production updated successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');
      push(`/dashboard/productions`);
    } catch (e) {
      console.error('Error updating production:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the production.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updateProduction() {
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
      text: t('Are you sure you want to update this production? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdateProduction();
      }
    });
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={() => dispatch('close')}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-pencil"></i>
          {t('Update Production')}
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
                {t('Are you sure you want to update this production? This action cannot be undone.')}<br />
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
                        : production_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Payments')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : production_payments.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Returns')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : production_returns.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Return Items')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : production_return_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Journals')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : production_journals.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                        : production_stock_transactions.length}</td>
                  </tr>
                </tbody>
              </table>

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
                : {production.production_number}
              </div>

              <div class="mb-3">
                <strong>{t('Invoice Date')}</strong>
                : {(production.production_end_date || production.production_start_date || '').toString().slice(0, 10)}
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
                    {#each production_items as item}
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
                  {t(production.currency)}</strong>
              </div>
              <div class="mb-3">
                <div class="input-group">
                  <div class="input-group-text">{t('Discount')}</div>
                  <input class="form-control" placeholder={t('Discount')} bind:value={production.discount_amount} />
                </div>
              </div>

              <div class="mb-3">
                <strong
                  >{t('Total Amount')}
                  : {totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 3,
                  })}
                  {t(production.currency)}</strong>
              </div>

              <div class="mb-3">
                <textarea class="form-control" placeholder={t('Description')} bind:value={production.description}
                ></textarea>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-info" on:click={updateProduction} disabled={saving || loading}
          ><i class="bi bi-check-lg"></i>
          {@html saving
            ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Updating...')}</span>
</div>`
            : t('Update')}</button>
      </div>
    </div>
  </div>
</div>
