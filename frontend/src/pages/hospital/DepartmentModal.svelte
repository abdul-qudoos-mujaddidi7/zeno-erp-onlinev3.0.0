<script>
  import { departmentApi } from '../../api/departmentApi.js';
  import { onMount, createEventDispatcher } from 'svelte';

  import { t, lang, translate_org_type } from '../../i18n/i18n.js';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();


  let departments = [];
  let loading = true;
  let departmentsModal;
  let departmentsModalEl;

  let departmentProducts = [];

  let units = [];
  let products = [];
  let productCategories = [];

  // Form fields
  let name = '';
  let description = '';
  let status = 1;
  let selectedDepartmentId = null;
  // Track editing
  let editingId = null;

  onMount(async () => {
    if (window.mdb) {
      departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    }
  });

  export function openDepartmentModal() {
    // Reset form for Add
    editingId = null;
    name = '';
    description = '';
    status = 1;
    departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    departmentsModal.show();
  }

  // Open modal to edit existing department
  export function editDepartment(department) {
    editingId = department.id;
    description = department.description || '';
    name = department.name || '';
    status = department.status;
    departmentsModal = window.mdb.Modal.getOrCreateInstance(departmentsModalEl);
    departmentsModal.show();
  }

  async function saveDepartment() {
    if (!name?.trim()) {
      alert('Name is required.');
      return;
    }

    try {
      const payload = {
        name: (name || '').trim(),
        description: (description || '').trim(),
        status: parseInt(status) || 1,
      };

      let savedDepartment = null;
      if (editingId) {
        const response = await departmentApi.update(editingId, payload);
        savedDepartment = response.data;
      } else {
        const response = await departmentApi.create(payload);
        savedDepartment = response.data;
      }

      dispatch('saved', {
        id: savedDepartment.id,
        name: savedDepartment.name,
        description: savedDepartment.description,
      });
      departmentsModal.hide();
    } catch (err) {
      console.error('Failed to save department:', err);
      alert('Error saving department: ' + err.message);
    }
  }

  async function deleteDepartment(id) {
    if (confirm('Delete this department?')) {
      await departmentApi.remove(id);
    }
  }
</script>

<div
  bind:this={departmentsModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createDepartmentModal"
  tabindex="-1"
  aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-diagram-3"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Department')}</span>
          <h3>{t('Quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Department') : t('New Department')}</h2>
       
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveDepartment}>
        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Name')}</span>
          <input type="text" id="c-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="c-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Department') : t('Save Department')}
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
