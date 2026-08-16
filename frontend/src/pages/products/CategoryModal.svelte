<script>
  import { createEventDispatcher } from 'svelte';

  import {
    t,
    lang,
    translate_org_type,
  } from '../../i18n/i18n';

  import { productCategoryApi } from '../../api/productCategoryApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let productCategoriesModalEl;

  let name = '';
  let code = '';
  let description = '';
  let status = 1;
  let editingId = null;

  function getModal() {
    return window.mdb.Modal.getOrCreateInstance(
      productCategoriesModalEl,
    );
  }

  export function openProductCategoryModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    status = 1;

    getModal().show();
  }

  export function editProductCategory(category) {
    editingId = category.id;
    name = category.name || '';
    code = category.code || '';
    description = category.description || '';
    status = Number(category.status ?? 1);

    getModal().show();
  }

  async function saveProductCategory() {
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }

    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      status: Number(status) === 0 ? 0 : 1,
    };

    try {
      let response;

      if (editingId !== null) {
        response =
          await productCategoryApi.update(
            editingId,
            payload,
          );
      } else {
        response =
          await productCategoryApi.create(
            payload,
          );
      }

      dispatch('saved', {
        id: response?.data?.id || editingId,
        name: response?.data?.name || payload.name,
        code: response?.data?.code || payload.code,
        description:
          response?.data?.description ||
          payload.description,
      });

      getModal().hide();
    } catch (err) {
      console.error(
        'Failed to save product category:',
        err,
      );

      alert(
        'Error saving product category: ' +
          err.message,
      );
    }
  }
</script>

<div
  bind:this={productCategoriesModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createProductCategoryModal"
  tabindex="-1"
  aria-hidden="true"
>
  <div
    class="modal-dialog modal-dialog-centered qa-modal__dialog"
  >
    <div class="modal-content qa-modal__panel">
      <button
        type="button"
        class="qa-modal__close"
        data-mdb-dismiss="modal"
        aria-label={t('Close')}
      >
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-tag"></i>
        </div>

        <div>
          <span class="qa-modal__eyebrow">
            {t('Category')}
          </span>

          <h3>
            {t('Products quick action')}
          </h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>
          {editingId !== null
            ? t('Update Product Category')
            : t('Create Product Category')}
        </h2>

        <p>
          {editingId !== null
            ? t('Update category subtitle')
            : t('Create category subtitle')}
        </p>
      </div>

      <form
        class="qa-modal__form"
        on:submit|preventDefault={saveProductCategory}
      >
        <label
          class="qa-modal__field qa-modal__field--full"
        >
          <span>{t('Name')}</span>

          <input
            type="text"
            id="cat-name"
            bind:value={name}
            autocomplete="off"
          />
        </label>

        <label
          class="qa-modal__field qa-modal__field--full"
        >
          <span>{t('Description')}</span>

          <textarea
            id="cat-description"
            rows="3"
            bind:value={description}
          ></textarea>
        </label>

        <button
          type="submit"
          class="qa-modal__submit"
        >
          {editingId !== null
            ? t('Update Product Category')
            : t('Create Product Category')}
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
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
  }

  .qa-modal__field textarea {
    min-height: 7.75rem;
    resize: vertical;
  }

  .qa-modal__field input:focus,
  .qa-modal__field textarea:focus {
    border-color: #73a1f8;
    box-shadow:
      0 0 0 3px rgba(47, 111, 237, 0.12);
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
    box-shadow:
      0 0 0 3px rgba(111, 156, 255, 0.18);
  }
</style>