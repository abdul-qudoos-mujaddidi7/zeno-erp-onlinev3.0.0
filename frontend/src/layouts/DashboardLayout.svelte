<script>
  import { location } from 'svelte-spa-router';
  import Sidebar from '../components/Sidebar.svelte';
  import Topbar from '../components/Topbar.svelte';
  import AsyncPage from '../components/AsyncPage.svelte';
  import { auth } from '../auth/authStore';
  import { push } from 'svelte-spa-router';
  import { onMount } from 'svelte';
  import { setLanguage, isRTL, lang } from '../i18n/i18n';
  import { applyMdbStylesheet } from '../lib/mdbTheme.js';

  const loadDashboard = () => import('../pages/Dashboard.svelte');
  const loadDashboard2 = () => import('../pages/Dashboard2.svelte');
  const loadTreasury = () => import('../pages/Treasury.svelte');
  const loadAccountView = () => import('../pages/accounts/AccountView.svelte');
  const loadAppointmentView = () => import('../pages/hospital/appointments/AppointmentView.svelte');
  const loadAccounts = () => import('../pages/Accounts.svelte');
  const loadAccountTypes = () => import('../pages/accounts/AccountTypes.svelte');
  const loadPatients = () => import('../pages/Patients.svelte');
  const loadApartments = () => import('../pages/Apartments.svelte');
  const loadPatientTypes = () => import('../pages/hospital/patients/PatientTypes.svelte');
  const loadJournals = () => import('../pages/Journals.svelte');
  const loadAppointments = () => import('../pages/Appointments.svelte');
  const loadExchanges = () => import('../pages/Exchanges.svelte');
  const loadMasterExchanges = () => import('../pages/MasterExchanges.svelte');
  const loadMoneyTransfers = () => import('../pages/MoneyTransfers.svelte');
  const loadCurrencies = () => import('../pages/settings/Currencies.svelte');
  const loadSales = () => import('../pages/Sales.svelte');
  const loadSaleView = () => import('../pages/sales/SaleView.svelte');
  const loadInventoryRecordView = () => import('../pages/inventory_records/InventoryRecordView.svelte');
  const loadSaleForm = () => import('../pages/sales/SaleForm.svelte');
  const loadInventoryRecordForm = () => import('../pages/inventory_records/InventoryRecordForm.svelte');
  const loadPrescriptions = () => import('../pages/hospital/Prescriptions.svelte');
  const loadLabTests = () => import('../pages/hospital/LabTests.svelte');
  const loadPrescriptionView = () => import('../pages/hospital/prescriptions/PrescriptionView.svelte');
  const loadPrescriptionForm = () => import('../pages/hospital/prescriptions/PrescriptionForm.svelte');
  const loadProductions = () => import('../pages/manufacturing/Productions.svelte');
  const loadProductionView = () => import('../pages/manufacturing/productions/ProductionView.svelte');
  const loadProductionForm = () => import('../pages/manufacturing/productions/ProductionForm.svelte');
  const loadWarehouseView = () => import('../pages/products/WarehouseView.svelte');
  const loadDepartmentView = () => import('../pages/hospital/DepartmentView.svelte');
  const loadStockTransfers = () => import('../pages/StockTransfers.svelte');
  const loadStockTransferView = () => import('../pages/stocktransfers/StockTransferView.svelte');
  const loadStockTransferForm = () => import('../pages/stocktransfers/StockTransferForm.svelte');
  const loadPOS = () => import('../pages/POS.svelte');
  const loadPurchases = () => import('../pages/Purchases.svelte');
  const loadPurchaseView = () => import('../pages/purchases/PurchaseView.svelte');
  const loadPurchaseForm = () => import('../pages/purchases/PurchaseForm.svelte');
  const loadWastes = () => import('../pages/Wastes.svelte');
  const loadWasteView = () => import('../pages/wastes/WasteView.svelte');
  const loadStock = () => import('../pages/Stock.svelte');
  const loadServicesIndex = () => import('../pages/products/ServicesIndex.svelte');
  const loadStockTransactions = () => import('../pages/StockTransactions.svelte');
  const loadProductForm = () => import('../pages/products/ProductForm.svelte');
  const loadProduct = () => import('../pages/Product.svelte');
  const loadReports = () => import('../pages/Reports.svelte');
  const loadSettings = () => import('../pages/Settings.svelte');
  const loadSubscription = () => import('../pages/Subscription.svelte');
  const loadUsers = () => import('../pages/Users.svelte');
  const loadWorkCenters = () => import('../pages/manufacturing/WorkCenters.svelte');
  const loadBoms = () => import('../pages/manufacturing/Boms.svelte');
  const loadBOMView = () => import('../pages/manufacturing/boms/BOMView.svelte');
  const loadBOMForm = () => import('../pages/manufacturing/boms/BOMForm.svelte');
  const loadInventoryRecords = () => import('../pages/InventoryRecords.svelte');

  function applyLanguageDirection(code) {
    if (typeof document === 'undefined') return;
    const shouldRtl = isRTL(code);
    document.documentElement.dir = shouldRtl ? 'rtl' : 'ltr';
    applyMdbStylesheet(shouldRtl);
  }

  onMount(() => {
    if (!$auth || !$auth.isAuthenticated) {
      push('/login');
    }
    try {
      const storedLang = localStorage.getItem('lang') || 'en';
      setLanguage(storedLang);
      applyLanguageDirection(storedLang);
    } catch (e) {}
    try {
      const theme = localStorage.getItem('theme') || 'light';
      document.documentElement.dataset.mdbTheme = theme;
    } catch (e) {}
  });

  $: loc = $location ? $location.replace(/\/+$/g, '') : '';
  $: locPath = loc.split('?')[0];
  $: currentLang = $lang;
  $: applyLanguageDirection(currentLang);

  $: accountId = locPath && locPath.startsWith('/dashboard/account/') ? locPath.split('/').pop() : null;

  $: appointmentID = loc && loc.startsWith('/dashboard/appointment/') ? loc.split('/').pop() : null;

  $: accountPage = loc && loc.startsWith('/dashboard/accounts/') ? loc.split('/').pop() : null;

  $: patientId = loc && loc.startsWith('/dashboard/patient/') ? loc.split('/').pop() : null;

  $: patientPage = loc && loc.startsWith('/dashboard/patients/') ? loc.split('/').pop() : null;

  $: apartmentPage = loc && loc.startsWith('/dashboard/apartments/') ? loc.split('/').pop() : null;

  $: journalPage = loc && loc.startsWith('/dashboard/journals/') ? loc.split('/').pop() : null;

  $: appointmentPage = loc && loc.startsWith('/dashboard/appointments/') ? loc.split('/').pop() : null;

  $: masterExchangePage = loc && loc.startsWith('/dashboard/master-exchanges/') ? loc.split('/').pop() : null;

  $: transferPage = loc && loc.startsWith('/dashboard/transfers/') ? loc.split('/').pop() : null;

  $: exchangePage = loc && loc.startsWith('/dashboard/exchanges/') ? loc.split('/').pop() : null;

  $: settingPage = loc && loc.startsWith('/dashboard/settings/') ? loc.split('/').pop() : null;

  $: stockPage = loc && loc.startsWith('/dashboard/stock/') ? loc.split('/').pop() : 'products';

  $: productRouteParts = loc && loc.startsWith('/dashboard/product/') ? loc.split('/') : [];
  $: productId = productRouteParts[3] || null;
  $: productPage = productRouteParts[4] || 'overview';

  $: stocktransferId = loc && loc.startsWith('/dashboard/stock-transfers/') ? loc.split('/').pop() : null;

  $: purchaseId = loc && loc.startsWith('/dashboard/purchases/') ? loc.split('/').pop() : null;

  $: purchaseFormId = loc && loc.startsWith('/dashboard/purchase-form/') ? loc.split('/').pop() : null;

  $: purchaseFormAccountId = loc && loc.startsWith('/dashboard/account-purchase-form/') ? loc.split('/').pop() : null;

  $: bomId = loc && loc.startsWith('/dashboard/boms/') ? loc.split('/').pop() : null;

  $: bomFormId = loc && loc.startsWith('/dashboard/bom-form/') ? loc.split('/').pop() : null;

  $: saleId = loc && loc.startsWith('/dashboard/sales/') ? loc.split('/').pop() : null;

  $: saleFormId = loc && loc.startsWith('/dashboard/sale-form/') ? loc.split('/').pop() : null;

  $: saleFormAccountId = loc && loc.startsWith('/dashboard/account-sale-form/') ? loc.split('/').pop() : null;

  $: inventory_recordId = loc && loc.startsWith('/dashboard/inventory_records/') ? loc.split('/').pop() : null;

  $: inventory_recordFormId = loc && loc.startsWith('/dashboard/inventory_record-form/') ? loc.split('/').pop() : null;

  $: inventory_recordFormAccountId = loc && loc.startsWith('/dashboard/account-inventory_record-form/') ? loc.split('/').pop() : null;

  $: prescriptionId = loc && loc.startsWith('/dashboard/prescriptions/') ? loc.split('/').pop() : null;

  $: prescriptionFormId = loc && loc.startsWith('/dashboard/prescription-form/') ? loc.split('/').pop() : null;

  $: prescriptionAppointmentId = loc && loc.startsWith('/dashboard/prescription-appointment-form/') ? loc.split('/').pop() : null;

  $: productionId = loc && loc.startsWith('/dashboard/productions/') ? loc.split('/').pop() : null;

  $: productionFormId = loc && loc.startsWith('/dashboard/production-form/') ? loc.split('/').pop() : null;

  $: stockTransferFormId = loc && loc.startsWith('/dashboard/stock-transfer-form/') ? loc.split('/').pop() : null;

  $: wasteId = loc && loc.startsWith('/dashboard/wastes/') ? loc.split('/').pop() : null;

  $: selectedWarehouseId = loc && loc.startsWith('/dashboard/warehouse/') ? loc.split('/').pop() : null;

  $: selectedDepartmentId = loc && loc.startsWith('/dashboard/department/') ? loc.split('/').pop() : null;

  $: productFormId = loc && loc.startsWith('/dashboard/product-form/') ? loc.split('/').pop() : null;

  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let lastSidebarLocation = loc;

  $: if (loc !== lastSidebarLocation) {
    sidebarOpen = false;
    lastSidebarLocation = loc;
  }

  
