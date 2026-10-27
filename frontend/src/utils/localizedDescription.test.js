import { describe, expect, it, vi } from 'vitest';

import { localizeDescription } from './localizedDescription.js';

/*
 * Journal descriptions are free text written once by the backend, so they are
 * shown in English and translated at render time by matching the known
 * wordings. These tests pin the visitor benefit wording and guard the
 * patterns that were already handled.
 */

const identity = (value) => value;

describe('localizeDescription – visitor benefit', () => {
  const source = 'Visitor benefit for Invoice #INV-9';

  it('translates the visitor benefit description into Persian', () => {
    expect(localizeDescription(source, 'fa', identity)).toBe('مفاد ویزیتور برای بل شماره INV-9');
  });

  it('translates the visitor benefit description into Pashto', () => {
    expect(localizeDescription(source, 'ps', identity)).toBe('د ویزیتور ګټه د بل #INV-9 لپاره');
  });

  it('keeps the number untouched', () => {
    expect(localizeDescription('Visitor benefit for Invoice #INV-1', 'fa', identity)).toContain('INV-1');
    expect(localizeDescription('Visitor benefit for Invoice #INV-1', 'ps', identity)).toContain('INV-1');
  });

  it('leaves English rows as they are stored', () => {
    expect(localizeDescription(source, 'en', identity)).toBe(source);
    expect(localizeDescription(source, undefined, identity)).toBe(source);
  });

  it('still works when the sale carried no invoice number', () => {
    expect(localizeDescription('Visitor benefit for Invoice #', 'fa', identity)).toBe('مفاد ویزیتور برای فروش');
    expect(localizeDescription('Visitor benefit for Invoice #', 'ps', identity)).toBe('د ویزیتور ګټه د پلور لپاره');
  });

  it('ignores surrounding whitespace', () => {
    expect(localizeDescription('  Visitor benefit for Invoice #INV-9  ', 'fa', identity)).toBe(
      'مفاد ویزیتور برای بل شماره INV-9',
    );
  });

  it('does not touch a hand-written sale description', () => {
    expect(localizeDescription('Sold 3 bags of rice to Ahmad', 'fa', identity)).toBe('Sold 3 bags of rice to Ahmad');
  });

  it('does not translate the words inside a longer sentence', () => {
    expect(localizeDescription('Reversal of Visitor benefit for Invoice #INV-9', 'fa', identity)).toBe(
      'Reversal of Visitor benefit for Invoice #INV-9',
    );
  });
});

describe('localizeDescription – existing behaviour', () => {
  it('prefers a dictionary hit for the whole description', () => {
    const translate = vi.fn((value) => (value === 'Opening balance' ? 'بیلانس اولیه' : value));
    expect(localizeDescription('Opening balance', 'fa', translate)).toBe('بیلانس اولیه');
  });

  it('translates a payment-via-journal description', () => {
    expect(localizeDescription('Payment via journal:J-12 for Sale #INV-4', 'fa', identity)).toContain('پرداخت فروش');
  });

  it('translates a created sale journal description', () => {
    expect(localizeDescription('Created sale journal for sale #INV-7', 'ps', identity)).toBe(
      'د پلور ورځپاڼې سند #INV-7 جوړ شو.',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(localizeDescription('', 'fa', identity)).toBe('');
    expect(localizeDescription(null, 'fa', identity)).toBe('');
  });
});

describe('localizeDescription – repeated payment summary', () => {
  /*
   * A payment saved without a note stores "<summary> | <note label>: <summary>"
   * once the summary has been read back as the note. The voucher dialog must
   * print it once, a real note stays untouched.
   */
  const summary = 'مجموع فروش: 8,160 افغانی | پرداخت: 8,160 افغانی';

  it('drops a note that only repeats the generated summary', () => {
    expect(localizeDescription(`${summary} | توضیحات: ${summary}`, 'fa', identity)).toBe(summary);
  });

  it('unwinds a summary nested more than once', () => {
    expect(
      localizeDescription(`${summary} | توضیحات: ${summary} | توضیحات: ${summary}`, 'fa', identity),
    ).toBe(summary);
  });

  it('keeps a real note', () => {
    const withNote = `${summary} | توضیحات: مشتری بعداً می‌پردازد`;
    expect(localizeDescription(withNote, 'fa', identity)).toBe(withNote);
  });

  it('leaves ordinary journal descriptions alone', () => {
    expect(localizeDescription('Manual journal entry', 'en', identity)).toBe(
      'Manual journal entry',
    );
  });
});
