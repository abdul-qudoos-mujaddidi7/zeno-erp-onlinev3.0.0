import { describe, expect, it } from 'vitest';

import { amountInWords } from './amountInWords.js';

/*
 * The words a bill prints under its NET Total. A bill is read by a customer and
 * checked by an auditor, so the exact wording is asserted here rather than left
 * to whatever the browser's Intl data happens to return.
 */

describe('amountInWords — English', () => {
  it('spells the whole numbers the way a bill reads them', () => {
    expect(amountInWords(400, 'en')).toBe('Four Hundred');
    expect(amountInWords(100, 'en')).toBe('One Hundred');
    expect(amountInWords(1320, 'en')).toBe('One Thousand Three Hundred Twenty');
    expect(amountInWords(7, 'en')).toBe('Seven');
    expect(amountInWords(21, 'en')).toBe('Twenty One');
    expect(amountInWords(1005, 'en')).toBe('One Thousand Five');
    expect(amountInWords(1000000, 'en')).toBe('One Million');
  });

  it('spells zero rather than printing nothing', () => {
    expect(amountInWords(0, 'en')).toBe('Zero');
    expect(amountInWords('0.00', 'en')).toBe('Zero');
  });

  it('names the hundredth "Cent", pluralised for anything but one', () => {
    expect(amountInWords(400.5, 'en')).toBe('Four Hundred and Fifty Cents');
    expect(amountInWords(400.01, 'en')).toBe('Four Hundred and One Cent');
    expect(amountInWords(400.25, 'en')).toBe('Four Hundred and Twenty Five Cents');
  });

  it('keeps a ratio for anything finer than a hundredth', () => {
    expect(amountInWords(400.005, 'en')).toBe('Four Hundred and 5/1000');
  });

  it('names the hundredth after the currency label the bill passes', () => {
    expect(amountInWords(400.5, 'en', { currency: 'USD' })).toBe(
      'Four Hundred USD and Fifty Cents',
    );
  });

  it('keeps the sign for a negative balance', () => {
    expect(amountInWords(-25, 'en')).toBe('Minus Twenty Five');
  });
});

describe('amountInWords — Persian / Dari', () => {
  it('joins every part with و', () => {
    expect(amountInWords(400, 'fa')).toBe('چهارصد');
    expect(amountInWords(1320, 'fa')).toBe('یک هزار و سیصد و بیست');
    expect(amountInWords(25, 'fa')).toBe('بیست و پنج');
    expect(amountInWords(100, 'fa')).toBe('صد');
    expect(amountInWords(1005, 'fa')).toBe('یک هزار و پنج');
  });

  it('names the hundredth "پول", whatever the currency', () => {
    expect(amountInWords(400.5, 'fa')).toBe('چهارصد و پنجاه پول');
    expect(amountInWords(400.5, 'fa', { currency: 'افغانی' })).toBe(
      'چهارصد افغانی و پنجاه پول',
    );
    expect(amountInWords(400.5, 'fa', { currency: 'دالر' })).toBe('چهارصد دالر و پنجاه پول');
  });

  it('spells the hundredths as a number of its own', () => {
    expect(amountInWords(400.55, 'fa', { currency: 'افغانی' })).toBe(
      'چهارصد افغانی و پنجاه و پنج پول',
    );
    expect(amountInWords(400.05, 'fa', { currency: 'افغانی' })).toBe('چهارصد افغانی و پنج پول');
  });

  it('keeps the whole amount named when there is no fraction', () => {
    expect(amountInWords(400, 'fa', { currency: 'افغانی' })).toBe('چهارصد افغانی');
  });

  it('keeps a ratio for a fraction finer than a hundredth, so the words still match the figures', () => {
    expect(amountInWords(400.005, 'fa', { currency: 'افغانی' })).toBe(
      'چهارصد افغانی و ۵/۱۰۰۰',
    );
  });

  it('names zero units when only the small money is present', () => {
    expect(amountInWords(0.5, 'fa', { currency: 'افغانی' })).toBe('صفر افغانی و پنجاه پول');
  });

  it('keeps the sign in front of the whole phrase', () => {
    expect(amountInWords(-400.5, 'fa', { currency: 'افغانی' })).toBe(
      'منفی چهارصد افغانی و پنجاه پول',
    );
  });
});

describe('amountInWords — Pashto', () => {
  it('prefixes the unit to the tens stem, as Pashto does', () => {
    expect(amountInWords(400, 'ps')).toBe('څلور سوه');
    expect(amountInWords(21, 'ps')).toBe('یوویشت');
    expect(amountInWords(1320, 'ps')).toBe('یو زر او درې سوه او شل');
    expect(amountInWords(100, 'ps')).toBe('سل');
  });

  it('names the hundredth "پیسی" in its own numerals-free wording', () => {
    expect(amountInWords(400.5, 'ps')).toBe('څلور سوه او پنځوس پیسی');
    expect(amountInWords(400.5, 'ps', { currency: 'افغانۍ' })).toBe(
      'څلور سوه افغانۍ او پنځوس پیسی',
    );
    expect(amountInWords(400.5, 'ps', { currency: 'ډالر' })).toBe('څلور سوه ډالر او پنځوس پیسی');
  });

  it('keeps a ratio for anything finer than a hundredth', () => {
    expect(amountInWords(400.005, 'ps')).toBe('څلور سوه او ۵/۱۰۰۰');
  });
});

describe('amountInWords — input handling', () => {
  it('accepts the shapes a sale row arrives in', () => {
    expect(amountInWords('1,320.00', 'en')).toBe('One Thousand Three Hundred Twenty');
    expect(amountInWords('400', 'en')).toBe('Four Hundred');
  });

  it('answers nothing when there is nothing to spell', () => {
    expect(amountInWords('', 'en')).toBe('');
    expect(amountInWords(null, 'en')).toBe('');
    expect(amountInWords(undefined, 'en')).toBe('');
    expect(amountInWords('nonsense', 'en')).toBe('');
  });

  it('reads the language the app stores it in', () => {
    expect(amountInWords(400, 'fa-AF')).toBe('چهارصد');
    expect(amountInWords(400, 'English')).toBe('Four Hundred');
    expect(amountInWords(400, 'ps-AF')).toBe('څلور سوه');
  });

  it('falls back to Dari, the app default, for an unknown language', () => {
    expect(amountInWords(400, 'zz')).toBe('چهارصد');
    expect(amountInWords(400)).toBe('چهارصد');
  });
});
