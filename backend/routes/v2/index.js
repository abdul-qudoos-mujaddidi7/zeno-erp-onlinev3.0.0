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

const router = express.Router();

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
  accountGroupRoutes,
);

router.use(
  '/warehouses',
  warehouseRoutes,
);

router.use(
  '/products',
  productRoutes,
);

router.use(
  '/purchases',
  purchaseRoutes,
);

router.use(
  '/purchase-items',
  purchaseItemRoutes,
);

router.use(
  '/journals',
  journalRoutes,
);

router.use(
  '/dashboard',
  dashboardRoutes,
);

router.use(
  '/returns',
  returnsRoutes,
);

router.use(
  '/accounts',
  accountRoutes,
);

router.use(
  '/account-types',
  accountTypeRoutes,
);

router.use(
  '/sales',
  saleRoutes,
);

router.use(
  '/sale-items',
  saleItemRoutes,
);

router.use(
  '/warehouse-products',
  warehouseProductRoutes,
);

router.use(
  '/stock-transactions',
  stockTransactionRoutes,
);

router.use(
  '/stock-batches',
  stockBatchRoutes,
);

router.use(
  '/stock-transfers',
  stockTransferRoutes,
);

router.use(
  '/wastes',
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
  productImageRoutes,
);

router.use(
  '/users',
  userRoutes,
);

router.use(
  '/settings',
  settingsRoutes,
);

router.use(
  '/account-images',
  accountImageRoutes,
);

router.use(
  '/sale-payments',
  salePaymentRoutes,
);

router.use(
  '/purchase-payments',
  purchasePaymentRoutes,
);

router.use(
  '/exchanges',
  exchangeRoutes,
);

router.use(
  '/user-roles',
  userRoleRoutes,
);

router.use(
  '/user-images',
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
  stockAdjustmentRoutes,
);

module.exports = router;
