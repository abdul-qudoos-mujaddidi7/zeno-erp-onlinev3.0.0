<script>
import { productUnitApi } from '../../api/productUnitApi.js';
  import { productApi } from '../../api/productApi.js';
  import { journalApi } from '../../api/journalApi.js';
  import { stockTransferApi } from '../../api/stockTransferApi.js';
  import { warehouseApi } from '../../api/warehouseApi.js';
  import { onMount, createEventDispatcher } from 'svelte';
  import StockTransferReceiptModal from './StockTransferReceiptModal.svelte';
  import StockTransferDeleteModal from './StockTransferDeleteModal.svelte';
  import StockTransferEditModal from './StockTransferEditModal.svelte';
  import { showDate } from '../../calendar.js';
  import Swal from 'sweetalert2';
  import EditJournalModal from '../journals/EditJournalModal.svelte';
  let editJournalModalRef;
  import { push } from 'svelte-spa-router';
  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  export let stocktransferId;
  const dispatch = createEventDispatcher();
  let paymentSectionKey = 0;
  let stocktransfer;
  let items = [];
  let showReceipt = false;
  let warehouses = [];
  let units = [];
  let journals = [];
  let showDelete = false;
  let showEdit = false;
  async function deleteJournal(id) {
    await journalApi.remove(Number(id));
    await loadJournals();
  }
  async function loadJournals() {
    const response = await journalApi.getAll({ status: 1 });
    journals = (response?.data || []).filter(
      (j) => j.reference_type === 'stock_transfer' && Number(j.reference_id) === Number(stocktransferId) && j.status === 1,
    );
  }
  onMount(async () => {
    try {
      const response = await stockTransferApi.getById(Number(stocktransferId));
      stocktransfer = response?.data;
    } catch (err) {
      stocktransfer = null;
    }
    if (!stocktransfer || Number(stocktransfer.status) !== 1) {
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('Stock Transfer not found.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    await loadJournals();
    const stocktransferItems = (stocktransfer.items || []).filter((item) => Number(item.status) === 1);
    const productIds = stocktransferItems.map((i) => i.product_id);
    const products = (await productApi.getAll({ status: 1 }))?.data || [];
    items = stocktransferItems.map((i) => {
      const product = products.find((p) => Number(p.id) === Number(i.product_id));
      return {
        ...i,
        product_name: product?.name || 'Unknown',
        product_unit_id: i.product_unit_id || product?.product_unit_id,
      };
    });
    units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    warehouses = (await warehouseApi.getAll({ status: 1 }))?.data || [];
  });
</script>
<div>
  <div class="card shadow-2 mb-3">
    <div class="card-body">
      <div class="float-end hide-for-pdf">
        <button class="btn btn-primary btn-sm me-2" on:click={() => (showReceipt = true)}
          ><i class="bi bi-printer me-2"></i>{t('Print')}</button>
        <button class="btn btn-danger btn-sm me-2" on:click={() => (showDelete = true)}
          ><i class="bi bi-trash me-2"></i>{t('Delete')}</button>
        {#if stocktransfer?.transfer_status === 'confirmed'}
          <button class="btn btn-info btn-sm me-2" on:click={() => (showEdit = true)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {:else}
          <button
            class="btn btn-warning btn-sm me-2"
            on:click={() => push(`/dashboard/stock-transfer-form/${stocktransferId}`)}
            ><i class="bi bi-pencil me-2"></i>{t('Edit')}</button>
        {/if}
      </div>
      <div class="mb-3">
        {#if stocktransfer?.transfer_status === 'draft'}
          <span class="badge badge-warning text-dark mb-3">{t('Draft')}</span>
        {:else if stocktransfer?.transfer_status === 'confirmed'}
          <span class="badge badge-success mb-3">{t('confirmed')}</span>
        {/if}
        <h5 class="mb-3">
          {t('Transfer #')}:
          {stocktransfer?.transfer_number}
        </h5>
        <strong>{t('Date')}:</strong>
        {@html stocktransfer?.transfer_date ? showDate(stocktransfer.transfer_date) : '-'}<br />
        <strong>{t('Created Date')}:</strong>
        <span dir="ltr"
          >{@html stocktransfer?.created_at ? new Date(stocktransfer.created_at).toLocaleString() : '-'}</span
        ><br />
        <strong>{t('Updated Date')}:</strong>
        <span dir="ltr"
          >{@html stocktransfer?.updated_at ? new Date(stocktransfer.updated_at).toLocaleString() : '-'}</span
        ><br />
        <strong>{t('From Warehouse')}:</strong>
        {warehouses.find((w) => w.id === stocktransfer.warehouse_id)?.name || 'Unknown'}
        <br />
        <strong>{t('To Warehouse')}:</strong>
        {warehouses.find((w) => w.id === stocktransfer.to_warehouse_id)?.name || 'Unknown'}
        <br />
        <strong>{t('Total Amount')}:</strong>
        {stocktransfer?.total_amount
          ? Number(stocktransfer.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 })
          : '0.00'}
        {t(stocktransfer?.currency)}
        <br />
        {#if stocktransfer?.description}<strong>{t('Description')}:</strong>
          {stocktransfer?.description || t('No description.')}<br />{/if}
      </div>
      <div class="table-responsive">
        <table class="table table-striped">
          <thead class="table-light">
            <tr>
              <th>{t('Product')}</th>
              <th class="text-end">{t('Unit Price')}</th>
              <th class="text-end">{t('Quantity')}</th>
              <th class="text-end">{t('Total Price')}</th>
            </tr>
          </thead>
          <tbody>
            {#each items as i}
              <tr>
                <td>
                  <button
                    class="btn btn-link text-primary btn-sm"
                    on:click={() => push(`/dashboard/product/${i.product_id}`)}>{i.product_name}</button>
                </td>
                <td class="text-end"
                  >{Number(i.unit_price).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(stocktransfer.currency)}</td>
                <td class="text-end"
                  >{Number(i.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {units.find((u) => u.id === i.product_unit_id)?.name || '-'}</td>
                <td class="text-end"
                  >{Number(i.subtotal).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  {t(stocktransfer.currency)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="mt-3">
        <strong>{t('Transfer Expense')}:</strong><br />
        {#if journals.length === 0}
          <em>{t('No journals found.')}</em>
        {:else}
          <ul>
            {#each journals as j}
              <li>
                {Number(j.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                {t(j.currency)}

                <button
                  class="btn btn-sm btn-outline-secondary me-1 px-2"
                  on:click={() => editJournalModalRef.openModal(j.id)}>
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger px-2"
                  on:click={() => {
                    Swal.fire({
                      title: t('Confirm Deletion'),
                      text: t('Are you sure you want to delete this journal entry? This action cannot be undone.'),
                      icon: 'warning',
                      showCancelButton: true,
                      confirmButtonText: t('Yes, delete it!'),
                    }).then((result) => {
                      if (result.isConfirmed) {
                        deleteJournal(j.id);
                      }
                    });
                  }}>
                  <i class="bi bi-trash"></i>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>

  {#if showReceipt}
    <StockTransferReceiptModal {stocktransfer} on:close={() => (showReceipt = false)} />
  {/if}
  {#if showDelete}
    <StockTransferDeleteModal {stocktransfer} on:close={() => (showDelete = false)} />
  {/if}
  {#if showEdit}
    <StockTransferEditModal {stocktransfer} on:close={() => (showEdit = false)} />
  {/if}
</div>

<EditJournalModal bind:this={editJournalModalRef} on:saved={loadJournals} />
