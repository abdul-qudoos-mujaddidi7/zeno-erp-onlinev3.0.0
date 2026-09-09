<script>
  import { onMount } from 'svelte';
  import ActionButton from './ActionButton.svelte';

  export let actions = [];
  let menuOpen = false;
  let root;
  let menuEl;
  let menuStyle = '';
  const menuOpenEvent = 'table-actions:menu-open';

  $: visibleActions = actions.filter((action) => action.visible !== false);
  $: printActions = visibleActions.filter((action) => action.icon === 'bi-printer');
  $: menuActions = visibleActions.filter((action) => action.icon !== 'bi-printer');

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
    const menuWidth = 148;
    const estimatedHeight = Math.min(menuActions.length * 39 + 10, 260);
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const openUp = window.innerHeight - rect.bottom < estimatedHeight + 12;
    menuStyle = openUp
      ? `left:${left}px;bottom:${window.innerHeight - rect.top + 5}px;top:auto;`
      : `left:${left}px;top:${rect.bottom + 5}px;bottom:auto;`;
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

<div class="table-actions" bind:this={root}>
  {#each printActions as action}
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
      <button type="button" class="action-menu-trigger" class:is-open={menuOpen}
        aria-label="Actions" aria-haspopup="menu" aria-expanded={menuOpen}
        on:click|stopPropagation={toggleMenu}>
        <i class="bi bi-three-dots-vertical" aria-hidden="true"></i>
      </button>
      {#if menuOpen}
        <div
          bind:this={menuEl}
          use:portal
          class="action-menu"
          role="menu"
          style={menuStyle}
          on:click|stopPropagation>
          {#each menuActions as action}
            <button type="button" role="menuitem" class:danger={action.tone === 'delete' || action.tone === 'danger'}
              disabled={action.disabled} on:click={() => runAction(action)}>
              <i class="bi {action.icon}" aria-hidden="true"></i>
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .table-actions :global(.action-btn) {
    width: 34px;
    min-height: 34px;
  }
  .table-actions :global(.table-print-action),
  .table-actions :global(.table-print-action:hover),
  .table-actions :global(.table-print-action:focus) {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
  }
  .action-menu-wrap{position:relative;display:inline-flex}
  .action-menu-trigger{display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid transparent;border-radius:9px;background:transparent;color:#64748b;font-size:1rem}
  .action-menu-trigger:hover,.action-menu-trigger.is-open{border-color:#dbe4f0;background:#f1f5f9;color:#1e3a5f}
  :global(html.dark) .action-menu-trigger{color:var(--erp-muted,#94a3b8)}
  :global(html.dark) .action-menu-trigger:hover,
  :global(html.dark) .action-menu-trigger.is-open{border-color:var(--erp-border,#334762);background:#1e293b;color:var(--erp-text,#e5edf8)}
  .action-menu{position:fixed;z-index:100000;min-width:9.25rem;max-width:14rem;width:max-content;max-height:260px;overflow-y:auto;padding:3px;border:1px solid #dfe7f1;border-radius:8px;background:var(--mdb-body-bg,#fff);box-shadow:0 10px 24px rgba(15,23,42,.18)}
  :global(html.dark) .action-menu{border-color:var(--erp-border,#334762);background:var(--erp-surface,#111827);box-shadow:0 16px 32px rgba(0,0,0,.4)}
  .action-menu button{display:flex;align-items:center;gap:5px;width:100%;padding:6px 8px;border:0;border-radius:5px;background:transparent;color:var(--mdb-body-color,#334155);font-size:.75rem;font-weight:650;text-align:start;white-space:nowrap}
  :global(html.dark) .action-menu button{color:var(--erp-text,#e5edf8)}
  .action-menu button:hover{background:#f1f5f9;color:#1d4ed8}
  :global(html.dark) .action-menu button:hover{background:rgba(96,165,250,.12);color:#93c5fd}
  .action-menu button.danger{color:#dc2626}.action-menu button.danger:hover{background:#fff1f2}
  :global(html.dark) .action-menu button.danger{color:#fca5a5}
  :global(html.dark) .action-menu button.danger:hover{background:rgba(248,113,113,.12)}
  .action-menu button:disabled{opacity:.45;pointer-events:none}.action-menu button i{width:16px;text-align:center}
</style>
