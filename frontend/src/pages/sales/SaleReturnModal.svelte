<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import AppModal from '../../components/common/AppModal.svelte';
  import { toast } from '../../ToastUI/toast.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let sale = null; // parent passes sale object

  const dispatch = createEventDispatcher();
  
  import {calculateRemainingAndBenefit} from './SalesHelper.js';

import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { saleApi } from '../../api/saleApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';

  let items = [];
  let units = [];
  let products = [];
  let returnItems = [];
  let warehouse = null;
  let account = null;
  let currencies = [];
  let currency = '';
  let returnDate = new Date().toISOString().slice(0, 10);
  let description = '';
  let totalAmount = 0;
  let saving = false;

  let returns = [];
  let returnsWithItems = [];

  onMount(async () => {
    if (!sale) return;
    warehouse =
      (await warehouseApi.getAll({ status: 1 }))?.data?.find(
        (w) => Number(w.id) === Number(sale.warehouse_id),
      ) || null;
    const accountResponse = await accountApi.getById(sale.account_id);
    account = accountResponse?.data || null;
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    currency = sale.currency || currencies[0]?.code || 'AFN';
    const saleResponse = await saleApi.getById(sale.id);
    const fullSale = saleResponse?.data || sale;
    items = (fullSale.items || []).filter((i) => Number(i.status) === 1);
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    // Prepare returnItems with default values
    returns = (fullSale.returns || []).filter((r) => Number(r.status) === 1);
    let tempReturnsWithItems = [];
    for (const r of returns) {
      // Ensure type match for sale_return_id
      const items = (r.items || []).filter((ri) => Number(ri.status) === 1);
      tempReturnsWithItems.push({
        ...r,
        returns: items,
      });
    }
    returnsWithItems = tempReturnsWithItems;

    returnItems = items.map((i) => ({
      ...i,
      remaining_qty:
        i.quantity -
        returnsWithItems.reduce((sum, r) => {
          const returnItem = r.returns.find(
            (ri) => ri.product_id === i.product_id && ri.product_unit_id === i.product_unit_id,
          );
          return sum + (returnItem ? returnItem.quantity : 0);
        }, 0),
      return_quantity: 0,
      return_unit_price: i.unit_price,
      return_subtotal: 0,
    }));
  });

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

  $: totalAmount = returnItems.reduce((s, i) => {
    if (i.currency && currency && i.currency !== currency) {
      let exchangeRateValue = exchangeRate(i.return_subtotal, i.currency, currency);
      console.log(
        `Converting ${i.return_subtotal} from ${i.currency} to ${currency} for total calculation - exchange rate value: ${exchangeRateValue}`,
      );
      return s + exchangeRateValue;
    } else {
      return s + i.return_subtotal;
    }
  }, 0);
  function updateReturnItem(idx) {
    let item = returnItems[idx];
    if (item.return_quantity < 0) item.return_quantity = 0;
    if (item.return_quantity > item.remaining_qty) item.return_quantity = item.remaining_qty;
    if (item.return_unit_price < 0) item.return_unit_price = 0;
    item.return_subtotal = item.return_quantity * item.return_unit_price;
    returnItems = [...returnItems];
  }

  async function saveReturn() {
    if (saving) return;
    if (!sale || !warehouse || !account) {
      toast.error(t('Error'), t('Missing sale, warehouse, or account.'));
      return;
    }
    const validItems = returnItems.filter((i) => i.return_quantity > 0 && i.return_quantity <= i.quantity);
    if (validItems.length === 0) {
      toast.error(t('Error'), t('Select at least one item to return.'));
      return;
    }

    saving = true;
    try {
      const returnItemsPayload = validItems.map((i) => ({
        product_id: i.product_id,
        product_unit_id: i.product_unit_id,
        quantity: Number(i.return_quantity || 0),
        unit_price: Number(i.return_unit_price || 0),
        currency: i.currency || currency,
        subtotal: Number(i.return_subtotal || 0),
        status: 1,
      }));

      /*
       * The backend creates the sale return, its items, restores
       * stock and posts the RECEIVABLE/customer journal atomically.
       */
      await saleApi.createReturn(sale.id, {
        warehouse_id: warehouse.id,
        account_id: account.id,
        return_number: 'SR-' + Date.now(),
        return_date: returnDate,
        total_amount: totalAmount,
        description,
        currency,
        return_status: 'confirmed',
        status: 1,
        items: returnItemsPayload,
      });

      await calculateRemainingAndBenefit(Number(sale.id));
      dispatch('saved');
      toast.success(t('Success'), t('Sale return recorded successfully.'));
      dispatch('close');
    } catch (err) {
      toast.error(t('Error'), t('Error saving sale return: ') + err.message);
      console.error('Error saving sale return:', err);
    } finally {
      saving = false;
    }
  }
