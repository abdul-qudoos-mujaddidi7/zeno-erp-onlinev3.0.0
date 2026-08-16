const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const dashboardRepository =
  require('../repositories/dashboard.repository');

const currencyRepository =
  require('../repositories/currency.repository');

const ttlCache =
  require('../utils/ttlCache');

const SUMMARY_CACHE_TTL_MS = 30000;
const OVERVIEW_CACHE_TTL_MS = 45000;

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);
  const userId = Number(user?.local_id);

  if (
    !Number.isSafeInteger(orgId) ||
    orgId <= 0
  ) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new AppError(
      'Invalid authenticated user.',
      401,
      'INVALID_USER',
    );
  }

  return {
    orgId,
    userId,
  };
}

function collapseCurrencyRows(rows, {
  amountField = 'total',
  countField = 'cnt',
} = {}) {
  let total = 0;
  let count = 0;
  const byCurrency = {};

  for (const row of rows || []) {
    const currency = row.currency || 'AFN';
    const amount = Number(row[amountField]) || 0;
    const rowCount = Number(row[countField]) || 0;

    byCurrency[currency] =
      (byCurrency[currency] || 0) + amount;
    total += amount;
    count += rowCount;
  }

  return {
    total,
    count,
    by_currency: byCurrency,
  };
}

function convertAmount(amount, fromCode, toCode, rateMap) {
  if (!fromCode || !toCode || fromCode === toCode) {
    return Number(amount) || 0;
  }

  const fromRate = rateMap[fromCode] || 1;
  const toRate = rateMap[toCode] || 1;

  return ((Number(amount) || 0) / toRate) * fromRate;
}

function sumConverted(byCurrency, defaultCurrency, rateMap) {
  return Object.entries(byCurrency || {}).reduce(
    (sum, [currency, amount]) =>
      sum +
      convertAmount(
        amount,
        currency,
        defaultCurrency,
        rateMap,
      ),
    0,
  );
}

function resolveGranularity(period) {
  if (period === 'today') return 'hour';
  if (period === 'year') return 'month';
  return 'day';
}

function truthyFlag(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return Boolean(value);
}

function addToCurrencyMap(target, currency, amount) {
  const code = currency || 'AFN';
  target[code] = (target[code] || 0) + (Number(amount) || 0);
}

function buildOverview({
  bucketRows,
  inventoryRows,
  lowStockRows,
  expiringRows,
  lowStockCount,
  expiringCount,
  defaultCurrency,
  rateMap,
}) {
  const treasuryBalances = {};
  const customerBalances = {};
  const supplierBalances = {};
  const shareholderBalances = {};

  for (const row of bucketRows || []) {
    const map =
      row.bucket === 'treasury'
        ? treasuryBalances
        : row.bucket === 'customer'
          ? customerBalances
          : row.bucket === 'supplier'
            ? supplierBalances
            : row.bucket === 'shareholder'
              ? shareholderBalances
              : null;

    if (!map) continue;
    addToCurrencyMap(map, row.currency, row.balance);
  }

  const inventoryByCurrency = {};
  for (const row of inventoryRows || []) {
    addToCurrencyMap(
      inventoryByCurrency,
      row.currency || defaultCurrency,
      row.amount,
    );
  }

  const merged = {};
  for (const map of [
    treasuryBalances,
    inventoryByCurrency,
    customerBalances,
    supplierBalances,
    shareholderBalances,
  ]) {
    for (const [currency, amount] of Object.entries(map)) {
      merged[currency] = (merged[currency] || 0) + Number(amount);
    }
  }

  return {
    default_currency: defaultCurrency,
    net_benefit: sumConverted(merged, defaultCurrency, rateMap),
    treasury_balance: treasuryBalances,
    inventory_value: sumConverted(
      inventoryByCurrency,
      defaultCurrency,
      rateMap,
    ),
    inventory_by_currency: inventoryByCurrency,
    low_stock: {
      total: Number(lowStockCount) || 0,
      items: (lowStockRows || []).map((row) => ({
        id: Number(row.id),
        name: row.name,
        code: row.code,
        totalQty: Number(row.quantity) || 0,
        alarm_quantity: Number(row.alarm_quantity) || 0,
      })),
    },
    expiring: {
      total: Number(expiringCount) || 0,
      items: (expiringRows || []).map((row) => ({
        id: Number(row.id),
        name: row.name,
        code: row.code,
        totalQty: Number(row.quantity) || 0,
        expiry_date: row.expiry_date,
        remaining_days: Number(row.remaining_days) || 0,
      })),
    },
  };
}

