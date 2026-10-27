<script>
  import { onMount } from 'svelte';
  import ActionButton from './ActionButton.svelte';

  export let actions = [];
  /**
   * Fold every action into the kebab menu. The reference journal row shows one
   * `more_vert` button (print lives inside the menu), not a glyph per action.
   */
  export let foldAll = false;
  /** Draw the row glyph with Material Symbols, the reference row's icon set. */
  export let material = false;
  export let menuTitle = '';
  let menuOpen = false;
  let root;
  let menuEl;
  let menuStyle = '';
  let menuDir = 'ltr';
  const menuOpenEvent = 'table-actions:menu-open';

  /* Menu glyphs the reference journal row uses, keyed by the bi icon a page passes. */
  /** @type {Record<string, string>} */
  const MATERIAL_MENU_ICONS = {
    'bi-eye': 'visibility',
    'bi-box-arrow-up-right': 'open_in_new',
    'bi-cart': 'visibility',
    'bi-box2': 'visibility',
    'bi-truck': 'visibility',
    'bi-currency-exchange': 'currency_exchange',
    'bi-pencil': 'edit',
    'bi-trash': 'delete',
    'bi-printer': 'print',
    'bi-journal-text': 'menu_book',
    'bi-archive': 'archive',
    'bi-box-arrow-in-up': 'unarchive',
  };
  /** @param {string} icon */
  const materialMenuIcon = (icon) => MATERIAL_MENU_ICONS[icon] || '';

  const isDestructive = (action) => action.tone === 'delete' || action.tone === 'danger';

  $: visibleActions = actions.filter((action) => action.visible !== false);
  /*
   * Journal.dc.html always closes a row menu with the destructive entry,
   * separated by a hairline (نمایش · ویرایش · تکرار · چاپ · ابطال), so keep the
   * caller's order for everything else and sink the destructive item last.
   */
  $: orderedActions = [
    ...visibleActions.filter((action) => !isDestructive(action)),
    ...visibleActions.filter(isDestructive),
  ];
  $: directActions = foldAll ? [] : orderedActions.filter((action) => action.icon === 'bi-printer');
  $: menuActions = foldAll ? orderedActions : orderedActions.filter((action) => action.icon !== 'bi-printer');

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function runAction(action) {
    menuOpen = false;
    action.onClick?.();
  }

  function toggleMenu(event) {
    if (menuOpen) {
      menuOpen = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = material ? 176 : 148;
    const estimatedHeight = Math.min(menuActions.length * 29 + (menuTitle ? 38 : 10), 260);
    menuDir = getComputedStyle(event.currentTarget).direction;
    const isRtl = menuDir === 'rtl';
    const desiredLeft = isRtl ? rect.left : rect.right - menuWidth;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, desiredLeft));
    const openUp = window.innerHeight - rect.bottom < estimatedHeight + 12;
    menuStyle = openUp
      ? `left:${left}px;bottom:${window.innerHeight - rect.top + 2}px;top:auto;`
      : `left:${left}px;top:${rect.top + 30}px;bottom:auto;`;
    document.dispatchEvent(new CustomEvent(menuOpenEvent, { detail: { root } }));
    menuOpen = true;
  }

  onMount(() => {
    const closeOutside = (event) => {
      if (!menuOpen) return;
      if (root?.contains(event.target) || menuEl?.contains(event.target)) return;
      menuOpen = false;
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') menuOpen = false;
    };
    const closeOtherMenus = (event) => {
      if (event.detail?.root !== root) menuOpen = false;
    };
    const closeOnScroll = () => {
      if (menuOpen) menuOpen = false;
    };
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener(menuOpenEvent, closeOtherMenus);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener(menuOpenEvent, closeOtherMenus);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  });
</script>

