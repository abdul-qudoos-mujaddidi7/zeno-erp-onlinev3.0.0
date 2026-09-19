/*
 * accountingDate.test.js
 *
 * Step 3.6 tests. Pure functions and source scans — nothing here talks to the
 * backend or a database.
 *
 * They lock down the rule that a payment date is the BUSINESS accounting
 * calendar day rather than a UTC instant:
 *
 *   1. The helper never derives the day from toISOString(), so the first
 *      hours of a local day can no longer be filed as yesterday.
 *   2. Every payment-date producer in the app uses that helper.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  toAccountingDateString,
  todayAccountingDate,
  paymentDateForInput,
  isAccountingDateString,
  accountingDateOfStoredValue,
} from './accountingDate.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..');

function readSource(relativePath) {
  return readFileSync(join(srcRoot, relativePath), 'utf8');
}

/*
 * The exact instant that used to break: 02:00 on 1 Jan in the business
 * calendar is 21:30 on 31 Dec UTC. The UTC day is the previous day, and the
 * previous fiscal year.
 */
const NEW_YEAR_EARLY_MORNING = new Date('2027-01-01T02:00:00+04:30');

afterEach(() => {
  vi.useRealTimers();
});

/* ===================== the business calendar day ===================== */

describe('toAccountingDateString', () => {
  test('an early-morning instant keeps its own day, not the UTC day', () => {
    expect(NEW_YEAR_EARLY_MORNING.toISOString().slice(0, 10)).toBe('2026-12-31');

    expect(toAccountingDateString(NEW_YEAR_EARLY_MORNING)).toBe('2027-01-01');
  });

  test('the last instant of a day stays on that day', () => {
    expect(
      toAccountingDateString(new Date('2026-12-31T23:59:59+04:30')),
    ).toBe('2026-12-31');
  });

  test('the first instant of a day is that day', () => {
    expect(
      toAccountingDateString(new Date('2027-01-01T00:00:00+04:30')),
    ).toBe('2027-01-01');
  });

  test('a YYYY-MM-DD result is always a plain calendar day', () => {
    expect(toAccountingDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('an unusable value yields an empty string, never Invalid Date', () => {
    expect(toAccountingDateString('not a date')).toBe('');
  });

  test('a UTC midnight instant is read in the business calendar', () => {
    /* 2026-12-31T00:00:00Z is already 04:30 on 31 Dec locally */
    expect(toAccountingDateString(new Date('2026-12-31T00:00:00Z'))).toBe(
      '2026-12-31',
    );

    /* ...and 2026-12-31T21:30:00Z is already 1 Jan locally */
    expect(toAccountingDateString(new Date('2026-12-31T21:30:00Z'))).toBe(
      '2027-01-01',
    );
  });
});

/* ======================= the default payment date ==================== */

describe('todayAccountingDate', () => {
  test('at 02:00 local on 1 Jan the default is 1 Jan, not 31 Dec', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NEW_YEAR_EARLY_MORNING);

    expect(todayAccountingDate()).toBe('2027-01-01');
    expect(todayAccountingDate()).not.toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  test('at 23:00 local on 31 Dec the default is still 31 Dec', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:00:00+04:30'));

    expect(todayAccountingDate()).toBe('2026-12-31');
  });
});

describe('paymentDateForInput', () => {
  test('falls back to the business day when no date is chosen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NEW_YEAR_EARLY_MORNING);

    expect(paymentDateForInput('')).toBe('2027-01-01');
    expect(paymentDateForInput(null)).toBe('2027-01-01');
    expect(paymentDateForInput(undefined)).toBe('2027-01-01');
  });

  test('a chosen date is preserved exactly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NEW_YEAR_EARLY_MORNING);

    /* the user explicitly paid against the previous year */
    expect(paymentDateForInput('2026-12-31')).toBe('2026-12-31');
    expect(paymentDateForInput(' 2026-12-31 ')).toBe('2026-12-31');
  });

  test('an unparseable value falls back rather than sending nonsense', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NEW_YEAR_EARLY_MORNING);

    expect(paymentDateForInput('31/12/2026')).toBe('2027-01-01');
    expect(paymentDateForInput('rubbish')).toBe('2027-01-01');
  });

  test('a chosen date is never shifted by timezone conversion', () => {
    for (const day of ['2026-01-01', '2026-12-31', '2027-01-01']) {
      expect(paymentDateForInput(day)).toBe(day);
      expect(paymentDateForInput(day).slice(0, 10)).toBe(day);
    }
  });
});