async function loadCurrencies(orgId) {
  const currencies = await currencyRepository.findAll(db, {
    orgId,
    status: 1,
  });

  const defaultCurrency =
    currencies.find(
      (c) =>
        Number(c.isDefault ?? c.is_default) === 1,
    )?.code ||
    currencies[0]?.code ||
    'AFN';

  const rateMap = {};
  for (const currency of currencies) {
    rateMap[currency.code] =
      parseFloat(currency.exchangeRate) || 1;
  }

  return {
    defaultCurrency,
    rateMap,
  };
}

async function buildMetricsPayload({
  orgId,
  dateFrom,
  dateTo,
  granularity,
  defaultCurrency,
  rateMap,
}) {
  const expensesAccountId =
    await dashboardRepository.findExpensesAccountId(db, orgId);

  const range = {
    orgId,
    dateFrom,
    dateTo,
  };

  const [
    salesRows,
    purchaseRows,
    saleReturnRows,
    purchaseReturnRows,
    wasteRows,
    expenseRows,
    productRows,
    benefitTrendRows,
    expenseTrendRows,
  ] = await Promise.all([
    dashboardRepository.sumSales(db, range),
    dashboardRepository.sumPurchases(db, range),
    dashboardRepository.sumSaleReturns(db, range),
    dashboardRepository.sumPurchaseReturns(db, range),
    dashboardRepository.sumWastes(db, range),
    dashboardRepository.sumExpenses(db, {
      ...range,
      expensesAccountId,
    }),
    dashboardRepository.topProducts(db, {
      ...range,
      limit: 40,
    }),
    dashboardRepository.trendBenefit(db, {
      ...range,
      granularity,
    }),
    dashboardRepository.trendExpenses(db, {
      ...range,
      expensesAccountId,
      granularity,
    }),
  ]);

  const sales = collapseCurrencyRows(salesRows);
  const purchases = collapseCurrencyRows(purchaseRows);
  const saleReturns = collapseCurrencyRows(saleReturnRows);
  const purchaseReturns =
    collapseCurrencyRows(purchaseReturnRows);
  const wastes = collapseCurrencyRows(wasteRows);
  const expenses = collapseCurrencyRows(expenseRows);

  const benefitByCurrency = {};
  for (const row of salesRows || []) {
    const currency = row.currency || 'AFN';
    benefitByCurrency[currency] =
      (benefitByCurrency[currency] || 0) +
      (Number(row.benefit) || 0);
  }

  const metrics = {
    sales: {
      value: sumConverted(
        sales.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: sales.count,
    },
    purchases: {
      value: sumConverted(
        purchases.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: purchases.count,
    },
    benefit: {
      value: sumConverted(
        benefitByCurrency,
        defaultCurrency,
        rateMap,
      ),
      count: 0,
    },
    expenses: {
      value: sumConverted(
        expenses.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: 0,
    },
    saleReturns: {
      value: sumConverted(
        saleReturns.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: saleReturns.count,
    },
    purchaseReturns: {
      value: sumConverted(
        purchaseReturns.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: purchaseReturns.count,
    },
    wastes: {
      value: sumConverted(
        wastes.by_currency,
        defaultCurrency,
        rateMap,
      ),
      count: wastes.count,
    },
  };

  const productMap = new Map();
  for (const row of productRows || []) {
    const productId = Number(row.product_id);
    if (!productMap.has(productId)) {
      productMap.set(productId, {
        pid: productId,
        qty: 0,
        rev: 0,
        name: row.name || `#${productId}`,
        code: row.code || '',
      });
    }

    const entry = productMap.get(productId);
    entry.qty += Number(row.qty) || 0;
    entry.rev += convertAmount(
      Number(row.rev) || 0,
      row.currency || defaultCurrency,
      defaultCurrency,
      rateMap,
    );
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 6);

  const trendMap = new Map();

  const ensureBucket = (bucket) => {
    const key = String(bucket);
    if (!trendMap.has(key)) {
      trendMap.set(key, {
        bucket: key,
        benefit: 0,
        expenses: 0,
      });
    }
    return trendMap.get(key);
  };

  for (const row of benefitTrendRows || []) {
    const entry = ensureBucket(row.bucket);
    entry.benefit += convertAmount(
      Number(row.amount) || 0,
      row.currency || defaultCurrency,
      defaultCurrency,
      rateMap,
    );
  }

  for (const row of expenseTrendRows || []) {
    const entry = ensureBucket(row.bucket);
    entry.expenses += convertAmount(
      Number(row.amount) || 0,
      row.currency || defaultCurrency,
      defaultCurrency,
      rateMap,
    );
  }

  const trend = [...trendMap.values()].sort((a, b) =>
    String(a.bucket).localeCompare(String(b.bucket)),
  );

  return {
    default_currency: defaultCurrency,
    granularity,
    metrics,
    top_products: topProducts,
    trend,
  };
}

async function buildOverviewPayload({
  orgId,
  defaultCurrency,
  rateMap,
}) {
  const [
    bucketRows,
    inventoryRows,
    lowStockRows,
    expiringRows,
  ] = await Promise.all([
    dashboardRepository.sumBenefitBalancesByBucket(db, orgId),
    dashboardRepository.findInventoryValueByCurrency(db, orgId),
    dashboardRepository.findLowStockProducts(db, orgId, 10),
    dashboardRepository.findExpiringProducts(db, orgId, 10),
  ]);

  const lowStockCount =
    Number(lowStockRows?.[0]?.total_count) || lowStockRows.length;
  const expiringCount =
    Number(expiringRows?.[0]?.total_count) || expiringRows.length;

  return buildOverview({
    bucketRows,
    inventoryRows,
    lowStockRows,
    expiringRows,
    lowStockCount,
    expiringCount,
    defaultCurrency,
    rateMap,
  });
}

function invalidateDashboardAggregates(orgId) {
  ttlCache.invalidatePrefix(
    ttlCache.makeKey(['dashboard', orgId]),
  );
}

async function getSummary({
  user,
  filters = {},
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  const dateFrom = filters.date_from;
  const dateTo = filters.date_to;

  if (!dateFrom || !dateTo) {
    throw new AppError(
      'date_from and date_to are required.',
      400,
      'INVALID_DATE_RANGE',
    );
  }

  const period = filters.period || 'custom';
  const granularity =
    filters.granularity ||
    resolveGranularity(period);
  const includeOverview = truthyFlag(
    filters.include_overview,
    true,
  );
  const includeMetrics = truthyFlag(
    filters.include_metrics,
    true,
  );

  const cacheKey = ttlCache.makeKey([
    'dashboard',
    orgId,
    'summary',
    dateFrom,
    dateTo,
    granularity,
    includeMetrics ? 1 : 0,
    includeOverview ? 1 : 0,
  ]);

  return ttlCache.getOrSet(
    cacheKey,
    includeOverview ? OVERVIEW_CACHE_TTL_MS : SUMMARY_CACHE_TTL_MS,
    async () => {
      const {
        defaultCurrency,
        rateMap,
      } = await loadCurrencies(orgId);

      const payload = {
        default_currency: defaultCurrency,
        granularity,
      };

      const tasks = [];

      if (includeMetrics) {
        tasks.push(
          buildMetricsPayload({
            orgId,
            dateFrom,
            dateTo,
            granularity,
            defaultCurrency,
            rateMap,
          }).then((metricsPayload) => {
            Object.assign(payload, metricsPayload);
          }),
        );
      }

      if (includeOverview) {
        tasks.push(
          buildOverviewPayload({
            orgId,
            defaultCurrency,
            rateMap,
          }).then((overview) => {
            payload.overview = overview;
          }),
        );
      }

      await Promise.all(tasks);
      return payload;
    },
  );
}

async function getInventoryValuation({
  user,
}) {
  const {
    orgId,
  } = getAuthenticatedIdentity(user);

  return dashboardRepository.findInventoryValuation(
    db,
    orgId,
  );
}

module.exports = {
  getSummary,
  getInventoryValuation,
  invalidateDashboardAggregates,
};
