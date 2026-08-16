<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../../i18n/i18n';
  import Swal from 'sweetalert2';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { push } from 'svelte-spa-router';
  import { bomApi } from '../../../api/bomApi.js';

  export let bom;

  const dispatch = createEventDispatcher();

  let saving = false;
  let confirmationText = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100;
  let loading = true;

  let bom_items = [];
  let bom_operations = [];

  onMount(() => {
    loadBOMDetails();
  });

  async function loadBOMDetails() {
    if (!bom) return;

    const fetchedBom = (await bomApi.getById(bom.id))?.data || null;
    bom = fetchedBom && Number(fetchedBom.status) === 1 ? fetchedBom : null;
    if (!bom) {
      loading = false;
      return;
    }

    bom_items = (bom.items || []).filter((item) => Number(item.status) === 1);
    bom_operations = (bom.operations || []).filter((op) => Number(op.status) === 1);
    loading = false;
  }

  async function doDeleteBOM() {
    saving = true;
    try {
      await bomApi.remove(bom.id);

      Swal.fire({
        icon: 'success',
        title: t('Deleted!'),
        text: t('BOM deleted successfully.'),
        confirmButtonText: t('OK'),
      });

      dispatch('close');
      push(`/dashboard/boms`);
    } catch (e) {
      console.error('Error deleting bom:', e);
      Swal.fire({
        icon: 'error',
        title: t('Error'),
        text: t('An error occurred while deleting the BOM.'),
        confirmButtonText: t('OK'),
      });
    } finally {
      saving = false;
    }
  }

  async function deleteBOM() {
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
      text: t('Are you sure you want to delete this BOM? This action cannot be undone.'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('Yes, delete it!'),
      cancelButtonText: t('No, keep it'),
    }).then((result) => {
      if (result.isConfirmed) {
        doDeleteBOM();
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
          {t('Delete BOM')}
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
            {t('Are you sure you want to delete this BOM? This action cannot be undone.')}<br />
            {t('All associated items and operations will also be deleted.')}
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
                    : bom_items.length}</td>
              </tr>
              <tr>
                <td><strong>{t('Associated Operations')}:</strong></td>
                <td class="fw-bold ps-3"
                  >{@html loading
                    ? `<div class="spinner-border spinner-border-sm" role="status">
  <span class="visually-hidden">${t('Loading...')}</span>
</div>`
                    : bom_operations.length}</td>
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
        <button class="btn btn-danger" on:click={deleteBOM} disabled={saving || loading}
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
