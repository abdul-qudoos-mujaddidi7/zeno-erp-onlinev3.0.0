<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { t } from '../../i18n/i18n';

  export let open = false;
  export let title = '';
  export let message = '';
  export let confirmText = '';
  export let cancelText = '';
  export let variant = 'default';
  export let icon = '';
  export let loading = false;
  export let closeOnOverlay = true;

  const dispatch = createEventDispatcher();

  const variantConfig = {
    default: {
      icon: 'bi-question-circle',
      tone: 'default',
    },
    danger: {
      icon: 'bi-trash',
      tone: 'danger',
    },
    warning: {
      icon: 'bi-exclamation-triangle',
      tone: 'warning',
    },
    info: {
      icon: 'bi-info-circle',
      tone: 'info',
    },
    success: {
      icon: 'bi-check-circle',
      tone: 'success',
    },
  };

  $: config = variantConfig[variant] || variantConfig.default;
  $: resolvedIcon = icon || config.icon;
  $: resolvedConfirmText = confirmText || t('Confirm');
  $: resolvedCancelText = cancelText || t('Cancel');

  let confirmButton;

  function handleClose(result) {
    if (loading) return;
    open = false;
    if (result) {
      dispatch('confirm');
    } else {
      dispatch('cancel');
    }
    dispatch('close', { confirmed: result });
  }

  function handleOverlayClick(event) {
    if (!closeOnOverlay || loading) return;
    if (event.currentTarget === event.target) {
      handleClose(false);
    }
  }

  function handleKeydown(event) {
    if (!open || loading) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose(false);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handleClose(true);
    }
  }

  $: if (open) {
    tick().then(() => confirmButton?.focus());
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="confirm-modal-overlay" role="presentation" on:click={handleOverlayClick}>
    <section
      class="confirm-modal confirm-modal--{config.tone}"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message">
      <header class="confirm-modal__header">
        <div class="confirm-modal__header-main">
          <span class="confirm-modal__icon" aria-hidden="true">
            <i class="bi {resolvedIcon}"></i>
          </span>
          {#if title}
            <h2 id="confirm-modal-title" class="confirm-modal__title">{title}</h2>
          {/if}
        </div>
        <button
          type="button"
          class="confirm-modal__close"
          aria-label={t('Close')}
          disabled={loading}
          on:click={() => handleClose(false)}>
          <i class="bi bi-x-lg"></i>
        </button>
      </header>

      {#if message}
        <div class="confirm-modal__body">
          <p id="confirm-modal-message" class="confirm-modal__message">{message}</p>
        </div>
      {/if}

      <footer class="confirm-modal__footer">
        <button
          type="button"
          class="confirm-modal__btn confirm-modal__btn--secondary"
          disabled={loading}
          on:click={() => handleClose(false)}>
          <i class="bi bi-x-lg"></i>
          {resolvedCancelText}
        </button>
        <button
          type="button"
          class="confirm-modal__btn confirm-modal__btn--{config.tone === 'danger' ? 'danger' : config.tone === 'warning' ? 'warning' : 'primary'}"
          disabled={loading}
          bind:this={confirmButton}
          on:click={() => handleClose(true)}>
          {#if loading}
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          {:else}
            <i class="bi {resolvedIcon}"></i>
          {/if}
          {resolvedConfirmText}
        </button>
      </footer>
    </section>
  </div>
{/if}

<style>
  .confirm-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10150;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--modal-overlay-padding, 1rem);
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(4px);
    animation: confirmOverlayIn 180ms ease forwards;
  }

  .confirm-modal {
    width: min(95vw, 26.25rem);
    max-height: min(90vh, 40rem);
    display: flex;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14);
    overflow: hidden;
    animation: confirmModalIn 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    min-width: 0;
  }

  .confirm-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }

  .confirm-modal__header-main {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .confirm-modal__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    background: #eff6ff;
    color: #0f6efd;
  }

  .confirm-modal--danger .confirm-modal__icon {
    background: #fef2f2;
    color: #ef4444;
  }

  .confirm-modal--warning .confirm-modal__icon {
    background: #fffbeb;
    color: #f59e0b;
  }

  .confirm-modal--info .confirm-modal__icon {
    background: #f0f9ff;
    color: #0284c7;
  }

  .confirm-modal--success .confirm-modal__icon {
    background: #ecfdf5;
    color: #059669;
  }

  .confirm-modal__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
    text-align: start;
  }

  .confirm-modal__close {
    width: 32px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .confirm-modal__close:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .confirm-modal__close:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .confirm-modal__body {
    padding: 18px;
  }

  .confirm-modal__message {
    margin: 0;
    color: #64748b;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.55;
    text-align: start;
  }

  .confirm-modal__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  .confirm-modal__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 38px;
    padding: 8px 14px;
    border-radius: 10px;
    border: 1px solid transparent;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .confirm-modal__btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .confirm-modal__btn--secondary {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .confirm-modal__btn--secondary:hover:not(:disabled) {
    background: #f8fafc;
  }

  .confirm-modal__btn--primary {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .confirm-modal__btn--primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .confirm-modal__btn--danger {
    background: #ef4444;
    color: #ffffff;
    border-color: #ef4444;
  }

  .confirm-modal__btn--danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .confirm-modal__btn--warning {
    background: #f59e0b;
    color: #ffffff;
    border-color: #f59e0b;
  }

  .confirm-modal__btn--warning:hover:not(:disabled) {
    background: #d97706;
  }

  @keyframes confirmOverlayIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes confirmModalIn {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 576px) {
    .confirm-modal-overlay {
      padding: 12px;
    }

    .confirm-modal__footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .confirm-modal__btn {
      width: 100%;
    }
  }
</style>
