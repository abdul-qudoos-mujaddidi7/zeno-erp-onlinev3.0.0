<script>
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { warehouseApi } from '../../api/warehouseApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  // warehouses: "++id,name,location,description,status",

  let warehousesModal;
  let warehousesModalEl;

  let warehouseProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  // Form fields
  let name = '';
  let location = '';
  let description = '';
  let manager_name = "";
  let status = 1;
  let selectedWarehouseId = null;
  // Track editing
  let editingId = null;

  onMount(async () => {
    if (window.mdb) {
      warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    }
  });

  export function openWarehouseModal() {
    // Reset form for Add
    editingId = null;
    name = '';
    location = '';
    manager_name = '';
    description = '';
    status = 1;
    warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    warehousesModal.show();
  }

  // Open modal to edit existing warehouse
  export function editWarehouse(warehouse) {
    editingId = warehouse.id;
    description = warehouse.description || '';
    location = warehouse.location || '';
    name = warehouse.name || '';
    status = warehouse.status;
    manager_name = warehouse.manager_name || '';
    warehousesModal = window.mdb.Modal.getOrCreateInstance(warehousesModalEl);
    warehousesModal.show();
  }

  async function saveWarehouse() {
    if (!name?.trim()) {
      alert('Name is required.');
      return;
    }

    const payload = {
      name: (name || '').trim(),
      location: (location || '').trim() || null,
      manager_name: (manager_name || '').trim() || null,
      description: (description || '').trim() || null,
      status: parseInt(status) || 1,
    };

    try {
      let response;

      if (editingId) {
        response = await warehouseApi.update(
          Number(editingId),
          payload,
        );
      } else {
        response = await warehouseApi.create(
          payload,
        );
      }

      dispatch('saved', {
        id: response?.data?.id || Number(editingId),
        name: response?.data?.name || payload.name,
        location: response?.data?.location || payload.location,
        manager_name:
          response?.data?.manager_name || payload.manager_name,
        description:
          response?.data?.description || payload.description,
      });

      warehousesModal.hide();
    } catch (err) {
      console.error('Failed to save warehouse:', err);
      alert('Error saving warehouse: ' + err.message);
    }
  }

  async function deleteWarehouse(id) {
    if (confirm('Delete this warehouse?')) {
      try {
        await warehouseApi.remove(id);
      } catch (err) {
        console.error('Failed to delete warehouse:', err);
        alert('Error deleting warehouse: ' + err.message);
      }
    }
  }
</script>

<div
  bind:this={warehousesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createWarehouseModal"
  tabindex="-1"
  aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-building"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Warehouse')}</span>
          <h3>{t('Products quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Warehouse') : t('New Warehouse')}</h2>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveWarehouse}>
        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}{t('-of-')}{t('Warehouse')}</span>
          <input type="text" id="c-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Location')}</span>
          <input type="text" id="c-location" bind:value={location} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Manager Name')}</span>
          <input type="text" id="c-manager-name" bind:value={manager_name} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="c-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Warehouse') : t('Save Warehouse')}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  .qa-modal__field input,
  .qa-modal__field textarea {
    width: 100%;
    border: 1px solid #ccd8e7;
    border-radius: 0.5625rem;
    background: #ffffff;
    color: #172033;
    font: inherit;
    min-height: 2.5rem;
    padding: 0.55rem 0.75rem;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .qa-modal__field textarea {
    min-height: 7.75rem;
    resize: vertical;
  }

  .qa-modal__field input:focus,
  .qa-modal__field textarea:focus {
    border-color: #73a1f8;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
  }

  :global(html.dark) .qa-modal__panel {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0b1426;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field span {
    color: #8fa0ba;
  }

  :global(html.dark) .qa-modal__close {
    border-color: rgba(148, 163, 184, 0.34);
    background: #111c31;
    color: #dbe7ff;
  }

  :global(html.dark) .qa-modal__field input,
  :global(html.dark) .qa-modal__field textarea {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field input:focus,
  :global(html.dark) .qa-modal__field textarea:focus {
    border-color: #6f9cff;
    box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
  }
</style>
