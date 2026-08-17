<script>
  import { createEventDispatcher } from 'svelte';
  import { t, lang } from '../../i18n/i18n';

  export let disabled = false;
  export let loading = false;
  export let extraClass = '';

  const dispatch = createEventDispatcher();

  $: _lang = $lang;

  let open = false;
  let rootEl;

  function close() {
    open = false;
  }

  function toggle(event) {
    event.stopPropagation();
    if (disabled || loading) return;
    open = !open;
  }

  function choose(format) {
    if (disabled || loading) return;
    close();
    dispatch('export', format);
  }

  function handleWindowClick(event) {
    if (!open) return;
    if (rootEl && !rootEl.contains(event.target)) close();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') close();
  }
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleKeydown} />

<div class="export-menu {extraClass}" class:is-open={open} bind:this={rootEl}>
  <button
    type="button"
    class="action-btn secondary"
    class:is-open={open}
    disabled={disabled || loading}
    title={t('Download')}
    aria-label={t('Download')}
    aria-haspopup="menu"
    aria-expanded={open}
    data-lang={_lang}
    on:click={toggle}
  >
    {#if loading}
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
    {:else}
      <i class="bi bi-download"></i>
    {/if}
    <span>{t('Download')}</span>
    <i class="bi bi-chevron-down export-menu__chevron" aria-hidden="true"></i>
  </button>

  {#if open}
    <div class="export-menu__panel" role="menu">
      <button type="button" class="export-menu__item" role="menuitem" on:click|stopPropagation={() => choose('pdf')}>
        <i class="bi bi-file-earmark-pdf-fill"></i>
        <span>{t('PDF')}</span>
      </button>
      <button type="button" class="export-menu__item" role="menuitem" on:click|stopPropagation={() => choose('excel')}>
        <i class="bi bi-file-earmark-excel-fill"></i>
        <span>{t('Excel')}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .export-menu {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: var(--button-height-sm, 2rem);
    padding: 0.25rem 0.55rem;
    border: 1px solid transparent;
    border-radius: var(--control-radius, 0.4rem);
    font-size: var(--control-font, 0.78rem);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .action-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .secondary {
    color: #334155;
    background: #ffffff;
    border-color: #e5e7eb;
  }

  :global(html.dark) .secondary {
    color: var(--erp-text);
    background: var(--erp-surface-soft);
    border-color: var(--erp-border);
  }

  .secondary:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  :global(html.dark) .secondary:hover:not(:disabled) {
    background: #1e293b;
    border-color: var(--erp-border-strong);
  }

  .export-menu__chevron {
    font-size: 0.7rem;
    opacity: 0.72;
    transition: transform 0.15s ease;
  }

  .action-btn.is-open .export-menu__chevron {
    transform: rotate(180deg);
  }

  .export-menu__panel {
    position: absolute;
    top: calc(100% + 0.35rem);
    inset-inline-start: 0;
    z-index: 80;
    min-width: 9.5rem;
    padding: 0.3rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.55rem;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  }

  :global(html.dark) .export-menu__panel {
    border-color: var(--erp-border);
    background: var(--erp-surface);
    box-shadow: var(--erp-shadow-md, 0 12px 28px rgba(0, 0, 0, 0.28));
  }

  .export-menu__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 2.15rem;
    padding: 0.35rem 0.65rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: #334155;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  :global(html.dark) .export-menu__item {
    color: var(--erp-text);
  }

  .export-menu__item:hover,
  .export-menu__item:focus-visible {
    background: #f8fafc;
    outline: none;
  }

  :global(html.dark) .export-menu__item:hover,
  :global(html.dark) .export-menu__item:focus-visible {
    background: rgba(148, 163, 184, 0.12);
  }

  .export-menu__item .bi-file-earmark-pdf-fill {
    color: #dc2626;
  }

  .export-menu__item .bi-file-earmark-excel-fill {
    color: #059669;
  }
</style>
