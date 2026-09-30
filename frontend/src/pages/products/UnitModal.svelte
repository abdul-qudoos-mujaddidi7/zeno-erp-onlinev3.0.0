<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { t, lang, translate_org_type } from '../../i18n/i18n';
  import { productUnitApi } from '../../api/productUnitApi.js';
  import { unitCategoryApi } from '../../api/unitCategoryApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let units = [];
  let unitCategories = [];
  let loading = true;
  let unitModalEl;

  let name = '';
  let code = '';
  let description = '';
  let subunit_id = null;
  let subunit_multiple = null;
  let unit_category_id = null;
  let status = 1;
  let hasSubunit = false;
  let editingId = null;

  /* Inline "create a category" row, so a unit can be saved without leaving
   * this modal when its category does not exist yet. */
  let showNewCategory = false;
  let newCategoryName = '';
  let savingCategory = false;
  let newCategoryInput;

  async function loadUnits() {
    loading = true;
    try {
      const [unitsResponse, categoriesResponse] = await Promise.all([
        productUnitApi.getAll({ status: 1 }),
        unitCategoryApi.getAll({ status: 1 }),
      ]);

      units = unitsResponse?.data || [];
      unitCategories = categoriesResponse?.data || [];

      /* Every unit must belong to a category. If none was picked yet, default
       * the select to the category the API falls back to, so the form shows
       * what will actually be saved. */
      if (!unit_category_id && unitCategories.length) {
        const defaultCategory =
          unitCategories.find((category) => Number(category.is_default) === 1) ||
          unitCategories[0];

        unit_category_id = defaultCategory?.id ?? null;
      }

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
    unit_category_id =
      unitCategories.find((category) => Number(category.is_default) === 1)?.id ??
      unitCategories[0]?.id ??
      null;
    status = 1;
    hasSubunit = false;
    cancelNewCategory();
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
    unit_category_id = unit.unit_category_id ?? null;
    status = unit.status;
    hasSubunit = !!(unit.subunit_id || subunit_multiple);
    cancelNewCategory();

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
        unit_category_id: unit_category_id || null,
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

  async function startNewCategory() {
    showNewCategory = true;
    newCategoryName = '';

    await tick();

    newCategoryInput?.focus();
  }

  function cancelNewCategory() {
    showNewCategory = false;
    newCategoryName = '';
  }

  async function createCategory() {
    const trimmedName = String(newCategoryName ?? '').trim();

    if (!trimmedName) {
      newCategoryInput?.focus();
      return;
    }

    savingCategory = true;

    try {
      const response = await unitCategoryApi.create({
        name: trimmedName,
        status: 1,
      });

      const createdId = response?.data?.id ?? null;

      await loadUnits();

      unit_category_id = createdId;
      cancelNewCategory();
    } catch (err) {
      /* A category with this name already exists (the name is unique per
       * organization). Rather than refusing the unit, just select it. */
      if (err.status === 409) {
        const existing = unitCategories.find(
          (category) =>
            String(category.name ?? '').toLowerCase() === trimmedName.toLowerCase(),
        );

        if (existing) {
          unit_category_id = existing.id;
          cancelNewCategory();
          return;
        }
      }

      console.error('Failed to save unit category:', err);
      alert('Error saving unit category: ' + err.message);
    } finally {
      savingCategory = false;
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

        <div class="qa-modal__field qa-modal__field--full">
          <span id="unit-category-label">{t('Unit Category')}</span>

          <div class="qa-modal__category-row">
            <select
              id="unit-category"
              class="form-select"
              aria-labelledby="unit-category-label"
              bind:value={unit_category_id}>
              <option value="">{t('Select Unit Category')}</option>
              {#each unitCategories as category}
                <option value={category.id}>{category.name}</option>
              {/each}
            </select>

            <button
              type="button"
              class="qa-modal__quick-add"
              title={t('Create Unit Category')}
              aria-label={t('Create Unit Category')}
              on:click={startNewCategory}>
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>

          {#if showNewCategory}
            <div class="qa-modal__category-new">
              <input
                type="text"
                id="new-unit-category"
                placeholder={t('Unit Category')}
                aria-label={t('Unit Category')}
                autocomplete="off"
                bind:this={newCategoryInput}
                bind:value={newCategoryName}
                on:keydown={(event) => {
                  /* Enter belongs to the category row, not to the unit form. */
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    createCategory();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancelNewCategory();
                  }
                }} />

              <button
                type="button"
                class="qa-modal__quick-save"
                disabled={savingCategory}
                on:click={createCategory}>
                {t('Add')}
              </button>

              <button
                type="button"
                class="qa-modal__quick-cancel"
                on:click={cancelNewCategory}>
                {t('Cancel')}
              </button>
            </div>
          {/if}
        </div>

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
  .qa-modal__field select,
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

  /* Unit category row: the select stretches, the create button keeps its size
   * on both LTR and RTL. */
  .qa-modal__category-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }

  .qa-modal__category-row select {
    flex: 1 1 auto;
    min-width: 0;
  }

  .qa-modal__quick-add {
    display: grid;
    flex: 0 0 auto;
    width: 2.6rem;
    place-items: center;
    border: 0;
    border-radius: 0.5625rem;
    background: #0f6efd;
    color: #ffffff;
    font-size: 0.95rem;
    box-shadow: 0 6px 14px rgba(15, 110, 253, 0.2);
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .qa-modal__quick-add:hover {
    background: #245ed0;
    transform: translateY(-1px);
  }

  .qa-modal__category-new {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .qa-modal__category-new input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .qa-modal__quick-save,
  .qa-modal__quick-cancel {
    flex: 0 0 auto;
    min-height: 2.5rem;
    padding: 0.55rem 0.9rem;
    border-radius: 0.5625rem;
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .qa-modal__quick-save {
    border: 0;
    background: #0f6efd;
    color: #ffffff;
  }

  .qa-modal__quick-save:hover {
    background: #245ed0;
  }

  .qa-modal__quick-save:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  .qa-modal__quick-cancel {
    border: 1px solid #ccd8e7;
    background: transparent;
    color: #4d586c;
  }

  :global(html.dark) .qa-modal__quick-cancel {
    border-color: rgba(148, 163, 184, 0.38);
    color: #dbe7ff;
  }

  .qa-modal__field input:focus,
  .qa-modal__field select:focus,
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
  :global(html.dark) .qa-modal__field select,
  :global(html.dark) .qa-modal__field textarea,
  :global(html.dark) .qa-modal__subunit input,
  :global(html.dark) .qa-modal__subunit select {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .qa-modal__field input:focus,
  :global(html.dark) .qa-modal__field select:focus,
  :global(html.dark) .qa-modal__field textarea:focus,
  :global(html.dark) .qa-modal__subunit input:focus,
  :global(html.dark) .qa-modal__subunit select:focus {
    border-color: #6f9cff;
    box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
  }
</style>
