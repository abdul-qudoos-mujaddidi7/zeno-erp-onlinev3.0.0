<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
import { settingsApi } from '../../api/settingsApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';

  import { calculateProductStock } from '../stocktransactions/calculateStock.js';
import { currencyApi } from '../../api/currencyApi.js';
import { purchaseApi } from '../../api/purchaseApi.js';
import { productApi } from '../../api/productApi.js';
import { journalApi } from '../../api/journalApi.js';
import { stockTransactionApi } from '../../api/stockTransactionApi.js';
  export let purchase;

  const dispatch = createEventDispatcher();

  $: enable_purchase_items_discount = $settings_all.find((s) => s.key === 'enable_purchase_items_discount')?.value == 1;

  let saving = false;
  let products = [];
  let units = [];
  let currencies = [];

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

  let enable_expiry_date = false;
  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100;
  let loading = true;
  let purchase_items = [];

  let purchase_payments = [];
  let purchase_returns = [];
  let purchase_return_items = [];
  let purchase_currency = '';
  let purchase_journals = [];
  
  let purchase_stock_transactions = [];
  let totalAmount = 0;

  $: if (purchase_items.length > 0) {
    totalAmount = purchase_items.reduce((s, i) => {
      if (i.currency && purchase_currency && i.currency !== purchase_currency) {
        return s + exchangeRate(i.unit_price * i.quantity, i.currency, purchase_currency);
      } else {
        return s + i.unit_price * i.quantity;
      }
    }, 0);
  } else {
    totalAmount = 0;
  }
  onMount(async () => {
    enable_expiry_date =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_expiry_date' }))?.data?.[0]
      )?.value == 1;
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    await loadPurchaseDetails();

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
  });

  async function loadPurchaseDetails() {
    if (!purchase) return;

    const response = await purchaseApi.getById(Number(purchase.id));
    purchase = response?.data;
    purchase_currency = purchase.currency;
    // Load purchase items
    purchase_items = (purchase.items || []).sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at),
    );

    // Load payments
    purchase_payments = purchase.payments || [];

    // Load returns
    purchase_returns = (purchase.returns || []).filter((r) => Number(r.status) === 1);

    purchase_return_items = purchase_returns.flatMap((r) => r.items || []);

    // Load associated journals (online)
    const journalResponse =
      await journalApi.getAll({
        status: 1,
        reference_id: purchase.id,
        reference_type: 'purchase',
      });

    purchase_journals = journalResponse?.data || [];

    // Load associated stock transactions
    purchase_stock_transactions = (await stockTransactionApi.getAll({ status: 1, reference_type: 'purchase', reference_id: purchase.id }))?.data || [];

    // append purchase return transactions to purchase stock transactions for unified display
    for (const ret of purchase_returns) {
      const retTrans = (await stockTransactionApi.getAll({ status: 1, reference_type: 'purchase_return', reference_id: ret.id }))?.data || [];
      purchase_stock_transactions = purchase_stock_transactions.concat(retTrans);
    }

    // append purchase_return/payment journals for unified display
    const purchaseRefs = new Set([
      ...purchase_returns.map((r) => r.id),
      ...purchase_payments.map((p) => p.id),
    ]);

    if (purchaseRefs.size > 0) {
      const refJournalResponse =
        await journalApi.getAll({ status: 1 });

      purchase_journals = purchase_journals.concat(
        (refJournalResponse?.data || []).filter(
          (j) =>
            (j.reference_type === 'purchase_return' ||
              j.reference_type === 'purchase_payment') &&
            purchaseRefs.has(Number(j.reference_id)),
        ),
      );
    }
    loading = false;
  }
  async function doUpdatePurchase() {
    saving = true;
    try {
      // Persist header + items through the backend API
      const updateResponse = await purchaseApi.update(purchase.id, {
        total_amount: totalAmount,
        description: purchase.description,
        items: purchase_items.map((item) => ({
          product_id: item.product_id,
          product_unit_id: item.product_unit_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sell_price: item.sell_price,
          currency: item.currency,
          sell_currency: item.sell_currency,
          discount_type: item.discount_type,
          discount_amount: item.discount_amount,
          subtotal: item.subtotal,
          batch: item.batch,
          manufacturing_date: item.manufacturing_date,
          expiry_date: item.expiry_date,
        })),
      });
      let updatedPurchase = updateResponse.data;

      // The backend updates the purchase journal total on
      // /api/v2/purchases/:id when the edited amount changes.

      let stockTransToUpdate = (await stockTransactionApi.getAll({ status: 1, reference_type: 'purchase', reference_id: purchase.id }))?.data || [];

      for (const st of stockTransToUpdate) {
        let item = purchase_items.find((p) => p.product_id === st.product_id);
        if (!item) {
          alert('Item not found: ' + st.product_id);
        } else {
          if (!item.sell_currency) {
            console.error(
              'From Purchase Edit ' + updatedPurchase.id + ' Form: item.sell_currency is ' + item.sell_currency,
            );
          }
          await stockTransactionApi.update(st.id, {
            warehouse_id: st.warehouse_id,
            product_id: st.product_id,
            product_unit_id: st.product_unit_id,
            reference_id: st.reference_id,
            reference_type: st.reference_type,
            transaction_type: st.transaction_type,
            quantity: Number(item.quantity),
            unit_cost: Number(item.unit_price),
            total_cost: Number(item.unit_price) * Number(item.quantity),
            currency: item.currency,
            peer_price: Number(item.sell_price),
            peer_currency: item.sell_currency || item.currency,
            date: st.date,
            batch: st.batch,
            manufacturing_date: st.manufacturing_date,
            expiry_date: item.expiry_date,
            heaviness: st.heaviness,
            description: `Updated stock transaction from Purchase #${purchase.id}`,
            status: st.status ?? 1,
          });

          await productApi.update(item.product_id, {
            buy_price: item.unit_price,
            buy_currency: item.currency,
            expiry_date: item.expiry_date,
            sell_price: item.sell_price,
            sell_currency: item.sell_currency || item.currency,
          });

          await calculateProductStock(Number(st.product_id), 'single');
        }
      }

      Swal.fire({
        icon: 'success',
        title: t('Updated!'),
        text: t('Purchase updated successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');

      push(`/dashboard/purchases`);
    } catch (e) {
      console.error('Error updating purchase:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while updating the purchase.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function updatePurchase() {
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
      text: t('Are you sure you want to update this purchase? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, update it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doUpdatePurchase();
      }
    });
  }

  function recalc(index) {
    purchase_items[index].subtotal = Number(purchase_items[index].quantity) * Number(purchase_items[index].unit_price);
    purchase_items[index].total_amount =
      Number(purchase_items[index].quantity) * Number(purchase_items[index].unit_price);
    if (purchase_items[index].discount_type === 'percent') {
      purchase_items[index].subtotal =
        purchase_items[index].subtotal - (purchase_items[index].subtotal * purchase_items[index].discount_amount) / 100;
    } else if (purchase_items[index].discount_type === 'fixed') {
      purchase_items[index].subtotal = purchase_items[index].subtotal - Number(purchase_items[index].discount_amount);
    }
    purchase_items = [...purchase_items];
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-arrow-return-left"></i>
          {t('Update Purchase')}
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
                {t('Are you sure you want to update this purchase? This action cannot be undone.')}<br />
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
                        : purchase_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Payments')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t('Loading...')}</span>
                          </div>`
                        : purchase_payments.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Returns')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t('Loading...')}</span>
                          </div>`
                        : purchase_returns.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Return Items')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t('Loading...')}</span>
                          </div>`
                        : purchase_return_items.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Journals')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t('Loading...')}</span>
                          </div>`
                        : purchase_journals.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('Associated Stock Transactions')}:</strong></td>
                    <td class="fw-bold ps-3"
                      >{@html loading
                        ? `<div class="spinner-border spinner-border-sm" role="status">
                            <span class="visually-hidden">${t('Loading...')}</span>
                          </div>`
                        : purchase_stock_transactions.length}</td>
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
                <strong>{t('Bill #')}</strong>
                : {purchase.bill_number}
              </div>
              <div class="mb-3">
                <strong>{t('Bill Date')}</strong>
                : {purchase.bill_date.slice(0, 10)}
              </div>
              <div class="table-responsive">
                <table class="table table-sm table-bordered">
                  <thead>
                    <tr>
                      <th>{t('Product')}</th>
                      {#if enable_expiry_date}<th class="text-center">{t('Expiry Date')}</th>{/if}
                      <th>{t('Buy Price')}</th>
                      <th>{t('Sell Price')}</th>
                      <th>{t('Quantity')}</th>
                      {#if enable_purchase_items_discount}
                        <th>{t('Discount')}</th>
                      {/if}
                      <th>{t('Subtotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each purchase_items as item, index}
                      <tr>
                        <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                        {#if enable_expiry_date}<td>
                            <input type="date" bind:value={item.expiry_date} class="form-control form-control-sm" />
                          </td>{/if}
                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" bind:value={item.unit_price} class="form-control form-control-sm" />
                            <span class="input-group-text">{t(item.currency)}</span>
                          </div>
                        </td>
                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" bind:value={item.sell_price} class="form-control form-control-sm" />
                            <span class="input-group-text">{t(item.sell_currency)}</span>
                          </div>
                        </td>
                        <td>
                          <div class="input-group input-group-sm">
                            <input type="number" bind:value={item.quantity} class="form-control form-control-sm" />
                            <span class="input-group-text"
                              >{units.find((u) => u.id === item.product_unit_id)?.name}</span>
                          </div>
                        </td>
                        {#if enable_purchase_items_discount}
                          <td>
                            <div class="input-group input-group-sm">
                              <button
                                class="btn btn-sm btn-{item.discount_type === 'fixed'
                                  ? 'outline-secondary'
                                  : 'success'} pt-1"
                                on:click={() => {
                                  if (item.discount_type === 'percent') {
                                    item.discount_amount = Number(
                                      item.total_amount * (item.discount_amount / 100),
                                    ).toFixed(2);
                                    item.discount_type = 'fixed';
                                  } else {
                                    item.discount_amount =
                                      item.total_amount > 0
                                        ? Number((item.discount_amount / item.total_amount) * 100).toFixed(2)
                                        : 0;
                                    item.discount_type = 'percent';
                                  }
                                  setTimeout(() => {
                                    if (window.mdb) {
                                      document
                                        .querySelectorAll('[data-mdb-input-init]')
                                        .forEach((el) => new window.mdb.Input(el));
                                    }
                                  }, 100);
                                }}
                                ><i class="bi bi-{item.discount_type === 'fixed' ? 'cash-stack' : 'percent'}"></i
                                ></button>
                              <div class="form-outline" data-mdb-input-init>
                                <input
                                  type="number"
                                  id="discountAmount"
                                  class="form-control form-control-sm {item.discount_amount !== null &&
                                  item.discount_amount <= item.total_amount
                                    ? 'is-valid'
                                    : item.discount_amount == null
                                      ? 'is-invalid'
                                      : ''}"
                                  bind:value={item.discount_amount}
                                  on:input={() => {
                                    if (item.discount_amount === '') {
                                      item.discount_amount = null;
                                    } else if (item.discount_amount < 0) {
                                      item.discount_amount = 0;
                                    } else if (
                                      item.discount_type !== 'percent' &&
                                      item.discount_amount > item.total_amount
                                    ) {
                                      item.discount_amount = item.total_amount;
                                    } else if (item.discount_type === 'percent' && item.discount_amount > 100) {
                                      item.discount_amount = 100;
                                    } else {
                                      item.discount_amount = Number(item.discount_amount);
                                    }
                                    recalc(index);
                                  }} />
                                <label class="form-label" for="discountAmount">{t('Discount')}</label>
                              </div>

                              <div class="input-group-text">
                                {item.discount_type == 'fixed'
                                  ? ''
                                  : Number((item.total_amount * item.discount_amount) / 100 || 0).toFixed(2)}
                                {item.unit_price_currency ? t(item.unit_price_currency) : t(purchase.currency)}
                              </div>
                            </div>
                          </td>
                        {/if}
                        <td>
                          <div class="input-group input-group-sm">
                            {item.subtotal.toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}&nbsp;{t(purchase_currency)}
                            <!-- {#if item.currency != purchase_currency}
                                {exchangeRate(item.unit_price * item.quantity,item.currency,purchase_currency).toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}&nbsp;{t(purchase_currency)}
                          {:else}
                            {(item.unit_price * item.quantity).toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}&nbsp;{t(purchase_currency)}
                           {/if} -->
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
                  {t(purchase.currency)}</strong>
              </div>

              <div class="mb-3">
                <textarea class="form-control" placeholder={t('Description')} bind:value={purchase.description}
                ></textarea>
              </div>
            </div>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-info" on:click={updatePurchase} disabled={saving || loading}
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
