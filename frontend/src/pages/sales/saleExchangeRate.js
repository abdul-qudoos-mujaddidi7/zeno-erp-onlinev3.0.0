const isAfghani = (code) => ['AFN', 'AFG'].includes(String(code).toUpperCase());

// Match Settings: quote one foreign unit in Afghanis whenever available.
export function saleRatePair(currencies, selectedCode, otherCode) {
  const afghani = currencies.find((currency) => isAfghani(currency.code));
  const base = currencies.find((currency) => Number(currency.isDefault) === 1);
  if (afghani) {
    const foreign = !isAfghani(selectedCode)
      ? currencies.find((currency) => currency.code === selectedCode)
      : currencies.find((currency) => currency.code === otherCode && !isAfghani(currency.code)) ||
        currencies.find((currency) => currency.code === 'USD') ||
        currencies.find((currency) => !isAfghani(currency.code));
    return { from: foreign?.code || afghani.code, to: afghani.code };
  }
  const other = currencies.find((currency) => currency.code === otherCode && currency.code !== selectedCode) ||
    (base?.code !== selectedCode ? base : null) ||
    currencies.find((currency) => currency.code !== selectedCode);
  return { from: selectedCode, to: other?.code || selectedCode };
}

// Stored rates are relative to the base. Keep its rate at 1 even when it is
// on the left of the displayed quote (e.g. USD base: 1 USD = 70 AFN).
export function saleRateUpdate(currencies, fromCode, toCode, displayRate) {
  const rate = Number(displayRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid-rate');
  const from = currencies.find((currency) => currency.code === fromCode);
  const to = currencies.find((currency) => currency.code === toCode);
  if (!from || !to || fromCode === toCode) throw new Error('invalid-pair');
  return Number(from.isDefault) === 1
    ? { currency: to, exchangeRate: Number(from.exchangeRate || 1) / rate }
    : { currency: from, exchangeRate: rate * Number(to.exchangeRate || 1) };
}
