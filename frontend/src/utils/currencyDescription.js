const AMOUNT_PATTERN = '[+-]?[0-9۰-۹٠-٩]+(?:[,.٬٫][0-9۰-۹٠-٩]+)*';

export function replaceCurrencyNamesWithSymbols(description, currencies, translateCurrency) {
  let formatted = String(description ?? '');
  const currencyNames = (currencies || [])
    .map((currency) => {
      const name = translateCurrency(currency.code);
      return {
        name,
        symbol: currency.symbol || name,
      };
    })
    .filter(({ name, symbol }) => name && symbol && name !== symbol)
    .sort((left, right) => right.name.length - left.name.length);

  for (const { name, symbol } of currencyNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const amountBeforeName = new RegExp(
      `(${AMOUNT_PATTERN})\\s+${escapedName}(?![\\p{L}\\p{N}])`,
      'gu',
    );
    const nameBeforeAmount = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapedName}\\s+(${AMOUNT_PATTERN})(?![\\p{L}\\p{N}])`,
      'gu',
    );

    formatted = formatted
      .replace(amountBeforeName, (_match, amount) => `${amount} ${symbol}`)
      .replace(nameBeforeAmount, (_match, prefix, amount) => `${prefix}${symbol} ${amount}`);
  }

  return formatted;
}
