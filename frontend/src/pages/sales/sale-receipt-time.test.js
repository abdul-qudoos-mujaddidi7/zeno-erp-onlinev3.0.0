/**
 * The time on the sale receipt's date line.
 *
 * Stored timestamps reach the browser as the database's wall clock with a Z
 * on the end (the connection tells the driver the column is UTC), so the time
 * must be read from the digits rather than through Date and a time zone: a
 * converted value would print an hour the shop never saw. The slip shows a
 * 12-hour clock with the day period of its own language.
 */
import { describe, expect, test } from 'vitest';
import { receiptTime, toPersianDigits } from './saleReceiptLayout.js';

const DAM = '2026-09-27T14:43:30.968Z';

describe('receiptTime', () => {
  test('reads the time out of a stored timestamp as it was written', () => {
    expect(receiptTime(DAM, 'en')).toBe('2:43 PM');
    expect(receiptTime('2026-09-27 14:43:30', 'en')).toBe('2:43 PM');
  });

  test('prints a 12-hour clock, never the stored 24-hour hour', () => {
    expect(receiptTime('2026-09-27T13:05:00.000Z', 'en')).toBe('1:05 PM');
    expect(receiptTime('2026-09-27T23:59:59.999Z', 'en')).toBe('11:59 PM');
    expect(receiptTime('2026-09-27T00:30:00.000Z', 'en')).toBe('12:30 AM');
    expect(receiptTime('2026-09-27T00:01:59.000Z', 'en')).toBe('12:01 AM');
  });

  test('noon and midnight land on 12, with the right half of the day', () => {
    expect(receiptTime('2026-09-27T12:00:00.000Z', 'en')).toBe('12:00 PM');
    expect(receiptTime('2026-09-27T11:59:00.000Z', 'en')).toBe('11:59 AM');
  });

  test('a date-only row has no time to print', () => {
    expect(receiptTime('2026-09-27T00:00:00.000Z', 'en')).toBe('');
    expect(receiptTime('2026-09-27 00:00:00', 'fa')).toBe('');
    // The sentinel is the stored hour and minute, so stray seconds on a
    // midnight stamp do not turn it into a printed 12:00 AM.
    expect(receiptTime('2026-09-27T00:00:59.000Z', 'en')).toBe('');
  });

  test('the Persian slip prints Persian numerals and its own day period', () => {
    expect(receiptTime(DAM, 'fa')).toBe('۲:۴۳ ب.ظ');
    expect(receiptTime('2026-09-27T09:05:00.000Z', 'fa')).toBe('۹:۰۵ ق.ظ');
    expect(receiptTime('2026-09-27T12:00:00.000Z', 'fa')).toBe('۱۲:۰۰ ب.ظ');
  });

  test('Pashto gets Pashto markers, and an unknown language falls back to fa', () => {
    expect(receiptTime(DAM, 'ps')).toBe('۲:۴۳ غ.و');
    expect(receiptTime('2026-09-27T09:05:00.000Z', 'ps')).toBe('۹:۰۵ غ.م');
    expect(receiptTime(DAM)).toBe(receiptTime(DAM, 'fa'));
  });

  test('an unreadable value prints nothing rather than a wrong time', () => {
    expect(receiptTime('', 'en')).toBe('');
    expect(receiptTime(null, 'en')).toBe('');
    expect(receiptTime(undefined, 'en')).toBe('');
    expect(receiptTime('not a timestamp', 'en')).toBe('');
    expect(receiptTime('2026-09-27T99:99:00.000Z', 'en')).toBe('');
  });
});

describe('toPersianDigits', () => {
  test('matches the numerals the Persian date beside it prints', () => {
    expect(toPersianDigits('14:43')).toBe('۱۴:۴۳');
    expect(toPersianDigits('09:05')).toBe('۰۹:۰۵');
  });

  test('leaves everything that is not a digit alone', () => {
    expect(toPersianDigits('')).toBe('');
    expect(toPersianDigits(null)).toBe('');
    expect(toPersianDigits(' – ')).toBe(' – ');
  });
});
