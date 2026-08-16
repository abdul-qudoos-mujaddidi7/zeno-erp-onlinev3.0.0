<script>
  import { createEventDispatcher } from 'svelte';
  import { t } from '../../i18n/i18n';
  import AppModal from './AppModal.svelte';
  import { confirmModal } from './confirmModal.js';

  export let title = '';
  export let icon = '';
  /** @type {'default' | 'warning' | 'danger' | 'info' | 'primary'} */
  export let variant = 'danger';
  export let loading = false;
  export let saving = false;
  export let savingLabel = '';
  export let warningMessage = '';
  export let warningDetail = '';
  export let dangerAlert = false;
  /** @type {Array<{ label: string, value: string | number }>} */
  export let stats = [];
  export let actionLabel = '';
  export let actionIcon = '';
  /** @type {'danger' | 'warning' | 'primary'} */
  export let actionVariant = 'danger';
  export let inputId = 'confirm-action-input';
  export let confirmPrompt = {
    title: '',
    message: '',
    confirmText: '',
    cancelText: '',
    variant: 'danger',
    icon: '',
  };

  const dispatch = createEventDispatcher();

  let confirmationText = '';
  let confirmError = '';
  let randomNumber = Math.floor(Math.random() * 900) + 100;

  async function handleAction() {
    if (confirmationText !== String(randomNumber)) {
      confirmError = t(
        'Confirmation text does not match. Please type the correct number to confirm deletion.',
      );
      return;
    }
    confirmError = '';
    const ok = await confirmModal({
      title: confirmPrompt.title || t('Are you sure?'),
      message: confirmPrompt.message,
      confirmText: confirmPrompt.confirmText || t('Confirm'),
      cancelText: confirmPrompt.cancelText || t('Cancel'),
      variant: confirmPrompt.variant || variant,
      icon: confirmPrompt.icon || icon,
    });
    if (ok) {
      dispatch('confirm');
    }
  }
</script>

<AppModal {title} {icon} {variant} {loading} on:close={() => dispatch('close')}>
  {#if saving}
    <div class="app-modal-loading">
      <span>{savingLabel}</span>
      <div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div>
    </div>
  {:else}
    <div class="app-modal-alert" class:app-modal-alert--danger={dangerAlert}>
      <i class="bi bi-exclamation-triangle"></i>
      <div>
        <strong>{t('Warning!')}</strong>
        <div>
          {warningMessage}
          {#if warningDetail}
            {warningDetail}
          {/if}
        </div>
      </div>
    </div>

    {#if stats.length > 0}
      <table class="app-modal-stats">
        <tbody>
          {#each stats as stat}
            <tr>
              <td>{stat.label}</td>
              <td>{stat.value}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <div class="app-modal-field">
      <label for={inputId}>
        {t(`To confirm deletion, please type`)} {randomNumber} {t(`in the box below:`)}
      </label>
      <input
        id={inputId}
        type="text"
        bind:value={confirmationText}
        on:input={() => (confirmError = '')}
        placeholder={String(randomNumber)} />
      {#if confirmError}
        <p class="app-modal-inline-error" role="alert">{confirmError}</p>
      {/if}
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <button
      type="button"
      class="app-modal-btn app-modal-btn--secondary"
      disabled={saving}
      on:click={() => dispatch('close')}>
      <i class="bi bi-x-lg"></i>
      {t('Cancel')}
    </button>
    <button
      type="button"
      class="app-modal-btn app-modal-btn--{actionVariant}"
      on:click={handleAction}
      disabled={saving || loading}>
      {#if saving}
        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      {:else}
        <i class="bi {actionIcon}"></i>
      {/if}
      {actionLabel}
    </button>
  </svelte:fragment>
</AppModal>
