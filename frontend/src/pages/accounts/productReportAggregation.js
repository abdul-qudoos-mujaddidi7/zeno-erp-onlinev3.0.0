function addAmount(totals, key, value) {
  const normalizedKey = String(key || '').trim();
  totals[normalizedKey] = (totals[normalizedKey] || 0) + (Number(value) || 0);
}

export function aggregateSelectedProductItems(rows = []) {
  if (!rows.length) return null;

  const first = rows[0];
  const quantities = {};
  const balances = {};
  const accountIds = new Set();

  for (const row of rows) {
    addAmount(
      quantities,
      row.product_unit_name || row.product_unit_id || '',
      row.quantity,
    );
    addAmount(balances, row.currency, row.subtotal);
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
  };
}
