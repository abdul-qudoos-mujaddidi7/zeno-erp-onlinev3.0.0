/*
 * reconciliation.service.js
 *
 * Step 0 production safety baseline.
 *
 * Builds a READ-ONLY reconciliation report that tells whether the
 * organization's existing financial / inventory data is internally
 * consistent. It NEVER repairs anything:
 *   - no INSERT / UPDATE / DELETE
 *   - no journal posting
 *   - no stock rebuilding (stockTransactionService.reconcileProductStock
 *     is deliberately NOT called)
 *   - no batch creation / repair
 *
 * The report is always scoped by org_id and the executor can be
 * injected so unit tests can run with a fake executor and no database.
 */

const db = require('../database/pool');

const AppError =
  require('../errors/AppError');

const repo =
  require('../repositories/reconciliation.repository');

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 500;

const DEFAULT_SCAN_LIMIT = 2000;
const MAX_SCAN_LIMIT = 20000;

const AMOUNT_EPSILON = 0.01;
const QUANTITY_EPSILON = 1e-6;

const DEFAULT_SECTIONS = {
  journals: true,
  accounts: true,
  sales: true,
  purchases: true,
  stock: true,
  batches: true,
  stockTransactions: true,
  payments: true,
  returns: true,
  softDelete: true,
  dates: true,
  multiCurrency: true,
};

/*
 * Accepts a comma-separated list of section names. Unknown names are
 * ignored; when nothing valid is supplied every section runs so a
 * bare GET returns a complete baseline.
 */
const SECTION_ALIASES = {
  journals: 'journals',
  journal: 'journals',
  accounts: 'accounts',
  account: 'accounts',
  sales: 'sales',
  sale: 'sales',
  purchases: 'purchases',
  purchase: 'purchases',
  stock: 'stock',
  inventory: 'stock',
  batches: 'batches',
  batch: 'batches',
  fifo: 'batches',
  lifo: 'batches',
  stocktransactions: 'stockTransactions',
  stocktransaction: 'stockTransactions',
  stockmovements: 'stockTransactions',
  payments: 'payments',
  payment: 'payments',
  returns: 'returns',
  return: 'returns',
  softdelete: 'softDelete',
  dates: 'dates',
  datequality: 'dates',
  multicurrency: 'multiCurrency',
  currency: 'multiCurrency',
  currencies: 'multiCurrency',
};

function getAuthenticatedIdentity(user) {
  const orgId = Number(user?.org_id);

  if (!Number.isSafeInteger(orgId) || orgId <= 0) {
    throw new AppError(
      'Invalid organization.',
      401,
      'INVALID_ORGANIZATION',
    );
  }

  return { orgId };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const int = Math.trunc(parsed);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

function toPositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveSections(value) {
  const all = Object.keys(DEFAULT_SECTIONS);

  if (value === undefined || value === null || value === '' || value === 'all') {
    return new Set(all);
  }

  const parts = String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/[^a-z]/g, ''))
    .filter(Boolean);

  const resolved = new Set();

  for (const part of parts) {
    const name = SECTION_ALIASES[part];
    if (name) resolved.add(name);
  }

  return resolved.size ? resolved : new Set(all);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function capRows(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const truncated = list.length > limit;

  return {
    rows: truncated ? list.slice(0, limit) : list,
    truncated,
  };
}

function addCounter(counters, severity, amount = 1) {
  if (!amount) return;
  const key = severity === 'error' ? 'errors' : severity === 'warning' ? 'warnings' : 'info';
  counters[key] += amount;
}

/*
 * ------------------------------ builders ------------------------------
 */

