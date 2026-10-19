<script>
  import { onMount, onDestroy } from 'svelte';
  import { link, location, querystring } from 'svelte-spa-router';
  import { app_version } from '../config.js';
  import { t, lang, settings_all, translate_org_type, setLanguage, isRTL } from '../i18n/i18n';
  
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

  /* Profile popup: the greeting follows the clock, the language switcher keeps the
     design's order (Dari, Pashto, English) and the subscription line reuses the
     plan/status already held in the auth store. */
  $: greetingHour = new Date().getHours();
  $: greetingKey = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good day' : 'Good evening';
  $: greetingSeparator = currentLang === 'en' ? ', ' : '، ';
  /* Self-names stay short as in the design (دری / پښتو / EN) so the three-way
     switcher fits one row inside the 244px popup. */
  const LANGUAGE_LABELS = { fa: 'دری', ps: 'پښتو', en: 'EN' };
  $: languageOptions = ['fa', 'ps', 'en'].map((code) => ({
    code,
    label: LANGUAGE_LABELS[code],
  }));
  
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
  /* The design narrows the rail to 72px on tablet (768–1100px) and only
     restores labels above that, independent of the user's own collapse. */
  let isTabletRail = false;
  let tabletMedia;
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

  async function pickLanguage(code) {
    profileMenuOpen = false;
    await changeLanguage(code);
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

  $: railCollapsed = (isDesktop && sidebarCollapsed) || isTabletRail;

  function updateSidebarWidth() {
    const width = railCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
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
          link.setAttribute('title', label);
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

  $: railCollapsed, updateSidebarWidth();

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
    if (tabletMedia) {
      tabletMedia.removeEventListener('change', syncDesktop);
    }
    if (subscriptionRefreshTimer) clearInterval(subscriptionRefreshTimer);
    window.removeEventListener('focus', refreshSubscriptionFeatures);
  });

  onMount(async () => {
    refreshSubscriptionFeatures();
    subscriptionRefreshTimer = setInterval(refreshSubscriptionFeatures, 30000);
    window.addEventListener('focus', refreshSubscriptionFeatures);
    desktopMedia = window.matchMedia('(min-width: 992px)');
    tabletMedia = window.matchMedia('(min-width: 768px) and (max-width: 1100px)');
    syncDesktop = () => {
      isDesktop = desktopMedia.matches;
      isTabletRail = tabletMedia.matches;
    };
    syncDesktop();
    desktopMedia.addEventListener('change', syncDesktop);
    tabletMedia.addEventListener('change', syncDesktop);

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

<nav id="erp-sidebar" class:show={sidebarOpen} class:collapsed={railCollapsed} class:dashboard-sidebar={loc === '/dashboard'}>
  <div class="sidebar-shell">
    <div class="sidebar-brand">
      <div class="brand-main">
        <div class="brand-mark" aria-hidden="true">Z</div>
        <div class="brand-text">
          <div class="brand-name">ZENO</div>
          <div class="brand-ver">ERP · {app_version}</div>
        </div>
      </div>
      <div class="brand-toolbar">
        <button
          class="sidebar-close-btn btn btn-sm btn-outline-secondary"
          on:click={() => (sidebarOpen = false)}
          aria-label="Close sidebar"
          title="Close sidebar">
          <i class="bi bi-x-lg"></i>
        </button>
        <button
          type="button"
          class="sidebar-collapse-icon-btn"
          on:click={toggleSidebarCollapse}
          aria-controls="erp-sidebar"
          aria-expanded={!railCollapsed}
          aria-label={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}
          title={sidebarCollapsed ? t('Expand sidebar') : t('Collapse sidebar')}>
          <i class="bi bi-list" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    {#if permissions?.some(p => p.code === "POS" && p.view)}
      <div class="sidebar-pos-row {_translate_org_type == 'exchange' ? 'd-none' : ''}">
        <a
          use:link
          href="/pos"
          class="pos-shortcut"
          class:active={$location === '/pos'}
          title="POS">
          <i class="bi bi-shop-window"></i>
          <span class="pos-label">POS</span>
        </a>
      </div>
    {/if}

    <div class="list-group list-group-flush sidebar-menu" use:sidebarMenuLabels={$auth.subscription}>
      <div class="sidebar-group-label">{t('General')}</div>

      {#if showDashboard}
        <a
          use:link
          href="/dashboard"
          class="list-group-item list-group-item-action"
          class:active={$location === '/dashboard'}
          aria-current={$location === '/dashboard' ? 'page' : undefined}>
          <i class="bi bi-speedometer2" aria-hidden="true"></i>
          <span class="nav-text">{t('Dashboard')}</span>
        </a>
      {/if}
      <a
        use:link
        href="/dashboard/2"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/2'}>
        <i class="bi bi-grid-fill" aria-hidden="true"></i>
        <span class="nav-text">{t('Dashboard')} 2</span>
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
        <i class="bi bi-people" aria-hidden="true"></i>
        <span class="nav-text">{t('Patients')}</span>
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
        <i class="bi bi-calendar-check" aria-hidden="true"></i>
        <span class="nav-text">{t('Appointments')}</span>
      </a>
      <a
        use:link
        href="/dashboard/labtests"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'hospital') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/labtests')||loc.startsWith('/dashboard/labtests')}>
        <i class="bi bi-capsule" aria-hidden="true"></i>
        <span class="nav-text">{t('Lab Tests')}</span>
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
        <i class="bi bi-prescription" aria-hidden="true"></i>
        <span class="nav-text">{t('Prescriptions')}</span>
      </a>
      <a
        use:link
        href="/dashboard/patient-types"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/patient-types'}>
        <i class="bi bi-person-lines-fill" aria-hidden="true"></i>
        <span class="nav-text">{t('Patient Types')}</span>
      </a>
      <a use:link href="/dashboard/apartments/list"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'apartment') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/apartments') ||
          $location === '/dashboard/apartments/list'}>
        <i class="bi bi-building-fill" aria-hidden="true"></i>
        <span class="nav-text">{t('Apartments')}</span>
      </a>

      <div class="sidebar-group-label">{t('Trade')}</div>

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
          <i class="bi bi-cart-check" aria-hidden="true"></i>
          <span class="nav-text">{t('Sales')}</span>
        </a>
      {/if}
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
          <i class="bi bi-bag-plus" aria-hidden="true"></i>
          <span class="nav-text">{t('Purchases')}</span>
        </a>
      {/if}
      {#if permissions?.some(p => p.code === "Products" && p.view)}
        <a use:link href="/dashboard/stock"
          class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
            localStorage.getItem('org_type') != 'exchange') ||
          (shiftPressed && ctrlPressed)
            ? ''
            : 'd-none'}  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={$location === '/dashboard/stock'}>
          <i class="bi bi-box-seam" aria-hidden="true"></i>
          <span class="nav-text">{t('Products')}</span>
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
            <i class="bi bi-person-vcard" aria-hidden="true"></i>
            <span class="nav-text">{t('Services')}</span>
          </a>
        {/if}
      {/if}
      <a use:link href="/dashboard/stock-transactions"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/stock-transactions'}>
        <i class="bi bi-box-seam" aria-hidden="true"></i>
        <span class="nav-text">{t('Stock Transactions')}</span>
      </a>

      <div class="sidebar-group-label">{t('Finance')}</div>

      {#if permissions?.some(p => p.code === "Accounts" && p.view)}
        <a
          use:link
          href="/dashboard/accounts/list"
          class="list-group-item list-group-item-action {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={!reportsMenuActive && (loc.startsWith('/dashboard/accounts/') || loc.startsWith('/dashboard/account/'))}>
          <i class="bi bi-people" aria-hidden="true"></i>
          <span class="nav-text">{t('Accounts')}</span>
        </a>
      {/if}
      {#if permissions?.some(p => p.code === "Journals" && p.view)}
        <a
          use:link
          href="/dashboard/journals/list"
          class="list-group-item list-group-item-action  {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={loc.startsWith('/dashboard/journals')}>
          <i class="bi bi-journal-text" aria-hidden="true"></i>
          <span class="nav-text">{t('Journals')}</span>
        </a>
      {/if}
      {#if permissions?.some(p => p.code === "Exchange" && p.view)}
        <a
          use:link
          href="/dashboard/exchanges/list"
          class="list-group-item list-group-item-action {localStorage.getItem('role_id') != '5' || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
          class:active={loc.startsWith('/dashboard/exchanges')}>
          <i class="bi bi-currency-exchange" aria-hidden="true"></i>
          <span class="nav-text">{t('Exchanges')}</span>
        </a>
      {/if}
      <a use:link href="/dashboard/transfers/list"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'exchange') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/transfers') || $location === '/dashboard/transfers/list'}>
        <i class="bi bi-arrow-left-right" aria-hidden="true"></i>
        <span class="nav-text">{t('Transfers')}</span>
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
        <i class="bi bi-safe" aria-hidden="true"></i>
        <span class="nav-text">{t('Master Exchanges')}</span>
      </a>
      <a
        use:link
        href="/dashboard/treasury"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/treasury'}>
        <i class="bi bi-cash-coin" aria-hidden="true"></i>
        <span class="nav-text">{t('Treasury')}</span>
      </a>
      <a
        use:link
        href="/dashboard/account-types"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/account-types'}>
        <i class="bi bi-diagram-3" aria-hidden="true"></i>
        <span class="nav-text">{t('Account Types')}</span>
      </a>

      <div class="sidebar-group-label">{t('Management')}</div>

      <a
        use:link
        href="/dashboard/work-centers"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'manufacturing') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'} "
        class:active={loc.startsWith('/dashboard/work-centers') || $location === '/dashboard/work-centers'}>
        <i class="bi bi-person-workspace" aria-hidden="true"></i>
        <span class="nav-text">{t('Work Centers')}</span>
      </a>
      <a use:link
        href="/dashboard/boms"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') && localStorage.getItem('org_type') == 'manufacturing') || (shiftPressed && ctrlPressed) ? '' : 'd-none'}"
        class:active={loc.startsWith('/dashboard/boms') || $location === '/dashboard/boms'}>
        <i class="bi bi-receipt" aria-hidden="true"></i>
        <span class="nav-text">{t('Bill of Materials')}</span>
      </a>
      <a use:link href="/dashboard/productions"
        class="list-group-item list-group-item-action {(localStorage.getItem('org_type') &&
          localStorage.getItem('org_type') == 'manufacturing') ||
        (shiftPressed && ctrlPressed)
          ? ''
          : 'd-none'}"
        class:active={loc.startsWith('/dashboard/productions') || $location === '/dashboard/productions'}>
        <i class="bi bi-gear-wide-connected" aria-hidden="true"></i>
        <span class="nav-text">{t('Productions')}</span>
      </a>
      <div class="sidebar-report-group" class:open={reportsMenuOpen}>
        <button
          type="button"
          class="list-group-item list-group-item-action sidebar-report-toggle"
          class:active={reportsMenuActive}
          aria-expanded={reportsMenuOpen}
          on:click={toggleReportsMenu}>
          <i class="bi bi-bar-chart" aria-hidden="true"></i>
          <span class="nav-text">{t('Reports')}</span>
          <i class="bi bi-chevron-down sidebar-report-chevron" aria-hidden="true"></i>
        </button>
        {#if reportsMenuOpen}
          <div class="sidebar-report-links">
            {#if permissions?.some(p => p.code === "Products" && p.view)}
              <a use:link href="/dashboard/stock-adjustments"
                class="list-group-item list-group-item-action"
                class:active={loc === '/dashboard/stock-adjustments'}>
                <i class="bi bi-sliders" aria-hidden="true"></i>
                {t('Stock adjustments')}
              </a>
            {/if}
            <a use:link href="/dashboard/fiscal-years"
              class="list-group-item list-group-item-action"
              class:active={loc === '/dashboard/fiscal-years'}>
              <i class="bi bi-calendar-range" aria-hidden="true"></i>
              {t('Fiscal years')}
            </a>
            <a use:link href="/dashboard/accounts/report"
              class="list-group-item list-group-item-action"
              class:active={loc === '/dashboard/accounts/report'}>
              <i class="bi bi-person-lines-fill" aria-hidden="true"></i>
              {t('Report')}
            </a>
            <a use:link href="/dashboard/accounts/general-report"
              class="list-group-item list-group-item-action"
              class:active={loc === '/dashboard/accounts/general-report'}>
              <i class="bi bi-journal-text" aria-hidden="true"></i>
              {t('General Report')}
            </a>
            <a use:link href="/dashboard/sales?tab=products"
              class="list-group-item list-group-item-action"
              class:active={loc === '/dashboard/sales' && salesTab === 'products'}>
              <i class="bi bi-box-seam" aria-hidden="true"></i>
              {t('Products Report')}
            </a>
          </div>
        {/if}
      </div>
      {#if permissions?.some(p => p.code === "Settings" && p.view)}
        <a use:link href="/dashboard/settings/main"
          class="list-group-item list-group-item-action"
          class:active={loc.startsWith('/dashboard/settings')}>
          <i class="bi bi-gear" aria-hidden="true"></i>
          <span class="nav-text">{t('Settings')}</span>
        </a>
      {/if}
      <a use:link href="/dashboard/users"
        class="list-group-item list-group-item-action {shiftPressed && ctrlPressed ? '' : 'd-none'}"
        class:active={$location === '/dashboard/users'}>
        <i class="bi bi-person-badge" aria-hidden="true"></i>
        <span class="nav-text">{t('Users')}</span>
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
        <i
          class="bi {profileMenuOpen ? 'bi-chevron-contract' : 'bi-chevron-expand'} profile-chevron"
          aria-hidden="true"></i>
      </button>
      {#if profileMenuOpen}
        <div class="sidebar-profile-menu" role="dialog" aria-label={t('Profile')}>
          <div class="pm-head">
            <span class="pm-avatar" aria-hidden="true">
              {(localStorage.getItem('username') || 'U').slice(0, 1).toUpperCase()}
              <span class="pm-presence"></span>
            </span>
            <span class="pm-meta">
              <strong
                >{t(greetingKey)}{greetingSeparator}{localStorage.getItem('username') ||
                  t('User')}</strong
              >
              <small>{t('Administrator')}</small>
            </span>
          </div>

          {#if shiftPressed && ctrlPressed}
            <div class="pm-group">
              <button type="button" class="pm-row pm-row-warn" on:click={handleLogoutClear}>
                <i class="bi bi-trash"></i>
                <span class="pm-label">{t('Logout Clear')}</span>
              </button>
            </div>
          {/if}

          <div class="pm-foot">
            <nav class="pm-langs" aria-label={t('Language')}>
              {#each languageOptions as option}
                <button
                  type="button"
                  class="pm-lang"
                  class:active={currentLang === option.code}
                  lang={option.code}
                  aria-pressed={currentLang === option.code}
                  on:click={() => pickLanguage(option.code)}>
                  {option.label}
                </button>
              {/each}
            </nav>
            <button
              type="button"
              class="pm-ic"
              on:click={toggleTheme}
              title={$theme === 'dark' ? t('Light Mode') : t('Dark Mode')}
              aria-label={$theme === 'dark' ? t('Light Mode') : t('Dark Mode')}>
              <i class={$theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars'}></i>
            </button>
            {#if permissions?.some((p) => p.code === 'Settings' && p.view)}
              <a
                use:link
                href="/dashboard/settings/main"
                class="pm-ic"
                on:click={() => (profileMenuOpen = false)}
                title={t('Settings')}
                aria-label={t('Settings')}>
                <i class="bi bi-gear"></i>
              </a>
            {/if}
            <button
              type="button"
              class="pm-ic pm-ic-danger"
              on:click={handleLogout}
              title={t('Logout')}
              aria-label={t('Logout')}>
              <i class="bi bi-box-arrow-right"></i>
            </button>
          </div>
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
      width 0.2s ease,
      transform 0.3s ease,
      box-shadow 0.3s ease;
    overflow: visible;
    border-inline-end: 1px solid #0b1530;
    background: #0b1530;
    color: #b7c1db;
    box-shadow: none;
  }

  :global(html.dark) #erp-sidebar,
  :global(html.dark) #erp-sidebar.dashboard-sidebar {
    background: #050a18;
    border-color: #050a18;
    box-shadow: none;
  }

  #erp-sidebar.dashboard-sidebar {
    background: #0b1530;
  }

  .sidebar-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    /* Each section owns the rail gutter (design: 12px) so the shell adds none. */
    padding: 0;
    min-width: 0;
  }

  .sidebar-brand {
    position: relative;
    display: flex;
    gap: 9px;
    align-items: center;
    justify-content: flex-start;
    min-height: 56px;
    padding: 14px 16px 10px;
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
    justify-content: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .brand-toolbar {
    position: static;
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-shrink: 0;
  }

  .sidebar-close-btn {
    display: none;
  }

  @media (min-width: 768px) and (max-width: 1100px) {
    .sidebar-collapse-icon-btn {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .sidebar-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .sidebar-collapse-icon-btn {
      display: none;
    }
  }

  .sidebar-collapse-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    padding: 0;
    border: 1px solid #1b2a52;
    border-radius: 8px;
    background: rgb(19, 32, 66);
    color: rgb(138, 150, 184);
    box-shadow: none;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      color 0.2s ease,
      background 0.2s ease;
  }

  .sidebar-collapse-icon-btn:hover {
    border-color: #26385f;
    background: #1b2a52;
    color: rgb(138, 150, 184);
  }

  .sidebar-collapse-icon-btn:focus-visible {
    outline: 2px solid #2f6fed;
    outline-offset: 2px;
  }

  .sidebar-collapse-icon-btn i {
    margin: 0 !important;
    font-size: 18px;
    line-height: 1;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border: 0;
    border-radius: 9px;
    background: #2f6fed;
    color: #fff;
    font-family: inherit;
    font-size: 16px;
    font-weight: 800;
    line-height: 1;
  }

  .brand-text {
    flex: 0 1 auto;
    min-width: 0;
    line-height: 1.15;
  }

  .brand-name {
    color: #fff;
    font-family: inherit;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: 0.6px;
  }

  .brand-ver {
    margin-top: 0;
    transform: none;
    color: #8a96b8;
    font-family: 'Inter', 'Vazirmatn', system-ui, sans-serif;
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
  }

  .sidebar-pos-row {
    padding: 0 12px 4px;
  }

  .pos-shortcut {
    display: flex;
    gap: 7px;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 38px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: #2f6fed;
    color: #fff;
    box-shadow: 0 8px 18px -8px rgba(47, 111, 237, 0.9);
    font-size: 13px;
    font-weight: 700;
  }

  .pos-shortcut:hover {
    background: #245fcf;
  }

  .pos-shortcut i {
    font-size: 16px;
    line-height: 1;
  }

  .sidebar-group-label {
    flex: 0 0 auto;
    padding: 12px 10px 4px;
    color: #5e6b8e;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }

  .sidebar-group-label:first-child {
    padding-top: 12px;
  }

  .sidebar-menu {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow-y: auto;
    margin-top: 0;
    padding: 2px 12px 10px;
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
    gap: 10px;
    align-items: center;
    flex: 0 0 auto;
    min-height: 38px;
    margin: 0;
    padding: 0 10px;
    border: 0;
    border-radius: 10px !important;
    background: transparent;
    color: #b7c1db;
    font-size: 13px;
    font-weight: 500;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  :global(html.dark) .sidebar-menu {
    scrollbar-width: none;
  }

  :global(html.dark) .sidebar-menu::-webkit-scrollbar-thumb {
    display: none;
  }

  :global(html.dark) .sidebar-menu :global(.list-group-item) {
    color: #b7c1db;
  }

  .sidebar-menu :global(.list-group-item i) {
    width: 20px;
    height: 20px;
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    margin: 0 !important;
    border-radius: 0;
    background: transparent;
    color: inherit;
    font-size: 16px;
    text-align: center;
    transition: color 0.15s ease;
  }

  .sidebar-menu :global(.list-group-item:hover) {
    background: #132042;
    color: #fff;
    transform: none;
  }

  :global(html[dir='ltr']) .sidebar-menu :global(.list-group-item:hover) {
    transform: none;
  }

  .sidebar-menu :global(.list-group-item:hover i),
  .sidebar-menu :global(.list-group-item.active i) {
    background: transparent;
    color: inherit;
  }

  .sidebar-menu :global(.list-group-item.active) {
    background: linear-gradient(90deg, rgba(47, 111, 237, 0.1), rgba(47, 111, 237, 0.32));
    color: #fff;
    font-weight: 700;
    box-shadow: none;
  }

  .sidebar-menu :global(.list-group-item.active)::before {
    content: '';
    position: absolute;
    inset-inline-start: -12px;
    top: 9px;
    bottom: 9px;
    width: 3px;
    border-radius: 3px;
    background: #5b8df6;
  }

  .sidebar-menu :global(.nav-text) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .sidebar-report-group {
    margin-top: 0.08rem;
  }

  .sidebar-report-links {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 2px 0 4px;
    /* Design: the rule sits 19px inside the gutter, the labels 12px after it. */
    margin-inline-start: 19px;
    border-inline-start: 1px solid #1b2a52;
  }

  .sidebar-report-links :global(.list-group-item) {
    color: #8a96b8;
  }

  .sidebar-report-links :global(.list-group-item:hover) {
    color: #fff;
  }

  .sidebar-report-links :global(.list-group-item) {
    min-height: 32px;
    margin: 0;
    padding: 0 12px;
    border-radius: 8px !important;
    font-size: 12.5px;
  }


  #erp-sidebar.collapsed .sidebar-report-links {
    display: none;
  }

  .sidebar-profile {
    position: relative;
    margin-top: 0;
    padding: 6px 12px 10px;
    border-top: 1px solid #1b2a52;
  }

  /* Design: a bare 44px row inside the rail gutter — no card frame; the row
     itself fills on hover/open, with a round brand avatar and a presence dot. */
  .sidebar-profile-trigger {
    display: flex;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #fff;
    text-align: start;
    transition:
      background 0.2s ease,
      color 0.2s ease;
  }

  .sidebar-profile-trigger:hover,
  .sidebar-profile-trigger[aria-expanded='true'] {
    background: #132042;
  }

  .user-avatar {
    position: relative;
    width: 26px;
    height: 26px;
    display: grid;
    flex-shrink: 0;
    place-items: center;
    border-radius: 50%;
    background: var(--erp-primary, #1479df);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
  }

  .user-avatar::after {
    content: '';
    position: absolute;
    bottom: -1px;
    inset-inline-end: -1px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #16a34a;
    border: 2px solid #0b1530;
  }

  :global(html.dark) .user-avatar::after {
    border-color: #050a18;
  }

  .user-meta {
    min-width: 0;
    flex: 1;
    line-height: 1.25;
  }

  .user-meta strong,
  .user-meta small {
    display: block;
  }

  .user-meta strong {
    overflow: hidden;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-meta small {
    color: #8a96b8;
    font-size: 10.5px;
    font-weight: 400;
  }

  .profile-chevron {
    color: #8a96b8;
    font-size: 18px;
  }

  /* Design: a 244px floating panel (rail width + 12px) anchored above the rail
     bottom, holding the greeting header, a grouped row list and the quick actions. */
  .sidebar-profile-menu {
    position: absolute;
    inset-inline-start: calc(100% + 12px);
    bottom: 12px;
    z-index: 60;
    width: 244px;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 18px 40px -18px rgba(11, 21, 48, 0.35);
  }

  :global(html.dark) .sidebar-profile-menu {
    border-color: #263447;
    background: #172033;
    box-shadow: 0 18px 42px -18px rgba(0, 0, 0, 0.6);
  }

  .pm-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 4px 10px;
  }

  .pm-avatar {
    position: relative;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: #0f6efd;
    color: #fff;
    font-size: 13px;
    font-weight: 800;
  }

  .pm-presence {
    position: absolute;
    bottom: -2px;
    inset-inline-end: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 0 2px #fff;
  }

  :global(html.dark) .pm-presence {
    box-shadow: 0 0 0 2px #172033;
  }

  .pm-meta {
    flex: 1;
    min-width: 0;
    line-height: 1.35;
  }

  .pm-meta strong,
  .pm-meta small {
    display: block;
  }

  .pm-meta strong {
    overflow: hidden;
    color: #172033;
    font-size: 12.5px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(html.dark) .pm-meta strong {
    color: #f8fafc;
  }

  .pm-meta small {
    color: #8a98ab;
    font-size: 10.5px;
  }

  .pm-group {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 4px;
    border-radius: 12px;
    background: #f4f6fa;
  }

  :global(html.dark) .pm-group {
    background: #0f172a;
  }

  .pm-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #3f4b5f;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: start;
  }

  .pm-row > i {
    color: #8a98ab;
    font-size: 17px;
  }

  .pm-row:hover {
    background: #fff;
    color: #172033;
  }

  :global(html.dark) .pm-row:hover {
    background: rgba(96, 165, 250, 0.12);
    color: #e5edf7;
  }

  .pm-label {
    flex: 1;
    min-width: 0;
  }

  .pm-value {
    color: #172033;
    font-size: 11.5px;
    font-weight: 700;
  }

  :global(html.dark) .pm-value {
    color: #e5edf7;
  }

  .pm-chevron {
    font-size: 15px;
    color: #94a3b8;
  }

  .pm-row-warn,
  .pm-row-warn > i {
    color: #b45309;
  }

  .pm-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0 0;
  }

  .pm-langs {
    flex: 1;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: #eef1f6;
  }

  :global(html.dark) .pm-langs {
    background: #0f172a;
  }

  .pm-lang {
    flex: 1;
    min-height: 26px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #64748b;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  .pm-lang.active {
    background: #fff;
    color: #172033;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.09);
  }

  :global(html.dark) .pm-lang {
    color: #94a3b8;
  }

  :global(html.dark) .pm-lang.active {
    background: #1e293b;
    color: #f8fafc;
  }

  .pm-ic {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 9px;
    background: #eef1f6;
    color: #3f4b5f;
  }

  :global(html.dark) .pm-ic {
    background: #0f172a;
    color: #cbd5e1;
  }

  .pm-ic:hover {
    background: #e3ecff;
    color: #0f6efd;
  }

  .pm-ic i {
    font-size: 17px;
  }

  .pm-ic-danger {
    color: #dc2626;
  }

  /* On a phone the rail is a drawer, so the panel sits inside it, above the row. */
  @media (max-width: 767px) {
    .sidebar-profile-menu {
      inset-inline-start: 8px;
      inset-inline-end: 8px;
      bottom: 76px;
      width: auto;
    }
  }

  #erp-sidebar.collapsed .sidebar-brand {
    position: static;
    justify-content: space-between;
    gap: 4px;
    min-height: 42px;
    padding: 6px 3px 4px;
  }

  #erp-sidebar.collapsed .brand-main {
    flex: 0 0 auto;
    gap: 0;
  }

  #erp-sidebar.collapsed .brand-ver { display: none; }

  #erp-sidebar.collapsed .brand-text,
  #erp-sidebar.collapsed .sidebar-group-label,
  #erp-sidebar.collapsed .sidebar-pos-row .pos-label {
    display: none;
  }

  #erp-sidebar.collapsed .brand-toolbar {
    position: static;
    display: flex;
    gap: 0;
    transform: none;
  }

  #erp-sidebar.collapsed .pos-shortcut {
    padding-inline: 0;
  }


  #erp-sidebar.collapsed .user-meta,
  #erp-sidebar.collapsed .profile-chevron {
    display: none;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item) {
    justify-content: center;
    gap: 0;
    padding-inline: 0;
    font-size: 0;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.badge),
  #erp-sidebar.collapsed .sidebar-report-chevron {
    display: none;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item i) {
    margin: 0 !important;
    font-size: 16px;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item:hover) {
    transform: none;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item[data-sidebar-label]) {
    position: relative;
  }

  #erp-sidebar.collapsed .sidebar-menu :global(.list-group-item[data-sidebar-label]:hover::after) {
    display: none;
    content: none;
  }

  #erp-sidebar.collapsed .sidebar-profile-trigger {
    justify-content: center;
    padding-inline: 0.45rem;
  }

  :global(html[dir='ltr']) #erp-sidebar {
    left: 0;
    transform: translateX(0);
  }

  @media (max-width: 767px) {
    #erp-sidebar {
      width: min(264px, 86vw) !important;
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

  @media (max-width: 767px) {
    :global(html[dir='rtl']) #erp-sidebar {
      transform: translateX(100%);
    }
    :global(html[dir='rtl']) #erp-sidebar.show {
      transform: translateX(0);
    }
  }
</style>
