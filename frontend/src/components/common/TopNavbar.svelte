<script>
  import { app_version } from '../config.js';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  import { supported, t, setLanguage, isRTL, lang, translate_org_type, settings_all } from '../i18n/i18n';
  import { location, link } from 'svelte-spa-router';
  import { auth } from '../auth/authStore';

  $: _lang = $lang;
  $: _translate_org_type = $translate_org_type;

  const dispatch = createEventDispatcher();

  let dark = false;
  let rtl = false;

  let mdbCss;
  let mdbRtlCss;
  let shiftPressed = false;
  let ctrlPressed = false;

  $: enable_generics = $settings_all.find((s) => s.key === 'enable_generics')?.value == 1;
  $: enable_brands = $settings_all.find((s) => s.key === 'enable_brands')?.value == 1;

  $: enable_account_groups = $settings_all.find((s) => s.key === 'enable_account_groups')?.value == 1;

  // get shift key status for sidebar toggle
  function handleKeyDown(e) {
    if (e.key === 'Shift') shiftPressed = true;
    if (e.key === 'Control') ctrlPressed = true;
  }
  function handleKeyUp(e) {
    if (e.key === 'Shift') shiftPressed = false;
    if (e.key === 'Control') ctrlPressed = false;
  }

  import { logout, logoutClear } from '../auth/authService.js';
