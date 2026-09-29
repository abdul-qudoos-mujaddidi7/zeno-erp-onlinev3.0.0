/*
 * How a bill names its own currency.
 *
 * The currency column holds a code ('AFN'), while the bill prints the word the
 * operator reads — 'افغانی' in Dari, 'افغانۍ' in Pashto — and the amount written
 * out in words prints that same word inside the phrase rather than beside it.
 * Resolving the label in one place keeps the two rows in step.
 *
 * The translator is passed in (t from i18n) instead of being imported, so this
 * stays a pure function and the words a printer receives can be asserted in a
 * unit test.
 *
 * Dari and Pashto already name a currency in their own script — t('EUR') is
 * یورو — and that word is used exactly as it stands. English keeps the code on
 * the figures row ('100.50 EUR'), because a code is what a customer expects to
 * read there; a phrase spelled entirely in words ("One Hundred EUR and Fifty
 * Cents") is the one place a bare code reads wrong, so the currency is named
 * there instead: 'Euro', 'US Dollar', 'Afghani'. The names are looked up
 * through the same translator, so a language that later gains a word of its own
 * for one of them takes precedence.
 *
 * A code no list here knows still names itself, exactly as the figures row
 * prints it, so the words can never name a currency the bill is not in.
 *
 * Only the currency is named here. The hundredth of an amount is a property of
 * the language the bill is printed in and not of the currency, so that word
 * lives in amountInWords.js (SUBUNIT) and every currency shares it.
 */

/* The word each shipped currency goes by, for a language that has no word. */
const CURRENCY_NAME = {
  AFN: 'Afghani',
  EUR: 'Euro',
  USD: 'US Dollar',
  PKR: 'Pakistani Rupee',
  IRR: 'Iranian Rial',
};

export function currencyLabels(code, translate) {
  if (typeof translate !== 'function' || typeof code !== 'string' || !code.trim()) {
    return { currency: '' };
  }

  const key = code.trim();
  const word = translate(key);

  /* The dictionary named this code (افغانی, یورو, ډالر): the bill prints that. */
  if (typeof word === 'string' && word.trim() && word.trim() !== key) {
    return { currency: word.trim() };
  }

  /* No word for it in this language: spell the currency rather than its code. */
  const name = CURRENCY_NAME[key];
  const spelled = name ? translate(name) : '';

  return {
    currency: (typeof spelled === 'string' && spelled.trim() ? spelled : word || key).trim(),
  };
}

export default currencyLabels;
