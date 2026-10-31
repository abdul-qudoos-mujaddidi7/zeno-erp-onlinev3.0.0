<script>
  import AsyncPage from "../components/AsyncPage.svelte";
  import { onMount } from 'svelte';
  import { link, location } from 'svelte-spa-router';

  import { t, lang, translate_org_type,settings_all } from '../i18n/i18n';
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;


  export let page = 'main';


  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

  const loadDepartments = () => import('./hospital/Departments.svelte');
  const loadPrintLabel = () => import('./products/PrintLabel.svelte');
  const loadCurrencies = () => import('./settings/Currencies.svelte');
  const loadMainSettings = () => import('./settings/MainSettings.svelte');
  const loadUnits = () => import('./products/Units.svelte');
  const loadUnitCategories = () => import('./products/UnitCategories.svelte');
  const loadCategories = () => import('./products/Categories.svelte');
  const loadAccountGroups = () => import('./accounts/AccountGroups.svelte');
  const loadBrands = () => import('./settings/Brands.svelte');
  const loadGenerics = () => import('./settings/Generics.svelte');
  const loadStockTransfers = () => import('./StockTransfers.svelte');
  const loadUserRoles = () => import('./users/UserRoles.svelte');
  const loadUsersIndex = () => import('./users/UsersIndex.svelte');





</script>

