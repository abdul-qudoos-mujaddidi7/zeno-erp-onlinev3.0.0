<script>
  import {
    onMount,
    createEventDispatcher,
  } from 'svelte';

  import {
    productBrandApi,
  } from '../../api/productBrandApi.js';

  import {
    t,
    lang,
    translate_org_type,
  } from '../../i18n/i18n.js';

  $: _lang = $lang;
  $: _translate_org_type =
    $translate_org_type;

  const dispatch =
    createEventDispatcher();

  let productBrandsModalEl;

  let name = '';
  let code = '';
  let description = '';
  let status = 1;
  let editingId = null;

  function getModal() {
    return window.mdb.Modal
      .getOrCreateInstance(
        productBrandsModalEl,
      );
  }

  onMount(() => {
    if (window.mdb) {
      document
        .querySelectorAll(
          '[data-mdb-input-init]',
        )
        .forEach((element) => {
          new window.mdb.Input(element);
        });
    }
  });

  export function openProductBrandModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    status = 1;

    getModal().show();
  }

  export function editProductBrand(brand) {
    editingId = brand.id;
    name = brand.name || '';
    code = brand.code || '';
    description =
      brand.description || '';
    status = Number(
      brand.status ?? 1,
    );

    getModal().show();
  }

  async function saveProductBrand() {
    if (!name.trim()) {
      alert('Name is required.');
      return;
    }

    const payload = {
      name: name.trim(),
      code:
        code.trim() || null,
      description:
        description.trim() || null,
      status:
        Number(status) === 0
          ? 0
          : 1,
    };

    try {
      let response;

      if (editingId !== null) {
        response =
          await productBrandApi.update(
            editingId,
            payload,
          );
      } else {
        response =
          await productBrandApi.create(
            payload,
          );
      }

      const savedBrand =
        response?.data || {};

      dispatch('saved', {
        id:
          savedBrand.id ??
          editingId,
        name:
          savedBrand.name ??
          payload.name,
        code:
          savedBrand.code ??
          payload.code,
        description:
          savedBrand.description ??
          payload.description,
        status:
          savedBrand.status ??
          payload.status,
      });

      getModal().hide();
    } catch (err) {
      console.error(
        'Failed to save product brand:',
        err,
      );

      alert(
        'Error saving product brand: ' +
          err.message,
      );
    }
  }
</script>

<div
  bind:this={productBrandsModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createProductBrandModal"
  tabindex="-1"
  aria-hidden="true"
>
  <div
    class="modal-dialog modal-dialog-centered qa-modal__dialog"
  >
    <div
      class="modal-content qa-modal__panel"
    >
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
          <i class="bi bi-award"></i>
        </div>

        <div>
          <span class="qa-modal__eyebrow">
            {t('Brand')}
          </span>

          <h3>
            {t('Products quick action')}
          </h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>
          {editingId !== null
            ? t('Update Product Brand')
            : t('Create Product Brand')}
        </h2>

        <p>
          {editingId !== null
            ? t('Update brand subtitle')
            : t('Create brand subtitle')}
        </p>
      </div>

      <form
        class="qa-modal__form"
        on:submit|preventDefault={
          saveProductBrand
        }
      >
        <label class="qa-modal__field">
          <span>{t('Name')}</span>

          <input
            type="text"
            id="brand-name"
            bind:value={name}
            autocomplete="off"
          />
        </label>

        <label class="qa-modal__field">
          <span>{t('Code')}</span>

          <input
            type="text"
            id="brand-code"
            bind:value={code}
            autocomplete="off"
          />
        </label>

        <label
          class="qa-modal__field qa-modal__field--full"
        >
          <span>
            {t('Description')}
          </span>

          <textarea
            id="brand-description"
            rows="3"
            bind:value={description}
          ></textarea>
        </label>

        <button
          type="submit"
          class="qa-modal__submit"
        >
          {editingId !== null
            ? t('Update Product Brand')
            : t('Create Product Brand')}
        </button>
      </form>
    </div>
  </div>
</div>
