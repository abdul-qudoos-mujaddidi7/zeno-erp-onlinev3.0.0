<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  import { toast } from '../../ToastUI/toast.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let inventory_record = null; // parent passes inventory_record object

  const dispatch = createEventDispatcher();
  
  import {calculateRemainingAndBenefit} from './InventoryRecordsHelper.js';

import { currencyApi } from '../../api/currencyApi.js';
import { warehouseApi } from '../../api/warehouseApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';

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
    if (!inventory_record) return;
    warehouse =
      (await warehouseApi.getAll({ status: 1 }))?.data?.find(
        (w) => Number(w.id) === Number(inventory_record.warehouse_id),
      ) || null;
    account = await (async () => { const _a = (await accountApi.getById(inventory_record.account_id))?.data; return _a && _a.status === 1 ? _a : null; })();
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];
    currency = inventory_record.currency || currencies[0]?.code || 'AFN';
    const inventory_recordResponse = await inventoryRecordApi.getById(inventory_record.id);
    const fullRecord = inventory_recordResponse?.data || inventory_record;
    items = (fullRecord.items || []).filter((i) => Number(i.status) === 1);
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    products = (await productApi.getAll({ status: 1 }))?.data || [];
    // Prepare returnItems with default values
    returns = (fullRecord.returns || []).filter((r) => Number(r.status) === 1);
    let tempReturnsWithItems = [];
    for (const r of returns) {
      // Ensure type match for inventory_record_return_id
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
    if (!inventory_record || !account) {
      toast.error(t('Error'), t('Missing inventory_record or account.'));
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
       * Backend creates the return, its items, restores stock and
       * posts journals atomically.
       */
      await inventoryRecordApi.createReturn(inventory_record.id, {
        warehouse_id: warehouse?.id || inventory_record.warehouse_id || null,
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

      await calculateRemainingAndBenefit(Number(inventory_record.id));
      dispatch('saved');
      toast.success(t('Success'), t('InventoryRecord return recorded successfully.'));
      dispatch('close');
    } catch (err) {
      toast.error(t('Error'), t('Error saving inventory_record return: ') + err.message);
      console.error('Error saving inventory_record return:', err);
    } finally {
      saving = false;
    }
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={close}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-arrow-return-left"></i>
          {t('InventoryRecords Return')}
        </h5>
        <button type="button" class="btn-close" on:click={() => dispatch('close')}></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">{t('Return Date')}</label>
          <input type="date" class="form-control" bind:value={returnDate} />
        </div>
        <div class="mb-3">
          <label class="form-label">{t('Description')}</label>
          <textarea class="form-control" rows="2" bind:value={description}></textarea>
        </div>

        <div class="table-responsive">
          <table class="table table-bordered">
            <thead>
              <tr>
                <th>{t('Product')}</th>
                <th>{t('Remaining Qty')}</th>
                <th>{t('Return Qty')}</th>
                <th>{t('Sold Price')}</th>
                <th>{t('Return Price')}</th>
                <th>{t('Subtotal')}</th>
              </tr>
            </thead>
            <tbody>
              {#each returnItems as item, idx}
                <tr>
                  <td>{products.find((p) => p.id === item.product_id)?.name}</td>
                  <td
                    >{item.remaining_qty}
                    {units.find((u) => u.id === item.product_unit_id)?.name}</td>
                  <td>
                    <div class="input-group">
                      <input
                        type="number"
                        class="form-control"
                        min="0"
                        max={item.remaining_qty}
                        bind:value={item.return_quantity}
                        on:input={() => updateReturnItem(idx)} />
                      <span class="input-group-text">{units.find((u) => u.id === item.product_unit_id)?.name}</span>
                    </div>
                  </td>
                  <td>{item.unit_price} {t(item.currency)}</td>
                  <td>
                    <div class="input-group">
                      <input
                        type="number"
                        class="form-control"
                        min="0"
                        step="any"
                        bind:value={item.return_unit_price}
                        on:input={() => updateReturnItem(idx)} />
                      <span class="input-group-text">{t(item.currency)}</span>
                    </div>
                  </td>
                  <td>{item.return_subtotal} {t(item.currency)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="mt-3 text-end">
          <strong
            >{t('Total Return Amount')}: {totalAmount}
            {t(currency)}</strong>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-primary" on:click={saveReturn} disabled={saving}
          ><i class="bi bi-save"></i> {t('Save Return')}</button>
      </div>
    </div>
  </div>
</div>
