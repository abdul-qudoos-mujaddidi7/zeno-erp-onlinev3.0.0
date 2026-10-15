<script>
  import { onMount, onDestroy } from 'svelte';
  import { link, location, querystring } from 'svelte-spa-router';
  import { t, lang, settings_all, translate_org_type, supported, setLanguage, isRTL } from '../i18n/i18n';
  
  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  import { auth } from "../auth/authStore"
  import { canViewDashboard, isSubscriptionFeatureEnabled, moduleForFrontendPath, permissionsWithSubscriptionFeatures } from '../auth/permissions.js';
  import { logout, logoutClear } from '../auth/authService.js';
  import { confirmModal } from './common/confirmModal.js';
  import { theme, toggleTheme } from '../stores/themeStore.js';
import { userApi } from '../api/userApi.js';
import { settingsApi } from '../api/settingsApi.js';
import { subscriptionApi } from '../api/subscriptionApi.js';

  $: permissions = permissionsWithSubscriptionFeatures($auth.permissions, $auth.subscription);
  // Dashboard visibility follows its own permission; a permission set without
  // a Dashboard entry keeps the legacy behaviour (visible), unless the set
  // denies every module it mentions — a locked-down account.
  $: showDashboard = canViewDashboard(permissions);
  
  export let sidebarOpen = false;
  export let sidebarCollapsed = false;

  let currentLang = localStorage.getItem('lang') || 'en';
  const unsubscribeLang = lang.subscribe((v) => (currentLang = v));

  const SIDEBAR_EXPANDED_WIDTH = 'var(--sidebar-width-expanded)';
  const SIDEBAR_COLLAPSED_WIDTH = 'var(--sidebar-width-collapsed)';

  if (typeof document !== 'undefined') {
    const savedCollapsed = localStorage.getItem('sidebar_collapsed') === '1';
    document.documentElement.style.setProperty(
      '--sidebar-width',
      savedCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH
    );
  }

  let profileMenuOpen = false;
  let reportsMenuOpen = false;
  let isDesktop = true;
  let desktopMedia;
  let subscriptionRefreshTimer;
  let syncDesktop = () => {};

  async function refreshSubscriptionFeatures() {
    try {
      const response = await subscriptionApi.getCurrent();
      if (!response?.subscription) return;
      localStorage.setItem('subscription', JSON.stringify(response.subscription));
      auth.update((current) => ({ ...current, subscription: response.subscription }));
    } catch (error) {
      // A transient refresh failure should not sign the user out.
    }
  }

  function toggleProfileMenu() {
    profileMenuOpen = !profileMenuOpen;
  }

  async function handleLogout() {
    profileMenuOpen = false;

    const confirmed = await confirmModal({
      title: t('Logout'),
      message: t('Logout Confirm'),
      confirmText: t('Logout'),
      cancelText: t('Cancel'),
      variant: 'danger',
      icon: 'bi-box-arrow-right',
    });

    if (confirmed) {
      logout();
    }
  }

  async function handleLogoutClear() {
    profileMenuOpen = false;
    logoutClear();
  }

  async function changeLanguage(code) {
    setLanguage(code);
    const shouldRtl = isRTL(code);
    document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
    const mdbCss = document.getElementById('mdb-css');
    const mdbRtlCss = document.getElementById('mdb-rtl-css');
    if (mdbCss && mdbRtlCss) {
      mdbCss['disabled'] = shouldRtl;
      mdbRtlCss['disabled'] = !shouldRtl;
    }
    try {
      const userID = parseInt(localStorage.getItem('user_id'));
      if (userID) {
        await userApi.update(userID, { language: code });
      }
      localStorage.setItem('lang', code);
    } catch (e) {
      console.warn('Failed to save language', e);
    }
  }

  function handleDocumentClick(event) {
    if (!event.target.closest('.sidebar-profile')) {
      profileMenuOpen = false;
    }
  }

  function updateSidebarWidth() {
    const width =
      isDesktop && sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
    document.documentElement.style.setProperty('--sidebar-width', width);
  }

  function toggleSidebarCollapse() {
    sidebarCollapsed = !sidebarCollapsed;
    profileMenuOpen = false;
    localStorage.setItem('sidebar_collapsed', sidebarCollapsed ? '1' : '0');
    updateSidebarWidth();
  }

  function sidebarMenuLabels(node, subscription) {
    const apply = () => {
      node.querySelectorAll('.list-group-item').forEach((link) => {
        const feature = moduleForFrontendPath(link.getAttribute('href'));
        link.hidden = Boolean(feature && !isSubscriptionFeatureEnabled(feature, subscription));
        const label = link.textContent.replace(/\s+/g, ' ').trim();
        if (label) {
          link.setAttribute('data-sidebar-label', label);
        }
      });
    };

    apply();

    return {
      update(nextSubscription) {
        subscription = nextSubscription;
        apply();
      },
    };
  }

  $: sidebarCollapsed, isDesktop, updateSidebarWidth();

  $: console.log('settings updated:', $settings_all);
  $: enable_master_exchanges = $settings_all.find((s) => s.key === 'enable_master_exchanges')?.value == 1;
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;

  let shiftPressed = false;
  let ctrlPressed = false;
  let previousSidebarLocation = '';
  $: loc = $location ? $location.replace(/\/+$/g, '') : '';
  $: salesTab = new URLSearchParams($querystring || '').get('tab') || 'sales';
  $: reportsMenuActive =
    loc === '/dashboard/stock-adjustments' ||
    loc === '/dashboard/fiscal-years' ||
    loc === '/dashboard/accounts/report' ||
    loc === '/dashboard/accounts/general-report' ||
    (loc === '/dashboard/sales' && salesTab === 'products');
  $: if (reportsMenuActive) reportsMenuOpen = true;
  $: if ($location !== previousSidebarLocation) {
    previousSidebarLocation = $location;
    if (!reportsMenuActive) reportsMenuOpen = false;
  }

  function toggleReportsMenu() {
    reportsMenuOpen = !reportsMenuOpen;
  }

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
    document.removeEventListener('click', handleDocumentClick);
    unsubscribeLang();
    if (desktopMedia) {
      desktopMedia.removeEventListener('change', syncDesktop);
    }
    if (subscriptionRefreshTimer) clearInterval(subscriptionRefreshTimer);
    window.removeEventListener('focus', refreshSubscriptionFeatures);
  });

  onMount(async () => {
    refreshSubscriptionFeatures();
    subscriptionRefreshTimer = setInterval(refreshSubscriptionFeatures, 30000);
    window.addEventListener('focus', refreshSubscriptionFeatures);
    desktopMedia = window.matchMedia('(min-width: 992px)');
    syncDesktop = () => {
      isDesktop = desktopMedia.matches;
    };
    syncDesktop();
    desktopMedia.addEventListener('change', syncDesktop);

    sidebarCollapsed = localStorage.getItem('sidebar_collapsed') === '1';
    updateSidebarWidth();

    enable_master_exchanges =
      (
        (await settingsApi.getAll({ status: 1, key: 'enable_master_exchanges' }))?.data?.[0]
      )?.value == 1;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('click', handleDocumentClick);
  });