import { userApi } from '../../api/userApi.js';

  onMount(async () => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    mdbCss = document.getElementById('mdb-css');
    mdbRtlCss = document.getElementById('mdb-rtl-css');

    // initialize language and theme from storage
    try {
      const storedLang = localStorage.getItem('lang') || 'en';
      setLanguage(storedLang);
      currentLang = storedLang;
      const shouldRtl = isRTL(storedLang);
      rtl = shouldRtl;
      toggleRTL();
    } catch (e) {}

    try {
      dark = false;
      toggleTheme();
    } catch (e) {}

    setTimeout(() => {
      if (window.mdb) {
        const collapseEl = document.getElementById('navbarSupportedContent');

        if (collapseEl) {
          const navbarCollapse = new window.mdb.Collapse(collapseEl);

          // OPTIONAL: store it if you want to control it later
          window._navbarCollapse = navbarCollapse;
        }
        document.querySelectorAll('[data-mdb-input-init]').forEach((el) => {
          new window.mdb.Input(el);
        });
        document.querySelectorAll('.dropdown-toggle').forEach((el) => {
          new window.mdb.Dropdown(el);
        });
      }
    }, 50);
  });

  function toggleTheme() {
    const themeVal = dark ? 'dark' : 'light';
    document.documentElement.dataset.mdbTheme = themeVal;
    localStorage.setItem('theme', themeVal);
    // persist to server
    try {
      const userID = parseInt(localStorage.getItem('user_id'));
      if (userID) {
        userApi.update(userID, { theme: themeVal }).catch((e) => console.warn('Failed to save theme locally', e));
      }
    } catch (e) {}
  }

  function toggleRTL() {
    if (!mdbCss || !mdbRtlCss) return;

    if (rtl) {
      document.documentElement.dir = 'rtl';
      mdbCss['disabled'] = true;
      mdbRtlCss['disabled'] = false;
    } else {
      document.documentElement.dir = 'ltr';
      mdbCss['disabled'] = false;
      mdbRtlCss['disabled'] = true;
    }
  }

  let currentLang = localStorage.getItem('lang') || 'en';

  // derive current page title from route
  $: loc = $location ? $location.replace(/\/+$/g, '') : '';
  $: pageKey = (function () {
    // if dashboard/accounts/5, extract accounts part and show "Accounts - View"
    if (loc.startsWith('/dashboard/account/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `<button class="btn btn-sm btn-outline-secondary me-2" onclick="window.history.back()" title="${t('Back')}">
          <i class="bi bi-arrow-${t('dir') == 'ltr' ? 'left' : 'right'}"></i>
        </button>
        <i class="bi bi-wallet me-2"></i> ${t('Show Account')}`;
    }

    if (loc.startsWith('/dashboard/accounts/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-people"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/accounts/list') ? 'active' : ''} py-0" href="/#/dashboard/accounts/list"><small>${t('Accounts')}</small></a>
            </li>

            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/accounts/report') ? 'active' : ''} py-0" href="/#/dashboard/accounts/report"><small>${t('Report')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/accounts/general-report') ? 'active' : ''} py-0" href="/#/dashboard/accounts/general-report"><small>${t('General Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if (loc.startsWith('/dashboard/master-exchanges/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-safe"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/master-exchanges/list') ? 'active' : ''} py-0" href="/#/dashboard/master-exchanges/list"><small>${t('Master Exchanges')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/master-exchanges/purchases') ? 'active' : ''} py-0" href="/#/dashboard/master-exchanges/purchases"><small>${t('Purchases')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/master-exchanges/sales') ? 'active' : ''} py-0" href="/#/dashboard/master-exchanges/sales"><small>${t('Sales')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/master-exchanges/pos') ? 'active' : ''} py-0" href="/#/dashboard/master-exchanges/pos"><small>${t('POS')}</small></a>
            </li>
          </ul>
          `;
    }

    
    if (loc.startsWith('/dashboard/apartments/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-building-fill"></i>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/list') ? 'active' : ''} py-0" href="/#/dashboard/apartments/list"><small>${t('Apartments')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/floors') ? 'active' : ''} py-0" href="/#/dashboard/apartments/floors"><small>${t('Floors')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/buildings') ? 'active' : ''} py-0" href="/#/dashboard/apartments/buildings"><small>${t('Buildings')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/leases') ? 'active' : ''} py-0" href="/#/dashboard/apartments/leases"><small>${t('Leases')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/rent-invoices') ? 'active' : ''} py-0" href="/#/dashboard/apartments/rent-invoices"><small>${t('Rent Invoices')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/meters') ? 'active' : ''} py-0" href="/#/dashboard/apartments/meters"><small>${t('Meters')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/meter-readings') ? 'active' : ''} py-0" href="/#/dashboard/apartments/meter-readings"><small>${t('Meter Readings')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/apartments/records') ? 'active' : ''} py-0" href="/#/dashboard/apartments/records"><small>${t('Inventory Records')}</small></a>
            </li>
          </ul>`;
    }

    if (loc.startsWith('/dashboard/transfers/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-arrow-left-right"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/transfers/list') ? 'active' : ''} py-0" href="/#/dashboard/transfers/list"><small>${t('Transfers')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/transfers/incoming') ? 'active' : ''} py-0" href="/#/dashboard/transfers/incoming"><small>${t('Incoming Transfers')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/transfers/outgoing') ? 'active' : ''} py-0" href="/#/dashboard/transfers/outgoing"><small>${t('Outgoing Transfers')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/transfers/report') ? 'active' : ''} py-0" href="/#/dashboard/transfers/report"><small>${t('Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if (loc.startsWith('/dashboard/sale-form/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-shop"></i>
            </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Sale Form')}</small></a>
            </li>
          </ul>
          `;
    }

    if (loc.startsWith('/dashboard/purchase-form/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-cart-plus"></i>
            </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Purchase Form')}</small></a>
            </li>
          </ul>
          `;
    }
    if (loc.startsWith('/dashboard/journals/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-journal-text"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/journals/list') ? 'active' : ''} py-0" href="/#/dashboard/journals/list"><small>${t('Journals')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/journals/report') ? 'active' : ''} py-0" href="/#/dashboard/journals/report"><small>${t('Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if (loc.startsWith('/dashboard/appointments/') && loc.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-calendar-event"></i>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/appointments/list') ? 'active' : ''} py-0" href="/#/dashboard/appointments/list"><small>${t('Appointments')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/appointments/report') ? 'active' : ''} py-0" href="/#/dashboard/appointments/report"><small>${t('Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if ((loc.startsWith('/dashboard/settings/') && loc.split('/').length === 4) || loc === '/dashboard/subscription') {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-gear"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${loc.startsWith('/dashboard/settings/main') ? 'active' : ''} py-0" href="/#/dashboard/settings/main"><small>${t('Main Settings')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${!loc.startsWith('/dashboard/settings/main') && loc.startsWith('/dashboard/settings/') ? 'active' : ''} py-0" href="/#/dashboard/settings/departments"><small>${t('System Settings')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
              <div class="nav-divider"></div>
            </li>
            <li class="nav-item">
              <a class="nav-link ${!loc.startsWith('/dashboard/subscription') && loc.startsWith('/dashboard/subscription/') ? 'active' : ''} py-0" href="/#/dashboard/subscription"><small>${t('Subscription')}</small></a>
            </li>
          </ul>
          `;
    }
    switch (loc) {
      case '/dashboard':
        return '<i class="bi bi-speedometer2 me-2"></i> ' + t('Dashboard');
      case '/dashboard/sales':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-cart-check"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Sales')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/prescriptions':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-prescription"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Prescriptions')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/pos':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-shop"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('POS')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/purchases':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-bag-plus"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Purchases')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/work-centers':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-person-workspace"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Work Centers')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/boms':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-receipt"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Bill of Materials')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/stock':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-box-seam"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Products')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/services':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-person-vcard"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Services')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/stock-transactions':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-box2"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Stock Transactions')}</small></a>
            </li>
          </ul>`;
      case '/dashboard/users':
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-person-badge"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('Users')}</small></a>
            </li>
          </ul>`;
      default:
        return `<ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-rocket-takeoff"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link active py-0" href="javascript:void(0)"><small>${t('app.title')}</small></a>
            </li>
          </ul>`;
    }
  })();

  // reflect store
  const unsubscribeLang = lang.subscribe((v) => (currentLang = v));

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    unsubscribeLang();
  });
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  async function changeLanguage(code) {
    setLanguage(code);
    const shouldRtl = isRTL(code);
    rtl = shouldRtl;
    toggleRTL();
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
</script>

<nav class="navbar navbar-expand navbar-light erp-topbar">
  <div class="container-fluid gap-2">
    <span class="d-lg-none mobile-actions">
      <button
        class="btn btn-light erp-icon-btn"
        on:click={() => dispatch('toggleSidebar')}
        aria-label="Toggle sidebar"
        title="Toggle sidebar">
        <i class="bi bi-list"></i>
      </button>
      <a
        use:link
        href="/pos"
        class="btn btn-outline-primary px-2 {_translate_org_type == 'exchange' ? 'd-none' : ''}"
        style="padding-left:10px !important;padding-right:10px !important;"
        class:active={$location === '/pos'}>
        POS
      </a>
    </span>

    <div class="topbar-page-title d-none d-md-block" id="">
      {@html pageKey}
    </div>
    <div class="topbar-actions">
      <div class="form-check form-switch d-none">
        <input id="rtlToggle" type="checkbox" bind:checked={rtl} on:change={toggleRTL} aria-label="Toggle RTL" />
        <label class="form-check-label" for="rtlToggle">RTL</label>
      </div>
      <div class="version-pill">
        <i class="bi bi-check-circle-fill"></i>
        <small>{app_version}</small>
      </div>

      <button class="btn btn-sm btn-light erp-icon-btn" title="Notifications" type="button">
        <i class="bi bi-bell"></i>
      </button>

      <button class="btn btn-sm btn-light erp-icon-btn" title="Fullscreen" on:click={toggleFullscreen}>
        <i class="bi bi-arrows-fullscreen"></i>
      </button>

    </div>
  </div>
</nav>

<nav class="navbar d-md-none navbar-expand mobile-page-nav overflow-x-auto">
  <div class="container-fluid">
    {@html pageKey}
  </div>
</nav>


<style>
  .erp-topbar {
    position: sticky;
    top: 0;
    z-index: 1020;
    min-height: 58px;
    border-bottom: 1px solid #e5eaf2;
    background: #fff;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.035);
    backdrop-filter: none;
  }

  .topbar-page-title {
    min-width: 0;
    color: #0f172a;
    font-weight: 850;
    overflow: hidden;
    white-space: nowrap;
  }

  :global(.topbar-page-title .navbar-nav) {
    align-items: center;
    gap: 0.2rem;
    flex-wrap: nowrap;
  }

  :global(.topbar-page-title .nav-link.active) {
    color: #0f6efd !important;
    font-weight: 800;
  }

  .topbar-actions,
  .mobile-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .topbar-actions {
    margin-inline-start: auto;
    min-width: 0;
    justify-content: flex-end;
  }

  .erp-icon-btn,
  .sync-indicator .sync-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    border-radius: 0.65rem;
    background: #fff;
    color: #475569;
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .erp-icon-btn:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    color: #0f6efd;
    box-shadow: none;
  }

  .sync-status small {
    font-size: 0.78rem;
  }

  .sync-progress {
    width: 120px;
  }

  .version-pill {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    padding: 0.32rem 0.55rem;
    border: 1px solid #dcfce7;
    border-radius: 999px;
    background: #f0fdf4;
    color: #15803d;
    font-weight: 850;
  }

  .version-pill small {
    font-size: 0.78rem;
  }

  .language-select {
    width: 106px;
    border-color: #e2e8f0;
    border-radius: 0.65rem;
    color: #334155;
    font-weight: 700;
  }

  .user-chip {
    display: inline-flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.2rem 0.35rem;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    text-decoration: none;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
  }

  .user-chip:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    box-shadow: none;
  }

  .user-avatar {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 0.9rem;
    font-weight: 900;
  }

  .user-meta {
    line-height: 1.1;
    padding-inline-end: 0.3rem;
  }

  .user-meta strong,
  .user-meta small {
    display: block;
  }

  .user-meta strong {
    max-width: 120px;
    overflow: hidden;
    color: #0f172a;
    font-size: 0.82rem;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-meta small {
    color: #94a3b8;
    font-size: 0.68rem;
    font-weight: 700;
  }

  .mobile-page-nav {
    margin: 0.5rem 0.75rem 0;
    border: 1px solid #e5eaf2;
    border-radius: 0.8rem;
    background: #fff;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.035);
  }

  :global(.mobile-page-nav .navbar-nav) {
    flex-wrap: nowrap;
    align-items: center;
    white-space: nowrap;
  }

  :global(.mobile-page-nav .nav-link.active) {
    color: #0f6efd !important;
    font-weight: 850;
  }

  @media (max-width: 991px) {
    .erp-topbar {
      min-height: 56px;
    }

    .topbar-actions {
      gap: 0.4rem;
    }
  }

  @media (max-width: 767px) {
    .sync-indicator,
    .version-pill,
    .topbar-actions > .erp-icon-btn[title='Notifications'] {
      display: none !important;
    }

    .topbar-actions {
      margin-inline-start: 0;
    }

    .erp-topbar .container-fluid {
      justify-content: space-between;
    }
  }

  @media (max-width: 575px) {
    .sync-status {
      display: none;
    }

    .erp-topbar {
      min-height: 54px;
    }

    .mobile-actions {
      gap: 0.35rem;
    }

    .user-chip {
      padding: 0.2rem;
    }
  }
</style>
