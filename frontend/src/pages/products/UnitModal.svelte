<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { productUnitApi } from '../../api/productUnitApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let units = [];
  let loading = true;
  let unitModalEl;

  let name = '';
  let code = '';
  let description = '';
  let subunit_id = null;
  let subunit_multiple = null;
  let status = 1;
  let hasSubunit = false;
  let editingId = null;

  async function loadUnits() {
    loading = true;
    try {
      units = (await productUnitApi.getAll({ status: 1 }))?.data || [];
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadUnits();
  });

  export async function openUnitModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    subunit_id = null;
    subunit_multiple = null;
    status = 1;
    hasSubunit = false;
    const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
    unitModal.show();
  }

  export async function editUnit(unit) {
    // The API returns decimals as strings ("43.000000"); the number input
    // should show 43, not the padded value.
    const multiple = Number(unit.subunit_multiple);

    editingId = unit.id;
    name = unit.name ?? '';
    code = unit.code ?? '';
    description = unit.description ?? '';
    subunit_id = unit.subunit_id ?? null;
    subunit_multiple =
      Number.isFinite(multiple) && multiple > 0 ? multiple : null;
    status = unit.status;
    hasSubunit = !!(unit.subunit_id || subunit_multiple);

    const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
    unitModal.show();
  }

  async function saveUnit() {
    const trimmedName = String(name ?? '').trim();

    if (!trimmedName) {
      alert('Name is required.');
      return;
    }

    // The multiple comes back from the API as a decimal string, and the
    // number input yields undefined when it is cleared.
    const parsedMultiple =
      subunit_multiple === null || subunit_multiple === undefined || subunit_multiple === ''
        ? Number.NaN
        : Number(subunit_multiple);

    try {
      const payload = {
        name: trimmedName,
        code: String(code ?? '').trim(),
        description: description ?? '',
        subunit_id: subunit_id || null,
        subunit_multiple:
          Number.isFinite(parsedMultiple) && parsedMultiple > 0
            ? parsedMultiple
            : null,
        status: parseInt(status) || 1,
      };

      let savedUnit = null;
      if (editingId) {
        const response = await productUnitApi.update(editingId, payload);
        savedUnit = response.data;
      } else {
        const response = await productUnitApi.create(payload);
        savedUnit = response.data;
      }

      dispatch('saved', {
        id: savedUnit.id,
        name: savedUnit.name,
        code: savedUnit.code,
        description: savedUnit.description,
      });

      await loadUnits();

      const unitModal = window.mdb.Modal.getOrCreateInstance(unitModalEl);
      unitModal.hide();
    } catch (err) {
      console.error('Failed to save unit:', err);
      alert('Error saving unit: ' + err.message);
    }
  }

  async function deleteUnit(id) {
    if (confirm('Delete this unit?')) {
      await productUnitApi.remove(id);
      await loadUnits();
    }
  }
</script>

<div bind:this={unitModalEl} class="modal fade qa-modal" dir={t('dir')} id="createUnitModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t('Close')}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon qa-modal__icon--purple">
          <i class="bi bi-rulers"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t('Product Units')}</span>
          <h3>{t('Products quick action')}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId ? t('Update Unit') : t('Create Unit')}</h2>
        <p>{editingId ? t('Update unit subtitle') : t('Create unit subtitle')}</p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveUnit}>
        <label class="qa-modal__field">
          <span>{t('Name')}</span>
          <input type="text" id="unit-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t('Code')}</span>
          <input type="text" id="unit-code" bind:value={code} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t('Description')}</span>
          <textarea id="unit-description" rows="3" bind:value={description}></textarea>
        </label>

        <div class="qa-modal__switch">
          <input
            class="form-check-input"
            type="checkbox"
            id="hasSubunit"
            bind:checked={hasSubunit}
            on:change={() => {
              if (!hasSubunit) {
                subunit_id = null;
                subunit_multiple = null;
              }
            }} />
          <label class="form-check-label" for="hasSubunit">{t('Has Subunit')}</label>
        </div>

        {#if hasSubunit}
          <div class="qa-modal__subunit">
            <div class="qa-modal__subunit-label">{name || t('Name')}</div>
            <div class="qa-modal__subunit-eq">=</div>
            <input
              type="number"
              id="c-subunit_multiple"
              class="form-control"
              step="any"
              min="0"
              inputmode="decimal"
              placeholder={t('Subunit Multiple')}
              bind:value={subunit_multiple} />
            <select id="c-subunit" class="form-select" bind:value={subunit_id}>
              <option value="">{t('Select Unit')}</option>
              {#each units as u}
                <option value={u.id}>{u.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <button type="submit" class="qa-modal__submit">
          {editingId ? t('Update Unit') : t('Create Unit')}
        </button>
      </form>
    </div>
  </div>
</div>

<style>
  .qa-modal__field input,
  .qa-modal__field textarea,
  .qa-modal__subunit input,
  .qa-modal__subunit select {
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
  .qa-modal__field textarea:focus,
  .qa-modal__subunit input:focus,
  .qa-modal__subunit select:focus {
    border-color: #73a1f8;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
  }

  :global(html.dark) .qa-modal__panel {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0b1426;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field span,
  :global(html.dark) .qa-modal__switch,
  :global(html.dark) .qa-modal__subunit-label,
  :global(html.dark) .qa-modal__subunit-eq {
    color: #8fa0ba;
  }

  :global(html.dark) .qa-modal__close {
    border-color: rgba(148, 163, 184, 0.34);
    background: #111c31;
    color: #dbe7ff;
  }

  :global(html.dark) .qa-modal__field input,
  :global(html.dark) .qa-modal__field textarea,
  :global(html.dark) .qa-modal__subunit input,
  :global(html.dark) .qa-modal__subunit select {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field input:focus,
  :global(html.dark) .qa-modal__field textarea:focus,
  :global(html.dark) .qa-modal__subunit input:focus,
  :global(html.dark) .qa-modal__subunit select:focus {
    border-color: #6f9cff;
    box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
  }
</style>
