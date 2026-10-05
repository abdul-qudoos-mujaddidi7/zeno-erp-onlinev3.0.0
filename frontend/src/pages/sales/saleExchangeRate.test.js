import { describe, expect, it } from 'vitest';
import { saleRatePair, saleRateUpdate } from './saleExchangeRate.js';

describe('sale exchange rate quotes', () => {
  const currencies = [
    { id: 1, code: 'AFN', isDefault: 1, exchangeRate: 1 },
    { id: 2, code: 'USD', isDefault: 0, exchangeRate: 70 },
    { id: 3, code: 'EUR', isDefault: 0, exchangeRate: 80 },
  ];

  it('quotes USD and EUR in Afghanis, including when Afghanis are selected', () => {
    expect(saleRatePair(currencies, 'USD')).toEqual({ from: 'USD', to: 'AFN' });
    expect(saleRatePair(currencies, 'EUR')).toEqual({ from: 'EUR', to: 'AFN' });
    expect(saleRatePair(currencies, 'AFN', 'USD')).toEqual({ from: 'USD', to: 'AFN' });
    expect(saleRatePair(currencies, 'AFN', 'EUR')).toEqual({ from: 'EUR', to: 'AFN' });
    const afg = currencies.map((row) => row.code === 'AFN' ? { ...row, code: 'AFG' } : row);
    expect(saleRatePair(afg, 'USD')).toEqual({ from: 'USD', to: 'AFG' });
  });

  it('saves the foreign rate when Afghanis are the base', () => {
    const update = saleRateUpdate(currencies, 'USD', 'AFN', 72);
    expect(update.currency.code).toBe('USD');
    expect(update.exchangeRate).toBe(72);
  });

  it('saves the reciprocal Afghani rate when USD is the base', () => {
    const usdBase = currencies.map((row) => ({ ...row,
      isDefault: row.code === 'USD' ? 1 : 0,
      exchangeRate: row.exchangeRate / 70,
    }));
    const update = saleRateUpdate(usdBase, 'USD', 'AFN', 72);
    expect(update.currency.code).toBe('AFN');
    expect(update.exchangeRate).toBeCloseTo(1 / 72, 12);
    expect(usdBase[1].exchangeRate / update.exchangeRate).toBe(72);
    const euro = saleRateUpdate(usdBase, 'EUR', 'AFN', 84);
    expect(euro.exchangeRate / usdBase[0].exchangeRate).toBe(84);
  });

  it('rejects invalid rates before they can be saved', () => {
    for (const rate of [0, -1, '', NaN, Infinity]) {
      expect(() => saleRateUpdate(currencies, 'USD', 'AFN', rate)).toThrow('invalid-rate');
    }
  });
});