</script>

<AppModal
  title={t('Sales Return')}
  icon="bi-arrow-return-left"
  variant="warning"
  size="xl"
  loading={saving}
  on:close={() => dispatch('close')}>
  <div class="app-modal-field" style="margin-bottom: 14px;">
    <label for="sale-return-date">{t('Return Date')}</label>
    <input id="sale-return-date" type="date" bind:value={returnDate} />
  </div>
  <div class="app-modal-field" style="margin-bottom: 16px;">
    <label for="sale-return-description">{t('Description')}</label>
    <textarea id="sale-return-description" rows="2" bind:value={description}></textarea>
  </div>

  <div class="return-table-wrap">
    <table class="return-table">
      <thead>
        <tr>
          <th>{t('Product')}</th>
          <th>{t('Remaining Qty')}</th>
          <th>{t('Return Qty')}</th>
          <th>{t('Sold Price')}</th>
          <th>{t('Return Price')}</th>
          <th class="return-table__num">{t('Subtotal')}</th>
        </tr>
      </thead>
      <tbody>
        {#each returnItems as item, idx}
          <tr>
            <td>{products.find((p) => p.id === item.product_id)?.name}</td>
            <td>{item.remaining_qty} {units.find((u) => u.id === item.product_unit_id)?.name}</td>
            <td>
              <div class="return-table__input-group">
                <input
                  type="number"
                  min="0"
                  max={item.remaining_qty}
                  bind:value={item.return_quantity}
                  on:input={() => updateReturnItem(idx)} />
                <span>{units.find((u) => u.id === item.product_unit_id)?.name}</span>
              </div>
            </td>
            <td class="return-table__num">{item.unit_price} {t(item.currency)}</td>
            <td>
              <div class="return-table__input-group">
                <input
                  type="number"
                  min="0"
                  step="any"
                  bind:value={item.return_unit_price}
                  on:input={() => updateReturnItem(idx)} />
                <span>{t(item.currency)}</span>
              </div>
            </td>
            <td class="return-table__num return-table__amount">
              {#if item.currency !== currency}
                {exchangeRate(Number(item.return_subtotal), item.currency, currency).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency)}
              {:else}
                {Number(item.return_subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(item.currency)}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="return-total">
    <strong>{t('Total Return Amount')}:</strong>
    <span dir="ltr">{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 3 })} {t(currency)}</span>
  </div>

  <svelte:fragment slot="footer">
    <button type="button" class="app-modal-btn app-modal-btn--secondary" disabled={saving} on:click={() => dispatch('close')}>
      <i class="bi bi-x-lg"></i>
      {t('Cancel')}
    </button>
    <button type="button" class="app-modal-btn app-modal-btn--primary" on:click={saveReturn} disabled={saving}>
      {#if saving}
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      {:else}
        <i class="bi bi-save"></i>
      {/if}
      {t('Save Return')}
    </button>
  </svelte:fragment>
</AppModal>

<style>
  .return-table-wrap {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
  }

  .return-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .return-table th {
    background: #f8fafc;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    padding: 10px 12px;
    text-align: start;
    border-bottom: 1px solid #e2e8f0;
  }

  .return-table td {
    padding: 10px 12px;
    border-block-start: 1px solid #f1f5f9;
    font-size: 13px;
    vertical-align: middle;
  }

  .return-table__num,
  .return-table th.return-table__num {
    text-align: end;
  }

  .return-table__amount {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .return-table__input-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .return-table__input-group input {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 13px;
  }

  .return-table__input-group span {
    font-size: 12px;
    color: #64748b;
    white-space: nowrap;
  }

  .return-total {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 14px;
  }

  .return-total span {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
  }
</style>
