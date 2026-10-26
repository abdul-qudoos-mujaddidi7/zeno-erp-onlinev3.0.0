import { describe, expect, it } from 'vitest';
import {
  attachJournalRunningBalances,
  withJournalRunningBalances,
} from './journalRunningBalance.js';

describe('journal report running balances', () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({
    id: 125 - index,
    currency: index % 2 ? 'AFN' : 'USD',
    debit: index % 3 === 0 ? 2 : 0,
    credit: index % 3 === 1 ? 5 : 0,
  }));

  it('keeps each row balance stable when page sizes change', () => {
    const allBalancedRows = withJournalRunningBalances(rows);

    for (const pageSize of [15, 25, 100]) {
      const displayed = [];
      for (let offset = 0; offset < rows.length; offset += pageSize) {
        displayed.push(
          ...attachJournalRunningBalances(
            rows.slice(offset, offset + pageSize),
            allBalancedRows,
          ),
        );
      }

      expect(displayed).toEqual(allBalancedRows);
    }

    expect(allBalancedRows[0].running).toEqual({ USD: 63, AFN: 63 });
  });

  it('rejects a page row missing from the complete balance set', () => {
    expect(() =>
      attachJournalRunningBalances([{ id: 999 }], withJournalRunningBalances(rows)),
    ).toThrow('Missing running balance for journal 999');
  });
});