{#if page === 'main'}
  <AsyncPage loader={loadMainSettings} />
{:else}
<div class="system-settings-page">
<div class="system-settings-shell">
  <aside class="system-settings-menu">
  <div class="list-group system-settings-list">
      <a use:link
        href="/dashboard/settings/departments" class="list-group-item list-group-item-action p-2" class:active={page === 'departments'} on:click={() => page = 'departments'}><i class="bi bi-diagram-3"></i>{t('Departments')}</a>
      <a use:link
        href="/dashboard/settings/labels" class="list-group-item list-group-item-action p-2" class:active={page === 'labels'} on:click={() => page = 'labels'}><i class="bi bi-upc-scan"></i>{t('Print Labels')}</a>
      <a use:link
        href="/dashboard/settings/transfers" class="list-group-item list-group-item-action p-2" class:active={page === 'transfers'} on:click={() => page = 'transfers'}><i class="bi bi-arrow-left-right"></i>{t('Stock Transfers')}</a>
      <a use:link
        href="/dashboard/settings/currencies" class="list-group-item list-group-item-action p-2" class:active={page === 'currencies'} on:click={() => page = 'currencies'}><i class="bi bi-currency-exchange"></i>{t('Currencies')}</a>
      <a use:link
        href="/dashboard/settings/units" class="list-group-item list-group-item-action p-2" class:active={page === 'units'} on:click={() => page = 'units'}><i class="bi bi-rulers"></i>{t('Units')}</a>
      <a use:link
        href="/dashboard/settings/unit-categories" class="list-group-item list-group-item-action p-2" class:active={page === 'unit-categories'} on:click={() => page = 'unit-categories'}><i class="bi bi-diagram-2"></i>{t('Unit Categories')}</a>
      <a use:link
        href="/dashboard/settings/categories" class="list-group-item list-group-item-action p-2" class:active={page === 'categories'} on:click={() => page = 'categories'}><i class="bi bi-tags"></i>{t('Categories')}</a>
     
     {#if enable_account_groups}
     
     <a use:link
        href="/dashboard/settings/groups" class="list-group-item list-group-item-action p-2" class:active={page === 'groups'} on:click={() => page = 'groups'}><i class="bi bi-folder2-open"></i>{t('Account Groups')}</a>
        {/if}
      <a use:link
        href="/dashboard/settings/brands" class="list-group-item list-group-item-action p-2" class:active={page === 'brands'} on:click={() => page = 'brands'}><i class="bi bi-award"></i>{t('Brands')}</a>
      <a use:link
        href="/dashboard/settings/generics" class="list-group-item list-group-item-action p-2" class:active={page === 'generics'} on:click={() => page = 'generics'}><i class="bi bi-capsule"></i>{t('Generics')}</a>
      <a use:link
        href="/dashboard/settings/roles" class="list-group-item list-group-item-action p-2" class:active={page === 'roles'} on:click={() => page = 'roles'}><i class="bi bi-person-gear"></i>{t('User Roles')}</a>
      <a use:link
        href="/dashboard/settings/users" class="list-group-item list-group-item-action p-2" class:active={page === 'users'} on:click={() => page = 'users'}><i class="bi bi-people"></i>{t('Users')}</a>
    </div>
  </aside>
  <section class="system-settings-content">

{#if page === 'departments'}
  <AsyncPage loader={loadDepartments} />
{:else if page === 'labels'}
  <AsyncPage loader={loadPrintLabel} />
{:else if page === 'transfers'}
  <AsyncPage loader={loadStockTransfers} />
{:else if page === 'currencies'}
  <AsyncPage loader={loadCurrencies} />
{:else if page === 'units'}
  <AsyncPage loader={loadUnits} />
{:else if page === 'unit-categories'}
  <AsyncPage loader={loadUnitCategories} />
{:else if page === 'categories'}
  <AsyncPage loader={loadCategories} />
{:else if page === 'groups'}
  <AsyncPage loader={loadAccountGroups} />
{:else if page === 'brands'}
  <AsyncPage loader={loadBrands} />
{:else if page === 'generics'}
  <AsyncPage loader={loadGenerics} />
{:else if page === 'roles'}
  <AsyncPage loader={loadUserRoles} />
{:else if page === 'users'}
  <AsyncPage loader={loadUsersIndex} />
{/if}

  </section>
</div>
</div>
{/if}

<style>
  .system-settings-page {
    width: 100%;
    height: 100%;
    min-height: 0;
    --settings-bg: #ffffff;
    --settings-panel: #ffffff;
    --settings-border: #dfe5ed;
    --settings-text: #1f2a44;
    --settings-muted: #4d586c;
    --settings-primary: var(--erp-primary, #2f6fed);
    --settings-primary-soft: #f0f5ff;
    --settings-shadow: 0 4px 16px rgba(30, 48, 76, 0.1);
  }

  .system-settings-shell {
    display: grid;
    grid-template-columns: 195px minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .system-settings-menu {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--settings-border);
    border-radius: 10px;
    background-color: var(--settings-panel);
    box-shadow: var(--settings-shadow);
  }

  .system-settings-content {
    min-width: 0;
    min-height: 0;
  }

  .system-settings-menu {
    position: sticky;
    top: 1rem;
    align-self: stretch;
    height: 100%;
    min-height: 470px;
    padding: 7px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .system-settings-list {
    display: grid;
    gap: 2px;
    border: 0 !important;
    background: transparent;
  }

  .system-settings-list :global(.list-group-item) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    min-height: 43px;
    gap: 8px;
    padding: 6px 9px !important;
    border: 1px solid transparent;
    border-radius: 7px !important;
    background: transparent;
    color: var(--settings-muted);
    font-size: .82rem;
    font-weight: 650;
    text-align: start;
    transition: background .16s ease, color .16s ease, border-color .16s ease;
  }

  .system-settings-list :global(.list-group-item > i) {
    display: inline-grid;
    width: 24px;
    height: 24px;
    margin-inline-end: 0;
    place-items: center;
    color: #566176;
    font-size: 1rem;
  }

  .system-settings-list :global(.list-group-item:hover) {
    background: #f6f8fc;
    color: var(--settings-primary);
  }

  .system-settings-list :global(.list-group-item.active) {
    border-color: transparent;
    background: linear-gradient(90deg, #f0f5ff 0%, #eaf1ff 100%);
    color: var(--settings-primary);
    box-shadow: 0 2px 5px rgba(38, 50, 68, .08);
  }

  .system-settings-list :global(.list-group-item.active > i),
  .system-settings-list :global(.list-group-item:hover > i) { color: var(--settings-primary); }

  .system-settings-content {
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .system-settings-menu::-webkit-scrollbar,
  .system-settings-content::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .system-settings-content :global(.my-4:first-child) {
    margin-top: 0 !important;
  }

  .system-settings-content :global(.card) {
    overflow: hidden;
    border-color: var(--settings-border);
    border-radius: 10px;
    box-shadow: none !important;
  }

  .system-settings-content :global(.card-header) {
    padding: 14px 18px;
    border-bottom: 1px solid #e7ecf2;
    background: #f8fafc;
    color: #344155;
    font-size: .82rem;
    font-weight: 850;
  }

  .system-settings-content :global(.form-control),
  .system-settings-content :global(.form-select) {
    min-height: var(--control-height);
    border-color: #d7dee8;
    border-radius: 9px;
    background-color: #fff;
    color: #46536a;
    font-size: .8rem;
  }

  .system-settings-content :global(.form-control:focus),
  .system-settings-content :global(.form-select:focus) {
    border-color: #73a1f8;
    box-shadow: 0 0 0 3px rgba(47,111,237,.08);
  }

  .system-settings-content :global(.form-label) {
    margin-bottom: 7px;
    color: #46536a;
    font-size: .76rem;
    font-weight: 800;
  }

  .system-settings-content :global(.btn) {
    border-radius: 8px;
    font-size: .78rem;
    font-weight: 800;
  }

  .system-settings-content :global(.table) {
    margin-bottom: 0;
  }

  .system-settings-content :global(.table > thead > tr > th) {
    padding: 12px 8px;
    border-bottom: 1px solid #dfe5ed;
    background: #f8fafc;
    color: #64748b;
    font-size: .72rem;
    font-weight: 900;
    white-space: nowrap;
  }

  .system-settings-content :global(.table > tbody > tr > td) {
    padding: 13px 14px;
    border-color: #edf1f6;
    color: #46536a;
    font-size: .78rem;
    vertical-align: middle;
  }

  .system-settings-content :global(.table-hover > tbody > tr:hover > *) {
    --mdb-table-accent-bg: #f6f9ff;
  }

  .system-settings-content :global(.settings-index-table) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: .78rem;
  }

  .system-settings-content :global(.settings-index-table > thead > tr > th) {
    height: 3rem;
    padding: .625rem .5rem;
    border-bottom: 1px solid #dfe5ed;
    background: #fff;
    color: #66758a;
    font-size: .78125rem;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr:nth-child(odd)) {
    background: #fff;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr:nth-child(even)) {
    background: #f5f7fa;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr > td) {
    padding: .4rem .875rem;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: .75rem;
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

  .system-settings-content :global(.settings-index-table > tbody > tr > td:first-child) {
    color: #7b8ba1;
    font-weight: 650;
  }

  .system-settings-content :global(.settings-index-table .btn.btn-sm) {
    width: 2.125rem;
    min-width: 2.125rem;
    height: 2.125rem;
    min-height: 2.125rem;
    margin: 0 .1875rem !important;
    padding: 0;
    border-color: transparent;
    border-radius: .5rem;
    background: transparent;
    box-shadow: none;
  }

  .system-settings-content :global(.settings-index-table .btn.btn-sm:hover) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  /* Keep the Units table treatment consistent across System Settings only. */
  .system-settings-content :global(.data-table),
  .system-settings-content :global(.table:not(.settings-index-table)) {
    width: 100%;
    margin: 0;
    border-collapse: separate;
    border-spacing: 0;
    color: #46536a;
    font-size: .78rem;
  }

  .system-settings-content :global(.data-table > thead > tr > th),
  .system-settings-content :global(.table:not(.settings-index-table) > thead > tr > th) {
    height: 3rem;
    padding: .625rem .5rem;
    border-bottom: 1px solid #dfe5ed;
    background: #fff;
    color: #66758a;
    font-size: .78125rem;
    font-weight: 800;
    line-height: 1.25;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }

  .system-settings-content :global(.data-table > tbody > tr:nth-child(odd)),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr:nth-child(odd)) {
    background: #fff;
  }

  .system-settings-content :global(.data-table > tbody > tr:nth-child(even)),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr:nth-child(even)) {
    background: #f5f7fa;
  }

  .system-settings-content :global(.data-table > tbody > tr > td),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr > td) {
    padding: .4rem .875rem;
    border-bottom: 1px solid #e0e0e0;
    background: transparent;
    color: #46536a;
    font-size: .75rem;
    line-height: 1.5;
    text-align: center;
    vertical-align: middle;
  }

  .system-settings-content :global(.data-table > tbody > tr > td:first-child),
  .system-settings-content :global(.table:not(.settings-index-table) > tbody > tr > td:first-child) {
    color: #7b8ba1;
    font-weight: 650;
  }

  .system-settings-content :global(.data-table-wrap),
  .system-settings-content :global(.table-responsive) {
    scrollbar-width: thin;
    scrollbar-color: #b8c4d2 transparent;
  }

  .system-settings-content :global(.visible-table-actions .action-btn.icon),
  .system-settings-content :global(.visible-table-actions .action-btn.icon:hover:not(:disabled)),
  .system-settings-content :global(.table:not(.settings-index-table) .btn.btn-sm),
  .system-settings-content :global(.table:not(.settings-index-table) .btn.btn-sm:hover) {
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .system-settings-content :global(.badge) {
    padding: 6px 9px;
    border-radius: 999px;
    font-weight: 800;
  }

  .system-settings-content :global(.pagination .page-link) {
    border: 0;
    border-radius: 50% !important;
    color: #64748b;
  }

  .system-settings-content :global(.pagination .page-item.active .page-link) {
    background: #2f6fed;
    color: #fff;
  }

  :global(html.dark) .system-settings-page {
    --settings-bg: #070f1f;
    --settings-panel: #0b1426;
    --settings-border: rgba(148, 163, 184, 0.34);
    --settings-text: #e5edf9;
    --settings-muted: #8fa0ba;
    --settings-primary: #6f9cff;
    --settings-primary-soft: rgba(111, 156, 255, 0.14);
    --settings-shadow: none;
  }

  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item) {
    background: transparent;
    color: var(--settings-muted);
    border-color: transparent;
  }

  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item > i) {
    color: #64748b;
  }

  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item:hover) {
    background: rgba(111, 156, 255, 0.1);
    color: #dbe7ff;
  }

  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item:hover > i),
  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item.active > i) {
    color: var(--settings-primary);
  }

  :global(html.dark) .system-settings-page .system-settings-list :global(.list-group-item.active) {
    background: linear-gradient(90deg, rgba(111, 156, 255, 0.18), rgba(111, 156, 255, 0.1));
    color: var(--settings-primary);
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.index-panel),
  :global(html.dark) .system-settings-page .system-settings-content :global(.card) {
    border-color: var(--settings-border);
    background: var(--settings-panel);
    color: var(--settings-text);
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.index-toolbar),
  :global(html.dark) .system-settings-page .system-settings-content :global(.index-footer) {
    border-color: var(--settings-border);
    background: var(--settings-panel);
    color: var(--settings-text);
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.index-content) {
    background: var(--settings-panel);
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table),
  :global(html.dark) .system-settings-page .system-settings-content :global(.settings-index-table),
  :global(html.dark) .system-settings-page .system-settings-content :global(.data-table) {
    --mdb-table-bg: transparent;
    --mdb-table-color: var(--settings-text);
    --mdb-table-border-color: rgba(148, 163, 184, 0.24);
    --mdb-table-hover-bg: rgba(111, 156, 255, 0.08);
    --mdb-table-hover-color: #e5edf9;
    color: var(--settings-text);
    background: transparent;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table-light),
  :global(html.dark) .system-settings-page .system-settings-content :global(.table > thead),
  :global(html.dark) .system-settings-page .system-settings-content :global(.settings-index-table > thead),
  :global(html.dark) .system-settings-page .system-settings-content :global(.data-table > thead) {
    --mdb-table-bg: #111c31;
    --mdb-table-color: #b9c7dd;
    background: #111c31;
    color: #b9c7dd;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table > thead > tr > th),
  :global(html.dark) .system-settings-page .system-settings-content :global(.settings-index-table > thead > tr > th),
  :global(html.dark) .system-settings-page .system-settings-content :global(.data-table > thead > tr > th) {
    border-color: rgba(148, 163, 184, 0.28);
    background: #111c31;
    color: #b9c7dd;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table > tbody > tr),
  :global(html.dark) .system-settings-page .system-settings-content :global(.settings-index-table > tbody > tr),
  :global(html.dark) .system-settings-page .system-settings-content :global(.data-table > tbody > tr) {
    background: transparent;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table > tbody > tr > td),
  :global(html.dark) .system-settings-page .system-settings-content :global(.settings-index-table > tbody > tr > td),
  :global(html.dark) .system-settings-page .system-settings-content :global(.data-table > tbody > tr > td) {
    border-color: rgba(148, 163, 184, 0.24);
    background: transparent;
    color: var(--settings-text);
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.table-hover > tbody > tr:hover > *) {
    --mdb-table-accent-bg: rgba(111, 156, 255, 0.08);
    background: rgba(111, 156, 255, 0.08);
    color: #e5edf9;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.text-muted),
  :global(html.dark) .system-settings-page .system-settings-content :global(.cell-muted) {
    color: #8fa0ba !important;
  }

  :global(html.dark) .system-settings-page .system-settings-content :global(.btn-outline-secondary),
  :global(html.dark) .system-settings-page .system-settings-content :global(.btn-outline-primary) {
    border-color: rgba(111, 156, 255, 0.35);
    color: #8fb3ff;
  }

  .system-settings-page :global(.qa-modal__field input),
  .system-settings-page :global(.qa-modal__field textarea),
  .system-settings-page :global(.qa-modal__field select),
  .system-settings-page :global(.qa-modal__subunit input),
  .system-settings-page :global(.qa-modal__subunit select) {
    width: 100%;
    min-height: 2.5rem;
    padding: 0.55rem 0.75rem;
    border: 1px solid #ccd8e7;
    border-radius: 0.5625rem;
    background: #ffffff;
    color: #172033;
    font: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .system-settings-page :global(.qa-modal__field textarea) {
    min-height: 7.75rem;
    resize: vertical;
  }

  .system-settings-page :global(.qa-modal__field input:focus),
  .system-settings-page :global(.qa-modal__field textarea:focus),
  .system-settings-page :global(.qa-modal__field select:focus),
  .system-settings-page :global(.qa-modal__subunit input:focus),
  .system-settings-page :global(.qa-modal__subunit select:focus) {
    border-color: #73a1f8;
    box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
  }

  :global(html.dark) .system-settings-page :global(.qa-modal__panel) {
    border-color: rgba(148, 163, 184, 0.34);
    background: #0b1426;
    color: #e5edf9;
  }

  :global(html.dark) .system-settings-page :global(.qa-modal__field span),
  :global(html.dark) .system-settings-page :global(.qa-modal__switch),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit-label),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit-eq) {
    color: #8fa0ba;
  }

  :global(html.dark) .system-settings-page :global(.qa-modal__close) {
    border-color: rgba(148, 163, 184, 0.34);
    background: #111c31;
    color: #dbe7ff;
  }

  :global(html.dark) .system-settings-page :global(.qa-modal__field input),
  :global(html.dark) .system-settings-page :global(.qa-modal__field textarea),
  :global(html.dark) .system-settings-page :global(.qa-modal__field select),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit input),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit select) {
    border-color: rgba(148, 163, 184, 0.38);
    background: #111c31;
    color: #e5edf9;
  }

  :global(html.dark) .system-settings-page :global(.qa-modal__field input:focus),
  :global(html.dark) .system-settings-page :global(.qa-modal__field textarea:focus),
  :global(html.dark) .system-settings-page :global(.qa-modal__field select:focus),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit input:focus),
  :global(html.dark) .system-settings-page :global(.qa-modal__subunit select:focus) {
    border-color: #6f9cff;
    box-shadow: 0 0 0 3px rgba(111, 156, 255, 0.18);
  }

  @media (max-width: 991px) {
    .system-settings-shell {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0.75rem;
    }
    .system-settings-menu {
      min-height: auto;
      padding: 0.5rem;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .system-settings-list {
      display: flex;
      width: max-content;
      min-width: 100%;
      overflow: visible;
    }
    .system-settings-list :global(.list-group-item) { min-width: 175px; }
  }

  @media (max-width: 575px) {
    .system-settings-content { padding: 8px 4px; }
    .system-settings-list :global(.list-group-item) {
      min-width: 145px;
      min-height: 44px;
    }
  }
</style>
