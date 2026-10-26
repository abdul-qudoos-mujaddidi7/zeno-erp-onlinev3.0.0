/*
 * Balances accumulate oldest-first, so a page that is handed the totals of
 * everything older than it (`opening`, in the same shape as the API's
 * `opening_balance`) can run its own rows forward without downloading the rest
 * of the ledger.
 */
export function withJournalRunningBalances(rows, opening = {}) {
  const runningById = new Map();
  const running = {};

  for (const [currency, totals] of Object.entries(opening || {})) {
    running[currency] = Number(
      typeof totals === 'number' ? totals : totals?.balance,
    ) || 0;
  }

  for (const journal of [...rows].reverse()) {
    const currency = journal.currency || 'DEFAULT';
    running[currency] =
      Number(running[currency] || 0) +
      Number(journal.credit || 0) -
      Number(journal.debit || 0);
    runningById.set(String(journal.id), { ...running });
  }

  return rows.map((journal) => {
    const balance = runningById.get(String(journal.id));

    if (!balance) {
      throw new Error(`Missing running balance for journal ${journal.id}`);
    }

    return { ...journal, running: balance };
  });
}

export function attachJournalRunningBalances(rows, balancedRows) {
  const runningById = new Map(
    balancedRows.map((journal) => [String(journal.id), journal.running]),
  );

  return rows.map((journal) => {
    const balance = runningById.get(String(journal.id));

    if (!balance) {
      throw new Error(`Missing running balance for journal ${journal.id}`);
    }

    return { ...journal, running: balance };
  });
}