</script>

<nav id="erp-sidebar" class:show={sidebarOpen} class:collapsed={sidebarCollapsed && isDesktop} class:dashboard-sidebar={loc === '/dashboard'}>
  <div class="sidebar-shell">
    <div class="sidebar-brand">
      <div class="brand-main">
        <div class="brand-mark">
          <img src="/img/logo.png" alt="ZENO ERP" />
        </div>
      </div>
      <div class="brand-toolbar">
        {#if permissions?.some(p => p.code === "POS" && p.view)}
          <a
            use:link
            href="/pos"
            class="btn btn-sm btn-primary fw-bold px-2 d-none d-lg-inline-flex align-items-center pos-shortcut {_translate_org_type ==
            'exchange'
              ? 'd-none d-lg-none'
              : ''}"
            class:active={$location === '/pos'}
            title="POS">
            <i class="bi bi-cart3"></i>
            <span>POS</span>
          </a>
        {/if}
        <button
          type="button"
          class="sidebar-collapse-icon-btn d-none d-lg-inline-flex"
          on:click={toggleSidebarCollapse}
          aria-label={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}>
          <i class={sidebarCollapsed ? 'bi bi-grid' : 'bi bi-list'}></i>
        </button>
        <button
          class="btn btn-sm btn-outline-secondary d-lg-none"
          on:click={() => (sidebarOpen = false)}
          aria-label="Close sidebar"
          title="Close sidebar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </div>
    <div class="list-group list-group-flush sidebar-menu mt-2" use:sidebarMenuLabels={$auth.subscription}>
      {#if showDashboard}
        <a
          use:link
          href="/dashboard"
          class="list-group-item list-group-item-action"
          class:active={$location === '/dashboard'}>
          <i class="bi bi-speedometer2 me-2"></i>
          {t('Dashboard')}
        </a>
      {/if}
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
          class:active={!reportsMenuActive && (loc.startsWith('/dashboard/accounts/') || loc.startsWith('/dashboard/account/'))}>
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
          class:active={$location === '/dashboard/sales' && salesTab !== 'products'}>
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
        <div class="sidebar-report-group" class:open={reportsMenuOpen}>
          <button
            type="button"
            class="list-group-item list-group-item-action sidebar-report-toggle"
            class:active={reportsMenuActive}
            aria-expanded={reportsMenuOpen}
            on:click={toggleReportsMenu}>
            <i class="bi bi-file-bar-graph me-2"></i>
            <span>{t('Reports')}</span>
            <i class="bi bi-chevron-down sidebar-report-chevron" aria-hidden="true"></i>
          </button>
          {#if reportsMenuOpen}
            <div class="sidebar-report-links">
              {#if permissions?.some(p => p.code === "Products" && p.view)}
                <a use:link href="/dashboard/stock-adjustments"
                  class="list-group-item list-group-item-action"
                  class:active={loc === '/dashboard/stock-adjustments'}>
                  <i class="bi bi-sliders me-2"></i>
                  {t('Stock adjustments')}
                </a>
              {/if}
              <a use:link href="/dashboard/fiscal-years"
                class="list-group-item list-group-item-action"
                class:active={loc === '/dashboard/fiscal-years'}>
                <i class="bi bi-calendar-range me-2"></i>
                {t('Fiscal years')}
              </a>
              <a use:link href="/dashboard/accounts/report"
                class="list-group-item list-group-item-action"
                class:active={loc === '/dashboard/accounts/report'}>
                <i class="bi bi-person-lines-fill me-2"></i>
                {t('Report')}
              </a>
              <a use:link href="/dashboard/accounts/general-report"
                class="list-group-item list-group-item-action"
                class:active={loc === '/dashboard/accounts/general-report'}>
                <i class="bi bi-journal-text me-2"></i>
                {t('General Report')}
              </a>
              <a use:link href="/dashboard/sales?tab=products"
                class="list-group-item list-group-item-action"
                class:active={loc === '/dashboard/sales' && salesTab === 'products'}>
                <i class="bi bi-box-seam me-2"></i>
                {t('Products Report')}
              </a>
            </div>
          {/if}
        </div>
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
    <div class="sidebar-profile">
      <button
        type="button"
        class="sidebar-profile-trigger"
        on:click|stopPropagation={toggleProfileMenu}
        aria-expanded={profileMenuOpen}
        aria-haspopup="true">
        <span class="user-avatar">{(localStorage.getItem('username') || 'U').slice(0, 1).toUpperCase()}</span>
        <span class="user-meta">
          <strong>{localStorage.getItem('username') || t('User')}</strong>
          <small>{t('Administrator')}</small>
        </span>
        <i class="bi bi-chevron-up profile-chevron" class:open={profileMenuOpen}></i>
      </button>
      {#if profileMenuOpen}
        <div class="sidebar-profile-menu">
          <div class="sidebar-profile-lang">
            <label for="sidebar-lang-select">{t('Language')}</label>
            <select
              id="sidebar-lang-select"
              class="form-select form-select-sm"
              bind:value={currentLang}
              on:change={(e) => changeLanguage(e.currentTarget.value)}>
              {#each supported as s}
                <option value={s.code}>{s.label}</option>
              {/each}
            </select>
          </div>
          <button type="button" class="sidebar-theme-toggle" on:click={toggleTheme}>
            <span>
              <i class={$theme === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill'}></i>
              {t('Dark Mode')}
            </span>
            <span class="theme-switch" class:active={$theme === 'dark'} aria-hidden="true">
              <span></span>
            </span>
          </button>
          {#if shiftPressed && ctrlPressed}
            <button type="button" class="sidebar-profile-logout sidebar-profile-logout-clear" on:click={handleLogoutClear}>
              <i class="bi bi-trash"></i>
              {t('Logout Clear')}
            </button>
          {/if}
          <button type="button" class="sidebar-profile-logout" on:click={handleLogout}>
            <i class="bi bi-box-arrow-right"></i>
            {t('Logout')}
          </button>
        </div>
      {/if}
    </div>
  </div>
</nav>

<style>

  #erp-sidebar {
    position: fixed;
    top: 0;
    width: var(--sidebar-width);
    height: 100vh;
    height: 100dvh;
    z-index: 1050;
    transition:
      width 0.3s ease,
      transform 0.3s ease,
      box-shadow 0.3s ease;
    overflow: visible;
    border-inline-end: 0;
    background: #fff;
    box-shadow: 10px 0 28px rgba(15, 23, 42, 0.04);
  }

  :global(html.dark) #erp-sidebar,
  :global(html.dark) #erp-sidebar.dashboard-sidebar {
    background: #111827;
    box-shadow: 10px 0 28px rgba(0, 0, 0, 0.28);
  }

  #erp-sidebar.dashboard-sidebar {
    background: #fff;
  }

  .sidebar-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0.45rem 1rem 1rem;
    min-width: 0;
  }

  .sidebar-brand {
    position: static;
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.15rem 0.25rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    min-width: 0;
  }

  .brand-main {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    justify-content: center;
    min-width: 0;
    flex: 1;
  }

  .brand-toolbar {
    position: absolute;
    top: 0;
    inset-inline: 0;
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-shrink: 0;
  }

  .sidebar-collapse-icon-btn {
    position: absolute;
    top: 2.45rem;
    inset-inline-end: -0.8rem;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    padding: 0;
    border: 1px solid #edf1f6;
    border-radius: 0.45rem;
    background: #fff;
    color: #6f7782;
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
    transition:
      border-color 0.2s ease,
      color 0.2s ease,
      background 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
  }

  .sidebar-collapse-icon-btn:hover {
    border-color: #d8e2ee;
    background: #fff;
    color: #0f6efd;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14);
    transform: translateY(-1px);
  }

  :global(html.dark) .sidebar-collapse-icon-btn {
    border-color: #263447;
    background: #172033;
    color: #cbd5e1;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
  }

  :global(html.dark) .sidebar-collapse-icon-btn:hover {
    border-color: rgba(96, 165, 250, 0.45);
    background: #1e293b;
    color: #60a5fa;
  }

  .sidebar-collapse-icon-btn i {
    margin: 0 !important;
    font-size: 0.82rem;
    line-height: 1;
  }

  .brand-mark {
    width: 8.2rem;
    height: 3.5rem;
    display: grid;
    place-items: center;
    overflow: hidden;
    flex-shrink: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .brand-mark img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .pos-shortcut {
    position: absolute;
    top: 0;
    inset-inline-start: auto;
    inset-inline-end: 0;
    gap: 0.28rem;
    min-width: 3.2rem;
    min-height: 1.75rem;
    justify-content: center;
    border: 0;
    border-radius: 0 0 0.6rem 0;
    background: #0f6efd;
    color: #fff;
    box-shadow: 0 6px 14px rgba(15, 110, 253, 0.16);
    font-size: 0.68rem;
    font-weight: 900;
  }

  .pos-shortcut i {
    font-size: 0.78rem;
    line-height: 1;
  }

  .sidebar-menu {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    scrollbar-width: thin;
    scrollbar-width: none;
  }

  .sidebar-menu::-webkit-scrollbar {
    display: none;
  }

  .sidebar-menu::-webkit-scrollbar-thumb {
    display: none;
  }

  .sidebar-menu :global(.list-group-item) {
    position: relative;
    display: flex;
    gap: 0.85rem;
    align-items: center;
    min-height: 2.75rem;
    margin: 0.08rem 0;
    padding: 0.52rem 0.9rem;
    border: 0;
    border-radius: 0.7rem !important;
    background: transparent;
    color: #526176;
    font-size: 0.8rem;
    font-weight: 800;
    transition:
      background 0.16s ease,
      color 0.16s ease,
      transform 0.16s ease,
      box-shadow 0.16s ease;
  }

  :global(html.dark) .sidebar-menu {
    scrollbar-width: none;
  }

  :global(html.dark) .sidebar-menu::-webkit-scrollbar-thumb {
    display: none;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item) {
    color: #cbd5e1;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item i) {
    color: #94a3b8;
  }

  .sidebar-menu :global(.list-group-item::before) {
    content: '';
    position: absolute;
    inset-block: 0.62rem;
    inset-inline-start: -0.1rem;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: transparent;
    transition: background 0.2s ease;
  }

  .sidebar-menu :global(.list-group-item i) {
    width: 1.9rem;
    height: 1.9rem;
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    margin: 0 !important;
    border-radius: 0;
    background: transparent;
    color: #526176;
    font-size: 0.96rem;
    text-align: center;
    transition: color 0.2s ease;
  }

  .sidebar-menu :global(.list-group-item:hover) {
    transform: translateX(-1px);
    background: #f4f8ff;
    color: #0f6efd;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item:hover) {
    background: rgba(96, 165, 250, 0.12);
    color: #93c5fd;
  }

  :global(html[dir='ltr']) .sidebar-menu :global(.list-group-item:hover) {
    transform: translateX(1px);
  }

  .sidebar-menu :global(.list-group-item:hover i),
  .sidebar-menu :global(.list-group-item.active i) {
    background: transparent;
    color: #0f6efd;
  }

  .sidebar-menu :global(.list-group-item.active) {
    background: #eaf3ff;
    color: #0f6efd;
    box-shadow: none;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item:hover i),
  :global(html.dark) .sidebar-menu :global(.list-group-item.active i) {
    color: #93c5fd;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item.active) {
    background: rgba(59, 130, 246, 0.18);
    color: #bfdbfe;
  }

  .sidebar-menu :global(.list-group-item.active::before) {
    background: transparent;
  }

  .sidebar-report-group {
    margin: 0.08rem 0;
  }

  .sidebar-report-toggle {
    width: 100%;
    cursor: pointer;
    text-align: start;
  }

  .sidebar-report-toggle span {
    flex: 1 1 auto;
  }

  .sidebar-report-chevron {
    width: auto !important;
    height: auto !important;
    margin-inline-start: auto !important;
    font-size: 0.68rem !important;
    transition: transform 0.18s ease;
  }

  .sidebar-report-group.open .sidebar-report-chevron {
    transform: rotate(180deg);
  }

  .sidebar-report-links {
    margin: 0.15rem 0 0.35rem;
    padding-inline-start: 0.8rem;
    border-inline-start: 1px solid #dbe5f1;
  }

  .sidebar-report-links :global(.list-group-item) {
    min-height: 2.35rem;
    margin: 0.04rem 0;
    padding-block: 0.38rem;
    font-size: 0.74rem;
  }

  :global(html.dark) .sidebar-report-links {
    border-color: #475569;
  }

  #erp-sidebar.collapsed .sidebar-report-links {
    display: none;
  }

  .sidebar-profile {
    position: relative;
    margin-top: 0.5rem;
    padding-top: 0.65rem;
    border-top: 1px solid #e8edf4;
  }

  :global(html.dark) .sidebar-profile {
    border-top-color: #253247;
  }

  .sidebar-profile-trigger {
    display: flex;
    gap: 0.65rem;
    align-items: center;
    width: 100%;
    padding: 0.6rem;
    border: 1px solid #e3e9f1;
    border-radius: 10px;
    background: #fbfcfe;
    color: #172033;
    text-align: start;
    transition:
      border-color 0.2s ease,
      background 0.2s ease;
  }

  :global(html.dark) .sidebar-profile-trigger {
    border-color: #263447;
    background: #172033;
    color: #e5edf7;
  }

  .sidebar-profile-trigger:hover,
  .sidebar-profile-trigger[aria-expanded='true'] {
    border-color: #bfd2ef;
    background: #f3f7fc;
  }

  :global(html.dark) .sidebar-profile-trigger:hover,
  :global(html.dark) .sidebar-profile-trigger[aria-expanded='true'] {
    border-color: rgba(96, 165, 250, 0.42);
    background: #1e293b;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    border-radius: 9px;
    background: #eaf2ff;
    color: #2f6fed;
    font-size: 0.95rem;
    font-weight: 900;
  }

  :global(html.dark) .user-avatar {
    background: rgba(96, 165, 250, 0.16);
    color: #93c5fd;
  }

  .user-meta {
    min-width: 0;
    flex: 1;
    line-height: 1.1;
  }

  .user-meta strong,
  .user-meta small {
    display: block;
  }

  .user-meta strong {
    overflow: hidden;
    color: #172033;
    font-size: 0.8rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.dark) .user-meta strong {
    color: #f8fafc;
  }

  :global(html.dark) .user-meta small,
  :global(html.dark) .profile-chevron {
    color: #94a3b8;
  }

  .user-meta small {
    color: #8a98ab;
    font-size: 0.66rem;
    font-weight: 700;
  }

  .profile-chevron {
    color: #94a3b8;
    font-size: 0.8rem;
    transition: transform 0.2s ease;
  }

  .profile-chevron.open {
    transform: rotate(180deg);
  }

  .sidebar-profile-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.45rem);
    left: 0;
    z-index: 10;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 16px 34px rgba(21, 32, 51, 0.14);
  }

  :global(html.dark) .sidebar-profile-menu {
    border-color: #263447;
    background: #172033;
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.36);
  }

  .sidebar-profile-lang {
    padding: 0.65rem 0.75rem 0.45rem;
    border-bottom: 1px solid #f1f5f9;
  }

  :global(html.dark) .sidebar-profile-lang {
    border-bottom-color: #253247;
  }

  .sidebar-profile-lang label {
    display: block;
    margin-bottom: 0.35rem;
    color: #64748b;
    font-size: 0.68rem;
    font-weight: 800;
  }

  :global(html.dark) .sidebar-profile-lang label {
    color: #cbd5e1;
  }

  :global(html.dark) .sidebar-profile-lang :global(.form-select) {
    border-color: #334155;
    background-color: #0f172a;
    color: #e5edf7;
  }

  .sidebar-theme-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    padding: 0.72rem 0.85rem;
    border: 0;
    border-bottom: 1px solid #f1f5f9;
    background: transparent;
    color: #334155;
    font-size: 0.8rem;
    font-weight: 750;
    text-align: start;
    transition:
      background 0.2s ease,
      color 0.2s ease;
  }

  .sidebar-theme-toggle:hover {
    background: #f8fafc;
    color: #0f6efd;
  }

  .sidebar-theme-toggle > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }

  .theme-switch {
    position: relative;
    width: 2.35rem;
    height: 1.25rem;
    flex: 0 0 auto;
    border: 1px solid #dbe4ef;
    border-radius: 999px;
    background: #e8eef6;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
  }

  .theme-switch span {
    position: absolute;
    top: 0.14rem;
    left: 0.16rem;
    width: 0.86rem;
    height: 0.86rem;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 2px 5px rgba(15, 23, 42, 0.18);
    transition: transform 0.2s ease;
  }

  .theme-switch.active {
    border-color: #60a5fa;
    background: #2563eb;
  }

  .theme-switch.active span {
    transform: translateX(1.05rem);
  }

  :global(html.dark) .sidebar-theme-toggle {
    border-bottom-color: #253247;
    color: #dbeafe;
  }

  :global(html.dark) .sidebar-theme-toggle:hover {
    background: rgba(96, 165, 250, 0.1);
    color: #93c5fd;
  }

  .sidebar-profile-lang :global(.form-select) {
    min-height: 34px;
    border-color: #e2e8f0;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 700;
  }

  .sidebar-profile-logout-clear {
    color: #b45309 !important;
    border-bottom: 1px solid #f1f5f9;
  }

  .sidebar-profile-logout-clear:hover {
    background: #fffbeb !important;
  }

  .sidebar-profile-logout {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    width: 100%;
    padding: 0.7rem 0.85rem;
    border: 0;
    background: transparent;
    color: #dc2626;
    font-size: 0.8rem;
    font-weight: 750;
    text-align: start;
    transition: background 0.2s ease;
  }

  .sidebar-profile-logout:hover {
    background: #fef2f2;
  }

  .sidebar-profile-logout i {
    font-size: 1rem;
  }

  #erp-sidebar.collapsed .sidebar-brand {
    justify-content: center;
    padding: 0.55rem;
  }

  #erp-sidebar.collapsed .brand-main,
  #erp-sidebar.collapsed .pos-shortcut {
    display: none !important;
  }

  #erp-sidebar.collapsed .brand-toolbar {
    width: 100%;
    justify-content: center;
  }

  #erp-sidebar.collapsed .user-meta,
  #erp-sidebar.collapsed .profile-chevron {
    display: none;
  }

  #erp-sidebar.collapsed .sidebar-shell {
    padding-inline: 0.55rem;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item) {
    justify-content: center;
    gap: 0;
    padding-inline: 0.35rem;
    font-size: 0;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item i) {
    margin: 0 !important;
    font-size: 0.95rem;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item::before) {
    inset-inline-start: 0.08rem;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item:hover) {
    transform: none;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item[data-sidebar-label]) {
    position: relative;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item[data-sidebar-label]:hover::after) {
    content: attr(data-sidebar-label);
    position: absolute;
    inset-inline-start: calc(100% + 0.55rem);
    top: 50%;
    z-index: 20;
    transform: translateY(-50%);
    padding: 0.42rem 0.7rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.55rem;
    background: #0f172a;
    color: #fff;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18);
  }

  #erp-sidebar.collapsed .sidebar-profile-trigger {
    justify-content: center;
    padding-inline: 0.45rem;
  }

  #erp-sidebar.collapsed .sidebar-profile-menu {
    inset-inline-start: calc(100% + 0.45rem);
    inset-inline-end: auto;
    bottom: 0;
    width: 180px;
  }

  :global(html[dir='ltr']) #erp-sidebar {
    left: 0;
    transform: translateX(0);
  }

  @media (max-width: 991px) {
    #erp-sidebar {
      width: min(17.5rem, 86vw) !important;
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
