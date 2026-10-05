import { productReportAmounts } from './productReportAmounts.js';

function addAmount(totals, key, value) {
  const normalizedKey = String(key || '').trim();
  totals[normalizedKey] = (totals[normalizedKey] || 0) + (Number(value) || 0);
}

export function buildProductReportRows(rows, selectedProductIds = [], { showBills = false, forExport = false } = {}) {
  if (!selectedProductIds.length || showBills) return rows;
  if (forExport) return aggregateProductItemsForExport(rows);
  return selectedProductIds
    .map((productId) => aggregateSelectedProductItems(
      rows.filter((row) => Number(row.product_id) === Number(productId)),
    ))
    .filter(Boolean);
}

export function aggregateSelectedProductItems(rows = []) {
  if (!rows.length) return null;

  const first = rows[0];
  const quantities = {};
  const balances = {};
  const costs = {};
  const benefits = {};
  const accountIds = new Set();

  for (const row of rows) {
    addAmount(
      quantities,
      row.product_unit_name || row.product_unit_id || '',
      row.quantity,
    );
    addAmount(balances, row.currency, row.subtotal);
    addAmount(costs, row.currency, row.total_cost);
    addAmount(benefits, row.currency, row.gross_benefit);
    if (row.account_id != null) accountIds.add(String(row.account_id));
  }

  return {
    ...first,
    id: `product-total-${first.product_id}`,
    is_product_total: true,
    source_count: rows.length,
    account_count: accountIds.size,
    quantities,
    balances,
    costs,
    benefits,
  };
}

export function aggregateProductItemsForExport(rows = []) {
  const groups = new Map();

  for (const row of rows) {
    const key = [row.product_id, row.product_unit_id, row.currency || ''].join('|');
    const amounts = productReportAmounts(row);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...row,
        quantity: Number(row.quantity) || 0,
        subtotal: Number(row.subtotal) || 0,
        total_cost: Number(row.total_cost) || 0,
        gross_benefit: Number(row.gross_benefit) || 0,
        report_gross_amount: amounts.gross,
        report_discount_amount: amounts.discount,
        report_final_amount: amounts.final,
        source_count: 1,
        is_product_total: true,
      });
      continue;
    }

    existing.quantity += Number(row.quantity) || 0;
    existing.subtotal += Number(row.subtotal) || 0;
    existing.report_gross_amount += amounts.gross;
    existing.report_discount_amount += amounts.discount;
    existing.report_final_amount += amounts.final;
    existing.total_cost += Number(row.total_cost) || 0;
    existing.gross_benefit += Number(row.gross_benefit) || 0;
    existing.source_count += 1;

    const currentDate = new Date(existing.created_at || 0).getTime();
    const rowDate = new Date(row.created_at || 0).getTime();
    if (rowDate > currentDate) existing.created_at = row.created_at;
  }

  return [...groups.values()].map((row) => ({
    ...row,
    unit_price: row.quantity ? row.report_gross_amount / row.quantity : 0,
  }));
}
