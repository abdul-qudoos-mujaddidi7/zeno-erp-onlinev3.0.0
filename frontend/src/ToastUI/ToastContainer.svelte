<script>
  import { toasts } from './toastStore.js';

  
  import {t, lang, translate_org_type } from '../i18n/i18n.js';
  $: _lang = $lang;

  const icons = {
    success: 'bi bi-check-circle-fill',
    error: 'bi bi-x-circle-fill',
    warning: 'bi bi-exclamation-triangle-fill',
    info: 'bi bi-info-circle-fill'
  };

  const colors = {
    success: 'bg-success',
    error: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-info'
  };

  let exiting = new Set();

  function close(id) {
    const toast = $toasts.find(t => t.id === id);

    if (toast?.confirm) {
      toast.resolve(false);
    }

    exiting.add(id);
    exiting = exiting;

    setTimeout(() => {
      toasts.remove(id);
      exiting.delete(id);
      exiting = exiting;
    }, 320);
  }

  function confirmYes(toast) {
    toast.resolve(true);
    close(toast.id);
  }

  function confirmNo(toast) {
    toast.resolve(false);
    close(toast.id);
  }
</script>
<!-- NORMAL TOASTS -->
<div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 2147483000;">
  {#each $toasts.filter(t => !t.confirm) as toast (toast.id)}
    <div
      class={`
        toast show border-0 shadow-lg text-white mb-2
        ${colors[toast.type]}
        ${exiting.has(toast.id) ? 'toast-modern-out' : 'toast-modern-in'}
      `}
    >

      <div class="toast-header border-0 bg-transparent text-white">
        <i class={`${icons[toast.type]} me-2 fs-5`}></i>

        <strong class="me-auto">
          {toast.title || toast.type.toUpperCase()}
        </strong>

        <button
          type="button"
          class="btn-close btn-close-white ms-2"
          on:click={() => close(toast.id)}
        />
      </div>

      <div class="toast-body pt-0">
        {@html toast.message}
      </div>

    </div>
  {/each}
</div>

<!-- CONFIRM TOAST (CENTER) -->
{#each $toasts.filter(t => t.confirm) as toast (toast.id)}
  <div class={`
    toast-confirm-overlay
    ${exiting.has(toast.id) ? 'overlay-out' : 'overlay-in'}
  `}>

    <div
      class={`
        toast show border-0 shadow-lg text-white
        ${colors[toast.type]}
        ${exiting.has(toast.id) ? 'toast-modern-out' : 'toast-modern-in'}
        toast-confirm-popup
      `}
    >

      <!-- HEADER -->
      <div class="toast-header border-0 bg-transparent text-white">
        <i class={`${icons[toast.type]} me-2 fs-5`}></i>

        <strong class="me-auto">
          {toast.title || toast.type.toUpperCase()}
        </strong>

        <button
          type="button"
          class="btn-close btn-close-white ms-2"
          on:click={() => close(toast.id)}
        />
      </div>

      <!-- BODY -->
      <div class="toast-body pt-0">
        {@html toast.message}

        <div class="mt-3 d-flex justify-content-end gap-2">
          <button
            class="btn btn-sm btn-light"
            on:click={() => confirmNo(toast)}
          >
            {t('Cancel')}
          </button>

          <button
            class="btn btn-sm btn-dark"
            on:click={() => confirmYes(toast)}
          >
            {t('Confirm')}
          </button>
        </div>
      </div>

    </div>

  </div>
{/each}

<style>
    @keyframes toastInModern {
  0% {
    opacity: 0;
    transform: translateX(40px) scale(0.96);
    filter: blur(6px);
  }
  100% {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0);
  }
}

@keyframes toastOutModern {
  0% {
    opacity: 1;
    transform: translateX(0) scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0;
    transform: translateX(40px) scale(0.92);
    filter: blur(6px);
  }
}

.toast-modern-in {
  animation: toastInModern 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.toast-modern-out {
  animation: toastOutModern 300ms cubic-bezier(0.4, 0, 1, 1) both;
}


/* FULLSCREEN OVERLAY */
.toast-confirm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  z-index: 10000;
}

/* POPUP STYLE */
.toast-confirm-popup {
  min-width: 320px;
  max-width: 420px;
  transform-origin: center;
  animation: toastPopupIn 260ms ease;
}

/* POPUP ANIMATION */
@keyframes toastPopupIn {
  0% {
    opacity: 0;
    transform: scale(0.85) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}



@keyframes overlayIn {
  from {
    opacity: 0;
    backdrop-filter: blur(0);
  }
  to {
    opacity: 1;
    backdrop-filter: blur(4px);
  }
}

@keyframes overlayOut {
  from {
    opacity: 1;
    backdrop-filter: blur(4px);
  }
  to {
    opacity: 0;
    backdrop-filter: blur(0);
  }
}

.overlay-in {
  animation: overlayIn 200ms ease forwards;
}

.overlay-out {
  animation: overlayOut 280ms ease forwards;
}
</style>