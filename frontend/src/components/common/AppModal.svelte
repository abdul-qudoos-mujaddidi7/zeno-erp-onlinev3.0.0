<script>
  import { createEventDispatcher } from 'svelte';
  import { t } from '../../i18n/i18n';

  export let title = '';
  export let subtitle = '';
  export let icon = '';
  /** @type {'default' | 'warning' | 'danger' | 'info' | 'primary'} */
  export let variant = 'default';
  /** @type {'sm' | 'md' | 'lg' | 'xl' | 'full'} */
  export let size = 'md';
  export let loading = false;
  export let closeOnOverlay = true;
  export let showClose = true;
  export let showIcon = true;
  /** @type {'default' | 'account'} */
  export let appearance = 'default';

  const dispatch = createEventDispatcher();

  const variantIcons = {
    default: 'bi-window-stack',
    warning: 'bi-exclamation-triangle',
    danger: 'bi-exclamation-octagon',
    info: 'bi-info-circle',
    primary: 'bi-printer',
  };

  $: resolvedIcon = icon || variantIcons[variant] || variantIcons.default;

  function handleClose() {
    if (loading) return;
    dispatch('close');
  }

  function handleOverlayClick(event) {
    if (!closeOnOverlay || loading) return;
    if (event.currentTarget === event.target) handleClose();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && !loading) {
      event.preventDefault();
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="app-modal-overlay" role="presentation" on:click={handleOverlayClick}>
  <section
    class="app-modal app-modal--{size} app-modal--{variant} app-modal--appearance-{appearance}"
    role="dialog"
    aria-modal="true"
    aria-labelledby="app-modal-title">
    <header class="app-modal__header">
      <div class="app-modal__header-main">
        {#if showIcon && resolvedIcon}
          <span class="app-modal__icon" aria-hidden="true">
            <i class="bi {resolvedIcon}"></i>
          </span>
        {/if}
        <div class="app-modal__titles">
          {#if title}
            <h2 id="app-modal-title" class="app-modal__title">{title}</h2>
          {/if}
          {#if subtitle}
            <p class="app-modal__subtitle">{subtitle}</p>
          {/if}
        </div>
      </div>
      {#if showClose}
        <button
          type="button"
          class="app-modal__close"
          aria-label={t('Close')}
          disabled={loading}
          on:click={handleClose}>
          <i class="bi bi-x-lg"></i>
        </button>
      {/if}
    </header>

    <div class="app-modal__body">
      <slot />
    </div>

    {#if $$slots.footer}
      <footer class="app-modal__footer">
        <slot name="footer" />
      </footer>
    {/if}
  </section>
</div>

<style>
  .app-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--modal-overlay-padding, 1rem);
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(4px);
    animation: appModalOverlayIn 180ms ease forwards;
  }

  .app-modal {
    width: min(95vw, 32.5rem);
    max-height: min(90vh, 50rem);
    display: flex;
    flex-direction: column;
    border: 1px solid #e2e8f0;
    border-radius: var(--card-radius, 0.875rem);
    background: #ffffff;
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.14);
    overflow: hidden;
    animation: appModalIn 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
    min-width: 0;
  }

  .app-modal--sm {
    width: min(95vw, 25rem);
  }

  .app-modal--md {
    width: min(95vw, 32.5rem);
  }

  .app-modal--lg {
    width: min(95vw, 45rem);
  }

  .app-modal--xl {
    width: min(95vw, 60rem);
  }

  .app-modal--full {
    width: min(97vw, 100rem);
  }

  .app-modal--appearance-account {
    position: relative;
    border-color: #dbe7f3;
    border-radius: 1rem;
    background:
      radial-gradient(circle at 10% 10%, rgba(59, 130, 246, 0.12), transparent 28%),
      radial-gradient(circle at 88% 90%, rgba(139, 92, 246, 0.07), transparent 30%),
      linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.02);
  }

  .app-modal--appearance-account::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    opacity: 0.22;
    background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: radial-gradient(ellipse 75% 65% at 50% 50%, #000 5%, transparent 78%);
  }

  .app-modal--appearance-account > * {
    position: relative;
    z-index: 1;
  }

  .app-modal--appearance-account .app-modal__header {
    min-height: 4.25rem;
    align-items: center;
    padding: 0.85rem clamp(1.1rem, 1.5vw, 1.5rem);
    border-bottom-color: rgba(219, 231, 243, 0.82);
    background: rgba(255, 255, 255, 0.42);
  }

  .app-modal--appearance-account .app-modal__title {
    font-size: 1.2rem;
    font-weight: 850;
  }

  .app-modal--appearance-account .app-modal__close {
    order: -1;
    width: 3.15rem;
    height: 3.15rem;
    border-color: #d5e3f1;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.9);
    color: #52647b;
    font-size: 1.15rem;
  }

  [dir='ltr'] .app-modal--appearance-account .app-modal__close {
    order: 2;
  }

  .app-modal--appearance-account .app-modal__close:hover:not(:disabled) {
    border-color: #93c5fd;
    background: #ffffff;
    color: #0f6efd;
  }

  .app-modal--appearance-account .app-modal__body {
    padding: clamp(1rem, 1.8vw, 1.6rem);
  }

  .app-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: var(--card-padding, 0.9rem) clamp(0.9rem, 1.2vw, 1.1rem);
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
    flex-shrink: 0;
  }

  .app-modal__header-main {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .app-modal__icon {
    width: var(--control-height);
    height: var(--control-height);
    min-height: var(--control-height);
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
    background: #eff6ff;
    color: #0f6efd;
  }

  .app-modal--warning .app-modal__icon {
    background: #fffbeb;
    color: #f59e0b;
  }

  .app-modal--danger .app-modal__icon {
    background: #fef2f2;
    color: #ef4444;
  }

  .app-modal--info .app-modal__icon {
    background: #f0f9ff;
    color: #0284c7;
  }

  .app-modal--primary .app-modal__icon {
    background: #eff6ff;
    color: #0f6efd;
  }

  .app-modal__titles {
    min-width: 0;
    text-align: start;
  }

  .app-modal__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
  }

  .app-modal__subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 500;
    color: #64748b;
    line-height: 1.45;
  }

  .app-modal__close {
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

  .app-modal__close:hover:not(:disabled) {
    background: #f8fafc;
    color: #0f172a;
    border-color: #cbd5e1;
  }

  .app-modal__close:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .app-modal__body {
    padding: var(--card-padding, 1rem);
    overflow: auto;
    min-height: 0;
    color: #0f172a;
    text-align: start;
  }

  .app-modal__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.7rem clamp(0.9rem, 1.2vw, 1.1rem);
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
    flex-shrink: 0;
  }

  .app-modal__footer :global(.app-modal-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: var(--button-height-sm, var(--control-height-sm));
    padding: 0.45rem 0.85rem;
    border-radius: var(--control-radius, 0.625rem);
    border: 1px solid transparent;
    font-size: var(--control-font, 0.8125rem);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .app-modal__footer :global(.app-modal-btn:disabled) {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .app-modal__footer :global(.app-modal-btn--primary) {
    background: #0f6efd;
    color: #ffffff;
    border-color: #0f6efd;
  }

  .app-modal__footer :global(.app-modal-btn--primary:hover:not(:disabled)) {
    background: #1d4ed8;
  }

  .app-modal__footer :global(.app-modal-btn--secondary) {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .app-modal__footer :global(.app-modal-btn--secondary:hover:not(:disabled)) {
    background: #f8fafc;
  }

  .app-modal__footer :global(.app-modal-btn--danger) {
    background: #ef4444;
    color: #ffffff;
    border-color: #ef4444;
  }

  .app-modal__footer :global(.app-modal-btn--danger:hover:not(:disabled)) {
    background: #dc2626;
  }

  .app-modal__footer :global(.app-modal-btn--warning) {
    background: #f59e0b;
    color: #ffffff;
    border-color: #f59e0b;
  }

  .app-modal__footer :global(.app-modal-btn--warning:hover:not(:disabled)) {
    background: #d97706;
  }

  .app-modal__body :global(.app-modal-alert) {
    display: flex;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid #fde68a;
    background: #fffbeb;
    color: #92400e;
    font-size: 13px;
    line-height: 1.5;
    margin-bottom: 16px;
  }

  .app-modal__body :global(.app-modal-alert--danger) {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }

  .app-modal__body :global(.app-modal-alert i) {
    flex-shrink: 0;
    margin-block-start: 2px;
  }

  .app-modal__body :global(.app-modal-stats) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }

  .app-modal__body :global(.app-modal-stats td) {
    padding: 8px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    vertical-align: middle;
  }

  .app-modal__body :global(.app-modal-stats td:last-child) {
    text-align: end;
    font-weight: 700;
    color: #0f172a;
    padding-inline-start: 16px;
  }

  .app-modal__body :global(.app-modal-stats td:first-child) {
    color: #64748b;
    font-weight: 500;
  }

  .app-modal__body :global(.app-modal-field) {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .app-modal__body :global(.app-modal-field label) {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
  }

  .app-modal__body :global(.app-modal-field input),
  .app-modal__body :global(.app-modal-field textarea),
  .app-modal__body :global(.app-modal-field select) {
    width: 100%;
    min-height: var(--button-height, var(--control-height));
    padding: 0.45rem 0.75rem;
    border: 1px solid #e2e8f0;
    border-radius: var(--control-radius, 0.625rem);
    font-size: 0.875rem;
    color: #0f172a;
    background: #ffffff;
    box-sizing: border-box;
  }

  .app-modal__body :global(.app-modal-field input:focus),
  .app-modal__body :global(.app-modal-field textarea:focus),
  .app-modal__body :global(.app-modal-field select:focus) {
    outline: none;
    border-color: #0f6efd;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .app-modal__body :global(.app-modal-inline-error) {
    margin: 6px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: #ef4444;
    line-height: 1.45;
  }

  .app-modal__body :global(.app-modal-loading) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: #475569;
  }

  :global(html.dark) .app-modal,
  :global(body.dark) .app-modal,
  :global([data-theme='dark']) .app-modal {
    border-color: #334762;
    background: #111827;
    color: #e5edf8;
    box-shadow: 0 24px 52px rgba(0, 0, 0, 0.38);
  }

  :global(html.dark) .app-modal__header,
  :global(body.dark) .app-modal__header,
  :global([data-theme='dark']) .app-modal__header {
    border-bottom-color: #2b3b52;
    background: #111827;
  }

  :global(html.dark) .app-modal__title,
  :global(body.dark) .app-modal__title,
  :global([data-theme='dark']) .app-modal__title {
    color: #f1f5f9;
  }

  :global(html.dark) .app-modal__subtitle,
  :global(body.dark) .app-modal__subtitle,
  :global([data-theme='dark']) .app-modal__subtitle {
    color: #8fa0b8;
  }

  :global(html.dark) .app-modal__body,
  :global(body.dark) .app-modal__body,
  :global([data-theme='dark']) .app-modal__body {
    color: #e5edf8;
  }

  :global(html.dark) .app-modal__close,
  :global(body.dark) .app-modal__close,
  :global([data-theme='dark']) .app-modal__close {
    border-color: #334762;
    background: #0f1a2d;
    color: #dbe7f7;
  }

  :global(html.dark) .app-modal__close:hover:not(:disabled),
  :global(body.dark) .app-modal__close:hover:not(:disabled),
  :global([data-theme='dark']) .app-modal__close:hover:not(:disabled) {
    border-color: #60a5fa;
    background: #14233b;
    color: #ffffff;
  }

  :global(html.dark) .app-modal__footer,
  :global(body.dark) .app-modal__footer,
  :global([data-theme='dark']) .app-modal__footer {
    border-top-color: #2b3b52;
    background: #172238;
  }

  :global(html.dark) .app-modal__body :global(.app-modal-field label),
  :global(body.dark) .app-modal__body :global(.app-modal-field label),
  :global([data-theme='dark']) .app-modal__body :global(.app-modal-field label) {
    color: #c8d4e6;
  }

  :global(html.dark) .app-modal__body :global(.app-modal-field input),
  :global(html.dark) .app-modal__body :global(.app-modal-field textarea),
  :global(html.dark) .app-modal__body :global(.app-modal-field select),
  :global(body.dark) .app-modal__body :global(.app-modal-field input),
  :global(body.dark) .app-modal__body :global(.app-modal-field textarea),
  :global(body.dark) .app-modal__body :global(.app-modal-field select),
  :global([data-theme='dark']) .app-modal__body :global(.app-modal-field input),
  :global([data-theme='dark']) .app-modal__body :global(.app-modal-field textarea),
  :global([data-theme='dark']) .app-modal__body :global(.app-modal-field select) {
    border-color: #334762;
    background: #111c2f;
    color: #e5edf8;
  }

  @keyframes appModalOverlayIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes appModalIn {
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
    .app-modal-overlay {
      padding: 0.65rem;
    }

    .app-modal__footer {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .app-modal__footer :global(.app-modal-btn) {
      width: 100%;
    }
  }
</style>
