import { describe, expect, it } from 'vitest';
import { accountRunningBalance } from './accountRunningBalance.js';

describe('account report running balances', () => {
  // Descending ledger with mixed currencies and debit/credit movements.
  const newer = { AFN: 0, USD: 0 };
  const closing = { AFN: 18000, USD: -700 };
  const rows = Array.from({ length: 137 }, (_, index) => {
    const currency = index % 3 ? 'AFN' : 'USD';
    const movement = index % 2 ? -25 : 40;
    const row = { id: 137 - index, currency, newer_movements: { ...newer } };
    newer[currency] += movement;
    return row;
  });

  it('keeps every transaction balance identical through all pages and size changes', () => {
    const expected = rows.map((row) => accountRunningBalance(row, closing));
    for (const size of [15, 25, 50, 100, 15]) {
      const displayed = [];
      for (let offset = 0; offset < rows.length; offset += size) {
        displayed.push(...rows.slice(offset, offset + size)
          .map((row) => accountRunningBalance(row, closing)));
      }
      expect(displayed).toEqual(expected);
    }
    expect(expected[0]).toEqual({ AFN: 18000, USD: -700 });
    expect(expected[3].USD).toBe(-740);
    expect(expected[15].USD).toBe(-770);
  });

  it('preserves the ledger balance when search hides intervening transactions', () => {
    const filtered = [rows[3], rows[60], rows[130]];
    expect(filtered.map((row) => accountRunningBalance(row, closing)))
      .toEqual(filtered.map((row) => ({
        AFN: closing.AFN - row.newer_movements.AFN,
        USD: closing.USD - row.newer_movements.USD,
      })));
    expect(accountRunningBalance(rows[3], closing).USD).toBe(-740);
  });

  it('uses the scoped closing balance, including the fiscal-year opening', () => {
    expect(accountRunningBalance({ currency: 'AFN', newer_movements: { AFN: 300 } }, { AFN: 1200 }))
      .toEqual({ AFN: 900 });
    expect(accountRunningBalance({ newer_movements: { AFN: '30' } }, { AFN: '120' }, 'AFN'))
      .toEqual({ AFN: 90 });
  });

  it('carries $700 remaining into later AFN rows after a $700 deduction from $1400', () => {
    const closing = { USD: 700, AFN: 233500 };
    const dollarOpening = { currency: 'USD', newer_movements: { USD: -700, AFN: 233500 } };
    const dollarDeduction = { currency: 'USD', newer_movements: { AFN: 233500 } };
    const afnDebit = { currency: 'AFN', newer_movements: { AFN: 237000 } };
    const afnCredit = { currency: 'AFN', newer_movements: {} };
    expect(accountRunningBalance(dollarOpening, closing).USD).toBe(1400);
    expect(accountRunningBalance(dollarDeduction, closing).USD).toBe(700);
    expect(accountRunningBalance(afnDebit, closing)).toEqual({ USD: 700, AFN: -3500 });
    expect(accountRunningBalance(afnCredit, closing)).toEqual({ USD: 700, AFN: 233500 });
  });

  it('preserves the ledger sign for a debit balance', () => {
    const closing = { USD: -700, AFN: 94989 };
    expect(accountRunningBalance({ currency: 'USD', newer_movements: { USD: 700 } }, closing).USD)
      .toBe(-1400);
    expect(accountRunningBalance({ currency: 'AFN', newer_movements: {} }, closing).USD)
      .toBe(-700);
  });
});
