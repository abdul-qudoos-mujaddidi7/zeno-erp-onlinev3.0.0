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

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-row) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: 0.7rem 0.75rem;
    margin: 0;
  }

  /*
   * Journal modal layout:
   * - Customer: 8/12
   * - Date:     4/12
   * - Other normal fields: 6/12
   *
   * This intentionally overrides the generic 50% rule above.
   */
  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-row > [class*='col-md-']) {
    grid-column: span 6;
    min-width: 0;
  }

  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-row > .journal-customer-field) {
    grid-column: span 8 !important;
    width: auto !important;
    max-width: none !important;
  }

  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-row > .journal-date-field),
  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(
      .journal-form-row
        > [class*='col-md-']:has(.journal-unified-input-group.persianDatePicker)
    ) {
    grid-column: span 4 !important;
    width: auto !important;
    max-width: none !important;
  }

  /*
   * The bill picker always spans the full row below the
   * customer/date line.
   */
  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-row > .journal-bill-field) {
    grid-column: 1 / -1 !important;
    width: 100% !important;
    max-width: none !important;
  }

  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-form-card .row > [class*='col-md-']) {
    width: auto;
    max-width: none;
    padding: 0;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-form-card .card-body) {
    padding: 0 !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-field-label) {
    display: flex;
    align-items: center;
    min-height: 1rem;
    margin-bottom: 0.25rem;
    color: #344054;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1rem;
  }

  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-unified-input-group.persianDatePicker) {
    position: relative;
    z-index: 2;
    height: var(--journal-control-height);
    min-height: var(--journal-control-height);
    max-height: var(--journal-control-height);
    overflow: visible !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-unified-input-group),
  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-amount-row) {
    border-color: var(--journal-modal-border) !important;
    border-radius: 0.5rem;
    background: #ffffff !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.form-control),
  .quick-entry-modal--journal .quick-entry-modal__content :global(.form-select) {
    min-height: var(--journal-control-height) !important;
    height: var(--journal-control-height);
    border-color: var(--journal-modal-border) !important;
    border-radius: 0.5rem;
    background: #ffffff !important;
    color: #0f172a;
    font-size: 0.86rem;
  }

  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row .journal-unified-input-group--inline),
  .quick-entry-modal--journal
    .quick-entry-modal__content
    :global(.journal-amount-row .journal-unified-input-group--inline .form-control) {
    border-radius: 0 !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-unified-input-group:focus-within),
  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-amount-row:focus-within) {
    border-color: var(--journal-modal-primary) !important;
    box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.1);
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-currency-picker__btn) {
    min-height: var(--journal-control-height);
    color: #475569;
    font-size: 0.78rem;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-account-quick-btn) {
    background: var(--journal-modal-primary) !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-actions) {
    gap: 0.4rem;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-field) {
    padding-top: var(--quick-entry-label-space) !important;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-btn) {
    min-height: var(--journal-control-height);
    border-radius: 0.5rem;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-submit-field) {
    grid-column: 1 / -1;
    display: flex;
    width: 100%;
    max-width: none;
    padding-top: 0.05rem;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-submit-btn) {
    width: auto !important;
    min-width: 8.5rem;
    min-height: 2.5rem;
    margin-inline-start: auto;
    padding-inline: 1.2rem;
    border-radius: 0.5rem;
    border-color: var(--journal-modal-primary) !important;
    background: var(--journal-modal-primary) !important;
    box-shadow: none !important;
    font-size: 0.86rem;
  }

  .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-submit-btn:hover) {
    border-color: #0b5ed7 !important;
    background: #0b5ed7 !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-page) {
    --exchange-control-height: var(--quick-entry-control-height);
    --exchange-label-offset: 1.2rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-row) {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: 0.7rem 0.75rem;
    margin: 0;
  }

  /*
   * Exchange modal layout:
   * - Account/customer: 8/12
   * - Date:             4/12
   * - Other normal fields: 6/12
   *
   * The :has() fallback finds the date field even when it does not
   * have an explicit `.exchange-date-field` class.
   */
  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-row > [class*='col-md-']) {
    grid-column: span 6;
    min-width: 0;
  }

  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-row > .exchange-account-field),
  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-row > .exchange-customer-field) {
    grid-column: span 8 !important;
    width: auto !important;
    max-width: none !important;
  }

  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-row > .exchange-date-field),
  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(
      .exchange-form-row
        > [class*='col-md-']:has(.exchange-unified-input-group.persianDatePicker)
    ) {
    grid-column: span 4 !important;
    width: auto !important;
    max-width: none !important;
  }

  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-card .row > [class*='col-md-']) {
    width: auto;
    max-width: none;
    padding: 0;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-card .card-body) {
    padding: 0 !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-field-label) {
    display: flex;
    align-items: center;
    min-height: 1rem;
    margin-bottom: 0.25rem;
    color: #344054;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1rem;
  }

  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-unified-input-group.persianDatePicker) {
    position: relative;
    z-index: 2;
    height: var(--exchange-control-height);
    min-height: var(--exchange-control-height);
    max-height: var(--exchange-control-height);
    overflow: visible !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-unified-input-group),
  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-amount-row),
  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-benefit-row) {
    border-color: var(--journal-modal-border) !important;
    border-radius: 0.5rem;
    background: #ffffff !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.form-control),
  .quick-entry-modal--exchange .quick-entry-modal__content :global(.form-select) {
    min-height: var(--exchange-control-height) !important;
    height: var(--exchange-control-height);
    border-color: var(--journal-modal-border) !important;
    border-radius: 0.5rem;
    background: #ffffff !important;
    color: #0f172a;
    font-size: 0.86rem;
  }

  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row .exchange-unified-input-group--inline),
  .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row .exchange-unified-input-group--inline .form-control) {
    border-radius: 0 !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-unified-input-group:focus-within),
  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-amount-row:focus-within) {
    border-color: var(--journal-modal-primary) !important;
    box-shadow: 0 0 0 3px rgba(15, 110, 253, 0.1);
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-currency-picker__btn),
  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-rate-toggle) {
    min-height: var(--exchange-control-height);
    color: #475569;
    font-size: 0.78rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-account-quick-btn) {
    background: var(--journal-modal-primary) !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-benefit-row .badge) {
    min-height: var(--exchange-control-height);
    font-size: 0.82rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-mode-actions) {
    gap: 0.4rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-mode-field) {
    padding-top: var(--quick-entry-label-space) !important;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-mode-btn) {
    min-height: var(--exchange-control-height);
    border-radius: 0.5rem;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-submit-field) {
    grid-column: 1 / -1;
    display: flex;
    width: 100%;
    max-width: none;
    padding-top: 0.05rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-submit-btn) {
    width: auto !important;
    min-width: 8.5rem;
    min-height: 2.5rem;
    margin-inline-start: auto;
    padding-inline: 1.2rem;
    border-radius: 0.5rem;
    border-color: var(--journal-modal-primary) !important;
    background: var(--journal-modal-primary) !important;
    box-shadow: none !important;
    font-size: 0.86rem;
  }

  .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-submit-btn:hover) {
    border-color: #0b5ed7 !important;
    background: #0b5ed7 !important;
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

    .quick-entry-modal--journal .quick-entry-modal__content :global(.journal-mode-field),
    .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-mode-field) {
      padding-top: 0 !important;
    }

    .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-row) {
      grid-template-columns: 1fr;
      gap: 0.7rem;
    }

    .quick-entry-modal--exchange
      .quick-entry-modal__content
      :global(.exchange-form-row > [class*='col-md-']) {
      grid-column: 1 / -1 !important;
      width: auto !important;
      max-width: none !important;
    }

    .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-mode-field),
    .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-submit-field) {
      grid-column: 1 / -1 !important;
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
    border-bottom-color: rgba(147, 197, 253, 0.2);
  }

  :global(html.dark) .quick-entry-modal--journal :global(.app-modal__icon) {
    border-color: rgba(255, 255, 255, 0.4);
    background: var(--erp-surface-soft, #172033);
    color: #93c5fd;
    box-shadow: 0 6px 18px rgba(2, 6, 23, 0.32);
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

  :global(html.dark) .quick-entry-modal--exchange {
    --journal-modal-border: var(--erp-border, #2b3a4f);
    --journal-modal-muted: var(--erp-muted, #94a3b8);
    --exchange-debit-bg: rgba(248, 113, 113, 0.12);
    --exchange-debit-border: rgba(248, 113, 113, 0.4);
    --exchange-debit-color: #fca5a5;
    --exchange-credit-bg: rgba(52, 211, 153, 0.12);
    --exchange-credit-border: rgba(52, 211, 153, 0.38);
    --exchange-credit-color: #6ee7b7;
  }

  :global(html.dark) .quick-entry-modal--exchange :global(.app-modal-overlay) {
    background: rgba(2, 6, 23, 0.76);
  }

  :global(html.dark) .quick-entry-modal--exchange :global(.app-modal--full) {
    border-color: var(--erp-border, #2b3a4f);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48);
  }

  :global(html.dark) .quick-entry-modal--exchange :global(.app-modal__header) {
    border-bottom-color: rgba(147, 197, 253, 0.2);
  }

  :global(html.dark) .quick-entry-modal--exchange :global(.app-modal__icon) {
    border-color: rgba(255, 255, 255, 0.4);
    background: var(--erp-surface-soft, #172033);
    color: #93c5fd;
    box-shadow: 0 6px 18px rgba(2, 6, 23, 0.32);
  }

  :global(html.dark) .quick-entry-modal--exchange :global(.app-modal__body),
  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content,
  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-page),
  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-form-card),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-form-card .card-body) {
    background: var(--erp-surface, #111827) !important;
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content :global(.exchange-field-label) {
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content :global(.form-control),
  :global(html.dark) .quick-entry-modal--exchange .quick-entry-modal__content :global(.form-select),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-unified-input-group),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-control),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-benefit-row) {
    border-color: var(--journal-modal-border) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-unified-input-group .form-control),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-unified-input-group .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-search-input),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-selected-name),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-selected-account),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.persianDatePicker .pdp-input) {
    background: transparent !important;
    color: var(--erp-text, #e5edf8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-control__icon),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-unified-input-group .input-group-text),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.persianDatePicker .persian-date-text) {
    border-color: var(--journal-modal-border) !important;
    background: var(--erp-surface-soft, #172033) !important;
    color: var(--erp-text-soft, #cbd5e1) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.form-control::placeholder),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-search-input::placeholder) {
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--debit),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--debit .form-control),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--debit .form-control:hover),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--debit .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--debit .exchange-currency-picker__btn) {
    border-color: var(--exchange-debit-border) !important;
    background: var(--exchange-debit-bg) !important;
    color: var(--exchange-debit-color) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--credit),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--credit .form-control),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--credit .form-control:hover),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--credit .form-control:focus),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-amount-row--credit .exchange-currency-picker__btn) {
    border-color: var(--exchange-credit-border) !important;
    background: var(--exchange-credit-bg) !important;
    color: var(--exchange-credit-color) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-currency-picker) {
    border-color: var(--journal-modal-border);
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-rate-toggle) {
    border-color: var(--journal-modal-border) !important;
    background: var(--erp-surface-soft, #172033);
    color: #93c5fd;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-rate-toggle:hover) {
    background: #1e293b;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-benefit-row .badge) {
    background: rgba(52, 211, 153, 0.12) !important;
    color: #6ee7b7 !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-currency-menu),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-dropdown) {
    border-color: var(--journal-modal-border);
    background: var(--erp-surface, #111827);
    color: var(--erp-text, #e5edf8);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-currency-menu__item),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option__copy strong) {
    color: var(--erp-text, #e5edf8);
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-currency-menu__item:hover),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-currency-menu__item.selected),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option:hover),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option:focus-visible),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option.is-selected) {
    background: rgba(96, 165, 250, 0.14);
    color: #bfdbfe;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option__avatar) {
    background: rgba(96, 165, 250, 0.14);
    color: #93c5fd;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-option__copy small),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-account-balance),
  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-balance-text) {
    color: var(--erp-muted, #94a3b8) !important;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-mode-btn) {
    border-color: var(--journal-modal-border);
    background: var(--erp-surface-soft, #172033);
    color: var(--erp-text-soft, #cbd5e1);
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-mode-btn:hover) {
    border-color: #4b6280;
    background: #1e293b;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-mode-btn--active.exchange-mode-btn--track) {
    border-color: rgba(248, 113, 113, 0.42);
    background: rgba(248, 113, 113, 0.14);
    color: #fca5a5;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-mode-btn--active.exchange-mode-btn--notrack) {
    border-color: #526176;
    background: #253247;
    color: #f8fafc;
  }

  :global(html.dark)
    .quick-entry-modal--exchange
    .quick-entry-modal__content
    :global(.exchange-mode-btn--active.exchange-mode-btn--treasury) {
    border-color: rgba(52, 211, 153, 0.4);
    background: rgba(52, 211, 153, 0.14);
    color: #6ee7b7;
  }
</style>
