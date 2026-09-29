import { describe, expect, it } from 'vitest';
import { repriceSaleItem } from './saleCurrencyPrices.js';

describe('repriceSaleItem', () => {
  const rates = { AFN: 1, USD: 70.13, EUR: 77.41 };
  const convert = (amount, from, to) => (amount / rates[to]) * rates[from];

  it('restores the exact original price after a currency round trip', () => {
    const original = {
      quantity: 2,
      calculated_price: 100,
      unit_price: 100,
      currency: 'AFN',
      buy_price: 100,
      buy_price_currency: 'AFN',
    };

    const usd = repriceSaleItem(original, 'AFN', 'USD', convert);
    const restored = repriceSaleItem(usd, 'USD', 'AFN', convert);

    expect(restored.calculated_price).toBe(100);
    expect(restored.unit_price).toBe(100);
    expect(restored.subtotal).toBe(200);
    expect(restored.buy_price).toBe(100);
    expect(restored.buy_price_currency).toBe('AFN');
  });

  it('keeps a user-edited price when returning to that currency', () => {
    let usd = repriceSaleItem(
      { quantity: 1, calculated_price: 100, unit_price: 100, currency: 'AFN' },
      'AFN',
      'USD',
      convert,
    );
    usd = { ...usd, calculated_price: 2.25, unit_price: 2.25 };

    const eur = repriceSaleItem(usd, 'USD', 'EUR', convert);
    const restored = repriceSaleItem(eur, 'EUR', 'USD', convert);

    expect(restored.calculated_price).toBe(2.25);
    expect(restored.unit_price).toBe(2.25);
  });
});
