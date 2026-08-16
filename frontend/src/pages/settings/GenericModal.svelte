<script>
  import { createEventDispatcher } from 'svelte';

  import {
    t,
    lang,
    translate_org_type,
  } from '../../i18n/i18n.js';

  import { productGenericApi } from '../../api/productGenericApi.js';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let productGenericsModalEl;

  // Form fields
  let name = '';
  let code = '';
  let description = '';
  let status = 1;

  // Track editing
  let editingId = null;

  function getModal() {
    return window.mdb.Modal.getOrCreateInstance(
      productGenericsModalEl,
    );
  }

  export function openProductGenericModal() {
    editingId = null;
    name = '';
    code = '';
    description = '';
    status = 1;

    getModal().show();
  }

  export function editProductGeneric(generic) {
    editingId = generic.id;
    name = generic.name || '';
    code = generic.code || '';
    description = generic.description || '';
    status = Number(generic.status ?? 1);

    getModal().show();
  }

  async function saveProductGeneric() {
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
          await productGenericApi.update(
            editingId,
            payload,
          );
      } else {
        response =
          await productGenericApi.create(
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
        'Failed to save product generic:',
        err,
      );

      alert(
        'Error saving product generic: ' +
          err.message,
      );
    }
  }
</script>

<div
  bind:this={productGenericsModalEl}
  class="modal fade qa-modal"
  dir={t('dir')}
  id="createProductGenericModal"
  tabindex="-1"
  aria-hidden="true"
>
  <div class="modal-dialog modal-dialog-centered qa-modal__dialog">
    <div class="modal-content qa-modal__panel">
      <button type="button" class="qa-modal__close" data-mdb-dismiss="modal" aria-label={t("Close")}>
        <i class="bi bi-x-lg"></i>
      </button>

      <div class="qa-modal__header">
        <div class="qa-modal__icon">
          <i class="bi bi-capsule"></i>
        </div>
        <div>
          <span class="qa-modal__eyebrow">{t("Generic")}</span>
          <h3>{t("Products quick action")}</h3>
        </div>
      </div>

      <div class="qa-modal__intro">
        <h2>{editingId !== null ? t("Update Product Generic") : t("Create Product Generic")}</h2>
        <p>{editingId !== null ? t("Update generic subtitle") : t("Create generic subtitle")}</p>
      </div>

      <form class="qa-modal__form" on:submit|preventDefault={saveProductGeneric}>
        <label class="qa-modal__field">
          <span>{t("Name")}</span>
          <input type="text" id="generic-name" bind:value={name} autocomplete="off" />
        </label>

        <label class="qa-modal__field">
          <span>{t("Code")}</span>
          <input type="text" id="generic-code" bind:value={code} autocomplete="off" />
        </label>

        <label class="qa-modal__field qa-modal__field--full">
          <span>{t("Description")}</span>
          <textarea id="generic-description" rows="3" bind:value={description}></textarea>
        </label>

        <button type="submit" class="qa-modal__submit">
          {editingId !== null ? t("Update Product Generic") : t("Create Product Generic")}
        </button>
      </form>
    </div>
  </div>
</div>