describe('isAccountingDateString', () => {
  test('separates a calendar day from an instant', () => {
    expect(isAccountingDateString('2026-12-31')).toBe(true);
    expect(isAccountingDateString('2026-12-31T10:00:00.000Z')).toBe(false);
    expect(isAccountingDateString('')).toBe(false);
    expect(isAccountingDateString(null)).toBe(false);
  });
});

/* ============================== display ============================== */

describe('accountingDateOfStoredValue', () => {
  test('a stored calendar day displays as the same day', () => {
    expect(accountingDateOfStoredValue('2026-12-31')).toBe('2026-12-31');
  });

  test('a legacy UTC timestamp displays the day the backend stored', () => {
    /*
     * Rows written before this step hold the naive value the server wrote,
     * serialised with a Z suffix. Reading it back with the viewer's timezone
     * would move the day, so the leading date is used directly.
     */
    expect(
      accountingDateOfStoredValue('2026-09-09T06:57:20.000Z'),
    ).toBe('2026-09-09');
  });

  test('a missing date displays as empty instead of throwing', () => {
    expect(accountingDateOfStoredValue(null)).toBe('');
    expect(accountingDateOfStoredValue(undefined)).toBe('');
    expect(accountingDateOfStoredValue('')).toBe('');
  });
});

/* ==================== calendar.js keeps one rule ===================== */

describe('calendar.js', () => {
  test('getKabulDate delegates to the shared helper', () => {
    const source = readSource('calendar.js');

    expect(source).toMatch(/import\s*\{\s*toAccountingDateString\s*\}/);
    expect(source).toMatch(
      /export function getKabulDate\(value = new Date\(\)\) \{\s*return toAccountingDateString\(value\);/,
    );

    /*
     * The timezone-specific computation lives in exactly one file, so the
     * business day cannot drift between two implementations.
     */
    expect(source).not.toMatch(/Asia\/Kabul/);
  });
});

/* ================== every producer uses the helper =================== */

const PAYMENT_DATE_PRODUCERS = [
  'pages/sales/PaymentSection.svelte',
  'pages/purchases/PaymentSection.svelte',
  'pages/sales/SaleForm.svelte',
  'pages/purchases/PurchaseForm.svelte',
  'pages/POS.svelte',
  'pages/inventory_records/PaymentSection.svelte',
  'pages/inventory_records/InventoryRecordForm.svelte',
];

describe('payment-date producers', () => {
  test('no producer sends a UTC instant as payment_date', () => {
    for (const relativePath of PAYMENT_DATE_PRODUCERS) {
      expect(
        readSource(relativePath),
        `${relativePath} must not derive payment_date from toISOString()`,
      ).not.toMatch(/payment_date:\s*new Date\(\)/);
    }
  });

  test('every producer that sends payment_date uses the shared rule', () => {
    for (const relativePath of PAYMENT_DATE_PRODUCERS) {
      const source = readSource(relativePath);

      expect(
        source,
        `${relativePath} does not send payment_date at all`,
      ).toMatch(/payment_date:/);

      expect(
        source,
        `${relativePath} must route payment_date through the accounting-date helper`,
      ).toMatch(
        /payment_date:\s*(getKabulDate\(\)|todayAccountingDate\(\)|paymentDate \|\| todayAccountingDate\(\))/,
      );
    }
  });

  test('the sale and purchase payment sections let the user choose the day', () => {
    for (const relativePath of [
      'pages/sales/PaymentSection.svelte',
      'pages/purchases/PaymentSection.svelte',
    ]) {
      const source = readSource(relativePath);

      expect(source).toMatch(/let paymentDate = todayAccountingDate\(\)/);
      expect(source).toMatch(/AppDatePicker/);
      expect(source).toMatch(
        /paymentDate = event\.detail|paymentDate = todayAccountingDate\(\)/,
      );
    }
  });

  test('no producer displays a payment date through toISOString()', () => {
    for (const relativePath of PAYMENT_DATE_PRODUCERS) {
      expect(
        readSource(relativePath),
        `${relativePath} must not shift the displayed day`,
      ).not.toMatch(/payment_date\.slice\(/);
    }
  });
});