<div class="table-actions" class:table-actions--material={material} bind:this={root}>
  {#each directActions as action}
    <ActionButton
      variant="icon"
      tone={action.tone || 'muted'}
      icon={action.icon}
      label=""
      title={action.title || action.label}
      disabled={action.disabled}
      extraClass={`${action.class || ''} table-print-action`}
      on:click={() => action.onClick?.()} />
  {/each}

  {#if menuActions.length > 0}
    <div class="action-menu-wrap">
      <button type="button" class="action-menu-trigger" class:is-open={menuOpen} class:is-material={material}
        aria-label="Actions" aria-haspopup="menu" aria-expanded={menuOpen}
        on:click|stopPropagation={toggleMenu}>
        {#if material}
          <span class="ms" aria-hidden="true">more_vert</span>
        {:else}
          <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
        {/if}
      </button>
      {#if menuOpen}
        <div
          bind:this={menuEl}
          use:portal
          class="action-menu"
          class:is-material={material}
          role="menu"
          aria-label={menuTitle || undefined}
          dir={menuDir}
          style={menuStyle}
          on:click|stopPropagation>
          {#if menuTitle}
            <div class="action-menu__heading">{menuTitle}</div>
          {/if}
          {#each menuActions as action}
            <button type="button" role="menuitem"
              class:danger={action.tone === 'delete' || action.tone === 'danger'}
              class:view={action.tone === 'view'}
              disabled={action.disabled} on:click={() => runAction(action)}>
              {#if material && materialMenuIcon(action.icon)}
                <span class="ms" aria-hidden="true">{materialMenuIcon(action.icon)}</span>
              {:else}
                <i class="bi {action.icon}" aria-hidden="true"></i>
              {/if}
              <span>{action.label || action.title}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .table-actions {
    /* Dense row actions: shrink the shared ActionButton so the row keeps the
       reference table height instead of being pushed apart. */
    --ab-h: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    flex-wrap: nowrap;
  }

  .table-actions :global(.table-print-action),
  .table-actions :global(.table-print-action:hover),
  .table-actions :global(.table-print-action:focus) {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }

  .action-menu-wrap {
    position: relative;
    display: inline-flex;
  }

  .action-menu-trigger {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--z-muted, #64748b);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .action-menu-trigger:hover,
  .action-menu-trigger.is-open {
    background: var(--z-surface-3, #f1f5f9);
    color: var(--z-ink, #0b1530);
  }

  .action-menu-trigger:focus-visible {
    outline: 0;
    box-shadow: var(--z-ring, 0 0 0 3px rgba(47, 111, 237, 0.14));
  }

  /* Reference kebab keeps its muted glyph on hover; only the surface lifts. */
  .action-menu-trigger.is-material:hover {
    color: var(--z-muted, #64748b);
  }

  .action-menu-trigger.is-material.is-open:hover {
    color: var(--z-link, #2f6fed);
  }

  /* Reference journal row: a 28px square, 18px more_vert glyph. */
  .action-menu-trigger.is-material {
    width: 28px;
    height: 28px;
  }

  .action-menu-trigger.is-material .ms {
    font-size: 18px;
  }

  /* Reference open state: primary-soft chip on a strong border. */
  .action-menu-trigger.is-material.is-open {
    background: var(--z-brand-soft, #e3ecff);
    border-color: var(--z-border-strong, #dce6f8);
    color: var(--z-link, #2f6fed);
  }

  .action-menu {
    position: fixed;
    z-index: 100000;
    min-width: 9.5rem;
    max-width: 14rem;
    width: max-content;
    max-height: 260px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--z-border, #e1e7f0);
    border-radius: 11px;
    background: var(--z-surface, #fff);
    box-shadow: 0 18px 42px -14px rgba(11, 21, 48, 0.38);
  }

  .action-menu button {
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
    font-size: var(--z-fs-base, 12px);
    font-weight: 600;
    text-align: start;
    white-space: nowrap;
    cursor: pointer;
  }

  .action-menu button i,
  .action-menu button .ms {
    width: 16px;
    font-size: 16px;
    line-height: 1;
    text-align: center;
    color: var(--z-muted, #64748b);
  }

  .action-menu button:hover {
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-link, #2f6fed);
  }

  .action-menu button.danger {
    color: var(--z-debit, #dc2626);
  }

  .action-menu button.danger i {
    color: var(--z-debit, #dc2626);
  }

  .action-menu button.danger:hover {
    background: var(--z-debit-soft, #fdecec);
    color: var(--z-debit, #dc2626);
  }

  .action-menu button:disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .action-menu.is-material {
    width: 176px;
    box-shadow:
      0 18px 42px -14px rgba(11, 21, 48, 0.38),
      0 2px 6px -2px rgba(11, 21, 48, 0.08);
    text-align: start;
  }

  .action-menu.is-material .action-menu__heading {
    margin-bottom: 2px;
    padding: 4px 8px 6px;
    overflow: hidden;
    border-bottom: 1px solid var(--z-border-soft, #eef2f7);
    color: var(--z-ink, #0b1530);
    font-size: 11px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .action-menu.is-material button {
    height: 28px;
    font-size: 11.5px;
  }

  .action-menu.is-material button.view .ms {
    color: var(--z-link, #2f6fed);
  }

  .action-menu.is-material button:hover {
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-ink, #0b1530);
  }

  .action-menu.is-material button.danger .ms {
    color: var(--z-danger, #b91c1c);
  }

  .action-menu.is-material button.danger {
    margin-top: 4px;
    box-shadow: 0 -4px 0 -3px var(--z-border-soft, #eef2f7);
    color: var(--z-danger, #b91c1c);
  }

  .action-menu.is-material button.danger:hover {
    background: var(--z-surface-2, #f8fafc);
    color: var(--z-danger, #b91c1c);
  }
</style>
