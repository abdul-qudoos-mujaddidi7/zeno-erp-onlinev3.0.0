<script>
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import PaymentSection from './PaymentSection.svelte';
  import InventoryRecordReceiptModal from './InventoryRecordReceiptModal.svelte';
  import InventoryRecordA4ReceiptModal from './InventoryRecordA4ReceiptModal.svelte';
  import WarehouseA4ReceiptModal from './WarehouseA4ReceiptModal.svelte';
  import InventoryRecordDeleteModal from './InventoryRecordDeleteModal.svelte';

  import InventoryRecordMakeDraftModal from './InventoryRecordMakeDraftModal.svelte';
  import InventoryRecordEditModal from './InventoryRecordEditModal.svelte';
  import { showDate } from '../../calendar.js';
  import { toast } from '../../ToastUI/toast.js';

  import { convertUnit, getMultiple } from '../stocktransactions/calculateStock.js';

  import { push } from 'svelte-spa-router';

  import { auth } from '../../auth/authStore.js';
  $: permissions = $auth.permissions;

  import { t, lang, translate_org_type, settings_all } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import InventoryRecordReturnModal from './InventoryRecordReturnModal.svelte';

  import { calculateDiscountAmount } from './InventoryRecordsHelper.js';
import { currencyApi } from '../../api/currencyApi.js';
import { accountApi } from '../../api/accountApi.js';
import { productApi } from '../../api/productApi.js';
import { inventoryRecordApi } from '../../api/inventoryRecordApi.js';

  $: enable_due_date = $settings_all.find((s) => s.key === 'enable_due_date')?.value == 1;
  $: enable_bill_of_warehouse = $settings_all.find((s) => s.key === 'enable_bill_of_warehouse')?.value == 1;

  export let inventory_recordId;
  const dispatch = createEventDispatcher();

  let paymentSectionKey = 0;
  let inventory_record;
  let products;
  let currencies = [];

  let items = [];
  let showReceipt = false;
  let showA4Receipt = false;
  let showWarehouseReceipt = false;
  let selectedItem = null;
  let customer = null;
  let units = [];

  let showReturn = false;

  let showDelete = false;
  let showDraft = false;
  let showEdit = false;

  let calculatedItems = [];

  $: if (currencies.length && products.length) {
    calculateItems();
  }

  async function calculateItems() {
    calculatedItems = await Promise.all(
      items.map(async (item) => {
        let product = products.find((p) => p.id === item.product_id);

        if (!product) return item;

        let costPrice = Number(item.buy_price || product.buy_price) || 0;

        if (item.buy_price_currency != inventory_record.currency) {
          costPrice = exchangeRate(costPrice, item.buy_price_currency || product.buy_currency, inventory_record.currency) || 0;
        }

        if (item.product_unit_id != product.product_unit_id) {
          const multiple = await getMultiple(Number(item.product_unit_id), Number(product.product_unit_id));
          costPrice = multiple * costPrice;
        }

        let benefit = (Number(item.unit_price) - costPrice) * Number(item.quantity);
        return {
          ...item,
          calculated_unit_price: costPrice,
          benefit,
        };
      }),
    );
  }

  onMount(async () => {
    // Load inventory_record
    const inventory_recordResponse = await inventoryRecordApi.getById(Number(inventory_recordId));
    inventory_record = inventory_recordResponse?.data;
    if (!inventory_record) {
      toast.error(t('Error'), t('InventoryRecord not found.'));
      return;
    }
    // Load inventory_record items
    const inventory_recordItems = (inventory_record.items || [])
  .filter((item) => Number(item.status) === 1)
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // Get all products involved
    const productIds = inventory_recordItems.map((i) => i.product_id);
    products = ((await productApi.getAll({ status: 1 }))?.data || []).filter((p) => productIds.includes(p.id));

    // Map product names into items
    items = inventory_recordItems.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_buy_price: product?.buy_price || 'Unknown',
        product_buy_currency: product?.buy_currency || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });

    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    currencies = (await currencyApi.getAll({ status: 1 }))?.data || [];

    customer = await (async () => { const _a = (await accountApi.getById(inventory_record.account_id))?.data; return _a && _a.status === 1 ? _a : null; })();
  });

  function exchangeRate(amount, fromCurrencyCode, toCurrencyCode) {
    if (!fromCurrencyCode || !toCurrencyCode) return amount;
    const fromCurrency = currencies.find((c) => c.code === fromCurrencyCode);
    const toCurrency = currencies.find((c) => c.code === toCurrencyCode);
    if (!fromCurrency || !toCurrency) return amount;
    const fromRate = Number(fromCurrency.exchangeRate || 1);
    const toRate = Number(toCurrency.exchangeRate || 1);
    return (amount / toRate) * fromRate;
  }
</script>

