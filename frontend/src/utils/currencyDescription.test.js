import { describe, expect, it } from 'vitest';
import { replaceCurrencyNamesWithSymbols } from './currencyDescription.js';

describe('replaceCurrencyNamesWithSymbols', () => {
  const currencies = [
    { code: 'AFN', symbol: '؋' },
    { code: 'EUR', symbol: '€' },
  ];
  const translate = (code) => ({ AFN: 'افغانی', EUR: 'یورو' })[code] || code;

  it('replaces currency names after amounts', () => {
    expect(
      replaceCurrencyNamesWithSymbols('مجموع فروش: 29,979.5 افغانی', currencies, translate),
    ).toBe('مجموع فروش: 29,979.5 ؋');
  });

  it('replaces currency names before amounts', () => {
    expect(
      replaceCurrencyNamesWithSymbols('پرداخت: افغانی 100.167', currencies, translate),
    ).toBe('پرداخت: ؋ 100.167');
  });

  it('replaces multiple currencies without changing unrelated text', () => {
    expect(
      replaceCurrencyNamesWithSymbols(
        'مجموع: 10 افغانی | پرداخت: 7 یورو | حساب افغانی',
        currencies,
        translate,
      ),
    ).toBe('مجموع: 10 ؋ | پرداخت: 7 € | حساب افغانی');
  });
});
