<script>
  import { onMount, onDestroy } from 'svelte';
  import { link, location } from 'svelte-spa-router';
  import { t, lang, settings_all, translate_org_type } from '../i18n/i18n';
  
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import {auth} from "../auth/authStore"
import { settingsApi } from '../../api/settingsApi.js';
  $: permissions = $auth.permissions;
  
  export let sidebarOpen = false;

  $: console.log('settings updated:', $settings_all);
  $: enable_master_exchanges = $settings_all.find((s) => s.key === 'enable_master_exchanges')?.value == 1;
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  let shiftPressed = false;
  let ctrlPressed = false;
  $: loc = $location ? $location.replace(/\/+$/g, '') : '';

  function handleKeyDown(e) {
    if (localStorage.getItem('role_id') == '5') return;
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  });

  onMount(async () => {
    enable_master_exchanges =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_master_exchanges' }))?.data?.[0]
      )?.value == 1;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  });
</script>

<nav id="erp-sidebar" class:show={sidebarOpen}>
  <div class="sidebar-shell">
    <div class="sidebar-brand">
      <div class="brand-mark">
        <img src="/img/logo.png" alt="ZENO ERP" />
      </div>
      <div class="brand-copy">
        <strong>ZENO ERP</strong>
        <small>{t('Business Suite')}</small>
      </div>
          {#if permissions?.some(p => p.code === "POS" && p.view)}
            <a
              use:link
              href="/pos"
              class="btn btn-sm btn-primary fw-bold px-2 d-none d-lg-inline-flex align-items-center pos-shortcut {_translate_org_type ==
              'exchange'
                ? 'd-none d-lg-none'
                : ''}"
              class:active={$location === '/pos'}>
              POS
            </a>
          {/if}
          <button
            class="btn btn-sm btn-outline-secondary d-lg-none"
            on:click={() => (sidebarOpen = false)}
            aria-label="Close sidebar"
            title="Close sidebar">
            <i class="bi bi-x-lg"></i>
          </button>
    </div>
    <div class="list-group list-group-flush sidebar-menu mt-2">
      <a
        use:link
        href="/dashboard"
        class="list-group-item list-group-item-action"
        class:active={$location === '/dashboard'}>
        <i class="bi bi-speedometer2 me-2"></i>
        {t('Dashboard')}
      </a>
      <a
        use:link
        href="/dashboard/2"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/2'}>
        <i class="bi bi-grid-fill me-2"></i>
        {t('Dashboard')} 2
      </a>
      <a
        use:link
        href="/dashboard/patients/list"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'hospital') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/patients/') || loc.startsWith('/dashboard/patient/')}>
        <i class="bi bi-people me-2"></i>
        {t('Patients')}
      </a>
      <a
        use:link
        href="/dashboard/appointments/list"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          (localStorage.getItem('org_type') == 'hospital'||localStorage.getItem('org_type') == 'barbershop')) ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/appointments')||loc.startsWith('/dashboard/appointment')}>
        <i class="bi bi-calendar-check me-2"></i>
        {t('Appointments')}
      </a>
      <a
        use:link
        href="/dashboard/treasury"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/treasury'}>
        <i class="bi bi-cash-coin me-2"></i>
        {t('Treasury')}
      </a>
      <a
        use:link
        href="/dashboard/account-types"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/account-types'}>
        <i class="bi bi-people me-2"></i>
        {t('Account Types')}
      </a>
      {#if permissions?.some(p => p.code === "Accounts" && p.view)}
        <a
          use:link
          href="/dashboard/accounts/list"
          class="list-group-item list-group-item-action {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={loc.startsWith('/dashboard/accounts/') || loc.startsWith('/dashboard/account/')}>
          <i class="bi bi-people me-2"></i>
          {t('Accounts')}
        </a>
      {/if}
      <a
        use:link
        href="/dashboard/patient-types"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/patient-types'}>
        <i class="bi bi-people me-2"></i>
        {t('Patient Types')}
      </a>


      {#if permissions?.some(p => p.code === "Journals" && p.view)}
        <a
          use:link
          href="/dashboard/journals/list"
          class="list-group-item list-group-item-action  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={loc.startsWith('/dashboard/journals')}>
          <i class="bi bi-journal-text me-2"></i>
          {t('Journals')}
        </a>
      {/if}
      <a
        use:link
        href="/dashboard/work-centers"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'manufacturing') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'} "
        class:active={loc.startsWith('/dashboard/work-centers') || $location === '/dashboard/work-centers'}>
        <i class="bi bi-person-workspace me-2"></i>
        {t('Work Centers')}
      </a>
      <a use:link
        href="/dashboard/boms"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') && localStorage.getItem('org_type') == 'manufacturing') || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
        class:active={loc.startsWith('/dashboard/boms') || $location === '/dashboard/boms'}>
        <i class="bi bi-receipt me-2"></i>
        {t('Bill of Materials')}
      </a>
      <a use:link href="/dashboard/productions"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'manufacturing') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/productions') || $location === '/dashboard/productions'}>
        <i class="bi bi-gear-wide-connected me-2"></i>
        {t('Productions')}
      </a>

      {#if permissions?.some(p => p.code === "Exchange" && p.view)}
        <a
          use:link
          href="/dashboard/exchanges/list"
          class="list-group-item list-group-item-action {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={loc.startsWith('/dashboard/exchanges')}>
          <i class="bi bi-cash-coin me-2"></i>
          {t('Exchanges')}
        </a>
      {/if}

      
      {#if permissions?.some(p => p.code === "Sales" && p.view)}
        <a
          use:link
          href="/dashboard/sales"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') != 'exchange' &&
            localStorage.getItem('org_type') != 'apartment') ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={$location === '/dashboard/sales'}>
          <i class="bi bi-cart-check me-2"></i>
          {t('Sales')}
        </a>
      {/if}


      <a
        use:link
        href="/dashboard/labtests"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'hospital') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/labtests')||loc.startsWith('/dashboard/labtests')}>
        <i class="bi bi-capsule me-2"></i>
        {t('Lab Tests')}
      </a>

      <a
        use:link
        href="/dashboard/prescriptions"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'hospital') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
        class:active={$location === '/dashboard/prescriptions'}>
        <i class="bi bi-prescription me-2"></i>
        {t('Prescriptions')}
      </a>

      {#if permissions?.some(p => p.code === "Purchases" && p.view)}
        <a
          use:link
          href="/dashboard/purchases"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') != 'exchange') ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={$location === '/dashboard/purchases'}>
          <i class="bi bi-bag-plus me-2"></i>
          {t('Purchases')}
        </a>
      {/if}
      <!-- 
    <a
      use:link
      href="/dashboard/wastes"
      class="list-group-item list-group-item-action"
      class:active={$location === "/dashboard/wastes"}
    >
      <i class="bi bi-trash me-2"></i> {t('Wastes')}
    </a>

    <a
      use:link
      href="/dashboard/stock-transfers"
      class="list-group-item list-group-item-action"
      class:active={$location === "/dashboard/stock-transfers"}
    >
      <i class="bi bi-box2 me-2"></i> {t('Stock Transfers')}
    </a> -->



        {#if permissions?.some(p => p.code === "Products" && p.view)}
          <a use:link href="/dashboard/stock"
            class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
              localStorage.getItem('org_type') != 'exchange') ||
            (shiftPressed && ctrlPressed)
              ? ''
              : 'd-none'}  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
            class:active={$location === '/dashboard/stock'}>
            <i class="bi bi-box-seam me-2"></i>
                {t('Products')}
          </a>
        {/if}
        {#if permissions?.some(p => p.code === "Services" && p.view)}
          {#if enable_services || (shiftPressed && ctrlPressed)}
            <a use:link href="/dashboard/services"
              class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
                localStorage.getItem('org_type') != 'exchange')
                ? ''
                : 'd-none'}"
              class:active={$location === '/dashboard/services'}>
              <i class="bi bi-person-vcard me-2"></i>
                  {t('Services')}
            </a>
          {/if}
        {/if}
        <a use:link href="/dashboard/transfers/list"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') == 'exchange') ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}"
          class:active={loc.startsWith('/dashboard/transfers') || $location === '/dashboard/transfers/list'}>
          <i class="bi bi-arrow-left-right me-2"></i>
          {t('Transfers')}
        </a>
        <a use:link href="/dashboard/master-exchanges/list"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') == 'exchange' &&
            enable_master_exchanges) ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}"
          class:active={loc.startsWith('/dashboard/master-exchanges') ||
            $location === '/dashboard/master-exchanges/list'}>
          <i class="bi bi-safe me-2"></i>
          {t('Master Exchanges')}
        </a>
        <a use:link href="/dashboard/apartments/list"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') == 'apartment') ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}"
          class:active={loc.startsWith('/dashboard/apartments') ||
            $location === '/dashboard/apartments/list'}>
          <i class="bi bi-building-fill me-2"></i>
          {t('Apartments')}
        </a>
        <a use:link href="/dashboard/stock-transactions"
          class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
          class:active={$location === '/dashboard/stock-transactions'}>
          <i class="bi bi-box-seam me-2"></i>
          {t('Stock Transactions')}
        </a>
        <a use:link href="/dashboard/reports"
          class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
          class:active={$location === '/dashboard/reports'}>
          <i class="bi bi-file-bar-graph me-2"></i>
          {t('Reports')}
        </a>
        {#if permissions?.some(p => p.code === "Settings" && p.view)}
          <a use:link href="/dashboard/settings/main"
            class="list-group-item list-group-item-action"
            class:active={loc.startsWith('/dashboard/settings')}>
            <i class="bi bi-gear me-2"></i>
            {t('Settings')}
          </a>
        {/if}
        <a use:link href="/dashboard/users"
          class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
          class:active={$location === '/dashboard/users'}>
          <i class="bi bi-person-badge me-2"></i>
          {t('Users')}
        </a>
    </div>
    <div class="sidebar-help-card">
      <div>
        <strong>{t('Need help?')}</strong>
        <small>{t('Support and setup guidance')}</small>
      </div>
      <i class="bi bi-headset"></i>
    </div>
  </div>
</nav>

<style>

  #erp-sidebar {
    position: fixed;
    top: 0;
    width: 280px;
    height: 100vh;
    z-index: 1050;
    transition:
      transform 0.3s ease,
      box-shadow 0.3s ease;
    overflow: hidden;
    border-inline-start: 0;
    background: #fff;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  }

  .sidebar-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem 0.9rem;
  }

  .sidebar-brand {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    border: 1px solid #eef2f7;
    border-radius: 0.9rem;
    background: #fff;
    box-shadow: none;
  }

  .brand-mark {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 0.7rem;
    background: #eff6ff;
  }

  .brand-mark img {
    max-width: 34px;
    max-height: 34px;
  }

  .brand-copy {
    min-width: 0;
    flex: 1;
  }

  .brand-copy strong,
  .brand-copy small {
    display: block;
  }

  .brand-copy strong {
    color: #0f172a;
    font-size: 1rem;
    font-weight: 900;
    letter-spacing: 0.02em;
  }

  .brand-copy small {
    color: #64748b;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .pos-shortcut {
    border-radius: 0.85rem;
    box-shadow: none;
  }

  .sidebar-menu {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 0.15rem;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  .sidebar-menu::-webkit-scrollbar {
    width: 6px;
  }

  .sidebar-menu::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #cbd5e1;
  }

  .sidebar-menu :global(.list-group-item) {
    position: relative;
    display: flex;
    gap: 0.72rem;
    align-items: center;
    margin: 0.18rem 0;
    padding: 0.68rem 0.85rem;
    border: 0;
    border-radius: 0.75rem !important;
    background: transparent;
    color: #475569;
    font-size: 0.9rem;
    font-weight: 750;
    transition:
      background 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .sidebar-menu :global(.list-group-item::before) {
    content: '';
    position: absolute;
    inset-block: 0.58rem;
    inset-inline-start: 0.18rem;
    width: 3px;
    border-radius: 999px;
    background: transparent;
    transition: background 0.2s ease;
  }

  .sidebar-menu :global(.list-group-item i) {
    width: 22px;
    color: #94a3b8;
    font-size: 1rem;
    text-align: center;
    transition: color 0.2s ease;
  }

  .sidebar-menu :global(.list-group-item:hover) {
    transform: translateX(-1px);
    background: #f6f9ff;
    color: #0f6efd;
  }

  :global(html[dir='ltr']) .sidebar-menu :global(.list-group-item:hover) {
    transform: translateX(1px);
  }

  .sidebar-menu :global(.list-group-item:hover i),
  .sidebar-menu :global(.list-group-item.active i) {
    color: #0f6efd;
  }

  .sidebar-menu :global(.list-group-item.active) {
    background: #eff6ff;
    color: #0f6efd;
    box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.1);
  }

  .sidebar-menu :global(.list-group-item.active::before) {
    background: transparent;
  }

  .sidebar-help-card {
    display: flex;
    gap: 0.8rem;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.6rem;
    padding: 0.75rem;
    border: 1px solid #dbeafe;
    border-radius: 0.9rem;
    background: #f8fbff;
    color: #0f6efd;
    box-shadow: none;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .sidebar-help-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.08);
  }

  .sidebar-help-card strong,
  .sidebar-help-card small {
    display: block;
  }

  .sidebar-help-card strong {
    font-size: 0.9rem;
    font-weight: 900;
  }

  .sidebar-help-card small {
    color: #64748b;
    opacity: 1;
    font-size: 0.74rem;
  }

  .sidebar-help-card i {
    font-size: 1.3rem;
  }

  :global(html[dir='ltr']) #erp-sidebar {
    left: 0;
    transform: translateX(0);
  }

  @media (max-width: 991px) {
    #erp-sidebar {
      width: min(300px, 86vw);
      box-shadow: 0 18px 46px rgba(15, 23, 42, 0.16);
    }

    :global(html[dir='ltr']) #erp-sidebar {
      transform: translateX(-100%);
    }
    :global(html[dir='ltr']) #erp-sidebar.show {
      transform: translateX(0);
    }
  }
  
  :global(html[dir='rtl']) #erp-sidebar {
    right: 0;
    left: auto;
    transform: translateX(0);
  }

  @media (max-width: 991px) {
    :global(html[dir='rtl']) #erp-sidebar {
      transform: translateX(100%);
    }
    :global(html[dir='rtl']) #erp-sidebar.show {
      transform: translateX(0);
    }
  }
</style>
