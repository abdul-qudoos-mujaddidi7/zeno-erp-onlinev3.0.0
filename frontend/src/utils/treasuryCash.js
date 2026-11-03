/*
 * Treasury cash for the exchange form.
 *
 * Money leaves a cash account on the credit side, so what the treasury holds is
 * debit - credit per currency: the negation of the balance the API reports
 * (credit - debit). Nothing here converts or nets between currencies, and a
 * debit on the treasury brings money in, so it never has to be covered.
 */

/** Cash on hand per currency from a `{ currency: credit - debit }` bucket. */
export function cashOnHand(bucket = {}) {
  return Object.entries(bucket || {}).reduce((map, [currency, balance]) => {
    map[currency] = -Number(balance || 0);
    return map;
  }, {});
}

/**
 * The legs a voucher takes out of the treasury, summed per currency.
 * `sides` carries the credit each side posts; an incoming side posts 0.
 */
export function outgoingTreasuryLegs({ treasuryId, sides = [] }) {
  const legs = new Map();

  for (const side of sides) {
    if (Number(side?.account) !== Number(treasuryId)) continue;

    const amount = Number(side?.credit || 0);
    if (!(amount > 0)) continue;

    const currency = side.currency || 'AFN';
    legs.set(currency, (legs.get(currency) || 0) + amount);
  }

  return [...legs].map(([currency, amount]) => ({ currency, amount }));
}

/**
 * What an already-saved voucher gives back to the treasury when its journals
 * are reversed: its credits return cash, its debits take it away again.
 */
export function reversedTreasuryMovement({ exchange, treasuryId, currency }) {
  if (!exchange) return 0;

  const code = currency || 'AFN';
  const sides = [
    {
      account: exchange.first_entry_account,
      currency: exchange.first_currency,
      debit: exchange.first_entry_debit,
      credit: exchange.first_entry_credit,
    },
    {
      account: exchange.second_entry_account,
      currency: exchange.second_currency,
      debit: exchange.second_entry_debit,
      credit: exchange.second_entry_credit,
    },
  ];

  return sides.reduce((movement, side) => {
    if (Number(side.account) !== Number(treasuryId)) return movement;
    if ((side.currency || 'AFN') !== code) return movement;

    return movement + Number(side.credit || 0) - Number(side.debit || 0);
  }, 0);
}

/**
 * The first leg the treasury cannot cover, or null when every leg is covered.
 * `reversalFor(currency)` adds what an edited voucher gives back before the
 * replacement is measured, mirroring the order the server checks in.
 */
export function firstTreasuryShortfall({
  legs = [],
  cash = {},
  reversalFor = null,
}) {
  for (const leg of legs) {
    const required = Number(leg.amount || 0);
    const available =
      Number(cash?.[leg.currency] || 0) +
      Number(reversalFor ? reversalFor(leg.currency) : 0);

    if (available + 1e-9 < required) {
      return { currency: leg.currency, available, required };
    }
  }

  return null;
}
