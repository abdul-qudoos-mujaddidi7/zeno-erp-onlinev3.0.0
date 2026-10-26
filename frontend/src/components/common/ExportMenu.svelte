<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { t, lang } from '../../i18n/i18n';

  export let disabled = false;
  export let loading = false;
  export let extraClass = '';
  /** Draw shared export controls with the Journal Material Symbols icons. */
  export let material = true;

  const dispatch = createEventDispatcher();

  $: _lang = $lang;

  let open = false;
  let rootEl;
  let triggerEl;
  let panelEl;
  let panelStyle = '';
  let panelDir = 'ltr';

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function close() {
    open = false;
  }

  function positionPanel(height = panelEl?.offsetHeight || 70) {
    if (!triggerEl) return;

    const rect = triggerEl.getBoundingClientRect();
    const width = Math.min(panelEl?.offsetWidth || 150, window.innerWidth - 16);
    panelDir = getComputedStyle(triggerEl).direction;
    const isRtl = panelDir === 'rtl';
    const desiredLeft = isRtl ? rect.left : rect.right - width;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, desiredLeft));
    const belowTop = rect.bottom + 4;
    const fitsBelow = belowTop + height <= window.innerHeight - 8;
    const top = fitsBelow
      ? belowTop
      : Math.max(8, rect.top - height - 4);

    panelStyle = `position:fixed;top:${top}px;right:auto;bottom:auto;left:${left}px;width:${width}px;`;
  }

  async function toggle(event) {
    event.stopPropagation();
    if (disabled || loading) return;
    if (open) {
      close();
      return;
    }

    positionPanel(70);
    open = true;
    await tick();
    positionPanel();
  }

  function choose(format) {
    if (disabled || loading) return;
    close();
    dispatch('export', format);
  }

  function handleWindowClick(event) {
    if (!open) return;
    if (!rootEl?.contains(event.target) && !panelEl?.contains(event.target)) close();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') close();
  }
</script>

<svelte:window
  on:click={handleWindowClick}
  on:keydown={handleKeydown}
  on:resize={() => open && positionPanel()}
  on:scroll|capture={() => open && positionPanel()} />

<div class="export-menu {extraClass}" class:is-open={open} bind:this={rootEl}>
  <button
    bind:this={triggerEl}
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
    {:else if material}
      <span class="ms" aria-hidden="true">download</span>
    {:else}
      <i class="bi bi-download"></i>
    {/if}
    <span>{t('Download')}</span>
    {#if material}
      <span class="ms export-menu__caret" aria-hidden="true">expand_more</span>
    {:else}
      <i class="bi bi-chevron-down export-menu__chevron" aria-hidden="true"></i>
    {/if}
  </button>

  {#if open}
    <div
      bind:this={panelEl}
      use:portal
      class="export-menu__panel"
      role="menu"
      dir={panelDir}
      style={panelStyle}
      on:click|stopPropagation>
      <button type="button" class="export-menu__item" role="menuitem" on:click|stopPropagation={() => choose('pdf')}>
        {#if material}
          <span class="ms export-menu__pdf" aria-hidden="true">picture_as_pdf</span>
        {:else}
          <i class="bi bi-file-earmark-pdf-fill"></i>
        {/if}
        <span>{t('PDF')}</span>
      </button>
      <button type="button" class="export-menu__item" role="menuitem" on:click|stopPropagation={() => choose('excel')}>
        {#if material}
          <span class="ms export-menu__excel" aria-hidden="true">table_view</span>
        {:else}
          <i class="bi bi-file-earmark-excel-fill"></i>
        {/if}
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

  /* Mirrors ActionButton's secondary variant so the trigger sits flush with
     neighbouring toolbar buttons. */
  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: var(--ab-h, 30px);
    min-height: var(--ab-h, 30px);
    padding: 0 10px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: var(--z-r-sm, 8px);
    background: var(--z-surface, #fff);
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.14s ease,
      border-color 0.14s ease,
      color 0.14s ease,
      box-shadow 0.14s ease;
  }

  .action-btn > i:first-child {
    font-size: 16px;
    color: var(--z-muted, #64748b);
  }

  .action-btn > .ms:first-child {
    font-size: 16px;
    color: var(--z-muted, #64748b);
  }

  .action-btn:hover:not(:disabled) {
    background: var(--z-surface-3, #f1f5f9);
    border-color: var(--z-border-strong, #dce6f8);
  }

  .action-btn:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  .action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .export-menu__chevron {
    font-size: 15px;
    color: var(--z-muted, #64748b);
    transition: transform 0.15s ease;
  }

  /* Reference expand_more stays upright — no open-state rotation. */
  .export-menu__caret.ms {
    font-size: 15px;
    color: var(--z-muted, #64748b);
  }

  .action-btn.is-open .export-menu__chevron {
    transform: rotate(180deg);
  }

  .export-menu__panel {
    position: fixed;
    z-index: 100000;
    width: 150px;
    padding: 4px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 11px;
    background: var(--z-surface, #fff);
    box-shadow: 0 18px 42px -14px rgba(11, 21, 48, 0.38);
  }

  .export-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--z-ink, #0b1530);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
  }

  .export-menu__item > i {
    font-size: 17px;
  }

  .export-menu__item > .ms {
    font-size: 17px;
  }

  .export-menu__item .export-menu__pdf {
    color: var(--z-danger, #b91c1c);
  }

  .export-menu__item .export-menu__excel {
    color: var(--z-ok, #15803d);
  }

  .export-menu__item:hover,
  .export-menu__item:focus-visible {
    background: var(--z-surface-2, #f8fafc);
    outline: none;
  }

  .export-menu__item .bi-file-earmark-pdf-fill {
    color: var(--z-danger, #b91c1c);
  }

  .export-menu__item .bi-file-earmark-excel-fill {
    color: var(--z-ok, #15803d);
  }
</style>
