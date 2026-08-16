<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../../i18n/i18n.js';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';
  import { journalApi } from '../../../api/journalApi.js';
  import { stockTransactionApi } from '../../../api/stockTransactionApi.js';
  import { productionApi } from '../../../api/productionApi.js';

  export let production;

  const dispatch = createEventDispatcher();

  let saving = false;
  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100;
  let loading = true;

  let production_items = [];
  let production_payments = [];
  let production_returns = [];
  let production_return_items = [];

  let production_journals = [];
  let production_stock_transactions = [];

  onMount(() => {
    loadProductionDetails();
  });

  async function loadProductionDetails() {
    if (!production) return;

    production = (await productionApi.getById(Number(production.id)))?.data || null;
    if (!production || Number(production.status) !== 1) {
      loading = false;
      return;
    }

    production_items = (production.items || []).filter((item) => Number(item.status) === 1);
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

  async function doDeleteProduction() {
    saving = true;
    try {
      /*
       * Backend soft-deletes the production and cascades related
       * items/payments/returns/journals/stock atomically.
       */
      await productionApi.remove(production.id);

      Swal.fire({
        icon: 'success',
        title: t('Deleted!'),
        text: t('Production deleted successfully.'),
      });

      dispatch('close');
      push(`/dashboard/productions`);
    } catch (e) {
      console.error('Error deleting production:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while deleting the production.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function deleteProduction() {
    if (confirmationText !== String(randomNumber)) {
      Swal.fire({
        icon: 'error',
        title: t('Confirmation Failed'),
        text: t('Confirmation text does not match. Please type the correct number to confirm deletion.'),
        confirmButtonText: t('OK'),
      });
      return;
    }
    Swal.fire({
      title: t('Are you sure?'),
      text: t('Are you sure you want to delete this production? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, delete it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doDeleteProduction();
      }
    });
  }
</script>

<div class="modal-backdrop show" style="z-index:1040;" on:click={() => dispatch('close')}></div>
<div class="modal show d-block" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">
          <i class="bi bi-trash"></i>
          {t('Delete Production')}
        </h5>
        <button type="button" class="btn-close" on:click={() => dispatch('close')}></button>
      </div>
      <div class="modal-body">
        {#if saving}
          <div class="d-flex align-items-center">
            <strong>{t('Deleting...')}</strong>
            <div class="spinner-border ms-auto" role="status" aria-hidden="true"></div>
          </div>
        {:else}
          <h1 class="text-danger">
            <i class="bi bi-exclamation-triangle me-2"></i>{t('Warning!')}
          </h1>
          <p>
            {t('Are you sure you want to delete this production? This action cannot be undone.')}<br />
            {t('All associated journals, items and payments will also be deleted.')}
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
              >{t(`To confirm deletion, please type`)}
              {randomNumber}
              {t(`in the box below:`)}</small>
            <input
              type="text"
              class="form-control form-control-sm mt-2 w-50 {confirmationText != randomNumber
                ? 'is-invalid'
                : 'is-valid'}"
              bind:value={confirmationText}
              placeholder={t(`To confirm deletion, please type`)} />
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={() => dispatch('close')}
          ><i class="bi bi-x-lg"></i> {t('Cancel')}</button>
        <button class="btn btn-danger" on:click={deleteProduction} disabled={saving || loading}
          ><i class="bi bi-trash"></i>
          {@html saving
            ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Deleting...')}</span>
</div>`
            : t('Delete')}</button>
      </div>
    </div>
  </div>
</div>
