const express = require('express');

const auth =
  require('../../middleware/auth');

const systemRoutes =
  require('./system.routes');

const productCategoryRoutes =
  require('./product-category.routes');

const productBrandRoutes =
  require('./product-brand.routes');

const productGenericRoutes =
  require('./product-generic.routes');

const currencyRoutes =
  require('./currency.routes');

const accountGroupRoutes =
  require('./account-group.routes');

const warehouseRoutes =
  require('./warehouse.routes');

const productRoutes =
  require('./product.routes');

const purchaseRoutes =
  require('./purchase.routes');

const purchaseItemRoutes =
  require('./purchase-item.routes');

const journalRoutes =
  require('./journal.routes');

const dashboardRoutes =
  require('./dashboard.routes');

const returnsRoutes =
  require('./returns.routes');

const accountRoutes =
  require('./account.routes');

const accountTypeRoutes =
  require('./account-type.routes');

const saleRoutes =
  require('./sale.routes');

const saleItemRoutes =
  require('./sale-item.routes');

const warehouseProductRoutes =
  require('./warehouse-product.routes');

const stockTransactionRoutes =
  require('./stock-transaction.routes');

const stockBatchRoutes =
  require('./stock-batch.routes');

const stockTransferRoutes =
  require('./stock-transfer.routes');

const wasteRoutes =
  require('./waste.routes');

const productUnitRoutes =
  require('./product-unit.routes');

const departmentRoutes =
  require('./department.routes');

const productImageRoutes =
  require('./product-image.routes');

const userRoutes =
  require('./user.routes');

const settingsRoutes =
  require('./settings.routes');

const accountImageRoutes =
  require('./account-image.routes');

const salePaymentRoutes =
  require('./sale-payment.routes');

const purchasePaymentRoutes =
  require('./purchase-payment.routes');

const exchangeRoutes =
  require('./exchange.routes');

const userRoleRoutes =
  require('./user-role.routes');

const userImageRoutes =
  require('./user-image.routes');

const workCenterRoutes =
  require('./work-center.routes');

const bomRoutes =
  require('./bom.routes');

const productionRoutes =
  require('./production.routes');

const inventoryRecordRoutes =
  require('./inventory-record.routes');

const patientTypeRoutes =
  require('./patient-type.routes');

const appointmentRoutes =
  require('./appointment.routes');

const prescriptionRoutes =
  require('./prescription.routes');

const labtestCategoryRoutes =
  require('./labtest-category.routes');

const labtestTypeRoutes =
  require('./labtest-type.routes');

const labtestRoutes =
  require('./labtest.routes');

const documentRoutes =
  require('./document.routes');

const buildingRoutes =
  require('./building.routes');

const floorRoutes =
  require('./floor.routes');

const apartmentRoutes =
  require('./apartment.routes');

const leaseRoutes =
  require('./lease.routes');

const rentInvoiceRoutes =
  require('./rent-invoice.routes');

const utilityMeterRoutes =
  require('./utility-meter.routes');

const meterReadingRoutes =
  require('./meter-reading.routes');

const stockAdjustmentRoutes =
  require('./stock-adjustment.routes');

const reconciliationRoutes =
  require('./reconciliation.routes');

const fiscalYearRoutes =
  require('./fiscal-year.routes');

const requireModulePermission =
  require('../../middleware/permission');

const router = express.Router();

/*
 * Module guards.
 *
 * Each ERP mount is owned by one permission module; a denied `view` blocks
 * the whole mount (reads and writes). `read`/`write` list the other modules
 * whose screens legitimately use this data — see the note in
 * middleware/permission.js. A permission set with no entry for a module keeps
 * its previous behaviour, so existing users are unaffected.
 */
const guardDashboard = requireModulePermission('Dashboard', {
  read: ['Accounts'],
  allDeniedBlocks: true,
});

const guardProducts = requireModulePermission('Products', {
  read: ['Sales', 'Purchases', 'POS', 'Services', 'Accounts', 'Journals', 'Dashboard'],
  write: ['Services', 'Purchases'],
});

const guardStock = requireModulePermission('Products', {
  read: ['Sales', 'Purchases', 'POS', 'Services', 'Accounts', 'Dashboard'],
  write: ['Sales', 'Purchases', 'Services'],
});

const guardInventoryRecords = requireModulePermission('Products', {
  read: ['Sales', 'Accounts', 'Dashboard'],
  write: ['Sales'],
});

const guardSales = requireModulePermission('Sales', {
  read: ['Journals', 'Accounts', 'Dashboard', 'POS', 'Products', 'Services'],
  write: ['POS', 'Services'],
});

const guardPurchases = requireModulePermission('Purchases', {
  read: ['Journals', 'Accounts', 'Dashboard', 'Products'],
});

const guardJournals = requireModulePermission('Journals', {
  read: ['Accounts', 'Sales', 'Purchases', 'Products', 'Dashboard'],
  write: ['Products', 'Services'],
});

