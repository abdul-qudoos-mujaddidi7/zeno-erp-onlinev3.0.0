<script>
  import { app_version } from '../config.js';
  import { warehouseApi } from '../api/warehouseApi.js';
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  import { supported, t, setLanguage, isRTL, lang, translate_org_type, settings_all } from '../i18n/i18n';
  import { location, querystring, link } from 'svelte-spa-router';
  import { auth } from '../auth/authStore';
  import { userApi } from '../api/userApi.js';
  import { accountApi } from '../api/accountApi.js';
  import InstallPwaButton from './InstallPwaButton.svelte';

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
  $: enable_services = $settings_all.find((s) => s.key === 'enable_services')?.value == 1;
  $: enable_visitor = $settings_all.find((s) => s.key === 'enable_visitor')?.value == 1;

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
      const storedTheme = localStorage.getItem('theme') || document.documentElement.dataset.mdbTheme || 'light';
      dark = storedTheme === 'dark';
      applyTheme(storedTheme);
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

  function applyTheme(themeVal) {
    document.documentElement.dataset.mdbTheme = themeVal;
    document.documentElement.classList.toggle('dark', themeVal === 'dark');
    document.documentElement.classList.toggle('light', themeVal === 'light');
    document.documentElement.style.colorScheme = themeVal;
    localStorage.setItem('theme', themeVal);
    // persist to server
    try {
      const userID = parseInt(localStorage.getItem('user_id'));
      if (userID) {
        userApi.update(userID, { theme: themeVal }).catch((e) => console.warn('Failed to save theme locally', e));
      }
    } catch (e) {}
  }

  function toggleTheme() {
    applyTheme(dark ? 'dark' : 'light');
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
  $: locPath = loc.split('?')[0];
  $: selectedWarehouseId = loc && loc.startsWith('/dashboard/warehouse/') ? loc.split('/').pop() : null;
  $: selectedAccountId = loc && loc.startsWith('/dashboard/account/') ? loc.split('/').pop() : null;

  let currentWarehouse = null;
  let currentAccount = null;

  function getLocalizedName(item, fallback = '') {
    if (!item) return fallback;
    if (t('Lang') === 'fa') return item.name_fa || item.name || fallback;
    if (t('Lang') === 'ps') return item.name_ps || item.name || fallback;
    return item.name || fallback;
  }

  $: if (selectedWarehouseId) {
    warehouseApi
      .getById(Number(selectedWarehouseId))
      .then((w) => (currentWarehouse = w?.data || null))
      .catch(() => (currentWarehouse = null));
  } else {
    currentWarehouse = null;
  }

  $: if (selectedAccountId) {
    accountApi
      .getById(Number(selectedAccountId))
      .then((a) => (currentAccount = a?.data || null))
      .catch(() => (currentAccount = null));
  } else {
    currentAccount = null;
  }
  $: locQuery = $querystring || '';
  $: accountViewTab = new URLSearchParams(locQuery).get('tab') || 'info';
  $: salesTab = (() => {
    const tab = new URLSearchParams(locQuery).get('tab');

    return ['products', ...(enable_visitor ? ['visitors'] : [])].includes(tab) ? tab : 'sales';
  })();
  $: pageKey = (function () {
    // if dashboard/accounts/5, extract accounts part and show "Accounts - View"
    if (locPath.startsWith('/dashboard/account/') && locPath.split('/').length === 4) {
      const accountId = locPath.split('/').pop();
      const accountHref = (tab) => `/#/dashboard/account/${accountId}${tab === 'info' ? '' : `?tab=${tab}`}`;
      return `
          <ul class="navbar-nav me-auto stock-top-tabs">
            <li class="nav-item stock-top-tabs__icon">
              <i class="bi bi-person"></i>
              <strong class="topbar-account-name">${getLocalizedName(currentAccount)}</strong>
            </li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'info' ? 'active' : ''} py-0" href="${accountHref('info')}">
                <small>${t('Overview')}</small>
              </a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'documents' ? 'active' : ''} py-0" href="${accountHref('documents')}"><small>${t('Documents')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'journals' ? 'active' : ''} py-0" href="${accountHref('journals')}"><small>${t('Journals')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'exchanges' ? 'active' : ''} py-0" href="${accountHref('exchanges')}"><small>${t('Exchanges')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'financial-report' ? 'active' : ''} py-0" href="${accountHref('financial-report')}">
                <small>${t('Financial Report')}</small>
              </a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'bills' ? 'active' : ''} py-0" href="${accountHref('bills')}"><small>${t('Bills')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${accountViewTab === 'products' ? 'active' : ''} py-0" href="${accountHref('products')}"><small>${enable_services ? t('Products & Services Report') : t('Products Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if (locPath.startsWith('/dashboard/accounts/') && locPath.split('/').length === 4) {
      // add back button and icon for account view
      return `
          <ul class="navbar-nav me-auto">
            <li class="nav-item">
              <i class="bi bi-people"></i>
              </li>
            <li class="nav-item">
              <a class="nav-link ${locPath === '/dashboard/accounts/list' ? 'active' : ''} py-0" href="/#/dashboard/accounts/list"><small>${t('Accounts')}</small></a>
            </li>

            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${locPath === '/dashboard/accounts/report' ? 'active' : ''} py-0" href="/#/dashboard/accounts/report"><small>${t('Report')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center">
  <div class="nav-divider"></div>
</li>
            <li class="nav-item">
              <a class="nav-link ${locPath === '/dashboard/accounts/general-report' ? 'active' : ''} py-0" href="/#/dashboard/accounts/general-report"><small>${t('General Report')}</small></a>
            </li>
          </ul>
          `;
    }

    if (locPath.startsWith('/dashboard/exchanges/') && locPath.split('/').length === 4) {
      return `
          <ul class="navbar-nav me-auto stock-top-tabs">
            <li class="nav-item stock-top-tabs__icon"><i class="bi bi-currency-exchange"></i></li>
            <li class="nav-item">
              <a class="nav-link ${locPath === '/dashboard/exchanges/list' ? 'active' : ''} py-0" href="/#/dashboard/exchanges/list">
                <small>${t('Exchanges')}</small>
              </a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${locPath === '/dashboard/exchanges/report' ? 'active' : ''} py-0" href="/#/dashboard/exchanges/report">
                <small>${t('Report')}</small>
              </a>
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
    if (loc === '/dashboard/stock' || loc.startsWith('/dashboard/stock/')) {
      const stockTab = loc === '/dashboard/stock' ? 'products' : loc.split('/').pop();
      return `<ul class="navbar-nav me-auto stock-top-tabs">
          <li class="nav-item stock-top-tabs__icon">
            <i class="bi bi-box-seam"></i>
          </li>
          <li class="nav-item">
            <a class="nav-link ${stockTab === 'products' ? 'active' : ''} py-0" href="/#/dashboard/stock/products"><small>${t('Products')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${stockTab === 'warehouses' ? 'active' : ''} py-0" href="/#/dashboard/stock/warehouses"><small>${t('Warehouses')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${stockTab === 'returns' ? 'active' : ''} py-0" href="/#/dashboard/stock/returns"><small>${t('Returns')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${stockTab === 'wastes' ? 'active' : ''} py-0" href="/#/dashboard/stock/wastes"><small>${t('Wastes')}</small></a>
          </li>
        </ul>`;
    }

    if (loc.startsWith('/dashboard/product-form/')) {
      const isNewProduct = loc.endsWith('/new');
      return `<ul class="navbar-nav me-auto stock-top-tabs">
          <li class="nav-item stock-top-tabs__icon"><i class="bi bi-box-seam"></i></li>
          <li class="nav-item">
            <a class="nav-link active py-0" href="javascript:void(0)"><small>${isNewProduct ? 'محصول جدید' : t('Update Product')}</small></a>
          </li>
        </ul>`;
    }

    if (loc.startsWith('/dashboard/product/')) {
      const productParts = loc.split('/');
      const productId = productParts[3];
      const productTab = productParts[4] || 'overview';
      const productBase = `/#/dashboard/product/${productId}`;
      return `<ul class="navbar-nav me-auto stock-top-tabs">
          <li class="nav-item stock-top-tabs__icon"><i class="bi bi-box-seam"></i></li>
          <li class="nav-item">
            <a class="nav-link ${productTab === 'overview' ? 'active' : ''} py-0" href="${productBase}/overview"><small>${t('Product')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${productTab === 'buy' ? 'active' : ''} py-0" href="${productBase}/buy"><small>${t('Buy')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${productTab === 'sale' ? 'active' : ''} py-0" href="${productBase}/sale"><small>${t('Sale')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${productTab === 'warehouses' ? 'active' : ''} py-0" href="${productBase}/warehouses"><small>${t('Warehouses')}</small></a>
          </li>
          <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
          <li class="nav-item">
            <a class="nav-link ${productTab === 'report' ? 'active' : ''} py-0" href="${productBase}/report"><small>${t('Report')}</small></a>
          </li>
        </ul>`;
    }

    if (loc.startsWith('/dashboard/warehouse/')) {
      return `<ul class="navbar-nav me-auto stock-top-tabs">
          <li class="nav-item stock-top-tabs__icon"><i class="bi bi-building"></i></li>
          <li class="nav-item">
            <a class="nav-link active py-0" href="javascript:void(0)">
              <small>${t('Warehouse Products')}</small>
              <strong>${getLocalizedName(currentWarehouse, t('Unknown Warehouse'))}</strong>
            </a>
          </li>
        </ul>`;
    }

    switch (loc) {
      case '/dashboard':
        return '<i class="bi bi-speedometer2 me-2"></i> ' + t('Dashboard');
      case '/dashboard/sales': {
        return `<ul class="navbar-nav me-auto stock-top-tabs">
            <li class="nav-item stock-top-tabs__icon">
              <i class="bi bi-cart-check"></i>
            </li>
            <li class="nav-item">
              <a class="nav-link ${salesTab === 'sales' ? 'active' : ''} py-0" href="/#/dashboard/sales"><small>${t('Sales')}</small></a>
            </li>
            <li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${salesTab === 'products' ? 'active' : ''} py-0" href="/#/dashboard/sales?tab=products"><small>${t('Products Report')}</small></a>
            </li>
            ${enable_visitor ? `<li class="nav-item d-flex align-items-center"><div class="nav-divider"></div></li>
            <li class="nav-item">
              <a class="nav-link ${salesTab === 'visitors' ? 'active' : ''} py-0" href="/#/dashboard/sales?tab=visitors"><small>${t('Visitor Report')}</small></a>
            </li>` : ''}
          </ul>`;
      }
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

<nav class="navbar navbar-expand navbar-light erp-topbar" class:dashboard-topbar={loc === '/dashboard'}>
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
      <InstallPwaButton />

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

<nav
  class="navbar d-md-none navbar-expand mobile-page-nav overflow-x-auto"
  class:dashboard-topbar={loc === '/dashboard'}>
  <div class="container-fluid">
    {@html pageKey}
  </div>
</nav>

<style>
  .erp-topbar {
    position: sticky;
    top: 0;
    z-index: 1020;
    flex-shrink: 0;
    min-height: var(--topbar-height, 3.25rem);
    border-bottom: 1px solid var(--erp-surface-glass-border);
    background-color: var(--erp-bg);
    box-shadow: 0 5px 18px rgba(21, 32, 51, 0.035);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .erp-topbar > .container-fluid {
    padding-inline: var(--page-padding-x, 1.25rem);
    min-width: 0;
  }

  .erp-topbar.dashboard-topbar,
  .mobile-page-nav.dashboard-topbar {
    background-color: var(--erp-bg);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .topbar-page-title {
    min-width: 0;
    color: #172033;
    font-size: var(--topbar-title-size, 1.15rem);
    font-weight: 900;
    overflow: hidden;
    white-space: nowrap;
  }

  :global(.topbar-page-title .navbar-nav) {
    align-items: center;
    gap: 0.2rem;
    flex-wrap: nowrap;
  }

  :global(.topbar-page-title .nav-link.active) {
    color: #2f6fed !important;
    font-weight: 800;
  }

  :global(.topbar-account-name) {
    max-width: 12rem;
    overflow: hidden;
    margin-inline-start: 0.35rem;
    color: #172033;
    font-size: var(--control-font, 0.82rem);
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-actions,
  .mobile-actions {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    min-width: 0;
  }

  .topbar-actions {
    margin-inline-start: auto;
    min-width: 0;
    justify-content: flex-end;
  }

  .erp-icon-btn,
  .sync-indicator .sync-btn {
    width: var(--control-height-sm, 2.125rem);
    height: var(--control-height-sm, 2.125rem);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid #e1e7ef;
    border-radius: 9px;
    background: #fff;
    color: #526176;
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .erp-icon-btn:hover {
    transform: translateY(-1px);
    border-color: #c4d4ec;
    background: #f4f7fb;
    color: #2f6fed;
    box-shadow: 0 5px 12px rgba(21, 32, 51, 0.05);
  }

  .sync-status small {
    font-size: var(--app-font-xs, 0.75rem);
  }

  .sync-progress {
    width: min(7.5rem, 18vw);
  }

  .version-pill {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    padding: 0.28rem 0.5rem;
    border: 1px solid #ccebdd;
    border-radius: 8px;
    background: #edf9f3;
    color: #11875d;
    font-weight: 850;
  }

  .version-pill small {
    font-size: var(--app-font-xs, 0.75rem);
  }

  .language-select {
    width: clamp(5.5rem, 8vw, 6.75rem);
    border-color: #e2e8f0;
    border-radius: 9px;
    color: #334155;
    font-weight: 700;
  }

  .user-chip {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    padding: 0.15rem 0.3rem;
    border: 1px solid #e2e8f0;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    text-decoration: none;
    max-width: 100%;
    min-width: 0;
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
    width: 1.75rem;
    height: 1.75rem;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 999px;
    background: #eff6ff;
    color: #0f6efd;
    font-size: 0.85rem;
    font-weight: 900;
  }

  .user-meta {
    line-height: 1.1;
    padding-inline-end: 0.3rem;
    min-width: 0;
  }

  .user-meta strong,
  .user-meta small {
    display: block;
  }

  .user-meta strong {
    max-width: 7.5rem;
    overflow: hidden;
    color: #0f172a;
    font-size: var(--control-font, 0.82rem);
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-meta small {
    color: #94a3b8;
    font-size: clamp(0.62rem, 0.6vw, 0.68rem);
    font-weight: 700;
  }

  .mobile-page-nav {
    margin: 0.5rem 0.75rem 0;
    border: 1px solid var(--erp-surface-glass-border);
    border-radius: 10px;
    background-color: var(--erp-bg);
    box-shadow: 0 8px 24px rgba(21, 32, 51, 0.045);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  :global(.mobile-page-nav .navbar-nav) {
    flex-wrap: nowrap;
    align-items: center;
    white-space: nowrap;
  }

  :global(.mobile-page-nav .nav-link.active) {
    color: #2f6fed !important;
    font-weight: 850;
  }

  @media (max-width: 991px) {
    .topbar-actions {
      gap: 0.35rem;
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
      padding-inline: var(--page-padding-x, 0.75rem);
    }
  }

  @media (max-width: 575px) {
    .sync-status {
      display: none;
    }

    .mobile-actions {
      gap: 0.35rem;
    }

    .user-chip {
      padding: 0.2rem;
    }
  }
</style>
