<script>
  import { createEventDispatcher } from 'svelte';
  import AppModal from './AppModal.svelte';

  export let title = '';
  export let subtitle = '';
  export let icon = 'bi-plus-circle';
  export let dir = 'ltr';
  export let appearance = 'default';

  const dispatch = createEventDispatcher();
</script>

<div
  class="quick-entry-modal quick-entry-modal--{appearance}"
  class:quick-entry-modal--compact={appearance === 'journal' || appearance === 'exchange'}
  class:quick-entry-modal--journal={appearance === 'journal' || appearance === 'exchange'}
  dir={dir === 'rtl' ? 'rtl' : 'ltr'}>
  <AppModal
    {title}
    {subtitle}
    {icon}
    showIcon={appearance === 'journal' || appearance === 'exchange'}
    appearance="default"
    size="full"
    on:close={() => dispatch('close')}>
    <div class="quick-entry-modal__content">
      <slot />
    </div>
  </AppModal>
</div>

<style>
  .quick-entry-modal {
    position: relative;
    z-index: 10050;
  }

  .quick-entry-modal__content {
    min-width: 0;
  }

  .quick-entry-modal :global(.app-modal--full) {
    width: min(94vw, 48rem);
    border-radius: 0.9rem;
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.2);
  }

  .quick-entry-modal :global(.app-modal__header) {
    min-height: 5rem;
    align-items: center;
    padding: 1rem 1.35rem;
  }

  .quick-entry-modal :global(.app-modal__title) {
    font-size: 1.2rem;
    font-weight: 850;
  }

  .quick-entry-modal :global(.app-modal__close) {
    order: -1;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.7rem;
  }

  .quick-entry-modal[dir='ltr'] :global(.app-modal__close) {
    order: 2;
  }

  .quick-entry-modal :global(.app-modal__body) {
    padding: 1.35rem 1.5rem 1.1rem;
  }

  .quick-entry-modal__content :global(.card) {
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .quick-entry-modal__content :global(.card-body) {
    padding: 0 !important;
  }

  .quick-entry-modal__content :global(.exchange-form-page),
  .quick-entry-modal__content :global(.journal-form-page) {
    padding: 0;
    background: transparent !important;
  }

  .quick-entry-modal__content :global(.form-control),
  .quick-entry-modal__content :global(.form-select),
  .quick-entry-modal__content :global(.journal-unified-input-group),
  .quick-entry-modal__content :global(.journal-amount-row),
  .quick-entry-modal__content :global(.exchange-unified-input-group),
  .quick-entry-modal__content :global(.exchange-amount-row) {
    border-color: #d5e3f1 !important;
    background: #ffffff !important;
  }

  .quick-entry-modal__content :global(.form-control:focus),
  .quick-entry-modal__content :global(.form-select:focus) {
    border-color: #93c5fd !important;
    box-shadow: 0 0 0 0.2rem rgba(37, 99, 235, 0.1) !important;
  }

  .quick-entry-modal__content :global(.exchange-submit-field),
  .quick-entry-modal__content :global(.journal-submit-field) {
    flex: 0 0 100%;
    width: 100%;
    max-width: 100%;
    padding-top: 0.35rem;
  }

  .quick-entry-modal__content :global(.exchange-submit-btn),
  .quick-entry-modal__content :global(.journal-submit-btn) {
    min-height: 3rem;
    border-radius: 0.7rem;
    background: linear-gradient(135deg, #2f6fed, #2457d6) !important;
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2) !important;
    font-size: 0.9rem;
  }

  .quick-entry-modal__content :global(.exchange-form-card .row > [class*='col-md-']),
  .quick-entry-modal__content :global(.journal-form-card .row > [class*='col-md-']) {
    flex: 0 0 50%;
    width: 50%;
    max-width: 50%;
  }

  .quick-entry-modal__content :global(.exchange-form-card .row > .exchange-submit-field),
  .quick-entry-modal__content :global(.journal-form-card .row > .journal-submit-field) {
    flex: 0 0 100%;
    width: 100%;
    max-width: 100%;
  }

  @media (max-width: 576px) {
    .quick-entry-modal :global(.app-modal__body) {
      padding: 1rem;
    }

    .quick-entry-modal__content :global(.exchange-form-card .row > [class*='col-md-']),
    .quick-entry-modal__content :global(.journal-form-card .row > [class*='col-md-']) {
      flex: 0 0 100%;
      width: 100%;
      max-width: 100%;
    }
  }

  .quick-entry-modal--compact {
    --journal-modal-primary: var(--bs-primary, #0f6efd);
    --journal-modal-border: #d8e1ee;
    --journal-modal-muted: #7183a3;
    --quick-entry-control-height: 2.45rem;
    --quick-entry-label-space: 1.26rem;
  }

  .quick-entry-modal--compact :global(.app-modal-overlay) {
    overflow-y: auto;
    background: rgba(15, 23, 42, 0.52);
    backdrop-filter: none;
  }

  .quick-entry-modal--compact :global(.app-modal--full) {
    width: min(94vw, 40rem);
    max-height: none;
    border: 1px solid #dbe3ee;
    border-radius: 0.75rem;
    background: #ffffff;
    box-shadow: 0 18px 48px rgba(15, 23, 42, 0.2);
    overflow: visible;
    animation: none;
  }

  .quick-entry-modal--compact :global(.app-modal__header) {
    min-height: 5.5rem;
    align-items: center;
    padding: 0.5rem 1.15rem;
    border-bottom: 0;
    border-radius: 0.7rem 0.7rem 0 0;
    background: var(--journal-modal-primary);
  }

  .quick-entry-modal--compact :global(.app-modal__header-main) {
    align-items: center;
    gap: 0.9rem;
  }

  .quick-entry-modal--compact :global(.app-modal__icon) {
    width: 4.4rem;
    height: 4.4rem;
    min-height: 4.4rem;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: #ffffff;
    color: var(--journal-modal-primary);
    box-shadow: 0 4px 12px rgba(8, 48, 118, 0.2);
    font-size: 1.35rem;
  }

  .quick-entry-modal--compact :global(.app-modal__title) {
    color: #ffffff;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .quick-entry-modal--compact :global(.app-modal__close) {
    order: initial;
    width: 2rem;
    height: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
  }

  .quick-entry-modal--compact :global(.app-modal__close:hover:not(:disabled)) {
    border-color: #ffffff;
    background: #ffffff;
    color: var(--journal-modal-primary);
  }

  .quick-entry-modal--compact :global(.app-modal__body) {
    padding: 0.75rem 1.1rem 0.8rem;
    border-radius: 0 0 0.7rem 0.7rem;
    background: #ffffff;
    overflow: visible;
  }

  .quick-entry-modal--compact .quick-entry-modal__content,
  .quick-entry-modal--compact .quick-entry-modal__content :global(.journal-form-page),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.exchange-form-page),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.journal-form-card),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.exchange-form-card),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.journal-form-card .card-body),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.exchange-form-card .card-body) {
    overflow: visible !important;
  }

  .quick-entry-modal--compact
    .quick-entry-modal__content
    :global(.persianDatePicker > .legacy-app-date-picker-host) {
    width: 100%;
    height: 100%;
    min-width: 0;
    flex: 1 1 auto;
    overflow: visible;
  }

  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .app-date-field),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .pdp),
  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .pdp-group) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .app-date-field) {
    display: block;
  }

  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .pdp) {
    --z-index: 100000;
  }

  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .pdp-input) {
    width: 100%;
    height: 100% !important;
    min-height: 0 !important;
    max-height: 100%;
    padding: 0.25rem 0.625rem !important;
    border: 0 !important;
    border-radius: 0.45rem !important;
    box-shadow: none !important;
    color: #0f172a;
    font-size: 0.86rem;
    text-align: center !important;
  }

  .quick-entry-modal--compact .quick-entry-modal__content :global(.persianDatePicker .pdp-picker) {
    z-index: 100000 !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-page) {
    --journal-control-height: var(--quick-entry-control-height);
    --journal-label-offset: 1.2rem;
  }

  .quick-entry-modal--journal {
    --journal-modal-primary: var(--z-link, #2f6fed);
    --journal-modal-border: var(--z-border, #e1e7f0);
    --quick-entry-control-height: 40px;
  }

  .quick-entry-modal--journal :global(.app-modal-overlay) {
    align-items: center;
    padding: 12px;
    overflow-y: auto;
    background: rgba(11, 21, 48, 0.4);
    backdrop-filter: none;
  }

  .quick-entry-modal--journal :global(.app-modal--full) {
    /* Journal.dc.html's "Create Journal" dialog: a 520px column that is as tall
       as its content (header + fields + footer), not a fixed 34rem frame. The
       viewport clamp keeps it usable on short screens, where the field body —
       not the dialog — scrolls. */
    width: 520px;
    max-width: calc(100vw - 24px);
    height: auto;
    max-height: calc(100vh - 24px);
    /* The reference shell has no outline: the shadow carries the edge, so the
       box measures exactly 520px instead of 522px with a hairline. */
    border: 0;
    border-radius: 14px;
    background: var(--z-surface, #ffffff);
    box-shadow: 0 30px 70px -20px rgba(11, 21, 48, 0.55);
    overflow: hidden;
  }

  .quick-entry-modal--journal :global(.app-modal__header) {
    min-height: 50px;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    border-radius: 13px 13px 0 0;
    background: var(--z-surface, #ffffff);
  }

  .quick-entry-modal--journal :global(.app-modal__header-main) {
    align-items: center;
    gap: 9px;
  }

  .quick-entry-modal--journal :global(.app-modal__icon) {
    width: 30px;
    height: 30px;
    min-height: 30px;
    border: 0;
    border-radius: 9px;
    /* AddJournal publishes the active direction tone here (#DC2626 debit /
       #16A34A credit) so the tile follows the reference dialog. */
    background: color-mix(in srgb, var(--jv-accent, #dc2626) 13%, transparent);
    color: var(--jv-accent, #dc2626);
    box-shadow: none;
    font-size: 18px;
  }

  .quick-entry-modal--journal :global(.app-modal__icon .ms) {
    font-size: 18px;
  }

  .quick-entry-modal--journal :global(.app-modal__titles) {
    display: flex;
    align-items: center;
  }

  .quick-entry-modal--journal :global(.app-modal__title) {
    color: var(--z-ink, #0b1530);
    font-size: 14px;
    font-weight: 800;
    line-height: 30px;
  }

  .quick-entry-modal--journal :global(.app-modal__close) {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #64748b;
    font-size: 18px;
  }

  .quick-entry-modal--journal :global(.app-modal__close:hover:not(:disabled)) {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  .quick-entry-modal--journal :global(.app-modal__body) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    max-height: calc(100vh - 90px);
    padding: 0;
    border-radius: 0 0 13px 13px;
    background: var(--z-surface, #ffffff);
    overflow: hidden;
  }

  .quick-entry-modal--journal .quick-entry-modal__content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }

  /* The exchange dialog is the journal dialog: its own component draws the
     body, so the shell only needs the header accent. */
  .quick-entry-modal--exchange {
    --jv-accent: var(--z-link, #2f6fed);
  }

  @media (max-width: 576px) {
    .quick-entry-modal--compact :global(.app-modal-overlay) {
      align-items: flex-start;
      padding: 0.5rem;
    }

    .quick-entry-modal--compact :global(.app-modal--full) {
      width: min(96vw, 40rem);
    }

    .quick-entry-modal--compact :global(.app-modal__header) {
      min-height: 5.25rem;
      padding-inline: 0.9rem;
    }

    .quick-entry-modal--compact :global(.app-modal__icon) {
      width: 4.1rem;
      height: 4.1rem;
      min-height: 4.1rem;
    }

    .quick-entry-modal--compact :global(.app-modal__title) {
      font-size: 1.08rem;
    }

    .quick-entry-modal--compact :global(.app-modal__body) {
      padding: 0.75rem 0.85rem;
    }

    .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-row) {
      grid-template-columns: 1fr;
      gap: 0.7rem;
    }

    .quick-entry-modal--journal
      .quick-entry-modal__content
      :global(.journal-form-row > [class*='col-md-']) {
      grid-column: 1 / -1 !important;
      width: auto !important;
      max-width: none !important;
    }

    .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-field),
    .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-submit-field) {
      grid-column: 1 / -1 !important;
    }

    .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-field) {
      padding-top: 0 !important;
    }
  }

  @media (max-width: 576px) {
    .quick-entry-modal--journal :global(.app-modal--full) {
      /* Same 520px column as the reference, clamped to the phone viewport; the
         height still follows the content. */
      width: 520px;
      max-width: calc(100vw - 24px);
      height: auto;
      max-height: calc(100vh - 16px);
    }

    .quick-entry-modal--journal :global(.app-modal__header) {
      min-height: 50px;
      padding: 10px 14px;
    }

    .quick-entry-modal--journal :global(.app-modal__icon) {
      width: 30px;
      height: 30px;
      min-height: 30px;
    }

    .quick-entry-modal--journal :global(.app-modal__title) {
      font-size: 14px;
    }

    .quick-entry-modal--journal :global(.app-modal__body) {
      max-height: calc(100vh - 82px);
      /* The form body and footer own their 12px/14px inset (as in the reference),
         so the dialog shell must not add a second one on phones. */
      padding: 0;
    }
  }

  :global(html.dark) .quick-entry-modal--journal {
    --journal-modal-border: var(--erp-border, #2b3a4f);
    --journal-modal-muted: var(--erp-muted, #94a3b8);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal-overlay) {
    background: rgba(2, 6, 23, 0.76);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal--full) {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__header) {
    border-bottom-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__icon) {
    border: 0;
    background: color-mix(in srgb, var(--jv-accent, #dc2626) 20%, transparent);
    color: color-mix(in srgb, var(--jv-accent, #dc2626) 65%, #ffffff);
    box-shadow: none;
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__title) {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__close:hover:not(:disabled)) {
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__body),
  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content,
  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-page),
  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-card),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-card .card-body) {
    background: var(--erp-surface, #111827) !important;
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-field-label) {
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content :global(.form-control),
  :global(html.dark) .quick-entry-modal--journal .quick-entry-modal__content :global(.form-select),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-unified-input-group),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-customer-control) {
    border-color: var(--journal-modal-border) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-unified-input-group .form-control),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-unified-input-group .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-search-input),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-selected-name),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-selected-account),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.persianDatePicker .pdp-input) {
    background: transparent !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-customer-control__icon),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-unified-input-group .input-group-text),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.persianDatePicker .persian-date-text) {
    border-color: var(--journal-modal-border) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text-soft, #cbd5e1) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.form-control::placeholder),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-search-input::placeholder) {
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--debit) {
    border-color: rgba(248, 113, 113, 0.4) !important;
    background: rgba(248, 113, 113, 0.12) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--debit .form-control),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--debit .form-control:hover),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--debit .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--debit .journal-currency-picker__btn) {
    background: rgba(248, 113, 113, 0.12) !important;
    color: #fca5a5 !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--credit) {
    border-color: rgba(52, 211, 153, 0.38) !important;
    background: rgba(52, 211, 153, 0.12) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--credit .form-control),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--credit .form-control:hover),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--credit .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row--credit .journal-currency-picker__btn) {
    background: rgba(52, 211, 153, 0.12) !important;
    color: #6ee7b7 !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-currency-picker) {
    border-color: var(--journal-modal-border);
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-currency-menu),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-dropdown) {
    border-color: var(--journal-modal-border);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-currency-menu__item),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option__copy strong) {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-currency-menu__item:hover),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-currency-menu__item.selected),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option:hover),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option:focus-visible),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option.is-selected) {
    background: rgba(96, 165, 250, 0.14);
    color: #bfdbfe;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option__avatar) {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-option__copy small),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-account-balance),
  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-balance-text) {
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-mode-btn) {
    border-color: var(--journal-modal-border);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-mode-btn:hover) {
    border-color: #4b6280;
    background: #1e293b;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-mode-btn--active.journal-mode-btn--track) {
    border-color: rgba(248, 113, 113, 0.42);
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-mode-btn--active.journal-mode-btn--notrack) {
    border-color: #526176;
    background: #253247;
    color: #f8fafc;
  }

  :global(html.dark)
    .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-mode-btn--active.journal-mode-btn--treasury) {
    border-color: rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.14);
    color: #6ee7b7;
  }

</style>