async function buildJournals(ctx) {
  const [totals, unbalancedRaw] = await Promise.all([
    repo.findJournalTotals(ctx.executor, { orgId: ctx.orgId }),
    repo.findUnbalancedJournals(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
  ]);

  const byCurrency = {};
  let checked = 0;

  for (const row of totals || []) {
    const currency = row.currency || 'AFN';
    const debit = toNumber(row.debit);
    const credit = toNumber(row.credit);
    const count = toNumber(row.journal_count);

    checked += count;
    byCurrency[currency] = {
      journal_count: count,
      debit,
      credit,
      difference: debit - credit,
    };
  }

  const { rows, truncated } = capRows(unbalancedRaw, ctx.limit);

  const unbalanced = rows.map((row) => {
    const totalDebit = toNumber(row.total_debit);
    const totalCredit = toNumber(row.total_credit);

    return {
      id: row.id,
      date: row.date,
      reference_type: row.reference_type,
      reference_id: row.reference_id,
      currency: row.currency,
      description: row.description,
      total_debit: totalDebit,
      total_credit: totalCredit,
      difference: totalDebit - totalCredit,
    };
  });

  addCounter(ctx.counters, 'error', unbalanced.length);

  return {
    checked,
    totals_by_currency: byCurrency,
    unbalanced,
    truncated,
  };
}

async function buildAccounts(ctx) {
  const [firstPass, secondPass, accountsMeta] = await Promise.all([
    repo.findJournalAccountTotalsFirstPass(ctx.executor, { orgId: ctx.orgId }),
    repo.findJournalAccountTotalsSecondPass(ctx.executor, { orgId: ctx.orgId }),
    repo.findAllAccounts(ctx.executor, { orgId: ctx.orgId }),
  ]);

  const metaById = new Map();
  for (const account of accountsMeta || []) {
    metaById.set(String(account.local_id), account);
  }

  const merged = new Map();

  for (const row of [...(firstPass || []), ...(secondPass || [])]) {
    const accountId = String(row.account_id);
    const currency = row.currency || 'AFN';
    const key = `${accountId}|${currency}`;
    const existing = merged.get(key) || {
      account_id: row.account_id,
      currency,
      debit: 0,
      credit: 0,
      journal_count: 0,
    };

    existing.debit += toNumber(row.debit);
    existing.credit += toNumber(row.credit);
    existing.journal_count += toNumber(row.journal_count);
    merged.set(key, existing);
  }

  const currencyCountByAccount = new Map();
  for (const entry of merged.values()) {
    const accountId = String(entry.account_id);
    currencyCountByAccount.set(
      accountId,
      (currencyCountByAccount.get(accountId) || 0) + 1,
    );
  }

  const differences = [];
  const orphanAccounts = [];

  for (const entry of merged.values()) {
    const accountId = String(entry.account_id);
    const account = metaById.get(accountId);
    const balance = entry.credit - entry.debit;

    if (!account) {
      orphanAccounts.push({
        account_id: entry.account_id,
        currency: entry.currency,
        debit: entry.debit,
        credit: entry.credit,
        balance,
        reason: 'Journal references an account that is missing or inactive.',
      });
      continue;
    }

    const storedBalance =
      account.balance === null || account.balance === undefined
        ? null
        : toNumber(account.balance);

    if (
      storedBalance !== null &&
      currencyCountByAccount.get(accountId) === 1
    ) {
      const difference = storedBalance - balance;

      if (Math.abs(difference) > AMOUNT_EPSILON) {
        differences.push({
          account_id: entry.account_id,
          account_code: account.code,
          account_name: account.name,
          account_type_id: account.account_type_id,
          currency: entry.currency,
          total_debit: entry.debit,
          total_credit: entry.credit,
          calculated_balance: balance,
          stored_balance: storedBalance,
          difference,
        });
      }
    }
  }

  addCounter(ctx.counters, 'error', orphanAccounts.length);
  addCounter(ctx.counters, 'warning', differences.length);

  return {
    checked: merged.size,
    differences,
    orphan_accounts: orphanAccounts,
    stored_balance_is_authoritative: false,
    note:
      'Balances are derived from journals (credit - debit), matching ' +
      'accountService. accounts.balance is reported for comparison only ' +
      'and is never used as the source of truth.',
  };
}

async function buildSales(ctx) {
  const [checked, mismatchRows] = await Promise.all([
    repo.countConfirmedSales(ctx.executor, { orgId: ctx.orgId }),
    repo.findSaleRemainingMismatches(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
  ]);

  const { rows, truncated } = capRows(mismatchRows, ctx.limit);

  const remainingMismatches = rows.map((row) => {
    const stored = toNumber(row.stored_remaining);
    const expected = toNumber(row.expected_remaining);

    return {
      id: row.id,
      invoice_number: row.invoice_number,
      currency: row.currency,
      invoice_status: row.invoice_status,
      total: toNumber(row.total_amount),
      active_payments: toNumber(row.active_payments),
      active_returns: toNumber(row.active_returns),
      expected_remaining: expected,
      stored_remaining: stored,
      difference: stored - expected,
      status: 'ERROR',
    };
  });

  addCounter(ctx.counters, 'error', remainingMismatches.length);

  return {
    checked,
    remaining_mismatches: remainingMismatches,
    truncated,
  };
}

async function buildPurchases(ctx) {
  const [checked, mismatchRows] = await Promise.all([
    repo.countConfirmedPurchases(ctx.executor, { orgId: ctx.orgId }),
    repo.findPurchaseRemainingMismatches(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
  ]);

  const { rows, truncated } = capRows(mismatchRows, ctx.limit);

  const remainingMismatches = rows.map((row) => {
    const stored = toNumber(row.stored_remaining);
    const expected = toNumber(row.expected_remaining);

    return {
      id: row.id,
      bill_number: row.bill_number,
      currency: row.currency,
      bill_status: row.bill_status,
      total: toNumber(row.total_amount),
      active_payments: toNumber(row.active_payments),
      active_returns: toNumber(row.active_returns),
      expected_remaining: expected,
      stored_remaining: stored,
      difference: stored - expected,
      status: 'ERROR',
    };
  });

  addCounter(ctx.counters, 'error', remainingMismatches.length);

  return {
    checked,
    remaining_mismatches: remainingMismatches,
    truncated,
  };
}

function buildStockSection(ctx, productStockRows, warehouseTotalRows) {
  const { rows, truncated } = capRows(productStockRows, ctx.scanLimit);

  const mismatches = [];
  const negativeQuantities = [];
  const productsWithoutWarehouseRow = [];
  const warehouseStockWithoutProductQuantity = [];

  for (const row of rows) {
    const productQuantity = toNumber(row.product_quantity);
    const warehouseQuantity = toNumber(row.warehouse_quantity);
    const rowCount = toNumber(row.warehouse_row_count);

    const difference = productQuantity - warehouseQuantity;

    if (Math.abs(difference) > QUANTITY_EPSILON) {
      mismatches.push({
        product_id: row.product_id,
        name: row.name,
        code: row.code,
        product_quantity: productQuantity,
        warehouse_quantity: warehouseQuantity,
        difference,
        status: 'ERROR',
      });
    }

    if (productQuantity < 0 || warehouseQuantity < 0) {
      negativeQuantities.push({
        product_id: row.product_id,
        name: row.name,
        code: row.code,
        product_quantity: productQuantity,
        warehouse_quantity: warehouseQuantity,
        status: 'WARNING',
      });
    }

    if (rowCount === 0 && Math.abs(productQuantity) > QUANTITY_EPSILON) {
      productsWithoutWarehouseRow.push({
        product_id: row.product_id,
        name: row.name,
        code: row.code,
        product_quantity: productQuantity,
        status: 'WARNING',
      });
    }

    if (warehouseQuantity !== 0 && Math.abs(productQuantity) <= QUANTITY_EPSILON) {
      warehouseStockWithoutProductQuantity.push({
        product_id: row.product_id,
        name: row.name,
        code: row.code,
        warehouse_quantity: warehouseQuantity,
        status: 'WARNING',
      });
    }
  }

  addCounter(ctx.counters, 'error', mismatches.length);
  addCounter(ctx.counters, 'warning', negativeQuantities.length);
  addCounter(ctx.counters, 'warning', productsWithoutWarehouseRow.length);
  addCounter(ctx.counters, 'warning', warehouseStockWithoutProductQuantity.length);

  return {
    checked_products: rows.length,
    scanned_products: productStockRows.length,
    product_warehouse_mismatches: mismatches,
    negative_quantities: negativeQuantities,
    products_without_warehouse_row: productsWithoutWarehouseRow,
    warehouse_stock_without_product_quantity: warehouseStockWithoutProductQuantity,
    warehouse_rows_scanned: warehouseTotalRows.length,
    truncated,
  };
}

async function buildDuplicateAndOrphanWarehouse(ctx) {
  const [duplicatesRaw, negativeRaw, orphansRaw] = await Promise.all([
    repo.findDuplicateWarehouseRows(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
    repo.findNegativeWarehouseQuantities(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
    repo.findOrphanWarehouseRows(ctx.executor, {
      orgId: ctx.orgId,
      limit: ctx.listLimit,
    }),
  ]);

  const duplicates = capRows(duplicatesRaw, ctx.limit);
  const negative = capRows(negativeRaw, ctx.limit);
  const orphans = capRows(orphansRaw, ctx.limit);

  addCounter(ctx.counters, 'error', duplicates.rows.length);
  addCounter(ctx.counters, 'warning', negative.rows.length);
  addCounter(ctx.counters, 'error', orphans.rows.length);

  return {
    duplicate_warehouse_rows: duplicates.rows.map((row) => ({
      warehouse_id: row.warehouse_id,
      product_id: row.product_id,
      row_count: toNumber(row.row_count),
      total_quantity: toNumber(row.total_quantity),
      status: 'ERROR',
    })),
    duplicate_warehouse_rows_truncated: duplicates.truncated,
    negative_warehouse_rows: negative.rows.map((row) => ({
      id: row.id,
      warehouse_id: row.warehouse_id,
      product_id: row.product_id,
      quantity: toNumber(row.quantity),
      status: 'WARNING',
    })),
    negative_warehouse_rows_truncated: negative.truncated,
    orphan_warehouse_rows: orphans.rows.map((row) => ({
      id: row.id,
      warehouse_id: row.warehouse_id,
      product_id: row.product_id,
      quantity: toNumber(row.quantity),
      status: 'ERROR',
    })),
    orphan_warehouse_rows_truncated: orphans.truncated,
  };
}

function buildBatchesSection(ctx, inventoryMethod, productStockRows, warehouseTotalRows, batchByProduct, batchByWarehouse) {
  const isBatchMethod = inventoryMethod === 'FIFO' || inventoryMethod === 'LIFO';

  const productStockById = new Map();
  for (const row of productStockRows) {
    productStockById.set(String(row.product_id), row);
  }

  const batchByProductId = new Map();
  for (const row of batchByProduct) {
    batchByProductId.set(String(row.product_id), row);
  }

  const mismatches = [];

  for (const product of productStockRows) {
    const batch = batchByProductId.get(String(product.product_id));
    const batchRemaining = batch ? toNumber(batch.batch_remaining) : 0;
    const productQuantity = toNumber(product.product_quantity);
    const difference = productQuantity - batchRemaining;

    if (Math.abs(difference) > QUANTITY_EPSILON) {
      mismatches.push({
        product_id: product.product_id,
        name: product.name,
        code: product.code,
        product_quantity: productQuantity,
        batch_remaining: batchRemaining,
        difference,
        status: 'ERROR',
      });
    }
  }

  const warehouseByKey = new Map();
  for (const row of warehouseTotalRows) {
    warehouseByKey.set(`${row.product_id}|${row.warehouse_id}`, toNumber(row.quantity));
  }

  const batchWarehouseByKey = new Map();
  for (const row of batchByWarehouse) {
    batchWarehouseByKey.set(
      `${row.product_id}|${row.warehouse_id}`,
      toNumber(row.batch_remaining),
    );
  }

  const keys = new Set([
    ...warehouseByKey.keys(),
    ...batchWarehouseByKey.keys(),
  ]);

  const warehouseMismatches = [];

  for (const key of keys) {
    const warehouseQuantity = warehouseByKey.get(key) || 0;
    const batchRemaining = batchWarehouseByKey.get(key) || 0;
    const [productId, warehouseId] = key.split('|');

    if (Math.abs(warehouseQuantity - batchRemaining) > QUANTITY_EPSILON) {
      warehouseMismatches.push({
        product_id: productId,
        warehouse_id: warehouseId,
        warehouse_quantity: warehouseQuantity,
        batch_remaining: batchRemaining,
        difference: warehouseQuantity - batchRemaining,
        status: 'ERROR',
      });
    }
  }

  addCounter(ctx.counters, 'error', mismatches.length);
  addCounter(ctx.counters, 'error', warehouseMismatches.length);

  return {
    method: inventoryMethod,
    is_batch_method: isBatchMethod,
    checked_products: productStockRows.length,
    mismatches,
    warehouse_mismatches: warehouseMismatches,
    scanned_products: productStockRows.length,
  };
}

async function buildBatchAnomalies(ctx) {
  const [
    negativeRaw,
    overReceivedRaw,
    orphanBatchRaw,
    orphanSaleRaw,
    consumptionMismatchRaw,
  ] = await Promise.all([
    repo.findNegativeBatches(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findOverReceivedBatches(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findOrphanConsumptionBatches(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findOrphanConsumptionSales(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findBatchConsumptionMismatches(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
  ]);

  const negative = capRows(negativeRaw, ctx.limit);
  const overReceived = capRows(overReceivedRaw, ctx.limit);
  const orphanBatch = capRows(orphanBatchRaw, ctx.limit);
  const orphanSale = capRows(orphanSaleRaw, ctx.limit);
  const consumptionMismatch = capRows(consumptionMismatchRaw, ctx.limit);

  addCounter(ctx.counters, 'error', negative.rows.length);
  addCounter(ctx.counters, 'error', overReceived.rows.length);
  addCounter(ctx.counters, 'error', orphanBatch.rows.length);
  addCounter(ctx.counters, 'error', orphanSale.rows.length);
  addCounter(ctx.counters, 'error', consumptionMismatch.rows.length);

  return {
    negative_batches: negative.rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      warehouse_id: row.warehouse_id,
      source_type: row.source_type,
      source_id: row.source_id,
      quantity_in: toNumber(row.quantity_in),
      quantity_remaining: toNumber(row.quantity_remaining),
      status: 'ERROR',
    })),
    negative_batches_truncated: negative.truncated,
    over_received_batches: overReceived.rows.map((row) => ({
      id: row.id,
      product_id: row.product_id,
      warehouse_id: row.warehouse_id,
      quantity_in: toNumber(row.quantity_in),
      quantity_remaining: toNumber(row.quantity_remaining),
      status: 'ERROR',
    })),
    over_received_batches_truncated: overReceived.truncated,
    orphan_batch_references: orphanBatch.rows,
    orphan_batch_references_truncated: orphanBatch.truncated,
    orphan_sale_references: orphanSale.rows,
    orphan_sale_references_truncated: orphanSale.truncated,
    consumption_mismatches: consumptionMismatch.rows.map((row) => ({
      stock_batch_id: row.stock_batch_id,
      product_id: row.product_id,
      warehouse_id: row.warehouse_id,
      quantity_in: toNumber(row.quantity_in),
      quantity_remaining: toNumber(row.quantity_remaining),
      net_consumed: toNumber(row.net_consumed),
      expected_net_consumed:
        toNumber(row.quantity_in) - toNumber(row.quantity_remaining),
      status: 'ERROR',
    })),
    consumption_mismatches_truncated: consumptionMismatch.truncated,
    note:
      'Batches remain the costing ledger for FIFO/LIFO organizations and ' +
      'must not be reset at year end.',
  };
}

async function buildStockTransactions(ctx) {
  const rows = await repo.findStockTransactionTotals(ctx.executor, {
    orgId: ctx.orgId,
    limit: ctx.scanLimit,
    productId: ctx.productId,
  });

  const { rows: scanned, truncated } = capRows(rows, ctx.scanLimit);

  const mismatches = [];

  for (const row of scanned) {
    const movementQuantity = toNumber(row.movement_quantity);
    const productQuantity = toNumber(row.product_quantity);
    const difference = movementQuantity - productQuantity;

    if (Math.abs(difference) > QUANTITY_EPSILON) {
      mismatches.push({
        product_id: row.product_id,
        name: row.name,
        code: row.code,
        product_unit_id: row.product_unit_id,
        movement_quantity: movementQuantity,
        product_quantity: productQuantity,
        difference,
        status: 'WARNING',
      });
    }
  }

  addCounter(ctx.counters, 'warning', mismatches.length);

  return {
    checked_products: scanned.length,
    mismatches,
    truncated,
    note:
      'Comparison is in raw transaction quantities. Unit conversions and the ' +
      'opening-stock designation are not applied here, so multi-unit products ' +
      'can legitimately differ. Treat differences as a review signal.',
  };
}

async function buildPayments(ctx) {
  const [
    saleOrphansRaw,
    purchaseOrphansRaw,
    parentInactiveRaw,
    journalMissingPaymentRaw,
    missingJournalRaw,
    duplicatesRaw,
  ] = await Promise.all([
    repo.findOrphanSalePayments(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findOrphanPurchasePayments(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findActivePaymentsOnInactiveParents(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findJournalsReferencingMissingPayments(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findPaymentsWithoutJournal(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findPossibleDuplicatePayments(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
  ]);

  const orphans = [
    ...capRows(saleOrphansRaw, ctx.limit).rows.map((row) => ({ ...row, parent_type: 'sale' })),
    ...capRows(purchaseOrphansRaw, ctx.limit).rows.map((row) => ({ ...row, parent_type: 'purchase' })),
  ];

  const parentInactive = capRows(parentInactiveRaw, ctx.limit);
  const journalMissingPayment = capRows(journalMissingPaymentRaw, ctx.limit);
  const missingJournal = capRows(missingJournalRaw, ctx.limit);
  const duplicates = capRows(duplicatesRaw, ctx.limit);

  addCounter(ctx.counters, 'error', orphans.length);
  addCounter(ctx.counters, 'error', parentInactive.rows.length);
  addCounter(ctx.counters, 'error', journalMissingPayment.rows.length);
  addCounter(ctx.counters, 'warning', missingJournal.rows.length);
  addCounter(ctx.counters, 'warning', duplicates.rows.length);

  return {
    orphaned: orphans,
    orphaned_truncated:
      saleOrphansRaw.length > ctx.limit || purchaseOrphansRaw.length > ctx.limit,
    missing_journals: missingJournal.rows,
    missing_journals_truncated: missingJournal.truncated,
    journal_references_missing_payment: journalMissingPayment.rows,
    journal_references_missing_payment_truncated: journalMissingPayment.truncated,
    possible_duplicates: duplicates.rows.map((row) => ({
      parent_type: row.parent_type,
      parent_id: row.parent_id,
      account_id: row.account_id,
      amount: toNumber(row.amount),
      currency: row.currency,
      payment_date: row.payment_date,
      row_count: toNumber(row.row_count),
      payment_ids: row.payment_ids,
      status: 'POSSIBLE_DUPLICATE',
    })),
    possible_duplicates_truncated: duplicates.truncated,
    parent_inactive: parentInactive.rows,
    parent_inactive_truncated: parentInactive.truncated,
    note:
      'Direct sale/purchase payment rows created through the payment ' +
      'endpoints legitimately have no journal in the current design, so ' +
      'missing_journals is informational. journal_references_missing_payment ' +
      'is a hard error.',
  };
}

async function buildReturns(ctx) {
  const [
    saleOrphansRaw,
    purchaseOrphansRaw,
    parentInactiveRaw,
    saleQtyExceedsRaw,
    purchaseQtyExceedsRaw,
    missingJournalRaw,
    missingMovementRaw,
  ] = await Promise.all([
    repo.findOrphanSaleReturns(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findOrphanPurchaseReturns(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findActiveReturnsOnInactiveParents(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findSaleReturnQuantityExceedingSold(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findPurchaseReturnQuantityExceedingPurchased(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findReturnsMissingJournal(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findReturnsMissingStockMovement(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
  ]);

  const issues = [];

  for (const row of capRows(saleOrphansRaw, ctx.limit).rows) {
    issues.push({ ...row, parent_type: 'sale', issue: 'RETURN_PARENT_MISSING', status: 'ERROR' });
  }
  for (const row of capRows(purchaseOrphansRaw, ctx.limit).rows) {
    issues.push({ ...row, parent_type: 'purchase', issue: 'RETURN_PARENT_MISSING', status: 'ERROR' });
  }
  for (const row of capRows(parentInactiveRaw, ctx.limit).rows) {
    issues.push({ ...row, issue: 'RETURN_PARENT_INACTIVE', status: 'ERROR' });
  }
  for (const row of capRows(saleQtyExceedsRaw, ctx.limit).rows) {
    issues.push({
      parent_type: 'sale',
      parent_id: row.sale_id,
      product_id: row.product_id,
      returned_quantity: toNumber(row.returned_quantity),
      sold_or_purchased_quantity: toNumber(row.sold_quantity),
      issue: 'RETURN_QUANTITY_EXCEEDS_SOLD',
      status: 'ERROR',
    });
  }
  for (const row of capRows(purchaseQtyExceedsRaw, ctx.limit).rows) {
    issues.push({
      parent_type: 'purchase',
      parent_id: row.purchase_id,
      product_id: row.product_id,
      returned_quantity: toNumber(row.returned_quantity),
      sold_or_purchased_quantity: toNumber(row.purchased_quantity),
      issue: 'RETURN_QUANTITY_EXCEEDS_PURCHASED',
      status: 'ERROR',
    });
  }
  for (const row of capRows(missingJournalRaw, ctx.limit).rows) {
    issues.push({ ...row, issue: 'RETURN_JOURNAL_MISSING', status: 'WARNING' });
  }
  for (const row of capRows(missingMovementRaw, ctx.limit).rows) {
    issues.push({ ...row, issue: 'RETURN_STOCK_MOVEMENT_MISSING', status: 'WARNING' });
  }

  const errors = issues.filter((issue) => issue.status === 'ERROR').length;
  const warnings = issues.filter((issue) => issue.status === 'WARNING').length;

  addCounter(ctx.counters, 'error', errors);
  addCounter(ctx.counters, 'warning', warnings);

  return {
    checked_issues: issues.length,
    issues,
    truncated:
      issues.length > ctx.limit ||
      saleOrphansRaw.length > ctx.limit ||
      purchaseOrphansRaw.length > ctx.limit,
  };
}

async function buildSoftDelete(ctx) {
  const [
    inactiveReturnJournalRaw,
    inactiveProductStockRaw,
    inactiveAccountJournalRaw,
  ] = await Promise.all([
    repo.findInactiveReturnActiveJournal(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findInactiveProductsWithActiveStock(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
    repo.findInactiveAccountsWithActiveJournals(ctx.executor, { orgId: ctx.orgId, limit: ctx.listLimit }),
  ]);

  const issues = [];

  for (const row of capRows(inactiveReturnJournalRaw, ctx.limit).rows) {
    issues.push({ ...row, issue: 'INACTIVE_RETURN_WITH_ACTIVE_JOURNAL', status: 'ERROR' });
  }
  for (const row of capRows(inactiveProductStockRaw, ctx.limit).rows) {
    issues.push({
      product_id: row.product_id,
      product_quantity: toNumber(row.product_quantity),
      warehouse_quantity: toNumber(row.warehouse_quantity),
      issue: 'INACTIVE_PRODUCT_WITH_ACTIVE_STOCK',
      status: 'ERROR',
    });
  }
  for (const row of capRows(inactiveAccountJournalRaw, ctx.limit).rows) {
    issues.push({
      account_id: row.account_id,
      code: row.code,
      name: row.name,
      journal_count: toNumber(row.journal_count),
      issue: 'INACTIVE_ACCOUNT_WITH_ACTIVE_JOURNALS',
      status: 'ERROR',
    });
  }

  addCounter(ctx.counters, 'error', issues.length);

  return {
    checked_issues: issues.length,
    issues,
    note:
      'Active payments on inactive sales/purchases are reported in the ' +
      'payments section (parent_inactive).',
  };
}

async function buildDates(ctx) {
  const [qualityRows, columnRows] = await Promise.all([
    repo.findDateQuality(ctx.executor, { orgId: ctx.orgId }),
    repo.findFinancialDateColumns(ctx.executor).catch(() => []),
  ]);

  const issues = [];

  for (const row of qualityRows) {
    const nullCount = toNumber(row.null_count);
    const malformedCount = toNumber(row.malformed_count);

    if (malformedCount > 0) {
      issues.push({
        table: row.table,
        column: row.column,
        issue: 'MALFORMED_DATE_VALUES',
        count: malformedCount,
        min_value: row.min_value,
        max_value: row.max_value,
        status: 'ERROR',
      });
    }

    if (nullCount > 0) {
      issues.push({
        table: row.table,
        column: row.column,
        issue: 'NULL_DATE_VALUES',
        count: nullCount,
        total_rows: toNumber(row.total_rows),
        min_value: row.min_value,
        max_value: row.max_value,
        status: 'WARNING',
      });
    }
  }

  addCounter(
    ctx.counters,
    'error',
    issues.filter((issue) => issue.status === 'ERROR').length,
  );
  addCounter(
    ctx.counters,
    'warning',
    issues.filter((issue) => issue.status === 'WARNING').length,
  );

  return {
    checked_fields: qualityRows.length,
    summary: qualityRows.map((row) => ({
      table: row.table,
      column: row.column,
      total_rows: toNumber(row.total_rows),
      null_count: toNumber(row.null_count),
      malformed_count: toNumber(row.malformed_count),
      min_value: row.min_value,
      max_value: row.max_value,
    })),
    columns: columnRows,
    issues,
  };
}

async function buildMultiCurrency(ctx) {
  const [currencies, crossCurrencyRows] = await Promise.all([
    repo.findCurrencies(ctx.executor, { orgId: ctx.orgId }),
    repo.findCrossCurrencyJournals(ctx.executor, { orgId: ctx.orgId }),
  ]);

  const crossCurrency = {};
  for (const row of crossCurrencyRows || []) {
    crossCurrency[row.reference_kind] = toNumber(row.mismatch_count);
  }

  return {
    currencies: (currencies || []).map((row) => ({
      code: row.code,
      is_default: Number(row.isDefault) === 1 ? 1 : 0,
      exchange_rate: toNumber(row.exchangeRate, 1),
      exchange_rate_date: row.exchangeRateDate || null,
    })),
    cross_currency_journals: crossCurrency,
    historical_rates_stored: false,
    note:
      'Exchange rates live on the current currencies row and are not ' +
      'versioned. Foreign-currency payments are converted at payment time ' +
      'and stored in the bill currency, so the original rate is not ' +
      'recoverable from the database.',
  };
}

/*
 * ------------------------------ orchestration ------------------------------
 */

function finalizeSummary(counters, sectionErrors) {
  const status =
    counters.errors > 0
      ? 'ERROR'
      : counters.warnings > 0
        ? 'WARNING'
        : 'OK';

  return {
    status,
    errors: counters.errors,
    warnings: counters.warnings,
    info: counters.info,
    section_errors: sectionErrors,
  };
}

async function getReconciliationReport({
  user,
  filters = {},
  executor = db,
}) {
  const { orgId } = getAuthenticatedIdentity(user);

  const limit = clampInt(
    filters.limit,
    DEFAULT_LIST_LIMIT,
    1,
    MAX_LIST_LIMIT,
  );
  const scanLimit = clampInt(
    filters.scan_limit,
    DEFAULT_SCAN_LIMIT,
    1,
    MAX_SCAN_LIMIT,
  );
  const productId = toPositiveInt(filters.product_id);
  const listLimit = limit + 1;

  const sections = resolveSections(filters.sections);
  const counters = { errors: 0, warnings: 0, info: 0 };
  const sectionErrors = [];

  const ctx = {
    executor,
    orgId,
    limit,
    scanLimit,
    listLimit,
    productId,
    counters,
  };

  const report = {
    org_id: orgId,
    generated_at: new Date().toISOString(),
    read_only: true,
    filters: {
      sections: [...sections],
      limit,
      scan_limit: scanLimit,
      product_id: productId,
    },
    organization: {
      inventory_method: 'UNKNOWN',
    },
  };

  try {
    report.organization.inventory_method =
      await repo.findInventoryMethod(executor, { orgId });
  } catch (error) {
    sectionErrors.push({ section: 'organization', message: error.message });
  }

  const sectionMap = {
    journals: () => buildJournals(ctx),
    accounts: () => buildAccounts(ctx),
    sales: () => buildSales(ctx),
    purchases: () => buildPurchases(ctx),
  };

  for (const [name, builder] of Object.entries(sectionMap)) {
    if (!sections.has(name)) {
      report[name] = { skipped: true };
      continue;
    }

    try {
      report[name] = await builder();
    } catch (error) {
      sectionErrors.push({ section: name, message: error.message });
      counters.errors += 1;
      report[name] = { error: error.message };
    }
  }

  /*
   * Stock + batches share the expensive grouped scans so each table is
   * read once no matter how many sections are requested.
   */
  const needsStockData = sections.has('stock') || sections.has('batches');

  let productStockRows = [];
  let warehouseTotalRows = [];
  let batchByProduct = [];
  let batchByWarehouse = [];

  if (needsStockData) {
    const wantsBatches = sections.has('batches');

    try {
      [productStockRows, warehouseTotalRows, batchByProduct, batchByWarehouse] =
        await Promise.all([
          repo.findProductStock(executor, {
            orgId,
            limit: scanLimit,
            productId,
          }),
          repo.findWarehouseTotals(executor, { orgId, productId }),
          wantsBatches
            ? repo.findBatchTotalsByProduct(executor, { orgId, productId })
            : Promise.resolve([]),
          wantsBatches
            ? repo.findBatchTotalsByWarehouse(executor, { orgId, productId })
            : Promise.resolve([]),
        ]);
    } catch (error) {
      sectionErrors.push({ section: 'stock', message: error.message });
      counters.errors += 1;
      if (sections.has('stock')) report.stock = { error: error.message };
      if (sections.has('batches')) report.batches = { error: error.message };
    }
  }

  if (!report.stock) {
    if (sections.has('stock')) {
      try {
        const stockSection = buildStockSection(ctx, productStockRows, warehouseTotalRows);
        const warehouseSection = await buildDuplicateAndOrphanWarehouse(ctx);
        report.stock = { ...stockSection, ...warehouseSection };
      } catch (error) {
        sectionErrors.push({ section: 'stock', message: error.message });
        counters.errors += 1;
        report.stock = { error: error.message };
      }
    } else {
      report.stock = { skipped: true };
    }
  }

  if (!report.batches) {
    if (sections.has('batches')) {
      try {
        const batchSection = buildBatchesSection(
          ctx,
          report.organization.inventory_method,
          productStockRows,
          warehouseTotalRows,
          batchByProduct,
          batchByWarehouse,
        );
        const anomalies = await buildBatchAnomalies(ctx);
        report.batches = { ...batchSection, ...anomalies };
      } catch (error) {
        sectionErrors.push({ section: 'batches', message: error.message });
        counters.errors += 1;
        report.batches = { error: error.message };
      }
    } else {
      report.batches = { skipped: true };
    }
  }

  const remainingMap = {
    stockTransactions: () => buildStockTransactions(ctx),
    payments: () => buildPayments(ctx),
    returns: () => buildReturns(ctx),
    softDelete: () => buildSoftDelete(ctx),
    dates: () => buildDates(ctx),
    multiCurrency: () => buildMultiCurrency(ctx),
  };

  for (const [name, builder] of Object.entries(remainingMap)) {
    if (!sections.has(name)) {
      report[name] = { skipped: true };
      continue;
    }

    try {
      report[name] = await builder();
    } catch (error) {
      sectionErrors.push({ section: name, message: error.message });
      counters.errors += 1;
      report[name] = { error: error.message };
    }
  }

  report.summary = finalizeSummary(counters, sectionErrors);

  return report;
}

module.exports = {
  getReconciliationReport,
  DEFAULT_SECTIONS,
  AMOUNT_EPSILON,
  QUANTITY_EPSILON,
};