const guardAccounts = requireModulePermission('Accounts', {
  read: ['Sales', 'Purchases', 'Journals', 'Products', 'POS', 'Dashboard', 'Services'],
  write: ['Exchange', 'Users', 'Services'],
});

const guardFiscalYears = requireModulePermission('Journals', {
  read: ['Accounts', 'Dashboard'],
  write: ['Accounts'],
});

const guardExchanges = requireModulePermission('Exchange', {
  read: ['Dashboard'],
});

const guardUsers = requireModulePermission('Users', {
  selfService: true,
});

const guardUserRoles = requireModulePermission('Users');

/*
 * Public system endpoints are registered before auth.
 * /system/me may still use auth inside system.routes.js.
 */
router.use(
  '/system',
  systemRoutes,
);

/*
 * Every ERP route registered below this line
 * requires a valid authentication token.
 */
router.use(auth);

router.use(
  '/product-categories',
  productCategoryRoutes,
);

router.use(
  '/product-brands',
  productBrandRoutes,
);

router.use(
  '/product-generics',
  productGenericRoutes,
);

router.use(
  '/currencies',
  currencyRoutes,
);

router.use(
  '/account-groups',
  guardAccounts,
  accountGroupRoutes,
);

router.use(
  '/warehouses',
  warehouseRoutes,
);

router.use(
  '/products',
  guardProducts,
  productRoutes,
);

router.use(
  '/purchases',
  guardPurchases,
  purchaseRoutes,
);

router.use(
  '/purchase-items',
  guardPurchases,
  purchaseItemRoutes,
);

router.use(
  '/journals',
  guardJournals,
  journalRoutes,
);

router.use(
  '/dashboard',
  guardDashboard,
  dashboardRoutes,
);

router.use(
  '/returns',
  returnsRoutes,
);

router.use(
  '/accounts',
  guardAccounts,
  accountRoutes,
);

router.use(
  '/account-types',
  guardAccounts,
  accountTypeRoutes,
);

router.use(
  '/sales',
  guardSales,
  saleRoutes,
);

router.use(
  '/sale-items',
  guardSales,
  saleItemRoutes,
);

router.use(
  '/warehouse-products',
  guardStock,
  warehouseProductRoutes,
);

router.use(
  '/stock-transactions',
  guardStock,
  stockTransactionRoutes,
);

router.use(
  '/stock-batches',
  guardStock,
  stockBatchRoutes,
);

router.use(
  '/stock-transfers',
  guardStock,
  stockTransferRoutes,
);

router.use(
  '/wastes',
  guardStock,
  wasteRoutes,
);

router.use(
  '/product-units',
  productUnitRoutes,
);

router.use(
  '/departments',
  departmentRoutes,
);

router.use(
  '/product-images',
  guardProducts,
  productImageRoutes,
);

router.use(
  '/users',
  guardUsers,
  userRoutes,
);

router.use(
  '/settings',
  settingsRoutes,
);

router.use(
  '/account-images',
  guardAccounts,
  accountImageRoutes,
);

router.use(
  '/sale-payments',
  guardSales,
  salePaymentRoutes,
);

router.use(
  '/purchase-payments',
  guardPurchases,
  purchasePaymentRoutes,
);

router.use(
  '/exchanges',
  guardExchanges,
  exchangeRoutes,
);

router.use(
  '/user-roles',
  guardUserRoles,
  userRoleRoutes,
);

router.use(
  '/user-images',
  guardUserRoles,
  userImageRoutes,
);

router.use(
  '/work-centers',
  workCenterRoutes,
);

router.use(
  '/boms',
  bomRoutes,
);

router.use(
  '/productions',
  productionRoutes,
);

router.use(
  '/inventory-records',
  guardInventoryRecords,
  inventoryRecordRoutes,
);

router.use(
  '/patient-types',
  patientTypeRoutes,
);

router.use(
  '/appointments',
  appointmentRoutes,
);

router.use(
  '/prescriptions',
  prescriptionRoutes,
);

router.use(
  '/labtest-categories',
  labtestCategoryRoutes,
);

router.use(
  '/labtest-types',
  labtestTypeRoutes,
);

router.use(
  '/labtests',
  labtestRoutes,
);

router.use(
  '/documents',
  documentRoutes,
);

router.use(
  '/buildings',
  buildingRoutes,
);

router.use(
  '/floors',
  floorRoutes,
);

router.use(
  '/apartments',
  apartmentRoutes,
);

router.use(
  '/leases',
  leaseRoutes,
);

router.use(
  '/rent-invoices',
  rentInvoiceRoutes,
);

router.use(
  '/utility-meters',
  utilityMeterRoutes,
);

router.use(
  '/meter-readings',
  meterReadingRoutes,
);

router.use(
  '/stock-adjustments',
  guardStock,
  stockAdjustmentRoutes,
);

router.use(
  '/reconciliation',
  reconciliationRoutes,
);

router.use(
  '/fiscal-years',
  guardFiscalYears,
  fiscalYearRoutes,
);

module.exports = router;
