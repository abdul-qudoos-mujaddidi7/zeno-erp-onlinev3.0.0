import { describe, expect, it } from 'vitest';

import translations from '../i18n/translations.json';
import { amountInWords } from './amountInWords.js';
import { currencyLabels } from './currencyLabel.js';

/*
 * The currency word a bill prints inside the amount written out in words. What
 * a customer reads there is asserted against the real dictionary, so a receipt
 * can never print a bare code in a phrase that is otherwise all words.
 */

/* t() from i18n, without the component store it lives beside. */
function translatorFor(lang) {
  return (key) => {
    if (lang === 'ps') return translations.ps[key] || translations.fa[key] || key;

    return translations[lang][key] || translations.en[key] || key;
  };
}

describe('currencyLabels — English', () => {
  const t = translatorFor('en');

  it('spells the currency where the bill would otherwise print its code', () => {
    expect(currencyLabels('EUR', t).currency).toBe('Euro');
    expect(currencyLabels('USD', t).currency).toBe('US Dollar');
    expect(currencyLabels('AFN', t).currency).toBe('Afghani');
  });

  it('reads as a sentence under the figures row', () => {
    expect(amountInWords(100.5, 'en', currencyLabels('EUR', t))).toBe(
      'One Hundred Euro and Fifty Cents',
    );
    expect(amountInWords(400.5, 'en', currencyLabels('USD', t))).toBe(
      'Four Hundred US Dollar and Fifty Cents',
    );
  });

  it('lets a code the list does not know name itself', () => {
    expect(currencyLabels('XYZ', t).currency).toBe('XYZ');
    expect(amountInWords(1, 'en', currencyLabels('XYZ', t))).toBe('One XYZ');
  });
});

describe('currencyLabels — Dari and Pashto', () => {
  it('keeps the word the dictionary already has for the code', () => {
    expect(currencyLabels('EUR', translatorFor('fa')).currency).toBe('یورو');
    expect(currencyLabels('USD', translatorFor('fa')).currency).toBe('دالر');
    expect(currencyLabels('AFN', translatorFor('fa')).currency).toBe('افغانی');

    expect(amountInWords(400.5, 'fa', currencyLabels('EUR', translatorFor('fa')))).toBe(
      'چهارصد یورو و پنجاه پول',
    );
  });

  it('prefers the dictionary word for the code over the English name', () => {
    /* Pashto knows USD as ډالر, not as امریکایي ډالر the English name translates to. */
    expect(currencyLabels('USD', translatorFor('ps')).currency).toBe('ډالر');
    expect(currencyLabels('AFN', translatorFor('ps')).currency).toBe('افغانۍ');
    expect(amountInWords(400.5, 'ps', currencyLabels('USD', translatorFor('ps')))).toBe(
      'څلور سوه ډالر او پنځوس پیسی',
    );
  });
});

describe('currencyLabels — nothing to name', () => {
  const t = translatorFor('en');

  it('returns an empty label when there is no currency', () => {
    expect(currencyLabels('', t).currency).toBe('');
    expect(currencyLabels('   ', t).currency).toBe('');
    expect(currencyLabels(null, t).currency).toBe('');
    expect(currencyLabels(undefined, t).currency).toBe('');
  });

  it('returns an empty label without a translator', () => {
    expect(currencyLabels('EUR').currency).toBe('');
    expect(currencyLabels('EUR', null).currency).toBe('');
  });
});
