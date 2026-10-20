/**
 * The time on the sale receipt's date line.
 *
 * The stored value is a UTC instant: `created_at` comes from `NOW()` on the
 * database host, and on the online deployment that host runs in UTC, so the
 * API hands the browser '2026-10-20T06:16:35.918Z' for a bill written at
 * 10:46 in Kabul. The slip prints the SHOP's clock, so the instant is read
 * through the business time zone (Asia/Kabul, UTC+04:30) instead of being
 * printed digit for digit — that shortcut is what made a 10 am bill read as
 * 6:16 ق.ظ. The clock is 12-hour, with the day period of the slip's language.
 */
import { describe, expect, test } from 'vitest';
import { receiptTime, toPersianDigits } from './saleReceiptLayout.js';

/* 14:43 UTC is 19:13 in Kabul — the +04:30 shift the receipt must apply. */
const DAM = '2026-09-27T14:43:30.968Z';

describe('receiptTime', () => {
  test('prints the shop clock, not the database clock', () => {
    expect(receiptTime(DAM, 'en')).toBe('7:13 PM');
    expect(receiptTime('2026-09-27 14:43:30', 'en')).toBe('7:13 PM');
  });

  test('a bill written at 10:46 in Kabul prints 10:46, not 06:16', () => {
    /* INV-46 on the online deployment, created 2026-10-20 10:46 Kabul. */
    expect(receiptTime('2026-10-20T06:16:35.918Z', 'fa')).toBe('۱۰:۴۶ ق.ظ');
    expect(receiptTime('2026-10-20T06:16:35.918Z', 'en')).toBe('10:46 AM');
  });

  test('the +04:30 shift crosses midnight and noon correctly', () => {
    /* 20:00 UTC is 00:30 the next day in Kabul: 12:30 AM. */
    expect(receiptTime('2026-09-27T20:00:00.000Z', 'en')).toBe('12:30 AM');
    /* 07:30 UTC is 12:00 in Kabul: noon, not 7:30. */
    expect(receiptTime('2026-09-27T07:30:00.000Z', 'en')).toBe('12:00 PM');
    /* 17:30 UTC is 22:00 in Kabul. */
    expect(receiptTime('2026-09-27T17:30:00.000Z', 'en')).toBe('10:00 PM');
  });

  test('prints a 12-hour clock, never the stored 24-hour hour', () => {
    expect(receiptTime('2026-09-27T13:05:00.000Z', 'en')).toBe('5:35 PM');
    expect(receiptTime('2026-09-27T19:00:00.000Z', 'en')).toBe('11:30 PM');
  });

  test('a date-only row has no time to print', () => {
    expect(receiptTime('2026-09-27T00:00:00.000Z', 'en')).toBe('');
    expect(receiptTime('2026-09-27 00:00:00', 'fa')).toBe('');
    // The sentinel is the stored hour and minute, so stray seconds on a
    // midnight stamp do not turn it into a printed 04:30 AM.
    expect(receiptTime('2026-09-27T00:00:59.000Z', 'en')).toBe('');
  });

  test('the Persian slip prints Persian numerals and its own day period', () => {
    expect(receiptTime(DAM, 'fa')).toBe('۷:۱۳ ب.ظ');
    expect(receiptTime('2026-09-27T09:05:00.000Z', 'fa')).toBe('۱:۳۵ ب.ظ');
    expect(receiptTime('2026-09-27T12:00:00.000Z', 'fa')).toBe('۴:۳۰ ب.ظ');
  });

  test('Pashto gets its own numerals and markers, and an unknown language falls back to fa', () => {
    expect(receiptTime(DAM, 'ps')).toBe('۷:۱۳ غ.و');
    expect(receiptTime('2026-09-27T02:05:00.000Z', 'ps')).toBe('۶:۳۵ غ.م');
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
