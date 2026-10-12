// Keep every currency's balance at this transaction, including currencies
// unchanged by the row. Newer movements include rows hidden by pagination.
export function accountRunningBalance(row, closingBalances, defaultCurrency) {
  const movements = row.newer_movements || {};
  const currencies = new Set([
    ...Object.keys(closingBalances || {}),
    ...Object.keys(movements),
    row.currency || defaultCurrency || 'DEFAULT',
  ]);
  const balances = {};
  for (const currency of currencies) {
    balances[currency] = (Number(closingBalances?.[currency]) || 0)
      - (Number(movements[currency]) || 0);
  }
  return balances;
}
