function numericPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? price : 0;
}

function priceSnapshot(item) {
  return {
    calculated_price: numericPrice(item?.calculated_price),
    unit_price: numericPrice(item?.unit_price),
  };
}

/**
 * Re-express a sale item without losing the exact value already entered in a
 * currency. Currency conversion is commonly rounded for display; converting
 * that rounded result back creates price drift. The per-currency snapshots
 * make a round trip lossless while still preserving edits made by the user.
 */
export function repriceSaleItem(item, fromCode, toCode, convertAmount) {
  if (!item || !fromCode || !toCode || fromCode === toCode) return item;

  const pricesByCurrency = {
    ...(item._pricesByCurrency || {}),
    [fromCode]: priceSnapshot(item),
  };
  const cachedTarget = pricesByCurrency[toCode];
  const target = cachedTarget || {
    calculated_price:
      Math.round(convertAmount(numericPrice(item.calculated_price), fromCode, toCode) * 100) /
      100,
    unit_price:
      Math.round(convertAmount(numericPrice(item.unit_price), fromCode, toCode) * 100) / 100,
  };

  pricesByCurrency[toCode] = target;

  return {
    ...item,
    _pricesByCurrency: pricesByCurrency,
    calculated_price: target.calculated_price,
    unit_price: target.unit_price,
    currency: toCode,
    subtotal: numericPrice(item.quantity) * target.calculated_price,
  };
}
