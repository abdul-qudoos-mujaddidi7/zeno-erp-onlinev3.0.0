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

  it('matches the full run when a page is seeded with its opening balance', () => {
    const allBalancedRows = withJournalRunningBalances(rows);

    for (const [offset, size] of [[0, 15], [45, 15], [110, 15]]) {
      const page = rows.slice(offset, offset + size);

      /*
       * What the API returns: per-currency totals of everything older than the
       * page, i.e. the rows that follow it in this newest-first list.
       */
      const opening = {};

      for (const row of rows.slice(offset + size)) {
        const balance = (opening[row.currency]?.balance || 0) + row.credit - row.debit;
        opening[row.currency] = { balance };
      }

      expect(withJournalRunningBalances(page, opening)).toEqual(
        allBalancedRows.slice(offset, offset + size),
      );
    }
  });
});
