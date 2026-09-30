/**
 * Top-debtor ranking for the dashboard overview.
 *
 * The repository reports one row per customer account and currency, already
 * filtered to accounts that trade as customers and to a positive receivable.
 * A customer who owes in more than one currency is one debtor, so the rows are
 * folded into a single entry whose total is expressed in the organization's
 * default currency (that is the only way a mixed-currency list can be ranked),
 * while the raw per-currency figures travel along for the card to show.
 *
 * Conversion keeps the direction the dashboard totals already use, so this
 * ranking can never disagree with the treasury / inventory figures beside it.
 */

function convertAmount(amount, fromCode, toCode, rateMap = {}) {
  if (!fromCode || !toCode || fromCode === toCode) {
    return Number(amount) || 0;
  }

  const fromRate = rateMap[fromCode] || 1;
  const toRate = rateMap[toCode] || 1;

  return ((Number(amount) || 0) / toRate) * fromRate;
}

function round(amount) {
  return Number((Number(amount) || 0).toFixed(3));
}

function buildTopDebtors(rows, {
  defaultCurrency = 'AFN',
  rateMap = {},
  limit = 8,
} = {}) {
  const debtors = new Map();
  let sum = 0;

  for (const row of rows || []) {
    const accountId = Number(row.account_id);
    const amount = Number(row.receivable) || 0;

    if (!Number.isSafeInteger(accountId) || accountId <= 0) continue;
    if (!(amount > 0)) continue;

    const currency = row.currency || defaultCurrency;
    const inDefault = convertAmount(amount, currency, defaultCurrency, rateMap);

    if (!debtors.has(accountId)) {
      debtors.set(accountId, {
        account_id: accountId,
        name: row.name || '',
        code: row.code || '',
        currency: defaultCurrency,
        amount: 0,
        by_currency: {},
      });
    }

    const debtor = debtors.get(accountId);

    if (!debtor.name && row.name) debtor.name = row.name;
    if (!debtor.code && row.code) debtor.code = row.code;

    debtor.amount += inDefault;
    debtor.by_currency[currency] = (debtor.by_currency[currency] || 0) + amount;
    sum += inDefault;
  }

  const max = Math.max(1, Number(limit) || 8);

  const items = [...debtors.values()]
    .map((debtor) => ({
      ...debtor,
      amount: round(debtor.amount),
      by_currency: Object.fromEntries(
        Object.entries(debtor.by_currency).map(([currency, value]) => [
          currency,
          round(value),
        ]),
      ),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, max);

  return {
    total: debtors.size,
    default_currency: defaultCurrency,
    sum: round(sum),
    items,
  };
}

module.exports = {
  convertAmount,
  buildTopDebtors,
};
