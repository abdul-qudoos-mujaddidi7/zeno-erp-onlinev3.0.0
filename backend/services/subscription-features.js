function normalizeFeatureIdentifier(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function featureMatchesModule(feature, moduleCode) {
  const module = normalizeFeatureIdentifier(moduleCode);
  const singular = (value) => value.endsWith('ies') ? `${value.slice(0, -3)}y` : value.endsWith('s') ? value.slice(0, -1) : value;
  return module && [feature?.feature_key, feature?.name].some(
    (value) => {
      const candidate = normalizeFeatureIdentifier(value);
      return candidate === module || singular(candidate) === singular(module);
    },
  );
}

function isModuleFeatureEnabled(subscription, moduleCode) {
  const catalog = subscription?.feature_catalog;
  if (!Array.isArray(catalog)) return true;

  const matchingCatalogFeatures = catalog.filter((feature) =>
    featureMatchesModule(feature, moduleCode),
  );
  if (!matchingCatalogFeatures.length) return true;

  const assigned = Array.isArray(subscription?.features) ? subscription.features : [];
  const planFeatures = Array.isArray(subscription?.plan_features)
    ? subscription.plan_features
    : [];
  const active = (item) =>
    item.status === undefined || item.status === null || Number(item.status) === 1;

  // The plan is the shared upper bound; the organization subscription is its
  // own assignment list. Requiring both lets plan changes affect every tenant
  // on that plan while a tenant-specific removal affects only that tenant.
  return matchingCatalogFeatures.some((feature) =>
    planFeatures.some((item) =>
      Number(item.feature_id) === Number(feature.id) && active(item),
    ) && assigned.some((item) =>
      Number(item.feature_id) === Number(feature.id) && active(item),
    ),
  );
}

const API_MODULES = {
  '/product-categories': 'Products', '/product-brands': 'Products',
  '/product-generics': 'Products', '/products': 'Products',
  '/warehouses': 'Products', '/warehouse-products': 'Products',
  '/stock-transactions': 'Products', '/stock-batches': 'Products',
  '/stock-transfers': 'Products', '/product-units': 'Products',
  '/unit-categories': 'Products', '/product-images': 'Products',
  '/wastes': 'Products', '/stock-adjustments': 'Products',
  '/inventory-records': 'Products',
  '/purchases': 'Purchases', '/purchase-items': 'Purchases',
  '/purchase-payments': 'Purchases',
  '/journals': 'Journals', '/fiscal-years': 'Journals',
  '/dashboard': 'Dashboard', '/accounts': 'Accounts',
  '/account-types': 'Accounts', '/account-groups': 'Accounts',
  '/account-images': 'Accounts', '/sales': 'Sales',
  '/sale-items': 'Sales', '/sale-payments': 'Sales', '/returns': 'Sales',
  '/exchanges': 'Exchange', '/users': 'Users', '/user-roles': 'Users',
  '/user-images': 'Users', '/settings': 'Settings',
};

function moduleForApiPath(path) {
  const route = String(path || '').split('?')[0].match(/^\/api\/v2(\/[^/]*)/);
  if (!route) return null;
  const key = route[1];
  if (API_MODULES[key]) return API_MODULES[key];
  // For standalone modules whose feature key is named after the API resource,
  // convert /work-centers to WorkCenters and match that catalog entry.
  return key.slice(1).split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join('');
}

module.exports = { featureMatchesModule, isModuleFeatureEnabled, moduleForApiPath };