</script>


<div class="d-flex">
  {#if sidebarOpen}
    <button
      type="button"
      class="sidebar-backdrop"
      aria-label="Close navigation"
      on:click={() => (sidebarOpen = false)}></button>
  {/if}

  {#key currentLang}
    <Sidebar bind:sidebarOpen bind:sidebarCollapsed />
  {/key}

  <div class="flex-grow-1 content-wrapper" class:sidebar-collapsed={sidebarCollapsed} class:dashboard-surface={loc === '/dashboard'}>
    {#key currentLang}
      <Topbar on:toggleSidebar={() => (sidebarOpen = !sidebarOpen)} />
    {/key}

    <main
      class="erp-page-main"
      class:erp-form-route={loc.startsWith('/dashboard/sale-form/') ||
        loc.startsWith('/dashboard/account-sale-form/') ||
        loc.startsWith('/dashboard/purchase-form/') ||
        loc.startsWith('/dashboard/account-purchase-form/')}>
      {#key currentLang}
      {#if loc === '/dashboard'}
        <AsyncPage loader={loadDashboard} />
      {:else if loc === '/dashboard/2'}
        <AsyncPage loader={loadDashboard2} />
      {:else if loc === '/dashboard/treasury'}
        <AsyncPage loader={loadTreasury} />
      {:else if loc.startsWith('/dashboard/account/')}
        <AsyncPage loader={loadAccountView} id={accountId} />
      {:else if loc.startsWith('/dashboard/appointment/')}
        <AsyncPage loader={loadAppointmentView} id={appointmentID} />
      {:else if loc.startsWith('/dashboard/accounts/')}
        <AsyncPage loader={loadAccounts} page={accountPage} />
      {:else if loc === '/dashboard/account-types'}
        <AsyncPage loader={loadAccountTypes} />
      {:else if loc.startsWith('/dashboard/patients/')}
        <AsyncPage loader={loadPatients} page={patientPage} />
      {:else if loc.startsWith('/dashboard/apartments/')}
        <AsyncPage loader={loadApartments} page={apartmentPage} />
      {:else if loc === '/dashboard/patient-types'}
        <AsyncPage loader={loadPatientTypes} />
      {:else if loc.startsWith('/dashboard/journals/')}
        <AsyncPage loader={loadJournals} page={journalPage} />
      {:else if loc.startsWith('/dashboard/appointments/')}
        <AsyncPage loader={loadAppointments} page={appointmentPage} />
      {:else if loc.startsWith('/dashboard/exchanges/')}
        <AsyncPage loader={loadExchanges} page={exchangePage} />
      {:else if loc.startsWith('/dashboard/master-exchanges/')}
        <AsyncPage loader={loadMasterExchanges} page={masterExchangePage} />
      {:else if loc.startsWith('/dashboard/transfers/')}
        <AsyncPage loader={loadMoneyTransfers} page={transferPage} />
      {:else if loc.startsWith('/dashboard/currencies/')}
        <AsyncPage loader={loadCurrencies} />
      {:else if loc === '/dashboard/sales'}
        <AsyncPage loader={loadSales} />
      {:else if loc.startsWith('/dashboard/sales/')}
        <AsyncPage loader={loadSaleView} {saleId} />
      {:else if loc === '/dashboard/inventory_records'}
        <AsyncPage loader={loadInventoryRecords} />
      {:else if loc.startsWith('/dashboard/inventory_records/')}
        <AsyncPage loader={loadInventoryRecordView} {inventory_recordId} />
      {:else if loc.startsWith('/dashboard/sale-form/')}
        <AsyncPage loader={loadSaleForm} saleId={saleFormId || null} />
      {:else if loc.startsWith('/dashboard/account-sale-form/')}
        <AsyncPage loader={loadSaleForm} saleId={0} accountId={saleFormAccountId || null} />
      {:else if loc.startsWith('/dashboard/inventory_record-form/')}
        <AsyncPage loader={loadInventoryRecordForm} inventory_recordId={inventory_recordFormId || null} />
      {:else if loc.startsWith('/dashboard/account-inventory_record-form/')}
        <AsyncPage loader={loadInventoryRecordForm} inventory_recordId={0} accountId={inventory_recordFormAccountId || null} />
      {:else if loc === '/dashboard/prescriptions'}
        <AsyncPage loader={loadPrescriptions} />
      {:else if loc === '/dashboard/labtests'}
        <AsyncPage loader={loadLabTests} />
      {:else if loc.startsWith('/dashboard/prescriptions/')}
        <AsyncPage loader={loadPrescriptionView} {prescriptionId} />
      {:else if loc.startsWith('/dashboard/prescription-form/')}
        <AsyncPage loader={loadPrescriptionForm} prescriptionId={prescriptionFormId || null} />
      {:else if loc.startsWith('/dashboard/prescription-appointment-form/')}
        <AsyncPage loader={loadPrescriptionForm} prescriptionId={0} {prescriptionAppointmentId} />
      {:else if loc === '/dashboard/productions'}
        <AsyncPage loader={loadProductions} />
      {:else if loc.startsWith('/dashboard/productions/')}
        <AsyncPage loader={loadProductionView} {productionId} />
      {:else if loc.startsWith('/dashboard/production-form/')}
        <AsyncPage loader={loadProductionForm} productionId={productionFormId || null} />
      {:else if loc.startsWith('/dashboard/warehouse/')}
        <AsyncPage loader={loadWarehouseView} {selectedWarehouseId} />
      {:else if loc.startsWith('/dashboard/department/')}
        <AsyncPage loader={loadDepartmentView} {selectedDepartmentId} />
      {:else if loc === '/dashboard/stock-transfers'}
        <AsyncPage loader={loadStockTransfers} />
      {:else if loc.startsWith('/dashboard/stock-transfers/')}
        <AsyncPage loader={loadStockTransferView} {stocktransferId} />
      {:else if loc.startsWith('/dashboard/stock-transfer-form/')}
        <AsyncPage loader={loadStockTransferForm} stocktransferId={stockTransferFormId || null} />
      {:else if loc === '/dashboard/pos'}
        <AsyncPage loader={loadPOS} />
      {:else if loc === '/dashboard/purchases'}
        <AsyncPage loader={loadPurchases} />
      {:else if loc.startsWith('/dashboard/purchases/')}
        <AsyncPage loader={loadPurchaseView} {purchaseId} />
      {:else if loc.startsWith('/dashboard/purchase-form/')}
        <AsyncPage loader={loadPurchaseForm} purchaseId={purchaseFormId || null} />
      {:else if loc.startsWith('/dashboard/account-purchase-form/')}
        <AsyncPage loader={loadPurchaseForm} purchaseId={0} accountId={purchaseFormAccountId || null} />
      {:else if loc === '/dashboard/wastes'}
        <AsyncPage loader={loadWastes} />
      {:else if loc.startsWith('/dashboard/wastes/')}
        <AsyncPage loader={loadWasteView} {wasteId} />
      {:else if loc === '/dashboard/stock'}
        <div class="route-fill">
          <AsyncPage loader={loadStock} page="products" />
        </div>
      {:else if loc.startsWith('/dashboard/stock/')}
        <div class="route-fill">
          <AsyncPage loader={loadStock} page={stockPage} />
        </div>
      {:else if loc === '/dashboard/services'}
        <AsyncPage loader={loadServicesIndex} />
      {:else if loc === '/dashboard/stock-transactions'}
        <AsyncPage loader={loadStockTransactions} />
      {:else if loc.startsWith('/dashboard/product-form/')}
        <AsyncPage loader={loadProductForm} {productFormId} />
      {:else if loc.startsWith('/dashboard/product/')}
        <AsyncPage loader={loadProduct} id={productId} page={productPage} />
      {:else if loc === '/dashboard/reports'}
        <AsyncPage loader={loadReports} />
      {:else if loc.startsWith('/dashboard/settings/')}
        <div class="route-fill">
          <AsyncPage loader={loadSettings} page={settingPage} />
        </div>
      {:else if loc === '/dashboard/subscription'}
        <AsyncPage loader={loadSubscription} />
      {:else if loc === '/dashboard/users'}
        <AsyncPage loader={loadUsers} />
      {:else if loc === '/dashboard/work-centers'}
        <AsyncPage loader={loadWorkCenters} />
      {:else if loc === '/dashboard/boms'}
        <AsyncPage loader={loadBoms} />
      {:else if loc.startsWith('/dashboard/boms/')}
        <AsyncPage loader={loadBOMView} {bomId} />
      {:else if loc.startsWith('/dashboard/bom-form/')}
        <AsyncPage loader={loadBOMForm} bomId={bomFormId || null} />
      {/if}
      {/key}
    </main>
  </div>
</div>

<style>
  .sidebar-backdrop {
    display: none;
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 100dvh;
    max-height: 100dvh;
    min-width: 0 !important;
    overflow: hidden;
    transition: margin 0.3s ease;
    background: var(--erp-bg);
  }

  .content-wrapper.dashboard-surface {
    background: var(--erp-bg);
  }

  main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .erp-page-main {
    width: 100%;
    max-width: var(--content-max-width);
    margin-inline: auto;
    padding: var(--page-padding) var(--page-padding-x);
    min-width: 0;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  

  .route-fill {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

  /* Non-list form pages still need to scroll the whole page */
  .erp-page-main:not(:has([class*='-table-card'])):not(:has(.table-card)):not(:has(.journals-card)):not(:has(.exchanges-card)):not(:has(.card > .card-body.p-0)):not(:has(.card > .card-body .table-responsive)) {
    overflow: auto;
  }

  .erp-page-main.erp-form-route {
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
  }

  :global(html[dir='ltr']) .content-wrapper {
    min-width: 0 !important;
    margin-left: var(--sidebar-width);
  }
  :global(html[dir='rtl']) .content-wrapper {
    min-width: 0 !important;
    margin-right: var(--sidebar-width);
    margin-left: 0;
  }
  @media (max-width: 991px) {
    .sidebar-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1040;
      display: block;
      padding: 0;
      border: 0;
      background: rgba(23, 32, 51, 0.42);
      backdrop-filter: blur(2px);
    }

    .content-wrapper {
      margin: 0 !important;
    }
  }
</style>
