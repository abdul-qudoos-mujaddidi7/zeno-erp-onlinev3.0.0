import { describe, expect, it } from 'vitest';

import {
  fiscalYearStatus,
  isOpenFiscalYear,
  isWorkingFiscalYearRange,
  selectWorkingFiscalYear,
} from './fiscalYearSelection.js';

const FY_A = {
  id: 1,
  name: 'FY 2025-2026',
  start_date: '2025-12-31',
  end_date: '2026-12-30',
  fiscal_status: 'closed',
};

const FY_B = {
  id: 2,
  name: 'FY 2026-2027',
  start_date: '2026-12-31',
  end_date: '2027-12-30',
  fiscal_status: 'open',
};

const FY_OLD = {
  id: 3,
  name: 'FY 2024-2025',
  start_date: '2024-12-31',
  end_date: '2025-12-30',
  fiscal_status: 'open',
};

describe('isOpenFiscalYear', () => {
  it('accepts open and a missing status', () => {
    expect(isOpenFiscalYear(FY_B)).toBe(true);
    expect(isOpenFiscalYear({ fiscal_status: 'OPEN' })).toBe(true);
    expect(isOpenFiscalYear({})).toBe(true);
  });

  it('rejects closed and empty values', () => {
    expect(isOpenFiscalYear(FY_A)).toBe(false);
    expect(isOpenFiscalYear(null)).toBe(false);
    expect(isOpenFiscalYear(undefined)).toBe(false);
  });
});

describe('fiscalYearStatus', () => {
  it('normalizes casing and survives a missing year', () => {
    expect(fiscalYearStatus({ fiscal_status: ' Closed ' })).toBe('closed');
    expect(fiscalYearStatus(null)).toBe('open');
  });
});

describe('selectWorkingFiscalYear', () => {
  it('uses the year containing today while it is open', () => {
    const today = '2026-06-01';
    const covering = {
      id: 9,
      name: 'FY 2026',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      fiscal_status: 'open',
    };

    expect(
      selectWorkingFiscalYear({ covering, years: [covering], today }),
    ).toBe(covering);
  });

  it('falls forward to the successor year after an early close', () => {
    /*
     * Today sits inside a year that was closed early: the screens must NOT keep
     * scoping to it, so the year the close created (starting after today) wins.
     */
    const working = selectWorkingFiscalYear({
      covering: FY_A,
      years: [FY_A, FY_B],
      today: '2026-09-20',
    });

    expect(working).toBe(FY_B);
  });

  it('falls forward even when today is not inside any year', () => {
    const working = selectWorkingFiscalYear({
      covering: null,
      years: [FY_A, FY_B],
      today: '2026-09-20',
    });

    expect(working).toBe(FY_B);
  });

  it('falls back to the latest open year when no open year starts after today', () => {
    const working = selectWorkingFiscalYear({
      covering: null,
      years: [FY_OLD, FY_A],
      today: '2026-09-20',
    });

    expect(working).toBe(FY_OLD);
  });

  it('returns null when nothing is open, leaving screens unscoped', () => {
    expect(
      selectWorkingFiscalYear({ covering: FY_A, years: [FY_A], today: '2026-09-20' }),
    ).toBeNull();
    expect(selectWorkingFiscalYear({})).toBeNull();
  });

  it('never selects a soft-deleted year', () => {
    const deleted = { ...FY_B, status: 0 };

    expect(
      selectWorkingFiscalYear({
        covering: null,
        years: [deleted],
        today: '2026-09-20',
      }),
    ).toBeNull();

    /* a deleted year cannot win over a live one, even as the covering year */
    expect(
      selectWorkingFiscalYear({
        covering: deleted,
        years: [deleted, FY_OLD],
        today: '2026-09-20',
      }),
    ).toBe(FY_OLD);
  });

  it('prefers the earliest open year after today when several are open', () => {
    const FY_C = { ...FY_B, id: 4, start_date: '2027-12-31', end_date: '2028-12-30' };

    expect(
      selectWorkingFiscalYear({
        covering: FY_A,
        years: [FY_A, FY_C, FY_B],
        today: '2026-09-20',
      }),
    ).toBe(FY_B);
  });
});

describe('isWorkingFiscalYearRange', () => {
  it('matches only the exact fiscal-year range', () => {
    expect(
      isWorkingFiscalYearRange(FY_B, '2026-12-31', '2027-12-30'),
    ).toBe(true);
    expect(
      isWorkingFiscalYearRange(FY_B, '2026-01-01', '2027-12-30'),
    ).toBe(false);
    expect(isWorkingFiscalYearRange(null, '', '')).toBe(false);
  });
});
