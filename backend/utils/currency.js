const currencyRepository =
  require('../repositories/currency.repository');

/*
 * Returns the org's stored exchange rate for a currency code,
 * defaulting to 1 (the base rate) when the row is missing.
 */
async function getCurrencyRate(
  executor,
  {
    orgId,
    code,
  },
) {
  if (!code) {
    return 1;
  }

  const row =
    await currencyRepository.findByCode(
      executor,
      {
        orgId,
        code,
      },
    );

  return Number(row?.exchangeRate) || 1;
}

/*
 * Converts an amount from one currency to another using the org's
 * stored exchange rates, mirroring the frontend formula used in the
 * sale/purchase forms: (amount / toRate) * fromRate.
 *
 * Returns the amount unchanged when the currencies are the same or
 * either rate cannot be resolved.
 */
async function convertCurrencyAmount(
  executor,
  {
    orgId,
    amount,
    fromCurrency,
    toCurrency,
  },
) {
  if (
    !fromCurrency ||
    !toCurrency ||
    fromCurrency === toCurrency
  ) {
    return Number(amount) || 0;
  }

  const [fromRate, toRate] = await Promise.all([
    getCurrencyRate(executor, { orgId, code: fromCurrency }),
    getCurrencyRate(executor, { orgId, code: toCurrency }),
  ]);

  return ((Number(amount) || 0) / toRate) * fromRate;
}

module.exports = {
  getCurrencyRate,
  convertCurrencyAmount,
};
