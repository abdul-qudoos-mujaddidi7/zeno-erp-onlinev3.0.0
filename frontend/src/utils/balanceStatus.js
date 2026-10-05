// Account balances are credit minus debit; zero has neither status.
export function balanceStatus(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return '';
  return amount < 0 ? 'Debit' : 'Credit';
}
