import { describe, expect, it } from 'vitest';

import { toDateOnly, toOpeningBalanceRows } from './openingBalanceRows.js';

const FY_2026 = {
  id: 11,
  local_id: 11,
  name: 'FY 2025-2026',
  start_date: '2025-12-31',
  end_date: '2026-12-30',
  fiscal_status: 'closed',
  status: 1,
};

const FY_2027 = {
  id: 22,
  local_id: 22,
  name: 'FY 2026-2027',
  start_date: '2026-12-31',
  end_date: '2027-12-30',
  fiscal_status: 'open',
  status: 1,
};

/* What the close of FY 2026 carried into FY 2027 (see the Step 5 report). */
const CASH_AFN = {
  account_id: 1,
  account_code: 'TREASURY',
  account_name: 'Treasure',
  currency: 'AFN',
  opening_balance: -5800,
  balance_side: 'debit',
  source_fiscal_year_name: 'FY 2025-2026',
};

const CASH_USD = {
  account_id: 1,
  account_code: 'TREASURY',
  account_name: 'Treasure',
  currency: 'USD',
  opening_balance: 7000,
  balance_side: 'credit',
  source_fiscal_year_name: 'FY 2025-2026',
};

const CUSTOMER_AFN = {
  account_id: 4,
  account_code: 'A-4',
  account_name: 'Ahmad',
  currency: 'AFN',
  opening_balance: 3000,
  balance_side: 'credit',
};

const ZERO_BALANCE = {
  account_id: 9,
  account_name: 'Empty',
  currency: 'AFN',
  opening_balance: 0,
};

describe('toDateOnly', () => {
  it('keeps a plain calendar day unchanged', () => {
    expect(toDateOnly('2026-12-31')).toBe('2026-12-31');
  });

  it('truncates an ISO timestamp without shifting the day', () => {
    expect(toDateOnly('2025-12-31T00:00:00.000Z')).toBe('2025-12-31');
  });

  it('formats a Date by its LOCAL components', () => {
    expect(toDateOnly(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('returns an empty string for nothing', () => {
    expect(toDateOnly(null)).toBe('');
    expect(toDateOnly(undefined)).toBe('');
  });
});

describe('toOpeningBalanceRows', () => {
  it('creates one read-only row per account and currency', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CASH_USD, CUSTOMER_AFN],
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.currency)).toEqual(['AFN', 'USD', 'AFN']);

    for (const row of rows) {
      expect(row.is_opening_balance).toBe(true);
      expect(row.read_only).toBe(true);
      expect(row.reference_type).toBe('fiscal_year_open');
      expect(row.reference_id).toBe(FY_2027.id);
      expect(row.fiscal_year_id).toBe(FY_2027.id);
      expect(row.date).toBe('2026-12-31');
      expect(row.second_entry_account).toBeNull();
      expect(row.description).toContain('FY 2026-2027');
    }
  });

  it('takes the side from the statement convention (credit - debit)', () => {
    const [cashAfn, cashUsd] = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CASH_USD],
    });

    /* -5,800 is a DEBIT side balance: cash on hand. */
    expect(cashAfn.debit).toBe(5800);
    expect(cashAfn.credit).toBe(0);
    expect(cashAfn.running).toEqual({ AFN: -5800 });

    /* 7,000 is a CREDIT side balance. */
    expect(cashUsd.credit).toBe(7000);
    expect(cashUsd.debit).toBe(0);
  });

  it('keeps currencies apart', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CASH_USD],
    });

    expect(rows[0].balance).toBe(-5800);
    expect(rows[1].balance).toBe(7000);
  });

  it('writes no row for a zero opening balance', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [ZERO_BALANCE, CUSTOMER_AFN],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].account_name).toBe('Ahmad');
  });

  it('gives every row a stable, unique id', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CASH_USD, CUSTOMER_AFN],
    });

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('names the account it belongs to so a screen can render it', () => {
    const [row] = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CUSTOMER_AFN],
    });

    expect(row.account_id).toBe(4);
    expect(row.account_name).toBe('Ahmad');
    expect(row.first_entry_account).toBe(4);
  });

  it('returns nothing without a fiscal year', () => {
    expect(toOpeningBalanceRows({ rows: [CASH_AFN] })).toEqual([]);
  });

  it('gives the viewed account a ZERO row when the year was carried forward', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CUSTOMER_AFN],
      ensureAccount: { id: 7, name: 'Salaries', currency: 'AFN' },
    });

    const zero = rows.find((row) => row.account_id === 7);

    expect(zero).toBeTruthy();
    expect(zero.balance).toBe(0);
    expect(zero.debit).toBe(0);
    expect(zero.credit).toBe(0);
    expect(zero.account_name).toBe('Salaries');
    expect(zero.currency).toBe('AFN');
    expect(zero.is_opening_balance).toBe(true);
  });

  it('does not duplicate an account that already has an opening balance', () => {
    const rows = toOpeningBalanceRows({
      fiscalYear: FY_2027,
      rows: [CASH_AFN, CASH_USD],
      ensureAccount: { id: 1, name: 'Treasure', currency: 'AFN' },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.account_id === 1)).toBe(true);
  });

  it('writes no zero row when the year was never carried into', () => {
    expect(
      toOpeningBalanceRows({
        fiscalYear: FY_2027,
        rows: [],
        ensureAccount: { id: 7, name: 'Salaries', currency: 'AFN' },
      }),
    ).toEqual([]);
  });
});