<div>
  <div class="card shadow-2 mb-3">
    <div class="card-body">
      <div class="float-end hide-for-pdf">
        <button class="btn btn-primary btn-sm me-2 d-none" on:click={() => (showReceipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')} 80mm</button>

        <button class="btn btn-primary btn-sm me-2" on:click={() => (showA4Receipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')} A4</button>

        <button class="btn btn-danger btn-sm me-2" on:click={() => (showDelete = true)}
          ><i class="bi bi-trash me-2"></i>{t('Delete')}</button>

        {#if inventory_record?.record_status === 'confirmed'}
          <button class="btn btn-warning btn-sm me-2 d-none" on:click={() => (showReturn = true)}
            ><i class="bi bi-arrow-return-left me-2"></i>{t('Return')}</button>
          <!-- 
          <button class="btn btn-info btn-sm me-2" on:click={() => (showEdit = true)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
             -->
            
          <button class="btn btn-info btn-sm me-2" on:click={() => (showDraft = true)}
            ><i class="bi bi-pencil me-2"></i>{t('Make Draft')}</button>
        {:else}
          <button class="btn btn-warning btn-sm me-2" on:click={() => push(`/dashboard/inventory_record-form/${inventory_recordId}`)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {/if}
      </div>
      <div class="mb-3">
        {#if inventory_record?.record_status === 'draft'}
          <span class="badge badge-warning text-dark mb-3">{t('Draft')}</span>
        {:else if inventory_record?.record_status === 'confirmed'}
          <span class="badge badge-success mb-3">{t('confirmed')}</span>
        {/if}

        {#if inventory_record?.version && inventory_record?.version > 1}<span class="badge badge-info mb-3">{t('Version')} {inventory_record?.version}</span
          >{/if}

        <h5 class="mb-3">
          {t('Record #')}:
          {inventory_record?.record_number}
        </h5>

        <strong>{t('Invoice Date')}:</strong>
        {@html inventory_record?.record_date ? showDate(inventory_record.record_date) : '-'}<br />

        {#if enable_due_date}
          <strong>{t('Due Date')}:</strong>
          {@html inventory_record?.due_date ? showDate(inventory_record.due_date) : '-'}<br />
        {/if}

        <strong>{t('Created Date')}:</strong>
        <span dir="ltr">{@html inventory_record?.created_at ? new Date(inventory_record.created_at).toLocaleString() : '-'}</span><br />
        <strong>{t('Updated Date')}:</strong>
        <span dir="ltr">{@html inventory_record?.updated_at ? new Date(inventory_record.updated_at).toLocaleString() : '-'}</span><br />

        <strong>{t('Customer')}:</strong>
        {#if customer}
          <button class="btn btn-link text-success btn-sm" on:click={() => push(`/dashboard/account/${customer.id}`)}>
            {#if t('Lang') === 'en' && customer.name}{customer.name}{/if}
            {#if t('Lang') === 'fa' && customer.name_fa}{customer.name_fa}{/if}
            {#if t('Lang') === 'ps' && customer.name_ps}{customer.name_ps}{/if}
          </button>
        {/if}
        <br />
        {#if inventory_record?.description}<strong>{t('Description')}:</strong>
        <div class='ProseMirror'>
          {@html inventory_record?.description || t('No description.')}
          
          </div>
          
          {/if}
      </div>

      <div class="table-responsive">
        <table class="table table-striped">
          <thead class="table-light">
            <tr>
              <th>{t('Product')}</th>
              <th class="text-center">{t('Unit Price')}</th>
              <th class="text-center">{t('Quantity')}</th>

              <th class="text-center">{t('Total Price')}</th>
              {#if enable_bill_of_warehouse}
                <th class="text-center">{t('Actions')}</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each calculatedItems as i}
              <tr>
                <td class="fw-bold">
                  <button
                    class="btn btn-link text-primary btn-sm fw-bold px-2"
                    on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button>
                </td>
                <td class="text-center fw-bold"
                  >{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(i.currency)}</td>
                <td class="text-center fw-bold"
                  >{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>

                <td class="text-center fw-bold"
                  >{(Number(i.quantity) * Number(i.unit_price)).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(i.currency)}</td>

                {#if enable_bill_of_warehouse}
                  <td class="text-center fw-bold">
                    <button
                      class="btn btn-sm btn-outline-primary me-1 px-2"
                      on:click={async () => {
                        selectedItem = i;
                        showWarehouseReceipt = true;
                      }}>
                      <i class="bi bi-printer"></i>
                    </button></td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

        <div class="mb-4 fs-6 fw-bold text-end">
         
          <span>
            {t('Total')}: {(
              Number(inventory_record?.total_amount || 0) +
              Number(calculateDiscountAmount(inventory_record) || 0) -
              Number(inventory_record?.expense_amount || 0)
            ).toLocaleString(undefined, { maximumFractionDigits: 3 })}
            {t(inventory_record?.currency)}
          </span>
        </div>
       
    </div>
  </div>



  {#if showReceipt}
    <InventoryRecordReceiptModal
      {inventory_record}
      on:showA4={() => ((showA4Receipt = true), (showReceipt = false))}
      on:close={() => (showReceipt = false)} />
  {/if}

  {#if showA4Receipt}
    <InventoryRecordA4ReceiptModal {inventory_record} on:close={() => (showA4Receipt = false)} />
  {/if}

  {#if showWarehouseReceipt}
    <WarehouseA4ReceiptModal {inventory_record} {selectedItem} on:close={() => (showWarehouseReceipt = false)} />
  {/if}
  {#if showDelete}
    <InventoryRecordDeleteModal {inventory_record} on:close={() => (showDelete = false)} />
  {/if}
  {#if showDraft}
    <InventoryRecordMakeDraftModal {inventory_record} on:close={() => (showDraft = false)} />
  {/if}

  {#if showEdit}
    <InventoryRecordEditModal {inventory_record} on:close={() => (showEdit = false)} />
  {/if}

  

  {#if showReturn}
    <InventoryRecordReturnModal
      {inventory_record}
      on:close={async () => {
        showReturn = false;
        paymentSectionKey += 1;
      }} />
  {/if}
</div>

<style>

    

</style>
